/**
 * Optional on-chain USDG transfer verify (Robinhood Chain).
 * When TREASURY_ADDRESS / RPC unavailable, claim can run in DEV_TRUST_CLAIM=1 mode.
 */
import {
  type Address,
  createPublicClient,
  decodeEventLog,
  defineChain,
  type Hash,
  http,
  parseAbiItem,
} from 'viem'
import {
  atomicToUsdg,
  quoteTopup,
  ROBINHOOD_USDG,
  resolveTopupPurchase,
  type TopupQuote,
} from './packs.js'

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
)

const robinhoodChain = defineChain({
  id: ROBINHOOD_USDG.chainId,
  name: ROBINHOOD_USDG.chainId === 46630 ? 'Robinhood Chain Testnet' : 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.ROBINHOOD_RPC_URL ??
          process.env.RPC_URL ??
          (ROBINHOOD_USDG.chainId === 46630
            ? 'https://rpc.testnet.chain.robinhood.com'
            : 'https://rpc.mainnet.chain.robinhood.com'),
      ],
    },
  },
})

export const DEFAULT_PAYMENT_MIN_CONFIRMATIONS = 1
export const MAX_PAYMENT_MIN_CONFIRMATIONS = 100

/** Parse operator-controlled chain finality without ever weakening the default. */
export function parsePaymentMinConfirmations(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return DEFAULT_PAYMENT_MIN_CONFIRMATIONS
  }
  const raw = String(value).trim()
  if (!/^[1-9]\d*$/.test(raw)) return DEFAULT_PAYMENT_MIN_CONFIRMATIONS
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return DEFAULT_PAYMENT_MIN_CONFIRMATIONS
  }
  return Math.min(parsed, MAX_PAYMENT_MIN_CONFIRMATIONS)
}

export class PaymentVerifyError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PaymentVerifyError'
    this.code = code
  }
}

/** Mint from the verified on-chain amount, not the client-requested pack. */
export function quoteVerifiedTopup(opts: {
  matchedAtomic: bigint
  requestedUsdg?: number
  requestedPackId?: string
}): TopupQuote {
  if (opts.matchedAtomic === 0n) {
    throw new PaymentVerifyError(
      'NO_MATCHING_TRANSFER',
      'No matching USDG transfer found for this top-up amount',
    )
  }
  const paidUsd = atomicToUsdg(opts.matchedAtomic)
  const paidQuote = quoteTopup(paidUsd)
  if (!paidQuote) {
    throw new PaymentVerifyError('INVALID_AMOUNT', 'Top-up amount out of range')
  }
  const requestedQuote = resolveTopupPurchase({
    usdg: opts.requestedUsdg,
    packId: opts.requestedPackId,
  })
  if (requestedQuote && requestedQuote.usdg > paidQuote.usdg + 0.01) {
    throw new PaymentVerifyError(
      'NO_MATCHING_TRANSFER',
      'No matching USDG transfer found for this top-up amount',
    )
  }
  return paidQuote
}

function treasury(): Address {
  const addr = process.env.TREASURY_ADDRESS
  if (!addr?.startsWith('0x')) {
    throw new PaymentVerifyError(
      'NO_TREASURY',
      'TREASURY_ADDRESS must be set to USDG receive wallet',
    )
  }
  return addr as Address
}

export async function verifyUsdgPayment(opts: {
  txHash: string
  wallet: string
  /** USD / USDG amount paid (over-claim guard; mint uses matched transfer). */
  usdg: number
  packId?: string
}): Promise<{ ok: true } & TopupQuote> {
  // Local/dev only — never free-claim in production (ignore flag if NODE_ENV=production).
  const isProd = process.env.NODE_ENV === 'production' || process.env.METADATA_ENV === 'production'
  if (process.env.DEV_TRUST_CLAIM === '1' && !isProd) {
    const quote =
      resolveTopupPurchase({ usdg: opts.usdg, packId: opts.packId }) ?? quoteTopup(opts.usdg)
    if (!quote) {
      throw new PaymentVerifyError('INVALID_AMOUNT', 'Top-up amount out of range')
    }
    console.warn(
      '[metadata] DEV_TRUST_CLAIM=1 — accepting claim without on-chain verify (non-production only)',
    )
    return { ok: true, ...quote }
  }

  const client = createPublicClient({
    chain: robinhoodChain,
    transport: http(
      process.env.ROBINHOOD_RPC_URL ??
        process.env.RPC_URL ??
        robinhoodChain.rpcUrls.default.http[0],
      { timeout: 5000, retryCount: 0 },
    ),
  })

  const actualChainId = await client.getChainId()
  if (actualChainId !== ROBINHOOD_USDG.chainId) {
    throw new PaymentVerifyError(
      'WRONG_NETWORK',
      `Payment RPC is on chain ${actualChainId}; expected ${ROBINHOOD_USDG.chainId}`,
    )
  }

  const hash = opts.txHash as Hash
  const receipt = await client.getTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new PaymentVerifyError('TX_FAILED', 'Transaction failed on-chain')
  }

  const minConf = parsePaymentMinConfirmations(process.env.PAYMENT_MIN_CONFIRMATIONS)
  const head = await client.getBlockNumber()
  if (head - receipt.blockNumber < BigInt(minConf)) {
    throw new PaymentVerifyError('WAITING_CONFIRMATIONS', 'Waiting for blockchain confirmations')
  }

  const to = treasury().toLowerCase()
  const from = opts.wallet.toLowerCase()
  const token = ROBINHOOD_USDG.address.toLowerCase()

  let matched = 0n
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== token) continue
    try {
      const decoded = decodeEventLog({
        abi: [transferEvent],
        data: log.data,
        topics: log.topics,
      })
      if (decoded.eventName !== 'Transfer') continue
      const args = decoded.args as {
        from: Address
        to: Address
        value: bigint
      }
      if (args.to.toLowerCase() !== to) continue
      if (args.from.toLowerCase() !== from) {
        throw new PaymentVerifyError('WRONG_PAYER', 'Payment must come from the claiming wallet')
      }
      matched += args.value
    } catch (e) {
      if (e instanceof PaymentVerifyError) throw e
    }
  }

  const paidQuote = quoteVerifiedTopup({
    matchedAtomic: matched,
    requestedUsdg: opts.usdg,
    requestedPackId: opts.packId,
  })
  return { ok: true, ...paidQuote }
}

/** @deprecated Prefer verifyUsdgPayment with usdg amount. */
export async function verifyUsdgPackPayment(opts: {
  txHash: string
  wallet: string
  packId: string
}): Promise<{ ok: true; credits: number; usdg: number }> {
  const result = await verifyUsdgPayment({
    txHash: opts.txHash,
    wallet: opts.wallet,
    packId: opts.packId,
    usdg: Number.NaN,
  })
  return {
    ok: true,
    credits: result.totalCredits,
    usdg: result.usdg,
  }
}
