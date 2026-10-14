# Wallet: pasos de Diego (Mac en inglés)

Los nombres de botones y menús van **tal como salen en inglés** en tu Mac (macOS Ventura) y en las
páginas de Apple, Google y Vercel. Nada de lo de abajo se pega en el chat ni en el repositorio:
las llaves solo van en Vercel.

---

## A. Apple Wallet (MacBook Pro, Ventura)

### A1. Pass Type ID ✅ (ya lo hiciste)
`pass.com.darfproductions.wallet`

### A2. Certificate Signing Request (en tu Mac)
1. **Cmd + Space** → escribe **Keychain Access** → Enter.
2. En la barra de arriba (junto a la manzana): **Keychain Access → Certificate Assistant →
   Request a Certificate From a Certificate Authority…**
3. Llena:
   - **User Email Address:** el correo de DARF
   - **Common Name:** `DARF Wallet`
   - **CA Email Address:** vacío
   - Marca **Saved to disk**
4. **Continue** → guárdalo en el **Desktop** (`CertificateSigningRequest.certSigningRequest`) → **Save** → **Done**.

### A3. Pass Type ID Certificate (página de Apple)
1. Entra a **developer.apple.com/account/resources/certificates/add**
2. En la sección **Services** marca **Pass Type ID Certificate** → **Continue** (arriba a la derecha).
3. **Name:** `DARF Wallet` · **Pass Type ID:** `pass.com.darfproductions.wallet` → **Continue**.
4. **Choose File** → el archivo del Desktop → **Continue**.
5. **Download** → baja `pass.cer` a **Downloads**.
6. Abre **Downloads** y dale **doble clic** a `pass.cer`. Si pregunta el keychain, elige **login** → **Add**.

### A4. Export (.p12)
1. En **Keychain Access**, a la izquierda elige **login**; arriba la pestaña **My Certificates**.
2. Busca **"Pass Type ID: pass.com.darfproductions.wallet"**. Debe tener un triangulito **▸** con una
   llave adentro (si no lo tiene, avísame).
3. **Clic derecho** sobre esa línea → **Export "Pass Type ID: …"**
4. **Save As:** `darf-wallet` · **Where:** Desktop · **File Format:** **Personal Information Exchange (.p12)** → **Save**.
5. Pide **Password** y **Verify**: inventa una y anótala (**contraseña 1**).
6. Si pide la contraseña de tu Mac → escríbela → **Allow**.

### A5. Certificado intermedio de Apple
1. Entra a **apple.com/certificateauthority**
2. En **Apple Intermediate Certificates** haz clic en **Worldwide Developer Relations - G4**.
3. Se baja `AppleWWDRCAG4.cer` a **Downloads**. No le des doble clic.

### A6. Terminal
1. **Cmd + Space** → **Terminal** → Enter.
2. Pega una línea a la vez y presiona Enter:

```
cd ~/Desktop
```
```
openssl pkcs12 -in darf-wallet.p12 -clcerts -nokeys -out darf-cert.pem
```
→ **Enter Import Password:** la contraseña 1 (no se ve al escribir; es normal).
```
openssl pkcs12 -in darf-wallet.p12 -nocerts -out darf-key.pem
```
→ **Enter Import Password:** la contraseña 1.
→ **Enter PEM pass phrase:** inventa otra (**contraseña 2**) y repítela en **Verifying**. Anótala.
```
openssl x509 -inform der -in ~/Downloads/AppleWWDRCAG4.cer -out darf-wwdr.pem
```
```
ls darf-*.pem
```
Deben salir 3: `darf-cert.pem  darf-key.pem  darf-wwdr.pem`. Si algo marca error, mándame el texto
del error (los errores no traen la llave).

### A7. Vercel
**Team ID:** developer.apple.com/account → baja a **Membership details** → **Team ID** (10 caracteres).

Vercel → proyecto **darf-2-web-dev** → **Settings → Environment Variables**. Para cada una:
**Key**, **Value**, en **Environments** deja **Production** y **Preview** (quita Development),
activa **Sensitive** → **Save**.

| Key | Value |
|---|---|
| `APPLE_PASS_TYPE_ID` | `pass.com.darfproductions.wallet` |
| `APPLE_TEAM_ID` | Tu Team ID |
| `APPLE_PASS_KEY_PASSPHRASE` | La contraseña 2 |
| `APPLE_PASS_CERT` | En Terminal: `base64 -i darf-cert.pem \| pbcopy` → Enter → en Value **Cmd + V** |
| `APPLE_PASS_KEY` | En Terminal: `base64 -i darf-key.pem \| pbcopy` → Enter → **Cmd + V** |
| `APPLE_WWDR_CERT` | En Terminal: `base64 -i darf-wwdr.pem \| pbcopy` → Enter → **Cmd + V** |

(`pbcopy` no muestra nada: solo copia.) Al terminar guarda los archivos del Desktop en un lugar seguro
o bórralos: son la llave de los pases de DARF.

---

## B. Google Wallet

1. **console.cloud.google.com** → arriba elige el proyecto del "Sign in with Google".
2. **APIs & Services → Library** → busca **Google Wallet API** → **Enable**.
3. **IAM & Admin → Service Accounts → + Create Service Account** → **Service account name:** `darf-wallet`
   → **Create and continue** → (sin roles) **Continue** → **Done**.
4. Abre `darf-wallet` → pestaña **Keys → Add key → Create new key → JSON → Create** (se baja un archivo).
5. **pay.google.com/business/console** → **Users → Invite a user**: el correo
   `darf-wallet@….iam.gserviceaccount.com`, **Access level: Developer** → **Invite**.
6. En **Google Wallet API → Test accounts** (o **Manage test accounts**): agrega tu Gmail y el de quien
   pruebe en Android.
7. Vercel (Production y Preview, Sensitive):

| Key | Value |
|---|---|
| `GOOGLE_WALLET_ISSUER_ID` | `3388000000023203308` |
| `GOOGLE_WALLET_CREDENTIALS` | Abre el JSON del paso 4 con **TextEdit**, **Cmd + A**, **Cmd + C** y pégalo |

Después, cuando ya lo veas funcionar: en la consola **Request publishing access**.

---

## C. Botones oficiales
- **Apple:** developer.apple.com/wallet/add-to-apple-wallet-guidelines → descarga los badges → el de
  **Spanish (Latin America / Mexico)**, negro, **SVG**.
- **Google:** developers.google.com/wallet/generic/resources/brand-guidelines → **Download button assets**
  → **Spanish**, versión principal, **SVG**.

Mándamelos como archivo. Mientras, la web usa un botón propio.

---

Cuando termines A, B o C, dime "listo con A" (o B, C) y reviso en Vercel que las variables estén
(sin ver su contenido).
