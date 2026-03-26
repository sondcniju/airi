<script setup lang="ts">
import { useCustomVrmAnimationsStore, useModelStore } from '@proj-airi/stage-ui-three'
import { Button, Callout, Checkbox, Select, SelectTab } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import VRMExpressions from './vrm-expressions.vue'

import { useVHackStore } from '../../../../stores/vhack'
import { Container, PropertyColor, PropertyNumber } from '../../../data-pane'
import { ColorPalette } from '../../../widgets'

defineProps<{
  palette: string[]
}>()

defineEmits<{
  (e: 'extractColorsFromModel'): void
}>()

const { t } = useI18n()

const modelStore = useModelStore()
const vhackStore = useVHackStore()
const customVrmAnimationsStore = useCustomVrmAnimationsStore()
const {
  modelSize,
  modelOffset,
  cameraFOV,
  modelRotationY,
  cameraDistance,
  trackingMode,

  directionalLightRotation,
  directionalLightIntensity,
  directionalLightColor,

  ambientLightIntensity,
  ambientLightColor,

  hemisphereLightIntensity,
  hemisphereSkyColor,
  hemisphereGroundColor,

  envSelect,
  skyBoxIntensity,
  vrmIdleAnimation,
  vrmIdleCycleEnabled,
} = storeToRefs(modelStore)
const { animationOptions } = storeToRefs(customVrmAnimationsStore)

// NOTICE: sceneMutationLocked was removed upstream; hardcoded to false.
const sceneMutationLocked = computed(() => false)
const trackingOptions = computed<{
  value: 'camera' | 'mouse' | 'none'
  label: string
  class: string
}[]>(() => [
  { value: 'camera', label: t('settings.vrm.scale-and-position.options.option.camera'), class: 'col-start-3' },
  { value: 'mouse', label: t('settings.vrm.scale-and-position.options.option.mouse'), class: 'col-start-4' },
  { value: 'none', label: t('settings.vrm.scale-and-position.options.option.disabled'), class: 'col-start-5' },
])

const activeTab = ref<'placement' | 'lighting'>('placement')

const vrmTabs = computed(() => [
  { label: 'Placement', value: 'placement', icon: 'i-solar:square-academic-cap-bold-duotone' },
  { label: 'Lighting', value: 'lighting', icon: 'i-solar:lightbulb-bold-duotone' },
])

const activeCharacterTab = ref<'expressions' | 'animations'>('expressions')
const characterTabs = computed(() => [
  { label: 'Expressions', value: 'expressions', icon: 'i-solar:smile-circle-bold-duotone' },
  { label: 'Animations', value: 'animations', icon: 'i-solar:play-bold-duotone' },
])

// switch between hemisphere light and sky box
const settingsLockClass = computed(() => {
  return sceneMutationLocked.value ? ['pointer-events-none', 'opacity-60'] : []
})

const envOptions = computed(() => [
  {
    value: 'hemisphere',
    label: 'Hemisphere',
    icon: envSelect.value === 'hemisphere'
      ? 'i-solar:forbidden-circle-bold rotate-45'
      : 'i-solar:forbidden-circle-linear rotate-45',
  },
  {
    value: 'skyBox',
    label: 'SkyBox',
    icon: envSelect.value === 'skyBox'
      ? 'i-solar:gallery-circle-bold'
      : 'i-solar:gallery-circle-linear',
  },
])
</script>

