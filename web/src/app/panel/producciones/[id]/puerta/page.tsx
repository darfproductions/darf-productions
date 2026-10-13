import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EscanerFan } from "@/components/fanzone/EscanerFan";
import { Card } from "@/components/panel/ui";
import { vigenteEnPuerta } from "@/lib/acceso-rules";
import { formatPerformanceDate } from "@/lib/productions";
import { can } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { DoorScanner } from "./DoorScanner";
import { funcionDePuerta } from "./door-rules";

export const metadata: Metadata = { title: "Puerta" };

// Validación de boletos en puerta, pensada para el celular. Se valida contra UNA función:
// un boleto de otra fecha se rechaza sin gastarse (0068).
export default async function DoorPage({ params }: PageProps<"/panel/producciones/[id]/puerta">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/puerta`);
  if (!can(access, id, "puerta.validar")) redirect(`/panel/producciones/${id}`);
  const supabase = await createClient();
  const { data } = await supabase.from("performances").select("id, starts_at").eq("production_id", id).not("starts_at", "is", null).order("starts_at");
  const funciones = (data ?? []) as { id: string; starts_at: string }[];
  // Eventos del Club Fan (0080): en la entrada se valida la credencial del socio.
  const { data: ev } = await supabase.from("fan_encuentros").select("id, tipo, categoria, titulo, inicia, termina, performances(starts_at)").eq("production_id", id).neq("tipo", "en_linea");
  const eventos = ((ev ?? []) as unknown as { id: string; tipo: string; categoria: string | null; titulo: string | null; inicia: string | null; termina: string | null; performances: { starts_at: string | null } | null }[])
    .map((e) => ({ ...e, cuando: e.performances?.starts_at ?? e.inicia }))
    .filter((e) => vigenteEnPuerta(e.cuando))
    .sort((a, b) => (a.cuando ?? "").localeCompare(b.cuando ?? ""));
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="mb-4 text-sm text-texto-2">Elige la función que está entrando y apunta la cámara al QR del boleto. Cada boleto solo entra una vez y solo en su función.</p>
        {funciones.length ? <DoorScanner funciones={funciones} inicial={funcionDePuerta(funciones, new Date())} /> : <p className="text-sm">Esta obra no tiene funciones con fecha.</p>}
      </Card>
      {eventos.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="titular text-xl">Eventos · Club Fan</h2>
            <p className="mt-1 text-sm text-texto-2">Para los eventos (foto con el elenco, tours, early access…) no hay boleto aparte: se escanea la credencial del Club Fan (QR dorado, código FAN-XXXX).</p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {eventos.map((e) => {
              const nombre = e.titulo || e.categoria || "Evento";
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-linea px-3 py-2.5">
                  <span><b>{nombre}</b> <span className="text-texto-3">· {formatPerformanceDate(e.cuando)}</span></span>
                  <EscanerFan pid={id} eid={e.id} titulo={nombre} botonClass="fb fb-fz fb-sm" />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
