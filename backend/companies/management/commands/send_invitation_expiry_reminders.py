from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError
from django.utils import timezone

from companies.models import CompanyInvitation, InvitationExpiryReminderSent, Settings
from companies.notifications import (
    invitation_calendar_date,
    send_invitation_expiry_reminder_exhibitor,
    send_invitation_expiry_reminder_staff,
    today_in_invitation_tz,
)


class Command(BaseCommand):
    help = "Send invitation expiry reminders based on Settings invitation reminder slots."

    def handle(self, *args, **options):
        settings_obj = Settings.get_settings()
        thresholds = settings_obj.get_invitation_reminder_days()
        if not thresholds:
            self.stdout.write(self.style.WARNING("Invitation expiry reminders disabled."))
            return

        today = today_in_invitation_tz()
        now = timezone.now()
        invitations = CompanyInvitation.objects.filter(
            is_accepted=False,
            is_cancelled=False,
            expires_at__gt=now,
        ).select_related("created_by")

        sent = 0
        skipped = 0
        errors = 0

        senders = (
            (
                InvitationExpiryReminderSent.RECIPIENT_EXHIBITOR,
                send_invitation_expiry_reminder_exhibitor,
            ),
            (
                InvitationExpiryReminderSent.RECIPIENT_STAFF,
                send_invitation_expiry_reminder_staff,
            ),
        )

        for invitation in invitations:
            expiry_date = invitation_calendar_date(invitation.expires_at)
            for days_before in thresholds:
                if expiry_date != today + timedelta(days=days_before):
                    continue
                for recipient, send_fn in senders:
                    if InvitationExpiryReminderSent.objects.filter(
                        invitation=invitation,
                        days_before=days_before,
                        recipient=recipient,
                    ).exists():
                        skipped += 1
                        continue
                    try:
                        was_sent = send_fn(invitation, days_before)
                        if not was_sent:
                            skipped += 1
                            continue
                        InvitationExpiryReminderSent.objects.create(
                            invitation=invitation,
                            days_before=days_before,
                            recipient=recipient,
                        )
                        sent += 1
                    except IntegrityError:
                        skipped += 1
                    except Exception as exc:
                        errors += 1
                        self.stderr.write(
                            f"Failed reminder for invitation {invitation.id} "
                            f"({days_before}d/{recipient}): {exc}"
                        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Invitation expiry reminders: sent={sent} skipped={skipped} errors={errors}"
            )
        )
        if errors:
            raise CommandError(
                f"Invitation expiry reminders finished with errors={errors}"
            )
