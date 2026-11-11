"use client";

import React from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { Filter, Paintbrush, Redo2, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSheetEdits, type CellEdit } from "@/hooks/useSheetEdits";
import { compareCells, displayText } from "@/lib/sheets/format";
import { SHEET_CELL_COLORS, cellStyleId } from "@/lib/sheets/cellColors";
import { cellId, type SheetCellValue, type SheetRow, type SheetTabPayload } from "@/lib/sheets/types";
import { SheetGrid, type SheetGridHandle, type SheetSort } from "./SheetGrid";
import { SheetExportDialog } from "./SheetExportDialog";
import { SheetSettingsDialog } from "./SheetSettingsDialog";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 15000;

/** Stronger outline than default — light mode borders were hard to see on white. */
const SHEET_TOOLBAR_OUTLINE = "border-neutral-400 shadow-none dark:border-input";

interface FetchedTab extends SheetTabPayload {
  /** Client time when the request started — confirmed saves newer than this win. */
  fetchedAt: number;
}

const tabFetcher = async (url: string): Promise<FetchedTab> => {
  const fetchedAt = Date.now();
  const { data } = await apiClient.get<SheetTabPayload>(url);
  return { ...data, fetchedAt };
};

const hiddenStorageKey = (sheet: string, tab: string) => `sheets:hidden:${sheet}:${tab}`;

function readHidden(sheet: string, tab: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(hiddenStorageKey(sheet, tab));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);

