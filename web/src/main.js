import './styles.css';

const STORAGE_KEY = 'doomwasm.selection';
const DEFAULT_IWAD_PATH = '/iwads/freedoom2.wad';
const DEFAULT_IWAD_NAME = 'freedoom2.wad';
const ENGINE_MODULE_URL = `${import.meta.env.BASE_URL}engine/chocolate-doom.js`;
const ENGINE_FILE_BASE = `${import.meta.env.BASE_URL}engine/`;
const KNOWN_IWADS = new Set([
  'chex.wad',
  'doom.wad',
  'doom1.wad',
  'doom2.wad',
  'freedm.wad',
  'freedoom1.wad',
  'freedoom2.wad',
  'plutonia.wad',
  'tnt.wad',
]);
const DEFAULT_MAIN_CONFIG = [
  'fullscreen 0',
  'window_width 320',
  'window_height 200',
  'grabmouse 0',
  'use_mouse 1',
].join('\n');
const DEFAULT_EXTRA_CONFIG = [
  // The web build renders reliably when we skip the intermediate
  // render-target upscale path used on desktop SDL backends.
  'smooth_pixel_scaling 0',
  'force_software_renderer 1',
].join('\n');

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="shell">
    <section class="layout">
      <div class="viewport-frame">
        <div class="viewport-topline">
          <span class="status-pill" id="status-pill">Ready</span>
          <span id="selection-summary">Using bundled Freedoom 2.</span>
        </div>
        <div class="actions">
          <button id="play-button" class="button button-primary">Play</button>
          <button id="fullscreen-button" class="button" disabled>Fullscreen</button>
          <button id="pointer-button" class="button" disabled>Pointer</button>
        </div>
        <div class="canvas-shell" id="canvas-shell">
          <canvas id="doom-canvas" width="320" height="200" tabindex="0" aria-label="Doom game canvas"></canvas>
          <div class="canvas-overlay" id="canvas-overlay">
            <p>Freedoom is preloaded.</p>
            <p>Choose optional files, then press Play.</p>
          </div>
        </div>
      </div>

      <aside class="panel-stack">
        <section class="panel">
          <h2>Files</h2>
          <label class="field">
            <span>Load IWAD / WAD</span>
            <input id="wad-input" type="file" accept=".wad,.iwad" multiple />
          </label>
          <label class="field">
            <span>Interpret uploads as</span>
            <select id="wad-mode">
              <option value="auto">Auto-detect</option>
              <option value="iwad">Custom IWAD</option>
              <option value="addon">Add-on WAD(s)</option>
            </select>
          </label>
          <p class="note">
            You must own the original game data to use proprietary IWADs/WADs.
          </p>
          <p class="note note-muted" id="persisted-note"></p>
        </section>

        <section class="panel">
          <h2>Controls</h2>
          <div class="controls">
            <p><span>Move</span><strong>WASD or arrows</strong></p>
            <p><span>Fire</span><strong>Ctrl</strong></p>
            <p><span>Use / Open</span><strong>Space</strong></p>
            <p><span>Run</span><strong>Shift</strong></p>
            <p><span>Pointer look</span><strong>Optional</strong></p>
          </div>
        </section>

        <section class="panel">
          <h2>Log</h2>
          <pre id="log-output" class="log-output" aria-live="polite"></pre>
        </section>
      </aside>
    </section>
  </main>
