import { useState, useEffect, useRef } from 'react'
import { 
  Network, Copy, Check, RotateCcw, Cpu, ChevronDown, ChevronUp, 
  BookOpen, Zap, Save, Upload, Download, History, Trash2,
  Search, Shield,
  BarChart3, Clock, 
  Play, 
  Sparkles, X, Info
} from 'lucide-react'
import { ollamaChatOnce } from '../../lib/ollama'

// Fallback for useActiveModel hook when the shared hook is not available.
// Keeps this component self-contained so it won't error during builds/tests.
function useActiveModel() {
  // Return a sensible default model identifier used by ollamaChatOnce elsewhere
  return 'ollama/gpt-4o-mini'
}

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
}

const OPTIONS: Option[] = [
  // Scan types
  { id: 'sS', label: 'SYN Scan (Stealth)', flag: '-sS', description: 'Half-open scan, stealthy, requires root', category: 'Scan Type', conflictsWith: ['sT','sU'], beginnerTip: 'Default scan type for most situations. Sends SYN packets but doesn\'t complete TCP handshake.', advancedNote: 'Requires root (raw socket access to craft the SYN packet directly). Mechanism: nmap sends SYN, if it gets SYN/ACK back the port is open and nmap immediately sends RST instead of completing the handshake with ACK — so the connection is never fully established at the OS/application layer.', detectionNote: 'Called "stealth" for historical reasons only — modern IDS/IPS (Snort, Suricata) and stateful firewalls log half-open connections just as easily as full ones. A burst of SYNs to sequential ports from one source in a short window is a textbook port-scan signature regardless of scan type. It\'s marginally quieter than -sT because it never touches the application layer (so app-level logs, e.g. a web server access log, show nothing) — but the network layer sees it clearly.' },
  { id: 'sT', label: 'TCP Connect Scan', flag: '-sT', description: 'Full TCP connect, no root needed', category: 'Scan Type', conflictsWith: ['sS'], beginnerTip: 'Use when SYN scan is blocked. Completes full TCP connection but less stealthy.', advancedNote: 'Uses the OS\'s normal connect() syscall, so it completes the full three-way handshake (SYN, SYN/ACK, ACK) like any real client application would.', detectionNote: 'Because it completes the handshake, it shows up in application-layer logs too — e.g. a completed-then-immediately-closed connection in a web server or SSH daemon log, not just a firewall/netflow record. This is the scan type you\'re forced into on shared hosting/cloud accounts where you don\'t have raw-socket privileges.' },
  { id: 'sU', label: 'UDP Scan', flag: '-sU', description: 'Scan UDP ports (slower)', category: 'Scan Type', beginnerTip: 'Required for DNS (53), SNMP (161), DHCP (67/68). Slower due to UDP nature.', advancedNote: 'UDP has no handshake, so nmap infers state from the response (or lack of one): an ICMP port-unreachable means closed, any UDP response means open, and silence means open|filtered — nmap genuinely cannot tell those two apart without a protocol-specific probe, which is why -sU is slow and often ambiguous.', detectionNote: 'Rate-limited ICMP unreachable responses on most OSes (Linux defaults to ~1/sec) are the main reason UDP scans take forever — that same rate limit is also a detection signal for defenders watching for a sudden spike in outbound ICMP unreachables from one host.' },
  { id: 'sA', label: 'ACK Scan', flag: '-sA', description: 'Map firewall rules', category: 'Scan Type', beginnerTip: 'Used for firewall rule detection. Doesn\'t determine port state.', advancedNote: 'Sends only an ACK with no prior SYN. A stateless firewall/router will let it through and the OS behind it replies RST regardless of port state (since ACK-only isn\'t a valid handshake step) — nmap reads that RST as "unfiltered". No RST at all means something stateful is dropping it, i.e. "filtered". This tells you about the firewall, not the service.', detectionNote: 'An ACK with no preceding SYN in the connection table is anomalous to any stateful firewall or IDS — it will either be silently dropped (which is itself the "filtered" signal nmap is reading) or flagged as an out-of-state packet in firewall logs.' },
  { id: 'sN', label: 'NULL Scan', flag: '-sN', description: 'Stealthy, bypasses some firewalls', category: 'Scan Type', beginnerTip: 'Sends TCP packets with no flags set. Evasion technique for older firewalls.', advancedNote: 'Relies on RFC 793: a closed port must respond RST to any non-SYN segment with no flags set, while an open port on a compliant stack silently drops it. This distinction only exists on Unix-like TCP/IP stacks — Windows ignores the RFC here and returns RST for everything, making NULL/FIN/Xmas scans useless against Windows targets.', detectionNote: 'A TCP segment with zero flags set is not something any legitimate application ever sends — any signature-based IDS flags it immediately. This is an academically interesting evasion against 1990s-era stateless packet filters, not a real stealth technique against a modern network.' },
  { id: 'sX', label: 'XMAS Scan', flag: '-sX', description: 'Sets FIN, PSH, URG flags', category: 'Scan Type', beginnerTip: 'Named for Christmas tree packet. Good for bypassing some packet filters.', advancedNote: 'Same RFC 793 logic as NULL scan (closed=RST, open=silence on compliant Unix stacks), just with FIN+PSH+URG set instead of nothing. Same Windows blind-spot applies.', detectionNote: 'FIN+PSH+URG together is an invalid, physically-impossible-in-normal-traffic flag combination — even more obviously anomalous to an IDS than a NULL packet, since a real TCP stack never legitimately produces this combination.' },
  
  // Port selection
  { id: 'top100', label: 'Top 100 Ports', flag: '--top-ports 100', description: 'Scan 100 most common ports', category: 'Ports', conflictsWith: ['top1000','allports','fastports'], beginnerTip: 'Fast initial scan. Covers ~95% of common services.' },
  { id: 'top1000', label: 'Top 1000 Ports', flag: '--top-ports 1000', description: 'Default nmap port range', category: 'Ports', conflictsWith: ['top100','allports','fastports'], beginnerTip: 'Nmap\'s default scan. Good balance of speed and coverage.' },
  { id: 'allports',label: 'All 65535 Ports', flag: '-p-', description: 'Full port scan (slower)', category: 'Ports', conflictsWith: ['top100','top1000','fastports'], beginnerTip: 'Thorough scan for hidden services. Takes much longer.' },
  { id: 'fastports',label: 'Fast Scan (-F)', flag: '-F', description: 'Top 100 ports, faster', category: 'Ports', conflictsWith: ['top100','top1000','allports'], beginnerTip: 'Even faster than --top-ports 100. Good for quick checks.' },
  { id: 'customports',label: 'Custom Ports', flag: '-p 22,80,443', description: 'Scan specific ports', category: 'Ports', beginnerTip: 'Use when you know target ports. Format: -p 22,80,443 or -p 1-1000', examples: ['-p 22,80,443', '-p 1-1000', '-p U:53,111,T:22,80'] },
  
  // Detection
  { id: 'sV', label: 'Version Detection', flag: '-sV', description: 'Detect service versions', category: 'Detection', beginnerTip: 'Identifies exact software versions. Required for vulnerability matching.', advancedNote: 'Uses probes to identify service versions. Adds time to scan.' },
  { id: 'O', label: 'OS Detection', flag: '-O', description: 'Detect OS (requires root)', category: 'Detection', beginnerTip: 'Identifies target OS. Helps tailor exploitation techniques.' },
  { id: 'A', label: 'Aggressive Scan', flag: '-A', description: '-sV -O --script=default -traceroute', category: 'Detection', beginnerTip: 'All-in-one scan. Combines version detection, OS detection, and default scripts.', advancedNote: 'Most comprehensive single flag. May be detected by IDS.' },
  
  // Timing
  { id: 'T1', label: 'T1 — Sneaky', flag: '-T1', description: 'Very slow, evades IDS', category: 'Timing', conflictsWith: ['T2','T3','T4','T5'], beginnerTip: 'For heavily monitored networks. Sends 5min intervals between packets.', detectionNote: 'Slow timing evades threshold-based alerting (e.g. "more than N SYNs from one IP in 60s"), not the scan itself — the packets still look identical to -T3 packets, they\'re just spread out. A defender correlating over hours/days instead of minutes still catches it; this buys time, it doesn\'t make the traffic invisible.' },
  { id: 'T2', label: 'T2 — Polite', flag: '-T2', description: 'Slow, less bandwidth', category: 'Timing', conflictsWith: ['T1','T3','T4','T5'], beginnerTip: 'Slower scan to avoid overwhelming targets. 15s between probes.' },
  { id: 'T3', label: 'T3 — Normal', flag: '-T3', description: 'Default timing', category: 'Timing', conflictsWith: ['T1','T2','T4','T5'], beginnerTip: 'Default timing. Good balance of speed and stealth.' },
  { id: 'T4', label: 'T4 — Aggressive',flag: '-T4', description: 'Faster, assumes good network', category: 'Timing', conflictsWith: ['T1','T2','T3','T5'], beginnerTip: 'Fast scan for good network conditions. May overwhelm slow connections.' },
  { id: 'T5', label: 'T5 — Insane', flag: '-T5', description: 'Fastest, may miss ports', category: 'Timing', conflictsWith: ['T1','T2','T3','T4'], beginnerTip: 'Maximum speed. Only for very fast networks. High chance of missing ports.', detectionNote: 'Ironically the loudest and easiest to detect option in the whole tool — a burst of thousands of packets/sec to one host is unmissable on any netflow dashboard. Fast ≠ stealthy; these are opposite ends of the same tradeoff, never confuse them.' },
  
  // Scripts
  { id: 'sc', label: 'Default Scripts', flag: '-sC', description: 'Run default NSE scripts', category: 'Scripts', beginnerTip: 'Runs safe default scripts. Good starting point for enumeration.', advancedNote: 'Equivalent to --script=default. Each script is written in Lua and tagged by category (safe, intrusive, vuln, auth, brute, discovery...); "default" only pulls scripts tagged safe+non-destructive, which is why it\'s the sane default to combine with -sV.' },
  { id: 'vuln', label: 'Vuln Scripts', flag: '--script=vuln', description: 'Run vulnerability detection NSE', category: 'Scripts', beginnerTip: 'Checks for known vulnerabilities. Can be intrusive.', detectionNote: 'These scripts send crafted probes matching known CVE signatures — they generate very recognizable payloads (e.g. the MS17-010 check sends a specific malformed SMB transaction). Any IDS with vuln-scanner signatures (which is most of them) flags this category by name, unlike a plain SYN scan which just looks like generic recon.', advancedNote: 'False positives happen — a vuln script matching on a banner string can flag a patched system that simply didn\'t change its version string. Always confirm a vuln script hit manually before reporting it; this is a classic mistake beginners make (reporting a script hit as confirmed without independent verification).' },
  { id: 'auth', label: 'Auth Scripts', flag: '--script=auth', description: 'Test authentication', category: 'Scripts', beginnerTip: 'Tests authentication bypasses. May lock accounts.' },
  { id: 'brute', label: 'Brute Scripts', flag: '--script=brute', description: 'Brute force credentials', category: 'Scripts', beginnerTip: 'Performs brute force attacks. Risk of account lockouts.', detectionNote: 'Guaranteed to trigger authentication-failure alerting and account lockout policies on any properly configured target — this is the loudest, least deniable category in the entire tool. Never run this outside an explicit, written scope authorization; a lockout can constitute a denial-of-service against a real business system.' },
  { id: 'http', label: 'HTTP Scripts', flag: '--script=http-enum', description: 'Enumerate HTTP directories', category: 'Scripts', beginnerTip: 'Finds web directories and files. Good for web app testing.', advancedNote: 'http-enum works off a bundled wordlist of common paths — it\'s a coarse first pass, not a replacement for a proper content-discovery tool like ffuf or gobuster with a larger, purpose-built wordlist.' },
  { id: 'smb', label: 'SMB Scripts', flag: '--script=smb-enum-shares,smb-vuln-ms17-010', description: 'SMB enumeration + EternalBlue check', category: 'Scripts', beginnerTip: 'Essential for Windows targets. Checks for MS17-010 (EternalBlue).', advancedNote: 'smb-vuln-ms17-010 only checks for the vulnerability signature — it does not exploit it. Confirming a vulnerable host still requires a separate exploitation step (e.g. via Metasploit\'s ms17_010 modules) in an authorized engagement.' },
  
  // Output
  { id: 'oN', label: 'Save Normal Output', flag: '-oN output.txt', description: 'Save to output.txt', category: 'Output', beginnerTip: 'Human-readable output. Good for manual review.' },
  { id: 'oX', label: 'Save XML Output', flag: '-oX output.xml', description: 'Save XML for tools', category: 'Output', beginnerTip: 'Machine-readable. Import into other tools.' },
  { id: 'oG', label: 'Save Grepable', flag: '-oG output.gnmap',description: 'Grepable format', category: 'Output', beginnerTip: 'Simple format for grep searches. Good for scripting.' },
  { id: 'oA', label: 'Save All Formats', flag: '-oA output', description: 'Save all 3 formats', category: 'Output', beginnerTip: 'Creates .nmap, .xml, and .gnmap files. Best practice.' },
  
  // Misc
  { id: 'v', label: 'Verbose', flag: '-v', description: 'Verbose output', category: 'Misc', beginnerTip: 'Shows results in real-time. Good for monitoring progress.' },
  { id: 'vv', label: 'Very Verbose', flag: '-vv', description: 'Extra verbose output', category: 'Misc', beginnerTip: 'Shows all scan details. Useful for troubleshooting.' },
  { id: 'n', label: 'No DNS', flag: '-n', description: 'Skip DNS resolution (faster)',category: 'Misc', beginnerTip: 'Skip reverse DNS lookups. Speeds up scan significantly.' },
  { id: 'Pn', label: 'Skip Host Disc', flag: '-Pn', description: 'Treat host as online', category: 'Misc', beginnerTip: 'Skip host discovery. Use when hosts don\'t respond to pings.' },
  { id: 'min', label: 'Min Rate 1000', flag: '--min-rate 1000', description: 'Send 1000+ packets/sec', category: 'Misc', beginnerTip: 'Force faster scanning. Bypasses timing templates.' },
  { id: 'max', label: 'Max Retries 1', flag: '--max-retries 1', description: 'Limit retransmissions', category: 'Misc', beginnerTip: 'Reduce retries for faster scans. May miss ports.' },
  { id: 'scan-delay', label: 'Scan Delay',flag: '--scan-delay 5s', description: 'Add delay between probes', category: 'Misc', beginnerTip: 'Evade rate-limiting. Use --scan-delay 5s or higher.' },
]

