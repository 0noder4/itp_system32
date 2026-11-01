"use client";

import React from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "@/lib/i18n";
import { Stage5Data, AttendanceOption } from "@/lib/types";
import { stage5Schema, Stage5FormData } from "./schemas";
import { Button } from "@/components/ui/button";
import { ACCENT_COLOR } from "@/lib/colors";
import { Input } from "@/components/ui/input";
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import { apiClient, LunchPriceResponse, fetcher } from "@/lib/api";
import useSWR from "swr";
import {
  ARRIVAL_HOURS,
  ARRIVAL_MINUTES,
  calculateLunchSummary,
  fetchDefaultMainRepContact,
  hasSavedMainRep,
  joinArrivalTime,
  parseLunchPrice,
  splitArrivalTime,
  toFixedLunchRows,
  toTimeInputValue,
} from "@/lib/stage5-utils";
import { fetchInvoiceTotal } from "@/lib/invoice-cost-utils";
import { StageDraftSaveButton } from "./StageDraftSaveButton";
import {
  nativeCheckboxClassName,
  nativeChoiceAppearanceStyle,
} from "@/lib/native-choice-styles";

interface Stage5FormProps {
  companyId: number;
  initialData?: Stage5Data;
  onSubmit: (
    data: Stage5FormData,
    options?: { draft?: boolean }
  ) => Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  isAccepted?: boolean;
}

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

