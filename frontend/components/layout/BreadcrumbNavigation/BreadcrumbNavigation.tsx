"use client";

import * as React from "react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type Routes = {
  title: string;
  url: string;
  items: { title: string; url: string }[];
}[];

// Route title mapping for breadcrumbs
const routeTitleMap: Record<string, string> = {
  panel: "Panel",
  fr: "FR",
  companies: "Companies",
  create: "Create",
};

type BreadcrumbNavigationProps = {
  routes: Routes;
  pathname: string;
};

export function BreadcrumbNavigation({
  routes,
  pathname,
}: BreadcrumbNavigationProps) {
  // Generate breadcrumb items from pathname
  const generateBreadcrumbs = (): Array<{
    title: string;
    href: string;
    isLast: boolean;
  }> => {
    const pathSegments = pathname.split("/").filter(Boolean);
    const breadcrumbs: Array<{
      title: string;
      href: string;
      isLast: boolean;
    }> = [];

    // Create a flat map of all route URLs to titles for quick lookup
    const routeMap: Record<string, string> = {};
    routes.forEach((group) => {
      group.items.forEach((item) => {
        routeMap[item.url] = item.title;
      });
    });

    // Build path incrementally for each segment
    let currentPath = "";
    pathSegments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === pathSegments.length - 1;

      // First try to get title from route map, then from title map, then capitalize
      const title =
        routeMap[currentPath] ||
        routeTitleMap[segment] ||
        segment.charAt(0).toUpperCase() + segment.slice(1);

      breadcrumbs.push({
        title,
        href: currentPath,
        isLast,
      });
    });

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={crumb.href}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className={index === 0 ? "hidden md:block" : ""}>
              {crumb.isLast ? (
                <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.title}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
