import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { ProvisioningSession } from '../database/repos/provisioning-session.repo'
import type { LifetimeMemoryArtifact } from '../types/lifetime-memory'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'

import { chatSessionsRepo } from '../database/repos/chat-sessions.repo'
import { lifetimeMemoryRepo } from '../database/repos/lifetime-memory.repo'
import { provisioningSessionRepo } from '../database/repos/provisioning-session.repo'
import { shortTermMemoryRepo } from '../database/repos/short-term-memory.repo'
import { textJournalRepo } from '../database/repos/text-journal.repo'
import { useAuthStore } from './auth'
import { useLLM } from './llm'
import { useAiriCardStore } from './modules/airi-card'
import { useConsciousnessStore } from './modules/consciousness'
import { useProvidersStore } from './providers'

interface ProvisioningProgress {
  phase: 'idle' | 'aggregating' | 'chunking' | 'synthesizing' | 'distilling' | 'success' | 'error'
  currentChunk: number
  totalChunks: number
  completedCalls: number
  totalCalls: number
  message: string
}

// Literal JSON Schemas from Bunny Mint lab
const ChunkArchiveJsonSchema = {
  type: 'object',
  properties: {
    durable_facts: { type: 'array', items: { type: 'string' } },
    recurring_preferences: { type: 'array', items: { type: 'string' } },
    recurring_topics: { type: 'array', items: { type: 'string' } },
    relationship_dynamics: { type: 'array', items: { type: 'string' } },
    user_mannerisms: { type: 'array', items: { type: 'string' } },
    meaningful_moments: { type: 'array', items: { type: 'string' } },
    inside_jokes_or_motifs: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'durable_facts',
    'recurring_preferences',
    'recurring_topics',
    'relationship_dynamics',
    'user_mannerisms',
    'meaningful_moments',
    'inside_jokes_or_motifs',
  ],
} as const

const SynthesisJsonSchema = {
  type: 'object',
  properties: {
    archive_md: { type: 'string' },
  },
  required: ['archive_md'],
} as const

const DistillPass1Schema = {
  type: 'object',
  properties: {
    relationship_core: { type: 'array', items: { type: 'string' } },
    user_patterns: { type: 'array', items: { type: 'string' } },
    shared_rituals: { type: 'array', items: { type: 'string' } },
    stable_topics: { type: 'array', items: { type: 'string' } },
    meaningful_old_moments: { type: 'array', items: { type: 'string' } },
    inside_jokes_or_motifs: { type: 'array', items: { type: 'string' } },
    compression_notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'relationship_core',
    'user_patterns',
    'shared_rituals',
    'stable_topics',
    'meaningful_old_moments',
    'inside_jokes_or_motifs',
    'compression_notes',
  ],
} as const

const FinalDistilledSchema = {
  type: 'object',
  properties: {
    distilled_md: { type: 'string' },
  },
  required: ['distilled_md'],
} as const

interface SourceDoc {
  id: string
  layer: 'raw' | 'stmm' | 'ltmm'
  timestamp: string
  text: string
}

