import { soloObraActiva } from "@/lib/panel-data";

// Audiciones de la obra: sección de temporada; en una obra concluida se regresa al Resumen.
export default async function Layout({ children, params }: LayoutProps<"/panel/producciones/[id]/audiciones">) {
  await soloObraActiva((await params).id);
  return children;
}
