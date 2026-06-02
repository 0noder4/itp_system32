# System32

System32 to aplikacja webowa do zarządzania partnerami Targów Pracy.

## O projekcie

Projekt składa się z:

- `frontend` - aplikacji Next.js,
- `backend` - API Django REST,
- `db` - bazy danych MySQL,
- usług pomocniczych do testów i utrzymania.

Domyślnie aplikacja uruchamiana jest kontenerowo przez Docker Compose.

## Szybki start

1. Skopiuj plik `.env.example` do `.env` i uzupełnij wymagane zmienne:

```bash
cp .env.example .env
```

2. Uruchom środowisko:

```bash
docker compose up -d --build
```

3. Otwórz usługi:
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:8000](http://localhost:8000)

## Dokumentacja

Szczegółowa dokumentacja znajduje się w katalogu `docs`:

- [Architektura systemu](./docs/architektura-systemu.md) - kontenery, porty i przeznaczenie usług.
- [Instrukcja uruchomienia środowiska testowego](./docs/srodowisko-testowe.md) - konfiguracja i uruchomienie środowiska lokalnego.
- [Zmienne środowiskowe `.env`](./docs/zmienne-srodowiskowe-env.md) - pełna lista zmiennych, miejsca użycia i przeznaczenie.
- [Wdrożenie produkcyjne](./docs/wdrozenie-produkcyjne.md) - informacje o VPS (`home.pl`), dostępie SSH i aktualizacji usług.
- [Zgłoszenia użytkowników](./docs/zgloszenia-uzytkownikow.md) - zweryfikowana lista zgłoszeń z podziałem na wdrożone elementy i braki.
- [Panel admina i `Settings`](./docs/panel-admina-i-settings.md) - opis możliwości panelu administracyjnego i globalnych ustawień systemu.

## Wdrożenie produkcyjne

Instrukcja wdrożenia produkcyjnego: [docs/wdrozenie-produkcyjne.md](./docs/wdrozenie-produkcyjne.md).

Potok CI/CD (GitHub Actions) automatycznie:

- uruchamia testy dla push i pull requestów,
- buduje i publikuje obrazy Docker po mergu do gałęzi `main`,
- umożliwia wdrożenie na środowisko produkcyjne.

## Kontakt

- Kontakt techniczny: `bartosz.kuklewski@best.pw.edu.pl`.
- System został przygotowany na potrzeby 32. edycji Targów Pracy.
- W sprawach organizacyjnych i sposobu pracy z formularzami można konsultować się z osobami, które korzystały z systemu.
## Zespół

Podziękowania dla zespołu projektowego:

- Patrycja Lubowiecka
- Dominika Zarzycka
- Norbert Roszkowski
