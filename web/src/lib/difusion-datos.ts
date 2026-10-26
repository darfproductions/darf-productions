import type { FuncionDifusion } from "@/lib/difusion-rules";
import { getCapa } from "@/lib/obra-capa";
import { capaDifusion } from "@/lib/obra-capa-rules";
import { assetUrl } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

// Datos de la obra para los diseños de difusión (0111).

export type FuncionObra = FuncionDifusion & { id: string };
export type ObraDifusion = {
  nombre: string;
  venue: string | null;
  logoUrl: string | null;
  /** Imagen de ambiente; si no hay, el póster sin textos de su formato. */
  fondo: { post: string | null; historia: string | null };
  /** Póster limpio 3:4 y 9:16 (diseños de preventa: el póster de fondo); si falta, el ambiente. */
  poster: { p3x4: string | null; p9x16: string | null };
  /** Imagen de ambiente tal cual (o null). */
  ambiente: string | null;
  /** Póster alterno sin textos ni logo (0124): fondo de la invitación. */
  alterno: { p3x4: string | null; p9x16: string | null };
  /** Fechas de la preventa del Club Fan de la obra (0118). */
  preventa: { desde: string | null; hasta: string | null };
  colores: { fondo: string; superficie: string; texto: string; acento: string };
  funciones: FuncionObra[];
  /** Secciones tomadas de los cambios sin publicar (pósters, kit, datos, colores): Difusión lo avisa. */
  usaBorrador: string[];
};

export async function getObraDifusion(pid: string): Promise<ObraDifusion | null> {
  const supabase = await createClient();
  const [{ data: pub }, { data: fs }, capa] = await Promise.all([
    supabase.from("productions").select("nombre, venue, color_fondo, color_superficie, color_texto, color_acento, logo_path, ambiente_path, poster_3x4_path, poster_9x16_path, poster_alt_3x4_path, poster_alt_9x16_path, preventa_desde, preventa_hasta").eq("id", pid).maybeSingle(),
    supabase.from("performances").select("id, starts_at, venue, preventa_hasta, preventa_desde").eq("production_id", pid).is("cancelada_at", null).order("starts_at"),
    // 2026-10-25: los diseños se preparan antes de publicar; usan lo más nuevo que subió el equipo (borrador, 0119).
    getCapa(pid, "borrador").catch(() => ({})),
  ]);
  if (!pub) return null;
  const { obra: p, usa } = capaDifusion(pub as Record<string, unknown>, capa);
  const url = (x: unknown) => (typeof x === "string" && x ? assetUrl(x) : null);
  const ambiente = url(p.ambiente_path);
  return {
    nombre: p.nombre as string,
    venue: (p.venue as string | null) ?? null,
    logoUrl: url(p.logo_path),
    fondo: { post: ambiente ?? url(p.poster_3x4_path), historia: ambiente ?? url(p.poster_9x16_path) },
    poster: { p3x4: url(p.poster_3x4_path) ?? ambiente, p9x16: url(p.poster_9x16_path) ?? url(p.poster_3x4_path) ?? ambiente },
    ambiente,
    alterno: { p3x4: url(p.poster_alt_3x4_path), p9x16: url(p.poster_alt_9x16_path) },
    preventa: { desde: (p.preventa_desde as string | null) ?? null, hasta: (p.preventa_hasta as string | null) ?? null },
    colores: {
      fondo: (p.color_fondo as string) ?? "#0b0a12", superficie: (p.color_superficie as string) ?? "#16141f",
      texto: (p.color_texto as string) ?? "#f4f1f8", acento: (p.color_acento as string) ?? "#a48bff",
    },
    funciones: (fs ?? []) as FuncionObra[],
    usaBorrador: usa,
  };
}

/** Función por omisión: la próxima; si ya pasaron todas, la última. */
export function funcionPorOmision(funciones: FuncionObra[], hoy: Date = new Date()): FuncionObra | null {
  return funciones.find((f) => new Date(f.starts_at) >= hoy) ?? funciones.at(-1) ?? null;
}
