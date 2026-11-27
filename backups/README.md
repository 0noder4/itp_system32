# System backupów ITP System 32

Automatyczny system kopii zapasowych dla bazy MySQL, plików wgranych przez użytkowników (`mediafiles`) oraz nocnej paczki ratunkowej `.xlsx` dla zespołów.

## Jak to działa

1. **Baza danych MySQL (`backup` / `supercronic`):**
   - Harmonogram domyślny: co 6 godzin (`0 */6 * * *`, strefa `Europe/Warsaw`).
   - Zrzut przez `mysqldump --single-transaction --quick --lock-tables=false --routines --triggers --default-character-set=utf8mb4`, kompresja `gzip`, test spójności `gzip -t`.
   - Pliki trafiają do `/backups/<DATABASE_NAME>_YYYYMMDD_HHMMSS[_tag].sql.gz`.
   - Retencja domyślna: `30` dni (`BACKUP_RETENTION_DAYS`).

2. **Pliki `mediafiles` (`backup` / `supercronic`):**
   - Wolumen `mediafiles` jest podpięty **tylko do odczytu (`:ro`)**, żeby proces backupu nie mógł uszkodzić plików produkcji.
   - Harmonogram domyślny: raz dziennie w nocy o `02:30` (`30 2 * * *`, strefa `Europe/Warsaw`).
   - Archiwum `tar --numeric-owner -czf` + weryfikacja `tar -tzf`.
   - Pliki trafiają do `/backups/mediafiles_YYYYMMDD_HHMMSS[_tag].tar.gz`.
   - Retencja domyślna: `14` dni dla kopii nocnych (`MEDIA_BACKUP_RETENTION_DAYS`), `30` dni dla kopii tagowanych (`pre-deploy`, `pre-restore`).

3. **Dynamiczny bezpiecznik miejsca na dysku i blokada współbieżności:**
   - Równoległe uruchomienia (np. cron + ręczny `pre-deploy`) kolejkuje `flock -w 300 /tmp/backup.lock`.
   - Przed dumpem bazy skrypt wymaga minimum `BACKUP_MIN_FREE_GB` (domyślnie `5` GB) wolnego miejsca.
   - Przed archiwizacją `mediafiles` skrypt mierzy bieżący rozmiar katalogu `/mediafiles` i wymaga co najmniej `rozmiar_mediafiles + BACKUP_MIN_FREE_GB`. Jeśli miejsca jest za mało, przerywa i wysyła alert e-mail.
   - Logi `/backups/backup.log` oraz `/backups/cron.log` są automatycznie przycinane do ostatnich 5000 linii.

4. **Nocna paczka ratunkowa `.xlsx` + mapy PNG (`scheduler`):**
   - Raz dziennie w nocy (domyślnie `02:45` `Europe/Warsaw`) kontener `scheduler` uruchamia `python manage.py export_emergency_xlsx`.
   - W `/backups/exports/YYYYMMDD_HHMMSS/` powstaje **6 zweryfikowanych plików `.xlsx`** oraz podfolder **`mapy/`** z **10 widokami mapy hali PNG** (5 widoków × 2 dni):
     - `lg.xlsx` (wszystkie zakładki LG),
     - `fr.xlsx` (wszystkie zakładki FR),
     - `tr.xlsx` (warsztaty TR),
     - `opiekun.xlsx` (pełny widok opiekuna dla wszystkich firm),
     - `mapa.xlsx` (mapa wizualna 2D + lista stoisk),
     - `wszystkie-arkusze.xlsx` (jeden plik zbiorczy z wszystkimi zakładkami),
     - `mapy/mapa-itp-dzien-{1|2}[...].png` (domyślny, `-rozmiary`, `-partnerzy`, `-rozmiary-partnerzy`, `-czysty`).
   - Retencja domyślna: `7` dni (`EXPORT_RETENTION_DAYS`), dla tagowanych `30` dni (`BACKUP_RETENTION_DAYS`).

