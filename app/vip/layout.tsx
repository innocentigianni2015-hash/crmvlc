import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VIP Pass | Vivi le Canarie",
  description: "Scopri vantaggi e coupon esclusivi degli sponsor Vivi le Canarie nelle cinque isole.",
  manifest: "/vip.webmanifest",
  themeColor: "#f33e30",
  icons: { icon: "/brand/viv-le-canarie-icon.svg", apple: "/brand/viv-le-canarie-icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "VLC VIP Pass" },
};

export default function VipLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
