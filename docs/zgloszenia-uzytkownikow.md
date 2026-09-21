# Weryfikacja zgłoszeń użytkowników

Data weryfikacji: `2026-06-02`. Ostatnia aktualizacja: `2026-09-20`.

Dokument zawiera przegląd zgłoszeń od użytkowników wraz ze statusem w aktualnej wersji systemu.

## Już wdrożone

- Podgląd wysłanych plików jest dostępny:
  - etap 2 (logo na fryz dla stoiska organizatora, certyfikat ppoż. dla własnej zabudowy),
  - etap 4 (logo do katalogu),
  - widok FR (podgląd etapów) również ma linki do plików.
- W tabeli firm po stronie staff jest licznik ukończonych etapów (`x/5`).
- Zaproszenia można anulować (status `cancelled`) z poziomu panelu staff.
- Mail zaproszeniowy wyraźnie wyróżnia login firmy (dedykowane, wizualnie wyróżnione pole w szablonie HTML i plain text).
- Logowanie loginem firmy lub adresem e-mail (bez rozróżniania wielkości liter); spójne nazewnictwo „login” w UI i tłumaczeniach PL/EN.
- Mail do opiekuna FR po przesłaniu lub poprawie etapu (sygnał „oczekuje na akceptację”); bez ponownego maila przy kolejnym zapisie tego samego etapu w statusie pending.
- Automatyczne przypomnienia o zbliżającym się wygaśnięciu zaproszenia (do wystawcy i opiekuna); progi dni, liczba przypomnień (`0` = wyłączone) i ważność nowych linków w `Settings` (Invitation settings).
- Etap 5: obiady i delegaci wymagają jawnej decyzji przed finalnym przesłaniem (rezygnacja z obiadów / zamówienie, główny przedstawiciel, brak innych delegatów lub lista delegatów, pokrycie obecności każdego dnia targów).
- Etap 3 (warsztaty): świadomy wybór tak/nie oraz dedykowane pola kontaktowe — telefon ds. warsztatów (z opcją z numerów prowadzących) i lista prowadzących (imię, nazwisko, telefon, opis).
- Wersja robocza etapu: przycisk „Zapisz wersję roboczą” (bez Feedback / maila do FR / CSV); status „Firemka wciąż edytuje”; kolejny etap odblokowuje się po „Prześlij” (nie po samym szkicu).

## Częściowo wdrożone / wymaga doprecyzowania

- Pole mocy elektrycznej istnieje (`łączna moc urządzeń` w etapie 5), ale nie jest opisane jako wymagane szczególnie dla własnej zabudowy.

## Braki do realizacji

- Brak pytań zbierających komplet danych organizacyjnych na starcie (pakiet, rozmiar stoiska, własna zabudowa, dzień wystawiania) w jednym spójnym miejscu procesu.
- FR nie ma trybu "podglądu formularza przed wysłaniem" (wgląd jest dopiero po zapisaniu danych przez firmę).
- Mapka nie wspiera przypisania jednej firmy do wielu stoisk w tym samym dniu (np. `E11` + `E12`) jako osobnych pozycji.
- Brak opcji trwałego usuwania zaproszeń (jest anulowanie, ale bez usuwania rekordu).
- Jobwall: brak logiki i komunikatu "2 pierwsze ogłoszenia darmowe, kolejne płatne" (obecnie koszt liczony od każdej oferty).
- Warsztaty: brak komunikatu kosztowego po zaznaczeniu zainteresowania (ikona/tooltip + cena).
- Etap 2 / wyposażenie: brak podglądu wizualnego mebli (np. zdjęcia po najechaniu kursorem dla lady łukowej, krzesła barowego itd.).
- Etap 2 / wyposażenie: brak wyboru koloru wykładziny z paletą (opcja skierowana głównie do firm ze statusem partnera).

## Rekomendowany priorytet

1. Moc elektryczna — wymaganie / copy szczególnie przy własnej zabudowie (etap 5).
2. Rozszerzenie mapki o wiele stoisk dla jednej firmy.
3. Podgląd FR formularza przed wysłaniem firmy.
