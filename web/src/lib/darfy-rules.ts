// DARFY, el asistente de DARF (sin IA, decisión de Diego 2026-10-12). Funciones puras para
// poder probarlas: darfy-rules.test.ts. Solo usa información pública (preguntas frecuentes,
// cartelera y audiciones). Si no está seguro, responde "nose" y la web ofrece WhatsApp o el
// formulario. Cuando se conecte una IA, este mismo contexto es lo que se le pasará.

import type { EstadoPublico } from "./home-rules";
import { conPunto } from "@/lib/dates";

export type FaqItem = { id: string; pregunta: string; respuesta: string; palabras: string[]; liga: string | null };
export type ObraInfo = {
  id: string;
  nombre: string;
  estado: EstadoPublico;
  venue: string | null;
  /** Funciones próximas ya con formato ("sábado 14 de noviembre, 18:00 · Teatro X"). */
  funciones: string[];
  /** Precios por zona ya con formato ("VIP $500 · General $350"), o null. */
  precios: string | null;
};
export type AudicionInfo = { id: string; titulo: string; obra: string | null; cierra: string | null };
export type DarfyContexto = {
  faq: FaqItem[];
  obras: ObraInfo[];
  audiciones: AudicionInfo[];
  registro: { id: string } | null;
};
export type Liga = { href: string; label: string };
export type Respuesta = { tipo: "faq" | "dato" | "nose"; texto: string; ligas: Liga[] };

const VACIAS = new Set(
  ("a al algo algun alguna como con cual cuales de del el en es esa ese esta este hay la las le lo los me mi mis " +
    "o para por que quiero quisiera saber se si su sus te tienen tiene tu un una uno y ya yo puedo puede hola " +
    "favor gracias buenas buenos dias tardes noches ustedes usted ver hacer").split(" "),
);

/** Texto en minúsculas, sin acentos ni signos. */
export function limpiar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
}

/** Palabras importantes de un texto (sin acentos ni palabras vacías). */
export function normalizar(texto: string): string[] {
  return limpiar(texto).split(" ").filter((w) => w.length > 1 && !VACIAS.has(w));
}

