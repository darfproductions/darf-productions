# DARF PRODUCTIONS 2.0

**Documento maestro de visión, alcance, arquitectura y hoja de ruta**

- Versión: 1.0
- Fecha: Octubre de 2026
- Proyecto: DARF Productions
- Repositorio: `github.com/darfproductions/darf-productions`
- Web actual: `darfproductions.com`
- Rama de desarrollo: `darf-2.0`

> Documento entregado por Johann (DARF Productions). Se guarda tal cual como
> contexto permanente del proyecto. El estado de ejecución y los hallazgos de
> la Fase 0 viven en `docs/DARF-2.0-FASE-0.md`.

---

## 1. Propósito del documento

Este documento establece la visión integral de DARF Productions 2.0.

No es simplemente una lista de cambios de código ni una instrucción para reorganizar los archivos existentes. Define el producto que queremos construir, sus objetivos, sus funciones, la experiencia que debe ofrecer, las decisiones arquitectónicas que debemos considerar y las condiciones que deben cumplirse antes de publicar una nueva versión.

Claude Code debe utilizar este documento como contexto general del proyecto para investigar, planificar, proponer soluciones, desarrollar funcionalidades y verificar resultados.

La implementación debe realizarse por etapas, con una visión global clara y sin perder de vista las dependencias entre módulos.

**Principio fundamental:** no queremos únicamente una página web más bonita o un código mejor organizado. Queremos convertir DARF en una plataforma integral, visualmente atractiva, autogestionable, modular, segura y preparada para crecer como productora de espectáculos.

### 1.1. Prioridades fundamentales

Todas las decisiones deben equilibrar cuatro prioridades:

1. **Identidad y experiencia:** construir una presencia digital memorable, contemporánea y coherente con la personalidad de DARF.
2. **Autonomía operativa:** permitir que el equipo gestione producciones, contenido, eventos, usuarios y otras operaciones desde la plataforma, sin depender constantemente de modificaciones de código.
3. **Arquitectura sostenible:** crear una base tecnológica organizada, reutilizable, documentada y preparada para incorporar nuevas funcionalidades.
4. **Seguridad y continuidad:** proteger los datos, las cuentas, las operaciones y, especialmente, la boletería que ya está funcionando.

La seguridad de la operación actual tiene prioridad sobre la velocidad de desarrollo.

## 2. Contexto actual

### 2.1. ¿Qué es DARF?

DARF Productions es una productora de teatro musical y espectáculos. Su plataforma digital debe servir tanto para presentar las producciones al público como para administrar internamente los procesos necesarios para realizarlas.

La visión incluye la cartelera, el archivo de producciones, la información artística, los eventos, la venta y validación de boletos, la relación con el público, la gestión de equipos y futuras funcionalidades como audiciones y una base de talento.

### 2.2. Situación técnica de partida

Según la auditoría de solo lectura realizada sobre la versión actual:

- La aplicación está construida principalmente con HTML, CSS y JavaScript.
- `index.html` concentra numerosas pantallas y secciones.
- `js/app.js` reúne una parte importante de la lógica de la aplicación.
- `css/styles.css` contiene los estilos visuales.
- `js/config.js` contiene la configuración de conexión con Supabase.
- Existe una carpeta de migraciones de base de datos en `supabase/migrations/`.
- Existe una función de Supabase denominada `notify-contact`, que utiliza Resend para enviar notificaciones.
- Vercel publica la web a partir del repositorio de GitHub.
- El dominio público está gestionado mediante GoDaddy.
- Supabase se utiliza para autenticación, almacenamiento y operaciones de datos.

Estos detalles deben verificarse cuando sea necesario tomar decisiones técnicas. No se debe asumir que toda la documentación existente coincide exactamente con la configuración desplegada.

### 2.3. Qué funciona actualmente

La plataforma ya cuenta con funcionalidades operativas que debemos conservar y mejorar:

- Registro e inicio de sesión.
- Perfiles y roles de usuarios.
- Producciones y funciones.
- Configuración de asientos, zonas y precios.
- Selección de asientos y creación de órdenes.
- Reservas de asientos durante el proceso de compra.
- Aprobación y rechazo de órdenes.
- Ventas en taquilla.
- Códigos de descuento.
- Emisión de boletos y códigos QR.
- Validación de boletos en puerta.
- Generación de boletos en PDF.
- Galerías y otros contenidos.
- Panel administrativo.
- Fan Zone y contenidos asociados a las producciones.

Estas funcionalidades no deben considerarse prescindibles simplemente porque queramos cambiar la apariencia o la arquitectura.

### 2.4. Limitaciones actuales identificadas

La auditoría inicial encontró varias áreas de mejora:

- Una parte importante del contenido de las producciones está escrita directamente en el código.
- La creación de una producción nueva no genera automáticamente una página pública completa.
- Algunas funciones y componentes tratan a Showman como un caso especial.
- El sistema de permisos es demasiado general para las necesidades futuras.
- El panel administrativo necesita una reorganización.
- El diseño visual puede mejorar en personalidad, consistencia y adaptación a móviles.
- Algunas imágenes son demasiado pesadas.
- Existen estilos repetidos y elementos con apariencia inconsistente.
- La accesibilidad y la navegación mediante teclado necesitan mejoras.
- DARFY todavía utiliza respuestas fijas en lugar de funcionar como un asistente contextual.
- La documentación y el estado real de algunos componentes de la base de datos necesitan verificarse.

