/**
 * Opaque header colours for sheet column groups (Excel Master–style bands).
 * Pastels are mixed with var(--background) so light and dark mode stay readable.
 */

/** Solid group band colours (also used in XLSX export — no CSS color-mix). */
export const GROUP_HEADER_BG: Record<string, string> = {
  "INFORMACJE BAZOWE": "#FDBA74",
  STATUSY: "#94A3B8",
  "DANE FIRMY (z formularza)": "#FCD34D",
  "STOISKO (z formularza)": "#93C5FD",
  "PAKIET (wyliczany)": "#A5B4FC",
  "WYPOSAŻENIE (z formularza)": "#6EE7B7",
  "PRĄD (z formularza)": "#C4B5FD",
  "FRYZ (z formularza)": "#F9A8D4",
  "WYKŁADZINA (z formularza)": "#D8B4FE",
  "PRZYJAZD (z formularza)": "#7DD3FC",
  "OBIADY (z formularza)": "#FDE047",
  "DELEGACI I PDI (z formularza)": "#FCA5A5",
  "KATALOG (z formularza)": "#86EFAC",
  "ROZLICZENIE (wyliczane)": "#FCD34D",
  "OPIEKUN (edytowalne)": "#FDA4AF",
  "WŁASNA ZABUDOWA": "#FDBA74",
  "MAIL #1 · do 25.02": "#FDE68A",
  "MAIL #2 · do 27.02": "#FCA5A5",
  "MAIL #3 · do 03.03": "#93C5FD",
  "MAIL #4 · do 05.03": "#C4B5FD",
  "MAIL #5 · 09.03": "#86EFAC",
  "FINAŁ NZS": "#6EE7B7",
  "WELCOME PACKI": "#F9A8D4",
  "OBIADY BEŚCIAKÓW": "#FDE047",
  "LOGISTYKA (edytowalne)": "#67E8F9",
  "WARSZTAT (z formularza firmy)": "#A5B4FC",
  "SALA (z formularza firmy)": "#99F6E4",
  "USTALENIA TR (edytowalne)": "#F9A8D4",
};

const FALLBACK_HEADER = "#94A3B8";

/** Blend hex toward white (0–1). Used for column-title row under the group band. */
export function lightenHex(hex: string, amount: number): string {
  const raw = hex.replace("#", "");
  if (!/^[0-9A-Fa-f]{6}$/.test(raw)) return hex;
  const mix = Math.min(1, Math.max(0, amount));
  const parts = [0, 2, 4].map((i) => {
    const channel = parseInt(raw.slice(i, i + 2), 16);
    return Math.round(channel + (255 - channel) * mix)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${parts.join("").toUpperCase()}`;
}

export function sheetGroupSolidBg(group: string): string {
  if (!group) return FALLBACK_HEADER;
  return GROUP_HEADER_BG[group] ?? FALLBACK_HEADER;
}

export function sheetGroupColumnSolidBg(group: string): string {
  return lightenHex(sheetGroupSolidBg(group), 0.45);
}

/**
 * Theme-aware opaque fill — sticky panes must not use translucent Tailwind fills.
 * Dark mode uses a lower pastel share so header bands stay muted (not neon).
 */
function themeMix(hex: string, lightShare: number, darkShare?: number): string {
  const dark = darkShare ?? Math.max(12, Math.round(lightShare * 0.4));
  return `light-dark(color-mix(in oklch, ${hex} ${lightShare}%, var(--background)), color-mix(in oklch, ${hex} ${dark}%, var(--background)))`;
}

/** Dark ink on light bands, light ink on muted dark bands. */
export function sheetGroupHeaderInk(): string {
  return "light-dark(#0f172a, #f4f4f5)";
}

export function sheetGroupHeaderBg(group: string): string {
  if (!group) return themeMix(FALLBACK_HEADER, 45, 28);
  return themeMix(GROUP_HEADER_BG[group] ?? FALLBACK_HEADER, 55, 32);
}

/** Softer tint for the column-name row under a coloured group band. */
export function sheetGroupColumnBg(group: string): string {
  if (!group) return themeMix(FALLBACK_HEADER, 22, 16);
  return themeMix(GROUP_HEADER_BG[group] ?? FALLBACK_HEADER, 32, 20);
}
