import { redirect } from "next/navigation";
import { canAny } from "@/lib/panel-nav";
import { soloObraActiva } from "@/lib/panel-data";
import { requirePanel } from "@/lib/permissions";

// Boletería: solo revisa permisos en ESTA obra. Sus páginas (Ventas, Taquilla, Funciones…) ahora son
// sub-pestañas del grupo "Boletos" de la obra (0085).
export default async function TicketsLayout({ children, params }: LayoutProps<"/panel/producciones/[id]/boletos">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos`);
  if (!canAny(access, id, ["ventas.ver", "ventas.operar", "funciones.gestionar", "descuentos.gestionar", "vendedores.gestionar"])) redirect(`/panel/producciones/${id}`);
  await soloObraActiva(id);
  return <div className="flex flex-col gap-4">{children}</div>;
}
