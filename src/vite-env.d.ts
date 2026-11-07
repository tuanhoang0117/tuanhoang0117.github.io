/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The shared mascot counter's endpoint (`.env.production`). Unset: the site counts locally. */
  readonly VITE_COUNTER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
