import type { Metadata } from "next";
import { AnunciosEditor } from "@/components/anuncios/AnunciosEditor";
import { BannerEditor } from "../BannerEditor";
import { Block, cargarEditor } from "../editor";

export const metadata: Metadata = { title: "Avisos de la obra" };

// Página pública → Avisos: la franja de avisos y los anuncios (tarjetas con cuenta regresiva).
export default async function AvisosPage({ params }: PageProps<"/panel/producciones/[id]/pagina/avisos">) {
  const { id } = await params;
  const { p, cambio, banner } = await cargarEditor(id, "pagina/avisos");
  return (
    <div className="flex flex-col gap-4">
          <Block id="franja" abierto cambio={cambio("franja")} title="Franja de avisos" note="Una barra abajo del encabezado de la obra para anunciar cosas: últimas funciones, promociones, audiciones… Puede correr como marquesina o quedarse fija, con varios avisos que se turnan.">
            <BannerEditor pid={id} banner={banner} acento={p.color_acento ?? "#a48bff"} />
          </Block>

          <Block id="anuncios" abierto title="Anuncios" note="Tarjetas en la página de la obra o en la Fan Zone: revelación del elenco, nuevas fechas, convocatorias… Con fecha de revelación se ve una cuenta regresiva y el botón Avísame.">
            <AnunciosEditor scope={id} />
          </Block>

    </div>
  );
}
