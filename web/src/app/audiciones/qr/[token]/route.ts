import QRCode from "qrcode";

// 0131: imagen del QR de una inscripción a audición, para el correo (los correos no muestran QR generados en el
// momento). Solo dibuja el código que ya viene en la liga: no consulta ni muestra ningún dato de la persona.
export async function GET(_req: Request, { params }: RouteContext<"/audiciones/qr/[token]">) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return new Response("No encontrado", { status: 404 });
  const png = await QRCode.toBuffer(token.toLowerCase(), { margin: 2, width: 480 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable", "X-Robots-Tag": "noindex" },
  });
}
