export interface DirectorNote {
  id: string
  sessionId: string
  type: 'director-note'
  content: string
  intensity: number
  title?: string
  prompt?: string
  target?: 'user' | 'assistant'
  state: 'pending' | 'done'
  createdAt: number
}

export interface DirectorNotesIndex {
  notes: Record<string, DirectorNote[]> // Keyed by sessionId
}
