# Backend Authentication Design

## Overview

This document describes the backend changes required to add OAuth 2.0 authentication (Google provider) to the Task Tracker API. The system uses JWT access/refresh tokens for session management and a FastAPI dependency for route protection.

### Current State

- **Framework**: FastAPI 0.109.0 with SQLAlchemy 2.0.25 on SQLite
- **Auth**: None — all endpoints are publicly accessible
- **CORS**: Wide open (`allow_origins=["*"]`)
- **Data model**: `Task` with no user ownership

### Target State

- Google OAuth 2.0 login flow
- JWT-based sessions (short-lived access token + long-lived refresh token)
- All task endpoints scoped to the authenticated user
- CORS locked down to the frontend origin

---

## 1. New Dependencies

Add to `backend/requirements.txt`:

```
python-jose[cryptography]==3.3.0
httpx==0.27.0
```

| Package | Purpose |
|---------|---------|
| `python-jose[cryptography]` | JWT creation, signing, and verification (HS256) |
| `httpx` | Async HTTP client for calling Google's token and userinfo endpoints during the OAuth callback |

---

## 2. Data Model Changes

### 2.1 New `User` Model

File: `backend/app/models.py`

```python
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    picture = Column(String(500), nullable=True)
    provider = Column(String(50), nullable=False, default="google")
    provider_id = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    tasks = relationship("Task", back_populates="owner")
```

**Field notes:**
- `email` is unique and indexed — used as the primary lookup key for returning customers.
- `provider` / `provider_id` allow supporting multiple OAuth providers in the future (e.g. GitHub) without schema changes.
- `picture` stores the Google profile avatar URL for display in the frontend header.

### 2.2 Modify `Task` Model

Add a foreign key to associate tasks with their owner:

```python
class Task(Base):
    __tablename__ = "tasks"

    # ... existing columns unchanged ...

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    owner = relationship("User", back_populates="tasks")
```

This means every task query will be filtered by `Task.user_id == current_user.id`.

### 2.3 Migration Strategy

Since the app uses SQLite and `Base.metadata.create_all()` in `main.py`, the simplest approach for this stage is:

1. Drop and recreate the database (acceptable since this is pre-production).
2. Update `seed.py` to create a test user and associate seeded tasks with it.

For production, use Alembic migrations:

```bash
pip install alembic
alembic init migrations
alembic revision --autogenerate -m "add user model and task.user_id"
alembic upgrade head
```

---

## 3. Auth Module Structure

Create a new `backend/app/auth/` package:

```
backend/app/auth/
├── __init__.py
├── config.py         # OAuth + JWT configuration
├── jwt.py            # Token creation and verification
├── dependencies.py   # FastAPI dependency for route protection
├── schemas.py        # Pydantic request/response models
└── routes.py         # Auth endpoints
```

### 3.1 Configuration (`config.py`)

Loads settings from environment variables with local defaults:

```python
import os

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://localhost:8000/api/auth/google/callback",
)

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 30

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
```

