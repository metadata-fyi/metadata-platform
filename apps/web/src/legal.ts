import './style.css'
import { icon } from './icons'
import { SOURCE_URL } from './config'
import { shellHtml, bootShellChrome, bindShellWallet } from './shell'
import type { CmdItem } from './command-palette'

const pages: Record<string, { title: string; body: string }> = {
  terms: {
    title: 'Terms of Service',
    body: `
<p>By using Metadata you agree to these terms. You must be 18+ or using via an adult account holder.</p>
<p><strong>No warranty.</strong> Data is “as is.” We don’t promise it’s complete, accurate, or always up. Coverage varies by vertical; some images are placeholders and some catalogs are sparse — flag issues via Feedback.</p>
<p><strong>Wallets.</strong> Optional — used to buy credits. You’re responsible for your keys and payments.</p>
<p><strong>Credits are not money or tokens.</strong> Prepaid credits are non-transferable access units with no cash value. They are not currency, securities, or the unlaunched METADATA token on Base. No profit, governance, airdrop, or redemption is promised. See <a href="#token">Token notice</a>.</p>
<p><strong>Third-party rails.</strong> Crypto via Reown Pay (USDG on Robinhood Chain) and card via Stripe (when live) are processed by those providers under their terms/privacy. We don’t custody keys or reverse on-chain transfers. Network fees, wallet errors, and provider downtime are your risk.</p>
<p><strong>Your submissions.</strong> By sending feedback, corrections, or /v1/contribute rows you grant Metadata a perpetual, worldwide, royalty-free license to use, modify, and publish them in the catalog/API. You represent you have rights to submit them. Queueing is not acceptance or payment; contributor credits if granted are API credits only.</p>
<p><strong>Refunds.</strong> Crypto / Reown Pay purchases are final. Card refunds for unused credits may be offered after Stripe is live — see <a href="#refunds">Refund policy</a>.</p>
<p><strong>Don’t abuse the service.</strong> No illegal content, attacks, or bulk dumps that break upstream rules after notice. We may suspend or terminate abusive wallets/keys. Liability capped to fees you paid in the prior 3 months.</p>
<p><strong>Adult content.</strong> Some catalogs may include adult-coded fiction; entries must be 18+ where sexualized.</p>
<p><strong>Affiliate links.</strong> Some outbound shop or partner links may be affiliate or referral links. We may or may not earn a commission if you click or buy — see <a href="#affiliates">Affiliate disclosure</a>.</p>
<p><strong>Market data.</strong> Quotes/mids are informational only, not investment or pricing advice. Do your own research.</p>
`,
  },
  token: {
    title: 'Token notice (pre-launch)',
    body: `
<p><strong>METADATA on Base is not launched.</strong> Any future agent/meme token (planned ticker METADATA) does not exist yet. Nothing here offers, promises, or pre-sells it.</p>
<p><strong>No promises.</strong> No profit, yield, governance rights, airdrop, redemption, or future value is promised. Meme/agent tokens are high-risk and can go to zero. Any trading-fee share (e.g. pool swap fees to a creator wallet) depends entirely on third-party trading volume that may never occur.</p>
<p><strong>Not affiliated.</strong> Any $META token on Base is a separate, unaffiliated asset unless we explicitly name its contract address here. A future METADATA pool cannot quote in arbitrary tokens at launch — verify contract addresses before trading.</p>
<p><strong>Do your own research.</strong> Nothing on this site is investment, financial, or legal advice.</p>
`,
  },
  privacy: {
    title: 'Privacy Policy',
    body: `
<p>We keep as little as we can. No sale of personal data. Catalogs are public fiction metadata, not private real-person profiles.</p>
<ul>
<li>Production preview: fixed public samples. Development/staging preview quotas retain IP + vertical timestamps for a 24h rolling window.</li>
<li>Rate limits: IP counters, ~1min windows, stored until expiry</li>
<li>Wallet sessions: 10min nonce / 24h session, stored until expiry or logout</li>
<li>Ledger: wallet + payment references / transaction hashes are retained for accounting, payment-risk reconciliation and replay prevention. Account deletion forfeits remaining credits and removes wallet login sessions; it retains payment tombstones and append-only financial records.</li>
<li>Feedback/contribute reports: IP + handle + wallet persisted in server reports until purged on request</li>
<li>Server/Caddy logs: basic ops logs per host retention</li>
</ul>
<p>To request access or deletion, contact the operator via <a href="/feedback.html">Feedback</a>. Do not post private payment evidence, credentials or personal information in public repository issues. Backups retain records under the recovery retention policy; retained accounting and anti-replay records are not removed by the account-delete button. Under 18s must use via an adult.</p>
`,
  },
  copyright: {
    title: 'Copyright',
    body: `
<p>We don’t own third-party characters, titles, logos, art, descriptions, or images.</p>
<p>Metadata owns only its compilation/JSON arrangement. Facts and ids aren’t owned; descriptions, synopses, and images may be copyrighted and are used with attribution under license or fair use.</p>
<p>Entries point at public sources (e.g. AniList). We store links and facts, not exclusive licenses. Public availability is not permission to copy — get your own license and credit upstream. Reuse at your own risk.</p>
<p>Rights stay with their owners. Metadata is unofficial.</p>
`,
  },
  'fair-use': {
    title: 'Fair use & public data',
    body: `
<p>We index public facts — titles, names, ids, public image links — so apps and agents can look things up.</p>
<p>That’s for search and compatibility, not a substitute for official releases.</p>
<p>We make no fair-use determination for your reuse. If you reuse descriptions/images, assess rights yourself.</p>
<p>Think something’s wrong? Use DMCA / contact. We’ll review and fix or remove when needed.</p>
`,
  },
  dmca: {
    title: 'DMCA / takedown',
    body: `
<p>Send notices via <a href="/feedback.html">Feedback</a> (kind: takedown) or the repository issues — include: your contact, the work, the Metadata URL/id, a good-faith statement, and a signature.</p>
<p>Include all §512(c)(3) elements. We may hide disputed material while we review, terminate repeat infringers, and accept counter-notices under §512(g).</p>
`,
  },
  attribution: {
    title: 'Attribution',
    body: `
<p>Many covers and ids come from public DBs like <a href="https://anilist.co" target="_blank" rel="noreferrer">AniList</a>. Entries may list <code>sources</code>.</p>
<p>Credit upstream when you reuse data. Don’t claim Metadata is official.</p>
`,
  },
  'acceptable-use': {
    title: 'Acceptable use',
    body: `
<ul>
<li>No child sexual content</li>
<li>No hammering rate limits or shared keys</li>
<li>No malware or attacks on the API</li>
<li>Respect credits and limits</li>
<li>Don’t use this to harass real people</li>
</ul>
`,
  },
  affiliates: {
    title: 'Affiliate disclosure',
    body: `
<p><strong>We may or may not profit from affiliate links.</strong> As of Sep 2026, 0 of 113 listed partners carry a live affiliate tag — outbound links are direct unless labeled Affiliate/Sponsored.</p>
<p>Metadata can include outbound links to shops, marketplaces, print providers, and other partners. Some of those links are (or may later become) affiliate, referral, or partner tracking links.</p>
<ul>
<li><strong>May earn:</strong> If a link is configured with a live affiliate or referral tag, we may receive a commission or other compensation when you click through and make a purchase — at no extra cost to you.</li>
<li><strong>May not earn:</strong> Many links are plain catalog or official URLs with no tracking tag. We do not always earn from every partner, vertical, or product. Programs change; links may be unconfigured, expired, or non-commissionable.</li>
</ul>
<p>Presence of a shop or partner link is not a guarantee that we are paid for it, and it is not an endorsement that a product is the best or only option. Catalog data stays independent of whether a partner pays us.</p>
<p>You are never required to use an affiliate link. You can always go to a merchant directly.</p>
<p>Questions about a specific partner program: contact the operator (see repo / site footer).</p>
`,
  },
  refunds: {
    title: 'Refund policy',
    body: `
<p><strong>All sales are final while we settle in crypto via Reown Pay.</strong></p>
<p>Prepaid credits are digital goods. Once a wallet payment confirms on-chain (or is otherwise accepted by our payment rail), we do not reverse the transfer or restore value off-chain as a cash refund.</p>
<ul>
<li><strong>Reown Pay / crypto.</strong> No refunds. Blockchain transfers are irreversible. Double-check network, amount, and pack before you confirm. Chargebacks do not apply the way they do with cards.</li>
<li><strong>Failed or incomplete payments.</strong> If a payment never settles and credits were never granted, there is nothing to refund — try again or contact the operator with the tx / payment ref.</li>
<li><strong>Used credits.</strong> Credits already spent on API or catalog access are never refundable, regardless of payment method.</li>
</ul>
<p><strong>Stripe (when available).</strong> After we ship card checkout via Stripe, we may refund <em>unused</em> prepaid credits bought with that method, subject to limits we publish at purchase time (for example remaining balance only, within a time window, minus fees). Used credits stay non-refundable. Until Stripe is live and labeled as available on Pricing, treat this as a future path — not a current offer.</p>
<p>We may still fix accounting mistakes (credits paid for but never applied) by granting the missing credits rather than a cash refund.</p>
<p>Questions: contact the operator (see repo / site footer) with your wallet, pack, and payment reference.</p>
`,
  },
}

