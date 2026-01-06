"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stage5Data } from "@/lib/types";

interface Stage5ViewerProps {
  data: Stage5Data;
}

export function Stage5Viewer({ data }: Stage5ViewerProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exhibitor.form.finalData")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.final_data && (
          <div>
            <h3 className="font-medium mb-3">
              {t("exhibitor.form.finalData")}
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("exhibitor.form.electricDevices")}
                </p>
                <p className="mt-1">{data.final_data.el_devices || "—"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("exhibitor.form.electricPower")}
                </p>
                <p className="mt-1">{data.final_data.el_power || "—"}</p>
              </div>
            </div>
          </div>
        )}

        {data.lunches && data.lunches.length > 0 && (
          <div>
            <h3 className="font-medium mb-3">{t("exhibitor.form.lunches")}</h3>
            <div className="space-y-2">
              {data.lunches.map((lunch, index) => (
                <div key={index} className="border rounded p-3">
                  <p className="text-sm">
                    <span className="font-medium">
                      {t("exhibitor.form.day")}:
                    </span>{" "}
                    {lunch.day === "day1" ? "10.03.2025" : "11.03.2025"}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">
                      {t("exhibitor.form.quantity")}:
                    </span>{" "}
                    {lunch.lunch_quantity}
                  </p>
                  {lunch.diet_info && (
                    <p className="text-sm">
                      <span className="font-medium">
                        {t("exhibitor.form.dietInfo")}:
                      </span>{" "}
                      {lunch.diet_info}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.exhibitors && data.exhibitors.length > 0 && (
          <div>
            <h3 className="font-medium mb-3">
              {t("exhibitor.form.exhibitors")}
            </h3>
            <div className="space-y-2">
              {data.exhibitors.map((exhibitor, index) => (
                <div key={index} className="border rounded p-3">
                  <p className="text-sm">
                    {exhibitor.name} {exhibitor.surname}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {exhibitor.phone_number}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
