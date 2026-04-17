export type EchoChipType = 'mood' | 'flavor' | 'journal_candidate'

export interface EchoChip {
  id: string
  userId: string
  characterId: string
  /** Anchor date for the dream window this chip was generated from (YYYY-MM-DD) */
  date: string
  content: string
  type: EchoChipType
  relevanceScore: number
  /** Optional indices of the facts/evidence that led to this chip */
  evidenceIndices?: number[]
  createdAt: number
}
