# Weryfikacja zgłoszeń użytkowników

Data weryfikacji: `2026-06-02`. Ostatnia aktualizacja: `2026-09-23`.

Dokument zawiera przegląd zgłoszeń od użytkowników wraz ze statusem w aktualnej wersji systemu. Uzupełniony o ustalenia ze spotkania wizyjnego (2026-08-13) i decyzji produktowych.

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

## Częściowo wdrożone / wymaga doprecyzowania

- Etap 2 / własna zabudowa: rdzeń jest (typ stoiska, certyfikat, wizualizacja); dalej brakuje m.in. podglądu mebli, wykładziny i doprecyzowań formularza (punkty poniżej).
- Mapka stoisk: podgląd i przypisanie jednego stoiska na dzień działają; brak wielu stoisk / łączenia rozmiarów / rezerwacji roboczej (WBS 4.5 + mapa poniżej).
- Dzień wystawy + rozmiar stoiska (ew. pakiet): na razie uzupełnia FR (firma ma widzieć ustalone wartości, bez edycji); finalny model zbierania tych danych — do dalszego ustalenia.

## Braki do realizacji

- **Mapka / plan hali:** wiele stoisk jednej firmy tego samego dnia, łączenie rozmiarów, rezerwacja robocza vs ostateczne przypisanie, firma nie widzi mapy roboczej. Docelowo: arkusze planowania w systemie + eksport (zamiast równoległych Exceli).
- **Firmy „tylko na mapkę”:** nowy typ wystawcy (okrojone konto, obok `basic` / `main` / `partner`) — firma widnieje na planie bez pełnego wypełniania etapów.
- **Import Excela z Google Forms** (nie Forms bezpośrednio) do systemu — prefills / wczesne zgłoszenia; termin: przed oddaniem systemu (~1.11).
- **Jobwall:** logika i komunikat „2 pierwsze ogłoszenia darmowe, kolejne płatne” + dedykowany eksport / skrypt pod E-JobWall (WBS 4.6).
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
2. Mapka: wiele stoisk / rezerwacja; potem arkusze w systemie → role.
3. Jobwall: „2 pierwsze darmowe” + eksport E-JobWall.
4. Etap 2: meble / wykładzina / doprecyzowanie formularza własnej zabudowy.
5. Godzina przyjazdu; status „Firma rezygnuje” przy anulowaniu; nowy typ wystawcy (okrojone konto).
