import type { Tool } from '@xsai/shared-chat'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { useBackgroundStore } from '@proj-airi/stage-layouts'
import { useAiriCardStore, useArtistryStore, useImageJournalStore, useSceneStore } from '@proj-airi/stage-ui/stores'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { artistryGenerateHeadless, widgetsAdd } from '../../../../shared/eventa'

// Convert a Blob to a self-contained data URL string
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getArtistryConfig() {
  try {
    const store = useArtistryStore()
    return {
      provider: store.activeProvider,
      model: store.activeModel,
      promptPrefix: store.defaultPromptPrefix,
      options: store.providerOptions,
      Globals: {
        comfyuiWslBackendPath: store.comfyuiWslBackendPath,
        comfyuiWslNodePath: store.comfyuiWslNodePath,
        comfyuiHostUrl: store.comfyuiHostUrl,
        comfyuiDefaultCheckpoint: store.comfyuiDefaultCheckpoint,
        replicateApiKey: store.replicateApiKey,
        replicateDefaultModel: store.replicateDefaultModel,
        replicateAspectRatio: store.replicateAspectRatio,
        replicateInferenceSteps: store.replicateInferenceSteps,
      },
    }
  }
  catch (e) {
    return {}
  }
}

const { context } = createContext(window.electron.ipcRenderer)
const generateHeadless = defineInvoke(context, artistryGenerateHeadless)
const addWidget = defineInvoke(context, widgetsAdd)

// Persist the preferred background in the active card's extension
// so it survives page reload via the restoration logic in airi-card.ts
function persistPreferredBackground(entryId: string, name: string, dataUrl: string) {
  try {
    const cardStore = useAiriCardStore()
    const cardId = cardStore.activeCardId
    if (!cardId)
      return

    const card = cardStore.cards.get(cardId)
    if (!card)
      return

    const extension = JSON.parse(JSON.stringify(card.extensions || {}))
    if (!extension.airi)
      extension.airi = {}
    if (!extension.airi.modules)
      extension.airi.modules = {}

    extension.airi.modules.preferredBackgroundId = entryId
    extension.airi.modules.preferredBackgroundName = name
    extension.airi.modules.preferredBackgroundDataUrl = dataUrl

    cardStore.updateCard(cardId, { ...card, extensions: extension })
  }
  catch (e) {
    console.warn('[ImageJournalTool] Failed to persist preferred background in card extension', e)
  }
}

const imageJournalParams = z.object({
  action: z.enum(['create', 'set_as_background']).describe('Choose one: create or set_as_background.'),
  prompt: z.string().optional().describe('Text description used to generate the image (required for create).'),
  title: z.string().optional().describe('Short label for the journal entry (optional for create).'),
  query: z.string().optional().describe('Title or ID to fuzzy match for setting background (required for set_as_background).'),
  set_as_background: z.boolean().optional().describe('If true, also sets the newly created image as the active background (only for create).'),
}).strict()

