/**
 * Przegląd aktualizacji dla panelu staff.
 * Aktualizuj przy commicie batcha na main (reguła: update-overview-przed-deployem),
 * nie dopiero przy tar — wpis ma wejść w ten sam commit co zmiany.
 * Najnowszy wpis pierwszy; trzymaj ok. 5 ostatnich.
 */

export type UpdateOverviewEntry = {
  releaseDate: string; // ISO YYYY-MM-DD
  highlights: readonly string[];
  worthChecking: readonly string[];
};

export const updateOverviews: readonly UpdateOverviewEntry[] = [
  {
    releaseDate: "2026-10-11",
    highlights: [
      "Etap 4 (Jobwall): pierwsze ogłoszenia mogą być darmowe — liczbę ustawia się w ustawieniach systemu; kolejne są płatne, a koszt widać w formularzu.",
      "Limity długości w etapie 4: opis firmy do katalogu do 1700 znaków; treść oferty (opis + benefity + wymagania) łącznie do 2000 znaków, z licznikiem.",
      "W opisach etapu 4 są linki do zakładki Katalog i Oferty Pracy na stronie targów.",
      "Numer edycji targów (np. System 33) ustawia się w panelu admina — widać go w nazwie systemu i tytule przeglądarki bez przebudowy frontendu.",
      "W etapie 1 numer domu i numer lokalu nie są już wymagane.",
    ],
    worthChecking: [
      "Panel firmy → Etap 4 → komunikat o darmowych ogłoszeniach; dodaj 3. ofertę → koszt jednej płatnej.",
      "Panel firmy → Etap 4 → licznik znaków przy opisie katalogu i przy ofercie; kliknij link Katalog / Oferty Pracy.",
      "Django Admin → Settings → numer edycji / liczba darmowych ogłoszeń Jobwall → odśwież panel (nazwa System XX).",
      "Panel firmy → Etap 1 → zapis bez numeru domu / lokalu.",
      "Panel staff → po zalogowaniu → przegląd aktualizacji → data 11.10.2026.",
    ],
  },
  {
    releaseDate: "2026-09-22",
    highlights: [
      "W etapie 2 firma potwierdza checkboxem, że w etapie 5 poda moc elektryczną — widać to też w podglądzie staff.",
      "Certyfikat o niepalności przy własnej zabudowie nie blokuje wysyłki etapu 2; przy odrzuceniu bez certyfikatu widać ostrzeżenie z terminami.",
      "Brak certyfikatu na 6 tygodni przed finałem może automatycznie odrzucić etap 2 (z powiadomieniem do firmy).",
      "Firma może zapisać wersję roboczą etapu bez wysyłki do weryfikacji (bez maila do FR).",
      "Na zablokowanym etapie (oczekuje / zaakceptowany) nie widać już szarego przycisku Prześlij.",
      "Przyciski Odrzuć w panelu firmy są czerwone; w przeglądzie aktualizacji można przełączać daty wydań.",
      "Regulamin w etapie 1 bierze PDF z ustawień systemu (bez redeployu samego pliku w frontcie).",
      "W ciemnym motywie zaznaczone checkboxy i radiobuttony są czytelne (pomarańczowe wypełnienie).",
    ],
    worthChecking: [
      "Panel firmy → Etap 2 → checkbox mocy + opcjonalny certyfikat / hint z datą → Zapisz wersję roboczą.",
      "Panel firmy → etap „Oczekuje na akceptację” → brak przycisku Prześlij, pola tylko do odczytu.",
      "Panel staff → firma → Etap 2 → Odrzuć (gdy brak certyfikatu) → ostrzeżenie z datami; Anuluj bez wysyłki.",
      "Panel staff → po zalogowaniu → przegląd aktualizacji → przełącz datę wydania → Zamknij.",
      "Panel firmy → Etap 1 → Prześlij → dialog regulaminu → link „Zobacz regulamin”.",
      "Panel firmy → ciemny motyw → Etap 2/3/5 → zaznacz checkbox lub radio.",
    ],
  },
  {
    releaseDate: "2026-09-18",
    highlights: [
      "Etap 3 (warsztaty) ma pełny formularz: nazwa, opis, dzień i godzina, umiejętności, kierunki studiów, udogodnienia sali.",
      "Można dodać prowadzących warsztatu (imię, nazwisko, telefon, opis) oraz telefon kontaktowy ds. warsztatów.",
      "Zwykli wystawcy (basic) pomijają etap 3 — od razu odblokowują kolejne etapy bez wypełniania warsztatów.",
      "Wymagany jest świadomy wybór: firma musi kliknąć tak lub nie przy warsztacie (nie da się przejść z pustym wyborem).",
      "Eksport CSV zawiera kolumny ze szczegółami warsztatu i prowadzącymi.",
    ],
    worthChecking: [
      "Panel firmy (main/partner) → Etap 3 → wypełnij warsztat z prowadzącym i zapisz szkic / wyślij.",
      "Panel firmy (basic) → sprawdź, że etap 3 jest niedostępny, a etap 4 się odblokowuje.",
      "Panel staff → firma → podgląd etapu 3: szczegóły warsztatu i lista prowadzących.",
      "Panel staff → eksport CSV → w pliku kolumny warsztatów (nazwa, dzień, godzina, prowadzący…).",
    ],
  },
  {
    releaseDate: "2026-09-15",
    highlights: [
      "Zaktualizowano silnik panelu (Next.js) — łatka bezpieczeństwa zamykająca lukę wykorzystywaną przez ataki na serwer.",
      "Po zalogowaniu do panelu staff pojawia się przegląd najnowszej aktualizacji systemu.",
      "Możesz zaznaczyć „Nie pokazuj ponownie”, żeby ten przegląd się więcej nie wyświetlał.",
    ],
    worthChecking: [
      "Zaloguj się jako staff → sprawdź, że panel firm ładuje się normalnie.",
      "Otwórz przegląd aktualizacji (jeśli się pokazuje) i zamknij go przyciskiem lub „Nie pokazuj ponownie”.",
    ],
  },
];

export const latestUpdateOverview = updateOverviews[0];
