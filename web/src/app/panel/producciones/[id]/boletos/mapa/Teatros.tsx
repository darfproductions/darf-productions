import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { deleteTeatro, saveTeatro, usarTeatro } from "../actions";

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

export type Teatro = { id: string; nombre: string; total: number };

// Teatros guardados (0112): el mapa de un teatro se guarda una vez con su nombre y se usa en otras obras.
export function Teatros({ pid, teatros, tieneMapa, conBoletos }: { pid: string; teatros: Teatro[]; tieneMapa: boolean; conBoletos: boolean }) {
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="titular text-xl">Teatros guardados</h2>
        <p className="text-sm text-texto-2">Como los teatros se repiten, guarda el mapa con el nombre del teatro y úsalo la próxima vez que hagan una obra ahí. Las zonas se crean con el mismo nombre y color; los precios se ponen en cada obra.</p>
      </div>
      {!conBoletos && teatros.length > 0 && (
        <ActionForm action={usarTeatro} hidden={{ pid }} confirm={tieneMapa ? "¿Reemplazar el mapa de esta obra por el del teatro elegido?" : "¿Usar el mapa de este teatro?"} submit="Usar este teatro" submitClass={ghost}>
          <select name="teatro" required defaultValue="" className={`${input} max-w-md`} aria-label="Teatro guardado">
            <option value="" disabled>Elige un teatro…</option>
            {teatros.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {t.total} asientos</option>)}
          </select>
        </ActionForm>
      )}
      {tieneMapa && (
        <ActionForm action={saveTeatro} hidden={{ pid }} submit="Guardar como teatro" submitClass={ghost}>
          <input className={`${input} max-w-md`} name="nombre" required minLength={2} maxLength={80} placeholder="Nombre del teatro (ej. Teatro de la Ciudad)" aria-label="Nombre del teatro" />
          <span className="text-xs text-texto-3">Si ya existe uno con ese nombre, se actualiza con este mapa.</span>
        </ActionForm>
      )}
      {teatros.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {teatros.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sala px-3 py-2">
              <span><b>{t.nombre}</b> <span className="text-texto-3">· {t.total} asientos</span></span>
              <ActionForm inline action={deleteTeatro} hidden={{ pid, teatro: t.id }} confirm={`¿Borrar el teatro guardado “${t.nombre}”? Las obras que ya lo usaron conservan su mapa.`} submit="Borrar" submitClass={ghost} />
            </li>
          ))}
        </ul>
      )}
      {teatros.length === 0 && !tieneMapa && <p className="text-sm text-texto-3">Aún no hay teatros guardados. Arma el mapa arriba y luego guárdalo con el nombre del teatro.</p>}
    </Card>
  );
}
