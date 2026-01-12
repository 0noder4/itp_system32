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
import { storeTokens, getUserRoute, type UserType } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { LanguageSelector } from "@/components/layout/LanguageSelector/LanguageSelector";
import { ACCENT_COLOR } from "@/lib/colors";
import Image from "next/image";

export default function Index() {
  const router = useRouter();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = React.useState(false);

  const formSchema = React.useMemo(
    () =>
      z.object({
        username: z.string().min(1, t("auth.validation.usernameRequired")),
        password: z.string().min(1, t("auth.validation.passwordRequired")),
      }),
    [t]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true);
    try {
      const response = await apiClient.post("/api/token/", {
        username: data.username,
        password: data.password,
      });

      // Store tokens and notify RouteGuard of the change (for user switching)
      storeTokens(response.data, true);

      // Get user type from response or decode from token
      const userType: UserType | null = response.data.user_type || null;
      const route = getUserRoute(userType);

      toast.success(t("auth.login.success"), {
        description: t("auth.login.successDescription"),
      });

      // Redirect to appropriate panel based on user type
      // RouteGuard will handle the authorization check
      router.replace(route);
    } catch (error: any) {
      // Handle authentication errors
      let errorMessage = t("auth.login.errorDescription");
      
      if (error.response?.data) {
        const errorData = error.response.data;
        
        // Check for detail field first (most common in DRF)
        if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.non_field_errors) {
          // Handle non_field_errors array
          const nonFieldErrors = errorData.non_field_errors;
          if (Array.isArray(nonFieldErrors)) {
            errorMessage = nonFieldErrors[0];
          } else if (typeof nonFieldErrors === "string") {
            errorMessage = nonFieldErrors;
          }
        } else {
          // Try to extract the first error from any field
          const errorKeys = Object.keys(errorData);
          if (errorKeys.length > 0) {
            const firstError = errorData[errorKeys[0]];
            if (Array.isArray(firstError)) {
              errorMessage = firstError[0];
            } else if (typeof firstError === "string") {
              errorMessage = firstError;
            } else if (typeof firstError === "object") {
              errorMessage = Object.values(firstError)[0] as string;
            }
          }
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(t("auth.login.error"), {
        description: errorMessage,
      });
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
          <CardTitle>{t("auth.login.title")}</CardTitle>
          <LanguageSelector />
        </div>
        <CardDescription>{t("auth.login.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="s32-form-login"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit(onSubmit)(e);
          }}
        >
          <FieldGroup>
            <Controller
              name="username"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-login-username">
                    {t("auth.login.usernameLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-login-username"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("auth.login.usernamePlaceholder")}
                    autoComplete="username"
                    disabled={isLoading}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center">
                    <FieldLabel htmlFor="s32-form-login-password">
                      {t("auth.login.passwordLabel")}
                    </FieldLabel>
                    <Link
                      href="/auth/reset-password"
                      className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                      style={{ color: ACCENT_COLOR }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#E04E15";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = ACCENT_COLOR;
                      }}
                    >
                      {t("auth.login.forgotPassword")}
                    </Link>
                  </div>
                  <Input
                    {...field}
                    id="s32-form-login-password"
                    type="password"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("auth.login.passwordPlaceholder")}
                    autoComplete="current-password"
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
      <CardFooter>
        <Field>
          <Button
            type="submit"
            form="s32-form-login"
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
            {isLoading ? t("auth.login.submitting") : t("auth.login.submitButton")}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  );
}
