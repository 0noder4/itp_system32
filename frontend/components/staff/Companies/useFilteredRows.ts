import React from "react";
import { Company, CompanyInvitation, StageKey } from "@/lib/types";
import {
  CompanyStatusFilterValue,
  CompletedStageNumber,
  InvitationStatusFilterValue,
  StaffMemberFilterValue,
  StageStatusFilterValue,
} from "@/hooks/useStaffDashboardFilters";
import { TableRow } from "./StatusBadges";

const ALL_STAGE_KEYS: StageKey[] = [
  "stage_1",
  "stage_2",
  "stage_3",
  "stage_4",
  "stage_5",
];

interface UseFilteredRowsParams {
  companies?: Company[];
  invitations?: CompanyInvitation[];
  searchQuery: string;
  statusFilter: CompanyStatusFilterValue[];
  frRespFilter: StaffMemberFilterValue[];
  opiekunFilter: StaffMemberFilterValue[];
  invitationStatusFilter: InvitationStatusFilterValue[];
  stageStatusFilter: StageStatusFilterValue[];
  stageStatusScope: CompletedStageNumber[];
  showInvitations: boolean;
}

function matchesStaffFilter(
  assignedId: number | null | undefined,
  filter: StaffMemberFilterValue[]
): boolean {
  if (filter.length === 0) return true;
  if (assignedId == null) return filter.includes("unassigned");
  return filter.includes(assignedId);
}

function companyMatchesStageStatus(
  company: Company,
  stageStatusFilter: StageStatusFilterValue[],
  stageStatusScope: CompletedStageNumber[]
): boolean {
  if (stageStatusFilter.length === 0) {
    return true;
  }
  const stageKeys =
    stageStatusScope.length === 0
      ? ALL_STAGE_KEYS
      : stageStatusScope.map((stage) => `stage_${stage}` as StageKey);
  return stageKeys.some((key) => {
    const status = company.stage_statuses?.[key];
    return (
      status !== undefined &&
      (stageStatusFilter as readonly string[]).includes(status)
    );
  });
}

export function useFilteredRows({
  companies,
  invitations,
  searchQuery,
  statusFilter,
  frRespFilter,
  opiekunFilter,
  invitationStatusFilter,
  stageStatusFilter,
  stageStatusScope,
  showInvitations,
}: UseFilteredRowsParams) {
  const filteredRows = React.useMemo(() => {
    const rows: TableRow[] = [];

    const companyEmails = new Set<string>();
    if (companies) {
      companies.forEach((company) => {
        companyEmails.add(company.email.toLowerCase());
      });
    }

    if (companies) {
      companies.forEach((company) => {
        if (
          statusFilter.length > 0 &&
          !statusFilter.includes(company.status)
        ) {
          return;
        }

        if (!matchesStaffFilter(company.fr_resp, frRespFilter)) {
          return;
        }

        if (!matchesStaffFilter(company.opiekun, opiekunFilter)) {
          return;
        }

        // Registered companies correspond to "accepted" invitations.
        if (
          invitationStatusFilter.length > 0 &&
          !invitationStatusFilter.includes("accepted")
        ) {
          return;
        }

        if (
          !companyMatchesStageStatus(company, stageStatusFilter, stageStatusScope)
        ) {
          return;
        }

        if (searchQuery.trim() !== "") {
          const query = searchQuery.toLowerCase();
          if (
            !company.name.toLowerCase().includes(query) &&
            !company.email.toLowerCase().includes(query) &&
            !company.id.toString().includes(query)
          ) {
            return;
          }
        }

        rows.push({ type: "company", data: company });
      });
    }

    if (
      showInvitations &&
      invitations &&
      stageStatusFilter.length === 0
    ) {
      invitations.forEach((invitation) => {
        if (
          invitation.invitation_status === "accepted" &&
          companyEmails.has(invitation.email.toLowerCase())
        ) {
          return;
        }

        if (
          invitationStatusFilter.length > 0 &&
          !invitationStatusFilter.includes(invitation.invitation_status)
        ) {
          return;
        }

        if (!matchesStaffFilter(invitation.fr_resp, frRespFilter)) {
          return;
        }

        // Invitations do not have an assigned opiekun yet.
        if (opiekunFilter.length > 0 && !opiekunFilter.includes("unassigned")) {
          return;
        }

        if (
          statusFilter.length > 0 &&
          !statusFilter.includes(invitation.company_status)
        ) {
          return;
        }

        if (searchQuery.trim() !== "") {
          const query = searchQuery.toLowerCase();
          if (
            !invitation.company_name.toLowerCase().includes(query) &&
            !invitation.email.toLowerCase().includes(query) &&
            !invitation.id.toString().includes(query)
          ) {
            return;
          }
        }

        rows.push({ type: "invitation", data: invitation });
      });
    }

    return rows.sort((a, b) => {
      const dateA = new Date(a.data.created_at).getTime();
      const dateB = new Date(b.data.created_at).getTime();
      return dateB - dateA;
    });
  }, [
    companies,
    invitations,
    searchQuery,
    statusFilter,
    frRespFilter,
    opiekunFilter,
    invitationStatusFilter,
    stageStatusFilter,
    stageStatusScope,
    showInvitations,
  ]);

  const totalCount = React.useMemo(() => {
    const companyEmails = new Set<string>();
    if (companies) {
      companies.forEach((company) => {
        companyEmails.add(company.email.toLowerCase());
      });
    }

    let count = companies?.length || 0;

    if (showInvitations && invitations) {
      invitations.forEach((invitation) => {
        if (
          invitation.invitation_status === "accepted" &&
          companyEmails.has(invitation.email.toLowerCase())
        ) {
          return;
        }
        count++;
      });
    }

    return count;
  }, [companies, invitations, showInvitations]);

  return { filteredRows, totalCount };
}
