# Weryfikacja zgłoszeń użytkowników

Data weryfikacji: `2026-06-02`. Ostatnia aktualizacja: `2026-10-26`.

Dokument zawiera przegląd zgłoszeń od użytkowników wraz ze statusem w aktualnej wersji systemu. Uzupełniony o ustalenia ze spotkania wizyjnego (2026-08-13) i decyzji produktowych (w tym doprecyzowanie mapki 2026-10-06; edytor layoutu 2026-10-26).

## Już wdrożone

- Podgląd wysłanych plików jest dostępny:
  - etap 2 (logo na fryz dla stoiska organizatora, certyfikat ppoż. dla własnej zabudowy),
  - etap 4 (logo do katalogu),
  - widok FR (podgląd etapów) również ma linki do plików.
- W tabeli firm po stronie staff jest licznik ukończonych etapów (`x/5`).
- Filtry listy firm / zaproszeń (m.in. status zaproszenia, status firmy); eksport CSV tylko dla zaznaczonych firm (zaznaczenie trzyma się widocznych po filtrze wierszy).
- Zaproszenia można anulować (status `cancelled`) z poziomu panelu staff; trwałego usuwania rekordu w panelu staff nie planujemy — ewentualne usuwanie tylko z panelu admina Django.
- Mail zaproszeniowy wyraźnie wyróżnia login firmy (dedykowane, wizualnie wyróżnione pole w szablonie HTML i plain text).
- Logowanie loginem firmy lub adresem e-mail (bez rozróżniania wielkości liter); spójne nazewnictwo „login” w UI i tłumaczeniach PL/EN.
- Mail do opiekuna FR po przesłaniu lub poprawie etapu (sygnał „oczekuje na akceptację”); bez ponownego maila przy kolejnym zapisie tego samego etapu w statusie pending.
- Automatyczne przypomnienia o zbliżającym się wygaśnięciu zaproszenia (do wystawcy i opiekuna); progi dni, liczba przypomnień (`0` = wyłączone) i ważność nowych linków w `Settings` (Invitation settings).
- Etap 5: obiady i delegaci — jawna decyzja, UX uznany za wystarczający (bez dalszych zmian w tym zakresie).
- Etap 3 (warsztaty): tylko dla statusów `main` / `partner`; `basic` pomija etap 3. Świadomy wybór tak/nie oraz dedykowane pola kontaktowe (telefon ds. warsztatów, lista prowadzących).
- Wersja robocza etapu: przycisk „Zapisz wersję roboczą”; status „Firemka wciąż edytuje”; FR może podejrzeć draft; akceptacja / odrzucenie dopiero po „Prześlij”.
- Backup bazy: osobny serwis Docker + harmonogram cron i retencja (WBS 2.8).
- Podsumowanie zamówienia: PDF per firma + eksport CSV (WBS 2.9).
- Etap 2: checkbox mocy elektrycznej (`el_power_acknowledged`); etap 5: pola mocy / urządzeń.
- Etap 2 / własna zabudowa: certyfikat niepalności opcjonalny przy przesłaniu; deadline i auto „wymaga poprawy” bez pliku (job `auto_reject_missing_fire_certs`).
- Etap 2 / wyposażenie: kosz i wieszak w pakiecie (firma nie odznacza); wieszak ukryty przy własnej zabudowie; TV — wybór montażu (stojak / ściana) wg reguł typu stoiska.
- Etap 4 / Jobwall: liczba darmowych ogłoszeń w `Settings` (`jobwall_free_count`, domyślnie 2); koszt tylko za kolejne; limity długości (opis katalogu 1700, ciało oferty 2000); linki do Katalog / Oferty Pracy na stronie targów.
- Mapka stoisk (layout w bazie, bez statycznych SVG):
  - kanoniczna numeracja wspólna dla dnia 1 i 2 (styl `A7a` / `A10b`, nie `A1.A`);
  - staff: edytor podziału torów (łączenie / rozłączanie 4/6/8/12 m², warianty etykiet, sync dnia 2, ostrzeżenia przy zajętych, reset mapy dla admina);
  - staff: dialog przypisania stoiska z mapą (zajęte miejsca innych firm, konflikt przy podwójnym numerze);
  - firma: mapa z API — widzi tylko własne stoisko; jedno stoisko na konto / dzień.

## Częściowo wdrożone / wymaga doprecyzowania

- Etap 2 / własna zabudowa: rdzeń jest (typ stoiska, certyfikat, wizualizacja); dalej brakuje m.in. podglądu mebli, wykładziny i doprecyzowań formularza (punkty poniżej).
- Mapka stoisk: rdzeń edycji i przypisania jest; brak rezerwacji roboczej oraz arkuszy planowania / eksportu (WBS 4.5 + mapa poniżej).
- Dzień wystawy + rozmiar stoiska (ew. pakiet): na razie uzupełnia FR (firma ma widzieć ustalone wartości, bez edycji); finalny model zbierania tych danych — do dalszego ustalenia.

## Braki do realizacji

- **Mapka / plan hali** (pozostałości po edytorze 2026-10-26):
  - rezerwacja robocza vs ostateczne przypisanie;
  - docelowo: arkusze planowania w systemie + eksport (zamiast równoległych Exceli).
- **Firmy „tylko na mapkę”:** nowy typ wystawcy (okrojone konto, obok `basic` / `main` / `partner`) — firma widnieje na planie bez pełnego wypełniania etapów.
- **Import Excela z Google Forms** (nie Forms bezpośrednio) do systemu — prefills / wczesne zgłoszenia; termin: przed oddaniem systemu (~1.11).
- **Jobwall / E-JobWall:** dedykowany eksport / skrypt i integracja ze stroną WWW (WBS 4.6) — darmowe ogłoszenia w panelu już są.
- **Etap 2 / wyposażenie:** podgląd wizualny mebli (np. hover); kolor wykładziny z paletą (głównie partnerzy); wyjaśnienie własna vs standardowa zabudowa; wymiary własnej zabudowy osobnymi polami (nie free text); pole „co przywiozą”.
- **Etap 5:** godzina przyjazdu (WBS 2.5).
- **Anulowanie zaproszenia:** w dialogu opcja ustawienia statusu „Firma rezygnuje” (sygnał dla logistyki / Excela).
- **Integracja System ↔ strona WWW** (API / skrypt) — poza core panela; zakres do ustalenia (WBS 4.4).
- **Role i arkusze w panelu:** kolejność — najpierw arkusz logistyki w systemie (sukces) → rola logistyka → potem inne arkusze i role (FR, TR / warsztaty). Obecnie jeden panel `staff` (WBS 2.2).

## Niejasne / do decyzji

- Finalny model zbierania dnia wystawy + rozmiaru (ew. pakietu) — na razie FR; czy na stałe, czy też Forms / firma — otwarte.
- Stolik kwadratowy — czy wraca do katalogu wyposażenia w tej edycji.

## Rekomendowany priorytet

1. Import Excela z Forms (przed ~1.11) + dzień/rozmiar widoczne dla firmy (FR uzupełnia).
2. Mapka: najpierw rezerwacje robocze (miejsce „wzięte” bez finalnego przypisania) i arkusz planowania hali w panelu zamiast Excela; potem osobne role (np. logistyk); na końcu typ firmy „tylko na mapkę” (na planie bez pełnych etapów).
3. Jobwall: eksport / integracja E-JobWall ze stroną.
4. Etap 2: meble / wykładzina / doprecyzowanie formularza własnej zabudowy.
5. Godzina przyjazdu; status „Firma rezygnuje” przy anulowaniu; nowy typ wystawcy (okrojone konto).
