import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/login",
    name: "CRMVLC — Vivi le Canarie",
    short_name: "CRMVLC",
    description: "CRM, contratos, patrocinadores, distribución y red comercial para las cinco islas.",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f33e30",
    theme_color: "#f33e30",
    lang: "es",
    categories: ["business", "productivity"],
    icons: [
      { src: "/brand/viv-le-canarie-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/viv-le-canarie-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
