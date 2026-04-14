export interface LifetimeMemoryArtifact {
  id: string
  characterId: string
  version: number
  /** The foundation: summarized chunks used for synthesis */
  chunkSummaries: any[]
  /** The "heavy" summarized base (~7k tokens) */
  baseContent: string
  /** The compressed, distilled relational essence (~1k tokens) */
  distilledContent: string
  sourceManifest: {
    rawTurnCount: number
    stmmBlockCount: number
    ltmmEntryCount: number
  }
  createdAt: number
  updatedAt: number
  metadata: {
    model: string
    totalElapsedMs: number
    chunkCount: number
  }
}
