"use client";

import React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import { useTranslation } from "@/lib/i18n";
import { apiClient } from "@/lib/api";
import { getFileUrl } from "@/components/staff/StageViewer/utils";
import type { CellEdit } from "@/hooks/useSheetEdits";
import {
  aggregateValues,
  coerceInput,
  displayText,
  isFileValue,
  isHighlighted,
  parseTsv,
  toTsv,
} from "@/lib/sheets/format";
import {
  COLUMN_WIDTH_MAX,
  COLUMN_WIDTH_MIN,
  fitColumnWidths,
  flatColumnLabel,
  readStoredWidths,
  writeStoredWidths,
} from "@/lib/sheets/columnWidths";
import { sheetGroupColumnBg, sheetGroupHeaderBg } from "@/lib/sheets/groupColors";
import type { SheetCellValue, SheetColumn, SheetRow } from "@/lib/sheets/types";

export interface SheetSort {
  key: string;
  dir: "asc" | "desc";
}

interface CellPos {
  r: number;
  c: number;
}

interface Selection {
  anchor: CellPos;
  focus: CellPos;
}

interface Range {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
}

interface EditingState extends CellPos {
  initial: string;
}

const ROW_NUMBER_WIDTH = 44;
const ROW_HEIGHT = 32;
/**
 * Theme tokens are already opaque oklch — never wrap in hsl(var(--…)).
 * Solid fills keep scrolled cells from painting through sticky panes.
 */
const STICKY_READONLY_BG = "var(--muted)";
const STICKY_EDITABLE_BG = "var(--background)";
const STICKY_HEADER_BG = "var(--muted)";
const CELL_SELECTED_BG = "color-mix(in oklch, #0ea5e9 32%, var(--background))";
const CELL_HIGHLIGHT_BG = "color-mix(in oklch, #f59e0b 32%, var(--background))";
const STICKY_BODY_Z = 3;
const STICKY_HEAD_Z = 6;
const SCROLL_CELL_Z = 0;
const FREEZE_EDGE_SHADOW = "2px 0 6px -2px color-mix(in oklch, var(--foreground) 28%, transparent)";

export interface SheetGridHandle {
  /** Display-text matrix of the current selection (with headers) or null for a single cell. */
  getSelectionMatrix: () => string[][] | null;
  /** The cell that has focus, for history and similar single-cell actions. */
  getFocusCell: () => { companyId: number; columnKey: string; label: string } | null;
  getSelectedCells: () => { companyId: number; columnKey: string }[];
  getColumnWidths: () => Record<string, number>;
  setColumnWidths: (widths: Record<string, number>) => void;
}

interface SheetGridProps {
  columns: SheetColumn[];
  rows: SheetRow[];
  frozenColumns: number;
  pendingIds: ReadonlySet<string>;
  onEdit: (edits: CellEdit[]) => void;
  sort: SheetSort | null;
  onSortChange: (sort: SheetSort | null) => void;
  filters: Record<string, string>;
  onFilterChange: (key: string, value: string) => void;
  showFilters: boolean;
  /** Persist manual column widths (Excel-like resize) under this sheet/tab. */
  sheetKey: string;
  tabKey: string;
  /** Fill colours keyed by `${companyId}|${columnKey}`. */
  cellStyles?: Record<string, string>;
}

const toRange = (sel: Selection): Range => ({
  r1: Math.min(sel.anchor.r, sel.focus.r),
  r2: Math.max(sel.anchor.r, sel.focus.r),
  c1: Math.min(sel.anchor.c, sel.focus.c),
  c2: Math.max(sel.anchor.c, sel.focus.c),
});

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

const cellKey = (r: number, c: number) => `${r}:${c}`;

const parseCellKey = (key: string): CellPos => {
  const [r, c] = key.split(":").map(Number);
  return { r, c };
};

const cellsFromRange = (r: Range): Set<string> => {
  const out = new Set<string>();
  for (let ri = r.r1; ri <= r.r2; ri++) {
    for (let ci = r.c1; ci <= r.c2; ci++) out.add(cellKey(ri, ci));
  }
  return out;
};

