"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stage1Data } from "@/lib/types";

interface Stage1ViewerProps {
  data: Stage1Data;
}

export function Stage1Viewer({ data }: Stage1ViewerProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exhibitor.form.basicData")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {t("exhibitor.form.fullName")}
            </p>
            <p className="mt-1">{data.basic_data?.full_name || "—"}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {t("exhibitor.form.nip")}
            </p>
            <p className="mt-1">{data.basic_data?.nip || "—"}</p>
          </div>
        </div>

        <div>
          <h3 className="font-medium mb-3">{t("exhibitor.form.address")}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("exhibitor.form.street")}
              </p>
              <p className="mt-1">{data.address?.street || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("exhibitor.form.homeNumber")}
              </p>
              <p className="mt-1">{data.address?.home_number || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("exhibitor.form.aptNumber")}
              </p>
              <p className="mt-1">{data.address?.apt_number || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("exhibitor.form.city")}
              </p>
              <p className="mt-1">{data.address?.city || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("exhibitor.form.country")}
              </p>
              <p className="mt-1">{data.address?.country || "—"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("exhibitor.form.postalCode")}
              </p>
              <p className="mt-1">{data.address?.postal_code || "—"}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

