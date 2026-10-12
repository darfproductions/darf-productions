// Portal del equipo (0065): a quién va algo (todo el equipo, roles o personas), acuerdos de
// juntas y el espacio "general" de DARF. Puro (con pruebas en team-rules.test.ts).

export type TeamAudience = { audiencia: "todos" | "roles" | "personas"; roles: string[]; personas: string[] };

/** El espacio general de DARF se escribe "general" en las direcciones y null en la base. */
export const GENERAL = "general";
export const espacioId = (pid: string | null) => pid ?? GENERAL;
export const espacioPid = (id: string): string | null => (id === GENERAL ? null : id);

export function parseTeamAudience(f: FormData, rolesValidos: string[]): TeamAudience | { error: string } {
  const raw = String(f.get("audiencia") ?? "todos");
  const audiencia = (["todos", "roles", "personas"].includes(raw) ? raw : "todos") as TeamAudience["audiencia"];
  const roles = f.getAll("roles").map(String).filter((r) => rolesValidos.includes(r) && r !== "integrante");
  const personas = f.getAll("personas").map(String).filter(Boolean);
  if (audiencia === "roles" && !roles.length) return { error: "Marca al menos un rol." };
  if (audiencia === "personas" && !personas.length) return { error: "Marca al menos a una persona." };
  return { audiencia, roles: audiencia === "roles" ? roles : [], personas: audiencia === "personas" ? personas : [] };
}

export function teamAudienceLabel(a: TeamAudience, rolNombre: Map<string, string> = new Map(), persona: Map<string, string> = new Map()): string {
  if (a.audiencia === "roles") return a.roles.map((r) => rolNombre.get(r) ?? r).join(", ");
  if (a.audiencia === "personas") return a.personas.map((p) => persona.get(p) ?? "—").join(", ");
  return "Todo el equipo";
}

/** Para quién es una nota: roles y/o personas (al menos uno). */
export function parseNoteTargets(f: FormData, rolesValidos: string[]): { para_roles: string[]; para_personas: string[] } | { error: string } {
  const para_roles = f.getAll("para_roles").map(String).filter((r) => rolesValidos.includes(r) && r !== "integrante");
  const para_personas = f.getAll("para_personas").map(String).filter(Boolean);
  if (!para_roles.length && !para_personas.length) return { error: "Elige al menos un rol o una persona." };
  return { para_roles, para_personas };
}

export type Acuerdo = { texto: string; responsable?: string; fecha?: string };

/** Acuerdos de una junta, uno por renglón: "pendiente | responsable | fecha" (lo demás es opcional). */
export function parseAcuerdos(texto: string): Acuerdo[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean)
    .slice(0, 60)
    .map((l) => {
      const [t, r, d] = l.split("|").map((x) => x.trim());
      const a: Acuerdo = { texto: t.slice(0, 300) };
      if (r) a.responsable = r.slice(0, 120);
      if (d) a.fecha = d.slice(0, 40);
      return a;
    })
    .filter((a) => a.texto);
}

export function acuerdosTexto(xs: Acuerdo[]): string {
  return xs.map((a) => [a.texto, a.responsable ?? "", a.fecha ?? ""].join(" | ").replace(/( \| )+$/, "")).join("\n");
}

export const TIPO_JUNTA: Record<string, string> = { junta: "Junta", llamado: "Llamado", montaje: "Montaje", otro: "Otro" };

/** Tipos de archivo aceptados en el espacio del equipo. */
export const TEAM_FILE_TYPES = [
  "application/pdf", "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/aac", "audio/ogg",
  "image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime",
];

/** Ruta de un archivo del equipo: <obra|general>/<carpeta>/<marca>-<nombre limpio>. */
export function teamFilePath(pid: string | null, carpeta: "materiales" | "juntas", nombre: string, marca = Date.now().toString(36)): string {
  const limpio = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
  return `${espacioId(pid)}/${carpeta}/${marca}-${limpio}`;
}

/** Juntas próximas (programadas, de hace 3 horas en adelante; la más cercana primero) y las demás. */
export function separarJuntas<T extends { estado: string; inicia: string }>(xs: T[], ahora: Date = new Date()): { proximas: T[]; pasadas: T[] } {
  const corte = ahora.getTime() - 3 * 3600_000;
  const proximas = xs.filter((j) => j.estado === "programada" && new Date(j.inicia).getTime() > corte).sort((a, b) => a.inicia.localeCompare(b.inicia));
  const pasadas = xs.filter((j) => !proximas.includes(j)).sort((a, b) => b.inicia.localeCompare(a.inicia));
  return { proximas, pasadas };
}
