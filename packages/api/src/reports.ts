/**
 * Append-only data quality reports (JSONL under DATA_DIR/reports/).
 * Single-process file mutex — same freeze as ledger.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { listingFromContribution, upsertAcceptedDataset } from './datasets.js'
import { creditWallet } from './ledger.js'

export type ReportKind = 'correction' | 'missing' | 'spam' | 'dmca' | 'other'

export interface ReportPayload {
  kind: ReportKind
  vertical: string
  entityKind: string
  entityId: string
  field?: string | null
  currentValue?: unknown
  suggestedValue?: unknown
  message: string
  sources?: string[]
  contributor?: string | null
  agent?: { name?: string; url?: string } | null
}

export interface StoredReport extends ReportPayload {
  id: string
  receivedAt: string
  ip?: string | null
  status: 'queued'
}

export type ContributeKind =
  | 'series'
  | 'character'
  | 'logo'
  | 'product'
  | 'brand'
  | 'card'
  | 'figure'
  | 'boardgame'
  | 'ost'
  | 'album'
  | 'dataset'
  | 'other'

export type ContributionStatus = 'queued' | 'accepted' | 'rejected'

export interface ContributePayload {
  kind: ContributeKind
  payload: Record<string, unknown>
  vertical?: string
  contributor?: string
  note?: string
  sources?: string[]
  wallet?: string
}

export type StoredContribution = {
  id: string
  type: 'contribution'
  receivedAt: string
  status: ContributionStatus
  ip?: string | null
  kind: ContributeKind
  vertical: string
  payload: Record<string, unknown>
  contributor: string | null
  note: string | null
  sources: string[]
  wallet: string | null
}

export type ContributionDecision = {
  type: 'contribution-decision'
  id: string
  status: 'accepted' | 'rejected'
  at: string
  bountyCredits: number
  wallet: string | null
  actor: string
  note?: string | null
}

const REPORT_KINDS: ReportKind[] = ['correction', 'missing', 'spam', 'dmca', 'other']

const CONTRIBUTE_KINDS: ContributeKind[] = [
  'series',
  'character',
  'logo',
  'product',
  'brand',
  'card',
  'figure',
  'boardgame',
  'ost',
  'album',
  'dataset',
  'other',
]

// 14 was wrong: it dropped rows older than two weeks. 400 daily files ≈ 13 months.
const CONTRIBUTION_SCAN_FILE_CAP = 400
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/

const MAX_MESSAGE = 4000
const MAX_SOURCES = 10
const MAX_SOURCE_LENGTH = 2048
const MAX_CONTRIBUTOR_LENGTH = 256
const MAX_NOTE_LENGTH = 4000
const MAX_JSON_DEPTH = 6
const MAX_JSON_KEYS = 64
const MAX_JSON_ARRAY_ITEMS = 50
const MAX_JSON_STRING_LENGTH = 4000
const MAX_PENDING_WRITES = 100

let mutex: Promise<void> = Promise.resolve()
let pendingWrites = 0

function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  if (pendingWrites >= MAX_PENDING_WRITES) {
    return Promise.reject(new Error('REPORT_QUEUE_FULL'))
  }
  pendingWrites += 1
  const run = mutex.then(fn, fn)
  const finished = run.finally(() => {
    pendingWrites = Math.max(0, pendingWrites - 1)
  })
  mutex = finished.then(
    () => undefined,
    () => undefined,
  )
  return finished
}

function dataDir() {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
}

function reportsDir() {
  return path.join(dataDir(), 'reports')
}

function dayFile(d = new Date()) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return path.join(reportsDir(), `${y}-${m}-${day}.jsonl`)
}

function newId() {
  return `rpt_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
}

export function isReportKind(k: string): k is ReportKind {
  return (REPORT_KINDS as string[]).includes(k)
}

export function isContributeKind(k: string): k is ContributeKind {
  return (CONTRIBUTE_KINDS as string[]).includes(k)
}

/** Optional contribute wallet: 0x + 40 hex. Invalid strings return null. */
export function normalizeContributeWallet(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!WALLET_RE.test(v)) return null
  return v.toLowerCase()
}

export function contributeKindsList(): string {
  return CONTRIBUTE_KINDS.join('|')
}

export function contributorBountyCredits(): number {
  const n = Number(process.env.CONTRIBUTOR_BOUNTY_CREDITS ?? 50)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 50
}

export function validateDatasetContribution(
  payload: Record<string, unknown>,
  wallet: string | null,
): { ok: true } | { ok: false; error: string } {
  const title = payload.title
  if (typeof title !== 'string' || !title.trim()) {
    return { ok: false, error: 'dataset payload.title is required' }
  }
  if (title.trim().length > 200) {
    return { ok: false, error: 'dataset payload.title must be <= 200 characters' }
  }
  if (!wallet) {
    return { ok: false, error: 'dataset contributions require a wallet' }
  }
  return { ok: true }
}

