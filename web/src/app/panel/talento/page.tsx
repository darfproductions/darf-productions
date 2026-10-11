import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { requireDirector } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { linkAccount, mergePeople } from "./actions";

export const metadata: Metadata = { title: "Talento" };

type P = { id: string; profile_id: string | null; nombre: string; email: string | null; obras: string[]; creditos: number };

// Directorio de personas (solo el Director): buscar, abrir su ficha, unir duplicadas y ligar a su cuenta.
export default async function Talento({ searchParams }: PageProps<"/panel/talento">) {
  await requireDirector("/panel/talento");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const supabase = await createClient();
  const { data } = await supabase.rpc("people_directory", { q: q || null });
  const gente = (data ?? []) as P[];
  return (
    <>
      <PanelTitle eyebrow="Panel" title="Talento">
        Todas las personas que han estado en DARF. Abre su ficha para ver audiciones, obras y videos. Si una persona aparece dos veces (por ejemplo, con y sin acento), únelas.
      </PanelTitle>
      <form className="flex gap-2"><input className={`${input} max-w-md flex-1`} name="q" defaultValue={q} placeholder="Buscar por nombre (sin importar acentos)" /><button className="rounded-full bg-texto px-5 text-sm font-bold text-sala">Buscar</button></form>
      <Card className="p-0 md:p-0">
        <ul className="divide-y divide-white/10">
          {gente.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>
                <b>{p.nombre}</b> {p.email ? <span className="text-texto-3">· {p.email}</span> : <span className="text-xs text-[#fde68a]">· sin cuenta</span>}
                <span className="block text-xs text-texto-3">{p.obras.join(", ") || "Sin créditos"} · {p.creditos} créditos</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {p.profile_id && <Link href={`/panel/talento/${p.profile_id}`} className="text-xs font-bold text-violeta-claro">Ver ficha →</Link>}
                {!p.email && (
                  <ActionForm inline action={linkAccount} hidden={{ id: p.id }} submit="Ligar" submitClass="rounded-full border border-white/25 px-3 py-1 text-xs font-bold">
                    <input className={`${input} w-52 py-1 text-xs`} name="email" type="email" required placeholder="Correo de su cuenta" />
                  </ActionForm>
                )}
              </span>
            </li>
          ))}
          {gente.length === 0 && <li className="px-4 py-3 text-texto-2">Sin resultados.</li>}
        </ul>
      </Card>
      {gente.length > 1 && (
        <Card>
          <h2 className="titular mb-1 text-xl">Unir fichas duplicadas</h2>
          <p className="mb-3 text-sm text-texto-2">Los créditos de la que se une pasan a la que se queda, y la duplicada desaparece. Si una tiene cuenta, se conserva esa cuenta.</p>
          <ActionForm action={mergePeople} confirm="¿Unir estas dos fichas? No se puede deshacer (queda en la Bitácora)." submit="Unir">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-semibold">Se queda
                <select className={input} name="keep" required defaultValue="">{[<option key="" value="" disabled>Elige…</option>, ...gente.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.email ? ` (${p.email})` : ""} · {p.creditos} créditos</option>)]}</select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">Se une (desaparece)
                <select className={input} name="quitar" required defaultValue="">{[<option key="" value="" disabled>Elige…</option>, ...gente.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.email ? ` (${p.email})` : ""} · {p.creditos} créditos</option>)]}</select>
              </label>
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
