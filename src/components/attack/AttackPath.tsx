import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  Panel,
  Handle,
  Position,
  MarkerType,
  ReactFlowProvider,
} from '@xyflow/react'
import type { Node, Edge, Connection, NodeTypes } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  GitBranch, Plus, Trash2, Download, Cpu, Save,
  Upload, History, Star, Play, 
  
  Shield, 
  AlertTriangle} from 'lucide-react'
import { useActiveModel } from '../models/ModelManager'

// ── Node types ──────────────────────────────────────────
type NodeData = {
  label: string;
  type: 'target' | 'foothold' | 'pivot' | 'privesc' | 'domain' | 'flag';
  detail?: string;
  timestamp?: string;
  notes?: string;
  cve?: string;
  tool?: string;
}

type SavedPath = {
  id: string;
  timestamp: number;
  nodes: Node[];
  edges: Edge[];
  name: string;
  notes?: string;
  favorite?: boolean;
  tags?: string[];
}

const NODE_STYLES: Record<string, { bg: string; border: string; text: string; icon: string; glow: string }> = {
  target:   { bg: '#1c2128', border: '#58a6ff', text: '#58a6ff', icon: '🎯', glow: '#58a6ff33' },
  foothold: { bg: '#1c2128', border: '#f85149', text: '#f85149', icon: '💥', glow: '#f8514933' },
  pivot:    { bg: '#1c2128', border: '#bc8cff', text: '#bc8cff', icon: '🔀', glow: '#bc8cff33' },
  privesc:  { bg: '#1c2128', border: '#d29922', text: '#d29922', icon: '👑', glow: '#d2992233' },
  domain:   { bg: '#1c2128', border: '#39d353', text: '#39d353', icon: '🏰', glow: '#39d35333' },
  flag:     { bg: '#1c2128', border: '#39c5cf', text: '#39c5cf', icon: '🚩', glow: '#39c5cf33' },
}

