"use client";

import React from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { Columns3, Filter, Paintbrush, Redo2, Search, Undo2, WrapText } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { getUserType, hasStaffRole } from "@/lib/auth";
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
import {
  MATRIX_COMMENT_COLUMN,
  type CommentTarget,
  targetFromRow,
} from "@/lib/sheets/comments";
import { applyColumnOrder } from "@/lib/sheets/columnOrder";
import { cellId, type SheetCellsResponse, type SheetCellValue, type SheetColumn, type SheetRow, type SheetTabPayload } from "@/lib/sheets/types";
import { SheetGrid, type SheetGridHandle, type SheetSort } from "./SheetGrid";
import { SheetMatrix } from "./SheetMatrix";
import { SheetToneLegend } from "./SheetToneLegend";
import { SheetExportDialog } from "./SheetExportDialog";
import { SheetSettingsDialog } from "./SheetSettingsDialog";
import { SheetPreviewBar, type PreviewFocus } from "./SheetPreviewBar";
import { SaveStatusIndicator } from "./SaveStatusIndicator";
import {
  CommentOpenButton,
  SheetCellCommentsDialog,
} from "./SheetCellComments";
import { SheetCellEditDialog } from "./SheetCellEditDialog";
import { SheetFormListDialog } from "./SheetFormListDialog";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 15000;
const wrapStorageKey = (sheet: string, tab: string) => `sheets:wrap:${sheet}:${tab}`;
const frozenStorageKey = (sheet: string, tab: string) => `sheets:frozen:${sheet}:${tab}`;

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
const hiddenSeededKey = (sheet: string, tab: string) => `sheets:hidden-seeded:${sheet}:${tab}`;
const orderStorageKey = (sheet: string, tab: string) => `sheets:order:${sheet}:${tab}`;
const orderSeededKey = (sheet: string, tab: string) => `sheets:order-seeded:${sheet}:${tab}`;

function storedBaselines(
  data: SheetTabPayload | undefined,
  companyId: number,
  column: SheetColumn,
  row: SheetRow
): Record<string, SheetCellValue> {
  const id = cellId(companyId, column.key);
  if (column.edit_parts?.length) {
    const parts = data?.part_values?.[id] ?? {};
    const out: Record<string, SheetCellValue> = {};
    for (const part of column.edit_parts) {
      const fromForm = data?.form_values?.[cellId(companyId, part.key)];
      out[part.key] = fromForm !== undefined ? fromForm : (parts[part.key] ?? null);
    }
    return out;
  }
  const fromForm = data?.form_values?.[id];
  const shown = row.cells[column.key];
  return { [column.key]: fromForm !== undefined ? fromForm : (shown ?? null) };
}

function readHidden(sheet: string, tab: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(hiddenStorageKey(sheet, tab));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function readWrap(sheet: string, tab: string): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(wrapStorageKey(sheet, tab)) === "1";
}

/** User-chosen freeze prefix, counted over all tab columns (hidden ones included). */
function readFrozen(sheet: string, tab: string): number | null {
  if (typeof window === "undefined") return null;
  const value = Number(window.localStorage.getItem(frozenStorageKey(sheet, tab)));
  return Number.isInteger(value) && value >= 1 ? value : null;
}

function hasLocalHidden(sheet: string, tab: string): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(hiddenStorageKey(sheet, tab)) != null ||
    window.localStorage.getItem(hiddenSeededKey(sheet, tab)) === "1"
  );
}

function readOrder(sheet: string, tab: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(orderStorageKey(sheet, tab));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

function hasLocalOrder(sheet: string, tab: string): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.localStorage.getItem(orderStorageKey(sheet, tab)) != null ||
    window.localStorage.getItem(orderSeededKey(sheet, tab)) === "1"
  );
}

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable);

