import { CRITERIOS_BASE, type AuditionOptions, type Criterio } from "@/lib/audition-rules";

// Plantillas de convocatoria (decisión de Diego): dejan listas las opciones, las
// preguntas del formulario, los criterios de calificación y un texto de requisitos.
// Todo se puede cambiar después en Configuración. Las plantillas propias se guardan
// en la base (audition_templates, 0038).

export type Pregunta = { etiqueta: string; tipo: "texto" | "parrafo" | "enlace" | "opcion" | "si_no"; opciones?: string[]; obligatorio?: boolean };

export type Plantilla = {
  label: string;
  descripcion: string;
  grupo: "principal" | "forma" | "perfil";
  opciones: AuditionOptions;
  criterios: Criterio[];
  preguntas: Pregunta[];
  requisitos?: string;
};

const ABIERTA: AuditionOptions = {
  pedir_tutor: true, autorizacion_escuela: false, pedir_foto: true, elegir_horario: true,
  visibilidad: "publica", numeracion: "llegada", modalidad: "presencial", solo_invitados: false,
};
const con = (o: Partial<AuditionOptions>): AuditionOptions => ({ ...ABIERTA, ...o });

const VIDEO: Pregunta = { etiqueta: "Enlace a un video tuyo (YouTube no listado o Drive)", tipo: "enlace", obligatorio: true };
const EXPERIENCIA: Pregunta = { etiqueta: "Experiencia (obras, academias, años)", tipo: "parrafo" };

