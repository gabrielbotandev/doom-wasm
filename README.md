# Doom Wasm

Browser-playable Chocolate Doom compiled to WebAssembly, with `freedoom2.wad` bundled as the default redistributable IWAD. Users can also load their own IWAD/WAD files at runtime. No proprietary Doom data is included in this repository.

## What This Repo Is For

- Primary use: clone it, run it locally, click `Play`, and test the game in the browser.
- Advanced use: rebuild the Doom engine itself as WebAssembly after engine-side changes.

If you only want to play or test the project locally, you usually do not need to care about `build:wasm`.

## Quick Start

This is the main workflow for someone who just wants to run the game.

### Requirements

- Git
- Node.js `^18.0.0 || >=20.0.0`
- npm

### Clone and Run

```bash
git clone <your-github-url>
cd <repository-directory>
npm install
npm run dev
```

Then:

1. Open the local URL printed by Vite.
2. Click `Play`.
3. The game starts with bundled `freedoom2.wad`.

The prebuilt browser engine files under `web/public/engine/` are intentionally committed so a fresh clone can run without rebuilding the engine.

## Controls

- Arrow keys: move
- `Ctrl`: fire
- `Space`: use / open
- `Shift`: run
- Optional: pointer lock and fullscreen are available in the UI

## Loading Your Own IWAD or WAD

- By default the project starts with bundled Freedoom.
- You can upload your own game data from the UI.
- `Custom IWAD` replaces the default IWAD.
- `Add-on WAD(s)` keeps Freedoom as the base and appends extra WAD files.
- You must own the original game data if you use proprietary IWADs or WADs.

Uploaded files are used in the browser session. They should not be added to this repository.

## Commands

### `npm run dev`

Starts the local dev server for normal use.

Use this when:
- you just want to play or test the browser version
- you changed frontend files under `web/src`
- you changed copy, layout, styles, or UI behavior

### `npm run build`

Builds the production web app.

Use this when:
- you want the production `web/dist` output
- you want to verify the frontend production bundle

### `npm run build:wasm`

Rebuilds the Doom engine itself for the browser.

This compiles the Chocolate Doom C code into:
- `web/public/engine/chocolate-doom.js`
- `web/public/engine/chocolate-doom.wasm`
- `web/public/engine/chocolate-doom.data`

Use this only when:
- you changed engine source under `engine/vendor/chocolate-doom`
- you changed the Emscripten build in `engine/scripts/build_wasm.sh`
- you changed default engine-side assets like `engine/assets/freedoom2.wad`

If you only changed the web UI, you do not need `build:wasm`.

### `npm run clean`

Removes local build directories:
- `engine/build`
- `web/dist`

It intentionally keeps the tracked `web/public/engine/` bundle.

## Project Layout

- `web/`: Vite frontend, canvas UI, controls, upload flow, fullscreen, pointer lock, runtime log
- `engine/`: vendored Chocolate Doom source, default Freedoom asset, build scripts
- `licenses/`: license texts and attribution notices

## Advanced: Rebuilding the Engine as WebAssembly

This section is only for engine work.

### Additional Requirements

- Python 3
- Emscripten
- CMake
- Ninja

### Install Local Build Prerequisites

From the repository root:

```bash
git clone https://github.com/emscripten-core/emsdk.git .emsdk
cd .emsdk
./emsdk install 4.0.14
./emsdk activate 4.0.14
source ./emsdk_env.sh
cd ..
python3 -m pip install --upgrade --prefix ./.tooling cmake ninja
export PATH="$PWD/.tooling/bin:$PATH"
export PYTHONPATH="$(find "$PWD/.tooling/lib" -maxdepth 3 -type d -name site-packages | head -n 1)"
```

Then rebuild:

```bash
npm run build:wasm
```

Notes:

- `.emsdk/` and `.tooling/` are local prerequisites and are intentionally ignored by Git.
- On a fresh Emscripten setup, the first wasm build may also download the SDL2 port into the local Emscripten cache.
- The build preloads `engine/assets/freedoom2.wad` into `/iwads/freedoom2.wad` inside the Emscripten filesystem.

## Production Build

From the repository root:

```bash
npm install
npm run build
```

The production output is written to `web/dist/`.

## Troubleshooting

### `emcc` not found

Install and activate emsdk from the repository root:

```bash
git clone https://github.com/emscripten-core/emsdk.git .emsdk
cd .emsdk
./emsdk install 4.0.14
./emsdk activate 4.0.14
source ./emsdk_env.sh
cd ..
```

Then rerun `npm run build:wasm`.

### `cmake` not found

Install local build tools:

```bash
python3 -m pip install --upgrade --prefix ./.tooling cmake ninja
export PATH="$PWD/.tooling/bin:$PATH"
export PYTHONPATH="$(find "$PWD/.tooling/lib" -maxdepth 3 -type d -name site-packages | head -n 1)"
```

Then rerun `npm run build:wasm`.

### The engine starts but custom files are ignored

- Use the `Interpret uploads as` selector in the UI.
- `Custom IWAD` uses the first uploaded file as `-iwad`.
- `Add-on WAD(s)` keeps `freedoom2.wad` as the base game.

### Browser keyboard input is missing

- Click inside the canvas after launch.
- If pointer lock is active, press `Esc` to release it.

## GitHub and Repo Hygiene

- Safe to commit: source code, `engine/assets/freedoom2.wad`, `web/public/engine/*`, docs in this README, and `licenses/`
- Do not commit: proprietary IWADs/WADs, local toolchains, caches, dependency folders, or build output
- `.gitignore` already excludes common local-only paths such as `.emsdk/`, `.tooling/`, `.playwright/`, `node_modules/`, `engine/build/`, and `web/dist/`
- The tracked `web/public/engine/` bundle is intentional so the repo stays clone-and-run friendly

## Licensing

- Engine and project integration: GPL-2.0-or-later
- Default game data: Freedoom
- Frontend and toolchain notices: see `licenses/`

See `licenses/THIRD_PARTY_NOTICES.md` for the bundled license summary.
