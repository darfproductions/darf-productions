// Genera supabase/dev/seed_0029_producciones.sql: carga a la base el contenido
// transitorio de la web (web/src/content/producciones.ts y web/src/lib/themes.ts).
// Uso (desde la raíz): node --experimental-strip-types supabase/dev/gen_seed_0029.mjs
import { readFileSync, writeFileSync } from "node:fs";

const { PRODUCTION_CONTENT } = await import("../../web/src/content/producciones.ts");
const themesSrc = readFileSync("web/src/lib/themes.ts", "utf8");

const q = (v) => (v == null || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const pid = (name) => `md5(${q("darf-person:" + name.trim().toLowerCase())})::uuid`;
const ytId = (url) => {
  const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/.exec(url) ?? /^([A-Za-z0-9_-]{11})$/.exec(url);
  if (!m) throw new Error(`YouTube inválido: ${url}`);
  return m[1];
};
function theme(id) {
  const block = new RegExp(`\\n  ${id}: \\{([\\s\\S]*?)\\n  \\},`).exec(themesSrc)?.[1];
  if (!block) throw new Error(`Sin tema para ${id}`);
  const get = (k) => new RegExp(`${k}: "([^"]*)"`).exec(block)?.[1] ?? null;
  return { fondo: get("fondo"), superficie: get("superficie"), texto: get("texto"), acento: get("acento"), frase: get("tagline") };
}
const ESTADO = { showman: "publicada", mm: "archivada", hsm: "archivada" };

const out = [];
out.push(`-- DARF 2.0 — SOLO PARA "DARF 2.0 DEV". Generado por gen_seed_0029.mjs; no editar a mano.
-- Carga el contenido de las 3 obras en las tablas de la migración 0029.
begin;
do $$ begin
  if to_regclass('darf_env.marker') is null
     or not exists (select 1 from darf_env.marker where env = 'DARF-2.0-DEV') then
    raise exception 'ABORTADO: esta base NO es DARF 2.0 DEV.';
  end if;
  if exists (select 1 from production_credits) or exists (select 1 from production_songs) then
    raise exception 'ABORTADO: ya hay contenido cargado.';
  end if;
end $$;
`);

for (const [id, c] of Object.entries(PRODUCTION_CONTENT)) {
  const t = theme(id);
  const f = c.ficha;
  out.push(`-- ──────── ${id} ────────`);
  out.push(`update productions set
  frase = ${q(t.frase)}, sinopsis = ${q(c.sinopsis.join("\n\n"))},
  temporada = ${q(f.temporada)}, fecha = ${q(f.fechas)}, duracion = ${q(f.duracion)},
  clasificacion = ${q(f.clasificacion)}, basada_en = ${q(f.basadaEn)},
  color_fondo = ${q(t.fondo)}, color_superficie = ${q(t.superficie)}, color_texto = ${q(t.texto)}, color_acento = ${q(t.acento)},
  logo_path = ${q(`/producciones/${id}/logo.webp`)}, ambiente_path = ${q(`/producciones/${id}/ambiente.jpg`)},
  estado = ${q(ESTADO[id])}
where id = ${q(id)};`);

  c.actos.forEach((a, ai) => {
    const act = a.nombre ? `md5(${q(`darf-act:${id}:${ai}`)})::uuid` : "null";
    if (a.nombre) out.push(`insert into production_acts (id, production_id, nombre, orden) values (${act}, ${q(id)}, ${q(a.nombre)}, ${ai + 1});`);
    if (a.canciones.length)
      out.push(`insert into production_songs (production_id, act_id, titulo, orden) values\n  ${a.canciones.map((s, si) => `(${q(id)}, ${act}, ${q(s)}, ${si + 1})`).join(",\n  ")};`);
  });

  const credits = [
    ...c.reparto.map((r) => ["reparto", r.persona, r.personaje]),
    ...c.ensamble.map((n) => ["ensamble", n, null]),
    ...c.creativo.map((r) => ["creativo", r.persona, r.rol]),
    ...c.produccion.map((r) => ["produccion", r.persona, r.rol]),
    ...c.crew.map((r) => ["crew", r.persona, r.rol]),
    ...c.tecnico.map((r) => ["tecnico", r.persona, r.rol]),
  ];
  if (credits.length) {
    const names = [...new Set(credits.map((x) => x[1].trim()))];
    out.push(`insert into people (id, nombre) values\n  ${names.map((n) => `(${pid(n)}, ${q(n)})`).join(",\n  ")}\non conflict (id) do nothing;`);
    const orden = {};
    out.push(`insert into production_credits (production_id, person_id, tipo, papel, orden) values\n  ${credits
      .map(([tipo, persona, papel]) => `(${q(id)}, ${pid(persona)}, ${q(tipo)}, ${q(papel)}, ${(orden[tipo] = (orden[tipo] ?? 0) + 1)})`)
      .join(",\n  ")};`);
  }

  const media = [
    ...c.videos.map((v, i) => `(${q(id)}, 'video', ${q(v.titulo)}, ${q(ytId(v.url))}, 'publico', ${i + 1})`),
    ...c.ensayos.map((v, i) => `(${q(id)}, 'ensayo', ${q(v.titulo)}, ${q(ytId(v.youtube))}, 'fans', ${i + 1})`),
  ];
  if (media.length) out.push(`insert into production_media (production_id, tipo, titulo, youtube_id, visibilidad, orden) values\n  ${media.join(",\n  ")};`);
  if (f.extras.length) out.push(`insert into production_facts (production_id, etiqueta, valor, orden) values\n  ${f.extras.map((e, i) => `(${q(id)}, ${q(e.etiqueta)}, ${q(e.valor)}, ${i + 1})`).join(",\n  ")};`);
  if (c.agradecimientos.length) out.push(`insert into production_thanks (production_id, texto, orden) values\n  ${c.agradecimientos.map((x, i) => `(${q(id)}, ${q(x)}, ${i + 1})`).join(",\n  ")};`);
  out.push("");
}

out.push(`commit;
select id, estado, (select count(*) from production_credits c where c.production_id = p.id) creditos,
       (select count(*) from production_songs s where s.production_id = p.id) canciones
from productions p order by id;`);
writeFileSync("supabase/dev/seed_0029_producciones.sql", out.join("\n") + "\n");
console.log("OK: supabase/dev/seed_0029_producciones.sql");
