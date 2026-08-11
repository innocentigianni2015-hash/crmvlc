import type { Metadata } from "next";
import PublicLanding from "../public-landing";

export const metadata: Metadata = {
  title: "Vivi Le Canarie — Pubblicità e Podcast",
  description: "Pubblicità sulla rivista Vivi Le Canarie e format podcast per aziende nelle cinque isole.",
};

export default function LandingPage() {
  return <PublicLanding />;
}
