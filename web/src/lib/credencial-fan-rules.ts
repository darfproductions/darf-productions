import { anioMx, type Banda, type PaseVista } from "@/lib/gafete-rules";
import { numeroSocio } from "@/lib/fanzone-rules";

// Credencial del Club Fan como gafete (0080): dorada, con el logo de Fan Zone y el sello del club,
// QR con la liga /f/<token> y código corto FAN-XXXX para entrar a los eventos del club.

export type CredencialFan = { numero: number; desde: string; fundador: boolean; token: string; codigo: string };

export const BANDA_FAN: Banda = {
  label: "CLUB FAN", texto: "#0b0910",
  fondo: "linear-gradient(120deg,#8a6b1f,#d7bb5f 50%,#f3e3a3)",
  degradado: [[0, "#8a6b1f"], [0.5, "#d7bb5f"], [1, "#f3e3a3"]],
};

export function ligaCredencial(origen: string, token: string): string {
  return `${origen.replace(/\/$/, "")}/f/${token}`;
}

export function paseCredencialFan(c: { nombre: string; fotoUrl: string | null; numero: number; fundador: boolean; desde: string; qr?: string; codigo?: string }): PaseVista {
  return {
    tema: "fan", logo: "/marca/fan-zone-oro.svg", logoAlt: "DARF Fan Zone", nombre: c.nombre, fotoUrl: c.fotoUrl,
    titulo: `Socio ${numeroSocio(c.numero)}${c.fundador ? " · Fan fundador" : ""}`,
    pie: `Club Fan · desde ${anioMx(new Date(c.desde))}`,
    banda: BANDA_FAN, qr: c.qr, codigo: c.codigo,
  };
}

/** Resultado de validar una credencial en la entrada de un evento (fan_checkin). */
export type AccesoFan = "ok" | "ya" | "sin_lugar" | "sin_boleto" | "sin_pago" | "no_socio" | "lleno" | "no_encontrado";
export const ACCESO_FAN: Record<AccesoFan, { titulo: string; pasa: boolean }> = {
  ok: { titulo: "Puede pasar", pasa: true },
  ya: { titulo: "Ya había entrado", pasa: false },
  sin_lugar: { titulo: "No apartó lugar para este evento", pasa: false },
  sin_boleto: { titulo: "No tiene boleto para esta función", pasa: false },
  sin_pago: { titulo: "Apartó lugar, pero su pago no está aprobado", pasa: false },
  no_socio: { titulo: "Este evento es solo para el Club Fan", pasa: false },
  lleno: { titulo: "El evento ya está lleno", pasa: false },
  no_encontrado: { titulo: "Credencial no encontrada", pasa: false },
};
