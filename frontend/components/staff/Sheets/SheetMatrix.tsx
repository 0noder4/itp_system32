"use client";

import React from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { displayText, toTsv } from "@/lib/sheets/format";
import { sheetToneInk, toneBackground } from "@/lib/sheets/tones";
import type {
  MatrixCandidate,
  MatrixPlacement,
  SheetCellsResponse,
  SheetColumn,
  SheetMatrixMeta,
  SheetRow,
} from "@/lib/sheets/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const SLOT_KEYS = ["14-16", "16-18", "18-20", "20-22", "NO"] as const;

const REASON_LABEL: Record<MatrixCandidate["reason"], string> = {
  missing_day: "brak dnia",
  other_day: "inny dzień",
  missing_slot: "brak slotu",
  bad_slot: "nietypowy slot",
  overflow: "ponad limit 5",
};

function slotFromColumnKey(key: string): string | null {
  if (!key.startsWith("matrix.slot.")) return null;
  return key.slice("matrix.slot.".length);
}

function placementAt(
  meta: SheetMatrixMeta,
  slot: string,
  index: number
): MatrixPlacement | null {
  const list = meta.placements[slot] ?? [];
  return list[index] ?? null;
}

/**
 * Montage schedule: read-only labels in the grid, assign/clear writes care.* on Główny
 * (same SheetCellValue source of truth — no second store).
 */