Estas limitaciones deben abordarse como parte de una evolución integral, no mediante arreglos aislados que generen más trabajo después.

## 3. Visión general de DARF 2.0

DARF 2.0 debe convertirse en la plataforma central de gestión y comunicación de DARF Productions.

Queremos que una persona autorizada pueda crear una producción, completar su información, personalizar su presentación, añadir sus canciones, registrar el reparto y el equipo, publicar contenido, gestionar sus funciones y administrar los módulos correspondientes sin tener que pedirle a un programador que construya una página nueva.

La plataforma debe distinguir claramente entre:

- **La experiencia pública:** diseñada para espectadores, compradores, artistas y visitantes.
- **La experiencia administrativa:** diseñada para que el equipo gestione la operación de forma eficiente.
- **La infraestructura interna:** encargada de datos, seguridad, permisos, automatizaciones y reglas de negocio.

Estas tres capas deben funcionar como un sistema integrado, pero con responsabilidades claramente separadas.

### 3.1. Objetivos concretos

DARF 2.0 debe permitir:

1. Crear y administrar producciones desde un panel.
2. Generar páginas públicas a partir de plantillas reutilizables.
3. Editar contenido sin modificar archivos de código.
4. Personalizar visualmente cada producción sin perder la identidad de DARF.
5. Administrar funciones, eventos y Fan Zones desde el contexto de cada producción.
6. Asignar permisos específicos por usuario, módulo, acción y producción.
7. Mantener una boletería confiable y segura.
8. Gestionar perfiles personales y profesionales.
9. Incorporar un sistema de audiciones.
10. Mantener una base de talento reutilizable.
11. Desarrollar un asistente DARFY realmente útil.
12. Mejorar la experiencia móvil, el rendimiento y la accesibilidad.
13. Reducir la dependencia de cambios manuales en el código.
14. Permitir que la plataforma crezca sin tener que reconstruirla cada vez que aparezca una nueva necesidad.

## 4. Rediseño visual e identidad de marca

El rediseño visual es una parte central del proyecto. No debe quedar reducido a cambiar colores, tipografías o botones.

Queremos una experiencia digital que transmita la personalidad de una productora de espectáculos, que destaque las producciones y que resulte atractiva tanto para el público como para artistas, colaboradores y compradores.

### 4.1. Dirección artística

La dirección elegida combina tres enfoques:

**A. Glamour teatral**
- Sensación de estreno y espectáculo.
- Composiciones dramáticas.
- Contrastes marcados.
- Fotografía escénica protagonista.
- Una presentación cuidada y de calidad.

**B. Contemporáneo y vibrante**
- Energía visual.
- Composiciones dinámicas.
- Acentos de color.
- Elementos gráficos expresivos.
- Una experiencia digital actual y juvenil cuando el contenido lo permita.

**C. Editorial y cinematográfico**
- Fotografía de gran impacto.
- Jerarquías tipográficas claras.
- Composiciones elegantes.
- Ritmo visual.
- Narrativa visual y presentación cuidada del contenido.

No queremos mezclar estos estilos de forma indiscriminada. El objetivo es que convivan dentro de una identidad coherente y que se utilicen según la naturaleza de cada pantalla y producción.

### 4.2. Sistema visual general de DARF

Se debe diseñar un sistema visual central que defina:

- Paleta de colores institucional.
- Tipografías y jerarquías.
- Escalas de tamaños.
- Espaciados.
- Bordes y radios.
- Sombras.
- Botones y estados.
- Campos de formularios.
- Tarjetas.
- Iconografía.
- Animaciones y transiciones.
- Estados de carga, éxito, error y advertencia.
- Comportamiento en móvil, tablet y escritorio.

Estos elementos deben definirse una sola vez y reutilizarse en toda la plataforma.

Cambiar una variable institucional no debería requerir modificar manualmente cientos de elementos.

### 4.3. Identidad visual por producción

Cada espectáculo debe tener una personalidad visual propia.

Por ejemplo, Mamma Mia, High School Musical y Showman pueden presentar paletas, fotografías y recursos gráficos distintos, pero todos deben reconocerse como parte de DARF Productions.

La plataforma debe permitir configurar, desde el panel y sin programar:

- Color principal.
- Color secundario o de acento.
- Imagen de portada.
- Imágenes complementarias.
- Recursos visuales permitidos.
- Algunas opciones de presentación dentro de los límites del sistema de diseño.

La personalización no debe permitir que una producción rompa la accesibilidad, la legibilidad o la estructura general de la web.

### 4.4. Diseño primero para móviles

La experiencia debe diseñarse primero para celulares y después adaptarse a pantallas más grandes.

Esto afecta especialmente a:

- Navegación.
- Cartelera.
- Páginas de producción.
- Galerías y videos.
- Formularios.
- Inicio de sesión.
- Mi Cuenta.
- Checkout.
- Mapa de asientos.
- Panel administrativo.

