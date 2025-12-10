"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

type FormInput = {
  company_name: string;
  email: string;
  company_status: "main" | "partner" | "basic";
};

export default function Index() {
  const router = useRouter();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = React.useState(false);

  const formInputSchema = React.useMemo(
    () =>
      z.object({
        company_name: z
          .string()
          .min(1, t("auth.validation.companyNameRequired"))
          .max(255, t("auth.validation.companyNameRequired")),
        email: z
          .string()
          .min(1, t("auth.validation.emailRequired"))
          .email(t("auth.validation.emailRequired")),
        company_status: z.enum(["main", "partner", "basic"], {
          message: t("auth.validation.companyNameRequired"),
        }),
      }),
    [t]
  );

  const form = useForm<FormInput>({
    resolver: zodResolver(formInputSchema),
    defaultValues: {
      company_name: "",
      email: "",
      company_status: "basic",
    },
  });

  async function onSubmit(data: FormInput) {
    setIsLoading(true);
    try {
      await apiClient.post("/api/invite/", {
        company_name: data.company_name,
        email: data.email,
        company_status: data.company_status,
      });

      toast.success(t("companies.invite.success"), {
        description: t("companies.invite.successDescription", {
          email: data.email,
        }),
      });

      // Navigate back to companies list
      router.push("/panel/fr/companies");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        Object.values(error.response?.data || {}).flat()[0] ||
        t("companies.invite.errorDescription");

      toast.error(t("companies.invite.error"), {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full sm:max-w-md">
      <CardHeader>
        <CardTitle>{t("companies.invite.title")}</CardTitle>
        <CardDescription>{t("companies.invite.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="s32-form-invite-company"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <Controller
              name="company_name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-invite-company-name">
                    {t("companies.invite.companyNameLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-invite-company-name"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("companies.invite.companyNamePlaceholder")}
                    autoComplete="organization"
                    disabled={isLoading}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-invite-company-email">
                    {t("companies.invite.emailLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-invite-company-email"
                    type="email"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("companies.invite.emailPlaceholder")}
                    autoComplete="email"
                    disabled={isLoading}
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
                  <FieldLabel htmlFor="s32-form-invite-company-status">
                    {t("companies.invite.companyStatusLabel")}
                  </FieldLabel>
                  <select
                    {...field}
                    id="s32-form-invite-company-status"
                    aria-invalid={fieldState.invalid}
                    disabled={isLoading}
                    className={cn(
                      "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                      "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                      "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                    )}
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
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Field>
          <Button
            type="submit"
            form="s32-form-invite-company"
            disabled={isLoading}
          >
            {isLoading
              ? t("companies.invite.submitting")
              : t("companies.invite.submit")}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  );
}
