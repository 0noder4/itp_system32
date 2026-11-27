# Weryfikacja zgłoszeń użytkowników

Data pierwszej weryfikacji: `2026-06-02`. Ostatnia aktualizacja: `2026-11-24`.

Dokument zbiera zgłoszenia i decyzje produktowe od startu projektu (w tym ustalenia ze spotkania 2026-08-13 i późniejszych przeglądów) oraz porównuje je z obecnym stanem kodu.

## Już wdrożone

- Podgląd wysłanych plików w panelu firmy i w podglądzie FR (etap 2: logo na fryz, certyfikat ppoż. i wizualizacja własnej zabudowy; etap 4: logo do katalogu). Przy zabudowie organizatora plik logo na fryz jest opcjonalny.
- Lista firm i filtry po stronie staff: licznik ukończonych etapów (`x/5`), wielokrotne filtry w oknie „Edytuj filtry” (statusy, opiekun FR, opiekun firmy, status etapu), oznaczenie języka `EN` przy firmie, zbiorcze okno „Eksportuj” (XLSX, CSV oraz paczka ZIP z mediami i opcjonalnymi PDF-ami zamówienia, z wyborem sekcji i zakresu zaznaczonych firm).
- Zaproszenia firm:
  - anulowanie zaproszenia z opcjonalnym oznaczeniem „Firma rezygnuje” (`CompanyInvitation.is_resigned`, osobny status `resigned` i filtr na liście),
  - limit 100 znaków nazwy firmy z podpowiedzią, że nazwa jest loginem w mailu powitalnym,
  - możliwość podania przy zaproszeniu opcjonalnego planowanego rozmiaru stoiska (4/6/8 m²) i liczby dni (1/2), dzięki czemu firma od razu widzi cenę pakietu w etapie 1,
  - automatyczne przypomnienia przed wygaśnięciem linku (do wystawcy i opiekuna) z progami dni i ważnością linków w `Settings`.
- Zaproszenia staff: osoba z rolą `fr` zaprasza Opiekunów z poziomu Panelu FR, a `admin` także członków `FR`, `LG` i `TR` (ze skróconym wpisywaniem adresu Best, wystarczy nazwa przed `@`).
- Logowanie loginem firmy lub adresem e-mail (bez rozróżniania wielkości liter); spójne nazewnictwo „login” w UI i tłumaczeniach PL/EN.
- Powiadomienia FR po przesłaniu lub poprawie etapu (bez dublowania maila przy kolejnym zapisie tego samego etapu w statusie pending).
- Wersja robocza etapu: przycisk „Zapisz wersję roboczą”, status „Firemka wciąż edytuje”, podgląd draftu po stronie FR, a ocena dopiero po „Prześlij”.
- Etap 2 (wyposażenie i zabudowa):
  - obowiązkowa wykładzina: partnerzy wybierają typ (`RIPS EXPO` / `WELUR EXPO`) i kolor z palety (wzornik wgrywany w `Settings`), a pozostali wystawcy dostają automatycznie `RIPS EXPO 892 szary` bez opcji rezygnacji,
  - rozdzielone 3 pola wymiarów własnej zabudowy (długość, szerokość, wysokość) oraz osobne pole na sprzęt przywożony przez firmę (`brought_equipment`), oba widoczne w arkuszach,
  - certyfikat niepalności opcjonalny przy przesłaniu + automatyczna zmiana na „wymaga poprawy” po terminie (`auto_reject_missing_fire_certs`),
  - kosz i wieszak w pakiecie (wieszak ukryty przy własnej zabudowie), TV z wyborem montażu stojak/ściana, stolik kwadratowy (`square_table`) w katalogu wyposażenia oraz checkbox mocy elektrycznej (`el_power_acknowledged`).
- Etap 3 (warsztaty): tylko dla `main` i `partner` (`basic` pomija ten etap), świadomy wybór tak/nie, preferowany dzień i godzina, udogodnienia sali, telefon ds. warsztatów i lista prowadzących.
- Etap 4 (katalog i JobWall) oraz eksport na stronę WWW (Strapi):
  - limity darmowych ogłoszeń zależą od pakietu i terminu wczesnej rejestracji w `Settings` (`jobwall_free_basic_early`, `jobwall_early_deadline`, `jobwall_free_basic_late`, `jobwall_free_partner`, `jobwall_free_main`) + płatne pakiety dodatkowe `+2` / `+3`,
  - limity długości tekstu (opis katalogu 1700 znaków, treść oferty 2000 znaków),
  - eksport firm, logo, stoisk, ofert pracy z etapu 4 i mapy hali do Strapi z podglądem karty firmy i ofert, rozróżnieniem statusu „Szkic w Strapi” od pełnej publikacji (`content_published`) oraz usuwaniem opublikowanych wpisów i szkiców z panelu staff.
