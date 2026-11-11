"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Sheet } from "lucide-react";
import { fetcher } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Header } from "@/components/layout/Header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useStaffNav } from "@/hooks/useStaffNav";
import type { SheetCatalogEntry } from "@/lib/sheets/types";

export default function SheetsIndexPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const navItems = useStaffNav();
  const { data, error, isLoading } = useSWR<SheetCatalogEntry[]>("/api/sheets/", fetcher);
  const soleSheet = data?.length === 1 ? data[0] : null;

  React.useEffect(() => {
    if (soleSheet) router.replace(`/panel/staff/sheets/${soleSheet.key}`);
  }, [soleSheet, router]);

  // Loading / single-sheet redirect: keep chrome only — no empty "Arkusze" flash.
  if (isLoading || soleSheet) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header navigationItems={navItems} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header navigationItems={navItems} />
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">{t("sheets.title")}</h1>
          <p className="text-muted-foreground">{t("sheets.description")}</p>
        </div>
        {error && <p className="text-destructive">{t("sheets.loadError")}</p>}
        {data && data.length === 0 && <p className="text-muted-foreground">{t("sheets.noSheets")}</p>}
        {data && data.length > 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.map((sheet) => {
              // Opiekun: single tab "Moje firmy" only repeats the card title — omit on the index.
              const tabLine =
                sheet.key === "opiekun" && sheet.tabs.length === 1
                  ? ""
                  : sheet.tabs.map((tab) => tab.title).join(" · ");
              const description =
                tabLine || sheet.scoped
                  ? `${tabLine}${sheet.scoped ? `${tabLine ? " — " : ""}${t("sheets.scopedHint")}` : ""}`
                  : null;
              return (
                <Link key={sheet.key} href={`/panel/staff/sheets/${sheet.key}`}>
                  <Card className="h-full transition-colors hover:bg-muted/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Sheet className="h-5 w-5" />
                        {sheet.title}
                      </CardTitle>
                      {description ? <CardDescription>{description}</CardDescription> : null}
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
