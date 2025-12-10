"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Company } from "@/lib/types";
import { useTranslation } from "@/lib/i18n";

export default function Index() {
  const { t, locale } = useTranslation();
  const { data, error, isLoading } = useSWR<Company[]>(
    "/api/companies/",
    fetcher
  );

  if (isLoading) {
    return <div>{t("common.loading")}</div>;
  }

  if (error) {
    console.log(error);
    return <div>{t("companies.loadError")}</div>;
  }

  if (!data || data.length === 0) {
    return <div>{t("companies.noCompaniesFound")}</div>;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(
      locale === "pl" ? "pl-PL" : "en-US"
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t("companies.title")}</h1>
      <div className="space-y-4">
        {data.map((company) => (
          <div
            key={company.id}
            className="border rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <h2 className="text-xl font-semibold">{company.name}</h2>
            <p className="text-gray-600">
              {t("companies.table.email")}: {company.email}
            </p>
            <p className="text-sm text-gray-500">
              {t("companies.table.status")}:{" "}
              {t(`companies.status.${company.status as "main" | "partner" | "basic"}`)}
            </p>
            <p className="text-xs text-gray-400">
              {t("companies.table.createdAt")}: {formatDate(company.created_at)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
