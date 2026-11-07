# Eksport katalogu → Strapi (strona targów)

Staff wysyła opis, logo, stoiska i oferty firm do CMS strony (Targus / Strapi). Domyślnie **od razu publikuje** firmę i oferty na katalogu publicznym; opcjonalnie można zostawić je jako draft w panelu strony.

## Warunki wysyłki firmy

- Etap 4 zaakceptowany.
- Wypełniony opis katalogowy.
- Wgrane logo katalogowe.

Bez tego firma pojawia się w podglądzie jako pominięta.

## UI (panel staff)

- Lista firm → zaznacz → **Eksportuj na stronę** → podgląd → potwierdzenie.
- Przy potwierdzeniu: przełącznik **„Opublikuj firmę i oferty od razu”** (domyślnie włączony) oraz osobny przełącznik mapy hali.
- **Usuń ze strony** — widoczne, gdy firma była już eksportowana (`can_remove`). Usuwa firmę i oferty z Strapi (publiczny katalog i drafty); lokalny tracking w `WebsitePublication` jest czyszczony.
- W UI dla FR Strapi nazywamy „panelem admina strony”.
- Podgląd odwzorowuje kartę firmy z katalogu Targus (`CompanyDetails`) i stronę oferty (`JobDetails`): te same fonty (`frontend/public/fonts/website/`), style (`WebsiteExport/sitePreview.module.scss`), Markdown (`react-markdown`) i rysowanie mapy (`SiteHallMap`, port `HallMap.tsx`). Przy zmianie wyglądu strony zaktualizuj też te pliki.
- Oferty pracy z etapu 4 są w podglądzie (klikalne jak na stronie) i są eksportowane razem z firmą (ta sama flaga publish/draft).
- Podgląd ostrzega, gdy link aplikacji nie jest e-mailem ani `http(s)://` (na stronie byłby zepsutym linkiem względnym), oraz gdy eksport usunie ofertę ze strony.

## Oferty pracy (Job)

- Forma / etat / umowa → relacje do istniejących wpisów Strapi `work-models` / `employment-types` / `contracts`, szukanych po `internalName`. Mapowanie (z produkcji) w `catalogue_export_service.py`: `WEBSITE_WORK_MODELS`, `WEBSITE_EMPLOYMENT_TYPES`, `WEBSITE_CONTRACTS`. Brak wpisu w Strapi = błąd eksportu tej firmy (nic nie jest tworzone w słownikach).
- Miasta (`cities`) nie są zbierane w systemie — puste.
- `WebsitePublication.strapi_jobs` trzyma mapę `Jobwall.id → documentId`. Zmiana oferty = update (przy draft: opublikowana wersja zostaje do ręcznego Publish). Oferta usunięta w systemie = `DELETE` dokumentu w Strapi (znika też z opublikowanej strony).
- Postęp jest zapisywany po każdej ofercie; nieudany eksport zostawia firmę jako „Gotowa” i ponowienie nie tworzy duplikatów.
- Po akceptacji etapu 4 otwiera się ten sam dialog (można wybrać „Nie teraz”).
- Ponowny eksport przy niezmienionych danych = pominięcie; przy zmianie = update (przy `publish_content=false` tylko draft → Modified w Strapi).

## API

- `GET /api/website-export/catalogue/preview/?company_ids=` — m.in. `can_remove` per firma.
- `POST /api/website-export/catalogue/` body `{ "company_ids": [...], "publish_content": true, "publish_hall_map": true }` (max 10 na request; UI dzieli na batche).
- `POST /api/website-export/catalogue/remove/` body `{ "company_ids": [...] }` — DELETE jobów, potem firmy w Strapi + czyszczenie lokalnego trackingu.

Tylko `admin` / `staff`. Brak `STRAPI_URL` / `STRAPI_API_TOKEN` → `503`.

## Dane w system32

Model `WebsitePublication` (1:1 z firmą): `strapi_document_id`, `strapi_logo_id`, `strapi_logo_sha256`, `strapi_jobs`, hash payloadu, czas ostatniego eksportu, ostatni błąd.

Zasady synchronizacji:

- `internalName` w Strapi = `itp{numer_edycji}-{id_firmy}` (numer z `Settings`). Firmy z poprzednich edycji w Strapi nie są nadpisywane, nawet gdy po resecie bazy ID się powtórzą.
- Logo wgrywane tylko, gdy zmienił się plik (porównanie SHA-256). Poprzednie logo jest usuwane z biblioteki mediów Strapi **tylko**, jeśli nie używa go opublikowana wersja firmy.
- Jeśli dokument firmy został usunięty w Strapi, kolejny eksport tworzy nowy wpis.
- Gdy zapis się nie uda, świeżo wgrane logo jest usuwane (bez sierot w mediach).
- Usunięcie ze strony kasuje też logo w mediach Strapi (best-effort) i zeruje lokalny tracking.

Mapa hali: snapshot `MapLayout` → single type Strapi **Hall Map**. Przy eksporcie body może zawierać `publish_hall_map` (domyślnie `true`): wtedy zapis idzie od razu jako opublikowany na stronie; `false` = tylko draft w Strapi. Szczegóły po stronie Targus: `targus/docs/hall-map-sync.md`.

## Konfiguracja

Zmienne: sekcja 7 w [zmienne-srodowiskowe-env.md](./zmienne-srodowiskowe-env.md).

Lokalnie z Dockera: `STRAPI_URL=http://host.docker.internal:1337` + token API z uprawnieniami Company (find/findOne/create/update/**delete**), Job (find/findOne/create/update/delete), taxonomie find, Hall Map find/update, Upload upload/destroy.

**Po wdrożeniu tej funkcji** w panelu Strapi (Settings → API Tokens) dopisz do istniejącego Custom tokena: `company` **delete** (reszta CRUD jak wcześniej; Job już zwykle ma delete). Samej wartości tokena w `.env` nie trzeba zmieniać.

Uwaga: w Custom API Token **nie ma** osobnego checkboxa `publish` — Content API ma tylko find/create/update/delete. Publikacja z system32 idzie przez `create`/`update` bez `status=draft` (to wystarczy przy Draft & Publish).

## Poza zakresem (na później)

Eksport ogłoszeń Jobwall / E-JobWall — osobny flow.
