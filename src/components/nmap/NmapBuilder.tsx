import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { 
  Network, Radar, Copy, Check, RotateCcw, Cpu, ChevronDown, ChevronUp, 
  BookOpen, Zap, Save, Upload, Download, History, Trash2,
  Search, Shield,
  BarChart3, Clock, 
  Play, 
  Sparkles, X, Info, AlertCircle,
  Terminal, Layers, Tag, Timer,
  Target, Wrench
} from 'lucide-react'
import { ollamaChatOnce, checkOllamaHealth } from '../../lib/ollama'
import { useActiveModel } from '../models/ModelManager'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Option = {
  id: string
  label: string
  flag: string
  description: string
  category: string
  conflictsWith?: string[]
  beginnerTip?: string
  advancedNote?: string
  examples?: string[]
  detectionNote?: string
  estimatedTime?: 'fast' | 'medium' | 'slow' | 'very-slow'
}

type AnalyzerResult = {
  services: { port: string; service: string; version: string; state: string }[]
  suggestions: string[]
  tools: string[]
  risks: string[]
  cveReferences?: string[]
  quickWins?: string[]
}

type SavedCommand = {
  id: string
  command: string
  target: string
  timestamp: number
  options: string[]
  description?: string
  tags?: string[]
  scanType?: string
}

