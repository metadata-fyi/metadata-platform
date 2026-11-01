import { getReducedMotionPref } from './user-settings'

/** A single composited character layer, independently aligned to the cover plate. */
export function initLandingMotion() {
  const world = document.querySelector<HTMLElement>('.world')!
  const art = document.querySelector<HTMLImageElement>('.world-art')!
  const character = document.querySelector<HTMLImageElement>('.world-character')!
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)')
  let layered = false
  let entering = false
  let frame = 0
  let x = 0, y = 0, targetX = 0, targetY = 0
  let animations: Animation[] = []
  function alignCharacter() {
    const width = world.clientWidth, height = world.clientHeight
    const scale = Math.max(width / 1536, height / 1024)
    const position = matchMedia('(max-width: 760px)').matches ? .64 : .5
    const left = (width - 1536 * scale) * position
    const top = (height - 1024 * scale) * .5
    character.style.transformOrigin = `${left + 965 * scale}px ${top + 420 * scale}px`
    character.style.scale = '.60'
    character.style.translate = `${-10 * scale}px ${-35 * scale}px`
  }
  alignCharacter()
  new ResizeObserver(alignCharacter).observe(world)

  // Do not remove the original character until both replacement layers decode.
  const background = new Image()
  background.src = '/brand/landing/product-world-empty-v1.webp'
  void Promise.all([background.decode(), character.decode()]).then(() => {
    art.src = background.src
    world.classList.add('is-layered')
    layered = true
  }).catch(() => { /* Keep the empty environment if a layer cannot load. */ })

  function tick() {
    x += (targetX - x) * .085
    y += (targetY - y) * .085
    character.style.transform = `translate3d(${x}px, ${y}px, 0)`
    if (Math.abs(targetX - x) + Math.abs(targetY - y) > .05) frame = requestAnimationFrame(tick)
    else frame = 0
  }
  function settle() {
    targetX = targetY = 0
    if (!frame && !entering) frame = requestAnimationFrame(tick)
  }
  world.addEventListener('pointermove', event => {
    if (!layered || entering || !finePointer.matches || getReducedMotionPref()) return
    const rect = world.getBoundingClientRect()
    targetX = ((event.clientX - rect.left) / rect.width - .5) * 28
    targetY = ((event.clientY - rect.top) / rect.height - .5) * 20
    if (!frame) frame = requestAnimationFrame(tick)
  }, { passive: true })
  world.addEventListener('pointerleave', settle)
  window.addEventListener('metadata:prefs', () => {
    if (getReducedMotionPref()) {
      cancelAnimationFrame(frame)
      frame = x = y = targetX = targetY = 0
      character.style.transform = ''
      if (entering) for (const animation of animations) animation.finish()
    }
  })

  function reset() {
    entering = false
    cancelAnimationFrame(frame)
    frame = x = y = targetX = targetY = 0
    for (const animation of animations) animation.cancel()
    animations = []
    character.style.transform = ''
    world.classList.remove('is-entering')
    world.removeAttribute('aria-busy')
  }
  window.addEventListener('pageshow', reset)
  window.addEventListener('pagehide', () => cancelAnimationFrame(frame))

  world.addEventListener('click', event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a')
    if (!link || link.pathname !== '/app' || event.defaultPrevented || event.button !== 0 ||
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target || link.hasAttribute('download')) return
    if (getReducedMotionPref() || !layered) return
    event.preventDefault()
    if (entering) return
    entering = true
    cancelAnimationFrame(frame)
    world.classList.add('is-entering')
    world.setAttribute('aria-busy', 'true')
    // Convert original artwork coordinates through the same cover crop as the image.
    const width = world.clientWidth, height = world.clientHeight
    const scale = Math.max(width / 1536, height / 1024)
    const position = matchMedia('(max-width: 760px)').matches ? .64 : .5
    const left = (width - 1536 * scale) * position
    const top = (height - 1024 * scale) * .5
    character.style.transformOrigin = `${left + 965 * scale}px ${top + 420 * scale}px`
    const dx = -30 * scale, dy = 480 * scale
    const dive = character.animate([
      { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1, offset: 0 },
      { transform: `translate(${dx * .35}px, ${dy * .4}px) scale(.65)`, opacity: 1, offset: .6 },
      { transform: `translate(${dx}px, ${dy}px) scale(.04)`, opacity: 0, offset: 1 },
    ], { duration: 520, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' })
    animations = [dive]
    void Promise.all(animations.map(animation => animation.finished)).catch(() => {}).then(() => {
      location.assign(link.href)
    })
  })
}
