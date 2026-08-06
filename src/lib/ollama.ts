type OllamaStreamCallbacks = {
  onChunk?: (data: unknown) => void
  onEnd?: () => void
  onError?: (err: { message: string; raw?: string }) => void
}

type ObscurumWindow = Window & {
  obscurum?: {
    ollamaRequest?: (endpoint: string, method?: string, body?: unknown) => Promise<{ status: number; data: unknown; stream?: boolean }>
    ensureOllamaAvailable?: () => Promise<'running' | 'launched' | 'not_found'>
    ollamaStream?: (
      endpoint: string,
      body: unknown,
      callbacks: OllamaStreamCallbacks
    ) => { cancel: () => void; requestId: string }
  }
}

interface OllamaRequestResult {
  status: number
  data: unknown
  stream?: boolean
}

export const OLLAMA_HOST = import.meta.env.VITE_OLLAMA_HOST ?? 'http://127.0.0.1:11434'

function getOllamaHosts(primary = OLLAMA_HOST): string[] {
  const hosts = [primary]
  try {
    const url = new URL(primary)
    if (url.hostname === '127.0.0.1') hosts.push(primary.replace('127.0.0.1', 'localhost'))
    if (url.hostname === 'localhost') hosts.push(primary.replace('localhost', '127.0.0.1'))
  } catch {
    /* keep primary only */
  }
  return [...new Set(hosts)]
}

function getObscurumBridge() {
  if (typeof window === 'undefined') return null
  return (window as ObscurumWindow).obscurum ?? null
}

