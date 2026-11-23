import { displayText } from "@/lib/sheets/format";
import type { SheetColumn, SheetRow } from "@/lib/sheets/types";

/** Approx. glyph width for text-sm tabular-ish UI. */
const CHAR_PX = 7.4;
const HEADER_CHAR_PX = 8.2;
/** Horizontal cell padding + sort/edit chrome. */
const PAD_PX = 28;
const HEADER_PAD_PX = 24;
const EDIT_DOT_PX = 12;
const INFO_ICON_PX = 16;
const SORT_ICON_PX = 14;

export const COLUMN_WIDTH_MIN = 48;
export const COLUMN_WIDTH_MAX = 640;

/** One store per sheet — shared columns keep the same width across tabs. */
export function widthsStorageKey(sheet: string) {
  return `sheets:widths:${sheet}`;
}

function legacyWidthsStorageKey(sheet: string, tab: string) {
  return `sheets:widths:${sheet}:${tab}`;
}

function parseWidthMap(raw: string | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        out[key] = Math.min(COLUMN_WIDTH_MAX, Math.max(COLUMN_WIDTH_MIN, Math.round(value)));
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function readStoredWidths(sheet: string, tab?: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const sheetLevel = parseWidthMap(window.localStorage.getItem(widthsStorageKey(sheet)));
    // One-time merge of older per-tab keys so work on "Główny" is not lost.
    if (tab) {
      const legacy = parseWidthMap(window.localStorage.getItem(legacyWidthsStorageKey(sheet, tab)));
      if (Object.keys(legacy).length > 0) {
        const merged = { ...legacy, ...sheetLevel };
        writeStoredWidths(sheet, merged);
        window.localStorage.removeItem(legacyWidthsStorageKey(sheet, tab));
        return merged;
      }
    }
    return sheetLevel;
  } catch {
    return {};
  }
}

export function writeStoredWidths(sheet: string, widths: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(widths).length === 0) {
      window.localStorage.removeItem(widthsStorageKey(sheet));
      return;
    }
    window.localStorage.setItem(widthsStorageKey(sheet), JSON.stringify(widths));
  } catch {
    /* ignore quota / private mode */
  }
}

const MIN_BY_KIND: Record<string, number> = {
  bool: 52,
  number: 56,
  time: 64,
  date: 88,
  file_link: 88,
  select: 72,
  user_select: 96,
  text: 56,
  longtext: 120,
};

const MAX_BY_KIND: Record<string, number> = {
  bool: 72,
  number: 120,
  time: 100,
  date: 110,
  file_link: 160,
  select: 200,
  user_select: 180,
  text: 280,
  longtext: 320,
};

function longestLineLen(text: string): number {
  if (!text) return 0;
  return Math.max(...text.split("\n").map((line) => line.length), 0);
}

function measureText(text: string, extra = 0): number {
  const len = longestLineLen(text);
  if (len <= 0) return 0;
  return Math.ceil(len * CHAR_PX) + PAD_PX + extra;
}

function measureHeader(col: SheetColumn): number {
  const len = longestLineLen(col.label);
  if (len <= 0) return 0;
  const chrome =
    HEADER_PAD_PX +
    SORT_ICON_PX +
    (col.editable ? EDIT_DOT_PX : 0) +
    (col.is_custom && col.help ? INFO_ICON_PX : 0);
  return Math.ceil(len * HEADER_CHAR_PX) + chrome;
}

/**
 * Fit each column to the wider of multi-line header vs cell contents.
 * Only cell contents are clamped by kind so long notes don't explode,
 * while headers always fit without truncation.
 */
export function fitColumnWidths(columns: SheetColumn[], rows: SheetRow[]): number[] {
  return columns.map((col) => {
    const min = MIN_BY_KIND[col.kind] ?? 56;
    const max = MAX_BY_KIND[col.kind] ?? 280;
    const header = measureHeader(col);

    let content = 0;
    for (const row of rows) {
      content = Math.max(content, measureText(displayText(col, row.cells[col.key])));
    }

    const boundedContent = Math.min(max, content);
    // Empty sheet: lean on header, allow backend hint as a mild floor for name-like cols.
    const emptyFloor =
      rows.length === 0 ? Math.min(max, col.width, Math.max(header, min + 24)) : 0;

    const raw = Math.max(min, header, boundedContent, emptyFloor);
    return Math.min(COLUMN_WIDTH_MAX, raw);
  });
}

/** Flat header for CSV / clipboard (newlines → space). */
export function flatColumnLabel(label: string): string {
  return label.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
}
