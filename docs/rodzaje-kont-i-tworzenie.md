# Rodzaje kont w systemie i jak je utworzyć

Dokument opisuje typy kont użytkowników w System32, role staffowe oraz praktyczne sposoby zakładania kont.

## Typy kont

W systemie funkcjonują trzy typy kont:

- `admin` - pełny dostęp administracyjny (posiada wszystkie role staff),
- `staff` - zespół operacyjny (obsługa firm, zaproszeń, etapów i arkuszy),
- `company` - konto przedstawiciela firmy wystawiającej się na targach.

## Role w kontach `staff`

Konta `staff` korzystają z listy ról (`staff_roles`). Jedno konto może mieć jedną albo kilka ról:

- `fr` - Panel FR, zaproszenia, przegląd i ocena etapów, eksport na stronę, pełny dostęp do arkuszy i mapy,
- `lg` - arkusz logistyki (`LG`) i mapa stoisk,
- `tr` - arkusz warsztatów (`TR`),
- `opiekun` - arkusz `Opiekun` (tylko firmy przypisane do danego opiekuna).

Dostęp do Panelu FR, Mapy i poszczególnych arkuszy zależy od roli: sam `tr` i sam `opiekun` nie wchodzą do Panelu FR ani na Mapę.

## Uprawnienia w skrócie

- `admin` i `staff` z rolą `fr` mają pełny dostęp do obsługi firm, zaproszeń i przeglądania etapów.
- Pozostałe role `staff` (`lg`, `tr`, `opiekun`) widzą w panelu tylko widoki i arkusze przypisane do swoich ról.
- `company` ma dostęp wyłącznie do danych i etapów formularza własnej firmy oraz podglądu własnego stoiska na mapie.

## Jak tworzyć konta

### 1) Konto `admin`

Rekomendowana metoda (na serwerze/VPS):

```bash
docker compose -f compose.prod.yml exec backend python manage.py createsuperuser
```

Po utworzeniu konto można edytować w panelu `/admin` (w tym pole `type` ustawione na `admin`).

### 2) Konto `staff`

Najwygodniej utworzyć konto przez zaproszenie w Panelu FR (`POST /api/staff-invite/`):

1. Zalogowany użytkownik z rolą `fr` może zaprosić nowego Opiekuna (`opiekun`), a konto `admin` także członków `fr`, `lg` i `tr` (przy wpisywaniu adresu Best wystarczy sama nazwa przed `@`).
2. System wysyła mail z linkiem rejestracyjnym (ważność linku jak przy zaproszeniach firm, z `Settings.invitation_validity_days`).
3. Zaproszona osoba otwiera link i ustawia hasło; jej loginem staje się adres e-mail.

Drugą drogą jest ręczne utworzenie konta lub późniejsza zmiana `staff_roles` w Django Admin (`/admin` -> `users` -> `User`).

### 3) Konto `company`

Konto `company` tworzy się przez proces zaproszenia:

1. Użytkownik `admin` lub `staff` z rolą `fr` wysyła zaproszenie do firmy (określając pakiet oraz opcjonalnie planowany rozmiar stoiska i liczbę dni).
2. System wysyła mail z linkiem rejestracyjnym. Ważność tokenu ustawia się w panelu admina (`Ustawienia systemu` -> `Zaproszenia i przypomnienia`, pole `invitation_validity_days`; domyślnie 7 dni). Zmiana tego pola dotyczy tylko **nowych** zaproszeń.
3. Przedstawiciel firmy otwiera link i ustawia hasło.
4. System automatycznie tworzy konto użytkownika typu `company` oraz rekord firmy.

## Ważne zasady operacyjne

- Konta `company` nie tworzymy ręcznie w panelu admina, jeśli ma działać pełny flow zaproszeń i powiązanie z firmą.
- Jeśli zaproszenie wygaśnie lub zostanie anulowane (w tym oznaczone jako rezygnacja firmy), należy wystawić nowe zaproszenie.
- Nazwa firmy w zaproszeniu ma limit 100 znaków i staje się loginem konta (`company_name`); logowanie działa zarówno tym loginem, jak i adresem e-mail (bez rozróżniania wielkości liter).