`;

const state = {
  cachedUploads: [],
  engine: null,
  running: false,
};

const playButton = document.querySelector('#play-button');
const fullscreenButton = document.querySelector('#fullscreen-button');
const pointerButton = document.querySelector('#pointer-button');
const wadInput = document.querySelector('#wad-input');
const wadMode = document.querySelector('#wad-mode');
const canvas = document.querySelector('#doom-canvas');
const canvasShell = document.querySelector('#canvas-shell');
const canvasOverlay = document.querySelector('#canvas-overlay');
const statusPill = document.querySelector('#status-pill');
const selectionSummary = document.querySelector('#selection-summary');
const logOutput = document.querySelector('#log-output');
const persistedNote = document.querySelector('#persisted-note');

function appendLog(level, message) {
  const normalized = String(message ?? '').trim();

  if (!normalized) {
    return;
  }

  if (level === 'error') {
    console.error(normalized);
  } else {
    console.log(normalized);
  }

  const lines = normalized.split('\n');
  const existing = logOutput.textContent ? logOutput.textContent.split('\n') : [];
  const next = [...existing, ...lines].slice(-120);
  logOutput.textContent = next.join('\n');
  logOutput.scrollTop = logOutput.scrollHeight;
}

function setStatus(label, tone = 'ready') {
  statusPill.textContent = label;
  statusPill.dataset.tone = tone;
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function persistSelectionMetadata(files, mode) {
  const payload = {
    files: files.map((file) => file.name),
    mode,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function restoreSelectionMetadata() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to parse persisted selection metadata.', error);
    return null;
  }
}

function renderPersistedSelection() {
  const persisted = restoreSelectionMetadata();

  if (!persisted?.files?.length) {
    persistedNote.textContent = '';
    return;
  }

  persistedNote.textContent = `Last custom selection: ${persisted.files.join(', ')} (${persisted.mode}). Re-upload required after refresh.`;
}

function summarizeSelection(selection) {
  if (selection.iwad?.runtimePath !== DEFAULT_IWAD_PATH) {
    const addonSuffix = selection.addons.length ? ` + ${selection.addons.length} add-on WAD(s)` : '';
    return `Custom IWAD: ${selection.iwad.name}${addonSuffix}`;
  }

  if (selection.addons.length) {
    return `Bundled Freedoom 2 + ${selection.addons.length} add-on WAD(s)`;
  }

  return 'Using bundled Freedoom 2.';
}

function classifyUploads(uploads, mode) {
  if (!uploads.length) {
    return {
      addons: [],
      iwad: { name: DEFAULT_IWAD_NAME, runtimePath: DEFAULT_IWAD_PATH },
    };
  }

  if (mode === 'iwad') {
    const [iwad, ...addons] = uploads;

    return {
      addons: addons.map((file) => ({ ...file, runtimePath: `/mods/${sanitizeFilename(file.name)}` })),
      iwad: { ...iwad, runtimePath: `/uploads/${sanitizeFilename(iwad.name)}` },
    };
  }

  if (mode === 'addon') {
    return {
      addons: uploads.map((file) => ({ ...file, runtimePath: `/mods/${sanitizeFilename(file.name)}` })),
      iwad: { name: DEFAULT_IWAD_NAME, runtimePath: DEFAULT_IWAD_PATH },
    };
  }

  const detectedIwad = uploads.find((file) => KNOWN_IWADS.has(file.name.toLowerCase()));
  const addons = uploads.filter((file) => file !== detectedIwad);

  return {
    addons: addons.map((file) => ({ ...file, runtimePath: `/mods/${sanitizeFilename(file.name)}` })),
    iwad: detectedIwad
      ? { ...detectedIwad, runtimePath: `/uploads/${sanitizeFilename(detectedIwad.name)}` }
      : { name: DEFAULT_IWAD_NAME, runtimePath: DEFAULT_IWAD_PATH },
  };
}

function ensureDir(fs, path) {
  const segments = path.split('/').filter(Boolean);
  let cursor = '';

  for (const segment of segments) {
    cursor += `/${segment}`;

    try {
      fs.mkdir(cursor);
    } catch (error) {
      if (!String(error?.message ?? '').includes('File exists')) {
        throw error;
      }
    }
  }
}

function buildCliArgs(selection) {
  const args = [
    '-window',
    '-iwad',
    selection.iwad.runtimePath,
    '-savedir',
    '/savegames',
    '-config',
    '/config/default.cfg',
    '-extraconfig',
    '/config/chocolate-doom.cfg',
  ];

  if (selection.addons.length) {
    args.push('-file', ...selection.addons.map((addon) => addon.runtimePath));
  }

  return args;
}

function prepareVirtualFilesystem(module, selection) {
  ensureDir(module.FS, '/config');
  ensureDir(module.FS, '/mods');
  ensureDir(module.FS, '/savegames');
  ensureDir(module.FS, '/uploads');

  module.FS.writeFile('/config/default.cfg', `${DEFAULT_MAIN_CONFIG}\n`);
  module.FS.writeFile('/config/chocolate-doom.cfg', `${DEFAULT_EXTRA_CONFIG}\n`);

  if (selection.iwad.bytes) {
    module.FS.writeFile(selection.iwad.runtimePath, selection.iwad.bytes);
  }

  for (const addon of selection.addons) {
    module.FS.writeFile(addon.runtimePath, addon.bytes);
  }
}

function syncSelectionSummary() {
  const selection = classifyUploads(state.cachedUploads, wadMode.value);
  selectionSummary.textContent = summarizeSelection(selection);
}

async function cacheUploads(files) {
  if (!files.length) {
    state.cachedUploads = [];
    syncSelectionSummary();
    renderPersistedSelection();
    return;
  }

  setStatus('Reading files', 'busy');

  state.cachedUploads = await Promise.all(
    files.map(async (file) => ({
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
    })),
  );

  persistSelectionMetadata(files, wadMode.value);
  syncSelectionSummary();
  renderPersistedSelection();
  setStatus('Ready', 'ready');
  appendLog('info', `Prepared ${files.length} uploaded file(s) for the next launch.`);
}

function updateButtons() {
  fullscreenButton.disabled = !state.running;
  pointerButton.disabled = !state.running;
  playButton.disabled = state.running;
}

async function launchEngine() {
  if (state.running) {
    return;
  }

  const selection = classifyUploads(state.cachedUploads, wadMode.value);
  const args = buildCliArgs(selection);

  setStatus('Booting', 'busy');
  appendLog('info', `Launching Chocolate Doom with args: ${args.join(' ')}`);
  canvasOverlay.hidden = true;

  try {
    // The Emscripten output lives in /public, so it must be loaded via the
    // browser's native dynamic import rather than Vite's source graph.
    const { default: createDoomModule } = await (0, eval)(`import(${JSON.stringify(ENGINE_MODULE_URL)})`);

    const module = await createDoomModule({
      canvas,
      keyboardListeningElement: canvas,
      locateFile: (path) => `${ENGINE_FILE_BASE}${path}`,
      noInitialRun: true,
      onAbort: (reason) => {
        appendLog('error', `Engine aborted: ${reason}`);
        setStatus('Error', 'error');
      },
      preRun: [
        (runtimeModule) => {
          prepareVirtualFilesystem(runtimeModule, selection);
        },
      ],
      print: (text) => appendLog('info', text),
      printErr: (text) => appendLog('error', text),
    });

    state.engine = module;

    try {
      module.callMain(args);
    } catch (error) {
      const message = String(error ?? '');

      if (!message.includes('unwind') && !message.includes('SimulateInfiniteLoop')) {
        throw error;
      }
    }

    state.running = true;
    canvas.focus();
    setStatus('Running', 'running');
    updateButtons();
    appendLog('info', 'Engine initialized successfully.');
  } catch (error) {
    canvasOverlay.hidden = false;
    setStatus('Error', 'error');
    appendLog('error', `Failed to start engine: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
}

async function enterFullscreen() {
  if (!state.running) {
    return;
  }

  await canvasShell.requestFullscreen?.();
  canvas.focus();
}

async function lockPointer() {
  if (!state.running) {
    return;
  }

  await canvas.requestPointerLock?.();
  canvas.focus();
}

playButton.addEventListener('click', launchEngine);
fullscreenButton.addEventListener('click', enterFullscreen);
pointerButton.addEventListener('click', lockPointer);
wadMode.addEventListener('change', syncSelectionSummary);
wadInput.addEventListener('change', async (event) => {
  const files = [...(event.target.files ?? [])];
  await cacheUploads(files);
});

canvas.addEventListener('click', () => {
  if (state.running) {
    canvas.focus();
  }
});

updateButtons();
syncSelectionSummary();
renderPersistedSelection();
appendLog('info', 'Browser shell ready. Click Play to boot Freedoom.');
