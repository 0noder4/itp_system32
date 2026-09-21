import { apiClient } from "@/lib/api";
import { calculateLunchSummary, parseLunchPrice } from "@/lib/stage5-utils";
import type {
  EquipmentSelection,
  Stage2Data,
  Stage4Data,
  Stage5Data,
} from "@/lib/types";

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

export function calculateJobwallCost(
  jobwallCount: number,
  jobwallPrice: number
): number {
  return Math.max(0, jobwallCount) * Math.max(0, jobwallPrice);
}

async function fetchJobwallUnitPrice(): Promise<number> {
  try {
    const response = await apiClient.get<{ jobwall_price?: string }>(
      "/api/jobwall-price/"
    );
    return parseFloat(String(response.data?.jobwall_price ?? "0")) || 0;
  } catch {
    return 0;
  }
}

async function fetchLunchUnitPrice(): Promise<number> {
  try {
    const response = await apiClient.get<{ lunch_price?: string }>(
      "/api/lunch-price/"
    );
    return parseLunchPrice(response.data?.lunch_price);
  } catch {
    return 0;
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
  jobwallPrice?: number
): Promise<number> {
  const price =
    jobwallPrice === undefined ? await fetchJobwallUnitPrice() : jobwallPrice;
  try {
    const response = await apiClient.get<Stage4Data>(
      `/api/company/${companyId}/form/stage-4/`
    );
    const count = response.data?.jobwalls?.length ?? 0;
    return calculateJobwallCost(count, price);
  } catch {
    return 0;
  }
}

export async function fetchSavedLunchCost(companyId: number): Promise<number> {
  try {
    const [stage5Res, lunchPrice] = await Promise.all([
      apiClient.get<Stage5Data>(`/api/company/${companyId}/form/stage-5/`),
      fetchLunchUnitPrice(),
    ]);
    const stage5 = stage5Res.data;
    if (stage5?.final_data?.lunches_declined) return 0;
    return calculateLunchSummary(stage5?.lunches || [], lunchPrice).totalCost;
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
 * Full invoice total across all paid stages (2 equipment, 4 jobwall, 5 lunches).
 * Pass overrides for the stage being submitted so current form values replace saved ones.
 * Other stages always come from saved API data — covers editing an earlier stage
 * after later paid stages are already filled.
 */
export async function fetchInvoiceTotal(
  companyId: number,
  overrides: InvoiceCostOverrides = {}
): Promise<number> {
  const needJobwallPrice = overrides.jobwall === undefined;
  const jobwallPrice = needJobwallPrice
    ? await fetchJobwallUnitPrice()
    : undefined;

  const [equipment, jobwall, lunch] = await Promise.all([
    overrides.equipment !== undefined
      ? Promise.resolve(overrides.equipment)
      : fetchSavedEquipmentCost(companyId),
    overrides.jobwall !== undefined
      ? Promise.resolve(overrides.jobwall)
      : fetchSavedJobwallCost(companyId, jobwallPrice),
    overrides.lunch !== undefined
      ? Promise.resolve(overrides.lunch)
      : fetchSavedLunchCost(companyId),
  ]);

  return equipment + jobwall + lunch;
}