/** Hour + minute selects; form value stays empty until both parts are chosen. */
function ArrivalTimeSelectFields({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  hourLabel,
  minuteLabel,
  hourPlaceholder,
  minutePlaceholder,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  hourLabel: string;
  minuteLabel: string;
  hourPlaceholder: string;
  minutePlaceholder: string;
}) {
  const parsed = splitArrivalTime(value);
  const [hour, setHour] = React.useState(parsed.hour);
  const [minute, setMinute] = React.useState(parsed.minute);

  React.useEffect(() => {
    const next = splitArrivalTime(value);
    setHour(next.hour);
    setMinute(next.minute);
  }, [value]);

  const commit = (nextHour: string, nextMinute: string) => {
    setHour(nextHour);
    setMinute(nextMinute);
    if (!nextHour || !nextMinute) {
      onChange("");
      return;
    }
    onChange(joinArrivalTime(nextHour, nextMinute));
  };

  return (
    <div className="flex items-center gap-2">
      <select
        id={`${id}_hour`}
        aria-label={hourLabel}
        disabled={disabled}
        className={selectClassName}
        value={hour}
        onChange={(e) => commit(e.target.value, minute)}
        onBlur={onBlur}
      >
        <option value="">{hourPlaceholder}</option>
        {ARRIVAL_HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground font-medium" aria-hidden>
        :
      </span>
      <select
        id={`${id}_minute`}
        aria-label={minuteLabel}
        disabled={disabled}
        className={selectClassName}
        value={minute}
        onChange={(e) => commit(hour, e.target.value)}
        onBlur={onBlur}
      >
        <option value="">{minutePlaceholder}</option>
        {ARRIVAL_MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Stage5Form({
  companyId,
  initialData,
  onSubmit,
  isSubmitting,
  disabled = false,
  isAccepted = false,
}: Stage5FormProps) {
  const { t } = useTranslation();
  const [showSubmitDialog, setShowSubmitDialog] = React.useState(false);
  const [pendingFormData, setPendingFormData] =
    React.useState<Stage5FormData | null>(null);
  const [pendingLunchCost, setPendingLunchCost] = React.useState(0);
  const [pendingInvoiceTotal, setPendingInvoiceTotal] = React.useState(0);
  const [isPreparingDialog, setIsPreparingDialog] = React.useState(false);

  const { data: lunchSettings, isLoading: isLoadingSettings } =
    useSWR<LunchPriceResponse>("/api/lunch-price/", fetcher);

  const lunchPrice = parseLunchPrice(lunchSettings?.lunch_price);
  const day1Label = lunchSettings?.day1 || "09.03.2027";
  const day2Label = lunchSettings?.day2 || "10.03.2027";

  const form = useForm<Stage5FormData>({
    resolver: zodResolver(stage5Schema),
    defaultValues: {
      final_data: {
        el_devices: initialData?.final_data?.el_devices || "",
        el_power: initialData?.final_data?.el_power || "",
        el_low_power: initialData?.final_data?.el_low_power || false,
        lunches_declined: initialData?.final_data?.lunches_declined || false,
        no_other_delegates: initialData?.final_data?.no_other_delegates || false,
        main_rep_name: initialData?.final_data?.main_rep_name || "",
        main_rep_surname: initialData?.final_data?.main_rep_surname || "",
        main_rep_phone: initialData?.final_data?.main_rep_phone || "",
        main_rep_attendance: initialData?.final_data?.main_rep_attendance || "",
        arrival_time_day1: toTimeInputValue(
          initialData?.final_data?.arrival_time_day1
        ),
        arrival_time_day2: toTimeInputValue(
          initialData?.final_data?.arrival_time_day2
        ),
      },
      lunches: initialData?.final_data?.lunches_declined
        ? []
        : toFixedLunchRows(initialData?.lunches || []),
      pdi: initialData?.pdi || null,
      exhibitors: (initialData?.exhibitors || []).map((exhibitor) => ({
        ...exhibitor,
        attendance: exhibitor.attendance || "",
      })),
    },
  });

  const {
    fields: exhibitorFields,
    append: appendExhibitor,
    remove: removeExhibitor,
  } = useFieldArray({
    control: form.control,
    name: "exhibitors",
  });

  const fixedLunchDays: { day: "day1" | "day2"; label: string }[] = [
    { day: "day1", label: day1Label },
    { day: "day2", label: day2Label },
  ];

  React.useEffect(() => {
    if (disabled || hasSavedMainRep(initialData?.final_data)) return;

    async function prefillMainRep() {
      const contact = await fetchDefaultMainRepContact(companyId);
      if (contact.name) form.setValue("final_data.main_rep_name", contact.name);
      if (contact.surname)
        form.setValue("final_data.main_rep_surname", contact.surname);
      if (contact.phone_number)
        form.setValue("final_data.main_rep_phone", contact.phone_number);
    }

    prefillMainRep();
  }, [companyId, disabled, form, initialData?.final_data]);

  const lunchesDeclined = form.watch("final_data.lunches_declined");
  const noOtherDelegates = form.watch("final_data.no_other_delegates");
  const elLowPower = form.watch("final_data.el_low_power");
  const watchLunches = form.watch("lunches") || [];
  const lunchSummary = calculateLunchSummary(watchLunches, lunchPrice);

  const attendanceOptions = (
    day1: string,
    day2: string
  ): { value: AttendanceOption; label: string }[] => [
    { value: "both", label: t("exhibitor.form.attendanceBoth") },
    {
      value: "day1",
      label: t("exhibitor.form.attendanceDay1", { date: day1 }),
    },
    {
      value: "day2",
      label: t("exhibitor.form.attendanceDay2", { date: day2 }),
    },
    { value: "none", label: t("exhibitor.form.attendanceNone") },
  ];

  const applyServerErrors = (errorData: Record<string, unknown>) => {
    let hasFieldErrors = false;

    if (errorData.final_data && typeof errorData.final_data === "object") {
      Object.keys(errorData.final_data as object).forEach((field) => {
        const fieldErrors = (errorData.final_data as Record<string, unknown>)[
          field
        ];
        const errorMessage = Array.isArray(fieldErrors)
          ? fieldErrors[0]
          : typeof fieldErrors === "string"
            ? fieldErrors
            : String(fieldErrors);

        form.setError(`final_data.${field}` as any, {
          type: "server",
          message: errorMessage,
        });
        hasFieldErrors = true;
      });
    }

    if (errorData.lunches) {
      const lunchesErrors = errorData.lunches;
      if (Array.isArray(lunchesErrors)) {
        lunchesErrors.forEach((lunchErrors: Record<string, unknown>, index) => {
          if (lunchErrors && typeof lunchErrors === "object") {
            Object.keys(lunchErrors).forEach((field) => {
              const fieldErrors = lunchErrors[field];
              const errorMessage = Array.isArray(fieldErrors)
                ? fieldErrors[0]
                : typeof fieldErrors === "string"
                  ? fieldErrors
                  : String(fieldErrors);

              form.setError(`lunches.${index}.${field}` as any, {
                type: "server",
                message: errorMessage,
              });
              hasFieldErrors = true;
            });
          }
        });
      }
    }

    if (errorData.exhibitors && Array.isArray(errorData.exhibitors)) {
      errorData.exhibitors.forEach(
        (exhibitorErrors: Record<string, unknown>, index: number) => {
          if (exhibitorErrors && typeof exhibitorErrors === "object") {
            Object.keys(exhibitorErrors).forEach((field) => {
              const fieldErrors = exhibitorErrors[field];
              const errorMessage = Array.isArray(fieldErrors)
                ? fieldErrors[0]
                : typeof fieldErrors === "string"
                  ? fieldErrors
                  : String(fieldErrors);

              form.setError(`exhibitors.${index}.${field}` as any, {
                type: "server",
                message: errorMessage,
              });
              hasFieldErrors = true;
            });
          }
        }
      );
    }

    if (errorData.detail && typeof errorData.detail === "string") {
      form.setError("root", {
        type: "server",
        message: errorData.detail,
      });
      hasFieldErrors = true;
    }

    return hasFieldErrors;
  };

  const submitFormData = async (data: Stage5FormData) => {
    try {
      await onSubmit(data);
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { status?: number; data?: Record<string, unknown> };
      };
      if (
        axiosError.response?.status === 400 &&
        axiosError.response?.data &&
        applyServerErrors(axiosError.response.data)
      ) {
        setShowSubmitDialog(false);
        setPendingFormData(null);
        return;
      }
      throw error;
    }
  };

  const normalizeLunchesPayload = (data: Stage5FormData): Stage5FormData => {
    const normalized = { ...data, final_data: { ...data.final_data } };
    if (normalized.final_data.lunches_declined) {
      normalized.lunches = [];
    } else {
      const rows = normalized.lunches || [];
      normalized.lunches = [
        {
          day: "day1" as const,
          lunch_quantity: Number(rows[0]?.lunch_quantity) || 0,
          diet_info: "",
        },
        {
          day: "day2" as const,
          lunch_quantity: Number(rows[1]?.lunch_quantity) || 0,
          diet_info: "",
        },
      ];
    }
    return normalized;
  };

  const handleValidSubmit = async (data: Stage5FormData) => {
    const normalized = normalizeLunchesPayload(data);
    if (normalized.final_data.el_low_power) {
      normalized.final_data.el_power = "≤100";
      if (!normalized.final_data.el_devices?.trim()) {
        normalized.final_data.el_devices = t(
          "exhibitor.form.electricLowPowerDefaultDevices"
        );
      }
    }
    const stageCost = normalized.final_data.lunches_declined
      ? 0
      : calculateLunchSummary(normalized.lunches || [], lunchPrice).totalCost;
    setPendingFormData(normalized);
    setPendingLunchCost(stageCost);
    setIsPreparingDialog(true);
    try {
      const invoiceTotal = await fetchInvoiceTotal(companyId, {
        lunch: stageCost,
      });
      setPendingInvoiceTotal(invoiceTotal);
      setShowSubmitDialog(true);
    } finally {
      setIsPreparingDialog(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!pendingFormData) return;
    await submitFormData(pendingFormData);
    setShowSubmitDialog(false);
    setPendingFormData(null);
  };

  const handleSaveDraft = async () => {
    try {
      await onSubmit(normalizeLunchesPayload(form.getValues()), {
        draft: true,
      });
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data?.detail) {
        form.setError("root", {
          type: "server",
          message: String(error.response.data.detail),
        });
        return;
      }
      throw error;
    }
  };

  const handleLowPowerChange = (checked: boolean) => {
    form.setValue("final_data.el_low_power", checked);
    if (checked) {
      form.setValue("final_data.el_power", "≤100");
      if (!form.getValues("final_data.el_devices")?.trim()) {
        form.setValue(
          "final_data.el_devices",
          t("exhibitor.form.electricLowPowerDefaultDevices")
        );
      }
      form.clearErrors(["final_data.el_devices", "final_data.el_power"]);
    } else {
      if (form.getValues("final_data.el_power") === "≤100") {
        form.setValue("final_data.el_power", "");
      }
    }
  };

  const handleLunchesDeclinedChange = (checked: boolean) => {
    form.setValue("final_data.lunches_declined", checked);
    if (checked) {
      form.setValue("lunches", []);
    } else {
      form.setValue("lunches", toFixedLunchRows());
    }
  };

  const handleNoOtherDelegatesChange = (checked: boolean) => {
    form.setValue("final_data.no_other_delegates", checked);
    if (checked) {
      form.setValue("exhibitors", []);
    }
  };

  const renderAttendanceSelect = (
    name:
      | "final_data.main_rep_attendance"
      | `exhibitors.${number}.attendance`,
    id: string
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field }) => (
        <select
          {...field}
          id={id}
          disabled={disabled}
          className={selectClassName}
          value={field.value || ""}
        >
          <option value="" disabled>
            {t("exhibitor.form.selectAttendance")}
          </option>
          {attendanceOptions(day1Label, day2Label).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    />
  );

  const renderArrivalTimeSelect = (
    name: "final_data.arrival_time_day1" | "final_data.arrival_time_day2",
    id: string
  ) => (
    <Controller
      name={name}
      control={form.control}
      render={({ field }) => (
        <ArrivalTimeSelectFields
          id={id}
          value={field.value || ""}
          onChange={field.onChange}
          onBlur={field.onBlur}
          disabled={disabled}
          hourLabel={t("exhibitor.form.arrivalHour")}
          minuteLabel={t("exhibitor.form.arrivalMinute")}
          hourPlaceholder={t("exhibitor.form.arrivalHourPlaceholder")}
          minutePlaceholder={t("exhibitor.form.arrivalMinutePlaceholder")}
        />
      )}
    />
  );

  return (
    <>
      <form
        onSubmit={form.handleSubmit(handleValidSubmit)}
        className="space-y-6"
      >
        {!disabled && !isAccepted && (
          <div>
            <StageDraftSaveButton
              onClick={handleSaveDraft}
              isSubmitting={isSubmitting}
            />
          </div>
        )}
        {form.formState.errors.root && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
            {form.formState.errors.root.message}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-medium">
            {t("exhibitor.form.electricDevicesTitle")}
          </h3>

          <FieldGroup>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="el_low_power"
                checked={elLowPower}
                onChange={(e) => handleLowPowerChange(e.target.checked)}
                className={nativeCheckboxClassName}
                style={nativeChoiceAppearanceStyle}
                disabled={disabled}
              />
              <FieldLabel htmlFor="el_low_power" className="cursor-pointer">
                {t("exhibitor.form.electricLowPower")}
              </FieldLabel>
            </div>
          </FieldGroup>

          {!elLowPower && (
            <>
              <FieldGroup>
                <FieldLabel>
                  {t("exhibitor.form.electricDevices")}
                  <span className="text-red-500">*</span>
                </FieldLabel>
                <Input
                  {...form.register("final_data.el_devices")}
                  disabled={disabled}
                  placeholder={t("exhibitor.form.electricDevicesPlaceholder")}
                />
                {form.formState.errors.final_data?.el_devices && (
                  <FieldError>
                    {form.formState.errors.final_data.el_devices.message ||
                      t("exhibitor.form.required")}
                  </FieldError>
                )}
              </FieldGroup>

              <FieldGroup>
                <FieldLabel>
                  {t("exhibitor.form.electricPower")}
                  <span className="text-red-500">*</span>
                </FieldLabel>
                <div className="flex items-center gap-2">
                  <Controller
                    name="final_data.el_power"
                    control={form.control}
                    render={({ field }) => (
                      <Input
                        {...field}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder={t(
                          "exhibitor.form.electricPowerPlaceholder"
                        )}
                        disabled={disabled}
                        className="w-28"
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, "");
                          field.onChange(digitsOnly);
                        }}
                      />
                    )}
                  />
                  <span className="text-sm font-medium text-muted-foreground">
                    W
                  </span>
                </div>
                {form.formState.errors.final_data?.el_power && (
                  <FieldError>
                    {form.formState.errors.final_data.el_power.message ||
                      t("exhibitor.form.required")}
                  </FieldError>
                )}
              </FieldGroup>
            </>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">
            {t("exhibitor.form.lunches")}
            <span className="text-red-500 ml-1">*</span>
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("exhibitor.form.lunchesDescription")}
          </p>

          {!lunchesDeclined && (
            <div className="rounded-md bg-information/10 p-3 text-sm text-information border border-information/20 dark:bg-information/20 dark:text-information-foreground dark:border-information/30">
              <p className="font-medium mb-1">
                {t("exhibitor.form.lunchPricingDisclaimer")}
              </p>
              {isLoadingSettings ? (
                <p>{t("exhibitor.form.lunchPriceLoading")}</p>
              ) : (
                <p>
                  {t("exhibitor.form.lunchPricePerMeal")}:{" "}
                  {lunchPrice.toFixed(2)} PLN
                </p>
              )}
              <p className="mt-1 text-xs">
                {t("exhibitor.form.lunchFreeIncluded")}
              </p>
            </div>
          )}

          <FieldGroup>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="lunches_declined"
                checked={lunchesDeclined}
                onChange={(e) => handleLunchesDeclinedChange(e.target.checked)}
                className={nativeCheckboxClassName}
                style={nativeChoiceAppearanceStyle}
                disabled={disabled}
              />
              <div>
                <FieldLabel htmlFor="lunches_declined" className="cursor-pointer">
                  {t("exhibitor.form.lunchesDeclined")}
                </FieldLabel>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("exhibitor.form.lunchesDeclinedWarning")}
                </p>
              </div>
            </div>
            {form.formState.errors.final_data?.lunches_declined && (
              <FieldError>
                {form.formState.errors.final_data.lunches_declined.message}
              </FieldError>
            )}
          </FieldGroup>

          {!lunchesDeclined && (
            <>
              {fixedLunchDays.map(({ day, label }, index) => (
                <div
                  key={day}
                  className="flex flex-wrap items-end gap-4 rounded-md border p-4"
                >
                  <FieldGroup className="flex-1 min-w-[140px]">
                    <FieldLabel>{t("exhibitor.form.day")}</FieldLabel>
                    <p className="flex h-10 items-center text-sm font-medium">
                      {label}
                    </p>
                  </FieldGroup>
                  <FieldGroup className="flex-1 min-w-[100px]">
                    <FieldLabel htmlFor={`lunch_quantity_${day}`}>
                      {t("exhibitor.form.quantity")}
                      <span className="text-red-500">*</span>
                    </FieldLabel>
                    <Input
                      id={`lunch_quantity_${day}`}
                      type="number"
                      min="0"
                      {...form.register(`lunches.${index}.lunch_quantity`, {
                        valueAsNumber: true,
                      })}
                      disabled={disabled || isLoadingSettings}
                    />
                    {form.formState.errors.lunches?.[index]?.lunch_quantity && (
                      <FieldError>
                        {form.formState.errors.lunches[index]?.lunch_quantity
                          ?.message || t("exhibitor.form.required")}
                      </FieldError>
                    )}
                  </FieldGroup>
                </div>
              ))}

              {(watchLunches.length > 0 || lunchSummary.paidLunches > 0) && (
                <div className="rounded-md bg-muted/50 p-4 border space-y-1 text-sm">
                  <p className="font-medium">
                    {t("exhibitor.form.lunchSummaryTitle")}
                  </p>
                  <p>
                    {t("exhibitor.form.lunchSummaryDay1", {
                      date: day1Label,
                      used: lunchSummary.day1FreeUsed,
                      remaining: lunchSummary.day1FreeRemaining,
                    })}
                  </p>
                  <p>
                    {t("exhibitor.form.lunchSummaryDay2", {
                      date: day2Label,
                      used: lunchSummary.day2FreeUsed,
                      remaining: lunchSummary.day2FreeRemaining,
                    })}
                  </p>
                  <p>
                    {t("exhibitor.form.lunchSummaryFreeRemaining", {
                      count: lunchSummary.totalFreeRemaining,
                    })}
                  </p>
                  {lunchSummary.paidLunches > 0 ? (
                    <p>
                      {t("exhibitor.form.lunchSummaryPaidDetail", {
                        count: lunchSummary.paidLunches,
                        price: lunchPrice.toFixed(2),
                        amount: lunchSummary.totalCost.toFixed(2),
                      })}
                    </p>
                  ) : (
                    <p>
                      {t("exhibitor.form.lunchSummaryPaid", {
                        count: lunchSummary.paidLunches,
                      })}
                    </p>
                  )}
                  <p className="font-medium pt-1">
                    {t("exhibitor.form.lunchSummaryTotal", {
                      amount: lunchSummary.totalCost.toFixed(2),
                    })}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">
            {t("exhibitor.form.arrivalTimesTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("exhibitor.form.arrivalTimesDescription")}
          </p>
          <div className="grid gap-4 md:grid-cols-2 rounded-md border p-4">
            <FieldGroup>
              <FieldLabel htmlFor="arrival_time_day1_hour">
                {t("exhibitor.form.arrivalTimeDay1", { date: day1Label })}
                <span className="text-red-500">*</span>
              </FieldLabel>
              {renderArrivalTimeSelect(
                "final_data.arrival_time_day1",
                "arrival_time_day1"
              )}
              {form.formState.errors.final_data?.arrival_time_day1 && (
                <FieldError>
                  {form.formState.errors.final_data.arrival_time_day1.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="arrival_time_day2_hour">
                {t("exhibitor.form.arrivalTimeDay2", { date: day2Label })}
                <span className="text-red-500">*</span>
              </FieldLabel>
              {renderArrivalTimeSelect(
                "final_data.arrival_time_day2",
                "arrival_time_day2"
              )}
              {form.formState.errors.final_data?.arrival_time_day2 && (
                <FieldError>
                  {form.formState.errors.final_data.arrival_time_day2.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium">{t("exhibitor.form.mainRepTitle")}</h3>
          <p className="text-sm text-muted-foreground">
            {t("exhibitor.form.mainRepDescription")}
          </p>
          <div className="grid gap-4 md:grid-cols-2 rounded-md border p-4">
            <FieldGroup>
              <FieldLabel>
                {t("exhibitor.form.firstName")}
                <span className="text-red-500">*</span>
              </FieldLabel>
              <Input
                {...form.register("final_data.main_rep_name")}
                disabled={disabled}
              />
              {form.formState.errors.final_data?.main_rep_name && (
                <FieldError>
                  {form.formState.errors.final_data.main_rep_name.message}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>
                {t("exhibitor.form.lastName")}
                <span className="text-red-500">*</span>
              </FieldLabel>
              <Input
                {...form.register("final_data.main_rep_surname")}
                disabled={disabled}
              />
              {form.formState.errors.final_data?.main_rep_surname && (
                <FieldError>
                  {form.formState.errors.final_data.main_rep_surname.message}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>
                {t("exhibitor.form.phone")}
                <span className="text-red-500">*</span>
              </FieldLabel>
              <Input
                {...form.register("final_data.main_rep_phone")}
                disabled={disabled}
              />
              {form.formState.errors.final_data?.main_rep_phone && (
                <FieldError>
                  {form.formState.errors.final_data.main_rep_phone.message}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup>
              <FieldLabel htmlFor="main_rep_attendance">
                {t("exhibitor.form.attendanceLabel")}
                <span className="text-red-500">*</span>
              </FieldLabel>
              {renderAttendanceSelect(
                "final_data.main_rep_attendance",
                "main_rep_attendance"
              )}
              {form.formState.errors.final_data?.main_rep_attendance && (
                <FieldError>
                  {form.formState.errors.final_data.main_rep_attendance.message ||
                    t("exhibitor.form.attendanceRequired")}
                </FieldError>
              )}
            </FieldGroup>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-medium">{t("exhibitor.form.exhibitors")}</h3>

          <FieldGroup>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="no_other_delegates"
                checked={noOtherDelegates}
                onChange={(e) =>
                  handleNoOtherDelegatesChange(e.target.checked)
                }
                className={nativeCheckboxClassName}
                style={nativeChoiceAppearanceStyle}
                disabled={disabled}
              />
              <FieldLabel htmlFor="no_other_delegates" className="cursor-pointer">
                {t("exhibitor.form.noOtherDelegates")}
              </FieldLabel>
            </div>
            {form.formState.errors.final_data?.no_other_delegates && (
              <FieldError>
                {form.formState.errors.final_data.no_other_delegates.message}
              </FieldError>
            )}
          </FieldGroup>

          {!noOtherDelegates && (
            <>
              <div className="flex justify-start">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    appendExhibitor({
                      name: "",
                      surname: "",
                      phone_number: "",
                      attendance: "",
                    })
                  }
                  disabled={disabled}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("exhibitor.form.addExhibitor")}
                </Button>
              </div>

              {exhibitorFields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid gap-4 md:grid-cols-2 rounded-md border p-4"
                >
                  <FieldGroup>
                    <FieldLabel>
                      {t("exhibitor.form.firstName")}
                      <span className="text-red-500">*</span>
                    </FieldLabel>
                    <Input
                      {...form.register(`exhibitors.${index}.name`)}
                      disabled={disabled}
                    />
                    {form.formState.errors.exhibitors?.[index]?.name && (
                      <FieldError>
                        {form.formState.errors.exhibitors[index]?.name?.message}
                      </FieldError>
                    )}
                  </FieldGroup>
                  <FieldGroup>
                    <FieldLabel>
                      {t("exhibitor.form.lastName")}
                      <span className="text-red-500">*</span>
                    </FieldLabel>
                    <Input
                      {...form.register(`exhibitors.${index}.surname`)}
                      disabled={disabled}
                    />
                    {form.formState.errors.exhibitors?.[index]?.surname && (
                      <FieldError>
                        {
                          form.formState.errors.exhibitors[index]?.surname
                            ?.message
                        }
                      </FieldError>
                    )}
                  </FieldGroup>
                  <FieldGroup>
                    <FieldLabel>
                      {t("exhibitor.form.phone")}
                      <span className="text-red-500">*</span>
                    </FieldLabel>
                    <Input
                      {...form.register(`exhibitors.${index}.phone_number`)}
                      disabled={disabled}
                    />
                    {form.formState.errors.exhibitors?.[index]?.phone_number && (
                      <FieldError>
                        {
                          form.formState.errors.exhibitors[index]?.phone_number
                            ?.message
                        }
                      </FieldError>
                    )}
                  </FieldGroup>
                  <FieldGroup>
                    <FieldLabel htmlFor={`exhibitor_attendance_${index}`}>
                      {t("exhibitor.form.attendanceLabel")}
                      <span className="text-red-500">*</span>
                    </FieldLabel>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        {renderAttendanceSelect(
                          `exhibitors.${index}.attendance`,
                          `exhibitor_attendance_${index}`
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExhibitor(index)}
                        disabled={disabled}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {form.formState.errors.exhibitors?.[index]?.attendance && (
                      <FieldError>
                        {
                          form.formState.errors.exhibitors[index]?.attendance
                            ?.message
                        }
                      </FieldError>
                    )}
                  </FieldGroup>
                </div>
              ))}
            </>
          )}
        </div>

        {!disabled && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {!isAccepted && (
              <StageDraftSaveButton
                onClick={handleSaveDraft}
                isSubmitting={isSubmitting}
              />
            )}
            <Button
              type="submit"
              disabled={isSubmitting || isPreparingDialog}
              className="w-full md:w-auto text-white"
              style={{
                backgroundColor:
                  isSubmitting || isPreparingDialog ? undefined : ACCENT_COLOR,
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting && !isPreparingDialog) {
                  e.currentTarget.style.backgroundColor = "#E04E15";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting && !isPreparingDialog) {
                  e.currentTarget.style.backgroundColor = ACCENT_COLOR;
                }
              }}
            >
              {isSubmitting || isPreparingDialog ? (
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
          </div>
        )}
      </form>

      <Dialog
        open={showSubmitDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowSubmitDialog(false);
            setPendingFormData(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("exhibitor.form.lunchPaymentDialogTitle")}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                {t("exhibitor.form.lunchPaymentDialogText", {
                  amount: pendingLunchCost.toFixed(2),
                })}
              </span>
              <span className="block">
                {t("exhibitor.form.invoiceTotalDialogText", {
                  amount: pendingInvoiceTotal.toFixed(2),
                })}
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowSubmitDialog(false);
                setPendingFormData(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={isSubmitting}
              className="text-white"
              style={{ backgroundColor: ACCENT_COLOR }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("exhibitor.form.confirmSubmit")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
