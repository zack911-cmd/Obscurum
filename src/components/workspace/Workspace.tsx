import { useState, useEffect } from 'react'
import { 
  Folder, Plus, Trash2, Target, AlertTriangle, Key, FileText, 
  ChevronDown, ChevronRight, Edit2, Check, Download, Upload,
  Search, Settings, Eye, EyeOff, 
  
  Shield
  } from 'lucide-react'

type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info'
type EngType  = 'pentest' | 'ctf' | 'htb' | 'thm' | 'red_team' | 'research'

type Port = {
  id: string;
  port: string;
  protocol: string;
  service: string;
  version: string;
}

type TargetHost = {
  id: string;
  ip: string;
  hostname: string;
  os: string;
  notes: string;
  ports: Port[];
}

type Finding = {
  id: string;
  title: string;
  severity: Severity;
  description: string;
  status: 'open' | 'resolved';
  cvss?: string;
  references?: string[];
}

type Credential = {
  id: string;
  username: string;
  password: string;
  hash: string;
  service: string;
  valid: boolean;
  notes?: string;
}

type Note = {
  id: string;
  title: string;
  content: string;
  tag: string;
  createdAt: string;
  updatedAt: string;
}

type Engagement = {
  id: string;
  name: string;
  client: string;
  type: EngType;
  status: 'active' | 'completed' | 'paused';
  scope: string;
  createdAt: string;
  updatedAt: string;
  targets: TargetHost[];
  findings: Finding[];
  credentials: Credential[];
  notes: Note[];
}

const SEV_COLOR: Record<Severity, string> = {
  Critical: 'text-red-400 bg-red-500/10 border-red-500/30',
  High:     'text-orange-400 bg-orange-500/10 border-orange-500/30',
  Medium:   'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  Low:      'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  Info:     'text-white/40 bg-white/5 border-white/10',
}

const SEV_PRIORITY: Record<Severity, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4
}

const ENG_ICON: Record<EngType, string> = {
  pentest: '🔍', ctf: '🚩', htb: '📦', thm: '🌐', red_team: '🎭', research: '🔬'
}

const STATUS_COLOR: Record<string, string> = {
  active:    'text-emerald-400 border-emerald-500/30',
  completed: 'text-white/30 border-white/10',
  paused:    'text-yellow-400 border-yellow-500/30',
}

const VALID_STATUSES = ['active', 'completed', 'paused'] as const
const VALID_ENG_TYPES = ['pentest', 'ctf', 'htb', 'thm', 'red_team', 'research'] as const
const VALID_SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Info'] as const

function uuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
}

function now()  { return new Date().toISOString() }

function emptyEng(name: string, type: EngType): Engagement {
  return { 
    id: uuid(), 
    name, 
    client: '', 
    type, 
    status: 'active', 
    scope: '', 
    createdAt: now(),
    updatedAt: now(),
    targets: [], 
    findings: [], 
    credentials: [], 
    notes: [] 
  }
}

function isValidEngagement(data: any): data is Engagement[] {
  if (!Array.isArray(data)) return false
  
  return data.every(eng => {
    if (typeof eng !== 'object' || !eng) return false
    if (typeof eng.id !== 'string') return false
    if (typeof eng.name !== 'string') return false
    if (!VALID_ENG_TYPES.includes(eng.type)) return false
    if (!VALID_STATUSES.includes(eng.status)) return false
    if (typeof eng.scope !== 'string') return false
    if (!Array.isArray(eng.targets)) return false
    if (!Array.isArray(eng.findings)) return false
    if (!Array.isArray(eng.credentials)) return false
    if (!Array.isArray(eng.notes)) return false
    
    return true
  })
}

function sanitizeEngagement(eng: any): Engagement | null {
  try {
    if (!eng || typeof eng !== 'object') return null
    if (typeof eng.id !== 'string') return null
    if (typeof eng.name !== 'string') return null
    
    const type = VALID_ENG_TYPES.includes(eng.type) ? eng.type : 'pentest'
    const status = VALID_STATUSES.includes(eng.status) ? eng.status : 'active'
    
    return {
      id: eng.id,
      name: eng.name || 'Untitled',
      client: typeof eng.client === 'string' ? eng.client : '',
      type: type,
      status: status,
      scope: typeof eng.scope === 'string' ? eng.scope : '',
      createdAt: typeof eng.createdAt === 'string' ? eng.createdAt : now(),
      updatedAt: typeof eng.updatedAt === 'string' ? eng.updatedAt : now(),
      targets: Array.isArray(eng.targets) ? eng.targets : [],
      findings: Array.isArray(eng.findings) ? eng.findings : [],
      credentials: Array.isArray(eng.credentials) ? eng.credentials : [],
      notes: Array.isArray(eng.notes) ? eng.notes : [],
    }
  } catch {
    return null
  }
}

