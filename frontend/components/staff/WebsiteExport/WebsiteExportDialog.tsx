"use client";

import React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { apiClient, fetcher } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CataloguePreview,
  CataloguePreviewPayload,
} from "./CataloguePreview";

const BATCH_SIZE = 10;
const CATALOGUE_URL = "https://targipracy.org.pl/catalogue";

type PreviewCompany = {
  company_id: number;
  name: string | null;
  status: "ready" | "unchanged" | "skipped" | "missing";
  skip_reason: string | null;
  changed_since_export: boolean;
  last_exported_at: string | null;
  last_error: string;
  jobs_removed?: string[];
  payload: CataloguePreviewPayload | null;
};

type PreviewResponse = {
  hall_map: {
    day1?: import("@/lib/mapLayout").MapDayLayout;
    day2?: import("@/lib/mapLayout").MapDayLayout;
  };
  companies: PreviewCompany[];
  catalogue_url?: string;
};

type ExportResultRow = {
  company_id: number;
  name: string | null;
  ok: boolean;
  skipped: boolean;
  reason: string | null;
  strapi_document_id: string | null;
};

export type WebsiteExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyIds: number[];
  /** After stage-4 accept: softer copy + “not now”. */
  mode?: "panel" | "afterAccept";
  onSuccess?: () => void;
};

