import { iniciales, sellosDe, type PaseVista } from "@/lib/gafete-rules";
import { nivelDe } from "@/lib/lealtad-rules";
import { srcMarca } from "~/lib/cuenta";

// Gafete / credencial digital: el mismo diseño que la web (web/src/components/gafete/GafeteVista.tsx), con estilos de
// la app. Tema DARF (equipo y cuenta) o dorado (Club Fan). Sellos: Club Fan, medallas y Casa DARF.

const ORO = "#d7bb5f";

export function Gafete({ p }: { p: PaseVista }) {
  const fan = p.tema === "fan";
  const nivel = nivelDe(p.lealtad);
  const nivelFan = fan || p.sello ? nivelDe(p.fanVisitas, "fan") : null;
  const sellos = sellosDe(p);
  const linea = { marginTop: 4, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase" as const };
  return (
    <article aria-label={fan ? `Credencial Club Fan de ${p.nombre}` : `Credencial de ${p.nombre}`} style={{
      position: "relative", width: "min(340px, 86vw)", display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden", borderRadius: 26, color: "#ffffff",
      border: `1px solid ${fan ? "rgba(215,187,95,0.5)" : "#333333"}`,
      background: fan ? "radial-gradient(120% 70% at 50% 0%, rgba(215,187,95,0.28), transparent 60%), linear-gradient(170deg, #1a1622, #0b0910)" : "#0b0b0b",
      boxShadow: fan ? "0 30px 90px -30px rgba(215,187,95,0.45)" : "0 40px 100px -30px rgba(0,0,0,0.9)",
    }}>
      <img src={p.logo} alt={p.logoAlt} style={{ marginTop: 24, height: fan ? 40 : 48, width: "auto", maxWidth: fan ? 190 : 150 }} />
      {sellos.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", gap: 12, justifyContent: "center" }}>
          {sellos.map((s) => <img key={s.src} src={srcMarca(s.src)} alt={s.alt} style={{ width: 64, height: 64 }} />)}
        </div>
      )}
      <div style={{ marginTop: 16, width: 104, height: 104, borderRadius: 52, overflow: "hidden", background: "linear-gradient(160deg, #2a2236, #141019)", boxShadow: `0 0 0 ${fan ? 2 : 1}px ${fan ? "rgba(215,187,95,0.7)" : "rgba(255,255,255,0.1)"}` }}>
        {p.fotoUrl
          ? <img src={p.fotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900, color: fan ? "#f3e3a3" : "#999999" }}>{iniciales(p.nombre)}</span>}
      </div>
      <p style={{ margin: "16px 24px 0", textAlign: "center", fontSize: 22, fontWeight: 900, textTransform: "uppercase", lineHeight: 1.05 }}>{p.nombre}</p>
      <p style={{ margin: "8px 24px 0", textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: ORO }}>{p.titulo}</p>
      {p.qr && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ borderRadius: 16, background: "#ffffff", padding: 10 }}>
            <img src={p.qr} alt={`Código QR de ${p.nombre}`} style={{ width: 148, height: 148, imageRendering: "pixelated" }} />
          </div>
          {p.codigo && <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", color: fan ? "#f3e3a3" : "#bbbbbb" }}>{p.codigo}</span>}
        </div>
      )}
      <p style={{ margin: "8px 0 0", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "#8d8d99" }}>{p.pie}</p>
      {p.casa && <p style={{ ...linea, background: "linear-gradient(90deg,#ffb8ec,#c9b2ff,#9fe2ff,#b9ffe0,#ffe6a8)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{p.casa}</p>}
      {p.sello && <p style={{ ...linea, color: ORO }}>Club Fan · {p.sello}</p>}
      {nivelFan && <p style={{ ...linea, color: nivelFan.linea[0] }}>Fan Zone · {nivelFan.nombre}</p>}
      {nivel && <p style={{ ...linea, color: nivel.linea[0] }}>DARF Loyalty · {nivel.nombre}</p>}
      <div style={{
        marginTop: 16, width: "100%", padding: "12px 0", textAlign: "center", fontSize: 22, fontWeight: 900, fontStyle: "italic", letterSpacing: "0.08em",
        background: p.banda.degradado ? `linear-gradient(90deg, ${p.banda.degradado.map(([o, c]) => `${c} ${Math.round(o * 100)}%`).join(", ")})` : p.banda.fondo, color: p.banda.texto,
      }}>{p.banda.label}</div>
    </article>
  );
}
