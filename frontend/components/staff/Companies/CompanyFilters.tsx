"use client";

import React from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { StaffUser } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import { cn } from "@/lib/utils";
import {
  nativeCheckboxClassName,
  nativeChoiceAppearanceStyle,
} from "@/lib/native-choice-styles";

import {
  COMPANY_STATUS_FILTER_OPTIONS,
  INVITATION_STATUS_FILTER_OPTIONS,
  STAGE_STATUS_FILTER_OPTIONS,
  type CompanyStatusFilterValue,
  type CompletedStageNumber,
  type InvitationStatusFilterValue,
  type StaffMemberFilterValue,
  type StageStatusFilterValue,
} from "@/hooks/useStaffDashboardFilters";

const COMPLETED_STAGE_OPTIONS: CompletedStageNumber[] = [1, 2, 3, 4, 5];

const STAGE_STATUS_TRANSLATION_KEY: Record<StageStatusFilterValue, string> = {
  not_started: "exhibitor.status.notStarted",
  in_progress: "exhibitor.status.inProgress",
  pending_approval: "exhibitor.status.pendingApproval",
  rejected: "exhibitor.status.rejected",
  accepted: "exhibitor.status.accepted",
};

interface CompanyFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: CompanyStatusFilterValue[];
  onStatusFilterChange: (statuses: CompanyStatusFilterValue[]) => void;
  invitationStatusFilter: InvitationStatusFilterValue[];
  onInvitationStatusFilterChange: (
    statuses: InvitationStatusFilterValue[]
  ) => void;
  stageStatusFilter: StageStatusFilterValue[];
  onStageStatusFilterChange: (statuses: StageStatusFilterValue[]) => void;
  stageStatusScope: CompletedStageNumber[];
  onStageStatusScopeChange: (scope: CompletedStageNumber[]) => void;
  frRespFilter: StaffMemberFilterValue[];
  onFrRespFilterChange: (frResp: StaffMemberFilterValue[]) => void;
  opiekunFilter: StaffMemberFilterValue[];
  onOpiekunFilterChange: (opiekun: StaffMemberFilterValue[]) => void;
  showInvitations: boolean;
  onShowInvitationsChange: (show: boolean) => void;
  staffMembers?: StaffUser[];
  opiekunMembers?: StaffUser[];
  filteredCount: number;
  totalCount: number;
  onSendReminders?: () => void;
  sendRemindersDisabled?: boolean;
  onExportToWebsite?: () => void;
  exportToWebsiteDisabled?: boolean;
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        active
          ? "border-[#DB5ABA] bg-[#DB5ABA] text-white hover:border-[#C84FA8] hover:bg-[#C84FA8]"
          : "hover:border-[#DB5ABA] hover:text-[#DB5ABA]"
      )}
    >
      {children}
    </Button>
  );
}

function FilterSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-medium">{label}</h3>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function AccentActionButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      className="text-xs sm:text-sm whitespace-nowrap"
      size="sm"
      disabled={disabled}
      style={{ backgroundColor: disabled ? undefined : STAFF_ACCENT_COLOR }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = "#C84FA8";
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
      }}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function toggleArrayItem<T>(items: T[], item: T): T[] {
  return items.includes(item)
    ? items.filter((entry) => entry !== item)
    : [...items, item];
}

function staffDisplayName(staff: StaffUser): string {
  return staff.first_name || staff.last_name
    ? `${staff.first_name || ""} ${staff.last_name || ""}`.trim()
    : staff.username;
}

