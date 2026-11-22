"use client";

import React from "react";
import { ArrowDown, ArrowUp, Info, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import { useTranslation } from "@/lib/i18n";
import {
  apiClient,
  extractDownloadFilename,
  sanitizeCompanySlug,
} from "@/lib/api";
import { getFileUrl } from "@/components/staff/StageViewer/utils";
import type { CellEdit } from "@/hooks/useSheetEdits";
import {
  aggregateValues,
  coerceInput,
  displayText,
  extractFiles,
  isEmptyValue,
  isFileValue,
  isHighlighted,
  parseTsv,
  rowInDay,
  rowsExposeFairDays,
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
import {
  sheetGroupColumnBg,
  sheetGroupHeaderBg,
  sheetGroupHeaderInk,
} from "@/lib/sheets/groupColors";
import { commentCountKey, targetFromRow } from "@/lib/sheets/comments";
import { sheetPastelInk, sheetToneInk, toneBackground } from "@/lib/sheets/tones";
import type { SheetCellValue, SheetColumn, SheetFileValue, SheetRow } from "@/lib/sheets/types";
import { CommentCornerButton } from "./SheetCellComments";

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

interface FooterSpec {
  key: string;
  label: string;
  byDay: boolean;
  filter: (row: SheetRow) => boolean;
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
const CELL_SELECTED_BG =
  "light-dark(color-mix(in oklch, #0ea5e9 32%, var(--background)), color-mix(in oklch, #0ea5e9 42%, var(--background)))";
const DRAFT_CELL_BG =
  "light-dark(color-mix(in oklch, #f59e0b 34%, var(--background)), color-mix(in oklch, #f59e0b 28%, var(--background)))";
/** Always a light pastel + dark ink (never color-mix with --background — coal-brown in dark mode). */
const CELL_HIGHLIGHT_BG = "#FDE68A";
const STICKY_BODY_Z = 3;
const STICKY_HEAD_Z = 6;
const SCROLL_CELL_Z = 0;
const FREEZE_EDGE_SHADOW = "2px 0 6px -2px color-mix(in oklch, var(--foreground) 28%, transparent)";
/** Scrolling area that must stay visible right of the freeze line. */
const FREEZE_MIN_SCROLL_WIDTH = 120;
const FREEZE_AUTOSCROLL_EDGE = 40;
const FREEZE_AUTOSCROLL_STEP = 24;
/** Left border of the scroll container — the freeze handle sits outside it. */
const GRID_BORDER_WIDTH = 1;

export interface SheetGridHandle {
  /** Display-text matrix of the current selection (with headers) or null for a single cell. */
  getSelectionMatrix: () => string[][] | null;
  /** The cell that has focus, for history and similar single-cell actions. */
  getFocusCell: () => { companyId: number; columnKey: string; label: string } | null;
  getSelectedCells: () => { companyId: number; columnKey: string }[];
  getColumnWidths: () => Record<string, number>;
  setColumnWidths: (widths: Record<string, number>) => void;
  /** Open editor for the focused cell (editable columns only). */
  editFocusCell: () => void;
  /** Select and scroll to a cell by row entity id (company or staff user) + column. */
  focusCell: (companyId: number, columnKey: string) => void;
}

interface SheetGridProps {
  columns: SheetColumn[];
  rows: SheetRow[];
  frozenColumns: number;
  /** Show a draggable freeze boundary; dropping it reports the new visible frozen count. */
  freezeEditing?: boolean;
  onFrozenColumnsChange?: (count: number) => void;
  onFrozenColumnsReset?: () => void;
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
  /** Custom category colours keyed by category name. */
  customGroupColors?: Record<string, string>;
  /** Wrap text in cells (taller, expanding rows). */
  wrapLongtext?: boolean;
  /** Comment counts keyed by `c:{id}|col` / `u:{id}|col`. */
  commentCounts?: Record<string, number>;
  /** Open comments for a cell (corner click). */
  onOpenComments?: (row: SheetRow, column: SheetColumn) => void;
  /** Open multi-file attachment modal for custom file_link columns. */
  onOpenMediaCell?: (row: SheetRow, column: SheetColumn) => void;
  /** Remove a manual Beściak row without a user account. */
  onDeleteGuest?: (row: SheetRow) => void;
  /** Form-field edit mode (admin / LG / FR): can_draft columns become editable. */
  formEditMode?: boolean;
  /** Draft markers `${companyId}|${columnKey}`. */
  draftKeys?: Record<string, boolean>;
  /** Form-override markers `${companyId}|${columnKey}`. */
  overrideKeys?: Record<string, boolean>;
  /** Live form value behind a draft, keyed like `draftKeys`. */
  formValues?: Record<string, SheetCellValue>;
  /** Form-edit mode: plain click opens the cell dialog (parent decides read-only). */
  onFormCellClick?: (row: SheetRow, column: SheetColumn) => void;
  /** Active focus cell for the preview bar. */
  onFocusChange?: (focus: {
    companyId: number;
    columnKey: string;
    row: SheetRow;
    column: SheetColumn;
  } | null) => void;
}

const toRange = (sel: Selection): Range => ({
  r1: Math.min(sel.anchor.r, sel.focus.r),
  r2: Math.max(sel.anchor.r, sel.focus.r),
  c1: Math.min(sel.anchor.c, sel.focus.c),
  c2: Math.max(sel.anchor.c, sel.focus.c),
});

const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));

const isCellEditable = (row: SheetRow | undefined, col: SheetColumn | undefined): boolean =>
  Boolean(
    row &&
      col &&
      (col.editable || (row.entity === "guest" && row.can_delete && col.key === "staff.name"))
  );

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
    columns: columnsProp,
    rows,
    frozenColumns,
    freezeEditing = false,
    onFrozenColumnsChange,
    onFrozenColumnsReset,
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
    customGroupColors = {},
    wrapLongtext = false,
    commentCounts = {},
    onOpenComments,
    onOpenMediaCell,
    onDeleteGuest,
    formEditMode = false,
    draftKeys = {},
    overrideKeys = {},
    formValues = {},
    onFormCellClick,
    onFocusChange,
  },
  ref
) {
  const { t } = useTranslation();
  const columns = columnsProp;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const rowsRef = React.useRef(rows);
  const columnsRef = React.useRef(columns);
  const formClickRef = React.useRef({ formEditMode, onFormCellClick });
  const pendingClickRef = React.useRef<{
    r: number;
    c: number;
    plain: boolean;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  rowsRef.current = rows;
  columnsRef.current = columns;
  formClickRef.current = { formEditMode, onFormCellClick };
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  /** Freeze line being dragged: snapped column count + x relative to the wrapper. */
  const [freezePreview, setFreezePreview] = React.useState<{ count: number; x: number } | null>(null);
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

  const footerSpecs = React.useMemo<FooterSpec[]>(() => {
    if (!columns.some((col) => col.aggregate)) return [];
    const specs: FooterSpec[] = [
      {
        key: "sum",
        label: t("sheets.footer.sum"),
        byDay: false,
        filter: (row) => !row.resigned,
      },
    ];
    if (columns.some((col) => col.aggregate_by_day) && rowsExposeFairDays(rows)) {
      specs.push(
        {
          key: "day1",
          label: t("sheets.footer.day1"),
          byDay: true,
          filter: (row) => !row.resigned && rowInDay(row, 1),
        },
        {
          key: "day2",
          label: t("sheets.footer.day2"),
          byDay: true,
          filter: (row) => !row.resigned && rowInDay(row, 2),
        },
      );
    }
    return specs;
  }, [columns, rows, t]);

  // Data rows, then sticky sum / day rows — those are selectable so their values can be copied.
  const maxRow = rows.length + footerSpecs.length - 1;
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

  const onFreezeMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;

    let maxCount = 1;
    let left = ROW_NUMBER_WIDTH;
    for (let i = 0; i < columns.length - 1; i += 1) {
      left += colWidths[i] ?? 0;
      if (left > container.clientWidth - FREEZE_MIN_SCROLL_WIDTH) break;
      maxCount = i + 1;
    }

    let latest: number | null = null;
    const onMove = (ev: MouseEvent) => {
      const box = container.getBoundingClientRect();
      if (ev.clientX > box.right - FREEZE_AUTOSCROLL_EDGE) container.scrollLeft += FREEZE_AUTOSCROLL_STEP;
      const firstHeader = container.querySelector<HTMLElement>("th[data-col-index]");
      if (!firstHeader) return;
      const headerBox = firstHeader.getBoundingClientRect();
      const probeX = Math.min(Math.max(ev.clientX, box.left + 1), box.right - 1);
      // Topmost header under the pointer — frozen panes paint over scrolled ones.
      const hit = document
        .elementsFromPoint(probeX, headerBox.top + headerBox.height / 2)
        .find(
          (el): el is HTMLElement =>
            el instanceof HTMLElement && el.matches("th[data-col-index]") && container.contains(el)
        );
      if (!hit) return;
      const index = Number(hit.dataset.colIndex);
      const hitBox = hit.getBoundingClientRect();
      const count = Math.min(
        maxCount,
        Math.max(1, index + (probeX > hitBox.left + hitBox.width / 2 ? 1 : 0))
      );
      const edge = container.querySelector<HTMLElement>(`th[data-col-index="${count - 1}"]`);
      if (!edge) return;
      latest = count;
      setFreezePreview({
        count,
        x: edge.getBoundingClientRect().right - wrapper.getBoundingClientRect().left,
      });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setFreezePreview(null);
      if (latest !== null && latest !== frozenColumns) onFrozenColumnsChange?.(latest);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

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

  const focusGrid = () => containerRef.current?.focus({ preventScroll: true });

  const cellText = React.useCallback(
    (r: number, c: number): string => {
      const col = columns[c];
      if (!col) return "";
      if (r < rows.length) return displayText(col, rows[r]?.cells[col.key]);
      const footer = footerSpecs[r - rows.length];
      if (!footer || !col.aggregate || (footer.byDay && !col.aggregate_by_day)) return "";
      return aggregateValues(
        col,
        rows.filter(footer.filter).map((row) => row.cells[col.key]),
      );
    },
    [columns, rows, footerSpecs],
  );

  const matrixFor = React.useCallback(
    (r: Range, withHeaders: boolean) => {
      const cols = columns.slice(r.c1, r.c2 + 1);
      const body: string[][] = [];
      for (let ri = r.r1; ri <= r.r2; ri++) {
        body.push(cols.map((_col, offset) => cellText(ri, r.c1 + offset)));
      }
      return withHeaders ? [cols.map((c) => flatColumnLabel(c.label)), ...body] : body;
    },
    [columns, cellText],
  );

  const lastFormOpenRef = React.useRef(0);
  const openFormCell = React.useCallback((r: number, c: number) => {
    const { formEditMode: editingForm, onFormCellClick: open } = formClickRef.current;
    if (!editingForm || !open) return;
    const now = Date.now();
    if (now - lastFormOpenRef.current < 350) return;
    lastFormOpenRef.current = now;
    const row = rowsRef.current[r];
    const col = columnsRef.current[c];
    if (!row || !col) return;
    open(row, col);
  }, []);

  React.useEffect(() => {
    const stop = () => {
      const click = pendingClickRef.current;
      draggingRef.current = false;
      pendingClickRef.current = null;
      if (!click || !click.plain || click.moved) return;
      openFormCell(click.r, click.c);
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, [openFormCell]);

  React.useEffect(() => {
    if (!safeSelection) return;
    const { r, c } = safeSelection.focus;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [safeSelection]);

  React.useEffect(() => {
    if (!onFocusChange) return;
    if (!safeSelection) {
      onFocusChange(null);
      return;
    }
    const { r, c } = safeSelection.focus;
    const col = columns[c];
    const row = rows[r];
    if (!col || !row) {
      onFocusChange(null);
      return;
    }
    onFocusChange({ companyId: row.company_id, columnKey: col.key, row, column: col });
  }, [safeSelection, columns, rows, onFocusChange]);

  const editableAt = (r: number, c: number) => isCellEditable(rows[r], columns[c]);

  const beginCellEdit = (r: number, c: number, initial?: string) => {
    const col = columns[c];
    const row = rows[r];
    if (!col || !row) return;
    if (col.kind === "file_link") {
      if (col.is_custom) onOpenMediaCell?.(row, col);
      return;
    }
    if (col.kind === "bool") {
      onEdit([
        {
          companyId: row.company_id,
          columnKey: col.key,
          value: row.cells[col.key] !== true,
        },
      ]);
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

  const commitEdit = (raw: string, move: "down" | "right" | "none") => {
    if (!editing) return;
    const { r, c } = editing;
    const col = columns[c];
    const row = rows[r];
    setEditing(null);
    if (col && row) {
      if (row.entity === "guest" && col.key === "staff.name" && !raw.trim()) {
        toast.error(t("sheets.guests.fullNameLabel"));
      } else {
        onEdit([
          {
            companyId: row.company_id,
            columnKey: col.key,
            value: coerceInput(col, raw),
          },
        ]);
      }
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
    if (formEditMode) {
      openFormCell(r, c);
      return;
    }
    if (r >= rows.length) {
      toast.info(t("sheets.readOnlyCell"));
      return;
    }
    const col = columns[c];
    const row = rows[r];
    if (!col || !row) return;
    if (col.kind === "file_link" && col.is_custom) {
      onOpenMediaCell?.(row, col);
      return;
    }
    if (!isCellEditable(row, col)) {
      toast.info(t("sheets.readOnlyCell"));
      return;
    }
    beginCellEdit(r, c, initial);
  };

  const clearCells = (cells: Iterable<{ r: number; c: number }>) => {
    const edits: CellEdit[] = [];
    let skipped = 0;
    let skippedMedia = 0;
    for (const { r: ri, c: ci } of cells) {
      const col = columns[ci];
      if (!col || !rows[ri]) continue;
      if (col.kind === "file_link") {
        skippedMedia += 1;
        continue;
      }
      if (!editableAt(ri, ci) || col.key === "staff.name") {
        skipped += 1;
        continue;
      }
      edits.push({ companyId: rows[ri].company_id, columnKey: col.key, value: col.kind === "bool" ? false : null });
    }
    if (edits.length) onEdit(edits);
    else if (skippedMedia) toast.info(t("sheets.media.deleteViaDialogHint"));
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
      editFocusCell: () => {
        if (!safeSelection) return;
        startEdit(safeSelection.focus.r, safeSelection.focus.c);
      },
      focusCell: (companyId: number, columnKey: string) => {
        const r = rows.findIndex((row) => row.company_id === companyId);
        const c = columns.findIndex((col) => col.key === columnKey);
        if (r < 0 || c < 0) return;
        setPickedCells(null);
        setSelection({ anchor: { r, c }, focus: { r, c } });
        requestAnimationFrame(() => {
          const el = containerRef.current?.querySelector(`[data-cell="${r}:${c}"]`);
          el?.scrollIntoView({ block: "nearest", inline: "nearest" });
        });
      },
    }),
    [range, matrixFor, safeSelection, rows, columns, pickedCells, maxRow, maxCol, colWidths, persistWidths, startEdit]
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

  const selectionAsTsv = (): string | null => {
    if (pickedCells && pickedCells.size > 0) {
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
      if (r2 < 0) return null;
      const body: string[][] = [];
      for (let ri = r1; ri <= r2; ri++) {
        const line: string[] = [];
        for (let ci = c1; ci <= c2; ci++) {
          if (keys.has(cellKey(ri, ci))) {
            line.push(cellText(ri, ci));
          } else {
            line.push("");
          }
        }
        body.push(line);
      }
      return toTsv(body);
    }
    if (!range) return null;
    return toTsv(matrixFor(range, false));
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
    } else if (ctrl && event.key.toLowerCase() === "c") {
      // select-none blocks native selection, so Chrome often skips onCopy — copy explicitly.
      event.preventDefault();
      const tsv = selectionAsTsv();
      if (tsv != null) {
        void navigator.clipboard.writeText(tsv).catch(() => {
          /* clipboard may be denied; onCopy remains as fallback when available */
        });
      }
    } else if (event.key === " " && columns[c]?.kind === "bool") {
      event.preventDefault();
      startEdit(r, c);
    } else if (event.key.length === 1 && !ctrl && !event.altKey) {
      const col = columns[c];
      const row = rows[r];
      if (isCellEditable(row, col) && col!.kind !== "bool" && col!.kind !== "file_link") {
        event.preventDefault();
        startEdit(r, c, col!.kind === "select" || col!.kind === "user_select" ? undefined : event.key);
      }
    }
  };

  const onCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (editing) return;
    const tsv = selectionAsTsv();
    if (tsv == null) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", tsv);
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
          if (!editableAt(ri, ci) || columns[ci]?.kind === "file_link") {
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
          if (!editableAt(ri, ci) || columns[ci]?.kind === "file_link") {
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
        if (!editableAt(ri, ci) || columns[ci]?.kind === "file_link") {
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
    pendingClickRef.current = {
      r,
      c,
      plain: !event.shiftKey && !ctrl,
      moved: false,
      x: event.clientX,
      y: event.clientY,
    };
    setPickedCells(null);
    setSelection((prev) =>
      event.shiftKey && prev ? { anchor: prev.anchor, focus: { r, c } } : { anchor: { r, c }, focus: { r, c } }
    );
  };

  const onCellMouseEnter = (event: React.MouseEvent, r: number, c: number) => {
    if (!draggingRef.current) return;
    const click = pendingClickRef.current;
    if (click) {
      const dx = event.clientX - click.x;
      const dy = event.clientY - click.y;
      if (dx * dx + dy * dy > 64) click.moved = true;
    }
    if (click?.moved) {
      setSelection((prev) => (prev ? { anchor: prev.anchor, focus: { r, c } } : prev));
    }
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
    onOpenMediaCell,
    onDeleteGuest,
  });
  handlersRef.current = {
    onCellMouseDown,
    onCellMouseEnter,
    startEdit,
    onRowNumberMouseDown,
    commitEdit,
    cancelEdit,
    onOpenMediaCell,
    onDeleteGuest,
  };
  const stable = React.useMemo(
    () => ({
      onCellMouseDown: (e: React.MouseEvent, r: number, c: number) => handlersRef.current.onCellMouseDown(e, r, c),
      onCellMouseEnter: (e: React.MouseEvent, r: number, c: number) =>
        handlersRef.current.onCellMouseEnter(e, r, c),
      startEdit: (r: number, c: number) => handlersRef.current.startEdit(r, c),
      onRowNumberMouseDown: (e: React.MouseEvent, r: number) => handlersRef.current.onRowNumberMouseDown(e, r),
      commitEdit: (raw: string, move: "down" | "right" | "none") => handlersRef.current.commitEdit(raw, move),
      cancelEdit: () => handlersRef.current.cancelEdit(),
      onOpenMediaCell: (row: SheetRow, column: SheetColumn) => handlersRef.current.onOpenMediaCell?.(row, column),
      onDeleteGuest: (row: SheetRow) => handlersRef.current.onDeleteGuest?.(row),
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
    <div ref={wrapperRef} className="relative h-full w-full">
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onPaste={onPaste}
      className="relative h-full w-full overflow-auto rounded-md border bg-background text-sm outline-none select-none"
      role="grid"
      aria-rowcount={rows.length + footerSpecs.length}
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
                const groupBg = sheetGroupHeaderBg(g.label, customGroupColors);
                return (
                  <th
                    key={`${g.start}-${g.span}-${g.label}`}
                    colSpan={g.span}
                    className="border-b border-r px-2 py-1.5 text-left text-[11px] font-semibold uppercase leading-snug tracking-wide"
                    style={
                      g.frozen
                        ? {
                            ...stickyStyle(g.start, {
                              backgroundColor: groupBg,
                              color: sheetGroupHeaderInk(),
                            }),
                            ...(atFreezeEdge ? { boxShadow: FREEZE_EDGE_SHADOW } : {}),
                          }
                        : scrollCellStyle({
                            backgroundColor: groupBg,
                            color: sheetGroupHeaderInk(),
                          })
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
                data-col-index={index}
                className="border-b border-r px-1.5 py-1.5 text-left align-bottom font-medium"
                style={stickyStyle(index, {
                  backgroundColor: sheetGroupColumnBg(col.group, customGroupColors),
                  color: sheetGroupHeaderInk(),
                })}
                title={col.help || flatColumnLabel(col.label)}
              >
                {/* Dim only the content: opacity on a sticky th lets scrolled headers show through. */}
                <button
                  type="button"
                  className={cn("flex w-full items-end gap-1 text-left", !col.editable && "opacity-80")}
                  onClick={() => cycleSort(col.key)}
                >
                  <span className="line-clamp-2 whitespace-pre-line break-words leading-tight">
                    {col.label}
                  </span>
                  {col.is_custom && col.help && (
                    <Info className="mb-0.5 h-3 w-3 shrink-0 opacity-60" aria-hidden />
                  )}
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
                  style={stickyStyle(index, {
                    backgroundColor: sheetGroupColumnBg(col.group, customGroupColors),
                  })}
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
                wrapLongtext={wrapLongtext}
                commentCounts={commentCounts}
                draftKeys={draftKeys}
                overrideKeys={overrideKeys}
                formValues={formValues}
                onOpenComments={onOpenComments}
                onOpenMediaCell={stable.onOpenMediaCell}
                onDeleteGuest={onDeleteGuest ? stable.onDeleteGuest : undefined}
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
        {footerSpecs.length > 0 && (
          <tfoot className="sticky bottom-0 z-30" style={{ backgroundColor: STICKY_HEADER_BG }}>
            {footerSpecs.map((footerRow, footerIndex) => {
              const r = rows.length + footerIndex;
              const usePicked = selectedColsByRow !== null;
              const pickedCols = usePicked ? selectedColsByRow.get(r) : undefined;
              const focusCol = safeSelection && safeSelection.focus.r === r ? safeSelection.focus.c : -1;
              return (
                <tr key={footerRow.key}>
                  <td
                    className="sticky left-0 cursor-pointer border-r border-t px-1 text-center text-[10px] leading-tight text-muted-foreground"
                    style={{
                      zIndex: STICKY_HEAD_Z + 1,
                      left: 0,
                      backgroundColor: STICKY_HEADER_BG,
                    }}
                    onMouseDown={(event) => onRowNumberMouseDown(event, r)}
                  >
                    {footerRow.label}
                  </td>
                  {columns.map((col, index) => {
                    const selected = usePicked
                      ? Boolean(pickedCols?.has(index))
                      : Boolean(
                          range &&
                            r >= range.r1 &&
                            r <= range.r2 &&
                            index >= range.c1 &&
                            index <= range.c2,
                        );
                    const focused = focusCol === index;
                    return (
                      <td
                        key={col.key}
                        data-cell={`${r}:${index}`}
                        onMouseDown={(event) => onCellMouseDown(event, r, index)}
                        onMouseEnter={(event) => onCellMouseEnter(event, r, index)}
                        onDoubleClick={() => startEdit(r, index)}
                        className="cursor-cell border-r border-t px-2 py-1 font-medium tabular-nums"
                        style={stickyStyle(index, {
                          ...(selected ? { backgroundColor: CELL_SELECTED_BG } : {}),
                          ...(focused
                            ? { outline: `2px solid ${STAFF_ACCENT_COLOR}`, outlineOffset: -2 }
                            : {}),
                        })}
                      >
                        {cellText(r, index)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tfoot>
        )}
      </table>
      {rows.length === 0 && (
        <div className="p-6 text-center text-muted-foreground">{t("sheets.noRows")}</div>
      )}
    </div>
    {freezeEditing && frozenColumns > 0 && (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t("sheets.freezeHandle")}
        title={t("sheets.freezeHandleHint")}
        onMouseDown={onFreezeMouseDown}
        onDoubleClick={onFrozenColumnsReset}
        className="absolute inset-y-0 z-50 w-3 -translate-x-1/2 cursor-col-resize touch-none select-none"
        style={{ left: groupLabelStickyLeft + GRID_BORDER_WIDTH }}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full transition-opacity",
            freezePreview && "opacity-30"
          )}
          style={{ backgroundColor: STAFF_ACCENT_COLOR }}
        />
      </div>
    )}
    {freezePreview && (
      <div
        className="pointer-events-none absolute inset-y-0 z-50 w-1 -translate-x-1/2 rounded-full"
        style={{ left: freezePreview.x, backgroundColor: STAFF_ACCENT_COLOR }}
      >
        <span
          className="absolute left-2 top-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium text-white shadow"
          style={{ backgroundColor: STAFF_ACCENT_COLOR }}
        >
          {t("sheets.freezeCount", { count: freezePreview.count })}
        </span>
      </div>
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
  wrapLongtext: boolean;
  commentCounts: Record<string, number>;
  draftKeys: Record<string, boolean>;
  overrideKeys: Record<string, boolean>;
  formValues: Record<string, SheetCellValue>;
  onOpenComments?: (row: SheetRow, column: SheetColumn) => void;
  onOpenMediaCell?: (row: SheetRow, column: SheetColumn) => void;
  onDeleteGuest?: (row: SheetRow) => void;
  onCellMouseDown: (event: React.MouseEvent, r: number, c: number) => void;
  onCellMouseEnter: (event: React.MouseEvent, r: number, c: number) => void;
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
  wrapLongtext,
  commentCounts,
  draftKeys,
  overrideKeys,
  formValues,
  onOpenComments,
  onOpenMediaCell,
  onDeleteGuest,
  onCellMouseDown,
  onCellMouseEnter,
  onCellDoubleClick,
  onRowNumberMouseDown,
  onCommit,
  onCancel,
}: GridRowProps) {
  const { t } = useTranslation();
  const hasExpandingLongtext =
    !wrapLongtext &&
    columns.some(
      (col) => col.is_custom && col.kind === "longtext" && !isEmptyValue(row.cells[col.key])
    );
  return (
    <tr
      style={wrapLongtext || hasExpandingLongtext ? undefined : { height: ROW_HEIGHT }}
      className={cn(row.resigned && "text-muted-foreground line-through")}
    >
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
        const cellKeyId = `${row.company_id}|${col.key}`;
        const isDraft = Boolean(draftKeys[cellKeyId]);
        const isOverride = Boolean(overrideKeys[cellKeyId]);
        const fill = cellStyles[cellKeyId] || "";
        const highlighted = !fill && isHighlighted(col, value);
        const selectedPlain = selected && !fill;
        const toneBg = !fill && !selected ? toneBackground(row.tones?.[col.key]) : "";
        const hasTone = Boolean(toneBg);
        // Manual "Kolor" + auto highlight stay light pastels → dark ink.
        // Protocol tones use mid dark fills → light ink (do not force color-scheme: light).
        const hasLightPastel = Boolean(fill || (highlighted && !hasTone));
        const ink = hasTone ? sheetToneInk() : hasLightPastel ? sheetPastelInk() : undefined;
        const cellEditable = isCellEditable(row, col);
        let solidBg = "";
        if (fill) solidBg = fill;
        else if (isDraft) solidBg = DRAFT_CELL_BG;
        else if (selectedPlain) solidBg = CELL_SELECTED_BG;
        else if (toneBg) solidBg = toneBg;
        else if (highlighted) solidBg = CELL_HIGHLIGHT_BG;
        else if (sticky) solidBg = cellEditable ? STICKY_EDITABLE_BG : STICKY_READONLY_BG;
        else solidBg = cellEditable ? STICKY_EDITABLE_BG : STICKY_READONLY_BG;
        const shadows = [
          isDraft ? "inset 3px 0 0 #f59e0b" : "",
          sticky && c === lastFrozenIndex ? FREEZE_EDGE_SHADOW : "",
          !focused && selected && (fill || isDraft) ? "inset 0 0 0 2px rgba(14, 165, 233, 0.85)" : "",
        ].filter(Boolean);
        const storedText = isDraft ? displayText(col, formValues[cellKeyId] ?? null) : "";
        const commentCount = commentCounts[commentCountKey(targetFromRow(row, col.key))] ?? 0;
        const draftTitle = isDraft
          ? commentCount > 0
            ? `Wersja robocza (z komentarzem). W bazie: ${storedText || "—"}`
            : `Wersja robocza. W bazie: ${storedText || "—"}`
          : undefined;
        return (
          <td
            key={col.key}
            data-cell={`${rowIndex}:${c}`}
            data-draft={isDraft ? "1" : undefined}
            title={draftTitle}
            onMouseDown={(e) => onCellMouseDown(e, rowIndex, c)}
            onMouseEnter={(event) => onCellMouseEnter(event, rowIndex, c)}
            onDoubleClick={() => {
              if (col.kind === "file_link") {
                if (col.is_custom) {
                  onOpenMediaCell?.(row, col);
                  return;
                }
                if (isFileValue(value)) {
                  const rowCompanyName =
                    typeof row.cells["company.name"] === "string"
                      ? row.cells["company.name"]
                      : undefined;
                  openSheetFile(value, t("sheets.pdfError"), rowCompanyName);
                  return;
                }
              }
              onCellDoubleClick(rowIndex, c);
            }}
            className={cn(
              "relative border-b border-r px-1.5",
              wrapLongtext || (col.is_custom && col.kind === "longtext")
                ? "align-top py-1"
                : "align-middle",
              col.kind === "number" && "text-right tabular-nums",
              pending && "italic"
            )}
            style={{
              backgroundColor: solidBg,
              backgroundClip: "border-box",
              ...(ink
                ? {
                    color: ink,
                    // Light pastels only: keep native checkbox / light-dark on the light branch.
                    ...(hasLightPastel ? { colorScheme: "light" as const } : {}),
                  }
                : {}),
              ...(sticky
                ? {
                    position: "sticky",
                    left,
                    zIndex: isEditing ? 50 : STICKY_BODY_Z,
                  }
                : {
                    position: "relative",
                    zIndex: isEditing ? 50 : SCROLL_CELL_Z,
                  }),
              ...(focused ? { outline: `2px solid ${STAFF_ACCENT_COLOR}`, outlineOffset: -2 } : {}),
              ...(shadows.length ? { boxShadow: shadows.join(", ") } : {}),
            }}
          >
            <CellContent
              column={col}
              value={value}
              wrap={wrapLongtext}
              autoExpand={Boolean(col.is_custom && col.kind === "longtext")}
              ink={ink}
              onPastel={hasLightPastel}
              draft={isDraft}
            />
            {isOverride && !isDraft && (
              <span
                className="pointer-events-none absolute left-0.5 top-0.5 z-10 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "#22c55e" }}
                title="Nadpisane w formularzu"
              />
            )}
            {row.entity === "guest" && row.can_delete && col.key === "staff.name" && !isEditing && onDeleteGuest && (
              <button
                type="button"
                aria-label={t("sheets.guests.deleteAction")}
                title={t("sheets.guests.deleteAction")}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteGuest(row);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-65 transition hover:bg-destructive/15 hover:text-destructive hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <CommentCornerButton
              count={commentCount}
              onClick={() => onOpenComments?.(row, col)}
            />
            {isEditing && editing && (
              <CellEditor column={col} initial={editing.initial} onCommit={onCommit} onCancel={onCancel} />
            )}
          </td>
        );
      })}
    </tr>
  );
});

async function downloadAuthenticated(
  path: string,
  fallbackName: string,
  errorText: string
) {
  try {
    const response = await apiClient.get(path, { responseType: "blob" });
    const contentType =
      (response.headers["content-type"] as string | undefined) ||
      "application/pdf";
    const blob = new Blob([response.data], { type: contentType });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    const defaultName = fallbackName.endsWith(".pdf")
      ? fallbackName
      : `${fallbackName}.pdf`;
    link.download = extractDownloadFilename(
      response.headers["content-disposition"],
      defaultName
    );
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch {
    toast.error(errorText);
  }
}

function openSheetFile(
  value: SheetFileValue,
  errorText: string,
  companyName?: string
) {
  if (value.url.startsWith("/api/")) {
    let fallbackName = value.name;
    if (value.url.includes("order-summary-pdf") && companyName) {
      const slug = sanitizeCompanySlug(companyName);
      if (slug) {
        fallbackName = `podsumowanie_${slug}.pdf`;
      }
    }
    void downloadAuthenticated(value.url, fallbackName, errorText);
    return;
  }
  const href = getFileUrl(value.url);
  if (href) window.open(href, "_blank", "noopener,noreferrer");
}

function DraftBadge() {
  return (
    <span
      className="shrink-0 rounded px-1 py-px text-[9px] font-semibold uppercase leading-none tracking-wide"
      style={{ backgroundColor: "#f59e0b", color: "#1c1917" }}
    >
      R
    </span>
  );
}

function CellContent({
  column,
  value,
  wrap = false,
  autoExpand = false,
  ink,
  onPastel = false,
  draft = false,
}: {
  column: SheetColumn;
  value: SheetCellValue;
  wrap?: boolean;
  autoExpand?: boolean;
  ink?: string;
  onPastel?: boolean;
  draft?: boolean;
}) {
  const { t } = useTranslation();
  if (column.kind === "bool") {
    return (
      <span className="flex items-center justify-center gap-1">
        {draft && <DraftBadge />}
        <input
          type="checkbox"
          checked={value === true}
          readOnly
          tabIndex={-1}
          className={cn(
            "pointer-events-none h-3.5 w-3.5 rounded-sm border",
            onPastel
              ? "border-slate-700 accent-slate-900"
              : ink
                ? "border-current accent-current"
                : "border-foreground/50 accent-foreground"
          )}
        />
      </span>
    );
  }
  if (column.kind === "file_link") {
    const files = extractFiles(value);
    if (column.is_custom) {
      if (files.length === 0) {
        return column.editable ? (
          <span
            className="block truncate text-[11px] text-muted-foreground/60"
            title={t("sheets.media.cellHint")}
          >
            {t("sheets.media.emptyCellPrompt")}
          </span>
        ) : null;
      }
      const label =
        files.length === 1
          ? files[0]!.name
          : `${files.length} ${t("sheets.media.filesCountSuffix")} (${files[0]!.name})`;
      return (
        <span
          className={cn(
            "block max-w-full truncate underline",
            onPastel ? "text-sky-800" : "text-sky-700 dark:text-sky-400"
          )}
          title={files.map((f) => f.name).join("\n")}
        >
          {label}
        </span>
      );
    }
    if (isFileValue(value)) {
      return (
        <span
          className={cn(
            "block max-w-full truncate underline",
            onPastel ? "text-sky-800" : "text-sky-700 dark:text-sky-400"
          )}
          title="Dwuklik otwiera plik"
        >
          {value.name}
        </span>
      );
    }
  }
  const text = displayText(column, value);
  const body = (
    <div
      className={cn(
        "min-w-0 flex-1",
        draft && "italic",
        wrap
          ? "max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug"
          : autoExpand
            ? "line-clamp-5 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug"
            : "truncate"
      )}
      title={!draft && !wrap && text.length > 20 ? text : undefined}
    >
      {text}
    </div>
  );
  if (!draft) return body;
  return (
    <div className="flex min-w-0 items-center gap-1">
      <DraftBadge />
      {body}
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
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    if (column.kind !== "longtext") return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight + 4, 96), 340)}px`;
  }, [column.kind, value]);

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
        ref={textareaRef}
        {...common}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        className={cn(common.className, "min-h-24 w-[min(22rem,75vw)] resize-y py-1 shadow-lg")}
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
