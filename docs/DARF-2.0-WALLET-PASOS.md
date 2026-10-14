# Wallet: pasos de Diego (Apple y Google)

Mientras tanto, Claude programa los pases en la rama `darf-2.0`. Nada de lo de abajo se pega en
el chat ni en el repositorio: las llaves solo van en Vercel.

---

## A. Apple Wallet (con tu Mac, ~20 min)

### A1. Crear el identificador del pase
1. Entra a **developer.apple.com/account** → **Certificates, IDs & Profiles**.
2. **Identifiers** → botón **+** → elige **Pass Type IDs** → Continue.
3. Description: `DARF Wallet` · Identifier: **`pass.com.darfproductions.wallet`** → Continue → Register.

### A2. Pedir el certificado desde tu Mac
1. Abre **Acceso a Llaveros** (Keychain Access).
2. Menú **Acceso a Llaveros → Asistente de certificados → Solicitar un certificado de una autoridad de certificación…**
3. Correo: el de DARF · Nombre común: `DARF Wallet` · Marca **"Guardado en el disco"** → Continuar → guárdalo en el Escritorio.

### A3. Crear el certificado en Apple
1. En el portal: **Certificates** → **+** → **Pass Type ID Certificate** → Continue.
2. Elige `pass.com.darfproductions.wallet` → sube el archivo del paso A2 → Continue.
3. **Download** → doble clic en el `.cer` descargado (entra a tu Llavero).

### A4. Exportarlo
1. En **Acceso a Llaveros → Mis certificados**, busca **"Pass Type ID: pass.com.darfproductions.wallet"**
   (tiene un triangulito con la llave adentro).
2. Clic derecho → **Exportar…** → nombre `darf-wallet`, formato **.p12**, en el Escritorio.
3. Ponle una contraseña y **anótala** (la vas a usar abajo).

### A5. Descargar el certificado intermedio de Apple
Entra a **apple.com/certificateauthority** y descarga **"Worldwide Developer Relations - G4"**
(archivo `AppleWWDRCAG4.cer`) al Escritorio.

### A6. Convertir (Terminal)
Abre **Terminal** y pega estos comandos uno por uno (te pedirá la contraseña del A4; cuando pida
"PEM pass phrase", inventa otra contraseña y anótala: es la que va en Vercel):

```
cd ~/Desktop
openssl pkcs12 -in darf-wallet.p12 -clcerts -nokeys -out darf-cert.pem
openssl pkcs12 -in darf-wallet.p12 -nocerts -out darf-key.pem
openssl x509 -inform der -in AppleWWDRCAG4.cer -out darf-wwdr.pem
```

Si alguno marca error de "unsupported" o "legacy", repítelo agregando ` -legacy` al final.

### A7. Ponerlo en Vercel
Vercel → `darf-2-web-dev` → **Settings → Environment Variables**. Cada una en **Production y Preview**,
marcada como **Sensitive**:

| Nombre | Valor |
|---|---|
| `APPLE_PASS_TYPE_ID` | `pass.com.darfproductions.wallet` |
| `APPLE_TEAM_ID` | Tu Team ID (developer.apple.com/account → **Membership details**, 10 letras/números) |
| `APPLE_PASS_CERT` | En Terminal: `base64 -i darf-cert.pem \| pbcopy` y pega (Cmd+V) |
| `APPLE_PASS_KEY` | En Terminal: `base64 -i darf-key.pem \| pbcopy` y pega |
| `APPLE_PASS_KEY_PASSPHRASE` | La contraseña "PEM pass phrase" del A6 |
| `APPLE_WWDR_CERT` | En Terminal: `base64 -i darf-wwdr.pem \| pbcopy` y pega |

Al terminar, guarda los archivos del Escritorio en un lugar seguro (o bórralos): son la llave de DARF.

---

## B. Google Wallet (~15 min)

1. **console.cloud.google.com** → arriba elige el mismo proyecto del "Entrar con Google".
2. **APIs y servicios → Biblioteca** → busca **Google Wallet API** → **Habilitar**.
3. **IAM y administración → Cuentas de servicio → Crear cuenta de servicio**: nombre `darf-wallet` →
   Crear y continuar → (sin roles) → Listo.
4. Abre `darf-wallet` → pestaña **Claves → Agregar clave → Crear clave nueva → JSON** → se descarga un archivo.
5. **pay.google.com/business/console** → **Usuarios → Invitar usuario**: pega el correo de la cuenta de
   servicio (`darf-wallet@…iam.gserviceaccount.com`), rol **Desarrollador**.
6. En esa misma consola, en **Google Wallet API → Cuentas de prueba** (o "Test accounts"), agrega tu Gmail
   y el de quien vaya a probar en Android.
7. Vercel (Production y Preview, Sensitive):

| Nombre | Valor |
|---|---|
| `GOOGLE_WALLET_ISSUER_ID` | `3388000000023203308` |
| `GOOGLE_WALLET_CREDENTIALS` | Abre el JSON del paso 4 con TextEdit, copia **todo** y pégalo |

Más adelante (cuando ya lo veas funcionar): en la consola, **Request publishing access** para que lo
pueda usar cualquier persona (Google lo revisa en unos días; mientras, sale "[TEST ONLY]").

---

## C. Botones oficiales
Descarga y mándame los archivos (son las imágenes oficiales; Apple y Google piden usar las suyas):
- **Apple:** developer.apple.com/wallet/add-to-apple-wallet-guidelines → descarga los badges → el de
  **español (México o Latinoamérica)**, versión negra, en **SVG**.
- **Google:** developers.google.com/wallet/generic/resources/brand-guidelines → **Download button assets**
  → el de **español**, versión principal, en **SVG**.

Si no los consigues, avísame: mientras uso un botón propio con el texto.

---

Cuando termines A, B o C, dile a Claude "listo con A" (o B, C). Claude revisa en Vercel que las variables
existan (sin ver su contenido).
