from django.shortcuts import render
from django.http import JsonResponse
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status

# Create your views here.

class HealthCheckView(APIView):
    """
    Health check endpoint for monitoring and container orchestration.
    """
    permission_classes = []

    def get(self, request):
        try:
            # Check database connection
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            db_status = "healthy"
        except Exception:
            db_status = "unhealthy"

        return Response(
            {
                "status": "healthy" if db_status == "healthy" else "degraded",
                "database": db_status,
            },
            status=status.HTTP_200_OK if db_status == "healthy" else status.HTTP_503_SERVICE_UNAVAILABLE,
        )

class CurrentUserView(APIView):
    """
    API endpoint to get current authenticated user information.
    This endpoint validates the JWT token and returns user data.
    Used by frontend to verify authentication and user type.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "user_type": user.type,
                "is_active": user.is_active,
            },
            status=status.HTTP_200_OK,
        )
