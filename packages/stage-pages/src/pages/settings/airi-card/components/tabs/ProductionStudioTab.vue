<script setup lang="ts">
import type { AiriCard } from '@proj-airi/stage-ui/stores/modules/airi-card'

import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useAutonomousArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry-autonomous'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import ConceptBuilderModal from '../ConceptBuilderModal.vue'

const props = defineProps<{
  cardId: string
  card: AiriCard
}>()

const { t } = useI18n()
const cardStore = useAiriCardStore()
const backgroundStore = useBackgroundStore()
const autonomousArtistryStore = useAutonomousArtistryStore()

const showBuilder = ref(false)
const editingConceptId = ref<string>()
const editingConceptData = ref<{ description: string, prompt: string }>()

function handleAddConcept() {
  editingConceptId.value = undefined
  editingConceptData.value = undefined
  showBuilder.value = true
}

function handleEditConcept(id: string, data: any) {
  editingConceptId.value = id
  editingConceptData.value = { ...data }
  showBuilder.value = true
}

function handleSaveConcept(payload: { id: string, data: any }) {
  const newVisualAssets = { ...visualAssets.value, [payload.id]: payload.data }

  // Update card store with new visual assets
  const extension = JSON.parse(JSON.stringify(props.card.extensions || {}))
  if (!extension.airi)
    extension.airi = {}
  extension.airi.visual_assets = newVisualAssets

  cardStore.updateCard(props.cardId, {
    ...props.card,
    extensions: extension,
  })
}

const visualAssets = computed(() => props.card.extensions?.airi?.visual_assets || {})
const journalEntries = computed(() => backgroundStore.getCharacterJournalEntries(props.cardId))
const directorNotes = computed(() => autonomousArtistryStore.directorNotes.slice(-5).reverse())

// Mock active concepts for now
const activeConcepts = computed(() => {
  // In a real implementation, this would come from a store tracking the current "stack"
  return Object.keys(visualAssets.value).slice(0, 2)
})
</script>

