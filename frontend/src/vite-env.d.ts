/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WIKILIVE_SPACE_ID?: string;
  readonly VITE_DEMO_USER_ID?: string;
  readonly VITE_DEMO_USER_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
