import { paseCredencialFan } from "@/lib/credencial-fan-rules";
import { numeroSocio } from "@/lib/fanzone-rules";
import { anioMx, paseGafete, type Banda, type Franja, type PaseVista } from "@/lib/gafete-rules";

// Credencial única (0083): cada persona tiene UN QR. Se dibuja según su nivel más alto:
// equipo/elenco (gafete, con el sello del club si también es socio) > Club Fan (dorada) > cuenta.
// Funciones puras: credencial-rules.test.ts.

export type Nivel = "equipo" | "club" | "cuenta";
export type Socio = { numero: number; desde: string; fundador: boolean };

/** Lo que llega de credencial_mia(). */
export type CredencialMia = {
  token: string; codigo: string; nivel: Nivel; desde: string | null;
  franja: Franja | null; papel: string | null; socio: Socio | null;
  /** Casa DARF (0102): año desde que es parte (sello del gafete). */
  casa_desde?: number | null;
  /** DARF Loyalty (0103): número de producciones (medalla desde 3). */
  lealtad?: number | null;
  compartir_telefono: boolean; compartir_correo: boolean; compartir_instagram: boolean; compartir_perfil: boolean;
};

export const NIVEL: Record<Nivel, { boton: string; ayuda: string }> = {
  equipo: { boton: "Mi credencial", ayuda: "Muéstrala al llegar a ensayos y en la entrada de los eventos, o compártela para que tengan tu contacto." },
  club: { boton: "Mi credencial", ayuda: "Socio del Club Fan. Muéstrala en la entrada de los eventos." },
  cuenta: { boton: "Mi credencial", ayuda: "Muéstrala en la entrada de los eventos a los que te registres." },
};

/** Cuenta registrada sin Club Fan (0087): gris. */
export const BANDA_CUENTA: Banda = { label: "SPECTATOR", fondo: "#6b6675", texto: "#ffffff" };

export function paseCredencial(c: CredencialMia & { nombre: string; fotoUrl: string | null; qr?: string }, hoy: Date = new Date()): PaseVista {
  const base = { nombre: c.nombre, fotoUrl: c.fotoUrl, qr: c.qr, codigo: c.codigo };
  const lealtad = c.lealtad ? { lealtad: c.lealtad } : {};
  if (c.nivel === "equipo") {
    const p = paseGafete({ ...base, franja: c.franja ?? "crew", papel: c.papel ?? "Equipo", casaDesde: c.casa_desde, lealtad: c.lealtad }, hoy);
    return c.socio ? { ...p, sello: `Socio ${numeroSocio(c.socio.numero)}` } : p;
  }
  if (c.nivel === "club" && c.socio) return { ...paseCredencialFan({ ...base, ...c.socio }), ...lealtad };
  return {
    tema: "darf", logo: "/marca/darf-monograma.svg", logoAlt: "DARF", ...base,
    titulo: "Cuenta DARF", pie: `DARF Productions · desde ${anioMx(c.desde ? new Date(c.desde) : hoy)}`, banda: BANDA_CUENTA, ...lealtad,
  };
}