const CATEGORIES = ['Scan Type', 'Ports', 'Detection', 'Timing', 'Scripts', 'Output', 'Misc']

const PRESETS: { label: string; icon: string; desc: string; opts: string[]; explanation: string; color: string }[] = [
  { label: 'Quick Recon', icon: '⚡', desc: 'Fast top-100 scan', opts: ['sS','top100','T4','n','Pn'], explanation: 'Fast initial scan to identify live hosts and common services.', color: '#fbbf24' },
  { label: 'Full Discovery', icon: '🔍', desc: 'All ports + versions + scripts', opts: ['sS','allports','sV','sc','T4','oN'], explanation: 'Comprehensive scan to find all services and vulnerabilities.', color: '#6366f1' },
  { label: 'Stealth Scan', icon: '👻', desc: 'Slow + evasive', opts: ['sS','T1','n','Pn','top1000'], explanation: 'For heavily monitored environments. Avoids detection.', color: '#a855f7' },
  { label: 'Vuln Scan', icon: '💥', desc: 'Version + vuln scripts', opts: ['sS','sV','vuln','T4','top1000','oN'], explanation: 'Identifies vulnerabilities in discovered services.', color: '#f87171' },
  { label: 'HTB/CTF', icon: '🚩', desc: 'Typical HTB methodology', opts: ['sS','allports','sV','sc','A','T4','oN','min'], explanation: 'Complete enumeration approach used in hacking competitions.', color: '#22d3ee' },
  { label: 'SMB Focus', icon: '🪟', desc: 'Windows/SMB enumeration', opts: ['sS','sV','smb','top1000','T4','oN'], explanation: 'Specialized scan for Windows targets focusing on SMB vulnerabilities.', color: '#34d399' },
]

