from django.core.management.base import BaseCommand, CommandError

from companies.fire_cert_deadline import (
    already_auto_rejected_for_fire_cert,
    apply_missing_fire_cert_rejection,
    build_auto_reject_comment,
    companies_missing_fire_cert_queryset,
    fire_cert_upload_deadline,
    should_run_auto_reject_today,
)
from companies.models import Feedback, Settings
from companies.notifications import (
    _user_language,
    send_stage_rejected_email,
    today_in_invitation_tz,
)


class Command(BaseCommand):
    help = (
        "Auto-reject stage 2 for self-construction stands missing a fire certificate "
        "starting 6 weeks before day 1 (upload deadline: 4 weeks before day 1)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Run even outside the 6-weeks-before window (for manual/ops use).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List companies that would be rejected without changing data.",
        )

    def handle(self, *args, **options):
        settings_obj = Settings.get_settings()
        day1 = settings_obj.day1_date
        today = today_in_invitation_tz()

        if day1 is None:
            self.stdout.write(
                self.style.WARNING("Settings.day1_date is not set; skipping.")
            )
            return

        if not options["force"] and not should_run_auto_reject_today(day1, today):
            self.stdout.write(
                self.style.WARNING(
                    f"Outside auto-reject window (today={today}, day1={day1}). "
                    "Use --force to run anyway."
                )
            )
            return

        deadline = fire_cert_upload_deadline(day1)
        rejected = 0
        skipped = 0
        errors = 0

        for stand in companies_missing_fire_cert_queryset():
            company = stand.company
            feedback = (
                Feedback.objects.filter(company=company, form="stage_2")
                .order_by("-id")
                .first()
            )
            # Only stages that were submitted (pending/accepted). Drafts have no feedback.
            if feedback is None or feedback.status not in ("pending", "accepted"):
                skipped += 1
                continue
            if already_auto_rejected_for_fire_cert(feedback):
                skipped += 1
                continue

            language = _user_language(
                company.representative, fallback="pl"
            ) if company.representative else "pl"
            comment = build_auto_reject_comment(deadline, language=language)

            if options["dry_run"]:
                self.stdout.write(
                    f"DRY-RUN would reject stage 2 for company id={company.id} "
                    f"name={company.name!r}"
                )
                rejected += 1
                continue

            try:
                apply_missing_fire_cert_rejection(company, comment)
                try:
                    send_stage_rejected_email(company, 2, comment)
                except Exception as exc:
                    self.stderr.write(
                        f"Rejected company {company.id} but email failed: {exc}"
                    )
                rejected += 1
            except Exception as exc:
                errors += 1
                self.stderr.write(
                    f"Failed auto-reject for company {company.id}: {exc}"
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Fire-cert auto-reject: rejected={rejected} skipped={skipped} "
                f"errors={errors} deadline={deadline}"
            )
        )
        if errors:
            raise CommandError(
                f"Fire-cert auto-reject finished with errors={errors}"
            )
