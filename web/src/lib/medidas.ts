// Medidas de vestuario (tabla de DARF, 0112), en centímetros. Las usa el expediente (person_files).

export const MEDIDAS_VESTUARIO = [
  { k: "altura_cm", l: "Altura" },
  { k: "cuello_cm", l: "Contorno cuello" },
  { k: "pecho_cm", l: "Contorno busto / tórax máximo" },
  { k: "cintura_cm", l: "Contorno cintura" },
  { k: "cadera_cm", l: "Contorno cadera" },
  { k: "abdomen_cm", l: "Contorno abdomen" },
  { k: "brazo_cm", l: "Contorno brazo" },
  { k: "muneca_cm", l: "Contorno muñeca" },
  { k: "talle_espalda_cm", l: "Largo talle espalda" },
  { k: "altura_busto_cm", l: "Largo altura busto" },
  { k: "bajo_busto_cm", l: "Largo bajo busto" },
  { k: "talle_delantero_cm", l: "Largo talle delantero" },
  { k: "altura_cadera_cm", l: "Altura cadera" },
  { k: "altura_cervical_cm", l: "Altura 7a cervical" },
  { k: "largo_manga_cm", l: "Largo manga" },
  { k: "largo_falda_cm", l: "Largo falda" },
  { k: "largo_pantalon_cm", l: "Largo pantalón" },
  { k: "entrepierna_cm", l: "Entrepierna al suelo" },
  { k: "bajada_cadera_cm", l: "Bajada de cadera" },
] as const;

export type MedidaKey = (typeof MEDIDAS_VESTUARIO)[number]["k"];
