import type { TcgCard } from './tcg-types.js'
export interface TcgRulingPage {
  status: 'published' | 'staged' | 'unavailable'
  language: 'ja'
  items: Array<{ id: string; publisherId: string; gameId: 'yugioh'; language: 'ja'; question: string; answer: string; publisherCardIds: string[]; sources: Record<string, string>; [key: string]: unknown }>
  total: number
  limit: number
  offset: number
  coverage: { language: string; expectedRulings: number; capturedRulings: number; missingRulings: number; complete: boolean; publishedToApi: boolean; generatedAt: string } | null
}
export function rulingsForPublisherCard(publisherCardId: string | number, options?: { limit?: number; offset?: number; directory?: string }): TcgRulingPage
export function rulingsForTcgCard(card: TcgCard): TcgRulingPage | undefined
