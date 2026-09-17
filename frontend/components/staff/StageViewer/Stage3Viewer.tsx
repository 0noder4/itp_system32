"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stage3Data } from "@/lib/types";
import useSWR from "swr";
import { fetcher, LunchPriceResponse } from "@/lib/api";

interface Stage3ViewerProps {
  data: Stage3Data;
}

function Detail({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function formatPreferredTime(value?: string | null): string {
  if (!value) return "";
  return value.slice(0, 5);
}

export function Stage3Viewer({ data }: Stage3ViewerProps) {
  const { t } = useTranslation();
  const { data: fairDays } = useSWR<LunchPriceResponse>(
    "/api/lunch-price/",
    fetcher
  );

  if (data.skipped) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("exhibitor.form.workshopInfo")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("exhibitor.form.workshopSkippedBasic")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const amenities: string[] = [];
  if (data.room_projector) amenities.push(t("exhibitor.form.roomProjector"));
  if (data.room_hdmi) amenities.push(t("exhibitor.form.roomHdmi"));
  if (data.room_other) amenities.push(data.room_other);

  const preferredDayLabel =
    data.preferred_day === "day1"
      ? fairDays?.day1 || t("exhibitor.map.day1")
      : data.preferred_day === "day2"
        ? fairDays?.day2 || t("exhibitor.map.day2")
        : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exhibitor.form.workshopInfo")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">
            {data.workshop
              ? t("exhibitor.form.willConductWorkshop")
              : t("exhibitor.form.willNotConductWorkshop")}
          </p>
          <span className={data.workshop ? "text-green-600" : "text-gray-400"}>
            {typeof data.workshop === "boolean"
              ? data.workshop
                ? "✓"
                : "✗"
              : "—"}
          </span>
        </div>

        {data.workshop === true && (
          <>
            <Detail
              label={t("exhibitor.form.workshopTitle")}
              value={data.title}
            />
            <Detail
              label={t("exhibitor.form.workshopAbout")}
              value={data.description}
            />
            <Detail
              label={t("exhibitor.form.workshopPreferredDay")}
              value={preferredDayLabel}
            />
            <Detail
              label={t("exhibitor.form.workshopPreferredTime")}
              value={formatPreferredTime(data.preferred_time)}
            />
            <Detail
              label={t("exhibitor.form.workshopSkills")}
              value={data.skills}
            />
            <Detail
              label={t("exhibitor.form.workshopStudyMajors")}
              value={data.study_majors}
            />

            {(data.facilitators || []).length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("exhibitor.form.workshopFacilitators")}
                </p>
                {data.facilitators!.map((fac, index) => (
                  <div
                    key={fac.id ?? index}
                    className="rounded-md border p-3 space-y-1"
                  >
                    <p className="font-medium">
                      {[fac.name, fac.surname].filter(Boolean).join(" ")}
                    </p>
                    {fac.phone_number && (
                      <p className="text-sm">{fac.phone_number}</p>
                    )}
                    {fac.description && (
                      <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                        {fac.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {amenities.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("exhibitor.form.workshopRoomAmenities")}
                </p>
                <p className="mt-1">{amenities.join(", ")}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("exhibitor.form.workshopContactPhone")}
              </p>
              <p className="mt-1">{data.contact_phone || "—"}</p>
            </div>

            <Detail
              label={t("exhibitor.form.workshopNotes")}
              value={data.notes}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
