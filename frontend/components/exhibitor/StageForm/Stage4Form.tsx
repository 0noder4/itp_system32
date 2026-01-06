"use client";

import React from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Stage4Data } from "@/lib/types";
import { stage4Schema, Stage4FormData } from "./schemas";
import { Button } from "@/components/ui/button";
import { ACCENT_COLOR } from "@/lib/colors";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  FileText,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Stage4FormProps {
  companyId?: number;
  initialData?: Stage4Data;
  onSubmit: (data: Stage4FormData) => void;
  isSubmitting: boolean;
  disabled?: boolean;
  isAccepted?: boolean;
}

export function Stage4Form({
  initialData,
  onSubmit,
  isSubmitting,
  disabled = false,
  isAccepted = false,
}: Stage4FormProps) {
  const { t } = useTranslation();
  const [jobwallPrice, setJobwallPrice] = React.useState<number>(0);
  const [isLoadingPrice, setIsLoadingPrice] = React.useState(true);
  const [selectedLogoFileName, setSelectedLogoFileName] = React.useState<
    string | null
  >(null);

  // Track existing file URL from initial data
  const existingLogoFile = initialData?.description?.logo_file;

  // Helper function to get full URL for file fields
  const getFileUrl = (fileUrl: string | undefined) => {
    if (!fileUrl) return null;
    // If already a full URL, return as is
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
      return fileUrl;
    }
    // Get API base URL
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const base = apiBaseUrl.replace(/\/$/, "");

    // DRF FileField returns paths relative to MEDIA_URL
    let path = fileUrl;

    // If path doesn't start with /, prepend /media/
    if (!path.startsWith("/")) {
      path = `/media/${path}`;
    }
    // If path starts with / but not /media/, and looks like a media file path
    else if (!path.startsWith("/media/")) {
      // Check if it's a known media file pattern
      if (
        path.startsWith("/logos/") ||
        path.startsWith("/fire_certs/") ||
        path.startsWith("/catalogue_logos/")
      ) {
        path = `/media${path}`;
      }
      // Otherwise assume it needs /media/ prefix
      else if (!path.startsWith("/static/") && !path.startsWith("/api/")) {
        path = `/media${path}`;
      }
    }

    return `${base}${path}`;
  };

  // Get file name from URL
  const getFileName = (fileUrl: string | undefined) => {
    if (!fileUrl) return null;
    // Extract filename from URL
    const parts = fileUrl.split("/");
    return parts[parts.length - 1] || null;
  };

  const form = useForm<Stage4FormData>({
    resolver: zodResolver(stage4Schema),
    defaultValues: {
      jobwalls: initialData?.jobwalls?.length ? initialData.jobwalls : [],
      description: initialData?.description
        ? {
            descr: initialData.description.descr,
            logo_file: initialData.description.logo_file || undefined,
          }
        : null,
    },
  });

  const {
    fields: jobwallFields,
    append: appendJobwall,
    remove: removeJobwall,
  } = useFieldArray({
    control: form.control,
    name: "jobwalls",
  });

  // Fetch jobwall price on mount
  React.useEffect(() => {
    async function fetchJobwallPrice() {
      try {
        const response = await apiClient.get("/api/jobwall-price/");
        setJobwallPrice(parseFloat(response.data.jobwall_price) || 0);
      } catch (error) {
        console.error("Error fetching jobwall price:", error);
        setJobwallPrice(0);
      } finally {
        setIsLoadingPrice(false);
      }
    }
    fetchJobwallPrice();
  }, []);

  const workFormOptions = [
    { value: "s", label: t("exhibitor.form.workFormOnsite") },
    { value: "z", label: t("exhibitor.form.workFormRemote") },
    { value: "h", label: t("exhibitor.form.workFormHybrid") },
    { value: "k", label: t("exhibitor.form.workFormContest") },
    { value: "m", label: t("exhibitor.form.workFormMobile") },
  ];

  const workloadOptions = [
    { value: "pelen", label: t("exhibitor.form.workloadFull") },
    { value: "pol", label: t("exhibitor.form.workloadHalf") },
    { value: "trzyczwarte", label: t("exhibitor.form.workloadThreeQuarters") },
    { value: "el", label: t("exhibitor.form.workloadFlexible") },
  ];

  const contractOptions = [
    { value: "uop", label: t("exhibitor.form.contractEmployment") },
    { value: "uoz", label: t("exhibitor.form.contractMandate") },
    { value: "uod", label: t("exhibitor.form.contractWork") },
    { value: "b2b", label: t("exhibitor.form.contractB2B") },
    { value: "uos", label: t("exhibitor.form.contractInternship") },
  ];

  const watchJobwalls = form.watch("jobwalls") || [];
  const totalJobwallCost = watchJobwalls.length * jobwallPrice;

  const handleFileChange = (file: File | null) => {
    if (file) {
      form.setValue("description.logo_file", file as any, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setSelectedLogoFileName(file.name);
      // Trigger validation to show errors immediately
      form.trigger("description.logo_file");
    } else {
      form.setValue("description.logo_file", undefined, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setSelectedLogoFileName(null);
    }
  };

  const handleFormSubmit = (data: Stage4FormData) => {
    // Get current form values to ensure files are included (React Hook Form might strip files during validation)
    const currentFormValues = form.getValues();

    // Ensure files are included in the data (files might be stripped by zod validation)
    const dataWithFiles = {
      ...data,
      description: data.description
        ? {
            ...data.description,
            // Use form values if files are missing from validated data
            logo_file:
              data.description.logo_file instanceof File
                ? data.description.logo_file
                : currentFormValues.description?.logo_file instanceof File
                ? currentFormValues.description.logo_file
                : data.description.logo_file,
          }
        : null,
    };
    onSubmit(dataWithFiles);
  };

  return (
    <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Catalogue Section */}
      <div className="space-y-3">
        <h3 className="font-medium">{t("exhibitor.form.catalogue")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("exhibitor.form.catalogueDescription")}
        </p>
        <FieldGroup>
          <FieldLabel>{t("exhibitor.form.description")}</FieldLabel>
          <Textarea
            {...form.register("description.descr")}
            rows={4}
            disabled={disabled}
          />
          {form.formState.errors.description?.descr && (
            <FieldError>{t("exhibitor.form.required")}</FieldError>
          )}
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>{t("exhibitor.form.uploadCatalogueLogo")}</FieldLabel>
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                handleFileChange(file);
              }}
              disabled={disabled}
              className="sr-only"
              id="catalogue_logo_file_input"
            />
            <label
              htmlFor="catalogue_logo_file_input"
              className={cn(
                "flex h-9 w-full min-w-0 cursor-pointer items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm dark:bg-input/30",
                "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                !disabled && "hover:bg-accent"
              )}
            >
              <span className="truncate text-muted-foreground">
                {selectedLogoFileName ||
                  (existingLogoFile && typeof existingLogoFile === "string"
                    ? getFileName(existingLogoFile) || existingLogoFile
                    : "No file chosen")}
              </span>
              <span className="ml-2 flex-shrink-0 rounded border bg-background px-2 py-0.5 text-xs">
                {t("common.browse") || "Browse"}
              </span>
            </label>
          </div>
          {existingLogoFile && typeof existingLogoFile === "string" && (
            <a
              href={getFileUrl(existingLogoFile) || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <FileText className="h-3 w-3" />
              <span>
                {t("exhibitor.form.viewCurrentFile") || "View current file"}
              </span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {existingLogoFile
              ? t("exhibitor.form.replaceFile") ||
                "Upload a new file to replace the current one"
              : t("exhibitor.form.selectFile") || "Select a file to upload"}
          </p>
          {form.formState.errors.description?.logo_file && (
            <FieldError>
              {typeof form.formState.errors.description.logo_file ===
                "object" &&
              "message" in form.formState.errors.description.logo_file
                ? String(form.formState.errors.description.logo_file.message)
                : t("exhibitor.form.required")}
            </FieldError>
          )}
        </FieldGroup>
      </div>
      {/* Jobwalls Section */}
      <div className="space-y-3">
        <h3 className="font-medium">{t("exhibitor.form.jobwallInfo")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("exhibitor.form.jobwallDescription")}
        </p>
        <div className="flex justify-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendJobwall({
                name: "",
                form: "s",
                workload: "pelen",
                contract: "uop",
                description: "",
                benefits: "",
                requirements: "",
                url: "",
              })
            }
            disabled={disabled}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("exhibitor.form.addJobwall")}
          </Button>
        </div>
        {jobwallPrice > 0 && (
          <div className="rounded-md bg-information/10 p-3 text-sm text-information border border-information/20 dark:bg-information/20 dark:text-information-foreground dark:border-information/30">
            <p className="font-medium mb-1">
              {t("exhibitor.form.jobwallPricingDisclaimer")}
            </p>
            <p>
              {t("exhibitor.form.jobwallPricePerPosting")}:{" "}
              {jobwallPrice.toFixed(2)} PLN
            </p>
          </div>
        )}
        {jobwallFields.map((field, index) => (
          <div
            key={field.id}
            className="flex flex-col gap-4 rounded-md border p-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">
                {t("exhibitor.form.jobwall")} {index + 1}
              </h4>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeJobwall(index)}
                disabled={disabled}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
            <div className="grid gap-4">
              <FieldGroup>
                <FieldLabel>{t("exhibitor.form.positionName")}</FieldLabel>
                <Input
                  {...form.register(`jobwalls.${index}.name`)}
                  disabled={disabled}
                />
                {form.formState.errors.jobwalls?.[index]?.name && (
                  <FieldError>{t("exhibitor.form.required")}</FieldError>
                )}
              </FieldGroup>

              <div className="grid gap-4 md:grid-cols-3">
                <FieldGroup>
                  <FieldLabel>{t("exhibitor.form.workForm")}</FieldLabel>
                  <Controller
                    name={`jobwalls.${index}.form`}
                    control={form.control}
                    render={({ field }) => (
                      <select
                        {...field}
                        disabled={disabled}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {workFormOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                </FieldGroup>

                <FieldGroup>
                  <FieldLabel>{t("exhibitor.form.workload")}</FieldLabel>
                  <Controller
                    name={`jobwalls.${index}.workload`}
                    control={form.control}
                    render={({ field }) => (
                      <select
                        {...field}
                        disabled={disabled}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {workloadOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                </FieldGroup>

                <FieldGroup>
                  <FieldLabel>{t("exhibitor.form.contract")}</FieldLabel>
                  <Controller
                    name={`jobwalls.${index}.contract`}
                    control={form.control}
                    render={({ field }) => (
                      <select
                        {...field}
                        disabled={disabled}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {contractOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    )}
                  />
                </FieldGroup>
              </div>

              <FieldGroup>
                <FieldLabel>
                  {t("exhibitor.form.positionDescription")}
                </FieldLabel>
                <Textarea
                  {...form.register(`jobwalls.${index}.description`)}
                  rows={3}
                  disabled={disabled}
                />
                {form.formState.errors.jobwalls?.[index]?.description && (
                  <FieldError>{t("exhibitor.form.required")}</FieldError>
                )}
              </FieldGroup>

              <FieldGroup>
                <FieldLabel>{t("exhibitor.form.benefits")}</FieldLabel>
                <Textarea
                  {...form.register(`jobwalls.${index}.benefits`)}
                  rows={3}
                  disabled={disabled}
                />
                {form.formState.errors.jobwalls?.[index]?.benefits && (
                  <FieldError>{t("exhibitor.form.required")}</FieldError>
                )}
              </FieldGroup>

              <FieldGroup>
                <FieldLabel>{t("exhibitor.form.requirements")}</FieldLabel>
                <Textarea
                  {...form.register(`jobwalls.${index}.requirements`)}
                  rows={3}
                  disabled={disabled}
                />
                {form.formState.errors.jobwalls?.[index]?.requirements && (
                  <FieldError>{t("exhibitor.form.required")}</FieldError>
                )}
              </FieldGroup>

              <FieldGroup>
                <FieldLabel>{t("exhibitor.form.applicationUrl")}</FieldLabel>
                <Input
                  {...form.register(`jobwalls.${index}.url`)}
                  type="text"
                  placeholder="https://example.com or email@example.com"
                  disabled={disabled}
                />
                {form.formState.errors.jobwalls?.[index]?.url && (
                  <FieldError>
                    {form.formState.errors.jobwalls?.[index]?.url?.message ||
                      t("exhibitor.form.invalidUrl")}
                  </FieldError>
                )}
              </FieldGroup>
            </div>
          </div>
        ))}
        {totalJobwallCost > 0 && (
          <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
            <p className="text-sm font-medium text-amber-900">
              {t("exhibitor.form.totalJobwallCost")}:{" "}
              {totalJobwallCost.toFixed(2)} PLN
            </p>
          </div>
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
