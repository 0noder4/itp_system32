"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { UserPlus } from "lucide-react";
import { apiClient } from "@/lib/api";
import { getUserType } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface InvitationFormDialogProps {
  onSuccess: () => void;
}

type StaffInviteRole = "opiekun" | "fr" | "lg" | "tr";
type InviteTarget = "company" | StaffInviteRole;

const ADMIN_STAFF_TARGETS: StaffInviteRole[] = ["fr", "lg", "tr"];

const INVITE_TARGET_META: Record<
  InviteTarget,
  { tabKey: string; titleKey: string; descriptionKey: string; successKey: string }
> = {
  company: {
    tabKey: "companies.invite.targetCompany",
    titleKey: "companies.invite.title",
    descriptionKey: "companies.invite.description",
    successKey: "companies.invite.success",
  },
  opiekun: {
    tabKey: "companies.invite.targetOpiekun",
    titleKey: "companies.invite.opiekunTitle",
    descriptionKey: "companies.invite.opiekunDescription",
    successKey: "companies.invite.opiekunSuccess",
  },
  fr: {
    tabKey: "companies.invite.targetFr",
    titleKey: "companies.invite.frTitle",
    descriptionKey: "companies.invite.frDescription",
    successKey: "companies.invite.frSuccess",
  },
  lg: {
    tabKey: "companies.invite.targetLg",
    titleKey: "companies.invite.lgTitle",
    descriptionKey: "companies.invite.lgDescription",
    successKey: "companies.invite.lgSuccess",
  },
  tr: {
    tabKey: "companies.invite.targetTr",
    titleKey: "companies.invite.trTitle",
    descriptionKey: "companies.invite.trDescription",
    successKey: "companies.invite.trSuccess",
  },
};

const BEST_EMAIL_DOMAIN = "best.pw.edu.pl";

function normalizeBestEmail(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("@")) return trimmed;
  return `${trimmed}@${BEST_EMAIL_DOMAIN}`;
}

const nativeSelectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base text-foreground shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

type InviteFormValues = {
  email: string;
  company_name: string;
  company_status: "main" | "partner" | "basic";
  planned_stand_size: "" | "podstawowy" | "standardowy" | "rozszerzony";
  planned_days_count: "1" | "2";
  language: "en" | "pl";
};