export function WebsiteExportDialog({
  open,
  onOpenChange,
  companyIds,
  mode = "panel",
  onSuccess,
}: WebsiteExportDialogProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });

  const idsKey = companyIds.join(",");
  const { data, error, isLoading, mutate } = useSWR<PreviewResponse>(
    open && companyIds.length
      ? `/api/website-export/catalogue/preview/?${companyIds
          .map((id) => `company_ids=${id}`)
          .join("&")}`
      : null,
    fetcher
  );

  React.useEffect(() => {
    if (!open) {
      setShowConfirm(false);
      setIsExporting(false);
      setSelectedId(null);
      setProgress({ done: 0, total: 0 });
      return;
    }
    if (data?.companies?.length && selectedId == null) {
      const firstReady =
        data.companies.find((c) => c.payload)?.company_id ??
        data.companies[0]?.company_id ??
        null;
      setSelectedId(firstReady);
    }
  }, [open, data, selectedId]);

  React.useEffect(() => {
    setSelectedId(null);
  }, [idsKey]);

  const selected = data?.companies.find((c) => c.company_id === selectedId);
  const exportableIds =
    data?.companies
      .filter((c) => c.status === "ready")
      .map((c) => c.company_id) ?? [];

  const statusLabel = (row: PreviewCompany) => {
    if (row.status === "ready") return t("websiteExport.status.ready");
    if (row.status === "unchanged") return t("websiteExport.status.unchanged");
    if (row.status === "missing") return t("websiteExport.status.missing");
    const reasonKey = row.skip_reason
      ? `websiteExport.skipReason.${row.skip_reason}`
      : "";
    const reason = reasonKey ? t(reasonKey) : "";
    const reasonText =
      reason && reason !== reasonKey ? reason : row.skip_reason || "";
    return `${t("websiteExport.status.skipped")}${
      reasonText ? `: ${reasonText}` : ""
    }`;
  };

  const handleClose = (next: boolean) => {
    if (isExporting) return;
    if (!next) setShowConfirm(false);
    onOpenChange(next);
  };

  const runExport = async () => {
    if (!exportableIds.length) return;
    setIsExporting(true);
    const batches: number[][] = [];
    for (let i = 0; i < exportableIds.length; i += BATCH_SIZE) {
      batches.push(exportableIds.slice(i, i + BATCH_SIZE));
    }
    setProgress({ done: 0, total: exportableIds.length });
    let okCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    try {
      for (const batch of batches) {
        const response = await apiClient.post(
          "/api/website-export/catalogue/",
          { company_ids: batch }
        );
        const rows: ExportResultRow[] = response.data?.results ?? [];
        for (const row of rows) {
          if (row.skipped) skippedCount += 1;
          else if (row.ok) okCount += 1;
          else failCount += 1;
        }
        if (response.data?.hall_map && !response.data.hall_map.ok) {
          toast.warning(t("websiteExport.hallMapWarning"));
        }
        setProgress((p) => ({
          ...p,
          done: Math.min(p.total, p.done + batch.length),
        }));
      }
      if (okCount > 0) {
        toast.success(t("websiteExport.success"), {
          description: t("websiteExport.successDescription", {
            ok: okCount,
            failed: failCount,
            skipped: skippedCount,
          }),
        });
      } else if (failCount > 0) {
        toast.error(t("websiteExport.error"), {
          description: t("websiteExport.errorDescription"),
        });
      } else {
        toast.info(t("websiteExport.noneExported"), {
          description: t("websiteExport.noneExportedDescription", {
            skipped: skippedCount,
          }),
        });
      }
      setShowConfirm(false);
      onOpenChange(false);
      onSuccess?.();
      mutate();
    } catch (error: unknown) {
      const err = error as { response?: { status?: number } };
      toast.error(t("websiteExport.error"), {
        description:
          err.response?.status === 503
            ? t("websiteExport.configError")
            : t("websiteExport.errorDescription"),
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[min(1000px,95vw)] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "afterAccept"
                ? t("websiteExport.afterAcceptTitle")
                : t("websiteExport.dialogTitle")}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {mode === "afterAccept"
                    ? t("websiteExport.afterAcceptDescription")
                    : t("websiteExport.dialogDescription")}
                </p>
                <p>
                  {t("websiteExport.catalogueLinkBefore")}{" "}
                  <a
                    href={CATALOGUE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: STAFF_ACCENT_COLOR }}
                  >
                    {t("websiteExport.catalogueLinkLabel")}
                  </a>
                  {t("websiteExport.catalogueLinkAfter")}
                </p>
                {mode === "afterAccept" ? (
                  <p>{t("websiteExport.afterAcceptLaterHint")}</p>
                ) : null}
              </div>
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t("websiteExport.loadingPreview")}
            </p>
          ) : error ? (
            <p className="text-sm text-destructive">
              {t("websiteExport.previewError")}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="max-h-40 overflow-y-auto rounded-md border">
                <ul className="divide-y text-sm">
                  {(data?.companies ?? []).map((row) => (
                    <li key={row.company_id}>
                      <button
                        type="button"
                        className={`flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50 ${
                          selectedId === row.company_id ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedId(row.company_id)}
                      >
                        <span className="font-medium">
                          {row.name || `#${row.company_id}`}
                        </span>
                        <span className="text-xs text-muted-foreground text-right">
                          {statusLabel(row)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {selected?.payload ? (
                <CataloguePreview
                  payload={selected.payload}
                  hallMap={data?.hall_map}
                  jobsRemoved={selected.jobs_removed}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("websiteExport.noPreviewPayload")}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {mode === "afterAccept" ? (
              <Button
                type="button"
                variant="outline"
                disabled={isExporting}
                onClick={() => onOpenChange(false)}
              >
                {t("websiteExport.notNow")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={isExporting}
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
            )}
            <Button
              type="button"
              disabled={isExporting || exportableIds.length === 0}
              style={{
                backgroundColor:
                  isExporting || exportableIds.length === 0
                    ? undefined
                    : STAFF_ACCENT_COLOR,
              }}
              onClick={() => setShowConfirm(true)}
            >
              {t("websiteExport.continueButton", {
                count: exportableIds.length,
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showConfirm}
        onOpenChange={(next) => {
          if (isExporting) return;
          setShowConfirm(next);
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("websiteExport.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("websiteExport.confirmDescription", {
                count: exportableIds.length,
              })}
            </DialogDescription>
          </DialogHeader>
          {isExporting ? (
            <p className="text-sm text-muted-foreground">
              {t("websiteExport.progress", {
                done: progress.done,
                total: progress.total,
              })}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isExporting}
              onClick={() => setShowConfirm(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={isExporting}
              style={{
                backgroundColor: isExporting ? undefined : STAFF_ACCENT_COLOR,
              }}
              onClick={runExport}
            >
              {t("websiteExport.confirmSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
