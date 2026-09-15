/**
 * Przegląd aktualizacji dla panelu staff.
 * Aktualizuj przed deployem / tar (reguła: update-overview-przed-deployem).
 */
export const updateOverview = {
  releaseDate: "2026-09-15", // ISO YYYY-MM-DD
  highlights: [
    "Po zalogowaniu do panelu staff pojawia się przegląd najnowszej aktualizacji systemu.",
    "Możesz zaznaczyć „Nie pokazuj ponownie”, żeby ten przegląd się więcej nie wyświetlał.",
    "Po miesiącu od daty wydania przegląd znika automatycznie dla wszystkich.",
  ],
  worthChecking: [
    "Zaloguj się jako staff → sprawdź, czy dialog otwiera się na głównym panelu firm.",
    "Odśwież stronę (F5) — dialog nie powinien wyskoczyć drugi raz w tej samej sesji.",
  ],
} as const;
