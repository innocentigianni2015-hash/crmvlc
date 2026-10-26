"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { platformOwnership, usePlatformLanguage } from "../i18n";

const MARKER_ICON_URL = "/leaflet/marker-icon.png";
const MARKER_ICON_2X_URL = "/leaflet/marker-icon-2x.png";
const MARKER_SHADOW_URL = "/leaflet/marker-shadow.png";

type Point = { id: string; name: string; island: string; address: string; latitude: number; longitude: number };
type Directory = { points: Point[]; islands: string[] };

const copy = {
  it: { title: "Punti di distribuzione", intro: "Trova i punti autorizzati di Vivi Le Canarie nelle cinque isole.", all: "Tutte le isole", directions: "Indicazioni", empty: "Nessun punto autorizzato in questa selezione.", back: "Torna al sito", crm: "Accesso CRM" },
  es: { title: "Puntos de distribución", intro: "Encuentra los puntos autorizados de Vivi Le Canarie en las cinco islas.", all: "Todas las islas", directions: "Cómo llegar", empty: "No hay puntos autorizados en esta selección.", back: "Volver al sitio", crm: "Acceso CRM" },
  en: { title: "Distribution points", intro: "Find authorised Vivi Le Canarie points across the five islands.", all: "All islands", directions: "Directions", empty: "No authorised points in this selection.", back: "Back to website", crm: "CRM access" },
} as const;

const CANARY_CENTER: [number, number] = [28.5, -15.6];

export default function PublicDistributionMap() {
  const { locale, setLocale } = usePlatformLanguage();
  const t = copy[locale];
  const [data, setData] = useState<Directory>({ points: [], islands: [] });
  const [island, setIsland] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map());

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = island ? `?island=${encodeURIComponent(island)}` : "";
      const response = await fetch(`/api/public/distribution-points${query}`);
      if (!response.ok) throw new Error("map_unavailable");
      const next = await response.json() as Directory;
      setData(next);
      setSelectedPointId(next.points[0]?.id ?? null);
    } catch { setError("Mappa temporaneamente non disponibile."); }
    finally { setLoading(false); }
  }, [island]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  // Create the map once, on the client only.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !mapContainerRef.current || mapRef.current) return;
      const L = leaflet.default ?? leaflet;
      delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({ iconUrl: MARKER_ICON_URL, iconRetinaUrl: MARKER_ICON_2X_URL, shadowUrl: MARKER_SHADOW_URL });
      const map = L.map(mapContainerRef.current, { scrollWheelZoom: true }).setView(CANARY_CENTER, 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Redraw every marker whenever the point list changes (filter, reload).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      const map = mapRef.current;
      if (cancelled || !map) return;
      const L = leaflet.default ?? leaflet;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current.clear();
      data.points.forEach((point) => {
        const marker = L.marker([point.latitude, point.longitude]).addTo(map);
        marker.bindPopup(
          `<strong>${escapeHtml(point.name)}</strong><br>${escapeHtml(point.address)}<br><a href="https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}" target="_blank" rel="noopener noreferrer">${t.directions} ↗</a>`,
        );
        marker.on("click", () => setSelectedPointId(point.id));
        markersRef.current.set(point.id, marker);
      });
      if (data.points.length === 1) {
        map.setView([data.points[0].latitude, data.points[0].longitude], 15);
      } else if (data.points.length > 1) {
        const bounds = L.latLngBounds(data.points.map((point) => [point.latitude, point.longitude] as [number, number]));
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
      } else {
        map.setView(CANARY_CENTER, 7);
      }
    })();
    return () => { cancelled = true; };
  }, [data.points, t.directions]);

  function selectPoint(point: Point) {
    setSelectedPointId(point.id);
    const map = mapRef.current;
    const marker = markersRef.current.get(point.id);
    if (map && marker) {
      map.setView([point.latitude, point.longitude], Math.max(map.getZoom(), 14));
      marker.openPopup();
    }
  }

  return <main className="public-map-page">
    <header className="public-map-header">
      <Link href="/" className="public-map-brand"><Image src="/brand/viv-le-canarie-icon.svg" alt="Vivi Le Canarie" width={58} height={58} /></Link>
      <nav><Link href="/">{t.back}</Link><Link href="/login">{t.crm}</Link><div className="map-language">{(["it", "es", "en"] as const).map((language) => <button key={language} className={locale === language ? "active" : ""} onClick={() => setLocale(language)}>{language.toUpperCase()}</button>)}</div></nav>
    </header>
    <section className="public-map-hero"><small>VIV! · CANARIAS</small><h1>{t.title}</h1><p>{t.intro}</p><select value={island} onChange={(event) => setIsland(event.target.value)}><option value="">{t.all}</option>{data.islands.map((item) => <option key={item}>{item}</option>)}</select></section>
    <section className="public-map-layout">
      <div className="public-map-canvas" ref={mapContainerRef} role="img" aria-label={t.title} />
      <div className="public-map-list">{loading ? <p>Caricamento…</p> : error ? <p className="map-error">{error}</p> : data.points.length ? data.points.map((point) => <article key={point.id} className={selectedPointId === point.id ? "selected" : ""} onClick={() => selectPoint(point)}><span>{point.island}</span><h2>{point.name}</h2><p>{point.address}</p><a href={`https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{t.directions} ↗</a></article>) : <p>{t.empty}</p>}</div>
    </section>
    <footer className="public-map-footer">{platformOwnership(locale)}</footer>
  </main>;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
