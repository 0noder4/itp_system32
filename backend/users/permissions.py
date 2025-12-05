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


class IsCompany(permissions.BasePermission):
    """
    Permission class to allow access only to company users.
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.type == 'company'

