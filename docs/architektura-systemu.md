# Architektura systemu

Ten dokument opisuje architekturę środowiska uruchamianego przez Docker Compose, ze szczególnym naciskiem na kontenery, porty i ich przeznaczenie.

W repozytorium są dwa główne pliki Compose:

- `compose.yml` - środowisko lokalne/testowe (development),
- `compose.prod.yml` - środowisko produkcyjne (production).

## Przegląd

System składa się z usług działających w sieci `internal`:

- `db` - baza danych MySQL.
- `backend` - API Django REST.
- `frontend` - aplikacja Next.js.
- `scheduler` - kontener cyklicznych zadań backendowych (przypomnienia o zaproszeniach, automatyczne odrzucanie brakujących certyfikatów ppoż. i nocny eksport ratunkowy arkuszy do `.xlsx`).
- `mailpit` - lokalny serwer SMTP + web UI do podglądu maili (tylko `compose.yml`).
- `backup` - kontener wykonujący cykliczne kopie zapasowe bazy MySQL oraz nocne kopie `mediafiles`.

## `compose.yml` vs `compose.prod.yml` (różnice kluczowe)

### Źródło obrazów

- `compose.yml`:
  - dopuszcza lokalny build `backend` i `frontend` (sekcja `build`, target zależny od `ENV`),
  - używa obrazów z tagami (np. `0noder4/itp_system32_backend:${BACKEND_VERSION}`), ale podczas pracy lokalnej typowo bazujemy na buildzie z repo.
- `compose.prod.yml`:
  - uruchamia `backend` i `frontend` z obrazów w rejestrze `${DOCKER_REGISTRY}` (bez lokalnego buildu),
  - oczekuje, że obrazy zostały wcześniej zbudowane i wypchnięte do registry.

### Wolumeny i kod źródłowy

- `compose.yml`:
  - montuje kod źródłowy do kontenerów (`./backend:/app`, `./frontend:/app`) dla pracy developerskiej.
- `compose.prod.yml`:
  - nie montuje kodu źródłowego (uruchamia gotowe obrazy),
  - utrzymuje wolumeny `data`, `staticfiles`, `mediafiles`, a backupy i eksporty zapisuje na hoście przez `./backups/paczki:/backups`.

### Usługi pomocnicze

- `compose.yml` zawiera `mailpit` (SMTP + UI) do testowania wysyłki e-maili.
- `compose.prod.yml` nie uruchamia `mailpit` (produkcja używa zewnętrznego SMTP).

### Healthcheck i odporność na start

- `compose.prod.yml` zawiera healthchecki i warunki `depends_on` (np. backend startuje po zdrowej bazie).
- `compose.yml` jest uproszczony pod szybki start lokalny.

## Kontenery i porty

### `db` (MySQL)

- Obraz: `mysql:8.0` w `compose.yml`, `mysql:latest` w `compose.prod.yml`
- Kontener: `${PROJECT_NAME}_db`
- Port: `127.0.0.1:3306:3306`
- Przeznaczenie:
  - przechowywanie danych aplikacji,
  - udostępnienie bazy dla `backend` i `backup`.
- Wolumen: `data:/var/lib/mysql` (trwałość danych).

### `backend` (Django REST API)

- Obraz: `0noder4/itp_system32_backend:${BACKEND_VERSION}` (z możliwością lokalnego buildu z `backend/`)
- Kontener: `${PROJECT_NAME}_backend`
- Port: `8000:8000`
- Przeznaczenie:
  - obsługa logiki biznesowej,
  - udostępnienie REST API dla `frontend`,
  - wysyłka e-maili przez SMTP (np. do `mailpit` w środowisku testowym).
- Wolumen: `./backend:/app` (live-reload podczas developmentu/testów).

### `scheduler` (zadania cykliczne backendu)

- Obraz: ten sam co `backend`.
- Kontener: `${PROJECT_NAME}_scheduler`
- Porty: brak.
- Przeznaczenie:
  - o godzinie `NOTIFICATIONS_HOUR`:`NOTIFICATIONS_MINUTE` (zegar `Europe/Warsaw`) uruchamia `python manage.py send_invitation_expiry_reminders` oraz `python manage.py auto_reject_missing_fire_certs`,
  - przy niezerowym exit code **nie** oznacza dnia jako wykonanego i ponawia próbę, dopóki trwa ta sama minuta (co ~20 s),
  - gdy `EMERGENCY_EXPORT_ENABLED=true`, o godzinie `EMERGENCY_EXPORT_HOUR`:`EMERGENCY_EXPORT_MINUTE` uruchamia `python manage.py export_emergency_xlsx` do `/backups/exports`.
- Zmienne kontenera: `SKIP_MIGRATIONS=true` i `SKIP_COLLECTSTATIC=true` (migracje wykonuje wyłącznie `backend`).
- Wolumeny: `backups:/backups` (w `compose.yml`, razem z `./backend:/app`) lub `./backups/paczki:/backups` (w `compose.prod.yml`).

### `frontend` (Next.js)

- Obraz: `0noder4/itp_system32_frontend:${FRONTEND_VERSION}` (z możliwością lokalnego buildu z `frontend/`)
- Kontener: `${PROJECT_NAME}_frontend`
- Port: `3000:3000`
- Przeznaczenie:
  - warstwa UI aplikacji,
  - komunikacja z `backend` przez `NEXT_PUBLIC_API_URL`.
- Wolumeny:
  - `./frontend:/app` (kod źródłowy),
  - `/app/node_modules`,
  - `/app/.next`.

### `mailpit` (SMTP + inbox UI)

- Obraz: `axllent/mailpit`
- Kontener: `${PROJECT_NAME}_mailpit`
- Porty:
  - `1025:1025` - SMTP (backend wysyła tu wiadomości),
  - `8025:8025` - web UI do podglądu przechwyconych wiadomości.
- Przeznaczenie:
  - testowanie procesów wysyłki e-mail bez użycia zewnętrznego SMTP.
- Wolumen: `mailpit_data:/data`.

### `backup` (kopie zapasowe)

- Build: `./backups/Dockerfile`
- Kontener: `${PROJECT_NAME}_backup`
- Porty: brak portów wystawionych na hosta.
- Przeznaczenie:
  - wykonywanie cyklicznych backupów MySQL według `BACKUP_SCHEDULE` (z testem `gzip -t`) oraz nocnych kopii `mediafiles` (montowanych jako `:ro`, z testem `tar -tzf`),
  - sprawdzenie minimalnego zapasu miejsca na dysku (`BACKUP_MIN_FREE_GB`), utrzymywanie retencji i wysyłka alertu e-mail w razie błędu.
- Wolumeny: `backups:/backups` (w `compose.yml`) lub `./backups/paczki:/backups` (w `compose.prod.yml`).

## Zależności między usługami

- `backend` zależy od `db`.
- `scheduler` zależy w dev od `db` i `backend`, a na produkcji czeka na `backend: healthy`, więc migracje wykonuje wyłącznie `backend`.
- `frontend` zależy od `backend`.
- `backup` zależy od `db`.
- `mailpit` działa niezależnie, ale jest wykorzystywany przez `backend` do testów maili.

## Ruch sieciowy i dostęp z hosta

- `http://localhost:3000` - frontend.
- `http://localhost:8000` - backend API.
- `http://localhost:8025` - panel Mailpit.
- `localhost:1025` - SMTP Mailpit.
- `localhost:3306` - MySQL.
