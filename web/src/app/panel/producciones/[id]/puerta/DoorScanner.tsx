"use client";

/* eslint-disable @next/next/no-img-element -- foto firmada de la persona */
import { useCallback, useEffect, useState, useTransition } from "react";
import { QrScanner } from "@/components/panel/QrScanner";
import { bip } from "@/lib/aviso-sonido";
import { mayus } from "@/lib/dates";
import { buscarPuerta, checkIn, conteoPuerta, deshacerEntrada, visitaPuerta, type BoletoPuerta, type CheckIn, type Conteo, type Visita } from "./actions";
import { esPaseClub, etiquetaBoleto } from "./door-rules";
import { Icono, type IconoNombre } from "@/components/Icono";

const VISTA: Record<string, { bg: string; title: string; icono: IconoNombre }> = {
  ok: { bg: "bg-[#14532d]", title: "Puede pasar", icono: "check" },
  ya_usado: { bg: "bg-[#7c2d12]", title: "Ya se usó", icono: "alerta" },
  cancelado: { bg: "bg-[#5a1a22]", title: "Boleto cancelado", icono: "x" },
  no_aprobado: { bg: "bg-[#7c2d12]", title: "Compra sin aprobar", icono: "alerta" },
  otra_funcion: { bg: "bg-[#5a1a22]", title: "Boleto de otra función", icono: "x" },
  no_encontrado: { bg: "bg-[#5a1a22]", title: "QR no válido", icono: "x" },
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
export function DoorScanner({ pid, funciones, inicial }: { pid: string; funciones: { id: string; starts_at: string }[]; inicial: string | null }) {
  const [funcion, setFuncion] = useState(inicial ?? funciones[0]?.id ?? "");
  const [res, setRes] = useState<CheckIn | Visita | null>(null);
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [q, setQ] = useState("");
  const [hallados, setHallados] = useState<BoletoPuerta[] | null>(null);
  const [aviso, setAviso] = useState("");
  const [pending, start] = useTransition();
  const v = res ? VISTA[res.result] : null;

  const actualizar = useCallback(async () => {
    if (funcion) setConteo(await conteoPuerta(funcion));
  }, [funcion]);

  // El contador se actualiza solo cada 15 s (varias puertas a la vez) y después de cada lectura.
  useEffect(() => {
    let vivo = true;
    const tick = async () => { const c = funcion ? await conteoPuerta(funcion) : null; if (vivo) setConteo(c); };
    tick();
    const t = setInterval(tick, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, [funcion]);

  // El mismo escáner lee boletos y pases del Club Fan: una persona revisa boletos y otra, pases.
  const leer = (token: string) => start(async () => {
    const r = esPaseClub(token) ? await visitaPuerta(token, funcion) : await checkIn(token, funcion);
    setRes(r);
    bip(r.result === "ok" || r.result === "visita_ok");
    await actualizar();
  });

  const buscar = () => start(async () => {
    setAviso("");
    const r = await buscarPuerta(funcion, q);
    if (r.ok) setHallados(r.boletos); else setAviso(r.message);
  });

  const marcar = (b: BoletoPuerta) => start(async () => {
    const r = await checkIn(b.qr_token, funcion);
    setRes(r);
    bip(r.result === "ok");
    await actualizar();
    const n = await buscarPuerta(funcion, q);
    if (n.ok) setHallados(n.boletos);
  });

  const deshacer = (b: BoletoPuerta) => start(async () => {
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
      {conteo && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-telon px-4 py-3">
          <p className="text-lg"><b className="text-2xl">{conteo.entraron}</b> de {conteo.vendidos} ya entraron</p>
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
          {res.result === "error" && <p>{res.message}</p>}
        </div>
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
