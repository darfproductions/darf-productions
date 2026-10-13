import Link from "next/link";
import { Card, EstadoChip, PanelTitle } from "@/components/panel/ui";
import { ArtFill } from "@/components/PosterArt";
import { NotificationList } from "@/components/panel/NotificationList";
import { describeAudit, type AuditRow } from "@/lib/audit";
import { listNotifications } from "@/lib/notifications";
import { listPanelProductions } from "@/lib/panel-data";
import { can, myProductionIds } from "@/lib/panel-nav";
import { cuando, cumplesProximos, esHoy, pendienteHref, pendienteTexto, porObra, totalPendientes } from "@/lib/panel-home-rules";
import { getPendientes } from "@/lib/panel-pendientes";
import { requirePanel } from "@/lib/permissions";
import { getTheme } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

type Home = {
  funciones: { id: string; production_id: string; starts_at: string; venue: string | null }[];
  ensayos: { id: string; production_id: string; titulo: string; inicia: string; lugar: string | null }[];
  juntas: { id: string; production_id: string | null; titulo: string; tipo: string; inicia: string; lugar: string | null }[];
  eventos: { id: string; production_id: string | null; titulo: string; tipo: string; inicia: string; lugar: string | null; puerta: boolean; cobros: boolean }[];
  cambios: (AuditRow & { actor_nombre: string; persona_nombre: string | null })[];
};
type Cumple = { user_id: string; nombre: string; dia: number; mes: number };

