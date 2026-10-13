import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/panel/ActionForm";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { aceptarInvitacion } from "./actions";

export const metadata: Metadata = { title: "Invitación al equipo", robots: { index: false } };

type Info = { production_id: string; obra: string; email: string; roles: string[]; estado: "abierta" | "aceptada" | "cancelada" | "vencida" };

// Liga de invitación al equipo de una obra (0094). Sin sesión: crear cuenta o entrar con el correo
// invitado. Con sesión: aceptar (y si ya se aceptó sola al confirmar el correo, ir a la guía).
export default async function Invitacion({ params }: PageProps<"/invitacion/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data }, sesion] = await Promise.all([supabase.rpc("invite_info", { p_token: token }), getSession()]);
  const inv = data as Info | null;
  const aqui = `/invitacion/${encodeURIComponent(token)}`;
  const caja = "mx-auto flex w-full max-w-lg flex-col gap-4 rounded-3xl bg-telon p-7";

  if (!inv || inv.estado === "cancelada" || inv.estado === "vencida") {
    return (
      <main className="px-5 py-16">
        <section className={caja}>
          <h1 className="titular text-2xl">Esta invitación ya no sirve</h1>
          <p className="text-texto-2">{inv?.estado === "vencida" ? "Venció." : "Se canceló o la liga no es correcta."} Pide a quien te invitó que te mande una nueva.</p>
        </section>
      </main>
    );
  }
  const mismo = sesion && sesion.email.toLowerCase() === inv.email;
  return (
    <main className="px-5 py-16">
      <section className={caja}>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-oro">Invitación al equipo</p>
        <h1 className="titular text-3xl">{inv.obra}</h1>
        <p className="text-texto-2">Te invitaron como <b className="text-texto">{inv.roles.join(", ")}</b>. Con esto tendrás acceso al panel de la obra.</p>
        {inv.estado === "aceptada" ? (
          mismo
            ? <Link href={`/panel/producciones/${inv.production_id}/guia`} className="fb fb-luz self-start">Ver la guía de tu rol</Link>
            : <p className="text-texto-2">Esta invitación ya se usó.</p>
        ) : !sesion ? (
          <>
            <p className="text-sm text-texto-2">Crea tu cuenta de DARF (o entra) con el correo <b className="text-texto">{inv.email}</b>. En cuanto confirmes tu correo, quedas en el equipo.</p>
            <Link href={`/entrar?next=${encodeURIComponent(aqui)}`} className="fb fb-luz self-start">Crear cuenta o entrar</Link>
          </>
        ) : mismo ? (
          <ActionForm action={aceptarInvitacion} hidden={{ token }} submit="Aceptar invitación" submitClass="fb fb-luz self-start" />
        ) : (
          <p className="rounded-xl bg-sala p-4 text-sm text-texto-2">
            Entraste como <b className="text-texto">{sesion.email}</b>, pero la invitación es para <b className="text-texto">{inv.email}</b>.
            Cierra sesión desde <Link href="/cuenta" className="font-bold text-violeta-claro">Mi cuenta</Link> y entra con ese correo (o pide que te inviten con este).
          </p>
        )}
      </section>
    </main>
  );
}
