/** UTC-day scrape budget + single-flight lock. Lives in DATA_DIR, not git. */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dailyMaxFor } from './market-schedule.js'
import type { MarketSourceId } from './market-types.js'

export type BudgetFile = {
  day: string
  used: Partial<Record<MarketSourceId, number>>
  cursor: { family: number; discover: number; json: number }
  lastTickAt: string | null
  lastTick: Record<string, unknown> | null
}

export type LockFile = {
  pid: number
  startedAt: string
  host: string
}

const LOCK_STALE_MS = 2 * 60 * 60 * 1000

function dataDir() {
  return process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
}

function budgetPath() {
  return path.join(dataDir(), 'market-budget.json')
}

function lockPath() {
  return path.join(dataDir(), 'market.lock')
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function emptyBudget(day: string): BudgetFile {
  return {
    day,
    used: {},
    cursor: { family: 0, discover: 0, json: 0 },
    lastTickAt: null,
    lastTick: null,
  }
}

let cache: BudgetFile | null = null

export function resetMarketBudget() {
  cache = null
}

export function loadBudget(now = new Date()): BudgetFile {
  const day = utcDay(now)
  if (cache && cache.day === day) return cache
  try {
    const raw = JSON.parse(fs.readFileSync(budgetPath(), 'utf8')) as BudgetFile
    cache = raw.day === day ? raw : emptyBudget(day)
  } catch {
    cache = emptyBudget(day)
  }
  return cache
}

function persistBudget(budget: BudgetFile) {
  fs.mkdirSync(dataDir(), { recursive: true })
  const tmp = `${budgetPath()}.${process.pid}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(budget)}\n`)
  fs.renameSync(tmp, budgetPath())
  cache = budget
}

export function usedToday(source: MarketSourceId, now = new Date()): number {
  return loadBudget(now).used[source] ?? 0
}

export function remainingToday(source: MarketSourceId, now = new Date()): number {
  return Math.max(0, dailyMaxFor(source) - usedToday(source, now))
}

export function recordUse(source: MarketSourceId, count: number, now = new Date()) {
  const budget = loadBudget(now)
  budget.used[source] = (budget.used[source] ?? 0) + Math.max(0, count)
  persistBudget(budget)
}

export function advanceCursor(key: keyof BudgetFile['cursor'], by = 1, now = new Date()) {
  const budget = loadBudget(now)
  budget.cursor[key] = (budget.cursor[key] ?? 0) + by
  persistBudget(budget)
  return budget.cursor[key]
}

export function setCursor(key: keyof BudgetFile['cursor'], value: number, now = new Date()) {
  const budget = loadBudget(now)
  budget.cursor[key] = Math.max(0, value)
  persistBudget(budget)
  return budget.cursor[key]
}

export function writeTickResult(result: Record<string, unknown>, now = new Date()) {
  const budget = loadBudget(now)
  budget.lastTickAt = now.toISOString()
  budget.lastTick = result
  persistBudget(budget)
}

export function readLock(): LockFile | null {
  try {
    return JSON.parse(fs.readFileSync(lockPath(), 'utf8')) as LockFile
  } catch {
    return null
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function acquireMarketLock(now = new Date()): LockFile {
  const existing = readLock()
  if (existing) {
    const age = now.getTime() - Date.parse(existing.startedAt)
    const alive = pidAlive(existing.pid)
    if (alive && Number.isFinite(age) && age < LOCK_STALE_MS) {
      throw new Error(
        `market tick is already running; refuse a second flight (pid ${existing.pid})`,
      )
    }
  }
  const lock: LockFile = { pid: process.pid, startedAt: now.toISOString(), host: os.hostname() }
  fs.mkdirSync(dataDir(), { recursive: true })
  fs.writeFileSync(lockPath(), `${JSON.stringify(lock)}\n`)
  return lock
}

export function releaseMarketLock() {
  const existing = readLock()
  if (existing && existing.pid !== process.pid) return
  try {
    fs.unlinkSync(lockPath())
  } catch {
    /* missing is fine */
  }
}
