// Beneficios por zona (0122): reglas puras (textos, WhatsApp, hora de acceso). Pruebas en beneficios-rules.test.ts.
// 0125: cuándo se entrega cada beneficio, su fecha límite y el estado de la entrega.
import type { IconoNombre } from "@/components/Icono";

export type TipoBeneficio = "experiencia" | "acceso" | "souvenir" | "atencion" | "otro";
export type MomentoEntrega = "antes" | "dia_antes" | "dia_despues" | "despues";
export type EstadoEntrega = "entregado" | "por_pagar" | "sin_cupo" | "vencido" | "hoy" | "pendiente";
export type Beneficio = {
  id: string; tipo: TipoBeneficio; nombre: string; detalle: string | null; minutos_antes: number | null;
  cupo: number | null; funciones: string[] | null; orden: number; activo: boolean; zonas: string[];
  entrega: MomentoEntrega; entrega_dias: number | null;
};
/** Lo mínimo para mostrarlo (página, compra, boleto, WhatsApp). */
export type BeneficioCorto = Pick<Beneficio, "tipo" | "nombre" | "minutos_antes" | "cupo"> & {
  detalle?: string | null; funciones?: string[] | null; entrega?: MomentoEntrega | null; entrega_dias?: number | null;
};
/** Beneficio de un boleto (beneficios_boleto / beneficios_qr). */
export type BeneficioBoleto = BeneficioCorto & {
  beneficio_id: string; alcanza: boolean | null; entregado_at: string | null; zona: string;
  desde?: string | null; limite?: string | null; nota?: string | null; estado?: EstadoEntrega;
};

export const TIPOS_BENEFICIO: Record<TipoBeneficio, { label: string; icono: IconoNombre; ayuda: string }> = {
  experiencia: { label: "Experiencia", icono: "camara", ayuda: "Foto con el elenco, meet & greet, recorrido…" },
  acceso: { label: "Acceso", icono: "reloj", ayuda: "Entrar antes, fila preferente, sala de espera…" },
  souvenir: { label: "Souvenir", icono: "estrella", ayuda: "Póster firmado, programa impreso, pulsera…" },
  atencion: { label: "Atención", icono: "personas", ayuda: "Bartender propio, anfitrión, bebida de cortesía…" },
  otro: { label: "Otro", icono: "destello", ayuda: "Lo que se te ocurra." },
};
export const esTipoBeneficio = (x: string): x is TipoBeneficio => x in TIPOS_BENEFICIO;

/** Cuándo se entrega (0125). `dias`: hasta cuántos días antes (antes) o plazo en días (después). */
export const MOMENTOS_ENTREGA: Record<MomentoEntrega, { label: string; corto: string; dias: null | { label: string; max: number } }> = {
  antes: { label: "Antes del día de la función", corto: "antes del día de la función", dias: { label: "Desde cuántos días antes", max: 60 } },
  dia_antes: { label: "El día de la función, antes de empezar", corto: "el día de la función, antes de empezar", dias: null },
  dia_despues: { label: "El día de la función, al terminar", corto: "al terminar la función", dias: null },
  despues: { label: "Después del día de la función", corto: "después de la función", dias: { label: "Plazo en días", max: 90 } },
};
export const esMomentoEntrega = (x: string): x is MomentoEntrega => x in MOMENTOS_ENTREGA;
/** Momento por omisión según el tipo: el acceso es antes de la función; lo demás, al terminar. */
export const momentoPorOmision = (tipo: TipoBeneficio): MomentoEntrega => (tipo === "acceso" ? "dia_antes" : "dia_despues");

