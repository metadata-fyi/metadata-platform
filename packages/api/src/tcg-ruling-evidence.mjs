/** Validate publisher index accounting before using FAQ coverage as release evidence. */
export function validateRulingEvidence(report, pages, rows) {
  const fail = (reason) => {
    throw new Error(`Invalid ruling evidence: ${reason}`)
  }
  const expected = new Set()
  let next = 1
  for (const page of pages) {
    if (
      page.total !== report.expectedRulings ||
      page.start !== next ||
      page.end !== page.start + page.ids.length - 1 ||
      !/^[a-f0-9]{64}$/.test(page.sha256 ?? '') ||
      !page.source
    )
      fail('index range or provenance')
    for (const id of page.ids) {
      if (!/^\d+$/.test(id) || expected.has(id)) fail('duplicate or invalid index identity')
      expected.add(id)
    }
    next = page.end + 1
  }
  if (expected.size !== report.expectedRulings || pages.length !== report.indexPages)
    fail('index total')
  const captured = new Set()
  const cards = new Set()
  for (const row of rows) {
    if (
      !expected.has(row.publisherId) ||
      captured.has(row.publisherId) ||
      row.id !== `yugioh-ja-faq-${row.publisherId}` ||
      row.gameId !== 'yugioh' ||
      row.language !== 'ja' ||
      !row.question?.trim() ||
      !row.answer?.trim() ||
      !/^[a-f0-9]{64}$/.test(row.sha256 ?? '') ||
      !row.sources?.['konami-ja']
    )
      fail('answer identity or provenance')
    captured.add(row.publisherId)
    for (const id of row.publisherCardIds) {
      if (!/^\d+$/.test(id)) fail('card association')
      cards.add(id)
    }
  }
  const missing = new Set()
  for (const id of report.remainingPublisherIds) {
    if (!expected.has(id) || captured.has(id) || missing.has(id))
      fail('missing identity accounting')
    missing.add(id)
  }
  if (
    captured.size + missing.size !== expected.size ||
    captured.size !== report.completedRulings ||
    missing.size !== report.missingRulings ||
    cards.size !== report.publisherCardAssociations ||
    report.complete !== (missing.size === 0)
  )
    fail('coverage totals')
  return {
    generatedAt: report.generatedAt,
    expectedRulings: expected.size,
    capturedRulings: captured.size,
    missingRulings: missing.size,
    publisherCardAssociations: cards.size,
    complete: report.complete,
    publishedToApi: report.publishedToApi,
    reason: report.reason,
  }
}
