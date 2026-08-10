import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VLC OS — Vivi le Canarie",
    short_name: "VLC OS",
    description: "CRM, contratti, sponsor, distribuzione e rete commerciale per le cinque isole.",
    start_url: "/",
    display: "standalone",
    background_color: "#071a2b",
    theme_color: "#071a2b",
    lang: "it",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
