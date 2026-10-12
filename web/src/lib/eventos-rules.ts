// Eventos de DARF (0081): por función, presenciales y en línea; para el Club Fan, para quien tenga
// cuenta o públicos. Funciones puras: eventos-rules.test.ts.

export type TipoEvento = "funcion" | "presencial" | "en_linea";
export type AccesoEvento = "club" | "cuenta" | "publico";

export const TIPOS_EVENTO: Record<TipoEvento, { label: string; ayuda: string }> = {
  funcion: { label: "Por función", ayuda: "Ligado a una función: foto con el elenco, tour por backstage, early access…" },
  presencial: { label: "Presencial", ayuda: "Con fecha y lugar, sin función: ensayo abierto, meet & greet, showcase…" },
  en_linea: { label: "En línea", ayuda: "Transmisión exclusiva, lanzamiento, preventa… La liga se ve 15 min antes y durante." },
};

/** Sugerencias por tipo (se puede escribir otra). */
export const CATEGORIAS: Record<TipoEvento, string[]> = {
  funcion: ["Foto con el elenco", "Tour por backstage", "Early access", "Ensayo general abierto", "Charla con el elenco"],
  presencial: ["Ensayo abierto", "Meet & greet", "Showcase", "Firma de autógrafos", "Taller"],
  en_linea: ["Transmisión exclusiva", "Lanzamiento", "Preventa", "Estreno de video", "En vivo con el elenco"],
};

export const ACCESO_EVENTO: Record<AccesoEvento, { label: string; corto: string }> = {
  club: { label: "Solo Club Fan", corto: "Club Fan" },
  cuenta: { label: "Cualquiera con cuenta", corto: "Con cuenta" },
  publico: { label: "Público (cualquier persona)", corto: "Público" },
};

/** Lo que llega de fan_encuentros_lista. */
export type Evento = {
  id: string; production_id: string | null; obra: string | null; performance_id: string | null; tipo: TipoEvento;
  categoria: string | null; titulo: string; descripcion: string | null; lugar: string | null;
  starts_at: string; termina: string; venue: string | null; cupo: number | null; libres: number | null;
  abierto: boolean; notas: string | null; requiere_registro: boolean; requiere_boleto: boolean; acceso: AccesoEvento;
  apartado: boolean; con_boleto: boolean; recordar: boolean; en_vivo: boolean; liga: string | null;
};

/** Qué puede hacer quien ve el evento (botón principal). */
export type AccionEvento = "entrar" | "esperar_liga" | "apartar" | "liberar" | "lleno" | "cerrado" | "boleto" | "entrar_sesion" | "unirse_club" | "recordar" | "sin_registro";
export function accionEvento(e: Evento, ctx: { sesion: boolean; socio: boolean }): AccionEvento {
  if (e.tipo === "en_linea") {
    if (e.requiere_registro && !e.apartado) return !ctx.sesion ? "entrar_sesion" : e.acceso === "club" && !ctx.socio ? "unirse_club" : e.libres === 0 ? "lleno" : !e.abierto ? "cerrado" : "apartar";
    if (e.liga) return "entrar";
    return ctx.sesion ? "recordar" : "esperar_liga";
  }
  if (!e.requiere_registro) return ctx.sesion ? "recordar" : "sin_registro";
  if (!ctx.sesion) return "entrar_sesion";
  if (e.acceso === "club" && !ctx.socio) return "unirse_club";
  if (e.apartado) return "liberar";
  if (!e.abierto) return "cerrado";
  if (e.libres === 0) return "lleno";
  if (!e.con_boleto) return "boleto";
  return "apartar";
}

/** Fecha y hora local (CDMX) que espera un <input type="datetime-local"> y viceversa: lib/dates.ts. */
