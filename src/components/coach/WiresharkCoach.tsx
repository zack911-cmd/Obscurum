// src/components/coach/WiresharkCoach.tsx
import { useState, useCallback, useMemo } from 'react'
import {
  BookOpen, Filter, Play, Target, Copy, Lightbulb, Check,
  Shield, Zap, AlertTriangle,
  Command,
  Server, Globe, Lock, Eye,
  Database, Network, GraduationCap
} from 'lucide-react'

type Tab = 'overview' | 'basics' | 'filters' | 'practical' | 'defense' | 'labs' | 'builder'

// ─── STATIC DATA ───

const tabs: ReadonlyArray<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'basics', label: 'Wireshark Basics', icon: Target },
  { id: 'filters', label: 'Essential Filters', icon: Filter },
  { id: 'practical', label: 'Practical Scenarios', icon: Play },
  { id: 'defense', label: 'Detection & Defense', icon: AlertTriangle },
  { id: 'labs', label: 'Labs & Challenges', icon: GraduationCap },
  { id: 'builder', label: 'Filter Builder', icon: Lightbulb },
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
  ]
} as const

type FilterCategory = keyof typeof commonFilters

// ─── FILTER OPERATORS TIP (shared across tabs) ───

const FILTER_OPERATORS_TIP = (
  <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 flex gap-3">
    <AlertTriangle className="text-cyan-400 flex-shrink-0 mt-0.5" size={18} />
    <div className="text-sm text-ghost-text-dim">
      <strong className="text-ghost-text">Tip:</strong> Use <code className="bg-white/10 px-1.5 py-0.5 rounded text-ghost-green">and</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded text-ghost-green">or</code>, <code className="bg-white/10 px-1.5 py-0.5 rounded text-ghost-green">not</code> to combine filters. Example: <code className="bg-white/10 px-1.5 py-0.5 rounded text-ghost-green">http and not (http contains "robots.txt")</code>
    </div>
  </div>
)

// ─── COMPONENT ───

export default function WiresharkCoach() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // Interactive filter builder state
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('http')
  const [filterInput, setFilterInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

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
      setCopiedId(id)
      setTimeout(() => {
        setCopiedId(prev => prev === id ? null : prev)
      }, 2000)
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        showSuccess,
        () => {
          // Modern path failed — fall through to textarea fallback
          const ok = copyViaExecCommand(text)
          if (ok) showSuccess()
        }
      )
    } else {
      const ok = copyViaExecCommand(text)
      if (ok) showSuccess()
    }
  }, [copyViaExecCommand])

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
      default:
        return null
    }
  }, [
    activeTab, filterCategory, filterInput, copiedId,
    copyToClipboard, handleCategoryChange, handleFilterClick
  ])

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
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <BookOpen className="text-cyan-400" size={28} />
            <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Argus
            </span>
          </h1>
          <p className="text-ghost-text-dim text-sm mt-1">
            Master network traffic analysis for penetration testing and red team operations.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ghost-text-dim">
          <Shield size={14} className="text-cyan-400" />
          <span>Updated for v1.0</span>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b border-ghost-border overflow-x-auto scrollbar-hide"
        role="tablist"
      >
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const tabId = `tab-${tab.id}`

          return (
            <button
              key={tab.id}
              id={tabId}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-cyan-500 text-ghost-text'
                  : 'border-transparent text-ghost-text-dim hover:text-ghost-text'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div
        className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-6"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        id={`panel-${activeTab}`}
      >
        {renderContent}
      </div>
    </div>
  )
}

// ─── PANEL COMPONENTS ───

function OverviewPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2 text-cyan-400">Why Wireshark for Pentesters?</h2>
        <p className="text-ghost-text-dim leading-relaxed">
          Wireshark is the gold standard for network protocol analysis. As a pentester, it helps you:
        </p>
        <ul className="mt-3 text-sm text-ghost-text-dim space-y-1 list-disc pl-5">
          <li>Discover hidden services and misconfigurations</li>
          <li>Capture and analyze credentials in transit</li>
          <li>Understand application behavior and data flows</li>
          <li>Debug network issues during assessments</li>
          <li>Extract files and sensitive information from captures</li>
        </ul>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold mb-2 text-cyan-400 flex items-center gap-2">
            <Network size={16} /> Key Use Cases
          </h3>
          <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
            <li>Post-exploitation traffic analysis</li>
            <li>Credential sniffing (HTTP, FTP, Telnet)</li>
            <li>Protocol reverse engineering</li>
            <li>Detecting C2 beaconing</li>
          </ul>
        </div>
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold mb-2 text-cyan-400 flex items-center gap-2">
            <Zap size={16} /> Why Not Just tcpdump?
          </h3>
          <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
            <li>Powerful GUI with deep protocol dissection</li>
            <li>Real-time display filters</li>
            <li>Flow analysis (Follow TCP Stream)</li>
            <li>Export objects (files, certificates)</li>
          </ul>
        </div>
      </div>

      <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4 flex gap-3">
        <Lightbulb className="text-cyan-400 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-ghost-text-dim">
          <strong className="text-ghost-text">Pro Tip:</strong> Use <code className="bg-white/10 px-1.5 py-0.5 rounded text-ghost-green">tshark</code> (Wireshark CLI) for automated packet analysis in scripts.
        </div>
      </div>
    </div>
  )
}

function BasicsPanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-cyan-400">Wireshark Basics</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-cyan-400 mb-2 flex items-center gap-2">
            <Eye size={16} /> Key Interface Areas
          </h3>
          <ul className="text-sm space-y-2 text-ghost-text-dim">
            <li><strong className="text-ghost-text">Packet List</strong> — All captured packets</li>
            <li><strong className="text-ghost-text">Packet Details</strong> — Expandable protocol tree</li>
            <li><strong className="text-ghost-text">Packet Bytes</strong> — Raw hex + ASCII view</li>
            <li><strong className="text-ghost-text">Display Filter</strong> — Most important bar in Wireshark</li>
          </ul>
        </div>
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-cyan-400 mb-2 flex items-center gap-2">
            <Play size={16} /> Essential First Steps
          </h3>
          <ol className="text-sm space-y-2 text-ghost-text-dim list-decimal pl-5">
            <li>Start capture on the correct interface</li>
            <li>Use a good capture filter if possible</li>
            <li>Apply display filters to focus</li>
            <li>Right-click → Follow → TCP Stream</li>
            <li>File → Export Objects → HTTP</li>
          </ol>
        </div>
      </div>

      <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
        <h3 className="font-semibold text-cyan-400 mb-2 flex items-center gap-2">
          <Command size={16} /> Useful Shortcuts
        </h3>
        <div className="grid grid-cols-2 gap-2 text-sm text-ghost-text-dim">
          <div><kbd className="px-2 py-1 bg-white/10 rounded text-xs">Ctrl+E</kbd> Start/Stop capture</div>
          <div><kbd className="px-2 py-1 bg-white/10 rounded text-xs">Ctrl+F</kbd> Find packet</div>
          <div><kbd className="px-2 py-1 bg-white/10 rounded text-xs">Ctrl+Shift+Alt+T</kbd> Follow TCP Stream</div>
          <div><kbd className="px-2 py-1 bg-white/10 rounded text-xs">Ctrl+R</kbd> Reload capture file</div>
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
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-cyan-400">Most Useful Display Filters</h2>

      {Object.entries(commonFilters).map(([category, filters]) => {
        const cat = category as FilterCategory
        const iconMap: Record<FilterCategory, React.ReactNode> = {
          http: <Globe size={14} />,
          dns: <Server size={14} />,
          tcp: <Network size={14} />,
          smb: <Database size={14} />,
          credentials: <Lock size={14} />
        }

        return (
          <div key={category} className="mb-4">
            <h3 className="font-semibold text-cyan-400 mb-3 capitalize flex items-center gap-2">
              {iconMap[cat]}
              {category} Filters
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filters.map((item, index) => {
                const key = `filter-${category}-${index}`
                const isCopied = copiedId === key
                return (
                  <div key={index} className="flex items-center justify-between bg-ghost-bg/50 p-3 rounded-lg border border-ghost-border/50 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-ghost-text truncate">{item.name}</div>
                      <div className="font-mono text-xs text-ghost-text-dim truncate" title={item.filter}>
                        {item.filter}
                      </div>
                    </div>
                    <button
                      onClick={() => onCopy(key, item.filter)}
                      className="text-xs px-2 py-1 hover:bg-white/10 rounded flex items-center gap-1 flex-shrink-0 ml-2"
                      aria-label={isCopied ? 'Copied to clipboard' : 'Copy filter'}
                    >
                      {isCopied ? <Check size={12} className="text-ghost-green" /> : <Copy size={12} />}
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
      <h2 className="text-lg font-semibold text-cyan-400">Practical Red Team Scenarios</h2>

      <div className="space-y-4">
        {scenarios.map((s) => {
          const isCopied = copiedId === s.id
          return (
            <div key={s.id} className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
              <h3 className="font-semibold text-ghost-text flex items-center gap-2">
                <span className="bg-cyan-500/20 px-2 py-0.5 rounded text-xs text-cyan-400">Scenario {s.id.replace('scenario', '')}</span>
                {s.title}
              </h3>
              <p className="text-sm text-ghost-text-dim mt-2">{s.desc}</p>
              <div className="flex items-center justify-between bg-black/60 rounded-lg p-2 font-mono text-xs mt-2">
                <span className="text-ghost-green break-all">{s.filter}</span>
                <button
                  onClick={() => onCopy(s.id, s.filter)}
                  className="text-ghost-text-dim hover:text-ghost-text flex items-center gap-1 flex-shrink-0 ml-2"
                  aria-label={isCopied ? 'Copied to clipboard' : 'Copy filter'}
                >
                  {isCopied ? <Check size={12} className="text-ghost-green" /> : <Copy size={12} />}
                  {isCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="text-xs text-ghost-text-dim mt-2">
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
      <h2 className="text-lg font-semibold text-cyan-400">Detection & Defense</h2>
      <p className="text-sm text-ghost-text-dim">
        Wireshark is unusual on this list: it's not just an offensive tool that gets detected — it's
        one of the primary tools defenders use to detect <em>you</em>. Understanding both directions matters.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
            <Eye size={16} className="text-cyan-400" /> How Sniffing Gets Noticed
          </h3>
          <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
            <li>On switched networks, plain sniffing only sees your own traffic — capturing others' traffic requires ARP spoofing, a SPAN/mirror port, or a compromised switch, and ARP spoofing itself is loudly detectable (duplicate/changing MAC-to-IP mappings).</li>
            <li>Putting a NIC into promiscuous mode is visible to host-based monitoring and some EDR agents.</li>
            <li>Running <code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green">dumpcap</code>/<code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green">tshark</code> as an unexpected process on a server is itself an anomaly worth alerting on.</li>
            <li>Large capture files being written to disk (or exfiltrated) leave forensic evidence — file size and write patterns stand out.</li>
          </ul>
        </div>
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
            <Lock size={16} className="text-cyan-400" /> Defending Against Sniffing
          </h3>
          <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
            <li>Encrypt everything in transit — TLS for HTTP, SSH instead of Telnet, encrypted SMB — so a captured packet is useless without the key.</li>
            <li>Use dynamic ARP inspection / DHCP snooping on switches to block ARP spoofing.</li>
            <li>Monitor for NICs entering promiscuous mode and for unauthorized packet-capture tools running on endpoints.</li>
            <li>Segment networks so a single compromised host can't see traffic beyond its own segment.</li>
          </ul>
        </div>
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50 md:col-span-2">
          <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
            <Shield size={16} className="text-cyan-400" /> Wireshark as a Blue Team Tool
          </h3>
          <p className="text-sm text-ghost-text-dim">
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
      <h2 className="text-lg font-semibold text-cyan-400">Labs & Challenges</h2>
      <p className="text-sm text-ghost-text-dim">
        Work these with a real capture file, not by reading the filter syntax and moving on. If you don't
        have a lab set up, generate your own traffic (browse a test site over HTTP, run an FTP login, do an
        SMB share connection) and capture it yourself before analyzing.
      </p>

      <div className="space-y-4">
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <div className="font-semibold flex items-center gap-2">
            <span className="bg-cyan-500/20 px-2 py-0.5 rounded text-xs">Lab 1</span>
            Find the Credential in a Capture
          </div>
          <ol className="text-sm text-ghost-text-dim list-decimal list-inside space-y-1 mt-2">
            <li>Download a sample pcap with cleartext HTTP Basic Auth or FTP login (search "wireshark sample captures" for legitimate practice files, e.g. the Wireshark wiki's SampleCaptures page).</li>
            <li>Open it and, using only the display filter bar (no Ctrl+F text search), isolate the exact packet containing the credential.</li>
            <li>Use Follow → TCP Stream on that packet to see the full login exchange in context.</li>
          </ol>
          <p className="text-xs text-ghost-text-dim mt-2">
            <strong className="text-ghost-text">Check yourself:</strong> why won't this same technique work against a login form served over HTTPS, even if you can capture every packet?
          </p>
        </div>

        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <div className="font-semibold flex items-center gap-2">
            <span className="bg-cyan-500/20 px-2 py-0.5 rounded text-xs">Lab 2</span>
            Spot the Beacon
          </div>
          <ol className="text-sm text-ghost-text-dim list-decimal list-inside space-y-1 mt-2">
            <li>Find or generate a capture containing periodic outbound connections (a cron job hitting an external IP every N seconds works fine as a stand-in for C2 beaconing).</li>
            <li>Use Statistics → Conversations to identify which host/IP pair has the most regular, evenly-spaced connections.</li>
            <li>Use Statistics → I/O Graph to visualize the timing pattern.</li>
          </ol>
          <p className="text-xs text-ghost-text-dim mt-2">
            <strong className="text-ghost-text">Check yourself:</strong> what's one legitimate (non-malicious) service that also produces very regular, periodic outbound traffic — and how would you tell it apart from real C2 beaconing using the same capture?
          </p>
        </div>

        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <div className="font-semibold flex items-center gap-2">
            <span className="bg-cyan-500/20 px-2 py-0.5 rounded text-xs">Lab 3</span>
            Extract a File From a PCAP
          </div>
          <ol className="text-sm text-ghost-text-dim list-decimal list-inside space-y-1 mt-2">
            <li>Capture (or find a sample capture of) an HTTP download of an image or document.</li>
            <li>Extract it via File → Export Objects → HTTP in the GUI.</li>
            <li>Now do the same thing from the command line using <code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green">tshark</code>, without opening the GUI at all.</li>
            <li>Confirm both extracted files are byte-identical (e.g. compare hashes).</li>
          </ol>
          <p className="text-xs text-ghost-text-dim mt-2">
            <strong className="text-ghost-text">Check yourself:</strong> what has to be true about the traffic for Export Objects to work at all — what happens to this technique the moment the download happens over HTTPS?
          </p>
        </div>
      </div>

      <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
        <h3 className="font-semibold flex items-center gap-2">
          <Target size={16} className="text-cyan-400" /> Quick Self-Quiz (No Looking Up Answers)
        </h3>
        <ol className="text-sm text-ghost-text-dim space-y-2 list-decimal list-inside pl-1 mt-2">
          <li>What's the difference between a capture filter and a display filter, and why can't you apply a capture filter after the capture has already started?</li>
          <li>Why does <code className="bg-white/5 px-1 rounded">http contains "password"</code> miss credentials sent over HTTPS, even on the same wire?</li>
          <li>What does <code className="bg-white/5 px-1 rounded">tcp.flags.syn == 1 and tcp.flags.ack == 0</code> actually isolate, in plain terms — and why does that matter for spotting scanning or beaconing?</li>
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
    credentials: 'Credentials'
  }

  const iconMap: Record<FilterCategory, React.ReactNode> = {
    http: <Globe size={14} />,
    dns: <Server size={14} />,
    tcp: <Network size={14} />,
    smb: <Database size={14} />,
    credentials: <Lock size={14} />
  }

  const currentFilters = commonFilters[filterCategory]
  const isCopied = copiedId === 'builder-filter'

  return (
    <div>
      <h2 className="text-lg font-semibold text-cyan-400 mb-6">Interactive Display Filter Builder</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-4">
          <div>
            <label className="text-sm text-ghost-text-dim block mb-1.5">Category</label>
            <select
              value={filterCategory}
              onChange={e => onCategoryChange(e.target.value as FilterCategory)}
              className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {Object.entries(categoryNames).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-ghost-text-dim mb-1.5 flex items-center gap-2">
              {iconMap[filterCategory]}
              Quick Filters
            </label>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {currentFilters.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => onFilterClick(item.filter)}
                  className="w-full text-left px-3 py-2 bg-ghost-bg/50 hover:bg-white/5 rounded-lg text-sm flex justify-between items-center border border-ghost-border/50 transition-colors"
                >
                  <span className="text-ghost-text">{item.name}</span>
                  <span className="font-mono text-xs text-ghost-text-dim truncate max-w-[150px]" title={item.filter}>
                    {item.filter}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Output */}
        <div>
          <label className="text-sm text-ghost-text-dim block mb-1.5">Your Filter</label>
          <textarea
            value={filterInput}
            onChange={e => onFilterInputChange(e.target.value)}
            className="w-full h-40 bg-black/60 border border-ghost-border rounded-xl p-4 font-mono text-sm resize-y text-ghost-text focus:outline-none focus:ring-2 focus:ring-cyan-500"
            placeholder="Write your custom display filter here..."
          />

          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onCopy('builder-filter', filterInput)}
              disabled={!filterInput.trim()}
              className="flex-1 py-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={isCopied ? 'Copied to clipboard' : 'Copy filter'}
            >
              {isCopied ? <Check size={16} /> : <Copy size={16} />}
              {isCopied ? 'Copied!' : 'Copy Filter'}
            </button>
            {filterInput && (
              <button
                onClick={() => onFilterInputChange('')}
                className="py-2 px-4 rounded-lg border border-ghost-border text-ghost-text-dim hover:text-ghost-text hover:bg-white/5 transition-colors text-sm"
              >
                Clear
              </button>
            )}
          </div>

          <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs text-ghost-text-dim">
            <Lightbulb size={14} className="inline mr-1 text-cyan-400" />
            Tip: Use <code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green">and</code>, <code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green">or</code>, <code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green">not</code> to combine filters. Example: <code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green">http and not dns</code>
          </div>
        </div>
      </div>
    </div>
  )
}