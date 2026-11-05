import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card } from "@/components/panel/ui";
import { ImageUpload } from "@/components/panel/ImageUpload";
import { Icono } from "@/components/Icono";
import { FichaForm, HitosEditor, LugaresEditor, cargarHitosLugares, textoHito, type FichaObra } from "@/components/panel/obra/FichaEditor";
import { PersonajesEditor, cargarPersonajes } from "@/components/panel/obra/PersonajesEditor";
import { PuestosEditor, cargarPuestos, estadoPuesto } from "@/components/panel/obra/PuestosEditor";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { assetUrl } from "@/lib/productions";
import { CATEGORIAS, PASOS, textoMeses } from "@/lib/produccion-nueva-rules";
import { createClient } from "@/lib/supabase/server";
import { themeProblems } from "@/lib/themes";
import { ColorsForm } from "../pagina/ColorsForm";
import { saveKitImage } from "../pagina/actions";
import { irAPaso, terminarAsistente } from "../../obra-actions";

export const metadata: Metadata = { title: "Nueva producción" };

type Obra = FichaObra & {
  nombre: string; temporada: string | null; asistente_paso: number | null; logo_path: string | null; ambiente_path: string | null;
  color_fondo: string | null; color_superficie: string | null; color_texto: string | null; color_acento: string | null;
};
const COLS = "nombre, temporada, estado, asistente_paso, logo_path, ambiente_path, color_fondo, color_superficie, color_texto, color_acento, frase, sinopsis, duracion, clasificacion, basada_en, idioma, venue, tentativa_desde, tentativa_hasta";
const Check = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <li className="flex items-start gap-2 text-sm"><span className={`mt-0.5 font-bold ${ok ? "text-exito" : "text-aviso"}`}>{ok ? <Icono nombre="check" etiqueta="Listo" /> : <Icono nombre="punto" className="h-2 w-2" etiqueta="Falta" />}</span><span className={ok ? "" : "text-texto-2"}>{children}</span></li>
);

