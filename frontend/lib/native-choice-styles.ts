/** Shared classes for native checkbox/radio with appearance:none (see globals.css). */
export const nativeCheckboxClassName =
  "h-4 w-4 shrink-0 rounded border cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:focus:ring-offset-background";

export const nativeRadioClassName =
  "h-4 w-4 shrink-0 border cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus:ring-2 focus:ring-ring focus:ring-offset-2 dark:focus:ring-offset-background";

export const nativeChoiceAppearanceStyle = {
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
} as const;
