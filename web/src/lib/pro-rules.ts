import { parseYoutube } from "@/lib/youtube";

// Perfil profesional (0057). Puro, con pruebas en pro-rules.test.ts.

export type Trayecto = { obra: string; papel: string; compania: string; anio: string };
export type Habilidades = { canto?: string; baile?: string[]; instrumentos?: string[]; aereos?: string[]; acrobacia?: string[]; idiomas?: string[]; otras?: string[] };
export type ProProfile = {
  person_id: string; slug: string; publico: boolean; tutor_autorizado_at: string | null;
  retrato_path: string | null; semblanza: string | null; trayectoria: Trayecto[]; habilidades: Habilidades;
  instagram: string | null; tiktok: string | null; youtube: string | null; reel_url: string | null;
};

export const TESITURAS = ["Soprano", "Mezzosoprano", "Contralto", "Tenor", "Barítono", "Bajo"];
export const LISTAS: { key: Exclude<keyof Habilidades, "canto">; label: string; ejemplo: string }[] = [
  { key: "baile", label: "Baile", ejemplo: "Jazz, ballet, contemporáneo, hip hop, tap" },
  { key: "instrumentos", label: "Instrumentos", ejemplo: "Piano, guitarra, violín" },
  { key: "aereos", label: "Aéreos", ejemplo: "Tela, aro, trapecio, straps" },
  { key: "acrobacia", label: "Acrobacia", ejemplo: "Parada de manos, flic flac" },
  { key: "idiomas", label: "Idiomas", ejemplo: "Inglés, francés" },
  { key: "otras", label: "Otras", ejemplo: "Combate escénico, malabares" },
];

/** "Jazz, ballet,  jazz" → ["Jazz", "ballet"] (sin repetidos, máx. 20, cada uno ≤ 40). */
export function parseList(v: string): string[] {
  const out: string[] = [];
  for (const x of v.split(/[,\n]/).map((s) => s.trim().slice(0, 40)).filter(Boolean)) {
    if (!out.some((o) => o.toLowerCase() === x.toLowerCase())) out.push(x);
    if (out.length === 20) break;
  }
  return out;
}

/** "@ana.p", "instagram.com/ana.p/" o "ana.p" → "ana.p". */
export function usuarioRed(v: string): string | null {
  const s = v.trim().replace(/^https?:\/\/(www\.)?[^/]+\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,60}$/.test(s) ? s : null;
}

/** Filas de trayectoria del formulario → lista limpia (máx. 60). Año opcional entre 1950 y el próximo. */
export function trayectoriaDe(rows: Trayecto[], hoy: Date = new Date()): { ok: true; items: Trayecto[] } | { ok: false; message: string } {
  const items = rows
    .map((r) => ({ obra: r.obra.trim().slice(0, 120), papel: r.papel.trim().slice(0, 120), compania: r.compania.trim().slice(0, 120), anio: r.anio.trim() }))
    .filter((r) => r.obra);
  for (const r of items) {
    const y = Number(r.anio);
    if (r.anio && (!/^\d{4}$/.test(r.anio) || y < 1950 || y > hoy.getFullYear() + 1)) return { ok: false, message: `Revisa el año de “${r.obra}”.` };
  }
  return items.length > 60 ? { ok: false, message: "Máximo 60 obras en la trayectoria." } : { ok: true, items };
}

/** Enlace https (reel o canal); null si está vacío. */
/** Trayectoria de la más reciente a la más antigua; sin año, al final en el orden capturado. */
export function ordenarTrayectoria(items: Trayecto[]): Trayecto[] {
  const anio = (t: Trayecto) => Number(/\d{4}/.exec(t.anio ?? "")?.[0] ?? NaN);
  return items.map((t, i) => ({ t, i, y: anio(t) }))
    .sort((a, b) => (Number.isNaN(a.y) ? 1 : 0) - (Number.isNaN(b.y) ? 1 : 0) || (b.y - a.y || 0) || a.i - b.i)
    .map((x) => x.t);
}

export function httpsOrNull(v: string): string | null | false {
  const s = v.trim();
  if (!s) return null;
  return /^https:\/\/\S+$/i.test(s) && s.length <= 300 ? s : false;
}

/** Id de YouTube del reel para incrustarlo (si es de YouTube). */
export const reelYoutube = (url: string | null) => (url ? parseYoutube(url) : null);