// Crear una producción paso a paso (0135): identidad, ficha, equipo, personajes y revisar. Se guarda en cada paso:
// puedes salirte y seguir después (la obra queda como proyecto en borrador desde el primer paso).
export default async function Asistente({ params, searchParams }: PageProps<"/panel/producciones/[id]/asistente">) {
  const { id } = await params;
  const sp = await searchParams;
  const access = await requirePanel(`/panel/producciones/${id}/asistente`);
  if (!can(access, id, "obra.editar")) redirect(`/panel/producciones/${id}`);
  const { data } = await (await createClient()).from("productions").select(COLS).eq("id", id).maybeSingle();
  if (!data) redirect("/panel/producciones");
  const o = data as unknown as Obra;
  const paso = Math.min(5, Math.max(1, Number(sp.paso) || o.asistente_paso || 1));
  const base = `/panel/producciones/${id}`;
  const equipo = can(access, id, "permisos.gestionar");

  const colores = { fondo: o.color_fondo ?? "#0b0910", superficie: o.color_superficie ?? "#17121f", texto: o.color_texto ?? "#f4f1f8", acento: o.color_acento ?? "#a48bff" };
  const siguiente = paso < 5 && (
    <ActionForm inline action={irAPaso} hidden={{ pid: id, paso: String(paso + 1) }} submit={<>Siguiente: {PASOS[paso].titulo} <Icono nombre="flecha-der" /></>} />
  );
  const nav = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {paso > 1 ? <Link href={`${base}/asistente?paso=${paso - 1}`} className="text-sm font-bold text-violeta-claro"><Icono nombre="flecha-izq" /> {PASOS[paso - 2].titulo}</Link> : <span />}
      {siguiente}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-lila">Nueva producción · paso {paso} de 5</p>
        <ol className="grid grid-cols-5 gap-1.5">
          {PASOS.map((x) => (
            <li key={x.n}>
              <Link href={`${base}/asistente?paso=${x.n}`} aria-current={x.n === paso ? "step" : undefined}
                className={`flex flex-col gap-1 rounded-lg px-2 py-2 text-center text-xs font-bold ${x.n === paso ? "bg-lila/20 text-texto" : x.n < paso ? "text-exito" : "text-texto-3"}`}>
                <span className={`mx-auto h-1.5 w-full rounded-full ${x.n <= paso ? "bg-lila" : "bg-white/10"}`} />
                <span className="hidden sm:block">{x.titulo}</span><span className="sm:hidden">{x.n}</span>
              </Link>
            </li>
          ))}
        </ol>
        <div>
          <h2 className="titular text-2xl">{PASOS[paso - 1].titulo}</h2>
          <p className="text-sm text-texto-2">{PASOS[paso - 1].que}. Todo se guarda solo al presionar cada botón; puedes salirte y seguir después.</p>
        </div>
      </Card>

      {paso === 1 && (
        <>
          <Card className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="font-bold">Logo</h3>
              <p className="text-sm text-texto-2">PNG con fondo transparente.</p>
              {o.logo_path && <img src={assetUrl(o.logo_path)} alt="Logo" className="h-28 w-full rounded-lg bg-sala object-contain p-2" />}
              <ImageUpload productionId={id} kind="logo" carpeta="kit" base="logo" save={saveKitImage.bind(null, id, "logo")} label={o.logo_path ? "Cambiar logo" : "Subir logo"} />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="font-bold">Imagen de fondo</h3>
              <p className="text-sm text-texto-2">Horizontal; va detrás del logo en la página y en la audición.</p>
              {o.ambiente_path && <img src={assetUrl(o.ambiente_path)} alt="Imagen de fondo" className="h-28 w-full rounded-lg object-cover" />}
              <ImageUpload productionId={id} kind="ambiente" carpeta="kit" base="ambiente" save={saveKitImage.bind(null, id, "ambiente")} label={o.ambiente_path ? "Cambiar imagen" : "Subir imagen"} />
            </div>
          </Card>
          <Card className="flex flex-col gap-3">
            <h3 className="font-bold">Colores de la marca</h3>
            <p className="text-sm text-texto-2">Se usan en la página de la obra y en la de sus audiciones.</p>
            <ColorsForm pid={id} initial={colores} logoUrl={o.logo_path ? assetUrl(o.logo_path) : null} />
          </Card>
          <Vista o={o} colores={colores} />
        </>
      )}

      {paso === 2 && <PasoFicha pid={id} o={o} />}

      {paso === 3 && (equipo
        ? <PuestosEditor pid={id} obra={o.nombre} />
        : <Card><p className="text-sm text-texto-2">El equipo lo arma quien da permisos en la obra. Puedes seguir al siguiente paso.</p></Card>)}

      {paso === 4 && <PersonajesEditor pid={id} />}

      {paso === 5 && <Revisar pid={id} o={o} />}

      <Card>{nav}</Card>
    </div>
  );
}

