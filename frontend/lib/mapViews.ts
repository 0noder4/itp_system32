/** Color overlays for staff map “Widoki” (Excel master legend). */

export type MapViewFlags = {
  standSizes: boolean;
  partners: boolean;
  mine: boolean;
};

export const DEFAULT_MAP_VIEW: MapViewFlags = {
  standSizes: false,
  partners: false,
  mine: false,
};

export function isDefaultMapView(view: MapViewFlags): boolean {
  return !view.standSizes && !view.partners && !view.mine;
}

/** Excel-like fills for booth area. */
export const MAP_SIZE_COLORS: Record<number, string> = {
  4: "#A9D08E",
  6: "#9DC3E6",
  8: "#F4B183",
  12: "#D0A9F5",
};

/** Partner / partner główny override (Excel “Partner”). */
export const MAP_PARTNER_COLOR = "#F4A6A6";

/** “Moje firmy” highlight. */
export const MAP_MINE_COLOR = "#DB5ABA";

export function sizeColorForArea(areaM2: number): string | null {
  if (areaM2 in MAP_SIZE_COLORS) return MAP_SIZE_COLORS[areaM2];
  if (areaM2 <= 4) return MAP_SIZE_COLORS[4];
  if (areaM2 <= 6) return MAP_SIZE_COLORS[6];
  if (areaM2 <= 8) return MAP_SIZE_COLORS[8];
  return MAP_SIZE_COLORS[12];
}

export function isPartnerStatus(
  status: string | null | undefined
): boolean {
  return status === "partner" || status === "main";
}
