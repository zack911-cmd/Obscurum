// src/components/coach/WiresharkCoach.tsx
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  BookOpen, Filter, Play, Target, Copy, Lightbulb, Check,
  Shield, Zap, AlertTriangle,
  Command,
  Server, Globe, Lock, Eye,
  Database, Network, GraduationCap, ListChecks, RotateCcw, Menu, Search
} from 'lucide-react'

type Tab = 'overview' | 'basics' | 'filters' | 'practical' | 'defense' | 'labs' | 'builder' | 'checklist' | 'tshark'

const STORAGE_CHECKLIST = 'argus_lab_checklist_v1'

// ─── STATIC DATA ───

const tabs: ReadonlyArray<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'basics', label: 'Wireshark Basics', icon: Target },
  { id: 'filters', label: 'Essential Filters', icon: Filter },
  { id: 'practical', label: 'Practical Scenarios', icon: Play },
  { id: 'tshark', label: 'tshark CLI', icon: Command },
  { id: 'defense', label: 'Detection & Defense', icon: AlertTriangle },
  { id: 'labs', label: 'Labs & Challenges', icon: GraduationCap },
  { id: 'builder', label: 'Filter Builder', icon: Lightbulb },
  { id: 'checklist', label: 'Lab Checklist', icon: ListChecks },
]

// Common useful filters
const commonFilters = {
  http: [
    { name: 'HTTP Traffic', filter: 'http' },
    { name: 'HTTP Requests Only', filter: 'http.request' },
    { name: 'HTTP Responses', filter: 'http.response' },
    { name: 'Specific Host', filter: 'http.host contains "example.com"' },
    { name: 'POST Requests', filter: 'http.request.method == "POST"' },
    { name: 'Containing Password', filter: 'http contains "password"' },
    { name: 'Containing User-Agent', filter: 'http.user_agent contains "curl"' },
  ],
  dns: [
    { name: 'DNS Queries', filter: 'dns' },
    { name: 'DNS Responses', filter: 'dns.flags.response == 1' },
    { name: 'Specific Domain', filter: 'dns.qry.name contains "target.com"' },
    { name: 'DNS TXT Records', filter: 'dns.resp.type == 16' },
  ],
  tcp: [
    { name: 'TCP Traffic', filter: 'tcp' },
    { name: 'TCP SYN Packets', filter: 'tcp.flags.syn == 1' },
    { name: 'TCP Conversations', filter: 'tcp.stream eq 0' },
    { name: 'Specific Port', filter: 'tcp.port == 443' },
    { name: 'TCP RST Packets', filter: 'tcp.flags.reset == 1' },
  ],
  smb: [
    { name: 'SMB Traffic', filter: 'smb' },
    { name: 'SMB2', filter: 'smb2' },
    { name: 'File Create (Open)', filter: 'smb2.cmd == 5' },
    { name: 'SMB Tree Connect', filter: 'smb2.cmd == 3' },
  ],
  credentials: [
    { name: 'NTLM Auth', filter: 'ntlmssp' },
    { name: 'Kerberos', filter: 'kerberos' },
    { name: 'Basic Auth', filter: 'http.authorization contains "Basic"' },
    { name: 'Potential Credentials', filter: 'http contains "pass" or http contains "pwd"' },
    { name: 'FTP Passwords', filter: 'ftp.request.command == "PASS"' },
  ],
  icmp: [
    { name: 'ICMP', filter: 'icmp' },
    { name: 'ICMP Echo Request', filter: 'icmp.type == 8' },
    { name: 'ICMP Echo Reply', filter: 'icmp.type == 0' },
  ],
  tls: [
    { name: 'TLS / SSL', filter: 'tls' },
    { name: 'TLS Handshake', filter: 'tls.handshake' },
    { name: 'Client Hello SNI', filter: 'tls.handshake.extensions_server_name' },
    { name: 'Certificate', filter: 'tls.handshake.type == 11' },
  ],
  arp: [
    { name: 'ARP', filter: 'arp' },
    { name: 'ARP Request', filter: 'arp.opcode == 1' },
    { name: 'ARP Reply', filter: 'arp.opcode == 2' },
    { name: 'Possible ARP spoofing noise', filter: 'arp.duplicate-address-detected or arp.duplicate-address-frame' },
  ],
} as const

type FilterCategory = keyof typeof commonFilters

