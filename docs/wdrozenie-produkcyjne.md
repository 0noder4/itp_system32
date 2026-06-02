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

