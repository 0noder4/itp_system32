"use client";

import React, { useState } from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { MapViewer } from "@/components/exhibitor/Map/MapViewer";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Company, Stage4Data, Stage1Data } from "@/lib/types";
import { useFormStatus } from "@/hooks/use-form-status";

export default function MapPage() {
  const { t } = useTranslation();
  const { companyId, isLoading: isLoadingStatus } = useFormStatus();
  const [selectedDay, setSelectedDay] = useState<string>("day1");

  // Fetch company data
  const {
    data: company,
    error: companyError,
    isLoading: isLoadingCompany,
  } = useSWR<Company>(companyId ? `/api/company/${companyId}/` : null, fetcher);

  // Fetch stage 4 data for catalogue logo (description.logo_file)
  const {
    data: stage4Data,
    error: stage4Error,
    isLoading: isLoadingStage4,
  } = useSWR<Stage4Data>(
    companyId ? `/api/company/${companyId}/form/stage-4/` : null,
    fetcher
  );

  // Fetch stage 1 data for company full name
  const {
    data: stage1Data,
    error: stage1Error,
    isLoading: isLoadingStage1,
  } = useSWR<Stage1Data>(
    companyId ? `/api/company/${companyId}/form/stage-1/` : null,
    fetcher
  );

  // Helper function to get full URL for file fields
  const getFileUrl = (fileUrl: string | undefined) => {
    if (!fileUrl) return null;
    // If already a full URL, return as is
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
      return fileUrl;
    }
    // Get API base URL
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const base = apiBaseUrl.replace(/\/$/, "");

    // DRF FileField returns paths relative to MEDIA_URL
    let path = fileUrl;

    // If path doesn't start with /, prepend /media/
    if (!path.startsWith("/")) {
      path = `/media/${path}`;
    }
    // If path starts with / but not /media/, and looks like a media file path
    else if (!path.startsWith("/media/")) {
      // Check if it's a known media file pattern
      if (
        path.startsWith("/logos/") ||
        path.startsWith("/fire_certs/") ||
        path.startsWith("/catalogue_logos/")
      ) {
        path = `/media${path}`;
      }
      // Otherwise assume it needs /media/ prefix
      else if (!path.startsWith("/static/") && !path.startsWith("/api/")) {
        path = `/media${path}`;
      }
    }

    return `${base}${path}`;
  };

  // Get catalogue logo URL from stage 4 data (description.logo_file)
  const logoUrl =
    stage4Data?.description?.logo_file
      ? getFileUrl(
          typeof stage4Data.description.logo_file === "string"
            ? stage4Data.description.logo_file
            : undefined
        )
      : null;

  // Get company full name (fallback to name if not available)
  const companyFullName =
    stage1Data?.basic_data?.full_name || company?.name || null;

  const isLoading =
    isLoadingStatus || isLoadingCompany || isLoadingStage4 || isLoadingStage1;
  const hasError = !!companyError || !!stage4Error || !!stage1Error;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-auto p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Error state
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
      <div className="max-w-7xl mx-auto w-full p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
            {t("exhibitor.map.title")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t("exhibitor.map.description")}
          </p>
        </div>

        {/* Map Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("exhibitor.map.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedDay} onValueChange={(v) => setSelectedDay(v as "day1" | "day2")}>
              <TabsList className="mb-4">
                <TabsTrigger value="day1">{t("exhibitor.map.day1")}</TabsTrigger>
                <TabsTrigger value="day2">{t("exhibitor.map.day2")}</TabsTrigger>
              </TabsList>
              <TabsContent value="day1" className="mt-0">
                {company?.day1_stand?.stand_number ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t("exhibitor.map.yourStand")}: <span className="font-semibold text-foreground">{company.day1_stand.stand_number}</span>
                    </p>
                    <MapViewer
                      mapPath="/maps/programmable_map_day_1.svg"
                      userStandNumber={company.day1_stand.stand_number}
                      companyName={companyFullName || company.name}
                      companyLogoUrl={logoUrl || undefined}
                    />
                  </div>
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    {t("exhibitor.map.noStandAssigned")}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="day2" className="mt-0">
                {company?.day2_stand?.stand_number ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t("exhibitor.map.yourStand")}: <span className="font-semibold text-foreground">{company.day2_stand.stand_number}</span>
                    </p>
                    <MapViewer
                      mapPath="/maps/programmable_map_day_2.svg"
                      userStandNumber={company.day2_stand.stand_number}
                      companyName={companyFullName || company.name}
                      companyLogoUrl={logoUrl || undefined}
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
