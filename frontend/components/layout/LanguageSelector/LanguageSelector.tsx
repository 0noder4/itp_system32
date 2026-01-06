"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import { useLanguage, type Locale } from "@/lib/i18n";
import { apiClient } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ACCENT_COLOR, STAFF_ACCENT_COLOR } from "@/lib/colors";

const languages: { code: Locale; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
];

interface LanguageSelectorProps {
  accentColor?: string;
}

export function LanguageSelector({ accentColor = ACCENT_COLOR }: LanguageSelectorProps) {
  const { locale, setLocale, t } = useLanguage();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const currentLanguage = languages.find((lang) => lang.code === locale);

  const handleLanguageChange = async (newLocale: Locale) => {
    if (newLocale === locale) {
      setIsOpen(false);
      return;
    }

    setIsUpdating(true);

    // Update context and localStorage immediately
    setLocale(newLocale);

    // If user is authenticated, update the backend
    const token = getAccessToken();
    if (token) {
      try {
        await apiClient.put("/api/users/language/", { language: newLocale });
      } catch (error) {
        // Silently fail - language is already saved locally
        console.error("Failed to update language preference on server:", error);
      }
    }

    setIsUpdating(false);
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = `${accentColor}14`;
            e.currentTarget.style.color = accentColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "";
            e.currentTarget.style.color = "";
          }}
        >
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{currentLanguage?.flag}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="end">
        <div className="p-4 pb-2">
          <h4 className="text-sm font-medium">{t("language.title")}</h4>
        </div>
        <div className="grid gap-2 p-2">
          {languages.map((lang) => {
            const isActive = locale === lang.code;
            return (
              <Button
                key={lang.code}
                variant={isActive ? "default" : "outline"}
                className={`justify-start gap-3 ${isActive ? "text-white" : ""}`}
                style={
                  isActive
                    ? {
                        backgroundColor: accentColor,
                        borderColor: accentColor,
                      }
                    : undefined
                }
                onClick={() => handleLanguageChange(lang.code)}
                disabled={isUpdating}
                onMouseEnter={(e) => {
                  if (!isActive && !isUpdating) {
                    e.currentTarget.style.borderColor = accentColor;
                    e.currentTarget.style.color = accentColor;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = "";
                    e.currentTarget.style.color = "";
                  }
                }}
              >
                <span className="text-lg">{lang.flag}</span>
                <span>{lang.label}</span>
                {isActive && (
                  <span className="ml-auto text-xs opacity-60">✓</span>
                )}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
