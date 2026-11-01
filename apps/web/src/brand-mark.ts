/**
 * Animated Metadata mark. Static /logo.svg <img> renders first (and stays for
 * prefers-reduced-motion / failures); lottie-web light is lazy-loaded, plays the
 * 'intro' marker once, then loops the 'loop' marker.
 */
const ANIM_URL = '/brand/lottie/metadata-intro-loop.json'
let dataPromise: Promise<unknown> | null = null

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

async function mount(host: HTMLElement): Promise<void> {
  if (host.dataset.brandMarkReady) return
  host.dataset.brandMarkReady = '1'
  try {
    const [{ default: lottie }, data] = await Promise.all([
      import('lottie-web/build/player/lottie_light'),
      (dataPromise ??= fetch(ANIM_URL).then((r) => {
        if (!r.ok) throw new Error(`lottie ${r.status}`)
        return r.json()
      })),
    ])
    const box = document.createElement('span')
    box.className = 'brand-mark-anim'
    box.setAttribute('aria-hidden', 'true')
    host.appendChild(box)
    const anim = lottie.loadAnimation({
      container: box,
      renderer: 'svg',
      loop: false,
      autoplay: false,
      animationData: JSON.parse(JSON.stringify(data)),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
    })
    anim.addEventListener('DOMLoaded', () => {
      host.classList.add('is-animated')
      anim.playSegments([0, 60], true)
    })
    anim.addEventListener('complete', () => {
      anim.loop = true
      anim.playSegments([60, 240], true)
    })
    anim.addEventListener('data_failed', () => {
      host.classList.remove('is-animated')
      box.remove()
    })
  } catch {
    /* keep static SVG fallback */
  }
}

export function initBrandMarks(root: ParentNode = document): void {
  if (reducedMotion()) return
  const hosts = root.querySelectorAll<HTMLElement>('[data-brand-mark]')
  if (!hosts.length) return
  const run = () => hosts.forEach((h) => void mount(h))
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback
  if (ric) ric(run, { timeout: 1200 })
  else setTimeout(run, 200)
}
