// Video de YouTube embebido (dominio sin cookies de seguimiento), carga diferida.
export function YouTube({ id, title }: { id: string; title: string }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={title}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
      <figcaption className="text-sm font-semibold">{title}</figcaption>
    </figure>
  );
}

/** Saca el id de un enlace de YouTube (youtu.be/ID o youtube.com/watch?v=ID). */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}
