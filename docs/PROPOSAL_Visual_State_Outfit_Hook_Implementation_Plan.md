# Implementation Plan: Production Studio & Concept Stacker

This plan tracks the development and "Stress Testing" of the AIRI Studio. The system is now in the **Post-Deployment Validation** phase.

## Current Status: [BETA-STABLE]

### 1. Concept Registry & Data Model [DONE]
- [x] Finalize `visual_assets` schema in `AiriCard` extensions.
- [x] Implement persistent `active_concepts` stack in the character store.
- [x] Implement persistence fix for the Registry Save Handler (Fix: Payload destructuring).

### 2. Studio UI [DONE]
- [x] **Production Tab**: Integrated the Studio into the `CardDetailDialog.vue`.
- [x] **Active Concept Stack**: Interactive chips for real-time concept toggling.
- [x] **Concept Builder Modal**: Multi-tab editor (Identity, Artistry, Manifestation).
- [x] **Smart Dropdowns**: Replaced manual text IDs with searchable Select components for Workflows and Display Models.

### 3. The Autonomous Bridges [DONE]
- [x] **Artistry Bridge**: Generator now resolves prompt snippets and workflow paths from the active stack.
- [x] **Manifestation Bridge**: Production Monitor triggers `changeModel()` when the stack resolves a new Model ID.
- [x] **Director Integration**: Injected Concept Registry into the Director context for autonomous selection.

---

## Next Milestones: The "Lain Protocol"

### 1. High-Volume Asset Stress Test
Lain Iwakura serves as the "Chaos Test" for the system.
- **Challenge**: Manage 20+ dress/expression combinations.
- **Goal**: Ensure the Registry grid and Stack badges remain performant with high asset counts.
- **Goal**: Test "Outfit Conflict" resolution—if 5 concepts are active, ensure the generative prompt remains coherent.

### 2. Reduced Friction (The 11-Click Fix)
- **Goal**: Add a "Quick Import" button directly inside the `ConceptBuilderModal`.
- **Goal**: Auto-detect the `prompt` node in newly uploaded ComfyUI JSONs to minimize manual mapping.

---

## Known Files & Structure

### Components
- **Main View**: `ProductionStudioTab.vue` (packages/stage-pages/src/pages/settings/airi-card/components/tabs/ProductionStudioTab.vue)
- **Editor**: `ConceptBuilderModal.vue` (packages/stage-pages/src/pages/settings/airi-card/components/ConceptBuilderModal.vue)

### Bridges
- **Artistry**: `artistry-autonomous.ts` (packages/stage-ui/src/stores/modules/artistry-autonomous.ts)
- **Manifestation**: `airi-card.ts` (packages/stage-ui/src/stores/modules/airi-card.ts) - Contains the "Production Monitor" watcher.

---

## Verification Checklist (For Xfer Machine)
- [ ] Verify that `personal_airi` workflows are imported and visible in the Studio dropdowns.
- [ ] Verify that tapping a Concept card instantly triggers a "Production Journal" entry.
- [ ] Verify that the Director selects concepts based on the "Lain Protocol" narrative keywords.
