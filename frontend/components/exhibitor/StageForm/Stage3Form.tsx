"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "@/lib/i18n";
import { Stage3Data } from "@/lib/types";
import { stage3Schema, Stage3FormData } from "./schemas";
import { Button } from "@/components/ui/button";
import { ACCENT_COLOR } from "@/lib/colors";
import { Textarea } from "@/components/ui/textarea";
import { FieldGroup, FieldLabel } from "@/components/ui/field";
import { Loader2, Save } from "lucide-react";

interface Stage3FormProps {
  companyId?: number;
  initialData?: Stage3Data;
  onSubmit: (data: Stage3FormData) => void;
  isSubmitting: boolean;
  disabled?: boolean;
  isAccepted?: boolean;
}

export function Stage3Form({
  initialData,
  onSubmit,
  isSubmitting,
  disabled = false,
  isAccepted = false,
}: Stage3FormProps) {
  const { t } = useTranslation();
  const form = useForm<Stage3FormData>({
    resolver: zodResolver(stage3Schema),
    defaultValues: {
      workshop: initialData?.workshop || false,
      notes: initialData?.notes || "",
    },
  });

  const watchWorkshop = form.watch("workshop");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-medium">{t("exhibitor.form.workshopInfo")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("exhibitor.form.workshopDescription")}
        </p>
        <FieldGroup>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="workshop"
              {...form.register("workshop")}
              className="h-4 w-4 rounded border-gray-300"
              disabled={disabled}
            />
            <FieldLabel htmlFor="workshop" className="cursor-pointer">
              {t("exhibitor.form.willConductWorkshop")}
            </FieldLabel>
          </div>
        </FieldGroup>

        {watchWorkshop && (
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.workshopNotes")}</FieldLabel>
            <Textarea
              {...form.register("notes")}
              rows={4}
              disabled={disabled}
            />
          </FieldGroup>
        )}
      </div>

      <Button
        type="submit"
        disabled={isSubmitting || disabled}
        className="w-full md:w-auto text-white"
        style={{
          backgroundColor: isSubmitting || disabled ? undefined : ACCENT_COLOR,
        }}
        onMouseEnter={(e) => {
          if (!isSubmitting && !disabled) {
            e.currentTarget.style.backgroundColor = "#E04E15";
          }
        }}
        onMouseLeave={(e) => {
          if (!isSubmitting && !disabled) {
            e.currentTarget.style.backgroundColor = ACCENT_COLOR;
          }
        }}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("common.loading")}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            {isAccepted ? t("common.sendAgain") : t("common.save")}
          </>
        )}
      </Button>
    </form>
  );
}
