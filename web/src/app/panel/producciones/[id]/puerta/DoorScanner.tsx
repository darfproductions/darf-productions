"use client";

import { useState, useTransition } from "react";
import { QrScanner } from "@/components/panel/QrScanner";
import { checkIn, type CheckIn } from "./actions";
import { etiquetaBoleto } from "./door-rules";

const VISTA: Record<string, { bg: string; title: string }> = {
  ok: { bg: "bg-[#14532d]", title: "✓ Puede pasar" },
  ya_usado: { bg: "bg-[#7c2d12]", title: "Ya se usó" },
  cancelado: { bg: "bg-[#5a1a22]", title: "Boleto cancelado" },
  no_aprobado: { bg: "bg-[#7c2d12]", title: "Compra sin aprobar" },
  otra_funcion: { bg: "bg-[#5a1a22]", title: "✗ Boleto de otra función" },
  no_encontrado: { bg: "bg-[#5a1a22]", title: "QR no válido" },
  error: { bg: "bg-[#5a1a22]", title: "No se pudo validar" },
};

const fecha = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));

// Puerta: valida boletos de la función elegida con el lector de QR del panel.
export function DoorScanner({ funciones, inicial }: { funciones: { id: string; starts_at: string }[]; inicial: string | null }) {
  const [funcion, setFuncion] = useState(inicial ?? funciones[0]?.id ?? "");
  const [res, setRes] = useState<CheckIn | null>(null);
  const [pending, start] = useTransition();
  const v = res ? VISTA[res.result] : null;
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Función que está entrando
        <select value={funcion} onChange={(e) => { setFuncion(e.target.value); setRes(null); }} className="rounded-lg border border-white/10 bg-sala px-3 py-3 text-base font-bold capitalize text-texto">
          {funciones.map((f) => <option key={f.id} value={f.id}>{fecha(f.starts_at)}</option>)}
        </select>
      </label>
      {res && v && (
        <div role="status" className={`rounded-2xl p-6 text-white ${v.bg}`}>
          <p className="text-3xl font-black">{v.title}</p>
          {"seat_label" in res && res.seat_label && <p className="mt-1 text-xl font-bold">{etiquetaBoleto(res.seat_label, res.category)}</p>}
          {"buyer_nombre" in res && res.buyer_nombre && <p className="text-lg">{res.buyer_nombre}</p>}
          {"performance_starts_at" in res && res.performance_starts_at && (
            <p className={`mt-2 ${res.result === "otra_funcion" ? "text-lg font-bold" : "text-sm opacity-90"}`}>
              {res.result === "otra_funcion" ? "Es para: " : ""}{res.production ? `${res.production} · ` : ""}<span className="capitalize">{fecha(res.performance_starts_at)}</span>
            </p>
          )}
          {res.result === "otra_funcion" && <p className="mt-1 text-sm">No se marcó como usado. Mándalo a taquilla.</p>}
          {res.result === "error" && <p>{res.message}</p>}
        </div>
      )}
      <QrScanner busy={pending} placeholder="Código del boleto" onCode={(t) => start(async () => setRes(await checkIn(t, funcion)))} />
    </div>
  );
}
