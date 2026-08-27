"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Loader2 } from "lucide-react";
import { StageFeedback } from "@/lib/types";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";

interface StageFeedbackFormProps {
  companyId: number;
  stageNumber: number;
  currentFeedback?: StageFeedback;
  dataExists?: boolean;
  onSuccess?: () => void;
}

const feedbackSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
  comment: z.string().optional(),
});

type FeedbackFormData = z.infer<typeof feedbackSchema>;

export function StageFeedbackForm({
  companyId,
  stageNumber,
  currentFeedback,
  dataExists = false,
  onSuccess,
}: StageFeedbackFormProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showRejectDialog, setShowRejectDialog] = React.useState(false);

  const form = useForm<FeedbackFormData>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      status:
        (currentFeedback?.status as "accepted" | "rejected") || "accepted",
      comment: currentFeedback?.comment || "",
    },
  });

  const handleAccept = async () => {
    if (!dataExists) {
      toast.error(t("staff.companyDetail.stageNotSubmitted"));
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post(
        `/api/company/${companyId}/form/stage-${stageNumber}/review/`,
        {
          status: "accepted",
          comment: "",
        }
      );
      toast.success(t("staff.companyDetail.feedbackSuccess"));
      onSuccess?.();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        t("staff.companyDetail.feedbackError");
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectClick = () => {
    if (!dataExists) {
      toast.error(t("staff.companyDetail.stageNotSubmitted"));
      return;
    }
    setShowRejectDialog(true);
  };

  const handleRejectSubmit = async () => {
    const comment = form.getValues("comment") || "";
    setIsSubmitting(true);
    try {
      await apiClient.post(
        `/api/company/${companyId}/form/stage-${stageNumber}/review/`,
        {
          status: "rejected",
          comment: comment,
        }
      );
      toast.success(t("staff.companyDetail.feedbackSuccess"));
      setShowRejectDialog(false);
      form.reset();
      onSuccess?.();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        t("staff.companyDetail.feedbackError");
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProvideFeedback = dataExists;

  return (
    <>
      <div>
        {canProvideFeedback && (
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleAccept}
              disabled={isSubmitting}
              variant="default"
              className="flex-1"
              style={{
                backgroundColor: isSubmitting ? undefined : STAFF_ACCENT_COLOR,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#C84FA8";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
                }
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("staff.companyDetail.submitting")}
                </>
              ) : (
                t("staff.companyDetail.accept")
              )}
            </Button>
            <Button
              type="button"
              onClick={handleRejectClick}
              disabled={isSubmitting}
              variant="outline"
              className="flex-1"
              style={{
                backgroundColor: isSubmitting ? undefined : "#1a1a1a",
                color: "#ffffff",
                borderColor: "#1a1a1a",
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#2a2a2a";
                  e.currentTarget.style.borderColor = "#2a2a2a";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#1a1a1a";
                  e.currentTarget.style.borderColor = "#1a1a1a";
                }
              }}
            >
              {t("staff.companyDetail.reject")}
            </Button>
          </div>
        )}
      </div>

      {/* Rejection Comment Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("staff.companyDetail.rejectStage")}</DialogTitle>
            <DialogDescription>
              {t("staff.companyDetail.rejectStageDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <FieldGroup>
              <Controller
                name="comment"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>
                      {t("staff.companyDetail.feedbackComment")}
                    </FieldLabel>
                    <Textarea
                      {...field}
                      rows={4}
                      placeholder={t("staff.companyDetail.feedbackComment")}
                      disabled={isSubmitting}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                form.reset();
              }}
              disabled={isSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleRejectSubmit}
              disabled={isSubmitting}
              variant="outline"
              style={{
                backgroundColor: isSubmitting ? undefined : "#1a1a1a",
                color: "#ffffff",
                borderColor: "#1a1a1a",
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#2a2a2a";
                  e.currentTarget.style.borderColor = "#2a2a2a";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.backgroundColor = "#1a1a1a";
                  e.currentTarget.style.borderColor = "#1a1a1a";
                }
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("staff.companyDetail.submitting")}
                </>
              ) : (
                t("staff.companyDetail.rejectSend")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
