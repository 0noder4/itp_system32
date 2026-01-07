"use client";

import React, { Suspense } from "react";
import { useTranslation } from "@/lib/i18n";
import { useFormStatus } from "@/hooks/use-form-status";
import { StageForm } from "@/components/exhibitor/StageForm";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle2,
  Building2,
  CheckCircle,
  Clock,
  XCircle,
  Circle,
  FileText,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StageStatus } from "@/lib/types";
import useSWR from "swr";
import { fetcher, StageDeadlinesResponse } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { ACCENT_COLOR } from "@/lib/colors";

const STATUS_CONFIG: Record<
  StageStatus,
  {
    icon: typeof CheckCircle;
    color: string;
    labelKey: string;
  }
> = {
  not_started: {
    icon: Circle,
    color: "text-slate-400",
    labelKey: "exhibitor.status.notStarted",
  },
  in_progress: {
    icon: FileText,
    color: "text-[#F55718]",
    labelKey: "exhibitor.status.inProgress",
  },
  pending_approval: {
    icon: Clock,
    color: "text-blue-500",
    labelKey: "exhibitor.status.pendingApproval",
  },
  accepted: {
    icon: CheckCircle,
    color: "text-emerald-500",
    labelKey: "exhibitor.status.accepted",
  },
  rejected: {
    icon: XCircle,
    color: "text-rose-500",
    labelKey: "exhibitor.status.rejected",
  },
};

