# Proposal: Director-Led Modular Visual Assets

## Context
Interactive RP characters often change visual states (outfits, styles, lighting) based on narrative beats. Static system prompts fail to capture these transitions. This proposal introduces a **Modular Asset Registry** that the Director (Visual Manifestation LLM) can narratively select from per-turn.

## The Concept: "Visual Asset Menu"
Instead of a single hardcoded description, each character has a "Closet" of **Outfits** (prompt snippets) and **Workflows** (ComfyUI JSON paths). The Director is made aware of these options and chooses the most appropriate pair for the current scene.

## Proposed Mechanics

### 1. Character Asset Registry (JSON)
Each AIRI card includes a `visual_assets` block:
```json
"visual_assets": {
  "outfits": {
    "burgundy_traveler": {
      "prompt": "(cropped white linen top, burgundy flowy pants with desert flowers:1.5), turquoise pendant, sandals",
      "description": "Casual travel gear for wandering bazaars."
    },
    "silver_performance": {
      "prompt": "(sleeveless white leotard, vertical iridescent silver tape:1.6), cat-buckle belt",
      "description": "Her signature high-energy performance kit."
    }
  },
  "workflows": {
    "v3_high_sabor": "anima-kanjira-random-v3.json",
    "v3_burgundy_special": "anima-kanjira-random-v3-burgundy.json"
  }
}
```

### 2. Director Preview & Selection
- **The System Hook**: Before the Director generates a "Director's Note," the system injects the available `outfits` and `workflows` into the context.
- **Narrative Logic**: If Kanjira is packing (as in the current chat), the Director selects `burgundy_traveler`.
- **Output Metadata**: The Director's Note includes the selection:
  `{ "optionalOutfit": "burgundy_traveler", "optionalWorkflow": "v3_burgundy_special" }`

### 3. Backend Injection Logic
The `buildKleinPromptAndWorkflow.js` logic is updated to:
1.  **Retrieve** the prompt snippet for `optionalOutfit` and append it to the narrative prompt.
2.  **Swap** the base workflow file path with the one specified in `optionalWorkflow`.

## Benefits
- **Narrative Autonomy**: The character's visual appearance evolves automatically with the story.
- **Character Specifity**: Kanjira's "Performance" outfit is distinct from Vampchan's "Gothic" outfit.
- **Director Intelligence**: The AI "knows" when it's time for a costume change based on the scene's emotional or practical needs.

## Case Study: The Iron Camel Transition
- **Turn 1 (Packing)**: Kanjira says she's packing her leotard. Director selects `burgundy_traveler` for the "ready to leave" shot.
- **Turn 10 (The Show)**: Kanjira steps onto the balcony. Director automatically swaps to `silver_performance` and uses the high-energy `v3_random` workflow for maximum impact.
