# Instrukcja uruchomienia środowiska testowego

Ten dokument opisuje uruchomienie lokalnego środowiska testowego projektu przy użyciu Docker Compose.

## Wymagania

- Docker
- Docker Compose (wtyczka `docker compose`)
- Wolne porty: `3000`, `8000`, `3306`, `8025`, `1025`

## 1. Konfiguracja zmiennych środowiskowych

W katalogu głównym projektu utwórz plik `.env` na podstawie przykładu:

```bash
cp .env.example .env
```

Następnie uzupełnij kluczowe wartości w `.env`:

- `PROJECT_NAME` - prefiks nazw kontenerów.
- `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_ROOT_PASSWORD`.
- `DJANGO_SECRET_KEY`, `DEBUG`, `DJANGO_ALLOWED_HOSTS`.
- `API_URL` / `NEXT_PUBLIC_API_URL` (adres API widoczny dla frontendu).
- Dane SMTP używane przez backend (dla testów zwykle Mailpit: host i port `1025`).

## 2. Start środowiska

Uruchom wszystkie usługi:

```bash
docker compose up -d --build
```

Sprawdź status kontenerów:

```bash
docker compose ps
```

Podgląd logów (opcjonalnie):

```bash
docker compose logs -f backend frontend db
```

## 3. Weryfikacja działania

Po uruchomieniu sprawdź:

- frontend: [http://localhost:3000](http://localhost:3000)
- backend: [http://localhost:8000](http://localhost:8000)
- Mailpit UI: [http://localhost:8025](http://localhost:8025)

Jeżeli uruchamiasz projekt po raz pierwszy albo w repo są zmiany w modelach bez gotowych migracji, najpierw wygeneruj migracje, a następnie je zastosuj.

Wygenerowanie migracji (jeśli potrzebne):

```bash
docker compose exec backend python manage.py makemigrations
```

Zastosowanie migracji:

```bash
docker compose exec backend python manage.py migrate
```

## 4. Dane testowe i scenariusze e-mail

- Maile zaproszeniowe i przypomnienia o wygasaniu: [`localhost:8025`](http://localhost:8025).
- Ręczne odpalenie przypomnień o wygasających zaproszeniach:

```bash
docker compose exec backend python manage.py send_invitation_expiry_reminders
```

Harmonogram automatyczny: usługa `scheduler` (godzina `NOTIFICATIONS_HOUR`/`NOTIFICATIONS_MINUTE` w strefie Europe/Warsaw). Konfiguracja progów dni i ważności linku: panel Django Admin → Companies → Settings → Invitation settings (`0` wyłącza przypomnienia).

### Konfiguracja konta produkcyjnego (SMTP)

- Produkcyjne konto e-mail projektu jest utrzymywane u dostawcy `home.pl`.
- Dostęp do skrzynki i danych logowania posiada sekretarz.
- W środowisku produkcyjnym wartości `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`/`EMAIL_USE_SSL` należy ustawić zgodnie z parametrami SMTP z `home.pl`.

## 5. Zatrzymanie środowiska

Zatrzymanie kontenerów:

```bash
docker compose down
```

Zatrzymanie kontenerów razem z wolumenami (uwaga: usuwa dane lokalne):

```bash
docker compose down -v
```

## Najczęstsze problemy

- **Port już zajęty** - zmień mapowanie portu w `compose.yml` lub zwolnij port na hoście.
- **Backend nie łączy się z bazą** - sprawdź zgodność zmiennych `DATABASE_*` w `.env`.
- **Brak wiadomości w Mailpit** - sprawdź konfigurację SMTP w backendzie (`EMAIL_HOST`, `EMAIL_PORT`).
