import type { MetadataRoute } from "next";

// La web como app instalable (PWA). Íconos en public/icons (generados del logo de DARF).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DARF Productions",
    short_name: "DARF",
    description: "Cartelera, boletos, audiciones y el panel de DARF Productions.",
    lang: "es-MX",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0910",
    theme_color: "#0b0910",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Cartelera", url: "/cartelera" },
      { name: "Mi cuenta", url: "/cuenta" },
      { name: "Panel", url: "/panel" },
      { name: "Notificaciones", url: "/cuenta/notificaciones" },
    ],
  };
}
