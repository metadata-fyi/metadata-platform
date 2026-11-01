/**
 * Right-rail ambient: fixed elliptical portal with a solid black spinning
 * interior, spinning rim glow, and bits flowing top-left → bottom-right
 * into / through the aperture.
 */

const TAU = Math.PI * 2
/** Keep particle count low for stable frame times */
const PARTICLE_N = 48
/** x, y, life, ttl, size, speed */
const P = 6

type Amb = {
  rail: HTMLElement
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  w: number
  h: number
  /** Fixed oval tilt — portal stays put */
  baseRot: number
  /**
   * Continuous elapsed seconds (never modular-wrapped).
   * All interior motion is driven from this so loops stay seamless.
   */
  t: number
  props: Float32Array
  raf: number
  running: boolean
  lastTs: number
  ro?: ResizeObserver
  io?: IntersectionObserver
}

let amb: Amb | null = null
/** User/OS reduced-motion: freeze at a static frame */
let motionEnabled = true

function measureRail(rail: HTMLElement) {
  const r = rail.getBoundingClientRect()
  return {
    w: Math.max(1, Math.floor(r.width)),
    h: Math.max(1, Math.floor(r.height)),
  }
}

function layout(a: Amb) {
  const { w, h } = measureRail(a.rail)
  a.w = w
  a.h = h
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
  a.canvas.width = Math.max(1, Math.floor(w * dpr))
  a.canvas.height = Math.max(1, Math.floor(h * dpr))
  a.canvas.style.width = '100%'
  a.canvas.style.height = '100%'
  a.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function portalMetrics(a: Amb) {
  const cx = a.w * 0.5
  const cy = a.h * 0.48
  const m = Math.min(a.w, a.h)
  return { cx, cy, rx: m * 0.4, ry: m * 0.23, m }
}

/** Spawn along the diagonal stream: top-left → bottom-right */
function initParticle(a: Amb, i: number) {
  const { cx, cy, rx, ry } = portalMetrics(a)
  const ang = Math.PI * 0.28
  const dirX = Math.cos(ang)
  const dirY = Math.sin(ang)
  const px = -dirY
  const py = dirX
  const spread = Math.max(rx, ry) * 0.55
  const lateral = (Math.random() - 0.5) * 2 * spread
  // Start past the top-left of the portal
  const along = -rx * 1.35 - Math.random() * rx * 0.4
  const x = cx + dirX * along + px * lateral
  const y = cy + dirY * along + py * lateral
  const ttl = 55 + Math.random() * 70
  const size = 1.1 + Math.random() * 1.8
  const speed = 1.35 + Math.random() * 1.9
  a.props.set([x, y, 0, ttl, size, speed], i)
}

function initParticles(a: Amb) {
  a.props = new Float32Array(PARTICLE_N * P)
  for (let i = 0; i < a.props.length; i += P) initParticle(a, i)
}

/**
 * Black aperture with a whiter, more chaotic spinning core.
 * Drawn in the portal's tilted ellipse space so the inner mass
 * matches the ring shape (not a round sphere).
 *
 * Motion is driven by continuous time `t` (seconds) — never a modular
 * phase that would hitch when frequencies aren't integer harmonics.
 */
function drawInterior(a: Amb, t: number) {
  const { ctx, baseRot } = a
  const { cx, cy, rx, ry } = portalMetrics(a)
  // Slow seamless pulse (period ~5.5s)
  const pulse = 0.85 + 0.15 * Math.sin(t * (TAU / 5.5))

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(baseRot)

  // Clip to the portal oval, then scale so unit circle == aperture ellipse
  ctx.beginPath()
  ctx.ellipse(0, 0, rx * 0.97, ry * 0.97, 0, 0, TAU)
  ctx.clip()
  ctx.scale(rx, ry)

  // Base solid black fill (unit disc → portal oval)
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.arc(0, 0, 0.97, 0, TAU)
  ctx.fill()

  // Whiter chaotic core — same aspect/tilt as the portal
  const coreR = 0.92
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR)
  core.addColorStop(0, `rgba(255, 255, 255, ${0.92 * pulse})`)
  core.addColorStop(0.28, `rgba(255, 255, 255, ${0.55 * pulse})`)
  core.addColorStop(0.55, 'rgba(240, 245, 255, 0.18)')
  core.addColorStop(0.8, 'rgba(20, 22, 28, 0.5)')
  core.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = core
  ctx.beginPath()
  ctx.arc(0, 0, coreR, 0, TAU)
  ctx.fill()

  // Chaotic spinning blobs — rad/s speeds so motion is continuous in t
  const blobs = [
    { w: 0.55, off: 0.0, dist: 0.18, r: 0.48, a: 0.38, wob: 1.1 },
    { w: -0.82, off: 1.1, dist: 0.28, r: 0.36, a: 0.32, wob: 1.4 },
    { w: 1.05, off: 2.3, dist: 0.14, r: 0.42, a: 0.28, wob: 0.9 },
    { w: -0.4, off: 3.4, dist: 0.34, r: 0.3, a: 0.22, wob: 1.7 },
    { w: 1.25, off: 0.7, dist: 0.22, r: 0.26, a: 0.26, wob: 2.0 },
    { w: -1.15, off: 4.0, dist: 0.12, r: 0.34, a: 0.2, wob: 1.3 },
  ]
  for (const b of blobs) {
    // Pure continuous trig — no period wrap on t
    const wobble =
      1 +
      0.18 * Math.sin(t * b.wob + b.off) +
      0.1 * Math.sin(t * (b.wob * 1.37) + b.off * 2)
    const ang = t * b.w + b.off
    const dist = b.dist * (1 + 0.2 * Math.sin(t * 0.85 + b.off))
    const bx = Math.cos(ang) * dist
    const by = Math.sin(ang) * dist
    const br = b.r * wobble
    const blob = ctx.createRadialGradient(bx, by, 0, bx, by, br)
    blob.addColorStop(0, `rgba(255, 255, 255, ${b.a})`)
    blob.addColorStop(0.4, `rgba(255, 255, 255, ${b.a * 0.45})`)
    blob.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = blob
    ctx.beginPath()
    ctx.arc(0, 0, 0.97, 0, TAU)
    ctx.fill()
  }

  // Hot white flicker — product of two continuous sines (seamless)
  const flick =
    0.45 +
    0.55 *
      Math.abs(Math.sin(t * 1.15)) *
      Math.abs(Math.sin(t * 0.73 + 0.8))
  const hot = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.42)
  hot.addColorStop(0, `rgba(255, 255, 255, ${0.75 * flick})`)
  hot.addColorStop(0.5, `rgba(255, 255, 255, ${0.2 * flick})`)
  hot.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = hot
  ctx.beginPath()
  ctx.arc(0, 0, 0.48, 0, TAU)
  ctx.fill()

  // Soft edge lift into the white ring
  const edge = ctx.createRadialGradient(0, 0, 0.55, 0, 0, 0.97)
  edge.addColorStop(0, 'rgba(0, 0, 0, 0)')
  edge.addColorStop(0.75, 'rgba(0, 0, 0, 0)')
  edge.addColorStop(1, 'rgba(255, 255, 255, 0.12)')
  ctx.fillStyle = edge
  ctx.beginPath()
  ctx.arc(0, 0, 0.97, 0, TAU)
  ctx.fill()

  ctx.restore()
}

