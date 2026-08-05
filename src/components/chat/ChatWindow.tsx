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
  AlertCircle,
  RefreshCw,
  FileText,
  Settings,
  Keyboard,
} from 'lucide-react'
import { checkOllamaHealth, isLocalOllama, OLLAMA_HOST, streamOllamaChat } from '../../lib/ollama'
import {
  pickModel,
  getModelOptions,
  trimHistory,
  TOOL_CORRECTIONS,
  TYPO_CORRECTIONS,
  ACCEPTED_FILES,
  supportsMultimodal,
  isVisionModel,
} from './config'
import { buildSystemPrompt } from './systemPrompt'
import { renderContent } from './MessageRenderer'
import { FileAttachmentPreview, readFiles, formatFilesForPrompt, getRawBase64FromFile, hasValidImageData } from './FileAttachment'
import type { Message, AttachedFile, Conversation, StoredSettings } from './types'
import { useActiveModel, setActiveModel as setGlobalActiveModel, hasActiveModelPreference, getModelLimits } from '../models/ModelManager'

// ─────────────────────────────────────────────────────────────────────────────
// Polyfill for crypto.randomUUID() for older browsers
// ─────────────────────────────────────────────────────────────────────────────
if (!crypto.randomUUID) {
  crypto.randomUUID = function(): `${string}-${string}-${string}-${string}-${string}` {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    }) as `${string}-${string}-${string}-${string}-${string}`
  }
}

