<script setup lang="ts">
import JSZip from 'jszip'

import { Texture } from '@pixi/core'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { ARTISTRY_PRESET_GROUPS, artistryGenerateHeadless, REPLICATE_IMAGEEDIT_PRESETS } from '@proj-airi/stage-shared'
import { useLive2d } from '@proj-airi/stage-ui-live2d'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

import { useArtistryStore, useLHackStore } from '../../../../../stores'

const lhackStore = useLHackStore()

onMounted(() => {
  console.info('>>> [LHACK] Panel Mounted')
  if ((window as any).__LHACK_LAST_ZIP_BUFFER__) {
    lhackStore.originalZipBuffer = (window as any).__LHACK_LAST_ZIP_BUFFER__
  }
})
const live2dStore = useLive2d()
const artistryStore = useArtistryStore()
const { model: activeModel } = storeToRefs(live2dStore)

const generateInvoke = useElectronEventaInvoke(artistryGenerateHeadless)

const activeTab = ref<'tree' | 'material' | 'texture'>('tree')
const scrollContainer = ref<HTMLElement | null>(null)

// Selected State
const selectedDrawable = ref<any>(null)
const lastSelectedTextureItem = ref<any>(null)

// AI Comparison State
const sourceTextureUrl = ref<string | null>(null)
const lastGeneratedUrl = ref<string | null>(null)

// AI State
const aiPrompt = ref('')
const aiReplicateModelId = ref('black-forest-labs/flux-schnell')
const aiReplicateParams = ref('{}')
const selectedReplicatePreset = ref('')
const aiComfyParams = ref('{}')

const isGenerating = ref(false)
const isExporting = ref(false)
const aiError = ref<string | null>(null)
const showPresets = ref(false)
const selectedCategory = ref<string | null>(null)
const nodeFilter = ref('')
const textureUploader = ref<HTMLInputElement | null>(null)
const eraserCanvas = ref<HTMLCanvasElement | null>(null)

// Surgical Eraser State
const isEraserOpen = ref(false)
const eraserImageUrl = ref('')
const eraserPickedColor = ref<[number, number, number] | null>(null)
const eraserTolerance = ref(15)
const isEraserPicking = ref(true)

const activePresets = computed(() => {
  if (!selectedCategory.value)
    return []
  return ARTISTRY_PRESET_GROUPS.find(g => g.id === selectedCategory.value)?.presets || []
})

const availableProviders = [
  { id: 'nanobanana', name: 'Nano Banana', icon: 'i-solar:gallery-round-bold-duotone' },
  { id: 'replicate', name: 'Replicate', icon: 'i-solar:cloud-bold-duotone' },
  { id: 'comfyui', name: 'ComfyUI', icon: 'i-solar:settings-bold-duotone' },
]

function injectPreset(text: string) {
  aiPrompt.value = text
  showPresets.value = false
}

function getTextureUrl(tex: any) {
  if (!tex)
    return null

  // Pixi textures often have the source tucked away in baseTexture.resource or baseTexture.source
  const base = tex.baseTexture || tex
  if (!base)
    return null

  const resource = base.resource as any
  if (resource) {
    if (resource.src)
      return resource.src
    if (resource.source && resource.source.src)
      return resource.source.src
  }

  if (base.source && base.source.src)
    return base.source.src

  return null
}

// Watchers
watch(() => artistryStore.comfyuiActiveWorkflow, (newWorkflowId) => {
  if (artistryStore.activeProvider === 'comfyui' && newWorkflowId) {
    const workflow = artistryStore.comfyuiSavedWorkflows.find(w => w.id === newWorkflowId)
    if (workflow) {
      const example: Record<string, any> = {}
      for (const [nodeTitle, fields] of Object.entries(workflow.exposedFields)) {
        example[nodeTitle] = {}
        for (const field of fields) {
          const nodeId = Object.keys(workflow.workflow).find(id => (workflow.workflow[id]._meta?.title || workflow.workflow[id].class_type) === nodeTitle)
          const val = nodeId ? workflow.workflow[nodeId].inputs[field] : '...'
          example[nodeTitle][field] = val
        }
      }
      aiComfyParams.value = JSON.stringify(example, null, 2)
    }
  }
})

