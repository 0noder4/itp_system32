"use client";

import * as React from "react";
import { Suspense } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

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
import { ACCENT_COLOR } from "@/lib/colors";
import Image from "next/image";

type FormInput = {
  name: string;
  surname: string;
  phone_number: string;
  password: string;
  confirmPassword: string;
};

function RegisterForm() {
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

  const [invitationInfo, setInvitationInfo] = React.useState<{
    company_name: string;
    username: string;
    email: string;
    company_status: string;
  } | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isFetching, setIsFetching] = React.useState(true);

  const formSchema = React.useMemo(
    () =>
      z
        .object({
          name: z.string().min(1, t("auth.validation.firstNameRequired")),
          surname: z.string().min(1, t("auth.validation.lastNameRequired")),
          phone_number: z.string().min(1, t("auth.validation.phoneRequired")),
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
      name: "",
      surname: "",
      phone_number: "",
      password: "",
      confirmPassword: "",
    },
  });

  React.useEffect(() => {
    if (!token) {
      toast.error(t("auth.register.missingToken"), {
        description: t("auth.register.missingTokenDescription"),
      });
      setIsFetching(false);
      return;
    }

    const fetchInvitation = async () => {
      try {
        const response = await apiClient.get("/api/register/", {
          params: { token },
        });
        setInvitationInfo(response.data);
      } catch (error: any) {
        const errorMessage =
          error.response?.data?.detail ||
          t("auth.register.invalidInvitationDescription");
        toast.error(t("auth.register.invalidInvitation"), {
          description: errorMessage,
        });
      } finally {
        setIsFetching(false);
      }
    };

    fetchInvitation();
  }, [token, t]);

  const handleSubmit = async (data: FormInput) => {
    if (!token) {
      toast.error(t("auth.register.missingToken"), {
        description: t("auth.register.missingTokenDescription"),
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.post("/api/register/", {
        token,
        password: data.password,
        first_name: data.name,
        last_name: data.surname,
        phone_number: data.phone_number,
      });

      toast.success(t("auth.register.success"), {
        description: t("auth.register.successDescription"),
      });
      router.push("/auth/login");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.password?.[0] ||
        error.response?.data?.detail ||
        t("auth.register.errorDescription");

      toast.error(t("auth.register.error"), {
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
          {t("auth.register.loadingInvitation")}
        </p>
      </div>
    );
  }

  if (!invitationInfo) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
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
              <CardTitle>{t("auth.register.invitationNotFound")}</CardTitle>
              <LanguageSelector />
            </div>
            <CardDescription>
              {t("auth.register.invitationNotFoundDescription")}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              onClick={() => router.push("/auth/login")}
              style={{
                backgroundColor: ACCENT_COLOR,
                color: "#ffffff",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#E04E15";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = ACCENT_COLOR;
              }}
            >
              {t("common.backToLogin")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <Card className="w-full sm:max-w-lg">
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
          <CardTitle>{t("auth.register.title")}</CardTitle>
          <LanguageSelector />
        </div>
        <CardDescription>
          {t("auth.register.description", {
            companyName: invitationInfo.company_name,
            email: invitationInfo.email,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id="s32-form-register" onSubmit={form.handleSubmit(handleSubmit)}>
          <FieldGroup>
            <div className="flex flex-row gap-2">
              <Field>
                <FieldLabel htmlFor="s32-form-register-username">
                  {t("auth.register.usernameLabel")}
                </FieldLabel>
                <Input
                  id="s32-form-register-username"
                  type="text"
                  value={invitationInfo?.username || ""}
                  placeholder={t("auth.register.usernamePlaceholder")}
                  disabled={true}
                  readOnly
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="s32-form-register-email">
                  {t("auth.register.emailLabel")}
                </FieldLabel>
                <Input
                  id="s32-form-register-email"
                  type="email"
                  value={invitationInfo?.email || ""}
                  placeholder={t("auth.register.emailPlaceholder")}
                  disabled={true}
                  readOnly
                />
              </Field>
            </div>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-register-name">
                    {t("auth.register.firstNameLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-register-name"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("auth.register.firstNamePlaceholder")}
                    autoComplete="given-name"
                    disabled={isLoading}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="surname"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-register-surname">
                    {t("auth.register.lastNameLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-register-surname"
                    type="text"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("auth.register.lastNamePlaceholder")}
                    autoComplete="family-name"
                    disabled={isLoading}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="phone_number"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-register-phone">
                    {t("auth.register.phoneLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-register-phone"
                    type="tel"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("auth.register.phonePlaceholder")}
                    autoComplete="tel"
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
                  <FieldLabel htmlFor="s32-form-register-password">
                    {t("auth.register.passwordLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-register-password"
                    type="password"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("auth.register.passwordPlaceholder")}
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
                  <FieldLabel htmlFor="s32-form-register-confirm-password">
                    {t("auth.register.confirmPasswordLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-register-confirm-password"
                    type="password"
                    aria-invalid={fieldState.invalid}
                    placeholder={t("auth.register.confirmPasswordPlaceholder")}
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
      <CardFooter>
        <Field className="w-full">
          <Button
            type="submit"
            form="s32-form-register"
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
              ? t("auth.register.submitting")
              : t("auth.register.submitButton")}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  );
}

export default function Index() {
  return (
    <Suspense fallback={
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