export const PLANTILLAS: Record<string, Plantilla> = {
  // ── Principales ──
  abierta: {
    label: "Audición abierta", grupo: "principal",
    descripcion: "Para todo público y visible en la página de audiciones. Pide foto, horario y datos del tutor si es menor.",
    opciones: ABIERTA, criterios: CRITERIOS_BASE, preguntas: [EXPERIENCIA],
  },
  escuela: {
    label: "Audición en escuela", grupo: "principal",
    descripcion: "Alumnos de una escuela: solo con enlace, sin datos de papás (la escuela ya tiene su autorización) y lista en orden previo.",
    opciones: con({ pedir_tutor: false, autorizacion_escuela: true, pedir_foto: false, elegir_horario: false, visibilidad: "enlace", numeracion: "previa" }),
    criterios: CRITERIOS_BASE, preguntas: [{ etiqueta: "Grado y grupo", tipo: "texto", obligatorio: true }],
  },
  cerrada: {
    label: "Convocatoria cerrada", grupo: "principal",
    descripcion: "No aparece en la lista pública: se inscribe quien tenga la liga y quien invites por correo. Pide datos del tutor a menores.",
    opciones: con({ visibilidad: "enlace" }), criterios: CRITERIOS_BASE, preguntas: [EXPERIENCIA],
  },
  // ── Forma ──
  en_linea: {
    label: "Audición en línea (por video)", grupo: "forma",
    descripcion: "Sin día presencial: el aspirante manda sus videos y los jueces califican desde ahí.",
    opciones: con({ modalidad: "en_linea", elegir_horario: false }),
    criterios: CRITERIOS_BASE,
    preguntas: [
      { etiqueta: "Video cantando (YouTube no listado o Drive)", tipo: "enlace", obligatorio: true },
      { etiqueta: "Video bailando (YouTube no listado o Drive)", tipo: "enlace" },
      { etiqueta: "Video actuando un monólogo (YouTube no listado o Drive)", tipo: "enlace" },
      EXPERIENCIA,
    ],
    requisitos: "Graba tus videos en horizontal, con buena luz y sonido. Súbelos a YouTube como “no listado” o a Google Drive (con acceso para cualquiera con el enlace).",
  },
  mixta: {
    label: "Mixta (video + presencial)", grupo: "forma",
    descripcion: "Primero mandan un video al inscribirse y luego audicionan en persona. Los jueces pueden calificar el video desde antes.",
    opciones: con({ modalidad: "mixta", numeracion: "previa" }), criterios: CRITERIOS_BASE, preguntas: [VIDEO, EXPERIENCIA],
  },
  particular: {
    label: "Convocatoria particular (por invitación)", grupo: "forma",
    descripcion: "Solo pueden inscribirse las personas que invites por correo. Ideal para mandar llamar a ciertos talentos.",
    opciones: con({ visibilidad: "enlace", solo_invitados: true }), criterios: CRITERIOS_BASE, preguntas: [VIDEO],
  },
  // ── Perfil ──
  bailarines: {
    label: "Bailarines", grupo: "perfil",
    descripcion: "Llamado de baile: estilos y experiencia, número en orden previo para pasar por grupos.",
    opciones: con({ numeracion: "previa" }),
    criterios: [{ k: "tecnica", l: "Técnica" }, { k: "memoria", l: "Memoria coreográfica" }, { k: "estilo", l: "Estilo e interpretación" }, { k: "actitud", l: "Actitud" }],
    preguntas: [
      { etiqueta: "Estilos que dominas (jazz, contemporáneo, urbano, ballet…)", tipo: "texto", obligatorio: true },
      { etiqueta: "Años bailando", tipo: "texto" },
      { etiqueta: "Video bailando (opcional)", tipo: "enlace" },
    ],
    requisitos: "Ropa cómoda para bailar y calzado adecuado. Se enseñará una combinación el día de la audición.",
  },
  cantantes: {
    label: "Cantantes", grupo: "perfil",
    descripcion: "Audición de canto: tesitura, canción preparada y video opcional.",
    opciones: ABIERTA,
    criterios: [{ k: "afinacion", l: "Afinación" }, { k: "tecnica", l: "Técnica vocal" }, { k: "interpretacion", l: "Interpretación" }, { k: "actitud", l: "Actitud" }],
    preguntas: [
      { etiqueta: "Tesitura", tipo: "opcion", opciones: ["Soprano", "Mezzosoprano", "Contralto", "Tenor", "Barítono", "Bajo", "No sé"], obligatorio: true },
      { etiqueta: "Canción que vas a cantar", tipo: "texto", obligatorio: true },
      { etiqueta: "Video cantando (opcional)", tipo: "enlace" },
    ],
    requisitos: "Prepara 16 a 32 compases de una canción de teatro musical. Trae tu pista o partitura.",
  },
  ensamble: {
    label: "Ensamble", grupo: "perfil",
    descripcion: "Grupo grande: canto, baile y actuación, con números asignados.",
    opciones: con({ numeracion: "previa" }), criterios: CRITERIOS_BASE,
    preguntas: [EXPERIENCIA, { etiqueta: "¿Tienes disponibilidad para ensayos entre semana?", tipo: "si_no", obligatorio: true }],
  },
  principales: {
    label: "Papeles principales", grupo: "perfil",
    descripcion: "Personajes protagónicos: monólogo y canción preparada, video y callbacks.",
    opciones: ABIERTA,
    criterios: [{ k: "canto", l: "Canto" }, { k: "actuacion", l: "Actuación" }, { k: "baile", l: "Baile" }, { k: "personaje", l: "Ajuste al personaje" }, { k: "actitud", l: "Actitud" }],
    preguntas: [
      { etiqueta: "Canción preparada", tipo: "texto", obligatorio: true },
      { etiqueta: "Monólogo preparado", tipo: "texto", obligatorio: true },
      VIDEO,
      EXPERIENCIA,
    ],
    requisitos: "Prepara un monólogo de 1 a 2 minutos y una canción del estilo de la obra. Puede haber callbacks.",
  },
  acrobatas: {
    label: "Acróbatas y aéreo", grupo: "perfil",
    descripcion: "Acrobacia de piso y aéreo (tela, aro, trapecio): disciplinas, experiencia, lesiones y video.",
    opciones: ABIERTA,
    criterios: [{ k: "tecnica", l: "Técnica" }, { k: "fuerza", l: "Fuerza" }, { k: "flexibilidad", l: "Flexibilidad" }, { k: "seguridad", l: "Seguridad" }, { k: "presencia", l: "Presencia escénica" }],
    preguntas: [
      { etiqueta: "Disciplinas (tela, aro, trapecio, acrobacia de piso…)", tipo: "texto", obligatorio: true },
      { etiqueta: "Años de práctica", tipo: "texto" },
      { etiqueta: "Lesiones o condiciones que debamos saber", tipo: "parrafo" },
      { etiqueta: "Video de tu rutina", tipo: "enlace", obligatorio: true },
    ],
    requisitos: "Ropa ajustada para entrenamiento. El equipo aéreo lo pone la producción; trae tus protecciones.",
  },
  profesional: {
    label: "Convocatoria profesional", grupo: "perfil",
    descripcion: "Para talento profesional mayor de edad: currículum, representación y disponibilidad.",
    opciones: con({ pedir_tutor: true }),
    criterios: [{ k: "canto", l: "Canto" }, { k: "baile", l: "Baile" }, { k: "actuacion", l: "Actuación" }, { k: "experiencia", l: "Experiencia" }],
    preguntas: [
      { etiqueta: "Currículum artístico (enlace)", tipo: "enlace", obligatorio: true },
      { etiqueta: "Reel o video (enlace)", tipo: "enlace", obligatorio: true },
      { etiqueta: "¿Tienes representante? ¿Quién?", tipo: "texto" },
      { etiqueta: "Disponibilidad para ensayos y funciones", tipo: "parrafo", obligatorio: true },
    ],
  },
  musicos: {
    label: "Músicos", grupo: "perfil",
    descripcion: "Banda en vivo: instrumento, lectura de partitura y video.",
    opciones: con({ pedir_foto: false }),
    criterios: [{ k: "tecnica", l: "Técnica" }, { k: "lectura", l: "Lectura" }, { k: "ensamble", l: "Trabajo en ensamble" }, { k: "actitud", l: "Actitud" }],
    preguntas: [
      { etiqueta: "Instrumento(s)", tipo: "texto", obligatorio: true },
      { etiqueta: "¿Lees partitura?", tipo: "si_no", obligatorio: true },
      { etiqueta: "Video tocando", tipo: "enlace", obligatorio: true },
    ],
  },
  tecnico: {
    label: "Equipo técnico y crew", grupo: "perfil",
    descripcion: "Luces, audio, escenario, vestuario, maquillaje: área y experiencia (sin audición artística).",
    opciones: con({ pedir_foto: false, numeracion: "previa" }),
    criterios: [{ k: "experiencia", l: "Experiencia" }, { k: "disponibilidad", l: "Disponibilidad" }, { k: "actitud", l: "Actitud" }],
    preguntas: [
      { etiqueta: "Área", tipo: "opcion", opciones: ["Luces", "Audio", "Escenario y tramoya", "Vestuario", "Maquillaje y peinado", "Utilería", "Producción"], obligatorio: true },
      { etiqueta: "Experiencia", tipo: "parrafo", obligatorio: true },
      { etiqueta: "Disponibilidad", tipo: "parrafo" },
    ],
  },
};

