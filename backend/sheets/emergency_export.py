"""Nightly emergency .xlsx export for all staff sheets (4 per-team files + 1 combined workbook)."""
from __future__ import annotations

from datetime import datetime, timedelta
import logging
import os
from pathlib import Path
import re
import shutil
import traceback
import zipfile
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.mail import send_mail

from companies.models import Settings

from .definitions import CATALOG
from .map_export import build_map_sheet_entries
from .service import build_tab_payload, visible_columns
from .values import present
from .xlsx import build_xlsx_workbook

logger = logging.getLogger(__name__)

WARSAW_TZ = ZoneInfo('Europe/Warsaw')
DEFAULT_ADMIN_PLACEHOLDER = 'admin@example.com'

_GROUP_FILL = '#E5E7EB'
_HEADER_FILL = '#D1D5DB'
_SAFE_TAG_RE = re.compile(r'[^A-Za-z0-9_-]+')
_EXPORT_DIR_RE = re.compile(r'^(\d{8}_\d{6})(?:_(.+))?$')


class _SystemExportUser:
    """Synthetic admin-level user for full unattended workbook generation."""

    id = None
    type = 'admin'
    is_authenticated = True
    staff_roles = ()

    @staticmethod
    def has_staff_role(*_roles) -> bool:
        return True


def _sanitize_tag(tag: str) -> str:
    cleaned = _SAFE_TAG_RE.sub('-', (tag or '').strip()).strip('-_')
    return cleaned[:40]


def _combined_tab_name(sheet_key: str, sheet_title: str, tab_title: str) -> str:
    prefix = 'Opiekun' if sheet_key == 'opiekun' else sheet_title.split('–', 1)[0].strip()
    return f'{prefix} - {tab_title}'


def _build_tab_sheet_entry(sheet, tab, user, *, sheet_name: str) -> dict:
    payload = build_tab_payload(sheet, tab, user)
    defs = visible_columns(tab, user, sheet_key=sheet.key, include_hidden_custom=True)
    col_metas = payload['columns']
    width = len(defs)

    rows: list[list[str]] = []
    fills: list[list[str | None]] = []
    bold: list[list[bool]] = []

    has_groups = any(meta.get('group') for meta in col_metas)
    if has_groups:
        rows.append([str(meta.get('group') or '') for meta in col_metas])
        fills.append([_GROUP_FILL] * width)
        bold.append([True] * width)
        freeze_rows = 2
    else:
        freeze_rows = 1

    rows.append([str(meta.get('label') or '') for meta in col_metas])
    fills.append([_HEADER_FILL] * width)
    bold.append([True] * width)

    cell_styles = payload.get('cell_styles') or {}
    for row in payload['rows']:
        row_id = row['company_id']
        cells = row['cells']
        rows.append([present(col, cells.get(col.key)) for col in defs])
        fills.append([cell_styles.get(f'{row_id}|{col.key}') for col in defs])
        bold.append([False] * width)

    col_widths = [
        max(
            10.0,
            min(
                50.0,
                max(
                    round(col.width / 7.5, 2),
                    max((len(line) for line in col.label.splitlines()), default=0) + 4.0,
                ),
            ),
        )
        for col in defs
    ]
    freeze_cols = min(tab.frozen_columns, width)
    return {
        'name': sheet_name,
        'rows': rows,
        'fills': fills,
        'bold': bold,
        'col_widths': col_widths,
        'freeze_rows': freeze_rows,
        'freeze_cols': freeze_cols,
    }


def build_emergency_xlsx_files() -> dict[str, bytes]:
    """Generate 4 per-sheet .xlsx files, hall map .xlsx, plus 1 combined workbook."""
    user = _SystemExportUser()
    files: dict[str, bytes] = {}
    combined_tabs: list[dict] = []

    for sheet in CATALOG.sheets.values():
        per_sheet_tabs: list[dict] = []
        for tab in sheet.tabs:
            tab_title = tab.resolve_title()
            per_sheet_tabs.append(
                _build_tab_sheet_entry(sheet, tab, user, sheet_name=tab_title)
            )
            combined_tabs.append(
                _build_tab_sheet_entry(
                    sheet,
                    tab,
                    user,
                    sheet_name=_combined_tab_name(sheet.key, sheet.title, tab_title),
                )
            )
        files[f'{sheet.key}.xlsx'] = build_xlsx_workbook(per_sheet_tabs)

    map_tabs = build_map_sheet_entries()
    files['mapa.xlsx'] = build_xlsx_workbook(map_tabs)
    for map_tab, combined_name in zip(map_tabs, ('Mapa - Wizualna', 'Mapa - Lista stoisk')):
        combined_tabs.append({**map_tab, 'name': combined_name})

    files['wszystkie-arkusze.xlsx'] = build_xlsx_workbook(combined_tabs)
    return files


