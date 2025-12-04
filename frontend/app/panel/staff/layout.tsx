"use client";

import { usePathname } from "next/navigation";
import { SystemSidebar } from "@/components/layout/SystemSidebar/SystemSidebar";
import { BreadcrumbNavigation } from "@/components/layout/BreadcrumbNavigation/BreadcrumbNavigation";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { RouteGuard } from "@/components/auth/RouteGuard";

export default function FRSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const routes = [
    {
      title: "Company management",
      url: "#",
      items: [
        {
          title: "Company List",
          url: "/panel/fr/companies",
        },
        {
          title: "Create company",
          url: "/panel/fr/companies/create",
        },
      ],
    },
  ];

  return (
    <RouteGuard allowedUserTypes={["admin", "staff"]}>
      <div>{children}</div>
    </RouteGuard>
  );
}
