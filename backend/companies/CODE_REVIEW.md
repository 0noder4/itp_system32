# Code Review: Companies Backend Logic

**Date:** 2025-01-27  
**Reviewer:** AI Code Review  
**Scope:** `/backend/companies/` module

---

## 🔴 Critical Issues

### 2. **Model Name Typos - Inconsistent Naming** ✅ FIXED

**Location:** `views.py`, `serializers.py`

**Status:** ✅ **RESOLVED** - All naming errors have been fixed.

**Previous Issues:**

- `Adress` was used in views/serializers but model is named `Address` in `models.py:164`
- `ExtendedEqupment` was used in views/serializers but model is named `ExtendedEquipment` in `models.py:203`

**Fix Applied:**

- All references to `Adress` have been changed to `Address` in `serializers.py`
- All references to `ExtendedEqupment` have been changed to `ExtendedEquipment` in `serializers.py`
- All files compile successfully without errors
- Views were already using correct names (`Address` and `ExtendedEquipment`)

---

### 3. **Security: CSRF Exemption on Sensitive Endpoints** ✅ FIXED

**Location:** `views.py`

**Status:** ✅ **RESOLVED** - Views have been converted to APIView classes.

**Previous Issue:** `@csrf_exempt` decorator was used on `company_list` and `company` views, which bypassed Django's CSRF protection.

**Fix Applied:**

- `company_list` and `company` views have been converted to `CompanyListView` and `CompanyDetailView` APIView classes
- Both views now use DRF's built-in CSRF handling
- Proper authentication is enforced via `permission_classes = [IsAuthenticated]`
- No `@csrf_exempt` decorators remain in the codebase

---

## 🟠 High Priority Issues

### 4. **Poor Error Handling - Bare Except Clauses**

**Location:** `views.py` (multiple locations)

**Issue:** Multiple bare `except:` clauses that catch all exceptions, making debugging difficult and potentially hiding critical errors.

**Examples:**

- `views.py:164` - `except: return Response(status=404)`
- `views.py:168, 179, 185, 205, 211, 227, 240, 246, 260, 274, 280, 294, 323, 348, 365, 397, 421`

**Impact:**

- Difficult to debug issues
- Generic error responses don't help identify problems
- May hide unexpected errors

**Recommendation:**

```python
# Instead of:
except: return Response(status=404)

# Use:
except Company.DoesNotExist:
    return Response({"detail": "Company not found"}, status=404)
except BasicData.DoesNotExist:
    return Response({"detail": "Basic data not found"}, status=404)
except Exception as e:
    logger.error(f"Unexpected error: {e}", exc_info=True)
    return Response({"detail": "Internal server error"}, status=500)
```

---

### 5. **Missing Input Validation**

**Location:** `views.py:46-63` (company view)

**Issue:** The `company` view accepts `id` parameter but doesn't validate it's a valid integer before querying.

**Recommendation:** Use DRF's URL path converters or add validation:

```python
def company(request, id):
    if not isinstance(id, int) or id <= 0:
        return JsonResponse({"error": "Invalid company ID"}, status=400)
    # ... rest of code
```

---

### 6. **Inconsistent Error Response Format**

**Location:** Throughout `views.py`

**Issue:** Some endpoints return `JsonResponse` with errors, others return `Response` with different formats.

**Examples:**

- `views.py:43` returns `JsonResponse(serializer.errors, status=400)`
- `views.py:176` returns `Response(serializer.errors, status=400)`

**Recommendation:** Standardize on DRF's `Response` format throughout.

---

### 7. **Missing Permission Checks**

**Location:** `views.py:32-43` (company_list)

**Issue:** `company_list` view has no authentication or permission checks, allowing anyone to list all companies.

**Recommendation:** Add permission classes:

```python
@permission_classes([IsAuthenticated])
def company_list(request):
    # ... existing code
```

---

## 🟡 Medium Priority Issues

