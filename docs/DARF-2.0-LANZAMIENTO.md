# DARF 2.0 · Lista del lanzamiento (Bloque 6)

Decisión de Diego (2026-10-13): lo de la 1.0 era de prueba. **La base "DARF 2.0 DEV" se queda
como la oficial**, vaciada con `supabase/dev/limpieza_para_oficial.sql`, y la página 2.0 toma el
dominio `darfproductions.com`.

Quién hace cada paso: **Diego** (configuración de Supabase, Vercel, GoDaddy, Cloudflare, Resend y
cuentas de pago) · **Claude** (código, scripts y verificación de solo lectura).

## Estado: lanzada el 13 de octubre de 2026 ✅

- B1–B9 hechos y verificados (solo lectura). `www.darfproductions.com` es la 2.0 (rama `darf-2.0`);
  `darfproductions.com` redirige a `www`. Protección de Vercel: todo menos los dominios propios.
- Primeras pruebas en la base: Club Fan socio #1, mensaje de Contacto con aviso al Director, invitación
  al equipo con correo enviado, 8 tareas automáticas activas. Sin errores en Vercel.
- Por ahora con planes **gratis**; Supabase Pro y Vercel Pro se contratan a inicios de noviembre
  (antes de abrir la venta de boletos). Con Pro: respaldos diarios y protección de contraseñas filtradas.
- La 1.0 (proyecto `darf-productions` y su base) queda intacta como respaldo (ver D).

## Cómo estaba antes del lanzamiento (revisado el 13 de octubre)

| Pieza | Estado |
|---|---|
| Base 2.0 (Supabase "DARF 2.0 DEV", `qgywscczyzuqinutuvak`) | Migraciones hasta la 0096. Tareas automáticas activas: vencer órdenes y eventos (cada minuto), recordatorios, anuncios y eventos (cada 15 min), advertencias, pagos y limpieza (diarias). Avisos al teléfono conectados. |
| Vercel `darf-productions` | La **1.0**. Tiene `darfproductions.com` (redirige a `www`) y `www.darfproductions.com`. |
| Vercel `darf-2-web-dev` | La **2.0** (Next.js, rama `darf-2.0`, carpeta `web`). Hoy pide iniciar sesión de Vercel para verla (protección "all"). |
| Vercel `darf-2-dev` | Copia vieja sin uso. Se puede borrar después del lanzamiento. |
| Código | Compila como oficial (`NEXT_PUBLIC_DARF_ENV=PROD`) con la base 2.0; si alguien lo conecta a otra base, se niega a compilar. Textos legales con razón social y domicilio. |

## A. Antes del día (con calma)

1. **Plan Pro de Supabase** en el proyecto "DARF 2.0 DEV" (respaldos diarios). Muy recomendado ahora que guarda datos reales.
2. **Plan Pro de Vercel** (el plan gratis no permite uso comercial).
3. **Correo con el remitente de DARF** (Resend): dominio `darfproductions.com` verificado en Resend.
   - Supabase → Authentication → Emails → SMTP: `smtp.resend.com`, puerto 465, usuario `resend`, contraseña = la API key de Resend, remitente `no-reply@darfproductions.com`.
   - Pegar las plantillas de `supabase/templates` (ver su `LEEME.md`).
4. **Entrar con Google**: Supabase → Authentication → Providers → Google, con el Client ID y secreto. En Google Cloud → Credentials, en "Authorized redirect URIs", poner la dirección que muestra esa pantalla de Supabase (termina en `/auth/v1/callback`). La de la página (`…/auth/callback`) va en Supabase, paso B3.
5. **Captcha (Cloudflare Turnstile)**: agregar `darfproductions.com` y `www.darfproductions.com` al widget "DARF". (Se prende en Supabase el día del lanzamiento, paso B4.)
6. **Funciones de correo** (Supabase → Edge Functions), con sus secretos en Edge Functions → Secrets (nunca en el código):
   - `team-invite` (invitaciones al equipo por correo, 0094): **ya publicada** (13 oct). Diego pone los secretos `RESEND_API_KEY` (llave de Resend "team-invite", Sending access), `SITE_URL=https://www.darfproductions.com` y `NOTIFY_FROM=DARF Productions <no-reply@darfproductions.com>`. Se conecta el día del lanzamiento (paso B9).
   - `notify-contact` **no hace falta**: los mensajes de Contacto ya le avisan al Director en el panel y al teléfono.
7. **Ensayo general en la página 2.0 actual** (la de pruebas): comprar un boleto, aprobarlo, descargar el PDF, pasarlo en Puerta, mandar un mensaje de Contacto, invitar a alguien al equipo, unirse al Club Fan. Lo que se ensucie se borra en el paso B2.

