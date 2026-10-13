import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { ConfirmSubmit } from "@/components/panel/ConfirmSubmit";
import { Card, Notice, PanelTitle, button, input } from "@/components/panel/ui";
import { FILTROS, filtroValido, unirDirectorio, type CuentaUsuario, type FichaPersona } from "@/lib/directory-rules";
import { requireDirector } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { linkAccount, mergePeople } from "../talento/actions";
import { changeGlobalRole } from "../usuarios/actions";

export const metadata: Metadata = { title: "Directorio" };

// Directorio (solo el Director): Talento y Usuarios en una sola lista.
// Cada persona abre su ficha; aquí se cambia su rol general, se liga su cuenta y se unen duplicados.
export default async function Directorio({ searchParams }: PageProps<"/panel/personas">) {
  const access = await requireDirector("/panel/personas");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const filtro = filtroValido(sp.filtro);
  const supabase = await createClient();
  const [{ data: fichas }, { data: cuentas, error }, { data: sug }] = await Promise.all([
    supabase.rpc("people_directory", { q: q || null }),
    supabase.rpc("admin_list_users", { q: q || null }),
    supabase.rpc("people_link_suggestions"),
  ]);
  const filas = unirDirectorio((fichas ?? []) as FichaPersona[], (cuentas ?? []) as CuentaUsuario[], filtro);
  const fichasLista = (fichas ?? []) as FichaPersona[];
  const sugerencias = (sug ?? []) as { person_id: string; persona: string; user_id: string; email: string; cuenta: string; motivo: string }[];
  const qs = (f: string) => `/panel/personas?${new URLSearchParams({ ...(q ? { q } : {}), ...(f !== "todos" ? { filtro: f } : {}) })}`;

  return (
    <>
      <PanelTitle eyebrow="Personas" title="Directorio">
        Todas las personas de DARF: elenco, equipos y cuentas registradas. Abre la ficha para ver su historial. El rol general aplica a toda la plataforma; para dar acceso a una sola obra usa la pestaña Permisos de esa obra.
      </PanelTitle>
      {typeof sp.error === "string" && <Notice>{sp.error}</Notice>}
      {sp.ok === "1" && <Notice ok>Rol actualizado.</Notice>}
      {error && <Notice>{error.message}</Notice>}

      {sugerencias.length > 0 && (
        <Card className="flex flex-col gap-2 border border-[#a48bff]/40">
          <h2 className="titular text-xl">Posibles ligas ({sugerencias.length})</h2>
          <p className="text-sm text-texto-2">Personas del elenco sin cuenta cuyo nombre coincide con una cuenta registrada. Revisa que sea la misma persona antes de ligar: su historial de obras quedará en su ficha.</p>
          <ul className="flex flex-col gap-2">
            {sugerencias.map((x) => (
              <li key={`${x.person_id}-${x.user_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
                <span className="min-w-0 wrap-anywhere"><b>{x.persona}</b> <span className="text-texto-3">↔</span> {x.cuenta} <span className="text-texto-3">· {x.email} · {x.motivo}</span></span>
                <ActionForm inline action={linkAccount} hidden={{ id: x.person_id, email: x.email }} confirm={`¿Ligar la ficha de ${x.persona} a la cuenta ${x.email}?`} submit="Ligar" submitClass="rounded-full bg-texto px-3 py-1.5 text-xs font-bold text-sala" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form className="flex flex-wrap gap-2">
        <input className={`${input} max-w-md min-w-0 flex-1 basis-56`} name="q" defaultValue={q} placeholder="Buscar por nombre o correo" />
        {filtro !== "todos" && <input type="hidden" name="filtro" value={filtro} />}
        <button className={button}>Buscar</button>
      </form>
      <nav aria-label="Filtro" className="flex flex-wrap gap-2 text-sm">
        {FILTROS.map((f) => (
          <Link key={f.id} href={qs(f.id)} className={`rounded-full border px-3 py-1.5 font-semibold ${filtro === f.id ? "border-texto" : "border-white/20"}`}>{f.label}</Link>
        ))}
      </nav>

      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {filas.map((p) => (
            <li key={p.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 wrap-anywhere">
                <Link href={p.fichaHref} className="font-bold hover:text-violeta-claro">{p.nombre}</Link>
                {p.userId === access.session.userId && <span className="ml-2 text-xs text-texto-3">(tú)</span>}
                {p.email ? <span className="text-texto-3"> · {p.email}</span> : <span className="text-xs text-aviso"> · sin cuenta</span>}
                <span className="block text-xs text-texto-3">{p.obras.join(", ") || "Sin créditos"}{p.creditos ? ` · ${p.creditos} créditos` : ""}</span>
              </span>
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                {p.userId && p.rol ? (
                  <form action={changeGlobalRole} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={p.userId} />
                    <input type="hidden" name="q" value={q} />
                    <select name="rol" defaultValue={p.rol} className={`${input} py-1.5 text-xs`} aria-label={`Rol general de ${p.nombre}`}>
                      <option value="fan">Fan</option>
                      <option value="staff">Staff</option>
                      <option value="admin">Director</option>
                    </select>
                    <ConfirmSubmit message={`¿Cambiar el rol general de ${p.nombre}?`} className="rounded-full border border-white/25 px-3 py-1 text-xs font-bold">Guardar</ConfirmSubmit>
                  </form>
                ) : !p.userId && p.personId ? (
                  <ActionForm inline action={linkAccount} hidden={{ id: p.personId }} submit="Ligar" submitClass="rounded-full border border-white/25 px-3 py-1 text-xs font-bold">
                    <input className={`${input} w-52 max-w-full py-1 text-xs`} name="email" type="email" required placeholder="Correo de su cuenta" />
                  </ActionForm>
                ) : null}
                <Link href={p.fichaHref} className="text-xs font-bold text-violeta-claro">Ficha →</Link>
              </span>
            </li>
          ))}
          {filas.length === 0 && <li className="px-4 py-3 text-texto-2">Sin resultados.</li>}
        </ul>
      </Card>

      {fichasLista.length > 1 && (
        <Card>
          <h2 className="titular mb-1 text-xl">Unir fichas duplicadas</h2>
          <p className="mb-3 text-sm text-texto-2">Los créditos de la que se une pasan a la que se queda, y la duplicada desaparece. Si una tiene cuenta, se conserva esa cuenta.</p>
          <ActionForm action={mergePeople} confirm="¿Unir estas dos fichas? No se puede deshacer (queda en la Bitácora)." submit="Unir">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-semibold">Se queda
                <select className={input} name="keep" required defaultValue="">{[<option key="" value="" disabled>Elige…</option>, ...fichasLista.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.email ? ` (${p.email})` : ""} · {p.creditos} créditos</option>)]}</select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Se une (desaparece)
                <select className={input} name="quitar" required defaultValue="">{[<option key="" value="" disabled>Elige…</option>, ...fichasLista.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.email ? ` (${p.email})` : ""} · {p.creditos} créditos</option>)]}</select>
              </label>
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
