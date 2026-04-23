# Feat: Discord Revamp

## Vision & Goals
Transitioning the Discord integration from a disconnected "second process" bot into a unified service running directly within the main AIRI architecture.

### Core Principles
- **Unified Context**: Interactions flow through the same Episode/Memory logic as the Desktop app (no isolated session IDs).
- **Single Process**: Logic is bundled into AIRI's Tamagotchi services (no separate bot process required).
- **Live Mode**: A low-latency audio bridge connecting Discord VC directly to the Gemini Live WebSocket.
- **Modern UX**: Native Discord Slash Commands (Proper Plugin Model) instead of hacky text guide triggers.

---

## 1. Planned Slash Commands

| Command | Description | Implementation Status |
| :--- | :--- | :--- |
| `/new` | Equivalent to the trash can icon (Clear Context). | Planned |
| `/summon` | Joins the user's current Voice Channel. | Built-in (to be announced) |
| `/leave` | Leaves the Voice Channel. | Built-in (to be announced) |
| `/context` | Rollup summary of context usage (token metrics). | Planned |
| `/history` | Dumps the last 5 messages from the current conversation. | Planned |
| `/status` | Connection report (Character sync, Provider health). | Planned |
| `/live` | Experimental Gemini Live audio bridging. | Planned |
| `/character` | Switches the active AIRI card/profile directly from Discord. | Planned |
| `/voicemode` | `puppet` (Local) \| `voicenote` (Discord) \| `none` (Text-only). | Planned |
| `/voicecall` | `gemini` (Modern) \| `tts` (Classic STT/TTS). | Planned |
| `/emotion` | Manually triggers character expressions/animations. | Planned |

---

## 2. Technical Pathing

### Character Identity & Sync
The Discord service will mirror the **Active Character** on the screen.
- `/status` will report the current AI profile.
- All outbound messages will be prefixed with the Character's name (e.g., `Lain: {content}`) for multi-user clarity.

### Artistry & Inline Media
- **Inline Artistry**: Generated images (widgets/backgrounds) from the Artistry pipeline will be returned as native Discord attachments for a seamless experience.
- **Multimodal Image Journal**: The Image Journal acts as the central repository for generated images, backgrounds, and real-time Stage captures (Selfies). It serves as the primary bridge between the character's internal "Artistry" state and the messaging platforms.
- **Selfie Master Spec**: A specialized schema property `selfie: true` within the Image Journal extension.
    - **Trigger**: When the bot encounters an `imageJournal` request with `selfie: true` (either via AI decision or manual Slash command), it invokes the **same camera control function** available in the Desktop **Control Island**.
    - **Execution**: Triggers `visionStore.heartbeat({ force: true })` in the Renderer process.
    - **Routing**: The resulting stage screenshot is captured, processed as an entry in the Background Store (`type: 'selfie'`), and immediately routed to the Discord channel as a high-quality attachment.

### Context Integration
Discord interactions will feed into the central **Prompt Builder**.
- All users in a channel share a single "Episode" unless otherwise configured.
- Memory sync ensures Discord logs appear in the central system audit history.
- **Proactive Messaging**: Implementation of heuristics to route heartbeats/proactive turns to the last active channel used by the user.

### Master Integration Hooks
The unified service layer exposes deep hooks into existing AIRI store logic:
- **Proactivity Hook**: Monitors `proactivityStore` for heartbeat pulses, allowing character-initiated turns to be routed as native Discord messages.
- **Artistry Hook**: Intercepts `artistryStore` generation results (Widgets/Backgrounds/Remixes). When a character "creates" media, it is automatically uploaded as a Discord attachment.
- **State Sync Hook**: Mirrors `airiCardStore` (Name/Avatar/Bio) directly to the Discord Bot's identity via `@moeru/eventa` and `discord.js`.
- **Camera Hook**: Integrates the **Control Island's** capture logic into the messaging flow via the **Image Journal**.

### 🎙️ Audio Delivery & Voice Modes
The `/voicemode` command dictates how speech is handled for standard text messages:
- **`puppet` (Default)**: Audio is played locally on the Desktop app. Ideal for "Home Base" usage.
- **`voicenote`**: The TTS audio chunks are collected, combined into a single `.ogg` or `.mp3` file, and uploaded to the Discord channel as a Voice Note / Attachment.
- **`none`**: No TTS is generated. Saves significant API credits and local resources.

### 📞 Voice Call Engines
The `/voicecall` command selects the underlying technology for real-time VC sessions:
1. **`gemini` (Modern)**:
   - Discord raw audio -> Gemini Live WebSocket -> Discord raw audio.
   - Low latency, "No text" involved.
2. **`tts` (Classic)**:
   - Discord audio -> STT -> LLM -> TTS -> Discord audio.
   - Slower, but utilizes the high-fidelity desktop TTS providers and maintains a full text log of the VC interaction.

---

## 3. Revamped Settings UI: `messaging-discord.vue`

