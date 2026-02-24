# Authentication Design (Backend)

## Scope

This document defines the backend architecture for adding authentication to `scenario-1` (FastAPI + SQLAlchemy + SQLite), including OAuth-based login, returning-customer session handling, middleware/dependency strategy, and a phased implementation plan with examples.

## Current Backend State

- All task APIs are currently public and anonymous.
- The only persisted domain model is `Task`.
- No user identity, session, token, or authorization checks exist.
- CORS is permissive (`allow_origins=["*"]`) and will need tightening for credentialed auth.

## Goals

- Support OAuth login (Google/GitHub/Auth0-style provider abstraction).
- Persist local users even if identity is external.
- Keep returning users logged in with secure HTTP-only session cookies.
- Protect all task APIs and scope data by authenticated user.
- Keep implementation simple enough for current app size while allowing future growth.

## Non-Goals (for first iteration)

- Multi-tenant organizations and role-based access control.
- Password-based local auth flow.
- Fine-grained permission policies beyond "user owns task".
- External session store (Redis) unless scale requires it.

## Proposed Backend Components

## 1) Database Models

### `User`

- `id` (PK)
- `email` (unique, indexed, nullable only if provider does not return it)
- `name`
- `avatar_url`
- `is_active` (default `true`)
- `created_at`, `updated_at`, `last_login_at`

### `OAuthAccount`

- `id` (PK)
- `user_id` (FK -> `users.id`)
- `provider` (e.g., `google`, `github`)
- `provider_user_id` (provider subject identifier)
- `provider_email` (nullable)
- `access_token_encrypted` (optional, only if provider API access needed)
- `refresh_token_encrypted` (optional)
- `token_expires_at` (optional)
- unique constraint on (`provider`, `provider_user_id`)

### `Session`

- `id` (PK, opaque random string/UUID)
- `user_id` (FK -> `users.id`)
- `created_at`
- `expires_at`
- `revoked_at` (nullable)
- `ip_address` (optional)
- `user_agent` (optional)
- `remember_me` (bool)

### `Task` update

- add `user_id` (FK -> `users.id`, indexed)
- enforce per-user reads and writes (`Task.user_id == current_user.id`)

## 2) Auth Service Layer

- OAuth authorization URL generation + state/PKCE verifier handling.
- OAuth callback exchange (code -> provider tokens/user profile).
- User upsert/linking logic:
  - First match (`provider`, `provider_user_id`)
  - Fallback to verified email (optional, guarded).
- Session creation, validation, rotation, and revocation.

## 3) Session/Cookie Security

- Cookie name: `sid`
- `HttpOnly=true`
- `Secure=true` in production (false only in local dev over HTTP)
- `SameSite=Lax` by default
- `Path=/`
- TTL:
  - Standard session: 8-24h
  - Remember me session: 30 days (configurable)

## 4) Auth Dependency / Middleware Strategy

FastAPI dependencies are preferred for endpoint protection and explicitness:

- `get_current_user` dependency:
  - Read cookie
  - Validate session not expired/revoked
  - Load active user
  - Raise `401` on failure

Optional middleware:

- A lightweight middleware can parse session and set `request.state.user` for observability.
- Core authorization should still rely on dependencies for route-level guarantees.

## API Contract (Backend)

## Auth Endpoints

### `GET /api/auth/login/{provider}`

Starts OAuth flow.

Response option A:

```json
{
  "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "opaque-state"
}
```

Response option B: backend directly issues HTTP redirect.

### `GET /api/auth/callback/{provider}`

- Validates `state`
- Exchanges `code` for provider identity
- Creates/links user
- Creates local session
- Sets `sid` cookie
- Redirects to frontend (e.g., `/`)

### `GET /api/auth/me`

Returns currently authenticated user.

```json
{
  "id": 12,
  "email": "user@example.com",
  "name": "Riya Singh",
  "avatar_url": "https://example.com/avatar.png"
}
```

### `POST /api/auth/logout`

- Revokes active session
- Clears `sid` cookie
- Returns `204`

### Optional (nice to have)

- `GET /api/auth/sessions` (list active device sessions)
- `DELETE /api/auth/sessions/{id}` (revoke specific device)