### 8. **Hardcoded Values**

**Location:** `models.py:19-20`

**Issue:** Dates are hardcoded in `DAY_OPT` choices:

```python
DAY_OPT = [
    ('day1', '10.03.2025'),
    ('day2', '11.03.2025')
]
```

**Impact:** Requires code changes to update dates for future events.

**Recommendation:** Move to settings or make configurable via admin.

---

### 9. **Missing Model Meta Information**

**Location:** `models.py` (multiple models)

**Issue:** Many models lack `Meta` classes with `verbose_name`, `verbose_name_plural`, `ordering`, etc.

**Recommendation:** Add Meta classes for better admin interface and consistency:

```python
class Company(models.Model):
    # ... fields

    class Meta:
        verbose_name = "Company"
        verbose_name_plural = "Companies"
        ordering = ['name']
```

---

### 10. **Inconsistent Related Name Usage**

**Location:** `models.py:141`

**Issue:** `Stand` model uses `related_name='stand_all'` which is unclear.

**Recommendation:** Use more descriptive names:

```python
related_name='stands'  # or 'company_stands'
```

---

### 11. **Missing Database Indexes**

**Location:** `models.py` (multiple models)

**Issue:** Foreign keys and frequently queried fields lack database indexes.

**Recommendation:** Add indexes for performance:

```python
class Company(models.Model):
    email = models.EmailField(db_index=True)
    status = models.CharField(max_length=10, db_index=True)
```

---

### 12. **Potential N+1 Query Issues**

**Location:** `views.py:414-421` (CompanyFeedbackListView)

**Issue:** Serializing feedbacks may cause N+1 queries if serializer accesses related objects.

**Recommendation:** Use `select_related` or `prefetch_related`:

```python
feedbacks = Feedback.objects.filter(company=company).select_related('company').order_by('-id')
```

---

### 13. **Missing Validation on CompanyInvitation**

**Location:** `models.py:98-135`

**Issue:** `CompanyInvitation` doesn't validate that `expires_at` is in the future when created.

**Recommendation:** Add model validation:

```python
def clean(self):
    if self.expires_at <= django.utils.timezone.now():
        raise ValidationError("Expiration date must be in the future")
```

---

### 14. **Inconsistent Serializer Field Exposure**

**Location:** `serializers.py`

**Issue:** Some serializers use `fields = '__all__'`, others use `exclude = ('form',)`. Inconsistent approach.

**Recommendation:** Be explicit about fields for security and clarity:

```python
class BasicDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = BasicData
        fields = ['id', 'company', 'full_name', 'nip', 'dl']
        read_only_fields = ['id']
```

---

### 15. **Missing Transaction Management**

**Location:** `serializers.py` (nested serializers)

**Issue:** `Stage1Serializer`, `Stage2Serializer`, `Stage5Serializer` create multiple related objects without transaction management. If one fails, partial data may be created.

**Recommendation:** Wrap in transactions:

```python
from django.db import transaction

@transaction.atomic
def create(self, validated_data):
    # ... existing code
```

---

## 🟢 Low Priority / Code Quality Issues

### 16. **Unused Form Files**

**Location:** `forms/` directory

**Issue:** All form files contain only commented-out code.

**Recommendation:** Either implement the forms or remove the files.

---

### 17. **Inconsistent Import Organization**

**Location:** `views.py:1-28`

**Issue:** Imports are not well-organized (standard library, Django, third-party, local).

**Recommendation:** Follow PEP 8 import ordering:

```python
# Standard library
import os

# Django
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
# ...

# Third-party
from rest_framework import generics, status
# ...

# Local
from .models import ...
from .serializers import ...
```

---

### 18. **Magic Numbers and Strings**

**Location:** Throughout codebase

**Issue:** Hardcoded status strings like `'akcept'`, `'pending'` used directly in code.

**Recommendation:** Use constants:

