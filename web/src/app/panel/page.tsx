import Link from "next/link";
import { Card, EstadoChip, PanelTitle } from "@/components/panel/ui";
import { ArtFill } from "@/components/PosterArt";
import { listPanelProductions, pendingOrdersCount } from "@/lib/panel-data";
import { myProductionIds } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { getTheme } from "@/lib/productions";

// Inicio del panel: mis obras y lo que necesita atención.
export default async function PanelHome() {
  const access = await requirePanel("/panel");
  const rol = access.session.profile?.rol;
  const [obras, pendientes] = await Promise.all([
    listPanelProductions(access.isDirector ? undefined : myProductionIds(access)),
    rol === "staff" || rol === "admin" ? pendingOrdersCount() : Promise.resolve(0),
  ]);
  const nombre = access.session.profile?.nombre?.split(" ")[0] || "";

  return (
    <>
      <PanelTitle eyebrow="Panel DARF" title={nombre ? `Hola, ${nombre}` : "Inicio"}>
        {access.isDirector ? "Tienes acceso de Director a todas las obras." : "Estas son las obras en las que tienes un rol."}
      </PanelTitle>

      {pendientes > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border border-[#f2b544]/40">
          <p className="font-semibold">
            <span className="text-2xl font-black text-[#f2b544]">{pendientes}</span> {pendientes === 1 ? "orden pendiente" : "órdenes pendientes"} de aprobar
          </p>
          <a href="https://darf-2-dev-darf-productions.vercel.app/?v=staff" className="text-sm font-bold text-violeta-claro">
            Revisar en el panel 1.0 ↗
          </a>
        </Card>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="titular text-xl">Mis obras</h2>
        {obras.length === 0 && <Card>Aún no tienes obras asignadas.</Card>}
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {obras.map((p) => {
            const t = getTheme(p);
            const roles = access.isDirector ? "Director" : `${(access.byProduction[p.id] ?? []).length} permisos`;
            return (
              <li key={p.id}>
                <Link href={`/panel/producciones/${p.id}`} className="block overflow-hidden rounded-2xl bg-telon transition-transform hover:-translate-y-0.5">
                  <div className="relative aspect-[16/7] overflow-hidden" style={{ background: t?.fondo ?? "var(--telon-2)" }}>
                    {t ? <ArtFill theme={t} alt="" sizes="(min-width: 1280px) 25vw, 50vw" /> : <span className="absolute inset-0 grid place-items-center font-black">{p.nombre}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{p.nombre}</p>
                      <p className="text-xs text-texto-3">{roles}</p>
                    </div>
                    <EstadoChip estado={p.estado} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
