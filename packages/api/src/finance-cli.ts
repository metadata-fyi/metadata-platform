import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { financeReport, loadFinanceConfig, recordFinanceEvent } from './finance.js'
import { financeControlsPath, type FinanceControls } from './finance-controls.js'
import { closeRuntimeDb, getRuntimeDb, runtimeDbTransaction } from './runtime-db.js'
import { assertStripeAccount, getStripe, isStripeLive } from './stripe-pay.js'
import { catalogPolicy } from './catalog-policy.js'

const args = process.argv.slice(2)
function arg(name: string) {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
const outputDir = path.join(dataDir, 'finance')
function save(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, file)
}

async function review() {
  const report = financeReport()
  const alerts: string[] = []
  if (!report.reconciliation.ok) alerts.push('CREDIT_JOURNAL_MISMATCH')
  if (report.unpricedLegacyCredits > 0) alerts.push('LEGACY_RECEIPTS_MISSING')
  if (!report.economics.variableCostMeasured) alerts.push('VARIABLE_COST_UNMEASURED')
  if (report.config.costs.some((row) => row.status !== 'confirmed'))
    alerts.push('OPERATING_COSTS_ESTIMATED')
  if (report.economics.projectedOperatingProfitUsd < 0) alerts.push('FORECAST_LOSS')
  if (report.heldWallets || report.debtCredits) alerts.push('PAYMENT_RISK')
  if (
    (
      getRuntimeDb()
        .prepare('SELECT COUNT(*) AS n FROM stripe_pending_entitlements WHERE environment = ?')
        .get(report.environment) as { n: number }
    ).n > 0
  )
    alerts.push('UNMATCHED_PROVIDER_REFUND')
  if (
    (
      getRuntimeDb()
        .prepare(
          "SELECT COUNT(*) AS n FROM x402_settlement_attempts WHERE environment = ? AND status = 'pending'",
        )
        .get(report.environment) as { n: number }
    ).n > 0
  )
    alerts.push('X402_SETTLEMENT_UNRESOLVED')
  if (Date.now() - Date.parse(report.config.checkedAt) > 31 * 86_400_000)
    alerts.push('COST_ASSUMPTIONS_STALE')
  if (!process.env.BACKUP_R2_REMOTE) alerts.push('OFFSITE_BACKUP_UNCONFIGURED')
  const backupStatus = path.join(outputDir, 'backup-latest.json')
  const lastBackup = fs.existsSync(backupStatus)
    ? (JSON.parse(fs.readFileSync(backupStatus, 'utf8')) as {
        at: string
        offsiteVerified: boolean
      })
    : undefined
  if (
    !lastBackup?.offsiteVerified ||
    !Number.isFinite(Date.parse(lastBackup.at)) ||
    Date.now() - Date.parse(lastBackup.at) > 2 * 60 * 60 * 1000
  )
    alerts.push('OFFSITE_BACKUP_STALE')
  const controls: FinanceControls = {
    version: 1,
    at: new Date().toISOString(),
    disableX402:
      report.config.variable.x402PerRequestUsd === null ||
      report.config.variable.x402PerRequestUsd >= Number(process.env.X402_PER_REQUEST_USD || 0.01),
    reason: [],
  }
  if (controls.disableX402) {
    alerts.push('X402_MARGIN_UNVERIFIED')
    controls.reason.push('External settlement cost is missing or exceeds its price.')
  }
  // Only measured economics may raise a floor; no automatic discounts, new
  // provider purchases, credit grants, cash payments, or deployment changes.
  const suggested = report.economics.targetCreditsPerUnit
  const pricingAllowed =
    report.economics.variableCostMeasured &&
    report.config.costs.every((row) => row.status === 'confirmed') &&
    report.reconciliation.ok &&
    report.config.monthlyPaidUnits > 0
  if (suggested && suggested > catalogPolicy().creditsPerUnit) {
    alerts.push('PRICE_BELOW_TARGET_MARGIN')
    if (pricingAllowed && suggested <= 10) controls.creditsPerUnit = suggested
    else
      controls.reason.push(
        'Price review needs measured costs/volume, or exceeds the automatic ceiling.',
      )
  }
  // Preserve an existing floor; the controller cannot silently discount reads.
  const controlFile = financeControlsPath()
  if (fs.existsSync(controlFile)) {
    const previous = JSON.parse(fs.readFileSync(controlFile, 'utf8')) as FinanceControls
    if (previous.creditsPerUnit)
      controls.creditsPerUnit = Math.max(previous.creditsPerUnit, controls.creditsPerUnit ?? 1)
  }
  if (args.includes('--apply')) save(controlFile, controls)
  const alertFile = path.join(outputDir, 'alerts.json')
  const previous = fs.existsSync(alertFile)
    ? (JSON.parse(fs.readFileSync(alertFile, 'utf8')) as { alerts: string[] })
    : { alerts: [] }
  const changed = JSON.stringify([...previous.alerts].sort()) !== JSON.stringify([...alerts].sort())
  const result = { changed, alerts, controls, applied: args.includes('--apply'), report }
  save(path.join(outputDir, 'latest.json'), result)
  save(path.join(outputDir, `review-${new Date().toISOString().slice(0, 10)}.json`), result)
  save(alertFile, { at: report.at, alerts })
  // Low-noise output is suitable for an agent heartbeat or a system journal.
  console.log(
    JSON.stringify({
      changed,
      alerts: changed ? alerts : [],
      reportFile: path.join(outputDir, 'latest.json'),
      applied: result.applied,
    }),
  )
  if (!report.reconciliation.ok) process.exitCode = 2
}

