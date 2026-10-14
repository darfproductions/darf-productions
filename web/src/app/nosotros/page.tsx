/* eslint-disable @next/next/no-img-element -- retratos desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { perfilUrl } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Conoce al equipo", description: "El equipo directivo de DARF Productions." };

type Cifras = { producciones: number; funciones: number; talento: number; boletos: number };

const CIFRAS: { k: keyof Cifras; texto: string }[] = [
  { k: "producciones", texto: "Producciones" },
  { k: "funciones", texto: "Funciones presentadas" },
  { k: "talento", texto: "Jóvenes en escena y detrás" },
  { k: "boletos", texto: "Boletos vendidos" },
];

// Sin celdas vacías: la rejilla se acomoda a cuántas cifras hay.
const COLUMNAS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3", 4: "grid-cols-2 lg:grid-cols-4" };

type Miembro = { id: string; nombre: string; cargo: string; slug: string | null; retrato_path: string | null; semblanza: string | null };

// Conoce al equipo (0063): directivos de DARF. Foto y perfil solo si la persona hizo público su perfil.
export default async function Nosotros() {
  const supabase = await createClient();
  const [{ data }, stats] = await Promise.all([supabase.rpc("team_public"), supabase.rpc("public_stats")]);
  const equipo = (data ?? []) as Miembro[];
  // Cifras de la base (0073); una en cero no se muestra para no verse vacía.
  const cifras = stats.data ? CIFRAS.filter((c) => Number((stats.data as Cifras)[c.k]) > 0) : [];
  return (
    <main className="pb-16">
      <PageHeading eyebrow="Nosotros" title="Conoce al equipo">
        Las personas que hacen posible cada temporada de DARF Productions.
      </PageHeading>
      {cifras.length > 0 && (
        <section aria-label="DARF en cifras" className="mx-auto max-w-[1440px] px-5 pb-14 md:px-16">
          <dl className={`grid gap-px overflow-hidden rounded-[22px] border border-linea bg-linea ${COLUMNAS[cifras.length]}`}>
            {cifras.map((c) => (
              <div key={c.k} className="flex flex-col gap-2 bg-telon p-6 md:p-8">
                <dt className="order-2 text-[12.5px] font-semibold text-texto-3">{c.texto}</dt>
                <dd className="num txt-luz text-[clamp(2.4rem,5vw,3.75rem)] font-black leading-none tracking-[-0.04em]">{Number((stats.data as Cifras)[c.k]).toLocaleString("es-MX")}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
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
                    {m.slug && <span className="mt-1 text-sm font-bold text-texto-2 group-hover:text-white">Ver perfil <Icono nombre="flecha-der" /></span>}
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
