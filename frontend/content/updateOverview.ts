/**
 * Przegląd aktualizacji dla panelu staff.
 * Aktualizuj przy commicie batcha na main (reguła: update-overview-przed-deployem),
 * nie dopiero przy tar — wpis ma wejść w ten sam commit co zmiany.
 * Najnowszy wpis pierwszy; trzymaj ok. 10 ostatnich.
 */

export type UpdateOverviewEntry = {
  releaseDate: string; // ISO YYYY-MM-DD
  highlights: readonly string[];
  worthChecking: readonly string[];
};

export const updateOverviews: readonly UpdateOverviewEntry[] = [
  {
    releaseDate: "2026-11-08",
    highlights: [
      "Filtry listy firm są teraz w osobnym oknie pod przyciskiem „Edytuj filtry” — lista firm ma więcej miejsca. Przycisk pokazuje, ile filtrów jest włączonych.",
      "Nowy filtr „Status etapu”: np. pokaż firmy z etapem „Wymaga poprawy” albo „Oczekuje na akceptację” — w dowolnym etapie albo w wybranym.",
      "W podglądzie eksportu na stronę statusy firm mają kolory (Gotowa — zielony, Pominięta — czerwony, Bez zmian — szary).",
      "W podglądzie eksportu jest sekcja „Potrzebujesz pomocy?”: przy błędzie w treści albo złym formacie (np. link oferty) FR prosi firmę o poprawkę w formularzu; do IT tylko gdy formularz tego nie naprawi.",
      "Przy wysyłce na stronę: przełącznik „Opublikuj firmę i oferty od razu” oraz „Opublikuj też mapę hali” (oba domyślnie włączone) — karta, oferty i mapa od razu w katalogu publicznym.",
      "Z listy firm można „Usunąć ze strony” wcześniej wysłane firmy i ich oferty (znikają z katalogu publicznego).",
    ],
    worthChecking: [
      "Panel FR → Edytuj filtry → Status etapu → „Wymaga poprawy” → sprawdź, czy lista pokazuje właściwe firmy; zmień zakres na konkretny etap.",
      "Panel FR → Edytuj filtry → Wyczyść filtry → licznik na przycisku znika.",
      "Panel FR → zaznacz kilka firm → Eksportuj na stronę → kolory statusów → rozwiń „Potrzebujesz pomocy?”.",
      "Panel staff → Eksportuj na stronę → Dalej → oba przełączniki publikacji zaznaczone → Wyślij → karta, oferty i mapa widoczne w katalogu na stronie.",
      "Panel staff → zaznacz firmę już wysłaną → Usuń ze strony → potwierdź → sprawdź, że zniknęła z katalogu publicznego.",
    ],
  },
  {
    releaseDate: "2026-11-06",
    highlights: [
      "Eksport katalogu na stronę targów: przycisk „Eksportuj na stronę” pod przypomnieniami — wysyła opis, logo, stoiska i oferty pracy z etapu 4.",
      "Podgląd eksportu wygląda jak karta firmy w katalogu na stronie (te same fonty, kolory, mapki bez numerów). Oferty pracy można kliknąć i zobaczyć jak na stronie ofert.",
      "Podgląd ostrzega, gdy link aplikacji w ofercie nie zadziała na stronie (nie jest e-mailem ani linkiem https://) oraz gdy oferta usunięta w systemie zniknie ze strony.",
      "Po akceptacji etapu 4 pojawia się ten sam dialog (można odłożyć i wysłać później z listy firm).",
    ],
    worthChecking: [
      "Panel staff → zaznacz firmę z zaakceptowanym etapem 4 → Eksportuj na stronę → porównaj podgląd z katalogiem na stronie → Wyślij.",
      "Podgląd eksportu → kliknij ofertę pracy → sprawdź treść i przycisk Aplikuj → Wróć do karty firmy.",
      "Panel staff → firma → akceptacja etapu 4 → dialog eksportu → Nie teraz / wyślij.",
    ],
  },
  {
    releaseDate: "2026-11-01",
    highlights: [
      "Etap 2 (partner / partner główny): wybór bezpłatnej wykładziny RIPS/WELUR z katalogu kolorów albo rezygnacja — w formularzu firmy, podglądzie staff i eksporcie CSV.",
      "Obraz katalogu wykładzin wgrywa się w ustawieniach systemu (Django Admin) — bez przebudowy frontendu.",
      "Etap 5: firma podaje planowaną godzinę przyjazdu na dzień 1 i 2 (montaż / rozładunek); widać to w podglądzie staff, PDF i eksporcie.",
      "Obiady w etapie 5: stała ilość na każdy dzień targów — bez wyboru diety w systemie (dieta na miejscu w Chochelce).",
      "Przy anulowaniu zaproszenia można oznaczyć „firma rezygnuje” (osobny status i filtr na liście firm / zaproszeń).",
      "Mapa: przy synchronizacji obu dni nadal przełączysz zakładki dnia 1 i 2; dymek przy najechaniu na stoisko nie ucina się na krawędzi.",
    ],
    worthChecking: [
      "Panel firmy (partner) → Etap 2 → Wykładzina → katalog / typ / kolor albo rezygnacja → zapisz szkic i prześlij.",
      "Panel staff → firma partnerska → podgląd etapu 2 → sekcja wykładziny → Pokaż katalog; eksport CSV (kolumny wykładziny).",
      "Django Admin → Settings → Documents → katalog wykładzin (obraz) → odśwież dialog w etapie 2.",
      "Panel firmy → Etap 5 → godziny przyjazdu (obie listy) → obiady day1/day2 bez diety → prześlij / szkic.",
      "Panel staff → firma → podgląd etapu 5 → godziny przyjazdu i ilości obiadów; eksport CSV / PDF.",
      "Panel staff → zaproszenie → Anuluj → zaznacz „firma rezygnuje” → filtr statusu „Firma rezygnuje”.",
      "Panel staff → Mapa → włącz sync → przełącz dzień 1/2 → najedź na stoisko (dymek w pełni widoczny).",
      "Panel staff → po zalogowaniu → przegląd aktualizacji → data 01.11.2026.",
    ],
  },
  {
    releaseDate: "2026-10-26",
    highlights: [
      "Mapa stoisk jest edytowalna w panelu staff: łączenie i rozłączanie stoisk (4/6/8/12 m²) w torach A–F, z wariantami etykiet (np. B1a + B1b + B2) oraz ręcznym podziałem.",
      "Dzień 2 domyślnie synchronizuje się z dniem 1 (można wyłączyć). Przy zajętym stoisku jest ostrzeżenie o konsultacji z opiekunem FR.",
      "Przypisanie stoiska firmie ma mapę z zajętymi miejscami; nie da się zapisać numeru już zajętego przez inną firmę.",
      "Firma widzi na mapie tylko swoje stoisko (layout z systemu, bez osobnych plików SVG).",
      "Konto admina może przywrócić domyślną mapę (kasuje też przypisania stoisk) — z potwierdzeniem.",
    ],
    worthChecking: [
      "Panel staff → Mapa → Edytuj mapę → zaznacz stoiska → Zmień podział / podział ręczny → sprawdź etykiety.",
      "Panel staff → Mapa → odznacz synchronizację dnia 2 → zmień dzień 1 → sprawdź dzień 2.",
      "Panel staff → firma → Edytuj stoisko → kliknij wolne miejsce na mapie → zapisz; spróbuj zajętego numeru.",
      "Panel firmy → Mapa → własne stoisko podświetlone; bez stoisk innych firm.",
      "Konto admin → Mapa → Przywróć domyślną → potwierdź.",
    ],
  },
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
