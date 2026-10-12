import { mesNombre, pesos } from "@/lib/member-rules";
import { fechaEnsayo } from "@/lib/rehearsal-rules";
import { ESTADO_SOLICITUD, METODOS, TIPO_SOLICITUD, resumenSolicitud, type MemberRequest } from "@/lib/request-rules";

const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Una solicitud del elenco (0070): la usan el portal del integrante y el panel.
export function RequestCard({ r, url, persona, children }: { r: MemberRequest; url?: string; persona?: string; children?: React.ReactNode }) {
  const est = ESTADO_SOLICITUD[r.estado];
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-white/10 bg-sala p-4 text-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-texto-3">
            <span aria-hidden="true">{TIPO_SOLICITUD[r.tipo].icono} </span>{TIPO_SOLICITUD[r.tipo].corto} · {fecha(r.created_at)}
          </p>
          <p className="wrap-anywhere text-base font-bold">{persona ? `${persona} · ` : ""}{resumenSolicitud(r, mesNombre)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${est.cls}`}>{est.label}</span>
      </header>
      {r.ensayos.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-texto-2">
          {r.ensayos.map((e) => <li key={e.id}>• {e.titulo} · {mayus(fechaEnsayo(e.inicia))}</li>)}
        </ul>
      )}
      {r.tipo === "pago" && (
        <p className="text-texto-2">
          {pesos(Number(r.monto))} · {METODOS.find(([v]) => v === r.metodo)?.[1] ?? r.metodo}
          {r.monto_aprobado !== null && r.monto_aprobado !== r.monto && <> · <b className="text-texto">se registraron {pesos(r.monto_aprobado)}</b></>}
        </p>
      )}
      {r.motivo && <p className="whitespace-pre-line wrap-anywhere">{r.motivo}</p>}
      {r.archivo_path && (url ? <a href={url} target="_blank" rel="noreferrer" className="self-start font-bold text-violeta-claro underline">Ver archivo ↗</a>
        : <span className="text-texto-3">Archivo adjunto</span>)}
      {r.respuesta && (
        <p className={`rounded-lg px-3 py-2 ${r.estado === "rechazada" ? "bg-[#5a1a22]/50" : "bg-white/5"}`}>
          <span className="font-bold">Respuesta: </span><span className="wrap-anywhere">{r.respuesta}</span>
        </p>
      )}
      {children}
    </article>
  );
}
