"use client";

import { useActionState, useState } from "react";
import { ACCEPT_EXPEDIENTE, subirAExpediente } from "@/lib/expediente-upload";
import { fechaEnsayo } from "@/lib/rehearsal-rules";
import { METODOS, TIPO_SOLICITUD, textoLimite, type RequestTipo } from "@/lib/request-rules";
import { requestAbsence, submitRequest, type ReqState } from "./actions";
import { isoMx } from "@/lib/dates";

export type EnsayoOpcion = { id: string; titulo: string; inicia: string; termina: string | null; permitido: boolean; pedida: boolean };

const campo = "w-full min-w-0 rounded-lg border border-white/10 bg-sala px-3 py-2.5 text-texto outline-none focus:border-violeta-claro";
const etiqueta = "flex min-w-0 flex-col gap-1.5 text-sm font-semibold";

// Archivo para la solicitud: se sube al elegirlo y su ruta viaja en un campo oculto.
function Archivo({ pid, uid, onBusy }: { pid: string; uid: string; onBusy: (b: boolean) => void }) {
  const [path, setPath] = useState("");
  const [nombre, setNombre] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function subir(file: File) {
    setMsg(""); setBusy(true); onBusy(true);
    try {
      const r = await subirAExpediente(pid, uid, "solicitud", file);
      if ("error" in r) { setMsg(r.error); setPath(""); return; }
      setPath(r.path); setNombre(file.name);
    } finally { setBusy(false); onBusy(false); }
  }
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-semibold">Archivo (PDF o foto)</span>
      <input type="hidden" name="archivo" value={path} />
      <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-dashed border-white/25 bg-sala px-3 py-3 hover:border-white/50">
        <span className="rounded-full bg-texto px-4 py-1.5 text-xs font-bold text-sala">{busy ? "Subiendo…" : path ? "Cambiar archivo" : "Elegir archivo"}</span>
        <span className="min-w-0 wrap-anywhere text-texto-2">{path ? `✓ ${nombre}` : "Ningún archivo"}</span>
        <input type="file" accept={ACCEPT_EXPEDIENTE} className="sr-only" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
      </label>
      {msg && <span role="alert" className="text-xs text-[#ff8fa3]">{msg}</span>}
    </div>
  );
}

function Resultado({ state }: { state: ReqState }) {
  if (!state) return null;
  return <p role="status" className={`text-sm font-semibold ${state.ok ? "text-exito" : "text-[#ff8fa3]"}`}>{state.message}</p>;
}

function FaltaForm({ pid, ensayos, horas, marcado, onDone }: { pid: string; ensayos: EnsayoOpcion[]; horas: number; marcado: string | null; onDone: () => void }) {
  const [state, run, pending] = useActionState<ReqState, FormData>(async (p, f) => {
    const r = await requestAbsence(p, f);
    if (r?.ok) onDone();
    return r;
  }, null);
  const disponibles = ensayos.filter((e) => e.permitido && !e.pedida);
  return (
    <form action={run} className="flex flex-col gap-4">
      <input type="hidden" name="pid" value={pid} />
      <p className="text-sm text-texto-2">Las faltas se avisan <b>{textoLimite(horas)}</b>. Si la producción la aprueba, el ensayo queda como falta justificada.</p>
      {ensayos.length === 0 ? <p className="rounded-lg bg-sala px-3 py-3 text-sm text-texto-2">No tienes ensayos próximos.</p> : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">¿A qué ensayo vas a faltar?</legend>
          {ensayos.map((e) => {
            const ok = e.permitido && !e.pedida;
            return (
              <label key={e.id} className={`flex items-start gap-3 rounded-lg border border-white/10 bg-sala px-3 py-2.5 text-sm ${ok ? "cursor-pointer hover:border-white/30" : "opacity-55"}`}>
                <input type="checkbox" name="ensayo" value={e.id} disabled={!ok} defaultChecked={ok && e.id === marcado} className="mt-1 h-4 w-4" />
                <span className="min-w-0">
                  <b>{e.titulo}</b>
                  <span className="block text-texto-2">{(([c, ...r]) => c.toUpperCase() + r.join(""))(fechaEnsayo(e.inicia, e.termina))}</span>
                  {!ok && <span className="block text-xs text-texto-3">{e.pedida ? "Ya la pediste" : "Ya pasó el límite para avisar"}</span>}
                </span>
              </label>
            );
          })}
        </fieldset>
      )}
      <label className={etiqueta}>Razón
        <textarea name="motivo" required maxLength={1000} rows={3} className={campo} placeholder="Ej. Tengo examen final ese día." />
      </label>
      <button disabled={pending || disponibles.length === 0} className="self-start rounded-full bg-texto px-6 py-3 text-sm font-bold text-sala disabled:opacity-50">
        {pending ? "Enviando…" : "Enviar solicitud"}
      </button>
      <Resultado state={state} />
    </form>
  );
}

