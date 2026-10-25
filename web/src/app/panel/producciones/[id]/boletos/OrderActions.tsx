import { ActionForm } from "@/components/panel/ActionForm";
import { input } from "@/components/panel/ui";
import type { SaleOrder } from "@/lib/sales";
import { formatMoney } from "@/lib/tickets";
import { ligaWhatsApp } from "@/lib/pago-rules";
import { METODOS_PAGO, mensajeOrden, puedeExtender } from "@/lib/ventas-rules";
import { approveOrder, cancelOrder, cancelTicket, cortesiaOrden, extendOrder, rejectOrder } from "./actions";

const small = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";
const campo = `${input} py-2 text-sm`;
const panel = "mt-2 flex w-full max-w-md flex-col gap-2 rounded-xl bg-sala/60 p-3";
const resumen = "cursor-pointer list-none rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 [&::-webkit-details-marker]:hidden";

function Motivo({ id, placeholder }: { id: string; placeholder: string }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs font-semibold text-texto-2">
      Motivo (lo ve el comprador)
      <input id={id} name="motivo" maxLength={300} className={campo} placeholder={placeholder} />
    </label>
  );
}

// Acciones de una orden (0088): aprobar con método y referencia, rechazar o cancelar con motivo,
// cancelar un boleto y dar más tiempo a un apartado (también a uno vencido).
export function OrderActions({ pid, o, obra, funcion, limite, ligaCuenta, puertas }: { pid: string; o: SaleOrder; obra: string; funcion: string; limite?: string | null; ligaCuenta: string; puertas?: string | null }) {
  const activos = o.tickets.filter((t) => t.is_active);
  const h = { pid, order: o.id };
  // WhatsApp con un toque (Bloque 4A): mensaje ya escrito al teléfono del comprador.
  const wa = o.status === "pendiente" ? ligaWhatsApp(o.buyer_telefono, mensajeOrden("recordar", o, { obra, funcion, limite, liga: ligaCuenta }))
    : o.status === "aprobado" && !o.created_by_staff_id ? ligaWhatsApp(o.buyer_telefono, mensajeOrden("aprobada", o, { obra, funcion, liga: ligaCuenta, puertas })) : null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {wa && <a href={wa} target="_blank" rel="noreferrer" className={small}>{o.status === "pendiente" ? "WhatsApp: recordar pago" : "WhatsApp: avisar que se aprobó"}</a>}
      {o.status === "aprobado" && activos.length > 0 && <a href={`/panel/producciones/${pid}/boletos/orden/${o.order_code}/pdf`} className={small}>Boletos en PDF</a>}
      {o.status === "pendiente" && (
        <details className="group">
          <summary className={`${resumen} border-transparent bg-[#22c55e] text-[#052e16]`}>Aprobar</summary>
          <div className={panel}>
            <ActionForm action={approveOrder} hidden={h} confirm={`¿Aprobar ${o.order_code} por ${formatMoney(o.total)}? Confirma antes que recibiste el pago.`} submit="Aprobar orden" submitClass="rounded-full bg-[#22c55e] px-4 py-2 text-xs font-bold text-[#052e16] disabled:opacity-60">
              <label htmlFor={`m-${o.id}`} className="flex flex-col gap-1 text-xs font-semibold text-texto-2">
                Cómo pagó
                <select id={`m-${o.id}`} name="metodo" defaultValue="transferencia" className={campo}>
                  {METODOS_PAGO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label htmlFor={`r-${o.id}`} className="flex flex-col gap-1 text-xs font-semibold text-texto-2">
                Referencia o folio (opcional)
                <input id={`r-${o.id}`} name="referencia" maxLength={80} className={campo} placeholder="Ej. folio de la transferencia" />
              </label>
            </ActionForm>
          </div>
        </details>
      )}
      {o.status === "pendiente" && (
        <details>
          <summary className={resumen}>Rechazar</summary>
          <div className={panel}>
            <ActionForm action={rejectOrder} hidden={h} confirm={`¿Rechazar ${o.order_code}? Los lugares quedan libres.`} submit="Rechazar orden" submitClass={small}>
              <Motivo id={`rm-${o.id}`} placeholder="Ej. no recibimos el pago" />
            </ActionForm>
          </div>
        </details>
      )}
      {puedeExtender(o) && (
        <ActionForm inline action={extendOrder} hidden={{ ...h, horas: "24" }} confirm={o.status === "pendiente" ? `¿Dar 24 horas más a ${o.order_code}?` : `¿Reactivar ${o.order_code} por 24 horas? Solo funciona si sus lugares siguen libres.`} submit={o.status === "pendiente" ? "Dar 24 h más" : "Reactivar 24 h"} submitClass={small} />
      )}
      {o.status !== "rechazado" && activos.length > 1 && (
        <details>
          <summary className={resumen}>Cancelar un boleto</summary>
          <div className={panel}>
            <ActionForm action={cancelTicket} hidden={{ pid }} confirm="¿Cancelar este boleto? Su precio se descuenta de la orden y el lugar queda libre." submit="Cancelar boleto" submitClass={small}>
              <label htmlFor={`t-${o.id}`} className="flex flex-col gap-1 text-xs font-semibold text-texto-2">
                Boleto
                <select id={`t-${o.id}`} name="ticket" className={campo}>
                  {activos.map((t) => <option key={t.id} value={t.id}>{t.seat_label ?? "General"}{t.checked_in_at ? " (ya entró)" : ""}</option>)}
                </select>
              </label>
              <Motivo id={`tm-${o.id}`} placeholder="Ej. cambio de asiento" />
            </ActionForm>
          </div>
        </details>
      )}
      {o.status === "aprobado" && o.metodo_pago !== "cortesia" && Number(o.total) > 0 && (
        <details>
          <summary className={resumen}>Hacer cortesía</summary>
          <div className={panel}>
            <ActionForm action={cortesiaOrden} hidden={h} confirm={`¿Dejar ${o.order_code} como cortesía en $0? Si ya pagó, devuelve ${formatMoney(o.total)}.`} submit="Hacer cortesía" submitClass={small}>
              <label htmlFor={`cz-${o.id}`} className="flex flex-col gap-1 text-xs font-semibold text-texto-2">
                Motivo (a quién y por qué)
                <input id={`cz-${o.id}`} name="motivo" maxLength={300} required className={campo} placeholder="Ej. prensa, patrocinador" />
              </label>
            </ActionForm>
          </div>
        </details>
      )}
      {o.status !== "rechazado" && (
        <details>
          <summary className={resumen}>Cancelar orden</summary>
          <div className={panel}>
            <ActionForm action={cancelOrder} hidden={h} confirm={`¿Cancelar toda la orden ${o.order_code}? Todos sus boletos dejan de servir.`} submit="Cancelar orden completa" submitClass={small}>
              <Motivo id={`cm-${o.id}`} placeholder="Ej. reembolso solicitado" />
              {o.status === "aprobado" && <p className="text-xs text-aviso">Ya está pagada: recuerda devolver {formatMoney(o.total)} al comprador.</p>}
            </ActionForm>
          </div>
        </details>
      )}
    </div>
  );
}
