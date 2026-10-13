-- DARF 2.0 — SOLO PARA "DARF 2.0 DEV". Generado una vez (2026-10-11) desde el contenido transitorio de la web 2.0, ya retirado (ver historial de git: gen_seed_0029.mjs).
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

-- ──────── mm ────────
update productions set
  frase = 'Una boda, tres posibles padres y la música de ABBA.', sinopsis = 'En una isla griega bañada por el sol, Sophie está a punto de casarse. Sin embargo, antes de dar el gran paso, decide descubrir la verdad sobre su pasado: quiere saber quién es su padre. Tras encontrar el antiguo diario de su madre, Donna, Sophie invita en secreto a tres hombres que formaron parte de su historia veinte años atrás… convencida de que uno de ellos es su verdadero padre.

Lo que comienza como una búsqueda íntima se transforma en una reunión inesperada llena de recuerdos, emociones no resueltas y decisiones pendientes. Entre enredos, confesiones y reencuentros, madre e hija deberán enfrentar el pasado para entender su presente.

Nuestra producción presenta una versión fresca y contemporánea de este clásico musical, acompañada por los inolvidables éxitos de ABBA. Con una propuesta escénica moderna y completamente realizada por alumnos, esta puesta en escena celebra el amor, la identidad y la libertad de elegir nuestro propio camino.',
  temporada = '2026', fecha = '22 de Mayo de 2026', duracion = '~2h 20 min (c/intermedio)',
  clasificacion = 'Toda la familia', basada_en = 'Música de ABBA',
  color_fondo = '#f8f7f5', color_superficie = '#ffffff', color_texto = '#13235c', color_acento = '#c2255c',
  logo_path = '/producciones/mm/logo.webp', ambiente_path = '/producciones/mm/ambiente.jpg',
  estado = 'archivada'
where id = 'mm';
insert into production_acts (id, production_id, nombre, orden) values (md5('darf-act:mm:0')::uuid, 'mm', 'Acto I', 1);
insert into production_songs (production_id, act_id, titulo, orden) values
  ('mm', md5('darf-act:mm:0')::uuid, 'Overture / I Have a Dream', 1),
  ('mm', md5('darf-act:mm:0')::uuid, 'Honey, Honey', 2),
  ('mm', md5('darf-act:mm:0')::uuid, 'Money, Money, Money', 3),
  ('mm', md5('darf-act:mm:0')::uuid, 'Thank You for the Music', 4),
  ('mm', md5('darf-act:mm:0')::uuid, 'Mamma Mia', 5),
  ('mm', md5('darf-act:mm:0')::uuid, 'Chiquitita', 6),
  ('mm', md5('darf-act:mm:0')::uuid, 'Dancing Queen', 7),
  ('mm', md5('darf-act:mm:0')::uuid, 'Lay All Your Love on Me', 8),
  ('mm', md5('darf-act:mm:0')::uuid, 'Super Trouper', 9),
  ('mm', md5('darf-act:mm:0')::uuid, 'Gimme! Gimme! Gimme!', 10),
  ('mm', md5('darf-act:mm:0')::uuid, 'Voulez-Vous', 11);
insert into production_acts (id, production_id, nombre, orden) values (md5('darf-act:mm:1')::uuid, 'mm', 'Acto II', 2);
insert into production_songs (production_id, act_id, titulo, orden) values
  ('mm', md5('darf-act:mm:1')::uuid, 'One of Us', 1),
  ('mm', md5('darf-act:mm:1')::uuid, 'SOS', 2),
  ('mm', md5('darf-act:mm:1')::uuid, 'Does Your Mother Know', 3),
  ('mm', md5('darf-act:mm:1')::uuid, 'Knowing Me, Knowing You', 4),
  ('mm', md5('darf-act:mm:1')::uuid, 'Our Last Summer', 5),
  ('mm', md5('darf-act:mm:1')::uuid, 'Slipping Through My Fingers', 6),
  ('mm', md5('darf-act:mm:1')::uuid, 'The Winner Takes It All', 7),
  ('mm', md5('darf-act:mm:1')::uuid, 'Take a Chance on Me', 8),
  ('mm', md5('darf-act:mm:1')::uuid, 'I Do, I Do, I Do', 9),
  ('mm', md5('darf-act:mm:1')::uuid, 'I Have a Dream', 10),
  ('mm', md5('darf-act:mm:1')::uuid, 'Mamma Mia x Dancing Queen Finale', 11),
  ('mm', md5('darf-act:mm:1')::uuid, 'Waterloo', 12);
