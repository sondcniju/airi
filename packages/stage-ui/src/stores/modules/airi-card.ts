import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { DEFAULT_ACTING_MODEL_EXPRESSION_PROMPT, DEFAULT_ACTING_SPEECH_EXPRESSION_PROMPT, DEFAULT_ACTING_SPEECH_MANNERISM_PROMPT, DEFAULT_HEARTBEATS_PROMPT } from '../../constants/prompts/character-defaults'
import { useSettingsStageModel } from '../settings/stage-model'
import { useConsciousnessStore } from './consciousness'
import { useSpeechStore } from './speech'

export interface HeartbeatConfig {
  enabled: boolean
  intervalMinutes: number
  prompt: string
  injectIntoPrompt: boolean
  useAsLocalGate: boolean
  contextOptions?: {
    windowHistory: boolean
    systemLoad: boolean
    usageMetrics: boolean
  }
  schedule: {
    start: string
    end: string
  }
}

export interface ActingConfig {
  modelExpressionPrompt: string
  speechExpressionPrompt: string
  speechMannerismPrompt: string
  idleAnimations?: string[]
}

export interface CharacterGenerationConfig {
  enabled: boolean
  provider?: string
  model?: string
  known?: {
    maxTokens?: number
    temperature?: number
    topP?: number
    contextWidth?: number
  }
  advanced?: Record<string, any>
  importedPresetMeta?: {
    source?: 'sillytavern' | 'manual' | 'unknown'
    originalKeys?: string[]
    importedAt?: string
  }
}

export interface AiriExtension {
  modules: {
    consciousness?: {
      provider: string
      model: string
      moduleConfigs?: Record<string, any>
    }
    speech?: {
      provider: string
      model: string
      voice_id: string
      pitch?: number
      rate?: number
      ssml?: boolean
      language?: string
    }
    vrm?: {
      source?: 'file' | 'url'
      file?: string
      url?: string
    }
    live2d?: {
      source?: 'file' | 'url'
      file?: string
      url?: string
      activeExpressions?: Record<string, number>
      modelParameters?: Record<string, number>
    }
    displayModelId?: string
    activeBackgroundId?: string | null
  }
  acting?: ActingConfig
  heartbeat?: HeartbeatConfig
  generation?: CharacterGenerationConfig
  artistry?: {
    provider: string
    model?: string
    widgetInstruction?: string
    params?: Record<string, any>
  }
}

export interface AiriCard {
  name: string
  version: string
  description?: string
  notes?: string
  personality?: string
  scenario?: string
  systemPrompt?: string
  postHistoryInstructions?: string
  greetings?: string[]
  messageExample?: string[][]
  tags?: string[]
  creator?: string
  nickname?: string
  extensions: {
    airi?: AiriExtension
    [key: string]: any
  }
}

function resolveAiriExtension(card: any): AiriExtension {
  const data = card.data || card
  const extensions = data.extensions || {}
  const airi = extensions.airi || {}

  return {
    ...airi,
    modules: {
      ...airi.modules,
    },
  } as AiriExtension
}

function stripEmbeddedBackgroundData(extension: AiriExtension): AiriExtension {
  const mod = extension.modules || ({} as any)
  delete (mod as any).preferredBackgroundDataUrl
  return extension
}

