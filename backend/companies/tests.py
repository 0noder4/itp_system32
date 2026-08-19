from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from companies.models import CompanyInvitation
from companies.serializers import CompanyInvitationSerializer
from users.models import User


class CompanyInvitationEmailValidationTests(TestCase):
    def setUp(self):
        self.base_payload = {
            "email": "invitee@example.com",
            "company_name": "Example Company",
            "company_status": "basic",
            "language": "pl",
        }

    def _validate(self, payload):
        serializer = CompanyInvitationSerializer(data=payload)
        return serializer.is_valid(), serializer.errors

    def test_rejects_email_when_user_already_exists(self):
        User.objects.create_user(
            username="Existing Company",
            email="invitee@example.com",
            password="TestPass123!",
            type="company",
        )

        is_valid, errors = self._validate(self.base_payload)

        self.assertFalse(is_valid)
        self.assertIn("email", errors)

    def test_rejects_duplicate_active_invitation(self):
        CompanyInvitation.objects.create(
            email="invitee@example.com",
            company_name="Other Company",
        )

        is_valid, errors = self._validate(
            {**self.base_payload, "company_name": "Another Company"}
        )

        self.assertFalse(is_valid)
        self.assertIn("email", errors)

    def test_rejects_duplicate_invitation_case_insensitive(self):
        CompanyInvitation.objects.create(
            email="invitee@example.com",
            company_name="Other Company",
        )

        is_valid, errors = self._validate(
            {**self.base_payload, "email": "Invitee@Example.COM"}
        )

        self.assertFalse(is_valid)
        self.assertIn("email", errors)

    def test_allows_new_invitation_after_previous_expired(self):
        CompanyInvitation.objects.create(
            email="invitee@example.com",
            company_name="Old Company",
            expires_at=timezone.now() - timedelta(days=1),
        )

        is_valid, errors = self._validate(self.base_payload)

        self.assertTrue(is_valid, errors)

    def test_allows_new_invitation_after_previous_cancelled(self):
        CompanyInvitation.objects.create(
            email="invitee@example.com",
            company_name="Old Company",
            is_cancelled=True,
        )

        is_valid, errors = self._validate(self.base_payload)

        self.assertTrue(is_valid, errors)

    def test_allows_new_invitation_after_previous_accepted(self):
        CompanyInvitation.objects.create(
            email="invitee@example.com",
            company_name="Old Company",
            is_accepted=True,
        )

        is_valid, errors = self._validate(self.base_payload)

        self.assertTrue(is_valid, errors)