/** Personalizada: convocatoria en blanco (abierta y presencial, sin preguntas extra). */
/** Registro permanente de talento (0064): general, en línea, siempre abierto. Se crea con su propio botón. */
export const REGISTRO_PERMANENTE: Plantilla = {
  label: "Registro permanente", grupo: "forma",
  descripcion: "Siempre abierto, sin fecha: el talento deja su perfil y videos aunque no haya convocatoria.",
  opciones: con({ modalidad: "en_linea", elegir_horario: false }),
  criterios: CRITERIOS_BASE,
  preguntas: [
    { etiqueta: "Especialidad principal", tipo: "opcion", opciones: ["Actuación", "Canto", "Baile", "Música en vivo", "Dirección", "Producción", "Técnica / crew", "Vestuario y maquillaje"], obligatorio: true },
    { etiqueta: "Enlace a tu video o portafolio (YouTube no listado, Drive o página)", tipo: "enlace", obligatorio: true },
    { etiqueta: "Otras especialidades", tipo: "texto" },
    EXPERIENCIA,
  ],
  requisitos: "Déjanos tu perfil aunque no haya convocatoria abierta: lo consultamos cuando preparamos una producción nueva. Tus datos se guardan hasta que canceles tu registro desde Mi cuenta.",
};

export const EN_BLANCO: Plantilla = {
  label: "Personalizada", grupo: "principal",
  descripcion: "Empieza en blanco y ajusta todo a tu medida, o usa una de tus plantillas guardadas.",
  opciones: ABIERTA, criterios: CRITERIOS_BASE, preguntas: [],
};

export const GRUPOS: { id: Plantilla["grupo"]; label: string }[] = [
  { id: "forma", label: "Por forma de audición" },
  { id: "perfil", label: "Por perfil" },
];
