"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { UserPlus } from "lucide-react";
import { apiClient } from "@/lib/api";
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

type InviteTarget = "company" | "opiekun";

const nativeSelectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base text-foreground shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

type InviteFormValues = {
  email: string;
  company_name: string;
  company_status: "main" | "partner" | "basic";
  language: "en" | "pl";
};

export function InvitationFormDialog({ onSuccess }: InvitationFormDialogProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [target, setTarget] = React.useState<InviteTarget>("company");
  const emailInputRef = React.useRef<HTMLInputElement | null>(null);

  const targetRef = React.useRef(target);
  targetRef.current = target;

  const form = useForm<InviteFormValues>({
    defaultValues: {
      email: "",
      company_name: "",
      company_status: "basic",
      language: "pl",
    },
    resolver: async (values, context, options) => {
      const schema =
        targetRef.current === "company"
          ? z.object({
              email: z.string().email(t("auth.validation.emailRequired")),
              company_name: z.string().min(1, t("auth.validation.companyNameRequired")),
              company_status: z.enum(["main", "partner", "basic"]),
              language: z.enum(["en", "pl"]),
            })
          : z.object({
              email: z.string().email(t("auth.validation.emailRequired")),
              company_name: z.string(),
              company_status: z.enum(["main", "partner", "basic"]),
              language: z.enum(["en", "pl"]),
            });
      return zodResolver(schema)(values, context, options);
    },
  });

  const resetAll = () => {
    form.reset({
      email: "",
      company_name: "",
      company_status: "basic",
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
        await apiClient.post("/api/invite/", {
          email: data.email,
          company_name: data.company_name,
          company_status: data.company_status,
          language: data.language,
        });
        toast.success(t("companies.invite.success"), {
          description: t("companies.invite.successDescription", { email: data.email }),
        });
      } else {
        await apiClient.post("/api/staff-invite/", {
          email: data.email,
          language: data.language,
        });
        toast.success(t("companies.invite.opiekunSuccess"), {
          description: t("companies.invite.successDescription", { email: data.email }),
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
          <UserPlus className="mr-1 sm:mr-2 h-4 w-4 shrink-0" />
          {t("companies.invite.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {target === "company"
              ? t("companies.invite.title")
              : t("companies.invite.opiekunTitle")}
          </DialogTitle>
          <DialogDescription>
            {target === "company"
              ? t("companies.invite.description")
              : t("companies.invite.opiekunDescription")}
          </DialogDescription>
        </DialogHeader>

        <div
          className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1"
          role="tablist"
          aria-label={t("companies.invite.button")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={target === "company"}
            disabled={isSubmitting}
            onClick={() => switchTarget("company")}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
              target === "company"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("companies.invite.targetCompany")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={target === "opiekun"}
            disabled={isSubmitting}
            onClick={() => switchTarget("opiekun")}
            className={cn(
              "rounded-sm px-3 py-1.5 text-sm font-medium transition-all",
              target === "opiekun"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("companies.invite.targetOpiekun")}
          </button>
        </div>

        <form onSubmit={form.handleSubmit(onSubmit)} id="invite-form">
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="invite-email">
                    {t("companies.invite.emailLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    ref={(el) => {
                      field.ref(el);
                      emailInputRef.current = el;
                    }}
                    id="invite-email"
                    type="email"
                    autoComplete="email"
                    placeholder={
                      target === "company"
                        ? t("companies.invite.emailPlaceholder")
                        : t("companies.invite.opiekunEmailPlaceholder")
                    }
                    aria-invalid={fieldState.invalid}
                    disabled={isSubmitting}
                  />
                  {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                </Field>
              )}
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
                        placeholder={t("companies.invite.companyNamePlaceholder")}
                        aria-invalid={fieldState.invalid}
                        disabled={isSubmitting}
                      />
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
