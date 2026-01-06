"use client";

import React from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import {
  Stage1Data,
  Stage2Data,
  Stage3Data,
  Stage4Data,
  Stage5Data,
} from "@/lib/types";
import { Stage1Viewer } from "./Stage1Viewer";
import { Stage2Viewer } from "./Stage2Viewer";
import { Stage3Viewer } from "./Stage3Viewer";
import { Stage4Viewer } from "./Stage4Viewer";
import { Stage5Viewer } from "./Stage5Viewer";

interface StageViewerProps {
  companyId: number;
  stageNumber: number;
}

export function StageViewer({ companyId, stageNumber }: StageViewerProps) {
  const { t } = useTranslation();
  const endpoint = `/api/company/${companyId}/form/stage-${stageNumber}/`;

  const { data, error, isLoading } = useSWR<any>(endpoint, fetcher);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6 flex items-center gap-2 text-amber-700">
          <AlertCircle className="h-4 w-4" />
          <p className="text-sm">{t("staff.companyDetail.noData")}</p>
        </CardContent>
      </Card>
    );
  }

  if (stageNumber === 1) {
    return <Stage1Viewer data={data as Stage1Data} />;
  } else if (stageNumber === 2) {
    return <Stage2Viewer data={data as Stage2Data} />;
  } else if (stageNumber === 3) {
    return <Stage3Viewer data={data as Stage3Data} />;
  } else if (stageNumber === 4) {
    return <Stage4Viewer data={data as Stage4Data} />;
  } else if (stageNumber === 5) {
    return <Stage5Viewer data={data as Stage5Data} />;
  }

  return null;
}