function boundJsonValue(
  value: unknown,
  depth = 0,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (value === null || typeof value === 'boolean') return { ok: true, value }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { ok: true, value }
      : { ok: false, error: 'JSON numbers must be finite' }
  }
  if (typeof value === 'string') {
    return value.length <= MAX_JSON_STRING_LENGTH
      ? { ok: true, value }
      : { ok: false, error: `JSON strings must be <= ${MAX_JSON_STRING_LENGTH} characters` }
  }
  if (depth >= MAX_JSON_DEPTH) {
    return { ok: false, error: `JSON nesting must be <= ${MAX_JSON_DEPTH} levels` }
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ARRAY_ITEMS) {
      return {
        ok: false,
        error: `JSON arrays must contain <= ${MAX_JSON_ARRAY_ITEMS} items`,
      }
    }
    const output: unknown[] = []
    for (const item of value) {
      const bounded = boundJsonValue(item, depth + 1)
      if (!bounded.ok) return bounded
      output.push(bounded.value)
    }
    return { ok: true, value: output }
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length > MAX_JSON_KEYS) {
      return {
        ok: false,
        error: `JSON objects must contain <= ${MAX_JSON_KEYS} keys`,
      }
    }
    const output: Record<string, unknown> = {}
    for (const [key, item] of entries) {
      if (key.length > 128) {
        return { ok: false, error: 'JSON object keys must be <= 128 characters' }
      }
      const bounded = boundJsonValue(item, depth + 1)
      if (!bounded.ok) return bounded
      output[key] = bounded.value
    }
    return { ok: true, value: output }
  }
  return { ok: false, error: 'Unsupported JSON value' }
}

export function validateContributionPayload(
  value: unknown,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'payload must be a JSON object' }
  }
  const bounded = boundJsonValue(value)
  if (!bounded.ok) return bounded
  return { ok: true, payload: bounded.value as Record<string, unknown> }
}

export type BoundedContributionMetadata = {
  contributor: string | null
  note: string | null
  sources: string[]
}

export function validateContributionMetadata(value: {
  contributor?: unknown
  note?: unknown
  sources?: unknown
}): { ok: true; metadata: BoundedContributionMetadata } | { ok: false; error: string } {
  if (
    value.contributor !== undefined &&
    value.contributor !== null &&
    typeof value.contributor !== 'string'
  ) {
    return { ok: false, error: 'contributor must be a string' }
  }
  if (value.note !== undefined && value.note !== null && typeof value.note !== 'string') {
    return { ok: false, error: 'note must be a string' }
  }
  if (value.sources !== undefined && !Array.isArray(value.sources)) {
    return { ok: false, error: 'sources must be an array of strings' }
  }
  const sources: string[] = []
  for (const source of value.sources ?? []) {
    if (typeof source !== 'string' || source.length > MAX_SOURCE_LENGTH) {
      return {
        ok: false,
        error: `sources must be strings <= ${MAX_SOURCE_LENGTH} characters`,
      }
    }
    if (source.trim()) sources.push(source.trim())
  }
  if (sources.length > MAX_SOURCES) {
    return { ok: false, error: `sources must contain <= ${MAX_SOURCES} URLs` }
  }
  return {
    ok: true,
    metadata: {
      contributor:
        typeof value.contributor === 'string'
          ? value.contributor.slice(0, MAX_CONTRIBUTOR_LENGTH)
          : null,
      note: typeof value.note === 'string' ? value.note.slice(0, MAX_NOTE_LENGTH) : null,
      sources,
    },
  }
}

