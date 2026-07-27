const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn, execFile } = require('child_process');

const isDev = !app.isPackaged;
const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;
const OLLAMA_BASE = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;

let mainWindow = null;
let ollamaProcess = null;

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
    backgroundColor: '#0a0e14', // avoid white flash on load, tune to your theme
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, // REQUIRED: keeps renderer sandboxed from Node
      nodeIntegration: false, // REQUIRED: renderer never gets direct require()
      sandbox: true,
    },
  });

  if (isDev) {
    // Dev mode: point at Vite dev server for hot reload
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // Production: load the built static files
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

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
  const fs = require('fs');
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
      message: 'GhostShell requires Ollama to run local AI models.',
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
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: endpoint,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
          } catch (_) {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', (err) => reject(err));
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

  const req = http.request(
    {
      host: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: endpoint,
      method,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        : {},
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

  if (payload) req.write(payload);
  req.end();
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (ollamaProcess && !ollamaProcess.killed) {
    // Only kill Ollama if WE started it this session — a real implementation
    // should track this explicitly rather than always killing on exit, since
    // the user may have had Ollama running independently before GhostShell opened.
  }
  if (process.platform !== 'darwin') app.quit();
});