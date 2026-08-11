const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, safeStorage, session } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const si = require('systeminformation');

const isDev = !app.isPackaged;
const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;
const OLLAMA_BASE = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;

/**
 * Phase‑0 security hardening – allowlist of Ollama HTTP endpoints that can be
 * accessed from the renderer via the non‑streaming `ollama:request` IPC call.
 *
 * Any endpoint not listed here is rejected with a 403 response. This prevents
 * a malicious renderer (e.g. via XSS in AI‑generated content) from making
 * arbitrary HTTP requests to localhost or other internal services.
 */
const ALLOWED_OLLAMA_ENDPOINTS = new Set([
  '/api/tags',
  '/api/version',
  '/api/chat',
  '/api/generate',
  '/api/pull',
  '/api/delete',
  '/api/gpu',
  // Add other safe endpoints here if new features need them.
]);

/**
 * Phase‑1 security hardening – encrypted at‑rest storage for sensitive
 * workspace data (engagement credentials, targets, notes) that previously
 * lived in plaintext localStorage.
 *
 * Uses Electron's safeStorage API, which is backed by the OS keychain
 * (macOS Keychain / Windows DPAPI / Linux Secret Service). The encryption
 * key never leaves the OS and is never visible to the renderer — only the
 * main process calls safeStorage.encryptString/decryptString.
 *
 * Same allowlist pattern as ALLOWED_OLLAMA_ENDPOINTS: the renderer can only
 * read/write keys explicitly listed here, so this can't become an arbitrary
 * file read/write primitive via IPC.
 */
const ALLOWED_SECURE_KEYS = new Set([
  'workspace-engagements',
]);

const SECURE_DATA_DIR = path.join(app.getPath('userData'), 'secure-store');

