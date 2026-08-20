# Rodzaje kont w systemie i jak je utworzyć

Dokument opisuje typy kont użytkowników w System32 oraz praktyczne sposoby ich tworzenia.

## Typy kont

W systemie funkcjonują trzy typy kont:

- `admin` - pełny dostęp administracyjny,
- `staff` - zespół operacyjny (obsługa firm, zaproszeń i etapów),
- `company` - konto przedstawiciela firmy wystawiającej się na targach.

## Uprawnienia w skrócie

- `admin` i `staff` mają dostęp do operacji staffowych (np. zaproszenia, lista staff).
- `company` ma dostęp do własnych danych i etapów formularza swojej firmy.

## Jak tworzyć konta

### 1) Konto `admin`

Rekomendowana metoda (na serwerze/VPS):

```bash
docker compose -f compose.prod.yml exec backend python manage.py createsuperuser
```

Po utworzeniu konto można edytować w panelu `/admin` (w tym pole `type` ustawione na `admin`).

### 2) Konto `staff`

Konto `staff` tworzymy przez panel Django Admin:

1. Zaloguj się do `/admin` kontem administratora.
2. Wejdź do `users -> User -> Add`.
3. Uzupełnij dane użytkownika i hasło.
4. Ustaw pole `type` na `staff`.
5. Zapisz użytkownika.

### 3) Konto `company`

Konto `company` tworzy się przez proces zaproszenia:

1. Użytkownik `admin`/`staff` wysyła zaproszenie do firmy.
2. System wysyła mail z linkiem rejestracyjnym. Ważność tokenu ustawia się w panelu admina (`Settings` → Invitation settings, pole `invitation_validity_days`; domyślnie 7 dni). Zmiana tego pola dotyczy tylko **nowych** zaproszeń.
3. Przedstawiciel firmy otwiera link i ustawia hasło.
4. System automatycznie tworzy konto użytkownika typu `company` oraz rekord firmy.

## Ważne zasady operacyjne

- Konta `company` nie tworzymy ręcznie w panelu admina, jeśli ma działać pełny flow zaproszeń i powiązanie z firmą.
- Jeśli zaproszenie wygaśnie lub zostanie anulowane, należy wystawić nowe zaproszenie.
- Login firmy w procesie zaproszenia jest oparty o nazwę firmy (`company_name`), a nie losowy identyfikator.