No basta con reducir el tamaño de una página de escritorio. La distribución y la interacción deben tener sentido en una pantalla táctil.

### 4.5. Rendimiento y accesibilidad

Se debe:

- Optimizar las fotografías para web.
- Generar tamaños apropiados para diferentes pantallas.
- Evitar cargar imágenes gigantes cuando no sean necesarias.
- Utilizar carga diferida cuando corresponda.
- Mejorar los textos alternativos.
- Garantizar contraste suficiente.
- Mostrar claramente el foco al navegar con teclado.
- Utilizar controles semánticos y etiquetas accesibles.
- Permitir reducir animaciones.
- Evitar efectos que ralenticen o dificulten la navegación.

Las fotografías originales disponibles deben revisarse y aprovecharse antes de buscar recursos nuevos.

### 4.6. Diseñar antes de implementar

Antes de aplicar el rediseño a la aplicación real, Claude debe preparar una propuesta visual con referencias y alternativas.

La propuesta debe contemplar, como mínimo:

- Portada.
- Cartelera.
- Archivo.
- Página de producción.
- Página de una función.
- Login y registro.
- Mi Cuenta.
- Fan Zone.
- Checkout.
- Panel administrativo.
- Editor de producción.

Las propuestas deben mostrarse en móvil y escritorio.

El usuario elegirá la dirección final antes de que se implemente de forma generalizada.

## 5. Producciones y contenido editable

Una de las metas principales de DARF 2.0 es eliminar la necesidad de programar una página nueva cada vez que se produce un espectáculo.

### 5.1. Una plantilla común de producción

Todas las producciones deben utilizar una estructura común, alimentada con sus propios datos.

La plantilla debe permitir presentar, cuando corresponda:

- Nombre de la producción.
- Imagen principal.
- Descripción breve.
- Sinopsis.
- Temporada o año.
- Canciones.
- Actos.
- Reparto.
- Equipo creativo.
- Equipo de producción.
- Ensamble.
- Crew.
- Ficha técnica.
- Videos.
- Galería.
- Agradecimientos.
- Funciones y eventos.
- Fan Zone.
- Información adicional.

No todos los campos tienen que ser obligatorios en todas las producciones. El sistema debe definir cuáles son necesarios y cuáles opcionales.

### 5.2. Canciones y actos

Las canciones deben almacenarse como elementos individuales y ordenados.

Cada canción puede tener:

- Título.
- Acto.
- Orden.
- Información adicional cuando sea necesaria.

El panel debe permitir añadir, editar, eliminar y reordenar canciones. La numeración debe generarse automáticamente, sin tener que escribirla manualmente.

### 5.3. Reparto y equipos

El reparto debe relacionar personajes con personas.

Los equipos deben utilizar registros estructurados para relacionar a una persona con su función o puesto.

Debe distinguirse entre:

- Reparto.
- Equipo creativo.
- Equipo de producción.
- Ensamble.
- Crew.
- Personal técnico.

Siempre que sea posible, estos registros deben vincularse con el perfil de la persona correspondiente, evitando duplicar datos.

### 5.4. Estados de producción

El sistema debe contemplar estados claramente diferenciados:

- En preparación.
- Activa o en cartelera.
- Finalizada o archivada.
- Cancelada.
- Oculta.

Archivar una producción no debe borrarla.

Cancelar una producción debe conservar su información e historial.

Ocultar una producción debe retirarla de la vista pública sin eliminar sus datos.

Los cambios de estado deben tener reglas claras, especialmente cuando existen funciones, ventas o boletos asociados.

### 5.5. Crear una producción nueva

El flujo ideal debe ser:

1. Un administrador crea una producción.
2. Introduce los datos generales.
3. Añade imágenes y personaliza el tema visual.
4. Completa el contenido.
5. Asocia personas, funciones y eventos.
6. Configura la Fan Zone.
7. Previsualiza la página.
8. Guarda como borrador.
9. Publica cuando esté lista.

El resultado debe ser una página pública funcional basada en la plantilla general, sin crear manualmente una página en el código.

## 6. Eventos, funciones y Fan Zone

Cada producción debe tener dos elementos propios:

1. Una lista de funciones y eventos asociados.
2. Una Fan Zone específica de esa producción.

Los módulos generales pueden existir en el panel administrativo, pero el usuario debe poder administrarlos también desde el contexto de una producción.

Por ejemplo, al abrir Mamma Mia en el panel, el administrador debería encontrar su contenido, equipo, funciones y Fan Zone sin tener que buscar cada elemento en módulos desconectados.

Esto no significa duplicar tablas o información. La arquitectura debe permitir una administración contextual utilizando los mismos datos y registros.

### 6.1. Flexibilidad de eventos

La plataforma debe permitir evaluar diferentes modalidades de acceso, como:

- Asiento numerado.
- Admisión general.
- Otras modalidades futuras que se justifiquen.

Cada modalidad debe tener reglas de inventario, precio, compra y validación claramente definidas.

No se debe implementar una nueva modalidad de venta hasta que su funcionamiento esté modelado y probado.

## 7. Panel administrativo

El panel administrativo debe rediseñarse tanto visual como funcionalmente.

