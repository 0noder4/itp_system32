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


class StaffRolesTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = "TestPass123!"

    def _user(self, username, type_, roles=None):
        return User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password=self.password,
            type=type_,
            staff_roles=roles or [],
        )

    def test_admin_has_all_roles(self):
        admin = self._user("admin1", "admin")
        self.assertEqual(admin.get_staff_roles(), {"fr", "lg", "tr", "opiekun"})

    def test_company_has_no_roles_even_if_set(self):
        company = self._user("firma1", "company", ["lg"])
        self.assertFalse(company.has_staff_role("lg"))

    def test_staff_unknown_roles_are_ignored(self):
        staff = self._user("staff1", "staff", ["tr", "bogus"])
        self.assertEqual(staff.get_staff_roles(), {"tr"})
        self.assertTrue(staff.has_staff_role("fr", "tr"))
        self.assertFalse(staff.has_staff_role("lg"))

    def test_login_and_validate_return_staff_roles(self):
        self._user("multi", "staff", ["opiekun", "fr"])
        response = self.client.post(
            "/api/token/", {"username": "multi", "password": self.password}, format="json"
        )
        self.assertEqual(response.data["staff_roles"], ["fr", "opiekun"])
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        validate = self.client.get("/api/token/validate/")
        self.assertEqual(validate.data["staff_roles"], ["fr", "opiekun"])


class StaffInvitationFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.password = "TestPass123!"
        self.fr = User.objects.create_user(
            username="fr-invite",
            email="fr-invite@example.com",
            password=self.password,
            type="staff",
            staff_roles=["fr"],
        )

    def test_fr_can_invite_opiekun_and_register(self):
        from django.core import mail
        from users.models import StaffInvitation

        self.client.force_authenticate(self.fr)
        create = self.client.post(
            "/api/staff-invite/",
            {"email": "new-opiekun@best.pw.edu.pl", "language": "pl"},
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        invite = StaffInvitation.objects.get(email="new-opiekun@best.pw.edu.pl")
        self.assertEqual(invite.role, "opiekun")

        self.client.force_authenticate(None)
        info = self.client.get("/api/register/", {"token": str(invite.token)})
        self.assertEqual(info.status_code, status.HTTP_200_OK)
        self.assertEqual(info.data["kind"], "staff")
        self.assertEqual(info.data["username"], "new-opiekun")
        self.assertEqual(info.data["email"], "new-opiekun@best.pw.edu.pl")

        register = self.client.post(
            "/api/register/",
            {
                "token": str(invite.token),
                "password": "StrongPass123!",
                "first_name": "Anna",
                "last_name": "Opiekun",
                "phone_number": "+48123456789",
            },
            format="json",
        )
        self.assertEqual(register.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email="new-opiekun@best.pw.edu.pl")
        self.assertEqual(user.type, "staff")
        self.assertEqual(user.get_staff_roles(), {"opiekun"})
        self.assertEqual(user.username, "new-opiekun")
        invite.refresh_from_db()
        self.assertTrue(invite.is_accepted)

    def test_opiekun_invite_requires_best_pw_edu_pl(self):
        self.client.force_authenticate(self.fr)
        bad = self.client.post(
            "/api/staff-invite/",
            {"email": "opiekun@gmail.com", "language": "pl"},
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", bad.data)

    def test_opiekun_can_read_companies_and_map_but_not_patch_map(self):
        opiekun = User.objects.create_user(
            username="op-map",
            email="op-map@example.com",
            password=self.password,
            type="staff",
            staff_roles=["opiekun"],
        )
        self.client.force_authenticate(opiekun)
        self.assertEqual(self.client.get("/api/companies/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get("/api/map-layout/").status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.patch("/api/map-layout/", {"sync_days": True}, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )
