"use client";

import React from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { StageInfo } from "@/lib/types";
import { Stage1Form } from "./Stage1Form";
import { Stage2Form } from "./Stage2Form";
import { Stage3Form } from "./Stage3Form";
import { Stage4Form } from "./Stage4Form";
import { Stage5Form } from "./Stage5Form";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ACCENT_COLOR } from "@/lib/colors";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";

// ============================================================
// Stage Form Props
// ============================================================

export interface StageFormProps {
  stageNumber: number;
  stageInfo: StageInfo;
  companyId: number;
  initialData?: any;
  onSuccess?: () => void;
  canSubmit?: boolean;
  incompleteStages?: number[];
}

// ============================================================
// Main StageForm Component
// ============================================================

export function StageForm({
  stageNumber,
  stageInfo,
  companyId,
  initialData,
  onSuccess,
  canSubmit = true,
  incompleteStages = [],
}: StageFormProps) {
  const { t, locale } = useTranslation();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [stageData, setStageData] = React.useState<any>(initialData);
  const [showWarningDialog, setShowWarningDialog] = React.useState(false);
  const [pendingSubmit, setPendingSubmit] = React.useState<any>(null);

  const isPending = stageInfo.status === "pending_approval";
  const isAccepted = stageInfo.status === "accepted";
  // Allow editing accepted stages regardless of canSubmit (which only applies to new submissions)
  // Disable form if pending review, or if it's not accepted and can't submit
  const isFormDisabled = isPending || (!isAccepted && !canSubmit);

  // Check if stage has been completed (data submitted)
  const isCompleted = ["pending_approval", "accepted", "rejected"].includes(
    stageInfo.status
  );

  // Format deadline display - only show for stages that haven't been completed
  const formatDeadline = React.useMemo(() => {
    // Don't show deadline for completed stages
    if (isCompleted) return null;
    if (!stageInfo.deadline) return null;

    const deadlineDate = new Date(stageInfo.deadline);
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
        textColor: "text-rose-700",
      };
    } else {
      const unit =
        diffDays === 1
          ? t("exhibitor.form.deadline.day")
          : t("exhibitor.form.deadline.days");
      // Use neutral colors if more than 3 days away, otherwise amber
      const textColor = diffDays > 3 ? "text-slate-700" : "text-amber-700";
      return {
        message: t("exhibitor.form.deadline.remaining", {
          date: formattedDate,
          days: diffDays,
          unit: unit,
        }),
        textColor: textColor,
      };
    }
  }, [stageInfo.deadline, t, locale, isCompleted]);

  // Fetch stage data if not provided
  React.useEffect(() => {
    async function fetchStageData() {
      if (initialData) {
        setStageData(initialData);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const response = await apiClient.get(
          `/api/company/${companyId}/form/stage-${stageNumber}/`
        );
        // Handle backward compatibility for stage 4 - convert old single jobwall format to new array format
        if (stageNumber === 4 && response.data) {
          // If data has old format (single jobwall object), convert to new format
          if (response.data.name && !response.data.jobwalls) {
            setStageData({
              jobwalls: [response.data],
              description: response.data.description || null,
            });
          } else {
            setStageData(response.data);
          }
        } else {
          setStageData(response.data);
        }
      } catch (error: any) {
        // Data might not exist yet, which is fine - set empty data
        if (error.response?.status === 404) {
          setStageData(null);
        } else {
          console.error("Error fetching stage data:", error);
          setStageData(null);
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchStageData();
  }, [companyId, stageNumber, initialData]);

  const handleSubmit = async (data: any) => {
    // If editing an accepted stage, show warning dialog first
    if (isAccepted && stageInfo.dataExists) {
      setPendingSubmit(data);
      setShowWarningDialog(true);
      return;
    }

    await performSubmit(data);
  };

  const performSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const method = stageInfo.dataExists ? "patch" : "post";
      const endpoint = `/api/company/${companyId}/form/stage-${stageNumber}/`;

      // Handle file uploads for stage 2
      if (stageNumber === 2) {
        const formData = new FormData();

        // Add stand_details fields
        if (data.stand_details) {
          formData.append("stand_details[company]", companyId.toString());
          // stand_type is required, always send it
          const standType = data.stand_details.stand_type || "provided_stand";
          formData.append("stand_details[stand_type]", standType);
          if (data.stand_details.sc_details) {
            formData.append(
              "stand_details[sc_details]",
              data.stand_details.sc_details
            );
          }
          if (data.stand_details.name_sign_text) {
            formData.append(
              "stand_details[name_sign_text]",
              data.stand_details.name_sign_text
            );
          }
          // Handle file uploads - only send new File instances, not existing URLs
          const logoFile = data.stand_details.logo_sign_file;
          const fireCertFile = data.stand_details.fire_cert;

          // Check if files are File instances
          const isProvidedStand = standType === "provided_stand";
          const isSelfConstruction = standType === "self_construction";

          // Only append new files (File instances), not existing file URLs (strings)
          if (logoFile instanceof File) {
            formData.append(
              "stand_details[logo_sign_file]",
              logoFile,
              logoFile.name
            );
          } else if (isProvidedStand && !(typeof logoFile === "string")) {
            // Logo is required for provided_stand but not provided (neither File nor existing URL)
            throw new Error("Logo file is required for provided stand");
          }
          // If logoFile is a string (existing file URL), don't send it - backend will keep existing file

          if (fireCertFile instanceof File) {
            formData.append(
              "stand_details[fire_cert]",
              fireCertFile,
              fireCertFile.name
            );
          } else if (
            isSelfConstruction &&
            !(typeof fireCertFile === "string")
          ) {
            // Fire cert is required for self_construction but not provided (neither File nor existing URL)
            throw new Error(
              "Fire certificate is required for self construction"
            );
          }
          // If fireCertFile is a string (existing file URL), don't send it - backend will keep existing file
        }

        // Add equipment selections (only items with quantity > 0)
        if (
          data.equipment_selections &&
          Array.isArray(data.equipment_selections)
        ) {
          const validSelections = data.equipment_selections.filter(
            (sel: any) => sel.quantity > 0
          );
          validSelections.forEach((sel: any, index: number) => {
            formData.append(
              `equipment_selections[${index}][equipment_item]`,
              sel.equipment_item.toString()
            );
            formData.append(
              `equipment_selections[${index}][quantity]`,
              sel.quantity.toString()
            );
          });
        }

        // apiClient interceptor will automatically remove Content-Type for FormData
        // so the browser can set it with the correct boundary
        await apiClient[method](endpoint, formData);
      } else if (stageNumber === 4) {
        // Handle file uploads for stage 4
        const formData = new FormData();

        // Add jobwalls
        if (data.jobwalls && Array.isArray(data.jobwalls)) {
          const validJobwalls = data.jobwalls.filter(
            (jobwall: any) => jobwall.name
          );
          validJobwalls.forEach((jobwall: any, index: number) => {
            Object.keys(jobwall).forEach((key) => {
              if (key !== "company" && key !== "id") {
                formData.append(
                  `jobwalls[${index}][${key}]`,
                  jobwall[key]?.toString() || ""
                );
              }
            });
            formData.append(
              `jobwalls[${index}][company]`,
              companyId.toString()
            );
          });
        }

        // Add description
        if (data.description) {
          if (data.description.descr) {
            formData.append("description[descr]", data.description.descr);
          }
          // Handle file upload - only send new File instances, not existing URLs
          const logoFile = data.description.logo_file;
          if (logoFile instanceof File) {
            formData.append("description[logo_file]", logoFile, logoFile.name);
          }
          // If logoFile is a string (existing file URL), don't send it - backend will keep existing file
          formData.append("description[company]", companyId.toString());
        }

        // apiClient interceptor will automatically remove Content-Type for FormData
        // so the browser can set it with the correct boundary
        await apiClient[method](endpoint, formData);
      } else {
        // Add company ID to the data where needed
        const payload = { ...data };
        if (stageNumber === 1 && payload.basic_data) {
          payload.basic_data.company = companyId;
        } else if (stageNumber === 3) {
          payload.company = companyId;
        } else if (stageNumber === 5) {
          if (payload.final_data) payload.final_data.company = companyId;
        }

        await apiClient[method](endpoint, payload);
      }

      toast.success(t("exhibitor.form.saveSuccess"));
      onSuccess?.();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        t("exhibitor.form.saveError");
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
      setPendingSubmit(null);
    }
  };

  const handleConfirmEdit = () => {
    setShowWarningDialog(false);
    if (pendingSubmit) {
      performSubmit(pendingSubmit);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle>{t(`exhibitor.${stageInfo.title}`)}</CardTitle>
            <CardDescription>
              {t(`exhibitor.${stageInfo.description}`)}
            </CardDescription>
          </div>
          {formatDeadline && (
            <div
              className={`text-xs font-medium ${formatDeadline.textColor} whitespace-nowrap`}
            >
              {formatDeadline.message}
            </div>
          )}
        </div>
        {stageInfo.status === "rejected" && stageInfo.feedback?.comment && (
          <div className="mt-1 flex items-start gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">
                {t("exhibitor.form.rejectionReason")}
              </p>
              <p>{stageInfo.feedback.comment}</p>
            </div>
          </div>
        )}
        {isPending && (
          <div className="mt-1 flex items-start gap-2 rounded-md bg-information/10 p-3 text-sm text-information dark:bg-information/20 dark:text-information-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{t("exhibitor.form.pendingReviewMessage")}</p>
          </div>
        )}
        {!canSubmit && stageNumber > 1 && incompleteStages.length > 0 && (
          <div className="mt-1 flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium mb-1">
                {t("exhibitor.form.completePreviousStages")}
              </p>
              <p>
                {t("exhibitor.form.completeStagesList", {
                  stages: incompleteStages
                    .map((num) => t(`exhibitor.stage${num}.title`))
                    .join(", "),
                })}
              </p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {stageNumber === 1 && (
          <Stage1Form
            companyId={companyId}
            initialData={stageData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            disabled={isFormDisabled}
            isAccepted={isAccepted}
          />
        )}
        {stageNumber === 2 && (
          <Stage2Form
            companyId={companyId}
            initialData={stageData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            disabled={isFormDisabled}
            isAccepted={isAccepted}
          />
        )}
        {stageNumber === 3 && (
          <Stage3Form
            companyId={companyId}
            initialData={stageData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            disabled={isFormDisabled}
            isAccepted={isAccepted}
          />
        )}
        {stageNumber === 4 && (
          <Stage4Form
            companyId={companyId}
            initialData={stageData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            disabled={isFormDisabled}
            isAccepted={isAccepted}
          />
        )}
        {stageNumber === 5 && (
          <Stage5Form
            companyId={companyId}
            initialData={stageData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            disabled={isFormDisabled}
            isAccepted={isAccepted}
          />
        )}
      </CardContent>

      {/* Warning Dialog for Editing Accepted Stage */}
      <Dialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("exhibitor.form.editAcceptedWarningTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("exhibitor.form.editAcceptedWarningMessage")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWarningDialog(false);
                setPendingSubmit(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleConfirmEdit}
              className="text-white"
              style={{ backgroundColor: ACCENT_COLOR }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#E04E15";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = ACCENT_COLOR;
              }}
            >
              {t("exhibitor.form.confirmEdit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
