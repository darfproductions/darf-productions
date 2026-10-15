// Directorio de Personas (Bloque 2): une Talento (fichas de persona, 0042) y Usuarios (cuentas, 0031)
// en una sola lista. Funciones puras: directory-rules.test.ts.

export type FichaPersona = { id: string; profile_id: string | null; nombre: string; email: string | null; obras: string[]; creditos: number };
export type CuentaUsuario = { id: string; email: string; nombre: string | null; rol: "fan" | "staff" | "admin" };

export type FiltroDirectorio = "todos" | "elenco" | "equipo" | "sin-cuenta";
export const FILTROS: { id: FiltroDirectorio; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "elenco", label: "Con obras en DARF" },
  { id: "equipo", label: "Casa DARF y admin" },
  { id: "sin-cuenta", label: "Sin cuenta" },
];

export type FilaDirectorio = {
  key: string;
  nombre: string;
  email: string | null;
  personId: string | null;
  userId: string | null;
  rol: CuentaUsuario["rol"] | null;
  /** Puestos de Casa DARF (0102) de su cuenta. */
  casa: string[];
  obras: string[];
  creditos: number;
  fichaHref: string;
};

const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtroValido(v: unknown): FiltroDirectorio {
  return FILTROS.some((f) => f.id === v) ? (v as FiltroDirectorio) : "todos";
}

/** Una fila por persona: la ficha y su cuenta juntas; las cuentas sin ficha también aparecen.
 *  `casa`: puestos de Casa DARF por cuenta (solo los ve el admin). */
export function unirDirectorio(fichas: FichaPersona[], cuentas: CuentaUsuario[], filtro: FiltroDirectorio = "todos", casa: Record<string, string[]> = {}): FilaDirectorio[] {
  const porCuenta = new Map(cuentas.map((c) => [c.id, c]));
  const usadas = new Set<string>();
  const filas: FilaDirectorio[] = fichas.map((f) => {
    const c = f.profile_id ? porCuenta.get(f.profile_id) : undefined;
    if (f.profile_id) usadas.add(f.profile_id);
    return {
      key: `p:${f.id}`,
      nombre: f.nombre,
      email: f.email ?? c?.email ?? null,
      personId: f.id,
      userId: f.profile_id,
      rol: c?.rol ?? null,
      casa: f.profile_id ? casa[f.profile_id] ?? [] : [],
      obras: f.obras,
      creditos: f.creditos,
      fichaHref: f.profile_id ? `/panel/talento/${f.profile_id}` : `/panel/talento/p/${f.id}`,
    };
  });
  for (const c of cuentas) {
    if (usadas.has(c.id)) continue;
    filas.push({
      key: `u:${c.id}`,
      nombre: c.nombre?.trim() || c.email.split("@")[0],
      email: c.email,
      personId: null,
      userId: c.id,
      rol: c.rol,
      casa: casa[c.id] ?? [],
      obras: [],
      creditos: 0,
      fichaHref: `/panel/talento/${c.id}`,
    });
  }
  return filas
    .filter((f) => {
      if (filtro === "elenco") return f.creditos > 0 || f.obras.length > 0;
      if (filtro === "equipo") return f.rol === "admin" || f.casa.length > 0;
      if (filtro === "sin-cuenta") return !f.userId;
      return true;
    })
    .sort((a, b) => norm(a.nombre).localeCompare(norm(b.nombre)));
}
