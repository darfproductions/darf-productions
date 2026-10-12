/* eslint-disable @next/next/no-img-element -- retratos desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { perfilUrl } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Conoce al equipo", description: "El equipo directivo de DARF Productions." };

type Miembro = { id: string; nombre: string; cargo: string; slug: string | null; retrato_path: string | null; semblanza: string | null };

// Conoce al equipo (0063): directivos de DARF. Foto y perfil solo si la persona hizo público su perfil.
export default async function Nosotros() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("team_public");
  const equipo = (data ?? []) as Miembro[];
  return (
    <main className="pb-16">
      <PageHeading eyebrow="Nosotros" title="Conoce al equipo">
        Las personas que hacen posible cada temporada de DARF Productions.
      </PageHeading>
      <div className="mx-auto max-w-[1440px] px-5 md:px-16">
        {equipo.length === 0 ? (
          <p className="rounded-2xl bg-telon p-6 text-texto-2">Muy pronto conocerás a nuestro equipo.</p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {equipo.map((m) => {
              const tarjeta = (
                <>
                  <div className="overflow-hidden rounded-2xl bg-telon-2">
                    {m.retrato_path ? (
                      <img src={perfilUrl(m.retrato_path)} alt={`Retrato de ${m.nombre}`} className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                    ) : (
                      <div className="grid aspect-[4/5] place-items-center text-6xl font-black text-texto-3">{m.nombre.slice(0, 1)}</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 pt-4">
                    <p className="text-xl font-bold">{m.nombre}</p>
                    <p className="text-sm font-bold uppercase tracking-[0.14em] text-violeta-claro">{m.cargo}</p>
                    {m.semblanza && <p className="mt-1 line-clamp-3 text-sm text-texto-2">{m.semblanza}</p>}
                    {m.slug && <span className="mt-1 text-sm font-bold text-texto-2 group-hover:text-white">Ver perfil →</span>}
                  </div>
                </>
              );
              return (
                <li key={m.id}>
                  {m.slug ? <Link href={`/artistas/${m.slug}`} className="group block">{tarjeta}</Link> : <div>{tarjeta}</div>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
