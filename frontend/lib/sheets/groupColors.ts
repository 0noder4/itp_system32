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

/** Theme-aware opaque fill — sticky panes must not use translucent Tailwind fills. */
function themeMix(hex: string, pastelShare: number): string {
  return `color-mix(in oklch, ${hex} ${pastelShare}%, var(--background))`;
}

export function sheetGroupHeaderBg(group: string): string {
  if (!group) return themeMix(FALLBACK_HEADER, 45);
  return themeMix(GROUP_HEADER_BG[group] ?? FALLBACK_HEADER, 50);
}

/** Softer tint for the column-name row under a coloured group band. */
export function sheetGroupColumnBg(group: string): string {
  if (!group) return themeMix(FALLBACK_HEADER, 22);
  return themeMix(GROUP_HEADER_BG[group] ?? FALLBACK_HEADER, 28);
}
