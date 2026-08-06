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
  Upload, History, Star, Play
} from 'lucide-react'
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

const NODE_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  target:   { bg: '#1c2128', border: '#58a6ff', text: '#58a6ff', icon: '🎯' },
  foothold: { bg: '#1c2128', border: '#f85149', text: '#f85149', icon: '💥' },
  pivot:    { bg: '#1c2128', border: '#bc8cff', text: '#bc8cff', icon: '🔀' },
  privesc:  { bg: '#1c2128', border: '#d29922', text: '#d29922', icon: '👑' },
  domain:   { bg: '#1c2128', border: '#39d353', text: '#39d353', icon: '🏰' },
  flag:     { bg: '#1c2128', border: '#39c5cf', text: '#39c5cf', icon: '🚩' },
}

function CustomNode({ data }: { data: NodeData }) {
  const s = NODE_STYLES[data.type] ?? NODE_STYLES.target
  return (
    <div style={{
      background: s.bg,
      border: `1.5px solid ${s.border}`,
      borderRadius: 8,
      padding: '8px 14px',
      minWidth: 140,
      boxShadow: `0 0 8px ${s.border}33`,
    }}>
      <Handle type="target" position={Position.Top}    style={{ background: s.border, width: 8, height: 8 }} />
      <Handle type="target" position={Position.Left}   style={{ background: s.border, width: 8, height: 8 }} />
      <div style={{ color: s.text, fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
        {s.icon} {data.label}
      </div>
      {data.detail && (
        <div style={{ color: '#8b949e', fontFamily: 'monospace', fontSize: 10, marginTop: 3 }}>
          {data.detail}
        </div>
      )}
      {data.cve && (
        <div style={{ color: '#f85149', fontFamily: 'monospace', fontSize: 9, marginTop: 2 }}>
          CVE: {data.cve}
        </div>
      )}
      {data.tool && (
        <div style={{ color: '#bc8cff', fontFamily: 'monospace', fontSize: 9, marginTop: 1 }}>
          Tool: {data.tool}
        </div>
      )}
      {data.timestamp && (
        <div style={{ color: '#6e7681', fontFamily: 'monospace', fontSize: 8, marginTop: 2 }}>
          {new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: s.border, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right}  style={{ background: s.border, width: 8, height: 8 }} />
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
      markerEnd: { type: MarkerType.ArrowClosed, color: '#58a6ff' },
      style: { stroke: '#58a6ff' },
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

  // ─── SAVE PATH (deep-clone on save) ───
  const savePath = () => {
    const name = pathName.trim() || `Attack Path ${savedPaths.length + 1}`
    const newPath: SavedPath = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      // Deep-clone so future mutations to the live graph don't corrupt saved snapshots
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

  // ─── LOAD PATH (deep-clone on load) ───
  const loadPath = (path: SavedPath) => {
    setNodes(JSON.parse(JSON.stringify(path.nodes)))
    setEdges(JSON.parse(JSON.stringify(path.edges)))
    setNotes(path.notes || '')
    setActiveTab('builder')
    // Wait for ReactFlow to render new nodes before fitting viewport
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
    // Minify JSON to reduce file size for export
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
          // Deduplicate by id: new imports override existing entries with same id
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
    // Cooldown: 30 seconds between requests
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
        // Type filter
        if (filterType !== 'All' && !p.nodes.some(n => (n.data as NodeData).type === filterType)) {
          return false
        }
        // Search filter (name, node labels, notes)
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
    <div className="flex flex-col h-full max-w-6xl mx-auto">

      {/* Quota error banner */}
      {quotaError && (
        <div className="mb-2 p-2 bg-terminal-red/10 border border-terminal-red/30 rounded-lg text-terminal-red text-xs flex items-center gap-2">
          ⚠️ {quotaError}
          <button 
            onClick={() => setQuotaError(null)} 
            className="ml-auto text-terminal-muted hover:text-terminal-text"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-terminal-red" />
          <span className="text-terminal-text font-mono text-sm font-bold">Labyrinth</span>
          <span className="text-terminal-muted text-xs hidden sm:inline">— drag to connect nodes</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => setShowPanel(p => !p)}
            className="flex items-center gap-1 text-xs px-2 py-1.5 bg-terminal-red/20 border border-terminal-red/30 text-terminal-red rounded hover:bg-terminal-red/30 transition-colors font-mono"
          >
            <Plus size={11} /> Add Node
          </button>

          <button
            onClick={getAISuggestion}
            disabled={aiLoading}
            className="flex items-center gap-1 text-xs px-2 py-1.5 bg-terminal-purple/20 border border-terminal-purple/30 text-terminal-purple rounded hover:bg-terminal-purple/30 disabled:opacity-40 transition-colors font-mono"
          >
            <Cpu size={11} />{aiLoading ? 'Thinking...' : 'AI Review'}
          </button>

          {selected && (
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1 text-xs px-2 py-1.5 bg-terminal-red/10 border border-terminal-red/30 text-terminal-red rounded hover:bg-terminal-red/20 transition-colors font-mono"
            >
              <Trash2 size={11} /> Delete
            </button>
          )}

          <button
            onClick={savePath}
            className="flex items-center gap-1 text-xs px-2 py-1.5 bg-terminal-green/20 border border-terminal-green/30 text-terminal-green rounded hover:bg-terminal-green/30 transition-colors font-mono"
          >
            <Save size={11} /> Save Path
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1 text-xs px-2 py-1.5 border rounded transition-colors font-mono ${
              activeTab === 'history' 
                ? 'bg-terminal-yellow/20 border-terminal-yellow/30 text-terminal-yellow' 
                : 'text-terminal-muted hover:text-terminal-yellow border-terminal-border'
            }`}
          >
            <History size={11} />
            {savedPaths.length > 0 && `(${savedPaths.length})`}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 border-b border-terminal-border flex-wrap">
        {(['builder', 'history', 'stats'] as const).map(tab => (
          <button 
            key={tab} 
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs font-mono rounded-t transition-colors ${
              activeTab === tab 
                ? 'bg-terminal-surface text-terminal-text border border-terminal-border border-b-transparent' 
                : 'text-terminal-muted hover:text-terminal-text'
            }`}
          >
            {tab === 'builder' && '🔧 Builder'}
            {tab === 'history' && `📋 History${savedPaths.length > 0 ? ` (${savedPaths.length})` : ''}`}
            {tab === 'stats' && '📊 Stats'}
          </button>
        ))}
      </div>

      {/* Builder Tab */}
      {activeTab === 'builder' && (
        <>
          {/* Add node panel */}
          {showPanel && (
            <div className="mb-3 p-3 bg-terminal-surface border border-terminal-border rounded-lg flex-shrink-0">
              <div className="text-terminal-text text-xs font-mono font-bold mb-2">Add New Node</div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={newNode.label}
                  onChange={e => setNewNode(p => ({ ...p, label: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && addNode()}
                  placeholder="Label (e.g. 10.10.10.2)"
                  className="flex-1 min-w-[120px] bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-terminal-text text-xs font-mono focus:outline-none focus:border-terminal-red placeholder-terminal-muted"
                />
                <select
                  value={newNode.type}
                  onChange={e => setNewNode(p => ({ ...p, type: e.target.value as typeof NODE_TYPES_LIST[number] }))}
                  className="bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-terminal-text text-xs font-mono focus:outline-none focus:border-terminal-red"
                >
                  {NODE_TYPES_LIST.map(t => <option key={t}>{t}</option>)}
                </select>
                <input
                  value={newNode.detail}
                  onChange={e => setNewNode(p => ({ ...p, detail: e.target.value }))}
                  placeholder="Detail (optional)"
                  className="flex-1 min-w-[120px] bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-terminal-text text-xs font-mono focus:outline-none focus:border-terminal-red placeholder-terminal-muted"
                />
                <input
                  value={newNode.cve}
                  onChange={e => setNewNode(p => ({ ...p, cve: e.target.value }))}
                  placeholder="CVE (optional)"
                  className="w-[120px] bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-terminal-text text-xs font-mono focus:outline-none focus:border-terminal-red placeholder-terminal-muted"
                />
                <input
                  value={newNode.tool}
                  onChange={e => setNewNode(p => ({ ...p, tool: e.target.value }))}
                  placeholder="Tool (optional)"
                  className="w-[120px] bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-terminal-text text-xs font-mono focus:outline-none focus:border-terminal-red placeholder-terminal-muted"
                />
                <button
                  onClick={addNode}
                  className="px-4 py-1.5 bg-terminal-red text-white text-xs font-mono rounded hover:opacity-90 transition-opacity"
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
              className="flex-1 min-w-[150px] bg-terminal-surface border border-terminal-border rounded px-3 py-1.5 text-terminal-text text-xs font-mono focus:outline-none focus:border-terminal-red placeholder-terminal-muted"
            />
            <button
              onClick={() => setEditingNote(!editingNote)}
              className="text-xs px-3 py-1.5 text-terminal-muted hover:text-terminal-text border border-terminal-border rounded font-mono"
            >
              {editingNote ? 'Hide Notes' : 'Add Notes'}
            </button>
          </div>

          {editingNote && (
            <div className="mb-3 p-3 bg-terminal-surface border border-terminal-border rounded-lg">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes about this attack path..."
                rows={2}
                className="w-full bg-terminal-bg border border-terminal-border rounded px-2 py-1 text-sm text-terminal-text font-mono focus:outline-none focus:border-terminal-red"
              />
            </div>
          )}

          {/* AI suggestion */}
          {aiSuggestion && (
            <div className="mb-3 p-3 bg-terminal-purple/5 border border-terminal-purple/20 rounded-lg flex-shrink-0">
              <div className="flex justify-between items-start">
                <div className="text-terminal-purple text-xs font-mono font-bold mb-1">🤖 AI Attack Path Review</div>
                <button
                  onClick={() => setAiSuggestion('')}
                  className="text-terminal-muted hover:text-terminal-red"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <p className="text-terminal-text text-sm leading-relaxed">{aiSuggestion}</p>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 mb-2 flex-shrink-0">
            {Object.entries(NODE_STYLES).map(([type, s]) => (
              <div key={type} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded" style={{ background: s.bg, border: `1.5px solid ${s.border}` }} />
                <span className="text-xs font-mono" style={{ color: s.text }}>{s.icon} {type}</span>
              </div>
            ))}
            <span className="text-terminal-muted text-xs ml-2 hidden sm:inline">· Drag handles to connect · Click node to select · Delete to remove</span>
          </div>

          {/* Flow canvas */}
          <div
            ref={flowRef}
            className="flex-1 rounded-lg overflow-hidden border border-terminal-border relative"
            style={{ minHeight: 500 }}
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
                markerEnd: { type: MarkerType.ArrowClosed, color: '#58a6ff' },
                style: { stroke: '#58a6ff' },
              }}
            >
              {showControls && (
                <Controls
                  style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onFitView={fitView}
                />
              )}

              {showMiniMap && (
                <MiniMap
                  style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8 }}
                  nodeColor={(n: Node) => NODE_STYLES[(n.data as NodeData).type]?.border ?? '#58a6ff'}
                  maskColor="rgba(0, 0, 0, 0.5)"
                  zoomable
                  pannable
                />
              )}

              <Background variant={BackgroundVariant.Dots} color="#30363d" gap={20} />

              {selected && (
                <Panel position="top-left">
                  <div className="bg-terminal-surface border border-terminal-border rounded-lg p-3 text-xs font-mono min-w-40 max-w-xs">
                    <div className="text-terminal-muted mb-1">Selected Node</div>
                    <div className="text-terminal-text font-bold">{(selected.data as NodeData).label}</div>
                    <div className="text-terminal-muted">Type: {(selected.data as NodeData).type}</div>
                    {(selected.data as NodeData).detail && (
                      <div className="text-terminal-muted mt-1">Detail: {(selected.data as NodeData).detail}</div>
                    )}
                    {(selected.data as NodeData).cve && (
                      <div className="text-terminal-red mt-1">CVE: {(selected.data as NodeData).cve}</div>
                    )}
                    {(selected.data as NodeData).tool && (
                      <div className="text-terminal-purple mt-1">Tool: {(selected.data as NodeData).tool}</div>
                    )}
                    {(selected.data as NodeData).timestamp && (
                      <div className="text-terminal-muted text-xs mt-1">
                        {new Date((selected.data as NodeData).timestamp!).toLocaleString()}
                      </div>
                    )}
                  </div>
                </Panel>
              )}

              <Panel position="bottom-right" className="text-terminal-muted text-xs font-mono">
                Zoom: {Math.round(zoom * 100)}% · Nodes: {nodes.length} · Edges: {edges.length}
              </Panel>
            </ReactFlow>
          </div>

          {/* Requirements info */}
          <div className="mt-3 text-terminal-muted text-xs">
            <p>Uses your active Ollama model from Model Manager. Currently: <code className="bg-terminal-bg px-1 rounded">{activeModel}</code></p>
          </div>
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-terminal-muted text-xs font-mono">
              {savedPaths.length} saved paths
            </div>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search paths..."
                  className="bg-terminal-surface border border-terminal-border rounded px-3 py-1.5 text-xs font-mono text-terminal-text focus:outline-none placeholder-terminal-muted w-32 sm:w-48"
                />
              </div>
              
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="bg-terminal-surface border border-terminal-border rounded px-2 py-1.5 text-xs font-mono text-terminal-text focus:outline-none"
              >
                <option value="All">All Types</option>
                {NODE_TYPES_LIST.map(t => <option key={t}>{t}</option>)}
              </select>
              
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="bg-terminal-surface border border-terminal-border rounded px-2 py-1.5 text-xs font-mono text-terminal-text focus:outline-none"
              >
                <option value="date">Sort by Date</option>
                <option value="nodes">Sort by Nodes</option>
                <option value="name">Sort by Name</option>
              </select>
              
              <button 
                onClick={exportPaths} 
                disabled={savedPaths.length === 0}
                className="flex items-center gap-1 text-xs text-terminal-muted hover:text-terminal-yellow transition-colors px-2 py-1 border border-terminal-border rounded disabled:opacity-40"
              >
                <Download size={12} /> Export
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="flex items-center gap-1 text-xs text-terminal-muted hover:text-terminal-yellow transition-colors px-2 py-1 border border-terminal-border rounded"
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
                className="flex items-center gap-1 text-xs text-terminal-red/60 hover:text-terminal-red transition-colors px-2 py-1 border border-terminal-red/30 rounded disabled:opacity-40"
              >
                <Trash2 size={12} /> Clear All
              </button>
            </div>
          </div>

          {filteredPaths.length === 0 ? (
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-8 text-center">
              <GitBranch size={32} className="text-terminal-muted mx-auto mb-2" />
              <div className="text-terminal-muted text-sm font-mono">No saved paths</div>
              <div className="text-terminal-muted-dimmer text-xs mt-1">Build an attack path and save it</div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPaths.map(p => {
                const nodeCount = p.nodes.length
                const edgeCount = p.edges.length
                return (
                  <div key={p.id} className="bg-terminal-surface border border-terminal-border rounded-lg p-3 hover:border-terminal-yellow/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => loadPath(p)}
                            className="text-terminal-yellow hover:text-terminal-accent-2 font-mono text-sm font-bold transition-colors"
                          >
                            {p.name}
                          </button>
                          <span className="text-terminal-muted text-xs">
                            {nodeCount} nodes · {edgeCount} edges
                          </span>
                          <span className="text-terminal-muted text-xs">•</span>
                          <span className="text-terminal-muted text-xs">
                            {new Date(p.timestamp).toLocaleString()}
                          </span>
                          {p.favorite && (
                            <Star size={12} className="text-yellow-400" />
                          )}
                        </div>
                        {p.notes && (
                          <div className="text-terminal-muted text-xs mt-1">{p.notes}</div>
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
                          className="p-1 text-terminal-muted hover:text-yellow-400 transition-colors"
                          title="Toggle favorite"
                        >
                          <Star size={14} className={p.favorite ? 'text-yellow-400' : ''} />
                        </button>
                        <button
                          onClick={() => loadPath(p)}
                          className="p-1 text-terminal-muted hover:text-terminal-yellow transition-colors"
                          title="Load path"
                        >
                          <Play size={14} />
                        </button>
                        <button
                          onClick={() => deletePath(p.id)}
                          className="p-1 text-terminal-muted hover:text-terminal-red transition-colors"
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

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-terminal-surface border border-terminal-border rounded-lg p-3 text-center">
              <div className="text-terminal-muted text-xs">Total Paths</div>
              <div className="text-terminal-text text-xl font-mono font-bold">{stats.total}</div>
            </div>
            <div className="bg-terminal-surface border border-yellow-400/30 rounded-lg p-3 text-center">
              <div className="text-yellow-400 text-xs">Favorited</div>
              <div className="text-yellow-400 text-xl font-mono font-bold">{stats.favorited}</div>
            </div>
            <div className="bg-terminal-surface border border-terminal-accent-2/30 rounded-lg p-3 text-center">
              <div className="text-terminal-accent-2 text-xs">Total Nodes</div>
              <div className="text-terminal-accent-2 text-xl font-mono font-bold">{stats.totalNodes}</div>
            </div>
            <div className="bg-terminal-surface border border-terminal-purple/30 rounded-lg p-3 text-center">
              <div className="text-terminal-purple text-xs">Total Edges</div>
              <div className="text-terminal-purple text-xl font-mono font-bold">{stats.totalEdges}</div>
            </div>
          </div>

          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
            <div className="text-terminal-text text-sm font-mono font-bold mb-3">Node Type Distribution</div>
            <div className="space-y-2">
              {Object.entries(stats.byType).map(([type, count]) => {
                const s = NODE_STYLES[type as keyof typeof NODE_STYLES]
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-xs font-mono w-20" style={{ color: s?.text || '#8b949e' }}>
                      {s?.icon} {type}
                    </span>
                    <div className="flex-1 h-2 bg-terminal-border rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-300"
                        style={{ 
                          width: stats.totalNodes > 0 ? `${(count / stats.totalNodes) * 100}%` : '0%',
                          background: s?.border || '#58a6ff'
                        }}
                      />
                    </div>
                    <span className="text-terminal-muted text-xs font-mono w-12 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
            <div className="text-terminal-text text-sm font-mono font-bold mb-2">Quick Stats</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 bg-terminal-bg border border-terminal-border rounded">
                <div className="text-terminal-muted">Avg Nodes per Path</div>
                <div className="text-terminal-text font-mono">
                  {stats.total > 0 ? Math.round(stats.totalNodes / stats.total) : 0}
                </div>
              </div>
              <div className="p-2 bg-terminal-bg border border-terminal-border rounded">
                <div className="text-terminal-muted">Avg Edges per Path</div>
                <div className="text-terminal-text font-mono">
                  {stats.total > 0 ? Math.round(stats.totalEdges / stats.total) : 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
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