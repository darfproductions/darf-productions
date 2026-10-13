// Sonido corto y vibración al leer un QR (puerta, gafetes y credenciales): verde agudo, rojo grave.
export function bip(ok: boolean): void {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220; g.gain.value = 0.08;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
  } catch { /* sin sonido */ }
  try {
    navigator.vibrate?.(ok ? 80 : [120, 80, 120]);
  } catch { /* sin vibración */ }
}
