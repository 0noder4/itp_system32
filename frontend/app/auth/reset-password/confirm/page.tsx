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

const formSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password must be at most 128 characters."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type FormInput = z.infer<typeof formSchema>;

export default function ResetPasswordConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [userInfo, setUserInfo] = React.useState<{
    email: string;
    username: string;
    expires_at: string;
  } | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isFetching, setIsFetching] = React.useState(true);

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  React.useEffect(() => {
    if (!token) {
      toast.error("Missing token", {
        description: "Password reset link is invalid. Please request a new one.",
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
          "Token is invalid or expired. Please request a new password reset link.";
        toast.error("Invalid token", {
          description: errorMessage,
        });
      } finally {
        setIsFetching(false);
      }
    };

    fetchTokenInfo();
  }, [token]);

  const handleSubmit = async (data: FormInput) => {
    if (!token) {
      toast.error("Missing token", {
        description: "Password reset link is invalid. Please request a new one.",
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.post("/api/password-reset/confirm/", {
        token,
        password: data.password,
      });

      toast.success("Password reset successful!", {
        description: "You can now log in with your new password.",
      });

      router.push("/auth/login");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.password?.[0] ||
        error.response?.data?.token?.[0] ||
        error.response?.data?.detail ||
        "Failed to reset password. Please try again.";

      toast.error("Password reset failed", {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Validating token...</p>
      </div>
    );
  }

  if (!userInfo) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="w-full sm:max-w-md">
          <CardHeader>
            <CardTitle>Invalid reset link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-4">
            <Button
              onClick={() => router.push("/auth/reset-password")}
              className="w-full"
            >
              Request new reset link
            </Button>
            <div className="text-center text-sm">
              <Link
                href="/auth/login"
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                Back to login
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
        <CardTitle>Set new password</CardTitle>
        <CardDescription>
          Enter a new password for {userInfo.email}
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
                    New Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-reset-confirm-password"
                    type="password"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter a strong password"
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
                    Confirm Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-reset-confirm-confirm-password"
                    type="password"
                    aria-invalid={fieldState.invalid}
                    placeholder="Re-enter your password"
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
            {isLoading ? "Resetting password..." : "Reset password"}
          </Button>
        </Field>
        <div className="text-center text-sm">
          <Link
            href="/auth/login"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to login
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

