@echo off
:: AIRI Tamagotchi - Local Dev Starter
:: Use this to force a specific port to recover settings or models.

set /p PORT_NUM="Enter port (e.g. 5173, 5174, 5175) or press Enter for 5174: "
if "%PORT_NUM%"=="" set PORT_NUM=5174

echo [1/2] Building packages...
call pnpm run build

echo [2/2] Starting Tamagotchi on Port %PORT_NUM%...
set AIRI_RENDERER_PORT=%PORT_NUM%
set AIRI_FORCE_HIGH_PERFORMANCE_GPU=1

:: Try to use local config if it exists, otherwise use default
if exist "apps\stage-tamagotchi\electron.vite.config.local.ts" (
    call pnpm -F @proj-airi/stage-tamagotchi run dev --config electron.vite.config.local.ts
) else (
    call pnpm -F @proj-airi/stage-tamagotchi run dev
)