No queremos un listado interminable de opciones. Queremos una herramienta de trabajo organizada por tareas, responsabilidades y contexto.

### 7.1. Estructura

Debe contemplar:

- Inicio o resumen.
- Producciones.
- Contenido.
- Funciones y eventos.
- Boletería.
- Usuarios y permisos.
- Galerías y archivos.
- Audiciones, cuando se implemente.
- Base de talento, cuando se implemente.
- Configuración y otros módulos autorizados.

La estructura definitiva debe diseñarse según las necesidades reales de cada rol.

Se pueden utilizar subpáginas, pestañas, menús desplegables, secciones plegables o paneles secundarios cuando hagan más sencilla la navegación.

### 7.2. Editor de producción

Debe ser una herramienta clara para personas que no programan.

Debe incluir:

- Formularios organizados por secciones.
- Campos estructurados.
- Validaciones.
- Guardado claro.
- Borradores cuando corresponda.
- Previsualización.
- Confirmaciones antes de acciones importantes.
- Mensajes comprensibles de error y éxito.

### 7.3. Permisos

La arquitectura de permisos debe superar el sistema actual de roles globales.

Se requiere controlar el acceso por:

- Usuario.
- Producción.
- Módulo.
- Acción.

Ejemplos:

- Un administrador puede gestionar únicamente Showman.
- Otro puede gestionar Mamma Mia y Teen Beach Movie.
- Una persona de puerta puede validar QR de una función autorizada, sin acceder a ventas, precios o datos administrativos que no necesita.
- Una persona puede consultar información sin tener permiso para modificarla.

La interfaz debe mostrar solo las secciones permitidas, pero la seguridad también debe aplicarse en el servidor y en la base de datos.

Ocultar botones no es suficiente.

### 7.4. Super Admin / Director

Debe existir un rol de máxima autoridad dentro de la plataforma, denominado Super Admin o Director.

Este rol debe poder:

- Crear producciones.
- Administrar usuarios.
- Asignar y modificar roles.
- Configurar permisos.
- Gestionar los módulos de la plataforma.

Este privilegio se limita a la aplicación. No significa que el usuario obtenga automáticamente acceso a contraseñas, secretos, consolas externas o servicios de infraestructura.

## 8. Boletería y protección de Showman

La boletería es una de las partes más delicadas de DARF 2.0.

La nueva plataforma debe mejorar la experiencia visual sin poner en peligro las reglas de negocio que ya funcionan.

### 8.1. Funciones que deben preservarse

- Selección de asientos.
- Prevención de doble venta.
- Reservas temporales o pendientes según las reglas existentes.
- Creación y gestión de órdenes.
- Aprobación y rechazo de compras.
- Flujo de pago o reporte mediante WhatsApp.
- Venta en taquilla.
- Descuentos.
- Emisión de boletos.
- Códigos QR.
- Validación de entradas en puerta.
- Generación de boletos en PDF.
- Relaciones entre funciones, asientos, órdenes y boletos.
- Reglas de seguridad de base de datos y funciones protegidas.

Los precios deben calcularse y validarse en el servidor. El navegador no debe decidir el precio final de una compra.

### 8.2. Cambios que deben evaluarse

- Rediseño del mapa de asientos.
- Mejoras visuales de los estados de los asientos.
- Checkout más claro y cómodo en móvil.
- Mensajes más claros durante la compra.
- Soporte para admisión general.
- Vencimiento automático de órdenes pendientes.

Cada cambio de lógica debe evaluarse por separado. El rediseño visual no debe utilizarse como excusa para reescribir innecesariamente los mecanismos críticos.

### 8.3. Pruebas obligatorias

Antes de aprobar cualquier cambio en la boletería, deben probarse:

- Intentos simultáneos de comprar el mismo asiento.
- Cálculo de precios.
- Descuentos.
- Creación y aprobación de órdenes.
- Rechazo y cancelación.
- Emisión de boletos.
- QR válido e inválido.
- QR ya utilizado.
- Acceso de distintos roles.
- Funcionamiento en dispositivos móviles.

Todas estas pruebas deben realizarse con datos ficticios en el entorno de desarrollo.

## 9. Mi Cuenta y perfiles

La sección Mi Cuenta debe ofrecer una experiencia más completa y confiable.

### 9.1. Perfil personal

Debe contemplar:

- Nombre.
- Apellidos.
- Correo electrónico.
- Teléfono.
- Fecha de nacimiento.
- Cambio seguro de contraseña.
- Fotografía personal.

Los cambios de correo y contraseña deben seguir los mecanismos de verificación y seguridad correspondientes.

### 9.2. Perfil profesional

Debe existir una distinción clara entre la fotografía personal del usuario y su retrato profesional.

La fotografía personal pertenece a su perfil privado o de cuenta.

El retrato profesional puede utilizarse en páginas públicas de reparto, equipo creativo y producciones.

Los administradores autorizados deben poder asignar o reemplazar el retrato profesional según los permisos definidos.

### 9.3. Historial del usuario

Deben corregirse y completarse las vistas relacionadas con:

- Transacciones.
- Boletos adquiridos.
- Próximos eventos.
- Eventos pasados.
- Detalles de las compras.

