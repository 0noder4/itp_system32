/**
 * Frontend source of truth for IMAWEX carpet palettes (UI + zod).
 *
 * Backend validation mirror (must stay in sync manually):
 * `backend/companies/models.py` — CARPET_COLORS_RIPS / CARPET_COLORS_WELUR.
 * Catalog image itself lives in Settings.carpet_catalog_image (Django admin).
 */
export type CarpetChoice = "rips" | "welur" | "none";

export type CarpetColorOption = {
  code: string;
  namePl: string;
  nameEn: string;
};

/** Hardcoded IMAWEX RIPS EXPO / WELUR EXPO palette (catalog image is separate). */
export const CARPET_COLORS_RIPS: CarpetColorOption[] = [
  { code: "005", namePl: "biały", nameEn: "white" },
  { code: "035", namePl: "żółty", nameEn: "yellow" },
  { code: "033", namePl: "pomarańcz", nameEn: "orange" },
  { code: "037", namePl: "czerwony", nameEn: "red" },
  { code: "313", namePl: "bordo", nameEn: "burgundy" },
  { code: "042", namePl: "różowy", nameEn: "pink" },
  { code: "029", namePl: "fiolet", nameEn: "purple" },
  { code: "946", namePl: "miodowy", nameEn: "honey" },
  { code: "912", namePl: "beż", nameEn: "beige" },
  { code: "248", namePl: "c.brąz", nameEn: "dark brown" },
  { code: "065", namePl: "zielony", nameEn: "green" },
  { code: "602", namePl: "c. zielony", nameEn: "dark green" },
  { code: "054", namePl: "niebieski", nameEn: "blue" },
  { code: "055", namePl: "c. niebieski", nameEn: "dark blue" },
  { code: "543", namePl: "granat", nameEn: "navy" },
  { code: "022", namePl: "j. szary", nameEn: "light grey" },
  { code: "892", namePl: "szary", nameEn: "grey" },
  { code: "940", namePl: "grafit", nameEn: "graphite" },
  { code: "890", namePl: "antracyt", nameEn: "anthracite" },
  { code: "021", namePl: "czarny", nameEn: "black" },
];

export const CARPET_COLORS_WELUR: CarpetColorOption[] = [
  { code: "V005", namePl: "biały", nameEn: "white" },
  { code: "V810", namePl: "żółty", nameEn: "yellow" },
  { code: "V800", namePl: "pomarańcz", nameEn: "orange" },
  { code: "V372", namePl: "czerwony", nameEn: "red" },
  { code: "V320", namePl: "bordo", nameEn: "burgundy" },
  { code: "V322", namePl: "fuksja", nameEn: "fuchsia" },
  { code: "V250", namePl: "j. beż", nameEn: "light beige" },
  { code: "V549", namePl: "niebieski", nameEn: "blue" },
  { code: "V551", namePl: "c. niebieski", nameEn: "dark blue" },
  { code: "V560", namePl: "granat", nameEn: "navy" },
  { code: "V254", namePl: "beż", nameEn: "beige" },
  { code: "V171", namePl: "lemon", nameEn: "lemon" },
  { code: "V650", namePl: "zielony", nameEn: "green" },
  { code: "V643", namePl: "c. zielony", nameEn: "dark green" },
  { code: "V228", namePl: "j. szary", nameEn: "light grey" },
  { code: "V202", namePl: "szary", nameEn: "grey" },
  { code: "V234", namePl: "grafit", nameEn: "graphite" },
  { code: "V215", namePl: "antracyt", nameEn: "anthracite" },
  { code: "V217", namePl: "czarny", nameEn: "black" },
];

export const CARPET_COLORS_BY_CHOICE: Record<
  Exclude<CarpetChoice, "none">,
  CarpetColorOption[]
> = {
  rips: CARPET_COLORS_RIPS,
  welur: CARPET_COLORS_WELUR,
};

export const CARPET_COLOR_CODE_SETS: Record<
  Exclude<CarpetChoice, "none">,
  Set<string>
> = {
  rips: new Set(CARPET_COLORS_RIPS.map((c) => c.code)),
  welur: new Set(CARPET_COLORS_WELUR.map((c) => c.code)),
};

export function isCarpetPartnerStatus(
  status: string | null | undefined
): boolean {
  return status === "main" || status === "partner";
}

export function carpetColorLabel(
  choice: CarpetChoice | null | undefined,
  colorCode: string | null | undefined,
  locale: string = "pl"
): string {
  if (!choice || choice === "none" || !colorCode) return "";
  const palette = CARPET_COLORS_BY_CHOICE[choice] || [];
  const found = palette.find((c) => c.code === colorCode);
  if (!found) return colorCode;
  const name = locale === "pl" ? found.namePl : found.nameEn;
  return `${found.code} ${name}`;
}

export function isValidCarpetColor(
  choice: CarpetChoice | null | undefined,
  colorCode: string | null | undefined
): boolean {
  if (!choice || choice === "none") return !colorCode;
  if (!colorCode) return false;
  return CARPET_COLOR_CODE_SETS[choice].has(colorCode);
}
