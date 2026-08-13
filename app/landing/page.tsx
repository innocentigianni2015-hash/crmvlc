import type { Metadata } from "next";
import PublicLanding from "../public-landing";

const title = "Vivi Le Canarie — Publicidad y Pódcast en Canarias";
const description =
  "Haz visible tu empresa en Canarias con Vivi Le Canarie: revista, pódcast y campañas para negocios locales en cinco islas.";

export const metadata: Metadata = {
  metadataBase: new URL("https://crmvlc.com"),
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_ES",
    url: "/",
    siteName: "Vivi Le Canarie",
    title,
    description,
    images: [
      {
        url: "/brand/vlc-social-share.jpg",
        width: 1200,
        height: 630,
        alt: "Vivi Le Canarie — revista, pódcast y publicidad en Canarias",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/brand/vlc-social-share.jpg"],
  },
};

export default function LandingPage() {
  return <PublicLanding />;
}
