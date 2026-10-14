// "Guía de tu rol" (Bloque 4C, 0094): qué puede hacer cada quien en una obra y dónde, según sus
// permisos. Puro, con pruebas en guia-roles.test.ts.

export type PasoGuia = { titulo: string; que: string; consejo?: string; path: string };

// Un paso por permiso, en el orden en que suele trabajarse una obra.
const GUIA: [string, PasoGuia][] = [
  ["obra.editar", { titulo: "Página pública", que: "Editar la página de la obra: datos, sinopsis, kit visual, póster, canciones y agradecimientos.", consejo: "Usa “Vista previa” antes de publicar.", path: "pagina" }],
  ["obra.publicar", { titulo: "Publicar la obra", que: "Publicar, archivar u ocultar la obra y destacarla en la portada.", consejo: "Revisa “Listo para vender” en el Resumen antes de abrir la venta.", path: "pagina#estado" }],
  ["audiciones.gestionar", { titulo: "Audiciones", que: "Crear convocatorias, revisar solicitudes, avanzar etapas y mandar el cast.", path: "audiciones" }],
  ["audiciones.registro", { titulo: "Mesa de registro", que: "Registrar la llegada de aspirantes el día de la audición.", path: "audiciones" }],
  ["audiciones.evaluar", { titulo: "Juez", que: "Marcar tus opciones por personaje, calificar y votar en las audiciones.", consejo: "Tus votos son secretos hasta que se cierra la votación.", path: "audiciones" }],
  ["elenco.gestionar", { titulo: "Elenco y equipos", que: "Asignar papeles, ordenar créditos y mandar ofertas.", path: "elenco" }],
  ["expedientes.ver", { titulo: "Expedientes", que: "Ver documentos, contactos de emergencia y tutores del elenco.", consejo: "Son datos privados: no los compartas fuera del equipo.", path: "expedientes" }],
  ["mensualidades.gestionar", { titulo: "Mensualidades", que: "Registrar pagos del taller, ver adeudos y mandar recordatorios.", path: "expedientes/adeudos" }],
  ["ensayos.gestionar", { titulo: "Ensayos", que: "Armar el calendario de ensayos y tomar asistencia.", path: "ensayos" }],
  ["materiales.gestionar", { titulo: "Materiales", que: "Subir y organizar libretos, pistas y partituras para el elenco.", path: "materiales" }],
  ["materiales.ver", { titulo: "Materiales", que: "Consultar los materiales de la obra.", path: "materiales" }],
  ["comunicados.enviar", { titulo: "Comunicados", que: "Mandar comunicados al elenco (les llega aviso al teléfono).", path: "comunicados" }],
  ["rubrica.gestionar", { titulo: "Evaluaciones del taller", que: "Definir criterios, evaluar y publicar boletas.", path: "evaluaciones" }],
  ["rubrica.aprobar", { titulo: "Aprobar boletas", que: "Revisar las calificaciones que entregan los maestros, corregir cualquier materia y publicar las boletas.", consejo: "Si algo no cuadra, regresa la entrega al maestro con una nota.", path: "evaluaciones" }],
  ["rubrica.proponer", { titulo: "Proponer calificaciones", que: "Calificar a los alumnos en tus materias del taller. Tu propuesta la aprueba o corrige el maestro de la materia.", consejo: "Hasta que se aprueba, el alumno no la ve.", path: "evaluaciones" }],
  ["funciones.gestionar", { titulo: "Funciones y precios", que: "Crear funciones, zonas y precios, y abrir o cerrar la venta.", path: "boletos/funciones" }],
  ["ventas.ver", { titulo: "Órdenes", que: "Ver las órdenes de boletos y cómo va la venta.", path: "boletos" }],
  ["ventas.operar", { titulo: "Taquilla", que: "Aprobar o rechazar pagos y vender en taquilla.", consejo: "Al final del día, revisa el corte de caja.", path: "boletos/taquilla" }],
  ["descuentos.gestionar", { titulo: "Códigos de descuento", que: "Crear y editar códigos de descuento.", path: "boletos/descuentos" }],
  ["vendedores.gestionar", { titulo: "Vendedores", que: "Activar vendedores y ver lo que vende cada quien.", path: "boletos/vendedores" }],
  ["puerta.validar", { titulo: "Puerta", que: "Escanear los QR de los boletos el día de la función.", consejo: "Si no abre un QR, búscalo por nombre o código. Descarga la lista como plan B.", path: "puerta" }],
  ["programa.editar", { titulo: "Programa digital", que: "Editar el programa de mano digital.", path: "programa" }],
  ["fanzone.editar", { titulo: "Fan Zone y galería", que: "Subir ensayos, videos y la galería de fotos de la obra.", path: "fanzone" }],
  ["equipo.gestionar", { titulo: "Portal del equipo", que: "Materiales, avisos, notas de dirección y juntas del equipo.", path: "equipo" }],
  ["reportes.ver", { titulo: "Reportes", que: "Ver ventas, asistencia y el resumen de la temporada.", path: "reportes" }],
  ["permisos.gestionar", { titulo: "Permisos", que: "Invitar personas al equipo y darles o quitarles roles.", path: "permisos" }],
];

/** Pasos de la guía para quien tiene esos permisos (sin repetir la misma pestaña con el mismo título). */
export function guiaDe(permisos: string[], pid: string): (PasoGuia & { href: string })[] {
  const tengo = new Set(permisos);
  const vistos = new Set<string>();
  const out: (PasoGuia & { href: string })[] = [];
  for (const [perm, paso] of GUIA) {
    if (!tengo.has(perm) || vistos.has(paso.titulo)) continue;
    // Quien gestiona materiales no necesita además el paso de solo verlos.
    if (perm === "materiales.ver" && tengo.has("materiales.gestionar")) continue;
    vistos.add(paso.titulo);
    out.push({ ...paso, href: `/panel/producciones/${pid}/${paso.path}` });
  }
  return out;
}

/** Mensaje para mandar la invitación por WhatsApp. */
export function textoInvitacion(obra: string, roles: string[], liga: string): string {
  return `¡Hola! Te invitamos al equipo de ${obra} en DARF Productions${roles.length ? ` (${roles.join(", ")})` : ""}. ` +
    `Crea tu cuenta (o entra) con este mismo correo desde esta liga: ${liga}`;
}
