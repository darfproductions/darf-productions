import { soloObraActiva } from "@/lib/panel-data";

// Puerta: sección de temporada; en una obra concluida se regresa al Resumen.
export default async function Layout({ children, params }: LayoutProps<"/panel/producciones/[id]/puerta">) {
  await soloObraActiva((await params).id);
  return children;
}