```python
# In models.py
STATUS_ACCEPTED = 'akcept'
STATUS_PENDING = 'pending'

# In views.py
if feedback.status == STATUS_ACCEPTED:
    # ...
```

---

### 19. **Missing Docstrings**

**Location:** All files

**Issue:** Classes and methods lack docstrings.

**Recommendation:** Add docstrings following Google or NumPy style.

---

### 20. **Inconsistent Naming Conventions**

**Location:** `models.py:165`

**Issue:** Model field named `form` in `Address` model is confusing (sounds like HTML form, but it's a ForeignKey to BasicData).

**Recommendation:** Use more descriptive name:

```python
basic_data = models.OneToOneField(BasicData, ...)
```

---

### 21. **Missing Type Hints**

**Location:** All Python files

**Issue:** No type hints for function parameters and return values.

**Recommendation:** Add type hints for better IDE support and documentation:

```python
from typing import Dict, Optional

def get(self, request, company_id: int) -> Response:
    # ...
```

---

### 22. **Dead Code in Models**

**Location:** `models.py:263`

**Issue:** Comment `# nie implementuje: CarData` suggests incomplete implementation.

**Recommendation:** Either implement or remove the comment.

---

### 23. **Missing Validation in Serializers**

**Location:** `serializers.py:36-68` (CompanyRegistrationSerializer)

**Issue:** Token validation doesn't check if invitation is expired.

**Recommendation:**

```python
def validate_token(self, value):
    try:
        invitation = CompanyInvitation.objects.get(token=value, is_accepted=False)
        if invitation.is_expired():
            raise serializers.ValidationError("Invitation has expired")
    except CompanyInvitation.DoesNotExist:
        raise serializers.ValidationError("Invalid or expired token")
    return invitation
```

---

### 24. **Inconsistent URL Naming**

**Location:** `urls.py`

**Issue:** Some URLs have names, others don't. Inconsistent pattern.

**Recommendation:** Add names to all URL patterns for reverse URL lookup.

---

### 25. **Missing Logging**

**Location:** Throughout `views.py`

**Issue:** No logging for important operations (company creation, form submissions, etc.).

**Recommendation:** Add logging:

```python
import logging
logger = logging.getLogger(__name__)

logger.info(f"Company {company.name} created by {request.user}")
```

---

## 📊 Summary Statistics

- **Critical Issues:** 3
- **High Priority Issues:** 4
- **Medium Priority Issues:** 12
- **Low Priority Issues:** 10
- **Total Issues Found:** 29

---

## ✅ Positive Aspects

1. **Good use of DRF serializers** for API responses
2. **Proper use of related_name** in most ForeignKey relationships
3. **Multi-language support** in invitation system
4. **Structured form stages** with clear separation of concerns
5. **Use of UUID for invitation tokens** (good for security)

---

## 🎯 Recommended Action Plan

### Immediate (Before Deployment):

1. ✅ Add missing `Form` model definition
2. ✅ **COMPLETED** - Fix model name typos (`Adress` → `Address`, `ExtendedEqupment` → `ExtendedEquipment`)
3. ✅ **COMPLETED** - Remove `@csrf_exempt` or add proper authentication (views converted to APIViews)
4. ⚠️ Replace bare `except:` clauses with specific exception handling (still needs work)

### Short-term (Next Sprint):

5. Add proper error handling and logging
6. Add transaction management to nested serializers
7. Add permission checks to all endpoints
8. Standardize error response format

### Long-term (Technical Debt):

9. Add type hints throughout
10. Add comprehensive docstrings
11. Add database indexes for performance
12. Refactor hardcoded values to configuration
13. Add unit tests for all views and serializers

---

## 📝 Notes

- Consider using Django REST Framework ViewSets instead of function-based views for better consistency
- Consider adding API versioning if this will be a long-term project
- Consider adding rate limiting for public endpoints
- Consider adding request/response logging middleware for debugging
