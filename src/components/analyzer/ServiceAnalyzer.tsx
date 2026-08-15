import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { 
  Search, Copy, Check, RotateCw, Cpu, AlertTriangle, 
  ChevronDown, ChevronUp, ExternalLink, Download, 
  Upload, Trash2, History, Star, 
  BookOpen, 
  Play,
  AlertCircle,
  Layers,
  X,
  Zap,
  Target,
  Wrench,
  Terminal  
} from 'lucide-react'
import { ollamaChatOnce } from '../../lib/ollama'
import { useActiveModel } from '../models/ModelManager'

type Service = {
  port: string;
  protocol: string;
  state: string;
  service: string;
  version: string;
}

type Finding = {
  port: string;
  service: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  detail: string;
  tools: string[];
  commands: string[];
  references?: string[];
}

type AnalysisResult = {
  services: Service[];
  findings: Finding[];
  nextSteps: string[];
  attackSurface: string;
  cveReferences?: string[];
  quickWins?: string[];
}

type SavedAnalysis = {
  id: string;
  timestamp: number;
  target: string;
  toolType: string;
  services: Service[];
  findings: Finding[];
  nextSteps: string[];
  attackSurface: string;
  notes?: string;
  favorite?: boolean;
}

type AnalysisTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  toolType: string;
  example: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400 border-red-400/40 bg-red-500/10',
  high:     'text-amber-400 border-amber-400/40 bg-amber-500/10',
  medium:   'text-cyan-400 border-cyan-400/40 bg-cyan-500/10',
  low:      'text-white/40 border-white/20 bg-white/5',
  info:     'text-white/30 border-white/10 bg-white/5',
}

const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4
}

const OLLAMA_HOST = 'http://127.0.0.1:11434'

// ─── ANALYSIS TEMPLATES ───

const ANALYSIS_TEMPLATES: AnalysisTemplate[] = [
  {
    id: 'nmap',
    name: 'Nmap Scan',
    description: 'Parse port scan results',
    icon: '🔌',
    toolType: 'nmap',
    example: `Nmap scan report for 10.10.10.1
PORT     STATE SERVICE     VERSION
22/tcp   open  ssh         OpenSSH 7.4 (protocol 2.0)
80/tcp   open  http        Apache httpd 2.4.6
139/tcp  open  netbios-ssn Samba smbd 3.X - 4.X
443/tcp  open  ssl/http    Apache httpd 2.4.6
445/tcp  open  netbios-ssn Samba smbd 4.7.6
3306/tcp open  mysql       MySQL 5.6.49`
  },
  {
    id: 'gobuster',
    name: 'Gobuster',
    description: 'Directory enumeration',
    icon: '📁',
    toolType: 'gobuster',
    example: `/admin                (Status: 301) [Size: 312]
/login                (Status: 200) [Size: 1234]
/upload               (Status: 301) [Size: 315]
/.git                 (Status: 301) [Size: 308]
/config.php           (Status: 200) [Size: 0]
/backup               (Status: 301) [Size: 310]
/phpinfo.php          (Status: 200) [Size: 89741]`
  },
  {
    id: 'enum4linux',
    name: 'Enum4linux',
    description: 'SMB enumeration',
    icon: '🪟',
    toolType: 'enum4linux',
    example: `[+] Got OS info for 10.10.10.1 from smbclient: Domain=[WORKGROUP] OS=[Windows 6.1] Server=[Samba 4.7.6]
[+] Users: administrator, guest, zack
[+] Share: //10.10.10.1/IPC$   Mapping: OK Listing: DENIED
[+] Share: //10.10.10.1/backup Mapping: OK Listing: OK
[+] Password Policy: Min length: 0, Complexity: Disabled`
  },
  {
    id: 'smbclient',
    name: 'SMBClient',
    description: 'Share enumeration',
    icon: '📂',
    toolType: 'SMBClient',
    example: `Sharename       Type      Comment
---------       ----      -------
ADMIN$          Disk      Remote Admin
C$              Disk      Default share
IPC$            IPC       Remote IPC
backup          Disk
Users           Disk`
  },
  {
    id: 'crackmapexec',
    name: 'CrackMapExec',
    description: 'SMB/AD enumeration',
    icon: '⚡',
    toolType: 'CrackMapExec',
    example: `[*] 10.10.10.1:445 - SMB: WORKGROUP\\10.10.10.1
[+] 10.10.10.1:445 - WORKGROUP\\ZACK:password123 (Pwn3d!)
[*] 10.10.10.1:445 - SMB: enumerating shares
[+] 10.10.10.1:445 - found share: ADMIN$
[+] 10.10.10.1:445 - found share: C$
[+] 10.10.10.1:445 - found share: IPC$
[+] 10.10.10.1:445 - found share: Users`
  },
  {
    id: 'bloodhound',
    name: 'BloodHound',
    description: 'AD attack path analysis',
    icon: '🩸',
    toolType: 'BloodHound',
    example: `[+] Collection completed
[+] 23 Users
[+] 15 Groups
[+] 12 Computers
[+] 8 Domain Admins
[+] Path: ZACK -> DOMAIN_ADMINS (via Group Membership)
[+] Path: ZACK -> DOMAIN_ADMINS (via ACL abuse)
[+] High Value Targets: DC01, EXCHANGE01`
  }
]