Cada usuario debe acceder únicamente a sus propios datos y a la información pública de las funciones correspondientes.

## 10. Sistema de audiciones

El módulo de audiciones forma parte de la visión de DARF 2.0 y debe contemplarse en el diseño de la arquitectura, aunque se implemente en una fase posterior.

### 10.1. Convocatorias

Los administradores autorizados deben poder:

- Crear varias convocatorias.
- Definir requisitos.
- Establecer fechas y plazos.
- Configurar formularios.
- Publicar y cerrar convocatorias.
- Consultar solicitudes.
- Filtrar y organizar postulantes.

### 10.2. Formularios de inscripción

Los formularios deben ser configurables según las necesidades de cada audición.

Pueden solicitar datos personales necesarios, experiencia, especialidades, enlaces a videos, portafolios y otros materiales.

Debe evitarse recopilar información que no sea necesaria para el proceso.

### 10.3. Evaluación

El sistema debe contemplar:

- Revisión de solicitudes.
- Control de asistencia el día de audición.
- Acceso para jueces autorizados.
- Puntuaciones individuales.
- Notas privadas.
- Consolidación de resultados.
- Estados del proceso.
- Selección de candidatos.

Las evaluaciones y notas deben tener acceso restringido.

### 10.4. Integración con producciones

Cuando una persona sea seleccionada, debe poder vincularse con la producción, el reparto o el equipo correspondiente.

No debe ser necesario volver a introducir toda su información.

## 11. Base de talento

La base de talento debe ser un directorio permanente, independiente de las convocatorias abiertas.

Debe permitir conservar y consultar perfiles profesionales de artistas y colaboradores.

Cada ficha puede incluir:

- Nombre profesional.
- CV.
- Portafolio.
- Enlaces a videos.
- Especialidades.
- Experiencia.
- Datos de contacto.
- Intereses profesionales.
- Participaciones en producciones.

Debe incluir búsqueda y filtros para los usuarios autorizados.

La información privada no debe publicarse automáticamente. Antes de implementarlo, deben definirse los permisos, el consentimiento, la visibilidad, la conservación y la eliminación de datos.

## 12. Modelo central de personas

La arquitectura debe contemplar desde el principio que una misma persona puede participar en DARF de distintas maneras.

Por ejemplo, una persona puede ser:

- Usuario de la web.
- Postulante a una audición.
- Integrante del reparto.
- Miembro del equipo creativo.
- Miembro del equipo de producción.
- Artista de la base de talento.
- Juez de audición.
- Administrador.

Estos papeles no deberían obligar a crear múltiples identidades desconectadas.

Debe evaluarse un registro central de persona y relaciones separadas para cada función.

Es importante distinguir:

- Datos personales.
- Información profesional.
- Participación en producciones.
- Solicitudes de audición.
- Evaluaciones privadas.
- Permisos administrativos.

Compartir la identidad de una persona no significa que toda su información deba ser visible para todos los módulos.

## 13. DARFY: asistente virtual

DARFY debe evolucionar de las respuestas fijas actuales a un asistente útil, conectado con la información actualizada de DARF.

### 13.1. Objetivos

DARFY debe ayudar a visitantes a:

- Encontrar información de las producciones.
- Consultar funciones y eventos.
- Resolver preguntas frecuentes.
- Orientarse en la web.
- Encontrar información de compra y acceso.
- Recibir respuestas basadas en contenido actualizado.

Se puede evaluar soporte de voz en una etapa posterior.

### 13.2. Seguridad y límites

DARFY no debe revelar:

- Datos de otros usuarios.
- Órdenes privadas.
- Información administrativa.
- Resultados o notas privadas de audiciones.
- Información personal no autorizada.
- Contenido interno que no deba ser público.

Debe reconocer cuándo no dispone de información suficiente y dirigir al usuario a un canal de contacto apropiado.

La arquitectura debe contemplar permisos, fuentes de información confiables, actualización de contenidos y protección frente a instrucciones maliciosas incluidas en el contenido que consulte.

## 14. Arquitectura técnica

No se ha tomado una decisión definitiva sobre el uso de un framework moderno.

Claude debe investigar y recomendar una arquitectura antes de iniciar una migración importante.

La recomendación debe considerar:

- Complejidad del código actual.
- Riesgo de afectar la boletería.
- Facilidad de mantenimiento.
- Compatibilidad con Supabase.
- Compatibilidad con Vercel.
- Manejo de rutas y plantillas.
- Reutilización de componentes.
- Formularios y panel administrativo.
- Pruebas automatizadas.
- Rendimiento.
- Accesibilidad.
- Seguridad.
- Costos y dependencias.
- Facilidad para que una persona no programadora pueda mantener el proyecto con ayuda de Claude Code.

No elegir una tecnología únicamente porque sea popular o porque facilite una tarea inmediata. La decisión debe responder a la visión completa de DARF 2.0.

### 14.1. Base de datos

La base de datos debe diseñarse para soportar los módulos actuales y futuros.

Antes de modificar el esquema:

- Revisar las migraciones existentes.
- Verificar el estado real de producción cuando exista autorización y sea necesario.
- Identificar las relaciones y reglas críticas.
- Documentar las decisiones.
- Evaluar el impacto de cada cambio.

