// 0168: tipos de personaje en el cast, en orden. Archivo aparte (sin "use client") para usarlo en el servidor y en
// el navegador.
export type Categoria = "protagonista" | "apoyo" | "ensamble";
export const SECCIONES: [Categoria, string][] = [["protagonista", "Protagonistas"], ["apoyo", "Personajes de apoyo"], ["ensamble", "Grupos de ensamble"]];