insert into people (id, nombre) values
  (md5('darf-person:adriana alarcón')::uuid, 'Adriana Alarcón'),
  (md5('darf-person:camila cano')::uuid, 'Camila Cano'),
  (md5('darf-person:patricio gonzález')::uuid, 'Patricio González'),
  (md5('darf-person:alejandro lámbarri')::uuid, 'Alejandro Lámbarri'),
  (md5('darf-person:emiliano castellanos')::uuid, 'Emiliano Castellanos'),
  (md5('darf-person:ana cristina quiroz')::uuid, 'Ana Cristina Quiroz'),
  (md5('darf-person:daniela altamirano')::uuid, 'Daniela Altamirano'),
  (md5('darf-person:santiago rodríguez')::uuid, 'Santiago Rodríguez'),
  (md5('darf-person:mia castro')::uuid, 'Mia Castro'),
  (md5('darf-person:karla urusquieta')::uuid, 'Karla Urusquieta'),
  (md5('darf-person:maria haro')::uuid, 'Maria Haro'),
  (md5('darf-person:andrés garcía')::uuid, 'Andrés García'),
  (md5('darf-person:diego matas')::uuid, 'Diego Matas'),
  (md5('darf-person:esbeidy felix')::uuid, 'Esbeidy Felix'),
  (md5('darf-person:priscila maciel')::uuid, 'Priscila Maciel'),
  (md5('darf-person:maria jose rodriguez')::uuid, 'Maria Jose Rodriguez'),
  (md5('darf-person:fernanda moreno')::uuid, 'Fernanda Moreno'),
  (md5('darf-person:maría josé arias')::uuid, 'María José Arias'),
  (md5('darf-person:antonella tupa')::uuid, 'Antonella Tupa'),
  (md5('darf-person:valeria luna')::uuid, 'Valeria Luna'),
  (md5('darf-person:ana paola ulloa')::uuid, 'Ana Paola Ulloa'),
  (md5('darf-person:majo barragán')::uuid, 'Majo Barragán'),
  (md5('darf-person:hannah paola martínez')::uuid, 'Hannah Paola Martínez'),
  (md5('darf-person:paola garcía')::uuid, 'Paola García'),
  (md5('darf-person:valentina lima')::uuid, 'Valentina Lima'),
  (md5('darf-person:regina barragán')::uuid, 'Regina Barragán'),
  (md5('darf-person:ana sofía ulloa')::uuid, 'Ana Sofía Ulloa'),
  (md5('darf-person:ana paola gonzalez')::uuid, 'Ana Paola Gonzalez'),
  (md5('darf-person:michelle martínez')::uuid, 'Michelle Martínez'),
  (md5('darf-person:mariana noguez')::uuid, 'Mariana Noguez'),
  (md5('darf-person:ana paula berrospe')::uuid, 'Ana Paula Berrospe'),
  (md5('darf-person:isabella santoscoy')::uuid, 'Isabella Santoscoy'),
  (md5('darf-person:maría fernanda morales')::uuid, 'María Fernanda Morales'),
  (md5('darf-person:emmanuel nicolas pinto')::uuid, 'Emmanuel Nicolas Pinto'),
  (md5('darf-person:nicolás medina')::uuid, 'Nicolás Medina'),
  (md5('darf-person:ramón robles')::uuid, 'Ramón Robles'),
  (md5('darf-person:emilio pérez')::uuid, 'Emilio Pérez'),
  (md5('darf-person:raúl linares')::uuid, 'Raúl Linares'),
  (md5('darf-person:christian peña')::uuid, 'Christian Peña'),
  (md5('darf-person:diego romero')::uuid, 'Diego Romero'),
  (md5('darf-person:ericka torres')::uuid, 'Ericka Torres'),
  (md5('darf-person:jaime hernández')::uuid, 'Jaime Hernández'),
  (md5('darf-person:sandra lópez')::uuid, 'Sandra López'),
  (md5('darf-person:ana paola gonzález')::uuid, 'Ana Paola González'),
  (md5('darf-person:mariana hernández')::uuid, 'Mariana Hernández'),
  (md5('darf-person:minerva de santiago')::uuid, 'Minerva De Santiago'),
  (md5('darf-person:maximiliano ramírez')::uuid, 'Maximiliano Ramírez'),
  (md5('darf-person:diego gamboa')::uuid, 'Diego Gamboa'),
  (md5('darf-person:emiliano villalva')::uuid, 'Emiliano Villalva'),
  (md5('darf-person:camila bauer')::uuid, 'Camila Bauer'),
  (md5('darf-person:juan pablo villalva')::uuid, 'Juan Pablo Villalva'),
  (md5('darf-person:alejandro martens')::uuid, 'Alejandro Martens'),
  (md5('darf-person:valeria de la torre')::uuid, 'Valeria De la Torre'),
  (md5('darf-person:maría josé gil')::uuid, 'María José Gil'),
  (md5('darf-person:aitana san román')::uuid, 'Aitana San Román'),
  (md5('darf-person:jesús barrios')::uuid, 'Jesús Barrios'),
  (md5('darf-person:juan pablo estrada')::uuid, 'Juan Pablo Estrada'),
  (md5('darf-person:tamara garza')::uuid, 'Tamara Garza'),
  (md5('darf-person:alexa martens')::uuid, 'Alexa Martens')
