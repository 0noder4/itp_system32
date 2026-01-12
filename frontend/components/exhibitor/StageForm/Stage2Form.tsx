"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Stage2Data, EquipmentItem } from "@/lib/types";
import { stage2Schema, Stage2FormData } from "./schemas";
import { Button } from "@/components/ui/button";
import { ACCENT_COLOR } from "@/lib/colors";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, FileText, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Stage2FormProps {
  companyId?: number;
  initialData?: Stage2Data;
  onSubmit: (data: Stage2FormData) => Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  isAccepted?: boolean;
}

export function Stage2Form({
  initialData,
  onSubmit,
  isSubmitting,
  disabled = false,
  isAccepted = false,
}: Stage2FormProps) {
  const { t, locale } = useTranslation();
  const [equipmentItems, setEquipmentItems] = React.useState<EquipmentItem[]>(
    []
  );
  const [isLoadingEquipment, setIsLoadingEquipment] = React.useState(true);
  const [selectedLogoFileName, setSelectedLogoFileName] = React.useState<
    string | null
  >(null);
  const [selectedFireCertFileName, setSelectedFireCertFileName] =
    React.useState<string | null>(null);

  // Track existing file URLs from initial data
  const existingLogoFile = initialData?.stand_details?.logo_sign_file;
  const existingFireCert = initialData?.stand_details?.fire_cert;

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
      // Check if it's a known media file pattern (logos, fire_certs, etc.)
      if (path.startsWith("/logos/") || path.startsWith("/fire_certs/")) {
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

  const form = useForm<Stage2FormData>({
    resolver: zodResolver(stage2Schema),
    defaultValues: {
      stand_details: {
        stand_type:
          (initialData?.stand_details?.stand_type as
            | "provided_stand"
            | "self_construction"
            | undefined) || undefined,
        sc_details: initialData?.stand_details?.sc_details || "",
        name_sign_text: initialData?.stand_details?.name_sign_text || "",
        // Preserve existing file URLs for validation (they'll be strings, not File objects)
        logo_sign_file: initialData?.stand_details?.logo_sign_file || undefined,
        fire_cert: initialData?.stand_details?.fire_cert || undefined,
      },
      equipment_selections:
        initialData?.equipment_selections?.map((sel) => ({
          equipment_item: sel.equipment_item.id,
          quantity: sel.quantity,
        })) || [],
    },
  });

  const watchStandType = form.watch("stand_details.stand_type");
  const watchEquipmentSelections = form.watch("equipment_selections") || [];

  // Reset equipment quantities based on stand type
  React.useEffect(() => {
    if (equipmentItems.length > 0 && watchStandType) {
      const allSelections = equipmentItems.map((item: EquipmentItem) => ({
        equipment_item: item.id,
        quantity:
          watchStandType === "self_construction"
            ? 0
            : item.is_basic
            ? Math.max(1, item.included_quantity || 0)
            : 0,
      }));
      form.setValue("equipment_selections", allSelections);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchStandType, equipmentItems.length]);

  // Fetch equipment items on mount and when language changes
  React.useEffect(() => {
    async function fetchEquipmentItems() {
      setIsLoadingEquipment(true);
      try {
        const response = await apiClient.get("/api/equipment-items/");
        setEquipmentItems(response.data);

        // Initialize all equipment items with quantity 0 if no initial data
        // For basic equipment, set default quantity to included_quantity (or 1 if not set)
        // For self_construction, all quantities should be 0
        const currentStandType =
          initialData?.stand_details?.stand_type ||
          form.getValues("stand_details.stand_type");

        if (!initialData?.equipment_selections?.length) {
          const allSelections = response.data.map((item: EquipmentItem) => ({
            equipment_item: item.id,
            quantity:
              currentStandType === "self_construction"
                ? 0
                : item.is_basic
                ? Math.max(1, item.included_quantity || 0)
                : 0,
          }));
          form.setValue("equipment_selections", allSelections);
        } else {
          // Ensure all equipment items are in selections, even if not in initial data
          const existingItemIds = new Set(
            initialData.equipment_selections.map((sel) => sel.equipment_item.id)
          );
          const missingItems = response.data.filter(
            (item: EquipmentItem) => !existingItemIds.has(item.id)
          );
          const allSelections = [
            ...initialData.equipment_selections.map((sel) => ({
              equipment_item: sel.equipment_item.id,
              quantity: sel.quantity,
            })),
            ...missingItems.map((item: EquipmentItem) => ({
              equipment_item: item.id,
              quantity:
                currentStandType === "self_construction"
                  ? 0
                  : item.is_basic
                  ? Math.max(1, item.included_quantity || 0)
                  : 0,
            })),
          ];
          form.setValue("equipment_selections", allSelections);
        }
      } catch (error) {
        console.error("Error fetching equipment items:", error);
      } finally {
        setIsLoadingEquipment(false);
      }
    }
    fetchEquipmentItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const handleQuantityChange = (itemId: number, quantity: number) => {
    const currentSelections = form.getValues("equipment_selections") || [];
    const existingIndex = currentSelections.findIndex(
      (sel) => sel.equipment_item === itemId
    );

    if (quantity <= 0) {
      // Remove from selections if quantity is 0 or less
      if (existingIndex >= 0) {
        const newSelections = currentSelections.filter(
          (_, idx) => idx !== existingIndex
        );
        form.setValue("equipment_selections", newSelections);
      }
    } else {
      // Update or add selection
      if (existingIndex >= 0) {
        const updatedSelections = currentSelections.map((sel) =>
          sel.equipment_item === itemId ? { ...sel, quantity } : sel
        );
        form.setValue("equipment_selections", updatedSelections);
      } else {
        form.setValue("equipment_selections", [
          ...currentSelections,
          { equipment_item: itemId, quantity },
        ]);
      }
    }
  };

  const getSelectedQuantity = (itemId: number): number => {
    const selection = watchEquipmentSelections.find(
      (sel) => sel.equipment_item === itemId
    );
    return selection?.quantity || 0;
  };

  const calculateItemCost = (item: EquipmentItem, quantity: number): number => {
    if (quantity <= 0) return 0;

    // Calculate cost: only charge for items beyond the included quantity
    const chargeableQuantity = Math.max(0, quantity - item.included_quantity);
    return parseFloat(item.price) * chargeableQuantity;
  };

  const calculateTotalAdditionalCost = (): number => {
    return watchEquipmentSelections.reduce((total, sel) => {
      const item = equipmentItems.find((i) => i.id === sel.equipment_item);
      if (item) {
        return total + calculateItemCost(item, sel.quantity);
      }
      return total;
    }, 0);
  };

  const groupedEquipment = React.useMemo(() => {
    const grouped: Record<string, EquipmentItem[]> = {};
    equipmentItems.forEach((item) => {
      const category = item.category || "other";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    });
    return grouped;
  }, [equipmentItems]);

  const handleFileChange = (
    field: "logo_sign_file" | "fire_cert",
    file: File | null
  ) => {
    if (file) {
      form.setValue(`stand_details.${field}`, file as any, {
        shouldValidate: true,
        shouldDirty: true,
      });
      // Track selected file name
      if (field === "logo_sign_file") {
        setSelectedLogoFileName(file.name);
      } else {
        setSelectedFireCertFileName(file.name);
      }
      // Trigger validation to show errors immediately
      form.trigger(`stand_details.${field}`);
    } else {
      form.setValue(`stand_details.${field}`, undefined, {
        shouldValidate: true,
        shouldDirty: true,
      });
      // Clear selected file name
      if (field === "logo_sign_file") {
        setSelectedLogoFileName(null);
      } else {
        setSelectedFireCertFileName(null);
      }
    }
  };

  const handleFormSubmit = async (data: Stage2FormData) => {
    // Get current form values to ensure files are included (React Hook Form might strip files during validation)
    const currentFormValues = form.getValues();

    // Ensure files are included in the data (files might be stripped by zod validation)
    const dataWithFiles = {
      ...data,
      stand_details: {
        ...data.stand_details,
        // Use form values if files are missing from validated data
        logo_sign_file:
          data.stand_details?.logo_sign_file instanceof File
            ? data.stand_details.logo_sign_file
            : currentFormValues.stand_details?.logo_sign_file instanceof File
            ? currentFormValues.stand_details.logo_sign_file
            : data.stand_details?.logo_sign_file,
        fire_cert:
          data.stand_details?.fire_cert instanceof File
            ? data.stand_details.fire_cert
            : currentFormValues.stand_details?.fire_cert instanceof File
            ? currentFormValues.stand_details.fire_cert
            : data.stand_details?.fire_cert,
      },
      equipment_selections:
        data.equipment_selections?.filter((sel) => sel.quantity > 0) || [],
    };
    
    try {
      await onSubmit(dataWithFiles);
    } catch (error: any) {
      // Handle backend validation errors and set them on form fields
      if (error.response?.status === 400 && error.response?.data) {
        const errorData = error.response.data;
        let hasFieldErrors = false;
        
        // Handle stand_details errors
        if (errorData.stand_details && typeof errorData.stand_details === 'object') {
          Object.keys(errorData.stand_details).forEach((field) => {
            const fieldErrors = errorData.stand_details[field];
            const errorMessage = Array.isArray(fieldErrors) 
              ? fieldErrors[0] 
              : typeof fieldErrors === 'string' 
              ? fieldErrors 
              : String(fieldErrors);
            
            form.setError(`stand_details.${field}` as any, {
              type: 'server',
              message: errorMessage,
            });
            hasFieldErrors = true;
          });
        }
        
        // Handle equipment_selections errors
        if (errorData.equipment_selections) {
          if (Array.isArray(errorData.equipment_selections)) {
            errorData.equipment_selections.forEach((selectionErrors: any, index: number) => {
              if (selectionErrors && typeof selectionErrors === 'object') {
                Object.keys(selectionErrors).forEach((field) => {
                  const fieldErrors = selectionErrors[field];
                  const errorMessage = Array.isArray(fieldErrors) 
                    ? fieldErrors[0] 
                    : typeof fieldErrors === 'string' 
                    ? fieldErrors 
                    : String(fieldErrors);
                  
                  form.setError(`equipment_selections.${index}.${field}` as any, {
                    type: 'server',
                    message: errorMessage,
                  });
                  hasFieldErrors = true;
                });
              }
            });
          }
        }
        
        // Handle general errors (like detail field)
        if (errorData.detail && typeof errorData.detail === 'string') {
          form.setError('root', {
            type: 'server',
            message: errorData.detail,
          });
          hasFieldErrors = true;
        }
        
        // If we set field errors, don't re-throw - let users see the errors
        if (hasFieldErrors) {
          return;
        }
        
        // Re-throw if no field errors were set (unexpected format)
        throw error;
      }
      
      // Re-throw other errors
      throw error;
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit(handleFormSubmit, (errors) => {
        toast.error(
          t("exhibitor.form.validationError") || "Please fix the form errors"
        );
      })}
      className="space-y-6"
    >
      {/* Stand Type Selection */}
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.standType")}</h3>
        <Controller
          name="stand_details.stand_type"
          control={form.control}
          rules={{ required: true }}
          render={({ field }) => (
            <Tabs
              value={field.value || ""}
              onValueChange={(value) => {
                if (value) {
                  field.onChange(value);
                }
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-1 md:grid-cols-2 h-auto gap-1 md:gap-1">
                <TabsTrigger
                  value="provided_stand"
                  disabled={disabled}
                  className="py-2.5 md:py-2 text-sm md:text-sm whitespace-normal break-words"
                >
                  {t("exhibitor.form.ourStand")}
                </TabsTrigger>
                <TabsTrigger
                  value="self_construction"
                  disabled={disabled}
                  className="py-2.5 md:py-2 text-sm md:text-sm whitespace-normal break-words"
                >
                  {t("exhibitor.form.selfConstruction")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        />
        {form.formState.errors.stand_details?.stand_type && (
          <FieldError>
            {form.formState.errors.stand_details.stand_type.message ||
              t("exhibitor.form.required")}
          </FieldError>
        )}
      </div>

      {/* Show message if no stand type selected */}
      {!watchStandType && (
        <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/50 p-8 text-center">
          <p className="text-muted-foreground">
            {t("exhibitor.form.selectStandTypeMessage") ||
              "Please select a stand type above to continue"}
          </p>
        </div>
      )}

      {/* Conditional Fields Based on Stand Type */}
      {watchStandType === "provided_stand" && (
        <div className="space-y-4">
          <h3 className="font-medium">{t("exhibitor.form.ourStandDetails")}</h3>
          <FieldGroup>
            <FieldLabel>
              {t("exhibitor.form.nameSignText")}{" "}
              <span className="text-red-500">*</span>
            </FieldLabel>
            <Input
              {...form.register("stand_details.name_sign_text", {
                required:
                  watchStandType === "provided_stand"
                    ? "Name sign text is required"
                    : false,
              })}
              disabled={disabled}
            />
            {form.formState.errors.stand_details?.name_sign_text && (
              <FieldError>
                {form.formState.errors.stand_details.name_sign_text.message ||
                  t("exhibitor.form.required")}
              </FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>
              {t("exhibitor.form.uploadLogo")}{" "}
              <span className="text-red-500">*</span>
            </FieldLabel>
            <div className="relative">
              <input
                type="file"
                accept="image/*"
                required={
                  watchStandType === "provided_stand" && !existingLogoFile
                }
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  handleFileChange("logo_sign_file", file);
                }}
                disabled={disabled}
                className="sr-only"
                id="logo_file_input"
              />
              <label
                htmlFor="logo_file_input"
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
            {form.formState.errors.stand_details?.logo_sign_file && (
              <FieldError>
                {typeof form.formState.errors.stand_details.logo_sign_file ===
                  "object" &&
                "message" in form.formState.errors.stand_details.logo_sign_file
                  ? String(
                      form.formState.errors.stand_details.logo_sign_file.message
                    )
                  : t("exhibitor.form.required")}
              </FieldError>
            )}
            {form.formState.errors.stand_details &&
              !form.formState.errors.stand_details.stand_type &&
              typeof form.formState.errors.stand_details === "object" &&
              "message" in form.formState.errors.stand_details && (
                <FieldError>
                  {String(form.formState.errors.stand_details.message)}
                </FieldError>
              )}
          </FieldGroup>
        </div>
      )}

      {watchStandType === "self_construction" && (
        <div className="space-y-4">
          <h3 className="font-medium">
            {t("exhibitor.form.selfConstructionDetails")}
          </h3>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.scDetails")}</FieldLabel>
            <Textarea
              {...form.register("stand_details.sc_details")}
              disabled={disabled}
            />
            {form.formState.errors.stand_details?.sc_details && (
              <FieldError>
                {form.formState.errors.stand_details.sc_details.message ||
                  t("exhibitor.form.required")}
              </FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>
              {t("exhibitor.form.uploadFireCert")}{" "}
              <span className="text-red-500">*</span>
            </FieldLabel>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                required={
                  watchStandType === "self_construction" && !existingFireCert
                }
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  handleFileChange("fire_cert", file);
                }}
                disabled={disabled}
                className="sr-only"
                id="fire_cert_file_input"
              />
              <label
                htmlFor="fire_cert_file_input"
                className={cn(
                  "flex h-9 w-full min-w-0 cursor-pointer items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm dark:bg-input/30",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                  !disabled && "hover:bg-accent"
                )}
              >
                <span className="truncate text-muted-foreground">
                  {selectedFireCertFileName ||
                    (existingFireCert && typeof existingFireCert === "string"
                      ? getFileName(existingFireCert) || existingFireCert
                      : "No file chosen")}
                </span>
                <span className="ml-2 flex-shrink-0 rounded border bg-background px-2 py-0.5 text-xs">
                  {t("common.browse") || "Browse"}
                </span>
              </label>
            </div>
            {existingFireCert && typeof existingFireCert === "string" && (
              <a
                href={getFileUrl(existingFireCert) || "#"}
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
              {existingFireCert
                ? t("exhibitor.form.replaceFile") ||
                  "Upload a new file to replace the current one"
                : t("exhibitor.form.selectFile") || "Select a file to upload"}
            </p>
            {form.formState.errors.stand_details?.fire_cert && (
              <FieldError>
                {typeof form.formState.errors.stand_details.fire_cert ===
                  "object" &&
                "message" in form.formState.errors.stand_details.fire_cert
                  ? String(
                      form.formState.errors.stand_details.fire_cert.message
                    )
                  : t("exhibitor.form.required")}
              </FieldError>
            )}
          </FieldGroup>
        </div>
      )}

      {/* Equipment Selection - Only show if stand type is selected */}
      {watchStandType && (
        <div className="space-y-4">
          <h3 className="font-medium">
            {watchStandType === "self_construction"
              ? t("exhibitor.form.addEquipment")
              : t("exhibitor.form.selectEquipment")}
          </h3>
          {isLoadingEquipment ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedEquipment).map(([category, items]) => (
                <div key={category} className="space-y-3">
                  {category !== "other" && (
                    <h4 className="text-sm font-medium text-muted-foreground">
                      {category}
                    </h4>
                  )}
                  <div className="grid gap-4 md:grid-cols-2">
                    {items.map((item) => {
                      const quantity = getSelectedQuantity(item.id);
                      const itemCost = calculateItemCost(item, quantity);
                      const chargeableQuantity = Math.max(
                        0,
                        quantity - item.included_quantity
                      );

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "flex items-center justify-between rounded-md border p-3",
                            quantity > 0 && "border-primary bg-primary/5"
                          )}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{item.name}</span>
                              {item.included_quantity > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  ({item.included_quantity}{" "}
                                  {t("exhibitor.form.included")})
                                </span>
                              )}
                            </div>
                            {quantity > item.included_quantity && (
                              <p className="text-xs text-amber-600 mt-1">
                                {chargeableQuantity}{" "}
                                {t("exhibitor.form.additionalAt")}{" "}
                                {parseFloat(item.price).toFixed(2)} PLN{" "}
                                {t("exhibitor.form.each")}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {itemCost > 0 && (
                              <span className="text-sm font-medium text-primary">
                                {itemCost.toFixed(2)} PLN
                              </span>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">
                                {t("exhibitor.form.quantity")}:
                              </span>
                              <Input
                                id={`equipment_qty_${item.id}`}
                                type="number"
                                min="0"
                                value={quantity}
                                onChange={(e) =>
                                  handleQuantityChange(
                                    item.id,
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-20 h-8"
                                disabled={disabled}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {calculateTotalAdditionalCost() > 0 && (
            <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
              <p className="text-sm font-medium text-amber-900">
                {t("exhibitor.form.totalAdditionalCost")}:{" "}
                {calculateTotalAdditionalCost().toFixed(2)} PLN
              </p>
            </div>
          )}
        </div>
      )}

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
