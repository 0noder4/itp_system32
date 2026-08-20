import logging
from textwrap import dedent
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from companies.models import Settings

logger = logging.getLogger(__name__)

INVITATION_REMINDER_TZ = ZoneInfo("Europe/Warsaw")

STAGE_NAMES = {
    1: {"en": "Stage 1: Basic Data", "pl": "Etap 1: Dane podstawowe"},
    2: {"en": "Stage 2: Equipment", "pl": "Etap 2: Wyposażenie"},
    3: {"en": "Stage 3: Workshops", "pl": "Etap 3: Warsztaty"},
    4: {"en": "Stage 4: Jobwall", "pl": "Etap 4: Jobwall"},
    5: {"en": "Stage 5: Final Data", "pl": "Etap 5: Dane końcowe"},
}


def _logo_url():
    return f"{settings.BACKEND_BASE_URL}{settings.STATIC_URL}images/ITP_LOGO_horizontal_black.png"


def _general_contact_email():
    return Settings.get_settings().get_general_contact_email()


def _system_admin_email():
    return Settings.get_settings().get_system_admin_email()


def _user_language(user, fallback="pl"):
    language = getattr(user, "language", fallback) or fallback
    if language not in ("en", "pl"):
        return fallback
    return language


def _send_html_email(subject, plain_message, template_name, context, to_email):
    html_content = render_to_string(template_name, context)
    email_message = EmailMultiAlternatives(
        subject=subject,
        body=plain_message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[to_email],
    )
    email_message.attach_alternative(html_content, "text/html")
    email_message.send(fail_silently=False)


def send_stage_pending_fr_email(company, stage_num, previous_status):
    fr_resp = company.fr_resp
    if not fr_resp or not fr_resp.email:
        logger.warning("No FR email found for company %s", company.id)
        return

    language = _user_language(fr_resp)
    stage_name = STAGE_NAMES.get(stage_num, {}).get(language, f"Stage {stage_num}")
    review_link = f"{settings.FRONTEND_BASE_URL}/panel/staff/companies/{company.id}"
    is_correction = previous_status in ("rejected", "accepted")
    admin_email = _system_admin_email()

    if language == "en":
        subject = f"Stage {stage_num} awaiting review - {company.name}"
        if is_correction:
            intro = (
                f"{company.name} updated {stage_name}. The stage is waiting for your review again."
            )
        else:
            intro = f"{company.name} submitted {stage_name}. The stage is waiting for your review."
        plain_message = dedent(
            f"""
            {intro}

            Open the staff panel to review the submission:
            {review_link}
            """
        ).strip()
    else:
        subject = f"Etap {stage_num} oczekuje na akceptację - {company.name}"
        if is_correction:
            intro = (
                f"{company.name} poprawiła {stage_name}. Etap ponownie oczekuje na Twoją akceptację."
            )
        else:
            intro = f"{company.name} przesłała {stage_name}. Etap oczekuje na Twoją akceptację."
        plain_message = dedent(
            f"""
            {intro}

            Otwórz panel staff, aby sprawdzić zgłoszenie:
            {review_link}
            """
        ).strip()

    _send_html_email(
        subject=subject,
        plain_message=plain_message,
        template_name=f"emails/stage_pending_fr_{language}.html",
        context={
            "company_name": company.name,
            "stage_name": stage_name,
            "is_correction": is_correction,
            "review_link": review_link,
            "logo_url": _logo_url(),
            "default_email": admin_email,
        },
        to_email=fr_resp.email,
    )


def invitation_calendar_date(dt):
    return timezone.localtime(dt, INVITATION_REMINDER_TZ).date()


def today_in_invitation_tz():
    return timezone.now().astimezone(INVITATION_REMINDER_TZ).date()


def send_invitation_expiry_reminder_exhibitor(invitation, days_before):
    if not invitation.email:
        logger.warning("No exhibitor email for invitation %s", invitation.id)
        return

    language = invitation.language if invitation.language in ("en", "pl") else "en"
    registration_link = (
        f"{settings.FRONTEND_BASE_URL}/auth/register?token={invitation.token}&lang={language}"
    )
    staff_email = invitation.created_by.email if invitation.created_by and invitation.created_by.email else None
    contact_email = _general_contact_email()

    if language == "pl":
        subject = f"Przypomnienie: zaproszenie wygasa za {days_before} dni - ITP System"
        plain_message = dedent(
            f"""
            Twoje zaproszenie do platformy wystawców Inżynierskich Targów Pracy wygasa za {days_before} dni.
            Twój login: {invitation.company_name}

            Dokończ rejestrację:
            {registration_link}
            """
        ).strip()
    else:
        subject = f"Reminder: invitation expires in {days_before} days - ITP System"
        plain_message = dedent(
            f"""
            Your invitation to the Engineering Job Fair exhibitor platform expires in {days_before} days.
            Your login: {invitation.company_name}

            Complete your registration:
            {registration_link}
            """
        ).strip()

    _send_html_email(
        subject=subject,
        plain_message=plain_message,
        template_name=f"emails/invitation_expiry_exhibitor_{language}.html",
        context={
            "company_name": invitation.company_name,
            "days_before": days_before,
            "registration_link": registration_link,
            "logo_url": _logo_url(),
            "staff_email": staff_email,
            "default_email": contact_email,
        },
        to_email=invitation.email,
    )


def send_invitation_expiry_reminder_staff(invitation, days_before):
    staff = invitation.created_by
    if not staff or not staff.email:
        logger.warning("No staff email for invitation %s", invitation.id)
        return

    language = _user_language(staff)
    invitation_link = f"{settings.FRONTEND_BASE_URL}/panel/staff/invitations/{invitation.id}"
    admin_email = _system_admin_email()

    if language == "pl":
        subject = f"Zaproszenie {invitation.company_name} wygasa za {days_before} dni"
        plain_message = dedent(
            f"""
            Zaproszenie dla {invitation.company_name} ({invitation.email}) wygasa za {days_before} dni i nie zostało jeszcze zaakceptowane.

            Szczegóły zaproszenia:
            {invitation_link}
            """
        ).strip()
    else:
        subject = f"Invitation for {invitation.company_name} expires in {days_before} days"
        plain_message = dedent(
            f"""
            The invitation for {invitation.company_name} ({invitation.email}) expires in {days_before} days and has not been accepted yet.

            Invitation details:
            {invitation_link}
            """
        ).strip()

    _send_html_email(
        subject=subject,
        plain_message=plain_message,
        template_name=f"emails/invitation_expiry_staff_{language}.html",
        context={
            "company_name": invitation.company_name,
            "invitee_email": invitation.email,
            "days_before": days_before,
            "invitation_link": invitation_link,
            "logo_url": _logo_url(),
            "default_email": admin_email,
        },
        to_email=staff.email,
    )