/**
 * Fixed ring: crisp stationary rim + dual spinning glow arcs (opposite dirs).
 * Arc angles come from continuous time; pure rotation is seamless under 2π.
 */
function drawPortalRing(a: Amb, t: number) {
  const { ctx, baseRot } = a
  const { cx, cy, rx, ry } = portalMetrics(a)
  const minor = Math.min(rx, ry)
  const baseW = Math.max(1.6, minor * 0.038)
  // Nearly full arcs — same radius as the rim
  const sweep = TAU * 0.99
  // ~12s / rev primary; opposite secondary
  const phase = t * (TAU / 12)
  const phaseB = -phase

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(baseRot)
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#ffffff'
  ctx.globalCompositeOperation = 'source-over'
  ctx.shadowColor = 'rgba(255,255,255,0.95)'

  // —— Primary arc ——
  ctx.shadowBlur = Math.max(18, minor * 0.55)
  ctx.globalAlpha = 0.14
  ctx.lineWidth = baseW * 2.0
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, phase, phase + sweep)
  ctx.stroke()

  ctx.shadowBlur = Math.max(14, minor * 0.42)
  ctx.globalAlpha = 0.4
  ctx.lineWidth = baseW * 1.5
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, phase, phase + sweep)
  ctx.stroke()

  // —— Secondary arc (opposite direction) ——
  ctx.shadowBlur = Math.max(18, minor * 0.55)
  ctx.globalAlpha = 0.12
  ctx.lineWidth = baseW * 2.0
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, phaseB, phaseB + sweep)
  ctx.stroke()

  ctx.shadowBlur = Math.max(14, minor * 0.42)
  ctx.globalAlpha = 0.34
  ctx.lineWidth = baseW * 1.5
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, phaseB, phaseB + sweep)
  ctx.stroke()

  // Crisp stationary ring
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
  ctx.lineWidth = baseW
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
  ctx.stroke()

  // Hairline inner edge
  ctx.globalAlpha = 0.35
  ctx.lineWidth = Math.max(0.8, baseW * 0.45)
  ctx.beginPath()
  ctx.ellipse(0, 0, rx * 0.985, ry * 0.985, 0, 0, TAU)
  ctx.stroke()

  ctx.restore()
}

