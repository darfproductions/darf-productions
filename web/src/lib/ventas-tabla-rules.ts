// Tabla de ventas (2026-11-02): como la hoja de Excel de Diego, una fila por orden y tipo de boleto, con sus totales,
// para cuadrar lo que dice la página contra lo que se cobró. Puro, con pruebas en ventas-tabla-rules.test.ts.
// El "neto" de cada fila es su parte de lo que pagó la orden (descuentos repartidos según el precio), igual que la
// tabla "Venta por zona" (0132): así los totales cuadran con "Ingresos aprobados".

export type OrdenTabla = {
  id: string; order_code: string; performance_id: string; status: string; created_at: string;
  buyer_nombre: string; buyer_telefono: string; total: number; metodo_pago: string | null; referencia: string | null;
  vendedor: string | null;
  /** Solo los boletos activos. */
  boletos: { zona_id: string | null; precio: number }[];
};

export type FilaTabla = {
  key: string; orderId: string; codigo: string; fecha: string; funcionId: string; estado: string;
  zonaId: string | null; zona: string; cantidad: number; precio: number; bruto: number; neto: number;
  comprador: string; telefono: string; vendedor: string | null; metodo: string | null; referencia: string | null;
};

export type TotalesTabla = {
  boletos: number; bruto: number; neto: number; descuentos: number; ordenes: number;
  porMetodo: { metodo: string | null; boletos: number; neto: number }[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Filas por orden y tipo de boleto (zona y precio). Órdenes sin boletos activos no salen. */
export function filasTabla(ordenes: OrdenTabla[], zonas: { id: string; nombre: string; orden?: number }[]): FilaTabla[] {
  const zona = new Map(zonas.map((z, i) => [z.id, { nombre: z.nombre, orden: z.orden ?? i }]));
  const filas: FilaTabla[] = [];
  for (const o of ordenes) {
    if (!o.boletos.length) continue;
    const lista = o.boletos.reduce((s, b) => s + b.precio, 0);
    const grupos = new Map<string, { zonaId: string | null; precio: number; cantidad: number }>();
    for (const b of o.boletos) {
      const k = `${b.zona_id ?? ""}|${b.precio}`;
      const g = grupos.get(k) ?? { zonaId: b.zona_id, precio: b.precio, cantidad: 0 };
      g.cantidad += 1;
      grupos.set(k, g);
    }
    const ordenados = [...grupos.values()].sort((a, b) => (zona.get(a.zonaId ?? "")?.orden ?? 999) - (zona.get(b.zonaId ?? "")?.orden ?? 999) || b.precio - a.precio);
    // El neto se reparte por precio; el último grupo se lleva el redondeo para que la orden sume exacto.
    let resto = r2(o.total);
    ordenados.forEach((g, i) => {
      const bruto = r2(g.precio * g.cantidad);
      const neto = i === ordenados.length - 1 ? resto
        : r2(lista > 0 ? (o.total * bruto) / lista : o.total * (g.cantidad / o.boletos.length));
      resto = r2(resto - neto);
      filas.push({
        key: `${o.id}|${g.zonaId ?? ""}|${g.precio}`, orderId: o.id, codigo: o.order_code, fecha: o.created_at, funcionId: o.performance_id,
        estado: o.status, zonaId: g.zonaId, zona: zona.get(g.zonaId ?? "")?.nombre ?? "Sin zona", cantidad: g.cantidad, precio: g.precio,
        bruto, neto, comprador: o.buyer_nombre, telefono: o.buyer_telefono, vendedor: o.vendedor, metodo: o.metodo_pago, referencia: o.referencia,
      });
    });
  }
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.codigo.localeCompare(b.codigo));
}

/** Filtro de la tabla: una función (o todas) y si se incluyen las órdenes por aprobar. */
export function filtrarTabla(filas: FilaTabla[], f: { funcion: string; pendientes: boolean }): FilaTabla[] {
  return filas.filter((x) => (!f.funcion || x.funcionId === f.funcion) && (x.estado === "aprobado" || (f.pendientes && x.estado === "pendiente")));
}

export function totalesTabla(filas: FilaTabla[]): TotalesTabla {
  const metodos = new Map<string | null, { metodo: string | null; boletos: number; neto: number }>();
  let boletos = 0, bruto = 0, neto = 0;
  for (const x of filas) {
    boletos += x.cantidad; bruto += x.bruto; neto += x.neto;
    const m = metodos.get(x.metodo) ?? { metodo: x.metodo, boletos: 0, neto: 0 };
    m.boletos += x.cantidad; m.neto = r2(m.neto + x.neto);
    metodos.set(x.metodo, m);
  }
  return {
    boletos, bruto: r2(bruto), neto: r2(neto), descuentos: r2(bruto - neto), ordenes: new Set(filas.map((x) => x.orderId)).size,
    porMetodo: [...metodos.values()].sort((a, b) => b.neto - a.neto),
  };
}

export type ZonaResumen = {
  id: string | null; nombre: string; boletos: number; cortesias: number; porAprobar: number; dinero: number; filas: FilaTabla[];
};

/** "Venta por zona" con el detalle de órdenes de cada zona (ya filtradas). Las zonas de la obra salen todas, en su
 *  orden, aunque no tengan venta; "Sin zona" al final solo si hay boletos así.
 *  boletos = pagados (sin cortesías); dinero = lo cobrado de las filas incluidas. */
export function resumenZonas(filas: FilaTabla[], zonas: { id: string; nombre: string }[]): ZonaResumen[] {
  const res = new Map<string | null, ZonaResumen>();
  for (const z of zonas) res.set(z.id, { id: z.id, nombre: z.nombre, boletos: 0, cortesias: 0, porAprobar: 0, dinero: 0, filas: [] });
  for (const f of filas) {
    const z = res.get(f.zonaId) ?? { id: f.zonaId, nombre: "Sin zona", boletos: 0, cortesias: 0, porAprobar: 0, dinero: 0, filas: [] };
    if (f.estado === "pendiente") z.porAprobar += f.cantidad;
    else if (f.metodo === "cortesia") z.cortesias += f.cantidad;
    else z.boletos += f.cantidad;
    z.dinero = r2(z.dinero + f.neto);
    z.filas.push(f);
    res.set(f.zonaId, z);
  }
  return [...res.values()];
}

/** Filas para descargar en Excel (CSV), con los mismos filtros que la pantalla. */
export function filasExcel(filas: (FilaTabla & { fechaTexto: string; funcionTexto: string })[], metodoLabel: (m: string | null) => string | null): (string | number | null)[][] {
  return [
    ["Fecha de venta", "Función", "Tipo de boleto", "Cantidad", "Precio unitario", "Total bruto", "Total cobrado", "Método de pago", "Orden", "Comprador", "Teléfono", "Vendedor", "Estado"],
    ...filas.map((f) => [f.fechaTexto, f.funcionTexto, f.zona, f.cantidad, f.precio, f.bruto, f.neto, metodoLabel(f.metodo) ?? "", f.codigo, f.comprador, f.telefono, f.vendedor ?? "",
      f.estado === "pendiente" ? "Por aprobar" : "Aprobada"]),
  ];
}
