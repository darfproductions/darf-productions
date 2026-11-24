import { Link, useNavigate } from "react-router";
import { numeroSocio } from "@/lib/fanzone-rules";
import { NIVEL } from "@/lib/credencial-rules";
import { Icono, type NombreIcono } from "~/componentes/Icono";
import { Lealtad } from "~/componentes/Lealtad";
import { useApariencia } from "~/lib/apariencia";
import { leerResumen } from "~/lib/cuenta";
import { env } from "~/lib/env";
import { supabase } from "~/lib/supabase";
import { nombreDe, useSesion } from "~/lib/sesion";
import type { Preferencia } from "~/lib/tema";
import { abrir, abrirWeb, useCarga } from "~/lib/usar";

// Mi cuenta: el centro de todo lo personal, como /cuenta en la web. Perfil, credencial con QR, lealtad (DARF Loyalty
// y Fan Zone), Club Fan con número de socio y acceso a cada sección: boletos, compras, eventos, ventas, honorarios,
// perfil profesional y notificaciones. Las secciones de ventas y honorarios solo aparecen a quien las tiene.

const APARIENCIAS: { id: Preferencia; texto: string; icono: NombreIcono }[] = [
  { id: "auto", texto: "Auto", icono: "auto" },
  { id: "dia", texto: "Día", icono: "sol" },
  { id: "noche", texto: "Noche", icono: "luna" },
];

