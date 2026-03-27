import type { DisplayModel } from '../display-models'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset, useEventListener } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../display-models'

export type StageModelRenderer = 'live2d' | 'vrm' | 'disabled' | undefined

export const useSettingsStageModel = defineStore('settings-stage-model', () => {
  const displayModelsStore = useDisplayModelsStore()
  let stageModelUpdateSequence = 0
  const stageModelStorageKey = 'settings/stage/model'

  const stageModelSelectedState = useLocalStorageManualReset<string>(stageModelStorageKey, 'preset-live2d-1')
  const stageModelSelected = computed<string>({
    get: () => stageModelSelectedState.value,
    set: (value) => {
      stageModelSelectedState.value = value
    },
  })
  const stageModelSelectedDisplayModel = refManualReset<DisplayModel | undefined>(undefined)
  const stageModelSelectedUrl = refManualReset<string | undefined>(undefined)
  const stageModelSelectedFile = refManualReset<File | undefined>(undefined)
  const stageModelRenderer = refManualReset<StageModelRenderer>(undefined)

  const stageViewControlsEnabled = refManualReset<boolean>(false)

  function isSameFile(f1?: File, f2?: File) {
    if (f1 === f2)
      return true
    if (!f1 || !f2)
      return false
    return f1.name === f2.name && f1.size === f2.size && f1.lastModified === f2.lastModified
  }

  function revokeStageModelUrl(url?: string) {
    if (url?.startsWith('blob:'))
      URL.revokeObjectURL(url)
  }

  function replaceStageModelUrl(nextUrl?: string) {
    if (stageModelSelectedUrl.value === nextUrl)
      return

    revokeStageModelUrl(stageModelSelectedUrl.value)
    stageModelSelectedUrl.value = nextUrl
  }

  async function updateStageModel() {
    const requestId = ++stageModelUpdateSequence
    const selectedModelId = stageModelSelectedState.value

    if (!selectedModelId) {
      replaceStageModelUrl(undefined)
      stageModelSelectedDisplayModel.value = undefined
      stageModelSelectedFile.value = undefined
      stageModelRenderer.value = 'disabled'
      return
    }

    const model = await displayModelsStore.getDisplayModel(selectedModelId)

    if (requestId !== stageModelUpdateSequence)
      return

    if (!model) {
      replaceStageModelUrl(undefined)
      stageModelSelectedDisplayModel.value = undefined
      stageModelSelectedFile.value = undefined
      stageModelRenderer.value = 'disabled'
      return
    }

    if (model.type === 'file') {
      // If we already have a URL for this exact file, don't re-create it.
      // Re-creating the URL triggers replaceStageModelUrl which revokes the active one.
      // NOTICE: IndexedDB returns clones of File objects, so we must compare properties.
      if (isSameFile(stageModelSelectedFile.value, model.file) && stageModelSelectedUrl.value?.startsWith('blob:')) {
        stageModelSelectedDisplayModel.value = model
        // Update renderer just in case
        switch (model.format) {
          case DisplayModelFormat.Live2dZip: stageModelRenderer.value = 'live2d'; break
          case DisplayModelFormat.VRM: stageModelRenderer.value = 'vrm'; break
          default: stageModelRenderer.value = 'disabled'; break
        }
        return
      }

      const nextUrl = URL.createObjectURL(model.file)
      if (requestId !== stageModelUpdateSequence) {
        URL.revokeObjectURL(nextUrl)
        return
      }

      replaceStageModelUrl(nextUrl)
      stageModelSelectedFile.value = model.file
    }
    else {
      // For URL types, we only update if it actually changed
      if (stageModelSelectedUrl.value !== model.url) {
        replaceStageModelUrl(model.url)
      }
      stageModelSelectedFile.value = undefined
    }

    switch (model.format) {
      case DisplayModelFormat.Live2dZip:
        stageModelRenderer.value = 'live2d'
        break
      case DisplayModelFormat.VRM:
        stageModelRenderer.value = 'vrm'
        break
      default:
        stageModelRenderer.value = 'disabled'
        break
    }

    stageModelSelectedDisplayModel.value = model
  }

  async function initializeStageModel() {
    await updateStageModel()
  }

  useEventListener('unload', () => {
    revokeStageModelUrl(stageModelSelectedUrl.value)
  })

  watch(stageModelSelectedState, (_newValue, _oldValue) => {
    void updateStageModel()
  })

  async function resetState() {
    revokeStageModelUrl(stageModelSelectedUrl.value)

    stageModelSelectedState.reset()
    stageModelSelectedDisplayModel.reset()
    stageModelSelectedUrl.reset()
    stageModelSelectedFile.reset()
    stageModelRenderer.reset()
    stageViewControlsEnabled.reset()

    await updateStageModel()
  }

  return {
    stageModelRenderer,
    stageModelSelected,
    stageModelSelectedUrl,
    stageModelSelectedFile,
    stageModelSelectedDisplayModel,
    stageViewControlsEnabled,

    initializeStageModel,
    updateStageModel,
    resetState,
  }
})