const MAX_SAVED_COMMANDS = 200

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        const show = () => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        }
        
        // Modern clipboard API (secure contexts only)
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(text)
            show()
            return
          } catch {
            // Fall through to fallback
          }
        }
        
        // Fallback for non-secure contexts
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
      className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-green transition-colors"
    >
      {copied ? <><Check size={11} className="text-ghost-green" />copied</> : <><Copy size={11} />copy</>}
    </button>
  )
}

export default function NmapBuilder() {
  const activeModel = useActiveModel()
  const [target, setTarget] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(['sS','top1000','T4']))
  const [activeTab, setActiveTab] = useState<'builder'|'analyzer'|'history'>('builder')
  const [nmapOutput, setNmapOutput] = useState('')
  const [analysis, setAnalysis] = useState<AnalyzerResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiExplain, setAiExplain] = useState('')
  const [loadingAI, setLoadingAI] = useState(false)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(CATEGORIES))
  const [showBeginnerTips, setShowBeginnerTips] = useState(false)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [showNmapInfo, setShowNmapInfo] = useState(true) // New state for Nmap info section
  const [savedCommands, setSavedCommands] = useState<SavedCommand[]>(() => {
    try {
      const saved = localStorage.getItem('nmap_saved_commands')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategory, setFilterCategory] = useState('All')
  const [commandDescription, setCommandDescription] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [scanStats, setScanStats] = useState({ totalScans: 0, totalPorts: 0 })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const analyzeRequestIdRef = useRef(0)
  const explainRequestIdRef = useRef(0)

  // Save to localStorage when changed
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

  const toggle = (id: string) => {
    const opt = OPTIONS.find(o => o.id === id)
    if (!opt) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        return next
      }
      // Remove conflicts
      opt.conflictsWith?.forEach(c => next.delete(c))
      next.add(id)
      return next
    })
  }

  const applyPreset = (opts: string[]) => {
    // Resolve conflicts within the preset
    const next = new Set<string>()
    for (const id of opts) {
      const opt = OPTIONS.find(o => o.id === id)
      if (!opt) continue
      opt.conflictsWith?.forEach(c => next.delete(c))
      next.add(id)
    }
    setSelected(next)
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

  const closeSaveDialog = () => {
    setShowSaveDialog(false)
    setCommandDescription('')
    setSaveError(null)
  }

  const saveCommand = () => {
    if (!target.trim()) {
      setSaveError('Please enter a target before saving.')
      return
    }
    setSaveError(null)
    
    const newCommand: SavedCommand = {
      id: crypto.randomUUID(),
      command,
      target: target.trim(),
      timestamp: Date.now(),
      options: Array.from(selected),
      description: commandDescription || undefined
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
    const data = JSON.stringify(savedCommands) // Minified
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
            // Deduplicate by id
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
    // Modern clipboard API (secure contexts only)
    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText()
        setNmapOutput(text)
        return
      } catch (err) {
        console.error('Clipboard read failed:', err)
        // Fall through to fallback
      }
    }
    
    // Fallback: try execCommand
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

  const analyzeOutput = async () => {
    if (!nmapOutput.trim()) return
    
    const myRequestId = ++analyzeRequestIdRef.current
    setAnalyzing(true)
    setAnalysis(null)

    try {
      let text = (
        await ollamaChatOnce(
          activeModel,
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

      // Stale check
      if (myRequestId !== analyzeRequestIdRef.current) return

      // Strip markdown code block if present
      text = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim()

      try {
        const parsed = JSON.parse(text)
        // Stale check again before setting state
        if (myRequestId !== analyzeRequestIdRef.current) return
        setAnalysis(parsed)
        
        // Update stats - accumulate total ports
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
        suggestions: ['❌ Failed to connect to Ollama or process response.'],
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
    const myRequestId = ++explainRequestIdRef.current
    setLoadingAI(true)
    setAiExplain('')
    try {
      const text = await ollamaChatOnce(
        activeModel,
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
    } catch {
      if (myRequestId === explainRequestIdRef.current) {
        setAiExplain('Error connecting to Ollama.')
      }
    } finally {
      if (myRequestId === explainRequestIdRef.current) {
        setLoadingAI(false)
      }
    }
  }

  // Filter options by search and category
  const filteredOptions = OPTIONS.filter(opt => {
    const matchSearch = opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        opt.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        opt.flag.toLowerCase().includes(searchTerm.toLowerCase())
    const matchCategory = filterCategory === 'All' || opt.category === filterCategory
    return matchSearch && matchCategory
  })

  // Beginner tips for selected options
  const selectedTips = OPTIONS.filter(o => selected.has(o.id) && o.beginnerTip)
    .map(o => ({ label: o.label, tip: o.beginnerTip }))

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      'Scan Type': 'text-blue-400',
      'Ports': 'text-green-400',
      'Detection': 'text-yellow-400',
      'Timing': 'text-purple-400',
      'Scripts': 'text-pink-400',
      'Output': 'text-orange-400',
      'Misc': 'text-gray-400'
    }
    return colors[cat] || 'text-ghost-text-dim'
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Network size={18} className="text-ghost-accent-2" />
          <span className="text-ghost-text font-mono text-sm font-bold">Nmap Command Builder</span>
          <span className="text-ghost-text-dim text-xs">— visual builder + output analyzer</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBeginnerTips(!showBeginnerTips)} className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-accent-2 transition-colors px-2 py-1 border border-ghost-border rounded" >
            <BookOpen size={12} /> {showBeginnerTips ? 'Hide Tips' : 'Show Tips'}
          </button>
          <button onClick={() => setShowAdvancedOptions(!showAdvancedOptions)} className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-accent-2 transition-colors px-2 py-1 border border-ghost-border rounded" >
            <Shield size={12} /> {showAdvancedOptions ? 'Hide Advanced' : 'Show Advanced'}
          </button>
        </div>
      </div>

      {/* Nmap Info Section - Collapsible */}
      <div className="mb-4">
        <button
          onClick={() => setShowNmapInfo(!showNmapInfo)}
          className="w-full flex items-center justify-between bg-ghost-surface border border-ghost-border rounded-lg px-4 py-3 hover:bg-ghost-surface-2 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Info size={16} className="text-ghost-accent-2" />
            <span className="text-ghost-accent-2 font-mono text-sm font-bold">What Nmap Actually Is</span>
            <span className="text-ghost-text-dim text-xs font-mono ml-2">
              {showNmapInfo ? 'Click to collapse' : 'Click to expand'}
            </span>
          </div>
          <div className="text-ghost-text-dim group-hover:text-ghost-accent-2 transition-colors">
            {showNmapInfo ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </button>
        
        {showNmapInfo && (
          <div className="bg-ghost-surface border border-ghost-border border-t-0 rounded-b-lg p-4 space-y-3 text-xs text-ghost-text leading-relaxed animate-slideDown">
            <div className="text-ghost-accent-2 font-mono font-bold text-sm">What Nmap Actually Is</div>
            <p>
              Nmap ("Network Mapper") is a raw-socket-level network scanner. At the lowest level it crafts and sends
              individual TCP/UDP/ICMP packets, then infers host and port state from the responses — or lack thereof.
              Every scan type in this tool (SYN, ACK, NULL, Xmas...) is really just a different combination of TCP
              flags sent to see how the target's stack reacts. It doesn't "hack" anything by itself — it's a mapping
              and enumeration tool, the reconnaissance phase of a pentest methodology, not an exploitation tool.
            </p>
            <div className="text-ghost-accent-2 font-mono font-bold text-sm pt-1">Why It Matters</div>
            <p>
              Every real penetration test starts with knowing what's actually reachable and what's running on it.
              Nmap answers three questions professionals build everything else on: what hosts are alive, what ports
              are open on them, and what service/version is bound to each port. Getting this step wrong — missing a
              filtered port, misreading a firewall's ACK-drop behavior as "closed" — cascades into every later phase
              of the assessment being built on bad data.
            </p>
            <div className="text-ghost-accent-2 font-mono font-bold text-sm pt-1">How Professionals Actually Use It</div>
            <p>
              Real engagements almost never use a single nmap invocation. The typical pattern: a fast, wide sweep
              first (top-1000 ports, many hosts) to find what's alive, then a slower, deep, full-port + version +
              script scan (-p- -sV -sC) narrowed to the interesting hosts found in step one. -A is convenient for
              learning but professionals rarely reach for it blind in production engagements — its combination of OS
              detection + default scripts + traceroute is loud and often more than the scope calls for. Output is
              almost always saved with -oA so results are re-parseable by other tools later (searchsploit, custom
              scripts, or importing into Metasploit).
            </p>
            <div className="text-ghost-accent-2 font-mono font-bold text-sm pt-1">Limitations — What Nmap Cannot Tell You</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>Version detection (-sV) fingerprints banners/responses — it cannot see an unpatched CVE that doesn't change the banner. A vuln script hit or version match is a lead to verify, not a confirmed finding.</li>
              <li>Firewalls that silently drop packets produce "filtered", which is genuinely ambiguous — nmap cannot distinguish "blocked by firewall" from "no service listening and host doesn't respond".</li>
              <li>It has no concept of application logic — it can tell you port 443 is open running nginx, not whether the web app behind it has a broken auth check. That's Burp Suite's job, not nmap's.</li>
              <li>Heavily rate-limited or load-balanced targets can produce inconsistent results between runs — a port that answers on one probe and times out on the next isn't necessarily a scan error.</li>
            </ul>
            <div className="text-ghost-accent-2 font-mono font-bold text-sm pt-1">Detection Reality Check</div>
            <p>
              Toggle <strong>Show Advanced</strong> below and read the detection note under each scan type — every
              single technique in this tool is detectable by a reasonably configured IDS/IPS or SIEM. "Stealth" in
              nmap's naming is historical (from an era of simpler stateless firewalls), not a claim about modern
              detection. The real operational security question on an authorized engagement isn't "will this be
              seen" — assume it will be — it's "does the client's detection/response process actually catch and
              escalate it," which is often the more interesting finding than the port scan itself.
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {(['builder', 'analyzer', 'history'] as const).map(tab => (
          <button 
            key={tab} 
            onClick={() => setActiveTab(tab)} 
            className={"px-4 py-1.5 text-xs font-mono rounded transition-colors flex items-center gap-1.5 " + 
              (activeTab === tab 
                ? 'bg-ghost-surface-2 border border-ghost-border text-ghost-text' 
                : 'text-ghost-text-dim hover:text-ghost-text')}
          >
            {tab === 'builder' && <Network size={12} />}
            {tab === 'analyzer' && <BarChart3 size={12} />}
            {tab === 'history' && <Clock size={12} />}
            {tab === 'builder' ? 'Command Builder' : tab === 'analyzer' ? 'Output Analyzer' : 'History'}
            {tab === 'history' && savedCommands.length > 0 && (
              <span className="text-xs bg-ghost-accent-2/20 px-1.5 py-0.5 rounded text-ghost-accent-2">
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
          <div className="flex gap-4 text-xs text-ghost-text-dim font-mono bg-ghost-surface p-2 rounded-lg border border-ghost-border">
            <span>Selected: {selected.size} options</span>
            <span>•</span>
            <span>Total Flags: {OPTIONS.filter(o => selected.has(o.id)).length}</span>
            <span>•</span>
            <span>Saved: {savedCommands.length} commands</span>
          </div>

          {/* Target input with quick actions */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] flex gap-2">
              <input 
                value={target} 
                onChange={e => setTarget(e.target.value)} 
                placeholder="Target IP or hostname — e.g. 10.10.10.1 or example.com" 
                className="ghost-input flex-1 bg-ghost-surface border border-ghost-border rounded px-3 py-2 text-ghost-text text-sm font-mono focus:outline-none placeholder-ghost-text-dim transition-colors" 
              />
              <button 
                onClick={() => setSelected(new Set(['sS','top1000','T4']))} 
                className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-red transition-colors px-3 border border-ghost-border rounded"
              >
                <RotateCcw size={11} /> Reset
              </button>
            </div>
            <button 
              onClick={() => setShowSaveDialog(true)} 
              disabled={!target.trim()}
              className="flex items-center gap-1 text-xs bg-ghost-accent-2/20 text-ghost-accent-2 hover:bg-ghost-accent-2/30 px-3 py-2 border border-ghost-accent-2/30 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={12} /> Save
            </button>
          </div>

          {/* Save Dialog */}
          {showSaveDialog && (
            <div className="bg-ghost-surface border border-ghost-accent-2/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-ghost-text text-xs font-mono">Save Command</span>
                <button onClick={closeSaveDialog} className="text-ghost-text-dim hover:text-ghost-text">
                  <X size={14} />
                </button>
              </div>
              <input
                value={commandDescription}
                onChange={e => setCommandDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full bg-ghost-bg border border-ghost-border rounded px-3 py-1.5 text-xs font-mono text-ghost-text focus:outline-none placeholder-ghost-text-dim"
              />
              {saveError && <div className="text-ghost-red text-xs mt-2">{saveError}</div>}
              <div className="flex gap-2 mt-2">
                <button onClick={saveCommand} className="px-3 py-1.5 bg-ghost-accent-2 text-ghost-bg text-xs font-mono rounded hover:opacity-90">
                  Save
                </button>
                <button onClick={closeSaveDialog} className="px-3 py-1.5 border border-ghost-border text-ghost-text-dim text-xs font-mono rounded hover:bg-ghost-surface-2">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Search and Filter */}
          <div className="flex gap-2 flex-wrap">
            <div className="flex-1 min-w-[150px] relative">
              <Search size={12} className="absolute left-2.5 top-2 text-ghost-text-dim" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search options..."
                className="w-full bg-ghost-surface border border-ghost-border rounded pl-8 pr-3 py-1.5 text-xs font-mono text-ghost-text focus:outline-none placeholder-ghost-text-dim"
              />
            </div>
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="bg-ghost-surface border border-ghost-border rounded px-2 py-1.5 text-xs font-mono text-ghost-text focus:outline-none"
            >
              <option value="All">All Categories</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Beginner Tips Panel */}
          {showBeginnerTips && (
            <div className="bg-ghost-accent-3/5 border border-ghost-accent-3/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen size={16} className="text-ghost-accent-3" />
                <span className="text-ghost-accent-3 text-xs font-mono font-bold">Nmap Beginner Tips</span>
              </div>
              <ul className="space-y-1 text-xs text-ghost-text">
                <li className="flex items-start gap-2">
                  <span className="text-ghost-accent-3 mt-0.5">•</span> Start with Quick Recon preset for initial scanning
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-ghost-accent-3 mt-0.5">•</span> Always save output with -oA flag for later analysis
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-ghost-accent-3 mt-0.5">•</span> Use -Pn for hosts that don't respond to ping
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-ghost-accent-3 mt-0.5">•</span> Combine -sV with --script=vuln for vulnerability discovery
                </li>
              </ul>
            </div>
          )}

          {/* Presets */}
          <div>
            <div className="text-ghost-text-dim text-xs font-mono mb-2">Quick Presets</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESETS.map(p => (
                <button 
                  key={p.label} 
                  onClick={() => applyPreset(p.opts)} 
                  className="ghost-card flex items-center gap-2.5 p-2.5 bg-ghost-surface border border-ghost-border rounded-lg text-left hover:border-ghost-accent-2/50 transition-all group"
                >
                  <div className="ghost-feature-icon w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0 group-hover:scale-110 transition-transform" style={{ background: p.color + '26' }}>
                    {p.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-ghost-text text-xs font-semibold">{p.label}</div>
                    <div className="text-ghost-text-dim text-xs">{p.desc}</div>
                    {showBeginnerTips && (
                      <div className="text-ghost-accent-2 text-xs mt-1">{p.explanation}</div>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Zap size={12} className="text-ghost-accent-2" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Options by category */}
          <div className="space-y-2">
            {CATEGORIES.filter(cat => filterCategory === 'All' || cat === filterCategory).map(cat => {
              const catOpts = filteredOptions.filter(o => o.category === cat)
              if (catOpts.length === 0) return null
              const isOpen = expandedCats.has(cat)
              const selCount = catOpts.filter(o => selected.has(o.id)).length
              return (
                <div key={cat} className="bg-ghost-surface border border-ghost-border rounded-lg overflow-hidden">
                  <button onClick={() => toggleCat(cat)} className="w-full flex items-center gap-3 px-4 py-2 hover:bg-ghost-surface-2 transition-colors">
                    <span className={`font-mono text-xs font-bold flex-1 text-left ${getCategoryColor(cat)}`}>{cat}</span>
                    {selCount > 0 && <span className="text-xs text-ghost-accent-2 font-mono">{selCount} selected</span>}
                    {isOpen ? <ChevronUp size={12} className="text-ghost-text-dim" /> : <ChevronDown size={12} className="text-ghost-text-dim" />}
                  </button>
                  {isOpen && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-2 border-t border-ghost-border">
                      {catOpts.map(opt => (
                        <button 
                          key={opt.id} 
                          onClick={() => toggle(opt.id)} 
                          className={"flex items-start gap-2 p-2 rounded text-left transition-colors " + 
                            (selected.has(opt.id) 
                              ? 'bg-ghost-accent-2/10 border border-ghost-accent-2/30' 
                              : 'hover:bg-ghost-surface-2 border border-transparent')}
                        >
                          <div className={"w-3.5 h-3.5 mt-0.5 rounded border flex-shrink-0 flex items-center justify-center transition-all " + 
                            (selected.has(opt.id) 
                              ? 'bg-ghost-accent-2 border-ghost-accent-2' 
                              : 'border-ghost-border')}
                          >
                            {selected.has(opt.id) && <Check size={9} className="text-ghost-bg" strokeWidth={3} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={"text-xs font-mono " + (selected.has(opt.id) ? 'text-ghost-accent-2' : 'text-ghost-text')}>
                              {opt.label}
                            </div>
                            <div className="text-ghost-text-dim text-xs leading-tight">{opt.description}</div>
                            <code className="text-ghost-green text-xs">{opt.flag}</code>
                            {showBeginnerTips && opt.beginnerTip && (
                              <div className="text-ghost-accent-3 text-xs mt-1 flex items-start gap-1">
                                <Zap size={10} className="mt-0.5 flex-shrink-0" /> {opt.beginnerTip}
                              </div>
                            )}
                            {showAdvancedOptions && opt.advancedNote && (
                              <div className="text-ghost-accent-2 text-xs mt-1 flex items-start gap-1">
                                <Shield size={10} className="mt-0.5 flex-shrink-0" /> {opt.advancedNote}
                              </div>
                            )}
                            {showAdvancedOptions && opt.detectionNote && (
                              <div className="text-ghost-red/80 text-xs mt-1 flex items-start gap-1">
                                <Search size={10} className="mt-0.5 flex-shrink-0" /> <span><strong>Detection: </strong>{opt.detectionNote}</span>
                              </div>
                            )}
                            {showAdvancedOptions && opt.examples && (
                              <div className="text-ghost-text-dim text-xs mt-1">
                                Examples: {opt.examples.map((ex, i) => (
                                  <code key={i} className="text-ghost-green mx-1">{ex}</code>
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
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-3">
              <div className="text-ghost-accent-2 text-xs font-mono font-bold mb-2">Selected Options Tips</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedTips.map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-ghost-accent-2 mt-0.5 flex-shrink-0">•</span>
                    <div>
                      <span className="text-ghost-text font-mono">{tip.label}:</span>
                      <span className="text-ghost-text-dim"> {tip.tip}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generated command */}
          <div className="bg-ghost-surface border border-ghost-accent-2/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <span className="text-ghost-accent-2 text-xs font-mono font-bold">Generated Command</span>
              <div className="flex gap-3 flex-wrap">
                <button onClick={explainCommand} disabled={loadingAI} className="flex items-center gap-1 text-xs text-ghost-accent-3 hover:opacity-80 disabled:opacity-40 transition-opacity font-mono">
                  <Sparkles size={11} />{loadingAI ? 'Explaining...' : 'Explain'}
                </button>
                <button onClick={() => setActiveTab('history')} className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-text transition-colors font-mono">
                  <History size={11} /> Saved
                </button>
                <CopyBtn text={command} />
              </div>
            </div>
            <div className="bg-ghost-bg border border-ghost-border rounded p-3 font-mono text-sm text-ghost-green break-all">
              {command}
            </div>
            {aiExplain && (
              <div className="mt-3 p-3 bg-ghost-accent-3/5 border border-ghost-accent-3/20 rounded text-sm text-ghost-text leading-relaxed">
                <span className="text-ghost-accent-3 font-mono text-xs">🤖 </span>{aiExplain}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">Total Options</div>
              <div className="text-ghost-accent-2 font-bold">{selected.size}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">Saved Commands</div>
              <div className="text-ghost-accent-2 font-bold">{savedCommands.length}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">Total Scans</div>
              <div className="text-ghost-accent-2 font-bold">{scanStats.totalScans}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">Avg Ports Found</div>
              <div className="text-ghost-accent-2 font-bold">
                {scanStats.totalScans > 0 
                  ? Math.round(scanStats.totalPorts / scanStats.totalScans) 
                  : 0}
              </div>
            </div>
          </div>

          {/* Nmap Lab Exercises */}
          {showBeginnerTips && (
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-3 space-y-3">
              <div className="text-ghost-green text-xs font-mono font-bold">🧪 Lab Exercises — Do These, Don't Just Read Them</div>

              <div className="text-xs">
                <div className="text-ghost-accent-2 font-bold mb-1">Level 1 — Mechanism check (no target needed)</div>
                <p className="text-ghost-text-dim">
                  Without running anything: for -sS, -sT, -sN, and -sA, write out (on paper, not here) what
                  packet nmap sends first and what response it needs to call a port "open" vs "closed" vs
                  "filtered" for each. Then toggle Show Advanced on those four options and check yourself. If you
                  got -sN wrong, re-read why Windows targets break NULL/FIN/Xmas scans before moving on —
                  that's a common gap.
                </p>
              </div>

              <div className="text-xs">
                <div className="text-ghost-accent-2 font-bold mb-1">Level 2 — Own network, packet capture</div>
                <p className="text-ghost-text-dim">
                  Spin up a local VM (or scan a spare device on your own LAN — never anything you don't own).
                  Run Wireshark capturing on the interface, then run a plain -sS scan against it from another
                  machine. Find the SYN, the SYN/ACK, and the RST nmap sends instead of completing the
                  handshake. Then repeat with -sT and confirm you now see a full 3-way handshake plus a FIN to
                  close it. This is the single most useful 30 minutes you can spend to stop memorizing "SYN
                  scan is stealthy" and start knowing why.
                </p>
              </div>

              <div className="text-xs">
                <div className="text-ghost-accent-2 font-bold mb-1">Level 3 — Full methodology on a lab box</div>
                <p className="text-ghost-text-dim">
                  Against a HackTheBox/TryHackMe target or a deliberately vulnerable VM (Metasploitable2, GOAD if
                  you're on AD): run a fast top-1000 scan first, note what's open, then run -p- -sV -sC only
                  against those hosts. Compare total scan time between the two approaches. Then for one open
                  port, manually verify one -sC/-sV finding by connecting to the service yourself (e.g. netcat
                  to grab a banner) rather than trusting nmap's output blindly — this is the habit that separates
                  "ran a tool" from "verified a finding."
                </p>
              </div>

              <div className="text-xs">
                <div className="text-ghost-accent-2 font-bold mb-1">Level 4 — Troubleshooting exercise</div>
                <p className="text-ghost-text-dim">
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
          <div className="bg-ghost-surface border border-ghost-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-ghost-text-dim text-xs font-mono">Paste nmap output below</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setNmapOutput('')} 
                  className="text-xs text-ghost-text-dim hover:text-ghost-red transition-colors font-mono"
                >
                  Clear
                </button>
                <button 
                  onClick={pasteFromClipboard}
                  className="text-xs text-ghost-text-dim hover:text-ghost-accent-2 transition-colors font-mono"
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
              className="ghost-input w-full bg-ghost-bg border border-ghost-border rounded px-3 py-2 text-ghost-green text-xs font-mono focus:outline-none placeholder-ghost-text-dim resize-none transition-colors" 
            />
            <div className="flex justify-between mt-2 flex-wrap gap-2">
              <div className="text-ghost-text-dim text-xs font-mono">
                {nmapOutput.length > 0 && `${nmapOutput.split('\n').length} lines, ${nmapOutput.length} characters`}
              </div>
              <button 
                onClick={analyzeOutput} 
                disabled={analyzing || !nmapOutput.trim()} 
                className="flex items-center gap-2 px-4 py-2 bg-ghost-accent-2 text-ghost-bg text-xs font-mono font-bold rounded hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                <Cpu size={12} />{analyzing ? 'Analyzing...' : 'Analyze Output'}
              </button>
            </div>
          </div>

          {analyzing && (
            <div className="flex items-center justify-center py-8 gap-3">
              <Cpu size={16} className="text-ghost-accent-2 animate-pulse" />
              <span className="text-ghost-text-dim text-sm font-mono animate-pulse">AI analyzing nmap output...</span>
            </div>
          )}

          {analysis && (
            <div className="space-y-3">
              {/* Services table */}
              {(analysis.services?.length ?? 0) > 0 && (
                <div className="bg-ghost-surface border border-ghost-border rounded-lg overflow-hidden">
                  <div className="px-4 py-2 border-b border-ghost-border text-ghost-accent-2 text-xs font-mono font-bold flex items-center justify-between">
                    <span>🔌 Discovered Services</span>
                    <span className="text-ghost-text-dim font-normal">{analysis.services.length} ports found</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                      <thead>
                        <tr className="border-b border-ghost-border">
                          {['Port','Service','Version','State'].map(h => (
                            <th key={h} className="text-left px-4 py-2 text-ghost-text-dim">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.services.map((s, i) => (
                          <tr key={i} className="border-b border-ghost-border/50 hover:bg-ghost-surface-2 transition-colors">
                            <td className="px-4 py-2 text-ghost-accent-2">{s.port}</td>
                            <td className="px-4 py-2 text-ghost-text">{s.service}</td>
                            <td className="px-4 py-2 text-ghost-text-dim">{s.version || '—'}</td>
                            <td className="px-4 py-2">
                              <span className={s.state === 'open' ? 'text-ghost-green' : s.state === 'filtered' ? 'text-yellow-400' : 'text-ghost-red'}>
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
                  <div className="bg-ghost-surface border border-ghost-border rounded-lg p-3">
                    <div className="text-ghost-green text-xs font-mono font-bold mb-2">✅ Next Steps</div>
                    <ul className="space-y-1">
                      {analysis.suggestions?.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-ghost-text">
                          <span className="text-ghost-green mt-0.5 flex-shrink-0">›</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Quick Wins */}
                {(analysis.quickWins?.length ?? 0) > 0 && (
                  <div className="bg-ghost-accent-2/5 border border-ghost-accent-2/20 rounded-lg p-3">
                    <div className="text-ghost-accent-2 text-xs font-mono font-bold mb-2">🎯 Quick Wins</div>
                    <ul className="space-y-1">
                      {analysis.quickWins?.map((q, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-ghost-text">
                          <span className="text-ghost-accent-2 mt-0.5 flex-shrink-0">›</span>{q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Tools */}
              {(analysis.tools?.length ?? 0) > 0 && (
                <div className="bg-ghost-surface border border-ghost-border rounded-lg p-3">
                  <div className="text-ghost-accent-2 text-xs font-mono font-bold mb-2">🔧 Recommended Tools</div>
                  <div className="flex flex-wrap gap-1">
                    {analysis.tools?.map((t, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-ghost-surface-2 border border-ghost-accent-2/30 rounded font-mono text-ghost-accent-2">{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Risks with CVE references */}
              {(analysis.risks?.length ?? 0) > 0 && (
                <div className="bg-ghost-red/5 border border-ghost-red/20 rounded-lg p-3">
                  <div className="text-ghost-red text-xs font-mono font-bold mb-2">⚠️ Potential Vulnerabilities</div>
                  <ul className="space-y-1">
                    {analysis.risks.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-ghost-text">
                        <span className="text-ghost-red mt-0.5 flex-shrink-0">!</span>{r}
                      </li>
                    ))}
                  </ul>
                  {analysis.cveReferences && analysis.cveReferences.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-ghost-red/20">
                      <div className="text-ghost-red text-xs font-mono font-bold">CVE References:</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {analysis.cveReferences.map((cve, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-ghost-red/10 border border-ghost-red/30 rounded font-mono text-ghost-red">{cve}</span>
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
          <div className="flex items-center justify-between">
            <div className="text-ghost-text-dim text-xs font-mono">
              {savedCommands.length} saved commands
            </div>
            <div className="flex gap-2 flex-wrap">
              <button 
                onClick={exportCommands} 
                disabled={savedCommands.length === 0}
                className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-text transition-colors px-2 py-1 border border-ghost-border rounded disabled:opacity-40"
              >
                <Download size={12} /> Export
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-text transition-colors px-2 py-1 border border-ghost-border rounded"
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

          {savedCommands.length === 0 ? (
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-8 text-center">
              <History size={32} className="text-ghost-text-dim mx-auto mb-2" />
              <div className="text-ghost-text-dim text-sm font-mono">No saved commands yet</div>
              <div className="text-ghost-text-dimmer text-xs mt-1">Build a command in the Builder tab and save it</div>
            </div>
          ) : (
            <div className="space-y-2">
              {savedCommands.map(cmd => (
                <div key={cmd.id} className="bg-ghost-surface border border-ghost-border rounded-lg p-3 hover:border-ghost-accent-2/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {cmd.description && (
                        <div className="text-ghost-text text-xs font-semibold mb-1">{cmd.description}</div>
                      )}
                      <div className="text-ghost-green text-xs font-mono break-all">{cmd.command}</div>
                      <div className="flex items-center gap-3 mt-1 text-ghost-text-dim text-xs font-mono flex-wrap">
                        <span>🎯 {cmd.target}</span>
                        <span>•</span>
                        <span>{new Date(cmd.timestamp).toLocaleString()}</span>
                        <span>•</span>
                        <span>{cmd.options.length} flags</span>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button 
                        onClick={() => loadSavedCommand(cmd)} 
                        className="p-1 text-ghost-text-dim hover:text-ghost-accent-2 transition-colors"
                        aria-label="Load this command"
                      >
                        <Play size={14} />
                      </button>
                      <button 
                        onClick={() => deleteSavedCommand(cmd.id)} 
                        className="p-1 text-ghost-text-dim hover:text-ghost-red transition-colors"
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
  )
}