## Existing Task Endpoints Become Authenticated

- `GET /api/tasks`
- `GET /api/tasks/stats`
- `GET /api/tasks/{task_id}`
- `POST /api/tasks`
- `PATCH /api/tasks/{task_id}`
- `DELETE /api/tasks/{task_id}`

All must include current user resolution and ownership checks.

## Example Dependency and Protected Endpoint

```python
from fastapi import Cookie, Depends, HTTPException
from sqlalchemy.orm import Session

def get_current_user(
    sid: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    if not sid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = (
        db.query(SessionModel)
        .filter(SessionModel.id == sid, SessionModel.revoked_at.is_(None))
        .first()
    )
    if not session or session.expires_at <= utc_now():
        raise HTTPException(status_code=401, detail="Session expired")

    user = db.query(User).filter(User.id == session.user_id, User.is_active.is_(True)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user

@app.get("/api/tasks")
def list_tasks(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Task).filter(Task.user_id == current_user.id).all()
```

## Returning Customers: Detailed Handling

- On successful callback, create a session and set cookie.
- On future visits, frontend calls `/api/auth/me`.
- Backend validates cookie and returns user if session is valid.
- If session expired/revoked, return `401`.
- Optional remember-me:
  - If enabled, issue longer `expires_at`.
  - Rotate session ID periodically to reduce replay risk.

## CORS and CSRF Notes

- `allow_origins=["*"]` cannot be used with cookie auth in browsers.
- Set explicit frontend origins, for example:
  - `http://localhost:5173` (dev)
- If frontend and backend are cross-origin with cookies, add CSRF strategy:
  - Double-submit cookie token or per-request CSRF header for state-changing requests.

## Error Contract

Standardize auth errors:

- `401 Not authenticated` (missing/invalid session)
- `401 Session expired` (expired session)
- `403 Forbidden` (authenticated but not allowed, future RBAC use)

Shape:

```json
{
  "detail": "Not authenticated",
  "code": "AUTH_REQUIRED"
}
```

## Implementation Plan (Backend)

## Phase 1: Schema and migration

- Add `User`, `OAuthAccount`, `Session` models.
- Add `Task.user_id` and relation.
- Write migration/backfill strategy for seeded tasks.

Example approach:

- Create a seed "demo user".
- Assign all existing tasks to demo user for compatibility.

## Phase 2: Auth service foundation

- Add provider config (`client_id`, `client_secret`, `redirect_uri`) via env vars.
- Build OAuth URL + callback token exchange utilities.
- Implement local user upsert/link service.

## Phase 3: Session management

- Add session creation and validation logic.
- Add cookie helper utilities (`set_session_cookie`, `clear_session_cookie`).
- Implement `/api/auth/me` and `/api/auth/logout`.

## Phase 4: Protect task APIs

- Add `current_user` dependency on task endpoints.
- Scope all queries by `Task.user_id`.
- Enforce ownership for get/update/delete by `task_id`.

## Phase 5: Security hardening

- Tighten CORS origins.
- Add CSRF checks for mutating requests.
- Add session TTL policy and revocation checks.

## Phase 6: Tests

- Integration tests:
  - unauthenticated request to tasks -> `401`
  - authenticated request -> `200`
  - user cannot access another user's task -> `404`/`403`
  - logout revokes current session
  - expired session returns `401`

## Config Checklist

- `OAUTH_GOOGLE_CLIENT_ID`
- `OAUTH_GOOGLE_CLIENT_SECRET`
- `OAUTH_GOOGLE_REDIRECT_URI`
- `SESSION_TTL_HOURS`
- `REMEMBER_ME_TTL_DAYS`
- `FRONTEND_ORIGIN`
- `COOKIE_SECURE` (prod true)

## Risks and Mitigations

- OAuth provider downtime -> show actionable login error and retry guidance.
- Session fixation/replay -> rotate session IDs at login and periodically.
- Cross-origin cookie issues in dev -> use explicit origin and documented local setup.
- SQLite concurrency limits -> acceptable for this scope; reassess at scale.

## Future Extensions

- Role-based access control.
- Organization/team model.
- Refresh-token model with short-lived access tokens.
- Passwordless email magic links.
