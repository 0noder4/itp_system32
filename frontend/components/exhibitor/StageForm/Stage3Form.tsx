"use client";

import React from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "@/lib/i18n";
import { Stage3Data } from "@/lib/types";
import { stage3Schema, Stage3FormData } from "./schemas";
import { Button } from "@/components/ui/button";
import { ACCENT_COLOR } from "@/lib/colors";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import useSWR from "swr";
import { fetcher, LunchPriceResponse } from "@/lib/api";
import { StageDraftSaveButton } from "./StageDraftSaveButton";

interface Stage3FormProps {
  companyId?: number;
  initialData?: Stage3Data;
  onSubmit: (
    data: Stage3FormData,
    options?: { draft?: boolean }
  ) => Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  isAccepted?: boolean;
}

const choiceInputClassName =
  "h-4 w-4 border border-gray-300 bg-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus:ring-2 focus:ring-ring focus:ring-offset-2 checked:bg-primary checked:border-primary";

const checkboxClassName =
  "h-4 w-4 rounded border border-gray-300 bg-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus:ring-2 focus:ring-ring focus:ring-offset-2 checked:bg-primary checked:border-primary";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

const emptyFacilitator = {
  name: "",
  surname: "",
  phone_number: "",
  description: "",
};

function toTimeInputValue(value?: string | null): string {
  if (!value) return "";
  // API may return HH:MM:SS
  return value.slice(0, 5);
}

