# Zmienne środowiskowe `.env`

Dokument opisuje wszystkie zmienne z pliku `.env.example`, ich przeznaczenie oraz to, do których kontenerów/usług są przekazywane.

## Jak czytać ten dokument

- **Gdzie**: kontener/usługa, która dostaje zmienną (`db`, `backend`, `scheduler`, `frontend`, `backup`, `mailpit`).
- **Po co**: praktyczne znaczenie zmiennej.
- Wartości domyślne/fallbacki wynikają z kodu lub z definicji w `compose*.yml`.

## Przykładowy plik `.env` (dummy values)

Poniższy przykład można potraktować jako punkt startowy dla środowiska lokalnego/testowego.
Wartości są przykładowe i **nie nadają się na produkcję**.

```env
# PROJECT CONFIGURATION
PROJECT_NAME=system_32_demo
ENV=development
FRONTEND_VERSION=0.0
BACKEND_VERSION=0.0

# DOCKER REGISTRY CONFIGURATION (Production only)
DOCKER_REGISTRY=docker.io/example-user

# DJANGO CONFIGURATION
DJANGO_SECRET_KEY=dummy-secret-key-change-me
DEBUG=True
DJANGO_LOGLEVEL=info
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

# CSRF CONFIGURATION (Production only)
CSRF_TRUSTED_ORIGINS=

# CORS CONFIGURATION (Production only)
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# EMAIL CONFIGURATION
EMAIL_HOST=mailpit
EMAIL_PORT=1025
EMAIL_HOST_USER=dev
EMAIL_HOST_PASSWORD=dev
EMAIL_USE_SSL=
EMAIL_USE_TLS=
DEFAULT_FROM_EMAIL=noreply@example.local

# DATABASE CONFIGURATION
DATABASE_HOST=db
DATABASE_NAME=system_32_demo
DATABASE_USER=user_demo
DATABASE_PASSWORD=dummy_password
DATABASE_ROOT_PASSWORD=dummy_root_password
DATABASE_PORT=3306
DATABASE_ENGINE=mysql

# APPLICATION URLs
FRONTEND_BASE_URL=http://localhost:3000
BACKEND_BASE_URL=http://localhost:8000
API_URL=http://localhost:8000

# DATABASE & MEDIA BACKUP CONFIGURATION
BACKUP_SCHEDULE=0 */6 * * *
BACKUP_RETENTION_DAYS=30
MEDIA_BACKUP_ENABLED=true
MEDIA_BACKUP_SCHEDULE=30 2 * * *
MEDIA_BACKUP_RETENTION_DAYS=14
BACKUP_MIN_FREE_GB=5
BACKUP_ON_START=false
TZ=Europe/Warsaw
# BACKUP_ALERT_EMAIL=

# Nightly emergency .xlsx & PNG map export (5 sheet files + map .xlsx + 10 PNG maps, Europe/Warsaw)
EMERGENCY_EXPORT_ENABLED=true
EMERGENCY_EXPORT_HOUR=2
EMERGENCY_EXPORT_MINUTE=45
EXPORT_RETENTION_DAYS=7

# Google Drive off-site sync via rclone (Service Account JSON in ./backups/secrets/gdrive-sa.json)
GDRIVE_SYNC_ENABLED=false
GDRIVE_SHARED_DRIVE_ID=
GDRIVE_SERVICE_ACCOUNT_FILE=/secrets/gdrive-sa.json
GDRIVE_EXPORTS_SYNC_SCHEDULE=5 3 * * *
GDRIVE_MEDIA_ARCHIVE_RETENTION_DAYS=30

# Invitation expiry reminder scheduler
NOTIFICATIONS_HOUR=9
NOTIFICATIONS_MINUTE=0

# Strapi / targus website catalogue export
STRAPI_URL=
STRAPI_API_TOKEN=
# STRAPI_CONNECT_TIMEOUT=10
# STRAPI_READ_TIMEOUT=60
# WEBSITE_EXPORT_BATCH_MAX=10
```

## 1) Konfiguracja projektu i obrazów

### `PROJECT_NAME`
- **Gdzie**: `db`, `backend`, `scheduler`, `frontend`, `mailpit`, `backup` (w nazwach kontenerów).
- **Po co**: prefiks nazw kontenerów (`${PROJECT_NAME}_db`, `${PROJECT_NAME}_backend` itd.), ułatwia identyfikację wielu stacków na jednym hoście.

