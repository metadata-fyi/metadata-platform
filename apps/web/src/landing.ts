/** Product-world landing: live type over the approved Metty portal artwork. */
import './style.css'
import './landing.css'
import './catalog-transition.css'
import { initLandingMotion } from './landing-motion'
import { PATHS } from './routes'
import { applyPrefsToDocument, bindOsReducedMotionListener } from './user-settings'

applyPrefsToDocument()
bindOsReducedMotionListener()
document.documentElement.classList.add('is-landing')
document.body.classList.add('is-landing')

const arrow = '<span aria-hidden="true">↗</span>'
const app = document.querySelector('#app')!
app.innerHTML = `
  <div class="world">
    <img class="world-art" src="/brand/landing/product-world-empty-v1.webp" alt="" width="1536" height="1024" fetchpriority="high" decoding="async" />
    <div class="world-character-plane" aria-hidden="true"><img class="world-character" src="/brand/landing/metty-leap-v2.png" alt="" width="1536" height="1024" /></div>
    <header class="world-header">
      <a class="world-brand" href="/" aria-label="Metadata home">metadata</a>
      <nav class="world-nav" aria-label="Primary">
        <a href="${PATHS.app}">Browse data ${arrow}</a>
        <a href="${PATHS.console}">API docs ${arrow}</a>
      </nav>
    </header>
    <main class="world-main">
      <h1 class="world-title"><span>all the worlds</span><span>product data.</span></h1>
      <div class="world-copy">
        <p class="world-connected">connected.</p>
        <p class="world-description">Structured metadata for products of every kind.<br class="world-desktop-break" />
          Names, images, specs, and relationships—connected in one API.</p>
        <a class="world-explore" href="${PATHS.app}">Explore the database ${arrow}</a>
      </div>
    </main>
    <footer class="world-footer" aria-label="Product categories">
      <p>Books <span aria-hidden="true">/</span> Games <span aria-hidden="true">/</span> Electronics <span aria-hidden="true">/</span> Apparel <span aria-hidden="true">/</span> Collectibles <span aria-hidden="true">/</span> More</p>
    </footer>
  </div>
`

initLandingMotion()
