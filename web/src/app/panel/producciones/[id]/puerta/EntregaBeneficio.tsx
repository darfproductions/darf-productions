"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { QrScanner } from "@/components/panel/QrScanner";
import { Icono, type IconoNombre } from "@/components/Icono";
import { bip } from "@/lib/aviso-sonido";
import { MOMENTOS_ENTREGA, TIPOS_BENEFICIO, aplicaEnFuncion, horaAcceso, notaBeneficio, textoBeneficio, type Beneficio } from "@/lib/beneficios-rules";
import { avanceBeneficio, escanearBeneficio, type EscaneoBeneficio } from "./actions";

const hora = (iso: string) => new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));
const chico = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";
const VERDE = "bg-[#14532d]", AMBAR = "bg-[#7c2d12]", ROJO = "bg-[#5a1a22]";

/** Cómo se entrega según el tipo (0154). */
export const modoDe = (tipo: Beneficio["tipo"]) => (tipo === "souvenir" ? "fisico" : tipo === "acceso" ? "acceso" : "experiencia");
const COMO: Record<ReturnType<typeof modoDe>, string> = {
  acceso: "Escanea cada boleto: te dice si puede entrar antes. Su entrada queda registrada.",
  experiencia: "Escanea cada boleto al pasar: queda registrado y, si lo intentan usar otra vez, se rechaza.",
  fisico: "Escanea antes de entregar: te dice cuántos le tocan a su compra, cuántos ya se le dieron y cuántos faltan.",
};

// Entregar un beneficio con el escáner (0154): se elige el beneficio, "Iniciar entrega" y se escanean boletos.
export function EntregaBeneficio({ funcion, inicio, beneficios }: { funcion: string; inicio: string | null; beneficios: Beneficio[] }) {
  const lista = beneficios.filter((b) => b.activo && aplicaEnFuncion(b, funcion));
  const [elegido, setElegido] = useState(lista[0]?.id ?? "");
  const [iniciado, setIniciado] = useState(false);
  const [res, setRes] = useState<(EscaneoBeneficio & { token: string }) | null>(null);
  const [avance, setAvance] = useState<{ con_derecho: number; entregados: number } | null>(null);
  const [pending, start] = useTransition();
  const b = lista.find((x) => x.id === elegido) ?? null;
  const modo = b ? modoDe(b.tipo) : null;

  const actualizar = useCallback(async () => {
    if (iniciado && elegido) setAvance(await avanceBeneficio(funcion, elegido).catch(() => null));
  }, [iniciado, elegido, funcion]);
  useEffect(() => {
    if (!iniciado || !elegido) return;
    let vivo = true;
    avanceBeneficio(funcion, elegido).then((a) => { if (vivo) setAvance(a); }).catch(() => {});
    return () => { vivo = false; };
  }, [iniciado, elegido, funcion]);

  const leer = (token: string, entregar = 0) => start(async () => {
    if (!b) return;
    const r = await escanearBeneficio(funcion, b.id, token, entregar).catch((): EscaneoBeneficio => ({ resultado: "error", message: "Sin conexión. Intenta de nuevo." }));
    setRes({ ...r, token });
    bip(r.resultado === "ok" || r.resultado === "debe" || (r.resultado === "completo" && (r.entregados_ahora ?? 0) > 0));
    await actualizar();
  });

  if (!lista.length) return <p className="rounded-2xl bg-telon p-4 text-sm text-texto-2">Esta función no tiene beneficios activos. Se configuran en Boletos, Beneficios.</p>;

  if (!iniciado || !b || !modo) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl bg-telon p-4">
        <label className="flex flex-col gap-1 text-sm font-semibold">Beneficio que vas a entregar
          <select value={elegido} onChange={(e) => setElegido(e.target.value)} className="rounded-lg border border-white/10 bg-sala px-3 py-3 text-base font-bold text-texto">
            {lista.map((x) => <option key={x.id} value={x.id}>{textoBeneficio(x)}{x.por_compra ? " · uno por compra" : ""}</option>)}
          </select>
        </label>
        {b && modo && (
          <p className="flex items-start gap-2 text-sm text-texto-2">
            <Icono nombre={TIPOS_BENEFICIO[b.tipo]?.icono ?? "destello"} />
            <span>{COMO[modo]}{b.por_compra ? " Es uno por compra: sirve cualquier boleto de la orden, una sola vez." : ""}</span>
          </p>
        )}
        <button type="button" disabled={!b} onClick={() => { setIniciado(true); setRes(null); }} className="self-start rounded-full bg-[#d7bb5f] px-5 py-3 text-sm font-black text-[#0b0910] disabled:opacity-60">
          Iniciar entrega
        </button>
      </div>
    );
  }

  const faltan = res && res.total != null ? res.total - (res.entregados ?? 0) : 0;
  const tarjeta = res ? vista(res, b) : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d7bb5f]/60 bg-telon px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#d7bb5f]">Entregando</p>
          <p className="text-lg font-black">{textoBeneficio(b)}{b.por_compra ? <span className="ml-2 text-xs font-bold text-[#d7bb5f]">uno por compra</span> : null}</p>
          {modo === "acceso" && horaAcceso(inicio, b.minutos_antes) && <p className="text-sm text-texto-2">Pueden entrar desde las {horaAcceso(inicio, b.minutos_antes)}</p>}
          {avance && <p className="text-sm text-texto-2"><b className="text-texto">{avance.entregados}</b> de {avance.con_derecho} {modo === "fisico" ? "entregados" : "ya pasaron"}</p>}
        </div>
        <button type="button" onClick={() => { setIniciado(false); setRes(null); setAvance(null); }} className={chico}>Terminar entrega</button>
      </div>

      {res && tarjeta && (
        <div role="status" className={`flex flex-col gap-2 rounded-2xl p-6 text-white ${tarjeta.bg}`}>
          <p className="flex items-center gap-3 text-3xl font-black"><Icono nombre={tarjeta.icono} />{tarjeta.titulo}</p>
          {res.lugar && <p className="text-xl font-bold">{res.lugar}</p>}
          {res.nombre && <p className="text-lg">{res.nombre}</p>}
          {tarjeta.detalle.map((d, i) => <p key={i} className="text-base">{d}</p>)}
          {modo === "fisico" && res.resultado === "debe" && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={() => leer(res.token, 1)} className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#0b0910] disabled:opacity-60">Entregar 1</button>
              {faltan > 1 && <button type="button" disabled={pending} onClick={() => leer(res.token, faltan)} className="rounded-full border-2 border-white px-5 py-3 text-sm font-black disabled:opacity-60">Entregar los {faltan}</button>}
            </div>
          )}
        </div>
      )}

      <QrScanner busy={pending} placeholder="Código del boleto" onCode={(t) => leer(t)} />
      <p className="text-xs text-texto-3">{COMO[modo]}{notaBeneficio(b) ? ` ${notaBeneficio(b)}.` : ""}</p>
    </div>
  );
}

