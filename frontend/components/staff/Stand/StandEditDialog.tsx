"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Edit } from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";

interface StandEditDialogProps {
  companyId: number;
  day1Stand: { stand_number: string; stand_size: string } | null;
  day2Stand: { stand_number: string; stand_size: string } | null;
  onSuccess?: () => void;
}

export function StandEditDialog({
  companyId,
  day1Stand,
  day2Stand,
  onSuccess,
}: StandEditDialogProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [formData, setFormData] = React.useState<{
    day1: { stand_number: string; stand_size: string };
    day2: { stand_number: string; stand_size: string };
  }>({
    day1: { stand_number: "", stand_size: "podstawowy" },
    day2: { stand_number: "", stand_size: "podstawowy" },
  });

  // Initialize form data when dialog opens or props change
  React.useEffect(() => {
    if (isOpen) {
      setFormData({
        day1: day1Stand || {
          stand_number: "",
          stand_size: "podstawowy",
        },
        day2: day2Stand || {
          stand_number: "",
          stand_size: "podstawowy",
        },
      });
    }
  }, [isOpen, day1Stand, day2Stand]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: {
        day1_stand?: { stand_number: string; stand_size: string } | null;
        day2_stand?: { stand_number: string; stand_size: string } | null;
      } = {};

      // Only include stands that have both number and size, or null to delete
      if (
        formData.day1.stand_number.trim() &&
        formData.day1.stand_size
      ) {
        payload.day1_stand = {
          stand_number: formData.day1.stand_number.trim(),
          stand_size: formData.day1.stand_size,
        };
      } else {
        payload.day1_stand = null;
      }

      if (
        formData.day2.stand_number.trim() &&
        formData.day2.stand_size
      ) {
        payload.day2_stand = {
          stand_number: formData.day2.stand_number.trim(),
          stand_size: formData.day2.stand_size,
        };
      } else {
        payload.day2_stand = null;
      }

      await apiClient.patch(`/api/company/${companyId}/`, payload);
      toast.success(t("common.success"));
      setIsOpen(false);
      onSuccess?.();
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        t("common.error");
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("companies.stand.edit")}</DialogTitle>
          <DialogDescription>
            {t("companies.stand.standNumber")} (
            {t("companies.stand.standSize")})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t("companies.stand.day1")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="day1-number" className="text-xs">
                  {t("companies.stand.standNumber")}
                </Label>
                <Input
                  id="day1-number"
                  value={formData.day1.stand_number}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      day1: {
                        ...formData.day1,
                        stand_number: e.target.value,
                      },
                    })
                  }
                  placeholder="2B"
                  maxLength={10}
                />
              </div>
              <div>
                <Label htmlFor="day1-size" className="text-xs">
                  {t("companies.stand.standSize")}
                </Label>
                <select
                  id="day1-size"
                  value={formData.day1.stand_size}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      day1: {
                        ...formData.day1,
                        stand_size: e.target.value,
                      },
                    })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="podstawowy">
                    {t("companies.stand.sizes.podstawowy")}
                  </option>
                  <option value="standardowy">
                    {t("companies.stand.sizes.standardowy")}
                  </option>
                  <option value="rozszerzony">
                    {t("companies.stand.sizes.rozszerzony")}
                  </option>
                  <option value="12m2">
                    {t("companies.stand.sizes.12m2")}
                  </option>
                </select>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("companies.stand.day2")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="day2-number" className="text-xs">
                  {t("companies.stand.standNumber")}
                </Label>
                <Input
                  id="day2-number"
                  value={formData.day2.stand_number}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      day2: {
                        ...formData.day2,
                        stand_number: e.target.value,
                      },
                    })
                  }
                  placeholder="4ab"
                  maxLength={10}
                />
              </div>
              <div>
                <Label htmlFor="day2-size" className="text-xs">
                  {t("companies.stand.standSize")}
                </Label>
                <select
                  id="day2-size"
                  value={formData.day2.stand_size}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      day2: {
                        ...formData.day2,
                        stand_size: e.target.value,
                      },
                    })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="podstawowy">
                    {t("companies.stand.sizes.podstawowy")}
                  </option>
                  <option value="standardowy">
                    {t("companies.stand.sizes.standardowy")}
                  </option>
                  <option value="rozszerzony">
                    {t("companies.stand.sizes.rozszerzony")}
                  </option>
                  <option value="12m2">
                    {t("companies.stand.sizes.12m2")}
                  </option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            {t("companies.stand.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            style={{
              backgroundColor: isSaving ? undefined : STAFF_ACCENT_COLOR,
            }}
            onMouseEnter={(e) => {
              if (!isSaving) {
                e.currentTarget.style.backgroundColor = "#C84FA8";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSaving) {
                e.currentTarget.style.backgroundColor = STAFF_ACCENT_COLOR;
              }
            }}
          >
            {isSaving ? t("common.loading") : t("companies.stand.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