type ScanTemplate = {
  id: string
  name: string
  description: string
  icon: string
  options: string[]
  targetHint?: string
  estimatedTime: 'fast' | 'medium' | 'slow' | 'very-slow'
  bestFor: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SCAN_TEMPLATES: ScanTemplate[] = [
  {
    id: 'quick-recon',
    name: 'Quick Recon',
    description: 'Fast top-100 scan for initial discovery',
    icon: '⚡',
    options: ['sS', 'top100', 'T4', 'n', 'Pn'],
    estimatedTime: 'fast',
    bestFor: ['Initial host discovery', 'Getting a quick overview']
  },
  {
    id: 'full-discovery',
    name: 'Full Discovery',
    description: 'Complete scan with versions and scripts',
    icon: '🔍',
    options: ['sS', 'allports', 'sV', 'sc', 'T4', 'oN'],
    estimatedTime: 'slow',
    bestFor: ['Detailed enumeration', 'Vulnerability assessment']
  },
  {
    id: 'stealth',
    name: 'Stealth Scan',
    description: 'Slow, evasive scan for monitored networks',
    icon: '👻',
    options: ['sS', 'T1', 'n', 'Pn', 'top1000'],
    estimatedTime: 'very-slow',
    bestFor: ['Heavily monitored environments', 'Avoiding threshold alerts']
  },
  {
    id: 'vuln-scan',
    name: 'Vulnerability Scan',
    description: 'Version detection + vulnerability scripts',
    icon: '💥',
    options: ['sS', 'sV', 'vuln', 'T4', 'top1000', 'oN'],
    estimatedTime: 'medium',
    bestFor: ['CVE discovery', 'Vulnerability identification']
  },
  {
    id: 'htb-ctf',
    name: 'HTB/CTF',
    description: 'Full methodology for hacking competitions',
    icon: '🚩',
    options: ['sS', 'allports', 'sV', 'sc', 'A', 'T4', 'oN', 'min'],
    estimatedTime: 'slow',
    bestFor: ['HackTheBox', 'TryHackMe', 'CTF challenges']
  },
  {
    id: 'windows-smb',
    name: 'Windows/SMB Focus',
    description: 'Windows targets with SMB enumeration',
    icon: '🪟',
    options: ['sS', 'sV', 'smb', 'top1000', 'T4', 'oN'],
    estimatedTime: 'medium',
    bestFor: ['Windows targets', 'SMB vulnerability checks']
  },
  {
    id: 'web-app',
    name: 'Web App Recon',
    description: 'HTTP/HTTPS focused enumeration',
    icon: '🌐',
    options: ['sS', 'top1000', 'sV', 'http', 'T4', 'oN'],
    estimatedTime: 'fast',
    bestFor: ['Web applications', 'HTTP service enumeration']
  },
  {
    id: 'external-pentest',
    name: 'External Pentest',
    description: 'Slow, thorough external assessment',
    icon: '🏢',
    options: ['sS', 'allports', 'sV', 'sc', 'A', 'T2', 'oA'],
    estimatedTime: 'very-slow',
    bestFor: ['External engagements', 'Production environments']
  },
]

const OPTIONS: Option[] = [
  // Scan types
  { id: 'sS', label: 'SYN Scan (Stealth)', flag: '-sS', description: 'Half-open scan, stealthy, requires root', category: 'Scan Type', conflictsWith: ['sT','sU'], beginnerTip: 'Default scan type for most situations. Sends SYN packets but doesn\'t complete TCP handshake.', advancedNote: 'Requires root (raw socket access to craft the SYN packet directly). Mechanism: nmap sends SYN, if it gets SYN/ACK back the port is open and nmap immediately sends RST instead of completing the handshake with ACK — so the connection is never fully established at the OS/application layer.', detectionNote: 'Called "stealth" for historical reasons only — modern IDS/IPS (Snort, Suricata) and stateful firewalls log half-open connections just as easily as full ones. A burst of SYNs to sequential ports from one source in a short window is a textbook port-scan signature regardless of scan type. It\'s marginally quieter than -sT because it never touches the application layer (so app-level logs, e.g. a web server access log, show nothing) — but the network layer sees it clearly.', estimatedTime: 'fast' },
  { id: 'sT', label: 'TCP Connect Scan', flag: '-sT', description: 'Full TCP connect, no root needed', category: 'Scan Type', conflictsWith: ['sS'], beginnerTip: 'Use when SYN scan is blocked. Completes full TCP connection but less stealthy.', advancedNote: 'Uses the OS\'s normal connect() syscall, so it completes the full three-way handshake (SYN, SYN/ACK, ACK) like any real client application would.', detectionNote: 'Because it completes the handshake, it shows up in application-layer logs too — e.g. a completed-then-immediately-closed connection in a web server or SSH daemon log, not just a firewall/netflow record. This is the scan type you\'re forced into on shared hosting/cloud accounts where you don\'t have raw-socket privileges.', estimatedTime: 'medium' },
  { id: 'sU', label: 'UDP Scan', flag: '-sU', description: 'Scan UDP ports (slower)', category: 'Scan Type', beginnerTip: 'Required for DNS (53), SNMP (161), DHCP (67/68). Slower due to UDP nature.', advancedNote: 'UDP has no handshake, so nmap infers state from the response (or lack of one): an ICMP port-unreachable means closed, any UDP response means open, and silence means open|filtered — nmap genuinely cannot tell those two apart without a protocol-specific probe, which is why -sU is slow and often ambiguous.', detectionNote: 'Rate-limited ICMP unreachable responses on most OSes (Linux defaults to ~1/sec) are the main reason UDP scans take forever — that same rate limit is also a detection signal for defenders watching for a sudden spike in outbound ICMP unreachables from one host.', estimatedTime: 'very-slow' },
  { id: 'sA', label: 'ACK Scan', flag: '-sA', description: 'Map firewall rules', category: 'Scan Type', beginnerTip: 'Used for firewall rule detection. Doesn\'t determine port state.', advancedNote: 'Sends only an ACK with no prior SYN. A stateless firewall/router will let it through and the OS behind it replies RST regardless of port state (since ACK-only isn\'t a valid handshake step) — nmap reads that RST as "unfiltered". No RST at all means something stateful is dropping it, i.e. "filtered". This tells you about the firewall, not the service.', detectionNote: 'An ACK with no preceding SYN in the connection table is anomalous to any stateful firewall or IDS — it will either be silently dropped (which is itself the "filtered" signal nmap is reading) or flagged as an out-of-state packet in firewall logs.', estimatedTime: 'fast' },
  { id: 'sN', label: 'NULL Scan', flag: '-sN', description: 'Stealthy, bypasses some firewalls', category: 'Scan Type', beginnerTip: 'Sends TCP packets with no flags set. Evasion technique for older firewalls.', advancedNote: 'Relies on RFC 793: a closed port must respond RST to any non-SYN segment with no flags set, while an open port on a compliant stack silently drops it. This distinction only exists on Unix-like TCP/IP stacks — Windows ignores the RFC here and returns RST for everything, making NULL/FIN/Xmas scans useless against Windows targets.', detectionNote: 'A TCP segment with zero flags set is not something any legitimate application ever sends — any signature-based IDS flags it immediately. This is an academically interesting evasion against 1990s-era stateless packet filters, not a real stealth technique against a modern network.', estimatedTime: 'fast' },
  { id: 'sX', label: 'XMAS Scan', flag: '-sX', description: 'Sets FIN, PSH, URG flags', category: 'Scan Type', beginnerTip: 'Named for Christmas tree packet. Good for bypassing some packet filters.', advancedNote: 'Same RFC 793 logic as NULL scan (closed=RST, open=silence on compliant Unix stacks), just with FIN+PSH+URG set instead of nothing. Same Windows blind-spot applies.', detectionNote: 'FIN+PSH+URG together is an invalid, physically-impossible-in-normal-traffic flag combination — even more obviously anomalous to an IDS than a NULL packet, since a real TCP stack never legitimately produces this combination.', estimatedTime: 'fast' },
  
  // Port selection
  { id: 'top100', label: 'Top 100 Ports', flag: '--top-ports 100', description: 'Scan 100 most common ports', category: 'Ports', conflictsWith: ['top1000','allports','fastports'], beginnerTip: 'Fast initial scan. Covers ~95% of common services.', estimatedTime: 'fast' },
  { id: 'top1000', label: 'Top 1000 Ports', flag: '--top-ports 1000', description: 'Default nmap port range', category: 'Ports', conflictsWith: ['top100','allports','fastports'], beginnerTip: 'Nmap\'s default scan. Good balance of speed and coverage.', estimatedTime: 'medium' },
  { id: 'allports',label: 'All 65535 Ports', flag: '-p-', description: 'Full port scan (slower)', category: 'Ports', conflictsWith: ['top100','top1000','fastports'], beginnerTip: 'Thorough scan for hidden services. Takes much longer.', estimatedTime: 'very-slow' },
  { id: 'fastports',label: 'Fast Scan (-F)', flag: '-F', description: 'Top 100 ports, faster', category: 'Ports', conflictsWith: ['top100','top1000','allports'], beginnerTip: 'Even faster than --top-ports 100. Good for quick checks.', estimatedTime: 'fast' },
  { id: 'customports',label: 'Custom Ports', flag: '-p 22,80,443', description: 'Scan specific ports', category: 'Ports', beginnerTip: 'Use when you know target ports. Format: -p 22,80,443 or -p 1-1000', examples: ['-p 22,80,443', '-p 1-1000', '-p U:53,111,T:22,80'], estimatedTime: 'medium' },
  
  // Detection
  { id: 'sV', label: 'Version Detection', flag: '-sV', description: 'Detect service versions', category: 'Detection', beginnerTip: 'Identifies exact software versions. Required for vulnerability matching.', advancedNote: 'Uses probes to identify service versions. Adds time to scan.', estimatedTime: 'medium' },
  { id: 'O', label: 'OS Detection', flag: '-O', description: 'Detect OS (requires root)', category: 'Detection', beginnerTip: 'Identifies target OS. Helps tailor exploitation techniques.', estimatedTime: 'medium' },
  { id: 'A', label: 'Aggressive Scan', flag: '-A', description: '-sV -O --script=default -traceroute', category: 'Detection', beginnerTip: 'All-in-one scan. Combines version detection, OS detection, and default scripts.', advancedNote: 'Most comprehensive single flag. May be detected by IDS.', estimatedTime: 'slow' },
  
  // Timing
  { id: 'T1', label: 'T1 — Sneaky', flag: '-T1', description: 'Very slow, evades IDS', category: 'Timing', conflictsWith: ['T2','T3','T4','T5'], beginnerTip: 'For heavily monitored networks. Sends 5min intervals between packets.', detectionNote: 'Slow timing evades threshold-based alerting (e.g. "more than N SYNs from one IP in 60s"), not the scan itself — the packets still look identical to -T3 packets, they\'re just spread out. A defender correlating over hours/days instead of minutes still catches it; this buys time, it doesn\'t make the traffic invisible.', estimatedTime: 'very-slow' },
  { id: 'T2', label: 'T2 — Polite', flag: '-T2', description: 'Slow, less bandwidth', category: 'Timing', conflictsWith: ['T1','T3','T4','T5'], beginnerTip: 'Slower scan to avoid overwhelming targets. 15s between probes.', estimatedTime: 'slow' },
  { id: 'T3', label: 'T3 — Normal', flag: '-T3', description: 'Default timing', category: 'Timing', conflictsWith: ['T1','T2','T4','T5'], beginnerTip: 'Default timing. Good balance of speed and stealth.', estimatedTime: 'medium' },
  { id: 'T4', label: 'T4 — Aggressive',flag: '-T4', description: 'Faster, assumes good network', category: 'Timing', conflictsWith: ['T1','T2','T3','T5'], beginnerTip: 'Fast scan for good network conditions. May overwhelm slow connections.', estimatedTime: 'fast' },
  { id: 'T5', label: 'T5 — Insane', flag: '-T5', description: 'Fastest, may miss ports', category: 'Timing', conflictsWith: ['T1','T2','T3','T4'], beginnerTip: 'Maximum speed. Only for very fast networks. High chance of missing ports.', detectionNote: 'Ironically the loudest and easiest to detect option in the whole tool — a burst of thousands of packets/sec to one host is unmissable on any netflow dashboard. Fast ≠ stealthy; these are opposite ends of the same tradeoff, never confuse them.', estimatedTime: 'fast' },
  
  // Scripts
  { id: 'sc', label: 'Default Scripts', flag: '-sC', description: 'Run default NSE scripts', category: 'Scripts', beginnerTip: 'Runs safe default scripts. Good starting point for enumeration.', advancedNote: 'Equivalent to --script=default. Each script is written in Lua and tagged by category (safe, intrusive, vuln, auth, brute, discovery...); "default" only pulls scripts tagged safe+non-destructive, which is why it\'s the sane default to combine with -sV.', estimatedTime: 'medium' },
  { id: 'vuln', label: 'Vuln Scripts', flag: '--script=vuln', description: 'Run vulnerability detection NSE', category: 'Scripts', beginnerTip: 'Checks for known vulnerabilities. Can be intrusive.', detectionNote: 'These scripts send crafted probes matching known CVE signatures — they generate very recognizable payloads (e.g. the MS17-010 check sends a specific malformed SMB transaction). Any IDS with vuln-scanner signatures (which is most of them) flags this category by name, unlike a plain SYN scan which just looks like generic recon.', advancedNote: 'False positives happen — a vuln script matching on a banner string can flag a patched system that simply didn\'t change its version string. Always confirm a vuln script hit manually before reporting it; this is a classic mistake beginners make (reporting a script hit as confirmed without independent verification).', estimatedTime: 'slow' },
  { id: 'auth', label: 'Auth Scripts', flag: '--script=auth', description: 'Test authentication', category: 'Scripts', beginnerTip: 'Tests authentication bypasses. May lock accounts.', estimatedTime: 'medium' },
  { id: 'brute', label: 'Brute Scripts', flag: '--script=brute', description: 'Brute force credentials', category: 'Scripts', beginnerTip: 'Performs brute force attacks. Risk of account lockouts.', detectionNote: 'Guaranteed to trigger authentication-failure alerting and account lockout policies on any properly configured target — this is the loudest, least deniable category in the entire tool. Never run this outside an explicit, written scope authorization; a lockout can constitute a denial-of-service against a real business system.', estimatedTime: 'very-slow' },
  { id: 'http', label: 'HTTP Scripts', flag: '--script=http-enum', description: 'Enumerate HTTP directories', category: 'Scripts', beginnerTip: 'Finds web directories and files. Good for web app testing.', advancedNote: 'http-enum works off a bundled wordlist of common paths — it\'s a coarse first pass, not a replacement for a proper content-discovery tool like ffuf or gobuster with a larger, purpose-built wordlist.', estimatedTime: 'medium' },
  { id: 'smb', label: 'SMB Scripts', flag: '--script=smb-enum-shares,smb-vuln-ms17-010', description: 'SMB enumeration + EternalBlue check', category: 'Scripts', beginnerTip: 'Essential for Windows targets. Checks for MS17-010 (EternalBlue).', advancedNote: 'smb-vuln-ms17-010 only checks for the vulnerability signature — it does not exploit it. Confirming a vulnerable host still requires a separate exploitation step (e.g. via Metasploit\'s ms17_010 modules) in an authorized engagement.', estimatedTime: 'medium' },
  
  // Output
  { id: 'oN', label: 'Save Normal Output', flag: '-oN output.txt', description: 'Save to output.txt', category: 'Output', beginnerTip: 'Human-readable output. Good for manual review.', estimatedTime: 'fast' },
  { id: 'oX', label: 'Save XML Output', flag: '-oX output.xml', description: 'Save XML for tools', category: 'Output', beginnerTip: 'Machine-readable. Import into other tools.', estimatedTime: 'fast' },
  { id: 'oG', label: 'Save Grepable', flag: '-oG output.gnmap',description: 'Grepable format', category: 'Output', beginnerTip: 'Simple format for grep searches. Good for scripting.', estimatedTime: 'fast' },
  { id: 'oA', label: 'Save All Formats', flag: '-oA output', description: 'Save all 3 formats', category: 'Output', beginnerTip: 'Creates .nmap, .xml, and .gnmap files. Best practice.', estimatedTime: 'fast' },
  
  // Misc
  { id: 'v', label: 'Verbose', flag: '-v', description: 'Verbose output', category: 'Misc', beginnerTip: 'Shows results in real-time. Good for monitoring progress.', estimatedTime: 'fast' },
  { id: 'vv', label: 'Very Verbose', flag: '-vv', description: 'Extra verbose output', category: 'Misc', beginnerTip: 'Shows all scan details. Useful for troubleshooting.', estimatedTime: 'fast' },
  { id: 'n', label: 'No DNS', flag: '-n', description: 'Skip DNS resolution (faster)',category: 'Misc', beginnerTip: 'Skip reverse DNS lookups. Speeds up scan significantly.', estimatedTime: 'fast' },
  { id: 'Pn', label: 'Skip Host Disc', flag: '-Pn', description: 'Treat host as online', category: 'Misc', beginnerTip: 'Skip host discovery. Use when hosts don\'t respond to pings.', estimatedTime: 'fast' },
  { id: 'min', label: 'Min Rate 1000', flag: '--min-rate 1000', description: 'Send 1000+ packets/sec', category: 'Misc', beginnerTip: 'Force faster scanning. Bypasses timing templates.', estimatedTime: 'fast' },
  { id: 'max', label: 'Max Retries 1', flag: '--max-retries 1', description: 'Limit retransmissions', category: 'Misc', beginnerTip: 'Reduce retries for faster scans. May miss ports.', estimatedTime: 'fast' },
  { id: 'scan-delay', label: 'Scan Delay',flag: '--scan-delay 5s', description: 'Add delay between probes', category: 'Misc', beginnerTip: 'Evade rate-limiting. Use --scan-delay 5s or higher.', estimatedTime: 'slow' },
]

const CATEGORIES = ['Scan Type', 'Ports', 'Detection', 'Timing', 'Scripts', 'Output', 'Misc']

const MAX_SAVED_COMMANDS = 200

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        const show = () => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }
        
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(text)
            show()
            return
          } catch {
            // Fall through to fallback
          }
        }
        
        try {
          const el = document.createElement('textarea')
          el.value = text
          el.style.position = 'fixed'
          el.style.opacity = '0'
          el.style.left = '-9999px'
          document.body.appendChild(el)
          el.select()
          document.execCommand('copy')
          document.body.removeChild(el)
          show()
        } catch (err) {
          console.error('Copy failed:', err)
        }
      }}
      aria-label="Copy to clipboard"
      className="flex items-center gap-1 text-xs text-white/40 hover:text-cyan-400 transition-colors"
    >
      {copied ? <><Check size={11} className="text-emerald-400" />copied</> : <><Copy size={11} />copy</>}
    </button>
  )
}

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

