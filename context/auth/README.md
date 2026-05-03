# Auth Feature

**Last Updated:** May 3, 2026

---

## Overview

Google OAuth 2.0 → JWT tokens. No email/password signup for users (Google only). JWT stored in localStorage (web) / AsyncStorage (mobile), sent as `Authorization: Bearer <token>` on every request.

---

## Key Files

| File | Purpose |
|---|---|
| `app/routers/auth_router.py` | `POST /auth/google`, `POST /auth/login` (legacy), `POST /auth/signup` (legacy), `DELETE /auth/delete-account/me` |
| `app/auth.py` | `create_access_token()`, `verify_password()`, `hash_password()` |
| `app/deps.py` | `get_current_user` (raises 401), `get_admin_user` (raises 403 for non-admins) |

---

## API Endpoints

### `POST /auth/google`
Verifies Google OAuth token (accepts both Web and Android client IDs). Creates account on first login.

**Request:**
```json
{ "token": "<google_credential_token>" }
```

**Response:**
```json
{
  "access_token": "<jwt>",
  "is_new": true,
  "user": { "id": 1, "name": "Alice", "email": "alice@gmail.com" }
}
```

- `is_new: true` only on the very first Google login for that account
- Mobile uses `is_new` to trigger `OnboardingScreen`
- Web uses `is_new` to redirect to `/onboarding` (also gated by `ONBOARDING_KEY` in localStorage)
- `last_active` updated once per day (date change check)

### `DELETE /auth/delete-account/me`
Hard-deletes the authenticated user's account and all associated data.

### Legacy (not used by current frontend)
`POST /auth/signup` and `POST /auth/login` — email/password endpoints still exist but the current web and mobile UIs do not use them.

---

## Token Details

- Algorithm: HS256
- Expiry: 30 days
- Stored in: `localStorage` key `bt_token` (web) / `AsyncStorage` (mobile)
- Header: `Authorization: Bearer <token>`
- No refresh token — user must re-authenticate after expiry

---

## Dependency Injection Pattern

```python
# Any authenticated endpoint:
from app.deps import get_current_user
@router.get("/me")
def get_me(me: User = Depends(get_current_user)):
    ...  # raises 401 if token missing/invalid

# Admin-only endpoint:
from app.deps import get_admin_user
@router.delete("/admin/something")
def admin_action(admin: User = Depends(get_admin_user)):
    ...  # raises 403 if not is_admin
```

---

## Web: Google Sign-In

```javascript
import { GoogleLogin } from '@react-oauth/google';

<GoogleLogin
  onSuccess={async (cred) => {
    const data = await authAPI.googleAuth(cred.credential);
    localStorage.setItem('bt_token', data.access_token);
    // data.is_new → redirect to /onboarding
  }}
/>
```

## Mobile: Google Sign-In

`expo-auth-session` + `@react-native-google-signin/google-signin` — sends `idToken` to `POST /auth/google`.

`authTokenRef` (useRef in App.js) — stores JWT so push token registration never races against AsyncStorage reads.

---

## is_new / Onboarding Gate

| Platform | Mechanism |
|---|---|
| Mobile | `is_new: true` in `/auth/google` response → navigate to `OnboardingScreen` |
| Web | `is_new: true` → set localStorage `bt_onboarding_v1` → redirect to `/onboarding` |

To force re-onboarding for all web users: bump `ONBOARDING_KEY` from `'bt_onboarding_v1'` → `'bt_onboarding_v2'`.

---

## Admin Access

`is_admin` boolean on `user` table. `get_admin_user` dep checks this after validating JWT.

- Admin UI gates (showing trash icons, admin panel link) are frontend-only convenience — the backend always enforces 403
- Initial admin user: set `is_admin = true` in Supabase for the account
