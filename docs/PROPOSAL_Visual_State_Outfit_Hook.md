# Architectural Record: Director-Led Modular Visual Assets

## Context
Interactive RP characters often change visual states (outfits, styles, lighting) based on narrative beats. Static system prompts fail to capture these transitions. This system introduces a **Production Studio** and **Active Concept Stack** that the Director (Visual Manifestation LLM) and the User can orchestrate in real-time.

## The Realized Concept: "The Production Studio"
Instead of a single hardcoded description, each character has a "Registry" of **Concepts**. A concept is a "Package" containing three pillars of manifestation:

### The Three Pillars of a Concept
1.  **Identity (Prompt Layer)**: Narrative prompt snippets that are appended to the generation prompt. (e.g., `, (burgundy velvet dress:1.4)`)
2.  **Artistry (Pipeline Layer)**: Overrides for the generative engine. This includes **Workflow Swapping** (swapping the entire ComfyUI JSON) and **Provider/Model Swapping** (e.g., switching from Flux to Anima).
3.  **Manifestation (Physical Layer)**: Live stage reconfigurations. This triggers a **Physical Model Swap** (Live2D/VRM) or a **Baseline Mood/Expression** lock.

---

## Mechanics: "The Stacking Engine"

### 1. Concept Types: "Base" vs. "Layer"
Concepts are categorized into two fundamental types to ensure visual consistency:
- **Base (Exclusionary)**: Represents a total state change (e.g., a New Outfit, a Cameo Character). When a Base concept is activated by the Director or User, it **clears the existing stack** to ensure no outfit overlapping occurs.
- **Layer (Additive)**: Represents a modifier or "filter" (e.g., Cinematic Style, Rain Atmosphere, Angry Mood). These concepts are stacked on top of the current Base.

### 2. The Resolution Rule (Stack Folding)
The final scene is resolved by "folding" the active stack from bottom to top:
1.  **Identity (Prompt)**: All prompt snippets in the stack are **concatenated**.
2.  **Artistry (Pipeline)**: Each layer can override the generation settings (Workflow/Provider) of the layer below it. The **last concept in the stack** that defines an override wins.
3.  **Manifestation (Physical)**: The character's physical model (Live2D/VRM) and baseline expression are resolved by the **last concept in the stack** that defines a `modelId` or `mood`.

### 3. Director Sync Logic (Post-Turn Cleanup)
To prevent "Modifier Bloat" (where styles from 20 turns ago stay active forever), the Director follows the **"Keep Base, Refresh Modifiers"** rule:
- If the Director picks a **New Base**: The entire stack is wiped and replaced.
- If the Director picks **Modifiers Only**: The current Base is preserved, but all other active concepts are cleared and replaced by the Director's new selections. This ensures the character stays in their current outfit while allowing styles/atmospheres to be transient.

### 4. Production Monitor (Bridge)
A dedicated watcher in the `AiriCardStore` monitors the stack. When a manifestation override (Model ID) reaches the top of the stack, the stage immediately initiates a `changeModel()` sequence to swap the VRM/Live2D assets.

---

## Validation History

### 1. Baseline Validation: The Moriinatsu Prompt Hook
Before the full "Bridge" architecture was completed, we used **Moriinatsu** to validate the **Identity Pillar** (Prompt Injection).
- **Goal**: Confirm the Director can select a concept and successfully "fight" her base character prompt.
- **Result**: Successfully injected specific narrative hooks into the generative prompt, proving that the Concept Registry was being correctly prioritized by the LLM context.

### 2. Deep Immersion: The Vamp-chan Burgundy Shift [REALIZED]
- **Scenario**: Vamp-chan goes through a makeover and falls in love with her burgundy dress.
- **Concept: "Original"**: Maps to the monochrome `anima_vampchan_og_dress.json` workflow and the `vamp-chan.vrm` base model.
- **Concept: "Burgundy"**: Maps to the wine-red `anima_vampchan_burgundy_dress.json` workflow and the `burgundy-chan.vrm` alt-model.
- **Transition**: When the Master requests a "Diagnostic session in the Model Room," the Director (or User) toggles the `original_dress` concept.
    - **Artistry Bridge**: Swaps the ComfyUI workflow back to the monochrome OG version.
    - **Manifestation Bridge**: Swaps the Live2D/VRM model back to the black-and-white maid uniform.
    - **Result**: Complete, zero-touch narrative immersion.

---

## Future Vision: The Lain Protocol
The system is designed to scale to complex multi-state characters like **Lain Iwakura**, who may have 20+ dress/expression combinations. The next phase involves stress-testing the stack with high-frequency switching and expression-mapped manifestation overrides.
