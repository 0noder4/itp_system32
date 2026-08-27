# Panel admina i ustawienia `Settings`

Dokument opisuje, do czego służy panel administracyjny Django oraz jakie elementy systemu są kontrolowane przez model `Settings`.

## Cel panelu admina

Panel admina (`/admin`) służy do operacyjnego zarządzania danymi systemu bez zmian w kodzie:

- przegląd i edycja firm oraz zaproszeń,
- przegląd statusów formularzy i feedbacków etapów,
- konfiguracja cennika i terminów globalnych,
- zarządzanie kontami użytkowników (staff/admin/company),
- utrzymanie słowników wyposażenia i ich cen.

## Dostępne obszary administracyjne

### `companies`

- `Company` - lista firm, filtrowanie, wyszukiwanie, edycja danych podstawowych i przypisań.
- `CompanyInvitation` - zarządzanie zaproszeniami dla firm.
- `Form` - podgląd obiektu śledzącego postęp etapów.
- `Feedback` - podgląd/edycja statusów akceptacji etapów.
- `EquipmentItem` - konfiguracja pozycji wyposażenia (PL/EN, cena, ilości w pakiecie, aktywność).
- `EquipmentSelection` - podgląd wybranych pozycji wyposażenia przez firmy.
- `Settings` - centralna konfiguracja cen, terminów etapów i dat targowych.

### `users`

- `User` - zarządzanie kontami oraz rolami (`admin`, `staff`, `company`), językiem i danymi kontaktowymi.
- `PasswordResetRequest` - podgląd żądań resetu hasła (token, ważność, zużycie).

## Model `Settings` - co kontroluje

Model `Settings` jest globalny (singleton) i służy do konfiguracji zachowania systemu na poziomie całej aplikacji.

### 1. Cennik

- `jobwall_price` - cena jednostkowa ogłoszenia jobwall.
  - używana przez frontend do wyliczania kosztu etapu jobwall,
  - udostępniana przez endpoint API (`JobwallPriceView`).
- `lunch_price` - cena dodatkowego obiadu (ponad pulę darmową).
  - używana przez frontend do wyliczania kosztu obiadów,
  - udostępniana przez endpoint API (`LunchPriceView`).

### 2. Terminy etapów formularza

- `stage_1_deadline` ... `stage_5_deadline` - globalne terminy dla kolejnych etapów.
  - prezentowane w interfejsie jako informacje dla wystawcy,
  - udostępniane przez endpoint API (`StageDeadlinesView`).

Uwaga: terminy są obecnie informacyjne (nie blokują technicznie zapisu formularza).

### 3. Daty dni targowych

- `day1_date`, `day2_date` - daty dni targów używane w prezentacji danych (UI, e-maile, PDF).
- model zawiera metody formatujące te daty dla PL/EN.

### 4. Ustawienia zaproszeń

W tym samym rekordzie `Settings` (sekcja **Invitation settings**):

- `invitation_validity_days` - ważność **nowo utworzonych** linków zaproszenia (1–30 dni, domyślnie 7). Nie przesuwa już wysłanych zaproszeń.
- `invitation_reminder_count` - liczba automatycznych przypomnień o zbliżającym się wygaśnięciu (0–3). **`0` wyłącza** przypomnienia.
- `invitation_reminder_1_days` … `invitation_reminder_3_days` - ile dni przed wygaśnięciem wysłać kolejne przypomnienie. Aktywne sloty muszą być wypełnione, bez duplikatów i mniejsze niż `invitation_validity_days`.

Przypomnienia idą do adresu zaproszenia oraz do opiekuna (`created_by`), jeśli ma e-mail. Każdy odbiorca jest oznaczany osobno (`InvitationExpiryReminderSent.recipient`), więc awaria maila do staff nie powoduje ponownego wysłania do wystawcy. Command: `python manage.py send_invitation_expiry_reminders` (przy błędach wysyłki kończy się kodem ≠ 0).

### 5. Kontakt e-mail (stopki wiadomości)

W tym samym rekordzie `Settings` (sekcja **Email contact**):

- `general_contact_email` - ogólny kontakt w mailach do firm/wystawców (domyślnie `best@best.pw.edu.pl`).
- `system_admin_email` - kontakt do administratora systemu w mailach do staff/FR (domyślnie generyczny `admin@example.com`; na produkcji ustaw właściwy adres w adminie).

## Ograniczenia i zasady działania `Settings`

- W panelu admina można mieć tylko jeden rekord `Settings`.
- Dodanie nowego rekordu jest zablokowane, jeśli rekord już istnieje.
- Usunięcie rekordu `Settings` jest zablokowane.
- W kodzie aplikacji konfiguracja jest pobierana przez `Settings.get_settings()`, co gwarantuje istnienie rekordu.

## Kiedy używać panelu admina

Panel admina jest właściwym miejscem do:

- zmiany cen i terminów między edycjami wydarzenia,
- aktywacji/dezaktywacji pozycji wyposażenia,
- szybkiej korekty danych użytkowników i firm,
- operacyjnego monitorowania statusów formularzy.

Panel admina nie służy do wdrożeń, zarządzania kontenerami ani konfiguracji infrastruktury (`.env`, Docker, VPS).
