"""Fire-certificate deadline helpers for self-construction stands.

Upload deadline: day1 − 4 weeks.
Auto-reject window starts: day1 − 6 weeks (if certificate still missing).
"""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Q

from companies.models import Feedback, Form, StandDetails
from companies.notifications import today_in_invitation_tz

AUTO_FIRE_CERT_MARKER = "[auto:fire-cert-deadline]"


def public_feedback_comment(comment: str | None) -> str:
    """Strip internal auto-job markers before showing a comment to users."""
    text = comment or ""
    if AUTO_FIRE_CERT_MARKER in text:
        return text.replace(AUTO_FIRE_CERT_MARKER, "").strip()
    return text


def fire_cert_upload_deadline(day1: date) -> date:
    """Latest day to submit the fire certificate (exactly 4 weeks before day 1)."""
    return day1 - timedelta(weeks=4)


def fire_cert_auto_reject_start(day1: date) -> date:
    """First day when missing fire cert triggers auto-rejection (6 weeks before day 1)."""
    return day1 - timedelta(weeks=6)


def format_deadline_pl(deadline: date) -> str:
    return deadline.strftime("%d.%m.%Y")


def format_deadline_en(deadline: date) -> str:
    return deadline.strftime("%d %B %Y")


def build_auto_reject_comment(deadline: date, language: str = "pl") -> str:
    if language == "en":
        return (
            f"{AUTO_FIRE_CERT_MARKER} "
            f"Please upload the fire-resistance certificate no later than "
            f"{format_deadline_en(deadline)} "
            f"(4 weeks before the first day of the event)."
        )
    return (
        f"{AUTO_FIRE_CERT_MARKER} "
        f"Należy przesłać certyfikat niepalności najpóźniej do "
        f"{format_deadline_pl(deadline)} "
        f"(4 tygodnie przed pierwszym dniem finału)."
    )


def has_fire_cert_file(stand: StandDetails) -> bool:
    return bool(stand.fire_cert and getattr(stand.fire_cert, "name", ""))


def should_run_auto_reject_today(day1: date | None, today: date | None = None) -> bool:
    if day1 is None:
        return False
    if today is None:
        today = today_in_invitation_tz()
    start = fire_cert_auto_reject_start(day1)
    return start <= today < day1


def companies_missing_fire_cert_queryset():
    """Self-construction stands without a fire certificate file."""
    return (
        StandDetails.objects.filter(stand_type="self_construction")
        .filter(Q(fire_cert="") | Q(fire_cert__isnull=True))
        .select_related("company", "company__representative", "company__form")
    )


def already_auto_rejected_for_fire_cert(feedback: Feedback | None) -> bool:
    if feedback is None:
        return False
    return (
        feedback.status == "rejected"
        and AUTO_FIRE_CERT_MARKER in (feedback.comment or "")
    )


def apply_missing_fire_cert_rejection(company, comment: str) -> Feedback:
    """Set stage 2 to rejected and clear completion flag. Does not send email."""
    feedback, _created = Feedback.objects.update_or_create(
        company=company,
        form="stage_2",
        defaults={
            "status": "rejected",
            "comment": comment,
        },
    )
    form = Form.objects.filter(company=company).first()
    if form is not None:
        form.stage_2_completed = False
        form.save(update_fields=["stage_2_completed"])
    return feedback
