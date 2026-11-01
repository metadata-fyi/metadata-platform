/** Trading card game catalog types */

export type TcgGameId = 'pokemon' | 'yugioh' | 'onepiece' | 'mtg' | 'lorcana' | 'weiss' | 'azuki'

export interface TcgGame {
  id: TcgGameId
  slug: string
  name: string
  shortName: string
  publisher?: string | null
  website?: string | null
  description?: string | null
  tags: string[]
  updatedAt: string
}

export interface TcgSet {
  /** Published product contents and specifications, where supplied. */
  description?: string | null
  aliases?: string[]
  language?: 'en' | 'ja' | 'shared'
  /** Known printing languages for a shared set, when supplied by the source. */
  languages?: string[]
  /** Languages observed in a fully accounted source printing search. */
  sourceLanguageEvidence?: {
    languages: string[]
    source: string
    sha256: string
    snapshotFile: string
    observedAt: string
  }
  productType?: string
  digital?: boolean
  sourceIds?: Record<string, string>
  sourceExpansions?: number[]
  sourceHasAllCards?: boolean

  id: string
  gameId: TcgGameId
  code: string
  name: string
  series?: string | null
  releaseDate?: string | null
  /** Publisher-announced window; no exact date is inferred. */
  releaseWindow?: {
    year: number
    label: string
    evidence: {
      source: string
      snapshotFile: string
      sha256: string
      observedAt: string
      quote: string
    }
  }
  cardCount?: number | null
  printedTotal?: number | null
  total?: number | null
  ptcgoCode?: string | null
  legalities?: Record<string, string>
  sourceUpdatedAt?: string | null
  imageUrl?: string | null
  imageLogoUrl?: string | null
  imageSymbolUrl?: string | null
  sources: Record<string, string>
  updatedAt: string
}

export interface TcgPokemonAbility {
  name: string
  type?: string | null
  text?: string | null
}

export interface TcgPokemonAttack {
  name: string
  cost: string[]
  convertedEnergyCost?: number | null
  damage?: string | null
  text?: string | null
}

export interface TcgPokemonTrait {
  name: string
  text?: string | null
}

export interface TcgPokemonModifier {
  type: string
  value: string
}

/** Structured gameplay and collection metadata published by the Pokémon TCG API. */
export interface TcgPokemonDetails {
  evolvesFrom?: string | null
  evolvesTo?: string[]
  rules?: string[]
  abilities?: TcgPokemonAbility[]
  attacks?: TcgPokemonAttack[]
  weaknesses?: TcgPokemonModifier[]
  resistances?: TcgPokemonModifier[]
  retreatCost?: string[]
  convertedRetreatCost?: number | null
  nationalPokedexNumbers?: number[]
  legalities?: Record<string, string>
  regulationMark?: string | null
  ancientTrait?: TcgPokemonTrait | null
  /** Printed held-item name/effect on the Pokémon, separate from attached Trainer cards. */
  heldItem?: TcgPokemonTrait | null
  /** Verified printed symbol; absence does not imply a semantic rarity tier. */
  printedRarity?: { status: 'present' | 'absent'; symbol: string | null }
}

export interface TcgFacetCount {
  value: string
  count: number
}

export interface TcgFacets {
  gameId: TcgGameId
  totalCards: number
  sets: TcgSet[]
  rarities: TcgFacetCount[]
  types: TcgFacetCount[]
  subtypes: TcgFacetCount[]
}

export interface TcgCard {
  language?: 'en' | 'ja'
  printingSourceId?: string
  metadataLevel?: 'index' | 'detailed'
  /** Product membership does not resolve a physical collector-code/finish printing. */
  recordKind?: 'canonical' | 'printing' | 'product-membership'
  /** Unabridged game-specific source fields; excludes price observations. */
  gameplay?: Record<string, unknown>
  promoGrouping?: string | null
  promoSource?: string | null
  fullIdentifier?: string

  id: string
  gameId: TcgGameId
  /** Stable identifier from the source catalog, without Metadata's game prefix. */
  sourceId?: string | null
  setId?: string | null
  setCode?: string | null
  setName?: string | null
  number?: string | null
  name: string
  nameNative?: string | null
  rarity?: string | null
  supertype?: string | null
  subtypes?: string[]
  types?: string[]
  colors?: string[]
  hp?: string | null
  cost?: string | null
  power?: string | null
  counter?: string | null
  attribute?: string | null
  level?: string | null
  race?: string | null
  archetype?: string | null
  artist?: string | null
  flavorText?: string | null
  text?: string | null
  description?: string | null
  pokemon?: TcgPokemonDetails
  imageUrl?: string | null
  imageSmallUrl?: string | null
  tags: string[]
  sources: Record<string, string>
  updatedAt: string
}

/** Full card endpoint envelope; `set` resolves the card's complete set record. */
export interface TcgCardDetail {
  card: TcgCard
  game: TcgGame | null
  set: TcgSet | null
  copy: {
    name: string
    number: string
    set: string
    rarity: string
    line: string
    tags: string
  }
  links: {
    sources: Record<string, string>
    shop: import('./affiliates.js').ShopLink[]
  }
  affiliates: Array<{
    id: string
    name: string
    affiliateUrl: string | null
    website: string
    isConfigured: boolean
  }>
  sku: string
  quotes?: import('./market-types.js').MarketQuote
}

/** Set endpoint envelope with a paginated card gallery. */
export interface TcgSetDetail {
  set: TcgSet
  cards: TcgCard[]
  totalCards: number
  limit: number
  offset: number
}

export interface TcgStats {
  games: number
  sets: number
  cards: number
}
