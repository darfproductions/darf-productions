// Beneficios por zona (0122): reglas puras (textos, WhatsApp, hora de acceso). Pruebas en beneficios-rules.test.ts.
import type { IconoNombre } from "@/components/Icono";

export type TipoBeneficio = "experiencia" | "acceso" | "souvenir" | "atencion" | "otro";
export type Beneficio = {
  id: string; tipo: TipoBeneficio; nombre: string; detalle: string | null; minutos_antes: number | null;
  cupo: number | null; funciones: string[] | null; orden: number; activo: boolean; zonas: string[];
};
/** Lo mínimo para mostrarlo (página, compra, boleto, WhatsApp). */
export type BeneficioCorto = Pick<Beneficio, "tipo" | "nombre" | "minutos_antes" | "cupo"> & { detalle?: string | null; funciones?: string[] | null };
/** Beneficio de un boleto (beneficios_boleto / beneficios_qr). */
export type BeneficioBoleto = BeneficioCorto & { beneficio_id: string; alcanza: boolean | null; entregado_at: string | null; zona: string };

export const TIPOS_BENEFICIO: Record<TipoBeneficio, { label: string; icono: IconoNombre; ayuda: string }> = {
  experiencia: { label: "Experiencia", icono: "camara", ayuda: "Foto con el elenco, meet & greet, recorrido…" },
  acceso: { label: "Acceso", icono: "reloj", ayuda: "Entrar antes, fila preferente, sala de espera…" },
  souvenir: { label: "Souvenir", icono: "estrella", ayuda: "Póster firmado, programa impreso, pulsera…" },
  atencion: { label: "Atención", icono: "personas", ayuda: "Bartender propio, anfitrión, bebida de cortesía…" },
  otro: { label: "Otro", icono: "destello", ayuda: "Lo que se te ocurra." },
};
export const esTipoBeneficio = (x: string): x is TipoBeneficio => x in TIPOS_BENEFICIO;

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
  const xs = bs.map((b) => `${textoBeneficio(b)}${b.cupo ? ` (primeros ${b.cupo})` : ""}`);
  return `Incluye (${zona}): ${xs.join(", ")}`;
}

/** Hora a la que puede entrar con acceso anticipado: "7:45 p.m.". */
export function horaAcceso(inicioIso: string | null | undefined, minutos: number | null | undefined): string | null {
  if (!inicioIso || !minutos) return null;
  const d = new Date(Date.parse(inicioIso) - minutos * 60_000);
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
  const incluye = bs.filter((b) => b.alcanza !== false).map((b) => `${textoBeneficio(b)}${b.cupo && b.alcanza == null ? " (sujeto a cupo)" : ""}`);
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
