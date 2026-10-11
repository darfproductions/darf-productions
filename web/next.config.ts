import type { NextConfig } from "next";

// Imágenes de las obras (logo, ambiente, retratos) desde el Storage de Supabase
// del entorno (bucket público `producciones`).
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/producciones/**" }]
      : [],
  },
};

export default nextConfig;
