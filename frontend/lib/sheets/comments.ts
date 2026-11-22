export const MATRIX_COMMENT_COLUMN = "care.slot";

export type SheetCommentStatus = "progress" | "accepted" | "rejected";

export const SHEET_COMMENT_STATUSES: readonly {
  value: SheetCommentStatus;
  labelKey: string;
  color: string;
  text: string;
}[] = [
  {
    value: "progress",
    labelKey: "sheets.comments.status.progress",
    color: "var(--information)",
    text: "var(--information-foreground)",
  },
  { value: "accepted", labelKey: "sheets.comments.status.accepted", color: "#22c55e", text: "#0f172a" },
  { value: "rejected", labelKey: "sheets.comments.status.rejected", color: "#ef4444", text: "#ffffff" },
] as const;

export function commentStatusMeta(status: SheetCommentStatus | string) {
  return SHEET_COMMENT_STATUSES.find((s) => s.value === status) ?? SHEET_COMMENT_STATUSES[0];
}

export interface SheetCommentUser {
  id: number;
  label: string;
  username: string;
  type?: string;
  roles?: string[];
}

const STAFF_ROLE_LABELS: Record<string, string> = {
  fr: "FR",
  lg: "LG",
  tr: "TR",
  opiekun: "Opiekun",
};
const STAFF_ROLE_ORDER = ["fr", "lg", "tr", "opiekun"] as const;

export function formatStaffUserRoleLabel(user: SheetCommentUser): string {
  if (user.type === "admin") return "Admin";
  const roles = user.roles ?? [];
  const ordered = STAFF_ROLE_ORDER.filter((r) => roles.includes(r)).map((r) => STAFF_ROLE_LABELS[r]);
  if (ordered.length > 0) return ordered.join(", ");
  if (roles.length > 0) return roles.map((r) => r.toUpperCase()).join(", ");
  return "Staff";
}

export interface SheetComment {
  id: number;
  company_id: number | null;
  staff_user_id: number | null;
  column_key: string;
  sheet_key: string;
  tab_key: string;
  body: string;
  status: SheetCommentStatus;
  proposed_value: string | number | boolean | Record<string, string | number | boolean | null> | null;
  can_apply: boolean;
  /** Author, admin, or FR/LG with write access to the proposed column. */
  can_delete?: boolean;
  author: SheetCommentUser | null;
  mentions: SheetCommentUser[];
  created_at: string;
  updated_at: string;
}

export interface SheetNotificationItem {
  id: number;
  created_at: string;
  read_at: string | null;
  comment_id: number;
  body_preview: string;
  column_key: string;
  target_label: string;
  author: SheetCommentUser | null;
  url: string;
  sheet_key: string;
  tab_key: string;
  company_id: number | null;
  staff_user_id: number | null;
}

export interface SheetNotificationsResponse {
  unread_count: number;
  items: SheetNotificationItem[];
}

export type CommentTarget =
  | { kind: "company"; companyId: number; columnKey: string }
  | { kind: "staff"; staffUserId: number; columnKey: string };

export function commentCountKey(target: CommentTarget): string {
  if (target.kind === "company") {
    return `c:${target.companyId}|${target.columnKey}`;
  }
  return `u:${target.staffUserId}|${target.columnKey}`;
}

export function targetFromRow(
  row: { company_id: number; entity?: "company" | "user" | "guest" | "matrix" },
  columnKey: string
): CommentTarget {
  if (row.entity === "user" || row.entity === "guest") {
    return { kind: "staff", staffUserId: row.company_id, columnKey };
  }
  return { kind: "company", companyId: row.company_id, columnKey };
}

export function formatProposedValue(value: SheetComment["proposed_value"]): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "tak" : "nie";
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "tak" : "nie") : String(v)}`)
      .join(" · ");
  }
  return String(value);
}
