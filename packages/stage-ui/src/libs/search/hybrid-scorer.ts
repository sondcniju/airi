export type MemoryLayer = 'raw' | 'stmm' | 'ltmm'

export interface SearchCandidate {
  id: string
  score: number
}

export interface SearchDocumentMeta {
  id: string
  content: string
  kind: MemoryLayer
  timestamp: string
  source: string
}

export interface HybridSearchResult extends SearchDocumentMeta {
  score: number
  vectorScore: number
  keywordScore: number
  temporalScore: number
  layerBoost: number
  profile: QueryProfile
}

export interface ScorerConfig {
  weightVector: number
  weightKeyword: number
  temporalWeight: number
  minVectorSimilarity: number
  minScoreSpread: number
  halfLifeDays: number
  layerBoosts: Record<MemoryLayer, number>
  quoteLayerBoosts: Record<MemoryLayer, number>
}

export type QueryProfile = 'quote' | 'question' | 'longform' | 'default'

const MS_PER_DAY = 1000 * 60 * 60 * 24

export const defaultScorerConfig: ScorerConfig = {
  weightVector: 0.68,
  weightKeyword: 0.32,
  temporalWeight: 0.12,
  minVectorSimilarity: 0.45,
  minScoreSpread: 0.04,
  halfLifeDays: 30,
  layerBoosts: {
    raw: 0,
    stmm: 0.14,
    ltmm: 0.1,
  },
  quoteLayerBoosts: {
    raw: 0.18,
    stmm: -0.04,
    ltmm: 0.02,
  },
}

function normalizeWeights(weightVector: number, weightKeyword: number) {
  const total = weightVector + weightKeyword
  if (total <= 0)
    return { weightVector: 0.5, weightKeyword: 0.5 }

  return {
    weightVector: weightVector / total,
    weightKeyword: weightKeyword / total,
  }
}

function getTemporalScore(timestamp: string, halfLifeDays: number) {
  const ts = new Date(timestamp).getTime()
  if (!Number.isFinite(ts))
    return 0.75

  const ageDays = Math.max(0, (Date.now() - ts) / MS_PER_DAY)
  if (ageDays <= 0)
    return 1

  return 0.5 ** (ageDays / Math.max(1, halfLifeDays))
}

export function detectQueryProfile(query: string): QueryProfile {
  const normalized = query.trim().toLowerCase()
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length

  if (
    normalized.includes('"')
    || normalized.includes('verbatim')
    || normalized.includes('exact quote')
    || normalized.startsWith('what did ')
    || normalized.startsWith('what was ')
    || normalized.includes(' exact ')
  ) {
    return 'quote'
  }

  if (
    normalized.endsWith('?')
    || /^(who|what|when|where|why|how)\b/.test(normalized)
  ) {
    return 'question'
  }

  if (tokenCount >= 14)
    return 'longform'

  return 'default'
}

function adjustConfigForProfile(config: ScorerConfig, profile: QueryProfile) {
  const weights = normalizeWeights(config.weightVector, config.weightKeyword)

  switch (profile) {
    case 'quote':
      return {
        ...config,
        ...normalizeWeights(0.55, 0.45),
        layerBoosts: config.quoteLayerBoosts,
      }
    case 'question':
      return {
        ...config,
        ...weights,
      }
    case 'longform':
      return {
        ...config,
        ...normalizeWeights(0.76, 0.24),
        layerBoosts: {
          raw: 0,
          stmm: 0.08,
          ltmm: 0.08,
        },
      }
    default:
      return {
        ...config,
        ...weights,
      }
  }
}

function filterVectorNoise(vectorScores: number[], config: ScorerConfig) {
  if (!vectorScores.length)
    return false

  const best = Math.max(...vectorScores)
  const worst = Math.min(...vectorScores)
  if (best < config.minVectorSimilarity)
    return true

  return (best - worst) < config.minScoreSpread
}

export function scoreHybridResults(
  query: string,
  documents: SearchDocumentMeta[],
  vectorCandidates: SearchCandidate[],
  keywordCandidates: SearchCandidate[],
  config: ScorerConfig = defaultScorerConfig,
): HybridSearchResult[] {
  const profile = detectQueryProfile(query)
  const effectiveConfig = adjustConfigForProfile(config, profile)
  const vectorMap = new Map(vectorCandidates.map(candidate => [candidate.id, candidate.score]))
  const keywordMap = new Map(keywordCandidates.map(candidate => [candidate.id, candidate.score]))
  const vectorScores = [...vectorMap.values()]
  const dropVectorSignal = filterVectorNoise(vectorScores, effectiveConfig)

  const results = documents
    .map((document) => {
      const vectorScore = dropVectorSignal ? 0 : (vectorMap.get(document.id) ?? 0)
      const keywordScore = keywordMap.get(document.id) ?? 0
      const temporalScore = getTemporalScore(document.timestamp, effectiveConfig.halfLifeDays)
      const layerBoost = effectiveConfig.layerBoosts[document.kind] ?? 0
      const signalScore = (effectiveConfig.weightVector * vectorScore) + (effectiveConfig.weightKeyword * keywordScore)
      const score = signalScore + (temporalScore * effectiveConfig.temporalWeight) + layerBoost

      return {
        ...document,
        score,
        vectorScore,
        keywordScore,
        temporalScore,
        layerBoost,
        profile,
      }
    })
    .filter(result => result.vectorScore > 0 || result.keywordScore > 0)

  results.sort((a, b) => {
    if (b.score !== a.score)
      return b.score - a.score

    if (b.vectorScore !== a.vectorScore)
      return b.vectorScore - a.vectorScore

    if (b.keywordScore !== a.keywordScore)
      return b.keywordScore - a.keywordScore

    const kindOrder: Record<MemoryLayer, number> = {
      stmm: 0,
      ltmm: 1,
      raw: 2,
    }

    if (kindOrder[a.kind] !== kindOrder[b.kind])
      return kindOrder[a.kind] - kindOrder[b.kind]

    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })

  return results
}
