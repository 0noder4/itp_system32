from rest_framework import permissions


class IsAdminOrStaff(permissions.BasePermission):
    """
    Permission class to allow access only to admin or staff users.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.type in ['admin', 'staff']


class IsAdmin(permissions.BasePermission):
    """
    Permission class to allow access only to admin users.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.type == 'admin'


def user_has_staff_role(user, *roles: str) -> bool:
    return bool(user and getattr(user, "is_authenticated", False) and user.has_staff_role(*roles))


def HasStaffRole(*roles: str):
    """
    Permission factory: admin or staff holding at least one of `roles`.
    Usage: permission_classes = [IsAuthenticated, HasStaffRole('fr', 'lg')]
    """
    class _HasStaffRole(permissions.BasePermission):
        def has_permission(self, request, view):
            user = request.user
            if not user or not user.is_authenticated:
                return False
            return user.has_staff_role(*roles)

    _HasStaffRole.__name__ = f"HasStaffRole_{'_'.join(roles)}"
    return _HasStaffRole


class IsCompany(permissions.BasePermission):
    """
    Permission class to allow access only to company users.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.type == 'company'