function OtraForm({ pid, uid, tipo, docTipos, cuota, onDone }: { pid: string; uid: string; tipo: Exclude<RequestTipo, "falta">; docTipos: { id: string; nombre: string }[]; cuota: number | null; onDone: () => void }) {
  const [state, run, pending] = useActionState<ReqState, FormData>(async (p, f) => {
    const r = await submitRequest(p, f);
    if (r?.ok) onDone();
    return r;
  }, null);
  const [subiendo, setSubiendo] = useState(false);
  const [docSel, setDocSel] = useState(docTipos[0]?.id ?? "");
  const [concepto, setConcepto] = useState<"mensualidad" | "inscripcion">("mensualidad");
  const mesActual = isoMx().slice(0, 7);
  return (
    <form action={run} className="flex flex-col gap-4">
      <input type="hidden" name="pid" value={pid} />
      <input type="hidden" name="tipo" value={tipo} />
      {tipo === "documento" && (
        <>
          <label className={etiqueta}>Nombre del documento
            <select className={campo} value={docSel} onChange={(e) => setDocSel(e.target.value)} name={docSel ? "doc_type" : undefined}>
              {docTipos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              <option value="">Otro (escribir el nombre)</option>
            </select>
          </label>
          {!docSel && (
            <label className={etiqueta}>¿Qué documento es?
              <input name="doc_nombre" required maxLength={80} className={campo} placeholder="Ej. Comprobante de domicilio" />
            </label>
          )}
          <Archivo pid={pid} uid={uid} onBusy={setSubiendo} />
        </>
      )}
      {tipo === "pago" && (
        <>
          <fieldset className="flex flex-wrap gap-2 text-sm">
            <legend className="mb-1.5 font-semibold">¿Qué pagaste?</legend>
            {(["mensualidad", "inscripcion"] as const).map((c) => (
              <label key={c} className={`cursor-pointer rounded-full border px-4 py-2 font-semibold ${concepto === c ? "border-texto bg-texto text-sala" : "border-white/25"}`}>
                <input type="radio" name="concepto" value={c} checked={concepto === c} onChange={() => setConcepto(c)} className="sr-only" />
                {c === "mensualidad" ? "Mensualidad" : "Inscripción"}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            {concepto === "mensualidad" && (
              <label className={etiqueta}>Mes que pagaste
                <input type="month" name="mes" required defaultValue={mesActual} className={campo} />
              </label>
            )}
            <label className={etiqueta}>Monto
              <input name="monto" required inputMode="decimal" defaultValue={cuota ?? ""} className={campo} placeholder="$" />
            </label>
            <label className={etiqueta}>Cómo pagaste
              <select name="metodo" defaultValue="transferencia" className={campo}>
                {METODOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <Archivo pid={pid} uid={uid} onBusy={setSubiendo} />
        </>
      )}
      <label className={etiqueta}>{tipo === "otro" ? "Cuéntanos" : "Comentario (opcional)"}
        <textarea name="motivo" required={tipo === "otro"} maxLength={1000} rows={3} className={campo}
          placeholder={tipo === "otro" ? "Ej. Quiero aclarar un pago de septiembre." : ""} />
      </label>
      <button disabled={pending || subiendo} className="self-start rounded-full bg-texto px-6 py-3 text-sm font-bold text-sala disabled:opacity-50">
        {pending ? "Enviando…" : subiendo ? "Esperando el archivo…" : "Enviar solicitud"}
      </button>
      <Resultado state={state} />
    </form>
  );
}

// Nueva solicitud: el integrante elige qué quiere mandar y llena solo lo necesario.
export function RequestForm({ pid, uid, ensayos, horas, docTipos, cuota, inicial }: {
  pid: string; uid: string; ensayos: EnsayoOpcion[]; horas: number; docTipos: { id: string; nombre: string }[];
  cuota: number | null; inicial: { tipo: RequestTipo | null; falta: string | null };
}) {
  const [tipo, setTipo] = useState<RequestTipo | null>(inicial.tipo);
  const [vuelta, setVuelta] = useState(0); // al enviar, el formulario queda limpio
  const [hecho, setHecho] = useState<string | null>(null);
  const listo = () => { setVuelta((v) => v + 1); setHecho("Solicitud enviada. Aparece abajo en “Mis solicitudes”; te avisamos cuando la revisen."); };
  const tipos = Object.keys(TIPO_SOLICITUD) as RequestTipo[];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="group" aria-label="¿Qué quieres mandar?">
        {tipos.map((t) => (
          <button key={t} type="button" onClick={() => { setTipo(t); setHecho(null); }} aria-pressed={tipo === t}
            className={`flex min-h-24 flex-col items-start gap-1 rounded-xl border p-3 text-left text-sm transition-colors ${tipo === t ? "border-violeta-claro bg-ciruela/20" : "border-white/10 bg-sala hover:border-white/30"}`}>
            <span aria-hidden="true" className="text-xl">{TIPO_SOLICITUD[t].icono}</span>
            <b className="leading-tight">{TIPO_SOLICITUD[t].label}</b>
          </button>
        ))}
      </div>
      {hecho && <p role="status" className="rounded-lg bg-[#14532d]/60 px-4 py-3 text-sm font-semibold text-[#bbf7d0]">✓ {hecho}</p>}
      {tipo && <p className="text-sm text-texto-2">{TIPO_SOLICITUD[tipo].ayuda}</p>}
      {tipo === "falta" && <FaltaForm key={`f${vuelta}`} pid={pid} ensayos={ensayos} horas={horas} marcado={inicial.falta} onDone={listo} />}
      {tipo && tipo !== "falta" && <OtraForm key={`${tipo}${vuelta}`} pid={pid} uid={uid} tipo={tipo} docTipos={docTipos} cuota={cuota} onDone={listo} />}
    </div>
  );
}
