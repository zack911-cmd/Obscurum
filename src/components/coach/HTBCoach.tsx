'use client'

import { useState, useRef, useEffect, useCallback, useMemo, type ChangeEvent } from 'react'
import { 
  Flag, Send, RotateCcw, ChevronRight, Cpu, Lock, 
  BookOpen, Zap, Target, Wrench, Download, 
  Upload, Trash2, History, Star, 
  Search, 
  FileText, AlertTriangle, 
  Play,
  AlertCircle
} from 'lucide-react'
import { useActiveModel, setActiveModel } from '../models/ModelManager'

// ─── TYPES ───
type Tab = 'coach' | 'history' | 'resources'

type Stage = {
  id: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  hints: string[];
  beginnerTips?: string[];
  kaliTools?: string[];
  commonMistakes?: string[];
}

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  stage?: string;
  timestamp?: number;
}

type MachineInfo = {
  name: string;
  os: string;
  difficulty: string;
  platform: string;
}

type SavedSession = {
  id: string;
  timestamp: number;
  machine: MachineInfo;
  stage: string;
  messages: Message[];
  completedStages: string[];
  notes?: string;
  favorite?: boolean;
  tags?: string[];
}

type OllamaModel = {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

// ─── CONSTANTS ───
const OLLAMA_HOST = 'http://127.0.0.1:11434'

const STAGES: Stage[] = [
  {
    id: 'recon',
    label: 'Recon',
    icon: '🔭',
    color: 'text-ghost-accent',
    description: 'Passive & active reconnaissance',
    hints: ['Start with nmap -sC -sV', 'Check for subdomains', 'Google the target name', 'Look up technologies on Wappalyzer'],
    beginnerTips: [
      'Begin with a basic nmap scan to see what ports are open',
      'Use Google Dorks to find public information about the target',
      'Check DNS records with tools like dig or nslookup'
    ],
    kaliTools: ['nmap', 'dnsrecon', 'theHarvester', 'sublist3r'],
    commonMistakes: [
      'Not scanning all ports (use -p- for full scan)',
      'Ignoring UDP ports',
      'Not performing version detection (-sV)'
    ]
  },
  {
    id: 'enum',
    label: 'Enumeration',
    icon: '🔍',
    color: 'text-ghost-accent-2',
    description: 'Deep service & directory enumeration',
    hints: ['Gobuster/ffuf for directories', 'Enum4linux for SMB', 'Check robots.txt', 'Look for version numbers'],
    beginnerTips: [
      'Always enumerate all open ports, not just common ones',
      'Check HTTP headers for server information',
      'Look for hidden directories and files with fuzzing tools'
    ],
    kaliTools: ['gobuster', 'ffuf', 'enum4linux', 'nikto'],
    commonMistakes: [
      'Using only default wordlists',
      'Not checking all HTTP methods',
      'Ignoring SSL/TLS certificates'
    ]
  },
  {
    id: 'exploit',
    label: 'Exploitation',
    icon: '💥',
    color: 'text-ghost-red',
    description: 'Initial access & foothold',
    hints: ['Check searchsploit for versions found', 'Look for default credentials', 'Check CVEs for services', 'Try SQLi / LFI / RFI'],
    beginnerTips: [
      'Search for public exploits matching service versions',
      'Try default credentials before complex attacks',
      'Always test exploits in a safe environment first'
    ],
    kaliTools: ['searchsploit', 'msfconsole', 'sqlmap', 'exploitdb'],
    commonMistakes: [
      'Not verifying exploit works before use',
      'Forgetting to set LHOST/LPORT',
      'Not checking if target is patched'
    ]
  },
  {
    id: 'privesc',
    label: 'PrivEsc',
    icon: '👑',
    color: 'text-ghost-yellow',
    description: 'Privilege escalation to root/admin',
    hints: ['Run sudo -l first', 'Check SUID binaries', 'Look at cron jobs', 'Run linpeas / winpeas'],
    beginnerTips: [
      'Check what sudo permissions you have first',
      'Look for SUID binaries that can be exploited',
      'Run automated enumeration scripts to find vectors'
    ],
    kaliTools: ['linpeas', 'winpeas', 'pspy', 'suid3num'],
    commonMistakes: [
      'Not checking all privilege escalation vectors',
      'Ignoring cron jobs',
      'Not checking for writable files'
    ]
  },
  {
    id: 'post',
    label: 'Post-Exploit',
    icon: '🏴',
    color: 'text-ghost-green',
    description: 'Persistence, loot & flags',
    hints: ['Grab both flags', 'Check for other users', 'Look for credentials', 'Document your steps'],
    beginnerTips: [
      'Always collect both user and root flags',
      'Look for credentials in common locations',
      'Document your methodology for future reference'
    ],
    kaliTools: ['mimikatz', 'john', 'hashcat', 'bloodhound'],
    commonMistakes: [
      'Forgetting to check for other users',
      'Not looking for backup files',
      'Ignoring hidden directories'
    ]
  },
]

const PLATFORMS = ['Hack The Box', 'TryHackMe', 'VulnHub', 'PentesterLab', 'PortSwigger']
const OS_LIST   = ['Linux', 'Windows', 'FreeBSD', 'Other']
const DIFF_LIST = ['Easy', 'Medium', 'Hard', 'Insane']

const SYSTEM_PROMPT = (machine: MachineInfo, stage: Stage) => `You are an expert HTB/THM coach helping with ethical hacking practice on ${machine.platform}.

Machine: ${machine.name || 'Unknown'} | OS: ${machine.os} | Difficulty: ${machine.difficulty}
Current stage: ${stage.label} — ${stage.description}

STRICT RULES:
- NEVER give direct answers, flags, or complete exploit code
- Guide with methodology, hints, and questions only
- Ask "what have you tried?" before giving hints
- Give progressive hints — start vague, get specific only if stuck
- Reference real tools: nmap, gobuster, ffuf, linpeas, winpeas, metasploit, etc.
- Encourage the user to think, not just copy
- If they seem stuck for a while, give a nudge in the right direction
- Keep responses concise — 3-5 sentences max unless explaining a concept

ADDITIONAL INSTRUCTIONS:
- For beginners, explain basic concepts in simple terms
- Mention relevant Kali Linux tools for each stage
- Provide methodology guidance for each phase
- Suggest common pitfalls to avoid`

// ─── VALIDATION HELPERS ───
const isValidSession = (s: any): s is SavedSession => {
  return s && 
    typeof s.id === 'string' &&
    typeof s.timestamp === 'number' &&
    s.machine && typeof s.machine === 'object' &&
    typeof s.machine.name === 'string' &&
    typeof s.machine.os === 'string' &&
    typeof s.machine.difficulty === 'string' &&
    typeof s.machine.platform === 'string' &&
    typeof s.stage === 'string' &&
    Array.isArray(s.messages) &&
    Array.isArray(s.completedStages)
}

// ─── COMPONENT ───
export default function HTBCoach() {
  // ─── ModelManager Integration ──────────────────────────────────────────────
  const activeModel = useActiveModel()
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null)
  const [ollamaError, setOllamaError] = useState<string | null>(null)
  const [installedModels, setInstalledModels] = useState<OllamaModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  // ─── Component State ────────────────────────────────────────────────────────
  const [machine, setMachine] = useState<MachineInfo>({
    name: '', os: 'Linux', difficulty: 'Medium', platform: 'Hack The Box'
  })
  const [started, setStarted] = useState(false)
  const [stage, setStage] = useState(STAGES[0])
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set())
  const [showBeginnerTips, setShowBeginnerTips] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('coach')
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>(() => {
    try {
      const saved = localStorage.getItem('htb_sessions')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [notes, setNotes] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [filterPlatform, setFilterPlatform] = useState('All')
  const [filterDifficulty, setFilterDifficulty] = useState('All')
  const [sortBy, setSortBy] = useState<'date' | 'difficulty' | 'progress'>('date')
  const [searchTerm, setSearchTerm] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<Message[]>([])
  const controllerRef = useRef<AbortController | null>(null)
  const abortReasonRef = useRef<string | null>(null)

  // Keep messagesRef in sync with state
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Persist sessions
  useEffect(() => {
    localStorage.setItem('htb_sessions', JSON.stringify(savedSessions))
  }, [savedSessions])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.abort()
    }
  }, [])

  // ─── Fetch installed models from Ollama ────────────────────────────────────
  const fetchInstalledModels = useCallback(async () => {
    setModelsLoading(true)
    setModelsError(null)
    try {
      if (!window.ghostshell?.ollamaRequest) {
        throw new Error('Ollama bridge not available')
      }
      const { status, data } = await window.ghostshell.ollamaRequest('/api/tags', 'GET')
      if (status >= 400) {
        throw new Error(`HTTP ${status}`)
      }
      const payload = data as { models?: OllamaModel[] } | null
      const models = (payload?.models || []) as OllamaModel[]
      setInstalledModels(models)
    } catch (err) {
      const e = err as Error
      setModelsError(e.message)
    } finally {
      setModelsLoading(false)
    }
  }, [])

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

  // Fetch models when Ollama is available
  useEffect(() => {
    if (ollamaAvailable) {
      fetchInstalledModels()
      const interval = setInterval(fetchInstalledModels, 30000)
      return () => clearInterval(interval)
    }
  }, [ollamaAvailable, fetchInstalledModels])

  // ─── Model Change Handler ──────────────────────────────────────────────────
  const handleModelChange = useCallback((modelName: string) => {
    setActiveModel(modelName)
  }, [])

  // ─── MEMOIZED STATS ───
  const stats = useMemo(() => {
    const total = savedSessions.length
    const favorited = savedSessions.filter(s => s.favorite).length
    const byDifficulty = {
      Easy: savedSessions.filter(s => s.machine.difficulty === 'Easy').length,
      Medium: savedSessions.filter(s => s.machine.difficulty === 'Medium').length,
      Hard: savedSessions.filter(s => s.machine.difficulty === 'Hard').length,
      Insane: savedSessions.filter(s => s.machine.difficulty === 'Insane').length,
    }
    const totalStages = savedSessions.reduce((sum, s) => sum + s.completedStages.length, 0)
    return { total, favorited, byDifficulty, totalStages }
  }, [savedSessions])

  // ─── SESSION MANAGEMENT ───
  const saveSession = useCallback((sessionId: string, msgs: Message[]) => {
    const newSession: SavedSession = {
      id: sessionId,
      timestamp: Date.now(),
      machine: machine,
      stage: stage.id,
      messages: msgs,
      completedStages: Array.from(completedStages),
      notes: notes || undefined,
      favorite: false
    }
    setSavedSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId)
      return [newSession, ...filtered]
    })
  }, [machine, stage.id, completedStages, notes])

  const loadSession = useCallback((session: SavedSession) => {
    setMachine(session.machine)
    setStage(STAGES.find(s => s.id === session.stage) || STAGES[0])
    setMessages(session.messages)
    setCompletedStages(new Set(session.completedStages))
    setNotes(session.notes || '')
    setCurrentSessionId(session.id)
    setStarted(true)
    setInput('')
    setActiveTab('coach')
  }, [])

  const deleteSession = useCallback((id: string) => {
    setSavedSessions(prev => prev.filter(s => s.id !== id))
  }, [])

  const toggleFavorite = useCallback((id: string) => {
    setSavedSessions(prev => prev.map(s => 
      s.id === id ? { ...s, favorite: !s.favorite } : s
    ))
  }, [])

  // ─── EXPORT / IMPORT ───
  const exportSessions = useCallback(() => {
    const data = JSON.stringify(savedSessions, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `htb_sessions_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [savedSessions])

  const importSessions = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (!Array.isArray(data)) {
          alert('Invalid file format: expected an array of sessions.')
          return
        }
        const invalid = data.findIndex(s => !isValidSession(s))
        if (invalid !== -1) {
          alert(`Invalid session at index ${invalid + 1}. Please check the file.`)
          return
        }
        setSavedSessions(prev => [...data, ...prev])
      } catch (error) {
        console.error('Import error:', error)
        alert('Invalid file format. Please check the file.')
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const clearAllSessions = useCallback(() => {
    if (window.confirm('Delete all saved sessions?')) {
      setSavedSessions([])
    }
  }, [])

  // ─── COACH LOGIC ───
  const start = useCallback(() => {
    if (!machine.name.trim()) return
    const sessionId = crypto.randomUUID()
    setCurrentSessionId(sessionId)
    const welcome: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `🎯 Machine loaded: **${machine.name}** (${machine.os} · ${machine.difficulty} · ${machine.platform})\n\nI'm your coach for this engagement. I'll guide you through each stage without spoiling the fun.\n\nWe're starting with **${stage.label}**. Tell me what you've done so far, or type \`start\` if you're at the beginning.`,
      stage: stage.id,
      timestamp: Date.now(),
    }
    setMessages([welcome])
    setTimeout(() => saveSession(sessionId, [welcome]), 0)
    setStarted(true)
  }, [machine, stage, saveSession])

  const switchStage = useCallback((s: Stage) => {
    setStage(s)
    const msg: Message = {
      id: crypto.randomUUID(),
      role: 'system',
      content: `📍 Moved to stage: ${s.icon} ${s.label}`,
      stage: s.id,
      timestamp: Date.now(),
    }
    setMessages(prev => {
      const newMessages = [...prev, msg]
      setTimeout(() => {
        if (currentSessionId) {
          saveSession(currentSessionId, newMessages)
        }
      }, 0)
      return newMessages
    })
    inputRef.current?.focus()
  }, [currentSessionId, saveSession])

  const markDone = useCallback((stageId: string) => {
    if (completedStages.has(stageId)) return

    setCompletedStages(prev => new Set([...prev, stageId]))
    
    setTimeout(() => {
      if (currentSessionId) {
        saveSession(currentSessionId, messagesRef.current)
      }
    }, 0)

    const idx = STAGES.findIndex(s => s.id === stageId)
    if (idx < STAGES.length - 1) {
      switchStage(STAGES[idx + 1])
    }
  }, [completedStages, switchStage, currentSessionId, saveSession])

  const reset = useCallback(() => {
    if (controllerRef.current) {
      abortReasonRef.current = 'reset'
      controllerRef.current.abort()
      controllerRef.current = null
    }
    setStarted(false)
    setMessages([])
    setStage(STAGES[0])
    setCompletedStages(new Set())
    setMachine({ name: '', os: 'Linux', difficulty: 'Medium', platform: 'Hack The Box' })
    setNotes('')
    setCurrentSessionId(null)
    setLoading(false)
    setInput('')
  }, [])

  // ─── FIXED: send function with stream: false ──────────────────────────────────
  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    // Check if Ollama is available
    if (!ollamaAvailable) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `⚠️ Ollama is not running (${ollamaError || 'connection failed'}). Please start Ollama and try again.`,
        stage: stage.id,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMsg])
      return
    }

    const userMsg: Message = { 
      id: crypto.randomUUID(), 
      role: 'user', 
      content: text, 
      stage: stage.id,
      timestamp: Date.now()
    }
    
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { 
      id: assistantId, 
      role: 'assistant', 
      content: '', 
      stage: stage.id,
      timestamp: Date.now()
    }])

    const controller = new AbortController()
    controllerRef.current = controller
    abortReasonRef.current = null

    try {
      const history = messagesRef.current
        .filter(m => m.role !== 'system')
        .slice(-10)
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
      history.push({ role: 'user', content: text })

      console.log(`[HTBCoach] Sending request to model: ${activeModel}`)

      // ✅ FIX: Use stream: false (non-streaming request)
      const { status, data } = await window.ghostshell?.ollamaRequest?.('/api/chat', 'POST', {
        model: activeModel,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT(machine, stage) },
          ...history,
        ],
      }) ?? { status: 500, data: null }

      console.log(`[HTBCoach] Response status: ${status}`)

      if (status >= 400) {
        const errorDetail = (data as { error?: string } | null)?.error || 'Unknown error'
        throw new Error(`HTTP ${status}: ${errorDetail}`)
      }

      const payload = data as { message?: { content?: string } } | null
      const responseContent = payload?.message?.content?.trim() || 'No response from the model.'

      // Update the assistant message with the full response
      setMessages(prev => prev.map(m => 
        m.id === assistantId ? { ...m, content: responseContent } : m
      ))
      
      // Save the session with the new message
      if (currentSessionId) {
        const finalMessages = messagesRef.current.map(m => 
          m.id === assistantId ? { ...m, content: responseContent } : m
        )
        saveSession(currentSessionId, finalMessages)
      }
      
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Request aborted:', abortReasonRef.current || 'unknown reason')
        return
      }
      
      console.error('Stream error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { 
          ...m, 
          content: `❌ Error connecting to Ollama: ${errorMessage}. Please check if it's running and the model "${activeModel}" is installed.` 
        } : m
      ))
    } finally {
      setLoading(false)
      if (controllerRef.current === controller) {
        controllerRef.current = null
      }
      inputRef.current?.focus()
    }
  }, [input, loading, stage.id, machine, currentSessionId, saveSession, activeModel, ollamaAvailable, ollamaError])

  // ─── FILTERING & SORTING ───
  const filteredSessions = useMemo(() => {
    return savedSessions
      .filter(s => {
        if (filterPlatform !== 'All' && s.machine.platform !== filterPlatform) return false
        if (filterDifficulty !== 'All' && s.machine.difficulty !== filterDifficulty) return false
        if (searchTerm) {
          const search = searchTerm.toLowerCase()
          return s.machine.name.toLowerCase().includes(search) ||
                 s.machine.os.toLowerCase().includes(search) ||
                 (s.notes && s.notes.toLowerCase().includes(search))
        }
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'date') return b.timestamp - a.timestamp
        if (sortBy === 'difficulty') {
          const order = { Insane: 4, Hard: 3, Medium: 2, Easy: 1 }
          return (order[b.machine.difficulty as keyof typeof order] || 0) - 
                 (order[a.machine.difficulty as keyof typeof order] || 0)
        }
        if (sortBy === 'progress') {
          return b.completedStages.length - a.completedStages.length
        }
        return 0
      })
  }, [savedSessions, filterPlatform, filterDifficulty, searchTerm, sortBy])

  // ─── RENDER FUNCTIONS ───
  
  // ── Setup screen ──
  if (!started && activeTab === 'coach') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.15)' }}>
              <Flag size={16} className="text-ghost-yellow" />
            </div>
            <div>
              <span className="ghost-gradient-text font-bold text-base">HTB / THM Coach</span>
              <div className="text-ghost-text-dim text-xs flex items-center gap-2">
                Methodology-guided AI coach · no spoilers
                <OllamaStatusIndicator available={ollamaAvailable} model={activeModel} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <ModelSelector
              models={installedModels}
              activeModel={activeModel}
              onSelect={handleModelChange}
              loading={modelsLoading}
              error={modelsError}
            />
            <button
              onClick={() => setShowBeginnerTips(!showBeginnerTips)}
              className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-accent-3 transition-colors px-2 py-1 border border-ghost-border rounded-lg hover:border-ghost-accent-3/40"
            >
              <BookOpen size={12} />
              {showBeginnerTips ? 'Hide Tips' : 'Show Tips'}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className="flex items-center gap-1 text-xs px-2 py-1 border rounded transition-colors text-ghost-text-dim hover:text-ghost-yellow border-ghost-border"
            >
              <History size={12} />
              Sessions {savedSessions.length > 0 && `(${savedSessions.length})`}
            </button>
          </div>
        </div>

        {/* Ollama Offline Warning */}
        {ollamaAvailable === false && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
            <AlertCircle size={14} className="text-amber-400" />
            <span className="text-amber-400 text-xs">
              Ollama is not running at {OLLAMA_HOST}. The coach will not work without Ollama.
            </span>
          </div>
        )}

        <div className="ghost-panel p-6 rounded-2xl space-y-4">
          <div className="text-ghost-green text-sm font-semibold mb-2">🎯 Load a machine to begin</div>

          <div>
            <label className="text-ghost-text-dim text-xs block mb-1">Machine Name</label>
            <input
              value={machine.name}
              onChange={e => setMachine(m => ({ ...m, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && start()}
              placeholder="e.g. Lame, Blue, TwoMillion..."
              className="ghost-input w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-ghost-text text-sm font-mono focus:outline-none placeholder-ghost-text-dim transition-colors"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Platform', key: 'platform', opts: PLATFORMS },
              { label: 'OS',       key: 'os',       opts: OS_LIST },
              { label: 'Difficulty', key: 'difficulty', opts: DIFF_LIST },
            ].map(({ label, key, opts }) => (
              <div key={key}>
                <label className="text-ghost-text-dim text-xs block mb-1">{label}</label>
                <select
                  value={(machine as any)[key]}
                  onChange={e => setMachine(m => ({ ...m, [key]: e.target.value }))}
                  className="ghost-input w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-ghost-text text-sm font-mono focus:outline-none transition-colors"
                >
                  {opts.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>

          <button onClick={start} disabled={!machine.name.trim() || !ollamaAvailable}
            className="ghost-btn-primary w-full py-2.5 font-bold text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2">
            <Flag size={14} /> Start Session
          </button>
        </div>

        {/* Stage overview */}
        <div className="mt-4 grid grid-cols-5 gap-2">
          {STAGES.map((s, i) => (
            <div key={s.id} className="ghost-card bg-ghost-surface border border-ghost-border rounded-xl p-3 text-center">
              <div className="text-xl mb-1">{s.icon}</div>
              <div className={"text-xs font-semibold " + s.color}>{s.label}</div>
              {i < STAGES.length - 1 && (
                <ChevronRight size={10} className="text-ghost-text-dim mx-auto mt-1" />
              )}
            </div>
          ))}
        </div>

        {/* Beginner Tips */}
        {showBeginnerTips && (
          <div className="mt-4 ghost-panel-glow p-4 rounded-xl border border-ghost-accent-3/20">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={14} className="text-ghost-accent-3" />
              <span className="text-ghost-accent-3 text-xs font-bold">HTB Beginner Tips</span>
            </div>
            <ul className="space-y-2 text-xs text-ghost-text">
              {[
                'Start with recon — enumeration is key!',
                'Always check for low-hanging fruits first',
                'Document your steps for writeups later',
                'Use Kali Linux tools for each phase',
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-ghost-accent-3 mt-0.5 flex-shrink-0">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // ── Coach screen ──
  if (started && activeTab === 'coach') {
    const isStageDone = completedStages.has(stage.id)

    return (
      <div className="flex h-full gap-4 max-w-5xl mx-auto">

        {/* Sidebar — stages */}
        <div className="w-48 flex-shrink-0 space-y-1">
          <div className="text-ghost-text-dim text-xs font-semibold mb-2 px-1 uppercase tracking-wider">Stages</div>
          {STAGES.map(s => (
            <button key={s.id} onClick={() => switchStage(s)}
              className={"w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors " +
                (stage.id === s.id
                  ? 'ghost-nav-active'
                  : 'text-ghost-text-dim hover:text-ghost-text hover:bg-white/5')}>
              <span>{s.icon}</span>
              <span className="flex-1 text-left">{s.label}</span>
              {completedStages.has(s.id)
                ? <span className="text-ghost-green text-xs">✓</span>
                : stage.id === s.id
                  ? <span className="w-1.5 h-1.5 rounded-full bg-ghost-yellow inline-block" />
                  : <Lock size={9} className="text-ghost-text-dim opacity-50" />
              }
            </button>
          ))}

          <div className="pt-3 border-t border-ghost-border mt-3 space-y-1">
            <div className="text-ghost-text-dim text-xs font-semibold px-1 mb-2 flex items-center gap-1 uppercase tracking-wider">
              <Zap size={10} /> Quick hints
            </div>
            {stage.hints.map((h, i) => (
              <div key={i} className="text-xs text-ghost-text-dim px-2 py-1.5 bg-ghost-surface border border-ghost-border rounded-lg leading-relaxed">
                {h}
              </div>
            ))}
          </div>

          {showBeginnerTips && stage.beginnerTips && (
            <div className="pt-2 border-t border-ghost-border mt-2 space-y-1">
              <div className="text-ghost-text-dim text-xs font-semibold px-1 mb-2 flex items-center gap-1 uppercase tracking-wider">
                <BookOpen size={10} /> Beginner Tips
              </div>
              {stage.beginnerTips.map((tip, i) => (
                <div key={i} className="text-xs text-ghost-accent-3 px-2 py-1.5 bg-ghost-accent-3/5 border border-ghost-accent-3/20 rounded-lg leading-relaxed">
                  {tip}
                </div>
              ))}
            </div>
          )}

          {showBeginnerTips && stage.kaliTools && (
            <div className="pt-2 border-t border-ghost-border mt-2">
              <div className="text-ghost-text-dim text-xs font-semibold px-1 mb-2 flex items-center gap-1 uppercase tracking-wider">
                <Wrench size={10} /> Kali Tools
              </div>
              <div className="flex flex-wrap gap-1">
                {stage.kaliTools.map((tool, i) => (
                  <span key={i} className="text-xs px-1.5 py-0.5 bg-ghost-accent-2/10 border border-ghost-accent-2/30 rounded-full font-mono text-ghost-accent-2">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {showBeginnerTips && stage.commonMistakes && (
            <div className="pt-2 border-t border-ghost-border mt-2">
              <div className="text-ghost-red text-xs font-semibold px-1 mb-2 flex items-center gap-1 uppercase tracking-wider">
                <AlertTriangle size={10} /> Common Mistakes
              </div>
              {stage.commonMistakes.map((mistake, i) => (
                <div key={i} className="text-xs text-ghost-red/70 px-2 py-1.5 bg-ghost-red/5 border border-ghost-red/20 rounded-lg leading-relaxed">
                  {mistake}
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-ghost-border mt-2 space-y-1">
            <button onClick={() => setActiveTab('history')}
              className="w-full flex items-center justify-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-yellow transition-colors py-1.5 border border-ghost-border rounded-lg hover:border-ghost-yellow/40">
              <History size={10} /> Sessions
            </button>
            <button onClick={reset}
              className="w-full flex items-center justify-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-red transition-colors py-1.5 border border-ghost-border rounded-lg hover:border-ghost-red/40">
              <RotateCcw size={10} /> New machine
            </button>
          </div>
        </div>

        {/* Main chat */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between mb-3 flex-shrink-0 pb-3 border-b border-ghost-border flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-ghost-yellow font-bold text-sm">{machine.name}</span>
              <span className="text-ghost-text-dim text-xs">{machine.os} · {machine.difficulty} · {machine.platform}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${stage.color} bg-current/10`}>
                {stage.icon} {stage.label}
              </span>
              <button
                onClick={() => markDone(stage.id)}
                disabled={isStageDone}
                className={`text-xs px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${
                  isStageDone
                    ? 'text-ghost-text-dim bg-ghost-surface border border-ghost-border opacity-50 cursor-not-allowed'
                    : 'text-ghost-green border border-ghost-green/30 hover:bg-ghost-green/10'
                }`}
              >
                <Target size={10} />
                {isStageDone ? 'Done ✓' : 'Mark Done'}
              </button>
              {currentSessionId && (
                <button
                  onClick={() => {
                    setEditingNote(!editingNote)
                    if (!editingNote) {
                      setTimeout(() => {
                        const ta = document.getElementById('note-editor') as HTMLTextAreaElement
                        ta?.focus()
                      }, 100)
                    }
                  }}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${
                    editingNote
                      ? 'border-ghost-accent-3/50 text-ghost-accent-3 bg-ghost-accent-3/10'
                      : 'border-ghost-border text-ghost-text-dim hover:text-ghost-accent-3'
                  }`}
                >
                  <FileText size={10} />
                  {editingNote ? 'Editing' : 'Notes'}
                </button>
              )}
              {/* Model selector in header */}
              <ModelSelector
                models={installedModels}
                activeModel={activeModel}
                onSelect={handleModelChange}
                loading={modelsLoading}
                error={modelsError}
                compact={true}
              />
            </div>
          </div>

          {/* Ollama Offline Warning */}
          {ollamaAvailable === false && (
            <div className="mb-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-xs">
              <AlertCircle size={12} className="text-amber-400" />
              <span className="text-amber-400">Ollama is not running. AI responses are disabled.</span>
            </div>
          )}

          {/* Notes editing */}
          {editingNote && (
            <div className="mb-3 p-3 bg-ghost-surface border border-ghost-border rounded-lg">
              <div className="text-ghost-text-dim text-xs font-mono mb-1">Session Notes</div>
              <textarea
                id="note-editor"
                value={notes}
                onChange={e => {
                  setNotes(e.target.value)
                  if (currentSessionId) {
                    setTimeout(() => saveSession(currentSessionId, messagesRef.current), 0)
                  }
                }}
                placeholder="Add notes about your progress..."
                rows={2}
                className="w-full bg-ghost-bg border border-ghost-border rounded px-2 py-1 text-sm text-ghost-text font-mono focus:outline-none focus:border-ghost-accent-3"
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setEditingNote(false)
                  }
                }}
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    if (currentSessionId) {
                      saveSession(currentSessionId, messagesRef.current)
                    }
                    setEditingNote(false)
                  }}
                  className="px-3 py-1 bg-ghost-accent-3/20 text-ghost-accent-3 text-xs font-mono rounded hover:bg-ghost-accent-3/30 border border-ghost-accent-3/30"
                >
                  Save & Close
                </button>
                <button
                  onClick={() => setEditingNote(false)}
                  className="px-3 py-1 text-ghost-text-dim text-xs font-mono rounded hover:bg-white/5 border border-ghost-border"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {messages.map(m => (
              <div key={m.id}>
                {m.role === 'system' ? (
                  <div className="flex items-center justify-center">
                    <span className="text-xs text-ghost-text-dim bg-ghost-surface px-3 py-1 rounded-full border border-ghost-border">
                      {m.content}
                    </span>
                  </div>
                ) : (
                  <div className={"flex gap-3 " + (m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {m.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-lg border border-ghost-border flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(251,191,36,0.12)' }}>
                        <Cpu size={13} className="text-ghost-yellow" />
                      </div>
                    )}
                    <div className={"max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed selectable " +
                      (m.role === 'user' ? 'ghost-user-bubble' : 'ghost-ai-bubble')}>
                      {m.content
                        ? m.content.split('\n').map((line, i) => (
                            <span key={i}>{line}{i < m.content.split('\n').length - 1 && <br />}</span>
                          ))
                        : <span className="text-ghost-text-dim animate-pulse font-mono text-xs">thinking...</span>
                      }
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="mt-3 flex-shrink-0">
            <div className="ghost-input flex gap-2 items-end bg-ghost-surface border border-ghost-border rounded-xl p-2 transition-colors">
              <span className="text-ghost-yellow font-mono text-sm pb-1.5 flex-shrink-0">❯</span>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={`Tell your coach what you've found in ${stage.label}...`}
                rows={1}
                className="flex-1 bg-transparent text-ghost-text text-sm resize-none focus:outline-none placeholder-ghost-text-dim leading-relaxed min-h-[28px] max-h-32"
                disabled={!ollamaAvailable}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 128) + 'px'
                }}
              />
              <button onClick={send} disabled={!input.trim() || loading || !ollamaAvailable}
                className="flex-shrink-0 p-1.5 rounded-lg ghost-btn-primary disabled:opacity-30">
                <Send size={14} />
              </button>
            </div>
            <div className="text-ghost-text-dim text-xs mt-1.5 px-1 flex items-center justify-between">
              <span>Enter to send · Hints only — no spoilers</span>
              <button onClick={() => setShowBeginnerTips(!showBeginnerTips)} className="text-ghost-accent-3 hover:text-ghost-accent-2 text-xs transition-colors">
                {showBeginnerTips ? 'Hide Tips' : 'Show Tips'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── History Tab ──
  if (activeTab === 'history') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.15)' }}>
              <Flag size={16} className="text-ghost-yellow" />
            </div>
            <div>
              <span className="ghost-gradient-text font-bold text-base">HTB / THM Coach</span>
              <div className="text-ghost-text-dim text-xs flex items-center gap-2">
                Session History
                <OllamaStatusIndicator available={ollamaAvailable} model={activeModel} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <ModelSelector
              models={installedModels}
              activeModel={activeModel}
              onSelect={handleModelChange}
              loading={modelsLoading}
              error={modelsError}
              compact={true}
            />
            <button onClick={() => setActiveTab('coach')}
              className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-yellow transition-colors px-2 py-1 border border-ghost-border rounded">
              <ChevronRight size={12} /> Back to Coach
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        {savedSessions.length > 0 && (
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">Total</div>
              <div className="text-ghost-text font-bold">{stats.total}</div>
            </div>
            <div className="bg-ghost-surface border border-yellow-400/30 rounded-lg p-2 text-center">
              <div className="text-yellow-400">Favorited</div>
              <div className="text-yellow-400 font-bold">{stats.favorited}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-green/30 rounded-lg p-2 text-center">
              <div className="text-ghost-green">Easy</div>
              <div className="text-ghost-green font-bold">{stats.byDifficulty.Easy}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-yellow/30 rounded-lg p-2 text-center">
              <div className="text-ghost-yellow">Medium</div>
              <div className="text-ghost-yellow font-bold">{stats.byDifficulty.Medium}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-red/30 rounded-lg p-2 text-center">
              <div className="text-ghost-red">Stages</div>
              <div className="text-ghost-red font-bold">{stats.totalStages}</div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-ghost-text-dim text-xs font-mono">
              {savedSessions.length} saved sessions
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-2 text-ghost-text-dim" />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search sessions..."
                  className="bg-ghost-surface border border-ghost-border rounded pl-8 pr-3 py-1.5 text-xs font-mono text-ghost-text focus:outline-none placeholder-ghost-text-dim w-32 sm:w-48"
                />
              </div>
              <select
                value={filterPlatform}
                onChange={e => setFilterPlatform(e.target.value)}
                className="bg-ghost-surface border border-ghost-border rounded px-2 py-1.5 text-xs font-mono text-ghost-text focus:outline-none"
              >
                <option value="All">All Platforms</option>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={filterDifficulty}
                onChange={e => setFilterDifficulty(e.target.value)}
                className="bg-ghost-surface border border-ghost-border rounded px-2 py-1.5 text-xs font-mono text-ghost-text focus:outline-none"
              >
                <option value="All">All Difficulties</option>
                {DIFF_LIST.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-ghost-surface border border-ghost-border rounded px-2 py-1.5 text-xs font-mono text-ghost-text focus:outline-none"
              >
                <option value="date">Sort by Date</option>
                <option value="difficulty">Sort by Difficulty</option>
                <option value="progress">Sort by Progress</option>
              </select>
              <button 
                onClick={exportSessions} 
                disabled={savedSessions.length === 0}
                className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-yellow transition-colors px-2 py-1 border border-ghost-border rounded disabled:opacity-40"
              >
                <Download size={12} /> Export
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-yellow transition-colors px-2 py-1 border border-ghost-border rounded"
              >
                <Upload size={12} /> Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={importSessions}
                className="hidden"
              />
              <button 
                onClick={clearAllSessions} 
                disabled={savedSessions.length === 0}
                className="flex items-center gap-1 text-xs text-ghost-red/60 hover:text-ghost-red transition-colors px-2 py-1 border border-ghost-red/30 rounded disabled:opacity-40"
              >
                <Trash2 size={12} /> Clear All
              </button>
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-8 text-center">
              <Flag size={32} className="text-ghost-text-dim mx-auto mb-2" />
              <div className="text-ghost-text-dim text-sm font-mono">No saved sessions</div>
              <div className="text-ghost-text-dimmer text-xs mt-1">Start a new machine session to save your progress</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSessions.map(s => {
                const progress = Math.round((s.completedStages.length / STAGES.length) * 100)
                return (
                  <div key={s.id} className="bg-ghost-surface border border-ghost-border rounded-lg p-3 hover:border-ghost-yellow/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => loadSession(s)}
                            className="text-ghost-yellow hover:text-ghost-accent-2 font-mono text-sm font-bold transition-colors"
                          >
                            {s.machine.name}
                          </button>
                          <span className="text-ghost-text-dim text-xs">{s.machine.platform}</span>
                          <span className="text-ghost-text-dim text-xs">•</span>
                          <span className="text-ghost-text-dim text-xs">{s.machine.os}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${
                            s.machine.difficulty === 'Easy' ? 'text-ghost-green border-ghost-green/30' :
                            s.machine.difficulty === 'Medium' ? 'text-ghost-yellow border-ghost-yellow/30' :
                            s.machine.difficulty === 'Hard' ? 'text-orange-400 border-orange-400/30' :
                            'text-ghost-red border-ghost-red/30'
                          }`}>
                            {s.machine.difficulty}
                          </span>
                          {s.favorite && (
                            <Star size={12} className="text-yellow-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-ghost-text-dim text-xs">
                            {s.completedStages.length}/{STAGES.length} stages
                          </span>
                          <span className="text-ghost-text-dim text-xs">•</span>
                          <span className="text-ghost-text-dim text-xs">
                            {new Date(s.timestamp).toLocaleString()}
                          </span>
                          {s.notes && (
                            <>
                              <span className="text-ghost-text-dim text-xs">•</span>
                              <span className="text-ghost-text-dim text-xs">📝 {s.notes}</span>
                            </>
                          )}
                        </div>
                        {/* Progress bar */}
                        <div className="w-full h-1 bg-ghost-border rounded-full mt-1.5 overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: progress + '%', background: 'linear-gradient(90deg, #6366f1, #a855f7, #22d3ee)' }}
                          />
                        </div>
                        {/* Completed stages preview */}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {STAGES.map(st => (
                            <span key={st.id} className="text-xs">
                              {s.completedStages.includes(st.id) ? '✅' : '⬜'}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => toggleFavorite(s.id)}
                          className="p-1 text-ghost-text-dim hover:text-yellow-400 transition-colors"
                          title="Toggle favorite"
                        >
                          <Star size={14} className={s.favorite ? 'text-yellow-400' : ''} />
                        </button>
                        <button
                          onClick={() => loadSession(s)}
                          className="p-1 text-ghost-text-dim hover:text-ghost-yellow transition-colors"
                          title="Load session"
                        >
                          <Play size={14} />
                        </button>
                        <button
                          onClick={() => deleteSession(s.id)}
                          className="p-1 text-ghost-text-dim hover:text-ghost-red transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Resources Tab ── (dead code — removed)
  // The resources tab is not accessible from the UI, so this branch is unreachable.
  // Keeping it would be dead code. Returning the coach view as fallback.
  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(251,191,36,0.15)' }}>
            <Flag size={16} className="text-ghost-yellow" />
          </div>
          <div>
            <span className="ghost-gradient-text font-bold text-base">HTB / THM Coach</span>
            <div className="text-ghost-text-dim text-xs">Returning to coach view</div>
          </div>
        </div>
        <button
          onClick={() => setActiveTab('coach')}
          className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-yellow transition-colors px-2 py-1 border border-ghost-border rounded"
        >
          <ChevronRight size={12} /> Back to Coach
        </button>
      </div>
      <div className="ghost-panel p-6 rounded-2xl text-center">
        <Flag size={32} className="text-ghost-yellow mx-auto mb-3" />
        <div className="text-ghost-text-dim">The Resources tab has been removed.</div>
        <div className="text-ghost-text-dimmer text-xs mt-1">All methodology content is now available directly in the Coach view.</div>
        <button
          onClick={() => setActiveTab('coach')}
          className="mt-4 px-4 py-2 bg-ghost-yellow/20 text-ghost-yellow rounded-lg text-sm font-medium hover:bg-ghost-yellow/30 transition-colors"
        >
          Start a Session
        </button>
      </div>
    </div>
  )
}

// ─── Helper Components ──────────────────────────────────────────────────────

function OllamaStatusIndicator({ available, model }: { available: boolean | null; model: string }) {
  if (available === null) {
    return <span className="text-xs text-ghost-text-dimmer flex items-center gap-1"><AlertCircle size={11} /> checking...</span>
  }
  if (!available) {
    return <span className="text-xs text-ghost-red flex items-center gap-1"><AlertCircle size={11} /> offline</span>
  }
  return (
    <span className="text-xs text-ghost-green flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-ghost-green animate-pulse" />
      {model}
    </span>
  )
}

function ModelSelector({ 
  models, 
  activeModel, 
  onSelect, 
  loading, 
  error, 
  compact = false 
}: { 
  models: OllamaModel[]; 
  activeModel: string; 
  onSelect: (model: string) => void; 
  loading: boolean; 
  error: string | null;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <select
        value={activeModel}
        onChange={e => onSelect(e.target.value)}
        disabled={loading || models.length === 0}
        className="bg-ghost-surface border border-ghost-border text-ghost-text text-xs rounded-lg px-2 py-1 font-mono focus:outline-none focus:border-ghost-accent max-w-[120px] truncate"
      >
        {loading ? (
          <option value="" disabled>Loading...</option>
        ) : error ? (
          <option value="" disabled>⚠️ Error</option>
        ) : models.length === 0 ? (
          <option value="" disabled>No models</option>
        ) : (
          models.map(model => (
            <option key={model.name} value={model.name}>
              {model.name}
            </option>
          ))
        )}
      </select>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Cpu size={12} className="text-ghost-text-dim" />
      <select
        value={activeModel}
        onChange={e => onSelect(e.target.value)}
        disabled={loading || models.length === 0}
        className="bg-ghost-surface border border-ghost-border text-ghost-text text-xs rounded-lg px-2 py-1 font-mono focus:outline-none focus:border-ghost-accent max-w-[150px] truncate"
      >
        {loading ? (
          <option value="" disabled>Loading...</option>
        ) : error ? (
          <option value="" disabled>⚠️ Error loading</option>
        ) : models.length === 0 ? (
          <option value="" disabled>No models</option>
        ) : (
          models.map(model => (
            <option key={model.name} value={model.name}>
              {model.name}
            </option>
          ))
        )}
      </select>
    </div>
  )
}