**Environment variables required in production:**
- `GOOGLE_CLIENT_ID` — from Google Cloud Console
- `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `JWT_SECRET` — a strong random string (e.g. `openssl rand -hex 32`)
- `FRONTEND_URL` — the deployed frontend origin

### 3.2 JWT Utilities (`jwt.py`)

Handles token lifecycle with type-safety (access vs refresh tokens are not interchangeable):

```python
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from .config import (
    JWT_SECRET, JWT_ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS,
)


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user_id), "exp": expire, "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "exp": expire, "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> int | None:
    """Decode and validate a JWT. Returns the user ID or None if invalid."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != expected_type:
            return None
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None
```

**Design decisions:**
- The `type` claim prevents an access token from being used as a refresh token and vice versa.
- `decode_token` returns `None` on any failure (expired, tampered, wrong type) rather than raising — the caller decides the HTTP response.
- Access tokens are short-lived (30 min) to limit damage from theft; refresh tokens are long-lived (30 days) for seamless returning-customer experience.

### 3.3 Auth Dependency (`dependencies.py`)

This is the **middleware equivalent** in FastAPI — a dependency that runs before any protected endpoint:

```python
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from .jwt import decode_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = auth_header.split(" ", 1)[1]
    user_id = decode_token(token, expected_type="access")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")

    return user
```

**Usage in endpoints** — add `current_user: User = Depends(get_current_user)`:

```python
@app.get("/api/tasks", response_model=TaskListResponse)
def list_tasks(
    ...,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Task).filter(Task.user_id == current_user.id)
    # ... rest unchanged ...
```

### 3.4 Pydantic Schemas (`schemas.py`)

```python
from pydantic import BaseModel
from typing import Optional


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    picture: Optional[str] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str
```

---

## 4. API Endpoints

### 4.1 Auth Routes (`routes.py`)

All auth endpoints are grouped under an `APIRouter` with prefix `/api/auth`.

#### `GET /api/auth/google/login`

Generates the Google OAuth authorization URL and returns it to the frontend.

```python
@router.get("/google/login")
def google_login():
    state = secrets.token_urlsafe(32)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": state,
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return {"auth_url": url, "state": state}
```

**Flow**: Frontend calls this → receives URL → redirects the browser to Google.

#### `GET /api/auth/google/callback?code=...&state=...`

Google redirects here after user consent. This endpoint:

1. Exchanges the authorization `code` for Google tokens
2. Fetches user profile from Google
3. Creates or updates the user in the database (upsert by email)
4. Generates JWT access + refresh tokens
5. Sets the refresh token as an httpOnly cookie
6. Redirects to the frontend with the access token as a query parameter

```python
@router.get("/google/callback")
async def google_callback(code: str, state: str, db: Session = Depends(get_db)):
    async with httpx.AsyncClient() as client:
        # Step 1: Exchange code for Google tokens
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(400, "Failed to exchange authorization code")
        tokens = token_resp.json()

        # Step 2: Fetch user profile
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(400, "Failed to fetch user info")
        google_user = userinfo_resp.json()

    # Step 3: Upsert user
    user = db.query(User).filter(User.email == google_user["email"]).first()
    if user:
        user.last_login = datetime.now(timezone.utc)
        user.name = google_user.get("name", user.name)
        user.picture = google_user.get("picture", user.picture)
    else:
        user = User(
            email=google_user["email"],
            name=google_user.get("name", ""),
            picture=google_user.get("picture"),
            provider="google",
            provider_id=google_user["id"],
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    # Step 4: Generate our tokens
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    # Step 5 & 6: Cookie + redirect
    response = Response(status_code=307)
    response.headers["Location"] = (
        f"{FRONTEND_URL}/auth/callback?access_token={access_token}"
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=False,       # Set True in production (requires HTTPS)
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/api/auth",   # Cookie only sent to auth endpoints
    )
    return response
```

#### `POST /api/auth/refresh`

Silent token refresh for returning customers. The refresh token arrives automatically via the httpOnly cookie.

```python
@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")

    user_id = decode_token(token, expected_type="refresh")
    if user_id is None:
        raise HTTPException(401, "Invalid or expired refresh token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(401, "User not found")

    return TokenResponse(access_token=create_access_token(user.id))
```

#### `POST /api/auth/logout`

Clears the refresh token cookie.

```python
@router.post("/logout", response_model=MessageResponse)
def logout(response: Response):
    response.delete_cookie("refresh_token", path="/api/auth")
    return MessageResponse(message="Logged out")
```

#### `GET /api/auth/me`

Returns the authenticated user's profile. Protected by `get_current_user`.

```python
@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
```

### 4.2 Modifications to Existing Task Endpoints

Every task endpoint receives two changes:

1. **Add auth dependency**: `current_user: User = Depends(get_current_user)`
2. **Scope queries to user**: Filter by `Task.user_id == current_user.id`

Example — `create_task`:

```python
# Before
@app.post("/api/tasks", response_model=TaskResponse, status_code=201)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    db_task = Task(
        title=task.title,
        description=task.description,
        priority=task.priority,
        status="pending",
        created_at=datetime.now(timezone.utc),
    )

# After
@app.post("/api/tasks", response_model=TaskResponse, status_code=201)
def create_task(
    task: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db_task = Task(
        title=task.title,
        description=task.description,
        priority=task.priority,
        status="pending",
        created_at=datetime.now(timezone.utc),
        user_id=current_user.id,              # <-- ownership
    )
```

Example — `get_task` (prevents user A from reading user B's task):

```python
@app.get("/api/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == current_user.id,       # <-- scoped
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
```

The same pattern applies to `list_tasks`, `get_task_stats`, `update_task`, and `delete_task`.

---

## 5. Returning Customer Flow

### 5.1 How It Works

When a user who previously logged in opens the app:

1. The browser still has the `refresh_token` httpOnly cookie (valid for 30 days).
2. The frontend calls `POST /api/auth/refresh` — the cookie is sent automatically.
3. The backend validates the refresh token, confirms the user still exists, and returns a new access token.
4. The frontend stores the access token in memory and calls `GET /api/auth/me` to fetch the user profile.
5. The app renders normally — the user never sees a login screen.

### 5.2 Token Refresh During Active Session

When an access token expires mid-session (after 30 minutes):

1. An API call returns `401 Unauthorized`.
2. The frontend interceptor catches the 401, calls `POST /api/auth/refresh`.
3. If refresh succeeds, the original request is retried with the new access token.
4. If refresh fails (token expired or revoked), the user is redirected to the login page.

### 5.3 Sequence Diagram

```
Browser                    Frontend                  Backend
  |                          |                         |
  |-- page loads ---------->|                         |
  |                          | no access_token in memory
  |                          |-- POST /auth/refresh -->|
  |                          |   (httpOnly cookie      |
  |                          |    sent automatically)  |
  |                          |                         | decode refresh token
  |                          |                         | verify user exists
  |                          |                         | create new access token
  |                          |<-- { access_token } ----|
  |                          |                         |
  |                          | store token in memory   |
  |                          |-- GET /auth/me -------->|
  |                          |<-- { user profile } ----|
  |                          |                         |
  |<-- render app -----------|                         |
```

---

## 6. CORS Changes

Update the CORS middleware to lock down origins:

```python
# Before
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# After
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],       # e.g. "http://localhost:5173"
    allow_credentials=True,             # required for cookies
    allow_methods=["*"],
    allow_headers=["*"],
)
```

`allow_credentials=True` is required for the browser to send the httpOnly cookie on cross-origin requests.

---

## 7. Registration in `main.py`

Include the auth router alongside existing routes:

```python
from .auth.routes import router as auth_router

app.include_router(auth_router)
```

---

## 8. Docker / Environment Changes

Add to `docker-compose.yml` under the backend service:

```yaml
backend:
  environment:
    - GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
    - GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
    - GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
    - JWT_SECRET=${JWT_SECRET}
    - FRONTEND_URL=http://localhost:5173
```

Create a `.env.example` file:

```
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
JWT_SECRET=generate-with-openssl-rand-hex-32
```

---

## 9. Security Considerations

| Concern | Mitigation |
|---------|------------|
| XSS stealing tokens | Access token stored in memory only (not localStorage); refresh token is httpOnly |
| CSRF on refresh endpoint | `SameSite=Lax` cookie + POST method (browsers don't send Lax cookies on cross-site POST) |
| Token type confusion | JWT `type` claim distinguishes access from refresh; `decode_token` validates it |
| User enumeration | OAuth callback doesn't reveal whether a user was created or found |
| Token theft | Access tokens expire in 30 minutes, limiting the window of exploitation |
| Stale user data | `get_current_user` verifies the user still exists in the DB on every request |

---

## 10. Future Enhancements

- **Multiple OAuth providers**: The `provider` + `provider_id` columns on `User` already support this. Add GitHub by creating `routes_github.py` with the same pattern but different endpoints.
- **Token blacklisting**: For immediate logout across all devices, maintain a Redis-backed set of revoked refresh token JTIs.
- **Role-based access**: Add a `role` column to `User` (e.g. `admin`, `member`) and a second dependency `require_role("admin")`.
- **Rate limiting**: Apply rate limits to `/api/auth/refresh` and `/api/auth/google/login` to prevent abuse.
