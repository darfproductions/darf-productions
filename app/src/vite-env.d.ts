/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DARF_ENV?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_DARF_WHATSAPP?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}