5. **Synchronizacja off-site na Google Drive (`rclone` + `sync_gdrive.sh`):**
   - Po udanym lokalnym backupie DB lub `mediafiles` (oraz o `03:05` po eksporcie `.xlsx` + mapek PNG), gdy `GDRIVE_SYNC_ENABLED=true`, skrypt `sync_gdrive.sh` synchronizuje dane na Dysk współdzielony Google (`itp-backups`) kontem usługi (`GDRIVE_SERVICE_ACCOUNT_FILE`):
     - `baza-sql/` — zrzuty `.sql.gz`,
     - `excele-ratunkowe/` — historia 7 dni + zawsze aktualny folder `najnowsze/`,
     - `mediafiles/` — rozpakowane pliki firm (bez roboczych `sheet_file_drafts` i `sheet_file_backups`) + podfolder `mapy/` (10 aktualnych PNG),
     - `mediafiles-archiwum-zmian/YYYY-MM-DD/` — automatyczny backup usuniętych/nadpisanych plików (`--backup-dir`, retencja `GDRIVE_MEDIA_ARCHIVE_RETENTION_DAYS=30` dni).
   - Awaria sieci lub Google Drive nie przerywa lokalnego backupu na VPS — wysyła osobny alert e-mail.

6. **Alerty e-mail WYŁĄCZNIE przy awarii:**
   - **Zero maili przy poprawnym wykonaniu** backupu lub eksportu `.xlsx`.
   - W razie błędu alert jest wysyłany przez skonfigurowane SMTP (`home.pl`) na adres `Settings.system_admin_email` z panelu Django Admin (z pominięciem domyślnego placeholdera `admin@example.com`).
   - Skrypt `backup.sh` po cichu zapisuje aktualny adres z tabeli `companies_settings` do `/backups/.admin_email`, dzięki czemu wyśle alert nawet wtedy, gdy padnie sama baza MySQL. Opcjonalnie można też ustawić fallback `BACKUP_ALERT_EMAIL` w `.env`.

---

## Najważniejsze zmienne środowiskowe (`.env`)

| Zmienna | Domyślna wartość | Opis |
|---|---|---|
| `TZ` | `Europe/Warsaw` | Strefa czasowa harmonogramów |
| `BACKUP_SCHEDULE` | `0 */6 * * *` | Cron dla bazy MySQL |
| `BACKUP_RETENTION_DAYS` | `30` | Retencja dumpów DB i paczek tagowanych (dni) |
| `MEDIA_BACKUP_ENABLED` | `true` | Czy wykonywać nocny backup `mediafiles` |
| `MEDIA_BACKUP_SCHEDULE` | `30 2 * * *` | Cron dla `mediafiles` |
| `MEDIA_BACKUP_RETENTION_DAYS` | `14` | Retencja nocnych archiwów `mediafiles` (dni) |
| `BACKUP_MIN_FREE_GB` | `5` | Minimalny zapas wolnego miejsca na `/backups` (GB) |
| `BACKUP_ON_START` | `false` | Czy wykonać pełny backup przy starcie kontenera |
| `BACKUP_ALERT_EMAIL` | *(puste)* | Opcjonalny awaryjny fallback, gdy brak wpisu w `Settings` |
| `EMERGENCY_EXPORT_ENABLED` | `true` | Czy generować nocne paczki `.xlsx` |
| `EMERGENCY_EXPORT_HOUR` | `2` | Godzina nocnego eksportu `.xlsx` (`Europe/Warsaw`) |
| `EMERGENCY_EXPORT_MINUTE` | `45` | Minuta nocnego eksportu `.xlsx` (`Europe/Warsaw`) |
| `EXPORT_RETENTION_DAYS` | `7` | Retencja folderów `.xlsx` (dni) |
| `GDRIVE_SYNC_ENABLED` | `false` | Włącza automatyczną wysyłkę na Google Drive przez `rclone` |
| `GDRIVE_SHARED_DRIVE_ID` | *(puste)* | ID Dysku współdzielonego Google (`0A...`) |
| `GDRIVE_SERVICE_ACCOUNT_FILE` | `/secrets/gdrive-sa.json` | Ścieżka w kontenerze do klucza `.json` konta usługi |
| `GDRIVE_EXPORTS_SYNC_SCHEDULE` | `5 3 * * *` | Cron wysyłki nocnych eksportów `.xlsx` i mapek PNG na Drive |
| `GDRIVE_MEDIA_ARCHIVE_RETENTION_DAYS` | `30` | Retencja skasowanych/nadpisanych plików w `mediafiles-archiwum-zmian/` (dni) |

---

## Obsługa na VPS (komendy)