const TOOL_EXAMPLES = ANALYSIS_TEMPLATES.map(t => ({
  label: t.name,
  value: t.example,
  toolType: t.toolType
}))

// ─── COPY BUTTON WITH FALLBACK ───

function isSafeHttpUrl(href: string): boolean {
  try {
    const u = new URL(href)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])
  
  const handleCopy = useCallback(async () => {
    const showSuccess = () => {
      setCopied(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 2000)
    }

    const fallback = () => {
      try {
        const el = document.createElement('textarea')
        el.value = text
        el.style.position = 'fixed'
        el.style.opacity = '0'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        showSuccess()
      } catch {
        console.debug('Copy fallback failed')
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        showSuccess()
      } catch {
        fallback()
      }
    } else {
      fallback()
    }
  }, [text])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-white/40 hover:text-cyan-400 transition-colors flex-shrink-0"
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
    >
      {copied ? <><Check size={10} className="text-emerald-400" />copied</> : <><Copy size={10} />copy</>}
    </button>
  )
}

// ─── OLLAMA STATUS INDICATOR ───

function OllamaStatusIndicator({ available, model }: { available: boolean | null; model: string }) {
  if (available === null) {
    return <span className="text-xs text-white/40 flex items-center gap-1"><AlertCircle size={11} /> checking...</span>
  }
  if (!available) {
    return <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={11} /> offline</span>
  }
  return (
    <span className="text-xs text-emerald-400/70 flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      {model}
    </span>
  )
}

// ─── MAIN COMPONENT ───

