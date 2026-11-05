import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { createClient } from "@/lib/supabase/server";
import { mesAInput, textoMeses } from "@/lib/produccion-nueva-rules";
import { agregarHito, agregarLugar, borrarHito, borrarLugar, guardarFicha } from "@/app/panel/producciones/obra-actions";

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";
const lbl = "flex flex-col gap-1.5 text-sm font-semibold";
export const TIPOS_LUGAR = [
  { valor: "teatro", label: "Teatro / sede" }, { valor: "ensayo", label: "Sala de ensayo" },
  { valor: "audicion", label: "Audiciones" }, { valor: "otro", label: "Otro" },
];
export const HITOS_SUGERIDOS = ["Audiciones", "Callbacks", "Primer ensayo", "Ensayo técnico", "Ensayo general", "Estreno", "Última función"];

export type FichaObra = {
  estado: string; frase: string | null; sinopsis: string | null; duracion: string | null; clasificacion: string | null; basada_en: string | null;
  idioma: string | null; venue: string | null; tentativa_desde: string | null; tentativa_hasta: string | null;
};
export type Hito = { id: string; nombre: string; mes: string; dia: string | null; notas: string | null };
export type Lugar = { id: string; tipo: string; nombre: string; direccion: string | null; mapa_url: string | null; notas: string | null };

export async function cargarHitosLugares(pid: string) {
  const supabase = await createClient();
  const [h, l] = await Promise.all([
    supabase.from("production_hitos").select("id, nombre, mes, dia, notas").eq("production_id", pid).order("mes").order("dia", { nullsFirst: false }).order("created_at"),
    supabase.from("production_lugares").select("id, tipo, nombre, direccion, mapa_url, notas").eq("production_id", pid).order("orden").order("created_at"),
  ]);
  return { hitos: (h.data ?? []) as Hito[], lugares: (l.data ?? []) as Lugar[] };
}

export function textoHito(h: Hito): string {
  if (h.dia) {
    const d = new Date(`${h.dia}T12:00:00Z`);
    return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  }
  return textoMeses(h.mes) ?? "";
}

/** Datos de la ficha y fechas tentativas. Con la obra ya pública, solo las fechas (lo demás va en Página → Contenido). */
export function FichaForm({ pid, f, submit = "Guardar ficha" }: { pid: string; f: FichaObra; submit?: string }) {
  const publica = ["publicada", "archivada"].includes(f.estado);
  return (
    <ActionForm action={guardarFicha} hidden={{ pid }} submit={submit}>
      <fieldset className="flex flex-col gap-2 rounded-lg bg-sala p-3">
        <legend className="px-1 text-sm font-bold">Fechas tentativas de presentación</legend>
        <p className="text-xs text-texto-3">Solo mes y año. Pon un mes, o un rango (de marzo a abril). Se cambia cuando quieras.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={lbl}>Desde
            <input className={input} type="month" name="tentativa_desde" defaultValue={mesAInput(f.tentativa_desde)} />
          </label>
          <label className={lbl}>Hasta <span className="text-xs font-normal text-texto-3">(opcional)</span>
            <input className={input} type="month" name="tentativa_hasta" defaultValue={mesAInput(f.tentativa_hasta)} />
          </label>
        </div>
      </fieldset>
      {publica ? (
        <p className="text-sm text-texto-3">La sinopsis, duración y demás datos públicos se editan en Página pública, en Contenido.</p>
      ) : (
        <>
          <label className={lbl}>Frase corta <span className="text-xs font-normal text-texto-3">(máximo 120 caracteres; sale bajo el logo)</span>
            <input className={input} name="frase" maxLength={120} defaultValue={f.frase ?? ""} placeholder="Ej. Un verano que cambia todo" />
          </label>
          <label className={lbl}>Sinopsis
            <textarea className={input} name="sinopsis" rows={5} defaultValue={f.sinopsis ?? ""} placeholder="De qué trata la obra. Separa párrafos con una línea en blanco." />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={lbl}>Duración<input className={input} name="duracion" defaultValue={f.duracion ?? ""} placeholder="Ej. 2 h 15 min con intermedio" /></label>
            <label className={lbl}>Clasificación<input className={input} name="clasificacion" defaultValue={f.clasificacion ?? ""} placeholder="Ej. Todo público" /></label>
            <label className={lbl}>Basada en<input className={input} name="basada_en" defaultValue={f.basada_en ?? ""} placeholder="Ej. la película de Disney Channel" /></label>
            <label className={lbl}>Idioma<input className={input} name="idioma" defaultValue={f.idioma ?? ""} placeholder="Español" /></label>
            <label className={`${lbl} sm:col-span-2`}>Sede (tentativa)<input className={input} name="venue" defaultValue={f.venue ?? ""} placeholder="Ej. Teatro Morelos" /></label>
          </div>
        </>
      )}
    </ActionForm>
  );
}

