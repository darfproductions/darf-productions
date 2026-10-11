// Contenido de las producciones, extraído automáticamente de la web 1.0
// (index.html, rama main) el 2026-10-10 con un script. Ajustes posteriores por
// decisión de Johann: ficha técnica con campos fijos; HSM dividida en dos actos
// (canciones 1–7 y 8–12).
// TRANSITORIO: en la Fase 2 este contenido se carga a tablas de la base y se
// edita desde el panel; este archivo desaparece entonces.

export type Credit = { rol: string; persona: string; /** Retrato profesional (Fase 2). */ foto?: string };

export type ProductionContent = {
  sinopsis: string[];
  /** Actos opcionales: si una obra no los usa, un solo grupo con nombre vacío. */
  actos: { nombre: string; canciones: string[] }[];
  videos: { titulo: string; url: string }[];
  reparto: { personaje: string; persona: string; foto?: string }[];
  ensamble: string[];
  creativo: Credit[];
  produccion: Credit[];
  crew: Credit[];
  tecnico: Credit[];
  agradecimientos: string[];
  /** Ficha técnica con campos fijos (la sede sale de la base) + extras opcionales. */
  ficha: {
    temporada?: string;
    fechas?: string;
    duracion?: string;
    clasificacion?: string;
    basadaEn?: string;
    extras: { etiqueta: string; valor: string }[];
  };
  /** Videos de ensayo de la Fan Zone (id de YouTube). */
  ensayos: { titulo: string; youtube: string }[];
};

