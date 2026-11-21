"use client";

import React from "react";
import useSWR from "swr";
import { MessageSquare, X } from "lucide-react";
import { toast } from "sonner";
import { apiClient, fetcher } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  CommentTarget,
  SheetComment,
  SheetCommentStatus,
  SheetCommentUser,
} from "@/lib/sheets/comments";
import {
  SHEET_COMMENT_STATUSES,
  commentStatusMeta,
  formatProposedValue,
  formatStaffUserRoleLabel,
} from "@/lib/sheets/comments";
import { coerceInput, displayText, isFileValue } from "@/lib/sheets/format";
import type { SheetCellValue, SheetColumn, SheetEditPart } from "@/lib/sheets/types";
import { getUserId, getUserInfo } from "@/lib/auth";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { DialogUndoButtons, useFieldHistory } from "./SheetCellEditDialog";

function asPartColumn(part: SheetEditPart): SheetColumn {
  return {
    key: part.key,
    label: part.label,
    kind: part.kind,
    source: "system",
    group: "",
    editable: true,
    options: part.options,
    width: 0,
    aggregate: null,
    aggregate_by_day: false,
    highlight: null,
    highlight_above: null,
    help: "",
  };
}

function seedFieldValue(kind: SheetColumn["kind"] | undefined, value: SheetCellValue | undefined): string {
  if (kind === "bool") return value === true ? "true" : "false";
  if (value === null || value === undefined || isFileValue(value) || Array.isArray(value)) return "";
  return String(value);
}

function commentsUrl(target: CommentTarget): string {
  const params = new URLSearchParams({ column_key: target.columnKey });
  if (target.kind === "company") params.set("company_id", String(target.companyId));
  else params.set("staff_user_id", String(target.staffUserId));
  return `/api/sheets/comments/?${params.toString()}`;
}

function extractMentionQuery(text: string, cursor: number): { start: number; q: string } | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const q = before.slice(at + 1);
  if (/\s/.test(q)) return null;
  return { start: at, q };
}

function coerceProposedInput(raw: string): string | number | boolean | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed === "true" || trimmed === "tak") return true;
  if (trimmed === "false" || trimmed === "nie") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