const pageIds = Object.keys(pages)

function resolveId(raw: string): string {
  const id = raw.replace(/^#/, '')
  return pages[id] ? id : 'terms'
}

const active = resolveId(location.hash || 'terms')

const centerHtml = `
  <section class="section section-stable legal-page">
    <div class="section-head">
      <h2>Legal</h2>
      <p class="section-note">Rules for using Metadata.</p>
    </div>

    <div class="legal-picker">
      <label class="legal-picker-label" for="legal-select">Document</label>
      <div class="md-select-wrap legal-picker-row">
        <select id="legal-select" class="md-select" aria-label="Legal document">
          ${pageIds
            .map(
              (id) =>
                `<option value="${id}"${id === active ? ' selected' : ''}>${pages[id].title}</option>`,
            )
            .join('')}
        </select>
      </div>
    </div>

    <article class="legal-prose" aria-live="polite">
      <h3 id="legal-title" class="legal-doc-title">${pages[active].title}</h3>
      <div id="legal-content">${pages[active].body}</div>
      <p class="prose-muted legal-source">Source:
        <a href="${SOURCE_URL}" target="_blank" rel="noreferrer">${icon('github-line', { size: 14, class: 'ico' })} repository</a>
      </p>
    </article>
  </section>
`

const app = document.querySelector('#app')!
app.innerHTML = shellHtml({
  page: 'legal',
  centerHtml,
  wallet: true,
})

const selectEl = document.querySelector<HTMLSelectElement>('#legal-select')!
const titleEl = document.querySelector('#legal-title') as HTMLElement
const contentEl = document.querySelector('#legal-content') as HTMLElement

function show(raw: string) {
  const id = resolveId(raw)
  const p = pages[id]
  titleEl.textContent = p.title
  contentEl.innerHTML = p.body
  if (selectEl.value !== id) selectEl.value = id
  document.title = `${p.title} · Metadata`
}

selectEl.addEventListener('change', () => {
  const id = selectEl.value
  history.replaceState(null, '', `#${id}`)
  show(id)
})

const legalCmds: CmdItem[] = pageIds.map((id) => ({
  id: `legal-${id}`,
  title: pages[id].title,
  subtitle: 'Legal document',
  group: 'Docs',
  icon: 'document-line',
  keywords: id,
  run: () => {
    history.replaceState(null, '', `#${id}`)
    show(id)
  },
}))

bootShellChrome({ items: legalCmds })
bindShellWallet()

window.addEventListener('hashchange', () => {
  show(location.hash || 'terms')
})

show(active)
