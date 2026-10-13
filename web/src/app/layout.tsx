import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { DarfyChat } from "@/components/darfy/DarfyChat";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { EnvBanner } from "@/components/EnvBanner";
import { JpjBar } from "@/components/JpjBar";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { env, isDev } from "@/lib/env";
import "./globals.css";

// Una sola familia (manual de marca): Montserrat 400–900, con itálica para etiquetas.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  style: ["normal", "italic"],
});


// Dirección base para ligas absolutas (imágenes al compartir, canónicas). Fuera de PROD, sin
// indexar: la copia de pruebas no debe salir en Google.
const base = env.siteUrl || "https://darfproductions.com";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "DARF Productions",
    title: "DARF Productions — Teatro musical",
    description: "Funciones, boletos, audiciones y comunidad de DARF Productions en Querétaro.",
  },
  twitter: { card: "summary_large_image" },
  robots: isDev ? { index: false, follow: false } : undefined,
  title: {
    default: "DARF Productions — Teatro musical",
    template: "%s · DARF Productions",
  },
  description: "Producciones, funciones y comunidad de DARF Productions.",
  applicationName: "DARF Productions",
  appleWebApp: { capable: true, title: "DARF", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0b0910" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${montserrat.variable} antialiased`}>
      <body className="min-h-dvh">
        <JpjBar />
        <SiteHeader />
        {children}
        <SiteFooter />
        <DarfyChat whatsapp={env.whatsapp} />
        <EnvBanner />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
