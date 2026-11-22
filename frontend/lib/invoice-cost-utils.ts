import { apiClient, JobwallPriceResponse } from "@/lib/api";
import {
  calculateLunchSummary,
  FREE_LUNCHES_PER_DAY,
  parseLunchPrice,
} from "@/lib/stage5-utils";
import type {
  DayOption,
  EquipmentSelection,
  Stage2Data,
  Stage4Data,
  Stage5Data,
} from "@/lib/types";

export interface CompanyCostPaidEquipmentItem {
  id: number;
  code?: string | null;
  name_pl: string;
  name_en: string;
  quantity: number;
  included_quantity: number;
  paid_quantity: number;
  unit_price: string;
  cost: string;
}

export interface CompanyCostSummary {
  company_id: number;
  company_status: "main" | "partner" | "basic" | string;
  currency: string;
  vat_excluded: boolean;
  base_package: {
    status: string;
    package_label_pl: string;
    package_label_en: string;
    stand_size: string | null;
    stand_size_label: string | null;
    days_count: number;
    days: string[];
    pending_stand_assignment: boolean;
    individual_pricing: boolean;
    cost: string;
  };
  equipment: {
    paid_items: CompanyCostPaidEquipmentItem[];
    cost: string;
  };
  jobwall: {
    total_count: number;
    free_count: number;
    extra_count: number;
    max_extra_offers: number;
    max_total_offers: number;
    pack: number | null;
    pack_2_price: string;
    pack_3_price: string;
    cost: string;
  };
  lunches: {
    lunches_declined: boolean;
    free_per_day: number;
    unit_price: string;
    total_lunches: number;
    extra_lunches: number;
    days: Array<{
      day: string;
      quantity: number;
      free_per_day: number;
      extra_quantity: number;
      cost: string;
    }>;
    cost: string;
  };
  total_cost: string;
}

