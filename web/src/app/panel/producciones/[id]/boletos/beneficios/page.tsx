import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/panel/ActionForm";
import { Card, input } from "@/components/panel/ui";
import { Icono } from "@/components/Icono";
import { listPerformances, listZones } from "@/lib/boleteria";
import { listarBeneficios } from "@/lib/beneficios";
import { MOMENTOS_ENTREGA, PLANTILLAS_BENEFICIO, TIPOS_BENEFICIO, notaBeneficio, porZona, textoBeneficio, textoCupo, type Beneficio, type MomentoEntrega, type TipoBeneficio } from "@/lib/beneficios-rules";
import { can, salidaBoletos } from "@/lib/panel-nav";
import { requirePanel } from "@/lib/permissions";
import { formatPerformanceDate } from "@/lib/productions";
import { createClient } from "@/lib/supabase/server";
import { borrarBeneficio, guardarBeneficio, moverBeneficio } from "../actions";
import { NotaBeneficio } from "./NotaBeneficio";

export const metadata: Metadata = { title: "Beneficios por zona" };

const ghost = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";
type Fn = { id: string; starts_at: string | null };
type Zona = { id: string; nombre: string };
type Fila = { beneficio_id: string; nombre: string; tipo: TipoBeneficio; cupo: number | null; con_derecho: number; entregados: number; pendientes: number; vencidos: number };

/** "Al terminar la función" / "Después de la función (7 días)". */
const momento = (b: Pick<Beneficio, "entrega" | "entrega_dias">) => `${MOMENTOS_ENTREGA[b.entrega].label}${b.entrega_dias ? ` (${b.entrega_dias} ${b.entrega_dias === 1 ? "día" : "días"})` : ""}`;

