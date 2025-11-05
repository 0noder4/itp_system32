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
    <SidebarProvider>
      <SystemSidebar routes={routes} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <BreadcrumbNavigation routes={routes} pathname={pathname} />
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
