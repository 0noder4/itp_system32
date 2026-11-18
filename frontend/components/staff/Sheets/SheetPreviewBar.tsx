"use client";

import { useTranslation } from "@/lib/i18n";
import { getFileUrl } from "@/components/staff/StageViewer/utils";
import { displayText, isFileValue } from "@/lib/sheets/format";
import type { SheetColumn, SheetRow } from "@/lib/sheets/types";

export interface PreviewFocus {
  companyId: number;
  columnKey: string;
  row: SheetRow;
  column: SheetColumn;
}

interface SheetPreviewBarProps {
  focus: PreviewFocus | null;
}

export function SheetPreviewBar({ focus }: SheetPreviewBarProps) {
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

  return (
    <div className="space-y-1 rounded border bg-muted/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">{column.label.replace(/\n/g, " · ")}</span>
      </div>
      {column.kind === "file_link" && isFileValue(value) ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate">{value.name}</span>
          {value.url.startsWith("/api/") ? null : getFileUrl(value.url) ? (
            <a
              href={getFileUrl(value.url)!}
              target="_blank"
              rel="noreferrer"
              className="text-sky-700 underline"
            >
              {t("sheets.preview.openFile")}
            </a>
          ) : null}
        </div>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{displayText(column, value) || "—"}</p>
      )}
    </div>
  );
}
