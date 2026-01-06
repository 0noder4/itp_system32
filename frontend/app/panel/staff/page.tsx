"use client";

import React from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
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
import { Header } from "@/components/layout/Header";
import { InvitationFormDialog } from "@/components/staff/Invitations/InvitationFormDialog";
import { CompanyFilters } from "@/components/staff/Companies/CompanyFilters";
import { CompaniesTable } from "@/components/staff/Companies/CompaniesTable";
import { useFilteredRows } from "@/components/staff/Companies/useFilteredRows";
import { useStaffDashboardFilters } from "@/hooks/useStaffDashboardFilters";
import { StageReminderCard } from "@/components/staff/StageReminder/StageReminderCard";

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

  const handleInvitationSuccess = () => {
    mutate();
    mutateInvitations();
  };

  const isLoading =
    isLoadingCompanies || isLoadingInvitations || isLoadingStaff;
  const hasError = error || invitationsError;
  const hasData = companies !== undefined || invitations !== undefined;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden p-6 gap-4">
        <Card className="flex flex-3 flex-col overflow-hidden gap-2">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-2">
                <CardTitle>{t("companies.title")}</CardTitle>
                <CardDescription>{t("companies.description")}</CardDescription>
              </div>
              <InvitationFormDialog onSuccess={handleInvitationSuccess} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col overflow-hidden">
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
              />
            )}

            <div className="custom-scrollbar flex-1 overflow-auto">
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
                <CompaniesTable rows={filteredRows} />
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
        <StageReminderCard />
      </div>
      <footer className="shrink-0 border-t border-border bg-muted/30 py-3 px-6">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium">{t("staff.footer.authors")}:</span>
          <span>{t("staff.footer.author1")},</span>
          <span>{t("staff.footer.author2")},</span>
          <span>{t("staff.footer.author3")},</span>
          <span>{t("staff.footer.author4")}</span>
        </div>
      </footer>
    </div>
  );
}
