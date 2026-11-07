import * as React from "react";

const STORAGE_KEY = "staff_dashboard_filters";

export type CompletedStageNumber = 1 | 2 | 3 | 4 | 5;

export const STAGE_STATUS_FILTER_OPTIONS = [
  "not_started",
  "in_progress",
  "pending_approval",
  "rejected",
  "accepted",
] as const;

export type StageStatusFilterValue = (typeof STAGE_STATUS_FILTER_OPTIONS)[number];

export type StageStatusScope = CompletedStageNumber | "any";

export interface StaffDashboardFilters {
  searchQuery: string;
  statusFilter: "all" | "main" | "partner" | "basic";
  invitationStatusFilter:
    | "all"
    | "accepted"
    | "expired"
    | "not accepted"
    | "cancelled"
    | "resigned";
  stageStatusFilter: StageStatusFilterValue[];
  stageStatusScope: StageStatusScope;
  frRespFilter: number | "all";
  showInvitations: boolean;
}

const defaultFilters: StaffDashboardFilters = {
  searchQuery: "",
  statusFilter: "all",
  invitationStatusFilter: "all",
  stageStatusFilter: [],
  stageStatusScope: "any",
  frRespFilter: "all",
  showInvitations: true,
};

function normalizeStageStatusFilter(value: unknown): StageStatusFilterValue[] {
  if (!Array.isArray(value)) {
    return defaultFilters.stageStatusFilter;
  }
  return STAGE_STATUS_FILTER_OPTIONS.filter((option) => value.includes(option));
}

function normalizeStageStatusScope(value: unknown): StageStatusScope {
  if (value === "any") return "any";
  const n = typeof value === "number" ? value : Number(value);
  return [1, 2, 3, 4, 5].includes(n)
    ? (n as CompletedStageNumber)
    : defaultFilters.stageStatusScope;
}

function loadFiltersFromStorage(): StaffDashboardFilters {
  if (typeof window === "undefined") {
    return defaultFilters;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Drop the removed "completed stages" filter if an older browser saved it.
      delete parsed.completedStagesFilter;
      // Validate and merge with defaults to handle schema changes
      return {
        ...defaultFilters,
        ...parsed,
        // Ensure types match
        statusFilter:
          parsed.statusFilter && ["all", "main", "partner", "basic"].includes(parsed.statusFilter)
            ? parsed.statusFilter
            : defaultFilters.statusFilter,
        invitationStatusFilter:
          parsed.invitationStatusFilter &&
          [
            "all",
            "accepted",
            "expired",
            "not accepted",
            "cancelled",
            "resigned",
          ].includes(parsed.invitationStatusFilter)
            ? parsed.invitationStatusFilter
            : defaultFilters.invitationStatusFilter,
        stageStatusFilter: normalizeStageStatusFilter(parsed.stageStatusFilter),
        stageStatusScope: normalizeStageStatusScope(parsed.stageStatusScope),
        frRespFilter:
          parsed.frRespFilter === "all" || typeof parsed.frRespFilter === "number"
            ? parsed.frRespFilter
            : defaultFilters.frRespFilter,
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

  // Load from storage on mount
  React.useEffect(() => {
    const loaded = loadFiltersFromStorage();
    setFilters(loaded);
    setIsInitialized(true);
  }, []);

  // Save to storage whenever filters change (after initialization)
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
      (status: "all" | "main" | "partner" | "basic") =>
        updateFilters({ statusFilter: status }),
      [updateFilters]
    ),
    setInvitationStatusFilter: React.useCallback(
      (
        status:
          | "all"
          | "accepted"
          | "expired"
          | "not accepted"
          | "cancelled"
          | "resigned"
      ) => updateFilters({ invitationStatusFilter: status }),
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
      (scope: StageStatusScope) => updateFilters({ stageStatusScope: scope }),
      [updateFilters]
    ),
    setFrRespFilter: React.useCallback(
      (frResp: number | "all") => updateFilters({ frRespFilter: frResp }),
      [updateFilters]
    ),
    setShowInvitations: React.useCallback(
      (show: boolean) => updateFilters({ showInvitations: show }),
      [updateFilters]
    ),
  };
}
