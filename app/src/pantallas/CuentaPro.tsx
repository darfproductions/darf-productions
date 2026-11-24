import { useEffect, useState, type ReactNode } from "react";
import { bancoDeClabe, clabeValida, formatearClabe, limpiarClabe } from "@/lib/clabe-rules";
import { diaDePago, lineaParte, type Parte } from "@/lib/honorarios-rules";
import { httpsOrNull, LISTAS, parseList, TESITURAS, trayectoriaDe, usuarioRed, type Habilidades, type ProProfile, type Trayecto } from "@/lib/pro-rules";
import { edad } from "@/lib/member-rules";
import { compressImage } from "@/lib/image-compress";
import { mensajeError } from "@/lib/errores";
import { Icono } from "~/componentes/Icono";
import { leerPerfil } from "~/lib/cuenta";
import { env } from "~/lib/env";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { abrir, useCarga } from "~/lib/usar";
import { useNavigate } from "react-router";
import { Marco } from "./CuentaSecciones";

// Mis honorarios (0150/0152/0161) y Perfil profesional (0057), nativos. Igual que /cuenta/honorarios y
// /cuenta/perfil-profesional en la web: la base (RLS y RPC) decide qué ve y qué puede editar cada quien.

type Msg = { ok: boolean; t: string } | null;
const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX")}`;
const pesos2 = (n: number) => `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
const mayus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nombreMes = (periodo: string) => mayus(new Date(`${periodo.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }));
const diaMx = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long" });

function Aviso({ m }: { m: Msg }) {
  return m ? <p className={`aviso ${m.ok ? "" : "error"}`} role="status" style={{ margin: 0 }}>{m.t}</p> : null;
}
function Bloque({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <section className="tarjeta" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      {titulo && <h2 className="titulo-seccion">{titulo}</h2>}
      {children}
    </section>
  );
}

// ── Mis honorarios ───────────────────────────────────────────────────────────────────────────────────────────────
type Pago = { pago: number; bruto: number; partes: Parte[]; pagado_at: string | null; comprobante_path: string | null; recibido_at: string | null; folio: string | null };
type Mes = Pago & { periodo: string; fondo_aplicado: boolean };
type Cierre = Pago & { cierre_id: string; titulo: string | null };
type DatosPagoFila = { metodo: "transferencia" | "efectivo"; titular: string | null; banco: string | null; clabe: string | null } | null;

