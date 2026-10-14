"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { QrScanner } from "@/components/panel/QrScanner";
import { deskCheckin, type DeskResult } from "../../actions";
import { Icono, type IconoNombre } from "@/components/Icono";

const VISTA: Record<string, { bg: string; title: string; icono: IconoNombre }> = {
  ok: { bg: "bg-[#14532d]", title: "Registrado", icono: "check" },
  ya_registrado: { bg: "bg-[#5a4313]", title: "Ya estaba registrado", icono: "alerta" },
  no_admitido: { bg: "bg-[#5a1a22]", title: "No admitido", icono: "x" },
  no_encontrado: { bg: "bg-[#5a1a22]", title: "No se encontró", icono: "x" },
  error: { bg: "bg-[#5a1a22]", title: "No se pudo registrar", icono: "alerta" },
};

// Mesa de registro: lee el QR de la inscripción o se marca a mano.
export function Desk({ aid }: { aid: string }) {
  const router = useRouter();
  const [res, setRes] = useState<DeskResult | null>(null);
  const [pending, start] = useTransition();
  const v = res ? VISTA[res.result] ?? VISTA.error : null;
  const run = (ref: string) => start(async () => { setRes(await deskCheckin(aid, ref)); router.refresh(); });
  return (
    <div className="flex flex-col gap-4">
      {res && v && (
        <div role="status" className={`rounded-2xl p-6 text-white ${v.bg}`}>
          <p className="flex items-center gap-3 text-2xl font-black"><Icono nombre={v.icono} />{v.title}</p>
          {"numero" in res && res.numero && <p className="text-5xl font-black">Nº {res.numero}</p>}
          {"nombre" in res && res.nombre && <p className="text-lg">{res.nombre}{"es_menor" in res && res.es_menor ? " · menor de edad" : ""}</p>}
          {res.result === "error" && "message" in res && <p>{res.message}</p>}
        </div>
      )}
      <QrScanner busy={pending} placeholder="Código del QR de inscripción" onCode={run} />
    </div>
  );
}
