import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GafeteVista } from "@/components/gafete/GafeteVista";
import { getGafetePublico } from "@/lib/gafete";

export const metadata: Metadata = { title: "Gafete DARF", robots: { index: false, follow: false } };

// Gafete escaneado con un celular (0078): nombre, papel y solo los datos que la persona eligió.
export default async function GafetePublicoPage({ params }: PageProps<"/g/[token]">) {
  const { token } = await params;
  const g = await getGafetePublico(token);
  if (!g) notFound();
  const algo = g.telefono || g.correo || g.instagram || g.perfil;
  const boton = "flex w-full items-center justify-center gap-2 rounded-full border border-linea-2 px-5 py-3.5 text-sm font-bold hover:border-white/50";
  return (
    <main className="flex flex-col items-center gap-6 px-5 pb-24 pt-10">
      <GafeteVista nombre={g.nombre} fotoUrl={g.retratoUrl} franja={g.franja} papel={g.papel} obra={g.obra} temporada={g.temporada} />
      <div className="flex w-[min(340px,86vw)] flex-col gap-3">
        {algo ? (
          <>
            <a href={`/g/${token}/vcf`} className="fb fb-luz">Guardar contacto</a>
            {g.telefono && <a href={`tel:${g.telefono.replace(/[^\d+]/g, "")}`} className={boton}>📞 {g.telefono}</a>}
            {g.telefono && <a href={`https://wa.me/52${g.telefono.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noopener noreferrer" className={boton}>WhatsApp</a>}
            {g.correo && <a href={`mailto:${g.correo}`} className={boton}>✉️ {g.correo}</a>}
            {g.instagram && <a href={`https://instagram.com/${g.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className={boton}>Instagram @{g.instagram.replace(/^@/, "")}</a>}
            {g.perfil && <a href={`/artistas/${g.perfil}`} className={boton}>Ver perfil profesional →</a>}
          </>
        ) : (
          <p className="text-center text-sm text-texto-3">{g.nombre} es parte de DARF Productions.</p>
        )}
      </div>
    </main>
  );
}