async function reconcileStripe() {
  if (!isStripeLive()) throw new Error('Stripe is disabled; no provider reconciliation attempted')
  const stripe = getStripe()
  await assertStripeAccount(stripe)
  const db = getRuntimeDb()
  const saved = db.prepare("SELECT value FROM meta WHERE key = 'finance_stripe_cursor'").get() as
    | { value: string }
    | undefined
  const cursor = saved
    ? (JSON.parse(saved.value) as { since: number; until: number; after?: string })
    : {
        since: Math.floor(Date.now() / 1000) - 31 * 86_400,
        until: Math.floor(Date.now() / 1000),
        after: undefined,
      }
  let observed = 0
  let complete = false
  for (let page = 0; page < 10; page++) {
    const batch = await stripe.balanceTransactions.list({
      limit: 100,
      created: { gte: cursor.since, lte: cursor.until },
      ...(cursor.after ? { starting_after: cursor.after } : {}),
    })
    runtimeDbTransaction(() => {
      for (const item of batch.data) {
        if (item.currency !== 'usd')
          throw new Error('Non-USD statement requires explicit currency reconciliation')
        const reference = typeof item.source === 'string' ? item.source : item.source?.id || item.id
        recordFinanceEvent({
          id: `stripe-statement:${item.id}`,
          kind: 'provider_statement',
          reference,
          detail: {
            provider: 'stripe',
            grossMicros: item.amount * 10_000,
            netMicros: item.net * 10_000,
            feeMicros: item.fee * 10_000,
            type: item.type,
            providerCreated: item.created,
          },
        })
        if (item.fee !== 0)
          recordFinanceEvent({
            id: `stripe-fee:${item.id}`,
            kind: 'processing_fee',
            reference,
            cashMicros: -item.fee * 10_000,
            detail: { provider: 'stripe', actual: true },
          })
        observed++
      }
      cursor.after = batch.data.at(-1)?.id
      if (!batch.has_more) complete = true
      const next = complete
        ? {
            since: Math.max(cursor.since, cursor.until - 86_400),
            until: Math.floor(Date.now() / 1000),
          }
        : cursor
      db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('finance_stripe_cursor', ?)").run(
        JSON.stringify(next),
      )
    })
    if (complete) break
  }
  console.log(
    JSON.stringify({
      ok: true,
      observed,
      complete,
      note: 'Statements/fees recorded. Gross receipts are journaled by payment handlers; do not count statement gross twice.',
    }),
  )
}

const runFile = promisify(execFile)
async function hashFile(file: string) {
  const hash = createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
function checkSqlite(file: string) {
  const require = createRequire(import.meta.url)
  const Database = require('better-sqlite3') as typeof import('better-sqlite3')
  const db = new Database(file, { readonly: true })
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok')
      throw new Error('Backup integrity failed')
  } finally {
    db.close()
  }
}
async function restoreBackup(file: string, output: string) {
  if (fs.existsSync(output)) throw new Error('Restore output already exists; refusing overwrite')
  const keyFile = process.env.BACKUP_KEY_FILE || path.join(dataDir, '.backup-key')
  const key = fs.readFileSync(keyFile)
  const header = Buffer.alloc(28)
  const fd = fs.openSync(file, 'r')
  try {
    if (fs.readSync(fd, header, 0, 28, 0) !== 28) throw new Error('Truncated backup')
  } finally {
    fs.closeSync(fd)
  }
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(0, 12))
  decipher.setAuthTag(header.subarray(12))
  try {
    await pipeline(
      fs.createReadStream(file, { start: 28 }),
      decipher,
      fs.createWriteStream(output, { mode: 0o600, flags: 'wx' }),
    )
    checkSqlite(output)
  } catch (error) {
    fs.rmSync(output, { force: true })
    throw error
  }
}

