/**
 * Reown AppKit wallet login for the Metadata console.
 *
 * AppKit is loaded lazily on Login so ambient pages don't pull WalletConnect
 * scripts, pulse analytics, or modal overlays until the user asks.
 */

import { resolveApiBase } from './config'
import { metadataEnvironment, robinhoodRpcUrl } from './payment-env'

export type WalletState = {
  address: string | null
  short: string | null
  connected: boolean
  mode: 'reown' | 'injected' | 'none'
}

type AppKitModal = {
  open: (opts?: { view?: string; namespace?: string }) => Promise<void> | void
  close?: () => Promise<void> | void
  disconnect?: (namespace?: string) => Promise<void>
  getAddress?: (namespace?: string) => string | undefined
  getWalletProvider?: () => unknown
  getIsConnectedState?: () => boolean
  subscribeAccount?: (cb: (a: { address?: string; isConnected?: boolean }) => void) => () => void
}

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

type StoredSession = {
  token: string
  wallet: string
  expiresAt: string
}

type Listener = (s: WalletState) => void

const STORAGE_KEY = 'metadata.wallet'
const SESSION_KEY = 'metadata.session'
const PROJECT_ID = (import.meta.env.VITE_REOWN_PROJECT_ID || '').trim()

let address: string | null = null
let mode: WalletState['mode'] = 'none'
let modal: AppKitModal | null = null
let initPromise: Promise<void> | null = null
let sessionPromise: Promise<boolean> | null = null
const listeners = new Set<Listener>()

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function loadStored(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)
    return v?.startsWith('0x') ? v.toLowerCase() : null
  } catch {
    return null
  }
}

function store(a: string | null) {
  try {
    if (a) sessionStorage.setItem(STORAGE_KEY, a)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredSession>
    if (
      typeof value.token !== 'string' ||
      typeof value.wallet !== 'string' ||
      typeof value.expiresAt !== 'string'
    ) {
      return null
    }
    const expires = Date.parse(value.expiresAt)
    if (Number.isFinite(expires) && expires <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY)
      return null
    }
    return {
      token: value.token,
      wallet: value.wallet.toLowerCase(),
      expiresAt: value.expiresAt,
    }
  } catch {
    return null
  }
}

