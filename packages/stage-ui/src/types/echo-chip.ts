export type EchoChipType = 'mood' | 'flavor' | 'journal_candidate'

export interface EchoChip {
  id: string
  userId: string
  characterId: string
  /** The date of the STMM block this chip is linked to (YYYY-MM-DD) */
  date: string
  content: string
  type: EchoChipType
  relevanceScore: number
  /** Optional indices of the facts/evidence that led to this chip */
  evidenceIndices?: number[]
  createdAt: number
}