- Etap 5 i rozliczenia:
  - usunięto godziny przyjazdu z formularza firmy (w arkuszu `LG → Przyjazdy` jest kolumna „Przyjazd od 6:30”, a harmonogram montażu ustala Opiekun),
  - obiady bez wyboru diety w systemie (liczba na dzień 1 i 2, darmowa pula wg pakietu w `Settings`),
  - podpowiedź w podglądzie etapu 5, że listę PDI / gali zbiera Opiekun w Mailu #2 w arkuszu,
  - cennik stoisk i pakietów w `Settings`, edytowalne dodatkowe koszty netto w `FR → Rozliczenia`, podsumowanie kosztów netto w formularzach firmy oraz zwięzły PDF zamówienia (do pobrania także z karty firmy w Panelu FR).
- Mapka stoisk:
  - wspólna kanoniczna numeracja dla dnia 1 i 2 (np. `A7a`, `A10b`), edytor podziału torów (łączenie i rozłączanie 4/6/8/12 m², sync dnia 2, reset dla admina),
  - widoki kolorów (rozmiary stoisk, partnerzy, moje firmy, czysty układ bez firm),
  - przypisywanie stoisk z zajętymi miejscami, usuwanie stoiska dla pojedynczego dnia i odznaczanie kliknięciem,
  - eksport mapy do PNG z legendą (u staff i wystawcy) oraz spłaszczona mapa 2D i lista stoisk w nocnym backupie (`mapa.xlsx`).
- Role i Arkusze (`backend/sheets/`):
  - 4 role `staff` (`fr`, `lg`, `tr`, `opiekun`), jedno konto może mieć kilka ról, menu dostosowane do roli,
  - 4 arkusze (`LG`, `FR`, `TR`, `Opiekun` widzący tylko swoje firmy), edycja w siatce z cofnij/ponów i kolorami,
  - komentarze z `@wzmiankami` i dzwonkiem powiadomień, propozycje zmian, wersje robocze pól formularza (z zapisem do bazy i przywracaniem),
  - własne kolumny (tekst, opis, pliki mediowe) i własne kategorie z przeciąganiem w ustawieniach arkusza,
  - zakładki montażu (poniedziałek–środa), Welcome packi, Obiady Beściaków (razem z ręcznymi gośćmi bez konta),
  - eksport CSV, XLSX i ZIP mediów z arkusza.
- FAQ i bezpieczeństwo danych:
  - dynamiczna lista FAQ (PL/EN) zarządzana z panelu staff (rola `fr`),
  - backup MySQL co 6 h, nocny backup `mediafiles`, nocny eksport ratunkowy XLSX (4 pliki zespołów + `mapa.xlsx` + `wszystkie-arkusze.xlsx`), alerty e-mail przy awarii oraz skrypt `pre-deploy-backup.sh`.

## Częściowo wdrożone / wymaga doprecyzowania

- **Etap 2 / wyposażenie:** mechanika i dane są gotowe, ale w formularzu nadal nie ma wizualnego podglądu (zdjęć) mebli.
- **Mapka stoisk:** edycja układu i przypisywanie działają w pełni, brakuje jedynie rozróżnienia na rezerwację roboczą i ostateczne przypisanie.
- **Dzień wystawy i rozmiar stoiska:** FR może ustawić planowany rozmiar i liczbę dni w zaproszeniu lub później przez mapę/arkusz, ale docelowy sposób zbierania tych danych (czy zostaje po stronie FR, czy wchodzi też z zewnętrznego arkusza) nie jest jeszcze zamknięty.

## Braki do realizacji

