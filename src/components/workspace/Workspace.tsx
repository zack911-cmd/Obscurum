import { useState, useEffect } from 'react'
import { 
  Folder, Plus, Trash2, Target, AlertTriangle, Key, FileText, 
  ChevronDown, ChevronRight, Edit2, Check, Download, Upload,
  Search, Settings, Eye, EyeOff
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
  Critical: 'text-terminal-red bg-terminal-red/10 border-terminal-red',
  High:     'text-terminal-yellow bg-terminal-yellow/10 border-terminal-yellow',
  Medium:   'text-terminal-blue bg-terminal-blue/10 border-terminal-blue',
  Low:      'text-terminal-green bg-terminal-green/10 border-terminal-green',
  Info:     'text-terminal-muted bg-terminal-muted/10 border-terminal-muted',
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
  active:    'text-terminal-green border-terminal-green',
  completed: 'text-terminal-muted border-terminal-muted',
  paused:    'text-terminal-yellow border-terminal-yellow',
}

function uuid() { return crypto.randomUUID() }
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

export default function Workspace() {
  const [engagements, setEngagements] = useState<Engagement[]>(() => {
    const saved = localStorage.getItem('workspace-engagements')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return []
      }
    }
    return []
  })
  
  const [activeEng, setActiveEng]   = useState<string>('')
  const [activeTab, setActiveTab]   = useState<'targets'|'findings'|'creds'|'notes'>('targets')
  const [showNewEng, setShowNewEng] = useState(false)
  const [newEng, setNewEng]         = useState({ name: '', type: 'pentest' as EngType })
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all')
  const [showResolved, setShowResolved] = useState(false)
  const [autoSave, setAutoSave] = useState(true)

  // Auto-save to localStorage
  useEffect(() => {
    if (autoSave) {
      localStorage.setItem('workspace-engagements', JSON.stringify(engagements))
    }
  }, [engagements, autoSave])

  // Set first engagement as active on load
  useEffect(() => {
    if (engagements.length > 0 && !activeEng) {
      setActiveEng(engagements[0].id)
    }
  }, [engagements, activeEng])

  // Add new engagement
  const addEngagement = () => {
    if (!newEng.name.trim()) return
    const e = emptyEng(newEng.name, newEng.type)
    setEngagements(p => [...p, e])
    setActiveEng(e.id)
    setShowNewEng(false)
    setNewEng({ name: '', type: 'pentest' })
  }

  const deleteEngagement = (id: string) => {
    setEngagements(p => p.filter(e => e.id !== id))
    if (activeEng === id) {
      const remaining = engagements.filter(e => e.id !== id)
      setActiveEng(remaining[0]?.id ?? '')
    }
  }

  const eng = engagements.find(e => e.id === activeEng)

  const updateEng = (fn: (e: Engagement) => Engagement) => {
    setEngagements(p => p.map(e => e.id === activeEng ? { ...fn(e), updatedAt: now() } : e))
  }

  // Targets
  const addTarget = () => updateEng(e => ({
    ...e, targets: [...e.targets, { id: uuid(), ip: '', hostname: '', os: 'Linux', notes: '', ports: [] }]
  }))

  const updateTarget = (tid: string, k: keyof TargetHost, v: string) => updateEng(e => ({
    ...e, targets: e.targets.map(t => t.id === tid ? { ...t, [k]: v } : t)
  }))

  const deleteTarget = (tid: string) => updateEng(e => ({ ...e, targets: e.targets.filter(t => t.id !== tid) }))

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

  // Findings
  const addFinding = () => updateEng(e => ({
    ...e, findings: [...e.findings, { id: uuid(), title: '', severity: 'High', description: '', status: 'open' }]
  }))

  const updateFinding = (fid: string, k: keyof Finding, v: string | boolean) => updateEng(e => ({
    ...e, findings: e.findings.map(f => f.id === fid ? { ...f, [k]: v } : f)
  }))

  const deleteFinding = (fid: string) => updateEng(e => ({ ...e, findings: e.findings.filter(f => f.id !== fid) }))

  // Credentials
  const addCred = () => updateEng(e => ({
    ...e, credentials: [...e.credentials, { id: uuid(), username: '', password: '', hash: '', service: '', valid: false }]
  }))

  const updateCred = (cid: string, k: keyof Credential, v: string | boolean) => updateEng(e => ({
    ...e, credentials: e.credentials.map(c => c.id === cid ? { ...c, [k]: v } : c)
  }))

  const deleteCred = (cid: string) => updateEng(e => ({ ...e, credentials: e.credentials.filter(c => c.id !== cid) }))

  // Notes
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

  const deleteNote = (nid: string) => updateEng(e => ({ ...e, notes: e.notes.filter(n => n.id !== nid) }))

  const [expandedTargets, setExpandedTargets] = useState<Set<string>>(new Set())
  const toggleTarget = (id: string) => setExpandedTargets(p => { 
    const n = new Set(p); 
    n.has(id) ? n.delete(id) : n.add(id); 
    return n 
  })

  // Export/Import
  const exportWorkspace = () => {
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
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (Array.isArray(data)) {
          setEngagements(data)
          if (data.length > 0) setActiveEng(data[0].id)
        } else {
          throw new Error('Invalid file format')
        }
      } catch (err) {
        alert('Invalid file format')
      }
    }
    reader.readAsText(file)
    event.target.value = '' // Reset input
  }

  // Filtered data
  const filteredFindings = eng?.findings.filter(f => {
    const matchesSearch = !searchTerm || 
      f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.description.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesSeverity = filterSeverity === 'all' || f.severity === filterSeverity
    const matchesStatus = showResolved || f.status === 'open'
    
    return matchesSearch && matchesSeverity && matchesStatus
  }).sort((a, b) => 
    SEV_PRIORITY[a.severity] - SEV_PRIORITY[b.severity]
  ) || []

  const filteredNotes = eng?.notes.filter(n => {
    return !searchTerm || 
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.tag.toLowerCase().includes(searchTerm.toLowerCase())
  }) || []

  const input = "w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-terminal-text text-xs font-mono focus:outline-none focus:border-terminal-blue placeholder-terminal-muted"

  return (
    <div className="flex h-full gap-3 max-w-6xl mx-auto">

      {/* Sidebar — engagements */}
      <div className="w-52 flex-shrink-0 flex flex-col gap-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-terminal-muted text-xs font-mono">Engagements</span>
          <div className="flex gap-1">
            <button 
              onClick={() => setShowNewEng(p => !p)}
              className="text-terminal-green hover:opacity-80 transition-opacity"
              title="New Engagement"
            >
              <Plus size={14} />
            </button>
            <div className="relative group">
              <button className="text-terminal-muted hover:text-terminal-blue transition-colors">
                <Settings size={14} />
              </button>
              <div className="absolute left-0 mt-1 w-48 p-2 bg-terminal-surface border border-terminal-border rounded shadow-lg z-10 hidden group-hover:block">
                <label className="flex items-center gap-2 text-xs text-terminal-text">
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
                  className="flex items-center gap-2 w-full text-left text-xs text-terminal-text hover:text-terminal-green mt-2"
                >
                  <Download size={12} /> Export Workspace
                </button>
                <label className="flex items-center gap-2 w-full text-left text-xs text-terminal-text hover:text-terminal-cyan mt-1 cursor-pointer">
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
          <div className="bg-terminal-surface border border-terminal-border rounded p-2 mb-1 space-y-1">
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
              {(['pentest','ctf','htb','thm','red_team','research'] as EngType[]).map(t => <option key={t}>{t}</option>)}
            </select>
            <button 
              onClick={addEngagement}
              className="w-full py-1 bg-terminal-green text-terminal-bg text-xs font-mono rounded hover:opacity-90"
            >
              Create
            </button>
          </div>
        )}

        {engagements.map(e => (
          <div 
            key={e.id}
            onClick={() => setActiveEng(e.id)}
            className={"flex items-center gap-2 px-2 py-2 rounded cursor-pointer transition-colors group " +
              (activeEng === e.id ? 'bg-terminal-card border border-terminal-border' : 'hover:bg-terminal-surface')}
          >
            <span className="text-base flex-shrink-0">{ENG_ICON[e.type]}</span>
            <div className="flex-1 min-w-0">
              <div className="text-terminal-text text-xs font-mono truncate">{e.name}</div>
              <div className={"text-xs border rounded px-1 font-mono inline-block mt-0.5 " + STATUS_COLOR[e.status]}>{e.status}</div>
            </div>
            <button 
              onClick={ev => { ev.stopPropagation(); deleteEngagement(e.id) }}
              className="opacity-0 group-hover:opacity-100 text-terminal-muted hover:text-terminal-red transition-all"
              title="Delete Engagement"
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      {/* Main content */}
      {eng ? (
        <div className="flex-1 flex flex-col min-w-0">

          {/* Engagement header */}
          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-3 mb-3 flex-shrink-0">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{ENG_ICON[eng.type]}</span>
              <div className="flex-1">
                <div className="text-terminal-text font-mono font-bold">{eng.name}</div>
                <div className="text-terminal-muted text-xs">Created: {new Date(eng.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Targets',  val: eng.targets.length,     color: 'text-terminal-blue'   },
                  { label: 'Findings', val: eng.findings.length,     color: 'text-terminal-red'    },
                  { label: 'Creds',    val: eng.credentials.length,  color: 'text-terminal-yellow' },
                  { label: 'Notes',    val: eng.notes.length,        color: 'text-terminal-green'  },
                ].map(s => (
                  <div 
                    key={s.label} 
                    className="bg-terminal-bg border border-terminal-border rounded px-3 py-1"
                  >
                    <div className={"text-lg font-mono font-bold " + s.color}>{s.val}</div>
                    <div className="text-terminal-muted text-xs">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-terminal-muted text-xs font-mono">Scope</label>
                <input 
                  value={eng.scope} 
                  onChange={e => updateEng(en => ({ ...en, scope: e.target.value }))}
                  placeholder="IP ranges, domains..."
                  className={"mt-0.5 " + input} 
                />
              </div>
              <div>
                <label className="text-terminal-muted text-xs font-mono">Status</label>
                <select 
                  value={eng.status} 
                  onChange={e => updateEng(en => ({ ...en, status: e.target.value as Engagement['status'] }))}
                  className={"mt-0.5 " + input}
                >
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                  <option value="completed">completed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-3 flex-shrink-0">
            {([
              { id: 'targets',  icon: <Target size={12} />,       label: `Targets (${eng.targets.length})`     },
              { id: 'findings', icon: <AlertTriangle size={12} />, label: `Findings (${eng.findings.length})`   },
              { id: 'creds',    icon: <Key size={12} />,           label: `Creds (${eng.credentials.length})`   },
              { id: 'notes',    icon: <FileText size={12} />,      label: `Notes (${eng.notes.length})`         },
            ] as { id: typeof activeTab; icon: React.ReactNode; label: string }[]).map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)}
                className={"flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded transition-colors " +
                  (activeTab === tab.id
                    ? 'bg-terminal-card border border-terminal-border text-terminal-text'
                    : 'text-terminal-muted hover:text-terminal-text')}
              >
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* Search/Filter Bar */}
          {(activeTab === 'findings' || activeTab === 'notes') && (
            <div className="flex gap-2 mb-3 flex-shrink-0">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-terminal-muted" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder={`Search ${activeTab}...`}
                  className="w-full pl-8 pr-3 py-1 bg-terminal-bg border border-terminal-border rounded text-xs font-mono text-terminal-text focus:outline-none focus:border-terminal-blue"
                />
              </div>
              
              {activeTab === 'findings' && (
                <>
                  <select
                    value={filterSeverity}
                    onChange={e => setFilterSeverity(e.target.value as Severity | 'all')}
                    className="bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-xs font-mono text-terminal-text focus:outline-none"
                  >
                    <option value="all">All Severities</option>
                    {(['Critical','High','Medium','Low','Info'] as Severity[]).map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  
                  <button
                    onClick={() => setShowResolved(!showResolved)}
                    className={`flex items-center gap-1 px-2 py-1 text-xs font-mono rounded border ${
                      showResolved 
                        ? 'text-terminal-green border-terminal-green/30 bg-terminal-green/10' 
                        : 'text-terminal-muted border-terminal-border'
                    }`}
                  >
                    {showResolved ? <Eye size={12} /> : <EyeOff size={12} />}
                    Resolved
                  </button>
                </>
              )}
            </div>
          )}

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">

            {/* ── TARGETS ── */}
            {activeTab === 'targets' && (
              <div className="space-y-2">
                <button 
                  onClick={addTarget}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-terminal-blue/20 border border-terminal-blue/30 text-terminal-blue rounded hover:bg-terminal-blue/30 transition-colors font-mono mb-2"
                >
                  <Plus size={11} /> Add Target
                </button>
                {eng.targets.map(t => (
                  <div 
                    key={t.id} 
                    className="bg-terminal-surface border border-terminal-border rounded-lg overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button 
                        onClick={() => toggleTarget(t.id)} 
                        className="text-terminal-muted"
                      >
                        {expandedTargets.has(t.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                      <input 
                        value={t.ip} 
                        onChange={e => updateTarget(t.id, 'ip', e.target.value)}
                        placeholder="IP address" 
                        className="w-32 bg-transparent border-b border-terminal-border text-terminal-cyan text-xs font-mono focus:outline-none" 
                      />
                      <input 
                        value={t.hostname} 
                        onChange={e => updateTarget(t.id, 'hostname', e.target.value)}
                        placeholder="Hostname" 
                        className="flex-1 bg-transparent border-b border-terminal-border text-terminal-text text-xs font-mono focus:outline-none" 
                      />
                      <select 
                        value={t.os} 
                        onChange={e => updateTarget(t.id, 'os', e.target.value)}
                        className="bg-terminal-bg border border-terminal-border rounded px-2 py-0.5 text-terminal-muted text-xs font-mono focus:outline-none"
                      >
                        {['Linux','Windows','FreeBSD','macOS','Unknown'].map(o => <option key={o}>{o}</option>)}
                      </select>
                      <span className="text-terminal-muted text-xs font-mono">{t.ports.length} ports</span>
                      <button 
                        onClick={() => deleteTarget(t.id)} 
                        className="text-terminal-muted hover:text-terminal-red transition-colors"
                        title="Delete Target"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {expandedTargets.has(t.id) && (
                      <div className="border-t border-terminal-border p-3 space-y-3">
                        <textarea 
                          value={t.notes} 
                          onChange={e => updateTarget(t.id, 'notes', e.target.value)}
                          placeholder="Notes about this target..."
                          rows={2}
                          className={"w-full resize-y " + input} 
                        />

                        {/* Ports */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-terminal-muted text-xs font-mono">Open Ports</span>
                            <button 
                              onClick={() => addPort(t.id)}
                              className="text-xs text-terminal-blue hover:opacity-80 font-mono flex items-center gap-1"
                            >
                              <Plus size={10} /> Add Port
                            </button>
                          </div>
                          {t.ports.length > 0 && (
                            <table className="w-full text-xs font-mono">
                              <thead>
                                <tr className="text-terminal-muted">
                                  {['Port','Proto','Service','Version',''].map(h => (
                                    <th key={h} className="text-left pb-1 pr-2">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {t.ports.map(p => (
                                  <tr key={p.id}>
                                    <td>
                                      <input 
                                        value={p.port} 
                                        onChange={e => updatePort(t.id, p.id, 'port', e.target.value)} 
                                        placeholder="22" 
                                        className="w-14 bg-terminal-bg border border-terminal-border rounded px-1 py-0.5 text-terminal-cyan text-xs font-mono focus:outline-none mr-1" 
                                      />
                                    </td>
                                    <td>
                                      <select 
                                        value={p.protocol} 
                                        onChange={e => updatePort(t.id, p.id, 'protocol', e.target.value)} 
                                        className="bg-terminal-bg border border-terminal-border rounded px-1 py-0.5 text-xs font-mono focus:outline-none mr-1"
                                      >
                                        <option value="tcp">tcp</option>
                                        <option value="udp">udp</option>
                                      </select>
                                    </td>
                                    <td>
                                      <input 
                                        value={p.service} 
                                        onChange={e => updatePort(t.id, p.id, 'service', e.target.value)} 
                                        placeholder="ssh" 
                                        className="w-20 bg-terminal-bg border border-terminal-border rounded px-1 py-0.5 text-terminal-text text-xs font-mono focus:outline-none mr-1" 
                                      />
                                    </td>
                                    <td>
                                      <input 
                                        value={p.version} 
                                        onChange={e => updatePort(t.id, p.id, 'version', e.target.value)} 
                                        placeholder="OpenSSH 8.9" 
                                        className="w-28 bg-terminal-bg border border-terminal-border rounded px-1 py-0.5 text-terminal-muted text-xs font-mono focus:outline-none mr-1" 
                                      />
                                    </td>
                                    <td>
                                      <button 
                                        onClick={() => deletePort(t.id, p.id)} 
                                        className="text-terminal-muted hover:text-terminal-red transition-colors"
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
                ))}
              </div>
            )}

            {/* ── FINDINGS ── */}
            {activeTab === 'findings' && (
              <div className="space-y-2">
                <button 
                  onClick={addFinding}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-terminal-red/20 border border-terminal-red/30 text-terminal-red rounded hover:bg-terminal-red/30 transition-colors font-mono mb-2"
                >
                  <Plus size={11} /> Add Finding
                </button>
                {filteredFindings.length === 0 ? (
                  <div className="text-center py-8 text-terminal-muted">
                    {searchTerm || filterSeverity !== 'all' || !showResolved
                      ? 'No findings match your filters'
                      : 'No findings yet'}
                  </div>
                ) : (
                  filteredFindings.map(f => (
                    <div 
                      key={f.id} 
                      className="bg-terminal-surface border border-terminal-border rounded-lg p-3 space-y-2"
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
                          onChange={e => updateFinding(f.id, 'severity', e.target.value)}
                          className={"w-28 border rounded px-2 py-1 text-xs font-mono focus:outline-none bg-terminal-bg " + SEV_COLOR[f.severity as Severity]}
                        >
                          {['Critical','High','Medium','Low','Info'].map(s => <option key={s}>{s}</option>)}
                        </select>
                        <button 
                          onClick={() => updateFinding(f.id, 'status', f.status === 'open' ? 'resolved' : 'open')}
                          className={"text-xs font-mono px-2 py-1 rounded border transition-colors " +
                            (f.status === 'open' ? 'text-terminal-red border-terminal-red/30' : 'text-terminal-green border-terminal-green/30')}
                        >
                          {f.status}
                        </button>
                        <button 
                          onClick={() => deleteFinding(f.id)} 
                          className="text-terminal-muted hover:text-terminal-red transition-colors"
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
                      {f.references && f.references.length > 0 && (
                        <div className="text-xs text-terminal-muted">
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
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-terminal-yellow/20 border border-terminal-yellow/30 text-terminal-yellow rounded hover:bg-terminal-yellow/30 transition-colors font-mono mb-2"
                >
                  <Plus size={11} /> Add Credential
                </button>
                {eng.credentials.map(c => (
                  <div 
                    key={c.id} 
                    className="bg-terminal-surface border border-terminal-border rounded-lg p-3"
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
                          className={"text-xs font-mono px-2 py-1 rounded border transition-colors " +
                            (c.valid ? 'text-terminal-green border-terminal-green/30 bg-terminal-green/10' : 'text-terminal-muted border-terminal-border')}
                        >
                          {c.valid ? '✓ valid' : 'unverified'}
                        </button>
                        <button 
                          onClick={() => deleteCred(c.id)} 
                          className="text-terminal-muted hover:text-terminal-red transition-colors"
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
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-terminal-green/20 border border-terminal-green/30 text-terminal-green rounded hover:bg-terminal-green/30 transition-colors font-mono mb-2"
                >
                  <Plus size={11} /> Add Note
                </button>
                {filteredNotes.length === 0 ? (
                  <div className="text-center py-8 text-terminal-muted">
                    {searchTerm ? 'No notes match your search' : 'No notes yet'}
                  </div>
                ) : (
                  filteredNotes.map(n => (
                    <div 
                      key={n.id} 
                      className="bg-terminal-surface border border-terminal-border rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        {editingNote === n.id
                          ? <input 
                              value={n.title} 
                              onChange={e => updateNote(n.id, 'title', e.target.value)}
                              className={"flex-1 " + input} 
                            />
                          : <span className="flex-1 text-terminal-text text-xs font-mono font-bold">{n.title}</span>
                        }
                        <select 
                          value={n.tag} 
                          onChange={e => updateNote(n.id, 'tag', e.target.value)}
                          className="bg-terminal-bg border border-terminal-border rounded px-2 py-0.5 text-terminal-muted text-xs font-mono focus:outline-none"
                        >
                          {['recon','enum','exploit','privesc','post','general'].map(t => <option key={t}>{t}</option>)}
                        </select>
                        <span className="text-terminal-muted text-xs">
                          {new Date(n.updatedAt).toLocaleDateString()}
                        </span>
                        <button 
                          onClick={() => setEditingNote(editingNote === n.id ? null : n.id)}
                          className="text-terminal-muted hover:text-terminal-blue transition-colors"
                          title={editingNote === n.id ? "Save" : "Edit"}
                        >
                          {editingNote === n.id ? <Check size={12} /> : <Edit2 size={12} />}
                        </button>
                        <button 
                          onClick={() => deleteNote(n.id)} 
                          className="text-terminal-muted hover:text-terminal-red transition-colors"
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
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Folder size={40} className="text-terminal-muted opacity-30 mx-auto mb-3" />
            <div className="text-terminal-muted text-sm font-mono">No engagement selected</div>
            <button 
              onClick={() => setShowNewEng(true)}
              className="mt-3 text-xs text-terminal-green hover:opacity-80 font-mono flex items-center gap-1 mx-auto"
            >
              <Plus size={12} /> Create your first engagement
            </button>
          </div>
        </div>
      )}
    </div>
  )
}