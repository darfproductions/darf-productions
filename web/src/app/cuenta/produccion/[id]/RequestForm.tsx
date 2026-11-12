"use client";

import { useActionState, useState } from "react";
import { ACCEPT_EXPEDIENTE, subirAExpediente } from "@/lib/expediente-upload";
import { fechaEnsayo } from "@/lib/rehearsal-rules";
import { METODOS, TIPO_SOLICITUD, horaMx, llegadaIso, puedeAvisarLlegada, textoLimite, textoLlegada, type RequestTipo } from "@/lib/request-rules";
import { requestAbsence, requestLate, sendMessage, submitRequest, type ReqState } from "./actions";
import { isoMx } from "@/lib/dates";
import { Icono, type IconoNombre } from "@/components/Icono";

export type EnsayoOpcion = { id: string; titulo: string; inicia: string; termina: string | null; permitido: boolean; pedida: boolean };
/** 0141: alguien del equipo al que se le puede escribir (nombre y puesto; sin teléfono). */
export type EquipoOpcion = { user_id: string; nombre: string; puesto: string | null };
type TipoForm = RequestTipo | "mensaje";

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
        <span className="min-w-0 wrap-anywhere text-texto-2">{path ? <><Icono nombre="check" /> {nombre}</> : "Ningún archivo"}</span>
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