function ensureSecureDir() {
  if (!fs.existsSync(SECURE_DATA_DIR)) {
    fs.mkdirSync(SECURE_DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function secureFilePath(key) {
  // Defensive sanitization even though key is already checked against the
  // allowlist before this is called — never trust a string into a path join.
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(SECURE_DATA_DIR, `${safeKey}.enc`);
}

let mainWindow = null;
let splashWindow = null;
let ollamaProcess = null;

// ---------------------------------------------------------------------------
// Splash window creation
// ---------------------------------------------------------------------------
function createSplashWindow() {
  const durationMs = Math.floor(Math.random() * (28000 - 16000 + 1)) + 16000;
  const splashUrl = new URL(`splash.html?duration=${durationMs}`, `file://${__dirname}/`).toString();

  splashWindow = new BrowserWindow({
    width: 720,
    height: 640,
    frame: false,
    resizable: false,
    transparent: false,
    backgroundColor: '#05060a',
    alwaysOnTop: true,
    center: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'splash-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  splashWindow.loadURL(splashUrl);

  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });

  splashWindow.on('close', (e) => {
    if (splashWindow && !splashWindow.forceClose) {
      e.preventDefault();
    }
  });
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: false, // matches your existing frameless titlebar design
    show: false,
    backgroundColor: '#0a0e14', // avoid white flash on load, tune to your theme
    icon: isDev
    ? path.join(__dirname, '..', 'build', 'icons', 'linux', '512x512.png')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icons', 'linux', '512x512.png'), 
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, // REQUIRED: keeps renderer sandboxed from Node
      nodeIntegration: false, // REQUIRED: renderer never gets direct require()
      sandbox: true, 
    },
  });

  // Explicit setIcon() call as a fallback/verification — some Linux/Wayland
  // setups don't reliably apply the constructor's `icon` option, but a
  // direct setIcon() after creation is more consistently honored.
  const iconPath = isDev
    ? path.join(__dirname, '..', 'build', 'icons', 'linux', '512x512.png')
    : path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icons', 'linux', '512x512.png');
  const iconImage = nativeImage.createFromPath(iconPath);
  console.log('[Obscurum] Icon load check — isEmpty:', iconImage.isEmpty(), '| path:', iconPath);
  mainWindow.setIcon(iconImage);

  if (isDev) {
    // Dev mode: point at Vite dev server for hot reload
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load the built static files
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Right-click context menu for misspelled words — shows dictionary
  // suggestions from the native spellchecker enabled in app.whenReady().
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (params.misspelledWord) {
      const { Menu, MenuItem } = require('electron');
      const menu = new Menu();

      for (const suggestion of params.dictionarySuggestions) {
        menu.append(
          new MenuItem({
            label: suggestion,
            click: () => mainWindow.webContents.replaceMisspelling(suggestion),
          })
        );
      }

      if (params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
      }

      menu.append(
        new MenuItem({
          label: 'Add to Dictionary',
          click: () =>
            mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        })
      );

      menu.popup();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Window control IPC (for your custom frameless titlebar buttons)
// ---------------------------------------------------------------------------
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close());

// ---------------------------------------------------------------------------
// Ollama lifecycle: detect -> launch if needed -> health check
// ---------------------------------------------------------------------------

/** Resolve likely Ollama binary paths per platform. */
function candidateOllamaPaths() {
  const plat = process.platform;
  if (plat === 'darwin') {
    return ['/usr/local/bin/ollama', '/opt/homebrew/bin/ollama', '/Applications/Ollama.app/Contents/Resources/ollama'];
  }
  if (plat === 'win32') {
    return [
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
      'ollama.exe', // fallback: rely on PATH
    ];
  }
  // linux
  return ['/usr/local/bin/ollama', '/usr/bin/ollama', '/snap/bin/ollama'];
}

/** Check if Ollama's API is already responding. */
function isOllamaRunning() {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_BASE}/api/tags`, { timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Find an installed Ollama binary on disk, or null. */
function findOllamaBinary() {
  for (const candidate of candidateOllamaPaths()) {
    try {
      if (candidate.includes(path.sep) && fs.existsSync(candidate)) return candidate;
    } catch (_) {
      /* ignore */
    }
  }
  return null; // may still be resolvable via PATH; we try 'ollama' directly below
}

/** Attempt to launch Ollama as a detached background process. */
function launchOllama(binaryPath) {
  return new Promise((resolve) => {
    try {
      ollamaProcess = spawn(binaryPath || 'ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      });
      ollamaProcess.on('error', () => resolve(false));
      ollamaProcess.unref();

      // Poll for readiness up to ~10s
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (await isOllamaRunning()) {
          clearInterval(poll);
          resolve(true);
        } else if (attempts > 20) {
          clearInterval(poll);
          resolve(false);
        }
      }, 500);
    } catch (_) {
      resolve(false);
    }
  });
}

/**
 * Full startup sequence: check running -> try launch -> prompt user if all else fails.
 * Returns a status string the renderer can react to: 'running' | 'launched' | 'not_found'
 */
async function ensureOllamaAvailable() {
  if (await isOllamaRunning()) return 'running';

  const binary = findOllamaBinary();
  const launched = await launchOllama(binary); // falls back to PATH lookup if binary is null
  if (launched) return 'launched';

  return 'not_found';
}

ipcMain.handle('ollama:ensure-available', async () => {
  const status = await ensureOllamaAvailable();
  if (status === 'not_found') {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Ollama Not Found',
      message: 'Obscurum requires Ollama to run local AI models.',
      detail: 'Ollama was not detected on this system. Install it to continue.',
      buttons: ['Open Download Page', 'Cancel'],
      defaultId: 0,
    });
    if (result.response === 0) {
      shell.openExternal('https://ollama.com/download');
    }
  }
  return status;
});

// ---------------------------------------------------------------------------
// Ollama API proxy — non-streaming requests (e.g. GET /api/tags)
// ---------------------------------------------------------------------------
ipcMain.handle('ollama:request', async (_event, { endpoint, method = 'GET', body = null }) => {
  // Phase‑0 protection: reject any endpoint that is not explicitly allow‑listed.
  if (!ALLOWED_OLLAMA_ENDPOINTS.has(endpoint)) {
    return { status: 403, data: { error: 'Endpoint not allowed' } };
  }
  
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    
    // Use an agent with keepAlive enabled to prevent connection resets
    const agent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 1000,
      maxSockets: 50,
      maxFreeSockets: 10,
      timeout: 60000, // socket timeout (60s)
    });

    const options = {
      host: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: endpoint,
      method: method,
      agent: agent, // ✅ Use keepAlive agent
      headers: payload
        ? { 
            'Content-Type': 'application/json', 
            'Content-Length': Buffer.byteLength(payload),
            'Connection': 'keep-alive', // ✅ Keep connection alive
          }
        : { 'Connection': 'keep-alive' },
      timeout: 120000, // ✅ Increased to 2 minutes (120,000 ms) to avoid ECONNRESET
    };
    
    console.log(`[main] Ollama request: ${method} ${endpoint}`);
    
    const req = http.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log(`[main] Ollama response status: ${res.statusCode}`);
        console.log(`[main] Ollama response data length: ${data.length}`);
        
        try {
          // Try to parse JSON, but if it fails, return raw data
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch (_) {
          // If JSON parsing fails, return as string
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('[main] Ollama request error:', err);
      resolve({ 
        status: 500, 
        data: { error: err.message, code: err.code, endpoint, method } 
      });
    });
    
    req.on('timeout', () => {
      console.error('[main] Ollama request timeout (120s)');
      req.destroy();
      resolve({ 
        status: 408, 
        data: { error: 'Request timeout' } 
      });
    });
    
    if (payload) req.write(payload);
    req.end();
  });
});

// ---------------------------------------------------------------------------
// Ollama API proxy — STREAMING requests (e.g. POST /api/chat with stream:true)
//
// Uses send/on, not invoke/handle: invoke/handle is one-shot request-response
// and physically cannot deliver multiple partial results. send/on is a
// fire-and-forget event channel, so main can push as many messages as it
// wants without the renderer blocking.
//
// Ollama's streaming responses are newline-delimited JSON (NDJSON) — one
// JSON object per line. TCP/HTTP chunk boundaries do NOT respect line
// boundaries, so a single 'data' event from Node's http module can end
// mid-line. We buffer incomplete lines and only forward/parse complete ones.
// ---------------------------------------------------------------------------
ipcMain.on('ollama:stream-start', (event, { requestId, endpoint, method = 'POST', body = null }) => {
  const sender = event.sender;
  const payload = body ? JSON.stringify(body) : null;

  // Use keepAlive agent for streaming as well
  const agent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
  });

  const req = http.request(
    {
      host: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: endpoint,
      method,
      agent: agent,
      headers: payload
        ? { 
            'Content-Type': 'application/json', 
            'Content-Length': Buffer.byteLength(payload),
            'Connection': 'keep-alive',
          }
        : { 'Connection': 'keep-alive' },
      timeout: 300000, // 5 minute timeout for long streaming
    },
    (res) => {
      res.setEncoding('utf8');
      let lineBuffer = ''; // holds any incomplete trailing line across chunks

      res.on('data', (chunk) => {
        lineBuffer += chunk;

        // Split on newlines. The LAST element after split may be an
        // incomplete line (no trailing \n yet) — keep it in the buffer
        // instead of forwarding it.
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop(); // last element: complete if chunk ended in \n, else partial

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue; // skip blank lines
          try {
            const parsed = JSON.parse(trimmed);
            sender.send(`ollama:stream-chunk:${requestId}`, parsed);
          } catch (err) {
            // A malformed line here means Ollama sent something unexpected,
            // not a chunk-boundary issue (those are handled by the buffer).
            sender.send(`ollama:stream-error:${requestId}`, {
              message: 'Failed to parse NDJSON line from Ollama',
              raw: trimmed,
            });
          }
        }
      });

      res.on('end', () => {
        // Flush any final complete line left in the buffer with no trailing \n
        const trimmed = lineBuffer.trim();
        if (trimmed) {
          try {
            const parsed = JSON.parse(trimmed);
            sender.send(`ollama:stream-chunk:${requestId}`, parsed);
          } catch (err) {
            sender.send(`ollama:stream-error:${requestId}`, {
              message: 'Failed to parse final NDJSON line from Ollama',
              raw: trimmed,
            });
          }
        }
        sender.send(`ollama:stream-end:${requestId}`);
      });
    }
  );

  req.on('error', (err) => {
    sender.send(`ollama:stream-error:${requestId}`, { message: err.message });
  });

  req.on('timeout', () => {
    req.destroy();
    sender.send(`ollama:stream-error:${requestId}`, { message: 'Stream timeout' });
  });

  if (payload) req.write(payload);
  req.end();
});

// ---------------------------------------------------------------------------
// Phase‑1: Encrypted secure storage (replaces plaintext localStorage for
// sensitive workspace data — credentials, targets, notes)
// ---------------------------------------------------------------------------
ipcMain.handle('secure-store:set', (_event, key, value) => {
  if (!ALLOWED_SECURE_KEYS.has(key)) {
    return { ok: false, error: 'key not allowed' };
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'OS encryption not available on this platform' };
  }
  try {
    ensureSecureDir();
    const plaintext = JSON.stringify(value);
    const encrypted = safeStorage.encryptString(plaintext);
    fs.writeFileSync(secureFilePath(key), encrypted, { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('secure-store:get', (_event, key) => {
  if (!ALLOWED_SECURE_KEYS.has(key)) {
    return { ok: false, error: 'key not allowed' };
  }
  const filePath = secureFilePath(key);
  if (!fs.existsSync(filePath)) {
    return { ok: true, value: null }; // no data saved yet — not an error
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'OS encryption not available on this platform' };
  }
  try {
    const encrypted = fs.readFileSync(filePath);
    const plaintext = safeStorage.decryptString(encrypted);
    return { ok: true, value: JSON.parse(plaintext) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('secure-store:delete', (_event, key) => {
  if (!ALLOWED_SECURE_KEYS.has(key)) {
    return { ok: false, error: 'key not allowed' };
  }
  try {
    const filePath = secureFilePath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ---------------------------------------------------------------------------
// NEW: System Information Handler
// ---------------------------------------------------------------------------
ipcMain.handle('system:info', async () => {
  try {
    const [cpu, mem, diskLayout, osInfo, fsSize, currentLoad, graphics] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.diskLayout(),
      si.osInfo(),
      si.fsSize(),
      si.currentLoad(),
      si.graphics(),
    ]);

    let totalDiskGB = 0;
    let usedDiskGB = 0;
    let freeDiskGB = 0;

    if (fsSize && fsSize.length > 0) {
      const sorted = fsSize.sort((a, b) => b.size - a.size);
      const mainDisk = sorted[0];
      if (mainDisk) {
        totalDiskGB = mainDisk.size / 1024 / 1024 / 1024;
        usedDiskGB = mainDisk.used / 1024 / 1024 / 1024;
        freeDiskGB = mainDisk.available / 1024 / 1024 / 1024;
      }
    }

    if (totalDiskGB === 0 && diskLayout && diskLayout.length > 0) {
      const total = diskLayout.reduce((acc, d) => acc + d.size, 0);
      totalDiskGB = total / 1024 / 1024 / 1024;
      usedDiskGB = totalDiskGB * 0.4;
      freeDiskGB = totalDiskGB * 0.6;
    }

    let cpuModel = cpu.manufacturer || '';
    if (cpu.brand) {
      cpuModel += cpuModel ? ' ' + cpu.brand : cpu.brand;
    }
    if (!cpuModel || cpuModel.trim() === '') {
      cpuModel = cpu.brand || 'Unknown CPU';
    }
    cpuModel = cpuModel.replace(/\s+/g, ' ').trim();

    let gpuName = 'No GPU detected';
    let gpuMemory = 0;
    if (graphics && graphics.controllers && graphics.controllers.length > 0) {
      const gpu = graphics.controllers[0];
      gpuName = gpu.model || gpu.name || 'Unknown GPU';
      gpuMemory = gpu.vram || 0;
      if (gpu.vendor) {
        gpuName = gpu.vendor + ' ' + gpuName;
      }
    }

    return {
      cpu: {
        model: cpuModel,
        cores: cpu.cores || cpu.physicalCores || 1,
        architecture: cpu.architecture || process.arch || 'Unknown',
        speed: cpu.speed || 0,
        usagePercent: currentLoad ? currentLoad.currentLoad : 0,
      },
      ram: {
        total: mem.total / 1024 / 1024 / 1024,
        used: mem.active / 1024 / 1024 / 1024,
        free: mem.free / 1024 / 1024 / 1024,
        available: mem.available / 1024 / 1024 / 1024,
      },
      disk: {
        total: totalDiskGB,
        used: usedDiskGB,
        free: freeDiskGB,
        usedPercent: totalDiskGB > 0 ? (usedDiskGB / totalDiskGB) * 100 : 0,
      },
      os: {
        platform: osInfo.platform || process.platform || 'Unknown',
        release: osInfo.release || 'Unknown',
        arch: osInfo.arch || process.arch || 'Unknown',
        hostname: osInfo.hostname || 'localhost',
      },
      gpu: {
        name: gpuName,
        memory: gpuMemory,
      },
    };
  } catch (err) {
    console.error('System info error:', err);
    return null;
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  // Enable Chromium's native spellchecker (red squiggly underlines on
  // misspelled words). Without explicitly setting a language, Electron
  // can silently fail to load a dictionary and the underlines never appear.
  session.defaultSession.setSpellCheckerLanguages(['en-US']);
  session.defaultSession.setSpellCheckerEnabled(true);

  createSplashWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

ipcMain.on('splash-start', () => {
  if (!mainWindow) {
    createWindow();
  }

  const showMain = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.forceClose = true;
      splashWindow.close();
      splashWindow = null;
    }
  };

  if (mainWindow) {
    if (mainWindow.isVisible()) {
      showMain();
    } else {
      mainWindow.once('ready-to-show', showMain);
      if (mainWindow.webContents.isLoading() === false) {
        showMain();
      }
    }
  }
});

// Close button on the splash — quit the whole app.
ipcMain.on('splash-close', () => {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.forceClose = true;
    splashWindow.close();
    splashWindow = null;
  }
  app.quit();
});

app.on('window-all-closed', () => {
  if (ollamaProcess && !ollamaProcess.killed) {
    // Only kill Ollama if WE started it this session — a real implementation
    // should track this explicitly rather than always killing on exit, since
    // the user may have had Ollama running independently before Obscurum opened.
  }
  if (process.platform !== 'darwin') app.quit();
});