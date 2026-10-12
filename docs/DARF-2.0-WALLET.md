# DARF 2.0 — Apple Wallet y Google Wallet (investigación, 2026-10-12)

## Estado: EN PAUSA (decisión de Diego, 2026-10-12)
Se retoma cuando Apple apruebe la cuenta de Apple Developer (ya pagada) y la página esté lanzada.
- Google: cuenta de emisor creada, **Issuer ID 3388000000023203308** (no es secreto). Se usará el
  mismo proyecto de Google Cloud del inicio de sesión con Google. Falta: habilitar Wallet API,
  cuenta de servicio `darf-wallet`, invitarla como Developer, cuentas de prueba, variables en Vercel.
- Falta el **botón oficial "Agregar a Google Wallet"** (SVG en español de las guías de marca de
  Google): pedírselo a Diego, desde aquí no se puede descargar.
- Código ya listo (sin usarse aún): `web/src/lib/wallet-env.ts` (variables solo de servidor) y
  `web/src/lib/google-wallet.ts` (JWT RS256 con crypto de Node, token OAuth, upsert de clases y
  objetos, liga de guardar). Falta: contenido de los pases, rutas, botones y pruebas.

Objetivo: botones **"Agregar a Apple Wallet"** y **"Agregar a Google Wallet"** para lo que hoy
ya tiene QR en la web: gafete (0078), boletos y credencial del Club Fan (0075).
El QR de cada pase es el mismo que ya usamos (puerta y "Checar con gafete" no cambian).

## Cómo funciona cada uno

| | Apple Wallet | Google Wallet |
|---|---|---|
| Qué se entrega | Un archivo `.pkpass` firmado que la web descarga | Una liga `https://pay.google.com/gp/v/save/<JWT firmado>` |
| Firma | Certificado "Pass Type ID" + llave privada (PKCS #7) | Llave de una cuenta de servicio de Google Cloud |
| Tipos de pase | `eventTicket` (boletos), `generic` (gafete), `storeCard` (Club Fan) | Event ticket (boletos), Generic (gafete y Club Fan) |
| Pruebas | Funciona desde el primer día en cualquier iPhone | "Modo demo": solo cuentas de prueba y el título dice "[TEST ONLY]" |
| Para publicarlo | Nada más | Pedir **acceso de publicación** (Google revisa la cuenta; tarda días) |
| Costo | La membresía de Apple Developer (ya está) | Gratis |

## Apple Wallet: pasos de Diego (portal de Apple Developer)

1. **Identifiers → + → Pass Type IDs.** Crear uno por tipo de pase:
   - `pass.mx.darfproductions.gafete`
   - `pass.mx.darfproductions.boleto`
   - `pass.mx.darfproductions.clubfan`
2. **Certificado por cada Pass Type ID:** Certificates → + → "Pass Type ID Certificate" → elegir el
   ID → subir un CSR → descargar el `.cer`.
   - El CSR se genera en una Mac (Acceso a Llaveros → Asistente de certificados → Solicitar un
     certificado de una autoridad). Al final se exporta como `.p12` con contraseña.
   - Sin Mac también se puede con `openssl` (lo hacemos juntos en tu computadora; la llave
     privada **nunca** se manda por chat ni se sube al repositorio).
3. Anotar el **Team ID** (Membership details).
4. Descargar el certificado intermedio **Apple WWDR (G4)**.

Lo que va en Vercel (variables de entorno, las pone Diego): certificado, llave privada,
contraseña de la llave, WWDR y Team ID. Primero en el proyecto de DEV; el oficial al lanzar.

## Google Wallet: pasos de Diego

1. Entrar a **Google Pay & Wallet Console** (pay.google.com/business/console) con la cuenta de
   DARF y crear la **cuenta de emisor** (Issuer). Llenar el **perfil del negocio**.
2. En **Google Cloud Console**: crear un proyecto "DARF Wallet", activar **Google Wallet API**,
   crear una **cuenta de servicio** y descargar su llave JSON.
3. En Wallet Console → Usuarios: agregar el correo de esa cuenta de servicio como Developer.
4. Agregar las cuentas de Google de prueba (la tuya y la de quien pruebe).
5. Cuando funcione en modo demo: **"Request publishing access"** (necesita perfil completo y al
   menos una "clase" de pase, que crea el código).

Lo que va en Vercel: ID del emisor y la llave JSON de la cuenta de servicio.

## Lo que haría yo (código)

- Librería `passkit-generator` (Node, la más usada; hay que instalarla con tu aprobación) para
  Apple. Google no necesita librería: un JWT firmado con la llave de la cuenta de servicio.
- Rutas: `/cuenta/wallet/apple/<tipo>` (descarga `.pkpass`) y `/cuenta/wallet/google/<tipo>`
  (redirige a la liga de Google). Solo la persona dueña del pase.
- Diseño con los colores del kit: gafete con su franja (STAFF/ELENCO/EQUIPO), boleto con obra,
  función, asiento y logo; Club Fan en oro con número de socio.
- Si faltan las llaves, los botones no aparecen (nada de botones que no hacen nada).
- Fase 2 (opcional): actualizar pases ya guardados (cambio de función, boleto anulado,
  código de gafete regenerado). Apple pide un servicio web de registro + avisos push; Google se
  actualiza editando el objeto por API.

## Fuentes
- Apple: Building a Pass — https://developer.apple.com/documentation/walletpasses/building-a-pass
- Google: Generic pass (web) — https://developers.google.com/wallet/generic/web
- Google: términos (Issuer, Class, Object, modo demo) — https://developers.google.com/pay-wallet/products/wallet/generic/resources/terminology
- Google: pedir acceso de publicación — https://developers.google.com/pay-wallet/products/wallet/tickets/events/test-and-go-live/request-publishing-access
- passkit-generator — https://github.com/alexandercerutti/passkit-generator
