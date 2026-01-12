"use client";

import React from "react";
import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { useFormStatus } from "@/hooks/use-form-status";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  CheckCircle2,
  Building2,
  CheckCircle,
  Clock,
  XCircle,
  Circle,
  FileText,
  ArrowRight,
  Info,
  X,
  Download,
  Loader2,
  LayoutDashboard,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StageStatus } from "@/lib/types";
import useSWR from "swr";
import { fetcher, StageDeadlinesResponse } from "@/lib/api";
import { Company } from "@/lib/types";
import { UserAccountCard } from "@/components/staff/UserAccountCard";
import { formatDate } from "@/components/staff/Companies/utils";
import { downloadOrderSummaryPDF } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

export default function ExhibitorDashboardPage() {
  const { t, locale } = useTranslation();
  const {
    companyId,
    companyName,
    stages: initialStages,
    isAllCompleted,
    isLoading,
    isError,
  } = useFormStatus();

  // Fetch company data (may fail if backend doesn't allow company users to access)
  const {
    data: company,
    error: companyError,
    isLoading: isLoadingCompany,
  } = useSWR<Company>(companyId ? `/api/company/${companyId}/` : null, fetcher);

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

  const getStatusBadge = (status: string) => {
    const statusColors = {
      main: "bg-information/10 text-information dark:bg-information/20 dark:text-information-foreground",
      partner:
        "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      basic: "bg-muted text-muted-foreground",
    };
    const statusKey = status as "main" | "partner" | "basic";
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
          statusColors[statusKey] || statusColors.basic
        }`}
      >
        {t(`companies.status.${statusKey}`)}
      </span>
    );
  };

  // Format deadline for display
  const formatDeadlineDisplay = (
    deadlineStr: string | null | undefined
  ): {
    text: string;
    className: string;
    style?: React.CSSProperties;
  } | null => {
    if (!deadlineStr) return null;

    const deadlineDate = new Date(deadlineStr);
    const now = new Date();
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (deadlineDate < now) {
      return {
        text: t("exhibitor.form.deadline.overdue"),
        className: "text-rose-700",
      };
    }

    const formattedDate = new Intl.DateTimeFormat(
      locale === "pl" ? "pl-PL" : "en-GB",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    )
      .format(deadlineDate)
      .replace(/\//g, ".");

    return {
      text: t("exhibitor.form.deadline.until", { date: formattedDate }),
      className: diffDays > 3 ? "text-slate-700" : "",
      style: diffDays > 3 ? undefined : { color: ACCENT_COLOR },
    };
  };

  const isLoadingData = isLoading || isLoadingCompany;
  const hasError = isError || !!companyError;

  // Welcome message dismissed state
  const [isWelcomeDismissed, setIsWelcomeDismissed] = React.useState<boolean>(
    () => {
      if (typeof window !== "undefined") {
        return localStorage.getItem("exhibitor-welcome-dismissed") === "true";
      }
      return false;
    }
  );

  React.useEffect(() => {
    if (isWelcomeDismissed) {
      localStorage.setItem("exhibitor-welcome-dismissed", "true");
    }
  }, [isWelcomeDismissed]);

  const handleDismissWelcome = () => {
    setIsWelcomeDismissed(true);
  };

  // PDF download state and handler
  const [isDownloadingPDF, setIsDownloadingPDF] = React.useState(false);

  // Check if stands are assigned
  const hasStandsAssigned = React.useMemo(() => {
    if (!company) return false;
    const day1HasStand = company.day1_stand?.stand_number;
    const day2HasStand = company.day2_stand?.stand_number;
    return !!(day1HasStand || day2HasStand);
  }, [company]);

  // Check if PDF can be downloaded (all completed AND stands assigned)
  const canDownloadPDF = isAllCompleted && hasStandsAssigned;

  const handleDownloadPDF = async () => {
    if (!companyId || !canDownloadPDF) return;

    setIsDownloadingPDF(true);
    try {
      await downloadOrderSummaryPDF(companyId);
      toast.success(t("exhibitor.pdfDownloadSuccess"), {
        description: t("exhibitor.pdfDownloadSuccessDescription"),
      });
    } catch (error: any) {
      toast.error(t("exhibitor.pdfDownloadError"), {
        description:
          error.message || t("exhibitor.pdfDownloadErrorDescription"),
      });
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  // Loading state
  if (isLoadingData) {
    return (
      <div className="flex flex-1 flex-col overflow-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Error state
  if (hasError) {
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
              <LayoutDashboard className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
              {t("exhibitor.navigation.dashboard")}
            </h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl">
            {t("exhibitor.dashboard.description")}
          </p>
        </div>

        {/* Welcome Message */}
        {!isWelcomeDismissed && (
          <Card
            className="p-2"
            style={{
              borderColor: `${ACCENT_COLOR}33`,
              backgroundColor: `${ACCENT_COLOR}0D`,
            }}
          >
            <CardContent className="p-4">
              <div className="flex gap-4">
                <Info
                  className="h-5 w-5 mt-0.5 flex-shrink-0"
                  style={{ color: ACCENT_COLOR }}
                />
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h2
                        className="font-semibold text-lg"
                        style={{ color: ACCENT_COLOR }}
                      >
                        {t("exhibitor.welcome.title")}
                      </h2>
                      <p
                        className="mt-1"
                        style={{ color: `${ACCENT_COLOR}CC` }}
                      >
                        {t("exhibitor.welcome.description")}
                      </p>
                    </div>
                    <button
                      onClick={handleDismissWelcome}
                      className="transition-colors flex-shrink-0 mt-0.5"
                      style={{ color: ACCENT_COLOR }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = "0.8";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = "1";
                      }}
                      aria-label="Close welcome message"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <ul
                    className="space-y-2 text-sm"
                    style={{ color: `${ACCENT_COLOR}CC` }}
                  >
                    <li className="flex items-start gap-2">
                      <span className="font-medium">•</span>
                      <span>
                        {t("exhibitor.welcome.instructions.dashboard")}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">•</span>
                      <span>{t("exhibitor.welcome.instructions.forms")}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">•</span>
                      <span>{t("exhibitor.welcome.instructions.stages")}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">•</span>
                      <span>
                        {t("exhibitor.welcome.instructions.feedback")}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-medium">•</span>
                      <span>{t("exhibitor.welcome.instructions.support")}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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

        {/* Company Information and Stage Overview - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start auto-rows-fr">
          {/* Left Column: Company Information and FAQ */}
          <div className="lg:col-span-3 space-y-6">
            {/* Company Information */}
            {company && (
              <Card className="h-auto">
                <CardHeader>
                  <CardTitle>{t("exhibitor.overview.companyInfo")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("exhibitor.overview.companyName")}
                      </p>
                      <p className="text-lg">{company.name}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("exhibitor.overview.status")}
                      </p>
                      <div>{getStatusBadge(company.status)}</div>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("exhibitor.overview.standDay1")}
                      </p>
                      <p className="text-lg">
                        {formatStandDisplay(company.day1_stand)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("exhibitor.overview.standDay2")}
                      </p>
                      <p className="text-lg">
                        {formatStandDisplay(company.day2_stand)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("exhibitor.overview.registrationDate")}
                      </p>
                      <p className="text-lg">
                        {formatDate(company.created_at, locale)}
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                          {t("exhibitor.overview.supervisor")}
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
                </CardContent>
              </Card>
            )}

            {/* FAQ Card */}
            <Link href="/panel/exhibitor/faq" className="block">
              <Card
                className="transition-all hover:shadow-lg border-border h-auto"
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = ACCENT_COLOR;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "";
                }}
              >
                <CardContent className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: ACCENT_COLOR }}
                      >
                        <HelpCircle className="h-6 w-6 text-white" />
                      </div>
                      <h2 className="font-semibold text-lg">
                        {t("exhibitor.faqCard.title")}
                      </h2>
                    </div>
                    <ArrowRight
                      className="h-5 w-5 flex-shrink-0"
                      style={{ color: ACCENT_COLOR }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("exhibitor.faqCard.description")}
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Right Column: Stage Overview */}
          <Card className="lg:col-span-2 h-auto">
            <CardHeader>
              <CardTitle>{t("exhibitor.stagesOverview")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {canDownloadPDF && (
                <div className="mb-4 pb-4 border-b border-border">
                  <Button
                    onClick={handleDownloadPDF}
                    disabled={isDownloadingPDF}
                    className="w-full text-white"
                    style={{
                      backgroundColor: ACCENT_COLOR,
                    }}
                    onMouseEnter={(e) => {
                      if (!isDownloadingPDF) {
                        e.currentTarget.style.backgroundColor = "#E04E15";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isDownloadingPDF) {
                        e.currentTarget.style.backgroundColor = ACCENT_COLOR;
                      }
                    }}
                  >
                    {isDownloadingPDF ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("exhibitor.downloadingPDF")}
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        {t("exhibitor.downloadOrderSummary")}
                      </>
                    )}
                  </Button>
                </div>
              )}
              {stages.map((stage) => {
                const config = STATUS_CONFIG[stage.status];
                const Icon = config.icon;
                // Only show deadline for stages that haven't been completed (not_started or in_progress)
                const isCompleted = [
                  "pending_approval",
                  "accepted",
                  "rejected",
                ].includes(stage.status);
                const deadlineDisplay = isCompleted
                  ? null
                  : formatDeadlineDisplay(stage.deadline);

                return (
                  <Link
                    key={stage.stageNumber}
                    href={`/panel/exhibitor/forms?stage=${stage.stageNumber}`}
                    className="block"
                  >
                    <div
                      className="hover:bg-muted/50 transition-colors cursor-pointer rounded-md p-3 border border-transparent"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = `${ACCENT_COLOR}40`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "transparent";
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Icon
                            className={cn(
                              "h-4 w-4 flex-shrink-0",
                              config.color
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm">
                                {t(`exhibitor.${stage.title}`)}
                              </h3>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-xs font-medium",
                                  config.color,
                                  "bg-current/10"
                                )}
                              >
                                {t(config.labelKey)}
                              </span>
                              {deadlineDisplay && (
                                <span
                                  className={cn(
                                    "text-xs font-medium",
                                    deadlineDisplay.className
                                  )}
                                  style={deadlineDisplay.style}
                                >
                                  {deadlineDisplay.text}
                                </span>
                              )}
                            </div>
                            {stage.feedback?.comment && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">
                                {stage.feedback.comment}
                              </p>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
