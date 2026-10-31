// Desglose de la venta por zona (0132): boletos y dinero de cada zona, de una función o de todas.
// Puro, con pruebas en ventas-zona-rules.test.ts. Los números vienen de ventas_por_zona (una fila por función y zona).

export type FilaVentaZona = { performance_id: string; zona_id: string | null; vendidos: number; cortesias: number; apartados: number; ingresos: number };
export type ZonaDesglose = { id: string | null; nombre: string; vendidos: number; cortesias: number; apartados: number; ingresos: number };
export type Desglose = { zonas: ZonaDesglose[]; total: Omit<ZonaDesglose, "id" | "nombre"> };

/** Suma por zona (de la función elegida, o de todas si funcion es ""). Las zonas salen en el orden de la obra;
 *  las que no tienen nada vendido ni apartado también salen (en ceros), y "Sin zona" al final si hay boletos así. */
export function desglosePorZona(filas: FilaVentaZona[], zonas: { id: string; nombre: string }[], funcion: string): Desglose {
  const suma = new Map<string | null, ZonaDesglose>();
  for (const z of zonas) suma.set(z.id, { id: z.id, nombre: z.nombre, vendidos: 0, cortesias: 0, apartados: 0, ingresos: 0 });
  for (const f of filas) {
    if (funcion && f.performance_id !== funcion) continue;
    const z = suma.get(f.zona_id) ?? { id: f.zona_id, nombre: "Sin zona", vendidos: 0, cortesias: 0, apartados: 0, ingresos: 0 };
    z.vendidos += Number(f.vendidos); z.cortesias += Number(f.cortesias); z.apartados += Number(f.apartados);
    z.ingresos = Math.round((z.ingresos + Number(f.ingresos)) * 100) / 100;
    suma.set(f.zona_id, z);
  }
  const lista = [...suma.values()];
  const total = lista.reduce((t, z) => ({ vendidos: t.vendidos + z.vendidos, cortesias: t.cortesias + z.cortesias, apartados: t.apartados + z.apartados,
    ingresos: Math.round((t.ingresos + z.ingresos) * 100) / 100 }), { vendidos: 0, cortesias: 0, apartados: 0, ingresos: 0 });
  return { zonas: lista, total };
}
