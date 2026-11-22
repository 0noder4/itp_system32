import * as React from "react";

const STORAGE_KEY = "staff_dashboard_filters";

export type CompletedStageNumber = 1 | 2 | 3 | 4 | 5;

export const COMPANY_STATUS_FILTER_OPTIONS = [
  "main",
  "partner",
  "basic",
] as const;

export type CompanyStatusFilterValue =
  (typeof COMPANY_STATUS_FILTER_OPTIONS)[number];

export const INVITATION_STATUS_FILTER_OPTIONS = [
  "accepted",
  "expired",
  "not accepted",
  "cancelled",
  "resigned",
] as const;

export type InvitationStatusFilterValue =
  (typeof INVITATION_STATUS_FILTER_OPTIONS)[number];

export const STAGE_STATUS_FILTER_OPTIONS = [
  "not_started",
  "in_progress",
  "pending_approval",
  "rejected",
  "accepted",
] as const;

export type StageStatusFilterValue = (typeof STAGE_STATUS_FILTER_OPTIONS)[number];

export type StaffMemberFilterValue = number | "unassigned";

export interface StaffDashboardFilters {
  searchQuery: string;
  statusFilter: CompanyStatusFilterValue[];
  invitationStatusFilter: InvitationStatusFilterValue[];
  stageStatusFilter: StageStatusFilterValue[];
  stageStatusScope: CompletedStageNumber[];
  frRespFilter: StaffMemberFilterValue[];
  opiekunFilter: StaffMemberFilterValue[];
  showInvitations: boolean;
}

const defaultFilters: StaffDashboardFilters = {
  searchQuery: "",
  statusFilter: [],
  invitationStatusFilter: [],
  stageStatusFilter: [],
  stageStatusScope: [],
  frRespFilter: [],
  opiekunFilter: [],
  showInvitations: true,
};

function normalizeStringArray<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T[] {
  if (Array.isArray(value)) {
    return allowed.filter((option) => value.includes(option));
  }
  if (typeof value === "string" && value !== "all") {
    return allowed.includes(value as T) ? [value as T] : [];
  }
  return [];
}

function normalizeStageStatusFilter(value: unknown): StageStatusFilterValue[] {
  return normalizeStringArray(value, STAGE_STATUS_FILTER_OPTIONS);
}

function normalizeStageStatusScope(value: unknown): CompletedStageNumber[] {
  const validStages: CompletedStageNumber[] = [1, 2, 3, 4, 5];
  if (Array.isArray(value)) {
    const picked = value
      .map((item) => Number(item))
      .filter((n): n is CompletedStageNumber =>
        validStages.includes(n as CompletedStageNumber)
      );
    return validStages.filter((n) => picked.includes(n));
  }
  if (value === "any" || value === undefined || value === null) return [];
  const n = typeof value === "number" ? value : Number(value);
  return validStages.includes(n as CompletedStageNumber)
    ? [n as CompletedStageNumber]
    : [];
}

function normalizeStaffFilter(value: unknown): StaffMemberFilterValue[] {
  const items = Array.isArray(value)
    ? value
    : value === "all" || value === undefined || value === null
      ? []
      : [value];
  const result: StaffMemberFilterValue[] = [];
  const seen = new Set<StaffMemberFilterValue>();
  for (const item of items) {
    if (item === "unassigned") {
      if (!seen.has("unassigned")) {
        seen.add("unassigned");
        result.push("unassigned");
      }
      continue;
    }
    const n = typeof item === "number" ? item : Number(item);
    if (Number.isInteger(n) && n > 0 && !seen.has(n)) {
      seen.add(n);
      result.push(n);
    }
  }
  return result;
}

function loadFiltersFromStorage(): StaffDashboardFilters {
  if (typeof window === "undefined") {
    return defaultFilters;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      delete parsed.completedStagesFilter;
      return {
        searchQuery:
          typeof parsed.searchQuery === "string" ? parsed.searchQuery : "",
        statusFilter: normalizeStringArray(
          parsed.statusFilter,
          COMPANY_STATUS_FILTER_OPTIONS
        ),
        invitationStatusFilter: normalizeStringArray(
          parsed.invitationStatusFilter,
          INVITATION_STATUS_FILTER_OPTIONS
        ),
        stageStatusFilter: normalizeStageStatusFilter(parsed.stageStatusFilter),
        stageStatusScope: normalizeStageStatusScope(parsed.stageStatusScope),
        frRespFilter: normalizeStaffFilter(parsed.frRespFilter),
        opiekunFilter: normalizeStaffFilter(parsed.opiekunFilter),
        showInvitations:
          typeof parsed.showInvitations === "boolean"
            ? parsed.showInvitations
            : defaultFilters.showInvitations,
      };
    }
  } catch (error) {
    console.error("Failed to load filters from localStorage:", error);
  }

  return defaultFilters;
}

function saveFiltersToStorage(filters: StaffDashboardFilters): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch (error) {
    console.error("Failed to save filters to localStorage:", error);
  }
}

export function useStaffDashboardFilters() {
  const [filters, setFilters] = React.useState<StaffDashboardFilters>(() =>
    loadFiltersFromStorage()
  );
  const [isInitialized, setIsInitialized] = React.useState(false);

  React.useEffect(() => {
    const loaded = loadFiltersFromStorage();
    setFilters(loaded);
    setIsInitialized(true);
  }, []);

  React.useEffect(() => {
    if (isInitialized) {
      saveFiltersToStorage(filters);
    }
  }, [filters, isInitialized]);

  const updateFilters = React.useCallback(
    (updates: Partial<StaffDashboardFilters>) => {
      setFilters((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const resetFilters = React.useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  return {
    filters,
    setFilters,
    updateFilters,
    resetFilters,
    setSearchQuery: React.useCallback(
      (query: string) => updateFilters({ searchQuery: query }),
      [updateFilters]
    ),
    setStatusFilter: React.useCallback(
      (statuses: CompanyStatusFilterValue[]) =>
        updateFilters({
          statusFilter: normalizeStringArray(
            statuses,
            COMPANY_STATUS_FILTER_OPTIONS
          ),
        }),
      [updateFilters]
    ),
    setInvitationStatusFilter: React.useCallback(
      (statuses: InvitationStatusFilterValue[]) =>
        updateFilters({
          invitationStatusFilter: normalizeStringArray(
            statuses,
            INVITATION_STATUS_FILTER_OPTIONS
          ),
        }),
      [updateFilters]
    ),
    setStageStatusFilter: React.useCallback(
      (statuses: StageStatusFilterValue[]) =>
        updateFilters({
          stageStatusFilter: normalizeStageStatusFilter(statuses),
        }),
      [updateFilters]
    ),
    setStageStatusScope: React.useCallback(
      (scope: CompletedStageNumber[]) =>
        updateFilters({
          stageStatusScope: normalizeStageStatusScope(scope),
        }),
      [updateFilters]
    ),
    setFrRespFilter: React.useCallback(
      (frResp: StaffMemberFilterValue[]) =>
        updateFilters({ frRespFilter: normalizeStaffFilter(frResp) }),
      [updateFilters]
    ),
    setOpiekunFilter: React.useCallback(
      (opiekun: StaffMemberFilterValue[]) =>
        updateFilters({ opiekunFilter: normalizeStaffFilter(opiekun) }),
      [updateFilters]
    ),
    setShowInvitations: React.useCallback(
      (show: boolean) => updateFilters({ showInvitations: show }),
      [updateFilters]
    ),
  };
}
