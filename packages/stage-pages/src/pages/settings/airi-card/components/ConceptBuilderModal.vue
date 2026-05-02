<script setup lang="ts">
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Button, FieldInput, Select } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, ref, watch } from 'vue'

interface ConceptData {
  description: string
  prompt: string
  isBase?: boolean
  artistry?: {
    provider?: string
    model?: string
    options?: any
  }
  manifestation?: {
    modelId?: string
    mood?: string
  }
  speech?: {
    provider?: string
    model?: string
    voice_id?: string
  }
}

interface Props {
  modelValue: boolean
  conceptId?: string
  initialData?: ConceptData
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', payload: { id: string, data: ConceptData }): void
}>()

const artistryStore = useArtistryStore()
const displayModelsStore = useDisplayModelsStore()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()

const { activeSpeechProvider, activeSpeechModel, activeSpeechVoiceId } = storeToRefs(speechStore)

const activeTab = ref('identity')
const id = ref('')
const description = ref('')
const prompt = ref('')

// Concept Type
const isBase = ref(false)

// Artistry Overrides
const selectedProvider = ref<string>('inherit')
const selectedModel = ref<string>('')
const selectedOptionsStr = ref<string>('{\n  \n}')

// Manifestation Overrides
const selectedModelId = ref<string>('inherit')
const selectedMood = ref<string>('')

// Speech Overrides
const selectedSpeechProvider = ref<string>('inherit')
const selectedSpeechModel = ref<string>('')
const selectedSpeechVoiceId = ref<string>('')

// Initialize when modal opens or props change
watch(() => [props.modelValue, props.conceptId, props.initialData], () => {
  if (props.modelValue) {
    activeTab.value = 'identity'
    id.value = props.conceptId || ''
    description.value = props.initialData?.description || ''
    prompt.value = props.initialData?.prompt || ''

    isBase.value = props.initialData?.isBase ?? false

    selectedProvider.value = props.initialData?.artistry?.provider || 'inherit'
    selectedModel.value = props.initialData?.artistry?.model || ''
    selectedOptionsStr.value = props.initialData?.artistry?.options
      ? JSON.stringify(props.initialData.artistry.options, null, 2)
      : '{\n  \n}'

    selectedModelId.value = props.initialData?.manifestation?.modelId || 'inherit'
    selectedMood.value = props.initialData?.manifestation?.mood || ''

    selectedSpeechProvider.value = props.initialData?.speech?.provider || 'inherit'
    selectedSpeechModel.value = props.initialData?.speech?.model || ''
    selectedSpeechVoiceId.value = props.initialData?.speech?.voice_id || ''
  }
}, { immediate: true })

const providerOptions = [
  { value: 'inherit', label: 'Inherit Global' },
  { value: 'replicate', label: 'Replicate' },
  { value: 'comfyui', label: 'ComfyUI' },
  { value: 'none', label: 'Disable Artistry' },
]

const displayModelOptions = computed(() => [
  { value: 'inherit', label: 'Inherit Default' },
  ...displayModelsStore.displayModels.map(m => ({
    value: m.id,
    label: m.name,
  })),
])

const speechProviderOptions = computed(() => [
  { value: 'inherit', label: 'Inherit Global' },
  { value: 'none', label: 'Disable Speech' },
  ...providersStore.configuredSpeechProvidersMetadata.map(p => ({
    value: p.id,
    label: p.localizedName || p.name,
  })),
])

const speechModelOptions = computed(() => {
  const provider = selectedSpeechProvider.value === 'inherit' ? activeSpeechProvider.value : selectedSpeechProvider.value
  if (!provider || provider === 'none')
    return []
  return providersStore.getModelsForProvider(provider).map(m => ({
    value: m.id,
    label: m.name || m.id,
  }))
})

const speechVoiceOptions = computed(() => {
  const provider = selectedSpeechProvider.value === 'inherit' ? activeSpeechProvider.value : selectedSpeechProvider.value
  if (!provider || provider === 'none')
    return []
  return speechStore.getVoicesForProvider(provider).map(v => ({
    value: v.id,
    label: v.name || v.id,
  }))
})

// Watchers for speech provider changes
watch(selectedSpeechProvider, async (newProvider) => {
  const provider = newProvider === 'inherit' ? activeSpeechProvider.value : newProvider
  if (provider && provider !== 'none') {
    await speechStore.loadVoicesForProvider(provider)
    const metadata = providersStore.getProviderMetadata(provider)
    if (metadata?.capabilities.listModels) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }
})

