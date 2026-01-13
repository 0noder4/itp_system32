import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/lib/i18n";
import { ThemeProvider } from "next-themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engineering Job Fair System 32",
  description:
    "Engineering Job Fair System 32 - Management System for Engineering Job Fair",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
  authors: [
    { name: "Bartosz Kuklewski" },
    { name: "Patrycja Lubowiecka" },
    { name: "Dominika Zarzycka" },
    { name: "Norbert Roszkowski" },
  ],
  creator: "Bartosz Kuklewski",
  publisher: "Bartosz Kuklewski",
  applicationName: "Engineering Job Fair System 32",
  keywords: [
    "Engineering Job Fair",
    "System 32",
    "Management System",
    "Targi Pracy",
  ],
  openGraph: {
    title: "Engineering Job Fair System 32",
    description:
      "Engineering Job Fair System 32 - Management System for Engineering Job Fair",
    url: "https://system.targipracy.org.pl",
    siteName: "Engineering Job Fair System 32",
    locale: "pl_PL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <LanguageProvider>
            <main>{children}</main>
            <Toaster />
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
