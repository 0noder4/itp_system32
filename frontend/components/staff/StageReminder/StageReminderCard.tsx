"use client";

import React from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { getUserInfo } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";

export function StageReminderCard() {
  const { t } = useTranslation();
  const [selectedStage, setSelectedStage] = React.useState<number>(1);
  const [isSending, setIsSending] = React.useState(false);
  const [userInfo, setUserInfo] =
    React.useState<ReturnType<typeof getUserInfo>>(null);

  React.useEffect(() => {
    const info = getUserInfo();
    setUserInfo(info);
  }, []);

  // Only render if user is admin
  if (!userInfo || userInfo.type !== "admin") {
    return null;
  }

  const stageOptions = [
    { value: 1, label: t("reminders.stages.stage1") },
    { value: 2, label: t("reminders.stages.stage2") },
    { value: 3, label: t("reminders.stages.stage3") },
    { value: 4, label: t("reminders.stages.stage4") },
    { value: 5, label: t("reminders.stages.stage5") },
  ];

  const handleSendReminders = async () => {
    setIsSending(true);
    try {
      const response = await apiClient.post(
        "/api/companies/send-stage-reminders/",
        {
          stage: selectedStage,
        }
      );

      const { emails_sent, emails_failed, total_companies } = response.data;

      if (emails_sent > 0) {
        toast.success(t("reminders.success"), {
          description: t("reminders.successDescription", {
            count: emails_sent,
            stage: selectedStage,
            failed:
              emails_failed > 0
                ? ` (${emails_failed} ${t("reminders.failed")})`
                : "",
          }),
        });
        if (emails_failed > 0) {
          toast.warning(t("reminders.partialFailure"), {
            description: t("reminders.partialFailureDescription", {
              sent: emails_sent,
              failed: emails_failed || 0,
            }),
          });
        }
      } else if (total_companies === 0) {
        toast.info(t("reminders.noCompanies"), {
          description: t("reminders.noCompaniesDescription", {
            stage: selectedStage,
          }),
        });
      } else {
        // All emails failed to send
        toast.error(t("reminders.error"), {
          description: t("reminders.allFailedDescription", {
            total: total_companies || 0,
            failed: emails_failed || 0,
          }),
        });
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        t("reminders.errorDescription");
      toast.error(t("reminders.error"), {
        description: errorMessage,
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="flex flex-col md:flex-1 w-full md:w-auto gap-2 shrink-0 md:overflow-hidden">
      <CardHeader className="shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>{t("reminders.title")}</CardTitle>
            <CardDescription>{t("reminders.description")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 md:overflow-auto">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reminder-stage-select">
              {t("reminders.stageLabel")}
            </FieldLabel>
            <select
              id="reminder-stage-select"
              value={selectedStage}
              onChange={(e) => setSelectedStage(Number(e.target.value))}
              disabled={isSending}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            >
              {stageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </FieldGroup>
        <div className="mt-4">
          <Button
            onClick={handleSendReminders}
            disabled={isSending}
            className="w-full"
            style={{
              backgroundColor: isSending ? undefined : STAFF_ACCENT_COLOR,
            }}
            onMouseEnter={(e) => {
              if (!isSending) {
                e.currentTarget.style.backgroundColor = "#C84FA8";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSending) {
                e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
              }
            }}
          >
            {isSending ? t("reminders.sending") : t("reminders.sendButton")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
