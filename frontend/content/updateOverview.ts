/**
 * Przegląd aktualizacji dla panelu staff.
 * Aktualizuj przed deployem / tar (reguła: update-overview-przed-deployem).
 */
export const updateOverview = {
  releaseDate: "2026-09-18", // ISO YYYY-MM-DD
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
} as const;
