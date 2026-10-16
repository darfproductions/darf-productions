/* eslint-disable @next/next/no-img-element -- fotos desde Storage */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/PageHeading";
import { Icono } from "@/components/Icono";
import { formatPerformanceDate, getProduction } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

// 0114: fotos de cada función. El aviso "Ya están las fotos de tu función" trae aquí con ?funcion=<id>.

export async function generateMetadata({ params }: PageProps<"/producciones/[slug]/fotos">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProduction(slug);
  return { title: data ? `Fotos · ${data.production.nombre}` : "Fotos", alternates: { canonical: `/producciones/${slug}/fotos` } };
}

export default async function FotosFuncion({ params, searchParams }: PageProps<"/producciones/[slug]/fotos">) {
  const { slug } = await params;
  const pedida = (await searchParams).funcion;
  const data = await getProduction(slug);
  if (!data) notFound();
  const p = data.production;
  const supabase = await createClient();
  const { data: rows } = await supabase.from("gallery_photos").select("id, path, performance_id")
    .eq("production_id", p.id).eq("kind", "galeria").not("performance_id", "is", null).order("sort_order");
  const fotos = (rows ?? []).map((r) => ({ ...r, url: supabase.storage.from("gallery").getPublicUrl(r.path).data.publicUrl }));
  const funciones = data.performances.filter((f) => fotos.some((x) => x.performance_id === f.id)).reverse();
  const sel = funciones.find((f) => f.id === pedida) ?? funciones[0];
  const deSel = sel ? fotos.filter((x) => x.performance_id === sel.id) : [];

  return (
    <main className="pb-24">
      <PageHeading eyebrow={p.nombre} title="Fotos de cada función">
        {sel ? <>Función del {formatPerformanceDate(sel.starts_at).toLowerCase()}. Toca una foto para verla completa y descargarla.</> : "Aún no hay fotos de funciones."}
      </PageHeading>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-5 md:px-16">
        {funciones.length > 1 && (
          <nav aria-label="Funciones" className="flex flex-wrap gap-2">
            {funciones.map((f) => (
              <Link key={f.id} href={`/producciones/${p.id}/fotos?funcion=${f.id}`} aria-current={f.id === sel?.id ? "page" : undefined}
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${f.id === sel?.id ? "border-white bg-white text-sala" : "border-white/25 hover:border-white/60"}`}>
                {formatPerformanceDate(f.starts_at)}
              </Link>
            ))}
          </nav>
        )}
        {deSel.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {deSel.map((ph, i) => (
              <li key={ph.id} className="overflow-hidden rounded-[18px] bg-telon">
                <a href={ph.url} target="_blank" rel="noreferrer" aria-label={`Abrir foto ${i + 1} de ${deSel.length}`}>
                  <img src={ph.url} alt={`${p.nombre}: foto ${i + 1} de ${deSel.length}`} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform duration-500 hover:scale-[1.03]" />
                </a>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/producciones/${p.id}`} className="self-start text-sm font-bold text-lila"><Icono nombre="flecha-izq" /> Volver a {p.nombre}</Link>
      </div>
    </main>
  );
}
