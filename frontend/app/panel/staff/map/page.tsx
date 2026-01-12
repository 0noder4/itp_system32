"use client";

import React, { useState, useMemo } from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { MapViewer } from "@/components/staff/Map/MapViewer";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Company, Stage1Data, Stage4Data } from "@/lib/types";
import { Header } from "@/components/layout/Header";

export default function StaffMapPage() {
  const { t } = useTranslation();
  const [selectedDay, setSelectedDay] = useState<string>("day1");

  // Fetch all companies
  const {
    data: companies,
    error: companiesError,
    isLoading: isLoadingCompanies,
  } = useSWR<Company[]>("/api/companies/", fetcher);

  // Helper function to get full URL for file fields
  const getFileUrl = (fileUrl: string | undefined) => {
    if (!fileUrl) return null;
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
      return fileUrl;
    }
    const apiBaseUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const base = apiBaseUrl.replace(/\/$/, "");

    let path = fileUrl;

    if (!path.startsWith("/")) {
      path = `/media/${path}`;
    } else if (!path.startsWith("/media/")) {
      if (
        path.startsWith("/logos/") ||
        path.startsWith("/fire_certs/") ||
        path.startsWith("/catalogue_logos/")
      ) {
        path = `/media${path}`;
      } else if (!path.startsWith("/static/") && !path.startsWith("/api/")) {
        path = `/media${path}`;
      }
    }

    return `${base}${path}`;
  };

  // Fetch stage 1 data for companies with stands
  const [stage1DataMap, setStage1DataMap] = React.useState<
    Record<number, Stage1Data | null>
  >({});
  const [isLoadingStage1, setIsLoadingStage1] = React.useState(false);

  // Fetch stage 4 data for logos
  const [stage4DataMap, setStage4DataMap] = React.useState<
    Record<number, Stage4Data | null>
  >({});
  const [isLoadingStage4, setIsLoadingStage4] = React.useState(false);

  React.useEffect(() => {
    if (!companies) return;

    const companyIdsWithStands = new Set<number>();
    companies.forEach((company) => {
      if (
        company.day1_stand?.stand_number ||
        company.day2_stand?.stand_number
      ) {
        companyIdsWithStands.add(company.id);
      }
    });

    if (companyIdsWithStands.size === 0) return;

    setIsLoadingStage1(true);
    setIsLoadingStage4(true);
    Promise.all([
      // Fetch stage 1 data for full names
      Promise.all(
        Array.from(companyIdsWithStands).map(async (companyId) => {
          try {
            const data = await fetcher<Stage1Data>(
              `/api/company/${companyId}/form/stage-1/`
            );
            return { companyId, data };
          } catch (error) {
            // If stage 1 data doesn't exist, that's ok - we'll use company.name
            return { companyId, data: null };
          }
        })
      ),
      // Fetch stage 4 data for logos
      Promise.all(
        Array.from(companyIdsWithStands).map(async (companyId) => {
          try {
            const data = await fetcher<Stage4Data>(
              `/api/company/${companyId}/form/stage-4/`
            );
            return { companyId, data };
          } catch (error) {
            // If stage 4 data doesn't exist, that's ok - no logo will be shown
            return { companyId, data: null };
          }
        })
      ),
    ]).then(([stage1Results, stage4Results]) => {
      const stage1Map: Record<number, Stage1Data | null> = {};
      stage1Results.forEach(({ companyId, data }) => {
        stage1Map[companyId] = data;
      });
      setStage1DataMap(stage1Map);
      setIsLoadingStage1(false);

      const stage4Map: Record<number, Stage4Data | null> = {};
      stage4Results.forEach(({ companyId, data }) => {
        stage4Map[companyId] = data;
      });
      setStage4DataMap(stage4Map);
      setIsLoadingStage4(false);
    });
  }, [companies]);

  // Helper to get company full name (fallback to name)
  const getCompanyFullName = React.useCallback(
    (company: Company): string => {
      const stage1Data = stage1DataMap[company.id];
      return stage1Data?.basic_data?.full_name || company.name;
    },
    [stage1DataMap]
  );

  // Helper to get company logo URL (from stage 4 description.logo_file)
  const getCompanyLogoUrl = React.useCallback(
    (company: Company): string | null => {
      const stage4Data = stage4DataMap[company.id];
      const logoFile = stage4Data?.description?.logo_file;
      if (typeof logoFile === "string") {
        return getFileUrl(logoFile);
      }
      return null;
    },
    [stage4DataMap]
  );

  // Prepare company stands data for Day 1
  const day1CompanyStands = useMemo(() => {
    if (!companies) return [];
    return companies
      .filter((company) => company.day1_stand?.stand_number)
      .map((company) => ({
        companyId: company.id,
        companyName: getCompanyFullName(company),
        standNumber: company.day1_stand!.stand_number,
        logoUrl: getCompanyLogoUrl(company),
      }));
  }, [companies, getCompanyFullName, getCompanyLogoUrl]);

  // Prepare company stands data for Day 2
  const day2CompanyStands = useMemo(() => {
    if (!companies) return [];
    return companies
      .filter((company) => company.day2_stand?.stand_number)
      .map((company) => ({
        companyId: company.id,
        companyName: getCompanyFullName(company),
        standNumber: company.day2_stand!.stand_number,
        logoUrl: getCompanyLogoUrl(company),
      }));
  }, [companies, getCompanyFullName, getCompanyLogoUrl]);

  const isLoading = isLoadingCompanies || isLoadingStage1 || isLoadingStage4;
  const hasError = !!companiesError;

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

  const navItems = [
    {
      title: t("companies.title"),
      url: "/panel/staff",
    },
    {
      title: t("staff.map.title"),
      url: "/panel/staff/map",
    },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header navigationItems={navItems} />
      <div className="flex flex-1 flex-col overflow-auto bg-background">
        <div className="max-w-7xl mx-auto w-full p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-foreground">
            {t("staff.map.title")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t("staff.map.description")}
          </p>
        </div>

        {/* Map Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("staff.map.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs
              value={selectedDay}
              onValueChange={(v) => setSelectedDay(v as "day1" | "day2")}
            >
              <TabsList className="mb-4">
                <TabsTrigger value="day1">{t("staff.map.day1")}</TabsTrigger>
                <TabsTrigger value="day2">{t("staff.map.day2")}</TabsTrigger>
              </TabsList>
              <TabsContent value="day1" className="mt-0">
                <MapViewer
                  mapPath="/maps/programmable_map_day_1.svg"
                  companyStands={day1CompanyStands}
                />
              </TabsContent>
              <TabsContent value="day2" className="mt-0">
                <MapViewer
                  mapPath="/maps/programmable_map_day_2.svg"
                  companyStands={day2CompanyStands}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
