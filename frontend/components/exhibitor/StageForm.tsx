"use client";

import React from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  StageInfo,
  Stage1Data,
  Stage2Data,
  Stage3Data,
  Stage4Data,
  Stage5Data,
} from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Loader2, Plus, Trash2, Save } from "lucide-react";

// ============================================================
// Form Schemas
// ============================================================

const stage1Schema = z.object({
  basic_data: z.object({
    full_name: z.string().min(1),
    nip: z.string().min(1),
  }),
  address: z.object({
    street: z.string().min(1),
    home_number: z.string().min(1),
    apt_number: z.string().optional(),
    city: z.string().min(1),
    country: z.string().min(1),
    postal_code: z.string().min(1),
  }),
  contact_person: z.object({
    name: z.string().min(1),
    surname: z.string().min(1),
    phone_number: z.string().min(1),
    email: z.string().email(),
  }),
});

const stage2Schema = z.object({
  stand_details: z.object({
    self_construction: z.boolean(),
    sc_details: z.string().optional(),
    name_sign_text: z.string().optional(),
  }),
  basic_equipment: z.object({
    chair: z.number().min(0),
    counter: z.boolean(),
    trashbin: z.boolean(),
    hanger: z.boolean(),
  }).optional(),
});

const stage3Schema = z.object({
  workshop: z.boolean(),
  notes: z.string().optional(),
});

const stage4Schema = z.object({
  name: z.string().min(1),
  form: z.enum(["s", "z", "h", "k", "m"]),
  workload: z.enum(["pelen", "pol", "trzyczwarte", "el"]),
  contract: z.enum(["uop", "uoz", "uod", "b2b", "uos"]),
  description: z.string().min(1),
  benefits: z.string().min(1),
  requirements: z.string().min(1),
  url: z.string().url(),
});

const stage5Schema = z.object({
  description: z.object({
    descr: z.string().min(1),
  }),
  final_data: z.object({
    gg_parking: z.boolean(),
    el_devices: z.string().min(1),
    el_power: z.string().min(1),
  }),
  lunches: z.array(z.object({
    day: z.enum(["day1", "day2"]),
    lunch_quantity: z.number().min(0),
    diet_info: z.string(),
  })).optional(),
  pdi: z.object({
    tickets_quantity: z.number().min(0),
  }).nullable().optional(),
  exhibitors: z.array(z.object({
    name: z.string().min(1),
    surname: z.string().min(1),
    phone_number: z.string().min(1),
  })).optional(),
});

type FormSchema = 
  | z.infer<typeof stage1Schema>
  | z.infer<typeof stage2Schema>
  | z.infer<typeof stage3Schema>
  | z.infer<typeof stage4Schema>
  | z.infer<typeof stage5Schema>;

// ============================================================
// Stage Form Props
// ============================================================

interface StageFormProps {
  stageNumber: number;
  stageInfo: StageInfo;
  companyId: number;
  initialData?: any;
  onSuccess?: () => void;
}

// ============================================================
// Individual Stage Forms
// ============================================================

