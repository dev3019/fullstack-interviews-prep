# Frontend Authentication Design

## Overview

This document describes the frontend changes required to add Google OAuth login, protected routing, and automatic session management to the Task Tracker React app.

### Current State

- **Framework**: React 18 + TypeScript + Vite
- **Routing**: None — single-page app with no router
- **Auth**: None — all API calls are unauthenticated
- **State**: Local component state only (no context or global store)
- **API Client**: Plain `fetch()` calls in `api.ts`

### Target State

- Login page with "Sign in with Google" button
- OAuth callback handler
- Protected routes — unauthenticated users see only the login page
- Auth context providing user state app-wide
- Automatic token refresh for returning customers
- API interceptor that attaches tokens and handles 401 retries

---

## 1. New Dependencies

Add to `frontend/package.json`:

```bash
npm install react-router-dom
```

| Package | Version | Purpose |
|---------|---------|---------|
| `react-router-dom` | ^6.x | Client-side routing for `/login`, `/auth/callback`, and `/` |

No other dependencies are needed. The auth logic uses the native `fetch` API and React built-in hooks/context.

---

## 2. New File Structure

```
frontend/src/
├── auth/
│   ├── AuthContext.tsx       # React context + provider for auth state
│   └── ProtectedRoute.tsx    # Route guard component
├── components/
│   ├── LoginPage.tsx         # Login UI
│   ├── OAuthCallback.tsx     # Handles redirect from Google
│   ├── UserMenu.tsx          # Header user info + logout
│   ├── Dashboard.tsx         # (existing, unchanged)
│   ├── FilterBar.tsx         # (existing, unchanged)
│   ├── TaskForm.tsx          # (existing, unchanged)
│   ├── TaskList.tsx          # (existing, unchanged)
│   └── Toast.tsx             # (existing, unchanged)
├── api.ts                    # (modified — add auth interceptor)
├── types.ts                  # (modified — add AuthUser type)
├── App.tsx                   # (modified — add routing)
├── App.css                   # (modified — add login page + user menu styles)
└── main.tsx                  # (modified — wrap with BrowserRouter + AuthProvider)
```

---

## 3. Type Definitions

Add to `frontend/src/types.ts`:

```typescript
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  picture: string | null;
}
```

---

## 4. Auth Context (`auth/AuthContext.tsx`)

The auth context is the central piece — it manages user state, token storage, and provides `login`/`logout` functions to all components.

```tsx
import {
  createContext, useContext, useState, useEffect, useCallback,
  ReactNode,
} from 'react';
import { AuthUser } from '../types';
import { setApiToken, onRefresh } from '../api';

const API_BASE = 'http://localhost:8000';

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  setAccessToken: (token: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setAccessToken = useCallback((token: string) => {
    setAccessTokenState(token);
    setApiToken(token);
  }, []);

  const fetchMe = useCallback(async (token: string): Promise<boolean> => {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setUser(await res.json());
      return true;
    }
    return false;
  }, []);

  // On mount: try to refresh the token silently (returning customer flow)
  useEffect(() => {
    async function tryRefresh() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',   // sends the httpOnly cookie
        });
        if (res.ok) {
          const { access_token } = await res.json();
          setAccessToken(access_token);
          await fetchMe(access_token);
        }
      } catch {
        // Not logged in — this is expected for new users
      } finally {
        setIsLoading(false);
      }
    }
    tryRefresh();
  }, [fetchMe, setAccessToken]);

  // Sync the api module when a token refresh happens from the interceptor
  useEffect(() => {
    onRefresh((newToken: string) => {
      setAccessTokenState(newToken);
    });
  }, []);

  const login = useCallback(() => {
    fetch(`${API_BASE}/api/auth/google/login`)
      .then((res) => res.json())
      .then((data) => {
        window.location.href = data.auth_url;
      });
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
    setAccessTokenState(null);
    setApiToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, isLoading, login, logout, setAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

### Key Design Decisions

1. **Token in memory, not localStorage** — The access token lives in React state (`useState`). On page refresh it's gone, but the refresh token (httpOnly cookie) silently restores it. This protects against XSS.

2. **`isLoading` state** — On mount the context attempts a silent refresh. While that's in-flight, `isLoading` is `true`, preventing a flash of the login page for returning customers.

3. **Sync with `api.ts`** — The context calls `setApiToken()` to keep the API module in sync. The `onRefresh` callback updates React state when the interceptor performs a background refresh.

---

## 5. Protected Route (`auth/ProtectedRoute.tsx`)

A wrapper component that redirects unauthenticated users to `/login`:

```tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

