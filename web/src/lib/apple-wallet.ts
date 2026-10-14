import { PKPass } from "passkit-generator";
import type { WalletAppleConfig } from "@/lib/wallet-env";
import { cubrir, contener, icono, leerImagen } from "@/lib/wallet-imagenes";
import { rgb, type Campo, type PaseWallet } from "@/lib/wallet-pases";

// Apple Wallet (2026-10-14): arma y firma el .pkpass en memoria con passkit-generator.
// Boleto = eventTicket (franja con la imagen de la obra); credencial = generic (con foto).

export type ImagenesApple = {
  /** Logo de arriba (obra o DARF). */
  logo: string;
  /** Imagen ancha del boleto (ambiente o póster). */
  strip?: string | null;
  /** Foto de la credencial. */
  foto?: string | null;
  /** Texto junto al logo (solo si el logo no lo lleva ya). */
  logoTexto?: string;
};

const ICONO = "/marca/darf-monograma.svg";

const campos = (cs: Campo[]) => cs.map((c) => ({ key: c.key, label: c.label, value: c.value }));

/** pass.json sin barcodes ni fechas (eso lo pone la librería). Exportada para las pruebas. */
export function passJson(c: Pick<WalletAppleConfig, "passTypeId" | "teamId">, p: PaseWallet, logoTexto?: string): Record<string, unknown> {
  const estilo = p.tipo === "boleto" ? "eventTicket" : "generic";
  return {
    formatVersion: 1,
    passTypeIdentifier: c.passTypeId,
    teamIdentifier: c.teamId,
    serialNumber: p.serial,
    organizationName: "DARF Productions",
    description: p.descripcion,
    ...(logoTexto ? { logoText: logoTexto } : {}),
    foregroundColor: rgb(p.colores.texto),
    backgroundColor: rgb(p.colores.fondo),
    labelColor: rgb(p.colores.etiqueta),
    sharingProhibited: true,
    [estilo]: {
      headerFields: campos(p.cabecera),
      primaryFields: campos(p.primarios),
      secondaryFields: campos(p.secundarios),
      auxiliaryFields: campos(p.auxiliares),
      backFields: campos(p.reverso),
    },
  };
}

export async function crearPkpass(c: WalletAppleConfig, p: PaseWallet, im: ImagenesApple): Promise<Buffer> {
  const archivos: Record<string, Buffer> = {
    "pass.json": Buffer.from(JSON.stringify(passJson(c, p, im.logoTexto))),
  };
  const [iconoSrc, logoSrc, stripSrc, fotoSrc] = await Promise.all([leerImagen(ICONO), leerImagen(im.logo), leerImagen(im.strip), leerImagen(im.foto)]);
  if (!iconoSrc) throw new Error("Falta el ícono de DARF.");
  Object.assign(archivos, await icono(iconoSrc, p.colores.fondo));
  const logo = logoSrc ?? iconoSrc;
  Object.assign(archivos, await contener(logo, "logo", 160, 50));
  if (p.tipo === "boleto" && stripSrc) Object.assign(archivos, await cubrir(stripSrc, "strip", 375, 98));
  if (p.tipo === "credencial" && fotoSrc) Object.assign(archivos, await cubrir(fotoSrc, "thumbnail", 90, 90));

  const pase = new PKPass(archivos, {
    wwdr: c.wwdr, signerCert: c.cert, signerKey: c.key, signerKeyPassphrase: c.passphrase,
  });
  pase.setBarcodes({ format: "PKBarcodeFormatQR", message: p.qr, messageEncoding: "iso-8859-1", altText: p.qrTexto });
  if (p.fecha) pase.setRelevantDate(new Date(p.fecha));
  if (p.vence) pase.setExpirationDate(new Date(p.vence));
  return pase.getAsBuffer();
}