on conflict (id) do nothing;
insert into production_credits (production_id, person_id, tipo, papel, orden) values
  ('mm', md5('darf-person:adriana alarcón')::uuid, 'reparto', 'Donna Sheridan', 1),
  ('mm', md5('darf-person:camila cano')::uuid, 'reparto', 'Sophie Sheridan', 2),
  ('mm', md5('darf-person:patricio gonzález')::uuid, 'reparto', 'Sam Carmichael', 3),
  ('mm', md5('darf-person:alejandro lámbarri')::uuid, 'reparto', 'Harry Bright', 4),
  ('mm', md5('darf-person:emiliano castellanos')::uuid, 'reparto', 'Bill Austin', 5),
  ('mm', md5('darf-person:ana cristina quiroz')::uuid, 'reparto', 'Tanya Chesman', 6),
  ('mm', md5('darf-person:daniela altamirano')::uuid, 'reparto', 'Rosie Mulligan', 7),
  ('mm', md5('darf-person:santiago rodríguez')::uuid, 'reparto', 'Sky Rymand', 8),
  ('mm', md5('darf-person:mia castro')::uuid, 'reparto', 'Ali', 9),
  ('mm', md5('darf-person:karla urusquieta')::uuid, 'reparto', 'Lisa', 10),
  ('mm', md5('darf-person:maria haro')::uuid, 'reparto', 'Caro', 11),
  ('mm', md5('darf-person:andrés garcía')::uuid, 'reparto', 'Pepper', 12),
  ('mm', md5('darf-person:diego matas')::uuid, 'reparto', 'Eddie', 13),
  ('mm', md5('darf-person:esbeidy felix')::uuid, 'reparto', 'Jane', 14),
  ('mm', md5('darf-person:priscila maciel')::uuid, 'ensamble', null, 1),
  ('mm', md5('darf-person:maria jose rodriguez')::uuid, 'ensamble', null, 2),
  ('mm', md5('darf-person:fernanda moreno')::uuid, 'ensamble', null, 3),
  ('mm', md5('darf-person:maría josé arias')::uuid, 'ensamble', null, 4),
  ('mm', md5('darf-person:antonella tupa')::uuid, 'ensamble', null, 5),
  ('mm', md5('darf-person:valeria luna')::uuid, 'ensamble', null, 6),
  ('mm', md5('darf-person:ana paola ulloa')::uuid, 'ensamble', null, 7),
  ('mm', md5('darf-person:majo barragán')::uuid, 'ensamble', null, 8),
  ('mm', md5('darf-person:hannah paola martínez')::uuid, 'ensamble', null, 9),
  ('mm', md5('darf-person:paola garcía')::uuid, 'ensamble', null, 10),
  ('mm', md5('darf-person:valentina lima')::uuid, 'ensamble', null, 11),
  ('mm', md5('darf-person:regina barragán')::uuid, 'ensamble', null, 12),
  ('mm', md5('darf-person:ana sofía ulloa')::uuid, 'ensamble', null, 13),
  ('mm', md5('darf-person:ana paola gonzalez')::uuid, 'ensamble', null, 14),
  ('mm', md5('darf-person:michelle martínez')::uuid, 'ensamble', null, 15),
  ('mm', md5('darf-person:mariana noguez')::uuid, 'ensamble', null, 16),
  ('mm', md5('darf-person:ana paula berrospe')::uuid, 'ensamble', null, 17),
  ('mm', md5('darf-person:isabella santoscoy')::uuid, 'ensamble', null, 18),
  ('mm', md5('darf-person:maría fernanda morales')::uuid, 'ensamble', null, 19),
  ('mm', md5('darf-person:emmanuel nicolas pinto')::uuid, 'ensamble', null, 20),
  ('mm', md5('darf-person:nicolás medina')::uuid, 'ensamble', null, 21),
  ('mm', md5('darf-person:ramón robles')::uuid, 'ensamble', null, 22),
  ('mm', md5('darf-person:emilio pérez')::uuid, 'ensamble', null, 23),
  ('mm', md5('darf-person:raúl linares')::uuid, 'ensamble', null, 24),
  ('mm', md5('darf-person:christian peña')::uuid, 'ensamble', null, 25),
  ('mm', md5('darf-person:diego romero')::uuid, 'creativo', 'Dirección General', 1),
  ('mm', md5('darf-person:ericka torres')::uuid, 'creativo', 'Dirección Vocal', 2),
  ('mm', md5('darf-person:jaime hernández')::uuid, 'creativo', 'Dirección Coreográfica', 3),
  ('mm', md5('darf-person:sandra lópez')::uuid, 'creativo', 'Producción Ejecutiva', 4),
  ('mm', md5('darf-person:ana paola gonzález')::uuid, 'creativo', 'Asistencia Coreográfica', 5),
  ('mm', md5('darf-person:mariana hernández')::uuid, 'creativo', 'Instalaciones', 6),
  ('mm', md5('darf-person:minerva de santiago')::uuid, 'creativo', 'Maquillaje', 7),
  ('mm', md5('darf-person:mia castro')::uuid, 'creativo', 'Vestuario', 8),
  ('mm', md5('darf-person:maximiliano ramírez')::uuid, 'produccion', 'Asistente de Dirección', 1),
  ('mm', md5('darf-person:diego gamboa')::uuid, 'produccion', 'Asistente de Dirección', 2),
  ('mm', md5('darf-person:emiliano villalva')::uuid, 'produccion', 'Stage Manager', 3),
  ('mm', md5('darf-person:camila bauer')::uuid, 'produccion', 'Stage Coordinator', 4),
  ('mm', md5('darf-person:juan pablo villalva')::uuid, 'produccion', 'Ingeniero Audiovisual', 5),
  ('mm', md5('darf-person:alejandro martens')::uuid, 'produccion', 'Supervisor de Sonido', 6),
  ('mm', md5('darf-person:valeria de la torre')::uuid, 'produccion', 'Coord. Elenco y Vestuario', 7),
  ('mm', md5('darf-person:maría josé gil')::uuid, 'produccion', 'Supervisor de Utilería', 8),
  ('mm', md5('darf-person:aitana san román')::uuid, 'produccion', 'Asistente de Utilería', 9),
  ('mm', md5('darf-person:jesús barrios')::uuid, 'produccion', 'Asistencia en Iluminación', 10),
  ('mm', md5('darf-person:juan pablo estrada')::uuid, 'produccion', 'Líder de Fotografía', 11),
  ('mm', md5('darf-person:tamara garza')::uuid, 'produccion', 'Equipo Logístico', 12),
  ('mm', md5('darf-person:alexa martens')::uuid, 'produccion', 'Staff', 13);