/** Raíz sencilla para comparar plural/singular ("boletos" ≈ "boleto", "funciones" ≈ "funcion"). */
function raiz(w: string): string {
  if (w.length > 5 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** La obra que se menciona en la pregunta (por nombre o por siglas: "hsm"). */
export function detectarObra(pregunta: string, obras: ObraInfo[]): ObraInfo | null {
  const palabras = new Set(normalizar(pregunta).map(raiz));
  const texto = ` ${limpiar(pregunta)} `;
  let mejor: { obra: ObraInfo; puntos: number } | null = null;
  for (const o of obras) {
    const nombre = normalizar(o.nombre).filter((w) => w.length > 2);
    if (!nombre.length) continue;
    const siglas = limpiar(o.nombre).split(" ").filter(Boolean).map((w) => w[0]).join("");
    let puntos = nombre.filter((w) => palabras.has(raiz(w))).length / nombre.length;
    if (siglas.length >= 3 && texto.includes(` ${siglas} `)) puntos = 1;
    if (puntos >= 0.5 && (!mejor || puntos > mejor.puntos)) mejor = { obra: o, puntos };
  }
  return mejor?.obra ?? null;
}

/** Pregunta frecuente que mejor coincide y sus puntos (palabra clave = 2, palabra de la pregunta = 1). */
export function mejorFaq(pregunta: string, faq: FaqItem[]): { item: FaqItem; puntos: number } | null {
  const palabras = new Set(normalizar(pregunta).map(raiz));
  if (!palabras.size) return null;
  let mejor: { item: FaqItem; puntos: number } | null = null;
  for (const f of faq) {
    const claves = new Set(f.palabras.flatMap((p) => normalizar(p)).map(raiz));
    const propias = new Set(normalizar(f.pregunta).map(raiz));
    let puntos = 0;
    for (const w of palabras) {
      if (claves.has(w)) puntos += 2;
      else if (propias.has(w)) puntos += 1;
    }
    if (puntos > 0 && (!mejor || puntos > mejor.puntos)) mejor = { item: f, puntos };
  }
  return mejor;
}

const tiene = (texto: string, re: RegExp) => re.test(` ${limpiar(texto)} `);
const RE_SALUDO = /^ *(hola|holi|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal) *$/;
const RE_GRACIAS = /^ *(muchas )?(gracias|grax|thank you|thanks|ok gracias|perfecto gracias) *$/;
const RE_PRECIO = / (precio|precios|cuesta|cuestan|costo|costos|cuanto|vale|valen|zonas?) /;
const RE_SOLO_PRECIO = / (precio|precios|cuesta|cuestan|costo|costos|vale|valen) /;
const RE_LUGAR = / (donde|lugar|teatro|direccion|ubicacion|sede|llego|llegar) /;
const RE_AUDICION = / (audicion|audiciones|audicionar|casting|castings|convocatoria|convocatorias) /;
const RE_CARTELERA = / (cartelera|obras?|producciones|produccion|musicales?|funciones|funcion|estrenos?|proximas?|que hay|en escena|fechas|horarios?) /;

const FUERTE = 3;
const MINIMO = 2;

function ligaObra(o: ObraInfo): Liga[] {
  return o.estado === "cartelera"
    ? [{ href: `/producciones/${o.id}#funciones`, label: "Comprar boletos" }, { href: `/producciones/${o.id}`, label: `Ver ${o.nombre}` }]
    : [{ href: `/producciones/${o.id}`, label: `Ver ${o.nombre}` }];
}

function respuestaObra(o: ObraInfo, pregunta: string, ctx: DarfyContexto): Respuesta {
  if (tiene(pregunta, RE_AUDICION)) {
    const suyas = ctx.audiciones.filter((a) => a.obra === o.nombre);
    if (suyas.length) return respuestaAudiciones(suyas, ctx.registro);
    return {
      tipo: "dato",
      texto: `Por ahora no hay convocatoria abierta para ${o.nombre}.` + (ctx.registro ? " Puedes dejar tus datos en el Registro permanente de talento." : ""),
      ligas: ctx.registro ? [{ href: `/audiciones/${ctx.registro.id}`, label: "Registro permanente" }] : [{ href: "/audiciones", label: "Ver audiciones" }],
    };
  }
  if (o.estado === "archivo") {
    return { tipo: "dato", texto: `${o.nombre} ya concluyó su temporada. Puedes revivirla en su página y en la Fan Zone.`, ligas: [{ href: `/producciones/${o.id}`, label: `Ver ${o.nombre}` }] };
  }
  if (tiene(pregunta, RE_LUGAR)) {
    const lugar = o.venue ?? o.funciones.map((f) => f.split(" · ")[1]).find(Boolean);
    return {
      tipo: "dato",
      texto: lugar ? `${o.nombre} se presenta en ${lugar}.` : `Aún no anunciamos el lugar de ${o.nombre}. Lo publicaremos en su página.`,
      ligas: ligaObra(o),
    };
  }
  if (o.estado === "proximamente") {
    return { tipo: "dato", texto: `${o.nombre} viene muy pronto. Todavía no hay boletos a la venta; las fechas y precios aparecerán en su página.`, ligas: ligaObra(o) };
  }
  const partes = [`${o.nombre} está en cartelera.`];
  if (o.precios && tiene(pregunta, RE_PRECIO)) partes.push(`Precios: ${o.precios}.`);
  if (o.funciones.length) partes.push(conPunto(`Próximas funciones: ${o.funciones.slice(0, 4).join("; ")}${o.funciones.length > 4 ? "; y más" : ""}`));
  if (o.precios && !tiene(pregunta, RE_PRECIO)) partes.push(`Precios: ${o.precios}.`);
  return { tipo: "dato", texto: partes.join(" "), ligas: ligaObra(o) };
}

function respuestaAudiciones(lista: AudicionInfo[], registro: { id: string } | null): Respuesta {
  const ligas: Liga[] = lista.slice(0, 3).map((a) => ({ href: `/audiciones/${a.id}`, label: a.titulo }));
  if (registro) ligas.push({ href: `/audiciones/${registro.id}`, label: "Registro permanente" });
  if (!lista.length) {
    return {
      tipo: "dato",
      texto: "En este momento no hay convocatorias abiertas." + (registro ? " Pero puedes dejar tus datos en el Registro permanente de talento y te tomamos en cuenta." : " Síguenos en redes para enterarte de las próximas."),
      ligas: ligas.length ? ligas : [{ href: "/audiciones", label: "Ver audiciones" }],
    };
  }
  const items = lista.map((a) => `${a.titulo}${a.cierra ? ` (inscripción hasta ${a.cierra})` : ""}`);
  return { tipo: "dato", texto: `Convocatorias abiertas: ${items.join("; ")}.` + (registro ? " También está abierto el Registro permanente de talento." : ""), ligas };
}

function respuestaCartelera(obras: ObraInfo[], conPrecios = false): Respuesta {
  const cartelera = obras.filter((o) => o.estado === "cartelera");
  const pronto = obras.filter((o) => o.estado === "proximamente");
  if (!cartelera.length && !pronto.length) {
    return { tipo: "dato", texto: "En este momento no hay funciones a la venta. Revisa nuestras producciones y síguenos en redes para enterarte de lo que viene.", ligas: [{ href: "/producciones", label: "Ver producciones" }] };
  }
  const partes: string[] = [];
  if (cartelera.length) {
    partes.push(conPrecios
      ? `En cartelera: ${cartelera.map((o) => (o.precios ? `${o.nombre} (${o.precios})` : o.nombre)).join("; ")}.`
      : `En cartelera: ${cartelera.map((o) => o.nombre).join(", ")}.`);
  }
  if (pronto.length) partes.push(`Próximamente: ${pronto.map((o) => o.nombre).join(", ")}.`);
  partes.push("Pregúntame por cualquiera para ver fechas y precios.");
  return {
    tipo: "dato",
    texto: partes.join(" "),
    ligas: [...cartelera, ...pronto].slice(0, 3).map((o) => ({ href: `/producciones/${o.id}`, label: o.nombre })).concat({ href: "/producciones", label: "Producciones" }),
  };
}

const faqRespuesta = (f: FaqItem): Respuesta => ({ tipo: "faq", texto: f.respuesta, ligas: f.liga ? [{ href: f.liga, label: "Ver más" }] : [] });

/** La respuesta de DARFY. */
export function responder(pregunta: string, ctx: DarfyContexto): Respuesta {
  const q = pregunta.slice(0, 500);
  if (RE_SALUDO.test(limpiar(q))) {
    return { tipo: "dato", texto: "¡Hola! Soy DARFY, el asistente de DARF Productions. Pregúntame por la cartelera, boletos, pagos o audiciones.", ligas: [] };
  }
  if (RE_GRACIAS.test(limpiar(q))) return { tipo: "dato", texto: "¡Con gusto! Aquí estoy si necesitas algo más.", ligas: [] };

  const faq = mejorFaq(q, ctx.faq);
  const obra = detectarObra(q, ctx.obras);
  if (obra) return respuestaObra(obra, q, ctx);
  if (faq && faq.puntos >= FUERTE) return faqRespuesta(faq.item);
  if (tiene(q, RE_AUDICION)) return respuestaAudiciones(ctx.audiciones, ctx.registro);
  if (tiene(q, RE_SOLO_PRECIO)) return respuestaCartelera(ctx.obras, true);
  if (tiene(q, RE_CARTELERA)) return respuestaCartelera(ctx.obras);
  if (faq && faq.puntos >= MINIMO) return faqRespuesta(faq.item);
  return {
    tipo: "nose",
    texto: "Mmm, esa no me la sé todavía. Escríbenos por WhatsApp o déjanos tus datos y alguien del equipo te contesta.",
    ligas: [],
  };
}

/** Mensaje de WhatsApp con la pregunta ya escrita. Vacío si no hay número. */
export function whatsappAskUrl(numero: string, pregunta: string): string {
  if (!numero) return "";
  const msg = `Hola DARF, tengo una pregunta${pregunta ? `: ${pregunta.slice(0, 500)}` : "."}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
}