/** Hitos por mes: audiciones, primer ensayo, estreno… (con día exacto cuando ya se sabe). */
export function HitosEditor({ pid, hitos }: { pid: string; hitos: Hito[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="titular text-lg">Calendario de la producción</h3>
      <p className="text-sm text-texto-2">Los momentos clave por mes. Cuando sepas el día exacto, agrégalo.</p>
      <ul className="flex flex-col gap-1.5">
        {hitos.map((h) => (
          <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
            <span><b className="mr-2 text-lila">{textoHito(h)}</b>{h.nombre}{h.notas && <span className="block text-xs text-texto-3">{h.notas}</span>}</span>
            <ActionForm inline action={borrarHito} hidden={{ pid, id: h.id }} submit="Quitar" submitClass={ghost} />
          </li>
        ))}
        {hitos.length === 0 && <li className="text-sm text-texto-3">Aún no hay fechas clave.</li>}
      </ul>
      <ActionForm action={agregarHito} hidden={{ pid }} submit="Agregar">
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <input className={input} name="nombre" list={`hitos-${pid}`} required placeholder="Qué pasa (ej. Estreno)" aria-label="Qué pasa" />
          <datalist id={`hitos-${pid}`}>{HITOS_SUGERIDOS.map((x) => <option key={x} value={x} />)}</datalist>
          <input className={input} type="month" name="mes" aria-label="Mes" />
          <input className={input} type="date" name="dia" aria-label="Día exacto (opcional)" title="Día exacto (opcional)" />
        </div>
        <input className={`${input} text-sm`} name="notas" maxLength={300} placeholder="Notas (opcional)" aria-label="Notas" />
      </ActionForm>
    </Card>
  );
}

/** Lugares de la obra: teatro, sala de ensayo… con dirección y liga al mapa. */
export function LugaresEditor({ pid, lugares }: { pid: string; lugares: Lugar[] }) {
  const tipo = new Map(TIPOS_LUGAR.map((t) => [t.valor, t.label]));
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="titular text-lg">Lugares</h3>
      <p className="text-sm text-texto-2">Teatro, sala de ensayo, lugar de audiciones… para que cualquiera del equipo sepa a dónde ir.</p>
      <ul className="flex flex-col gap-1.5">
        {lugares.map((l) => (
          <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-sala px-3 py-2 text-sm">
            <span>
              <span className="mr-2 text-xs font-bold uppercase tracking-wide text-lila">{tipo.get(l.tipo) ?? l.tipo}</span><b>{l.nombre}</b>
              {l.direccion && <span className="block text-texto-2">{l.direccion}</span>}
              {l.mapa_url && <a href={l.mapa_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-violeta-claro">Ver en el mapa</a>}
              {l.notas && <span className="block text-xs text-texto-3">{l.notas}</span>}
            </span>
            <ActionForm inline action={borrarLugar} hidden={{ pid, id: l.id }} submit="Quitar" submitClass={ghost} />
          </li>
        ))}
        {lugares.length === 0 && <li className="text-sm text-texto-3">Aún no hay lugares.</li>}
      </ul>
      <ActionForm action={agregarLugar} hidden={{ pid }} submit="Agregar lugar">
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
          <select className={input} name="tipo" defaultValue="teatro" aria-label="Tipo">{TIPOS_LUGAR.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}</select>
          <input className={input} name="nombre" required placeholder="Nombre (ej. Teatro Morelos)" aria-label="Nombre" />
          <input className={`${input} sm:col-span-2`} name="direccion" placeholder="Dirección" aria-label="Dirección" />
          <input className={input} name="mapa_url" type="url" placeholder="Liga de Google Maps (https://…)" aria-label="Liga del mapa" />
          <input className={input} name="notas" placeholder="Notas (ej. entrada por la puerta lateral)" aria-label="Notas" />
        </div>
      </ActionForm>
    </Card>
  );
}
