"use client";

import { RouteGuard } from "@/components/auth/RouteGuard";
import { Header } from "@/components/layout/Header";
import { useTranslation } from "@/lib/i18n";
import { useFormStatus } from "@/hooks/use-form-status";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { Company } from "@/lib/types";

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { companyId } = useFormStatus();

  // Fetch company data to check if stands are assigned
  const { data: company } = useSWR<Company>(
    companyId ? `/api/company/${companyId}/` : null,
    fetcher
  );

  // Check if company has at least one stand assigned
  const hasStandAssigned =
    company?.day1_stand?.stand_number || company?.day2_stand?.stand_number;

  const navItems = [
    {
      title: t("exhibitor.navigation.dashboard"),
      url: "/panel/exhibitor",
    },
    {
      title: t("exhibitor.navigation.forms"),
      url: "/panel/exhibitor/forms",
    },
    {
      title: t("exhibitor.navigation.faq"),
      url: "/panel/exhibitor/faq",
    },
    // Only show map if company has at least one stand assigned
    ...(hasStandAssigned
      ? [
          {
            title: t("exhibitor.navigation.map"),
            url: "/panel/exhibitor/map",
          },
        ]
      : []),
  ];

  return (
    <RouteGuard allowedUserTypes={["company"]}>
      <div className="flex h-screen flex-col overflow-hidden">
        <Header navigationItems={navItems} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </RouteGuard>
  );
}
