<script setup lang="ts">
import type { ProviderMetadata } from '../../../../stores/providers'
import type {
  OnboardingStep,
  OnboardingStepGuard,
  OnboardingStepNextHandler,
  OnboardingStepPrevHandler,
  ProviderConfigData,
} from './types'

import { storeToRefs } from 'pinia'
import { computed, nextTick, ref } from 'vue'

import StepCharacterSelection from './step-character-selection.vue'
import StepEasySetup from './step-easy-setup.vue'
import StepModeSelection from './step-mode-selection.vue'
import StepModelSelection from './step-model-selection.vue'
import StepProviderConfiguration from './step-provider-configuration.vue'
import StepProviderSelection from './step-provider-selection.vue'
import StepWelcome from './step-welcome.vue'

import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../../../stores/modules/consciousness'
import { useHearingStore } from '../../../../stores/modules/hearing'
import { useSpeechStore } from '../../../../stores/modules/speech'
import { useProvidersStore } from '../../../../stores/providers'

interface Emits {
  (e: 'configured'): void
  (e: 'skipped'): void
}

const { extraSteps = [] } = defineProps<{
  extraSteps?: OnboardingStep[]
}>()
const emit = defineEmits<Emits>()
const step = ref(0)
const direction = ref<'next' | 'previous'>('next')
const pendingProviderConfig = ref<ProviderConfigData | null>(null)
const onboardingMode = ref<'easy' | 'custom'>('easy')

const providersStore = useProvidersStore()
const { providers, allChatProvidersMetadata, addedProviders } = storeToRefs(providersStore)
const consciousnessStore = useConsciousnessStore()
const speechStore = useSpeechStore()
const hearingStore = useHearingStore()
const airiCardStore = useAiriCardStore()

const {
  activeProvider,
} = storeToRefs(consciousnessStore)

async function configureEasyMode(data: any) {
  if (!data)
    return

  // 1. Configure Qwen Portal (Consciousness)
  if (data.qwen) {
    providers.value['qwen-portal'] = {
      apiKey: data.qwen.access_token,
      refreshToken: data.qwen.refresh_token,
      expiresAt: data.qwen.expires_at,
    }
    addedProviders.value['qwen-portal'] = true
    consciousnessStore.activeProvider = 'qwen-portal'
    // Default to a sensible Qwen model if known, or let it load
    consciousnessStore.activeModel = 'coder-model'
  }

  // 2. Configure Deepgram (Speech & Hearing)
  if (data.deepgram) {
    const dgKey = data.deepgram.trim()
    providers.value['deepgram-tts'] = { apiKey: dgKey }
    providers.value['deepgram-transcription'] = { apiKey: dgKey }
    addedProviders.value['deepgram-tts'] = true
    addedProviders.value['deepgram-transcription'] = true

    // Set Active Speech
    speechStore.activeSpeechProvider = 'deepgram-tts'
    speechStore.activeSpeechModel = 'aura-2'
    speechStore.activeSpeechVoiceId = 'aura-asteria-en'

    // Set Active Hearing
    hearingStore.activeTranscriptionProvider = 'deepgram-transcription'
    hearingStore.activeTranscriptionModel = 'nova-3'
  }

  // Save changes
  await nextTick()
}

const availableProviders = computed(() => {
  const preferredOrder = ['openai', 'anthropic', 'amazon-bedrock', 'google-generative-ai', 'groq', 'nvidia', 'openrouter-ai', 'ollama', 'deepseek', 'player2', 'openai-compatible']
  const preferredProviders = allChatProvidersMetadata.value
    .filter(provider => preferredOrder.includes(provider.id))
    .sort((a, b) => preferredOrder.indexOf(a.id) - preferredOrder.indexOf(b.id))
  const remainingProviders = allChatProvidersMetadata.value
    .filter(provider => !preferredOrder.includes(provider.id))
    .sort((a, b) => (a.localizedName || a.name || a.id).localeCompare(b.localizedName || b.name || b.id))

  return [...preferredProviders, ...remainingProviders]
})

// Selected provider and form data
const selectedProviderId = ref('')
const selectedCharacterId = ref('default')

// Computed selected provider
const selectedProvider = computed(() => {
  return allChatProvidersMetadata.value.find(p => p.id === selectedProviderId.value) || null
})

// Reset validation state when provider changes
function selectProvider(provider: ProviderMetadata) {
  selectedProviderId.value = provider.id
}

const requestPreviousStep: OnboardingStepPrevHandler = () => {
  return navigatePrevious()
}

const requestNextStep: OnboardingStepNextHandler = async (configData?: ProviderConfigData | any) => {
  pendingProviderConfig.value = configData ?? null
  await navigateNext(configData)
}