function ExhibitorFormsPageContent() {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();
  const {
    companyId,
    companyName,
    stages: initialStages,
    currentStageNumber,
    isAllCompleted,
    isLoading,
    isError,
    mutateFormStatus,
  } = useFormStatus();

  // Fetch stage deadlines
  const { data: deadlines } = useSWR<StageDeadlinesResponse>(
    "/api/stage-deadlines/",
    fetcher
  );

  // Add deadlines to stages and calculate days remaining
  const stages = React.useMemo(() => {
    if (!deadlines) return initialStages;
    return initialStages.map((stage) => {
      const deadlineStr =
        deadlines[
          `stage_${stage.stageNumber}_deadline` as keyof StageDeadlinesResponse
        ] || null;

      let daysRemaining: number | null = null;
      if (deadlineStr) {
        const deadlineDate = new Date(deadlineStr);
        const now = new Date();
        const diffTime = deadlineDate.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      return {
        ...stage,
        deadline: deadlineStr,
        daysRemaining,
      };
    });
  }, [initialStages, deadlines]);

  const [activeTab, setActiveTab] = React.useState<string>("");
  const autoNavigateRef = React.useRef(false);
  const initializedRef = React.useRef(false);

  // Find first unsubmitted stage (stage without data)
  const getFirstUnsubmittedStage = (): number | null => {
    for (const stage of stages) {
      if (!stage.dataExists) {
        return stage.stageNumber;
      }
    }
    return null;
  };

  // Initialize active tab - check URL param first, then first unsubmitted stage
  React.useEffect(() => {
    if (!initializedRef.current && stages.length > 0 && !isLoading) {
      const stageParam = searchParams?.get("stage");
      let initialStage: number;

      if (stageParam) {
        const stageNum = parseInt(stageParam, 10);
        if (stageNum >= 1 && stageNum <= 5) {
          initialStage = stageNum;
        } else {
          const firstUnsubmitted = getFirstUnsubmittedStage();
          initialStage =
            firstUnsubmitted || currentStageNumber || stages[0].stageNumber;
        }
      } else {
        const firstUnsubmitted = getFirstUnsubmittedStage();
        // Prioritize first unsubmitted stage, then current stage, then first stage
        initialStage =
          firstUnsubmitted || currentStageNumber || stages[0].stageNumber;
      }

      setActiveTab(`stage-${initialStage}`);
      initializedRef.current = true;
    }
  }, [currentStageNumber, stages, isLoading, searchParams]);

  // Reset initialization on page refresh (when isLoading becomes true after being false)
  React.useEffect(() => {
    if (isLoading) {
      initializedRef.current = false;
      setActiveTab("");
    }
  }, [isLoading]);

  // Auto-navigate to first unsubmitted stage after form submission
  React.useEffect(() => {
    if (autoNavigateRef.current && stages.length > 0 && !isLoading) {
      const firstUnsubmitted = getFirstUnsubmittedStage();
      if (firstUnsubmitted) {
        setActiveTab(`stage-${firstUnsubmitted}`);
        autoNavigateRef.current = false;
      }
    }
  }, [stages, isLoading]);

  const handleFormSuccess = async () => {
    // Set flag to auto-navigate after data updates
    autoNavigateRef.current = true;
    // Refresh form status after successful submission
    await mutateFormStatus();
  };

  // Check if a stage can be submitted (all previous stages must be saved)
  const canSubmitStage = (stageNumber: number): boolean => {
    if (stageNumber === 1) return true; // First stage can always be submitted

    // Check if all previous stages have been saved (have data)
    for (let i = 1; i < stageNumber; i++) {
      const prevStage = stages.find((s) => s.stageNumber === i);
      if (!prevStage || !prevStage.dataExists) {
        return false;
      }
    }
    return true;
  };

  // Get list of stages that need to be saved before this stage
  const getIncompleteStages = (stageNumber: number): number[] => {
    if (stageNumber === 1) return [];

    const incomplete: number[] = [];
    for (let i = 1; i < stageNumber; i++) {
      const prevStage = stages.find((s) => s.stageNumber === i);
      if (!prevStage || !prevStage.dataExists) {
        incomplete.push(i);
      }
    }
    return incomplete;
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex flex-1 flex-col overflow-auto p-6">
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-4 pt-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div>
              <h2 className="font-semibold">{t("common.error")}</h2>
              <p className="text-muted-foreground">
                {t("exhibitor.loadError")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No company found state
  if (!companyId) {
    return (
      <div className="flex flex-1 flex-col overflow-auto p-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-4 pt-6">
            <Building2 className="h-8 w-8 text-amber-600" />
            <div>
              <h2 className="font-semibold text-amber-900">
                {t("exhibitor.noCompanyTitle")}
              </h2>
              <p className="text-amber-700">
                {t("exhibitor.noCompanyDescription")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-background">
      <div className="max-w-7xl mx-auto w-full p-6 lg:p-8 space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: ACCENT_COLOR }}
            >
              <ClipboardList className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
              {t("exhibitor.panelTitle")}
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl">
            {t("exhibitor.forms.description")}
          </p>
        </div>

        {/* All Completed Message */}
        {isAllCompleted && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="flex items-center gap-4 pt-0">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <div>
                <h2 className="font-semibold text-emerald-900">
                  {t("exhibitor.allCompletedTitle")}
                </h2>
                <p className="text-emerald-700">
                  {t("exhibitor.allCompletedDescription")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="w-full overflow-x-auto scrollbar-hide">
            <TabsList className="inline-flex h-auto p-1 gap-1 justify-start w-max sm:w-full sm:grid sm:grid-cols-5 sm:justify-center">
              {stages.map((stage) => {
                const config = STATUS_CONFIG[stage.status];
                const Icon = config.icon;
                const canSubmit = canSubmitStage(stage.stageNumber);

                // Format deadline date for display
                let deadlineDisplay: string | null = null;
                let deadlineStyles: {
                  textColor: string;
                  bgColor: string;
                  borderColor: string;
                  useAccentColor?: boolean;
                } | null = null;
                let deadlineDate: Date | null = null;
                let diffDays: number | null = null;

                if (stage.deadline) {
                  deadlineDate = new Date(stage.deadline);
                  const now = new Date();
                  const diffTime = deadlineDate.getTime() - now.getTime();
                  diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                  if (deadlineDate < now) {
                    // Deadline has passed - show "Overdue"
                    deadlineDisplay = t("exhibitor.form.deadline.overdue");
                    deadlineStyles = {
                      textColor: "text-rose-700",
                      bgColor: "bg-rose-50",
                      borderColor: "border-rose-200",
                      useAccentColor: false,
                    };
                  } else {
                    // Format date as DD.MM.YYYY
                    const formattedDate = new Intl.DateTimeFormat(
                      locale === "pl" ? "pl-PL" : "en-GB",
                      {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      }
                    )
                      .format(deadlineDate)
                      .replace(/\//g, "."); // Replace slashes with dots for pl-PL format consistency
                    deadlineDisplay = t("exhibitor.form.deadline.until", {
                      date: formattedDate,
                    });

                    // Use neutral colors if more than 3 days away, otherwise accent color
                    if (diffDays > 3) {
                      deadlineStyles = {
                        textColor: "text-slate-700",
                        bgColor: "bg-slate-50",
                        borderColor: "border-slate-200",
                        useAccentColor: false,
                      };
                    } else {
                      deadlineStyles = {
                        textColor: "",
                        bgColor: "",
                        borderColor: "",
                        useAccentColor: true,
                      };
                    }
                  }
                }

                return (
                  <TabsTrigger
                    key={stage.stageNumber}
                    value={`stage-${stage.stageNumber}`}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-3 sm:px-4 min-w-[100px] sm:min-w-0 data-[state=active]:bg-background flex-shrink-0",
                      !canSubmit && "opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0",
                          config.color
                        )}
                      />
                      <span className="text-[10px] sm:text-xs font-medium whitespace-nowrap">
                        {t(`exhibitor.${stage.title}`)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-medium whitespace-nowrap",
                          config.color,
                          "bg-current/10"
                        )}
                      >
                        {t(config.labelKey)}
                      </span>
                      {deadlineDisplay && deadlineStyles && (
                        <span
                          className={`text-[8px] sm:text-[9px] font-medium whitespace-nowrap px-1.5 sm:px-2 py-0.5 rounded-full border ${
                            deadlineStyles.textColor || ""
                          } ${deadlineStyles.bgColor || ""} ${
                            deadlineStyles.borderColor || ""
                          }`}
                          style={
                            deadlineStyles.useAccentColor
                              ? {
                                  color: ACCENT_COLOR,
                                  backgroundColor: `${ACCENT_COLOR}14`,
                                  borderColor: `${ACCENT_COLOR}40`,
                                }
                              : undefined
                          }
                        >
                          {deadlineDisplay}
                        </span>
                      )}
                    </div>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Tab Content - Stage Forms */}
          {stages.map((stage) => {
            const canSubmit = canSubmitStage(stage.stageNumber);
            const incompleteStages = getIncompleteStages(stage.stageNumber);
            return (
              <TabsContent
                key={stage.stageNumber}
                value={`stage-${stage.stageNumber}`}
                className="mt-4"
              >
                <StageForm
                  stageNumber={stage.stageNumber}
                  stageInfo={stage}
                  companyId={companyId}
                  onSuccess={handleFormSuccess}
                  canSubmit={canSubmit}
                  incompleteStages={incompleteStages}
                />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </div>
  );
}

export default function ExhibitorFormsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center">
          <Skeleton className="h-8 w-64" />
        </div>
      }
    >
      <ExhibitorFormsPageContent />
    </Suspense>
  );
}
