"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { getUserRoute, getUserType, hasStaffRole } from "@/lib/auth";

function pathAllowed(pathname: string): boolean {
  if (getUserType() === "admin") return true;
  const frArea =
    pathname === "/panel/staff" ||
    pathname.startsWith("/panel/staff/companies") ||
    pathname.startsWith("/panel/staff/invitations");
  if (frArea) return hasStaffRole("fr");
  if (pathname.startsWith("/panel/staff/map")) {
    return hasStaffRole("fr") || hasStaffRole("lg") || hasStaffRole("opiekun");
  }
  return true;
}

function StaffRoleGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [blocked, setBlocked] = React.useState(false);

  React.useEffect(() => {
    if (!pathAllowed(pathname)) {
      setBlocked(true);
      router.replace(getUserRoute(getUserType()));
    } else {
      setBlocked(false);
    }
  }, [pathname, router]);

  if (blocked) return null;
  return <>{children}</>;
}

export default function FRSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard allowedUserTypes={["admin", "staff"]}>
      <StaffRoleGuard>{children}</StaffRoleGuard>
    </RouteGuard>
  );
}
