"use client";

import React from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderPlus,
  GripVertical,
  History,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { getUserType, hasStaffRole } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import {
  moveColumnBlockRelative,
  moveColumnRelative,
} from "@/lib/sheets/columnOrder";
import { flatColumnLabel } from "@/lib/sheets/columnWidths";
import type { SheetColumnKind, SheetCustomGroup } from "@/lib/sheets/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DialogUndoButtons } from "./SheetCellEditDialog";
import {
  SheetCustomColumnDialog,
  type CustomColumnDialogMode,
  type CustomGroupOption,
} from "./SheetCustomColumnDialog";

export interface SettingsColumn {
  key: string;
  label: string;
  group?: string;
  raw_group?: string;
  help?: string;
  kind?: SheetColumnKind;
  is_custom?: boolean;
  hidden_for_all?: boolean;
  edit_roles?: string[];
  can_delete?: boolean;
}

interface SheetSettingsDialogProps {
  sheetKey: string;
  tabKey: string;
  columns: SettingsColumn[];
  customGroups?: SheetCustomGroup[];
  canManageColumns?: boolean;
  hidden: Set<string>;
  onSetHidden: (keys: string[]) => void;
  onReorder: (keys: string[]) => void;
  groupOverrides: Record<string, string>;
  onSetGroupOverrides: (next: Record<string, string>) => void;
  getColumnOrder: () => string[];
  getColumnWidths: () => Record<string, number>;
  applyColumnWidths: (widths: Record<string, number>) => void;
  hiddenCount: number;
  frozenColumns: number;
  onOpenHistory: () => void;
  onMailDeadlinesSaved?: () => void;
  onColumnsMutated?: () => Promise<void> | void;
}

type DragState =
  | { kind: "column"; key: string; group: string; label: string }
  | { kind: "group"; keys: string[]; group: string };

type DropIndicator =
  | { kind: "item"; key: string; placement: "before" | "after" }
  | { kind: "emptyGroup"; name: string };

type CrossGroupMode = "ask" | "target" | "keep";

interface PendingCrossGroupDrop {
  colKey: string;
  colLabel: string;
  sourceGroup: string;
  targetGroup: string;
  nextOrder: string[];
}

interface LayoutSnapshot {
  hidden: string[];
  order: string[];
  groups: Record<string, string>;
  widths?: Record<string, number>;
}

type SettingsHistoryEntry =
  | { kind: "layout"; before: LayoutSnapshot; after: LayoutSnapshot }
  | { kind: "mail_dates"; before: Record<string, string>; after: Record<string, string> }
  | { kind: "custom_visibility"; columnKey: string; before: boolean; after: boolean };

const MAIL_IDS = ["1", "2", "3", "4", "5"] as const;
const HISTORY_LIMIT = 60;
const NEW_LOCAL_GROUP_SENTINEL = "__new_local_group__";

function isTextTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) {
    return !["checkbox", "radio", "button", "submit", "date", "color"].includes(target.type);
  }
  return false;
}

function consecutiveGroups(columns: SettingsColumn[]) {
  const groups: { label: string; cols: SettingsColumn[] }[] = [];
  for (const col of columns.slice(1)) {
    const label = col.group?.trim() || "";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.cols.push(col);
    else groups.push({ label, cols: [col] });
  }
  return groups;
}

function sameGroupBase(a: string, b: string): boolean {
  const ga = a.trim();
  const gb = b.trim();
  if (!ga && !gb) return true;
  if (ga === gb) return true;
  const ba = ga.split(" · ")[0]?.trim() ?? "";
  const bb = gb.split(" · ")[0]?.trim() ?? "";
  return Boolean(ba && ba === bb);
}

