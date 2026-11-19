/* eslint-disable @next/next/no-img-element -- retratos desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { perfilUrl } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Conoce al equipo", description: "El equipo directivo de DARF Productions." };

type Cifras = { producciones: number; funciones: number; talento: number; anios: number; temporadas: number };

// Diego 2026-11-19: sin "Boletos vendidos"; en su lugar, años haciendo teatro y temporadas.
const CIFRAS: { k: keyof Cifras; texto: string }[] = [
  { k: "anios", texto: "Años haciendo teatro" },
  { k: "producciones", texto: "Producciones" },
  { k: "temporadas", texto: "Temporadas" },
  { k: "funciones", texto: "Funciones presentadas" },
  { k: "talento", texto: "Jóvenes en escena y detrás" },
];

/** Año en que empezó DARF Productions (para "Años haciendo teatro"). */
const ANIO_INICIO = 2025;

// Sin celdas vacías: la rejilla se acomoda a cuántas cifras hay (con 3 o 5 en celular, la primera va a lo ancho).
const COLUMNAS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 lg:grid-cols-4", 5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" };
const PRIMERA_ANCHA: Record<number, string> = { 3: "col-span-2 sm:col-span-1", 5: "col-span-2 sm:col-span-1" };

type Miembro = { id: string; nombre: string; cargo: string; slug: string | null; retrato_path: string | null; semblanza: string | null; directivo?: boolean; descripcion?: string | null };

/** 0145: las cabezas de la empresa aparte y primero; si nadie está marcado, una sola lista como antes. */
function grupos(equipo: Miembro[]): [string, Miembro[], boolean][] {
  const cabezas = equipo.filter((m) => m.directivo);
  if (!cabezas.length) return [["", equipo, false]];
  const resto = equipo.filter((m) => !m.directivo);
  return resto.length ? [["Dirección", cabezas, true], ["Equipo", resto, false]] : [["Dirección", cabezas, true]];
}

// Conoce al equipo (0063): directivos de DARF. Foto y perfil solo si la persona hizo público su perfil.
export default async function Nosotros() {
  const supabase = await createClient();
  const [{ data }, stats, obras] = await Promise.all([
    supabase.rpc("team_public"), supabase.rpc("public_stats"),
    supabase.from("productions").select("temporada").in("estado", ["publicada", "archivada"]),
  ]);
  const equipo = (data ?? []) as Miembro[];
  // Temporadas distintas de las obras públicas ("2025" y "Temporada 2025" cuentan como la misma).
  const temporadas = new Set(((obras.data ?? []) as { temporada: string | null }[])
    .map((o) => (o.temporada ?? "").toLowerCase().replace(/temporada/g, "").trim()).filter(Boolean)).size;
  const anioMx = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Mexico_City" }).format(new Date()));
  const valores: Cifras | null = stats.data ? { ...(stats.data as Cifras), anios: anioMx - ANIO_INICIO, temporadas } : null;
  // Cifras de la base (0073); una en cero no se muestra para no verse vacía.
  const cifras = valores ? CIFRAS.filter((c) => Number(valores[c.k]) > 0) : [];
  return (
    <main className="pb-16">
      <PageHeading eyebrow="Nosotros" title="Conoce al equipo">
        Las personas que hacen posible cada temporada de DARF Productions.
      </PageHeading>
      {cifras.length > 0 && (
        <section aria-label="DARF en cifras" className="mx-auto max-w-[1440px] px-5 pb-14 md:px-16">
          <dl className={`grid gap-px overflow-hidden rounded-[22px] border border-linea bg-linea ${COLUMNAS[cifras.length]}`}>
            {cifras.map((c, i) => (
              <div key={c.k} className={`flex flex-col gap-2 bg-telon p-6 md:p-8 ${i === 0 ? PRIMERA_ANCHA[cifras.length] ?? "" : ""}`}>
                <dt className="order-2 text-[12.5px] font-semibold text-texto-3">{c.k === "anios" && valores![c.k] === 1 ? "Año haciendo teatro" : c.k === "temporadas" && valores![c.k] === 1 ? "Temporada" : c.texto}</dt>
                <dd className="num txt-luz text-[clamp(2.4rem,5vw,3.75rem)] font-black leading-none tracking-[-0.04em]">{Number(valores![c.k]).toLocaleString("es-MX")}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <div className="mx-auto max-w-[1440px] px-5 md:px-16">
        {equipo.length === 0 ? (
          <p className="rounded-2xl bg-telon p-6 text-texto-2">Muy pronto conocerás a nuestro equipo.</p>
        ) : grupos(equipo).map(([titulo, lista, cabezas]) => (
          <section key={titulo || "equipo"} aria-label={titulo || "Equipo"} className={cabezas ? "pb-16" : ""}>
          {titulo && <h2 className="mb-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.32em] text-oro before:h-px before:w-8 before:bg-current">{titulo}</h2>}
          <ul className={`grid gap-6 sm:grid-cols-2 ${cabezas ? "lg:grid-cols-4" : "lg:grid-cols-3 xl:grid-cols-4"}`}>
            {lista.map((m) => {
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
                    {m.descripcion && <p className="mt-1 text-sm text-texto">{m.descripcion}</p>}
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
          </section>
        ))}
      </div>
    </main>
  );
}
