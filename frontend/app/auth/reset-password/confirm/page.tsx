"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
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
import { useTranslation, useLanguage } from "@/lib/i18n";
import { LanguageSelector } from "@/components/layout/LanguageSelector/LanguageSelector";

type FormInput = {
  password: string;
  confirmPassword: string;
};

export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const langParam = searchParams.get("lang");
  const { t } = useTranslation();
  const { setLocale } = useLanguage();

  // Set language from URL parameter if provided
  React.useEffect(() => {
    if (langParam === "en" || langParam === "pl") {
      setLocale(langParam);
    }
  }, [langParam, setLocale]);

  const [userInfo, setUserInfo] = React.useState<{
    email: string;
    username: string;
    expires_at: string;
  } | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isFetching, setIsFetching] = React.useState(true);

  const formSchema = React.useMemo(
    () =>
      z
        .object({
          password: z
            .string()
            .min(8, t("auth.validation.passwordMin"))
            .max(128, t("auth.validation.passwordMax")),
          confirmPassword: z
            .string()
            .min(1, t("auth.validation.confirmPasswordRequired")),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: t("auth.validation.passwordsDoNotMatch"),
          path: ["confirmPassword"],
        }),
    [t]
  );

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  React.useEffect(() => {
    if (!token) {
      toast.error(t("auth.resetPasswordConfirm.missingToken"), {
        description: t("auth.resetPasswordConfirm.missingTokenDescription"),
      });
      setIsFetching(false);
      return;
    }

    const fetchTokenInfo = async () => {
      try {
        const response = await apiClient.get("/api/password-reset/confirm/", {
          params: { token },
        });
        setUserInfo(response.data);
      } catch (error: any) {
        const errorMessage =
          error.response?.data?.detail ||
          error.response?.data?.token?.[0] ||
          t("auth.resetPasswordConfirm.invalidTokenDescription");
        toast.error(t("auth.resetPasswordConfirm.invalidToken"), {
          description: errorMessage,
        });
      } finally {
        setIsFetching(false);
      }
    };

    fetchTokenInfo();
  }, [token, t]);

  const handleSubmit = async (data: FormInput) => {
    if (!token) {
      toast.error(t("auth.resetPasswordConfirm.missingToken"), {
        description: t("auth.resetPasswordConfirm.missingTokenDescription"),
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.post("/api/password-reset/confirm/", {
        token,
        password: data.password,
      });

      toast.success(t("auth.resetPasswordConfirm.success"), {
        description: t("auth.resetPasswordConfirm.successDescription"),
      });

      router.push("/auth/login");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.password?.[0] ||
        error.response?.data?.token?.[0] ||
        error.response?.data?.detail ||
        t("auth.resetPasswordConfirm.errorDescription");

      toast.error(t("auth.resetPasswordConfirm.error"), {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {t("auth.resetPasswordConfirm.validating")}
        </p>
      </div>
    );
  }

  if (!userInfo) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="w-full sm:max-w-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {t("auth.resetPasswordConfirm.invalidLink")}
              </CardTitle>
              <LanguageSelector />
            </div>
            <CardDescription>
              {t("auth.resetPasswordConfirm.invalidLinkDescription")}
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-4">
            <Button
              onClick={() => router.push("/auth/reset-password")}
              className="w-full"
            >
              {t("auth.resetPasswordConfirm.requestNew")}
            </Button>
            <div className="text-center text-sm">
              <Link
                href="/auth/login"
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                {t("common.backToLogin")}
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <Card className="w-full sm:max-w-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t("auth.resetPasswordConfirm.title")}</CardTitle>
          <LanguageSelector />
        </div>
        <CardDescription>
          {t("auth.resetPasswordConfirm.description", {
            email: userInfo.email,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="s32-form-reset-confirm"
          onSubmit={form.handleSubmit(handleSubmit)}
        >
          <FieldGroup>
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-reset-confirm-password">
                    {t("auth.resetPasswordConfirm.newPasswordLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-reset-confirm-password"
                    type="password"
                    aria-invalid={fieldState.invalid}
                    placeholder={t(
                      "auth.resetPasswordConfirm.newPasswordPlaceholder"
                    )}
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="confirmPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-reset-confirm-confirm-password">
                    {t("auth.resetPasswordConfirm.confirmPasswordLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-reset-confirm-confirm-password"
                    type="password"
                    aria-invalid={fieldState.invalid}
                    placeholder={t(
                      "auth.resetPasswordConfirm.confirmPasswordPlaceholder"
                    )}
                    autoComplete="new-password"
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
            form="s32-form-reset-confirm"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading
              ? t("auth.resetPasswordConfirm.submitting")
              : t("auth.resetPasswordConfirm.submitButton")}
          </Button>
        </Field>
        <div className="text-center text-sm">
          <Link
            href="/auth/login"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("common.backToLogin")}
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
