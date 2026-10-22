"use client";

import { input } from "@/components/panel/ui";
import { METODOS_PAGO } from "@/lib/ventas-rules";

export type Pago = { metodo: string; codigo: string; motivo: string; /** 0120: correo de la cuenta DARF del comprador. */ correo: string };
export const PAGO_INICIAL: Pago = { metodo: "efectivo", codigo: "", motivo: "", correo: "" };

// Cómo pagó, código de descuento y, si es cortesía, su motivo (0091). Lo usan las dos taquillas.
export function PagoTaquilla({ pago, onChange }: { pago: Pago; onChange: (p: Pago) => void }) {
  const cortesia = pago.metodo === "cortesia";
  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Correo de su cuenta DARF (opcional)
        <input className={input} type="email" autoComplete="off" value={pago.correo} placeholder="para que vea sus boletos en Mi cuenta" onChange={(e) => onChange({ ...pago, correo: e.target.value })} />
        <span className="text-xs font-normal text-texto-3">Si aún no tiene cuenta, sus boletos se le pasan solos cuando la cree con ese correo.</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Cómo pagó
        <select className={input} value={pago.metodo} onChange={(e) => onChange({ ...pago, metodo: e.target.value })}>
          {METODOS_PAGO.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      {cortesia ? (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Motivo de la cortesía *
          <input className={input} value={pago.motivo} maxLength={300} placeholder="Ej. Prensa, patrocinador, familia del elenco" onChange={(e) => onChange({ ...pago, motivo: e.target.value })} />
        </label>
      ) : (
        <label className="flex flex-col gap-1.5 text-sm font-semibold">Código de descuento (opcional)
          <input className={`${input} uppercase`} value={pago.codigo} onChange={(e) => onChange({ ...pago, codigo: e.target.value })} />
        </label>
      )}
    </>
  );
}

/** Pantalla final: aviso si algo no se aplicó y el PDF de los boletos para reimprimir o enviar. */
export function DespuesDeVenta({ pid, orderCode, aviso, cuenta }: { pid: string; orderCode: string; aviso?: string; cuenta?: string }) {
  return (
    <>
      {cuenta && <p role="status" className="rounded-xl border border-exito/40 bg-exito/10 px-4 py-3 text-sm">{cuenta}</p>}
      {aviso && <p role="alert" className="rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">{aviso}</p>}
      <a href={`/panel/producciones/${pid}/boletos/orden/${orderCode}/pdf`} className="self-start text-sm font-bold text-violeta-claro underline">Descargar boletos en PDF</a>
    </>
  );
}
