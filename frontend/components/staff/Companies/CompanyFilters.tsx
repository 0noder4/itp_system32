"use client";

import React from "react";
import { Search, X } from "lucide-react";
import { StaffUser } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";

interface CompanyFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: "all" | "main" | "partner" | "basic";
  onStatusFilterChange: (status: "all" | "main" | "partner" | "basic") => void;
  invitationStatusFilter: "all" | "accepted" | "expired" | "not accepted";
  onInvitationStatusFilterChange: (
    status: "all" | "accepted" | "expired" | "not accepted"
  ) => void;
  frRespFilter: number | "all";
  onFrRespFilterChange: (frResp: number | "all") => void;
  showInvitations: boolean;
  onShowInvitationsChange: (show: boolean) => void;
  staffMembers?: StaffUser[];
  filteredCount: number;
  totalCount: number;
}

export function CompanyFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  invitationStatusFilter,
  onInvitationStatusFilterChange,
  frRespFilter,
  onFrRespFilterChange,
  showInvitations,
  onShowInvitationsChange,
  staffMembers,
  filteredCount,
  totalCount,
}: CompanyFiltersProps) {
  const { t } = useTranslation();

  const getStatusLabel = (status: "all" | "main" | "partner" | "basic") => {
    if (status === "all") return t("common.all");
    return t(`companies.status.${status}`);
  };

  const getInvitationStatusLabel = (
    status: "all" | "accepted" | "expired" | "not accepted"
  ) => {
    if (status === "all") return t("common.all");
    // Map status value to translation key (status has space, key doesn't)
    const statusKey = status === "not accepted" ? "notAccepted" : status;
    return t(`companies.invitations.status.${statusKey}`);
  };

  const hasActiveFilters =
    searchQuery ||
    statusFilter !== "all" ||
    frRespFilter !== "all" ||
    invitationStatusFilter !== "all";

  const handleClearFilters = () => {
    onSearchChange("");
    onStatusFilterChange("all");
    onFrRespFilterChange("all");
    onInvitationStatusFilterChange("all");
  };

  return (
    <div className="mb-4 shrink-0 space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t("companies.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={() => onSearchChange("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Show Invitations Checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="show-invitations"
          checked={showInvitations}
          onChange={(e) => onShowInvitationsChange(e.target.checked)}
          className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
        />
        <Label
          htmlFor="show-invitations"
          className="text-sm font-normal cursor-pointer"
        >
          {t("companies.invitations.showInvitations")}
        </Label>
      </div>

      {/* Company Status Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {t("companies.filterByStatus")}:
        </span>
        <div className="flex gap-2">
          {(["all", "main", "partner", "basic"] as const).map((status) => {
            const isActive = statusFilter === status;
            return (
              <Button
                key={status}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onStatusFilterChange(status)}
                style={
                  isActive
                    ? { backgroundColor: STAFF_ACCENT_COLOR, color: "#ffffff" }
                    : undefined
                }
                onMouseEnter={(e) => {
                  if (isActive) {
                    e.currentTarget.style.backgroundColor = "#C84FA8";
                    e.currentTarget.style.color = "#ffffff";
                  } else {
                    e.currentTarget.style.borderColor = STAFF_ACCENT_COLOR;
                    e.currentTarget.style.color = STAFF_ACCENT_COLOR;
                  }
                }}
                onMouseLeave={(e) => {
                  if (isActive) {
                    e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
                    e.currentTarget.style.color = "#ffffff";
                  } else {
                    e.currentTarget.style.borderColor = "";
                    e.currentTarget.style.color = "";
                  }
                }}
              >
                {getStatusLabel(status)}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Invitation Status Filter */}
      {showInvitations && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("companies.invitations.filterByStatus")}:
          </span>
          <div className="flex gap-2">
            {(["all", "accepted", "expired", "not accepted"] as const).map(
              (status) => {
                const isActive = invitationStatusFilter === status;
                return (
                  <Button
                    key={status}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    onClick={() => onInvitationStatusFilterChange(status)}
                    style={
                      isActive
                        ? { backgroundColor: STAFF_ACCENT_COLOR, color: "#ffffff" }
                        : undefined
                    }
                    onMouseEnter={(e) => {
                      if (isActive) {
                        e.currentTarget.style.backgroundColor = "#C84FA8";
                        e.currentTarget.style.color = "#ffffff";
                      } else {
                        e.currentTarget.style.borderColor = STAFF_ACCENT_COLOR;
                        e.currentTarget.style.color = STAFF_ACCENT_COLOR;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (isActive) {
                        e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
                        e.currentTarget.style.color = "#ffffff";
                      } else {
                        e.currentTarget.style.borderColor = "";
                        e.currentTarget.style.color = "";
                      }
                    }}
                  >
                    {getInvitationStatusLabel(status)}
                  </Button>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* FR Resp Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {t("companies.filterByFrResp")}:
        </span>
        <div className="flex gap-2">
          <Button
            variant={frRespFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => onFrRespFilterChange("all")}
            style={
              frRespFilter === "all"
                ? { backgroundColor: STAFF_ACCENT_COLOR, color: "#ffffff" }
                : undefined
            }
            onMouseEnter={(e) => {
              if (frRespFilter === "all") {
                e.currentTarget.style.backgroundColor = "#C84FA8";
                e.currentTarget.style.color = "#ffffff";
              } else {
                e.currentTarget.style.borderColor = STAFF_ACCENT_COLOR;
                e.currentTarget.style.color = STAFF_ACCENT_COLOR;
              }
            }}
            onMouseLeave={(e) => {
              if (frRespFilter === "all") {
                e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
                e.currentTarget.style.color = "#ffffff";
              } else {
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.color = "";
              }
            }}
          >
            {t("common.all")}
          </Button>
          {staffMembers?.map((staff) => {
            const isActive = frRespFilter === staff.id;
            return (
              <Button
                key={staff.id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onFrRespFilterChange(staff.id)}
                style={
                  isActive
                    ? { backgroundColor: STAFF_ACCENT_COLOR, color: "#ffffff" }
                    : undefined
                }
                onMouseEnter={(e) => {
                  if (isActive) {
                    e.currentTarget.style.backgroundColor = "#C84FA8";
                    e.currentTarget.style.color = "#ffffff";
                  } else {
                    e.currentTarget.style.borderColor = STAFF_ACCENT_COLOR;
                    e.currentTarget.style.color = STAFF_ACCENT_COLOR;
                  }
                }}
                onMouseLeave={(e) => {
                  if (isActive) {
                    e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
                    e.currentTarget.style.color = "#ffffff";
                  } else {
                    e.currentTarget.style.borderColor = "";
                    e.currentTarget.style.color = "";
                  }
                }}
              >
                {staff.first_name || staff.last_name
                  ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim()
                  : staff.username}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClearFilters}
          className="ml-auto"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = STAFF_ACCENT_COLOR;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "";
          }}
        >
          {t("common.clearFilters")}
        </Button>
      )}

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {t("companies.showingResults", {
          filtered: filteredCount,
          total: totalCount,
        })}
      </div>
    </div>
  );
}
