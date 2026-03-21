import type { CreateImageJournalEntryInput, ImageJournalEntry } from '../../types/image-journal'

import localforage from 'localforage'

import { useObjectUrl } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { useAiriCardStore } from './airi-card'

export const useImageJournalStore = defineStore('image-journal', () => {
  const STORAGE_PREFIX = 'image-journal-'
  const { activeCardId } = storeToRefs(useAiriCardStore())

  const entries = ref<ImageJournalEntry[]>([])
  const loading = ref(false)
  const initializedForCharacterId = ref<string | null>(null)

  // Map to track object URLs for Blobs to prevent memory leaks
  const blobRefs = new Map<string, any>()
  const urlRefs = new Map<string, any>()

  function ensureObjectUrl(id: string, blob: Blob) {
    let blobRef = blobRefs.get(id)
    let urlRef = urlRefs.get(id)

    if (!blobRef || !urlRef) {
      blobRef = shallowRef<Blob | undefined>(blob)
      blobRefs.set(id, blobRef)
      urlRef = useObjectUrl(blobRef)
      urlRefs.set(id, urlRef)
    }

    if (blobRef.value !== blob)
      blobRef.value = blob

    return urlRef.value
  }

  onScopeDispose(() => {
    blobRefs.clear()
    urlRefs.clear()
  })

  const sortedEntries = computed(() => {
    return [...entries.value].sort((a, b) => b.createdAt - a.createdAt)
  })

  async function load(characterId?: string) {
    const targetId = characterId ?? activeCardId.value
    if (!targetId)
      return

    if (initializedForCharacterId.value === targetId)
      return

    loading.value = true
    const loadedEntries: ImageJournalEntry[] = []

    try {
      await localforage.iterate<ImageJournalEntry, void>((val, key) => {
        if (key.startsWith(STORAGE_PREFIX) && val.characterId === targetId) {
          const entry = { ...val, id: key }
          if (entry.blob instanceof Blob) {
            entry.url = ensureObjectUrl(key, entry.blob)
          }
          loadedEntries.push(entry)
        }
      })
      entries.value = loadedEntries
      initializedForCharacterId.value = targetId
    }
    catch (error) {
      console.error('[ImageJournal] Failed to load entries from IndexedDB:', error)
    }
    finally {
      loading.value = false
    }
  }

  // Force reload from IndexedDB (clears initialization guard)
  async function refresh() {
    initializedForCharacterId.value = null
    await load()
  }

  async function createEntry(input: CreateImageJournalEntryInput) {
    const targetCharacterId = input.characterId ?? activeCardId.value
    if (!targetCharacterId)
      throw new Error('No active character resolved for image journal entry.')

    // Ensure state is loaded for deduplication
    await load(targetCharacterId)

    // Store-level deduplication by originalUrl
    if (input.originalUrl) {
      const existingIndex = entries.value.findIndex(e => e.originalUrl === input.originalUrl)
      if (existingIndex !== -1) {
        const existing = entries.value[existingIndex]

        // If current input has a descriptive title and existing is generic, update it
        const isExistingGeneric = existing.title.startsWith('Generation ') || !existing.title
        const isNewDescriptive = !input.title.startsWith('Generation ') && input.title.trim().length > 0

        if (isExistingGeneric && isNewDescriptive) {
          existing.title = input.title.trim()
          existing.prompt = input.prompt || existing.prompt
          await localforage.setItem(existing.id, { ...existing })
        }

        return existing
      }
    }

    const id = `${STORAGE_PREFIX}${nanoid()}`
    const now = Date.now()

    const newEntry: ImageJournalEntry = {
      id,
      characterId: targetCharacterId,
      blob: input.blob,
      prompt: input.prompt,
      title: input.title.trim() || 'Untitled Artwork',
      remixId: input.remixId,
      createdAt: now,
      originalUrl: input.originalUrl,
    }

    try {
      await localforage.setItem(id, newEntry)
      newEntry.url = ensureObjectUrl(id, input.blob)

      // Update local state if it matches the current character
      if (targetCharacterId === activeCardId.value) {
        entries.value.push(newEntry)
      }

      return newEntry
    }
    catch (error) {
      console.error('[ImageJournal] Failed to save entry to IndexedDB:', error)
      throw error
    }
  }

  async function deleteEntry(id: string) {
    try {
      await localforage.removeItem(id)

      const index = entries.value.findIndex(e => e.id === id)
      if (index !== -1) {
        entries.value.splice(index, 1)
      }

      // Cleanup object URL
      const blobRef = blobRefs.get(id)
      if (blobRef)
        blobRef.value = undefined
      blobRefs.delete(id)
      urlRefs.delete(id)
    }
    catch (error) {
      console.error('[ImageJournal] Failed to delete entry from IndexedDB:', error)
      throw error
    }
  }

  async function findEntry(query: string) {
    await load()
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery)
      return null

    // Exact ID match first
    const byId = entries.value.find(e => e.id === normalizedQuery || e.id === `${STORAGE_PREFIX}${normalizedQuery}`)
    if (byId)
      return byId

    // Title match
    const byTitle = entries.value.find(e => e.title.toLowerCase().includes(normalizedQuery))
    return byTitle || null
  }

  // Reload when character changes
  watch(activeCardId, (newId) => {
    if (newId) {
      initializedForCharacterId.value = null
      void load(newId)
    }
  }, { immediate: true })

  return {
    entries: sortedEntries,
    loading,
    load,
    refresh,
    createEntry,
    deleteEntry,
    findEntry,
  }
})