export function InvitationFormDialog({ onSuccess }: InvitationFormDialogProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [target, setTarget] = React.useState<InviteTarget>("company");
  const emailInputRef = React.useRef<HTMLInputElement | null>(null);
  const isAdmin = getUserType() === "admin";
  const isStaffTarget = target !== "company";
  const visibleTargets: InviteTarget[] = isAdmin
    ? ["company", "opiekun", ...ADMIN_STAFF_TARGETS]
    : ["company", "opiekun"];
  const activeMeta = INVITE_TARGET_META[target];

  const targetRef = React.useRef(target);
  targetRef.current = target;

  const form = useForm<InviteFormValues>({
    defaultValues: {
      email: "",
      company_name: "",
      company_status: "basic",
      planned_stand_size: "",
      planned_days_count: "2",
      language: "pl",
    },
    resolver: async (values, context, options) => {
      const schema =
        targetRef.current === "company"
          ? z.object({
              email: z.string().email(t("auth.validation.emailRequired")),
              company_name: z
                .string()
                .min(1, t("auth.validation.companyNameRequired"))
                .max(100, t("companies.invite.companyNameMaxLength")),
              company_status: z.enum(["main", "partner", "basic"]),
              planned_stand_size: z.enum([
                "",
                "podstawowy",
                "standardowy",
                "rozszerzony",
              ]),
              planned_days_count: z.enum(["1", "2"]),
              language: z.enum(["en", "pl"]),
            })
          : z.object({
              email: z
                .string()
                .trim()
                .min(1, t("auth.validation.emailRequired"))
                .refine(
                  (val) => z.string().email().safeParse(normalizeBestEmail(val)).success,
                  t("auth.validation.emailRequired")
                )
                .refine(
                  (val) =>
                    normalizeBestEmail(val).toLowerCase().endsWith(`@${BEST_EMAIL_DOMAIN}`),
                  t("companies.invite.bestDomainError")
                ),
              company_name: z.string(),
              company_status: z.enum(["main", "partner", "basic"]),
              planned_stand_size: z.enum([
                "",
                "podstawowy",
                "standardowy",
                "rozszerzony",
              ]),
              planned_days_count: z.enum(["1", "2"]),
              language: z.enum(["en", "pl"]),
            });
      return zodResolver(schema)(values, context, options);
    },
  });

  const watchCompanyStatus = form.watch("company_status");
  const watchPlannedStandSize = form.watch("planned_stand_size");

  const resetAll = () => {
    form.reset({
      email: "",
      company_name: "",
      company_status: "basic",
      planned_stand_size: "",
      planned_days_count: "2",
      language: "pl",
    });
    setTarget("company");
  };

  const switchTarget = (next: InviteTarget) => {
    if (next === target || isSubmitting) return;
    setTarget(next);
    form.setValue("email", "");
    form.clearErrors();
    // Focus email after the new fields paint (Tabs typeahead used to steal keystrokes).
    requestAnimationFrame(() => emailInputRef.current?.focus());
  };

  const onSubmit = async (data: InviteFormValues) => {
    setIsSubmitting(true);
    try {
      if (target === "company") {
        const isBasicWithSize =
          data.company_status === "basic" && data.planned_stand_size !== "";
        await apiClient.post("/api/invite/", {
          email: data.email,
          company_name: data.company_name,
          company_status: data.company_status,
          planned_stand_size: isBasicWithSize ? data.planned_stand_size : "",
          planned_days_count: isBasicWithSize
            ? Number(data.planned_days_count)
            : null,
          language: data.language,
        });
        toast.success(t("companies.invite.success"), {
          description: t("companies.invite.successDescription", { email: data.email }),
        });
      } else {
        const resolvedEmail = normalizeBestEmail(data.email);
        await apiClient.post("/api/staff-invite/", {
          email: resolvedEmail,
          language: data.language,
          role: target,
        });
        toast.success(t(INVITE_TARGET_META[target].successKey), {
          description: t("companies.invite.successDescription", {
            email: resolvedEmail,
          }),
        });
      }
      setIsOpen(false);
      resetAll();
      onSuccess();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        Object.values(error.response?.data || {}).flat()[0] ||
        t("companies.invite.errorDescription");
      toast.error(t("companies.invite.error"), { description: String(errorMessage) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) resetAll();
      }}
    >
      <DialogTrigger asChild>
        <Button
          className="text-xs sm:text-sm whitespace-nowrap"
          size="sm"
          style={{ backgroundColor: STAFF_ACCENT_COLOR }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#C84FA8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
          }}
        >
          <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("companies.invite.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t(activeMeta.titleKey)}</DialogTitle>
          <DialogDescription>{t(activeMeta.descriptionKey)}</DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "grid gap-1 rounded-md bg-muted p-1",
            isAdmin ? "grid-cols-5" : "grid-cols-2"
          )}
          role="tablist"
          aria-label={t("companies.invite.button")}
        >
          {visibleTargets.map((tabTarget) => (
            <button
              key={tabTarget}
              type="button"
              role="tab"
              aria-selected={target === tabTarget}
              disabled={isSubmitting}
              onClick={() => switchTarget(tabTarget)}
              className={cn(
                "rounded-sm px-2 py-1.5 text-xs sm:text-sm font-medium transition-all",
                target === tabTarget
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(INVITE_TARGET_META[tabTarget].tabKey)}
            </button>
          ))}
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} id="invite-form">
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => {
                const showBestSuffix = isStaffTarget && !(field.value ?? "").includes("@");
                return (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="invite-email">
                      {t("companies.invite.emailLabel")}
                    </FieldLabel>
                    <div className="relative">
                      <Input
                        {...field}
                        ref={(el) => {
                          field.ref(el);
                          emailInputRef.current = el;
                        }}
                        id="invite-email"
                        type={isStaffTarget ? "text" : "email"}
                        inputMode="email"
                        autoComplete="email"
                        placeholder={
                          target === "company"
                            ? t("companies.invite.emailPlaceholder")
                            : t("companies.invite.staffEmailPlaceholder")
                        }
                        className={cn(showBestSuffix && "pr-36")}
                        aria-invalid={fieldState.invalid}
                        disabled={isSubmitting}
                      />
                      {showBestSuffix && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none select-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
                        >
                          @{BEST_EMAIL_DOMAIN}
                        </span>
                      )}
                    </div>
                    {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                  </Field>
                );
              }}
            />
            {target === "company" && (
              <>
                <Controller
                  name="company_name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="invite-company-name">
                        {t("companies.invite.companyNameLabel")}
                      </FieldLabel>
                      <Input
                        {...field}
                        id="invite-company-name"
                        type="text"
                        maxLength={100}
                        placeholder={t("companies.invite.companyNamePlaceholder")}
                        aria-invalid={fieldState.invalid}
                        disabled={isSubmitting}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t("companies.invite.companyNameLoginHint")}
                      </p>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                <Controller
                  name="company_status"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="invite-company-status">
                        {t("companies.invite.companyStatusLabel")}
                      </FieldLabel>
                      <select
                        {...field}
                        id="invite-company-status"
                        aria-invalid={fieldState.invalid}
                        disabled={isSubmitting}
                        className={nativeSelectClassName}
                      >
                        <option value="basic">{t("companies.status.basic")}</option>
                        <option value="partner">{t("companies.status.partner")}</option>
                        <option value="main">{t("companies.status.main")}</option>
                      </select>
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
                {watchCompanyStatus === "basic" && (
                  <>
                    <Controller
                      name="planned_stand_size"
                      control={form.control}
                      render={({ field }) => (
                        <Field>
                          <FieldLabel htmlFor="invite-planned-stand-size">
                            {t("companies.invite.plannedStandSizeLabel")}
                          </FieldLabel>
                          <select
                            {...field}
                            id="invite-planned-stand-size"
                            disabled={isSubmitting}
                            className={nativeSelectClassName}
                          >
                            <option value="">
                              {t("companies.invite.plannedStandSizeNone")}
                            </option>
                            <option value="podstawowy">
                              {t("companies.stand.sizes.podstawowy")}
                            </option>
                            <option value="standardowy">
                              {t("companies.stand.sizes.standardowy")}
                            </option>
                            <option value="rozszerzony">
                              {t("companies.stand.sizes.rozszerzony")}
                            </option>
                          </select>
                          <p className="text-xs text-muted-foreground">
                            {t("companies.invite.plannedStandHint")}
                          </p>
                        </Field>
                      )}
                    />
                    {watchPlannedStandSize !== "" && (
                      <Controller
                        name="planned_days_count"
                        control={form.control}
                        render={({ field }) => (
                          <Field>
                            <FieldLabel htmlFor="invite-planned-days">
                              {t("companies.invite.plannedDaysLabel")}
                            </FieldLabel>
                            <select
                              {...field}
                              id="invite-planned-days"
                              disabled={isSubmitting}
                              className={nativeSelectClassName}
                            >
                              <option value="2">
                                {t("companies.invite.twoDays")}
                              </option>
                              <option value="1">
                                {t("companies.invite.oneDay")}
                              </option>
                            </select>
                          </Field>
                        )}
                      />
                    )}
                  </>
                )}
              </>
            )}
            <Controller
              name="language"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="invite-language">
                    {t("companies.invite.languageLabel")}
                  </FieldLabel>
                  <select
                    {...field}
                    id="invite-language"
                    aria-invalid={fieldState.invalid}
                    disabled={isSubmitting}
                    className={nativeSelectClassName}
                  >
                    <option value="pl">{t("language.polish")}</option>
                    <option value="en">{t("language.english")}</option>
                  </select>
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isSubmitting}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="invite-form"
            disabled={isSubmitting}
            style={{
              backgroundColor: isSubmitting ? undefined : STAFF_ACCENT_COLOR,
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = "#C84FA8";
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
            }}
          >
            {isSubmitting
              ? t("companies.invite.submitting")
              : t("companies.invite.submitButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