/** Diagonal stream: top-left → bottom-right through the portal */
function updateParticles(a: Amb, dt: number) {
  const { ctx, props, w, h } = a
  const { cx, cy, rx } = portalMetrics(a)
  const ang = Math.PI * 0.28
  const dirX = Math.cos(ang)
  const dirY = Math.sin(ang)
  const endAlong = rx * 1.45

  ctx.fillStyle = '#ffffff'

  for (let i = 0; i < props.length; i += P) {
    let x = props[i]
    let y = props[i + 1]
    let life = props[i + 2]
    const ttl = props[i + 3]
    const size = props[i + 4]
    const speed = props[i + 5]

    const step = speed * (dt * 60) * 0.55
    x += dirX * step
    y += dirY * step
    life++

    const along = (x - cx) * dirX + (y - cy) * dirY
    const fade =
      life < ttl * 0.15
        ? life / (ttl * 0.15)
        : life > ttl * 0.75
          ? Math.max(0, 1 - (life - ttl * 0.75) / (ttl * 0.25))
          : 1

    if (fade > 0.02) {
      ctx.globalAlpha = 0.35 + 0.55 * fade
      ctx.fillRect(x, y, size, size * 0.55)
    }

    props[i] = x
    props[i + 1] = y
    props[i + 2] = life

    if (life > ttl || along > endAlong || x < -12 || y < -12 || x > w + 12 || y > h + 12) {
      initParticle(a, i)
    }
  }
  ctx.globalAlpha = 1
}

