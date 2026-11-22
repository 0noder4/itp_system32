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
    BasicData,
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
            staff_roles=["fr"],
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


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class StageDraftTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="draft-fr",
            email="draft-fr@example.com",
            password="TestPass123!",
            type="staff",
            staff_roles=["fr"],
            language="pl",
        )
        self.company_user = User.objects.create_user(
            username="Draft Company",
            email="draft-co@example.com",
            password="TestPass123!",
            type="company",
        )
        self.company = Company.objects.create(
            name="Draft Company",
            email="draft-co@example.com",
            representative=self.company_user,
            fr_resp=self.staff,
            status="basic",
        )
        Form.objects.get_or_create(company=self.company)

    def _stage1_payload(self, **overrides):
        payload = {
            "basic_data": {
                **STAGE_1_PAYLOAD["basic_data"],
                "company": self.company.id,
                "full_name": "Draft Partial",
            },
            "address": STAGE_1_PAYLOAD["address"],
        }
        payload.update(overrides)
        return payload

    def test_draft_stage_1_saves_without_feedback_or_email(self):
        self.client.force_authenticate(self.company_user)
        response = self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/",
            {**self._stage1_payload(), "draft": True},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertTrue(BasicData.objects.filter(company=self.company).exists())
        self.assertFalse(
            Feedback.objects.filter(company=self.company, form="stage_1").exists()
        )
        self.assertEqual(len(mail.outbox), 0)

    def test_draft_stage_1_does_not_unlock_stage_2(self):
        self.client.force_authenticate(self.company_user)
        self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/",
            {**self._stage1_payload(), "draft": True},
            format="json",
        )
        response = self.client.post(
            f"/api/company/{self.company.id}/form/stage-2/",
            {"stand_details[stand_type]": "provided_stand", "draft": "true"},
            format="multipart",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("Stage 1 must be submitted", str(response.data))

    def test_submit_after_draft_creates_feedback_and_allows_stage_2(self):
        self.client.force_authenticate(self.company_user)
        self.client.post(
            f"/api/company/{self.company.id}/form/stage-1/",
            {**self._stage1_payload(), "draft": True},
            format="json",
        )
        mail.outbox.clear()
        response = self.client.patch(
            f"/api/company/{self.company.id}/form/stage-1/",
            self._stage1_payload(),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(
            Feedback.objects.filter(
                company=self.company, form="stage_1", status="pending"
            ).exists()
        )
        self.assertEqual(len(mail.outbox), 1)

        stage2 = self.client.post(
            f"/api/company/{self.company.id}/form/stage-2/",
            {
                "stand_details[stand_type]": "provided_stand",
                "stand_details[name_sign_text]": "Fryz",
                "draft": "true",
            },
            format="multipart",
        )
        # Draft stage 2 allowed once stage 1 has Feedback; logo optional on draft
        self.assertEqual(stage2.status_code, status.HTTP_201_CREATED, stage2.data)
        self.assertFalse(
            Feedback.objects.filter(company=self.company, form="stage_2").exists()
        )


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
            staff_roles=["fr"],
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
            staff_roles=["fr"],
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


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SendStageReminderApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="stage-admin",
            email="stage-admin@example.com",
            password="TestPass123!",
            type="admin",
        )
        self.staff = User.objects.create_user(
            username="stage-staff",
            email="stage-staff@example.com",
            password="TestPass123!",
            type="staff",
            staff_roles=["fr"],
        )
        self.company_user = User.objects.create_user(
            username="Stage Co",
            email="stage-co@example.com",
            password="TestPass123!",
            type="company",
        )
        self.company = Company.objects.create(
            name="Stage Co",
            email="stage-co@example.com",
            representative=self.company_user,
            fr_resp=self.staff,
        )
        self.done_user = User.objects.create_user(
            username="Done Co",
            email="done-co@example.com",
            password="TestPass123!",
            type="company",
        )
        self.done_company = Company.objects.create(
            name="Done Co",
            email="done-co@example.com",
            representative=self.done_user,
            fr_resp=self.staff,
        )
        BasicData.objects.create(
            company=self.done_company,
            full_name="Done Co Sp. z o.o.",
            nip="1234567890",
        )

    def test_filters_company_ids_and_skips_completed(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/companies/send-stage-reminders/",
            {"stage": 1, "company_ids": [self.company.id, self.done_company.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["emails_sent"], 1)
        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["stage-co@example.com"])

    def test_requires_company_ids(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/companies/send-stage-reminders/",
            {"stage": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_staff_allowed_company_forbidden(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/api/companies/send-stage-reminders/",
            {"stage": 1, "company_ids": [self.company.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        self.client.force_authenticate(self.company_user)
        response = self.client.post(
            "/api/companies/send-stage-reminders/",
            {"stage": 1, "company_ids": [self.company.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SendInvitationRemindersApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="inv-rem-staff",
            email="inv-rem-staff@example.com",
            password="TestPass123!",
            type="staff",
            staff_roles=["fr"],
            language="pl",
        )
        self.company_user = User.objects.create_user(
            username="inv-rem-company",
            email="inv-rem-company@example.com",
            password="TestPass123!",
            type="company",
        )

    def _invitation(self, days_before, **kwargs):
        today = today_in_invitation_tz()
        expires = datetime.combine(
            today + timedelta(days=days_before),
            time(12, 0),
            tzinfo=INVITATION_REMINDER_TZ,
        )
        defaults = {
            "email": "invitee-api@example.com",
            "company_name": "API Inv Co",
            "language": "pl",
            "created_by": self.staff,
            "expires_at": expires,
        }
        defaults.update(kwargs)
        return CompanyInvitation.objects.create(**defaults)

    def test_sends_and_records_registry(self):
        invitation = self._invitation(2)
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/api/invitations/send-reminders/",
            {"invitation_ids": [invitation.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["emails_sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["invitee-api@example.com"])
        self.assertTrue(
            InvitationExpiryReminderSent.objects.filter(
                invitation=invitation,
                days_before=2,
                recipient=InvitationExpiryReminderSent.RECIPIENT_EXHIBITOR,
            ).exists()
        )

        mail.outbox.clear()
        response = self.client.post(
            "/api/invitations/send-reminders/",
            {"invitation_ids": [invitation.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["emails_sent"], 0)
        self.assertEqual(response.data["skipped"], 1)
        self.assertEqual(len(mail.outbox), 0)

    def test_skips_accepted_cancelled_expired(self):
        accepted = self._invitation(2, is_accepted=True, company_name="Acc", email="a@example.com")
        cancelled = self._invitation(
            2, is_cancelled=True, company_name="Can", email="c@example.com"
        )
        expired = self._invitation(
            2,
            company_name="Exp",
            email="e@example.com",
            expires_at=timezone.now() - timedelta(days=1),
        )
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/api/invitations/send-reminders/",
            {"invitation_ids": [accepted.id, cancelled.id, expired.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["emails_sent"], 0)
        self.assertEqual(response.data["skipped"], 3)
        self.assertEqual(len(mail.outbox), 0)

    def test_missing_email_skips_without_registry(self):
        invitation = self._invitation(2, email="")
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/api/invitations/send-reminders/",
            {"invitation_ids": [invitation.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["skipped"], 1)
        self.assertFalse(InvitationExpiryReminderSent.objects.exists())

    def test_days_before_zero_ok(self):
        today = today_in_invitation_tz()
        expires = datetime.combine(
            today,
            time(23, 59),
            tzinfo=INVITATION_REMINDER_TZ,
        )
        invitation = CompanyInvitation.objects.create(
            email="invitee-zero@example.com",
            company_name="Zero Day Co",
            language="pl",
            created_by=self.staff,
            expires_at=expires,
        )
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/api/invitations/send-reminders/",
            {"invitation_ids": [invitation.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["emails_sent"], 1)
        self.assertTrue(
            InvitationExpiryReminderSent.objects.filter(
                invitation=invitation,
                days_before=0,
                recipient=InvitationExpiryReminderSent.RECIPIENT_EXHIBITOR,
            ).exists()
        )

    def test_company_forbidden(self):
        invitation = self._invitation(2)
        self.client.force_authenticate(self.company_user)
        response = self.client.post(
            "/api/invitations/send-reminders/",
            {"invitation_ids": [invitation.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class ExportCSVApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="export-staff",
            email="export-staff@example.com",
            password="TestPass123!",
            type="staff",
            staff_roles=["fr"],
        )
        self.company_a = Company.objects.create(
            name="Alpha Export Co",
            email="alpha-export@example.com",
        )
        self.company_b = Company.objects.create(
            name="Beta Export Co",
            email="beta-export@example.com",
        )

    def test_get_requires_post_with_ids(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get("/api/export/csv/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_empty_ids_rejected(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/api/export/csv/",
            {"company_ids": []},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_post_exports_selected_companies_in_order(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post(
            "/api/export/csv/",
            {"company_ids": [self.company_b.id, self.company_a.id]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # utf-8-sig charset may prefix BOM on each streamed chunk
        content = b"".join(response.streaming_content).decode("utf-8").replace("\ufeff", "")
        lines = [line for line in content.strip().splitlines() if line.strip()]
        self.assertGreaterEqual(len(lines), 3, content)
        # CSV uses semicolon delimiter (Excel-friendly default in generator)
        data_ids = [line.split(";", 1)[0] for line in lines[1:]]
        self.assertEqual(
            data_ids[:2],
            [str(self.company_b.id), str(self.company_a.id)],
            content,
        )

    def test_companies_list_includes_stage_flags(self):
        Form.objects.create(company=self.company_a, stage_1_completed=True)
        self.client.force_authenticate(self.staff)
        response = self.client.get("/api/companies/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        company = next(c for c in response.data if c["id"] == self.company_a.id)
        self.assertTrue(company["stage_1_completed"])
        self.assertFalse(company["stage_2_completed"])

    def test_companies_list_includes_stage_statuses(self):
        Form.objects.create(company=self.company_a)
        BasicData.objects.create(
            company=self.company_a,
            full_name="Alpha Export Co Sp. z o.o.",
            nip="1234567890",
        )
        Feedback.objects.create(company=self.company_a, form="stage_1", status="pending")
        Feedback.objects.create(company=self.company_a, form="stage_1", status="rejected")
        self.client.force_authenticate(self.staff)
        response = self.client.get("/api/companies/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        company = next(c for c in response.data if c["id"] == self.company_a.id)
        self.assertEqual(
            company["stage_statuses"],
            {
                "stage_1": "rejected",
                "stage_2": "not_started",
                "stage_3": "unavailable",
                "stage_4": "not_started",
                "stage_5": "not_started",
            },
        )


class CompanyEndpointsPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user(
            username="perm-staff", email="s@example.com", password="x", type="staff",
            staff_roles=["fr"],
        )
        self.owner = User.objects.create_user(
            username="Owner Co", email="o@example.com", password="x", type="company"
        )
        self.other = User.objects.create_user(
            username="Other Co", email="other@example.com", password="x", type="company"
        )
        self.company = Company.objects.create(name="Owner Co", email="o@example.com", representative=self.owner)
        Company.objects.create(name="Other Co", email="other@example.com", representative=self.other)

    def test_company_user_cannot_list_companies(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get("/api/companies/").status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_list_companies(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get("/api/companies/").status_code, status.HTTP_200_OK)

    def test_company_user_reads_only_own_company(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(f"/api/company/{self.company.id}/").status_code, status.HTTP_200_OK)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/company/{self.company.id}/").status_code, status.HTTP_404_NOT_FOUND)

    def test_company_user_cannot_patch_company(self):
        self.client.force_authenticate(self.owner)
        response = self.client.patch(f"/api/company/{self.company.id}/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_tr_cannot_open_fr_panel_or_map(self):
        tr = User.objects.create_user(
            username="perm-tr", email="tr@example.com", password="x", type="staff", staff_roles=["tr"]
        )
        self.client.force_authenticate(tr)
        self.assertEqual(self.client.get("/api/companies/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/invitations/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/map-layout/repartition-options/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/staff/").status_code, status.HTTP_403_FORBIDDEN)

    def test_lg_can_read_companies_and_map_but_not_fr_panel(self):
        lg = User.objects.create_user(
            username="perm-lg", email="lg@example.com", password="x", type="staff", staff_roles=["lg"]
        )
        self.client.force_authenticate(lg)
        self.assertEqual(self.client.get("/api/companies/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get("/api/map-layout/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get("/api/invitations/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get("/api/staff/").status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_list_returns_only_fr(self):
        User.objects.create_user(
            username="perm-tr2", email="tr2@example.com", password="x", type="staff", staff_roles=["tr"]
        )
        self.client.force_authenticate(self.staff)
        names = {row["username"] for row in self.client.get("/api/staff/").data}
        self.assertIn("perm-staff", names)
        self.assertNotIn("perm-tr2", names)


class StageValidationAndPrivacyRegressionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="reg-owner",
            email="reg-owner@example.com",
            password="x",
            type="company",
        )
        self.fr = User.objects.create_user(
            username="reg-fr",
            email="reg-fr@best.pw.edu.pl",
            password="x",
            type="staff",
            staff_roles=["fr"],
        )
        self.opiekun = User.objects.create_user(
            username="reg-opiekun",
            email="reg-op@best.pw.edu.pl",
            password="x",
            type="staff",
            staff_roles=["opiekun"],
        )
        self.tr = User.objects.create_user(
            username="reg-tr",
            email="reg-tr@best.pw.edu.pl",
            password="x",
            type="staff",
            staff_roles=["tr"],
        )
        self.partner = Company.objects.create(
            name="Partner Test",
            email="partner-reg@example.com",
            status="partner",
            representative=self.owner,
            fr_resp=self.fr,
            opiekun=self.opiekun,
        )
        from companies.models import Form

        self.form = Form.objects.create(company=self.partner)
        Feedback.objects.create(company=self.partner, form="stage_1", status="accepted")
        Feedback.objects.create(company=self.partner, form="stage_2", status="accepted")

    def test_stage3_preferred_time_empty_string_is_coerced_to_none(self):
        self.client.force_authenticate(self.owner)
        resp = self.client.post(
            f"/api/company/{self.partner.id}/form/stage-3/",
            {
                "workshop": False,
                "title": "",
                "descr": "",
                "skills": "",
                "study_majors": "",
                "room_projector": False,
                "room_hdmi": False,
                "preferred_day": "",
                "preferred_time": "",
                "contact_phone": "",
                "facilitators": [],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.data)
        self.assertIsNone(resp.data["preferred_time"])

    def test_equipment_and_lunch_quantity_caps_reject_excess_values(self):
        from companies.models import EquipmentItem
        from companies.serializers import EquipmentSelectionSerializer, LunchSerializer

        item = EquipmentItem.objects.create(name_pl="Krzesło", name_en="Chair", price="50.00")
        bad_eq = EquipmentSelectionSerializer(data={"equipment_item_id": item.id, "quantity": 51})
        self.assertFalse(bad_eq.is_valid())
        self.assertIn("quantity", bad_eq.errors)

        ok_eq = EquipmentSelectionSerializer(data={"equipment_item_id": item.id, "quantity": 50})
        self.assertTrue(ok_eq.is_valid(), ok_eq.errors)

        bad_lunch = LunchSerializer(data={"day": "day1", "lunch_quantity": 101, "diet_info": ""})
        self.assertFalse(bad_lunch.is_valid())
        self.assertIn("lunch_quantity", bad_lunch.errors)

        ok_lunch = LunchSerializer(data={"day": "day1", "lunch_quantity": 100, "diet_info": ""})
        self.assertTrue(ok_lunch.is_valid(), ok_lunch.errors)

    def test_staff_list_role_opiekun_filters_and_hides_date_joined(self):
        self.client.force_authenticate(self.fr)
        resp = self.client.get("/api/staff/?role=opiekun")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        usernames = {row["username"] for row in resp.data}
        self.assertIn("reg-opiekun", usernames)
        self.assertNotIn("reg-tr", usernames)
        for row in resp.data:
            self.assertNotIn("date_joined", row)


class PricingAndOrderPdfTests(TestCase):
    def setUp(self):
        from companies.models import Settings

        self.client = APIClient()
        self.sys_settings = Settings.get_settings()
        self.owner = User.objects.create_user(
            username="price-owner",
            email="price-owner@example.com",
            password="x",
            type="company",
        )
        self.fr = User.objects.create_user(
            username="price-fr",
            email="price-fr@best.pw.edu.pl",
            password="x",
            type="staff",
            staff_roles=["fr"],
        )

    def test_pricing_engine_base_jobwall_and_lunch_quotas(self):
        from decimal import Decimal
        from companies.models import (
            EquipmentItem,
            EquipmentSelection,
            FinalData,
            Jobwall,
            Lunch,
            Stand,
            StandDetails,
        )
        from companies.pricing import (
            calculate_company_costs,
            calculate_jobwall_breakdown,
            get_free_lunches_per_day,
        )

        # Basic package across stand sizes and 1 vs 2 days (verified netto defaults + individual 12m2)
        expected = {
            ("podstawowy", 1): (Decimal("5950.00"), False),
            ("podstawowy", 2): (Decimal("10120.00"), False),
            ("standardowy", 1): (Decimal("8550.00"), False),
            ("standardowy", 2): (Decimal("14530.00"), False),
            ("rozszerzony", 1): (Decimal("10710.00"), False),
            ("rozszerzony", 2): (Decimal("18200.00"), False),
            ("12m2", 1): (Decimal("0.00"), True),
            ("12m2", 2): (Decimal("0.00"), True),
        }
        for (size, days), (exp_cost, exp_indiv) in expected.items():
            co = Company.objects.create(name=f"B-{size}-{days}", email=f"{size}{days}@ex.com", status="basic")
            Stand.objects.create(company=co, day="day1", stand_number="A1", stand_size=size)
            if days == 2:
                Stand.objects.create(company=co, day="day2", stand_number="A1", stand_size=size)
            summary = calculate_company_costs(co, self.sys_settings)
            self.assertEqual(summary["base_package"]["cost"], exp_cost, (size, days))
            self.assertEqual(summary["base_package"]["individual_pricing"], exp_indiv, (size, days))

        # Early vs late basic free jobwall offers & packs
        early_co = Company.objects.create(name="Early", email="early@ex.com", status="basic")
        Company.objects.filter(pk=early_co.pk).update(
            created_at=timezone.make_aware(datetime(2026, 12, 15, 12, 0))
        )
        early_co.refresh_from_db()
        self.assertEqual(calculate_jobwall_breakdown(early_co, 1, self.sys_settings)["free_count"], 1)
        self.assertEqual(calculate_jobwall_breakdown(early_co, 1, self.sys_settings)["cost"], Decimal("0.00"))
        self.assertEqual(calculate_jobwall_breakdown(early_co, 2, self.sys_settings)["cost"], Decimal("480.00"))
        self.assertEqual(calculate_jobwall_breakdown(early_co, 4, self.sys_settings)["cost"], Decimal("630.00"))

        late_co = Company.objects.create(name="Late", email="late@ex.com", status="basic")
        Company.objects.filter(pk=late_co.pk).update(
            created_at=timezone.make_aware(datetime(2027, 1, 10, 12, 0))
        )
        late_co.refresh_from_db()
        self.assertEqual(calculate_jobwall_breakdown(late_co, 1, self.sys_settings)["free_count"], 0)
        self.assertEqual(calculate_jobwall_breakdown(late_co, 1, self.sys_settings)["cost"], Decimal("480.00"))

        # Partner & Main quotas + itemized cost summary + endpoint
        partner = Company.objects.create(
            name="Partner P",
            email="partner-p@ex.com",
            status="partner",
            representative=self.owner,
        )
        main = Company.objects.create(name="Main M", email="main-m@ex.com", status="main")
        self.assertEqual(get_free_lunches_per_day(early_co, self.sys_settings), 2)
        self.assertEqual(get_free_lunches_per_day(partner, self.sys_settings), 6)
        self.assertEqual(get_free_lunches_per_day(main, self.sys_settings), 10)

        sd = StandDetails.objects.create(company=partner, stand_type="provided_stand")
        item = EquipmentItem.objects.create(name_pl="Lada", name_en="Counter", price="150.00", included_quantity=1)
        EquipmentSelection.objects.create(stand_details=sd, equipment_item=item, quantity=3)
        for idx in range(6):  # partner gets 4 free + 2 paid (480.00)
            Jobwall.objects.create(
                company=partner,
                name=f"Offer {idx}",
                form="s",
                workload="pelen",
                contract="uop",
                description="Opis",
                benefits="Benefity",
                requirements="Wymagania",
                url="https://example.com",
            )
        fd = FinalData.objects.create(company=partner)
        Lunch.objects.create(form=fd, day="day1", lunch_quantity=8)  # 6 free -> 2 paid
        expected_lunch = (Decimal(str(self.sys_settings.lunch_price)) * 2).quantize(Decimal("0.01"))
        expected_total = (Decimal("24880.00") + Decimal("300.00") + Decimal("480.00") + expected_lunch).quantize(
            Decimal("0.01")
        )

        self.client.force_authenticate(self.owner)
        resp = self.client.get(f"/api/company/{partner.id}/cost-summary/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.data)
        self.assertEqual(resp.data["base_package"]["cost"], "24880.00")
        self.assertEqual(resp.data["equipment"]["cost"], "300.00")
        self.assertEqual(resp.data["jobwall"]["cost"], "480.00")
        self.assertEqual(resp.data["lunches"]["cost"], f"{expected_lunch:.2f}")
        self.assertEqual(resp.data["total_cost"], f"{expected_total:.2f}")

        main_summary = calculate_company_costs(main, self.sys_settings)
        self.assertEqual(main_summary["base_package"]["cost"], Decimal("28120.00"))
        self.assertEqual(main_summary["jobwall"]["free_count"], 7)

    def test_stage4_rejects_excess_jobwalls_and_generates_valid_order_pdf(self):
        from companies.models import (
            Address,
            BasicData,
            Description,
            FinalData,
            Form,
            Jobwall,
            Lunch,
            PDI,
            Stand,
            StandDetails,
            Workshop,
        )
        from companies.pdf_generator import OrderSummaryPDFGenerator

        partner = Company.objects.create(
            name="PDF & JW Co",
            email="pdf@example.com",
            status="partner",
            representative=self.owner,
        )
        Form.objects.create(company=partner)
        bd = BasicData.objects.create(company=partner, full_name="PDF & JW Sp. z o.o.", nip="1234567890")
        Address.objects.create(
            form=bd,
            street="Mokotowska",
            home_number="1",
            city="Warszawa",
            country="Polska",
            postal_code="00-001",
        )
        Stand.objects.create(company=partner, day="day1", stand_number="P1", stand_size="rozszerzony")
        Stand.objects.create(company=partner, day="day2", stand_number="P1", stand_size="rozszerzony")
        StandDetails.objects.create(company=partner, stand_type="provided_stand", el_power_acknowledged=True)
        Workshop.objects.create(company=partner, workshop=False)
        Feedback.objects.create(company=partner, form="stage_1", status="accepted")
        Feedback.objects.create(company=partner, form="stage_2", status="accepted")
        Feedback.objects.create(company=partner, form="stage_3", status="accepted")

        # Partner has 4 free + 3 max extra = 7 max offers -> 8 must fail
        too_many_offers = [
            {
                "name": f"Dev {i}",
                "form": "s",
                "workload": "pelen",
                "contract": "uop",
                "description": "Opis",
                "benefits": "Benefity",
                "requirements": "Wymagania",
                "url": "https://example.com",
            }
            for i in range(8)
        ]
        self.client.force_authenticate(self.owner)
        rejected = self.client.post(
            f"/api/company/{partner.id}/form/stage-4/",
            {"jobwalls": too_many_offers, "description": {"descr": "Firma testowa"}},
            format="json",
        )
        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST, rejected.data)

        Description.objects.create(company=partner, descr="Opis firmy testowej")
        Jobwall.objects.create(
            company=partner,
            name="Python Engineer",
            form="s",
            workload="pelen",
            contract="uop",
            description="Opis",
            benefits="Benefity",
            requirements="Wymagania",
            url="https://example.com",
        )
        fd = FinalData.objects.create(company=partner, el_low_power=True)
        PDI.objects.create(form=fd, tickets_quantity=2)
        Lunch.objects.create(form=fd, day="day1", lunch_quantity=7)

        for lang in ("pl", "en"):
            pdf_buf = OrderSummaryPDFGenerator(partner, language=lang).generate()
            pdf_bytes = pdf_buf.getvalue()
            self.assertTrue(pdf_bytes.startswith(b"%PDF-"), f"Invalid PDF output for {lang}")
            self.assertGreater(len(pdf_bytes), 500)


class FAQApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.exhibitor = User.objects.create_user(
            username="faq-exh", email="faq-exh@example.com", password="x", type="company"
        )
        self.tr = User.objects.create_user(
            username="faq-tr", email="faq-tr@best.pw.edu.pl", password="x", type="staff", staff_roles=["tr"]
        )
        self.fr = User.objects.create_user(
            username="faq-fr", email="faq-fr@best.pw.edu.pl", password="x", type="staff", staff_roles=["fr"]
        )

    def test_faq_permissions_and_crud(self):
        from companies.models import FAQItem

        self.client.force_authenticate(self.exhibitor)
        initial = self.client.get("/api/faq/")
        self.assertEqual(initial.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(initial.data), 14)

        self.assertEqual(
            self.client.post(
                "/api/faq/",
                {"category": "general", "question_pl": "Q?", "answer_pl": "A."},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(self.tr)
        self.assertEqual(
            self.client.post(
                "/api/faq/",
                {"category": "general", "question_pl": "Q?", "answer_pl": "A."},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(self.fr)
        created = self.client.post(
            "/api/faq/",
            {
                "category": "workshops",
                "question_pl": "Pytanie testowe?",
                "answer_pl": "Odpowiedź testowa.",
                "question_en": "Test Q?",
                "answer_en": "Test A.",
                "is_active": False,
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        faq_id = created.data["id"]

        # Inactive entry hidden from exhibitor, visible to FR with ?include_inactive=1
        self.client.force_authenticate(self.exhibitor)
        exh_ids = {item["id"] for item in self.client.get("/api/faq/").data}
        self.assertNotIn(faq_id, exh_ids)

        self.client.force_authenticate(self.fr)
        fr_ids = {item["id"] for item in self.client.get("/api/faq/?include_inactive=1").data}
        self.assertIn(faq_id, fr_ids)

        patched = self.client.patch(
            f"/api/faq/{faq_id}/",
            {"is_active": True, "answer_pl": "Zaktualizowana odpowiedź."},
            format="json",
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK, patched.data)
        self.assertTrue(patched.data["is_active"])

        self.client.force_authenticate(self.exhibitor)
        exh_ids_after = {item["id"] for item in self.client.get("/api/faq/").data}
        self.assertIn(faq_id, exh_ids_after)

        self.client.force_authenticate(self.fr)
        deleted = self.client.delete(f"/api/faq/{faq_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(FAQItem.objects.filter(id=faq_id).exists())


class OrderSummaryPDFTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner_pl = User.objects.create_user(
            username="pdf-owner-pl",
            email="pdf-pl@example.com",
            password="x",
            type="company",
            language="pl",
            first_name="Jan",
            last_name="Kowalski",
            phone_number="+48 111 222 333",
        )
        self.owner_en = User.objects.create_user(
            username="pdf-owner-en",
            email="pdf-en@example.com",
            password="x",
            type="company",
            language="en",
        )
        self.fr_staff = User.objects.create_user(
            username="pdf-fr",
            email="pdf-fr@best.pw.edu.pl",
            password="x",
            type="staff",
            staff_roles=["fr"],
            language="pl",
            first_name="Marek",
            last_name="Mały",
        )
        self.lg_staff = User.objects.create_user(
            username="pdf-lg",
            email="pdf-lg@best.pw.edu.pl",
            password="x",
            type="staff",
            staff_roles=["lg"],
            language="pl",
        )

    def test_order_summary_pdf_filename_and_basic_company_access(self):
        from companies.models import (
            Address,
            BasicData,
            Description,
            Feedback,
            FinalData,
            Form,
            Lunch,
            PDI,
            Stand,
            StandDetails,
        )

        basic = Company.objects.create(
            name="Żółć & Co",
            email="zolc@example.com",
            status="basic",
            representative=self.owner_pl,
            fr_resp=self.fr_staff,
        )
        Form.objects.create(
            company=basic,
            stage_1_completed=True,
            stage_2_completed=True,
            stage_3_completed=False,
            stage_4_completed=True,
            stage_5_completed=True,
        )
        bd = BasicData.objects.create(company=basic, full_name="Żółć & Co Sp. z o.o.", nip="1234567890")
        Address.objects.create(
            form=bd,
            street="Mokotowska",
            home_number="1",
            apt_number="2",
            city="Warszawa",
            country="Polska",
            postal_code="00-001",
        )
        Stand.objects.create(company=basic, day="day1", stand_number="A1", stand_size="podstawowy")
        StandDetails.objects.create(company=basic, stand_type="provided_stand", el_power_acknowledged=True)
        Description.objects.create(company=basic, descr="Opis firmy")
        fd = FinalData.objects.create(company=basic, el_low_power=True, lunches_declined=True, no_other_delegates=True)
        PDI.objects.create(form=fd, tickets_quantity=1)
        Lunch.objects.create(form=fd, day="day1", lunch_quantity=0)

        for stage_num in (1, 2, 4, 5):
            Feedback.objects.create(company=basic, form=f"stage_{stage_num}", status="accepted")

        # Basic company representative (PL) can download despite stage_3_completed=False
        self.client.force_authenticate(self.owner_pl)
        resp_pl = self.client.get(f"/api/company/{basic.id}/order-summary-pdf/")
        self.assertEqual(resp_pl.status_code, status.HTTP_200_OK)
        self.assertTrue(resp_pl.content.startswith(b"%PDF-"))
        cd_pl = resp_pl["Content-Disposition"]
        self.assertIn('filename="podsumowanie_zamowienia_Zolc_Co.pdf"', cd_pl)
        self.assertIn("filename*=UTF-8''podsumowanie_zamowienia_%C5%BB%C3%B3%C5%82%C4%87_%26_Co.pdf", cd_pl)

        # FR staff can also download
        self.client.force_authenticate(self.fr_staff)
        resp_fr = self.client.get(f"/api/company/{basic.id}/order-summary-pdf/")
        self.assertEqual(resp_fr.status_code, status.HTTP_200_OK)

        # Non-FR staff cannot download
        self.client.force_authenticate(self.lg_staff)
        resp_lg = self.client.get(f"/api/company/{basic.id}/order-summary-pdf/")
        self.assertEqual(resp_lg.status_code, status.HTTP_403_FORBIDDEN)

        # EN filename check
        basic.representative = self.owner_en
        basic.save(update_fields=["representative"])
        self.client.force_authenticate(self.owner_en)
        resp_en = self.client.get(f"/api/company/{basic.id}/order-summary-pdf/")
        self.assertEqual(resp_en.status_code, status.HTTP_200_OK)
        cd_en = resp_en["Content-Disposition"]
        self.assertIn('filename="order_summary_Zolc_Co.pdf"', cd_en)
        self.assertIn("filename*=UTF-8''order_summary_%C5%BB%C3%B3%C5%82%C4%87_%26_Co.pdf", cd_en)

    def test_order_summary_pdf_generator_full_data_pl_and_en(self):
        import datetime
        from decimal import Decimal
        from companies.models import (
            Address,
            BasicData,
            Description,
            EquipmentItem,
            EquipmentSelection,
            Exhibitor,
            FinalData,
            Jobwall,
            Lunch,
            PDI,
            PDIAttendee,
            Stand,
            StandDetails,
            Workshop,
            WorkshopFacilitator,
        )
        from companies.pdf_generator import OrderSummaryPDFGenerator

        partner = Company.objects.create(
            name="Aires & Test",
            email="aires@example.com",
            status="partner",
            representative=self.owner_pl,
            fr_resp=self.fr_staff,
        )
        bd = BasicData.objects.create(company=partner, full_name="Aires & Test Sp. z o.o.", nip="1234567891")
        Address.objects.create(
            form=bd,
            street="Kapustna",
            home_number="9",
            apt_number="70",
            city="Warszawa",
            country="Polska",
            postal_code="06-666",
        )
        Stand.objects.create(company=partner, day="day1", stand_number="A6", stand_size="standardowy")
        Stand.objects.create(company=partner, day="day2", stand_number="A7b", stand_size="standardowy")
        sd = StandDetails.objects.create(
            company=partner,
            stand_type="self_construction",
            el_power_acknowledged=True,
            sc_details="2x3x1,5m",
            brought_equipment="Ekspres & laptop",
            carpet_choice="welur",
            carpet_color="V372",
        )
        chair = EquipmentItem.objects.create(
            name_en="Chair", name_pl="Krzesło", price=Decimal("50.00"), included_quantity=2
        )
        rack = EquipmentItem.objects.create(
            name_en="Brochure stand", name_pl="Stojak na ulotki", price=Decimal("200.00"), included_quantity=0
        )
        EquipmentSelection.objects.create(stand_details=sd, equipment_item=chair, quantity=2)
        EquipmentSelection.objects.create(stand_details=sd, equipment_item=rack, quantity=1)

        ws = Workshop.objects.create(
            company=partner,
            workshop=True,
            title="AI & Robotics",
            description="Budowa agentów & testowanie",
            preferred_day="day1",
            preferred_time=datetime.time(11, 30),
            skills="Python, ROS",
            study_majors="AiR, Informatyka",
            room_projector=True,
            room_hdmi=True,
            contact_phone="500600700",
        )
        WorkshopFacilitator.objects.create(
            workshop=ws, name="Anna", surname="Nowak", phone_number="500600700", description="Lead Engineer"
        )
        Description.objects.create(company=partner, descr="Fajna firma <test> & rozwój")
        for idx in (1, 2):
            Jobwall.objects.create(
                company=partner,
                name=f"Role {idx}",
                form="s",
                workload="pelen",
                contract="uop",
                description="Opis stanowiska",
                requirements="Wymagania",
                benefits="Benefity",
                url="https://example.com",
            )
        fd = FinalData.objects.create(
            company=partner,
            el_devices="Ekspres, TV",
            el_power="1800 W",
            el_low_power=False,
            lunches_declined=False,
            no_other_delegates=False,
            main_rep_name="Janusz",
            main_rep_surname="Kowalski",
            main_rep_phone="666 666 666",
            main_rep_attendance="day1",
            arrival_time_day1=datetime.time(6, 30),
            arrival_time_day2=datetime.time(8, 20),
        )
        Lunch.objects.create(form=fd, day="day1", lunch_quantity=7, diet_info="1 wege")
        Lunch.objects.create(form=fd, day="day2", lunch_quantity=4)
        pdi = PDI.objects.create(form=fd, tickets_quantity=2)
        PDIAttendee.objects.create(form=pdi, name="Ewa", surname="Lis", email="ewa@example.com", phone_number="123123123")
        Exhibitor.objects.create(form=pdi, name="Joe", surname="Doe", phone_number="676767676", attendance="day2")

        for lang in ("pl", "en"):
            pdf_buf = OrderSummaryPDFGenerator(partner, language=lang).generate()
            pdf_bytes = pdf_buf.getvalue()
            self.assertTrue(pdf_bytes.startswith(b"%PDF-"), f"Invalid PDF output for {lang}")
            self.assertGreater(len(pdf_bytes), 1500)
