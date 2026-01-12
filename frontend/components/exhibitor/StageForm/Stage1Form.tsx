"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "@/lib/i18n";
import { Stage1Data } from "@/lib/types";
import { stage1Schema, Stage1FormData } from "./schemas";
import { Button } from "@/components/ui/button";
import { ACCENT_COLOR } from "@/lib/colors";
import { Input } from "@/components/ui/input";
import { FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Save, FileText, ExternalLink } from "lucide-react";

interface Stage1FormProps {
  companyId?: number;
  initialData?: Stage1Data;
  onSubmit: (data: Stage1FormData) => Promise<void>;
  isSubmitting: boolean;
  disabled?: boolean;
  isAccepted?: boolean;
}

export function Stage1Form({
  initialData,
  onSubmit,
  isSubmitting,
  disabled = false,
  isAccepted = false,
}: Stage1FormProps) {
  const { t } = useTranslation();
  const form = useForm<Stage1FormData>({
    resolver: zodResolver(stage1Schema),
    defaultValues: {
      basic_data: {
        full_name: initialData?.basic_data?.full_name || "",
        nip: initialData?.basic_data?.nip || "",
      },
      address: {
        street: initialData?.address?.street || "",
        home_number: initialData?.address?.home_number || "",
        apt_number: initialData?.address?.apt_number || "",
        city: initialData?.address?.city || "",
        country: initialData?.address?.country || "Polska",
        postal_code: initialData?.address?.postal_code || "",
      },
      terms_accepted: initialData?.terms_accepted || false,
    },
  });

  const [showTermsDialog, setShowTermsDialog] = React.useState(false);
  const [pendingFormData, setPendingFormData] =
    React.useState<Stage1FormData | null>(null);

  const handleFormSubmit = async (data: Stage1FormData) => {
    // Always show terms dialog if terms_accepted is not explicitly true
    // This ensures the dialog shows on first save, even if the field is false/undefined
    if (data.terms_accepted === true) {
      // Terms already accepted, submit directly
      try {
        await onSubmit(data);
      } catch (error: any) {
        // Handle backend validation errors and set them on form fields
        if (error.response?.status === 400 && error.response?.data) {
          const errorData = error.response.data;
          let hasFieldErrors = false;
          
          // Handle basic_data errors
          if (errorData.basic_data && typeof errorData.basic_data === 'object') {
            Object.keys(errorData.basic_data).forEach((field) => {
              const fieldErrors = errorData.basic_data[field];
              const errorMessage = Array.isArray(fieldErrors) 
                ? fieldErrors[0] 
                : typeof fieldErrors === 'string' 
                ? fieldErrors 
                : String(fieldErrors);
              
              form.setError(`basic_data.${field}` as any, {
                type: 'server',
                message: errorMessage,
              });
              hasFieldErrors = true;
            });
          }
          
          // Handle address errors
          if (errorData.address && typeof errorData.address === 'object') {
            Object.keys(errorData.address).forEach((field) => {
              const fieldErrors = errorData.address[field];
              const errorMessage = Array.isArray(fieldErrors) 
                ? fieldErrors[0] 
                : typeof fieldErrors === 'string' 
                ? fieldErrors 
                : String(fieldErrors);
              
              form.setError(`address.${field}` as any, {
                type: 'server',
                message: errorMessage,
              });
              hasFieldErrors = true;
            });
          }
          
          // Handle general errors
          if (errorData.detail && typeof errorData.detail === 'string') {
            form.setError('root', {
              type: 'server',
              message: errorData.detail,
            });
            hasFieldErrors = true;
          }
          
          if (hasFieldErrors) {
            return;
          }
        }
        throw error;
      }
      return;
    }
    // Show terms dialog before submitting
    // Store the form data temporarily
    setPendingFormData(data);
    // Show the dialog
    setShowTermsDialog(true);
  };

  const handleAcceptTerms = async () => {
    if (pendingFormData) {
      const dataWithTerms = { ...pendingFormData, terms_accepted: true };
      try {
        await onSubmit(dataWithTerms);
        setShowTermsDialog(false);
        setPendingFormData(null);
      } catch (error: any) {
        // Handle backend validation errors and set them on form fields
        if (error.response?.status === 400 && error.response?.data) {
          const errorData = error.response.data;
          let hasFieldErrors = false;
          
          // Handle basic_data errors
          if (errorData.basic_data && typeof errorData.basic_data === 'object') {
            Object.keys(errorData.basic_data).forEach((field) => {
              const fieldErrors = errorData.basic_data[field];
              const errorMessage = Array.isArray(fieldErrors) 
                ? fieldErrors[0] 
                : typeof fieldErrors === 'string' 
                ? fieldErrors 
                : String(fieldErrors);
              
              form.setError(`basic_data.${field}` as any, {
                type: 'server',
                message: errorMessage,
              });
              hasFieldErrors = true;
            });
          }
          
          // Handle address errors
          if (errorData.address && typeof errorData.address === 'object') {
            Object.keys(errorData.address).forEach((field) => {
              const fieldErrors = errorData.address[field];
              const errorMessage = Array.isArray(fieldErrors) 
                ? fieldErrors[0] 
                : typeof fieldErrors === 'string' 
                ? fieldErrors 
                : String(fieldErrors);
              
              form.setError(`address.${field}` as any, {
                type: 'server',
                message: errorMessage,
              });
              hasFieldErrors = true;
            });
          }
          
          // Handle general errors
          if (errorData.detail && typeof errorData.detail === 'string') {
            form.setError('root', {
              type: 'server',
              message: errorData.detail,
            });
            hasFieldErrors = true;
          }
          
          if (hasFieldErrors) {
            setShowTermsDialog(false);
            setPendingFormData(null);
            return;
          }
        }
        throw error;
      }
    }
  };

  const handleRejectTerms = () => {
    setShowTermsDialog(false);
    setPendingFormData(null);
  };

  return (
    <>
      <form
        onSubmit={form.handleSubmit(handleFormSubmit)}
        className="space-y-6"
      >
        {/* Basic Data Section */}
        <div className="space-y-3">
          <h3 className="font-medium">{t("exhibitor.form.basicData")}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.fullName")}</FieldLabel>
              <Input
                {...form.register("basic_data.full_name")}
                disabled={disabled}
              />
              {form.formState.errors.basic_data?.full_name && (
                <FieldError>
                  {form.formState.errors.basic_data.full_name.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.nip")}</FieldLabel>
              <Input {...form.register("basic_data.nip")} disabled={disabled} />
              {form.formState.errors.basic_data?.nip && (
                <FieldError>
                  {form.formState.errors.basic_data.nip.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
          </div>
        </div>
        {/* Address Section */}
        <div className="space-y-3">
          <h3 className="font-medium">{t("exhibitor.form.address")}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.street")}</FieldLabel>
              <Input {...form.register("address.street")} disabled={disabled} />
              {form.formState.errors.address?.street && (
                <FieldError>
                  {form.formState.errors.address.street.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.homeNumber")}</FieldLabel>
              <Input
                {...form.register("address.home_number")}
                disabled={disabled}
              />
              {form.formState.errors.address?.home_number && (
                <FieldError>
                  {form.formState.errors.address.home_number.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.aptNumber")}</FieldLabel>
              <Input
                {...form.register("address.apt_number")}
                disabled={disabled}
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.city")}</FieldLabel>
              <Input {...form.register("address.city")} disabled={disabled} />
              {form.formState.errors.address?.city && (
                <FieldError>
                  {form.formState.errors.address.city.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.country")}</FieldLabel>
              <Input
                {...form.register("address.country")}
                disabled={disabled}
              />
              {form.formState.errors.address?.country && (
                <FieldError>
                  {form.formState.errors.address.country.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>{t("exhibitor.form.postalCode")}</FieldLabel>
              <Input
                {...form.register("address.postal_code")}
                disabled={disabled}
              />
              {form.formState.errors.address?.postal_code && (
                <FieldError>
                  {form.formState.errors.address.postal_code.message ||
                    t("exhibitor.form.required")}
                </FieldError>
              )}
            </FieldGroup>
          </div>
        </div>
        <Button
          type="submit"
          disabled={isSubmitting || disabled}
          className="w-full md:w-auto text-white"
          style={{
            backgroundColor: isSubmitting || disabled ? undefined : ACCENT_COLOR,
          }}
          onMouseEnter={(e) => {
            if (!isSubmitting && !disabled) {
              e.currentTarget.style.backgroundColor = "#E04E15";
            }
          }}
          onMouseLeave={(e) => {
            if (!isSubmitting && !disabled) {
              e.currentTarget.style.backgroundColor = ACCENT_COLOR;
            }
          }}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("common.loading")}
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {isAccepted ? t("common.sendAgain") : t("common.save")}
            </>
          )}
        </Button>
      </form>

      {/* Terms and Conditions Dialog */}
      <Dialog
        open={showTermsDialog}
        onOpenChange={(open) => {
          if (!open) {
            handleRejectTerms();
          } else {
            setShowTermsDialog(true);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("exhibitor.form.termsDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("exhibitor.form.termsDialogText")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="pt-2">
              <a
                href="/docs/regulamin.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
              >
                <FileText className="h-4 w-4" />
                <span>{t("exhibitor.form.viewTerms")}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("exhibitor.form.termsDialogLegalNotice")}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleRejectTerms}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleAcceptTerms}
              className="text-white"
              style={{ backgroundColor: ACCENT_COLOR }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#E04E15";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = ACCENT_COLOR;
              }}
            >
              {t("exhibitor.form.acceptAndSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

