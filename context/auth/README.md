# Authentication & User Management

**Feature Owner:** Core Backend  
**Last Updated:** December 27, 2025

---

## Overview

JWT-based stateless authentication system with bcrypt password hashing. Supports signup, login, token refresh, and optional authentication for public endpoints.

---

## Architecture

### Backend Files
- `app/auth.py` - Token generation, password hashing utilities
- `app/routers/auth_router.py` - Auth endpoints
- `app/deps.py` - Authentication dependencies
- `app/models.py` - User model

### Frontend Files
- `src/pages/LoginPage.jsx` - Login UI
- `src/pages/SignupPage.jsx` - Registration UI
- `src/services/api.js` - Token storage and API client

---

## Key Decisions

### 1. JWT Configuration
```python
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
```

**Rationale:** Long-lived tokens (7 days) for better UX, with refresh mechanism for security.

### 2. Password Security
- **Hashing:** bcrypt with automatic salt generation
- **Validation:** Email format validation via `email-validator`
- **Storage:** Only hashed passwords stored in database

### 3. Optional Authentication Pattern
```python
def get_current_user_optional(db, credentials) -> Optional[User]:
    """Returns None for unauthenticated, User for authenticated"""
```

**Use Case:** Public community feed accessible without login, but degraded functionality.

### 4. Token Storage
- **Frontend:** `localStorage` with key `bt_token`
- **API Calls:** Automatic Authorization header injection in `apiFetch()`
- **Expiration Handling:** 401 response triggers logout

---

## API Endpoints

### POST `/auth/signup`
**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### POST `/auth/login`
**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** Same as signup

### POST `/auth/refresh`
**Headers:** `Authorization: Bearer <token>`  
**Response:** New token with extended expiration

---

## Frontend Flow

1. **Signup:**
   - User fills form → POST `/auth/signup`
   - Store token in `localStorage`
   - Redirect to home page

2. **Login:**
   - User enters credentials → POST `/auth/login`
   - Store token in `localStorage`
   - Redirect to home page

3. **Authenticated Requests:**
   - `apiFetch()` automatically adds token to headers
   - If 401, clear token and redirect to login

4. **Logout:**
   - Clear `localStorage.removeItem('bt_token')`
   - Redirect to login page

---

## Security Considerations

✅ **Implemented:**
- HTTPS in production (Vercel/Render)
- JWT token signing with secret key
- Password hashing with bcrypt
- CORS with explicit origins
- Email validation

⚠️ **Future Improvements:**
- Rate limiting on auth endpoints
- Account lockout after failed attempts
- Email verification
- Password reset flow
- Multi-factor authentication (MFA)
- Refresh token rotation

---

## Testing Checklist

- [ ] Signup with valid email/password
- [ ] Signup with duplicate email (should fail)
- [ ] Login with correct credentials
- [ ] Login with incorrect password (should fail)
- [ ] Access protected route without token (should redirect)
- [ ] Token expiration handling (after 7 days)
- [ ] Token refresh mechanism

---

## Common Issues

### Issue: "Invalid token" on valid requests
**Cause:** Token expired or SECRET_KEY mismatch  
**Solution:** Check token expiration, verify SECRET_KEY in environment

### Issue: CORS error on auth endpoints
**Cause:** Frontend origin not in CORS_ORIGINS  
**Solution:** Add frontend URL to CORS_ORIGINS environment variable

### Issue: Password hash verification fails
**Cause:** bcrypt version mismatch or corrupted hash  
**Solution:** Regenerate password hash, ensure bcrypt==4.2.1
