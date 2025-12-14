"use client";

import * as React from "react";
import enMessages from "@/translations/en.json";
import plMessages from "@/translations/pl.json";

export type Locale = "en" | "pl";

const messages: Record<Locale, typeof enMessages> = {
  en: enMessages,
  pl: plMessages,
};

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = React.createContext<LanguageContextType | undefined>(
  undefined
);

const STORAGE_KEY = "system32_language";

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path; // Return the key if not found
    }
  }

  return typeof current === "string" ? current : path;
}

function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;

  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return key in params ? String(params[key]) : `{${key}}`;
  });
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>("en");
  const [isHydrated, setIsHydrated] = React.useState(false);

  // Load language from localStorage on mount
  React.useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "pl") {
      setLocaleState(stored);
    }
    setIsHydrated(true);
  }, []);

  const setLocale = React.useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(STORAGE_KEY, newLocale);
    // Update the html lang attribute
    document.documentElement.lang = newLocale;
  }, []);

  const t = React.useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const message = getNestedValue(
        messages[locale] as unknown as Record<string, unknown>,
        key
      );
      return interpolate(message, params);
    },
    [locale]
  );

  // Update html lang attribute when locale changes
  React.useEffect(() => {
    if (isHydrated) {
      document.documentElement.lang = locale;
    }
  }, [locale, isHydrated]);

  const value = React.useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = React.useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

export function useTranslation() {
  const { t, locale } = useLanguage();
  return { t, locale };
}

// Helper to set language from user profile (used after login)
export function setLanguageFromProfile(language: string) {
  if (language === "en" || language === "pl") {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }
}

// Helper to get stored language
export function getStoredLanguage(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "pl" ? "pl" : "en";
}
