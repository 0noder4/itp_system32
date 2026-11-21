"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { getFileUrl } from "@/components/staff/StageViewer/utils";
import { displayText, extractFiles } from "@/lib/sheets/format";
import type { SheetColumn, SheetRow } from "@/lib/sheets/types";

export interface PreviewFocus {
  companyId: number;
  columnKey: string;
  row: SheetRow;
  column: SheetColumn;
}

interface SheetPreviewBarProps {
  focus: PreviewFocus | null;
  onOpenMediaCell?: (row: SheetRow, column: SheetColumn) => void;
}

export function SheetPreviewBar({ focus, onOpenMediaCell }: SheetPreviewBarProps) {
  const { t } = useTranslation();

  if (!focus) {
    return (
      <div className="rounded border border-dashed px-3 py-2 text-xs text-muted-foreground">
        {t("sheets.preview.empty")}
      </div>
    );
  }

  const { column, row } = focus;
  const value = row.cells[column.key];
  const files = column.kind === "file_link" ? extractFiles(value) : [];

  return (
    <div className="space-y-1 rounded border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">{column.label.replace(/\n/g, " · ")}</span>
        {column.kind === "file_link" && column.is_custom && onOpenMediaCell && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => onOpenMediaCell(row, column)}
          >
            {column.editable ? t("sheets.media.manageButton") : t("sheets.media.viewButton")}
          </Button>
        )}
      </div>
      {column.kind === "file_link" ? (
        files.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {files.map((file, idx) => {
              const href = file.url.startsWith("/api/") ? null : getFileUrl(file.url);
              return (
                <span key={file.id ?? `${file.url}-${idx}`} className="inline-flex items-center gap-1.5">
                  <span className="truncate">{file.name}</span>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sky-700 underline dark:text-sky-400"
                    >
                      {t("sheets.preview.openFile")}
                    </a>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{displayText(column, value) || "—"}</p>
      )}
    </div>
  );
}
