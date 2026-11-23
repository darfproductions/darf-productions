import { cuantas, medallaSrc, nivelDe, PROGRAMA, siguienteMeta, type Programa } from "@/lib/lealtad-rules";
import { srcMarca } from "~/lib/cuenta";

// Barra de lealtad de Mi cuenta (igual que web/src/components/credencial/BarraLealtad.tsx): DARF Loyalty (producciones
// en el equipo o el elenco) o DARF Fan Zone (funciones y eventos a los que entraste; la medalla se desbloquea siendo
// socio del Club Fan).

export function Lealtad({ n, programa, socio = true, unirse }: { n: number; programa: Programa; socio?: boolean; unirse?: () => void }) {
  if (n < 1) return null;
  const prog = PROGRAMA[programa];
  const bloqueada = !socio;
  const nivel = bloqueada ? null : nivelDe(n, programa);
  const meta = siguienteMeta(n, programa);
  const siguiente = meta?.nivel ?? null;
  const pct = Math.round((meta ? meta.progreso : 1) * 100);
  const primero = prog.niveles[0];
  const ganado = nivelDe(n, programa);
  const color = (nivel ?? siguiente ?? primero).linea[1];

  return (
    <section aria-label={prog.titulo} className="tarjeta" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <img src={srcMarca(medallaSrc(nivel ? n : (ganado?.min ?? primero.min), programa))} alt={nivel ? `Medalla ${nivel.nombre}` : `Medalla ${(ganado ?? primero).nombre} (bloqueada)`}
          style={{ width: 60, height: 60, flexShrink: 0, opacity: nivel ? 1 : 0.4, filter: nivel ? undefined : "grayscale(1)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>{prog.titulo}</h2>
          <p className="suave" style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>
            {nivel ? <><b style={{ color: "var(--texto)" }}>{nivel.nombre}</b> · {nivel.material}</> : ganado ? <><b style={{ color: "var(--texto)" }}>{ganado.nombre}</b> · bloqueada</> : "Tu camino empieza"} · {cuantas(n, programa)}
          </p>
        </div>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={siguiente ? `Avance hacia ${siguiente.nombre}` : "Nivel máximo"}
        style={{ height: 10, borderRadius: 5, background: "var(--linea-2, var(--linea))", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(pct, 4)}%`, height: "100%", borderRadius: 5, background: `linear-gradient(90deg, ${color}, ${(siguiente ?? ganado ?? primero).linea[1]})` }} />
      </div>
      <p className="suave" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        {siguiente && meta
          ? <>Siguiente meta: <b style={{ color: "var(--texto)" }}>{siguiente.nombre}</b> ({siguiente.material}) en {siguiente.min} · te {meta.faltan === 1 ? `falta ${cuantas(1, programa)}` : `faltan ${cuantas(meta.faltan, programa)}`}</>
          : <>Llegaste a la cima: <b style={{ color: "var(--texto)" }}>{prog.niveles.at(-1)!.nombre}</b>. Gracias por tanto.</>}
      </p>
      {programa === "fan" && <p className="suave" style={{ margin: 0, fontSize: 12 }}>Cuenta cada función a la que entras con tu boleto y cada evento de Fan Zone al que llegas.</p>}
      {bloqueada && (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          {ganado ? <>Ya ganaste <b>{ganado.nombre}</b>. </> : null}
          <button className="liga" onClick={unirse} style={{ color: "var(--dorado-texto)", fontWeight: 800, textDecoration: "none" }}>Hazte socio del Club Fan</button> para desbloquear tu medalla.
        </p>
      )}
    </section>
  );
}
