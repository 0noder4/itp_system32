# Architektura systemu

Ten dokument opisuje architekturę środowiska uruchamianego przez `compose.yml` (lokalne/testowe), ze szczególnym naciskiem na kontenery, porty i ich przeznaczenie.

## Przegląd

System składa się z pięciu głównych usług działających w sieci `internal`:

- `db` - baza danych MySQL.
- `backend` - API Django REST.
- `frontend` - aplikacja Next.js.
- `mailpit` - lokalny serwer SMTP + web UI do podglądu maili.
- `backup` - kontener wykonujący cykliczne kopie zapasowe bazy.

## Kontenery i porty

### `db` (MySQL)

- Obraz: `mysql:8.0`
- Kontener: `${PROJECT_NAME}_db`
- Port: `3306:3306`
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
  - wykonywanie cyklicznych backupów MySQL według `BACKUP_SCHEDULE`,
  - utrzymywanie retencji backupów (`BACKUP_RETENTION_DAYS`).
- Wolumen: `backups:/backups`.

## Zależności między usługami

- `backend` zależy od `db`.
- `frontend` zależy od `backend`.
- `backup` zależy od `db`.
- `mailpit` działa niezależnie, ale jest wykorzystywany przez `backend` do testów maili.

## Ruch sieciowy i dostęp z hosta

- `http://localhost:3000` - frontend.
- `http://localhost:8000` - backend API.
- `http://localhost:8025` - panel Mailpit.
- `localhost:1025` - SMTP Mailpit.
- `localhost:3306` - MySQL.
