# Wdrożenie produkcyjne

Dokument opisuje podstawowe informacje o środowisku produkcyjnym oraz sposób dostępu administracyjnego.

## Środowisko produkcyjne

- Produkcja działa na serwerze VPS w usłudze `home.pl`.
- Aplikacja jest uruchamiana kontenerowo (Docker Compose).
- Na serwerze działa stack usług aplikacji (`frontend`, `backend`, `db`, `backup`).

## Dostęp do serwera

- Dostęp administracyjny do VPS realizowany jest przez SSH.
- Połączenie wykonywane jest na konto serwerowe z uprawnieniami do zarządzania kontenerami.

Przykładowe logowanie:

```bash
ssh <uzytkownik>@<adres-vps>
```

## Publikacja obrazów na Docker Registry (produkcja)

Produkcja korzysta z obrazów opublikowanych w rejestrze Docker (np. Docker Hub). Nazwy obrazów są zdefiniowane w `compose.prod.yml`:

- `${DOCKER_REGISTRY}/itp_system32_backend:${BACKEND_VERSION}`
- `${DOCKER_REGISTRY}/itp_system32_frontend:${FRONTEND_VERSION}`

Zmienna `DOCKER_REGISTRY` (np. `docker.io/0noder4`) oraz wersje `BACKEND_VERSION` / `FRONTEND_VERSION` ustawia się w pliku `.env` lokalnie (przy buildzie) i na VPS (przy `pull`).

### Wymagania wstępne

1. Zainstalowany Docker na maszynie, z której budujesz obrazy (lokalny komputer lub CI).
2. Konto w rejestrze obrazów z uprawnieniem do push.
3. Zalogowanie do rejestru:

```bash
docker login
```

Dla Docker Hub podaj login i token/hasło. Dla innego rejestru użyj odpowiedniego hosta, np. `docker login registry.example.com`.

4. W katalogu głównym projektu plik `.env` z poprawnym `DOCKER_REGISTRY` (zgodnym z `.env.example`).

### Backend

Z katalogu głównego repozytorium:

```bash
chmod +x scripts/build-push-backend.sh
./scripts/build-push-backend.sh
```

Opcjonalnie z inną wersją tagu:

```bash
BACKEND_VERSION=0.1 ./scripts/build-push-backend.sh
```

Skrypt buduje obraz z targetem `production` (`backend/Dockerfile`) i wykonuje `docker push`.

### Frontend

Frontend wymaga podania publicznego URL API w czasie buildu (`NEXT_PUBLIC_API_URL`). Wartość bierze się z `API_URL` w `.env` (na produkcji: pełny adres backendu, np. `https://api.example.com`).

```bash
chmod +x scripts/build-push-frontend.sh
./scripts/build-push-frontend.sh
```

Opcjonalnie z inną wersją:

```bash
FRONTEND_VERSION=0.1 ./scripts/build-push-frontend.sh
```

### Ręczny build i push (bez skryptów)

Backend:

```bash
source .env
docker build -f backend/Dockerfile -t "${DOCKER_REGISTRY}/itp_system32_backend:${BACKEND_VERSION}" --target production ./backend
docker push "${DOCKER_REGISTRY}/itp_system32_backend:${BACKEND_VERSION}"
```

Frontend:

```bash
source .env
docker build -f frontend/Dockerfile -t "${DOCKER_REGISTRY}/itp_system32_frontend:${FRONTEND_VERSION}" \
  --target production \
  --build-arg NEXT_PUBLIC_API_URL="${API_URL}" \
  ./frontend
docker push "${DOCKER_REGISTRY}/itp_system32_frontend:${FRONTEND_VERSION}"
```

### Po opublikowaniu obrazów (na VPS)

1. Zaktualizuj w `.env` na serwerze wartości `BACKEND_VERSION` i/lub `FRONTEND_VERSION` do tagów, które właśnie wypchnąłeś.
2. Pobierz obrazy i uruchom ponownie usługi:

```bash
docker compose -f compose.prod.yml pull backend frontend
docker compose -f compose.prod.yml up -d backend frontend
```

Możesz też zaktualizować cały stack: `docker compose -f compose.prod.yml pull` oraz `up -d`.

### Uwagi

- Przed buildem frontendu upewnij się, że `API_URL` w `.env` na maszynie buildującej wskazuje **produkcyjny** adres API (wartość jest „wypiekana” w obrazie Next.js).
- Po każdej zmianie wersji obrazu zwiększ tag (`BACKEND_VERSION` / `FRONTEND_VERSION`) lub nadpisz istniejący tag świadomie — na VPS musi być ten sam tag co w rejestrze.
- Obrazy `db` i `backup` na produkcji są budowane lokalnie na VPS lub z publicznych obrazów bazowych; do rejestru projektu trafiają głównie `backend` i `frontend`.

## Podstawowe kroki wdrożenia

1. Zaloguj się na serwer VPS przez SSH.
2. Przejdź do katalogu projektu na serwerze.
3. Zaktualizuj plik `.env` wartościami produkcyjnymi.
4. Pobierz najnowsze obrazy:

```bash
docker compose -f compose.prod.yml pull
```

5. Uruchom/zaktualizuj usługi:

```bash
docker compose -f compose.prod.yml up -d
```

6. Zweryfikuj status kontenerów:

```bash
docker compose -f compose.prod.yml ps
```

## Konfiguracja SMTP na produkcji

- Konto e-mail dla produkcji znajduje się na `home.pl`.
- Dostęp do skrzynki i danych logowania ma sekretarz.
- Wartości `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`/`EMAIL_USE_SSL` w `.env` muszą odpowiadać konfiguracji SMTP z `home.pl`.

## Kopie zapasowe i bezpieczeństwo danych

- Za automatyczne backupy odpowiada kontener `backup`, który uruchamia skrypt `/usr/local/bin/backup.sh`.
- Harmonogram i retencja backupów są konfigurowane przez zmienne `BACKUP_SCHEDULE`, `BACKUP_RETENTION_DAYS`, `BACKUP_ON_START`, `TZ`.
- Backupy są zapisywane lokalnie na VPS (wolumen Docker `backups`), dlatego nie mogą być traktowane jako jedyne źródło odtwarzania.

Przykładowe ręczne uruchomienie backupu:

```bash
docker compose -f compose.prod.yml exec backup /usr/local/bin/backup.sh
```

### Wymóg operacyjny

- Należy okresowo przenosić pliki backupów z serwera VPS na inną, niezależną maszynę (off-site backup) w celach bezpieczeństwa.
- Rekomendacja: wykonywać eksport poza VPS co najmniej raz w tygodniu oraz po każdej większej zmianie produkcyjnej.
- Po przeniesieniu backupy powinny być przechowywane w lokalizacji z kontrolą dostępu.

