<script setup lang="ts">
import type { DirectorNote } from '../../types/director'

const props = defineProps<{
  note: DirectorNote
}>()
</script>

<template>
  <div class="director-note-bubble relative my-2 flex flex-col gap-2 overflow-hidden border border-purple-500/30 rounded-lg bg-black/40 p-3 text-sm text-purple-200 font-mono shadow-[0_0_15px_rgba(168,85,247,0.15)] backdrop-blur-md">
    <!-- Subtle scanline effect overlay -->
    <div class="pointer-events-none absolute inset-0 bg-[length:100%_4px] bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.1)_50%)] opacity-20" />

    <div class="z-10 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="i-carbon-video text-purple-400" />
        <span class="text-xs text-purple-300 font-bold tracking-widest">DIRECTOR'S MONITOR</span>
      </div>
      <div class="flex items-center gap-2 border border-purple-500/20 rounded bg-black/50 px-2 py-1">
        <span class="text-xs text-purple-400/70">GRADE</span>
        <span class="text-purple-200 font-bold">{{ note.intensity }}/100</span>
      </div>
    </div>

    <div class="z-10 mt-1 border-l-2 border-purple-500/40 pl-1 opacity-90">
      <p class="whitespace-pre-wrap leading-relaxed">
        {{ note.content }}
      </p>
    </div>

    <div v-if="note.state === 'pending'" class="z-10 mt-2 flex items-center gap-2 border-t border-purple-500/20 pt-2">
      <span class="i-svg-spinners-pulse-multiple text-purple-400" />
      <span class="animate-pulse text-xs text-purple-300">Manifesting Scene...</span>
    </div>
    <div v-else-if="note.intensity >= 70 && note.state === 'done'" class="z-10 mt-2 flex items-center gap-2 border-t border-purple-500/20 pt-2">
      <span class="i-carbon-checkmark-outline text-green-400" />
      <span class="text-xs text-green-300">Scene Manifested</span>
    </div>
  </div>
</template>

<style scoped>
.director-note-bubble {
  transition: all 0.3s ease;
}
</style>
