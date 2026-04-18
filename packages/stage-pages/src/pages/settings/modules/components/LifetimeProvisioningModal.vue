<script setup lang="ts">
import { useMemoryLifetimeStore } from '@proj-airi/stage-ui/stores/memory-lifetime'
import { Button } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  characterId: string
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const store = useMemoryLifetimeStore()
const { isProvisioning, progress, error, activeSession } = storeToRefs(store)

const sourceCounts = ref({ raw: 0, stmm: 0, ltmm: 0 })
const isLoadingCounts = ref(false)
const requestInterval = ref(0)

const estimatedCalls = computed(() => {
  const chunkSize = 20
  const totalDocs = sourceCounts.value.raw + sourceCounts.value.stmm + sourceCounts.value.ltmm
  const chunkCount = Math.ceil(totalDocs / chunkSize)
  return chunkCount + 3 // N chunk calls + 1 base synthesis + 2 distill passes
})

const estimatedChunks = computed(() => {
  const chunkSize = 20
  const totalDocs = sourceCounts.value.raw + sourceCounts.value.stmm + sourceCounts.value.ltmm
  return Math.ceil(totalDocs / chunkSize)
})

const estimatedDuration = computed(() => {
  const totalCalls = estimatedCalls.value
  const totalCooldown = totalCalls * requestInterval.value
  // Assuming 10s per call avg
  const totalSeconds = totalCooldown + (totalCalls * 10)
  const mins = Math.floor(totalSeconds / 60)
  return mins > 0 ? `${mins}m ${totalSeconds % 60}s` : `${totalSeconds}s`
})

async function loadCounts() {
  isLoadingCounts.value = true
  try {
    const docs = await store.collectSourceDocs(props.characterId)
    sourceCounts.value = {
      raw: docs.filter(d => d.layer === 'raw').length,
      stmm: docs.filter(d => d.layer === 'stmm').length,
      ltmm: docs.filter(d => d.layer === 'ltmm').length,
    }
    // Also load session state
    await store.loadForCharacter(props.characterId)
  }
  finally {
    isLoadingCounts.value = false
  }
}

async function startProvisioning() {
  await store.provision(props.characterId, false, requestInterval.value)
}

async function resumeProvisioning() {
  await store.provision(props.characterId, true, requestInterval.value)
}

async function restartProvisioning() {
  await store.restart(props.characterId)
}

function close() {
  emit('update:open', false)
}

watch(() => props.open, (isOpen) => {
  if (isOpen)
    loadCounts()
}, { immediate: true })

const progressPercent = computed(() => {
  if (progress.value.totalCalls > 0) {
    return (progress.value.completedCalls / progress.value.totalCalls) * 100
  }
  return 0
})

const phaseLabel = computed(() => {
  switch (progress.value.phase) {
    case 'aggregating': return 'Phase 1/4: Gathering History'
    case 'chunking': return `Phase 1/4: Analyzing Chunks (${progress.value.currentChunk}/${progress.value.totalChunks})`
    case 'synthesizing': return 'Phase 2/4: Synthesizing Base Archive'
    case 'distill_pass_1': return 'Phase 3/4: Dedupe Pass'
    case 'distill_pass_2': return 'Phase 4/4: Dense Distill Pass'
    case 'success': return 'Provisioning Complete'
    default: return 'Preparing'
  }
})

