# Windows Stable Release & Build Guide

This document captures the specific technical steps required to successfully build and release stable versions of the AIRI Electron application on Windows.

## 1. Release Workflow

### Step 1: Version Stamping
Update the `version` in `apps/stage-tamagotchi/package.json`. Follow the format: `[major].[minor].[patch]-stable.[YYYYMMDD]`.

### Step 2: Local Tagging
Create a git tag matching the version (with a `v` prefix) and push it to your fork or upstream:
```bash
git tag v[version]
git push origin v[version]
```

### Step 3: Generate Release Notes
1. **Compare Hashes**: Look at all commits between the previous stable tag and `HEAD`:
   ```bash
   git log [previous-tag]..HEAD --oneline
   ```
2. **Draft Summary**: Focus on outward-facing user features (e.g., new buttons, UI improvements, stability wins).
3. **Save to File**: Save to `release-notes.md`.

### Step 4: Build Windows Executable
Execute the build command from the `stage-tamagotchi` workspace:
```bash
pnpm -F @proj-airi/stage-tamagotchi run build:win
```
This runs `electron-builder --win` and generates a `.exe` setup file in `dist`.

### Step 5: Publish to GitHub Releases
Use the `gh` CLI to create the release and upload the asset.

**Daily / Development Release (Target your fork):**
```bash
gh release create [tag] apps/stage-tamagotchi/dist/AIRI-[version]-windows-x64-setup.exe --repo [your-fork] --title "AIRI [version]" --notes-file release-notes.md
```

**Stable Release (Target upstream):**
```bash
gh release create [tag] apps/stage-tamagotchi/dist/AIRI-[version]-windows-x64-setup.exe --repo moeru-ai/airi --title "AIRI [version]" --notes-file release-notes.md
```

---

## 2. Technical Lessons Learned

### The `node:crypto` Renderer Error
Electron renderer processes are browser environments. Map Node-specific packages to browser equivalents in `electron.vite.config.ts` or use shims (e.g., `apps/stage-tamagotchi/src/renderer/shims/node-crypto.ts`).

### DuckDB Environment Leakage
Use the custom Vite plugin to redirect WASM loaders to browser-specific bundles.

### Global Module Shimming
Ensure imports starting with `node:` are caught and redirected to safe shims in the renderer bundle.