async function backup() {
  const db = getRuntimeDb()
  if (process.env.BACKUP_R2_REMOTE) {
    const pages = db.pragma('page_count', { simple: true }) as number
    const pageSize = db.pragma('page_size', { simple: true }) as number
    if (pages * pageSize + 28 > backupLimit('BACKUP_R2_MAX_FILE_BYTES', 32 * 1024 * 1024))
      throw new Error('Backup file exceeds the R2 free-tier upload ceiling')
  }
  const keyFile = process.env.BACKUP_KEY_FILE || path.join(dataDir, '.backup-key')
  fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 })
  if (!fs.existsSync(keyFile))
    fs.writeFileSync(keyFile, randomBytes(32), { mode: 0o600, flag: 'wx' })
  const key = fs.readFileSync(keyFile)
  if (key.byteLength !== 32) throw new Error('Backup key must contain 32 bytes')
  const directory = process.env.BACKUP_DIR || path.join(dataDir, 'backups')
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const stamp = new Date().toISOString().replaceAll(':', '-')
  const plain = path.join(dataDir, `.runtime-backup-${process.pid}.sqlite`)
  const encrypted = path.join(directory, `runtime-${stamp}.aesgcm`)
  try {
    await db.backup(plain)
    fs.chmodSync(plain, 0o600)
    checkSqlite(plain)
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const temporary = `${encrypted}.tmp`
    await pipeline(
      fs.createReadStream(plain),
      cipher,
      fs.createWriteStream(temporary, { mode: 0o600 }),
    )
    // Envelope: 12-byte IV, 16-byte authentication tag, ciphertext.
    fs.writeFileSync(encrypted, Buffer.concat([iv, cipher.getAuthTag()]), {
      mode: 0o600,
      flag: 'wx',
    })
    await pipeline(fs.createReadStream(temporary), fs.createWriteStream(encrypted, { flags: 'a' }))
    fs.unlinkSync(temporary)
    const digest = await hashFile(encrypted)
    // Verify authentication and SQLite recovery locally on every run.
    const restored = `${plain}.restored`
    try {
      await restoreBackup(encrypted, restored)
    } finally {
      fs.rmSync(restored, { force: true })
    }
    const remote = process.env.BACKUP_R2_REMOTE
    let offsiteVerified = false
    if (remote) {
      if (!/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_/.\-]+$/.test(remote) || remote.includes('..'))
        throw new Error('Invalid BACKUP_R2_REMOTE; use r2:bucket/prefix')
      await reserveBackupUpload(remote, fs.statSync(encrypted).size)
      const target = `${remote.replace(/\/$/, '')}/${path.basename(encrypted)}`
      const downloaded = `${plain}.downloaded`
      try {
        await runFile('rclone', ['copyto', encrypted, target, '--immutable'], { timeout: 120000 })
        await runFile('rclone', ['copyto', target, downloaded], { timeout: 120000 })
        if ((await hashFile(downloaded)) !== digest) throw new Error('Offsite checksum mismatch')
        await restoreBackup(downloaded, restored)
        offsiteVerified = true
      } finally {
        fs.rmSync(downloaded, { force: true })
        fs.rmSync(restored, { force: true })
      }
    }
    const manifest = {
      at: new Date().toISOString(),
      sha256: digest,
      bytes: fs.statSync(encrypted).size,
      sqliteIntegrity: 'ok',
      offsiteVerified,
      scope: 'runtime-sqlite-only',
    }
    save(`${encrypted}.json`, manifest)
    if (remote)
      await runFile(
        'rclone',
        [
          'copyto',
          `${encrypted}.json`,
          `${remote.replace(/\/$/, '')}/${path.basename(encrypted)}.json`,
          '--immutable',
        ],
        { timeout: 120000 },
      )
    save(path.join(outputDir, 'backup-latest.json'), manifest)
    for (const file of fs
      .readdirSync(directory)
      .filter((name) => /^runtime-.*\.aesgcm(?:\.json)?$/.test(name))) {
      const target = path.join(directory, file)
      if (
        Date.now() - fs.statSync(target).mtimeMs >
        backupLimit('BACKUP_LOCAL_RETENTION_DAYS', 7) * 86_400_000
      )
        fs.unlinkSync(target)
    }
    console.log(
      JSON.stringify({
        ok: true,
        file: encrypted,
        offsiteVerified,
        keyFile,
        note: 'Keep the encryption key in a separate secret store for disaster recovery.',
      }),
    )
  } finally {
    if (fs.existsSync(plain)) fs.unlinkSync(plain)
    fs.rmSync(`${encrypted}.tmp`, { force: true })
  }
}

