# Security Architecture

## Overview

This document explains the security measures implemented to protect the application and ensure only authorized users can access specific parts of the frontend and backend.

## Security Model

### Multi-Layer Security Approach

The application uses a **defense-in-depth** strategy with multiple security layers:

1. **Backend Authentication & Authorization** (Primary Security)
2. **Frontend Route Guards** (UX Enhancement)
3. **JWT Token Validation** (Token-based Security)

### 1. Backend Security (PRIMARY - Most Important)

**All security decisions are made on the backend.** The backend is the single source of truth.

#### JWT Token Validation
- All API requests include a JWT token in the `Authorization: Bearer <token>` header
- Backend validates:
  - Token signature (cannot be forged)
  - Token expiration
  - Token structure
- Invalid tokens result in 401 Unauthorized responses

#### Permission Classes
Custom permission classes in `backend/users/permissions.py`:
- `IsAdminOrStaff`: Restricts access to admin/staff only
- `IsAdmin`: Restricts access to admin only
- `IsCompany`: Restricts access to company users only

#### Protected Endpoints
- `/api/token/validate/`: Requires authentication, returns current user info
- `/api/invite/`: Requires `IsAdminOrStaff` permission
- All other endpoints should have appropriate permission classes

### 2. Frontend Route Guards (UX Enhancement)

**Frontend guards are for UX only, NOT security.**

The `RouteGuard` component:
- Provides immediate feedback to users
- Prevents accidental navigation to unauthorized pages
- Shows loading states while verifying authentication
- **BUT**: Can be bypassed by modifying client-side code

#### How RouteGuard Works
1. Checks if user has a token (client-side check)
2. **Calls backend `/api/token/validate/` endpoint** to verify:
   - Token is valid (backend validates signature)
   - Token is not expired
   - User type matches required permissions
3. If backend verification fails → redirects to login
4. If user type doesn't match → redirects to login

#### Route Protection Examples
```tsx
// Protect admin/staff routes
<RouteGuard allowedUserTypes={["admin", "staff"]}>
  <FRSystemLayout>{children}</FRSystemLayout>
</RouteGuard>

// Protect company routes
<RouteGuard allowedUserTypes={["company"]}>
  <PartnerLayout>{children}</PartnerLayout>
</RouteGuard>
```

### 3. Why Client-Side Checks Are Not Secure

**Important**: Client-side security can always be bypassed:

1. **JWT Decoding**: Users can decode their token and see `user_type`
2. **Code Modification**: Users can modify frontend code to bypass guards
3. **Direct URL Access**: Users can directly navigate to protected routes
4. **Browser DevTools**: Users can manipulate localStorage, tokens, etc.

### 4. Security Best Practices

#### ✅ DO:
- Always validate permissions on the backend
- Use JWT tokens with proper expiration
- Implement permission classes for all protected endpoints
- Verify tokens on every API request
- Use HTTPS in production
- Store tokens securely (localStorage is acceptable for JWTs)

#### ❌ DON'T:
- Rely solely on frontend route guards for security
- Trust client-side token decoding for authorization decisions
- Store sensitive data in tokens
- Use tokens without expiration
- Skip backend validation

### 5. Token Security

#### JWT Token Structure
- **Header**: Algorithm and token type
- **Payload**: User info (user_type, username, email)
- **Signature**: Cryptographically signed (cannot be forged)

#### Token Storage
- Tokens stored in `localStorage`
- Accessible via JavaScript (XSS risk)
- Mitigation: Use HTTPS, implement CSP headers, sanitize inputs

#### Token Validation Flow
1. User logs in → Backend issues JWT token
2. Frontend stores token in localStorage
3. Every API request includes token in Authorization header
4. Backend validates token signature and expiration
5. Backend checks user permissions
6. Backend returns data or 401 Unauthorized

### 6. Example: Secure Endpoint Implementation

```python
# backend/companies/views.py
from rest_framework.permissions import IsAuthenticated
from users.permissions import IsAdminOrStaff

class CompanyInvitationView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrStaff]
    # Only authenticated admin/staff can create invitations
```

```tsx
// frontend/app/panel/fr/layout.tsx
<RouteGuard allowedUserTypes={["admin", "staff"]}>
  {/* Even if user bypasses this, backend will reject unauthorized requests */}
</RouteGuard>
```

### 7. Testing Security

To verify security is working:

1. **Test Backend Directly**:
   ```bash
   # Try to access protected endpoint without token
   curl http://localhost:8000/api/invite/
   # Should return 401 Unauthorized
   
   # Try with invalid token
   curl -H "Authorization: Bearer invalid_token" http://localhost:8000/api/invite/
   # Should return 401 Unauthorized
   
   # Try with company user token (should fail)
   curl -H "Authorization: Bearer <company_token>" http://localhost:8000/api/invite/
   # Should return 403 Forbidden
   ```

2. **Test Frontend**:
   - Try accessing `/panel/fr` as a company user → Should redirect
   - Try accessing `/panel/partner` as admin → Should redirect
   - Modify localStorage token → Backend should reject

### 8. Summary

**Security Checklist**:
- ✅ Backend validates all tokens
- ✅ Backend enforces permissions
- ✅ Frontend provides UX guards
- ✅ All protected routes require authentication
- ✅ User types are validated on backend
- ✅ Tokens expire and are validated

**Remember**: Frontend guards are for UX. Backend validation is for security.

