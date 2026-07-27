import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  RefreshCw,
  Plus,
  X,
  Download,
  Cpu,
  Save,
  Trash2,
  Tag,
  Star,
  Search,
  AlertCircle,
  Activity,
  BarChart3,
  Package,
  Server,
  TerminalSquare,
  Inbox,
  ChevronRight,
} from 'lucide-react'
import { OLLAMA_HOST } from '../../lib/ollama'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type OllamaModel = {
  name: string
  size: number
  digest: string
  modified_at: string
  // Tacked on by fetchModels() — used to surface VRAM/quant metadata that
  // Ollama doesn't expose (well, not through /api/tags at least).
  details?: {
    family?: string
    parameter_size?: string
    quantization_level?: string
    size_vram?: number
  }
}

type ModelLimits = {
  // Hard cap on tokens the model is allowed to *generate* in a single
  // response. Anything else in this struct is a ceiling that the system
  // prompt + chat history must fit under.
  num_predict: number
  // Total context window budget. Includes system prompt + history + this
  // turn's input + the model's own output (which is bounded by num_predict).
  num_ctx: number
  // How many of the most recent messages to bring into the request before
  // trimming. Independent of num_ctx — a long-running chat might still
  // want to drop old turns even if the model has a 200k window.
  max_messages: number
}

type ModelCategory = 'coding' | 'reasoning' | 'vision' | 'general' | 'small' | 'specialized'

