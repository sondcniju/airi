import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { EchoChip, EchoChipType } from '../types/echo-chip'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import * as v from 'valibot'

import { echoChipsRepo } from '../database/repos/echo-chips.repo'
import { useAuthStore } from './auth'
import { useLLM } from './llm'
import { useShortTermMemoryStore } from './memory-short-term'
import { useAiriCardStore } from './modules/airi-card'
import { useConsciousnessStore } from './modules/consciousness'
import { useProvidersStore } from './providers'

const ChipSchema = v.object({
  content: v.string(),
  type: v.picklist(['mood', 'flavor', 'journal_candidate']),
  relevanceScore: v.number(),
  evidence_indices: v.optional(v.array(v.number())),
})

const ArtifactsSchema = v.object({
  pills: v.array(ChipSchema),
})

export const useEchoesStore = defineStore('echo-chips', () => {
  const { userId } = storeToRefs(useAuthStore())
  const { cards } = storeToRefs(useAiriCardStore())
  const { activeProvider: globalProviderId, activeModel: globalModelId } = storeToRefs(useConsciousnessStore())
  const shortTermMemory = useShortTermMemoryStore()
  const providersStore = useProvidersStore()
  const llmStore = useLLM()

  const chips = ref<EchoChip[]>([])
  const loading = ref(false)
  const initializedForUserId = ref<string | null>(null)

  function getCurrentUserId() {
    return userId.value || 'local'
  }

  const sortedChips = computed(() => {
    return [...chips.value].sort((a, b) => b.createdAt - a.createdAt)
  })

  async function load() {
    const currentUserId = getCurrentUserId()
    if (initializedForUserId.value === currentUserId)
      return

    loading.value = true
    try {
      chips.value = await echoChipsRepo.getAll(currentUserId) ?? []
      initializedForUserId.value = currentUserId
    }
    finally {
      loading.value = false
    }
  }

  async function persist(nextChips: EchoChip[]) {
    const currentUserId = getCurrentUserId()
    await echoChipsRepo.saveAll(currentUserId, nextChips)
    chips.value = nextChips
    initializedForUserId.value = currentUserId
  }

  function getCharacterChips(characterId: string) {
    return sortedChips.value.filter(chip => chip.characterId === characterId)
  }

  async function synthesizeForCharacter(characterId: string, date?: string) {
    const card = cards.value.get(characterId)
    if (!card)
      throw new Error(`Character ${characterId} not found for echo synthesis.`)

    const stmBlocks = shortTermMemory.getCharacterBlocks(characterId)
    const targetBlock = date
      ? stmBlocks.find(b => b.date === date)
      : stmBlocks[0] // Default to most recent

    if (!targetBlock)
      throw new Error(`No STMM block found for character ${characterId} on ${date || 'recent date'}.`)

    loading.value = true
    try {
      const prompt = `
Extract 3-5 semantic Echo Chips from the following situational awareness block.
These are for a character memory-stream; avoid clinical labels.

Requirements:
1. CONTENT: Use 2-5 word evocative bursts (e.g. "Dogs know tricks", "Gaming as stress relief").
2. TYPE: Identify if the chip represents a "mood", "flavor" (trait/fact), or "journal_candidate" (noteworthy event).
3. RELEVANCE: Provide a relevanceScore from 0.0 to 1.0.

Situational Awareness Block:
${targetBlock.summary}

Output a JSON object with a "pills" array.
`
      const providerId = card.extensions?.airi?.modules?.consciousness?.provider || globalProviderId.value
      const modelId = card.extensions?.airi?.modules?.consciousness?.model || globalModelId.value

      if (!providerId || !modelId)
        throw new Error('No provider/model configured for echo synthesis.')

      const provider = await providersStore.getProviderInstance<ChatProvider>(providerId)
      if (!provider)
        throw new Error(`Failed to resolve provider instance for "${providerId}".`)

      const res = await llmStore.generateObject(modelId, provider, {
        messages: [{ role: 'user', content: prompt }],
        schema: ArtifactsSchema,
        normalize: (parsed: any) => {
          if (Array.isArray(parsed.pills)) {
            parsed.pills = parsed.pills.map((p: any) => {
              // Handle object-alias drift
              const content = p.content || p.pill || p.text || 'Untitled'
              const type = (p.type || p.category || (p.mood ? 'mood' : 'flavor')).toLowerCase()
              const finalType = ['mood', 'flavor', 'journal_candidate'].includes(type) ? type : 'flavor'

              return {
                ...p,
                content,
                type: finalType,
                relevanceScore: typeof p.relevanceScore === 'number' ? p.relevanceScore : 0.8,
              }
            })
          }
          return parsed
        },
      })

      await load()
      const now = Date.now()
      const newChips: EchoChip[] = res.pills.map((p: any) => ({
        id: nanoid(),
        userId: getCurrentUserId(),
        characterId,
        date: targetBlock.date,
        content: p.content,
        type: p.type as EchoChipType,
        relevanceScore: p.relevanceScore,
        evidenceIndices: p.evidence_indices || [],
        createdAt: now,
      }))

      // Filtering out duplicates for the same date/label
      const existing = chips.value.filter(c => c.characterId !== characterId || c.date !== targetBlock.date)
      await persist([...newChips, ...existing])

      return newChips
    }
    catch (err) {
      console.group('Echo Synthesis Critical Failure')
      console.error('Error Object:', err)
      if (err instanceof Error)
        console.error('Stack:', err.stack)
      console.groupEnd()
      throw err
    }
    finally {
      loading.value = false
    }
  }

  return {
    chips: sortedChips,
    loading,
    load,
    getCharacterChips,
    synthesizeForCharacter,
  }
})
