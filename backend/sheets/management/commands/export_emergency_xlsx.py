import os

from django.core.management.base import BaseCommand, CommandError

from sheets.emergency_export import (
    export_emergency_xlsx,
    send_emergency_export_failure_alert,
)


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, '').strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


class Command(BaseCommand):
    help = 'Export all staff sheets to nightly emergency .xlsx files (4 team files + 1 combined workbook).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--output-dir',
            default=os.getenv('EMERGENCY_EXPORT_DIR', '/backups/exports'),
            help='Directory where timestamped export folders are written.',
        )
        parser.add_argument(
            '--retention-days',
            type=int,
            default=_env_int('EXPORT_RETENTION_DAYS', 7),
            help='Retention days for regular nightly exports (default: 7).',
        )
        parser.add_argument(
            '--tagged-retention-days',
            type=int,
            default=_env_int('BACKUP_RETENTION_DAYS', 30),
            help='Retention days for tagged exports such as pre-deploy (default: 30).',
        )
        parser.add_argument(
            '--tag',
            default='',
            help='Optional tag suffix added to export directory name (e.g. pre-deploy).',
        )
        parser.add_argument(
            '--no-email-alert',
            action='store_true',
            help='Disable sending email alert on export failure.',
        )

    def handle(self, *args, **options):
        output_dir = options['output_dir']
        retention_days = options['retention_days']
        tagged_retention_days = options['tagged_retention_days']
        tag = options['tag']

        try:
            target_dir = export_emergency_xlsx(
                output_dir,
                retention_days=retention_days,
                tagged_retention_days=tagged_retention_days,
                tag=tag,
            )
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f'Emergency .xlsx export failed: {exc}'))
            if not options['no_email_alert']:
                try:
                    send_emergency_export_failure_alert(exc, output_dir)
                except Exception as mail_exc:
                    self.stderr.write(
                        self.style.WARNING(f'Failed to send export failure alert email: {mail_exc}')
                    )
            raise CommandError(f'Emergency .xlsx export failed: {exc}') from exc

        files = sorted(p.name for p in target_dir.iterdir() if p.is_file())
        self.stdout.write(
            self.style.SUCCESS(f'Emergency .xlsx export saved to {target_dir} ({", ".join(files)})')
        )