async function requestOllama(endpoint: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<OllamaRequestResult> {
  const bridge = getObscurumBridge()
  if (bridge?.ollamaRequest) {
    const result = await bridge.ollamaRequest(endpoint, method, body ?? null)
    return {
      status: result?.status ?? 200,
      data: result?.data ?? null,
      stream: typeof result?.stream === 'boolean' ? result.stream : false,
    }
  }

  const errors: string[] = []
  for (const host of getOllamaHosts()) {
    try {
      const res = await fetch(`${host}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      })
      const rawText = await res.text()
      let data: unknown = rawText
      try {
        data = rawText ? JSON.parse(rawText) : null
      } catch {
        /* keep raw string */
      }
      return { status: res.status, data, stream: body ? (typeof body === 'object' && 'stream' in body && body.stream === true) : false }
    } catch (err) {
      errors.push(describeFetchError(err, host))
    }
  }

  throw new Error(errors.join('\n'))
}

function describeFetchError(err: unknown, host: string): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'Request timed out'
  if (err instanceof TypeError) {
    return `Could not reach Ollama at ${host}. This is usually Ollama not running, a blocked localhost request, or a host/port mismatch.`
  }
  return err instanceof Error ? err.message : String(err)
}

export const isLocalOllama = (host = OLLAMA_HOST) => {
  try {
    const { hostname } = new URL(host)
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1'
  } catch {
    return false
  }
}

export type OllamaChatOptions = {
  temperature?: number
  num_ctx?: number
  num_predict?: number
  top_p?: number
  top_k?: number
  repeat_penalty?: number
  keep_alive?: string
}

export type OllamaMessage = { role: 'system' | 'user' | 'assistant'; content: string }

// Cloud models (e.g. qwen3-coder:480b-cloud, gpt-oss:20b-cloud) reject the
// full `options` object — Ollama's cloud proxy returns HTTP 400 if fields
// like num_ctx / top_k / repeat_penalty are present. Only send `options`
// for local models.
const isCloudModel = (model: string) => model.includes('-cloud')

export type OllamaGenerateOptions = {
  temperature?: number
  num_predict?: number
  top_p?: number
  top_k?: number
  repeat_penalty?: number
}

export async function streamOllamaChat(
  model: string,
  messages: OllamaMessage[],
  options: OllamaChatOptions,
  signal?: AbortSignal,
  onToken?: (token: string) => void,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  }

  if (isCloudModel(model)) {
    // Cloud models: send minimal/no options. Some accept temperature only.
    if (options.temperature !== undefined) {
      body.options = { temperature: options.temperature }
    }
  } else {
    body.keep_alive = options.keep_alive ?? '15m'
    body.options = {
      temperature: options.temperature ?? 0.7,
      num_ctx: options.num_ctx ?? 8192,
      num_predict: options.num_predict ?? -1,
      top_p: options.top_p ?? 0.95,
      top_k: options.top_k ?? 40,
      repeat_penalty: options.repeat_penalty ?? 1.05,
    }
  }

  const bridge = getObscurumBridge()

  // Real token-by-token streaming path (Electron desktop build): uses
  // send/on under the hood, so onToken fires progressively as Ollama
  // generates, not all at once after the full reply finishes.
  if (bridge?.ollamaStream) {
    return new Promise<string>((resolve, reject) => {
      let full = ''
      let cancelled = false

      const { cancel } = bridge.ollamaStream!('/api/chat', body, {
        onChunk: (chunk) => {
          if (cancelled) return
          const parsed = chunk as { message?: { content?: string }; response?: string }
          const token = parsed?.message?.content ?? parsed?.response ?? ''
          if (token) {
            full += token
            onToken?.(full)
          }
        },
        onEnd: () => {
          if (!cancelled) resolve(full)
        },
        onError: (err) => {
          if (!cancelled) reject(new Error(err.message))
        },
      })

      if (signal) {
        signal.addEventListener('abort', () => {
          cancelled = true
          cancel()
          reject(new DOMException('Aborted', 'AbortError'))
        })
      }
    })
  }

  // Browser fallback (no Electron bridge available, e.g. running as a plain
  // web app): no true streaming possible without a backend to proxy SSE/NDJSON
  // to the browser, so we fall back to a single non-streamed request and
  // fire onToken once with the complete content. This is NOT progressive —
  // it's a deliberate degrade, not a bug, for environments without the bridge.
  const { status, data } = await requestOllama('/api/chat', 'POST', { ...body, stream: false }, signal)
  if (status >= 400) {
    throw new Error(`HTTP ${status}`)
  }

  const content = typeof data === 'object' && data
    ? (data as { message?: { content?: string }; response?: string }).message?.content ?? (data as { response?: string }).response ?? ''
    : typeof data === 'string'
      ? data
      : ''

  if (content) {
    onToken?.(content)
  }

  return content
}

export async function checkOllamaHealth(): Promise<{ ok: boolean; version?: string }> {
  try {
    const { status, data } = await requestOllama('/api/version', 'GET', undefined, AbortSignal.timeout(3000))
    if (status >= 200 && status < 300) {
      const payload = data as { version?: string } | undefined
      return { ok: true, version: payload?.version }
    }
  } catch {
    /* fall back to false */
  }
  return { ok: false }
}

/**
 * Non-stream chat helper used by non-chat components.
 * Returns the assistant message content (or empty string).
 */
export async function ollamaChatOnce(
  model: string,
  messages: (OllamaMessage & { images?: string[] })[],
  options: OllamaChatOptions,
  signal?: AbortSignal,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  }

  if (isCloudModel(model)) {
    if (options.temperature !== undefined) body.options = { temperature: options.temperature }
  } else {
    body.keep_alive = options.keep_alive ?? '15m'
    body.options = {
      temperature: options.temperature ?? 0.7,
      num_ctx: options.num_ctx ?? 8192,
      num_predict: options.num_predict ?? -1,
      top_p: options.top_p ?? 0.95,
      top_k: options.top_k ?? 40,
      repeat_penalty: options.repeat_penalty ?? 1.05,
    }
  }

  const { status, data } = await requestOllama('/api/chat', 'POST', body, signal)
  if (status >= 400) {
    throw new Error(`HTTP ${status}`)
  }
  const content = typeof data === 'object' && data
    ? (data as { message?: { content?: string }; response?: string }).message?.content ?? (data as { response?: string }).response ?? ''
    : typeof data === 'string'
      ? data
      : ''
  return content.toString()
}

/**
 * Non-stream generate helper for /api/generate usage.
 * Returns the `response` field (or empty string).
 */
export async function ollamaGenerateOnce(
  model: string,
  prompt: string,
  options: OllamaGenerateOptions = {},
  signal?: AbortSignal,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
  }

  if (isCloudModel(model)) {
    if (options.temperature !== undefined) body.options = { temperature: options.temperature }
  } else {
    body.keep_alive = '15m'
    body.options = {
      temperature: options.temperature ?? 0.7,
      num_predict: options.num_predict ?? -1,
      top_p: options.top_p ?? 0.95,
      top_k: options.top_k ?? 40,
      repeat_penalty: options.repeat_penalty ?? 1.05,
    }
  }

  const { status, data } = await requestOllama('/api/generate', 'POST', body, signal)
  if (status >= 400) {
    throw new Error(`HTTP ${status}`)
  }
  const response = typeof data === 'object' && data
    ? (data as { response?: string }).response ?? ''
    : typeof data === 'string'
      ? data
      : ''
  return response.toString()
}