function Stage1Form({
  companyId,
  initialData,
  onSubmit,
  isSubmitting,
}: {
  companyId: number;
  initialData?: Stage1Data;
  onSubmit: (data: z.infer<typeof stage1Schema>) => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation();
  const form = useForm<z.infer<typeof stage1Schema>>({
    resolver: zodResolver(stage1Schema),
    defaultValues: {
      basic_data: {
        full_name: initialData?.basic_data?.full_name || "",
        nip: initialData?.basic_data?.nip || "",
      },
      address: {
        street: initialData?.address?.street || "",
        home_number: initialData?.address?.home_number || "",
        apt_number: initialData?.address?.apt_number || "",
        city: initialData?.address?.city || "",
        country: initialData?.address?.country || "Polska",
        postal_code: initialData?.address?.postal_code || "",
      },
      contact_person: {
        name: initialData?.contact_person?.name || "",
        surname: initialData?.contact_person?.surname || "",
        phone_number: initialData?.contact_person?.phone_number || "",
        email: initialData?.contact_person?.email || "",
      },
    },
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Data Section */}
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.basicData")}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.fullName")}</FieldLabel>
            <Input {...form.register("basic_data.full_name")} />
            {form.formState.errors.basic_data?.full_name && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.nip")}</FieldLabel>
            <Input {...form.register("basic_data.nip")} />
            {form.formState.errors.basic_data?.nip && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
        </div>
      </div>

      {/* Address Section */}
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.address")}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.street")}</FieldLabel>
            <Input {...form.register("address.street")} />
            {form.formState.errors.address?.street && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.homeNumber")}</FieldLabel>
            <Input {...form.register("address.home_number")} />
            {form.formState.errors.address?.home_number && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.aptNumber")}</FieldLabel>
            <Input {...form.register("address.apt_number")} />
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.city")}</FieldLabel>
            <Input {...form.register("address.city")} />
            {form.formState.errors.address?.city && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.country")}</FieldLabel>
            <Input {...form.register("address.country")} />
            {form.formState.errors.address?.country && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.postalCode")}</FieldLabel>
            <Input {...form.register("address.postal_code")} />
            {form.formState.errors.address?.postal_code && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
        </div>
      </div>

      {/* Contact Person Section */}
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.contactPerson")}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.firstName")}</FieldLabel>
            <Input {...form.register("contact_person.name")} />
            {form.formState.errors.contact_person?.name && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.lastName")}</FieldLabel>
            <Input {...form.register("contact_person.surname")} />
            {form.formState.errors.contact_person?.surname && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.phone")}</FieldLabel>
            <Input {...form.register("contact_person.phone_number")} />
            {form.formState.errors.contact_person?.phone_number && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.email")}</FieldLabel>
            <Input type="email" {...form.register("contact_person.email")} />
            {form.formState.errors.contact_person?.email && (
              <FieldError>{t("exhibitor.form.invalidEmail")}</FieldError>
            )}
          </FieldGroup>
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("common.loading")}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            {t("common.save")}
          </>
        )}
      </Button>
    </form>
  );
}

function Stage2Form({
  companyId,
  initialData,
  onSubmit,
  isSubmitting,
}: {
  companyId: number;
  initialData?: Stage2Data;
  onSubmit: (data: z.infer<typeof stage2Schema>) => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation();
  const form = useForm<z.infer<typeof stage2Schema>>({
    resolver: zodResolver(stage2Schema),
    defaultValues: {
      stand_details: {
        self_construction: initialData?.stand_details?.self_construction || false,
        sc_details: initialData?.stand_details?.sc_details || "",
        name_sign_text: initialData?.stand_details?.name_sign_text || "",
      },
      basic_equipment: {
        chair: initialData?.basic_equipment?.chair || 2,
        counter: initialData?.basic_equipment?.counter ?? true,
        trashbin: initialData?.basic_equipment?.trashbin ?? true,
        hanger: initialData?.basic_equipment?.hanger ?? true,
      },
    },
  });

  const watchSelfConstruction = form.watch("stand_details.self_construction");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Stand Details */}
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.standDetails")}</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="self_construction"
              {...form.register("stand_details.self_construction")}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="self_construction">
              {t("exhibitor.form.selfConstruction")}
            </Label>
          </div>

          {watchSelfConstruction && (
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.scDetails")}</FieldLabel>
              <Textarea {...form.register("stand_details.sc_details")} />
            </FieldGroup>
          )}

          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.nameSignText")}</FieldLabel>
            <Input {...form.register("stand_details.name_sign_text")} />
          </FieldGroup>
        </div>
      </div>

      {/* Basic Equipment */}
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.basicEquipment")}</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.chairs")}</FieldLabel>
            <Input
              type="number"
              min="0"
              {...form.register("basic_equipment.chair", { valueAsNumber: true })}
            />
          </FieldGroup>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="counter"
                {...form.register("basic_equipment.counter")}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="counter">{t("exhibitor.form.counter")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="trashbin"
                {...form.register("basic_equipment.trashbin")}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="trashbin">{t("exhibitor.form.trashbin")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hanger"
                {...form.register("basic_equipment.hanger")}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="hanger">{t("exhibitor.form.hanger")}</Label>
            </div>
          </div>
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("common.loading")}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            {t("common.save")}
          </>
        )}
      </Button>
    </form>
  );
}

function Stage3Form({
  companyId,
  initialData,
  onSubmit,
  isSubmitting,
}: {
  companyId: number;
  initialData?: Stage3Data;
  onSubmit: (data: z.infer<typeof stage3Schema>) => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation();
  const form = useForm<z.infer<typeof stage3Schema>>({
    resolver: zodResolver(stage3Schema),
    defaultValues: {
      workshop: initialData?.workshop || false,
      notes: initialData?.notes || "",
    },
  });

  const watchWorkshop = form.watch("workshop");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.workshopInfo")}</h3>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="workshop"
            {...form.register("workshop")}
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label htmlFor="workshop">{t("exhibitor.form.willConductWorkshop")}</Label>
        </div>

        {watchWorkshop && (
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.workshopNotes")}</FieldLabel>
            <Textarea {...form.register("notes")} rows={4} />
          </FieldGroup>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("common.loading")}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            {t("common.save")}
          </>
        )}
      </Button>
    </form>
  );
}

