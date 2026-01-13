"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "@/lib/i18n";
import { ACCENT_COLOR, STAFF_ACCENT_COLOR } from "@/lib/colors";

interface ThemeToggleProps {
  accentColor?: string;
}

export function ThemeToggle({ accentColor = ACCENT_COLOR }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  // Avoid hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-2"
        disabled
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  // Use resolvedTheme to get the actual theme (light/dark) even when theme is "system"
  const resolvedThemeValue = resolvedTheme === "dark" ? "dark" : "light";
  // Use theme to check which option is selected (could be "light", "dark", or "system")
  const selectedTheme = theme === "dark" ? "dark" : "light";

  const handleThemeChange = (newTheme: "light" | "dark") => {
    setTheme(newTheme);
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
          {resolvedThemeValue === "dark" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="end">
        <div className="p-4 pb-2">
          <h4 className="text-sm font-medium">{t("theme.title")}</h4>
        </div>
        <div className="grid gap-2 p-2">
          <Button
            variant={selectedTheme === "light" ? "default" : "outline"}
            className={`justify-start gap-3 ${selectedTheme === "light" ? "text-white" : ""}`}
            style={
              selectedTheme === "light"
                ? {
                    backgroundColor: accentColor,
                    borderColor: accentColor,
                  }
                : undefined
            }
            onClick={() => handleThemeChange("light")}
            onMouseEnter={(e) => {
              if (selectedTheme !== "light") {
                e.currentTarget.style.borderColor = accentColor;
                e.currentTarget.style.color = accentColor;
              }
            }}
            onMouseLeave={(e) => {
              if (selectedTheme !== "light") {
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.color = "";
              }
            }}
          >
            <Sun className="h-4 w-4" />
            <span>{t("theme.light")}</span>
            {selectedTheme === "light" && (
              <span className="ml-auto text-xs opacity-60">✓</span>
            )}
          </Button>
          <Button
            variant={selectedTheme === "dark" ? "default" : "outline"}
            className={`justify-start gap-3 ${selectedTheme === "dark" ? "text-white" : ""}`}
            style={
              selectedTheme === "dark"
                ? {
                    backgroundColor: accentColor,
                    borderColor: accentColor,
                  }
                : undefined
            }
            onClick={() => handleThemeChange("dark")}
            onMouseEnter={(e) => {
              if (selectedTheme !== "dark") {
                e.currentTarget.style.borderColor = accentColor;
                e.currentTarget.style.color = accentColor;
              }
            }}
            onMouseLeave={(e) => {
              if (selectedTheme !== "dark") {
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.color = "";
              }
            }}
          >
            <Moon className="h-4 w-4" />
            <span>{t("theme.dark")}</span>
            {selectedTheme === "dark" && (
              <span className="ml-auto text-xs opacity-60">✓</span>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

