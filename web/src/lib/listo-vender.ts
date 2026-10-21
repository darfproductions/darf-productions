// "Listo para vender" (Bloque 4C): lo que una obra necesita antes de abrir la venta, con liga a
// donde se arregla cada cosa. Puro, con pruebas en listo-vender.test.ts.

export type FuncionVenta = {
  id: string;
  starts_at: string | null;
  on_sale: boolean;
  cancelada_at: string | null;
  prices: { categoryId: string }[];
};

export type ZonaVenta = { id: string; nombre: string; is_active: boolean; cupo: number | null };

export type DatosVenta = {
  pid: string;
  estado: string;
  kitFaltan: string[];
  funciones: FuncionVenta[];
  zonas: ZonaVenta[];
  /** Asientos activos del mapa: cuántos hay, cuántos sin zona de precio y qué zonas usan. */
  asientos: { total: number; sinZona: number; zonas: string[] };
  whatsapp: boolean;
  posterDestacado: boolean;
  /** 0120: funciones publicadas (sin publicar el público no las ve). Sin dato = publicadas. */
  funcionesPublicadas?: boolean;
  /** 0108: Reparto y Ensamble aún sin publicar (no impide vender). */
  elencoSinPublicar?: number;
  /** Fecha corta para los mensajes ("sáb 18 oct, 7:00 p.m."). */
  fecha: (iso: string) => string;
  ahora?: Date;
};

export type Punto = { clave: string; texto: string; ok: boolean; obligatorio: boolean; detalle?: string; href: string };

export function listoParaVender(d: DatosVenta): { puntos: Punto[]; listo: boolean; faltan: number } {
  const ahora = (d.ahora ?? new Date()).getTime();
  const base = `/panel/producciones/${d.pid}`;
  const futuras = d.funciones.filter((f) => !f.cancelada_at && f.starts_at && new Date(f.starts_at).getTime() > ahora);
  const enVenta = futuras.filter((f) => f.on_sale);
  const activas = new Map(d.zonas.filter((z) => z.is_active).map((z) => [z.id, z]));
  // Zonas que se venden: las del mapa (con asientos) y las de entrada general (con cupo).
  const requeridas = [...new Set([...d.asientos.zonas.filter((z) => activas.has(z)), ...[...activas.values()].filter((z) => z.cupo != null).map((z) => z.id)])];
  const hayLugares = d.asientos.total > 0 || [...activas.values()].some((z) => z.cupo != null && z.cupo > 0);
  const sinPrecio = futuras
    .map((f) => ({ f, faltan: requeridas.filter((z) => !f.prices.some((p) => p.categoryId === z)).map((z) => activas.get(z)?.nombre ?? "zona") }))
    .filter((x) => x.faltan.length);

  const puntos: Punto[] = [
    { clave: "publicada", texto: "La obra está publicada", ok: d.estado === "publicada", obligatorio: true,
      detalle: d.estado === "publicada" ? undefined : `Ahora está: ${d.estado}.`, href: `${base}/pagina#estado` },
    { clave: "kit", texto: "Kit visual completo (logo, imagen y colores)", ok: d.kitFaltan.length === 0, obligatorio: true,
      detalle: d.kitFaltan.join(" ") || undefined, href: `${base}/pagina#kit` },
    { clave: "funciones", texto: "Hay funciones con fecha próxima", ok: futuras.length > 0, obligatorio: true, href: `${base}/boletos/funciones` },
    { clave: "funciones_publicadas", texto: "Las funciones están publicadas en la página", ok: d.funcionesPublicadas !== false, obligatorio: true,
      detalle: d.funcionesPublicadas === false ? "Están ocultas: el público no ve fechas ni puede comprar. Publícalas en Funciones y precios." : undefined, href: `${base}/boletos/funciones` },
    { clave: "lugares", texto: "Hay lugares para vender (mapa de asientos o zonas con cupo)", ok: hayLugares, obligatorio: true, href: `${base}/boletos/funciones#zonas` },
    { clave: "zonas", texto: "Todos los asientos tienen zona de precio", ok: d.asientos.sinZona === 0, obligatorio: true,
      detalle: d.asientos.sinZona ? `${d.asientos.sinZona} ${d.asientos.sinZona === 1 ? "asiento sin zona" : "asientos sin zona"}.` : undefined, href: `${base}/boletos/mapa` },
    { clave: "precios", texto: "Cada función tiene precio en todas sus zonas", ok: futuras.length > 0 && requeridas.length > 0 && sinPrecio.length === 0, obligatorio: true,
      detalle: requeridas.length === 0 ? "Aún no hay zonas de precio." : sinPrecio.slice(0, 3).map((x) => `${d.fecha(x.f.starts_at!)}: falta ${x.faltan.join(", ")}`).join(" · ") + (sinPrecio.length > 3 ? ` · y ${sinPrecio.length - 3} más` : "") || undefined,
      href: `${base}/boletos/funciones` },
    { clave: "venta", texto: "La venta está abierta en al menos una función", ok: enVenta.length > 0, obligatorio: true, href: `${base}/boletos/funciones` },
    { clave: "whatsapp", texto: "Número de WhatsApp para recibir los pagos", ok: d.whatsapp, obligatorio: true,
      detalle: d.whatsapp ? undefined : "Es un ajuste del sitio: pídeselo a quien administra la página.", href: `${base}/boletos` },
    { clave: "poster", texto: "Póster oficial para la portada (16:9 o 4:3, solo imagen)", ok: d.posterDestacado, obligatorio: false,
      detalle: d.posterDestacado ? undefined : "Sin él, la portada usa la imagen de ambiente.", href: `${base}/pagina#poster` },
    { clave: "elenco", texto: "Todo el Reparto y Ensamble está publicado", ok: !d.elencoSinPublicar, obligatorio: false,
      detalle: d.elencoSinPublicar ? `${d.elencoSinPublicar === 1 ? "1 persona sin publicar" : `${d.elencoSinPublicar} personas sin publicar`}: no salen en la página.` : undefined,
      href: `${base}/elenco` },
  ];
  const faltan = puntos.filter((p) => p.obligatorio && !p.ok).length;
  return { puntos, listo: faltan === 0, faltan };
}