- **Rezerwacja robocza na mapie hali:** stan „wstępnie zajęte” przed ostatecznym przypisaniem stoiska.
- **Firmy „tylko na mapkę”:** okrojone konto wystawcy (obok `basic`, `main`, `partner`), które pojawia się na planie hali bez przechodzenia przez pełne etapy formularza.
- **Import Excela z Google Forms:** wczytywanie wczesnych zgłoszeń / prefilli z pliku Excela do systemu.
- **Etap 2 (UX):** zdjęcia lub podgląd pozycji wyposażenia (np. po najechaniu) oraz ewentualnie krótkie wyjaśnienie różnicy między zabudową własną a standardową, jeśli firmy nadal ją mylą.
- **E-JobWall:** osobny eksport lub integracja dla ekranów/listy E-JobWall, jeśli ma działać niezależnie od obecnego eksportu ofert z etapu 4 do katalogu na stronie WWW.

## Niejasne / do decyzji

- Czy obecny model wpisywania planowanego rozmiaru stoiska i liczby dni przez FR w zaproszeniu wystarcza na stałe, czy ma dojść import z Forms lub wybór po stronie firmy.

## Rekomendowany priorytet

1. Import Excela z Google Forms (jeśli zespół nadal zbiera wczesne deklaracje poza systemem).
2. Rezerwacje robocze na mapie hali oraz typ firmy „tylko na mapkę”.
3. Podgląd zdjęć mebli w Etapie 2.
4. Ewentualny osobny eksport pod E-JobWall (poza obecnym katalogiem WWW).

## Pomysły na przyszłość

### Asystent AI w systemie

Pomysł zakłada dodanie wbudowanego czatu (np. przycisku i wysuwanego panelu w rogu ekranu), który odpowiada na pytania wystawców po polsku lub po angielsku, a po stronie staff pomaga szybciej wyłapać braki w danych firm.

Najrozsądniej wdrożyć to w dwóch krokach:
1. **Poziom 1 (asystent pomocy, bez dostępu do bazy):** model dostaje w kontekście treść FAQ, instrukcję formularzy, terminy edycji oraz wybrany język użytkownika (`pl`/`en`). Wystawca dostaje od razu odpowiedź np. co wolno przy własnej zabudowie albo do kiedy trzeba wgrać certyfikat ppoż., bez ryzyka wycieku danych innych firm.
2. **Poziom 2 (odczyt danych przez wybrane funkcje w Django):** po stronie backendu można wystawić kilka prostych narzędzi read-only (np. sprawdzenie braków w formularzu danej firmy albo dla staffu lista firm bez akceptacji etapu). Uprawnienia zawsze wymusza Django po tokenie JWT: konto `company` widzi wyłącznie własną firmę, a `staff` tylko zakres swoich ról.

Jak spiąć to technicznie w `itp_system32`:
- Osobna aplikacja w Django (np. `backend/assistant/`) i endpoint `POST /api/assistant/chat/` za istniejącym JWT. Klucz API leży wyłącznie w `.env` backendu (nigdy w zmiennych `NEXT_PUBLIC_*` na froncie).
- Na start zwykłe żądanie JSON z limitem czasu odpowiedzi (streaming SSE wymagałby zmiany konfiguracji synchronicznego Gunicorna).
- Ochrona budżetu: limit zapytań na użytkownika (throttling w DRF), limit długości wiadomości i historii rozmowy.
- Po stronie Next.js okno czatu na istniejącym Radix UI, z renderowaniem odpowiedzi przez zainstalowane już `react-markdown` i tłumaczeniami w `next-intl`.

Skąd wziąć dostawcę AI:
- **OpenRouter:** jeden klucz API zgodny ze standardem OpenAI, łatwa podmiana modelu bez zmian w kodzie i wygodny prepaid (np. doładowanie 5–10 USD z twardym limitem wydatków, przy ruchu targowym koszt to zwykle kilka–kilkanaście zł miesięcznie).
- **Google Gemini API:** bardzo tanie i szybkie modele z serii Flash, dobrze radzą sobie po polsku. Uwaga: na darmowym planie dane mogą służyć do trenowania modeli, więc przy danych firm trzeba włączyć płatny rozliczeniowo tier z alertem budżetowym.
- **Mistral API:** dostawca z UE (prostsze tematy RODO) i niskie ceny lekkich modeli.
- **Lokalny model (Ollama na VPS):** odpada przy obecnym serwerze bez GPU, bo na samym CPU działa za wolno i podnosi koszt hostingu bardziej niż API.