export function SheetCellCommentsDialog({
  open,
  onOpenChange,
  target,
  sheetKey,
  tabKey,
  title,
  column = null,
  columnEditable = false,
  currentValue = null,
  isDraft = false,
  storedValue,
  partValues,
  canCommit = false,
  onCommit,
  onOpenRichEditor,
  onRestoreDraft,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: CommentTarget | null;
  sheetKey: string;
  tabKey: string;
  title: string;
  /** Optional column metadata for typed proposal controls and option labels. */
  column?: SheetColumn | null;
  /** Show "propose draft" controls when the column accepts proposals / edits. */
  columnEditable?: boolean;
  currentValue?: SheetCellValue;
  isDraft?: boolean;
  storedValue?: SheetCellValue;
  partValues?: Record<string, SheetCellValue>;
  /** Admin / FR / LG only: allow committing values directly into the database. */
  canCommit?: boolean;
  onCommit?: (changes: { columnKey: string; value: SheetCellValue }[]) => Promise<void> | void;
  /** For list_schema / file_link columns when opened by admin / FR / LG. */
  onOpenRichEditor?: () => void;
  onRestoreDraft?: () => Promise<"local" | "server" | void> | void;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const me = getUserInfo();
  const myId = getUserId();
  const url = target ? commentsUrl(target) : null;
  const { data, mutate, isLoading } = useSWR<SheetComment[]>(open && url ? url : null, fetcher);
  const [body, setBody] = React.useState("");
  const [mentionIds, setMentionIds] = React.useState<number[]>([]);
  const [mentionLabels, setMentionLabels] = React.useState<Record<number, string>>({});
  const [suggestQ, setSuggestQ] = React.useState<string | null>(null);
  const [suggestStart, setSuggestStart] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const { data: suggestions } = useSWR<SheetCommentUser[]>(
    open && suggestQ !== null
      ? `/api/sheets/staff-users/?q=${encodeURIComponent(suggestQ)}`
      : null,
    fetcher
  );

  const columnKey = column?.key;
  const columnKind = column?.kind;
  const editParts = column?.edit_parts;
  const hasParts = Boolean(editParts && editParts.length > 0);
  const singleFieldKey = columnKey ?? "__value__";

  const seed = React.useMemo(() => {
    if (editParts && editParts.length > 0) {
      const next: Record<string, string> = {};
      for (const part of editParts) {
        next[part.key] = seedFieldValue(part.kind, partValues?.[part.key]);
      }
      return next;
    }
    return { [singleFieldKey]: seedFieldValue(columnKind, currentValue) };
  }, [editParts, partValues, singleFieldKey, columnKind, currentValue]);

  const history = useFieldHistory(open && columnEditable, seed);
  const proposedDraft = history.drafts[singleFieldKey] ?? "";
  const proposedParts = history.drafts;

  React.useEffect(() => {
    if (!open) {
      setBody("");
      setMentionIds([]);
      setMentionLabels({});
      setSuggestQ(null);
    }
  }, [open]);

  const canSubmitProposal = hasParts
    ? editParts!.some((part) => (proposedParts[part.key] ?? "").trim() !== "")
    : proposedDraft.trim() !== "";

  const postComment = async (withProposal: boolean) => {
    if (!target || busy) return;
    if (!withProposal && !body.trim()) return;
    if (withProposal && !canSubmitProposal) {
      toast.error(t("sheets.comments.proposeEmpty"));
      return;
    }
    setBusy(true);
    try {
      let proposedValue:
        | string
        | number
        | boolean
        | Record<string, string | number | boolean | null>
        | null = null;
      if (withProposal) {
        if (hasParts && editParts) {
          const mapped: Record<string, string | number | boolean | null> = {};
          for (const part of editParts) {
            const coerced = coerceInput(asPartColumn(part), proposedParts[part.key] ?? "");
            mapped[part.key] = isFileValue(coerced) || Array.isArray(coerced) ? null : coerced;
          }
          proposedValue = mapped;
        } else {
          const coerced = column
            ? coerceInput(column, proposedDraft)
            : coerceProposedInput(proposedDraft);
          proposedValue = isFileValue(coerced) || Array.isArray(coerced) ? null : coerced;
        }
      }
      await apiClient.post("/api/sheets/comments/", {
        ...(target.kind === "company"
          ? { company_id: target.companyId }
          : { staff_user_id: target.staffUserId }),
        column_key: target.columnKey,
        sheet_key: sheetKey,
        tab_key: tabKey,
        body: body.trim(),
        mentions: mentionIds,
        ...(withProposal ? { proposed_value: proposedValue } : {}),
      });
      if (withProposal) {
        history.markDraftSaved({ ...history.drafts });
      }
      setBody("");
      setMentionIds([]);
      setMentionLabels({});
      setSuggestQ(null);
      await mutate();
      onChanged?.();
      toast.success(withProposal ? t("sheets.comments.draftPosted") : t("sheets.comments.posted"));
    } catch (error: unknown) {
      const dataErr = (error as { response?: { data?: { detail?: string; errors?: { detail?: string }[] } } })
        ?.response?.data;
      const detail = dataErr?.errors?.[0]?.detail || dataErr?.detail;
      toast.error(detail ? String(detail) : t("sheets.comments.postError"));
    } finally {
      setBusy(false);
    }
  };

  const commitDraftToDb = async () => {
    if (!onCommit || !column || !canCommit || busy) return;
    const changes: { columnKey: string; value: SheetCellValue }[] =
      hasParts && editParts
        ? editParts.map((part) => ({
            columnKey: part.key,
            value: coerceInput(asPartColumn(part), proposedParts[part.key] ?? ""),
          }))
        : [
            {
              columnKey: column.key,
              value: coerceInput(column, proposedDraft),
            },
          ];
    setBusy(true);
    try {
      await onCommit(changes);
      await mutate();
      onChanged?.();
      onOpenChange(false);
    } catch {
      // Parent handler already shows error toast.
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (
    comment: SheetComment,
    status: SheetCommentStatus,
    successToast?: string
  ) => {
    if (comment.status === status || busy) return;
    setBusy(true);
    try {
      await apiClient.patch(`/api/sheets/comments/${comment.id}/`, { status });
      await mutate();
      onChanged?.();
      if (successToast) toast.success(successToast);
    } catch {
      toast.error(t("sheets.comments.statusError"));
    } finally {
      setBusy(false);
    }
  };

  const resetLocalProposal = () => {
    if (editParts && editParts.length > 0) {
      const next: Record<string, string> = {};
      for (const part of editParts) {
        next[part.key] = seedFieldValue(part.kind, partValues?.[part.key]);
      }
      history.reset(next);
    } else {
      history.reset({
        [singleFieldKey]: seedFieldValue(
          columnKind,
          isDraft && storedValue !== undefined ? storedValue : currentValue
        ),
      });
    }
  };

  const restoreDraft = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      if (onRestoreDraft) {
        const result = await onRestoreDraft();
        if (result === "local") {
          resetLocalProposal();
          return;
        }
      } else {
        const openProposals = (data ?? []).filter(
          (c) => c.proposed_value !== null && c.status === "progress"
        );
        if (openProposals.length === 0) {
          resetLocalProposal();
          return;
        }
        await Promise.all(
          openProposals.map((c) =>
            apiClient.patch(`/api/sheets/comments/${c.id}/`, { status: "rejected" })
          )
        );
        toast.success(t("sheets.comments.restoredOk"));
      }
      await mutate();
      onChanged?.();
    } catch {
      toast.error(t("sheets.comments.restoreError"));
    } finally {
      setBusy(false);
    }
  };

  const removeComment = async (comment: SheetComment) => {
    if (busy) return;
    setBusy(true);
    try {
      await apiClient.delete(`/api/sheets/comments/${comment.id}/`);
      await mutate();
      onChanged?.();
      toast.success(t("sheets.comments.deleted"));
    } catch {
      toast.error(t("sheets.comments.deleteError"));
    } finally {
      setBusy(false);
    }
  };

  const applyComment = async (comment: SheetComment) => {
    if (busy) return;
    setBusy(true);
    try {
      // apply/ sets status=accepted on success — do not PATCH first (avoids accepted-without-write).
      await apiClient.post(`/api/sheets/comments/${comment.id}/apply/`);
      await mutate();
      onChanged?.();
      toast.success(t("sheets.comments.applyOk"));
    } catch {
      toast.error(t("sheets.comments.applyError"));
    } finally {
      setBusy(false);
    }
  };

  const onBodyChange = (value: string) => {
    setBody(value);
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const hit = extractMentionQuery(value, cursor);
    if (hit) {
      setSuggestStart(hit.start);
      setSuggestQ(hit.q);
    } else {
      setSuggestQ(null);
    }
  };

  const pickSuggestion = (user: SheetCommentUser) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? body.length;
    const before = body.slice(0, suggestStart);
    const after = body.slice(cursor);
    const insert = `@${user.label} `;
    setBody(`${before}${insert}${after}`);
    setMentionIds((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]));
    setMentionLabels((prev) => ({ ...prev, [user.id]: user.label }));
    setSuggestQ(null);
    requestAnimationFrame(() => {
      const next = before.length + insert.length;
      el?.focus();
      el?.setSelectionRange(next, next);
    });
  };

  const removeMentionChip = (id: number) => {
    setMentionIds((prev) => prev.filter((x) => x !== id));
  };

  const formatCellValue = (val: SheetCellValue | undefined): string => {
    if (val === null || val === undefined || val === "") return "—";
    if (column) return displayText(column, val) || "—";
    if (typeof val === "boolean") return val ? "tak" : "nie";
    if (Array.isArray(val)) return val.map((f) => f.name).filter(Boolean).join(", ") || "—";
    if (typeof val === "object") return val.name || "—";
    return String(val);
  };

  const shortPartLabel = (label: string): string => {
    const prefix = `${title} — `;
    if (label.startsWith(prefix)) return label.slice(prefix.length);
    return label;
  };

  const formatCommentProposal = (val: SheetComment["proposed_value"]): string => {
    if (val === null || val === undefined) return "—";
    if (typeof val === "object") {
      if (editParts && editParts.length > 0) {
        const items = editParts
          .filter((part) => Object.prototype.hasOwnProperty.call(val, part.key))
          .map((part) => {
            const raw = val[part.key];
            const formatted =
              raw === null || raw === undefined || raw === ""
                ? "—"
                : displayText(asPartColumn(part), raw) || formatProposedValue(raw);
            return `${shortPartLabel(part.label)}: ${formatted}`;
          });
        if (items.length > 0) return items.join(" · ");
      }
      return formatProposedValue(val);
    }
    if (
      column &&
      (column.kind === "select" || column.kind === "user_select" || column.kind === "bool")
    ) {
      return displayText(column, val) || formatProposedValue(val);
    }
    return formatProposedValue(val);
  };

  const renderControl = (
    ctrlCol: Pick<SheetColumn, "kind" | "options"> | null,
    ctrlVal: string,
    onCtrlChange: (next: string) => void,
    placeholder?: string
  ) => {
    if (ctrlCol?.kind === "select" || ctrlCol?.kind === "user_select") {
      return (
        <select
          value={ctrlVal}
          onChange={(e) => onCtrlChange(e.target.value)}
          className="h-8 w-full rounded border bg-background px-2 text-sm"
        >
          <option value="">—</option>
          {ctrlCol.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
    if (ctrlCol?.kind === "bool") {
      return (
        <select
          value={ctrlVal}
          onChange={(e) => onCtrlChange(e.target.value)}
          className="h-8 w-full rounded border bg-background px-2 text-sm"
        >
          <option value="true">tak</option>
          <option value="false">nie</option>
        </select>
      );
    }
    if (ctrlCol?.kind === "longtext") {
      return (
        <textarea
          rows={2}
          value={ctrlVal}
          onChange={(e) => onCtrlChange(e.target.value)}
          placeholder={placeholder}
          className="max-h-32 min-h-[3.25rem] w-full rounded border bg-background px-2 py-1.5 text-sm"
        />
      );
    }
    return (
      <input
        type={
          ctrlCol?.kind === "number"
            ? "number"
            : ctrlCol?.kind === "date"
              ? "date"
              : ctrlCol?.kind === "time"
                ? "time"
                : "text"
        }
        value={ctrlVal}
        onChange={(e) => onCtrlChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded border bg-background px-2 text-sm"
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-2.5 sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            {t("sheets.comments.title")}
          </DialogTitle>
          <DialogDescription className="truncate">{title}</DialogDescription>
        </DialogHeader>

        {/* 1. Podgląd tego co w bazie i możliwość edycji wersji roboczej */}
        <div className="shrink-0">
          {!columnEditable ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                {isDraft ? (
                  <p className="text-amber-800 dark:text-amber-300">
                    {t("sheets.comments.draftActive", {
                      draft: formatCellValue(currentValue),
                      stored: formatCellValue(storedValue),
                    })}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    {t("sheets.comments.currentInDb")}{" "}
                    <span className="font-medium text-foreground">
                      {formatCellValue(currentValue)}
                    </span>
                  </p>
                )}
              </div>
              {canCommit &&
                onOpenRichEditor &&
                ((column?.list_schema && column.can_draft) ||
                  (column?.kind === "file_link" && column.can_commit)) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenRichEditor();
                    }}
                  >
                    {column?.list_schema ? "Edytuj listę" : "Wgraj / edytuj plik"}
                  </Button>
                )}
            </div>
          ) : (
            <div className="space-y-1.5 rounded border border-dashed px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  {t("sheets.comments.proposeSectionTitle")}
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <DialogUndoButtons
                    canUndo={history.canUndo}
                    canRedo={history.canRedo}
                    onUndo={() => history.undo()}
                    onRedo={() => history.redo()}
                  />
                  {isDraft && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => void restoreDraft()}
                    >
                      {t("sheets.comments.restoreFromDb")}
                    </Button>
                  )}
                </div>
              </div>
              {isDraft ? (
                <p className="text-xs text-muted-foreground">
                  {t("sheets.comments.draftInSheet")}{" "}
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {formatCellValue(currentValue)}
                  </span>
                  {" · "}
                  {t("sheets.comments.inDb")}{" "}
                  <span className="font-medium text-foreground">
                    {formatCellValue(storedValue)}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("sheets.comments.currentInDb")}{" "}
                  <span className="font-medium text-foreground">
                    {formatCellValue(currentValue)}
                  </span>
                </p>
              )}
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {hasParts && editParts ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {editParts.map((part) => (
                        <div
                          key={part.key}
                          className={part.kind === "longtext" ? "space-y-0.5 sm:col-span-2" : "space-y-0.5"}
                        >
                          <label className="block text-[11px] text-muted-foreground">
                            {shortPartLabel(part.label)}
                          </label>
                          {renderControl(
                            part,
                            proposedParts[part.key] ?? "",
                            (next) => history.change(part.key, next),
                            part.label
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    renderControl(
                      column,
                      proposedDraft,
                      (next) => history.change(singleFieldKey, next),
                      t("sheets.comments.proposePlaceholder")
                    )
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !canSubmitProposal}
                  onClick={() => void postComment(true)}
                  className="h-auto shrink-0 whitespace-pre-line bg-amber-500 px-3 py-1.5 text-center leading-tight text-stone-950 hover:bg-amber-400"
                >
                  {t("sheets.comments.proposeButton")}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("sheets.comments.proposeDraftHint")}
              </p>
            </div>
          )}
        </div>

        {/* 2. Pole do wpisywania nowego komentarza */}
        <div className="shrink-0 space-y-2 border-t pt-2">
          {mentionIds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {mentionIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  @{mentionLabels[id] || id}
                  <button type="button" onClick={() => removeMentionChip(id)} aria-label="remove">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <textarea
                ref={textareaRef}
                rows={2}
                value={body}
                onChange={(e) => onBodyChange(e.target.value)}
                onKeyUp={(e) => onBodyChange((e.target as HTMLTextAreaElement).value)}
                placeholder={t("sheets.comments.placeholder")}
                className="min-h-[3.25rem] w-full rounded border bg-background px-2 py-1.5 text-sm"
                maxLength={2000}
              />
              {suggestQ !== null && (suggestions?.length ?? 0) > 0 && (
                <ul className="absolute left-0 top-full z-50 mt-1 max-h-40 w-full overflow-auto rounded border bg-background shadow-md">
                  {suggestions!.map((user) => (
                    <li key={user.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickSuggestion(user);
                        }}
                      >
                        <span>{user.label}</span>
                        <span className="text-xs text-muted-foreground">{formatStaffUserRoleLabel(user)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !body.trim()}
              onClick={() => void postComment(false)}
              className="h-auto shrink-0 py-2"
            >
              {t("sheets.comments.addCommentButton")}
            </Button>
          </div>
        </div>

        {/* 3. Status i odebrane komentarze */}
        <div className="min-h-[8rem] flex-1 space-y-2 overflow-auto border-t pt-2">
          {isLoading && <p className="text-sm text-muted-foreground">{t("sheets.comments.loading")}</p>}
          {!isLoading && (data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">{t("sheets.comments.empty")}</p>
          )}
          {data?.map((comment) => {
            const isProposal = comment.proposed_value !== null && comment.proposed_value !== undefined;
            const canDeleteAuthor =
              me?.type === "admin" || (myId != null && comment.author?.id === myId);
            const canDelete = Boolean(comment.can_delete) || canDeleteAuthor;
            const statusMeta = commentStatusMeta(comment.status);
            return (
              <div
                key={comment.id}
                className="rounded border px-3 py-2 text-sm"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {comment.author?.label || t("sheets.someoneElse")}
                  </span>
                  <span>{new Date(comment.created_at).toLocaleString("pl-PL")}</span>
                  {comment.mentions.length > 0 && (
                    <span>@ {comment.mentions.map((m) => m.label).join(", ")}</span>
                  )}
                </div>
                {comment.body ? (
                  <p className="whitespace-pre-wrap break-words">{comment.body}</p>
                ) : null}
                {isProposal && (
                  <p className="mt-1 whitespace-pre-wrap break-words rounded bg-muted/50 px-2 py-1 text-xs">
                    <span className="text-muted-foreground">{t("sheets.comments.proposedDraftLabel")}: </span>
                    <span className="font-medium">{formatCommentProposal(comment.proposed_value)}</span>
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {isProposal ? (
                    <>
                      <label className="relative inline-flex items-center gap-1.5 text-xs">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: statusMeta.color }}
                          aria-hidden
                        />
                        <select
                          value={comment.status}
                          disabled={busy}
                          onChange={(e) =>
                            void setStatus(comment, e.target.value as SheetCommentStatus)
                          }
                          className="h-7 max-w-[12rem] cursor-pointer rounded border px-2 text-xs font-medium"
                          style={{
                            backgroundColor: statusMeta.color,
                            color: statusMeta.text,
                            borderColor: statusMeta.color,
                          }}
                          aria-label={t("sheets.comments.statusLabel")}
                        >
                          {SHEET_COMMENT_STATUSES.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {t(opt.labelKey)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {canCommit && comment.can_apply && comment.status !== "rejected" && (
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-white hover:opacity-90"
                          style={{ backgroundColor: STAFF_ACCENT_COLOR }}
                          disabled={busy}
                          onClick={() => void applyComment(comment)}
                        >
                          {t("sheets.comments.commitToDb")}
                        </Button>
                      )}
                      {comment.status === "progress" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7"
                          disabled={busy}
                          onClick={() =>
                            void setStatus(comment, "rejected", t("sheets.comments.restoredOk"))
                          }
                        >
                          {t("sheets.comments.restoreButton")}
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={busy}
                          onClick={() => void removeComment(comment)}
                        >
                          {t("sheets.comments.deleteComment")}
                        </Button>
                      )}
                    </>
                  ) : (
                    canDelete && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy}
                        onClick={() => void removeComment(comment)}
                      >
                        {t("sheets.comments.deleteComment")}
                      </Button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void restoreDraft()}
          >
            {t("sheets.comments.restoreButton")}
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t("sheets.comments.close")}
            </Button>
            {canCommit && onCommit && columnEditable && (
              <Button
                type="button"
                size="sm"
                className="text-white hover:opacity-90"
                style={{ backgroundColor: STAFF_ACCENT_COLOR }}
                disabled={busy}
                onClick={() => void commitDraftToDb()}
              >
                {t("sheets.comments.commitToDb")}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CommentCornerButton({
  count,
  onClick,
}: {
  count: number;
  onClick: (e: React.MouseEvent) => void;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      title="Komentarze"
      className="absolute right-0 top-0 z-20 h-0 w-0 border-l-[10px] border-t-[10px] border-l-transparent border-t-orange-500"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick(e);
      }}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}

export function CommentOpenButton({
  disabled,
  onClick,
  className,
}: {
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      className={cn("h-auto gap-1.5 whitespace-pre-line py-1.5 text-left leading-tight", className)}
      onClick={onClick}
    >
      <MessageSquare className="h-4 w-4 shrink-0" />
      <span>{t("sheets.comments.open")}</span>
    </Button>
  );
}