/** Lo que dice la tarjeta grande después de escanear. */
function vista(r: EscaneoBeneficio, b: Beneficio): { bg: string; titulo: string; icono: IconoNombre; detalle: string[] } {
  const nombre = textoBeneficio(b);
  const aviso = r.estado === "vencido" ? "Ojo: el plazo de entrega ya venció; se registra igual."
    : r.estado === "pendiente" ? `Ojo: se entrega ${MOMENTOS_ENTREGA[b.entrega].corto}; se registra igual.` : null;
  switch (r.resultado) {
    case "ok":
      if (r.modo === "acceso") {
        return { bg: VERDE, titulo: "Puede entrar antes", icono: "check",
          detalle: [r.entrada === "ya_usado" ? "Su boleto ya tenía la entrada registrada." : "Su entrada quedó registrada."] };
      }
      return { bg: VERDE, titulo: "Puede pasar", icono: "check", detalle: [`${nombre}: registrado.`, ...(r.por_compra ? ["Uno por compra: ya no sirve otro boleto de esta orden."] : []), ...(aviso ? [aviso] : [])] };
    case "ya":
      return { bg: AMBAR, titulo: r.modo === "acceso" ? "Ya entró antes" : "Ya lo usó", icono: "alerta",
        detalle: [
          `${r.entregado_at ? `Se registró a las ${hora(r.entregado_at)}` : "Ya estaba registrado"}${r.con_boleto ? ` con el boleto ${r.con_boleto} de su orden` : ""}.`,
          ...(r.por_compra ? ["Es uno por compra: una sola vez por orden."] : []),
        ] };
    case "debe": {
      const faltan = (r.total ?? 0) - (r.entregados ?? 0);
      return { bg: AMBAR, titulo: `Se le ${faltan === 1 ? "debe" : "deben"} ${faltan}`, icono: "estrella",
        detalle: [`Le ${r.total === 1 ? "toca" : "tocan"} ${r.total} ${r.por_compra ? "(uno por compra)" : `(uno por boleto de su compra)`} · ya se le ${r.entregados === 1 ? "dio" : "dieron"} ${r.entregados}.`, ...(aviso ? [aviso] : [])] };
    }
    case "completo":
      return (r.entregados_ahora ?? 0) > 0
        ? { bg: VERDE, titulo: `Entregado${(r.entregados_ahora ?? 0) > 1 ? `: ${r.entregados_ahora}` : ""}`, icono: "check", detalle: [`Ya tiene todo: ${r.entregados} de ${r.total}.`] }
        : { bg: AMBAR, titulo: "Ya se le entregó todo", icono: "alerta", detalle: [`${r.entregados} de ${r.total}${r.entregado_at ? `, el último a las ${hora(r.entregado_at)}` : ""}. No le des otro.`] };
    case "no_incluye":
      return { bg: ROJO, titulo: "No incluye este beneficio", icono: "x", detalle: [`Su boleto${r.zona ? ` (${r.zona})` : ""} no incluye ${nombre.toLowerCase()}.`] };
    case "sin_cupo":
      return { bg: ROJO, titulo: "No alcanzó", icono: "x", detalle: [`El cupo es de ${r.cupo ?? "pocos"} y su compra quedó fuera.`] };
    case "por_pagar":
      return { bg: ROJO, titulo: "Compra sin aprobar", icono: "alerta", detalle: ["Mándalo a taquilla."] };
    case "cancelado":
      return { bg: ROJO, titulo: "Boleto cancelado", icono: "x", detalle: [] };
    case "otra_funcion":
      return { bg: ROJO, titulo: "Boleto de otra función", icono: "x", detalle: ["No se registró nada."] };
    case "otra_obra":
      return { bg: ROJO, titulo: "Boleto de otra obra", icono: "x", detalle: [] };
    case "no_encontrado":
      return { bg: ROJO, titulo: "QR no válido", icono: "x", detalle: ["Pide que abra su boleto en Mi cuenta o en Wallet."] };
    default:
      return { bg: ROJO, titulo: "No se pudo", icono: "alerta", detalle: [r.message ?? "Intenta de nuevo."] };
  }
}
