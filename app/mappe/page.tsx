"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { platformOwnership, usePlatformLanguage } from "../i18n";

type Point = { id: string; name: string; island: string; address: string; latitude: number; longitude: number };
type Directory = { points: Point[]; islands: string[] };

const copy = {
  it: { title: "Punti di distribuzione", intro: "Trova i punti autorizzati di Vivi Le Canarie nelle cinque isole.", all: "Tutte le isole", directions: "Indicazioni", empty: "Nessun punto autorizzato in questa selezione.", back: "Torna al sito", crm: "Accesso CRM" },
  es: { title: "Puntos de distribución", intro: "Encuentra los puntos autorizados de Vivi Le Canarie en las cinco islas.", all: "Todas las islas", directions: "Cómo llegar", empty: "No hay puntos autorizados en esta selección.", back: "Volver al sitio", crm: "Acceso CRM" },
  en: { title: "Distribution points", intro: "Find authorised Vivi Le Canarie points across the five islands.", all: "All islands", directions: "Directions", empty: "No authorised points in this selection.", back: "Back to website", crm: "CRM access" },
} as const;

export default function PublicDistributionMap() {
  const { locale, setLocale } = usePlatformLanguage();
  const t = copy[locale];
  const [data, setData] = useState<Directory>({ points: [], islands: [] });
  const [island, setIsland] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = island ? `?island=${encodeURIComponent(island)}` : "";
      const response = await fetch(`/api/public/distribution-points${query}`);
      if (!response.ok) throw new Error("map_unavailable");
      const next = await response.json() as Directory;
      setData(next);
      setSelectedPoint(next.points[0] ?? null);
    } catch { setError("Mappa temporaneamente non disponibile."); }
    finally { setLoading(false); }
  }, [island]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const mapUrl = openStreetMapEmbed(selectedPoint);

  return <main className="public-map-page">
    <header className="public-map-header">
      <Link href="/" className="public-map-brand"><Image src="/brand/viv-le-canarie-icon.svg" alt="Vivi Le Canarie" width={58} height={58} /></Link>
      <nav><Link href="/">{t.back}</Link><Link href="/login">{t.crm}</Link><div className="map-language">{(["it", "es", "en"] as const).map((language) => <button key={language} className={locale === language ? "active" : ""} onClick={() => setLocale(language)}>{language.toUpperCase()}</button>)}</div></nav>
    </header>
    <section className="public-map-hero"><small>VIV! · CANARIAS</small><h1>{t.title}</h1><p>{t.intro}</p><select value={island} onChange={(event) => setIsland(event.target.value)}><option value="">{t.all}</option>{data.islands.map((item) => <option key={item}>{item}</option>)}</select></section>
    <section className="public-map-layout">
      <iframe className="public-map-canvas" src={mapUrl} title={selectedPoint ? `${t.title}: ${selectedPoint.name}` : t.title} loading="eager" referrerPolicy="no-referrer" />
      <div className="public-map-list">{loading ? <p>Caricamento…</p> : error ? <p className="map-error">{error}</p> : data.points.length ? data.points.map((point) => <article key={point.id} className={selectedPoint?.id === point.id ? "selected" : ""} onClick={() => setSelectedPoint(point)}><span>{point.island}</span><h2>{point.name}</h2><p>{point.address}</p><a href={`https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{t.directions} ↗</a></article>) : <p>{t.empty}</p>}</div>
    </section>
    <footer className="public-map-footer">{platformOwnership(locale)}</footer>
  </main>;
}

function openStreetMapEmbed(point: Point | null): string {
  if (!point) return "https://www.openstreetmap.org/export/embed.html?bbox=-18.3%2C27.3%2C-13.0%2C29.6&layer=mapnik";
  const bbox = [point.longitude - .025, point.latitude - .018, point.longitude + .025, point.latitude + .018].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`;
}