export default function ServiceAnalyzer() {
  const [toolOutput, setToolOutput]   = useState('')
  const [toolType, setToolType]       = useState('Auto-detect')
  const [target, setTarget]           = useState('')
  const [result, setResult]           = useState<AnalysisResult | null>(null)
  const [analyzing, setAnalyzing]     = useState(false)
  const [expandedFindings, setExpandedFindings] = useState<Set<number>>(new Set())
  const [error, setError]             = useState('')
  const [activeTab, setActiveTab]     = useState<'analyzer' | 'history'>('analyzer')
  const [showBeginnerTips, setShowBeginnerTips] = useState(true)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>(() => {
    try {
      const saved = localStorage.getItem('service_analyses')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [notes, setNotes] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [filterSeverity, setFilterSeverity] = useState('All')
  const [filterTool, setFilterTool] = useState('All')
  const [sortBy, setSortBy] = useState<'date' | 'severity' | 'services'>('date')
  const [showStats] = useState(true)
  const [currentAnalysisId, setCurrentAnalysisId] = useState<string | null>(null)
  // ─── ModelManager Integration ──────────────────────────────────────────────
  const activeModel = useActiveModel()
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null)
  const [ollamaError, setOllamaError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef('')

  // ─── Check Ollama Availability ────────────────────────────────────────────
  useEffect(() => {
    async function checkOllama() {
      try {
        const response = await fetch(`${OLLAMA_HOST}/api/version`)
        setOllamaAvailable(response.ok)
        if (!response.ok) setOllamaError(`HTTP ${response.status}`)
      } catch {
        setOllamaAvailable(false)
        setOllamaError('Connection refused')
      }
    }
    checkOllama()
  }, [])

  // Keep notesRef in sync
  useEffect(() => {
    notesRef.current = notes
  }, [notes])

  // ─── PERSIST WITH QUOTA ERROR HANDLING ───

  useEffect(() => {
    try {
      localStorage.setItem('service_analyses', JSON.stringify(savedAnalyses))
      setError(prev => prev.includes('quota') || prev === 'Failed to save analysis' ? '' : prev)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        console.error('service_analyses: localStorage quota exceeded')
        setError('Saved analyses are not persisting — storage quota exceeded')
      } else {
        console.error('Failed to save analyses:', err)
        setError('Failed to save analysis')
      }
    }
  }, [savedAnalyses])

  // ─── MEMOIZED STATS ───

  const stats = useMemo(() => {
    const total = savedAnalyses.length
    const critical = savedAnalyses.filter(a => a.findings.some(f => f.severity === 'critical')).length
    const high = savedAnalyses.filter(a => a.findings.some(f => f.severity === 'high')).length
    const totalServices = savedAnalyses.reduce((sum, a) => sum + a.services.length, 0)
    return { total, critical, high, totalServices }
  }, [savedAnalyses])

  // ─── FILTERED ANALYSES ───

  const filteredAnalyses = useMemo(() => {
    return savedAnalyses
      .filter(a => {
        // Both filters apply together (AND). Previous logic short-circuited tool filter.
        if (filterSeverity !== 'All' && !a.findings.some(f => f.severity === filterSeverity)) {
          return false
        }
        if (filterTool !== 'All' && a.toolType !== filterTool) {
          return false
        }
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'date') return b.timestamp - a.timestamp
        if (sortBy === 'severity') {
          const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }
          const getWorst = (analysis: SavedAnalysis) => {
            if (analysis.findings.length === 0) return -1
            return Math.max(...analysis.findings.map(f => order[f.severity] ?? 0))
          }
          return getWorst(b) - getWorst(a)
        }
        if (sortBy === 'services') {
          return b.services.length - a.services.length
        }
        return 0
      })
  }, [savedAnalyses, filterSeverity, filterTool, sortBy])

  // ─── UNIQUE TOOL TYPES ───

  const toolTypes = useMemo(() => {
    return ['All', ...new Set(savedAnalyses.map(a => a.toolType))]
  }, [savedAnalyses])

  // ─── TOGGLE FINDING ───

  const toggleFinding = useCallback((i: number) => {
    setExpandedFindings(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }, [])

  // ─── ANALYZE ───

  const analyze = useCallback(async () => {
    if (!toolOutput.trim()) {
      setError('Please paste tool output to analyze')
      return
    }

    if (!ollamaAvailable) {
      setError(`⚠️ Ollama is not running (${ollamaError || 'connection failed'}). Please start Ollama and try again.`)
      return
    }

    setAnalyzing(true)
    setResult(null)
    setError('')

    try {
      const model = activeModel || 'qwen2.5-coder:3b'
      
      const text = await ollamaChatOnce(
        model,
        [
          {
            role: 'system',
            content: `You are an expert penetration tester analyzing tool output. Respond ONLY with valid JSON, no markdown, no extra text.
The JSON must have exactly these keys:
- services: array of {port, protocol, state, service, version}
- findings: array of {port, service, severity (critical/high/medium/low/info), title, detail, tools: string[], commands: string[], references: string[]}
- nextSteps: array of strings (specific enumeration/exploitation steps)
- attackSurface: string (1-2 sentence summary of overall attack surface)
- cveReferences: array of strings (relevant CVEs if any)
- quickWins: array of strings (quick wins found)`,
          },
          {
            role: 'user',
            content: `Tool type: ${toolType}\nTarget: ${target || 'unknown'}\n\nAnalyze this output and return JSON:\n\n${toolOutput}`,
          },
        ],
        { temperature: 0.35 },
      )
      const cleaned = (text ?? '').replace(/```json|```/g, '').trim()
      if (!cleaned) throw new Error('Empty response from Ollama')

      const parsed = JSON.parse(cleaned)
      if (!parsed.services || !parsed.findings || !parsed.nextSteps || !parsed.attackSurface) {
        throw new Error('Invalid response structure from model')
      }

      setResult(parsed)
      setExpandedFindings(new Set(parsed.findings?.map((_: Finding, i: number) => i).slice(0, 3) ?? []))
      
      const analysisId = crypto.randomUUID()
      setCurrentAnalysisId(analysisId)
      const newAnalysis: SavedAnalysis = {
        id: analysisId,
        timestamp: Date.now(),
        target: target || 'unknown',
        toolType: toolType,
        services: parsed.services,
        findings: parsed.findings,
        nextSteps: parsed.nextSteps,
        attackSurface: parsed.attackSurface,
        notes: notesRef.current || undefined,
        favorite: false
      }
      
      const sixtySecondsAgo = Date.now() - 60_000
      setSavedAnalyses(prev => {
        const filtered = prev.filter(a => 
          !(a.target === (target || 'unknown') && 
            a.toolType === toolType && 
            a.timestamp > sixtySecondsAgo)
        )
        return [newAnalysis, ...filtered]
      })
      
    } catch (err: any) {
      setError(`Analysis failed: ${err.message || 'Unknown error'}`)
      console.error(err)
    } finally {
      setAnalyzing(false)
    }
  }, [toolOutput, toolType, target, activeModel, ollamaAvailable, ollamaError])

  // ─── RESET ───

  const reset = useCallback(() => {
    setToolOutput('')
    setResult(null)
    setError('')
    setTarget('')
    setNotes('')
    setCurrentAnalysisId(null)
  }, [])

  // ─── SAVE NOTES ───

  const saveNotes = useCallback(() => {
    if (!currentAnalysisId) return
    setSavedAnalyses(prev => prev.map(a => 
      a.id === currentAnalysisId ? { ...a, notes: notes || undefined } : a
    ))
    setEditingNote(false)
  }, [currentAnalysisId, notes])

  // ─── CRUD OPERATIONS ───

  const deleteAnalysis = useCallback((id: string) => {
    if (!confirm(`Delete "${savedAnalyses.find(a => a.id === id)?.target || 'analysis'}"?`)) return
    setSavedAnalyses(prev => prev.filter(a => a.id !== id))
  }, [savedAnalyses])

  const toggleFavorite = useCallback((id: string) => {
    setSavedAnalyses(prev => prev.map(a => 
      a.id === id ? { ...a, favorite: !a.favorite } : a
    ))
  }, [])

  const loadAnalysis = useCallback((analysis: SavedAnalysis) => {
    setResult({
      services: analysis.services,
      findings: analysis.findings,
      nextSteps: analysis.nextSteps,
      attackSurface: analysis.attackSurface,
      cveReferences: [],
      quickWins: []
    })
    setTarget(analysis.target)
    setToolType(analysis.toolType)
    setNotes(analysis.notes || '')
    setCurrentAnalysisId(analysis.id)
    setActiveTab('analyzer')
    setExpandedFindings(new Set(analysis.findings?.map((_: Finding, i: number) => i).slice(0, 3) ?? []))
  }, [])

  const clearAllAnalyses = useCallback(() => {
    if (savedAnalyses.length === 0) return
    if (!confirm(`Delete all ${savedAnalyses.length} saved analyses? This cannot be undone.`)) return
    setSavedAnalyses([])
  }, [savedAnalyses.length])

  const exportAnalyses = useCallback(() => {
    if (savedAnalyses.length === 0) {
      setError('No analyses to export')
      return
    }
    try {
      const data = JSON.stringify(savedAnalyses)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `service_analyses_${new Date().toISOString().slice(0,10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to export analyses')
    }
  }, [savedAnalyses])

  const importAnalyses = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onerror = () => setError('Failed to read import file')
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (!Array.isArray(data)) {
          setError('Invalid file format: expected JSON array')
          return
        }
        if (data.length === 0) {
          setError('File contains no analyses')
          return
        }
        const normalized: SavedAnalysis[] = data
          .filter((a: unknown): a is Record<string, unknown> => !!a && typeof a === 'object')
          .map((a) => ({
            id: typeof a.id === 'string' && a.id ? a.id : crypto.randomUUID(),
            timestamp: typeof a.timestamp === 'number' ? a.timestamp : Date.now(),
            target: typeof a.target === 'string' ? a.target : 'unknown',
            toolType: typeof a.toolType === 'string' ? a.toolType : 'unknown',
            services: Array.isArray(a.services) ? a.services as Service[] : [],
            findings: Array.isArray(a.findings) ? a.findings as Finding[] : [],
            nextSteps: Array.isArray(a.nextSteps) ? a.nextSteps as string[] : [],
            attackSurface: typeof a.attackSurface === 'string' ? a.attackSurface : '',
            notes: typeof a.notes === 'string' ? a.notes : undefined,
            favorite: Boolean(a.favorite),
          }))
        if (normalized.length === 0) {
          setError('Import file had no usable analyses')
          return
        }
        const incomingIds = new Set(normalized.map(a => a.id))
        setSavedAnalyses(prev => {
          const filtered = prev.filter(a => !incomingIds.has(a.id))
          return [...normalized, ...filtered]
        })
        setError('')
      } catch (err) {
        console.error('Import error:', err)
        setError('Failed to import analyses: invalid JSON')
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // ─── APPLY TEMPLATE ───

  const applyTemplate = useCallback((template: AnalysisTemplate) => {
    setToolOutput(template.example)
    setToolType(template.toolType)
    setResult(null)
    setError('')
    setActiveTab('analyzer')
    setShowTemplatePicker(false)
  }, [])

  // ─── COMPUTED VALUES ───

  const sortedFindings = result?.findings
    ? [...result.findings].sort((a, b) => 
        SEVERITY_PRIORITY[a.severity] - SEVERITY_PRIORITY[b.severity]
      )
    : []

  // ─── RENDER ───

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-purple-500/20" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.18), rgba(168,85,247,0.04))' }}>
            <Search size={16} className="text-purple-400" />
          </div>
          <div>
            <span className="text-white font-bold text-base">Lynceus</span>
            <div className="text-white/40 text-xs flex items-center gap-2">
              Parse tool output · identify attack vectors
              <OllamaStatusIndicator available={ollamaAvailable} model={activeModel || 'No model'} />
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="flex bg-white/5 border border-white/10 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setActiveTab('analyzer')}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors ${
                activeTab === 'analyzer'
                  ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40'
                  : 'text-white/50 hover:text-white/80 border border-transparent'
              }`}
            >
              <Search size={12} /> Analyzer
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors ${
                activeTab === 'history'
                  ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40'
                  : 'text-white/50 hover:text-white/80 border border-transparent'
              }`}
            >
              <History size={12} />
              Saved {savedAnalyses.length > 0 && `(${savedAnalyses.length})`}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowBeginnerTips(!showBeginnerTips)}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20"
          >
            <BookOpen size={12} />
            {showBeginnerTips ? 'Hide Tips' : 'Show Tips'}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('analyzer')
              setShowTemplatePicker(v => !v)
            }}
            className="flex items-center gap-1.5 text-xs text-purple-400/70 hover:text-purple-400 transition-colors px-3 py-1.5 rounded-full border border-purple-500/20 hover:border-purple-500/40"
          >
            <Layers size={12} /> Templates
          </button>
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
            ollamaAvailable === true
              ? 'border-emerald-500/30 text-emerald-400/70'
              : ollamaAvailable === null
                ? 'border-white/15 text-white/40'
                : 'border-red-500/30 text-red-400/70'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              ollamaAvailable === true ? 'bg-emerald-400 animate-pulse' : ollamaAvailable === null ? 'bg-white/30' : 'bg-red-400'
            }`} />
            {ollamaAvailable === true ? 'Online' : ollamaAvailable === null ? 'Checking…' : 'Offline'}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="px-8 py-6 max-w-6xl mx-auto">

        {/* Ollama Offline Warning */}
        {ollamaAvailable === false && (
          <div className="mb-6 p-3 rounded-xl border border-red-500/20 bg-red-500/5 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle size={13} /> Ollama is not running at {OLLAMA_HOST}. Analysis functionality is disabled.
          </div>
        )}

        {/* Template Picker (analyzer only) */}
        {activeTab === 'analyzer' && showTemplatePicker && (
          <div className="mb-6 p-4 rounded-2xl border border-purple-500/20 bg-purple-500/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-purple-400 text-xs font-semibold tracking-wider flex items-center gap-2">
                <Layers size={14} /> Analysis Templates
              </span>
              <button onClick={() => setShowTemplatePicker(false)} className="text-white/40 hover:text-white/60 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ANALYSIS_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                  className="p-3 bg-white/5 border border-white/5 hover:border-purple-500/30 rounded-xl text-left transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{template.icon}</span>
                    <span className="text-xs text-white font-semibold">{template.name}</span>
                  </div>
                  <div className="text-[10px] text-white/40 mt-0.5">{template.description}</div>
                  <div className="text-[9px] text-white/30 font-mono mt-0.5">Tool: {template.toolType}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Beginner Tips (analyzer only) */}
        {activeTab === 'analyzer' && showBeginnerTips && (
          <div className="mb-6 p-4 rounded-2xl border border-amber-500/10 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-amber-400" />
              <span className="text-amber-400 text-xs font-semibold tracking-wider">Service Analysis Tips</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/60">
              {[
                'Start with nmap to discover open ports and services',
                'Version detection (-sV) is crucial for vulnerability identification',
                'Combine multiple tools for comprehensive enumeration',
                'Check findings for CVE references and exploitation paths'
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">•</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats Bar */}
        {showStats && savedAnalyses.length > 0 && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
              <div className="text-white/40">Total</div>
              <div className="text-white font-bold text-lg">{stats.total}</div>
            </div>
            <div className="bg-white/5 border border-red-400/20 rounded-xl p-3 text-center">
              <div className="text-red-400/60">Critical</div>
              <div className="text-red-400 font-bold text-lg">{stats.critical}</div>
            </div>
            <div className="bg-white/5 border border-amber-400/20 rounded-xl p-3 text-center">
              <div className="text-amber-400/60">High</div>
              <div className="text-amber-400 font-bold text-lg">{stats.high}</div>
            </div>
            <div className="bg-white/5 border border-purple-400/20 rounded-xl p-3 text-center">
              <div className="text-purple-400/60">Services</div>
              <div className="text-purple-400 font-bold text-lg">{stats.totalServices}</div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-3 rounded-xl border border-red-500/20 bg-red-500/5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertTriangle size={13} />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError('')}
              className="text-white/30 hover:text-white/60 transition-colors"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Analyzer Tab ── */}
        {activeTab === 'analyzer' && (
          <>
            {/* Input section */}
            {!result ? (
              <div className="space-y-4">
                {/* Tool type + target */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-white/40 text-xs font-semibold tracking-wider block mb-2">Tool Type</label>
                    <select
                      value={toolType}
                      onChange={e => setToolType(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white/80 text-xs font-mono focus:outline-none focus:border-purple-500/30 transition-colors"
                    >
                      {['Auto-detect','nmap','gobuster','ffuf','enum4linux','SMBClient','LDAPSearch','CrackMapExec','BloodHound','nikto','WPScan','Other'].map(t => (
                        <option key={t} value={t} style={{ background: '#0d1022' }}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-white/40 text-xs font-semibold tracking-wider block mb-2">Target (optional)</label>
                    <input
                      value={target}
                      onChange={e => setTarget(e.target.value)}
                      placeholder="e.g. 10.10.10.1 or example.com"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white/80 text-xs font-mono focus:outline-none focus:border-purple-500/30 placeholder-white/20 transition-colors"
                    />
                  </div>
                </div>

                {/* Quick examples */}
                <div>
                  <div className="text-white/40 text-xs mb-2">Load example output:</div>
                  <div className="flex gap-2 flex-wrap">
                    {TOOL_EXAMPLES.map(ex => (
                      <button
                        key={ex.label}
                        onClick={() => { setToolOutput(ex.value); setToolType(ex.toolType || 'Auto-detect') }}
                        className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-full font-mono text-white/50 hover:text-white/80 hover:border-purple-500/30 transition-colors"
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Output textarea */}
                <div>
                  <label className="text-white/40 text-xs font-semibold tracking-wider block mb-2">Tool Output</label>
                  <textarea
                    value={toolOutput}
                    onChange={e => setToolOutput(e.target.value)}
                    placeholder="Paste nmap, gobuster, ffuf, enum4linux, smbclient, ldapsearch, crackmapexec, or bloodhound output here..."
                    rows={12}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-emerald-400 text-xs font-mono focus:outline-none focus:border-purple-500/30 placeholder-white/20 resize-none transition-colors"
                  />
                </div>

                <button
                  onClick={analyze}
                  disabled={analyzing || !toolOutput.trim() || !ollamaAvailable}
                  className="w-full py-3.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: 'linear-gradient(90deg, #7c3aed, #4f46e5)' }}
                >
                  <Cpu size={14} />
                  {analyzing ? 'AI Analyzing…' : 'Analyze Output'}
                </button>

                {analyzing && (
                  <div className="flex items-center justify-center gap-3 py-4">
                    {[0,150,300].map(d => (
                      <div key={d} className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: d + 'ms' }} />
                    ))}
                    <span className="text-white/40 text-sm font-mono">Parsing services and identifying attack vectors…</span>
                  </div>
                )}
              </div>
            ) : (
              // Results
              <div className="space-y-4">

                {/* Attack surface summary */}
                <div className="bg-white/5 border border-purple-500/20 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400 text-xs font-bold flex items-center gap-1.5">
                        <Target size={12} /> Attack Surface Assessment
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingNote(!editingNote)}
                        className="text-xs text-white/40 hover:text-purple-400 transition-colors"
                      >
                        {editingNote ? 'Cancel' : 'Add Note'}
                      </button>
                      <button
                        onClick={reset}
                        className="flex items-center gap-1 text-xs text-white/40 hover:text-red-400 transition-colors"
                      >
                        <RotateCw size={11} /> New Analysis
                      </button>
                    </div>
                  </div>
                  <p className="text-white/80 text-sm leading-relaxed selectable">{result.attackSurface}</p>
                  
                  {/* Notes section */}
                  {editingNote && (
                    <div className="mt-3">
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Add notes about this analysis..."
                        rows={2}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 font-mono focus:outline-none focus:border-purple-500/30"
                      />
                      <button
                        onClick={saveNotes}
                        className="mt-2 px-4 py-1.5 bg-purple-500/20 text-purple-400 text-xs font-mono rounded-xl hover:bg-purple-500/30 border border-purple-500/30 transition-colors"
                      >
                        Save Notes
                      </button>
                    </div>
                  )}
                  {notes && !editingNote && (
                    <div className="mt-2 text-white/40 text-sm flex items-center gap-1.5">
                      <span>📝</span> {notes}
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Services',   value: result.services?.length ?? 0, color: 'text-cyan-400' },
                    { label: 'Findings',   value: result.findings?.length ?? 0, color: 'text-red-400' },
                    { label: 'Critical',   value: result.findings?.filter(f => f.severity === 'critical').length ?? 0, color: 'text-red-400' },
                    { label: 'Next Steps', value: result.nextSteps?.length ?? 0, color: 'text-emerald-400' },
                  ].map(s => (
                    <div key={s.label} className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                      <div className={"text-2xl font-bold font-mono " + s.color}>{s.value}</div>
                      <div className="text-white/40 text-xs mt-1">{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Services table */}
                {result.services?.length > 0 && (
                  <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
                      <span className="text-cyan-400 text-xs font-bold flex items-center gap-1.5">
                        <Zap size={12} /> Discovered Services
                      </span>
                      <span className="text-white/40 text-xs ml-auto">{result.services.length} found</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-white/5">
                            {['Port','Protocol','State','Service','Version'].map(h => (
                              <th key={h} className="text-left px-5 py-2.5 text-white/40 font-normal">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.services.map((s, i) => (
                            <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="px-5 py-2.5 text-cyan-400 font-bold">{s.port}</td>
                              <td className="px-5 py-2.5 text-white/40">{s.protocol}</td>
                              <td className="px-5 py-2.5">
                                <span className={s.state === 'open' ? 'text-emerald-400' : s.state === 'filtered' ? 'text-amber-400' : 'text-red-400'}>
                                  {s.state}
                                </span>
                              </td>
                              <td className="px-5 py-2.5 text-white/80">{s.service}</td>
                              <td className="px-5 py-2.5 text-white/40">{s.version || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* CVE References */}
                {result.cveReferences && result.cveReferences.length > 0 && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
                    <div className="text-red-400 text-xs font-bold mb-2 flex items-center gap-1.5">
                      <AlertTriangle size={12} /> CVE References
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.cveReferences.map((cve, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded-full font-mono text-red-400">
                          {cve}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Findings */}
                {sortedFindings.length > 0 && (
                  <div>
                    <div className="text-white/60 text-xs font-bold mb-3 flex items-center gap-1.5">
                      <AlertTriangle size={12} className="text-amber-400" /> Findings ({sortedFindings.length})
                    </div>
                    <div className="space-y-2">
                      {sortedFindings.map((f, i) => (
                        <div key={i} className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all">
                          <button
                            onClick={() => toggleFinding(i)}
                            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-left"
                          >
                            <span className={"text-[10px] px-2 py-0.5 rounded-full border font-mono flex-shrink-0 " + SEVERITY_COLOR[f.severity]}>
                              {f.severity}
                            </span>
                            <span className="text-white/80 text-xs flex-1 text-left">{f.title}</span>
                            <span className="text-white/30 text-xs font-mono">{f.port}</span>
                            {expandedFindings.has(i)
                              ? <ChevronUp size={12} className="text-white/30" />
                              : <ChevronDown size={12} className="text-white/30" />}
                          </button>

                          {expandedFindings.has(i) && (
                            <div className="border-t border-white/5 p-5 space-y-3">
                              <p className="text-white/60 text-sm leading-relaxed selectable">{f.detail}</p>

                              {f.tools?.length > 0 && (
                                <div>
                                  <div className="text-white/40 text-xs mb-1.5 flex items-center gap-1.5">
                                    <Wrench size={10} /> Recommended Tools
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {f.tools.map((t, ti) => (
                                      <span key={ti} className="text-xs px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full font-mono text-cyan-400">
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {f.commands?.length > 0 && (
                                <div>
                                  <div className="text-white/40 text-xs mb-1.5 flex items-center gap-1.5">
                                    <Terminal size={10} /> Commands
                                  </div>
                                  <div className="space-y-1.5">
                                    {f.commands.map((cmd, ci) => (
                                      <div key={ci} className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-1.5">
                                        <code className="text-emerald-400 text-xs font-mono flex-1 overflow-x-auto selectable">{cmd}</code>
                                        <CopyBtn text={cmd} />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {(f.references?.length ?? 0) > 0 && (
                                <div>
                                  <div className="text-white/40 text-xs mb-1.5">References</div>
                                  <ul className="space-y-1">
                                    {(f.references ?? []).map((ref, ri) => (
                                      <li key={ri}>
                                        {isSafeHttpUrl(ref) ? (
                                          <a
                                            href={ref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-cyan-400 text-xs hover:text-cyan-300 transition-colors flex items-center gap-1 break-all"
                                          >
                                            {ref} <ExternalLink size={10} className="flex-shrink-0" />
                                          </a>
                                        ) : (
                                          <span className="text-white/50 text-xs break-all">{ref}</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Wins */}
                {result.quickWins && result.quickWins.length > 0 && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
                    <div className="text-emerald-400 text-xs font-bold mb-2 flex items-center gap-1.5">
                      <Zap size={12} /> Quick Wins
                    </div>
                    <ul className="space-y-1">
                      {result.quickWins.map((win, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-white/80">
                          <span className="text-emerald-400">✓</span>
                          <span>{win}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Next steps */}
                {result.nextSteps?.length > 0 && (
                  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
                    <div className="text-emerald-400 text-xs font-bold mb-3 flex items-center gap-1.5">
                      <Target size={12} /> Recommended Next Steps
                    </div>
                    <ol className="space-y-2">
                      {result.nextSteps.map((step, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-white/80">
                          <span className="text-emerald-400 font-mono text-xs mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, '0')}.</span>
                          <span className="flex-1 leading-relaxed">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Analyze again */}
                <button
                  onClick={reset}
                  className="w-full py-3 border border-white/10 rounded-xl text-white/40 hover:text-white/80 hover:border-white/20 transition-colors text-xs flex items-center justify-center gap-2"
                >
                  <RotateCw size={11} /> Analyze New Output
                </button>
              </div>
            )}
          </>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-white/40 text-xs font-mono">
                {savedAnalyses.length} saved analyses
              </div>
              <div className="flex gap-2 flex-wrap">
                <select
                  value={filterSeverity}
                  onChange={e => setFilterSeverity(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-purple-500/30"
                >
                  <option value="All" style={{ background: '#0d1022' }}>All Severities</option>
                  <option value="critical" style={{ background: '#0d1022' }}>Critical</option>
                  <option value="high" style={{ background: '#0d1022' }}>High</option>
                  <option value="medium" style={{ background: '#0d1022' }}>Medium</option>
                  <option value="low" style={{ background: '#0d1022' }}>Low</option>
                </select>
                
                <select
                  value={filterTool}
                  onChange={e => setFilterTool(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-purple-500/30"
                >
                  {toolTypes.map(t => (
                    <option key={t} value={t} style={{ background: '#0d1022' }}>{t}</option>
                  ))}
                </select>
                
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-purple-500/30"
                >
                  <option value="date" style={{ background: '#0d1022' }}>Sort by Date</option>
                  <option value="severity" style={{ background: '#0d1022' }}>Sort by Severity</option>
                  <option value="services" style={{ background: '#0d1022' }}>Sort by Services</option>
                </select>
                
                <button 
                  onClick={exportAnalyses} 
                  disabled={savedAnalyses.length === 0}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors px-3 py-2 border border-white/10 rounded-xl disabled:opacity-40"
                >
                  <Download size={12} /> Export
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors px-3 py-2 border border-white/10 rounded-xl"
                >
                  <Upload size={12} /> Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={importAnalyses}
                  className="hidden"
                />
                <button 
                  onClick={clearAllAnalyses} 
                  disabled={savedAnalyses.length === 0}
                  className="flex items-center gap-1 text-xs text-red-400/50 hover:text-red-400 transition-colors px-3 py-2 border border-red-500/20 rounded-xl disabled:opacity-40"
                >
                  <Trash2 size={12} /> Clear All
                </button>
              </div>
            </div>

            {filteredAnalyses.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                <Search size={32} className="text-white/20 mx-auto mb-3" />
                <div className="text-white/40 text-sm font-mono">
                  {savedAnalyses.length === 0 ? 'No saved analyses' : 'No analyses match these filters'}
                </div>
                <div className="text-white/20 text-xs mt-1">
                  {savedAnalyses.length === 0
                    ? 'Run an analysis to save it automatically'
                    : 'Try clearing severity or tool filters'}
                </div>
                {savedAnalyses.length > 0 && (filterSeverity !== 'All' || filterTool !== 'All') && (
                  <button
                    type="button"
                    onClick={() => { setFilterSeverity('All'); setFilterTool('All') }}
                    className="mt-3 text-xs text-purple-400 hover:text-purple-300"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAnalyses.map(a => (
                  <div key={a.id} className="bg-white/5 border border-white/5 rounded-xl p-4 hover:border-purple-500/20 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => loadAnalysis(a)}
                            className="text-purple-400 hover:text-purple-300 font-mono text-sm font-bold transition-colors truncate"
                          >
                            {a.target}
                          </button>
                          <span className="text-white/40 text-xs flex-shrink-0">{a.toolType}</span>
                          <span className="text-white/30 text-xs flex-shrink-0">
                            {new Date(a.timestamp).toLocaleString()}
                          </span>
                          {a.favorite && (
                            <Star size={12} className="text-yellow-400 flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-white/40 text-xs">
                            {a.services.length} services
                          </span>
                          <span className="text-white/20 text-xs">•</span>
                          <span className="text-red-400 text-xs">
                            {a.findings.filter(f => f.severity === 'critical').length} critical
                          </span>
                          <span className="text-white/20 text-xs">•</span>
                          <span className="text-amber-400 text-xs">
                            {a.findings.filter(f => f.severity === 'high').length} high
                          </span>
                          {a.notes && (
                            <>
                              <span className="text-white/20 text-xs">•</span>
                              <span className="text-white/40 text-xs truncate max-w-[100px]">📝 {a.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => toggleFavorite(a.id)}
                          className="p-1.5 rounded-lg text-white/30 hover:text-yellow-400 transition-colors"
                          title="Toggle favorite"
                        >
                          <Star size={14} className={a.favorite ? 'text-yellow-400' : ''} />
                        </button>
                        <button
                          onClick={() => loadAnalysis(a)}
                          className="p-1.5 rounded-lg text-white/30 hover:text-purple-400 transition-colors"
                          title="Load analysis"
                        >
                          <Play size={14} />
                        </button>
                        <button
                          onClick={() => deleteAnalysis(a.id)}
                          className="p-1.5 rounded-lg text-white/30 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        .animate-bounce { animation: bounce 1.2s ease-in-out infinite; }
      `}} />
    </div>
  )
}

