"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stage3Data } from "@/lib/types";

interface Stage3ViewerProps {
  data: Stage3Data;
}

export function Stage3Viewer({ data }: Stage3ViewerProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exhibitor.form.workshopInfo")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">
            {t("exhibitor.form.willConductWorkshop")}
          </p>
          <span className={data.workshop ? "text-green-600" : "text-gray-400"}>
            {data.workshop ? "✓" : "✗"}
          </span>
        </div>
        {data.workshop && data.notes && (
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {t("exhibitor.form.workshopNotes")}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{data.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

