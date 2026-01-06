"use client";

import { RouteGuard } from "@/components/auth/RouteGuard";
import { Header } from "@/components/layout/Header";
import { useTranslation } from "@/lib/i18n";

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

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
