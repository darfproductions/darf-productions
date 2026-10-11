import type { Metadata } from "next";
import Link from "next/link";
import { Card, PanelTitle } from "@/components/panel/ui";
import { describeAudit, type AuditRow } from "@/lib/audit";
import { requireDirector } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bitácora" };

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Solo el Director: quién cambió qué y cuándo. Nadie la puede editar ni borrar.
export default async function AuditPage({ searchParams }: PageProps<"/panel/bitacora">) {
  await requireDirector("/panel/bitacora");
  const sp = await searchParams;
  const obra = typeof sp.obra === "string" ? sp.obra : "";
  const supabase = await createClient();
  let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(150);
  if (obra) q = q.eq("production_id", obra);
  const [{ data: rows }, { data: prods }, { data: roles }] = await Promise.all([
    q,
    supabase.from("productions").select("id, nombre"),
    supabase.from("panel_roles").select("id, nombre"),
  ]);
  const log = (rows ?? []) as AuditRow[];

  // Nombres de las personas que aparecen (el Director puede leer perfiles).
  const ids = new Set<string>();
  for (const r of log) {
    if (r.actor) ids.add(r.actor);
    const row = (r.despues ?? r.antes ?? {}) as Record<string, unknown>;
    if (typeof row.user_id === "string") ids.add(row.user_id);
    if (r.tabla === "profiles" && typeof row.id === "string") ids.add(row.id);
  }
  const { data: people } = ids.size
    ? await supabase.from("profiles").select("id, nombre").in("id", [...ids])
    : { data: [] as { id: string; nombre: string | null }[] };
  const personName = new Map((people ?? []).map((p) => [p.id, p.nombre || "Sin nombre"]));
  const prodName = new Map((prods ?? []).map((p) => [p.id as string, p.nombre as string]));
  const roleName = new Map((roles ?? []).map((r) => [r.id as string, r.nombre as string]));
  const names = {
    person: (id: unknown) => personName.get(String(id)) ?? "una cuenta",
    role: (id: unknown) => roleName.get(String(id)) ?? String(id),
    production: (id: unknown) => prodName.get(String(id)) ?? String(id),
  };

  return (
    <>
      <PanelTitle eyebrow="Director" title="Bitácora">
        Registro automático de cambios en permisos, roles y obras. No se puede editar ni borrar.
      </PanelTitle>
      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/panel/bitacora" className={`rounded-full border px-3 py-1.5 font-semibold ${!obra ? "border-texto" : "border-white/20"}`}>Todo</Link>
        {(prods ?? []).map((p) => (
          <Link key={p.id} href={`/panel/bitacora?obra=${p.id}`} className={`rounded-full border px-3 py-1.5 font-semibold ${obra === p.id ? "border-texto" : "border-white/20"}`}>
            {p.nombre}
          </Link>
        ))}
      </nav>
      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {log.map((r) => (
            <li key={r.id} className="flex flex-col gap-0.5 px-5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <p className="font-semibold">{describeAudit(r, names)}</p>
              <p className="shrink-0 text-sm text-texto-3">{r.actor ? names.person(r.actor) : "Sistema"} · {fecha(r.at)}</p>
            </li>
          ))}
          {log.length === 0 && <li className="px-5 py-4 text-texto-2">Sin cambios registrados todavía.</li>}
        </ul>
      </Card>
    </>
  );
}
