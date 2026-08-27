"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import {
  Company,
  FormStatusResponse,
  StageStatus,
  StageInfo,
} from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { Header } from "@/components/layout/Header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Building2, ChevronDown, ChevronRight } from "lucide-react";
import { StageViewer } from "@/components/staff/StageViewer";
import { StageFeedbackForm } from "@/components/staff/Feedback/StageFeedbackForm";
import { UserAccountCard } from "@/components/staff/UserAccountCard";
import { StandEditDialog } from "@/components/staff/Stand/StandEditDialog";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";

// Stage titles for display
const STAGE_TITLES: Record<number, string> = {
  1: "stage1.title",
  2: "stage2.title",
  3: "stage3.title",
  4: "stage4.title",
  5: "stage5.title",
};

const STAGE_DESCRIPTIONS: Record<number, string> = {
  1: "stage1.description",
  2: "stage2.description",
  3: "stage3.description",
  4: "stage4.description",
  5: "stage5.description",
};

function computeStageStatus(
  stageNum: number,
  formStatus: FormStatusResponse | undefined,
  previousStageCompleted: boolean
): StageStatus {
  if (!formStatus) return "not_started";

  const stageKey = `stage_${stageNum}`;
  const isCompleted = formStatus.form[
    `stage_${stageNum}_completed` as keyof typeof formStatus.form
  ] as boolean;
  const dataExists = formStatus.data_exists[stageKey];
  const feedback = formStatus.feedbacks[stageKey];

  // If stage is marked as completed in Form model
  if (isCompleted) {
    // Check feedback status
    if (feedback) {
      if (feedback.status === "accepted") return "accepted";
      if (feedback.status === "rejected") return "rejected";
      if (feedback.status === "pending") return "pending_approval";
    }
    return "pending_approval";
  }

  // Stage not completed
  if (dataExists) {
    // Data exists but not completed - check feedback
    if (feedback && feedback.status === "rejected") return "rejected";
    if (feedback && feedback.status === "pending") return "pending_approval";
    if (feedback && feedback.status === "accepted") return "accepted";
    // Submitted data awaiting review (no feedback yet) or draft edits
    return "pending_approval";
  }

  // No data exists
  if (!previousStageCompleted && stageNum > 1) {
    return "not_started";
  }

  return "not_started";
}

// Convert snake_case status to camelCase for translation keys
function statusToTranslationKey(status: StageStatus): string {
  const statusMap: Record<StageStatus, string> = {
    not_started: "notStarted",
    in_progress: "inProgress",
    pending_approval: "pendingApproval",
    accepted: "accepted",
    rejected: "rejected",
  };
  return statusMap[status] || status;
}

function convertFormStatusToStages(
  formStatus: FormStatusResponse | undefined,
  t: any
): StageInfo[] {
  const stages: StageInfo[] = [];
  let previousStageCompleted = true;

  for (let i = 1; i <= 5; i++) {
    const stageKey = `stage_${i}`;
    const status = computeStageStatus(i, formStatus, previousStageCompleted);
    const isCompleted =
      (formStatus?.form[
        `stage_${i}_completed` as keyof typeof formStatus.form
      ] as boolean) ?? false;
    const feedback = formStatus?.feedbacks[stageKey];
    const dataExists = formStatus?.data_exists[stageKey] ?? false;

    stages.push({
      stageNumber: i,
      title: STAGE_TITLES[i],
      description: STAGE_DESCRIPTIONS[i],
      status,
      isCompleted,
      feedback: feedback,
      dataExists,
    });

    previousStageCompleted = isCompleted;
  }

  return stages;
}

