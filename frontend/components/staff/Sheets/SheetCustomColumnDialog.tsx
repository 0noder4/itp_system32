"use client";

import React from "react";
import { Trash2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { CUSTOM_GROUP_PALETTE } from "@/lib/sheets/groupColors";
import type { SheetColumnKind } from "@/lib/sheets/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DialogUndoButtons } from "./SheetCellEditDialog";

export interface CustomGroupOption {
  value: string;
  label: string;
}

export type CustomColumnDialogMode =
  | { kind: "create-column"; initialGroup?: string }
  | { kind: "create-group" }
  | {
      kind: "edit-column";
      column: {
        key: string;
        label: string;
        group: string;
        raw_group?: string;
        help?: string;
        kind?: SheetColumnKind;
        edit_roles?: string[];
        can_delete?: boolean;
      };
    };

interface SheetCustomColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CustomColumnDialogMode | null;
  sheetKey: string;
  tabKey: string;
  existingGroups: CustomGroupOption[];
  customGroupColors: Record<string, string>;
  onSaved: () => Promise<void> | void;
  onDeleted?: (columnKey: string) => Promise<void> | void;
}

interface FormDraft {
  groupChoice: string;
  newGroupName: string;
  newGroupColor: string;
  label: string;
  help: string;
  kind: "text" | "longtext" | "file_link";
  allowOpiekun: boolean;
  allowTr: boolean;
}

const NEW_GROUP_SENTINEL = "__new_group__";
const HISTORY_LIMIT = 50;

function isTextTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "date", "color"].includes(target.type);
  }
  return false;
}

