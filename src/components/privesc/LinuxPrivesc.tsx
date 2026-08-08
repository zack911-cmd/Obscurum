import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { 
  Shield, ChevronDown, ChevronRight, Copy, Check, Cpu, 
  RotateCcw, Zap, Save, Download, Upload, Trash2, 
  History, Star, FileText,
  BookOpen, Target, Sparkles, Search, 
  Play, AlertCircle
  } from 'lucide-react'
import { useActiveModel } from '../models/ModelManager';

type CheckItem = {
  id: string;
  label: string;
  command: string;
  note: string;
  risk: 'critical' | 'high' | 'medium' | 'low';
  references?: string[];
  exampleOutput?: string;
}

type Category = {
  id: string;
  title: string;
  icon: string;
  color: string;
  items: CheckItem[];
}

type SavedChecklist = {
  id: string;
  timestamp: number;
  checked: Record<string, boolean>;
  notes?: string;
  favorite?: boolean;
  tags?: string[];
}

const CATEGORIES: Category[] = [
  {
    id: 'kernel', title: 'Kernel Exploits', icon: '💥', color: 'text-red-400',
    items: [
      { id: 'k1', label: 'Check kernel version', command: 'uname -a && cat /proc/version', note: 'Look up version on exploit-db / searchsploit', risk: 'critical', references: ['https://exploit-db.com'] },
      { id: 'k2', label: 'Search local kernel exploits', command: 'searchsploit linux kernel $(uname -r | cut -d. -f1-2)', note: 'Requires searchsploit installed', risk: 'critical' },
      { id: 'k3', label: 'Check OS release', command: 'cat /etc/os-release && cat /etc/*-release', note: 'Identify distro-specific exploits', risk: 'high' },
      { id: 'k4', label: 'Linux Exploit Suggester', command: 'perl linux-exploit-suggester.pl --checksec', note: 'Kali tool: /usr/share/linux-exploit-suggester/', risk: 'critical' },
      { id: 'k5', label: 'Dirty Pipe Check', command: 'uname -r | grep -q "5\\.16\\|5\\.17" && echo "Vulnerable to CVE-2022-0847"', note: 'Check for Dirty Pipe (CVE-2022-0847)', risk: 'critical', references: ['https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2022-0847'] },
    ]
  },
  {
    id: 'sudo', title: 'Sudo Abuse', icon: '👑', color: 'text-amber-400',
    items: [
      { id: 's1', label: 'List sudo privileges', command: 'sudo -l', note: 'Check GTFOBins for any listed binaries', risk: 'critical', references: ['https://gtfobins.github.io'] },
      { id: 's2', label: 'Check sudoers file', command: 'cat /etc/sudoers 2>/dev/null', note: 'May require root — look for NOPASSWD entries', risk: 'critical' },
      { id: 's3', label: 'Check sudo version (CVE-2021-3156)', command: 'sudo --version', note: 'Sudo < 1.9.5p2 vulnerable to Baron Samedit', risk: 'high' },
      { id: 's4', label: 'Sudo Baron Samedit Exploit', command: 'python3 /usr/share/exploitdb/exploits/linux/local/49522.py', note: 'Kali PoC for CVE-2021-3156', risk: 'critical' },
      { id: 's5', label: 'Check for CVE-2019-14287', command: 'sudo -u#-1 /bin/bash', note: 'All versions < 1.8.28 vulnerable', risk: 'critical' },
    ]
  },
  {
    id: 'suid', title: 'SUID / SGID Binaries', icon: '🔑', color: 'text-orange-400',
    items: [
      { id: 'su1', label: 'Find all SUID binaries', command: 'find / -perm -4000 -type f 2>/dev/null', note: 'Cross-reference with GTFOBins', risk: 'critical', references: ['https://gtfobins.github.io'] },
      { id: 'su2', label: 'Find all SGID binaries', command: 'find / -perm -2000 -type f 2>/dev/null', note: 'Check for unusual group-owned executables', risk: 'high' },
      { id: 'su3', label: 'Find world-writable SUID files', command: 'find / -perm -4002 -type f 2>/dev/null', note: 'Writable SUID = instant root', risk: 'critical' },
      { id: 'su4', label: 'SUID checker script', command: 'python3 /usr/share/doc/python3-impacket/examples/samrdump.py', note: 'Kali tool for comprehensive checks', risk: 'medium' },
      { id: 'su5', label: 'SUID Symlinks', command: 'find / -type l -perm -4000 2>/dev/null', note: 'Check for SUID symlinks to writable targets', risk: 'high' },
    ]
  },
  {
    id: 'caps', title: 'Capabilities', icon: '⚡', color: 'text-cyan-400',
    items: [
      { id: 'c1', label: 'List process capabilities', command: 'getcap -r / 2>/dev/null', note: 'cap_setuid+ep on python/perl/ruby = root', risk: 'critical' },
      { id: 'c2', label: 'Check current process caps', command: 'cat /proc/$$/status | grep Cap', note: 'Use capsh --decode to decode hex values', risk: 'medium' },
      { id: 'c3', label: 'Capability escalation PoC', command: '/usr/share/doc/python3-impacket/examples/GetNPUsers.py', note: 'Kali tool for cap_net_admin exploitation', risk: 'high' },
      { id: 'c4', label: 'Check systemd services', command: 'systemctl list-units --type=service --state=running', note: 'Check for services with dangerous capabilities', risk: 'medium' },
    ]
  },
  {
    id: 'cron', title: 'Cron Jobs', icon: '⏰', color: 'text-amber-300',
    items: [
      { id: 'cr1', label: 'List all crontabs', command: 'cat /etc/crontab && ls -la /etc/cron.*/', note: 'Look for scripts you can write to', risk: 'high' },
      { id: 'cr2', label: 'Check user crontabs', command: 'crontab -l && ls -la /var/spool/cron/crontabs/ 2>/dev/null', note: 'Other users crontabs may be readable', risk: 'high' },
      { id: 'cr3', label: 'Monitor cron execution (pspy)', command: './pspy64 2>/dev/null || ./pspy32', note: 'Upload pspy to watch processes without root', risk: 'high', references: ['https://github.com/DominicBreuker/pspy'] },
      { id: 'cr4', label: 'Find writable cron scripts', command: 'find /etc/cron* /var/spool/cron -writable 2>/dev/null', note: 'Writable cron script = code execution as owner', risk: 'critical' },
      { id: 'cr5', label: 'Check systemd timers', command: 'systemctl list-timers --all', note: 'Modern replacement for cron - check for writable timers', risk: 'high' },
    ]
  },
  {
    id: 'docker', title: 'Docker / LXC', icon: '🐳', color: 'text-cyan-300',
    items: [
      { id: 'd1', label: 'Check docker group membership', command: 'id && groups', note: 'docker group = root equivalent', risk: 'critical' },
      { id: 'd2', label: 'List docker containers', command: 'docker ps -a 2>/dev/null', note: 'Mount host / into container for escape', risk: 'critical' },
      { id: 'd3', label: 'Check if inside container', command: 'cat /.dockerenv 2>/dev/null && cat /proc/1/cgroup', note: 'If inside container, look for escape vectors', risk: 'high' },
      { id: 'd4', label: 'Docker escape via mounts', command: 'docker run --rm -it -v /:/host alpine:latest chroot /host', note: 'Kali technique for container escapes', risk: 'critical' },
      { id: 'd5', label: 'Check for privileged containers', command: 'docker inspect $(docker ps -q) | grep -i privileged', note: 'Privileged containers can access host devices', risk: 'critical' },
    ]
  },
  {
    id: 'nfs', title: 'NFS / Mounts', icon: '📂', color: 'text-emerald-400',
    items: [
      { id: 'nf1', label: 'Check NFS exports', command: 'cat /etc/exports 2>/dev/null', note: 'no_root_squash = mount and create SUID binary', risk: 'critical' },
      { id: 'nf2', label: 'List mounted filesystems', command: 'mount | grep nfs && df -h', note: 'Look for sensitive remote mounts', risk: 'medium' },
      { id: 'nf3', label: 'Check fstab for credentials', command: 'cat /etc/fstab 2>/dev/null', note: 'May contain plaintext creds for mounts', risk: 'high' },
      { id: 'nf4', label: 'Showmount enumeration', command: 'showmount -e TARGET_IP', note: 'Kali tool for NFS enumeration', risk: 'medium' },
      { id: 'nf5', label: 'Mount remote NFS share', command: 'mkdir /tmp/nfs && mount -t nfs TARGET_IP:/remote/path /tmp/nfs', note: 'Mount with UID/GID manipulation', risk: 'critical' },
    ]
  },
  {
    id: 'writable', title: 'Writable Files & Paths', icon: '✏️', color: 'text-amber-300',
    items: [
      { id: 'w1', label: 'Find world-writable directories', command: 'find / -writable -type d 2>/dev/null | grep -v proc', note: 'Useful for dropping payloads', risk: 'medium' },
      { id: 'w2', label: 'Check PATH for writable dirs', command: 'echo $PATH | tr ":" "\\n" | xargs -I{} ls -ld {} 2>/dev/null', note: 'Writable PATH dir = hijack any command', risk: 'critical' },
      { id: 'w3', label: 'Find writable /etc files', command: 'find /etc -writable -type f 2>/dev/null', note: '/etc/passwd writable = add root user', risk: 'critical' },
      { id: 'w4', label: 'Check /etc/passwd permissions', command: 'ls -la /etc/passwd /etc/shadow', note: 'Writable passwd: add x::0:0::/root:/bin/bash', risk: 'critical' },
      { id: 'w5', label: 'Find writable library paths', command: 'ldconfig -v 2>/dev/null | grep -v \'^\\s\' | xargs -I{} find {} -writable 2>/dev/null', note: 'Library hijacking via LD_LIBRARY_PATH', risk: 'critical' },
    ]
  },
  {
    id: 'env', title: 'Environment & PATH', icon: '🌐', color: 'text-white/40',
    items: [
      { id: 'e1', label: 'Print environment variables', command: 'env && printenv', note: 'Look for credentials, tokens, secrets', risk: 'high' },
      { id: 'e2', label: 'Check LD_PRELOAD abuse', command: 'sudo -l | grep LD_PRELOAD', note: 'If env_keep+=LD_PRELOAD allowed = root', risk: 'critical' },
      { id: 'e3', label: 'Check history files', command: 'cat ~/.bash_history ~/.zsh_history 2>/dev/null', note: 'May contain passwords typed in plaintext', risk: 'high' },
      { id: 'e4', label: 'Check for SSH agent', command: 'echo $SSH_AUTH_SOCK && ls -la $SSH_AUTH_SOCK', note: 'SSH agent hijacking if socket is writable', risk: 'high' },
      { id: 'e5', label: 'Check for screen/tmux sessions', command: 'ls -la /var/run/screen/S-* /tmp/tmux*', note: 'Attach to other users sessions', risk: 'medium' },
    ]
  },
  {
    id: 'passwords', title: 'Passwords & Credentials', icon: '🔐', color: 'text-red-400',
    items: [
      { id: 'p1', label: 'Search for passwords in files', command: 'grep -r "password" /etc /home /var/www 2>/dev/null | grep -v Binary', note: 'Cast wide net for hardcoded creds', risk: 'high' },
      { id: 'p2', label: 'Check SSH private keys', command: 'find / -name "id_rsa" -o -name "id_ecdsa" 2>/dev/null', note: 'Readable private keys = lateral movement', risk: 'critical' },
      { id: 'p3', label: 'Check .ssh/authorized_keys', command: 'cat ~/.ssh/authorized_keys 2>/dev/null && ls -la ~/.ssh/', note: 'Can add your public key for persistence', risk: 'high' },
      { id: 'p4', label: 'Search config files for creds', command: 'find / -name "*.conf" -o -name "*.config" -o -name "*.ini" 2>/dev/null | xargs grep -l "pass" 2>/dev/null', note: 'DB configs often have plaintext passwords', risk: 'high' },
      { id: 'p5', label: 'Check for KeePass databases', command: 'find / -name "*.kdbx" 2>/dev/null', note: 'Kali tool: kpcli for database interaction', risk: 'high' },
      { id: 'p6', label: 'Check for password managers', command: 'which keepassxc && which bitwarden', note: 'Check for accessible password stores', risk: 'medium' },
    ]
  },
  {
    id: 'kali-tools', title: 'Kali Linux Tools', icon: '🐧', color: 'text-emerald-400',
    items: [
      { id: 'kt1', label: 'LinPEAS', command: './linpeas.sh -a', note: 'Kali auto-enumeration script', risk: 'critical', references: ['https://github.com/carlospolop/PEASS-ng'] },
      { id: 'kt2', label: 'Linux Smart Enumeration', command: './lse.sh -l2', note: 'Kali tool for detailed enumeration', risk: 'high', references: ['https://github.com/diego-treitos/linux-smart-enumeration'] },
      { id: 'kt3', label: 'pspy process monitor', command: './pspy64 -pf -i 1000', note: 'Kali tool to monitor processes without root', risk: 'high', references: ['https://github.com/DominicBreuker/pspy'] },
      { id: 'kt4', label: 'PivotSuite', command: 'python3 pivotsuite.py -h', note: 'Kali tool for pivoting and tunneling', risk: 'medium' },
      { id: 'kt5', label: 'Impacket examples', command: 'impacket-GetNPUsers.py DOMAIN/ -no-pass -usersfile users.txt', note: 'Kali collection of exploitation scripts', risk: 'critical' },
    ]
  },
  {
    id: 'network', title: 'Network & Services', icon: '📡', color: 'text-cyan-300',
    items: [
      { id: 'net1', label: 'Check listening services', command: 'ss -tulnp', note: 'Check for internal services', risk: 'medium' },
      { id: 'net2', label: 'Check network configuration', command: 'ip a && route', note: 'Look for internal networks', risk: 'medium' },
      { id: 'net3', label: 'Port forwarding with SSH', command: 'ssh -L 8080:localhost:80 user@target', note: 'Access internal services', risk: 'medium' },
      { id: 'net4', label: 'Check for proxy services', command: 'which squid && cat /etc/squid/squid.conf', note: 'Misconfigured proxies can bypass restrictions', risk: 'high' },
      { id: 'net5', label: 'Check for database services', command: 'ps aux | grep mysql && ps aux | grep postgres', note: 'Check for accessible databases', risk: 'high' },
    ]
  },
]