export const ESTADOS_ENTREGA: Record<EstadoEntrega, { label: string; tono: "ok" | "alerta" | "error" | "neutro" }> = {
  vencido: { label: "Vencido", tono: "error" },
  hoy: { label: "Ya se puede entregar", tono: "alerta" },
  pendiente: { label: "Pendiente", tono: "neutro" },
  entregado: { label: "Entregado", tono: "ok" },
  por_pagar: { label: "Falta el pago", tono: "neutro" },
  sin_cupo: { label: "Sin cupo", tono: "neutro" },
};
/** Orden de la lista: lo vencido primero, después lo que ya toca, lo pendiente y al final lo entregado. */
export const ORDEN_ESTADO: Record<EstadoEntrega, number> = { vencido: 0, hoy: 1, pendiente: 2, entregado: 3, por_pagar: 4, sin_cupo: 5 };
export const cuentaComoPendiente = (e: EstadoEntrega | undefined) => e === "vencido" || e === "hoy" || e === "pendiente";

const fechaCorta = (iso: string) => new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(new Date(iso));
/** El límite de "después" es la medianoche del día siguiente al último día: se muestra el último día. */
const ultimoDia = (iso: string) => fechaCorta(new Date(Date.parse(iso) - 60_000).toISOString());

/** Para el comprador: "Se entrega al terminar la función" / "Te lo entregamos a más tardar el 13 de marzo". */
export function textoEntrega(b: Pick<BeneficioBoleto, "entrega" | "entrega_dias" | "limite" | "estado"> & { entregado_at?: string | null }): string | null {
  if (b.estado === "entregado" && b.entregado_at) return `Entregado el ${fechaCorta(b.entregado_at)}`;
  if (!b.entrega) return null;
  if (b.entrega === "despues") return b.limite ? `Te lo entregamos a más tardar el ${ultimoDia(b.limite)}` : `Se entrega en los ${b.entrega_dias ?? 1} días después de la función`;
  if (b.entrega === "antes") return `Se entrega antes de la función${b.entrega_dias ? ` (desde ${b.entrega_dias} ${b.entrega_dias === 1 ? "día" : "días"} antes)` : ""}`;
  return b.entrega === "dia_antes" ? "Se entrega el día de la función, antes de empezar" : "Se entrega al terminar la función";
}

/** Para el panel: "Hasta el 13 de marzo" / "Antes de las 8:00 p.m." (el mismo día). */
export function textoLimite(limiteIso: string | null | undefined, entrega: MomentoEntrega | null | undefined): string | null {
  if (!limiteIso || !entrega) return null;
  if (entrega === "antes" || entrega === "dia_antes") return `Antes de las ${hora(new Date(limiteIso))} del ${fechaCorta(limiteIso)}`;
  return `Hasta el ${ultimoDia(limiteIso)}`;
}

/** Botones rápidos del panel. */
export const PLANTILLAS_BENEFICIO: { tipo: TipoBeneficio; nombre: string; minutos_antes?: number }[] = [
  { tipo: "acceso", nombre: "Acceso anticipado", minutos_antes: 15 },
  { tipo: "souvenir", nombre: "Póster firmado por el elenco" },
  { tipo: "experiencia", nombre: "Foto con el elenco" },
  { tipo: "atencion", nombre: "Bartender exclusivo" },
];

/** "Acceso anticipado (15 min antes)". */
export function textoBeneficio(b: BeneficioCorto): string {
  return b.tipo === "acceso" && b.minutos_antes ? `${b.nombre} (${b.minutos_antes} min antes)` : b.nombre;
}

/** "Solo los primeros 20" (o null). */
export function textoCupo(cupo: number | null | undefined): string | null {
  return cupo ? `Solo los primeros ${cupo}` : null;
}

/** ¿Vale en esta función? (sin lista = en todas). */
export function aplicaEnFuncion(b: { funciones?: string[] | null }, funcionId: string | null | undefined): boolean {
  return !b.funciones?.length || (!!funcionId && b.funciones.includes(funcionId));
}

/** Renglón para WhatsApp: "Incluye (VIP): acceso anticipado (15 min antes), póster firmado (primeros 20)". */
export function lineaWhatsapp(zona: string, bs: BeneficioCorto[]): string | null {
  if (!bs.length) return null;
  const xs = bs.map((b) => {
    const extra = [b.cupo ? `primeros ${b.cupo}` : null, b.entrega && b.tipo !== "acceso" ? MOMENTOS_ENTREGA[b.entrega].corto : null].filter(Boolean);
    return `${textoBeneficio(b)}${extra.length ? ` (${extra.join(", ")})` : ""}`;
  });
  return `Incluye (${zona}): ${xs.join(", ")}`;
}

