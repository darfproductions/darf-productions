// Íconos de canales (trazo simple, sin logotipos de marca registrada).
export type Channel = "youtube" | "instagram" | "tiktok" | "whatsapp" | "email";

const PATHS: Record<Channel, React.ReactNode> = {
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" stroke="none" />
    </>
  ),
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  tiktok: <path d="M14 3.5v11.2a3.8 3.8 0 1 1-3.8-3.8M14 3.5c.4 2.6 2.2 4.4 5 4.6" />,
  whatsapp: (
    <>
      <path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.5z" />
      <path d="M9.2 8.8c0 3 2.6 5.8 5.8 6l1.2-1.4-1.8-.9-.8.8a4.6 4.6 0 0 1-2.4-2.4l.8-.8-.9-1.8z" fill="currentColor" stroke="none" />
    </>
  ),
  email: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="3" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
};

export function SocialIcon({ channel, size = 26 }: { channel: Channel; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[channel]}
    </svg>
  );
}