insert into production_media (production_id, tipo, titulo, youtube_id, visibilidad, orden) values
  ('mm', 'video', 'Pro-Shot Oficial', 'lOfGNDV1qa8', 'publico', 1),
  ('mm', 'ensayo', 'Dancing Queen · Ensayo', 'CK3TjWGxQlo', 'fans', 1),
  ('mm', 'ensayo', 'Chiquitita · Ensayo', 'mQ-vKGXXsIY', 'fans', 2),
  ('mm', 'ensayo', 'Escena 3 (Mamma Mia) · Ensayo', 'fFQ-HSlO9uc', 'fans', 3),
  ('mm', 'ensayo', 'Escena 4 (Chiquitita & Dancing Queen) · Ensayo', 'M2SDeiTrOIs', 'fans', 4),
  ('mm', 'ensayo', 'Does Your Mother Know · Ensayo', 'IhVTnXS6AwQ', 'fans', 5),
  ('mm', 'ensayo', 'Mamma Mia x Dancing Queen · Ensayo', '-VI8e89E7Ws', 'fans', 6),
  ('mm', 'ensayo', 'Money, Money, Money · Ensayo', 'bDIISKQgaaA', 'fans', 7),
  ('mm', 'ensayo', 'One of Us x SOS · Ensayo', 'q_1K4QICzZo', 'fans', 8);
