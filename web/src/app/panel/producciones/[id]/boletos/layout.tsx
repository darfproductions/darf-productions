import Link from "next/link";
import { redirect } from "next/navigation";
import { canAny, can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";

// Sub-secciones de boletería según permisos en ESTA obra.
export default async function TicketsLayout({ children, params }: LayoutProps<"/panel/producciones/[id]/boletos">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos`);
  if (!canAny(access, id, ["ventas.ver", "ventas.operar", "funciones.gestionar", "descuentos.gestionar"])) redirect(`/panel/producciones/${id}`);
  const links = [
    { href: "", label: "Ventas y órdenes", show: can(access, id, "ventas.ver") },
    { href: "/taquilla", label: "Taquilla", show: can(access, id, "ventas.operar") },
    { href: "/funciones", label: "Funciones y precios", show: can(access, id, "funciones.gestionar") },
    { href: "/descuentos", label: "Descuentos", show: can(access, id, "descuentos.gestionar") },
  ].filter((l) => l.show);
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Boletería" className="flex flex-wrap gap-2 text-sm">
        {links.map((l) => (
          <Link key={l.href} href={`/panel/producciones/${id}/boletos${l.href}`} className="rounded-full border border-white/20 px-3 py-1.5 font-semibold hover:border-white/50">
            {l.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
