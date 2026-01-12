"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { getUserInfo } from "@/lib/auth"
import { ACCENT_COLOR, STAFF_ACCENT_COLOR } from "@/lib/colors"
import React, { useEffect, useState } from "react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const [accentColor, setAccentColor] = useState(ACCENT_COLOR)

  useEffect(() => {
    // Determine accent color based on logged-in user type
    const userInfo = getUserInfo()
    const isStaff = userInfo?.type === "admin" || userInfo?.type === "staff"
    setAccentColor(isStaff ? STAFF_ACCENT_COLOR : ACCENT_COLOR)
  }, [])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": accentColor,
          "--success-bg": "var(--popover)",
          "--success-border": accentColor,
          "--info-bg": "var(--information)",
          "--info-border": "var(--information)",
          "--info-text": "var(--information-foreground)",
          "--warning-bg": "var(--warning)",
          "--warning-border": "var(--warning)",
          "--warning-text": "var(--warning-foreground)",
          "--error-bg": "var(--danger)",
          "--error-border": "var(--danger)",
          "--error-text": "var(--danger-foreground)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "!font-sans",
          title: "!font-semibold",
          description: "!opacity-90",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