export function validateReport(
  body: unknown,
): { ok: true; report: ReportPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid JSON body' }
  }
  const b = body as Record<string, unknown>
  if (!b.kind || typeof b.kind !== 'string' || !isReportKind(b.kind)) {
    return {
      ok: false,
      error: `kind must be one of: ${REPORT_KINDS.join('|')}`,
    }
  }
  if (!b.vertical || typeof b.vertical !== 'string') {
    return { ok: false, error: 'vertical required' }
  }
  if (!b.entityKind || typeof b.entityKind !== 'string') {
    return { ok: false, error: 'entityKind required' }
  }
  if (!b.entityId || typeof b.entityId !== 'string') {
    return { ok: false, error: 'entityId required' }
  }
  if (!b.message || typeof b.message !== 'string' || !b.message.trim()) {
    return { ok: false, error: 'message required' }
  }
  if (String(b.vertical).length > 64) {
    return { ok: false, error: 'vertical must be <= 64 characters' }
  }
  if (String(b.entityKind).length > 64) {
    return { ok: false, error: 'entityKind must be <= 64 characters' }
  }
  if (String(b.entityId).length > 256) {
    return { ok: false, error: 'entityId must be <= 256 characters' }
  }
  const message = b.message.trim().slice(0, MAX_MESSAGE)
  if (Array.isArray(b.sources) && b.sources.length > MAX_SOURCES) {
    return { ok: false, error: `sources must contain <= ${MAX_SOURCES} URLs` }
  }
  let sources: string[] | undefined
  if (Array.isArray(b.sources)) {
    sources = []
    for (const source of b.sources) {
      if (typeof source !== 'string' || source.length > MAX_SOURCE_LENGTH) {
        return {
          ok: false,
          error: `sources must be strings <= ${MAX_SOURCE_LENGTH} characters`,
        }
      }
      sources.push(source.trim())
    }
  }
  if (sources?.some((source) => !source)) {
    return { ok: false, error: 'sources cannot contain empty values' }
  }
  let currentValue: unknown
  let suggestedValue: unknown
  for (const [label, value] of [
    ['currentValue', b.currentValue],
    ['suggestedValue', b.suggestedValue],
  ] as const) {
    if (value === undefined) continue
    const bounded = boundJsonValue(value)
    if (!bounded.ok) return { ok: false, error: `${label}: ${bounded.error}` }
    if (label === 'currentValue') currentValue = bounded.value
    else suggestedValue = bounded.value
  }
  if (typeof b.contributor === 'string' && b.contributor.length > MAX_CONTRIBUTOR_LENGTH) {
    return { ok: false, error: `contributor must be <= ${MAX_CONTRIBUTOR_LENGTH} characters` }
  }
  const agent =
    b.agent && typeof b.agent === 'object'
      ? {
          name:
            typeof (b.agent as { name?: unknown }).name === 'string'
              ? (b.agent as { name: string }).name.slice(0, 256)
              : undefined,
          url:
            typeof (b.agent as { url?: unknown }).url === 'string'
              ? (b.agent as { url: string }).url.slice(0, 2048)
              : undefined,
        }
      : null

  return {
    ok: true,
    report: {
      kind: b.kind,
      vertical: String(b.vertical).toLowerCase().slice(0, 64),
      entityKind: String(b.entityKind).slice(0, 64),
      entityId: String(b.entityId).slice(0, 256),
      field: typeof b.field === 'string' ? b.field.slice(0, 128) : null,
      currentValue,
      suggestedValue,
      message,
      sources,
      contributor: typeof b.contributor === 'string' ? b.contributor.slice(0, 256) : null,
      agent,
    },
  }
}

export async function appendReport(
  report: ReportPayload,
  meta?: { ip?: string | null },
): Promise<StoredReport> {
  return withLock(async () => {
    const dir = reportsDir()
    await fs.promises.mkdir(dir, { recursive: true })
    const stored: StoredReport = {
      ...report,
      id: newId(),
      receivedAt: new Date().toISOString(),
      ip: meta?.ip ?? null,
      status: 'queued',
    }
    const line = JSON.stringify(stored) + '\n'
    await fs.promises.appendFile(dayFile(), line, 'utf8')
    return stored
  })
}

export async function appendContribution(entry: {
  kind: ContributeKind
  vertical: string
  payload: Record<string, unknown>
  contributor?: unknown
  note?: unknown
  sources?: unknown
  wallet?: string | null
  ip?: string | null
}): Promise<{ id: string; receivedAt: string; status: 'queued'; wallet: string | null }> {
  const bounded = validateContributionPayload(entry.payload)
  if (!bounded.ok) return Promise.reject(new Error(bounded.error))
  const metadata = validateContributionMetadata(entry)
  if (!metadata.ok) return Promise.reject(new Error(metadata.error))
  if (typeof entry.vertical !== 'string' || entry.vertical.length > 64) {
    return Promise.reject(new Error('vertical must be a string <= 64 characters'))
  }
  const wallet = entry.wallet ?? null
  if (entry.kind === 'dataset') {
    const dataset = validateDatasetContribution(bounded.payload, wallet)
    if (!dataset.ok) return Promise.reject(new Error(dataset.error))
  }
  return withLock(async () => {
    const dir = reportsDir()
    await fs.promises.mkdir(dir, { recursive: true })
    const id = `ctrb_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`
    const receivedAt = new Date().toISOString()
    const row: StoredContribution = {
      id,
      type: 'contribution',
      receivedAt,
      status: 'queued',
      ip: entry.ip ?? null,
      kind: entry.kind,
      vertical: entry.vertical,
      payload: bounded.payload,
      contributor: metadata.metadata.contributor,
      note: metadata.metadata.note,
      sources: metadata.metadata.sources,
      wallet,
    }
    await fs.promises.appendFile(dayFile(), JSON.stringify(row) + '\n', 'utf8')
    return { id, receivedAt, status: 'queued' as const, wallet }
  })
}

