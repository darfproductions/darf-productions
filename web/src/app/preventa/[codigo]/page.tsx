import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Preventa privada", robots: { index: false } };

// Liga de preventa privada (0123): con sesión, el código se canjea a la cuenta (es idempotente) y lleva a la obra.
// Sin sesión, primero entra o crea cuenta y regresa aquí.
export default async function PreventaCodigo({ params }: PageProps<"/preventa/[codigo]">) {
  const { codigo } = await params;
  const aqui = `/preventa/${encodeURIComponent(codigo)}`;
  const session = await getSession();
  type Canje = { production_id?: string; obra?: string; error?: string };
  let r: Canje | null = null;
  let error = "";
  if (session) {
    const res = await (await createClient()).rpc("preventa_canjear", { p_codigo: decodeURIComponent(codigo) });
    if (res.error) error = res.error.message;
    else r = res.data as Canje;
    if (r?.error) error = r.error;
  }
  return (
    <main className="pb-24">
      <PageHeading eyebrow="Preventa privada" title={r?.obra && !error ? r.obra : "Tu invitación"} />
      <div className="mx-auto max-w-2xl px-5 md:px-16">
        <div className="flex flex-col items-start gap-4 rounded-2xl bg-telon p-8">
          {!session ? (
            <>
              <p className="text-lg">Te invitaron a una preventa privada de DARF Productions. Entra o crea tu cuenta para activar tu acceso.</p>
              <Link href={`/entrar?next=${encodeURIComponent(aqui)}`} className="fb fb-luz">Entrar o crear cuenta</Link>
            </>
          ) : error ? (
            <>
              <p role="alert" className="text-lg">{error}</p>
              <p className="text-sm text-texto-2">Revisa la liga o pide un código nuevo a quien te invitó.</p>
              <Link href="/producciones" className="fb fb-luz">Ver producciones</Link>
            </>
          ) : (
            <>
              <p className="text-2xl font-black uppercase tracking-[-0.02em]">¡Listo! Tienes acceso</p>
              <p className="text-texto-2">Ya puedes apartar en la preventa privada de <b>{r?.obra}</b> antes que nadie. Tu acceso queda en tu cuenta: entra con ella cuando quieras.</p>
              <Link href={`/producciones/${r?.production_id}#funciones`} className="fb fb-luz">Ver funciones</Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