function Stage4Form({
  companyId,
  initialData,
  onSubmit,
  isSubmitting,
}: {
  companyId: number;
  initialData?: Stage4Data;
  onSubmit: (data: z.infer<typeof stage4Schema>) => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation();
  const form = useForm<z.infer<typeof stage4Schema>>({
    resolver: zodResolver(stage4Schema),
    defaultValues: {
      name: initialData?.name || "",
      form: initialData?.form || "s",
      workload: initialData?.workload || "pelen",
      contract: initialData?.contract || "uop",
      description: initialData?.description || "",
      benefits: initialData?.benefits || "",
      requirements: initialData?.requirements || "",
      url: initialData?.url || "",
    },
  });

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

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.jobwallInfo")}</h3>
        <div className="grid gap-4">
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.positionName")}</FieldLabel>
            <Input {...form.register("name")} />
            {form.formState.errors.name && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>

          <div className="grid gap-4 md:grid-cols-3">
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.workForm")}</FieldLabel>
              <Controller
                name="form"
                control={form.control}
                render={({ field }) => (
                  <select
                    {...field}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                name="workload"
                control={form.control}
                render={({ field }) => (
                  <select
                    {...field}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                name="contract"
                control={form.control}
                render={({ field }) => (
                  <select
                    {...field}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
            <FieldLabel>{t("exhibitor.form.positionDescription")}</FieldLabel>
            <Textarea {...form.register("description")} rows={3} />
            {form.formState.errors.description && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.benefits")}</FieldLabel>
            <Textarea {...form.register("benefits")} rows={3} />
            {form.formState.errors.benefits && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.requirements")}</FieldLabel>
            <Textarea {...form.register("requirements")} rows={3} />
            {form.formState.errors.requirements && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.applicationUrl")}</FieldLabel>
            <Input {...form.register("url")} type="url" placeholder="https://" />
            {form.formState.errors.url && (
              <FieldError>{t("exhibitor.form.invalidUrl")}</FieldError>
            )}
          </FieldGroup>
        </div>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("common.loading")}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            {t("common.save")}
          </>
        )}
      </Button>
    </form>
  );
}

function Stage5Form({
  companyId,
  initialData,
  onSubmit,
  isSubmitting,
}: {
  companyId: number;
  initialData?: Stage5Data;
  onSubmit: (data: z.infer<typeof stage5Schema>) => void;
  isSubmitting: boolean;
}) {
  const { t } = useTranslation();
  const form = useForm<z.infer<typeof stage5Schema>>({
    resolver: zodResolver(stage5Schema),
    defaultValues: {
      description: {
        descr: initialData?.description?.descr || "",
      },
      final_data: {
        gg_parking: initialData?.final_data?.gg_parking || false,
        el_devices: initialData?.final_data?.el_devices || "",
        el_power: initialData?.final_data?.el_power || "",
      },
      lunches: initialData?.lunches || [],
      pdi: initialData?.pdi || null,
      exhibitors: initialData?.exhibitors || [],
    },
  });

  const { fields: lunchFields, append: appendLunch, remove: removeLunch } = useFieldArray({
    control: form.control,
    name: "lunches",
  });

  const { fields: exhibitorFields, append: appendExhibitor, remove: removeExhibitor } = useFieldArray({
    control: form.control,
    name: "exhibitors",
  });

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {/* Company Description */}
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.companyDescription")}</h3>
        <FieldGroup>
          <FieldLabel>{t("exhibitor.form.description")}</FieldLabel>
          <Textarea {...form.register("description.descr")} rows={4} />
          {form.formState.errors.description?.descr && (
            <FieldError>{t("exhibitor.form.required")}</FieldError>
          )}
        </FieldGroup>
      </div>

      {/* Final Data */}
      <div className="space-y-4">
        <h3 className="font-medium">{t("exhibitor.form.finalData")}</h3>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="gg_parking"
            {...form.register("final_data.gg_parking")}
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label htmlFor="gg_parking">{t("exhibitor.form.needsParking")}</Label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.electricDevices")}</FieldLabel>
            <Input {...form.register("final_data.el_devices")} />
            {form.formState.errors.final_data?.el_devices && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>{t("exhibitor.form.electricPower")}</FieldLabel>
            <Input {...form.register("final_data.el_power")} />
            {form.formState.errors.final_data?.el_power && (
              <FieldError>{t("exhibitor.form.required")}</FieldError>
            )}
          </FieldGroup>
        </div>
      </div>

      {/* Lunches */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{t("exhibitor.form.lunches")}</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendLunch({ day: "day1", lunch_quantity: 1, diet_info: "" })}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("exhibitor.form.addLunch")}
          </Button>
        </div>
        {lunchFields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-4 rounded-md border p-4">
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.day")}</FieldLabel>
              <Controller
                name={`lunches.${index}.day`}
                control={form.control}
                render={({ field }) => (
                  <select
                    {...field}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="day1">10.03.2025</option>
                    <option value="day2">11.03.2025</option>
                  </select>
                )}
              />
            </FieldGroup>
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.quantity")}</FieldLabel>
              <Input
                type="number"
                min="0"
                {...form.register(`lunches.${index}.lunch_quantity`, { valueAsNumber: true })}
              />
            </FieldGroup>
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.dietInfo")}</FieldLabel>
              <Input {...form.register(`lunches.${index}.diet_info`)} />
            </FieldGroup>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeLunch(index)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      {/* Exhibitors */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{t("exhibitor.form.exhibitors")}</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendExhibitor({ name: "", surname: "", phone_number: "" })}
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("exhibitor.form.addExhibitor")}
          </Button>
        </div>
        {exhibitorFields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-4 rounded-md border p-4">
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.firstName")}</FieldLabel>
              <Input {...form.register(`exhibitors.${index}.name`)} />
            </FieldGroup>
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.lastName")}</FieldLabel>
              <Input {...form.register(`exhibitors.${index}.surname`)} />
            </FieldGroup>
            <FieldGroup className="flex-1">
              <FieldLabel>{t("exhibitor.form.phone")}</FieldLabel>
              <Input {...form.register(`exhibitors.${index}.phone_number`)} />
            </FieldGroup>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeExhibitor(index)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("common.loading")}
          </>
        ) : (
          <>
            <Save className="mr-2 h-4 w-4" />
            {t("common.save")}
          </>
        )}
      </Button>
    </form>
  );
}

// ============================================================
// Main StageForm Component
// ============================================================

export function StageForm({
  stageNumber,
  stageInfo,
  companyId,
  initialData,
  onSuccess,
}: StageFormProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [stageData, setStageData] = React.useState<any>(initialData);

  // Fetch stage data if not provided
  React.useEffect(() => {
    async function fetchStageData() {
      if (initialData) {
        setStageData(initialData);
        setIsLoading(false);
        return;
      }

      // Only fetch if data exists
      if (!stageInfo.dataExists) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await apiClient.get(
          `/api/company/${companyId}/form/stage-${stageNumber}/`
        );
        setStageData(response.data);
      } catch (error) {
        // Data might not exist yet, which is fine
        console.log("No existing stage data");
      } finally {
        setIsLoading(false);
      }
    }

    fetchStageData();
  }, [companyId, stageNumber, initialData, stageInfo.dataExists]);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const method = stageInfo.dataExists ? "patch" : "post";
      const endpoint = `/api/company/${companyId}/form/stage-${stageNumber}/`;
      
      // Add company ID to the data where needed
      const payload = { ...data };
      if (stageNumber === 1 && payload.basic_data) {
        payload.basic_data.company = companyId;
      } else if (stageNumber === 2 && payload.stand_details) {
        payload.stand_details.company = companyId;
      } else if (stageNumber === 3) {
        payload.company = companyId;
      } else if (stageNumber === 4) {
        payload.company = companyId;
      } else if (stageNumber === 5) {
        if (payload.description) payload.description.company = companyId;
        if (payload.final_data) payload.final_data.company = companyId;
      }

      await apiClient[method](endpoint, payload);
      toast.success(t("exhibitor.form.saveSuccess"));
      onSuccess?.();
    } catch (error: any) {
      console.error("Form submission error:", error);
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        t("exhibitor.form.saveError");
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`exhibitor.${stageInfo.title}`)}</CardTitle>
        <CardDescription>{t(`exhibitor.${stageInfo.description}`)}</CardDescription>
        {stageInfo.status === "rejected" && stageInfo.feedback?.comment && (
          <div className="mt-4 flex items-start gap-2 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">{t("exhibitor.form.rejectionReason")}</p>
              <p>{stageInfo.feedback.comment}</p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {stageNumber === 1 && (
          <Stage1Form
            companyId={companyId}
            initialData={stageData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}
        {stageNumber === 2 && (
          <Stage2Form
            companyId={companyId}
            initialData={stageData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}
        {stageNumber === 3 && (
          <Stage3Form
            companyId={companyId}
            initialData={stageData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}
        {stageNumber === 4 && (
          <Stage4Form
            companyId={companyId}
            initialData={stageData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}
        {stageNumber === 5 && (
          <Stage5Form
            companyId={companyId}
            initialData={stageData}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}
      </CardContent>
    </Card>
  );
}