function Vista({ o, colores }: { o: Obra; colores: Record<"fondo" | "superficie" | "texto" | "acento", string> }) {
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="font-bold">Así se verá</h3>
      <div className="relative overflow-hidden rounded-xl" style={{ background: colores.fondo, color: colores.texto }}>
        {o.ambiente_path && <img src={assetUrl(o.ambiente_path)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
        <div className="relative flex flex-col items-center gap-3 px-6 py-10 text-center" style={{ background: `linear-gradient(180deg, transparent, ${colores.fondo})` }}>
          {o.logo_path ? <img src={assetUrl(o.logo_path)} alt={o.nombre} className="max-h-28 max-w-[70%] object-contain" /> : <p className="text-3xl font-black">{o.nombre}</p>}
          {o.frase && <p className="text-sm">{o.frase}</p>}
          <span className="rounded-full px-5 py-2 text-sm font-bold" style={{ background: colores.acento, color: colores.fondo }}>Audiciones abiertas</span>
          <div className="mt-2 w-full max-w-sm rounded-lg p-3 text-left text-sm" style={{ background: colores.superficie }}>
            <b style={{ color: colores.acento }}>Lela</b> · Mujer · 16–22 años · Soprano
          </div>
        </div>
      </div>
    </Card>
  );
}

async function PasoFicha({ pid, o }: { pid: string; o: Obra }) {
  const { hitos, lugares } = await cargarHitosLugares(pid);
  return (
    <>
      <Card><FichaForm pid={pid} f={o} /></Card>
      <HitosEditor pid={pid} hitos={hitos} />
      <LugaresEditor pid={pid} lugares={lugares} />
    </>
  );
}

async function Revisar({ pid, o }: { pid: string; o: Obra }) {
  const [{ personajes }, puestos, { hitos, lugares }] = await Promise.all([cargarPersonajes(pid), cargarPuestos(pid), cargarHitosLugares(pid)]);
  const coloresOk = !!o.color_fondo && themeProblems({ fondo: o.color_fondo!, superficie: o.color_superficie ?? "", texto: o.color_texto ?? "", acento: o.color_acento ?? "" }).length === 0;
  const vacios = puestos.filter((p) => !p.people).length;
  const base = `/panel/producciones/${pid}/asistente?paso=`;
  const fechas = textoMeses(o.tentativa_desde, o.tentativa_hasta);
  return (
    <>
      <Card className="grid gap-5 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h3 className="font-bold">Identidad <Link href={`${base}1`} className="ml-2 text-xs text-violeta-claro">Editar</Link></h3>
          <ul className="flex flex-col gap-1">
            <Check ok={!!o.logo_path}>Logo</Check>
            <Check ok={!!o.ambiente_path}>Imagen de fondo</Check>
            <Check ok={coloresOk}>Colores de la marca</Check>
          </ul>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-bold">Ficha <Link href={`${base}2`} className="ml-2 text-xs text-violeta-claro">Editar</Link></h3>
          <ul className="flex flex-col gap-1">
            <Check ok={!!fechas}>{fechas ? `Fechas: ${fechas}` : "Fechas tentativas"}</Check>
            <Check ok={!!o.sinopsis}>Sinopsis</Check>
            <Check ok={!!o.duracion}>{o.duracion ? `Duración: ${o.duracion}` : "Duración"}</Check>
            <Check ok={hitos.length > 0}>{hitos.length ? `Calendario: ${hitos.map((h) => `${h.nombre} (${textoHito(h)})`).join(", ")}` : "Calendario de la producción"}</Check>
            <Check ok={lugares.length > 0}>{lugares.length ? `Lugares: ${lugares.map((l) => l.nombre).join(", ")}` : "Lugares"}</Check>
          </ul>
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-bold">Equipo <Link href={`${base}3`} className="ml-2 text-xs text-violeta-claro">Editar</Link></h3>
          <ul className="flex flex-col gap-1">
            {puestos.map((p) => { const e = estadoPuesto(p); return <Check key={p.id} ok={!!p.people}>{p.puesto}: <span className={e.cls}>{e.texto}</span></Check>; })}
            {puestos.length === 0 && <Check ok={false}>Aún no hay puestos</Check>}
          </ul>
          {vacios > 0 && <p className="text-xs text-texto-3">{vacios} {vacios === 1 ? "puesto vacío" : "puestos vacíos"}: los puedes llenar después en Más, Permisos.</p>}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="font-bold">Personajes <Link href={`${base}4`} className="ml-2 text-xs text-violeta-claro">Editar</Link></h3>
          <ul className="flex flex-col gap-1">
            {CATEGORIAS.map((c) => {
              const l = personajes.filter((p) => p.categoria === c.valor);
              return <Check key={c.valor} ok={l.length > 0}>{c.label}: {l.length ? l.map((p) => p.categoria === "ensamble" && p.cupo > 1 ? `${p.nombre} (${p.cupo})` : p.nombre).join(", ") : "ninguno"}</Check>;
            })}
          </ul>
        </section>
      </Card>
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-texto-2">Al crearla, la obra queda como <b>proyecto</b> (en borrador): el público no la ve hasta que la publiques. Todo se puede cambiar después.</p>
        <ActionForm action={terminarAsistente} hidden={{ pid }} submit="Crear proyecto" />
      </Card>
    </>
  );
}
