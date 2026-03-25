# Goal Description
The AIRI Tamagotchi app is lagging on user interactions, taking a few seconds to respond. This is typically caused by main thread blocking, IPC flooding, or heavy unoptimized WebGL calls.

We have identified that the main window in Electron is flooding IPC with config-changed events upon any resizing or moving logic. Also, input interaction is slow, likely because of how `electron-click-drag-plugin` intercepts events or lack of throttling in state synchronization ([model-store.ts](file:///e:/airi/packages/stage-ui-three/src/stores/model-store.ts)).

## Proposed Changes

### Electron Main Process
We will debounce or throttle [handleNewBounds](file:///e:/airi/apps/stage-tamagotchi/src/main/windows/main/index.ts#125-161) in [apps/stage-tamagotchi/src/main/windows/main/index.ts](file:///e:/airi/apps/stage-tamagotchi/src/main/windows/main/index.ts). This prevents IPC flooding over `eventa:event:electron:windows:main:config-changed` and disk IO queueing.

#### [MODIFY] [apps/stage-tamagotchi/src/main/windows/main/index.ts](file:///e:/airi/apps/stage-tamagotchi/src/main/windows/main/index.ts)
- Import `debounce` or `throttle` from `es-toolkit` (already used in the project based on [persistence.ts](file:///e:/airi/apps/stage-tamagotchi/src/main/libs/electron/persistence.ts)).
- Throttle [handleNewBounds](file:///e:/airi/apps/stage-tamagotchi/src/main/windows/main/index.ts#125-161) to executing every `100ms` or debounce to `250ms`, so it only updates config and sends IPC changes efficiently.

### WebGL / Renderer Process (Stage UI Three)
We will investigate and limit any runaway `useBroadcastChannel` flooding or [shouldUpdateView](file:///e:/airi/packages/stage-ui-three/src/stores/model-store.ts#73-77) spam down to `requestAnimationFrame` rates or debounced updates if it's causing generic UI lag.

## Verification Plan
### Automated Tests
- Run `pnpm typecheck` locally to verify changes.
### Manual Verification
- Ask the user to run [start_airi.bat](file:///e:/airi/start_airi.bat) again to check if the lag drops when interacting with the tamagotchi window.
