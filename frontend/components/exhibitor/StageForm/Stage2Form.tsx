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
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Save, FileText, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StageDraftSaveButton } from "./StageDraftSaveButton";
import { fetchInvoiceTotal } from "@/lib/invoice-cost-utils";
import { fetcher, LunchPriceResponse } from "@/lib/api";
import useSWR from "swr";
import {
  nativeCheckboxClassName,
  nativeChoiceAppearanceStyle,
} from "@/lib/native-choice-styles";

type ScDimensions = {
  length: string;
  width: string;
  height: string;
};

function parseScDimensions(value?: string | null): ScDimensions {
  if (!value?.trim()) {
    return { length: "", width: "", height: "" };
  }
  const cleaned = value.trim().replace(/\s+/g, "");
  const match = cleaned.match(
    /^([\d]+(?:[.,]\d+)?)m?[x×]([\d]+(?:[.,]\d+)?)m?[x×]([\d]+(?:[.,]\d+)?)m?$/i
  );
  if (!match) {
    return { length: "", width: "", height: "" };
  }
  return { length: match[1], width: match[2], height: match[3] };
}

function formatScDimensions({ length, width, height }: ScDimensions): string {
  const l = length.trim();
  const w = width.trim();
  const h = height.trim();
  if (!l && !w && !h) {
    return "";
  }
  return `${l}x${w}x${h}m`;
}

type StandTypeValue = "provided_stand" | "self_construction";

function defaultEquipmentQty(
  item: EquipmentItem,
  standType: StandTypeValue
): number {
  if (item.code === "hanger") {
    return standType === "self_construction"
      ? 0
      : Math.max(1, item.included_quantity || 1);
  }
  if (item.code === "trashbin") {
    return Math.max(1, item.included_quantity || 1);
  }
  if (standType === "self_construction") {
    return 0;
  }
  if (item.is_basic || (item.included_quantity || 0) > 0) {
    return Math.max(item.included_quantity || 0, item.is_basic ? 1 : 0);
  }
  return 0;
}

function getMinEquipmentQty(
  item: EquipmentItem,
  standType: StandTypeValue
): number {
  if (item.code === "hanger") {
    return standType === "self_construction"
      ? 0
      : Math.max(1, item.included_quantity || 1);
  }
  if (item.code === "trashbin") {
    return Math.max(1, item.included_quantity || 1);
  }
  if (standType === "provided_stand" && (item.included_quantity || 0) > 0) {
    return item.included_quantity;
  }
  return 0;
}

function isPackageLockedItem(
  item: EquipmentItem,
  standType: StandTypeValue
): boolean {
  if (item.code === "trashbin") return true;
  if (item.code === "hanger" && standType === "provided_stand") return true;
  return false;
}

function isEquipmentVisible(
  item: EquipmentItem,
  standType: StandTypeValue
): boolean {
  if (item.code === "hanger" && standType === "self_construction") {
    return false;
  }
  return true;
}

interface Stage2FormProps {
  companyId?: number;
  initialData?: Stage2Data;
  onSubmit: (
    data: Stage2FormData,
    options?: { draft?: boolean }
  ) => Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  isAccepted?: boolean;
}