function reportJsonlFilesNewestFirst(): string[] {
  const dir = reportsDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .sort()
    .reverse()
    .slice(0, CONTRIBUTION_SCAN_FILE_CAP)
    .map((name) => path.join(dir, name))
}

function parseJsonlLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  try {
    const value = JSON.parse(trimmed) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

function overlayDecision(
  row: StoredContribution,
  decisions: ContributionDecision[],
): StoredContribution {
  if (decisions.length === 0) return { ...row, status: 'queued' }
  const latest = [...decisions].sort((a, b) => (a.at || '').localeCompare(b.at || '')).at(-1)
  if (!latest) return { ...row, status: 'queued' }
  return { ...row, status: latest.status, wallet: row.wallet ?? latest.wallet }
}

function scanContributionSync(id: string): StoredContribution | null {
  let row: StoredContribution | null = null
  const decisions: ContributionDecision[] = []
  for (const file of reportJsonlFilesNewestFirst()) {
    let text = ''
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n')) {
      const obj = parseJsonlLine(line)
      if (!obj || obj.id !== id) continue
      if (obj.type === 'contribution') {
        row = obj as unknown as StoredContribution
      } else if (obj.type === 'contribution-decision') {
        decisions.push(obj as unknown as ContributionDecision)
      }
    }
  }
  if (!row) return null
  return overlayDecision(row, decisions)
}

export async function getContribution(id: string): Promise<StoredContribution | null> {
  return withLock(() => scanContributionSync(id))
}

async function appendDecision(decision: ContributionDecision): Promise<void> {
  const dir = reportsDir()
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.appendFile(dayFile(), `${JSON.stringify(decision)}\n`, 'utf8')
}

export type AcceptContributionResult =
  | {
      ok: true
      alreadyApplied: boolean
      status: 'accepted'
      bountyCredits: number
      wallet: string | null
      kind: ContributeKind
      id: string
    }
  | { ok: false; reason: 'NOT_FOUND' | 'REJECTED' }

export async function acceptContribution(
  id: string,
  opts: { actor: string; note?: string | null },
): Promise<AcceptContributionResult> {
  return withLock(async () => {
    const found = scanContributionSync(id)
    if (!found) return { ok: false as const, reason: 'NOT_FOUND' as const }
    if (found.status === 'rejected') return { ok: false as const, reason: 'REJECTED' as const }
    if (found.status === 'accepted') {
      if (found.kind === 'dataset') {
        const listing = listingFromContribution(found)
        if (listing) await upsertAcceptedDataset(listing)
      }
      return {
        ok: true as const,
        alreadyApplied: true,
        status: 'accepted' as const,
        bountyCredits: 0,
        wallet: found.wallet,
        kind: found.kind,
        id: found.id,
      }
    }

    const bounty = contributorBountyCredits()
    let bountyCredits = 0
    if (found.wallet && bounty > 0) {
      await creditWallet({
        wallet: found.wallet,
        credits: bounty,
        idempotencyKey: `contrib:${id}`,
      })
      bountyCredits = bounty
    }

    const decision: ContributionDecision = {
      type: 'contribution-decision',
      id,
      status: 'accepted',
      at: new Date().toISOString(),
      bountyCredits,
      wallet: found.wallet,
      actor: opts.actor,
      note: opts.note ?? null,
    }
    await appendDecision(decision)

    if (found.kind === 'dataset') {
      const listing = listingFromContribution(found)
      if (listing) await upsertAcceptedDataset(listing)
    }

    return {
      ok: true as const,
      alreadyApplied: false,
      status: 'accepted' as const,
      bountyCredits,
      wallet: found.wallet,
      kind: found.kind,
      id: found.id,
    }
  })
}

export type RejectContributionResult =
  | {
      ok: true
      alreadyApplied: boolean
      status: 'rejected'
      id: string
    }
  | { ok: false; reason: 'NOT_FOUND' | 'ACCEPTED' }

export async function rejectContribution(
  id: string,
  opts: { actor: string; note?: string | null },
): Promise<RejectContributionResult> {
  return withLock(async () => {
    const found = scanContributionSync(id)
    if (!found) return { ok: false as const, reason: 'NOT_FOUND' as const }
    if (found.status === 'accepted') return { ok: false as const, reason: 'ACCEPTED' as const }
    if (found.status === 'rejected') {
      return {
        ok: true as const,
        alreadyApplied: true,
        status: 'rejected' as const,
        id: found.id,
      }
    }
    const decision: ContributionDecision = {
      type: 'contribution-decision',
      id,
      status: 'rejected',
      at: new Date().toISOString(),
      bountyCredits: 0,
      wallet: found.wallet,
      actor: opts.actor,
      note: opts.note ?? null,
    }
    await appendDecision(decision)
    return {
      ok: true as const,
      alreadyApplied: false,
      status: 'rejected' as const,
      id: found.id,
    }
  })
}
