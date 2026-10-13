// Textos legales de DARF Productions (datos del responsable confirmados por Diego, 2026-10-13).
// Siguen la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.
// Si algo del sistema cambia (vencimiento de apartados, proveedores), actualizar aquí.

export const LEGAL_EMPRESA = {
  nombre: "DARF Productions",
  razonSocial: "Diego Andrés Romero Fernández",
  domicilio: "Av. Villas del Mesón 56, Fracc. Villas del Mesón, Juriquilla, 76226 Santiago de Querétaro, Qro., México",
  correo: "contact@darfproductions.com",
  actualizado: "13 de octubre de 2026",
};

export type LegalSeccion = { titulo: string; parrafos: string[] };
export type LegalDoc = { slug: string; titulo: string; resumen: string; secciones: LegalSeccion[] };

const E = LEGAL_EMPRESA;

export const PRIVACIDAD: LegalDoc = {
  slug: "privacidad",
  titulo: "Aviso de privacidad",
  resumen: "Qué datos guardamos, para qué los usamos, quién los ve y cómo puedes pedir que los corrijamos o borremos.",
  secciones: [
    { titulo: "Quién es responsable de tus datos", parrafos: [
      `${E.razonSocial}, quien opera con el nombre comercial "${E.nombre}", con domicilio en ${E.domicilio}, es responsable del tratamiento de tus datos personales. Para cualquier tema de privacidad escríbenos a ${E.correo}.`,
    ] },
    { titulo: "Qué datos guardamos", parrafos: [
      "Cuenta: nombre, correo, teléfono, fecha de nacimiento y foto de perfil si la subes.",
      "Compras: funciones, asientos, montos, códigos de descuento o de vendedor y el estado de tu orden.",
      "Audiciones: los datos del formulario, tu foto, tus respuestas, videos o ligas que compartas, y las calificaciones y notas del equipo de evaluación.",
      "Elenco y talleres: expediente con contacto de emergencia, datos de salud que tú nos des (alergias, condiciones, medicamentos, tipo de sangre), medidas para vestuario, documentos que subas, asistencia a ensayos, pagos y evaluaciones.",
      "Perfil profesional: lo que tú decidas publicar (retrato, semblanza, trayectoria, habilidades y redes).",
      "Mensajes que nos mandes por el formulario de contacto o por DARFY.",
    ] },
    { titulo: "Para qué los usamos", parrafos: [
      "Para venderte boletos, validarlos en la puerta y atender tus dudas; para organizar audiciones, ensayos, funciones y talleres; para cuidarte durante ensayos y funciones; para preparar vestuario; para cobrar inscripciones y mensualidades; y para avisarte de cambios importantes de tu producción.",
      "No vendemos tus datos ni los usamos para publicidad de terceros.",
    ] },
    { titulo: "Datos sensibles", parrafos: [
      "Los datos de salud de tu expediente (alergias, condiciones, medicamentos, tipo de sangre) son datos sensibles. Solo los pedimos para cuidarte en ensayos y funciones y solo los guardamos si tú (o tu tutor, si eres menor) los capturas y das tu consentimiento expreso al hacerlo. Puedes borrarlos o pedir que los borremos en cualquier momento.",
    ] },
    { titulo: "Menores de edad", parrafos: [
      "Si eres menor de edad, tu mamá, papá o tutor debe autorizar tu participación y sus datos de contacto quedan en tu expediente. Los datos de salud y medidas de menores solo los ve el equipo de la producción que los necesita.",
    ] },
    { titulo: "Quién ve tus datos", parrafos: [
      "Cada persona del equipo solo ve lo que su rol necesita: por ejemplo, taquilla ve compras y puerta solo valida boletos. Tus datos de salud solo los ve la producción en la que participas.",
      "Usamos proveedores que guardan los datos por cuenta nuestra y solo para operar la página: Vercel (alojamiento de la página), Supabase (base de datos y archivos), Resend (envío de correos) y Cloudflare (protección contra registros automáticos). Sus servidores pueden estar fuera de México, por ejemplo en Estados Unidos; esto es una remisión de datos para prestarnos el servicio, no una venta ni una transferencia para sus propios fines.",
      "Solo compartiríamos tus datos con una autoridad si la ley nos obliga.",
    ] },
    { titulo: "Fotos y video", parrafos: [
      "Solo usamos tu imagen de audiciones y ensayos para fines internos de la producción, salvo que autorices lo contrario. La foto y los datos de tu perfil profesional solo se publican si tú lo activas.",
    ] },
    { titulo: "Cookies", parrafos: [
      "Usamos cookies propias solo para mantener tu sesión abierta y recordar pasos de seguridad (por ejemplo, al recuperar tu contraseña). No usamos cookies de publicidad ni de rastreo de terceros.",
    ] },
    { titulo: "Cuánto tiempo guardamos tus datos", parrafos: [
      "Tu cuenta y tus compras, mientras tengas la cuenta; puedes eliminarla tú mismo en Mi cuenta. Las órdenes pagadas se conservan el tiempo que piden las leyes fiscales.",
      "Expedientes, asistencia, pagos y evaluaciones del elenco, mientras participes y hasta por 2 años después, para constancias y aclaraciones; después se borran o se vuelven anónimos.",
      "Solicitudes de audición, hasta que termine el proceso de esa audición; en el Registro permanente, hasta que te des de baja.",
      "El registro interno de cambios del panel (bitácora), 24 meses.",
    ] },
    { titulo: "Tus derechos", parrafos: [
      `Puedes pedir acceso, corrección, cancelación u oposición al uso de tus datos (derechos ARCO), o retirar tu autorización, escribiendo a ${E.correo} con tu nombre, el correo de tu cuenta y lo que pides. Te responderemos en un máximo de 20 días hábiles. Muchos datos los puedes corregir o borrar tú mismo en Mi cuenta.`,
    ] },
    { titulo: "Cambios a este aviso", parrafos: [`Si cambiamos este aviso, publicaremos aquí la versión nueva. Última actualización: ${E.actualizado}.`] },
  ],
};

