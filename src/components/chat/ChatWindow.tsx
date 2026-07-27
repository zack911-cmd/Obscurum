import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react'
import {
  Send,
  Square,
  Pause,
  Shield,
  Lock,
  Download,
  Trash2,
  Paperclip,
  Plus,
  Pencil,
  Check,
  Copy,
  X,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Cpu,
  Sparkles,
  Eye,
  EyeOff,
  Flame,
  BrainCircuit,
  Brain,
  TerminalSquare,
  Image,
  Search,
  UserRound,
} from 'lucide-react'
import { checkOllamaHealth, isLocalOllama, OLLAMA_HOST, streamOllamaChat } from '../../lib/ollama'
import {
  pickModel,
  getModelOptions,
  trimHistory,
  TOOL_CORRECTIONS,
  ACCEPTED_FILES,
  supportsMultimodal,
  isVisionModel,
} from './config'
import { MODELS } from './MODELS'
import { buildSystemPrompt } from './systemPrompt'
import { renderContent } from './MessageRenderer'
import { FileAttachmentPreview, readFiles, formatFilesForPrompt, getRawBase64FromFile, hasValidImageData } from './FileAttachment'
import type { Message, AttachedFile, Conversation, StoredSettings } from './types'
import { useActiveModel, setActiveModel as setGlobalActiveModel, hasActiveModelPreference, getModelLimits } from '../models/ModelManager'

// ─────────────────────────────────────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────────────────────────────────────
const SETTINGS_KEY = 'ghostshell-chat-settings'
const CONVERSATIONS_KEY = 'pentest_ai_conversations'
const ACTIVE_CONV_KEY = 'pentest_ai_active_conversation'
// "Customize" — who you are and how the AI should treat you. Survives
// everything: deleting chats, wiping, ephemeral mode.
const PROFILE_KEY = 'ghostshell-user-profile'
// Self-learning memory — a running log of what past conversations were
// about, generated automatically. Also survives conversation deletion,
// wiping, and ephemeral mode (ephemeral chats just never feed it).
const MEMORY_KEY = 'ghostshell-chat-memory'
const MAX_MEMORY_ENTRIES = 300

// ─────────────────────────────────────────────────────────────────────────────
// Local-only types — these never appear outside this file
// ─────────────────────────────────────────────────────────────────────────────

// "Customize" profile — name and instructions for how the AI should treat you.
type UserProfile = {
  name: string
  instructions: string
}

// One remembered summary of a past conversation. Written once, when that
// conversation is deleted, wiped, or abandoned for a new chat.
type MemoryEntry = {
  id: string
  createdAt: number
  title: string
  summary: string
  messageCount: number
}

type DateBucket = 'Today' | 'Yesterday' | 'This week' | 'Older'

// ─────────────────────────────────────────────────────────────────────────────
// Settings (unchanged behaviour — keep key for backwards compatibility)
// ─────────────────────────────────────────────────────────────────────────────
function defaultSettings(): StoredSettings {
  return {
    autoRoute: true,
    autoCorrect: true,
    ephemeral: true,
    uncensored: true,
    activeModel: MODELS.coder,
    temperature: 0.85,
    memoryEnabled: true,
  }
}

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = { ...defaultSettings(), ...JSON.parse(raw) } as StoredSettings
      // Any non-empty model name is valid now — ModelManager can hand us
      // arbitrary installed model names, not just the 4 hardcoded presets.
      if (!parsed.activeModel || typeof parsed.activeModel !== 'string') {
        parsed.activeModel = MODELS.coder
      }
      return parsed
    }
  } catch {
    /* ignore */
  }
  return defaultSettings()
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation persistence
// ─────────────────────────────────────────────────────────────────────────────
function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Basic shape guard. We also use this pass to migrate any data written
    // by an earlier version of the app — most importantly, messages had
    // optional `model` and `modelDisplayName` fields that were never read,
    // and the new `Message` shape doesn't have them. Strip them so the
    // shape guard below accepts the row, and so we don't carry phantom
    // fields forever.
    const migrate = (c: unknown): Conversation | null => {
      if (!c || typeof c !== 'object') return null
      const obj = c as Record<string, unknown>
      if (
        typeof obj.id !== 'string' ||
        typeof obj.title !== 'string' ||
        !Array.isArray(obj.messages)
      ) {
        return null
      }
      const messages: Message[] = []
      for (const m of obj.messages as unknown[]) {
        if (!m || typeof m !== 'object') continue
        const mo = m as Record<string, unknown>
        if (
          (mo.role !== 'user' && mo.role !== 'assistant') ||
          typeof mo.content !== 'string' ||
          typeof mo.id !== 'string' ||
          typeof mo.ts !== 'number'
        ) {
          continue
        }
        // Strip deprecated fields — they were never read and `modelUsed`
        // is what we use now.
        delete mo.model
        delete mo.modelDisplayName
        messages.push(mo as unknown as Message)
      }
      return {
        ...(obj as object),
        messages,
      } as Conversation
    }
    return parsed.flatMap((c: unknown) => {
      const migrated = migrate(c)
      return migrated ? [migrated] : []
    })
  } catch {
    return []
  }
}

function saveConversations(convs: Conversation[]) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs))
  } catch {
    /* quota / private mode — ignore */
  }
}

function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_CONV_KEY)
  } catch {
    return null
  }
}