type RecommendedModel = {
  name: string
  description: string
  category: ModelCategory
  size: string
  pullHint: string
  // We override Ollama's defaults for these because the defaults are
  // tuned for the unquantized model's original context — small/quantized
  // builds benefit from tighter windows.
  recommendedLimits?: ModelLimits
  isFeatured?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const USER_LIMITS_KEY = 'ghostshell-model-user-limits'

// Strict defaults — the previous version had a typo in the coder default
// (num_predict: 8000 alongside num_ctx: 8072) which made the model drop
// generation mid-response on long outputs. The new pair leaves 3072 tokens
// of headroom for the model's own output, which is the standard 32k_ctx
// window that Minimax and similar coder models were trained on.
const DEFAULT_LIMITS: Record<string, ModelLimits> = {
  'minimax-m3': { num_predict: 4000, num_ctx: 30720, max_messages: 35 },
  'qwen2.5-coder': { num_predict: 4000, num_ctx: 30720, max_messages: 30 },
  'gpt-oss': { num_predict: 4000, num_ctx: 30720, max_messages: 20 },
  'qwen2.5vl': { num_predict: 4000, num_ctx: 30720, max_messages: 15 },
  _default: { num_predict: 4000, num_ctx: 30720, max_messages: 25 },
}

// Filterable tags. Anything with a recommended tag AND a custom model
// without a recognised tag can land in 'general'. Custom models use the
// last segment after `/` (e.g. `user/foo:latest` → `latest`).
const TAG_FILTERS = ['latest', 'q4_K_M', 'q5_K_M', 'q8_0', 'general'] as const
type TagFilter = (typeof TAG_FILTERS)[number]

// Recommended models. The 'size' field is what users will see in the UI;
// the pullHint is what Ollama actually expects.
const RECOMMENDED: RecommendedModel[] = [
  {
    name: 'minimax-m3',
    description: 'Primary coder — concise, follows instructions, handles payloads and exploit work.',
    category: 'coding',
    size: '~12 GB',
    pullHint: 'minimax-m3',
    recommendedLimits: DEFAULT_LIMITS['minimax-m3'],
    isFeatured: true,
  },
  {
    name: 'qwen2.5-coder:7b',
    description: 'Reliable offline coder — solid for short scripts and write-up help when Ollama is offline.',
    category: 'coding',
    size: '~4.7 GB',
    pullHint: 'qwen2.5-coder:7b',
    recommendedLimits: DEFAULT_LIMITS['qwen2.5-coder'],
  },
  {
    name: 'gpt-oss:20b',
    description: 'Reasoner — multi-step analysis, CVE breakdowns, post-exploit methodology.',
    category: 'reasoning',
    size: '~14 GB',
    pullHint: 'gpt-oss:20b',
    recommendedLimits: DEFAULT_LIMITS['gpt-oss'],
  },
  {
    name: 'qwen2.5vl:3b',
    description: 'Vision — reads screenshots, OCR, image-based payloads.',
    category: 'vision',
    size: '~2.1 GB',
    pullHint: 'qwen2.5vl:3b',
    recommendedLimits: DEFAULT_LIMITS['qwen2.5vl'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Cross-component bridge: the active model is set here and read from
// ChatWindow via useActiveModel(). Events are emitted on every update so
// open ChatWindow instances re-render without a refresh.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_MODEL_KEY = 'ghostshell-active-model'
const DEFAULT_ACTIVE_MODEL = 'minimax-m3'

export function getActiveModel(): string {
  try {
    const v = localStorage.getItem(ACTIVE_MODEL_KEY)
    return v && v.trim() ? v : DEFAULT_ACTIVE_MODEL
  } catch {
    return DEFAULT_ACTIVE_MODEL
  }
}

export function setActiveModel(name: string) {
  try {
    localStorage.setItem(ACTIVE_MODEL_KEY, name)
    window.dispatchEvent(new CustomEvent('ollama-active-model-changed', { detail: name }))
  } catch {
    /* ignore */
  }
}

export function hasActiveModelPreference(): boolean {
  try {
    return !!localStorage.getItem(ACTIVE_MODEL_KEY)
  } catch {
    return false
  }
}

// Reads the user overrides + falls back to per-model defaults. The previous
// version called this on every render of every model card, which read
// localStorage every time. The new entry point is a memoized hook that
// reads once per limitsTick.
export function getModelLimits(name: string): ModelLimits {
  const base = (DEFAULT_LIMITS[name] ?? DEFAULT_LIMITS._default) as ModelLimits
  let user: Partial<ModelLimits> = {}
  try {
    const raw = localStorage.getItem(USER_LIMITS_KEY)
    if (raw) {
      const all = JSON.parse(raw) as Record<string, Partial<ModelLimits>>
      user = all[name] ?? {}
    }
  } catch {
    /* ignore */
  }
  return {
    num_predict: user.num_predict ?? base.num_predict,
    num_ctx: user.num_ctx ?? base.num_ctx,
    max_messages: user.max_messages ?? base.max_messages,
  }
}

function setModelLimits(name: string, limits: ModelLimits) {
  try {
    const raw = localStorage.getItem(USER_LIMITS_KEY)
    const all: Record<string, ModelLimits> = raw ? JSON.parse(raw) : {}
    all[name] = limits
    localStorage.setItem(USER_LIMITS_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function useActiveModel(): string {
  const [active, setActive] = useState<string>(getActiveModel)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail
      if (typeof detail === 'string') setActive(detail)
    }
    window.addEventListener('ollama-active-model-changed', handler)
    return () => window.removeEventListener('ollama-active-model-changed', handler)
  }, [])
  return active
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ModelManager() {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [loading, setLoading] = useState(false)
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullStatus, setPullStatus] = useState<{ status: string } | null>(null)
  const [pullProgress, setPullProgress] = useState<number>(0)
  const [showCustomPull, setShowCustomPull] = useState(false)
  const [_customModel, _setCustomModel] = useState('')
  const [showCustomize, setShowCustomize] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterTag, setFilterTag] = useState<TagFilter | 'all'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified' | 'category'>('name')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeModel, setActiveModelState] = useState<string>(getActiveModel)
  const [limitsTick, setLimitsTick] = useState(0)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [view, setView] = useState<'installed' | 'recommendations' | 'stats'>('installed')
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Re-read user limits from localStorage. `limitsTick` is bumped every
  // time the editor saves so this memo invalidates and the UI shows the
  // new numbers without a manual refresh.
  const userLimits = useMemo(() => {
    try {
      const raw = localStorage.getItem(USER_LIMITS_KEY)
      return raw ? (JSON.parse(raw) as Record<string, ModelLimits>) : {}
    } catch {
      return {}
    }
  }, [limitsTick])

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch + pull
  // ─────────────────────────────────────────────────────────────────────────

  const fetchModels = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { status, data } = await window.ghostshell?.ollamaRequest?.('/api/tags', 'GET') ?? { status: 200, data: null }
      if (status >= 400) {
        throw new Error(`HTTP ${status}`)
      }
      const payload = data as { models?: OllamaModel[] } | null
      const installed = (payload?.models || []) as OllamaModel[]
      setModels(installed)
      setLastRefresh(new Date())

      // If the active model isn't installed, fall back to the first one.
      // The previous version left this dangling — if a user deleted the
      // active model from Ollama, every subsequent chat broke until they
      // manually re-set the active model.
      const current = getActiveModel()
      if (current && installed.length > 0 && !installed.some(m => m.name === current)) {
        setActiveModel(installed[0].name)
        setActiveModelState(installed[0].name)
      }
    } catch (err) {
      const e = err as Error
      setError(`Failed to reach Ollama at ${OLLAMA_HOST}: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-fetch on mount, plus a periodic refresh while the panel is open so
  // a stale view doesn't lie about what's installed. Without this, if
  // Ollama is restarted while the panel is open, the UI shows the old
  // list forever. We pause polling during a pull to avoid stomping the
  // optimistic state we inserted into `models` mid-stream.
  useEffect(() => {
    fetchModels()
    const interval = setInterval(() => {
      if (!pulling) fetchModels()
    }, 30_000)
    return () => clearInterval(interval)
  }, [fetchModels, pulling])

  // Re-read active model on cross-component change events.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail
      if (typeof detail === 'string') setActiveModelState(detail)
    }
    window.addEventListener('ollama-active-model-changed', handler)
    return () => window.removeEventListener('ollama-active-model-changed', handler)
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Pull / delete
  // ─────────────────────────────────────────────────────────────────────────

  const pullModel = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || /\s/.test(trimmed)) {
      setPullStatus({ status: 'Invalid model name. Pull failed (whitespace).' })
      setTimeout(() => setPullStatus(null), 4000)
      return
    }

    setPulling(trimmed)
    setPullStatus({ status: 'Starting download...' })
    setPullProgress(0)

    // Push an optimistic entry so the model shows up in the list immediately
    // — otherwise the user can click "Use" on a freshly-pulled model only
    // to find nothing in the dropdown. The optimistic entry gets replaced
    // by the real one once fetchModels() resolves.
    setModels(prev => {
      const next = prev.filter(m => m.name !== trimmed)
      const optimistic: OllamaModel = {
        name: trimmed,
        size: 0,
        digest: '',
        modified_at: new Date().toISOString(),
      }
      return [...next, optimistic]
    })

    try {
      const { status, data } = await window.ghostshell?.ollamaRequest?.('/api/pull', 'POST', { name: trimmed, stream: true }) ?? { status: 200, data: null }

      if (status >= 400) {
        throw new Error(`HTTP ${status}`)
      }

      const message = typeof data === 'string' ? data : ''
      if (message) {
        setPullStatus({ status: message })
      }

      setPullStatus({ status: 'Pull complete! ✓' })
      setTimeout(() => setPullStatus(null), 3000)
      await fetchModels()
    } catch (err) {
      const e = err as Error
      setPullStatus({ status: `Pull failed: ${e.message}` })
      setTimeout(() => setPullStatus(null), 6000)
      // Drop the optimistic entry — it's lying about a model that doesn't exist.
      setModels(prev => prev.filter(m => m.name !== trimmed || m.digest !== ''))
    } finally {
      setPulling(null)
      setPullProgress(0)
    }
  }

  const deleteModel = async (name: string) => {
    if (!confirm(`Delete "${name}" from your local Ollama installation?`)) return

    // Don't leave the active model pointing at one we just deleted.
    if (activeModel === name) {
      const fallback = models.find(m => m.name !== name)?.name ?? DEFAULT_ACTIVE_MODEL
      setActiveModel(fallback)
      setActiveModelState(fallback)
    }

    try {
      const { status } = await window.ghostshell?.ollamaRequest?.('/api/delete', 'DELETE', { name }) ?? { status: 200 }

      if (status >= 400) {
        throw new Error(`HTTP ${status}`)
      }

      setPullStatus({ status: `Deleted ${name} ✓` })
      setTimeout(() => setPullStatus(null), 3000)
      await fetchModels()
    } catch (err) {
      const e = err as Error
      setPullStatus({ status: `Delete failed: ${e.message}` })
      setTimeout(() => setPullStatus(null), 6000)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Activation
  // ─────────────────────────────────────────────────────────────────────────

  const activateModel = (name: string) => {
    setActiveModel(name)
    setActiveModelState(name)
    setPullStatus({ status: `Active model set to ${name}` })
    setTimeout(() => setPullStatus(null), 2000)
  }

  const openInTerminal = (name: string) => {
    const cmd = `ollama run ${name}`
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(cmd).then(
        () => {
          setPullStatus({ status: `Copied: ${cmd}` })
          setTimeout(() => setPullStatus(null), 2000)
        },
        () => {
          setPullStatus({ status: `Run in your terminal: ${cmd}` })
          setTimeout(() => setPullStatus(null), 4000)
        },
      )
    } else {
      setPullStatus({ status: `Run in your terminal: ${cmd}` })
      setTimeout(() => setPullStatus(null), 4000)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Installed-list filtering / sorting
  // ─────────────────────────────────────────────────────────────────────────

  const isInstalled = (name: string) => {
    const [base, tag] = name.split(':')
    const wantedTag = tag ?? 'latest'
    return models.some(m => {
      const [mBase, mTag] = m.name.split(':')
      if (mBase !== base) return false
      if (wantedTag === 'latest' || !wantedTag) return true
      return mTag === wantedTag
    })
  }

  const getModelTag = (name: string): string => {
    const idx = name.lastIndexOf(':')
    if (idx === -1) return 'latest'
    return name.slice(idx + 1)
  }

  const getModelCategory = (name: string): ModelCategory => {
    const found = RECOMMENDED.find(r => name.includes(r.name.split(':')[0]))
    if (found) return found.category
    if (name.includes('vision') || name.includes('vl') || name.includes('llava')) return 'vision'
    if (name.includes('coder') || name.includes('code')) return 'coding'
    if (name.includes('reasoning') || name.includes('r1') || name.includes('deepseek')) return 'reasoning'
    return 'general'
  }

  const filteredModels = useMemo(() => {
    let result = models

    if (filterTag !== 'all') {
      result = result.filter(m => {
        const tag = getModelTag(m.name)
        if (filterTag === 'general') return true
        return tag === filterTag
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(m => m.name.toLowerCase().includes(q))
    }

    return result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'size':
          return b.size - a.size
        case 'modified':
          return b.modified_at.localeCompare(a.modified_at)
        case 'category': {
          const ca = getModelCategory(a.name)
          const cb = getModelCategory(b.name)
          return ca.localeCompare(cb)
        }
      }
    })
  }, [models, filterTag, sortBy, searchQuery])

  const filteredRecommended = useMemo(() => {
    if (!searchQuery.trim()) return RECOMMENDED
    const q = searchQuery.toLowerCase()
    return RECOMMENDED.filter(r => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
  }, [searchQuery])

  const stats = useMemo(() => {
    const totalSize = models.reduce((acc, m) => acc + m.size, 0)
    const byCategory: Record<string, number> = {}
    models.forEach(m => {
      const cat = getModelCategory(m.name)
      byCategory[cat] = (byCategory[cat] ?? 0) + 1
    })
    return {
      total: models.length,
      totalSize,
      byCategory,
      activeModel,
      activeInstalled: models.some(m => m.name === activeModel),
    }
  }, [models, activeModel])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-full gap-3 p-3">
      {/* Left rail — view switcher + stats snapshot */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-2">
        <div className="bg-ghost-surface border border-ghost-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold mb-2">
            <Server size={14} className="text-ghost-accent" />
            Model Manager
          </div>
          <div className="text-[10px] text-ghost-text-dimmer font-mono mb-2">{OLLAMA_HOST}</div>

          <div className="flex flex-col gap-1">
            <button
              onClick={() => setView('installed')}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                view === 'installed'
                  ? 'bg-ghost-accent/15 text-ghost-text border border-ghost-accent/30'
                  : 'text-ghost-text-dim hover:bg-ghost-surface-2'
              }`}
            >
              <Package size={12} />
              Installed
              <span className="ml-auto text-[10px] font-mono text-ghost-text-dimmer">{stats.total}</span>
            </button>
            <button
              onClick={() => setView('recommendations')}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                view === 'recommendations'
                  ? 'bg-ghost-accent/15 text-ghost-text border border-ghost-accent/30'
                  : 'text-ghost-text-dim hover:bg-ghost-surface-2'
              }`}
            >
              <Star size={12} />
              Recommendations
            </button>
            <button
              onClick={() => setView('stats')}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                view === 'stats'
                  ? 'bg-ghost-accent/15 text-ghost-text border border-ghost-accent/30'
                  : 'text-ghost-text-dim hover:bg-ghost-surface-2'
              }`}
            >
              <BarChart3 size={12} />
              Stats
            </button>
          </div>
        </div>

        <div className="bg-ghost-surface border border-ghost-border rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 text-ghost-text-dim text-xs">
            <Cpu size={12} /> Active
          </div>
          <div className="text-xs text-ghost-text font-mono break-all">{stats.activeModel}</div>
          <div
            className={`text-[10px] font-mono flex items-center gap-1 ${
              stats.activeInstalled ? 'text-ghost-green' : 'text-ghost-red'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                stats.activeInstalled ? 'bg-ghost-green' : 'bg-ghost-red'
              }`}
            />
            {stats.activeInstalled ? 'installed' : 'not installed'}
          </div>
        </div>

        <div className="bg-ghost-surface border border-ghost-border rounded-xl p-3 space-y-1.5">
          <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">Storage</div>
          <div className="text-sm text-ghost-text font-mono">
            {(stats.totalSize / 1e9).toFixed(1)} GB
          </div>
          <div className="text-[10px] text-ghost-text-dim">
            {stats.total} model{stats.total === 1 ? '' : 's'} installed
          </div>
        </div>

        <div className="bg-ghost-surface border border-ghost-border rounded-xl p-3 space-y-1.5">
          <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">By category</div>
          {Object.entries(stats.byCategory).map(([cat, count]) => (
            <div key={cat} className="flex items-center justify-between text-[11px]">
              <span className="text-ghost-text-dim">{cat}</span>
              <span className="font-mono text-ghost-text">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right pane — view container */}
      <div className="flex-1 min-w-0 flex flex-col bg-ghost-surface border border-ghost-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-ghost-border/70 flex items-center gap-3 flex-shrink-0">
          <div className="flex-1 relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ghost-text-dimmer" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="w-full bg-black/25 border border-ghost-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-ghost-text placeholder-ghost-text-dimmer focus:outline-none focus:border-ghost-accent/60"
            />
          </div>

          {view === 'installed' && (
            <>
              <select
                value={filterTag}
                onChange={e => setFilterTag(e.target.value as TagFilter | 'all')}
                className="bg-black/25 border border-ghost-border rounded-lg px-2 py-1.5 text-xs text-ghost-text focus:outline-none focus:border-ghost-accent/60"
              >
                <option value="all">all tags</option>
                {TAG_FILTERS.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-black/25 border border-ghost-border rounded-lg px-2 py-1.5 text-xs text-ghost-text focus:outline-none focus:border-ghost-accent/60"
              >
                <option value="name">name</option>
                <option value="size">size</option>
                <option value="modified">modified</option>
                <option value="category">category</option>
              </select>
            </>
          )}

          {/* Refresh button moved to top bar */}
          <button
            onClick={fetchModels}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ghost-border bg-ghost-surface-2/50 text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent/40 transition-colors text-xs flex-shrink-0 relative"
            title={loading ? 'Refreshing...' : `Last refreshed: ${lastRefresh.toLocaleTimeString()}`}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
            {!loading && (
              <span className="text-[9px] text-ghost-text-dimmer hidden lg:inline">
                {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowCustomPull(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ghost-accent text-black text-xs font-medium hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <Plus size={12} />
            Pull model
          </button>
        </div>

        {pullStatus && (
          <div
            className={`px-4 py-2 text-xs font-mono border-b border-ghost-border/50 flex-shrink-0 ${
              pullStatus.status.includes('failed') || pullStatus.status.includes('Failed')
                ? 'bg-red-500/10 text-red-400'
                : pullStatus.status.includes('✓') || pullStatus.status.includes('complete')
                  ? 'bg-ghost-green/10 text-ghost-green'
                  : 'bg-ghost-accent/10 text-ghost-accent'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="flex-1">{pullStatus.status}</span>
              {pulling && pullProgress > 0 && (
                <div className="w-32 h-1.5 bg-black/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-ghost-accent transition-all duration-200"
                    style={{ width: `${pullProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="px-4 py-2 text-xs bg-red-500/10 text-red-400 border-b border-red-500/30 flex items-center gap-2 flex-shrink-0">
            <AlertCircle size={12} />
            {error}
            <button
              onClick={fetchModels}
              className="ml-auto px-2 py-0.5 rounded border border-red-500/30 hover:bg-red-500/20 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3">
          {view === 'installed' && (
            <InstalledList
              models={filteredModels}
              activeModel={activeModel}
              userLimits={userLimits}
              onActivate={activateModel}
              onDelete={deleteModel}
              onCustomize={name => {
                setExpandedCard(name)
                setShowCustomize(true)
              }}
              onOpenTerminal={openInTerminal}
              onLimitsChanged={() => setLimitsTick(t => t + 1)}
            />
          )}

          {view === 'recommendations' && (
            <RecommendationsList
              recommended={filteredRecommended}
              isInstalled={isInstalled}
              pulling={pulling}
              onPull={pullModel}
              activeModel={activeModel}
              onActivate={activateModel}
            />
          )}

          {view === 'stats' && (
            <StatsView
              models={models}
              activeModel={activeModel}
              error={error}
              loading={loading}
              onRetry={fetchModels}
            />
          )}
        </div>
      </div>

      {showCustomPull && (
        <CustomPullModal
          onPull={name => {
            setShowCustomPull(false)
            pullModel(name)
          }}
          onClose={() => setShowCustomPull(false)}
        />
      )}

      {showCustomize && expandedCard && (
        <ModelLimitsEditor
          modelName={expandedCard}
          onClose={() => {
            setShowCustomize(false)
            setExpandedCard(null)
          }}
          onSave={limits => {
            setModelLimits(expandedCard, limits)
            setLimitsTick(t => t + 1)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Installed list
// ─────────────────────────────────────────────────────────────────────────────

function InstalledList({
  models,
  activeModel,
  userLimits,
  onActivate,
  onDelete,
  onCustomize,
  onOpenTerminal,
}: {
  models: OllamaModel[]
  activeModel: string
  userLimits: Record<string, ModelLimits>
  onActivate: (name: string) => void
  onDelete: (name: string) => void
  onCustomize: (name: string) => void
  onOpenTerminal: (name: string) => void
  onLimitsChanged: () => void
}) {
  if (models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-ghost-text-dim">
        <Inbox size={28} className="text-ghost-text-dimmer mb-3" />
        <div className="text-sm">No models installed</div>
        <div className="text-xs text-ghost-text-dimmer mt-1">Pull a model from the Recommendations tab to get started.</div>
      </div>
    )
  }

  function getModelCategory(name: string): ModelCategory {
    const normalized = name.toLowerCase()

    if (normalized.includes('vision') || normalized.includes('vl')) {
      return 'vision'
    }

    if (normalized.includes('coder') || normalized.includes('code')) {
      return 'coding'
    }

    if (normalized.includes('reason') || normalized.includes('gpt-oss') || normalized.includes('deepseek-r1')) {
      return 'reasoning'
    }

    if (normalized.includes('small') || /\b(?:3b|7b|8b|14b|20b)\b/.test(normalized)) {
      return 'small'
    }

    if (normalized.includes('special')) {
      return 'specialized'
    }

    return 'general'
  }

  return (
    <div className="space-y-2">
      {models.map(m => {
        const isActive = m.name === activeModel
        const category = getModelCategory(m.name)
        const limits = getModelLimits(m.name)
        const hasUserOverride = !!userLimits[m.name]
        const isOptimistic = m.digest === ''

        return (
          <div
            key={m.name}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
              isActive
                ? 'bg-ghost-accent/8 border-ghost-accent/40'
                : 'bg-ghost-surface-2/50 border-ghost-border'
            } ${isOptimistic ? 'opacity-60' : ''}`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-ghost-text font-mono truncate">{m.name}</span>
                {isActive && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-ghost-accent text-black">
                    ACTIVE
                  </span>
                )}
                {isOptimistic && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-ghost-yellow/20 text-ghost-yellow border border-ghost-yellow/30">
                    PULLING…
                  </span>
                )}
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full border border-ghost-border text-ghost-text-dim">
                  {category}
                </span>
                {hasUserOverride && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-ghost-yellow/15 text-ghost-yellow border border-ghost-yellow/30">
                    custom
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-ghost-text-dim mt-1 font-mono">
                <span>{(m.size / 1e9).toFixed(1)} GB</span>
                <span>·</span>
                <span>ctx {limits.num_ctx.toLocaleString()}</span>
                <span>·</span>
                <span>out {limits.num_predict.toLocaleString()}</span>
                <span>·</span>
                <span>{limits.max_messages} msg</span>
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {!isActive && !isOptimistic && (
                <button
                  onClick={() => onActivate(m.name)}
                  className="px-2.5 py-1 rounded-lg bg-ghost-accent text-black text-[11px] font-medium hover:opacity-90 transition-opacity"
                >
                  Use
                </button>
              )}
              <button
                onClick={() => onCustomize(m.name)}
                className="p-1.5 rounded-lg text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors"
                title="Customize limits"
              >
                <TerminalSquare size={12} />
              </button>
              <button
                onClick={() => onOpenTerminal(m.name)}
                className="p-1.5 rounded-lg text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors"
                title="Copy run command"
              >
                <ChevronRight size={12} />
              </button>
              <button
                onClick={() => onDelete(m.name)}
                disabled={isActive}
                className="p-1.5 rounded-lg text-ghost-text-dim hover:text-red-400 hover:bg-ghost-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title={isActive ? "Can't delete active model" : 'Delete model'}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Recommendations
// ─────────────────────────────────────────────────────────────────────────────

function RecommendationsList({
  recommended,
  isInstalled,
  pulling,
  onPull,
  activeModel,
  onActivate,
}: {
  recommended: RecommendedModel[]
  isInstalled: (name: string) => boolean
  pulling: string | null
  onPull: (name: string) => void
  activeModel: string
  onActivate: (name: string) => void
}) {
  return (
    <div className="space-y-2">
      {recommended.map(r => {
        const installed = isInstalled(r.name)
        const isPulling = pulling === r.name
        const isActive = activeModel === r.name

        return (
          <div
            key={r.name}
            className={`px-4 py-3 rounded-xl border ${
              r.isFeatured
                ? 'bg-gradient-to-br from-ghost-accent/8 to-ghost-surface-2 border-ghost-accent/30'
                : 'bg-ghost-surface-2/50 border-ghost-border'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ghost-text font-mono">{r.name}</span>
                  {r.isFeatured && <Star size={11} className="text-ghost-yellow" fill="currentColor" />}
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full border border-ghost-border text-ghost-text-dim">
                    {r.category}
                  </span>
                  <span className="text-[10px] text-ghost-text-dim font-mono ml-auto">{r.size}</span>
                </div>
                <p className="text-xs text-ghost-text-dim mt-1 leading-relaxed">{r.description}</p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {installed ? (
                  isActive ? (
                    <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-ghost-accent/15 text-ghost-accent border border-ghost-accent/30">
                      ACTIVE
                    </span>
                  ) : (
                    <button
                      onClick={() => onActivate(r.name)}
                      className="px-2.5 py-1 rounded-lg bg-ghost-accent text-black text-[11px] font-medium hover:opacity-90 transition-opacity"
                    >
                      Use
                    </button>
                  )
                ) : (
                  <button
                    onClick={() => onPull(r.pullHint)}
                    disabled={!!pulling}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-ghost-accent/40 bg-ghost-accent/10 text-ghost-accent text-[11px] font-medium hover:bg-ghost-accent/20 transition-colors disabled:opacity-30"
                  >
                    <Download size={11} />
                    {isPulling ? 'Pulling...' : 'Pull'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats view — Fixed with proper error/loading handling
// ─────────────────────────────────────────────────────────────────────────────

function StatsView({
  models,
  activeModel,
  error,
  loading,
  onRetry,
}: {
  models: OllamaModel[]
  activeModel: string
  error: string | null
  loading: boolean
  onRetry: () => void
}) {
  // Show loading state
  if (loading && models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-ghost-text-dim">
        <RefreshCw size={28} className="text-ghost-accent animate-spin mb-3" />
        <div className="text-sm">Loading models…</div>
      </div>
    )
  }

  // Show error state
  if (error && models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-ghost-text-dim">
        <AlertCircle size={28} className="text-red-400 mb-3" />
        <div className="text-sm text-ghost-text">Could not reach Ollama</div>
        <div className="text-xs text-ghost-text-dimmer mt-1 max-w-md">{error}</div>
        <button
          onClick={onRetry}
          className="mt-3 px-4 py-2 rounded-lg border border-ghost-accent/40 bg-ghost-accent/10 text-ghost-accent text-xs font-medium hover:bg-ghost-accent/20 transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  // Show empty state
  if (models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-ghost-text-dim">
        <Inbox size={28} className="text-ghost-text-dimmer mb-3" />
        <div className="text-sm">No models installed</div>
        <div className="text-xs text-ghost-text-dimmer mt-1">Pull a model from the Recommendations tab to get started.</div>
      </div>
    )
  }

  const totalSize = models.reduce((acc, m) => acc + m.size, 0)

  // Group by category + sorted within group
  const byCategory = useMemo(() => {
    const groups: Record<string, OllamaModel[]> = {}
    models.forEach(m => {
      const cat = getModelCategory(m.name)
      groups[cat] = groups[cat] ?? []
      groups[cat].push(m)
    })
    Object.values(groups).forEach(g => g.sort((a, b) => b.size - a.size))
    return groups
  }, [models])

  // Recent 5 by modification time
  const recent = useMemo(() => {
    return [...models].sort((a, b) => b.modified_at.localeCompare(a.modified_at)).slice(0, 5)
  }, [models])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
          <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">Models</div>
          <div className="text-2xl text-ghost-text font-semibold mt-1">{models.length}</div>
        </div>
        <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
          <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">Storage</div>
          <div className="text-2xl text-ghost-text font-semibold mt-1">{(totalSize / 1e9).toFixed(1)} GB</div>
        </div>
        <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
          <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">Active</div>
          <div className="text-sm text-ghost-accent font-mono mt-1 truncate">{activeModel}</div>
        </div>
        <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
          <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">Categories</div>
          <div className="text-2xl text-ghost-text font-semibold mt-1">{Object.keys(byCategory).length}</div>
        </div>
      </div>

      <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
        <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold mb-2">
          <Tag size={13} className="text-ghost-accent" />
          By category
        </div>
        <div className="space-y-2">
          {Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-ghost-text-dim">{cat}</span>
                <span className="text-ghost-text font-mono">
                  {items.length} · {(items.reduce((acc, m) => acc + m.size, 0) / 1e9).toFixed(1)} GB
                </span>
              </div>
              <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-ghost-accent"
                  style={{
                    width: `${(items.reduce((acc, m) => acc + m.size, 0) / totalSize) * 100}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
        <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold mb-2">
          <Activity size={13} className="text-ghost-accent" />
          Recently modified
        </div>
        <div className="space-y-1.5">
          {recent.map(m => (
            <div key={m.name} className="flex items-center justify-between text-xs">
              <span className="text-ghost-text font-mono truncate">{m.name}</span>
              <span className="text-ghost-text-dim font-mono text-[10px] flex-shrink-0">
                {new Date(m.modified_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom pull modal
// ─────────────────────────────────────────────────────────────────────────────

function CustomPullModal({
  onPull,
  onClose,
}: {
  onPull: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onPull(trimmed)
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-ghost-surface border border-ghost-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ghost-border/70">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold">
            <Download size={14} className="text-ghost-accent" />
            Pull a model
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-4 py-4">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="e.g. llama3.2:8b, mistral:7b-q4_K_M"
            className="w-full bg-black/25 border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text placeholder-ghost-text-dimmer focus:outline-none focus:border-ghost-accent/60"
            autoFocus
          />
        </div>
        <div className="px-4 py-3 border-t border-ghost-border/50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-2 rounded-lg border border-ghost-border text-ghost-text-dim hover:text-ghost-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="text-xs px-3 py-2 rounded-lg bg-ghost-accent text-black font-medium hover:opacity-90 transition-opacity"
          >
            Pull
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Model limits editor
// ─────────────────────────────────────────────────────────────────────────────

function ModelLimitsEditor({
  modelName,
  onClose,
  onSave,
}: {
  modelName: string
  onClose: () => void
  onSave: (limits: ModelLimits) => void
}) {
  const current = getModelLimits(modelName)
  const [numPredict, setNumPredict] = useState(current.num_predict)
  const [numCtx, setNumCtx] = useState(current.num_ctx)
  const [maxMessages, setMaxMessages] = useState(current.max_messages)

  const save = () => {
    onSave({
      num_predict: Math.max(128, Math.min(32000, numPredict)),
      num_ctx: Math.max(1024, Math.min(131072, numCtx)),
      max_messages: Math.max(5, Math.min(100, maxMessages)),
    })
    onClose()
  }

  const reset = () => {
    const base = DEFAULT_LIMITS[modelName] ?? DEFAULT_LIMITS._default
    setNumPredict(base.num_predict)
    setNumCtx(base.num_ctx)
    setMaxMessages(base.max_messages)
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-ghost-surface border border-ghost-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ghost-border/70">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold">
            <TerminalSquare size={14} className="text-ghost-accent" />
            <span className="font-mono truncate">{modelName}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-ghost-text-dim">Context window (num_ctx)</span>
              <span className="text-ghost-text font-mono">{numCtx.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="1024"
              max="131072"
              step="512"
              value={numCtx}
              onChange={e => setNumCtx(parseInt(e.target.value, 10))}
              className="w-full accent-ghost-accent"
            />
            <div className="text-[10px] text-ghost-text-dimmer mt-1">
              Total tokens available for system prompt + history + this turn + output.
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-ghost-text-dim">Max output (num_predict)</span>
              <span className="text-ghost-text font-mono">{numPredict.toLocaleString()}</span>
            </div>
            <input
              type="range"
              min="128"
              max="32000"
              step="64"
              value={numPredict}
              onChange={e => setNumPredict(parseInt(e.target.value, 10))}
              className="w-full accent-ghost-accent"
            />
            <div className="text-[10px] text-ghost-text-dimmer mt-1">
              Max tokens the model may generate in a single response.
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-ghost-text-dim">History depth (max_messages)</span>
              <span className="text-ghost-text font-mono">{maxMessages}</span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              step="1"
              value={maxMessages}
              onChange={e => setMaxMessages(parseInt(e.target.value, 10))}
              className="w-full accent-ghost-accent"
            />
            <div className="text-[10px] text-ghost-text-dimmer mt-1">
              Most recent N messages to bring into the request before trimming.
            </div>
          </div>

          <div className="bg-black/25 border border-ghost-border rounded-lg px-3 py-2 text-xs text-ghost-text-dim">
            <span className="text-ghost-text-dimmer">defaults for </span>
            <span className="font-mono text-ghost-text">{modelName}</span>
            <span className="text-ghost-text-dimmer">: </span>
            <span className="font-mono text-ghost-text">{current.num_ctx.toLocaleString()}</span>
            <span className="text-ghost-text-dimmer"> ctx · </span>
            <span className="font-mono text-ghost-text">{current.num_predict.toLocaleString()}</span>
            <span className="text-ghost-text-dimmer"> out · </span>
            <span className="font-mono text-ghost-text">{current.max_messages}</span>
            <span className="text-ghost-text-dimmer"> msg</span>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-ghost-border/50 flex justify-between gap-2">
          <button
            onClick={reset}
            className="text-xs px-3 py-2 rounded-lg border border-ghost-border text-ghost-text-dim hover:text-ghost-text transition-colors"
          >
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-xs px-3 py-2 rounded-lg border border-ghost-border text-ghost-text-dim hover:text-ghost-text transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="text-xs px-3 py-2 rounded-lg bg-ghost-accent text-black font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <Save size={12} />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function getModelCategory(name: string): ModelCategory {
  const normalized = name.toLowerCase()

  if (normalized.includes('vision') || normalized.includes('vl') || normalized.includes('llava')) {
    return 'vision'
  }

  if (normalized.includes('coder') || normalized.includes('code')) {
    return 'coding'
  }

  if (normalized.includes('reason') || normalized.includes('gpt-oss') || normalized.includes('deepseek-r1')) {
    return 'reasoning'
  }

  if (normalized.includes('small') || /\b(?:3b|7b|8b|14b|20b)\b/.test(normalized)) {
    return 'small'
  }

  if (normalized.includes('special')) {
    return 'specialized'
  }

  return 'general'
}