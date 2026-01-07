"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as z from "zod";

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
import { useTranslation } from "@/lib/i18n";
import { LanguageSelector } from "@/components/layout/LanguageSelector/LanguageSelector";
import { ACCENT_COLOR } from "@/lib/colors";
import Image from "next/image";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = React.useState(false);

  const formSchema = React.useMemo(
    () =>
      z.object({
        email: z.string().email(t("auth.validation.emailRequired")),
      }),
    [t]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      await apiClient.post("/api/password-reset/", {
        email: data.email,
      });

      toast.success(t("auth.resetPassword.success"), {
        description: t("auth.resetPassword.successDescription"),
      });

      // Optionally redirect to login after a delay
      setTimeout(() => {
        router.push("/auth/login");
      }, 2000);
    } catch (error: any) {
      // Always show success message for security (don't reveal if email exists)
      // The backend already returns a generic message, so we show success
      toast.success(t("auth.resetPassword.success"), {
        description: t("auth.resetPassword.successDescription"),
      });

      // Still redirect to login
      setTimeout(() => {
        router.push("/auth/login");
      }, 2000);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full sm:max-w-md">
      <CardHeader>
        <div className="flex flex-col items-center gap-4 mb-2">
          <Image
            src="/images/ITP_LOGO_horizontal_black.png"
            alt="ITP Logo"
            width={200}
            height={60}
            className="h-auto w-auto max-h-12 object-contain"
            priority
          />
        </div>
        <div className="flex items-center justify-between">
          <CardTitle>{t("auth.resetPassword.title")}</CardTitle>
          <LanguageSelector />
        </div>
        <CardDescription>{t("auth.resetPassword.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="s32-form-reset-password"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit(onSubmit)(e);
          }}
        >
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-reset-password-email">
                    {t("auth.resetPassword.emailLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-reset-password-email"
                    type="email"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("auth.resetPassword.emailPlaceholder")}
                    autoComplete="email"
                    disabled={isLoading}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col gap-4">
        <Field className="w-full">
          <Button
            type="submit"
            form="s32-form-reset-password"
            className="w-full"
            disabled={isLoading}
            style={{
              backgroundColor: isLoading ? undefined : ACCENT_COLOR,
              color: "#ffffff",
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = "#E04E15";
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = ACCENT_COLOR;
              }
            }}
          >
            {isLoading
              ? t("auth.resetPassword.submitting")
              : t("auth.resetPassword.submitButton")}
          </Button>
        </Field>
        <div className="text-center text-sm">
          <Link
            href="/auth/login"
            className="underline-offset-4 hover:underline"
            style={{ color: ACCENT_COLOR }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#E04E15";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = ACCENT_COLOR;
            }}
          >
            {t("common.backToLogin")}
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