function saveActiveId(id: string | null) {
  try {
    if (id === null) localStorage.removeItem(ACTIVE_CONV_KEY)
    else localStorage.setItem(ACTIVE_CONV_KEY, id)
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Customize profile — name + how the AI should treat you
// ─────────────────────────────────────────────────────────────────────────────
function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (raw) return { name: '', instructions: '', ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return { name: '', instructions: '' }
}

function saveProfile(profile: UserProfile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* ignore */
  }
}

function buildProfileContext(profile: UserProfile): string {
  const parts: string[] = []
  if (profile.name.trim()) parts.push(`The user's name is ${profile.name.trim()}. Address them by name naturally, not in every message.`)
  if (profile.instructions.trim()) parts.push(profile.instructions.trim())
  if (parts.length === 0) return ''
  return `\n\n[About the user — from their Customize settings]\n${parts.join('\n')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent memory — survives conversation deletion, wiping, and ephemeral mode
// ─────────────────────────────────────────────────────────────────────────────
function loadMemory(): MemoryEntry[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is MemoryEntry => e && typeof e.id === 'string' && typeof e.summary === 'string',
    )
  } catch {
    return []
  }
}

function saveMemory(entries: MemoryEntry[]) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(entries))
  } catch {
    /* quota / private mode — ignore */
  }
}

// Turns a whole conversation into a short remembered summary using the
// currently active model. Best-effort — any failure just means nothing gets
// remembered for that conversation; it never blocks the UI.
async function summarizeConversation(conv: Conversation, model: string): Promise<string | null> {
  const meaningful = conv.messages.filter(m => m.content && m.content.trim())
  if (meaningful.length < 2) return null

  const transcript = meaningful
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')
    .slice(0, 6000)

  try {
    const opts = getModelOptions(model, false)
    opts.temperature = 0.3

    const summary = await streamOllamaChat(
      model,
      [
        {
          role: 'system',
          content:
            'Summarize this conversation in 2-4 concise sentences: what the user asked about, and any facts, preferences, or context they shared. Plain remembered context, no preamble, no meta-commentary.',
        },
        { role: 'user', content: transcript },
      ],
      opts,
      new AbortController().signal,
      () => {
        /* no streaming UI needed for a background summary */
      },
    )
    return summary?.trim() || null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INCREASED CAPACITY: Memory and context limits
// ─────────────────────────────────────────────────────────────────────────────

// Increased from 2200 to 4000 characters for more memory context
const MEMORY_CONTEXT_CHAR_BUDGET = 4000

function buildMemoryContext(entries: MemoryEntry[]): string {
  if (entries.length === 0) return ''
  let used = 0
  const lines: string[] = []
  for (const e of entries) {
    const line = `- ${e.summary}`
    if (used + line.length > MEMORY_CONTEXT_CHAR_BUDGET) break
    lines.push(line)
    used += line.length
  }
  if (lines.length === 0) return ''
  return `\n\n[Long-term memory — learned from this user's earlier conversations. Use only if relevant; don't quote it verbatim or call attention to "memory" unless asked.]\n${lines.join('\n')}`
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Up late'
  if (h < 12) return 'Morning'
  if (h < 18) return 'Afternoon'
  return 'Evening'
}

function generateTitle(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New conversation'
  return clean.length > 40 ? clean.slice(0, 40) + '…' : clean
}

function bucketFor(ts: number): DateBucket {
  const now = new Date()
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const todayStart = startOfDay(now)
  if (ts >= todayStart) return 'Today'
  if (ts >= todayStart - dayMs) return 'Yesterday'
  if (ts >= todayStart - 7 * dayMs) return 'This week'
  return 'Older'
}

const BUCKET_ORDER: DateBucket[] = ['Today', 'Yesterday', 'This week', 'Older']

const modelLabel = (model: string) => {
  if (model === MODELS.coder) return 'Coder ⚡'
  if (model === MODELS.reasoner) return 'Reasoner 🧠'
  if (model === MODELS['Offline, Coder']) return 'Offline Coder 💻'
  if (model === MODELS.vision) return '🌟 Vision'
  return model
}

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational bits
// ─────────────────────────────────────────────────────────────────────────────
function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-ghost-text-dim cursor-pointer select-none font-mono">
      <div
        onClick={onToggle}
        className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${
          on ? 'bg-ghost-accent shadow shadow-ghost-accent/30' : 'bg-ghost-border-strong'
        }`}
      >
        <div
          className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${
            on ? 'left-4' : 'left-0.5'
          }`}
        />
      </div>
      {label}
    </label>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-2.5 align-middle" aria-label="Assistant is typing">
      <span className="relative w-4 h-4 flex-shrink-0">
        <span className="absolute inset-0 rounded-full bg-ghost-accent/40 blur-[3px] animate-ping" />
        <span className="absolute inset-[3px] rounded-full bg-gradient-to-br from-ghost-accent to-purple-400" />
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-ghost-accent to-purple-400 [animation:bounceDot_1.1s_ease-in-out_infinite] [animation-delay:-0.24s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-ghost-accent to-purple-400 [animation:bounceDot_1.1s_ease-in-out_infinite] [animation-delay:-0.12s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-ghost-accent to-purple-400 [animation:bounceDot_1.1s_ease-in-out_infinite]" />
      </span>
      <style>{`@keyframes bounceDot{0%,80%,100%{transform:translateY(0);opacity:0.5}40%{transform:translateY(-4px);opacity:1}}`}</style>
    </span>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatWindow() {
  // Conversations & active state
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations)
  const [activeId, setActiveId] = useState<string | null>(loadActiveId)
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // Active conversation derived state
  const activeConv = useMemo(
    () => conversations.find(c => c.id === activeId) ?? null,
    [conversations, activeId],
  )
  const messages = activeConv?.messages ?? []

  // ─── Streaming lives in its own state, decoupled from `conversations`.
  // Every chunk (~60/sec) would otherwise rebuild the message array, run
  // the sidebar's `grouped` useMemo, and re-render every MessageBubble.
  // The conversation only mutates once when the stream ends.
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState('')

  // `displayMessages` is the source of truth for rendering. It patches the
  // active assistant bubble with the live streaming text without touching
  // `conversations`. Non-streaming bubbles keep the same `message` reference
  // across recomputes — that's what `React.memo` uses to skip their render.
  const displayMessages = useMemo(() => {
    if (!streamingMessageId) return messages
    return messages.map(m =>
      m.id === streamingMessageId ? { ...m, content: streamingContent } : m,
    )
  }, [messages, streamingMessageId, streamingContent])

  // Chat input state
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [connectionError, setConnectionError] = useState(false)
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null)
  const [ollamaVersion, setOllamaVersion] = useState<string>()

  // Settings
  const [settings, setSettings] = useState(loadSettings)
  const { autoRoute, autoCorrect, ephemeral, uncensored, activeModel, temperature, memoryEnabled } = settings

  // Customize — name + how the AI should treat you
  const [profile, setProfile] = useState<UserProfile>(loadProfile)
  const [showCustomize, setShowCustomize] = useState(false)

  // Self-learning memory — silent by default, managed via a single icon
  const [memory, setMemory] = useState<MemoryEntry[]>(loadMemory)
  const [showMemoryPanel, setShowMemoryPanel] = useState(false)
  const memorizedIdsRef = useRef<Set<string>>(new Set())

  const [sidebarSearch, setSidebarSearch] = useState('')

  // Model picked in ModelManager (localStorage + cross-component event bridge).
  // If ModelManager has an explicit choice, it wins here (and turns off
  // auto-route, since a manual pick should stick). If ModelManager has never
  // been touched, mirror chat's current model into it instead — so opening
  // ModelManager afterward shows the right "active" state, without silently
  // overwriting whatever the user already had selected in chat.
  const modelFromManager = useActiveModel()
  useEffect(() => {
    if (hasActiveModelPreference()) {
      if (modelFromManager && modelFromManager !== activeModel) {
        updateSetting('activeModel', modelFromManager)
        updateSetting('autoRoute', false)
      }
    } else if (activeModel) {
      setGlobalActiveModel(activeModel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelFromManager])

  // Turns a conversation into a permanent memory entry — skipped for
  // ephemeral chats, and never summarizes the same conversation twice.
  const rememberConversation = useCallback(
    (conv: Conversation | null | undefined) => {
      if (!conv || !memoryEnabled || conv.wasEphemeral) return
      if (memorizedIdsRef.current.has(conv.id)) return
      memorizedIdsRef.current.add(conv.id)

      summarizeConversation(conv, activeModel).then(summary => {
        if (!summary) return
        const entry: MemoryEntry = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          title: conv.title || 'Untitled conversation',
          summary,
          messageCount: conv.messages.length,
        }
        setMemory(prev => {
          const next = [entry, ...prev].slice(0, MAX_MEMORY_ENTRIES)
          saveMemory(next)
          return next
        })
      })
    },
    [memoryEnabled, activeModel],
  )

  // Refs
  const controllerRef = useRef<AbortController | null>(null)
  // Tracks the in-progress assistant message content as it streams in, so
  // the abort/error handler can read the latest value without relying on
  // the `conversations` state closure captured when send() started (which
  // never updates for the lifetime of that async call).
  const streamingContentRef = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const convScrollRef = useRef<HTMLDivElement>(null)

  // Check if there are images in the files (reused in send() below instead
  // of being recomputed inline there)
  const hasImages = useMemo(() => files.some(f => f.type.startsWith('image/')), [files])
  // Check if images have valid data for Ollama
  const hasValidImages = useMemo(() => files.some(f => hasValidImageData(f)), [files])

  // Persist conversations only when persistence is enabled.
  useEffect(() => {
    if (ephemeral) {
      try {
        localStorage.removeItem(CONVERSATIONS_KEY)
      } catch {
        /* ignore */
      }
      return
    }

    saveConversations(conversations)
  }, [conversations, ephemeral])

  // Persist active id
  useEffect(() => {
    saveActiveId(activeId)
  }, [activeId])

  // Settings write-through
  const updateSetting = <K extends keyof StoredSettings>(key: K, value: StoredSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const updateProfile = (next: UserProfile) => {
    setProfile(next)
    saveProfile(next)
  }

  const deleteMemoryEntry = (id: string) => {
    setMemory(prev => {
      const next = prev.filter(e => e.id !== id)
      saveMemory(next)
      return next
    })
  }

  const clearMemory = () => {
    if (!confirm('Clear everything remembered from past conversations? This cannot be undone.')) return
    setMemory([])
    saveMemory([])
  }

  // Ollama health — check once on mount, then poll periodically. Previously
  // this depended on [loading], so it re-ran on every send/stop (twice per
  // message round-trip) instead of on a sensible cadence.
  useEffect(() => {
    let cancelled = false
    const check = () => {
      checkOllamaHealth().then(({ ok, version }) => {
        if (cancelled) return
        setOllamaOk(ok)
        setOllamaVersion(version)
      })
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Auto-scroll on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, loading])

  // ─── Conversation actions ──────────────────────────────────────────────
  const newConversation = useCallback(() => {
    rememberConversation(activeConv)
    setActiveId(null)
    setInput('')
    setFiles([])
    setConnectionError(false)
    setEditingId(null)
    controllerRef.current?.abort()
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [activeConv, rememberConversation])

  const openConversation = useCallback((id: string) => {
    setActiveId(id)
    setEditingId(null)
    setConnectionError(false)
  }, [])

  const deleteConversation = useCallback(
    (id: string) => {
      const target = conversations.find(c => c.id === id)
      rememberConversation(target)
      setConversations(prev => prev.filter(c => c.id !== id))
      if (activeId === id) {
        setActiveId(null)
        setInput('')
        setFiles([])
        setConnectionError(false)
        controllerRef.current?.abort()
      }
    },
    [activeId, conversations, rememberConversation],
  )

  const startRename = useCallback((c: Conversation) => {
    setEditingId(c.id)
    setEditingTitle(c.title)
  }, [])

  const commitRename = useCallback(() => {
    if (!editingId) return
    const trimmed = editingTitle.trim()
    setConversations(prev =>
      prev.map(c => (c.id === editingId ? { ...c, title: trimmed || c.title } : c)),
    )
    setEditingId(null)
    setEditingTitle('')
  }, [editingId, editingTitle])

  // ─── Sending ───────────────────────────────────────────────────────────
  const applyAutoCorrect = (text: string) => {
    if (!autoCorrect) return text
    let corrected = text
    for (const [key, value] of Object.entries(TOOL_CORRECTIONS)) {
      corrected = corrected.replace(new RegExp(`\\b${key}\\b`, 'gi'), value)
    }
    return corrected
  }

  const stopGeneration = () => {
    controllerRef.current?.abort()
    setLoading(false)
    setConnectionError(false)
    setStreamingMessageId(null)
    setStreamingContent('')
  }

  const ensureConversation = (): string => {
    if (activeId) return activeId
    const id = crypto.randomUUID()
    const now = Date.now()
    const fresh: Conversation = {
      id,
      title: '',
      createdAt: now,
      updatedAt: now,
      messages: [],
      wasEphemeral: ephemeral,
    }
    setConversations(prev => [fresh, ...prev])
    setActiveId(id)
    return id
  }

  const send = async () => {
    const text = applyAutoCorrect(input.trim())
    if ((!text && files.length === 0) || loading) return

    // hasImages is already memoized above from `files` — reuse it instead
    // of recomputing the same check here.
    const hasImageAttachments = hasImages

    // If there are images, force vision model routing
    const model = autoRoute ? pickModel(text, hasImageAttachments) : activeModel

    if (autoRoute) {
      updateSetting('activeModel', model)
      setGlobalActiveModel(model)
    }

    // Warn if images are attached but model doesn't support multimodal
    if (hasImageAttachments && !supportsMultimodal(model)) {
      console.warn(`⚠️ Model ${model} doesn't support images. Consider switching to a vision model.`)
    }

    // Warn if images are attached but don't have usable base64 data yet —
    // hasValidImages was memoized but previously never checked anywhere.
    if (hasImageAttachments && !hasValidImages) {
      console.warn('⚠️ Attached image(s) have no valid base64 data yet — they may not be sent to the model.')
    }

    const fileContent = formatFilesForPrompt(files)
    const fullContent = text + (fileContent ? `\n\n${fileContent}` : '')

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      ts: Date.now(),
      files: files.length
        ? files.map(f => ({ name: f.name, type: f.type, id: f.id }))
        : undefined,
      hasImages: hasImageAttachments,
    }

    // Make sure we have a conversation to write into
    const convId = ensureConversation()

    // Append user message to active conversation (and seed title). The
    // assistant bubble is *not* appended here — it enters via streaming
    // state on the next line, so the conversation doesn't mutate on every
    // token chunk.
    setConversations(prev =>
      prev.map(c => {
        if (c.id !== convId) return c
        const nextMessages = [...c.messages, userMsg]
        const title = c.title || generateTitle(text)
        return { ...c, messages: nextMessages, title, updatedAt: Date.now() }
      }),
    )

    setInput('')
    setFiles([])
    setLoading(true)
    setConnectionError(false)

    const assistantId = crypto.randomUUID()
    streamingContentRef.current = ''
    setConversations(prev =>
      prev.map(c =>
        c.id === convId
          ? {
              ...c,
              // Empty assistant placeholder. `displayMessages` overlays the
              // live streaming text onto this bubble via `streamingContent`,
              // so we never need to mutate this object during the stream.
              messages: [...c.messages, { id: assistantId, role: 'assistant', content: '', ts: Date.now() }],
              updatedAt: Date.now(),
            }
          : c,
      ),
    )
    // Enter streaming mode for the new assistant bubble.
    setStreamingMessageId(assistantId)
    setStreamingContent('')

    try {
      // ================================================================
      // Build history - NOW using Model Manager limits
      // ================================================================
      const prior = activeConv?.id === convId ? activeConv.messages : []

      // Get limits from Model Manager for this specific model
      const limits = getModelLimits(model)

      // Use the model's max_messages from Model Manager
      const maxMessages = limits.max_messages
      const recentMessages = prior.slice(-maxMessages)

      console.log(`📊 Model "${model}" using limits from Model Manager:`, {
        num_predict: limits.num_predict,
        num_ctx: limits.num_ctx,
        max_messages: limits.max_messages,
      })

      const history = recentMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.role === 'user' && m.files?.length
          ? `${m.content}\n\n${m.files.map(f => `[attached: ${f.name}]`).join('\n')}`
          : m.content
      }))

      const systemPrompt = buildSystemPrompt({
        userInput: text,
        isUncensored: uncensored,
        customInstructions: buildProfileContext(profile) + (memoryEnabled ? buildMemoryContext(memory) : ''),
      })

      history.push({ role: 'user', content: fullContent })

      const trimmed = trimHistory(history, model)
      const modelOpts = getModelOptions(model, uncensored)

      // ALWAYS use the temperature from settings
      modelOpts.temperature = temperature

      // ================================================================
      // TOKEN LIMITS: Now sourced from Model Manager!
      // No more hardcoded values - every model has its own limits
      // ================================================================

      modelOpts.num_predict = limits.num_predict
      modelOpts.num_ctx = limits.num_ctx

      console.log(`✅ Applied limits for "${model}":`, {
        num_predict: modelOpts.num_predict,
        num_ctx: modelOpts.num_ctx,
      })

      const controller = new AbortController()
      controllerRef.current = controller

      // Build messages with images if needed - system message now includes response instruction
      const systemMessage = {
        role: 'system',
        content: systemPrompt,
      }

      let messagesWithImages: any[] = [systemMessage, ...trimmed]

      // If there are images and model supports multimodal, include them
      if (hasImageAttachments && supportsMultimodal(model)) {
        // Extract raw base64 data for multimodal models
        // IMPORTANT: Use rawBase64 WITHOUT the data:image/...;base64, prefix
        const imageFiles = files.filter(f => f.type.startsWith('image/'))
        const imageData = imageFiles
          .map(f => getRawBase64FromFile(f))
          .filter((data): data is string => !!data && data.length > 0)

        if (imageData.length > 0) {
          // Add images to the last user message
          const lastMessage = messagesWithImages[messagesWithImages.length - 1]
          if (lastMessage && lastMessage.role === 'user') {
            lastMessage.images = imageData
            console.log(`📸 Added ${imageData.length} image(s) to message for model ${model}`)
          }
        } else {
          console.warn('⚠️ No valid raw base64 data found for images. Check file reading.')
        }
      }

      // Batch streamed token updates via rAF — but only update the dedicated
      // streaming state, never `conversations`. That's the core fix: the
      // sidebar memo, the other bubbles' props, and the persist effect all
      // see a stable `conversations` array throughout the entire stream.
      let pendingContent = ''
      let rafScheduled = false
      let firstTokenSeen = false
      const flushPending = () => {
        rafScheduled = false
        // Single setState for the live text. `displayMessages` rebuilds
        // and `MessageBubble` (memoized) re-renders only the active bubble.
        setStreamingContent(pendingContent)
      }

      // Diagnostic: time-to-first-token vs. everything after. If first
      // token is fast but the UI still feels laggy while text streams in,
      // that's React re-render overhead. If first token itself is slow,
      // that's Ollama prompt eval (long system prompt, big num_ctx,
      // unquantized model, etc.) — no amount of React optimization helps.
      console.time('first-token')

      const finalAnswer = await streamOllamaChat(
        model,
        messagesWithImages,
        modelOpts,
        controller.signal,
        full => {
          if (!firstTokenSeen) {
            firstTokenSeen = true
            console.timeEnd('first-token')
          }
          streamingContentRef.current = full
          pendingContent = full
          if (!rafScheduled) {
            rafScheduled = true
            requestAnimationFrame(flushPending)
          }
        },
      )

      // Make sure the very last chunk (which may have been scheduled but
      // not yet flushed when the stream resolved) actually lands before we
      // commit the final message below.
      if (rafScheduled) {
        flushPending()
      }

      // Commit the final content into `conversations` exactly once, then
      // exit streaming mode. The `updatedAt` bump sorts the sidebar in real
      // time, but only at the end of a message, not on every token.
      const finalContent = (streamingContentRef.current || finalAnswer || '').trim() ||
        'No text was returned by Ollama. Try switching to another model or restarting Ollama.'

      setConversations(prev =>
        prev.map(c =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantId
                    ? { ...m, content: finalContent, modelUsed: model }
                    : m,
                ),
                updatedAt: Date.now(),
              }
            : c,
        ),
      )
      setStreamingMessageId(null)
      setStreamingContent('')
    } catch (err: unknown) {
      console.error('API Error:', err)
      setConnectionError(true)

      const isAbort = err instanceof DOMException && err.name === 'AbortError'
      const error = err as Error

      let errorMessage = ''

      if (isAbort) {
        // Read the partial content off the ref that's updated live on every
        // stream chunk, rather than the stale `messages`/`conversations`
        // closures captured when send() started (those never update for
        // the lifetime of this async call).
        errorMessage = `${streamingContentRef.current}\n\n*Response stopped by user*`
      } else if (error.message?.includes('illegal base64')) {
        errorMessage = `❌ Image Format Error\n\nThe image data format is not compatible with the vision model. Please try:\n\n1. Use a different image format (PNG, JPG recommended)\n2. Make sure the image is not corrupted\n3. Try a smaller image (under 5MB)\n\n**Error details:**\n\`\`\`\n${error.message}\n\`\`\``
      } else {
        errorMessage = `❌ Ollama Connection Error\n\nYour internet can be working and this can still happen. GhostShell talks to the local Ollama API, not directly to your network adapter.\n\nCheck that Ollama is running and reachable at ${OLLAMA_HOST}:\n\n\`\`\`bash\nollama serve\ncurl ${OLLAMA_HOST}/api/version\n\`\`\`\n\nError details:\n\n\`\`\`\n${error.message}\n\`\`\``
      }

      setConversations(prev =>
        prev.map(c =>
          c.id === convId
            ? {
                ...c,
                messages: c.messages.map(m =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: errorMessage,
                      }
                    : m,
                ),
                updatedAt: Date.now(),
              }
            : c,
        ),
      )
      setStreamingMessageId(null)
      setStreamingContent('')
    } finally {
      setLoading(false)
      controllerRef.current = null
      inputRef.current?.focus()
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const exportChat = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ghostshell-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const wipeCurrent = () => {
    if (!activeId) {
      setInput('')
      setFiles([])
      setConnectionError(false)
      return
    }
    rememberConversation(activeConv)
    setConversations(prev => prev.filter(c => c.id !== activeId))
    setActiveId(null)
    setInput('')
    setFiles([])
    setConnectionError(false)
    controllerRef.current?.abort()
  }

  const handleFiles = async (fileList: FileList) => {
    const attached = await readFiles(fileList)
    setFiles(prev => [...prev, ...attached])
  }

  const localOnly = isLocalOllama()
  const showCharCount = input.length > 500
  const charCountColor =
    input.length > 4000
      ? 'text-ghost-accent'
      : input.length > 2000
        ? 'text-ghost-yellow'
        : 'text-ghost-text-dim'

  // ─── Group conversations by date for the sidebar ───────────────────────
  // Only recompute when the set of conversations, their titles, or their
  // updatedAt ordering actually changes — not on every streamed token.
  // Streaming updates no longer touch `conversations` at all (lives in
  // dedicated streaming state), so this fingerprint is stable throughout
  // an entire message. Cheap fingerprint of (id, title, updatedAt) tuples
  // keeps it reactive to renames, new chats, deletes, and reorders.
  const groupingFingerprint = conversations.map(c => `${c.id}:${c.title}:${c.updatedAt}`).join('|')
  const grouped = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase()
    const filtered = q ? conversations.filter(c => c.title.toLowerCase().includes(q)) : conversations
    const buckets: Record<DateBucket, Conversation[]> = {
      Today: [],
      Yesterday: [],
      'This week': [],
      Older: [],
    }
    for (const c of filtered) {
      buckets[bucketFor(c.updatedAt)].push(c)
    }
    for (const bucket of BUCKET_ORDER) {
      buckets[bucket].sort((a, b2) => b2.updatedAt - a.updatedAt)
    }
    return buckets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupingFingerprint, sidebarSearch])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full bg-ghost-bg rounded-3xl overflow-hidden relative border border-ghost-border/70 shadow-2xl shadow-black/50">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.14),transparent_36%),radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.06),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />
      {/* ───────── Conversation sidebar (Claude-style) ───────── */}
      <aside
        className={`flex-shrink-0 flex flex-col relative overflow-hidden
                    bg-gradient-to-b from-ghost-surface/60 via-ghost-bg/70 to-ghost-bg/80
                    backdrop-blur-2xl border-r border-white/[0.06]
                    shadow-[inset_-1px_0_0_rgba(255,255,255,0.04)]
                    transition-[width] duration-200 ease-out
                    ${sidebarOpen ? 'w-[260px]' : 'w-0'}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.08),transparent_60%)]" />
        <div className="relative flex flex-col h-full min-h-0">
        {/* New chat + search + nav */}
        <div className="p-2 flex-shrink-0 space-y-1.5">
          <button
            onClick={newConversation}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
                       border border-ghost-accent/30 bg-ghost-accent/10
                       text-ghost-text text-sm hover:bg-ghost-accent/15 hover:border-ghost-accent/50 transition-all"
          >
            <Plus size={14} />
            <span>New chat</span>
          </button>

          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ghost-text-dimmer pointer-events-none" />
            <input
              value={sidebarSearch}
              onChange={e => setSidebarSearch(e.target.value)}
              placeholder="Search chats"
              className="w-full bg-black/25 border border-ghost-border/70 rounded-lg pl-7 pr-2 py-1.5
                         text-xs text-ghost-text placeholder-ghost-text-dimmer
                         focus:outline-none focus:border-ghost-accent/60"
            />
          </div>

          <button
            onClick={() => setShowCustomize(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ghost-text-dim text-xs
                       hover:bg-ghost-surface-2/70 hover:text-ghost-text transition-colors"
          >
            <UserRound size={13} />
            <span>Customize</span>
          </button>

          <button
            onClick={() => setShowMemoryPanel(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-ghost-text-dim text-xs
                       hover:bg-ghost-surface-2/70 hover:text-ghost-text transition-colors"
          >
            <Brain size={13} className={memoryEnabled ? 'text-ghost-accent' : ''} />
            <span>Memory</span>
            {memory.length > 0 && (
              <span className="ml-auto text-[10px] text-ghost-text-dimmer font-mono">{memory.length}</span>
            )}
          </button>
        </div>

        {/* Conversation list (no visible scrollbar) - SHOW MORE CHATS */}
        <div
          ref={convScrollRef}
          className="flex-1 overflow-y-auto px-2 pb-2 space-y-3
                     [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {conversations.length === 0 && (
            <div className="px-2 py-6 text-center text-ghost-text-dim text-xs">
              No conversations yet.
              <br />
              Start one below.
            </div>
          )}

          {BUCKET_ORDER.map(bucket => {
            const items = grouped[bucket]
            if (items.length === 0) return null
            return (
              <div key={bucket}>
                <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-ghost-text-dim font-mono">
                  {bucket}
                </div>
                <ul className="space-y-0.5">
                  {items.map(c => {
                    const isActive = c.id === activeId
                    const isEditing = editingId === c.id
                    return (
                      <li
                        key={c.id}
                        className={`group relative flex items-center rounded-md
                                    ${isActive
                                      ? 'bg-ghost-accent/12 text-ghost-text ring-1 ring-ghost-accent/25'
                                      : 'text-ghost-text-dim hover:bg-ghost-surface-2/80 hover:text-ghost-text'}
                                    transition-colors`}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-1 w-full px-2 py-1.5">
                            <input
                              autoFocus
                              value={editingTitle}
                              onChange={e => setEditingTitle(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitRename()
                                if (e.key === 'Escape') {
                                  setEditingId(null)
                                  setEditingTitle('')
                                }
                              }}
                              onBlur={commitRename}
                              className="flex-1 bg-ghost-bg border border-ghost-border
                                         rounded px-1.5 py-1 text-xs text-ghost-text
                                         focus:outline-none focus:border-ghost-accent"
                            />
                            <button
                              onMouseDown={e => {
                                e.preventDefault()
                                commitRename()
                              }}
                              className="p-1 text-ghost-text-dim hover:text-ghost-green"
                              title="Save"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onMouseDown={e => {
                                e.preventDefault()
                                setEditingId(null)
                                setEditingTitle('')
                              }}
                              className="p-1 text-ghost-text-dim hover:text-ghost-red"
                              title="Cancel"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => openConversation(c.id)}
                              className="flex-1 text-left text-sm truncate px-2 py-1.5 pr-16 min-w-0"
                              title={c.title}
                            >
                              {c.title || 'New conversation'}
                            </button>
                            <div
                              className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5
                                          ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                                          transition-opacity bg-ghost-surface-2/80 rounded`}
                            >
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  startRename(c)
                                }}
                                className="p-1 text-ghost-text-dim hover:text-ghost-text"
                                title="Rename"
                              >
                                <Pencil size={11} />
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  deleteConversation(c.id)
                                }}
                                className="p-1 text-ghost-text-dim hover:text-ghost-red"
                                title="Delete"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
        </div>
      </aside>

      {/* ───────── Main chat column ───────── */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top bar — minimal, Claude-style */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-ghost-border/70 flex-shrink-0 bg-ghost-surface/65 backdrop-blur-xl">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className="p-1.5 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors flex-shrink-0"
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-ghost-text text-sm truncate">
                  {activeConv?.title || 'New conversation'}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-ghost-accent/30 bg-ghost-accent/10 px-2 py-0.5 text-[10px] font-mono text-ghost-accent">
                  <Sparkles size={10} /> GhostShell AI
                </span>
              </div>
              <div className="hidden md:flex items-center gap-2 text-[10px] text-ghost-text-dim font-mono mt-0.5">
                <span>{autoRoute ? `Auto routed · ${modelLabel(activeModel)}` : modelLabel(activeModel)}</span>
                <span>·</span>
                <span>{uncensored ? 'Power mode' : 'Standard mode'}</span>
                {isVisionModel(activeModel) && (
                  <>
                    <span>·</span>
                    <span className="text-blue-400">👁️ Vision</span>
                  </>
                )}
              </div>
            </div>
            {activeConv && (
              <span className="hidden sm:inline-flex text-ghost-text-dimmer text-[10px] font-mono px-2 py-0.5 rounded-full bg-black/20 border border-ghost-border/50">
                {messages.length} msg
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="hidden md:flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full border border-ghost-border/70 bg-black/25"
              title={ollamaOk ? `ollama ${ollamaVersion ?? 'ok'}` : ollamaOk === false ? 'ollama offline' : 'checking…'}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  ollamaOk === null ? 'bg-ghost-text-dimmer' : ollamaOk ? 'bg-ghost-green animate-pulse' : 'bg-ghost-red'
                }`}
              />
              {localOnly ? (
                <Lock size={10} className="text-ghost-accent" />
              ) : (
                <Shield size={10} className="text-ghost-yellow" />
              )}
              <span className={localOnly ? 'text-ghost-accent' : 'text-ghost-yellow'}>
                {localOnly ? '127.0.0.1' : 'remote'}
              </span>
            </div>

            <button
              onClick={() => setShowMemoryPanel(true)}
              className="p-1.5 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors"
              title="Memory"
            >
              <Brain size={13} className={memoryEnabled ? 'text-ghost-accent' : ''} />
            </button>
            <button
              onClick={exportChat}
              disabled={messages.length === 0}
              className="p-1.5 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors disabled:opacity-30"
              title="Export chat"
            >
              <Download size={13} />
            </button>
            <button
              onClick={wipeCurrent}
              className="p-1.5 rounded text-ghost-text-dim hover:text-ghost-red hover:bg-ghost-surface-2 transition-colors"
              title="Wipe current"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Settings strip (compact, collapsible into header) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-2.5 border-b border-ghost-border/70 bg-black/20 backdrop-blur text-[11px] font-mono flex-shrink-0">
          <Toggle
            on={uncensored}
            onToggle={() => updateSetting('uncensored', !uncensored)}
            label="power"
          />
          <Toggle
            on={ephemeral}
            onToggle={() => updateSetting('ephemeral', !ephemeral)}
            label={ephemeral ? 'ephemeral' : 'persist'}
          />
          <Toggle on={autoRoute} onToggle={() => updateSetting('autoRoute', !autoRoute)} label="auto-route" />
          <Toggle
            on={autoCorrect}
            onToggle={() => updateSetting('autoCorrect', !autoCorrect)}
            label="auto-correct"
          />
          <Toggle
            on={memoryEnabled}
            onToggle={() => updateSetting('memoryEnabled', !memoryEnabled)}
            label="memory"
          />

          <select
            value={activeModel}
            onChange={e => {
              updateSetting('activeModel', e.target.value)
              updateSetting('autoRoute', false)
              setGlobalActiveModel(e.target.value)
            }}
            className="bg-black/50 border border-ghost-border text-ghost-text text-[11px]
                       rounded-lg px-2 py-1 font-mono focus:outline-none focus:border-ghost-accent"
          >
            <option value={MODELS.coder}>Minimax M3 ⚡</option>
            <option value={MODELS.reasoner}>gpt-oss 🧠</option>
            <option value={MODELS['Offline, Coder']}>qwen2.5-coder 💻</option>
            <option value={MODELS.vision}>🌟 qwen2.5vl:3b (Vision)</option>
            {/* Whatever's active but not one of the 4 presets — e.g. picked
                from ModelManager's full installed-models list — still shows here. */}
            {!Object.values(MODELS).includes(activeModel as (typeof MODELS)[keyof typeof MODELS]) && (
              <option value={activeModel}>{activeModel} (Model Manager)</option>
            )}
          </select>

          <span className="flex items-center gap-1 text-ghost-text-dim">
            <input
              type="range"
              min="0.1"
              max="1.2"
              step="0.05"
              value={temperature}
              onChange={e => updateSetting('temperature', parseFloat(e.target.value))}
              className="w-16 accent-ghost-accent"
              title="Temperature"
            />
            <span>t {temperature.toFixed(2)}</span>
          </span>

          {/* Show current model's token limit from Model Manager */}
          {activeModel && (
            <span className="hidden md:flex items-center gap-1 text-[10px] text-ghost-text-dimmer font-mono px-2 py-0.5 rounded-full bg-black/20 border border-ghost-border/50">
              <span>⚡</span>
              {getModelLimits(activeModel).num_predict} tokens
            </span>
          )}

          {/* Vision model indicator when images are attached */}
          {hasImages && (
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border
              ${isVisionModel(activeModel)
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'}`}
            >
              <Image size={10} />
              {isVisionModel(activeModel) ? 'Vision Ready' : 'Switch to Vision Model'}
              {!hasValidImages && (
                <span className="text-red-400 ml-1">(invalid)</span>
              )}
            </span>
          )}

          <span className="ml-auto flex items-center gap-1 text-ghost-text-dim">
            {ephemeral ? <EyeOff size={10} /> : <Eye size={10} />}
            {ephemeral ? 'No persistence' : 'Saved locally'}
            {uncensored && (
              <>
                <span className="mx-1">·</span>
                <Flame size={10} className="text-ghost-accent" />
                <span className="text-ghost-accent">power</span>
              </>
            )}
          </span>
        </div>

        {/* Messages — centered, max 720px, no visible scrollbar */}
        <div
          className="flex-1 overflow-y-auto
                     [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
              <div className="mx-auto w-full max-w-[900px] px-4 sm:px-6 py-6">
            {messages.length === 0 ? (
              <EmptyState
                onPick={s => setInput(s)}
                name={profile.name}
                recent={[...conversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4)}
                onResume={openConversation}
              />
            ) : (
              <div className="space-y-5">
                {/* Use `displayMessages` (not `messages`) so the live stream
                    renders without mutating `conversations`. Other bubbles
                    keep the same `message` reference across recomputes, so
                    `React.memo` skips their render. */}
                {displayMessages.map(m => (
                  <MessageBubble key={m.id} message={m} isUncensored={uncensored} />
                ))}

                {loading && messages[messages.length - 1]?.content === '' && (
                  <div className="flex justify-start">
                    <div className="text-ghost-text-dim text-sm font-mono flex items-center gap-2 pl-1">
                      <TypingDots />
                      <span>{connectionError ? 'Ollama connection failed.' : 'Thinking…'}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="flex-shrink-0 border-t border-ghost-border/70 bg-ghost-surface/45 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-[900px] px-3 sm:px-4 py-3">
            {/* File previews */}
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {files.map(file => (
                  <div key={file.id} className="relative">
                    <FileAttachmentPreview file={file} isUncensored={uncensored} />
                    <button
                      onClick={() => setFiles(prev => prev.filter(f => f.id !== file.id))}
                      className="absolute -top-1 -right-1 bg-ghost-accent text-black rounded-full w-4 h-4 flex items-center justify-center text-xs hover:bg-ghost-accent/80 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Input card — Claude-style: content on top, controls row below */}
            <div
              className="ghost-input flex flex-col gap-1.5 bg-ghost-surface/95 border border-ghost-border/80
                          rounded-[26px] px-3 pt-3 pb-2 transition-all duration-200 shadow-lg shadow-black/20
                          focus-within:border-ghost-accent/60 focus-within:shadow-xl focus-within:shadow-ghost-accent/15"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="How can I help you today?"
                rows={1}
                className="w-full bg-transparent text-ghost-text text-sm resize-none
                           focus:outline-none placeholder-ghost-text-dim
                           leading-relaxed min-h-[24px] max-h-40 px-1"
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 160) + 'px'
                }}
              />

              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-full text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors flex-shrink-0"
                  title="Attach file"
                >
                  <Paperclip size={15} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={e => {
                    if (e.target.files?.length) handleFiles(e.target.files)
                    e.target.value = ''
                  }}
                  multiple
                  className="hidden"
                  accept={ACCEPTED_FILES}
                />

                <div className="flex items-center gap-1.5 ml-auto">
                  <span
                    className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-ghost-text-dim
                               px-2.5 py-1 rounded-full border border-ghost-border bg-black/20"
                    title={autoRoute ? 'Auto-routed' : 'Manually selected — change it in the settings strip above'}
                  >
                    {autoRoute && <Sparkles size={10} className="text-ghost-accent" />}
                    {modelLabel(activeModel)}
                  </span>

                  {loading ? (
                    <div className="relative flex-shrink-0 rounded-full p-[1.5px] overflow-hidden">
                      <div className="absolute inset-[-2px] animate-[spin_2.5s_linear_infinite] bg-[conic-gradient(from_0deg,rgba(56,189,248,0.9),rgba(34,211,238,0.9),rgba(14,165,233,0.9),rgba(56,189,248,0.9))]" />
                      <button
                        onClick={stopGeneration}
                        className="relative p-2 rounded-full bg-ghost-accent text-black hover:opacity-90 transition-opacity shadow-lg shadow-ghost-accent/20"
                        title="Stop"
                      >
                        <Square size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className={`relative flex-shrink-0 rounded-full ${input.trim() || files.length > 0 ? 'p-[1.5px] overflow-hidden' : ''}`}>
                      {(input.trim() || files.length > 0) && (
                        <div className="absolute inset-[-2px] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_0deg,rgba(56,189,248,0.9),rgba(34,211,238,0.7),rgba(14,165,233,0.9),rgba(56,189,248,0.9))]" />
                      )}
                      <button
                        onClick={send}
                        disabled={(!input.trim() && files.length === 0) || loading}
                        className="relative flex-shrink-0 p-2 rounded-full bg-ghost-accent text-black
                                   hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                        title="Send"
                      >
                        <Send size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Input footer line */}
            <div className="text-ghost-text-dim text-[11px] mt-1.5 px-2 flex justify-between flex-wrap gap-1 font-mono">
              <span>
                <kbd className="px-1 py-0.5 rounded border border-ghost-border bg-ghost-surface-2">Enter</kbd> send ·{' '}
                <kbd className="px-1 py-0.5 rounded border border-ghost-border bg-ghost-surface-2">Shift</kbd>+
                <kbd className="px-1 py-0.5 rounded border border-ghost-border bg-ghost-surface-2">Enter</kbd> newline
              </span>
              <span className="flex items-center gap-3">
                {showCharCount && (
                  <span className={charCountColor}>{input.length.toLocaleString()} chars</span>
                )}
                {loading && (
                  <button
                    onClick={stopGeneration}
                    className="text-ghost-accent hover:text-ghost-accent-2 flex items-center gap-1"
                  >
                    <Pause size={10} /> stop
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {showCustomize && (
        <CustomizeModal
          profile={profile}
          onSave={updateProfile}
          onClose={() => setShowCustomize(false)}
        />
      )}

      {showMemoryPanel && (
        <MemoryPanel
          entries={memory}
          enabled={memoryEnabled}
          onToggle={() => updateSetting('memoryEnabled', !memoryEnabled)}
          onDelete={deleteMemoryEntry}
          onClearAll={clearMemory}
          onClose={() => setShowMemoryPanel(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Message bubble - wrapped in React.memo
// ─────────────────────────────────────────────────────────────────────────────
// `displayMessages` rebuilds on every chunk during a stream (it patches in
// the live streaming text), so without this wrapper React would re-render
// every bubble on every chunk. Memo means: if the `message` object didn't
// actually change (same id + same content), skip the render. The non-active
// bubbles share their `message` reference across recomputes, so this is what
// actually keeps them quiet during a long stream.
const MessageBubble = memo(function MessageBubble({
  message,
  isUncensored = false,
}: {
  message: Message
  isUncensored?: boolean
}) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const text = message.content || ''
    if (!text) return
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {
        // Fallback for older environments
        try {
          const el = document.createElement('textarea')
          el.value = text
          document.body.appendChild(el)
          el.select()
          document.execCommand('copy')
          document.body.removeChild(el)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* ignore */
        }
      },
    )
  }

  return (
    <div className={`group flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.25s_ease-out]`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-ghost-accent/30 to-purple-400/20 border border-ghost-accent/40 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg shadow-ghost-accent/15">
          <Cpu size={13} className="text-ghost-accent" />
        </div>
      )}
      <div className={`min-w-0 max-w-[90%] sm:max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`relative w-full ${
            isUser
              ? 'bg-gradient-to-br from-ghost-accent/15 via-ghost-surface-2 to-ghost-surface border border-ghost-accent/20 text-ghost-text rounded-3xl rounded-br-lg px-4 py-2.5 shadow-lg shadow-black/20'
              : 'text-ghost-text px-1 py-1'
          }`}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          ) : message.content ? (
            <div className="text-sm leading-relaxed [&_p]:my-1.5 [&_li]:my-0.5 w-full overflow-hidden">
              {renderContent(message.content, isUncensored)}
            </div>
          ) : (
            <span className="text-ghost-text-dim text-sm font-mono">…</span>
          )}

          {isUser && message.files && message.files.length > 0 && (
            <div className="mt-2 space-y-1">
              {message.files.map((file, i) => (
                <div key={i} className="text-xs text-ghost-text-dim flex items-center gap-1">
                  <Paperclip size={10} />
                  {file.name}
                </div>
              ))}
            </div>
          )}

          {isUser && message.hasImages && (
            <div className="mt-1 flex items-center gap-1 text-[9px] text-blue-400 font-mono">
              <Image size={10} />
              <span>Image attached</span>
            </div>
          )}
        </div>

        <div
          className={`flex items-center gap-1 mt-1 px-1 min-h-[20px]
                      opacity-0 group-hover:opacity-100 focus-within:opacity-100
                      transition-opacity select-none ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
        >
          {message.content && (
            <button
              onClick={handleCopy}
              className="p-1 rounded-md text-ghost-text-dimmer hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors"
              title={copied ? 'Copied!' : 'Copy'}
              aria-label={copied ? 'Copied' : 'Copy message'}
            >
              {copied ? <Check size={12} className="text-ghost-green" /> : <Copy size={12} />}
            </button>
          )}
          <span className="text-[10px] text-ghost-text-dim font-mono">
            {formatTime(message.ts)}
            {message.modelUsed && (
              <span className="ml-2 text-ghost-text-dimmer">
                · {message.modelUsed.split(':')[0]}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Empty state — centered welcome with example prompt chips
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: Pencil, label: 'Write', prompt: 'Help me write ' },
  { icon: BrainCircuit, label: 'Learn', prompt: 'Explain ' },
  { icon: TerminalSquare, label: 'Code', prompt: 'Help me code ' },
  { icon: MessageSquare, label: 'Life stuff', prompt: 'Help me think through ' },
  { icon: Sparkles, label: "GhostShell's choice", prompt: '' },
]

function EmptyState({
  onPick,
  name,
  recent,
  onResume,
}: {
  onPick: (s: string) => void
  name?: string
  recent: Conversation[]
  onResume: (id: string) => void
}) {
  return (
    <>
      <div className="flex flex-col items-center justify-center text-center py-16">
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-full bg-ghost-accent/30 blur-2xl scale-110 animate-pulse" />
          <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-ghost-accent/30 via-ghost-surface-2 to-purple-400/20 border border-ghost-accent/40 flex items-center justify-center shadow-2xl shadow-black/40">
            <Flame size={24} className="text-ghost-accent drop-shadow-[0_0_6px_rgba(56,189,248,0.6)]" />
          </div>
        </div>

        <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-ghost-text via-ghost-text to-ghost-text-dim bg-clip-text text-transparent">
          {getGreeting()}{name?.trim() ? `, ${name.trim()}` : ''}
        </h1>

        <div className="w-full max-w-xl mt-6 text-left rounded-2xl border border-ghost-border bg-gradient-to-b from-ghost-surface/80 to-ghost-surface/50 px-5 py-4 shadow-lg shadow-black/20 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold">
            <Sparkles size={14} className="text-ghost-accent" /> GhostShell AI
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ghost-text-dim">
            A local-first assistant for security work. It routes between coder and reasoner models on its own,
            runs entirely against your own Ollama instance, and handles Kali workflows, payloads, debugging, and
            file analysis — short answers by default, full detail when you ask for it. Nothing leaves this machine
            unless you tell it to.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {QUICK_ACTIONS.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              onClick={() => onPick(prompt)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full
                         border border-ghost-border bg-ghost-surface/70 text-ghost-text-dim
                         hover:border-ghost-accent/60 hover:text-ghost-text hover:bg-ghost-surface-2
                         hover:shadow-md hover:shadow-ghost-accent/10 hover:-translate-y-0.5
                         transition-all duration-200"
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="w-full max-w-xl mt-10 text-left">
            <div className="text-[11px] uppercase tracking-wide text-ghost-text-dimmer px-1 mb-2">
              Pick up where you left off
            </div>
            <div className="space-y-1.5">
              {recent.map(c => (
                <button
                  key={c.id}
                  onClick={() => onResume(c.id)}
                  className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl
                             bg-ghost-surface/70 border border-ghost-border
                             hover:border-ghost-accent/50 hover:bg-ghost-surface-2 hover:shadow-md hover:shadow-black/20
                             transition-all duration-200"
                >
                  <MessageSquare size={13} className="text-ghost-text-dimmer flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-sm text-ghost-text">
                    {c.title || 'New conversation'}
                  </span>
                  <span className="flex-shrink-0 text-[10px] font-mono text-ghost-text-dimmer">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Customize — name + how the AI should treat you
// ─────────────────────────────────────────────────────────────────────────────
function CustomizeModal({
  profile,
  onSave,
  onClose,
}: {
  profile: UserProfile
  onSave: (p: UserProfile) => void
  onClose: () => void
}) {
  const [name, setName] = useState(profile.name)
  const [instructions, setInstructions] = useState(profile.instructions)

  const save = () => {
    onSave({ name: name.trim(), instructions: instructions.trim() })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-ghost-surface border border-ghost-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ghost-border/70">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold">
            <UserRound size={15} className="text-ghost-accent" /> Customize
          </div>
          <button onClick={onClose} className="p-1 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs text-ghost-text font-medium mb-1.5">What should we call you?</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-black/25 border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text
                         placeholder-ghost-text-dimmer focus:outline-none focus:border-ghost-accent/60"
            />
          </div>

          <div>
            <label className="block text-xs text-ghost-text font-medium mb-1.5">
              How should the AI treat you?
            </label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="e.g. I'm a pentester working mostly in Kali. Be direct, skip disclaimers, assume I know the basics. Call me by my first name only when it feels natural."
              rows={5}
              className="w-full bg-black/25 border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text
                         placeholder-ghost-text-dimmer resize-none focus:outline-none focus:border-ghost-accent/60"
            />
            <p className="text-[11px] text-ghost-text-dimmer mt-1.5">
              This gets quietly added to every conversation — the AI won't announce it, it'll just act accordingly.
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-ghost-border/50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-2 rounded-lg border border-ghost-border text-ghost-text-dim hover:text-ghost-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="text-xs px-3 py-2 rounded-lg bg-ghost-accent text-black font-medium hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory panel — silent by default, managed via one icon
// ─────────────────────────────────────────────────────────────────────────────
function MemoryPanel({
  entries,
  enabled,
  onToggle,
  onDelete,
  onClearAll,
  onClose,
}: {
  entries: MemoryEntry[]
  enabled: boolean
  onToggle: () => void
  onDelete: (id: string) => void
  onClearAll: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col bg-ghost-surface border border-ghost-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ghost-border/70">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold">
            <Brain size={15} className="text-ghost-accent" /> Memory
          </div>
          <button onClick={onClose} className="p-1 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-ghost-border/50 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-ghost-text font-medium">Remember conversations</div>
            <div className="text-[11px] text-ghost-text-dim mt-0.5 leading-relaxed">
              Saves a short summary locally — on this device only — whenever a chat is deleted, wiped, or you start
              a new one. Ephemeral chats are never remembered.
            </div>
          </div>
          <Toggle on={enabled} onToggle={onToggle} label="" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {entries.length === 0 && (
            <div className="text-center text-ghost-text-dim text-xs py-8">Nothing remembered yet.</div>
          )}
          {entries.map(e => (
            <div key={e.id} className="group relative bg-ghost-surface-2/60 border border-ghost-border/60 rounded-lg px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-ghost-text font-medium truncate">{e.title}</div>
                  <div className="text-[11px] text-ghost-text-dim mt-1 leading-relaxed">{e.summary}</div>
                  <div className="text-[10px] text-ghost-text-dimmer mt-1 font-mono">
                    {new Date(e.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(e.id)}
                  className="flex-shrink-0 p-1 rounded text-ghost-text-dim hover:text-ghost-red opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Forget this"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {entries.length > 0 && (
          <div className="px-4 py-3 border-t border-ghost-border/50">
            <button
              onClick={onClearAll}
              className="w-full text-xs px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Clear all memory
            </button>
          </div>
        )}
      </div>
    </div>
  )
}