function handleSave() {
  if (!id.value.trim())
    return

  let options
  try {
    options = selectedOptionsStr.value.trim() ? JSON.parse(selectedOptionsStr.value) : undefined
  }
  catch (e) {
    // Ignore invalid JSON for now
  }

  emit('save', {
    id: id.value.trim(),
    data: {
      description: description.value.trim(),
      prompt: prompt.value.trim(),
      isBase: isBase.value,
      artistry: selectedProvider.value !== 'inherit'
        ? {
            provider: selectedProvider.value,
            model: selectedModel.value.trim(),
            options,
          }
        : undefined,
      manifestation: selectedModelId.value !== 'inherit'
        ? {
            modelId: selectedModelId.value,
            mood: selectedMood.value.trim(),
          }
        : undefined,
      speech: selectedSpeechProvider.value !== 'inherit'
        ? {
            provider: selectedSpeechProvider.value,
            model: selectedSpeechModel.value.trim(),
            voice_id: selectedSpeechVoiceId.value.trim(),
          }
        : undefined,
    },
  })
  emit('update:modelValue', false)
}
</script>

<template>
  <DialogRoot :open="modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-110 bg-black/60 backdrop-blur-md data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent class="fixed left-1/2 top-1/2 z-110 m-0 max-h-[90vh] max-w-xl w-[90vw] flex flex-col overflow-hidden border border-neutral-200 rounded-2xl bg-white shadow-2xl -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:border-neutral-700 dark:bg-neutral-900">
        <!-- Modal Header -->
        <div class="border-b border-neutral-100 p-6 pb-4 dark:border-neutral-800 sm:p-8">
          <div class="flex items-center gap-3">
            <div class="rounded-xl bg-primary-500/10 p-2 text-primary-500 shadow-primary-500/10 shadow-sm">
              <div class="i-solar:magic-stick-3-bold-duotone text-2xl" />
            </div>
            <div>
              <DialogTitle class="text-xl text-neutral-800 font-bold dark:text-neutral-100">
                {{ conceptId ? 'Concept Studio' : 'New Concept' }}
              </DialogTitle>
              <code v-if="conceptId" class="rounded bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 font-mono dark:bg-black/40">
                ID: {{ conceptId }}
              </code>
            </div>
          </div>

          <!-- Tab Navigation -->
          <div class="mt-6 flex gap-1">
            <button
              v-for="t in ['identity', 'artistry', 'manifestation', 'speech']"
              :key="t"
              class="rounded-lg px-4 py-2 text-xs font-bold transition-all"
              :class="activeTab === t ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/20' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'"
              @click="activeTab = t"
            >
              {{ t.charAt(0).toUpperCase() + t.slice(1) }}
            </button>
          </div>
        </div>

        <!-- Modal Content -->
        <div class="flex-1 overflow-y-auto p-6 sm:p-8">
          <!-- Identity Tab -->
          <div v-if="activeTab === 'identity'" class="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <FieldInput
              v-model="id"
              label="Concept ID"
              placeholder="e.g. silver_performance"
              description="A unique identifier the Director will use to trigger this state."
              :disabled="!!conceptId"
            />

            <FieldInput
              v-model="description"
              label="Narrative Description"
              placeholder="When should this be used?"
              description="Helps the Director understand the context for this concept."
              :single-line="false"
              :rows="3"
            />

            <FieldInput
              v-model="prompt"
              label="Prompt Snippet"
              placeholder=", (iridescent silver tape:1.4), high contrast"
              description="Keywords or modifiers to inject into the final image prompt."
              :single-line="false"
              :rows="3"
            />

            <!-- Base vs Layer toggle -->
            <div class="flex items-center justify-between border border-neutral-200 rounded-xl bg-neutral-50/50 p-4 dark:border-neutral-700 dark:bg-black/20">
              <div>
                <span class="text-sm text-neutral-700 font-bold dark:text-neutral-300">Base Concept (Exclusionary)</span>
                <p class="mt-0.5 text-[10px] text-neutral-500 leading-relaxed">
                  When active, clears the stack first. Use for outfits, character swaps, or any state that can't overlap.
                </p>
              </div>
              <button
                :class="[
                  'relative h-6 w-11 rounded-full transition-colors duration-200',
                  isBase ? 'bg-primary-500' : 'bg-neutral-300 dark:bg-neutral-600',
                ]"
                @click="isBase = !isBase"
              >
                <span
                  :class="[
                    'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                    isBase ? 'translate-x-5' : 'translate-x-0',
                  ]"
                />
              </button>
            </div>
          </div>

          <!-- Artistry Tab -->
          <div v-if="activeTab === 'artistry'" class="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div class="flex flex-col gap-2">
              <label class="text-sm text-neutral-700 font-bold dark:text-neutral-300">Generation Provider</label>
              <Select v-model="selectedProvider" :options="providerOptions" />
              <p class="text-[10px] text-neutral-500 italic">
                The visual engine used for this concept.
              </p>
            </div>

            <div v-if="selectedProvider !== 'inherit' && selectedProvider !== 'none'" class="border-t border-neutral-100 pt-4 space-y-6 dark:border-neutral-800">
              <div v-if="selectedProvider === 'comfyui'" class="flex flex-col gap-2">
                <label class="text-sm text-neutral-700 font-bold dark:text-neutral-300">Select Workflow</label>
                <Select
                  v-model="selectedModel"
                  :options="artistryStore.comfyuiSavedWorkflows.map(w => ({ value: w.id, label: w.name || w.id }))"
                />
                <p class="text-[10px] text-neutral-500 italic">
                  Choose from your registered ComfyUI templates.
                </p>
              </div>

              <FieldInput
                v-else
                v-model="selectedModel"
                label="Model ID"
                placeholder="e.g. black-forest-labs/flux-schnell"
              />

              <FieldInput
                v-model="selectedOptionsStr"
                label="Advanced Options (JSON)"
                description="Custom parameters for the specific provider."
                :single-line="false"
                :rows="6"
              />
            </div>
          </div>

          <!-- Manifestation Tab -->
          <div v-if="activeTab === 'manifestation'" class="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div class="flex flex-col gap-2">
              <label class="text-sm text-neutral-700 font-bold dark:text-neutral-300">Physical Model Override</label>
              <Select v-model="selectedModelId" :options="displayModelOptions" />
              <p class="text-[10px] text-neutral-500 italic">
                Forces a base model swap (Live2D/VRM) when this concept is active.
              </p>
            </div>

            <div class="border-t border-neutral-100 pt-4 dark:border-neutral-800">
              <FieldInput
                v-model="selectedMood"
                label="Baseline Mood / Expression"
                placeholder="e.g. happy, thinking, neutral"
                description="Forces a specific emotional state when active."
              />
            </div>
          </div>

          <!-- Speech Tab -->
          <div v-if="activeTab === 'speech'" class="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            <div class="flex flex-col gap-2">
              <label class="text-sm text-neutral-700 font-bold dark:text-neutral-300">Speech Provider Override</label>
              <Select v-model="selectedSpeechProvider" :options="speechProviderOptions" />
              <p class="text-[10px] text-neutral-500 italic">
                Forces a specific TTS provider for this concept.
              </p>
            </div>

            <div v-if="selectedSpeechProvider !== 'none' && (selectedSpeechProvider !== 'inherit' || activeSpeechProvider)" class="border-t border-neutral-100 pt-4 space-y-6 dark:border-neutral-800">
              <div class="flex flex-col gap-2">
                <label class="text-sm text-neutral-700 font-bold dark:text-neutral-300">Vocal Model</label>
                <Select v-model="selectedSpeechModel" :options="speechModelOptions" />
                <p class="text-[10px] text-neutral-500 italic">
                  Choose the TTS engine version.
                </p>
              </div>

              <div class="flex flex-col gap-2">
                <label class="text-sm text-neutral-700 font-bold dark:text-neutral-300">Persona Voice</label>
                <Select v-model="selectedSpeechVoiceId" :options="speechVoiceOptions" />
                <p class="text-[10px] text-neutral-500 italic">
                  The unique voice assigned to this concept/actress.
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex items-center justify-end gap-3 border-t border-neutral-100 bg-neutral-50/50 p-6 pt-4 dark:border-neutral-800 dark:bg-black/20 sm:p-8">
          <Button
            variant="secondary"
            label="Cancel"
            @click="emit('update:modelValue', false)"
          />
          <Button
            variant="primary"
            :label="conceptId ? 'Save Changes' : 'Create Concept'"
            icon="i-solar:check-read-linear"
            :disabled="!id.trim()"
            @click="handleSave"
          />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
