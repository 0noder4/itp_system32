"use client";

import React from "react";
import Markdown from "react-markdown";
import styles from "./sitePreview.module.scss";

export type CataloguePreviewJob = {
  id: number;
  title: string;
  workModel: string;
  workModelKey: string;
  employmentType: string;
  employmentTypeKey: string;
  contract: string;
  contractKey: string;
  outline: string;
  benefits: string;
  requirements: string;
  contact: string;
};

// Same (unescaped dot included) as targus JobDetails.tsx.
const MAIL_REGEX = new RegExp("^[^@]+@[^@]+.[^@]+$");

export function isMailContact(value: string): boolean {
  return MAIL_REGEX.test(value);
}

export function contactHref(value: string): string {
  return isMailContact(value) ? `mailto:${value}` : value;
}

/** On the website a non-mail contact is used verbatim as href. */
export function contactWorksOnWebsite(value: string): boolean {
  if (!value) return true;
  return isMailContact(value) || /^https?:\/\//i.test(value);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      <div className={styles.sectionContent}>{children}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <div className={styles.tag}>{children}</div>;
}

type Props = {
  job: CataloguePreviewJob;
  companyName: string;
};

// Port of targus components/jobs/JobDetails/JobDetails.tsx (cities are not collected in the system,
// so the website subtitle shows only the company name).
export function SiteJobDetails({ job, companyName }: Props) {
  const { title, workModel, employmentType, contract, outline, benefits, requirements, contact } =
    job;

  return (
    <div className={styles.job}>
      <div>
        <h2 className={styles.jobTitle}>{title}</h2>
        <h3 className={styles.jobSubtitle}>
          <span>{companyName || "Nieznana firma"}</span>
        </h3>
      </div>
      {workModel && (
        <Section title="Forma">
          <Tag>{workModel}</Tag>
        </Section>
      )}
      {employmentType && (
        <Section title="Etat">
          <Tag>{employmentType}</Tag>
        </Section>
      )}
      {contract && (
        <Section title="Umowa">
          <Tag>{contract}</Tag>
        </Section>
      )}
      {outline && (
        <Section title="Opis">
          <span>
            <Markdown>{outline}</Markdown>
          </span>
        </Section>
      )}
      {benefits && (
        <Section title="Benefity">
          <span>
            <Markdown>{benefits}</Markdown>
          </span>
        </Section>
      )}
      {requirements && (
        <Section title="Wymagania">
          <span>
            <Markdown>{requirements}</Markdown>
          </span>
        </Section>
      )}
      {contact && (
        <div className={styles.apply}>
          {isMailContact(contact) ? <label>Aplikuj przez [{contact}]</label> : ""}
          <a
            href={contactHref(contact)}
            target="_blank"
            rel="noreferrer"
            className={styles.linkButtonContainer}
          >
            <button type="button" className={`${styles.button} ${styles.orange}`}>
              Aplikuj
            </button>
          </a>
        </div>
      )}
    </div>
  );
}
