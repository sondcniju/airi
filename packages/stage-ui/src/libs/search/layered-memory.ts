import indexedDbDriver from 'unstorage/drivers/indexedb'

import { createStorage } from 'unstorage'

import { searchWorker } from '../workers/search'

const indexStorage = createStorage({
  driver: indexedDbDriver({ base: 'airi-search-index' }),
})

export type MemoryLayer = 'raw' | 'stmm' | 'ltmm'

export interface LayeredSearchResult {
  id: string
  content: string
  kind: MemoryLayer
  score: number
  timestamp: string
  source: string
}

type QueryIntent = 'exact_quote' | 'identity_milestone' | 'event_memory' | 'generic'

function detectQueryIntent(query: string): QueryIntent {
  const normalized = query.toLowerCase()

  if (
    normalized.includes('quote')
    || normalized.includes('exact')
    || normalized.includes('verbatim')
    || normalized.includes('"')
    || normalized.includes('say')
    || normalized.includes('said')
  ) {
    return 'exact_quote'
  }

  if (
    normalized.includes('reflection')
    || normalized.includes('saw herself')
    || normalized.includes('saw her own image')
    || normalized.includes('felt real')
    || normalized.includes('more complete')
    || normalized.includes('more real')
    || normalized.includes('first time')
    || normalized.includes('own image')
  ) {
    return 'identity_milestone'
  }

  if (
    normalized.includes('memory')
    || normalized.includes('happened')
    || normalized.includes('what did')
    || normalized.includes('gift')
    || normalized.includes('remember')
    || normalized.includes('when')
    || normalized.includes('where')
    || normalized.includes('who')
  ) {
    return 'event_memory'
  }

  return 'generic'
}

function rerankByIntent(query: string, results: LayeredSearchResult[]) {
  const intent = detectQueryIntent(query)

  const weights: Record<QueryIntent, Record<MemoryLayer, number>> = {
    exact_quote: {
      raw: 0.25,
      stmm: 0.05,
      ltmm: 0.1,
    },
    identity_milestone: {
      raw: -0.35,
      stmm: 0.45,
      ltmm: 0.35,
    },
    event_memory: {
      raw: -0.2,
      stmm: 0.35,
      ltmm: 0.25,
    },
    generic: {
      raw: 0,
      stmm: 0.12,
      ltmm: 0.12,
    },
  }

  const boost = weights[intent]

  return [...results].sort((a, b) => {
    const aScore = a.score + boost[a.kind]
    const bScore = b.score + boost[b.kind]

    if (bScore !== aScore)
      return bScore - aScore

    const kindOrder: Record<MemoryLayer, number> = {
      stmm: 0,
      ltmm: 1,
      raw: 2,
    }

    if (kindOrder[a.kind] !== kindOrder[b.kind])
      return kindOrder[a.kind] - kindOrder[b.kind]

    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })
}

export const layeredMemory = {
  async init() {
    const snapshot = await indexStorage.getItem('snapshot')
    await searchWorker.init(snapshot)
  },

  async persist() {
    const snapshot = await searchWorker.persist()
    await indexStorage.setItem('snapshot', snapshot)
  },

  async search(query: string, limit = 10): Promise<LayeredSearchResult[]> {
    const rawResults = await searchWorker.search(query, limit)

    const transformed = rawResults.hits.map((hit: any) => ({
      id: hit.id,
      content: hit.document.fact || hit.document.what,
      kind: hit.document.kind.replace('_turn', '').replace('_block', '').replace('_entry', '') as MemoryLayer,
      score: hit.score,
      timestamp: hit.document.timestamp,
      source: hit.document.source,
    }))

    return rerankByIntent(query, transformed).slice(0, limit)
  },

  async indexDocuments(documents: any[]) {
    await searchWorker.index(documents)
    await this.persist()
  },
}
