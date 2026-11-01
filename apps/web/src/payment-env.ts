export type MetadataEnvironment = 'development' | 'staging' | 'production'

const configuredEnvironment = import.meta.env.VITE_METADATA_ENV?.trim().toLowerCase()

export const metadataEnvironment: MetadataEnvironment =
  configuredEnvironment === 'development' ||
  configuredEnvironment === 'staging' ||
  configuredEnvironment === 'production'
    ? configuredEnvironment
    : configuredEnvironment
      ? (() => {
          throw new Error('VITE_METADATA_ENV must be development, staging, or production')
        })()
      : import.meta.env.PROD
        ? 'production'
        : 'development'

export const paymentNetwork = metadataEnvironment === 'production' ? 'eip155:4663' : 'eip155:46630'

export const robinhoodRpcUrl =
  import.meta.env.VITE_ROBINHOOD_RPC_URL ||
  (metadataEnvironment === 'production'
    ? 'https://rpc.mainnet.chain.robinhood.com'
    : 'https://rpc.testnet.chain.robinhood.com')
