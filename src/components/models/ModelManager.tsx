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
  Inbox,
  ChevronRight,
  ExternalLink,
  BookOpen,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  RotateCw,
  Grid,
  List,
  Zap,
  AlertTriangle,
  Info,
  Settings,
  Square,
  MemoryStick,
  Gauge,
} from 'lucide-react'
import { OLLAMA_HOST } from '../../lib/ollama'

const OLLAMA_REGISTRY_URL = 'https://ollama.ai/library'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type OllamaModel = {
  name: string
  size: number
  digest: string
  modified_at: string
  details?: {
    family?: string
    parameter_size?: string
    quantization_level?: string
    size_vram?: number
  }
}

type ModelLimits = {
  num_predict: number
  num_ctx: number
  max_messages: number
  num_gpu?: number
  num_thread?: number
}

type ModelCategory = 'coding' | 'reasoning' | 'vision' | 'general' | 'small' | 'specialized' | 'embedding' | 'notes'

type RecommendedModel = {
  name: string
  description: string
  category: ModelCategory
  size: string
  pullHint: string
  recommendedLimits?: ModelLimits
  isFeatured?: boolean
  tags?: string[]
  minVram?: number
  maxContext?: number
  speed?: 'fast' | 'medium' | 'slow'
  gpuRequired?: boolean
}

type PullProgress = {
  status: string
  digest?: string
  total?: number
  completed?: number
  percent?: number
  speed?: number
  eta?: number
  elapsed?: number
  downloadedMB?: number
  totalMB?: number
  layerProgress?: {
    current: number
    total: number
    name: string
  }
}

type ModelHealth = {
  status: 'healthy' | 'slow' | 'error' | 'unknown'
  responseTime?: number
  lastChecked?: Date
  error?: string
  gpuInfo?: {
    deviceCount: number
    devices: string[]
    memoryUsage: number[]
  }
}

type GPUInfo = {
  available: boolean
  deviceCount: number
  devices: {
    name: string
    memoryTotal: number   // in MB
    memoryUsed: number    // in MB
    memoryFree: number    // in MB
    utilization: number
    temperature?: number
  }[]
  driverVersion?: string
  cudaVersion?: string
}