export function parseMoney(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Additional equipment cost beyond free included quantities. */
export function calculateEquipmentAdditionalCost(
  selections: EquipmentSelection[] | undefined | null
): number {
  if (!selections?.length) return 0;
  return selections.reduce((total, sel) => {
    const item = sel.equipment_item;
    if (!item) return total;
    const quantity = Number(sel.quantity) || 0;
    const included = Number(item.included_quantity) || 0;
    const chargeable = Math.max(0, quantity - included);
    const price = parseFloat(String(item.price)) || 0;
    return total + price * chargeable;
  }, 0);
}

/** Pack-based JobWall calculation matching backend companies.pricing. */
export function calculateJobwallPackCost(
  jobwallCount: number,
  freeCount: number,
  pack2Price: number,
  pack3Price: number
): { extraCount: number; pack: number | null; cost: number } {
  const safeTotal = Math.max(0, Number(jobwallCount) || 0);
  const safeFree = Math.max(0, Number(freeCount) || 0);
  const extraCount = Math.max(0, safeTotal - safeFree);
  const p2 = Math.max(0, Number(pack2Price) || 0);
  const p3 = Math.max(0, Number(pack3Price) || 0);

  if (extraCount === 0) {
    return { extraCount: 0, pack: null, cost: 0 };
  }
  if (extraCount <= 2) {
    return { extraCount, pack: 2, cost: p2 };
  }
  if (extraCount === 3) {
    return { extraCount, pack: 3, cost: p3 };
  }
  const fullThrees = Math.floor(extraCount / 3);
  const rem = extraCount % 3;
  return {
    extraCount,
    pack: extraCount,
    cost: fullThrees * p3 + (rem > 0 ? p2 : 0),
  };
}

export function calculateJobwallCost(
  jobwallCount: number,
  jobwallPrice: number,
  freeCount: number = 0
): number {
  const chargeable = Math.max(0, Math.max(0, jobwallCount) - Math.max(0, freeCount));
  return chargeable * Math.max(0, jobwallPrice);
}

export async function fetchCompanyCostSummary(
  companyId: number
): Promise<CompanyCostSummary | null> {
  try {
    const response = await apiClient.get<CompanyCostSummary>(
      `/api/company/${companyId}/cost-summary/`
    );
    return response.data;
  } catch {
    return null;
  }
}

export interface StageCostOverrides {
  equipment?: number;
  equipmentPaidItems?: CompanyCostPaidEquipmentItem[];
  jobwallCount?: number;
  jobwallCostOverride?: number;
  lunches?: Array<{ day?: DayOption | string; lunch_quantity?: number }>;
  lunchesDeclined?: boolean;
  lunchCostOverride?: number;
}

export function applyStageOverridesToSummary(
  summary: CompanyCostSummary,
  overrides: StageCostOverrides = {}
): CompanyCostSummary {
  const baseCost = parseMoney(summary.base_package.cost);
  const equipmentCost =
    overrides.equipment !== undefined
      ? Math.max(0, overrides.equipment)
      : parseMoney(summary.equipment.cost);

  let nextJobwall = { ...summary.jobwall };
  if (overrides.jobwallCount !== undefined) {
    const packCalc = calculateJobwallPackCost(
      overrides.jobwallCount,
      summary.jobwall.free_count,
      parseMoney(summary.jobwall.pack_2_price),
      parseMoney(summary.jobwall.pack_3_price)
    );
    nextJobwall = {
      ...nextJobwall,
      total_count: Math.max(0, overrides.jobwallCount),
      extra_count: packCalc.extraCount,
      pack: packCalc.pack,
      cost: (
        overrides.jobwallCostOverride !== undefined
          ? Math.max(0, overrides.jobwallCostOverride)
          : packCalc.cost
      ).toFixed(2),
    };
  } else if (overrides.jobwallCostOverride !== undefined) {
    nextJobwall = {
      ...nextJobwall,
      cost: Math.max(0, overrides.jobwallCostOverride).toFixed(2),
    };
  }

  let nextLunches = { ...summary.lunches };
  if (overrides.lunchesDeclined) {
    nextLunches = {
      ...nextLunches,
      lunches_declined: true,
      total_lunches: 0,
      extra_lunches: 0,
      cost: "0.00",
    };
  } else if (overrides.lunches !== undefined) {
    const unitPrice = parseMoney(summary.lunches.unit_price);
    const lunchSum = calculateLunchSummary(
      overrides.lunches,
      unitPrice,
      summary.lunches.free_per_day
    );
    nextLunches = {
      ...nextLunches,
      lunches_declined: false,
      total_lunches: lunchSum.day1Ordered + lunchSum.day2Ordered,
      extra_lunches: lunchSum.paidLunches,
      cost: (
        overrides.lunchCostOverride !== undefined
          ? Math.max(0, overrides.lunchCostOverride)
          : lunchSum.totalCost
      ).toFixed(2),
    };
  } else if (overrides.lunchCostOverride !== undefined) {
    nextLunches = {
      ...nextLunches,
      cost: Math.max(0, overrides.lunchCostOverride).toFixed(2),
    };
  }

  const totalCost =
    baseCost +
    equipmentCost +
    parseMoney(nextJobwall.cost) +
    parseMoney(nextLunches.cost);

  return {
    ...summary,
    equipment: {
      paid_items: overrides.equipmentPaidItems ?? summary.equipment.paid_items,
      cost: equipmentCost.toFixed(2),
    },
    jobwall: nextJobwall,
    lunches: nextLunches,
    total_cost: totalCost.toFixed(2),
  };
}

type JobwallPricing = {
  jobwall_price: number;
  jobwall_free_count: number;
  jobwall_pack_2_price: number;
  jobwall_pack_3_price: number;
};

async function fetchJobwallPricing(companyId?: number): Promise<JobwallPricing> {
  try {
    const response = await apiClient.get<JobwallPriceResponse>(
      "/api/jobwall-price/",
      companyId ? { params: { company_id: companyId } } : undefined
    );
    return {
      jobwall_price:
        parseFloat(String(response.data?.jobwall_price ?? "0")) || 0,
      jobwall_free_count: Math.max(
        0,
        Number(response.data?.jobwall_free_count ?? 0) || 0
      ),
      jobwall_pack_2_price:
        parseFloat(String(response.data?.jobwall_pack_2_price ?? "480")) || 480,
      jobwall_pack_3_price:
        parseFloat(String(response.data?.jobwall_pack_3_price ?? "630")) || 630,
    };
  } catch {
    return {
      jobwall_price: 0,
      jobwall_free_count: 0,
      jobwall_pack_2_price: 480,
      jobwall_pack_3_price: 630,
    };
  }
}

async function fetchLunchSettings(companyId?: number): Promise<{
  lunchPrice: number;
  freePerDay: number;
}> {
  try {
    const response = await apiClient.get<{
      lunch_price?: string;
      lunches_free_per_day?: number;
    }>("/api/lunch-price/", companyId ? { params: { company_id: companyId } } : undefined);
    return {
      lunchPrice: parseLunchPrice(response.data?.lunch_price),
      freePerDay: Math.max(
        0,
        Number(response.data?.lunches_free_per_day ?? FREE_LUNCHES_PER_DAY) ||
          FREE_LUNCHES_PER_DAY
      ),
    };
  } catch {
    return { lunchPrice: 0, freePerDay: FREE_LUNCHES_PER_DAY };
  }
}

export async function fetchSavedEquipmentCost(
  companyId: number
): Promise<number> {
  try {
    const response = await apiClient.get<Stage2Data>(
      `/api/company/${companyId}/form/stage-2/`
    );
    return calculateEquipmentAdditionalCost(
      response.data?.equipment_selections
    );
  } catch {
    return 0;
  }
}

export async function fetchSavedJobwallCost(
  companyId: number,
  _jobwallPrice?: number,
  jobwallFreeCount?: number
): Promise<number> {
  const pricing = await fetchJobwallPricing(companyId);
  const freeCount =
    jobwallFreeCount === undefined ? pricing.jobwall_free_count : jobwallFreeCount;
  try {
    const response = await apiClient.get<Stage4Data>(
      `/api/company/${companyId}/form/stage-4/`
    );
    const count = response.data?.jobwalls?.length ?? 0;
    return calculateJobwallPackCost(
      count,
      freeCount,
      pricing.jobwall_pack_2_price,
      pricing.jobwall_pack_3_price
    ).cost;
  } catch {
    return 0;
  }
}

export async function fetchSavedLunchCost(companyId: number): Promise<number> {
  try {
    const [stage5Res, lunchSettings] = await Promise.all([
      apiClient.get<Stage5Data>(`/api/company/${companyId}/form/stage-5/`),
      fetchLunchSettings(companyId),
    ]);
    const stage5 = stage5Res.data;
    if (stage5?.final_data?.lunches_declined) return 0;
    return calculateLunchSummary(
      stage5?.lunches || [],
      lunchSettings.lunchPrice,
      lunchSettings.freePerDay
    ).totalCost;
  } catch {
    return 0;
  }
}

export type InvoiceCostOverrides = {
  /** Use current form amount instead of saved Stage 2 */
  equipment?: number;
  /** Use current form amount instead of saved Stage 4 */
  jobwall?: number;
  /** Use current form amount instead of saved Stage 5 */
  lunch?: number;
};

/**
 * Total netto cost from backend cost-summary (or fallback stage sum).
 */
export async function fetchInvoiceTotal(
  companyId: number,
  overrides: InvoiceCostOverrides = {}
): Promise<number> {
  const summary = await fetchCompanyCostSummary(companyId);
  if (summary) {
    const updated = applyStageOverridesToSummary(summary, {
      equipment: overrides.equipment,
      jobwallCostOverride: overrides.jobwall,
      lunchCostOverride: overrides.lunch,
    });
    return parseMoney(updated.total_cost);
  }

  const [equipment, jobwall, lunch] = await Promise.all([
    overrides.equipment !== undefined
      ? Promise.resolve(overrides.equipment)
      : fetchSavedEquipmentCost(companyId),
    overrides.jobwall !== undefined
      ? Promise.resolve(overrides.jobwall)
      : fetchSavedJobwallCost(companyId),
    overrides.lunch !== undefined
      ? Promise.resolve(overrides.lunch)
      : fetchSavedLunchCost(companyId),
  ]);

  return equipment + jobwall + lunch;
}