function Campos({ b, zonas, funciones }: { b?: Beneficio; zonas: Zona[]; funciones: Fn[] }) {
  const algunas = !!b?.funciones?.length;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Tipo
        <select className={input} name="tipo" defaultValue={b?.tipo ?? "experiencia"}>
          {(Object.keys(TIPOS_BENEFICIO) as TipoBeneficio[]).map((t) => <option key={t} value={t}>{TIPOS_BENEFICIO[t].label} — {TIPOS_BENEFICIO[t].ayuda}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Nombre *
        <input className={input} name="nombre" required minLength={2} maxLength={120} defaultValue={b?.nombre ?? ""} placeholder="Póster firmado por el elenco" />
      </label>
      <NotaBeneficio defaultValue={b?.detalle ?? ""} />
      {/* 0130: uno por compra (el póster firmado de VIP: uno por orden aunque traiga 10 boletos). */}
      <fieldset className="flex flex-col gap-1.5 text-sm sm:col-span-2">
        <legend className="mb-1 font-semibold">¿A quién le toca?</legend>
        <label className="flex items-start gap-2"><input type="radio" name="por_compra" value="0" defaultChecked={!b?.por_compra} className="mt-1" />
          <span><b>Uno por boleto</b> — cada boleto de la zona lo lleva (por ejemplo, el acceso anticipado).</span></label>
        <label className="flex items-start gap-2"><input type="radio" name="por_compra" value="1" defaultChecked={!!b?.por_compra} className="mt-1" />
          <span><b>Uno por compra</b> — una orden con 10 boletos lleva uno solo. Al público le sale &quot;Uno por compra, no por boleto&quot;.</span></label>
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Minutos antes (solo tipo Acceso)
        <input className={input} name="minutos_antes" type="number" min={1} max={240} defaultValue={b?.minutos_antes ?? ""} placeholder="15" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">¿Cuándo se entrega?
        <select className={input} name="entrega" defaultValue={b?.entrega ?? ""}>
          {!b && <option value="">Según el tipo (acceso: antes de la función; lo demás: al terminar)</option>}
          {(Object.keys(MOMENTOS_ENTREGA) as MomentoEntrega[]).map((m) => <option key={m} value={m}>{MOMENTOS_ENTREGA[m].label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Días (solo &quot;antes del día&quot; o &quot;después del día&quot;)
        <input className={input} name="entrega_dias" type="number" min={1} max={90} defaultValue={b?.entrega_dias ?? ""} placeholder="Antes: desde cuántos días antes. Después: plazo." />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">Cupo por función (vacío = todos)
        <input className={input} name="cupo" type="number" min={1} defaultValue={b?.cupo ?? ""} placeholder="20" />
      </label>
      <fieldset className="flex flex-col gap-1.5 text-sm sm:col-span-2">
        <legend className="mb-1 font-semibold">Zonas que lo incluyen</legend>
        <input type="hidden" name="con_zonas" value="1" />
        {zonas.length === 0 && <span className="text-texto-3">Primero crea zonas en Funciones y horarios o en el Mapa.</span>}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {zonas.map((z) => <label key={z.id} className="flex items-center gap-2"><input type="checkbox" name="zonas" value={z.id} defaultChecked={b?.zonas.includes(z.id)} /> {z.nombre}</label>)}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1.5 text-sm sm:col-span-2">
        <legend className="mb-1 font-semibold">¿En qué funciones?</legend>
        <label className="flex items-center gap-2"><input type="radio" name="cuando" value="todas" defaultChecked={!algunas} /> Todas</label>
        <label className="flex items-center gap-2"><input type="radio" name="cuando" value="algunas" defaultChecked={algunas} /> Solo en estas:</label>
        <div className="flex flex-col gap-1 pl-6">
          {funciones.map((fn) => <label key={fn.id} className="flex items-center gap-2"><input type="checkbox" name="funciones" value={fn.id} defaultChecked={b?.funciones?.includes(fn.id)} /> {formatPerformanceDate(fn.starts_at)}</label>)}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="activo" defaultChecked={b?.activo ?? true} /> Visible (página, boletos y puerta)</label>
    </div>
  );
}

// Beneficios por zona (0122): qué incluye cada zona además del lugar, y cuántos se han entregado por función.
export default async function BeneficiosPage({ params, searchParams }: PageProps<"/panel/producciones/[id]/boletos/beneficios">) {
  const { id } = await params;
  const access = await requirePanel(`/panel/producciones/${id}/boletos/beneficios`);
  const editar = can(access, id, "funciones.gestionar");
  if (!editar && !can(access, id, "ventas.ver")) redirect(salidaBoletos(access, id, "boletos/beneficios"));
  const [beneficios, zonasTodas, funcionesTodas] = await Promise.all([listarBeneficios(id), listZones(id), listPerformances(id)]);
  const zonas = zonasTodas.map((z) => ({ id: z.id, nombre: z.nombre }));
  const funciones = funcionesTodas.filter((f) => !f.cancelada_at);
  const sp = await searchParams;
  const ahora = new Date().getTime();
  const elegida = funciones.find((f) => f.id === sp.funcion) ?? funciones.find((f) => f.starts_at && Date.parse(f.starts_at) > ahora - 6 * 3600_000) ?? funciones[0];
  const supabase = await createClient();
  const { data: rep } = elegida ? await supabase.rpc("beneficios_reporte", { p_performance: elegida.id }) : { data: [] };
  const reporte = (rep ?? []) as Fila[];
  const grupos = porZona(beneficios);
  const hidden = { pid: id };
  return (
    <>
      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="titular text-xl">Beneficios por zona</h2>
          <p className="text-sm text-texto-2">Lo que incluye cada zona además del lugar: acceso anticipado, souvenirs, experiencias o atención especial. Se ve en la página de la obra, al elegir lugares, en el mensaje de WhatsApp, en el boleto y en la puerta. Cada beneficio dice cuándo se entrega; la lista de entregas lleva el control de lo que falta.</p>
        </div>
        {zonas.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {zonas.map((z) => {
              const xs = grupos.get(z.id) ?? [];
              return (
                <li key={z.id} className="rounded-xl bg-telon-2 p-3 text-sm">
                  <b>{z.nombre}</b>
                  {xs.length ? <ul className="mt-1 flex flex-col gap-0.5 text-texto-2">{xs.map((b) => <li key={b.id} className="flex items-center gap-1.5"><Icono nombre={TIPOS_BENEFICIO[b.tipo].icono} />{textoBeneficio(b)}{b.cupo ? ` · ${textoCupo(b.cupo)}` : ""}{notaBeneficio(b) && <span className="text-texto-3">— {notaBeneficio(b)}</span>}</li>)}</ul>
                    : <p className="text-texto-3">Solo el lugar.</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {beneficios.map((b, i) => (
        <Card key={b.id}>
          <details open={!b.zonas.length}>
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <Icono nombre={TIPOS_BENEFICIO[b.tipo].icono} /><b>{textoBeneficio(b)}</b>
                {notaBeneficio(b) && <span className="text-xs text-texto-2">— {notaBeneficio(b)}</span>}
                <span className="text-xs text-texto-3">{TIPOS_BENEFICIO[b.tipo].label} · {momento(b)}{b.cupo ? ` · ${textoCupo(b.cupo)}` : ""}{b.funciones?.length ? ` · ${b.funciones.length} función(es)` : ""}</span>
                {!b.activo && <span className="text-xs text-texto-3">oculto</span>}
                {!b.zonas.length && <span className="text-xs font-bold text-aviso">Sin zonas: no se ve en ningún lado</span>}
              </span>
              {editar && (
                <span className="flex gap-1">
                  {i > 0 && <ActionForm inline action={moverBeneficio} hidden={{ ...hidden, id: b.id, dir: "arriba" }} submit="Subir" submitClass={ghost} />}
                  {i < beneficios.length - 1 && <ActionForm inline action={moverBeneficio} hidden={{ ...hidden, id: b.id, dir: "abajo" }} submit="Bajar" submitClass={ghost} />}
                </span>
              )}
            </summary>
            {editar && (
              <div className="mt-4 flex flex-col gap-3">
                <ActionForm action={guardarBeneficio} hidden={{ ...hidden, id: b.id }} submit="Guardar beneficio"><Campos b={b} zonas={zonas} funciones={funciones} /></ActionForm>
                <ActionForm inline action={borrarBeneficio} hidden={{ ...hidden, id: b.id }} confirm={`¿Borrar "${b.nombre}"? Si solo quieres esconderlo, quita "Visible".`} submit="Borrar" submitClass={ghost} />
              </div>
            )}
          </details>
        </Card>
      ))}

      {editar && (
        <Card className="flex flex-col gap-3">
          <h2 className="titular text-xl">Nuevo beneficio</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-texto-2">Rápidos:</span>
            {PLANTILLAS_BENEFICIO.map((t) => (
              <ActionForm key={t.nombre} inline action={guardarBeneficio} hidden={{ ...hidden, tipo: t.tipo, nombre: t.nombre, minutos_antes: String(t.minutos_antes ?? "") }}
                submit={t.minutos_antes ? `${t.nombre} ${t.minutos_antes} min` : t.nombre} submitClass={ghost} />
            ))}
          </div>
          <ActionForm action={guardarBeneficio} hidden={hidden} submit="Crear beneficio"><Campos zonas={zonas} funciones={funciones} /></ActionForm>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="titular text-xl">Entregas por función</h2>
          <Link href={`/panel/producciones/${id}/boletos/beneficios/entregas${elegida ? `?funcion=${elegida.id}` : ""}`} className="rounded-full bg-texto px-4 py-2 text-sm font-bold text-sala">Ver lista de entregas</Link>
        </div>
        {funciones.length === 0 ? <p className="text-sm text-texto-3">Todavía no hay funciones.</p> : (
          <>
            <nav aria-label="Función" className="flex flex-wrap gap-2 text-sm">
              {funciones.map((f) => (
                <Link key={f.id} href={`?funcion=${f.id}`} aria-current={elegida?.id === f.id ? "page" : undefined}
                  className={`rounded-full px-3 py-1.5 font-semibold ${elegida?.id === f.id ? "bg-texto text-sala" : "border border-white/20 hover:border-white/50"}`}>{formatPerformanceDate(f.starts_at)}</Link>
              ))}
            </nav>
            {reporte.length === 0 ? <p className="text-sm text-texto-3">Esta función no tiene beneficios.</p> : (
              <ul className="flex flex-col divide-y divide-white/10 text-sm">
                {reporte.map((r) => (
                  <li key={r.beneficio_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex items-center gap-2"><Icono nombre={TIPOS_BENEFICIO[r.tipo].icono} />{r.nombre}</span>
                    <span><b className="num">{r.entregados}</b> entregados · <span className="num">{r.con_derecho}</span> boletos con derecho{r.cupo ? ` (cupo ${r.cupo})` : ""}
                      {r.pendientes > 0 && <> · <b className={r.vencidos ? "text-pulso" : "text-aviso"}>{r.vencidos ? `${r.vencidos} vencidos` : `${r.pendientes} por entregar`}</b></>}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-texto-3">Se marcan en Puerta al escanear el boleto o en la lista de entregas. &quot;Con derecho&quot; cuenta boletos pagados de las zonas del beneficio (hasta su cupo).</p>
          </>
        )}
      </Card>
    </>
  );
}
