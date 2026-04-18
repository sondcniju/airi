import type { TextJournalEntry, TextJournalEntrySource } from '../types/text-journal'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { chatSessionsRepo } from '../database/repos/chat-sessions.repo'
import { shortTermMemoryRepo } from '../database/repos/short-term-memory.repo'
import { textJournalRepo } from '../database/repos/text-journal.repo'
import { layeredMemory } from '../libs/search/layered-memory'
import { useAuthStore } from './auth'
import { useAiriCardStore } from './modules/airi-card'

function normalizeEntry(entry: TextJournalEntry): TextJournalEntry {
  return {
    id: String(entry.id),
    userId: String(entry.userId),
    characterId: String(entry.characterId),
    characterName: String(entry.characterName),
    title: String(entry.title ?? ''),
    content: String(entry.content ?? ''),
    source: entry.source ?? 'tool',
    type: entry.type ?? 'message',

    // FSRS
    stability: Number(entry.stability ?? 0),
    difficulty: Number(entry.difficulty ?? 0),
    elapsed_days: Number(entry.elapsed_days ?? 0),
    scheduled_days: Number(entry.scheduled_days ?? 0),
    last_review: Number(entry.last_review ?? entry.createdAt ?? Date.now()),
    surprise: entry.surprise !== undefined ? Number(entry.surprise) : undefined,

    // Search
    embedding: Array.isArray(entry.embedding) ? entry.embedding : undefined,
    version: entry.version,

    createdAt: Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : Date.now(),
    updatedAt: Number.isFinite(entry.updatedAt) ? Number(entry.updatedAt) : Date.now(),
  }
}

function normalizeEntries(entries: TextJournalEntry[]) {
  return entries.map(normalizeEntry)
}

