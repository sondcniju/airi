export type SemanticFactCategory = 
  | 'identity'      // Who the user is
  | 'preference'    // What the user likes/dislikes
  | 'interest'      // What the user is curious about
  | 'personality'   // User's character traits
  | 'relationship'  // Nature of the user-agent bond
  | 'experience'    // Shared memories/events
  | 'goal'          // What the user wants to achieve
  | 'guideline'     // Explicit rules or instructions

export interface SemanticFact {
  id: string
  userId: string
  characterId: string
  category: SemanticFactCategory
  content: string
  confidence: number // 0.0 to 1.0
  sourceEpisodeIds: string[] // Lineage/Evidence
  
  embedding?: number[]
  
  createdAt: number
  updatedAt: number
}
