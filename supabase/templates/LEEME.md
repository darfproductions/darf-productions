# Correos de cuenta (Supabase Auth)

Plantillas en español con el estilo de DARF. Se configuran **a mano** en el panel de Supabase de cada
proyecto (DEV y producción): **Authentication → Emails → Templates**. Copia el asunto y pega el HTML.

| Archivo | Asunto |
|---|---|
| `confirmar-cuenta.html` | Confirma tu cuenta de DARF |
| `recuperar-contrasena.html` | Pon una contraseña nueva en DARF |
| `cambiar-correo.html` | Confirma tu correo nuevo en DARF |

**Plantillas y tipo de correo en Supabase**
- `confirmar-cuenta.html` → plantilla **Confirm signup**.
- `recuperar-contrasena.html` → plantilla **Reset password**.
- `cambiar-correo.html` → plantilla **Change email address**.

**Requisito:** la URL del sitio y las redirecciones deben estar en **Authentication → URL Configuration**:
- `https://darfproductions.com/auth/callback`
- la de `www`
- en DEV, la de Vercel

El enlace usa `{{ .RedirectTo }}`, que ya trae `/auth/callback?next=…`. Por eso agrega `&token_hash=…&type=…`.

**Correo propio (SMTP):** Authentication → Emails → SMTP Settings.
- Host: `smtp.resend.com`
- Puerto: `465`
- Usuario: `resend`
- Contraseña: la API key de Resend (nunca en el repositorio).
- Remitente: `no-reply@darfproductions.com`, nombre `DARF Productions`.