function backupLimit(name: string, ceiling: number) {
  const value = Number(process.env[name] ?? ceiling)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid ${name}`)
  return Math.min(value, ceiling)
}

/** Conservative workload caps; R2 billing alerts alone do not stop usage. */
async function reserveBackupUpload(remote: string, bytes: number) {
  if (bytes > backupLimit('BACKUP_R2_MAX_FILE_BYTES', 32 * 1024 * 1024))
    throw new Error('Backup file exceeds the R2 free-tier upload ceiling')
  const bucket = remote.split('/')[0]
  const { stdout } = await runFile('rclone', ['lsjson', bucket, '--recursive', '--files-only'], {
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  })
  const inventory = JSON.parse(String(stdout)) as Array<{ Size: number }>
  if (
    !Array.isArray(inventory) ||
    inventory.some((item) => !Number.isSafeInteger(item.Size) || item.Size < 0)
  )
    throw new Error('Invalid R2 inventory; refusing upload')
  const occupied = inventory.reduce((total, item) => total + item.Size, 0)
  if (
    occupied + bytes + 16384 > backupLimit('BACKUP_R2_MAX_BUCKET_BYTES', 6 * 1024 ** 3) ||
    inventory.length + 2 > backupLimit('BACKUP_R2_MAX_OBJECTS', 400)
  )
    throw new Error('R2 backup capacity ceiling reached; refusing upload')
  const month = new Date().toISOString().slice(0, 7)
  const file = path.join(outputDir, 'r2-backup-budget.json')
  const previous = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { month, attempts: 0 }
  if (
    typeof previous.month !== 'string' ||
    previous.month > month ||
    !Number.isSafeInteger(previous.attempts) ||
    previous.attempts < 0
  )
    throw new Error('Invalid R2 backup budget; refusing upload')
  const attempts = previous.month === month ? previous.attempts : 0
  if (attempts >= backupLimit('BACKUP_R2_MAX_MONTHLY_RUNS', 800))
    throw new Error('R2 monthly backup attempt ceiling reached; refusing upload')
  // Reserve before upload; failures still consume an attempt. The timer uses flock.
  save(file, {
    month,
    attempts: attempts + 1,
    occupiedBytes: occupied,
    reservedBytes: bytes + 16384,
  })
}

try {
  const command = args[0] || 'report'
  if (command === 'report') console.log(JSON.stringify(financeReport(), null, 2))
  else if (command === 'review') await review()
  else if (command === 'daily') {
    if (isStripeLive()) await reconcileStripe()
    await review()
  } else if (command === 'reconcile-stripe') await reconcileStripe()
  else if (command === 'record-cost') {
    const amount = Number(arg('--usd'))
    const reference = arg('--reference')
    const provider = arg('--provider')
    const month = arg('--month')
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !reference ||
      !provider ||
      !month ||
      !/^\d{4}-\d{2}$/.test(month)
    )
      throw new Error('Use --usd amount --reference invoice-id --provider name --month YYYY-MM')
    const applied = recordFinanceEvent({
      id: `expense:${provider}:${reference}`,
      kind: 'operating_expense',
      reference,
      cashMicros: -Math.round(amount * 1_000_000),
      detail: { provider, serviceMonth: month, actual: true },
    })
    console.log(JSON.stringify({ ok: true, applied }))
  } else if (command === 'backup') await backup()
  else if (command === 'restore') {
    const file = arg('--file')
    const output = arg('--output')
    if (!file || !output) throw new Error('Use restore --file encrypted-backup --output new.sqlite')
    await restoreBackup(file, output)
    console.log(JSON.stringify({ ok: true, restored: output }))
  } else if (command === 'forecast')
    console.log(JSON.stringify(financeReport(loadFinanceConfig()).economics, null, 2))
  else throw new Error(`Unknown finance command: ${command}`)
} catch (error) {
  console.error(
    JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  )
  process.exitCode = 1
} finally {
  closeRuntimeDb()
}
