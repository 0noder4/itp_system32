"use client";

import React from "react";
import { StageInfo, StageStatus } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Circle,
  XCircle,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StageOverviewProps {
  stages: StageInfo[];
  currentStageNumber: number | null;
  onStageClick?: (stageNumber: number) => void;
}

const STATUS_CONFIG: Record<
  StageStatus,
  {
    icon: typeof CheckCircle;
    color: string;
    bgColor: string;
    borderColor: string;
    labelKey: string;
  }
> = {
  not_started: {
    icon: Circle,
    color: "text-slate-400",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    labelKey: "exhibitor.status.notStarted",
  },
  in_progress: {
    icon: FileText,
    color: "text-warning dark:text-warning-foreground",
    bgColor: "bg-warning/10 dark:bg-warning/20",
    borderColor: "border-warning/20 dark:border-warning/30",
    labelKey: "exhibitor.status.inProgress",
  },
  pending_approval: {
    icon: Clock,
    color: "text-information dark:text-information-foreground",
    bgColor: "bg-information/10 dark:bg-information/20",
    borderColor: "border-information/20 dark:border-information/30",
    labelKey: "exhibitor.status.pendingApproval",
  },
  accepted: {
    icon: CheckCircle,
    color: "text-emerald-500",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    labelKey: "exhibitor.status.accepted",
  },
  rejected: {
    icon: XCircle,
    color: "text-danger dark:text-danger-foreground",
    bgColor: "bg-danger/10 dark:bg-danger/20",
    borderColor: "border-danger/20 dark:border-danger/30",
    labelKey: "exhibitor.status.rejected",
  },
};

function StageCard({
  stage,
  isCurrent,
  onClick,
}: {
  stage: StageInfo;
  isCurrent: boolean;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[stage.status];
  const Icon = config.icon;

  const { locale } = useTranslation();

  // Format deadline display
  const formatDeadline = React.useMemo(() => {
    if (!stage.deadline) return null;

    const deadlineDate = new Date(stage.deadline);
    const now = new Date();
    const isPassed = deadlineDate < now;
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Format date for display (locale-aware)
    const formattedDate = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(deadlineDate);

    if (isPassed) {
      return {
        message: t("exhibitor.form.deadline.passed", { date: formattedDate }),
        bgColor: "bg-danger/10 dark:bg-danger/20",
        textColor: "text-danger dark:text-danger-foreground",
        borderColor: "border-danger/20 dark:border-danger/30",
      };
    } else {
      const unit =
        diffDays === 1
          ? t("exhibitor.form.deadline.day")
          : t("exhibitor.form.deadline.days");
      return {
        message: t("exhibitor.form.deadline.remaining", {
          date: formattedDate,
          days: diffDays,
          unit: unit,
        }),
        bgColor: "bg-warning/10 dark:bg-warning/20",
        textColor: "text-warning dark:text-warning-foreground",
        borderColor: "border-warning/20 dark:border-warning/30",
      };
    }
  }, [stage.deadline, t, locale]);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-md",
        config.borderColor,
        isCurrent && "ring-2 ring-primary ring-offset-2"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                config.bgColor
              )}
            >
              <Icon className={cn("h-5 w-5", config.color)} />
            </div>
            <div>
              <CardTitle className="text-base">
                {t(`exhibitor.${stage.title}`)}
              </CardTitle>
              <CardDescription className="text-xs">
                {t(`exhibitor.${stage.description}`)}
              </CardDescription>
            </div>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              config.bgColor,
              config.color
            )}
          >
            {t(config.labelKey)}
          </span>
        </div>
      </CardHeader>
      {stage.status === "rejected" && stage.feedback?.comment && (
        <CardContent className="pt-0">
          <div className="flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger dark:bg-danger/20 dark:text-danger-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{stage.feedback.comment}</p>
          </div>
        </CardContent>
      )}
      {formatDeadline && (
        <CardContent className="pt-0">
          <div
            className={`flex items-start gap-2 rounded-md border ${formatDeadline.bgColor} ${formatDeadline.textColor} ${formatDeadline.borderColor} p-3 text-sm`}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{formatDeadline.message}</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function StageOverview({
  stages,
  currentStageNumber,
  onStageClick,
}: StageOverviewProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("exhibitor.stagesOverview")}</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stages.map((stage) => (
          <StageCard
            key={stage.stageNumber}
            stage={stage}
            isCurrent={stage.stageNumber === currentStageNumber}
            onClick={() => onStageClick?.(stage.stageNumber)}
          />
        ))}
      </div>
    </div>
  );
}
