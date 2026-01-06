import React from "react";
import { Company, CompanyInvitation } from "@/lib/types";
import { TableRow } from "./StatusBadges";

interface UseFilteredRowsParams {
  companies?: Company[];
  invitations?: CompanyInvitation[];
  searchQuery: string;
  statusFilter: "all" | "main" | "partner" | "basic";
  frRespFilter: number | "all";
  invitationStatusFilter: "all" | "accepted" | "expired" | "not accepted";
  showInvitations: boolean;
}

export function useFilteredRows({
  companies,
  invitations,
  searchQuery,
  statusFilter,
  frRespFilter,
  invitationStatusFilter,
  showInvitations,
}: UseFilteredRowsParams) {
  const filteredRows = React.useMemo(() => {
    const rows: TableRow[] = [];

    // Get set of company emails to avoid duplicates
    const companyEmails = new Set<string>();
    if (companies) {
      companies.forEach((company) => {
        companyEmails.add(company.email.toLowerCase());
      });
    }

    // Add companies (treat them as accepted invitations)
    if (companies) {
      companies.forEach((company) => {
        // Status filter
        if (statusFilter !== "all" && company.status !== statusFilter) {
          return;
        }

        // FR Resp filter - only apply to companies
        if (frRespFilter !== "all") {
          if (!company.fr_resp || company.fr_resp !== frRespFilter) {
            return;
          }
        }

        // Invitation status filter - companies are treated as accepted invitations
        if (invitationStatusFilter !== "all") {
          if (invitationStatusFilter !== "accepted") {
            // Hide companies when filter is "expired" or "not accepted"
            return;
          }
        }

        // Search filter
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

    // Add invitations (only if showInvitations is true)
    if (showInvitations && invitations) {
      invitations.forEach((invitation) => {
        // Skip accepted invitations if company exists (avoid duplicates)
        if (
          invitation.invitation_status === "accepted" &&
          companyEmails.has(invitation.email.toLowerCase())
        ) {
          return;
        }

        // Invitation status filter
        if (
          invitationStatusFilter !== "all" &&
          invitation.invitation_status !== invitationStatusFilter
        ) {
          return;
        }

        // FR Resp filter
        if (frRespFilter !== "all") {
          if (!invitation.fr_resp || invitation.fr_resp !== frRespFilter) {
            return;
          }
        }

        // Status filter (for company status)
        if (
          statusFilter !== "all" &&
          invitation.company_status !== statusFilter
        ) {
          return;
        }

        // Search filter
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

    // Sort by created_at descending (newest first)
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
    invitationStatusFilter,
    showInvitations,
  ]);

  const totalCount = React.useMemo(() => {
    // Get set of company emails to identify duplicates
    const companyEmails = new Set<string>();
    if (companies) {
      companies.forEach((company) => {
        companyEmails.add(company.email.toLowerCase());
      });
    }

    let count = companies?.length || 0;

    // Add invitations, but exclude accepted ones that have corresponding companies
    if (showInvitations && invitations) {
      invitations.forEach((invitation) => {
        // Skip accepted invitations if company exists (avoid duplicates)
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