export function SheetSettingsDialog({
  sheetKey,
  tabKey,
  columns,
  customGroups = [],
  canManageColumns = false,
  hidden,
  onSetHidden,
  onReorder,
  groupOverrides,
  onSetGroupOverrides,
  getColumnOrder,
  getColumnWidths,
  applyColumnWidths,
  hiddenCount,
  frozenColumns,
  onOpenHistory,
  onMailDeadlinesSaved,
  onColumnsMutated,
}: SheetSettingsDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [confirmDefault, setConfirmDefault] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [mailDates, setMailDates] = React.useState<Record<string, string>>({});
  const [mailBusy, setMailBusy] = React.useState(false);
  const [dropIndicator, setDropIndicator] = React.useState<DropIndicator | null>(null);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const dragRef = React.useRef<DragState | null>(null);

  const [crossGroupMode, setCrossGroupMode] = React.useState<CrossGroupMode>("ask");
  const [pendingDrop, setPendingDrop] = React.useState<PendingCrossGroupDrop | null>(null);
  const [dropChoice, setDropChoice] = React.useState<"target" | "keep" | "other">("target");
  const [otherGroupChoice, setOtherGroupChoice] = React.useState<string>("");
  const [otherNewGroup, setOtherNewGroup] = React.useState("");
  const [rememberChoice, setRememberChoice] = React.useState(false);

  const [customDialogMode, setCustomDialogMode] = React.useState<CustomColumnDialogMode | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = React.useState(false);
  const [pendingDeleteGroup, setPendingDeleteGroup] = React.useState<SheetCustomGroup | null>(null);

  const pastRef = React.useRef<SettingsHistoryEntry[]>([]);
  const futureRef = React.useRef<SettingsHistoryEntry[]>([]);
  const [historyCounts, setHistoryCounts] = React.useState({ undo: 0, redo: 0 });

  const isAdmin = getUserType() === "admin";
  const canEditMailDeadlines = hasStaffRole("fr") || hasStaffRole("lg");
  const groups = React.useMemo(() => consecutiveGroups(columns), [columns]);
  const orderKeys = React.useMemo(() => columns.slice(1).map((col) => col.key), [columns]);

  const customGroupsByName = React.useMemo(
    () => new Map(customGroups.map((g) => [g.name, g])),
    [customGroups]
  );

  const customGroupColors = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const grp of customGroups) {
      if (grp.color) map[grp.name] = grp.color;
    }
    return map;
  }, [customGroups]);

  const emptyCustomGroups = React.useMemo(() => {
    const activeLabels = new Set(groups.map((g) => g.label).filter(Boolean));
    return customGroups.filter((g) => !activeLabels.has(g.name));
  }, [groups, customGroups]);

  const existingGroupOptions = React.useMemo<CustomGroupOption[]>(() => {
    const seen = new Set<string>();
    const options: CustomGroupOption[] = [];
    for (const col of columns.slice(1)) {
      const display = col.group?.trim() || "";
      const value = display.replace(/^(MAIL #[1-5])\s+·\s+.*$/, "$1");
      if (!value || seen.has(value)) continue;
      seen.add(value);
      options.push({ value, label: display });
    }
    for (const grp of customGroups) {
      if (!grp.name || seen.has(grp.name)) continue;
      seen.add(grp.name);
      options.push({ value: grp.name, label: grp.name });
    }
    return options;
  }, [columns, customGroups]);

  const syncHistoryCounts = React.useCallback(() => {
    setHistoryCounts({ undo: pastRef.current.length, redo: futureRef.current.length });
  }, []);

  const pushHistory = React.useCallback(
    (entry: SettingsHistoryEntry) => {
      pastRef.current = [...pastRef.current, entry].slice(-HISTORY_LIMIT);
      futureRef.current = [];
      syncHistoryCounts();
    },
    [syncHistoryCounts]
  );

  const captureLayout = React.useCallback(
    (includeWidths = false): LayoutSnapshot => ({
      hidden: [...hidden],
      order: getColumnOrder(),
      groups: { ...groupOverrides },
      ...(includeWidths ? { widths: getColumnWidths() } : {}),
    }),
    [hidden, getColumnOrder, groupOverrides, getColumnWidths]
  );

  const applyLayoutSnapshot = React.useCallback(
    (snap: LayoutSnapshot) => {
      onSetHidden(snap.hidden);
      onReorder(snap.order);
      onSetGroupOverrides(snap.groups);
      if (snap.widths) applyColumnWidths(snap.widths);
    },
    [onSetHidden, onReorder, onSetGroupOverrides, applyColumnWidths]
  );

  const commitLayoutChange = React.useCallback(
    (after: LayoutSnapshot, includeWidths = false) => {
      const before = captureLayout(includeWidths);
      applyLayoutSnapshot(after);
      pushHistory({ kind: "layout", before, after });
    },
    [captureLayout, applyLayoutSnapshot, pushHistory]
  );

  const applyHistoryDirection = React.useCallback(
    async (entry: SettingsHistoryEntry, direction: "undo" | "redo") => {
      if (entry.kind === "layout") {
        applyLayoutSnapshot(direction === "undo" ? entry.before : entry.after);
        return;
      }
      if (entry.kind === "mail_dates") {
        setMailDates(direction === "undo" ? entry.before : entry.after);
        return;
      }
      const nextHidden = direction === "undo" ? entry.before : entry.after;
      setBusy(true);
      try {
        await apiClient.patch(
          `/api/sheets/${sheetKey}/${tabKey}/columns/${encodeURIComponent(entry.columnKey)}/`,
          { hidden_for_all: nextHidden }
        );
        await onColumnsMutated?.();
      } finally {
        setBusy(false);
      }
    },
    [applyLayoutSnapshot, onColumnsMutated, sheetKey, tabKey]
  );

  const handleUndo = React.useCallback(async () => {
    if (busy) return;
    const entry = pastRef.current.pop();
    if (!entry) return;
    try {
      await applyHistoryDirection(entry, "undo");
      futureRef.current.push(entry);
      syncHistoryCounts();
    } catch {
      pastRef.current.push(entry);
      toast.error(t("sheets.settings.undoError"));
    }
  }, [applyHistoryDirection, busy, syncHistoryCounts, t]);

  const handleRedo = React.useCallback(async () => {
    if (busy) return;
    const entry = futureRef.current.pop();
    if (!entry) return;
    try {
      await applyHistoryDirection(entry, "redo");
      pastRef.current.push(entry);
      syncHistoryCounts();
    } catch {
      futureRef.current.push(entry);
      toast.error(t("sheets.settings.redoError"));
    }
  }, [applyHistoryDirection, busy, syncHistoryCounts, t]);

  React.useEffect(() => {
    if (!open || confirmDefault || pendingDrop || customDialogOpen || pendingDeleteGroup) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isTextTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        if (pastRef.current.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          void handleUndo();
        }
      } else if (key === "y" || (key === "z" && event.shiftKey)) {
        if (futureRef.current.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          void handleRedo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, confirmDefault, pendingDrop, customDialogOpen, pendingDeleteGroup, handleUndo, handleRedo]);

  React.useEffect(() => {
    if (!open || !canEditMailDeadlines) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<{ dates: Record<string, string> }>(
          "/api/sheets/mail-deadlines/"
        );
        if (!cancelled) setMailDates(data.dates || {});
      } catch {
        if (!cancelled) toast.error(t("sheets.settings.mailDeadlines.loadError"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, canEditMailDeadlines, t]);

  const toggleColumnHidden = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    commitLayoutChange({
      hidden: [...next],
      order: getColumnOrder(),
      groups: { ...groupOverrides },
    });
  };

  const toggleGroupHidden = (cols: SettingsColumn[], show: boolean) => {
    const next = new Set(hidden);
    for (const col of cols) {
      if (col.hidden_for_all) continue;
      if (show) next.delete(col.key);
      else next.add(col.key);
    }
    commitLayoutChange({
      hidden: [...next],
      order: getColumnOrder(),
      groups: { ...groupOverrides },
    });
  };

  const toggleHiddenForAll = async (col: SettingsColumn) => {
    if (!canManageColumns || busy) return;
    const before = Boolean(col.hidden_for_all);
    const after = !before;
    setBusy(true);
    try {
      await apiClient.patch(
        `/api/sheets/${sheetKey}/${tabKey}/columns/${encodeURIComponent(col.key)}/`,
        { hidden_for_all: after }
      );
      await onColumnsMutated?.();
      pushHistory({ kind: "custom_visibility", columnKey: col.key, before, after });
      toast.success(
        after
          ? t("sheets.customColumns.hiddenForAllOn")
          : t("sheets.customColumns.hiddenForAllOff")
      );
    } catch {
      toast.error(t("sheets.customColumns.visibilityError"));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteGroup = async () => {
    if (!pendingDeleteGroup || busy) return;
    const targetGroup = pendingDeleteGroup;
    setBusy(true);
    try {
      await apiClient.delete(`/api/sheets/${sheetKey}/${tabKey}/groups/${targetGroup.id}/`);
      const nextGroups = Object.fromEntries(
        Object.entries(groupOverrides).filter(([, value]) => value !== targetGroup.name)
      );
      if (Object.keys(nextGroups).length !== Object.keys(groupOverrides).length) {
        onSetGroupOverrides(nextGroups);
      }
      await onColumnsMutated?.();
      toast.success(t("sheets.customColumns.groupDeleted"));
      setPendingDeleteGroup(null);
    } catch (error: unknown) {
      const errData = (error as { response?: { data?: { detail?: string; errors?: { detail?: string }[] } } })
        ?.response?.data;
      toast.error(String(errData?.errors?.[0]?.detail || errData?.detail || t("sheets.customColumns.deleteError")));
    } finally {
      setBusy(false);
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    setDropIndicator(null);
  };

  const beginDrag = (next: DragState, event: React.DragEvent) => {
    dragRef.current = next;
    event.dataTransfer.setData("text/plain", next.kind === "column" ? next.key : next.keys[0] ?? "");
    event.dataTransfer.effectAllowed = "move";
  };

  const computePlacement = (event: React.DragEvent<HTMLElement>): "before" | "after" => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  const openCrossGroupModal = (pending: PendingCrossGroupDrop) => {
    setPendingDrop(pending);
    setDropChoice("target");
    setOtherGroupChoice(pending.targetGroup);
    setOtherNewGroup("");
    setRememberChoice(false);
  };

  const applyCrossGroupResult = (
    pending: PendingCrossGroupDrop,
    targetGroup: string
  ) => {
    const nextGroups = { ...groupOverrides };
    if (targetGroup !== pending.sourceGroup) {
      nextGroups[pending.colKey] = targetGroup;
    }
    commitLayoutChange({
      hidden: [...hidden],
      order: pending.nextOrder,
      groups: nextGroups,
    });
  };

  const applyDropOnItem = (
    targetKey: string,
    targetGroup: string,
    placement: "before" | "after"
  ) => {
    const current = dragRef.current;
    endDrag();
    if (!current || !targetKey) return;

    if (current.kind === "group") {
      const next = moveColumnBlockRelative(orderKeys, current.keys, targetKey, placement);
      if (next !== orderKeys) {
        commitLayoutChange({
          hidden: [...hidden],
          order: next,
          groups: { ...groupOverrides },
        });
      }
      return;
    }

    const next = moveColumnRelative(orderKeys, current.key, targetKey, placement);
    if (sameGroupBase(current.group, targetGroup)) {
      if (next !== orderKeys) {
        commitLayoutChange({
          hidden: [...hidden],
          order: next,
          groups: { ...groupOverrides },
        });
      }
      return;
    }

    const pending: PendingCrossGroupDrop = {
      colKey: current.key,
      colLabel: current.label,
      sourceGroup: current.group,
      targetGroup,
      nextOrder: next,
    };
    if (crossGroupMode === "target") {
      applyCrossGroupResult(pending, targetGroup);
      return;
    }
    if (crossGroupMode === "keep") {
      applyCrossGroupResult(pending, current.group);
      return;
    }
    openCrossGroupModal(pending);
  };

  const applyDropOnEmptyGroup = (groupName: string) => {
    const current = dragRef.current;
    endDrag();
    if (!current || current.kind !== "column" || !groupName) return;
    const nextOrder = [
      ...orderKeys.filter((k) => k !== current.key),
      current.key,
    ];
    const pending: PendingCrossGroupDrop = {
      colKey: current.key,
      colLabel: current.label,
      sourceGroup: current.group,
      targetGroup: groupName,
      nextOrder,
    };
    if (crossGroupMode === "target") {
      applyCrossGroupResult(pending, groupName);
      return;
    }
    if (crossGroupMode === "keep") {
      applyCrossGroupResult(pending, current.group);
      return;
    }
    openCrossGroupModal(pending);
  };

  const confirmPendingCrossGroupDrop = () => {
    if (!pendingDrop) return;
    let resolvedGroup = pendingDrop.targetGroup;
    if (dropChoice === "keep") {
      resolvedGroup = pendingDrop.sourceGroup;
    } else if (dropChoice === "other") {
      if (otherGroupChoice === NEW_LOCAL_GROUP_SENTINEL) {
        const trimmed = otherNewGroup.trim();
        if (!trimmed) {
          toast.error(t("sheets.customColumns.groupNameRequired"));
          return;
        }
        resolvedGroup = trimmed;
      } else {
        resolvedGroup = otherGroupChoice;
      }
    }
    if (rememberChoice && (dropChoice === "target" || dropChoice === "keep")) {
      setCrossGroupMode(dropChoice);
    }
    applyCrossGroupResult(pendingDrop, resolvedGroup);
    setPendingDrop(null);
  };

  const resetWidths = () => {
    commitLayoutChange({ ...captureLayout(true), widths: {} }, true);
    toast.success(t("sheets.settings.resetWidthsSuccess"));
  };

  const syncFromDefault = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.get<{
        column_widths: Record<string, number>;
        hidden_by_tab?: Record<string, string[]>;
        column_order_by_tab?: Record<string, string[]>;
        column_groups_by_tab?: Record<string, Record<string, string>>;
      }>(`/api/sheets/${sheetKey}/layout/`);
      const widths = data.column_widths || {};
      const hiddenKeys = data.hidden_by_tab?.[tabKey];
      const orderKeysFromDefault = data.column_order_by_tab?.[tabKey];
      const groupsFromDefault = data.column_groups_by_tab?.[tabKey];
      if (
        Object.keys(widths).length === 0 &&
        (!hiddenKeys || hiddenKeys.length === 0) &&
        (!orderKeysFromDefault || orderKeysFromDefault.length === 0) &&
        (!groupsFromDefault || Object.keys(groupsFromDefault).length === 0)
      ) {
        toast.message(t("sheets.settings.noDefaultLayout"));
        return;
      }
      const nextSnap: LayoutSnapshot = {
        hidden: hiddenKeys ?? [...hidden],
        order: orderKeysFromDefault && orderKeysFromDefault.length > 0 ? orderKeysFromDefault : getColumnOrder(),
        groups: groupsFromDefault ?? { ...groupOverrides },
        ...(Object.keys(widths).length > 0 ? { widths } : {}),
      };
      commitLayoutChange(nextSnap, Object.keys(widths).length > 0);
      toast.success(t("sheets.settings.syncSuccess"));
    } catch {
      toast.error(t("sheets.settings.syncError"));
    } finally {
      setBusy(false);
    }
  };

  const publishDefault = async () => {
    setBusy(true);
    try {
      await apiClient.put(`/api/sheets/${sheetKey}/layout/`, {
        column_widths: getColumnWidths(),
        hidden_by_tab: { [tabKey]: [...hidden] },
        merge_hidden_tab: tabKey,
        column_order_by_tab: { [tabKey]: getColumnOrder() },
        merge_order_tab: tabKey,
        column_groups_by_tab: { [tabKey]: groupOverrides },
        merge_groups_tab: tabKey,
      });
      toast.success(t("sheets.settings.publishSuccess"));
      setConfirmDefault(false);
      setOpen(false);
    } catch {
      toast.error(t("sheets.settings.publishError"));
    } finally {
      setBusy(false);
    }
  };

  const saveMailDeadlines = async () => {
    setMailBusy(true);
    try {
      await apiClient.put("/api/sheets/mail-deadlines/", { dates: mailDates });
      toast.success(t("sheets.settings.mailDeadlines.saved"));
      onMailDeadlinesSaved?.();
    } catch {
      toast.error(t("sheets.settings.mailDeadlines.error"));
    } finally {
      setMailBusy(false);
    }
  };

  const mailDatesComplete = MAIL_IDS.every((id) => Boolean(mailDates[id]));
  const ungroupedLabel = t("sheets.settings.ungrouped");

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            pastRef.current = [];
            futureRef.current = [];
            syncHistoryCounts();
          } else {
            setConfirmDefault(false);
            setPendingDrop(null);
            setCustomDialogOpen(false);
            setPendingDeleteGroup(null);
            endDrag();
          }
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-neutral-400 shadow-none dark:border-input"
          >
            <Settings2 className="mr-1 h-4 w-4" />
            {t("sheets.settings.button")}
            {hiddenCount > 0 ? ` (−${hiddenCount})` : ""}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
              <DialogTitle>{t("sheets.settings.title")}</DialogTitle>
              <DialogUndoButtons
                canUndo={historyCounts.undo > 0 && !busy}
                canRedo={historyCounts.redo > 0 && !busy}
                onUndo={() => void handleUndo()}
                onRedo={() => void handleRedo()}
              />
            </div>
            <DialogDescription>{t("sheets.settings.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("sheets.history")}</h3>
              <p className="text-xs text-muted-foreground">{t("sheets.historyHint")}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  onOpenHistory();
                }}
              >
                <History className="mr-1 h-4 w-4" />
                {t("sheets.settings.historyButton")}
              </Button>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{t("sheets.columns")}</h3>
                {canManageColumns && (
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setCustomDialogMode({ kind: "create-group" });
                        setCustomDialogOpen(true);
                      }}
                    >
                      <FolderPlus className="mr-1 h-3.5 w-3.5" />
                      {t("sheets.customColumns.addGroupButton")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setCustomDialogMode({ kind: "create-column" });
                        setCustomDialogOpen(true);
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t("sheets.customColumns.addColumnButton")}
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("sheets.settings.freezeInfo", { count: frozenColumns })}
              </p>
              <p className="text-xs text-muted-foreground">{t("sheets.settings.reorderHint")}</p>
              {crossGroupMode !== "ask" && (
                <div className="flex items-center justify-between gap-2 rounded border bg-muted/40 px-2 py-1 text-xs">
                  <span className="text-muted-foreground">
                    {crossGroupMode === "target"
                      ? t("sheets.settings.crossGroupModeTarget")
                      : t("sheets.settings.crossGroupModeKeep")}
                  </span>
                  <button
                    type="button"
                    className="font-medium underline hover:text-foreground"
                    onClick={() => setCrossGroupMode("ask")}
                  >
                    {t("sheets.settings.crossGroupModeReset")}
                  </button>
                </div>
              )}

              <div className="max-h-72 space-y-3 overflow-auto rounded border p-2">
                {groups.map((group) => {
                  const visibleCandidates = group.cols.filter((c) => !c.hidden_for_all);
                  const visibleCount = visibleCandidates.filter((c) => !hidden.has(c.key)).length;
                  const allOn =
                    visibleCandidates.length > 0 && visibleCount === visibleCandidates.length;
                  const allOff = visibleCount === 0;
                  const firstKey = group.cols[0]?.key ?? "";
                  const lastKey = group.cols[group.cols.length - 1]?.key ?? "";
                  const isCollapsed = collapsed.has(firstKey);
                  const groupKeys = group.cols.map((col) => col.key);
                  const deletableCustomGroup = canManageColumns
                    ? customGroupsByName.get(group.label)
                    : undefined;
                  const startGroupDrag = (event: React.DragEvent) =>
                    beginDrag({ kind: "group", keys: groupKeys, group: group.label }, event);

                  const headerDropBefore =
                    dropIndicator?.kind === "item" &&
                    dropIndicator.key === firstKey &&
                    dropIndicator.placement === "before";
                  const headerDropAfter =
                    dropIndicator?.kind === "item" &&
                    dropIndicator.key === lastKey &&
                    dropIndicator.placement === "after" &&
                    isCollapsed;

                  return (
                    <div key={`${group.label}:${firstKey}`} className="space-y-1">
                      <div
                        className={cn(
                          "flex items-center gap-1 rounded bg-muted/50 px-1 py-1",
                          headerDropBefore && "border-t-2 border-t-sky-600",
                          headerDropAfter && "border-b-2 border-b-sky-600"
                        )}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          if (isCollapsed) {
                            const placement = computePlacement(event);
                            setDropIndicator({
                              kind: "item",
                              key: placement === "before" ? firstKey : lastKey,
                              placement,
                            });
                          } else {
                            setDropIndicator({
                              kind: "item",
                              key: firstKey,
                              placement: "before",
                            });
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (isCollapsed) {
                            const placement = computePlacement(event);
                            applyDropOnItem(
                              placement === "before" ? firstKey : lastKey,
                              group.label,
                              placement
                            );
                          } else {
                            applyDropOnItem(firstKey, group.label, "before");
                          }
                        }}
                      >
                        <button
                          type="button"
                          draggable
                          aria-label={t("sheets.settings.dragGroup")}
                          className="cursor-grab rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                          onDragStart={startGroupDrag}
                          onDragEnd={endDrag}
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={allOn}
                            disabled={visibleCandidates.length === 0}
                            ref={(el) => {
                              if (el) el.indeterminate = !allOn && !allOff;
                            }}
                            onChange={() => toggleGroupHidden(group.cols, !allOn)}
                          />
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate",
                              isCollapsed && "cursor-grab active:cursor-grabbing"
                            )}
                            draggable={isCollapsed}
                            title={isCollapsed ? t("sheets.settings.dragGroup") : undefined}
                            onDragStart={(event) => {
                              if (!isCollapsed) return;
                              startGroupDrag(event);
                            }}
                            onDragEnd={endDrag}
                          >
                            {group.label || ungroupedLabel}
                          </span>
                          {isCollapsed && (
                            <span className="shrink-0 text-xs font-normal text-muted-foreground">
                              {group.cols.length}
                            </span>
                          )}
                        </label>
                        {deletableCustomGroup?.can_delete && (
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={t("sheets.customColumns.deleteGroupButton")}
                            title={t("sheets.customColumns.deleteGroupButton")}
                            className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                            onClick={() => setPendingDeleteGroup(deletableCustomGroup)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-expanded={!isCollapsed}
                          aria-label={
                            isCollapsed
                              ? t("sheets.settings.expandGroup")
                              : t("sheets.settings.collapseGroup")
                          }
                          title={
                            isCollapsed
                              ? t("sheets.settings.expandGroup")
                              : t("sheets.settings.collapseGroup")
                          }
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setCollapsed((prev) => {
                              const next = new Set(prev);
                              if (next.has(firstKey)) next.delete(firstKey);
                              else next.add(firstKey);
                              return next;
                            })
                          }
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      {!isCollapsed && (
                        <div className="space-y-0.5 pl-4">
                          {group.cols.map((col) => {
                            const dropBefore =
                              dropIndicator?.kind === "item" &&
                              dropIndicator.key === col.key &&
                              dropIndicator.placement === "before";
                            const dropAfter =
                              dropIndicator?.kind === "item" &&
                              dropIndicator.key === col.key &&
                              dropIndicator.placement === "after";
                            const colLabel = flatColumnLabel(col.label);
                            return (
                              <div
                                key={col.key}
                                className={cn(
                                  "flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted",
                                  col.hidden_for_all && "opacity-60",
                                  dropBefore && "border-t-2 border-t-sky-600",
                                  dropAfter && "border-b-2 border-b-sky-600"
                                )}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = "move";
                                  setDropIndicator({
                                    kind: "item",
                                    key: col.key,
                                    placement: computePlacement(event),
                                  });
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  applyDropOnItem(col.key, group.label, computePlacement(event));
                                }}
                              >
                                <button
                                  type="button"
                                  draggable
                                  aria-label={t("sheets.settings.dragColumn")}
                                  className="cursor-grab rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                                  onDragStart={(event) =>
                                    beginDrag(
                                      {
                                        kind: "column",
                                        key: col.key,
                                        group: group.label,
                                        label: colLabel,
                                      },
                                      event
                                    )
                                  }
                                  onDragEnd={endDrag}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                                <label
                                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm"
                                  title={col.help || colLabel}
                                >
                                  <input
                                    type="checkbox"
                                    checked={!col.hidden_for_all && !hidden.has(col.key)}
                                    disabled={Boolean(col.hidden_for_all)}
                                    onChange={() => toggleColumnHidden(col.key)}
                                  />
                                  <span className="truncate">{colLabel}</span>
                                </label>
                                {col.is_custom && (
                                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {col.hidden_for_all
                                      ? t("sheets.customColumns.hiddenBadge")
                                      : t("sheets.customColumns.customBadge")}
                                  </span>
                                )}
                                {col.is_custom && canManageColumns && (
                                  <div className="flex shrink-0 items-center gap-0.5">
                                    <button
                                      type="button"
                                      disabled={busy}
                                      className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                      title={
                                        col.hidden_for_all
                                          ? t("sheets.customColumns.showForAll")
                                          : t("sheets.customColumns.hideForAll")
                                      }
                                      aria-label={
                                        col.hidden_for_all
                                          ? t("sheets.customColumns.showForAll")
                                          : t("sheets.customColumns.hideForAll")
                                      }
                                      onClick={() => void toggleHiddenForAll(col)}
                                    >
                                      {col.hidden_for_all ? (
                                        <EyeOff className="h-3.5 w-3.5" />
                                      ) : (
                                        <Eye className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                                      title={t("sheets.customColumns.editColumnButton")}
                                      aria-label={t("sheets.customColumns.editColumnButton")}
                                      onClick={() => {
                                        setCustomDialogMode({
                                          kind: "edit-column",
                                          column: {
                                            key: col.key,
                                            label: col.label,
                                            group: col.group ?? "",
                                            raw_group: col.raw_group,
                                            help: col.help,
                                            kind: col.kind,
                                            edit_roles: col.edit_roles,
                                            can_delete: col.can_delete,
                                          },
                                        });
                                        setCustomDialogOpen(true);
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {emptyCustomGroups.map((grp) => {
                  const isOver =
                    dropIndicator?.kind === "emptyGroup" && dropIndicator.name === grp.name;
                  return (
                    <div
                      key={`empty-group:${grp.id}`}
                      className={cn(
                        "rounded border border-dashed bg-muted/30 px-2 py-1.5 text-sm",
                        isOver && "ring-2 ring-sky-600"
                      )}
                      onDragOver={(event) => {
                        if (dragRef.current?.kind !== "column") return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDropIndicator({ kind: "emptyGroup", name: grp.name });
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        applyDropOnEmptyGroup(grp.name);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2 font-medium">
                          {grp.color && (
                            <span
                              className="inline-block h-3 w-3 shrink-0 rounded-sm border border-black/20"
                              style={{ backgroundColor: grp.color }}
                            />
                          )}
                          <span className="truncate">{grp.name}</span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {t("sheets.customColumns.emptyGroupHint")}
                          </span>
                          {canManageColumns && grp.can_delete && (
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={t("sheets.customColumns.deleteGroupButton")}
                              title={t("sheets.customColumns.deleteGroupButton")}
                              className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
                              onClick={() => setPendingDeleteGroup(grp)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("sheets.settings.layoutSection")}</h3>
              <p className="text-xs text-muted-foreground">{t("sheets.settings.layoutHint")}</p>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={resetWidths}
                >
                  {t("sheets.settings.resetWidthsButton")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void syncFromDefault()}
                >
                  {t("sheets.settings.syncButton")}
                </Button>
                {isAdmin && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setConfirmDefault(true)}
                  >
                    {t("sheets.settings.publishButton")}
                  </Button>
                )}
              </div>
            </section>

            {canEditMailDeadlines && (
              <section className="space-y-2">
                <h3 className="text-sm font-medium">{t("sheets.settings.mailDeadlines.title")}</h3>
                <p className="text-xs text-muted-foreground">{t("sheets.settings.mailDeadlines.hint")}</p>
                <div className="space-y-2">
                  {MAIL_IDS.map((id) => (
                    <label key={id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {t(`sheets.settings.mailDeadlines.mail${id}`)}
                      </span>
                      <input
                        type="date"
                        value={mailDates[id] ?? ""}
                        onChange={(event) => {
                          const nextDates = { ...mailDates, [id]: event.target.value };
                          pushHistory({
                            kind: "mail_dates",
                            before: { ...mailDates },
                            after: nextDates,
                          });
                          setMailDates(nextDates);
                        }}
                        className="h-8 rounded border bg-background px-2 text-sm"
                      />
                    </label>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={mailBusy || !mailDatesComplete}
                  onClick={() => void saveMailDeadlines()}
                >
                  {t("sheets.settings.mailDeadlines.save")}
                </Button>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDrop)} onOpenChange={(next) => !next && setPendingDrop(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("sheets.settings.crossGroupTitle")}</DialogTitle>
            <DialogDescription>
              {t("sheets.settings.crossGroupBody", {
                column: pendingDrop?.colLabel ?? "",
                source: pendingDrop?.sourceGroup || ungroupedLabel,
                target: pendingDrop?.targetGroup || ungroupedLabel,
              })}
            </DialogDescription>
          </DialogHeader>

          {pendingDrop && (
            <div className="space-y-3 text-sm">
              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5">
                <input
                  type="radio"
                  name="cross-group-choice"
                  checked={dropChoice === "target"}
                  onChange={() => setDropChoice("target")}
                  className="mt-0.5"
                />
                <span>
                  {t("sheets.settings.crossGroupOptionTarget", {
                    target: pendingDrop.targetGroup || ungroupedLabel,
                  })}
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5">
                <input
                  type="radio"
                  name="cross-group-choice"
                  checked={dropChoice === "keep"}
                  onChange={() => setDropChoice("keep")}
                  className="mt-0.5"
                />
                <span>
                  {t("sheets.settings.crossGroupOptionKeep", {
                    source: pendingDrop.sourceGroup || ungroupedLabel,
                  })}
                </span>
              </label>

              <div className="space-y-2 rounded-md border p-2.5">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="cross-group-choice"
                    checked={dropChoice === "other"}
                    onChange={() => setDropChoice("other")}
                    className="mt-0.5"
                  />
                  <span>{t("sheets.settings.crossGroupOptionOther")}</span>
                </label>

                {dropChoice === "other" && (
                  <div className="space-y-2 pl-6">
                    <select
                      value={otherGroupChoice}
                      onChange={(e) => setOtherGroupChoice(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    >
                      <option value="">{ungroupedLabel}</option>
                      {existingGroupOptions.map((opt) => (
                        <option key={opt.value} value={opt.label}>
                          {opt.label}
                        </option>
                      ))}
                      <option value={NEW_LOCAL_GROUP_SENTINEL}>
                        {t("sheets.customColumns.newGroupOption")}
                      </option>
                    </select>
                    {otherGroupChoice === NEW_LOCAL_GROUP_SENTINEL && (
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {t("sheets.customColumns.newGroupNameLabel")}
                        </Label>
                        <Input
                          value={otherNewGroup}
                          maxLength={120}
                          placeholder={t("sheets.customColumns.newGroupNamePlaceholder")}
                          onChange={(e) => setOtherNewGroup(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {(dropChoice === "target" || dropChoice === "keep") && (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={rememberChoice}
                    onChange={(e) => setRememberChoice(e.target.checked)}
                  />
                  <span>{t("sheets.settings.crossGroupRemember")}</span>
                </label>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDrop(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={confirmPendingCrossGroupDrop}>
              {t("sheets.settings.crossGroupApply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDefault} onOpenChange={setConfirmDefault}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sheets.settings.publishConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("sheets.settings.publishConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmDefault(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void publishDefault()}>
              {t("sheets.settings.publishConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDeleteGroup)}
        onOpenChange={(next) => {
          if (!next && !busy) setPendingDeleteGroup(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sheets.customColumns.deleteGroupConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("sheets.customColumns.deleteGroupConfirmBody", {
                name: pendingDeleteGroup?.name ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPendingDeleteGroup(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDeleteGroup()}
            >
              {t("sheets.customColumns.deleteGroupConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SheetCustomColumnDialog
        open={customDialogOpen}
        onOpenChange={setCustomDialogOpen}
        mode={customDialogMode}
        sheetKey={sheetKey}
        tabKey={tabKey}
        existingGroups={existingGroupOptions}
        customGroupColors={customGroupColors}
        onSaved={async () => {
          if (
            customDialogMode?.kind === "edit-column" &&
            Object.prototype.hasOwnProperty.call(groupOverrides, customDialogMode.column.key)
          ) {
            const nextGroups = { ...groupOverrides };
            delete nextGroups[customDialogMode.column.key];
            onSetGroupOverrides(nextGroups);
          }
          await onColumnsMutated?.();
        }}
        onDeleted={async (deletedKey) => {
          if (hidden.has(deletedKey)) {
            onSetHidden([...hidden].filter((k) => k !== deletedKey));
          }
          const currentOrder = getColumnOrder();
          if (currentOrder.includes(deletedKey)) {
            onReorder(currentOrder.filter((k) => k !== deletedKey));
          }
          if (Object.prototype.hasOwnProperty.call(groupOverrides, deletedKey)) {
            const nextGroups = { ...groupOverrides };
            delete nextGroups[deletedKey];
            onSetGroupOverrides(nextGroups);
          }
          pastRef.current = pastRef.current.filter(
            (entry) => !(entry.kind === "custom_visibility" && entry.columnKey === deletedKey)
          );
          futureRef.current = futureRef.current.filter(
            (entry) => !(entry.kind === "custom_visibility" && entry.columnKey === deletedKey)
          );
          syncHistoryCounts();
          await onColumnsMutated?.();
        }}
      />
    </>
  );
}
