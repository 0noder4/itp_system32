"use client";

import { useTranslation } from "@/lib/i18n";
import { LanguageSelector } from "@/components/layout/LanguageSelector/LanguageSelector";

export default function Index() {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{t("dashboard.partner.title")}</h1>
        <LanguageSelector />
      </div>
      <p className="text-muted-foreground">
        {t("dashboard.partner.description")}
      </p>
    </div>
  );
}