async function leerHonorarios() {
  const [m, c, a, dp] = await Promise.all([
    supabase.from("hon_mes_personas").select("periodo, pago, bruto, partes, fondo_aplicado, pagado_at, comprobante_path, recibido_at, folio").order("periodo", { ascending: false }),
    supabase.from("hon_cierre_personas").select("cierre_id, titulo, pago, bruto, partes, pagado_at, comprobante_path, recibido_at, folio"),
    supabase.rpc("mis_honorarios_aplica"),
    supabase.from("hon_datos_pago").select("metodo, titular, banco, clabe").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const meses = (m.data ?? []) as Mes[];
  const cierres = (c.data ?? []) as Cierre[];
  const paths = [...meses, ...cierres].map((x) => x.comprobante_path).filter((x): x is string => !!x);
  const firmadas = paths.length ? (await supabase.storage.from("honorarios").createSignedUrls(paths, 600)).data ?? [] : [];
  const urls = new Map(firmadas.filter((x) => x.signedUrl).map((x) => [x.path as string, x.signedUrl as string]));
  return { meses, cierres, aplica: a.data === true, datosPago: (dp.data as DatosPagoFila) ?? null, urls };
}

export function MisHonorarios() {
  const [version, setVersion] = useState(0);
  const { datos, cargando, error } = useCarga(leerHonorarios, [version]);
  const [msg, setMsg] = useState<Msg>(null);
  const anio = String(new Date().getFullYear());
  const delAnio = datos
    ? datos.meses.filter((m) => m.periodo.startsWith(anio)).reduce((s, m) => s + Number(m.pago), 0)
      + datos.cierres.filter((c) => c.pagado_at?.startsWith(anio)).reduce((s, c) => s + Number(c.pago), 0)
    : 0;

  const meLlego = async (rpc: "hon_ya_me_llego" | "hon_cierre_me_llego", args: Record<string, string>) => {
    const { error } = await supabase.rpc(rpc, args);
    setMsg(error ? { ok: false, t: mensajeError(error) } : { ok: true, t: "Gracias: quedó registrado que te llegó." });
    if (!error) setVersion((v) => v + 1);
  };

  const tarjeta = (key: string, titulo: string, p: Pago, nota: ReactNode, llego: () => void) => (
    <Bloque key={key}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <h2 className="titulo-seccion">{titulo}</h2>
        <span style={{ fontSize: 22, fontWeight: 900 }}>{pesos(p.pago)}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13 }}>
        {p.pagado_at
          ? <span className="pildora" style={{ background: "rgba(34,197,94,0.16)", color: "#16a34a" }}>Pagado el {diaMx(p.pagado_at)}</span>
          : <span className="pildora" style={{ background: "rgba(245,158,11,0.16)", color: "#d97706" }}>Pendiente de pago</span>}
        {p.folio && <span className="suave" style={{ fontWeight: 700 }}>Recibo {p.folio}</span>}
      </div>
      <ul className="suave" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
        {p.partes.map((x, i) => <li key={i}>{lineaParte(x, [])}</li>)}
      </ul>
      <p className="suave" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>{nota}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {p.comprobante_path && datos?.urls.get(p.comprobante_path) && (
          <button className="boton contorno" style={{ minHeight: 40, fontSize: 11 }} onClick={() => abrir(datos.urls.get(p.comprobante_path!)!)}>Ver comprobante</button>
        )}
        {p.pagado_at && (p.recibido_at
          ? <span style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", alignSelf: "center" }}>Confirmaste que te llegó</span>
          : <button className="boton principal" style={{ minHeight: 40, fontSize: 11 }} onClick={llego}>Ya me llegó</button>)}
      </div>
    </Bloque>
  );

  const sinPagos = datos && datos.meses.length === 0 && datos.cierres.length === 0;
  return (
    <Marco titulo="Mis honorarios" intro="Cómo quieres cobrar y lo que DARF te ha pagado: cuánto, cuándo y de qué.">
      {cargando && <div className="esqueleto" style={{ height: 180 }} />}
      {error && <p className="aviso error">No pudimos cargar tus honorarios. Revisa tu conexión.</p>}
      <Aviso m={msg} />
      {datos?.aplica && (
        <Bloque titulo="Cómo quiero cobrar"><DatosPago inicial={datos.datosPago} /></Bloque>
      )}
      {datos && !datos.aplica && sinPagos && (
        <p className="aviso">Mis honorarios es para el equipo creativo de las obras y el elenco de las obras profesionales.</p>
      )}
      {datos?.aplica && sinPagos && <p className="aviso">Todavía no hay pagos para ti. Aquí vas a ver cada pago: cuánto, cuándo y de qué.</p>}
      {datos && !sinPagos && (
        <>
          <Bloque>
            <span className="suave" style={{ fontSize: 13 }}>Cobrado en {anio}</span>
            <span style={{ fontSize: 30, fontWeight: 900, marginTop: -8 }}>{pesos(delAnio)}</span>
          </Bloque>
          {datos.meses.map((m) => {
            const [a, mm] = m.periodo.split("-").map(Number);
            return tarjeta(m.periodo, nombreMes(m.periodo), m,
              <>Suma {pesos2(m.bruto)}, redondeado hacia abajo a 10 pesos (lo que sobra va a la reserva de DARF).
                {m.fondo_aplicado ? " Este mes se aplicó el fondo creativo común." : ""} Día de pago: lunes {new Date(`${diaDePago(a, mm)}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "long", timeZone: "UTC" })}.</>,
              () => meLlego("hon_ya_me_llego", { p_periodo: m.periodo }));
          })}
          {datos.cierres.length > 0 && <h2 className="titulo-seccion" style={{ marginTop: 6 }}>Cierres de temporada</h2>}
          {datos.cierres.map((c) => tarjeta(c.cierre_id, c.titulo ?? "Cierre de temporada", c,
            <>Suma {pesos2(c.bruto)}, redondeado hacia abajo a 10 pesos.</>,
            () => meLlego("hon_cierre_me_llego", { p_cierre: c.cierre_id })))}
        </>
      )}
    </Marco>
  );
}

function DatosPago({ inicial }: { inicial: DatosPagoFila }) {
  const [metodo, setMetodo] = useState<"transferencia" | "efectivo">(inicial?.metodo ?? "transferencia");
  const [clabe, setClabe] = useState(inicial?.clabe ? formatearClabe(inicial.clabe) : "");
  const [titular, setTitular] = useState(inicial?.titular ?? "");
  const [banco, setBanco] = useState(inicial?.banco ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [guardando, setGuardando] = useState(false);
  const d = limpiarClabe(clabe);
  const aviso = d.length === 0 ? null : d.length < 18 ? `${d.length} de 18 dígitos` : clabeValida(d) ? null : "Esta CLABE no es válida: revisa los dígitos.";

  const guardar = async () => {
    if (d.length !== 18) return setMsg({ ok: false, t: "Pon tu CLABE de 18 dígitos: aunque prefieras efectivo, necesitamos tu información de cuenta." });
    if (titular.trim().length < 2) return setMsg({ ok: false, t: "Pon el nombre del titular de la cuenta." });
    setGuardando(true);
    const { error } = await supabase.rpc("hon_mis_datos_pago_guardar", { p_metodo: metodo, p_titular: titular.trim().slice(0, 120), p_banco: banco.slice(0, 60), p_clabe: d });
    setGuardando(false);
    setMsg(error ? { ok: false, t: mensajeError(error) } : { ok: true, t: "Guardado. Ya lo ven para tus pagos." });
  };

  return (
    <>
      <span style={{ fontSize: 13, fontWeight: 700 }}>¿Cómo prefieres que te paguen?</span>
      <div role="radiogroup" className="segmentos">
        {(["transferencia", "efectivo"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={metodo === m} onClick={() => setMetodo(m)}>{m === "transferencia" ? "Transferencia" : "Efectivo"}</button>
        ))}
      </div>
      <label className="campo">CLABE
        <input inputMode="numeric" autoComplete="off" placeholder="18 dígitos" value={clabe} style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.05em" }}
          onChange={(e) => { setClabe(e.target.value); const b = bancoDeClabe(e.target.value); if (b && !banco) setBanco(b); }} />
        <span className="suave" style={{ fontSize: 12, fontWeight: 500 }}>Aunque prefieras efectivo, necesitamos tu información de cuenta.</span>
        {aviso && <span style={{ fontSize: 12, color: "#d97706" }}>{aviso}</span>}
        {d.length === 18 && !aviso && <span style={{ fontSize: 12, color: "#16a34a" }}>CLABE válida{bancoDeClabe(d) ? ` · ${bancoDeClabe(d)}` : ""}</span>}
      </label>
      <label className="campo">Titular de la cuenta<input value={titular} onChange={(e) => setTitular(e.target.value)} placeholder="Como aparece en el banco" /></label>
      <label className="campo">Banco<input value={banco} onChange={(e) => setBanco(e.target.value)} /></label>
      <Aviso m={msg} />
      <button className="boton principal" disabled={guardando || d.length !== 18 || !!aviso} onClick={guardar}>{guardando ? "Guardando…" : "Guardar"}</button>
      <p className="suave" style={{ margin: 0, fontSize: 12 }}>Solo la ven las cabezas de DARF para hacerte los depósitos.</p>
    </>
  );
}

// ── Perfil profesional ───────────────────────────────────────────────────────────────────────────────────────────
type Foto = { id: string; path: string; orden: number };
const perfilUrl = (path: string) => `${env.supabaseUrl}/storage/v1/object/public/perfiles/${path.split("/").map(encodeURIComponent).join("/")}`;
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const VACIO: Trayecto = { obra: "", papel: "", compania: "", anio: "" };

async function leerPro(uid: string) {
  const [{ data: pid, error }, perfil] = await Promise.all([supabase.rpc("my_person"), leerPerfil(uid)]);
  if (error || !pid) return { pid: null, pro: null, fotos: [] as Foto[], menor: false, nombre: perfil?.nombre ?? "" };
  const [p, f] = await Promise.all([
    supabase.from("pro_profiles").select("*").eq("person_id", pid).maybeSingle(),
    supabase.from("pro_photos").select("id, path, orden").eq("person_id", pid).order("orden"),
  ]);
  const e = edad(perfil?.fecha_nacimiento ?? null);
  return { pid: pid as string, pro: (p.data as ProProfile) ?? null, fotos: (f.data ?? []) as Foto[], menor: e !== null && e < 18, nombre: perfil?.nombre ?? "" };
}

/** Crea la fila del perfil si no existe (el slug lo pone la base). */
async function asegurar(pid: string): Promise<string | null> {
  const { data } = await supabase.from("pro_profiles").select("person_id").eq("person_id", pid).maybeSingle();
  if (data) return null;
  const { error } = await supabase.from("pro_profiles").insert({ person_id: pid, slug: "" });
  return error ? mensajeError(error) : null;
}

export function PerfilProfesional() {
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const uid = sesion?.user.id ?? null;
  const [version, setVersion] = useState(0);
  const { datos, cargando, error } = useCarga(() => (uid ? leerPro(uid) : Promise.resolve(null)), [uid, version]);
  const [msg, setMsg] = useState<Msg>(null);
  const [subiendo, setSubiendo] = useState<"retrato" | "galeria" | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [f, setF] = useState({ semblanza: "", canto: "", instagram: "", tiktok: "", youtube: "", reel: "", publico: false });
  const [listas, setListas] = useState<Record<string, string>>({});
  const [tray, setTray] = useState<Trayecto[]>([VACIO]);

  useEffect(() => {
    const p = datos?.pro;
    if (!datos) return;
    const h = p?.habilidades ?? {};
    setF({ semblanza: p?.semblanza ?? "", canto: h.canto ?? "", instagram: p?.instagram ?? "", tiktok: p?.tiktok ?? "", youtube: p?.youtube ?? "", reel: p?.reel_url ?? "", publico: !!p?.publico });
    setListas(Object.fromEntries(LISTAS.map((l) => [l.key, (h[l.key] ?? []).join(", ")])));
    setTray(p?.trayectoria?.length ? p.trayectoria : [VACIO]);
  }, [datos]);

  const pid = datos?.pid ?? null;

  const guardar = async () => {
    if (!pid) return;
    const t = trayectoriaDe(tray);
    if (!t.ok) return setMsg({ ok: false, t: t.message });
    const habilidades: Habilidades = { canto: f.canto || undefined };
    for (const l of LISTAS) { const v = parseList(listas[l.key] ?? ""); if (v.length) habilidades[l.key] = v; }
    const youtube = httpsOrNull(f.youtube), reel = httpsOrNull(f.reel);
    if (youtube === false || reel === false) return setMsg({ ok: false, t: "Los enlaces deben empezar con https://" });
    const instagram = f.instagram.trim() ? usuarioRed(f.instagram) : null, tiktok = f.tiktok.trim() ? usuarioRed(f.tiktok) : null;
    if ((f.instagram.trim() && !instagram) || (f.tiktok.trim() && !tiktok)) return setMsg({ ok: false, t: "Revisa tu usuario de Instagram o TikTok." });
    if (f.semblanza.trim().length > 3000) return setMsg({ ok: false, t: "La semblanza es muy larga (máx. 3000)." });
    setGuardando(true);
    try {
      const err = await asegurar(pid);
      if (err) return setMsg({ ok: false, t: err });
      const { error, count } = await supabase.from("pro_profiles").update({
        semblanza: f.semblanza.trim() || null, trayectoria: t.items, habilidades, instagram, tiktok, youtube, reel_url: reel, publico: f.publico,
      }, { count: "exact" }).eq("person_id", pid);
      if (error) return setMsg({ ok: false, t: mensajeError(error) });
      if (!count) return setMsg({ ok: false, t: "No tienes permiso para editar este perfil." });
      setMsg({ ok: true, t: "Perfil guardado." });
      setVersion((v) => v + 1);
    } finally {
      setGuardando(false);
    }
  };

  const subir = async (kind: "retrato" | "galeria", archivo: File | undefined) => {
    if (!archivo || !pid) return;
    if (!TIPOS.includes(archivo.type) && !archivo.type.startsWith("image/")) return setMsg({ ok: false, t: "Sube una foto JPG, PNG o WebP." });
    setSubiendo(kind);
    try {
      const c = await compressImage(archivo, "perfil");
      if (c.file.size > 8 * 1024 * 1024) return setMsg({ ok: false, t: "La foto pesa más de 8 MB." });
      const err = await asegurar(pid);
      if (err) return setMsg({ ok: false, t: err });
      const path = `${pid}/${kind}-${Date.now().toString(36)}.${c.file.type.split("/")[1]}`;
      const up = await supabase.storage.from("perfiles").upload(path, c.file, { contentType: c.file.type });
      if (up.error) return setMsg({ ok: false, t: `No se pudo subir: ${up.error.message}` });
      if (kind === "retrato") {
        const antes = datos?.pro?.retrato_path;
        const { error } = await supabase.from("pro_profiles").update({ retrato_path: path }).eq("person_id", pid);
        if (error) return setMsg({ ok: false, t: mensajeError(error) });
        if (antes && antes !== path) await supabase.storage.from("perfiles").remove([antes]);
      } else {
        const { error } = await supabase.from("pro_photos").insert({ person_id: pid, path, orden: (datos?.fotos.length ?? 0) + 1 });
        if (error) { await supabase.storage.from("perfiles").remove([path]); return setMsg({ ok: false, t: mensajeError(error) }); }
      }
      setMsg({ ok: true, t: [kind === "retrato" ? "Retrato guardado." : "Foto agregada.", c.nota].filter(Boolean).join(" · ") });
      setVersion((v) => v + 1);
    } finally {
      setSubiendo(null);
    }
  };

  const quitarRetrato = async () => {
    if (!pid || !datos?.pro?.retrato_path) return;
    const antes = datos.pro.retrato_path;
    const { error } = await supabase.from("pro_profiles").update({ retrato_path: null }).eq("person_id", pid);
    if (error) return setMsg({ ok: false, t: mensajeError(error) });
    await supabase.storage.from("perfiles").remove([antes]);
    setMsg({ ok: true, t: "Retrato quitado." });
    setVersion((v) => v + 1);
  };

  const quitarFoto = async (foto: Foto) => {
    if (!pid || !window.confirm("¿Quitar esta foto?")) return;
    const { error } = await supabase.from("pro_photos").delete().eq("id", foto.id).eq("person_id", pid);
    if (error) return setMsg({ ok: false, t: mensajeError(error) });
    await supabase.storage.from("perfiles").remove([foto.path]);
    setVersion((v) => v + 1);
  };

  const pro = datos?.pro ?? null;
  const esPublico = !!pro?.publico && (!datos?.menor || !!pro?.tutor_autorizado_at);
  const nombre = datos?.nombre || "D";

  return (
    <Marco titulo="Perfil profesional" intro="Lo que verán directores y público de ti como artista. Es distinto de tu foto personal de la cuenta.">
      {cargando && <div className="esqueleto" style={{ height: 220 }} />}
      {(error || (datos && !pid)) && <p className="aviso error">No se pudo abrir tu perfil. Intenta de nuevo.</p>}
      {datos && pid && (
        <>
          <Bloque titulo="Retrato profesional">
            <p className="suave" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>Foto de frente, buena luz, fondo liso. Sale en tu perfil y en el elenco de las obras que no tengan foto tuya.</p>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ width: 96, height: 128, borderRadius: 14, overflow: "hidden", flexShrink: 0, background: "var(--linea)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900 }}>
                {pro?.retrato_path ? <img src={perfilUrl(pro.retrato_path)} alt={`Retrato de ${nombre}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : nombre.charAt(0)}
              </span>
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
                <label className="boton contorno" style={{ minHeight: 44, fontSize: 11 }}>
                  {subiendo === "retrato" ? "Subiendo…" : pro?.retrato_path ? "Cambiar retrato" : "Subir retrato"}
                  <input type="file" accept="image/*" hidden disabled={!!subiendo} onChange={(e) => { void subir("retrato", e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                {pro?.retrato_path && <button className="liga suave" style={{ fontSize: 12 }} onClick={quitarRetrato}>Quitar retrato</button>}
              </span>
            </div>
          </Bloque>

          <Bloque titulo="Sobre ti">
            <label className="campo">Semblanza
              <textarea rows={6} maxLength={3000} value={f.semblanza} onChange={(e) => setF({ ...f, semblanza: e.target.value })} placeholder="Quién eres, tu formación y lo que más te gusta hacer en escena." />
            </label>
          </Bloque>

          <Bloque titulo="Trayectoria fuera de DARF">
            <p className="suave" style={{ margin: 0, fontSize: 13 }}>Tus obras con DARF aparecen solas.</p>
            {tray.map((t, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 12, borderBottom: "1px solid var(--linea)" }}>
                <label className="campo">Obra<input value={t.obra} onChange={(e) => setTray(tray.map((x, j) => (j === i ? { ...x, obra: e.target.value } : x)))} /></label>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 96px", gap: 8 }}>
                  <label className="campo">Papel<input value={t.papel} onChange={(e) => setTray(tray.map((x, j) => (j === i ? { ...x, papel: e.target.value } : x)))} /></label>
                  <label className="campo">Año<input inputMode="numeric" maxLength={4} value={t.anio} onChange={(e) => setTray(tray.map((x, j) => (j === i ? { ...x, anio: e.target.value } : x)))} /></label>
                </div>
                <label className="campo">Compañía<input value={t.compania} onChange={(e) => setTray(tray.map((x, j) => (j === i ? { ...x, compania: e.target.value } : x)))} /></label>
                {tray.length > 1 && <button className="liga suave" style={{ alignSelf: "flex-start", fontSize: 12 }} onClick={() => setTray(tray.filter((_, j) => j !== i))}>Quitar</button>}
              </div>
            ))}
            {tray.length < 60 && <button className="boton contorno" style={{ minHeight: 40, fontSize: 11, alignSelf: "flex-start" }} onClick={() => setTray([...tray, VACIO])}>Agregar obra</button>}
          </Bloque>

          <Bloque titulo="Habilidades">
            <label className="campo">Canto (tesitura)
              <select value={f.canto} onChange={(e) => setF({ ...f, canto: e.target.value })}>
                <option value="">—</option>
                {TESITURAS.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            {LISTAS.map((l) => (
              <label key={l.key} className="campo">{l.label}
                <input value={listas[l.key] ?? ""} placeholder={l.ejemplo} onChange={(e) => setListas({ ...listas, [l.key]: e.target.value })} />
              </label>
            ))}
            <p className="suave" style={{ margin: 0, fontSize: 12 }}>Separa con comas.</p>
          </Bloque>

          <Bloque titulo="Redes y reel">
            <label className="campo">Instagram<input autoCapitalize="none" value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} placeholder="@usuario" /></label>
            <label className="campo">TikTok<input autoCapitalize="none" value={f.tiktok} onChange={(e) => setF({ ...f, tiktok: e.target.value })} placeholder="@usuario" /></label>
            <label className="campo">Canal de YouTube<input type="url" autoCapitalize="none" value={f.youtube} onChange={(e) => setF({ ...f, youtube: e.target.value })} placeholder="https://youtube.com/@…" /></label>
            <label className="campo">Reel (video)<input type="url" autoCapitalize="none" value={f.reel} onChange={(e) => setF({ ...f, reel: e.target.value })} placeholder="https://youtu.be/…" /></label>
          </Bloque>

          <Bloque titulo="¿Quién lo ve?">
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, lineHeight: 1.5 }}>
              <input type="checkbox" checked={f.publico} onChange={(e) => setF({ ...f, publico: e.target.checked })} style={{ width: 22, height: 22, marginTop: 2, flexShrink: 0 }} />
              <span>Hacer público mi perfil en <b>/artistas/{pro?.slug || "tu-nombre"}</b>. Tu nombre en el elenco de las obras enlazará aquí. Nunca se muestran tu teléfono, correo ni datos del expediente.</span>
            </label>
            {datos.menor && (
              <p className="aviso" style={{ margin: 0 }}>Eres menor de edad: tu perfil solo será público cuando la producción registre el permiso de tu madre, padre o tutor.{pro?.tutor_autorizado_at ? " (Ya está registrado.)" : ""}</p>
            )}
            {pro && (
              <p className="suave" style={{ margin: 0, fontSize: 13 }}>Ahora: {esPublico
                ? <button className="liga" style={{ fontWeight: 800, color: "var(--texto)" }} onClick={() => navegar(`/artista/${pro.slug}`)}>público <Icono nombre="derecha" tamano={12} grosor={2} /></button>
                : "privado"}</p>
            )}
          </Bloque>

          <Aviso m={msg} />
          <button className="boton principal" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar perfil"}</button>

          <Bloque titulo={`Galería · ${datos.fotos.length} de 6`}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {datos.fotos.map((foto) => (
                <div key={foto.id} style={{ position: "relative", borderRadius: 14, overflow: "hidden" }}>
                  <img src={perfilUrl(foto.path)} alt="" style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", display: "block" }} />
                  <button aria-label="Quitar foto" onClick={() => quitarFoto(foto)} style={{ position: "absolute", top: 8, right: 8, width: 34, height: 34, borderRadius: 17, border: "none", background: "rgba(0,0,0,0.7)", color: "#ffffff", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>×</button>
                </div>
              ))}
            </div>
            {datos.fotos.length < 6 && (
              <label className="boton contorno" style={{ minHeight: 44, fontSize: 11, alignSelf: "flex-start" }}>
                {subiendo === "galeria" ? "Subiendo…" : "Agregar foto"}
                <input type="file" accept="image/*" hidden disabled={!!subiendo} onChange={(e) => { void subir("galeria", e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            )}
          </Bloque>
        </>
      )}
    </Marco>
  );
}
