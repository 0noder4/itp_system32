"use client";

import React from "react";
import { getSheetsHomePath, getStaffRoles, getUserType } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";

/**
 * Top navigation for the staff area.
 * FR: Panel FR, Arkusze, Mapa. LG/Opiekun: Arkusze, Mapa. TR: Arkusze.
 * Roles are read after mount so server and client render the same first pass.
 * Pure opiekun/TR get a direct sheet URL so "Arkusze" does not flash the empty index.
 */
export function useStaffNav() {
  const { t } = useTranslation();
  const [roles, setRoles] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    const read = () => setRoles(getStaffRoles());
    read();
    window.addEventListener("tokens-changed", read);
    return () => window.removeEventListener("tokens-changed", read);
  }, []);

  const allow = (role: string) => {
    if (roles === null) return true;
    if (getUserType() === "admin") return true;
    return roles.includes(role);
  };

  const items: { title: string; url: string }[] = [];
  if (allow("fr")) items.push({ title: t("companies.title"), url: "/panel/staff" });
  items.push({ title: t("sheets.title"), url: roles === null ? "/panel/staff/sheets" : getSheetsHomePath() });
  if (allow("fr") || allow("lg") || allow("opiekun")) {
    items.push({ title: t("staff.map.title"), url: "/panel/staff/map" });
  }
  return items;
}
