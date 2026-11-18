"use client";

import React from "react";
import { ChevronDown, ChevronRight, GripVertical, History, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { getUserType, hasStaffRole } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { moveColumnBlock, reorderColumnKeys } from "@/lib/sheets/columnOrder";
import { flatColumnLabel } from "@/lib/sheets/columnWidths";
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
import { cn } from "@/lib/utils";

interface SettingsColumn {
  key: string;
  label: string;
  group?: string;
}

interface SheetSettingsDialogProps {
  sheetKey: string;
  tabKey: string;
  columns: SettingsColumn[];
  hidden: Set<string>;
  onToggleHidden: (key: string) => void;
  onSetHidden: (keys: string[]) => void;
  onReorder: (keys: string[]) => void;
  getColumnOrder: () => string[];
  getColumnWidths: () => Record<string, number>;
  applyColumnWidths: (widths: Record<string, number>) => void;
  hiddenCount: number;
  frozenColumns: number;
  onOpenHistory: () => void;
  onMailDeadlinesSaved?: () => void;
}

type DragState =
  | { kind: "column"; key: string }
  | { kind: "group"; keys: string[] };

const MAIL_IDS = ["1", "2", "3", "4", "5"] as const;

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

export function SheetSettingsDialog({
  sheetKey,
  tabKey,
  columns,
  hidden,
  onToggleHidden,
  onSetHidden,
  onReorder,
  getColumnOrder,
  getColumnWidths,
  applyColumnWidths,
  hiddenCount,
  frozenColumns,
  onOpenHistory,
  onMailDeadlinesSaved,
}: SheetSettingsDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [confirmDefault, setConfirmDefault] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [mailDates, setMailDates] = React.useState<Record<string, string>>({});
  const [mailBusy, setMailBusy] = React.useState(false);
  const [overKey, setOverKey] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const dragRef = React.useRef<DragState | null>(null);
  const isAdmin = getUserType() === "admin";
  const canEditMailDeadlines = hasStaffRole("fr") || hasStaffRole("lg");
  const groups = React.useMemo(() => consecutiveGroups(columns), [columns]);
  const orderKeys = React.useMemo(() => columns.slice(1).map((col) => col.key), [columns]);

  React.useEffect(() => {
    if (!open || !canEditMailDeadlines) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await apiClient.get<{ dates: Record<string, string> }>("/api/sheets/mail-deadlines/");
        if (!cancelled) setMailDates(data.dates || {});
      } catch {
        if (!cancelled) toast.error(t("sheets.settings.mailDeadlines.loadError"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, canEditMailDeadlines, t]);

  const toggleGroup = (cols: SettingsColumn[], show: boolean) => {
    const next = new Set(hidden);
    for (const col of cols) {
      if (show) next.delete(col.key);
      else next.add(col.key);
    }
    onSetHidden([...next]);
  };

  const endDrag = () => {
    dragRef.current = null;
    setOverKey(null);
  };

  const beginDrag = (next: DragState, event: React.DragEvent) => {
    dragRef.current = next;
    event.dataTransfer.setData("text/plain", next.kind === "column" ? next.key : next.keys[0] ?? "");
    event.dataTransfer.effectAllowed = "move";
  };

  const applyDrop = (targetKey: string) => {
    const current = dragRef.current;
    if (!current || !targetKey) return;
    const next =
      current.kind === "column"
        ? reorderColumnKeys(orderKeys, current.key, targetKey)
        : moveColumnBlock(orderKeys, current.keys, targetKey);
    endDrag();
    if (next !== orderKeys) onReorder(next);
  };

  const syncFromDefault = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.get<{
        column_widths: Record<string, number>;
        hidden_by_tab?: Record<string, string[]>;
        column_order_by_tab?: Record<string, string[]>;
      }>(`/api/sheets/${sheetKey}/layout/`);
      const widths = data.column_widths || {};
      const hiddenKeys = data.hidden_by_tab?.[tabKey];
      const orderKeysFromDefault = data.column_order_by_tab?.[tabKey];
      if (
        Object.keys(widths).length === 0 &&
        (!hiddenKeys || hiddenKeys.length === 0) &&
        (!orderKeysFromDefault || orderKeysFromDefault.length === 0)
      ) {
        toast.message(t("sheets.settings.noDefaultLayout"));
        return;
      }
      if (Object.keys(widths).length > 0) applyColumnWidths(widths);
      if (hiddenKeys) onSetHidden(hiddenKeys);
      if (orderKeysFromDefault && orderKeysFromDefault.length > 0) onReorder(orderKeysFromDefault);
      toast.success(t("sheets.settings.syncSuccess"));
      setOpen(false);
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

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirmDefault(false);
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
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("sheets.settings.title")}</DialogTitle>
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
              <h3 className="text-sm font-medium">{t("sheets.columns")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("sheets.settings.freezeInfo", { count: frozenColumns })}
              </p>
              <p className="text-xs text-muted-foreground">{t("sheets.settings.reorderHint")}</p>
              <div className="max-h-64 space-y-3 overflow-auto rounded border p-2">
                {groups.map((group) => {
                  const visibleCount = group.cols.filter((c) => !hidden.has(c.key)).length;
                  const allOn = visibleCount === group.cols.length;
                  const allOff = visibleCount === 0;
                  const firstKey = group.cols[0]?.key ?? "";
                  const isCollapsed = collapsed.has(firstKey);
                  const groupKeys = group.cols.map((col) => col.key);
                  const startGroupDrag = (event: React.DragEvent) =>
                    beginDrag({ kind: "group", keys: groupKeys }, event);
                  return (
                    <div key={`${group.label}:${firstKey}`} className="space-y-1">
                      <div
                        className={cn(
                          "flex items-center gap-1 rounded bg-muted/50 px-1 py-1",
                          overKey === firstKey && "ring-1 ring-foreground/40",
                        )}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setOverKey(firstKey);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          applyDrop(firstKey);
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
                            ref={(el) => {
                              if (el) el.indeterminate = !allOn && !allOff;
                            }}
                            onChange={() => toggleGroup(group.cols, !allOn)}
                          />
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate",
                              isCollapsed && "cursor-grab active:cursor-grabbing",
                            )}
                            draggable={isCollapsed}
                            title={isCollapsed ? t("sheets.settings.dragGroup") : undefined}
                            onDragStart={(event) => {
                              if (!isCollapsed) return;
                              startGroupDrag(event);
                            }}
                            onDragEnd={endDrag}
                          >
                            {group.label || t("sheets.settings.ungrouped")}
                          </span>
                          {isCollapsed && (
                            <span className="shrink-0 text-xs font-normal text-muted-foreground">
                              {group.cols.length}
                            </span>
                          )}
                        </label>
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
                        {group.cols.map((col) => (
                          <div
                            key={col.key}
                            className={cn(
                              "flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted",
                              overKey === col.key && "ring-1 ring-foreground/40",
                            )}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                              setOverKey(col.key);
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              applyDrop(col.key);
                            }}
                          >
                            <button
                              type="button"
                              draggable
                              aria-label={t("sheets.settings.dragColumn")}
                              className="cursor-grab rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                              onDragStart={(event) => beginDrag({ kind: "column", key: col.key }, event)}
                              onDragEnd={endDrag}
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={!hidden.has(col.key)}
                                onChange={() => onToggleHidden(col.key)}
                              />
                              <span className="truncate">{flatColumnLabel(col.label)}</span>
                            </label>
                          </div>
                        ))}
                      </div>
                      )}
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
                  onClick={syncFromDefault}
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
                      <span className="min-w-0 truncate">{t(`sheets.settings.mailDeadlines.mail${id}`)}</span>
                      <input
                        type="date"
                        value={mailDates[id] ?? ""}
                        onChange={(event) =>
                          setMailDates((prev) => ({ ...prev, [id]: event.target.value }))
                        }
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

      <Dialog open={confirmDefault} onOpenChange={setConfirmDefault}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sheets.settings.publishConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("sheets.settings.publishConfirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmDefault(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={busy} onClick={publishDefault}>
              {t("sheets.settings.publishConfirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
