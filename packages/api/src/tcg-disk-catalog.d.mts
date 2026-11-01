import type { Paginated } from './types.js'
import type { TcgCard, TcgFacets } from './tcg-types.js'
export type DiskCardOptions = { game?: string; language?: string; set?: string; q?: string; rarity?: string; type?: string; subtype?: string; limit?: number; offset?: number }
export interface TcgDiskCatalog {
 listCards(opts?: DiskCardOptions): Paginated<TcgCard>
 getCard(id: string): TcgCard | undefined
 allCards(): TcgCard[]
 collector(game: string, set: string, number: string): TcgCard | undefined
 collectorAliases(key: string): TcgCard[]
 matchMarket(opts: { game?: string; setCode?: string; language?: string; number: string; title: string }): TcgCard[]
 facets(game: string): Pick<TcgFacets, 'totalCards' | 'rarities' | 'types' | 'subtypes'> | null
 count(): number
 counts(): Array<{ game: string; cards: number }>
 search(query: string, limit: number, offset: number): { total: number; items: Array<{ card: TcgCard; score: number }> }
}
export function openTcgDiskCatalog(file: string): TcgDiskCatalog
export function buildTcgDiskCatalog(file: string): { ok: boolean; cards: number; database: string; bytes: number }
