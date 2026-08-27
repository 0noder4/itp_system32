"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stage5Data, AttendanceOption } from "@/lib/types";
import { LunchPriceResponse, fetcher } from "@/lib/api";
import { calculateLunchSummary, parseLunchPrice, formatDietLabel } from "@/lib/stage5-utils";
import useSWR from "swr";

interface Stage5ViewerProps {
  data: Stage5Data;
}

function formatAttendance(
  attendance: AttendanceOption | "" | undefined,
  day1: string,
  day2: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  switch (attendance) {
    case "both":
      return t("exhibitor.form.attendanceBoth");
    case "day1":
      return t("exhibitor.form.attendanceDay1", { date: day1 });
    case "day2":
      return t("exhibitor.form.attendanceDay2", { date: day2 });
    case "none":
      return t("exhibitor.form.attendanceNone");
    default:
      return "—";
  }
}

export function Stage5Viewer({ data }: Stage5ViewerProps) {
  const { t } = useTranslation();
  const { data: lunchSettings } = useSWR<LunchPriceResponse>(
    "/api/lunch-price/",
    fetcher
  );
  const day1Label = lunchSettings?.day1 || "09.03.2027";
  const day2Label = lunchSettings?.day2 || "10.03.2027";
  const lunchPrice = parseLunchPrice(lunchSettings?.lunch_price);

  const lunchSummary = calculateLunchSummary(data.lunches || [], lunchPrice);
  const finalData = data.final_data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exhibitor.form.finalData")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {finalData && (
          <div>
            <h3 className="font-medium mb-3">
              {t("exhibitor.form.electricDevicesTitle")}
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("exhibitor.form.electricDevices")}
                </p>
                <p className="mt-1">{finalData.el_devices || "—"}</p>
              </div>
              {finalData.el_low_power ? (
                <p className="text-sm">
                  {t("exhibitor.form.electricLowPowerStatus")}
                </p>
              ) : (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {t("exhibitor.form.electricPower")}
                  </p>
                  <p className="mt-1">{finalData.el_power || "—"}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <h3 className="font-medium mb-3">{t("exhibitor.form.lunches")}</h3>
          {finalData?.lunches_declined ? (
            <p className="text-sm">{t("exhibitor.form.lunchesDeclinedStatus")}</p>
          ) : data.lunches && data.lunches.length > 0 ? (
            <div className="space-y-2">
              {data.lunches.map((lunch, index) => (
                <div key={index} className="border rounded p-3">
                  <p className="text-sm">
                    <span className="font-medium">
                      {t("exhibitor.form.day")}:
                    </span>{" "}
                    {lunch.day === "day1" ? day1Label : day2Label}
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
                      {formatDietLabel(lunch.diet_info, t)}
                    </p>
                  )}
                </div>
              ))}
              <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1 mt-2">
                <p>
                  {t("exhibitor.form.lunchSummaryPaid", {
                    count: lunchSummary.paidLunches,
                  })}
                </p>
                <p className="font-medium">
                  {t("exhibitor.form.lunchSummaryTotal", {
                    amount: lunchSummary.totalCost.toFixed(2),
                  })}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>

        {finalData && (
          <div>
            <h3 className="font-medium mb-3">{t("exhibitor.form.mainRepTitle")}</h3>
            <div className="border rounded p-3 space-y-1 text-sm">
              <p>
                {finalData.main_rep_name} {finalData.main_rep_surname}
              </p>
              <p className="text-muted-foreground">
                {finalData.main_rep_phone || "—"}
              </p>
              <p>
                <span className="font-medium">
                  {t("exhibitor.form.attendanceLabel")}:
                </span>{" "}
                {formatAttendance(
                  finalData.main_rep_attendance,
                  day1Label,
                  day2Label,
                  t
                )}
              </p>
            </div>
          </div>
        )}

        <div>
          <h3 className="font-medium mb-3">{t("exhibitor.form.exhibitors")}</h3>
          {finalData?.no_other_delegates ? (
            <p className="text-sm">{t("exhibitor.form.noOtherDelegatesStatus")}</p>
          ) : data.exhibitors && data.exhibitors.length > 0 ? (
            <div className="space-y-2">
              {data.exhibitors.map((exhibitor, index) => (
                <div key={index} className="border rounded p-3 text-sm space-y-1">
                  <p>
                    {exhibitor.name} {exhibitor.surname}
                  </p>
                  <p className="text-muted-foreground">
                    {exhibitor.phone_number}
                  </p>
                  <p>
                    <span className="font-medium">
                      {t("exhibitor.form.attendanceLabel")}:
                    </span>{" "}
                    {formatAttendance(
                      exhibitor.attendance,
                      day1Label,
                      day2Label,
                      t
                    )}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