export function SheetTabView({
  sheetKey,
  tabKey,
  tabs = [],
  mineFilter = false,
}: {
  sheetKey: string;
  tabKey: string;
  tabs?: { key: string; title: string }[];
  /** FR/LG looking at every company can narrow the Opiekun sheet to firms they personally handle. */
  mineFilter?: boolean;
}) {
  const { t } = useTranslation();
  const url = `/api/sheets/${sheetKey}/${tabKey}/`;
  const { data, error, isLoading, mutate } = useSWR<FetchedTab>(url, tabFetcher, {
    refreshInterval: POLL_INTERVAL_MS,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  const [confirmed, setConfirmed] = React.useState<Map<string, { value: SheetCellValue; at: number }>>(
    () => new Map()
  );
  const dataRef = React.useRef(data);
  dataRef.current = data;
  const confirmedRef = React.useRef(confirmed);
  confirmedRef.current = confirmed;

  const getServerValue = React.useCallback((companyId: number, columnKey: string): SheetCellValue => {
    const id = cellId(companyId, columnKey);
    const entry = confirmedRef.current.get(id);
    const current = dataRef.current;
    if (entry && (!current || entry.at > current.fetchedAt)) return entry.value;
    const row = current?.rows.find((r) => r.company_id === companyId);
    return row ? (row.cells[columnKey] ?? null) : null;
  }, []);

  const onServerValues = React.useCallback((values: CellEdit[]) => {
    const at = Date.now();
    setConfirmed((prev) => {
      const next = new Map(prev);
      for (const v of values) next.set(cellId(v.companyId, v.columnKey), { value: v.value, at });
      confirmedRef.current = next;
      return next;
    });
  }, []);

  const columnLabel = React.useCallback(
    (key: string) => dataRef.current?.columns.find((c) => c.key === key)?.label ?? key,
    []
  );

  const edits = useSheetEdits({
    cellsUrl: `${url}cells/`,
    getServerValue,
    onServerValues,
    columnLabel,
  });

  // Drop confirmed values once fresher server data has arrived.
  React.useEffect(() => {
    if (!data) return;
    setConfirmed((prev) => {
      if (![...prev.values()].some((entry) => entry.at <= data.fetchedAt)) return prev;
      const next = new Map([...prev].filter(([, entry]) => entry.at > data.fetchedAt));
      confirmedRef.current = next;
      return next;
    });
  }, [data]);

  const [search, setSearch] = React.useState("");
  const [mineOnly, setMineOnly] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyTitle, setHistoryTitle] = React.useState("");
  const [historyRows, setHistoryRows] = React.useState<{ old: string; new: string; by: string; at: string }[]>([]);
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = React.useState(false);
  const [sort, setSort] = React.useState<SheetSort | null>(null);
  const [hidden, setHidden] = React.useState<Set<string>>(() => readHidden(sheetKey, tabKey));
  const [cellStyles, setCellStyles] = React.useState<Record<string, string>>({});
  const [fillColor, setFillColor] = React.useState("");
  const [fillBusy, setFillBusy] = React.useState(false);
  const [headerHost, setHeaderHost] = React.useState<HTMLElement | null>(null);
  const gridRef = React.useRef<SheetGridHandle>(null);

  React.useEffect(() => {
    setHeaderHost(document.getElementById("sheet-header-actions"));
  }, []);

  React.useEffect(() => {
    if (!data) return;
    setCellStyles(data.cell_styles ?? {});
  }, [data?.generated_at]); // eslint-disable-line react-hooks/exhaustive-deps -- sync fills when tab payload refreshes

  const toggleHidden = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      window.localStorage.setItem(hiddenStorageKey(sheetKey, tabKey), JSON.stringify([...next]));
      return next;
    });
  };

  const applyFillColor = async (bgColor: string) => {
    const cells = gridRef.current?.getSelectedCells() ?? [];
    if (cells.length === 0) {
      toast.message(t("sheets.fill.pickCells"));
      return;
    }
    setFillColor(bgColor);
    setFillBusy(true);
    const snapshot = cellStyles;
    setCellStyles((prev) => {
      const next = { ...prev };
      for (const cell of cells) {
        const id = cellStyleId(cell.companyId, cell.columnKey);
        if (bgColor) next[id] = bgColor;
        else delete next[id];
      }
      return next;
    });
    try {
      await apiClient.patch(`${url}styles/`, {
        styles: cells.map((cell) => ({
          company_id: cell.companyId,
          column_key: cell.columnKey,
          bg_color: bgColor,
        })),
      });
      void mutate();
    } catch {
      setCellStyles(snapshot);
      toast.error(t("sheets.fill.error"));
      void mutate();
    } finally {
      setFillBusy(false);
    }
  };

  const allColumns = data?.columns;
  const columns = React.useMemo(
    () => (allColumns ?? []).filter((col, index) => index === 0 || !hidden.has(col.key)),
    [allColumns, hidden]
  );
  // Freeze = visible columns that still fall inside the tab's defined frozen prefix
  // (hiding a pinned column must not pull unpinned columns into the freeze zone).
  const frozenColumns = React.useMemo(() => {
    const all = allColumns ?? [];
    const defined = data?.tab.frozen_columns ?? 1;
    let n = 0;
    for (let i = 0; i < all.length && i < defined; i++) {
      if (i === 0 || !hidden.has(all[i].key)) n += 1;
    }
    return Math.min(n, columns.length);
  }, [allColumns, data?.tab.frozen_columns, hidden, columns.length]);

  // Server rows + confirmed saves + optimistic edits; untouched rows keep their identity.
  const mergedRows = React.useMemo<SheetRow[]>(() => {
    if (!data) return [];
    const touched = new Map<number, [string, SheetCellValue][]>();
    const add = (id: string, value: SheetCellValue) => {
      const sep = id.indexOf("|");
      const companyId = Number(id.slice(0, sep));
      const list = touched.get(companyId) ?? [];
      list.push([id.slice(sep + 1), value]);
      touched.set(companyId, list);
    };
    for (const [id, entry] of confirmed) if (entry.at > data.fetchedAt) add(id, entry.value);
    for (const [id, value] of edits.overlay) add(id, value);
    if (touched.size === 0) return data.rows;
    return data.rows.map((row) => {
      const changes = touched.get(row.company_id);
      if (!changes) return row;
      return { ...row, cells: { ...row.cells, ...Object.fromEntries(changes) } };
    });
  }, [data, confirmed, edits.overlay]);

  const visibleRows = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    const activeFilters = Object.entries(filters)
      .map(([key, value]) => [columns.find((c) => c.key === key), value.trim().toLowerCase()] as const)
      .filter(([col, value]) => col && value);
    let result = mergedRows.filter((row) => {
      if (mineOnly && !row.mine) return false;
      if (query && !columns.some((col) => displayText(col, row.cells[col.key]).toLowerCase().includes(query))) {
        return false;
      }
      return activeFilters.every(([col, value]) => {
        const text = displayText(col!, row.cells[col!.key]).toLowerCase();
        if (col!.kind === "bool" && (value === "nie" || value === "no")) return text === "";
        return text.includes(value);
      });
    });
    const sortCol = sort && columns.find((c) => c.key === sort.key);
    if (sort && sortCol) {
      const dir = sort.dir === "asc" ? 1 : -1;
      result = [...result].sort((a, b) => dir * compareCells(sortCol, a.cells[sortCol.key], b.cells[sortCol.key]));
    }
    return result;
  }, [mergedRows, columns, search, filters, sort, mineOnly]);

  const pendingIds = React.useMemo(() => new Set(edits.overlay.keys()), [edits.overlay]);

  const { undo, redo } = edits;
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  const openHistory = async () => {
    const focus = gridRef.current?.getFocusCell();
    if (!focus) {
      toast.message(t("sheets.historyPick"));
      return;
    }
    try {
      const { data: rows } = await apiClient.get<{ old: string; new: string; by: string; at: string }[]>(
        `${url}history/`,
        { params: { company_id: focus.companyId, column_key: focus.columnKey } }
      );
      setHistoryTitle(focus.label);
      setHistoryRows(rows);
      setHistoryOpen(true);
    } catch {
      toast.error(t("sheets.historyError"));
    }
  };

  if (error && !data) {
    return <div className="p-6 text-destructive">{t("sheets.loadError")}</div>;
  }
  if (isLoading && !data) {
    return <Skeleton className="m-4 h-[60vh]" />;
  }
  if (!data) return null;

  const headerActions = (
    <>
      <SheetExportDialog
        sheetKey={sheetKey}
        currentTabKey={tabKey}
        tabs={tabs.length > 0 ? tabs : [{ key: tabKey, title: data.tab.title }]}
        currentColumns={columns}
        currentRows={visibleRows}
        currentFrozenColumns={frozenColumns}
        cellStyles={cellStyles}
        getSelectedCells={() => gridRef.current?.getSelectedCells() ?? []}
      />
      <SheetSettingsDialog
        sheetKey={sheetKey}
        columns={data.columns}
        hidden={hidden}
        onToggleHidden={toggleHidden}
        getColumnWidths={() => gridRef.current?.getColumnWidths() ?? {}}
        applyColumnWidths={(widths) => gridRef.current?.setColumnWidths(widths)}
        hiddenCount={hidden.size}
        onOpenHistory={() => void openHistory()}
      />
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {headerHost ? createPortal(headerActions, headerHost) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("sheets.searchPlaceholder")}
            className="h-8 pl-8 border-neutral-400 dark:border-input"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant={showFilters ? "secondary" : "outline"}
          className={showFilters ? undefined : SHEET_TOOLBAR_OUTLINE}
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter className="mr-1 h-4 w-4" />
          {t("sheets.filters")}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={fillBusy}
              title={t("sheets.fill.hint")}
              className={cn("gap-1.5", SHEET_TOOLBAR_OUTLINE)}
            >
              <Paintbrush className="h-4 w-4" />
              <span
                className={cn(
                  "inline-block h-4 w-4 rounded-sm border border-neutral-400 dark:border-input",
                  !fillColor && "bg-[linear-gradient(135deg,#fff_45%,#ef4444_45%,#ef4444_55%,#fff_55%)]"
                )}
                style={fillColor ? { backgroundColor: fillColor } : undefined}
                aria-hidden
              />
              {t("sheets.fill.button")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <p className="mb-2 text-xs text-muted-foreground">{t("sheets.fill.hint")}</p>
            <div className="flex flex-wrap gap-1.5">
              {SHEET_CELL_COLORS.map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  title={swatch.label}
                  disabled={fillBusy}
                  onClick={() => void applyFillColor(swatch.value)}
                  className={cn(
                    "h-7 w-7 rounded border border-neutral-400 transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-input",
                    fillColor === swatch.value && "ring-2 ring-ring ring-offset-1",
                    !swatch.value && "bg-[linear-gradient(135deg,#fff_45%,#ef4444_45%,#ef4444_55%,#fff_55%)]"
                  )}
                  style={swatch.value ? { backgroundColor: swatch.value } : undefined}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {mineFilter && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            {t("sheets.mineOnly")}
          </label>
        )}
        <div className="ml-auto flex items-center gap-2">
          <SaveStatusIndicator status={edits.status} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={SHEET_TOOLBAR_OUTLINE}
            disabled={!edits.canUndo}
            onClick={undo}
            title={t("sheets.undoHint")}
          >
            <Undo2 className="mr-1 h-4 w-4" />
            {t("sheets.undo")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={SHEET_TOOLBAR_OUTLINE}
            disabled={!edits.canRedo}
            onClick={redo}
            title={t("sheets.redoHint")}
          >
            <Redo2 className="mr-1 h-4 w-4" />
            {t("sheets.redo")}
          </Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {t("sheets.rowCount", { shown: visibleRows.length, total: data.rows.length })}
      </div>
      <div className="min-h-0 flex-1">
        <SheetGrid
          ref={gridRef}
          columns={columns}
          rows={visibleRows}
          frozenColumns={frozenColumns}
          pendingIds={pendingIds}
          onEdit={edits.applyEdits}
          sort={sort}
          onSortChange={setSort}
          filters={filters}
          onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
          showFilters={showFilters}
          sheetKey={sheetKey}
          tabKey={tabKey}
          cellStyles={cellStyles}
        />
      </div>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sheets.historyTitle", { column: historyTitle })}</DialogTitle>
            <DialogDescription>{t("sheets.historyHint")}</DialogDescription>
          </DialogHeader>
          {historyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("sheets.historyEmpty")}</p>
          ) : (
            <ul className="max-h-[50vh] space-y-2 overflow-auto text-sm">
              {historyRows.map((row, index) => (
                <li key={`${row.at}-${index}`} className="rounded border px-2 py-1">
                  <div className="text-xs text-muted-foreground">
                    {new Date(row.at).toLocaleString("pl-PL")} · {row.by || t("sheets.someoneElse")}
                  </div>
                  <div>
                    {row.old || "—"} → {row.new || "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
