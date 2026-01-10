# Authentication Context

**Feature Owner:** Auth System  
**Last Updated:** January 10, 2026

---

## Overview
Handles user authentication, registration, and session management using JWT tokens.

---

## Files in This Feature

### Backend
- `app/auth.py` - Core auth utilities (password hashing, token creation/verification)
- `app/routers/auth_router.py` - Login and signup endpoints
- `app/deps.py` - Dependency injection for protected routes

### Frontend
- `book-tracker-frontend/src/components/AuthForm.jsx` - Login/signup form UI
- `book-tracker-frontend/src/services/api.js` - API client with token handling

### Database
- `users` table in SQLite - Stores user credentials and profile info

---

## Key Design Decisions

### 1. JWT Token Authentication
**Decision:** Use JWT tokens with OAuth2 password flow  
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

### 2. Password Security
**Decision:** Bcrypt hashing with salt  
**Why:**
- Industry standard for password storage
- Automatically handles salting
- Slow by design (prevents brute force)
- Adaptive (can increase rounds over time)

**Implementation:**
```python
from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
```

### 3. OAuth2 Password Flow
**Decision:** Use OAuth2PasswordRequestForm  
**Why:**
- Standard protocol for username/password auth
- Compatible with OpenAPI/Swagger
- Allows easy testing via /docs
- Can extend to OAuth providers later

### 4. Username Requirements
**Decision:** Unique username (not email-based login)  
**Why:**
- Users prefer handles for social features
- Email can be optional/private
- Username visible in community features
- Can add email login later if needed

**Validation:**
- Minimum 3 characters
- Alphanumeric + underscores
- Unique check at registration

### 5. Token Storage
**Decision:** localStorage (not httpOnly cookies)  
**Why:**
- Simpler CORS handling
- No cookie domain complexity
- Frontend fully controls token lifecycle
- Trade-off: XSS risk (mitigated by React escaping)

---

## API Endpoints

### POST `/auth/signup`
**Purpose:** Create new user account  
**Input:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string"
}
```
**Output:**
```json
{
  "access_token": "jwt_token_string",
  "token_type": "bearer"
}
```
**Validations:**
- Username uniqueness
- Password strength (8+ chars)
- Email format (if provided)

### POST `/auth/login`
**Purpose:** Authenticate existing user  
**Input:** OAuth2PasswordRequestForm (username + password)  
**Output:** Same as signup (access token)  
**Process:**
1. Lookup user by username
2. Verify password with bcrypt
3. Generate JWT token
4. Return token

---

## Common Patterns

### Protected Route
```python
from app.deps import get_current_user

@router.get("/protected")
def protected_route(current_user: User = Depends(get_current_user)):
    return {"user_id": current_user.id}
```

### Frontend API Call with Auth
```javascript
const token = localStorage.getItem('token');
const response = await axios.get('/api/protected', {
  headers: { Authorization: `Bearer ${token}` }
});
```

---

## Security Considerations

### Current Protections
- ✅ Passwords never stored in plain text
- ✅ Bcrypt prevents rainbow table attacks
- ✅ Token expiration limits session lifetime
- ✅ HTTPS enforced in production
- ✅ CORS restricts allowed origins

### Known Limitations
- ⚠️ No password reset flow (yet)
- ⚠️ No email verification (yet)
- ⚠️ No 2FA support (yet)
- ⚠️ Token refresh not implemented
- ⚠️ No account lockout after failed attempts

---

## Environment Variables

```bash
SECRET_KEY=your-secret-key-here  # For JWT signing
ALGORITHM=HS256                    # JWT algorithm
ACCESS_TOKEN_EXPIRE_MINUTES=43200  # 30 days
```

---

## Database Schema

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    hashed_password TEXT NOT NULL,
    bio TEXT,
    profile_picture TEXT,
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