export const TERMINOS: LegalDoc = {
  slug: "terminos",
  titulo: "Términos de uso y compra",
  resumen: "Cómo funcionan la cuenta, la compra de boletos, el apartado y la entrada a las funciones.",
  secciones: [
    { titulo: "Tu cuenta", parrafos: [
      "Para comprar o inscribirte a una audición necesitas una cuenta con un correo que sea tuyo. Eres responsable de lo que se haga con tu cuenta; no compartas tu contraseña.",
    ] },
    { titulo: "Compra de boletos", parrafos: [
      "Al elegir asientos o lugares se crea una solicitud que los aparta hasta 24 horas. Si la función es antes, el apartado vence 3 horas antes de que empiece (y nunca en menos de 30 minutos desde que apartaste). Si el pago no se confirma en ese tiempo, la solicitud vence y los lugares se liberan. El equipo puede darte más tiempo si se lo pides.",
      "Mientras no esté pagado, puedes cancelar tu apartado en Mi cuenta. Solo se venden funciones que no han empezado.",
      "La compra queda firme cuando el equipo de DARF confirma tu pago y aprueba la orden. Tus boletos con código QR aparecen entonces en Mi cuenta.",
      "Los precios, descuentos y totales los calcula el sistema al apartar; un código de descuento solo aplica en las zonas y funciones que indique.",
    ] },
    { titulo: "Entrada a la función", parrafos: [
      "Cada boleto entra una sola vez y solo a su función. Presenta tu QR en el celular o impreso. Llega con tiempo: el acceso puede cerrarse al empezar la función.",
    ] },
    { titulo: "Cambios en las funciones", parrafos: [
      "Si una función se cambia o se cancela, te avisaremos por los datos de tu cuenta y te ofreceremos opciones según la Política de cambios y reembolsos. Si cancelamos un boleto u orden, verás el motivo en Mi cuenta.",
    ] },
    { titulo: "Audiciones y elenco", parrafos: [
      "Inscribirte a una audición no garantiza un papel. Las ofertas de papel llegan a Mi cuenta y se aceptan o rechazan ahí. Participar en un elenco o taller implica seguir su reglamento.",
    ] },
    { titulo: "Uso correcto", parrafos: [
      "No está permitido revender boletos a sobreprecio, usar la página para mandar spam, ni intentar entrar a secciones que no te corresponden.",
    ] },
    { titulo: "Contacto", parrafos: [`${E.razonSocial} · ${E.domicilio} · ${E.correo}. Última actualización: ${E.actualizado}.`] },
  ],
};

export const REEMBOLSOS: LegalDoc = {
  slug: "reembolsos",
  titulo: "Cambios y reembolsos",
  resumen: "Qué pasa si no puedes ir, si se cambia una función o si se cancela.",
  secciones: [
    { titulo: "Si no puedes asistir", parrafos: [
      "Si todavía no pagas, cancela tu apartado en Mi cuenta y no pasa nada.",
      "Si ya pagaste, escríbenos por WhatsApp o desde Contacto con tu código de orden, de preferencia al menos 48 horas antes de la función. Según la disponibilidad te ofreceremos cambiar a otra función; los reembolsos de boletos pagados se revisan caso por caso y no aplican el día de la función ni después.",
    ] },
    { titulo: "Si DARF cambia o cancela una función", parrafos: [
      "Te ofreceremos cambiar tus boletos a otra función disponible o, si no te funciona, el reembolso completo de lo que pagaste, por el mismo medio de pago, en un máximo de 10 días hábiles.",
    ] },
    { titulo: "Eventos con costo", parrafos: [
      "Si DARF cancela un evento que pagaste, te reembolsamos lo que pagaste. Si no puedes ir a un evento ya pagado, escríbenos antes del evento.",
    ] },
    { titulo: "Órdenes sin pagar", parrafos: [
      "Una solicitud que no se paga a tiempo vence sola y no genera ningún cargo.",
    ] },
    { titulo: "Contacto", parrafos: [`${E.correo}. Última actualización: ${E.actualizado}.`] },
  ],
};
