/* eslint-disable @next/next/no-img-element -- la medalla es un PNG generado */
import Link from "next/link";
import { cuantas, medallaSrc, nivelDe, PROGRAMA, siguienteMeta, type Programa } from "@/lib/lealtad-rules";

// Medallas (Diego 2026-10-14): DARF Loyalty del equipo (0103) en Mi cuenta, desde la primera producción;
// la de fans (0104) solo en la Fan Zone, desde la primera función o evento. Muestran la medalla (si ya la tiene),
// el número y la barra hacia la siguiente meta. La de fans solo se gana siendo socio del Club Fan:
// si aún no lo es, ve su avance y la invitación a unirse.
export function BarraLealtad({ n, programa = "equipo", socio = true }: { n: number; programa?: Programa; socio?: boolean }) {
  if (n < 1) return null;
  const prog = PROGRAMA[programa];
  const bloqueada = !socio;
  const nivel = bloqueada ? null : nivelDe(n, programa);
  const meta = siguienteMeta(n, programa);
  const siguiente = meta?.nivel ?? null;
  const pct = Math.round((meta ? meta.progreso : 1) * 100);
  const primero = prog.niveles[0];
  const color = (nivel ?? siguiente ?? primero).linea[1];
  const id = `lealtad-${programa}`;
  const ganado = nivelDe(n, programa);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-2xl bg-telon p-6">
      <div className="flex items-center gap-4">
        <img src={medallaSrc(nivel ? n : (ganado?.min ?? primero.min), programa)} alt={nivel ? `Medalla ${nivel.nombre}` : `Medalla ${(ganado ?? primero).nombre} (bloqueada)`}
          className={`h-16 w-16 shrink-0 ${nivel ? "" : "opacity-40 grayscale"}`} />
        <div className="flex flex-col gap-0.5">
          <h2 id={id} className="text-lg font-bold">{prog.titulo}</h2>
          <p className="text-sm text-texto-2">
            {nivel ? <><b className="text-texto">{nivel.nombre}</b> · {nivel.material}</>
              : ganado ? <><b className="text-texto">{ganado.nombre}</b> · bloqueada</> : "Tu camino empieza"} · {cuantas(n, programa)}
          </p>
        </div>
      </div>
      <div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
          aria-label={siguiente ? `Avance hacia ${siguiente.nombre}` : "Nivel máximo"}>
          <div className="h-full rounded-full" style={{ width: `${Math.max(pct, 4)}%`, background: `linear-gradient(90deg, ${color}, ${(siguiente ?? ganado ?? primero).linea[1]})` }} />
        </div>
        <p className="mt-2 text-sm text-texto-2">
          {siguiente && meta
            ? <>Siguiente meta: <b className="text-texto">{siguiente.nombre}</b> ({siguiente.material}) en {siguiente.min} · te {meta.faltan === 1 ? `falta ${cuantas(1, programa)}` : `faltan ${cuantas(meta.faltan, programa)}`}</>
            : <>Llegaste a la cima: <b className="text-texto">{prog.niveles.at(-1)!.nombre}</b>. Gracias por tanto.</>}
        </p>
        {programa === "fan" && <p className="mt-1 text-xs text-texto-3">Cuenta cada función a la que entras con tu boleto y cada evento de Fan Zone al que llegas.</p>}
        {bloqueada && (
          <p className="mt-3 text-sm">
            {ganado ? <>Ya ganaste <b>{ganado.nombre}</b>. </> : null}
            <Link href="/club-fan" className="font-bold text-oro">Hazte socio del Club Fan</Link> para desbloquear tu medalla en tu credencial y en Wallet.
          </p>
        )}
      </div>
    </section>
  );
}
