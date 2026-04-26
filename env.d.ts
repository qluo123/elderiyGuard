/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITEE_OWNER: string
  readonly VITE_GITEE_REPO: string
  readonly VITE_GITEE_BRANCH: string
  readonly VITE_GITEE_DATA_DIR: string
  readonly VITE_GITEE_TOKEN: string
  readonly VITE_AMAP_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}