function matchFacilitatorPhoneIndexes(
  contactPhone: string | undefined,
  facilitators: { phone_number?: string }[] | undefined
): number[] {
  const parts = (contactPhone || "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length || !facilitators?.length) return [];

  const used = new Set<number>();
  const indexes: number[] = [];
  for (const part of parts) {
    const idx = facilitators.findIndex(
      (f, i) => !used.has(i) && (f.phone_number || "").trim() === part
    );
    if (idx >= 0) {
      used.add(idx);
      indexes.push(idx);
    }
  }
  return indexes;
}

function joinSelectedFacilitatorPhones(
  facilitators: { phone_number?: string }[] | undefined,
  selectedIndexes: number[]
): string {
  return selectedIndexes
    .map((i) => (facilitators?.[i]?.phone_number || "").trim())
    .filter(Boolean)
    .join(", ");
}

function hasWorkshopDetails(values: Stage3FormData): boolean {
  const textFields = [
    values.title,
    values.description,
    values.preferred_day,
    values.preferred_time,
    values.skills,
    values.study_majors,
    values.room_other,
    values.contact_phone,
    values.notes,
  ];
  if (textFields.some((v) => (v || "").trim())) return true;
  if (
    values.room_projector ||
    values.room_hdmi ||
    values.contact_phone_same_as_facilitator
  ) {
    return true;
  }
  return (values.facilitators || []).some(
    (f) =>
      (f.name || "").trim() ||
      (f.surname || "").trim() ||
      (f.phone_number || "").trim() ||
      (f.description || "").trim()
  );
}

export function Stage3Form({
  initialData,
  onSubmit,
  isSubmitting,
  disabled = false,
  isAccepted = false,
}: Stage3FormProps) {
  const { t } = useTranslation();
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);
  const [selectedFacilitatorPhoneIndexes, setSelectedFacilitatorPhoneIndexes] =
    React.useState<number[]>(() =>
      initialData?.contact_phone_same_as_facilitator
        ? matchFacilitatorPhoneIndexes(
            initialData.contact_phone,
            initialData.facilitators
          )
        : []
    );
  const { data: fairDays } = useSWR<LunchPriceResponse>(
    "/api/lunch-price/",
    fetcher
  );
  const day1Label = fairDays?.day1 || "09.03.2027";
  const day2Label = fairDays?.day2 || "10.03.2027";

  const form = useForm<Stage3FormData>({
    resolver: zodResolver(stage3Schema),
    defaultValues: {
      workshop:
        typeof initialData?.workshop === "boolean"
          ? initialData.workshop
          : (undefined as unknown as boolean),
      title: initialData?.title || "",
      description: initialData?.description || "",
      preferred_day:
        initialData?.preferred_day === "day1" ||
        initialData?.preferred_day === "day2"
          ? initialData.preferred_day
          : "",
      preferred_time: toTimeInputValue(initialData?.preferred_time),
      skills: initialData?.skills || "",
      study_majors: initialData?.study_majors || "",
      room_projector: initialData?.room_projector || false,
      room_hdmi: initialData?.room_hdmi || false,
      room_other: initialData?.room_other || "",
      contact_phone: initialData?.contact_phone || "",
      contact_phone_same_as_facilitator:
        initialData?.contact_phone_same_as_facilitator || false,
      notes: initialData?.notes || "",
      facilitators:
        initialData?.facilitators && initialData.facilitators.length > 0
          ? initialData.facilitators.map((f) => ({
              name: f.name || "",
              surname: f.surname || "",
              phone_number: f.phone_number || "",
              description: f.description || "",
            }))
          : [emptyFacilitator],
    },
  });

  const {
    fields: facilitatorFields,
    append: appendFacilitator,
    remove: removeFacilitator,
  } = useFieldArray({
    control: form.control,
    name: "facilitators",
  });

  const watchWorkshop = form.watch("workshop");
  const watchSameAsFacilitator = form.watch(
    "contact_phone_same_as_facilitator"
  );
  const watchFacilitators = form.watch("facilitators");

  React.useEffect(() => {
    if (!watchSameAsFacilitator) return;
    const joined = joinSelectedFacilitatorPhones(
      watchFacilitators,
      selectedFacilitatorPhoneIndexes
    );
    if (form.getValues("contact_phone") !== joined) {
      form.setValue("contact_phone", joined, { shouldValidate: true });
    }
  }, [
    watchSameAsFacilitator,
    watchFacilitators,
    selectedFacilitatorPhoneIndexes,
    form,
  ]);

  React.useEffect(() => {
    setSelectedFacilitatorPhoneIndexes((prev) =>
      prev.filter((i) => i < (watchFacilitators?.length || 0))
    );
  }, [watchFacilitators?.length]);

  const clearWorkshopDetails = () => {
    form.setValue("notes", "");
    form.setValue("title", "");
    form.setValue("description", "");
    form.setValue("preferred_day", "");
    form.setValue("preferred_time", "");
    form.setValue("skills", "");
    form.setValue("study_majors", "");
    form.setValue("room_projector", false);
    form.setValue("room_hdmi", false);
    form.setValue("room_other", "");
    form.setValue("contact_phone", "");
    form.setValue("contact_phone_same_as_facilitator", false);
    form.setValue("facilitators", [emptyFacilitator]);
    setSelectedFacilitatorPhoneIndexes([]);
  };

  const applyWorkshopNo = () => {
    form.setValue("workshop", false, { shouldValidate: true });
    clearWorkshopDetails();
  };

  const setWorkshopChoice = (value: boolean) => {
    if (!value) {
      if (hasWorkshopDetails(form.getValues())) {
        setConfirmClearOpen(true);
        return;
      }
      applyWorkshopNo();
      return;
    }
    form.setValue("workshop", true, { shouldValidate: true });
    if ((form.getValues("facilitators") || []).length === 0) {
      form.setValue("facilitators", [emptyFacilitator]);
    }
  };

  const handleFormSubmit = async (data: Stage3FormData) => {
    const payload: Stage3FormData = data.workshop
      ? {
          workshop: true,
          title: data.title || "",
          description: data.description || "",
          preferred_day: data.preferred_day || "",
          preferred_time: data.preferred_time || "",
          skills: data.skills || "",
          study_majors: data.study_majors || "",
          room_projector: data.room_projector || false,
          room_hdmi: data.room_hdmi || false,
          room_other: data.room_other || "",
          contact_phone_same_as_facilitator:
            data.contact_phone_same_as_facilitator || false,
          contact_phone: data.contact_phone || "",
          notes: data.notes || "",
          facilitators: (data.facilitators || []).map((f) => ({
            name: f.name,
            surname: f.surname,
            phone_number: f.phone_number,
            description: f.description || "",
          })),
        }
      : {
          workshop: false,
          title: "",
          description: "",
          preferred_day: "",
          preferred_time: "",
          skills: "",
          study_majors: "",
          room_projector: false,
          room_hdmi: false,
          room_other: "",
          contact_phone: "",
          contact_phone_same_as_facilitator: false,
          notes: "",
          facilitators: [],
        };

    try {
      await onSubmit(payload);
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data) {
        const errorData = error.response.data;
        let hasFieldErrors = false;

        const setFieldError = (field: keyof Stage3FormData, raw: unknown) => {
          form.setError(field, {
            type: "server",
            message: Array.isArray(raw)
              ? String(raw[0])
              : typeof raw === "string"
                ? raw
                : String(raw),
          });
          hasFieldErrors = true;
        };

        (
          [
            "workshop",
            "title",
            "description",
            "preferred_day",
            "preferred_time",
            "skills",
            "study_majors",
            "contact_phone",
            "contact_phone_same_as_facilitator",
            "notes",
            "room_other",
          ] as const
        ).forEach((field) => {
          if (errorData[field] !== undefined) {
            setFieldError(field, errorData[field]);
          }
        });

        if (errorData.facilitators && Array.isArray(errorData.facilitators)) {
          errorData.facilitators.forEach(
            (row: Record<string, unknown>, index: number) => {
              if (!row || typeof row !== "object") return;
              Object.entries(row).forEach(([field, messages]) => {
                form.setError(`facilitators.${index}.${field}` as any, {
                  type: "server",
                  message: Array.isArray(messages)
                    ? String(messages[0])
                    : String(messages),
                });
                hasFieldErrors = true;
              });
            }
          );
        } else if (
          errorData.facilitators &&
          typeof errorData.facilitators === "string"
        ) {
          form.setError("facilitators", {
            type: "server",
            message: errorData.facilitators,
          });
          hasFieldErrors = true;
        } else if (
          Array.isArray(errorData.facilitators) &&
          typeof errorData.facilitators[0] === "string"
        ) {
          form.setError("facilitators", {
            type: "server",
            message: errorData.facilitators[0],
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

  const handleSaveDraft = async () => {
    try {
      await onSubmit(form.getValues(), { draft: true });
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

  return (
    <>
    <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
      {!disabled && !isAccepted && (
        <div>
          <StageDraftSaveButton
            onClick={handleSaveDraft}
            isSubmitting={isSubmitting}
          />
        </div>
      )}
      <div className="space-y-3">
        <h3 className="font-medium">{t("exhibitor.form.workshopInfo")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("exhibitor.form.workshopDescription")}
        </p>
        <FieldGroup>
          <FieldLabel>
            {t("exhibitor.form.workshopParticipation")}
            <span className="text-red-500">*</span>
          </FieldLabel>
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
      </div>

      {watchWorkshop === true && (
        <div className="space-y-6">
          <FieldGroup>
            <FieldLabel>
              {t("exhibitor.form.workshopTitle")}
              <span className="text-red-500">*</span>
            </FieldLabel>
            <Input {...form.register("title")} disabled={disabled} />
            {form.formState.errors.title && (
              <FieldError>{form.formState.errors.title.message}</FieldError>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>
              {t("exhibitor.form.workshopAbout")}
              <span className="text-red-500">*</span>
            </FieldLabel>
            <Textarea
              {...form.register("description")}
              rows={4}
              disabled={disabled}
            />
            {form.formState.errors.description && (
              <FieldError>
                {form.formState.errors.description.message}
              </FieldError>
            )}
          </FieldGroup>

          <div className="grid gap-4 md:grid-cols-2">
            <FieldGroup>
              <FieldLabel>
                {t("exhibitor.form.workshopPreferredDay")}
                <span className="text-red-500">*</span>
              </FieldLabel>
              <select
                {...form.register("preferred_day")}
                className={selectClassName}
                disabled={disabled}
              >
                <option value="">{t("exhibitor.form.workshopSelectDay")}</option>
                <option value="day1">{day1Label}</option>
                <option value="day2">{day2Label}</option>
              </select>
              {form.formState.errors.preferred_day && (
                <FieldError>
                  {form.formState.errors.preferred_day.message}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>
                {t("exhibitor.form.workshopPreferredTime")}
                <span className="text-red-500">*</span>
              </FieldLabel>
              <Input
                type="time"
                {...form.register("preferred_time")}
                disabled={disabled}
              />
              {form.formState.errors.preferred_time && (
                <FieldError>
                  {form.formState.errors.preferred_time.message}
                </FieldError>
              )}
            </FieldGroup>
          </div>

          <FieldGroup>
            <FieldLabel>
              {t("exhibitor.form.workshopSkills")}
              <span className="text-red-500">*</span>
            </FieldLabel>
            <Textarea
              {...form.register("skills")}
              rows={3}
              disabled={disabled}
            />
            {form.formState.errors.skills && (
              <FieldError>{form.formState.errors.skills.message}</FieldError>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>
              {t("exhibitor.form.workshopStudyMajors")}
              <span className="text-red-500">*</span>
            </FieldLabel>
            <Textarea
              {...form.register("study_majors")}
              rows={3}
              disabled={disabled}
            />
            {form.formState.errors.study_majors && (
              <FieldError>
                {form.formState.errors.study_majors.message}
              </FieldError>
            )}
          </FieldGroup>

          <div className="space-y-4">
            <h3 className="font-medium">
              {t("exhibitor.form.workshopFacilitators")}
            </h3>
            <div className="flex justify-start">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendFacilitator(emptyFacilitator)}
                disabled={disabled}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t("exhibitor.form.addFacilitator")}
              </Button>
            </div>
            {form.formState.errors.facilitators &&
              !Array.isArray(form.formState.errors.facilitators) && (
                <FieldError>
                  {(form.formState.errors.facilitators as { message?: string })
                    ?.message || t("exhibitor.form.required")}
                </FieldError>
              )}

            {facilitatorFields.map((field, index) => (
              <div
                key={field.id}
                className="grid gap-4 md:grid-cols-2 rounded-md border p-4 relative"
              >
                {facilitatorFields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => removeFacilitator(index)}
                    disabled={disabled}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <FieldGroup>
                  <FieldLabel>
                    {t("exhibitor.form.firstName")}
                    <span className="text-red-500">*</span>
                  </FieldLabel>
                  <Input
                    {...form.register(`facilitators.${index}.name`)}
                    disabled={disabled}
                  />
                  {form.formState.errors.facilitators?.[index]?.name && (
                    <FieldError>
                      {
                        form.formState.errors.facilitators[index]?.name
                          ?.message
                      }
                    </FieldError>
                  )}
                </FieldGroup>
                <FieldGroup>
                  <FieldLabel>
                    {t("exhibitor.form.lastName")}
                    <span className="text-red-500">*</span>
                  </FieldLabel>
                  <Input
                    {...form.register(`facilitators.${index}.surname`)}
                    disabled={disabled}
                  />
                  {form.formState.errors.facilitators?.[index]?.surname && (
                    <FieldError>
                      {
                        form.formState.errors.facilitators[index]?.surname
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
                    {...form.register(`facilitators.${index}.phone_number`)}
                    disabled={disabled}
                  />
                  {form.formState.errors.facilitators?.[index]
                    ?.phone_number && (
                    <FieldError>
                      {
                        form.formState.errors.facilitators[index]?.phone_number
                          ?.message
                      }
                    </FieldError>
                  )}
                </FieldGroup>
                <FieldGroup className="md:col-span-2">
                  <FieldLabel>
                    {t("exhibitor.form.facilitatorDescription")}
                  </FieldLabel>
                  <Textarea
                    {...form.register(`facilitators.${index}.description`)}
                    rows={3}
                    disabled={disabled}
                  />
                </FieldGroup>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">
              {t("exhibitor.form.workshopRoomAmenities")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("exhibitor.form.workshopRoomAmenitiesHint")}
            </p>
            <FieldGroup>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="room_projector"
                  checked={!!form.watch("room_projector")}
                  onChange={(e) =>
                    form.setValue("room_projector", e.target.checked)
                  }
                  className={checkboxClassName}
                  style={{
                    appearance: "none",
                    WebkitAppearance: "none",
                    MozAppearance: "none",
                  }}
                  disabled={disabled}
                />
                <FieldLabel htmlFor="room_projector" className="cursor-pointer">
                  {t("exhibitor.form.roomProjector")}
                </FieldLabel>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="room_hdmi"
                  checked={!!form.watch("room_hdmi")}
                  onChange={(e) =>
                    form.setValue("room_hdmi", e.target.checked)
                  }
                  className={checkboxClassName}
                  style={{
                    appearance: "none",
                    WebkitAppearance: "none",
                    MozAppearance: "none",
                  }}
                  disabled={disabled}
                />
                <FieldLabel htmlFor="room_hdmi" className="cursor-pointer">
                  {t("exhibitor.form.roomHdmi")}
                </FieldLabel>
              </div>
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.roomOther")}</FieldLabel>
              <Input {...form.register("room_other")} disabled={disabled} />
            </FieldGroup>
          </div>

          <FieldGroup>
            <FieldLabel>
              {t("exhibitor.form.workshopContactPhone")}
              <span className="text-red-500">*</span>
            </FieldLabel>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="contact_phone_same_as_facilitator"
                checked={!!watchSameAsFacilitator}
                onChange={(e) => {
                  const checked = e.target.checked;
                  form.setValue("contact_phone_same_as_facilitator", checked, {
                    shouldValidate: true,
                  });
                  if (checked) {
                    setSelectedFacilitatorPhoneIndexes([]);
                    form.setValue("contact_phone", "", {
                      shouldValidate: true,
                    });
                  } else {
                    setSelectedFacilitatorPhoneIndexes([]);
                  }
                }}
                className={checkboxClassName}
                style={{
                  appearance: "none",
                  WebkitAppearance: "none",
                  MozAppearance: "none",
                }}
                disabled={disabled}
              />
              <FieldLabel
                htmlFor="contact_phone_same_as_facilitator"
                className="cursor-pointer"
              >
                {t("exhibitor.form.contactPhoneSameAsFacilitator")}
              </FieldLabel>
            </div>
            {watchSameAsFacilitator && (
              <div className="mb-3 space-y-2 rounded-md border p-3">
                <p className="text-sm text-muted-foreground">
                  {t("exhibitor.form.contactPhoneSelectFacilitators")}
                </p>
                {(watchFacilitators || []).map((fac, index) => {
                  const phone = (fac.phone_number || "").trim();
                  const labelName = [fac.name, fac.surname]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  const checkboxId = `contact_phone_facilitator_${index}`;
                  const checked =
                    selectedFacilitatorPhoneIndexes.includes(index);
                  return (
                    <div key={checkboxId} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={checkboxId}
                        checked={checked}
                        onChange={(e) => {
                          setSelectedFacilitatorPhoneIndexes((prev) => {
                            if (e.target.checked) {
                              return prev.includes(index)
                                ? prev
                                : [...prev, index].sort((a, b) => a - b);
                            }
                            return prev.filter((i) => i !== index);
                          });
                        }}
                        className={checkboxClassName}
                        style={{
                          appearance: "none",
                          WebkitAppearance: "none",
                          MozAppearance: "none",
                        }}
                        disabled={disabled || !phone}
                      />
                      <FieldLabel
                        htmlFor={checkboxId}
                        className={
                          disabled || !phone
                            ? "cursor-not-allowed opacity-50"
                            : "cursor-pointer"
                        }
                      >
                        {labelName
                          ? `${labelName}${phone ? ` — ${phone}` : ""}`
                          : phone ||
                            t("exhibitor.form.contactPhoneFacilitatorEmpty")}
                      </FieldLabel>
                    </div>
                  );
                })}
              </div>
            )}
            <Input
              {...form.register("contact_phone")}
              disabled={disabled || !!watchSameAsFacilitator}
            />
            {form.formState.errors.contact_phone && (
              <FieldError>
                {form.formState.errors.contact_phone.message}
              </FieldError>
            )}
            {form.formState.errors.contact_phone_same_as_facilitator && (
              <FieldError>
                {
                  form.formState.errors.contact_phone_same_as_facilitator
                    .message
                }
              </FieldError>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.workshopNotes")}</FieldLabel>
            <Textarea
              {...form.register("notes")}
              rows={3}
              disabled={disabled}
            />
          </FieldGroup>
        </div>
      )}

      {form.formState.errors.root && (
        <FieldError>{form.formState.errors.root.message}</FieldError>
      )}

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
            disabled={isSubmitting}
            className="w-full md:w-auto text-white"
            style={{
              backgroundColor: isSubmitting ? undefined : ACCENT_COLOR,
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = "#E04E15";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) {
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
        </div>
      )}
    </form>

    <Dialog
      open={confirmClearOpen}
      onOpenChange={(open) => {
        if (!open) setConfirmClearOpen(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("exhibitor.form.workshopClearConfirmTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("exhibitor.form.workshopClearConfirmText")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmClearOpen(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              applyWorkshopNo();
              setConfirmClearOpen(false);
            }}
            className="text-white"
            style={{ backgroundColor: ACCENT_COLOR }}
          >
            {t("exhibitor.form.workshopClearConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
