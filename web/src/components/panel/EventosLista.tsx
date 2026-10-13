import { EscanerFan } from "@/components/fanzone/EscanerFan";
import { ActionForm } from "@/components/panel/ActionForm";
import { marcarLlegada, revisarPagoEvento, setEvento } from "@/app/panel/eventos/actions";
import { ACCESO_EVENTO, TIPOS_EVENTO, precioTexto, type AccesoEvento, type TipoEvento } from "@/lib/eventos-rules";
import { tiempoRestante } from "@/lib/expiry-rules";
import { vigenteEnPuerta } from "@/lib/acceso-rules";
import { numeroSocio } from "@/lib/fanzone-rules";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";

const small = "rounded-full border border-white/25 px-2.5 py-1 text-xs font-bold hover:border-white/50 disabled:opacity-60";
const horaMx = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" });

type Fila = {
  id: string; production_id: string | null; tipo: TipoEvento; categoria: string | null; titulo: string | null; lugar: string | null;
  inicia: string | null; termina: string | null; liga: string | null; acceso: AccesoEvento; cupo: number | null; abierto: boolean; notas: string | null;
  requiere_registro: boolean; requiere_boleto: boolean; precio: number | null; precio_socio: number | null; performances: { starts_at: string | null } | null; productions: { nombre: string } | null;
};
type Persona = {
  user_id: string; nombre: string; telefono: string | null; numero: number | null; llegada_at: string | null;
  orden_id: string | null; orden_codigo: string | null; orden_status: "pendiente" | "aprobado" | null; orden_monto: number | null; orden_expira: string | null;
};

