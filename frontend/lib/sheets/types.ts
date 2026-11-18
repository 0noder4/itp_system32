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

export type SheetListSchema = "delegates" | "pdi" | "facilitators" | "jobs";

export interface SheetEditPart {
  key: string;
  label: string;
  kind: SheetColumnKind;
  options: SheetOption[];
}

export interface SheetColumn {
  key: string;
  label: string;
  kind: SheetColumnKind;
  source: SheetColumnSource;
  group: string;
  editable: boolean;
  /** Whether a comment on this column may propose a change (becomes a draft). */
  proposable?: boolean;
  /** Admin / LG / FR may save a draft for this form column (not for file_link). */
  can_draft?: boolean;
  /** Admin / LG / FR may commit into the company form (incl. graphics upload). */
  can_commit?: boolean;
  /** Structured list editor (people, equipment, jobs). */
  list_schema?: SheetListSchema;
  /** Separate form fields behind one displayed cell (e.g. name, surname, phone). */
  edit_parts?: SheetEditPart[];
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
  /** Storage path of a sheet draft. Absent on the live form file. */
  path?: string;
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
  /** care.slot column meta for montage comment proposals (lives on Główny). */
  comment_column?: SheetColumn;
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
  /** Draft flags: `${companyId}|${columnKey}` → true. */
  drafts?: Record<string, boolean>;
  /** Form override flags after commit: `${companyId}|${columnKey}` → true. */
  form_overrides?: Record<string, boolean>;
  /** Live form value behind a draft, keyed like `drafts`. */
  form_values?: Record<string, SheetCellValue>;
  /** Values of edit_parts, keyed by `${companyId}|${columnKey}`. */
  part_values?: Record<string, Record<string, SheetCellValue>>;
  /** Structured list payloads for list_schema columns. */
  structured?: Record<string, Record<string, unknown>[]>;
  /** Comment counts: `c:{companyId}|{col}` or `u:{userId}|{col}`. */
  comment_counts?: Record<string, number>;
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

export type SheetCellChangeMode = "edit" | "draft" | "commit";

export interface SheetCellChangeRequest {
  company_id: number;
  column_key: string;
  value: SheetCellValue | Record<string, unknown>[];
  base: SheetCellValue | Record<string, unknown>[] | null;
  mode?: SheetCellChangeMode;
}

export interface SheetCellsResponse {
  applied: {
    company_id: number;
    column_key: string;
    value: SheetCellValue;
    mode?: SheetCellChangeMode;
    draft?: boolean;
    form_override?: boolean;
  }[];
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