export default function CompanyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const companyId = params?.id ? parseInt(params.id as string) : null;

  const {
    data: company,
    error: companyError,
    isLoading: isLoadingCompany,
    mutate: mutateCompany,
  } = useSWR<Company>(companyId ? `/api/company/${companyId}/` : null, fetcher);

  const {
    data: formStatus,
    error: formError,
    isLoading: isLoadingFormStatus,
    mutate: mutateFormStatus,
  } = useSWR<FormStatusResponse>(
    companyId ? `/api/company/${companyId}/form/status/` : null,
    fetcher
  );

  const [expandedStage, setExpandedStage] = React.useState<number | null>(null);

  const isLoading = isLoadingCompany || isLoadingFormStatus;
  const isError = !!companyError || !!formError;

  const stages = React.useMemo(() => {
    return convertFormStatusToStages(formStatus, t);
  }, [formStatus, t]);

  const formatStandSize = (size: string): string => {
    return t(`companies.stand.sizes.${size}`) || size;
  };

  const formatStandDisplay = (
    stand: { stand_number: string; stand_size: string } | null
  ): string => {
    if (!stand || !stand.stand_number) {
      return t("companies.stand.notAssigned");
    }
    return `${stand.stand_number} (${formatStandSize(stand.stand_size)})`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(
      locale === "pl" ? "pl-PL" : "en-US",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      }
    );
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      main: "", // Will use inline style with STAFF_ACCENT_COLOR
      partner:
        "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      basic: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    };
    const statusKey = status as "main" | "partner" | "basic";
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          statusColors[statusKey] || statusColors.basic
        }`}
        style={
          statusKey === "main"
            ? {
                backgroundColor: `${STAFF_ACCENT_COLOR}1A`,
                color: STAFF_ACCENT_COLOR,
              }
            : undefined
        }
      >
        {t(`companies.status.${statusKey}`)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <Header />
        <div className="flex flex-1 flex-col overflow-auto p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <Header />
        <div className="flex flex-1 flex-col overflow-auto p-6">
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-4 pt-6">
              <Building2 className="h-8 w-8 text-destructive" />
              <div>
                <h2 className="font-semibold">{t("common.error")}</h2>
                <p className="text-muted-foreground">
                  {t("staff.companyDetail.loadError")}
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
      <Header />
      <div className="flex flex-1 flex-col overflow-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/panel/staff")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("staff.companyDetail.backToList")}
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {t("staff.companyDetail.title")}
            </h1>
          </div>
        </div>

        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle>{t("staff.companyDetail.companyInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.table.name")}
                </p>
                <p className="text-lg">{company.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.table.status")}
                </p>
                <div>{getStatusBadge(company.status)}</div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("companies.stand.day1")}
                  </p>
                  {companyId && (
                    <StandEditDialog
                      companyId={companyId}
                      day1Stand={company.day1_stand}
                      day2Stand={company.day2_stand}
                      onSuccess={() => mutateCompany()}
                    />
                  )}
                </div>
                <p className="text-lg">
                  {formatStandDisplay(company.day1_stand)}
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("companies.stand.day2")}
                  </p>
                  {companyId && (
                    <StandEditDialog
                      companyId={companyId}
                      day1Stand={company.day1_stand}
                      day2Stand={company.day2_stand}
                      onSuccess={() => mutateCompany()}
                    />
                  )}
                </div>
                <p className="text-lg">
                  {formatStandDisplay(company.day2_stand)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.table.createdAt")}
                </p>
                <p className="text-lg">{formatDate(company.created_at)}</p>
              </div>
              <div className="md:col-span-2">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      {t("companies.table.representative")}
                    </p>
                    <UserAccountCard
                      name={company.representative_name}
                      surname={company.representative_surname}
                      email={company.email}
                      username={company.representative_username}
                      phoneNumber={company.representative_phone_number}
                      dateJoined={company.created_at}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      {t("companies.table.frResp")}
                    </p>
                    <UserAccountCard
                      name={company.fr_resp_name}
                      surname={company.fr_resp_surname}
                      email={company.fr_resp_email || company.email}
                      username={company.fr_resp_username}
                      phoneNumber={company.fr_resp_phone_number}
                      dateJoined={company.created_at}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stages */}
        <Card>
          <CardHeader>
            <CardTitle>{t("staff.companyDetail.stages")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stages.map((stage) => {
              const isExpanded = expandedStage === stage.stageNumber;
              return (
                <div
                  key={stage.stageNumber}
                  className="border rounded-lg overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (stage.dataExists) {
                        setExpandedStage(isExpanded ? null : stage.stageNumber);
                      }
                    }}
                    disabled={!stage.dataExists}
                    className="w-full p-4 flex items-center justify-between transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {isExpanded ? (
                        <ChevronDown className="h-5 mr-2 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 mr-2 w-5 text-muted-foreground" />
                      )}
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-semibold text-lg">
                            {t(`exhibitor.${stage.title}`)}
                          </h3>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              stage.status === "accepted"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                                : stage.status === "rejected"
                                ? "bg-danger/10 text-danger dark:bg-danger/20 dark:text-danger-foreground"
                                : stage.status === "pending_approval"
                                ? "bg-information/10 text-information dark:bg-information/20 dark:text-information-foreground"
                                : stage.status === "in_progress"
                                ? "bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning-foreground"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                            }`}
                          >
                            {t(
                              `exhibitor.status.${statusToTranslationKey(
                                stage.status
                              )}`
                            )}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {t(`exhibitor.${stage.description}`)}
                        </p>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t p-4 space-y-4">
                      {stage.feedback?.comment && (
                        <div className="rounded-md bg-muted p-3">
                          <p className="text-sm font-medium">
                            {t("staff.companyDetail.feedbackComment")}:
                          </p>
                          <p className="text-sm mt-1">
                            {stage.feedback.comment}
                          </p>
                        </div>
                      )}

                      {stage.dataExists && (
                        <StageViewer
                          companyId={companyId!}
                          stageNumber={stage.stageNumber}
                        />
                      )}

                      {stage.dataExists && (
                        <StageFeedbackForm
                          companyId={companyId!}
                          stageNumber={stage.stageNumber}
                          currentFeedback={stage.feedback}
                          dataExists={stage.dataExists}
                          onSuccess={() => {
                            mutateFormStatus();
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