**Behavior:**
- While `isLoading` is true (silent refresh in progress) → show a loading spinner.
- If no user after loading completes → redirect to `/login`.
- If user exists → render the protected content.

---

## 6. Login Page (`components/LoginPage.tsx`)

A centered card with the app title and a Google sign-in button:

```tsx
import { useAuth } from '../auth/AuthContext';
import { Navigate } from 'react-router-dom';

export function LoginPage() {
  const { user, isLoading, login } = useAuth();

  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="spinner" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>Task Tracker</h1>
          <p>Manage your tasks efficiently</p>
        </div>

        <button className="google-login-btn" onClick={login}>
          <img
            src="https://developers.google.com/identity/images/g-logo.png"
            alt=""
            width={20}
            height={20}
          />
          Sign in with Google
        </button>

        <p className="login-footer">
          Your tasks are private and only visible to you.
        </p>
      </div>
    </div>
  );
}
```

**Notes:**
- If the user is already authenticated, the page redirects to `/` immediately.
- The Google logo is loaded from Google's CDN — no local asset needed.

---

## 7. OAuth Callback Handler (`components/OAuthCallback.tsx`)

Handles the redirect back from the backend after Google authentication:

```tsx
import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setAccessToken } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const token = params.get('access_token');
    if (token) {
      setAccessToken(token);
      navigate('/', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  }, [params, navigate, setAccessToken]);

  return (
    <div className="auth-loading">
      <div className="spinner" />
      <p>Signing you in...</p>
    </div>
  );
}
```

**Flow:**
1. Backend redirects to `http://localhost:5173/auth/callback?access_token=<jwt>`.
2. This component reads the token from the URL.
3. Stores it via `setAccessToken` (which updates both context and the API module).
4. Navigates to `/` where `ProtectedRoute` will see the user (after `fetchMe` completes inside the context).
5. The `processed` ref prevents double-execution in React StrictMode.

---

## 8. User Menu (`components/UserMenu.tsx`)

Displayed in the app header showing the user's avatar, name, and a logout button:

```tsx
import { useAuth } from '../auth/AuthContext';

export function UserMenu() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="user-menu">
      {user.picture && (
        <img
          src={user.picture}
          alt={user.name}
          className="user-avatar"
          referrerPolicy="no-referrer"
        />
      )}
      <span className="user-name">{user.name}</span>
      <button className="logout-btn" onClick={logout}>
        Sign out
      </button>
    </div>
  );
}
```

**Notes:**
- `referrerPolicy="no-referrer"` is needed for Google avatar URLs to load correctly.
- On logout, the context clears user state and the cookie, and `ProtectedRoute` redirects to `/login`.

---

## 9. API Client Changes (`api.ts`)

The API module needs three changes:

1. **Token management functions** for the auth context to call.
2. **An `authFetch` wrapper** that attaches the `Authorization` header.
3. **A 401 interceptor** that silently refreshes and retries on token expiry.

