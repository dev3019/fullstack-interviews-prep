# Authentication Design (Frontend)

## Scope

This document defines how the React frontend in `scenario-1` should implement authentication UX and client-side session behavior for OAuth login with backend-managed sessions.

## Current Frontend State

- `App.tsx` renders task management UI directly without auth gating.
- API calls are made through `src/api.ts` using plain `fetch` with no credentials included.
- There is no login page, auth state store, route protection, or session bootstrap.

## Goals

- Add a dedicated login experience.
- Keep returning users signed in automatically.
- Prevent unauthenticated access to task UI.
- Handle session expiry cleanly and predictably.
- Keep the architecture simple and testable.

## Non-Goals (first iteration)

- Multi-page onboarding.
- Complex account settings UI.
- Client-side JWT parsing/validation (backend session is source of truth).

## Proposed Frontend Components

## 1) Auth State Container

Add an auth context/provider:

- `AuthProvider`
- `useAuth()`
- State:
  - `user: AuthUser | null`
  - `isLoading: boolean`
  - `isAuthenticated: boolean`

Responsibilities:

- Call `/api/auth/me` on app startup.
- Expose `login(provider)`, `logout()`, and `refreshUser()` actions.
- Handle `401` transitions to unauthenticated state.

## 2) Login Page

New component:

- `src/components/LoginPage.tsx`

Features:

- Provider buttons (`Continue with Google`, `Continue with GitHub`)
- Optional "Remember me" checkbox (if supported by backend)
- Loading + error messaging for failed login attempts

Behavior:

- Clicking provider button navigates browser to `GET /api/auth/login/{provider}`.
- After callback redirects back, app bootstraps via `/api/auth/me`.

## 3) Protected App Shell

Add a guard component:

- `src/components/ProtectedApp.tsx` (or `ProtectedRoute` if router is introduced)

Behavior:

- While auth state loading: show centered spinner/skeleton.
- If unauthenticated: render `LoginPage`.
- If authenticated: render existing task UI (current `App` content).

## 4) Header User Menu

Add authenticated user controls:

- Avatar + name/email display
- `Logout` action
- Optional session information ("Signed in as ...")

## 5) API Client Updates (`src/api.ts`)

Required changes:

- include `credentials: 'include'` on all requests.
- add auth APIs:
  - `fetchMe()`
  - `logout()`
- keep typed error handling and normalize auth errors (`401`).

Example:

```ts
export async function fetchMe(): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/api/auth/me`, {
    credentials: 'include',
  });
  return handleResponse<AuthUser>(response);
}
```

## Frontend API Usage Contract

- Login redirect:
  - Browser navigates to `/api/auth/login/google` (not XHR fetch).
- Session bootstrap:
  - `GET /api/auth/me`
- Logout:
  - `POST /api/auth/logout`

Expected behavior:

- `200 /me` -> authenticated view.
- `401 /me` -> login page.
- `401` from task mutations -> show toast + route back to login.

## Returning Customers UX Flow

1. User visits app URL.
2. `AuthProvider` calls `/api/auth/me`.
3. If session cookie is valid:
   - render task app immediately.
4. If no valid session:
   - render `LoginPage`.
5. If session expires during usage:
   - first `401` transitions auth state to signed out.
   - show "Session expired. Please sign in again."

## Suggested File-Level Structure

- `src/types.ts`
  - add `AuthUser` type
- `src/api.ts`
  - add `fetchMe`, `logout`, and include credentials in existing methods
- `src/auth/AuthContext.tsx`
  - provider, hook, bootstrapping logic
- `src/components/LoginPage.tsx`
  - provider login UI
- `src/components/AuthGate.tsx`
  - conditional app rendering based on auth state
- `src/App.tsx`
  - wrap existing task dashboard/content with gate and auth-aware header

## Example Auth Context Shape

```ts
type AuthUser = {
  id: number;
  email: string;
  name: string;
  avatar_url?: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
  login: (provider: 'google' | 'github') => void;
  logout: () => Promise<void>;
};
```

## Example Bootstrapping Pattern

```ts
useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const me = await fetchMe();
      if (!cancelled) setUser(me);
    } catch {
      if (!cancelled) setUser(null);
    } finally {
      if (!cancelled) setIsLoading(false);
    }
  })();
  return () => {
    cancelled = true;
  };
}, []);
```

## UX and Error Handling Guidelines

- Keep login screen minimal and fast.
- Do not expose raw backend stack traces.
- Use friendly auth toasts:
  - "Sign-in failed. Please try again."
  - "Session expired. Please sign in again."
- Preserve unsaved form content only when practical; prefer simplicity first.

## Implementation Plan (Frontend)

## Phase 1: Contracts and primitives

- Add auth types in `types.ts`.
- Add auth APIs in `api.ts`.
- Add credentials include to existing requests.

## Phase 2: Auth provider and gate

- Build `AuthProvider` and `AuthGate`.
- Bootstrap with `/api/auth/me`.
- Move existing task UI under authenticated branch.

## Phase 3: Login and logout UX

- Create `LoginPage`.
- Add provider actions to redirect user to backend login endpoint.
- Add logout action in app header.

## Phase 4: Unauthorized handling

- Centralize `401` handling path in API calls or auth provider.
- On `401`, clear user state and return to login.

## Phase 5: Polish and tests

- Add loading skeleton and accessible button states.
- Add component tests:
  - unauthenticated -> login page
  - authenticated -> task UI
  - logout -> returns to login page

## Testing Checklist (Manual)

- First-time user can log in through provider.
- Returning user lands directly in task dashboard.
- Logout clears session and returns login page.
- Expired session during task action routes back to login.
- Task API calls include cookies (`credentials: include`).

## Risks and Mitigations

- Flicker on initial load -> keep `isLoading` gate and avoid early render.
- OAuth popup/callback confusion -> prefer full-page redirect flow first.
- Inconsistent 401 handling -> centralize auth state reset logic.

## Future Extensions

- Add a full router with `/login` and `/app` routes.
- Add account settings page.
- Add multi-provider linking UI.