/** Hora a la que puede entrar con acceso anticipado: "7:45 p.m.". */
export function horaAcceso(inicioIso: string | null | undefined, minutos: number | null | undefined): string | null {
  if (!inicioIso || !minutos) return null;
  return hora(new Date(Date.parse(inicioIso) - minutos * 60_000));
}

/** "7:45 p.m." en hora de México. */
function hora(d: Date): string {
  return new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(d)
    .replace(/\s?a\.?\s?m\.?/i, " a.m.").replace(/\s?p\.?\s?m\.?/i, " p.m.").replace(/ /g, " ");
}

/** Mayor anticipación entre los beneficios de acceso del boleto. */
export function minutosAcceso(bs: BeneficioCorto[]): number | null {
  const m = bs.filter((b) => b.tipo === "acceso" && b.minutos_antes).map((b) => b.minutos_antes!);
  return m.length ? Math.max(...m) : null;
}

/** Agrupa beneficios activos por zona (id de zona → lista), respetando la función si se da. */
export function porZona(bs: Beneficio[], funcionId?: string | null): Map<string, Beneficio[]> {
  const m = new Map<string, Beneficio[]>();
  for (const b of [...bs].sort((a, c) => a.orden - c.orden)) {
    if (!b.activo || (funcionId !== undefined && !aplicaEnFuncion(b, funcionId))) continue;
    for (const z of b.zonas) m.set(z, [...(m.get(z) ?? []), b]);
  }
  return m;
}

/** Lo que va en el boleto: lista "Incluye" (con el cupo resuelto) y la hora de acceso anticipado. */
export function textosBoleto(bs: BeneficioBoleto[], inicioIso: string | null | undefined): { incluye: string[]; acceso: string | null } {
  // 0125: cada uno dice cuándo se entrega o, ya entregado, cuándo se entregó (el acceso ya dice su hora).
  const incluye = bs.filter((b) => b.alcanza !== false).map((b) => {
    const cuando = b.tipo !== "acceso" && b.entrega ? textoEntrega(b) : null;
    return `${textoBeneficio(b)}${b.cupo && b.alcanza == null ? " (sujeto a cupo)" : ""}${cuando ? `. ${cuando}` : ""}`;
  });
  const hora = horaAcceso(inicioIso, minutosAcceso(bs));
  return { incluye, acceso: hora ? `Puertas para ti: ${hora}` : null };
}

/** Renglones de WhatsApp desde los beneficios de varios boletos (agrupados por zona, sin repetir). */
export function lineasDesdeBoletos(bs: BeneficioBoleto[]): string[] {
  const porZona = new Map<string, Map<string, BeneficioCorto>>();
  for (const b of bs) {
    const m = porZona.get(b.zona) ?? new Map<string, BeneficioCorto>();
    m.set(b.beneficio_id, b);
    porZona.set(b.zona, m);
  }
  return [...porZona].map(([z, m]) => lineaWhatsapp(z, [...m.values()])).filter((x): x is string => !!x);
}

/** WhatsApp al comprador para coordinar una entrega pendiente (0125). */
export function mensajeEntrega(x: { comprador: string; beneficio: string; obra: string; lugar: string; limite: string | null; entrega: MomentoEntrega }): string {
  const nombre = x.comprador.trim().split(/\s+/)[0] || x.comprador;
  const limite = textoLimite(x.limite, x.entrega);
  return `Hola ${nombre}, te escribimos de DARF Productions por tu ${x.beneficio.toLowerCase()} de ${x.obra} (lugar ${x.lugar}). `
    + `Queremos coordinar la entrega${limite ? ` (${limite.charAt(0).toLowerCase()}${limite.slice(1)})` : ""}. ¿Cómo te queda mejor?`;
}
