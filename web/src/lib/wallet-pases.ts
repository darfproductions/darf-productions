import { createHash } from "node:crypto";
import { anioMx, type PaseVista } from "@/lib/gafete-rules";
import { nivelDe } from "@/lib/lealtad-rules";
import { isLight } from "@/lib/themes";
import type { EstiloBoleto } from "@/lib/ticket-design";

// Pases de Apple y Google Wallet (2026-10-14): lo mismo que ya se ve en la web (boleto diseñado y
// credencial única de la 0083), con el MISMO QR (puerta y "Checar con gafete" no cambian).
// Funciones puras: wallet-pases.test.ts. Cada Wallet lo traduce a su formato
// (apple-wallet.ts y google-wallet-pases.ts).

export type Campo = { key: string; label: string; value: string };

export type PaseWallet = {
  tipo: "boleto" | "credencial";
  /** Identificador estable (no cambia si se regenera el QR, para que Google lo actualice). */
  serial: string;
  /** Texto junto al logo (arriba). */
  titulo: string;
  descripcion: string;
  colores: { fondo: string; texto: string; etiqueta: string };
  qr: string;
  /** Texto bajo el QR (folio o código corto). */
  qrTexto: string;
  cabecera: Campo[];
  primarios: Campo[];
  secundarios: Campo[];
  auxiliares: Campo[];
  reverso: Campo[];
  /** Cuándo mostrarlo en la pantalla de bloqueo (inicio de la función). */
  fecha?: string;
  /** Después de esto Wallet lo marca como vencido. */
  vence?: string;
  /** Cancelado, función cancelada o ya usado: Wallet lo muestra como no válido. */
  anulado?: boolean;
};

export type DatosBoleto = {
  ticketId: string;
  qrToken: string;
  obra: string;
  /** Inicio de la función (ISO) o null si aún no hay fecha. */
  startsAt: string | null;
  lugar: string | null;
  asiento: string;
  orden: string;
  comprador: string;
  estilo: EstiloBoleto;
};

export type DatosCredencial = {
  /** Para el serial: la cuenta (no el token, que cambia al regenerar). */
  userId: string;
  liga: string;
  codigo: string;
  pase: PaseVista;
};

const HEX = /^#([0-9a-f]{6})$/i;

/** "#aabbcc" (o "#abc") → "#aabbcc"; cualquier otra cosa → null. */
export function hex(c: string | null | undefined): string | null {
  const t = (c ?? "").trim();
  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(t);
  if (corto) return `#${corto[1]}${corto[1]}${corto[2]}${corto[2]}${corto[3]}${corto[3]}`.toLowerCase();
  return HEX.test(t) ? t.toLowerCase() : null;
}

