import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/PageHeading";
import { ESTADO_CONVOCATORIA } from "@/lib/audition-rules";
import { formatSlot, getPermanentRegistry, listPublicAuditions } from "@/lib/auditions";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Audiciones" };

const ESPECIALIDADES = ["Actuación", "Canto", "Baile", "Música en vivo", "Dirección", "Producción", "Técnica / crew", "Vestuario y maquillaje"];

// Audiciones: convocatorias abiertas (0036) y el Registro permanente de talento (0064),
// que es una convocatoria general siempre abierta y en línea.
export default async function AudicionesPage() {
  const [convocatorias, permanente] = await Promise.all([listPublicAuditions(), getPermanentRegistry()]);
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Audiciones" title="Únete al elenco">
        Convocatorias abiertas y registro permanente de talento: actores, cantantes, bailarines,
        músicos y equipo técnico.
      </PageHeading>

      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:px-16 lg:grid-cols-12">
        <section aria-labelledby="convocatorias" className="flex flex-col gap-4 lg:col-span-5">
          <h2 id="convocatorias" className="titular text-2xl">Convocatorias</h2>
          {convocatorias.length === 0 ? (
            <div className="rounded-2xl bg-telon p-6">
              <p className="text-lg font-semibold">No hay convocatorias abiertas en este momento.</p>
              <p className="mt-2 text-texto-2">
                Cuando abramos una, aparecerá aquí con sus requisitos, fechas y formulario de inscripción.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {convocatorias.map((a) => (
                <li key={a.id}>
                  <Link href={`/audiciones/${a.id}`} className="block rounded-2xl bg-telon p-6 transition-transform hover:-translate-y-0.5">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-texto-3">{a.productions?.nombre ?? "Convocatoria general"} · {ESTADO_CONVOCATORIA[a.estado]}</p>
                    <p className="mt-1 text-xl font-bold">{a.titulo}</p>
                    {a.inscripcion_cierra && <p className="mt-1 text-sm text-texto-2">Inscripción hasta el {formatSlot(a.inscripcion_cierra).toLowerCase()}</p>}
                    <span className="mt-3 inline-block text-sm font-bold text-violeta-claro">{a.estado === "abierta" ? "Ver e inscribirme" : "Ver detalles"} <Icono nombre="flecha-der" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="registro" className="flex flex-col gap-4 lg:col-span-7">
          <h2 id="registro" className="titular text-2xl">Registro permanente</h2>
          <p className="text-texto-2">
            Déjanos tu perfil artístico aunque no haya convocatoria. Lo consultamos cuando
            preparamos una producción nueva.
          </p>
          {permanente ? (
            <div className="flex flex-col gap-4 rounded-2xl bg-telon p-6">
              <p className="text-texto-2">Cuéntanos tu especialidad y compártenos un video o portafolio. Te guardamos en nuestro registro de talento hasta que tú decidas darte de baja desde Mi cuenta.</p>
              <ul className="flex flex-wrap gap-2">
                {ESPECIALIDADES.map((e) => <li key={e} className="rounded-full border border-white/20 px-3 py-1.5 text-sm">{e}</li>)}
              </ul>
              <Link href={`/audiciones/${permanente.id}`} className="self-start rounded-full bg-texto px-6 py-4 text-sm font-bold uppercase tracking-[0.1em] text-sala">Registrarme <Icono nombre="flecha-der" /></Link>
            </div>
          ) : (
            <p className="rounded-2xl bg-telon p-6 text-texto-2">Muy pronto podrás dejarnos tu perfil aquí.</p>
          )}
        </section>
      </div>
    </main>
  );
}