def _cleanup_old_exports(
    root: Path,
    now: datetime,
    *,
    retention_days: int,
    tagged_retention_days: int,
) -> list[str]:
    removed: list[str] = []
    untagged_cutoff = now - timedelta(days=max(0, retention_days))
    tagged_cutoff = now - timedelta(days=max(0, tagged_retention_days))

    for entry in root.iterdir():
        if not entry.is_dir():
            continue
        match = _EXPORT_DIR_RE.match(entry.name)
        if not match:
            continue
        ts_part, suffix = match.groups()
        try:
            created_at = datetime.strptime(ts_part, '%Y%m%d_%H%M%S').replace(tzinfo=WARSAW_TZ)
        except ValueError:
            continue
        is_tagged = bool(suffix and not suffix.isdigit())
        cutoff = tagged_cutoff if is_tagged else untagged_cutoff
        if created_at < cutoff:
            shutil.rmtree(entry)
            removed.append(entry.name)
    return removed


def export_emergency_xlsx(
    output_dir: str | Path,
    *,
    retention_days: int = 7,
    tagged_retention_days: int = 30,
    tag: str = '',
) -> Path:
    """Write and verify all 5 emergency .xlsx files atomically, then prune expired directories."""
    root = Path(output_dir)
    root.mkdir(parents=True, exist_ok=True)

    now = datetime.now(WARSAW_TZ)
    base_name = now.strftime('%Y%m%d_%H%M%S')
    safe_tag = _sanitize_tag(tag)
    dir_name = f'{base_name}_{safe_tag}' if safe_tag else base_name

    target_dir = root / dir_name
    counter = 1
    while target_dir.exists():
        counter += 1
        suffix = f'{safe_tag}_{counter}' if safe_tag else str(counter)
        target_dir = root / f'{base_name}_{suffix}'

    tmp_dir = root / f'.tmp_{target_dir.name}'
    if tmp_dir.exists():
        shutil.rmtree(tmp_dir, ignore_errors=True)
    tmp_dir.mkdir(parents=True, exist_ok=False)

    try:
        files = build_emergency_xlsx_files()
        for filename, content in files.items():
            file_path = tmp_dir / filename
            file_path.write_bytes(content)
            with zipfile.ZipFile(file_path, 'r') as archive:
                bad_member = archive.testzip()
                if bad_member is not None:
                    raise ValueError(f'Corrupt .xlsx archive {filename}: bad member {bad_member}')
        os.replace(tmp_dir, target_dir)
    except Exception:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise

    _cleanup_old_exports(
        root,
        now,
        retention_days=retention_days,
        tagged_retention_days=tagged_retention_days,
    )
    return target_dir


def send_emergency_export_failure_alert(error: Exception, output_dir: str) -> bool:
    """Send an email alert to Settings.system_admin_email only when export fails."""
    recipient = (Settings.get_settings().get_system_admin_email() or '').strip()
    if not recipient or recipient.lower() == DEFAULT_ADMIN_PLACEHOLDER:
        logger.warning(
            'Skipping emergency export failure alert: Settings.system_admin_email is not configured (%r).',
            recipient,
        )
        return False

    timestamp = datetime.now(WARSAW_TZ).strftime('%Y-%m-%d %H:%M:%S %Z')
    tb = traceback.format_exc().strip()
    body_lines = [
        'Automatyczny nocny eksport arkuszy .xlsx zakończył się błędem.',
        '',
        f'Czas (Europe/Warsaw): {timestamp}',
        f'Katalog docelowy: {output_dir}',
        f'Błąd: {error}',
    ]
    if tb and tb != 'NoneType: None':
        body_lines.extend(['', 'Traceback:', tb])

    send_mail(
        subject='[ITP BACKUP ALERT] Błąd nocnego eksportu .xlsx',
        message='\n'.join(body_lines),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[recipient],
        fail_silently=False,
    )
    return True
