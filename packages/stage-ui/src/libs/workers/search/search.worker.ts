import { env, pipeline } from '@huggingface/transformers'
import { create, getByID, insert, load, save } from '@orama/orama'

// Suppress noisy ONNX Runtime warnings
env.backends.onnx.logLevel = 'error'

interface SearchDocument {
  id: string
  what?: string
  fact?: string
  kind: string
  source: string
  timestamp: string
  embedding?: number[]
}

interface SearchSnapshot {
  db: any
  documents: SearchDocument[]
}

let db: any = null
let embedder: any = null
let documents = new Map<string, SearchDocument>()
let averageDocumentLength = 0
let documentFrequency = new Map<string, number>()

const MODEL_ID = 'Xenova/bge-small-en-v1.5'
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'must',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'it',
  'they',
  'them',
  'his',
  'her',
  'its',
  'their',
  'this',
  'that',
  'these',
  'those',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'into',
  'about',
  'between',
  'through',
  'after',
  'before',
  'and',
  'or',
  'but',
  'not',
  'no',
  'nor',
  'so',
  'if',
  'then',
  'user',
])

async function getEmbedder() {
  if (!embedder) {
    embedder = await pipeline('feature-extraction', MODEL_ID, {
      device: 'webgpu',
    })
  }
  return embedder
}

async function initDb(snapshot?: any) {
  if (db && !snapshot)
    return db

  db = await create({
    schema: {
      who: 'string',
      what: 'string',
      fact: 'string',
      kind: 'string',
      source: 'string',
      timestamp: 'string',
      embedding: 'vector[384]',
    },
  })

  if (snapshot)
    await load(db, snapshot)

  return db
}

async function getVector(text: string) {
  const extractor = await getEmbedder()
  const output = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(output.data as number[])
}

function getDocumentContent(document: SearchDocument) {
  return document.fact || document.what || ''
}

function normalizeToken(token: string) {
  return token.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function tokenize(input: string) {
  return input
    .split(/\s+/)
    .map(normalizeToken)
    .filter(token => token.length > 1 && !STOPWORDS.has(token))
}

function rebuildKeywordStats() {
  documentFrequency = new Map()
  let totalLength = 0

  for (const document of documents.values()) {
    const tokens = tokenize(getDocumentContent(document))
    totalLength += tokens.length

    const uniqueTerms = new Set(tokens)
    for (const term of uniqueTerms)
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
  }

  averageDocumentLength = documents.size ? totalLength / documents.size : 0
}

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length)
    return 0

  let dot = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  if (!magA || !magB)
    return 0

  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

function getVectorCandidates(queryVector: number[], limit: number) {
  const results = [...documents.values()]
    .map((document) => {
      const embedding = document.embedding
      if (!embedding?.length)
        return null

      return {
        id: document.id,
        score: cosineSimilarity(queryVector, embedding),
      }
    })
    .filter((candidate): candidate is { id: string, score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score)

  return results.slice(0, limit)
}

function getKeywordCandidates(query: string, limit: number) {
  const queryTerms = tokenize(query)
  if (!queryTerms.length)
    return []

  const totalDocuments = documents.size || 1
  const k1 = 1.5
  const b = 0.75

  const scored = [...documents.values()]
    .map((document) => {
      const tokens = tokenize(getDocumentContent(document))
      if (!tokens.length)
        return null

      const frequencies = new Map<string, number>()
      for (const token of tokens)
        frequencies.set(token, (frequencies.get(token) ?? 0) + 1)

      let score = 0
      for (const term of queryTerms) {
        const tf = frequencies.get(term) ?? 0
        if (!tf)
          continue

        const df = documentFrequency.get(term) ?? 0
        const idf = Math.log(1 + ((totalDocuments - df + 0.5) / (df + 0.5)))
        const denom = tf + (k1 * (1 - b + (b * (tokens.length / Math.max(1, averageDocumentLength || tokens.length)))))
        score += idf * ((tf * (k1 + 1)) / denom)
      }

      if (score <= 0)
        return null

      return {
        id: document.id,
        score,
      }
    })
    .filter((candidate): candidate is { id: string, score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score)

  const maxScore = scored[0]?.score ?? 1

  return scored
    .slice(0, limit)
    .map(candidate => ({
      ...candidate,
      score: candidate.score / maxScore,
    }))
}

function upsertDocument(document: SearchDocument) {
  documents.set(document.id, document)
}

function hydrateDocuments(nextDocuments: SearchDocument[] = []) {
  documents = new Map()
  for (const document of nextDocuments)
    upsertDocument(document)

  rebuildKeywordStats()
}

function normalizeSnapshot(snapshot: any): SearchSnapshot | null {
  if (!snapshot)
    return null

  if (snapshot.db && Array.isArray(snapshot.documents))
    return snapshot as SearchSnapshot

  return {
    db: snapshot,
    documents: [],
  }
}

globalThis.addEventListener('message', async (e) => {
  const { type, payload, id } = e.data

  try {
    switch (type) {
      case 'init': {
        const normalizedSnapshot = normalizeSnapshot(payload?.snapshot)
        await initDb(normalizedSnapshot?.db)
        hydrateDocuments(normalizedSnapshot?.documents)
        globalThis.postMessage({ id, type: 'ready' })
        break
      }

      case 'index': {
        await initDb()
        const { documents: nextDocuments } = payload
        let indexedCount = 0

        for (const document of nextDocuments as SearchDocument[]) {
          const exists = await getByID(db, document.id)
          if (exists && documents.has(document.id))
            continue

          const embedding = document.embedding?.length
            ? document.embedding
            : await getVector(getDocumentContent(document))

          const persistedDocument = { ...document, embedding }

          if (exists) {
            upsertDocument(persistedDocument)
            indexedCount++
            continue
          }

          await insert(db, { ...persistedDocument, embedding })
          upsertDocument(persistedDocument)
          indexedCount++
        }

        rebuildKeywordStats()
        globalThis.postMessage({ id, type: 'indexed', count: indexedCount })
        break
      }

      case 'search': {
        await initDb()
        const { query, limit = 10 } = payload
        const queryVector = await getVector(query)
        const candidateLimit = Math.max(limit * 5, 20)

        const results = {
          vectorHits: getVectorCandidates(queryVector, candidateLimit),
          keywordHits: getKeywordCandidates(query, candidateLimit),
          documents: [...documents.values()].map(document => ({
            id: document.id,
            content: getDocumentContent(document),
            kind: document.kind,
            timestamp: document.timestamp,
            source: document.source,
          })),
        }

        globalThis.postMessage({ id, type: 'results', results })
        break
      }

      case 'persist': {
        if (!db)
          throw new Error('DB not initialized')

        const snapshot: SearchSnapshot = {
          db: await save(db),
          documents: [...documents.values()],
        }

        globalThis.postMessage({ id, type: 'snapshot', snapshot })
        break
      }
    }
  }
  catch (err) {
    globalThis.postMessage({
      id,
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
})
