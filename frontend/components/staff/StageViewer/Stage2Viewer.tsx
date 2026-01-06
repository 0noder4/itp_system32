"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { Stage2Data } from "@/lib/types";
import { getFileUrl } from "./utils";

interface Stage2ViewerProps {
  data: Stage2Data;
}

export function Stage2Viewer({ data }: Stage2ViewerProps) {
  const { t } = useTranslation();

  const standType = data.stand_details?.stand_type;
  const isProvidedStand = standType === "provided_stand";
  const isSelfConstruction = standType === "self_construction";

  // Group equipment by category
  const groupedEquipment = React.useMemo(() => {
    if (!data.equipment_selections || data.equipment_selections.length === 0) {
      return {};
    }

    const grouped: Record<string, typeof data.equipment_selections> = {};
    data.equipment_selections.forEach((sel) => {
      // Only show equipment selections with quantity > 0 and valid equipment_item
      if (sel.quantity > 0 && sel.equipment_item) {
        const category = sel.equipment_item.category || "other";
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(sel);
      }
    });
    return grouped;
  }, [data.equipment_selections]);

  // Calculate total additional cost
  const totalAdditionalCost = React.useMemo(() => {
    if (!data.equipment_selections) return 0;

    return data.equipment_selections.reduce((total, sel) => {
      if (sel.quantity > 0 && sel.equipment_item) {
        const item = sel.equipment_item;
        const chargeableQuantity = Math.max(
          0,
          sel.quantity - (item.included_quantity || 0)
        );
        return total + parseFloat(item.price) * chargeableQuantity;
      }
      return total;
    }, 0);
  }, [data.equipment_selections]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exhibitor.form.standDetails")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stand Type */}
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">
            {t("exhibitor.form.standType")}
          </p>
          <p className="text-base">
            {isProvidedStand && t("exhibitor.form.ourStand")}
            {isSelfConstruction && t("exhibitor.form.selfConstruction")}
            {!standType && "—"}
          </p>
        </div>

        {/* Provided Stand Details */}
        {isProvidedStand && (
          <div className="space-y-4">
            <h3 className="font-medium">
              {t("exhibitor.form.ourStandDetails")}
            </h3>

            {data.stand_details?.name_sign_text && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("exhibitor.form.nameSignText")}
                </p>
                <p className="mt-1">{data.stand_details.name_sign_text}</p>
              </div>
            )}

            {data.stand_details?.logo_sign_file && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("exhibitor.form.uploadLogo")}
                </p>
                <a
                  href={getFileUrl(data.stand_details.logo_sign_file) || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <span>View file</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Self Construction Details */}
        {isSelfConstruction && (
          <div className="space-y-4">
            <h3 className="font-medium">
              {t("exhibitor.form.selfConstructionDetails")}
            </h3>

            {data.stand_details?.sc_details && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("exhibitor.form.scDetails")}
                </p>
                <p className="mt-1 whitespace-pre-wrap">
                  {data.stand_details.sc_details}
                </p>
              </div>
            )}

            {data.stand_details?.fire_cert && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t("exhibitor.form.uploadFireCert")}
                </p>
                <a
                  href={getFileUrl(data.stand_details.fire_cert) || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <span>View file</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Equipment Selections */}
        <div>
          <h3 className="font-medium mb-4">
            {t("exhibitor.form.selectEquipment")}
          </h3>
          {data.equipment_selections && data.equipment_selections.length > 0 ? (
            Object.keys(groupedEquipment).length > 0 ? (
              <div className="space-y-6">
                {Object.entries(groupedEquipment).map(
                  ([category, selections]) => (
                    <div key={category} className="space-y-3">
                      {category !== "other" && (
                        <h4 className="text-sm font-medium text-muted-foreground">
                          {category}
                        </h4>
                      )}
                      <div className="grid gap-4 md:grid-cols-2">
                        {selections.map((sel) => {
                          const item = sel.equipment_item;
                          const quantity = sel.quantity;
                          const includedQty = item.included_quantity || 0;
                          const chargeableQty = Math.max(
                            0,
                            quantity - includedQty
                          );
                          const itemCost =
                            chargeableQty > 0
                              ? parseFloat(item.price) * chargeableQty
                              : 0;

                          return (
                            <div
                              key={sel.id || item.id}
                              className="rounded-md border p-3 space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <h4 className="font-medium text-base">
                                  {item.name}
                                </h4>
                                {itemCost > 0 && (
                                  <p className="font-medium text-primary">
                                    {itemCost.toFixed(2)} PLN
                                  </p>
                                )}
                              </div>
                              <div className="space-y-1 text-sm">
                                <p>
                                  <span className="text-muted-foreground">
                                    {t("exhibitor.form.quantity")}:
                                  </span>{" "}
                                  {quantity}
                                  {includedQty > 0 && (
                                    <span className="text-muted-foreground ml-1">
                                      ({includedQty}{" "}
                                      {t("exhibitor.form.included")})
                                    </span>
                                  )}
                                </p>
                                {chargeableQty > 0 && (
                                  <p className="text-amber-600">
                                    {chargeableQty}{" "}
                                    {t("exhibitor.form.additionalAt")}{" "}
                                    {parseFloat(item.price).toFixed(2)} PLN{" "}
                                    {t("exhibitor.form.each")}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
                {totalAdditionalCost > 0 && (
                  <div className="rounded-md bg-amber-50 p-4 border border-amber-200">
                    <p className="text-sm font-medium text-amber-900">
                      {t("exhibitor.form.totalAdditionalCost")}:{" "}
                      {totalAdditionalCost.toFixed(2)} PLN
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("staff.companyDetail.noData") || "No equipment selected"}
              </p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("staff.companyDetail.noData") || "No equipment selected"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