```typescript
import { TaskFilters, TaskListResponse, TaskStats, Task } from './types';

const API_BASE = 'http://localhost:8000';

// --- Token management (called by AuthContext) ---

let accessToken: string | null = null;
let refreshCallback: ((token: string) => void) | null = null;

export function setApiToken(token: string | null) {
  accessToken = token;
}

export function onRefresh(callback: (token: string) => void) {
  refreshCallback = callback;
}

// --- Silent refresh ---

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return null;
      const { access_token } = await res.json();
      accessToken = access_token;
      refreshCallback?.(access_token);
      return access_token;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// --- Auth-aware fetch wrapper ---

async function authFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // On 401, attempt a silent refresh and retry once
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  return response;
}

// --- Error handling (unchanged logic) ---

async function throwIfError(response: Response): Promise<void> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (body.detail) {
        message =
          typeof body.detail === 'string'
            ? body.detail
            : JSON.stringify(body.detail);
      }
    } catch {
      // Could not parse error body
    }
    throw new Error(message);
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  await throwIfError(response);
  return response.json();
}

// --- API functions (changed: fetch → authFetch) ---

export async function fetchStats(): Promise<TaskStats> {
  const response = await authFetch(`${API_BASE}/api/tasks/stats`);
  return handleResponse<TaskStats>(response);
}

export async function fetchTasks(
  filters: TaskFilters,
): Promise<TaskListResponse> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.search) params.set('search', filters.search);

  const response = await authFetch(
    `${API_BASE}/api/tasks?${params.toString()}`,
  );
  return handleResponse<TaskListResponse>(response);
}

export async function createTask(data: {
  title: string;
  description: string;
  priority: string;
}): Promise<Task> {
  const response = await authFetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Task>(response);
}

export async function updateTask(
  id: number,
  data: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority'>>,
): Promise<Task> {
  const response = await authFetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Task>(response);
}

export async function deleteTask(id: number): Promise<void> {
  const response = await authFetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'DELETE',
  });
  await throwIfError(response);
}
```

### Design Decisions

1. **Refresh deduplication** — `refreshPromise` ensures that if multiple API calls hit 401 simultaneously, only one refresh request is made. All waiters share the same promise.

2. **Single retry** — After a successful refresh, the original request is retried exactly once. If it fails again, the error propagates normally.

3. **`credentials: 'include'`** — Required for the browser to send the httpOnly `refresh_token` cookie on cross-origin requests.

---

## 10. Router Setup (`App.tsx`)

The current `App` component becomes the main task tracker view, wrapped in routes:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { LoginPage } from './components/LoginPage';
import { OAuthCallback } from './components/OAuthCallback';
import { UserMenu } from './components/UserMenu';
// ... existing imports ...

