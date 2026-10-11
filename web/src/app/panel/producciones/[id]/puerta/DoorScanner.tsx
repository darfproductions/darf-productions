"use client";

import { useState, useTransition } from "react";
import { QrScanner } from "@/components/panel/QrScanner";
import { checkIn, type CheckIn } from "./actions";

const VISTA: Record<string, { bg: string; title: string }> = {
  ok: { bg: "bg-[#14532d]", title: "✓ Puede pasar" },
  ya_usado: { bg: "bg-[#7c2d12]", title: "Ya se usó" },
  cancelado: { bg: "bg-[#5a1a22]", title: "Boleto cancelado" },
  no_aprobado: { bg: "bg-[#7c2d12]", title: "Compra sin aprobar" },
  no_encontrado: { bg: "bg-[#5a1a22]", title: "QR no válido" },
  error: { bg: "bg-[#5a1a22]", title: "No se pudo validar" },
};

// Puerta: valida boletos con el lector de QR del panel.
export function DoorScanner() {
  const [res, setRes] = useState<CheckIn | null>(null);
  const [pending, start] = useTransition();
  const v = res ? VISTA[res.result] : null;
  return (
    <div className="flex flex-col gap-4">
      {res && v && (
        <div role="status" className={`rounded-2xl p-6 text-white ${v.bg}`}>
          <p className="text-3xl font-black">{v.title}</p>
          {"seat_label" in res && res.seat_label && <p className="mt-1 text-xl font-bold">{res.seat_label}{"category" in res && res.category ? ` · ${res.category}` : ""}</p>}
          {"buyer_nombre" in res && res.buyer_nombre && <p className="text-lg">{res.buyer_nombre}</p>}
          {res.result === "error" && <p>{res.message}</p>}
        </div>
      )}
      <QrScanner busy={pending} placeholder="Código del boleto" onCode={(t) => start(async () => setRes(await checkIn(t)))} />
    </div>
  );
}
