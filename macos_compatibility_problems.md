# MacOS Compatibility Problems

This document tracks issues encountered while setting up and building the Airi project on MacOS.

## Environment Issues

### 1. Node Version Mismatch
- **Status**: Updated/Tested
- **Description**: The project root `package.json` had a strict engine requirement for Node `<=25.0.0`. The current system was running `v25.6.0`, which caused installation warnings and potential runtime sync issues with the lockfile.
- **Action Taken**: Updated root `package.json` to allow `<26.0.0`.
- **Finding**: Project builds correctly on Node `v25.6.0` so far.

## Build Issues

### 1. Strict TypeScript Errors (TS6133) in `mcp.vue`
- **Status**: Fixed & Verified
- **Description**: `src/renderer/pages/settings/modules/mcp.vue` failed to build due to unused variables `'t'` and `'listTools'` and their respective imports. These were likely remnants of a refactor to use a bridge-based system.
- **Action Taken**: Removed the unused variables and commented out the unnecessary imports.
- **Verification**: `pnpm run build` in `apps/stage-tamagotchi` now completes with **Exit Code 0**.

## Build Success Notice
The project has been successfully built on MacOS with the following environment:
- **Node**: `v25.6.0` (Updated `package.json` to support)
- **PNPM**: `v10.32.1`
- **Architecture**: `darwin-arm64` (Apple Silicon)
