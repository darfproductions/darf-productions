"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushSubscription, savePushPrefs, savePushSubscription, sendPushTest } from "@/lib/push-actions";

type Estado = "cargando" | "sin-soporte" | "ios-instalar" | "bloqueado" | "apagado" | "encendido";
type BeforeInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function llave(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const instalada = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function leerEstado(): Promise<{ estado: Estado; endpoint: string | null }> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { estado: esIOS() && !instalada() ? "ios-instalar" : "sin-soporte", endpoint: null };
  }
  if (Notification.permission === "denied") return { estado: "bloqueado", endpoint: null };
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return { estado: sub ? "encendido" : "apagado", endpoint: sub?.endpoint ?? null };
}

const boton = "rounded-full bg-texto px-5 py-2.5 text-sm font-bold text-sala disabled:opacity-60";
const fantasma = "rounded-full border border-white/25 px-4 py-2 text-sm font-bold hover:border-white/50 disabled:opacity-60";

// "Recibir notificaciones en este teléfono" + instalar la app + qué tipos llegan.
export function PushSettings({ publicKey, apagados, tipos, donde = "panel" }: { publicKey: string | null; apagados: string[]; tipos: { id: string; label: string }[]; donde?: "panel" | "cuenta" }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [instalar, setInstalar] = useState<BeforeInstall | null>(null);
  const [yaInstalada, setYaInstalada] = useState(true);
  const [ios, setIos] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let vivo = true;
    leerEstado().then((r) => {
      if (!vivo) return;
      setEstado(r.estado);
      setEndpoint(r.endpoint);
      setYaInstalada(instalada());
      setIos(esIOS());
    });
    const alInstalar = (e: Event) => {
      e.preventDefault();
      setInstalar(e as BeforeInstall);
    };
    window.addEventListener("beforeinstallprompt", alInstalar);
    return () => {
      vivo = false;
      window.removeEventListener("beforeinstallprompt", alInstalar);
    };
  }, []);

  const encender = () =>
    start(async () => {
      setMensaje(null);
      if (!publicKey) {
        setMensaje({ ok: false, texto: donde === "panel" ? "Las notificaciones todavía no están configuradas. Avísale al Director." : "Las notificaciones todavía no están disponibles. Intenta más tarde." });
        return;
      }
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "apagado");
        return;
      }
      try {
        const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llave(publicKey) }));
        const r = await savePushSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
        setMensaje({ ok: r.ok, texto: r.message });
        if (r.ok) {
          setEstado("encendido");
          setEndpoint(sub.endpoint);
        }
      } catch {
        setMensaje({ ok: false, texto: "Este navegador no dejó activar las notificaciones." });
      }
    });

  const apagar = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      const ep = sub?.endpoint ?? endpoint;
      await sub?.unsubscribe().catch(() => false);
      const r = ep ? await removePushSubscription(ep) : { ok: true, message: "Apagadas." };
      setMensaje({ ok: r.ok, texto: r.message });
      setEstado("apagado");
      setEndpoint(null);
    });

  const probar = () =>
    start(async () => {
      const r = await sendPushTest();
      setMensaje({ ok: r.ok, texto: r.message });
    });

  const guardarTipos = (form: FormData) =>
    start(async () => {
      const encendidos = new Set(form.getAll("tipo").map(String));
      const r = await savePushPrefs(tipos.map((t) => t.id).filter((id) => !encendidos.has(id)));
      setMensaje({ ok: r.ok, texto: r.message });
    });

  return (
    <div className="flex flex-col gap-4">
      {!yaInstalada && (instalar || ios) && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-sala p-4">
          <p className="font-bold">Instala DARF como app</p>
          {instalar ? (
            <button
              type="button"
              className={`${boton} self-start`}
              onClick={async () => {
                await instalar.prompt();
                await instalar.userChoice.catch(() => null);
                setInstalar(null);
              }}
            >
              Instalar app
            </button>
          ) : (
            <p className="text-sm text-texto-2">
              En iPhone: abre esta página en <b>Safari</b>, toca <b>Compartir</b> (el cuadro con la flecha) y luego <b>Agregar a inicio</b>.
              Apple solo manda notificaciones a la app instalada.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="font-bold">Notificaciones en este teléfono</p>
        {estado === "cargando" && <p className="text-sm text-texto-3">Revisando…</p>}
        {estado === "sin-soporte" && <p className="text-sm text-texto-2">Este navegador no recibe notificaciones. Prueba con Chrome, Edge, Firefox o Safari actualizado.</p>}
        {estado === "ios-instalar" && <p className="text-sm text-texto-2">En iPhone primero instala la app (Compartir → Agregar a inicio), ábrela desde su ícono y vuelve aquí.</p>}
        {estado === "bloqueado" && <p className="text-sm text-texto-2">Bloqueaste las notificaciones para esta página. Actívalas en los ajustes del navegador (el candado junto a la dirección) y vuelve a intentar.</p>}
        {estado === "apagado" && (
          <>
            <p className="text-sm text-texto-2">{donde === "panel" ? "Te llega al teléfono lo mismo que ves en tus notificaciones del panel: ventas, mensajes, avisos y notas del equipo, etc." : "Te llega al teléfono lo mismo que ves en tus notificaciones: tus boletos, respuestas a tus solicitudes, avisos de tu equipo y más."}</p>
            <button type="button" disabled={pending} onClick={encender} className={`${boton} self-start`}>{pending ? "Un momento…" : "Recibir notificaciones aquí"}</button>
          </>
        )}
        {estado === "encendido" && (
          <>
            <p className="text-sm text-[#86efac]">✓ Este teléfono recibe tus notificaciones.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending} onClick={probar} className={fantasma}>Probar</button>
              <button type="button" disabled={pending} onClick={apagar} className={fantasma}>Apagar en este teléfono</button>
            </div>
          </>
        )}
        {mensaje && <p className={`text-sm ${mensaje.ok ? "text-[#86efac]" : "text-[#ff8fa3]"}`}>{mensaje.texto}</p>}
      </div>

      {tipos.length > 0 && (
        <form action={guardarTipos} className="flex flex-col gap-2">
          <p className="font-bold">Qué me llega al teléfono</p>
          {tipos.map((t) => (
            <label key={t.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="tipo" value={t.id} defaultChecked={!apagados.includes(t.id)} className="mt-1" />
              <span>{t.label}</span>
            </label>
          ))}
          <button disabled={pending} className={`${fantasma} self-start`}>Guardar</button>
        </form>
      )}
    </div>
  );
}
