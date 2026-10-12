/* eslint-disable @next/next/no-img-element -- logo SVG del kit de marca */

// Encabezado del mundo Oro (manual de marca: la Fan Zone usa el oro; sin la luz DARF ni Pulso).
export function FanZoneHeading({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden border-b border-oro/25 bg-[#08070c]">
      <div aria-hidden="true" className="cono-oro absolute -top-64 left-[30%] h-[900px] w-[700px]" />
      <div aria-hidden="true" className="grano absolute inset-0" />
      <div className="relative mx-auto flex max-w-[1440px] flex-col items-start gap-6 px-5 pb-12 pt-12 md:px-16 md:pb-16 md:pt-20">
        <img src="/marca/fan-zone-oro.svg" alt="DARF Fan Zone" className="h-8 w-auto md:h-10" />
        <h1 className="display text-[clamp(2.6rem,7vw,6rem)]">{title}</h1>
        {children && <div className="lead max-w-2xl">{children}</div>}
        <div aria-hidden="true" className="doble-filete h-2 w-full max-w-md" />
      </div>
    </div>
  );
}
