"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { getUserInfo, clearTokens, getUserRoute } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { LanguageSelector } from "@/components/layout/LanguageSelector/LanguageSelector";
import { HeaderUserCard } from "@/components/layout/HeaderUserCard";
import { ACCENT_COLOR, STAFF_ACCENT_COLOR } from "@/lib/colors";

export interface NavigationItem {
  title: string;
  url: string;
}

interface HeaderProps {
  navigationItems?: NavigationItem[];
}

export function Header({ navigationItems }: HeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();

  const userInfo = getUserInfo();

  const handleLogout = () => {
    clearTokens();
    router.push("/auth/login");
  };

  if (!userInfo) {
    return null;
  }

  // Use pink theme for staff/admin, orange for exhibitor
  const isStaff = userInfo.type === "admin" || userInfo.type === "staff";
  const accentColor = isStaff ? STAFF_ACCENT_COLOR : ACCENT_COLOR;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="w-full flex flex-col">
        {/* Top row: Logo, Navigation, User Menu */}
        <div
          className="w-full flex h-16 items-center justify-between px-6"
          style={{ paddingRight: "calc(1.5rem + (100vw - 100%))" }}
        >
          {/* Logo */}
          <Link
            href={getUserRoute(userInfo?.type || null)}
            className="flex items-center"
          >
            <Image
              src="/images/ITP_LOGO_horizontal_black.png"
              alt="ITP Logo"
              width={200}
              height={60}
              className="h-auto w-auto max-h-10 object-contain"
              priority
            />
          </Link>

          {/* Navigation - only shown if navigationItems are provided */}
          {navigationItems && navigationItems.length > 0 && (
            <nav className="flex items-center gap-1">
              {navigationItems.map((item) => {
                const isActive = pathname === item.url;
                return (
                  <Link
                    key={item.url}
                    href={item.url}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                      isActive
                        ? "text-white"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    style={
                      isActive
                        ? {
                            backgroundColor: accentColor,
                          }
                        : {
                            backgroundColor: "transparent",
                          }
                    }
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = `${accentColor}14`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    {item.title}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Right side: Language Selector and User Menu */}
          <div className="flex items-center gap-3">
            <LanguageSelector accentColor={accentColor} />

            {/* User Account Card */}
            <HeaderUserCard
              email={userInfo.email}
              username={userInfo.username}
              onLogout={handleLogout}
              accentColor={accentColor}
            />
          </div>
        </div>
      </div>
    </header>
  );
}


