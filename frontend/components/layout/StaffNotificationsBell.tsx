"use client";

import React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Bell } from "lucide-react";
import { apiClient, fetcher } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { SheetNotificationsResponse } from "@/lib/sheets/comments";
import { cn } from "@/lib/utils";

const POLL_MS = 30000;

export function StaffNotificationsBell({ accentColor }: { accentColor: string }) {
  const { t } = useTranslation();
  const { data, mutate } = useSWR<SheetNotificationsResponse>(
    "/api/sheets/notifications/",
    fetcher,
    { refreshInterval: POLL_MS, revalidateOnFocus: true }
  );
  const unread = data?.unread_count ?? 0;
  const items = data?.items ?? [];

  const markRead = async (ids?: number[]) => {
    try {
      await apiClient.post("/api/sheets/notifications/read/", ids ? { ids } : { all: true });
      await mutate();
    } catch {
      /* ignore */
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          title={t("sheets.notifications.title")}
          aria-label={t("sheets.notifications.title")}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
              style={{ backgroundColor: accentColor }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{t("sheets.notifications.title")}</p>
          {unread > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => void markRead()}
            >
              {t("sheets.notifications.markAll")}
            </button>
          )}
        </div>
        <ul className="max-h-80 overflow-auto">
          {items.length === 0 && (
            <li className="px-3 py-4 text-sm text-muted-foreground">
              {t("sheets.notifications.empty")}
            </li>
          )}
          {items.map((item) => (
            <li key={item.id} className={cn("border-b last:border-0", !item.read_at && "bg-muted/40")}>
              <Link
                href={item.url}
                className="block px-3 py-2 text-sm hover:bg-muted/60"
                onClick={() => {
                  if (!item.read_at) void markRead([item.id]);
                }}
              >
                <div className="text-xs text-muted-foreground">
                  {item.author?.label || t("sheets.someoneElse")}
                  {item.target_label ? ` · ${item.target_label}` : ""}
                </div>
                <div className="line-clamp-2">{item.body_preview}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(item.created_at).toLocaleString("pl-PL")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
