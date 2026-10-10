import type { Metadata } from "next";
import { PageHeading } from "@/components/PageHeading";

export const metadata: Metadata = { title: "Audiciones" };

const ESPECIALIDADES = ["Actuación", "Canto", "Baile", "Música en vivo", "Dirección", "Producción", "Técnica / crew", "Vestuario y maquillaje"];

// Audiciones y registro permanente de talento.
// Las convocatorias y el registro necesitan tablas nuevas (Fase 5): el
// formulario se muestra para revisar el diseño, pero todavía no envía nada.
export default function AudicionesPage() {
  return (
    <main className="pb-10">
      <PageHeading eyebrow="Audiciones" title="Únete al elenco">
        Convocatorias abiertas y registro permanente de talento: actores, cantantes, bailarines,
        músicos y equipo técnico.
      </PageHeading>

      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 md:px-16 lg:grid-cols-12">
        <section aria-labelledby="convocatorias" className="flex flex-col gap-4 lg:col-span-5">
          <h2 id="convocatorias" className="titular text-2xl">Convocatorias</h2>
          <div className="rounded-2xl bg-telon p-6">
            <p className="text-lg font-semibold">No hay convocatorias abiertas en este momento.</p>
            <p className="mt-2 text-texto-2">
              Cuando abramos una, aparecerá aquí con sus requisitos, fechas y formulario de inscripción.
            </p>
          </div>
        </section>

        <section aria-labelledby="registro" className="flex flex-col gap-4 lg:col-span-7">
          <h2 id="registro" className="titular text-2xl">Registro permanente</h2>
          <p className="text-texto-2">
            Déjanos tu perfil artístico aunque no haya convocatoria. Lo consultamos cuando
            preparamos una producción nueva.
          </p>
          <p role="note" className="rounded-xl border border-[#ffd400]/50 bg-[#ffd400]/10 px-4 py-3 text-sm">
            Vista previa del diseño: el envío se activará cuando se apruebe el modelo de datos de
            talento (permisos, consentimiento y conservación de datos).
          </p>
          <form className="grid gap-4 rounded-2xl bg-telon p-6 sm:grid-cols-2" aria-describedby="registro">
            <fieldset disabled className="contents">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre artístico
                <input className="rounded-lg bg-sala px-3 py-3 font-normal" name="nombre" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo
                <input className="rounded-lg bg-sala px-3 py-3 font-normal" type="email" name="correo" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Teléfono
                <input className="rounded-lg bg-sala px-3 py-3 font-normal" type="tel" name="telefono" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">Enlace a video o portafolio
                <input className="rounded-lg bg-sala px-3 py-3 font-normal" type="url" name="portafolio" />
              </label>
              <fieldset className="flex flex-col gap-2 sm:col-span-2">
                <legend className="mb-2 text-sm font-semibold">Especialidades</legend>
                <div className="flex flex-wrap gap-2">
                  {ESPECIALIDADES.map((e) => (
                    <label key={e} className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-sm">
                      <input type="checkbox" name="especialidades" value={e} /> {e}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">Experiencia
                <textarea className="min-h-28 rounded-lg bg-sala px-3 py-3 font-normal" name="experiencia" />
              </label>
              <button type="submit" className="rounded-full bg-texto px-6 py-4 text-sm font-bold uppercase tracking-[0.1em] text-sala opacity-50 sm:col-span-2">
                Enviar registro (próximamente)
              </button>
            </fieldset>
          </form>
        </section>
      </div>
    </main>
  );
}