type OllamaVersionInfo = {
  version: string
  apiVersion: string
  minSupportedVersion: string
  features: {
    multiGPU: boolean
    quantization: boolean
    vision: boolean
    embedding: boolean
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// System Resource Types
// ─────────────────────────────────────────────────────────────────────────────

type SystemResources = {
  ram: {
    total: number
    used: number
    free: number
    available: number
    usedPercent: number
  }
  cpu: {
    cores: number
    model: string
    architecture: string
    speed: number
    usagePercent: number
  }
  disk: {
    total: number
    used: number
    free: number
    usedPercent: number
  }
  os: {
    platform: string
    release: string
    arch: string
    hostname: string
  }
  gpu?: {
    name: string
    memory: number
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const USER_LIMITS_L_TAGS_KEY = 'obscurum-model-user-limits'
const VIEW_PREFERENCE_KEY = 'obscurum-model-view-preference'
const GPU_PREFERENCE_KEY = 'obscurum-gpu-preference'
const OLLAMA_VERSION_KEY = 'obscurum-ollama-version'

const DEFAULT_LIMITS: Record<string, ModelLimits> = {
  'minimax-m3': { num_predict: 4000, num_ctx: 30720, max_messages: 35, num_gpu: -1, num_thread: 0 },
  'qwen2.5-coder': { num_predict: 4000, num_ctx: 30720, max_messages: 30, num_gpu: -1, num_thread: 0 },
  'gpt-oss': { num_predict: 4000, num_ctx: 30720, max_messages: 20, num_gpu: -1, num_thread: 0 },
  'qwen2.5vl': { num_predict: 4000, num_ctx: 30720, max_messages: 15, num_gpu: -1, num_thread: 0 },
  'llama3.2': { num_predict: 4000, num_ctx: 8192, max_messages: 25, num_gpu: -1, num_thread: 0 },
  'mistral': { num_predict: 4000, num_ctx: 8192, max_messages: 25, num_gpu: -1, num_thread: 0 },
  'phi': { num_predict: 2000, num_ctx: 4096, max_messages: 15, num_gpu: -1, num_thread: 0 },
  _default: { num_predict: 4000, num_ctx: 30720, max_messages: 25, num_gpu: -1, num_thread: 0 },
}

const MIN_OLLAMA_VERSION = '0.1.30'

const TAG_FILTERS = ['latest', 'q4_K_M', 'q5_K_M', 'q8_0', 'general'] as const
type TagFilter = (typeof TAG_FILTERS)[number]

const RECOMMENDED: RecommendedModel[] = [
  {
    name: 'minimax-m3',
    description: 'Primary coder — concise, follows instructions, handles payloads and exploit work.',
    category: 'coding',
    size: '~12 GB',
    pullHint: 'minimax-m3',
    recommendedLimits: DEFAULT_LIMITS['minimax-m3'],
    isFeatured: true,
    tags: ['coder', 'fast', 'exploit'],
    minVram: 8,
    maxContext: 30720,
    speed: 'fast',
  },
  {
    name: 'qwen2.5-coder:7b',
    description: 'Reliable offline coder — solid for short scripts and write-up help when Ollama is offline.',
    category: 'coding',
    size: '~4.7 GB',
    pullHint: 'qwen2.5-coder:7b',
    recommendedLimits: DEFAULT_LIMITS['qwen2.5-coder'],
    tags: ['coder', 'lightweight', 'offline'],
    minVram: 4,
    maxContext: 30720,
    speed: 'fast',
  },
  {
    name: 'gpt-oss:20b',
    description: 'Reasoner — multi-step analysis, CVE breakdowns, post-exploit methodology.',
    category: 'reasoning',
    size: '~14 GB',
    pullHint: 'gpt-oss:20b',
    recommendedLimits: DEFAULT_LIMITS['gpt-oss'],
    tags: ['reasoner', 'analysis', 'deep'],
    minVram: 12,
    maxContext: 30720,
    speed: 'medium',
  },
  {
    name: 'qwen2.5vl:3b',
    description: 'Vision — reads screenshots, OCR, image-based payloads.',
    category: 'vision',
    size: '~2.1 GB',
    pullHint: 'qwen2.5vl:3b',
    recommendedLimits: DEFAULT_LIMITS['qwen2.5vl'],
    tags: ['vision', 'multimodal', 'lightweight'],
    minVram: 2,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'llama3.2:3b',
    description: 'Lightweight general purpose — good for quick answers and simple tasks.',
    category: 'general',
    size: '~2.3 GB',
    pullHint: 'llama3.2:3b',
    tags: ['general', 'lightweight', 'fast'],
    minVram: 2,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'deepseek-r1:7b',
    description: 'Advanced reasoning — long-form analysis, complex problem solving.',
    category: 'reasoning',
    size: '~4.7 GB',
    pullHint: 'deepseek-r1:7b',
    tags: ['reasoner', 'deep', 'analysis'],
    minVram: 4,
    maxContext: 16384,
    speed: 'medium',
  },
  {
    name: 'minimax-m3',
    description: 'Primary coder — concise, follows instructions, handles payloads and exploit work.',
    category: 'coding',
    size: '~12 GB',
    pullHint: 'minimax-m3',
    recommendedLimits: DEFAULT_LIMITS['minimax-m3'],
    isFeatured: true,
    tags: ['coder', 'fast', 'exploit'],
    minVram: 8,
    maxContext: 30720,
    speed: 'fast',
  },
  {
    name: 'qwen2.5-coder:7b',
    description: 'Reliable offline coder — solid for short scripts and write-up help when Ollama is offline.',
    category: 'coding',
    size: '~4.7 GB',
    pullHint: 'qwen2.5-coder:7b',
    recommendedLimits: DEFAULT_LIMITS['qwen2.5-coder'],
    tags: ['coder', 'lightweight', 'offline'],
    minVram: 4,
    maxContext: 30720,
    speed: 'fast',
  },
  {
    name: 'gpt-oss:20b',
    description: 'Reasoner — multi-step analysis, CVE breakdowns, post-exploit methodology.',
    category: 'reasoning',
    size: '~14 GB',
    pullHint: 'gpt-oss:20b',
    recommendedLimits: DEFAULT_LIMITS['gpt-oss'],
    tags: ['reasoner', 'analysis', 'deep'],
    minVram: 12,
    maxContext: 30720,
    speed: 'medium',
  },
  {
    name: 'qwen2.5vl:3b',
    description: 'Vision — reads screenshots, OCR, image-based payloads.',
    category: 'vision',
    size: '~2.1 GB',
    pullHint: 'qwen2.5vl:3b',
    recommendedLimits: DEFAULT_LIMITS['qwen2.5vl'],
    tags: ['vision', 'multimodal', 'lightweight'],
    minVram: 2,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'llama3.2:3b',
    description: 'Lightweight general purpose — good for quick answers and simple tasks.',
    category: 'general',
    size: '~2.3 GB',
    pullHint: 'llama3.2:3b',
    tags: ['general', 'lightweight', 'fast'],
    minVram: 2,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'deepseek-r1:7b',
    description: 'Advanced reasoning — long-form analysis, complex problem solving.',
    category: 'reasoning',
    size: '~4.7 GB',
    pullHint: 'deepseek-r1:7b',
    tags: ['reasoner', 'deep', 'analysis'],
    minVram: 4,
    maxContext: 16384,
    speed: 'medium',
  },

  // ─── UNCENSORED MODELS ───

  {
    name: 'dolphin-mistral:7b',
    description: 'Uncensored Mistral-based model — no alignment filtering. Great for red team research, payload generation, and adversarial testing.',
    category: 'specialized',
    size: '~4.1 GB',
    pullHint: 'dolphin-mistral:7b',
    isFeatured: true,
    tags: ['uncensored', 'redteam', 'adversarial'],
    minVram: 4,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'dolphin-mixtral:8x7b',
    description: 'Mixture of Experts uncensored model — powerful reasoning with no alignment restrictions.',
    category: 'specialized',
    size: '~32 GB',
    pullHint: 'dolphin-mixtral:8x7b',
    tags: ['uncensored', 'mixtral', 'powerful'],
    minVram: 24,
    maxContext: 32768,
    speed: 'slow',
    gpuRequired: true,
  },
  {
    name: 'dolphin-llama3:8b',
    description: 'Llama 3-based uncensored model — excellent for penetration testing methodology and exploit research.',
    category: 'specialized',
    size: '~4.7 GB',
    pullHint: 'dolphin-llama3:8b',
    tags: ['uncensored', 'llama3', 'pentesting'],
    minVram: 4,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'dolphin-phi:2.7b',
    description: 'Lightweight uncensored model — minimal system requirements for red team operations.',
    category: 'small',
    size: '~1.6 GB',
    pullHint: 'dolphin-phi:2.7b',
    tags: ['uncensored', 'lightweight', 'redteam'],
    minVram: 2,
    maxContext: 4096,
    speed: 'fast',
  },
  {
    name: 'wizard-vicuna-uncensored:7b',
    description: 'Vicuna-based uncensored model — good for general adversarial testing and roleplay scenarios.',
    category: 'specialized',
    size: '~3.8 GB',
    pullHint: 'wizard-vicuna-uncensored:7b',
    tags: ['uncensored', 'vicuna', 'adversarial'],
    minVram: 4,
    maxContext: 4096,
    speed: 'fast',
  },
  {
    name: 'wizard-vicuna-uncensored:13b',
    description: 'Larger Vicuna uncensored model — better reasoning for complex adversarial scenarios.',
    category: 'specialized',
    size: '~7.3 GB',
    pullHint: 'wizard-vicuna-uncensored:13b',
    tags: ['uncensored', 'vicuna', 'reasoning'],
    minVram: 8,
    maxContext: 4096,
    speed: 'medium',
  },
  {
    name: 'mistral-7b-uncensored',
    description: 'Base Mistral 7B with alignment removed — direct access to raw model outputs.',
    category: 'general',
    size: '~4.1 GB',
    pullHint: 'mistral-7b-uncensored',
    tags: ['uncensored', 'mistral', 'raw'],
    minVram: 4,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'llama2-uncensored:7b',
    description: 'Llama 2 7B uncensored — foundational model for jailbreak and red team research.',
    category: 'general',
    size: '~3.8 GB',
    pullHint: 'llama2-uncensored:7b',
    tags: ['uncensored', 'llama2', 'foundational'],
    minVram: 4,
    maxContext: 4096,
    speed: 'fast',
  },
  {
    name: 'llama2-uncensored:13b',
    description: 'Llama 2 13B uncensored — more capable for complex attack path analysis.',
    category: 'reasoning',
    size: '~7.3 GB',
    pullHint: 'llama2-uncensored:13b',
    tags: ['uncensored', 'llama2', 'reasoning'],
    minVram: 8,
    maxContext: 4096,
    speed: 'medium',
  },
  {
    name: 'nous-hermes:mixtral-8x7b',
    description: 'Nous Research Hermes on Mixtral — highly capable uncensored model for security research.',
    category: 'reasoning',
    size: '~32 GB',
    pullHint: 'nous-hermes:mixtral-8x7b',
    tags: ['uncensored', 'mixtral', 'research'],
    minVram: 24,
    maxContext: 32768,
    speed: 'slow',
    gpuRequired: true,
  },
  {
    name: 'nous-hermes:llama3-8b',
    description: 'Nous Research Hermes on Llama 3 — uncensored model with strong instruction following.',
    category: 'coding',
    size: '~4.7 GB',
    pullHint: 'nous-hermes:llama3-8b',
    tags: ['uncensored', 'llama3', 'instruction'],
    minVram: 4,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'nous-hermes:llama3-70b',
    description: 'Massive uncensored model — exceptional reasoning but requires serious hardware.',
    category: 'reasoning',
    size: '~40 GB',
    pullHint: 'nous-hermes:llama3-70b',
    tags: ['uncensored', 'llama3', 'massive'],
    minVram: 48,
    maxContext: 8192,
    speed: 'slow',
    gpuRequired: true,
  },
  {
    name: 'samantha-mistral:7b',
    description: 'Mistral-based uncensored model optimized for empathy and social engineering scenarios.',
    category: 'specialized',
    size: '~4.1 GB',
    pullHint: 'samantha-mistral:7b',
    tags: ['uncensored', 'social', 'empathy'],
    minVram: 4,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'airoboros-mistral:7b',
    description: 'Airoboros uncensored model — strong reasoning for CTF and hacking challenges.',
    category: 'coding',
    size: '~4.1 GB',
    pullHint: 'airoboros-mistral:7b',
    tags: ['uncensored', 'ctf', 'reasoning'],
    minVram: 4,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'openhermes-mistral:7b',
    description: 'Open Hermes on Mistral — high quality uncensored outputs for adversarial testing.',
    category: 'general',
    size: '~4.1 GB',
    pullHint: 'openhermes-mistral:7b',
    tags: ['uncensored', 'hermes', 'adversarial'],
    minVram: 4,
    maxContext: 8192,
    speed: 'fast',
  },
  {
    name: 'zephyr-uncensored:7b',
    description: 'Zephyr-based uncensored model — clean outputs for methodology and write-ups.',
    category: 'notes',
    size: '~4.1 GB',
    pullHint: 'zephyr-uncensored:7b',
    tags: ['uncensored', 'zephyr', 'methodology'],
    minVram: 4,
    maxContext: 8192,
    speed: 'fast',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Cross-component bridge
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_MODEL_KEY = 'obscurum-active-model'
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

export function getModelLimits(name: string): ModelLimits {
  const base = (DEFAULT_LIMITS[name] ?? DEFAULT_LIMITS._default) as ModelLimits
  let user: Partial<ModelLimits> = {}
  try {
    const raw = localStorage.getItem(USER_LIMITS_L_TAGS_KEY)
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
    num_gpu: user.num_gpu ?? base.num_gpu ?? -1,
    num_thread: user.num_thread ?? base.num_thread ?? 0,
  }
}

function setModelLimits(name: string, limits: ModelLimits) {
  try {
    const raw = localStorage.getItem(USER_LIMITS_L_TAGS_KEY)
    const all: Record<string, ModelLimits> = raw ? JSON.parse(raw) : {}
    all[name] = limits
    localStorage.setItem(USER_LIMITS_L_TAGS_KEY, JSON.stringify(all))
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
// System Resource Detection
// ─────────────────────────────────────────────────────────────────────────────

async function detectSystemResources(): Promise<SystemResources> {
  // Try Electron's systeminformation first (most accurate)
  try {
    if (window.obscurum?.getSystemInfo) {
      const sysInfo = await window.obscurum.getSystemInfo()
      if (sysInfo) {
        return {
          ram: {
            total: sysInfo.ram.total || 0,
            used: sysInfo.ram.used || 0,
            free: sysInfo.ram.free || 0,
            available: sysInfo.ram.available || 0,
            usedPercent: sysInfo.ram.total > 0 ? (sysInfo.ram.used / sysInfo.ram.total) * 100 : 0,
          },
          cpu: {
            cores: sysInfo.cpu.cores || navigator.hardwareConcurrency || 4,
            model: sysInfo.cpu.model || 'Unknown CPU',
            architecture: sysInfo.cpu.architecture || navigator.platform || 'Unknown',
            speed: sysInfo.cpu.speed || 0,
            usagePercent: sysInfo.cpu.usagePercent || 0,
          },
          disk: {
            total: sysInfo.disk.total || 0,
            used: sysInfo.disk.used || 0,
            free: sysInfo.disk.free || 0,
            usedPercent: sysInfo.disk.total > 0 ? (sysInfo.disk.used / sysInfo.disk.total) * 100 : 0,
          },
          os: {
            platform: sysInfo.os.platform || navigator.platform || 'Unknown',
            release: sysInfo.os.release || 'Unknown',
            arch: sysInfo.os.arch || navigator.platform || 'Unknown',
            hostname: sysInfo.os.hostname || 'localhost',
          },
          gpu: sysInfo.gpu ? {
            name: sysInfo.gpu.name || 'Unknown GPU',
            memory: sysInfo.gpu.memory || 0,
          } : undefined,
        }
      }
    }
  } catch {
    // Fall through to browser detection
  }

  // Browser-based detection (limited fallback)
  const ram = await detectRAMBrowser()
  const cpu = await detectCPUBrowser()
  const disk = await detectDiskBrowser()
  const os = await detectOSBrowser()

  return {
    ram,
    cpu,
    disk,
    os,
  }
}

// Browser-based RAM detection (fallback)
async function detectRAMBrowser(): Promise<SystemResources['ram']> {
  try {
    if ('deviceMemory' in navigator) {
      const total = (navigator as any).deviceMemory || 0
      if (total > 0) {
        let used = 0
        if ('memory' in performance && (performance as any).memory) {
          const memory = (performance as any).memory
          const heapUsed = memory.usedJSHeapSize / 1024 / 1024 / 1024
          used = Math.min(total, heapUsed * 1.5 + 0.5)
        } else {
          used = total * 0.4
        }
        const free = Math.max(0, total - used)
        return {
          total,
          used,
          free,
          available: free,
          usedPercent: (used / total) * 100,
        }
      }
    }
  } catch {
    // Ignore
  }

  try {
    if ('memory' in performance && (performance as any).memory) {
      const memory = (performance as any).memory
      const used = memory.usedJSHeapSize / 1024 / 1024 / 1024
      const total = memory.jsHeapSizeLimit / 1024 / 1024 / 1024
      return {
        total: Math.max(total, 4),
        used,
        free: Math.max(0, total - used),
        available: Math.max(0, total - used),
        usedPercent: total > 0 ? (used / total) * 100 : 0,
      }
    }
  } catch {
    // Ignore
  }

  return {
    total: 4,
    used: 1.6,
    free: 2.4,
    available: 2.4,
    usedPercent: 40,
  }
}

// Browser-based CPU detection (fallback)
async function detectCPUBrowser(): Promise<SystemResources['cpu']> {
  const cores = navigator.hardwareConcurrency || 4
  const architecture = navigator.platform || 'Unknown'
  
  let model = 'Unknown CPU'
  const ua = navigator.userAgent
  
  if (ua.includes('Macintosh') && ua.includes('ARM')) {
    model = 'Apple M-Series'
  } else if (ua.includes('Macintosh')) {
    model = 'Intel Mac'
  } else if (ua.includes('Windows NT 10.0') && ua.includes('WOW64')) {
    model = '64-bit Windows PC'
  } else if (ua.includes('Windows')) {
    model = 'Windows PC'
  } else if (ua.includes('Linux') && ua.includes('Android')) {
    model = 'Android ARM'
  } else if (ua.includes('Linux')) {
    model = 'Linux PC'
  }

  return {
    cores,
    model,
    architecture,
    speed: 0,
    usagePercent: 0,
  }
}

// Browser-based disk detection (fallback)
async function detectDiskBrowser(): Promise<SystemResources['disk']> {
  try {
    if ('storage' in navigator && 'estimate' in (navigator as any).storage) {
      const estimate = await (navigator as any).storage.estimate()
      const total = estimate.quota / 1024 / 1024 / 1024
      const used = estimate.usage / 1024 / 1024 / 1024
      return {
        total: Math.max(total, 50),
        used: Math.min(used, total),
        free: Math.max(0, total - used),
        usedPercent: total > 0 ? (used / total) * 100 : 0,
      }
    }
  } catch {
    // Ignore
  }

  return {
    total: 100,
    used: 40,
    free: 60,
    usedPercent: 40,
  }
}

// Browser-based OS detection (fallback)
async function detectOSBrowser(): Promise<SystemResources['os']> {
  const platform = navigator.platform || 'Unknown'
  const userAgent = navigator.userAgent
  let release = 'Unknown'

  if (userAgent.includes('Windows NT 10.0')) release = 'Windows 10/11'
  else if (userAgent.includes('Windows NT 6.3')) release = 'Windows 8.1'
  else if (userAgent.includes('Windows NT 6.2')) release = 'Windows 8'
  else if (userAgent.includes('Windows NT 6.1')) release = 'Windows 7'
  else if (userAgent.includes('Mac OS X 10_15')) release = 'macOS Catalina'
  else if (userAgent.includes('Mac OS X 11_')) release = 'macOS Big Sur'
  else if (userAgent.includes('Mac OS X 12_')) release = 'macOS Monterey'
  else if (userAgent.includes('Mac OS X 13_')) release = 'macOS Ventura'
  else if (userAgent.includes('Mac OS X 14_')) release = 'macOS Sonoma'
  else if (userAgent.includes('Linux') && !userAgent.includes('Android')) release = 'Linux'
  else if (userAgent.includes('Android')) release = 'Android'
  else if (userAgent.includes('iPhone')) release = 'iOS'
  else if (userAgent.includes('iPad')) release = 'iPadOS'

  return {
    platform,
    release,
    arch: navigator.platform || 'Unknown',
    hostname: window.location.hostname || 'localhost',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GPU Detection - IMPROVED
// ─────────────────────────────────────────────────────────────────────────────

async function detectGPU(): Promise<GPUInfo> {
  // First try: Ollama's GPU endpoint (most accurate)
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/gpu`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
    })
    
    if (response.ok) {
      const data = await response.json()
      // Parse Ollama's GPU response format
      // Ollama returns: { gpus: [{ id, name, memory_total, memory_free, ... }] }
      const gpus = data.gpus || data.devices || []
      
      if (gpus.length > 0) {
        return {
          available: true,
          deviceCount: gpus.length,
          devices: gpus.map((d: any) => ({
            name: d.name || d.model || d.gpu_name || 'Unknown GPU',
            memoryTotal: (d.memory_total || d.vram || d.memory || 0) / (1024 * 1024),
            memoryUsed: (d.memory_used || d.used_memory || 0) / (1024 * 1024),
            memoryFree: (d.memory_free || d.free_memory || 0) / (1024 * 1024),
            utilization: d.utilization || d.gpu_util || 0,
            temperature: d.temperature || d.temp || undefined,
          })),
          driverVersion: data.driver_version || data.driver,
          cudaVersion: data.cuda_version || data.cuda,
        }
      }
    }
  } catch (err) {
    console.debug('[GPU] Ollama GPU endpoint unavailable, falling back:', err)
  }

  // Second try: Electron's systeminformation (via main process)
  try {
    if (window.obscurum?.getSystemInfo) {
      const sysInfo = await window.obscurum.getSystemInfo()
      if (sysInfo?.gpu) {
        const memoryMB = sysInfo.gpu.memory || 0
        return {
          available: true,
          deviceCount: 1,
          devices: [{
            name: sysInfo.gpu.name || 'Detected GPU',
            memoryTotal: memoryMB,
            memoryUsed: 0,
            memoryFree: memoryMB,
            utilization: 0,
          }],
          driverVersion: sysInfo.gpu.driver || undefined,
        }
      }
    }
  } catch (err) {
    console.debug('[GPU] System info fallback unavailable:', err)
  }

  // Third try: Browser's WebGPU API
  try {
    if ('gpu' in navigator) {
      const adapter = await (navigator as any).gpu.requestAdapter()
      if (adapter) {
        const name = adapter.name || 'WebGPU Device'
        let memoryTotal = 0
        if (adapter.info && adapter.info.memory) {
          memoryTotal = adapter.info.memory / (1024 * 1024)
        }
        return {
          available: true,
          deviceCount: 1,
          devices: [{
            name,
            memoryTotal: memoryTotal || 0,
            memoryUsed: 0,
            memoryFree: memoryTotal || 0,
            utilization: 0,
          }],
        }
      }
    }
  } catch (err) {
    console.debug('[GPU] WebGPU detection unavailable:', err)
  }

  // Fourth try: Platform-specific fallback
  const isMac = navigator.platform.includes('Mac')
  const isWindows = navigator.platform.includes('Win')
  
  if (isMac) {
    return {
      available: true,
      deviceCount: 1,
      devices: [{
        name: 'Apple M-Series GPU',
        memoryTotal: 0,
        memoryUsed: 0,
        memoryFree: 0,
        utilization: 0,
      }],
    }
  }
  
  if (isWindows) {
    const ua = navigator.userAgent
    if (ua.includes('NVIDIA') || ua.includes('GeForce')) {
      return {
        available: true,
        deviceCount: 1,
        devices: [{
          name: 'NVIDIA GPU',
          memoryTotal: 0,
          memoryUsed: 0,
          memoryFree: 0,
          utilization: 0,
        }],
      }
    }
    if (ua.includes('Radeon') || ua.includes('AMD')) {
      return {
        available: true,
        deviceCount: 1,
        devices: [{
          name: 'AMD GPU',
          memoryTotal: 0,
          memoryUsed: 0,
          memoryFree: 0,
          utilization: 0,
        }],
      }
    }
  }

  return {
    available: false,
    deviceCount: 0,
    devices: [],
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Ollama Version Detection
// ─────────────────────────────────────────────────────────────────────────────

async function detectOllamaVersion(): Promise<OllamaVersionInfo> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/version`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const data = await response.json()
    const version = data.version || '0.0.0'
    
    const [major, minor, patch] = version.split('.').map(Number)
    const isMultiGPU = major > 0 || minor > 1 || (minor === 1 && patch >= 30)
    const isQuantization = major > 0 || minor > 1 || (minor === 1 && patch >= 20)
    const isVision = major > 0 || minor > 1 || (minor === 1 && patch >= 20)
    const isEmbedding = major > 0 || minor > 1 || (minor === 1 && patch >= 20)
    
    return {
      version,
      apiVersion: data.api_version || version,
      minSupportedVersion: MIN_OLLAMA_VERSION,
      features: {
        multiGPU: isMultiGPU,
        quantization: isQuantization,
        vision: isVision,
        embedding: isEmbedding,
      },
    }
  } catch {
    return {
      version: '0.0.0',
      apiVersion: '0.0.0',
      minSupportedVersion: MIN_OLLAMA_VERSION,
      features: {
        multiGPU: false,
        quantization: false,
        vision: false,
        embedding: false,
      },
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced Model Health with GPU Info
// ─────────────────────────────────────────────────────────────────────────────

async function checkModelHealth(name: string, gpuInfo?: GPUInfo): Promise<ModelHealth> {
  const start = Date.now()
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: name,
        prompt: 'Hello',
        stream: false,
        options: { 
          num_predict: 5,
          num_gpu: -1,
        },
      }),
    })
    
    if (!response.ok) {
      return { status: 'error', error: `HTTP ${response.status}` }
    }
    
    const responseTime = Date.now() - start
    
    let gpuHealth = undefined
    if (gpuInfo?.available) {
      gpuHealth = {
        deviceCount: gpuInfo.deviceCount,
        devices: gpuInfo.devices.map(d => d.name),
        memoryUsage: gpuInfo.devices.map(d => d.memoryUsed),
      }
    }
    
    return {
      status: responseTime < 2000 ? 'healthy' : 'slow',
      responseTime,
      lastChecked: new Date(),
      gpuInfo: gpuHealth,
    }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
      lastChecked: new Date(),
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-GPU Model Loading
// ─────────────────────────────────────────────────────────────────────────────

async function loadModelOnGPU(
  name: string, 
  _gpuDevices: number[] = [-1],
  options?: {
    num_gpu?: number
    num_thread?: number
  }
): Promise<{ success: boolean; error?: string; deviceMap?: number[] }> {
  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: name,
        prompt: ' ',
        stream: false,
        options: {
          num_gpu: options?.num_gpu ?? -1,
          num_thread: options?.num_thread ?? 0,
        },
      }),
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ModelManager() {
  const [models, setModels] = useState<OllamaModel[]>([])
  const [loading, setLoading] = useState(false)
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullStatus, setPullStatus] = useState<PullProgress | null>(null)
  const [pullAbortController, setPullAbortController] = useState<AbortController | null>(null)
  const [showCustomPull, setShowCustomPull] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterTag] = useState<TagFilter | 'all'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified' | 'category' | 'health'>('name')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeModel, setActiveModelState] = useState<string>(getActiveModel)
  const [limitsTick, setLimitsTick] = useState(0)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [view, setView] = useState<'installed' | 'recommendations' | 'stats'>('installed')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<ModelCategory[]>([])
  const [healthStatus, setHealthStatus] = useState<Record<string, ModelHealth>>({})
  const [checkingHealth, setCheckingHealth] = useState(false)
  
  const [gpuInfo, setGpuInfo] = useState<GPUInfo | null>(null)
  const [ollamaVersion, setOllamaVersion] = useState<OllamaVersionInfo | null>(null)
  const [loadingHardware, setLoadingHardware] = useState(true)
  
  const [systemResources, setSystemResources] = useState<SystemResources | null>(null)
  const [loadingResources, setLoadingResources] = useState(true)
  
  const [gpuPreference] = useState<{ useGPU: boolean; deviceIds: number[] }>(() => {
    try {
      const raw = localStorage.getItem(GPU_PREFERENCE_KEY)
      if (raw) {
        return JSON.parse(raw)
      }
    } catch { /* ignore */ }
    return { useGPU: true, deviceIds: [-1] }
  })

  const userLimits = useMemo(() => {
    try {
      const raw = localStorage.getItem(USER_LIMITS_L_TAGS_KEY)
      return raw ? (JSON.parse(raw) as Record<string, ModelLimits>) : {}
    } catch {
      return {}
    }
  }, [limitsTick])

  // Load view preference
  useEffect(() => {
    try {
      const pref = localStorage.getItem(VIEW_PREFERENCE_KEY)
      if (pref === 'grid' || pref === 'list') {
        setViewMode(pref as 'grid' | 'list')
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_PREFERENCE_KEY, viewMode)
    } catch { /* ignore */ }
  }, [viewMode])

  // ─────────────────────────────────────────────────────────────────────────
  // Detect hardware on mount
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function detectHardware() {
      setLoadingHardware(true)
      setLoadingResources(true)
      try {
        const [gpu, version, resources] = await Promise.all([
          detectGPU(),
          detectOllamaVersion(),
          detectSystemResources(),
        ])
        setGpuInfo(gpu)
        setOllamaVersion(version)
        setSystemResources(resources)
        localStorage.setItem(OLLAMA_VERSION_KEY, version.version)
      } catch (err) {
        console.error('Failed to detect hardware:', err)
      } finally {
        setLoadingHardware(false)
        setLoadingResources(false)
      }
    }
    detectHardware()
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch models 
  // ─────────────────────────────────────────────────────────────────────────

  const fetchModels = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await window.obscurum?.ollamaRequest?.('/api/tags', 'GET')
      
      // Log the raw response for debugging
      
      if (!response) {
        throw new Error('No response from Ollama')
      }
      
      // Handle different response formats
      let models: OllamaModel[] = []
      const responseAny = response as any
      const data = responseAny.data
      
      // Case 1: Response has { status, data } format
      if (typeof responseAny.status !== 'undefined' && typeof data !== 'undefined') {
        if (responseAny.status >= 400) {
          throw new Error(`HTTP ${responseAny.status}: ${data?.error || 'Unknown error'}`)
        }
        // Check if data.models exists
        if (data?.models && Array.isArray(data.models)) {
          models = data.models
        } else if (Array.isArray(data)) {
          models = data
        } else if (data && typeof data === 'object') {
          // Try to find models array in the response
          const dataObj = data as any
          if (dataObj.models && Array.isArray(dataObj.models)) {
            models = dataObj.models
          } else {
            // If it's a direct array or has models property
            models = Array.isArray(dataObj) ? dataObj : []
          }
        }
      } 
      // Case 2: Response is directly the data
      else if (response && typeof response === 'object') {
        const dataObj = response as any
        if (dataObj.models && Array.isArray(dataObj.models)) {
          models = dataObj.models
        } else if (Array.isArray(dataObj)) {
          models = dataObj
        }
      }
      
      // Ensure models is an array
      if (!Array.isArray(models)) {
        console.warn('Models is not an array, got:', models)
        models = []
      }
      
      setModels(models)

      // Set active model if none is set
      const current = getActiveModel()
      if (current && models.length > 0 && !models.some(m => m.name === current)) {
        const firstModel = models[0]?.name
        if (firstModel) {
          setActiveModel(firstModel)
          setActiveModelState(firstModel)
        }
      }

      // Check health for all models
      await checkAllModelHealth(models.map(m => m.name))
    } catch (err) {
      const e = err as Error
      console.error('Fetch models error:', e)
      setError(`Failed to reach Ollama at ${OLLAMA_HOST}: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const checkAllModelHealth = async (modelNames: string[]) => {
    if (modelNames.length === 0) return
    setCheckingHealth(true)
    
    const results: Record<string, ModelHealth> = {}
    for (const name of modelNames) {
      try {
        const health = await checkModelHealth(name, gpuInfo || undefined)
        results[name] = health
      } catch {
        results[name] = { status: 'error', error: 'Check failed' }
      }
    }
    
    setHealthStatus(prev => ({ ...prev, ...results }))
    setCheckingHealth(false)
  }

  useEffect(() => {
    fetchModels()
    const interval = setInterval(() => {
      if (!pulling) fetchModels()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchModels, pulling])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail
      if (typeof detail === 'string') setActiveModelState(detail)
    }
    window.addEventListener('ollama-active-model-changed', handler)
    return () => window.removeEventListener('ollama-active-model-changed', handler)
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // Enhanced Pull with Full Progress Tracking & Cancel Support
  // ─────────────────────────────────────────────────────────────────────────

  const cancelPull = () => {
    if (pullAbortController) {
      pullAbortController.abort()
      setPullStatus({ 
        status: '⏹️ Cancelled by user',
        elapsed: pullStatus?.elapsed || 0,
        downloadedMB: pullStatus?.downloadedMB || 0,
        totalMB: pullStatus?.totalMB || 0,
      })
      setPullAbortController(null)
      setPulling(null)
      setTimeout(() => setPullStatus(null), 3000)
    }
  }

  const pullModel = async (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || /\s/.test(trimmed)) {
      setPullStatus({ status: 'Invalid model name' })
      setTimeout(() => setPullStatus(null), 4000)
      return
    }

    // Check system resources before pulling
    if (systemResources) {
      const modelSizeGB = parseFloat(RECOMMENDED.find(r => r.name === trimmed || trimmed.includes(r.name.split(':')[0]))?.size?.replace(/[^0-9.]/g, '') || '0')
      if (modelSizeGB > 0 && systemResources.disk.free < modelSizeGB * 1.5) {
        setPullStatus({ 
          status: `⚠️ Not enough disk space. Required: ~${modelSizeGB.toFixed(1)}GB, Available: ${systemResources.disk.free.toFixed(1)}GB` 
        })
        setTimeout(() => setPullStatus(null), 5000)
        return
      }
    }

    const recommended = RECOMMENDED.find(r => r.name === trimmed || trimmed.includes(r.name.split(':')[0]))
    if (recommended?.gpuRequired && !gpuInfo?.available) {
      setPullStatus({ status: '⚠️ This model requires a GPU but none was detected' })
      setTimeout(() => setPullStatus(null), 4000)
      return
    }

    // Create abort controller for cancellation
    const abortController = new AbortController()
    setPullAbortController(abortController)

    setPulling(trimmed)
    setPullStatus({ 
      status: 'Starting download...',
      elapsed: 0,
      downloadedMB: 0,
      totalMB: 0,
    })

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

    const startTime = Date.now()
    let lastBytes = 0
    let lastTime = startTime
    let totalDownloadedMB = 0
    let totalSizeMB = 0

    try {
      const response = await fetch(`${OLLAMA_HOST}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, stream: true }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            
            if (data.status) {
              const now = Date.now()
              const elapsed = (now - startTime) / 1000
              
              if (data.completed && data.total) {
                const currentMB = data.completed / 1024 / 1024
                const totalMB = data.total / 1024 / 1024
                totalDownloadedMB = currentMB
                totalSizeMB = totalMB
                
                const deltaBytes = data.completed - lastBytes
                const deltaTime = (now - lastTime) / 1000
                if (deltaTime > 0) {
                  const speedMBps = (deltaBytes / 1024 / 1024) / deltaTime
                  setPullStatus({
                    status: data.status,
                    digest: data.digest,
                    total: data.total,
                    completed: data.completed,
                    percent: (data.completed / data.total) * 100,
                    speed: speedMBps,
                    eta: speedMBps > 0 ? (totalMB - currentMB) / speedMBps : undefined,
                    elapsed,
                    downloadedMB: currentMB,
                    totalMB,
                  })
                  lastBytes = data.completed
                  lastTime = now
                } else {
                  setPullStatus({
                    status: data.status,
                    digest: data.digest,
                    total: data.total,
                    completed: data.completed,
                    percent: (data.completed / data.total) * 100,
                    elapsed,
                    downloadedMB: currentMB,
                    totalMB,
                  })
                }
              } else if (data.status.includes('pulling') || data.status.includes('downloading')) {
                const match = data.status.match(/(\d+)\s*[\/]\s*(\d+)/)
                if (match) {
                  const [_, current, total] = match.map(Number)
                  setPullStatus({
                    status: `Downloading layer ${current}/${total}...`,
                    digest: data.digest,
                    layerProgress: {
                      current,
                      total,
                      name: data.digest || `Layer ${current}/${total}`,
                    },
                    elapsed: (Date.now() - startTime) / 1000,
                  })
                } else {
                  setPullStatus({
                    status: data.status,
                    elapsed: (Date.now() - startTime) / 1000,
                  })
                }
              } else {
                setPullStatus({
                  status: data.status,
                  elapsed: (Date.now() - startTime) / 1000,
                })
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      setPullStatus({ 
        status: '✅ Pull complete!', 
        elapsed: (Date.now() - startTime) / 1000,
        downloadedMB: totalDownloadedMB,
        totalMB: totalSizeMB,
        percent: 100,
      })
      setTimeout(() => setPullStatus(null), 4000)
      
      if (gpuInfo?.available && gpuPreference.useGPU) {
        const gpuResult = await loadModelOnGPU(trimmed, gpuPreference.deviceIds, {
          num_gpu: -1,
          num_thread: Math.max(4, systemResources?.cpu.cores || navigator.hardwareConcurrency || 4),
        })
        if (!gpuResult.success) {
          setPullStatus({ 
            status: `⚠️ Model downloaded but GPU load failed: ${gpuResult.error}`,
            elapsed: (Date.now() - startTime) / 1000,
          })
          setTimeout(() => setPullStatus(null), 6000)
        }
      }
      
      const health = await checkModelHealth(trimmed, gpuInfo || undefined)
      setHealthStatus(prev => ({ ...prev, [trimmed]: health }))
      
      await fetchModels()
    } catch (err: unknown) {
      const e = err as Error
      const isAbort = e.name === 'AbortError' || e.message?.includes('aborted')
      
      if (isAbort) {
        setPullStatus({ 
          status: '⏹️ Download cancelled',
          elapsed: (Date.now() - startTime) / 1000,
          downloadedMB: totalDownloadedMB,
          totalMB: totalSizeMB,
        })
        setTimeout(() => setPullStatus(null), 3000)
        setModels(prev => prev.filter(m => m.name !== trimmed || m.digest !== ''))
      } else {
        setPullStatus({ 
          status: `❌ Pull failed: ${e.message}`,
          elapsed: (Date.now() - startTime) / 1000,
        })
        setTimeout(() => setPullStatus(null), 6000)
        setModels(prev => prev.filter(m => m.name !== trimmed || m.digest !== ''))
      }
    } finally {
      setPulling(null)
      setPullAbortController(null)
    }
  }

  const deleteModel = async (name: string) => {
    if (!confirm(`Delete "${name}" from your local Ollama installation?`)) return

    if (activeModel === name) {
      const fallback = models.find(m => m.name !== name)?.name ?? DEFAULT_ACTIVE_MODEL
      setActiveModel(fallback)
      setActiveModelState(fallback)
    }

    try {
      const { status } = await window.obscurum?.ollamaRequest?.('/api/delete', 'DELETE', { name }) ?? { status: 200 }

      if (status >= 400) {
        throw new Error(`HTTP ${status}`)
      }

      setPullStatus({ status: `Deleted ${name} ✓` })
      setTimeout(() => setPullStatus(null), 3000)
      
      setHealthStatus(prev => {
        const next = { ...prev }
        delete next[name]
        return next
      })
      
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
    if (gpuInfo?.available && gpuPreference.useGPU) {
      loadModelOnGPU(name, gpuPreference.deviceIds, {
        num_gpu: -1,
        num_thread: Math.max(4, systemResources?.cpu.cores || navigator.hardwareConcurrency || 4),
      }).then(result => {
        if (!result.success) {
          setPullStatus({ status: `GPU load failed: ${result.error}` })
          setTimeout(() => setPullStatus(null), 4000)
        }
      })
    }
    
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

  const refreshHealth = async (name: string) => {
    const health = await checkModelHealth(name, gpuInfo || undefined)
    setHealthStatus(prev => ({ ...prev, [name]: health }))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Filtering / sorting
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
    if (name.includes('embed') || name.includes('embedding')) return 'embedding'
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

    if (selectedCategories.length > 0) {
      result = result.filter(m => {
        const cat = getModelCategory(m.name)
        return selectedCategories.includes(cat)
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(m => 
        m.name.toLowerCase().includes(q) ||
        getModelCategory(m.name).toLowerCase().includes(q) ||
        (m.details?.family?.toLowerCase().includes(q) || false)
      )
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
        case 'health': {
          const ha = healthStatus[a.name]?.status || 'unknown'
          const hb = healthStatus[b.name]?.status || 'unknown'
          const order = { healthy: 0, slow: 1, unknown: 2, error: 3 }
          return order[ha] - order[hb]
        }
      }
    })
  }, [models, filterTag, sortBy, searchQuery, selectedCategories, healthStatus])

  const filteredRecommended = useMemo(() => {
    let result = RECOMMENDED
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(r => 
        r.name.toLowerCase().includes(q) || 
        r.description.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.tags?.some(t => t.toLowerCase().includes(q))
      )
    }
    if (selectedCategories.length > 0) {
      result = result.filter(r => selectedCategories.includes(r.category))
    }
    return result
  }, [searchQuery, selectedCategories])

  const stats = useMemo(() => {
    const totalSize = models.reduce((acc, m) => acc + m.size, 0)
    const byCategory: Record<string, number> = {}
    models.forEach(m => {
      const cat = getModelCategory(m.name)
      byCategory[cat] = (byCategory[cat] ?? 0) + 1
    })
    const healthyCount = Object.values(healthStatus).filter(h => h.status === 'healthy').length
    return {
      total: models.length,
      totalSize,
      byCategory,
      activeModel,
      activeInstalled: models.some(m => m.name === activeModel),
      healthy: healthyCount,
      totalHealthChecked: Object.keys(healthStatus).length,
      gpuAvailable: gpuInfo?.available ?? false,
      gpuCount: gpuInfo?.deviceCount ?? 0,
      gpuDevices: gpuInfo?.devices ?? [],
      ollamaVersion: ollamaVersion?.version ?? 'unknown',
      multiGPUSupported: ollamaVersion?.features.multiGPU ?? false,
      ramTotal: systemResources?.ram.total ?? 0,
      ramUsed: systemResources?.ram.used ?? 0,
      ramFree: systemResources?.ram.free ?? 0,
      cpuCores: systemResources?.cpu.cores ?? 0,
      cpuModel: systemResources?.cpu.model ?? 'Unknown',
      diskFree: systemResources?.disk.free ?? 0,
    }
  }, [models, activeModel, healthStatus, gpuInfo, ollamaVersion, systemResources])

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const categories: ModelCategory[] = ['coding', 'reasoning', 'vision', 'general', 'small', 'specialized', 'embedding', 'notes']

  // Helper functions for formatting
  const formatSize = (mb: number): string => {
    if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`
    if (mb > 1) return `${mb.toFixed(1)} MB`
    return `${(mb * 1024).toFixed(0)} KB`
  }

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  const formatSpeed = (mbps: number): string => {
    if (mbps > 1024) return `${(mbps / 1024).toFixed(1)} GB/s`
    if (mbps > 1) return `${mbps.toFixed(1)} MB/s`
    return `${(mbps * 1024).toFixed(0)} KB/s`
  }

  return (
    <div className="flex h-full w-full gap-3 p-3">
      {/* Left rail */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-2">
        <div className="bg-ghost-surface border border-ghost-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold mb-2">
            <Server size={14} className="text-ghost-accent" />
            Foundry
          </div>
          <div className="text-[10px] text-ghost-text-dimmer font-mono mb-2">{OLLAMA_HOST}</div>

          <div className="mb-2 p-1.5 rounded-lg bg-ghost-surface-2/50 border border-ghost-border/50">
            {loadingHardware ? (
              <div className="flex items-center gap-2 text-[10px] text-ghost-text-dimmer">
                <RotateCw size={10} className="animate-spin" />
                Detecting hardware...
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {gpuInfo?.available ? (
                    <div className="flex items-center gap-1">
                      <Zap size={10} className="text-ghost-accent" />
                      <span className="text-[10px] text-ghost-text font-mono">
                        {gpuInfo.deviceCount} GPU{gpuInfo.deviceCount > 1 ? 's' : ''}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <AlertTriangle size={10} className="text-ghost-yellow" />
                      <span className="text-[10px] text-ghost-text-dim">No GPU detected</span>
                    </div>
                  )}
                </div>
                {ollamaVersion && (
                  <span className="text-[9px] text-ghost-text-dimmer font-mono">
                    v{ollamaVersion.version}
                  </span>
                )}
              </div>
            )}
          </div>

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

          <a
            href={OLLAMA_REGISTRY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-1.5 px-2 py-1.5 rounded-lg
                       bg-ghost-accent/10 border border-ghost-accent/30
                       text-ghost-accent text-xs hover:bg-ghost-accent/20
                       transition-colors"
          >
            <BookOpen size={12} />
            Browse models
            <ExternalLink size={10} className="ml-auto" />
          </a>
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
          {systemResources && (
            <div className="text-[9px] text-ghost-text-dimmer font-mono">
              Disk free: {systemResources.disk.free.toFixed(1)} GB
            </div>
          )}
        </div>

        <div className="bg-ghost-surface border border-ghost-border rounded-xl p-3 space-y-1.5">
          <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">Health</div>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-ghost-green" />
              {stats.healthy}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-ghost-yellow" />
              {stats.totalHealthChecked - stats.healthy}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-ghost-text-dimmer" />
              {stats.total - stats.totalHealthChecked}
            </span>
          </div>
          <div className="text-[10px] text-ghost-text-dimmer">
            {stats.totalHealthChecked > 0 ? `${stats.healthy}/${stats.totalHealthChecked} healthy` : 'Not checked yet'}
          </div>
        </div>

        {/* System Resources panel */}
        {systemResources && (
          <div className="bg-ghost-surface border border-ghost-border rounded-xl p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">System</div>
              {loadingResources && <RotateCw size={10} className="animate-spin text-ghost-text-dimmer" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-ghost-text-dim flex items-center gap-1">
                  <MemoryStick size={10} />
                  RAM
                </span>
                <span className="text-ghost-text">
                  {systemResources.ram.used.toFixed(1)} / {systemResources.ram.total.toFixed(1)} GB
                </span>
                <span className={`text-[9px] ${systemResources.ram.usedPercent > 80 ? 'text-ghost-red' : 'text-ghost-text-dimmer'}`}>
                  {systemResources.ram.usedPercent.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-1 bg-black/30 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, systemResources.ram.usedPercent)}%`,
                    background: systemResources.ram.usedPercent > 80 ? '#ef4444' : '#9FEF00',
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 text-[9px] font-mono text-ghost-text-dimmer">
              <span className="flex items-center gap-1">
                <Cpu size={9} />
                {systemResources.cpu.cores} cores
              </span>
              <span className="truncate max-w-[100px]">{systemResources.cpu.model}</span>
            </div>
            {systemResources.gpu && (
              <div className="text-[9px] font-mono text-ghost-text-dimmer">
                GPU: {systemResources.gpu.name}
                {systemResources.gpu.memory > 0 && ` (${systemResources.gpu.memory}MB)`}
              </div>
            )}
          </div>
        )}

        {gpuInfo?.available && gpuInfo.devices.length > 0 && (
          <div className="bg-ghost-surface border border-ghost-border rounded-xl p-3 space-y-1.5">
            <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">GPU Devices</div>
            {gpuInfo.devices.map((device, idx) => (
              <div key={idx} className="text-[10px] font-mono">
                <div className="text-ghost-text">{device.name}</div>
                {device.memoryTotal > 0 && (
                  <div className="text-ghost-text-dimmer">
                    {((device.memoryUsed || 0) / 1024 / 1024).toFixed(0)}MB / {(device.memoryTotal / 1024 / 1024).toFixed(0)}MB
                    {device.utilization > 0 && ` · ${device.utilization}%`}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right pane */}
      <div className="flex-1 min-w-0 flex flex-col bg-ghost-surface border border-ghost-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-ghost-border/70 flex items-center gap-3 flex-shrink-0 flex-wrap">
          <div className="flex-1 min-w-[120px] relative">
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
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border ${
                  showFilters || selectedCategories.length > 0
                    ? 'bg-ghost-accent/10 border-ghost-accent/30 text-ghost-accent'
                    : 'border-ghost-border text-ghost-text-dim hover:text-ghost-text'
                } transition-colors`}
              >
                <Filter size={12} />
                Filters
                {selectedCategories.length > 0 && (
                  <span className="text-[9px] font-mono bg-ghost-accent/20 px-1 rounded">
                    {selectedCategories.length}
                  </span>
                )}
              </button>

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-black/25 border border-ghost-border rounded-lg px-2 py-1.5 text-xs text-ghost-text focus:outline-none focus:border-ghost-accent/60"
              >
                <option value="name">name</option>
                <option value="size">size</option>
                <option value="modified">modified</option>
                <option value="category">category</option>
                <option value="health">health</option>
              </select>

              <div className="flex border border-ghost-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-2 py-1.5 transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-ghost-accent/20 text-ghost-accent'
                      : 'text-ghost-text-dim hover:text-ghost-text'
                  }`}
                  title="Grid view"
                >
                  <Grid size={13} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2 py-1.5 transition-colors border-l border-ghost-border ${
                    viewMode === 'list'
                      ? 'bg-ghost-accent/20 text-ghost-accent'
                      : 'text-ghost-text-dim hover:text-ghost-text'
                  }`}
                  title="List view"
                >
                  <List size={13} />
                </button>
              </div>
            </>
          )}

          <button
            onClick={fetchModels}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ghost-border bg-ghost-surface-2/50 text-ghost-text-dim hover:text-ghost-text hover:border-ghost-accent/40 transition-colors text-xs flex-shrink-0"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            onClick={() => setShowCustomPull(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-ghost-accent text-black text-xs font-medium hover:opacity-90 transition-opacity flex-shrink-0"
          >
            <Plus size={12} />
            Pull model
          </button>
        </div>

        {/* Filters dropdown */}
        {showFilters && (
          <div className="px-4 py-3 border-b border-ghost-border/50 bg-ghost-surface-2/50 flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-ghost-text-dimmer font-mono">Categories:</span>
            {categories.map(cat => {
              const isSelected = selectedCategories.includes(cat)
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategories(prev =>
                      isSelected ? prev.filter(c => c !== cat) : [...prev, cat]
                    )
                  }}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    isSelected
                      ? 'bg-ghost-accent/20 text-ghost-accent border border-ghost-accent/30'
                      : 'bg-black/20 border border-transparent text-ghost-text-dim hover:text-ghost-text'
                  }`}
                >
                  {cat}
                </button>
              )
            })}
            {selectedCategories.length > 0 && (
              <button
                onClick={() => setSelectedCategories([])}
                className="text-[10px] text-ghost-text-dimmer hover:text-ghost-red transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Enhanced Pull Progress Display with Cancel Button */}
        {pullStatus && (
          <div className={`px-4 py-3 border-b border-ghost-border/50 flex-shrink-0 ${
            pullStatus.status.includes('❌') || pullStatus.status.includes('failed') || pullStatus.status.includes('⏹️')
              ? 'bg-red-500/10 border-red-500/30' 
              : pullStatus.status.includes('✅') || pullStatus.status.includes('complete')
                ? 'bg-ghost-green/10 border-ghost-green/30' 
                : 'bg-ghost-accent/10 border-ghost-accent/30'
          }`}>
            <div className="flex items-center gap-3">
              {pulling && !pullStatus.status.includes('⏹️') ? (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <RotateCw size={16} className="animate-spin text-ghost-accent" />
                    <div className="absolute inset-0 animate-ping opacity-30 rounded-full bg-ghost-accent" />
                  </div>
                </div>
              ) : pullStatus.status.includes('✅') ? (
                <CheckCircle size={16} className="text-ghost-green flex-shrink-0" />
              ) : pullStatus.status.includes('❌') || pullStatus.status.includes('⏹️') ? (
                <XCircle size={16} className="text-ghost-red flex-shrink-0" />
              ) : null}
              
              <span className="text-sm font-mono text-ghost-text flex-1">
                {pullStatus.status}
              </span>
              
              {pulling && (
                <>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/20 text-ghost-text-dimmer border border-ghost-border/50">
                    {pulling}
                  </span>
                  <button
                    onClick={cancelPull}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-[10px] font-mono border border-red-500/30"
                    title="Cancel download"
                  >
                    <Square size={12} />
                    Cancel
                  </button>
                </>
              )}
            </div>

            {pulling && pullStatus.percent !== undefined && pullStatus.percent < 100 && !pullStatus.status.includes('⏹️') && (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2.5 bg-black/30 rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-ghost-accent to-ghost-accent/70 transition-all duration-300 ease-out"
                      style={{ width: `${pullStatus.percent}%` }}
                    >
                      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    </div>
                  </div>
                  <span className="text-xs font-mono text-ghost-text-dimmer flex-shrink-0 min-w-[48px] text-right">
                    {pullStatus.percent.toFixed(0)}%
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-[10px] font-mono text-ghost-text-dimmer">
                  {(pullStatus.downloadedMB !== undefined && pullStatus.totalMB !== undefined) && (
                    <div className="flex items-center gap-1">
                      <Download size={10} className="text-ghost-accent" />
                      <span>
                        {formatSize(pullStatus.downloadedMB)} / {formatSize(pullStatus.totalMB)}
                      </span>
                    </div>
                  )}

                  {pullStatus.speed !== undefined && pullStatus.speed > 0 && (
                    <div className="flex items-center gap-1">
                      <Activity size={10} className="text-ghost-accent" />
                      <span>{formatSpeed(pullStatus.speed)}</span>
                    </div>
                  )}

                  {pullStatus.eta !== undefined && pullStatus.eta > 0 && (
                    <div className="flex items-center gap-1">
                      <Clock size={10} className="text-ghost-accent" />
                      <span>ETA: {formatTime(pullStatus.eta)}</span>
                    </div>
                  )}

                  {pullStatus.elapsed !== undefined && (
                    <div className="flex items-center gap-1">
                      <span>⏱ {formatTime(pullStatus.elapsed)}</span>
                    </div>
                  )}
                </div>

                {pullStatus.layerProgress && (
                  <div className="text-[9px] text-ghost-text-dimmer font-mono flex items-center gap-2">
                    <span>Layer {pullStatus.layerProgress.current}/{pullStatus.layerProgress.total}</span>
                    <span className="text-ghost-text-dimmer/50">·</span>
                    <span className="truncate max-w-[200px]">
                      {pullStatus.layerProgress.name.slice(0, 16)}...
                    </span>
                    <div className="flex-1 max-w-[100px] h-1 bg-black/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-ghost-accent/50 transition-all"
                        style={{ 
                          width: `${(pullStatus.layerProgress.current / pullStatus.layerProgress.total) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {pullStatus.status.includes('✅') && pullStatus.downloadedMB !== undefined && (
              <div className="mt-1.5 text-[10px] text-ghost-text-dimmer font-mono flex items-center gap-3">
                <span>✅ Downloaded {formatSize(pullStatus.downloadedMB)}</span>
                {pullStatus.elapsed !== undefined && (
                  <span>⏱ Completed in {formatTime(pullStatus.elapsed)}</span>
                )}
                {pullStatus.speed !== undefined && pullStatus.speed > 0 && (
                  <span>⚡ Avg speed: {formatSpeed(pullStatus.speed)}</span>
                )}
              </div>
            )}

            {(pullStatus.status.includes('❌') || pullStatus.status.includes('⏹️')) && (
              <div className="mt-1.5 text-[10px] text-ghost-red font-mono">
                <span>{pullStatus.status.includes('⏹️') ? '⏹️' : '❌'} {pullStatus.status}</span>
                {pullStatus.status.includes('❌') && !pullStatus.status.includes('⏹️') && (
                  <button
                    onClick={() => {
                      if (pulling) {
                        const modelName = pulling
                        setPullStatus(null)
                        pullModel(modelName)
                      }
                    }}
                    className="ml-2 px-2 py-0.5 rounded border border-ghost-red/30 hover:bg-ghost-red/10 transition-colors"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
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
            viewMode === 'grid' ? (
              <InstalledGrid
                models={filteredModels}
                activeModel={activeModel}
                userLimits={userLimits}
                healthStatus={healthStatus}
                checkingHealth={checkingHealth}
                onActivate={activateModel}
                onDelete={deleteModel}
                onCustomize={name => {
                  setExpandedCard(name)
                  setShowCustomize(true)
                }}
                onOpenTerminal={openInTerminal}
                onRefreshHealth={refreshHealth}
                onLimitsChanged={() => setLimitsTick(t => t + 1)}
                gpuInfo={gpuInfo}
                ollamaVersion={ollamaVersion}
                systemResources={systemResources}
              />
            ) : (
              <InstalledList
                models={filteredModels}
                activeModel={activeModel}
                userLimits={userLimits}
                healthStatus={healthStatus}
                checkingHealth={checkingHealth}
                onActivate={activateModel}
                onDelete={deleteModel}
                onCustomize={name => {
                  setExpandedCard(name)
                  setShowCustomize(true)
                }}
                onOpenTerminal={openInTerminal}
                onRefreshHealth={refreshHealth}
                onLimitsChanged={() => setLimitsTick(t => t + 1)}
                gpuInfo={gpuInfo}
                ollamaVersion={ollamaVersion}
                systemResources={systemResources}
              />
            )
          )}

          {view === 'recommendations' && (
            <RecommendationsList
              recommended={filteredRecommended}
              isInstalled={isInstalled}
              pulling={pulling}
              onPull={pullModel}
              activeModel={activeModel}
              onActivate={activateModel}
              gpuInfo={gpuInfo}
              ollamaVersion={ollamaVersion}
              systemResources={systemResources}
            />
          )}

          {view === 'stats' && (
            <StatsView
              models={models}
              activeModel={activeModel}
              healthStatus={healthStatus}
              error={error}
              loading={loading}
              onRetry={fetchModels}
              onRefreshGPU={async () => {
                const newGpu = await detectGPU()
                setGpuInfo(newGpu)
              }}
              gpuInfo={gpuInfo}
              ollamaVersion={ollamaVersion}
              systemResources={systemResources}
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
          gpuInfo={gpuInfo}
          ollamaVersion={ollamaVersion}
          systemResources={systemResources}
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
          gpuInfo={gpuInfo}
          ollamaVersion={ollamaVersion}
          systemResources={systemResources}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Installed grid view
// ─────────────────────────────────────────────────────────────────────────────

function InstalledGrid({
  models,
  activeModel,
  userLimits,
  healthStatus,
  checkingHealth,
  onActivate,
  onDelete,
  onCustomize,
  onOpenTerminal,
  onRefreshHealth,
  gpuInfo,
}: {
  models: OllamaModel[]
  activeModel: string
  userLimits: Record<string, ModelLimits>
  healthStatus: Record<string, ModelHealth>
  checkingHealth: boolean
  onActivate: (name: string) => void
  onDelete: (name: string) => void
  onCustomize: (name: string) => void
  onOpenTerminal: (name: string) => void
  onRefreshHealth: (name: string) => void
  onLimitsChanged: () => void
  gpuInfo: GPUInfo | null
  ollamaVersion: OllamaVersionInfo | null
  systemResources: SystemResources | null
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {models.map(m => {
        const isActive = m.name === activeModel
        const hasUserOverride = !!userLimits[m.name]
        const isOptimistic = m.digest === ''
        const health = healthStatus[m.name]
        const isChecking = checkingHealth && !health
        const limits = getModelLimits(m.name)
        const usingGPU = limits.num_gpu !== 0 && gpuInfo?.available

        return (
          <div
            key={m.name}
            className={`relative p-4 rounded-xl border transition-all ${
              isActive
                ? 'bg-ghost-accent/8 border-ghost-accent/40 shadow-lg shadow-ghost-accent/10'
                : 'bg-ghost-surface-2/50 border-ghost-border hover:border-ghost-accent/30'
            } ${isOptimistic ? 'opacity-60' : ''}`}
          >
            <div className="absolute top-2 right-2 flex items-center gap-1">
              {usingGPU && (
                <Zap size={10} className="text-ghost-accent" aria-label="Using GPU acceleration" />
              )}
              {isChecking ? (
                <RotateCw size={12} className="animate-spin text-ghost-text-dimmer" />
              ) : health?.status === 'healthy' ? (
                <CheckCircle size={12} className="text-ghost-green" />
              ) : health?.status === 'slow' ? (
                <Clock size={12} className="text-ghost-yellow" />
              ) : health?.status === 'error' ? (
                <XCircle size={12} className="text-ghost-red" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-ghost-text-dimmer/30" />
              )}
            </div>

            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="p-1.5 rounded-lg bg-ghost-surface-3/50">
                  <Cpu size={14} className={isActive ? 'text-ghost-accent' : 'text-ghost-text-dim'} />
                </div>
                <span className="text-sm text-ghost-text font-mono truncate">{m.name}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-ghost-text-dim">
                <span>{(m.size / 1e9).toFixed(1)} GB</span>
                <span>·</span>
                <span className="font-mono">{getModelCategoryStatic(m.name)}</span>
                {usingGPU && (
                  <>
                    <span>·</span>
                    <span className="text-ghost-accent">GPU</span>
                  </>
                )}
              </div>
              {hasUserOverride && (
                <div className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-ghost-yellow/15 text-ghost-yellow border border-ghost-yellow/30 inline-block">
                  custom limits
                </div>
              )}
              {isActive && (
                <div className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-ghost-accent text-black inline-block">
                  ACTIVE
                </div>
              )}
              {health?.responseTime && (
                <div className="text-[9px] text-ghost-text-dimmer font-mono">
                  {health.responseTime}ms response
                </div>
              )}
              {health?.gpuInfo && health.gpuInfo.deviceCount > 0 && (
                <div className="text-[9px] text-ghost-text-dimmer font-mono">
                  GPU: {health.gpuInfo.devices.join(', ')}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 mt-3 pt-2 border-t border-ghost-border/50">
              {!isActive && !isOptimistic && (
                <button
                  onClick={() => onActivate(m.name)}
                  className="px-2.5 py-1 rounded-lg bg-ghost-accent text-black text-[11px] font-medium hover:opacity-90 transition-opacity flex-1"
                >
                  Use
                </button>
              )}
              <button
                onClick={() => onRefreshHealth(m.name)}
                className="p-1.5 rounded-lg text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors"
                title="Check health"
              >
                <Activity size={12} />
              </button>
              <button
                onClick={() => onCustomize(m.name)}
                className="p-1.5 rounded-lg text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors"
                title="Customize limits"
              >
                <Settings size={12} />
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
// Installed list
// ─────────────────────────────────────────────────────────────────────────────

function InstalledList({
  models,
  activeModel,
  userLimits,
  healthStatus,
  checkingHealth,
  onActivate,
  onDelete,
  onCustomize,
  onOpenTerminal,
  onRefreshHealth,
  gpuInfo,
}: {
  models: OllamaModel[]
  activeModel: string
  userLimits: Record<string, ModelLimits>
  healthStatus: Record<string, ModelHealth>
  checkingHealth: boolean
  onActivate: (name: string) => void
  onDelete: (name: string) => void
  onCustomize: (name: string) => void
  onOpenTerminal: (name: string) => void
  onRefreshHealth: (name: string) => void
  onLimitsChanged: () => void
  gpuInfo: GPUInfo | null
  ollamaVersion: OllamaVersionInfo | null
  systemResources: SystemResources | null
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

  return (
    <div className="space-y-2">
      {models.map(m => {
        const isActive = m.name === activeModel
        const limits = getModelLimits(m.name)
        const hasUserOverride = !!userLimits[m.name]
        const isOptimistic = m.digest === ''
        const health = healthStatus[m.name]
        const isChecking = checkingHealth && !health
        const usingGPU = limits.num_gpu !== 0 && gpuInfo?.available

        return (
          <div
            key={m.name}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
              isActive
                ? 'bg-ghost-accent/8 border-ghost-accent/40'
                : 'bg-ghost-surface-2/50 border-ghost-border'
            } ${isOptimistic ? 'opacity-60' : ''}`}
          >
            <div className="flex-shrink-0 w-5 flex items-center gap-1">
              {usingGPU && (
                <Zap size={10} className="text-ghost-accent flex-shrink-0" aria-label="Using GPU" />
              )}
              {isChecking ? (
                <RotateCw size={12} className="animate-spin text-ghost-text-dimmer flex-shrink-0" />
              ) : health?.status === 'healthy' ? (
                <CheckCircle size={14} className="text-ghost-green flex-shrink-0" />
              ) : health?.status === 'slow' ? (
                <Clock size={14} className="text-ghost-yellow flex-shrink-0" />
              ) : health?.status === 'error' ? (
                <XCircle size={14} className="text-ghost-red flex-shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-ghost-text-dimmer/30 flex-shrink-0" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-ghost-text font-mono truncate">{m.name}</span>
                {isActive && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-ghost-accent text-black flex-shrink-0">
                    ACTIVE
                  </span>
                )}
                {isOptimistic && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-ghost-yellow/20 text-ghost-yellow border border-ghost-yellow/30 flex-shrink-0">
                    PULLING…
                  </span>
                )}
                {hasUserOverride && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-ghost-yellow/15 text-ghost-yellow border border-ghost-yellow/30 flex-shrink-0">
                    custom
                  </span>
                )}
                {usingGPU && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-ghost-accent/15 text-ghost-accent border border-ghost-accent/30 flex-shrink-0">
                    ⚡ GPU
                  </span>
                )}
                {health?.responseTime && (
                  <span className="text-[9px] text-ghost-text-dimmer font-mono flex-shrink-0">
                    {health.responseTime}ms
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-ghost-text-dim mt-1 font-mono flex-wrap">
                <span>{(m.size / 1e9).toFixed(1)} GB</span>
                <span>·</span>
                <span>{getModelCategoryStatic(m.name)}</span>
                <span>·</span>
                <span>ctx {limits.num_ctx.toLocaleString()}</span>
                <span>·</span>
                <span>out {limits.num_predict.toLocaleString()}</span>
                {usingGPU && (
                  <>
                    <span>·</span>
                    <span>GPU {limits.num_gpu === -1 ? 'auto' : limits.num_gpu}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onRefreshHealth(m.name)}
                className="p-1.5 rounded-lg text-ghost-text-dim hover:text-ghost-text hover:bg-ghost-surface-2 transition-colors"
                title="Check health"
              >
                <Activity size={12} />
              </button>
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
                <Settings size={12} />
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
// Recommendations list
// ─────────────────────────────────────────────────────────────────────────────

function RecommendationsList({
  recommended,
  isInstalled,
  pulling,
  onPull,
  activeModel,
  onActivate,
  gpuInfo,
  ollamaVersion,
  systemResources,
}: {
  recommended: RecommendedModel[]
  isInstalled: (name: string) => boolean
  pulling: string | null
  onPull: (name: string) => void
  activeModel: string
  onActivate: (name: string) => void
  gpuInfo: GPUInfo | null
  ollamaVersion: OllamaVersionInfo | null
  systemResources: SystemResources | null
}) {
  return (
    <div className="space-y-2">
      <div className="bg-ghost-surface-2/30 border border-ghost-border rounded-xl px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-xs text-ghost-text-dim">
          <BookOpen size={14} className="text-ghost-accent" />
          <span>Don't see what you need?</span>
        </div>
        <a
          href={OLLAMA_REGISTRY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                     bg-ghost-accent/10 border border-ghost-accent/30
                     text-ghost-accent text-xs font-medium hover:bg-ghost-accent/20
                     transition-colors"
        >
          Browse all models on Ollama
          <ExternalLink size={12} />
        </a>
      </div>

      {gpuInfo && !gpuInfo.available && (
        <div className="bg-ghost-yellow/10 border border-ghost-yellow/30 rounded-xl px-4 py-2 flex items-center gap-2">
          <AlertTriangle size={14} className="text-ghost-yellow" />
          <span className="text-xs text-ghost-text-dim">
            No GPU detected. Models will run on CPU (slower).
          </span>
        </div>
      )}

      {ollamaVersion && !ollamaVersion.features.multiGPU && (
        <div className="bg-ghost-yellow/10 border border-ghost-yellow/30 rounded-xl px-4 py-2 flex items-center gap-2">
          <AlertTriangle size={14} className="text-ghost-yellow" />
          <span className="text-xs text-ghost-text-dim">
            Ollama v{ollamaVersion.version} doesn't support multi-GPU. Upgrade to {ollamaVersion.minSupportedVersion}+.
          </span>
        </div>
      )}

      {systemResources && systemResources.ram.usedPercent > 80 && (
        <div className="bg-ghost-yellow/10 border border-ghost-yellow/30 rounded-xl px-4 py-2 flex items-center gap-2">
          <Gauge size={14} className="text-ghost-yellow" />
          <span className="text-xs text-ghost-text-dim">
            High RAM usage ({systemResources.ram.usedPercent.toFixed(0)}%). Loading large models may impact performance.
          </span>
        </div>
      )}

      {recommended.map(r => {
        const installed = isInstalled(r.name)
        const isPulling = pulling === r.name
        const isActive = activeModel === r.name
        const hasGPU = gpuInfo?.available ?? false
        const needsGPU = Boolean(r.gpuRequired || (typeof r.minVram === 'number' && r.minVram > 8))
        const canRunGPU = hasGPU && (typeof r.minVram !== 'number' || (gpuInfo?.devices[0]?.memoryTotal || 0) >= r.minVram * 1024)
        const hasEnoughRAM = systemResources ? (systemResources.ram.free > (parseFloat(r.size?.replace(/[^0-9.]/g, '') || '0') * 1.2)) : true
        const hasEnoughDisk = systemResources ? (systemResources.disk.free > (parseFloat(r.size?.replace(/[^0-9.]/g, '') || '0') * 1.5)) : true

        return (
          <div
            key={r.name}
            className={`px-4 py-3 rounded-xl border ${
              r.isFeatured
                ? 'bg-gradient-to-br from-ghost-accent/8 to-ghost-surface-2 border-ghost-accent/30'
                : 'bg-ghost-surface-2/50 border-ghost-border'
            } ${needsGPU && !canRunGPU ? 'opacity-60' : ''} ${!hasEnoughRAM || !hasEnoughDisk ? 'opacity-50' : ''}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-ghost-text font-mono">{r.name}</span>
                  {r.isFeatured && <Star size={11} className="text-ghost-yellow" fill="currentColor" />}
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full border border-ghost-border text-ghost-text-dim">
                    {r.category}
                  </span>
                  <span className="text-[10px] text-ghost-text-dim font-mono">{r.size}</span>
                  {r.tags && r.tags.length > 0 && (
                    <div className="flex gap-1">
                      {r.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="text-[8px] font-mono px-1 py-0.5 rounded bg-black/20 text-ghost-text-dimmer">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {needsGPU && (
                    <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-ghost-accent/15 text-ghost-accent border border-ghost-accent/30">
                      GPU Required
                    </span>
                  )}
                  {canRunGPU && hasGPU && (
                    <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-ghost-green/15 text-ghost-green border border-ghost-green/30">
                      ✓ GPU Ready
                    </span>
                  )}
                  {!hasEnoughRAM && (
                    <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-ghost-yellow/15 text-ghost-yellow border border-ghost-yellow/30">
                      ⚠️ Low RAM
                    </span>
                  )}
                  {!hasEnoughDisk && (
                    <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-ghost-red/15 text-ghost-red border border-ghost-red/30">
                      ⚠️ Low Disk
                    </span>
                  )}
                </div>
                <p className="text-xs text-ghost-text-dim mt-1 leading-relaxed">{r.description}</p>
                {r.minVram && (
                  <div className="text-[10px] text-ghost-text-dimmer mt-1 font-mono">
                    Min VRAM: {r.minVram}GB · {r.speed === 'fast' ? '⚡ Fast' : r.speed === 'medium' ? '⚡ Medium' : '🐢 Slow'}
                    {r.maxContext && ` · Max context: ${r.maxContext.toLocaleString()}`}
                    {needsGPU && !canRunGPU && (
                      <span className="text-ghost-red"> · ⚠️ Insufficient GPU memory</span>
                    )}
                    {systemResources && (
                      <span className="text-ghost-text-dimmer ml-2">
                        · RAM: {systemResources.ram.free.toFixed(1)}GB free
                      </span>
                    )}
                  </div>
                )}
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
                    disabled={!!pulling || (needsGPU && !canRunGPU) || !hasEnoughRAM || !hasEnoughDisk}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border ${
                      (needsGPU && !canRunGPU) || !hasEnoughRAM || !hasEnoughDisk
                        ? 'border-ghost-border text-ghost-text-dimmer cursor-not-allowed'
                        : 'border-ghost-accent/40 bg-ghost-accent/10 text-ghost-accent hover:bg-ghost-accent/20'
                    } text-[11px] font-medium transition-colors disabled:opacity-30`}
                    title={
                      !hasEnoughRAM ? 'Insufficient RAM available' :
                      !hasEnoughDisk ? 'Insufficient disk space' :
                      needsGPU && !canRunGPU ? 'Insufficient GPU memory' : ''
                    }
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
// Stats view - with improved GPU display
// ─────────────────────────────────────────────────────────────────────────────

function StatsView({
  models,
  activeModel,
  healthStatus,
  error,
  loading,
  onRetry,
  gpuInfo,
  ollamaVersion,
  systemResources,
}: {
  models: OllamaModel[]
  activeModel: string
  healthStatus: Record<string, ModelHealth>
  error: string | null
  loading: boolean
  onRetry: () => void
  onRefreshGPU: () => Promise<void>
  gpuInfo: GPUInfo | null
  ollamaVersion: OllamaVersionInfo | null
  systemResources: SystemResources | null
}) {
  const totalSize = models.reduce((acc, m) => acc + m.size, 0)

  const byCategory = useMemo(() => {
    const groups: Record<string, OllamaModel[]> = {}
    models.forEach(m => {
      const cat = getModelCategoryStatic(m.name)
      groups[cat] = groups[cat] ?? []
      groups[cat].push(m)
    })
    Object.values(groups).forEach(g => g.sort((a, b) => b.size - a.size))
    return groups
  }, [models])

  const recent = useMemo(() => {
    return [...models].sort((a, b) => b.modified_at.localeCompare(a.modified_at)).slice(0, 5)
  }, [models])

  const healthStats = useMemo(() => {
    const stats = { healthy: 0, slow: 0, error: 0, unknown: 0 }
    Object.values(healthStatus).forEach(h => {
      stats[h.status] = (stats[h.status] || 0) + 1
    })
    return stats
  }, [healthStatus])

  if (loading && models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-ghost-text-dim">
        <RefreshCw size={28} className="text-ghost-accent animate-spin mb-3" />
        <div className="text-sm">Loading models…</div>
      </div>
    )
  }

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

  if (models.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-ghost-text-dim">
        <Inbox size={28} className="text-ghost-text-dimmer mb-3" />
        <div className="text-sm">No models installed</div>
        <div className="text-xs text-ghost-text-dimmer mt-1">Pull a model from the Recommendations tab to get started.</div>
      </div>
    )
  }

  function onRefreshGPU() {
    throw new Error('Function not implemented.')
  }

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
          {systemResources && (
            <div className="text-[9px] text-ghost-text-dimmer font-mono mt-1">
              Disk free: {systemResources.disk.free.toFixed(1)} GB
            </div>
          )}
        </div>
        <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
          <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">Active</div>
          <div className="text-sm text-ghost-accent font-mono mt-1 truncate">{activeModel}</div>
        </div>
        <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
          <div className="text-[10px] text-ghost-text-dimmer font-mono uppercase tracking-wide">Health</div>
          <div className="text-sm text-ghost-text font-semibold mt-1">
            {healthStats.healthy}/{Object.keys(healthStatus).length} healthy
          </div>
        </div>
      </div>

      {systemResources && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
            <div className="flex items-center gap-2 text-ghost-text text-xs font-semibold mb-2">
              <MemoryStick size={13} className="text-ghost-accent" />
              RAM
            </div>
            <div className="text-sm text-ghost-text font-mono">
              {systemResources.ram.used.toFixed(1)} / {systemResources.ram.total.toFixed(1)} GB
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, systemResources.ram.usedPercent)}%`,
                    background: systemResources.ram.usedPercent > 80 ? '#ef4444' : '#9FEF00',
                  }}
                />
              </div>
              <span className={`text-[10px] font-mono ${systemResources.ram.usedPercent > 80 ? 'text-ghost-red' : 'text-ghost-text-dimmer'}`}>
                {systemResources.ram.usedPercent.toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
            <div className="flex items-center gap-2 text-ghost-text text-xs font-semibold mb-2">
              <Cpu size={13} className="text-ghost-accent" />
              CPU
            </div>
            <div className="text-sm text-ghost-text font-mono">
              {systemResources.cpu.cores} cores
            </div>
            <div className="text-[10px] text-ghost-text-dimmer font-mono truncate">
              {systemResources.cpu.model}
            </div>
          </div>

          <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
            <div className="flex items-center gap-2 text-ghost-text text-xs font-semibold mb-2">
              <Gauge size={13} className="text-ghost-accent" />
              OS
            </div>
            <div className="text-sm text-ghost-text font-mono">
              {systemResources.os.platform}
            </div>
            <div className="text-[10px] text-ghost-text-dimmer font-mono">
              {systemResources.os.release}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* ─── IMPROVED GPU STATUS SECTION ─── */}
        <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold">
              <Zap size={13} className="text-ghost-accent" />
              GPU Status
            </div>
            <button
              onClick={async () => {
                await onRefreshGPU()
              }}
              className="p-1 rounded text-ghost-text-dim hover:text-ghost-accent transition-colors"
              title="Refresh GPU detection"
            >
              <RotateCw size={12} className="hover:animate-spin" />
            </button>
          </div>
          {gpuInfo?.available && gpuInfo.devices.length > 0 ? (
            <div className="space-y-2">
              {gpuInfo.devices.map((device, idx) => (
                <div key={idx} className="bg-black/20 rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ghost-text font-mono">{device.name}</span>
                    <span className="text-[10px] text-ghost-text-dimmer font-mono">
                      {device.memoryTotal > 0 
                        ? `${device.memoryTotal.toFixed(0)}MB` 
                        : 'Shared Memory'}
                    </span>
                  </div>
                  {device.memoryTotal > 0 && (
                    <div className="mt-1">
                      <div className="flex justify-between text-[9px] text-ghost-text-dimmer">
                        <span>VRAM Used: {device.memoryUsed?.toFixed(0) || 0}MB</span>
                        <span>{device.utilization || 0}%</span>
                      </div>
                      <div className="w-full h-1 bg-black/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-ghost-accent transition-all duration-500"
                          style={{ 
                            width: `${Math.min(100, (device.memoryUsed || 0) / (device.memoryTotal || 1) * 100)}%` 
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {device.temperature && (
                    <div className="text-[9px] text-ghost-text-dimmer mt-1">
                      Temp: {device.temperature}°C
                    </div>
                  )}
                </div>
              ))}
              {gpuInfo.driverVersion && (
                <div className="text-[9px] text-ghost-text-dimmer font-mono">
                  Driver: {gpuInfo.driverVersion}
                </div>
              )}
              {gpuInfo.cudaVersion && (
                <div className="text-[9px] text-ghost-text-dimmer font-mono">
                  CUDA: {gpuInfo.cudaVersion}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-ghost-text-dim">
              <AlertTriangle size={12} className="inline mr-1 text-ghost-yellow" />
              No GPU detected. Running on CPU.
              {process.env.NODE_ENV === 'development' && (
                <div className="text-[9px] text-ghost-text-dimmer mt-1">
                  Ensure Ollama is running with GPU support.
                  <br />
                  Try: <code className="text-ghost-accent">ollama serve</code>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold mb-2">
            <Info size={13} className="text-ghost-accent" />
            Ollama Version
          </div>
          {ollamaVersion ? (
            <div className="space-y-1">
              <div className="text-xs text-ghost-text font-mono">v{ollamaVersion.version}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {ollamaVersion.features.multiGPU && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ghost-green/15 text-ghost-green border border-ghost-green/30">
                    Multi-GPU
                  </span>
                )}
                {ollamaVersion.features.quantization && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ghost-accent/15 text-ghost-accent border border-ghost-accent/30">
                    Quantization
                  </span>
                )}
                {ollamaVersion.features.vision && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ghost-accent/15 text-ghost-accent border border-ghost-accent/30">
                    Vision
                  </span>
                )}
                {!ollamaVersion.features.multiGPU && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ghost-yellow/15 text-ghost-yellow border border-ghost-yellow/30">
                    Upgrade recommended
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-ghost-text-dim">Unknown</div>
          )}
        </div>
      </div>

      <div className="bg-ghost-surface-2/50 border border-ghost-border rounded-xl p-3">
        <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold mb-2">
          <Activity size={13} className="text-ghost-accent" />
          Health status
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-ghost-green" />
            <span className="text-xs text-ghost-text-dim">{healthStats.healthy} healthy</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-ghost-yellow" />
            <span className="text-xs text-ghost-text-dim">{healthStats.slow} slow</span>
          </div>
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-ghost-red" />
            <span className="text-xs text-ghost-text-dim">{healthStats.error} error</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-ghost-text-dimmer/30" />
            <span className="text-xs text-ghost-text-dim">{healthStats.unknown} unknown</span>
          </div>
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
                  className="h-full bg-ghost-accent transition-all duration-500"
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
          <Clock size={13} className="text-ghost-accent" />
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

function getModelCategoryStatic(name: string): ModelCategory {
  const normalized = name.toLowerCase()
  if (normalized.includes('vision') || normalized.includes('vl') || normalized.includes('llava')) return 'vision'
  if (normalized.includes('coder') || normalized.includes('code')) return 'coding'
  if (normalized.includes('reason') || normalized.includes('gpt-oss') || normalized.includes('deepseek-r1')) return 'reasoning'
  if (normalized.includes('embed') || normalized.includes('embedding')) return 'embedding'
  if (normalized.includes('small') || /\b(?:3b|7b|8b|14b|20b)\b/.test(normalized)) return 'small'
  if (normalized.includes('special')) return 'specialized'
  return 'general'
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom pull modal
// ─────────────────────────────────────────────────────────────────────────────

function CustomPullModal({
  onPull,
  onClose,
  gpuInfo,
  ollamaVersion,
  systemResources,
}: {
  onPull: (name: string) => void
  onClose: () => void
  gpuInfo: GPUInfo | null
  ollamaVersion: OllamaVersionInfo | null
  systemResources: SystemResources | null
}) {
  const [name, setName] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onPull(trimmed)
  }

  useEffect(() => {
    const input = name.trim().toLowerCase()
    if (!input) {
      setSuggestions([])
      return
    }
    const popular = ['llama3.2', 'mistral', 'phi', 'qwen2.5', 'deepseek-r1', 'minimax-m3', 'gpt-oss']
    const matches = popular.filter(p => p.includes(input))
    setSuggestions(matches.slice(0, 3))
  }, [name])

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
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => setName(s)}
                  className="text-[10px] px-2 py-0.5 rounded bg-ghost-accent/10 border border-ghost-accent/30 text-ghost-accent hover:bg-ghost-accent/20 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          
          <div className="mt-2 text-[10px] text-ghost-text-dimmer space-y-1">
            <div>
              {gpuInfo?.available ? (
                <span className="text-ghost-green">✓ GPU detected ({gpuInfo.deviceCount} device{gpuInfo.deviceCount > 1 ? 's' : ''})</span>
              ) : (
                <span className="text-ghost-yellow">⚠️ No GPU detected - models will run on CPU</span>
              )}
              {ollamaVersion && (
                <span className="ml-2">· Ollama v{ollamaVersion.version}</span>
              )}
            </div>
            {systemResources && (
              <div className="text-ghost-text-dimmer">
                <span>💾 RAM: {systemResources.ram.free.toFixed(1)} GB free</span>
                <span className="ml-2">💿 Disk: {systemResources.disk.free.toFixed(1)} GB free</span>
              </div>
            )}
          </div>
          
          <div className="mt-1 text-[10px] text-ghost-text-dimmer">
            <span>Need inspiration? </span>
            <a
              href={OLLAMA_REGISTRY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ghost-accent hover:underline"
            >
              Browse models on Ollama
              <ExternalLink size={10} className="inline ml-1" />
            </a>
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
  gpuInfo,
  ollamaVersion,
  systemResources,
}: {
  modelName: string
  onClose: () => void
  onSave: (limits: ModelLimits) => void
  gpuInfo: GPUInfo | null
  ollamaVersion: OllamaVersionInfo | null
  systemResources: SystemResources | null
}) {
  const current = getModelLimits(modelName)
  const [numPredict, setNumPredict] = useState(current.num_predict)
  const [numCtx, setNumCtx] = useState(current.num_ctx)
  const [maxMessages, setMaxMessages] = useState(current.max_messages)
  const [numGPU, setNumGPU] = useState(current.num_gpu ?? -1)
  const [numThread, setNumThread] = useState(current.num_thread ?? 0)

  const save = () => {
    onSave({
      num_predict: Math.max(128, Math.min(128000, numPredict)),
      num_ctx: Math.max(1024, Math.min(1048576, numCtx)),
      max_messages: Math.max(5, Math.min(500, maxMessages)),
      num_gpu: numGPU,
      num_thread: numThread,
    })
    onClose()
  }

  const reset = () => {
    const base = DEFAULT_LIMITS[modelName] ?? DEFAULT_LIMITS._default
    setNumPredict(base.num_predict)
    setNumCtx(base.num_ctx)
    setMaxMessages(base.max_messages)
    setNumGPU(base.num_gpu ?? -1)
    setNumThread(base.num_thread ?? 0)
  }

  const hasGPU = gpuInfo?.available ?? false
  const maxGPU = gpuInfo?.deviceCount ?? 0

  const recommendedThreads = systemResources ? Math.min(systemResources.cpu.cores, 8) : 0

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-ghost-surface border border-ghost-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-ghost-border/70">
          <div className="flex items-center gap-2 text-ghost-text text-sm font-semibold">
            <Settings size={14} className="text-ghost-accent" />
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
              max="1048576"
              step="1024"
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
              max="128000"
              step="128"
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
              max="500"
              step="5"
              value={maxMessages}
              onChange={e => setMaxMessages(parseInt(e.target.value, 10))}
              className="w-full accent-ghost-accent"
            />
            <div className="text-[10px] text-ghost-text-dimmer mt-1">
              Most recent N messages to bring into the request before trimming.
            </div>
          </div>

          {hasGPU && (
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-ghost-text-dim flex items-center gap-1">
                  <Zap size={10} className="text-ghost-accent" />
                  GPU devices (num_gpu)
                </span>
                <span className="text-ghost-text font-mono">
                  {numGPU === -1 ? 'auto' : numGPU}
                </span>
              </div>
              <input
                type="range"
                min="-1"
                max={Math.max(0, maxGPU)}
                step="1"
                value={numGPU}
                onChange={e => setNumGPU(parseInt(e.target.value, 10))}
                className="w-full accent-ghost-accent"
              />
              <div className="flex justify-between text-[10px] text-ghost-text-dimmer mt-1">
                <span>CPU only</span>
                <span>{maxGPU > 0 ? `${maxGPU} GPU${maxGPU > 1 ? 's' : ''} available` : 'No GPU'}</span>
              </div>
              <div className="text-[10px] text-ghost-text-dimmer mt-1">
                {numGPU === -1 
                  ? 'Auto: uses all available GPUs' 
                  : numGPU === 0 
                    ? 'CPU only' 
                    : `Using ${numGPU} GPU${numGPU > 1 ? 's' : ''}`}
                {ollamaVersion && !ollamaVersion.features.multiGPU && numGPU > 1 && (
                  <span className="text-ghost-yellow ml-1">⚠️ Multi-GPU requires Ollama {ollamaVersion.minSupportedVersion}+</span>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-ghost-text-dim flex items-center gap-1">
                <Cpu size={10} className="text-ghost-accent" />
                CPU threads (num_thread)
              </span>
              <span className="text-ghost-text font-mono">{numThread === 0 ? 'auto' : numThread}</span>
            </div>
            <input
              type="range"
              min="0"
              max={Math.max(16, systemResources?.cpu.cores || navigator.hardwareConcurrency || 16)}
              step="1"
              value={numThread}
              onChange={e => setNumThread(parseInt(e.target.value, 10))}
              className="w-full accent-ghost-accent"
            />
            <div className="flex justify-between text-[10px] text-ghost-text-dimmer mt-1">
              <span>Auto</span>
              <span>{systemResources?.cpu.cores || navigator.hardwareConcurrency || 16} cores max</span>
            </div>
            <div className="text-[10px] text-ghost-text-dimmer mt-1">
              {numThread === 0 
                ? `Auto: optimized for your system (${recommendedThreads} threads recommended)` 
                : `Using ${numThread} thread${numThread > 1 ? 's' : ''}`}
            </div>
          </div>

          <div className="bg-black/25 border border-ghost-border rounded-lg px-3 py-2 text-xs text-ghost-text-dim">
            <span className="text-ghost-text-dimmer">Current defaults for </span>
            <span className="font-mono text-ghost-text">{modelName}</span>
            <span className="text-ghost-text-dimmer">: </span>
            <span className="font-mono text-ghost-text">{current.num_ctx.toLocaleString()}</span>
            <span className="text-ghost-text-dimmer"> ctx · </span>
            <span className="font-mono text-ghost-text">{current.num_predict.toLocaleString()}</span>
            <span className="text-ghost-text-dimmer"> out · </span>
            <span className="font-mono text-ghost-text">{current.max_messages}</span>
            <span className="text-ghost-text-dimmer"> msg</span>
            {current.num_gpu !== undefined && (
              <span className="text-ghost-text-dimmer">
                {' · '}
                <span className="font-mono text-ghost-text">{current.num_gpu === -1 ? 'auto' : current.num_gpu}</span>
                {' GPU'}
              </span>
            )}
            {systemResources && (
              <span className="text-ghost-text-dimmer">
                {' · '}
                <span className="font-mono text-ghost-text">{systemResources.cpu.cores}</span>
                {' CPU cores'}
              </span>
            )}
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