declare global {
  interface Crypto {
    randomUUID(): `${string}-${string}-${string}-${string}-${string}`
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────────────────────────────────────
const SETTINGS_KEY = 'ghostshell-chat-settings'
const CONVERSATIONS_KEY = 'pentest_ai_conversations'
const ACTIVE_CONV_KEY = 'pentest_ai_active_conversation'
const PROFILE_KEY = 'ghostshell-user-profile'
const MEMORY_KEY = 'ghostshell-chat-memory'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MAX_MEMORY_ENTRIES = 300
const MAX_MEMORY_AGE_DAYS = 90
const MEMORY_CONTEXT_CHAR_BUDGET = 4000
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const TOKEN_ESTIMATE_FACTOR = 4 // Rough: 4 chars per token

// ─────────────────────────────────────────────────────────────────────────────
// User-configurable character limit
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_MAX_INPUT_CHARS = 8000
const MIN_INPUT_CHARS = 1000
const MAX_INPUT_CHARS_LIMIT = 100000 // 100KB - enough for large exploits

// ─────────────────────────────────────────────────────────────────────────────
// Local-only types
// ─────────────────────────────────────────────────────────────────────────────
type UserProfile = {
  name: string
  instructions: string
}

type MemoryEntry = {
  id: string
  createdAt: number
  title: string
  summary: string
  messageCount: number
}

type DateBucket = 'Today' | 'Yesterday' | 'This week' | 'Older'

type OllamaModel = {
  name: string
  size: number
  digest: string
  modified_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────
function defaultSettings(): StoredSettings {
  return {
    autoRoute: true,
    autoCorrect: true,
    ephemeral: true,
    uncensored: true,
    activeModel: '',
    temperature: 0.85,
    memoryEnabled: true,
    showShortcuts: false,
    autoDownloadModels: false,
    perConversationModel: false,
    maxInputChars: DEFAULT_MAX_INPUT_CHARS,
    showTokenCount: true,
    compactMode: false,
  }
}

function loadSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = { ...defaultSettings(), ...JSON.parse(raw) } as StoredSettings
      if (!parsed.activeModel || typeof parsed.activeModel !== 'string') {
        parsed.activeModel = ''
      }
      if (!parsed.maxInputChars || typeof parsed.maxInputChars !== 'number') {
        parsed.maxInputChars = DEFAULT_MAX_INPUT_CHARS
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
    /* ignore */
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
// Profile
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
// Memory with pruning and deduplication
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

function pruneMemoryEntries(entries: MemoryEntry[]): MemoryEntry[] {
  const cutoff = Date.now() - MAX_MEMORY_AGE_DAYS * 24 * 60 * 60 * 1000
  const recent = entries.filter(e => e.createdAt >= cutoff)
  if (recent.length <= MAX_MEMORY_ENTRIES) return recent

  return recent
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_MEMORY_ENTRIES)
}

function saveMemory(entries: MemoryEntry[]) {
  try {
    const pruned = pruneMemoryEntries(entries)
    localStorage.setItem(MEMORY_KEY, JSON.stringify(pruned))
  } catch {
    /* ignore */
  }
}

function shouldRemember(conv: Conversation, existing: MemoryEntry[]): boolean {
  const similar = existing.some(e => 
    e.title === conv.title && 
    Math.abs(e.createdAt - conv.createdAt) < 60 * 60 * 1000
  )
  return !similar
}

function buildMemoryContext(entries: MemoryEntry[]): string {
  if (entries.length === 0) return ''
  let used = 0
  const lines: string[] = []
  
  for (const e of entries) {
    const prefix = '- '
    let summaryText = e.summary
    
    if (used + prefix.length + summaryText.length > MEMORY_CONTEXT_CHAR_BUDGET) {
      const available = MEMORY_CONTEXT_CHAR_BUDGET - used - prefix.length
      if (available <= 0) break
      
      const cutPoint = summaryText.lastIndexOf('.', available) + 1
      if (cutPoint > 0 && cutPoint <= available) {
        summaryText = summaryText.slice(0, cutPoint)
      } else {
        const lastSpace = summaryText.lastIndexOf(' ', available)
        if (lastSpace > 0) {
          summaryText = summaryText.slice(0, lastSpace) + '…'
        } else {
          summaryText = summaryText.slice(0, available) + '…'
        }
      }
    }
    
    lines.push(`${prefix}${summaryText}`)
    used += prefix.length + summaryText.length
  }
  
  if (lines.length === 0) return ''
  return `\n\n[Long-term memory — learned from this user's earlier conversations. Use only if relevant; don't quote it verbatim or call attention to "memory" unless asked.]\n${lines.join('\n')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Summarization with debouncing
// ─────────────────────────────────────────────────────────────────────────────
const summarizationQueue = new Map<string, { timeout: NodeJS.Timeout; controller: AbortController }>()

async function summarizeConversation(
  conv: Conversation, 
  model: string, 
  signal?: AbortSignal
): Promise<string | null> {
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
      signal || new AbortController().signal,
      () => {
        /* no streaming UI needed for a background summary */
      },
    )
    return summary?.trim() || null
  } catch {
    return null
  }
}

function debounceSummarization(
  convId: string,
  conv: Conversation,
  model: string,
  onSummarized: (entry: MemoryEntry) => void,
) {
  if (summarizationQueue.has(convId)) {
    const existing = summarizationQueue.get(convId)!
    clearTimeout(existing.timeout)
    existing.controller.abort()
    summarizationQueue.delete(convId)
  }

  const controller = new AbortController()
  const timeout = setTimeout(async () => {
    try {
      const summary = await summarizeConversation(conv, model, controller.signal)
      if (summary && !controller.signal.aborted) {
        const entry: MemoryEntry = {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          title: conv.title || 'Untitled conversation',
          summary,
          messageCount: conv.messages.length,
        }
        onSummarized(entry)
      }
    } catch {
      // Ignore summarization errors
    } finally {
      summarizationQueue.delete(convId)
    }
  }, 2000)

  summarizationQueue.set(convId, { timeout, controller })
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

function modelLabel(model: string): string {
  if (!model) return 'No model selected'
  const parts = model.split(':')
  return parts[0] || model
}

// ─────────────────────────────────────────────────────────────────────────────
// Token counter
// ─────────────────────────────────────────────────────────────────────────────
function countTokens(text: string): number {
  return Math.ceil(text.length / TOKEN_ESTIMATE_FACTOR)
}

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`
  }
  return `${count}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart truncation for code
// ─────────────────────────────────────────────────────────────────────────────
function smartTruncate(text: string, maxLength: number): { truncated: string; wasTruncated: boolean } {
  if (text.length <= maxLength) {
    return { truncated: text, wasTruncated: false }
  }

  const breakPoints = [
    '\n\n',
    '\n',
    ';',
    '}',
    ']',
    ')',
    '.',
    ' ',
  ]

  let cutPoint = maxLength
  for (const bp of breakPoints) {
    const lastIndex = text.lastIndexOf(bp, maxLength)
    if (lastIndex > maxLength * 0.7) {
      cutPoint = lastIndex + bp.length
      break
    }
  }

  const truncated = text.slice(0, cutPoint) + '\n\n... [truncated - character limit reached]'
  return { truncated, wasTruncated: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small presentational bits
// ─────────────────────────────────────────────────────────────────────────────
function Toggle({
  on,
  onToggle,
  label,
  disabled = false,
}: {
  on: boolean
  onToggle: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-2 text-xs text-ghost-text-dim cursor-pointer select-none font-mono ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div
        onClick={disabled ? undefined : onToggle}
        className={`w-8 h-4 rounded-full transition-colors relative ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        } ${
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
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ghost-surface-2/60 border border-ghost-border/50">
      <div className="relative w-3 h-3 flex-shrink-0">
        <div className="absolute inset-0 rounded-full bg-ghost-accent/40 blur-[2px] animate-ping" />
        <div className="absolute inset-[2px] rounded-full bg-gradient-to-br from-ghost-accent to-purple-400" />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-gradient-to-br from-ghost-accent to-purple-400 [animation:bounceDot_1.1s_ease-in-out_infinite] [animation-delay:-0.24s]" />
        <span className="w-2 h-2 rounded-full bg-gradient-to-br from-ghost-accent to-purple-400 [animation:bounceDot_1.1s_ease-in-out_infinite] [animation-delay:-0.12s]" />
        <span className="w-2 h-2 rounded-full bg-gradient-to-br from-ghost-accent to-purple-400 [animation:bounceDot_1.1s_ease-in-out_infinite]" />
      </div>
      <style>{`@keyframes bounceDot{0%,80%,100%{transform:translateY(0);opacity:0.5}40%{transform:translateY(-4px);opacity:1}}`}</style>
    </div>
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
// Character Limit Settings Modal
// ─────────────────────────────────────────────────────────────────────────────
function CharacterLimitSettings({
  currentLimit,
  onSave,
  onClose,
}: {
  currentLimit: number
  onSave: (limit: number) => void
  onClose: () => void
}) {
  const [limit, setLimit] = useState(currentLimit)
  const [customValue, setCustomValue] = useState(currentLimit.toString())

  const presets = [2000, 4000, 8000, 16000, 32000, 64000, 100000]

  const handlePreset = (val: number) => {
    setLimit(val)
    setCustomValue(val.toString())
  }

  const handleCustom = (val: string) => {
    setCustomValue(val)
    const num = parseInt(val)
    if (!isNaN(num) && num >= MIN_INPUT_CHARS && num <= MAX_INPUT_CHARS_LIMIT) {
      setLimit(num)
    }
  }

  const save = () => {
    const finalLimit = Math.max(MIN_INPUT_CHARS, Math.min(MAX_INPUT_CHARS_LIMIT, limit))
    onSave(finalLimit)
    onClose()
  }

  const getSizeLabel = (bytes: number): string => {
    if (bytes >= 100000) return '100 KB'
    if (bytes >= 10000) return '10 KB'
    if (bytes >= 5000) return '5 KB'
    return `${bytes.toLocaleString()} chars`
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-ghost-surface border border-ghost-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ghost-border/70">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold">
            <Settings size={15} className="text-ghost-accent" />
            Character Limit
          </div>
          <button onClick={onClose} className="p-1 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div>
            <div className="text-xs text-ghost-text-dim mb-2 leading-relaxed">
              Set the maximum number of characters allowed in a single message.
              Useful for pasting large exploit code, logs, or configuration files.
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ghost-text-dim">Current:</span>
              <span className="text-sm text-ghost-text font-mono font-semibold">
                {limit.toLocaleString()} chars
              </span>
              <span className="text-[10px] text-ghost-text-dimmer font-mono">
                ({getSizeLabel(limit)})
              </span>
            </div>
          </div>

          <div>
            <div className="text-xs text-ghost-text-dim mb-2">Quick presets:</div>
            <div className="flex flex-wrap gap-2">
              {presets.map(p => (
                <button
                  key={p}
                  onClick={() => handlePreset(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono transition-colors ${
                    limit === p
                      ? 'bg-ghost-accent/20 text-ghost-accent border border-ghost-accent/30'
                      : 'bg-ghost-surface-2/50 border border-ghost-border text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent/30'
                  }`}
                >
                  {p >= 1000 ? `${p / 1000}k` : p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-ghost-text-dim mb-2">Custom value:</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={customValue}
                onChange={e => handleCustom(e.target.value)}
                min={MIN_INPUT_CHARS}
                max={MAX_INPUT_CHARS_LIMIT}
                className="flex-1 bg-black/25 border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text
                           focus:outline-none focus:border-ghost-accent/60"
              />
              <span className="text-xs text-ghost-text-dimmer font-mono">chars</span>
            </div>
            <div className="flex justify-between text-[10px] text-ghost-text-dimmer mt-1">
              <span>Min: {MIN_INPUT_CHARS.toLocaleString()}</span>
              <span>Max: {MAX_INPUT_CHARS_LIMIT.toLocaleString()} (100KB)</span>
            </div>
          </div>

          <div className="bg-black/25 border border-ghost-border/50 rounded-lg px-3 py-2">
            <div className="text-[10px] text-ghost-text-dimmer font-mono">
              💡 Tip: For very large code blocks, consider using the file attachment feature instead.
              Files up to 10MB are supported.
            </div>
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
// Keyboard shortcuts component
// ─────────────────────────────────────────────────────────────────────────────
function KeyboardShortcutsHelp({ onClose }: { onClose: () => void }) {
  const shortcuts: { key: string; ctrl: boolean; shift: boolean; alt: boolean; label: string }[] = [
    { key: 'N', ctrl: true, shift: true, alt: false, label: 'New conversation' },
    { key: 'Delete', ctrl: true, shift: true, alt: false, label: 'Clear current chat' },
    { key: 'E', ctrl: true, shift: true, alt: false, label: 'Export chat' },
    { key: 'M', ctrl: true, shift: true, alt: false, label: 'Toggle memory panel' },
    { key: 'S', ctrl: true, shift: true, alt: false, label: 'Toggle sidebar' },
    { key: 'P', ctrl: true, shift: true, alt: false, label: 'Toggle power mode' },
    { key: 'Enter', ctrl: false, shift: false, alt: false, label: 'Send message' },
    { key: 'Enter', ctrl: false, shift: true, alt: false, label: 'New line in input' },
    { key: 'Escape', ctrl: false, shift: false, alt: false, label: 'Close modals / cancel' },
  ]

  const formatKey = (s: { key: string; ctrl: boolean; shift: boolean; alt: boolean }) => {
    const parts: string[] = []
    if (s.ctrl) parts.push('⌘')
    if (s.shift) parts.push('⇧')
    if (s.alt) parts.push('⌥')
    parts.push(s.key === 'Delete' ? '⌫' : s.key === 'Enter' ? '↵' : s.key)
    return parts.join('')
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-ghost-surface border border-ghost-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ghost-border/70">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold">
            <Keyboard size={15} className="text-ghost-accent" />
            Keyboard Shortcuts
          </div>
          <button onClick={onClose} className="p-1 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-1.5 max-h-[60vh] overflow-y-auto">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-ghost-border/30 last:border-0">
              <span className="text-xs text-ghost-text-dim">{s.label}</span>
              <kbd className="px-2 py-0.5 rounded border border-ghost-border bg-black/20 text-xs font-mono text-ghost-text">
                {formatKey(s)}
              </kbd>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-ghost-border/50 text-center">
          <p className="text-[10px] text-ghost-text-dimmer font-mono">
            Press <kbd className="px-1.5 py-0.5 rounded border border-ghost-border bg-black/20 text-[10px]">⌘</kbd> + <kbd className="px-1.5 py-0.5 rounded border border-ghost-border bg-black/20 text-[10px]">/</kbd> to toggle this panel
          </p>
        </div>
      </div>
    </div>
  )
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
  const [sidebarSearch, setSidebarSearch] = useState('')

  // Active conversation derived state
  const activeConv = useMemo(
    () => conversations.find(c => c.id === activeId) ?? null,
    [conversations, activeId],
  )
  const messages = activeConv?.messages ?? []

  // ─── Streaming state ──────────────────────────────────────────────────
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState('')

  // ─── Installed models from Ollama ────────────────────────────────────
  const [installedModels, setInstalledModels] = useState<OllamaModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  // ─── Filtered conversations for sidebar ──────────────────────────────
  const filteredConversations = useMemo(() => {
    const q = sidebarSearch.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(c => c.title.toLowerCase().includes(q))
  }, [conversations, sidebarSearch])

  // `displayMessages` patches the active assistant bubble with live streaming text
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
  const [isRetrying, setIsRetrying] = useState(false)
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false)
  const [showCharLimitSettings, setShowCharLimitSettings] = useState(false)

  // Settings
  const [settings, setSettings] = useState(loadSettings)
  const { 
    autoRoute, 
    autoCorrect, 
    ephemeral, 
    uncensored, 
    activeModel, 
    temperature, 
    memoryEnabled,
    showTokenCount,
  } = settings

  // Get the user's configured character limit
  const maxInputChars = settings.maxInputChars || DEFAULT_MAX_INPUT_CHARS

  // Profile
  const [profile, setProfile] = useState<UserProfile>(loadProfile)
  const [showCustomize, setShowCustomize] = useState(false)

  // Memory
  const [memory, setMemory] = useState<MemoryEntry[]>(loadMemory)
  const [showMemoryPanel, setShowMemoryPanel] = useState(false)
  const memorizedIdsRef = useRef<Set<string>>(new Set())
  const memoryAbortControllerRef = useRef<AbortController | null>(null)

  // Model from ModelManager - fix race condition
  const modelFromManager = useActiveModel()
  const modelManagerInitializedRef = useRef(false)

  useEffect(() => {
    if (modelManagerInitializedRef.current) return
    modelManagerInitializedRef.current = true

    if (hasActiveModelPreference()) {
      if (modelFromManager && modelFromManager !== activeModel) {
        updateSetting('activeModel', modelFromManager)
        updateSetting('autoRoute', false)
      }
    } else if (activeModel) {
      setGlobalActiveModel(activeModel)
    }
  }, [])

  // Refs
  const controllerRef = useRef<AbortController | null>(null)
  const streamingContentRef = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const convScrollRef = useRef<HTMLDivElement>(null)
  const rafIdRef = useRef<number | null>(null)

  // Computed values
  const hasImages = useMemo(() => files.some(f => f.type.startsWith('image/')), [files])
  const hasValidImages = useMemo(() => files.some(f => hasValidImageData(f)), [files])
  const inputTokenCount = useMemo(() => countTokens(input), [input])
  const totalTokenCount = useMemo(() => {
    const messageTokens = messages.reduce((sum, m) => sum + countTokens(m.content), 0)
    return messageTokens + inputTokenCount
  }, [messages, inputTokenCount])

  // Character limit warnings
  const showCharCount = input.length > 500
  const isNearLimit = input.length > maxInputChars * 0.8
  const isOverLimit = input.length > maxInputChars

  const charCountColor = 
    isOverLimit ? 'text-ghost-red' :
    isNearLimit ? 'text-ghost-yellow' :
    'text-ghost-text-dim'

  // ─── Remember conversation ──────────────────────────────────────────────
  const rememberConversation = useCallback(
    (conv: Conversation | null | undefined) => {
      if (!conv || !memoryEnabled || conv.wasEphemeral) return
      if (memorizedIdsRef.current.has(conv.id)) return
      
      if (!shouldRemember(conv, memory)) return
      
      memorizedIdsRef.current.add(conv.id)

      memoryAbortControllerRef.current?.abort()
      memoryAbortControllerRef.current = new AbortController()

      const model = activeModel || 'llama3.2'
      debounceSummarization(conv.id, conv, model, entry => {
        setMemory(prev => {
          const next = [entry, ...prev]
          saveMemory(next)
          return next
        })
      })
    },
    [memoryEnabled, activeModel, memory],
  )

  // ─── Keyboard shortcuts ──────────────────────────────────────────────
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

  const wipeCurrent = useCallback(() => {
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
  }, [activeId, activeConv, rememberConversation])

  const exportChat = useCallback(() => {
    if (messages.length === 0) return
    
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ghostshell-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [messages])

  const exportChatAsMarkdown = useCallback(() => {
    if (messages.length === 0) return
    
    const md = messages.map(m => 
      `## ${m.role === 'user' ? 'User' : 'Assistant'} (${new Date(m.ts).toLocaleString()})\n\n${m.content}`
    ).join('\n\n---\n\n')
    
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ghostshell-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }, [messages])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const togglePowerMode = useCallback(() => {
    updateSetting('uncensored', !uncensored)
  }, [uncensored])

  const toggleMemoryPanel = useCallback(() => {
    setShowMemoryPanel(prev => !prev)
  }, [])

  // ─── Keyboard shortcut handler ──────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        if (e.key === 'Escape') {
          if (showCustomize) setShowCustomize(false)
          if (showMemoryPanel) setShowMemoryPanel(false)
          if (showShortcutsHelp) setShowShortcutsHelp(false)
          if (showCharLimitSettings) setShowCharLimitSettings(false)
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === '/') {
        e.preventDefault()
        setShowShortcutsHelp(prev => !prev)
        return
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey) {
          switch (e.key.toLowerCase()) {
            case 'n':
              e.preventDefault()
              newConversation()
              break
            case 'delete':
              e.preventDefault()
              wipeCurrent()
              break
            case 'e':
              e.preventDefault()
              if (messages.length > 0) {
                if (e.altKey) {
                  exportChatAsMarkdown()
                } else {
                  exportChat()
                }
              }
              break
            case 'm':
              e.preventDefault()
              toggleMemoryPanel()
              break
            case 's':
              e.preventDefault()
              toggleSidebar()
              break
            case 'p':
              e.preventDefault()
              togglePowerMode()
              break
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [newConversation, wipeCurrent, exportChat, exportChatAsMarkdown, toggleMemoryPanel, toggleSidebar, togglePowerMode, messages.length, showCustomize, showMemoryPanel, showShortcutsHelp, showCharLimitSettings])

  // ─── Fetch installed models from Ollama ─────────────────────────────
  const fetchInstalledModels = useCallback(async () => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      if (!window.ghostshell?.ollamaRequest) {
        throw new Error(
          'GhostShell bridge unavailable (window.ghostshell.ollamaRequest is missing) — this usually means the app is not running inside Electron, or the preload script failed to load.',
        )
      }
      const { status, data } = await window.ghostshell.ollamaRequest('/api/tags', 'GET')
      if (status >= 400) {
        throw new Error(`HTTP ${status}`)
      }
      const payload = data as { models?: OllamaModel[] } | null
      const models = (payload?.models || []) as OllamaModel[]
      setInstalledModels(models)
      
      if (!activeModel && models.length > 0) {
        updateSetting('activeModel', models[0].name)
        setGlobalActiveModel(models[0].name)
      }
      
      if (activeModel && models.length > 0 && !models.some(m => m.name === activeModel)) {
        updateSetting('activeModel', models[0].name)
        setGlobalActiveModel(models[0].name)
      }
    } catch (err) {
      const e = err as Error
      setModelsError(e.message)
    } finally {
      setModelsLoading(false)
    }
  }, [activeModel])

  useEffect(() => {
    fetchInstalledModels()
    const interval = setInterval(fetchInstalledModels, 30_000)
    return () => clearInterval(interval)
  }, [fetchInstalledModels])

  // ─── Persistence ──────────────────────────────────────────────────────
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

  useEffect(() => {
    saveActiveId(activeId)
  }, [activeId])

  // ─── Settings write-through ──────────────────────────────────────────
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

  // ─── Memory functions ──────────────────────────────────────────────────
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

  // ─── Ollama health ──────────────────────────────────────────────────
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

  // ─── Auto-scroll ─────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, loading])

  // ─── Cleanup streaming state on unmount ─────────────────────────────
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
      memoryAbortControllerRef.current?.abort()
      setStreamingMessageId(null)
      setStreamingContent('')
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [])

  // ─── Conversation actions ────────────────────────────────────────────
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

  // ─── Retry on error ──────────────────────────────────────────────────
  const retrySend = () => {
    if (!connectionError) return
    setIsRetrying(true)
    setConnectionError(false)
    if (activeConv) {
      const lastUserMsg = [...activeConv.messages].reverse().find(m => m.role === 'user')
      if (lastUserMsg) {
        setInput(lastUserMsg.content)
        setTimeout(() => {
          setIsRetrying(false)
          send()
        }, 300)
      }
    }
  }

  // ─── Sending ───────────────────────────────────────────────────────────
  // Combined dictionary: tool names + common English typos, so both the
  // live per-word correction and the submit-time fallback use the same
  // single source of truth.
  const ALL_CORRECTIONS: Record<string, string> = { ...TOOL_CORRECTIONS, ...TYPO_CORRECTIONS }

  const applyAutoCorrect = (text: string) => {
    if (!autoCorrect) return text
    let corrected = text
    for (const [key, value] of Object.entries(ALL_CORRECTIONS)) {
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
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
    }
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

    if (!activeModel) {
      setConnectionError(true)
      setLoading(false)
      return
    }

    const hasImageAttachments = hasImages
    const model = autoRoute ? pickModel(text, hasImageAttachments) : activeModel

    if (autoRoute) {
      updateSetting('activeModel', model)
      setGlobalActiveModel(model)
    }

    if (hasImageAttachments && !supportsMultimodal(model)) {
      console.warn(`⚠️ Model ${model} doesn't support images. Consider switching to a vision model.`)
    }

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

    const convId = ensureConversation()

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
    setIsRetrying(false)

    const assistantId = crypto.randomUUID()
    streamingContentRef.current = ''
    setConversations(prev =>
      prev.map(c =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, { id: assistantId, role: 'assistant', content: '', ts: Date.now() }],
              updatedAt: Date.now(),
            }
          : c,
      ),
    )
    setStreamingMessageId(assistantId)
    setStreamingContent('')

    try {
      const prior = activeConv?.id === convId ? activeConv.messages : []
      const limits = getModelLimits(model)
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
      modelOpts.temperature = temperature
      modelOpts.num_predict = limits.num_predict
      modelOpts.num_ctx = limits.num_ctx

      console.log(`✅ Applied limits for "${model}":`, {
        num_predict: modelOpts.num_predict,
        num_ctx: modelOpts.num_ctx,
      })

      const controller = new AbortController()
      controllerRef.current = controller

      const systemMessage = {
        role: 'system',
        content: systemPrompt,
      }

      let messagesWithImages: any[] = [systemMessage, ...trimmed]

      if (hasImageAttachments && supportsMultimodal(model)) {
        const imageFiles = files.filter(f => f.type.startsWith('image/'))
        const imageData = imageFiles
          .map(f => getRawBase64FromFile(f))
          .filter((data): data is string => !!data && data.length > 0)

        if (imageData.length > 0) {
          const lastMessage = messagesWithImages[messagesWithImages.length - 1]
          if (lastMessage && lastMessage.role === 'user') {
            lastMessage.images = imageData
            console.log(`📸 Added ${imageData.length} image(s) to message for model ${model}`)
          }
        } else {
          console.warn('⚠️ No valid raw base64 data found for images. Check file reading.')
        }
      }

      let pendingContent = ''
      let rafScheduled = false
      let firstTokenSeen = false
      const flushPending = () => {
        rafScheduled = false
        setStreamingContent(pendingContent)
        if (rafIdRef.current) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
      }

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
            rafIdRef.current = requestAnimationFrame(flushPending)
          }
        },
      )

      if (rafScheduled && rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
        flushPending()
      }

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
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      inputRef.current?.focus()
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const handleFiles = async (fileList: FileList) => {
    const validFiles: File[] = []
    const invalidFiles: string[] = []
    
    for (const file of Array.from(fileList)) {
      if (file.size > MAX_FILE_SIZE) {
        invalidFiles.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
      } else {
        validFiles.push(file)
      }
    }

    if (invalidFiles.length > 0) {
      alert(`Some files were rejected because they exceed the ${MAX_FILE_SIZE / 1024 / 1024}MB limit:\n${invalidFiles.join('\n')}`)
    }

    if (validFiles.length > 0) {
      const dataTransfer = new DataTransfer()
      for (const file of validFiles) {
        dataTransfer.items.add(file)
      }
      const attached = await readFiles(dataTransfer.files)
      setFiles(prev => [...prev, ...attached])
    }
  }

  const localOnly = isLocalOllama()

  // ─── Group conversations by date ─────────────────────────────────────
  const groupingFingerprint = filteredConversations.map(c => `${c.id}:${c.title}:${c.updatedAt}`).join('|')
  const grouped = useMemo(() => {
    const buckets: Record<DateBucket, Conversation[]> = {
      Today: [],
      Yesterday: [],
      'This week': [],
      Older: [],
    }
    for (const c of filteredConversations) {
      buckets[bucketFor(c.updatedAt)].push(c)
    }
    for (const bucket of BUCKET_ORDER) {
      buckets[bucket].sort((a, b2) => b2.updatedAt - a.updatedAt)
    }
    return buckets
  }, [groupingFingerprint])

  // ─── Composer (input box) ────────────────────────────────────────────
  const composerBody = (
    <>
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

      <div
        className={`ghost-input flex flex-col gap-1.5 bg-ghost-surface/95 border ${
          isOverLimit ? 'border-ghost-red/50' : 'border-ghost-border/80'
        } rounded-[26px] px-3 pt-3 pb-2 transition-all duration-200 shadow-lg shadow-black/20
        focus-within:border-ghost-accent/60 focus-within:shadow-xl focus-within:shadow-ghost-accent/15`}
      >
        <textarea
          ref={inputRef}
          value={input}
          spellCheck={true}
          onChange={e => {
            let val = e.target.value

            // Live auto-correct: when the user just finished a word (typed a
            // trailing space/newline), check that word against TOOL_CORRECTIONS
            // and fix it visibly in the input — same moment real editors
            // apply autocorrect, so it doesn't fight mid-word typing or
            // jump the cursor.
            if (autoCorrect && val.length > input.length && /\s$/.test(val)) {
              const beforeSpace = val.slice(0, -1)
              const wordMatch = beforeSpace.match(/(\S+)$/)
              if (wordMatch) {
                const word = wordMatch[1]
                const replacement = ALL_CORRECTIONS[word.toLowerCase()]
                if (replacement && replacement !== word) {
                  val = beforeSpace.slice(0, -word.length) + replacement + val.slice(-1)
                }
              }
            }

            if (val.length <= maxInputChars) {
              setInput(val)
            } else {
              // Check if user wants to truncate or increase limit
              if (val.length > maxInputChars * 1.2) {
                const shouldTruncate = window.confirm(
                  `This message is ${val.length.toLocaleString()} characters.\n` +
                  `Your current limit is ${maxInputChars.toLocaleString()} characters.\n\n` +
                  `Would you like to:\n` +
                  `• Click "OK" to truncate the message (keep first ${maxInputChars.toLocaleString()} chars)\n` +
                  `• Click "Cancel" to keep the full message and increase your limit`
                )
                if (shouldTruncate) {
                  const { truncated } = smartTruncate(val, maxInputChars)
                  setInput(truncated)
                } else {
                  setShowCharLimitSettings(true)
                  setInput(val)
                }
              } else {
                setInput(val.slice(0, maxInputChars))
              }
            }
          }}
          onKeyDown={onKey}
          placeholder={installedModels.length === 0 ? "No models installed — open Model Manager to pull one" : "How can I help you today?"}
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 rounded-full text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors flex-shrink-0"
              title="Attach file (max 10MB)"
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

            {showTokenCount && input.length > 0 && (
              <span className={`text-[10px] font-mono px-1.5 ${
                isOverLimit ? 'text-ghost-red' : isNearLimit ? 'text-ghost-yellow' : 'text-ghost-text-dimmer'
              }`}>
                {formatTokenCount(inputTokenCount)} tokens
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span
              className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-ghost-text-dim
                         px-2.5 py-1 rounded-full border border-ghost-border bg-black/20"
              title={autoRoute ? 'Auto-routed' : 'Manually selected — change it in the settings strip above'}
            >
              {autoRoute && <Sparkles size={10} className="text-ghost-accent" />}
              {activeModel ? modelLabel(activeModel) : 'No model'}
            </span>

            {showTokenCount && messages.length > 0 && (
              <span className="hidden lg:inline-flex text-[10px] font-mono text-ghost-text-dimmer px-1.5">
                Σ {formatTokenCount(totalTokenCount)}
              </span>
            )}

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
              <div className={`relative flex-shrink-0 rounded-full ${(input.trim() || files.length > 0) && activeModel ? 'p-[1.5px] overflow-hidden' : ''}`}>
                {(input.trim() || files.length > 0) && activeModel && (
                  <div className="absolute inset-[-2px] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_0deg,rgba(56,189,248,0.9),rgba(34,211,238,0.7),rgba(14,165,233,0.9),rgba(56,189,248,0.9))]" />
                )}
                <button
                  onClick={send}
                  disabled={(!input.trim() && files.length === 0) || loading || !activeModel || isOverLimit}
                  className="relative flex-shrink-0 p-2 rounded-full bg-ghost-accent text-black
                             hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                  title={isOverLimit ? "Input exceeds character limit" : !activeModel ? "No model selected" : "Send"}
                >
                  <Send size={13} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-ghost-text-dim text-[11px] mt-1.5 px-2 flex justify-between flex-wrap gap-1 font-mono">
        <span className="flex items-center gap-2">
          <kbd className="px-1 py-0.5 rounded border border-ghost-border bg-ghost-surface-2">Enter</kbd> send ·{' '}
          <kbd className="px-1 py-0.5 rounded border border-ghost-border bg-ghost-surface-2">Shift</kbd>+
          <kbd className="px-1 py-0.5 rounded border border-ghost-border bg-ghost-surface-2">Enter</kbd> newline
          <span className="hidden sm:inline">· <kbd className="px-1 py-0.5 rounded border border-ghost-border bg-ghost-surface-2">⌘</kbd>+<kbd className="px-1 py-0.5 rounded border border-ghost-border bg-ghost-surface-2">/</kbd> shortcuts</span>
        </span>
        <span className="flex items-center gap-3">
          {isOverLimit && (
            <span className="text-ghost-red flex items-center gap-1">
              <AlertCircle size={10} />
              {maxInputChars.toLocaleString()} char limit exceeded
              <button
                onClick={() => {
                  if (window.confirm(`Your message is ${input.length.toLocaleString()} chars (limit: ${maxInputChars.toLocaleString()}).\n\nWould you like to automatically truncate it?`)) {
                    const { truncated } = smartTruncate(input, maxInputChars)
                    setInput(truncated)
                  } else {
                    setShowCharLimitSettings(true)
                  }
                }}
                className="text-[10px] text-ghost-accent hover:underline ml-1"
              >
                fix
              </button>
            </span>
          )}
          {isNearLimit && !isOverLimit && (
            <span className="text-ghost-yellow flex items-center gap-1">
              <AlertCircle size={10} />
              {maxInputChars - input.length} chars remaining
              <button
                onClick={() => setShowCharLimitSettings(true)}
                className="text-[10px] text-ghost-accent hover:underline ml-1"
              >
                (increase)
              </button>
            </span>
          )}
          {!activeModel && installedModels.length === 0 && (
            <span className="text-ghost-yellow flex items-center gap-1">
              <AlertCircle size={10} />
              No model installed
            </span>
          )}
          {showCharCount && !isNearLimit && !isOverLimit && (
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
    </>
  )

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full bg-ghost-bg rounded-3xl overflow-hidden relative border border-ghost-border/70 shadow-2xl shadow-black/50">
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.14),transparent_36%),radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.06),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'2\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />
      
      {/* ───────── Conversation sidebar ───────── */}
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
        <div className="p-2 flex-shrink-0 space-y-1.5">
          <button
            onClick={newConversation}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
                       border border-ghost-accent/30 bg-ghost-accent/10
                       text-ghost-text text-sm hover:bg-ghost-accent/15 hover:border-ghost-accent/50 transition-all"
          >
            <Plus size={14} />
            <span>New chat</span>
            <span className="ml-auto text-[10px] text-ghost-text-dimmer font-mono">⌘⇧N</span>
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

          <div className="flex gap-1">
            <button
              onClick={() => setShowCustomize(true)}
              className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-ghost-text-dim text-xs
                         hover:bg-ghost-surface-2/70 hover:text-ghost-text transition-colors"
            >
              <UserRound size={13} />
              <span>Customize</span>
            </button>

            <button
              onClick={() => setShowMemoryPanel(true)}
              className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg text-ghost-text-dim text-xs
                         hover:bg-ghost-surface-2/70 hover:text-ghost-text transition-colors"
            >
              <Brain size={13} className={memoryEnabled ? 'text-ghost-accent' : ''} />
              <span>Memory</span>
              {memory.length > 0 && (
                <span className="ml-auto text-[10px] text-ghost-text-dimmer font-mono">{memory.length}</span>
              )}
            </button>

            <button
              onClick={() => setShowShortcutsHelp(true)}
              className="flex-1 flex items-center gap-1 px-2 py-1.5 rounded-lg text-ghost-text-dim text-xs
                         hover:bg-ghost-surface-2/70 hover:text-ghost-text transition-colors"
              title="Keyboard shortcuts (⌘⇧/)"
            >
              <Keyboard size={12} />
            </button>
          </div>
        </div>

        <div
          ref={convScrollRef}
          className="flex-1 overflow-y-auto px-2 pb-2 space-y-3
                     [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {filteredConversations.length === 0 && (
            <div className="px-2 py-6 text-center text-ghost-text-dim text-xs">
              {sidebarSearch ? 'No matching chats.' : 'No conversations yet. Start one below.'}
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
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-ghost-border/70 flex-shrink-0 bg-ghost-surface/65 backdrop-blur-xl">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors flex-shrink-0"
              title={sidebarOpen ? 'Hide sidebar (⌘⇧S)' : 'Show sidebar (⌘⇧S)'}
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
                {activeModel && isVisionModel(activeModel) && (
                  <>
                    <span>·</span>
                    <span className="text-blue-400">👁️ Vision</span>
                  </>
                )}
                {showTokenCount && (
                  <>
                    <span>·</span>
                    <span>{formatTokenCount(totalTokenCount)} tokens total</span>
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

            {/* Export dropdown */}
            {messages.length > 0 && (
              <div className="relative group">
                <button
                  className="p-1.5 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors"
                  title="Export chat (⌘⇧E)"
                >
                  <Download size={13} />
                </button>
                <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-ghost-surface border border-ghost-border rounded-lg shadow-xl overflow-hidden min-w-[160px] z-20">
                  <button
                    onClick={exportChat}
                    className="w-full px-3 py-2 text-xs text-ghost-text hover:bg-ghost-surface-2 text-left flex items-center gap-2"
                  >
                    <FileText size={12} />
                    Export as JSON
                  </button>
                  <button
                    onClick={exportChatAsMarkdown}
                    className="w-full px-3 py-2 text-xs text-ghost-text hover:bg-ghost-surface-2 text-left flex items-center gap-2 border-t border-ghost-border/50"
                  >
                    <FileText size={12} />
                    Export as Markdown
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={wipeCurrent}
              className="p-1.5 rounded text-ghost-text-dim hover:text-ghost-red hover:bg-ghost-surface-2 transition-colors"
              title="Clear current (⌘⇧⌫)"
            >
              <Trash2 size={13} />
            </button>

            <button
              onClick={() => setShowShortcutsHelp(true)}
              className="p-1.5 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors hidden sm:flex"
              title="Keyboard shortcuts (⌘⇧/)"
            >
              <Keyboard size={13} />
            </button>
          </div>
        </div>

        {/* Settings strip */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-2.5 border-b border-ghost-border/70 bg-black/20 backdrop-blur text-[11px] font-mono flex-shrink-0">
          <Toggle
            on={uncensored}
            onToggle={togglePowerMode}
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

          {/* Model selector - dynamically populated from Ollama */}
          <select
            value={activeModel}
            onChange={e => {
              updateSetting('activeModel', e.target.value)
              updateSetting('autoRoute', false)
              setGlobalActiveModel(e.target.value)
            }}
            className="bg-black/50 border border-ghost-border text-ghost-text text-[11px]
                       rounded-lg px-2 py-1 font-mono focus:outline-none focus:border-ghost-accent
                       max-w-[200px] truncate"
          >
            {modelsLoading ? (
              <option value="" disabled>Loading models...</option>
            ) : modelsError ? (
              <option value="" disabled>⚠️ Error loading models</option>
            ) : installedModels.length === 0 ? (
              <option value="" disabled>No models — open Model Manager</option>
            ) : (
              installedModels.map(model => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))
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

          {/* Character limit button */}
          <button
            onClick={() => setShowCharLimitSettings(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-ghost-border/50 
                       text-[10px] font-mono text-ghost-text-dim hover:text-ghost-text 
                       hover:border-ghost-accent/30 transition-colors"
            title={`Character limit: ${maxInputChars.toLocaleString()}`}
          >
            <Settings size={10} />
            {maxInputChars >= 100000 ? '100K' : 
             maxInputChars >= 10000 ? `${Math.round(maxInputChars/1000)}K` : 
             maxInputChars.toLocaleString()}
          </button>

          {activeModel && (
            <span className="hidden md:flex items-center gap-1 text-[10px] text-ghost-text-dimmer font-mono px-2 py-0.5 rounded-full bg-black/20 border border-ghost-border/50">
              <span>⚡</span>
              {getModelLimits(activeModel).num_predict} tokens
            </span>
          )}

          {hasImages && (
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border
              ${activeModel && isVisionModel(activeModel)
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'}`}
            >
              <Image size={10} />
              {activeModel && isVisionModel(activeModel) ? 'Vision Ready' : 'Switch to Vision Model'}
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

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto
                     [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4 sm:px-6">
              <div className="w-full max-w-[750px] transition-all duration-300">
                <EmptyState
                  onPick={s => setInput(s)}
                  name={profile.name}
                  recent={[...filteredConversations].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4)}
                  onResume={openConversation}
                  hasModels={installedModels.length > 0}
                />
                <div className="mt-6">{composerBody}</div>
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-[900px] px-4 sm:px-6 py-6">
              <div className="space-y-5">
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

                {connectionError && !loading && (
                  <div className="flex justify-center mt-2">
                    <button
                      onClick={retrySend}
                      disabled={isRetrying}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg
                                 border border-ghost-red/30 bg-ghost-red/5
                                 text-ghost-red text-xs font-mono
                                 hover:bg-ghost-red/10 transition-colors
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={12} className={isRetrying ? 'animate-spin' : ''} />
                      {isRetrying ? 'Retrying...' : 'Retry sending'}
                    </button>
                  </div>
                )}
              </div>
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area — only pinned to the bottom once a conversation has started */}
        {messages.length > 0 && (
          <div className="flex-shrink-0 border-t border-ghost-border/70 bg-ghost-surface/45 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="mx-auto w-full max-w-[900px] px-3 sm:px-4 py-3">{composerBody}</div>
          </div>
        )}
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

      {showShortcutsHelp && (
        <KeyboardShortcutsHelp onClose={() => setShowShortcutsHelp(false)} />
      )}

      {showCharLimitSettings && (
        <CharacterLimitSettings
          currentLimit={maxInputChars}
          onSave={(newLimit) => {
            updateSetting('maxInputChars', newLimit)
            setShowCharLimitSettings(false)
            if (input.length > newLimit) {
              const { truncated } = smartTruncate(input, newLimit)
              setInput(truncated)
            }
          }}
          onClose={() => setShowCharLimitSettings(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────────────────────
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
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
const GHOSTSHELL_CHOICE_PROMPTS = [
  'Walk me through a basic Nmap scan and what the flags actually do',
  'Explain the TCP three-way handshake like I need to defend it, not just pass a quiz',
  'What are the most common web app vulnerabilities I should know cold before a pentest?',
  'Give me a realistic privilege escalation scenario on Linux and how to spot the opportunity',
  'Break down how Kerberos authentication works in Active Directory, step by step',
  'What should my home lab look like if I want to practice red team skills safely?',
  'Explain the difference between a vulnerability scan and a real penetration test',
  'What are the biggest rookie mistakes people make when starting in offensive security?',
]

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
  hasModels,
}: {
  onPick: (s: string) => void
  name?: string
  recent: Conversation[]
  onResume: (id: string) => void
  hasModels: boolean
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

        {!hasModels && (
          <div className="w-full max-w-xl mt-4 text-left rounded-2xl border border-ghost-yellow/30 bg-ghost-yellow/5 px-5 py-4 shadow-lg shadow-black/20">
            <div className="flex items-center gap-2 text-ghost-yellow text-sm font-semibold">
              <AlertCircle size={14} />
              No models installed
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ghost-text-dim">
              Open the Model Manager (click the <Cpu size={12} className="inline" /> icon in the sidebar) to pull a model from Ollama.
              You can browse available models at{' '}
              <a 
                href="https://ollama.com/search" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-ghost-accent hover:underline"
              >
                ollama.com/search
              </a>
              .
            </p>
          </div>
        )}

        <div className="flex flex-wrap justify-center gap-2 mt-4">
          {QUICK_ACTIONS.map(({ icon: Icon, label, prompt }) => (
            <button
              key={label}
              onClick={() => onPick(prompt || GHOSTSHELL_CHOICE_PROMPTS[Math.floor(Math.random() * GHOSTSHELL_CHOICE_PROMPTS.length)])}
              disabled={!hasModels}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full
                         border border-ghost-border bg-ghost-surface/70 text-ghost-text-dim
                         hover:border-ghost-accent/60 hover:text-ghost-text hover:bg-ghost-surface-2
                         hover:shadow-md hover:shadow-ghost-accent/10 hover:-translate-y-0.5
                         transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
                         disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 text-[10px] text-ghost-text-dimmer font-mono flex items-center gap-1">
          <Keyboard size={10} />
          <span>Press <kbd className="px-1 py-0.5 rounded border border-ghost-border bg-black/20">⌘</kbd>+<kbd className="px-1 py-0.5 rounded border border-ghost-border bg-black/20">⇧</kbd>+<kbd className="px-1 py-0.5 rounded border border-ghost-border bg-black/20">/</kbd> for shortcuts</span>
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
// Customize modal
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
// Memory panel
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
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-ghost-text-dimmer font-mono">
              {entries.length} entries
            </span>
            <button onClick={onClose} className="p-1 rounded text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2">
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-ghost-border/50 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-ghost-text font-medium">Remember conversations</div>
            <div className="text-[11px] text-ghost-text-dim mt-0.5 leading-relaxed">
              Saves a short summary locally — on this device only — whenever a chat is deleted, wiped, or you start
              a new one. Ephemeral chats are never remembered. Old memories are automatically pruned after {MAX_MEMORY_AGE_DAYS} days.
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
                    <span className="ml-2">({e.messageCount} messages)</span>
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
          <div className="px-4 py-3 border-t border-ghost-border/50 flex gap-2">
            <button
              onClick={onClearAll}
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Clear all memory
            </button>
            <button
              onClick={onClose}
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-ghost-border text-ghost-text-dim hover:text-ghost-text transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}