export const useMemoryLifetimeStore = defineStore('memory-lifetime', () => {
  const { userId } = storeToRefs(useAuthStore())
  const { cards } = storeToRefs(useAiriCardStore())
  const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
  const providersStore = useProvidersStore()
  const llmStore = useLLM()

  const artifacts = ref<Map<string, LifetimeMemoryArtifact>>(new Map())
  const activeSession = ref<ProvisioningSession | null>(null)
  const loading = ref(false)
  const isProvisioning = ref(false)
  const progress = ref<ProvisioningProgress>({
    phase: 'idle',
    currentChunk: 0,
    totalChunks: 0,
    completedCalls: 0,
    totalCalls: 0,
    message: '',
  })
  const error = ref<string | null>(null)

  function getCurrentUserId() {
    return userId.value || 'local'
  }

  async function loadForCharacter(characterId: string) {
    loading.value = true
    try {
      const [artifact, session] = await Promise.all([
        lifetimeMemoryRepo.getByCharacter(characterId),
        provisioningSessionRepo.get(characterId),
      ])
      if (artifact) {
        artifacts.value.set(characterId, artifact)
      }
      activeSession.value = session || null
    }
    finally {
      loading.value = false
    }
  }

  async function collectSourceDocs(characterId: string): Promise<SourceDoc[]> {
    const currentUserId = getCurrentUserId()
    const docs: SourceDoc[] = []

    // 1. Raw Sessions
    const index = await chatSessionsRepo.getIndex(currentUserId)
    const characterIndex = index?.characters?.[characterId]
    if (characterIndex) {
      for (const sessionId of Object.keys(characterIndex.sessions)) {
        const record = await chatSessionsRepo.getSession(sessionId)
        if (!record)
          continue
        record.messages.forEach((msg, idx) => {
          if (msg.role === 'system' || !msg.content)
            return
          const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          docs.push({
            id: `raw:${sessionId}:${idx}`,
            layer: 'raw',
            timestamp: new Date(msg.createdAt || record.meta.createdAt).toISOString(),
            text: `${msg.role}: ${text}`,
          })
        })
      }
    }

    // 2. STMM Blocks
    const stmmBlocks = await shortTermMemoryRepo.getAll(currentUserId)
    if (stmmBlocks) {
      stmmBlocks.filter(b => b.characterId === characterId).forEach((block) => {
        docs.push({
          id: `stmm:${block.id}`,
          layer: 'stmm',
          timestamp: block.date,
          text: block.summary,
        })
      })
    }

    // 3. LTMM Entries
    const ltmmEntries = await textJournalRepo.getAll(currentUserId)
    if (ltmmEntries) {
      ltmmEntries.filter(e => e.characterId === characterId).forEach((entry) => {
        docs.push({
          id: `ltmm:${entry.id}`,
          layer: 'ltmm',
          timestamp: new Date(entry.createdAt).toISOString(),
          text: `[Journal: ${entry.title}] ${entry.content}`,
        })
      })
    }

    return docs.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  }

  async function callJsonMode<T>(prompt: string, schema: object, provider: ChatProvider, modelId: string): Promise<T> {
    const systemPrompt = [
      'You must return ONLY valid JSON.',
      'Do not return markdown fences.',
      'Do not add commentary.',
      'Return JSON matching this schema exactly:',
      JSON.stringify(schema, null, 2),
    ].join('\n')

    const response = await llmStore.generate(modelId, provider, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ], {
      requestOverrides: { response_format: { type: 'json_object' } },
    })

    return JSON.parse(response.text || '{}') as T
  }

  async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, backoffBase = 2000): Promise<T> {
    let lastError: any
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn()
      }
      catch (err) {
        lastError = err
        if (i < maxRetries) {
          const delay = backoffBase * 2 ** i
          progress.value.message = `API Error, retrying in ${delay / 1000}s... (Attempt ${i + 1}/${maxRetries})`
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    throw lastError
  }

  async function provision(characterId: string, resume = false, intervalSeconds = 0) {
    const card = cards.value.get(characterId)
    if (!card)
      throw new Error('Character not found')

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    const maybeDelay = async () => {
      if (intervalSeconds > 0) {
        progress.value.message = `Cooling down... (${intervalSeconds}s)`
        await sleep(intervalSeconds * 1000)
      }
    }

    const providerId = card.extensions?.airi?.modules?.consciousness?.provider || activeProvider.value
    const modelId = card.extensions?.airi?.modules?.consciousness?.model || activeModel.value
    const provider = await providersStore.getProviderInstance<ChatProvider>(providerId!)
    if (!provider || !modelId)
      throw new Error('Counsciousness not configured')

    isProvisioning.value = true
    error.value = null
    const runStart = Date.now()

    try {
      let session: ProvisioningSession
      let docs: SourceDoc[] = []
      let chunks: SourceDoc[][] = []
      const chunkSize = 20

      if (resume && activeSession.value) {
        session = activeSession.value
        docs = await collectSourceDocs(characterId)
        for (let i = 0; i < docs.length; i += chunkSize) {
          chunks.push(docs.slice(i, i + chunkSize))
        }
      }
      else {
        progress.value = {
          phase: 'aggregating',
          currentChunk: 0,
          totalChunks: 0,
          completedCalls: 0,
          totalCalls: 0,
          message: 'Collecting relationship history...',
        }
        docs = await collectSourceDocs(characterId)
        for (let i = 0; i < docs.length; i += chunkSize) {
          chunks.push(docs.slice(i, i + chunkSize))
        }
        session = {
          characterId,
          phase: 'chunking',
          chunkSummaries: [],
          sourceDocCount: docs.length,
          totalChunks: chunks.length,
          completedChunks: 0,
          updatedAt: Date.now(),
        }
        await provisioningSessionRepo.save(session)
        activeSession.value = session
      }

      // N chunks + 1 Synthesis + 2 Distillation Passes = N + 3
      const totalCalls = chunks.length + 3
      progress.value.totalCalls = totalCalls
      progress.value.totalChunks = chunks.length

      // Phase 2: Chunking (Durable Fact Extraction)
      if (session.phase === 'chunking') {
        progress.value.phase = 'chunking'
        for (let i = session.completedChunks; i < chunks.length; i++) {
          progress.value.currentChunk = i + 1
          progress.value.completedCalls = i
          progress.value.message = `Analyzing history in chunks... (${i + 1}/${chunks.length})`

          const chunkPrompt = [
            `You are building a durable relationship archive for the character "${card.name}".`,
            `This is chunk ${i + 1} of ${chunks.length}.`,
            '',
            'Extract only durable and reusable relationship information from these records.',
            'Do not restate system-prompt personality assumptions.',
            'Focus on what actually happened in the interactions.',
            'Keep outputs short, specific, and reusable.',
            '',
            'Capture things like:',
            '- recurring preferences',
            '- recurring topics',
            '- relationship dynamics',
            '- user mannerisms',
            '- long-horizon meaningful moments',
            '- inside jokes or motifs',
            '',
            'Source records:',
            ...chunks[i].map((doc, index) => `${index + 1}. [${doc.layer.toUpperCase()}] [${doc.timestamp || 'undated'}] ${doc.text}`),
          ].join('\n')

          const summary = await withRetry(() => callJsonMode<any>(chunkPrompt, ChunkArchiveJsonSchema, provider, modelId))
          session.chunkSummaries.push(summary)
          session.completedChunks = i + 1
          session.updatedAt = Date.now()
          await provisioningSessionRepo.save(session)
          await maybeDelay()
        }
        session.phase = 'synthesizing'
        await provisioningSessionRepo.save(session)
      }

      // Phase 3: Base Synthesis (The "Rich Archive" Markdown)
      if (session.phase === 'synthesizing') {
        progress.value.phase = 'synthesizing'
        progress.value.completedCalls = chunks.length
        progress.value.message = 'Synthesizing rich first-pass archive...'

        const synthesisPrompt = [
          `Synthesize the first stable ${card.name} lifetime archive from these chunk summaries.`,
          '',
          'This is the base archive document for later incremental diffs.',
          'Do not mechanically concatenate the chunks.',
          'Instead, synthesize the durable relationship-level archive that those chunks imply.',
          'The output should feel like a rich first-pass archive, not a final compressed reload pack yet.',
          '',
          'Requirements:',
          '- preserve grounded specifics',
          '- merge duplicates across chunks',
          '- keep enough detail to serve as the base for later diff updates',
          '- write dense markdown with sections and bullets',
          '- aim for a substantial archive document',
          '- keep old meaningful moments that still matter',
          '',
          'Use this structure:',
          '- Relationship Core',
          '- User Patterns',
          '- Shared Rituals',
          '- Stable Topics',
          '- Meaningful Old Moments',
          '- Inside Jokes Or Motifs',
          '- Archive Notes',
          '',
          'Chunk materials:',
          JSON.stringify(session.chunkSummaries, null, 2),
        ].join('\n')

        const synthesisResult = await withRetry(() => callJsonMode<{ archive_md: string }>(synthesisPrompt, SynthesisJsonSchema, provider, modelId))
        session.baseContent = synthesisResult.archive_md
        session.phase = 'distilling'
        session.updatedAt = Date.now()
        await provisioningSessionRepo.save(session)
        await maybeDelay()
      }

      // Phase 4: 2-Pass Distillation
      if (session.phase === 'distilling') {
        progress.value.phase = 'distilling'

        // Pass 1: Semantic Extraction
        progress.value.completedCalls = chunks.length + 1
        progress.value.message = 'Distilling relational essence (Pass 1/2)...'

        const distillPass1Prompt = [
          `Compress this ${card.name} archive into a reload-grade lifetime context pack.`,
          '',
          'Goals:',
          '- dedupe repeated bullets',
          '- keep only the most durable relationship truths',
          '- keep old meaningful moments that still matter',
          '- keep the relationship specific and grounded',
          '- make it lighter, denser, and more stable',
          '- output compressed bullet lists, not an essay',
          '- optimize for model context efficiency, not literary beauty',
          '',
          'Desired shape:',
          '- relationship_core: 6-12 bullets',
          '- user_patterns: 6-12 bullets',
          '- shared_rituals: 4-10 bullets',
          '- stable_topics: 6-12 bullets',
          '- meaningful_old_moments: 6-12 bullets',
          '- inside_jokes_or_motifs: 6-12 bullets',
          '- compression_notes: short notes on what was merged/removed',
          '',
          'Archive to compress:',
          session.baseContent!,
        ].join('\n')

        const distillResult = await withRetry(() => callJsonMode<any>(distillPass1Prompt, DistillPass1Schema, provider, modelId))
        await maybeDelay()

        // Pass 2: Caveman Refinement
        progress.value.completedCalls = chunks.length + 2
        progress.value.message = 'Performing Caveman Refinement (Pass 2/2)...'

        const distillPass2Prompt = [
          'Refine this lifetime context pack into a cleaner final version.',
          '',
          'Critical rules:',
          '- remove articles when possible: a, an, the',
          '- remove filler: just, really, basically, actually, simply, essentially, generally',
          '- remove pleasantries and hedging',
          '- remove connective fluff: however, furthermore, additionally, in addition',
          '- remove duplication',
          '- merge near-identical bullets',
          '- use short synonyms',
          '- fragments OK in bullets',
          '- keep technical truth, drop fluff',
          '- preserve grounded specifics',
          '- prefer dense and memorable phrasing',
          '- target a compressed reload pack around 1000 tokens or less',
          '- do not write an essay paragraph unless absolutely needed',
          '- prefer dense bullet lists over prose',
          '- do not rewrite based on system prompt fantasy',
          '- do not over-index on one recent day',
          '',
          'Current pack to refine:',
          JSON.stringify(distillResult, null, 2),
        ].join('\n')

        const finalDistilledResult = await withRetry(() => callJsonMode<{ distilled_md: string }>(distillPass2Prompt, FinalDistilledSchema, provider, modelId))

        // Final Persistence
        const artifact: LifetimeMemoryArtifact = {
          id: nanoid(),
          characterId,
          version: 1,
          chunkSummaries: session.chunkSummaries,
          baseContent: session.baseContent!,
          distilledContent: finalDistilledResult.distilled_md,
          sourceManifest: {
            rawTurnCount: docs.filter(d => d.layer === 'raw').length,
            stmmBlockCount: docs.filter(d => d.layer === 'stmm').length,
            ltmmEntryCount: docs.filter(d => d.layer === 'ltmm').length,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: {
            model: modelId,
            totalElapsedMs: Date.now() - runStart,
            chunkCount: chunks.length,
          },
        }

        await lifetimeMemoryRepo.save(characterId, artifact)
        await provisioningSessionRepo.delete(characterId)
        artifacts.value.set(characterId, artifact)
        activeSession.value = null
        progress.value.phase = 'success'
        progress.value.completedCalls = totalCalls
        progress.value.message = 'Lifetime history successfully provisioned.'
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      progress.value.phase = 'error'
      progress.value.message = 'Failed to provision lifetime history.'
    }
    finally {
      isProvisioning.value = false
    }
  }

  async function reprovisionFromChunks(characterId: string, intervalSeconds = 0) {
    const artifact = artifacts.value.get(characterId)
    if (!artifact || !artifact.chunkSummaries?.length) {
      throw new Error('No cached chunks found for re-synthesis')
    }

    const card = cards.value.get(characterId)
    if (!card)
      throw new Error('Character not found')

    const providerId = card.extensions?.airi?.modules?.consciousness?.provider || activeProvider.value
    const modelId = card.extensions?.airi?.modules?.consciousness?.model || activeModel.value
    const provider = await providersStore.getProviderInstance<ChatProvider>(providerId!)
    if (!provider || !modelId)
      throw new Error('Counsciousness not configured')

    isProvisioning.value = true
    error.value = null
    progress.value = {
      phase: 'synthesizing',
      currentChunk: artifact.chunkSummaries.length,
      totalChunks: artifact.chunkSummaries.length,
      completedCalls: 0,
      totalCalls: 3, // Synthesis + Distill P1 + Distill P2
      message: 'Re-synthesizing from existing chunks...',
    }

    try {
      // Create a fake session for the internal pipeline
      const session: ProvisioningSession = {
        characterId,
        phase: 'synthesizing',
        chunkSummaries: artifact.chunkSummaries,
        sourceDocCount: artifact.sourceManifest.rawTurnCount + artifact.sourceManifest.stmmBlockCount + artifact.sourceManifest.ltmmEntryCount,
        totalChunks: artifact.chunkSummaries.length,
        completedChunks: artifact.chunkSummaries.length,
        updatedAt: Date.now(),
      }
      activeSession.value = session

      // Use the existing provision logic but starting from synthesis
      await provision(characterId, true, intervalSeconds)
    }
    finally {
      isProvisioning.value = false
    }
  }

  async function restart(characterId: string) {
    await provisioningSessionRepo.delete(characterId)
    activeSession.value = null
    await provision(characterId, false)
  }

  return {
    artifacts,
    activeSession,
    loading,
    isProvisioning,
    progress,
    error,
    loadForCharacter,
    provision,
    reprovisionFromChunks,
    restart,
    collectSourceDocs,
  }
})
