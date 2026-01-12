"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { isAuthenticated, getUserType, getUserRoute } from "@/lib/auth";
import { ACCENT_COLOR } from "@/lib/colors";

export default function NotFound() {
  const router = useRouter();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = React.useState(true);
  const [homeRoute, setHomeRoute] = React.useState("/");
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  React.useEffect(() => {
    // Determine the home route based on authentication status
    if (isAuthenticated()) {
      const userType = getUserType();
      const dashboardRoute = getUserRoute(userType);
      setHomeRoute(dashboardRoute);
    } else {
      setHomeRoute("/auth/login");
    }
    setIsLoading(false);
  }, []);

  React.useEffect(() => {
    // Check for dark mode preference
    if (typeof window === "undefined") return;

    const checkDarkMode = () => {
      const htmlElement = document.documentElement;
      const hasDarkClass = htmlElement.classList.contains("dark");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDarkMode(hasDarkClass || prefersDark);
    };

    checkDarkMode();

    // Listen for dark mode changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => checkDarkMode();
    mediaQuery.addEventListener("change", handleChange);

    // Watch for class changes on html element
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      observer.disconnect();
    };
  }, []);

  const handleGoHome = () => {
    router.push(homeRoute);
  };

  const handleGoBack = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  const logoSrc = isDarkMode
    ? "/images/ITP_LOGO_horizontal_white.png"
    : "/images/ITP_LOGO_horizontal_black.png";

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="max-w-md w-full px-6 py-8 text-center">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Link href={homeRoute} className="mb-6">
            <Image
              src={logoSrc}
              alt="ITP Logo"
              width={200}
              height={60}
              className="h-auto w-auto max-h-12 object-contain"
              priority
            />
          </Link>
        </div>

        {/* 404 Content */}
        <div className="mb-8">
          <h1
            className="text-9xl font-bold mb-4"
            style={{ color: ACCENT_COLOR }}
          >
            404
          </h1>
          <h2 className="text-3xl font-semibold text-foreground mb-2">
            {t("notFound.title")}
          </h2>
          <p className="text-muted-foreground text-lg">
            {t("notFound.description")}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
          <Button
            onClick={handleGoHome}
            size="lg"
            className="w-full sm:w-auto"
            style={{
              backgroundColor: ACCENT_COLOR,
              color: "#ffffff",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#E04E15";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = ACCENT_COLOR;
            }}
          >
            {t("notFound.goHome")}
          </Button>
          <Button
            onClick={handleGoBack}
            variant="outline"
            size="lg"
            className="w-full sm:w-auto"
          >
            {t("notFound.backButton")}
          </Button>
        </div>

        {/* Footer Link */}
        <div className="mt-8 pt-6 border-t border-border">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("common.appName")}
          </Link>
        </div>
      </div>
    </div>
  );
}

