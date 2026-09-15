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
import { FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Loader2, Save } from "lucide-react";

interface Stage3FormProps {
  companyId?: number;
  initialData?: Stage3Data;
  onSubmit: (data: Stage3FormData) => Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  isAccepted?: boolean;
}

const choiceInputClassName =
  "h-4 w-4 border border-gray-300 bg-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus:ring-2 focus:ring-ring focus:ring-offset-2 checked:bg-primary checked:border-primary";

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
      workshop:
        typeof initialData?.workshop === "boolean"
          ? initialData.workshop
          : (undefined as unknown as boolean),
      notes: initialData?.notes || "",
    },
  });

  const watchWorkshop = form.watch("workshop");

  const setWorkshopChoice = (value: boolean) => {
    form.setValue("workshop", value, { shouldValidate: true });
    if (!value) form.setValue("notes", "");
  };

  const handleFormSubmit = async (data: Stage3FormData) => {
    try {
      await onSubmit({
        workshop: data.workshop,
        notes: data.workshop ? data.notes || "" : "",
      });
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data) {
        const errorData = error.response.data;
        let hasFieldErrors = false;

        if (errorData.workshop !== undefined) {
          const fieldErrors = errorData.workshop;
          form.setError("workshop", {
            type: "server",
            message: Array.isArray(fieldErrors)
              ? fieldErrors[0]
              : typeof fieldErrors === "string"
                ? fieldErrors
                : String(fieldErrors),
          });
          hasFieldErrors = true;
        }

        if (errorData.notes !== undefined) {
          const fieldErrors = errorData.notes;
          form.setError("notes", {
            type: "server",
            message: Array.isArray(fieldErrors)
              ? fieldErrors[0]
              : typeof fieldErrors === "string"
                ? fieldErrors
                : String(fieldErrors),
          });
          hasFieldErrors = true;
        }

        if (errorData.detail && typeof errorData.detail === "string") {
          form.setError("root", {
            type: "server",
            message: errorData.detail,
          });
          hasFieldErrors = true;
        }

        if (hasFieldErrors) return;
      }
      throw error;
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-medium">{t("exhibitor.form.workshopInfo")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("exhibitor.form.workshopDescription")}
        </p>
        <FieldGroup>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="workshop-yes"
              name="workshop"
              checked={watchWorkshop === true}
              onChange={() => setWorkshopChoice(true)}
              className={choiceInputClassName}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                MozAppearance: "none",
                borderRadius: "50%",
              }}
              disabled={disabled}
            />
            <FieldLabel htmlFor="workshop-yes" className="cursor-pointer">
              {t("exhibitor.form.willConductWorkshop")}
            </FieldLabel>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="workshop-no"
              name="workshop"
              checked={watchWorkshop === false}
              onChange={() => setWorkshopChoice(false)}
              className={choiceInputClassName}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                MozAppearance: "none",
                borderRadius: "50%",
              }}
              disabled={disabled}
            />
            <FieldLabel htmlFor="workshop-no" className="cursor-pointer">
              {t("exhibitor.form.willNotConductWorkshop")}
            </FieldLabel>
          </div>
          {form.formState.errors.workshop && (
            <FieldError>{form.formState.errors.workshop.message}</FieldError>
          )}
        </FieldGroup>

        {watchWorkshop === true && (
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
