/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_CHROME_EXTENSION_URL?: string;
  readonly VITE_EDGE_EXTENSION_URL?: string;
  readonly VITE_FIREFOX_EXTENSION_URL?: string;
  readonly VITE_RAZORPAY_KEY_ID?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