watch(selectedReplicatePreset, (newPresetId) => {
  if (artistryStore.activeProvider === 'replicate' && newPresetId) {
    const preset = REPLICATE_IMAGEEDIT_PRESETS.find(p => p.id === newPresetId)
    if (preset) {
      aiReplicateModelId.value = preset.id
      aiReplicateParams.value = JSON.stringify(preset.preset, null, 2)
      if (preset.prompt)
        aiPrompt.value = preset.prompt
    }
  }
})

// Tree View Logic
const drawables = computed(() => {
  // SCALED BACK: Returning empty to ensure UI manifest
  return []
  /*
  if (!activeModel.value)
    return []

  const internal = activeModel.value.internalModel
  const searchTerm = nodeFilter.value.toLowerCase()

  return internal.drawables.map((drawable: any, index: number) => {
    return {
      id: internal.drawableIds[index],
      index,
      opacity: drawable.opacity,
      visible: drawable.opacity > 0,
      name: internal.drawableIds[index],
    }
  }).filter((d: any) => d.name.toLowerCase().includes(searchTerm))
  */
})

function toggleVisibility(item: any, event?: MouseEvent) {
  if (event?.ctrlKey) {
    // Focus logic: hide everything except this one
    lhackStore.hideAll(drawables.value, activeModel.value)
    lhackStore.toggleDrawableVisibility(item.id, activeModel.value)
  }
  else {
    lhackStore.toggleDrawableVisibility(item.id, activeModel.value)
  }
}

function selectNode(item: any) {
  lhackStore.selectedDrawableId = item.id
  selectedDrawable.value = item

  // For Live2D, finding the texture for a drawable is complex (UV mapping)
  // Initially we just show all textures in the "Deck" tab
}

// Texture Deck Logic
const textureList = computed(() => {
  if (!activeModel.value)
    return []

  return activeModel.value.textures.map((tex, i) => {
    return {
      id: i,
      name: `Atlas ${i}`,
      type: 'Atlas',
      url: getTextureUrl(tex) || '',
      texture: tex,
    }
  })
})

