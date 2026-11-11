export type SheetColumnKind =
  | "text"
  | "longtext"
  | "number"
  | "bool"
  | "select"
  | "date"
  | "time"
  | "file_link"
  | "user_select";

export type SheetColumnSource = "system" | "computed" | "extra" | "custom";

export interface SheetOption {
  value: string;
  label: string;
}

export interface SheetColumn {
  key: string;
  label: string;
  kind: SheetColumnKind;
  source: SheetColumnSource;
  group: string;
  editable: boolean;
  options: SheetOption[];
  width: number;
  aggregate: "sum" | "count_true" | null;
  highlight: "truthy" | "positive" | "over_five" | "over_included" | null;
  /** Threshold for highlight === "over_included" (equipment free qty). */
  highlight_above: number | null;
  help: string;
}

export interface SheetFileValue {
  url: string;
  name: string;
}

export type SheetCellValue =
  | string
  | number
  | boolean
  | null
  | SheetFileValue;

export interface SheetRow {
  company_id: number;
  resigned: boolean;
  /** True when the signed-in FR is this company's FR. */
  mine?: boolean;
  cells: Record<string, SheetCellValue>;
}

export interface SheetTabPayload {
  sheet: { key: string; title: string };
  tab: { key: string; title: string; frozen_columns: number };
  columns: SheetColumn[];
  rows: SheetRow[];
  /** Fill colours keyed by `${companyId}|${columnKey}`. */
  cell_styles?: Record<string, string>;
  generated_at: string;
}

export interface SheetCatalogEntry {
  key: string;
  title: string;
  scoped: boolean;
  tabs: { key: string; title: string }[];
}

export interface SheetCellChangeRequest {
  company_id: number;
  column_key: string;
  value: SheetCellValue;
  base: SheetCellValue;
}

export interface SheetCellsResponse {
  applied: { company_id: number; column_key: string; value: SheetCellValue }[];
  conflicts: {
    company_id: number;
    column_key: string;
    current: SheetCellValue;
    updated_by: string;
    updated_at: string | null;
  }[];
  batch_id: string;
}

export const cellId = (companyId: number, columnKey: string) =>
  `${companyId}|${columnKey}`;
