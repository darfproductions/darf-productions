import type { NextConfig } from "next";

// Imágenes de las obras (logo, ambiente, retratos) desde el Storage de Supabase
// del entorno (bucket público `producciones`).
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;

// Protecciones del navegador para todo el sitio (0088+, Bloque 2):
// - nadie más puede meter la página en un marco (evita clics engañados en el panel);
// - siempre por conexión segura; no adivinar tipos de archivo; no mandar la ruta completa a otros sitios;
// - solo la cámara propia (Puerta y escáneres), nada de micrófono ni ubicación.
const seguridad = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: supabaseHost === "localhost" ? "http" : "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/producciones/**" }]
      : [],
  },
  // Service worker (app instalable y push): siempre la versión más reciente.
  async headers() {
    return [
      { source: "/:path*", headers: seguridad },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
