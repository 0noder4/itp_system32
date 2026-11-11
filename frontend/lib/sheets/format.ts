import type { SheetCellValue, SheetColumn, SheetFileValue } from "./types";

export function isFileValue(value: SheetCellValue): value is SheetFileValue {
  return typeof value === "object" && value !== null && "url" in value;
}

/** Text shown in the cell, copied to clipboard and exported to CSV. */
export function displayText(column: SheetColumn, value: SheetCellValue): string {
  if (value === null || value === undefined) return "";
  switch (column.kind) {
    case "bool":
      return value === true ? "tak" : value === false ? "" : String(value);
    case "select":
    case "user_select": {
      const option = column.options.find((o) => o.value === String(value));
      return option ? option.label : String(value);
    }
    case "file_link":
      return isFileValue(value) ? value.name : String(value);
    case "date": {
      const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value);
    }
    case "text":
    case "longtext":
    case "number":
    case "time":
      return String(value);
    default: {
      const exhaustive: never = column.kind;
      return String(exhaustive);
    }
  }
}

const TRUE_WORDS = new Set(["tak", "true", "1", "prawda", "x", "yes"]);
const FALSE_WORDS = new Set(["nie", "false", "0", "fałsz", "no", ""]);

/**
 * Best-effort conversion of typed/pasted text to the canonical cell value so the
 * optimistic display is right. The backend validates and normalizes again.
 */
export function coerceInput(column: SheetColumn, raw: string): SheetCellValue {
  const text = raw.trim();
  switch (column.kind) {
    case "bool": {
      const lower = text.toLowerCase();
      if (TRUE_WORDS.has(lower)) return true;
      if (FALSE_WORDS.has(lower)) return false;
      return text;
    }
    case "select":
    case "user_select": {
      if (text === "") return null;
      const lower = text.toLowerCase();
      const option =
        column.options.find((o) => o.value === text) ??
        column.options.find((o) => o.label.toLowerCase() === lower);
      if (!option) return text;
      return column.kind === "user_select" ? Number(option.value) : option.value;
    }
    case "number": {
      if (text === "") return null;
      const number = Number(text.replace(",", ".").replace(/\s/g, ""));
      return Number.isFinite(number) ? number : text;
    }
    case "text":
      return text === "" ? null : text.replace(/\r?\n/g, " ");
    case "longtext":
    case "date":
    case "time":
      return text === "" ? null : text;
    case "file_link":
      return text;
    default: {
      const exhaustive: never = column.kind;
      return exhaustive;
    }
  }
}

export function isEmptyValue(value: SheetCellValue): boolean {
  return value === null || value === undefined || value === "" || value === false;
}

export function sameValue(a: SheetCellValue, b: SheetCellValue): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  if (isFileValue(a) || isFileValue(b)) {
    return isFileValue(a) && isFileValue(b) && a.url === b.url;
  }
  return a === b;
}

export function isHighlighted(column: SheetColumn, value: SheetCellValue): boolean {
  switch (column.highlight) {
    case "truthy":
      return !isEmptyValue(value);
    case "positive":
      return typeof value === "number" && value > 0;
    case "over_five":
      return typeof value === "number" && value > 5;
    case "over_included":
      return (
        typeof value === "number" &&
        typeof column.highlight_above === "number" &&
        value > column.highlight_above
      );
    case null:
      return false;
    default: {
      const exhaustive: never = column.highlight;
      return exhaustive;
    }
  }
}

export function compareCells(
  column: SheetColumn,
  a: SheetCellValue,
  b: SheetCellValue
): number {
  const aEmpty = isEmptyValue(a);
  const bEmpty = isEmptyValue(b);
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return displayText(column, a).localeCompare(displayText(column, b), "pl", {
    numeric: true,
    sensitivity: "base",
  });
}

export function aggregateValues(column: SheetColumn, values: SheetCellValue[]): string {
  if (column.aggregate === "sum") {
    const sum = values.reduce<number>(
      (acc, v) => acc + (typeof v === "number" ? v : 0),
      0
    );
    return String(Math.round(sum * 100) / 100);
  }
  if (column.aggregate === "count_true") {
    return String(values.filter((v) => v === true).length);
  }
  return "";
}

/** Clipboard format compatible with Excel / Google Sheets. */
export function toTsv(matrix: string[][]): string {
  return matrix
    .map((row) =>
      row
        .map((cell) => (/[\t\n"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join("\t")
    )
    .join("\n");
}

export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/\r\n/g, "\n").replace(/\n$/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** CSV for Polish Excel: semicolon separator + BOM so diacritics open correctly. */
export function downloadCsv(filename: string, matrix: string[][]): void {
  const csv = matrix
    .map((row) =>
      row
        .map((cell) => (/[;\n"]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(";")
    )
    .join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
