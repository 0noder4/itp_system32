"""Calendar dates for MAIL #1–#5, shown on sheet group headers and in column help."""
from __future__ import annotations

import re
from datetime import date, datetime

from companies.models import Settings

DEFAULT_MAIL_SEND_BY = {
    1: date(2027, 2, 25),
    2: date(2027, 2, 27),
    3: date(2027, 3, 3),
    4: date(2027, 3, 5),
    5: date(2027, 3, 9),
}

_MAIL_GROUP = re.compile(r'^MAIL #([1-5])$')
_MAIL_TOKEN = re.compile(r'\{\{m([1-5])\}\}')


def mail_send_dates() -> dict[int, date]:
    settings_obj = Settings.get_settings()
    dates: dict[int, date] = {}
    for number, fallback in DEFAULT_MAIL_SEND_BY.items():
        value = getattr(settings_obj, f'mail_{number}_send_by', None)
        dates[number] = value or fallback
    return dates


def mail_send_labels() -> dict[int, str]:
    return {number: value.strftime('%d.%m') for number, value in mail_send_dates().items()}


def decorate_mail_group(group: str, labels: dict[int, str]) -> str:
    match = _MAIL_GROUP.match(group or '')
    if match is None:
        return group
    number = int(match.group(1))
    stamp = labels.get(number) or ''
    if not stamp:
        return group
    if number == 5:
        return f'{group} · {stamp}'
    return f'{group} · do {stamp}'


def decorate_mail_help(help_text: str, labels: dict[int, str]) -> str:
    if not help_text or '{{m' not in help_text:
        return help_text

    def repl(match: re.Match) -> str:
        return labels.get(int(match.group(1)), '')

    return _MAIL_TOKEN.sub(repl, help_text)


def deadlines_payload() -> dict:
    dates = mail_send_dates()
    return {'dates': {str(number): value.isoformat() for number, value in dates.items()}}


def update_deadlines(raw) -> dict:
    if not isinstance(raw, dict):
        raise ValueError('Oczekiwano obiektu z datami.')
    dates = raw.get('dates')
    if not isinstance(dates, dict):
        raise ValueError('Oczekiwano dates (obiekt).')
    parsed: dict[int, date] = {}
    for number in range(1, 6):
        value = dates.get(str(number), dates.get(number))
        if not isinstance(value, str) or not value:
            raise ValueError(f'Brak daty dla maila {number}.')
        try:
            parsed[number] = datetime.strptime(value, '%Y-%m-%d').date()
        except ValueError as exc:
            raise ValueError(f'Nieprawidłowa data maila {number}.') from exc
        if parsed[number].year < 2000 or parsed[number].year > 2100:
            raise ValueError(f'Nieprawidłowa data maila {number}.')
    settings_obj = Settings.get_settings()
    for number, value in parsed.items():
        setattr(settings_obj, f'mail_{number}_send_by', value)
    settings_obj.save()
    return deadlines_payload()
