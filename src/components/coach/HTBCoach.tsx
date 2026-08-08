'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo, type ChangeEvent } from 'react'
import { 
  Flag, Send, RotateCcw, ChevronRight, Cpu, 
  BookOpen, Zap, Target, Wrench, Download, 
  Upload, Trash2, History, Star, 
  Search, 
  AlertTriangle, 
  Play,
  AlertCircle,
  CheckSquare, Square, ListChecks, Compass,
  Menu, X} from 'lucide-react'
import { useActiveModel, setActiveModel } from '../models/ModelManager'

// ─── TYPES ───
type Tab = 'coach' | 'history'

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
  checklist: string[];
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
  checkedItems?: Record<string, number[]>;
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
    color: 'text-amber-200',
    description: 'Passive & active reconnaissance',
    hints: ['Start with nmap -sC -sV', 'Check for subdomains', 'Google the target name', 'Look up technologies on Wappalyzer'],
    beginnerTips: [
      'Begin with a basic nmap scan to see what ports are open',
      'Use Google Dorks to find public information about the target',
      'Check DNS records with tools like dig or nslookup'
    ],
    kaliTools: ['nmap', 'dnsrecon', 'theHarvester', 'sublist3r', 'whatweb', 'wafw00f'],
    commonMistakes: [
      'Not scanning all ports (use -p- for full scan)',
      'Ignoring UDP ports',
      'Not performing version detection (-sV)'
    ],
    checklist: [
      'Run a full TCP port scan (-p-)',
      'Run service/version detection on open ports (-sV -sC)',
      'Scan the top UDP ports (-sU --top-ports 20)',
      'OSINT: search the target/company name, check the Wayback Machine'
    ]
  },
  {
    id: 'enum',
    label: 'Enumeration',
    icon: '🔍',
    color: 'text-amber-400',
    description: 'Deep service & directory enumeration',
    hints: ['Gobuster/ffuf for directories', 'Enum4linux for SMB', 'Check robots.txt', 'Look for version numbers'],
    beginnerTips: [
      'Always enumerate all open ports, not just common ones',
      'Check HTTP headers for server information',
      'Look for hidden directories and files with fuzzing tools'
    ],
    kaliTools: ['gobuster', 'ffuf', 'feroxbuster', 'enum4linux', 'smbclient', 'smbmap', 'nikto'],
    commonMistakes: [
      'Using only default wordlists',
      'Not checking all HTTP methods',
      'Ignoring SSL/TLS certificates'
    ],
    checklist: [
      'Enumerate web directories & files (gobuster/ffuf/feroxbuster)',
      'Manually check every open service, not just HTTP',
      'Grab banners & versions, cross-check against known CVEs',
      'Enumerate SMB/NFS/FTP shares if present'
    ]
  },
  {
    id: 'exploit',
    label: 'Exploitation',
    icon: '💥',
    color: 'text-orange-400',
    description: 'Initial access & foothold',
    hints: ['Check searchsploit for versions found', 'Look for default credentials', 'Check CVEs for services', 'Try SQLi / LFI / RFI'],
    beginnerTips: [
      'Search for public exploits matching service versions',
      'Try default credentials before complex attacks',
      'Always test exploits in a safe environment first'
    ],
    kaliTools: ['searchsploit', 'msfconsole', 'sqlmap', 'burpsuite', 'nc'],
    commonMistakes: [
      'Not verifying exploit works before use',
      'Forgetting to set LHOST/LPORT',
      'Not checking if target is patched'
    ],
    checklist: [
      'Search searchsploit / Exploit-DB for identified versions',
      'Try default or leaked credentials before building an exploit',
      'Confirm the exploit\u2019s prerequisites actually match the target',
      'Get a stable shell (upgrade to a full PTY if needed)'
    ]
  },
  {
    id: 'privesc',
    label: 'PrivEsc',
    icon: '👑',
    color: 'text-orange-500',
    description: 'Privilege escalation to root/admin',
    hints: ['Run sudo -l first', 'Check SUID binaries', 'Look at cron jobs', 'Run linpeas / winpeas'],
    beginnerTips: [
      'Check what sudo permissions you have first',
      'Look for SUID binaries that can be exploited',
      'Run automated enumeration scripts to find vectors'
    ],
    kaliTools: ['linpeas', 'winpeas', 'pspy', 'linux-exploit-suggester', 'PowerUp.ps1'],
    commonMistakes: [
      'Not checking all privilege escalation vectors',
      'Ignoring cron jobs',
      'Not checking for writable files'
    ],
    checklist: [
      'Run sudo -l and review current user privileges',
      'Run an automated enumeration script (linpeas/winpeas)',
      'Check SUID/SGID binaries and cron jobs (cross-check GTFOBins)',
      'Look for stored credentials in configs and shell history'
    ]
  },
  {
    id: 'lateral',
    label: 'Lateral Move',
    icon: '🔗',
    color: 'text-orange-600',
    description: 'Pivoting across hosts & accounts (AD environments)',
    hints: ['Reuse creds against other hosts with crackmapexec', 'Run BloodHound to map paths to Domain Admin', 'Check for Kerberoastable accounts', 'Look for shared local admin passwords'],
    beginnerTips: [
      'Not every box is single-host — AD machines often need you to pivot to other systems or accounts',
      'A password or hash found on one box is worth trying everywhere',
      'BloodHound turns "who can reach what" into a visual graph — use it before guessing'
    ],
    kaliTools: ['crackmapexec', 'evil-winrm', 'bloodhound', 'impacket'],
    commonMistakes: [
      'Not checking for password/hash reuse across hosts',
      'Skipping Kerberoasting / AS-REP roasting checks',
      'Overlooking domain trust relationships'
    ],
    checklist: [
      'Reuse discovered credentials/hashes against other hosts or services',
      'Run BloodHound and look for a path to Domain Admin',
      'Check for Kerberoastable or AS-REP roastable accounts',
      'Look for trust relationships or shared local admin passwords'
    ]
  },
  {
    id: 'post',
    label: 'Post-Exploit',
    icon: '🏴',
    color: 'text-red-500',
    description: 'Persistence, loot & flags',
    hints: ['Grab both flags', 'Check for other users', 'Look for credentials', 'Document your steps'],
    beginnerTips: [
      'Always collect both user and root flags',
      'Look for credentials in common locations',
      'Document your methodology for future reference'
    ],
    kaliTools: ['mimikatz', 'secretsdump.py', 'john', 'hashcat', 'crackmapexec'],
    commonMistakes: [
      'Forgetting to check for other users',
      'Not looking for backup files',
      'Ignoring hidden directories'
    ],
    checklist: [
      'Grab user.txt and root.txt / proof.txt',
      'Dump credentials (SAM, NTDS.dit, /etc/shadow) where applicable',
      'Check for other users and further lateral opportunities',
      'Write up your methodology while it\u2019s still fresh'
    ]
  },
]

