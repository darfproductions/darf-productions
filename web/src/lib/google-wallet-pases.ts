import type { Campo, PaseWallet } from "@/lib/wallet-pases";

// Google Wallet (2026-10-14): traduce el pase común a clases y objetos de la API de Google.
// Boleto = eventTicketClass (una por función) + eventTicketObject (uno por boleto).
// Credencial = genericClass (una para todo DARF) + genericObject (uno por cuenta).
// Funciones puras: google-wallet-pases.test.ts. Las imágenes son ligas https de /wallet/img.

const LANG = "es-MX";
const texto = (value: string) => ({ defaultValue: { language: LANG, value } });
const imagen = (uri: string, desc: string) => ({ sourceUri: { uri }, contentDescription: texto(desc) });
const modulos = (cs: Campo[]) => cs.map((c) => ({ id: c.key, header: c.label, body: c.value }));

export type ImagenesGoogle = { logo: string; hero?: string | null };

export function idGoogle(issuerId: string, sufijo: string): string {
  return `${issuerId}.${sufijo.replace(/[^\w.-]/g, "_")}`;
}

export function claseBoleto(issuerId: string, funcionId: string, p: PaseWallet, obra: string, lugar: string | null, im: ImagenesGoogle) {
  return {
    id: idGoogle(issuerId, `funcion-${funcionId}`),
    issuerName: "DARF Productions",
    reviewStatus: "UNDER_REVIEW",
    eventName: texto(obra),
    ...(lugar ? { venue: { name: texto(lugar), address: texto(lugar) } } : {}),
    ...(p.fecha ? { dateTime: { start: p.fecha } } : {}),
    logo: imagen(im.logo, obra),
    ...(im.hero ? { heroImage: imagen(im.hero, obra) } : {}),
    hexBackgroundColor: p.colores.fondo,
  };
}

export function objetoBoleto(issuerId: string, claseId: string, p: PaseWallet, datos: { asiento: string; comprador: string; orden: string }) {
  return {
    id: idGoogle(issuerId, p.serial),
    classId: claseId,
    state: "ACTIVE",
    ticketHolderName: datos.comprador,
    ticketNumber: datos.orden,
    seatInfo: { seat: texto(datos.asiento) },
    barcode: { type: "QR_CODE", value: p.qr, alternateText: p.qrTexto },
    hexBackgroundColor: p.colores.fondo,
    ...(p.vence ? { validTimeInterval: { end: { date: p.vence } } } : {}),
    textModulesData: modulos(p.reverso),
  };
}

export function claseCredencial(issuerId: string) {
  return { id: idGoogle(issuerId, "credencial-darf") };
}

export function objetoCredencial(issuerId: string, p: PaseWallet, im: ImagenesGoogle) {
  const principal = p.primarios[0];
  return {
    id: idGoogle(issuerId, p.serial),
    classId: idGoogle(issuerId, "credencial-darf"),
    state: "ACTIVE",
    cardTitle: texto(p.titulo),
    header: texto(principal?.value ?? ""),
    subheader: texto(principal?.label ?? p.descripcion),
    logo: imagen(im.logo, p.titulo),
    ...(im.hero ? { heroImage: imagen(im.hero, p.descripcion) } : {}),
    hexBackgroundColor: p.colores.fondo,
    barcode: { type: "QR_CODE", value: p.qr, alternateText: p.qrTexto },
    textModulesData: modulos([...p.cabecera, ...p.secundarios, ...p.auxiliares, ...p.reverso]),
  };
}
