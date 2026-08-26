"use client";

import React from "react";
import useSWR from "swr";
import { fetcher, downloadCompaniesCSV, downloadMediaFiles } from "@/lib/api";
import { Company, CompanyInvitation, StaffUser } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/Header";
import { InvitationFormDialog } from "@/components/staff/Invitations/InvitationFormDialog";
import { CompanyFilters } from "@/components/staff/Companies/CompanyFilters";
import {
  CompaniesTable,
  rowSelectionKey,
} from "@/components/staff/Companies/CompaniesTable";
import { useFilteredRows } from "@/components/staff/Companies/useFilteredRows";
import { useStaffDashboardFilters } from "@/hooks/useStaffDashboardFilters";
import { ReminderDialog } from "@/components/staff/Reminders/ReminderDialog";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import type { TableRow as TableRowType } from "@/components/staff/Companies/StatusBadges";

export default function Index() {
  const { t } = useTranslation();

  const {
    data: companies,
    error,
    isLoading: isLoadingCompanies,
    mutate,
  } = useSWR<Company[]>("/api/companies/", fetcher);

  const {
    data: invitations,
    error: invitationsError,
    isLoading: isLoadingInvitations,
    mutate: mutateInvitations,
  } = useSWR<CompanyInvitation[]>("/api/invitations/", fetcher);

  const {
    data: staffMembers,
    error: staffError,
    isLoading: isLoadingStaff,
  } = useSWR<StaffUser[]>("/api/staff/", fetcher);

  const {
    filters: {
      searchQuery,
      statusFilter,
      invitationStatusFilter,
      frRespFilter,
      showInvitations,
    },
    setSearchQuery,
    setStatusFilter,
    setInvitationStatusFilter,
    setFrRespFilter,
    setShowInvitations,
  } = useStaffDashboardFilters();

  const { filteredRows, totalCount } = useFilteredRows({
    companies,
    invitations,
    searchQuery,
    statusFilter,
    frRespFilter,
    invitationStatusFilter,
    showInvitations,
  });

  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(
    () => new Set()
  );
  const [reminderDialogOpen, setReminderDialogOpen] = React.useState(false);

  React.useEffect(() => {
    const visibleKeys = new Set(filteredRows.map(rowSelectionKey));
    setSelectedKeys((prev) => {
      const next = new Set(
        [...prev].filter((key) => visibleKeys.has(key))
      );
      if (next.size === prev.size) {
        for (const key of next) {
          if (!prev.has(key)) {
            return next;
          }
        }
        return prev;
      }
      return next;
    });
  }, [filteredRows]);

  const selectedRows = React.useMemo(
    () =>
      filteredRows.filter((row: TableRowType) =>
        selectedKeys.has(rowSelectionKey(row))
      ),
    [filteredRows, selectedKeys]
  );

  const handleInvitationSuccess = () => {
    mutate();
    mutateInvitations();
  };

  const [isDownloadingCSV, setIsDownloadingCSV] = React.useState(false);
  const [isDownloadingMedia, setIsDownloadingMedia] = React.useState(false);

  const handleDownloadCSV = async () => {
    setIsDownloadingCSV(true);
    try {
      await downloadCompaniesCSV();
      toast.success(t("companies.export.success"), {
        description: t("companies.export.successDescription"),
      });
    } catch (error: any) {
      const errorMessage =
        error.message || t("companies.export.errorDescription");
      toast.error(t("companies.export.error"), {
        description: errorMessage,
      });
    } finally {
      setIsDownloadingCSV(false);
    }
  };

  const handleDownloadMedia = async () => {
    setIsDownloadingMedia(true);
    try {
      await downloadMediaFiles();
      toast.success(t("companies.export.mediaSuccess"), {
        description: t("companies.export.mediaSuccessDescription"),
      });
    } catch (error: any) {
      const errorMessage =
        error.message || t("companies.export.mediaErrorDescription");
      toast.error(t("companies.export.mediaError"), {
        description: errorMessage,
      });
    } finally {
      setIsDownloadingMedia(false);
    }
  };

  const isLoading =
    isLoadingCompanies || isLoadingInvitations || isLoadingStaff;
  const hasError = error || invitationsError;
  const hasData = companies !== undefined || invitations !== undefined;

  const navItems = [
    {
      title: t("companies.title"),
      url: "/panel/staff",
    },
    {
      title: t("staff.map.title"),
      url: "/panel/staff/map",
    },
  ];

  return (
    <div className="flex flex-col md:h-screen md:overflow-hidden min-h-screen md:min-h-0">
      <Header navigationItems={navItems} />
      <div className="flex flex-col flex-1 md:overflow-hidden p-3 md:p-6">
        <Card className="flex flex-col flex-1 md:overflow-hidden gap-2">
          <CardHeader className="shrink-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex flex-col gap-2">
                <CardTitle>{t("companies.title")}</CardTitle>
                <CardDescription>{t("companies.description")}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDownloadCSV}
                  disabled={isDownloadingCSV}
                  className="text-xs sm:text-sm whitespace-nowrap"
                  size="sm"
                  variant="outline"
                  style={{ borderColor: STAFF_ACCENT_COLOR }}
                  onMouseEnter={(e) => {
                    if (!isDownloadingCSV) {
                      e.currentTarget.style.backgroundColor =
                        STAFF_ACCENT_COLOR;
                      e.currentTarget.style.color = "white";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDownloadingCSV) {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "";
                    }
                  }}
                >
                  <Download className="mr-1 sm:mr-2 h-4 w-4 shrink-0" />
                  {isDownloadingCSV
                    ? t("companies.export.downloading")
                    : t("companies.export.button")}
                </Button>
                <Button
                  onClick={handleDownloadMedia}
                  disabled={isDownloadingMedia}
                  className="text-xs sm:text-sm whitespace-nowrap"
                  size="sm"
                  variant="outline"
                  style={{ borderColor: STAFF_ACCENT_COLOR }}
                  onMouseEnter={(e) => {
                    if (!isDownloadingMedia) {
                      e.currentTarget.style.backgroundColor =
                        STAFF_ACCENT_COLOR;
                      e.currentTarget.style.color = "white";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDownloadingMedia) {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "";
                    }
                  }}
                >
                  <Download className="mr-1 sm:mr-2 h-4 w-4 shrink-0" />
                  {isDownloadingMedia
                    ? t("companies.export.mediaDownloading")
                    : t("companies.export.mediaButton")}
                </Button>
                <InvitationFormDialog onSuccess={handleInvitationSuccess} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex md:flex-1 flex-col md:overflow-hidden">
            {!isLoading && hasData && (
              <CompanyFilters
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                invitationStatusFilter={invitationStatusFilter}
                onInvitationStatusFilterChange={setInvitationStatusFilter}
                frRespFilter={frRespFilter}
                onFrRespFilterChange={setFrRespFilter}
                showInvitations={showInvitations}
                onShowInvitationsChange={setShowInvitations}
                staffMembers={staffMembers}
                filteredCount={filteredRows.length}
                totalCount={totalCount}
                onSendReminders={() => setReminderDialogOpen(true)}
                sendRemindersDisabled={selectedKeys.size === 0}
              />
            )}

            <div className="custom-scrollbar md:flex-1 md:overflow-auto md:min-h-0">
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : hasError ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>{t("companies.loadError")}</p>
                </div>
              ) : filteredRows && filteredRows.length > 0 ? (
                <CompaniesTable
                  rows={filteredRows}
                  selectedKeys={selectedKeys}
                  onSelectionChange={setSelectedKeys}
                />
              ) : (companies && companies.length > 0) ||
                (invitations && invitations.length > 0) ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>{t("companies.noCompaniesMatch")}</p>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>{t("companies.noCompaniesFound")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <ReminderDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        selectedRows={selectedRows}
        onSuccess={() => setSelectedKeys(new Set())}
      />
      <footer className="shrink-0 border-t border-border bg-muted/30 py-2 md:py-3 px-3 md:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm text-muted-foreground">
          <span className="font-medium">{t("staff.footer.authors")}:</span>
          <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
            <span>{t("staff.footer.author1")},</span>
            <span>{t("staff.footer.author2")},</span>
            <span>{t("staff.footer.author3")},</span>
            <span>{t("staff.footer.author4")}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
