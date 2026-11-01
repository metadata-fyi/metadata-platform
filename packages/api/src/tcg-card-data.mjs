/** Keep normalized cards resident; load full gameplay through a bounded shard cache. */
import fs from 'node:fs'
import { gunzipSync } from 'node:zlib'
const directory = new URL('../data/tcg/', import.meta.url)
const read = (name) => {
  const data = fs.readFileSync(new URL(name, directory))
  return JSON.parse((name.endsWith('.gz') ? gunzipSync(data) : data).toString('utf8'))
}
const gameplayCache = new Map()
function gameplay(file, id) {
  let rows = gameplayCache.get(file)
  if (!rows) {
    rows = new Map(read(file).map(card => [card.id, card.gameplay]))
    gameplayCache.set(file, rows)
    if (gameplayCache.size > 2) gameplayCache.delete(gameplayCache.keys().next().value)
  } else {
    gameplayCache.delete(file)
    gameplayCache.set(file, rows)
  }
  return rows.get(id)
}
const cards = []
const manifest = read('card-shards.json')
for (const file of ['cards.json', ...manifest.files]) {
  if (file !== 'cards.json' && !/^cards-extra-\d{3}\.json(?:\.gz)?$/.test(file)) throw new Error('Invalid card shard filename')
  for (const card of read(file)) {
    if (card.gameplay !== undefined) {
      delete card.gameplay
      Object.defineProperty(card, 'gameplay', { enumerable: true, get: () => gameplay(file, card.id) })
    }
    cards.push(card)
  }
}
if (cards.length !== manifest.totalCards) throw new Error('TCG shard total does not match manifest')
export default cards
