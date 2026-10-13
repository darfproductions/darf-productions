// Lectura de un QR en una entrada (gafete en ensayos, credencial del Club Fan en eventos).
// La arma la acción del servidor y la muestra EscanerAcceso tal cual.
export type Lectura = {
  ok: boolean; message?: string;
  tono?: "ok" | "aviso" | "neutro" | "error";
  titulo?: string; detalle?: string;
  nombre?: string; fotoUrl?: string | null;
  /** Entró: se suma a "últimas llegadas" con este texto (por ejemplo "a tiempo · 18:04"). */
  llegada?: string;
};

export const horaMx = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Mexico_City" }).format(new Date(iso)) : "";

/** Eventos que siguen vigentes para la entrada: los que empiezan después de hace `horas` horas. */
export function vigenteEnPuerta(cuando: string | null, horas = 12, ahora: number = Date.now()): boolean {
  return !!cuando && new Date(cuando).getTime() > ahora - horas * 3600_000;
}
