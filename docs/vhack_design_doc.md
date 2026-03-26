# V-HACK: AIRI Native Integration Design Document 🛠️👾

This document outlines the pivot from a standalone application to a native "Hacker Editor" integrated directly into **AIRI**. By leveraging AIRI's existing rendering stack (Three.js/React), UI, and expression management, V-HACK becomes an advanced overlay—a hidden "God Mode" panel for modifying compiled VRM binaries on the fly.

---

## 1. The Pivot: AIRI Integration

Instead of rebuilding the wheel (viewport, rendering, file loading, expression management), V-HACK will exist as a **right-side drawer panel** within AIRI's Model Settings page.

It is accessed via a dedicated "V-HACK" or "Dev Mode" toggle button. This keeps the primary AIRI interface clean for normal users, while unlocking binary-level modding for power users.

### ASCII Layout Vision

```text
+-----------------------------------------------------------------------------+
| AIRI - Settings - Models                                     [ 🛠️ V-HACK ] |
+-------------------------+-------------------------+-------------------------+
| < Models                |                         | [X] V-HACK CONTROL DESK |
|                         |                         |=========================|
| [ Select Model ]        |                         | [🗂️] TREE VIEW          |
|                         |                         | v RootNode              |
| Character Customization |                         |   v Mesh 43 (Skin)      |
| [Expressions] [Anim]    |                         |     - Primitive 0       |
| ...                     |     ( EXISTING )        |   > Mesh 46 (Dress)     |
|                         |                         |                         |
| Custom Extensions (11)  |     ( AIRI 3D  )        |=========================|
| [aa] [angry] [blink]    |     ( VIEWPORT )        | [🧪] MATERIAL LAB       |
|                         |                         | Target: Prim 0 (Body)   |
| Scene                   |                         | _RimWidth   [O--------] |
| [Placement] [Lighting]  |                         | _ShadeShift [----O----] |
| X Offset [====| 0 ]     |                         | _SphereAdd  [ ID: 48  ] |
|                         |                         |                         |
|                         |                         |=========================|
|                         |                         | [🖼️] TEXTURE DECK       |
|                         |                         | [Img 43.png] [Img 4.png]|
|                         |                         | (+) UPLOAD OVERRIDE     |
|                         |                         |-------------------------|
|                         |                         | [🤖] AI STUDIO          |
|                         |                         | P: "Black gym shorts"   |
|                         |                         | [✨ GENERATE NEW TEX ]  |
|                         |                         | [-> APPLY TO MESH 43 ]  |
+-------------------------+-------------------------+-------------------------+
```

---

## 2. Core Modules Breakdown

### A. The Tree View (The Inspector)
This is not just a list; it is a full 3D IDE for the VRM binary.
*   **Hierarchy**: It parses the `json.nodes` and `json.meshes` from the raw VRM buffer.
*   **Interaction**: Clicking a Mesh highlights it in the AIRI 3D viewport (e.g., drawing a wireframe box around it).
*   **Drill-Down**: Expanding a Mesh reveals its Primitives. Selecting a Primitive automatically populates the **Material Lab** with its assigned MToon parameters and textures.

### B. The Material Lab (Real-Time Shading)
A dynamic property editor for the selected material.
*   **Live Sliders**: Bind directly to the Three.js material uniform properties in memory. Dragging `_RimWidth` or `_ShadeShift` reflects instantly on the model.
*   **MatCap Swap**: A dropdown/input to change the `_SphereAdd` texture index, enabling instant toggling from Matte to Shiny.
*   **Alpha Overrides**: Quick toggles to switch a material between OPAQUE, BLEND, and MASK modes.

### C. Texture Deck & AI Studio
These two sections sit together at the bottom right, forming the core asset manipulation loop.

**Texture Deck**:
*   Visual grid of all `json.images` embedded in the VRM.
*   **Extract**: Download any PNG (the flat UV map) to the local machine.
*   **Hot-Swap**: Upload a modified PNG to instantly replace an existing texture index in memory, immediately updating the AIRI render.

**AI Studio (Powered by AIRI Artistry)**:
Leverages AIRI's existing `useArtistryStore` (ComfyUI, Replicate, etc.) for a viral texture generation loop:
1.  **Context**: The user selects a target mesh/texture (e.g., the Skin UV map).
2.  **Prompt**: The user inputs a prompt (e.g., "skintight black yoga shorts").
3.  **Generation**: We route the base image data (the naked skin map) + the prompt through the **active Artistry Provider** generically.
4.  **Preview**: The provider returns a detailed texture replacement, which is automatically slotted into the **Texture Deck** and applied to the 3D model in memory.

---

## 3. The Backend "Binary Sandbox" Bridge

Because AIRI is an Electron app, it has the file-system access required to execute the Node.js binary manipulations we mapped out in Project Mint.

*   **In-Memory Sandbox**: V-HACK intercepts the `ThreeScene` and `VRMModel` instances. Sliders bind directly to the parsed Three.js materials. This is "Zero Latency" modding—you see the results instantly before committing.
*   **Expression Hooks**: The Tree View / Command Deck will directly invoke `expression.ts` logic (`vrm.expressionManager.setValue()`) allowing instant testing of custom Satoimo shapes like `heart` or `star_eyes` without needing ACT tokens.
*   **Revert System**: A simple "Revert to Original" button restarts the session with the untouched model data, sufficient for MVP undo/redo.
*   **The Compiler (Commit)**: A "Commit to Binary" button translates all in-memory changes (new textures, material floats) back to the glTF JSON specification and writes a new compiled `.vrm` binary to disk.

---

## 4. MVP Prioritization 🎯

To ensure a stable and viral release, we will prioritize features in the following order:

1.  **The Tree View (Foundation)**: Parse and display the VRM's `nodes`, `meshes`, and `primitives`. This allows the user to see exactly "what" they are editing.
2.  **Basic Material Lab**: Implement sliders for `_RimWidth`, `_ShadeShift`, and the `_SphereAdd` (MatCap) ID. This alone solves the "Waxy Skin" and "Glowing Fabric" problems.
3.  **Texture Deck (Preview)**: View embedded images and allow manual texture overrides.
4.  **AI Studio (V-HACK Prime)**: The high-value generation loop using existing Artistry providers.

---

## 4. Pending Questions & Unknowns ❓

| Unknown | Impact | Resolution Path |
| :--- | :--- | :--- |
| **NBP Resolution Param** | High | Confirm the exact API field name for setting 1k/2k/4k output in the NBP/OpenAI-compatible request. |
| **Binary Bloat** | Medium | Should we add a Web-Worker based compression (e.g., `mozjpeg`) for 4k textures to keep the final `.vrm` size under 50MB? |
| **Undo Stack** | Low | Determine if we need a full `Command Pattern` undo/redo system for the initial MVP, or if a "Revert to Original" button is sufficient. |

---

> **Why this works:** AIRI already handles the hardest parts—loading the VRM via `VRMModel.vue`, managing the expression queues (`queues.ts`), and handling Artistry generation. By docking V-HACK as a right-hand panel in the Settings page, we get a world-class dev-tool environment without building a standalone app from scratch.
