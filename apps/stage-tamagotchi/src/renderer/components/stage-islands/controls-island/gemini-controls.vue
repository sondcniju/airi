<script setup lang="ts">
import { useLiveSessionStore } from '@proj-airi/stage-ui/stores/modules/live-session'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { t } = useI18n()
const liveSessionStore = useLiveSessionStore()
const visionStore = useVisionStore()
const settingsStore = useSettings()

const { estimatedCost } = storeToRefs(liveSessionStore)
const { isWitnessEnabled, status: visionStatus } = storeToRefs(visionStore)
const { controlsIslandIconSize } = storeToRefs(settingsStore)

// Grouped classes for icon / border / padding and combined style class
const adjustStyleClasses = computed(() => {
  let isLarge: boolean

  // Determine size based on setting
  switch (controlsIslandIconSize.value) {
    case 'large':
      isLarge = true
      break
    case 'small':
      isLarge = false
      break
    default:
      isLarge = true
      break
  }

  const icon = isLarge ? 'size-5' : 'size-3.5'
  const border = isLarge ? 'border-2' : 'border-0'
  const padding = isLarge ? 'p-2' : 'p-1'
  return { icon, border, padding, button: `${border} ${padding}` }
})

const formattedCost = computed(() => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
  }).format(estimatedCost?.value ?? 0)
})

// === Functional Handlers ===
function handleWitnessToggle() {
  visionStore.toggleWitness()
}
function handleCaptureNow() {
  visionStore.heartbeat({ force: true })
  emit('close')
}
</script>

<template>
  <div
    class="min-w-max w-auto flex flex-col gap-1 border-1 border-neutral-200 rounded-2xl bg-neutral-100/80 p-2 shadow-2xl backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/80"
  >
    <!-- 3x3 Modular Grid -->
    <div class="grid grid-cols-3 gap-2">
      <!-- Row 1: Vision (ENABLED) -->
      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" @click="handleWitnessToggle">
          <div
            :class="[
              isWitnessEnabled ? 'i-solar:eye-bold-duotone' : 'i-solar:eye-outline',
              adjustStyleClasses.icon,
              isWitnessEnabled ? 'text-amber-500' : 'text-neutral-400',
            ]"
          />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.vision-witness') }}: {{ isWitnessEnabled ? 'ON' : 'OFF' }}
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" @click="handleCaptureNow">
          <div
            :class="[
              visionStatus === 'capturing' ? 'i-solar:camera-bold-duotone animate-pulse' : 'i-solar:camera-outline',
              adjustStyleClasses.icon,
              visionStatus === 'capturing' ? 'text-purple-500' : 'text-neutral-400',
            ]"
          />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.capture-now') }}
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" class="pointer-events-none opacity-20 grayscale">
          <div i-solar:pulse-2-outline :class="adjustStyleClasses.icon" text="neutral-400" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.pulse-rate') }} (Planned)
        </template>
      </ControlButtonTooltip>

      <!-- Row 2: (DISABLED) -->
      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" class="pointer-events-none opacity-20 grayscale">
          <div i-solar:microphone-outline :class="adjustStyleClasses.icon" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.live-voice') }} (Planned)
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" class="pointer-events-none opacity-20 grayscale">
          <div i-solar:soundwave-outline :class="adjustStyleClasses.icon" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.output-mode') }} (Planned)
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" class="pointer-events-none opacity-20 grayscale">
          <div i-solar:globus-outline :class="adjustStyleClasses.icon" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.grounding') }} (Planned)
        </template>
      </ControlButtonTooltip>

      <!-- Row 3: (DISABLED) -->
      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" class="pointer-events-none opacity-20 grayscale">
          <div i-solar:clock-circle-outline :class="adjustStyleClasses.icon" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.respect-schedule') }} (Planned)
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip>
        <ControlButton :button-style="adjustStyleClasses.button" class="pointer-events-none opacity-20 grayscale">
          <div i-solar:user-speak-outline :class="adjustStyleClasses.icon" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.cycle-voice') }} (Planned)
        </template>
      </ControlButtonTooltip>

      <ControlButtonTooltip side="right">
        <ControlButton :button-style="adjustStyleClasses.button" class="pointer-events-none opacity-20 grayscale">
          <div i-solar:settings-minimalistic-outline :class="adjustStyleClasses.icon" />
        </ControlButton>
        <template #tooltip>
          {{ t('tamagotchi.stage.controls-island.open-settings') }} (Planned)
        </template>
      </ControlButtonTooltip>
    </div>

    <!-- Usage Strip (ENABLED) -->
    <div
      class="mt-1 flex items-center justify-between border-t border-neutral-200 border-solid px-1 pt-2 dark:border-neutral-800"
    >
      <span class="text-[8px] text-neutral-500 font-bold tracking-wider uppercase opacity-60">
        {{ t('tamagotchi.stage.controls-island.est-cost') }}
      </span>
      <span class="text-[10px] text-neutral-600 font-mono dark:text-neutral-400">
        {{ formattedCost }}
      </span>
    </div>
  </div>
</template>
