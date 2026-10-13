import { soloObraActiva } from "@/lib/panel-data";

// Materiales: sección de temporada; en una obra concluida se regresa al Resumen.
export default async function Layout({ children, params }: LayoutProps<"/panel/producciones/[id]/materiales">) {
  await soloObraActiva((await params).id);
  return children;
}