### Sprawdzenie dostępnych kopii, połączenia z Google Drive i logów
```bash
docker compose -f compose.prod.yml exec backup /usr/local/bin/restore.sh --list
docker compose -f compose.prod.yml exec backup /usr/local/bin/sync_gdrive.sh --check
docker compose -f compose.prod.yml exec backup /usr/local/bin/sync_gdrive.sh --all
docker compose -f compose.prod.yml exec backup tail -n 50 /backups/backup.log
```

### Ręczny backup przed wdrożeniem (`pre-deploy`)
```bash
./scripts/pre-deploy-backup.sh
```
Lub pojedynczo:
```bash
docker compose -f compose.prod.yml exec -T backup /usr/local/bin/backup.sh --tag pre-deploy
docker compose -f compose.prod.yml exec -T scheduler python manage.py export_emergency_xlsx --tag pre-deploy
```

### Ręczne uruchomienie samego DB lub samych `mediafiles`
```bash
docker compose -f compose.prod.yml exec -T backup /usr/local/bin/backup.sh --db-only
docker compose -f compose.prod.yml exec -T backup /usr/local/bin/backup.sh --media-only
```

---

## Odtwarzanie na produkcji (`restore.sh`)

Skrypt `restore.sh` przed nadpisaniem danych weryfikuje sumy/archiwum, wymaga potwierdzenia i automatycznie robi kopię bezpieczeństwa `--tag pre-restore`.

1. Zatrzymaj `backend` oraz `scheduler` na czas odtwarzania, aby nie pisały do bazy ani do `mediafiles`:
   ```bash
   docker compose -f compose.prod.yml stop backend scheduler
   ```
2. Sprawdź nazwy plików backupu:
   ```bash
   docker compose -f compose.prod.yml run --rm backup /usr/local/bin/restore.sh --list
   ```
3. Odtwórz bazę MySQL:
   ```bash
   docker compose -f compose.prod.yml run --rm backup /usr/local/bin/restore.sh --db <nazwa_pliku.sql.gz>
   ```
4. Odtwórz `mediafiles` (montując wolumen jako zapisywalny `/mediafiles_rw`; skrypt wyrówna uprawnienia na `1001:1001` dla `appuser`):
   ```bash
   docker compose -f compose.prod.yml run --rm \
     -v itp_system32_mediafiles:/mediafiles_rw \
     backup /usr/local/bin/restore.sh --media <mediafiles_YYYYMMDD_HHMMSS.tar.gz>
   ```
   *(Nazwę wolumenu sprawdzisz przez `docker volume ls | grep mediafiles`.)*
5. Uruchom ponownie usługi:
   ```bash
   docker compose -f compose.prod.yml start backend scheduler
   ```

---

## Szybkie wydobycie danych dla zespołu (gdy produkcja nie działa)

### Scenariusz A: Gotowe pliki `.xlsx` i grafiki `mediafiles` (1–2 minuty, bez odtwarzania bazy)
1. Pobierz przez MobaXterm SFTP z folderu `backups/paczki/exports/` na VPS najnowszy podfolder `YYYYMMDD_HHMMSS/` — zawiera od razu gotowe `lg.xlsx`, `fr.xlsx`, `tr.xlsx`, `opiekun.xlsx` i `wszystkie-arkusze.xlsx`.
2. Jeśli zespół potrzebuje również logotypów/załączników, pobierz z `backups/paczki/` najnowsze `mediafiles_*.tar.gz` i rozpakuj lokalnie w 7-Zip.

### Scenariusz B: Odtworzenie kopii lokalnie na Twoim komputerze (`compose.yml`)
Gdy potrzebujesz stanu bazy ze starszego dnia albo pełnego interfejsu aplikacji na `localhost:3000`:
1. Pobierz z VPS wybrane archiwa `<db>.sql.gz` oraz `mediafiles_*.tar.gz`.
2. Skopiuj je lub zamontuj do lokalnego `compose.yml`, uruchom `db`:
   ```bash
   docker compose up -d db
   ```
3. Odtwórz bazę lokalnie (np. przez `restore.sh` lub bezpośrednio do `db`):
   ```bash
   gunzip -c <plik.sql.gz> | docker compose exec -T db mysql -u root -p<TWOJE_HASLO_Z_ENV> <NAZWA_BAZY>
   ```
4. Rozpakuj `mediafiles_*.tar.gz` do `./backend/mediafiles/`.
5. Uruchom `docker compose up -d backend frontend` i otwórz `http://localhost:3000`.
