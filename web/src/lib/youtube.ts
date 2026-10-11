// Enlaces de YouTube escritos por el equipo → id de 11 caracteres que guarda la base.

/** Acepta youtu.be/ID, youtube.com/watch?v=ID, /embed/ID, /shorts/ID o el id solo. */
export function parseYoutube(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m ? m[1] : null;
}
