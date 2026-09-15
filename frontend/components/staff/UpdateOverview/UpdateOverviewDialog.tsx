"use client";

import React from "react";
import { updateOverview } from "@/content/updateOverview";
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
  releaseDate: string = updateOverview.releaseDate,
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

  const keys = storageKeys(updateOverview.releaseDate);
  if (localStorage.getItem(keys.dismissed) === "true") return false;
  if (sessionStorage.getItem(keys.shown) === "true") return false;
  return true;
}

export function markUpdateOverviewShown(): void {
  if (typeof window === "undefined") return;
  const keys = storageKeys(updateOverview.releaseDate);
  sessionStorage.setItem(keys.shown, "true");
}

function dismissUpdateOverviewPermanently(): void {
  if (typeof window === "undefined") return;
  const keys = storageKeys(updateOverview.releaseDate);
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

  React.useEffect(() => {
    if (open) {
      setDontShowAgain(false);
    }
  }, [open]);

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
          <DialogDescription>
            Data wydania: {formatReleaseDate(updateOverview.releaseDate)}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto custom-scrollbar space-y-4 pr-1">
          {updateOverview.highlights.length > 0 && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-2">
              <p className="font-medium text-foreground">Co się zmieniło</p>
              <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground">
                {updateOverview.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {updateOverview.worthChecking.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Warto przejrzeć
              </p>
              <ul className="list-disc pl-4 space-y-1.5 text-sm text-muted-foreground">
                {updateOverview.worthChecking.map((item) => (
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
