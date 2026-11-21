// 0161: CLABE interbancaria (18 dígitos). Puras, con pruebas en clabe-rules.test.ts.

/** Solo los dígitos ("0121 8000…" → "012180001…"). */
export const limpiarClabe = (c: string) => c.replace(/\D/g, "");

/** 18 dígitos y dígito verificador correcto (pesos 3, 7, 1). */
export function clabeValida(c: string): boolean {
  const d = limpiarClabe(c);
  if (!/^\d{18}$/.test(d)) return false;
  const pesos = [3, 7, 1];
  const suma = [...d.slice(0, 17)].reduce((s, x, i) => s + ((Number(x) * pesos[i % 3]) % 10), 0);
  return (10 - (suma % 10)) % 10 === Number(d[17]);
}

/** "012 180 00123456789 9" en bloques fáciles de dictar o revisar. */
export function formatearClabe(c: string): string {
  const d = limpiarClabe(c);
  return d.length === 18 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 17)} ${d.slice(17)}` : d;
}

// Banco por los primeros 3 dígitos (los más comunes; si no está, la persona lo escribe).
const BANCOS: Record<string, string> = {
  "002": "Banamex", "012": "BBVA", "014": "Santander", "019": "Banjército", "021": "HSBC", "030": "BanBajío", "036": "Inbursa",
  "042": "Mifel", "044": "Scotiabank", "058": "Banregio", "059": "Invex", "060": "Bansi", "062": "Afirme", "072": "Banorte",
  "106": "Bank of America", "113": "Ve por Más", "127": "Banco Azteca", "130": "Compartamos", "137": "BanCoppel", "138": "ABC Capital",
  "140": "Consubanco", "143": "CIBanco", "145": "Bbase", "147": "Bankaool", "148": "PagaTodo", "150": "Inmobiliario", "155": "ICBC",
  "156": "Sabadell", "166": "Banco del Bienestar", "638": "Nu México", "646": "STP", "659": "Opciones Empresariales",
  "684": "Transfer", "699": "Fondeadora", "703": "Tesored", "706": "Arcus", "710": "NVIO", "722": "Mercado Pago", "728": "Spin by OXXO",
};
export function bancoDeClabe(c: string): string | null {
  const d = limpiarClabe(c);
  return d.length >= 3 ? BANCOS[d.slice(0, 3)] ?? null : null;
}
