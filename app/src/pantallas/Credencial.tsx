import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { NIVEL, paseCredencial } from "@/lib/credencial-rules";
import { paseEnPdf } from "@/components/gafete/gafete-canvas";
import { Gafete } from "~/componentes/Gafete";
import { agregarAWallet, guardarPdf, walletDelTelefono } from "~/lib/archivos";
import { Icono } from "~/componentes/Icono";
import { fotoPerfil, leerCredencial, leerPerfil } from "~/lib/cuenta";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { abrir, useCarga } from "~/lib/usar";

// Mi credencial (0083): una sola por persona, mismo QR para ensayos y la entrada de los eventos. Se dibuja según su
// nivel más alto: gafete del equipo, credencial dorada del Club Fan o la básica de la cuenta. Como en la web, el
// equipo elige qué ve quien la escanea y cualquiera puede hacer un código nuevo.

export function Credencial() {
  const { sesion, cargando: cargandoSesion } = useSesion();
  const uid = sesion?.user.id ?? null;
  const [version, setVersion] = useState(0);
  const [ajustes, setAjustes] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"wallet" | "pdf" | null>(null);
  const wallet = walletDelTelefono();
  const { datos, error, cargando } = useCarga(async () => {
    if (!uid) return null;
    const [c, perfil] = await Promise.all([leerCredencial(), leerPerfil(uid)]);
    return c ? { c, perfil, foto: await fotoPerfil(perfil?.foto_path) } : null;
  }, [uid, version]);
  const [compartir, setCompartir] = useState({ telefono: false, correo: false, instagram: false, perfil: false });
  useEffect(() => {
    if (datos?.c) setCompartir({ telefono: datos.c.compartir_telefono, correo: datos.c.compartir_correo, instagram: datos.c.compartir_instagram, perfil: datos.c.compartir_perfil });
  }, [datos]);

  if (!cargandoSesion && !sesion) return <Navigate to="/acceso" replace />;

  const regenerar = async () => {
    if (!window.confirm("¿Hacer un código nuevo? El anterior dejará de servir.")) return;
    const { error } = await supabase.rpc("badge_regenerar");
    setAviso(error ? error.message : "Código nuevo listo. El anterior ya no sirve.");
    if (!error) setVersion((v) => v + 1);
  };
  const guardar = async () => {
    const { error } = await supabase.rpc("badge_compartir", { p_tel: compartir.telefono, p_correo: compartir.correo, p_insta: compartir.instagram, p_perfil: compartir.perfil });
    setAviso(error ? error.message : "Listo: así se verá tu credencial al escanearla.");
  };

  const pase = datos ? paseCredencial({ ...datos.c, nombre: datos.perfil?.nombre ?? "", fotoUrl: datos.foto }) : null;

  return (
    <main className="pantalla sin-barra" style={{ background: "#050407", color: "#ffffff", minHeight: "100dvh" }}>
      <div className="contenido" style={{ alignItems: "center", gap: 18 }}>
        <div style={{ alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link to="/cuenta" className="circulo vidrio" aria-label="Volver"><Icono nombre="atras" /></Link>
          <span style={{ fontSize: 15, fontWeight: 800 }}>{datos ? NIVEL[datos.c.nivel].boton : "Mi credencial"}</span>
          <span style={{ width: 44 }} />
        </div>

        {cargando && <div className="esqueleto" style={{ width: 300, height: 560, borderRadius: 26 }} />}
        {error && <p className="aviso error">No pudimos cargar tu credencial. Revisa tu conexión.</p>}
        {!cargando && !datos && !error && <p className="aviso">Esta cuenta no tiene credencial.</p>}

        {datos && pase && (
          <>
            <Gafete p={pase} />
            {wallet && (
              <button onClick={async () => {
                setOcupado("wallet"); setAviso(null);
                try { const m = await agregarAWallet("credencial"); if (m) setAviso(m); } catch (e) { setAviso(e instanceof Error ? e.message : String(e)); } finally { setOcupado(null); }
              }} disabled={!!ocupado} aria-label={wallet === "apple" ? "Añadir a Apple Wallet" : "Agregar a Google Wallet"}
                style={{ minHeight: 52, padding: "0 22px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.35)", background: "#000000", color: "#ffffff", display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                <Icono nombre="wallet" tamano={22} />{ocupado === "wallet" ? "Preparando tu pase…" : wallet === "apple" ? "Añadir a Apple Wallet" : "Agregar a Google Wallet"}
              </button>
            )}
            <p style={{ margin: 0, maxWidth: 340, textAlign: "center", fontSize: 14, lineHeight: 1.6, color: "#bbbbbb" }}>
              {NIVEL[datos.c.nivel].ayuda} Sube el brillo de tu pantalla para que el QR se lea fácil.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
              {datos.c.nivel === "equipo" && (
                <button className="boton" onClick={() => setAjustes(!ajustes)} aria-expanded={ajustes} style={{ minHeight: 44, background: "transparent", border: "1.5px solid rgba(255,255,255,0.3)", color: "#ffffff", fontSize: 12 }}>Qué compartir</button>
              )}
              <button className="boton" disabled={!!ocupado} onClick={async () => {
                setOcupado("pdf"); setAviso(null);
                const nombre = datos.c.nivel === "equipo" ? `gafete-darf-${datos.c.codigo}.pdf` : datos.c.nivel === "club" ? `credencial-club-fan-${datos.c.codigo}.pdf` : `credencial-darf-${datos.c.codigo}.pdf`;
                try { await guardarPdf(await paseEnPdf(pase), nombre); } catch { setAviso("No se pudo preparar el PDF. Intenta de nuevo."); } finally { setOcupado(null); }
              }} style={{ minHeight: 44, background: "transparent", border: "1.5px solid rgba(255,255,255,0.3)", color: "#ffffff", fontSize: 12 }}>{ocupado === "pdf" ? "Preparando…" : "Descargar PDF"}</button>
              <button className="boton" onClick={() => abrir(datos.c.liga)} style={{ minHeight: 44, background: "transparent", border: "1.5px solid rgba(255,255,255,0.3)", color: "#ffffff", fontSize: 12 }}>Ver cómo la ven</button>
            </div>

            {ajustes && datos.c.nivel === "equipo" && (
              <div style={{ width: "min(420px, 92vw)", display: "flex", flexDirection: "column", gap: 12, padding: 18, borderRadius: 22, background: "#16141c", border: "1px solid #2a2a33", fontSize: 14 }}>
                <p style={{ margin: 0, color: "#bbbbbb", lineHeight: 1.5 }}>Cuando alguien escanee tu credencial con su celular verá tu nombre y tu papel, y además:</p>
                {([["telefono", "Mi teléfono"], ["correo", "Mi correo"], ["instagram", "Mi Instagram (de mi perfil profesional)"], ["perfil", "Liga a mi perfil profesional (si es público)"]] as const).map(([k, t]) => (
                  <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 32 }}>
                    <input type="checkbox" checked={compartir[k]} onChange={(e) => setCompartir({ ...compartir, [k]: e.target.checked })} style={{ width: 20, height: 20 }} />{t}
                  </label>
                ))}
                <p style={{ margin: 0, fontSize: 12, color: "#8d8d99" }}>Si eres menor de edad, tu teléfono y correo no se comparten aunque los marques.</p>
                <button className="boton principal" onClick={guardar} style={{ minHeight: 44, alignSelf: "flex-start" }}>Guardar</button>
              </div>
            )}

            <button onClick={regenerar} className="liga" style={{ fontSize: 12, fontWeight: 700, color: "#8d8d99" }}>Regenerar código</button>
            {aviso && <p role="status" style={{ margin: 0, fontSize: 13, color: "#bbbbbb", textAlign: "center" }}>{aviso}</p>}
          </>
        )}
      </div>
    </main>
  );
}
