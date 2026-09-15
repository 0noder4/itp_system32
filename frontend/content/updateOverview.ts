/**
 * Przegląd aktualizacji dla panelu staff.
 * Aktualizuj przed deployem / tar (reguła: update-overview-przed-deployem).
 */
export const updateOverview = {
  releaseDate: "2026-09-15", // ISO YYYY-MM-DD
  highlights: [
    "Zaktualizowano silnik panelu (Next.js) — łatka bezpieczeństwa zamykająca lukę wykorzystywaną przez ataki na serwer.",
    "Po zalogowaniu do panelu staff pojawia się przegląd najnowszej aktualizacji systemu.",
    "Możesz zaznaczyć „Nie pokazuj ponownie”, żeby ten przegląd się więcej nie wyświetlał.",
  ],
  worthChecking: [
    "Zaloguj się jako staff → sprawdź, że panel firm ładuje się normalnie.",
    "Otwórz przegląd aktualizacji (jeśli się pokazuje) i zamknij go przyciskiem lub „Nie pokazuj ponownie”.",
  ],
} as const;