async function executeCreateImageJournalEntry(params: { prompt?: string, title?: string, set_as_background?: boolean }) {
  if (!params.prompt?.trim())
    throw new Error('prompt is required for image_journal.create')

  const journalStore = useImageJournalStore()
  const artistryConfig = getArtistryConfig()

  const title = params.title || `Generation ${new Date().toLocaleString()}`

  try {
    const result = await generateHeadless({
      prompt: artistryConfig.promptPrefix ? `${artistryConfig.promptPrefix} ${params.prompt}` : params.prompt as string,
      model: artistryConfig.model as string,
      provider: artistryConfig.provider as string,
      options: artistryConfig.options as any,
      globals: artistryConfig.Globals as any,
    })

    if (result.error || !result.imageUrl)
      throw new Error(result.error || 'No image URL returned from generator')

    const response = await fetch(result.imageUrl)
    const blob = await response.blob()

    const entry = await journalStore.createEntry({
      blob,
      prompt: params.prompt as string,
      title,
      originalUrl: result.imageUrl,
    })

    // Optionally spawn a widget to show the result (best effort)
    try {
      await addWidget({
        componentName: 'artistry',
        componentProps: {
          status: 'done',
          imageUrl: entry.url,
          prompt: params.prompt as string,
          title,
          _skipIngestion: true,
        },
        size: 'm',
        ttlMs: 0,
      })
    }
    catch (e) {
      console.warn('[ImageJournalTool] Failed to spawn result widget', e)
    }

    // If set_as_background is true, also apply as background
    if (params.set_as_background) {
      try {
        const backgroundStore = useBackgroundStore()
        const sceneStore = useSceneStore()

        // Convert blob to data URL for reliable rendering
        const dataUrl = await blobToDataUrl(entry.blob)

        // 1. Update SceneStore (immediate visual change)
        const bgId = sceneStore.addBackground(dataUrl, entry.title || title)
        sceneStore.setActiveBackground(bgId)

        // 2. Update BackgroundStore (persistence layer)
        const background = await backgroundStore.addOption({
          id: entry.id,
          label: entry.title,
          description: `Journal entry: ${entry.prompt}`,
          kind: 'image' as any,
          file: entry.blob,
        })
        backgroundStore.setSelection(background)

        // 3. Persist as preferred background in card extension
        persistPreferredBackground(entry.id, entry.title || title, dataUrl)

        return `Image saved as "${entry.title}" (ID: ${entry.id}) and set as background.`
      }
      catch (bgErr) {
        console.warn('[ImageJournalTool] Image saved but failed to set as background', bgErr)
        return `Image saved as "${entry.title}" (ID: ${entry.id}), but failed to set as background.`
      }
    }

    return `Image saved as "${entry.title}" (ID: ${entry.id}).`
  }
  catch (e) {
    console.error('[ImageJournalTool] Failed to create entry', e)
    return `Failed to generate image: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function executeSetAsBackground(params: { query?: string }) {
  if (!params.query?.trim())
    return 'Error: query is required for image_journal.set_as_background. Provide a title or ID to search for.'

  const journalStore = useImageJournalStore()
  const backgroundStore = useBackgroundStore()

  const query = params.query.toLowerCase().trim()

  // Force refresh from IndexedDB to ensure we have the latest entries
  await journalStore.refresh()

  // Search journal entries: exact ID match first, then fuzzy title match
  let entry = journalStore.entries.find(e => e.id === query || e.id?.toLowerCase().includes(query))

  if (!entry) {
    entry = journalStore.entries.find(e => e.title.toLowerCase().includes(query))
  }

  if (entry) {
    try {
      const sceneStore = useSceneStore()

      // Convert blob to a data URL for reliable rendering
      // NOTICE: entry.url is a reactive blob: URL from useObjectUrl that may
      // be undefined or stale outside template context. Data URLs are self-contained
      // strings that always work with CSS background-image.
      const dataUrl = await blobToDataUrl(entry.blob)

      // 1. Update SceneStore (immediate visual change)
      const bgId = sceneStore.addBackground(dataUrl, entry.title)
      sceneStore.setActiveBackground(bgId)

      // 2. Update BackgroundStore (persistence layer)
      const background = await backgroundStore.addOption({
        id: entry.id,
        label: entry.title,
        description: `Journal entry: ${entry.prompt}`,
        kind: 'image' as any,
        file: entry.blob,
      })
      backgroundStore.setSelection(background)

      // 3. Persist as preferred background in card extension
      persistPreferredBackground(entry.id, entry.title, dataUrl)

      return `Successfully set background to journal entry "${entry.title}".`
    }
    catch (e) {
      console.error('[ImageJournalTool] Failed to set background from journal', e)
      return `Found journal entry "${entry.title}" but failed to apply it as background: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  // Fallback: search scene store backgrounds by name
  try {
    const { useSceneStore } = await import('@proj-airi/stage-ui/stores')
    const sceneStore = useSceneStore()
    const allBgs = Array.from(sceneStore.backgrounds.values())
    const sceneBg = allBgs.find(bg => bg.name.toLowerCase().includes(query))

    if (sceneBg) {
      sceneStore.setActiveBackground(sceneBg.id)
      return `Set background to scene entry "${sceneBg.name}" (from scene store).`
    }
  }
  catch (e) {
    console.warn('[ImageJournalTool] Scene store fallback failed', e)
  }

  // List available entries to help the LLM retry
  const available = journalStore.entries.map(e => e.title).slice(0, 10)
  const hint = available.length > 0
    ? ` Available journal entries: ${available.map(t => `"${t}"`).join(', ')}.`
    : ' The journal is currently empty for this character.'

  return `Could not find any background matching "${params.query}".${hint}`
}

async function executeImageJournalAction(params: any) {
  if (params.action === 'create')
    return await executeCreateImageJournalEntry(params)

  if (params.action === 'set_as_background')
    return await executeSetAsBackground(params)

  return 'No image journal action performed.'
}

const tools: Promise<Tool>[] = [
  tool({
    name: 'image_journal',
    description: 'ACTION: Manage AI-generated images for the active character. Use "create" to generate a NEW image (and optionally set it as background with set_as_background: true). Use "set_as_background" with a title query to APPLY an existing image as the active background. YOU MUST CALL THIS TOOL TO PERFORM THE ACTION—DO NOT SIMPLY SAY "DONE".',
    execute: params => executeImageJournalAction(params),
    parameters: imageJournalParams,
  }),
]

export const imageJournalTools = async () => Promise.all(tools)
