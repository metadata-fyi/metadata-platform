/** Esports / competitive gaming catalog */

export interface EsportsTitle {
  id: string
  slug: string
  name: string
  aliases: string[]
  /** Link to Metadata game series slug when known */
  gameSeriesSlug?: string | null
  genre?: string | null
  publisher?: string | null
  developer?: string | null
  platforms: string[]
  teamSize?: number | null
  description?: string | null
  website?: string | null
  tags: string[]
  sources: Record<string, string>
  updatedAt: string
}

export interface EsportsLeague {
  id: string
  slug: string
  name: string
  shortName?: string | null
  titleId: string
  region?: string | null
  tier?: string | null
  format?: string | null
  website?: string | null
  description?: string | null
  tags: string[]
  sources: Record<string, string>
  updatedAt: string
}

export interface EsportsTeam {
  id: string
  slug: string
  name: string
  shortName?: string | null
  titleIds: string[]
  region?: string | null
  country?: string | null
  website?: string | null
  tags: string[]
  sources: Record<string, string>
  updatedAt: string
}

export interface EsportsPlayer {
  id: string
  slug: string
  handle: string
  nameReal?: string | null
  titleIds: string[]
  teamId?: string | null
  country?: string | null
  role?: string | null
  status?: string | null
  tags: string[]
  sources: Record<string, string>
  updatedAt: string
}

export interface EsportsStats {
  titles: number
  leagues: number
  teams: number
  players: number
}
