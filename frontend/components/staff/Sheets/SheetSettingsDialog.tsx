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

interface SheetSettingsDialogProps {
  sheetKey: string;
  columns: { key: string; label: string }[];
  hidden: Set<string>;
  onToggleHidden: (key: string) => void;
  getColumnWidths: () => Record<string, number>;
  applyColumnWidths: (widths: Record<string, number>) => void;
  hiddenCount: number;
  onOpenHistory: () => void;
}

export function SheetSettingsDialog({
  sheetKey,
  columns,
  hidden,
  onToggleHidden,
  getColumnWidths,
  applyColumnWidths,
  hiddenCount,
  onOpenHistory,
}: SheetSettingsDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [confirmDefault, setConfirmDefault] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const isAdmin = getUserType() === "admin";

  const syncFromDefault = async () => {
    setBusy(true);
    try {
      const { data } = await apiClient.get<{ column_widths: Record<string, number> }>(
        `/api/sheets/${sheetKey}/layout/`
      );
      const widths = data.column_widths || {};
      if (Object.keys(widths).length === 0) {
        toast.message(t("sheets.settings.noDefaultLayout"));
        return;
      }
      applyColumnWidths(widths);
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
              <div className="max-h-52 space-y-1 overflow-auto rounded border p-2">
                {columns.slice(1).map((col) => (
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
