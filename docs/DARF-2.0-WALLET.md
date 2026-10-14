# DARF 2.0 — Apple Wallet y Google Wallet

## Estado: PROGRAMADO, falta que Diego ponga las llaves (2026-10-14)
- **Pases:** boleto (uno por asiento) y credencial única (gafete o Club Fan, 0083). El QR es el mismo
  de la web: el boleto lleva `tickets.qr_token` (Puerta no cambia) y la credencial `/g/<token>`.
- **Botones** "Agregar a Apple Wallet / Google Wallet" en "Ver boletos" (cada boleto) y en "Mi credencial".
  Solo aparecen cuando las llaves de cada Wallet están en Vercel. En iPhone va primero Apple; en Android, Google.
- **Pasos de Diego:** `docs/DARF-2.0-WALLET-PASOS.md` (Apple con Mac, Google, botones oficiales).
- **Variables (solo servidor, Sensitive, Production y Preview):** `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`,
  `APPLE_PASS_CERT`, `APPLE_PASS_KEY`, `APPLE_PASS_KEY_PASSPHRASE`, `APPLE_WWDR_CERT` (PEM tal cual o en
  base64) · `GOOGLE_WALLET_ISSUER_ID` (3388000000023203308), `GOOGLE_WALLET_CREDENTIALS` (JSON).
- **Código:**
  - `web/src/lib/wallet-pases.ts` (contenido común, puro, con pruebas) ·
    `apple-wallet.ts` (.pkpass firmado con passkit-generator) · `google-wallet-pases.ts` (clases y objetos) ·
    `wallet-imagenes.ts` (PNG con sharp) · `wallet-datos.ts` (lecturas con sesión y RLS).
  - Rutas: `/cuenta/wallet/apple/boleto/<ticket>`, `/cuenta/wallet/apple/credencial`,
    `/cuenta/wallet/google/boleto/<ticket>`, `/cuenta/wallet/google/credencial` (solo lo propio; boletos
    aprobados, activos y de funciones por venir) · `/wallet/img/<clave>` (PNG públicos para Google:
    `darf`, `fan`, `obra-<id>` de obras publicadas, `banda-<franja|fan|cuenta>`).
  - Diseño: boleto con los colores del kit, logo de la obra, imagen de ambiente, fecha y hora de México,
    asiento, lugar, orden y nombre; aparece en la pantalla de bloqueo y vence 6 h después de la función.
    Credencial en fondo DARF con el color de su banda, foto, nombre, papel o "Socio #0001", código y vigencia.
  - Google: una clase por función y un objeto por boleto; la credencial es un objeto por cuenta y se
    actualiza (QR nuevo) cada vez que se vuelve a tocar el botón.
- **Probado en la copia local** con certificados de prueba y un Google falso: firma del .pkpass válida,
  liga de guardar de Google, boleto ajeno 404, sin sesión 401, imágenes PNG.
- **Pendiente (fase 2, si se pide):** que Apple actualice solo los pases guardados (boleto cancelado,
  código regenerado). Mientras: la Puerta rechaza boletos cancelados y el pase dice "si regeneras tu
  código, vuelve a agregarla".

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
