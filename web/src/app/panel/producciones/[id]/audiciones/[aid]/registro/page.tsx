import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { ESTADO_SOLICITUD } from "@/lib/audition-rules";
import { formatSlot } from "@/lib/auditions";
import { canAny } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { walkIn } from "../../actions";
import { Desk } from "./Desk";
import { MarkButton } from "./MarkButton";

export const metadata: Metadata = { title: "Registro del día" };

type Row = { id: string; nombre: string; slot_inicia: string | null; estado: string; numero: number | null; checked_in_at: string | null; walk_in: boolean; es_menor: boolean };

// Mesa de registro: lista por horario (sin datos de contacto), QR, "Llegó" y alta rápida.
export default async function DeskPage({ params }: PageProps<"/panel/producciones/[id]/audiciones/[aid]/registro">) {
  const { id, aid } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/audiciones/${aid}/registro`);
  if (!canAny(access, id, ["audiciones.registro", "audiciones.gestionar"])) redirect(`/panel/producciones/${id}/audiciones/${aid}`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audition_desk_list", { aid });
  const rows = (data ?? []) as Row[];
  const llegaron = rows.filter((r) => r.checked_in_at).length;
  const grupos = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.slot_inicia ?? "";
    grupos.set(k, [...(grupos.get(k) ?? []), r]);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-5">
        <Card><Desk pid={id} aid={aid} /></Card>
        <Card>
          <details>
            <summary className="cursor-pointer font-bold">+ Alta rápida (llegó sin registro)</summary>
            <div className="mt-3">
              <ActionForm action={walkIn} hidden={{ pid: id, aid }} submit="Registrar y dar número">
                <div className="grid gap-2">
                  <input className={input} name="nombre" required placeholder="Nombre completo" />
                  <input className={input} name="telefono" type="tel" required placeholder="Teléfono" />
                  <label className="flex flex-col gap-1 text-xs font-semibold">Fecha de nacimiento<input className={input} name="fecha_nacimiento" type="date" required /></label>
                  <p className="text-xs text-texto-3">Si es menor de edad: datos de su madre, padre o tutor (deben estar presentes).</p>
                  <input className={input} name="tutor_nombre" placeholder="Nombre del tutor (si es menor)" />
                  <input className={input} name="tutor_telefono" type="tel" placeholder="Teléfono del tutor (si es menor)" />
                </div>
              </ActionForm>
            </div>
          </details>
        </Card>
      </div>
      <div className="flex flex-col gap-4 lg:col-span-7">
        <Card className="p-4 md:p-4">
          <p className="text-sm"><b className="text-xl">{llegaron}</b> de {rows.length} ya llegaron</p>
        </Card>
        {error && <Card>{error.message}</Card>}
        {[...grupos.entries()].map(([slot, list]) => (
          <Card key={slot} className="p-0 md:p-0">
            <p className="px-5 pt-4 font-bold capitalize">{slot ? formatSlot(slot) : "Sin horario"}</p>
            <ul className="mt-2 divide-y divide-white/10">
              {list.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>
                    {r.numero && <b className="mr-2">Nº {r.numero}</b>}{r.nombre}
                    {r.es_menor && <span className="ml-2 text-xs text-[#f2b544]">menor</span>}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${ESTADO_SOLICITUD[r.estado]?.cls}`}>{ESTADO_SOLICITUD[r.estado]?.label}</span>
                  </span>
                  {r.checked_in_at ? <span className="text-xs font-bold text-[#bbf7d0]">✓ llegó</span> : r.estado !== "no_cumple" && <MarkButton pid={id} aid={aid} app={r.id} nombre={r.nombre} />}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
