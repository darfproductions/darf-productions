import { Link } from "react-router";
import { Icono, type NombreIcono } from "~/componentes/Icono";
import { useApariencia } from "~/lib/apariencia";
import { env } from "~/lib/env";
import { supabase } from "~/lib/supabase";
import { nombreDe, useSesion } from "~/lib/sesion";
import type { Preferencia } from "~/lib/tema";
import { abrir, abrirWeb } from "~/lib/usar";

const APARIENCIAS: { id: Preferencia; texto: string; icono: NombreIcono }[] = [
  { id: "auto", texto: "Auto", icono: "auto" },
  { id: "dia", texto: "Día", icono: "sol" },
  { id: "noche", texto: "Noche", icono: "luna" },
];

export function Cuenta() {
  const { sesion } = useSesion();
  const { preferencia, elegir } = useApariencia();
  const nombre = nombreDe(sesion);
  const inicial = (nombre ?? "D").charAt(0).toUpperCase();

  return (
    <main className="pantalla">
      <div className="contenido">
        <h1 className="titulo-grande" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>Cuenta</h1>

        {sesion ? (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 14 }}>
            <div aria-hidden="true" style={{ width: 56, height: 56, borderRadius: 28, background: "var(--degradado)", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900 }}>{inicial}</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 800 }}>{nombre}</span>
              <span className="suave" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>{sesion.user.email}</span>
            </div>
          </div>
        ) : (
          <div className="tarjeta" style={{ marginTop: 12, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>Entra para ver tus boletos, tu credencial del Club y tus avisos.</p>
            <Link to="/acceso" className="boton principal">Entrar</Link>
          </div>
        )}

        <button onClick={() => abrirWeb("/club-fan")} style={{ marginTop: 16, padding: "14px 16px", borderRadius: 20, border: "none", background: "#d7bb5f", color: "#0b0b0b", display: "flex", alignItems: "center", gap: 12, textAlign: "left", cursor: "pointer" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>Club de Fans DARF</span>
            <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>Preventas, videos exclusivos y tu credencial.</span>
          </div>
          <Icono nombre="derecha" grosor={2} />
        </button>

        <h2 className="suave" style={{ margin: "18px 0 0", fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>Apariencia</h2>
        <div role="radiogroup" aria-label="Apariencia" className="segmentos" style={{ marginTop: 8 }}>
          {APARIENCIAS.map((a) => (
            <button key={a.id} role="radio" aria-checked={preferencia === a.id} onClick={() => elegir(a.id)}>
              <Icono nombre={a.icono} tamano={15} grosor={2} />{a.texto}
            </button>
          ))}
        </div>

        <div className="tarjeta lista" style={{ marginTop: 16 }}>
          {sesion && <Fila icono="lista" texto="Historial de compras" onClick={() => abrirWeb("/cuenta/transacciones")} />}
          {sesion && <Fila icono="campana" texto="Notificaciones" onClick={() => abrirWeb("/cuenta/notificaciones")} />}
          {env.whatsapp && <Fila icono="whatsapp" texto="Contacto por WhatsApp" onClick={() => abrir(`https://wa.me/${env.whatsapp}`)} />}
          <Fila icono="correo" texto="Contacto" onClick={() => abrirWeb("/contacto")} />
        </div>

        {sesion && (
          <div className="tarjeta lista" style={{ marginTop: 12 }}>
            <button className="fila" style={{ justifyContent: "center" }} onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
            <button className="fila" style={{ justifyContent: "center", color: "var(--acento)", fontWeight: 700 }} onClick={() => abrirWeb("/cuenta/eliminar")}>Eliminar mi cuenta</button>
          </div>
        )}
      </div>
    </main>
  );
}

function Fila({ icono, texto, onClick }: { icono: NombreIcono; texto: string; onClick: () => void }) {
  return (
    <button className="fila" onClick={onClick}>
      <Icono nombre={icono} tamano={20} color="var(--suave)" />
      <span className="crece">{texto}</span>
      <Icono nombre="derecha" tamano={18} color="var(--suave)" grosor={2} />
    </button>
  );
}
