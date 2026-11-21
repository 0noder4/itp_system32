"use client";

import React from "react";
import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { getFileUrl } from "@/components/staff/StageViewer/utils";
import type { SheetColumn, SheetFileValue } from "@/lib/sheets/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface SheetMediaCellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetKey: string;
  tabKey: string;
  companyId: number | null;
  companyName: string;
  column: SheetColumn | null;
  files: SheetFileValue[];
  onChanged: () => Promise<void> | void;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

function formatBytes(size?: number): string {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
}

export function SheetMediaCellDialog({
  open,
  onOpenChange,
  sheetKey,
  tabKey,
  companyId,
  companyName,
  column,
  files,
  onChanged,
}: SheetMediaCellDialogProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  if (!column || companyId == null) return null;

  const editable = Boolean(column.editable);

  const uploadFiles = async (selected: FileList | File[]) => {
    const list = Array.from(selected);
    if (list.length === 0 || !editable || busy) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("company_id", String(companyId));
      formData.append("column_key", column.key);
      for (const file of list) {
        formData.append("files", file);
      }
      await apiClient.post(`/api/sheets/${sheetKey}/${tabKey}/cells/media/`, formData);
      toast.success(t("sheets.media.uploadSuccess"));
      if (inputRef.current) inputRef.current.value = "";
      await onChanged();
    } catch (error: unknown) {
      const errData = (error as { response?: { data?: { detail?: string; errors?: { detail?: string }[] } } })
        ?.response?.data;
      toast.error(String(errData?.errors?.[0]?.detail || errData?.detail || t("sheets.media.uploadError")));
    } finally {
      setBusy(false);
    }
  };

  const deleteFile = async (fileId: string) => {
    if (!editable || busy || !fileId) return;
    setBusy(true);
    try {
      await apiClient.delete(`/api/sheets/${sheetKey}/${tabKey}/cells/media/`, {
        data: {
          company_id: companyId,
          column_key: column.key,
          file_id: fileId,
        },
      });
      toast.success(t("sheets.media.deleteSuccess"));
      await onChanged();
    } catch (error: unknown) {
      const errData = (error as { response?: { data?: { detail?: string; errors?: { detail?: string }[] } } })
        ?.response?.data;
      toast.error(String(errData?.errors?.[0]?.detail || errData?.detail || t("sheets.media.deleteError")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{column.label.replace(/\n/g, " · ")}</DialogTitle>
          <DialogDescription>
            {companyName}
            {column.help ? ` — ${column.help}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {files.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              {t("sheets.media.empty")}
            </p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {files.map((file, idx) => {
                const href = getFileUrl(file.url) ?? file.url;
                const isImage = IMAGE_EXT_RE.test(file.name);
                const sizeText = formatBytes(file.size);
                return (
                  <li
                    key={file.id ?? `${file.url}-${idx}`}
                    className="flex items-center gap-3 rounded-md border bg-muted/20 p-2 text-sm"
                  >
                    {isImage && href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="shrink-0">
                        <img
                          src={href}
                          alt={file.name}
                          className="h-10 w-10 rounded border object-cover"
                        />
                      </a>
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{file.name}</p>
                      {sizeText && <p className="text-xs text-muted-foreground">{sizeText}</p>}
                    </div>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-sky-700 hover:bg-muted dark:text-sky-400"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {t("sheets.media.open")}
                      </a>
                    )}
                    {editable && file.id && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={busy}
                        title={t("sheets.media.deleteFile")}
                        aria-label={t("sheets.media.deleteFile")}
                        onClick={() => void deleteFile(file.id!)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {editable && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) {
                  void uploadFiles(e.dataTransfer.files);
                }
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-md border border-dashed p-4 text-center transition-colors",
                dragOver && "border-foreground bg-muted/40"
              )}
            >
              <Upload className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t("sheets.media.dropHint")}</p>
              <input
                ref={inputRef}
                type="file"
                multiple
                disabled={busy}
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void uploadFiles(e.target.files);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                {t("sheets.media.addButton")}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            {t("sheets.comments.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