const WORKSPACE_KEY = 'workspace-engagements'

async function migrateLegacyWorkspaceData(): Promise<void> {
  if (typeof window === 'undefined' || !window.obscurum?.secureStore) return

  const legacy = localStorage.getItem(WORKSPACE_KEY)
  if (!legacy) return

  try {
    const parsed = JSON.parse(legacy)
    if (!isValidEngagement(parsed)) {
      console.warn('Legacy workspace data failed validation, not migrating')
      return
    }
    const result = await window.obscurum.secureStore.set(WORKSPACE_KEY, parsed)
    if (result.ok) {
      localStorage.removeItem(WORKSPACE_KEY)
      console.log('Migrated workspace data from localStorage to encrypted storage')
    } else {
      console.error('Migration to secure storage failed, plaintext copy retained:', result.error)
    }
  } catch (e) {
    console.error('Failed to parse/migrate legacy workspace data:', e)
  }
}

export default function Workspace() {
  const [engagements, setEngagements] = useState<Engagement[]>([])
  const [dataLoaded, setDataLoaded] = useState(false)

  const [activeEng, setActiveEng]   = useState<string>('')
  const [activeTab, setActiveTab]   = useState<'targets'|'findings'|'creds'|'notes'>('targets')
  const [showNewEng, setShowNewEng] = useState(false)
  const [newEng, setNewEng]         = useState({ name: '', type: 'pentest' as EngType })
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all')
  const [showResolved, setShowResolved] = useState(false)
  const [autoSave, setAutoSave] = useState(true)
  const [expandedTargets, setExpandedTargets] = useState<Record<string, Set<string>>>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false

    ;(async () => {
      await migrateLegacyWorkspaceData()

      if (!window.obscurum?.secureStore) {
        console.error('secureStore bridge unavailable — cannot load encrypted workspace data')
        setSaveError('Secure storage unavailable. Data cannot be loaded or saved.')
        setDataLoaded(true)
        return
      }

      try {
        const result = await window.obscurum.secureStore.get(WORKSPACE_KEY)
        if (cancelled) return

        if (!result.ok) {
          console.error('Failed to load engagements from secure storage:', result.error)
          setSaveError(`Failed to load workspace data: ${result.error}`)
          setDataLoaded(true)
          return
        }

        if (result.value && isValidEngagement(result.value)) {
          setEngagements(result.value)
        } else if (result.value) {
          console.warn('Invalid engagement data in secure storage')
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Unexpected error loading engagements:', e)
          setSaveError('Unexpected error loading workspace data.')
        }
      } finally {
        if (!cancelled) setDataLoaded(true)
      }
    })()

    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!autoSave || !dataLoaded || typeof window === 'undefined') return
    const secureStore = window.obscurum?.secureStore
    if (!secureStore) return

    let cancelled = false
    ;(async () => {
      const result = await secureStore.set(WORKSPACE_KEY, engagements)
      if (cancelled) return
      if (result.ok) {
        setSaveError(null)
      } else {
        setSaveError(`Failed to save workspace data: ${result.error}`)
        console.error('Save error:', result.error)
      }
    })()

    return () => { cancelled = true }
  }, [engagements, autoSave, dataLoaded])

  useEffect(() => {
    if (engagements.length > 0 && !activeEng) {
      setActiveEng(engagements[0].id)
    }
  }, [engagements, activeEng])

  const currentEng = engagements.find(e => e.id === activeEng)

  const updateEng = (fn: (e: Engagement) => Engagement) => {
    setEngagements(p => p.map(e => e.id === activeEng ? { ...fn(e), updatedAt: now() } : e))
  }

  const addEngagement = () => {
    const trimmedName = newEng.name.trim()
    if (!trimmedName) return
    
    const type = VALID_ENG_TYPES.includes(newEng.type) ? newEng.type : 'pentest'
    
    const e = emptyEng(trimmedName, type)
    setEngagements(p => [...p, e])
    setActiveEng(e.id)
    setShowNewEng(false)
    setNewEng({ name: '', type: 'pentest' })
  }

  const deleteEngagement = (id: string) => {
    if (!window.confirm('Delete this engagement and all its data?')) return
    
    setEngagements(p => p.filter(e => e.id !== id))
    if (activeEng === id) {
      const remaining = engagements.filter(e => e.id !== id)
      setActiveEng(remaining[0]?.id ?? '')
    }
  }

  const addTarget = () => {
    updateEng(e => ({
      ...e, 
      targets: [...e.targets, { 
        id: uuid(), 
        ip: '', 
        hostname: '', 
        os: 'Linux', 
        notes: '', 
        ports: [] 
      }]
    }))
    
    const newTargetId = currentEng?.targets?.[currentEng.targets.length - 1]?.id
    if (newTargetId && activeEng) {
      const currentExpanded = expandedTargets[activeEng] || new Set()
      const newExpanded = new Set(currentExpanded)
      newExpanded.add(newTargetId)
      setExpandedTargets(p => ({
        ...p,
        [activeEng]: newExpanded
      }))
    }
  }

  const updateTarget = (tid: string, k: keyof TargetHost, v: string) => updateEng(e => ({
    ...e, targets: e.targets.map(t => t.id === tid ? { ...t, [k]: v } : t)
  }))

  const deleteTarget = (tid: string) => {
    if (!window.confirm('Delete this target and all its ports?')) return
    updateEng(e => ({ ...e, targets: e.targets.filter(t => t.id !== tid) }))
  }

  const addPort = (tid: string) => updateEng(e => ({
    ...e, targets: e.targets.map(t => t.id === tid
      ? { ...t, ports: [...t.ports, { id: uuid(), port: '', protocol: 'tcp', service: '', version: '' }] }
      : t)
  }))

  const updatePort = (tid: string, pid: string, k: keyof Port, v: string) => updateEng(e => ({
    ...e, targets: e.targets.map(t => t.id === tid
      ? { ...t, ports: t.ports.map(p => p.id === pid ? { ...p, [k]: v } : p) }
      : t)
  }))

  const deletePort = (tid: string, pid: string) => updateEng(e => ({
    ...e, targets: e.targets.map(t => t.id === tid
      ? { ...t, ports: t.ports.filter(p => p.id !== pid) }
      : t)
  }))

  const addFinding = () => updateEng(e => ({
    ...e, findings: [...e.findings, { 
      id: uuid(), 
      title: '', 
      severity: 'High', 
      description: '', 
      status: 'open',
      cvss: '',
      references: []
    }]
  }))

  const updateFinding = (fid: string, k: keyof Finding, v: string | boolean | string[]) => updateEng(e => ({
    ...e, findings: e.findings.map(f => f.id === fid ? { ...f, [k]: v } : f)
  }))

  const deleteFinding = (fid: string) => {
    if (!window.confirm('Delete this finding?')) return
    updateEng(e => ({ ...e, findings: e.findings.filter(f => f.id !== fid) }))
  }

  const addCred = () => updateEng(e => ({
    ...e, credentials: [...e.credentials, { 
      id: uuid(), 
      username: '', 
      password: '', 
      hash: '', 
      service: '', 
      valid: false,
      notes: ''
    }]
  }))

  const updateCred = (cid: string, k: keyof Credential, v: string | boolean) => updateEng(e => ({
    ...e, credentials: e.credentials.map(c => c.id === cid ? { ...c, [k]: v } : c)
  }))

  const deleteCred = (cid: string) => {
    if (!window.confirm('Delete this credential?')) return
    updateEng(e => ({ ...e, credentials: e.credentials.filter(c => c.id !== cid) }))
  }

  const addNote = () => {
    const n: Note = { 
      id: uuid(), 
      title: 'New Note', 
      content: '', 
      tag: 'general', 
      createdAt: now(),
      updatedAt: now()
    }
    updateEng(e => ({ ...e, notes: [...e.notes, n] }))
    setEditingNote(n.id)
  }

  const updateNote = (nid: string, k: keyof Note, v: string) => updateEng(e => ({
    ...e, notes: e.notes.map(n => n.id === nid ? { ...n, [k]: v, updatedAt: now() } : n)
  }))

  const deleteNote = (nid: string) => {
    if (!window.confirm('Delete this note?')) return
    updateEng(e => ({ ...e, notes: e.notes.filter(n => n.id !== nid) }))
  }

  const toggleTarget = (id: string) => {
    if (!activeEng) return
    
    const currentExpanded = expandedTargets[activeEng] || new Set()
    const newExpanded = new Set(currentExpanded)
    
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    
    setExpandedTargets(p => ({
      ...p,
      [activeEng]: newExpanded
    }))
  }

  const getExpandedSet = (): Set<string> => {
    return expandedTargets[activeEng] || new Set()
  }

  const exportWorkspace = () => {
    if (engagements.length === 0) {
      alert('No data to export')
      return
    }
    
    const data = JSON.stringify(engagements, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workspace-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const importWorkspace = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    if (!window.confirm('This will replace all current data. Continue?')) {
      event.target.value = ''
      return
    }
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        if (!text) throw new Error('Empty file')
        
        const parsed = JSON.parse(text)
        
        if (!isValidEngagement(parsed)) {
          throw new Error('Invalid file format: missing required fields')
        }
        
        const sanitized = parsed
          .map(sanitizeEngagement)
          .filter((e): e is Engagement => e !== null)
        
        if (sanitized.length === 0) {
          throw new Error('No valid engagements found in file')
        }
        
        setEngagements(sanitized)
        setActiveEng(sanitized[0].id)
        setExpandedTargets({})
        setSaveError(null)
        
        alert(`Successfully imported ${sanitized.length} engagement${sanitized.length > 1 ? 's' : ''}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        alert(`Failed to import workspace: ${message}`)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const filteredFindings = (() => {
    if (!currentEng) return []
    
    const allFindings = currentEng.findings || []
    const filtered = allFindings.filter(f => {
      const matchesSearch = !searchTerm || 
        f.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.description?.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesSeverity = filterSeverity === 'all' || f.severity === filterSeverity
      const matchesStatus = showResolved || f.status === 'open'
      
      return matchesSearch && matchesSeverity && matchesStatus
    })
    
    return [...filtered].sort((a, b) => 
      SEV_PRIORITY[a.severity] - SEV_PRIORITY[b.severity]
    )
  })()

  const filteredNotes = (() => {
    if (!currentEng) return []
    
    return currentEng.notes.filter(n => {
      return !searchTerm || 
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.tag.toLowerCase().includes(searchTerm.toLowerCase())
    })
  })()

  const input = "w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30 placeholder-white/30"

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      <div className="max-w-6xl mx-auto p-6">
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ 
              background: 'radial-gradient(circle, rgba(251,191,36,0.2), rgba(251,191,36,0.05))', 
              border: '1px solid rgba(251,191,36,0.15)' 
            }}>
              <Folder size={18} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">WORKSPACE</h1>
              <p className="text-white/40 text-xs">Manage engagements, targets, findings, and credentials</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-white/30">
              <Shield size={14} className="text-amber-400" />
              <span>v1.0</span>
            </div>
          </div>
        </div>

        {/* ── Error Display ── */}
        {saveError && (
          <div className="mb-4 p-3 rounded-xl border border-red-500/30 flex items-center gap-2 text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.06)' }}>
            <AlertTriangle size={14} /> {saveError}
            <button 
              onClick={() => setSaveError(null)} 
              className="ml-auto text-white/30 hover:text-white/70 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Engagement Sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-white/10 p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/40 text-xs font-mono">Engagements</span>
                <div className="flex gap-1">
                  <button 
                    onClick={() => setShowNewEng(p => !p)}
                    className="text-emerald-400 hover:opacity-80 transition-opacity"
                    title="New Engagement"
                  >
                    <Plus size={14} />
                  </button>
                  <div className="relative group">
                    <button className="text-white/40 hover:text-white/70 transition-colors">
                      <Settings size={14} />
                    </button>
                    <div className="absolute right-0 mt-1 w-56 p-3 rounded-xl border border-white/10 z-10 hidden group-hover:block" style={{ background: '#0d1022' }}>
                      <label className="flex items-center gap-2 text-xs text-white/60">
                        <input 
                          type="checkbox" 
                          checked={autoSave}
                          onChange={e => setAutoSave(e.target.checked)}
                          className="form-checkbox"
                        />
                        Auto-save to browser
                      </label>
                      <button 
                        onClick={exportWorkspace}
                        className="flex items-center gap-2 w-full text-left text-xs text-white/60 hover:text-emerald-400 mt-2 transition-colors"
                      >
                        <Download size={12} /> Export Workspace
                      </button>
                      <label className="flex items-center gap-2 w-full text-left text-xs text-white/60 hover:text-cyan-400 mt-1 cursor-pointer transition-colors">
                        <Upload size={12} /> Import Workspace
                        <input 
                          type="file" 
                          accept=".json" 
                          onChange={importWorkspace} 
                          className="hidden" 
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {showNewEng && (
                <div className="bg-black/30 border border-white/10 rounded-xl p-3 mb-2 space-y-2">
                  <input 
                    value={newEng.name} 
                    onChange={e => setNewEng(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addEngagement()}
                    placeholder="Engagement name"
                    className={input} 
                  />
                  <select 
                    value={newEng.type} 
                    onChange={e => setNewEng(p => ({ ...p, type: e.target.value as EngType }))}
                    className={input}
                  >
                    {VALID_ENG_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <button 
                    onClick={addEngagement}
                    className="w-full py-1.5 bg-emerald-500 text-black text-xs font-mono font-bold rounded-xl hover:bg-emerald-400 transition-colors"
                  >
                    Create
                  </button>
                </div>
              )}

              <div className="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar">
                {engagements.map(e => {
                  const statusClass = STATUS_COLOR[e.status] || 'text-white/30 border-white/10'
                  const icon = ENG_ICON[e.type] || '📋'
                  
                  return (
                    <div 
                      key={e.id}
                      onClick={() => setActiveEng(e.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all group ${
                        activeEng === e.id 
                          ? 'bg-amber-500/10 border border-amber-500/20 shadow-lg shadow-amber-500/5' 
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span className="text-base flex-shrink-0">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-white/80 text-xs font-mono truncate">{e.name}</div>
                        <div className={`text-[10px] border rounded px-1.5 py-0.5 font-mono inline-block mt-0.5 ${statusClass}`}>{e.status}</div>
                      </div>
                      <button 
                        onClick={ev => { ev.stopPropagation(); deleteEngagement(e.id) }}
                        className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                        title="Delete Engagement"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Main Content ── */}
          <div className="lg:col-span-3">
            {currentEng ? (
              <div className="rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                {/* Engagement Header */}
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{ENG_ICON[currentEng.type] || '📋'}</span>
                    <div className="flex-1">
                      <div className="text-white font-mono font-bold">{currentEng.name}</div>
                      <div className="text-white/30 text-xs">Created: {new Date(currentEng.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: 'Targets',  val: currentEng.targets.length,     color: 'text-cyan-400'   },
                        { label: 'Findings', val: currentEng.findings.length,     color: 'text-red-400'    },
                        { label: 'Creds',    val: currentEng.credentials.length,  color: 'text-yellow-400' },
                        { label: 'Notes',    val: currentEng.notes.length,        color: 'text-emerald-400'  },
                      ].map(s => (
                        <div 
                          key={s.label} 
                          className="bg-black/30 border border-white/10 rounded-xl px-3 py-1.5"
                        >
                          <div className={`text-lg font-mono font-bold ${s.color}`}>{s.val}</div>
                          <div className="text-white/30 text-xs">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-white/30 text-xs font-mono">Scope</label>
                      <input 
                        value={currentEng.scope} 
                        onChange={e => updateEng(en => ({ ...en, scope: e.target.value }))}
                        placeholder="IP ranges, domains..."
                        className={"mt-0.5 " + input} 
                      />
                    </div>
                    <div>
                      <label className="text-white/30 text-xs font-mono">Status</label>
                      <select 
                        value={currentEng.status} 
                        onChange={e => updateEng(en => ({ ...en, status: e.target.value as Engagement['status'] }))}
                        className={"mt-0.5 " + input}
                      >
                        <option value="active" style={{ background: '#0d1022' }}>active</option>
                        <option value="paused" style={{ background: '#0d1022' }}>paused</option>
                        <option value="completed" style={{ background: '#0d1022' }}>completed</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 p-4 border-b border-white/10">
                  {([
                    { id: 'targets',  icon: <Target size={12} />,       label: `Targets (${currentEng.targets.length})`     },
                    { id: 'findings', icon: <AlertTriangle size={12} />, label: `Findings (${currentEng.findings.length})`   },
                    { id: 'creds',    icon: <Key size={12} />,           label: `Creds (${currentEng.credentials.length})`   },
                    { id: 'notes',    icon: <FileText size={12} />,      label: `Notes (${currentEng.notes.length})`         },
                  ] as { id: typeof activeTab; icon: React.ReactNode; label: string }[]).map(tab => (
                    <button 
                      key={tab.id} 
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? 'bg-amber-500/10 border border-amber-500/20 text-white'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {tab.icon}{tab.label}
                    </button>
                  ))}
                </div>

                {/* Search/Filter Bar */}
                {(activeTab === 'findings' || activeTab === 'notes') && (
                  <div className="p-4 border-b border-white/10 flex gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[150px]">
                      <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder={`Search ${activeTab}...`}
                        className="w-full pl-8 pr-3 py-1.5 bg-black/30 border border-white/10 rounded-xl text-xs font-mono text-white/80 focus:outline-none focus:border-amber-500/30"
                      />
                    </div>
                    
                    {activeTab === 'findings' && (
                      <>
                        <select
                          value={filterSeverity}
                          onChange={e => setFilterSeverity(e.target.value as Severity | 'all')}
                          className="bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white/80 focus:outline-none"
                        >
                          <option value="all" style={{ background: '#0d1022' }}>All Severities</option>
                          {VALID_SEVERITIES.map(s => (
                            <option key={s} value={s} style={{ background: '#0d1022' }}>{s}</option>
                          ))}
                        </select>
                        
                        <button
                          onClick={() => setShowResolved(!showResolved)}
                          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded-xl border transition-colors ${
                            showResolved 
                              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' 
                              : 'text-white/40 border-white/10 hover:text-white/70'
                          }`}
                        >
                          {showResolved ? <Eye size={12} /> : <EyeOff size={12} />}
                          Resolved
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Tab Content */}
                <div className="p-4 max-h-[500px] overflow-y-auto custom-scrollbar">

                  {/* ── TARGETS ── */}
                  {activeTab === 'targets' && (
                    <div className="space-y-2">
                      <button 
                        onClick={addTarget}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-xl hover:bg-cyan-500/30 transition-colors font-mono mb-2"
                      >
                        <Plus size={11} /> Add Target
                      </button>
                      {currentEng.targets.map(t => {
                        const isExpanded = getExpandedSet().has(t.id)
                        
                        return (
                          <div 
                            key={t.id} 
                            className="rounded-xl border border-white/10 overflow-hidden" 
                            style={{ background: 'rgba(255,255,255,0.03)' }}
                          >
                            <div className="flex items-center gap-2 px-3 py-2.5">
                              <button 
                                onClick={() => toggleTarget(t.id)} 
                                className="text-white/30"
                              >
                                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </button>
                              <input 
                                value={t.ip} 
                                onChange={e => updateTarget(t.id, 'ip', e.target.value)}
                                placeholder="IP address" 
                                className="w-32 bg-transparent border-b border-white/10 text-cyan-400 text-xs font-mono focus:outline-none" 
                              />
                              <input 
                                value={t.hostname} 
                                onChange={e => updateTarget(t.id, 'hostname', e.target.value)}
                                placeholder="Hostname" 
                                className="flex-1 bg-transparent border-b border-white/10 text-white/80 text-xs font-mono focus:outline-none" 
                              />
                              <select 
                                value={t.os} 
                                onChange={e => updateTarget(t.id, 'os', e.target.value)}
                                className="bg-black/30 border border-white/10 rounded-lg px-2 py-0.5 text-white/40 text-xs font-mono focus:outline-none"
                              >
                                {['Linux','Windows','FreeBSD','macOS','Unknown'].map(o => <option key={o} style={{ background: '#0d1022' }}>{o}</option>)}
                              </select>
                              <span className="text-white/30 text-xs font-mono">{t.ports.length} ports</span>
                              <button 
                                onClick={() => deleteTarget(t.id)} 
                                className="text-white/30 hover:text-red-400 transition-colors"
                                title="Delete Target"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>

                            {isExpanded && (
                              <div className="border-t border-white/10 p-3 space-y-3">
                                <textarea 
                                  value={t.notes} 
                                  onChange={e => updateTarget(t.id, 'notes', e.target.value)}
                                  placeholder="Notes about this target..."
                                  rows={2}
                                  className={"w-full resize-y " + input} 
                                />

                                {/* Ports */}
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-white/30 text-xs font-mono">Open Ports</span>
                                    <button 
                                      onClick={() => addPort(t.id)}
                                      className="text-xs text-cyan-400 hover:opacity-80 font-mono flex items-center gap-1"
                                    >
                                      <Plus size={10} /> Add Port
                                    </button>
                                  </div>
                                  {t.ports.length > 0 && (
                                    <table className="w-full text-xs font-mono">
                                      <thead>
                                        <tr className="text-white/30">
                                          {['Port','Proto','Service','Version',''].map(h => (
                                            <th key={h} className="text-left pb-1 pr-2 font-normal">{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {t.ports.map(p => (
                                          <tr key={p.id}>
                                            <td>
                                              <input 
                                                value={p.port} 
                                                onChange={e => {
                                                  const val = e.target.value.replace(/[^0-9]/g, '')
                                                  if (val === '' || parseInt(val) <= 65535) {
                                                    updatePort(t.id, p.id, 'port', val)
                                                  }
                                                }}
                                                placeholder="22" 
                                                className="w-14 bg-black/30 border border-white/10 rounded-lg px-1 py-0.5 text-cyan-400 text-xs font-mono focus:outline-none mr-1" 
                                              />
                                            </td>
                                            <td>
                                              <select 
                                                value={p.protocol} 
                                                onChange={e => updatePort(t.id, p.id, 'protocol', e.target.value)} 
                                                className="bg-black/30 border border-white/10 rounded-lg px-1 py-0.5 text-xs font-mono focus:outline-none mr-1 text-white/60"
                                              >
                                                <option value="tcp" style={{ background: '#0d1022' }}>tcp</option>
                                                <option value="udp" style={{ background: '#0d1022' }}>udp</option>
                                              </select>
                                            </td>
                                            <td>
                                              <input 
                                                value={p.service} 
                                                onChange={e => updatePort(t.id, p.id, 'service', e.target.value)} 
                                                placeholder="ssh" 
                                                className="w-20 bg-black/30 border border-white/10 rounded-lg px-1 py-0.5 text-white/80 text-xs font-mono focus:outline-none mr-1" 
                                              />
                                            </td>
                                            <td>
                                              <input 
                                                value={p.version} 
                                                onChange={e => updatePort(t.id, p.id, 'version', e.target.value)} 
                                                placeholder="OpenSSH 8.9" 
                                                className="w-28 bg-black/30 border border-white/10 rounded-lg px-1 py-0.5 text-white/40 text-xs font-mono focus:outline-none mr-1" 
                                              />
                                            </td>
                                            <td>
                                              <button 
                                                onClick={() => deletePort(t.id, p.id)} 
                                                className="text-white/30 hover:text-red-400 transition-colors"
                                                title="Delete Port"
                                              >
                                                <Trash2 size={11} />
                                              </button>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* ── FINDINGS ── */}
                  {activeTab === 'findings' && (
                    <div className="space-y-2">
                      <button 
                        onClick={addFinding}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/30 transition-colors font-mono mb-2"
                      >
                        <Plus size={11} /> Add Finding
                      </button>
                      {filteredFindings.length === 0 ? (
                        <div className="text-center py-8 text-white/30">
                          {searchTerm || filterSeverity !== 'all' || !showResolved
                            ? 'No findings match your filters'
                            : 'No findings yet'}
                        </div>
                      ) : (
                        filteredFindings.map(f => (
                          <div 
                            key={f.id} 
                            className="rounded-xl border border-white/10 p-3 space-y-2" 
                            style={{ background: 'rgba(255,255,255,0.03)' }}
                          >
                            <div className="flex items-center gap-2">
                              <input 
                                value={f.title} 
                                onChange={e => updateFinding(f.id, 'title', e.target.value)}
                                placeholder="Finding title..."
                                className={"flex-1 " + input} 
                              />
                              <select 
                                value={f.severity} 
                                onChange={e => updateFinding(f.id, 'severity', e.target.value as Severity)}
                                className={"w-28 rounded-xl px-2 py-1 text-xs font-mono focus:outline-none bg-black/30 border " + SEV_COLOR[f.severity]}
                              >
                                {VALID_SEVERITIES.map(s => <option key={s} style={{ background: '#0d1022' }}>{s}</option>)}
                              </select>
                              <button 
                                onClick={() => updateFinding(f.id, 'status', f.status === 'open' ? 'resolved' : 'open')}
                                className={"text-xs font-mono px-2 py-1 rounded-xl border transition-colors " +
                                  (f.status === 'open' ? 'text-red-400 border-red-500/30' : 'text-emerald-400 border-emerald-500/30')}
                              >
                                {f.status}
                              </button>
                              <button 
                                onClick={() => deleteFinding(f.id)} 
                                className="text-white/30 hover:text-red-400 transition-colors"
                                title="Delete Finding"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <textarea 
                              value={f.description} 
                              onChange={e => updateFinding(f.id, 'description', e.target.value)}
                              placeholder="Describe the finding..."
                              rows={3}
                              className={"resize-y " + input} 
                            />
                            <div className="flex gap-2">
                              <div className="flex-1">
                                <input
                                  value={f.cvss || ''}
                                  onChange={e => updateFinding(f.id, 'cvss', e.target.value)}
                                  placeholder="CVSS Score (e.g., 7.5)"
                                  className={"w-full " + input}
                                />
                              </div>
                              <div className="flex-1">
                                <input
                                  value={f.references?.join(', ') || ''}
                                  onChange={e => {
                                    const refs = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                    updateFinding(f.id, 'references', refs)
                                  }}
                                  placeholder="References (comma separated URLs)"
                                  className={"w-full " + input}
                                />
                              </div>
                            </div>
                            {f.references && f.references.length > 0 && (
                              <div className="text-xs text-white/30">
                                References: {f.references.join(', ')}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* ── CREDENTIALS ── */}
                  {activeTab === 'creds' && (
                    <div className="space-y-2">
                      <button 
                        onClick={addCred}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-xl hover:bg-yellow-500/30 transition-colors font-mono mb-2"
                      >
                        <Plus size={11} /> Add Credential
                      </button>
                      {currentEng.credentials.map(c => (
                        <div 
                          key={c.id} 
                          className="rounded-xl border border-white/10 p-3" 
                          style={{ background: 'rgba(255,255,255,0.03)' }}
                        >
                          <div className="grid grid-cols-6 gap-2 items-center">
                            <input 
                              value={c.username} 
                              onChange={e => updateCred(c.id, 'username', e.target.value)}
                              placeholder="username" 
                              className={input} 
                            />
                            <input 
                              value={c.password} 
                              onChange={e => updateCred(c.id, 'password', e.target.value)}
                              placeholder="password" 
                              className={input} 
                            />
                            <input 
                              value={c.hash} 
                              onChange={e => updateCred(c.id, 'hash', e.target.value)}
                              placeholder="hash" 
                              className={input} 
                            />
                            <input 
                              value={c.service} 
                              onChange={e => updateCred(c.id, 'service', e.target.value)}
                              placeholder="service" 
                              className={input} 
                            />
                            <textarea 
                              value={c.notes || ''} 
                              onChange={e => updateCred(c.id, 'notes', e.target.value)}
                              placeholder="notes" 
                              className={input + " resize-y"} 
                              rows={1}
                            />
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => updateCred(c.id, 'valid', !c.valid)}
                                className={"text-xs font-mono px-2 py-1 rounded-xl border transition-colors " +
                                  (c.valid ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-white/30 border-white/10')}
                              >
                                {c.valid ? '✓ valid' : 'unverified'}
                              </button>
                              <button 
                                onClick={() => deleteCred(c.id)} 
                                className="text-white/30 hover:text-red-400 transition-colors"
                                title="Delete Credential"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── NOTES ── */}
                  {activeTab === 'notes' && (
                    <div className="space-y-2">
                      <button 
                        onClick={addNote}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition-colors font-mono mb-2"
                      >
                        <Plus size={11} /> Add Note
                      </button>
                      {filteredNotes.length === 0 ? (
                        <div className="text-center py-8 text-white/30">
                          {searchTerm ? 'No notes match your search' : 'No notes yet'}
                        </div>
                      ) : (
                        filteredNotes.map(n => {
                          const isEditing = editingNote === n.id
                          
                          return (
                            <div 
                              key={n.id} 
                              className="rounded-xl border border-white/10 p-3 space-y-2" 
                              style={{ background: 'rgba(255,255,255,0.03)' }}
                            >
                              <div className="flex items-center gap-2">
                                {isEditing ? (
                                  <input 
                                    value={n.title} 
                                    onChange={e => updateNote(n.id, 'title', e.target.value)}
                                    className={"flex-1 " + input} 
                                  />
                                ) : (
                                  <span className="flex-1 text-white/80 text-xs font-mono font-bold">{n.title}</span>
                                )}
                                <select 
                                  value={n.tag} 
                                  onChange={e => updateNote(n.id, 'tag', e.target.value)}
                                  className="bg-black/30 border border-white/10 rounded-lg px-2 py-0.5 text-white/40 text-xs font-mono focus:outline-none"
                                >
                                  {['recon','enum','exploit','privesc','post','general'].map(t => <option key={t} style={{ background: '#0d1022' }}>{t}</option>)}
                                </select>
                                <span className="text-white/30 text-xs">
                                  {new Date(n.updatedAt).toLocaleDateString()}
                                </span>
                                <button 
                                  onClick={() => setEditingNote(isEditing ? null : n.id)}
                                  className="text-white/30 hover:text-cyan-400 transition-colors"
                                  title={isEditing ? "Lock" : "Edit"}
                                >
                                  {isEditing ? <Check size={12} /> : <Edit2 size={12} />}
                                </button>
                                <button 
                                  onClick={() => deleteNote(n.id)} 
                                  className="text-white/30 hover:text-red-400 transition-colors"
                                  title="Delete Note"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              <textarea 
                                value={n.content} 
                                onChange={e => updateNote(n.id, 'content', e.target.value)}
                                placeholder="Write your notes here..."
                                rows={5}
                                className={"resize-y " + input} 
                              />
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 p-12 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <Folder size={48} className="text-white/20 mx-auto mb-4" />
                <div className="text-white/40 text-sm font-mono">No engagement selected</div>
                <button 
                  onClick={() => setShowNewEng(true)}
                  className="mt-3 text-xs text-emerald-400 hover:opacity-80 font-mono flex items-center gap-1 mx-auto transition-colors"
                >
                  <Plus size={12} /> Create your first engagement
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}