### `ENV`
- **Gdzie**: `backend`, `scheduler`, `frontend`.
- **Po co**: wybór trybu buildu i uruchomienia (`development` / `production`) dla lokalnego stacka.

### `FRONTEND_VERSION`
- **Gdzie**: `frontend` (tag obrazu).
- **Po co**: kontrola wersji obrazu Dockera frontendu.

### `BACKEND_VERSION`
- **Gdzie**: `backend`, `scheduler` (tag obrazu), dodatkowo skrypt build/push backendu.
- **Po co**: kontrola wersji obrazu Dockera backendu (build/push/deploy konkretnej wersji).

### `DOCKER_REGISTRY`
- **Gdzie**: `backend`, `scheduler` i `frontend` w środowisku produkcyjnym (adres rejestru obrazów), dodatkowo skrypty build/push.
- **Po co**: wskazuje rejestr obrazów dla środowiska produkcyjnego (np. Docker Hub/private registry).

## 2) Konfiguracja Django / backend

### `DJANGO_SECRET_KEY`
- **Gdzie**: `backend`, `scheduler`.
- **Po co**: klucz kryptograficzny Django (sesje, podpisy, bezpieczeństwo aplikacji).

### `DEBUG`
- **Gdzie**: `backend`, `scheduler`.
- **Po co**: tryb debugowania Django i zachowanie startowe kontenera backendu.

### `DJANGO_LOGLEVEL`
- **Gdzie**: `backend`, `scheduler`.
- **Po co**: deklaratywny poziom logowania backendu (obecnie nie jest aktywnie konsumowany w `settings.py`, ale jest przygotowany pod konfigurację logowania).

### `DJANGO_ALLOWED_HOSTS`
- **Gdzie**: `backend`, `scheduler`.
- **Po co**: lista hostów dopuszczonych przez Django (`ALLOWED_HOSTS`), ochrona przed Host Header attacks.

### `CSRF_TRUSTED_ORIGINS`
- **Gdzie**: `backend`, `scheduler` (głównie produkcja).
- **Po co**: lista zaufanych originów dla CSRF (szczególnie panel admin i operacje state-changing).

### `CORS_ALLOWED_ORIGINS`
- **Gdzie**: `backend`, `scheduler` (głównie produkcja).
- **Po co**: lista originów frontendu, które mogą wykonywać requesty cross-origin do API.

## 3) Konfiguracja e-mail

### Informacja organizacyjna
- Produkcyjne konto e-mail projektu znajduje się na `home.pl`.
- Dostęp do skrzynki oraz danych logowania ma sekretarz.

### `EMAIL_HOST`
- **Gdzie**: `backend`, `scheduler`, `backup`.
- **Po co**: adres serwera SMTP (w dev zwykle `mailpit`, w produkcji serwer SMTP z `home.pl`).

### `EMAIL_PORT`
- **Gdzie**: `backend`, `scheduler`, `backup`.
- **Po co**: port serwera SMTP (np. `1025` dla Mailpit, `587` TLS, `465` SSL).

### `EMAIL_HOST_USER`
- **Gdzie**: `backend`, `scheduler`, `backup`, `mailpit` (autoryzacja UI w dev).
- **Po co**: użytkownik SMTP; może być też fallbackiem dla adresu nadawcy (w produkcji login konta na `home.pl`).

### `EMAIL_HOST_PASSWORD`
- **Gdzie**: `backend`, `scheduler`, `backup`, `mailpit` (autoryzacja UI w dev).
- **Po co**: hasło SMTP (w produkcji hasło do konta na `home.pl`).

### `EMAIL_USE_SSL`
- **Gdzie**: `backend`, `scheduler`, `backup`.
- **Po co**: wymuszenie połączenia SMTP przez SSL.

### `EMAIL_USE_TLS`
- **Gdzie**: `backend`, `scheduler`, `backup`.
- **Po co**: włączenie TLS (STARTTLS) dla SMTP.

### `DEFAULT_FROM_EMAIL`
- **Gdzie**: `backend`, `scheduler`, `backup`.
- **Po co**: domyślny adres nadawcy e-mail.

## 4) Konfiguracja bazy danych

