"use client";

import React from "react";
import {
  latestUpdateOverview,
  updateOverviews,
} from "@/content/updateOverview";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EXPIRY_DAYS = 30;

function storageKeys(releaseDate: string) {
  return {
    shown: `staff-update-overview-shown:${releaseDate}`,
    dismissed: `staff-update-overview-dismissed:${releaseDate}`,
  };
}

function parseReleaseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isUpdateOverviewActive(
  releaseDate: string = latestUpdateOverview.releaseDate,
  now: Date = new Date()
): boolean {
  const released = parseReleaseDate(releaseDate);
  const ageMs = now.getTime() - released.getTime();
  const maxAgeMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return ageMs >= 0 && ageMs < maxAgeMs;
}

/** Czy dialog powinien się otworzyć przy wejściu na panel staff. */
export function shouldOpenUpdateOverview(): boolean {
  if (typeof window === "undefined") return false;
  if (!isUpdateOverviewActive()) return false;

  const keys = storageKeys(latestUpdateOverview.releaseDate);
  if (localStorage.getItem(keys.dismissed) === "true") return false;
  if (sessionStorage.getItem(keys.shown) === "true") return false;
  return true;
}

export function markUpdateOverviewShown(): void {
  if (typeof window === "undefined") return;
  const keys = storageKeys(latestUpdateOverview.releaseDate);
  sessionStorage.setItem(keys.shown, "true");
}

function dismissUpdateOverviewPermanently(): void {
  if (typeof window === "undefined") return;
  const keys = storageKeys(latestUpdateOverview.releaseDate);
  localStorage.setItem(keys.dismissed, "true");
}

function formatReleaseDate(iso: string): string {
  return parseReleaseDate(iso).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface UpdateOverviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpdateOverviewDialog({
  open,
  onOpenChange,
}: UpdateOverviewDialogProps) {
  const [dontShowAgain, setDontShowAgain] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    if (open) {
      setDontShowAgain(false);
      setSelectedIndex(0);
    }
  }, [open]);

  const selected =
    updateOverviews[selectedIndex] ?? latestUpdateOverview;
  const showDateSelect = updateOverviews.length > 1;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && dontShowAgain) {
      dismissUpdateOverviewPermanently();
    }
    onOpenChange(nextOpen);
  };

  const handleClose = () => {
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] flex flex-col gap-4">
        <DialogHeader className="shrink-0">
          <DialogTitle>Przegląd aktualizacji</DialogTitle>
          <DialogDescription className="sr-only">
            Przegląd zmian w systemie. Możesz wybrać wcześniejszą datę wydania.
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Data wydania:</span>
            {showDateSelect ? (
              <select
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(Number(e.target.value))}
                className="h-8 max-w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[#DB5ABA]/40"
                aria-label="Wybierz datę wydania przeglądu"
              >
                {updateOverviews.map((entry, index) => (
                  <option key={entry.releaseDate} value={index}>
                    {formatReleaseDate(entry.releaseDate)}
                  </option>
                ))}
              </select>
            ) : (
              <span>{formatReleaseDate(selected.releaseDate)}</span>
            )}
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto custom-scrollbar space-y-4 pr-1">
          {selected.highlights.length > 0 && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-2">
              <p className="font-medium text-foreground">Co się zmieniło</p>
              <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground">
                {selected.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {selected.worthChecking.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Warto przejrzeć
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-sm text-muted-foreground">
                {selected.worthChecking.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 sm:justify-between sm:items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer sm:mr-auto">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-4 w-4 accent-[#DB5ABA]"
            />
            Nie pokazuj ponownie
          </label>
          <Button
            onClick={handleClose}
            style={{ backgroundColor: STAFF_ACCENT_COLOR }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
          >
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
