# Weryfikacja zgłoszeń użytkowników

Data weryfikacji: `2026-06-02`. Ostatnia aktualizacja: `2026-08-27`.

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

## Częściowo wdrożone / wymaga doprecyzowania

- Warsztaty są w systemie jako etap 3, ale brakuje dedykowanych pól osoby kontaktowej do warsztatów.
- Pole mocy elektrycznej istnieje (`łączna moc urządzeń` w etapie 5), ale nie jest opisane jako wymagane szczególnie dla własnej zabudowy.

## Braki do realizacji

- Brak pytań zbierających komplet danych organizacyjnych na starcie (pakiet, rozmiar stoiska, własna zabudowa, dzień wystawiania) w jednym spójnym miejscu procesu.
- Nazewnictwo statusów etapów jest dla użytkowników nieintuicyjne (szczególnie odróżnienie "w trakcie" vs "oczekuje na akceptację").
- FR nie ma trybu "podglądu formularza przed wysłaniem" (wgląd jest dopiero po zapisaniu danych przez firmę).
- Mapka nie wspiera przypisania jednej firmy do wielu stoisk w tym samym dniu (np. `E11` + `E12`) jako osobnych pozycji.
- Brak opcji trwałego usuwania zaproszeń (jest anulowanie, ale bez usuwania rekordu).
- Jobwall: brak logiki i komunikatu "2 pierwsze ogłoszenia darmowe, kolejne płatne" (obecnie koszt liczony od każdej oferty).
- Warsztaty: brak komunikatu kosztowego po zaznaczeniu zainteresowania (ikona/tooltip + cena).

## Rekomendowany priorytet

1. Wymagalność kluczowych pól (dane warsztatowe).
2. Poprawa statusów i komunikatów UI (statusy etapów).
3. Rozszerzenie mapki o wiele stoisk dla jednej firmy.
