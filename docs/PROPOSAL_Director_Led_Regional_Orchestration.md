# PROPOSAL: Director-Led Regional Orchestration (Spatial Vision)

## Objective
Upgrade the AIRI Director LLM from a "Flat Prompt" generator to a "Spatial Scene Architect" capable of designing complex, multi-panel, and regionally conditioned visual compositions without breaking the generic, model-agnostic nature of the AIRI platform.

## 1. The Core Architecture: The "Regional Resolver" Node
To avoid "Rube Goldberg" deadlocks and maintain generic compatibility with any workflow, we introduce a custom ComfyUI node that acts as the bridge between the LLM's vision and the image engine.

- **Class Name**: `AIRIRegionalResolver`
- **Inputs**:
    - `text`: A JSON string from the Director (containing layout, narrative actions, and weights).
    - `clip`: The CLIP model from the user's workflow.
    - `model`: The Diffusion model from the user's workflow.
- **Internal Logic**:
    - Parses the Layout JSON.
    - Internally executes the equivalent of `CLIPTextEncode` and `ConditioningSetArea` for each zone defined in the JSON.
    - Performs a "Conditioning Combine" chain to merge all regional zones with a global scene prompt.
- **Output**: A single `CONDITIONING` object, compatible with any standard KSampler.

## 2. Automatic Mode Inference (Zero-UI Selection)
AIRI will automatically determine the "Intelligence Level" required for a generation by observing the architecture of the user's uploaded workflow.

- **Detection**: When a user selects a node as the "Director's Input" during workflow setup, AIRI inspects its `class_type`.
- **Simple Mode (`CLIPTextEncode`)**:
    - Director LLM is given a standard "Flat Prompt" system prompt.
    - Output is a single string injected into the node's `text` property.
- **Rich Mode (`AIRIRegionalResolver`)**:
    - Director LLM is given the "Spatial Vision Handbook" (0-100 grid system, JSON schema).
    - Output is a Layout JSON string injected into the node's `text` property.

## 3. Persona & Outfit Decoupling
To ensure narrative persistence, the system separates a character's physical identity from their contextual wardrobe.

- **Director's Perspective**: The LLM works with character keys (e.g., `"subject": "kanjira"`) and describes "Contextual Outfits" (e.g., `"outfit": "a vibrant blue bikini"`).
- **Identity Injection (The UI Hook)**: Before sending the JSON to ComfyUI, the AIRI Frontend intercepts the JSON and replaces the character keys with the full "Base Identity" prompt from the character's persona card (hair color, skin tone, signature features).
- **Benefit**: The Director can "re-dress" characters for any scene while maintaining perfect visual continuity of their core traits.

## 4. Spatial Reasoning (The 0-100 Grid)
The Director designs scenes using a normalized coordinate system to remain independent of specific resolutions.

- **Grid**: 0-100% based (Top-Left 0,0).
- **Aspect Ratio Awareness**: Director is informed of the target shape (`wide`, `tall`, or `square`) and adjusts the bounding boxes (BBoxes) to fit cinematic conventions (e.g., side-by-side splits for tall, comic panels for wide).
- **Multi-Zone Support**: Handles asymmetrical splits and "reaction box" overlays dynamically.

## 5. Summary of Benefits
- **No Deadlocks**: The generation happens entirely within the standard ComfyUI execution loop.
- **Generic & Extensible**: Works with any model or LoRA provided by the user.
- **Clean UI**: No extra toggles or "expert modes" required; the system infers capabilities from the workflow.
- **Cinematic Control**: Empowers the AI to tell stories across a single canvas using sophisticated visual layering.

## 6. Resource & Reference Paths

### Core Director Engine (Prototypes)
- **Engine Directory**: `e:\CUIPP\comfyGalleryAppBackend\scripts\director_engine\`
- **Workflow Generator**: `e:\CUIPP\comfyGalleryAppBackend\scripts\director_engine\generateZoneWorkflow.js`
- **Integrated Pipeline**: `e:\CUIPP\comfyGalleryAppBackend\scripts\director_engine\generate_scene.js`
- **Stress Test Script**: `e:\CUIPP\comfyGalleryAppBackend\scripts\director_layout_stress_test.js`

### Reference Workflows & Data
- **Manual Regional Reference**: `C:\Users\h4rdc\Documents\Github\coding-agent\VRMs\Project-Mint-2\vertical-kanjira-37.json`
- **Mock Scene Blueprint**: `e:\CUIPP\comfyGalleryAppBackend\scripts\director_engine\mock_scene.json`
- **4-Way Quadrant Blueprint**: `e:\CUIPP\comfyGalleryAppBackend\scripts\director_engine\4way_scene.json`

### Key Backend Logic
- **Artistry Store (UI)**: `c:\Users\h4rdc\Documents\Github\airi-rebase-scratch\packages\stage-ui\src\stores\modules\artistry-autonomous.ts`
- **ComfyUI Controller**: `e:\CUIPP\comfyGalleryAppBackend\ComfyUiApi.js`

