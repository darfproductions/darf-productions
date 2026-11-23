import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { textoAvance } from "@/lib/comision-rules";
import { sellerPath } from "@/lib/seller-rules";
import { fechaNacimientoOk } from "@/lib/account-rules";
import { compressImage } from "@/lib/image-compress";
import { mensajeError } from "@/lib/errores";
import { ArteObra } from "~/componentes/ArteObra";
import { Icono } from "~/componentes/Icono";
import { fotoPerfil, leerPerfil, leerResumen } from "~/lib/cuenta";
import type { Obra } from "~/lib/datos";
import { env } from "~/lib/env";
import { dinero, fechaLarga, hora } from "~/lib/formato";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { abrir, useCarga } from "~/lib/usar";
import { Share } from "@capacitor/share";

// Secciones de Mi cuenta (como /cuenta/* en la web): Transacciones, Mis eventos, Mis ventas y Editar perfil.

export function Marco({ titulo, intro, children }: { titulo: string; intro?: string; children: ReactNode }) {
  const { sesion, cargando } = useSesion();
  if (!cargando && !sesion) return <Navigate to="/acceso" replace />;
  return (
    <main className="pantalla sin-barra">
      <div className="contenido" style={{ gap: 14 }}>
        <Link to="/cuenta" className="circulo" aria-label="Volver a Mi cuenta"><Icono nombre="atras" /></Link>
        <h1 className="titulo-grande">{titulo}</h1>
        {intro && <p className="suave" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{intro}</p>}
        {children}
      </div>
    </main>
  );
}

const ESTADO: Record<string, { t: string; c: string }> = {
  aprobado: { t: "Pagada", c: "#22c55e" },
  pendiente: { t: "Pendiente de pago", c: "var(--dorado-texto)" },
  rechazado: { t: "Cancelada", c: "var(--suave)" },
};