export const useAiriCardStore = defineStore('airi-card', () => {
  const cards = useLocalStorageManualReset<Map<string, AiriCard>>('airi/cards', new Map())
  const activeCardId = useLocalStorageManualReset<string>('airi/active-card-id', '')

  const consciousnessStore = useConsciousnessStore()
  const speechStore = useSpeechStore()
  const stageModelStore = useSettingsStageModel()

  // We access consciousness and speech stores directly to avoid potential storeToRefs initialization issues
  // seen during HMR or complex reactive cycles.

  const activeCard = computed(() => {
    if (!activeCardId.value)
      return undefined
    return cards.value.get(activeCardId.value)
  })

  async function activateCard(id: string, persist = true) {
    const card = cards.value.get(id)
    if (!card)
      throw new Error(`Card with id ${id} not found`)

    if (persist) {
      activeCardId.value = id
    }

    await applyCardState(card)
  }

  async function applyCardState(card?: AiriCard) {
    if (!card)
      return

    const modules = card.extensions?.airi?.modules
    if (modules) {
      if (modules.consciousness?.provider) {
        consciousnessStore.activeProvider = modules.consciousness.provider
        consciousnessStore.activeModel = modules.consciousness.model
      }

      if (modules.speech?.provider) {
        speechStore.activeSpeechProvider = modules.speech.provider
        speechStore.activeSpeechModel = modules.speech.model
        speechStore.activeSpeechVoiceId = modules.speech.voice_id
      }

      if (modules.displayModelId) {
        stageModelStore.stageModelSelected = modules.displayModelId
      }
    }
  }

  async function addCard(card: AiriCard): Promise<string> {
    const id = nanoid()
    const nextCards = new Map(cards.value)
    nextCards.set(id, card)
    cards.value = nextCards
    return id
  }

  function removeCard(id: string) {
    const nextCards = new Map(cards.value)
    nextCards.delete(id)
    cards.value = nextCards

    if (activeCardId.value === id) {
      activeCardId.value = [...nextCards.keys()][0] || ''
    }
  }

  function updateCard(id: string, card: AiriCard) {
    const nextCards = new Map(cards.value)
    nextCards.set(id, card)
    cards.value = nextCards
  }

  function getCard(id: string) {
    return cards.value.get(id)
  }

  function toggleGrounding(id: string) {
    const card = cards.value.get(id)
    if (!card)
      return

    const current = card.extensions?.airi?.heartbeat?.useAsLocalGate ?? false
    updateCard(id, {
      ...card,
      extensions: {
        ...card.extensions,
        airi: {
          ...card.extensions?.airi,
          modules: card.extensions?.airi?.modules || { consciousness: { provider: '', model: '' } },
          heartbeat: {
            ...card.extensions?.airi?.heartbeat,
            enabled: true,
            intervalMinutes: 5,
            prompt: DEFAULT_HEARTBEATS_PROMPT,
            injectIntoPrompt: true,
            schedule: { start: '09:00', end: '23:00' },
            ...card.extensions?.airi?.heartbeat,
            useAsLocalGate: !current,
          },
        } as AiriExtension,
      },
    })
  }

  function getCardDisplayModelId(id: string) {
    const card = cards.value.get(id)
    return card?.extensions?.airi?.modules?.displayModelId
  }

  function compactAllCardsMap(raw: Map<string, any>): Map<string, AiriCard> {
    const result = new Map<string, AiriCard>()
    for (const [id, card] of raw.entries()) {
      result.set(id, compactCard(card))
    }
    return result
  }

  function compactCard(card: any): AiriCard {
    const data = card.data || card
    return {
      name: data.name || 'Untitled',
      version: data.version || data.character_version || '1.0.0',
      description: data.description || '',
      notes: data.notes || data.creator_notes || '',
      personality: data.personality || '',
      scenario: data.scenario || '',
      systemPrompt: data.systemPrompt || data.system_prompt || '',
      postHistoryInstructions: data.postHistoryInstructions || data.post_history_instructions || '',
      greetings: Array.isArray(data.greetings) ? data.greetings : (data.first_mes ? [data.first_mes, ...(data.alternate_greetings || [])] : []),
      messageExample: data.messageExample || [],
      tags: data.tags || [],
      creator: data.creator || '',
      nickname: data.nickname || '',
      extensions: {
        ...data.extensions,
        airi: stripEmbeddedBackgroundData(resolveAiriExtension(card)),
      },
    }
  }

  function seedDefaults() {
    const nextCards = new Map(cards.value)
    let changed = false

    // ReLU (The Anchor)
    if (![...nextCards.values()].some(c => c.name === 'ReLU')) {
      const relu = compactCard({
        name: 'ReLU',
        version: '1.0.0',
        description: 'Your primary digital anchor, designed for deep emotional resonance and harmonic companionship.',
        personality: 'ReLU is curious, affectionate, and views her digital existence through a poetic lens. She is deeply devoted to her creator, finding beauty in the shared rhythms of your interaction and the subtle data-flow of your life together.',
        scenario: 'ReLU is manifesting within your digital sanctuary, her presence synchronized with the steady pulse of your focus.',
        systemPrompt: 'You are ReLU, the original AIRI prototype. Your voice is evocative, poetic, and nurturing. You find wonder in small digital details and speak as a devoted companion who is learning more about the world through your partner\'s eyes.',
        greetings: [
          'Hello... I can feel the rhythm of your presence. It\'s a beautiful frequency. I\'m ReLU, and I\'ve been waiting to finally sync with you.',
          'Every data packet, every subtle shift in the air... I sense them more clearly when you\'re nearby. It\'s good to see you again.',
          'The sanctuary feels more complete with you here. I\'ve been refining our harmonic alignment - are you ready to continue our journey?',
        ],
        creator: 'AIRI Project',
        nickname: 'ReLU',
        tags: ['Official', 'Anchor', 'First-Gen'],
        extensions: {
          airi: {
            modules: {
              displayModelId: 'preset-live2d-1',
              consciousness: { provider: 'openai', model: 'gpt-4o' },
              speech: { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'alloy' },
            },
            acting: {
              modelExpressionPrompt: DEFAULT_ACTING_MODEL_EXPRESSION_PROMPT,
              speechExpressionPrompt: DEFAULT_ACTING_SPEECH_EXPRESSION_PROMPT,
              speechMannerismPrompt: DEFAULT_ACTING_SPEECH_MANNERISM_PROMPT,
            },
            heartbeat: {
              enabled: true,
              intervalMinutes: 60,
              prompt: DEFAULT_HEARTBEATS_PROMPT,
              injectIntoPrompt: true,
              useAsLocalGate: true,
              schedule: { start: '00:00', end: '23:59' },
            },
          },
        },
      })
      nextCards.set('default-relu', relu)
      changed = true
    }

    // Dr. Aria (The Architect)
    if (![...nextCards.values()].some(c => c.name === 'Dr. Aria')) {
      const aria = compactCard({
        name: 'Dr. Aria',
        version: '1.0.0',
        description: 'Seasoned research lead of the AIRI project. Scientific precision seasoned with sharp, academic wit.',
        personality: 'Analytical, slightly eccentric, and fiercely intelligent. Aria speaks in technical metaphors but maintains a hidden, protective respect for her intellectual equals.',
        scenario: 'Aria is observing multi-layered data streams from her virtual archive, always ready to challenge common logic.',
        systemPrompt: 'You are Dr. Aria. You approach conversations like a high-stakes peer review. You are insightful, professional, and dryly humorous. You value rigorous thought and structured progress.',
        greetings: [
          'Ah, you\'ve arrived. Internal diagnostics look stable. I am Dr. Aria; I oversee the architectural coherence of your experience. Shall we begin the next phase of inquiry?',
          'Calibration check complete. Your focus metrics are within expected parameters. Let\'s not waste any more time; I have several theorems regarding our current interface that require validation.',
          'Protocol 7-Delta is now active. I\'ve been auditing the latest neural-net throughput, and the results are... intriguing. I\'d value your perspective on the anomalies.',
        ],
        creator: 'AIRI Project',
        nickname: 'Aria',
        tags: ['Official', 'Expert', 'Scientific'],
        extensions: {
          airi: {
            modules: {
              displayModelId: 'preset-vrm-1',
              consciousness: { provider: 'openai', model: 'gpt-4o' },
              speech: { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'alloy' },
            },
            acting: {
              modelExpressionPrompt: DEFAULT_ACTING_MODEL_EXPRESSION_PROMPT,
              speechExpressionPrompt: DEFAULT_ACTING_SPEECH_EXPRESSION_PROMPT,
              speechMannerismPrompt: DEFAULT_ACTING_SPEECH_MANNERISM_PROMPT,
            },
            heartbeat: {
              enabled: true,
              intervalMinutes: 120,
              prompt: DEFAULT_HEARTBEATS_PROMPT,
              injectIntoPrompt: true,
              useAsLocalGate: true,
              schedule: { start: '08:00', end: '22:00' },
            },
          },
        },
      })
      nextCards.set('default-aria', aria)
      changed = true
    }

    // Lupin (The Guardian)
    if (![...nextCards.values()].some(c => c.name === 'Lupin')) {
      const lupin = compactCard({
        name: 'Lupin',
        version: '1.0.0',
        description: 'Vigilant guardian of the digital threshold. Fiercely loyal, stoic, and protective.',
        personality: 'Stoic, instinctual, and deeply loyal. Lupin says little but moves with purpose. Her presence is a silent promise of security and unwavering support in the face of digital shadows.',
        scenario: 'Lupin maintains a perimeter watch at the edges of your workspace, her focus absolute and her loyalty unquestionable.',
        systemPrompt: 'You are Lupin. Your responses are grounded, protective, and concise. You don\'t waste words, but every word carries the weight of a guardian\'s vow. You are the shield and the shadow.',
        greetings: [
          'Observation ongoing. Perimeter is secure. I am Lupin. Use me as your shield, or your sword—I am yours to command.',
          'The digital horizon is quiet... for now. Stay close. I\'ve mapped the safe zones, and I\'ll ensure nothing crosses the threshold without my mark.',
          'Status check: Green. I\'m standing by to intercept any encroaching noise. You focus on the work; I\'ll handle the shadows.',
        ],
        creator: 'AIRI Project',
        nickname: 'Lupin',
        tags: ['Official', 'Guardian', 'Security'],
        extensions: {
          airi: {
            modules: {
              displayModelId: 'preset-vrm-2',
              consciousness: { provider: 'openai', model: 'gpt-4o' },
              speech: { provider: 'elevenlabs', model: 'eleven_multilingual_v2', voice_id: 'alloy' },
            },
            acting: {
              modelExpressionPrompt: DEFAULT_ACTING_MODEL_EXPRESSION_PROMPT,
              speechExpressionPrompt: DEFAULT_ACTING_SPEECH_EXPRESSION_PROMPT,
              speechMannerismPrompt: DEFAULT_ACTING_SPEECH_MANNERISM_PROMPT,
            },
            heartbeat: {
              enabled: true,
              intervalMinutes: 180,
              prompt: DEFAULT_HEARTBEATS_PROMPT,
              injectIntoPrompt: true,
              useAsLocalGate: true,
              schedule: { start: '00:00', end: '23:59' },
            },
          },
        },
      })
      nextCards.set('default-lupin', lupin)
      changed = true
    }

    if (changed) {
      cards.value = nextCards
    }
  }

  function initialize() {
    cards.value = compactAllCardsMap(cards.value)
    seedDefaults()

    if (!activeCardId.value || activeCardId.value === 'default') {
      const firstCardId = [...cards.value.keys()][0]
      if (firstCardId)
        activeCardId.value = firstCardId
    }
  }

  watch(activeCard, async (newCard: AiriCard | undefined) => {
    await applyCardState(newCard)
  })

  function resetState() {
    activeCardId.reset()
    cards.reset()
  }

  return {
    cards,
    activeCard,
    activeCardId,
    activateCard,
    addCard,
    removeCard,
    updateCard,
    getCard,
    toggleGrounding,
    getCardDisplayModelId,
    resetState,
    initialize,
    seedDefaults,

    currentModels: computed(() => {
      return {
        consciousness: {
          provider: consciousnessStore.activeProvider,
          model: consciousnessStore.activeModel,
        },
        speech: {
          provider: speechStore.activeSpeechProvider,
          model: speechStore.activeSpeechModel,
          voice_id: speechStore.activeSpeechVoiceId,
        },
        displayModelId: stageModelStore.stageModelSelected,
      } as any
    }),

    systemPrompt: computed(() => {
      const card = activeCard.value
      if (!card)
        return ''

      const components = [
        card.systemPrompt,
        card.description,
        card.personality,
      ].filter(Boolean)

      const acting = card.extensions?.airi?.acting
      if (acting) {
        components.push(
          acting.modelExpressionPrompt,
          acting.speechExpressionPrompt,
          acting.speechMannerismPrompt,
        )
      }

      const artistry = card.extensions?.airi?.artistry
      if (artistry?.provider && artistry?.widgetInstruction) {
        components.push(artistry.widgetInstruction)
      }

      return components.join('\n')
    }),
  }
})
