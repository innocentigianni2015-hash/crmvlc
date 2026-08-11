import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CRMVLC — CRM Operativo",
    short_name: "CRMVLC",
    description: "CRM, contratti, sponsor, distribuzione e rete commerciale per le cinque isole.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#071a2b",
    theme_color: "#071a2b",
    lang: "it",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/crmvlc-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/crmvlc-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/crmvlc-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
