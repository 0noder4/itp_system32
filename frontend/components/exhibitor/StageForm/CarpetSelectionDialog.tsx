"use client";

import React from "react";
import useSWR from "swr";
import { useTranslation } from "@/lib/i18n";
import { fetcher } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CARPET_COLORS_BY_CHOICE,
  CarpetChoice,
  isValidCarpetColor,
} from "@/lib/carpetCatalog";
import { ACCENT_COLOR } from "@/lib/colors";

type CatalogResponse = {
  carpet_catalog_image_url: string | null;
};

export type CarpetSelectionValue = {
  carpet_choice: CarpetChoice | null;
  carpet_color: string;
};

interface CarpetSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CarpetSelectionValue;
  /** Required when editing; optional for staff read-only preview. */
  onConfirm?: (value: CarpetSelectionValue) => void;
  /** When true, selection controls are not editable (staff preview). */
  readOnly?: boolean;
}

export function CarpetSelectionDialog({
  open,
  onOpenChange,
  value,
  onConfirm,
  readOnly = false,
}: CarpetSelectionDialogProps) {
  const { t, locale } = useTranslation();
  const { data: catalog } = useSWR<CatalogResponse>(
    open ? "/api/carpet-catalog/" : null,
    fetcher
  );

  const [choice, setChoice] = React.useState<CarpetChoice | null>(
    value.carpet_choice
  );
  const [color, setColor] = React.useState(value.carpet_color || "");
  const [localError, setLocalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setChoice(value.carpet_choice);
      setColor(value.carpet_color || "");
      setLocalError(null);
    }
  }, [open, value.carpet_choice, value.carpet_color]);

  const colors =
    choice === "rips" || choice === "welur"
      ? CARPET_COLORS_BY_CHOICE[choice]
      : [];

  const hasSelection =
    choice === "rips" || choice === "welur" || choice === "none";
  /** Staff preview with no firm choice: catalog only + plain “not selected” text. */
  const showUnsetReadOnly = readOnly && !hasSelection;
  /** Staff preview with a choice: keep highlighted type/color (non-interactive). */
  const showSelectionUi = !readOnly || hasSelection;

  const handleChoiceChange = (next: CarpetChoice) => {
    if (readOnly) return;
    setChoice(next);
    setColor("");
    setLocalError(null);
  };

  const handleConfirm = () => {
    if (readOnly) {
      onOpenChange(false);
      return;
    }
    if (!choice) {
      setLocalError(
        t("exhibitor.form.carpetChoiceRequired") ||
          "Select a carpet option"
      );
      return;
    }
    if (choice !== "none" && !isValidCarpetColor(choice, color)) {
      setLocalError(
        t("exhibitor.form.carpetColorRequired") ||
          "Select a carpet color"
      );
      return;
    }
    onConfirm?.({
      carpet_choice: choice,
      carpet_color: choice === "none" ? "" : color,
    });
    onOpenChange(false);
  };

  const imageUrl = catalog?.carpet_catalog_image_url || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{t("exhibitor.form.carpetDialogTitle")}</DialogTitle>
          <DialogDescription>
            {showUnsetReadOnly
              ? t("exhibitor.form.carpetDialogDescriptionStaffUnset")
              : t("exhibitor.form.carpetDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
          <div className="max-h-[55vh] overflow-y-auto overscroll-contain rounded-lg border bg-muted/30">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={t("exhibitor.form.carpetCatalogAlt")}
                className="block h-auto w-full max-w-none"
              />
            ) : (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {t("exhibitor.form.carpetCatalogMissing")}
              </p>
            )}
          </div>

          {showUnsetReadOnly ? (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("exhibitor.form.carpetType")}
              </p>
              <p className="mt-1 text-base">
                {t("exhibitor.form.carpetSummaryUnset")}
              </p>
            </div>
          ) : (
            showSelectionUi && (
              <>
                <FieldGroup>
                  <FieldLabel>
                    {t("exhibitor.form.carpetType")}{" "}
                    {!readOnly && <span className="text-red-500">*</span>}
                  </FieldLabel>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["rips", "exhibitor.form.carpetTypeRips"],
                        ["welur", "exhibitor.form.carpetTypeWelur"],
                        ["none", "exhibitor.form.carpetTypeNone"],
                      ] as const
                    ).map(([valueKey, labelKey]) => {
                      const selected = choice === valueKey;
                      return (
                        <button
                          key={valueKey}
                          type="button"
                          disabled={readOnly}
                          onClick={() => handleChoiceChange(valueKey)}
                          className={cn(
                            "rounded-md border px-3 py-3 text-left text-sm transition-colors",
                            selected
                              ? "border-primary bg-primary/10 font-medium"
                              : "border-input bg-transparent hover:bg-accent",
                            readOnly && "cursor-default opacity-90"
                          )}
                          style={
                            selected
                              ? {
                                  borderColor: ACCENT_COLOR,
                                  color: ACCENT_COLOR,
                                }
                              : undefined
                          }
                        >
                          {t(labelKey)}
                        </button>
                      );
                    })}
                  </div>
                </FieldGroup>

                {choice && choice !== "none" && (
                  <FieldGroup>
                    <FieldLabel>
                      {t("exhibitor.form.carpetColor")}{" "}
                      {!readOnly && <span className="text-red-500">*</span>}
                    </FieldLabel>
                    <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2 md:grid-cols-3">
                      {colors.map((opt) => {
                        const selected = color === opt.code;
                        const label =
                          locale === "pl"
                            ? `${opt.code} ${opt.namePl}`
                            : `${opt.code} ${opt.nameEn}`;
                        return (
                          <button
                            key={opt.code}
                            type="button"
                            disabled={readOnly}
                            onClick={() => {
                              if (readOnly) return;
                              setColor(opt.code);
                              setLocalError(null);
                            }}
                            className={cn(
                              "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                              selected
                                ? "border-primary bg-primary/10 font-medium"
                                : "border-input bg-transparent hover:bg-accent",
                              readOnly && "cursor-default opacity-90"
                            )}
                            style={
                              selected
                                ? {
                                    borderColor: ACCENT_COLOR,
                                    color: ACCENT_COLOR,
                                  }
                                : undefined
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </FieldGroup>
                )}
              </>
            )
          )}

          {localError && <FieldError>{localError}</FieldError>}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {readOnly
              ? t("common.close") || "Close"
              : t("common.cancel") || "Cancel"}
          </Button>
          {!readOnly && (
            <Button
              type="button"
              onClick={handleConfirm}
              style={{ backgroundColor: ACCENT_COLOR }}
              className="text-white hover:opacity-90"
            >
              {t("exhibitor.form.carpetConfirm") || "Confirm"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