<template>
  <div flex="~ col gap-4 w-full">
    <!-- === Character Customizations === -->
    <Container
      title="Character Customizations"
      icon="i-solar:user-bold-duotone"
      :expanded="true"
      :class="[
        'rounded-xl',
        'bg-white/80  dark:bg-black/75',
        'backdrop-blur-lg',
      ]"
    >
      <div class="mb-4 px-2 pt-2">
        <SelectTab v-model="activeCharacterTab" :options="characterTabs" size="sm" />
      </div>

      <div :class="settingsLockClass">
        <!-- === Expressions Tab === -->
        <div v-if="activeCharacterTab === 'expressions'" flex="~ col gap-4" p-2>
          <VRMExpressions />
        </div>

        <!-- === Animations Tab === -->
        <div v-if="activeCharacterTab === 'animations'" flex="~ col gap-4" p-2>
          <div grid="~ cols-5 gap-y-2 gap-x-1" items-center>
            <div class="text-xs text-neutral-500 font-medium dark:text-neutral-400">
              {{ t('settings.vrm.idle-animation.title') }}
            </div>
            <div />
            <div grid-col-span-3>
              <Select
                v-model="vrmIdleAnimation"
                :options="animationOptions"
                :disabled="sceneMutationLocked"
                class="w-full"
              />
            </div>

            <div class="text-xs text-neutral-500 font-medium dark:text-neutral-400">
              Random Cycle
            </div>
            <div />
            <div grid-col-span-3 flex items-center>
              <Checkbox v-model="vrmIdleCycleEnabled" />
              <span class="ml-2 text-[10px] text-neutral-400 italic">Automatically cycle through idle animations</span>
            </div>
          </div>
        </div>
      </div>
    </Container>

    <Container
      :title="t('settings.pages.models.sections.section.scene')"
      icon="i-solar:people-nearby-bold-duotone"
      :class="[
        'rounded-xl',
        'bg-white/80  dark:bg-black/75',
        'backdrop-blur-lg',
      ]"
    >
      <ColorPalette class="mb-4 mt-2" :colors="palette.map(hex => ({ hex, name: hex }))" mx-auto />

      <!-- Tab Selection -->
      <div class="mb-4 px-2">
        <SelectTab v-model="activeTab" :options="vrmTabs" size="sm" />
      </div>

      <div :class="settingsLockClass">
        <!-- === Placement Tab === -->
        <div v-if="activeTab === 'placement'" flex="~ col gap-4" p-2>
          <div grid="~ cols-5 gap-y-2 gap-x-1" items-center>
            <PropertyNumber
              v-model="modelOffset.x"
              :config="{ min: -modelSize.x * 2, max: modelSize.x * 2, step: modelSize.x / 1000, label: 'X', formatValue: val => val?.toFixed(4), disabled: sceneMutationLocked }"
              :label="t('settings.vrm.scale-and-position.x')"
            />
            <PropertyNumber
              v-model="modelOffset.y"
              :config="{ min: -modelSize.y * 2, max: modelSize.y * 2, step: modelSize.y / 1000, label: 'Y', formatValue: val => val?.toFixed(4), disabled: sceneMutationLocked }"
              :label="t('settings.vrm.scale-and-position.y')"
            />
            <PropertyNumber
              v-model="modelOffset.z"
              :config="{ min: -modelSize.z * 2, max: modelSize.z * 2, step: modelSize.z / 1000, label: 'Z', formatValue: val => val?.toFixed(4), disabled: sceneMutationLocked }"
              :label="t('settings.vrm.scale-and-position.z')"
            />
            <PropertyNumber
              v-model="modelRotationY"
              :config="{ min: -180, max: 180, step: 1, label: t('settings.vrm.scale-and-position.rotation-y'), disabled: sceneMutationLocked }"
              :label="t('settings.vrm.scale-and-position.rotation-y')"
            />
            <PropertyNumber
              v-model="cameraDistance"
              :config="{ min: modelSize.z, max: modelSize.z * 20, step: modelSize.z / 100, label: t('settings.vrm.scale-and-position.camera-distance'), formatValue: val => val?.toFixed(4), disabled: sceneMutationLocked }"
              :label="t('settings.vrm.scale-and-position.camera-distance')"
            />
            <PropertyNumber
              v-model="cameraFOV"
              :config="{ min: 1, max: 180, step: 1, label: t('settings.vrm.scale-and-position.fov'), disabled: sceneMutationLocked }"
              :label="t('settings.vrm.scale-and-position.fov')"
            />

            <!-- Eye Tracking Mode -->
            <div class="text-xs text-neutral-500 font-medium dark:text-neutral-400">
              {{ t('settings.vrm.scale-and-position.eye-tracking-mode.title') }}
            </div>
            <div />
            <div grid-col-span-3>
              <SelectTab
                v-model="trackingMode"
                :options="trackingOptions"
                :disabled="sceneMutationLocked"
                size="sm"
              />
            </div>
          </div>
        </div>

        <!-- === Lighting Tab === -->
        <div v-if="activeTab === 'lighting'" flex="~ col gap-6" p-2>
          <!-- Directional Light -->
          <div flex="~ col gap-2">
            <div class="px-1 text-[10px] text-neutral-400 font-bold tracking-wider uppercase">
              Directional Light
            </div>
            <div grid="~ cols-5 gap-y-2 gap-x-1" items-center>
              <PropertyNumber
                v-model="directionalLightRotation.x"
                :config="{ min: -180, max: 180, step: 1, label: 'X°', formatValue: val => val?.toFixed(0), disabled: sceneMutationLocked }"
                label="Rotation X"
              />
              <PropertyNumber
                v-model="directionalLightRotation.y"
                :config="{ min: -180, max: 180, step: 1, label: 'Y°', formatValue: val => val?.toFixed(0), disabled: sceneMutationLocked }"
                label="Rotation Y"
              />
              <PropertyColor
                v-model="directionalLightColor"
                :disabled="sceneMutationLocked"
                label="Color"
              />
              <PropertyNumber
                v-model="directionalLightIntensity"
                :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity', disabled: sceneMutationLocked }"
                label="Intensity"
              />
            </div>
          </div>

          <!-- Ambient Light -->
          <div flex="~ col gap-2">
            <div class="px-1 text-[10px] text-neutral-400 font-bold tracking-wider uppercase">
              Ambient Light
            </div>
            <div grid="~ cols-5 gap-y-2 gap-x-1" items-center>
              <PropertyColor
                v-model="ambientLightColor"
                :disabled="sceneMutationLocked"
                label="Color"
              />
              <PropertyNumber
                v-model="ambientLightIntensity"
                :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity', disabled: sceneMutationLocked }"
                label="Intensity"
              />
            </div>
          </div>

          <!-- Environment -->
          <div flex="~ col gap-2">
            <div class="px-1 text-[10px] text-neutral-400 font-bold tracking-wider uppercase">
              Environment
            </div>
            <div class="mb-1">
              <SelectTab v-model="envSelect" :options="envOptions" :disabled="sceneMutationLocked" size="sm" />
            </div>

            <div v-if="envSelect === 'hemisphere'" grid="~ cols-5 gap-y-2 gap-x-1" items-center>
              <PropertyColor
                v-model="hemisphereSkyColor"
                :disabled="sceneMutationLocked"
                label="Sky Color"
              />
              <PropertyColor
                v-model="hemisphereGroundColor"
                :disabled="sceneMutationLocked"
                label="Ground Color"
              />
              <PropertyNumber
                v-model="hemisphereLightIntensity"
                :config="{ min: 0, max: 10, step: 0.01, label: 'Intensity', disabled: sceneMutationLocked }"
                label="Intensity"
              />
            </div>
            <div v-else grid="~ cols-5 gap-y-2 gap-x-1" items-center>
              <PropertyNumber
                v-model="skyBoxIntensity"
                :config="{ min: 0, max: 1, step: 0.01, label: 'Intensity', disabled: sceneMutationLocked }"
                :label="t('settings.vrm.skybox.skybox-intensity')"
              />
            </div>
          </div>
        </div>
      </div>
    </Container>

    <!-- === Advanced Tools === -->
    <Container
      title="Advanced"
      icon="i-solar:settings-bold-duotone"
      :expanded="false"
      :class="[
        'rounded-xl',
        'bg-white/80  dark:bg-black/75',
        'backdrop-blur-lg',
      ]"
    >
      <div flex="~ col gap-4" p-2 :class="settingsLockClass">
        <div flex="~ col gap-2">
          <div class="px-1 text-[10px] text-neutral-400 font-bold tracking-wider uppercase">
            V-HACK Editor
          </div>
          <Button
            :variant="vhackStore.isHackerModeActive ? 'primary' : 'secondary'"
            :disabled="sceneMutationLocked"
            @click="vhackStore.toggleHackerMode"
          >
            <template #icon>
              <div i-solar:mask-h-bold-duotone />
            </template>
            V-HACK Dashboard
          </Button>
          <p class="mb-2 px-1 text-[10px] text-neutral-400">
            Open the Hacker Inspector for real-time mesh and material modding.
          </p>

          <div class="px-1 text-[10px] text-neutral-400 font-bold tracking-wider uppercase">
            Theme Extraction
          </div>
          <Button variant="secondary" :disabled="sceneMutationLocked" @click="$emit('extractColorsFromModel')">
            <template #icon>
              <div i-solar:palette-bold-duotone />
            </template>
            {{ t('settings.vrm.theme-color-from-model.button-extract.title') }}
          </Button>
          <p class="px-1 text-[10px] text-neutral-400">
            Extract dominant colors from the model texture to set UI theme.
          </p>
        </div>

        <div flex="~ col gap-2">
          <div class="px-1 text-[10px] text-neutral-400 font-bold tracking-wider uppercase">
            Model Information
          </div>
          <Callout :label="t('settings.vrm.scale-and-position.model-info-title')">
            <div class="text-[11px] text-neutral-600 space-y-1 dark:text-neutral-400">
              <div class="flex justify-between">
                <span>{{ t('settings.vrm.scale-and-position.model-info-x') }}</span>
                <span font-mono>{{ modelSize.x.toFixed(4) }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ t('settings.vrm.scale-and-position.model-info-y') }}</span>
                <span font-mono>{{ modelSize.y.toFixed(4) }}</span>
              </div>
              <div class="flex justify-between">
                <span>{{ t('settings.vrm.scale-and-position.model-info-z') }}</span>
                <span font-mono>{{ modelSize.z.toFixed(4) }}</span>
              </div>
            </div>
          </Callout>
        </div>

        <Callout theme="lime" label="Tips!">
          <div class="text-[11px] text-neutral-600 leading-relaxed dark:text-neutral-400">
            {{ t('settings.vrm.scale-and-position.tips') }}
          </div>
        </Callout>
      </div>
    </Container>
  </div>
</template>
