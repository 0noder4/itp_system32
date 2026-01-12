"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { formatDate } from "./Companies/utils";
import { ACCENT_COLOR, STAFF_ACCENT_COLOR } from "@/lib/colors";
import { getUserInfo } from "@/lib/auth";

interface UserAccountCardProps {
  name: string | null;
  surname: string | null;
  email: string | null;
  username?: string | null;
  dateJoined?: string | null;
  phoneNumber?: string | null;
  showLogout?: boolean;
  onLogout?: () => void;
}

function getInitials(
  name: string | null,
  surname: string | null,
  email: string | null
): string {
  const firstInitial = name ? name.charAt(0).toUpperCase() : "";
  const lastInitial = surname ? surname.charAt(0).toUpperCase() : "";

  if (firstInitial && lastInitial) {
    return `${firstInitial}${lastInitial}`;
  }
  if (firstInitial) {
    return firstInitial;
  }
  if (lastInitial) {
    return lastInitial;
  }
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  return "?";
}

function getDisplayName(
  name: string | null,
  surname: string | null,
  email: string | null
): string {
  if (name && surname) {
    return `${name} ${surname}`;
  }
  if (name) {
    return name;
  }
  if (surname) {
    return surname;
  }
  if (email) {
    return email;
  }
  return "—";
}

export function UserAccountCard({
  name,
  surname,
  email,
  username,
  dateJoined,
  phoneNumber,
  showLogout = false,
  onLogout,
}: UserAccountCardProps) {
  const { t, locale } = useTranslation();
  const displayName = getDisplayName(name, surname, email);
  const initials = getInitials(name, surname, email);

  // Determine accent color based on logged-in user type
  const userInfo = getUserInfo();
  const isStaff = userInfo?.type === "admin" || userInfo?.type === "staff";
  const accentColor = isStaff ? STAFF_ACCENT_COLOR : ACCENT_COLOR;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Card
          className="cursor-pointer transition-colors p-3"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = `${accentColor}14`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "";
          }}
        >
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8">
              <AvatarFallback
                className="text-xs font-medium text-white"
                style={{ backgroundColor: accentColor }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              {email && (
                <p className="text-xs text-muted-foreground truncate">
                  {email}
                </p>
              )}
            </div>
          </div>
        </Card>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarFallback
                className="text-xl font-medium text-white"
                style={{ backgroundColor: accentColor }}
              >
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg truncate">{displayName}</p>
              {email && (
                <p className="text-sm text-muted-foreground truncate">
                  {email}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-3 pt-2 border-t">
            {username && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t("userAccountCard.username")}
                </p>
                <p className="text-sm">{username}</p>
              </div>
            )}
            {email && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t("userAccountCard.email")}
                </p>
                <p className="text-sm">{email}</p>
              </div>
            )}
            {phoneNumber && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t("userAccountCard.phoneNumber")}
                </p>
                <p className="text-sm">{phoneNumber}</p>
              </div>
            )}
            {dateJoined && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t("userAccountCard.dateJoined")}
                </p>
                <p className="text-sm">{formatDate(dateJoined, locale)}</p>
              </div>
            )}
          </div>
          {showLogout && onLogout && (
            <div className="pt-3 border-t">
              <Button
                variant="outline"
                className="w-full"
                onClick={onLogout}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = accentColor;
                  e.currentTarget.style.color = accentColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "";
                  e.currentTarget.style.color = "";
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t("common.logout")}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
