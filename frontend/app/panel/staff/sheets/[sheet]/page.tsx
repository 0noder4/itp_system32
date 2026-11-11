"use client";

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { ChevronLeft } from "lucide-react";
import { fetcher } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { STAFF_ACCENT_COLOR } from "@/lib/colors";
import { Header } from "@/components/layout/Header";
import { Skeleton } from "@/components/ui/skeleton";
import { SheetTabView } from "@/components/staff/Sheets/SheetTabView";
import { useStaffNav } from "@/hooks/useStaffNav";
import type { SheetCatalogEntry } from "@/lib/sheets/types";

function readTabFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("tab");
}

export default function SheetPage() {
  const { t } = useTranslation();
  const navItems = useStaffNav();
  const params = useParams<{ sheet: string }>();
  const sheetKey = params.sheet;
  const { data: catalog, error, isLoading } = useSWR<SheetCatalogEntry[]>("/api/sheets/", fetcher);
  const sheet = catalog?.find((s) => s.key === sheetKey);
  const [tabKey, setTabKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!sheet || tabKey) return;
    const fromUrl = readTabFromUrl();
    setTabKey(sheet.tabs.some((tab) => tab.key === fromUrl) ? fromUrl : (sheet.tabs[0]?.key ?? null));
  }, [sheet, tabKey]);

  const selectTab = (key: string) => {
    setTabKey(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header navigationItems={navItems} />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          {catalog && catalog.length > 1 && (
            <Link
              href="/panel/staff/sheets"
              className="flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("sheets.title")}
            </Link>
          )}
          <h1 className="text-xl font-semibold tracking-tight">{sheet?.title ?? t("sheets.title")}</h1>
          {sheet?.scoped && <span className="text-xs text-muted-foreground">{t("sheets.scopedHint")}</span>}
          {/* SheetTabView portals Eksportuj + Ustawienia here (right side). */}
          <div id="sheet-header-actions" className="ml-auto flex items-center gap-2" />
        </div>

        {isLoading && <Skeleton className="h-[60vh] w-full" />}
        {error && <p className="text-destructive">{t("sheets.loadError")}</p>}
        {catalog && !sheet && <p className="text-muted-foreground">{t("sheets.notFound")}</p>}

        {sheet && tabKey && (
          <>
            <div className="min-h-0 flex-1">
              <SheetTabView
                key={`${sheet.key}:${tabKey}`}
                sheetKey={sheet.key}
                tabKey={tabKey}
                tabs={sheet.tabs}
                mineFilter={sheet.key === "opiekun" && !sheet.scoped}
              />
            </div>
            {sheet.tabs.length > 1 && (
              <nav className="flex shrink-0 gap-1 overflow-x-auto border-t pt-1" aria-label={t("sheets.tabs")}>
                {sheet.tabs.map((tab) => {
                  const active = tab.key === tabKey;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => selectTab(tab.key)}
                      className={cn(
                        "whitespace-nowrap rounded-b-md border border-t-0 px-3 py-1 text-sm",
                        active ? "bg-background font-semibold" : "bg-muted text-muted-foreground hover:text-foreground"
                      )}
                      style={active ? { borderBottomColor: STAFF_ACCENT_COLOR, borderBottomWidth: 2 } : undefined}
                    >
                      {tab.title}
                    </button>
                  );
                })}
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
