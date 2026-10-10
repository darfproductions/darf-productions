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
  { channel: "email", nombre: "Correo", handle: "contact@darfproductions.com", descripcion: "Prensa, patrocinios y colaboraciones", href: "mailto:contact@darfproductions.com", color: "#b9a6ff" },
];

/** WhatsApp de atención: el número sale de la configuración del entorno (vacío en DEV). */
export const WHATSAPP_DISPLAY = "+52 446 522 0560";
