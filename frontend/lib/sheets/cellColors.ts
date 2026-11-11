/** Allowed fill colours for sheet cells (must match backend ALLOWED_CELL_BG). */

export const SHEET_CELL_COLORS: { id: string; label: string; value: string }[] = [
  { id: "none", label: "Brak", value: "" },
  { id: "yellow", label: "Żółty", value: "#FEF08A" },
  { id: "green", label: "Zielony", value: "#BBF7D0" },
  { id: "blue", label: "Niebieski", value: "#BFDBFE" },
  { id: "pink", label: "Różowy", value: "#FBCFE8" },
  { id: "orange", label: "Pomarańczowy", value: "#FED7AA" },
  { id: "gray", label: "Szary", value: "#E5E7EB" },
];

export function cellStyleId(companyId: number, columnKey: string) {
  return `${companyId}|${columnKey}`;
}