insert into production_thanks (production_id, texto, orden) values
  ('mm', 'Universidad del Valle de México (UVM)', 1),
  ('mm', 'Familias del elenco y equipo creativo', 2),
  ('mm', 'Sponsors y patrocinadores 2026', 3);

-- ──────── hsm ────────
update productions set
  frase = 'East High, un escenario y el valor de salirse del guion.', sinopsis = '¡Bienvenidos a East High! Las vacaciones terminaron, y en East High todo parece volver a la normalidad… hasta que Troy, el capitán del equipo de baloncesto, y Gabriella, una brillante estudiante nueva, sorprenden a todos al querer audicionar para el musical escolar.

Mientras los grupos sociales tradicionales luchan por mantener su lugar, Troy y Gabriella se enfrentan a la presión de sus amigos, las intrigas de los reyes del teatro, y sus propios miedos. ¿Podrán romper las reglas del instituto y seguir su pasión sin perderse a sí mismos en el camino?

Una historia divertida y conmovedora sobre el poder de la autenticidad, la amistad y la música que une a quienes se atreven a brillar, aunque el mundo les diga lo contrario.',
  temporada = '2025', fecha = '30 de Junio de 2025', duracion = null,
  clasificacion = null, basada_en = 'Disney''s HSM',
  color_fondo = '#1a0607', color_superficie = '#2a0c0e', color_texto = '#fcebd0', color_acento = '#f2b544',
  logo_path = '/producciones/hsm/logo.webp', ambiente_path = '/producciones/hsm/ambiente.jpg',
  estado = 'archivada'
where id = 'hsm';
insert into production_acts (id, production_id, nombre, orden) values (md5('darf-act:hsm:0')::uuid, 'hsm', 'Acto I', 1);
insert into production_songs (production_id, act_id, titulo, orden) values
  ('hsm', md5('darf-act:hsm:0')::uuid, 'Wildcat Cheer', 1),
  ('hsm', md5('darf-act:hsm:0')::uuid, 'The Start of Something New', 2),
  ('hsm', md5('darf-act:hsm:0')::uuid, 'Getcha Head in the Game', 3),
  ('hsm', md5('darf-act:hsm:0')::uuid, 'Auditions', 4),
  ('hsm', md5('darf-act:hsm:0')::uuid, 'What I''ve Been Looking For', 5),
  ('hsm', md5('darf-act:hsm:0')::uuid, 'What I''ve Been Looking For (Reprise)', 6),
  ('hsm', md5('darf-act:hsm:0')::uuid, 'Stick To The Status Quo', 7);
insert into production_acts (id, production_id, nombre, orden) values (md5('darf-act:hsm:1')::uuid, 'hsm', 'Acto II', 2);
insert into production_songs (production_id, act_id, titulo, orden) values
  ('hsm', md5('darf-act:hsm:1')::uuid, 'Counting on You', 1),
  ('hsm', md5('darf-act:hsm:1')::uuid, 'We''re All In This Together', 2),
  ('hsm', md5('darf-act:hsm:1')::uuid, 'Bop To The Top', 3),
  ('hsm', md5('darf-act:hsm:1')::uuid, 'Breaking Free', 4),
  ('hsm', md5('darf-act:hsm:1')::uuid, 'We''re All In This Together (Finale)', 5);
