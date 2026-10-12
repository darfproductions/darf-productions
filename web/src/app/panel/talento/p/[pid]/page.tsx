import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { TIPO_CREDITO } from "@/lib/casting-rules";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { linkAccount } from "../../actions";

export const metadata: Metadata = { title: "Ficha de persona" };

type H = { id: string; nombre: string; profile_id: string | null; obras: { production_id: string; obra: string; tipo: string; papel: string | null; activo: boolean }[] };

// Ficha de una persona del elenco. Si ya tiene cuenta, se abre su ficha de talento completa;
// si no (por ejemplo, de la 1.0), muestra sus obras y el Director puede ligarla a su cuenta.
export default async function PersonPage({ params }: PageProps<"/panel/talento/p/[pid]">) {
  const { pid } = await params;
  const access = await requirePanel(`/panel/talento/p/${pid}`);
  if (!/^[0-9a-f-]{36}$/.test(pid)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("person_history", { pid });
  if (error || !data) notFound();
  const h = data as H;
  if (h.profile_id) redirect(`/panel/talento/${h.profile_id}`);
  return (
    <>
      <PanelTitle eyebrow="Ficha de persona" title={h.nombre}>Sin cuenta en la página todavía.</PanelTitle>
      <Card>
        <h2 className="titular mb-3 text-xl">Obras ({h.obras.length})</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {h.obras.map((o, i) => (
            <li key={i}><Link href={`/panel/producciones/${o.production_id}/elenco`} className="font-bold hover:underline">{o.obra}</Link> · {TIPO_CREDITO[o.tipo] ?? o.tipo}{o.papel ? ` · ${o.papel}` : ""}{!o.activo ? " · baja" : ""}</li>
          ))}
        </ul>
      </Card>
      {access.isDirector && (
        <Card>
          <h2 className="titular mb-1 text-xl">Ligar a su cuenta</h2>
          <p className="mb-3 text-sm text-texto-2">Si esta persona ya tiene cuenta en la página, escribe su correo: sus obras, audiciones y compras quedarán en una sola ficha.</p>
          <ActionForm action={linkAccount} hidden={{ id: h.id }} submit="Ligar">
            <input className={`${input} max-w-md`} name="email" type="email" required placeholder="Correo de su cuenta" />
          </ActionForm>
          <p className="mt-2 text-xs text-texto-3">¿Aparece dos veces? Únelas en <Link href={`/panel/talento?q=${encodeURIComponent(h.nombre.split(" ")[0])}`} className="text-violeta-claro">Talento</Link>.</p>
        </Card>
      )}
    </>
  );
}
