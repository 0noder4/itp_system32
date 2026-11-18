# Arkusze — jak dodać arkusz, zakładkę i kolumnę

Silnik jest w `backend/sheets/`. Frontend (`/panel/staff/sheets`) sam rysuje to, co zwróci API, więc nowy arkusz to głównie definicja w Pythonie.

## Gdzie co leży

| Plik | Po co |
| --- | --- |
| `sheets/registry.py` | Typy kolumny, zakładki i arkusza. Nie edytować przy dokładaniu kolumny. |
| `sheets/definitions/common.py` | Kolumny wspólne (nazwa, pakiet, FR, opiekun, stoiska, statusy etapów). |
| `sheets/definitions/<arkusz>.py` | Jeden plik na arkusz. |
| `sheets/definitions/__init__.py` | Lista arkuszy w `CATALOG`. |
| `sheets/coverage.py` | Pola formularza jeszcze bez kolumny (`NOT_YET_MAPPED`) albo świadomie pominięte. |
| `frontend` | Nic nie zmieniać, dopóki nie dochodzi nowy rodzaj komórki. |

## Kolumna

Jedna kolumna to jeden obiekt `ColumnDef`. Ten sam obiekt można wstawić do wielu zakładek — wartość jest wtedy jedna (jak IMPORTRANGE, bez kopiowania).

`source`:

- `system` — wartość z modelu formularza (`getter` + `source_fields`). Domyślnie tylko odczyt w siatce; kolumny z `setter` (skalar lub lista) mogą iść przez wersję roboczą / commit (patrz niżej).
- `computed` — tylko odczyt, wartość wyliczona w Pythonie (`getter`). Sumy, pakiet, dopłaty i `money.pdf` nie mają draftu ani commita.
- `extra` — edytowalna, trzymana w `SheetCellValue`. Bez `getter`/`setter`. Wymaga `edit_roles`.
- `custom` — edytowalna, zapis na istniejącym modelu (`getter` + `setter`, np. `Company.opiekun`).

`kind`: `text`, `longtext`, `number`, `bool`, `select`, `date`, `time`, `user_select`, `file_link`. Grafiki formularza z `setter` (`sign.logo`, `sign.visualization`, `sign.fire_cert`, `catalogue.logo`) mają wersję roboczą i commit przez multipart (`POST .../cells/file/`). `money.pdf` zostaje tylko do odczytu.

`edit_roles` to zbiór ról, które mogą pisać zwykłym autosave (`fr`, `lg`, `tr`, `opiekun`). Admin ma wszystkie role. Kto ma rolę arkusza, ale nie ma `edit_roles` kolumny, widzi ją jako szarą (chyba że włączony jest tryb wersji roboczej i kolumna ma `can_draft`).

Kolumny z listy wyboru biorą `options` jako pary `(kod, etykieta)` albo funkcję bez argumentów (gdy lista zależy od bazy, np. opiekunowie).

## Zakładka i arkusz

`TabDef` ma kolumny, `row_filter` (które firmy widać), `select_related` i `prefetch_related`.

`SheetDef`:

- `roles` — kto widzi wszystkie wiersze i może edytować według `edit_roles`;
- `scoped_roles` — kto widzi tylko firmy, gdzie `Company.opiekun` to on, chyba że ma też rolę z `roles`.

Na końcu dopisać arkusz do `CATALOG` w `definitions/__init__.py`.

## Pole formularza

Test `sheets.tests.FieldCoverageTests` wymaga decyzji dla każdego pola modeli formularza:

- dopisać je w `source_fields` kolumny, albo
- wpisać w `NOT_YET_MAPPED` (jeszcze nie ma zakładki), albo
- wpisać w `EXCLUDED_FIELDS` z powodem.

Pole zmapowane i jednocześnie zostawione w `NOT_YET_MAPPED` wywala test.

## Zapis i konflikt

`PATCH /api/sheets/<arkusz>/<zakładka>/cells/` przyjmuje `{changes: [{company_id, column_key, value, base, mode?}]}`.

- `mode` (domyślnie `edit`): zwykły autosave kolumn `extra` / `custom` według `edit_roles`.
- `base` to wartość, którą użytkownik widział. Gdy w bazie jest już inna, ta jedna komórka wraca w `conflicts` (reszta paczki się zapisuje, odpowiedź ma status 200).
- Błąd walidacji (400) i brak uprawnień (403) odrzucają całą paczkę. Każdy udany zapis dopisuje `SheetCellChange` (przy `edit` i `commit`).

## Wersja robocza pól formularza (admin / LG / FR)

Dla kolumn `system` z setterem meta API wystawia `can_draft` i `can_commit` (admin albo rola `lg` / `fr`), także dla grafik `file_link`. Opiekun i TR **nie** dostają tych flag — `mode=draft` / `commit` / upload na polu systemowym kończy się 403.

Przepływ:

1. **`mode=draft`** — upsert `SheetCellDraft` (`company` + `column_key`). Formularz firmy **nie** zmienia się. W payloadzie zakładki komórka pokazuje draft (jeśli jest), a mapa `drafts` ma klucz `` `${companyId}|${columnKey}` ``.
2. **`mode=commit`** — setter zapisuje wartość w modelu firmy, powstaje / zostaje `SheetCellFormOverride` z **pierwszym** `previous_value` (kolejne commity go nie nadpisują), draft znika, audit w `SheetCellChange`.
3. **`POST .../cells/file/`** — multipart dla grafik. `mode=draft` trzyma plik w `sheet_file_drafts/` i w `SheetCellDraft` (formularz bez zmian; komórka pokazuje nazwę pliku roboczego). `mode=commit` zapisuje wybrany plik albo bieżący draft na `FileField`. Przed podmianą kopia starego pliku trafia do `sheet_file_backups/` jako `{path, name}` w `previous_value` — przywrócenie wgrywa ją z powrotem pod oryginalną nazwą, nie pod nazwą kopii.
4. **`POST .../cells/restore/`** — body `{cells: [{company_id, column_key}]}`; setter wraca do `previous_value`, kasuje override i ewentualny draft.

Listy (delegaci, PDI, prowadzący warsztatu, wyposażenie, ogłoszenia) idą jako JSON rekordów; w siatce nadal jeden tekst. Komórka złożona (np. główny przedstawiciel) ma `edit_parts`: imię, nazwisko, telefon. Zapis tych pól idzie osobnymi `column_key`, nawet gdy na zakładce widać tylko jeden tekst.

W panelu: **Edytuj** pod **Komentarz**. Klik komórki otwiera dialog (pola listy albo składowe). Pasek nad siatką jest tylko pełnym podglądem. W dialogu są **Zapisz do bazy** (`mode=commit`) i **Przywróć**. Markery tylko w arkuszu staff.

Modele: `SheetCellDraft`, `SheetCellFormOverride` (oba CASCADE na `Company`).

## Jak sprawdzić

```bash
docker exec system_32_backend python manage.py test sheets
```

Potem na `http://localhost:3000` zalogować konto z właściwą rolą i otworzyć Arkusze. Rola bez `fr` nie wchodzi do Panelu FR; sam TR i Opiekun nie wchodzą też na Mapę.
