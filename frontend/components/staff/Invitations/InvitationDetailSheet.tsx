"use client";

import React from "react";
import { Copy, Check, X } from "lucide-react";
import { toast } from "sonner";
import { CompanyInvitation } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { apiClient } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompanyStatusBadge, InvitationStatusBadge } from "../Companies/StatusBadges";
import { formatDateWithTime, formatFrRespName } from "../Companies/utils";

interface InvitationDetailSheetProps {
  invitation: CompanyInvitation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel?: () => void;
}

export function InvitationDetailSheet({
  invitation,
  open,
  onOpenChange,
  onCancel,
}: InvitationDetailSheetProps) {
  const { t, locale } = useTranslation();
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const handleCopyLink = async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.invitation_link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast.success(t("companies.invitations.linkCopied"));
    } catch (err) {
      toast.error(t("companies.invitations.copyFailed"));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setCopiedLink(false);
      setShowCancelDialog(false);
    }
    onOpenChange(isOpen);
  };

  const handleCancelInvitation = async () => {
    if (!invitation) return;

    setIsCancelling(true);
    try {
      await apiClient.patch(`/api/invitation/${invitation.id}/`, {
        is_cancelled: true,
      });
      toast.success(t("companies.invitations.cancel.success"), {
        description: t("companies.invitations.cancel.successDescription"),
      });
      setShowCancelDialog(false);
      onOpenChange(false);
      if (onCancel) {
        onCancel();
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        t("companies.invitations.cancel.errorDescription");
      toast.error(t("companies.invitations.cancel.error"), {
        description: errorMessage,
      });
    } finally {
      setIsCancelling(false);
    }
  };

  if (!invitation) return null;

  const isExpired = new Date(invitation.expires_at) < new Date();
  const canCancel =
    !invitation.is_accepted &&
    invitation.invitation_status !== "cancelled";

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("companies.invitations.detailTitle")}</SheetTitle>
          <SheetDescription>{invitation.company_name}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Basic Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("companies.invitations.basicInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {t("companies.table.email")}
                  </p>
                  <p className="text-sm">{invitation.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {t("companies.table.name")}
                  </p>
                  <p className="text-sm">{invitation.company_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {t("companies.table.status")}
                  </p>
                  <div className="mt-1">
                    <CompanyStatusBadge status={invitation.company_status} />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {t("companies.invitations.status.label")}
                  </p>
                  <div className="mt-1">
                    <InvitationStatusBadge
                      status={invitation.invitation_status}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dates Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("companies.invitations.dates")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {t("companies.invitations.createdAt")}
                  </p>
                  <p className="text-sm">
                    {formatDateWithTime(invitation.created_at, locale)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {t("companies.invitations.expiresAt")}
                  </p>
                  <p
                    className={`text-sm ${
                      isExpired
                        ? "text-red-600 dark:text-red-400 font-medium"
                        : ""
                    }`}
                  >
                    {formatDateWithTime(invitation.expires_at, locale)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Invitation Link Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("companies.invitations.invitationLink")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-2">
                <div className="flex-1 rounded-md border bg-muted/50 p-3 text-xs break-all font-mono">
                  {invitation.invitation_link}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={handleCopyLink}
                >
                  {copiedLink ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Additional Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("companies.invitations.additionalInfo")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {t("companies.invite.languageLabel")}
                  </p>
                  <p className="text-sm">
                    {invitation.language === "en"
                      ? t("language.english")
                      : t("language.polish")}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    {t("companies.table.frResp")}
                  </p>
                  <p className="text-sm">
                    {formatFrRespName(
                      invitation.fr_resp_name,
                      invitation.fr_resp_surname,
                      invitation.fr_resp_email
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cancel Invitation Button */}
          {canCancel && (
            <div className="pt-4 border-t">
              <Button
                variant="destructive"
                onClick={() => setShowCancelDialog(true)}
                className="w-full"
              >
                <X className="h-4 w-4 mr-2" />
                {t("companies.invitations.cancel.button")}
              </Button>
            </div>
          )}
        </div>

        {/* Cancel Confirmation Dialog */}
        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("companies.invitations.cancel.confirmTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("companies.invitations.cancel.confirmMessage")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowCancelDialog(false)}
                disabled={isCancelling}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelInvitation}
                disabled={isCancelling}
              >
                {isCancelling
                  ? t("common.loading")
                  : t("companies.invitations.cancel.confirmButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

