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
  phase: 'idle' | 'aggregating' | 'chunking' | 'synthesizing' | 'distill_pass_1' | 'distill_pass_2' | 'success' | 'error'
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

const LifetimeArchiveJsonSchema = {
  type: 'object',
  properties: {
    relationship_summary: { type: 'string' },
    recurring_preferences: { type: 'array', items: { type: 'string' } },
    recurring_topics: { type: 'array', items: { type: 'string' } },
    relationship_dynamics: { type: 'array', items: { type: 'string' } },
    user_mannerisms: { type: 'array', items: { type: 'string' } },
    meaningful_old_moments: { type: 'array', items: { type: 'string' } },
    inside_jokes_or_motifs: { type: 'array', items: { type: 'string' } },
    archive_notes: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'relationship_summary',
    'recurring_preferences',
    'recurring_topics',
    'relationship_dynamics',
    'user_mannerisms',
    'meaningful_old_moments',
    'inside_jokes_or_motifs',
    'archive_notes',
  ],
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

interface SourceDoc {
  id: string
  layer: 'raw' | 'stmm' | 'ltmm'
  timestamp: string
  text: string
}

interface LifetimeArchive {
  relationship_summary: string
  recurring_preferences: string[]
  recurring_topics: string[]
  relationship_dynamics: string[]
  user_mannerisms: string[]
  meaningful_old_moments: string[]
  inside_jokes_or_motifs: string[]
  archive_notes: string[]
}

interface DistilledPack {
  relationship_core: string[]
  user_patterns: string[]
  shared_rituals: string[]
  stable_topics: string[]
  meaningful_old_moments: string[]
  inside_jokes_or_motifs: string[]
  compression_notes: string[]
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function normalizeDistilledPack(value: unknown): DistilledPack {
  const pack = (value && typeof value === 'object') ? value as Record<string, unknown> : {}
  return {
    relationship_core: asStringArray(pack.relationship_core),
    user_patterns: asStringArray(pack.user_patterns),
    shared_rituals: asStringArray(pack.shared_rituals),
    stable_topics: asStringArray(pack.stable_topics),
    meaningful_old_moments: asStringArray(pack.meaningful_old_moments),
    inside_jokes_or_motifs: asStringArray(pack.inside_jokes_or_motifs),
    compression_notes: asStringArray(pack.compression_notes),
  }
}

function buildBaseArchivePrompt(characterName: string, docs: SourceDoc[], chunkSummaries: any[]) {
  const flattened = {
    durableFacts: [...new Set(chunkSummaries.flatMap((c: any) => c.durable_facts || []))],
    recurringPreferences: [...new Set(chunkSummaries.flatMap((c: any) => c.recurring_preferences || []))],
    recurringTopics: [...new Set(chunkSummaries.flatMap((c: any) => c.recurring_topics || []))],
    relationshipDynamics: [...new Set(chunkSummaries.flatMap((c: any) => c.relationship_dynamics || []))],
    userMannerisms: [...new Set(chunkSummaries.flatMap((c: any) => c.user_mannerisms || []))],
    meaningfulMoments: [...new Set(chunkSummaries.flatMap((c: any) => c.meaningful_moments || []))],
    insideJokes: [...new Set(chunkSummaries.flatMap((c: any) => c.inside_jokes_or_motifs || []))],
  }

  return [
    `You are building the first canonical lifetime relationship archive for "${characterName}".`,
    '',
    'Write the archive from the perspective of actual interactions, not from the character system prompt.',
    'The relationship summary must be one dense paragraph of about five sentences.',
    'It should answer things like:',
    '- how does the user actually treat you?',
    '- what do they like to do with you?',
    '- what do they talk about most?',
    '- what long-ago moments still matter?',
    '',
    'Do not let one recent day overwrite the whole relationship.',
    'Preserve older meaningful moments if they are durable.',
    '',
    `Manifest context: ${docs.length} documents (${docs.filter(d => d.layer === 'raw').length} raw / ${docs.filter(d => d.layer === 'stmm').length} stmm / ${docs.filter(d => d.layer === 'ltmm').length} ltmm).`,
    '',
    'Durable facts:',
    ...flattened.durableFacts.map(line => `- ${line}`),
    '',
    'Recurring preferences:',
    ...flattened.recurringPreferences.map(line => `- ${line}`),
    '',
    'Recurring topics:',
    ...flattened.recurringTopics.map(line => `- ${line}`),
    '',
    'Relationship dynamics:',
    ...flattened.relationshipDynamics.map(line => `- ${line}`),
    '',
    'User mannerisms:',
    ...flattened.userMannerisms.map(line => `- ${line}`),
    '',
    'Meaningful old moments:',
    ...flattened.meaningfulMoments.map(line => `- ${line}`),
    '',
    'Inside jokes or motifs:',
    ...flattened.insideJokes.map(line => `- ${line}`),
  ].join('\n')
}

function renderLifetimeArchiveMd(characterName: string, archive: LifetimeArchive, docCount: number, chunkCount: number) {
  return [
    `# Lifetime Archive: ${characterName}`,
    '',
    `- Documents processed: ${docCount}`,
    `- Chunk count: ${chunkCount}`,
    '',
    '## Relationship Summary',
    '',
    archive.relationship_summary,
    '',
    '## Recurring Preferences',
    ...archive.recurring_preferences.map(line => `- ${line}`),
    '',
    '## Recurring Topics',
    ...archive.recurring_topics.map(line => `- ${line}`),
    '',
    '## Relationship Dynamics',
    ...archive.relationship_dynamics.map(line => `- ${line}`),
    '',
    '## User Mannerisms',
    ...archive.user_mannerisms.map(line => `- ${line}`),
    '',
    '## Meaningful Old Moments',
    ...archive.meaningful_old_moments.map(line => `- ${line}`),
    '',
    '## Inside Jokes Or Motifs',
    ...archive.inside_jokes_or_motifs.map(line => `- ${line}`),
    '',
    '## Archive Notes',
    ...archive.archive_notes.map(line => `- ${line}`),
    '',
  ].join('\n')
}

function renderPackForReview(rawPack: DistilledPack | Record<string, unknown> | undefined) {
  const pack = normalizeDistilledPack(rawPack)
  return [
    'relationship_core:',
    ...pack.relationship_core.map(line => `- ${line}`),
    '',
    'user_patterns:',
    ...pack.user_patterns.map(line => `- ${line}`),
    '',
    'shared_rituals:',
    ...pack.shared_rituals.map(line => `- ${line}`),
    '',
    'stable_topics:',
    ...pack.stable_topics.map(line => `- ${line}`),
    '',
    'meaningful_old_moments:',
    ...pack.meaningful_old_moments.map(line => `- ${line}`),
    '',
    'inside_jokes_or_motifs:',
    ...pack.inside_jokes_or_motifs.map(line => `- ${line}`),
    '',
    'compression_notes:',
    ...pack.compression_notes.map(line => `- ${line}`),
  ].join('\n')
}

function renderDistilledArtifactMd(characterName: string, rawPack: DistilledPack | Record<string, unknown> | undefined) {
  const pack = normalizeDistilledPack(rawPack)
  return [
    `# Distilled Lifetime Context Pack: ${characterName}`,
    '',
    '## Relationship Core',
    '',
    ...pack.relationship_core.map(line => `- ${line}`),
    '',
    '## User Patterns',
    ...pack.user_patterns.map(line => `- ${line}`),
    '',
    '## Shared Rituals',
    ...pack.shared_rituals.map(line => `- ${line}`),
    '',
    '## Stable Topics',
    ...pack.stable_topics.map(line => `- ${line}`),
    '',
    '## Meaningful Old Moments',
    ...pack.meaningful_old_moments.map(line => `- ${line}`),
    '',
    '## Inside Jokes Or Motifs',
    ...pack.inside_jokes_or_motifs.map(line => `- ${line}`),
    '',
    '## Compression Notes',
    ...pack.compression_notes.map(line => `- ${line}`),
    '',
  ].join('\n')
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

  async function callJsonMode<T>(prompt: string, schema: object, provider: ChatProvider, modelId: string, systemExtras: string[] = []): Promise<T> {
    const systemPrompt = [
      'You must return ONLY valid JSON.',
      'Do not return markdown fences.',
      'Do not add commentary.',
      'Return JSON matching this schema exactly:',
      JSON.stringify(schema, null, 2),
      ...systemExtras,
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
      const chunks: SourceDoc[][] = []
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

      // N chunks + 1 base synthesis + 2 distillation passes = N + 3
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

      // Phase 3: Base synthesis using the lab's structured archive contract
      if (session.phase === 'synthesizing') {
        progress.value.phase = 'synthesizing'
        progress.value.completedCalls = chunks.length
        progress.value.message = 'Synthesizing base lifetime archive...'

        const synthesisPrompt = buildBaseArchivePrompt(card.name, docs, session.chunkSummaries)
        const synthesisResult = await withRetry(() => callJsonMode<LifetimeArchive>(synthesisPrompt, LifetimeArchiveJsonSchema, provider, modelId))
        session.baseArchive = synthesisResult
        session.baseContent = renderLifetimeArchiveMd(card.name, synthesisResult, docs.length, chunks.length)
        session.phase = 'distill_pass_1'
        session.updatedAt = Date.now()
        await provisioningSessionRepo.save(session)
        await maybeDelay()
      }

      // Phase 4A: Distill pass 1 (dedupe + normalize)
      if (session.phase === 'distill_pass_1') {
        progress.value.phase = 'distill_pass_1'
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

        session.distillPass1Pack = normalizeDistilledPack(await withRetry(() => callJsonMode<DistilledPack>(
          distillPass1Prompt,
          DistillPass1Schema,
          provider,
          modelId,
          [
            'You are compressing an internal semantic archive into a reload-grade lifetime artifact.',
            'Do not use markdown.',
            'Compression rules inspired by caveman-compress:',
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
            'Section definitions:',
            '- relationship_core: highest-level bond, power dynamic, role framing, long-horizon connection',
            '- user_patterns: what the user repeatedly does or how they behave',
            '- shared_rituals: repeated relational routines or repeated intimacy/domestic acts',
            '- stable_topics: recurring conversation/project subjects',
            '- meaningful_old_moments: concrete past events still worth remembering',
            '- inside_jokes_or_motifs: recurring phrases, symbols, jokes, prompt quirks',
          ],
        )))
        session.phase = 'distill_pass_2'
        session.updatedAt = Date.now()
        await provisioningSessionRepo.save(session)
        await maybeDelay()
      }

      // Phase 4B: Distill pass 2 (dense refinement)
      if (session.phase === 'distill_pass_2') {
        progress.value.phase = 'distill_pass_2'
        progress.value.completedCalls = chunks.length + 2
        progress.value.message = 'Performing Caveman Refinement (Pass 2/2)...'

        const pass1Pack = normalizeDistilledPack(session.distillPass1Pack)
        const hasPass1Content = Object.values(pass1Pack).some(section => section.length > 0)
        if (!hasPass1Content) {
          throw new Error('Cannot resume distill pass 2 because the cached pass 1 pack is missing or invalid. Re-run provisioning from the beginning.')
        }

        const distillPass2Prompt = [
          'Refine this lifetime context pack into a cleaner final version.',
          '',
          'Critical rules:',
          '- one concept, one section',
          '- do not repeat the same idea across sections',
          '- if a concept fits multiple sections, choose the single best home',
          '- every bullet must be self-contained enough for reload context',
          '- cryptic bullets are not allowed',
          '- keep enough context for a model to use the bullet later',
          '- preserve grounded specifics but compress hard',
          '- remove near-duplicates aggressively',
          '- prefer one canonical phrasing per recurring concept',
          '- bullets should usually be 4-14 words, but may be longer if needed for clarity',
          '- meaningful old moments and inside jokes may use a short clause to explain why they matter',
          '- keep total output around 1000 tokens or less',
          '',
          'Current pack to refine:',
          renderPackForReview(pass1Pack),
        ].join('\n')

        const finalDistilledPack = normalizeDistilledPack(await withRetry(() => callJsonMode<DistilledPack>(
          distillPass2Prompt,
          DistillPass1Schema,
          provider,
          modelId,
          [
            'You are compressing an internal semantic archive into a reload-grade lifetime artifact.',
            'Do not use markdown.',
            'Compression rules inspired by caveman-compress:',
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
          ],
        )))

        // Final Persistence
        const artifact: LifetimeMemoryArtifact = {
          id: nanoid(),
          characterId,
          version: 1,
          chunkSummaries: session.chunkSummaries,
          baseArchive: session.baseArchive,
          baseContent: session.baseContent!,
          distillPass1Pack: pass1Pack,
          distilledContent: renderDistilledArtifactMd(card.name, finalDistilledPack),
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
        baseArchive: artifact.baseArchive,
        sourceDocCount: artifact.sourceManifest.rawTurnCount + artifact.sourceManifest.stmmBlockCount + artifact.sourceManifest.ltmmEntryCount,
        totalChunks: artifact.chunkSummaries.length,
        completedChunks: artifact.chunkSummaries.length,
        baseContent: artifact.baseContent,
        distillPass1Pack: artifact.distillPass1Pack,
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