No se deben editar migraciones históricas que ya se hayan aplicado. Los cambios futuros deben incorporarse mediante nuevas migraciones.

### 14.2. Modularidad

La aplicación debe organizarse en piezas comprensibles y reutilizables.

Como mínimo, evaluar una separación lógica entre:

- Web pública.
- Producciones y contenido.
- Autenticación y perfiles.
- Administración y permisos.
- Eventos y funciones.
- Boletería.
- Audiciones.
- Base de talento.
- Fan Zone.
- DARFY.

La separación definitiva depende de la arquitectura recomendada. No es obligatorio crear una aplicación independiente para cada módulo si eso añade complejidad innecesaria.

## 15. Seguridad y entornos separados

Esta sección es obligatoria y tiene prioridad antes de desarrollar funcionalidades que interactúen con datos.

### 15.1. Producción actual

La versión 1.0 debe seguir operando sin interrupciones.

Durante el desarrollo de DARF 2.0 no se debe:

- Cambiar la base de datos de producción para probar funcionalidades.
- Ejecutar migraciones experimentales en producción.
- Modificar las variables de entorno de producción.
- Alterar el dominio público.
- Publicar cambios en la rama de producción.
- Ejecutar scripts destructivos sobre datos reales.
- Probar compras o validaciones de boletos reales.

### 15.2. Entorno de desarrollo

Debe crearse un entorno independiente para DARF 2.0.

La arquitectura acordada es:

- **GitHub:** rama `main` para DARF 1.0 y rama `darf-2.0` para el desarrollo.
- **Supabase:** proyecto DEV separado, con configuración y credenciales propias.
- **Vercel:** proyecto de desarrollo separado, conectado a la rama `darf-2.0`.
- **Dominio:** mantener GoDaddy y el dominio oficial sin cambios durante el desarrollo.
- **Datos:** utilizar datos ficticios o preparados específicamente para pruebas.

No basta con que el sitio tenga otra URL. Debemos comprobar que utiliza el proyecto de Supabase correcto.

### 15.3. Vistas previas de Vercel

Todavía no está confirmado cómo está configurada la publicación de vistas previas.

Antes de probar la aplicación, Claude debe investigar:

- Qué ramas generan despliegues.
- Qué variables de entorno recibe cada tipo de despliegue.
- Si las vistas previas actuales pueden conectarse accidentalmente a producción.
- Cómo separar de manera verificable los entornos.

Una vista previa no debe considerarse segura solo por tener una URL diferente.

### 15.4. Creación de Supabase DEV

La creación y configuración de Supabase DEV debe evaluarse con ayuda de Claude.

Antes de realizarla, Claude debe presentar un plan claro que explique:

- Qué recursos se crearán.
- Qué configuración será necesaria.
- Qué datos se utilizarán.
- Cómo se separarán las credenciales.
- Cómo se comprobará que no existe conexión con producción.
- Qué acciones debe realizar el usuario.
- Qué acciones puede ejecutar Claude.
- Qué riesgos existen y cómo se reducirán.

Claude debe obtener aprobación explícita antes de crear o modificar recursos externos.

### 15.5. Correo y servicios externos

El entorno DEV no debe enviar correos reales por accidente ni ejecutar acciones que afecten a usuarios de producción.

Se deben aislar las credenciales de correo y otros servicios externos. En las pruebas, utilizar mecanismos seguros de simulación o destinatarios de prueba cuando corresponda.

### 15.6. Datos y secretos

No se deben incluir en el repositorio:

- Contraseñas.
- Claves privilegiadas.
- Tokens privados.
- Datos personales innecesarios.
- Copias de respaldo con información sensible.
- Credenciales de producción.

No se deben copiar datos personales u órdenes reales a DEV sin una justificación, autorización y estrategia de protección adecuadas.

## 16. Hoja de ruta

La siguiente hoja de ruta establece resultados esperados, no una autorización automática para ejecutar todas las tareas.

### Fase 0. Entorno seguro

**Objetivo:** poder desarrollar DARF 2.0 sin afectar la web actual ni la boletería.

Tareas:

1. Confirmar rama y estado del repositorio.
2. Revisar la configuración de Vercel.
3. Investigar las vistas previas.
4. Preparar la propuesta de Supabase DEV.
5. Definir las variables de entorno separadas.
6. Aislar los servicios externos.
7. Preparar datos ficticios.
8. Definir pruebas de aislamiento.
9. Documentar el procedimiento de reversión.

**Criterio de salida:** existe evidencia de que el entorno DEV no escribe ni ejecuta operaciones contra producción.

### Fase D1. Dirección artística

**Objetivo:** definir el lenguaje visual de DARF 2.0.

Tareas:

1. Revisar el logo vectorial y las fotografías disponibles.
2. Buscar referencias visuales pertinentes.
3. Preparar dos o tres direcciones conceptuales.
4. Explicar las ventajas de cada propuesta.
5. Recomendar una combinación coherente de glamour teatral, energía contemporánea y diseño editorial.
6. Presentar la propuesta al usuario.