### `DATABASE_HOST`
- **Gdzie**: `backend`, `scheduler`, `backup`.
- **Po co**: host serwera bazy (w Dockerze zwykle nazwa usługi `db`).

### `DATABASE_NAME`
- **Gdzie**: `db`, `backend`, `scheduler`, `backup`.
- **Po co**: nazwa bazy aplikacyjnej.

### `DATABASE_USER`
- **Gdzie**: `db`, `backend`, `scheduler` (jako `DATABASE_USERNAME`).
- **Po co**: użytkownik bazy danych tworzony w kontenerze MySQL i przekazywany do backendu.

### `DATABASE_PASSWORD`
- **Gdzie**: `db`, `backend`, `scheduler`.
- **Po co**: hasło użytkownika aplikacyjnego bazy.

### `DATABASE_ROOT_PASSWORD`
- **Gdzie**: `db`, `backup`.
- **Po co**: hasło konta root MySQL oraz fallback dla mechanizmu backupu.

### `DATABASE_PORT`
- **Gdzie**: `backend`, `scheduler`, `backup`.
- **Po co**: port serwera MySQL.

### `DATABASE_ENGINE`
- **Gdzie**: `backend`, `scheduler`.
- **Po co**: wybór silnika bazy (`mysql` / `sqlite3` itp.) w konfiguracji Django.

## 5) URL-e aplikacji

### `FRONTEND_BASE_URL`
- **Gdzie**: `backend`, `scheduler`.
- **Po co**: bazowy adres frontendu używany do budowy linków w e-mailach (np. reset hasła, rejestracja).

### `BACKEND_BASE_URL`
- **Gdzie**: `backend`, `scheduler`.
- **Po co**: bazowy adres backendu używany np. do pełnych URL-i zasobów statycznych w e-mailach.

### `API_URL`
- **Gdzie**: `frontend` (jako `NEXT_PUBLIC_API_URL`).
- **Po co**: adres API przekazywany do frontendu jako publiczna zmienna `NEXT_PUBLIC_API_URL`.

## 6) Konfiguracja backupów i eksportu ratunkowego

### `BACKUP_SCHEDULE`
- **Gdzie**: `backup`.
- **Po co**: harmonogram crona backupów bazy MySQL (domyślnie `0 */6 * * *` — co 6 godzin).

### `BACKUP_RETENTION_DAYS`
- **Gdzie**: `backup`, `scheduler`.
- **Po co**: liczba dni retencji dumpów MySQL oraz paczek tagowanych (`pre-deploy`, `pre-restore`; domyślnie `30`).

### `MEDIA_BACKUP_ENABLED` / `MEDIA_BACKUP_SCHEDULE` / `MEDIA_BACKUP_RETENTION_DAYS`
- **Gdzie**: `backup`.
- **Po co**: włączenie i harmonogram nocnego backupu `mediafiles` (domyślnie `true`, `30 2 * * *`, retencja `14` dni).

### `BACKUP_MIN_FREE_GB`
- **Gdzie**: `backup`.
- **Po co**: minimalna wymagana ilość wolnego miejsca na `/backups` w GB przed startem backupu (dla `mediafiles` skrypt dodaje dodatkowo bieżący rozmiar katalogu `/mediafiles`; domyślnie `5`).

### `BACKUP_ON_START`
- **Gdzie**: `backup`.
- **Po co**: uruchomienie jednorazowego pełnego backupu przy starcie kontenera (domyślnie `false`).

### `BACKUP_ALERT_EMAIL`
- **Gdzie**: `backup`.
- **Po co**: opcjonalny zapasowy adres e-mail dla alertów błędu, gdy w bazie `Settings.system_admin_email` nie jest jeszcze ustawiony (zwykle pusty — głównym źródłem jest panel admina Django).

### `TZ`
- **Gdzie**: `backup`.
- **Po co**: strefa czasowa używana przez harmonogram backupów (domyślnie `Europe/Warsaw`).

### `EMERGENCY_EXPORT_ENABLED` / `EMERGENCY_EXPORT_HOUR` / `EMERGENCY_EXPORT_MINUTE` / `EXPORT_RETENTION_DAYS`
- **Gdzie**: `scheduler`.
- **Po co**: nocny eksport 6 plików `.xlsx` (`lg`, `fr`, `tr`, `opiekun`, `mapa`, `wszystkie-arkusze`) oraz podfolderu `mapy/` z 10 widokami mapy hali `.png` do `/backups/exports/` według zegara `Europe/Warsaw` (domyślnie `true`, `2:45`, retencja `7` dni).

