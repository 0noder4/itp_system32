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

const formInputSchema = z.object({
  name: z
    .string()
    .min(1, "Company name is required.")
    .max(100, "Company name must be at most 100 characters."),
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Please enter a valid email address."),
  status: z.enum(["main", "partner", "basic"], {
    message: "Please select a status.",
  }),
});

type FormInput = z.infer<typeof formInputSchema>;

export default function Index() {
  const router = useRouter();
  const form = useForm<FormInput>({
    resolver: zodResolver(formInputSchema),
    defaultValues: {
      name: "",
      email: "",
      status: "basic",
    },
  });

  async function onSubmit(data: FormInput) {
    try {
      const response = await apiClient.post("/api/companies/", {
        name: data.name,
        email: data.email,
        status: data.status,
      });

      toast.success("Company created successfully!", {
        description: `Company "${data.name}" has been created.`,
      });

      // Navigate back to companies list
      router.push("/panel/fr/companies");
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        Object.values(error.response?.data || {}).flat()[0] ||
        "Failed to create company. Please try again.";

      toast.error("Failed to create company", {
        description: errorMessage,
      });
    }
  }

  return (
    <Card className="w-full sm:max-w-md">
      <CardHeader>
        <CardTitle>Create New Company</CardTitle>
        <CardDescription>
          Enter the company details below to create a new company
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="s32-form-create-company"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-create-company-name">
                    Company Name
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-create-company-name"
                    aria-invalid={fieldState.invalid}
                    placeholder="Enter company name"
                    autoComplete="off"
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
                  <FieldLabel htmlFor="s32-form-create-company-email">
                    Email
                  </FieldLabel>
                  <Input
                    {...field}
                    id="s32-form-create-company-email"
                    type="email"
                    aria-invalid={fieldState.invalid}
                    placeholder="company@example.com"
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="status"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="s32-form-create-company-status">
                    Status
                  </FieldLabel>
                  <select
                    {...field}
                    id="s32-form-create-company-status"
                    aria-invalid={fieldState.invalid}
                    className={cn(
                      "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
                      "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                      "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                    )}
                  >
                    <option value="basic">Basic</option>
                    <option value="partner">Partner</option>
                    <option value="main">Main</option>
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
          <Button type="submit" form="s32-form-create-company">
            Create Company
          </Button>
        </Field>
      </CardFooter>
    </Card>
  );
}
