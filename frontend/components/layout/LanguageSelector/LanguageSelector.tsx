"use client";

import * as React from "react";
import { Globe } from "lucide-react";
import { useLanguage, type Locale } from "@/lib/i18n";
import { apiClient } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const languages: { code: Locale; label: string; flag: string }[] = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "pl", label: "Polski", flag: "🇵🇱" },
];

export function LanguageSelector() {
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Globe className="h-4 w-4" />
          <span className="hidden sm:inline">{currentLanguage?.flag}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[300px]">
        <DialogHeader>
          <DialogTitle>{t("language.title")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          {languages.map((lang) => (
            <Button
              key={lang.code}
              variant={locale === lang.code ? "default" : "outline"}
              className="justify-start gap-3"
              onClick={() => handleLanguageChange(lang.code)}
              disabled={isUpdating}
            >
              <span className="text-lg">{lang.flag}</span>
              <span>{lang.label}</span>
              {locale === lang.code && (
                <span className="ml-auto text-xs opacity-60">✓</span>
              )}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

