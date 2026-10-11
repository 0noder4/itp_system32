import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { LanguageProvider } from "@/lib/i18n";
import { EditionProvider } from "@/components/layout/EditionProvider";
import { ThemeProvider } from "next-themes";
import {
  DEFAULT_EDITION_NUMBER,
  appFullName,
  appShortName,
} from "@/lib/edition";
import "./globals.css";

const fullName = appFullName(DEFAULT_EDITION_NUMBER);
const shortName = appShortName(DEFAULT_EDITION_NUMBER);

export const metadata: Metadata = {
  title: fullName,
  description: `${fullName} - Management System for Engineering Job Fair`,
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
    { name: "Edgar Jonak" },
  ],
  creator: "Bartosz Kuklewski",
  publisher: "Bartosz Kuklewski",
  applicationName: fullName,
  keywords: [
    "Engineering Job Fair",
    shortName,
    "Management System",
    "Targi Pracy",
  ],
  openGraph: {
    title: fullName,
    description: `${fullName} - Management System for Engineering Job Fair`,
    url: "https://system.targipracy.org.pl",
    siteName: fullName,
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
            <EditionProvider>
              <main>{children}</main>
              <Toaster />
            </EditionProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
