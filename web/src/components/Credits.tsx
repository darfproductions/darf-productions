/* eslint-disable @next/next/no-img-element -- retratos desde Storage (Fase 2) */
import type { Credit } from "@/lib/production-content";

// Elenco y equipos con fotos sin saturar la página:
// - Reparto: tarjetas con retrato; se ven las primeras 8, el resto al desplegar.
// - Ensamble: lista compacta con foto pequeña.
// - Equipos: grupos plegables con foto pequeña, nombre y puesto.
// Funciona sin JavaScript (details/summary). Sin foto: iniciales en el color de la obra.
// Las fotos son de cada obra (misma sesión, se ven uniformes), no de la persona.

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function Avatar({ name, foto, size }: { name: string; foto?: string; size: "sm" | "lg" }) {
  const cls = size === "lg" ? "aspect-[3/4] w-full rounded-xl text-3xl" : "h-10 w-10 shrink-0 rounded-full text-xs";
  return foto ? (
    <img src={foto} alt="" loading="lazy" className={`${cls} object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${cls} flex items-center justify-center bg-[color-mix(in_srgb,var(--obra-acento)_22%,var(--obra-superficie))] font-black text-obra-acento`}>
      {initials(name)}
    </span>
  );
}

const MORE = "cursor-pointer list-none rounded-full border border-current/30 px-5 py-2.5 text-sm font-bold hover:border-current/60";

export function CastGrid({ reparto }: { reparto: { personaje: string; persona: string; foto?: string }[] }) {
  const card = (r: (typeof reparto)[number], i: number) => (
    <li key={i} className="flex flex-col gap-2">
      <Avatar name={r.persona} foto={r.foto} size="lg" />
      <div>
        <p className="font-bold leading-tight">{r.persona}</p>
        <p className="text-sm opacity-75">{r.personaje}</p>
      </div>
    </li>
  );
  const first = reparto.slice(0, 8);
  const rest = reparto.slice(8);
  const grid = "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4";
  return (
    <div className="flex flex-col gap-6">
      <ul className={grid}>{first.map(card)}</ul>
      {rest.length > 0 && (
        <details className="group flex flex-col gap-6">
          <summary className={`${MORE} self-start group-open:mb-6`}>
            <span className="group-open:hidden">Ver todo el reparto ({reparto.length})</span>
            <span className="hidden group-open:inline">Ver menos</span>
          </summary>
          <ul className={grid}>{rest.map((r, i) => card(r, i + 8))}</ul>
        </details>
      )}
    </div>
  );
}

export function Ensemble({ items }: { items: { persona: string; foto?: string }[] }) {
  const item = (n: { persona: string; foto?: string }, i: number) => (
    <li key={i} className="flex items-center gap-3"><Avatar name={n.persona} foto={n.foto} size="sm" /><span className="text-sm font-semibold">{n.persona}</span></li>
  );
  const grid = "grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-obra-acento">Ensamble</p>
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
    <div className="flex flex-col divide-y divide-current/15 border-y border-current/15">
      {visible.map((g, gi) => (
        <details key={g.titulo} open={gi === 0} className="group py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between py-3">
            <span className="font-bold">{g.titulo} <span className="font-normal opacity-60">· {g.items.length}</span></span>
            <span aria-hidden="true" className="text-xl transition-transform group-open:rotate-45">+</span>
          </summary>
          <ul className="grid gap-3 pb-4 sm:grid-cols-2">
            {g.items.map((c, i) => (
              <li key={i} className="flex items-center gap-3">
                <Avatar name={c.persona} foto={c.foto} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{c.persona}</p>
                  <p className="truncate text-sm opacity-70">{c.rol}</p>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
