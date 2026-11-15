"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { getFileUrl } from "@/components/staff/StageViewer/utils";
import { coerceInput, displayText, isFileValue } from "@/lib/sheets/format";
import type { CellEdit } from "@/hooks/useSheetEdits";
import type { SheetColumn, SheetRow } from "@/lib/sheets/types";

export interface PreviewFocus {
  companyId: number;
  columnKey: string;
  row: SheetRow;
  column: SheetColumn;
}

interface SheetPreviewBarProps {
  focus: PreviewFocus | null;
  onEdit: (edits: CellEdit[]) => void;
}

export function SheetPreviewBar({ focus, onEdit }: SheetPreviewBarProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = React.useState("");

  React.useEffect(() => {
    if (!focus) {
      setDraft("");
      return;
    }
    const value = focus.row.cells[focus.column.key];
    if (focus.column.kind === "select" || focus.column.kind === "user_select") {
      setDraft(value === null || value === undefined ? "" : String(value));
    } else {
      setDraft(displayText(focus.column, value));
    }
  }, [focus]);

  if (!focus) {
    return (
      <div className="rounded border border-dashed px-3 py-2 text-xs text-muted-foreground">
        {t("sheets.preview.empty")}
      </div>
    );
  }

  const { column, row } = focus;
  const canType =
    column.editable &&
    (column.kind === "text" ||
      column.kind === "longtext" ||
      column.kind === "number" ||
      column.kind === "time" ||
      column.kind === "date");
  const value = row.cells[column.key];

  const commitPreview = () => {
    if (!canType) return;
    onEdit([{ companyId: row.company_id, columnKey: column.key, value: coerceInput(column, draft) }]);
  };

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
      ) : canType ? (
        column.kind === "longtext" ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitPreview}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitPreview();
              }
            }}
            className="min-h-16 w-full rounded border bg-background px-2 py-1 text-sm"
          />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitPreview}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitPreview();
              }
            }}
            className="h-8"
          />
        )
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{displayText(column, value) || "—"}</p>
      )}
    </div>
  );
}