function storeSession(session: StoredSession | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

function emit() {
  const s = getWalletState()
  for (const l of listeners) l(s)
}

export function getWalletState(): WalletState {
  return {
    address,
    short: address ? shortAddr(address) : null,
    connected: Boolean(address),
    mode,
  }
}

export function onWalletChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getWalletHeader(): Record<string, string> {
  if (!address) return {}
  const headers: Record<string, string> = { 'X-Wallet-Address': address }
  const session = loadSession()
  if (session?.wallet === address) {
    headers['X-Metadata-Session'] = session.token
  }
  return headers
}

export function hasWalletSession(): boolean {
  const session = loadSession()
  return Boolean(address && session?.wallet === address)
}

function setAddress(a: string | null, m: WalletState['mode']) {
  address = a ? a.toLowerCase() : null
  mode = a ? m : 'none'
  store(address)
  const session = loadSession()
  if (!address || (session && session.wallet !== address)) storeSession(null)
  emit()
}

/**
 * Soft boot: restore last-known address for UI only.
 * Does NOT load AppKit / WalletConnect (avoids pulse.* and modal DOM on every page).
 */
function softRestore() {
  const restored = loadStored()
  if (restored && !address) {
    address = restored
    mode = PROJECT_ID ? 'reown' : 'injected'
    emit()
  } else {
    emit()
  }
}

async function initReown() {
  if (!PROJECT_ID) {
    console.warn(
      '[Metadata] VITE_REOWN_PROJECT_ID is not set — Login will not open the Reown modal. Get a free id at https://dashboard.reown.com',
    )
    return false
  }
  try {
    const [{ createAppKit }, { EthersAdapter }, networks] = await Promise.all([
      import('@reown/appkit'),
      import('@reown/appkit-adapter-ethers'),
      import('@reown/appkit/networks'),
    ])

    const robinhood = networks.defineChain({
      id: metadataEnvironment === 'production' ? 4663 : 46630,
      caipNetworkId: metadataEnvironment === 'production' ? 'eip155:4663' : 'eip155:46630',
      chainNamespace: 'eip155',
      name: metadataEnvironment === 'production' ? 'Robinhood Chain' : 'Robinhood Chain Testnet',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: {
          http: [robinhoodRpcUrl],
        },
      },
    })

    const mainnet = networks.mainnet
    const origin = window.location.origin

    const kit = createAppKit({
      adapters: [new EthersAdapter()],
      networks: [robinhood, mainnet] as [typeof robinhood, typeof mainnet],
      defaultNetwork: robinhood,
      projectId: PROJECT_ID,
      metadata: {
        name: 'Metadata',
        description: 'Public multi-vertical metadata API console',
        url: origin,
        icons: [`${origin}/logo.png`, `${origin}/logo-edr.png`],
      },
      // Explicitly disable Cloud analytics / pulse.walletconnect.org batch calls.
      features: {
        analytics: false,
        email: false,
        socials: false,
        swaps: false,
        onramp: false,
        history: false,
        allWallets: true,
      },
      allWallets: 'SHOW',
      enableWalletGuide: false,
      enableNetworkSwitch: true,
      allowUnsupportedChain: true,
      themeMode: 'dark',
      themeVariables: {
        '--w3m-accent': '#a1a1aa',
      },
    }) as AppKitModal

    modal = kit

    // Ensure any leftover modal shell never intercepts page clicks when closed.
    requestAnimationFrame(() => {
      document.querySelectorAll('w3m-modal, w3m-router, appkit-modal').forEach((el) => {
        const host = el as HTMLElement
        if (!host.style.pointerEvents) {
          /* leave open state alone; AppKit manages display */
        }
      })
    })

    kit.subscribeAccount?.((account) => {
      if (account?.isConnected && account.address) {
        setAddress(account.address, 'reown')
        void ensureWalletSession(account.address).catch((e) => {
          console.warn('[Metadata] Wallet session was not established', e)
        })
      } else if (!account?.isConnected && mode === 'reown') {
        setAddress(null, 'none')
      }
    })

    const live = kit.getIsConnectedState?.() && kit.getAddress?.()
    if (live && typeof live === 'string') {
      setAddress(live, 'reown')
    }

    return true
  } catch (e) {
    console.warn('[Metadata] Reown AppKit init failed', e)
    modal = null
    return false
  }
}

/** Full AppKit init — only call on Login / Pay / explicit need. */
async function ensureInit() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    await initReown()
    if (!modal) {
      const restored = loadStored()
      if (restored && !PROJECT_ID) {
        address = restored
        mode = 'injected'
        emit()
      }
    }
  })()
  return initPromise
}

export async function ensureAppKitReady(): Promise<void> {
  await ensureInit()
  if (!PROJECT_ID) {
    throw new Error('Set VITE_REOWN_PROJECT_ID (https://dashboard.reown.com) to use Reown Pay.')
  }
  if (!modal) {
    throw new Error('Reown AppKit failed to initialize — check project id and network.')
  }
}

export function hasReownProjectId(): boolean {
  return Boolean(PROJECT_ID)
}

function asProvider(value: unknown): Eip1193Provider | null {
  if (!value || typeof value !== 'object') return null
  const request = (value as { request?: unknown }).request
  return typeof request === 'function' ? (value as Eip1193Provider) : null
}

function injectedProvider(): Eip1193Provider | null {
  return asProvider((window as unknown as { ethereum?: unknown }).ethereum)
}

async function signMessage(message: string, wallet: string): Promise<string> {
  const provider =
    mode === 'reown'
      ? asProvider(modal?.getWalletProvider?.()) || injectedProvider()
      : injectedProvider()
  if (!provider) {
    throw new Error('Connected wallet does not expose a signing provider')
  }

  let result: unknown
  try {
    result = await provider.request({
      method: 'personal_sign',
      params: [message, wallet],
    })
  } catch {
    // A few EIP-1193 wallets use the legacy [address, message] ordering.
    result = await provider.request({
      method: 'personal_sign',
      params: [wallet, message],
    })
  }
  if (typeof result !== 'string' || !result.startsWith('0x')) {
    throw new Error('Wallet did not return a personal signature')
  }
  return result
}