// ── Transacciones: todas mis órdenes (web/src/lib/historial.ts → getTransacciones) ─────────────────────────────────
export function Transacciones() {
  const { sesion } = useSesion();
  const uid = sesion?.user.id ?? null;
  const { datos, error, cargando } = useCarga(async () => {
    if (!uid) return [];
    const { data, error } = await supabase.from("orders")
      .select("id, order_code, status, total, discount_amount, discount_codigo, created_at, vencida_at, performances(starts_at, productions(nombre)), tickets(count)")
      .eq("buyer_user_id", uid).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as { id: string; order_code: string; status: string; total: number; discount_amount: number | null; discount_codigo: string | null; created_at: string; vencida_at: string | null; performances: { starts_at: string | null; productions: { nombre: string } | null } | null; tickets: { count: number }[] }[];
  }, [uid]);
  const pagado = (datos ?? []).filter((o) => o.status === "aprobado").reduce((n, o) => n + Number(o.total), 0);
  return (
    <Marco titulo="Transacciones" intro="Todas tus órdenes de boletos: pagadas, pendientes y canceladas.">
      {cargando && <div className="esqueleto" style={{ height: 200 }} />}
      {error && <p className="aviso error">No pudimos cargar tus compras.</p>}
      {datos && datos.length === 0 && <p className="tarjeta suave" style={{ padding: 18, margin: 0 }}>Todavía no tienes compras.</p>}
      {datos && datos.length > 0 && (
        <>
          <p className="suave" style={{ margin: 0, fontSize: 13 }}>{datos.length} {datos.length === 1 ? "orden" : "órdenes"} · Pagado en total <b style={{ color: "var(--texto)" }}>{dinero(pagado)}</b></p>
          {datos.map((o) => {
            const n = o.tickets?.[0]?.count ?? 0;
            const f = o.performances?.starts_at;
            return (
              <div key={o.id} className="tarjeta" style={{ padding: 16, display: "flex", gap: 12 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  <span className="suave" style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>{o.order_code}</span>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{o.performances?.productions?.nombre ?? "Producción"}</span>
                  <span className="suave" style={{ fontSize: 13 }}>{f ? `${fechaLarga(f)} · ${hora(f)}` : "Fecha por anunciar"} · {n} {n === 1 ? "boleto" : "boletos"}</span>
                  {o.discount_codigo && <span className="suave" style={{ fontSize: 12 }}>Código {o.discount_codigo}: −{dinero(Number(o.discount_amount ?? 0))}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <b style={{ fontSize: 17 }}>{dinero(Number(o.total))}</b>
                  <span style={{ fontSize: 12, fontWeight: 800, color: ESTADO[o.status]?.c }}>{o.status === "rechazado" && o.vencida_at ? "Venció sin pago" : ESTADO[o.status]?.t}</span>
                  {o.status !== "rechazado" && <Link to="/boletos" style={{ fontSize: 12, fontWeight: 800, color: "var(--acento)" }}>Ver boletos</Link>}
                </div>
              </div>
            );
          })}
        </>
      )}
    </Marco>
  );
}

// ── Mis eventos: eventos apartados (mis_eventos) y funciones a las que fui (boletos con entrada registrada) ──────────
type MiEvento = { id: string; titulo: string; obra: string | null; starts_at: string; lugar: string | null; orden_codigo: string | null; orden_status: string | null; orden_monto: number | null; orden_expira: string | null; vencida: boolean | null; cancelado: boolean | null; cancelado_motivo: string | null };

export function MisEventos() {
  const { sesion } = useSesion();
  const uid = sesion?.user.id ?? null;
  const { datos, cargando, error } = useCarga(async () => {
    if (!uid) return null;
    const [mios, fui] = await Promise.all([
      supabase.rpc("mis_eventos"),
      supabase.from("tickets").select("performance_id, checked_in_at, orders!inner(buyer_user_id), performances(starts_at, productions(id, nombre, logo_path, ambiente_path, color_fondo, color_superficie, color_texto, color_acento, temporada, venue))")
        .eq("orders.buyer_user_id", uid).not("checked_in_at", "is", null),
    ]);
    const porFuncion = new Map<string, { obra: Obra; funcion: string | null; boletos: number }>();
    for (const t of (fui.data ?? []) as unknown as { performance_id: string; performances: { starts_at: string | null; productions: Obra | null } | null }[]) {
      const pf = t.performances;
      if (!pf?.productions) continue;
      const prev = porFuncion.get(t.performance_id);
      if (prev) prev.boletos += 1;
      else porFuncion.set(t.performance_id, { obra: pf.productions, funcion: pf.starts_at, boletos: 1 });
    }
    return { mios: (mios.data ?? []) as MiEvento[], fui: [...porFuncion.values()].sort((a, b) => (b.funcion ?? "").localeCompare(a.funcion ?? "")) };
  }, [uid]);

  const estado = (e: MiEvento) => e.cancelado ? { t: "Evento cancelado", c: "var(--suave)" }
    : e.orden_status === "aprobado" ? { t: "Lugar confirmado", c: "#22c55e" }
    : e.orden_status === "pendiente" ? { t: "Pendiente de pago", c: "var(--dorado-texto)" }
    : e.orden_status === "rechazado" ? { t: e.vencida ? "Venció sin pago" : "Cancelado", c: "var(--suave)" }
    : { t: "Registrado", c: "#22c55e" };

  return (
    <Marco titulo="Mis eventos" intro="Los eventos que apartaste (y su pago) y las funciones a las que ya fuiste.">
      {cargando && <div className="esqueleto" style={{ height: 200 }} />}
      {error && <p className="aviso error">No pudimos cargar tus eventos.</p>}
      {datos && (
        <>
          <h2 className="titulo-seccion" style={{ marginTop: 6 }}>Eventos DARF</h2>
          {datos.mios.length === 0 && <p className="tarjeta suave" style={{ padding: 18, margin: 0 }}>Aún no apartas lugar en ningún evento.</p>}
          {datos.mios.map((e) => {
            const st = estado(e);
            const pagar = e.orden_status === "pendiente" && e.orden_codigo && env.whatsapp
              ? `https://wa.me/${env.whatsapp}?text=${encodeURIComponent(`Hola, envío el comprobante de mi lugar en ${e.titulo}${e.obra ? ` (${e.obra})` : ""}. Orden ${e.orden_codigo} por ${dinero(Number(e.orden_monto ?? 0))}.`)}` : "";
            return (
              <div key={e.id} className="tarjeta" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: st.c }}>{st.t}</span>
                <span style={{ fontSize: 16, fontWeight: 800 }}>{e.titulo}</span>
                <span className="suave" style={{ fontSize: 13 }}>{fechaLarga(e.starts_at)} · {hora(e.starts_at)}{e.lugar ? ` · ${e.lugar}` : ""}{e.obra ? ` · ${e.obra}` : ""}</span>
                {e.orden_codigo && <span className="suave" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{e.orden_codigo}</span>}
                {e.cancelado && e.cancelado_motivo && <span className="suave" style={{ fontSize: 13 }}>Motivo: {e.cancelado_motivo}</span>}
                {pagar && !e.cancelado && <button className="boton" onClick={() => abrir(pagar)} style={{ alignSelf: "flex-start", minHeight: 40, background: "#25d366", color: "#0b0b0b", fontSize: 11 }}><Icono nombre="whatsapp" tamano={16} />Pagar por WhatsApp</button>}
              </div>
            );
          })}

          <h2 className="titulo-seccion" style={{ marginTop: 10 }}>Funciones a las que fuiste</h2>
          {datos.fui.length === 0 && <p className="tarjeta suave" style={{ padding: 18, margin: 0 }}>Aquí aparecerán las funciones a las que vayas.</p>}
          {datos.fui.map((e, i) => (
            <Link key={i} to={`/obras/${e.obra.id}`} className="tarjeta" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "relative", aspectRatio: "16 / 9", background: e.obra.color_fondo ?? "#0b0b0b" }}>
                <ArteObra obra={e.obra} uso="destacada-celular" />
                <span className="pildora" style={{ position: "absolute", top: 12, left: 12, background: "rgba(11,11,11,0.7)", color: "#f3e3a3" }}>Asististe</span>
              </div>
              <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>{e.obra.nombre}</span>
                <span className="suave" style={{ fontSize: 13 }}>{e.funcion ? fechaLarga(e.funcion) : ""} · {e.boletos} {e.boletos === 1 ? "boleto" : "boletos"}</span>
              </div>
            </Link>
          ))}
        </>
      )}
    </Marco>
  );
}

