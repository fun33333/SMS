# Auth Service Integration - SIS

## Overview

This document describes how SIS integrates with the centralized Auth Service for employee authentication.

## Architecture Changes

### Before (Current)
```
┌─────────────────┐
│   SIS Backend   │
│                 │
│  • User Model   │
│  • Auth Logic   │
│  • JWT Tokens   │
└────────┬────────┘
         │
    ┌────▼──────┐
    │   SIS DB  │
    │  (Users)  │
    └───────────┘
```

### After (With Auth Service)
```
┌─────────────────┐          ┌───────────────┐
│   SIS Backend   │  ◄─JWT─  │ Auth Service  │
│                 │          │               │
│  • Validates    │          │ • Login       │
│    JWT tokens   │          │ • User CRUD   │
│  • Checks       │          │ • Permissions │
│    permissions  │          └───────┬───────┘
└────────┬────────┘                  │
         │                      ┌────▼─────┐
    ┌────▼──────┐              │ Auth DB  │
    │   SIS DB  │              │(Employees)│
    │(Domain     │              └──────────┘
    │ Data Only) │
    └───────────┘
```

## Implementation Steps

### Step 1: Remove Authentication Code

**Files to Modify:**

#### [MODIFY] `backend/users/models.py`
Remove custom User model, keep only SIS-specific models:
```python
# REMOVE THIS:
# class User(AbstractUser):
#     employee_code = models.CharField(max_length=50, unique=True)
#     ...

# KEEP campus-specific user data if needed
class TeacherProfile(models.Model):
    employee_id = models.UUIDField()  # Reference to auth service
    classroom = models.ForeignKey('classes.ClassRoom', ...)
    subjects = models.ManyToManyField('subjects.Subject')
```

#### [MODIFY] `backend/users/authentication.py`
Replace with JWT validation:
```python
import requests
from rest_framework import authentication
from rest_framework import exceptions

class AuthServiceAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        
        if not auth_header.startswith('Bearer '):
            return None
        
        token = auth_header.split(' ')[1]
        
        # Validate token with auth service
        try:
            response = requests.post(
                f'{settings.AUTH_SERVICE_URL}/api/v1/auth/validate',
                headers={'Authorization': f'Bearer {token}'},
                timeout=5
            )
            
            if response.status_code == 200:
                employee_data = response.json()['employee']
                
                # Check if employee has SIS access
                if not employee_data['services'].get('SIS', {}).get('access_granted'):
                    raise exceptions.PermissionDenied('No SIS access')
                
                return (employee_data, token)
            else:
                raise exceptions.AuthenticationFailed('Invalid token')
        
        except requests.RequestException:
            raise exceptions.AuthenticationFailed('Auth service unavailable')
```

#### [MODIFY] `backend/backend/settings.py`
```python
# Add auth service URL
AUTH_SERVICE_URL = os.getenv('AUTH_SERVICE_URL', 'http://localhost:8000')

# Update authentication classes
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'users.authentication.AuthServiceAuthentication',
    ],
    ...
}

# Remove JWT settings (handled by auth service)
```

---

### Step 2: Update Database Models

#### Foreign Key References
Replace user foreign keys with employee_id:

**Before:**
```python
class Attendance(models.Model):
    teacher = models.ForeignKey('users.User', ...)
```

**After:**
```python
class Attendance(models.Model):
    employee_id = models.UUIDField()  # Reference to auth service employee
    
    @property
    def teacher_name(self):
        # Fetch from auth service if needed
        return get_employee_name(self.employee_id)
```

---

### Step 3: Update API Views

#### Example: Attendance View
**Before:**
```python
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_attendance(request):
    teacher = request.user
    # ... rest of logic
```

**After:**
```python
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_attendance(request):
    # request.user now contains employee data from auth service
    employee_id = request.user['id']
    employee_code = request.user['employee_code']
    
    # Check SIS-specific permissions
    sis_permissions = request.user['services']['SIS']['permissions']
    if 'mark_attendance' not in sis_permissions:
        return Response({'error': 'No permission'}, status=403)
    
    # ... rest of logic with employee_id
```

---

### Step 4: Frontend Changes

#### Login Flow
**Before:**
```javascript
// Frontend calls SIS backend
const response = await fetch('http://localhost:8100/api/login', {
  method: 'POST',
  body: JSON.stringify({ username, password })
});
```

**After:**
```javascript
// Frontend calls auth service directly
const response = await fetch('http://localhost:8000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    employee_code: employeeCode,
    password: password
  })
});

const data = await response.json();

// Store tokens
localStorage.setItem('access_token', data.access_token);
localStorage.setItem('refresh_token', data.refresh_token);
localStorage.setItem('employee', JSON.stringify(data.employee));

// Check if employee has SIS access
if (!data.employee.services.SIS?.access_granted) {
  alert('You do not have access to SIS');
  return;
}

// Redirect to SIS dashboard
window.location.href = '/dashboard';
```

#### API Requests
```javascript
// Include JWT in all requests
const makeAuthenticatedRequest = async (url, options = {}) => {
  const token = localStorage.getItem('access_token');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
  
  // Handle token expiration
  if (response.status === 401) {
    // Try to refresh token
    await refreshToken();
    // Retry request
    return makeAuthenticatedRequest(url, options);
  }
  
  return response;
};
```

---

### Step 5: Permission Mapping

#### SIS Roles → Permissions

