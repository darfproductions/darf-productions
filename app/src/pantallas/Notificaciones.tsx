import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { cuando } from "@/lib/panel-home-rules";
import { Icono } from "~/componentes/Icono";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { abrirWeb, useCarga } from "~/lib/usar";

// Mis notificaciones dentro de la app: las mismas que en la web (tabla notifications, 0066; cada quien ve solo las
// suyas por RLS). Tocar una la marca leída y lleva a su pantalla en la app cuando existe; si no, a la web.

type Notificacion = { id: number; tipo: string; titulo: string; detalle: string | null; href: string | null; created_at: string; read_at: string | null };

/** Ruta de la app equivalente a la liga de la notificación (null = todavía solo en la web). */
export function rutaEnApp(href: string | null): string | null {
  if (!href) return null;
  const obra = /^\/producciones\/([^/?#]+)/.exec(href);
  if (obra) return `/obras/${obra[1]}`;
  if (href.startsWith("/cuenta/boletos") || href === "/cuenta#boletos") return "/boletos";
  if (href === "/cuenta" || href.startsWith("/cuenta?")) return "/cuenta";
  const audicion = /^\/audiciones(\/[0-9a-f-]{36})?/.exec(href);
  if (audicion) return `/audiciones${audicion[1] ?? ""}`;
  const artista = /^\/artistas\/([^/?#]+)/.exec(href);
  if (artista) return `/artista/${artista[1]}`;
  for (const r of ["/contacto", "/nosotros", "/cuenta/credencial", "/cuenta/honorarios", "/cuenta/perfil-profesional", "/cuenta/ventas", "/cuenta/transacciones", "/cuenta/eventos"]) {
    if (href === r || href.startsWith(`${r}?`) || href.startsWith(`${r}#`)) return r;
  }
  return null;
}

export function Notificaciones() {
  const { sesion, cargando: cargandoSesion } = useSesion();
  const navegar = useNavigate();
  const [soloNuevas, setSoloNuevas] = useState(false);
  const [version, setVersion] = useState(0);
  const { datos, error, cargando } = useCarga(async () => {
    let q = supabase.from("notifications").select("id, tipo, titulo, detalle, href, created_at, read_at").order("created_at", { ascending: false }).limit(100);
    if (soloNuevas) q = q.is("read_at", null);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Notificacion[];
  }, [soloNuevas, version, sesion?.user.id]);

  if (!cargandoSesion && !sesion) return <Navigate to="/acceso" replace />;

  const recargar = () => setVersion((v) => v + 1);
  const abrirNoti = async (n: Notificacion) => {
    if (!n.read_at) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    const ruta = rutaEnApp(n.href);
    if (ruta) return navegar(ruta);
    if (n.href) return abrirWeb(n.href).then(recargar);
    recargar();
  };
  const todasLeidas = async () => { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); recargar(); };
  const borrarLeidas = async () => {
    if (!window.confirm("¿Borrar todas las notificaciones leídas?")) return;
    await supabase.from("notifications").delete().not("read_at", "is", null);
    recargar();
  };

  return (
    <main className="pantalla sin-barra">
      <div className="contenido" style={{ gap: 14 }}>
        <Link to="/cuenta" className="circulo" aria-label="Volver"><Icono nombre="atras" /></Link>
        <h1 className="titulo-grande">Notificaciones</h1>
        <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>Lo nuevo que tiene que ver contigo: tus boletos, respuestas a tus solicitudes, avisos de tu equipo y más.</p>

        <div role="tablist" aria-label="Filtro" className="segmentos">
          <button role="tab" aria-selected={!soloNuevas} onClick={() => setSoloNuevas(false)}>Todas</button>
          <button role="tab" aria-selected={soloNuevas} onClick={() => setSoloNuevas(true)}>No leídas</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="boton contorno" style={{ flex: 1, minHeight: 40, fontSize: 11 }} onClick={todasLeidas}>Marcar todas leídas</button>
          <button className="boton contorno" style={{ flex: 1, minHeight: 40, fontSize: 11 }} onClick={borrarLeidas}>Borrar leídas</button>
        </div>

        {cargando && <div className="esqueleto" style={{ height: 240 }} />}
        {error && <p className="aviso error">No pudimos cargar tus notificaciones. Revisa tu conexión.</p>}
        {!cargando && datos && datos.length === 0 && <p className="suave" style={{ fontSize: 14 }}>{soloNuevas ? "No tienes notificaciones sin leer." : "Aún no tienes notificaciones."}</p>}

        {!cargando && datos && datos.length > 0 && (
          <ul className="tarjeta lista" style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {datos.map((n) => (
              <li key={n.id}>
                <button className="fila" onClick={() => abrirNoti(n)} style={{ alignItems: "flex-start", paddingTop: 14, paddingBottom: 14 }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, marginTop: 6, borderRadius: 4, flexShrink: 0, background: n.read_at ? "transparent" : "var(--acento)" }} />
                  <span className="crece" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: n.read_at ? 600 : 800, lineHeight: 1.4 }}>{n.titulo}</span>
                    {n.detalle && <span className="suave" style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45 }}>{n.detalle}</span>}
                    <span className="suave" style={{ fontSize: 11, fontWeight: 600 }}>{cuando(n.created_at)}{n.read_at ? "" : " · Nueva"}</span>
                  </span>
                  {n.href && <Icono nombre="derecha" tamano={18} color="var(--suave)" grosor={2} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
