import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRMVLC — CRM Operativo",
  description: "Il sistema operativo commerciale di Vivi le Canarie.",
  applicationName: "CRMVLC",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "CRMVLC" },
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
