import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import { DarfyChat } from "@/components/darfy/DarfyChat";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { EnvBanner } from "@/components/EnvBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { env } from "@/lib/env";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
