<script setup lang="ts">
import { useModelStore } from '@proj-airi/stage-ui-three'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref, watch } from 'vue'

// @ts-ignore
import * as THREE from 'three'

import { useArtistryStore } from '../../../../../stores/modules/artistry'
import { useVHackStore } from '../../../../../stores/vhack'

const vhackStore = useVHackStore()
const modelStore = useModelStore()
// @ts-ignore
const artistryStore = useArtistryStore()
const { activeVrm } = storeToRefs(modelStore)

const activeTab = ref<'tree' | 'material' | 'texture'>('tree')
const scrollContainer = ref<HTMLElement | null>(null)

// Selected State
const selectedMesh = ref<any>(null)
const selectedMaterial = ref<any>(null)
const lastSelectedTextureItem = ref<any>(null)

// AI Comparison State
const sourceTextureUrl = ref<string | null>(null)
const lastGeneratedUrl = ref<string | null>(null)

// AI State
const aiPrompt = ref('')
const isGenerating = ref(false)
const aiError = ref<string | null>(null)
const showPresets = ref(false)

// Preset Palette Data
const presets = [
  { id: 'gothic', label: 'Midnight Gothic', icon: 'i-solar:ghost-bold-duotone', text: 'Midnight Gothic style. Deep matte black fabric, crimson lace ruffles, dark leather straps, silver scrollwork embroidery.' },
  { id: 'cyber', label: 'Cyber Tech', icon: 'i-solar:cpu-bold-duotone', text: 'Cyberpunk Techwear aesthetic. Dark charcoal grey fabric, glowing neon cyan trim, tactical utility buckles, hexagonal digital camo.' },
  { id: 'royal', label: 'Royal Porcelain', icon: 'i-solar:crown-minimalistic-bold-duotone', text: 'Royal Porcelain style. White silk base, hand-painted cobalt blue patterns, golden silk sashes, jade ornaments.' },
  { id: 'demon', label: 'Demon Eyes', icon: 'i-solar:mask-h-bold-duotone', text: 'Demonic eye transformation. Neon yellow scleras, glowing crimson red irises, sharp vertical black slit pupils.' },
  { id: 'gold', label: 'Gold Leaf', icon: 'i-solar:star-bold-duotone', text: 'Divine Golden transformation. Pure white velvet fabric with thick 24k gold leaf embroidery and glowing white celestial patterns.' },
]

function injectPreset(text: string) {
  aiPrompt.value = text
  showPresets.value = false
}

function getTextureUrl(tex: any) {
  if (!tex || !tex.image)
    return null
  try {
    if (tex.image instanceof HTMLCanvasElement)
      return tex.image.toDataURL()
    if (tex.image instanceof HTMLImageElement)
      return tex.image.src
    if (tex.image instanceof ImageBitmap) {
      const canvas = document.createElement('canvas')
      canvas.width = tex.image.width
      canvas.height = tex.image.height
      canvas.getContext('2d')?.drawImage(tex.image, 0, 0)
      return canvas.toDataURL()
    }
  }
  catch (e) {}
  return null
}

// Global Snapshot Logic
function takeGlobalSnapshot() {
  if (!activeVrm.value)
    return
  activeVrm.value.scene.traverse((node: any) => {
    if (!vhackStore.snapshotMap.has(node.uuid)) {
      const snap: any = { visible: node.visible }
      if (node.material) {
        const mat = Array.isArray(node.material) ? node.material[0] : node.material
        snap.props = {
          rimWidth: mat.rimWidthFactor ?? mat.rimWidth ?? mat.uniforms?.rimWidth?.value ?? 0,
          shadeShift: mat.shadingShiftFactor ?? mat.shadeShift ?? mat.uniforms?.shadingShift?.value ?? 0,
          shadeToony: mat.shadingToonyFactor ?? mat.shadeToony ?? mat.uniforms?.shadingToony?.value ?? 0,
          map: mat.map,
        }
      }
      vhackStore.snapshotMap.set(node.uuid, snap)
    }
  })
}

// Tree View Logic
const nodes = computed(() => {
  if (!activeVrm.value)
    return []
  const result: any[] = []
  activeVrm.value.scene.traverse((node: any) => {
    if (node.type === 'Mesh' || node.type === 'SkinnedMesh') {
      result.push({ name: node.name || 'Unnamed Mesh', type: node.type, visible: node.visible, uuid: node.uuid, node })
    }
  })
  return result
})

