import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useProvidersStore } from '../providers'

export const useVisionStore = defineStore('vision', () => {
  const providersStore = useProvidersStore()

  // State
  const activeProvider = useLocalStorageManualReset<string>('settings/vision/active-provider', '')
  const activeModel = useLocalStorageManualReset<string>('settings/vision/active-model', '')
  const contextWindow = useLocalStorageManualReset<number>('settings/vision/context-window', 1) // Number of images to include in context
  const promptShim = useLocalStorageManualReset<string>(
    'settings/vision/prompt-shim',
    'You are currently acting as a vision-capable stand-in for the main character. Keep your responses natural, in-character, and avoid any meta-commentary about "analyzing" or "describing" the image for the user. Just react to what you see as the character would.',
  )

  // Witness (Proactive Ambient Vision)
  const isWitnessEnabled = useLocalStorageManualReset<boolean>('settings/vision/witness-enabled', false)
  const witnessIntervalMinutes = useLocalStorageManualReset<number>('settings/vision/witness-interval', 5)
  const witnessPrompt = useLocalStorageManualReset<string>(
    'settings/vision/witness-prompt',
    'Carefully observe the user\'s screen and describe any interesting or relevant details you see, focusing on things that might spark a conversation or help you understand the user\'s current context better. Stay in character.',
  )
  const lastWitnessTime = ref<number>(0)
  const lastWitnessAnalysis = ref<string>('')

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.getProviderMetadata(activeProvider.value)?.capabilities.listModels !== undefined
  })

  const providerModels = computed(() => {
    return providersStore.getModelsForProvider(activeProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isLoadingModels[activeProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeProvider.value] || null
  })

  function resetModelSelection() {
    activeModel.reset()
  }

  async function loadModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  async function getModelsForProvider(provider: string) {
    if (provider && providersStore.getProviderMetadata(provider)?.capabilities.listModels !== undefined) {
      return providersStore.getModelsForProvider(provider)
    }

    return []
  }

  const configured = computed(() => {
    return !!activeProvider.value && !!activeModel.value
  })

  function resetState() {
    activeProvider.reset()
    resetModelSelection()
    contextWindow.reset()
  }

  return {
    // State
    configured,
    activeProvider,
    activeModel,
    contextWindow,
    promptShim,

    // Witness
    isWitnessEnabled,
    witnessIntervalMinutes,
    witnessPrompt,
    lastWitnessTime,
    lastWitnessAnalysis,

    // Computed
    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,

    // Actions
    resetModelSelection,
    loadModelsForProvider,
    getModelsForProvider,
    resetState,
  }
})
