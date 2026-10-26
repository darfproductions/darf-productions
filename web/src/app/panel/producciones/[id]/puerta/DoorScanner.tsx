"use client";

/* eslint-disable @next/next/no-img-element -- foto firmada de la persona */
import { useCallback, useEffect, useState, useTransition } from "react";
import { QrScanner } from "@/components/panel/QrScanner";
import { bip } from "@/lib/aviso-sonido";
import { mayus } from "@/lib/dates";
import { beneficiosPuerta, buscarPuerta, conteoPuerta, deshacerEntrada, entregarBeneficio, visitaPuerta, type BoletoPuerta, type CheckIn, type Conteo, type Visita } from "./actions";
import { ESTADOS_ENTREGA, MOMENTOS_ENTREGA, TIPOS_BENEFICIO, horaAcceso, minutosAcceso, notaBeneficio, textoBeneficio, type BeneficioBoleto } from "@/lib/beneficios-rules";
import { esPaseClub, etiquetaBoleto } from "./door-rules";
import type { ResultadoLocal } from "./sin-conexion-rules";
import { usePuertaSinConexion } from "./usePuertaSinConexion";
import { Icono, type IconoNombre } from "@/components/Icono";

const VISTA: Record<string, { bg: string; title: string; icono: IconoNombre }> = {
  ok: { bg: "bg-[#14532d]", title: "Puede pasar", icono: "check" },
  ya_usado: { bg: "bg-[#7c2d12]", title: "Ya se usó", icono: "alerta" },
  cancelado: { bg: "bg-[#5a1a22]", title: "Boleto cancelado", icono: "x" },
  no_aprobado: { bg: "bg-[#7c2d12]", title: "Compra sin aprobar", icono: "alerta" },
  otra_funcion: { bg: "bg-[#5a1a22]", title: "Boleto de otra función", icono: "x" },
  no_encontrado: { bg: "bg-[#5a1a22]", title: "QR no válido", icono: "x" },
  // Sin internet: el boleto no está en la lista guardada de esta función.
  no_en_lista: { bg: "bg-[#5a1a22]", title: "No está en la lista", icono: "x" },
  error: { bg: "bg-[#5a1a22]", title: "No se pudo validar", icono: "alerta" },
  // 0110: pases del Club Fan (suman la visita de esa cuenta en esta función).
  visita_ok: { bg: "bg-[#14532d]", title: "Visita sumada", icono: "check" },
  visita_ya: { bg: "bg-[#3f3a12]", title: "Su visita ya contaba", icono: "check" },
  visita_sin_boleto: { bg: "bg-[#7c2d12]", title: "Primero escanea su boleto", icono: "alerta" },
  visita_no_encontrado: { bg: "bg-[#5a1a22]", title: "Pase no válido", icono: "x" },
};

const fecha = (iso: string) =>
  mayus(new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso)));

const hora = (iso: string) => new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(iso));
const chico = "rounded-full border border-white/25 px-3 py-1.5 text-xs font-bold hover:border-white/50 disabled:opacity-60";

// Puerta: valida boletos de la función elegida con el lector de QR del panel. Bloque 4A: contador en
// vivo, sonido y vibración, buscar por nombre/código si el QR no abre, deshacer y lista descargable.
// 2026-10-25: sin internet valida contra la lista guardada en el celular y sube las entradas al volver la señal.
type Mostrado = CheckIn | Visita | { result: "no_en_lista" };
const comoCheckIn = (r: ResultadoLocal): Mostrado =>
  r.result === "ok" ? { result: "ok", seat_label: r.lugar, buyer_nombre: r.nombre }
    : r.result === "ya_usado" ? { result: "ya_usado", seat_label: r.lugar, buyer_nombre: r.nombre, checked_in_at: r.entro }
      : { result: "no_en_lista" };
const sinAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function DoorScanner({ pid, funciones, inicial }: { pid: string; funciones: { id: string; starts_at: string }[]; inicial: string | null }) {
  const [funcion, setFuncion] = useState(inicial ?? funciones[0]?.id ?? "");
  const [res, setRes] = useState<Mostrado | null>(null);
  const [sinRed, setSinRed] = useState(false);
  const sc = usePuertaSinConexion(funcion);
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [q, setQ] = useState("");
  const [hallados, setHallados] = useState<BoletoPuerta[] | null>(null);
  const [aviso, setAviso] = useState("");
  const [pending, start] = useTransition();
  // 0122: beneficios del último boleto leído (token para marcar entregas).
  const [benef, setBenef] = useState<{ token: string; lista: BeneficioBoleto[] } | null>(null);
  const [nota, setNota] = useState("");
  const cargarBenef = async (token: string, r: Mostrado) => {
    if (r.result === "ok" || r.result === "ya_usado") {
      const lista = await beneficiosPuerta(token);
      setBenef(lista.length ? { token, lista } : null);
    } else setBenef(null);
  };
  const entregar = (b: BeneficioBoleto, si: boolean) => start(async () => {
    if (!benef) return;
    const r = await entregarBeneficio(benef.token, b.beneficio_id, si, si ? nota : undefined);
    if (r.ok) { setBenef({ token: benef.token, lista: r.beneficios }); if (si) setNota(""); } else setAviso(r.message);
  });
  const inicio = funciones.find((f) => f.id === funcion)?.starts_at ?? null;
  const v = res ? VISTA[res.result] : null;

  const actualizar = useCallback(async () => {
    if (funcion) setConteo(await conteoPuerta(funcion).catch(() => null));
  }, [funcion]);

  // El contador se actualiza solo cada 15 s (varias puertas a la vez) y después de cada lectura; con la pestaña oculta
  // no pregunta. Sin internet se cuenta con la lista guardada.
  useEffect(() => {
    let vivo = true;
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      const c = funcion ? await conteoPuerta(funcion).catch(() => null) : null;
      if (vivo) setConteo(c);
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, [funcion]);
  const conteoVisto = sc.enLinea && conteo ? conteo : sc.conteo ?? conteo;

  // Un boleto (escaneado o de la búsqueda): en línea si se puede; si no, con la lista guardada.
  const validarBoleto = async (token: string) => {
    const v = await sc.validar(token);
    if (!v) {
      setSinRed(true);
      setRes({ result: "error", message: "Sin conexión y este celular no tiene la lista de la función. Abre Puerta con internet antes de que empiece la entrada." });
      setBenef(null);
      bip(false);
      return;
    }
    const r = v.local ? comoCheckIn(v.r) : v.r;
    setSinRed(v.local);
    setRes(r);
    if (v.local) setBenef(null); else await cargarBenef(token, r);
    bip(r.result === "ok");
    if (!v.local) await actualizar();
  };

  // El mismo escáner lee boletos y pases del Club Fan: una persona revisa boletos y otra, pases.
  const leer = (token: string) => start(async () => {
    if (!esPaseClub(token)) return validarBoleto(token);
    setBenef(null);
    setSinRed(false);
    const r = await visitaPuerta(token, funcion).catch(() => null);
    const final: Mostrado = r ?? { result: "error", message: "Sin conexión: los pases del Club Fan se escanean cuando vuelva la señal. El boleto sí se valida." };
    setRes(final);
    bip(final.result === "visita_ok");
    await actualizar();
  });

  // Sin internet se busca en la lista guardada (nombre o lugar).
  const buscarLocal = (): BoletoPuerta[] | null => {
    if (!sc.lista) return null;
    const t = sinAcentos(q.trim());
    if (t.length < 2) return [];
    return sc.lista.boletos.filter((b) => sinAcentos(b.nombre).includes(t) || sinAcentos(b.lugar) === t).slice(0, 30)
      .map((b) => ({ ticket_id: b.t, qr_token: b.t, order_code: "", buyer_nombre: b.nombre, buyer_telefono: "", lugar: b.lugar, checked_in_at: b.entro }));
  };
  const buscar = () => start(async () => {
    setAviso("");
    const r = sc.enLinea ? await buscarPuerta(funcion, q).catch(() => null) : null;
    if (r?.ok) { setHallados(r.boletos); return; }
    const local = buscarLocal();
    if (local) { setHallados(local); setAviso("Sin conexión: resultados de la lista guardada (nombre o asiento)."); }
    else setAviso(r && !r.ok ? r.message : "Sin conexión y sin lista guardada.");
  });

  const marcar = (b: BoletoPuerta) => start(async () => {
    await validarBoleto(b.qr_token);
    const n = sc.enLinea ? await buscarPuerta(funcion, q).catch(() => null) : null;
    setHallados(n?.ok ? n.boletos : buscarLocal());
  });

  const deshacer = (b: BoletoPuerta) => start(async () => {
    if (!sc.enLinea) { setAviso("Sin conexión: deshacer una entrada se puede cuando vuelva la señal."); return; }
    if (!window.confirm(`¿Deshacer la entrada de ${b.buyer_nombre} (${b.lugar})? El boleto vuelve a servir.`)) return;
    const r = await deshacerEntrada(b.ticket_id);
    setAviso(r.message);
    await actualizar();
    const n = await buscarPuerta(funcion, q);
    if (n.ok) setHallados(n.boletos);
  });

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Función que está entrando
        <select value={funcion} onChange={(e) => { setFuncion(e.target.value); setRes(null); setHallados(null); }} className="rounded-lg border border-white/10 bg-sala px-3 py-3 text-base font-bold text-texto">
          {funciones.map((f) => <option key={f.id} value={f.id}>{fecha(f.starts_at)}</option>)}
        </select>
      </label>
      <div role="status" className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-sm ${sc.enLinea ? "bg-telon" : "bg-[#7c2d12] text-white"}`}>
        <span className="flex items-center gap-2 font-bold">
          <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${sc.enLinea ? "bg-[#22c55e]" : "bg-[#fbbf24]"}`} />
          {sc.enLinea ? "En línea" : "Sin conexión · validando con la lista guardada"}
          {sc.pendientes > 0 && <span>· {sc.pendientes} por subir</span>}
        </span>
        <span className="text-xs opacity-90">
          {sc.lista ? `Lista de ${sc.lista.boletos.length} boletos, ${hora(sc.lista.descargada)}` : "Aún no hay lista guardada en este celular"}
          {sc.pendientes > 0 && sc.enLinea && <button type="button" onClick={() => void sc.subir()} disabled={sc.subiendo} className={`${chico} ml-2`}>{sc.subiendo ? "Subiendo…" : "Subir ahora"}</button>}
        </span>
      </div>
      {sc.resumen && (
        <div role="status" className="flex flex-col gap-1 rounded-2xl border border-white/15 bg-telon px-4 py-3 text-sm">
          <p className="font-bold">Entradas sin internet subidas: {sc.resumen.subidas}</p>
          {sc.resumen.dobles.length > 0 && <p className="font-bold text-[#ff8fa3]">Doble entrada (otro celular ya lo había dejado pasar): {sc.resumen.dobles.map((d) => `${d.nombre} ${d.lugar}`.trim()).join(", ")}</p>}
          {sc.resumen.rechazadas.length > 0 && <p className="font-bold text-[#ff8fa3]">La base no las aceptó (cancelado o sin aprobar): {sc.resumen.rechazadas.map((d) => `${d.nombre} ${d.lugar}`.trim()).join(", ")}</p>}
          <button type="button" onClick={sc.cerrarResumen} className={`${chico} self-start`}>Entendido</button>
        </div>
      )}
      {conteoVisto && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-telon px-4 py-3">
          <p className="text-lg"><b className="text-2xl">{conteoVisto.entraron}</b> de {conteoVisto.vendidos} ya entraron{!sc.enLinea && <span className="text-sm text-texto-3"> (en este celular)</span>}</p>
          <a href={`/panel/producciones/${pid}/puerta/lista/${funcion}`} className={chico}>Descargar lista (plan B)</a>
        </div>
      )}
      {res && v && (
        <div role="status" className={`rounded-2xl p-6 text-white ${v.bg}`}>
          <p className="flex items-center gap-3 text-3xl font-black"><Icono nombre={v.icono} />{v.title}</p>
          {res.result.startsWith("visita_") && "nombre" in res && res.nombre && (
            <div className="mt-3 flex items-center gap-4">
              {res.fotoUrl ? <img src={res.fotoUrl} alt="" className="h-20 w-20 rounded-full object-cover" /> : null}
              <div>
                <p className="text-2xl font-bold">{res.nombre}</p>
                {res.result === "visita_ok" && <p className="text-lg">{res.visitas === 1 ? "1 visita" : `${res.visitas} visitas`}{res.socio ? " · Socio del Club Fan" : ""}</p>}
                {res.result === "visita_ya" && res.hora && <p className="text-lg">Se registró a las {hora(res.hora)}</p>}
              </div>
            </div>
          )}
          {res.result === "visita_sin_boleto" && <p className="mt-1 text-lg">Todos los boletos que ya entraron tienen su visita. Escanea su boleto primero.</p>}
          {res.result === "visita_no_encontrado" && <p className="mt-1 text-sm">Pide que abra su pase en Mi cuenta o en Wallet.</p>}
          {"seat_label" in res && res.seat_label && <p className="mt-1 text-xl font-bold">{etiquetaBoleto(res.seat_label, res.category)}</p>}
          {"buyer_nombre" in res && res.buyer_nombre && <p className="text-lg">{res.buyer_nombre}</p>}
          {"performance_starts_at" in res && res.performance_starts_at && (
            <p className={`mt-2 ${res.result === "otra_funcion" ? "text-lg font-bold" : "text-sm opacity-90"}`}>
              {res.result === "otra_funcion" ? "Es para: " : ""}{res.production ? `${res.production} · ` : ""}<span>{fecha(res.performance_starts_at)}</span>
            </p>
          )}
          {res.result === "ya_usado" && "checked_in_at" in res && res.checked_in_at && <p className="mt-1 text-lg font-bold">Entró a las {hora(String(res.checked_in_at))}</p>}
          {res.result === "otra_funcion" && <p className="mt-1 text-sm">No se marcó como usado. Mándalo a taquilla.</p>}
          {res.result === "no_en_lista" && <p className="mt-1 text-sm">Puede ser de otra función, estar cancelado o ser una compra muy reciente. Búscalo por nombre o mándalo a taquilla.</p>}
          {sinRed && res.result === "ok" && <p className="mt-2 text-sm font-bold">Validado sin internet: se sube solo al volver la señal.</p>}
          {res.result === "error" && <p>{res.message}</p>}
        </div>
      )}
      {/* 0122: beneficios de su zona; se marca lo que ya se entregó. */}
      {benef && res && (res.result === "ok" || res.result === "ya_usado") && (
        <section aria-label="Beneficios del boleto" className="flex flex-col gap-2 rounded-2xl border border-[#d7bb5f]/50 bg-telon p-4">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#d7bb5f]">Incluye · {benef.lista[0]?.zona}</p>
          {minutosAcceso(benef.lista) && <p className="text-sm font-bold">Acceso anticipado: puede entrar desde las {horaAcceso(inicio, minutosAcceso(benef.lista))}</p>}
          <ul className="flex flex-col divide-y divide-white/10">
            {benef.lista.map((b) => (
              <li key={b.beneficio_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Icono nombre={TIPOS_BENEFICIO[b.tipo]?.icono ?? "destello"} />
                  <span>
                    <b>{textoBeneficio(b)}</b>
                    {notaBeneficio(b) && <span className="block text-xs font-bold text-[#d7bb5f]">{notaBeneficio(b)}</span>}
                    {b.estado === "otro_boleto"
                      ? <span className="block text-xs font-bold text-texto-2">Ya va con el boleto {b.con_boleto ?? "principal"} de esta orden: no se entrega aquí</span>
                      : b.alcanza === false && <span className="block text-xs font-bold text-[#ff8fa3]">No alcanzó: el cupo es de {b.cupo}</span>}
                    {b.entregado_at && <span className="block text-xs text-exito">Entregado a las {hora(b.entregado_at)}{b.nota ? ` · "${b.nota}"` : ""}</span>}
                    {!b.entregado_at && b.entrega && b.tipo !== "acceso" && b.alcanza !== false && (
                      <span className={`block text-xs ${b.estado === "vencido" ? "font-bold text-[#ff8fa3]" : "text-texto-3"}`}>
                        Se entrega {MOMENTOS_ENTREGA[b.entrega].corto}{b.estado === "vencido" || b.estado === "por_pagar" ? ` · ${ESTADOS_ENTREGA[b.estado].label}` : ""}
                      </span>
                    )}
                  </span>
                </span>
                {b.tipo !== "acceso" && b.alcanza !== false && (b.entregado_at
                  ? <button type="button" disabled={pending} onClick={() => entregar(b, false)} className={chico}>Deshacer</button>
                  : <button type="button" disabled={pending} onClick={() => entregar(b, true)} className="rounded-full bg-[#d7bb5f] px-3 py-1.5 text-xs font-bold text-[#0b0910] disabled:opacity-60">Marcar entregado</button>)}
              </li>
            ))}
          </ul>
          {benef.lista.some((b) => b.tipo !== "acceso" && b.alcanza !== false && !b.entregado_at) && (
            <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} aria-label="Nota de la entrega (opcional)"
              placeholder="Nota de la entrega (opcional): lo recogió su hermana…" className="rounded-lg bg-sala px-3 py-2 text-sm" />
          )}
          <a href={`/panel/producciones/${pid}/boletos/beneficios/entregas?funcion=${funcion}`} className="text-xs font-bold text-[#d7bb5f] underline">Ver todas las entregas de la función</a>
        </section>
      )}
      <QrScanner busy={pending} placeholder="Código del boleto o del pase (DRF-XXXX)" onCode={leer} />
      <p className="text-xs text-texto-3">Lee boletos y pases del Club Fan. El pase (de Mi cuenta o Wallet) suma la visita de esa persona en esta función, también a quien compró: puede haber una persona revisando boletos y otra escaneando pases.</p>
      <section aria-label="Buscar en la lista" className="flex flex-col gap-2 rounded-2xl bg-telon p-4">
        <p className="text-sm font-semibold">¿No abre el QR? Búscalo por nombre, teléfono, código de orden o asiento.</p>
        <form onSubmit={(e) => { e.preventDefault(); buscar(); }} className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Nombre, teléfono, código o asiento" placeholder="Ej. Ana López, 4421, 83F2, A12" className="min-w-0 flex-1 rounded-lg bg-sala px-3 py-2.5" />
          <button disabled={pending} className={chico}>Buscar</button>
        </form>
        {aviso && <p role="status" className="text-sm font-semibold">{aviso}</p>}
        {hallados && (
          <ul className="flex flex-col divide-y divide-white/10">
            {hallados.map((b) => (
              <li key={b.ticket_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <b>{b.buyer_nombre}</b> · {b.lugar}
                  <span className="block text-xs text-texto-3">{b.order_code}{b.checked_in_at ? ` · entró a las ${hora(b.checked_in_at)}` : ""}</span>
                </span>
                {b.checked_in_at
                  ? <button type="button" disabled={pending} onClick={() => deshacer(b)} className={chico}>Deshacer entrada</button>
                  : <button type="button" disabled={pending} onClick={() => marcar(b)} className="rounded-full bg-[#22c55e] px-3 py-1.5 text-xs font-bold text-[#052e16] disabled:opacity-60">Marcar entrada</button>}
              </li>
            ))}
            {hallados.length === 0 && <li className="py-2 text-sm text-texto-3">No hay boletos con esa búsqueda en esta función.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
