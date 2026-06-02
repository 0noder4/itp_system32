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

Jeżeli backend korzysta z migracji, uruchom je:

```bash
docker compose exec backend python manage.py migrate
```

## 4. Dane testowe i scenariusze e-mail

- UI Mailpit (`localhost:8025`) pokazuje wszystkie wiadomości wysłane przez aplikację.
- SMTP Mailpit (`localhost:1025`) powinien być wskazany w konfiguracji backendu dla testów.

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