export function CompanyFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  invitationStatusFilter,
  onInvitationStatusFilterChange,
  stageStatusFilter,
  onStageStatusFilterChange,
  stageStatusScope,
  onStageStatusScopeChange,
  frRespFilter,
  onFrRespFilterChange,
  opiekunFilter,
  onOpiekunFilterChange,
  showInvitations,
  onShowInvitationsChange,
  staffMembers,
  opiekunMembers,
  filteredCount,
  totalCount,
  onSendReminders,
  sendRemindersDisabled = false,
  onExportToWebsite,
  exportToWebsiteDisabled = false,
}: CompanyFiltersProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const getInvitationStatusLabel = (status: InvitationStatusFilterValue) => {
    const statusKey = status === "not accepted" ? "notAccepted" : status;
    return t(`companies.invitations.status.${statusKey}`);
  };

  const activeFilterCount =
    (statusFilter.length > 0 ? 1 : 0) +
    (frRespFilter.length > 0 ? 1 : 0) +
    (opiekunFilter.length > 0 ? 1 : 0) +
    (showInvitations && invitationStatusFilter.length > 0 ? 1 : 0) +
    (stageStatusFilter.length > 0 ? 1 : 0);

  const hasActiveFilters = Boolean(searchQuery) || activeFilterCount > 0;

  const handleClearFilters = () => {
    onSearchChange("");
    onStatusFilterChange([]);
    onFrRespFilterChange([]);
    onOpiekunFilterChange([]);
    onInvitationStatusFilterChange([]);
    onStageStatusFilterChange([]);
    onStageStatusScopeChange([]);
  };

  const resultsText = t("companies.showingResults", {
    filtered: filteredCount,
    total: totalCount,
  });

  return (
    <div className="mb-3 shrink-0 space-y-2">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t("companies.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-9 text-sm"
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
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "text-xs sm:text-sm whitespace-nowrap",
              activeFilterCount > 0 && "border-[#DB5ABA] text-[#DB5ABA]"
            )}
            onClick={() => setDialogOpen(true)}
          >
            <SlidersHorizontal className="mr-1 h-4 w-4" />
            {t("companies.filters.editButton")}
            {activeFilterCount > 0 ? (
              <span
                className="ml-1 rounded-full px-1.5 text-xs font-semibold text-white"
                style={{ backgroundColor: STAFF_ACCENT_COLOR }}
              >
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-xs sm:text-sm hover:text-[#DB5ABA]"
            >
              {t("common.clearFilters")}
            </Button>
          )}
          {onSendReminders && (
            <AccentActionButton
              disabled={sendRemindersDisabled}
              onClick={onSendReminders}
            >
              {t("reminders.sendButton")}
            </AccentActionButton>
          )}
          {onExportToWebsite && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <AccentActionButton
                    disabled={exportToWebsiteDisabled}
                    onClick={onExportToWebsite}
                  >
                    {t("websiteExport.sendButton")}
                  </AccentActionButton>
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                {t("websiteExport.tooltip")}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="text-xs sm:text-sm text-muted-foreground">
        {resultsText}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[min(900px,95vw)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("companies.filters.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("companies.filters.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="show-invitations"
                checked={showInvitations}
                onChange={(e) => onShowInvitationsChange(e.target.checked)}
                className={nativeCheckboxClassName}
                style={nativeChoiceAppearanceStyle}
              />
              <Label
                htmlFor="show-invitations"
                className="text-sm font-normal cursor-pointer"
              >
                {t("companies.invitations.showInvitations")}
              </Label>
            </div>

            <FilterSection label={t("companies.filterByStatus")}>
              <FilterChip
                active={statusFilter.length === 0}
                onClick={() => onStatusFilterChange([])}
              >
                {t("common.all")}
              </FilterChip>
              {COMPANY_STATUS_FILTER_OPTIONS.map((status) => (
                <FilterChip
                  key={status}
                  active={statusFilter.includes(status)}
                  onClick={() =>
                    onStatusFilterChange(toggleArrayItem(statusFilter, status))
                  }
                >
                  {t(`companies.status.${status}`)}
                </FilterChip>
              ))}
            </FilterSection>

            {showInvitations && (
              <FilterSection label={t("companies.invitations.filterByStatus")}>
                <FilterChip
                  active={invitationStatusFilter.length === 0}
                  onClick={() => onInvitationStatusFilterChange([])}
                >
                  {t("common.all")}
                </FilterChip>
                {INVITATION_STATUS_FILTER_OPTIONS.map((status) => (
                  <FilterChip
                    key={status}
                    active={invitationStatusFilter.includes(status)}
                    onClick={() =>
                      onInvitationStatusFilterChange(
                        toggleArrayItem(invitationStatusFilter, status)
                      )
                    }
                  >
                    {getInvitationStatusLabel(status)}
                  </FilterChip>
                ))}
              </FilterSection>
            )}

            <FilterSection
              label={t("companies.filterByStageStatus")}
              hint={t("companies.filterByStageStatusHint")}
            >
              <FilterChip
                active={stageStatusFilter.length === 0}
                onClick={() => onStageStatusFilterChange([])}
              >
                {t("common.all")}
              </FilterChip>
              {STAGE_STATUS_FILTER_OPTIONS.map((status) => (
                <FilterChip
                  key={status}
                  active={stageStatusFilter.includes(status)}
                  onClick={() =>
                    onStageStatusFilterChange(
                      toggleArrayItem(stageStatusFilter, status)
                    )
                  }
                >
                  {t(STAGE_STATUS_TRANSLATION_KEY[status])}
                </FilterChip>
              ))}
            </FilterSection>

            <FilterSection label={t("companies.stageStatusScope")}>
              <FilterChip
                active={stageStatusScope.length === 0}
                onClick={() => onStageStatusScopeChange([])}
              >
                {t("companies.stageStatusScopeAny")}
              </FilterChip>
              {COMPLETED_STAGE_OPTIONS.map((stage) => (
                <FilterChip
                  key={stage}
                  active={stageStatusScope.includes(stage)}
                  onClick={() =>
                    onStageStatusScopeChange(
                      toggleArrayItem(stageStatusScope, stage)
                    )
                  }
                >
                  {t("companies.stageFilterLabel", { stage })}
                </FilterChip>
              ))}
            </FilterSection>

            <FilterSection label={t("companies.filterByFrResp")}>
              <FilterChip
                active={frRespFilter.length === 0}
                onClick={() => onFrRespFilterChange([])}
              >
                {t("common.all")}
              </FilterChip>
              <FilterChip
                active={frRespFilter.includes("unassigned")}
                onClick={() =>
                  onFrRespFilterChange(
                    toggleArrayItem(frRespFilter, "unassigned")
                  )
                }
              >
                {t("companies.unassigned")}
              </FilterChip>
              {staffMembers?.map((staff) => (
                <FilterChip
                  key={staff.id}
                  active={frRespFilter.includes(staff.id)}
                  onClick={() =>
                    onFrRespFilterChange(
                      toggleArrayItem(frRespFilter, staff.id)
                    )
                  }
                >
                  {staffDisplayName(staff)}
                </FilterChip>
              ))}
            </FilterSection>

            <FilterSection label={t("companies.filterByOpiekun")}>
              <FilterChip
                active={opiekunFilter.length === 0}
                onClick={() => onOpiekunFilterChange([])}
              >
                {t("common.all")}
              </FilterChip>
              <FilterChip
                active={opiekunFilter.includes("unassigned")}
                onClick={() =>
                  onOpiekunFilterChange(
                    toggleArrayItem(opiekunFilter, "unassigned")
                  )
                }
              >
                {t("companies.unassigned")}
              </FilterChip>
              {opiekunMembers?.map((staff) => (
                <FilterChip
                  key={staff.id}
                  active={opiekunFilter.includes(staff.id)}
                  onClick={() =>
                    onOpiekunFilterChange(
                      toggleArrayItem(opiekunFilter, staff.id)
                    )
                  }
                >
                  {staffDisplayName(staff)}
                </FilterChip>
              ))}
            </FilterSection>
          </div>

          <DialogFooter className="items-center gap-2 sm:justify-between sm:space-x-0">
            <span className="text-sm text-muted-foreground">{resultsText}</span>
            <div className="flex gap-2">
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearFilters}
                >
                  {t("common.clearFilters")}
                </Button>
              )}
              <Button
                type="button"
                style={{ backgroundColor: STAFF_ACCENT_COLOR }}
                onClick={() => setDialogOpen(false)}
              >
                {t("companies.filters.done")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
