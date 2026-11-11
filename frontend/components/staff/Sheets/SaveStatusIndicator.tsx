"use client";

import { AlertCircle, Check, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { SaveStatus } from "@/hooks/useSheetEdits";

export function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  const { t } = useTranslation();
  const base = "flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap";
  switch (status) {
    case "idle":
      return null;
    case "saving":
      return (
        <span className={base}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("sheets.status.saving")}
        </span>
      );
    case "saved":
      return (
        <span className={base}>
          <Check className="h-3.5 w-3.5 text-emerald-600" />
          {t("sheets.status.saved")}
        </span>
      );
    case "retrying":
      return (
        <span className={`${base} text-amber-700`}>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          {t("sheets.status.retrying")}
        </span>
      );
    case "error":
      return (
        <span className={`${base} text-destructive`}>
          <AlertCircle className="h-3.5 w-3.5" />
          {t("sheets.status.error")}
        </span>
      );
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}
