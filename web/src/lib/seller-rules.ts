// Códigos de vendedor (0050). Puro, con pruebas en seller-rules.test.ts.

export type SellerRow = {
  seller_id: string; nombre: string; codigo: string; tipo: "elenco" | "cuenta" | "externo";
  activo: boolean; decidido: boolean; ordenes: number; boletos: number; monto: number; pendientes: number;
};
export type MySale = {
  codigo: string; production_id: string | null; obra: string | null; activo: boolean; en_venta: boolean;
  ordenes: number; boletos: number; monto: number; pendientes: number;
};

export const TIPO_VENDEDOR: Record<SellerRow["tipo"], string> = { elenco: "Elenco", cuenta: "Cuenta", externo: "Externo" };

/** Código limpio (mayúsculas, sin espacios) o null si no tiene forma de código. */
export function cleanSellerCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const c = v.trim().toUpperCase();
  return /^[A-Z0-9]{3,16}$/.test(c) ? c : null;
}

/** Link para compartir: la página de la obra con el código ya puesto. */
export function sellerPath(productionId: string, codigo: string): string {
  return `/producciones/${encodeURIComponent(productionId)}?v=${encodeURIComponent(codigo)}`;
}

/** Agrega ?v= a un link de compra si hay código. */
export function withSeller(path: string, codigo: string | null): string {
  return codigo ? `${path}${path.includes("?") ? "&" : "?"}v=${encodeURIComponent(codigo)}` : path;
}

/** Por qué un vendedor está o no activo, en palabras. */
export function estadoVendedor(r: Pick<SellerRow, "tipo" | "activo" | "decidido">): string {
  if (r.activo) return r.decidido ? "Activo" : "Activo (elenco)";
  return r.decidido ? "Desactivado" : "No activo";
}
