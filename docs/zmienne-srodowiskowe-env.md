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

# DATABASE BACKUP CONFIGURATION
BACKUP_SCHEDULE=0 2 * * *
BACKUP_RETENTION_DAYS=30
BACKUP_ON_START=false
TZ=UTC

# Invitation expiry reminder scheduler
NOTIFICATIONS_HOUR=9
NOTIFICATIONS_MINUTE=0
```

## 1) Konfiguracja projektu i obrazów

### `PROJECT_NAME`
- **Gdzie**: `db`, `backend`, `frontend`, `mailpit`, `backup` (w nazwach kontenerów).
- **Po co**: prefiks nazw kontenerów (`${PROJECT_NAME}_db`, `${PROJECT_NAME}_backend` itd.), ułatwia identyfikację wielu stacków na jednym hoście.

### `ENV`
- **Gdzie**: `backend`, `frontend`.
- **Po co**: wybór trybu buildu i uruchomienia (`development` / `production`) dla lokalnego stacka.

### `FRONTEND_VERSION`
- **Gdzie**: `frontend` (tag obrazu).
- **Po co**: kontrola wersji obrazu Dockera frontendu.

### `BACKEND_VERSION`
- **Gdzie**: `backend` (tag obrazu), dodatkowo skrypt build/push backendu.
- **Po co**: kontrola wersji obrazu Dockera backendu (build/push/deploy konkretnej wersji).

### `DOCKER_REGISTRY`
- **Gdzie**: `backend` i `frontend` w środowisku produkcyjnym (adres rejestru obrazów), dodatkowo skrypt build/push backendu.
- **Po co**: wskazuje rejestr obrazów dla środowiska produkcyjnego (np. Docker Hub/private registry).

## 2) Konfiguracja Django / backend

### `DJANGO_SECRET_KEY`
- **Gdzie**: `backend`.
- **Po co**: klucz kryptograficzny Django (sesje, podpisy, bezpieczeństwo aplikacji).

### `DEBUG`
- **Gdzie**: `backend`.
- **Po co**: tryb debugowania Django i zachowanie startowe kontenera backendu.

### `DJANGO_LOGLEVEL`
- **Gdzie**: `backend`.
- **Po co**: deklaratywny poziom logowania backendu (obecnie nie jest aktywnie konsumowany w `settings.py`, ale jest przygotowany pod konfigurację logowania).

### `DJANGO_ALLOWED_HOSTS`
- **Gdzie**: `backend`.
- **Po co**: lista hostów dopuszczonych przez Django (`ALLOWED_HOSTS`), ochrona przed Host Header attacks.

### `CSRF_TRUSTED_ORIGINS`
- **Gdzie**: `backend` (głównie produkcja).
- **Po co**: lista zaufanych originów dla CSRF (szczególnie panel admin i operacje state-changing).

### `CORS_ALLOWED_ORIGINS`
- **Gdzie**: `backend` (głównie produkcja).
- **Po co**: lista originów frontendu, które mogą wykonywać requesty cross-origin do API.

## 3) Konfiguracja e-mail

### Informacja organizacyjna
- Produkcyjne konto e-mail projektu znajduje się na `home.pl`.
- Dostęp do skrzynki oraz danych logowania ma sekretarz.

### `EMAIL_HOST`
- **Gdzie**: `backend`.
- **Po co**: adres serwera SMTP (w dev zwykle `mailpit`, w produkcji serwer SMTP z `home.pl`).

### `EMAIL_PORT`
- **Gdzie**: `backend`.
- **Po co**: port serwera SMTP (np. `1025` dla Mailpit, `587` TLS, `465` SSL).

### `EMAIL_HOST_USER`
- **Gdzie**: `backend`, `mailpit` (autoryzacja UI w dev).
- **Po co**: użytkownik SMTP; może być też fallbackiem dla adresu nadawcy (w produkcji login konta na `home.pl`).

### `EMAIL_HOST_PASSWORD`
- **Gdzie**: `backend`, `mailpit` (autoryzacja UI w dev).
- **Po co**: hasło SMTP (w produkcji hasło do konta na `home.pl`).

### `EMAIL_USE_SSL`
- **Gdzie**: `backend`.
- **Po co**: wymuszenie połączenia SMTP przez SSL.

### `EMAIL_USE_TLS`
- **Gdzie**: `backend`.
- **Po co**: włączenie TLS (STARTTLS) dla SMTP.

### `DEFAULT_FROM_EMAIL`
- **Gdzie**: `backend`.
- **Po co**: domyślny adres nadawcy e-mail.

## 4) Konfiguracja bazy danych

### `DATABASE_HOST`
- **Gdzie**: `backend`, `backup`.
- **Po co**: host serwera bazy (w Dockerze zwykle nazwa usługi `db`).

### `DATABASE_NAME`
- **Gdzie**: `db`, `backend`, `backup`.
- **Po co**: nazwa bazy aplikacyjnej.

### `DATABASE_USER`
- **Gdzie**: `db`, `backend` (jako `DATABASE_USERNAME`).
- **Po co**: użytkownik bazy danych tworzony w kontenerze MySQL i przekazywany do backendu.

### `DATABASE_PASSWORD`
- **Gdzie**: `db`, `backend`.
- **Po co**: hasło użytkownika aplikacyjnego bazy.

### `DATABASE_ROOT_PASSWORD`
- **Gdzie**: `db`, `backup`.
- **Po co**: hasło konta root MySQL oraz fallback dla mechanizmu backupu.

### `DATABASE_PORT`
- **Gdzie**: `backend`, `backup`.
- **Po co**: port serwera MySQL.

### `DATABASE_ENGINE`
- **Gdzie**: `backend`.
- **Po co**: wybór silnika bazy (`mysql` / `sqlite3` itp.) w konfiguracji Django.

## 5) URL-e aplikacji

### `FRONTEND_BASE_URL`
- **Gdzie**: `backend`.
- **Po co**: bazowy adres frontendu używany do budowy linków w e-mailach (np. reset hasła, rejestracja).

### `BACKEND_BASE_URL`
- **Gdzie**: `backend`.
- **Po co**: bazowy adres backendu używany np. do pełnych URL-i zasobów statycznych w e-mailach.

### `API_URL`
- **Gdzie**: `frontend` (jako `NEXT_PUBLIC_API_URL`).
- **Po co**: adres API przekazywany do frontendu jako publiczna zmienna `NEXT_PUBLIC_API_URL`.

## 6) Konfiguracja backupów

### `BACKUP_SCHEDULE`
- **Gdzie**: `backup`.
- **Po co**: harmonogram crona wykonywania backupów.

### `BACKUP_RETENTION_DAYS`
- **Gdzie**: `backup`.
- **Po co**: liczba dni retencji plików backupu.

### `BACKUP_ON_START`
- **Gdzie**: `backup`.
- **Po co**: uruchomienie jednorazowego backupu przy starcie kontenera.

### `TZ`
- **Gdzie**: `backup`.
- **Po co**: strefa czasowa używana przez harmonogram backupów.

### `NOTIFICATIONS_HOUR`
- **Gdzie**: `scheduler`.
- **Po co**: godzina (0–23, zegar Europe/Warsaw), o której command `send_invitation_expiry_reminders` ma się uruchomić raz dziennie. Domyślnie `9`.

### `NOTIFICATIONS_MINUTE`
- **Gdzie**: `scheduler`.
- **Po co**: minuta w tej godzinie. Domyślnie `0`.

## Uwaga praktyczna

W `backend/backend/settings.py` backend odczytuje nazwę użytkownika DB jako `DATABASE_USERNAME`, a w `.env.example` występuje `DATABASE_USER`. Mapowanie między tymi nazwami robi Docker Compose (`DATABASE_USERNAME: ${DATABASE_USER}`), więc konfiguracja jest poprawna.

## Uwaga bezpieczeństwa (backupy)

Backupy z kontenera `backup` są zapisywane lokalnie na VPS. W celu ograniczenia ryzyka utraty danych należy okresowo przenosić je na inną, niezależną maszynę (off-site backup).
