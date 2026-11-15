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

export type SheetColumnSource = "system" | "computed" | "extra" | "custom" | "staff";

export type SheetTone = "na" | "todo" | "warn" | "ok";

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
  /**
   * SUMA is always the column total. Day footer rows only fill columns with this
   * flag, and only when the sheet rows actually say which fair day a firm attends.
   */
  aggregate_by_day: boolean;
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
  /** Automatic background. Manual cell_styles win. */
  tones?: Record<string, SheetTone>;
  /** company (default), user (obiady Beściaków), matrix (harmonogram). */
  entity?: "company" | "user" | "matrix";
}

export type MatrixCandidateReason =
  | "missing_day"
  | "other_day"
  | "missing_slot"
  | "bad_slot"
  | "overflow";

export interface MatrixPlacement {
  company_id: number;
  name: string;
  label: string;
  make: string | null;
  registration: string | null;
  /** Solid Excel-like fill for the montage block. */
  color: string;
  arrival_day: string | null;
  slot: string | null;
}

export interface MatrixCandidate extends MatrixPlacement {
  reason: MatrixCandidateReason;
}

export interface SheetMatrixMeta {
  day: string;
  editable: boolean;
  edit_tab: string;
  own_build_total: number;
  placed_count: number;
  placements: Record<string, MatrixPlacement[]>;
  candidates: MatrixCandidate[];
}

export interface SheetTabPayload {
  sheet: { key: string; title: string };
  tab: {
    key: string;
    title: string;
    frozen_columns: number;
    view?: "grid" | "matrix";
    row_source?: "company" | "staff";
  };
  columns: SheetColumn[];
  rows: SheetRow[];
  /** Fill colours keyed by `${companyId}|${columnKey}`. */
  cell_styles?: Record<string, string>;
  /** Montage schedule metadata (assign/clear via edit_tab cells). */
  matrix?: SheetMatrixMeta;
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