function EstimatedTimeBadge({ time }: { time?: 'fast' | 'medium' | 'slow' | 'very-slow' }) {
  if (!time) return null
  const colors = {
    fast: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    slow: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    'very-slow': 'text-red-400 bg-red-500/10 border-red-500/20',
  }
  const labels = {
    fast: '⚡ Fast',
    medium: '⏱ Medium',
    slow: '🐢 Slow',
    'very-slow': '🐌 Very Slow',
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${colors[time]}`}>
      {labels[time]}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function NmapBuilder() {
  // ─── ModelManager Integration ──────────────────────────────────────────────
  const activeModel = useActiveModel()
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null)
  const [ollamaError, setOllamaError] = useState<string | null>(null)

  // ─── State ──────────────────────────────────────────────────────────────────
  const [target, setTarget] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(['sS','top1000','T4']))
  const [activeTab, setActiveTab] = useState<'builder'|'analyzer'|'history'>('builder')
  const [nmapOutput, setNmapOutput] = useState('')
  const [analysis, setAnalysis] = useState<AnalyzerResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiExplain, setAiExplain] = useState('')
  const [loadingAI, setLoadingAI] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(CATEGORIES))
  const [showBeginnerTips, setShowBeginnerTips] = useState(true)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [showNmapInfo, setShowNmapInfo] = useState(true)
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>(() => {
    try {
      const saved = localStorage.getItem('nmap_saved_commands')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [commandDescription, setCommandDescription] = useState('')
  const [commandTags, setCommandTags] = useState<string[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [scanStats, setScanStats] = useState({ totalScans: 0, totalPorts: 0 })
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [tagFilter, setTagFilter] = useState<string>('all')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const analyzeRequestIdRef = useRef(0)
  const explainRequestIdRef = useRef(0)

  // ─── Check Ollama Availability ────────────────────────────────────────────
  useEffect(() => {
    async function checkOllama() {
      try {
        const { ok, version } = await checkOllamaHealth()
        setOllamaAvailable(ok)
        if (!ok) setOllamaError(version ? `Unexpected response` : 'Connection refused')
      } catch {
        setOllamaAvailable(false)
        setOllamaError('Connection refused')
      }
    }
    checkOllama()
  }, [])

  // ─── Persistence ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem('nmap_saved_commands', JSON.stringify(savedCommands))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        console.error('nmap_saved_commands: localStorage quota exceeded')
      } else {
        console.error('nmap_saved_commands: write failed', err)
      }
    }
  }, [savedCommands])

  // ─── Command Functions ────────────────────────────────────────────────────
  const toggle = (id: string) => {
    const opt = OPTIONS.find(o => o.id === id)
    if (!opt) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      opt.conflictsWith?.forEach(c => next.delete(c))
      next.add(id)
      return next
    })
  }

  const applyTemplate = (template: ScanTemplate) => {
    setSelected(new Set(template.options))
    if (template.targetHint) {
      setTarget(template.targetHint)
    }
    setShowTemplatePicker(false)
  }


  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const buildCommand = () => {
    const flags = OPTIONS.filter(o => selected.has(o.id)).map(o => o.flag)
    const t = target.trim() || '<target>'
    return `nmap ${flags.join(' ')} ${t}`
  }

  const command = buildCommand()

  // ─── Estimate Scan Time ───────────────────────────────────────────────────
  const estimateScanTime = useCallback(() => {
    const selectedOptions = OPTIONS.filter(o => selected.has(o.id))
    const timeWeights = { fast: 1, medium: 2, slow: 4, 'very-slow': 8 }
    let totalWeight = 0
    
    for (const opt of selectedOptions) {
      if (opt.estimatedTime) {
        totalWeight += timeWeights[opt.estimatedTime] || 1
      }
    }
    
    // Base time: port count factor
    let portFactor = 1
    if (selected.has('allports')) portFactor = 10
    else if (selected.has('top1000')) portFactor = 2
    else if (selected.has('top100') || selected.has('fastports')) portFactor = 0.5
    
    const estimatedSeconds = totalWeight * portFactor * 30
    
    if (estimatedSeconds < 60) return '< 1 minute'
    if (estimatedSeconds < 300) return `${Math.round(estimatedSeconds / 60)} minutes`
    if (estimatedSeconds < 3600) return `${Math.round(estimatedSeconds / 60)} minutes`
    return `${Math.round(estimatedSeconds / 3600)} hours`
  }, [selected])

  // ─── Save / Load / Delete ────────────────────────────────────────────────
  const closeSaveDialog = () => {
    setShowSaveDialog(false)
    setCommandDescription('')
    setCommandTags([])
    setSaveError(null)
  }

  const saveCommand = () => {
    if (!target.trim()) {
      setSaveError('Please enter a target before saving.')
      return
    }
    setSaveError(null)
    
    const scanType = OPTIONS.filter(o => selected.has(o.id) && o.category === 'Scan Type')[0]?.label || 'Custom'
    
    const newCommand: SavedCommand = {
      id: crypto.randomUUID(),
      command,
      target: target.trim(),
      timestamp: Date.now(),
      options: Array.from(selected),
      description: commandDescription || undefined,
      tags: commandTags.length > 0 ? commandTags : undefined,
      scanType,
    }
    setSavedCommands(prev => [newCommand, ...prev].slice(0, MAX_SAVED_COMMANDS))
    closeSaveDialog()
  }

  const deleteSavedCommand = (id: string) => {
    setSavedCommands(prev => prev.filter(c => c.id !== id))
  }

  const loadSavedCommand = (cmd: SavedCommand) => {
    setTarget(cmd.target)
    setSelected(new Set(cmd.options))
    setActiveTab('builder')
  }

  const exportCommands = () => {
    const data = JSON.stringify(savedCommands)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nmap_commands_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importCommands = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (Array.isArray(data)) {
          setSavedCommands(prev => {
            const incomingIds = new Set(data.map((c: SavedCommand) => c.id).filter(Boolean))
            const filtered = prev.filter(c => !incomingIds.has(c.id))
            return [...data, ...filtered].slice(0, MAX_SAVED_COMMANDS)
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

  const pasteFromClipboard = async () => {
    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText()
        setNmapOutput(text)
        return
      } catch (err) {
        console.error('Clipboard read failed:', err)
      }
    }
    
    try {
      const el = document.createElement('textarea')
      el.style.position = 'fixed'
      el.style.opacity = '0'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.focus()
      const ok = document.execCommand('paste')
      if (ok) {
        setNmapOutput(el.value)
      } else {
        alert('Paste failed. Try Ctrl+V manually.')
      }
      document.body.removeChild(el)
    } catch (err) {
      console.error('Paste fallback failed:', err)
      alert('Paste failed. Try Ctrl+V manually.')
    }
  }

  // ─── Quick Launch (copy to terminal) ─────────────────────────────────────
  const launchInTerminal = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(command).then(
        () => {
          const status = document.createElement('div')
          status.className = 'fixed bottom-4 right-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-lg text-sm font-mono animate-fadeIn z-50'
          status.textContent = '✅ Command copied to clipboard — paste in terminal'
          document.body.appendChild(status)
          setTimeout(() => status.remove(), 3000)
        },
        () => {
          alert('Copy failed. Select and copy the command manually.')
        }
      )
    }
  }

  // ─── AI Analysis ──────────────────────────────────────────────────────────
  const analyzeOutput = async () => {
    if (!nmapOutput.trim()) return
    
    if (!ollamaAvailable) {
      setAnalysis({
        services: [],
        suggestions: [`⚠️ Ollama is not running (${ollamaError || 'connection failed'}). Please start Ollama and try again.`],
        tools: [],
        risks: [],
      })
      return
    }
    
    const myRequestId = ++analyzeRequestIdRef.current
    setAnalyzing(true)
    setAnalysis(null)

    try {
      const model = activeModel || 'qwen2.5-coder:3b'
      
      let text = (
        await ollamaChatOnce(
          model,
          [
            {
              role: 'system',
              content:
                'You are a penetration tester analyzing nmap output. Respond ONLY with valid JSON, no markdown or extra text. Keys: services (array of {port, service, version, state}), suggestions (array of strings), tools (array of tool names), risks (array of potential vulnerabilities), cveReferences (array of relevant CVEs if found), quickWins (array of quick win suggestions).',
            },
            {
              role: 'user',
              content: `Analyze this nmap output and return strict JSON:\n\n${nmapOutput}`,
            },
          ],
          { temperature: 0.35 },
        )
      ).trim()

      if (myRequestId !== analyzeRequestIdRef.current) return

      text = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim()

      try {
        const parsed = JSON.parse(text)
        if (myRequestId !== analyzeRequestIdRef.current) return
        setAnalysis(parsed)
        setScanStats(prev => ({
          totalScans: prev.totalScans + 1,
          totalPorts: prev.totalPorts + (parsed.services?.length || 0)
        }))
      } catch (jsonErr) {
        if (myRequestId !== analyzeRequestIdRef.current) return
        console.error('JSON Parse Error:', jsonErr)
        setAnalysis({
          services: [],
          suggestions: ['⚠️ Could not parse AI response. Please try again or check formatting.'],
          tools: [],
          risks: [],
        })
      }
    } catch (err) {
      if (myRequestId !== analyzeRequestIdRef.current) return
      console.error('Fetch Error:', err)
      setAnalysis({
        services: [],
        suggestions: [`❌ Failed to connect to Ollama or process response. ${err instanceof Error ? err.message : ''}`],
        tools: [],
        risks: [],
      })
    } finally {
      if (myRequestId === analyzeRequestIdRef.current) {
        setAnalyzing(false)
      }
    }
  }

  const explainCommand = async () => {
    if (!ollamaAvailable) {
      setAiExplain(`⚠️ Ollama is not running (${ollamaError || 'connection failed'}). Please start Ollama and try again.`)
      return
    }
    
    const myRequestId = ++explainRequestIdRef.current
    setLoadingAI(true)
    setAiExplain('')
    try {
      const model = activeModel || 'qwen2.5-coder:3b'
      const text = await ollamaChatOnce(
        model,
        [
          {
            role: 'system',
            content:
              'You are an nmap expert. Explain the command concisely in 3-4 sentences. Mention what each flag does and what to expect. Include beginner-friendly explanations.',
          },
          { role: 'user', content: `Explain this nmap command: ${command}` },
        ],
        { temperature: 0.45 },
      )
      if (myRequestId === explainRequestIdRef.current) {
        setAiExplain(text || 'No response.')
      }
    } catch (err) {
      if (myRequestId === explainRequestIdRef.current) {
        setAiExplain(`Error connecting to Ollama: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    } finally {
      if (myRequestId === explainRequestIdRef.current) {
        setLoadingAI(false)
      }
    }
  }

  // ─── Filtering ─────────────────────────────────────────────────────────────
  const filteredOptions = OPTIONS.filter(opt => {
    const matchSearch = opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        opt.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        opt.flag.toLowerCase().includes(searchTerm.toLowerCase())
    const matchCategory = filterCategory === 'All' || opt.category === filterCategory
    return matchSearch && matchCategory
  })

  const selectedTips = OPTIONS.filter(o => selected.has(o.id) && o.beginnerTip)
    .map(o => ({ label: o.label, tip: o.beginnerTip }))

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      'Scan Type': 'text-blue-400',
      'Ports': 'text-emerald-400',
      'Detection': 'text-amber-400',
      'Timing': 'text-purple-400',
      'Scripts': 'text-pink-400',
      'Output': 'text-orange-400',
      'Misc': 'text-white/40'
    }
    return colors[cat] || 'text-white/40'
  }

  // ─── All tags for filtering ──────────────────────────────────────────────
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    savedCommands.forEach(c => c.tags?.forEach(t => tags.add(t)))
    return Array.from(tags)
  }, [savedCommands])

  const filteredCommands = useMemo(() => {
    let cmds = savedCommands
    if (tagFilter !== 'all') {
      cmds = cmds.filter(c => c.tags?.includes(tagFilter))
    }
    return cmds
  }, [savedCommands, tagFilter])

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-cyan-500/20" style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.18), rgba(34,211,238,0.04))' }}>
            <Radar size={16} className="text-cyan-400" />
          </div>
          <div>
            <span className="text-white font-bold text-base">Scout</span>
            <div className="text-white/40 text-xs flex items-center gap-2">
              Reconnaissance & mapping · visual builder + output analyzer
              <OllamaStatusIndicator available={ollamaAvailable} model={activeModel || 'No model'} />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowBeginnerTips(!showBeginnerTips)} 
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20"
          >
            <BookOpen size={12} /> {showBeginnerTips ? 'Hide Tips' : 'Show Tips'}
          </button>
          <button 
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)} 
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20"
          >
            <Shield size={12} /> {showAdvancedOptions ? 'Hide Advanced' : 'Show Advanced'}
          </button>
          <button 
            onClick={() => setShowTemplatePicker(!showTemplatePicker)} 
            className="flex items-center gap-1.5 text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors px-3 py-1.5 rounded-full border border-cyan-500/20 hover:border-cyan-500/40"
          >
            <Layers size={12} /> Templates
          </button>
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
            ollamaAvailable === true ? 'border-emerald-500/30 text-emerald-400/70' : 'border-red-500/30 text-red-400/70'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${ollamaAvailable === true ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {ollamaAvailable === true ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="px-8 py-6 max-w-6xl mx-auto">

        {/* Ollama Offline Warning */}
        {ollamaAvailable === false && (
          <div className="mb-6 p-3 rounded-xl border border-red-500/20 bg-red-500/5 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle size={13} /> Ollama is not running at {process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}. AI features are disabled.
          </div>
        )}

        {/* Template Picker */}
        {showTemplatePicker && (
          <div className="mb-6 p-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-cyan-400 text-xs font-semibold tracking-wider flex items-center gap-2">
                <Layers size={14} /> Scan Templates
              </span>
              <button onClick={() => setShowTemplatePicker(false)} className="text-white/40 hover:text-white/60 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SCAN_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                  className="p-3 bg-white/5 border border-white/5 hover:border-cyan-500/30 rounded-xl text-left transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{template.icon}</span>
                    <span className="text-xs text-white font-semibold">{template.name}</span>
                  </div>
                  <div className="text-[10px] text-white/40 mt-0.5">{template.description}</div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <EstimatedTimeBadge time={template.estimatedTime} />
                    {template.bestFor.slice(0, 1).map(b => (
                      <span key={b} className="text-[8px] text-white/30 font-mono">#{b}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nmap Info Section */}
        <div className="mb-6">
          <button
            onClick={() => setShowNmapInfo(!showNmapInfo)}
            className="w-full flex items-center justify-between bg-white/5 border border-white/5 rounded-2xl px-5 py-3.5 hover:bg-white/10 transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <Info size={16} className="text-cyan-400" />
              <span className="text-cyan-400 font-mono text-sm font-bold">What Nmap Actually Is</span>
              <span className="text-white/30 text-xs font-mono ml-2">
                {showNmapInfo ? 'Click to collapse' : 'Click to expand'}
              </span>
            </div>
            <div className="text-white/30 group-hover:text-white/60 transition-colors">
              {showNmapInfo ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>
          
          {showNmapInfo && (
            <div className="bg-white/5 border border-white/5 border-t-0 rounded-b-2xl p-5 space-y-3 text-xs text-white/70 leading-relaxed">
              <div className="text-cyan-400 font-mono font-bold text-sm">What Nmap Actually Is</div>
              <p>
                Nmap ("Network Mapper") is a raw-socket-level network scanner. At the lowest level it crafts and sends
                individual TCP/UDP/ICMP packets, then infers host and port state from the responses — or lack thereof.
                Every scan type in this tool (SYN, ACK, NULL, Xmas...) is really just a different combination of TCP
                flags sent to see how the target's stack reacts. It doesn't "hack" anything by itself — it's a mapping
                and enumeration tool, the reconnaissance phase of a pentest methodology, not an exploitation tool.
              </p>
              <div className="text-cyan-400 font-mono font-bold text-sm pt-1">Why It Matters</div>
              <p>
                Every real penetration test starts with knowing what's actually reachable and what's running on it.
                Nmap answers three questions professionals build everything else on: what hosts are alive, what ports
                are open on them, and what service/version is bound to each port. Getting this step wrong — missing a
                filtered port, misreading a firewall's ACK-drop behavior as "closed" — cascades into every later phase
                of the assessment being built on bad data.
              </p>
              <div className="text-cyan-400 font-mono font-bold text-sm pt-1">How Professionals Actually Use It</div>
              <p>
                Real engagements almost never use a single nmap invocation. The typical pattern: a fast, wide sweep
                first (top-1000 ports, many hosts) to find what's alive, then a slower, deep, full-port + version +
                script scan (-p- -sV -sC) narrowed to the interesting hosts found in step one. -A is convenient for
                learning but professionals rarely reach for it blind in production engagements — its combination of OS
                detection + default scripts + traceroute is loud and often more than the scope calls for. Output is
                almost always saved with -oA so results are re-parseable by other tools later (searchsploit, custom
                scripts, or importing into Metasploit).
              </p>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-6 flex-wrap">
          {(['builder', 'analyzer', 'history'] as const).map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)} 
              className={`px-4 py-2 text-xs font-mono rounded-xl transition-colors flex items-center gap-1.5 ${
                activeTab === tab 
                  ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400' 
                  : 'text-white/40 hover:text-white/80 border border-white/5 hover:border-white/20'
              }`}
            >
              {tab === 'builder' && <Network size={12} />}
              {tab === 'analyzer' && <BarChart3 size={12} />}
              {tab === 'history' && <Clock size={12} />}
              {tab === 'builder' ? 'Command Builder' : tab === 'analyzer' ? 'Output Analyzer' : 'History'}
              {tab === 'history' && savedCommands.length > 0 && (
                <span className="text-[10px] bg-cyan-500/20 px-1.5 py-0.5 rounded-full text-cyan-400">
                  {savedCommands.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── BUILDER TAB ── */}
        {activeTab === 'builder' && (
          <div className="space-y-4">
            {/* Stats Bar */}
            <div className="flex gap-4 text-xs text-white/40 font-mono bg-white/5 border border-white/5 rounded-2xl p-3 flex-wrap">
              <span>Selected: {selected.size} options</span>
              <span className="text-white/20">•</span>
              <span>Total Flags: {OPTIONS.filter(o => selected.has(o.id)).length}</span>
              <span className="text-white/20">•</span>
              <span>Saved: {savedCommands.length} commands</span>
              <span className="text-white/20">•</span>
              <span className="flex items-center gap-1">
                <Timer size={11} className="text-cyan-400" /> Est: {estimateScanTime()}
              </span>
            </div>

            {/* Target input with quick actions */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px] flex gap-2">
                <input 
                  value={target} 
                  onChange={e => setTarget(e.target.value)} 
                  placeholder="Target IP or hostname — e.g. 10.10.10.1 or example.com" 
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white/80 text-sm font-mono focus:outline-none focus:border-cyan-500/30 placeholder-white/20 transition-colors" 
                />
                <button 
                  onClick={() => setSelected(new Set(['sS','top1000','T4']))} 
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-red-400 transition-colors px-3 py-2 border border-white/10 rounded-xl hover:border-red-500/30"
                >
                  <RotateCcw size={11} /> Reset
                </button>
              </div>
              <button 
                onClick={launchInTerminal}
                disabled={!target.trim()}
                className="flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 hover:border-emerald-500/30 px-3 py-2 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white/60 hover:text-emerald-400"
              >
                <Terminal size={12} /> Launch
              </button>
              <button 
                onClick={() => setShowSaveDialog(true)} 
                disabled={!target.trim()}
                className="flex items-center gap-1.5 text-xs bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 px-3 py-2 border border-cyan-500/30 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save size={12} /> Save
              </button>
            </div>

            {/* Save Dialog */}
            {showSaveDialog && (
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-xs font-mono">Save Command</span>
                  <button onClick={closeSaveDialog} className="text-white/40 hover:text-white/60 transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <input
                  value={commandDescription}
                  onChange={e => setCommandDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2 text-xs font-mono text-white/80 focus:outline-none focus:border-cyan-500/30 placeholder-white/20"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-white/30 text-[10px] font-mono">Tags:</span>
                  {['scan', 'pentest', 'ctf', 'recon', 'exploit', 'vuln'].map(tag => (
                    <button
                      key={tag}
                      onClick={() => {
                        setCommandTags(prev => 
                          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                        )
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                        commandTags.includes(tag)
                          ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400'
                          : 'border-white/10 text-white/40 hover:text-white/60'
                      }`}
                    >
                      <Tag size={10} className="inline mr-0.5" /> {tag}
                    </button>
                  ))}
                </div>
                {saveError && <div className="text-red-400 text-xs mt-2">{saveError}</div>}
                <div className="flex gap-2 mt-2">
                  <button onClick={saveCommand} className="px-4 py-1.5 bg-cyan-500 text-black text-xs font-mono font-bold rounded-xl hover:opacity-90 transition-opacity">
                    Save
                  </button>
                  <button onClick={closeSaveDialog} className="px-4 py-1.5 border border-white/10 text-white/40 text-xs font-mono rounded-xl hover:bg-white/5 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Search and Filter */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[150px] relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search options..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-cyan-500/30 placeholder-white/20"
                />
              </div>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-cyan-500/30"
              >
                <option value="All" style={{ background: '#0d1022' }}>All Categories</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat} style={{ background: '#0d1022' }}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Beginner Tips Panel */}
            {showBeginnerTips && (
              <div className="p-4 rounded-2xl border border-amber-500/10 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-2.5">
                  <BookOpen size={16} className="text-amber-400" />
                  <span className="text-amber-400 text-xs font-semibold tracking-wider">Nmap Beginner Tips</span>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-white/60">
                  {[
                    'Start with Quick Recon preset for initial scanning',
                    'Always save output with -oA flag for later analysis',
                    'Use -Pn for hosts that don\'t respond to ping',
                    'Combine -sV with --script=vuln for vulnerability discovery',
                    'Always verify vuln script hits manually before reporting'
                  ].map((tip, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-400 mt-0.5">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Options by category */}
            <div className="space-y-3">
              {CATEGORIES.filter(cat => filterCategory === 'All' || cat === filterCategory).map(cat => {
                const catOpts = filteredOptions.filter(o => o.category === cat)
                if (catOpts.length === 0) return null
                const isOpen = expandedCats.has(cat)
                const selCount = catOpts.filter(o => selected.has(o.id)).length
                return (
                  <div key={cat} className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all">
                    <button onClick={() => toggleCat(cat)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors">
                      <span className={`font-mono text-xs font-bold flex-1 text-left ${getCategoryColor(cat)}`}>{cat}</span>
                      {selCount > 0 && <span className="text-xs text-cyan-400 font-mono">{selCount} selected</span>}
                      {isOpen ? <ChevronUp size={14} className="text-white/30" /> : <ChevronDown size={14} className="text-white/30" />}
                    </button>
                    {isOpen && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-3 border-t border-white/5">
                        {catOpts.map(opt => (
                          <button 
                            key={opt.id} 
                            onClick={() => toggle(opt.id)} 
                            className={`flex items-start gap-2.5 p-3 rounded-xl text-left transition-all ${
                              selected.has(opt.id) 
                                ? 'bg-cyan-500/10 border border-cyan-500/30' 
                                : 'hover:bg-white/5 border border-transparent'
                            }`}
                          >
                            <div className={`w-4 h-4 mt-0.5 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                              selected.has(opt.id) 
                                ? 'bg-cyan-500 border-cyan-500' 
                                : 'border-white/20'
                            }`}>
                              {selected.has(opt.id) && <Check size={10} className="text-black" strokeWidth={3} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-mono ${selected.has(opt.id) ? 'text-cyan-400' : 'text-white/80'}`}>
                                {opt.label}
                              </div>
                              <div className="text-white/40 text-xs leading-tight">{opt.description}</div>
                              <code className="text-emerald-400 text-[10px]">{opt.flag}</code>
                              {opt.estimatedTime && (
                                <span className="ml-1"><EstimatedTimeBadge time={opt.estimatedTime} /></span>
                              )}
                              {showBeginnerTips && opt.beginnerTip && (
                                <div className="text-amber-400/80 text-[10px] mt-1 flex items-start gap-1">
                                  <Zap size={10} className="mt-0.5 flex-shrink-0" /> {opt.beginnerTip}
                                </div>
                              )}
                              {showAdvancedOptions && opt.advancedNote && (
                                <div className="text-cyan-400/80 text-[10px] mt-1 flex items-start gap-1">
                                  <Shield size={10} className="mt-0.5 flex-shrink-0" /> {opt.advancedNote}
                                </div>
                              )}
                              {showAdvancedOptions && opt.detectionNote && (
                                <div className="text-red-400/70 text-[10px] mt-1 flex items-start gap-1">
                                  <Search size={10} className="mt-0.5 flex-shrink-0" /> <span><strong>Detection: </strong>{opt.detectionNote}</span>
                                </div>
                              )}
                              {showAdvancedOptions && opt.examples && (
                                <div className="text-white/40 text-[10px] mt-1">
                                  Examples: {opt.examples.map((ex, i) => (
                                    <code key={i} className="text-emerald-400 mx-1">{ex}</code>
                                  ))}
                                </div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Selected Options Tips */}
            {showBeginnerTips && selectedTips.length > 0 && (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                <div className="text-cyan-400 text-xs font-mono font-bold mb-2">Selected Options Tips</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {selectedTips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-cyan-400 mt-0.5 flex-shrink-0">•</span>
                      <div>
                        <span className="text-white font-mono">{tip.label}:</span>
                        <span className="text-white/40"> {tip.tip}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generated command */}
            <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                <span className="text-cyan-400 text-xs font-mono font-bold flex items-center gap-1.5">
                  <Terminal size={12} /> Generated Command
                </span>
                <div className="flex gap-3 flex-wrap">
                  <button onClick={explainCommand} disabled={loadingAI || !ollamaAvailable} className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 disabled:opacity-40 transition-colors font-mono">
                    <Sparkles size={11} />{loadingAI ? 'Explaining...' : 'Explain'}
                  </button>
                  <button onClick={() => setActiveTab('history')} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/80 transition-colors font-mono">
                    <History size={11} /> Saved
                  </button>
                  <CopyBtn text={command} />
                </div>
              </div>
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 font-mono text-sm text-emerald-400 break-all">
                {command}
              </div>
              {aiExplain && (
                <div className="mt-3 p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl text-sm text-white/70 leading-relaxed">
                  <span className="text-purple-400 font-mono text-xs">🤖 </span>{aiExplain}
                </div>
              )}
              {!ollamaAvailable && (
                <div className="mt-2 text-amber-400 text-xs flex items-center gap-1">
                  <AlertCircle size={12} /> Ollama not running — AI features disabled
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                <div className="text-white/40">Total Options</div>
                <div className="text-cyan-400 font-bold">{selected.size}</div>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                <div className="text-white/40">Saved Commands</div>
                <div className="text-cyan-400 font-bold">{savedCommands.length}</div>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                <div className="text-white/40">Total Scans</div>
                <div className="text-cyan-400 font-bold">{scanStats.totalScans}</div>
              </div>
              <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
                <div className="text-white/40">Est. Time</div>
                <div className="text-cyan-400 font-bold">{estimateScanTime()}</div>
              </div>
            </div>

            {/* Nmap Lab Exercises */}
            {showBeginnerTips && (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3">
                <div className="text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5">
                  <Wrench size={12} /> Lab Exercises — Do These, Don't Just Read Them
                </div>

                <div className="text-xs">
                  <div className="text-cyan-400 font-bold mb-1">Level 1 — Mechanism check (no target needed)</div>
                  <p className="text-white/40">
                    Without running anything: for -sS, -sT, -sN, and -sA, write out (on paper, not here) what
                    packet nmap sends first and what response it needs to call a port "open" vs "closed" vs
                    "filtered" for each. Then toggle Show Advanced on those four options and check yourself. If you
                    got -sN wrong, re-read why Windows targets break NULL/FIN/Xmas scans before moving on —
                    that's a common gap.
                  </p>
                </div>

                <div className="text-xs">
                  <div className="text-cyan-400 font-bold mb-1">Level 2 — Own network, packet capture</div>
                  <p className="text-white/40">
                    Spin up a local VM (or scan a spare device on your own LAN — never anything you don't own).
                    Run Wireshark capturing on the interface, then run a plain -sS scan against it from another
                    machine. Find the SYN, the SYN/ACK, and the RST nmap sends instead of completing the
                    handshake. Then repeat with -sT and confirm you now see a full 3-way handshake plus a FIN to
                    close it. This is the single most useful 30 minutes you can spend to stop memorizing "SYN
                    scan is stealthy" and start knowing why.
                  </p>
                </div>

                <div className="text-xs">
                  <div className="text-cyan-400 font-bold mb-1">Level 3 — Full methodology on a lab box</div>
                  <p className="text-white/40">
                    Against a HackTheBox/TryHackMe target or a deliberately vulnerable VM (Metasploitable2, GOAD if
                    you're on AD): run a fast top-1000 scan first, note what's open, then run -p- -sV -sC only
                    against those hosts. Compare total scan time between the two approaches. Then for one open
                    port, manually verify one -sC/-sV finding by connecting to the service yourself (e.g. netcat
                    to grab a banner) rather than trusting nmap's output blindly — this is the habit that separates
                    "ran a tool" from "verified a finding."
                  </p>
                </div>

                <div className="text-xs">
                  <div className="text-cyan-400 font-bold mb-1">Level 4 — Troubleshooting exercise</div>
                  <p className="text-white/40">
                    You scan a host and every single port shows "filtered". List three distinct possible causes
                    before reading further (host down, ICMP blocked but ports open, aggressive stateful firewall
                    dropping everything, wrong IP/interface, rate limiting..." — then for each one, name the single
                    next nmap flag or technique you'd try to distinguish between them. If you can't get past one
                    cause, that's a sign to revisit host discovery (-Pn) and firewall/ACK-scan fundamentals before
                    moving to Active Directory or web topics.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ANALYZER TAB ── */}
        {activeTab === 'analyzer' && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-white/40 text-xs font-mono">Paste nmap output below</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setNmapOutput('')} 
                    className="text-xs text-white/40 hover:text-red-400 transition-colors font-mono"
                  >
                    Clear
                  </button>
                  <button 
                    onClick={pasteFromClipboard}
                    className="text-xs text-white/40 hover:text-cyan-400 transition-colors font-mono"
                  >
                    Paste from Clipboard
                  </button>
                </div>
              </div>
              <textarea 
                value={nmapOutput} 
                onChange={e => setNmapOutput(e.target.value)} 
                placeholder={`Paste your nmap scan output here...\n\nExample:\nNmap scan report for 10.10.10.1\nPORT STATE SERVICE VERSION\n22/tcp open ssh OpenSSH 7.4\n80/tcp open http Apache 2.4.6\n445/tcp open smb Samba 4.x`} 
                rows={10} 
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-emerald-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30 placeholder-white/20 resize-none transition-colors" 
              />
              <div className="flex justify-between mt-2 flex-wrap gap-2">
                <div className="text-white/40 text-xs font-mono">
                  {nmapOutput.length > 0 && `${nmapOutput.split('\n').length} lines, ${nmapOutput.length} characters`}
                </div>
                <button 
                  onClick={analyzeOutput} 
                  disabled={analyzing || !nmapOutput.trim() || !ollamaAvailable} 
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-black text-xs font-mono font-bold rounded-xl hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  <Cpu size={12} />{analyzing ? 'Analyzing...' : 'Analyze Output'}
                </button>
              </div>
              {!ollamaAvailable && (
                <div className="mt-2 text-amber-400 text-xs flex items-center gap-1">
                  <AlertCircle size={12} /> Ollama not running — analysis disabled
                </div>
              )}
            </div>

            {analyzing && (
              <div className="flex items-center justify-center py-8 gap-3">
                {[0,150,300].map(d => (
                  <div key={d} className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: d + 'ms' }} />
                ))}
                <span className="text-white/40 text-sm font-mono animate-pulse">AI analyzing nmap output...</span>
              </div>
            )}

            {analysis && (
              <div className="space-y-3">
                {/* Services table */}
                {(analysis.services?.length ?? 0) > 0 && (
                  <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/5 text-cyan-400 text-xs font-mono font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5"><Target size={12} /> Discovered Services</span>
                      <span className="text-white/40 font-normal">{analysis.services.length} ports found</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="border-b border-white/5">
                            {['Port','Service','Version','State'].map(h => (
                              <th key={h} className="text-left px-5 py-2.5 text-white/40 font-normal">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.services.map((s, i) => (
                            <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                              <td className="px-5 py-2.5 text-cyan-400">{s.port}</td>
                              <td className="px-5 py-2.5 text-white/80">{s.service}</td>
                              <td className="px-5 py-2.5 text-white/40">{s.version || '—'}</td>
                              <td className="px-5 py-2.5">
                                <span className={s.state === 'open' ? 'text-emerald-400' : s.state === 'filtered' ? 'text-amber-400' : 'text-red-400'}>
                                  {s.state}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Next steps */}
                  {(analysis.suggestions?.length ?? 0) > 0 && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4">
                      <div className="text-emerald-400 text-xs font-mono font-bold mb-2 flex items-center gap-1.5">
                        <Target size={12} /> Next Steps
                      </div>
                      <ul className="space-y-1">
                        {analysis.suggestions?.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                            <span className="text-emerald-400 mt-0.5 flex-shrink-0">›</span>{s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Quick Wins */}
                  {(analysis.quickWins?.length ?? 0) > 0 && (
                    <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                      <div className="text-cyan-400 text-xs font-mono font-bold mb-2 flex items-center gap-1.5">
                        <Zap size={12} /> Quick Wins
                      </div>
                      <ul className="space-y-1">
                        {analysis.quickWins?.map((q, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                            <span className="text-cyan-400 mt-0.5 flex-shrink-0">›</span>{q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Tools */}
                {(analysis.tools?.length ?? 0) > 0 && (
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                    <div className="text-cyan-400 text-xs font-mono font-bold mb-2 flex items-center gap-1.5">
                      <Wrench size={12} /> Recommended Tools
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.tools?.map((t, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full font-mono text-cyan-400">{t}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risks with CVE references */}
                {(analysis.risks?.length ?? 0) > 0 && (
                  <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4">
                    <div className="text-red-400 text-xs font-mono font-bold mb-2 flex items-center gap-1.5">
                      <AlertCircle size={12} /> Potential Vulnerabilities
                    </div>
                    <ul className="space-y-1">
                      {analysis.risks.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-white/70">
                          <span className="text-red-400 mt-0.5 flex-shrink-0">!</span>{r}
                        </li>
                      ))}
                    </ul>
                    {analysis.cveReferences && analysis.cveReferences.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-red-500/20">
                        <div className="text-red-400 text-xs font-mono font-bold">CVE References:</div>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {analysis.cveReferences.map((cve, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded-full font-mono text-red-400">{cve}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-white/40 text-xs font-mono">
                {savedCommands.length} saved commands
              </div>
              <div className="flex gap-2 flex-wrap">
                {allTags.length > 0 && (
                  <select
                    value={tagFilter}
                    onChange={e => setTagFilter(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-cyan-500/30"
                  >
                    <option value="all" style={{ background: '#0d1022' }}>All tags</option>
                    {allTags.map(tag => (
                      <option key={tag} value={tag} style={{ background: '#0d1022' }}>#{tag}</option>
                    ))}
                  </select>
                )}
                <button 
                  onClick={exportCommands} 
                  disabled={savedCommands.length === 0}
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
                  onChange={importCommands}
                  className="hidden"
                />
              </div>
            </div>

            {filteredCommands.length === 0 ? (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-12 text-center">
                <History size={32} className="text-white/20 mx-auto mb-3" />
                <div className="text-white/40 text-sm font-mono">
                  {savedCommands.length === 0 ? 'No saved commands yet' : 'No commands with selected tag'}
                </div>
                <div className="text-white/20 text-xs mt-1">
                  {savedCommands.length === 0 ? 'Build a command in the Builder tab and save it' : 'Try changing the tag filter'}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCommands.map(cmd => (
                  <div key={cmd.id} className="bg-white/5 border border-white/5 rounded-xl p-4 hover:border-cyan-500/20 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {cmd.description && (
                          <div className="text-white/60 text-xs font-semibold mb-1">{cmd.description}</div>
                        )}
                        <div className="text-emerald-400 text-xs font-mono break-all">{cmd.command}</div>
                        <div className="flex items-center gap-3 mt-1 text-white/40 text-xs font-mono flex-wrap">
                          <span>🎯 {cmd.target}</span>
                          <span className="text-white/20">•</span>
                          <span>{new Date(cmd.timestamp).toLocaleString()}</span>
                          <span className="text-white/20">•</span>
                          <span>{cmd.options.length} flags</span>
                          {cmd.scanType && <span className="text-cyan-400">• {cmd.scanType}</span>}
                          {cmd.tags && cmd.tags.length > 0 && (
                            <span className="flex gap-1">
                              {cmd.tags.map(tag => (
                                <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full font-mono text-cyan-400">#{tag}</span>
                              ))}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button 
                          onClick={() => loadSavedCommand(cmd)} 
                          className="p-1.5 rounded-lg text-white/30 hover:text-cyan-400 transition-colors"
                          aria-label="Load this command"
                        >
                          <Play size={14} />
                        </button>
                        <button 
                          onClick={() => deleteSavedCommand(cmd.id)} 
                          className="p-1.5 rounded-lg text-white/30 hover:text-red-400 transition-colors"
                          aria-label="Delete this command"
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