export function SheetTabView({
  sheetKey,
  tabKey,
  tabs = [],
  mineFilter = false,
  focusCompanyId = null,
  focusUserId = null,
  focusColumnKey = null,
}: {
  sheetKey: string;
  tabKey: string;
  tabs?: { key: string; title: string }[];
  /** FR/LG looking at every company can narrow the Opiekun sheet to firms they personally handle. */
  mineFilter?: boolean;
  /** Deep-link focus from notifications / URL. */
  focusCompanyId?: number | null;
  focusUserId?: number | null;
  focusColumnKey?: string | null;
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

  const onServerValues = React.useCallback(
    (values: CellEdit[]) => {
      const at = Date.now();
      setConfirmed((prev) => {
        const next = new Map(prev);
        for (const v of values) next.set(cellId(v.companyId, v.columnKey), { value: v.value, at });
        confirmedRef.current = next;
        return next;
      });
    },
    []
  );

  const columnLabel = React.useCallback(
    (key: string) => dataRef.current?.columns.find((c) => c.key === key)?.label ?? key,
    []
  );

  const canFormEdit = getUserType() === "admin" || hasStaffRole("lg") || hasStaffRole("fr");
  const [cellBusy, setCellBusy] = React.useState(false);
  const [cellEdit, setCellEdit] = React.useState<{
    row: SheetRow;
    column: SheetColumn;
  } | null>(null);

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
  const [columnOrder, setColumnOrder] = React.useState<string[]>(() => readOrder(sheetKey, tabKey));
  const [wrapLongtext, setWrapLongtext] = React.useState(() => readWrap(sheetKey, tabKey));
  const [frozenOverride, setFrozenOverride] = React.useState<number | null>(() => readFrozen(sheetKey, tabKey));
  const [freezeEditing, setFreezeEditing] = React.useState(false);
  const [previewFocus, setPreviewFocus] = React.useState<PreviewFocus | null>(null);
  const [cellStyles, setCellStyles] = React.useState<Record<string, string>>({});
  const [fillColor, setFillColor] = React.useState("");
  const [fillBusy, setFillBusy] = React.useState(false);
  const [headerHost, setHeaderHost] = React.useState<HTMLElement | null>(null);
  const gridRef = React.useRef<SheetGridHandle>(null);
  const [commentTarget, setCommentTarget] = React.useState<CommentTarget | null>(null);
  const [commentTitle, setCommentTitle] = React.useState("");
  const [commentColumn, setCommentColumn] = React.useState<SheetColumn | null>(null);
  const [commentCurrentValue, setCommentCurrentValue] = React.useState<SheetCellValue>(null);
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const focusAppliedRef = React.useRef<string | null>(null);

  const openComments = React.useCallback((row: SheetRow, column: SheetColumn, columnOverride?: string) => {
    const columnKey = columnOverride || column.key;
    const target = targetFromRow(row, columnKey);
    const value = row.cells[columnKey];
    setCommentTarget(target);
    setCommentColumn(column);
    setCommentTitle(column.label.replace(/\n/g, " · "));
    setCommentCurrentValue(value ?? null);
    setCommentsOpen(true);
  }, []);

  const openCommentsForFocus = React.useCallback(() => {
    if (!previewFocus) return;
    openComments(previewFocus.row, previewFocus.column);
  }, [previewFocus, openComments]);

  const editKeys = React.useCallback((column: SheetColumn) => {
    if (column.edit_parts?.length) return column.edit_parts.map((part) => part.key);
    return [column.key];
  }, []);

  const restoreCommentDraft = React.useCallback(async (): Promise<"local" | "server"> => {
    if (!commentTarget || commentTarget.kind !== "company") return "local";
    const payload = dataRef.current;
    const companyId = commentTarget.companyId;
    const col =
      payload?.columns.find((c) => c.key === commentTarget.columnKey) ?? commentColumn;
    const keys = col ? editKeys(col) : [commentTarget.columnKey];
    const hasDraft =
      Boolean(payload?.drafts?.[cellId(companyId, commentTarget.columnKey)]) ||
      keys.some((key) => Boolean(payload?.drafts?.[cellId(companyId, key)]));
    if (hasDraft) {
      await apiClient.post(`${url}cells/discard/`, {
        cells: [{ company_id: companyId, column_key: commentTarget.columnKey }],
      });
      toast.success(t("sheets.comments.restoredOk"));
      await mutate();
      return "server";
    }
    const overrideCells = keys.filter((key) => payload?.form_overrides?.[cellId(companyId, key)]);
    if (overrideCells.length > 0 && canFormEdit) {
      await apiClient.post(`${url}cells/restore/`, {
        cells: overrideCells.map((key) => ({ company_id: companyId, column_key: key })),
      });
      toast.success("Przywrócono poprzednią wartość formularza.");
      await mutate();
      return "server";
    }
    return "local";
  }, [canFormEdit, commentColumn, commentTarget, editKeys, mutate, t, url]);

  const companyName = React.useCallback(
    (companyId: number) => {
      const row = dataRef.current?.rows.find((r) => r.company_id === companyId);
      const name = row?.cells["company.name"];
      return typeof name === "string" && name ? name : `Firma #${companyId}`;
    },
    []
  );

  const cellHasDraft = Boolean(
    cellEdit &&
      editKeys(cellEdit.column).some(
        (key) => data?.drafts?.[cellId(cellEdit.row.company_id, key)]
      )
  );
  const cellCanRestore = Boolean(
    cellHasDraft ||
      (cellEdit &&
        editKeys(cellEdit.column).some(
          (key) => data?.form_overrides?.[cellId(cellEdit.row.company_id, key)]
        ))
  );

  const openFormCell = React.useCallback((row: SheetRow, column: SheetColumn) => {
    setCellEdit({ row, column });
  }, []);

  const cellIsWritable = React.useCallback((column: SheetColumn) => {
    return Boolean(column.can_draft || column.can_commit || column.editable);
  }, []);

  const patchFormTarget = React.useCallback(
    async (
      targetCell: { row: SheetRow; column: SheetColumn },
      changes: { columnKey: string; value: SheetCellValue | Record<string, unknown>[] }[],
      mode: "draft" | "commit" | "edit",
      options?: { close?: boolean; successToast?: string }
    ) => {
      if (changes.length === 0) return;
      setCellBusy(true);
      try {
        const companyId = targetCell.row.company_id;
        const parentKey = targetCell.column.key;
        const shownBase = (columnKey: string): SheetCellValue | Record<string, unknown>[] | null => {
          const payload = dataRef.current;
          const parentId = cellId(companyId, parentKey);
          if (targetCell.column.list_schema && columnKey === parentKey) {
            return payload?.structured?.[parentId] ?? null;
          }
          const parts = payload?.part_values?.[parentId];
          if (parts && Object.prototype.hasOwnProperty.call(parts, columnKey)) {
            return parts[columnKey] ?? null;
          }
          const row = payload?.rows.find((item) => item.company_id === companyId) ?? targetCell.row;
          const current = row.cells[columnKey];
          return current === undefined ? null : current;
        };
        const { data: saved } = await apiClient.patch<SheetCellsResponse>(`${url}cells/`, {
          changes: changes.map((change) => ({
            company_id: companyId,
            column_key: change.columnKey,
            value: change.value,
            base: shownBase(change.columnKey),
            mode,
          })),
        });
        if (saved.conflicts?.length) {
          toast.error("Ta komórka zmieniła się w arkuszu. Odświeżono widok — sprawdź wartość i zapisz jeszcze raz.");
          await mutate();
          throw new Error("sheet-conflict");
        }
        if (options?.successToast) toast.success(options.successToast);
        if (options?.close !== false) setCellEdit(null);
        await mutate();
      } catch (error: unknown) {
        const detail =
          (error as { response?: { data?: { detail?: string; errors?: { detail?: string }[] } } })
            .response?.data?.errors?.[0]?.detail ||
          (error as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
          "Nie udało się zapisać.";
        toast.error(String(detail));
        throw error;
      } finally {
        setCellBusy(false);
      }
    },
    [mutate, url]
  );

  const patchFormCells = React.useCallback(
    async (
      changes: { columnKey: string; value: SheetCellValue | Record<string, unknown>[] }[],
      mode: "draft" | "commit" | "edit",
      options?: { close?: boolean; successToast?: string }
    ) => {
      if (!cellEdit) return;
      await patchFormTarget(cellEdit, changes, mode, options);
    },
    [cellEdit, patchFormTarget]
  );

  const draftCell = React.useCallback(
    async (changes: { columnKey: string; value: SheetCellValue | Record<string, unknown>[] }[]) => {
      await patchFormCells(changes, "draft", {
        close: false,
        successToast: "Zapisano wersję roboczą w arkuszu.",
      });
    },
    [patchFormCells]
  );

  const commitModeFor = (col: SheetColumn) =>
    col.can_draft || col.edit_parts?.length || col.list_schema ? "commit" : "edit";

  const commitCell = React.useCallback(
    async (changes: { columnKey: string; value: SheetCellValue | Record<string, unknown>[] }[]) => {
      if (!cellEdit) return;
      const mode = commitModeFor(cellEdit.column);
      await patchFormCells(changes, mode, {
        close: true,
        successToast: mode === "commit" ? "Zapisano w formularzu firmy." : "Zapisano.",
      });
    },
    [cellEdit, patchFormCells]
  );

  const restoreCell = React.useCallback(async (): Promise<"local" | "server"> => {
    if (!cellEdit) return "local";
    const companyId = cellEdit.row.company_id;
    const payload = dataRef.current;
    const keys = editKeys(cellEdit.column);
    const draftCells = keys.filter((key) => payload?.drafts?.[cellId(companyId, key)]);
    const overrideCells = keys.filter((key) => payload?.form_overrides?.[cellId(companyId, key)]);
    if (draftCells.length === 0 && overrideCells.length === 0) return "local";
    setCellBusy(true);
    try {
      if (draftCells.length > 0) {
        await apiClient.post(`${url}cells/discard/`, {
          cells: draftCells.map((key) => ({ company_id: companyId, column_key: key })),
        });
        toast.success("Usunięto wersję roboczą.");
      } else {
        await apiClient.post(`${url}cells/restore/`, {
          cells: overrideCells.map((key) => ({ company_id: companyId, column_key: key })),
        });
        toast.success("Przywrócono poprzednią wartość formularza.");
      }
      setCellEdit(null);
      await mutate();
      return "server";
    } catch (error: unknown) {
      const detail =
        (error as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
        "Nie udało się przywrócić.";
      toast.error(String(detail));
      throw error;
    } finally {
      setCellBusy(false);
    }
  }, [cellEdit, editKeys, mutate, url]);

  const uploadCellFile = React.useCallback(
    async (payload: {
      file?: File | null;
      mode: "draft" | "commit";
      path?: string;
      clear?: boolean;
    }) => {
      if (!cellEdit) return;
      setCellBusy(true);
      try {
        if (payload.clear) {
          await apiClient.post(`${url}cells/discard/`, {
            cells: [{ company_id: cellEdit.row.company_id, column_key: cellEdit.column.key }],
          });
          toast.success("Usunięto wersję roboczą.");
          await mutate();
          return;
        }
        const body = new FormData();
        body.append("company_id", String(cellEdit.row.company_id));
        body.append("column_key", cellEdit.column.key);
        body.append("mode", payload.mode);
        if (payload.file) body.append("file", payload.file);
        if (payload.path) body.append("draft_path", payload.path);
        const { data: saved } = await apiClient.post<SheetCellsResponse>(`${url}cells/file/`, body);
        const applied = saved.applied?.[0]?.value;
        const fileValue =
          applied && typeof applied === "object" && "name" in applied && "url" in applied ? applied : null;
        if (payload.mode === "draft") {
          toast.success("Zapisano wersję roboczą w arkuszu.");
          await mutate();
          return fileValue
            ? { name: String(fileValue.name), path: fileValue.path, url: String(fileValue.url) }
            : undefined;
        }
        toast.success("Zapisano plik w formularzu firmy.");
        setCellEdit(null);
        await mutate();
        return fileValue
          ? { name: String(fileValue.name), path: fileValue.path, url: String(fileValue.url) }
          : undefined;
      } catch (error: unknown) {
        const detail =
          (error as { response?: { data?: { detail?: string; errors?: { detail?: string }[] } } })
            .response?.data?.errors?.[0]?.detail ||
          (error as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
          "Nie udało się zapisać pliku.";
        toast.error(String(detail));
        throw error;
      } finally {
        setCellBusy(false);
      }
    },
    [cellEdit, mutate, url]
  );

  React.useEffect(() => {
    setHidden(readHidden(sheetKey, tabKey));
    setColumnOrder(readOrder(sheetKey, tabKey));
    setWrapLongtext(readWrap(sheetKey, tabKey));
    setFrozenOverride(readFrozen(sheetKey, tabKey));
  }, [sheetKey, tabKey]);

  React.useEffect(() => {
    if (!data || !focusColumnKey) return;
    const rowId = focusUserId ?? focusCompanyId;
    if (rowId == null) return;
    const token = `${sheetKey}:${tabKey}:${rowId}:${focusColumnKey}`;
    if (focusAppliedRef.current === token) return;
    const col = focusColumnKey === MATRIX_COMMENT_COLUMN && data.tab.view === "matrix"
      ? MATRIX_COMMENT_COLUMN
      : focusColumnKey;
    if (data.tab.view === "matrix") {
      focusAppliedRef.current = token;
      setCommentTarget({ kind: "company", companyId: rowId, columnKey: MATRIX_COMMENT_COLUMN });
      setCommentTitle(MATRIX_COMMENT_COLUMN);
      setCommentsOpen(true);
      return;
    }
    if (!gridRef.current) return;
    focusAppliedRef.current = token;
    gridRef.current.focusCell(rowId, col);
    const row = data.rows.find((r) => r.company_id === rowId);
    const column = data.columns.find((c) => c.key === col);
    if (row && column) {
      openComments(row, column, col);
    }
  }, [data, focusCompanyId, focusUserId, focusColumnKey, sheetKey, tabKey, openComments]);

  const persistOrder = React.useCallback((keys: string[]) => {
    setColumnOrder(keys);
    if (keys.length === 0) window.localStorage.removeItem(orderStorageKey(sheetKey, tabKey));
    else window.localStorage.setItem(orderStorageKey(sheetKey, tabKey), JSON.stringify(keys));
    window.localStorage.setItem(orderSeededKey(sheetKey, tabKey), "1");
  }, [sheetKey, tabKey]);

  // Seed hidden columns and column order from the sheet default when this browser has no local preference.
  React.useEffect(() => {
    const needHidden = !hasLocalHidden(sheetKey, tabKey);
    const needOrder = !hasLocalOrder(sheetKey, tabKey);
    if (!needHidden && !needOrder) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data: layout } = await apiClient.get<{
          column_widths?: Record<string, number>;
          hidden_by_tab?: Record<string, string[]>;
          column_order_by_tab?: Record<string, string[]>;
        }>(`/api/sheets/${sheetKey}/layout/`);
        if (cancelled) return;
        if (needHidden) {
          const fromDefault = layout.hidden_by_tab?.[tabKey];
          if (fromDefault && fromDefault.length > 0) {
            const next = new Set(fromDefault);
            setHidden(next);
            window.localStorage.setItem(hiddenStorageKey(sheetKey, tabKey), JSON.stringify([...next]));
          }
          window.localStorage.setItem(hiddenSeededKey(sheetKey, tabKey), "1");
        }
        if (needOrder) {
          const fromOrder = layout.column_order_by_tab?.[tabKey];
          if (fromOrder && fromOrder.length > 0) {
            setColumnOrder(fromOrder);
            window.localStorage.setItem(orderStorageKey(sheetKey, tabKey), JSON.stringify(fromOrder));
          }
          window.localStorage.setItem(orderSeededKey(sheetKey, tabKey), "1");
        }
      } catch {
        /* ignore — layout optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetKey, tabKey]);

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
      window.localStorage.setItem(hiddenSeededKey(sheetKey, tabKey), "1");
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
  const orderedAll = React.useMemo(
    () => applyColumnOrder(allColumns ?? [], columnOrder),
    [allColumns, columnOrder],
  );
  const columns = React.useMemo(
    () => orderedAll.filter((col, index) => index === 0 || !hidden.has(col.key)),
    [orderedAll, hidden]
  );
  // Freeze = visible columns that still fall inside the tab's defined frozen prefix
  // (hiding a pinned column must not pull unpinned columns into the freeze zone).
  const definedFrozen = frozenOverride ?? data?.tab.frozen_columns ?? 1;
  const frozenColumns = React.useMemo(() => {
    let n = 0;
    for (let i = 0; i < orderedAll.length && i < definedFrozen; i++) {
      if (i === 0 || !hidden.has(orderedAll[i].key)) n += 1;
    }
    return Math.min(n, columns.length);
  }, [orderedAll, definedFrozen, hidden, columns.length]);

  const changeFrozenColumns = React.useCallback(
    (visibleCount: number) => {
      const lastFrozen = columns[visibleCount - 1];
      const fullIndex = lastFrozen ? orderedAll.findIndex((col) => col.key === lastFrozen.key) : -1;
      if (fullIndex < 0) return;
      const next = fullIndex + 1;
      window.localStorage.setItem(frozenStorageKey(sheetKey, tabKey), String(next));
      setFrozenOverride(next);
    },
    [columns, orderedAll, sheetKey, tabKey]
  );

  const resetFrozenColumns = React.useCallback(() => {
    window.localStorage.removeItem(frozenStorageKey(sheetKey, tabKey));
    setFrozenOverride(null);
  }, [sheetKey, tabKey]);

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

  const isMatrix = data.tab.view === "matrix";
  const showToneLegend =
    isMatrix || data.rows.some((row) => row.tones && Object.keys(row.tones).length > 0);
  const activeCommentId =
    commentTarget?.kind === "company"
      ? cellId(commentTarget.companyId, commentTarget.columnKey)
      : null;
  const activeCommentRow = commentTarget
    ? data.rows.find((r) =>
        commentTarget.kind === "company"
          ? r.company_id === commentTarget.companyId && r.entity !== "user"
          : r.company_id === commentTarget.staffUserId && r.entity === "user"
      )
    : undefined;
  const activeCommentColumn =
    (commentTarget ? data.columns.find((c) => c.key === commentTarget.columnKey) : null) ??
    commentColumn;
  const activeCommentEditable = Boolean(activeCommentColumn?.proposable);

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
        tabKey={tabKey}
        columns={orderedAll}
        hidden={hidden}
        onToggleHidden={toggleHidden}
        onSetHidden={(keys) => {
          const next = new Set(keys);
          setHidden(next);
          window.localStorage.setItem(hiddenStorageKey(sheetKey, tabKey), JSON.stringify([...next]));
          window.localStorage.setItem(hiddenSeededKey(sheetKey, tabKey), "1");
        }}
        onReorder={persistOrder}
        getColumnOrder={() => orderedAll.slice(1).map((col) => col.key)}
        getColumnWidths={() => gridRef.current?.getColumnWidths() ?? {}}
        applyColumnWidths={(widths) => gridRef.current?.setColumnWidths(widths)}
        hiddenCount={hidden.size}
        frozenColumns={definedFrozen}
        onOpenHistory={() => void openHistory()}
        onMailDeadlinesSaved={() => void mutate()}
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
        {!isMatrix && (
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
        )}
        {!isMatrix && (
        <Button
          type="button"
          size="sm"
          variant={wrapLongtext ? "secondary" : "outline"}
          className={wrapLongtext ? undefined : SHEET_TOOLBAR_OUTLINE}
          title={t("sheets.wrapHint")}
          onClick={() => {
            setWrapLongtext((prev) => {
              const next = !prev;
              window.localStorage.setItem(wrapStorageKey(sheetKey, tabKey), next ? "1" : "0");
              return next;
            });
          }}
        >
          <WrapText className="mr-1 h-4 w-4" />
          {t("sheets.wrap")}
        </Button>
        )}
        {!isMatrix && (
        <Button
          type="button"
          size="sm"
          variant={freezeEditing ? "secondary" : "outline"}
          className={freezeEditing ? undefined : SHEET_TOOLBAR_OUTLINE}
          title={t("sheets.freezeHint")}
          aria-pressed={freezeEditing}
          onClick={() => setFreezeEditing((v) => !v)}
        >
          <Columns3 className="mr-1 h-4 w-4" />
          {t("sheets.freeze")}
        </Button>
        )}
        {!isMatrix && data.tab.row_source !== "staff" && (
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
        )}
        {mineFilter && !isMatrix && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            {t("sheets.mineOnly")}
          </label>
        )}
        {!isMatrix && (
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
        )}
      </div>
      {isMatrix ? (
        <p className="text-xs text-muted-foreground">
          Pomarańczowy slot ma więcej niż 5 firm. Nadmiar i nierozpoznany slot są w kolumnie NO.
        </p>
      ) : (
        showToneLegend && <SheetToneLegend />
      )}
      <div className="text-xs text-muted-foreground">
        {t("sheets.rowCount", { shown: visibleRows.length, total: data.rows.length })}
        {freezeEditing && !isMatrix && <span className="ml-2">· {t("sheets.freezeEditHint")}</span>}
      </div>
      {!isMatrix && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <SheetPreviewBar focus={previewFocus} />
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <CommentOpenButton
              disabled={!previewFocus}
              onClick={openCommentsForFocus}
              className={SHEET_TOOLBAR_OUTLINE}
            />
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {isMatrix ? (
          <SheetMatrix
            columns={columns}
            rows={visibleRows}
            meta={data.matrix}
            sheetKey={sheetKey}
            tabKey={tabKey}
            commentCounts={data.comment_counts ?? {}}
            onChanged={() => void mutate()}
          />
        ) : (
        <SheetGrid
          ref={gridRef}
          columns={columns}
          rows={visibleRows}
          frozenColumns={frozenColumns}
          freezeEditing={freezeEditing}
          onFrozenColumnsChange={changeFrozenColumns}
          onFrozenColumnsReset={resetFrozenColumns}
          pendingIds={pendingIds}
          onEdit={edits.applyEdits}
          draftKeys={data.drafts ?? {}}
          overrideKeys={data.form_overrides ?? {}}
          formValues={data.form_values ?? {}}
          sort={sort}
          onSortChange={setSort}
          filters={filters}
          onFilterChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
          showFilters={showFilters}
          sheetKey={sheetKey}
          tabKey={tabKey}
          cellStyles={cellStyles}
          wrapLongtext={wrapLongtext}
          commentCounts={data.comment_counts ?? {}}
          onOpenComments={openComments}
          onFocusChange={setPreviewFocus}
        />
        )}
      </div>
      <SheetCellCommentsDialog
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
        target={commentTarget}
        sheetKey={sheetKey}
        tabKey={tabKey}
        title={commentTitle}
        column={activeCommentColumn}
        columnEditable={activeCommentEditable}
        currentValue={
          activeCommentRow && commentTarget
            ? (activeCommentRow.cells[commentTarget.columnKey] ?? null)
            : commentCurrentValue
        }
        isDraft={Boolean(activeCommentId && data.drafts?.[activeCommentId])}
        storedValue={activeCommentId ? data.form_values?.[activeCommentId] : undefined}
        partValues={activeCommentId ? data.part_values?.[activeCommentId] : undefined}
        canCommit={canFormEdit}
        onCommit={
          canFormEdit &&
          activeCommentRow &&
          activeCommentColumn &&
          (activeCommentColumn.can_commit || activeCommentColumn.editable)
            ? async (changes) => {
                const mode = commitModeFor(activeCommentColumn);
                await patchFormTarget(
                  { row: activeCommentRow, column: activeCommentColumn },
                  changes,
                  mode,
                  {
                    close: false,
                    successToast: mode === "commit" ? "Zapisano w formularzu firmy." : "Zapisano.",
                  }
                );
              }
            : undefined
        }
        onOpenRichEditor={
          canFormEdit && activeCommentRow && activeCommentColumn
            ? () => openFormCell(activeCommentRow, activeCommentColumn)
            : undefined
        }
        onRestoreDraft={restoreCommentDraft}
        onChanged={() => void mutate()}
      />
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
      <SheetFormListDialog
        open={Boolean(cellEdit?.column.list_schema && cellEdit.column.can_draft)}
        onOpenChange={(open) => {
          if (!open) setCellEdit(null);
        }}
        column={cellEdit?.column.list_schema && cellEdit.column.can_draft ? cellEdit.column : null}
        companyName={cellEdit ? companyName(cellEdit.row.company_id) : ""}
        initial={
          cellEdit
            ? data.structured?.[cellId(cellEdit.row.company_id, cellEdit.column.key)]
            : undefined
        }
        canRestore={cellCanRestore}
        busy={cellBusy}
        onRestore={restoreCell}
        onDraft={
          cellEdit?.column.can_draft
            ? (rows) => draftCell([{ columnKey: cellEdit.column.key, value: rows }])
            : undefined
        }
        onSave={(rows) => void commitCell([{ columnKey: cellEdit!.column.key, value: rows }])}
        storedText={
          cellEdit
            ? displayText(
                cellEdit.column,
                storedBaselines(
                  data,
                  cellEdit.row.company_id,
                  cellEdit.column,
                  data.rows.find((row) => row.company_id === cellEdit.row.company_id) ?? cellEdit.row
                )[cellEdit.column.key] ?? null
              )
            : ""
        }
      />
      <SheetCellEditDialog
        open={Boolean(cellEdit && !(cellEdit.column.list_schema && cellEdit.column.can_draft))}
        onOpenChange={(open) => {
          if (!open) setCellEdit(null);
        }}
        column={
          cellEdit && !(cellEdit.column.list_schema && cellEdit.column.can_draft)
            ? cellEdit.column
            : null
        }
        companyName={cellEdit ? companyName(cellEdit.row.company_id) : ""}
        value={
          cellEdit
            ? (data.rows.find((row) => row.company_id === cellEdit.row.company_id) ?? cellEdit.row).cells[
                cellEdit.column.key
              ] ?? null
            : null
        }
        parts={cellEdit?.column.edit_parts}
        partValues={
          cellEdit
            ? data.part_values?.[cellId(cellEdit.row.company_id, cellEdit.column.key)]
            : undefined
        }
        stored={
          cellEdit
            ? storedBaselines(
                data,
                cellEdit.row.company_id,
                cellEdit.column,
                data.rows.find((row) => row.company_id === cellEdit.row.company_id) ?? cellEdit.row
              )
            : undefined
        }
        hasDraft={cellHasDraft}
        canRestore={cellCanRestore}
        busy={cellBusy}
        readOnly={cellEdit ? !cellIsWritable(cellEdit.column) : true}
        onRestore={restoreCell}
        onDraft={cellEdit?.column.can_draft ? draftCell : undefined}
        onUpload={
          cellEdit?.column.kind === "file_link" && cellEdit.column.can_commit
            ? uploadCellFile
            : undefined
        }
        onCommit={(changes) => void commitCell(changes)}
      />
    </div>
  );
}