The Settings page will evolve from a simple configuration box into a **Mission Control** dashboard for the Discord service. This provides essential telemetry for the user and critical debugging tools for development.

### UI Summary Table

| Section | Component | Description |
| :--- | :--- | :--- |
| **Connectivity** | Status Badge + Ping | Real-time Gateway health. |
| **Authentication** | Masked Token + Reset | Secure credential management. |
| **Active Presence** | Table of Guilds/VCs | Shows where AIRI is currently "Summoned." |
| **Logic Routing** | Toggle Group | Enable VLM, Global Artistry Sync, Auto-Prefixing. |
| **Developer Console** | Collapsible Log View | Real-time stream of Discord service events. |
| **Debug Actions** | Button Row | [Test Auth] [Force Card Sync] [Restart Service]. |

---

### UI Feature Detail

#### 1. Live Telemetry (The "Heartbeat")
Provides real-time insight into the native service state:
- **Gateway Status**: A "Connected/Disconnected" indicator with a Ping/Latency readout.
- **Active Guilds/Channels**: A list of where AIRI is currently "present" or "summoned."
- **Shard Info**: Visible scaling data (which shard the local process is handling).

#### 2. Implementation Helpers (The "Dev Dashboard")
Tools to ease development and verification of the new pipeline:
- **Event Stream**: A small, scrollable log of raw Discord events (`MESSAGE_CREATE`, `INTERACTION_CREATE`) to monitor incoming traffic without checking the terminal.
- **"Force Sync" Button**: Immediately pushes the current AIRI Card (Avatar/Bio) to Discord's API to test identity synchronization.
- **"Simulate Event"**: Triggers a mock Discord message from the UI to test context routing and attribution logic.

#### 3. Granular Configuration (The "Controls")
- **Identity Sync Toggle**: Options for how AIRI appears (e.g., "Always use Desktop Character Name" vs. "Use Discord Nickname").
- **Multimodal Toggles**: Enabling/disabling inbound image processing for VLM context.
- **Voice Gates**: Configuration for "Kill Switch" sensitivity and Voice Activity thresholds for the Phase 4 bridge.

---

## 4. Implementation Roadmap

### Phase 1: Service Migration (No 2nd Process)
The logic will be moved from `services/discord-bot` into a native Electron service. This removes the need for a separate process and WebSocket bridge.
- **Service Root**: `apps/stage-tamagotchi/src/main/services/airi/discord/`
- **Entry Point**: `apps/stage-tamagotchi/src/main/services/airi/discord/index.ts`
- **DI Registration**: Injected into `Injeca` via `apps/stage-tamagotchi/src/main/index.ts`.

### Phase 2: Native Interaction Plugin
Transitioning from passive message listening to a structured Interaction model.
- **REST Registration**: On service start, the bot will use `REST` and `Routes.applicationCommands` to push the schema (built via `SlashCommandBuilder`) to Discord. This enables the native `/` autocomplete UI.
- **Registry Structure**: A new `commands/` directory in the main process will house individual command files. Each file exports a `data` (schema) and an `execute` (logic) function.
- **Interaction Handler**: The service will listen for `Events.InteractionCreate`. It will map the `commandName` to our local registry and execute the corresponding function, ensuring a native "AIRI is thinking..." state is shown during long operations.

### Phase 3: Character & Context Unification
Synchronizing the bot with the Desktop renderer state.
- **State Sync**: Uses `@moeru/eventa` to track the active character profile.
- **Prefix Logic**: Automatically prefixes messages with the character's name (e.g. `Lain: {text}`).
- **Context Routing**: Discord messages are sent via IPC to the Renderer's `ChatStore`, ensuring they pass through the same **Prompt Builder** and **Memory layers**.

### Phase 4: Gemini Live Audio Bridge (Experimental)
The "Holy Grail" of voice interaction on Discord.
- **Pipe**: Connects the Discord `VoiceConnection` (Opus stream) directly to the `GeminiLiveService` WebSocket.
- **Effect**: Real-time, full-duplex audio without text serialization.

---

## 5. Key Files for Adjustment

### [Main Process (Tamagotchi)]
- **[NEW]** `apps/stage-tamagotchi/src/main/services/airi/discord/service.ts`
- **[NEW]** `apps/stage-tamagotchi/src/main/services/airi/discord/commands/*.ts`
- **[MODIFY]** `apps/stage-tamagotchi/src/main/index.ts` (Service injection)
- **[MODIFY]** `apps/stage-tamagotchi/src/shared/eventa.ts` (IPC contracts)

### [Renderer Process (Stage UI)]
- **[MODIFY]** `packages/stage-ui/src/stores/modules/discord.ts` (UI state management)
- **[MODIFY]** `packages/stage-pages/src/pages/settings/modules/messaging-discord.vue` (Unified toggle)

### [Project Cleanup]
- **[DELETE]** `services/discord-bot/` (Deprecated legacy process)
- **[MODIFY]** `package.json` (Adding `@discordjs/voice`, `libsodium-wrappers`, and `@discordjs/opus` to core dependencies)
