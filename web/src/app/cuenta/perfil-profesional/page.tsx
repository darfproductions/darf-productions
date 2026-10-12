import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { ProProfileEditor } from "@/components/pro/ProProfileEditor";
import { edad } from "@/lib/member-rules";
import { requireSession } from "@/lib/auth";
import { getPro } from "@/lib/pro-profile";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Perfil profesional" };

// Mi perfil profesional (0057): retrato, semblanza, trayectoria, habilidades, redes y galería.
export default async function MiPerfilProfesional() {
  const session = await requireSession("/cuenta/perfil-profesional");
  const supabase = await createClient();
  const { data: pid, error } = await supabase.rpc("my_person");
  const { pro, fotos } = pid ? await getPro(pid as string) : { pro: null, fotos: [] };
  const e = edad(session.profile?.fecha_nacimiento ?? null);
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Mi cuenta" title="Perfil profesional">
        Lo que verán directores y público de ti como artista. Es distinto de tu foto personal de la cuenta.
      </PageHeading>
      <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-5">
        <Link href="/cuenta" className="text-sm font-bold text-violeta-claro">← Mi cuenta</Link>
        {error || !pid ? <p className="text-[#ff8fa3]">No se pudo abrir tu perfil. Intenta de nuevo.</p> : (
          <ProProfileEditor pid={pid as string} nombre={session.profile?.nombre || session.email} pro={pro} fotos={fotos} team={false} esMenor={e !== null && e < 18} />
        )}
      </div>
    </main>
  );
}
