export interface ImageJournalEntry {
  id: string
  characterId: string
  blob: Blob
  url?: string // Object URL for rendering (managed by store)
  prompt: string
  title: string
  remixId?: string | number
  createdAt: number
  originalUrl?: string // External URL for deduplication
}

export interface CreateImageJournalEntryInput {
  blob: Blob
  prompt: string
  title: string
  characterId?: string
  remixId?: string | number
  originalUrl?: string
}
