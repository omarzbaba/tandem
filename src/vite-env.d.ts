/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Unguessable id shared by both partners. Set in the host's env, never committed. */
  readonly VITE_BOARD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
