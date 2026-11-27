# Panel admina i ustawienia `Settings`

Dokument opisuje, do czego służy panel administracyjny Django oraz jakie elementy systemu są kontrolowane przez model `Settings`.

## Cel panelu admina

Panel admina (`/admin`) służy do operacyjnego zarządzania danymi systemu bez zmian w kodzie:

- przegląd i edycja firm oraz zaproszeń,
- przegląd statusów formularzy i feedbacków etapów,
- konfiguracja cennika, limitów pakietów i terminów globalnych,
- zarządzanie kontami użytkowników (staff/admin/company) oraz ich rolami,
- utrzymanie słowników wyposażenia, ich cen oraz pytań FAQ.

## Dostępne obszary administracyjne

### `companies`

- `Company` - lista firm, filtrowanie, wyszukiwanie, edycja danych podstawowych, pakietu, dodatkowych kosztów netto i przypisań (`fr_resp`, `opiekun`).
- `CompanyInvitation` - zarządzanie zaproszeniami dla firm (w tym statusy anulowania i rezygnacji firmy).
- `InvitationExpiryReminderSent` - rejestr wysłanych przypomnień o zbliżającym się wygaśnięciu zaproszeń (osobno dla wystawcy i opiekuna FR).
- `Form` - podgląd obiektu śledzącego postęp etapów.
- `Feedback` - podgląd i edycja statusów akceptacji etapów.
- `EquipmentItem` - konfiguracja pozycji wyposażenia (PL/EN, cena, ilości w pakiecie, aktywność, kod specjalnych właściwości).
- `EquipmentSelection` - podgląd wybranych pozycji wyposażenia przez firmy (w tym `mount_type` dla TV).
- `WebsitePublication` - podgląd statusu synchronizacji firmy i ofert ze Strapi (`content_published`, `strapi_document_id`, ostatni błąd).
- `FAQItem` - pytania i odpowiedzi FAQ (PL/EN, kategorie, kolejność, aktywność) wyświetlane wystawcom.
- `Settings` - centralna konfiguracja cen, limitów, terminów etapów, terminów maili i dat targowych.

### Checklista katalogu wyposażenia (etap 2, reguły UI)

Reguły formularza opierają się na polu **kod specjalnych właściwości** (`code`), nie na nazwie PL. Ustaw lokalnie i na produkcji w Django Admin -> Equipment items (lista rozwijana):

| kod | Co zrobić |
|---|---|
| `hanger` | Utwórz/aktywuj **Wieszak** (PL/EN), `is_basic=True`, `included_quantity=1`, `is_active=True`, kod=`hanger`. |
| `trashbin` | Utwórz/aktywuj **Kosz** (PL/EN), `is_basic=True`, `included_quantity=1`, `is_active=True`, kod=`trashbin`. |
| `square_table` | Utwórz/aktywuj **Stolik kwadrat** (PL/EN), cena, `is_active=True`, kod=`square_table`. |
| `tv` | Na pozycji Monitor / TV ustaw kod=`tv` (wybór montażu stojak/ściana). |
| `arc_counter` | Na pozycji Lada łukowa ustaw kod=`arc_counter` (ostrzeżenie w UI / viewer FR). |

Nie kopiuj automatycznie katalogu z produkcji migracją danych, uzupełnij go ręcznie w adminie.

### `users`

- `User` - zarządzanie kontami, typami kont (`admin`, `staff`, `company`), rolami staff (`staff_roles`: `fr`, `lg`, `tr`, `opiekun`), językiem i danymi kontaktowymi.
- `StaffInvitation` - podgląd zaproszeń wysłanych do nowych kont staff (rola, język, ważność tokenu).
- `PasswordResetRequest` - podgląd żądań resetu hasła (token, ważność, zużycie).

### `sheets`

W panelu admina dostępnych jest 11 modeli pomocniczych do podglądu i audytu danych z arkuszy: m.in. `SheetCellValue`, `SheetCellChange` (historia zmian), `SheetLayoutDefault` (domyślne układy zakładek), `SheetCellStyle`, `SheetCellComment`, `SheetNotification`, `SheetCustomColumn`, `SheetCustomGroup`, `StaffMeal`, `StaffMealGuest` (ręcznie dodani goście obiadów Beściaków) oraz `StaffMealChange`.

## Model `Settings` - co kontroluje

Model `Settings` jest globalny (singleton) i służy do konfiguracji zachowania systemu na poziomie całej aplikacji.

### 1. Cennik stoisk i pakietów partnerskich (netto)

- `stand_price_4m2_1d`, `stand_price_4m2_2d`, `stand_price_6m2_1d`, `stand_price_6m2_2d`, `stand_price_8m2_1d`, `stand_price_8m2_2d`, `stand_price_12m2_1d`, `stand_price_12m2_2d` - ceny stoisk dla pakietu Wystawca (`0` oznacza wycenę indywidualną).
- `partner_package_price`, `main_partner_package_price` - ceny dwudniowych pakietów ze stoiskiem 8 m² dla Partnera i Partnera Głównego.

### 2. JobWall - limity i pakiety (netto)

