"use client";

import React from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "@/lib/i18n";
import { Stage5Data, Company } from "@/lib/types";
import { stage5Schema, Stage5FormData } from "./schemas";
import { Button } from "@/components/ui/button";
import { ACCENT_COLOR } from "@/lib/colors";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Loader2, Save, Plus, Trash2, UserPlus } from "lucide-react";
import { getUserInfo } from "@/lib/auth";
import { apiClient } from "@/lib/api";

interface Stage5FormProps {
  companyId: number;
  initialData?: Stage5Data;
  onSubmit: (data: Stage5FormData) => Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  isAccepted?: boolean;
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
  const [isLoadingUser, setIsLoadingUser] = React.useState(false);
  const [lunchPrice, setLunchPrice] = React.useState<number>(0);
  const [isLoadingPrice, setIsLoadingPrice] = React.useState(true);

  const form = useForm<Stage5FormData>({
    resolver: zodResolver(stage5Schema),
    defaultValues: {
      final_data: {
        el_devices: initialData?.final_data?.el_devices || "",
        el_power: initialData?.final_data?.el_power || "",
      },
      lunches: initialData?.lunches || [],
      pdi: initialData?.pdi || null,
      exhibitors: initialData?.exhibitors || [],
    },
  });

  const {
    fields: lunchFields,
    append: appendLunch,
    remove: removeLunch,
  } = useFieldArray({
    control: form.control,
    name: "lunches",
  });

  const {
    fields: exhibitorFields,
    append: appendExhibitor,
    remove: removeExhibitor,
  } = useFieldArray({
    control: form.control,
    name: "exhibitors",
  });

  // Fetch lunch price on mount
  React.useEffect(() => {
    async function fetchLunchPrice() {
      try {
        const response = await apiClient.get("/api/lunch-price/");
        setLunchPrice(parseFloat(response.data.lunch_price) || 0);
      } catch (error) {
        console.error("Error fetching lunch price:", error);
        setLunchPrice(0);
      } finally {
        setIsLoadingPrice(false);
      }
    }
    fetchLunchPrice();
  }, []);

  const watchLunches = form.watch("lunches") || [];
  // Calculate extra lunches: 2 free lunches per day
  // Group lunches by day and sum quantities per day, then calculate extra lunches per day
  const lunchesByDay = watchLunches.reduce((acc, lunch) => {
    const day = lunch.day || "";
    const quantity = lunch.lunch_quantity || 0;
    acc[day] = (acc[day] || 0) + quantity;
    return acc;
  }, {} as Record<string, number>);

  const freePerDay = 2;
  const extraLunches = Object.values(lunchesByDay).reduce(
    (sum, totalForDay) => {
      const extraForDay = Math.max(0, totalForDay - freePerDay);
      return sum + extraForDay;
    },
    0
  );
  const totalLunchCost = extraLunches * lunchPrice;

  const handleAddYourself = React.useCallback(async () => {
    if (disabled) return;

    setIsLoadingUser(true);
    try {
      // Get user info from token
      const userInfo = getUserInfo();

      // Fetch company data to get representative information
      let name = "";
      let surname = "";
      let phone_number = "";

      if (companyId && userInfo) {
        try {
          const response = await apiClient.get<Company>(
            `/api/company/${companyId}/`
          );
          const company = response.data;

          // Check if the current user is the representative
          // If so, use representative info
          if (company.representative_name && company.representative_surname) {
            name = company.representative_name;
            surname = company.representative_surname;
            phone_number = company.representative_phone_number || "";
          }
        } catch (error) {
          // If fetching company fails, continue with token data
          console.warn("Failed to fetch company data:", error);
        }
      }

      // If we don't have name/surname from company, try to parse from username
      if (!name && !surname && userInfo?.username) {
        const parts = userInfo.username.split(/\s+/);
        if (parts.length >= 2) {
          name = parts[0];
          surname = parts.slice(1).join(" ");
        } else {
          name = userInfo.username;
        }
      }

      // Add exhibitor with available data
      appendExhibitor({
        name: name || "",
        surname: surname || "",
        phone_number: phone_number || "",
      });
    } catch (error) {
      console.error("Failed to add yourself as exhibitor:", error);
    } finally {
      setIsLoadingUser(false);
    }
  }, [companyId, disabled, appendExhibitor]);

