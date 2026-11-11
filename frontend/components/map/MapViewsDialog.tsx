"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_MAP_VIEW,
  MAP_MINE_COLOR,
  MAP_PARTNER_COLOR,
  MAP_SIZE_COLORS,
  isDefaultMapView,
  type MapViewFlags,
} from "@/lib/mapViews";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: MapViewFlags;
  onChange: (next: MapViewFlags) => void;
};

type OptionKey = "default" | "standSizes" | "partners" | "mine";

const OPTIONS: {
  key: OptionKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "default",
    label: "Widok domyślny",
    hint: "Zajęte stoiska podświetlone jak dotychczas.",
  },
  {
    key: "standSizes",
    label: "Rozmiar stoisk",
    hint: "Kolory według powierzchni (jak w master Excel).",
  },
  {
    key: "partners",
    label: "Partnerzy",
    hint: "Partner i partner główny — osobny kolor.",
  },
  {
    key: "mine",
    label: "Moje firmy",
    hint: "Tylko firmy, których jesteś opiekunem FR.",
  },
];

function applyToggle(current: MapViewFlags, key: OptionKey): MapViewFlags {
  if (key === "default") {
    return { ...DEFAULT_MAP_VIEW };
  }
  if (key === "mine") {
    const nextMine = !current.mine;
    if (!nextMine) return { ...DEFAULT_MAP_VIEW };
    return { standSizes: false, partners: false, mine: true };
  }
  if (key === "standSizes") {
    return {
      standSizes: !current.standSizes,
      partners: current.partners,
      mine: false,
    };
  }
  return {
    standSizes: current.standSizes,
    partners: !current.partners,
    mine: false,
  };
}

function isChecked(view: MapViewFlags, key: OptionKey): boolean {
  if (key === "default") return isDefaultMapView(view);
  if (key === "standSizes") return view.standSizes;
  if (key === "partners") return view.partners;
  return view.mine;
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className="inline-block h-3 w-3 rounded-sm border border-black/20"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function MapViewsDialog({
  open,
  onOpenChange,
  value,
  onChange,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Widoki mapy</DialogTitle>
          <DialogDescription>
            Rozmiar stoisk i partnerzy mogą być włączone naraz. „Moje firmy”
            oraz widok domyślny gaszą pozostałe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {OPTIONS.map((opt) => {
            const checked = isChecked(value, opt.key);
            return (
              <label
                key={opt.key}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={() => onChange(applyToggle(value, opt.key))}
                />
                <span className="space-y-0.5">
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {opt.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-3">
          <Swatch color={MAP_SIZE_COLORS[4]} label="4 m²" />
          <Swatch color={MAP_SIZE_COLORS[6]} label="6 m²" />
          <Swatch color={MAP_SIZE_COLORS[8]} label="8 m²" />
          <Swatch color={MAP_SIZE_COLORS[12]} label="12 m²" />
          <Swatch color={MAP_PARTNER_COLOR} label="Partner" />
          <Swatch color={MAP_MINE_COLOR} label="Moje firmy" />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange({ ...DEFAULT_MAP_VIEW })}
          >
            Reset
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Gotowe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
