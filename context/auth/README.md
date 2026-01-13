# Authentication Context

**Feature Owner:** Auth System  
**Last Updated:** January 13, 2026

---

## Overview
Handles user authentication using Google OAuth 2.0 and JWT tokens for session management.

---

## Files in This Feature

### Backend
- `app/auth.py` - Core auth utilities (password hashing, token creation/verification)
- `app/routers/auth_router.py` - Google OAuth and JWT endpoints
- `app/deps.py` - Dependency injection for protected routes (get_current_user, get_admin_user)

### Frontend
- `book-tracker-frontend/src/components/AuthForm.jsx` - Google OAuth sign-in UI
- `book-tracker-frontend/src/services/api.js` - API client with token handling

### Database
- `user` table in PostgreSQL - Stores user credentials, profile info, admin status, last_active

---

## Key Design Decisions

### 1. Google OAuth Only
**Decision:** Use Google OAuth 2.0 as the sole authentication method  
**Why:**
- Simplified user experience (one-click sign-in)
- No password management complexity
- Better security (Google handles authentication)
- No password reset flows needed
- Faster signup process

**Implementation:**
- Google Sign-In button via @react-oauth/google
- Backend verifies Google token with id_token.verify_oauth2_token
- Creates account on first sign-in automatically
- Random password generated for OAuth users (stored but unused)

### 2. JWT Token Authentication
**Decision:** Use JWT tokens after Google OAuth  
**Why:**
- Stateless (no server-side sessions)
- Works well with REST APIs
- Scalable across multiple servers
- Frontend can easily include in requests

**Implementation:**
- Token lifetime: 30 days
- Stored in localStorage on frontend
- Sent as `Authorization: Bearer <token>` header
- Secret key stored in environment variable

### 3. Merged Login/Signup
**Decision:** Single "Sign In" page (no separate signup)  
**Why:**
- Google OAuth handles both cases automatically
- Simpler UX (one button instead of two)
- Cleaner navigation
- Modern pattern (Notion, Linear, etc.)

**Implementation:**
- AuthForm component has no type prop
- /auth/google endpoint creates account if new user
- Frontend shows single "Sign In" button in header

### 4. Admin Access Control
**Decision:** is_admin boolean flag on user table  
**Why:**
- Simple role-based access control
- Easy to extend with more roles later
- Protects admin endpoints with get_admin_user dependency
- First user (ankitalkuhs@gmail.com) set as admin

### 5. Last Active Tracking
**Decision:** Track last_active timestamp on users  
**Why:**
- Admin dashboard needs user engagement metrics
- Updated once per day (not on every request)
- Helps identify inactive users

**Implementation:**
- Updated in /auth/google endpoint on login
- Only updates if date changed (not multiple times/day)
- Displayed in admin dashboard users table

---

## API Endpoints

### POST `/auth/google`
**Purpose:** Authenticate with Google OAuth token  
**Input:**
```json
{
  "token": "google_credential_token"
}
```
**Output:**
```json
{
  "access_token": "jwt_token_string",
  "user": {
    "id": 1,
    "name": "User Name",
    "email": "user@example.com"
  }
}
```
**Process:**
1. Verify Google token with Google's servers
2. Extract email, name, google_id from token
3. Check if user exists by email
4. Create new user if first time (with random password)
5. Update last_active if date changed
6. Generate JWT token
7. Return token and user info

### POST `/auth/login` (Legacy - email/password)
**Status:** Deprecated (kept for backwards compatibility)  
**Purpose:** Authenticate with email and password  
**Note:** Frontend no longer uses this endpoint

### POST `/auth/signup` (Legacy - email/password)
**Status:** Deprecated (kept for backwards compatibility)  
**Purpose:** Create account with email and password  
**Note:** Frontend no longer uses this endpoint

---

## Common Patterns

### Protected Route
```python
from app.deps import get_current_user

@router.get("/protected")
def protected_route(current_user: User = Depends(get_current_user)):
    return {"user_id": current_user.id}
```

### Admin-Only Route
```python
from app.deps import get_admin_user

@router.get("/admin/stats")
def admin_stats(admin_user: User = Depends(get_admin_user)):
    return {"admin_id": admin_user.id}
```

### Frontend Google Sign-In
```javascript
import { GoogleLogin } from '@react-oauth/google';

<GoogleLogin
  onSuccess={async (credentialResponse) => {
    const data = await apiFetch("/auth/google", {
      method: "POST",
      body: JSON.stringify({ token: credentialResponse.credential }),
    });
    localStorage.setItem("bt_token", data.access_token);
    setUser(data.user);
  }}
  onError={() => alert("Sign in failed")}
/>
```

---

## Security Considerations

### Current Protections
- ✅ Google handles authentication (2FA, suspicious login detection)
- ✅ JWT tokens expire after 30 days
- ✅ Admin endpoints protected by is_admin check
- ✅ HTTPS enforced in production
- ✅ CORS restricts allowed origins
- ✅ Last active tracking for security audits

### Known Limitations
- ⚠️ Google OAuth only (no email/password option)
- ⚠️ Token refresh not implemented (requires re-login after 30 days)
- ⚠️ No account lockout (handled by Google)
- ⚠️ No session revocation (JWT can't be invalidated server-side)

---

## Database Schema

```sql
CREATE TABLE "user" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    bio TEXT,
    profile_picture VARCHAR(500),
    is_admin BOOLEAN DEFAULT FALSE,
    last_active TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Testing Endpoints

### Via Swagger UI
1. Go to http://127.0.0.1:8000/docs
2. Click "Authorize" button (top right)
3. Enter username and password
4. Click "Authorize"
5. All requests now include token

### Via curl
```bash
# Signup
curl -X POST http://127.0.0.1:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test1234"}'

# Login
curl -X POST http://127.0.0.1:8000/auth/login \
  -d "username=test&password=test1234"
```

---

## Future Enhancements

### Short Term
- [ ] Add password reset via email
- [ ] Implement token refresh mechanism
- [ ] Add "remember me" option
- [ ] Account lockout after 5 failed attempts

### Long Term
- [ ] Social login (Google, GitHub)
- [ ] Two-factor authentication
- [ ] Session management (view/revoke devices)
- [ ] Email verification for signups
- [ ] Password strength meter on frontend

---

## Troubleshooting

### "Invalid credentials" error
- Check password is correct
- Verify user exists in database
- Ensure bcrypt is comparing correctly

### "Token has expired"
- User needs to log in again
- Check token expiration settings
- Consider implementing refresh tokens

### CORS errors on login
- Verify frontend origin in CORS_ORIGINS
- Check Authorization header format
- Ensure credentials are included

---

## Related Context

- See [../PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) for overall architecture
- See [../community/README.md](../community/README.md) for user profiles
- See [../deployment/README.md](../deployment/README.md) for production setup