function toggleVisibility(item: any) { vhackStore.toggleNodeVisibility(item.uuid, item.node) }

function selectNode(item: any) {
  vhackStore.selectedNodeName = item.name
  selectedMesh.value = item.node
  let mat: any = null
  if (Array.isArray(item.node.material))
    mat = item.node.material[0]
  else mat = item.node.material
  if (mat) {
    selectedMaterial.value = mat
    vhackStore.selectedMaterialName = mat.name
    sourceTextureUrl.value = getTextureUrl(mat.map)
    lastGeneratedUrl.value = null
  }
}

// Material Lab Logic
function updateProp(prop: string, value: number) {
  if (!selectedMaterial.value)
    return
  const mat = selectedMaterial.value as any
  if (prop === 'rimWidth') {
    if ('rimWidthFactor' in mat)
      mat.rimWidthFactor = value
    else if (mat.uniforms?.rimWidth)
      mat.uniforms.rimWidth.value = value
    else mat.rimWidth = value
  }
  else if (prop === 'shadeShift') {
    if ('shadingShiftFactor' in mat)
      mat.shadingShiftFactor = value
    else if (mat.uniforms?.shadingShift)
      mat.uniforms.shadingShift.value = value
    else mat.shadeShift = value
  }
  else if (prop === 'shadeToony') {
    if ('shadingToonyFactor' in mat)
      mat.shadingToonyFactor = value
    else if (mat.uniforms?.shadingToony)
      mat.uniforms.shadingToony.value = value
    else mat.shadeToony = value
  }
  mat.needsUpdate = true
}

// Texture Deck Logic
const textureList = ref<{ id: number, name: string, type: string, url: string, texture: any }[]>([])

function extractTextures() {
  if (!activeVrm.value)
    return
  const found: { tex: any, type: string }[] = []
  activeVrm.value.scene.traverse((node: any) => {
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material]
      mats.forEach((m: any) => {
        if (m.map)
          found.push({ tex: m.map, type: 'Main' })
        if (m.shadeMultiplyTexture)
          found.push({ tex: m.shadeMultiplyTexture, type: 'Shade' })
        if (m.rimMultiplyTexture)
          found.push({ tex: m.rimMultiplyTexture, type: 'Rim' })
        if (m.sphereAddTexture)
          found.push({ tex: m.sphereAddTexture, type: 'MatCap' })
      })
    }
  })
  const seenUuids = new Set()
  const seenImages = new Set()
  const uniqueItems: { tex: any, type: string }[] = []
  found.forEach((item) => {
    const tex = item.tex
    const imgId = tex.image?.src || tex.image?.uuid || tex.name || tex.id
    if (!seenUuids.has(tex.uuid) && !seenImages.has(imgId)) {
      seenUuids.add(tex.uuid)
      seenImages.add(imgId)
      uniqueItems.push(item)
    }
  })
  textureList.value = uniqueItems.map((item, i) => {
    const tex = item.tex
    return { id: i, name: tex.name || `Tex ${i}`, type: item.type, url: getTextureUrl(tex) || '', texture: tex }
  })
}

function findAssociatedNodes(texture: any) {
  if (!activeVrm.value)
    return []
  const result: any[] = []
  activeVrm.value.scene.traverse((node: any) => {
    if (node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material]
      const usesTexture = mats.some((m: any) => m.map === texture || m.shadeMultiplyTexture === texture || m.rimMultiplyTexture === texture || m.sphereAddTexture === texture)
      if (usesTexture)
        result.push({ name: node.name || 'Unnamed Mesh', node, uuid: node.uuid })
    }
  })
  return result
}

const associatedNodesForTexture = computed(() => {
  if (!lastSelectedTextureItem.value)
    return []
  return findAssociatedNodes(lastSelectedTextureItem.value.texture)
})

function selectTexture(item: any) {
  lastSelectedTextureItem.value = item
  if (!aiPrompt.value)
    aiPrompt.value = `Stylize the ${item.name} texture...`
  nextTick(() => {
    if (scrollContainer.value)
      scrollContainer.value.scrollTo({ top: 0, behavior: 'smooth' })
  })
  const associated = findAssociatedNodes(item.texture)
  if (associated.length === 1)
    jumpToNode(associated[0])
}

function jumpToNode(nodeItem: any) { selectNode(nodeItem); activeTab.value = 'material' }

