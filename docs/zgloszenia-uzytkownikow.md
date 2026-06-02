# Weryfikacja zgłoszeń użytkowników

Data weryfikacji: `2026-06-02`.

Dokument zawiera przegląd zgłoszeń od użytkowników wraz ze statusem w aktualnej wersji systemu.

## Już wdrożone

- Podgląd wysłanych plików jest dostępny:
  - etap 2 (logo na fryz dla stoiska organizatora, certyfikat ppoż. dla własnej zabudowy),
  - etap 4 (logo do katalogu),
  - widok FR (podgląd etapów) również ma linki do plików.
- W tabeli firm po stronie staff jest licznik ukończonych etapów (`x/5`).
- Zaproszenia można anulować (status `cancelled`) z poziomu panelu staff.

## Częściowo wdrożone / wymaga doprecyzowania

- Warsztaty są w systemie jako etap 3, ale brakuje dedykowanych pól osoby kontaktowej do warsztatów.
- Pole mocy elektrycznej istnieje (`łączna moc urządzeń` w etapie 5), ale nie jest opisane jako wymagane szczególnie dla własnej zabudowy.
- W mailu zaproszeniowym login jest podany (nazwa firmy), ale nie jest wystarczająco mocno wyróżniony instrukcją "loguj się nazwą użytkownika, nie e-mailem/telefonem".

## Braki do realizacji

- Brak pytań zbierających komplet danych organizacyjnych na starcie (pakiet, rozmiar stoiska, własna zabudowa, dzień wystawiania) w jednym spójnym miejscu procesu.
- Brak automatycznego mailingu do FR po przesłaniu/poprawieniu etapu przez firmę (sygnał "oczekuje na akceptację").
- Brak automatycznego mailingu przypominającego o zbliżającym się wygaśnięciu linku zaproszenia.
- Nazewnictwo statusów etapów jest dla użytkowników nieintuicyjne (szczególnie odróżnienie "w trakcie" vs "oczekuje na akceptację").
- FR nie ma trybu "podglądu formularza przed wysłaniem" (wgląd jest dopiero po zapisaniu danych przez firmę).
- Mapka nie wspiera przypisania jednej firmy do wielu stoisk w tym samym dniu (np. `E11` + `E12`) jako osobnych pozycji.
- Brak opcji trwałego usuwania zaproszeń (jest anulowanie, ale bez usuwania rekordu).
- Jobwall: brak logiki i komunikatu "2 pierwsze ogłoszenia darmowe, kolejne płatne" (obecnie koszt liczony od każdej oferty).
- Warsztaty: brak komunikatu kosztowego po zaznaczeniu zainteresowania (ikona/tooltip + cena).
- Etap 5: obiady i delegaci nie są wymagalne przed finalnym przesłaniem etapu.

## Rekomendowany priorytet

1. Mailing do FR o nowych/przesłanych etapach.
2. Przypomnienia o wygasaniu zaproszeń.
3. Wymagalność kluczowych pól (obiady, delegaci, dane warsztatowe).
4. Poprawa statusów i komunikatów UI (statusy etapów, login w zaproszeniu).
5. Rozszerzenie mapki o wiele stoisk dla jednej firmy.
