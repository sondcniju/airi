# Implementation Plan: AIRI Studio & Concept Stacking

Implement a modular "Studio" system that allows the Director LLM (and the User) to orchestrate complex visual states using a "Concept Stacker" architecture. This moves away from the crowded technical settings and towards a narrative-driven production workflow.

## User Review Required

> [!IMPORTANT]
> **UI Paradigm Shift**: We are moving the "Production" controls (Outfits, Workflows) out of the deep "Edit Card" settings and into the "View Card" (Detail) mode. This makes the Gallery and the Studio side-by-side neighbors.

> [!WARNING]
> **Registry Dependency**: Characters will now require a `visual_assets` registry in their JSON to fully utilize the "Outfits" feature. I will provide a migration path for existing characters.

## Proposed Changes

### 1. Visual Asset Registry (Data Model)
Finalize the schema in the `AiriCard` type and existing persona files (e.g., `kanjira-kjl.json`).
- `visual_assets`: A dictionary mapping concept keys (e.g., `burgundy_traveler`) to:
    - `promptSnippet`: Text to append/prepend.
    - `workflowId`: Specific ComfyUI template.
    - `modelFileId`: (Optional) The unique ID of the Live2D or VRM model file to swap to (Unified per-file swapping).

### 2. Studio UI [NEW COMPONENTS]

#### [NEW] `VisualStudio.vue` (packages/stage-pages/src/pages/settings/airi-card/components/VisualStudio.vue)
A dual-pane interface to be integrated into `CardDetailDialog.vue`.
- **The Stage (Left Pane)**:
    - **Active Concepts**: Horizontal list of chips representing the current "Stack."
    - **Model Swapper**: A "coalesced" dropdown to manually swap the base Live2D/VRM file.
    - **Concept Registry (The Closet)**: A grid of available concepts with an **"Add Concept"** button.
    - **Director's Monitor**: A concise feed of the Director's latest reasoning.
- **The Gallery (Right Pane)**:
    - The existing image history grid.

#### [NEW] `ConceptBuilderModal.vue` (packages/stage-pages/src/pages/settings/airi-card/components/ConceptBuilderModal.vue)
A modal for creating/editing visual concepts with the following fields:
- **Concept Name**: Identifier for the Director (e.g., "Silver Performance").
- **Provider/Workflow Hook**:
    - Toggle: `[ComfyUI Workflow]` vs `[Generic Model Override]`.
    - Dropdown to select the specific Workflow or Model ID.
- **Prompt Snippet**: Textarea for keywords to inject into the manifestation.
- **Model File**: Dropdown to select the Live2D or VRM file associated with this concept.
- **Mood/Expression Layer**:
    - A set of buttons representing expressions (Expressions load dynamically based on the selected **Model File**).
    - Allows setting a "Default Mood" for when this concept is active.

### 3. Card Detail Integration
#### [MODIFY] `CardDetailDialog.vue` (packages/stage-pages/src/pages/settings/airi-card/components/CardDetailDialog.vue)
- Add a **"Studio"** tab.
- Implement the split-view layout to host the new `VisualStudio.vue` component.
- Ensure real-time updates when the Director triggers a new visual state.

### 4. Director Logic Refactor
#### [MODIFY] `artistry-autonomous.ts` (packages/stage-ui/src/stores/modules/artistry-autonomous.ts)
- Update the system prompt to instruct the Director on using `activeConcepts`.
- **Logic**: If the narrative context matches a concept in the registry, the Director adds the concept key to the `visual_manifestation` response.
- **Resolution**: The engine resolves the concept's `modelFileId`, `promptSnippet`, `workflowId`, and `mood` before execution.

## Verification Plan

### Automated Tests
- **Registry Resolution**: Verify that selecting a concept correctly merges the prompt snippet and workflow ID.
- **Model Swapping**: Verify that triggering a concept with a `modelFileId` initiates a full model file swap.
- **Stacking Logic**: Ensure multiple concepts can be "stacked" (e.g., `[Outfit: Burgundy]` + `[Style: Cinematic]`).

### Manual Verification
- Open the **Character Detail** view.
- Navigate to the new **Studio** tab.
- Manually toggle an outfit and verify the "Active Concepts" chips and Model selection update.
- Trigger an autonomous manifestation and verify the Director's reasoning appears in the monitor.
- Confirm the generated image reflects the selected "Concept Stack."