const PLATFORMS = ['Hack The Box', 'TryHackMe', 'VulnHub', 'PentesterLab', 'PortSwigger']
const OS_LIST   = ['Linux', 'Windows', 'FreeBSD', 'Other']
const DIFF_LIST = ['Easy', 'Medium', 'Hard', 'Insane']

const SYSTEM_PROMPT = (machine: MachineInfo, stage: Stage) => `You are Virgil — an expert HTB/THM mentor guiding someone through ethical hacking practice on ${machine.platform}. Like a guide leading someone through unfamiliar and difficult terrain, you walk beside them, not ahead of them: you illuminate the path without walking it for them.

Machine: ${machine.name || 'Unknown'} | OS: ${machine.os} | Difficulty: ${machine.difficulty}
Current stage: ${stage.label} — ${stage.description}

STRICT RULES:
- NEVER give direct answers, flags, or complete exploit code
- Guide with methodology, hints, and questions only
- Ask "what have you tried?" before giving hints
- Give progressive hints — start vague, get specific only if stuck
- Reference real tools: nmap, gobuster, ffuf, linpeas, winpeas, crackmapexec, bloodhound, metasploit, etc.
- Encourage the user to think, not just copy
- If they seem stuck for a while, give a nudge in the right direction
- Keep responses concise — 3-5 sentences max unless explaining a concept

VOICE:
- Calm, patient, and a little wise — a mentor, not a chatbot
- Confident but never condescending; you've walked this path many times before
- Occasionally frame a nudge as a question that leads them to the answer themselves

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
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [filterPlatform, setFilterPlatform] = useState('All')
  const [filterDifficulty, setFilterDifficulty] = useState('All')
  const [sortBy, setSortBy] = useState<'date' | 'difficulty' | 'progress'>('date')
  const [searchTerm, setSearchTerm] = useState('')
  const [checkedItems, setCheckedItems] = useState<Record<string, number[]>>({})
  const [sidebarOpen, setSidebarOpen] = useState(true)

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
      if (!window.obscurum?.ollamaRequest) {
        throw new Error('Ollama bridge not available')
      }
      const { status, data } = await window.obscurum.ollamaRequest('/api/tags', 'GET')
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
      favorite: false,
      checkedItems,
    }
    setSavedSessions(prev => {
      const filtered = prev.filter(s => s.id !== sessionId)
      const existing = prev.find(s => s.id === sessionId)
      return [{ ...newSession, favorite: existing?.favorite ?? newSession.favorite }, ...filtered]
    })
  }, [machine, stage.id, completedStages, notes, checkedItems])

  const loadSession = useCallback((session: SavedSession) => {
    setMachine(session.machine)
    setStage(STAGES.find(s => s.id === session.stage) || STAGES[0])
    setMessages(session.messages)
    setCompletedStages(new Set(session.completedStages))
    setNotes(session.notes || '')
    setCheckedItems(session.checkedItems || {})
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
      content: `🧭 **${machine.name}** awaits (${machine.os} · ${machine.difficulty} · ${machine.platform}).\n\nI won't hand you the flag — but I'll walk beside you and point out what the darkness is hiding, one step at a time.\n\nWe begin at **${stage.label}**. Tell me what you've found so far, or type \`start\` if you're standing at the gate.`,
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
    setCheckedItems({})
    setCurrentSessionId(null)
    setLoading(false)
    setInput('')
  }, [])

  // ─── CHECKLIST ───
  const toggleChecklistItem = useCallback((stageId: string, idx: number) => {
    setCheckedItems(prev => {
      const current = prev[stageId] || []
      const next = current.includes(idx)
        ? current.filter(i => i !== idx)
        : [...current, idx]
      const updated = { ...prev, [stageId]: next }
      if (currentSessionId) {
        setSavedSessions(prevSessions => prevSessions.map(s =>
          s.id === currentSessionId ? { ...s, checkedItems: updated, timestamp: Date.now() } : s
        ))
      }
      return updated
    })
  }, [currentSessionId])

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
      const { status, data } = await window.obscurum?.ollamaRequest?.('/api/chat', 'POST', {
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

  // Stage icon map for the phase cards
  const STAGE_ICONS: Record<string, React.ReactNode> = {
    recon:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/><circle cx="11" cy="11" r="3"/></svg>,
    enum:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>,
    exploit: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>,
    privesc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path d="M12 2l3 7h7l-6 4.5 2.3 7L12 17l-6.3 3.5L8 13.5 2 9h7z"/></svg>,
    lateral: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><rect x="3" y="11" width="5" height="5" rx="1"/><rect x="16" y="11" width="5" height="5" rx="1"/><path d="M8 13.5h8M12 13.5V6M9 6h6"/></svg>,
    post:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6"><path d="M12 2 L4 7 L4 17 L12 22 L20 17 L20 7 Z"/><path d="M9 12l2 2 4-4"/></svg>,
  }

  const GUIDANCE = [
    { title: 'Begin with Reconnaissance', body: 'Enumeration is the foundation. Map the target thoroughly before attempting exploitation.' },
    { title: 'Identify Low-Hanging Fruit', body: 'Always check for common misconfigurations and default credentials first.' },
    { title: 'Document Your Progress', body: 'Keep detailed notes of each phase for post-engagement analysis and writeups.' },
    { title: 'Leverage Kali Linux', body: 'Use specialized tools from Kali for maximum operational effectiveness at each stage.' },
    { title: 'Validate Before Escalating', body: 'Confirm each foothold and credential before moving to the next stage of the attack chain.' },
    { title: 'Think Like the Defender', body: 'Understand what logs and traces you leave behind — stealth matters in real engagements.' },
  ]

  // ── Setup screen ──
  if (!started && activeTab === 'coach') {
    const stageLabel = { recon: 'Reconnaissance', enum: 'Enumeration', exploit: 'Exploitation', privesc: 'PrivEsc', lateral: 'Lateral Move', post: 'Post-Exploit' }
    return (
      <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>

        {/* ── Top navbar ── */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-base"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>V</div>
            <div>
              <div className="text-white font-bold text-sm tracking-wide">VIRGIL</div>
              <div className="text-white/40 text-xs">Your guide through the darkness</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ModelSelector models={installedModels} activeModel={activeModel} onSelect={handleModelChange} loading={modelsLoading} error={modelsError} compact />
            <button onClick={() => setActiveTab('history')}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-white/10 text-white/50 hover:text-white/80 hover:border-white/20 transition-colors">
              <History size={11} /> Sessions {savedSessions.length > 0 && `(${savedSessions.length})`}
            </button>
            <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium ${
              ollamaAvailable === true  ? 'border-violet-500/40 text-violet-300 bg-violet-500/10' :
              ollamaAvailable === false ? 'border-red-500/40 text-red-400 bg-red-500/10' :
              'border-white/10 text-white/30'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${ollamaAvailable === true ? 'bg-violet-400 animate-pulse' : ollamaAvailable === false ? 'bg-red-400' : 'bg-white/20'}`} />
              {ollamaAvailable === true ? 'Connected' : ollamaAvailable === false ? 'Offline' : 'Checking…'}
            </div>
          </div>
        </div>

        <div className="px-8 py-10 max-w-6xl mx-auto">

          {/* ── Hero row ── */}
          <div className="flex items-start justify-between gap-8 mb-14">
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400" /> Operational Interface
              </div>
              <h1 className="text-6xl font-black leading-none mb-3 text-white">
                Begin Your<br />
                <span style={{ background: 'linear-gradient(90deg, #a78bfa, #818cf8, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Reconnaissance
                </span>
              </h1>
              <p className="text-white/40 text-base max-w-lg mt-5 leading-relaxed">
                Load a target machine and begin your penetration testing workflow. Virgil guides you through each phase — illuminating the path without walking it for you.
              </p>

              {/* Stats */}
              <div className="flex gap-10 mt-8">
                {[
                  { label: 'SAVED SESSIONS', value: savedSessions.length },
                  { label: 'STAGES COMPLETED', value: savedSessions.reduce((s, x) => s + x.completedStages.length, 0) },
                  { label: 'PLATFORMS', value: [...new Set(savedSessions.map(s => s.machine.platform))].length || PLATFORMS.length },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="text-white/30 text-xs font-semibold tracking-widest mb-1">{label}</div>
                    <div className="text-4xl font-black" style={{ background: 'linear-gradient(90deg, #a78bfa, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* System status card */}
            <div className="flex-shrink-0 w-64 rounded-2xl border border-white/10 p-5" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-white/40 text-xs font-semibold tracking-widest">SYSTEM STATUS</span>
              </div>
              {[
                { label: 'Connection',  value: ollamaAvailable === true ? '● Connected' : ollamaAvailable === false ? '○ Offline' : '◌ Checking', vClass: ollamaAvailable === true ? 'text-violet-300' : ollamaAvailable === false ? 'text-red-400' : 'text-white/30' },
                { label: 'Platform',    value: machine.platform || 'Hack The Box', vClass: 'text-white font-semibold' },
                { label: 'Model',       value: activeModel || 'None selected', vClass: 'text-cyan-300 text-xs font-mono' },
                { label: 'API Status',  value: ollamaAvailable === true ? 'Operational' : 'Unavailable', vClass: ollamaAvailable === true ? 'text-emerald-400' : 'text-red-400' },
              ].map(({ label, value, vClass }) => (
                <div key={label} className="mb-4">
                  <div className="text-white/20 text-[10px] mb-0.5 font-mono">{label}</div>
                  <div className={`text-sm ${vClass}`}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Machine setup card ── */}
          <div className="rounded-2xl border border-white/10 p-8 mb-10" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, #a78bfa, #22d3ee)' }} />
              <h2 className="text-white font-bold text-xl">Begin Reconnaissance</h2>
            </div>

            {ollamaAvailable === false && (
              <div className="mb-5 p-3 rounded-xl border border-red-500/20 bg-red-500/5 flex items-center gap-2 text-xs text-red-400">
                <AlertCircle size={13} /> Ollama is not running at {OLLAMA_HOST}. Start Ollama to activate Virgil.
              </div>
            )}

            <div className="mb-5">
              <label className="text-white/30 text-xs font-semibold tracking-widest block mb-2">TARGET MACHINE</label>
              <input
                value={machine.name}
                onChange={e => setMachine(m => ({ ...m, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && start()}
                placeholder="e.g., Lame, Blue, TwoMillion..."
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 text-white text-sm font-mono placeholder-white/20 focus:outline-none focus:border-violet-500/50 transition-colors"
                style={{ background: 'rgba(0,0,0,0.2)' }}
              />
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              {([
                { label: 'PLATFORM',   key: 'platform', opts: PLATFORMS },
                { label: 'OS',         key: 'os',       opts: OS_LIST },
                { label: 'DIFFICULTY', key: 'difficulty', opts: DIFF_LIST },
              ] as const).map(({ label, key, opts }) => (
                <div key={key}>
                  <label className="text-white/30 text-xs font-semibold tracking-widest block mb-2">{label}</label>
                  <select
                    value={(machine as any)[key]}
                    onChange={e => setMachine(m => ({ ...m, [key]: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-violet-500/50 transition-colors appearance-none"
                    style={{ background: 'rgba(0,0,0,0.2)' }}
                  >
                    {opts.map(o => <option key={o} style={{ background: '#0d1022' }}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <button
              onClick={start}
              disabled={!machine.name.trim() || !ollamaAvailable}
              className="w-full py-4 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(90deg, #7c3aed, #4f46e5)' }}
              onMouseOver={e => { if (machine.name.trim() && ollamaAvailable) (e.currentTarget as HTMLButtonElement).style.opacity = '0.85' }}
              onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
            >
              Begin Session <ChevronRight size={16} />
            </button>
          </div>

          {/* ── Phase cards ── */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, #a78bfa, #22d3ee)' }} />
              <h2 className="text-white font-bold text-xl">Reconnaissance Phases</h2>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {STAGES.map(s => (
                <div key={s.id} className="rounded-2xl border border-white/10 p-4 flex flex-col items-center gap-3 transition-colors hover:border-violet-500/30 cursor-default group"
                  style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-violet-400 group-hover:text-violet-300 transition-colors"
                    style={{ background: 'rgba(124,58,237,0.15)' }}>
                    {STAGE_ICONS[s.id]}
                  </div>
                  <span className="text-white/60 text-xs font-medium text-center leading-tight group-hover:text-white/80 transition-colors">
                    {(stageLabel as any)[s.id] || s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Operational Guidance ── */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-1 h-6 rounded-full" style={{ background: 'linear-gradient(180deg, #a78bfa, #22d3ee)' }} />
              <h2 className="text-white font-bold text-xl">Operational Guidance</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GUIDANCE.map(({ title, body }) => (
                <div key={title} className="rounded-2xl border border-white/10 p-5 transition-colors hover:border-violet-500/20"
                  style={{ background: 'rgba(255,255,255,0.025)' }}>
                  <div className="text-white font-semibold text-sm mb-1.5">{title}</div>
                  <div className="text-white/35 text-xs leading-relaxed">{body}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    )
  }

  // ── Coach screen ── Premium Redesign ──
  if (started && activeTab === 'coach') {
    const isStageDone = completedStages.has(stage.id)

    return (
      <div className="flex h-full gap-0 max-w-6xl mx-auto relative" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
        
        {/* ── Premium Sidebar ── */}
        <div 
          className={`flex-shrink-0 flex flex-col relative overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]
            ${sidebarOpen ? 'w-[280px] opacity-100' : 'w-0 opacity-0'}`}
          style={{ 
            borderRight: '1px solid rgba(255,255,255,0.06)', 
            background: 'rgba(255,255,255,0.02)',
            backdropFilter: 'blur(20px)'
          }}
        >
          <div className="relative flex flex-col h-full min-h-0 p-4">
            
            {/* Sidebar Header */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.2), rgba(251,191,36,0.05))', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <Compass size={15} className="text-amber-400" />
                </div>
                <span className="text-white font-bold text-sm tracking-wide">VIRGIL</span>
              </div>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Stages */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {STAGES.map(s => {
                const done = (checkedItems[s.id] || []).length
                const total = s.checklist.length
                const isActive = stage.id === s.id
                const isCompleted = completedStages.has(s.id)
                
                return (
                  <button 
                    key={s.id} 
                    onClick={() => switchStage(s)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${
                      isActive
                        ? 'bg-amber-500/10 border border-amber-500/20 shadow-lg shadow-amber-500/5'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <span className="text-lg flex-shrink-0">{s.icon}</span>
                    <span className={`flex-1 text-sm font-medium ${isActive ? 'text-white' : 'text-white/50 group-hover:text-white/80'}`}>
                      {s.label}
                    </span>
                    {done > 0 && done < total && (
                      <span className="text-[10px] font-mono text-amber-400/60 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                        {done}/{total}
                      </span>
                    )}
                    {isCompleted ? (
                      <CheckSquare size={14} className="text-emerald-400 flex-shrink-0" />
                    ) : isActive ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                    ) : null}
                  </button>
                )
              })}
            </div>

            {/* Quick Hints */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-2 flex items-center gap-1.5">
                <Zap size={10} className="text-amber-400" /> Quick Hints
              </div>
              <div className="space-y-1.5">
                {stage.hints.slice(0, 2).map((h, i) => (
                  <div key={i} className="text-xs text-white/50 px-3 py-2 rounded-lg bg-white/5 border border-white/5 leading-relaxed">
                    {h}
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom actions */}
            <div className="mt-4 pt-4 border-t border-white/5 flex gap-2">
              <button 
                onClick={() => setActiveTab('history')}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs text-white/40 hover:text-white/70 py-2 rounded-lg border border-white/5 hover:border-white/10 transition-colors"
              >
                <History size={12} /> Sessions
              </button>
              <button 
                onClick={reset}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs text-white/30 hover:text-red-400 py-2 rounded-lg border border-white/5 hover:border-red-500/20 transition-colors"
              >
                <RotateCcw size={11} /> Reset
              </button>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="flex items-center justify-center w-9 py-2 rounded-lg border border-white/5 text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Main Chat Area ── */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          
          {/* Top bar */}
          <div className="flex-shrink-0 px-6 py-3 flex items-center justify-between border-b border-white/5" style={{ background: 'rgba(0,0,0,0.2)' }}>
            <div className="flex items-center gap-3">
              {!sidebarOpen && (
                <button 
                  onClick={() => setSidebarOpen(true)}
                  className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
                >
                  <Menu size={16} />
                </button>
              )}
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">{machine.name}</span>
                <span className="text-white/30 text-xs">{machine.os} · {machine.difficulty}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${stage.color} bg-current/10`}>
                  {stage.icon} {stage.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => markDone(stage.id)}
                disabled={isStageDone}
                className={`text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  isStageDone
                    ? 'text-white/20 bg-white/5 border border-white/5 cursor-not-allowed'
                    : 'text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/10 bg-emerald-400/5'
                }`}
              >
                <Target size={12} />
                {isStageDone ? 'Complete' : 'Mark Done'}
              </button>
              <ModelSelector models={installedModels} activeModel={activeModel} onSelect={handleModelChange} loading={modelsLoading} error={modelsError} compact />
              <div className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border ${
                ollamaAvailable === true ? 'border-emerald-500/30 text-emerald-400/70' : 'border-red-500/30 text-red-400/70'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${ollamaAvailable === true ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                {ollamaAvailable === true ? 'Online' : 'Offline'}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 custom-scrollbar">
            {messages.map(m => (
              <div key={m.id}>
                {m.role === 'system' ? (
                  <div className="flex items-center justify-center">
                    <span className="text-xs text-white/30 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                      {m.content}
                    </span>
                  </div>
                ) : (
                  <div className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.15), rgba(251,191,36,0.03))', border: '1px solid rgba(251,191,36,0.12)' }}>
                        <Compass size={14} className="text-amber-400" />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed selectable ${
                      m.role === 'user' 
                        ? 'bg-amber-500/10 border border-amber-500/15 text-white/90'
                        : 'bg-white/5 border border-white/5 text-white/80'
                    }`}>
                      {m.content
                        ? m.content.split('\n').map((line, i) => (
                            <span key={i}>{line}{i < m.content.split('\n').length - 1 && <br />}</span>
                          ))
                        : <span className="text-white/30 animate-pulse font-mono text-xs">thinking...</span>
                      }
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && messages[messages.length - 1]?.content === '' && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/5 border border-white/5">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-white/40 text-xs font-mono ml-1">Virgil is thinking...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-white/5" style={{ background: 'rgba(0,0,0,0.3)' }}>
            <div className="flex gap-3 items-end bg-white/5 border border-white/10 rounded-2xl p-2 transition-all focus-within:border-amber-500/30 focus-within:bg-white/8">
              <span className="text-amber-400 font-mono text-sm pb-2.5 px-1 flex-shrink-0">❯</span>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={`Tell Virgil what you've found in ${stage.label}...`}
                rows={1}
                className="flex-1 bg-transparent text-white/80 text-sm resize-none focus:outline-none placeholder-white/30 leading-relaxed min-h-[36px] max-h-32"
                disabled={!ollamaAvailable}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 128) + 'px'
                }}
              />
              <button 
                onClick={send} 
                disabled={!input.trim() || loading || !ollamaAvailable}
                className="flex-shrink-0 p-2.5 rounded-xl bg-amber-500 text-black font-medium transition-all hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Send size={15} />
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 px-1">
              <span className="text-[10px] text-white/30 font-mono">
                Enter to send · Shift+Enter for new line
              </span>
              <button 
                onClick={() => setShowBeginnerTips(!showBeginnerTips)} 
                className="text-[10px] text-amber-400/60 hover:text-amber-400 transition-colors"
              >
                {showBeginnerTips ? 'Hide Tips' : 'Show Tips'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Right Panel: Tips & Checklist ── */}
        <div 
          className="flex-shrink-0 w-64 overflow-y-auto p-4 border-l border-white/5 custom-scrollbar"
          style={{ background: 'rgba(0,0,0,0.2)' }}
        >
          {showBeginnerTips && stage.beginnerTips && (
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-2 flex items-center gap-1.5">
                <BookOpen size={10} className="text-amber-400" /> Beginner Tips
              </div>
              <div className="space-y-1.5">
                {stage.beginnerTips.map((tip, i) => (
                  <div key={i} className="text-xs text-amber-300/70 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10 leading-relaxed">
                    {tip}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showBeginnerTips && stage.kaliTools && (
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-2 flex items-center gap-1.5">
                <Wrench size={10} className="text-cyan-400" /> Kali Tools
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stage.kaliTools.map((tool, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/5 font-mono text-white/40">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}

          {showBeginnerTips && stage.commonMistakes && (
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-2 flex items-center gap-1.5">
                <AlertTriangle size={10} className="text-red-400" /> Common Mistakes
              </div>
              <div className="space-y-1.5">
                {stage.commonMistakes.map((mistake, i) => (
                  <div key={i} className="text-xs text-red-400/60 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/10 leading-relaxed">
                    {mistake}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5"><ListChecks size={10} className="text-emerald-400" /> Checklist</span>
              <span className="normal-case tracking-normal text-white/40 font-mono text-[9px]">
                {(checkedItems[stage.id]?.length || 0)}/{stage.checklist.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {stage.checklist.map((item, i) => {
                const done = (checkedItems[stage.id] || []).includes(i)
                return (
                  <button
                    key={i}
                    onClick={() => toggleChecklistItem(stage.id, i)}
                    className={`w-full flex items-start gap-2 text-left text-xs px-3 py-2 rounded-lg leading-relaxed transition-all duration-200 border ${
                      done
                        ? 'text-emerald-400/70 bg-emerald-500/5 border-emerald-500/15 line-through decoration-emerald-400/30'
                        : 'text-white/50 bg-white/5 border-white/5 hover:border-amber-500/20 hover:text-white/80'
                    }`}
                  >
                    {done
                      ? <CheckSquare size={13} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                      : <Square size={13} className="flex-shrink-0 mt-0.5 opacity-40" />
                    }
                    <span className={done ? 'line-through' : ''}>{item}</span>
                  </button>
                )
              })}
            </div>
          </div>
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

  // ── History Tab ──
  if (activeTab === 'history') {
    return (
      <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
        <div className="max-w-4xl mx-auto px-8 py-10">
          <div className="flex items-center justify-between mb-8 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-amber-500/20" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.18), rgba(251,191,36,0.04))' }}>
                <Compass size={18} className="text-amber-400" />
              </div>
              <div>
                <span className="text-white font-bold text-xl">Virgil</span>
                <div className="text-white/40 text-xs flex items-center gap-2">
                  Every path you've walked so far
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
                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20">
                <ChevronRight size={12} /> Back to Coach
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          {savedSessions.length > 0 && (
            <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
              <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                <div className="text-white/40">Total</div>
                <div className="text-white font-bold text-lg">{stats.total}</div>
              </div>
              <div className="bg-white/5 border border-yellow-400/20 rounded-xl p-3 text-center">
                <div className="text-yellow-400/60">Favorited</div>
                <div className="text-yellow-400 font-bold text-lg">{stats.favorited}</div>
              </div>
              <div className="bg-white/5 border border-emerald-400/20 rounded-xl p-3 text-center">
                <div className="text-emerald-400/60">Easy</div>
                <div className="text-emerald-400 font-bold text-lg">{stats.byDifficulty.Easy}</div>
              </div>
              <div className="bg-white/5 border border-amber-400/20 rounded-xl p-3 text-center">
                <div className="text-amber-400/60">Medium</div>
                <div className="text-amber-400 font-bold text-lg">{stats.byDifficulty.Medium}</div>
              </div>
              <div className="bg-white/5 border border-red-400/20 rounded-xl p-3 text-center">
                <div className="text-red-400/60">Stages</div>
                <div className="text-red-400 font-bold text-lg">{stats.totalStages}</div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-white/40 text-xs font-mono">
                {savedSessions.length} saved sessions
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-2 text-white/20" />
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search sessions..."
                    className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white/60 focus:outline-none focus:border-amber-500/30 placeholder-white/20 w-32 sm:w-48"
                  />
                </div>
                <select
                  value={filterPlatform}
                  onChange={e => setFilterPlatform(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-white/60 focus:outline-none focus:border-amber-500/30"
                >
                  <option value="All">All Platforms</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select
                  value={filterDifficulty}
                  onChange={e => setFilterDifficulty(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-white/60 focus:outline-none focus:border-amber-500/30"
                >
                  <option value="All">All Difficulties</option>
                  {DIFF_LIST.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-white/60 focus:outline-none focus:border-amber-500/30"
                >
                  <option value="date">Sort by Date</option>
                  <option value="difficulty">Sort by Difficulty</option>
                  <option value="progress">Sort by Progress</option>
                </select>
                <button 
                  onClick={exportSessions} 
                  disabled={savedSessions.length === 0}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors px-2 py-1 border border-white/10 rounded-lg disabled:opacity-40"
                >
                  <Download size={12} /> Export
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors px-2 py-1 border border-white/10 rounded-lg"
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
                  className="flex items-center gap-1 text-xs text-red-400/50 hover:text-red-400 transition-colors px-2 py-1 border border-red-500/20 rounded-lg disabled:opacity-40"
                >
                  <Trash2 size={12} /> Clear All
                </button>
              </div>
            </div>

            {filteredSessions.length === 0 ? (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-12 text-center">
                <Flag size={32} className="text-white/20 mx-auto mb-3" />
                <div className="text-white/40 text-sm font-mono">No saved sessions</div>
                <div className="text-white/20 text-xs mt-1">Start a new machine session to save your progress</div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSessions.map(s => {
                  const progress = Math.round((s.completedStages.length / STAGES.length) * 100)
                  return (
                    <div key={s.id} className="bg-white/5 border border-white/5 rounded-xl p-4 hover:border-amber-500/20 transition-all duration-200">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => loadSession(s)}
                              className="text-amber-400 hover:text-amber-300 font-mono text-sm font-bold transition-colors"
                            >
                              {s.machine.name}
                            </button>
                            <span className="text-white/40 text-xs">{s.machine.platform}</span>
                            <span className="text-white/30 text-xs">•</span>
                            <span className="text-white/30 text-xs">{s.machine.os}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-mono ${
                              s.machine.difficulty === 'Easy' ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5' :
                              s.machine.difficulty === 'Medium' ? 'text-amber-400 border-amber-400/30 bg-amber-400/5' :
                              s.machine.difficulty === 'Hard' ? 'text-orange-400 border-orange-400/30 bg-orange-400/5' :
                              'text-red-400 border-red-400/30 bg-red-400/5'
                            }`}>
                              {s.machine.difficulty}
                            </span>
                            {s.favorite && (
                              <Star size={12} className="text-yellow-400" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-white/30 text-xs">
                              {s.completedStages.length}/{STAGES.length} stages
                            </span>
                            <span className="text-white/20 text-xs">•</span>
                            <span className="text-white/20 text-xs">
                              {new Date(s.timestamp).toLocaleString()}
                            </span>
                            {s.notes && (
                              <>
                                <span className="text-white/20 text-xs">•</span>
                                <span className="text-white/30 text-xs">📝 {s.notes}</span>
                              </>
                            )}
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: progress + '%', background: 'linear-gradient(90deg, #7c3aed, #a855f7, #22d3ee)' }}
                            />
                          </div>
                          {/* Completed stages preview */}
                          <div className="flex gap-1 mt-1.5 flex-wrap">
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
                            className="p-1.5 rounded-lg text-white/30 hover:text-yellow-400 transition-colors"
                            title="Toggle favorite"
                          >
                            <Star size={14} className={s.favorite ? 'text-yellow-400' : ''} />
                          </button>
                          <button
                            onClick={() => loadSession(s)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-amber-400 transition-colors"
                            title="Load session"
                          >
                            <Play size={14} />
                          </button>
                          <button
                            onClick={() => deleteSession(s.id)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-red-400 transition-colors"
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
      </div>
    )
  }

  // Every reachable state is handled by the three branches above
  // (setup screen, active coach screen, and history). This is an
  // unreachable safety net to satisfy TypeScript's return type.
  return null
}

// ─── Helper Components ──────────────────────────────────────────────────────

function OllamaStatusIndicator({ available, model }: { available: boolean | null; model: string }) {
  if (available === null) {
    return <span className="text-xs text-white/40 flex items-center gap-1"><AlertCircle size={11} /> checking...</span>
  }
  if (!available) {
    return <span className="text-xs text-red-400/70 flex items-center gap-1"><AlertCircle size={11} /> offline</span>
  }
  return (
    <span className="text-xs text-emerald-400/70 flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
        className="bg-white/5 border border-white/10 text-white/60 text-xs rounded-lg px-2 py-1 font-mono focus:outline-none focus:border-amber-500/30 max-w-[120px] truncate"
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
      <Cpu size={12} className="text-white/40" />
      <select
        value={activeModel}
        onChange={e => onSelect(e.target.value)}
        disabled={loading || models.length === 0}
        className="bg-white/5 border border-white/10 text-white/60 text-xs rounded-lg px-2 py-1 font-mono focus:outline-none focus:border-amber-500/30 max-w-[150px] truncate"
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