"use client";

import React from "react";
import { useTranslation } from "@/lib/i18n";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { ACCENT_COLOR } from "@/lib/colors";
import type { UserType } from "@/lib/auth";

interface HeaderUserCardProps {
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  userType?: UserType;
  onLogout: () => void;
  accentColor?: string;
}

function getFullName(firstName?: string, lastName?: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function getPrimaryLabel(
  userType: UserType | undefined,
  username: string,
  email: string,
  firstName?: string,
  lastName?: string
): string {
  if (userType === "admin" || userType === "staff") {
    const fullName = getFullName(firstName, lastName);
    if (fullName) return fullName;
  }
  if (username) return username;
  if (email) return email;
  return "—";
}

function getInitials(
  userType: UserType | undefined,
  username: string,
  email: string,
  firstName?: string,
  lastName?: string
): string {
  if (userType === "admin" || userType === "staff") {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    if (first || last) return `${first}${last}`.toUpperCase();
  }
  if (username) return username.charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return "?";
}

export function HeaderUserCard({
  email,
  username,
  firstName = "",
  lastName = "",
  userType,
  onLogout,
  accentColor = ACCENT_COLOR,
}: HeaderUserCardProps) {
  const { t } = useTranslation();
  const primaryLabel = getPrimaryLabel(
    userType,
    username,
    email,
    firstName,
    lastName
  );
  const initials = getInitials(userType, username, email, firstName, lastName);
  const showEmailBelow = Boolean(email && email !== primaryLabel);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          className="cursor-pointer transition-colors p-3 rounded-md"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = `${accentColor}14`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
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
              <p className="text-sm font-medium truncate">{primaryLabel}</p>
              {showEmailBelow && (
                <p className="text-xs text-muted-foreground truncate">
                  {email}
                </p>
              )}
            </div>
          </div>
        </div>
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
              <p className="font-semibold text-lg truncate">{primaryLabel}</p>
              {showEmailBelow && (
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
          </div>
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
        </div>
      </PopoverContent>
    </Popover>
  );
}
