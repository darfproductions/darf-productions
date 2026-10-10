import type { Metadata } from "next";
import { Archivo, Montserrat } from "next/font/google";
import { EnvBanner } from "@/components/EnvBanner";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

// Archivo con eje de ancho: los titulares usan la versión expandida (125%).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: {
    default: "DARF Productions — Teatro musical",
    template: "%s · DARF Productions",
  },
  description: "Producciones, funciones y comunidad de DARF Productions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${montserrat.variable} ${archivo.variable} antialiased`}>
      <body className="min-h-dvh">
        <SiteHeader />
        {children}
        <EnvBanner />
      </body>
    </html>
  );
}
