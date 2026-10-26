"use client";

import React, { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { MapCanvas } from "@/components/map/MapCanvas";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Company, Stage4Data, Stage1Data } from "@/lib/types";
import { useFormStatus } from "@/hooks/use-form-status";
import {
  MapLayoutResponse,
  segmentsForDay,
} from "@/lib/mapLayout";
import { getFileUrl } from "@/components/staff/StageViewer/utils";

export default function MapPage() {
  const { t } = useTranslation();
  const { companyId, isLoading: isLoadingStatus } = useFormStatus();
  const [selectedDay, setSelectedDay] = useState<"day1" | "day2">("day1");

  const {
    data: company,
    error: companyError,
    isLoading: isLoadingCompany,
  } = useSWR<Company>(companyId ? `/api/company/${companyId}/` : null, fetcher);

  const {
    data: layout,
    error: layoutError,
    isLoading: isLoadingLayout,
  } = useSWR<MapLayoutResponse>("/api/map-layout/", fetcher);

  const {
    data: stage4Data,
    error: stage4Error,
    isLoading: isLoadingStage4,
  } = useSWR<Stage4Data>(
    companyId ? `/api/company/${companyId}/form/stage-4/` : null,
    fetcher
  );

  const {
    data: stage1Data,
    error: stage1Error,
    isLoading: isLoadingStage1,
  } = useSWR<Stage1Data>(
    companyId ? `/api/company/${companyId}/form/stage-1/` : null,
    fetcher
  );

  const logoUrl = stage4Data?.description?.logo_file
    ? getFileUrl(
        typeof stage4Data.description.logo_file === "string"
          ? stage4Data.description.logo_file
          : undefined
      )
    : null;

  const companyFullName =
    stage1Data?.basic_data?.full_name || company?.name || null;

  const isLoading =
    isLoadingStatus ||
    isLoadingCompany ||
    isLoadingStage4 ||
    isLoadingStage1 ||
    isLoadingLayout;
  const hasError =
    !!companyError || !!stage4Error || !!stage1Error || !!layoutError;

  const dayLayout = selectedDay === "day1" ? layout?.day1 : layout?.day2;
  const segments = segmentsForDay(dayLayout);
  const standNumber =
    selectedDay === "day1"
      ? company?.day1_stand?.stand_number
      : company?.day2_stand?.stand_number;

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col space-y-6 overflow-auto p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-1 flex-col overflow-auto p-6">
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-4 pt-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <div>
              <h2 className="font-semibold">{t("common.error")}</h2>
              <p className="text-muted-foreground">
                {t("exhibitor.loadError")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-background">
      <div className="mx-auto w-full max-w-7xl space-y-6 p-6 lg:p-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight lg:text-4xl">
            {t("exhibitor.map.title")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t("exhibitor.map.description")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("exhibitor.map.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs
              value={selectedDay}
              onValueChange={(v) => setSelectedDay(v as "day1" | "day2")}
            >
              <TabsList className="mb-4">
                <TabsTrigger value="day1">
                  {t("exhibitor.map.day1")}
                </TabsTrigger>
                <TabsTrigger value="day2">
                  {t("exhibitor.map.day2")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value={selectedDay} className="mt-0">
                {standNumber ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t("exhibitor.map.yourStand")}:{" "}
                      <span className="font-semibold text-foreground">
                        {standNumber}
                      </span>
                    </p>
                    <MapCanvas
                      segments={segments}
                      userStandNumber={standNumber}
                      companyStands={[
                        {
                          companyId: company!.id,
                          companyName: companyFullName || company!.name,
                          standNumber,
                          logoUrl,
                        },
                      ]}
                    />
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    {t("exhibitor.map.noStandAssigned")}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
