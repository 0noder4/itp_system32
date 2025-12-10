from django.shortcuts import render
from django.http import JsonResponse
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from .serializers import (
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer
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


class PasswordResetRequestView(APIView):
    """
    API endpoint to request password reset.
    Accepts email and sends reset link to user.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        if serializer.is_valid():
            result = serializer.save()
            return Response(result, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PasswordResetConfirmView(APIView):
    """
    API endpoint to confirm password reset.
    GET: Validate token and return user info
    POST: Accepts token and new password
    """
    permission_classes = [AllowAny]

    def get(self, request):
        """Validate token and return user info"""
        from users.models import PasswordResetRequest
        import uuid

        token = request.query_params.get("token")
        if not token:
            return Response(
                {"token": ["Token query parameter is required."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate UUID format before querying database
        try:
            token_uuid = uuid.UUID(token)
        except (ValueError, TypeError):
            return Response(
                {"token": ["Invalid token format."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            reset_request = PasswordResetRequest.objects.get(token=token_uuid, is_used=False)
            if not reset_request.is_valid():
                if reset_request.is_expired():
                    return Response(
                        {"detail": "Token has expired."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return Response(
                    {"detail": "Token has already been used."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except PasswordResetRequest.DoesNotExist:
            return Response(
                {"detail": "Invalid or expired token."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "email": reset_request.user.email,
                "username": reset_request.user.username,
                "expires_at": reset_request.expires_at,
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request):
        """Reset password with token"""
        # Get token from request body or query params
        token = request.data.get("token") or request.query_params.get("token")
        
        # Prepare data for serializer
        data = request.data.copy()
        if token:
            data["token"] = token

        serializer = PasswordResetConfirmSerializer(data=data)
        if serializer.is_valid():
            result = serializer.save()
            return Response(result, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
