import type { Metadata } from "next";
import Link from "next/link";
import { UnirseClub } from "@/components/fanzone/UnirseClub";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { numeroSocio } from "@/lib/fanzone-rules";
import { Icono, type IconoNombre } from "@/components/Icono";

export const metadata: Metadata = {
  title: "Club Fan",
  description: "Únete gratis al Club Fan de DARF Productions: preventas, ensayos y making of, foto con el elenco, eventos exclusivos y tu credencial con número de socio.",
};

const BENEFICIOS: [IconoNombre, string, string][] = [
  ["boleto", "Preventa de boletos", "Cuando una obra tiene preventa, el club compra antes que nadie. Te avisamos al teléfono cuando empieza."],
  ["claqueta", "Detrás del telón", "Ensayos, making of y fotos de cada producción, exclusivos en la Fan Zone."],
  ["camara", "Foto con el elenco", "Aparta tu lugar en el encuentro con el elenco de tu función, cuando la obra lo abra."],
  ["destello", "Eventos del club", "Eventos solo para socios, presenciales o en línea. Entras con tu credencial."],
  ["credencial", "Tu credencial", "Credencial digital con tu número de socio y QR. Los primeros 100 son Fan fundador."],
  ["megafono", "Primero en enterarte", "Anuncios solo para el club: revelaciones de elenco, nuevas fechas y audiciones."],
];

const PREGUNTAS: [string, string][] = [
  ["¿Cuánto cuesta?", "Nada. El Club Fan es gratis; solo necesitas una cuenta de DARF."],
  ["¿Qué datos usan?", "Solo los de tu cuenta (nombre y correo). Los detalles están en el Aviso de privacidad."],
  ["¿Puedo salirme?", "Sí, cuando quieras, desde Mi cuenta, en la sección Club Fan. Tus boletos y lugares apartados se quedan; tu número de socio no se guarda."],
];

// Club Fan (Bloque 4C): página pública con los beneficios y cómo unirse. La Fan Zone es la casa del club.
export default async function ClubFanPage() {
  const session = await getSession();
  const yo = session ? (await (await createClient()).rpc("fan_me")).data as { numero: number } | null : null;
  return (
    <main className="pb-24">
      <section className="relative overflow-hidden border-b border-oro/25 bg-[#08070c]">
        <div aria-hidden="true" className="cono-oro absolute -top-64 left-[30%] h-[900px] w-[700px]" />
        <div className="relative mx-auto flex max-w-[1100px] flex-col items-start gap-6 px-5 py-14 md:px-16 md:py-20">
          <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" className="h-9 w-auto md:h-11" />
          <h1 className="display text-[clamp(2.4rem,6vw,5rem)]">El <span className="txt-oro">Club Fan</span> de DARF</h1>
          <p className="lead max-w-2xl">Para quienes viven el teatro desde antes de que se abra el telón. Es gratis y te unes en un toque.</p>
          {yo ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="chip chip-oro">Ya eres socio {numeroSocio(yo.numero)}</span>
              <Link href="/fan-zone" className="fb fb-fz">Entrar a la Fan Zone</Link>
            </div>
          ) : session ? (
            <UnirseClub />
          ) : (
            <Link href={`/entrar?next=${encodeURIComponent("/club-fan")}`} className="fb fb-fz">Crear cuenta y unirme · gratis</Link>
          )}
        </div>
      </section>
      <div className="mx-auto flex max-w-[1100px] flex-col gap-14 px-5 pt-12 md:px-16">
        <section aria-labelledby="beneficios">
          <h2 id="beneficios" className="titular mb-6 text-2xl md:text-3xl">Beneficios</h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFICIOS.map(([i, t, d]) => (
              <li key={t} className="flex flex-col gap-2 rounded-[22px] border border-oro/25 bg-telon p-6">
                <Icono nombre={i} className="h-7 w-7 text-oro-claro" />
                <strong className="text-oro-claro">{t}</strong>
                <span className="text-sm text-texto-2">{d}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="preguntas">
          <h2 id="preguntas" className="titular mb-6 text-2xl md:text-3xl">Preguntas</h2>
          <dl className="flex flex-col divide-y divide-white/10 rounded-[22px] bg-telon">
            {PREGUNTAS.map(([p, r]) => (
              <div key={p} className="flex flex-col gap-1 p-6">
                <dt className="font-bold">{p}</dt>
                <dd className="text-sm text-texto-2">{r}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}