// ─── FILTER OPERATORS TIP ───

const FILTER_OPERATORS_TIP = (
  <div className="rounded-xl p-4 flex gap-3 border border-cyan-500/20" style={{ background: 'rgba(6,182,212,0.06)' }}>
    <AlertTriangle className="text-cyan-400 flex-shrink-0 mt-0.5" size={18} />
    <div className="text-sm text-white/50">
      <strong className="text-white/70">Tip:</strong> Use <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">and</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">or</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">not</code> to combine filters. Example: <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">http and not (http contains "robots.txt")</code>
    </div>
  </div>
)

const checklistItems = [
  { id: 'own-pcap', label: 'Capture your own lab traffic', detail: 'HTTP browse + FTP or SMB on an isolated VM' },
  { id: 'display-filter', label: 'Isolate one conversation with a display filter', detail: 'No Ctrl+F — filter bar only' },
  { id: 'follow-stream', label: 'Follow → TCP Stream on a login', detail: 'See the exchange in context' },
  { id: 'export-object', label: 'Export an HTTP object from a pcap', detail: 'GUI path first' },
  { id: 'tshark-once', label: 'Replicate one filter with tshark -Y', detail: 'CLI without opening the GUI' },
  { id: 'stats', label: 'Use Statistics → Conversations once', detail: 'Find the talkative pair' },
]

const tsharkExamples = [
  { id: 'ts1', title: 'Read pcap with display filter', cmd: 'tshark -r capture.pcap -Y "http.request"' },
  { id: 'ts2', title: 'Extract fields', cmd: 'tshark -r capture.pcap -Y "http" -T fields -e ip.src -e http.host -e http.request.uri' },
  { id: 'ts3', title: 'Live capture to file', cmd: 'tshark -i eth0 -w lab.pcap -f "tcp port 80"' },
  { id: 'ts4', title: 'DNS query names', cmd: 'tshark -r capture.pcap -Y "dns.flags.response == 0" -T fields -e dns.qry.name' },
  { id: 'ts5', title: 'Follow TCP stream index 0', cmd: 'tshark -r capture.pcap -q -z follow,tcp,ascii,0' },
  { id: 'ts6', title: 'Export HTTP objects (via GUI note)', cmd: '# Prefer Wireshark GUI: File → Export Objects → HTTP' },
]

// ─── COMPONENT ───

