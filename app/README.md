# DARF — app móvil (iOS y Android)

App nativa de DARF hecha con **Capacitor**: una interfaz propia para el teléfono (Vite + React + TypeScript)
dentro de proyectos nativos de iOS (`ios/`) y Android (`android/`). Usa **la misma base de Supabase** que la web
2.0 (`web/`) y **las mismas reglas**: importa los archivos puros de `web/src/lib` con el alias `@`
(cartelera, pósters, kit de colores, contraste…), así que la lógica vive en un solo lugar.

Diseño: lienzo "DARF App — Diseño visual" (modo noche, modo día y funciones del celular).

## Qué hace hoy

| Pantalla | Qué hace | Datos |
|---|---|---|
| Inicio | Saludo, obra destacada, accesos rápidos, más obras, botón día/noche | `productions`, `performances`, `productions_desde` (igual que la portada de la web) |
| Obras | En cartelera, Próximamente y Archivo | lo mismo, agrupado con `agrupar()` de la web |
| Obra | Con los colores de la obra; funciones, zonas y precios (si la obra los muestra), cómo llegar, compartir | `productions`, `performances`, `performance_price_categories` |
| Boletos | QR de boletos pagados, pendientes con WhatsApp, funciones pasadas | `orders` + `tickets` de la persona (RLS) |
| Cuenta | Apariencia (Auto, Día o Noche), Club de Fans, contacto, cerrar sesión, eliminar cuenta | sesión de Supabase |
| Acceso | Entrar con correo y contraseña (con captcha) | Supabase Auth |

**Modo día y noche:** cada obra trae su kit de colores (el mismo de la web) para un modo; el otro se deriva con
`lib/tema.ts` (en día, una versión aclarada del tono de la obra; en noche, una oscurecida), siempre con contraste
de al menos 4.5:1. Pruebas en `src/lib/tema.test.ts`.

Todavía abre la web dentro de la app para: comprar (`/comprar/[función]`), crear cuenta, recuperar contraseña,
Club de Fans, audiciones, historial y eliminar cuenta.

## Trabajar en tu computadora

```bash
cd app
cp .env.example .env.local   # valores públicos; nunca la service_role key
npm install
npm run dev                  # http://localhost:5173 (en el navegador, tamaño teléfono)
npm test                     # pruebas
npm run build                # revisa tipos y genera dist/
```

## Probar en un teléfono

Necesitas **Xcode** (Mac) para iOS y **Android Studio** para Android.

```bash
npm run sync          # construye y copia dist/ a ios/ y android/
npx cap open ios      # abre Xcode → elige tu iPhone → ▶
npx cap open android  # abre Android Studio → elige tu teléfono → ▶
```

Ícono y pantalla de arranque: las imágenes fuente están en `recursos/`. Si cambian:
`npx capacitor-assets generate --assetPath recursos --ios --android`.

## Pendientes antes de publicar

1. **Captcha dentro de la app.** La base pide Cloudflare Turnstile para entrar. La app se sirve como
   `app.darfproductions.com` (ver `capacitor.config.ts`): hay que agregar ese dominio en Cloudflare → Turnstile →
   el widget de DARF → *Hostnames*. En iOS la dirección es `capacitor://app.darfproductions.com`; hay que probar
   en un iPhone que Turnstile la acepte. Si no, la alternativa es entrar con Apple o Google con su inicio de sesión
   nativo.
2. **Entrar con Apple y con Google.** Apple lo exige si la app ofrece Google.
3. **Comprar dentro de la app** (mapa de asientos y orden) en lugar de abrir la web.
4. **Boletos sin conexión:** guardar los QR en el teléfono.
5. **Notificaciones push** (la web ya tiene `push.ts` y `apns.ts`).
6. **Funciones del celular del diseño:** Wallet, widgets, aviso en pantalla de bloqueo el día de la función y el
   cambio de ícono automático (Club de Fans → dorado, Casa DARF → holográfico; recursos en `public/marca/`).
7. **Eliminar cuenta dentro de la app** (hoy abre la web; las tiendas aceptan que sea en la app).
8. Cuentas de Apple Developer y Google Play, fichas de las tiendas y política de privacidad.
