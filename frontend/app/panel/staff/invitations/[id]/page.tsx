"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher, apiClient } from "@/lib/api";
import { CompanyInvitation } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Mail, X } from "lucide-react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  CompanyStatusBadge,
  InvitationStatusBadge,
} from "@/components/staff/Companies/StatusBadges";
import { formatDateWithTime, formatFrRespName } from "@/components/staff/Companies/utils";

export default function InvitationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useTranslation();
  const invitationId = params?.id ? parseInt(params.id as string) : null;

  const {
    data: invitation,
    error: invitationError,
    isLoading: isLoadingInvitation,
    mutate: mutateInvitation,
  } = useSWR<CompanyInvitation>(
    invitationId ? `/api/invitation/${invitationId}/` : null,
    fetcher
  );

  const [copiedLink, setCopiedLink] = React.useState(false);
  const [showCancelDialog, setShowCancelDialog] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const isLoading = isLoadingInvitation;
  const isError = !!invitationError;

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
      mutateInvitation();
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

  if (isError || !invitation) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <Header />
        <div className="flex flex-1 flex-col overflow-auto p-6">
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-4 pt-6">
              <Mail className="h-8 w-8 text-destructive" />
              <div>
                <h2 className="font-semibold">{t("common.error")}</h2>
                <p className="text-muted-foreground">
                  {t("staff.invitationDetail.loadError")}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isExpired = new Date(invitation.expires_at) < new Date();
  const canCancel =
    !invitation.is_accepted &&
    invitation.invitation_status !== "cancelled";

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
            {t("staff.invitationDetail.backToList")}
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {t("staff.invitationDetail.title")}
            </h1>
          </div>
        </div>

        {/* Basic Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("companies.invitations.basicInfo")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Dates */}
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.invitations.createdAt")}
                </p>
                <p className="text-lg">
                  {formatDateWithTime(invitation.created_at, locale)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.invitations.expiresAt")}
                </p>
                <p
                  className={`text-lg ${
                    isExpired
                      ? "text-red-600 dark:text-red-400 font-medium"
                      : ""
                  }`}
                >
                  {formatDateWithTime(invitation.expires_at, locale)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.table.status")}
                </p>
                <div className="mt-1">
                  <CompanyStatusBadge status={invitation.company_status} />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.invitations.status.label")}
                </p>
                <div className="mt-1">
                  <InvitationStatusBadge
                    status={invitation.invitation_status}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.table.email")}
                </p>
                <p className="text-lg">{invitation.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.table.name")}
                </p>
                <p className="text-lg">{invitation.company_name}</p>
              </div>
              {/* Additional Information */}
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.invite.languageLabel")}
                </p>
                <p className="text-lg">
                  {invitation.language === "en"
                    ? t("language.english")
                    : t("language.polish")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("companies.table.frResp")}
                </p>
                <p className="text-lg">
                  {formatFrRespName(
                    invitation.fr_resp_name,
                    invitation.fr_resp_surname,
                    invitation.fr_resp_email
                  )}
                </p>
              </div>
            </div>
            {/* Invitation Link*/}
            <div className="flex flex-col items-start gap-2">
              <p className="text-sm font-medium text-muted-foreground">
                {t("companies.invitations.invitationLink")}
              </p>
              <div className="flex items-center gap-2">
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
            </div>
            {/* Cancel Invitation Button */}
            {canCancel && (
              <div className="pt-4 border-t">
                <Button
                  variant="destructive"
                  onClick={() => setShowCancelDialog(true)}
                  className="w-full sm:w-auto"
                >
                  <X className="h-4 w-4 mr-2" />
                  {t("companies.invitations.cancel.button")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

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
      </div>
    </div>
  );
}