export function SheetMatrix({
  columns,
  rows,
  meta,
  sheetKey,
  onChanged,
}: {
  columns: SheetColumn[];
  rows: SheetRow[];
  meta: SheetMatrixMeta | undefined;
  sheetKey: string;
  onChanged: () => void;
}) {
  const [anchor, setAnchor] = React.useState<{ r: number; c: number } | null>(null);
  const [focus, setFocus] = React.useState<{ r: number; c: number } | null>(null);
  const [picker, setPicker] = React.useState<{ r: number; c: number; slot: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const busyRef = React.useRef(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const selected = (r: number, c: number) => {
    if (!anchor || !focus) return false;
    const r1 = Math.min(anchor.r, focus.r);
    const r2 = Math.max(anchor.r, focus.r);
    const c1 = Math.min(anchor.c, focus.c);
    const c2 = Math.max(anchor.c, focus.c);
    return r >= r1 && r <= r2 && c >= c1 && c <= c2;
  };

  React.useEffect(() => {
    const onCopy = (event: ClipboardEvent) => {
      if (!anchor || !focus) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) {
        return;
      }
      const r1 = Math.min(anchor.r, focus.r);
      const r2 = Math.max(anchor.r, focus.r);
      const c1 = Math.min(anchor.c, focus.c);
      const c2 = Math.max(anchor.c, focus.c);
      const matrix: string[][] = [];
      for (let r = r1; r <= r2; r++) {
        const line: string[] = [];
        for (let c = c1; c <= c2; c++) {
          const col = columns[c];
          const row = rows[r];
          line.push(col && row ? displayText(col, row.cells[col.key] ?? null) : "");
        }
        matrix.push(line);
      }
      const tsv = toTsv(matrix);
      if (event.clipboardData) {
        event.preventDefault();
        event.clipboardData.setData("text/plain", tsv);
        return;
      }
      void navigator.clipboard.writeText(tsv);
    };
    const node = rootRef.current;
    node?.addEventListener("copy", onCopy);
    return () => node?.removeEventListener("copy", onCopy);
  }, [anchor, columns, focus, rows]);

  const savePlacement = async (
    companyId: number,
    day: string | null,
    slot: string | null,
    baseDay: SheetMatrixMeta["candidates"][0]["arrival_day"],
    baseSlot: string | null
  ) => {
    if (!meta || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { data } = await apiClient.patch<SheetCellsResponse>(
        `/api/sheets/${sheetKey}/${meta.edit_tab}/cells/`,
        {
          changes: [
            {
              company_id: companyId,
              column_key: "care.arrival_day",
              value: day,
              base: baseDay,
            },
            {
              company_id: companyId,
              column_key: "care.slot",
              value: slot === "NO" ? null : slot,
              base: baseSlot,
            },
          ],
        }
      );
      if (data.conflicts?.length) {
        const who = data.conflicts[0]?.updated_by;
        toast.warning("Ktoś inny zmienił ten wpis.", {
          description: who
            ? `Ostatnia zmiana: ${who}. Odświeżono widok.`
            : "Odświeżono widok — spróbuj ponownie.",
        });
        setPicker(null);
        onChanged();
        return;
      }
      toast.success(day ? "Przypisano firmę do slotu." : "Usunięto firmę z harmonogramu.");
      setPicker(null);
      onChanged();
    } catch (error: unknown) {
      const response = (error as { response?: { data?: { detail?: unknown; errors?: { detail?: unknown }[] } } })
        .response;
      const detail =
        response?.data?.errors?.[0]?.detail ||
        response?.data?.detail ||
        "Nie udało się zapisać przypisania. Odśwież i spróbuj ponownie.";
      toast.error("Nie udało się zapisać przypisania.", { description: String(detail) });
      onChanged();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const assignCandidate = (candidate: MatrixCandidate, slot: string) => {
    if (!meta) return;
    void savePlacement(candidate.company_id, meta.day, slot, candidate.arrival_day, candidate.slot);
  };

  const clearPlacement = (item: MatrixPlacement) => {
    void savePlacement(item.company_id, null, null, item.arrival_day, item.slot);
  };

  if (columns.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Brak kolumn harmonogramu.</p>;
  }

  const editable = Boolean(meta?.editable);
  const candidates = meta?.candidates ?? [];
  const placed = meta?.placed_count ?? 0;
  const ownTotal = meta?.own_build_total ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
        <p>
          Harmonogram montażu — ten sam dzień i slot co na zakładce Główny (własna zabudowa).
          {editable
            ? " Kliknij pustą komórkę slotu, żeby przypisać firmę, albo zajętą, żeby usunąć."
            : " Tylko podgląd — brak uprawnień do edycji dnia/slotu."}
        </p>
        <p>
          Firmy z własną zabudową: {ownTotal}. Na tym dniu: {placed}.
          {ownTotal === 0
            ? " Żadna widoczna firma nie ma zaznaczonej własnej zabudowy."
            : placed === 0
              ? " Ustaw dzień i slot poniżej albo na Głównym."
              : null}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <div
          ref={rootRef}
          tabIndex={0}
          className="h-full min-h-0 min-w-0 flex-1 overflow-auto rounded-md border bg-background text-sm outline-none"
          onMouseDown={() => rootRef.current?.focus()}
        >
          <table className="w-max min-w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-background">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="border-b border-r px-2 py-1.5 text-left text-xs font-semibold"
                    style={{ minWidth: col.width }}
                  >
                    {col.label.replace(/\n/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={row.company_id}>
                  {columns.map((col, c) => {
                    const text = displayText(col, row.cells[col.key] ?? null);
                    const tone = toneBackground(row.tones?.[col.key]);
                    const isSelected = selected(r, c);
                    const slot = slotFromColumnKey(col.key);
                    const placement = meta && slot ? placementAt(meta, slot, r) : null;
                    const fill =
                      placement?.color && !isSelected
                        ? placement.color
                        : !isSelected
                          ? tone || undefined
                          : undefined;
                    const onPastelPlacement = Boolean(placement?.color && !isSelected);
                    const onTone = Boolean(tone && !placement && !isSelected);
                    const isPicker = picker?.r === r && picker?.c === c;
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          "relative border-b border-r px-2 py-1.5 align-middle text-center whitespace-pre-wrap",
                          isSelected && "outline outline-2 -outline-offset-2 outline-sky-500",
                          editable && slot && !placement && "cursor-pointer hover:bg-muted/50",
                          editable && slot && placement && "cursor-pointer",
                          onPastelPlacement && "font-medium text-slate-900"
                        )}
                        style={{
                          backgroundColor: fill,
                          minWidth: col.width,
                          minHeight: placement ? 52 : undefined,
                          ...(onTone ? { color: sheetToneInk() } : {}),
                          ...(onPastelPlacement ? { colorScheme: "light" as const } : {}),
                        }}
                        onMouseDown={(event) => {
                          if (event.shiftKey && anchor) setFocus({ r, c });
                          else {
                            setAnchor({ r, c });
                            setFocus({ r, c });
                          }
                        }}
                        onClick={() => {
                          if (!editable || !slot || !meta || busy || busyRef.current) return;
                          setPicker({ r, c, slot });
                        }}
                      >
                        {text || (editable && slot ? (
                          <span className="text-muted-foreground/70">+ przypisz</span>
                        ) : null)}
                        {isPicker && meta && (
                          <div
                            className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border bg-background p-2 text-left shadow-md"
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            {placement ? (
                              <div className="space-y-2">
                                <p className="whitespace-pre-wrap text-xs font-medium">
                                  {placement.label}
                                </p>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  className="w-full"
                                  onClick={() => clearPlacement(placement)}
                                >
                                  Usuń z harmonogramu
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="w-full"
                                  onClick={() => setPicker(null)}
                                >
                                  Anuluj
                                </Button>
                              </div>
                            ) : candidates.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Brak firm do przypisania. Na Głównym zaznacz własną zabudowę
                                albo zwolnij firmę z innego dnia/slotu.
                              </p>
                            ) : (
                              <div className="max-h-56 space-y-1 overflow-auto">
                                <p className="mb-1 text-xs text-muted-foreground">
                                  Wybierz firmę do slotu {slot}:
                                </p>
                                {candidates.map((candidate) => (
                                  <button
                                    key={candidate.company_id}
                                    type="button"
                                    disabled={busy}
                                    className="flex w-full items-start gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                                    onClick={() => assignCandidate(candidate, slot)}
                                  >
                                    <span
                                      className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border"
                                      style={{ backgroundColor: candidate.color }}
                                      aria-hidden
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block font-medium">{candidate.name}</span>
                                      {(candidate.make || candidate.registration) && (
                                        <span className="block text-muted-foreground">
                                          {[candidate.make, candidate.registration]
                                            .filter(Boolean)
                                            .join(" - ")}
                                        </span>
                                      )}
                                      <span className="block text-muted-foreground">
                                        {REASON_LABEL[candidate.reason]}
                                      </span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editable && (
          <aside className="hidden w-56 shrink-0 overflow-auto rounded-md border bg-background p-2 text-xs md:block">
            <p className="mb-2 font-semibold">Do ustawienia ({candidates.length})</p>
            {candidates.length === 0 ? (
              <p className="text-muted-foreground">Wszystkie firmy z zabudową mają ten dzień i slot albo nie ma takich firm.</p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((candidate) => (
                  <li key={candidate.company_id} className="rounded border px-2 py-1">
                    <div className="flex items-start gap-2">
                      <span
                        className="mt-0.5 h-3 w-3 shrink-0 rounded-sm border"
                        style={{ backgroundColor: candidate.color }}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{candidate.name}</div>
                        {(candidate.make || candidate.registration) && (
                          <div className="text-muted-foreground">
                            {[candidate.make, candidate.registration].filter(Boolean).join(" - ")}
                          </div>
                        )}
                        <div className="text-muted-foreground">{REASON_LABEL[candidate.reason]}</div>
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {SLOT_KEYS.filter((s) => s !== "NO").map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          disabled={busy}
                          className="rounded border px-1 py-0.5 hover:bg-muted"
                          onClick={() => assignCandidate(candidate, slot)}
                        >
                          {slot}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded border px-1 py-0.5 hover:bg-muted"
                        onClick={() => assignCandidate(candidate, "NO")}
                      >
                        NO
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