function TaskTrackerApp() {
  // All the existing App component logic stays here:
  // tasks state, filters, handlers, etc.

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Task Tracker</h1>
          <p>Manage your team&apos;s tasks efficiently</p>
        </div>
        <UserMenu />
      </header>

      <main className="app-main">
        {/* ... existing Dashboard, FilterBar, TaskForm, TaskList ... */}
      </main>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <TaskTrackerApp />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
```

### Route Structure

| Path | Component | Auth Required | Purpose |
|------|-----------|---------------|---------|
| `/login` | `LoginPage` | No | Sign-in screen |
| `/auth/callback` | `OAuthCallback` | No | Handles Google redirect |
| `/` | `TaskTrackerApp` | Yes | Main app (wrapped in `ProtectedRoute`) |

---

## 11. Entry Point Changes (`main.tsx`)

The `main.tsx` file stays minimal since routing and auth wrapping happen in `App.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

No changes needed here if `BrowserRouter` and `AuthProvider` are placed inside `App.tsx` (which is the recommended pattern for this project).

---

## 12. CSS Additions (`App.css`)

New styles needed for login page, user menu, and auth loading states:

```css
/* --- Login Page --- */

.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  background: white;
  border-radius: 16px;
  padding: 48px 40px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  max-width: 400px;
  width: 100%;
}

.login-header h1 {
  margin: 0 0 8px;
  font-size: 28px;
  color: #1a1a2e;
}

.login-header p {
  margin: 0 0 32px;
  color: #666;
}

.google-login-btn {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  border: 1px solid #dadce0;
  border-radius: 8px;
  background: white;
  color: #3c4043;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
}

.google-login-btn:hover {
  background: #f8f9fa;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.login-footer {
  margin: 24px 0 0;
  font-size: 13px;
  color: #999;
}

/* --- User Menu (in header) --- */

.user-menu {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.user-name {
  font-size: 14px;
  color: #e0e0e0;
}

.logout-btn {
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  background: transparent;
  color: #e0e0e0;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* --- Auth loading spinner --- */

.auth-loading {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #666;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e0e0e0;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* --- Header layout update --- */

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  /* ...existing styles... */
}
```

---

## 13. Complete Auth Flow — User's Perspective

### New User

1. Opens `http://localhost:5173` → `ProtectedRoute` sees no user → redirects to `/login`.
2. Sees the login page with "Sign in with Google" button.
3. Clicks the button → browser navigates to Google's consent screen.
4. Grants consent → Google redirects to backend callback → backend creates user and tokens → redirects to `/auth/callback?access_token=...`.
5. `OAuthCallback` stores the token → navigates to `/`.
6. `ProtectedRoute` sees the user → renders the task tracker.

### Returning User (Same Session)

- The access token is in memory. All API calls work. Nothing special happens.

### Returning User (New Tab or Page Refresh)

1. Opens `http://localhost:5173` → `ProtectedRoute` sees `isLoading=true` → shows spinner.
2. `AuthProvider`'s `useEffect` fires `POST /api/auth/refresh` → the httpOnly cookie is sent automatically.
3. Backend returns a new access token → context fetches `/api/auth/me` → sets user state.
4. `isLoading` becomes `false`, `user` is populated → `ProtectedRoute` renders the app.
5. The user never sees the login page.

### Token Expiry During Use

1. User has been active for 30+ minutes → access token expires.
2. Next API call (e.g. creating a task) returns 401.
3. `authFetch` interceptor catches 401 → calls `POST /api/auth/refresh` → gets new token.
4. Original request is retried with the new token → succeeds.
5. The user sees no interruption.

### Logout

1. User clicks "Sign out" in the header.
2. Frontend calls `POST /api/auth/logout` → backend clears the refresh token cookie.
3. Context clears user state and access token.
4. `ProtectedRoute` redirects to `/login`.

---

## 14. Vite Config Change

Add history API fallback so that direct navigation to `/login` or `/auth/callback` works (Vite dev server already handles this, but for the production build with `vite preview` or a reverse proxy, ensure SPA fallback is configured):

The Vite dev server already supports SPA routing out of the box. For production, the Docker/nginx configuration should serve `index.html` for all paths.

---

## 15. File Change Summary

| Action | File | What Changes |
|--------|------|-------------|
| **Create** | `src/auth/AuthContext.tsx` | Auth context, provider, `useAuth` hook |
| **Create** | `src/auth/ProtectedRoute.tsx` | Route guard component |
| **Create** | `src/components/LoginPage.tsx` | Login UI |
| **Create** | `src/components/OAuthCallback.tsx` | OAuth redirect handler |
| **Create** | `src/components/UserMenu.tsx` | Header user info + logout |
| **Modify** | `src/types.ts` | Add `AuthUser` interface |
| **Modify** | `src/api.ts` | Add `authFetch`, token management, 401 interceptor |
| **Modify** | `src/App.tsx` | Add routing, split into `App` (routes) + `TaskTrackerApp` (content) |
| **Modify** | `src/App.css` | Add login page, user menu, loading spinner styles |
| **Modify** | `package.json` | Add `react-router-dom` dependency |

---

## 16. Testing Checklist

- [ ] New user can sign in with Google and sees the task tracker
- [ ] Authenticated user's tasks are isolated (can't see other users' tasks)
- [ ] Page refresh keeps the user logged in (silent refresh works)
- [ ] Opening a new tab keeps the user logged in
- [ ] After 30 minutes of inactivity, the next action triggers a silent refresh (no login prompt)
- [ ] Clicking "Sign out" clears the session and shows the login page
- [ ] Unauthenticated navigation to `/` redirects to `/login`
- [ ] Authenticated navigation to `/login` redirects to `/`
- [ ] The loading spinner shows during the initial silent refresh (no flash of login page)
- [ ] Multiple concurrent 401s result in only one refresh request (deduplication)
