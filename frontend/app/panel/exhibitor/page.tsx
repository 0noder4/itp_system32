"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { useFormStatus } from "@/hooks/use-form-status";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { StageOverview } from "@/components/exhibitor/StageOverview";
import { StageForm } from "@/components/exhibitor/StageForm";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Building2 } from "lucide-react";

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

  const formSectionRef = React.useRef<HTMLDivElement>(null);

  const handleStageClick = (stageNumber: number) => {
    // Scroll to form section if clicking on current stage
    if (stageNumber === currentStageNumber && formSectionRef.current) {
      formSectionRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleFormSuccess = () => {
    // Refresh form status after successful submission
    mutateFormStatus();
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
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-5 w-32 mt-2" />
                </CardHeader>
              </Card>
            ))}
          </div>
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

  const currentStage = stages.find((s) => s.stageNumber === currentStageNumber);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <DashboardHeader />
      <div className="flex flex-1 flex-col overflow-auto p-6 space-y-8">
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

      {/* Stages Overview */}
      <StageOverview
        stages={stages}
        currentStageNumber={currentStageNumber}
        onStageClick={handleStageClick}
      />

      {/* Current Stage Form */}
      {currentStageNumber && currentStage && (
        <div ref={formSectionRef} className="space-y-4">
          <h2 className="text-lg font-semibold">
            {t("exhibitor.currentStageFormTitle")}
          </h2>
          <StageForm
            stageNumber={currentStageNumber}
            stageInfo={currentStage}
            companyId={companyId}
            onSuccess={handleFormSuccess}
          />
        </div>
      )}
      </div>
    </div>
  );
}
