import type { SheetTone } from "./types";

/** Light-mode pastels (also legend swatches + XLSX). */
const TONE_LIGHT: Record<SheetTone, string> = {
  na: "#A1A1AA",
  todo: "#FAFAFA",
  warn: "#FFEDD5",
  ok: "#BBF7D0",
};

/**
 * Dark-mode fills — muted, not washed-out white/green. Pair with {@link sheetToneInk}.
 */
const TONE_DARK: Record<SheetTone, string> = {
  na: "#3f3f46",
  todo: "#27272a",
  warn: "#9a3412",
  ok: "#14532d",
};

export function isSheetTone(value: string | undefined): value is SheetTone {
  return value === "na" || value === "todo" || value === "warn" || value === "ok";
}

/**
 * Theme-aware cell fill for automatic protocol tones (all sheets using SheetGrid).
 * Uses light-dark() so dark mode never flashes pure white.
 */
export function toneBackground(tone: string | undefined): string {
  if (!isSheetTone(tone)) return "";
  switch (tone) {
    case "na":
    case "todo":
    case "warn":
    case "ok":
      return `light-dark(${TONE_LIGHT[tone]}, ${TONE_DARK[tone]})`;
    default: {
      const exhaustive: never = tone;
      return exhaustive;
    }
  }
}

/** Solid swatch for the legend (same in both themes — small chip). */
export function toneLegendSwatch(tone: SheetTone): string {
  return TONE_LIGHT[tone];
}

/** Ink on tone fills: dark on pastel (light), light on muted (dark). */
export function sheetToneInk(): string {
  return "light-dark(#0f172a, #f4f4f5)";
}

/**
 * Ink on manual pastel fills / highlight — those hex colours stay light in both themes.
 */
export function sheetPastelInk(): string {
  return "#0f172a";
}

export const TONE_LEGEND: { tone: SheetTone; label: string }[] = [
  { tone: "na", label: "nie dotyczy" },
  { tone: "todo", label: "do zrobienia" },
  { tone: "warn", label: "braki" },
  { tone: "ok", label: "gotowe" },
];