export const useTextJournalStore = defineStore('text-journal', () => {
  const { userId } = storeToRefs(useAuthStore())
  const { activeCard, activeCardId, cards } = storeToRefs(useAiriCardStore())

  const entries = ref<TextJournalEntry[]>([])
  const loading = ref(false)
  const initializedForUserId = ref<string | null>(null)

  function getCurrentUserId() {
    return userId.value || 'local'
  }

  const sortedEntries = computed(() => {
    return [...entries.value].sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt)
  })

  async function load() {
    const currentUserId = getCurrentUserId()
    if (initializedForUserId.value === currentUserId)
      return

    loading.value = true
    try {
      entries.value = normalizeEntries(await textJournalRepo.getAll(currentUserId) ?? [])

      // Initialize layered memory index
      await layeredMemory.init()

      initializedForUserId.value = currentUserId

      // Fire-and-forget background indexing
      backgroundIndexAll().catch(err => console.error('text_journal: background search indexing failed:', err))
    }
    finally {
      loading.value = false
    }
  }

  async function backgroundIndexAll() {
    const userId = getCurrentUserId()
    const cardId = activeCardId.value
    if (!userId || !cardId)
      return

    // 1. LTMM
    const ltmm = entries.value.filter(e => e.characterId === cardId).map(e => ({
      id: e.id,
      fact: e.content,
      kind: 'ltmm_entry',
      timestamp: new Date(e.createdAt).toISOString(),
      source: e.source,
    }))

    // 2. STMM
    const stmmRaw = await shortTermMemoryRepo.getAll(userId) ?? []
    const stmm = stmmRaw.filter(b => b.characterId === cardId).map(b => ({
      id: b.id,
      fact: b.summary,
      kind: 'stmm_block',
      timestamp: b.date,
      source: b.source,
    }))

    // 3. Raw (Sampling recent sessions)
    const index = await chatSessionsRepo.getIndex(userId)
    const raw: any[] = []
    if (index && index.characters[cardId]) {
      const characterSessions = index.characters[cardId]
      const sessions = Object.values(characterSessions.sessions)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5) // Last 5 sessions

      for (const s of sessions) {
        const session = await chatSessionsRepo.getSession(s.sessionId)
        if (session) {
          for (const m of session.messages) {
            if (m.role === 'user' || m.role === 'assistant') {
              const text = typeof m.content === 'string' ? m.content : ''
              if (text.length > 40) {
                raw.push({
                  id: m.id,
                  fact: text,
                  kind: 'raw_turn',
                  timestamp: new Date(m.createdAt || Date.now()).toISOString(),
                  source: `chat:${s.sessionId}`,
                })
              }
            }
          }
        }
      }
    }

    await layeredMemory.indexDocuments([...ltmm, ...stmm, ...raw])
  }

  async function persist(nextEntries: TextJournalEntry[]) {
    const currentUserId = getCurrentUserId()
    const snapshot = normalizeEntries(JSON.parse(JSON.stringify(nextEntries)) as TextJournalEntry[])
    await textJournalRepo.saveAll(currentUserId, snapshot)
    entries.value = snapshot
    initializedForUserId.value = currentUserId
  }

  async function createEntry(input: {
    title?: string
    content: string
    source?: TextJournalEntrySource
    characterId?: string
  }) {
    try {
      await load()
    }
    catch (err) {
      throw new Error(`text_journal: failed to load entries before creating: ${err instanceof Error ? err.message : String(err)}`)
    }

    const targetCard = input.characterId
      ? cards.value.get(input.characterId)
      : activeCard.value

    if (!targetCard)
      throw new Error('No active character is available for text_journal.create.')

    const currentUserId = getCurrentUserId()
    const now = Date.now()
    const nextEntry: TextJournalEntry = {
      id: nanoid(),
      userId: currentUserId,
      characterId: input.characterId ?? activeCardId.value ?? '',
      characterName: targetCard.name,
      title: (input.title?.trim() || 'Journal Entry'),
      content: input.content.trim(),
      source: input.source ?? 'tool',

      // FSRS
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      last_review: now,

      createdAt: now,
      updatedAt: now,
    }

    if (!nextEntry.characterId)
      throw new Error('Active character could not be resolved for text journal entry creation.')

    const nextEntries = [nextEntry, ...entries.value]
    try {
      await persist(nextEntries)
    }
    catch (err) {
      throw new Error(`text_journal: failed to persist new entry "${nextEntry.title}": ${err instanceof Error ? err.message : String(err)}`)
    }
    return nextEntry
  }

  async function seedActiveCharacterEntry() {
    const targetCard = activeCard.value
    if (!targetCard)
      throw new Error('No active character is available to seed the text journal.')

    return await createEntry({
      title: 'Seeded Journal Entry',
      source: 'seed',
      content: [
        `This is a seeded long-term journal entry for ${targetCard.name}.`,
        'It exists to verify that text_journal.create is wired, persisted, and scoped to the active character.',
      ].join('\n\n'),
    })
  }

  async function searchEntries(input: {
    query: string
    limit?: number
    characterId?: string
  }) {
    try {
      await load()
    }
    catch (err) {
      throw new Error(`text_journal: failed to load entries before searching: ${err instanceof Error ? err.message : String(err)}`)
    }

    const query = input.query.trim()
    if (!query)
      return []

    const results = await layeredMemory.search(query, input.limit ?? 3)

    // Log search results for developer review
    console.log(`[TextJournal:Search] Query: "${query}" | Results:`, results)

    // For now, map layered results back to the most relevant TextJournalEntry if it exists,
    // or provide surrogate entries for STMM/Raw.
    return results.map((res) => {
      const existing = entries.value.find(e => e.id === res.id)
      if (existing) {
        return {
          ...existing,
          kind: res.kind,
        }
      }

      // Surrogate entry for STMM/Raw context
      return {
        id: res.id,
        userId: getCurrentUserId(),
        characterId: input.characterId ?? activeCardId.value ?? '',
        characterName: activeCard.value?.name ?? 'Unknown',
        title: `[${res.kind.toUpperCase()}] Memory`,
        content: res.content,
        kind: res.kind,
        source: 'tool',
        type: 'message',
        createdAt: new Date(res.timestamp).getTime(),
        updatedAt: new Date(res.timestamp).getTime(),
      } as TextJournalEntry & { kind: string }
    })
  }

  return {
    entries: sortedEntries,
    loading,
    load,
    createEntry,
    seedActiveCharacterEntry,
    searchEntries,
    backgroundIndexAll,
    persist,
  }
})
