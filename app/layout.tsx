import type { Metadata } from "next";
import "./globals.css";
import "./public-landing.css";

export const metadata: Metadata = {
  title: "CRMVLC — Vivi le Canarie",
  description: "CRM, contratti e operatività commerciale di Vivi le Canarie.",
  applicationName: "CRMVLC",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/brand/viv-le-canarie-icon.svg", apple: "/brand/viv-le-canarie-icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CRMVLC" },
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