## B. El día del lanzamiento (en este orden)

1. **Respaldo**: Supabase → Database → Backups → hacer uno (con Pro) antes de tocar nada.
2. **Limpieza**: Supabase → SQL Editor → correr completo `supabase/dev/limpieza_para_oficial.sql`.
   Debe terminar con un renglón "Obras: Mamma Mia! (archivada), High School Musical (archivada), Showman (publicada), Teen Beach Movie (publicada) · Cuentas: 1 · …". Avísale a Claude para verificarlo.
3. **Supabase → Authentication → URL Configuration**: Site URL = `https://www.darfproductions.com`; Redirect URLs = `https://www.darfproductions.com/auth/callback` y `https://darfproductions.com/auth/callback`. (Quitar las de pruebas cuando ya no se usen.)
4. **Supabase → Authentication → contraseñas y seguridad**: largo mínimo 8 con letras y números; "Secure password change"; aviso por correo al cambiar contraseña o correo; protección de contraseñas filtradas (si el plan la tiene). **Attack Protection → captcha con Turnstile** y pegar la Secret Key.
5. **Vercel → proyecto `darf-2-web-dev` → Settings → Environment Variables (Production)**:
   - `NEXT_PUBLIC_DARF_ENV=PROD`
   - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: las mismas de hoy (base 2.0).
   - `NEXT_PUBLIC_DARF_WHATSAPP` = número real de pagos: **52 + 10 dígitos**, sin + ni espacios.
   - `NEXT_PUBLIC_SITE_URL=https://www.darfproductions.com`
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = la llave pública del widget.
   - `NEXT_PUBLIC_DARF_PANEL_1_URL`: **borrarla** (ya no hay panel 1.0).
6. **Vercel → `darf-2-web-dev` → Settings → Git**: rama de producción = `darf-2.0`. Luego **Deployments → Redeploy** de la última versión (para que tome las variables).
7. **Vercel → `darf-2-web-dev` → Settings → Deployment Protection**: que **no** pida iniciar sesión en el dominio propio ("Standard Protection" / todo menos dominios propios). Si no, el público vería una pantalla de Vercel.
8. **Cambiar el dominio**:
   - En `darf-productions` (1.0) → Settings → Domains: quitar `darfproductions.com` y `www.darfproductions.com`.
   - En `darf-2-web-dev` → Settings → Domains: agregar `www.darfproductions.com` (principal) y `darfproductions.com` (que redirija a `www`).
   - En **GoDaddy** no debería hacer falta tocar nada (ya apunta a Vercel); solo si Vercel muestra un aviso de DNS, poner exactamente los registros que indique.
9. **Conectar el correo de invitaciones** (después del B8, para que las ligas ya lleven a la 2.0): en SQL Editor,
   `update invite_config set hook_url = 'https://qgywscczyzuqinutuvak.supabase.co/functions/v1/team-invite' where id = 1;`
10. **Comprobar** (Diego en su teléfono + Claude con la lista de abajo).

## C. Comprobación después del cambio

- Sin franja amarilla de "entorno de pruebas"; `www.darfproductions.com` abre la 2.0 y `darfproductions.com` redirige.
- Crear cuenta (llega el correo con remitente de DARF y el captcha aparece), entrar con correo y con Google, recuperar contraseña.
- Comprar un boleto → botón de WhatsApp con el número real → aprobar en el panel → PDF → Puerta.
- Mensaje de Contacto → llega aviso al Director (panel y teléfono).
- Invitar al equipo un correo sin cuenta → llega el correo y en Permisos dice "correo enviado".
- Unirse al Club Fan → socio **#0001**.
- Compartir la liga de una obra en WhatsApp → sale la imagen.
- `robots.txt` y `sitemap.xml` ya permiten a Google indexar.
- Claude revisa la base (solo lectura): cuentas, órdenes, avisos y tareas automáticas funcionando.

## D. Si algo sale mal

- **Antes del paso B8** nada es público: se corrige con calma.
- **Después del B8**: regresar los dos dominios al proyecto `darf-productions` (1.0) en Vercel. Tarda minutos. La 1.0 sigue intacta como respaldo; su base no se toca.

## E. Después del lanzamiento

- Borrar el proyecto `darf-2-dev` de Vercel (sin uso).
- Decidir si se archiva la base vieja de la 1.0 (no se borra sin respaldo).
- Los scripts de cambios futuros siguen usando la marca de la base ("DARF-2.0-DEV"); el nombre se queda así para no romper el candado.
- Medir la velocidad de las páginas públicas con datos reales (pendiente del Bloque 5).