const RISK_COLOR: Record<string, string> = {
  critical: 'text-red-400 border-red-400/40',
  high:     'text-amber-400 border-amber-400/40',
  medium:   'text-cyan-400 border-cyan-400/40',
  low:      'text-white/40 border-white/20',
}

const RISK_BG: Record<string, string> = {
  critical: 'bg-red-500/10',
  high:     'bg-amber-500/10',
  medium:   'bg-cyan-500/10',
  low:      'bg-white/5',
}

const TOTAL_ITEMS = CATEGORIES.flatMap(c => c.items).length

const RISK_DISTRIBUTION = CATEGORIES.reduce((dist, cat) => {
  cat.items.forEach(item => {
    dist[item.risk] = (dist[item.risk] || 0) + 1
  })
  return dist
}, { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>)

const OLLAMA_HOST = 'http://127.0.0.1:11434'

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
          } catch { /* fall through */ }
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
          console.error('Copy fallback failed:', err)
        }
      }}
      aria-label="Copy to clipboard"
      className="flex items-center gap-1 text-xs text-white/40 hover:text-cyan-400 transition-colors flex-shrink-0"
    >
      {copied ? <><Check size={11} className="text-emerald-400" />copied</> : <><Copy size={11} />copy</>}
    </button>
  )
}

