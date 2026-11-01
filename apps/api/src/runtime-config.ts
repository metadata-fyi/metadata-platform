import { metadataEnvironment } from '@metadata/api/packs'

/** Refuse a production origin that would silently deny all paid reads. */
export function assertRuntimeConfiguration() {
  if (metadataEnvironment() !== 'production') return
  const proof = process.env.METADATA_EDGE_SHARED_SECRET || process.env.EDGE_SHARED_SECRET
  if (!proof || Buffer.byteLength(proof) < 32)
    throw new Error(
      'Production requires a shared edge secret of at least 32 bytes; configure the same value in the Worker.',
    )
  if (process.env.DEV_TRUST_CLAIM === '1')
    throw new Error('DEV_TRUST_CLAIM must be disabled in production')
}
