"use client";

import React from "react";
import { History, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { getUserType } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
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
import { flatColumnLabel } from "@/lib/sheets/columnWidths";

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
  getColumnWidths: () => Record<string, number>;
  applyColumnWidths: (widths: Record<string, number>) => void;
  hiddenCount: number;
  frozenColumns: number;
  onOpenHistory: () => void;
}

function groupColumns(columns: SettingsColumn[]) {
  const groups: { label: string; cols: SettingsColumn[] }[] = [];
  const index = new Map<string, number>();
  for (const col of columns.slice(1)) {
    const label = col.group?.trim() || "";
    let i = index.get(label);
    if (i === undefined) {
      i = groups.length;
      index.set(label, i);
      groups.push({ label, cols: [] });
    }
    groups[i].cols.push(col);
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
  getColumnWidths,
  applyColumnWidths,
  hiddenCount,
  frozenColumns,
  onOpenHistory,
}: SheetSettingsDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [confirmDefault, setConfirmDefault] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const isAdmin = getUserType() === "admin";
  const groups = React.useMemo(() => groupColumns(columns), [columns]);

  const toggleGroup = (cols: SettingsColumn[], show: boolean) => {
    const next = new Set(hidden);
    for (const col of cols) {
      if (show) next.delete(col.key);
      else next.add(col.key);
    }
    onSetHidden([...next]);
  };

  const syncFromDefault = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.get<{
        column_widths: Record<string, number>;
        hidden_by_tab?: Record<string, string[]>;
      }>(`/api/sheets/${sheetKey}/layout/`);
      const widths = data.column_widths || {};
      const hiddenKeys = data.hidden_by_tab?.[tabKey];
      if (Object.keys(widths).length === 0 && (!hiddenKeys || hiddenKeys.length === 0)) {
        toast.message(t("sheets.settings.noDefaultLayout"));
        return;
      }
      if (Object.keys(widths).length > 0) applyColumnWidths(widths);
      if (hiddenKeys) onSetHidden(hiddenKeys);
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("sheets.settings.title")}</DialogTitle>
            <DialogDescription>{t("sheets.settings.description")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("sheets.columns")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("sheets.settings.freezeInfo", { count: frozenColumns })}
              </p>
              <div className="max-h-64 space-y-3 overflow-auto rounded border p-2">
                {groups.map((group) => {
                  const visibleCount = group.cols.filter((c) => !hidden.has(c.key)).length;
                  const allOn = visibleCount === group.cols.length;
                  const allOff = visibleCount === 0;
                  return (
                    <div key={group.label || "__ungrouped"} className="space-y-1">
                      <label className="flex cursor-pointer items-center gap-2 rounded bg-muted/50 px-2 py-1 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={allOn}
                          ref={(el) => {
                            if (el) el.indeterminate = !allOn && !allOff;
                          }}
                          onChange={() => toggleGroup(group.cols, !allOn)}
                        />
                        <span className="truncate">
                          {group.label || t("sheets.settings.ungrouped")}
                        </span>
                      </label>
                      <div className="space-y-0.5 pl-4">
                        {group.cols.map((col) => (
                          <label
                            key={col.key}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              checked={!hidden.has(col.key)}
                              onChange={() => onToggleHidden(col.key)}
                            />
                            <span className="truncate">{flatColumnLabel(col.label)}</span>
                          </label>
                        ))}
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
