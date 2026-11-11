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

- `system` — tylko odczyt, wartość z modelu formularza (`getter` + `source_fields`).
- `computed` — tylko odczyt, wartość wyliczona w Pythonie (`getter`).
- `extra` — edytowalna, trzymana w `SheetCellValue`. Bez `getter`/`setter`. Wymaga `edit_roles`.
- `custom` — edytowalna, zapis na istniejącym modelu (`getter` + `setter`, np. `Company.opiekun`).

`kind`: `text`, `longtext`, `number`, `bool`, `select`, `date`, `time`, `user_select`, `file_link` (plik tylko do odczytu).

`edit_roles` to zbiór ról, które mogą pisać (`fr`, `lg`, `tr`, `opiekun`). Admin ma wszystkie role. Kto ma rolę arkusza, ale nie ma `edit_roles` kolumny, widzi ją jako szarą.

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

`PATCH /api/sheets/<arkusz>/<zakładka>/cells/` przyjmuje `{changes: [{company_id, column_key, value, base}]}`. `base` to wartość, którą użytkownik widział. Gdy w bazie jest już inna, ta jedna komórka wraca w `conflicts` (reszta paczki się zapisuje, odpowiedź ma status 200). Błąd walidacji (400) i brak uprawnień (403) odrzucają całą paczkę. Każdy udany zapis dopisuje `SheetCellChange`.

## Jak sprawdzić

```bash
docker exec system_32_backend python manage.py test sheets
```

Potem na `http://localhost:3000` zalogować konto z właściwą rolą i otworzyć Arkusze. Rola bez `fr` nie wchodzi do Panelu FR; sam TR i Opiekun nie wchodzą też na Mapę.