**Criterio de salida:** dirección visual aprobada.

### Fase D2. Sistema visual y maquetas

**Objetivo:** demostrar cómo se verá y funcionará la nueva experiencia antes de implementarla en la aplicación.

Preparar maquetas de:

- Portada.
- Cartelera y archivo.
- Página de producción.
- Login y Mi Cuenta.
- Fan Zone.
- Checkout y mapa de asientos.
- Panel administrativo.
- Editor de producción.

Deben contemplar móvil y escritorio.

**Criterio de salida:** maquetas revisadas y aprobadas.

### Fase 1. Fundamentos

**Objetivo:** establecer una arquitectura mantenible.

Tareas:

1. Comparar las opciones tecnológicas.
2. Documentar la arquitectura recomendada.
3. Definir el sistema de diseño.
4. Organizar los componentes.
5. Establecer pruebas iniciales.
6. Actualizar la documentación técnica.
7. Definir convenciones de código y seguridad.

**Criterio de salida:** estructura documentada y pruebas básicas funcionando en DEV.

### Fase 2. Contenido editable y web pública

**Objetivo:** eliminar la dependencia del código para administrar el contenido cotidiano.

Tareas:

1. Diseñar el modelo estructurado de producción.
2. Implementar la plantilla pública.
3. Migrar el contenido necesario de forma controlada.
4. Incorporar temas visuales por producción.
5. Gestionar canciones, actos, reparto y equipos.
6. Gestionar videos, galerías y otros contenidos.
7. Integrar eventos y Fan Zone.
8. Implementar borradores, previsualización y publicación.

**Criterio de salida:** se puede crear y publicar una producción de prueba sin programar una página específica.

### Fase 3. Panel administrativo y permisos

**Objetivo:** permitir que el equipo gestione la plataforma según sus responsabilidades.

Tareas:

1. Rediseñar el panel.
2. Implementar la gestión de usuarios.
3. Implementar permisos por producción, módulo y acción.
4. Incorporar el editor de producción.
5. Incorporar filtros y herramientas de administración.
6. Validar accesos permitidos y denegados.

**Criterio de salida:** los roles pueden realizar sus tareas sin acceder a módulos ni datos no autorizados.

### Fase 4. Boletería y checkout

**Objetivo:** mejorar la experiencia de compra preservando la lógica crítica.

Tareas:

1. Rediseñar el mapa de asientos.
2. Mejorar los estados y mensajes.
3. Rediseñar el checkout.
4. Mejorar la experiencia móvil.
5. Evaluar modalidades de admisión.
6. Evaluar el vencimiento de órdenes pendientes.
7. Ejecutar pruebas de regresión.

**Criterio de salida:** todas las pruebas críticas de compra, inventario, permisos y QR pasan en DEV.

### Fase 5. Perfiles, audiciones y talento

**Objetivo:** construir herramientas para la gestión de artistas y colaboradores.

Implementar por etapas:

1. Mi Cuenta.
2. Perfil profesional.
3. Audiciones.
4. Evaluaciones y selección.
5. Base de talento.
6. Integración con producciones.

**Criterio de salida:** cada módulo cuenta con reglas claras, permisos adecuados y pruebas.

### Fase 6. DARFY y capacidades futuras

**Objetivo:** integrar un asistente útil y otras mejoras que se aprueben.

Tareas:

1. Definir fuentes de información.
2. Diseñar límites de acceso.
3. Implementar respuestas basadas en información autorizada.
4. Probar preguntas frecuentes.
5. Probar intentos de obtener información privada.
6. Evaluar voz y capacidades adicionales.

### Fase final. Migración y publicación

La publicación de DARF 2.0 solo se realizará cuando:

- El usuario apruebe la versión final.
- Exista respaldo de los datos relevantes.
- Se haya diseñado la migración de datos reales.
- Se hayan validado las funciones críticas.
- Exista un plan de reversión.
- Se conozcan las consecuencias del cambio.
- Se haya verificado la configuración del despliegue.

La información real debe migrarse de forma planificada. No se debe reemplazar la base de datos real por la base de pruebas.

GoDaddy y el dominio oficial se tocarán únicamente cuando se apruebe el cambio definitivo.

## 17. Forma de trabajo con Claude Code

Claude debe actuar como colaborador técnico capaz de investigar, planificar y ejecutar tareas aprobadas de forma autónoma, pero respetando límites claros.

### 17.1. Autonomía esperada

Claude puede:

- Leer y analizar el repositorio.
- Revisar documentación.
- Identificar problemas.
- Investigar opciones técnicas.
- Proponer arquitectura.
- Preparar planes de implementación.
- Desarrollar funcionalidades en la rama autorizada.
- Crear pruebas.
- Actualizar documentación.
- Revisar errores.
- Proponer mejoras de rendimiento, accesibilidad y seguridad.

No debe necesitar instrucciones paso a paso para cada decisión de bajo riesgo. Se espera que pueda organizar tareas y anticipar dependencias.

### 17.2. Cuándo debe pedir aprobación

Debe detenerse y solicitar aprobación antes de:

