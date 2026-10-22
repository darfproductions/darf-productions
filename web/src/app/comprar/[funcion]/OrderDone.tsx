"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { limiteTexto } from "@/lib/expiry-rules";
import { formatMoney } from "@/lib/tickets";
import { PAGO_EN_LINEA } from "@/lib/ventas-rules";
import type { OrderResult } from "./actions";

const verde = "rounded-full bg-[#25d366] px-6 py-4 text-sm font-bold text-[#062b16]";

// Pantalla final de una compra (asientos o entrada general).
// 0120: 'web' = checkout (total y método de pago; hoy solo WhatsApp). 'hibrido' = te manda directo a WhatsApp.
// Con `mostrarTotal` apagado no se ve el total en pantalla (el mensaje de WhatsApp sí lo lleva).
export function OrderDone({ result, modo = "web", mostrarTotal = true }: { result: Extract<OrderResult, { ok: true }>; modo?: "web" | "hibrido"; mostrarTotal?: boolean }) {
  const [metodo, setMetodo] = useState(PAGO_EN_LINEA.find((m) => m.activo)?.id ?? "whatsapp");
  // Híbrido: en cuanto se apartan los lugares se abre WhatsApp (y queda el botón por si el navegador lo bloquea).
  useEffect(() => {
    if (modo === "hibrido" && result.whatsappUrl) window.location.assign(result.whatsappUrl);
  }, [modo, result.whatsappUrl]);
  const pagar = result.whatsappUrl
    ? <a href={result.whatsappUrl} className={verde}>{modo === "hibrido" ? "Abrir WhatsApp" : "Pagar con WhatsApp"}</a>
    : <Link href="/contacto" className={verde}>{modo === "hibrido" ? "Escríbenos" : "Escríbenos para pagar"}</Link>;

  return (
      <div role="status" className="flex max-w-2xl flex-col gap-4 rounded-2xl bg-telon p-8">
        <p className="titular text-3xl">{modo === "hibrido" ? "¡Listo! Sigue en WhatsApp" : "¡Lugares apartados!"}</p>
        {/* Híbrido: sin hablar de pago ni boletos (pedido de Diego). */}
        <p className="text-lg">{modo === "hibrido" ? "Código" : "Orden"} <b>{result.orderCode}</b> · {result.seats.join(", ")}{mostrarTotal && <> · Total {formatMoney(result.total)}</>}</p>
        {/* 0122: lo que incluye su zona. */}
        {!!result.incluye?.length && (
          <ul className="flex flex-col gap-1 rounded-xl bg-white/5 px-4 py-3 text-sm">
            {result.incluye.map((x) => <li key={x}>{x}</li>)}
          </ul>
        )}
        {result.expiresAt && (
          <p className="rounded-xl border border-aviso/40 bg-aviso/10 px-4 py-3 text-sm">
            Tus lugares quedan apartados hasta <b>{limiteTexto(result.expiresAt)}</b>; {modo === "hibrido" ? "si no se confirman para entonces" : "si no se confirma tu pago para entonces"}, se liberan solos.
          </p>
        )}
        {modo === "hibrido" ? (
          <p className="text-texto-2">Te estamos llevando a WhatsApp con tu código y tus lugares para seguir ahí. Si no se abrió, toca el botón.</p>
        ) : (
          <>
            {mostrarTotal && (
              <dl className="flex justify-between border-y border-white/10 py-3 text-lg font-bold"><dt>Total a pagar</dt><dd>{formatMoney(result.total)}</dd></dl>
            )}
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">Método de pago</legend>
              {PAGO_EN_LINEA.map((m) => (
                <label key={m.id} className={`flex items-start gap-3 rounded-xl border p-4 ${metodo === m.id ? "border-texto bg-white/5" : "border-white/15"} ${m.activo ? "cursor-pointer" : "opacity-50"}`}>
                  <input type="radio" name="metodo" value={m.id} checked={metodo === m.id} disabled={!m.activo} onChange={() => setMetodo(m.id)} className="mt-1" />
                  <span><b>{m.label}</b><span className="block text-sm text-texto-2">{m.ayuda}</span></span>
                </label>
              ))}
            </fieldset>
            <p className="text-texto-2">Tus lugares están apartados hasta que confirmemos tu pago. Cuando se apruebe, tus boletos con QR aparecerán en Mi cuenta.</p>
          </>
        )}
        {modo !== "hibrido" && (
          <p className="text-sm text-texto-2">
            Te avisamos en Mi cuenta cuando se apruebe y si tu apartado está por vencer.{" "}
            <Link href="/cuenta/notificaciones#telefono" className="font-bold text-violeta-claro underline">Activa los avisos en tu teléfono</Link> para enterarte al momento.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {pagar}
          <Link href={`/cuenta?orden=${result.orderCode}`} className="rounded-full border border-white/30 px-6 py-4 text-sm font-bold">{modo === "hibrido" ? "Ir a Mi cuenta" : "Ir a Mis boletos"}</Link>
        </div>
      </div>
  );
}
