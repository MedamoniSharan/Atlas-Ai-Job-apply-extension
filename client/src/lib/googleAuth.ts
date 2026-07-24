/** Public Google OAuth Web client ID (safe to ship in the frontend bundle). */
export const DEFAULT_GOOGLE_CLIENT_ID =
  '785798517271-hahmhafbkd2pkpvj94aidkli6tlt87ru.apps.googleusercontent.com';

export function googleClientId(): string {
  return (
    import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || DEFAULT_GOOGLE_CLIENT_ID
  );
}
