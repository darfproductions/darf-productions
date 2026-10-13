import type { Channel } from "@/components/SocialIcon";

// Canales de contacto públicos de DARF (los mismos que muestra la web 1.0).
// TRANSITORIO: en la Fase 2 pasan a la configuración editable desde el panel.
export type ContactChannel = {
  channel: Channel;
  nombre: string;
  handle: string;
  descripcion: string;
  href: string;
  /** Color de acento del canal (ícono y brillo). */
  color: string;
};

export const CONTACT_CHANNELS: ContactChannel[] = [
  { channel: "instagram", nombre: "Instagram", handle: "@darfproductions", descripcion: "Fotos, reels y anuncios", href: "https://www.instagram.com/darfproductions", color: "#e1306c" },
  { channel: "tiktok", nombre: "TikTok", handle: "@darf.productions", descripcion: "Videos cortos y detrás de cámaras", href: "https://www.tiktok.com/@darf.productions", color: "#25f4ee" },
  { channel: "youtube", nombre: "YouTube", handle: "@DARFProd", descripcion: "Pro-shots y videos completos", href: "https://www.youtube.com/@DARFProd", color: "#ff3b3b" },
  { channel: "email", nombre: "Correo", handle: "contact@darfproductions.com", descripcion: "Prensa, patrocinios y colaboraciones", href: "mailto:contact@darfproductions.com", color: "#a48bff" },
];

/** Número de WhatsApp para mostrar ("+52 446 522 0560") a partir del de la configuración
 *  (52 + 10 dígitos). Vacío si no hay número. */
export function whatsappDisplay(n: string): string {
  const d = n.replace(/\D/g, "");
  if (!/^52\d{10}$/.test(d)) return d ? `+${d}` : "";
  return `+52 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}
