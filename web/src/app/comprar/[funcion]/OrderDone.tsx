import Link from "next/link";
import { limiteTexto } from "@/lib/expiry-rules";
import { formatMoney } from "@/lib/tickets";
import type { OrderResult } from "./actions";

// Pantalla final de una compra (asientos o entrada general): plazo para pagar y WhatsApp.
export function OrderDone({ result }: { result: Extract<OrderResult, { ok: true }> }) {
  return (
      <div role="status" className="flex max-w-2xl flex-col gap-4 rounded-2xl bg-telon p-8">
        <p className="titular text-3xl">¡Asientos apartados!</p>
        <p className="text-lg">Orden <b>{result.orderCode}</b> · {result.seats.join(", ")} · Total {formatMoney(result.total)}</p>
        {result.expiresAt && (
          <p className="rounded-xl border border-[#fde68a]/40 bg-[#fde68a]/10 px-4 py-3 text-sm">
            Tus asientos quedan apartados hasta <b>{limiteTexto(result.expiresAt)}</b>. Si no se confirma tu pago para entonces, se liberan solos.
          </p>
        )}
        <p className="text-texto-2">Tu solicitud quedó guardada y tus asientos están apartados hasta que confirmemos tu pago. Cuando se apruebe, tus boletos con QR aparecerán en Mi cuenta.</p>
        <div className="flex flex-wrap gap-3">
          {result.whatsappUrl ? (
            <a href={result.whatsappUrl} className="rounded-full bg-[#25d366] px-6 py-4 text-sm font-bold text-[#062b16]">Pagar por WhatsApp</a>
          ) : (
            <Link href="/contacto" className="rounded-full bg-[#25d366] px-6 py-4 text-sm font-bold text-[#062b16]">Escríbenos para pagar</Link>
          )}
          <Link href={`/cuenta?orden=${result.orderCode}`} className="rounded-full border border-white/30 px-6 py-4 text-sm font-bold">Ir a Mis boletos</Link>
        </div>
      </div>
  );
}
