#!/bin/bash

# AIRI Tamagotchi - Local Dev Starter (macOS/Linux)
# Use this for a simple, one-shot startup.

# Safeguard: prevent VS Code from forcing Electron into Node mode
unset ELECTRON_RUN_AS_NODE

# Default to 5173. If your settings/model vanished after an update,
# try entering 5174 to recover your local storage from previous versions.
read -p "Enter port (default 5173): " PORT_NUM
PORT_NUM=${PORT_NUM:-5173}

LOG_FILE="airi.log"
echo "Logging to $LOG_FILE"

{
  echo "[1/2] Building packages..."
  pnpm run build:packages

  echo "[2/2] Starting Tamagotchi on Port $PORT_NUM..."
  export AIRI_RENDERER_PORT=$PORT_NUM

  # Try to use local config if it exists, otherwise use default
  if [ -f "apps/stage-tamagotchi/electron.vite.config.local.ts" ]; then
      pnpm -F @proj-airi/stage-tamagotchi run dev --config electron.vite.config.local.ts
  else
      pnpm -F @proj-airi/stage-tamagotchi run dev
  fi
} 2>&1 | tee "$LOG_FILE"