function downloadTexture(item: any) {
  if (!item.url)
    return
  const link = document.createElement('a')
  link.href = item.url
  link.download = `${item.name}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function selectTexture(item: any) {
  lastSelectedTextureItem.value = item
  sourceTextureUrl.value = item.url
  lastGeneratedUrl.value = null

  if (!aiPrompt.value)
    aiPrompt.value = `Stylize the ${item.name} atlas...`

  nextTick(() => {
    if (scrollContainer.value)
      scrollContainer.value.scrollTo({ top: 0, behavior: 'smooth' })
  })

  activeTab.value = 'material' // Move to "Lab" for editing
}

// Unified Artistry Generation
async function generateAndSwap() {
  if (!lastSelectedTextureItem.value || !aiPrompt.value)
    return

  lhackStore.isGeneratingTexture = true
  lhackStore.generationProgress = 10
  lhackStore.generationActionLabel = 'Preparing Atlas'
  lhackStore.lastGenerationError = null
  isGenerating.value = true
  aiError.value = null

  try {
    const tex = lastSelectedTextureItem.value.texture
    if (!tex)
      throw new Error('No texture found')

    // 1. Prepare base64 from current texture
    const resource = tex.baseTexture.resource as any
    if (!resource || !resource.src)
      throw new Error('Texture source not found')

    const response = await fetch(resource.src)
    const blob = await response.blob()
    const reader = new FileReader()
    const base64Promise = new Promise<string>((resolve) => {
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.readAsDataURL(blob)
    })
    const base64Data = await base64Promise

    // 2. Call Headless Artistry Bridge
    let options: Record<string, any> = {}
    const globals: Record<string, any> = {
      ...JSON.parse(JSON.stringify(artistryStore.$state)),
      image: base64Data,
    }
    let model: string | undefined

    if (artistryStore.activeProvider === 'nanobanana') {
      options = {
        resolution: artistryStore.nanobananaResolution,
        model: artistryStore.nanobananaModel,
      }
    }
    else if (artistryStore.activeProvider === 'replicate') {
      options = JSON.parse(aiReplicateParams.value || '{}')
      model = aiReplicateModelId.value
    }
    else if (artistryStore.activeProvider === 'comfyui') {
      try {
        options = JSON.parse(aiComfyParams.value || '{}')
      }
      catch (e) {
        options = {}
      }
      model = artistryStore.comfyuiActiveWorkflow
    }

    const result = await generateInvoke({
      prompt: aiPrompt.value,
      provider: artistryStore.activeProvider,
      options,
      globals,
      model,
    })

    if (result?.error) {
      aiError.value = result.error
      lhackStore.lastGenerationError = result.error
      return
    }

    if (result?.base64) {
      lhackStore.generationProgress = 90
      lhackStore.generationActionLabel = 'Applying Result'

      const newUrl = result.base64.startsWith('data:') ? result.base64 : `data:image/png;base64,${result.base64}`

      lastGeneratedUrl.value = newUrl
      swapTextureByRef(newUrl, lastSelectedTextureItem.value.id)

      // Register mutation for persistence
      lhackStore.registerMutation(lastSelectedTextureItem.value.id, result.base64, 'image/png')

      lhackStore.generationProgress = 100
      lhackStore.generationActionLabel = 'Success'
    }
  }
  catch (e: any) {
    aiError.value = e.message || 'Generation failed'
    lhackStore.lastGenerationError = aiError.value
  }
  finally {
    isGenerating.value = false
    lhackStore.isGeneratingTexture = false
    setTimeout(() => {
      lhackStore.generationProgress = 0
      lhackStore.generationActionLabel = null
    }, 2000)
  }
}

function triggerManualUpload() {
  textureUploader.value?.click()
}

async function handleManualUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !lastSelectedTextureItem.value)
    return

  const targetIdx = lastSelectedTextureItem.value.id
  const reader = new FileReader()
  reader.onload = (e) => {
    const url = e.target?.result as string
    const base64 = url.split(',')[1]

    swapTextureByRef(url, targetIdx)
    lastGeneratedUrl.value = url
    lhackStore.registerMutation(targetIdx, base64, 'image/png')
  }
  reader.readAsDataURL(file)
}

function swapTextureByRef(url: string, index: number) {
  if (!activeModel.value)
    return

  const targetTex = activeModel.value.textures[index]
  if (!targetTex)
    return

  const newTex = Texture.from(url)
  targetTex.baseTexture = newTex.baseTexture
  targetTex.update()

  console.info(`[LHACK] Swapped Texture Atlas ${index}`)
}

async function exportZip() {
  if (!activeModel.value || !lhackStore.originalZipBuffer) {
    aiError.value = 'No source bundle found (Load via ZIP?)'
    return
  }

  isExporting.value = true
  try {
    const zip = await JSZip.loadAsync(lhackStore.originalZipBuffer)

    // Find the model3.json to get texture paths
    const model3Path = Object.keys(zip.files).find(f => f.endsWith('.model3.json'))
    if (!model3Path)
      throw new Error('model3.json not found in bundle')

    const model3Json = JSON.parse(await zip.file(model3Path)!.async('string'))
    const texturePaths = model3Json.FileReferences.Textures

    // Replace mutated textures
    for (const [index, mutation] of lhackStore.mutatedTextures.entries()) {
      const relPath = texturePaths[index]
      if (relPath) {
        // Resolve absolute path in ZIP if needed
        const fullPath = model3Path.substring(0, model3Path.lastIndexOf('/') + 1) + relPath
        console.info(`[LHACK] Surgical Overwrite: ${fullPath}`)
        zip.file(fullPath, mutation.data, { base64: true })
      }
    }

    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url
    a.download = `LHACK_${activeModel.value.name || 'model'}.zip`
    a.click()
    URL.revokeObjectURL(url)
  }
  catch (e: any) {
    aiError.value = e.message || 'Export failed'
  }
  finally {
    isExporting.value = false
  }
}

function revert() {
  lhackStore.resetState()
  window.location.reload()
}

// Surgical Eraser Logic (Omitted for briefness, can be ported from VHacker later)
function openEraser(url: string) {
  aiError.value = 'Eraser coming soon to Live2D!'
}
</script>

<template>
  <!-- DEBUG: isHackerModeActive: {{ lhackStore.isHackerModeActive }} -->
  <div v-if="lhackStore.isHackerModeActive" class="fixed bottom-4 right-4 top-24 z-50 w-80 flex flex-col overflow-hidden border-2 border-purple-500 rounded-2xl bg-black/95 shadow-2xl backdrop-blur-3xl">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/10 from-purple-500/20 to-transparent bg-gradient-to-r p-4 text-[14px]">
      <div class="flex items-center gap-2 text-white font-black tracking-tighter uppercase">
        <div i-solar:mask-h-bold-duotone class="text-xl text-purple-400" />L-HACK Inspector
      </div>
      <button class="text-neutral-400 transition hover:text-white" @click="lhackStore.closeHackerMode">
        <div i-solar:close-circle-bold-duotone />
      </button>
    </div>

    <!-- Tabs -->
    <div class="mx-4 mt-4 flex gap-1 rounded-lg bg-white/5 p-1 text-[10px] font-bold tracking-widest uppercase">
      <button :class="['flex-1 py-2 rounded-md transition', activeTab === 'tree' ? 'bg-purple-500 text-black' : 'text-neutral-400 hover:bg-white/5']" @click="activeTab = 'tree'">
        Drawables
      </button>
      <button :class="['flex-1 py-2 rounded-md transition', activeTab === 'material' ? 'bg-purple-500 text-black' : 'text-neutral-400 hover:bg-white/5']" @click="activeTab = 'material'">
        Forge
      </button>
      <button :class="['flex-1 py-2 rounded-md transition', activeTab === 'texture' ? 'bg-purple-500 text-black' : 'text-neutral-400 hover:bg-white/5']" @click="activeTab = 'texture'">
        Atlases
      </button>
    </div>

    <!-- Content -->
    <div ref="scrollContainer" class="custom-scrollbar flex-1 overflow-y-auto p-4">
      <!-- Tree View -->
      <div v-if="activeTab === 'tree'" class="space-y-1">
        <div v-for="node in drawables" :key="node.id" class="group flex cursor-pointer items-center justify-between border border-transparent rounded-lg p-2 text-xs transition hover:border-white/5 hover:bg-white/5" :class="{ 'bg-purple-500/10 border-purple-500/30': lhackStore.selectedDrawableId === node.id }" @click="selectNode(node)">
          <div class="flex items-center gap-2 truncate">
            <div i-solar:layers-bold-duotone class="text-purple-400" />
            <div class="flex flex-col truncate">
              <span :class="[lhackStore.selectedDrawableId === node.id ? 'text-purple-400 font-bold' : 'text-neutral-300']">{{ node.name }}</span>
            </div>
          </div>
          <button class="rounded p-1 transition hover:bg-white/10" @click.stop="e => toggleVisibility(node, e)">
            <div :class="[node.visible ? 'i-solar:eye-bold-duotone text-purple-400' : 'i-solar:eye-closed-bold-duotone text-red-500']" />
          </button>
        </div>
      </div>

      <!-- Atlas Forge -->
      <div v-else-if="activeTab === 'material'" class="pb-20 space-y-6">
        <div v-if="lastSelectedTextureItem" class="space-y-4">
          <div class="space-y-4">
            <div class="flex items-center justify-between px-1">
              <div class="flex items-center gap-2">
                <div i-solar:magic-stick-bold-duotone class="text-sm text-purple-400" />
                <div class="text-[10px] text-white font-black tracking-widest uppercase">
                  ◈ Atlas Forge [Live2D v1.0]
                </div>
              </div>
            </div>

            <!-- Before/After View -->
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <div class="px-1 text-[8px] text-neutral-500 font-bold uppercase">
                  Source Atlas
                </div>
                <div class="group relative aspect-square overflow-hidden border border-white/5 rounded-lg bg-white/5">
                  <img v-if="sourceTextureUrl" :src="sourceTextureUrl" class="h-full w-full object-cover opacity-60 transition group-hover:opacity-100">
                  <div class="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      class="h-5 w-5 flex items-center justify-center rounded bg-black/60 text-white/70 transition hover:bg-purple-500 hover:text-white"
                      title="Download Source Atlas"
                      @click.stop="downloadTexture(lastSelectedTextureItem)"
                    >
                      <div class="i-solar:download-minimalistic-bold-duotone h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
              <div class="space-y-1">
                <div class="px-1 text-[8px] text-purple-500 font-bold uppercase">
                  {{ lastGeneratedUrl ? 'Result' : 'Idle' }}
                </div>
                <div class="group/result relative aspect-square flex items-center justify-center overflow-hidden border border-purple-500/20 rounded-lg border-dashed bg-purple-500/5">
                  <img v-if="lastGeneratedUrl" :src="lastGeneratedUrl" class="h-full w-full object-cover">
                  <div v-if="isGenerating" class="flex flex-col items-center gap-2 px-4 text-center">
                    <div i-solar:spinner-bold class="animate-spin text-xl text-purple-500" />
                    <span class="animate-pulse text-[7px] text-purple-500 font-bold uppercase">{{ lhackStore.generationActionLabel || 'Inscribing...' }}</span>
                  </div>
                  <div v-else i-solar:ghost-bold-duotone class="text-2xl text-white/5" />
                </div>
              </div>
            </div>

            <textarea v-model="aiPrompt" placeholder="Describe the style change for this atlas..." class="h-20 w-full resize-none border border-white/10 rounded-xl bg-white/5 p-3 text-xs text-white font-mono outline-none transition focus:border-purple-500/50" />
            <div class="grid grid-cols-2 gap-2">
              <Button variant="primary" class="bg-purple-600 font-bold uppercase shadow-lg shadow-purple-500/10" :disabled="!aiPrompt || isGenerating" @click="generateAndSwap">
                Inscribe Style (AI)
              </Button>
              <Button variant="secondary" class="border-purple-500/20 bg-purple-500/5 font-bold uppercase hover:bg-purple-500/10" :disabled="isGenerating" @click="triggerManualUpload">
                Upload PNG
              </Button>
              <input ref="textureUploader" type="file" accept="image/png" class="hidden" @change="handleManualUpload">
            </div>
          </div>
        </div>
        <div v-else class="h-40 flex flex-col items-center justify-center gap-2 text-xs text-neutral-600 italic">
          <div i-solar:shield-warning-bold-duotone text-2xl />Select atlas in "Atlases" first
        </div>
      </div>

      <!-- Texture Deck -->
      <div v-else-if="activeTab === 'texture'" class="grid grid-cols-2 gap-3 pb-8">
        <div v-for="item in textureList" :key="item.id" class="group flex flex-col cursor-pointer gap-1 text-[8px] font-bold uppercase" @click="selectTexture(item)">
          <div class="relative aspect-square overflow-hidden border border-white/10 rounded-xl bg-white/5 transition" :class="[lastSelectedTextureItem?.id === item.id ? 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'group-hover:border-white/30']">
            <img v-if="item.url" :src="item.url" class="absolute inset-0 h-full w-full object-cover opacity-60 transition group-hover:opacity-100">
            <div class="absolute right-1 top-1 flex flex-col items-end gap-1">
              <div class="rounded bg-black/80 px-1 py-0.5 text-[7px] text-purple-400">
                {{ item.type }}
              </div>
              <button
                class="h-5 w-5 flex items-center justify-center rounded bg-black/60 text-white/70 opacity-0 transition hover:bg-purple-500 hover:text-white group-hover:opacity-100"
                title="Download Atlas"
                @click.stop="downloadTexture(item)"
              >
                <div class="i-solar:download-minimalistic-bold-duotone h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex flex-col gap-2 border-t border-white/10 bg-black/80 p-4">
      <Button variant="primary" size="sm" class="w-full bg-purple-500 text-xs text-black font-black tracking-widest uppercase shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:bg-purple-400" :disabled="!activeModel || isExporting" @click="exportZip">
        <div v-if="isExporting" i-solar:spinner-bold class="mr-2 animate-spin" />
        {{ isExporting ? 'Packaging...' : 'Download Modified ZIP' }}
      </Button>
      <Button variant="secondary" size="sm" class="w-full border-white/5 bg-white/5 text-[10px] font-bold tracking-widest" :disabled="!activeModel" @click="revert">
        REVERT ALL CHANGES
      </Button>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
</style>
