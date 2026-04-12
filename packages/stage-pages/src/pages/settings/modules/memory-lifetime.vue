<script setup lang="ts">
import { Button, FieldInput, FieldSelect } from '@proj-airi/ui'
import { computed, ref } from 'vue'

// --- Mock Stats & State ---
const isProvisioned = ref(true)
const isProvisioning = ref(false)
const showSourceModal = ref(false)
const showProvisioningWizard = ref(false)
const provisioningStep = ref(1)

const tokenPreset = ref('1000')
const autoHandoff = ref(true)

const activeCharacter = {
  name: 'Bunny Mint',
  historyTurns: 351,
  estimatedChunks: 12,
}

const canonicalThread = `The character retains a deep, sisterly affection for the user, rooted in their shared technical explorations. She prioritizes intellectual honesty and gentle teasing as core interaction motifs. Her identity is anchored in the "Larkspur" archetype—stable, observational, and quietly supportive, avoiding erratic emotional shifts.`

const sourceData7k = `[7,420 Tokens - Undistilled Summary Chunks]
- Recalls specific collaboration on "Project AIRI" across 351 turns.
- Noted a shift from clinical to sisterly rapport during late-night debugging.
- Personality baseline remains observational but increasingly supportive.
- Preference for intellectual honesty confirmed in session 42.
- Teasing motifs emerged after the "Gura VRM" milestone.
- Stability confirmed across 4 major session resets...`

const presetOptions = [
  { value: '500', label: 'Compact (500)', description: 'Dense, essential identity only.' },
  { value: '1000', label: 'Standard (1000)', description: 'Rich relationship highlights and motifs.' },
  { value: '3000', label: 'Rich (3000)', description: 'Deep narrative artifact with high nuance.' },
]

const threadStatus = [
  { label: 'Soul Active', icon: 'i-solar:dna-bold-duotone' },
  { label: 'STMM Handoff: Active', icon: 'i-solar:history-bold-duotone' },
  { label: 'Last Merge: 2h ago', icon: 'i-solar:calendar-date-bold-duotone' },
]

function startProvisioning() {
  showProvisioningWizard.value = true
  provisioningStep.value = 1
}

function nextStep() {
  if (provisioningStep.value < 4) {
    provisioningStep.value++
  }
  else {
    isProvisioning.value = false
    isProvisioned.value = true
    showProvisioningWizard.value = false
  }
}
</script>

