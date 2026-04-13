import type { HybridSearchResult, MemoryLayer, SearchDocumentMeta } from './hybrid-scorer'

import indexedDbDriver from 'unstorage/drivers/indexedb'

import { createStorage } from 'unstorage'

import { searchWorker } from '../workers/search'
import {
  defaultScorerConfig,

  scoreHybridResults,

} from './hybrid-scorer'

const indexStorage = createStorage({
  driver: indexedDbDriver({ base: 'airi-search-index' }),
})

export interface LayeredSearchResult extends HybridSearchResult {}

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
    const documents = rawResults.documents.map((document: SearchDocumentMeta & { kind: string }) => ({
      ...document,
      kind: document.kind.replace('_turn', '').replace('_block', '').replace('_entry', '') as MemoryLayer,
    }))

    return scoreHybridResults(
      query,
      documents,
      rawResults.vectorHits,
      rawResults.keywordHits,
      defaultScorerConfig,
    ).slice(0, limit)
  },

  async indexDocuments(documents: any[]) {
    await searchWorker.index(documents)
    await this.persist()
  },
}
