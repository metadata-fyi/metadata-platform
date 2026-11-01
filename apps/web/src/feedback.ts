import './style.css'
import { escapeHtml, resolveApiBase } from './api'
import { icon } from './icons'
import { bindShellWallet, bootShellChrome, shellHtml } from './shell'

const apiBase = resolveApiBase()
const params = new URLSearchParams(location.search)
const prefill = {
  vertical: params.get('vertical') || 'anime',
  entityKind: params.get('entityKind') || 'series',
  entityId: params.get('entityId') || '',
  message: params.get('message') || '',
  kind: params.get('kind') || 'correction',
}
const justQueued = params.get('ok') === '1'
const queuedId = params.get('id') || ''

const VERTICALS = [
  'anime',
  'game',
  'manga',
  'lightnovels',
  'pod',
  'tcg',
  'figures',
  'modelkits',
  'plush',
  'fashion',
  'boardgames',
  'cartoons',
  'ost',
  'consoles',
  'esports',
  'comics',
]

const KINDS = [
  ['correction', 'Correction'],
  ['missing', 'Missing data'],
  ['spam', 'Spam / junk'],
  ['dmca', 'DMCA / copyright'],
  ['other', 'Other'],
] as const

const ENTITY_KINDS = [
  'series',
  'character',
  'product',
  'card',
  'item',
  'game',
  'album',
  'console',
  'player',
  'other',
]

const centerHtml = `
  <section class="section section-stable feedback-panel">
    <div class="section-head">
      <h2>Flag bad data</h2>
      <p class="section-note">
        We review by hand. Agents: <code>POST /feedback</code>.
      </p>
    </div>

    ${
      justQueued
        ? `<div class="feedback-banner is-ok" role="status">
            ${icon('check-circle-line', { size: 16, class: 'ico' })}
            Submitted${queuedId ? ` · <code>${escapeHtml(queuedId)}</code>` : ''}.
            Nothing changed in the catalog yet.
          </div>`
        : ''
    }

    <form class="feedback-form" id="feedback-form" method="post" action="${escapeHtml(apiBase)}/feedback" novalidate>
          <input type="hidden" name="via" value="feedback-form" />

          <label class="fb-field">
            <span>Kind</span>
            <select name="kind" class="md-select" required>
              ${KINDS.map(
                ([id, label]) =>
                  `<option value="${id}"${prefill.kind === id ? ' selected' : ''}>${label}</option>`,
              ).join('')}
            </select>
          </label>

          <div class="fb-row">
            <label class="fb-field">
              <span>Vertical</span>
              <select name="vertical" class="md-select" required>
                ${VERTICALS.map(
                  (v) =>
                    `<option value="${v}"${prefill.vertical === v ? ' selected' : ''}>${v}</option>`,
                ).join('')}
              </select>
            </label>
            <label class="fb-field">
              <span>Entity kind</span>
              <select name="entityKind" class="md-select" required>
                ${ENTITY_KINDS.map(
                  (k) =>
                    `<option value="${k}"${prefill.entityKind === k ? ' selected' : ''}>${k}</option>`,
                ).join('')}
              </select>
            </label>
          </div>

          <label class="fb-field">
            <span>Entity id</span>
            <input name="entityId" type="text" required spellcheck="false"
              placeholder="e.g. one-piece, bella-canvas-3001, fumo-reimu"
              value="${escapeHtml(prefill.entityId)}" />
          </label>

          <label class="fb-field">
            <span>Field <em>(optional)</em></span>
            <input name="field" type="text" spellcheck="false" placeholder="e.g. title, rarity, yearPublished" />
          </label>

          <label class="fb-field">
            <span>What is wrong?</span>
            <textarea name="message" required rows="5" placeholder="Describe the error and the correct value if you know it.">${escapeHtml(prefill.message)}</textarea>
          </label>

          <label class="fb-field">
            <span>Sources <em>(optional, comma-separated URLs)</em></span>
            <input name="sources" type="text" spellcheck="false" placeholder="https://…" />
          </label>

          <label class="fb-field">
            <span>Your name / handle <em>(optional)</em></span>
            <input name="contributor" type="text" autocomplete="nickname" placeholder="optional" />
          </label>

          <div class="fb-actions">
            <button type="submit" class="btn btn-primary" id="fb-submit">
              ${icon('mail-line', { size: 15, class: 'ico' })} Submit flag
            </button>
            <span class="status" id="fb-status"></span>
          </div>
        </form>

    <details class="feedback-agent feedback-agent-details">
      <summary>For agents</summary>
      <p class="prose-muted feedback-agent-note">Same endpoint. Manual review only.</p>
      <pre class="snip-code feedback-agent-snippet" id="agent-snippet"></pre>
      <button type="button" class="btn btn-ghost mkt-btn-sm feedback-agent-copy" id="copy-agent">
        ${icon('copy-2-line', { size: 14, class: 'ico' })} Copy curl
      </button>
    </details>
  </section>
`

const app = document.querySelector('#app')!
app.innerHTML = shellHtml({
  page: 'feedback',
  centerHtml,
  wallet: true,
})

const form = document.querySelector('#feedback-form') as HTMLFormElement
const statusEl = document.querySelector('#fb-status') as HTMLElement
const submitBtn = document.querySelector('#fb-submit') as HTMLButtonElement

const agentCurl = `curl -s -X POST '${apiBase}/feedback' \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json' \\
  -d '{
  "kind": "correction",
  "vertical": "anime",
  "entityKind": "series",
  "entityId": "one-piece",
  "message": "Example: wrong title on series record",
  "sources": ["https://example.com"],
  "agent": { "name": "my-agent" }
}'`

const snip = document.querySelector('#agent-snippet') as HTMLElement
snip.textContent = agentCurl

document.querySelector('#copy-agent')!.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(agentCurl)
    statusEl.textContent = 'Copied agent curl'
    statusEl.classList.remove('is-err')
  } catch {
    statusEl.textContent = 'Copy failed'
    statusEl.classList.add('is-err')
  }
})

// Prefer fetch so we can show inline success without full redirect when using API proxy.
form.addEventListener('submit', (e) => {
  e.preventDefault()
  void (async () => {
    statusEl.textContent = 'Sending…'
    statusEl.classList.remove('is-err')
    submitBtn.disabled = true
    try {
      const fd = new FormData(form)
      const body: Record<string, unknown> = {}
      for (const [k, v] of fd.entries()) {
        if (typeof v === 'string') body[k] = v
      }
      if (typeof body.sources === 'string' && body.sources.trim()) {
        body.sources = String(body.sources)
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      } else {
        delete body.sources
      }
      const res = await fetch(`${apiBase.replace(/\/$/, '')}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      })
      const j = (await res.json()) as {
        id?: string
        message?: string
        error?: string
      }
      if (!res.ok) {
        throw new Error(j.message || j.error || `HTTP ${res.status}`)
      }
      const id = j.id || ''
      location.href = `/feedback?ok=1${id ? `&id=${encodeURIComponent(id)}` : ''}`
    } catch (err) {
      statusEl.textContent = err instanceof Error ? err.message : String(err)
      statusEl.classList.add('is-err')
      submitBtn.disabled = false
    }
  })()
})

bootShellChrome({
  vertical: prefill.vertical,
  defaultLang: 'curl',
})
bindShellWallet()