export function Cuenta() {
  const { sesion } = useSesion();
  const navegar = useNavigate();
  const { preferencia, elegir } = useApariencia();
  const uid = sesion?.user.id ?? null;
  const { datos } = useCarga(() => (uid ? leerResumen(uid) : Promise.resolve(null)), [uid]);
  const nombre = datos?.perfil?.nombre ?? nombreDe(sesion);
  const c = datos?.credencial ?? null;
  const socio = c?.socio ?? null;
  const ventas = (datos?.ventas ?? []).filter((v) => v.production_id);

  return (
    <main className="pantalla">
      <div className="contenido">
        <h1 className="titulo-grande" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>Cuenta</h1>

        {sesion ? (
          <Link to="/cuenta/perfil" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14 }}>
            {datos?.foto
              ? <img src={datos.foto} alt="" style={{ width: 60, height: 60, borderRadius: 30, objectFit: "cover" }} />
              : <div aria-hidden="true" style={{ width: 60, height: 60, borderRadius: 30, background: "var(--degradado)", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, fontWeight: 900 }}>{(nombre ?? "D").charAt(0).toUpperCase()}</div>}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{nombre}</span>
              <span className="suave" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>{sesion.user.email}</span>
            </div>
            <span className="circulo" aria-label="Editar perfil"><Icono nombre="derecha" tamano={18} grosor={2} /></span>
          </Link>
        ) : (
          <div className="tarjeta" style={{ marginTop: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>Entra para ver tus boletos, tu credencial del Club y tus avisos.</p>
            <Link to="/acceso" className="boton principal">Entrar</Link>
          </div>
        )}

        {c && (
          <Link to="/cuenta/credencial" style={{
            marginTop: 16, padding: 16, borderRadius: 20, display: "flex", alignItems: "center", gap: 14,
            background: c.nivel === "club" ? "linear-gradient(160deg, #1a1622, #0b0910)" : "var(--tarjeta)",
            border: `1px solid ${c.nivel === "club" ? "rgba(215,187,95,0.45)" : "var(--linea)"}`, color: c.nivel === "club" ? "#ffffff" : "var(--texto)",
          }}>
            <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: c.nivel === "club" ? "linear-gradient(135deg,#8a6b1f,#d7bb5f,#f3e3a3)" : "linear-gradient(135deg,#340feb,#830886,#d20122)", color: c.nivel === "club" ? "#0b0b0b" : "#ffffff" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="8.5" cy="11" r="2" /><path d="M5.8 16c.6-1.5 1.6-2.2 2.7-2.2s2.1.7 2.7 2.2M14 10h4M14 13h4M14 16h2.5" /></svg>
            </span>
            <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: c.nivel === "club" ? "#f3e3a3" : undefined }}>{NIVEL[c.nivel].boton} con QR</span>
              <span style={{ fontSize: 12, lineHeight: 1.4, opacity: 0.8 }}>{NIVEL[c.nivel].ayuda}</span>
            </span>
            <Icono nombre="derecha" tamano={18} grosor={2} />
          </Link>
        )}

        {sesion && (
          <button onClick={() => navegar("/fan-zone")} style={{ marginTop: 12, padding: "14px 16px", borderRadius: 20, border: "none", background: "#d7bb5f", color: "#0b0b0b", display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>Club Fan DARF</span>
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>
                {socio ? `Socio ${numeroSocio(socio.numero)}${socio.fundador ? " · Fundador" : ""}` : "Únete: preventas, videos exclusivos y tu credencial dorada."}
              </span>
            </div>
            <Icono nombre="derecha" grosor={2} />
          </button>
        )}

        {sesion && (
          <>
            <Titulo>Boletos y compras</Titulo>
            <div className="tarjeta lista">
              <Fila icono="boletos" texto="Mis boletos" ayuda="Tus QR para entrar" onClick={() => navegar("/boletos")} />
              <Fila icono="lista" texto="Transacciones" ayuda="Pagos, apartados y su estado" onClick={() => navegar("/cuenta/transacciones")} />
              <Fila icono="estrella" texto="Mis eventos" ayuda="Lugares apartados y a los que fuiste" onClick={() => navegar("/cuenta/eventos")} />
            </div>

            <Titulo>Club Fan</Titulo>
            <div className="tarjeta lista">
              <Fila icono="estrella" texto="Zona Fans" ayuda="Ensayos, preventas y eventos del club" onClick={() => navegar("/fan-zone")} />
              <Fila icono="calendario" texto="Eventos" ayuda="Foto con el elenco, tours y más" onClick={() => navegar("/eventos")} />
            </div>

            <Titulo>En escena con DARF</Titulo>
            <div className="tarjeta lista">
              <Fila icono="microfono" texto="Mis audiciones" ayuda="Convocatorias, inscripción y tu QR" onClick={() => navegar("/audiciones")} />
              <Fila icono="cuenta" texto="Perfil profesional" ayuda="Lo que ven directores y público" onClick={() => navegar("/cuenta/perfil-profesional")} />
              {ventas.length > 0 && <Fila icono="flecha" texto="Mis ventas" ayuda={`${ventas.reduce((n, v) => n + v.boletos, 0)} boletos con tu código`} onClick={() => navegar("/cuenta/ventas")} />}
              {datos?.honorarios && <Fila icono="wallet" texto="Mis honorarios" ayuda="Cómo cobras y lo que te han pagado" onClick={() => navegar("/cuenta/honorarios")} />}
            </div>

            {c && ((c.lealtad ?? 0) > 0 || (c.fan_visitas ?? 0) > 0) && (
              <>
                <Titulo>Tu camino en DARF</Titulo>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Lealtad n={c.lealtad ?? 0} programa="equipo" />
                  <Lealtad n={c.fan_visitas ?? 0} programa="fan" socio={!!datos?.socio} unirse={() => navegar("/fan-zone")} />
                </div>
              </>
            )}
          </>
        )}

        <Titulo>Ajustes</Titulo>
        <div role="radiogroup" aria-label="Apariencia" className="segmentos">
          {APARIENCIAS.map((a) => (
            <button key={a.id} role="radio" aria-checked={preferencia === a.id} onClick={() => elegir(a.id)}>
              <Icono nombre={a.icono} tamano={15} grosor={2} />{a.texto}
            </button>
          ))}
        </div>
        {sesion && (
          <div className="tarjeta lista" style={{ marginTop: 10 }}>
            <Fila icono="cuenta" texto="Mis datos y foto" onClick={() => navegar("/cuenta/perfil")} />
            <Fila icono="campana" texto="Notificaciones" onClick={() => navegar("/notificaciones")} />
          </div>
        )}

        <Titulo>DARF Productions</Titulo>
        <div className="tarjeta lista">
          <Fila icono="estrella" texto="Conoce al equipo" onClick={() => navegar("/nosotros")} />
          <Fila icono="correo" texto="Contacto" onClick={() => navegar("/contacto")} />
          {env.whatsapp && <Fila icono="whatsapp" texto="WhatsApp" ayuda="+52 446 522 0560" onClick={() => abrir(`https://wa.me/${env.whatsapp}`)} />}
          <Fila icono="lista" texto="Aviso de privacidad" onClick={() => abrirWeb("/privacidad")} />
          <Fila icono="lista" texto="Términos y condiciones" onClick={() => abrirWeb("/terminos")} />
        </div>

        {sesion && (
          <div className="tarjeta lista" style={{ marginTop: 12 }}>
            <button className="fila" style={{ justifyContent: "center" }} onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
            <Link to="/cuenta/eliminar" className="fila" style={{ justifyContent: "center", color: "var(--acento)", fontWeight: 700 }}>Eliminar mi cuenta</Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Titulo({ children }: { children: string }) {
  return <h2 className="suave" style={{ margin: "22px 0 8px", fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>{children}</h2>;
}

function Fila({ icono, texto, ayuda, onClick }: { icono: NombreIcono; texto: string; ayuda?: string; onClick: () => void }) {
  return (
    <button className="fila" onClick={onClick}>
      <Icono nombre={icono} tamano={20} color="var(--acento)" />
      <span className="crece" style={{ display: "flex", flexDirection: "column", gap: 1, textAlign: "left" }}>
        <span>{texto}</span>
        {ayuda && <span className="suave" style={{ fontSize: 12, fontWeight: 500 }}>{ayuda}</span>}
      </span>
      <Icono nombre="derecha" tamano={18} color="var(--suave)" grosor={2} />
    </button>
  );
}