  const handleFormSubmit = async (data: Stage5FormData) => {
    try {
      await onSubmit(data);
    } catch (error: any) {
      // Handle backend validation errors and set them on form fields
      if (error.response?.status === 400 && error.response?.data) {
        const errorData = error.response.data;
        let hasFieldErrors = false;

        // Handle final_data errors
        if (errorData.final_data && typeof errorData.final_data === "object") {
          Object.keys(errorData.final_data).forEach((field) => {
            const fieldErrors = errorData.final_data[field];
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

        // Handle lunches errors
        if (errorData.lunches) {
          if (Array.isArray(errorData.lunches)) {
            errorData.lunches.forEach((lunchErrors: any, index: number) => {
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
          } else if (typeof errorData.lunches === "object") {
            // Handle object format {0: {...}, 1: {...}}
            Object.keys(errorData.lunches).forEach((indexStr) => {
              const index = parseInt(indexStr, 10);
              const lunchErrors = errorData.lunches[indexStr];
              if (
                lunchErrors &&
                typeof lunchErrors === "object" &&
                !isNaN(index)
              ) {
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

        // Handle pdi errors
        if (errorData.pdi && typeof errorData.pdi === "object") {
          Object.keys(errorData.pdi).forEach((field) => {
            const fieldErrors = errorData.pdi[field];
            const errorMessage = Array.isArray(fieldErrors)
              ? fieldErrors[0]
              : typeof fieldErrors === "string"
              ? fieldErrors
              : String(fieldErrors);

            form.setError(`pdi.${field}` as any, {
              type: "server",
              message: errorMessage,
            });
            hasFieldErrors = true;
          });
        }

        // Handle exhibitors errors
        if (errorData.exhibitors) {
          if (Array.isArray(errorData.exhibitors)) {
            errorData.exhibitors.forEach(
              (exhibitorErrors: any, index: number) => {
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
        }

        // Handle general errors
        if (errorData.detail && typeof errorData.detail === "string") {
          form.setError("root", {
            type: "server",
            message: errorData.detail,
          });
          hasFieldErrors = true;
        }

        if (hasFieldErrors) {
          return;
        }
      }
      throw error;
    }
  };

  return (
    <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Electric Devices */}
      <div className="space-y-3">
        <h3 className="font-medium">
          {t("exhibitor.form.electricDevicesTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t("exhibitor.form.electricDevicesDescription")}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.electricDevices")}</FieldLabel>
            <Input
              {...form.register("final_data.el_devices")}
              disabled={disabled}
            />
            {form.formState.errors.final_data?.el_devices && (
              <FieldError>
                {form.formState.errors.final_data.el_devices.message ||
                  t("exhibitor.form.required")}
              </FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.electricPower")}</FieldLabel>
            <Input
              {...form.register("final_data.el_power")}
              disabled={disabled}
            />
            {form.formState.errors.final_data?.el_power && (
              <FieldError>
                {form.formState.errors.final_data.el_power.message ||
                  t("exhibitor.form.required")}
              </FieldError>
            )}
          </FieldGroup>
        </div>
      </div>

      {/* Lunches */}
      <div className="space-y-3">
        <h3 className="font-medium">{t("exhibitor.form.lunches")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("exhibitor.form.lunchesDescription")}
        </p>
        {lunchPrice > 0 && (
          <div className="rounded-md bg-information/10 p-3 text-sm text-information border border-information/20 dark:bg-information/20 dark:text-information-foreground dark:border-information/30">
            <p className="font-medium mb-1">
              {t("exhibitor.form.lunchPricingDisclaimer")}
            </p>
            <p>
              {t("exhibitor.form.lunchPricePerMeal")}: {lunchPrice.toFixed(2)}{" "}
              PLN
            </p>
            <p className="mt-1 text-xs">
              {t("exhibitor.form.lunchFreeIncluded")}
            </p>
          </div>
        )}
        <div className="flex justify-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendLunch({ day: "day1", lunch_quantity: 1, diet_info: "" })
            }
            disabled={disabled}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("exhibitor.form.addLunch")}
          </Button>
        </div>
        {lunchFields.map((field, index) => (
          <div
            key={field.id}
            className="flex items-end gap-4 rounded-md border p-4"
          >
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.day")}</FieldLabel>
              <Controller
                name={`lunches.${index}.day`}
                control={form.control}
                render={({ field }) => (
                  <select
                    {...field}
                    disabled={disabled}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="day1">10.03.2025</option>
                    <option value="day2">11.03.2025</option>
                  </select>
                )}
              />
              {form.formState.errors.lunches?.[index]?.day && (
                <FieldError>
                  {form.formState.errors.lunches[index]?.day?.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.quantity")}</FieldLabel>
              <Input
                type="number"
                min="0"
                {...form.register(`lunches.${index}.lunch_quantity`, {
                  valueAsNumber: true,
                })}
                disabled={disabled}
              />
              {form.formState.errors.lunches?.[index]?.lunch_quantity && (
                <FieldError>
                  {form.formState.errors.lunches[index]?.lunch_quantity
                    ?.message || t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.dietInfo")}</FieldLabel>
              <Input
                {...form.register(`lunches.${index}.diet_info`)}
                disabled={disabled}
              />
              {form.formState.errors.lunches?.[index]?.diet_info && (
                <FieldError>
                  {form.formState.errors.lunches[index]?.diet_info?.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeLunch(index)}
              disabled={disabled}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        {totalLunchCost > 0 && (
          <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
            <p className="text-sm font-medium text-amber-900">
              {t("exhibitor.form.totalLunchCost")}: {totalLunchCost.toFixed(2)}{" "}
              PLN
            </p>
            <p className="text-xs text-amber-700 mt-1">
              {t("exhibitor.form.extraLunchesCount", { count: extraLunches })}
            </p>
          </div>
        )}
      </div>

      {/* Exhibitors */}
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.exhibitors")}</h3>
        <div className="flex justify-start gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendExhibitor({ name: "", surname: "", phone_number: "" })
            }
            disabled={disabled}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("exhibitor.form.addExhibitor")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddYourself}
            disabled={disabled || isLoadingUser}
          >
            {isLoadingUser ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                {t("common.loading")}
              </>
            ) : (
              <>
                <UserPlus className="mr-1 h-4 w-4" />
                {t("exhibitor.form.addYourself")}
              </>
            )}
          </Button>
        </div>
        {exhibitorFields.map((field, index) => (
          <div
            key={field.id}
            className="flex items-end gap-4 rounded-md border p-4"
          >
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.firstName")}</FieldLabel>
              <Input
                {...form.register(`exhibitors.${index}.name`)}
                disabled={disabled}
              />
              {form.formState.errors.exhibitors?.[index]?.name && (
                <FieldError>
                  {form.formState.errors.exhibitors[index]?.name?.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.lastName")}</FieldLabel>
              <Input
                {...form.register(`exhibitors.${index}.surname`)}
                disabled={disabled}
              />
              {form.formState.errors.exhibitors?.[index]?.surname && (
                <FieldError>
                  {form.formState.errors.exhibitors[index]?.surname?.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.phone")}</FieldLabel>
              <Input
                {...form.register(`exhibitors.${index}.phone_number`)}
                disabled={disabled}
              />
              {form.formState.errors.exhibitors?.[index]?.phone_number && (
                <FieldError>
                  {form.formState.errors.exhibitors[index]?.phone_number
                    ?.message || t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
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
        ))}
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
