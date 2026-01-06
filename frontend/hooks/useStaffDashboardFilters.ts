import * as React from "react";

const STORAGE_KEY = "staff_dashboard_filters";

export interface StaffDashboardFilters {
  searchQuery: string;
  statusFilter: "all" | "main" | "partner" | "basic";
  invitationStatusFilter: "all" | "accepted" | "expired" | "not accepted";
  frRespFilter: number | "all";
  showInvitations: boolean;
}

const defaultFilters: StaffDashboardFilters = {
  searchQuery: "",
  statusFilter: "all",
  invitationStatusFilter: "all",
  frRespFilter: "all",
  showInvitations: true,
};

function loadFiltersFromStorage(): StaffDashboardFilters {
  if (typeof window === "undefined") {
    return defaultFilters;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
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
          ["all", "accepted", "expired", "not accepted"].includes(parsed.invitationStatusFilter)
            ? parsed.invitationStatusFilter
            : defaultFilters.invitationStatusFilter,
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
      (status: "all" | "accepted" | "expired" | "not accepted") =>
        updateFilters({ invitationStatusFilter: status }),
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










