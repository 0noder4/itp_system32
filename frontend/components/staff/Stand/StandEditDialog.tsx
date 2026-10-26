"use client";

import React, { useMemo } from "react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit } from "lucide-react";
import { apiClient, fetcher } from "@/lib/api";
import { toast } from "sonner";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import useSWR from "swr";
import { Company } from "@/lib/types";
import { MapCanvas } from "@/components/map/MapCanvas";
import {
  MapLayoutResponse,
  areaToStandSize,
  segmentsForDay,
} from "@/lib/mapLayout";
import { Skeleton } from "@/components/ui/skeleton";

interface StandEditDialogProps {
  companyId: number;
  companyName?: string;
  day1Stand: { stand_number: string; stand_size: string } | null;
  day2Stand: { stand_number: string; stand_size: string } | null;
  onSuccess?: () => void;
}

function formatSizeLabel(size: string, t: (k: string) => string): string {
  const key = `companies.stand.sizes.${size}`;
  const translated = t(key);
  return translated === key ? size : translated;
}

export function StandEditDialog({
  companyId,
  companyName,
  day1Stand,
  day2Stand,
  onSuccess,
}: StandEditDialogProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [activeDay, setActiveDay] = React.useState<"day1" | "day2">("day1");
  const [syncDays, setSyncDays] = React.useState(true);
  const [formData, setFormData] = React.useState<{
    day1: { stand_number: string; stand_size: string };
    day2: { stand_number: string; stand_size: string };
  }>({
    day1: { stand_number: "", stand_size: "podstawowy" },
    day2: { stand_number: "", stand_size: "podstawowy" },
  });

  const { data: layout, isLoading: loadingLayout } = useSWR<MapLayoutResponse>(
    isOpen ? "/api/map-layout/" : null,
    fetcher
  );
  const { data: companies } = useSWR<Company[]>(
    isOpen ? "/api/companies/" : null,
    fetcher
  );

  React.useEffect(() => {
    if (isOpen) {
      setFormData({
        day1: day1Stand || { stand_number: "", stand_size: "podstawowy" },
        day2: day2Stand || { stand_number: "", stand_size: "podstawowy" },
      });
      setActiveDay("day1");
      setSyncDays(true);
    }
  }, [isOpen, day1Stand, day2Stand]);

  const dayLayout = activeDay === "day1" ? layout?.day1 : layout?.day2;
  const segments = segmentsForDay(dayLayout);

  const segmentByLabel = useMemo(() => {
    const m = new Map<string, (typeof segments)[0]>();
    segments.forEach((s) => m.set(s.label, s));
    return m;
  }, [segments]);

  const otherStands = useMemo(() => {
    if (!companies) return [];
    return companies
      .filter((c) => c.id !== companyId)
      .map((c) => {
        const stand =
          activeDay === "day1" ? c.day1_stand : c.day2_stand;
        if (!stand?.stand_number) return null;
        const frName = [c.fr_resp_name, c.fr_resp_surname]
          .filter(Boolean)
          .join(" ")
          .trim();
        return {
          companyId: c.id,
          companyName: c.name,
          standNumber: stand.stand_number,
          frRespName: frName || null,
        };
      })
      .filter(Boolean) as {
      companyId: number;
      companyName: string;
      standNumber: string;
      frRespName: string | null;
    }[];
  }, [companies, companyId, activeDay]);

  const currentPick =
    activeDay === "day1"
      ? formData.day1.stand_number
      : formData.day2.stand_number;

  const pickBooth = (label: string) => {
    const taken = otherStands.find((s) => s.standNumber === label);
    if (taken) {
      toast.error(
        `Stoisko ${label} jest już zajęte przez „${taken.companyName}”.`
      );
      return;
    }
    const seg = segmentByLabel.get(label);
    const size = areaToStandSize(Number(seg?.area_m2 ?? 4));
    const next = { stand_number: label, stand_size: size };
    setFormData((prev) => {
      if (syncDays) {
        return { day1: next, day2: { ...next } };
      }
      return { ...prev, [activeDay]: next };
    });
  };

  const clearDay = () => {
    const empty = { stand_number: "", stand_size: "podstawowy" };
    setFormData((prev) => {
      if (syncDays) return { day1: empty, day2: empty };
      return { ...prev, [activeDay]: empty };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: {
        day1_stand?: { stand_number: string; stand_size: string } | null;
        day2_stand?: { stand_number: string; stand_size: string } | null;
      } = {};

      if (formData.day1.stand_number.trim() && formData.day1.stand_size) {
        payload.day1_stand = {
          stand_number: formData.day1.stand_number.trim(),
          stand_size: formData.day1.stand_size,
        };
      } else {
        payload.day1_stand = null;
      }

      if (formData.day2.stand_number.trim() && formData.day2.stand_size) {
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
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { detail?: string; message?: string } };
      };
      const errorMessage =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        t("common.error");
      toast.error(String(errorMessage));
    } finally {
      setIsSaving(false);
    }
  };

  const summary = (day: "day1" | "day2") => {
    const s = formData[day];
    if (!s.stand_number) return "—";
    return `${s.stand_number} (${formatSizeLabel(s.stand_size, t)})`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-4">
          <DialogTitle>{t("companies.stand.edit")}</DialogTitle>
          <DialogDescription className="space-y-2 text-left">
            <span className="block">
              Kliknij stoisko na mapie, aby je przypisać
              {companyName ? ` firmie „${companyName}”` : ""}. Rozmiar bierze się
              z mapy.
            </span>
            <span className="block text-muted-foreground">
              Gdy potrzebujesz zmienić układ mapy, zalecamy zduplikować kartę w
              przeglądarce i w drugiej otworzyć edytor mapy (Mapa planu → Edytuj
              mapę). Wtedy wygodnie edytujesz układ, a zmiany widać od razu także
              tutaj.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={syncDays}
                onChange={(e) => {
                  const on = e.target.checked;
                  setSyncDays(on);
                  if (on) {
                    setFormData((prev) => ({
                      day1: { ...prev[activeDay] },
                      day2: { ...prev[activeDay] },
                    }));
                  }
                }}
              />
              Ten sam wybór na dzień 1 i 2
            </label>
            <span className="text-muted-foreground">
              D1: {summary("day1")} · D2: {summary("day2")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearDay}
            >
              Wyczyść {syncDays ? "oba dni" : activeDay === "day1" ? "dzień 1" : "dzień 2"}
            </Button>
          </div>

          <Tabs
            value={activeDay}
            onValueChange={(v) => setActiveDay(v as "day1" | "day2")}
          >
            <TabsList>
              <TabsTrigger value="day1">{t("companies.stand.day1")}</TabsTrigger>
              <TabsTrigger value="day2" disabled={syncDays}>
                {t("companies.stand.day2")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value={activeDay} className="mt-3">
              {loadingLayout || !layout ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <MapCanvas
                  segments={segments}
                  companyStands={otherStands}
                  selectedLabels={currentPick ? [currentPick] : []}
                  editable
                  onToggleSelect={pickBooth}
                />
              )}
            </TabsContent>
          </Tabs>
          <p className="text-xs text-muted-foreground">
            Pomarańczowe = inne firmy. Niebieskie = wybrane dla tej firmy.
          </p>
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
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