**Teacher:**
```json
{
  "service": "SIS",
  "role": "Teacher",
  "permissions": [
    "view_students",
    "mark_attendance",
    "enter_grades",
    "view_timetable",
    "mark_behavior"
  ]
}
```

**Principal:**
```json
{
  "service": "SIS",  
  "role": "Principal",
  "permissions": [
    "view_all_students",
    "approve_transfers",
    "view_reports",
    "manage_staff",
    "approve_requests"
  ]
}
```

**Coordinator:**
```json
{
  "service": "SIS",
  "role": "Coordinator",
  "permissions": [
    "view_campus_students",
    "manage_classes",
    "assign_teachers",
    "process_transfers"
  ]
}
```

#### Permission Check Helper
```python
# backend/users/permissions.py

def has_permission(employee_data, required_permission):
    """Check if employee has specific SIS permission"""
    sis_service = employee_data.get('services', {}).get('SIS', {})
    
    if not sis_service.get('access_granted'):
        return False
    
    permissions = sis_service.get('permissions', [])
    return required_permission in permissions

# Usage in views
from users.permissions import has_permission

@api_view(['POST'])
def approve_transfer(request):
    if not has_permission(request.user, 'approve_transfers'):
        return Response({'error': 'Permission denied'}, status=403)
    # ... logic
```

---

### Step 6: Data Migration

#### Migrate Existing Users

**Migration Script:**
```python
# backend/scripts/migrate_users_to_auth_service.py

import requests
from users.models import User  # Old model

def migrate_users():
    auth_service_url = 'http://localhost:8000/api/v1'
    
    # Get admin token
    admin_token = get_admin_token()
    
    for sis_user in User.objects.all():
        # Determine department based on SIS role
        if hasattr(sis_user, 'teacher_profile'):
            dept_code = f"C{sis_user.campus.code}"
            position_code = 'T'
        elif hasattr(sis_user, 'principal_profile'):
            dept_code = f"C{sis_user.campus.code}"
            position_code = 'P'
        # ... more role mappings
        
        # Create employee in auth service
        employee_data = {
            'full_name': sis_user.get_full_name(),
            'email': sis_user.email,
            'phone': sis_user.phone,
            'cnic': sis_user.cnic,
            'department_code': dept_code,
            'position_code': position_code,
            'hire_year': sis_user.date_joined.strftime('%y'),
            'password': sis_user.password,  # Copy hash
            'date_joined': sis_user.date_joined.isoformat()
        }
        
        response = requests.post(
            f'{auth_service_url}/employees',
            headers={'Authorization': f'Bearer {admin_token}'},
            json=employee_data
        )
        
        if response.status_code == 201:
            employee = response.json()
            
            # Grant SIS access
            requests.post(
                f'{auth_service_url}/employees/{employee["id"]}/services/SIS',
                headers={'Authorization': f'Bearer {admin_token}'}
            )
            
            # Assign roles
            role_data = {
                'role_name': determine_role(sis_user),
                'permissions': get_permissions_for_role(sis_user)
            }
            requests.post(
                f'{auth_service_url}/employees/{employee["id"]}/services/SIS/roles',
                headers={'Authorization': f'Bearer {admin_token}'},
                json=role_data
            )
            
            print(f'Migrated: {sis_user.username} → {employee["employee_code"]}')
        else:
            print(f'Failed to migrate {sis_user.username}: {response.text}')
```

---

## Docker Configuration

### `sis/.env`
```env
# Auth Service URL
AUTH_SERVICE_URL=http://auth-service:8000

# SIS Database
DATABASE_URL=postgresql://erp_user:password@postgres:5432/sis_db
```

### `sis/docker-compose.sis.yml`
```yaml
services:
  sis-backend:
    build: ./backend
    environment:
      - AUTH_SERVICE_URL=http://auth-service:8000
    depends_on:
      - postgres-sis
    # No auth-service in this file (assumes running in root compose)
```

---

## Testing

### Test Authentication
```python
# backend/tests/test_auth_integration.py

import pytest
from django.test import TestCase
from rest_framework.test import APIClient

class AuthIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
    
    def test_login_redirects_to_auth_service(self):
        # Login through auth service
        response = self.client.post('/api/auth/login', {
            'employee_code': 'C06-M-24-T-0001',
            'password': 'TestPass123'
        })
        
        self.assertIn('access_token', response.json())
    
    def test_protected_endpoint_requires_jwt(self):
        # Access without token
        response = self.client.get('/api/students/')
        self.assertEqual(response.status_code, 401)
        
        # Access with token
        token = get_test_token()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        response = self.client.get('/api/students/')
        self.assertEqual(response.status_code, 200)
```

---

## Troubleshooting

### Issue: Auth service unavailable
**Solution:** Fallback or cached validation
```python
def authenticate(self, request):
    try:
        # Validate with auth service
        ...
    except requests.RequestException:
        # Fallback: validate JWT locally (if public key available)
        return validate_jwt_locally(token)
```

### Issue: Token expired mid-session
**Solution:** Automatic refresh in frontend
```javascript
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response.status === 401) {
      await refreshToken();
      return axios.request(error.config);
    }
    return Promise.reject(error);
  }
);
```

---

## Next Steps
1. Review [Auth Service API Specs](../docs/06-api-specifications.md)
2. Follow [Migration Guide](../docs/07-migration-guide.md)
3. Test integration thoroughly