async function saveProviderConfiguration(data: ProviderConfigData) {
  if (!selectedProvider.value)
    return

  const config: Record<string, unknown> = {}

  if (data.apiKey)
    config.apiKey = data.apiKey.trim()
  if (data.baseUrl)
    config.baseUrl = data.baseUrl.trim()
  if (data.accountId)
    config.accountId = data.accountId.trim()
  if (data.accessKeyId)
    config.accessKeyId = data.accessKeyId.trim()
  if (data.secretAccessKey)
    config.secretAccessKey = data.secretAccessKey.trim()
  if (data.region)
    config.region = data.region.trim()

  providers.value[selectedProvider.value.id] = {
    ...providers.value[selectedProvider.value.id],
    ...config,
  }

  activeProvider.value = selectedProvider.value.id
  await nextTick()

  try {
    await consciousnessStore.loadModelsForProvider(selectedProvider.value.id)
  }
  catch (err) {
    console.error('error', err)
  }
}

async function handleSave() {
  emit('configured')
}

const allSteps = computed<OnboardingStep[]>(() => {
  const steps: OnboardingStep[] = [
    {
      id: 'welcome',
      component: StepWelcome,
    },
    {
      id: 'mode-selection',
      component: StepModeSelection,
      props: () => ({
        onSelectMode: (mode: 'easy' | 'custom') => {
          onboardingMode.value = mode
        },
      }),
    },
  ]

  if (onboardingMode.value === 'easy') {
    steps.push({
      id: 'easy-setup',
      component: StepEasySetup,
      beforeNext: async (data: any) => {
        await configureEasyMode(data)
        return true
      },
    })
  }
  else if (onboardingMode.value === 'custom') {
    steps.push(
      {
        id: 'provider-selection',
        component: StepProviderSelection,
        props: () => ({
          selectedProviderId: selectedProviderId.value,
          availableProviders: availableProviders.value,
          onSelectProvider: selectProvider,
        }),
      },
      {
        id: 'provider-configuration',
        component: StepProviderConfiguration,
        props: () => ({
          selectedProviderId: selectedProviderId.value,
          selectedProvider: selectedProvider.value,
        }),
        beforeNext: async () => {
          if (!pendingProviderConfig.value)
            return false

          await saveProviderConfiguration(pendingProviderConfig.value)
          pendingProviderConfig.value = null
          return true
        },
      },
      ...extraSteps.map(s => ({
        ...s,
        props: () => ({
          ...s.props?.(),
        }),
      })),
      {
        id: 'model-selection',
        component: StepModelSelection,
      },
    )
  }

  steps.push({
    id: 'character-selection',
    component: StepCharacterSelection,
    props: () => ({
      selectedCharacterId: selectedCharacterId.value,
      onSelectCharacter: (id: string) => {
        selectedCharacterId.value = id
      },
    }),
    beforeNext: async () => {
      await airiCardStore.seedDefaults(selectedCharacterId.value)
      await airiCardStore.activateCard(selectedCharacterId.value)
      return true
    },
  })

  return steps
})

const currentStep = computed(() => allSteps.value[step.value] ?? null)
const isLastStep = computed(() => step.value === allSteps.value.length - 1)
const currentStepProps = computed(() => currentStep.value?.props?.() ?? {})

async function canPassGuard(guard?: OnboardingStepGuard, data?: any) {
  if (!guard)
    return true

  return await guard(data)
}

async function navigateNext(data?: any) {
  if (!currentStep.value)
    return

  if (!(await canPassGuard(currentStep.value.beforeNext, data)))
    return

  if (isLastStep.value) {
    await handleSave()
    return
  }

  direction.value = 'next'
  step.value++
}

async function navigatePrevious() {
  if (!currentStep.value || step.value <= 0)
    return

  if (!(await canPassGuard(currentStep.value.beforePrev)))
    return

  direction.value = 'previous'
  step.value--
}
</script>

<template>
  <div class="onboarding-step-container" h-full w-full>
    <Transition :name="direction === 'next' ? 'slide-next' : 'slide-prev'" mode="out-in">
      <component
        :is="currentStep.component"
        v-if="currentStep"
        :key="currentStep.id"
        v-bind="currentStepProps"
        :on-next="requestNextStep"
        :on-previous="requestPreviousStep"
      />
    </Transition>
  </div>
</template>

<style scoped>
.onboarding-step-container {
  overflow-x: hidden;
}

.slide-next-enter-active,
.slide-next-leave-active,
.slide-prev-enter-active,
.slide-prev-leave-active {
  will-change: transform, opacity;
}

.slide-next-enter-active {
  animation: onboarding-slide-next-in 0.2s ease-in-out both;
}

.slide-next-leave-active {
  animation: onboarding-slide-next-out 0.2s ease-in-out both;
}

.slide-prev-enter-active {
  animation: onboarding-slide-prev-in 0.2s ease-in-out both;
}

.slide-prev-leave-active {
  animation: onboarding-slide-prev-out 0.2s ease-in-out both;
}

@keyframes onboarding-slide-next-in {
  from {
    transform: translateX(2rem);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes onboarding-slide-next-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }

  to {
    transform: translateX(-2rem);
    opacity: 0;
  }
}

@keyframes onboarding-slide-prev-in {
  from {
    transform: translateX(-2rem);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes onboarding-slide-prev-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }

  to {
    transform: translateX(2rem);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .slide-next-enter-active,
  .slide-next-leave-active,
  .slide-prev-enter-active,
  .slide-prev-leave-active {
    animation-duration: 1ms;
  }
}
</style>
