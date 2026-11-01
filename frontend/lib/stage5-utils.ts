import { AttendanceOption, DayOption, Lunch } from "@/lib/types";
import { apiClient } from "@/lib/api";
import { Company } from "@/lib/types";
import { getUserInfo } from "@/lib/auth";

export const FREE_LUNCHES_PER_DAY = 2;

/** Normalize API time (`HH:MM:SS` / `HH:MM`) to `HH:MM`. */
export function toTimeInputValue(value?: string | null): string {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (trimmed.length >= 5) return trimmed.slice(0, 5);
  return trimmed;
}

export function formatArrivalTime(value?: string | null): string {
  const normalized = toTimeInputValue(value);
  return normalized || "—";
}

export const ARRIVAL_HOURS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0")
);

/** 5-minute steps — short lists, steady native <select> scrolling. */
export const ARRIVAL_MINUTES = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0")
);

export function splitArrivalTime(value?: string | null): {
  hour: string;
  minute: string;
} {
  const normalized = toTimeInputValue(value);
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    return { hour: "", minute: "" };
  }
  const hour = normalized.slice(0, 2);
  let minute = normalized.slice(3, 5);
  // Snap odd minutes from legacy time inputs to nearest 5-min step.
  if (!ARRIVAL_MINUTES.includes(minute)) {
    const rounded = String(Math.round(Number(minute) / 5) * 5 % 60).padStart(
      2,
      "0"
    );
    minute = ARRIVAL_MINUTES.includes(rounded) ? rounded : "00";
  }
  return { hour, minute };
}

export function joinArrivalTime(hour: string, minute: string): string {
  if (!hour || !minute) return "";
  return `${hour}:${minute}`;
}

/** Fixed day1 + day2 rows with summed quantities (diet chosen on-site). */
export function toFixedLunchRows(
  lunches: Array<{ day?: DayOption | string; lunch_quantity?: number }> = []
): Pick<Lunch, "day" | "lunch_quantity" | "diet_info">[] {
  const day1Ordered = lunches
    .filter((l) => l.day === "day1")
    .reduce((sum, l) => sum + (Number(l.lunch_quantity) || 0), 0);
  const day2Ordered = lunches
    .filter((l) => l.day === "day2")
    .reduce((sum, l) => sum + (Number(l.lunch_quantity) || 0), 0);

  return [
    { day: "day1", lunch_quantity: day1Ordered, diet_info: "" },
    { day: "day2", lunch_quantity: day2Ordered, diet_info: "" },
  ];
}

export function parseLunchPrice(
  value: string | number | undefined | null
): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const normalized = String(value).replace(",", ".").trim();
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface LunchSummary {
  day1Ordered: number;
  day2Ordered: number;
  day1FreeUsed: number;
  day2FreeUsed: number;
  day1FreeRemaining: number;
  day2FreeRemaining: number;
  totalFreeRemaining: number;
  paidLunches: number;
  totalCost: number;
}

export function calculateLunchSummary(
  lunches: Array<{ day?: DayOption | string; lunch_quantity?: number }>,
  lunchPrice: number
): LunchSummary {
  const day1Ordered = lunches
    .filter((l) => l.day === "day1")
    .reduce((sum, l) => sum + (Number(l.lunch_quantity) || 0), 0);
  const day2Ordered = lunches
    .filter((l) => l.day === "day2")
    .reduce((sum, l) => sum + (Number(l.lunch_quantity) || 0), 0);

  const day1FreeUsed = Math.min(day1Ordered, FREE_LUNCHES_PER_DAY);
  const day2FreeUsed = Math.min(day2Ordered, FREE_LUNCHES_PER_DAY);
  const day1FreeRemaining = Math.max(0, FREE_LUNCHES_PER_DAY - day1Ordered);
  const day2FreeRemaining = Math.max(0, FREE_LUNCHES_PER_DAY - day2Ordered);

  const paidLunches =
    Math.max(0, day1Ordered - FREE_LUNCHES_PER_DAY) +
    Math.max(0, day2Ordered - FREE_LUNCHES_PER_DAY);

  return {
    day1Ordered,
    day2Ordered,
    day1FreeUsed,
    day2FreeUsed,
    day1FreeRemaining,
    day2FreeRemaining,
    totalFreeRemaining: day1FreeRemaining + day2FreeRemaining,
    paidLunches,
    totalCost: paidLunches * lunchPrice,
  };
}

export function coversFairDay(
  attendance: AttendanceOption | "" | undefined,
  day: DayOption
): boolean {
  if (attendance === "both") return true;
  return attendance === day;
}

export function countDayCoverage(
  mainRepAttendance: AttendanceOption | "" | undefined,
  exhibitors: Array<{ attendance?: AttendanceOption | "" }>,
  day: DayOption
): number {
  let count = coversFairDay(mainRepAttendance, day) ? 1 : 0;
  for (const exhibitor of exhibitors) {
    if (coversFairDay(exhibitor.attendance, day)) {
      count += 1;
    }
  }
  return count;
}

export async function fetchDefaultMainRepContact(companyId: number): Promise<{
  name: string;
  surname: string;
  phone_number: string;
}> {
  let name = "";
  let surname = "";
  let phone_number = "";

  const userInfo = getUserInfo();

  if (companyId) {
    try {
      const response = await apiClient.get<Company>(`/api/company/${companyId}/`);
      const company = response.data;
      if (company.representative_name && company.representative_surname) {
        name = company.representative_name;
        surname = company.representative_surname;
        phone_number = company.representative_phone_number || "";
      }
    } catch (error) {
      console.warn("Failed to fetch company data:", error);
    }
  }

  if (!name && !surname && userInfo?.username) {
    const parts = userInfo.username.split(/\s+/);
    if (parts.length >= 2) {
      name = parts[0];
      surname = parts.slice(1).join(" ");
    } else {
      name = userInfo.username;
    }
  }

  return { name, surname, phone_number };
}

export function hasSavedMainRep(finalData?: {
  main_rep_name?: string;
  main_rep_surname?: string;
  main_rep_phone?: string;
  main_rep_attendance?: string;
}): boolean {
  if (!finalData) return false;
  return Boolean(
    (finalData.main_rep_name || "").trim() ||
      (finalData.main_rep_surname || "").trim() ||
      (finalData.main_rep_phone || "").trim() ||
      finalData.main_rep_attendance
  );
}