// ── Mis ventas: código de vendedor, ventas por obra y comisión (my_seller, mi_comision) ───────────────────────────────
export function MisVentas() {
  const { sesion } = useSesion();
  const uid = sesion?.user.id ?? null;
  const { datos, cargando } = useCarga(() => (uid ? leerResumen(uid) : Promise.resolve(null)), [uid]);
  const ventas = (datos?.ventas ?? []).filter((v) => v.production_id);
  const codigo = datos?.ventas[0]?.codigo ?? null;
  const comision = new Map((datos?.comisiones ?? []).map((c) => [c.production_id, c]));
  const compartir = async (pid: string, obra: string | null) => {
    if (!codigo) return;
    const url = env.siteUrl + sellerPath(pid, codigo);
    await Share.share({ title: obra ?? "DARF", text: `Compra tus boletos para ${obra ?? "DARF"} con mi código ${codigo}`, url }).catch(() => navigator.clipboard?.writeText(url));
  };
  return (
    <Marco titulo="Mis ventas">
      {cargando && <div className="esqueleto" style={{ height: 200 }} />}
      {codigo && (
        <div className="tarjeta" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="suave" style={{ fontSize: 13 }}>Tu código de vendedor</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 26, fontWeight: 900, letterSpacing: "0.12em" }}>{codigo}</span>
          <span className="suave" style={{ fontSize: 13, lineHeight: 1.5 }}>Funciona en las obras donde estás activo. Comparte tu liga: quien compre desde ahí ya trae tu código.</span>
        </div>
      )}
      {ventas.map((v) => {
        const c = comision.get(v.production_id!);
        return (
          <div key={v.production_id} className="tarjeta" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>{v.obra}</span>
            <span className="suave" style={{ fontSize: 13 }}>{v.boletos} {v.boletos === 1 ? "boleto" : "boletos"} · {dinero(Number(v.monto))}{v.pendientes ? ` · ${v.pendientes} por aprobar` : ""}{!v.activo ? " · tu código ya no está activo aquí" : ""}</span>
            {c && <span style={{ fontSize: 13, fontWeight: 800, color: "var(--dorado-texto)" }}>Tu comisión: {dinero(Number(c.comision))}{Number(c.pagado) > 0 ? ` · pagado ${dinero(Number(c.pagado))}` : ""}</span>}
            {c && <span className="suave" style={{ fontSize: 12 }}>{textoAvance(c)}</span>}
            {v.activo && v.en_venta && <button className="boton contorno" onClick={() => compartir(v.production_id!, v.obra)} style={{ alignSelf: "flex-start", minHeight: 40, fontSize: 11 }}><Icono nombre="compartir" tamano={16} />Compartir mi liga</button>}
          </div>
        );
      })}
    </Marco>
  );
}

