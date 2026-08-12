import type { Metadata } from "next";
import CareersPage from "../careers-page";

export const metadata: Metadata = {
  title: "Lavora con noi — Vivi Le Canarie",
  description: "Candidati come commerciale di Vivi Le Canarie nella tua isola.",
};

export default function WorkWithUsPage() {
  return <CareersPage />;
}