// Gemini AI Generation
async function generateAndSwap() {
  if (!selectedMaterial.value || !aiPrompt.value || !vhackStore.geminiApiKey)
    return
  isGenerating.value = true
  aiError.value = null
  try {
    const map = selectedMaterial.value.map
    if (!map)
      throw new Error('No texture found on material')
    const canvas = document.createElement('canvas')
    const img = map.image
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx)
      throw new Error('Failed to create canvas context')
    ctx.drawImage(img, 0, 0)
    const base64Data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${vhackStore.geminiModel}:generateContent?key=${vhackStore.geminiApiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: aiPrompt.value },
            { inline_data: { mime_type: 'image/jpeg', data: base64Data } },
          ],
        }],
        generationConfig: { imageConfig: { aspectRatio: '1:1', imageSize: vhackStore.geminiResolution || '1K' } },
      }),
    })
    const json = await response.json()
    if (json.error) {
      aiError.value = json.error.message || 'Gemini API Error'
      return
    }
    const inlineData = json.candidates?.[0]?.content?.parts?.[0]?.inlineData
    if (inlineData?.data) {
      const newUrl = `data:${inlineData.mimeType};base64,${inlineData.data}`
      lastGeneratedUrl.value = newUrl
      swapTexture(newUrl)
    }
    else { aiError.value = 'No image data returned from Gemini' }
  }
  catch (e: any) { aiError.value = e.message || 'Generation failed' }
  finally { isGenerating.value = false }
}

function handleFileUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file || !selectedMaterial.value)
    return
  const reader = new FileReader()
  reader.onload = (e) => {
    const url = e.target?.result as string
    swapTexture(url)
    lastGeneratedUrl.value = url
  }
  reader.readAsDataURL(file)
}

function swapTexture(url: string) {
  if (!selectedMaterial.value)
    return
  const loader = new THREE.TextureLoader()
  loader.load(url, (tex: any) => {
    tex.flipY = false
    selectedMaterial.value.map = tex
    selectedMaterial.value.needsUpdate = true
  })
}

function revert() {
  if (!activeVrm.value)
    return
  activeVrm.value.scene.traverse((node: any) => {
    const snap = vhackStore.snapshotMap.get(node.uuid)
    if (snap) {
      node.visible = snap.visible
      if (!snap.visible)
        vhackStore.hiddenNodeUuids.add(node.uuid)
      else vhackStore.hiddenNodeUuids.delete(node.uuid)
      if (node.material && snap.props) {
        const mat = Array.isArray(node.material) ? node.material[0] : node.material
        if ('rimWidthFactor' in mat)
          mat.rimWidthFactor = snap.props.rimWidth
        else if (mat.uniforms?.rimWidth)
          mat.uniforms.rimWidth.value = snap.props.rimWidth
        if ('shadingShiftFactor' in mat)
          mat.shadingShiftFactor = snap.props.shadeShift
        else if (mat.uniforms?.shadingShift)
          mat.uniforms.shadingShift.value = snap.props.shadeShift
        if ('shadingToonyFactor' in mat)
          mat.shadingToonyFactor = snap.props.shadeToony
        else if (mat.uniforms?.shadingToony)
          mat.uniforms.shadingToony.value = snap.props.shadeToony
        mat.map = snap.props.map
        mat.needsUpdate = true
      }
    }
  })
  extractTextures()
  lastGeneratedUrl.value = null
  if (selectedMaterial.value)
    sourceTextureUrl.value = getTextureUrl(selectedMaterial.value.map)
}

watch(activeVrm, () => { if (activeVrm.value) { extractTextures(); takeGlobalSnapshot() } }, { immediate: true })
onMounted(() => {
  if (activeVrm.value)
    takeGlobalSnapshot()
})
</script>