export default function LinuxPrivesc() {
  const activeModel = useActiveModel()
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null)
  const [ollamaError, setOllamaError] = useState<string | null>(null)
  
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 
    kernel: true,
    kaliTools: true 
  })
  const [aiHint, setAiHint] = useState<Record<string, string>>({})
  const [loadingHint, setLoadingHint] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<'checklist' | 'history' | 'resources'>('checklist')
  const [showBeginnerTips, setShowBeginnerTips] = useState(true)
  const [savedChecklists, setSavedChecklists] = useState<SavedChecklist[]>(() => {
    try {
      const saved = localStorage.getItem('privesc_checklists')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [notes, setNotes] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [filterRisk, setFilterRisk] = useState('All')
  const [searchTerm, setSearchTerm] = useState('')
  const [showStats] = useState(true)
  const [currentChecklistId, setCurrentChecklistId] = useState<string | null>(null)
  const [highlightedItems, setHighlightedItems] = useState<Set<string>>(new Set())

  const fileInputRef = useRef<HTMLInputElement>(null)
  const hintRequestIdRef = useRef(0)

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

  // ─── Persistence ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem('privesc_checklists', JSON.stringify(savedChecklists))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        console.error('privesc_checklists: localStorage quota exceeded')
      } else {
        console.error('privesc_checklists: save failed', err)
      }
    }
  }, [savedChecklists])

  // Auto-clear highlighted items after 1s
  useEffect(() => {
    if (highlightedItems.size === 0) return
    const t = setTimeout(() => setHighlightedItems(new Set()), 1000)
    return () => clearTimeout(t)
  }, [highlightedItems])

  const done = Object.values(checked).filter(Boolean).length
  const pct = TOTAL_ITEMS > 0 ? Math.round((done / TOTAL_ITEMS) * 100) : 0

  const toggle = (id: string) => {
    setChecked(p => ({ ...p, [id]: !p[id] }))
    setHighlightedItems(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }
  
  const toggleCat = (id: string) => setExpanded(p => ({ ...p, [id]: !p[id] }))
  
  const reset = () => { 
    setChecked({}); 
    setAiHint({});
    setNotes('');
    setCurrentChecklistId(null);
  }

  const saveChecklist = useCallback(() => {
    const newChecklist: SavedChecklist = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      checked: checked,
      notes: notes || undefined,
      favorite: false
    }
    setSavedChecklists(prev => [newChecklist, ...prev])
    setCurrentChecklistId(newChecklist.id)
    setEditingNote(false)
  }, [checked, notes])

  const saveNotesForLoaded = useCallback(() => {
    if (!currentChecklistId) {
      saveChecklist()
      return
    }
    setSavedChecklists(prev => prev.map(c => 
      c.id === currentChecklistId ? { ...c, notes: notes || undefined } : c
    ))
    setEditingNote(false)
  }, [currentChecklistId, notes, saveChecklist])

  const loadChecklist = useCallback((checklist: SavedChecklist) => {
    setChecked(checklist.checked)
    setNotes(checklist.notes || '')
    setCurrentChecklistId(checklist.id)
    setActiveTab('checklist')
    setAiHint({})
    
    const expandedCats: Record<string, boolean> = {}
    CATEGORIES.forEach(cat => {
      const hasChecked = cat.items.some(item => checklist.checked[item.id])
      expandedCats[cat.id] = hasChecked
    })
    setExpanded(expandedCats)
  }, [])

  const deleteChecklist = (id: string) => {
    setSavedChecklists(prev => prev.filter(c => c.id !== id))
  }

  const toggleFavorite = (id: string) => {
    setSavedChecklists(prev => prev.map(c => 
      c.id === id ? { ...c, favorite: !c.favorite } : c
    ))
  }

  const exportChecklists = () => {
    const data = JSON.stringify(savedChecklists)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `privesc_checklists_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importChecklists = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        
        if (!Array.isArray(data)) {
          alert('Invalid file format: expected JSON array')
          return
        }

        const validData = data.filter((c): c is SavedChecklist =>
          typeof c === 'object' &&
          c !== null &&
          typeof c.id === 'string' &&
          typeof c.checked === 'object' &&
          typeof c.timestamp === 'number'
        )

        if (validData.length === 0) {
          alert('No valid checklists found in file')
          return
        }

        if (validData.length !== data.length) {
          console.warn(`Skipped ${data.length - validData.length} invalid entries`)
        }

        setSavedChecklists(prev => {
          const incomingIds = new Set(validData.map(c => c.id))
          const filtered = prev.filter(c => !incomingIds.has(c.id))
          return [...validData, ...filtered]
        })
      } catch (error) {
        console.error('Import error:', error)
        alert('Invalid file format. Please check the file.')
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const clearAllChecklists = () => {
    if (!confirm(`Delete all ${savedChecklists.length} saved checklists? This cannot be undone.`)) return
    setSavedChecklists([])
  }

  const stats = useMemo(() => {
    const total = savedChecklists.length
    const favorited = savedChecklists.filter(c => c.favorite).length
    const totalItems = savedChecklists.reduce((sum, c) => 
      sum + Object.values(c.checked).filter(Boolean).length, 0
    )
    return { total, favorited, totalItems }
  }, [savedChecklists])

  // ─── AI Hint with Ollama availability check ─────────────────────────────
  const getHint = useCallback(async (item: CheckItem) => {
    if (!ollamaAvailable) {
      setAiHint(p => ({ 
        ...p, 
        [item.id]: `⚠️ Ollama is not running (${ollamaError || 'connection failed'}). Please start Ollama and try again.` 
      }))
      return
    }

    if (aiHint[item.id]) { 
      setAiHint(p => ({ ...p, [item.id]: '' }))
      return 
    }
    
    const myRequestId = ++hintRequestIdRef.current
    setLoadingHint(p => ({ ...p, [item.id]: true }))
    
    try {
      const { status, data } = await window.obscurum?.ollamaRequest?.('/api/chat', 'POST', {
        model: activeModel,
        stream: false,
        messages: [
          { role: 'system', content: 'You are a Linux privilege escalation expert. Give a concise 2-3 sentence explanation of the technique and a specific exploitation example. Be technical and direct.' },
          { role: 'user', content: `Explain this privesc check: "${item.label}". Command: ${item.command}` }
        ]
      }) ?? { status: 200, data: null }
      
      if (myRequestId !== hintRequestIdRef.current) return
      
      if (status >= 400) throw new Error(`Ollama returned HTTP ${status}`)
      const payload = data as { message?: { content?: string } } | null
      
      if (myRequestId !== hintRequestIdRef.current) return
      setAiHint(p => ({ ...p, [item.id]: payload?.message?.content ?? 'No response.' }))
    } catch (err) {
      if (myRequestId !== hintRequestIdRef.current) return
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setAiHint(p => ({ 
        ...p, 
        [item.id]: `Error connecting to Ollama: ${errorMsg}. Please ensure Ollama is running.` 
      }))
    } finally {
      if (myRequestId === hintRequestIdRef.current) {
        setLoadingHint(p => ({ ...p, [item.id]: false }))
      }
    }
  }, [aiHint, activeModel, ollamaAvailable, ollamaError])

  // Filter and search items
  const getFilteredItems = useCallback((items: CheckItem[]) => {
    return items.filter(item => {
      if (filterRisk !== 'All' && item.risk !== filterRisk) return false
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        return item.label.toLowerCase().includes(search) || 
               item.command.toLowerCase().includes(search) ||
               item.note.toLowerCase().includes(search)
      }
      return true
    })
  }, [filterRisk, searchTerm])

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-emerald-500/20" style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.18), rgba(52,211,153,0.04))' }}>
            <Shield size={16} className="text-emerald-400" />
          </div>
          <div>
            <span className="text-white font-bold text-base">Daedalus</span>
            <div className="text-white/40 text-xs">Linux Privilege Escalation · {CATEGORIES.length} categories</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowBeginnerTips(!showBeginnerTips)}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20"
          >
            <BookOpen size={12} />
            {showBeginnerTips ? 'Hide Tips' : 'Show Tips'}
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              activeTab === 'history' 
                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' 
                : 'border-white/10 text-white/50 hover:text-white/80 hover:border-white/20'
            }`}
          >
            <History size={12} />
            Saved {savedChecklists.length > 0 && `(${savedChecklists.length})`}
          </button>
          <button
            onClick={() => setActiveTab('resources')}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              activeTab === 'resources' 
                ? 'border-amber-500/30 text-amber-400 bg-amber-500/10' 
                : 'border-white/10 text-white/50 hover:text-white/80 hover:border-white/20'
            }`}
          >
            <BookOpen size={12} />
            Resources
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
            <AlertCircle size={13} /> Ollama is not running at {OLLAMA_HOST}. AI explain functionality is disabled.
          </div>
        )}

        {/* Beginner Tips */}
        {showBeginnerTips && (
          <div className="mb-6 p-4 rounded-2xl border border-amber-500/10 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-amber-400" />
              <span className="text-amber-400 text-xs font-semibold tracking-wider">Methodology Tips</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/60">
              {[
                'Start with kernel exploits and sudo checks (highest success rate)',
                'Always run LinPEAS/LSE for comprehensive enumeration',
                'Check GTFOBins for SUID/Sudo binary exploitation',
                'Save your progress to track what you\'ve tried'
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">•</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats Bar */}
        {showStats && savedChecklists.length > 0 && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
              <div className="text-white/40">Total</div>
              <div className="text-white font-bold text-lg">{stats.total}</div>
            </div>
            <div className="bg-white/5 border border-yellow-400/20 rounded-xl p-3 text-center">
              <div className="text-yellow-400/60">Favorited</div>
              <div className="text-yellow-400 font-bold text-lg">{stats.favorited}</div>
            </div>
            <div className="bg-white/5 border border-emerald-400/20 rounded-xl p-3 text-center">
              <div className="text-emerald-400/60">Checked</div>
              <div className="text-emerald-400 font-bold text-lg">{stats.totalItems}</div>
            </div>
            <div className="bg-white/5 border border-cyan-400/20 rounded-xl p-3 text-center">
              <div className="text-cyan-400/60">Complete</div>
              <div className="text-cyan-400 font-bold text-lg">{TOTAL_ITEMS > 0 ? Math.round((done/TOTAL_ITEMS)*100) : 0}%</div>
            </div>
          </div>
        )}

        {/* ── Checklist Tab ── */}
        {activeTab === 'checklist' && (
          <>
            {/* Progress */}
            <div className="mb-6 bg-white/5 border border-white/5 rounded-2xl p-4">
              <div className="flex justify-between text-xs mb-2 flex-wrap gap-2">
                <span className="text-white/40">Progress</span>
                <span className="text-emerald-400 font-mono font-semibold">{done}/{TOTAL_ITEMS} checks — {pct}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: pct + '%', background: 'linear-gradient(90deg, #6366f1, #a855f7, #22d3ee)' }}
                />
              </div>
              <div className="flex gap-3 mt-3 flex-wrap">
                {(['critical','high','medium','low'] as const).map(r => (
                  <span key={r} className={"text-[10px] px-2 py-0.5 rounded-full border font-mono " + RISK_COLOR[r] + " " + RISK_BG[r]}>
                    ● {r} ({RISK_DISTRIBUTION[r] || 0})
                  </span>
                ))}
              </div>
            </div>

            {/* Search and Filter */}
            <div className="flex gap-2 mb-6 flex-wrap">
              <div className="flex-1 min-w-[150px] relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search checks..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-emerald-500/30 placeholder-white/20"
                />
              </div>
              <select
                value={filterRisk}
                onChange={e => setFilterRisk(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-emerald-500/30"
              >
                <option value="All">All Risks</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button
                onClick={saveChecklist}
                disabled={done === 0}
                className="flex items-center gap-1.5 text-xs px-4 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save size={12} /> Save
              </button>
              <button onClick={reset} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-red-400 transition-colors px-3 py-2 border border-white/10 rounded-xl hover:border-red-500/30">
                <RotateCcw size={12} /> Reset
              </button>
            </div>

            {/* Categories */}
            <div className="space-y-3">
              {CATEGORIES.map(cat => {
                const items = getFilteredItems(cat.items)
                if (items.length === 0) return null
                const catDone = items.filter(i => checked[i.id]).length
                const isOpen = expanded[cat.id]
                return (
                  <div key={cat.id} className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden transition-all hover:border-white/10">
                    <button
                      onClick={() => toggleCat(cat.id)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors"
                    >
                      <span className="text-lg flex-shrink-0">{cat.icon}</span>
                      <span className={"font-semibold text-sm flex-1 text-left " + cat.color}>{cat.title}</span>
                      <span className="text-xs text-white/30 font-mono">{catDone}/{items.length}</span>
                      {isOpen ? <ChevronDown size={14} className="text-white/30" /> : <ChevronRight size={14} className="text-white/30" />}
                    </button>

                    {isOpen && (
                      <div className="border-t border-white/5 divide-y divide-white/5">
                        {items.map(item => {
                          const isHighlighted = highlightedItems.has(item.id)
                          return (
                            <div 
                              key={item.id} 
                              className={`transition-all ${checked[item.id] ? 'bg-emerald-500/5' : ''} ${isHighlighted ? 'bg-emerald-500/20' : ''}`}
                            >
                              <div className="flex items-start gap-3 px-5 py-3.5">

                                <div
                                  onClick={() => toggle(item.id)}
                                  className={`w-4 h-4 mt-0.5 rounded border flex-shrink-0 cursor-pointer flex items-center justify-center transition-all ${
                                    checked[item.id] ? 'bg-emerald-500 border-emerald-500' : 'border-white/20 hover:border-emerald-500/50'
                                  }`}
                                >
                                  {checked[item.id] && <Check size={10} className="text-black" strokeWidth={3} />}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                    <span className={"text-xs " + (checked[item.id] ? 'line-through text-white/30' : 'text-white/80')}>
                                      {item.label}
                                    </span>
                                    <span className={"text-[10px] px-1.5 py-0.5 rounded-full border font-mono " + RISK_COLOR[item.risk] + " " + RISK_BG[item.risk]}>
                                      {item.risk}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-1.5 mb-1.5">
                                    <code className="text-emerald-400 text-xs font-mono flex-1 truncate selectable">{item.command}</code>
                                    <CopyBtn text={item.command} />
                                  </div>

                                  <div className="text-white/40 text-xs">ℹ {item.note}</div>

                                  {item.references && item.references.length > 0 && (
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                      {item.references.map((ref, i) => (
                                        <a key={i} href={ref} target="_blank" rel="noopener noreferrer"
                                          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                        >
                                          🔗 Reference {i + 1}
                                        </a>
                                      ))}
                                    </div>
                                  )}

                                  {aiHint[item.id] && (
                                    <div className="mt-2 p-2.5 bg-cyan-500/5 border border-cyan-500/20 rounded-xl text-xs text-white/70 leading-relaxed">
                                      <span className="text-cyan-400 font-semibold text-xs">🤖 AI: </span>
                                      {aiHint[item.id]}
                                    </div>
                                  )}
                                </div>

                                <button
                                  onClick={() => getHint(item)}
                                  className="flex-shrink-0 flex items-center gap-1 text-xs text-white/30 hover:text-cyan-400 transition-colors mt-0.5"
                                  disabled={ollamaAvailable === false}
                                  title={ollamaAvailable === false ? 'Ollama offline' : ''}
                                >
                                  {loadingHint[item.id]
                                    ? <span className="animate-pulse text-cyan-400">...</span>
                                    : <><Cpu size={11} />{aiHint[item.id] ? 'hide' : 'explain'}</>
                                  }
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Notes section */}
            {(done > 0 || notes) && (
              <div className="mt-6 bg-white/5 border border-white/5 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-white/40 text-xs font-mono flex items-center gap-1">
                    <FileText size={12} />
                    Notes
                  </div>
                  <button 
                    onClick={() => setEditingNote(!editingNote)}
                    className="text-xs text-white/40 hover:text-emerald-400 transition-colors"
                  >
                    {editingNote ? 'Cancel' : 'Add Note'}
                  </button>
                </div>
                {editingNote ? (
                  <div>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add notes about your progress..."
                      rows={2}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 font-mono focus:outline-none focus:border-emerald-500/30"
                    />
                    <button
                      onClick={saveNotesForLoaded}
                      className="mt-2 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-mono rounded-xl hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
                    >
                      Save Notes & Progress
                    </button>
                  </div>
                ) : (
                  <div className="text-white/40 text-sm">
                    {notes || 'No notes added yet.'}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-white/40 text-xs font-mono">
                {savedChecklists.length} saved checklists
              </div>
              <div className="flex gap-2 flex-wrap">
                <button 
                  onClick={exportChecklists} 
                  disabled={savedChecklists.length === 0}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors px-3 py-1.5 border border-white/10 rounded-xl disabled:opacity-40"
                >
                  <Download size={12} /> Export
                </button>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-white/80 transition-colors px-3 py-1.5 border border-white/10 rounded-xl"
                >
                  <Upload size={12} /> Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={importChecklists}
                  className="hidden"
                />
                <button 
                  onClick={clearAllChecklists} 
                  disabled={savedChecklists.length === 0}
                  className="flex items-center gap-1 text-xs text-red-400/50 hover:text-red-400 transition-colors px-3 py-1.5 border border-red-500/20 rounded-xl disabled:opacity-40"
                >
                  <Trash2 size={12} /> Clear All
                </button>
              </div>
            </div>

            {savedChecklists.length === 0 ? (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-12 text-center">
                <Shield size={32} className="text-white/20 mx-auto mb-3" />
                <div className="text-white/40 text-sm font-mono">No saved checklists</div>
                <div className="text-white/20 text-xs mt-1">Complete some checks and save your progress</div>
              </div>
            ) : (
              <div className="space-y-2">
                {savedChecklists.map(c => {
                  const items = Object.values(c.checked).filter(Boolean).length
                  return (
                    <div key={c.id} className="bg-white/5 border border-white/5 rounded-xl p-4 hover:border-emerald-500/20 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => loadChecklist(c)}
                              className="text-emerald-400 hover:text-emerald-300 font-mono text-sm font-bold transition-colors"
                            >
                              {new Date(c.timestamp).toLocaleString()}
                            </button>
                            <span className="text-white/40 text-xs">
                              {items}/{TOTAL_ITEMS} checks
                            </span>
                            <span className="text-white/40 text-xs">
                              {Math.round((items/TOTAL_ITEMS)*100)}%
                            </span>
                            {c.favorite && (
                              <Star size={12} className="text-yellow-400" />
                            )}
                          </div>
                          {c.notes && (
                            <div className="text-white/40 text-xs mt-1">{c.notes}</div>
                          )}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(c.checked)
                              .filter(([, checked]) => checked)
                              .slice(0, 5)
                              .map(([id]) => {
                                const item = CATEGORIES.flatMap(cat => cat.items).find(i => i.id === id)
                                return item ? (
                                  <span key={id} className={`text-[8px] px-1 py-0.5 rounded font-mono ${RISK_COLOR[item.risk]} ${RISK_BG[item.risk]}`}>
                                    {item.label.slice(0, 15)}...
                                  </span>
                                ) : null
                              })}
                            {Object.values(c.checked).filter(Boolean).length > 5 && (
                              <span className="text-[8px] text-white/30">+{Object.values(c.checked).filter(Boolean).length - 5} more</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => toggleFavorite(c.id)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-yellow-400 transition-colors"
                          >
                            <Star size={14} className={c.favorite ? 'text-yellow-400' : ''} />
                          </button>
                          <button
                            onClick={() => loadChecklist(c)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-emerald-400 transition-colors"
                          >
                            <Play size={14} />
                          </button>
                          <button
                            onClick={() => deleteChecklist(c.id)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-red-400 transition-colors"
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

        {/* ── Resources Tab ── */}
        {activeTab === 'resources' && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
                <Zap size={14} /> Kali Linux Resources
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <h4 className="font-semibold text-amber-400 mb-2">Enumeration Scripts</h4>
                  <ul className="space-y-1.5 text-white/40 font-mono">
                    <li>• /usr/share/peass/linpeas/linpeas.sh</li>
                    <li>• /usr/share/unix-privesc-check/unix-privesc-check</li>
                    <li>• /usr/share/linux-exploit-suggester/linux-exploit-suggester.sh</li>
                    <li>• /usr/share/pspy/pspy64 (process monitor)</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-amber-400 mb-2">Exploitation Tools</h4>
                  <ul className="space-y-1.5 text-white/40 font-mono">
                    <li>• searchsploit — Kali's exploit database</li>
                    <li>• impacket — Collection of network protocols</li>
                    <li>• pspy — Monitor processes without root</li>
                    <li>• bloodhound — Active Directory enumeration</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2">
                <Target size={14} /> Quick Reference
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-black/30 border border-white/5 rounded-xl">
                  <h4 className="font-bold text-red-400 mb-1">Most Common Exploits</h4>
                  <ul className="space-y-1 text-white/40">
                    <li>• Dirty Cow (CVE-2016-5195)</li>
                    <li>• Dirty Pipe (CVE-2022-0847)</li>
                    <li>• Baron Samedit (CVE-2021-3156)</li>
                    <li>• Polkit (CVE-2021-4034)</li>
                  </ul>
                </div>
                <div className="p-3 bg-black/30 border border-white/5 rounded-xl">
                  <h4 className="font-bold text-amber-400 mb-1">Golden Rules</h4>
                  <ul className="space-y-1 text-white/40">
                    <li>• Check sudo -l first</li>
                    <li>• SUID/GUID binaries are gold</li>
                    <li>• Cron jobs are often overlooked</li>
                    <li>• Docker group = root</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2">
                <Sparkles size={14} /> AI Commands
              </h3>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-1.5">
                  <code className="text-emerald-400 text-xs font-mono flex-1">Explain this command: sudo -l</code>
                  <CopyBtn text="Explain this command: sudo -l" />
                </div>
                <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-1.5">
                  <code className="text-emerald-400 text-xs font-mono flex-1">How to exploit SUID on this system?</code>
                  <CopyBtn text="How to exploit SUID on this system?" />
                </div>
                <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-1.5">
                  <code className="text-emerald-400 text-xs font-mono flex-1">Find privilege escalation vectors</code>
                  <CopyBtn text="Find privilege escalation vectors" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}} />
    </div>
  )
}