- Crear o eliminar recursos externos.
- Cambiar permisos de aplicaciones conectadas.
- Modificar configuraciones sensibles.
- Ejecutar migraciones con impacto importante.
- Borrar datos.
- Alterar autenticación o controles de acceso críticos.
- Cambiar la lógica de compra o inventario.
- Usar datos reales en pruebas.
- Cambiar variables de producción.
- Hacer un despliegue final.
- Modificar el dominio.
- Ejecutar cualquier acción que pueda afectar la operación actual.

La autorización para desarrollar una fase no implica autorización para publicar en producción.

### 17.3. Forma de explicar el trabajo

El usuario no es programador profesional.

Por eso, Claude debe explicar las decisiones técnicas en español sencillo y práctico.

Cuando recomiende una solución, debe explicar:

1. Qué problema resuelve.
2. Por qué importa.
3. Qué alternativas existen.
4. Cuál recomienda.
5. Qué riesgos o costos tiene.
6. Qué necesita del usuario.
7. Cómo se comprobará que funciona.

No debe ocultar riesgos bajo expresiones genéricas como "ya está todo seguro" sin explicar qué se comprobó.

### 17.4. Reporte al terminar cada tarea

Cada bloque de trabajo debe terminar con un resumen que incluya:

- Qué se investigó o cambió.
- Qué archivos o módulos se modificaron.
- Qué pruebas se ejecutaron.
- Qué resultados se obtuvieron.
- Qué problemas siguen pendientes.
- Qué riesgos se identificaron.
- Qué decisión se necesita del usuario.
- Cuál es el siguiente paso recomendado.

Debe distinguir entre tareas terminadas, tareas parcialmente completadas y tareas solamente propuestas.

## 18. Criterios generales de aceptación

DARF 2.0 no se considera terminada porque el código funcione en una sola pantalla o porque el diseño se vea atractivo.

Cada entrega debe evaluarse según cuatro dimensiones.

**Experiencia visual**
- Diseño coherente con la identidad aprobada.
- Adaptación correcta a móvil y escritorio.
- Imágenes optimizadas.
- Jerarquía visual clara.
- Navegación intuitiva.
- Accesibilidad básica.
- Estados de carga, éxito y error comprensibles.

**Funcionalidad**
- Los flujos principales funcionan de principio a fin.
- El contenido se administra desde el panel cuando corresponde.
- Las plantillas son reutilizables.
- Los cambios se reflejan correctamente en la web pública.
- Los errores se gestionan de forma comprensible.

**Seguridad**
- Los permisos se aplican también en el servidor.
- Los usuarios solo acceden a los datos autorizados.
- DEV está separado de producción.
- No hay secretos privilegiados expuestos.
- Las acciones sensibles tienen controles adecuados.

**Mantenibilidad**
- La arquitectura está documentada.
- Los componentes son reutilizables.
- Las pruebas son reproducibles.
- Las migraciones se mantienen ordenadas.
- Las decisiones técnicas relevantes quedan registradas.

## 19. Primera instrucción para Claude Code

Al recibir este documento, Claude no debe empezar a reescribir la aplicación completa.

Su primera tarea es convertir esta visión en un plan ejecutable y seguro.

Debe:

1. Confirmar que está trabajando en la rama `darf-2.0`.
2. Verificar el estado del repositorio antes de modificar archivos.
3. Revisar la configuración de GitHub y Vercel que esté disponible.
4. Investigar qué configuración de despliegue se utiliza en las vistas previas.
5. Preparar una propuesta detallada para crear y aislar Supabase DEV.
6. Explicar cómo evitar que la aplicación de desarrollo se conecte a producción.
7. Definir qué acciones requieren intervención del usuario.
8. Proponer un mecanismo para verificar el aislamiento.
9. Presentar el plan antes de ejecutar cambios externos o sensibles.
10. Proponer en paralelo el proceso de dirección artística y maquetas, sin modificar todavía la web publicada.

No debe crear proyectos externos, cambiar variables, ejecutar migraciones, realizar acciones destructivas ni publicar cambios sin aprobación explícita.

### Instrucción permanente

Antes de tomar una decisión importante, Claude debe preguntarse:

- ¿Esta decisión contribuye a la visión completa de DARF 2.0?
- ¿Evita trabajo duplicado en el futuro?
- ¿Mantiene la experiencia de usuario clara?
- ¿Protege los datos y las operaciones existentes?
- ¿Respeta la separación entre desarrollo y producción?
- ¿Se puede probar y revertir de manera controlada?

Si no puede responder con seguridad, debe investigar y presentar opciones antes de actuar.

## 20. Resultado final que buscamos

Queremos que DARF 2.0 sea una plataforma que pueda evolucionar junto con la productora.

Una web pública atractiva que destaque cada espectáculo; un sistema administrativo que permita gestionar el contenido sin programar; una estructura que conecte producciones, eventos, personas y equipos; una boletería confiable; herramientas para audiciones y talento; y un asistente que ayude al público de verdad.

Todo ello debe funcionar sobre una arquitectura mantenible, con permisos adecuados y una separación estricta entre desarrollo y producción.

La meta no es terminar rápidamente una lista de tareas. La meta es construir bien la plataforma que DARF necesita para los próximos años, sin poner en riesgo lo que ya funciona.
