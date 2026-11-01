/** Game / arcade / handheld hardware platforms */

export type ConsoleFormFactor =
  | 'home'
  | 'handheld'
  | 'hybrid'
  | 'arcade'
  | 'micro'
  | 'cloud'
  | 'other'

export interface ConsoleManufacturer {
  id: string
  slug: string
  name: string
  country?: string | null
  website?: string | null
  tags: string[]
  updatedAt: string
}

export interface GameConsole {
  id: string
  slug: string
  name: string
  aliases: string[]
  manufacturerId: string
  /** Display manufacturer name */
  manufacturer?: string | null
  formFactor: ConsoleFormFactor
  generation?: number | null
  releaseDate?: string | null
  discontinueDate?: string | null
  region?: string | null
  cpu?: string | null
  gpu?: string | null
  media?: string[]
  maxControllers?: number | null
  backwardsCompatible?: string[]
  successorId?: string | null
  predecessorId?: string | null
  description?: string | null
  imageUrl?: string | null
  tags: string[]
  sources: Record<string, string>
  shopPartnerIds?: string[]
  updatedAt: string
}

export interface ConsoleStats {
  consoles: number
  manufacturers: number
  byFormFactor: Record<string, number>
}
