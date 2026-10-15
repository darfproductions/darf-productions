/* eslint-disable @next/next/no-img-element -- logos SVG del kit */
import type { Metadata } from "next";
import { GafeteVista } from "@/components/gafete/GafeteVista";
import { NoValida, Verificada } from "@/components/credencial/Verificada";
import { numeroSocio } from "@/lib/fanzone-rules";
import { getGafetePublico } from "@/lib/gafete";
import { paseGafete } from "@/lib/gafete-rules";
import { Icono } from "@/components/Icono";

export const metadata: Metadata = { title: "Credencial DARF", robots: { index: false, follow: false } };

// Credencial escaneada con un celular. Equipo (0078): gafete con nombre, papel y solo los datos que
// la persona eligió. Club Fan o cuenta (0083): verificación con nombre corto, sin contacto.
export default async function GafetePublicoPage({ params }: PageProps<"/g/[token]">) {
  const { token } = await params;
  const g = await getGafetePublico(token);
  if (!g || (g.nivel && g.nivel !== "equipo")) {
    return (
      <main className="flex flex-col items-center gap-6 px-5 pb-24 pt-12 text-center">
        <img src={g?.socio ? "/marca/fan-zone-oro.svg" : "/marca/darf-monograma.svg"} alt="DARF" className="h-10 w-auto" />
        {g ? <Verificada nombre={g.nombre} socio={g.socio ?? null} /> : <NoValida />}
      </main>
    );
  }
  const pase = paseGafete({ nombre: g.nombre, fotoUrl: g.retratoUrl, franja: g.franja, papel: g.papel, casaDesde: g.casa_desde, lealtad: g.lealtad, fanVisitas: g.fan_visitas });
  const algo = g.telefono || g.correo || g.instagram || g.perfil;
  const boton = "flex w-full items-center justify-center gap-2 rounded-full border border-linea-2 px-5 py-3.5 text-sm font-bold hover:border-white/50";
  return (
    <main className="flex flex-col items-center gap-6 px-5 pb-24 pt-10">
      <GafeteVista p={g.socio ? { ...pase, sello: `Socio ${numeroSocio(g.socio.numero)}` } : pase} />
      <div className="flex w-[min(340px,86vw)] flex-col gap-3">
        {algo ? (
          <>
            <a href={`/g/${token}/vcf`} className="fb fb-luz">Guardar contacto</a>
            {g.telefono && <a href={`tel:${g.telefono.replace(/[^\d+]/g, "")}`} className={boton}><Icono nombre="telefono" /> {g.telefono}</a>}
            {g.telefono && <a href={`https://wa.me/52${g.telefono.replace(/\D/g, "").slice(-10)}`} target="_blank" rel="noopener noreferrer" className={boton}>WhatsApp</a>}
            {g.correo && <a href={`mailto:${g.correo}`} className={boton}><Icono nombre="sobre" /> {g.correo}</a>}
            {g.instagram && <a href={`https://instagram.com/${g.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className={boton}>Instagram @{g.instagram.replace(/^@/, "")}</a>}
            {g.perfil && <a href={`/artistas/${g.perfil}`} className={boton}>Ver perfil profesional <Icono nombre="flecha-der" /></a>}
          </>
        ) : (
          <p className="text-center text-sm text-texto-3">{g.nombre} es parte de DARF Productions.</p>
        )}
      </div>
    </main>
  );
}
