"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { useFormStatus } from "@/hooks/use-form-status";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { StageForm } from "@/components/exhibitor/StageForm";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StageStatus } from "@/lib/types";

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
    color: "text-amber-500",
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

export default function ExhibitorPanelPage() {
  const { t } = useTranslation();
  const {
    companyId,
    companyName,
    stages,
    currentStageNumber,
    isAllCompleted,
    isLoading,
    isError,
    mutateFormStatus,
  } = useFormStatus();

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

  // Initialize active tab to first unsubmitted stage on page load/refresh
  React.useEffect(() => {
    if (!initializedRef.current && stages.length > 0 && !isLoading) {
      const firstUnsubmitted = getFirstUnsubmittedStage();
      // Prioritize first unsubmitted stage, then current stage, then first stage
      const initialStage =
        firstUnsubmitted || currentStageNumber || stages[0].stageNumber;
      setActiveTab(`stage-${initialStage}`);
      initializedRef.current = true;
    }
  }, [currentStageNumber, stages, isLoading]);

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
      <div className="flex h-screen flex-col overflow-hidden">
        <DashboardHeader />
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
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <DashboardHeader />
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
      </div>
    );
  }

  // No company found state
  if (!companyId) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <DashboardHeader />
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
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <DashboardHeader />
      <div className="flex flex-1 flex-col overflow-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("exhibitor.panelTitle")}
          </h1>
          <p className="text-muted-foreground">
            {companyName && (
              <span className="font-medium text-foreground">{companyName}</span>
            )}
            {" — "}
            {t("exhibitor.panelDescription")}
          </p>
        </div>

        {/* All Completed Message */}
        {isAllCompleted && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="flex items-center gap-4 pt-6">
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
          <div className="overflow-x-auto">
            <TabsList className="grid w-full grid-cols-5 h-auto p-1 min-w-[600px]">
              {stages.map((stage) => {
                const config = STATUS_CONFIG[stage.status];
                const Icon = config.icon;
                const canSubmit = canSubmitStage(stage.stageNumber);

                return (
                  <TabsTrigger
                    key={stage.stageNumber}
                    value={`stage-${stage.stageNumber}`}
                    className={cn(
                      "flex flex-col items-center gap-2 py-3 px-2 data-[state=active]:bg-background",
                      !canSubmit && "opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", config.color)} />
                      <span className="text-xs font-medium whitespace-nowrap">
                        {t(`exhibitor.${stage.title}`)}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap",
                        config.color,
                        "bg-current/10"
                      )}
                    >
                      {t(config.labelKey)}
                    </span>
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