- `jobwall_free_basic_early`, `jobwall_early_deadline`, `jobwall_free_basic_late` - liczba darmowych ogłoszeń dla Wystawcy w okresie wczesnej rejestracji (włącznie z datą `jobwall_early_deadline`) oraz po tym terminie.
- `jobwall_free_partner`, `jobwall_free_main` - liczba darmowych ogłoszeń dla Partnera i Partnera Głównego.
- `jobwall_pack_2_price`, `jobwall_pack_3_price`, `jobwall_max_extra_offers` - ceny netto pakietów dodatkowych (`+2` i `+3` oferty ponad limit pakietu) oraz maksymalny limit płatnych ofert dodatkowych.
- (Pola `jobwall_price` i `jobwall_free_count` pozostały w bazie głównie ze względów kompatybilności z wcześniejszą wersją API `JobwallPriceView`; aktywne wyliczanie kosztów korzysta z powyższych limitów i pakietów.)

### 3. Obiady - limity i cena (netto)

- `lunches_free_basic`, `lunches_free_partner`, `lunches_free_main` - liczba darmowych obiadów dziennie w zależności od pakietu.
- `lunch_price` - cena netto dodatkowego obiadu ponad darmową pulę (udostępniana także przez `LunchPriceView`).

### 4. Edycja i daty targów

- `edition_number` - numer edycji (domyślnie 33), widoczny jako „System N” w panelu i w tytule karty przeglądarki, udostępniany przez publiczny endpoint `GET /api/edition/`.
- `day1_date`, `day2_date` - daty dni targów używane w UI, e-mailach, PDF-ach oraz przy wyliczaniu terminu certyfikatów ppoż. (`auto_reject_missing_fire_certs`).

### 5. Terminy etapów formularza

- `stage_1_deadline` ... `stage_5_deadline` - globalne terminy dla kolejnych etapów, prezentowane wystawcom informacyjnie (nie blokują technicznie zapisu formularza) i udostępniane przez `StageDeadlinesView`.

### 6. Terminy wysyłki maili (Arkusze)

- `mail_1_send_by` ... `mail_5_send_by` - orientacyjne daty wysyłki maili `MAIL #1–#5` (potwierdzenie zamówienia, gala PDI, informator/parking, imienne zaproszenie PDI, powitanie na targach), wyświetlane w nagłówkach grup w arkuszach i pobierane przez `GET /api/sheets/mail-deadlines/`.

### 7. Zaproszenia i przypomnienia

W sekcji **Zaproszenia i przypomnienia**:

- `invitation_validity_days` - ważność **nowo utworzonych** linków zaproszenia (1–30 dni, domyślnie 7). Nie przesuwa już wysłanych zaproszeń.
- `invitation_reminder_count` - liczba automatycznych przypomnień o zbliżającym się wygaśnięciu (0–3). **`0` wyłącza** przypomnienia.
- `invitation_reminder_1_days` ... `invitation_reminder_3_days` - ile dni przed wygaśnięciem wysłać kolejne przypomnienie (bez duplikatów i mniejsze niż `invitation_validity_days`).

Przypomnienia idą do adresu zaproszenia oraz do opiekuna (`created_by`), jeśli ma e-mail. Każdy odbiorca jest oznaczany osobno (`InvitationExpiryReminderSent.recipient`), więc awaria maila do staff nie powoduje ponownego wysłania do wystawcy.

### 8. Adresy e-mail kontaktowe

W sekcji **Adresy e-mail kontaktowe**:

- `general_contact_email` - ogólny kontakt w mailach do firm/wystawców (domyślnie `best@best.pw.edu.pl`).
- `system_admin_email` - kontakt do administratora systemu w mailach do staff/FR oraz adres odbiorczy alertów błędu backupu bazy/mediów i nocnego eksportu `.xlsx` (domyślnie `admin@example.com`; na produkcji ustaw właściwy adres w adminie).

### 9. Dokumenty i pliki

W sekcji **Dokumenty i pliki**:

- `terms_pdf` - plik PDF regulaminu pokazywany firmom przy zapisie etapu 1 (`GET /api/terms-pdf/`). Gdy brak pliku, frontend pokazuje komunikat zamiast martwego linku.
- `carpet_catalog_image` - wzornik kolorów wykładzin RIPS/WELUR pokazywany partnerom w etapie 2 (`GET /api/carpet-catalog/`).

Oba pliki wgrywa się w adminie bez redeployu frontendu; stare pliki po podmianie mogą wymagać ręcznego usunięcia z dysku.

## Ograniczenia i zasady działania `Settings`

- W panelu admina można mieć tylko jeden rekord `Settings`.
- Dodanie nowego rekordu jest zablokowane, jeśli rekord już istnieje.
- Usunięcie rekordu `Settings` jest zablokowane.
- W kodzie aplikacji konfiguracja jest pobierana przez `Settings.get_settings()`, co gwarantuje istnienie rekordu.

## Kiedy używać panelu admina

Panel admina jest właściwym miejscem do:

- zmiany cennika, limitów pakietów i terminów między edycjami wydarzenia,
- aktywacji/dezaktywacji pozycji wyposażenia i edycji FAQ,
- korekty danych użytkowników, ról staff oraz danych firm,
- operacyjnego monitorowania statusów formularzy i historii zmian w arkuszach.

Panel admina nie służy do wdrożeń, zarządzania kontenerami ani konfiguracji infrastruktury (`.env`, Docker, VPS).
