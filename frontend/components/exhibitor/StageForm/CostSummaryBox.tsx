"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { CompanyCostSummary, parseMoney } from "@/lib/invoice-cost-utils";
import { cn } from "@/lib/utils";

interface CostSummaryBoxProps {
  summary: CompanyCostSummary | null;
  highlightStage?: 1 | 2 | 4 | 5;
  className?: string;
}

export function CostSummaryBox({
  summary,
  highlightStage,
  className,
}: CostSummaryBoxProps) {
  const { t, locale } = useTranslation();

  if (!summary) {
    return (
      <div
        className={cn(
          "rounded-md border border-muted bg-muted/30 p-3 text-sm text-muted-foreground",
          className
        )}
      >
        {t("exhibitor.form.costSummaryUnavailable")}
      </div>
    );
  }

  const bp = summary.base_package;
  const packageLabel = locale === "en" ? bp.package_label_en : bp.package_label_pl;
  const standDetailsParts: string[] = [];
  if (bp.stand_size_label) standDetailsParts.push(bp.stand_size_label);
  if (bp.days_count > 0) {
    standDetailsParts.push(
      bp.days_count === 1
        ? t("exhibitor.form.costSummaryOneDay")
        : t("exhibitor.form.costSummaryTwoDays")
    );
  }
  const standDescriptor = standDetailsParts.length
    ? `${packageLabel} (${standDetailsParts.join(", ")})`
    : packageLabel;

  const baseCost = parseMoney(bp.cost);
  const equipmentCost = parseMoney(summary.equipment.cost);
  const jobwallCost = parseMoney(summary.jobwall.cost);
  const lunchCost = parseMoney(summary.lunches.cost);
  const extraCost = parseMoney(summary.extra?.cost);
  const extraDescription = (summary.extra?.description || "").trim();
  const hasExtraRow = extraCost !== 0 || extraDescription.length > 0;
  const totalCost = parseMoney(summary.total_cost);

  const stageRowClass = (stage: 1 | 2 | 4 | 5) =>
    cn(
      "flex items-start justify-between gap-3 rounded-md border border-l-4 px-2.5 py-2 text-sm",
      highlightStage === stage
        ? "border-orange-400 border-l-orange-600 bg-orange-100/90 text-orange-950 font-semibold dark:border-orange-400/70 dark:border-l-orange-400 dark:bg-orange-500/20 dark:text-orange-50"
        : "border-transparent border-l-transparent"
    );

  const stageDetailClass = (stage: 1 | 2 | 4 | 5) =>
    cn(
      "text-xs font-normal",
      highlightStage === stage
        ? "text-orange-900/80 dark:text-orange-200/85"
        : "text-muted-foreground"
    );

  const stagePriceClass = (stage: 1 | 2 | 4 | 5) =>
    cn(
      "shrink-0 whitespace-nowrap",
      highlightStage === stage
        ? "font-bold text-orange-950 dark:text-orange-50"
        : "font-medium"
    );

  const currentStageBadge = (stage: 1 | 2 | 4 | 5) =>
    highlightStage === stage ? (
      <span className="inline-flex items-center rounded-full bg-orange-700 px-2 py-0.5 text-[11px] font-semibold leading-none text-white dark:bg-orange-400 dark:text-orange-950">
        {t("exhibitor.form.costSummaryCurrentStage")}
      </span>
    ) : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3.5 text-card-foreground space-y-2.5",
        className
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("exhibitor.form.costSummaryTitle")}
      </div>

      <div className="space-y-1">
        {/* Stage 1: Package & Stand */}
        <div
          className={stageRowClass(1)}
          aria-current={highlightStage === 1 ? "step" : undefined}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span>{t("exhibitor.form.costSummaryStage1Label")}</span>
              {currentStageBadge(1)}
            </div>
            <div className={stageDetailClass(1)}>
              {standDescriptor}
              {bp.pending_stand_assignment &&
                ` — ${t("exhibitor.form.costSummaryPendingStand")}`}
              {!bp.pending_stand_assignment &&
                bp.individual_pricing &&
                ` — ${t("exhibitor.form.costSummaryIndividualPricing")}`}
            </div>
          </div>
          <div className={stagePriceClass(1)}>
            {bp.pending_stand_assignment
              ? t("exhibitor.form.costSummaryPendingValue")
              : `${baseCost.toFixed(2)} PLN`}
          </div>
        </div>

        {/* Stage 2: Equipment */}
        <div
          className={stageRowClass(2)}
          aria-current={highlightStage === 2 ? "step" : undefined}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span>{t("exhibitor.form.costSummaryStage2Label")}</span>
              {currentStageBadge(2)}
            </div>
            {summary.equipment.paid_items.length > 0 && (
              <div className={stageDetailClass(2)}>
                {summary.equipment.paid_items
                  .map(
                    (it) =>
                      `${locale === "en" ? it.name_en : it.name_pl} ×${it.paid_quantity}`
                  )
                  .join(", ")}
              </div>
            )}
          </div>
          <div className={stagePriceClass(2)}>
            {equipmentCost.toFixed(2)} PLN
          </div>
        </div>

        {/* Stage 4: JobWall */}
        <div
          className={stageRowClass(4)}
          aria-current={highlightStage === 4 ? "step" : undefined}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span>{t("exhibitor.form.costSummaryStage4Label")}</span>
              {currentStageBadge(4)}
            </div>
            <div className={stageDetailClass(4)}>
              {t("exhibitor.form.costSummaryJobwallDetail", {
                total: String(summary.jobwall.total_count),
                free: String(summary.jobwall.free_count),
                extra: String(summary.jobwall.extra_count),
              })}
            </div>
          </div>
          <div className={stagePriceClass(4)}>
            {jobwallCost.toFixed(2)} PLN
          </div>
        </div>

        {/* Stage 5: Lunches */}
        <div
          className={stageRowClass(5)}
          aria-current={highlightStage === 5 ? "step" : undefined}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span>{t("exhibitor.form.costSummaryStage5Label")}</span>
              {currentStageBadge(5)}
            </div>
            <div className={stageDetailClass(5)}>
              {summary.lunches.lunches_declined
                ? t("exhibitor.form.lunchesDeclinedStatus")
                : t("exhibitor.form.costSummaryLunchDetail", {
                    extra: String(summary.lunches.extra_lunches),
                    freePerDay: String(summary.lunches.free_per_day),
                  })}
            </div>
          </div>
          <div className={stagePriceClass(5)}>
            {lunchCost.toFixed(2)} PLN
          </div>
        </div>

        {hasExtraRow && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-transparent border-l-4 border-l-transparent px-2.5 py-2 text-sm">
            <div className="min-w-0">
              <div>{t("exhibitor.form.costSummaryExtraLabel")}</div>
              {extraDescription && (
                <div className="text-xs font-normal text-muted-foreground">
                  {extraDescription}
                </div>
              )}
            </div>
            <div className="shrink-0 whitespace-nowrap font-medium">
              {extraCost.toFixed(2)} PLN
            </div>
          </div>
        )}
      </div>

      <div className="border-t pt-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold">
          {t("exhibitor.form.costSummaryTotalNetto")}
        </span>
        <span className="text-base font-bold whitespace-nowrap">
          {totalCost.toFixed(2)} PLN
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("exhibitor.form.costSummaryVatNote")}
      </p>
    </div>
  );
}
