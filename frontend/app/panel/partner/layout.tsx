"use client";

import { RouteGuard } from "@/components/auth/RouteGuard";

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard allowedUserTypes={["company"]}>
      <div>{children}</div>
    </RouteGuard>
  );
}

