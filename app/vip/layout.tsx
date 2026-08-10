import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VIP Pass | Vivi le Canarie",
  description: "Scopri vantaggi e coupon esclusivi degli sponsor Vivi le Canarie nelle cinque isole.",
  manifest: "/vip.webmanifest",
  themeColor: "#10382f",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "VLC VIP Pass" },
};

export default function VipLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
