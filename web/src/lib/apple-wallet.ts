import { PKPass } from "passkit-generator";
import type { WalletAppleConfig } from "@/lib/wallet-env";
import { bandaCredencial, cubrir, contener, icono, leerImagen, logoConSellos, portadaObra } from "@/lib/wallet-imagenes";
import { rgb, type Campo, type PaseWallet } from "@/lib/wallet-pases";

// Apple Wallet (2026-10-14): arma y firma el .pkpass en memoria con passkit-generator.
// Boleto = eventTicket: logo de DARF arriba y la franja con la imagen y el logo de la obra.
// Credencial: Club Fan = storeCard con franja dorada (sello + Fan Zone); gafete = generic con foto.
// Con `servicio` (0098) el pase lleva webServiceURL + authenticationToken y se actualiza solo.

export type ImagenesApple = {
  /** Logo de arriba a la izquierda (DARF). */
  logo: string;
  /** Texto junto al logo (solo si el logo no lo lleva ya). */
  logoTexto?: string;
  /** Boleto: imagen de ambiente de la obra (con su logo encima) como franja. */
  obra?: { ambiente: string | null; logo: string | null } | null;
  /** Credencial con franja de color (Club Fan): id de la banda (fan, crew, …). */
  banda?: string | null;
  /** Foto de la credencial (gafete). */
  foto?: string | null;
  /** Sellos junto al logo (como en la web): Casa DARF (0102), Club Fan si es del equipo y socio… */
  sellos?: string[];
};

const ICONO = "/marca/darf-monograma.svg";

const campos = (cs: Campo[]) => cs.map((c) => ({ key: c.key, label: c.label, value: c.value }));

export type Diseno = {
  /** eventTicket = boleto · storeCard = credencial con franja (Club Fan) · generic = gafete con foto. */
  estilo: "eventTicket" | "storeCard" | "generic";
  logoTexto?: string;
  /** La franja ya lleva el nombre (logo de la obra o banda del club): el campo grande se mueve abajo. */
  franjaConNombre?: boolean;
};

/** Web service de PassKit (0098): con esto el iPhone se registra y el pase se actualiza solo. */
export type ServicioApple = { url: string; token: string };

/** pass.json sin barcodes ni fechas (eso lo pone la librería). Exportada para las pruebas. */
export function passJson(c: Pick<WalletAppleConfig, "passTypeId" | "teamId">, p: PaseWallet, d: Diseno, servicio?: ServicioApple | null): Record<string, unknown> {
  const frente = d.franjaConNombre && d.estilo === "storeCard"
    // Club Fan: la franja dorada es la protagonista; el nombre pasa a la fila de abajo.
    ? { primaryFields: [], secondaryFields: campos([...p.primarios, ...p.secundarios]) }
    : d.franjaConNombre
      // Boleto: el logo de la obra ya está en la franja.
      ? { primaryFields: [], secondaryFields: campos(p.secundarios) }
      : { primaryFields: campos(p.primarios), secondaryFields: campos(p.secundarios) };
  return {
    formatVersion: 1,
    passTypeIdentifier: c.passTypeId,
    teamIdentifier: c.teamId,
    serialNumber: p.serial,
    organizationName: "DARF Productions",
    description: p.descripcion,
    ...(d.logoTexto ? { logoText: d.logoTexto } : {}),
    foregroundColor: rgb(p.colores.texto),
    backgroundColor: rgb(p.colores.fondo),
    labelColor: rgb(p.colores.etiqueta),
    sharingProhibited: true,
    ...(servicio ? { webServiceURL: servicio.url, authenticationToken: servicio.token } : {}),
    ...(p.anulado ? { voided: true } : {}),
    [d.estilo]: {
      headerFields: campos(p.cabecera),
      ...frente,
      auxiliaryFields: campos(p.auxiliares),
      backFields: campos(p.reverso),
    },
  };
}

export async function crearPkpass(c: WalletAppleConfig, p: PaseWallet, im: ImagenesApple, servicio?: ServicioApple | null): Promise<Buffer> {
  const archivos: Record<string, Buffer> = {};
  const [iconoSrc, logoSrc, ambSrc, logoObraSrc, fotoSrc] = await Promise.all([
    leerImagen(ICONO), leerImagen(im.logo), leerImagen(im.obra?.ambiente), leerImagen(im.obra?.logo), leerImagen(im.foto),
  ]);
  if (!iconoSrc) throw new Error("Falta el ícono de DARF.");
  Object.assign(archivos, await icono(iconoSrc, p.colores.fondo));
  // Con sellos (Casa DARF, Club Fan…): monograma DARF + todos sus sellos, del mismo alto (como la credencial web).
  const sellos = (await Promise.all((im.sellos ?? []).map((s) => leerImagen(s)))).filter((x): x is Buffer => !!x);
  const logoFinal = sellos.length ? await logoConSellos(iconoSrc, sellos) : logoSrc ?? iconoSrc;
  Object.assign(archivos, await contener(logoFinal, "logo", 160, 50));

  let d: Diseno;
  if (p.tipo === "boleto") {
    // Franja del boleto: 375×98 pt; se arma en @3x y se reduce.
    if (ambSrc) Object.assign(archivos, await cubrir(await portadaObra(ambSrc, logoObraSrc, 1125, 294), "strip", 375, 98));
    d = { estilo: "eventTicket", logoTexto: im.logoTexto, franjaConNombre: !!(ambSrc && logoObraSrc) };
  } else if (im.banda) {
    // Club Fan: storeCard con franja 375×144 pt (oro, sello y logo de Fan Zone).
    const banda = await bandaCredencial(im.banda, 1125, 432);
    if (banda) Object.assign(archivos, await cubrir(banda, "strip", 375, 144));
    d = { estilo: "storeCard", logoTexto: im.logoTexto, franjaConNombre: !!banda };
  } else {
    if (fotoSrc) Object.assign(archivos, await cubrir(fotoSrc, "thumbnail", 90, 90));
    d = { estilo: "generic", logoTexto: im.logoTexto };
  }
  archivos["pass.json"] = Buffer.from(JSON.stringify(passJson(c, p, d, servicio)));

  const pase = new PKPass(archivos, {
    wwdr: c.wwdr, signerCert: c.cert, signerKey: c.key, signerKeyPassphrase: c.passphrase,
  });
  pase.setBarcodes({ format: "PKBarcodeFormatQR", message: p.qr, messageEncoding: "iso-8859-1", altText: p.qrTexto });
  if (p.fecha) pase.setRelevantDate(new Date(p.fecha));
  if (p.vence) pase.setExpirationDate(new Date(p.vence));
  return pase.getAsBuffer();
}
