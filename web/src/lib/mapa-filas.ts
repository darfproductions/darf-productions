// Letras de fila de un mapa (0114): en las dos puntas de cada fila de cada bloque. Puro; lo usan el mapa de la
// página (MapaPlano), la imagen de Difusión y el mapa de la taquilla. Pruebas en components/MapaPlano.test.ts.

/** Letras de fila en las dos puntas de cada tramo (una fila partida en bloques da un tramo por bloque). */
export function etiquetasFila(asientos: { x: number; y: number; numero: number | null; fila?: string | null; grupo?: string }[], dist = 17) {
  // Con grupo (el bloque), cada fila de cada bloque es un solo tramo aunque tenga huecos.
  const porFila = new Map<string, { x: number; y: number; n: number }[]>();
  const conGrupo = asientos.some((a) => a.grupo);
  for (const a of asientos) {
    if (!a.fila) continue;
    const k = conGrupo ? `${a.fila}\u0000${a.grupo ?? ""}` : a.fila;
    const l = porFila.get(k) ?? [];
    l.push({ x: a.x, y: a.y, n: a.numero ?? 0 });
    porFila.set(k, l);
  }
  const out: { fila: string; x: number; y: number }[] = [];
  const punta = (fila: string, a: { x: number; y: number }, b: { x: number; y: number } | undefined, lado: -1 | 1) => {
    if (!b) { out.push({ fila, x: a.x + lado * dist, y: a.y }); return; }
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    out.push({ fila, x: a.x + ((a.x - b.x) / d) * dist, y: a.y + ((a.y - b.y) / d) * dist });
  };
  for (const [clave, l] of porFila) {
    const fila = clave.split("\u0000")[0];
    l.sort((a, b) => a.n - b.n);
    // Un salto grande entre asientos seguidos es un pasillo: ahí empieza otro tramo.
    let tramo: typeof l = [];
    const cerrar = () => {
      if (!tramo.length) return;
      punta(fila, tramo[0], tramo[1], -1);
      if (tramo.length > 1) punta(fila, tramo[tramo.length - 1], tramo[tramo.length - 2], 1);
      tramo = [];
    };
    for (const a of l) {
      const prev = tramo[tramo.length - 1];
      if (prev && !conGrupo && Math.hypot(a.x - prev.x, a.y - prev.y) > 45) cerrar();
      tramo.push(a);
    }
    cerrar();
  }
  return out;
}