insert into people (id, nombre) values
  (md5('darf-person:patricio gonzález')::uuid, 'Patricio González'),
  (md5('darf-person:valentina lima')::uuid, 'Valentina Lima'),
  (md5('darf-person:mia castro')::uuid, 'Mia Castro'),
  (md5('darf-person:emmanuel pinto')::uuid, 'Emmanuel Pinto'),
  (md5('darf-person:alejandro lámbarri')::uuid, 'Alejandro Lámbarri'),
  (md5('darf-person:tamara garza')::uuid, 'Tamara Garza'),
  (md5('darf-person:santiago rodríguez')::uuid, 'Santiago Rodríguez'),
  (md5('darf-person:romina carmona')::uuid, 'Romina Carmona'),
  (md5('darf-person:ericka torres')::uuid, 'Ericka Torres'),
  (md5('darf-person:juan pablo estrada')::uuid, 'Juan Pablo Estrada'),
  (md5('darf-person:maría josé barragán')::uuid, 'María José Barragán'),
  (md5('darf-person:maría fernanda morales')::uuid, 'María Fernanda Morales'),
  (md5('darf-person:maría josé gil')::uuid, 'María José Gil'),
  (md5('darf-person:ana paola gonzález')::uuid, 'Ana Paola González'),
  (md5('darf-person:paola garcía')::uuid, 'Paola García'),
  (md5('darf-person:ana sofía ulloa')::uuid, 'Ana Sofía Ulloa'),
  (md5('darf-person:alexa martens')::uuid, 'Alexa Martens'),
  (md5('darf-person:mia insurreta')::uuid, 'Mia Insurreta'),
  (md5('darf-person:natalia díaz')::uuid, 'Natalia Díaz'),
  (md5('darf-person:ramón robles')::uuid, 'Ramón Robles'),
  (md5('darf-person:christian peña')::uuid, 'Christian Peña'),
  (md5('darf-person:kalani danino')::uuid, 'Kalani Danino'),
  (md5('darf-person:natalia ramírez')::uuid, 'Natalia Ramírez'),
  (md5('darf-person:emilia olvera')::uuid, 'Emilia Olvera'),
  (md5('darf-person:fernando fata')::uuid, 'Fernando Fata'),
  (md5('darf-person:yara sosa')::uuid, 'Yara Sosa'),
  (md5('darf-person:paloma lópez')::uuid, 'Paloma López'),
  (md5('darf-person:ana renata huerta')::uuid, 'Ana Renata Huerta'),
  (md5('darf-person:fernanda maturano')::uuid, 'Fernanda Maturano'),
  (md5('darf-person:maría bonilla')::uuid, 'María Bonilla'),
  (md5('darf-person:diego romero')::uuid, 'Diego Romero'),
  (md5('darf-person:andrés santillán')::uuid, 'Andrés Santillán'),
  (md5('darf-person:sandra lópez')::uuid, 'Sandra López'),
  (md5('darf-person:mariana hernández')::uuid, 'Mariana Hernández'),
  (md5('darf-person:emiliano villalva')::uuid, 'Emiliano Villalva'),
  (md5('darf-person:maria haro')::uuid, 'Maria Haro'),
  (md5('darf-person:juan pablo villalva')::uuid, 'Juan Pablo Villalva'),
  (md5('darf-person:alejandro martens')::uuid, 'Alejandro Martens'),
  (md5('darf-person:valeria de la torre')::uuid, 'Valeria De la Torre')