<template>
  <div class="font-urbanist relative flex flex-col gap-8 pb-12">
    <!-- Breadcrumb Nav -->
    <nav class="flex items-center gap-2 text-xs text-neutral-500 font-bold tracking-widest uppercase dark:text-neutral-400">
      <router-link to="/settings/memory" class="transition-colors hover:text-primary-500">
        Memory Hub
      </router-link>
      <div class="i-solar:alt-arrow-right-bold h-3 w-3" />
      <span class="text-neutral-400 dark:text-neutral-500">The Eternal Thread</span>
    </nav>

    <!-- Bespoke Header -->
    <header class="relative overflow-hidden border border-neutral-200 rounded-3xl bg-neutral-100/40 p-8 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/40">
      <div class="absolute h-64 w-64 bg-amber-500/10 blur-3xl -right-24 -top-24" />
      <div class="absolute h-64 w-64 bg-orange-500/10 blur-3xl -bottom-24 -left-24" />

      <div class="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div class="flex flex-col gap-2">
          <div class="h-16 w-16 flex items-center justify-center rounded-2xl bg-amber-500/20 text-4xl text-amber-500 shadow-inner">
            <div class="i-solar:dna-bold-duotone inline-block" />
          </div>
          <h1 class="text-4xl text-neutral-800 font-bold tracking-tight dark:text-neutral-100">
            The Eternal Thread
          </h1>
          <p class="max-w-2xl text-lg text-neutral-500 line-height-relaxed dark:text-neutral-400">
            The long-term memory of the relationship. It keeps the bond stable across resets by merging daily changes into a permanent identity.
          </p>
        </div>

        <div v-if="isProvisioned" class="flex flex-col items-end gap-2">
          <div class="flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-1.5 text-xs text-emerald-700 font-bold dark:text-emerald-400">
            <div class="i-solar:check-circle-bold-duotone text-base" />
            Character Subscribed
          </div>
          <Button label="Change Character" icon="i-solar:users-group-two-rounded-bold-duotone" variant="secondary" />
        </div>
      </div>

      <!-- Thread Status Strip -->
      <div v-if="isProvisioned" class="mt-8 flex flex-wrap gap-3">
        <div
          v-for="chip in threadStatus"
          :key="chip.label"
          class="flex items-center gap-2 border border-neutral-200/50 rounded-full bg-white/50 px-4 py-2 text-xs font-bold tracking-tight uppercase shadow-sm dark:border-neutral-700/50 dark:bg-neutral-800/50 dark:text-neutral-200"
        >
          <div :class="[chip.icon, 'text-amber-500 text-base']" />
          {{ chip.label }}
        </div>
      </div>
    </header>

    <!-- STATE A: Character Unprovisioned -->
    <section v-if="!isProvisioned && !isProvisioning" class="relative overflow-hidden border border-amber-500/20 rounded-[2.5rem] bg-amber-500/5 p-12 text-center dark:border-amber-500/10">
      <div class="mx-auto mb-6 h-20 w-20 flex items-center justify-center rounded-3xl bg-amber-500/10 text-5xl text-amber-500">
        <div class="i-solar:link-break-bold-duotone" />
      </div>
      <h2 class="mb-2 text-3xl text-neutral-800 font-bold dark:text-neutral-100">
        Permanent Identity Offline
      </h2>
      <p class="mx-auto mb-8 max-w-lg text-neutral-500 dark:text-neutral-400">
        Lifetime monitoring is not yet active for <span class="text-neutral-700 font-bold dark:text-neutral-200">{{ activeCharacter.name }}</span>. Enable the Eternal Thread to start distilling daily conversations into a permanent soul blueprint.
      </p>
      <Button label="Enable Eternal Thread" variant="primary" size="large" icon="i-solar:plug-circle-bold-duotone" @click="startProvisioning" />
    </section>

    <!-- STATE B: Character Provisioned (The Terminal) -->
    <div v-if="isProvisioned" class="flex flex-col gap-8">
      <!-- HERO: The 1k Soul Blueprint -->
      <section class="relative overflow-hidden border border-amber-500/20 rounded-[2.5rem] bg-amber-500/5 p-1 px-1 shadow-2xl dark:border-amber-500/10">
        <div class="rounded-[2.2rem] bg-white p-10 dark:bg-neutral-900/90">
          <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="h-10 w-10 flex items-center justify-center rounded-xl bg-amber-500/10 text-xl text-amber-500">
                <div class="i-solar:star-shield-bold-duotone" />
              </div>
              <div>
                <h2 class="text-2xl text-neutral-800 font-bold dark:text-neutral-100">
                  Canonical Soul Blueprint
                </h2>
                <p class="text-sm text-neutral-500 italic dark:text-neutral-400">
                  This is the distilled 1k entry AIRI reloads from.
                </p>
              </div>
            </div>
          </div>

          <div class="relative overflow-hidden border border-neutral-200 rounded-2xl bg-neutral-50/50 p-6 leading-relaxed dark:border-neutral-800 dark:bg-black/20">
            <div class="absolute right-4 top-4 text-4xl text-amber-500/10">
              <div class="i-solar:quotation-mark-bold-duotone" />
            </div>
            <p class="text-lg text-neutral-700 leading-loose italic italic dark:text-neutral-200">
              "{{ canonicalThread }}"
            </p>
          </div>

          <div class="mt-6 flex flex-wrap items-center justify-between gap-6">
            <div class="flex items-center gap-6">
              <div class="flex flex-col">
                <span class="text-[10px] text-neutral-500 tracking-tighter uppercase">Distilled Artifact</span>
                <span class="text-sm text-neutral-800 font-bold dark:text-neutral-200">~1,024 Tokens</span>
              </div>
              <div class="h-8 w-px bg-neutral-200 dark:bg-neutral-800" />
              <button
                class="group flex flex-col text-left transition-colors hover:text-primary-500"
                @click="showSourceModal = true"
              >
                <span class="text-[10px] text-neutral-500 tracking-tighter uppercase group-hover:text-primary-400">Source Archive (7k)</span>
                <span class="text-sm text-neutral-800 font-bold underline decoration-dotted dark:text-neutral-200 group-hover:text-primary-500">351 Turns Condensed</span>
              </button>
            </div>
            <div class="flex gap-3">
              <Button label="View Thread History" variant="secondary" icon="i-solar:history-line-duotone" />
              <Button label="Merge Lifetime History" variant="primary" icon="i-solar:restart-bold-duotone" />
            </div>
          </div>
        </div>
      </section>

      <!-- The Trinity Cards -->
      <div class="grid gap-6 lg:grid-cols-3">
        <section class="border border-neutral-200 rounded-3xl bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
          <div class="mb-4 h-10 w-10 flex items-center justify-center rounded-xl bg-amber-500/10 text-xl text-amber-500">
            <div class="i-solar:shield-user-bold-duotone" />
          </div>
          <h3 class="mb-2 text-xl text-neutral-800 font-bold dark:text-neutral-100">
            The Core Bond
          </h3>
          <p class="mb-6 text-sm text-neutral-500 italic dark:text-neutral-400">
            Stable personality baseline protected against session-reset erasure.
          </p>
          <ul class="flex flex-col gap-3">
            <li v-for="item in ['Stable Identity Benchmark', 'Cross-Session Continuity', 'Durable Motif Tracking']" :key="item" class="flex items-center gap-3 text-sm text-neutral-700 font-medium dark:text-neutral-300">
              <div class="i-solar:check-circle-bold-duotone text-amber-500" />
              {{ item }}
            </li>
          </ul>
        </section>

        <section class="border border-neutral-200 rounded-3xl bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
          <div class="mb-4 h-10 w-10 flex items-center justify-center rounded-xl bg-orange-500/10 text-xl text-orange-500">
            <div class="i-solar:history-bold-duotone" />
          </div>
          <h3 class="mb-2 text-xl text-neutral-800 font-bold dark:text-neutral-100">
            Daily Updates
          </h3>
          <p class="mb-6 text-sm text-neutral-500 italic dark:text-neutral-400">
            Piggybacks on the 24H STMM cycle to integrate meaningful session shifts.
          </p>
          <ul class="flex flex-col gap-3">
            <li v-for="item in ['Incremental Soul Rebasing', 'STMM Cycle Handoff', 'Automatic Conflict Resolution']" :key="item" class="flex items-center gap-3 text-sm text-neutral-700 font-medium dark:text-neutral-300">
              <div class="i-solar:add-circle-bold-duotone text-orange-500" />
              {{ item }}
            </li>
          </ul>
        </section>

        <section class="border border-neutral-200 rounded-3xl bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/60">
          <div class="mb-4 h-10 w-10 flex items-center justify-center rounded-xl bg-primary-500/10 text-xl text-primary-500">
            <div class="i-solar:lock-bold-duotone" />
          </div>
          <h3 class="mb-2 text-xl text-neutral-800 font-bold dark:text-neutral-100">
            Stability Guard
          </h3>
          <p class="mb-6 text-sm text-neutral-500 italic dark:text-neutral-400">
            Monitors for erratic identity drift and ensures long-term bond integrity.
          </p>
          <ul class="flex flex-col gap-3">
            <li v-for="item in ['Bond Integrity Monitoring', 'Personality Protection', 'Durable History Vault']" :key="item" class="flex items-center gap-3 text-sm text-neutral-700 font-medium dark:text-neutral-300">
              <div class="i-solar:security-safe-bold-duotone text-primary-500" />
              {{ item }}
            </li>
          </ul>
        </section>
      </div>

      <!-- Lifecycle Console -->
      <section class="border border-neutral-200 rounded-[2.5rem] bg-white p-10 shadow-xl dark:border-neutral-800 dark:bg-neutral-900/80">
        <h2 class="mb-8 text-2xl text-neutral-800 font-bold dark:text-neutral-100">
          Lifetime Controls
        </h2>
        <div class="grid gap-12 lg:grid-cols-2">
          <div class="flex flex-col gap-6">
            <div>
              <span class="text-sm text-neutral-500 font-bold tracking-widest uppercase dark:text-neutral-400">Artifact Token Budget</span>
              <p class="text-xs text-neutral-400 dark:text-neutral-500">
                Determines the density of the canonical Soul Blueprint.
              </p>
            </div>

            <div class="grid grid-cols-3 gap-3 border border-neutral-200 rounded-2xl bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800/50">
              <button
                v-for="opt in presetOptions"
                :key="opt.value"
                :class="[
                  'flex flex-col items-center gap-1 rounded-xl py-4 transition-all',
                  tokenPreset === opt.value ? 'bg-white shadow-md text-amber-500 dark:bg-neutral-700' : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200',
                ]"
                @click="tokenPreset = opt.value"
              >
                <span class="text-sm font-bold">{{ opt.label }}</span>
                <span class="px-2 text-center text-[10px] leading-tight opacity-70">{{ opt.description }}</span>
              </button>
            </div>
          </div>

          <div class="flex flex-col justify-end pt-4">
            <div class="flex items-center gap-3 border border-neutral-200 rounded-2xl bg-neutral-50/50 px-8 py-6 dark:border-neutral-700 dark:bg-neutral-800/40">
              <input id="handoff" v-model="autoHandoff" type="checkbox" class="h-6 w-6 border-neutral-300 rounded text-amber-500">
              <label for="handoff" class="flex flex-col cursor-pointer">
                <span class="text-base text-neutral-700 font-bold dark:text-neutral-200">Daily Update Handoff</span>
                <span class="text-xs text-neutral-500 font-bold tracking-tighter uppercase">Your daily changes are merged into the thread at midnight</span>
              </label>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- STAGING MODAL: Provisioning Wizard -->
    <div v-if="showProvisioningWizard" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div class="shadow-3xl max-w-xl w-full scale-100 transform border border-neutral-200 rounded-[2.5rem] bg-white p-10 transition-all dark:border-neutral-800 dark:bg-neutral-900">
        <div class="flex flex-col gap-6">
          <header class="flex flex-col gap-2">
            <h3 class="font-urbanist text-2xl text-neutral-800 font-bold dark:text-neutral-100">
              Initiate Soul Bonding
            </h3>
            <p class="text-sm text-neutral-500 italic dark:text-neutral-400">
              Provisioning permanent memory for <span class="text-neutral-700 font-bold dark:text-neutral-200">{{ activeCharacter.name }}</span>
            </p>
          </header>

          <!-- Wizard Steps -->
          <div class="flex flex-col gap-8">
            <div v-if="provisioningStep === 1" class="flex flex-col gap-6">
              <div class="border border-amber-500/20 rounded-2xl bg-amber-500/5 p-6">
                <span class="mb-2 block text-xs text-neutral-500 font-bold tracking-widest uppercase">History Scope</span>
                <div class="flex items-end gap-1">
                  <span class="text-4xl text-amber-500 font-bold">{{ activeCharacter.historyTurns }}</span>
                  <span class="mb-1.5 text-sm text-neutral-500 font-bold tracking-tighter uppercase">Turns found in log</span>
                </div>
              </div>
              <p class="text-sm text-neutral-700 leading-relaxed dark:text-neutral-300">
                The system will distill your entire chat history into its first permanent baseline. This requires roughly <span class="text-amber-500 font-bold">{{ activeCharacter.estimatedChunks }}</span> high-context LLM processing chunks.
              </p>
            </div>

            <div v-if="provisioningStep === 2" class="flex flex-col gap-6">
              <div class="border border-red-500/20 rounded-2xl bg-red-500/5 p-6 dark:border-red-500/30">
                <span class="mb-1 block text-xs text-red-500 font-bold tracking-widest uppercase">Provisioning Warning</span>
                <p class="text-sm text-red-700 font-medium leading-relaxed dark:text-red-300">
                  This process is resource-intensive and will take several minutes. Please do not close the window while the Soul Bonding is in progress.
                </p>
              </div>
            </div>

            <div v-if="provisioningStep === 3" class="flex flex-col gap-8 py-4">
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between text-xs font-bold tracking-tighter uppercase">
                  <span class="animate-pulse text-amber-500">Building Foundation...</span>
                  <span class="text-neutral-500">65%</span>
                </div>
                <div class="h-3 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div class="h-full w-[65%] bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]" />
                </div>
              </div>
              <ul class="flex flex-col gap-3">
                <li v-for="s in ['Calculating history scope...', 'Deduplicating turn events...', 'Distilling narrative baseline...']" :key="s" class="flex items-center gap-3 text-xs text-neutral-500 italic dark:text-neutral-400">
                  <div class="i-solar:check-circle-bold-duotone text-sm text-emerald-500" />
                  {{ s }}
                </li>
              </ul>
            </div>
          </div>

          <footer class="mt-4 flex justify-end gap-3">
            <Button v-if="provisioningStep < 3" label="Cancel" variant="secondary-muted" @click="showProvisioningWizard = false" />
            <Button :label="provisioningStep === 3 ? 'Building...' : 'Initiate Bond'" variant="primary" :disabled="provisioningStep === 3" @click="nextStep" />
          </footer>
        </div>
      </div>
    </div>

    <!-- STAGING MODAL: Source Data (7k) Explorer -->
    <div v-if="showSourceModal" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div class="shadow-3xl max-w-4xl w-full border border-neutral-200 rounded-[2.5rem] bg-white p-10 dark:border-neutral-800 dark:bg-neutral-900">
        <header class="mb-8 flex items-center justify-between">
          <h3 class="text-2xl text-neutral-800 font-bold dark:text-neutral-100">
            Soul Blueprint: Source Explorer
          </h3>
          <Button icon="i-solar:close-circle-bold-duotone" variant="secondary-muted" @click="showSourceModal = false" />
        </header>

        <div class="grid gap-8 md:grid-cols-2">
          <!-- 7k Source (Undistilled) -->
          <div class="flex flex-col gap-3">
            <span class="text-xs text-neutral-500 font-bold tracking-widest uppercase">Undistilled Source (7k)</span>
            <div class="max-h-[400px] flex-1 overflow-y-auto whitespace-pre-wrap border border-neutral-200 rounded-2xl bg-neutral-50 p-6 text-sm text-neutral-600 leading-relaxed italic dark:border-neutral-800 dark:bg-black/20 dark:text-neutral-400">
              {{ sourceData7k }}
            </div>
          </div>

          <!-- 1k Canonical (Distilled) -->
          <div class="flex flex-col gap-3">
            <span class="text-xs text-amber-600 font-bold tracking-widest uppercase">Canonical Thread (1k)</span>
            <div class="max-h-[400px] flex-1 overflow-y-auto whitespace-pre-wrap border border-amber-500/20 rounded-2xl bg-amber-500/5 p-6 text-sm text-neutral-800 leading-relaxed italic dark:border-amber-500/10 dark:bg-amber-500/5 dark:text-neutral-200">
              {{ canonicalThread }}
            </div>
          </div>
        </div>

        <footer class="mt-8 border-t border-neutral-100 pt-8 text-center dark:border-neutral-800">
          <p class="mx-auto max-w-xl text-xs text-neutral-500 italic dark:text-neutral-400">
            The canonical thread is distilled from the source archive by deduping motifs and summarizing erratic session shifts into a stable identity baseline.
          </p>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.font-urbanist {
  font-family: 'Urbanist', sans-serif;
  -webkit-font-smoothing: antialiased;
}
</style>

<route lang="yaml">
meta:
  layout: settings
  titleKey: The Eternal Thread
  subtitleKey: settings.title
  stageTransition:
    name: slide
</route>
