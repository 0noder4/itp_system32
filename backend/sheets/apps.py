from django.apps import AppConfig


def _cleanup_deleted_cell_media(sender, instance, **kwargs):
    from django.db import transaction

    raw = getattr(instance, 'value', None)
    items = raw if isinstance(raw, list) else [raw] if isinstance(raw, dict) else []
    paths: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        path = item.get('path')
        if isinstance(path, str) and path.startswith('sheet_custom_media/') and '..' not in path:
            paths.append(path)
    if not paths:
        return

    def _delete_paths(to_delete=list(paths)):
        from django.core.files.storage import default_storage

        for path in to_delete:
            try:
                if default_storage.exists(path):
                    default_storage.delete(path)
            except Exception:
                pass

    transaction.on_commit(_delete_paths)


class SheetsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'sheets'
    verbose_name = 'Arkusze'

    def ready(self):
        from django.db.models.signals import post_delete

        from .models import SheetCellValue

        post_delete.connect(
            _cleanup_deleted_cell_media,
            sender=SheetCellValue,
            dispatch_uid='sheets_cleanup_deleted_cell_media',
        )
