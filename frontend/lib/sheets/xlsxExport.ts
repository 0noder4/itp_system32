import { displayText, isHighlighted } from "@/lib/sheets/format";
import { flatColumnLabel } from "@/lib/sheets/columnWidths";
import { sheetGroupColumnSolidBg, sheetGroupSolidBg } from "@/lib/sheets/groupColors";
import { cellStyleId } from "@/lib/sheets/cellColors";
import type { SheetColumn, SheetRow } from "@/lib/sheets/types";

const READONLY_FILL = "#E2E8F0";
const HIGHLIGHT_FILL = "#FDE68A";

export interface StyledXlsxPayload {
  rows: string[][];
  fills: (string | null)[][];
  bold: boolean[][];
  col_widths: number[];
  freeze_rows: number;
  freeze_cols: number;
}

function parseCellId(id: string): { companyId: number; columnKey: string } {
  const sep = id.indexOf("|");
  return { companyId: Number(id.slice(0, sep)), columnKey: id.slice(sep + 1) };
}

function filterScope(
  columns: SheetColumn[],
  rows: SheetRow[],
  onlyCells?: Set<string>
): { columns: SheetColumn[]; rows: SheetRow[] } {
  if (!onlyCells || onlyCells.size === 0) return { columns, rows };
  const colKeys = new Set([...onlyCells].map((id) => parseCellId(id).columnKey));
  const companyIds = new Set([...onlyCells].map((id) => parseCellId(id).companyId));
  return {
    columns: columns.filter((col) => colKeys.has(col.key)),
    rows: rows.filter((row) => companyIds.has(row.company_id)),
  };
}

/** Excel column width ≈ pixels / 7 (Calibri 11 rough). */
function excelWidth(col: SheetColumn): number {
  const px = typeof col.width === "number" ? col.width : 120;
  return Math.min(40, Math.max(8, Math.round((px / 7) * 10) / 10));
}

/**
 * Build XLSX payload with group band, header colours, cell fills, highlights, read-only tint.
 */
export function buildStyledXlsxPayload(
  columns: SheetColumn[],
  rows: SheetRow[],
  options?: {
    onlyCells?: Set<string>;
    cellStyles?: Record<string, string>;
    includeGroupRow?: boolean;
    /** Match grid freeze; clamped to exported column count. */
    freezeCols?: number;
  }
): StyledXlsxPayload {
  const scoped = filterScope(columns, rows, options?.onlyCells);
  const cols = scoped.columns;
  const dataRows = scoped.rows;
  const onlyCells = options?.onlyCells;
  const cellStyles = options?.cellStyles ?? {};
  const hasGroups = cols.some((col) => Boolean(col.group));
  const includeGroupRow = options?.includeGroupRow !== false && hasGroups;
  const freezeColsRaw = options?.freezeCols ?? 1;

  const textRows: string[][] = [];
  const fills: (string | null)[][] = [];
  const bold: boolean[][] = [];

  if (includeGroupRow) {
    textRows.push(cols.map((col) => col.group || ""));
    fills.push(cols.map((col) => sheetGroupSolidBg(col.group || "")));
    bold.push(cols.map(() => true));
  }

  textRows.push(cols.map((col) => flatColumnLabel(col.label)));
  fills.push(cols.map((col) => sheetGroupColumnSolidBg(col.group || "")));
  bold.push(cols.map(() => true));

  for (const row of dataRows) {
    const texts: string[] = [];
    const rowFills: (string | null)[] = [];
    const rowBold: boolean[] = [];
    for (const col of cols) {
      const id = `${row.company_id}|${col.key}`;
      const inScope = !onlyCells || onlyCells.has(id);
      if (!inScope) {
        texts.push("");
        rowFills.push(null);
        rowBold.push(false);
        continue;
      }
      const value = row.cells[col.key];
      texts.push(displayText(col, value));
      const manual = cellStyles[cellStyleId(row.company_id, col.key)];
      if (manual) rowFills.push(manual);
      else if (isHighlighted(col, value)) rowFills.push(HIGHLIGHT_FILL);
      else if (!col.editable) rowFills.push(READONLY_FILL);
      else rowFills.push(null);
      rowBold.push(false);
    }
    textRows.push(texts);
    fills.push(rowFills);
    bold.push(rowBold);
  }

  return {
    rows: textRows,
    fills,
    bold,
    col_widths: cols.map(excelWidth),
    freeze_rows: includeGroupRow ? 2 : 1,
    freeze_cols: cols.length === 0 ? 0 : Math.min(Math.max(0, freezeColsRaw), cols.length),
  };
}

/** Plain matrix (CSV) — header + data, no group band. */
export function buildCsvMatrix(
  columns: SheetColumn[],
  rows: SheetRow[],
  onlyCells?: Set<string>
): string[][] {
  const scoped = filterScope(columns, rows, onlyCells);
  return [
    scoped.columns.map((col) => flatColumnLabel(col.label)),
    ...scoped.rows.map((row) =>
      scoped.columns.map((col) => {
        if (onlyCells && !onlyCells.has(`${row.company_id}|${col.key}`)) return "";
        return displayText(col, row.cells[col.key]);
      })
    ),
  ];
}