export const SheetGrid = React.forwardRef<SheetGridHandle, SheetGridProps>(function SheetGrid(
  {
    columns,
    rows,
    frozenColumns,
    pendingIds,
    onEdit,
    sort,
    onSortChange,
    filters,
    onFilterChange,
    showFilters,
    sheetKey,
    tabKey,
    cellStyles = {},
  },
  ref
) {
  const { t } = useTranslation();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [selection, setSelection] = React.useState<Selection | null>(null);
  /** When set, selection is a sparse set of cells (Ctrl+click); otherwise rectangular `range`. */
  const [pickedCells, setPickedCells] = React.useState<Set<string> | null>(null);
  const [editing, setEditing] = React.useState<EditingState | null>(null);
  const draggingRef = React.useRef(false);
  const [widthOverrides, setWidthOverrides] = React.useState<Record<string, number>>({});
  const widthOverridesRef = React.useRef(widthOverrides);
  widthOverridesRef.current = widthOverrides;
  const resizeRef = React.useRef<{
    index: number;
    key: string;
    startX: number;
    startWidth: number;
    lastWidth: number;
  } | null>(null);

  React.useEffect(() => {
    setWidthOverrides(readStoredWidths(sheetKey, tabKey));
  }, [sheetKey, tabKey]);

  const maxRow = rows.length - 1;
  const maxCol = columns.length - 1;

  // Keep the selection inside the grid when rows/columns change (polling, filters).
  const safeSelection = React.useMemo<Selection | null>(() => {
    if (!selection || maxRow < 0 || maxCol < 0) return null;
    return {
      anchor: { r: clamp(selection.anchor.r, maxRow), c: clamp(selection.anchor.c, maxCol) },
      focus: { r: clamp(selection.focus.r, maxRow), c: clamp(selection.focus.c, maxCol) },
    };
  }, [selection, maxRow, maxCol]);
  const range = safeSelection ? toRange(safeSelection) : null;

  const selectedColsByRow = React.useMemo(() => {
    if (!pickedCells) return null;
    const map = new Map<number, Set<number>>();
    for (const key of pickedCells) {
      const { r, c } = parseCellKey(key);
      if (r < 0 || c < 0 || r > maxRow || c > maxCol) continue;
      let set = map.get(r);
      if (!set) {
        set = new Set();
        map.set(r, set);
      }
      set.add(c);
    }
    return map;
  }, [pickedCells, maxRow, maxCol]);

  const autoWidths = React.useMemo(() => fitColumnWidths(columns, rows), [columns, rows]);
  const colWidths = React.useMemo(
    () =>
      columns.map((col, index) => {
        const override = widthOverrides[col.key];
        if (typeof override === "number") {
          return Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, override));
        }
        return autoWidths[index] ?? col.width;
      }),
    [columns, autoWidths, widthOverrides]
  );

  const persistWidths = React.useCallback(
    (next: Record<string, number>) => {
      setWidthOverrides(next);
      writeStoredWidths(sheetKey, next);
    },
    [sheetKey]
  );

  const onResizeMouseDown = (event: React.MouseEvent, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const key = columns[index]?.key;
    if (!key) return;
    const startWidth = colWidths[index] ?? COLUMN_WIDTH_MIN;
    resizeRef.current = {
      index,
      key,
      startX: event.clientX,
      startWidth,
      lastWidth: startWidth,
    };
    const onMove = (ev: MouseEvent) => {
      const active = resizeRef.current;
      if (!active) return;
      const nextWidth = Math.min(
        COLUMN_WIDTH_MAX,
        Math.max(COLUMN_WIDTH_MIN, Math.round(active.startWidth + (ev.clientX - active.startX)))
      );
      active.lastWidth = nextWidth;
      setWidthOverrides((prev) => ({ ...prev, [active.key]: nextWidth }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const active = resizeRef.current;
      resizeRef.current = null;
      if (!active) return;
      const next = { ...widthOverridesRef.current, [active.key]: active.lastWidth };
      widthOverridesRef.current = next;
      persistWidths(next);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onResizeDoubleClick = (event: React.MouseEvent, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    const key = columns[index]?.key;
    if (!key) return;
    const next = { ...widthOverridesRef.current };
    delete next[key];
    persistWidths(next);
  };

  const stickyLeft = React.useMemo(() => {
    const offsets: (number | null)[] = [];
    let left = ROW_NUMBER_WIDTH;
    columns.forEach((_col, index) => {
      if (index < frozenColumns) {
        offsets.push(left);
        left += colWidths[index] ?? 0;
      } else {
        offsets.push(null);
      }
    });
    return offsets;
  }, [columns, frozenColumns, colWidths]);

  /** After frozen columns — group titles stick here while their colspan scrolls. */
  const groupLabelStickyLeft = React.useMemo(() => {
    let left = ROW_NUMBER_WIDTH;
    for (let i = 0; i < frozenColumns; i += 1) left += colWidths[i] ?? 0;
    return left;
  }, [frozenColumns, colWidths]);

  const groups = React.useMemo(() => {
    const result: { label: string; span: number; start: number }[] = [];
    columns.forEach((col, index) => {
      const last = result[result.length - 1];
      if (last && last.label === col.group) last.span += 1;
      else result.push({ label: col.group, span: 1, start: index });
    });
    return result;
  }, [columns]);

  /**
   * Split groups that cross the freeze line so a wide label like INFORMACJE BAZOWE
   * is not one sticky colspan covering the scrolling sheet.
   */
  const groupSegments = React.useMemo(() => {
    type Seg = { label: string; span: number; start: number; frozen: boolean };
    const segs: Seg[] = [];
    for (const g of groups) {
      const end = g.start + g.span;
      if (g.start < frozenColumns && end > frozenColumns) {
        segs.push({
          label: g.label,
          start: g.start,
          span: frozenColumns - g.start,
          frozen: true,
        });
        segs.push({
          label: g.label,
          start: frozenColumns,
          span: end - frozenColumns,
          frozen: false,
        });
      } else {
        segs.push({
          label: g.label,
          start: g.start,
          span: g.span,
          frozen: g.start < frozenColumns,
        });
      }
    }
    return segs;
  }, [groups, frozenColumns]);

  const hasGroups = groups.some((g) => g.label);
  const hasAggregates = columns.some((c) => c.aggregate);

  const focusGrid = () => containerRef.current?.focus({ preventScroll: true });

  const matrixFor = React.useCallback(
    (r: Range, withHeaders: boolean) => {
      const cols = columns.slice(r.c1, r.c2 + 1);
      const body = rows
        .slice(r.r1, r.r2 + 1)
        .map((row) => cols.map((col) => displayText(col, row.cells[col.key])));
      return withHeaders ? [cols.map((c) => flatColumnLabel(c.label)), ...body] : body;
    },
    [columns, rows]
  );

  React.useEffect(() => {
    const stop = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  React.useEffect(() => {
    if (!safeSelection) return;
    const { r, c } = safeSelection.focus;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [safeSelection]);

  const editableAt = (r: number, c: number) => Boolean(columns[c]?.editable && rows[r]);

  const commitEdit = (raw: string, move: "down" | "right" | "none") => {
    if (!editing) return;
    const { r, c } = editing;
    const col = columns[c];
    const row = rows[r];
    setEditing(null);
    if (col && row) {
      onEdit([{ companyId: row.company_id, columnKey: col.key, value: coerceInput(col, raw) }]);
    }
    if (move === "down" || move === "right") setPickedCells(null);
    if (move === "down") setSelection({ anchor: { r: clamp(r + 1, maxRow), c }, focus: { r: clamp(r + 1, maxRow), c } });
    if (move === "right") setSelection({ anchor: { r, c: clamp(c + 1, maxCol) }, focus: { r, c: clamp(c + 1, maxCol) } });
    focusGrid();
  };

  const cancelEdit = () => {
    setEditing(null);
    focusGrid();
  };

  const startEdit = (r: number, c: number, initial?: string) => {
    const col = columns[c];
    const row = rows[r];
    if (!col || !row) return;
    if (!col.editable) {
      toast.info(t("sheets.readOnlyCell"));
      return;
    }
    if (col.kind === "bool") {
      onEdit([{ companyId: row.company_id, columnKey: col.key, value: row.cells[col.key] !== true }]);
      return;
    }
    const current = row.cells[col.key];
    const text =
      initial ??
      (col.kind === "select" || col.kind === "user_select"
        ? current === null || current === undefined
          ? ""
          : String(current)
        : displayText(col, current));
    setEditing({ r, c, initial: text });
  };

  const clearCells = (cells: Iterable<{ r: number; c: number }>) => {
    const edits: CellEdit[] = [];
    let skipped = 0;
    for (const { r: ri, c: ci } of cells) {
      const col = columns[ci];
      if (!col || !rows[ri]) continue;
      if (!editableAt(ri, ci)) {
        skipped += 1;
        continue;
      }
      edits.push({ companyId: rows[ri].company_id, columnKey: col.key, value: col.kind === "bool" ? false : null });
    }
    if (edits.length) onEdit(edits);
    else if (skipped) toast.info(t("sheets.readOnlyCell"));
  };

  const iterSelectedCells = (): { r: number; c: number }[] => {
    if (pickedCells) {
      const out: { r: number; c: number }[] = [];
      for (const key of pickedCells) {
        const pos = parseCellKey(key);
        if (pos.r < 0 || pos.c < 0 || pos.r > maxRow || pos.c > maxCol) continue;
        out.push(pos);
      }
      return out;
    }
    if (!range) return [];
    const out: { r: number; c: number }[] = [];
    for (let ri = range.r1; ri <= range.r2; ri++) {
      for (let ci = range.c1; ci <= range.c2; ci++) out.push({ r: ri, c: ci });
    }
    return out;
  };

  React.useImperativeHandle(
    ref,
    () => ({
      getSelectionMatrix: () => {
        if (pickedCells && pickedCells.size > 1) {
          let r1 = Infinity;
          let r2 = -1;
          let c1 = Infinity;
          let c2 = -1;
          for (const key of pickedCells) {
            const { r, c } = parseCellKey(key);
            if (r < 0 || c < 0 || r > maxRow || c > maxCol) continue;
            r1 = Math.min(r1, r);
            r2 = Math.max(r2, r);
            c1 = Math.min(c1, c);
            c2 = Math.max(c2, c);
          }
          if (r2 < 0) return null;
          return matrixFor({ r1, r2, c1, c2 }, true);
        }
        if (!range || (range.r1 === range.r2 && range.c1 === range.c2)) return null;
        return matrixFor(range, true);
      },
      getFocusCell: () => {
        if (!safeSelection) return null;
        const row = rows[safeSelection.focus.r];
        const column = columns[safeSelection.focus.c];
        if (!row || !column) return null;
        return {
          companyId: row.company_id,
          columnKey: column.key,
          label: flatColumnLabel(column.label),
        };
      },
      getSelectedCells: () => {
        const cells = iterSelectedCells();
        const out: { companyId: number; columnKey: string }[] = [];
        for (const { r, c } of cells) {
          const row = rows[r];
          const col = columns[c];
          if (row && col) out.push({ companyId: row.company_id, columnKey: col.key });
        }
        return out;
      },
      getColumnWidths: () => {
        const out = { ...widthOverridesRef.current };
        columns.forEach((col, index) => {
          out[col.key] = colWidths[index] ?? col.width;
        });
        return out;
      },
      setColumnWidths: (widths: Record<string, number>) => {
        persistWidths(widths);
      },
    }),
    [range, matrixFor, safeSelection, rows, columns, pickedCells, maxRow, maxCol, colWidths, persistWidths]
  );

  const moveFocus = (dr: number, dc: number, extend: boolean) => {
    if (!safeSelection) {
      setPickedCells(null);
      setSelection({ anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } });
      return;
    }
    const focus = {
      r: clamp(safeSelection.focus.r + dr, maxRow),
      c: clamp(safeSelection.focus.c + dc, maxCol),
    };
    setPickedCells(null);
    setSelection(extend ? { anchor: safeSelection.anchor, focus } : { anchor: focus, focus });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (editing || event.target !== containerRef.current) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const keyMoves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    if (event.key in keyMoves) {
      event.preventDefault();
      const [dr, dc] = keyMoves[event.key];
      if (ctrl) moveFocus(dr * rows.length, dc * columns.length, event.shiftKey);
      else moveFocus(dr, dc, event.shiftKey);
      return;
    }
    if (!safeSelection) return;
    const { r, c } = safeSelection.focus;
    if (event.key === "Tab") {
      event.preventDefault();
      moveFocus(0, event.shiftKey ? -1 : 1, false);
    } else if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      startEdit(r, c);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      clearCells(iterSelectedCells());
    } else if (ctrl && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setPickedCells(null);
      setSelection({ anchor: { r: 0, c: 0 }, focus: { r: maxRow, c: maxCol } });
    } else if (event.key === " " && columns[c]?.kind === "bool") {
      event.preventDefault();
      startEdit(r, c);
    } else if (event.key.length === 1 && !ctrl && !event.altKey) {
      const col = columns[c];
      if (col?.editable && col.kind !== "bool") {
        event.preventDefault();
        startEdit(r, c, col.kind === "select" || col.kind === "user_select" ? undefined : event.key);
      }
    }
  };

  const onCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (editing) return;
    if (pickedCells && pickedCells.size > 0) {
      event.preventDefault();
      let r1 = Infinity;
      let r2 = -1;
      let c1 = Infinity;
      let c2 = -1;
      const keys = new Set<string>();
      for (const key of pickedCells) {
        const { r: ri, c: ci } = parseCellKey(key);
        if (ri < 0 || ci < 0 || ri > maxRow || ci > maxCol) continue;
        keys.add(key);
        r1 = Math.min(r1, ri);
        r2 = Math.max(r2, ri);
        c1 = Math.min(c1, ci);
        c2 = Math.max(c2, ci);
      }
      if (r2 < 0) return;
      const body: string[][] = [];
      for (let ri = r1; ri <= r2; ri++) {
        const line: string[] = [];
        for (let ci = c1; ci <= c2; ci++) {
          if (keys.has(cellKey(ri, ci))) {
            line.push(displayText(columns[ci], rows[ri].cells[columns[ci].key]));
          } else {
            line.push("");
          }
        }
        body.push(line);
      }
      event.clipboardData.setData("text/plain", toTsv(body));
      return;
    }
    if (!range) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", toTsv(matrixFor(range, false)));
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const matrix = parseTsv(event.clipboardData.getData("text/plain"));
    if (!matrix.length) return;
    const single = matrix.length === 1 && matrix[0].length === 1;

    // Ctrl+klik multi-select: single clipboard value fills every picked cell (like Excel).
    // Multi-cell paste uses the bounding box of the picks as the top-left origin.
    if (pickedCells && pickedCells.size > 0) {
      event.preventDefault();
      const picks: { r: number; c: number }[] = [];
      let r1 = Infinity;
      let r2 = -1;
      let c1 = Infinity;
      let c2 = -1;
      for (const key of pickedCells) {
        const pos = parseCellKey(key);
        if (pos.r < 0 || pos.c < 0 || pos.r > maxRow || pos.c > maxCol) continue;
        picks.push(pos);
        r1 = Math.min(r1, pos.r);
        r2 = Math.max(r2, pos.r);
        c1 = Math.min(c1, pos.c);
        c2 = Math.max(c2, pos.c);
      }
      if (r2 < 0) return;
      const edits: CellEdit[] = [];
      let skipped = 0;
      if (single) {
        const raw = matrix[0][0];
        for (const { r: ri, c: ci } of picks) {
          if (!editableAt(ri, ci)) {
            skipped += 1;
            continue;
          }
          edits.push({
            companyId: rows[ri].company_id,
            columnKey: columns[ci].key,
            value: coerceInput(columns[ci], raw),
          });
        }
        if (edits.length) onEdit(edits);
        if (skipped) toast.info(t("sheets.pasteSkipped", { count: skipped }));
        return;
      }
      // Sparse paste: only write into Ctrl+picked cells (holes in the bbox stay untouched).
      const pickKeys = new Set(picks.map((p) => cellKey(p.r, p.c)));
      const height = matrix.length;
      const width = Math.max(...matrix.map((m) => m.length));
      for (let dr = 0; dr < height; dr++) {
        for (let dc = 0; dc < width; dc++) {
          const ri = r1 + dr;
          const ci = c1 + dc;
          if (ri > maxRow || ci > maxCol) continue;
          if (!pickKeys.has(cellKey(ri, ci))) continue;
          const raw = matrix[dr]?.[dc];
          if (raw === undefined) continue;
          if (!editableAt(ri, ci)) {
            skipped += 1;
            continue;
          }
          edits.push({
            companyId: rows[ri].company_id,
            columnKey: columns[ci].key,
            value: coerceInput(columns[ci], raw),
          });
        }
      }
      if (edits.length) onEdit(edits);
      if (skipped) toast.info(t("sheets.pasteSkipped", { count: skipped }));
      return;
    }

    if (!range) return;
    event.preventDefault();
    const height = single ? range.r2 - range.r1 + 1 : matrix.length;
    const width = single ? range.c2 - range.c1 + 1 : Math.max(...matrix.map((m) => m.length));
    const edits: CellEdit[] = [];
    let skipped = 0;
    for (let dr = 0; dr < height; dr++) {
      for (let dc = 0; dc < width; dc++) {
        const ri = range.r1 + dr;
        const ci = range.c1 + dc;
        if (ri > maxRow || ci > maxCol) continue;
        const raw = single ? matrix[0][0] : matrix[dr]?.[dc];
        if (raw === undefined) continue;
        if (!editableAt(ri, ci)) {
          skipped += 1;
          continue;
        }
        edits.push({ companyId: rows[ri].company_id, columnKey: columns[ci].key, value: coerceInput(columns[ci], raw) });
      }
    }
    if (edits.length) onEdit(edits);
    if (skipped) toast.info(t("sheets.pasteSkipped", { count: skipped }));
    setPickedCells(null);
    setSelection({
      anchor: { r: range.r1, c: range.c1 },
      focus: { r: clamp(range.r1 + height - 1, maxRow), c: clamp(range.c1 + width - 1, maxCol) },
    });
  };

  const onCellMouseDown = (event: React.MouseEvent, r: number, c: number) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("a")) return;
    if (editing && (editing.r !== r || editing.c !== c)) setEditing(null);
    event.preventDefault();
    focusGrid();

    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && !event.shiftKey) {
      draggingRef.current = false;
      setPickedCells((prev) => {
        const base = prev ? new Set(prev) : range ? cellsFromRange(range) : new Set<string>();
        const key = cellKey(r, c);
        if (base.has(key)) {
          if (base.size > 1) base.delete(key);
        } else {
          base.add(key);
        }
        return base;
      });
      setSelection({ anchor: { r, c }, focus: { r, c } });
      return;
    }

    draggingRef.current = true;
    setPickedCells(null);
    setSelection((prev) =>
      event.shiftKey && prev ? { anchor: prev.anchor, focus: { r, c } } : { anchor: { r, c }, focus: { r, c } }
    );
  };

  const onCellMouseEnter = (r: number, c: number) => {
    if (!draggingRef.current) return;
    setSelection((prev) => (prev ? { anchor: prev.anchor, focus: { r, c } } : prev));
  };

  const onRowNumberMouseDown = (event: React.MouseEvent, r: number) => {
    event.preventDefault();
    focusGrid();
    setPickedCells(null);
    setSelection((prev) =>
      event.shiftKey && prev
        ? { anchor: { r: prev.anchor.r, c: 0 }, focus: { r, c: maxCol } }
        : { anchor: { r, c: 0 }, focus: { r, c: maxCol } }
    );
  };

  const cycleSort = (key: string) => {
    if (!sort || sort.key !== key) onSortChange({ key, dir: "asc" });
    else if (sort.dir === "asc") onSortChange({ key, dir: "desc" });
    else onSortChange(null);
  };

  // Rows are memoized; hand them stable callbacks that always call the latest handlers.
  const handlersRef = React.useRef({
    onCellMouseDown,
    onCellMouseEnter,
    startEdit,
    onRowNumberMouseDown,
    commitEdit,
    cancelEdit,
  });
  handlersRef.current = {
    onCellMouseDown,
    onCellMouseEnter,
    startEdit,
    onRowNumberMouseDown,
    commitEdit,
    cancelEdit,
  };
  const stable = React.useMemo(
    () => ({
      onCellMouseDown: (e: React.MouseEvent, r: number, c: number) => handlersRef.current.onCellMouseDown(e, r, c),
      onCellMouseEnter: (r: number, c: number) => handlersRef.current.onCellMouseEnter(r, c),
      startEdit: (r: number, c: number) => handlersRef.current.startEdit(r, c),
      onRowNumberMouseDown: (e: React.MouseEvent, r: number) => handlersRef.current.onRowNumberMouseDown(e, r),
      commitEdit: (raw: string, move: "down" | "right" | "none") => handlersRef.current.commitEdit(raw, move),
      cancelEdit: () => handlersRef.current.cancelEdit(),
    }),
    []
  );

  const pendingByRow = React.useMemo(() => {
    const byRow = new Map<number, Set<string>>();
    for (const id of pendingIds) {
      const sep = id.indexOf("|");
      const companyId = Number(id.slice(0, sep));
      const set = byRow.get(companyId) ?? new Set<string>();
      set.add(id.slice(sep + 1));
      byRow.set(companyId, set);
    }
    return byRow;
  }, [pendingIds]);

  const lastFrozenIndex = frozenColumns - 1;

  /** Scrolling cells need position+zIndex so sticky siblings can stack above them (table paint order). */
  const scrollCellStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    position: "relative",
    zIndex: SCROLL_CELL_Z,
    ...extra,
  });

  const stickyStyle = (index: number, extra?: React.CSSProperties): React.CSSProperties => {
    const left = stickyLeft[index];
    if (left === null) {
      return scrollCellStyle({ backgroundColor: STICKY_HEADER_BG, ...extra });
    }
    return {
      position: "sticky",
      left,
      zIndex: STICKY_HEAD_Z,
      backgroundColor: STICKY_HEADER_BG,
      backgroundClip: "border-box",
      ...(index === lastFrozenIndex ? { boxShadow: FREEZE_EDGE_SHADOW } : {}),
      ...extra,
    };
  };

  const totalWidth = ROW_NUMBER_WIDTH + colWidths.reduce((acc, w) => acc + w, 0);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onPaste={onPaste}
      className="relative h-full w-full overflow-auto rounded-md border bg-background text-sm outline-none select-none"
      role="grid"
      aria-rowcount={rows.length}
      aria-colcount={columns.length}
    >
      <table className="border-separate border-spacing-0" style={{ tableLayout: "fixed", width: totalWidth }}>
        <colgroup>
          <col style={{ width: ROW_NUMBER_WIDTH }} />
          {columns.map((col, index) => (
            <col key={col.key} style={{ width: colWidths[index] }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-40" style={{ backgroundColor: STICKY_HEADER_BG }}>
          {hasGroups && (
            <tr>
              <th
                className="sticky left-0 border-b border-r"
                style={{
                  zIndex: STICKY_HEAD_Z + 1,
                  left: 0,
                  backgroundColor: STICKY_HEADER_BG,
                }}
              />
              {groupSegments.map((g) => {
                const end = g.start + g.span - 1;
                const atFreezeEdge = g.frozen && end === lastFrozenIndex;
                const groupBg = sheetGroupHeaderBg(g.label);
                return (
                  <th
                    key={`${g.start}-${g.span}-${g.label}`}
                    colSpan={g.span}
                    className="border-b border-r px-2 py-1.5 text-left text-[11px] font-semibold uppercase leading-snug tracking-wide text-foreground"
                    style={
                      g.frozen
                        ? {
                            ...stickyStyle(g.start, { backgroundColor: groupBg }),
                            ...(atFreezeEdge ? { boxShadow: FREEZE_EDGE_SHADOW } : {}),
                          }
                        : scrollCellStyle({ backgroundColor: groupBg })
                    }
                    title={g.label}
                  >
                    {/* Only freeze the label text within the scrolling segment — never over frozen panes. */}
                    <span
                      className="inline-block max-w-full truncate pr-1"
                      style={
                        g.frozen
                          ? { backgroundColor: groupBg }
                          : {
                              position: "sticky",
                              left: groupLabelStickyLeft,
                              zIndex: SCROLL_CELL_Z,
                              backgroundColor: groupBg,
                            }
                      }
                    >
                      {g.label}
                    </span>
                  </th>
                );
              })}
            </tr>
          )}
          <tr>
            <th
              className="sticky left-0 border-b border-r"
              style={{
                zIndex: STICKY_HEAD_Z + 1,
                left: 0,
                backgroundColor: STICKY_HEADER_BG,
              }}
            />
            {columns.map((col, index) => (
              <th
                key={col.key}
                className={cn(
                  "border-b border-r px-1.5 py-1.5 text-left align-bottom font-medium",
                  !col.editable && "text-muted-foreground"
                )}
                style={stickyStyle(index, { backgroundColor: sheetGroupColumnBg(col.group) })}
                title={col.help || flatColumnLabel(col.label)}
              >
                <button
                  type="button"
                  className="flex w-full items-end gap-1 text-left"
                  onClick={() => cycleSort(col.key)}
                >
                  <span className="line-clamp-2 whitespace-pre-line break-words leading-tight">
                    {col.label}
                  </span>
                  {col.editable && (
                    <span
                      className="mb-0.5 ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STAFF_ACCENT_COLOR }}
                      aria-label={t("sheets.editableColumn")}
                    />
                  )}
                  {sort?.key === col.key &&
                    (sort.dir === "asc" ? (
                      <ArrowUp className="mb-0.5 h-3 w-3 shrink-0" />
                    ) : (
                      <ArrowDown className="mb-0.5 h-3 w-3 shrink-0" />
                    ))}
                </button>
                <span
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t("sheets.resizeColumn")}
                  title={t("sheets.resizeColumnHint")}
                  onMouseDown={(e) => onResizeMouseDown(e, index)}
                  onDoubleClick={(e) => onResizeDoubleClick(e, index)}
                  className="absolute top-0 right-0 z-40 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border hover:after:bg-foreground/40"
                />
              </th>
            ))}
          </tr>
          {showFilters && (
            <tr>
              <th
                className="sticky left-0 border-b border-r"
                style={{
                  zIndex: STICKY_HEAD_Z + 1,
                  left: 0,
                  backgroundColor: STICKY_HEADER_BG,
                }}
              />
              {columns.map((col, index) => (
                <th
                  key={col.key}
                  className="border-b border-r p-1"
                  style={stickyStyle(index, { backgroundColor: sheetGroupColumnBg(col.group) })}
                >
                  <input
                    value={filters[col.key] ?? ""}
                    onChange={(e) => onFilterChange(col.key, e.target.value)}
                    placeholder={t("sheets.filterPlaceholder")}
                    className="h-7 w-full rounded border bg-background px-1.5 text-xs font-normal outline-none focus:ring-1"
                  />
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const usePicked = selectedColsByRow !== null;
            const inRows = !usePicked && range && r >= range.r1 && r <= range.r2;
            return (
              <GridRow
                key={row.company_id}
                row={row}
                rowIndex={r}
                columns={columns}
                stickyLeft={stickyLeft}
                lastFrozenIndex={lastFrozenIndex}
                pendingCols={pendingByRow.get(row.company_id)}
                selC1={inRows ? range!.c1 : -1}
                selC2={inRows ? range!.c2 : -1}
                pickedCols={usePicked ? selectedColsByRow.get(r) : undefined}
                focusCol={safeSelection && safeSelection.focus.r === r ? safeSelection.focus.c : -1}
                editing={editing && editing.r === r ? editing : null}
                cellStyles={cellStyles}
                onCellMouseDown={stable.onCellMouseDown}
                onCellMouseEnter={stable.onCellMouseEnter}
                onCellDoubleClick={stable.startEdit}
                onRowNumberMouseDown={stable.onRowNumberMouseDown}
                onCommit={stable.commitEdit}
                onCancel={stable.cancelEdit}
              />
            );
          })}
        </tbody>
        {hasAggregates && (
          <tfoot className="sticky bottom-0 z-30" style={{ backgroundColor: STICKY_HEADER_BG }}>
            <tr>
              <td
                className="sticky left-0 border-r border-t px-1 text-center text-[11px] text-muted-foreground"
                style={{
                  zIndex: STICKY_HEAD_Z + 1,
                  left: 0,
                  backgroundColor: STICKY_HEADER_BG,
                }}
              >
                Σ
              </td>
              {columns.map((col, index) => (
                <td
                  key={col.key}
                  className="border-r border-t px-2 py-1 font-medium tabular-nums"
                  style={stickyStyle(index)}
                >
                  {col.aggregate ? aggregateValues(col, rows.map((row) => row.cells[col.key])) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {rows.length === 0 && (
        <div className="p-6 text-center text-muted-foreground">{t("sheets.noRows")}</div>
      )}
    </div>
  );
});

interface GridRowProps {
  row: SheetRow;
  rowIndex: number;
  columns: SheetColumn[];
  stickyLeft: (number | null)[];
  lastFrozenIndex: number;
  pendingCols: ReadonlySet<string> | undefined;
  selC1: number;
  selC2: number;
  /** Sparse multi-select columns for this row (Ctrl+click); when set, overrides selC1/selC2. */
  pickedCols: ReadonlySet<number> | undefined;
  focusCol: number;
  editing: EditingState | null;
  cellStyles: Record<string, string>;
  onCellMouseDown: (event: React.MouseEvent, r: number, c: number) => void;
  onCellMouseEnter: (r: number, c: number) => void;
  onCellDoubleClick: (r: number, c: number) => void;
  onRowNumberMouseDown: (event: React.MouseEvent, r: number) => void;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancel: () => void;
}

const GridRow = React.memo(function GridRow({
  row,
  rowIndex,
  columns,
  stickyLeft,
  lastFrozenIndex,
  pendingCols,
  selC1,
  selC2,
  pickedCols,
  focusCol,
  editing,
  cellStyles,
  onCellMouseDown,
  onCellMouseEnter,
  onCellDoubleClick,
  onRowNumberMouseDown,
  onCommit,
  onCancel,
}: GridRowProps) {
  return (
    <tr style={{ height: ROW_HEIGHT }} className={cn(row.resigned && "text-muted-foreground line-through")}>
      <td
        className="sticky left-0 cursor-pointer border-b border-r px-1 text-center text-[11px] text-muted-foreground"
        style={{
          zIndex: STICKY_BODY_Z + 1,
          left: 0,
          backgroundColor: STICKY_HEADER_BG,
        }}
        onMouseDown={(e) => onRowNumberMouseDown(e, rowIndex)}
      >
        {rowIndex + 1}
      </td>
      {columns.map((col, c) => {
        const value = row.cells[col.key];
        const left = stickyLeft[c];
        const sticky = left !== null;
        const selected = pickedCols ? pickedCols.has(c) : c >= selC1 && c <= selC2;
        const focused = c === focusCol;
        const isEditing = editing !== null && editing.c === c;
        const pending = pendingCols?.has(col.key) ?? false;
        const fill = cellStyles[`${row.company_id}|${col.key}`] || "";
        const highlighted = !fill && isHighlighted(col, value);
        const selectedPlain = selected && !fill;
        let solidBg = "";
        if (fill) solidBg = fill;
        else if (selectedPlain) solidBg = CELL_SELECTED_BG;
        else if (highlighted) solidBg = CELL_HIGHLIGHT_BG;
        else if (sticky) solidBg = col.editable ? STICKY_EDITABLE_BG : STICKY_READONLY_BG;
        else solidBg = col.editable ? STICKY_EDITABLE_BG : STICKY_READONLY_BG;
        return (
          <td
            key={col.key}
            data-cell={`${rowIndex}:${c}`}
            onMouseDown={(e) => onCellMouseDown(e, rowIndex, c)}
            onMouseEnter={() => onCellMouseEnter(rowIndex, c)}
            onDoubleClick={() => onCellDoubleClick(rowIndex, c)}
            className={cn(
              "border-b border-r px-1.5",
              col.kind === "number" && "text-right tabular-nums",
              pending && "italic"
            )}
            style={{
              backgroundColor: solidBg,
              backgroundClip: "border-box",
              ...(sticky
                ? {
                    position: "sticky",
                    left,
                    zIndex: STICKY_BODY_Z,
                    ...(c === lastFrozenIndex ? { boxShadow: FREEZE_EDGE_SHADOW } : {}),
                  }
                : {
                    position: "relative",
                    zIndex: SCROLL_CELL_Z,
                  }),
              ...(focused
                ? { outline: `2px solid ${STAFF_ACCENT_COLOR}`, outlineOffset: -2 }
                : selected && fill
                  ? { boxShadow: "inset 0 0 0 2px rgba(14, 165, 233, 0.85)" }
                  : {}),
            }}
          >
            <CellContent column={col} value={value} />
            {isEditing && editing && (
              <CellEditor column={col} initial={editing.initial} onCommit={onCommit} onCancel={onCancel} />
            )}
          </td>
        );
      })}
    </tr>
  );
});

async function downloadAuthenticated(path: string, filename: string, errorText: string) {
  try {
    const response = await apiClient.get(path, { responseType: "blob" });
    const blob = new Blob([response.data]);
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    link.click();
    URL.revokeObjectURL(href);
  } catch {
    toast.error(errorText);
  }
}

function CellContent({ column, value }: { column: SheetColumn; value: SheetCellValue }) {
  const { t } = useTranslation();
  if (column.kind === "bool") {
    return (
      <span className="flex justify-center">
        <input type="checkbox" checked={value === true} readOnly tabIndex={-1} className="pointer-events-none" />
      </span>
    );
  }
  if (column.kind === "file_link" && isFileValue(value)) {
    if (value.url.startsWith("/api/")) {
      return (
        <button
          type="button"
          className="block max-w-full truncate text-left text-sky-700 underline"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={() => downloadAuthenticated(value.url, value.name, t("sheets.pdfError"))}
        >
          {value.name}
        </button>
      );
    }
    const href = getFileUrl(value.url);
    return href ? (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="block truncate text-sky-700 underline"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {value.name}
      </a>
    ) : null;
  }
  const text = displayText(column, value);
  return (
    <div className="truncate" title={text.length > 20 ? text : undefined}>
      {text}
    </div>
  );
}

function CellEditor({
  column,
  initial,
  onCommit,
  onCancel,
}: {
  column: SheetColumn;
  initial: string;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState(initial);
  const committedRef = React.useRef(false);

  const commit = (move: "down" | "right" | "none", raw = value) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(raw, move);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      committedRef.current = true;
      onCancel();
    } else if (event.key === "Enter" && !(column.kind === "longtext" && event.shiftKey)) {
      event.preventDefault();
      commit("down");
    } else if (event.key === "Tab") {
      event.preventDefault();
      commit("right");
    }
  };

  const common = {
    autoFocus: true,
    onKeyDown,
    onBlur: () => commit("none"),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    className:
      "absolute left-0 top-0 z-40 w-full min-w-full rounded-none border-2 bg-background px-2 text-sm outline-none select-text",
    style: { borderColor: STAFF_ACCENT_COLOR },
  };

  if (column.kind === "select" || column.kind === "user_select") {
    return (
      <select
        {...common}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          commit("none", e.target.value);
        }}
        className={cn(common.className, "h-full")}
      >
        <option value="">—</option>
        {column.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (column.kind === "longtext") {
    return (
      <textarea
        {...common}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        className={cn(common.className, "min-h-32 w-[min(28rem,80vw)] py-1 shadow-lg")}
      />
    );
  }

  return (
    <input
      {...common}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={column.kind === "time" ? "GG:MM" : column.kind === "date" ? "DD.MM.RRRR" : undefined}
      inputMode={column.kind === "number" ? "decimal" : undefined}
      className={cn(common.className, "h-full")}
    />
  );
}