export function Stage2Form({
  companyId,
  initialData,
  onSubmit,
  isSubmitting,
  disabled = false,
  isAccepted = false,
}: Stage2FormProps) {
  const { t, locale } = useTranslation();
  const { data: fairSettings } = useSWR<LunchPriceResponse>(
    "/api/lunch-price/",
    fetcher
  );
  const fireCertDeadline = fairSettings?.fire_cert_deadline || null;
  const [equipmentItems, setEquipmentItems] = React.useState<EquipmentItem[]>(
    []
  );
  const [isLoadingEquipment, setIsLoadingEquipment] = React.useState(true);
  const [selectedLogoFileName, setSelectedLogoFileName] = React.useState<
    string | null
  >(null);
  const [selectedFireCertFileName, setSelectedFireCertFileName] =
    React.useState<string | null>(null);
  const [selectedVisualizationFileName, setSelectedVisualizationFileName] =
    React.useState<string | null>(null);
  const [showCostDialog, setShowCostDialog] = React.useState(false);
  const [pendingFormData, setPendingFormData] =
    React.useState<Stage2FormData | null>(null);
  const [pendingAdditionalCost, setPendingAdditionalCost] = React.useState(0);
  const [pendingInvoiceTotal, setPendingInvoiceTotal] = React.useState(0);
  const [isPreparingDialog, setIsPreparingDialog] = React.useState(false);
  const [scDimensions, setScDimensions] = React.useState<ScDimensions>(() =>
    parseScDimensions(initialData?.stand_details?.sc_details)
  );

  // Track existing file URLs from initial data
  const existingLogoFile = initialData?.stand_details?.logo_sign_file;
  const existingFireCert = initialData?.stand_details?.fire_cert;
  const existingVisualization = initialData?.stand_details?.stand_visualization;

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
      if (path.startsWith("/logos/") || path.startsWith("/fire_certs/") || path.startsWith("/stand_visualizations/")) {
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
        el_power_acknowledged:
          initialData?.stand_details?.el_power_acknowledged || false,
        sc_details: initialData?.stand_details?.sc_details || "",
        name_sign_text: initialData?.stand_details?.name_sign_text || "",
        // Preserve existing file URLs for validation (they'll be strings, not File objects)
        logo_sign_file: initialData?.stand_details?.logo_sign_file || undefined,
        fire_cert: initialData?.stand_details?.fire_cert || undefined,
        stand_visualization:
          initialData?.stand_details?.stand_visualization || undefined,
        brought_equipment:
          initialData?.stand_details?.brought_equipment || "",
      },
      equipment_selections:
        initialData?.equipment_selections?.map((sel) => ({
          equipment_item: sel.equipment_item.id,
          quantity: sel.quantity,
          mount_type: sel.mount_type ?? null,
        })) || [],
    },
  });

  const watchStandType = form.watch("stand_details.stand_type");
  const watchEquipmentSelections = form.watch("equipment_selections") || [];

  // Reset equipment quantities based on stand type
  // Only reset if there's no initial data (preserve saved selections)
  React.useEffect(() => {
    if (equipmentItems.length > 0 && watchStandType) {
      const standType = watchStandType as StandTypeValue;
      const hasInitialSelections =
        (initialData?.equipment_selections?.length ?? 0) > 0;

      if (hasInitialSelections && initialData?.equipment_selections) {
        const existingItemIds = new Set(
          initialData.equipment_selections.map((sel) => sel.equipment_item.id)
        );
        const missingItems = equipmentItems.filter(
          (item: EquipmentItem) => !existingItemIds.has(item.id)
        );

        const allSelections = [
          ...initialData.equipment_selections.map((sel) => {
            const item = sel.equipment_item;
            let quantity = sel.quantity;
            if (item.code === "hanger" && standType === "self_construction") {
              quantity = 0;
            } else if (item.code === "trashbin") {
              quantity = Math.max(
                quantity,
                Math.max(1, item.included_quantity || 1)
              );
            } else if (item.code === "hanger" && standType === "provided_stand") {
              quantity = Math.max(
                quantity,
                Math.max(1, item.included_quantity || 1)
              );
            }
            let mount_type = sel.mount_type ?? null;
            if (item.code === "tv") {
              if (quantity <= 0) mount_type = null;
              else if (standType === "self_construction" && mount_type === "wall") {
                mount_type = "stand";
              } else if (!mount_type) {
                mount_type = "stand";
              }
            } else {
              mount_type = null;
            }
            return {
              equipment_item: item.id,
              quantity,
              mount_type,
            };
          }),
          ...missingItems.map((item: EquipmentItem) => ({
            equipment_item: item.id,
            quantity: defaultEquipmentQty(item, standType),
            mount_type: null as "stand" | "wall" | null,
          })),
        ];
        form.setValue("equipment_selections", allSelections);
      } else {
        const allSelections = equipmentItems.map((item: EquipmentItem) => ({
          equipment_item: item.id,
          quantity: defaultEquipmentQty(item, standType),
          mount_type: null as "stand" | "wall" | null,
        }));
        form.setValue("equipment_selections", allSelections);
      }
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
          const standType = (currentStandType || "provided_stand") as StandTypeValue;
          const allSelections = response.data.map((item: EquipmentItem) => ({
            equipment_item: item.id,
            quantity: currentStandType
              ? defaultEquipmentQty(item, standType)
              : 0,
            mount_type: null as "stand" | "wall" | null,
          }));
          form.setValue("equipment_selections", allSelections);
        } else {
          // Ensure all equipment items are in selections, even if not in initial data
          const standType = (currentStandType || "provided_stand") as StandTypeValue;
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
              mount_type: sel.mount_type ?? null,
            })),
            ...missingItems.map((item: EquipmentItem) => ({
              equipment_item: item.id,
              quantity: defaultEquipmentQty(item, standType),
              mount_type: null as "stand" | "wall" | null,
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

  const updateScDimension = (
    field: keyof ScDimensions,
    value: string
  ) => {
    // Allow digits, comma and dot as decimal separators
    const sanitized = value.replace(/[^\d.,]/g, "");
    setScDimensions((prev) => {
      const next = { ...prev, [field]: sanitized };
      form.setValue("stand_details.sc_details", formatScDimensions(next), {
        shouldDirty: true,
        shouldValidate: true,
      });
      return next;
    });
  };

  // Keep dimension inputs in sync when initial data / stand type changes
  React.useEffect(() => {
    const parsed = parseScDimensions(initialData?.stand_details?.sc_details);
    setScDimensions(parsed);
    if (initialData?.stand_details?.sc_details) {
      form.setValue(
        "stand_details.sc_details",
        formatScDimensions(parsed) || initialData.stand_details.sc_details
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData?.stand_details?.sc_details]);

  const handleQuantityChange = (itemId: number, quantity: number) => {
    const item = equipmentItems.find((i) => i.id === itemId);
    const standType = (watchStandType || "provided_stand") as StandTypeValue;
    const minQty = item ? getMinEquipmentQty(item, standType) : 0;
    const nextQty = Math.max(minQty, quantity);
    const currentSelections = form.getValues("equipment_selections") || [];
    const existingIndex = currentSelections.findIndex(
      (sel) => sel.equipment_item === itemId
    );

    const resolveMount = (
      currentMount: "stand" | "wall" | null | undefined
    ): "stand" | "wall" | null => {
      if (!item || item.code !== "tv" || nextQty <= 0) return null;
      if (standType === "self_construction") return "stand";
      return currentMount === "wall" || currentMount === "stand"
        ? currentMount
        : "stand";
    };

    if (existingIndex >= 0) {
      const updatedSelections = currentSelections.map((sel) =>
        sel.equipment_item === itemId
          ? {
              ...sel,
              quantity: nextQty,
              mount_type: resolveMount(sel.mount_type),
            }
          : sel
      );
      form.setValue("equipment_selections", updatedSelections);
    } else {
      form.setValue("equipment_selections", [
        ...currentSelections,
        {
          equipment_item: itemId,
          quantity: nextQty,
          mount_type: resolveMount(null),
        },
      ]);
    }
  };

  const handleMountChange = (
    itemId: number,
    mountType: "stand" | "wall"
  ) => {
    const standType = (watchStandType || "provided_stand") as StandTypeValue;
    const nextMount =
      standType === "self_construction" && mountType === "wall"
        ? "stand"
        : mountType;
    const currentSelections = form.getValues("equipment_selections") || [];
    form.setValue(
      "equipment_selections",
      currentSelections.map((sel) =>
        sel.equipment_item === itemId
          ? { ...sel, mount_type: nextMount }
          : sel
      )
    );
  };

  const getSelectedQuantity = (itemId: number): number => {
    const selection = watchEquipmentSelections.find(
      (sel) => sel.equipment_item === itemId
    );
    return selection?.quantity || 0;
  };

  const getSelectedMount = (
    itemId: number
  ): "stand" | "wall" | null => {
    const selection = watchEquipmentSelections.find(
      (sel) => sel.equipment_item === itemId
    );
    return selection?.mount_type ?? null;
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
    const standType = (watchStandType || "provided_stand") as StandTypeValue;
    equipmentItems.forEach((item) => {
      if (!isEquipmentVisible(item, standType)) return;
      const category = item.category || "other";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    });
    return grouped;
  }, [equipmentItems, watchStandType]);

  const handleFileChange = (
    field: "logo_sign_file" | "fire_cert" | "stand_visualization",
    file: File | null
  ) => {
    if (file) {
      form.setValue(`stand_details.${field}`, file as any, {
        shouldValidate: true,
        shouldDirty: true,
      });
      if (field === "logo_sign_file") {
        setSelectedLogoFileName(file.name);
      } else if (field === "fire_cert") {
        setSelectedFireCertFileName(file.name);
      } else {
        setSelectedVisualizationFileName(file.name);
      }
      form.trigger(`stand_details.${field}`);
    } else {
      form.setValue(`stand_details.${field}`, undefined, {
        shouldValidate: true,
        shouldDirty: true,
      });
      if (field === "logo_sign_file") {
        setSelectedLogoFileName(null);
      } else if (field === "fire_cert") {
        setSelectedFireCertFileName(null);
      } else {
        setSelectedVisualizationFileName(null);
      }
    }
  };

  const buildSubmitPayload = (data: Stage2FormData): Stage2FormData => {
    // Get current form values to ensure files are included (React Hook Form might strip files during validation)
    const currentFormValues = form.getValues();

    return {
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
        stand_visualization:
          data.stand_details?.stand_visualization instanceof File
            ? data.stand_details.stand_visualization
            : currentFormValues.stand_details?.stand_visualization instanceof
              File
            ? currentFormValues.stand_details.stand_visualization
            : data.stand_details?.stand_visualization,
        brought_equipment:
          data.stand_details?.brought_equipment ??
          currentFormValues.stand_details?.brought_equipment ??
          "",
      },
      equipment_selections:
        data.equipment_selections?.filter((sel) => sel.quantity > 0) || [],
    };
  };

  const submitFormData = async (dataWithFiles: Stage2FormData) => {
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

  const handleFormSubmit = async (data: Stage2FormData) => {
    const dataWithFiles = buildSubmitPayload(data);
    const stageCost = calculateTotalAdditionalCost();
    setPendingFormData(dataWithFiles);
    setPendingAdditionalCost(stageCost);
    setIsPreparingDialog(true);
    try {
      const invoiceTotal = companyId
        ? await fetchInvoiceTotal(companyId, { equipment: stageCost })
        : stageCost;
      setPendingInvoiceTotal(invoiceTotal);
      setShowCostDialog(true);
    } finally {
      setIsPreparingDialog(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!pendingFormData) return;
    await submitFormData(pendingFormData);
    setShowCostDialog(false);
    setPendingFormData(null);
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
    <form
      onSubmit={form.handleSubmit(handleFormSubmit, (errors) => {
        toast.error(
          t("exhibitor.form.validationError") || "Please fix the form errors"
        );
      })}
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
      {/* Electrical power acknowledgement — before stand type */}
      <FieldGroup>
        <div className="flex items-start gap-2">
          <Controller
            name="stand_details.el_power_acknowledged"
            control={form.control}
            render={({ field }) => (
              <input
                type="checkbox"
                id="el_power_acknowledged"
                checked={!!field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                onBlur={field.onBlur}
                ref={field.ref}
                className={nativeCheckboxClassName}
                style={nativeChoiceAppearanceStyle}
                disabled={disabled}
              />
            )}
          />
          <FieldLabel
            htmlFor="el_power_acknowledged"
            className="cursor-pointer font-normal leading-snug"
          >
            {t("exhibitor.form.elPowerAcknowledged")}
          </FieldLabel>
        </div>
        {form.formState.errors.stand_details?.el_power_acknowledged && (
          <FieldError>
            {form.formState.errors.stand_details.el_power_acknowledged
              .message || t("exhibitor.form.required")}
          </FieldError>
        )}
      </FieldGroup>

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
        {watchStandType === "provided_stand" && (
          <p className="text-sm text-muted-foreground">
            {t("exhibitor.form.ourStandHint")}
          </p>
        )}
        {watchStandType === "self_construction" && (
          <p className="text-sm text-muted-foreground">
            {t("exhibitor.form.selfConstructionHint")}
          </p>
        )}
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
          <div className="space-y-3">
            <FieldLabel>
              {t("exhibitor.form.scDetails")}{" "}
              <span className="text-red-500">*</span>
            </FieldLabel>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  {
                    key: "length" as const,
                    labelKey: "exhibitor.form.scLength",
                    placeholderKey: "exhibitor.form.scLengthPlaceholder",
                  },
                  {
                    key: "width" as const,
                    labelKey: "exhibitor.form.scWidth",
                    placeholderKey: "exhibitor.form.scWidthPlaceholder",
                  },
                  {
                    key: "height" as const,
                    labelKey: "exhibitor.form.scHeight",
                    placeholderKey: "exhibitor.form.scHeightPlaceholder",
                  },
                ] as const
              ).map(({ key, labelKey, placeholderKey }) => (
                <FieldGroup key={key}>
                  <FieldLabel htmlFor={`sc_${key}`}>{t(labelKey)}</FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`sc_${key}`}
                      value={scDimensions[key]}
                      placeholder={t(placeholderKey)}
                      disabled={disabled}
                      inputMode="decimal"
                      className="w-full"
                      onChange={(e) => updateScDimension(key, e.target.value)}
                    />
                    <span className="text-sm font-medium text-muted-foreground shrink-0">
                      m
                    </span>
                  </div>
                </FieldGroup>
              ))}
            </div>
            {form.formState.errors.stand_details?.sc_details && (
              <FieldError>
                {form.formState.errors.stand_details.sc_details.message ||
                  t("exhibitor.form.required")}
              </FieldError>
            )}
          </div>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.uploadFireCert")}</FieldLabel>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
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
              {fireCertDeadline
                ? t("exhibitor.form.fireCertDeadlineHint", {
                    date: fireCertDeadline,
                  })
                : t("exhibitor.form.fireCertDeadlineHintNoDate")}
            </p>
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
          <FieldGroup>
            <FieldLabel>
              {t("exhibitor.form.uploadStandVisualization")}{" "}
              <span className="text-red-500">*</span>
            </FieldLabel>
            <div className="relative">
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                required={
                  watchStandType === "self_construction" &&
                  !existingVisualization
                }
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  handleFileChange("stand_visualization", file);
                }}
                disabled={disabled}
                className="sr-only"
                id="stand_visualization_file_input"
              />
              <label
                htmlFor="stand_visualization_file_input"
                className={cn(
                  "flex h-9 w-full min-w-0 cursor-pointer items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm dark:bg-input/30",
                  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                  !disabled && "hover:bg-accent"
                )}
              >
                <span className="truncate text-muted-foreground">
                  {selectedVisualizationFileName ||
                    (existingVisualization &&
                    typeof existingVisualization === "string"
                      ? getFileName(existingVisualization) ||
                        existingVisualization
                      : "No file chosen")}
                </span>
                <span className="ml-2 flex-shrink-0 rounded border bg-background px-2 py-0.5 text-xs">
                  {t("common.browse") || "Browse"}
                </span>
              </label>
            </div>
            {existingVisualization &&
              typeof existingVisualization === "string" && (
                <a
                  href={getFileUrl(existingVisualization) || "#"}
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
              {existingVisualization
                ? t("exhibitor.form.replaceFile") ||
                  "Upload a new file to replace the current one"
                : t("exhibitor.form.selectFile") || "Select a file to upload"}
            </p>
            {form.formState.errors.stand_details?.stand_visualization && (
              <FieldError>
                {typeof form.formState.errors.stand_details
                  .stand_visualization === "object" &&
                "message" in
                  form.formState.errors.stand_details.stand_visualization
                  ? String(
                      form.formState.errors.stand_details.stand_visualization
                        .message
                    )
                  : t("exhibitor.form.required")}
              </FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.broughtEquipment")}</FieldLabel>
            <textarea
              {...form.register("stand_details.brought_equipment")}
              disabled={disabled}
              rows={3}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm dark:bg-input/30"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("exhibitor.form.broughtEquipmentHint")}
            </p>
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
                      const standType = (watchStandType ||
                        "provided_stand") as StandTypeValue;
                      const quantity = getSelectedQuantity(item.id);
                      const itemCost = calculateItemCost(item, quantity);
                      const chargeableQuantity = Math.max(
                        0,
                        quantity - item.included_quantity
                      );
                      const packageLocked = isPackageLockedItem(
                        item,
                        standType
                      );
                      const minQty = getMinEquipmentQty(item, standType);
                      const isMutedPackage =
                        packageLocked ||
                        (standType === "provided_stand" &&
                          (item.included_quantity > 0 || item.is_basic) &&
                          quantity <= item.included_quantity);
                      const mountType = getSelectedMount(item.id);
                      const wallMountBlocked =
                        standType === "self_construction";

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "rounded-md border p-3 space-y-2",
                            quantity > 0 &&
                              !isMutedPackage &&
                              "border-primary bg-primary/5",
                            isMutedPackage &&
                              "border-muted bg-muted/40 opacity-90"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{item.name}</span>
                                {(packageLocked ||
                                  item.included_quantity > 0) && (
                                  <span className="text-xs text-muted-foreground">
                                    ({t("exhibitor.form.inPackage")}
                                    {item.included_quantity > 0
                                      ? `: ${item.included_quantity}`
                                      : ""}
                                    )
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
                              {item.code === "arc_counter" && quantity > 0 && (
                                <p className="text-xs text-amber-700 mt-1">
                                  {t("exhibitor.form.arcCounterWarning")}
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
                                  min={minQty}
                                  value={quantity}
                                  onChange={(e) =>
                                    handleQuantityChange(
                                      item.id,
                                      parseInt(e.target.value) || 0
                                    )
                                  }
                                  className="w-20 h-8"
                                  disabled={disabled || packageLocked}
                                />
                              </div>
                            </div>
                          </div>
                          {item.code === "tv" && quantity >= 1 && (
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">
                                {t("exhibitor.form.tvMount")}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant={
                                    mountType === "stand"
                                      ? "default"
                                      : "outline"
                                  }
                                  size="sm"
                                  disabled={disabled}
                                  onClick={() =>
                                    handleMountChange(item.id, "stand")
                                  }
                                >
                                  {t("exhibitor.form.tvMountStand")}
                                </Button>
                                <Button
                                  type="button"
                                  variant={
                                    mountType === "wall"
                                      ? "default"
                                      : "outline"
                                  }
                                  size="sm"
                                  disabled={disabled || wallMountBlocked}
                                  title={
                                    wallMountBlocked
                                      ? t("exhibitor.form.tvMountWallBlocked")
                                      : undefined
                                  }
                                  onClick={() =>
                                    handleMountChange(item.id, "wall")
                                  }
                                >
                                  {t("exhibitor.form.tvMountWall")}
                                </Button>
                              </div>
                              {wallMountBlocked && (
                                <p className="text-xs text-muted-foreground">
                                  {t("exhibitor.form.tvMountWallBlocked")}
                                </p>
                              )}
                            </div>
                          )}
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
        open={showCostDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCostDialog(false);
            setPendingFormData(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("exhibitor.form.equipmentPaymentDialogTitle")}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                {t("exhibitor.form.equipmentPaymentDialogText", {
                  amount: pendingAdditionalCost.toFixed(2),
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
                setShowCostDialog(false);
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