/** Establish or restore the server-issued ownership session for a wallet. */
export async function ensureWalletSession(wallet = address): Promise<boolean> {
  const normalized = wallet?.toLowerCase()
  if (!normalized) return false
  const existing = loadSession()
  if (existing?.wallet === normalized) return true
  if (sessionPromise) return sessionPromise

  sessionPromise = (async () => {
    const base = resolveApiBase().replace(/\/$/, '')
    const nonceRes = await fetch(
      `${base}/v1/pay/auth/nonce?wallet=${encodeURIComponent(normalized)}`,
      { credentials: 'omit' },
    )
    const nonceBody = (await nonceRes.json().catch(() => ({}))) as {
      message?: string
      error?: string
    }
    if (!nonceRes.ok || !nonceBody.message) {
      throw new Error(nonceBody.error || `Wallet login nonce failed (${nonceRes.status})`)
    }

    const signature = await signMessage(nonceBody.message, normalized)
    const verifyRes = await fetch(`${base}/v1/pay/auth/verify`, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: normalized,
        message: nonceBody.message,
        signature,
      }),
    })
    const verifyBody = (await verifyRes.json().catch(() => ({}))) as {
      token?: string
      expiresAt?: string
      error?: string
      message?: string
    }
    if (!verifyRes.ok || !verifyBody.token || !verifyBody.expiresAt) {
      throw new Error(
        verifyBody.message || verifyBody.error || `Wallet login failed (${verifyRes.status})`,
      )
    }
    storeSession({
      token: verifyBody.token,
      wallet: normalized,
      expiresAt: verifyBody.expiresAt,
    })
    emit()
    return true
  })()

  try {
    return await sessionPromise
  } finally {
    sessionPromise = null
  }
}

async function connectInjected() {
  const eth = (
    window as unknown as {
      ethereum?: { request: (a: { method: string }) => Promise<unknown> }
    }
  ).ethereum
  if (!eth) {
    throw new Error(
      'No browser wallet found. Set VITE_REOWN_PROJECT_ID for Reown modal login, or install a wallet.',
    )
  }
  const accounts = await eth.request({ method: 'eth_requestAccounts' })
  const a = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null
  if (!a) throw new Error('No account returned')
  setAddress(a, 'injected')
  await ensureWalletSession(a)
}

/** Open Reown AppKit Connect UI (multi-wallet). */
export async function connectWallet() {
  await ensureInit()

  if (PROJECT_ID) {
    if (!modal) {
      initPromise = null
      await ensureInit()
    }
    if (!modal) {
      throw new Error('Reown AppKit did not start. Check VITE_REOWN_PROJECT_ID and reload.')
    }
    await modal.open({ view: 'Connect' })
    return getWalletState()
  }

  console.warn(
    '[Metadata] Opening injected wallet (no VITE_REOWN_PROJECT_ID). Add a project id for the Reown modal.',
  )
  await connectInjected()
  return getWalletState()
}

export async function disconnectWallet() {
  const session = loadSession()
  if (session) {
    try {
      const base = resolveApiBase().replace(/\/$/, '')
      await fetch(`${base}/v1/pay/auth/logout`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'X-Metadata-Session': session.token },
      })
    } catch {
      /* local logout still clears the client session */
    }
  }
  storeSession(null)
  // Only init if we already had a modal / need to clear WC session
  if (modal || PROJECT_ID) {
    try {
      await ensureInit()
      if (modal?.disconnect) await modal.disconnect()
      else await modal?.close?.()
    } catch {
      /* ignore */
    }
  }
  setAddress(null, 'none')
}

export async function toggleWallet() {
  // Soft-connected from sessionStorage: disconnect without loading AppKit
  if (address && !modal) {
    // Prefer a real WC disconnect if AppKit still has a session.
    if (mode === 'reown' && PROJECT_ID) {
      await ensureInit()
      const activeModal = modal as AppKitModal | null
      const live = activeModal ? Boolean(activeModal.getIsConnectedState?.()) : false
      if (live) {
        await disconnectWallet()
        return getWalletState()
      }
    }
    setAddress(null, 'none')
    return getWalletState()
  }

  const activeModal = modal as AppKitModal | null
  const live = activeModal ? Boolean(activeModal.getIsConnectedState?.()) : false
  const connected = Boolean(address) || live
  if (connected) {
    await disconnectWallet()
  } else {
    await connectWallet()
  }
  return getWalletState()
}

/**
 * Call once on page boot. Restores address for UI only — does not load AppKit.
 */
export function bootWallet(onChange?: Listener) {
  if (onChange) onWalletChange(onChange)
  softRestore()
}
