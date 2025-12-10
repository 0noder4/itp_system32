"use client";

import { RouteGuard } from "@/components/auth/RouteGuard";

export default function FRSystemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RouteGuard allowedUserTypes={["admin", "staff"]}>
      <div>{children}</div>
    </RouteGuard>
  );
}
