import { mingcuteIcons, mingcuteSize } from './mingcute-subset'

/** Prefer filled glyph when active; falls back to line if fill is missing. */
export function iconNameForState(name: string, active: boolean): string {
  if (!active || !name.endsWith('-line')) return name
  const fill = name.replace(/-line$/, '-fill')
  return mingcuteIcons[fill] ? fill : name
}

/** Inline MingCute SVG from a tree-shaken subset. */
export function icon(
  name: string,
  opts?: { size?: number; class?: string; active?: boolean },
): string {
  const resolved = opts?.active != null ? iconNameForState(name, opts.active) : name
  const data = mingcuteIcons[resolved]
  if (!data) {
    console.warn(`[icons] missing mingcute:${resolved}`)
    return ''
  }
  const size = opts?.size ?? 18
  const cls = opts?.class ?? 'ico'
  const vbW = data.width ?? mingcuteSize.width
  const vbH = data.height ?? mingcuteSize.height
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vbW} ${vbH}" fill="currentColor" class="${cls}" aria-hidden="true" focusable="false">${data.body}</svg>`
}
