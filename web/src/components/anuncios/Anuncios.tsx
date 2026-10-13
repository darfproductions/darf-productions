import { AnuncioCard, type TonoAnuncio } from "@/components/anuncios/AnuncioCard";
import type { AnuncioLugar } from "@/lib/anuncio-rules";
import { getAnuncios } from "@/lib/anuncios";
import { getSession } from "@/lib/auth";

// Sección de anuncios (0074) para el inicio, la página de una obra o la Fan Zone.
// Si no hay anuncios vigentes no se muestra nada.
export async function Anuncios({ lugar, pid = null, tono, titulo = "Anuncios", eyebrow = "Lo que viene", className = "" }: {
  lugar: AnuncioLugar;
  pid?: string | null;
  tono: TonoAnuncio;
  titulo?: string;
  eyebrow?: string;
  className?: string;
}) {
  const [anuncios, session] = await Promise.all([getAnuncios(lugar, pid), getSession()]);
  if (!anuncios.length) return null;
  const eyebrowColor = tono === "obra" ? "text-obra-acento" : "text-oro";
  return (
    <section id="anuncios" aria-labelledby="anuncios-t" className={`flex scroll-mt-24 flex-col gap-7 ${className}`}>
      <div className="flex flex-col gap-3">
        <p className={`flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.32em] ${eyebrowColor} before:h-px before:w-8 before:bg-current`}>{eyebrow}</p>
        <h2 id="anuncios-t" className="text-[clamp(1.8rem,4vw,2.75rem)] font-black uppercase leading-[0.95] tracking-[-0.04em]">{titulo}</h2>
      </div>
      <ul className={`grid gap-5 ${anuncios.length === 1 ? "max-w-3xl" : "md:grid-cols-2"} ${anuncios.length > 2 ? "xl:grid-cols-3" : ""}`}>
        {anuncios.map((a) => <li key={a.id}><AnuncioCard a={a} tono={tono} conCuenta={!!session} /></li>)}
      </ul>
    </section>
  );
}
