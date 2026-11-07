"use client";

import React from "react";
import Markdown from "react-markdown";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { MapDayLayout } from "@/lib/mapLayout";
import { getFileUrl } from "@/components/staff/StageViewer/utils";
import { Button } from "@/components/ui/button";
import { SiteHallMap } from "./SiteHallMap";
import {
  CataloguePreviewJob,
  SiteJobDetails,
  contactWorksOnWebsite,
} from "./SiteJobDetails";
import styles from "./sitePreview.module.scss";

export type CataloguePreviewPayload = {
  company_id: number;
  internalName: string;
  externalName: string;
  partnershipType: "main" | "partner" | "regular";
  description: string;
  logo_media_path: string;
  stand: {
    firstDay: string;
    secondDay: string;
  };
  jobs: CataloguePreviewJob[];
};

type Props = {
  payload: CataloguePreviewPayload;
  hallMap?: {
    day1?: MapDayLayout;
    day2?: MapDayLayout;
  } | null;
  /** Titles of offers already on the website that the next export deletes. */
  jobsRemoved?: string[];
};

const DEFAULT_LOGO = "/website/itp-logo--horizontal--dark.svg";

function partnershipLabel(type: CataloguePreviewPayload["partnershipType"]) {
  if (type === "main") return "Partner Główny";
  if (type === "partner") return "Partner";
  return "Wystawca";
}

export function CataloguePreview({ payload, hallMap, jobsRemoved = [] }: Props) {
  const { t } = useTranslation();
  const [openJobId, setOpenJobId] = React.useState<number | null>(null);
  const [logoFailed, setLogoFailed] = React.useState(false);

  React.useEffect(() => {
    setOpenJobId(null);
    setLogoFailed(false);
  }, [payload.company_id]);

  const jobs = payload.jobs ?? [];
  const openJob = jobs.find((job) => job.id === openJobId) ?? null;
  const brokenContacts = jobs.filter((job) => !contactWorksOnWebsite(job.contact));
  const companyLogo = getFileUrl(payload.logo_media_path || undefined);
  const logoUrl = companyLogo && !logoFailed ? companyLogo : DEFAULT_LOGO;

  return (
    <div className="space-y-3">
      {jobsRemoved.length > 0 ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t("websiteExport.jobsRemovedWarning", {
            titles: jobsRemoved.map((title) => `„${title}”`).join(", "),
          })}
        </p>
      ) : null}
      {brokenContacts.map((job) => (
        <p
          key={job.id}
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {t("websiteExport.jobContactWarning", {
            title: job.title,
            value: job.contact,
          })}
        </p>
      ))}

      <div className="flex min-h-8 items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {openJob
            ? t("websiteExport.previewFrameJobLabel")
            : t("websiteExport.previewFrameLabel")}
        </span>
        {openJob ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpenJobId(null)}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("websiteExport.backToCompany")}
          </Button>
        ) : null}
      </div>

      <div
        className={`${styles.site} h-[70vh] overflow-y-auto rounded-sm border border-neutral-300 p-4`}
      >
        {openJob ? (
          <SiteJobDetails job={openJob} companyName={payload.externalName} />
        ) : (
          <div className={styles.company}>
            <div className={styles.header}>
              <span>
                <h2 className={styles.companyName}>{payload.externalName}</h2>
                <h3 className={styles.companyStatus}>
                  {partnershipLabel(payload.partnershipType)}
                </h3>
              </span>
              <div className={styles.image}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt={`Logo ${payload.externalName}`}
                  onError={() => setLogoFailed(true)}
                />
              </div>
            </div>
            <div className={styles.companyDescription}>
              <Markdown>{payload.description || payload.externalName}</Markdown>
            </div>
            {jobs.length > 0 ? (
              <div className={styles.companyJobs}>
                <h3>Oferty pracy</h3>
                {jobs.map((job) => (
                  <a
                    key={job.id}
                    href={`#oferta-${job.id}`}
                    className={styles.jobEntry}
                    onClick={(event) => {
                      event.preventDefault();
                      setOpenJobId(job.id);
                    }}
                  >
                    <h4>{job.title}</h4>
                    <span>(aplikuj)</span>
                  </a>
                ))}
              </div>
            ) : null}
            <div className={styles.maps}>
              <SiteHallMap
                stand={payload.stand.firstDay}
                day={1}
                layout={hallMap?.day1}
              />
              <SiteHallMap
                stand={payload.stand.secondDay}
                day={2}
                layout={hallMap?.day2}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
