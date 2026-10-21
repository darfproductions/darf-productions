/* eslint-disable @next/next/no-img-element -- vistas previas generadas por la ruta de imagen */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, PanelTitle } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { GUIAS } from "@/lib/difusion-guias-rules";
import { casa } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

export const metadata: Metadata = { title: "Difusión de DARF" };

const pill = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50";

// Guías para redes de DARF (no de una obra): cómo unirte al Club Fan y cómo crear tu cuenta.
// Cada una en post (4:5) e historia (9:16), con QR a la página. Los diseños de cada obra están en su pestaña Difusión.
export default async function DifusionDarf() {
  const access = await requirePanel("/panel/ajustes/difusion");
  if (!casa(access, "casa.sitio") && !casa(access, "casa.club")) redirect("/panel");
  const liga = (tipo: string, f: "post" | "historia", descargar = false) => `/panel/ajustes/difusion/${tipo}?${new URLSearchParams({ f, ...(descargar ? { descargar: "1" } : {}) })}`;
  return (
    <div className="flex flex-col gap-4">
      <PanelTitle eyebrow="Ajustes" title="Difusión de DARF" />
      <Card>
        <p className="text-sm text-texto-2">
          Guías paso a paso para Instagram, Facebook y WhatsApp, con los colores de la casa y un QR que lleva a la página.
          Cada una se descarga en post (4:5) o en historia (9:16). Los diseños de cada obra (funciones, preventa, últimos boletos…) están en la pestaña Difusión de la obra.
        </p>
      </Card>
      <ul className="grid gap-4 sm:grid-cols-2">
        {GUIAS.map((g) => (
          <li key={g.id}>
            <Card className="flex h-full flex-col gap-3">
              <div>
                <h3 className="font-bold">{g.label}</h3>
                <p className="text-xs text-texto-3">{g.ayuda}</p>
              </div>
              <img src={liga(g.id, "post")} alt={`Vista previa: ${g.label}`} loading="lazy" width={1080} height={1350} className="aspect-[4/5] w-full rounded-lg bg-sala object-cover" />
              <div className="mt-auto flex flex-wrap gap-2">
                <a href={liga(g.id, "post", true)} className={pill}>Post <Icono nombre="flecha-abajo" /></a>
                <a href={liga(g.id, "historia", true)} className={pill}>Historia <Icono nombre="flecha-abajo" /></a>
                <a href={liga(g.id, "historia")} target="_blank" rel="noopener" className={`${pill} border-transparent text-texto-3`}>Ver historia</a>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