on conflict (id) do nothing;
insert into production_credits (production_id, person_id, tipo, papel, orden) values
  ('hsm', md5('darf-person:patricio gonzález')::uuid, 'reparto', 'Troy Bolton', 1),
  ('hsm', md5('darf-person:valentina lima')::uuid, 'reparto', 'Gabriella Montez', 2),
  ('hsm', md5('darf-person:mia castro')::uuid, 'reparto', 'Sharpay Evans', 3),
  ('hsm', md5('darf-person:emmanuel pinto')::uuid, 'reparto', 'Ryan Evans', 4),
  ('hsm', md5('darf-person:alejandro lámbarri')::uuid, 'reparto', 'Chad Danforth', 5),
  ('hsm', md5('darf-person:tamara garza')::uuid, 'reparto', 'Taylor McKessie', 6),
  ('hsm', md5('darf-person:santiago rodríguez')::uuid, 'reparto', 'Zeke Baylor', 7),
  ('hsm', md5('darf-person:romina carmona')::uuid, 'reparto', 'Martha Cox', 8),
  ('hsm', md5('darf-person:ericka torres')::uuid, 'reparto', 'Sra. Darbus', 9),
  ('hsm', md5('darf-person:juan pablo estrada')::uuid, 'reparto', 'Coach Bolton', 10),
  ('hsm', md5('darf-person:maría josé barragán')::uuid, 'reparto', 'Kelsi Nielsen', 11),
  ('hsm', md5('darf-person:maría fernanda morales')::uuid, 'reparto', 'Jackie Scott', 12),
  ('hsm', md5('darf-person:maría josé gil')::uuid, 'ensamble', null, 1),
  ('hsm', md5('darf-person:ana paola gonzález')::uuid, 'ensamble', null, 2),
  ('hsm', md5('darf-person:paola garcía')::uuid, 'ensamble', null, 3),
  ('hsm', md5('darf-person:ana sofía ulloa')::uuid, 'ensamble', null, 4),
  ('hsm', md5('darf-person:alexa martens')::uuid, 'ensamble', null, 5),
  ('hsm', md5('darf-person:mia insurreta')::uuid, 'ensamble', null, 6),
  ('hsm', md5('darf-person:natalia díaz')::uuid, 'ensamble', null, 7),
  ('hsm', md5('darf-person:ramón robles')::uuid, 'ensamble', null, 8),
  ('hsm', md5('darf-person:christian peña')::uuid, 'ensamble', null, 9),
  ('hsm', md5('darf-person:kalani danino')::uuid, 'ensamble', null, 10),
  ('hsm', md5('darf-person:natalia ramírez')::uuid, 'ensamble', null, 11),
  ('hsm', md5('darf-person:emilia olvera')::uuid, 'ensamble', null, 12),
  ('hsm', md5('darf-person:fernando fata')::uuid, 'ensamble', null, 13),
  ('hsm', md5('darf-person:yara sosa')::uuid, 'ensamble', null, 14),
  ('hsm', md5('darf-person:paloma lópez')::uuid, 'ensamble', null, 15),
  ('hsm', md5('darf-person:ana renata huerta')::uuid, 'ensamble', null, 16),
  ('hsm', md5('darf-person:fernanda maturano')::uuid, 'ensamble', null, 17),
  ('hsm', md5('darf-person:maría bonilla')::uuid, 'ensamble', null, 18),
  ('hsm', md5('darf-person:diego romero')::uuid, 'creativo', 'Dirección General', 1),
  ('hsm', md5('darf-person:ericka torres')::uuid, 'creativo', 'Asistencia de Dirección', 2),
  ('hsm', md5('darf-person:andrés santillán')::uuid, 'creativo', 'Dirección Coreográfica', 3),
  ('hsm', md5('darf-person:sandra lópez')::uuid, 'creativo', 'Producción Ejecutiva', 4),
  ('hsm', md5('darf-person:mariana hernández')::uuid, 'creativo', 'Instalaciones', 5),
  ('hsm', md5('darf-person:mia castro')::uuid, 'creativo', 'Vestuario', 6),
  ('hsm', md5('darf-person:emiliano villalva')::uuid, 'produccion', 'Stage Manager', 1),
  ('hsm', md5('darf-person:maria haro')::uuid, 'produccion', 'Stage Coordinator', 2),
  ('hsm', md5('darf-person:juan pablo villalva')::uuid, 'produccion', 'Ingeniero Audiovisual', 3),
  ('hsm', md5('darf-person:alejandro martens')::uuid, 'produccion', 'Supervisor de Sonido', 4),
  ('hsm', md5('darf-person:valeria de la torre')::uuid, 'produccion', 'Coord. Elenco y Vestuario', 5);