<template>
  <div class="h-full flex flex-col gap-6 overflow-hidden lg:flex-row">
    <!-- Left Pane: The Stage / Production Controls -->
    <div class="custom-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto pr-2">
      <!-- Active Concepts Stack -->
      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h3 class="flex items-center gap-2 text-xs text-neutral-400 font-bold tracking-widest uppercase">
            <div i-solar:layers-minimalistic-bold-duotone class="text-primary-500" />
            Active Concept Stack
          </h3>
          <span class="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500 dark:bg-neutral-800">
            {{ activeConcepts.length }} Active
          </span>
        </div>

        <div class="min-h-12 flex flex-wrap gap-2 border border-neutral-200 rounded-xl border-dashed bg-neutral-50/30 p-3 dark:border-neutral-700 dark:bg-black/20">
          <div
            v-for="conceptId in activeConcepts"
            :key="conceptId"
            class="group animate-in fade-in zoom-in relative flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-1.5 text-white shadow-lg shadow-primary-500/20 duration-300"
          >
            <div i-solar:stars-minimalistic-bold class="text-xs" />
            <span class="text-xs font-bold">{{ conceptId }}</span>
            <button class="ml-1 rounded opacity-0 transition-opacity hover:bg-white/20 group-hover:opacity-100">
              <div i-solar:close-circle-linear class="text-xs" />
            </button>
          </div>

          <div v-if="activeConcepts.length === 0" class="w-full flex items-center justify-center py-2 text-xs text-neutral-400 italic">
            No concepts currently stacked.
          </div>
        </div>
      </section>

      <!-- Concept Registry (The Closet) -->
      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h3 class="flex items-center gap-2 text-xs text-neutral-400 font-bold tracking-widest uppercase">
            <div i-solar:box-minimalistic-bold-duotone class="text-primary-500" />
            Concept Registry
          </h3>
          <button
            class="text-[10px] text-primary-500 font-bold hover:underline"
            @click="handleAddConcept"
          >
            + New Concept
          </button>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            v-for="(asset, id) in visualAssets"
            :key="id"
            class="group cursor-pointer border border-neutral-200 rounded-xl bg-white p-3 transition-all dark:border-neutral-700 hover:border-primary-400 dark:bg-neutral-800/50 dark:hover:border-primary-500/50"
            @click="handleEditConcept(id as string, asset)"
          >
            <div class="mb-1 flex items-center justify-between">
              <span class="text-xs text-neutral-700 font-bold transition-colors dark:text-neutral-200 group-hover:text-primary-500">{{ id }}</span>
              <div v-if="activeConcepts.includes(id as string)" i-solar:check-circle-bold class="text-xs text-primary-500" />
            </div>
            <p class="line-clamp-2 text-[10px] text-neutral-500 leading-relaxed">
              {{ asset.description }}
            </p>
            <div class="mt-2 overflow-hidden border-t border-neutral-100 pt-2 dark:border-neutral-700/50">
              <code class="block truncate text-[9px] text-neutral-400 font-mono italic">
                {{ asset.prompt }}
              </code>
            </div>
          </div>
        </div>
      </section>

      <!-- Director's Monitor -->
      <section class="mt-2 flex flex-col gap-3">
        <h3 class="flex items-center gap-2 text-xs text-neutral-400 font-bold tracking-widest uppercase">
          <div i-solar:monitor-camera-bold-duotone class="text-primary-500" />
          Director's Monitor
        </h3>

        <div class="flex flex-col gap-2">
          <div
            v-for="note in directorNotes"
            :key="note.id"
            class="animate-in slide-in-from-left-2 border border-neutral-200 rounded-xl bg-neutral-100/50 p-3 duration-300 dark:border-neutral-800 dark:bg-neutral-900/50"
          >
            <div class="mb-2 flex items-center justify-between">
              <span class="rounded bg-neutral-200 px-2 py-0.5 text-[10px] text-neutral-500 font-bold dark:bg-neutral-800">
                {{ note.title || 'Untitled Scene' }}
              </span>
              <span
                :class="[
                  'text-[10px] font-mono font-bold',
                  note.intensity >= 70 ? 'text-green-500' : 'text-neutral-400',
                ]"
              >
                Intensity: {{ note.intensity }}%
              </span>
            </div>
            <p class="text-[11px] text-neutral-600 leading-normal italic dark:text-neutral-400">
              "{{ note.content }}"
            </p>
            <div v-if="note.selected_concepts?.length" class="mt-2 flex gap-1">
              <span
                v-for="c in note.selected_concepts"
                :key="c"
                class="border border-primary-500/20 rounded-md bg-primary-500/10 px-1.5 py-0.5 text-[9px] text-primary-500 font-bold"
              >
                {{ c }}
              </span>
            </div>
          </div>

          <div v-if="directorNotes.length === 0" class="border border-neutral-200 rounded-xl border-dashed py-8 text-center dark:border-neutral-800">
            <div i-solar:videocamera-record-linear class="mx-auto mb-2 text-2xl text-neutral-300" />
            <p class="text-xs text-neutral-400">
              Waiting for first production session...
            </p>
          </div>
        </div>
      </section>
    </div>

    <!-- Right Pane: Production Output (Gallery Preview) -->
    <div class="w-full flex flex-col gap-4 border-l border-neutral-100 pl-0 lg:w-80 dark:border-neutral-700/50 lg:pl-4">
      <h3 class="flex items-center gap-2 text-xs text-neutral-400 font-bold tracking-widest uppercase">
        <div i-solar:gallery-wide-bold-duotone class="text-primary-500" />
        Production Journal
      </h3>

      <div class="custom-scrollbar grid grid-cols-2 gap-3 overflow-y-auto pr-1 lg:grid-cols-1">
        <div
          v-for="entry in journalEntries.slice(0, 8)"
          :key="entry.id"
          class="group relative aspect-square overflow-hidden border border-neutral-200 rounded-xl bg-neutral-100 shadow-sm transition-transform hover:scale-[1.02] dark:border-neutral-800 dark:bg-neutral-900"
        >
          <img
            :src="backgroundStore.getBackgroundUrl(entry.id) ?? undefined"
            class="h-full w-full object-cover"
            loading="lazy"
          >
          <div class="absolute inset-0 flex flex-col justify-end from-black/80 via-transparent to-transparent bg-gradient-to-t p-3 opacity-0 transition-opacity group-hover:opacity-100">
            <span class="truncate text-[10px] text-white font-bold">{{ entry.title }}</span>
            <button class="mt-2 rounded bg-white/20 py-1 text-[9px] text-white font-bold backdrop-blur-md transition-colors hover:bg-white/30">
              VIEW DETAILS
            </button>
          </div>
        </div>

        <div v-if="journalEntries.length === 0" class="aspect-square flex flex-col items-center justify-center border border-neutral-200 rounded-xl border-dashed bg-neutral-50/50 dark:border-neutral-800 dark:bg-black/10">
          <div i-solar:album-linear class="mb-2 text-3xl text-neutral-200" />
          <p class="px-4 text-center text-[10px] text-neutral-400 leading-tight">
            No generated content for this production yet.
          </p>
        </div>
      </div>

      <button class="mt-auto w-full rounded-xl bg-neutral-100 py-2.5 text-[10px] text-neutral-500 font-bold tracking-widest uppercase transition-colors dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700">
        Open Full Gallery
      </button>
    </div>
  </div>

  <!-- Concept Builder Modal -->
  <ConceptBuilderModal
    v-model="showBuilder"
    :concept-id="editingConceptId"
    :initial-data="editingConceptData"
    @save="handleSaveConcept"
  />
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 10px;
}
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}
</style>