<template>
  <div v-if="vhackStore.isHackerModeActive" class="animate-in fade-in slide-in-from-right-4 fixed bottom-4 right-4 top-24 z-50 w-80 flex flex-col overflow-hidden border border-white/10 rounded-2xl bg-black/95 shadow-2xl backdrop-blur-3xl">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-white/10 from-emerald-500/20 to-transparent bg-gradient-to-r p-4 text-[14px]">
      <div class="flex items-center gap-2 text-white font-black tracking-tighter uppercase">
        <div i-solar:mask-h-bold-duotone class="text-xl text-emerald-400" />V-HACK Inspector
      </div>
      <button class="text-neutral-400 transition hover:text-white" @click="vhackStore.closeHackerMode">
        <div i-solar:close-circle-bold-duotone />
      </button>
    </div>

    <!-- Tabs -->
    <div class="mx-4 mt-4 flex gap-1 rounded-lg bg-white/5 p-1 text-[10px] font-bold tracking-widest uppercase">
      <button :class="['flex-1 py-2 rounded-md transition', activeTab === 'tree' ? 'bg-emerald-500 text-black' : 'text-neutral-400 hover:bg-white/5']" @click="activeTab = 'tree'">
        Nodes
      </button>
      <button :class="['flex-1 py-2 rounded-md transition', activeTab === 'material' ? 'bg-emerald-500 text-black' : 'text-neutral-400 hover:bg-white/5']" @click="activeTab = 'material'">
        Lab
      </button>
      <button :class="['flex-1 py-2 rounded-md transition', activeTab === 'texture' ? 'bg-emerald-500 text-black' : 'text-neutral-400 hover:bg-white/5']" @click="activeTab = 'texture'">
        Deck
      </button>
    </div>

    <!-- Content -->
    <div ref="scrollContainer" class="custom-scrollbar flex-1 overflow-y-auto p-4">
      <!-- Tree View -->
      <div v-if="activeTab === 'tree'" class="space-y-1">
        <div v-for="node in nodes" :key="node.uuid" class="group flex cursor-pointer items-center justify-between border border-transparent rounded-lg p-2 text-xs transition hover:border-white/5 hover:bg-white/5" :class="{ 'bg-emerald-500/10 border-emerald-500/30': vhackStore.selectedNodeName === node.name }" @click="selectNode(node)">
          <div class="flex items-center gap-2 truncate">
            <div :class="[node.type === 'Mesh' ? 'i-solar:box-bold-duotone text-blue-400' : 'i-solar:user-bold-duotone text-purple-400']" /><span :class="[vhackStore.selectedNodeName === node.name ? 'text-emerald-400 font-bold' : 'text-neutral-300']">{{ node.name }}</span>
          </div>
          <button class="rounded p-1 transition hover:bg-white/10" @click.stop="toggleVisibility(node)">
            <div :class="[!vhackStore.hiddenNodeUuids.has(node.uuid) ? 'i-solar:eye-bold-duotone text-emerald-400' : 'i-solar:eye-closed-bold-duotone text-red-500']" />
          </button>
        </div>
      </div>

      <!-- Material Lab -->
      <div v-else-if="activeTab === 'material'" class="pb-20 space-y-6">
        <div v-if="selectedMaterial" class="space-y-4">
          <!-- TEXTURE FORGE (Top Priority) -->
          <div class="space-y-4">
            <div class="flex items-center justify-between px-1">
              <div class="flex items-center gap-2">
                <div i-solar:magic-stick-bold-duotone class="text-sm text-emerald-400" />
                <div class="text-[10px] text-white font-black tracking-widest uppercase">
                  Texture Forge
                </div>
              </div>
              <button class="text-neutral-500 transition hover:text-emerald-400" @click="vhackStore.showAiSettings = !vhackStore.showAiSettings">
                <div i-solar:settings-bold-duotone />
              </button>
            </div>

            <!-- AI Settings -->
            <div v-if="vhackStore.showAiSettings" class="animate-in fade-in slide-in-from-top-2 border border-emerald-500/20 rounded-xl bg-emerald-500/5 p-3 space-y-3">
              <div class="space-y-1">
                <div class="text-[8px] text-emerald-400 font-bold uppercase">
                  Gemini API Key
                </div><input v-model="vhackStore.geminiApiKey" type="password" placeholder="AIpk..." class="w-full border border-white/10 rounded-md bg-black/40 p-2 text-[10px] text-white outline-none">
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="space-y-1">
                  <div class="text-[8px] text-neutral-400 font-bold uppercase">
                    Model
                  </div><select v-model="vhackStore.geminiModel" class="w-full border border-white/10 rounded-md bg-black/40 p-1 text-[8px] text-white">
                    <option value="gemini-3.1-flash-image-preview">
                      Flash 2.0
                    </option><option value="gemini-3-pro-image-preview">
                      Pro 2.0
                    </option><option value="gemini-2.5-flash-image">
                      Flash 1.5
                    </option>
                  </select>
                </div>
                <div class="space-y-1">
                  <div class="text-[8px] text-neutral-400 font-bold uppercase">
                    Res
                  </div><select v-model="vhackStore.geminiResolution" class="w-full border border-white/10 rounded-md bg-black/40 p-1 text-[8px] text-white">
                    <option value="1K">
                      1K
                    </option><option value="2K">
                      2K
                    </option><option value="4K">
                      4K
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Before/After View -->
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1">
                <div class="px-1 text-[8px] text-neutral-500 font-bold uppercase">
                  Source
                </div>
                <div class="group relative aspect-square overflow-hidden border border-white/5 rounded-lg bg-white/5">
                  <img v-if="sourceTextureUrl" :src="sourceTextureUrl" class="h-full w-full object-cover opacity-60 transition group-hover:opacity-100"><div class="absolute inset-0 from-black/60 to-transparent bg-gradient-to-t" /><div class="absolute bottom-1 left-1 truncate text-[7px] text-neutral-400 font-bold uppercase">
                    {{ selectedMaterial.name }}
                  </div>
                </div>
              </div>
              <div class="space-y-1">
                <div class="px-1 text-[8px] text-emerald-500 font-bold uppercase">
                  {{ lastGeneratedUrl ? 'Result' : 'Idle' }}
                </div>
                <div class="relative aspect-square flex items-center justify-center overflow-hidden border border-emerald-500/20 rounded-lg border-dashed bg-emerald-500/5">
                  <img v-if="lastGeneratedUrl" :src="lastGeneratedUrl" class="animate-in fade-in zoom-in-95 h-full w-full object-cover"><div v-else-if="isGenerating" class="flex flex-col items-center gap-2">
                    <div i-solar:spinner-bold class="animate-spin text-xl text-emerald-500" /><span class="animate-pulse text-[7px] text-emerald-500 font-bold uppercase">Painting...</span>
                  </div><div v-else i-solar:ghost-bold-duotone class="text-2xl text-white/5" />
                </div>
              </div>
            </div>

            <div v-if="aiError" class="border border-red-500/30 rounded-lg bg-red-500/10 p-2 text-[8px] text-red-400 font-mono">
              {{ aiError }}
            </div>

            <!-- PRESET PALETTE (New) -->
            <div class="space-y-2">
              <button class="group w-full flex items-center justify-between border border-white/10 rounded-lg bg-white/5 p-2 transition hover:border-emerald-500/30" @click="showPresets = !showPresets">
                <div class="flex items-center gap-2">
                  <div i-solar:palette-bold-duotone class="text-xs text-emerald-400" />
                  <span class="text-[10px] text-neutral-300 font-bold tracking-wider uppercase">Preset Palette</span>
                </div>
                <div :class="[showPresets ? 'i-solar:alt-arrow-down-bold-duotone' : 'i-solar:alt-arrow-right-bold-duotone']" class="text-neutral-500 transition group-hover:text-emerald-400" />
              </button>
              <div v-if="showPresets" class="animate-in fade-in slide-in-from-top-1 grid grid-cols-2 gap-2 border border-white/5 rounded-lg bg-black/40 p-2">
                <button
                  v-for="preset in presets" :key="preset.id"
                  class="flex items-center gap-2 border border-transparent rounded-md bg-white/5 p-2 text-left transition hover:border-emerald-500/30 hover:bg-emerald-500/20"
                  @click="injectPreset(preset.text)"
                >
                  <div :class="preset.icon" class="shrink-0 text-xs text-emerald-400" />
                  <div class="truncate text-[9px] text-neutral-300 font-bold leading-tight">
                    {{ preset.label }}
                  </div>
                </button>
              </div>
            </div>

            <textarea v-model="aiPrompt" placeholder="Describe the style change..." class="h-20 w-full resize-none border border-white/10 rounded-xl bg-white/5 p-3 text-xs text-white font-mono outline-none transition focus:border-emerald-500/50" />
            <Button variant="primary" class="w-full font-bold uppercase shadow-emerald-500/10 shadow-lg" :disabled="!aiPrompt || isGenerating || !vhackStore.geminiApiKey" @click="generateAndSwap">
              {{ isGenerating ? 'Inscribing...' : 'Paint New Texture' }}
            </Button>
          </div>

          <!-- PHYSICAL SHADERS -->
          <div class="border-t border-white/5 pt-6 space-y-5">
            <div class="flex items-center gap-2 px-1">
              <div i-solar:atom-bold-duotone class="text-sm text-blue-400" /><div class="text-[10px] text-neutral-400 font-bold tracking-widest uppercase">
                Physical Shaders
              </div>
            </div>
            <div class="space-y-4">
              <div class="space-y-2">
                <div class="flex justify-between px-1 text-[10px] text-neutral-400 font-bold uppercase">
                  <span>Rim Width</span><span class="text-emerald-400 font-mono">{{ (selectedMaterial.rimWidthFactor ?? selectedMaterial.uniforms?.rimWidth?.value ?? 0).toFixed(2) }}</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" :value="selectedMaterial.rimWidthFactor ?? selectedMaterial.uniforms?.rimWidth?.value ?? 0" class="h-1 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)]" @input="e => updateProp('rimWidth', parseFloat((e.target as HTMLInputElement).value))">
              </div>
              <div class="space-y-2">
                <div class="flex justify-between px-1 text-[10px] text-neutral-400 font-bold uppercase">
                  <span>Shade Shift</span><span class="text-emerald-400 font-mono">{{ (selectedMaterial.shadingShiftFactor ?? selectedMaterial.uniforms?.shadingShift?.value ?? 0).toFixed(2) }}</span>
                </div>
                <input type="range" min="-1" max="1" step="0.01" :value="selectedMaterial.shadingShiftFactor ?? selectedMaterial.uniforms?.shadingShift?.value ?? 0" class="h-1 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)]" @input="e => updateProp('shadeShift', parseFloat((e.target as HTMLInputElement).value))">
              </div>
            </div>
          </div>
        </div>
        <div v-else class="h-40 flex flex-col items-center justify-center gap-2 text-xs text-neutral-600 italic">
          <div i-solar:shield-warning-bold-duotone text-2xl />Select mesh in "Nodes" first
        </div>
      </div>

      <!-- Texture Deck -->
      <div v-else-if="activeTab === 'texture'" class="space-y-4">
        <div v-if="lastSelectedTextureItem" class="border border-emerald-500/30 rounded-xl bg-white/5 p-3">
          <div class="mb-3 flex items-start justify-between">
            <div class="text-[10px] text-neutral-500 font-bold uppercase">
              Associated Nodes
            </div><button class="text-neutral-500 transition" @click="lastSelectedTextureItem = null">
              <div i-solar:close-circle-bold-duotone />
            </button>
          </div><div class="custom-scrollbar max-h-32 overflow-y-auto space-y-1">
            <div v-for="nodeItem in associatedNodesForTexture" :key="nodeItem.uuid" class="group flex cursor-pointer items-center justify-between rounded-lg bg-black/40 p-2 transition hover:bg-emerald-500/20" @click="jumpToNode(nodeItem)">
              <span class="truncate text-[10px] text-neutral-300 font-mono uppercase">{{ nodeItem.name }}</span><div i-solar:alt-arrow-right-bold-duotone class="text-emerald-500" />
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3 pb-8">
          <div v-for="item in textureList" :key="item.id" class="group flex flex-col cursor-pointer gap-1 text-[8px] font-bold uppercase" @click="selectTexture(item)">
            <div class="relative aspect-square overflow-hidden border border-white/10 rounded-xl bg-white/5 transition" :class="[lastSelectedTextureItem?.id === item.id ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'group-hover:border-white/30']">
              <img v-if="item.url" :src="item.url" class="absolute inset-0 h-full w-full object-cover opacity-60 transition group-hover:opacity-100"><div v-else i-solar:gallery-bold-duotone class="h-full flex items-center justify-center text-3xl text-neutral-800" /><div class="absolute right-1 top-1 rounded bg-black/80 px-1 py-0.5 text-[7px] text-emerald-400">
                {{ item.type }}
              </div>
            </div>
          </div>
          <label class="group mb-10 aspect-square flex flex-col cursor-pointer items-center justify-center border border-white/10 rounded-xl border-dashed bg-white/5 transition hover:border-emerald-500"><input type="file" class="hidden" accept="image/*" @change="handleFileUpload"><div i-solar:add-circle-bold-duotone class="text-3xl transition group-hover:text-emerald-500" /></label>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="flex flex-col gap-2 border-t border-white/10 bg-black/80 p-4">
      <div class="flex items-center justify-between px-1 text-[10px] text-neutral-500 font-bold uppercase">
        <span>Status</span><span :class="activeVrm ? 'text-emerald-500' : 'text-red-500'">{{ activeVrm ? 'CONNECTED' : 'OFFLINE' }}</span>
      </div>
      <Button variant="secondary" size="sm" class="w-full bg-white/5 text-xs font-bold tracking-widest" :disabled="!activeVrm" @click="revert">
        REVERT ALL CHANGES
      </Button>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; height: 12px; width: 12px; border-radius: 50%; background: #10b981; cursor: pointer; }
</style>
