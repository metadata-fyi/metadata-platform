import fs from 'node:fs'
import path from 'node:path'

export type FinanceControls = {
  version: 1
  at: string
  creditsPerUnit?: number
  disableX402: boolean
  reason: string[]
}

export function financeControlsPath() {
  return path.join(
    process.env.DATA_DIR ?? path.join(process.cwd(), 'data'),
    'finance-controls.json',
  )
}

/** Only bounded, explicit local controls can affect live pricing. */
export function readFinanceControls(): FinanceControls | null {
  if (process.env.FINANCE_AUTOPILOT_ENABLED !== '1') return null
  const file = financeControlsPath()
  if (!fs.existsSync(file))
    return {
      version: 1,
      at: '',
      disableX402: true,
      reason: ['Finance review has not initialized.'],
    }
  const control = JSON.parse(fs.readFileSync(file, 'utf8')) as FinanceControls
  if (
    control.version !== 1 ||
    typeof control.disableX402 !== 'boolean' ||
    !Array.isArray(control.reason) ||
    (control.creditsPerUnit !== undefined &&
      (!Number.isSafeInteger(control.creditsPerUnit) ||
        control.creditsPerUnit < 1 ||
        control.creditsPerUnit > 10))
  )
    throw new Error('Invalid finance controls')
  // Stale control evidence blocks the costly external payment rail.
  if (
    !Number.isFinite(Date.parse(control.at)) ||
    Date.now() - Date.parse(control.at) > 48 * 60 * 60 * 1000
  )
    return { ...control, disableX402: true }
  return control
}