const canResume = computed(() => !!activeSession.value)
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 max-h-[85vh] max-w-lg w-[90vw] border border-neutral-200 rounded-3xl bg-white p-6 shadow-2xl transition-all -translate-x-1/2 -translate-y-1/2 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div class="flex flex-col gap-6">
          <header class="flex items-start justify-between">
            <div>
              <h2 class="text-xl text-neutral-800 font-bold dark:text-neutral-100">
                Manage Lifetime History
              </h2>
              <p class="text-sm text-neutral-500">
                Provision this character's relational soul-bond.
              </p>
            </div>
            <button class="text-neutral-400 hover:text-neutral-600" @click="close">
              <div class="i-solar:close-circle-bold-duotone text-2xl" />
            </button>
          </header>

          <!-- Pre-provisioning View -->
          <div v-if="(progress.phase === 'idle' || progress.phase === 'error') && !isProvisioning" class="flex flex-col gap-6">
            <!-- Resume Prompt -->
            <div v-if="canResume" class="border border-primary-500/20 rounded-2xl bg-primary-500/5 p-4 dark:border-primary-400/20 dark:bg-primary-400/5">
              <div class="flex items-center gap-2 text-primary-600 dark:text-primary-400">
                <div class="i-solar:restart-bold-duotone text-lg" />
                <span class="text-sm font-bold tracking-tight uppercase">Incomplete Session Found</span>
              </div>
              <p class="mt-2 text-xs text-neutral-600 leading-relaxed dark:text-neutral-400">
                A previous provisioning attempt was interrupted at <strong>{{ activeSession?.phase }}</strong>. Would you like to resume?
              </p>
              <div class="mt-4 flex gap-2">
                <Button label="Resume Session" variant="primary" size="sm" @click="resumeProvisioning" />
                <Button label="Restart from Scratch" variant="secondary" size="sm" @click="restartProvisioning" />
              </div>
            </div>

            <div v-else class="grid grid-cols-3 gap-3">
              <div class="border border-neutral-100 rounded-2xl bg-neutral-50 p-4 text-center dark:border-neutral-800 dark:bg-neutral-800/50">
                <div class="text-xs text-neutral-400 font-bold uppercase">
                  Raw Turns
                </div>
                <div class="text-xl font-bold">
                  {{ isLoadingCounts ? '...' : sourceCounts.raw }}
                </div>
              </div>
              <div class="border border-neutral-100 rounded-2xl bg-neutral-50 p-4 text-center dark:border-neutral-800 dark:bg-neutral-800/50">
                <div class="text-xs text-neutral-400 font-bold uppercase">
                  STMM Blocks
                </div>
                <div class="text-xl font-bold">
                  {{ isLoadingCounts ? '...' : sourceCounts.stmm }}
                </div>
              </div>
              <div class="border border-neutral-100 rounded-2xl bg-neutral-50 p-4 text-center dark:border-neutral-800 dark:bg-neutral-800/50">
                <div class="text-xs text-neutral-400 font-bold uppercase">
                  LTMM Records
                </div>
                <div class="text-xl font-bold">
                  {{ isLoadingCounts ? '...' : sourceCounts.ltmm }}
                </div>
              </div>
            </div>

            <!-- Request Interval Setting -->
            <div class="border border-neutral-100 rounded-2xl bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/30">
              <div class="mb-3 flex items-center justify-between">
                <div class="flex items-center gap-2 text-neutral-600 dark:text-neutral-300">
                  <div class="i-solar:stopwatch-bold-duotone text-lg" />
                  <span class="text-xs font-bold tracking-tight uppercase">Request Interval</span>
                </div>
                <span class="text-xs text-primary-500 font-bold">{{ requestInterval }}s Cooldown</span>
              </div>
              <input
                v-model.number="requestInterval"
                type="range"
                min="0"
                max="600"
                step="10"
                class="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-neutral-200 accent-primary-500 dark:bg-neutral-700"
              >
              <div class="mt-2 flex justify-between text-[10px] text-neutral-400 font-medium">
                <span>0s (Instant)</span>
                <span>10m (Safe)</span>
              </div>
            </div>

            <div v-if="!canResume" class="border border-amber-500/20 rounded-2xl bg-amber-500/5 p-4 dark:border-amber-400/20 dark:bg-amber-400/5">
              <div class="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <div class="i-solar:shield-warning-bold-duotone text-lg" />
                <span class="text-sm font-bold tracking-tight uppercase">Provisioning Impact</span>
              </div>
              <p class="mt-2 text-xs text-neutral-600 leading-relaxed dark:text-neutral-400">
                This will process <strong>{{ estimatedChunks }} chunks</strong>, then synthesize a base archive and run two distill passes.
                Estimated <strong>{{ estimatedCalls }} API calls</strong>.
                Est. time: <strong>{{ estimatedDuration }}</strong>.
              </p>
            </div>

            <div v-if="error" class="border border-red-500/20 rounded-xl bg-red-500/5 p-3 text-sm text-red-500">
              {{ error }}
            </div>

            <div v-if="!canResume" class="flex gap-3">
              <Button label="Cancel" variant="secondary" block @click="close" />
              <Button
                label="Start Distillation"
                variant="primary"
                block
                :disabled="isLoadingCounts || sourceCounts.raw + sourceCounts.stmm + sourceCounts.ltmm === 0"
                @click="startProvisioning"
              />
            </div>
          </div>

          <!-- Progress View -->
          <div v-else-if="progress.phase !== 'success'" class="flex flex-col items-center gap-6 py-8">
            <div class="relative h-24 w-24 flex items-center justify-center">
              <div class="absolute inset-0 animate-spin border-4 border-primary-500/20 border-t-primary-500 rounded-full" />
              <div class="i-solar:dna-bold-duotone text-4xl text-primary-500" />
            </div>

            <div class="w-full text-center space-y-2">
              <h3 class="text-lg font-bold transition-all">
                {{ phaseLabel }}
              </h3>
              <p class="min-h-[1.25rem] text-sm text-neutral-500">
                {{ progress.message }}
              </p>
            </div>

            <div class="w-full space-y-2">
              <div class="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <div
                  class="h-full bg-primary-500 transition-all duration-500 ease-out"
                  :style="{ width: `${progressPercent}%` }"
                />
              </div>
              <div class="flex justify-between text-[10px] text-neutral-400 font-bold tracking-widest uppercase">
                <span>Progress</span>
                <span>{{ Math.round(progressPercent) }}%</span>
              </div>
            </div>
          </div>

          <!-- Success View -->
          <div v-else class="flex flex-col items-center gap-6 py-8 text-center">
            <div class="size-20 flex items-center justify-center rounded-full bg-emerald-500/10 dark:bg-emerald-400/10">
              <div class="i-solar:check-circle-bold-duotone text-5xl text-emerald-500 dark:text-emerald-400" />
            </div>
            <div class="space-y-1">
              <h3 class="text-xl font-bold">
                Soul-Bond Initialized
              </h3>
              <p class="text-sm text-neutral-500">
                The canonical relational thread has been distilled and bound to this character.
              </p>
            </div>
            <Button label="Close" variant="primary" block @click="close" />
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