// ── Editar perfil: nombre, teléfono, nacimiento y foto (profiles + bucket privado avatares) ──────────────────────────
export function EditarPerfil() {
  const { sesion } = useSesion();
  const uid = sesion?.user.id ?? null;
  const [version, setVersion] = useState(0);
  const { datos } = useCarga(async () => {
    if (!uid) return null;
    const p = await leerPerfil(uid);
    return { p, foto: await fotoPerfil(p?.foto_path) };
  }, [uid, version]);
  const [f, setF] = useState({ nombres: "", apellidos: "", telefono: "", fecha: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  useEffect(() => {
    if (datos?.p) setF({ nombres: datos.p.nombres ?? datos.p.nombre ?? "", apellidos: datos.p.apellidos ?? "", telefono: datos.p.telefono ?? "", fecha: datos.p.fecha_nacimiento ?? "" });
  }, [datos]);

  const guardar = async () => {
    if (!uid) return;
    if (!f.nombres.trim()) return setMsg({ ok: false, t: "Escribe tu nombre." });
    if (f.fecha && !fechaNacimientoOk(f.fecha)) return setMsg({ ok: false, t: "Revisa tu fecha de nacimiento." });
    const { error } = await supabase.from("profiles").update({ nombres: f.nombres.trim(), apellidos: f.apellidos.trim() || null, telefono: f.telefono.trim() || null, fecha_nacimiento: f.fecha || null }).eq("id", uid);
    setMsg(error ? { ok: false, t: "No se pudo guardar. Intenta de nuevo." } : { ok: true, t: "Perfil guardado." });
  };

  const subirFoto = async (archivo: File | undefined) => {
    if (!archivo || !uid) return;
    setSubiendo(true);
    try {
      const c = await compressImage(archivo, "avatar");
      if (c.file.size > 5 * 1024 * 1024) return setMsg({ ok: false, t: "La foto pesa más de 5 MB." });
      const path = `${uid}/foto-${Date.now().toString(36)}.${c.file.type.split("/")[1]}`;
      const up = await supabase.storage.from("avatares").upload(path, c.file, { contentType: c.file.type });
      if (up.error) return setMsg({ ok: false, t: "No se pudo subir la foto." });
      const antes = datos?.p?.foto_path;
      const { error } = await supabase.from("profiles").update({ foto_path: path }).eq("id", uid);
      if (error) return setMsg({ ok: false, t: mensajeError(error) });
      if (antes && antes !== path) await supabase.storage.from("avatares").remove([antes]);
      setMsg({ ok: true, t: "Foto guardada." });
      setVersion((v) => v + 1);
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <Marco titulo="Mi perfil">
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {datos?.foto
          ? <img src={datos.foto} alt="" style={{ width: 84, height: 84, borderRadius: 42, objectFit: "cover" }} />
          : <div aria-hidden="true" style={{ width: 84, height: 84, borderRadius: 42, background: "var(--degradado)" }} />}
        <label className="boton contorno" style={{ minHeight: 44, fontSize: 11 }}>
          {subiendo ? "Subiendo…" : datos?.foto ? "Cambiar foto" : "Poner foto"}
          <input type="file" accept="image/*" hidden disabled={subiendo} onChange={(e) => subirFoto(e.target.files?.[0])} />
        </label>
      </div>
      <label className="campo">Nombre(s)<input autoComplete="given-name" value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} /></label>
      <label className="campo">Apellidos<input autoComplete="family-name" value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} /></label>
      <label className="campo">Teléfono<input type="tel" autoComplete="tel" inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></label>
      <label className="campo">Fecha de nacimiento<input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></label>
      <span className="suave" style={{ fontSize: 13 }}>Correo: {sesion?.user.email}</span>
      {msg && <p className={`aviso ${msg.ok ? "" : "error"}`} role="status" style={{ margin: 0 }}>{msg.t}</p>}
      <button className="boton principal" onClick={guardar}>Guardar</button>
    </Marco>
  );
}
