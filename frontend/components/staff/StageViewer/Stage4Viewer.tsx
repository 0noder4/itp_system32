"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stage4Data } from "@/lib/types";

interface Stage4ViewerProps {
  data: Stage4Data;
}

export function Stage4Viewer({ data }: Stage4ViewerProps) {
  const { t } = useTranslation();

  // Helper function to check if a string is an email address
  const isEmail = (str: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
  };

  // Helper function to get the proper href for URL or email
  const getUrlHref = (url: string) => {
    if (isEmail(url)) {
      return `mailto:${url}`;
    }
    return url;
  };

  return (
    <div className="space-y-6">
      {/* Catalogue Section */}
      {data.description && (
        <Card>
          <CardHeader>
            <CardTitle>{t("exhibitor.form.catalogue")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {t("exhibitor.form.companyDescription")}
              </p>
              <p className="mt-1 whitespace-pre-wrap">
                {data.description.descr || "—"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Jobwalls Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t("exhibitor.form.jobwallInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {data.jobwalls && data.jobwalls.length > 0 ? (
            data.jobwalls.map((jobwall, index) => (
              <div key={jobwall.id || index} className="space-y-4">
                {index > 0 && <hr className="my-6" />}
                <div>
                  <h3 className="text-sm font-medium mb-4">
                    {t("exhibitor.form.jobwall")} {index + 1}
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("exhibitor.form.positionName")}
                      </p>
                      <p className="mt-1">{jobwall.name || "—"}</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {t("exhibitor.form.workForm")}
                        </p>
                        <p className="mt-1">
                          {jobwall.form === "s" &&
                            t("exhibitor.form.workFormOnsite")}
                          {jobwall.form === "z" &&
                            t("exhibitor.form.workFormRemote")}
                          {jobwall.form === "h" &&
                            t("exhibitor.form.workFormHybrid")}
                          {jobwall.form === "k" &&
                            t("exhibitor.form.workFormContest")}
                          {jobwall.form === "m" &&
                            t("exhibitor.form.workFormMobile")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {t("exhibitor.form.workload")}
                        </p>
                        <p className="mt-1">
                          {jobwall.workload === "pelen" &&
                            t("exhibitor.form.workloadFull")}
                          {jobwall.workload === "pol" &&
                            t("exhibitor.form.workloadHalf")}
                          {jobwall.workload === "trzyczwarte" &&
                            t("exhibitor.form.workloadThreeQuarters")}
                          {jobwall.workload === "el" &&
                            t("exhibitor.form.workloadFlexible")}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {t("exhibitor.form.contract")}
                        </p>
                        <p className="mt-1">
                          {jobwall.contract === "uop" &&
                            t("exhibitor.form.contractEmployment")}
                          {jobwall.contract === "uoz" &&
                            t("exhibitor.form.contractMandate")}
                          {jobwall.contract === "uod" &&
                            t("exhibitor.form.contractWork")}
                          {jobwall.contract === "b2b" &&
                            t("exhibitor.form.contractB2B")}
                          {jobwall.contract === "uos" &&
                            t("exhibitor.form.contractInternship")}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("exhibitor.form.positionDescription")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">
                        {jobwall.description || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("exhibitor.form.benefits")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">
                        {jobwall.benefits || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("exhibitor.form.requirements")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">
                        {jobwall.requirements || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("exhibitor.form.applicationUrl")}
                      </p>
                      <p className="mt-1">
                        {jobwall.url ? (
                          <a
                            href={getUrlHref(jobwall.url)}
                            target={isEmail(jobwall.url) ? undefined : "_blank"}
                            rel={
                              isEmail(jobwall.url)
                                ? undefined
                                : "noopener noreferrer"
                            }
                            className="text-primary hover:underline"
                          >
                            {jobwall.url}
                          </a>
                        ) : (
                          "—"
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("staff.companyDetail.noData")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
