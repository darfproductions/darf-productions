/* eslint-disable @next/next/no-img-element -- retratos desde Storage (Fase 2) */
import type { Credit } from "@/lib/production-content";

// Elenco y equipos con fotos sin saturar la página:
// - Reparto: tarjetas con retrato 3:4 (hasta 6 por fila); se ven las primeras 12, el resto al desplegar.
// - Ensamble: lista compacta con foto pequeña.
// - Equipos: grupos plegables con foto pequeña, nombre y puesto.
// Funciona sin JavaScript (details/summary). Sin foto: iniciales en el color de la obra.
// Las fotos son de cada obra (misma sesión, se ven uniformes); si falta, el retrato del perfil (0057).
// El nombre enlaza a /artistas/<slug> cuando la persona hizo público su perfil.

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function Avatar({ name, foto, size }: { name: string; foto?: string; size: "sm" | "md" | "lg" }) {
  if (size === "lg") {
    const cls = "aspect-[3/4] w-full rounded-[18px] border border-current/12";
    return foto ? (
      <img src={foto} alt="" loading="lazy" className={`${cls} object-cover transition-transform duration-500 group-hover/c:scale-[1.03]`} />
    ) : (
      <span aria-hidden="true" className={`${cls} flex items-center justify-center bg-[radial-gradient(60%_50%_at_50%_38%,color-mix(in_srgb,var(--obra-acento)_28%,var(--obra-superficie)),var(--obra-superficie)_75%)] text-2xl font-black text-obra-acento md:text-3xl`}>
        {initials(name)}
      </span>
    );
  }
  // Pequeño: retrato redondo con aro dorado (guía); sin foto, iniciales en oro claro.
  const cls = size === "md" ? "h-[52px] w-[52px] text-sm" : "h-10 w-10 text-xs";
  return foto ? (
    <img src={foto} alt="" loading="lazy" className={`${cls} shrink-0 rounded-full object-cover ring-1 ring-oro/45`} />
  ) : (
    <span aria-hidden="true" className={`ava ${cls} shrink-0`}>{initials(name)}</span>
  );
}

const MORE = "inline-flex min-h-[42px] cursor-pointer list-none items-center rounded-full border border-current/30 px-5 text-[11.5px] font-bold uppercase tracking-[0.16em] hover:border-current/60";

function Nombre({ persona, perfil, className }: { persona: string; perfil?: string; className: string }) {
  return perfil ? <a href={perfil} className={`${className} underline-offset-4 hover:underline`}>{persona}</a> : <span className={className}>{persona}</span>;
}

export function CastGrid({ reparto }: { reparto: { personaje: string; persona: string; foto?: string; perfil?: string }[] }) {
  const card = (r: (typeof reparto)[number], i: number) => (
    <li key={i} className="group/c flex min-w-0 flex-col gap-2 md:gap-3">
      <div className="overflow-hidden rounded-[18px]"><Avatar name={r.persona} foto={r.foto} size="lg" /></div>
      <div className="grid gap-0.5">
        <p className="text-[13px] leading-tight md:text-base"><Nombre persona={r.persona} perfil={r.perfil} className="font-bold" /></p>
        <p className="text-[11.5px] leading-snug opacity-70 md:text-[12.5px]">como {r.personaje}</p>
      </div>
    </li>
  );
  const first = reparto.slice(0, 12);
  const rest = reparto.slice(12);
  const grid = "grid grid-cols-3 gap-x-3 gap-y-6 md:grid-cols-4 md:gap-x-5 md:gap-y-7 xl:grid-cols-6";
  return (
    <div className="flex flex-col gap-6">
      <ul className={grid}>{first.map(card)}</ul>
      {rest.length > 0 && (
        <details className="group flex flex-col gap-6">
          <summary className={`${MORE} self-start group-open:mb-6`}>
            <span className="group-open:hidden">Ver todo el reparto ({reparto.length})</span>
            <span className="hidden group-open:inline">Ver menos</span>
          </summary>
          <ul className={grid}>{rest.map((r, i) => card(r, i + 12))}</ul>
        </details>
      )}
    </div>
  );
}

export function Ensemble({ items }: { items: { persona: string; foto?: string; perfil?: string }[] }) {
  const item = (n: { persona: string; foto?: string; perfil?: string }, i: number) => (
    <li key={i} className="flex items-center gap-3"><Avatar name={n.persona} foto={n.foto} size="sm" /><Nombre persona={n.persona} perfil={n.perfil} className="text-sm font-semibold" /></li>
  );
  const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-obra-acento">Ensamble</p>
      <ul className={grid}>{items.slice(0, 9).map(item)}</ul>
      {items.length > 9 && (
        <details className="group">
          <summary className={`${MORE} mt-1 inline-block group-open:mb-3`}>
            <span className="group-open:hidden">Ver todo el ensamble ({items.length})</span>
            <span className="hidden group-open:inline">Ver menos</span>
          </summary>
          <ul className={grid}>{items.slice(9).map((n, i) => item(n, i + 9))}</ul>
        </details>
      )}
    </div>
  );
}

export function TeamGroups({ groups }: { groups: { titulo: string; items: Credit[] }[] }) {
  const visible = groups.filter((g) => g.items.length > 0);
  return (
    <div className="flex flex-col divide-y divide-current/12 border-y border-current/12">
      {visible.map((g, gi) => (
        <details key={g.titulo} open={gi === 0} className="group py-3">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between py-3">
            <span className="text-lg font-bold md:text-xl">{g.titulo} <span className="text-[15px] font-normal opacity-60">· {g.items.length}</span></span>
            <span aria-hidden="true" className="text-2xl text-obra-acento transition-transform group-open:rotate-45">+</span>
          </summary>
          <ul className="grid gap-x-10 pb-4 sm:grid-cols-2">
            {g.items.map((c, i) => (
              <li key={i} className="flex items-center gap-4 py-2.5">
                <Avatar name={c.persona} foto={c.foto} size="md" />
                <div className="min-w-0">
                  <p className="truncate"><Nombre persona={c.persona} perfil={c.perfil} className="font-semibold" /></p>
                  <p className="truncate text-[12.5px] opacity-70">{c.rol}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
