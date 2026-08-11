import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CRMVLC — Vivi le Canarie",
    short_name: "CRMVLC",
    description: "CRM, contratti, sponsor, distribuzione e rete commerciale per le cinque isole.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f33e30",
    theme_color: "#f33e30",
    lang: "it",
    categories: ["business", "productivity"],
    icons: [
      { src: "/brand/viv-le-canarie-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/viv-le-canarie-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
