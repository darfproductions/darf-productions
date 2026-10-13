import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { EventosLista } from "@/components/panel/EventosLista";
import { Card, PanelTitle, input } from "@/components/panel/ui";
import { ACCESO_EVENTO, CATEGORIAS, TIPOS_EVENTO, type AccesoEvento, type TipoEvento } from "@/lib/eventos-rules";
import { can, myProductionIds } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { crearEvento } from "./actions";

export const metadata: Metadata = { title: "Eventos" };

// Panel → Eventos (0081): por función, presenciales y en línea; para el Club Fan, con cuenta o públicos.
// Quien tiene Fan Zone en una obra crea los de esa obra; los de DARF sin obra, el Director.
export default async function EventosPanel({ searchParams }: PageProps<"/panel/eventos">) {
  const sp = await searchParams;
  const access = await requirePanel("/panel/eventos");
  const supabase = await createClient();
  const { data: prods } = await supabase.from("productions").select("id, nombre").order("created_at", { ascending: false });
  const obras = ((prods ?? []) as { id: string; nombre: string }[]).filter((p) => access.isDirector || (myProductionIds(access).includes(p.id) && can(access, p.id, "fanzone.editar")));
  if (!access.isDirector && !obras.length) redirect("/panel");
  const { data: pfs } = obras.length
    ? await supabase.from("performances").select("id, production_id, starts_at").in("production_id", obras.map((o) => o.id)).not("starts_at", "is", null).order("starts_at")
    : { data: [] };
  const funciones = ((pfs ?? []) as { id: string; production_id: string; starts_at: string }[]);
  const nombreObra = new Map(obras.map((o) => [o.id, o.nombre]));
  const obraInicial = typeof sp.obra === "string" ? sp.obra : "";

  const acceso = (def: AccesoEvento = "club") => (
    <fieldset className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      <legend className="mb-1 w-full font-semibold">¿Quién lo ve y puede entrar?</legend>
      {(Object.keys(ACCESO_EVENTO) as AccesoEvento[]).map((k) => (
        <label key={k} className="flex items-center gap-2"><input type="radio" name="acceso" value={k} defaultChecked={k === def} /> {ACCESO_EVENTO[k].label}</label>
      ))}
    </fieldset>
  );
  // Con costo (0083): se paga como los boletos y el lugar queda apartado hasta aprobar el pago.
  const costo = (
    <fieldset className="flex flex-col gap-2 text-sm">
      <legend className="mb-1 font-semibold">Costo <span className="text-xs font-normal text-texto-3">Vacío = gratis</span></legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 font-semibold">Precio (MXN)
          <input type="number" name="precio" min={1} max={100000} step="0.01" placeholder="Gratis" className={input} />
        </label>
        <label className="flex flex-col gap-1 font-semibold">Precio para socios del Club Fan <span className="text-xs font-normal text-texto-3">Opcional · 0 = gratis para socios</span>
          <input type="number" name="precio_socio" min={0} max={100000} step="0.01" className={input} />
        </label>
      </div>
      <p className="text-xs text-texto-3">Con costo, se pide registro: la persona aparta, paga por WhatsApp o transferencia (como los boletos) y su lugar queda apartado hasta que apruebes el pago aquí abajo. Si no paga a tiempo, se libera solo.</p>
    </fieldset>
  );
  const categoria = (tipo: TipoEvento, requerida = false) => (
    <label className="flex flex-col gap-1 text-sm font-semibold">Tipo de evento
      <input name="categoria" list={`cat-${tipo}`} required={requerida} maxLength={60} placeholder={CATEGORIAS[tipo][0]} className={input} />
      <datalist id={`cat-${tipo}`}>{CATEGORIAS[tipo].map((c) => <option key={c} value={c} />)}</datalist>
    </label>
  );
  const obraSelect = (
    <label className="flex flex-col gap-1 text-sm font-semibold">Obra
      <select name="obra" defaultValue={obraInicial} className={input}>
        {access.isDirector && <option value="">DARF (sin obra)</option>}
        {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
      </select>
    </label>
  );
  const bloque = (tipo: TipoEvento, children: React.ReactNode) => (
    <details className="rounded-xl border border-linea p-4" open={tipo === "funcion" && !!obraInicial}>
      <summary className="cursor-pointer">
        <span className="font-bold">+ {TIPOS_EVENTO[tipo].label}</span>
        <span className="block text-xs text-texto-3">{TIPOS_EVENTO[tipo].ayuda}</span>
      </summary>
      <div className="mt-4">
        <ActionForm action={crearEvento} hidden={{ tipo }} submit="Publicar evento">{children}</ActionForm>
      </div>
    </details>
  );

  return (
    <div className="flex flex-col gap-4">
      <PanelTitle eyebrow="Proyectos" title="Eventos">
        Por función (foto con el elenco, tour por backstage, early access), presenciales (ensayo abierto, meet &amp; greet, showcase) o en línea (transmisión, lanzamiento, preventa). Al publicarse se avisa a los socios del Club Fan y una hora antes se recuerda a quien apartó. En la entrada se valida la credencial del Club Fan o se marca la llegada a mano.
      </PanelTitle>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Nuevo evento</h2>
        {bloque("funcion", (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">Función
                <select name="performance" required className={input} defaultValue="">
                  <option value="">Elige…</option>
                  {funciones.filter((f) => !obraInicial || f.production_id === obraInicial).map((f) => <option key={f.id} value={f.id}>{nombreObra.get(f.production_id)} · {formatPerformanceDate(f.starts_at)}</option>)}
                </select>
              </label>
              {categoria("funcion", true)}
              <label className="flex flex-col gap-1 text-sm font-semibold">Nombre <span className="text-xs font-normal text-texto-3">Opcional (si no, se usa el tipo)</span>
                <input name="titulo" maxLength={120} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Cupo <span className="text-xs font-normal text-texto-3">Los primeros N · vacío = sin límite</span>
                <input type="number" name="cupo" min={1} max={5000} defaultValue={20} className={input} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold">Notas <span className="text-xs font-normal text-texto-3">Opcional: dónde se reúnen, a qué hora…</span>
              <input name="notas" maxLength={300} className={input} />
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="registro" defaultChecked /> Pide registro (apartar lugar)</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="boleto" defaultChecked /> Pide boleto de esa función</label>
            </div>
            {acceso("club")}
            {costo}
          </>
        ))}
        {bloque("presencial", (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">Nombre del evento
                <input name="titulo" required maxLength={120} placeholder="Ensayo abierto de Showman" className={input} />
              </label>
              {categoria("presencial")}
              <label className="flex flex-col gap-1 text-sm font-semibold">Empieza
                <input type="datetime-local" name="inicia" required className={input} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Termina <span className="text-xs font-normal text-texto-3">Opcional</span>
                <input type="datetime-local" name="termina" className={input} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Lugar
                <input name="lugar" maxLength={160} placeholder="Teatro, foro, salón…" className={input} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Cupo <span className="text-xs font-normal text-texto-3">Los primeros N · vacío = sin límite</span>
                <input type="number" name="cupo" min={1} max={5000} defaultValue={30} className={input} />
              </label>
              {obraSelect}
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold">Descripción <span className="text-xs font-normal text-texto-3">Opcional</span>
              <textarea name="descripcion" maxLength={600} rows={2} className={input} />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="registro" defaultChecked /> Pide registro (apartar lugar). Sin registro, entra quien llegue hasta llenar el cupo.</label>
            {acceso("club")}
            {costo}
          </>
        ))}
        {bloque("en_linea", (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">Nombre del evento
                <input name="titulo" required maxLength={120} placeholder="Lanzamiento del tráiler" className={input} />
              </label>
              {categoria("en_linea")}
              <label className="flex flex-col gap-1 text-sm font-semibold">Empieza
                <input type="datetime-local" name="inicia" required className={input} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">Termina <span className="text-xs font-normal text-texto-3">Opcional (si no, 3 horas)</span>
                <input type="datetime-local" name="termina" className={input} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">Liga de la transmisión o del lanzamiento
                <input name="liga" type="url" required placeholder="https://youtube.com/live/…" className={input} />
                <span className="text-xs font-normal text-texto-3">Se ve 15 minutos antes y durante el evento; antes, solo la fecha y “Recordarme”.</span>
              </label>
              {obraSelect}
            </div>
            <label className="flex flex-col gap-1 text-sm font-semibold">Descripción <span className="text-xs font-normal text-texto-3">Opcional</span>
              <textarea name="descripcion" maxLength={600} rows={2} className={input} />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="registro" /> Pide registro (solo quien se registró ve la liga)</label>
            {acceso("club")}
            {costo}
          </>
        ))}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="titular text-xl">Eventos</h2>
        <EventosLista pid={access.isDirector ? null : undefined} />
      </Card>
    </div>
  );
}
