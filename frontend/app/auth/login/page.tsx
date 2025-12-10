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

      // Store tokens
      storeTokens(response.data);

      // Get user type from response or decode from token
      const userType: UserType | null = response.data.user_type || null;
      const route = getUserRoute(userType);

      toast.success(t("auth.login.success"), {
        description: t("auth.login.successDescription"),
      });

      // Redirect to appropriate panel based on user type
      router.push(route);
    } catch (error: any) {
      // Prevent any default form submission behavior
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        Object.values(error.response?.data || {}).flat()[0] ||
        t("auth.login.errorDescription");

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
                    {t("auth.login.username")}
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
                      {t("auth.login.password")}
                    </FieldLabel>
                    <Link
                      href="/auth/reset-password"
                      className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
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
          <Button type="submit" form="s32-form-login" disabled={isLoading}>
            {isLoading ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  );
}