const hace = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Inicio del panel "Tu día" (0085): primero la bandeja "Por hacer" de todas mis obras (cada renglón
// lleva directo a la acción), luego lo de hoy con sus botones (puerta, taquilla), notificaciones,
// la semana, cumpleaños, cambios recientes y mis obras.
export default async function PanelHome() {
  const access = await requirePanel("/panel");
  const supabase = await createClient();
  const ids = access.isDirector ? undefined : myProductionIds(access);
  const [obras, pendientes, { data: homeData }, { data: roles }, notifs] = await Promise.all([
    listPanelProductions(ids),
    getPendientes(),
    supabase.rpc("panel_home"),
    supabase.from("panel_roles").select("id, nombre"),
    listNotifications({ limit: 8 }),
  ]);
  const sinLeer = notifs.filter((n) => !n.read_at).length;
  const home: Home = { funciones: [], ensayos: [], juntas: [], eventos: [], cambios: [], ...((homeData ?? {}) as Partial<Home>) };
  const nombreObra = new Map(obras.map((p) => [p.id, p.nombre]));

  // Cumpleaños de la semana: el Director ve todos; los demás, los de sus obras.
  const activas = obras.filter((p) => p.estado !== "archivada");
  const listas = access.isDirector
    ? [await supabase.rpc("birthdays")]
    : await Promise.all(activas.filter((p) => can(access, p.id, "obra.ver")).map((p) => supabase.rpc("birthdays", { pid: p.id })));
  const cumples = cumplesProximos(listas.flatMap((r) => (r.data ?? []) as Cumple[]), 7);

  const grupos = porObra(pendientes);
  const total = totalPendientes(pendientes);
  // La función lleva a lo que la persona puede hacer: ventas, puerta o la obra.
  const hrefFuncion = (pid: string) => `/panel/producciones/${pid}${can(access, pid, "ventas.ver") ? "/boletos" : can(access, pid, "puerta.validar") ? "/puerta" : ""}`;
  const agenda = [
    ...home.funciones.map((f) => ({ key: `f${f.id}`, at: f.starts_at, titulo: "Función", obra: f.production_id, lugar: f.venue, href: hrefFuncion(f.production_id) })),
    ...home.eventos.map((e) => ({ key: `v${e.id}`, at: e.inicia, titulo: `Evento: ${e.titulo}`, obra: e.production_id, lugar: e.lugar, href: `/panel/eventos#e-${e.id}` })),
    ...home.ensayos.map((r) => ({ key: `e${r.id}`, at: r.inicia, titulo: r.titulo, obra: r.production_id, lugar: r.lugar, href: `/panel/producciones/${r.production_id}/ensayos` })),
    ...home.juntas.map((j) => ({ key: `j${j.id}`, at: j.inicia, titulo: j.titulo, obra: j.production_id, lugar: j.lugar, href: `/cuenta/equipo/${j.production_id ?? "general"}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const personas = new Map<string, string>();
  for (const c of home.cambios) {
    if (c.actor) personas.set(c.actor, c.actor_nombre);
    const row = (c.despues ?? c.antes ?? {}) as Record<string, unknown>;
    if (typeof row.user_id === "string" && c.persona_nombre) personas.set(row.user_id, c.persona_nombre);
  }
  const roleName = new Map((roles ?? []).map((r) => [r.id as string, r.nombre as string]));
  const names = {
    person: (id: unknown) => personas.get(String(id)) ?? "una persona",
    role: (id: unknown) => roleName.get(String(id)) ?? String(id),
    production: (id: unknown) => nombreObra.get(String(id)) ?? String(id),
  };

  const hoyFunciones = home.funciones.filter((f) => esHoy(f.starts_at));
  const hoyEventos = home.eventos.filter((e) => esHoy(e.inicia));
  const boton = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/60";
  const nombre = access.session.profile?.nombre?.split(" ")[0] || "";
  const obraDe = (pid: string | null, general = "Convocatoria general") => (pid ? nombreObra.get(pid) ?? pid : general);

  return (
    <>
      <PanelTitle eyebrow="Tu día" title={nombre ? `Hola, ${nombre}` : "Inicio"}>
        {access.isDirector ? "Tienes acceso de Director a todas las obras." : "Esto es lo que pasa en las obras en las que tienes un rol."}
      </PanelTitle>

      {grupos.length > 0 ? (
        <Card className="flex flex-col gap-4 border border-aviso/40">
          <h2 className="titular text-xl">Por hacer <span className="ml-1 rounded-full bg-aviso px-2 py-0.5 align-middle text-xs text-sala">{total}</span></h2>
          {grupos.map((g) => (
            <section key={g.production_id ?? "general"} aria-label={obraDe(g.production_id, "DARF (general)")} className="flex flex-col gap-2">
              <h3 className="flex items-baseline justify-between gap-2 text-sm font-bold uppercase tracking-[0.14em] text-texto-3">
                {g.production_id ? <Link href={`/panel/producciones/${g.production_id}`} className="hover:text-texto">{obraDe(g.production_id)}</Link> : "DARF (general)"}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((p) => (
                  <li key={`${p.tipo}-${p.production_id}-${p.ref_id ?? ""}`}>
                    <Link href={pendienteHref(p)} className="flex items-center justify-between gap-3 rounded-lg bg-sala px-4 py-3 hover:bg-telon-2">
                      <span><b className="text-aviso">{pendienteTexto(p)}</b>{p.ref_titulo ? <span className="text-sm text-texto-2"> · {p.ref_titulo}</span> : null}</span>
                      <span className="text-violeta-claro">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </Card>
      ) : (
        <Card className="text-texto-2">Todo al día: no hay nada por hacer en tus obras.</Card>
      )}

      {(hoyFunciones.length > 0 || hoyEventos.length > 0) && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Hoy</h2>
          <ul className="flex flex-col divide-y divide-white/10">
            {hoyFunciones.map((f) => {
              const base = `/panel/producciones/${f.production_id}`;
              return (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-sm"><b>{cuando(f.starts_at)}</b> · Función · {obraDe(f.production_id)}{f.venue ? ` · ${f.venue}` : ""}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {can(access, f.production_id, "puerta.validar") && <Link href={`${base}/puerta`} className={boton}>Puerta</Link>}
                    {can(access, f.production_id, "ventas.operar") && <Link href={`${base}/boletos/taquilla`} className={boton}>Taquilla</Link>}
                    {can(access, f.production_id, "ventas.ver") && <Link href={`${base}/boletos?funcion=${f.id}`} className={boton}>Órdenes</Link>}
                  </span>
                </li>
              );
            })}
            {hoyEventos.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-sm"><b>{cuando(e.inicia)}</b> · {e.titulo} · {obraDe(e.production_id, "DARF")}{e.lugar ? ` · ${e.lugar}` : ""}</span>
                <span className="flex flex-wrap gap-1.5">
                  {e.puerta && e.tipo !== "en_linea" && <Link href={`/panel/eventos#e-${e.id}`} className={boton}>Validar en la entrada</Link>}
                  {e.cobros && <Link href={`/panel/eventos#e-${e.id}`} className={boton}>Lista y pagos</Link>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="titular text-xl">Notificaciones{sinLeer ? <span className="ml-2 rounded-full bg-ciruela px-2 py-0.5 align-middle text-xs text-white">{sinLeer} nuevas</span> : null}</h2>
          <span className="flex gap-4">
            <Link href="/panel/notificaciones#telefono" className="text-sm font-bold text-violeta-claro">📱 En mi teléfono</Link>
            <Link href="/panel/notificaciones" className="text-sm font-bold text-violeta-claro">Ver todas →</Link>
          </span>
        </div>
        <NotificationList items={notifs} />
      </Card>

      {(agenda.length > 0 || cumples.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {agenda.length > 0 && (
            <Card className="flex flex-col gap-3">
              <h2 className="titular text-xl">Esta semana</h2>
              <ul className="flex flex-col divide-y divide-white/10">
                {agenda.map((x) => (
                  <li key={x.key}>
                    <Link href={x.href} className="flex flex-col py-2.5 hover:text-violeta-claro">
                      <span className="text-sm font-bold">{cuando(x.at)}</span>
                      <span className="text-sm text-texto-2">{x.titulo} · {obraDe(x.obra, "DARF (general)")}{x.lugar ? ` · ${x.lugar}` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {cumples.length > 0 && (
            <Card className="flex flex-col gap-3">
              <h2 className="titular text-xl">Cumpleaños</h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {cumples.map((c) => (
                  <li key={c.user_id} className="flex justify-between gap-3">
                    <span className="font-semibold">{c.nombre}</span>
                    <span className={c.faltan === 0 ? "font-bold text-aviso" : "text-texto-3"}>{c.faltan === 0 ? "¡Hoy!" : c.faltan === 1 ? "Mañana" : `En ${c.faltan} días`}</span>
                  </li>
                ))}
              </ul>
              {access.isDirector && <Link href="/panel/cumpleanos" className="text-sm font-bold text-violeta-claro">Ver todos →</Link>}
            </Card>
          )}
        </div>
      )}

      {home.cambios.length > 0 && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Cambios recientes</h2>
          <ul className="flex flex-col divide-y divide-white/10 text-sm">
            {home.cambios.map((r) => (
              <li key={r.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <span><b>{r.actor_nombre}</b> · {describeAudit(r, names)}</span>
                <span className="shrink-0 text-texto-3">{obraDe(r.production_id)} · {hace(r.at)}</span>
              </li>
            ))}
          </ul>
          {access.isDirector && <Link href="/panel/bitacora" className="text-sm font-bold text-violeta-claro">Ver la bitácora completa →</Link>}
        </Card>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="titular text-xl">Mis producciones</h2>
        {obras.length === 0 && <Card>Aún no tienes obras asignadas.</Card>}
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {obras.map((p) => {
            const t = getTheme(p);
            const rol = access.isDirector ? "Director" : `${(access.byProduction[p.id] ?? []).length} ${(access.byProduction[p.id] ?? []).length === 1 ? "permiso" : "permisos"}`;
            return (
              <li key={p.id}>
                <Link href={`/panel/producciones/${p.id}`} className="flex items-center gap-3 overflow-hidden rounded-[18px] border border-linea bg-telon pr-3 transition-transform hover:-translate-y-0.5">
                  <div className="relative h-24 w-28 shrink-0 self-stretch overflow-hidden" style={{ background: t?.fondo ?? "var(--telon-2)" }}>
                    {t && <ArtFill theme={t} alt="" sizes="96px" />}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-1 py-2">
                    <p className="line-clamp-2 font-bold leading-tight">{p.nombre}</p>
                    <p className="text-xs text-texto-3">{rol}</p>
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
