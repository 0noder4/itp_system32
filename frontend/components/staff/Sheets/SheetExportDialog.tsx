"use client";

import React from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { applyColumnGroupOverrides, applyColumnOrder } from "@/lib/sheets/columnOrder";
import { downloadCsv } from "@/lib/sheets/format";
import { buildCsvMatrix, buildStyledXlsxPayload } from "@/lib/sheets/xlsxExport";
import type { SheetColumn, SheetRow, SheetTabPayload } from "@/lib/sheets/types";
import { cn } from "@/lib/utils";

const SHEET_TOOLBAR_OUTLINE = "border-neutral-400 shadow-none dark:border-input";

type ExportScope = "selection" | "tabs";

interface SheetExportDialogProps {
  sheetKey: string;
  currentTabKey: string;
  tabs: { key: string; title: string }[];
  /** Columns / rows currently visible on the active tab (filters apply). */
  currentColumns: SheetColumn[];
  currentRows: SheetRow[];
  /** Frozen columns on the active tab (as shown in the grid). */
  currentFrozenColumns?: number;
  cellStyles?: Record<string, string>;
  customGroupColors?: Record<string, string>;
  getSelectedCells: () => { companyId: number; columnKey: string }[];
}

function readHiddenColumns(sheetKey: string, tabKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(`sheets:hidden:${sheetKey}:${tabKey}`);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function readOrderColumns(sheetKey: string, tabKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(`sheets:order:${sheetKey}:${tabKey}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function readGroupOverrides(sheetKey: string, tabKey: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`sheets:groups:${sheetKey}:${tabKey}`);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Drop globally/locally hidden columns, apply local layout, and recompute freeze. */
function withLocalTabLayout(
  payload: SheetTabPayload,
  hidden: Set<string>,
  order: string[],
  groupOverrides: Record<string, string>
): SheetTabPayload {
  const withGroups = applyColumnGroupOverrides(payload.columns, groupOverrides);
  const full = applyColumnOrder(withGroups, order);
  const columns = full.filter(
    (col, index) => index === 0 || (!col.hidden_for_all && !hidden.has(col.key))
  );
  const defined = payload.tab.frozen_columns ?? 1;
  let frozen = 0;
  for (let i = 0; i < full.length && i < defined; i++) {
    const col = full[i];
    if (i === 0 || (col && !col.hidden_for_all && !hidden.has(col.key))) frozen += 1;
  }
  return {
    ...payload,
    columns,
    tab: { ...payload.tab, frozen_columns: Math.min(frozen, columns.length) },
  };
}

interface MediaCellRef {
  company_id: number;
  column_key: string;
}

function dedupeMediaCells(cells: MediaCellRef[]): MediaCellRef[] {
  const out: MediaCellRef[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    const id = `${cell.company_id}|${cell.column_key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(cell);
  }
  return out;
}

function collectSelectedMediaCells(
  columns: SheetColumn[],
  rows: SheetRow[],
  selectedCells: { companyId: number; columnKey: string }[]
): MediaCellRef[] {
  const fileCols = columns.filter((col) => col.kind === "file_link");
  if (fileCols.length === 0) return [];
  const fileColKeys = new Set(fileCols.map((col) => col.key));

  const direct = selectedCells
    .filter((cell) => fileColKeys.has(cell.columnKey))
    .map((cell) => ({ company_id: cell.companyId, column_key: cell.columnKey }));
  if (direct.length > 0) {
    return dedupeMediaCells(direct);
  }

  const companyIds = new Set(selectedCells.map((cell) => cell.companyId));
  const fallback: MediaCellRef[] = [];
  for (const row of rows) {
    if (!companyIds.has(row.company_id)) continue;
    for (const col of fileCols) {
      fallback.push({ company_id: row.company_id, column_key: col.key });
    }
  }
  return dedupeMediaCells(fallback);
}

function collectMediaCellsFromPayloads(payloads: SheetTabPayload[]): MediaCellRef[] {
  const collected: MediaCellRef[] = [];
  for (const payload of payloads) {
    const fileCols = payload.columns.filter((col) => col.kind === "file_link");
    if (fileCols.length === 0) continue;
    for (const row of payload.rows) {
      for (const col of fileCols) {
        collected.push({ company_id: row.company_id, column_key: col.key });
      }
    }
  }
  return dedupeMediaCells(collected);
}

async function downloadSheetMediaZip(
  sheetKey: string,
  tabKey: string,
  cells: MediaCellRef[],
  date: string
): Promise<boolean> {
  if (cells.length === 0) return false;
  const response = await apiClient.post(
    `/api/sheets/${sheetKey}/${tabKey}/media/`,
    { cells },
    { responseType: "blob" }
  );
  if (response.status === 204) {
    return false;
  }
  const blob = new Blob([response.data], { type: "application/zip" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${sheetKey}-media-${date}.zip`;
  link.click();
  URL.revokeObjectURL(href);
  return true;
}

type TabCombine = "merge" | "separate";

async function downloadXlsxBlob(
  sheetKey: string,
  tabKey: string,
  body: object,
  date: string
) {
  const response = await apiClient.post(`/api/sheets/${sheetKey}/${tabKey}/xlsx/`, body, {
    responseType: "blob",
  });
  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${sheetKey}-${date}.xlsx`;
  link.click();
  URL.revokeObjectURL(href);
}

function xlsxSheetBody(name: string, payload: ReturnType<typeof buildStyledXlsxPayload>) {
  return {
    name,
    rows: payload.rows,
    fills: payload.fills,
    bold: payload.bold,
    col_widths: payload.col_widths,
    freeze_rows: payload.freeze_rows,
    freeze_cols: payload.freeze_cols,
  };
}

function mergeTabPayloads(payloads: SheetTabPayload[]): {
  columns: SheetColumn[];
  rows: SheetRow[];
  cellStyles: Record<string, string>;
} {
  const colMap = new Map<string, SheetColumn>();
  const cellStyles: Record<string, string> = {};
  for (const payload of payloads) {
    for (const col of payload.columns) {
      if (!colMap.has(col.key)) colMap.set(col.key, col);
    }
    Object.assign(cellStyles, payload.cell_styles ?? {});
  }
  const rowMap = new Map<number, SheetRow>();
  for (const payload of payloads) {
    for (const row of payload.rows) {
      const existing = rowMap.get(row.company_id);
      if (!existing) {
        rowMap.set(row.company_id, {
          company_id: row.company_id,
          resigned: row.resigned,
          mine: row.mine,
          cells: { ...row.cells },
        });
      } else {
        Object.assign(existing.cells, row.cells);
        existing.resigned = existing.resigned || row.resigned;
      }
    }
  }
  return { columns: [...colMap.values()], rows: [...rowMap.values()], cellStyles };
}

export function SheetExportDialog({
  sheetKey,
  currentTabKey,
  tabs,
  currentColumns,
  currentRows,
  currentFrozenColumns = 1,
  cellStyles = {},
  customGroupColors = {},
  getSelectedCells,
}: SheetExportDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [wantXlsx, setWantXlsx] = React.useState(true);
  const [wantCsv, setWantCsv] = React.useState(false);
  const [wantMedia, setWantMedia] = React.useState(false);
  const [scope, setScope] = React.useState<ExportScope>("tabs");
  const [tabCombine, setTabCombine] = React.useState<TabCombine>("merge");
  const [selectedTabs, setSelectedTabs] = React.useState<string[]>([currentTabKey]);
  const [selectionCount, setSelectionCount] = React.useState(0);

  const openDialog = (next: boolean) => {
    if (next) {
      const cells = getSelectedCells();
      setSelectionCount(cells.length);
      setScope(cells.length > 0 ? "selection" : "tabs");
      setSelectedTabs((prev) => (prev.includes(currentTabKey) ? prev : [...prev, currentTabKey]));
    }
    setOpen(next);
  };

  const toggleTab = (key: string) => {
    setSelectedTabs((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== key);
      }
      return [...prev, key];
    });
  };

  const loadTabPayloads = async (): Promise<SheetTabPayload[]> => {
    const payloads: SheetTabPayload[] = [];
    // Multi-tab: full row lists from API for every tab (no mixed filter scopes).
    // Still honour per-tab hidden columns from localStorage. Single current-tab
    // export keeps on-screen filters via currentRows.
    const useScreenForCurrent = selectedTabs.length === 1 && selectedTabs[0] === currentTabKey;
    for (const tab of selectedTabs) {
      if (tab === currentTabKey && useScreenForCurrent) {
        payloads.push({
          sheet: { key: sheetKey, title: sheetKey },
          tab: {
            key: tab,
            title: tabs.find((item) => item.key === tab)?.title ?? tab,
            frozen_columns: currentFrozenColumns,
          },
          columns: currentColumns,
          rows: currentRows,
          cell_styles: cellStyles,
          generated_at: new Date().toISOString(),
        });
      } else {
        const { data } = await apiClient.get<SheetTabPayload>(`/api/sheets/${sheetKey}/${tab}/`);
        payloads.push(
          withLocalTabLayout(
            data,
            readHiddenColumns(sheetKey, tab),
            readOrderColumns(sheetKey, tab),
            readGroupOverrides(sheetKey, tab)
          )
        );
      }
    }
    return payloads;
  };

  const confirmExport = async () => {
    if (!wantCsv && !wantXlsx && !wantMedia) {
      toast.message(t("sheets.export.pickFormat"));
      return;
    }
    setBusy(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      let onlyCells: Set<string> | undefined;

      if (scope === "selection") {
        const cells = getSelectedCells();
        if (cells.length === 0) {
          toast.message(t("sheets.export.noSelection"));
          return;
        }
        onlyCells = new Set(cells.map((c) => `${c.companyId}|${c.columnKey}`));
        if (wantCsv || wantXlsx) {
          const csvMatrix = buildCsvMatrix(currentColumns, currentRows, onlyCells);
          if (csvMatrix.length <= 1 || csvMatrix[0].length === 0) {
            toast.message(t("sheets.export.empty"));
            return;
          }
          if (wantCsv) downloadCsv(`${sheetKey}-${date}.csv`, csvMatrix);
          if (wantXlsx) {
            const payload = buildStyledXlsxPayload(currentColumns, currentRows, {
              onlyCells,
              cellStyles,
              customGroupColors,
              includeGroupRow: false,
              freezeCols: currentFrozenColumns,
            });
            await downloadXlsxBlob(sheetKey, currentTabKey, payload, date);
          }
        }
        if (wantMedia) {
          const mediaCells = collectSelectedMediaCells(currentColumns, currentRows, cells);
          const downloaded = await downloadSheetMediaZip(
            sheetKey,
            currentTabKey,
            mediaCells,
            date
          );
          if (!downloaded) {
            toast.message(t("sheets.export.noMedia"));
            if (!wantCsv && !wantXlsx) return;
          }
        }
      } else {
        if (selectedTabs.length === 0) {
          toast.message(t("sheets.export.pickTabs"));
          return;
        }
        const tabPayloads = await loadTabPayloads();
        const mergedGroupColors: Record<string, string> = { ...customGroupColors };
        for (const payload of tabPayloads) {
          for (const grp of payload.custom_groups ?? []) {
            if (grp.color && !mergedGroupColors[grp.name]) {
              mergedGroupColors[grp.name] = grp.color;
            }
          }
        }
        const separate = tabCombine === "separate" && tabPayloads.length > 1;

        if (separate) {
          if (wantCsv) {
            for (const payload of tabPayloads) {
              const matrix = buildCsvMatrix(payload.columns, payload.rows);
              if (matrix.length <= 1) continue;
              downloadCsv(`${sheetKey}-${payload.tab.key}-${date}.csv`, matrix);
            }
          }
          if (wantXlsx) {
            const sheets = tabPayloads.map((payload) => {
              const styled = buildStyledXlsxPayload(payload.columns, payload.rows, {
                cellStyles: payload.cell_styles ?? {},
                customGroupColors: mergedGroupColors,
                includeGroupRow: true,
                freezeCols: payload.tab.frozen_columns,
              });
              return xlsxSheetBody(payload.tab.title || payload.tab.key, styled);
            });
            if (sheets.length === 0) {
              toast.message(t("sheets.export.empty"));
              return;
            }
            await downloadXlsxBlob(sheetKey, currentTabKey, { sheets }, date);
          }
        } else {
          const merged = mergeTabPayloads(tabPayloads);
          if (wantCsv || wantXlsx) {
            const csvMatrix = buildCsvMatrix(merged.columns, merged.rows);
            if (csvMatrix.length <= 1 || csvMatrix[0].length === 0) {
              toast.message(t("sheets.export.empty"));
              return;
            }
            if (wantCsv) downloadCsv(`${sheetKey}-${date}.csv`, csvMatrix);
            if (wantXlsx) {
              // Merged sheet: pin from the current tab when present, else the first selected.
              const freezeSource =
                tabPayloads.find((payload) => payload.tab.key === currentTabKey) ?? tabPayloads[0];
              const freezeCols = freezeSource?.tab.frozen_columns ?? 1;
              const payload = buildStyledXlsxPayload(merged.columns, merged.rows, {
                cellStyles: merged.cellStyles,
                customGroupColors: mergedGroupColors,
                includeGroupRow: true,
                freezeCols,
              });
              await downloadXlsxBlob(sheetKey, currentTabKey, payload, date);
            }
          }
        }

        if (wantMedia) {
          const mediaCells = collectMediaCellsFromPayloads(tabPayloads);
          const downloaded = await downloadSheetMediaZip(
            sheetKey,
            currentTabKey,
            mediaCells,
            date
          );
          if (!downloaded) {
            toast.message(t("sheets.export.noMedia"));
            if (!wantCsv && !wantXlsx) return;
          }
        }
      }

      setOpen(false);
      toast.success(t("sheets.export.done"));
    } catch {
      toast.error(t("sheets.export.error"));
    } finally {
      setBusy(false);
    }
  };

  const canConfirm =
    (wantCsv || wantXlsx || wantMedia) &&
    (scope === "selection" ? selectionCount > 0 : selectedTabs.length > 0);

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className={SHEET_TOOLBAR_OUTLINE}>
          <Download className="mr-1 h-4 w-4" />
          {t("sheets.export.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sheets.export.title")}</DialogTitle>
          <DialogDescription>{t("sheets.export.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("sheets.export.formats")}</h3>
            <div className="space-y-1 rounded border p-2 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={wantXlsx} onChange={(e) => setWantXlsx(e.target.checked)} />
                XLSX
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={wantCsv} onChange={(e) => setWantCsv(e.target.checked)} />
                CSV
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={wantMedia} onChange={(e) => setWantMedia(e.target.checked)} />
                {t("sheets.export.media")}
              </label>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("sheets.export.scope")}</h3>
            <div className="space-y-2 rounded border p-2 text-sm">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  name="export-scope"
                  checked={scope === "selection"}
                  onChange={() => setScope("selection")}
                  disabled={selectionCount === 0}
                />
                <span>
                  {t("sheets.export.scopeSelection")}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {selectionCount > 0
                      ? t("sheets.export.selectionCount", { count: selectionCount })
                      : t("sheets.export.selectionEmpty")}
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  className="mt-1"
                  name="export-scope"
                  checked={scope === "tabs"}
                  onChange={() => setScope("tabs")}
                />
                <span>{t("sheets.export.scopeTabs")}</span>
              </label>
              <div className={cn("ml-6 space-y-1", scope !== "tabs" && "pointer-events-none opacity-50")}>
                {tabs.map((tab) => (
                  <label key={tab.key} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedTabs.includes(tab.key)}
                      onChange={() => toggleTab(tab.key)}
                      disabled={scope !== "tabs"}
                    />
                    <span className="truncate">{tab.title}</span>
                  </label>
                ))}
              </div>
              <div
                className={cn(
                  "ml-6 space-y-1 border-t pt-2",
                  scope !== "tabs" && "pointer-events-none opacity-50"
                )}
              >
                <p className="text-xs font-medium text-foreground">{t("sheets.export.tabCombineLabel")}</p>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    className="mt-1"
                    name="export-tab-combine"
                    checked={tabCombine === "merge"}
                    onChange={() => setTabCombine("merge")}
                    disabled={scope !== "tabs"}
                  />
                  <span>
                    {t("sheets.export.tabCombineMerge")}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t("sheets.export.tabCombineMergeHint")}
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    className="mt-1"
                    name="export-tab-combine"
                    checked={tabCombine === "separate"}
                    onChange={() => setTabCombine("separate")}
                    disabled={scope !== "tabs"}
                  />
                  <span>
                    {t("sheets.export.tabCombineSeparate")}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t("sheets.export.tabCombineSeparateHint")}
                    </span>
                  </span>
                </label>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={busy || !canConfirm} onClick={() => void confirmExport()}>
            {t("sheets.export.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
