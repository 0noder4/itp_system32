"use client";

import { TONE_LEGEND, toneLegendSwatch } from "@/lib/sheets/tones";

export function SheetToneLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {TONE_LEGEND.map((item) => (
        <span key={item.tone} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-neutral-400 dark:border-neutral-500"
            style={{ backgroundColor: toneLegendSwatch(item.tone) }}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
