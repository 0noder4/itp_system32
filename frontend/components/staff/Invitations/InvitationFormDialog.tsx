"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { UserPlus } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
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

export function InvitationFormDialog({ onSuccess }: InvitationFormDialogProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const invitationFormSchema = React.useMemo(
    () =>
      z.object({
        email: z.string().email(t("auth.validation.emailRequired")),
        company_name: z
          .string()
          .min(1, t("auth.validation.companyNameRequired")),
        company_status: z.enum(["main", "partner", "basic"]),
        language: z.enum(["en", "pl"]),
      }),
    [t]
  );

  const form = useForm<z.infer<typeof invitationFormSchema>>({
    resolver: zodResolver(invitationFormSchema),
    defaultValues: {
      email: "",
      company_name: "",
      company_status: "basic",
      language: "pl",
    },
  });

  const onSubmit = async (data: z.infer<typeof invitationFormSchema>) => {
    setIsSubmitting(true);
    try {
      await apiClient.post("/api/invite/", data);
      toast.success(t("companies.invite.success"), {
        description: t("companies.invite.successDescription", {
          email: data.email,
        }),
      });
      setIsOpen(false);
      form.reset();
      onSuccess();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        Object.values(error.response?.data || {}).flat()[0] ||
        t("companies.invite.errorDescription");
      toast.error(t("companies.invite.error"), {
        description: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          style={{ backgroundColor: STAFF_ACCENT_COLOR }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#C84FA8";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
          }}
        >
          <UserPlus className="mr-2 h-4 w-4" />
          {t("companies.invite.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("companies.invite.title")}</DialogTitle>
          <DialogDescription>
            {t("companies.invite.description")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} id="invite-company-form">
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
                    id="invite-email"
                    type="email"
                    placeholder={t("companies.invite.emailPlaceholder")}
                    aria-invalid={fieldState.invalid}
                    disabled={isSubmitting}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
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
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
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
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  >
                    <option value="basic">{t("companies.status.basic")}</option>
                    <option value="partner">
                      {t("companies.status.partner")}
                    </option>
                    <option value="main">{t("companies.status.main")}</option>
                  </select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="language"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="invite-company-language">
                    {t("companies.invite.languageLabel")}
                  </FieldLabel>
                  <select
                    {...field}
                    id="invite-company-language"
                    aria-invalid={fieldState.invalid}
                    disabled={isSubmitting}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  >
                    <option value="en">{t("language.english")}</option>
                    <option value="pl">{t("language.polish")}</option>
                  </select>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
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
            form="invite-company-form"
            disabled={isSubmitting}
            style={{
              backgroundColor: isSubmitting ? undefined : STAFF_ACCENT_COLOR,
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = "#C84FA8";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
              }
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
