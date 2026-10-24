import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { ACCESO_TARDIO_OMISION, GRUPOS_LLAMADO, LOGISTICA_OMISION, aQuienLlama, type Llamado, type Logistica } from "@/lib/logistica-rules";
import { deleteLlamado, saveLlamado, saveLogistica } from "./actions";

const ghost = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60";
const lbl = "flex flex-col gap-1.5 text-sm font-semibold";
const antes = (m: number) => [Math.floor(m / 60) ? `${Math.floor(m / 60)} h` : null, m % 60 ? `${m % 60} min` : null].filter(Boolean).join(" ") || "a la hora";

// 0127: logística de la obra (lo que ve el público) y los llamados del elenco y la producción.
export function LogisticaObra({ pid, l }: { pid: string; l: Logistica | null }) {
  const v = l ?? LOGISTICA_OMISION;
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="titular text-xl">Horarios y cómo llegar</h2>
        <p className="text-sm text-texto-2">Vale para todas las funciones (en cada una puedes ajustar sus horas). El público lo ve en la página de la obra, su boleto y el diseño &quot;Prepárate para tu función&quot;.</p>
      </div>
      <ActionForm action={saveLogistica} hidden={{ pid }} submit="Guardar horarios" submitClass={ghost}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={lbl}>Puertas abren (min antes)<input className={input} type="number" name="puertas_min" min={0} max={240} defaultValue={v.puertas_min} required /></label>
          <label className={lbl}>Duración total (min)<input className={input} type="number" name="duracion_min" min={10} max={600} defaultValue={v.duracion_min} required />
            <span className="text-xs font-normal text-texto-3">Con todo e intermedio: así se calcula a qué hora termina.</span></label>
          <label className={lbl}>Intermedio (min, vacío = sin)<input className={input} type="number" name="intermedio_min" min={5} max={60} defaultValue={v.intermedio_min ?? ""} /></label>
          <label className={`${lbl} sm:col-span-2`}>Dirección del teatro<input className={input} name="direccion" maxLength={300} defaultValue={v.direccion ?? ""} placeholder="Av. Universidad 123, Col. Centro, Aguascalientes" /></label>
          <label className={lbl}>Liga de Google Maps (opcional)<input className={input} name="maps_url" type="url" maxLength={500} defaultValue={v.maps_url ?? ""} placeholder="https://maps.app.goo.gl/…" />
            <span className="text-xs font-normal text-texto-3">Si la dejas vacía, se arma con la dirección.</span></label>
          <label className={`${lbl} sm:col-span-3`}>Acceso tardío<input className={input} name="acceso_tardio" maxLength={300} defaultValue={v.acceso_tardio ?? ""} placeholder={ACCESO_TARDIO_OMISION} /></label>
          <label className={`${lbl} sm:col-span-3`}>Indicaciones para el público (estacionamiento, qué llevar, qué no se permite)
            <textarea className={`${input} min-h-24`} name="indicaciones" maxLength={1500} defaultValue={v.indicaciones ?? ""} placeholder={"Estacionamiento gratuito en la explanada.\nNo se permite introducir alimentos.\nNo se permite grabar la función."} />
            <span className="text-xs font-normal text-texto-3">Una indicación por renglón. La primera sale en el diseño &quot;Prepárate&quot;.</span></label>
        </div>
      </ActionForm>
    </Card>
  );
}

function CamposLlamado({ l }: { l?: Llamado }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <label className={`${lbl} sm:col-span-2`}>Nombre<input className={input} name="nombre" required minLength={2} maxLength={60} defaultValue={l?.nombre ?? ""} placeholder="Elenco" /></label>
        <label className={lbl}>Horas antes<input className={input} type="number" name="horas" min={0} max={10} defaultValue={l ? Math.floor(l.minutos_antes / 60) : 2} /></label>
        <label className={lbl}>Minutos<input className={input} type="number" name="minutos" min={0} max={59} step={5} defaultValue={l ? l.minutos_antes % 60 : 0} /></label>
      </div>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="mb-1 font-semibold">Del elenco cita a</legend>
        <span className="flex flex-wrap gap-3">
          {([["todos", "Todo el elenco"], ["grupos", "Solo estos grupos"], ["nadie", "Nadie del elenco"]] as const).map(([k, t]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="radio" name="elenco" value={k} defaultChecked={(l?.elenco ?? "todos") === k} />{t}</label>
          ))}
        </span>
        <span className="flex flex-wrap gap-3 rounded-lg bg-sala p-2">
          {Object.entries(GRUPOS_LLAMADO).map(([k, t]) => (
            <label key={k} className="flex items-center gap-1.5"><input type="checkbox" name="grupos" value={k} defaultChecked={l?.grupos.includes(k)} />{t}</label>
          ))}
        </span>
        <span className="text-xs text-texto-3">Los grupos solo cuentan si eliges &quot;Solo estos grupos&quot;. Salen de los créditos de la obra.</span>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="equipo_todos" defaultChecked={l?.equipo_todos ?? false} /> También cita a todo el equipo (producción, dirección, staff del panel)</label>
    </div>
  );
}

export function LlamadosObra({ pid, llamados }: { pid: string; llamados: Llamado[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="titular text-xl">Llamados</h2>
        <p className="text-sm text-texto-2">A qué hora llega cada quien antes de la función. Cada función crea sus llamados solos y salen en Ensayos y en el portal de cada quien: se checan con el gafete, cuentan retardos y faltas, y se puede pedir llegada tarde. Si mueves la función, se mueven; los que ya tienen asistencia o moviste a mano se quedan.</p>
      </div>
      {llamados.length > 0 && (
        <ul className="flex flex-col divide-y divide-white/10">
          {llamados.map((l, i) => (
            <li key={l.id} className="py-2">
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm">
                  <span><b>{l.nombre}</b> <span className="text-texto-2">· {antes(l.minutos_antes)} antes</span> <span className="text-texto-3">· {aQuienLlama(l)}</span></span>
                  <span className="text-xs font-bold text-violeta-claro">Editar</span>
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  <ActionForm action={saveLlamado} hidden={{ pid, lid: l.id, orden: String(i) }} submit="Guardar llamado" submitClass={ghost}><CamposLlamado l={l} /></ActionForm>
                  <ActionForm inline action={deleteLlamado} hidden={{ pid, lid: l.id }} confirm={`¿Borrar el llamado "${l.nombre}"? Se quita de las funciones que vienen.`} submit="Borrar llamado" submitClass={ghost} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <details className="rounded-xl border border-linea" open={llamados.length === 0}>
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-violeta-claro">+ Nuevo llamado</summary>
        <div className="border-t border-linea p-4">
          <ActionForm action={saveLlamado} hidden={{ pid, orden: String(llamados.length) }} submit="Crear llamado" submitClass={ghost}><CamposLlamado /></ActionForm>
        </div>
      </details>
    </Card>
  );
}