### `GDRIVE_SYNC_ENABLED` / `GDRIVE_SHARED_DRIVE_ID` / `GDRIVE_SERVICE_ACCOUNT_FILE`
- **Gdzie**: `backup`.
- **Po co**: automatyczna wysyłka backupów przez `rclone` na Dysk współdzielony Google Drive (`baza-sql/`, `excele-ratunkowe/`, `mediafiles/` z podfolderem `mapy/` oraz wersjonowane `mediafiles-archiwum-zmian/`). Klucz JSON montuje się w `./backups/secrets/gdrive-sa.json:/secrets/gdrive-sa.json:ro` (katalog `./backups/secrets:/secrets:ro`).

### `GDRIVE_EXPORTS_SYNC_SCHEDULE` / `GDRIVE_MEDIA_ARCHIVE_RETENTION_DAYS`
- **Gdzie**: `backup`.
- **Po co**: harmonogram crona wysyłki nocnych eksportów `.xlsx` + mapek PNG na Drive (domyślnie `5 3 * * *`) oraz liczba dni trzymania starych wersji plików w `mediafiles-archiwum-zmian/` (domyślnie `30`).

### `NOTIFICATIONS_HOUR`
- **Gdzie**: `scheduler`.
- **Po co**: godzina (0–23, zegar Europe/Warsaw), o której uruchamiane są raz dziennie komendy `send_invitation_expiry_reminders` i `auto_reject_missing_fire_certs`. Domyślnie `9`.

### `NOTIFICATIONS_MINUTE`
- **Gdzie**: `scheduler`.
- **Po co**: minuta w tej godzinie. Domyślnie `0`.

## 7) Eksport katalogu → Strapi (strona targów)

### `STRAPI_URL`
- **Gdzie**: `backend`.
- **Po co**: bazowy URL API Strapi (Targus), bez końcowego `/`. Produkcja: `https://api.targipracy.org.pl`. Lokalnie z kontenera system32: `http://host.docker.internal:1337`.
- **Puste**: endpointy eksportu zwracają 503.

### `STRAPI_API_TOKEN`
- **Gdzie**: `backend` (tylko serwer — nigdy we froncie).
- **Po co**: token API Strapi (typ Custom) z uprawnieniami: `company` find/findOne/create/update/**delete**, `job` find/findOne/create/update/delete, `work-model` / `employment-type` / `contract` find, `hall-map` find/update, Upload `upload` + `destroy`.
- Token trzymaj tylko w `.env` na VPS; nie commituj. Po dodaniu usuwania katalogu wystarczy dopisać `company` **delete** na tym samym tokenie (bez nowej wartości w `.env`). W Custom API Token **nie ma** checkboxa `publish` — publikacja idzie przez create/update bez `status=draft`.

### `STRAPI_CONNECT_TIMEOUT` / `STRAPI_READ_TIMEOUT`
- Opcjonalne (domyślnie 10 s / 60 s).

### `WEBSITE_EXPORT_BATCH_MAX`
- Opcjonalne (domyślnie 10 firm na jedno żądanie POST).

## Uwaga praktyczna

W `backend/backend/settings.py` backend odczytuje nazwę użytkownika DB jako `DATABASE_USERNAME`, a w `.env.example` występuje `DATABASE_USER`. Mapowanie między tymi nazwami robi Docker Compose (`DATABASE_USERNAME: ${DATABASE_USER}`), więc konfiguracja jest poprawna.

Zmienne techniczne kontenera `scheduler` (`SKIP_MIGRATIONS`, `SKIP_COLLECTSTATIC`, `EMERGENCY_EXPORT_DIR`) są ustawione bezpośrednio w `compose.yml` i `compose.prod.yml`, więc nie trzeba ich dopisywać do `.env`.

## Uwaga bezpieczeństwa (backupy)

Backupy z kontenera `backup` są zapisywane lokalnie na VPS oraz (po włączeniu `GDRIVE_SYNC_ENABLED=true`) synchronizowane automatycznie na Dysk współdzielony Google Drive. Klucza Service Account (`backups/secrets/gdrive-sa.json`) nie wolno commitować do Gita.
