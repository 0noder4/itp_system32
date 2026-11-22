from zoneinfo import ZoneInfo

from django.utils import timezone, translation


WARSAW_TZ = ZoneInfo('Europe/Warsaw')


class AdminPolishLocaleMiddleware:
    """Activate Polish UI and Europe/Warsaw timezone for Django Admin requests only."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path.startswith('/admin'):
            translation.activate('pl')
            request.LANGUAGE_CODE = 'pl'
            timezone.activate(WARSAW_TZ)
            try:
                return self.get_response(request)
            finally:
                timezone.deactivate()
                translation.deactivate()
        return self.get_response(request)