export const PRODUCTION_CONTENT: Record<string, ProductionContent> = {
  "mm": {
    "sinopsis": [
      "En una isla griega bañada por el sol, Sophie está a punto de casarse. Sin embargo, antes de dar el gran paso, decide descubrir la verdad sobre su pasado: quiere saber quién es su padre. Tras encontrar el antiguo diario de su madre, Donna, Sophie invita en secreto a tres hombres que formaron parte de su historia veinte años atrás… convencida de que uno de ellos es su verdadero padre.",
      "Lo que comienza como una búsqueda íntima se transforma en una reunión inesperada llena de recuerdos, emociones no resueltas y decisiones pendientes. Entre enredos, confesiones y reencuentros, madre e hija deberán enfrentar el pasado para entender su presente.",
      "Nuestra producción presenta una versión fresca y contemporánea de este clásico musical, acompañada por los inolvidables éxitos de ABBA. Con una propuesta escénica moderna y completamente realizada por alumnos, esta puesta en escena celebra el amor, la identidad y la libertad de elegir nuestro propio camino."
    ],
    "actos": [
      {
        "nombre": "Acto I",
        "canciones": [
          "Overture / I Have a Dream",
          "Honey, Honey",
          "Money, Money, Money",
          "Thank You for the Music",
          "Mamma Mia",
          "Chiquitita",
          "Dancing Queen",
          "Lay All Your Love on Me",
          "Super Trouper",
          "Gimme! Gimme! Gimme!",
          "Voulez-Vous"
        ]
      },
      {
        "nombre": "Acto II",
        "canciones": [
          "One of Us",
          "SOS",
          "Does Your Mother Know",
          "Knowing Me, Knowing You",
          "Our Last Summer",
          "Slipping Through My Fingers",
          "The Winner Takes It All",
          "Take a Chance on Me",
          "I Do, I Do, I Do",
          "I Have a Dream",
          "Mamma Mia x Dancing Queen Finale",
          "Waterloo"
        ]
      }
    ],
    "videos": [
      {
        "titulo": "Pro-Shot Oficial",
        "url": "https://youtu.be/lOfGNDV1qa8"
      }
    ],
    "reparto": [
      {
        "personaje": "Donna Sheridan",
        "persona": "Adriana Alarcón"
      },
      {
        "personaje": "Sophie Sheridan",
        "persona": "Camila Cano"
      },
      {
        "personaje": "Sam Carmichael",
        "persona": "Patricio González"
      },
      {
        "personaje": "Harry Bright",
        "persona": "Alejandro Lámbarri"
      },
      {
        "personaje": "Bill Austin",
        "persona": "Emiliano Castellanos"
      },
      {
        "personaje": "Tanya Chesman",
        "persona": "Ana Cristina Quiroz"
      },
      {
        "personaje": "Rosie Mulligan",
        "persona": "Daniela Altamirano"
      },
      {
        "personaje": "Sky Rymand",
        "persona": "Santiago Rodríguez"
      },
      {
        "personaje": "Ali",
        "persona": "Mia Castro"
      },
      {
        "personaje": "Lisa",
        "persona": "Karla Urusquieta"
      },
      {
        "personaje": "Caro",
        "persona": "Maria Haro"
      },
      {
        "personaje": "Pepper",
        "persona": "Andrés García"
      },
      {
        "personaje": "Eddie",
        "persona": "Diego Matas"
      },
      {
        "personaje": "Jane",
        "persona": "Esbeidy Felix"
      }
    ],
    "ensamble": [
      "Priscila Maciel",
      "Maria Jose Rodriguez",
      "Fernanda Moreno",
      "María José Arias",
      "Antonella Tupa",
      "Valeria Luna",
      "Ana Paola Ulloa",
      "Majo Barragán",
      "Hannah Paola Martínez",
      "Paola García",
      "Valentina Lima",
      "Regina Barragán",
      "Ana Sofía Ulloa",
      "Ana Paola Gonzalez",
      "Michelle Martínez",
      "Mariana Noguez",
      "Ana Paula Berrospe",
      "Isabella Santoscoy",
      "María Fernanda Morales",
      "Emmanuel Nicolas Pinto",
      "Nicolás Medina",
      "Ramón Robles",
      "Emilio Pérez",
      "Raúl Linares",
      "Christian Peña"
    ],
    "creativo": [
      {
        "rol": "Dirección General",
        "persona": "Diego Romero"
      },
      {
        "rol": "Dirección Vocal",
        "persona": "Ericka Torres"
      },
      {
        "rol": "Dirección Coreográfica",
        "persona": "Jaime Hernández"
      },
      {
        "rol": "Producción Ejecutiva",
        "persona": "Sandra López"
      },
      {
        "rol": "Asistencia Coreográfica",
        "persona": "Ana Paola González"
      },
      {
        "rol": "Instalaciones",
        "persona": "Mariana Hernández"
      },
      {
        "rol": "Maquillaje",
        "persona": "Minerva De Santiago"
      },
      {
        "rol": "Vestuario",
        "persona": "Mia Castro"
      }
    ],
    "produccion": [
      {
        "rol": "Asistente de Dirección",
        "persona": "Maximiliano Ramírez"
      },
      {
        "rol": "Asistente de Dirección",
        "persona": "Diego Gamboa"
      },
      {
        "rol": "Stage Manager",
        "persona": "Emiliano Villalva"
      },
      {
        "rol": "Stage Coordinator",
        "persona": "Camila Bauer"
      },
      {
        "rol": "Ingeniero Audiovisual",
        "persona": "Juan Pablo Villalva"
      },
      {
        "rol": "Supervisor de Sonido",
        "persona": "Alejandro Martens"
      },
      {
        "rol": "Coord. Elenco y Vestuario",
        "persona": "Valeria De la Torre"
      },
      {
        "rol": "Supervisor de Utilería",
        "persona": "María José Gil"
      },
      {
        "rol": "Asistente de Utilería",
        "persona": "Aitana San Román"
      },
      {
        "rol": "Asistencia en Iluminación",
        "persona": "Jesús Barrios"
      },
      {
        "rol": "Líder de Fotografía",
        "persona": "Juan Pablo Estrada"
      },
      {
        "rol": "Equipo Logístico",
        "persona": "Tamara Garza"
      },
      {
        "rol": "Staff",
        "persona": "Alexa Martens"
      }
    ],
    "crew": [],
    "agradecimientos": [
      "Universidad del Valle de México (UVM)",
      "Familias del elenco y equipo creativo",
      "Sponsors y patrocinadores 2026"
    ],
    "ficha": {
      "extras": [],
      "temporada": "2026",
      "fechas": "22 de Mayo de 2026",
      "basadaEn": "Música de ABBA",
      "duracion": "~2h 20 min (c/intermedio)",
      "clasificacion": "Toda la familia"
    },
    "tecnico": [],
    "ensayos": [
      {
        "titulo": "Dancing Queen · Ensayo",
        "youtube": "CK3TjWGxQlo"
      },
      {
        "titulo": "Chiquitita · Ensayo",
        "youtube": "mQ-vKGXXsIY"
      },
      {
        "titulo": "Escena 3 (Mamma Mia) · Ensayo",
        "youtube": "fFQ-HSlO9uc"
      },
      {
        "titulo": "Escena 4 (Chiquitita & Dancing Queen) · Ensayo",
        "youtube": "M2SDeiTrOIs"
      },
      {
        "titulo": "Does Your Mother Know · Ensayo",
        "youtube": "IhVTnXS6AwQ"
      },
      {
        "titulo": "Mamma Mia x Dancing Queen · Ensayo",
        "youtube": "-VI8e89E7Ws"
      },
      {
        "titulo": "Money, Money, Money · Ensayo",
        "youtube": "bDIISKQgaaA"
      },
      {
        "titulo": "One of Us x SOS · Ensayo",
        "youtube": "q_1K4QICzZo"
      }
    ]
  },
  "hsm": {
    "sinopsis": [
      "¡Bienvenidos a East High! Las vacaciones terminaron, y en East High todo parece volver a la normalidad… hasta que Troy, el capitán del equipo de baloncesto, y Gabriella, una brillante estudiante nueva, sorprenden a todos al querer audicionar para el musical escolar.",
      "Mientras los grupos sociales tradicionales luchan por mantener su lugar, Troy y Gabriella se enfrentan a la presión de sus amigos, las intrigas de los reyes del teatro, y sus propios miedos. ¿Podrán romper las reglas del instituto y seguir su pasión sin perderse a sí mismos en el camino?",
      "Una historia divertida y conmovedora sobre el poder de la autenticidad, la amistad y la música que une a quienes se atreven a brillar, aunque el mundo les diga lo contrario."
    ],
    "actos": [
      {
        "nombre": "Acto I",
        "canciones": [
          "Wildcat Cheer",
          "The Start of Something New",
          "Getcha Head in the Game",
          "Auditions",
          "What I've Been Looking For",
          "What I've Been Looking For (Reprise)",
          "Stick To The Status Quo"
        ]
      },
      {
        "nombre": "Acto II",
        "canciones": [
          "Counting on You",
          "We're All In This Together",
          "Bop To The Top",
          "Breaking Free",
          "We're All In This Together (Finale)"
        ]
      }
    ],
    "videos": [
      {
        "titulo": "Pro-Shot Oficial",
        "url": "https://youtu.be/2t8v1NjM-zQ"
      }
    ],
    "reparto": [
      {
        "personaje": "Troy Bolton",
        "persona": "Patricio González"
      },
      {
        "personaje": "Gabriella Montez",
        "persona": "Valentina Lima"
      },
      {
        "personaje": "Sharpay Evans",
        "persona": "Mia Castro"
      },
      {
        "personaje": "Ryan Evans",
        "persona": "Emmanuel Pinto"
      },
      {
        "personaje": "Chad Danforth",
        "persona": "Alejandro Lámbarri"
      },
      {
        "personaje": "Taylor McKessie",
        "persona": "Tamara Garza"
      },
      {
        "personaje": "Zeke Baylor",
        "persona": "Santiago Rodríguez"
      },
      {
        "personaje": "Martha Cox",
        "persona": "Romina Carmona"
      },
      {
        "personaje": "Sra. Darbus",
        "persona": "Ericka Torres"
      },
      {
        "personaje": "Coach Bolton",
        "persona": "Juan Pablo Estrada"
      },
      {
        "personaje": "Kelsi Nielsen",
        "persona": "María José Barragán"
      },
      {
        "personaje": "Jackie Scott",
        "persona": "María Fernanda Morales"
      }
    ],
    "ensamble": [
      "María José Gil",
      "Ana Paola González",
      "Paola García",
      "Ana Sofía Ulloa",
      "Alexa Martens",
      "Mia Insurreta",
      "Natalia Díaz",
      "Ramón Robles",
      "Christian Peña",
      "Kalani Danino",
      "Natalia Ramírez",
      "Emilia Olvera",
      "Fernando Fata",
      "Yara Sosa",
      "Paloma López",
      "Ana Renata Huerta",
      "Fernanda Maturano",
      "María Bonilla"
    ],
    "creativo": [
      {
        "rol": "Dirección General",
        "persona": "Diego Romero"
      },
      {
        "rol": "Asistencia de Dirección",
        "persona": "Ericka Torres"
      },
      {
        "rol": "Dirección Coreográfica",
        "persona": "Andrés Santillán"
      },
      {
        "rol": "Producción Ejecutiva",
        "persona": "Sandra López"
      },
      {
        "rol": "Instalaciones",
        "persona": "Mariana Hernández"
      },
      {
        "rol": "Vestuario",
        "persona": "Mia Castro"
      }
    ],
    "produccion": [
      {
        "rol": "Stage Manager",
        "persona": "Emiliano Villalva"
      },
      {
        "rol": "Stage Coordinator",
        "persona": "Maria Haro"
      },
      {
        "rol": "Ingeniero Audiovisual",
        "persona": "Juan Pablo Villalva"
      },
      {
        "rol": "Supervisor de Sonido",
        "persona": "Alejandro Martens"
      },
      {
        "rol": "Coord. Elenco y Vestuario",
        "persona": "Valeria De la Torre"
      }
    ],
    "crew": [],
    "agradecimientos": [],
    "ficha": {
      "extras": [
        {
          "etiqueta": "Colectivo",
          "valor": "Sunhills Valley (SHV)"
        }
      ],
      "temporada": "2025",
      "fechas": "30 de Junio de 2025",
      "basadaEn": "Disney's HSM"
    },
    "tecnico": [],
    "ensayos": [
      {
        "titulo": "Breaking Free · Ensayo",
        "youtube": "p3a3nKx-rig"
      },
      {
        "titulo": "Stick to the Status Quo · Ensayo",
        "youtube": "EQwbeFQpRkc"
      },
      {
        "titulo": "We’re All In This Together · Ensayo",
        "youtube": "CohmdbLSVHY"
      },
      {
        "titulo": "Ovaciones · Ensayo",
        "youtube": "zS0-c8bCMLA"
      }
    ]
  },
  "showman": {
    "sinopsis": [],
    "actos": [],
    "videos": [],
    "reparto": [],
    "ensamble": [],
    "creativo": [
      {
        "rol": "Dirección Artística y Escénica",
        "persona": "Diego Romero"
      },
      {
        "rol": "Dirección Vocal",
        "persona": "Ana Fer Ramírez"
      },
      {
        "rol": "Dirección Coreográfica",
        "persona": "Regina Cedillo"
      },
      {
        "rol": "Dirección Circense",
        "persona": "Valeria Luna"
      },
      {
        "rol": "Dirección Circense",
        "persona": "Camila Cedillo"
      },
      {
        "rol": "Co-dirección Escénica",
        "persona": "Patricio González"
      },
      {
        "rol": "Co-dirección Coreográfica",
        "persona": "María José Arias"
      },
      {
        "rol": "Co-dirección Vocal",
        "persona": "Adriana Alarcón"
      }
    ],
    "produccion": [
      {
        "rol": "Jefe de Producción",
        "persona": "Juan Pablo Villalva"
      },
      {
        "rol": "Gerente de Producción",
        "persona": "Valentina Lima"
      },
      {
        "rol": "Stage Manager",
        "persona": "Emiliano Villalva"
      },
      {
        "rol": "Dirección Visual",
        "persona": "Mia Castro"
      },
      {
        "rol": "Assistant Stage Manager",
        "persona": "Camila Bauer"
      }
    ],
    "crew": [],
    "agradecimientos": [],
    "ficha": {
      "extras": [],
      "temporada": "2027"
    },
    "tecnico": [],
    "ensayos": []
  }
};
