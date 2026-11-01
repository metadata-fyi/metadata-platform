/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_METADATA_API_URL?: string
  readonly VITE_METADATA_ROOT_DOMAIN?: string
  readonly VITE_SOURCE_URL?: string
  readonly VITE_SITE_URL?: string
  readonly VITE_SOCIAL_X?: string
  readonly VITE_TWITTER_URL?: string
  readonly VITE_SOCIAL_DISCORD?: string
  readonly VITE_COPYRIGHT_HOLDER?: string
  readonly VITE_METADATA_ENV?: 'development' | 'staging' | 'production'
  readonly VITE_REOWN_PROJECT_ID?: string
  readonly VITE_ROBINHOOD_RPC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
