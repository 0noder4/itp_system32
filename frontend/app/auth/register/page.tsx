"use client";

import * as React from "react";
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

export default function Index() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [invitationInfo, setInvitationInfo] = React.useState<{
    company_name: string;
    email: string;
    company_status: string;
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
        description: "Registration link is invalid. Please contact support.",
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
          "Invitation is invalid or expired. Please request a new invitation.";
        toast.error("Invalid invitation", {
          description: errorMessage,
        });
      } finally {
        setIsFetching(false);
      }
    };

    fetchInvitation();
  }, [token]);

  const handleSubmit = async (data: FormInput) => {
    if (!token) {
      toast.error("Missing token", {
        description: "Registration link is invalid. Please contact support.",
      });
      return;
    }

    setIsLoading(true);
    try {
      await apiClient.post("/api/register/", {
        token,
        password: data.password,
      });

      toast.success("Account created!", {
        description: "You can now log in with your credentials.",
      });
      router.push("/auth/login");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.password?.[0] ||
        error.response?.data?.detail ||
        "Failed to complete registration. Please try again.";

      toast.error("Registration failed", {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading invitation...</p>
      </div>
    );
  }

  if (!invitationInfo) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="w-full sm:max-w-md">
          <CardHeader>
            <CardTitle>Invitation not found</CardTitle>
            <CardDescription>
              This invitation is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => router.push("/auth/login")}>
              Back to login
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <Card className="w-full sm:max-w-md">
      <CardHeader>
        <CardTitle>Complete your registration</CardTitle>
        <CardDescription>
          Set a password for {invitationInfo.company_name} (
          {invitationInfo.email})
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form id="s32-form-register" onSubmit={form.handleSubmit(handleSubmit)}>
          <FieldGroup>
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-register-password">
                    Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-register-password"
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
                  <FieldLabel htmlFor="s32-form-register-confirm-password">
                    Confirm Password
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-register-confirm-password"
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
      <CardFooter>
        <Field className="w-full">
          <Button
            type="submit"
            form="s32-form-register"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? "Creating account..." : "Create account"}
          </Button>
        </Field>
      </CardFooter>
    </Card>
  );
}
