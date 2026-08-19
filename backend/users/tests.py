from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


class TokenObtainPairLoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = "TestPass123!"
        self.user = User.objects.create_user(
            username="Test Company",
            email="company@example.com",
            password=self.password,
            type="company",
        )

    def _post_token(self, username, password=None):
        return self.client.post(
            "/api/token/",
            {"username": username, "password": password or self.password},
            format="json",
        )

    def test_login_with_username(self):
        response = self._post_token("Test Company")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["username"], "Test Company")

    def test_login_with_email(self):
        response = self._post_token("company@example.com")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertEqual(response.data["username"], "Test Company")

    def test_login_with_email_case_insensitive(self):
        response = self._post_token("Company@Example.COM")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_login_with_wrong_password(self):
        response = self._post_token("Test Company", password="wrong-password")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_with_unknown_email(self):
        response = self._post_token("unknown@example.com")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_with_ambiguous_email(self):
        User.objects.create_user(
            username="Another Company",
            email="duplicate@example.com",
            password=self.password,
            type="company",
        )
        User.objects.create_user(
            username="Third Company",
            email="duplicate@example.com",
            password=self.password,
            type="company",
        )
        response = self._post_token("duplicate@example.com")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
