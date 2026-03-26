import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useVHackStore = defineStore('vhack', () => {
  const isHackerModeActive = ref(false)
  const selectedNodeName = ref<string | null>(null)
  const selectedMaterialName = ref<string | null>(null)

  // AI Settings (Persistent)
  const geminiApiKey = ref(localStorage.getItem('vhack_gemini_api_key') || '')
  const geminiModel = ref(localStorage.getItem('vhack_gemini_model') || 'gemini-3.1-flash-image-preview')
  const geminiResolution = ref(localStorage.getItem('vhack_gemini_res') || '1K')
  const showAiSettings = ref(false)

  // Visibility Tracking
  const hiddenNodeUuids = ref<Set<string>>(new Set())

  // Snapshots
  const snapshotMap = ref<Map<string, any>>(new Map())

  // Persist AI Settings
  watch(geminiApiKey, v => localStorage.setItem('vhack_gemini_api_key', v))
  watch(geminiModel, v => localStorage.setItem('vhack_gemini_model', v))
  watch(geminiResolution, v => localStorage.setItem('vhack_gemini_res', v))

  function toggleHackerMode() {
    isHackerModeActive.value = !isHackerModeActive.value
  }

  function closeHackerMode() {
    isHackerModeActive.value = false
  }

  function toggleNodeVisibility(uuid: string, node: any) {
    if (hiddenNodeUuids.value.has(uuid)) {
      hiddenNodeUuids.value.delete(uuid)
      node.visible = true
    }
    else {
      hiddenNodeUuids.value.add(uuid)
      node.visible = false
    }
  }

  function resetState() {
    selectedNodeName.value = null
    selectedMaterialName.value = null
    hiddenNodeUuids.value.clear()
    snapshotMap.value.clear()
  }

  return {
    isHackerModeActive,
    selectedNodeName,
    selectedMaterialName,
    geminiApiKey,
    geminiModel,
    geminiResolution,
    showAiSettings,
    hiddenNodeUuids,
    snapshotMap,
    toggleHackerMode,
    closeHackerMode,
    toggleNodeVisibility,
    resetState,
  }
})