insert into production_media (production_id, tipo, titulo, youtube_id, visibilidad, orden) values
  ('hsm', 'video', 'Pro-Shot Oficial', '2t8v1NjM-zQ', 'publico', 1),
  ('hsm', 'ensayo', 'Breaking Free · Ensayo', 'p3a3nKx-rig', 'fans', 1),
  ('hsm', 'ensayo', 'Stick to the Status Quo · Ensayo', 'EQwbeFQpRkc', 'fans', 2),
  ('hsm', 'ensayo', 'We’re All In This Together · Ensayo', 'CohmdbLSVHY', 'fans', 3),
  ('hsm', 'ensayo', 'Ovaciones · Ensayo', 'zS0-c8bCMLA', 'fans', 4);
insert into production_facts (production_id, etiqueta, valor, orden) values
  ('hsm', 'Colectivo', 'Sunhills Valley (SHV)', 1);

-- ──────── showman ────────
update productions set
  frase = 'Bienvenidos al espectáculo más grande.', sinopsis = null,
  temporada = '2027', fecha = null, duracion = null,
  clasificacion = null, basada_en = null,
  color_fondo = '#08101f', color_superficie = '#0f1c36', color_texto = '#f7eedb', color_acento = '#e8be45',
  logo_path = '/producciones/showman/logo.webp', ambiente_path = '/producciones/showman/ambiente.jpg',
  estado = 'publicada'
where id = 'showman';
insert into people (id, nombre) values
  (md5('darf-person:diego romero')::uuid, 'Diego Romero'),
  (md5('darf-person:ana fer ramírez')::uuid, 'Ana Fer Ramírez'),
  (md5('darf-person:regina cedillo')::uuid, 'Regina Cedillo'),
  (md5('darf-person:valeria luna')::uuid, 'Valeria Luna'),
  (md5('darf-person:camila cedillo')::uuid, 'Camila Cedillo'),
  (md5('darf-person:patricio gonzález')::uuid, 'Patricio González'),
  (md5('darf-person:maría josé arias')::uuid, 'María José Arias'),
  (md5('darf-person:adriana alarcón')::uuid, 'Adriana Alarcón'),
  (md5('darf-person:juan pablo villalva')::uuid, 'Juan Pablo Villalva'),
  (md5('darf-person:valentina lima')::uuid, 'Valentina Lima'),
  (md5('darf-person:emiliano villalva')::uuid, 'Emiliano Villalva'),
  (md5('darf-person:mia castro')::uuid, 'Mia Castro'),
  (md5('darf-person:camila bauer')::uuid, 'Camila Bauer')
on conflict (id) do nothing;
insert into production_credits (production_id, person_id, tipo, papel, orden) values
  ('showman', md5('darf-person:diego romero')::uuid, 'creativo', 'Dirección Artística y Escénica', 1),
  ('showman', md5('darf-person:ana fer ramírez')::uuid, 'creativo', 'Dirección Vocal', 2),
  ('showman', md5('darf-person:regina cedillo')::uuid, 'creativo', 'Dirección Coreográfica', 3),
  ('showman', md5('darf-person:valeria luna')::uuid, 'creativo', 'Dirección Circense', 4),
  ('showman', md5('darf-person:camila cedillo')::uuid, 'creativo', 'Dirección Circense', 5),
  ('showman', md5('darf-person:patricio gonzález')::uuid, 'creativo', 'Co-dirección Escénica', 6),
  ('showman', md5('darf-person:maría josé arias')::uuid, 'creativo', 'Co-dirección Coreográfica', 7),
  ('showman', md5('darf-person:adriana alarcón')::uuid, 'creativo', 'Co-dirección Vocal', 8),
  ('showman', md5('darf-person:juan pablo villalva')::uuid, 'produccion', 'Jefe de Producción', 1),
  ('showman', md5('darf-person:valentina lima')::uuid, 'produccion', 'Gerente de Producción', 2),
  ('showman', md5('darf-person:emiliano villalva')::uuid, 'produccion', 'Stage Manager', 3),
  ('showman', md5('darf-person:mia castro')::uuid, 'produccion', 'Dirección Visual', 4),
  ('showman', md5('darf-person:camila bauer')::uuid, 'produccion', 'Assistant Stage Manager', 5);

commit;
select id, estado, (select count(*) from production_credits c where c.production_id = p.id) creditos,
       (select count(*) from production_songs s where s.production_id = p.id) canciones
from productions p order by id;