function normalizeGroupValue(name: string): string {
  return name.trim().replace(/^(MAIL #[1-5])\s+·\s+.*$/, "$1");
}

function buildInitialDraft(
  mode: CustomColumnDialogMode | null,
  existingGroups: CustomGroupOption[],
  customGroupColors: Record<string, string>
): FormDraft {
  const defaultColor = CUSTOM_GROUP_PALETTE[0];
  if (!mode || mode.kind === "create-group") {
    return {
      groupChoice: NEW_GROUP_SENTINEL,
      newGroupName: "",
      newGroupColor: defaultColor,
      label: "",
      help: "",
      kind: "text",
      allowOpiekun: false,
      allowTr: false,
    };
  }
  if (mode.kind === "create-column") {
    const initial = normalizeGroupValue(mode.initialGroup ?? "");
    const matched = existingGroups.find((g) => g.value === initial || g.label === initial);
    return {
      groupChoice: matched ? matched.value : "",
      newGroupName: "",
      newGroupColor: defaultColor,
      label: "",
      help: "",
      kind: "text",
      allowOpiekun: false,
      allowTr: false,
    };
  }
  const col = mode.column;
  const rawGroup = normalizeGroupValue(
    col.group !== undefined ? col.group : (col.raw_group ?? "")
  );
  const matched = existingGroups.find((g) => g.value === rawGroup || g.label === rawGroup);
  const roles = new Set(col.edit_roles ?? ["fr", "lg"]);
  const kind: FormDraft["kind"] =
    col.kind === "longtext" || col.kind === "file_link" ? col.kind : "text";
  return {
    groupChoice: matched ? matched.value : rawGroup ? NEW_GROUP_SENTINEL : "",
    newGroupName: matched ? "" : rawGroup,
    newGroupColor: (rawGroup && customGroupColors[rawGroup]) || defaultColor,
    label: col.label.replace(/\n/g, " "),
    help: col.help ?? "",
    kind,
    allowOpiekun: roles.has("opiekun"),
    allowTr: roles.has("tr"),
  };
}

export function SheetCustomColumnDialog({
  open,
  onOpenChange,
  mode,
  sheetKey,
  tabKey,
  existingGroups,
  customGroupColors,
  onSaved,
  onDeleted,
}: SheetCustomColumnDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [draft, setDraft] = React.useState<FormDraft>(() =>
    buildInitialDraft(mode, existingGroups, customGroupColors)
  );
  const pastRef = React.useRef<FormDraft[]>([]);
  const futureRef = React.useRef<FormDraft[]>([]);
  const [counts, setCounts] = React.useState({ undo: 0, redo: 0 });
  const initializedKeyRef = React.useRef<string | null>(null);
  const modeRef = React.useRef(mode);
  const existingGroupsRef = React.useRef(existingGroups);
  const customGroupColorsRef = React.useRef(customGroupColors);
  modeRef.current = mode;
  existingGroupsRef.current = existingGroups;
  customGroupColorsRef.current = customGroupColors;

  const modeKey = !mode
    ? ""
    : mode.kind === "edit-column"
      ? `edit:${mode.column.key}`
      : mode.kind === "create-column"
        ? `create-col:${mode.initialGroup ?? ""}`
        : "create-group";

  React.useEffect(() => {
    if (!open) {
      initializedKeyRef.current = null;
      setConfirmDelete(false);
      return;
    }
    if (!modeKey || initializedKeyRef.current === modeKey) return;
    initializedKeyRef.current = modeKey;
    setDraft(
      buildInitialDraft(modeRef.current, existingGroupsRef.current, customGroupColorsRef.current)
    );
    pastRef.current = [];
    futureRef.current = [];
    setCounts({ undo: 0, redo: 0 });
    setConfirmDelete(false);
  }, [open, modeKey]);

  const syncCounts = React.useCallback(() => {
    setCounts({ undo: pastRef.current.length, redo: futureRef.current.length });
  }, []);

  const change = React.useCallback(
    (patch: Partial<FormDraft>) => {
      setDraft((prev) => {
        pastRef.current = [...pastRef.current, prev].slice(-HISTORY_LIMIT);
        futureRef.current = [];
        syncCounts();
        return { ...prev, ...patch };
      });
    },
    [syncCounts]
  );

  const undo = React.useCallback(() => {
    const previous = pastRef.current.pop();
    if (!previous) return;
    setDraft((current) => {
      futureRef.current.push(current);
      return previous;
    });
    syncCounts();
  }, [syncCounts]);

  const redo = React.useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    setDraft((current) => {
      pastRef.current.push(current);
      return next;
    });
    syncCounts();
  }, [syncCounts]);

  React.useEffect(() => {
    if (!open || confirmDelete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isTextTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        if (pastRef.current.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          undo();
        }
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        if (futureRef.current.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          redo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, confirmDelete, undo, redo]);

  if (!mode) return null;

  const isGroupOnly = mode.kind === "create-group";
  const isEdit = mode.kind === "edit-column";
  const isFileEdit = isEdit && mode.column.kind === "file_link";
  const canDelete = isEdit && Boolean(mode.column.can_delete);

  const handleDelete = async () => {
    if (!canDelete || busy || !isEdit) return;
    setBusy(true);
    try {
      await apiClient.delete(
        `/api/sheets/${sheetKey}/${tabKey}/columns/${encodeURIComponent(mode.column.key)}/`
      );
      toast.success(t("sheets.customColumns.columnDeleted"));
      await onDeleted?.(mode.column.key);
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (error: unknown) {
      const errData = (error as { response?: { data?: { detail?: string; errors?: { detail?: string }[] } } })
        ?.response?.data;
      toast.error(String(errData?.errors?.[0]?.detail || errData?.detail || t("sheets.customColumns.deleteError")));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (isGroupOnly) {
      const name = draft.newGroupName.trim();
      if (!name) {
        toast.error(t("sheets.customColumns.groupNameRequired"));
        return;
      }
      setBusy(true);
      try {
        await apiClient.post(`/api/sheets/${sheetKey}/${tabKey}/groups/`, {
          name,
          color: draft.newGroupColor,
        });
        toast.success(t("sheets.customColumns.groupCreated"));
        await onSaved();
        onOpenChange(false);
      } catch (error: unknown) {
        const errData = (error as { response?: { data?: { detail?: string; errors?: { detail?: string }[] } } })
          ?.response?.data;
        toast.error(String(errData?.errors?.[0]?.detail || errData?.detail || t("sheets.customColumns.saveError")));
      } finally {
        setBusy(false);
      }
      return;
    }

    const label = draft.label.trim();
    if (!label) {
      toast.error(t("sheets.customColumns.columnNameRequired"));
      return;
    }
    const isNewGroup = draft.groupChoice === NEW_GROUP_SENTINEL;
    const groupName = isNewGroup ? draft.newGroupName.trim() : draft.groupChoice;
    if (isNewGroup && !groupName) {
      toast.error(t("sheets.customColumns.groupNameRequired"));
      return;
    }
    const editRoles = ["fr", "lg"];
    if (draft.allowOpiekun) editRoles.push("opiekun");
    if (draft.allowTr) editRoles.push("tr");

    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        label,
        group: groupName,
        help: draft.help.trim(),
        edit_roles: editRoles,
      };
      if (isNewGroup && draft.newGroupColor) {
        payload.group_color = draft.newGroupColor;
      }
      if (!isFileEdit) {
        payload.kind = draft.kind;
      }
      if (isEdit) {
        await apiClient.patch(
          `/api/sheets/${sheetKey}/${tabKey}/columns/${encodeURIComponent(mode.column.key)}/`,
          payload
        );
        toast.success(t("sheets.customColumns.columnUpdated"));
      } else {
        await apiClient.post(`/api/sheets/${sheetKey}/${tabKey}/columns/`, payload);
        toast.success(t("sheets.customColumns.columnCreated"));
      }
      await onSaved();
      onOpenChange(false);
    } catch (error: unknown) {
      const errData = (error as { response?: { data?: { detail?: string; errors?: { detail?: string }[] } } })
        ?.response?.data;
      toast.error(String(errData?.errors?.[0]?.detail || errData?.detail || t("sheets.customColumns.saveError")));
    } finally {
      setBusy(false);
    }
  };

  const title = isGroupOnly
    ? t("sheets.customColumns.createGroupTitle")
    : isEdit
      ? t("sheets.customColumns.editColumnTitle")
      : t("sheets.customColumns.createColumnTitle");

  const description = isGroupOnly
    ? t("sheets.customColumns.createGroupDesc")
    : t("sheets.customColumns.createColumnDesc");

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && (busy || confirmDelete)) return;
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <DialogTitle>{title}</DialogTitle>
            <DialogUndoButtons
              canUndo={counts.undo > 0}
              canRedo={counts.redo > 0}
              onUndo={undo}
              onRedo={redo}
            />
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {!isGroupOnly && (
            <div className="space-y-1.5">
              <Label htmlFor="custom-col-group">{t("sheets.customColumns.groupLabel")}</Label>
              <select
                id="custom-col-group"
                value={draft.groupChoice}
                disabled={busy}
                onChange={(e) => change({ groupChoice: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
              >
                <option value="">{t("sheets.settings.ungrouped")}</option>
                {existingGroups.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
                <option value={NEW_GROUP_SENTINEL}>{t("sheets.customColumns.newGroupOption")}</option>
              </select>
            </div>
          )}

          {(isGroupOnly || draft.groupChoice === NEW_GROUP_SENTINEL) && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label htmlFor="custom-group-name">{t("sheets.customColumns.newGroupNameLabel")}</Label>
                <Input
                  id="custom-group-name"
                  value={draft.newGroupName}
                  disabled={busy}
                  maxLength={120}
                  placeholder={t("sheets.customColumns.newGroupNamePlaceholder")}
                  onChange={(e) => change({ newGroupName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("sheets.customColumns.groupColorLabel")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {CUSTOM_GROUP_PALETTE.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      disabled={busy}
                      aria-label={hex}
                      onClick={() => change({ newGroupColor: hex })}
                      className={cn(
                        "h-6 w-6 rounded border border-neutral-400 transition hover:scale-105 dark:border-input",
                        draft.newGroupColor === hex && "ring-2 ring-foreground ring-offset-1"
                      )}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isGroupOnly && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="custom-col-label">{t("sheets.customColumns.columnNameLabel")}</Label>
                <Input
                  id="custom-col-label"
                  value={draft.label}
                  disabled={busy}
                  maxLength={120}
                  placeholder={t("sheets.customColumns.columnNamePlaceholder")}
                  onChange={(e) => change({ label: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="custom-col-help">{t("sheets.customColumns.helpLabel")}</Label>
                <textarea
                  id="custom-col-help"
                  value={draft.help}
                  disabled={busy}
                  maxLength={1000}
                  rows={2}
                  placeholder={t("sheets.customColumns.helpPlaceholder")}
                  onChange={(e) => change({ help: e.target.value })}
                  className="flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("sheets.customColumns.kindLabel")}</Label>
                <div className="grid gap-1.5">
                  {(
                    [
                      {
                        value: "text",
                        title: t("sheets.customColumns.kindTextTitle"),
                        hint: t("sheets.customColumns.kindTextHint"),
                      },
                      {
                        value: "longtext",
                        title: t("sheets.customColumns.kindLongtextTitle"),
                        hint: t("sheets.customColumns.kindLongtextHint"),
                      },
                      {
                        value: "file_link",
                        title: t("sheets.customColumns.kindMediaTitle"),
                        hint: t("sheets.customColumns.kindMediaHint"),
                      },
                    ] as const
                  ).map((opt) => {
                    const disabledOpt =
                      busy || (isEdit && (isFileEdit ? opt.value !== "file_link" : opt.value === "file_link"));
                    return (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-md border p-2 text-sm transition-colors",
                          draft.kind === opt.value && "border-foreground/50 bg-muted/50",
                          disabledOpt && "cursor-not-allowed opacity-55"
                        )}
                      >
                        <input
                          type="radio"
                          name="custom-col-kind"
                          checked={draft.kind === opt.value}
                          disabled={disabledOpt}
                          onChange={() => change({ kind: opt.value })}
                          className="mt-0.5"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">{opt.title}</span>
                          <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {isEdit && (
                  <p className="text-[11px] text-muted-foreground">
                    {t("sheets.customColumns.kindEditNote")}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>{t("sheets.customColumns.editRolesLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("sheets.customColumns.editRolesHint")}
                </p>
                <div className="flex flex-wrap gap-3 rounded-md border p-2 text-sm">
                  <label className="flex items-center gap-1.5 text-muted-foreground">
                    <input type="checkbox" checked disabled />
                    <span>Admin / FR / LG</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={draft.allowOpiekun}
                      disabled={busy}
                      onChange={(e) => change({ allowOpiekun: e.target.checked })}
                    />
                    <span>Opiekun</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={draft.allowTr}
                      disabled={busy}
                      onChange={(e) => change({ allowTr: e.target.checked })}
                    />
                    <span>TR</span>
                  </label>
                </div>
              </div>
            </>
          )}

          <DialogFooter className={cn("gap-2 sm:space-x-0", canDelete && "sm:justify-between")}>
            {canDelete && (
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                {t("sheets.customColumns.deleteColumnButton")}
              </Button>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={busy}>
                {isEdit ? t("sheets.customColumns.saveEdit") : t("sheets.customColumns.saveCreate")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {isEdit && (
      <Dialog
        open={confirmDelete}
        onOpenChange={(next) => {
          if (!busy) setConfirmDelete(next);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sheets.customColumns.deleteColumnConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("sheets.customColumns.deleteColumnConfirmBody", {
                name: mode.column.label.replace(/\n/g, " "),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
              {t("sheets.customColumns.deleteColumnConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
}
