"use client";

import React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { apiClient, fetcher } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import { TableRow as TableRowType } from "@/components/staff/Companies/StatusBadges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

type ReminderType = "stage" | "invitation";

interface InvitationReminderSettings {
  invitation_validity_days: number;
  invitation_reminder_days: number[];
  invitation_reminders_enabled: boolean;
}

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRows: TableRowType[];
  onSuccess?: () => void;
}

export function ReminderDialog({
  open,
  onOpenChange,
  selectedRows,
  onSuccess,
}: ReminderDialogProps) {
  const { t } = useTranslation();
  const [reminderType, setReminderType] = React.useState<ReminderType>("stage");
  const [stage, setStage] = React.useState(1);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  const { data: autoSettings } = useSWR<InvitationReminderSettings>(
    open ? "/api/invitation-reminder-settings/" : null,
    fetcher
  );

  React.useEffect(() => {
    if (!open) {
      setShowConfirm(false);
      setIsSending(false);
      setReminderType("stage");
      setStage(1);
    }
  }, [open]);

  const companyRows = selectedRows.filter((row) => row.type === "company");
  const invitationRows = selectedRows.filter((row) => row.type === "invitation");
  const activeRows = reminderType === "stage" ? companyRows : invitationRows;
  const canProceed = activeRows.length > 0;

  const stageOptions = [1, 2, 3, 4, 5].map((value) => ({
    value,
    label: t(`reminders.stages.stage${value}`),
  }));

  const rowName = (row: TableRowType) =>
    row.type === "company" ? row.data.name : row.data.company_name;

  const autoConfigLines = React.useMemo(() => {
    if (!autoSettings) {
      return [t("reminders.autoConfigLoading")];
    }
    if (!autoSettings.invitation_reminders_enabled) {
      return [
        t("reminders.autoConfigDisabled"),
        t("reminders.autoConfigValidity", {
          validity: autoSettings.invitation_validity_days,
        }),
        t("reminders.autoConfigManualNote"),
      ];
    }
    return [
      t("reminders.autoConfigEnabled", {
        days: autoSettings.invitation_reminder_days.join(", "),
      }),
      t("reminders.autoConfigValidity", {
        validity: autoSettings.invitation_validity_days,
      }),
      t("reminders.autoConfigManualNote"),
    ];
  }, [autoSettings, t]);

  const handleConfigOpenChange = (next: boolean) => {
    if (isSending) return;
    if (!next) {
      setShowConfirm(false);
    }
    onOpenChange(next);
  };

  const handleConfirmOpenChange = (next: boolean) => {
    if (isSending) return;
    setShowConfirm(next);
  };

  const showResultToast = (data: {
    emails_sent?: number;
    emails_failed?: number;
    skipped?: number;
  }) => {
    const sent = data.emails_sent ?? 0;
    const failed = data.emails_failed ?? 0;
    const skipped = data.skipped ?? 0;

    if (sent > 0) {
      toast.success(t("reminders.success"), {
        description: t("reminders.resultDescription", {
          sent,
          skipped,
          failed,
        }),
      });
      if (failed > 0) {
        toast.warning(t("reminders.partialFailure"), {
          description: t("reminders.partialFailureDescription", {
            sent,
            failed,
          }),
        });
      }
    } else if (failed > 0) {
      toast.error(t("reminders.error"), {
        description: t("reminders.allFailedDescription", {
          total: failed + skipped,
          failed,
        }),
      });
    } else {
      toast.info(t("reminders.noneSent"), {
        description: t("reminders.noneSentDescription", { skipped }),
      });
    }
  };

  const handleSend = async () => {
    setIsSending(true);
    try {
      let response;
      if (reminderType === "stage") {
        response = await apiClient.post("/api/companies/send-stage-reminders/", {
          stage,
          company_ids: companyRows.map((row) => row.data.id),
        });
      } else {
        response = await apiClient.post("/api/invitations/send-reminders/", {
          invitation_ids: invitationRows.map((row) => row.data.id),
        });
      }
      showResultToast(response.data);
      setShowConfirm(false);
      onOpenChange(false);
      onSuccess?.();
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
    <>
      <Dialog open={open} onOpenChange={handleConfigOpenChange}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t("reminders.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("reminders.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs sm:text-sm text-muted-foreground space-y-1.5">
            <p className="font-medium text-foreground">
              {t("reminders.autoConfigTitle")}
            </p>
            {autoConfigLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel>{t("reminders.typeLabel")}</FieldLabel>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="reminder-type"
                    checked={reminderType === "stage"}
                    onChange={() => setReminderType("stage")}
                    disabled={isSending}
                  />
                  {t("reminders.typeStage")}
                  <span className="text-muted-foreground">
                    ({companyRows.length})
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="reminder-type"
                    checked={reminderType === "invitation"}
                    onChange={() => setReminderType("invitation")}
                    disabled={isSending}
                  />
                  {t("reminders.typeInvitation")}
                  <span className="text-muted-foreground">
                    ({invitationRows.length})
                  </span>
                </label>
              </div>
            </Field>

            {reminderType === "stage" && (
              <Field>
                <FieldLabel htmlFor="reminder-stage-select">
                  {t("reminders.stageLabel")}
                </FieldLabel>
                <select
                  id="reminder-stage-select"
                  value={stage}
                  onChange={(e) => setStage(Number(e.target.value))}
                  disabled={isSending}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {stageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field>
              <FieldLabel>{t("reminders.recipientsLabel")}</FieldLabel>
              {!canProceed ? (
                <p className="text-sm text-muted-foreground">
                  {t("reminders.noMatchingSelection")}
                </p>
              ) : (
                <ul className="max-h-40 overflow-auto rounded-md border px-3 py-2 text-sm space-y-1">
                  {activeRows.map((row) => (
                    <li key={`${row.type}-${row.data.id}`}>{rowName(row)}</li>
                  ))}
                </ul>
              )}
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!canProceed || isSending}
              style={{
                backgroundColor: canProceed && !isSending ? STAFF_ACCENT_COLOR : undefined,
              }}
              onClick={() => setShowConfirm(true)}
            >
              {t("reminders.continueButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConfirm} onOpenChange={handleConfirmOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reminders.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {reminderType === "stage"
                ? t("reminders.confirmStageMessage", {
                    count: activeRows.length,
                    stage,
                  })
                : t("reminders.confirmInvitationMessage", {
                    count: activeRows.length,
                  })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={isSending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={isSending}
              style={{
                backgroundColor: isSending ? undefined : STAFF_ACCENT_COLOR,
              }}
              onClick={handleSend}
            >
              {isSending ? t("reminders.sending") : t("reminders.confirmSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
