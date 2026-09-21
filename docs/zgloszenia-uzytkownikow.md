# Weryfikacja zgłoszeń użytkowników

Data weryfikacji: `2026-06-02`. Ostatnia aktualizacja: `2026-09-22`.

Dokument zawiera przegląd zgłoszeń od użytkowników wraz ze statusem w aktualnej wersji systemu.

## Już wdrożone

- Podgląd wysłanych plików jest dostępny:
  - etap 2 (logo na fryz dla stoiska organizatora, certyfikat ppoż. dla własnej zabudowy),
  - etap 4 (logo do katalogu),
  - widok FR (podgląd etapów) również ma linki do plików.
- W tabeli firm po stronie staff jest licznik ukończonych etapów (`x/5`).
- Zaproszenia można anulować (status `cancelled`) z poziomu panelu staff; trwałego usuwania rekordu nie planujemy (anulowanie wystarczy).
- Mail zaproszeniowy wyraźnie wyróżnia login firmy (dedykowane, wizualnie wyróżnione pole w szablonie HTML i plain text).
- Logowanie loginem firmy lub adresem e-mail (bez rozróżniania wielkości liter); spójne nazewnictwo „login” w UI i tłumaczeniach PL/EN.
- Mail do opiekuna FR po przesłaniu lub poprawie etapu (sygnał „oczekuje na akceptację”); bez ponownego maila przy kolejnym zapisie tego samego etapu w statusie pending.
- Automatyczne przypomnienia o zbliżającym się wygaśnięciu zaproszenia (do wystawcy i opiekuna); progi dni, liczba przypomnień (`0` = wyłączone) i ważność nowych linków w `Settings` (Invitation settings).
- Etap 5: obiady i delegaci wymagają jawnej decyzji przed finalnym przesłaniem (rezygnacja z obiadów / zamówienie, główny przedstawiciel, brak innych delegatów lub lista delegatów, pokrycie obecności każdego dnia targów).
- Etap 3 (warsztaty): świadomy wybór tak/nie oraz dedykowane pola kontaktowe — telefon ds. warsztatów (z opcją z numerów prowadzących) i lista prowadzących (imię, nazwisko, telefon, opis).
- Wersja robocza etapu: przycisk „Zapisz wersję roboczą” (bez Feedback / maila do FR / CSV); status „Firemka wciąż edytuje”; kolejny etap odblokowuje się po „Prześlij” (nie po samym szkicu).
- FR / staff może podejrzeć dane etapu już przy wersji roboczej (podgląd w panelu firmy); akceptacja / odrzucenie dostępne dopiero po „Prześlij”.
- Backup bazy: osobny serwis Docker + harmonogram cron i retencja (WBS 2.8).
- Podsumowanie zamówienia: PDF per firma + eksport CSV (WBS 2.9).
- Etap 2: checkbox potwierdzający, że firma przyjmuje do wiadomości konieczność podania mocy elektrycznej w etapie 5 (wymagany przy „Prześlij”; zapis w `StandDetails.el_power_acknowledged`).
- Etap 5: pola mocy elektrycznej / urządzeń (`el_power`, `el_devices`, opcja niskiej mocy).
- Etap 2 / własna zabudowa: certyfikat niepalności opcjonalny przy przesłaniu; deadline „równo 4 tygodnie przed dniem 1”; od 6 tygodni przed dniem 1 brak pliku → auto „wymaga poprawy” z komentarzem (job `auto_reject_missing_fire_certs`).

## Częściowo wdrożone / wymaga doprecyzowania

- Etap 2 / własna zabudowa: rdzeń jest (typ stoiska, certyfikat, wizualizacja); dalej brakuje m.in. podglądu mebli i koloru wykładziny (WBS 2.6 + punkty poniżej).
- Mapka stoisk: podgląd i przypisanie jednego stoiska na dzień działają; brak wielu stoisk jednej firmy tego samego dnia oraz pełnej synchronizacji z planem hali (WBS 4.5).

## Braki do realizacji

- Brak pytań zbierających komplet danych organizacyjnych na starcie (pakiet, rozmiar stoiska, własna zabudowa, dzień wystawiania) w jednym spójnym miejscu procesu. (na razie wstrzymane — do ustalenia z zespołem)
- Mapka nie wspiera przypisania jednej firmy do wielu stoisk w tym samym dniu (np. `E11` + `E12`) jako osobnych pozycji.
- Jobwall: brak logiki i komunikatu "2 pierwsze ogłoszenia darmowe, kolejne płatne" (obecnie koszt liczony od każdej oferty).
- Warsztaty: brak komunikatu kosztowego po zaznaczeniu zainteresowania (ikona/tooltip + cena).
- Etap 2 / wyposażenie: brak podglądu wizualnego mebli (np. zdjęcia po najechaniu kursorem dla lady łukowej, krzesła barowego itd.).
- Etap 2 / wyposażenie: brak wyboru koloru wykładziny z paletą (opcja skierowana głównie do firm ze statusem partnera).
- Brak osobnych widoków / ról dla FR, LG i Opiekunów — obecnie jeden panel `staff` (WBS 2.2).
- Etap 5: brak pola godziny przyjazdu (WBS 2.5).
- Brak dedykowanego eksportu / skryptu pod E-JobWall (WBS 4.6).
- Integracja System ↔ strona WWW (API / skrypt łączący) — poza core panela; status do ustalenia (WBS 4.4).

## Rekomendowany priorytet

1. Rozszerzenie mapki o wiele stoisk dla jednej firmy.
2. Godzina przyjazdu w etapie 5 (WBS 2.5).
3. E-JobWall + cennik „2 pierwsze darmowe” (WBS 4.6 / Jobwall).
4. Podgląd mebli / kolor wykładziny w etapie 2.