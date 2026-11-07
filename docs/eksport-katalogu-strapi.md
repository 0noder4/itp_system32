# Eksport katalogu → Strapi (strona targów)

Staff wysyła opis, logo i stoiska firm do CMS strony (Targus / Strapi) jako **wersję roboczą**. Publikacja na katalogu publicznej strony odbywa się w panelu Strapi (Publish).

## Warunki wysyłki firmy

- Etap 4 zaakceptowany.
- Wypełniony opis katalogowy.
- Wgrane logo katalogowe.

Bez tego firma pojawia się w podglądzie jako pominięta.

## UI (panel staff)

- Lista firm → zaznacz → **Eksportuj na stronę** → podgląd → potwierdzenie → draft w Strapi.
- W UI dla FR Strapi nazywamy „panelem admina strony”.
- Podgląd odwzorowuje kartę firmy z katalogu Targus (`CompanyDetails`) i stronę oferty (`JobDetails`): te same fonty (`frontend/public/fonts/website/`), style (`WebsiteExport/sitePreview.module.scss`), Markdown (`react-markdown`) i rysowanie mapy (`SiteHallMap`, port `HallMap.tsx`). Przy zmianie wyglądu strony zaktualizuj też te pliki.
- Oferty pracy z etapu 4 są w podglądzie (klikalne jak na stronie) i są eksportowane jako drafty kolekcji `Job`, powiązane z firmą. Każdą ofertę staff publikuje w Strapi osobno.
- Podgląd ostrzega, gdy link aplikacji nie jest e-mailem ani `http(s)://` (na stronie byłby zepsutym linkiem względnym), oraz gdy eksport usunie ofertę ze strony.

## Oferty pracy (Job)

- Forma / etat / umowa → relacje do istniejących wpisów Strapi `work-models` / `employment-types` / `contracts`, szukanych po `internalName`. Mapowanie (z produkcji) w `catalogue_export_service.py`: `WEBSITE_WORK_MODELS`, `WEBSITE_EMPLOYMENT_TYPES`, `WEBSITE_CONTRACTS`. Brak wpisu w Strapi = błąd eksportu tej firmy (nic nie jest tworzone w słownikach).
- Miasta (`cities`) nie są zbierane w systemie — puste.
- `WebsitePublication.strapi_jobs` trzyma mapę `Jobwall.id → documentId`. Zmiana oferty = update draftu (opublikowana wersja zostaje). Oferta usunięta w systemie = `DELETE` dokumentu w Strapi (znika też z opublikowanej strony).
- Postęp jest zapisywany po każdej ofercie; nieudany eksport zostawia firmę jako „Gotowa” i ponowienie nie tworzy duplikatów.
- Po akceptacji etapu 4 otwiera się ten sam dialog (można wybrać „Nie teraz”).
- Ponowny eksport przy niezmienionych danych = pominięcie; przy zmianie = update **draftu** (opublikowana wersja na stronie zostaje do ręcznego Publish → status Modified w Strapi).

## API

- `GET /api/website-export/catalogue/preview/?company_ids=`
- `POST /api/website-export/catalogue/` body `{ "company_ids": [...] }` (max 10 na request; UI dzieli na batche).

Tylko `admin` / `staff`. Brak `STRAPI_URL` / `STRAPI_API_TOKEN` → `503`.

## Dane w system32

Model `WebsitePublication` (1:1 z firmą): `strapi_document_id`, `strapi_logo_id`, `strapi_logo_sha256`, hash payloadu, czas ostatniego eksportu, ostatni błąd.

Zasady synchronizacji:

- `internalName` w Strapi = `itp{numer_edycji}-{id_firmy}` (numer z `Settings`). Firmy z poprzednich edycji w Strapi nie są nadpisywane, nawet gdy po resecie bazy ID się powtórzą.
- Logo wgrywane tylko, gdy zmienił się plik (porównanie SHA-256). Poprzednie logo jest usuwane z biblioteki mediów Strapi **tylko**, jeśli nie używa go opublikowana wersja firmy.
- Jeśli dokument firmy został usunięty w Strapi, kolejny eksport tworzy nowy draft.
- Gdy zapis draftu się nie uda, świeżo wgrane logo jest usuwane (bez sierot w mediach).

Mapa hali: snapshot `MapLayout` → single type Strapi **Hall Map** (draft). Szczegóły po stronie Targus: `targus/docs/hall-map-sync.md`.

## Konfiguracja

Zmienne: sekcja 7 w [zmienne-srodowiskowe-env.md](./zmienne-srodowiskowe-env.md).

Lokalnie z Dockera: `STRAPI_URL=http://host.docker.internal:1337` + token API z pełnym dostępem do Company / Upload / Hall Map.

## Poza zakresem (na później)

Eksport ogłoszeń Jobwall / E-JobWall — osobny flow.
