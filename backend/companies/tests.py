from datetime import datetime, time, timedelta
from unittest.mock import patch

from django.core import mail
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from companies.models import (
    Company,
    CompanyInvitation,
    Feedback,
    Form,
    InvitationExpiryReminderSent,
    Settings,
)
from companies.notifications import INVITATION_REMINDER_TZ, today_in_invitation_tz
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


STAGE_1_PAYLOAD = {
    "basic_data": {
        "full_name": "Test Company Sp. z o.o.",
        "nip": "1234567890",
    },
    "address": {
        "street": "Testowa",
        "home_number": "1",
        "city": "Warszawa",
        "country": "Polska",
        "postal_code": "00-001",
    },
}


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class StagePendingFrEmailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="fr-staff",
            email="fr@example.com",
            password="TestPass123!",
            type="staff",
            language="pl",
        )
        self.company_user = User.objects.create_user(
            username="Mail Test Company",
            email="company@example.com",
            password="TestPass123!",
            type="company",
        )
        self.company = Company.objects.create(
            name="Mail Test Company",
            email="company@example.com",
            representative=self.company_user,
            fr_resp=self.staff,
        )
        settings_obj = Settings.get_settings()
        settings_obj.system_admin_email = "admin-contact@example.com"
        settings_obj.save()

    def _stage1_payload(self):
        return {
            "basic_data": {**STAGE_1_PAYLOAD["basic_data"], "company": self.company.id},
            "address": STAGE_1_PAYLOAD["address"],
        }

    def test_post_stage_1_sends_fr_email(self):
        self.client.force_authenticate(self.company_user)
        response = self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/",
            self._stage1_payload(),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["fr@example.com"])
        self.assertIn("oczekuje na akceptację", mail.outbox[0].subject)
        self.assertIn("admin-contact@example.com", mail.outbox[0].alternatives[0][0])
        self.assertIn("administratorem systemu", mail.outbox[0].alternatives[0][0])

    def test_second_patch_while_pending_does_not_resend(self):
        self.client.force_authenticate(self.company_user)
        self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/",
            self._stage1_payload(),
            format="json",
        )
        mail.outbox.clear()
        payload = self._stage1_payload()
        payload["basic_data"]["full_name"] = "Updated Name"
        response = self.client.patch(
            f"/api/company/{self.company.id}/form/stage-1/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_resubmit_after_accepted_sends_fr_email(self):
        self.client.force_authenticate(self.company_user)
        self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/",
            self._stage1_payload(),
            format="json",
        )
        Feedback.objects.filter(company=self.company, form="stage_1").update(status="accepted")
        Form.objects.filter(company=self.company).update(stage_1_completed=True)
        mail.outbox.clear()
        payload = self._stage1_payload()
        payload["basic_data"]["full_name"] = "Edited After Accept"
        response = self.client.patch(
            f"/api/company/{self.company.id}/form/stage-1/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_resubmit_after_rejected_sends_fr_email(self):
        self.client.force_authenticate(self.company_user)
        self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/",
            self._stage1_payload(),
            format="json",
        )
        Feedback.objects.filter(company=self.company, form="stage_1").update(status="rejected")
        mail.outbox.clear()
        payload = self._stage1_payload()
        payload["basic_data"]["full_name"] = "Corrected Name"
        response = self.client.patch(
            f"/api/company/{self.company.id}/form/stage-1/",
            payload,
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_review_pending_does_not_email_fr(self):
        self.client.force_authenticate(self.company_user)
        self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/",
            self._stage1_payload(),
            format="json",
        )
        mail.outbox.clear()
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/review/",
            {"status": "pending", "comment": ""},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_smtp_failure_does_not_fail_stage_save(self):
        self.client.force_authenticate(self.company_user)
        with patch(
            "companies.views.send_stage_pending_fr_email",
            side_effect=Exception("SMTP down"),
        ):
            response = self.client.post(
                f"/api/company/{self.company.id}/form/stage-1/",
                self._stage1_payload(),
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(Form.objects.filter(company=self.company).exists())

    def test_missing_fr_email_skips_send(self):
        self.staff.email = ""
        self.staff.save()
        self.client.force_authenticate(self.company_user)
        response = self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/",
            self._stage1_payload(),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(len(mail.outbox), 0)

    def test_failed_patch_after_accepted_keeps_stage_completed(self):
        self.client.force_authenticate(self.company_user)
        self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/",
            self._stage1_payload(),
            format="json",
        )
        Feedback.objects.filter(company=self.company, form="stage_1").update(status="accepted")
        Form.objects.filter(company=self.company).update(stage_1_completed=True)

        response = self.client.patch(
            f"/api/company/{self.company.id}/form/stage-1/",
            {"basic_data": {"nip": "x" * 21}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        form = Form.objects.get(company=self.company)
        self.assertTrue(form.stage_1_completed)
        feedback = Feedback.objects.get(company=self.company, form="stage_1")
        self.assertEqual(feedback.status, "accepted")


class InvitationSettingsValidationTests(TestCase):
    def test_count_zero_skips_slot_validation(self):
        settings_obj = Settings.get_settings()
        settings_obj.invitation_reminder_count = 0
        settings_obj.invitation_reminder_1_days = None
        settings_obj.full_clean()
        self.assertEqual(settings_obj.get_invitation_reminder_days(), [])

    def test_rejects_duplicate_slots(self):
        settings_obj = Settings.get_settings()
        settings_obj.invitation_reminder_count = 2
        settings_obj.invitation_reminder_1_days = 2
        settings_obj.invitation_reminder_2_days = 2
        with self.assertRaises(ValidationError):
            settings_obj.full_clean()

    def test_rejects_slot_equal_to_validity(self):
        settings_obj = Settings.get_settings()
        settings_obj.invitation_validity_days = 7
        settings_obj.invitation_reminder_count = 1
        settings_obj.invitation_reminder_1_days = 7
        with self.assertRaises(ValidationError):
            settings_obj.full_clean()

    def test_rejects_empty_required_slot(self):
        settings_obj = Settings.get_settings()
        settings_obj.invitation_reminder_count = 2
        settings_obj.invitation_reminder_1_days = 2
        settings_obj.invitation_reminder_2_days = None
        with self.assertRaises(ValidationError):
            settings_obj.full_clean()

    def test_rejects_slot_below_one(self):
        settings_obj = Settings.get_settings()
        settings_obj.invitation_validity_days = 7
        settings_obj.invitation_reminder_count = 1
        settings_obj.invitation_reminder_1_days = 0
        with self.assertRaises(ValidationError):
            settings_obj.full_clean()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class InvitationCreateValidityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="invite-create-staff",
            email="create-staff@example.com",
            password="TestPass123!",
            type="staff",
            language="pl",
        )
        self.settings_obj = Settings.get_settings()
        self.settings_obj.invitation_validity_days = 10
        self.settings_obj.general_contact_email = "general-contact@example.com"
        self.settings_obj.save()

    def test_create_uses_settings_validity_days(self):
        self.client.force_authenticate(self.staff)
        before = timezone.now()
        response = self.client.post(
            "/api/invite/",
            {
                "email": "new-invitee@example.com",
                "company_name": "Validity Co",
                "company_status": "basic",
                "language": "pl",
            },
            format="json",
        )
        after = timezone.now()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        invitation = CompanyInvitation.objects.get(email="new-invitee@example.com")
        self.assertGreaterEqual(invitation.expires_at, before + timedelta(days=10))
        self.assertLessEqual(invitation.expires_at, after + timedelta(days=10))

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("wygaśnie za 10 dni", mail.outbox[0].body)
        self.assertIn("general-contact@example.com", mail.outbox[0].alternatives[0][0])


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class InvitationExpiryReminderCommandTests(TestCase):
    def setUp(self):
        self.settings_obj = Settings.get_settings()
        self.settings_obj.invitation_validity_days = 7
        self.settings_obj.invitation_reminder_count = 2
        self.settings_obj.invitation_reminder_1_days = 2
        self.settings_obj.invitation_reminder_2_days = 1
        self.settings_obj.system_admin_email = "admin-contact@example.com"
        self.settings_obj.general_contact_email = "general-contact@example.com"
        self.settings_obj.save()
        self.staff = User.objects.create_user(
            username="invite-staff",
            email="staff@example.com",
            password="TestPass123!",
            type="staff",
            language="pl",
        )

    def _invitation(self, days_before, **kwargs):
        today = today_in_invitation_tz()
        expires = datetime.combine(
            today + timedelta(days=days_before),
            time(12, 0),
            tzinfo=INVITATION_REMINDER_TZ,
        )
        defaults = {
            "email": "invitee@example.com",
            "company_name": "Expiry Co",
            "language": "pl",
            "created_by": self.staff,
            "expires_at": expires,
        }
        defaults.update(kwargs)
        return CompanyInvitation.objects.create(**defaults)

    def test_sends_two_emails_and_is_idempotent(self):
        invitation = self._invitation(2)
        call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 2)
        recipients = {mail.outbox[0].to[0], mail.outbox[1].to[0]}
        self.assertEqual(recipients, {"invitee@example.com", "staff@example.com"})
        html_bodies = {msg.alternatives[0][0] for msg in mail.outbox}
        self.assertTrue(any("general-contact@example.com" in body for body in html_bodies))
        self.assertTrue(any("admin-contact@example.com" in body for body in html_bodies))
        self.assertEqual(
            InvitationExpiryReminderSent.objects.filter(
                invitation=invitation, days_before=2
            ).count(),
            2,
        )
        self.assertTrue(
            InvitationExpiryReminderSent.objects.filter(
                invitation=invitation,
                days_before=2,
                recipient=InvitationExpiryReminderSent.RECIPIENT_EXHIBITOR,
            ).exists()
        )
        self.assertTrue(
            InvitationExpiryReminderSent.objects.filter(
                invitation=invitation,
                days_before=2,
                recipient=InvitationExpiryReminderSent.RECIPIENT_STAFF,
            ).exists()
        )
        mail.outbox.clear()
        call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 0)

    def test_count_zero_sends_nothing(self):
        self._invitation(2)
        self.settings_obj.invitation_reminder_count = 0
        self.settings_obj.save()
        call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_cancelled_and_expired(self):
        self._invitation(2, is_cancelled=True, company_name="Cancelled Co")
        self._invitation(
            2,
            company_name="Expired Co",
            email="expired@example.com",
            expires_at=timezone.now() - timedelta(days=1),
        )
        call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_accepted(self):
        self._invitation(2, is_accepted=True, company_name="Accepted Co")
        call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 0)

    def test_wrong_day_sends_nothing(self):
        # Expires in 3 days; configured slots are 2 and 1 → no match today.
        self._invitation(3)
        call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(InvitationExpiryReminderSent.objects.exists())

    def test_smtp_failure_does_not_mark_sent(self):
        invitation = self._invitation(2)
        with patch(
            "companies.management.commands.send_invitation_expiry_reminders"
            ".send_invitation_expiry_reminder_exhibitor",
            side_effect=Exception("SMTP down"),
        ):
            with self.assertRaises(CommandError):
                call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["staff@example.com"])
        self.assertFalse(
            InvitationExpiryReminderSent.objects.filter(
                invitation=invitation,
                days_before=2,
                recipient=InvitationExpiryReminderSent.RECIPIENT_EXHIBITOR,
            ).exists()
        )
        self.assertTrue(
            InvitationExpiryReminderSent.objects.filter(
                invitation=invitation,
                days_before=2,
                recipient=InvitationExpiryReminderSent.RECIPIENT_STAFF,
            ).exists()
        )

    def test_staff_failure_does_not_resend_exhibitor(self):
        invitation = self._invitation(2)
        with patch(
            "companies.management.commands.send_invitation_expiry_reminders"
            ".send_invitation_expiry_reminder_staff",
            side_effect=Exception("SMTP down"),
        ):
            with self.assertRaises(CommandError):
                call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["invitee@example.com"])
        self.assertTrue(
            InvitationExpiryReminderSent.objects.filter(
                invitation=invitation,
                days_before=2,
                recipient=InvitationExpiryReminderSent.RECIPIENT_EXHIBITOR,
            ).exists()
        )
        self.assertFalse(
            InvitationExpiryReminderSent.objects.filter(
                invitation=invitation,
                days_before=2,
                recipient=InvitationExpiryReminderSent.RECIPIENT_STAFF,
            ).exists()
        )
        mail.outbox.clear()
        call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["staff@example.com"])

    def test_missing_recipient_email_does_not_mark_sent(self):
        invitation = self._invitation(2, email="")
        self.staff.email = ""
        self.staff.save()
        call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(InvitationExpiryReminderSent.objects.exists())
        # Later, when emails exist, reminders can still be sent
        invitation.email = "invitee@example.com"
        invitation.save(update_fields=["email"])
        self.staff.email = "staff@example.com"
        self.staff.save(update_fields=["email"])
        call_command("send_invitation_expiry_reminders")
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(
            InvitationExpiryReminderSent.objects.filter(invitation=invitation).count(),
            2,
        )

