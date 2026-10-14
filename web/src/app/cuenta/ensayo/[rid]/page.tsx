import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListaAsistencia, type FilaLista } from "@/components/ensayos/ListaAsistencia";
import { Icono } from "@/components/Icono";
import { AutoRefresh } from "@/components/panel/AutoRefresh";
import { horaMx } from "@/lib/acceso-rules";
import { requireSession } from "@/lib/auth";
import { citados, fechaEnsayo, puedeAbrirYa, type Rehearsal } from "@/lib/rehearsal-rules";
import { createClient } from "@/lib/supabase/server";
import { AbrirEnsayo } from "./AbrirEnsayo";

export const metadata: Metadata = { title: "Pasar lista" };

// Pasar lista desde Mi cuenta (0099): el encargado abre el ensayo y pasa lista con QR o a mano. También
// sirve a dirección, maestros y producción. La base decide quién puede (puede_pasar_lista).
export default async function PasarLista({ params }: PageProps<"/cuenta/ensayo/[rid]">) {
  const { rid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(rid)) notFound();
  const session = await requireSession(`/cuenta/ensayo/${rid}`);
  const supabase = await createClient();
  const { data: r } = await supabase.from("rehearsals").select("*, productions(nombre)").eq("id", rid).maybeSingle();
  if (!r) notFound();
  const e = r as Rehearsal & { production_id: string; productions: { nombre: string } | null };
  const pid = e.production_id;
  const [{ data: puede }, { data: lider }] = await Promise.all([
    supabase.rpc("puede_pasar_lista", { rid }),
    supabase.rpc("has_perm", { pid, perm: "ensayos.gestionar" }),
  ]);
  const encargado = !!e.encargados?.includes(session.userId);
  const filas = puede ? (((await supabase.rpc("rehearsal_roster", { rid })).data ?? []) as FilaLista[]) : [];
  const abrirDesde = horaMx(new Date(new Date(e.inicia).getTime() - 3600_000).toISOString());

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-5 pb-16 pt-8">
      {puede && <AutoRefresh seconds={10} />}
      <Link href="/cuenta" className="text-sm font-bold text-lila"><Icono nombre="flecha-izq" /> Mi cuenta</Link>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-texto-3">{e.productions?.nombre ?? "Ensayo"}</p>
        <h1 className="titular mt-1 text-3xl">{e.titulo}</h1>
        <p className="text-sm text-texto-2">{fechaEnsayo(e.inicia, e.termina)}{e.lugar ? ` · ${e.lugar}` : ""}</p>
        <p className="text-xs text-texto-3">Citados: {citados(e)}</p>
      </div>
      {e.estado === "cancelado" ? (
        <p className="rounded-2xl bg-telon p-5 text-texto-2">Este ensayo está cancelado.</p>
      ) : puede ? (
        <ListaAsistencia pid={pid} rid={rid} ensayo={e} filas={filas} puede lider={lider === true} />
      ) : encargado && e.cerrado_at ? (
        <p className="rounded-2xl bg-telon p-5 text-texto-2">La lista de este ensayo ya se cerró a las {horaMx(e.cerrado_at)}.</p>
      ) : encargado && e.abierto_at ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-telon p-5">
          <p className="font-bold">El ensayo ya está abierto (desde las {horaMx(e.abierto_at)}).</p>
          <p className="text-sm text-texto-2">Para pasar lista tú también, pide a quien lo abrió que escanee tu QR. En cuanto quedes registrado, esta página te deja pasar lista.</p>
          <Link href="/cuenta#credencial" className="self-start text-sm font-bold text-violeta-claro">Abrir mi QR <Icono nombre="flecha-der" /></Link>
        </div>
      ) : encargado && puedeAbrirYa(e.inicia) ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-telon p-5">
          <p className="text-texto-2">Eres encargado de este ensayo. Al abrirlo quedas registrado y puedes pasar lista con el QR de cada persona o a mano.</p>
          <AbrirEnsayo pid={pid} rid={rid} />
        </div>
      ) : encargado ? (
        <p className="rounded-2xl bg-telon p-5 text-texto-2">Eres encargado de este ensayo. Podrás abrirlo el mismo día desde las {abrirDesde}.</p>
      ) : (
        <p className="rounded-2xl bg-telon p-5 text-texto-2">No eres encargado de este ensayo. Si te toca pasar lista, pide que te agreguen como encargado.</p>
      )}
    </main>
  );
}
