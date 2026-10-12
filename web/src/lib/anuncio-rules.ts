import { enlaceValido } from "@/lib/banner-rules";
import { localMxToIso } from "@/lib/dates";

// Anuncios del sitio, de cada obra y de la Fan Zone (0074). Funciones puras: anuncio-rules.test.ts.

export type AnuncioLugar = "inicio" | "obra" | "fanzone";
export type AnuncioTipo = "elenco" | "convocatoria" | "fechas" | "funcion" | "preventa" | "general";

export const TIPOS_ANUNCIO: Record<AnuncioTipo, string> = {
  elenco: "Revelación del elenco",
  convocatoria: "Convocatoria",
  fechas: "Fechas",
  funcion: "Nueva función",
  preventa: "Preventa",
  general: "Anuncio",
};

export const LUGARES_ANUNCIO: Record<AnuncioLugar, string> = {
  inicio: "Inicio del sitio",
  obra: "Página de la obra",
  fanzone: "Fan Zone",
};

/** Lo que entrega anuncios_publicos (sin contenido si todavía no se revela o es del club). */
export type Anuncio = {
  id: string;
  lugar: AnuncioLugar;
  production_id: string | null;
  tipo: AnuncioTipo;
  titulo: string;
  adelanto: string | null;
  contenido: string | null;
  imagen_path: string | null;
  enlace: string | null;
  boton: string | null;
  revela_at: string | null;
  solo_club: boolean;
  registro: boolean;
  revelado: boolean;
  bloqueado: boolean;
  apuntado: boolean;
};

export type AnuncioFila = {
  lugar: AnuncioLugar;
  production_id: string | null;
  tipo: AnuncioTipo;
  titulo: string;
  adelanto: string | null;
  contenido: string | null;
  imagen_path: string | null;
  enlace: string | null;
  boton: string | null;
  revela_at: string | null;
  termina: string | null;
  registro: boolean;
  solo_club: boolean;
  publicado: boolean;
};

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/**
 * Lee el formulario del panel y arma la fila, o explica qué falta.
 * `lugares` son los que esta persona puede usar aquí; `pid` la obra (si es de una obra).
 */
export function leerAnuncio(f: FormData, lugares: AnuncioLugar[], pid: string | null): { ok: true; fila: AnuncioFila } | { ok: false; message: string } {
  const lugar = txt(f, "lugar") as AnuncioLugar;
  if (!lugares.includes(lugar)) return { ok: false, message: "Elige dónde se muestra el anuncio." };
  if (lugar === "obra" && !pid) return { ok: false, message: "Un anuncio de obra necesita la obra." };
  const tipo = txt(f, "tipo") as AnuncioTipo;
  if (!(tipo in TIPOS_ANUNCIO)) return { ok: false, message: "Elige el tipo de anuncio." };
  const titulo = txt(f, "titulo");
  if (!titulo) return { ok: false, message: "Escribe un título." };
  if (titulo.length > 120) return { ok: false, message: "El título es muy largo (máximo 120)." };
  const adelanto = txt(f, "adelanto") || null;
  if (adelanto && adelanto.length > 400) return { ok: false, message: "El adelanto es muy largo (máximo 400)." };
  const contenido = txt(f, "contenido") || null;
  if (contenido && contenido.length > 2000) return { ok: false, message: "El contenido es muy largo (máximo 2000)." };
  let enlace = txt(f, "enlace") || null;
  if (enlace && !enlace.startsWith("/") && !enlace.includes("://")) enlace = `https://${enlace}`;
  if (enlace && !enlaceValido(enlace)) return { ok: false, message: "La liga no es válida. Usa https://… o una dirección del sitio como /audiciones." };
  const boton = txt(f, "boton").slice(0, 30) || null;
  if (boton && !enlace) return { ok: false, message: "El botón necesita una liga." };
  const revelaTxt = txt(f, "revela_at");
  const revela_at = revelaTxt ? localMxToIso(revelaTxt) : null;
  if (revelaTxt && !revela_at) return { ok: false, message: "Revisa la fecha de revelación." };
  const terminaTxt = txt(f, "termina");
  const termina = terminaTxt ? localMxToIso(terminaTxt) : null;
  if (terminaTxt && !termina) return { ok: false, message: "Revisa la fecha para ocultarlo." };
  if (termina && revela_at && termina <= revela_at) return { ok: false, message: "La fecha para ocultarlo debe ser después de la revelación." };
  const registro = f.get("registro") === "1";
  if (registro && !revela_at) return { ok: false, message: "Para el botón \"Avísame\" pon una fecha de revelación." };
  if (!contenido && !adelanto) return { ok: false, message: "Escribe el adelanto o el contenido." };
  return {
    ok: true,
    fila: {
      lugar,
      production_id: pid,
      tipo,
      titulo,
      adelanto,
      contenido,
      imagen_path: txt(f, "imagen_path") || null,
      enlace,
      boton,
      revela_at,
      termina,
      registro,
      solo_club: f.get("solo_club") === "1",
      publicado: f.get("publicado") === "1",
    },
  };
}