export default function WiresharkCoach() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_CHECKLIST) || '{}') } catch { return {} }
  })

  // Interactive filter builder state
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('http')
  const [filterInput, setFilterInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─────────────────────────────────────────────────────────────────────────────
  // Clipboard copy with fallback for HTTP/non-secure contexts
  // ─────────────────────────────────────────────────────────────────────────────

  const copyViaExecCommand = useCallback((text: string): boolean => {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }, [])

  const copyToClipboard = useCallback((id: string, text: string) => {
    const showSuccess = () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      setCopiedId(id)
      copyTimerRef.current = setTimeout(() => {
        setCopiedId(prev => (prev === id ? null : prev))
      }, 2000)
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        showSuccess,
        () => {
          if (copyViaExecCommand(text)) showSuccess()
        }
      )
    } else if (copyViaExecCommand(text)) {
      showSuccess()
    }
  }, [copyViaExecCommand])

  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }, [])
  useEffect(() => {
    try { localStorage.setItem(STORAGE_CHECKLIST, JSON.stringify(checklist)) } catch {}
  }, [checklist])
  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

  const checklistDone = checklistItems.filter(i => checklist[i.id]).length

  // ─────────────────────────────────────────────────────────────────────────────
  // Filter builder handlers
  // ─────────────────────────────────────────────────────────────────────────────

  const handleCategoryChange = useCallback((next: FilterCategory) => {
    setFilterCategory(next)
    setFilterInput('')
  }, [])

  const handleFilterClick = useCallback((filter: string) => {
    setFilterInput(filter)
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // Keyboard navigation
  // ─────────────────────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent, tabId: Tab) => {
    const currentIndex = tabs.findIndex(t => t.id === tabId)
    let newIndex = currentIndex

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      newIndex = (currentIndex + 1) % tabs.length
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      newIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      newIndex = tabs.length - 1
    } else {
      return
    }

    setActiveTab(tabs[newIndex].id)

    const target = e.target as HTMLElement
    const inTablist = target.closest('[role="tablist"]')
    if (inTablist) {
      document.getElementById(`tab-${tabs[newIndex].id}`)?.focus()
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // Render active tab content
  // ─────────────────────────────────────────────────────────────────────────────

  const renderContent = useMemo(() => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPanel />
      case 'basics':
        return <BasicsPanel />
      case 'filters':
        return <FiltersPanel copiedId={copiedId} onCopy={copyToClipboard} />
      case 'practical':
        return <PracticalPanel copiedId={copiedId} onCopy={copyToClipboard} />
      case 'defense':
        return <DefensePanel />
      case 'labs':
        return <LabsPanel />
      case 'tshark':
        return <TsharkPanel copiedId={copiedId} onCopy={copyToClipboard} />
      case 'builder':
        return (
          <BuilderPanel
            filterCategory={filterCategory}
            filterInput={filterInput}
            copiedId={copiedId}
            onCategoryChange={handleCategoryChange}
            onFilterClick={handleFilterClick}
            onFilterInputChange={setFilterInput}
            onCopy={copyToClipboard}
          />
        )
      case 'checklist':
        return <ChecklistPanel checklist={checklist} setChecklist={setChecklist} />
      default:
        return null
    }
  }, [
    activeTab, filterCategory, filterInput, copiedId, checklist,
    copyToClipboard, handleCategoryChange, handleFilterClick
  ])

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      <div className="max-w-6xl mx-auto p-6">
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ 
              background: 'radial-gradient(circle, rgba(6,182,212,0.2), rgba(6,182,212,0.05))', 
              border: '1px solid rgba(6,182,212,0.15)' 
            }}>
              <BookOpen size={18} className="text-cyan-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">ARGUS</h1>
              <p className="text-white/40 text-xs">Network traffic analysis — see everything, understand everything</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/30">
              <Shield size={14} className="text-cyan-400" />
              <span>lab guide · {checklistDone}/{checklistItems.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(o => !o)}
              className="lg:hidden w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70"
              aria-label="Menu"
            >
              <Menu size={14} />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-500/25 p-3 flex gap-3 mb-4" style={{ background: 'rgba(6,182,212,0.06)' }}>
          <AlertTriangle className="text-cyan-400 mt-0.5 flex-shrink-0" size={16} />
          <div className="text-xs text-cyan-100/80">
            Practice on captures from your own lab VMs or public sample pcaps. Sniffing production traffic without authorization is off-limits.
          </div>
        </div>

        {sidebarOpen && (
          <div className="lg:hidden mb-4 rounded-xl border border-white/10 bg-black/40 p-2 space-y-1">
            {tabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setActiveTab(tab.id); setSidebarOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                    activeTab === tab.id ? 'bg-cyan-500 text-white' : 'text-white/50 hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} /> {tab.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Tabs ── */}
        <div
          className="hidden lg:flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6 overflow-x-auto"
          role="tablist"
        >
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => { setActiveTab(tab.id); setSidebarOpen(false) }}
                onKeyDown={(e) => handleKeyDown(e, tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-500 text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── Content ── */}
        <div
          className="rounded-2xl border border-white/10 p-6"
          style={{ background: 'rgba(255,255,255,0.03)' }}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          id={`panel-${activeTab}`}
        >
          {renderContent}
        </div>
      </div>
    </div>
  )
}

// ─── PANEL COMPONENTS ───

function OverviewPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-semibold text-lg mb-2 text-cyan-400">Why Wireshark for Pentesters?</h2>
        <p className="text-white/50 leading-relaxed">
          Wireshark is the gold standard for network protocol analysis. As a pentester, it helps you:
        </p>
        <ul className="mt-3 text-sm text-white/50 space-y-1 list-disc pl-5">
          <li>Discover hidden services and misconfigurations</li>
          <li>Capture and analyze credentials in transit</li>
          <li>Understand application behavior and data flows</li>
          <li>Debug network issues during assessments</li>
          <li>Extract files and sensitive information from captures</li>
        </ul>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-cyan-400 font-semibold mb-2 flex items-center gap-2">
            <Network size={16} /> Key Use Cases
          </h3>
          <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
            <li>Post-exploitation traffic analysis</li>
            <li>Credential sniffing (HTTP, FTP, Telnet)</li>
            <li>Protocol reverse engineering</li>
            <li>Detecting C2 beaconing</li>
          </ul>
        </div>
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-cyan-400 font-semibold mb-2 flex items-center gap-2">
            <Zap size={16} /> Why Not Just tcpdump?
          </h3>
          <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
            <li>Powerful GUI with deep protocol dissection</li>
            <li>Real-time display filters</li>
            <li>Flow analysis (Follow TCP Stream)</li>
            <li>Export objects (files, certificates)</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl p-4 flex gap-3 border border-cyan-500/20" style={{ background: 'rgba(6,182,212,0.06)' }}>
        <Lightbulb className="text-cyan-400 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-white/50">
          <strong className="text-white/70">Pro Tip:</strong> Use <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">tshark</code> (Wireshark CLI) for automated packet analysis in scripts.
        </div>
      </div>
    </div>
  )
}

function BasicsPanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-white font-semibold text-lg text-cyan-400">Wireshark Basics</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-cyan-400 font-semibold mb-2 flex items-center gap-2">
            <Eye size={16} /> Key Interface Areas
          </h3>
          <ul className="text-sm space-y-2 text-white/50">
            <li><strong className="text-white/70">Packet List</strong> — All captured packets</li>
            <li><strong className="text-white/70">Packet Details</strong> — Expandable protocol tree</li>
            <li><strong className="text-white/70">Packet Bytes</strong> — Raw hex + ASCII view</li>
            <li><strong className="text-white/70">Display Filter</strong> — Most important bar in Wireshark</li>
          </ul>
        </div>
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-cyan-400 font-semibold mb-2 flex items-center gap-2">
            <Play size={16} /> Essential First Steps
          </h3>
          <ol className="text-sm space-y-2 text-white/50 list-decimal pl-5">
            <li>Start capture on the correct interface</li>
            <li>Use a good capture filter if possible</li>
            <li>Apply display filters to focus</li>
            <li>Right-click → Follow → TCP Stream</li>
            <li>File → Export Objects → HTTP</li>
          </ol>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <h3 className="text-cyan-400 font-semibold mb-2 flex items-center gap-2">
          <Command size={16} /> Useful Shortcuts
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm text-white/50">
          <div><kbd className="px-2 py-1 bg-white/10 rounded text-xs text-white/40">Ctrl+E</kbd> Start/Stop capture</div>
          <div><kbd className="px-2 py-1 bg-white/10 rounded text-xs text-white/40">Ctrl+F</kbd> Find packet</div>
          <div><kbd className="px-2 py-1 bg-white/10 rounded text-xs text-white/40">Ctrl+Shift+Alt+T</kbd> Follow TCP Stream</div>
          <div><kbd className="px-2 py-1 bg-white/10 rounded text-xs text-white/40">Ctrl+R</kbd> Reload capture file</div>
        </div>
      </div>
    </div>
  )
}