/** Soft bloom + vignette so the portal sits in the rail */
function drawAtmosphere(a: Amb) {
  const { ctx, w, h } = a
  const { cx, cy, rx, ry, m } = portalMetrics(a)

  ctx.save()
  const bloom = ctx.createRadialGradient(
    cx,
    cy,
    Math.min(rx, ry) * 0.4,
    cx,
    cy,
    m * 0.8,
  )
  bloom.addColorStop(0, 'rgba(255,255,255,0.04)')
  bloom.addColorStop(0.5, 'rgba(255,255,255,0.015)')
  bloom.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = bloom
  ctx.fillRect(0, 0, w, h)

  const vig = ctx.createRadialGradient(cx, cy, m * 0.4, cx, cy, m * 0.95)
  vig.addColorStop(0, 'rgba(8,8,10,0)')
  vig.addColorStop(0.8, 'rgba(8,8,10,0.4)')
  vig.addColorStop(1, 'rgba(8,8,10,0.88)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

function paintStatic(a: Amb) {
  const { ctx, w, h } = a
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.fillStyle = '#08080a'
  ctx.fillRect(0, 0, w, h)
  drawAtmosphere(a)
  // Frozen particles + ring at current t (no spin advance)
  updateParticles(a, 0)
  drawInterior(a, a.t)
  drawPortalRing(a, a.t)
}

function frame(a: Amb, ts: number) {
  if (!a.running || !motionEnabled) return
  const dt = a.lastTs ? Math.min(0.05, (ts - a.lastTs) / 1000) : 0.016
  a.lastTs = ts

  // Continuous time only — never reset; keeps interior + arcs seamless
  a.t += dt

  const { ctx, w, h } = a
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
  ctx.fillStyle = '#08080a'
  ctx.fillRect(0, 0, w, h)

  drawAtmosphere(a)
  // Bits under ring; solid black interior; glow spins on the rim
  updateParticles(a, dt)
  drawInterior(a, a.t)
  drawPortalRing(a, a.t)

  a.raf = requestAnimationFrame((t) => frame(a, t))
}

function setRunning(a: Amb, on: boolean) {
  if (on === a.running) return
  a.running = on
  if (on) {
    layout(a)
    initParticles(a)
    a.lastTs = 0
    a.raf = requestAnimationFrame((t) => frame(a, t))
  } else {
    cancelAnimationFrame(a.raf)
    a.raf = 0
  }
}

/** Mount into the ambient right-rail body (#preview-body). */
export function mountPortalAmbient(
  host: HTMLElement | null,
  opts?: { animate?: boolean },
) {
  if (!host) return
  stopPortalAmbient()
  motionEnabled = opts?.animate !== false

  const rail =
    (host.closest('.preview-ambient') as HTMLElement | null) ||
    (host.closest('.preview') as HTMLElement | null) ||
    host

  host.innerHTML = ''
  host.classList.add('portal-ambient-host')

  const canvas = document.createElement('canvas')
  canvas.className = 'portal-ambient-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  host.appendChild(canvas)

  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return

  amb = {
    rail,
    canvas,
    ctx,
    w: 0,
    h: 0,
    baseRot: -0.55,
    t: 0,
    props: new Float32Array(0),
    raf: 0,
    running: false,
    lastTs: 0,
  }

  layout(amb)
  initParticles(amb)

  const ro = new ResizeObserver(() => {
    if (!amb) return
    layout(amb)
    if (!motionEnabled) {
      paintStatic(amb)
      return
    }
    initParticles(amb)
  })
  ro.observe(rail)
  amb.ro = ro

  const io = new IntersectionObserver(
    (entries) => {
      if (!amb) return
      const vis = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0)
      if (!motionEnabled) {
        if (vis) {
          layout(amb)
          paintStatic(amb)
        }
        return
      }
      setRunning(amb, vis)
    },
    { threshold: 0.05 },
  )
  io.observe(rail)
  amb.io = io

  requestAnimationFrame(() => {
    if (!amb) return
    layout(amb)
    initParticles(amb)
    const r = rail.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    if (motionEnabled) setRunning(amb, true)
    else paintStatic(amb)
  })
}

/** Toggle animation without remounting (settings reduced-motion). */
export function setPortalMotionEnabled(on: boolean) {
  motionEnabled = on
  if (!amb) return
  if (on) {
    setRunning(amb, true)
  } else {
    setRunning(amb, false)
    layout(amb)
    paintStatic(amb)
  }
}

export function stopPortalAmbient() {
  if (!amb) return
  amb.running = false
  cancelAnimationFrame(amb.raf)
  amb.ro?.disconnect()
  amb.io?.disconnect()
  amb.canvas.remove()
  amb = null
}
