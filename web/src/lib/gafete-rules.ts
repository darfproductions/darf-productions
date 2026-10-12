// Gafete digital (0078). Funciones puras: gafete-rules.test.ts.

export type Franja = "staff" | "elenco" | "equipo";

/** Franja de abajo del gafete (kit: STAFF en pulso; elenco con la luz DARF; equipo en lila). */
export const FRANJAS: Record<Franja, { label: string; fondo: string; texto: string }> = {
  staff: { label: "STAFF", fondo: "#ff2d87", texto: "#0b0910" },
  elenco: { label: "ELENCO", fondo: "linear-gradient(120deg,#340feb,#830886 55%,#d20122)", texto: "#ffffff" },
  equipo: { label: "EQUIPO", fondo: "#a48bff", texto: "#0b0910" },
};

export type GafeteMio = {
  token: string; codigo: string; franja: Franja; papel: string; obra: string | null; temporada: string | null;
  compartir_telefono: boolean; compartir_correo: boolean; compartir_instagram: boolean; compartir_perfil: boolean;
};

export type GafetePublico = {
  nombre: string; franja: Franja; papel: string; obra: string | null; temporada: string | null;
  retrato_path: string | null; telefono: string | null; correo: string | null; instagram: string | null; perfil: string | null;
};

export function iniciales(nombre: string): string {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "D";
}

/** Liga que va dentro del QR. */
export function ligaGafete(origen: string, token: string): string {
  return `${origen.replace(/\/$/, "")}/g/${token}`;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\;");

/** Tarjeta de contacto (vCard 3.0) con lo que la persona eligió compartir. */
export function vcard(g: Pick<GafetePublico, "nombre" | "papel" | "telefono" | "correo" | "instagram">, url: string | null): string {
  const partes = g.nombre.trim().split(/\s+/);
  const lineas = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${esc(g.nombre.trim())}`,
    `N:${esc(partes.slice(1).join(" "))};${esc(partes[0] ?? "")};;;`,
    "ORG:DARF Productions",
    `TITLE:${esc(g.papel)}`,
  ];
  if (g.telefono) lineas.push(`TEL;TYPE=CELL:${g.telefono.replace(/[^\d+]/g, "")}`);
  if (g.correo) lineas.push(`EMAIL;TYPE=INTERNET:${g.correo}`);
  if (g.instagram) lineas.push(`X-SOCIALPROFILE;TYPE=instagram:https://instagram.com/${g.instagram.replace(/^@/, "")}`);
  if (url) lineas.push(`URL:${url}`);
  lineas.push("END:VCARD");
  return lineas.join("\r\n") + "\r\n";
}
