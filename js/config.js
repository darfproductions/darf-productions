// ─── Configuración pública de Supabase ──────────────────────────────────
// La publishable key es pública por diseño (equivalente a la anon key) —
// puede vivir en el frontend/commitearse. NUNCA poner aquí la service_role
// key ni ningún secreto administrativo. Toda operación sensible se protege
// en el servidor vía RLS + RPC `SECURITY DEFINER`, no desde este archivo.
window.DARF_CONFIG = {
  SUPABASE_URL: 'https://jbzvbzanwokqsvucogny.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_LFoMZ5qNMdysVb-wvlZO_A_PSvO0HKX'
};
