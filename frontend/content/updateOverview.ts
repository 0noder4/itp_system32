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
    releaseDate: "2026-11-22",
    highlights: [
      "Cennik w ustawieniach systemu (stoiska 4–12 m², pakiety Partner / Partner Główny, pakiety JobWall +2/+3 i limity obiadów) oraz podsumowanie kosztów netto w formularzach wystawcy i w arkuszu FR.",
      "Nowy, zwięzły PDF podsumowania zamówienia z rozliczeniem kosztów netto, krótszą nazwą pliku, poprawnym tytułem dokumentu oraz przyciskiem pobierania w szczegółach firmy dla FR.",
      "Zarządzanie pytaniami FAQ w panelu staff (dla roli FR): dodawanie, edycja PL/EN, kolejność, ukrywanie i kategorie — z dynamiczną listą FAQ u wystawcy.",
      "Filtry na liście firm: wielokrotny wybór statusów, opiekunów FR i etapów, nowy filtr Opiekuna firmy, oznaczenie języka EN przy firmie oraz podpowiedź o komentarzu po angielsku przy ocenie etapu.",
      "Mapa stoisk: pobieranie mapy do pliku PNG (z legendą aktywnego widoku) u wystawcy i staff oraz nowy widok „Czysty układ (bez firm)”.",
      "Arkusze: dodawanie i usuwanie osób bez konta (gości) na zakładce Obiady Beściaków oraz podgląd propozycji i wersji roboczych w historii komórki.",
      "Poprawione pobieranie archiwum .zip w „Eksportuj Pliki Mediowe” (bez podkreślnika na końcu rozszerzenia) oraz spójny polski panel Django Admin z odchudzonymi opisami.",
    ],
    worthChecking: [
      "Panel staff → FAQ w menu bocznym → dodaj / edytuj pytanie PL i EN → sprawdź widok FAQ w panelu wystawcy.",
      "Panel FR → Edytuj filtry → zaznacz kilka statusów oraz filtr Opiekun firmy → sprawdź badge EN przy firmie anglojęzycznej i pobierz PDF podsumowania zamówienia z karty firmy.",
      "Panel staff → Mapa → Widoki → „Czysty układ (bez firm)” oraz przycisk Pobierz PNG (także w panelu wystawcy → Mapa).",
      "Arkusze → Opiekun → Obiady Beściaków → Dodaj osobę (bez konta) → edytuj komórki i usuń wiersz; w arkuszu FR sprawdź kolumnę kosztu pakietu.",
      "Panel FR → Eksportuj Pliki Mediowe → sprawdź, że pobrany plik ma rozszerzenie .zip i otwiera się bezpośrednio.",
      "Django Admin (/admin/) → Ustawienia systemu → sprawdź spójne polskie nazewnictwo i cennik.",
      "Po zalogowaniu → przegląd aktualizacji → daty 22.11.2026 oraz 21.11.2026.",
    ],
  },
  {
    releaseDate: "2026-11-21",
    highlights: [
      "Arkusze: własne kolumny (tekst, długi opis, pliki mediowe z wieloma załącznikami) oraz własne kategorie kolumn z wyborem koloru.",
      "Ustawienia arkusza: przenoszenie kolumn między kategoriami (przeciągnij i upuść), ukrywanie własnych kolumn dla wszystkich oraz przycisk Cofnij zmiany układu.",
      "Etap 2 i arkusze: rozdzielenie wymiarów własnej zabudowy od listy przywożonego sprzętu i elementów zabudowy.",
      "Backupy i bezpieczeństwo danych: nocny ratunkowy eksport arkuszy do plików XLSX, kopia zapasowa mediafiles oraz alerty e-mail przy awarii backupu.",
    ],
    worthChecking: [
      "Arkusze → Ustawienia → Dodaj kategorię i własną kolumnę (np. Pliki mediowe) → wgraj załączniki dwuklikiem w komórce.",
      "Arkusze → Ustawienia → przeciągnij kolumnę do innej kategorii → użyj Cofnij lub Zapisz układ.",
      "Panel firmy → Etap 2 (własna zabudowa) → osobne pole wymiarów i przywożonego sprzętu; sprawdź oba pola w arkuszu LG / Opiekun.",
      "Po zalogowaniu → przegląd aktualizacji → przełącz datę na 21.11.2026.",
    ],
  },
  {
    releaseDate: "2026-11-18",
    highlights: [
      "Arkusze: komentarze w komórkach z @oznaczeniem osób — dzwonek powiadomień w nagłówku staff.",
      "Propozycje zmian: zaproponuj wersję roboczą w komentarzu; FR/LG zapisuje ją do bazy albo odrzuca (status w toku / zaakceptowane / niezaakceptowane).",
      "Wersje robocze w siatce: widać, że komórka ma draft; można przywrócić wartość z formularza firmy.",
      "Edycja bogatszych pól z arkusza: listy (delegaci, PDI…), pliki grafik oraz złożone dane (np. imię i telefon) w osobnym oknie.",
      "Ustawienia arkusza: kolejność kolumn per zakładka oraz synchronizacja układu z domyślnym.",
      "Montaż: komentarze i propozycje slotu przyjazdu z harmonogramu trafiają do tej samej komórki co na Głównym.",
    ],
    worthChecking: [
      "Arkusze → Główny → róg komórki / komentarze → napisz z @osobą → sprawdź dzwonek w nagłówku.",
      "Arkusze → zaproponuj wersję roboczą → FR/LG: status → Zapisz do bazy / odrzuć; odśwież siatkę.",
      "Arkusze → komórka z draftem → przywróć / zapisz; otwórz edycję listy albo pliku graficznego.",
      "Arkusze → Ustawienia → zmień kolejność kolumn → synchronizuj układ.",
      "Arkusze → Opiekun → Montaż → komentarz przy firmie w slocie → propozycja godziny → zapis na Głównym.",
      "Po zalogowaniu → przegląd aktualizacji → data 18.11.2026.",
    ],
  },
  {
    releaseDate: "2026-11-15",
    highlights: [
      "Arkusze Opiekuna: zakładki montażu (harmonogram slotów z kolorami i przypisywaniem firm), Welcome packi, Obiady Beściaków, tony statusu zabudowy oraz stopki SUMA / DZIEŃ 1 / DZIEŃ 2.",
      "W arkuszu: podgląd pełnej treści komórki, zawijanie tekstu, ustawienia ukrytych kolumn wg grup i synchronizacja układu z domyślnym.",
      "Wykładzina obowiązkowa: partnerzy wybierają typ i kolor; pozostali wystawcy dostają automatycznie RIPS EXPO 892 szary (bez rezygnacji).",
      "Mapa: przy wyłączonej synchronizacji dni edycja dotyczy tylko aktywnego dnia — nie kopiuje już zmian na drugi dzień.",
      "Zaproszenie firmy: limit 100 znaków nazwy oraz podpowiedź, że ta nazwa staje się loginem w mailu powitalnym.",
      "Podgląd etapu 5: informacja, że listę PDI / gali zbiera Opiekun w Mailu #2 w arkuszu (nie firma w formularzu).",
    ],
    worthChecking: [
      "Arkusze → Opiekun → Montaż (dzień) → kliknij pusty slot → przypisz firmę → sprawdź kolor i etykietę; usuń przypisanie.",
      "Arkusze → Opiekun → Główny / Welcome / Obiady Beściaków → stopki sum i tonów; ustawienia → ukryj grupę → synchronizuj układ.",
      "Panel firmy (wystawca) → Etap 2 → wykładzina bez wyboru (892); partner → wybór koloru bez opcji rezygnacji.",
      "Mapa → wyłącz sync dni → przesuń stoiska tylko w dniu 1 → dzień 2 bez zmian.",
      "Zaproszenia → nazwa firmy > 100 znaków / hint o loginie.",
      "Staff → firma → Etap 5 → żółty box PDI / gala.",
      "Po zalogowaniu → przegląd aktualizacji → data 15.11.2026.",
    ],
  },
  {
    releaseDate: "2026-11-11",
    highlights: [
      "Nowe Arkusze w menu staff: siatka firm jak w Excelu (edycja komórek, cofnij/ponów, kolory wypełnienia, zamrożone kolumny, ukrywanie kolumn).",
      "Arkusze zależą od roli: FR, LG, TR i Opiekun widzą swoje zakładki; Opiekun tylko swoje firmy.",
      "Eksport z arkusza: CSV / XLSX (z kolorami i pinami) oraz pliki mediów; zaznaczenie, jedna zakładka albo kilka naraz.",
      "Konta staff mają role (FR / LG / TR / Opiekun). Zaproszenie nowego staff może od razu ustawić role.",
      "Firma może mieć opiekuna (osoba ze stowarzyszenia) — widać go i da się ustawić w arkuszu.",
      "Mapa: widoki kolorów (rozmiary stoisk, partnerzy, moje firmy) pod przyciskiem Widoki.",
      "Menu staff dopasowuje się do roli — sam TR nie widzi mapy ani Panelu FR.",
    ],
    worthChecking: [
      "Zaloguj FR → Arkusze → LG Główny → edytuj komórkę → odśwież (zapis) → Cofnij.",
      "Arkusze → zaznacz komórki → kolor wypełnienia → Eksport → XLSX z pinami jak na siatce.",
      "Konto Opiekun / TR → tylko dostępne pozycje menu i właściwy arkusz.",
      "Zaproszenie staff z rolami → rejestracja → role w profilu.",
      "Mapa → Widoki → rozmiary / partnerzy / moje firmy → kolory na hali.",
      "Po zalogowaniu → przegląd aktualizacji → data 11.11.2026.",
    ],
  },
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
];

export const latestUpdateOverview = updateOverviews[0];