// Eventos de DARF para el equipo (0081): Panel → Eventos y la pestaña Fan Zone de cada obra.
// Cada uno con su lista (quién apartó y quién llegó), validar credenciales, abrir/cerrar registro y borrar.
export async function EventosLista({ pid }: { pid?: string | null }) {
  const supabase = await createClient();
  let q = supabase.from("fan_encuentros").select("id, production_id, tipo, categoria, titulo, lugar, inicia, termina, liga, acceso, cupo, abierto, notas, requiere_registro, requiere_boleto, precio, precio_socio, performances(starts_at), productions(nombre)");
  if (pid) q = q.eq("production_id", pid);
  const { data } = await q;
  const filas = ((data ?? []) as unknown as Fila[]).map((e) => ({ ...e, cuando: e.performances?.starts_at ?? e.inicia }))
    .sort((a, b) => (a.cuando ?? "").localeCompare(b.cuando ?? ""));
  const personas = await Promise.all(filas.map(async (e) => ((await supabase.rpc("fan_encuentro_personas", { eid: e.id })).data ?? []) as Persona[]));
  const todos = filas.map((e, i) => ({ e, lista: personas[i], vigente: vigenteEnPuerta(e.termina ?? e.cuando, e.termina ? 0 : 3) }));
  const proximos = todos.filter((x) => x.vigente);
  const pasados = todos.filter((x) => !x.vigente).reverse();

  const item = ({ e, lista }: { e: (typeof filas)[number]; lista: Persona[] }) => {
    const nombre = e.titulo || e.categoria || "Evento";
    const llegaron = lista.filter((x) => x.llegada_at).length;
    const porPagar = lista.filter((x) => x.orden_status === "pendiente").length;
    return (
      <li key={e.id} className="rounded-xl border border-linea p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="mr-1.5 rounded-full bg-oro/15 px-2 py-0.5 text-[11px] font-bold text-oro">{TIPOS_EVENTO[e.tipo].label}{e.categoria && e.titulo ? ` · ${e.categoria}` : ""}</span>
            <span className="mr-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">{ACCESO_EVENTO[e.acceso].corto}</span>
            <b>{nombre}</b> · <span className="capitalize">{formatPerformanceDate(e.cuando)}</span>
            <span className="block text-xs text-texto-3">
              {pid ? "" : `${e.productions?.nombre ?? "DARF (sin obra)"} · `}
              {e.requiere_registro ? `${lista.length}${e.cupo ? ` de ${e.cupo}` : ""} registrados · registro ${e.abierto ? "abierto" : "cerrado"}` : `Sin registro${e.cupo ? ` · cupo ${e.cupo}` : ""}`}
              {` · ${llegaron} ${e.tipo === "en_linea" ? "entraron" : llegaron === 1 ? "llegó" : "llegaron"}`}
              {e.requiere_boleto ? " · pide boleto" : ""}{e.lugar ? ` · ${e.lugar}` : ""}
              {e.precio != null ? ` · ${precioTexto(e)}` : ""}
              {e.liga ? ` · ${e.liga}` : ""}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            {e.tipo !== "en_linea" && <EscanerFan pid={e.production_id ?? ""} eid={e.id} titulo={nombre} botonClass="fb fb-fz fb-sm" />}
            {e.requiere_registro && <ActionForm inline action={setEvento} hidden={{ pid: e.production_id ?? "", id: e.id, accion: e.abierto ? "cerrar" : "abrir" }} submit={e.abierto ? "Cerrar registro" : "Abrir registro"} submitClass={small} />}
            <ActionForm inline action={setEvento} hidden={{ pid: e.production_id ?? "", id: e.id, accion: "borrar" }} confirm="¿Borrar este evento y su lista?" submit="Borrar" submitClass={small} />
          </span>
        </div>
        {e.notas && <p className="mt-1 text-xs text-texto-3">{e.notas}</p>}
        {lista.length > 0 && (
          <details className="mt-2" open={porPagar > 0}>
            <summary className="cursor-pointer text-xs font-bold text-lila">Ver lista ({lista.length}){porPagar > 0 && <span className="ml-1.5 rounded-full bg-aviso/20 px-2 py-0.5 text-aviso">{porPagar} por pagar</span>}</summary>
            <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-xs">
              {lista.map((x) => (
                <li key={x.user_id}>
                  <span className="flex flex-wrap items-center gap-2">
                    {x.nombre || "Sin nombre"}{x.numero ? ` · socio ${numeroSocio(x.numero)}` : ""}{x.telefono ? ` · ${x.telefono}` : ""}
                    {x.orden_status === "aprobado" && Number(x.orden_monto) > 0 && <span className="text-exito">Pagado ${Number(x.orden_monto).toLocaleString("es-MX")} · {x.orden_codigo}</span>}
                    {x.orden_status === "pendiente" && (
                      <>
                        <span className="text-aviso">Por pagar ${Number(x.orden_monto).toLocaleString("es-MX")} · {x.orden_codigo}{tiempoRestante(x.orden_expira) ? ` · vence en ${tiempoRestante(x.orden_expira)}` : ""}</span>
                        <ActionForm inline action={revisarPagoEvento} hidden={{ pid: e.production_id ?? "", orden: x.orden_id ?? "", aprobar: "1" }} submit="Aprobar pago" submitClass={`${small} border-exito/60 text-exito`} />
                        <ActionForm inline action={revisarPagoEvento} hidden={{ pid: e.production_id ?? "", orden: x.orden_id ?? "", aprobar: "0" }} confirm="¿Rechazar este apartado? Se libera su lugar." submit="Rechazar" submitClass={small} />
                      </>
                    )}
                    {x.llegada_at ? <b className="text-exito">✓ {horaMx(x.llegada_at)}</b> : null}
                    {e.tipo !== "en_linea" && (
                      <ActionForm inline action={marcarLlegada} hidden={{ pid: e.production_id ?? "", id: e.id, uid: x.user_id, on: x.llegada_at ? "0" : "1" }} submit={x.llegada_at ? "Quitar llegada" : "Marcar llegada"} submitClass={small} />
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </details>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">{proximos.map(item)}</ul>
      {proximos.length === 0 && <p className="text-sm text-texto-3">No hay eventos próximos.</p>}
      {pasados.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-bold text-texto-2">Eventos pasados ({pasados.length})</summary>
          <ul className="mt-3 flex flex-col gap-3 opacity-80">{pasados.map(item)}</ul>
        </details>
      )}
    </div>
  );
}
