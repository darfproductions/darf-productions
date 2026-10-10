import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { EnvBanner } from "@/components/EnvBanner";
import { SiteHeader } from "@/components/SiteHeader";
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${montserrat.variable} antialiased`}>
      <body className="min-h-dvh">
        <SiteHeader />
        {children}
        <EnvBanner />
      </body>
    </html>
  );
}
