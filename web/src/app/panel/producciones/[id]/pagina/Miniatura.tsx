/* eslint-disable @next/next/no-img-element -- miniaturas del kit (Storage o archivos propios) */

// Una imagen del kit en chico (0138): la miniatura y, al pasar el cursor (o siempre, en pantalla táctil), los botones
// para cambiarla o quitarla. Los pósters van en una fila; el logo y el ambiente, lado a lado.
export function Miniatura({ titulo, nota, src, alt, ratio, fondo, contener, acciones, falta = "Falta" }: {
  titulo: string; nota?: string; src: string | null; alt: string; ratio: number; fondo?: string; contener?: boolean; acciones: React.ReactNode; falta?: string;
}) {
  return (
    <figure className="group flex w-32 shrink-0 flex-col gap-1.5">
      <div className="relative overflow-hidden rounded-lg bg-telon-2" style={{ aspectRatio: ratio, background: fondo }}>
        {src
          ? <img src={src} alt={alt} className={`h-full w-full ${contener ? "object-contain p-2" : "object-cover"}`} />
          : <span className="grid h-full place-items-center text-[11px] text-texto-3">{falta}</span>}
        <div className="absolute inset-0 flex flex-col items-center justify-end gap-1 bg-sala/75 p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {acciones}
        </div>
      </div>
      <figcaption className="text-[11px] leading-tight text-texto-2"><b className="text-texto">{titulo}</b>{nota && <><br />{nota}</>}</figcaption>
    </figure>
  );
}