// 0126: llegada tarde. Un ensayo que no ha empezado, la hora a la que llegará y la razón; el aviso de la regla
// cambia con la hora que escribe.
function LlegadaForm({ pid, ensayos, tolerancia, marcado, onDone }: { pid: string; ensayos: EnsayoOpcion[]; tolerancia: number; marcado: string | null; onDone: () => void }) {
  const [state, run, pending] = useActionState<ReqState, FormData>(async (p, f) => {
    const r = await requestLate(p, f);
    if (r?.ok) onDone();
    return r;
  }, null);
  const opciones = ensayos.filter((e) => puedeAvisarLlegada(e.inicia));
  const disponibles = opciones.filter((e) => !e.pedida);
  const [sel, setSel] = useState<string>(disponibles.find((e) => e.id === marcado)?.id ?? disponibles[0]?.id ?? "");
  const [hora, setHora] = useState("");
  const elegido = opciones.find((e) => e.id === sel);
  const iso = elegido && hora ? llegadaIso(elegido.inicia, hora) : null;
  return (
    <form action={run} className="flex flex-col gap-4">
      <input type="hidden" name="pid" value={pid} />
      {opciones.map((e) => <input key={e.id} type="hidden" name={`inicia_${e.id}`} value={e.inicia} />)}
      {opciones.length === 0 ? <p className="rounded-lg bg-sala px-3 py-3 text-sm text-texto-2">No tienes ensayos próximos.</p> : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">¿A qué ensayo llegarás tarde?</legend>
          {opciones.map((e) => (
            <label key={e.id} className={`flex items-start gap-3 rounded-lg border border-white/10 bg-sala px-3 py-2.5 text-sm ${e.pedida ? "opacity-55" : "cursor-pointer hover:border-white/30"}`}>
              <input type="radio" name="ensayo" value={e.id} disabled={e.pedida} checked={sel === e.id} onChange={() => setSel(e.id)} className="mt-1 h-4 w-4" />
              <span className="min-w-0">
                <b>{e.titulo}</b>
                <span className="block text-texto-2">{(([c, ...r]) => c.toUpperCase() + r.join(""))(fechaEnsayo(e.inicia, e.termina))}</span>
                {e.pedida && <span className="block text-xs text-texto-3">Ya mandaste una solicitud para este ensayo</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <label className={`${etiqueta} sm:max-w-56`}>¿A qué hora vas a llegar?
        <input type="time" name="hora" required value={hora} onChange={(e) => setHora(e.target.value)} className={campo}
          min={elegido ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(elegido.inicia)) : undefined} />
        {elegido && <span className="text-xs font-normal text-texto-3">El ensayo empieza a las {horaMx(elegido.inicia)}</span>}
      </label>
      <p className="flex gap-2 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2.5 text-sm text-texto">
        <Icono nombre="reloj" className="mt-0.5 shrink-0 text-aviso" />
        <span>{textoLlegada(iso, tolerancia)} Si la producción la rechaza, cuenta la hora normal del ensayo.</span>
      </p>
      <label className={etiqueta}>Razón
        <textarea name="motivo" required maxLength={1000} rows={3} className={campo} placeholder="Ej. Salgo de la escuela a las 7:00." />
      </label>
      <button disabled={pending || disponibles.length === 0} className="self-start rounded-full bg-texto px-6 py-3 text-sm font-bold text-sala disabled:opacity-50">
        {pending ? "Enviando…" : "Enviar solicitud"}
      </button>
      <Resultado state={state} />
    </form>
  );
}

function OtraForm({ pid, uid, tipo, docTipos, cuota, onDone }: { pid: string; uid: string; tipo: Exclude<RequestTipo, "falta" | "llegada">; docTipos: { id: string; nombre: string }[]; cuota: number | null; onDone: () => void }) {
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

// 0141: mensaje a alguien del equipo (producción, dirección, maestros). Llega solo a esa persona.
function MensajeForm({ pid, equipo, marcado, onDone }: { pid: string; equipo: EquipoOpcion[]; marcado: string | null; onDone: () => void }) {
  const [state, run, pending] = useActionState<ReqState, FormData>(async (p, f) => {
    const r = await sendMessage(p, f);
    if (r?.ok) onDone();
    return r;
  }, null);
  return (
    <form action={run} className="flex flex-col gap-4">
      <input type="hidden" name="pid" value={pid} />
      <label className={`${etiqueta} sm:max-w-md`}>¿A quién?
        <select name="para" required defaultValue={equipo.some((e) => e.user_id === marcado) ? marcado ?? "" : equipo[0]?.user_id ?? ""} className={campo}>
          {equipo.map((e) => <option key={e.user_id} value={e.user_id}>{e.nombre}{e.puesto ? ` · ${e.puesto}` : ""}</option>)}
        </select>
      </label>
      <label className={etiqueta}>Tu mensaje
        <textarea name="motivo" required maxLength={1000} rows={4} className={campo} placeholder="Ej. ¿Puedo llegar 7:30 el sábado? Salgo de la escuela tarde." />
      </label>
      <button disabled={pending || equipo.length === 0} className="self-start rounded-full bg-texto px-6 py-3 text-sm font-bold text-sala disabled:opacity-50">
        {pending ? "Enviando…" : "Enviar mensaje"}
      </button>
      <Resultado state={state} />
    </form>
  );
}

// Nueva solicitud: el integrante elige qué quiere mandar y llena solo lo necesario.
export function RequestForm({ pid, uid, ensayos, horas, tolerancia, docTipos, cuota, inicial, equipo = [] }: {
  pid: string; uid: string; ensayos: EnsayoOpcion[]; horas: number; tolerancia: number; docTipos: { id: string; nombre: string }[];
  cuota: number | null; inicial: { tipo: TipoForm | null; falta: string | null; para?: string | null }; equipo?: EquipoOpcion[];
}) {
  const [tipo, setTipo] = useState<TipoForm | null>(inicial.tipo);
  const [vuelta, setVuelta] = useState(0); // al enviar, el formulario queda limpio
  const [hecho, setHecho] = useState<string | null>(null);
  const listo = () => { setVuelta((v) => v + 1); setHecho(tipo === "mensaje" ? "Mensaje enviado. Aparece abajo en “Mis solicitudes”; te avisamos cuando te respondan." : "Solicitud enviada. Aparece abajo en “Mis solicitudes”; te avisamos cuando la revisen."); };
  const tipos: { id: TipoForm; label: string; icono: IconoNombre; ayuda: string }[] = [
    ...(Object.keys(TIPO_SOLICITUD) as RequestTipo[]).map((t) => ({ id: t as TipoForm, ...TIPO_SOLICITUD[t] })),
    ...(equipo.length ? [{ id: "mensaje" as TipoForm, label: "Escribir a alguien del equipo", icono: "personas" as IconoNombre, ayuda: "Le llega solo a esa persona. Si necesita respuesta, te avisamos cuando conteste." }] : []),
  ];
  const botonClase = "flex min-h-24 flex-col items-start gap-1 rounded-xl border p-3 text-left text-sm transition-colors";
  return (
    <div className="flex flex-col gap-4">
      <div className={`grid grid-cols-2 gap-2 ${tipos.length > 5 ? "lg:grid-cols-3" : "lg:grid-cols-5"}`} role="group" aria-label="¿Qué quieres mandar?">
        {tipos.map((t) => (
          <button key={t.id} type="button" onClick={() => { setTipo(t.id); setHecho(null); }} aria-pressed={tipo === t.id}
            className={`${botonClase} ${tipo === t.id ? "border-violeta-claro bg-ciruela/20" : "border-white/10 bg-sala hover:border-white/30"}`}>
            <Icono nombre={t.icono} className="h-6 w-6" />
            <b className="leading-tight">{t.label}</b>
          </button>
        ))}
      </div>
      {hecho && <p role="status" className="rounded-lg bg-[#14532d]/60 px-4 py-3 text-sm font-semibold text-[#bbf7d0]"><Icono nombre="check" /> {hecho}</p>}
      {tipo && <p className="text-sm text-texto-2">{tipos.find((t) => t.id === tipo)?.ayuda}</p>}
      {tipo === "mensaje" && <MensajeForm key={`m${vuelta}`} pid={pid} equipo={equipo} marcado={inicial.para ?? null} onDone={listo} />}
      {tipo === "falta" && <FaltaForm key={`f${vuelta}`} pid={pid} ensayos={ensayos} horas={horas} marcado={inicial.falta} onDone={listo} />}
      {tipo === "llegada" && <LlegadaForm key={`l${vuelta}`} pid={pid} ensayos={ensayos} tolerancia={tolerancia} marcado={inicial.falta} onDone={listo} />}
      {tipo && tipo !== "falta" && tipo !== "llegada" && tipo !== "mensaje" && <OtraForm key={`${tipo}${vuelta}`} pid={pid} uid={uid} tipo={tipo} docTipos={docTipos} cuota={cuota} onDone={listo} />}
    </div>
  );
}
