"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LogOut, ChevronDown } from "lucide-react";
import { getUserInfo, clearTokens } from "@/lib/auth";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LanguageSelector } from "@/components/layout/LanguageSelector/LanguageSelector";

export function DashboardHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const userInfo = getUserInfo();

  // Close menu when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false);
      }
    }

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleLogout = () => {
    clearTokens();
    router.push("/auth/login");
  };

  if (!userInfo) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div
        className="w-full flex h-16 items-center justify-between px-6"
        style={{ paddingRight: "calc(1.5rem + (100vw - 100%))" }}
      >
        {/* Logo */}
        <div className="flex items-center">
          <Image
            src="/images/ITP_LOGO_horizontal_black.png"
            alt="ITP Logo"
            width={200}
            height={60}
            className="h-auto w-auto max-h-12 object-contain"
            priority
          />
        </div>

        {/* Right side: Language Selector and User Menu */}
        <div className="flex items-center gap-3">
          <LanguageSelector />

          {/* User Menu */}
          <div className="relative">
            <Button
              ref={buttonRef}
              variant="ghost"
              className="flex items-center"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-expanded={isMenuOpen}
              aria-haspopup="true"
            >
              <span className="font-medium">{userInfo.username}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  isMenuOpen && "rotate-180"
                )}
              />
            </Button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div
                ref={menuRef}
                className="absolute right-0 mt-2 w-48 rounded-md border bg-popover text-popover-foreground shadow-md z-50"
              >
                <div className="p-1">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("common.logout")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