function FiltersPanel({
  copiedId,
  onCopy
}: {
  copiedId: string | null
  onCopy: (id: string, text: string) => void
}) {
  const [q, setQ] = useState('')
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-white font-semibold text-lg text-cyan-400">Most Useful Display Filters</h2>
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filter list…"
            className="pl-8 pr-3 py-2 w-44 bg-black/30 border border-white/10 rounded-xl text-xs text-white/80 focus:outline-none focus:border-cyan-500/40"
          />
        </div>
      </div>

      {Object.entries(commonFilters).map(([category, filters]) => {
        const cat = category as FilterCategory
        const iconMap: Record<FilterCategory, React.ReactNode> = {
          http: <Globe size={14} />,
          dns: <Server size={14} />,
          tcp: <Network size={14} />,
          smb: <Database size={14} />,
          credentials: <Lock size={14} />,
          icmp: <Zap size={14} />,
          tls: <Lock size={14} />,
          arp: <Network size={14} />,
        }
        const shown = filters.filter(item => {
          const s = q.trim().toLowerCase()
          if (!s) return true
          return item.name.toLowerCase().includes(s) || item.filter.toLowerCase().includes(s)
        })
        if (shown.length === 0) return null

        return (
          <div key={category} className="mb-4">
            <h3 className="text-cyan-400 font-semibold mb-3 capitalize flex items-center gap-2">
              {iconMap[cat]}
              {category} Filters
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {shown.map((item, index) => {
                const key = `filter-${category}-${index}`
                const isCopied = copiedId === key
                return (
                  <div key={index} className="flex items-center justify-between p-3 rounded-xl border border-white/10 text-sm" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="min-w-0">
                      <div className="text-white font-medium truncate">{item.name}</div>
                      <div className="font-mono text-xs text-white/40 truncate" title={item.filter}>
                        {item.filter}
                      </div>
                    </div>
                    <button
                      onClick={() => onCopy(key, item.filter)}
                      className="text-xs px-2 py-1 hover:bg-white/10 rounded flex items-center gap-1 flex-shrink-0 ml-2 text-white/40 hover:text-white/70 transition-colors"
                      aria-label={isCopied ? 'Copied to clipboard' : 'Copy filter'}
                    >
                      {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      {isCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {FILTER_OPERATORS_TIP}
    </div>
  )
}

function PracticalPanel({
  copiedId,
  onCopy
}: {
  copiedId: string | null
  onCopy: (id: string, text: string) => void
}) {
  const scenarios = [
    {
      id: 'scenario1',
      title: 'Credential Harvesting',
      desc: 'Capture traffic during phishing or internal assessments to identify plaintext credentials.',
      filter: 'http contains "password" or ntlmssp or kerberos',
      note: 'Pro tip: Use frame contains "password" to search the entire packet, not just HTTP.'
    },
    {
      id: 'scenario2',
      title: 'SMB Enumeration Analysis',
      desc: 'Analyze SMB traffic for null sessions or file shares.',
      filter: 'smb2 or smb',
      note: 'Extra: smb2.cmd == 3 for tree connect requests.'
    },
    {
      id: 'scenario3',
      title: 'Following a Full TCP Conversation',
      desc: 'Right-click any packet → Follow → TCP Stream. Extremely useful for understanding application behavior.',
      filter: 'tcp.stream eq 0',
      note: 'Pro tip: Use tcp.stream eq 0 to filter a specific stream.'
    },
    {
      id: 'scenario4',
      title: 'Extracting Files from PCAP',
      desc: 'File → Export Objects → HTTP / SMB / TFTP',
      filter: 'http.file_data',
      note: 'CLI alternative: tshark -r capture.pcap -Y "http.file_data" -T fields -e http.file_data'
    },
    {
      id: 'scenario5',
      title: 'Detecting C2 Beaconing',
      desc: 'Look for periodic, short bursts of traffic to suspicious external IPs.',
      filter: 'tcp.flags.syn == 1 and tcp.flags.ack == 0 and not dns',
      note: 'SYN packets without ACK identify new connection attempts.'
    }
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-white font-semibold text-lg text-cyan-400">Practical Red Team Scenarios</h2>

      <div className="space-y-4">
        {scenarios.map((s) => {
          const isCopied = copiedId === s.id
          return (
            <div key={s.id} className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <h3 className="text-white font-semibold flex items-center gap-2">
                <span className="bg-cyan-500/20 px-2 py-0.5 rounded text-xs text-cyan-400">Scenario {s.id.replace('scenario', '')}</span>
                {s.title}
              </h3>
              <p className="text-sm text-white/50 mt-2">{s.desc}</p>
              <div className="flex items-center justify-between bg-black/60 rounded-lg p-2 font-mono text-xs mt-2">
                <span className="text-emerald-400 break-all">{s.filter}</span>
                <button
                  onClick={() => onCopy(s.id, s.filter)}
                  className="text-white/40 hover:text-white/70 flex items-center gap-1 flex-shrink-0 ml-2 transition-colors"
                  aria-label={isCopied ? 'Copied to clipboard' : 'Copy filter'}
                >
                  {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {isCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="text-xs text-white/30 mt-2">
                <span className="text-cyan-400">{s.note}</span>
              </div>
            </div>
          )
        })}
      </div>

      {FILTER_OPERATORS_TIP}
    </div>
  )
}

function DefensePanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-white font-semibold text-lg text-cyan-400">Detection & Defense</h2>
      <p className="text-sm text-white/50">
        Wireshark is unusual on this list: it's not just an offensive tool that gets detected — it's
        one of the primary tools defenders use to detect <em>you</em>. Understanding both directions matters.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <Eye size={16} className="text-cyan-400" /> How Sniffing Gets Noticed
          </h3>
          <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
            <li>On switched networks, plain sniffing only sees your own traffic — capturing others' traffic requires ARP spoofing, a SPAN/mirror port, or a compromised switch, and ARP spoofing itself is loudly detectable (duplicate/changing MAC-to-IP mappings).</li>
            <li>Putting a NIC into promiscuous mode is visible to host-based monitoring and some EDR agents.</li>
            <li>Running <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">dumpcap</code>/<code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">tshark</code> as an unexpected process on a server is itself an anomaly worth alerting on.</li>
            <li>Large capture files being written to disk (or exfiltrated) leave forensic evidence — file size and write patterns stand out.</li>
          </ul>
        </div>
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <Lock size={16} className="text-cyan-400" /> Defending Against Sniffing
          </h3>
          <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
            <li>Encrypt everything in transit — TLS for HTTP, SSH instead of Telnet, encrypted SMB — so a captured packet is useless without the key.</li>
            <li>Use dynamic ARP inspection / DHCP snooping on switches to block ARP spoofing.</li>
            <li>Monitor for NICs entering promiscuous mode and for unauthorized packet-capture tools running on endpoints.</li>
            <li>Segment networks so a single compromised host can't see traffic beyond its own segment.</li>
          </ul>
        </div>
        <div className="p-4 rounded-xl border border-white/10 md:col-span-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <Shield size={16} className="text-cyan-400" /> Wireshark as a Blue Team Tool
          </h3>
          <p className="text-sm text-white/50">
            This is the flip side that's easy to overlook when you're learning it from an offensive angle:
            defenders use Wireshark constantly to investigate incidents. Being able to read a pcap and spot
            C2 beaconing, DNS tunneling, unusual outbound connections, or a Responder-style poisoning attempt
            is exactly the same skill set as using Wireshark offensively — just pointed at your own network's
            traffic after something has gone wrong. If you can't recognize an attack pattern in a capture, you
            can't reliably use that pattern offensively and evade detection either. The skill is one skill,
            used from two directions.
          </p>
        </div>
      </div>
    </div>
  )
}

function LabsPanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-white font-semibold text-lg text-cyan-400">Labs & Challenges</h2>
      <p className="text-sm text-white/50">
        Work these with a real capture file, not by reading the filter syntax and moving on. If you don't
        have a lab set up, generate your own traffic (browse a test site over HTTP, run an FTP login, do an
        SMB share connection) and capture it yourself before analyzing.
      </p>

      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-white font-semibold flex items-center gap-2">
            <span className="bg-cyan-500/20 px-2 py-0.5 rounded text-xs text-cyan-400">Lab 1</span>
            Find the Credential in a Capture
          </div>
          <ol className="text-sm text-white/50 list-decimal list-inside space-y-1 mt-2">
            <li>Download a sample pcap with cleartext HTTP Basic Auth or FTP login (search "wireshark sample captures" for legitimate practice files, e.g. the Wireshark wiki's SampleCaptures page).</li>
            <li>Open it and, using only the display filter bar (no Ctrl+F text search), isolate the exact packet containing the credential.</li>
            <li>Use Follow → TCP Stream on that packet to see the full login exchange in context.</li>
          </ol>
          <p className="text-xs text-white/30 mt-2">
            <strong className="text-white/70">Check yourself:</strong> why won't this same technique work against a login form served over HTTPS, even if you can capture every packet?
          </p>
        </div>

        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-white font-semibold flex items-center gap-2">
            <span className="bg-cyan-500/20 px-2 py-0.5 rounded text-xs text-cyan-400">Lab 2</span>
            Spot the Beacon
          </div>
          <ol className="text-sm text-white/50 list-decimal list-inside space-y-1 mt-2">
            <li>Find or generate a capture containing periodic outbound connections (a cron job hitting an external IP every N seconds works fine as a stand-in for C2 beaconing).</li>
            <li>Use Statistics → Conversations to identify which host/IP pair has the most regular, evenly-spaced connections.</li>
            <li>Use Statistics → I/O Graph to visualize the timing pattern.</li>
          </ol>
          <p className="text-xs text-white/30 mt-2">
            <strong className="text-white/70">Check yourself:</strong> what's one legitimate (non-malicious) service that also produces very regular, periodic outbound traffic — and how would you tell it apart from real C2 beaconing using the same capture?
          </p>
        </div>

        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-white font-semibold flex items-center gap-2">
            <span className="bg-cyan-500/20 px-2 py-0.5 rounded text-xs text-cyan-400">Lab 3</span>
            Extract a File From a PCAP
          </div>
          <ol className="text-sm text-white/50 list-decimal list-inside space-y-1 mt-2">
            <li>Capture (or find a sample capture of) an HTTP download of an image or document.</li>
            <li>Extract it via File → Export Objects → HTTP in the GUI.</li>
            <li>Now do the same thing from the command line using <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">tshark</code>, without opening the GUI at all.</li>
            <li>Confirm both extracted files are byte-identical (e.g. compare hashes).</li>
          </ol>
          <p className="text-xs text-white/30 mt-2">
            <strong className="text-white/70">Check yourself:</strong> what has to be true about the traffic for Export Objects to work at all — what happens to this technique the moment the download happens over HTTPS?
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Target size={16} className="text-cyan-400" /> Quick Self-Quiz (No Looking Up Answers)
        </h3>
        <ol className="text-sm text-white/50 space-y-2 list-decimal list-inside pl-1 mt-2">
          <li>What's the difference between a capture filter and a display filter, and why can't you apply a capture filter after the capture has already started?</li>
          <li>Why does <code className="bg-white/5 px-1 rounded text-emerald-400">http contains "password"</code> miss credentials sent over HTTPS, even on the same wire?</li>
          <li>What does <code className="bg-white/5 px-1 rounded text-emerald-400">tcp.flags.syn == 1 and tcp.flags.ack == 0</code> actually isolate, in plain terms — and why does that matter for spotting scanning or beaconing?</li>
          <li>If you're on a modern switched network with no port mirroring set up, what traffic will a plain Wireshark capture on your own machine actually see?</li>
        </ol>
      </div>
    </div>
  )
}

function BuilderPanel({
  filterCategory,
  filterInput,
  copiedId,
  onCategoryChange,
  onFilterClick,
  onFilterInputChange,
  onCopy,
}: {
  filterCategory: FilterCategory
  filterInput: string
  copiedId: string | null
  onCategoryChange: (category: FilterCategory) => void
  onFilterClick: (filter: string) => void
  onFilterInputChange: (value: string) => void
  onCopy: (id: string, text: string) => void
}) {
  const categoryNames: Record<FilterCategory, string> = {
    http: 'HTTP',
    dns: 'DNS',
    tcp: 'TCP',
    smb: 'SMB',
    credentials: 'Credentials',
    icmp: 'ICMP',
    tls: 'TLS',
    arp: 'ARP',
  }

  const iconMap: Record<FilterCategory, React.ReactNode> = {
    http: <Globe size={14} />,
    dns: <Server size={14} />,
    tcp: <Network size={14} />,
    smb: <Database size={14} />,
    credentials: <Lock size={14} />,
    icmp: <Zap size={14} />,
    tls: <Lock size={14} />,
    arp: <Network size={14} />,
  }

  const currentFilters = commonFilters[filterCategory]
  const isCopied = copiedId === 'builder-filter'

  return (
    <div>
      <h2 className="text-white font-semibold text-lg text-cyan-400 mb-6">Interactive Display Filter Builder</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div>
            <label className="text-sm text-white/40 block mb-1.5">Category</label>
            <select
              value={filterCategory}
              onChange={e => onCategoryChange(e.target.value as FilterCategory)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {Object.entries(categoryNames).map(([value, label]) => (
                <option key={value} value={value} style={{ background: '#0d1022' }}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-white/40 mb-1.5 flex items-center gap-2">
              {iconMap[filterCategory]}
              Quick Filters
            </label>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {currentFilters.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => onFilterClick(item.filter)}
                  className="w-full text-left px-3 py-2 bg-black/30 hover:bg-white/5 rounded-xl text-sm flex justify-between items-center border border-white/10 transition-colors"
                >
                  <span className="text-white/70">{item.name}</span>
                  <span className="font-mono text-xs text-white/30 truncate max-w-[150px]" title={item.filter}>
                    {item.filter}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Output */}
        <div>
          <label className="text-sm text-white/40 block mb-1.5">Your Filter</label>
          <textarea
            value={filterInput}
            onChange={e => onFilterInputChange(e.target.value)}
            className="w-full h-40 bg-black/60 border border-white/10 rounded-xl p-4 font-mono text-sm resize-y text-white/80 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            placeholder="Write your custom display filter here..."
          />

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onCopy('builder-filter', filterInput)}
              disabled={!filterInput.trim()}
              className="flex-1 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={isCopied ? 'Copied to clipboard' : 'Copy filter'}
            >
              {isCopied ? <Check size={16} /> : <Copy size={16} />}
              {isCopied ? 'Copied!' : 'Copy Filter'}
            </button>
            {filterInput && (
              <button
                onClick={() => onFilterInputChange('')}
                className="py-2.5 px-4 rounded-xl border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors text-sm"
              >
                Clear
              </button>
            )}
          </div>

          <div className="mt-4 p-3 rounded-xl border border-cyan-500/20 flex gap-2" style={{ background: 'rgba(6,182,212,0.06)' }}>
            <Lightbulb size={14} className="text-cyan-400 flex-shrink-0 mt-0.5" />
            <span className="text-xs text-white/40">Tip: Use <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">and</code>, <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">or</code>, <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">not</code> to combine filters. Example: <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">http and not dns</code></span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TsharkPanel({
  copiedId,
  onCopy,
}: {
  copiedId: string | null
  onCopy: (id: string, text: string) => void
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-white font-semibold text-lg text-cyan-400">tshark CLI</h2>
      <p className="text-sm text-white/50">
        Same dissection engine as Wireshark, scriptable. Prefer lab pcaps you generated or public sample captures.
      </p>
      <div className="space-y-3">
        {tsharkExamples.map(item => {
          const isCopied = copiedId === item.id
          return (
            <div key={item.id} className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-white font-semibold mb-1">{item.title}</div>
              <div className="flex items-center justify-between bg-black/60 rounded-lg p-3 font-mono text-sm gap-2 flex-wrap">
                <span className="text-emerald-400 break-all">{item.cmd}</span>
                {!item.cmd.startsWith('#') && (
                  <button
                    type="button"
                    onClick={() => onCopy(item.id, item.cmd)}
                    className="text-xs px-2 py-1 hover:bg-white/10 rounded flex items-center gap-1 text-white/40"
                  >
                    {isCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    {isCopied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="rounded-xl p-4 flex gap-3 border border-cyan-500/20" style={{ background: 'rgba(6,182,212,0.06)' }}>
        <Lightbulb className="text-cyan-400 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-white/50">
          <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">-f</code> is a capture filter (BPF, set before/at capture).
          <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400 ml-1">-Y</code> is a display filter (after packets exist). Mixing them up is the most common beginner mistake.
        </div>
      </div>
    </div>
  )
}

function ChecklistPanel({
  checklist,
  setChecklist,
}: {
  checklist: Record<string, boolean>
  setChecklist: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
}) {
  const done = checklistItems.filter(i => checklist[i.id]).length
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-white font-semibold text-lg text-cyan-400 flex items-center gap-2">
          <ListChecks size={18} /> Lab Checklist
        </h2>
        <span className="text-sm text-white/40">{done}/{checklistItems.length} complete</span>
      </div>
      <p className="text-sm text-white/50">Hands-on progress. Saved in this browser only.</p>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-cyan-500 transition-all" style={{ width: `${(done / Math.max(1, checklistItems.length)) * 100}%` }} />
      </div>
      <div className="space-y-2">
        {checklistItems.map(item => {
          const on = !!checklist[item.id]
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setChecklist(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
              className={`w-full text-left p-4 rounded-xl border transition-colors flex gap-3 ${
                on ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <span className="mt-0.5 flex-shrink-0">
                {on ? <Check size={18} className="text-emerald-400" /> : <div className="w-[18px] h-[18px] rounded-full border border-white/30" />}
              </span>
              <span>
                <span className={`text-sm font-medium ${on ? 'text-emerald-200/90 line-through' : 'text-white'}`}>{item.label}</span>
                <span className="block text-xs text-white/40 mt-0.5">{item.detail}</span>
              </span>
            </button>
          )
        })}
      </div>
      {done === checklistItems.length && (
        <div className="text-sm text-emerald-300/90 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          Checklist complete — open a new pcap and re-run the filters cold.
        </div>
      )}
      <button type="button" onClick={() => setChecklist({})} className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1.5">
        <RotateCcw size={12} /> Reset checklist
      </button>
    </div>
  )
}