/** Primer color de un fondo que puede ser degradado ("linear-gradient(…#340feb…)"). */
export function colorBase(fondo: string): string | null {
  return hex(fondo) ?? hex(/#[0-9a-f]{6}/i.exec(fondo)?.[0]);
}

/** Apple pide "rgb(r, g, b)". */
export function rgb(c: string): string {
  const h = hex(c) ?? "#000000";
  const n = parseInt(h.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** Luminancia relativa (WCAG) para medir contraste. */
function lum(c: string): number {
  const n = parseInt((hex(c) ?? "#000000").slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contraste(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Color de las etiquetas: el acento si se lee sobre el fondo; si no, el texto. */
export function colorEtiqueta(fondo: string, acento: string, texto: string): string {
  return contraste(acento, fondo) >= 3 ? acento : texto;
}

const MX = "America/Mexico_City";
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-MX", { ...o, timeZone: MX });
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Sáb 15 de nov" */
export function fechaCorta(iso: string): string {
  return mayus(fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)).replace(/\./g, ""));
}

/** "8:00 p.m." */
export function hora(iso: string): string {
  return fmt({ hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "Sábado 15 de noviembre, 8:00 p.m." */
export function fechaLarga(iso: string): string {
  return mayus(fmt({ weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(iso)));
}

/** El pase vence 6 horas después del inicio (igual que funcionPasada). */
export function venceBoleto(startsAt: string): string {
  return new Date(new Date(startsAt).getTime() + 6 * 3600 * 1000).toISOString();
}

const AVISO_BOLETO = "Muestra el QR en la entrada. Cada boleto entra una sola vez. Cambios y reembolsos: darfproductions.com/reembolsos.";

export function paseBoleto(b: DatosBoleto): PaseWallet {
  const fondo = hex(b.estilo.fondo) ?? "#0b0910";
  const texto = hex(b.estilo.texto) ?? (isLight(fondo) ? "#0b0910" : "#ffffff");
  const acento = hex(b.estilo.acento) ?? texto;
  const conFecha = !!b.startsAt;
  return {
    tipo: "boleto",
    serial: `boleto-${b.ticketId}`,
    titulo: "DARF Productions",
    descripcion: `Boleto · ${b.obra}`,
    colores: { fondo, texto, etiqueta: colorEtiqueta(fondo, acento, texto) },
    qr: b.qrToken,
    qrTexto: b.orden,
    cabecera: [{ key: "fecha", label: conFecha ? fechaCorta(b.startsAt!) : "Fecha", value: conFecha ? hora(b.startsAt!) : "Por anunciar" }],
    primarios: [{ key: "obra", label: "Obra", value: b.obra }],
    secundarios: [{ key: "asiento", label: "Asiento", value: b.asiento }, { key: "lugar", label: "Lugar", value: b.lugar ?? "Por anunciar" }],
    auxiliares: [{ key: "nombre", label: "A nombre de", value: b.comprador }, { key: "orden", label: "Orden", value: b.orden }],
    reverso: [
      { key: "funcion", label: "Función", value: conFecha ? fechaLarga(b.startsAt!) : "Fecha por anunciar" },
      { key: "ayuda", label: "Cómo entrar", value: AVISO_BOLETO },
      { key: "web", label: "Mis boletos", value: "darfproductions.com/cuenta" },
    ],
    fecha: b.startsAt ?? undefined,
    vence: b.startsAt ? venceBoleto(b.startsAt) : undefined,
  };
}

/** Serial de la credencial: estable por cuenta y sin revelar su id. */
export function serialCredencial(userId: string): string {
  return `cred-${createHash("sha256").update(`darf-credencial:${userId}`).digest("hex").slice(0, 24)}`;
}

export function paseCredencialWallet(c: DatosCredencial, hoy: Date = new Date()): PaseWallet {
  const fan = c.pase.tema === "fan";
  const banda = fan ? "#d7bb5f" : colorBase(c.pase.banda.fondo) ?? "#a48bff"; // oro del club
  const fondo = "#0b0910";
  const etiqueta = contraste(banda, fondo) >= 3 ? banda : "#a48bff";
  const tipoPase = fan ? "Credencial Club Fan" : c.pase.banda.label === "SPECTATOR" ? "Credencial DARF" : "Gafete DARF";
  return {
    tipo: "credencial",
    serial: serialCredencial(c.userId),
    titulo: fan ? "DARF Fan Zone" : "DARF Productions",
    descripcion: tipoPase,
    colores: { fondo, texto: "#ffffff", etiqueta },
    qr: c.liga,
    qrTexto: c.codigo,
    cabecera: [{ key: "banda", label: fan ? "Club" : "Credencial", value: c.pase.banda.label }],
    primarios: [{ key: "nombre", label: c.pase.titulo, value: c.pase.nombre || "Sin nombre" }],
    secundarios: [{ key: "codigo", label: "Código", value: c.codigo }, ...(c.pase.sello ? [{ key: "sello", label: "Club Fan", value: c.pase.sello }] : [])],
    auxiliares: [
      { key: "vigencia", label: "Vigencia", value: c.pase.pie.replace(/^DARF Productions · /, "") || anioMx(hoy) },
      ...(c.pase.casa ? [{ key: "casa", label: "Casa DARF", value: c.pase.casa.replace(/^Casa DARF · /, "") }] : []),
      ...(nivelDe(c.pase.lealtad) ? [{ key: "lealtad", label: "DARF Loyalty", value: `${nivelDe(c.pase.lealtad)!.nombre} · ${c.pase.lealtad}` }] : []),
    ],
    reverso: [
      { key: "uso", label: "Cómo se usa", value: "Muéstrala en la entrada de ensayos y eventos. Si regeneras tu código en Mi cuenta, aquí se actualiza sola." },
      { key: "web", label: "Mi cuenta", value: "darfproductions.com/cuenta" },
    ],
  };
}

export type EstadoBoleto = { anulado: boolean; motivo: string | null };

/** Estado del boleto en Wallet (0098: el pase se actualiza solo). */
export function estadoBoleto(b: {
  status: string; activo: boolean; cancelado: boolean; funcionCancelada: boolean; ingreso: boolean;
}): EstadoBoleto {
  if (b.funcionCancelada) return { anulado: true, motivo: "Función cancelada" };
  if (b.status !== "aprobado" || !b.activo || b.cancelado) return { anulado: true, motivo: "Cancelado" };
  if (b.ingreso) return { anulado: true, motivo: "Ya ingresó" };
  return { anulado: false, motivo: null };
}

/** El pase con su estado al frente y en el reverso (y marcado como anulado). */
export function conEstado(p: PaseWallet, e: EstadoBoleto): PaseWallet {
  if (!e.motivo) return p;
  // Apple pide llaves únicas en todo el pase: el del reverso lleva otra.
  const campo = { key: "estado", label: "Estado", value: e.motivo };
  return { ...p, anulado: e.anulado, secundarios: [campo, ...p.secundarios], reverso: [{ ...campo, key: "estado-detalle" }, ...p.reverso] };
}