function CustomNode({ data }: { data: NodeData }) {
  const s = NODE_STYLES[data.type] ?? NODE_STYLES.target
  return (
    <div style={{
      background: `radial-gradient(circle at 50% 0%, ${s.bg}, #0d1117)`,
      border: `1.5px solid ${s.border}`,
      borderRadius: 10,
      padding: '10px 16px',
      minWidth: 150,
      boxShadow: `0 0 20px ${s.glow}, inset 0 0 20px ${s.glow}`,
      backdropFilter: 'blur(4px)',
    }}>
      <Handle type="target" position={Position.Top}    style={{ background: s.border, width: 8, height: 8, border: 'none' }} />
      <Handle type="target" position={Position.Left}   style={{ background: s.border, width: 8, height: 8, border: 'none' }} />
      <div style={{ color: s.text, fontFamily: 'monospace', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{s.icon}</span> {data.label}
      </div>
      {data.detail && (
        <div style={{ color: '#8b949e', fontFamily: 'monospace', fontSize: 10, marginTop: 4 }}>
          {data.detail}
        </div>
      )}
      {data.cve && (
        <div style={{ color: '#f85149', fontFamily: 'monospace', fontSize: 9, marginTop: 3, background: 'rgba(248,81,73,0.1)', padding: '2px 6px', borderRadius: 4 }}>
          CVE: {data.cve}
        </div>
      )}
      {data.tool && (
        <div style={{ color: '#bc8cff', fontFamily: 'monospace', fontSize: 9, marginTop: 2 }}>
          🔧 {data.tool}
        </div>
      )}
      {data.timestamp && (
        <div style={{ color: '#6e7681', fontFamily: 'monospace', fontSize: 8, marginTop: 3 }}>
          {new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: s.border, width: 8, height: 8, border: 'none' }} />
      <Handle type="source" position={Position.Right}  style={{ background: s.border, width: 8, height: 8, border: 'none' }} />
    </div>
  )
}

const nodeTypes: NodeTypes = { custom: CustomNode }

// ── Default graph ────────────────────────────────────────
function getDefaultNodes(): Node[] {
  const now = new Date().toISOString()
  return [
    { id: '1', type: 'custom', position: { x: 250, y: 20  }, data: { label: '10.10.10.1', type: 'target',   detail: 'Initial target', timestamp: now } },
    { id: '2', type: 'custom', position: { x: 250, y: 140 }, data: { label: 'Web Shell',  type: 'foothold', detail: 'CVE-2021-44228', timestamp: now, cve: 'CVE-2021-44228' } },
    { id: '3', type: 'custom', position: { x: 100, y: 260 }, data: { label: 'www-data',   type: 'pivot',    detail: 'Low priv shell', timestamp: now } },
    { id: '4', type: 'custom', position: { x: 400, y: 260 }, data: { label: 'SUID bash',  type: 'privesc',  detail: 'sudo -l abuse', timestamp: now } },
    { id: '5', type: 'custom', position: { x: 250, y: 380 }, data: { label: 'root',       type: 'domain',   detail: 'Full compromise', timestamp: now } },
    { id: '6', type: 'custom', position: { x: 250, y: 480 }, data: { label: 'Flag',       type: 'flag',     detail: '/root/root.txt', timestamp: now } },
  ]
}

function getDefaultEdges(): Edge[] {
  return [
    { id: 'e1-2', source: '1', target: '2', label: 'exploit',    animated: true,  markerEnd: { type: MarkerType.ArrowClosed, color: '#f85149' }, style: { stroke: '#f85149' }, labelStyle: { fill: '#8b949e', fontSize: 10 } },
    { id: 'e2-3', source: '2', target: '3', label: 'RCE',        animated: true,  markerEnd: { type: MarkerType.ArrowClosed, color: '#bc8cff' }, style: { stroke: '#bc8cff' }, labelStyle: { fill: '#8b949e', fontSize: 10 } },
    { id: 'e2-4', source: '2', target: '4', label: 'enum',       animated: false, markerEnd: { type: MarkerType.ArrowClosed, color: '#d29922'  }, style: { stroke: '#d29922'  }, labelStyle: { fill: '#8b949e', fontSize: 10 } },
    { id: 'e3-5', source: '3', target: '5', label: 'privesc',    animated: true,  markerEnd: { type: MarkerType.ArrowClosed, color: '#39d353'  }, style: { stroke: '#39d353'  }, labelStyle: { fill: '#8b949e', fontSize: 10 } },
    { id: 'e4-5', source: '4', target: '5', label: 'SUID',       animated: true,  markerEnd: { type: MarkerType.ArrowClosed, color: '#39d353'  }, style: { stroke: '#39d353'  }, labelStyle: { fill: '#8b949e', fontSize: 10 } },
    { id: 'e5-6', source: '5', target: '6', label: 'loot',       animated: true,  markerEnd: { type: MarkerType.ArrowClosed, color: '#39c5cf'  }, style: { stroke: '#39c5cf'  }, labelStyle: { fill: '#8b949e', fontSize: 10 } },
  ]
}

const NODE_TYPES_LIST = ['target','foothold','pivot','privesc','domain','flag'] as const

function FlowCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(getDefaultNodes())
  const [edges, setEdges, onEdgesChange] = useEdgesState(getDefaultEdges())
  const [selected, setSelected]  = useState<Node | null>(null)
  const [showPanel, setShowPanel] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState('')
  const [newNode, setNewNode]     = useState({ label: '', type: 'foothold' as typeof NODE_TYPES_LIST[number], detail: '', cve: '', tool: '' })
  const [showMiniMap] = useState(true)
  const [showControls] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [activeTab, setActiveTab] = useState<'builder' | 'history' | 'stats'>('builder')
  const [savedPaths, setSavedPaths] = useState<SavedPath[]>(() => {
    try {
      const saved = localStorage.getItem('attack_paths')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [pathName, setPathName] = useState('')
  const [notes, setNotes] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [filterType, setFilterType] = useState('All')
  const [sortBy, setSortBy] = useState<'date' | 'nodes' | 'name'>('date')
  const [searchTerm, setSearchTerm] = useState('')
  const [showEdgeLabels] = useState(true)
  const [_saveError, _setSaveError] = useState<string | null>(null)
  const [quotaError, setQuotaError] = useState<string | null>(null)

  const flowRef = useRef<HTMLDivElement>(null)
  const reactFlowInstance = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastAIClickRef = useRef<number>(0)
  const activeModel = useActiveModel()

  // ─── PERSIST WITH QUOTA ERROR HANDLING ───
  useEffect(() => {
    try {
      localStorage.setItem('attack_paths', JSON.stringify(savedPaths))
      setQuotaError(null)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        setQuotaError('Storage quota exceeded. Saved paths may not persist on reload.')
        console.error('Attack paths: localStorage quota exceeded')
      } else {
        console.error('Failed to save attack paths:', err)
      }
    }
  }, [savedPaths])

  // ─── MEMOIZED STATS ───
  const stats = useMemo(() => {
    const total = savedPaths.length
    const favorited = savedPaths.filter(p => p.favorite).length
    const totalNodes = savedPaths.reduce((sum, p) => sum + p.nodes.length, 0)
    const totalEdges = savedPaths.reduce((sum, p) => sum + p.edges.length, 0)
    const byType = {
      target: 0, foothold: 0, pivot: 0, privesc: 0, domain: 0, flag: 0,
    }
    for (const p of savedPaths) {
      for (const n of p.nodes) {
        const t = (n.data as NodeData).type
        if (t in byType) {
          byType[t as keyof typeof byType]++
        }
      }
    }
    return { total, favorited, totalNodes, totalEdges, byType }
  }, [savedPaths])

  // ─── ON CONNECT ───
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds: Edge[]) => addEdge({
      ...params,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#f472b6' },
      style: { stroke: '#f472b6' },
      label: 'connection',
      labelStyle: { fill: '#8b949e', fontSize: 10 }
    }, eds)),
    [setEdges]
  )

  // ─── ADD NODE ───
  const addNode = () => {
    if (!newNode.label.trim()) return
    const n: Node = {
      id: crypto.randomUUID(),
      type: 'custom',
      position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 },
      data: {
        label: newNode.label,
        type: newNode.type,
        detail: newNode.detail || undefined,
        timestamp: new Date().toISOString(),
        cve: newNode.cve || undefined,
        tool: newNode.tool || undefined
      },
    }
    setNodes((prev: Node[]) => [...prev, n])
    setNewNode({ label: '', type: 'foothold', detail: '', cve: '', tool: '' })
    setShowPanel(false)
  }

  // ─── DELETE SELECTED ───
  const deleteSelected = () => {
    if (!selected) return
    setNodes((prev: Node[]) => prev.filter(n => n.id !== selected.id))
    setEdges((prev: Edge[]) => prev.filter(e => e.source !== selected.id && e.target !== selected.id))
    setSelected(null)
  }

  // ─── SAVE PATH ───
  const savePath = () => {
    const name = pathName.trim() || `Attack Path ${savedPaths.length + 1}`
    const newPath: SavedPath = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      name: name,
      notes: notes || undefined,
      favorite: false,
      tags: []
    }
    setSavedPaths(prev => [newPath, ...prev])
    setPathName('')
    setEditingNote(false)
  }

  // ─── LOAD PATH ───
  const loadPath = (path: SavedPath) => {
    setNodes(JSON.parse(JSON.stringify(path.nodes)))
    setEdges(JSON.parse(JSON.stringify(path.edges)))
    setNotes(path.notes || '')
    setActiveTab('builder')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => reactFlowInstance.current?.fitView())
    })
  }

  const deletePath = (id: string) => {
    if (!confirm(`Delete "${savedPaths.find(p => p.id === id)?.name || 'path'}"?`)) return
    setSavedPaths(prev => prev.filter(p => p.id !== id))
  }

  const toggleFavorite = (id: string) => {
    setSavedPaths(prev => prev.map(p => 
      p.id === id ? { ...p, favorite: !p.favorite } : p
    ))
  }

  const exportPaths = () => {
    const data = JSON.stringify(savedPaths)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attack_paths_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importPaths = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (Array.isArray(data)) {
          const incomingIds = new Set(data.map(p => p.id).filter(id => typeof id === 'string'))
          setSavedPaths(prev => {
            const filtered = prev.filter(p => !incomingIds.has(p.id))
            return [...data, ...filtered]
          })
        }
      } catch (error) {
        console.error('Import error:', error)
        alert('Invalid file format. Please check the file.')
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const clearAllPaths = () => {
    if (!confirm(`Delete all ${savedPaths.length} saved attack paths? This cannot be undone.`)) return
    setSavedPaths([])
  }

  // ─── AI SUGGESTION ───
  const getAISuggestion = async () => {
    const now = Date.now()
    if (now - lastAIClickRef.current < 30_000) {
      setAiSuggestion('⏳ AI review is on cooldown. Wait 30s between requests.')
      return
    }
    lastAIClickRef.current = now
    setAiLoading(true)
    setAiSuggestion('')

    const nodeList = nodes
      .map((n: Node) => `${(n.data as NodeData).type}: ${(n.data as NodeData).label}${(n.data as NodeData).detail ? ` (${(n.data as NodeData).detail})` : ''}`)
      .slice(0, 15)
      .join('\n')

    const edgeList = edges
      .map((e: Edge) => {
        const src = nodes.find((n: Node) => n.id === e.source)
        const tgt = nodes.find((n: Node) => n.id === e.target)
        return `${(src?.data as NodeData)?.label} → ${(tgt?.data as NodeData)?.label}${e.label ? ` [${e.label}]` : ''}`
      })
      .slice(0, 20)
      .join('\n')

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const { status, data } = await window.obscurum?.ollamaRequest?.('/api/generate', 'POST', {
        model: activeModel,
        prompt: `Review this attack path and provide 2-3 specific suggestions for next steps, missing nodes, alternative paths, or improvements:\n\nNodes:\n${nodeList || 'None'}\n\nConnections:\n${edgeList || 'None'}\n\nWhat critical elements are missing? What would make this attack path more complete?`,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          repeat_penalty: 1.2
        }
      }) ?? { status: 200, data: null }

      clearTimeout(timeoutId)

      if (status === 404) {
        throw new Error(`Model "${activeModel}" not found. Ensure it is installed via Ollama.`)
      }
      if (status >= 400) {
        throw new Error(`API error: ${status}`)
      }

      const content = (data as { response?: string } | null)?.response || 'No specific suggestions.'

      if (!content || content.trim().length < 10) {
        setAiSuggestion('AI review complete: No critical issues identified in your attack path.')
      } else {
        setAiSuggestion(content)
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setAiSuggestion('Request timed out. Try simplifying your attack path or check if Ollama is responding.')
      } else if (err.message.includes('Failed to fetch')) {
        setAiSuggestion('Cannot connect to Ollama service. Ensure it is running: ollama serve')
      } else {
        setAiSuggestion(`Error: ${err.message || 'Failed to get AI suggestion. Check your Ollama setup.'}`)
      }
    } finally {
      setAiLoading(false)
    }
  }

  // ─── REACT FLOW HANDLERS ───
  const onInit = (rf: any) => {
    reactFlowInstance.current = rf
    setZoom(rf.getZoom())
  }

  const zoomIn = () => reactFlowInstance.current?.zoomIn()
  const zoomOut = () => reactFlowInstance.current?.zoomOut()
  const fitView = () => reactFlowInstance.current?.fitView()

  // ─── FILTERED PATHS ───
  const filteredPaths = useMemo(() => {
    return savedPaths
      .filter(p => {
        if (filterType !== 'All' && !p.nodes.some(n => (n.data as NodeData).type === filterType)) {
          return false
        }
        if (searchTerm) {
          const search = searchTerm.toLowerCase()
          if (!(
            p.name.toLowerCase().includes(search) ||
            p.nodes.some(n => (n.data as NodeData).label.toLowerCase().includes(search)) ||
            (p.notes && p.notes.toLowerCase().includes(search))
          )) {
            return false
          }
        }
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'date') return b.timestamp - a.timestamp
        if (sortBy === 'nodes') return b.nodes.length - a.nodes.length
        if (sortBy === 'name') return a.name.localeCompare(b.name)
        return 0
      })
  }, [savedPaths, filterType, searchTerm, sortBy])

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
              <GitBranch size={18} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">LABYRINTH</h1>
              <p className="text-white/40 text-xs">Attack path mapping — visualize, analyze, and refine</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-white/30">
              <Shield size={14} className="text-amber-400" />
              <span>v1.0</span>
            </div>
          </div>
        </div>

        {/* ── Quota error banner ── */}
        {quotaError && (
          <div className="mb-4 p-3 rounded-xl border border-red-500/30 flex items-center gap-2 text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.06)' }}>
            <AlertTriangle size={14} /> {quotaError}
            <button 
              onClick={() => setQuotaError(null)} 
              className="ml-auto text-red-400/60 hover:text-red-400 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Action Bar ── */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={() => setShowPanel(p => !p)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-xl hover:bg-amber-500/30 transition-colors font-mono"
          >
            <Plus size={14} /> Add Node
          </button>

          <button
            onClick={getAISuggestion}
            disabled={aiLoading}
            className="flex items-center gap-1.5 text-xs px-3 py-2 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-xl hover:bg-purple-500/30 disabled:opacity-40 transition-colors font-mono"
          >
            <Cpu size={14} />{aiLoading ? 'Thinking...' : 'AI Review'}
          </button>

          {selected && (
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1.5 text-xs px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/20 transition-colors font-mono"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}

          <button
            onClick={savePath}
            className="flex items-center gap-1.5 text-xs px-3 py-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition-colors font-mono"
          >
            <Save size={14} /> Save Path
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 border rounded-xl transition-colors font-mono ${
              activeTab === 'history' 
                ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' 
                : 'text-white/40 hover:text-yellow-400 border-white/10 hover:border-yellow-500/30'
            }`}
          >
            <History size={14} />
            {savedPaths.length > 0 && `(${savedPaths.length})`}
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-4 border-b border-white/10 pb-1 flex-wrap">
          {(['builder', 'history', 'stats'] as const).map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-xs font-mono rounded-lg transition-colors ${
                activeTab === tab 
                  ? 'bg-white/10 text-white border border-white/10' 
                  : 'text-white/40 hover:text-white/70'
              }`}
            >
              {tab === 'builder' && '🔧 Builder'}
              {tab === 'history' && `📋 History${savedPaths.length > 0 ? ` (${savedPaths.length})` : ''}`}
              {tab === 'stats' && '📊 Stats'}
            </button>
          ))}
        </div>

        {/* ── Builder Tab ── */}
        {activeTab === 'builder' && (
          <>
            {/* Add node panel */}
            {showPanel && (
              <div className="mb-4 p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="text-white text-xs font-mono font-bold mb-2">Add New Node</div>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={newNode.label}
                    onChange={e => setNewNode(p => ({ ...p, label: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addNode()}
                    placeholder="Label (e.g. 10.10.10.2)"
                    className="flex-1 min-w-[120px] bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30 placeholder-white/30"
                  />
                  <select
                    value={newNode.type}
                    onChange={e => setNewNode(p => ({ ...p, type: e.target.value as typeof NODE_TYPES_LIST[number] }))}
                    className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30"
                  >
                    {NODE_TYPES_LIST.map(t => <option key={t} style={{ background: '#0d1022' }}>{t}</option>)}
                  </select>
                  <input
                    value={newNode.detail}
                    onChange={e => setNewNode(p => ({ ...p, detail: e.target.value }))}
                    placeholder="Detail (optional)"
                    className="flex-1 min-w-[120px] bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30 placeholder-white/30"
                  />
                  <input
                    value={newNode.cve}
                    onChange={e => setNewNode(p => ({ ...p, cve: e.target.value }))}
                    placeholder="CVE (optional)"
                    className="w-[120px] bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30 placeholder-white/30"
                  />
                  <input
                    value={newNode.tool}
                    onChange={e => setNewNode(p => ({ ...p, tool: e.target.value }))}
                    placeholder="Tool (optional)"
                    className="w-[120px] bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30 placeholder-white/30"
                  />
                  <button
                    onClick={addNode}
                    className="px-4 py-2 bg-amber-500 text-black text-xs font-mono font-bold rounded-xl hover:bg-amber-400 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Path Name & Notes */}
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={pathName}
                onChange={e => setPathName(e.target.value)}
                placeholder="Path name (optional)"
                className="flex-1 min-w-[150px] bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30 placeholder-white/30"
              />
              <button
                onClick={() => setEditingNote(!editingNote)}
                className="text-xs px-3 py-2 text-white/40 hover:text-white/70 border border-white/10 rounded-xl font-mono transition-colors"
              >
                {editingNote ? 'Hide Notes' : 'Add Notes'}
              </button>
            </div>

            {editingNote && (
              <div className="mb-3 p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add notes about this attack path..."
                  rows={2}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 font-mono focus:outline-none focus:border-amber-500/30 placeholder-white/30"
                />
              </div>
            )}

            {/* AI suggestion */}
            {aiSuggestion && (
              <div className="mb-3 p-4 rounded-xl border border-purple-500/20" style={{ background: 'rgba(139,92,246,0.06)' }}>
                <div className="flex justify-between items-start">
                  <div className="text-purple-400 text-xs font-mono font-bold mb-1">🤖 AI Attack Path Review</div>
                  <button
                    onClick={() => setAiSuggestion('')}
                    className="text-white/30 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className="text-white/60 text-sm leading-relaxed">{aiSuggestion}</p>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 mb-3">
              {Object.entries(NODE_STYLES).map(([type, s]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded" style={{ background: s.bg, border: `1.5px solid ${s.border}` }} />
                  <span className="text-xs font-mono" style={{ color: s.text }}>{s.icon} {type}</span>
                </div>
              ))}
              <span className="text-white/30 text-xs ml-2 hidden sm:inline">· Drag handles to connect · Click node to select · Delete to remove</span>
            </div>

            {/* Flow canvas */}
            <div
              ref={flowRef}
              className="rounded-2xl overflow-hidden border border-white/10 relative"
              style={{ height: 500, minHeight: 500, background: '#0d1117' }}
            >
              <ReactFlow
                nodes={nodes}
                edges={showEdgeLabels ? edges : edges.map(e => ({ ...e, label: undefined }))}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                onNodeClick={(_event, node: Node) => setSelected(node)}
                onPaneClick={() => setSelected(null)}
                onInit={onInit}
                onMove={(_event, viewport: any) => setZoom(viewport.zoom)}
                fitView
                style={{ background: '#0d1117' }}
                defaultEdgeOptions={{
                  animated: true,
                  markerEnd: { type: MarkerType.ArrowClosed, color: '#f472b6' },
                  style: { stroke: '#f472b6' },
                }}
              >
                {showControls && (
                  <Controls
                    style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                    onZoomIn={zoomIn}
                    onZoomOut={zoomOut}
                    onFitView={fitView}
                  />
                )}

                {showMiniMap && (
                  <MiniMap
                    style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                    nodeColor={(n: Node) => NODE_STYLES[(n.data as NodeData).type]?.border ?? '#58a6ff'}
                    maskColor="rgba(0, 0, 0, 0.5)"
                    zoomable
                    pannable
                  />
                )}

                <Background variant={BackgroundVariant.Dots} color="rgba(255,255,255,0.05)" gap={20} />

                {selected && (
                  <Panel position="top-left">
                    <div className="rounded-xl border border-white/10 p-4 text-xs font-mono min-w-40 max-w-xs" style={{ background: 'rgba(13,17,23,0.9)', backdropFilter: 'blur(10px)' }}>
                      <div className="text-white/40 mb-1">Selected Node</div>
                      <div className="text-white font-bold">{(selected.data as NodeData).label}</div>
                      <div className="text-white/40">Type: {(selected.data as NodeData).type}</div>
                      {(selected.data as NodeData).detail && (
                        <div className="text-white/40 mt-1">Detail: {(selected.data as NodeData).detail}</div>
                      )}
                      {(selected.data as NodeData).cve && (
                        <div className="text-red-400 mt-1">CVE: {(selected.data as NodeData).cve}</div>
                      )}
                      {(selected.data as NodeData).tool && (
                        <div className="text-purple-400 mt-1">Tool: {(selected.data as NodeData).tool}</div>
                      )}
                      {(selected.data as NodeData).timestamp && (
                        <div className="text-white/30 text-xs mt-1">
                          {new Date((selected.data as NodeData).timestamp!).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </Panel>
                )}

                <Panel position="bottom-right" className="text-white/30 text-xs font-mono">
                  Zoom: {Math.round(zoom * 100)}% · Nodes: {nodes.length} · Edges: {edges.length}
                </Panel>
              </ReactFlow>
            </div>

            {/* Requirements info */}
            <div className="mt-3 text-white/30 text-xs">
              Uses your active Ollama model from Model Manager. Currently: <code className="bg-black/30 px-1.5 py-0.5 rounded text-amber-400">{activeModel}</code>
            </div>
          </>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-white/40 text-xs font-mono">
                {savedPaths.length} saved paths
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="relative">
                  <input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search paths..."
                    className="bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white/80 focus:outline-none placeholder-white/30 w-32 sm:w-48"
                  />
                </div>
                
                <select
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                  className="bg-black/30 border border-white/10 rounded-xl px-2 py-1.5 text-xs font-mono text-white/80 focus:outline-none"
                >
                  <option value="All" style={{ background: '#0d1022' }}>All Types</option>
                  {NODE_TYPES_LIST.map(t => <option key={t} style={{ background: '#0d1022' }}>{t}</option>)}
                </select>
                
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="bg-black/30 border border-white/10 rounded-xl px-2 py-1.5 text-xs font-mono text-white/80 focus:outline-none"
                >
                  <option value="date" style={{ background: '#0d1022' }}>Sort by Date</option>
                  <option value="nodes" style={{ background: '#0d1022' }}>Sort by Nodes</option>
                  <option value="name" style={{ background: '#0d1022' }}>Sort by Name</option>
                </select>
                
                <button 
                  onClick={exportPaths} 
                  disabled={savedPaths.length === 0}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-yellow-400 transition-colors px-2 py-1 border border-white/10 rounded-xl disabled:opacity-40"
                >
                  <Download size={12} /> Export
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-yellow-400 transition-colors px-2 py-1 border border-white/10 rounded-xl"
                >
                  <Upload size={12} /> Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={importPaths}
                  className="hidden"
                />
                <button 
                  onClick={clearAllPaths} 
                  disabled={savedPaths.length === 0}
                  className="flex items-center gap-1 text-xs text-red-400/50 hover:text-red-400 transition-colors px-2 py-1 border border-red-500/30 rounded-xl disabled:opacity-40"
                >
                  <Trash2 size={12} /> Clear All
                </button>
              </div>
            </div>

            {filteredPaths.length === 0 ? (
              <div className="rounded-2xl border border-white/10 p-12 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <GitBranch size={40} className="text-white/20 mx-auto mb-3" />
                <div className="text-white/40 text-sm font-mono">No saved paths</div>
                <div className="text-white/20 text-xs mt-1">Build an attack path and save it</div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPaths.map(p => {
                  const nodeCount = p.nodes.length
                  const edgeCount = p.edges.length
                  return (
                    <div key={p.id} className="rounded-xl border border-white/10 p-4 hover:border-yellow-500/30 transition-all" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => loadPath(p)}
                              className="text-yellow-400 hover:text-yellow-300 font-mono text-sm font-bold transition-colors"
                            >
                              {p.name}
                            </button>
                            <span className="text-white/40 text-xs">
                              {nodeCount} nodes · {edgeCount} edges
                            </span>
                            <span className="text-white/20 text-xs">•</span>
                            <span className="text-white/30 text-xs">
                              {new Date(p.timestamp).toLocaleString()}
                            </span>
                            {p.favorite && (
                              <Star size={12} className="text-yellow-400" />
                            )}
                          </div>
                          {p.notes && (
                            <div className="text-white/30 text-xs mt-1">{p.notes}</div>
                          )}
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {Object.entries(NODE_STYLES).slice(0, 6).map(([type, s]) => {
                              const count = p.nodes.filter(n => (n.data as NodeData).type === type).length
                              return count > 0 ? (
                                <span key={type} className="text-xs" style={{ color: s.text }}>
                                  {s.icon}{count}
                                </span>
                              ) : null
                            })}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => toggleFavorite(p.id)}
                            className="p-1 text-white/30 hover:text-yellow-400 transition-colors"
                            title="Toggle favorite"
                          >
                            <Star size={14} className={p.favorite ? 'text-yellow-400' : ''} />
                          </button>
                          <button
                            onClick={() => loadPath(p)}
                            className="p-1 text-white/30 hover:text-yellow-400 transition-colors"
                            title="Load path"
                          >
                            <Play size={14} />
                          </button>
                          <button
                            onClick={() => deletePath(p.id)}
                            className="p-1 text-white/30 hover:text-red-400 transition-colors"
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
        )}

        {/* ── Stats Tab ── */}
        {activeTab === 'stats' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/10 p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <div className="text-white/40 text-xs">Total Paths</div>
                <div className="text-white text-xl font-mono font-bold">{stats.total}</div>
              </div>
              <div className="rounded-xl border border-yellow-500/30 p-4 text-center" style={{ background: 'rgba(234,179,8,0.05)' }}>
                <div className="text-yellow-400 text-xs">Favorited</div>
                <div className="text-yellow-400 text-xl font-mono font-bold">{stats.favorited}</div>
              </div>
              <div className="rounded-xl border border-cyan-500/30 p-4 text-center" style={{ background: 'rgba(6,182,212,0.05)' }}>
                <div className="text-cyan-400 text-xs">Total Nodes</div>
                <div className="text-cyan-400 text-xl font-mono font-bold">{stats.totalNodes}</div>
              </div>
              <div className="rounded-xl border border-purple-500/30 p-4 text-center" style={{ background: 'rgba(139,92,246,0.05)' }}>
                <div className="text-purple-400 text-xs">Total Edges</div>
                <div className="text-purple-400 text-xl font-mono font-bold">{stats.totalEdges}</div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-white text-sm font-mono font-bold mb-3">Node Type Distribution</div>
              <div className="space-y-2">
                {Object.entries(stats.byType).map(([type, count]) => {
                  const s = NODE_STYLES[type as keyof typeof NODE_STYLES]
                  return (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-xs font-mono w-20" style={{ color: s?.text || '#8b949e' }}>
                        {s?.icon} {type}
                      </span>
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-300"
                          style={{ 
                            width: stats.totalNodes > 0 ? `${(count / stats.totalNodes) * 100}%` : '0%',
                            background: s?.border || '#58a6ff'
                          }}
                        />
                      </div>
                      <span className="text-white/40 text-xs font-mono w-12 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-white text-sm font-mono font-bold mb-2">Quick Stats</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                  <div className="text-white/40">Avg Nodes per Path</div>
                  <div className="text-white font-mono">
                    {stats.total > 0 ? Math.round(stats.totalNodes / stats.total) : 0}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-black/30 border border-white/10">
                  <div className="text-white/40">Avg Edges per Path</div>
                  <div className="text-white font-mono">
                    {stats.total > 0 ? Math.round(stats.totalEdges / stats.total) : 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function AttackPath() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  )
}