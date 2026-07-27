// ADAttackPath.tsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Shield, Search, Copy, Check, Zap, Terminal, Layers,
  Save, Building, Star, Eye, Trash2, RefreshCw, AlertTriangle,
  Clock, Users, Server, Lock, Unlock
} from 'lucide-react'

// Types (unchanged)
interface ADUser {
  samAccountName: string;
  displayName: string;
  distinguishedName: string;
  groups: string[];
  enabled: boolean;
  passwordLastSet?: string;
  lastLogon?: string;
  servicePrincipalNames?: string[];
  kerberoastable: boolean;
  asrepRoastable: boolean;
  adminCount: boolean;
  sid: string;
  passwordExpired?: boolean;
  lockedOut?: boolean;
}

interface ADGroup {
  name: string;
  distinguishedName: string;
  members: string[];
  adminCount: boolean;
  memberCount: number;
  description?: string;
}

interface ADComputer {
  name: string;
  distinguishedName: string;
  operatingSystem: string;
  lastLogon?: string;
  enabled: boolean;
  dnsHostName: string;
  osVersion?: string;
  servicePack?: string;
}

interface ADAttackPath {
  id: string;
  name: string;
  description: string;
  steps: AttackStep[];
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  complexity: 'Low' | 'Medium' | 'High';
  prerequisites: string[];
  tools: string[];
  detection: string;
  mitigation: string;
  references?: string[];
  estimatedTime?: string;
  successRate?: 'High' | 'Medium' | 'Low';
  tags?: string[];
}

interface AttackStep {
  id: string;
  title: string;
  description: string;
  commands: string[];
  tools: string[];
  risk: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'pending' | 'completed' | 'blocked' | 'skipped';
  notes?: string;
  output?: string;
  timestamp?: string;
}

interface ADAttackResult {
  domain: string;
  domainSid?: string;
  functionalLevel?: string;
  users: ADUser[];
  groups: ADGroup[];
  computers: ADComputer[];
  domainControllers: ADComputer[];
  attackPaths: ADAttackPath[];
  vulnerabilities: {
    id: string;
    title: string;
    severity: 'Critical' | 'High' | 'Medium' | 'Low';
    description: string;
    affectedAssets: string[];
    remediation: string;
    cvssScore?: number;
  }[];
}

interface SavedAttack {
  id: string;
  timestamp: number;
  name: string;
  domain: string;
  attackPathId: string;
  notes?: string;
  favorite?: boolean;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

// ─── CONSTANTS ───
const SEVERITY_ORDER: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 }
const STATUS_CYCLE: ('pending' | 'in-progress' | 'completed' | 'failed')[] = ['pending', 'in-progress', 'completed', 'failed']

function severityScore(s: string | undefined): number {
  return s ? (SEVERITY_ORDER[s] ?? 0) : 0
}

// ─── MOCK AD DATA ───
// Deep-cloned to prevent mutation leaks between sessions
const MOCK_AD_DATA: ADAttackResult = {
  domain: 'corp.local',
  domainSid: 'S-1-5-21-1275210071-1715567821-725345543',
  functionalLevel: 'Windows Server 2016',
  users: [
    {
      samAccountName: 'administrator',
      displayName: 'Administrator',
      distinguishedName: 'CN=Administrator,CN=Users,DC=corp,DC=local',
      groups: ['Domain Admins', 'Enterprise Admins', 'Schema Admins'],
      enabled: true,
      passwordLastSet: '2024-01-15T10:00:00Z',
      lastLogon: '2024-02-20T08:30:00Z',
      kerberoastable: false,
      asrepRoastable: false,
      adminCount: true,
      sid: 'S-1-5-21-1275210071-1715567821-725345543-500',
      passwordExpired: false,
      lockedOut: false
    },
    {
      samAccountName: 'sql_service',
      displayName: 'SQL Service Account',
      distinguishedName: 'CN=sql_service,OU=ServiceAccounts,DC=corp,DC=local',
      groups: ['Domain Users'],
      enabled: true,
      passwordLastSet: '2023-12-01T10:00:00Z',
      lastLogon: '2024-02-19T14:20:00Z',
      servicePrincipalNames: ['MSSQLSvc/sql01.corp.local', 'MSSQLSvc/sql01.corp.local:1433'],
      kerberoastable: true,
      asrepRoastable: false,
      adminCount: false,
      sid: 'S-1-5-21-1275210071-1715567821-725345543-1001',
      passwordExpired: false,
      lockedOut: false
    },
    {
      samAccountName: 'svc_backup',
      displayName: 'Backup Service Account',
      distinguishedName: 'CN=svc_backup,OU=ServiceAccounts,DC=corp,DC=local',
      groups: ['Domain Users', 'Backup Operators'],
      enabled: true,
      passwordLastSet: '2023-10-15T08:00:00Z',
      lastLogon: '2024-02-18T22:00:00Z',
      kerberoastable: false,
      asrepRoastable: true,
      adminCount: false,
      sid: 'S-1-5-21-1275210071-1715567821-725345543-1002',
      passwordExpired: true,
      lockedOut: false
    },
    {
      samAccountName: 'jdoe',
      displayName: 'John Doe',
      distinguishedName: 'CN=John Doe,OU=Users,DC=corp,DC=local',
      groups: ['Domain Users', 'IT Support'],
      enabled: true,
      passwordLastSet: '2024-02-01T09:00:00Z',
      lastLogon: '2024-02-20T09:15:00Z',
      kerberoastable: false,
      asrepRoastable: false,
      adminCount: false,
      sid: 'S-1-5-21-1275210071-1715567821-725345543-1101',
      passwordExpired: false,
      lockedOut: false
    },
    {
      samAccountName: 'ksmith',
      displayName: 'Kyle Smith',
      distinguishedName: 'CN=Kyle Smith,OU=Users,DC=corp,DC=local',
      groups: ['Domain Users', 'IT Support', 'Help Desk'],
      enabled: false,
      passwordLastSet: '2023-08-15T09:00:00Z',
      lastLogon: '2024-01-15T09:15:00Z',
      kerberoastable: false,
      asrepRoastable: false,
      adminCount: false,
      sid: 'S-1-5-21-1275210071-1715567821-725345543-1102',
      passwordExpired: false,
      lockedOut: true
    }
  ],
  groups: [
    {
      name: 'Domain Admins',
      distinguishedName: 'CN=Domain Admins,CN=Users,DC=corp,DC=local',
      members: ['administrator'],
      adminCount: true,
      memberCount: 1,
      description: 'Domain administrators group'
    },
    {
      name: 'Enterprise Admins',
      distinguishedName: 'CN=Enterprise Admins,CN=Users,DC=corp,DC=local',
      members: ['administrator'],
      adminCount: true,
      memberCount: 1,
      description: 'Enterprise administrators group'
    },
    {
      name: 'Backup Operators',
      distinguishedName: 'CN=Backup Operators,CN=Users,DC=corp,DC=local',
      members: ['svc_backup'],
      adminCount: false,
      memberCount: 1,
      description: 'Backup operators group'
    },
    {
      name: 'Domain Users',
      distinguishedName: 'CN=Domain Users,CN=Users,DC=corp,DC=local',
      members: ['sql_service', 'jdoe', 'ksmith', 'svc_backup'],
      adminCount: false,
      memberCount: 4,
      description: 'All domain users'
    }
  ],
  computers: [
    {
      name: 'DC01',
      distinguishedName: 'CN=DC01,OU=Domain Controllers,DC=corp,DC=local',
      operatingSystem: 'Windows Server 2022',
      osVersion: '10.0.20348',
      lastLogon: '2024-02-20T10:00:00Z',
      enabled: true,
      dnsHostName: 'dc01.corp.local'
    },
    {
      name: 'SQL01',
      distinguishedName: 'CN=SQL01,OU=Servers,DC=corp,DC=local',
      operatingSystem: 'Windows Server 2019',
      osVersion: '10.0.17763',
      lastLogon: '2024-02-20T08:00:00Z',
      enabled: true,
      dnsHostName: 'sql01.corp.local'
    },
    {
      name: 'FILE01',
      distinguishedName: 'CN=FILE01,OU=Servers,DC=corp,DC=local',
      operatingSystem: 'Windows Server 2016',
      osVersion: '10.0.14393',
      lastLogon: '2024-02-19T16:00:00Z',
      enabled: true,
      dnsHostName: 'file01.corp.local'
    },
    {
      name: 'DC02',
      distinguishedName: 'CN=DC02,OU=Domain Controllers,DC=corp,DC=local',
      operatingSystem: 'Windows Server 2019',
      osVersion: '10.0.17763',
      lastLogon: '2024-02-19T20:00:00Z',
      enabled: false,
      dnsHostName: 'dc02.corp.local'
    }
  ],
  domainControllers: [
    {
      name: 'DC01',
      distinguishedName: 'CN=DC01,OU=Domain Controllers,DC=corp,DC=local',
      operatingSystem: 'Windows Server 2022',
      osVersion: '10.0.20348',
      lastLogon: '2024-02-20T10:00:00Z',
      enabled: true,
      dnsHostName: 'dc01.corp.local'
    }
  ],
  attackPaths: [
    {
      id: 'path1',
      name: 'Kerberoasting Attack',
      description: 'Extract and crack service account passwords from Active Directory',
      severity: 'High',
      complexity: 'Medium',
      prerequisites: ['Domain user credentials', 'Network access to DC'],
      tools: ['Rubeus', 'hashcat', 'John the Ripper'],
      detection: 'Event ID 4769 (Kerberos TGS request)',
      mitigation: 'Use long complex passwords, enable Kerberos auditing, monitor service accounts',
      estimatedTime: '2-4 hours',
      successRate: 'High',
      tags: ['Kerberos', 'Passwords', 'Service Accounts'],
      references: [
        'https://attack.mitre.org/techniques/T1558/003/',
        'https://github.com/GhostPack/Rubeus'
      ],
      steps: [
        {
          id: 'step1',
          title: 'Enumerate Kerberoastable Accounts',
          description: 'Use Rubeus to find accounts with SPNs',
          commands: ['Rubeus.exe kerberoast /outfile:hashes.txt'],
          tools: ['Rubeus'],
          risk: 'Medium',
          status: 'pending'
        },
        {
          id: 'step2',
          title: 'Extract Kerberos Tickets',
          description: 'Request TGS tickets for service accounts',
          commands: ['Rubeus.exe kerberoast /user:sql_service'],
          tools: ['Rubeus'],
          risk: 'Medium',
          status: 'pending'
        },
        {
          id: 'step3',
          title: 'Crack the Hashes',
          description: 'Use hashcat to crack extracted hashes',
          commands: ['hashcat -m 13100 hashes.txt /usr/share/wordlists/rockyou.txt'],
          tools: ['hashcat'],
          risk: 'High',
          status: 'pending'
        }
      ]
    },
    {
      id: 'path2',
      name: 'AS-REP Roasting',
      description: 'Extract and crack pre-authentication disabled account passwords',
      severity: 'Medium',
      complexity: 'Low',
      prerequisites: ['Domain user credentials', 'Network access to DC'],
      tools: ['Rubeus', 'hashcat'],
      detection: 'Event ID 4768 (Kerberos TGT request)',
      mitigation: 'Ensure Kerberos pre-authentication is enabled for all accounts',
      estimatedTime: '1-2 hours',
      successRate: 'High',
      tags: ['Kerberos', 'Passwords', 'Pre-Auth'],
      references: [
        'https://attack.mitre.org/techniques/T1558/004/'
      ],
      steps: [
        {
          id: 'step1',
          title: 'Find AS-REP Roastable Users',
          description: 'Identify users without Kerberos pre-authentication',
          commands: ['Rubeus.exe asreproast /format:hashcat /outfile:asrep.txt'],
          tools: ['Rubeus'],
          risk: 'Medium',
          status: 'pending'
        },
        {
          id: 'step2',
          title: 'Crack AS-REP Hashes',
          description: 'Crack the extracted hashes',
          commands: ['hashcat -m 18200 asrep.txt /usr/share/wordlists/rockyou.txt'],
          tools: ['hashcat'],
          risk: 'High',
          status: 'pending'
        }
      ]
    },
    {
      id: 'path3',
      name: 'Privilege Escalation via ACL Abuse',
      description: 'Abuse misconfigured ACLs to gain Domain Admin privileges',
      severity: 'Critical',
      complexity: 'High',
      prerequisites: ['Domain user credentials', 'BloodHound data'],
      tools: ['BloodHound', 'PowerView'],
      detection: 'Monitor for suspicious ACL modifications (Event ID 4662, 5136)',
      mitigation: 'Regularly review AD ACLs, implement least privilege',
      estimatedTime: '4-8 hours',
      successRate: 'Medium',
      tags: ['ACL', 'Privilege Escalation', 'BloodHound'],
      references: [
        'https://attack.mitre.org/techniques/T1484/',
        'https://bloodhound.readthedocs.io/'
      ],
      steps: [
        {
          id: 'step1',
          title: 'Enumerate ACLs with BloodHound',
          description: 'Collect AD data for analysis',
          commands: ['SharpHound.exe -c All'],
          tools: ['SharpHound', 'BloodHound'],
          risk: 'Low',
          status: 'pending'
        },
        {
          id: 'step2',
          title: 'Analyze Attack Paths',
          description: 'Find ACL-based privilege escalation paths',
          commands: ['Load BloodHound GUI and analyze path from current user to Domain Admins'],
          tools: ['BloodHound'],
          risk: 'Medium',
          status: 'pending'
        },
        {
          id: 'step3',
          title: 'Abuse ACL Misconfigurations',
          description: 'Add user to high privilege groups via ACL abuse',
          commands: ['Add-DomainGroupMember -Identity "Domain Admins" -Members "CurrentUser"'],
          tools: ['PowerView'],
          risk: 'Critical',
          status: 'pending'
        }
      ]
    },
    {
      id: 'path4',
      name: 'ADCS Attack - ESC1',
      description: 'Abuse misconfigured certificate templates for domain privilege escalation',
      severity: 'Critical',
      complexity: 'High',
      prerequisites: ['Domain user credentials', 'ADCS configured'],
      tools: ['Certify', 'Rubeus'],
      detection: 'Monitor for suspicious certificate requests (Event ID 4886, 4887)',
      mitigation: 'Enforce CA security best practices, audit certificate templates',
      estimatedTime: '3-6 hours',
      successRate: 'High',
      tags: ['ADCS', 'Certificates', 'Privilege Escalation'],
      references: [
        'https://posts.specterops.io/certified-pre-owned-d95910965cd2',
        'https://github.com/GhostPack/Certify'
      ],
      steps: [
        {
          id: 'step1',
          title: 'Enumerate Certificate Templates',
          description: 'Find vulnerable templates allowing client authentication',
          commands: ['Certify.exe find /vulnerable'],
          tools: ['Certify'],
          risk: 'Medium',
          status: 'pending'
        },
        {
          id: 'step2',
          title: 'Request Certificate',
          description: 'Request certificate with high privilege template',
          commands: ['Certify.exe request /ca:DC01.corp.local\\corp-DC01-CA /template:VulnerableTemplate /altname:Administrator'],
          tools: ['Certify'],
          risk: 'High',
          status: 'pending'
        },
        {
          id: 'step3',
          title: 'Use Certificate for Authentication',
          description: 'Use obtained certificate to authenticate as Administrator',
          commands: ['Rubeus.exe asktgt /user:Administrator /certificate:certificate.pfx'],
          tools: ['Rubeus'],
          risk: 'Critical',
          status: 'pending'
        }
      ]
    }
  ],
  vulnerabilities: [
    {
      id: 'v1',
      title: 'Kerberoastable Service Account',
      severity: 'High',
      description: 'Service account sql_service has SPNs set, making it vulnerable to Kerberoasting',
      affectedAssets: ['sql_service'],
      remediation: 'Use complex password (25+ chars), implement managed service accounts (gMSA)',
      cvssScore: 7.5
    },
    {
      id: 'v2',
      title: 'AS-REP Roastable Account',
      severity: 'Medium',
      description: 'svc_backup account has Kerberos pre-authentication disabled',
      affectedAssets: ['svc_backup'],
      remediation: 'Enable Kerberos pre-authentication for this account',
      cvssScore: 5.3
    },
    {
      id: 'v3',
      title: 'Domain Admin in Backup Operators',
      severity: 'High',
      description: 'Domain Admin group contains users that should not have this privilege',
      affectedAssets: ['Domain Admins'],
      remediation: 'Review and remove unnecessary Domain Admin memberships',
      cvssScore: 6.5
    },
    {
      id: 'v4',
      title: 'Weak Password Policy',
      severity: 'Medium',
      description: 'Current password policy allows weak passwords and lacks complexity requirements',
      affectedAssets: ['corp.local'],
      remediation: 'Implement strong password policy with minimum 14 characters',
      cvssScore: 4.3
    }
  ]
}

// ─── HELPERS ───

function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    'Critical': 'text-ghost-red border-ghost-red bg-ghost-red/10',
    'High': 'text-ghost-orange border-ghost-orange bg-ghost-orange/10',
    'Medium': 'text-ghost-yellow border-ghost-yellow bg-ghost-yellow/10',
    'Low': 'text-ghost-green border-ghost-green bg-ghost-green/10'
  }
  return colors[severity] || colors.Low
}

function getSeverityIcon(severity: string): string {
  const icons: Record<string, string> = {
    'Critical': '🔴',
    'High': '🟠',
    'Medium': '🟡',
    'Low': '🟢'
  }
  return icons[severity] || '🟢'
}

function getAttackComplexityIcon(complexity: string): string {
  const icons: Record<string, string> = {
    'Low': '🟢',
    'Medium': '🟡',
    'High': '🔴'
  }
  return icons[complexity] || '🟡'
}

function getStatusBadge(status: string): { label: string; className: string } {
  const statusMap: Record<string, { label: string; className: string }> = {
    'pending': { label: '⏳ Pending', className: 'text-ghost-yellow border-ghost-yellow bg-ghost-yellow/10' },
    'completed': { label: '✅ Done', className: 'text-ghost-green border-ghost-green bg-ghost-green/10' },
    'blocked': { label: '🚫 Blocked', className: 'text-ghost-red border-ghost-red bg-ghost-red/10' },
    'skipped': { label: '⏭️ Skipped', className: 'text-ghost-text-dim border-ghost-border bg-ghost-surface' }
  }
  return statusMap[status] || statusMap.pending
}

// ─── COPY BUTTON (with fallback) ───

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  
  const handleCopy = useCallback(async () => {
    const showSuccess = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
        showSuccess()
      } catch {
        console.debug('Copy fallback failed')
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        showSuccess()
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
      className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-green transition-colors"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? <><Check size={10} className="text-ghost-green" />copied</> : <><Copy size={10} />copy</>}
    </button>
  )
}

// ─── MAIN COMPONENT ───

export default function ADAttackPath() {
  const [adData, setAdData] = useState<ADAttackResult | null>(null)
  const [selectedPath, setSelectedPath] = useState<ADAttackPath | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'attacks' | 'tools' | 'templates' | 'saved'>('overview')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [filterSeverity, setFilterSeverity] = useState<string>('all')
  const [domain, setDomain] = useState('corp.local')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [showCreds, setShowCreds] = useState(false)
  const [savedAttacks, setSavedAttacks] = useState<SavedAttack[]>(() => {
    try {
      const saved = localStorage.getItem('ad_saved_attacks')
      return saved ? JSON.parse(saved) : []
    } catch {
      console.error('Failed to parse saved attacks from localStorage')
      return []
    }
  })
  const [showFavorites, setShowFavorites] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'severity' | 'complexity'>('date')
  const [filterComplexity, setFilterComplexity] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid')
  const [error, setError] = useState<string | null>(null)

  // ─── MEMOIZED STATS ───
  const stats = useMemo(() => {
    if (!adData) {
      return { 
        totalUsers: 0, 
        totalComputers: 0, 
        vulnerabilities: 0, 
        attackPaths: 0,
        kerberoastable: 0,
        asrepRoastable: 0,
        admins: 0,
        disabled: 0
      }
    }
    return {
      totalUsers: adData.users.length,
      totalComputers: adData.computers.length,
      vulnerabilities: adData.vulnerabilities.length,
      attackPaths: adData.attackPaths.length,
      kerberoastable: adData.users.filter(u => u.kerberoastable).length,
      asrepRoastable: adData.users.filter(u => u.asrepRoastable).length,
      admins: adData.users.filter(u => u.adminCount).length,
      disabled: adData.users.filter(u => !u.enabled).length
    }
  }, [adData])

  // ─── LOAD MOCK DATA ───
  useEffect(() => {
    try {
      // Deep clone to prevent mutation leaks
      const clonedData = JSON.parse(JSON.stringify(MOCK_AD_DATA))
      setAdData(clonedData)
    } catch (err) {
      setError('Failed to load AD data')
      console.error(err)
    }
  }, [])

  // ─── PERSIST SAVED ATTACKS ───
  useEffect(() => {
    try {
      localStorage.setItem('ad_saved_attacks', JSON.stringify(savedAttacks))
    } catch (err) {
      console.error('Failed to save attacks to localStorage:', err)
      setError('Failed to save attack data')
    }
  }, [savedAttacks])

  // ─── SCAN AD ───
  const scanAD = useCallback(async () => {
    if (!domain.trim()) {
      setError('Please enter a domain name')
      return
    }
    
    setIsScanning(true)
    setError(null)
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Deep clone and domain-qualify attack path IDs
      const clonedData = JSON.parse(JSON.stringify(MOCK_AD_DATA))
      const domainPrefix = domain.trim()
      
      // Domain-qualify path IDs to avoid collisions across domains
      clonedData.attackPaths = clonedData.attackPaths.map((p: ADAttackPath) => ({
        ...p,
        id: `${domainPrefix}::${p.id}`,
        steps: p.steps.map((s: AttackStep) => ({
          ...s,
          id: `${domainPrefix}::${s.id}`
        }))
      }))
      
      // Also qualify vulnerability IDs
      clonedData.vulnerabilities = clonedData.vulnerabilities.map((v: any) => ({
        ...v,
        id: `${domainPrefix}::${v.id}`
      }))
      
      clonedData.domain = domainPrefix
      setAdData(clonedData)
      
    } catch (err) {
      setError('Failed to scan Active Directory')
      console.error(err)
    } finally {
      setIsScanning(false)
    }
  }, [domain])

  // ─── SELECT PATH ───
  const selectPath = useCallback((path: ADAttackPath) => {
    setSelectedPath(path)
    setActiveTab('attacks')
    setExpandedSteps(new Set(path.steps.map(s => s.id)))
  }, [])

  // ─── TOGGLE STEP ───
  const toggleStep = useCallback((stepId: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev)
      next.has(stepId) ? next.delete(stepId) : next.add(stepId)
      return next
    })
  }, [])

  // ─── SAVE ATTACK ───
  const saveAttack = useCallback((pathId: string) => {
    if (!domain.trim()) {
      setError('Domain is not set')
      return
    }
    
    const path = adData?.attackPaths.find(p => p.id === pathId)
    if (!path) {
      setError('Attack path not found')
      return
    }
    
    const existing = savedAttacks.find(s => s.attackPathId === pathId && s.domain === domain)
    if (existing) {
      // Update timestamp instead of creating duplicate
      setSavedAttacks(prev => prev.map(s => 
        s.id === existing.id ? { ...s, timestamp: Date.now() } : s
      ))
      return
    }
    
    const newAttack: SavedAttack = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
      timestamp: Date.now(),
      name: `${path.name} (${domain})`,
      domain: domain,
      attackPathId: pathId,
      status: 'pending',
      favorite: false
    }
    setSavedAttacks(prev => [newAttack, ...prev])
  }, [savedAttacks, domain, adData])

  // ─── UPDATE ATTACK STATUS ───
  const updateAttackStatus = useCallback((id: string, status: 'pending' | 'in-progress' | 'completed' | 'failed') => {
    setSavedAttacks(prev => prev.map(s => 
      s.id === id ? { ...s, status } : s
    ))
  }, [])

  const cycleStatus = useCallback((id: string) => {
    setSavedAttacks(prev => prev.map(s => {
      if (s.id !== id) return s
      const currentIdx = STATUS_CYCLE.indexOf(s.status)
      const nextIdx = (currentIdx + 1) % STATUS_CYCLE.length
      return { ...s, status: STATUS_CYCLE[nextIdx] }
    }))
  }, [])

  const toggleFavorite = useCallback((id: string) => {
    setSavedAttacks(prev => prev.map(s => 
      s.id === id ? { ...s, favorite: !s.favorite } : s
    ))
  }, [])

  const deleteSavedAttack = useCallback((id: string) => {
    setSavedAttacks(prev => prev.filter(s => s.id !== id))
  }, [])

  // ─── FILTERED ATTACK PATHS ───
  const filteredAttackPaths = useMemo(() => {
    if (!adData) return []
    return adData.attackPaths.filter(p => {
      if (filterSeverity !== 'all' && p.severity !== filterSeverity) return false
      if (filterComplexity !== 'all' && p.complexity !== filterComplexity) return false
      if (searchTerm.trim()) {
        const search = searchTerm.toLowerCase().trim()
        return p.name.toLowerCase().includes(search) ||
               p.description.toLowerCase().includes(search) ||
               p.tools.some(t => t.toLowerCase().includes(search)) ||
               (p.tags && p.tags.some(t => t.toLowerCase().includes(search)))
      }
      return true
    })
  }, [adData, filterSeverity, filterComplexity, searchTerm])

  // ─── FILTERED SAVED ATTACKS ───
  const filteredSavedAttacks = useMemo(() => {
    let filtered = [...savedAttacks]
    
    // Only show saved attacks that match the current domain
    if (adData?.domain) {
      filtered = filtered.filter(s => s.domain === adData.domain)
    }
    
    if (showFavorites) {
      filtered = filtered.filter(s => s.favorite)
    }
    
    if (sortBy === 'date') {
      filtered.sort((a, b) => b.timestamp - a.timestamp)
    } else if (sortBy === 'severity') {
      filtered.sort((a, b) => {
        const pathA = adData?.attackPaths.find(p => p.id === a.attackPathId)
        const pathB = adData?.attackPaths.find(p => p.id === b.attackPathId)
        return severityScore(pathB?.severity) - severityScore(pathA?.severity)
      })
    }
    return filtered
  }, [savedAttacks, showFavorites, sortBy, adData])

  // ─── RENDER FUNCTIONS ───

  const renderOverview = () => {
    if (!adData) {
      return (
        <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-12 text-center">
          <Shield size={48} className="text-ghost-text-dim opacity-30 mx-auto mb-4" />
          <h3 className="text-lg text-ghost-text mb-2">No Active Directory Data</h3>
          <p className="text-ghost-text-dim text-sm">Scan a domain to get started</p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {/* Domain Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-ghost-surface border border-ghost-border rounded-lg p-3">
            <div className="text-xs text-ghost-text-dim">Domain</div>
            <div className="text-sm font-mono text-ghost-text">{adData.domain}</div>
            <div className="text-xs text-ghost-text-dim mt-1">SID: {adData.domainSid}</div>
          </div>
          <div className="bg-ghost-surface border border-ghost-border rounded-lg p-3">
            <div className="text-xs text-ghost-text-dim">Functional Level</div>
            <div className="text-sm font-mono text-ghost-text">{adData.functionalLevel}</div>
          </div>
          <div className="bg-ghost-surface border border-ghost-border rounded-lg p-3">
            <div className="text-xs text-ghost-text-dim">Domain Controllers</div>
            <div className="text-sm font-mono text-ghost-text">{adData.domainControllers.length}</div>
          </div>
        </div>

        {/* Vulnerabilities */}
        <div>
          <h3 className="text-sm font-bold text-ghost-red mb-2 flex items-center gap-2">
            <AlertTriangle size={16} />
            Vulnerabilities ({adData.vulnerabilities.length})
          </h3>
          <div className="space-y-2">
            {adData.vulnerabilities.map(vuln => (
              <div key={vuln.id} className="bg-ghost-surface border border-ghost-border rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded border font-mono ${getSeverityColor(vuln.severity)}`}>
                        {getSeverityIcon(vuln.severity)} {vuln.severity}
                      </span>
                      <span className="text-sm font-mono text-ghost-text">{vuln.title}</span>
                      {vuln.cvssScore && (
                        <span className="text-xs text-ghost-text-dim">CVSS: {vuln.cvssScore}</span>
                      )}
                    </div>
                    <p className="text-xs text-ghost-text-dim mt-1">{vuln.description}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-ghost-text-dim">Affected:</span>
                      {vuln.affectedAssets.map(asset => (
                        <span key={asset} className="text-xs bg-ghost-red/10 text-ghost-red px-1.5 py-0.5 rounded border border-ghost-red/20">
                          {asset}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-ghost-green mt-1">🔧 {vuln.remediation}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
            <Users size={16} className="text-ghost-blue mx-auto mb-1" />
            <div className="text-xs text-ghost-text-dim">Users</div>
            <div className="text-sm font-mono text-ghost-text">{stats.totalUsers}</div>
          </div>
          <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
            <Server size={16} className="text-ghost-cyan mx-auto mb-1" />
            <div className="text-xs text-ghost-text-dim">Computers</div>
            <div className="text-sm font-mono text-ghost-text">{stats.totalComputers}</div>
          </div>
          <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
            <Lock size={16} className="text-ghost-red mx-auto mb-1" />
            <div className="text-xs text-ghost-text-dim">Admin Users</div>
            <div className="text-sm font-mono text-ghost-text">{stats.admins}</div>
          </div>
          <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
            <Unlock size={16} className="text-ghost-orange mx-auto mb-1" />
            <div className="text-xs text-ghost-text-dim">Disabled</div>
            <div className="text-sm font-mono text-ghost-text">{stats.disabled}</div>
          </div>
        </div>
      </div>
    )
  }

  const renderTools = () => {
    if (!adData) {
      return (
        <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-12 text-center">
          <Terminal size={48} className="text-ghost-text-dim opacity-30 mx-auto mb-4" />
          <h3 className="text-lg text-ghost-text mb-2">No Tools Available</h3>
          <p className="text-ghost-text-dim text-sm">Scan a domain to see available tools</p>
        </div>
      )
    }

    const allTools = new Set<string>()
    adData.attackPaths.forEach(path => {
      path.tools.forEach(tool => allTools.add(tool))
    })

    const toolList = Array.from(allTools).sort()

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {toolList.map(tool => (
            <div key={tool} className="bg-ghost-surface border border-ghost-border rounded-lg p-3 hover:border-ghost-blue/50 transition-colors">
              <div className="flex items-center gap-2">
                <Terminal size={16} className="text-ghost-blue" />
                <span className="text-sm font-mono text-ghost-text">{tool}</span>
              </div>
              <div className="text-xs text-ghost-text-dim mt-1">
                Used in {adData.attackPaths.filter(p => p.tools.includes(tool)).length} attack paths
              </div>
            </div>
          ))}
        </div>

        <div className="bg-ghost-surface border border-ghost-border rounded-lg p-3">
          <h4 className="text-sm font-bold text-ghost-text mb-2 flex items-center gap-2">
            <Clock size={14} />
            Common Commands
          </h4>
          <div className="space-y-1">
            <div className="flex items-center gap-2 bg-ghost-bg rounded px-2 py-1">
              <code className="text-xs text-ghost-green font-mono flex-1">Rubeus.exe kerberoast /outfile:hashes.txt</code>
              <CopyBtn text="Rubeus.exe kerberoast /outfile:hashes.txt" />
            </div>
            <div className="flex items-center gap-2 bg-ghost-bg rounded px-2 py-1">
              <code className="text-xs text-ghost-green font-mono flex-1">SharpHound.exe -c All</code>
              <CopyBtn text="SharpHound.exe -c All" />
            </div>
            <div className="flex items-center gap-2 bg-ghost-bg rounded px-2 py-1">
              <code className="text-xs text-ghost-green font-mono flex-1">hashcat -m 13100 hashes.txt /usr/share/wordlists/rockyou.txt</code>
              <CopyBtn text="hashcat -m 13100 hashes.txt /usr/share/wordlists/rockyou.txt" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderTemplates = () => {
    if (!adData) {
      return (
        <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-12 text-center">
          <Layers size={48} className="text-ghost-text-dim opacity-30 mx-auto mb-4" />
          <h3 className="text-lg text-ghost-text mb-2">No Templates Available</h3>
          <p className="text-ghost-text-dim text-sm">Scan a domain to see available attack templates</p>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <div className="bg-ghost-surface border border-ghost-border rounded-lg p-3">
          <h4 className="text-sm font-bold text-ghost-text mb-2 flex items-center gap-2">
            <Layers size={14} />
            Attack Templates ({adData.attackPaths.length})
          </h4>
          <p className="text-xs text-ghost-text-dim mb-3">Pre-built attack templates for common Active Directory attacks</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {adData.attackPaths.map(path => (
              <div 
                key={path.id} 
                className="bg-ghost-bg border border-ghost-border rounded p-2 cursor-pointer hover:border-ghost-blue/50 transition-colors"
                onClick={() => selectPath(path)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && selectPath(path)}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${getSeverityColor(path.severity)}`}>
                    {getSeverityIcon(path.severity)}
                  </span>
                  <div className="text-xs font-bold text-ghost-text">{path.name}</div>
                </div>
                <div className="text-xs text-ghost-text-dim">{path.description}</div>
                <div className="text-xs text-ghost-text-dim mt-1">
                  Steps: {path.steps.length} | Tools: {path.tools.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderSaved = () => {
    return (
      <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-bold text-ghost-purple flex items-center gap-2">
            <Save size={16} />
            Saved Attacks ({savedAttacks.length})
          </h2>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowFavorites(!showFavorites)}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                showFavorites 
                  ? 'bg-yellow-400/20 border-yellow-400/30 text-yellow-400' 
                  : 'border-ghost-border text-ghost-text-dim hover:text-ghost-text'
              }`}
              aria-label="Toggle favorites"
            >
              <Star size={12} className="inline mr-1" />
              Favorites
            </button>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'severity' | 'complexity')}
              className="bg-ghost-bg border border-ghost-border rounded px-2 py-1 text-xs text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-blue"
              aria-label="Sort saved attacks"
            >
              <option value="date">Sort by Date</option>
              <option value="severity">Sort by Severity</option>
              <option value="complexity">Sort by Complexity</option>
            </select>
          </div>
        </div>

        {filteredSavedAttacks.length === 0 ? (
          <div className="text-center py-8">
            <Save size={32} className="text-ghost-text-dim opacity-30 mx-auto mb-2" />
            <p className="text-ghost-text-dim text-sm">
              {showFavorites ? 'No favorite attacks' : 'No saved attacks'}
            </p>
            <p className="text-ghost-text-dimmer text-xs">
              {showFavorites ? 'Star an attack to add it to favorites' : 'Save an attack path to track your progress'}
            </p>
            {adData?.domain && filteredSavedAttacks.length === 0 && (
              <p className="text-ghost-text-dimmer text-xs mt-1">
                Currently viewing domain: {adData.domain}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSavedAttacks.map(saved => {
              const path = adData?.attackPaths.find(p => p.id === saved.attackPathId)
              if (!path) return null
              return (
                <div key={saved.id} className="bg-ghost-bg/50 rounded-lg p-3 border border-ghost-border hover:border-ghost-purple/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {saved.favorite && <Star size={12} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                        <span className={`text-xs px-2 py-0.5 rounded border font-mono ${getSeverityColor(path.severity)}`}>
                          {getSeverityIcon(path.severity)} {path.severity}
                        </span>
                        <span className="text-sm font-bold text-ghost-text truncate">{saved.name}</span>
                        <span className="text-xs text-ghost-text-dim flex-shrink-0">{new Date(saved.timestamp).toLocaleString()}</span>
                        <span className={`text-xs px-2 py-0.5 rounded border ${
                          saved.status === 'completed' ? 'text-ghost-green border-ghost-green bg-ghost-green/10' :
                          saved.status === 'in-progress' ? 'text-ghost-yellow border-ghost-yellow bg-ghost-yellow/10' :
                          saved.status === 'failed' ? 'text-ghost-red border-ghost-red bg-ghost-red/10' :
                          'text-ghost-text-dim border-ghost-border bg-ghost-surface'
                        }`}>
                          {saved.status === 'completed' ? '✅ Done' :
                           saved.status === 'in-progress' ? '⏳ In Progress' :
                           saved.status === 'failed' ? '❌ Failed' :
                           '⏳ Pending'}
                        </span>
                      </div>
                      <div className="text-xs text-ghost-text-dim mt-1">
                        Domain: {saved.domain} • {path.steps.length} steps
                      </div>
                      {saved.notes && (
                        <div className="text-xs text-ghost-text-dim mt-1">📝 {saved.notes}</div>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0 ml-2">
                      <button
                        onClick={() => cycleStatus(saved.id)}
                        className="p-1 text-ghost-text-dim hover:text-ghost-yellow transition-colors"
                        title="Cycle status"
                        aria-label="Cycle status"
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button
                        onClick={() => toggleFavorite(saved.id)}
                        className={`p-1 transition-colors ${
                          saved.favorite ? 'text-yellow-400' : 'text-ghost-text-dim hover:text-yellow-400'
                        }`}
                        aria-label={saved.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star size={14} />
                      </button>
                      <button
                        onClick={() => {
                          const attackPath = adData?.attackPaths.find(p => p.id === saved.attackPathId)
                          if (attackPath) selectPath(attackPath)
                        }}
                        className="p-1 text-ghost-text-dim hover:text-ghost-purple transition-colors"
                        title="Load attack"
                        aria-label="Load attack"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => deleteSavedAttack(saved.id)}
                        className="p-1 text-ghost-text-dim hover:text-ghost-red transition-colors"
                        title="Delete"
                        aria-label="Delete saved attack"
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
    )
  }

  // ─── MAIN RENDER ───

  return (
    <div className="min-h-screen bg-ghost-bg text-ghost-text p-6">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ghost-blue/20 border border-ghost-blue/30">
              <Building className="text-ghost-blue" size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Active Directory Attack Analyzer
              </h1>
              <p className="text-ghost-text-dim text-sm">Find, exploit, and track AD attack paths</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="px-3 py-1.5 text-xs bg-ghost-surface border border-ghost-border rounded-lg font-mono">
              👥 {stats.totalUsers}
            </span>
            <span className="px-3 py-1.5 text-xs bg-ghost-surface border border-ghost-border rounded-lg font-mono">
              🖥️ {stats.totalComputers}
            </span>
            <span className="px-3 py-1.5 text-xs bg-ghost-red/10 border border-ghost-red/30 rounded-lg font-mono text-ghost-red">
              🚨 {stats.vulnerabilities}
            </span>
            <span className="px-3 py-1.5 text-xs bg-ghost-orange/10 border border-ghost-orange/30 rounded-lg font-mono text-ghost-orange">
              🎯 {stats.attackPaths}
            </span>
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

        {/* Scan Input */}
        <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-4 mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs text-ghost-text-dim block mb-1 font-mono" htmlFor="domain-input">
                Domain
              </label>
              <input
                id="domain-input"
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="corp.local"
                className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-1.5 text-sm text-ghost-text font-mono focus:outline-none focus:ring-2 focus:ring-ghost-blue placeholder-ghost-text-dim"
                onKeyDown={(e) => e.key === 'Enter' && scanAD()}
              />
            </div>
            <button
              onClick={() => setShowCreds(!showCreds)}
              className="text-xs text-ghost-text-dim hover:text-ghost-blue font-mono"
              aria-label={showCreds ? 'Hide credentials' : 'Show credentials'}
            >
              {showCreds ? 'Hide Credentials' : '🔑 Use Credentials'}
            </button>
            {showCreds && (
              <>
                <div className="flex-1 min-w-[150px]">
                  <label className="text-xs text-ghost-text-dim block mb-1 font-mono" htmlFor="username-input">
                    Username
                  </label>
                  <input
                    id="username-input"
                    type="text"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    placeholder="DOMAIN\\user"
                    className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-1.5 text-sm text-ghost-text font-mono focus:outline-none focus:ring-2 focus:ring-ghost-blue placeholder-ghost-text-dim"
                  />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="text-xs text-ghost-text-dim block mb-1 font-mono" htmlFor="password-input">
                    Password
                  </label>
                  <input
                    id="password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-1.5 text-sm text-ghost-text font-mono focus:outline-none focus:ring-2 focus:ring-ghost-blue"
                  />
                </div>
              </>
            )}
            <button
              onClick={scanAD}
              disabled={isScanning || !domain.trim()}
              className="px-4 py-2 bg-gradient-to-r from-ghost-blue to-ghost-cyan hover:opacity-90 disabled:opacity-50 rounded-lg text-white font-bold flex items-center gap-2 transition-all shadow-lg shadow-ghost-blue/20"
              aria-label="Scan Active Directory"
            >
              {isScanning ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Scanning...
                </>
              ) : (
                <>
                  <Search size={16} />
                  Scan AD
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats Row */}
        {adData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 mb-4 text-xs font-mono">
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">Kerberoastable</div>
              <div className="text-ghost-orange font-bold">{stats.kerberoastable}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">AS-REP Roastable</div>
              <div className="text-ghost-yellow font-bold">{stats.asrepRoastable}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">Admin Users</div>
              <div className="text-ghost-red font-bold">{stats.admins}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">Disabled</div>
              <div className="text-ghost-text-dim font-bold">{stats.disabled}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">Saved Attacks</div>
              <div className="text-ghost-purple font-bold">{savedAttacks.length}</div>
            </div>
            <div className="bg-ghost-surface border border-ghost-border rounded-lg p-2 text-center">
              <div className="text-ghost-text-dim">Domain</div>
              <div className="text-ghost-cyan font-bold truncate">{domain}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-ghost-border pb-2 flex-wrap" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'overview' 
                ? 'bg-ghost-surface text-ghost-blue border-t border-l border-r border-ghost-border' 
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            <Shield size={14} className="inline mr-1" />
            Overview
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'attacks'}
            onClick={() => setActiveTab('attacks')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'attacks' 
                ? 'bg-ghost-surface text-ghost-blue border-t border-l border-r border-ghost-border' 
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            <Zap size={14} className="inline mr-1" />
            Attack Paths ({adData?.attackPaths.length || 0})
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'tools'}
            onClick={() => setActiveTab('tools')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'tools' 
                ? 'bg-ghost-surface text-ghost-blue border-t border-l border-r border-ghost-border' 
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            <Terminal size={14} className="inline mr-1" />
            Tools & Commands
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'templates'}
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'templates' 
                ? 'bg-ghost-surface text-ghost-blue border-t border-l border-r border-ghost-border' 
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            <Layers size={14} className="inline mr-1" />
            Templates
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'saved'}
            onClick={() => setActiveTab('saved')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'saved' 
                ? 'bg-ghost-surface text-ghost-purple border-t border-l border-r border-ghost-border' 
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            <Save size={14} className="inline mr-1" />
            Saved ({savedAttacks.length})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && renderOverview()}
        
        {activeTab === 'attacks' && (
          <div>
            {/* Filters */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[150px]">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ghost-text-dim" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search attack paths..."
                  className="w-full bg-ghost-surface border border-ghost-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-ghost-text font-mono focus:outline-none focus:ring-2 focus:ring-ghost-blue placeholder-ghost-text-dim"
                  aria-label="Search attack paths"
                />
              </div>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="bg-ghost-surface border border-ghost-border rounded-lg px-2 py-1.5 text-xs text-ghost-text font-mono focus:outline-none focus:ring-2 focus:ring-ghost-blue"
                aria-label="Filter by severity"
              >
                <option value="all">All Severities</option>
                <option value="Critical">🔴 Critical</option>
                <option value="High">🟠 High</option>
                <option value="Medium">🟡 Medium</option>
                <option value="Low">🟢 Low</option>
              </select>
              <select
                value={filterComplexity}
                onChange={(e) => setFilterComplexity(e.target.value)}
                className="bg-ghost-surface border border-ghost-border rounded-lg px-2 py-1.5 text-xs text-ghost-text font-mono focus:outline-none focus:ring-2 focus:ring-ghost-blue"
                aria-label="Filter by complexity"
              >
                <option value="all">All Complexity</option>
                <option value="Low">🟢 Low</option>
                <option value="Medium">🟡 Medium</option>
                <option value="High">🔴 High</option>
              </select>
              <button
                onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                className="px-2 py-1.5 text-xs text-ghost-text-dim hover:text-ghost-blue border border-ghost-border rounded-lg transition-colors"
                aria-label="Toggle view mode"
              >
                {viewMode === 'list' ? '📋 List' : '📊 Grid'}
              </button>
            </div>

            {filteredAttackPaths.length === 0 ? (
              <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-12 text-center">
                <Zap size={48} className="text-ghost-text-dim opacity-30 mx-auto mb-4" />
                <h3 className="text-lg text-ghost-text mb-2">No Attack Paths Found</h3>
                <p className="text-ghost-text-dim text-sm">
                  {adData?.attackPaths.length === 0 
                    ? 'No attack paths discovered in the domain' 
                    : 'No matches for the current filters'}
                </p>
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'space-y-3'}>
                {filteredAttackPaths.map((path) => (
                  <div key={path.id} className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 overflow-hidden hover:border-ghost-blue/50 transition-all hover:shadow-lg hover:shadow-ghost-blue/5">
                    <div 
                      className="p-4 cursor-pointer hover:bg-ghost-bg/30 transition-colors"
                      onClick={() => selectPath(path)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && selectPath(path)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded border font-mono ${getSeverityColor(path.severity)}`}>
                              {getSeverityIcon(path.severity)} {path.severity}
                            </span>
                            <span className="text-sm font-bold text-ghost-text truncate">{path.name}</span>
                            <span className="text-xs text-ghost-text-dim flex-shrink-0">
                              Complexity: {getAttackComplexityIcon(path.complexity)} {path.complexity}
                            </span>
                            {path.estimatedTime && (
                              <span className="text-xs text-ghost-text-dim flex-shrink-0">
                                ⏱️ {path.estimatedTime}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-ghost-text-dim mt-1 line-clamp-2">{path.description}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-ghost-text-dim flex-wrap">
                            <span>🛠️ {path.tools.join(', ')}</span>
                            <span>•</span>
                            <span>{path.steps.length} steps</span>
                            {path.tags && path.tags.length > 0 && (
                              <>
                                <span>•</span>
                                <span className="flex gap-1 flex-wrap">
                                  {path.tags.slice(0, 3).map((tag) => (
                                    <span key={tag} className="text-ghost-blue bg-ghost-blue/10 px-1.5 py-0.5 rounded border border-ghost-blue/20">
                                      #{tag}
                                    </span>
                                  ))}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              const existing = savedAttacks.find(s => s.attackPathId === path.id && s.domain === domain)
                              if (existing) {
                                updateAttackStatus(existing.id, 'in-progress')
                              } else {
                                saveAttack(path.id)
                              }
                            }}
                            className="text-xs text-ghost-green hover:text-ghost-green/80 transition-colors"
                            aria-label={savedAttacks.find(s => s.attackPathId === path.id && s.domain === domain) ? 'Update attack status' : 'Save attack'}
                          >
                            {savedAttacks.find(s => s.attackPathId === path.id && s.domain === domain) ? '📌' : '💾'}
                          </button>
                          <span className="text-ghost-text-dim">
                            {selectedPath?.id === path.id ? '▲' : '▼'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Expanded steps */}
                    {selectedPath?.id === path.id && (
                      <div className="p-4 border-t border-ghost-border space-y-3">
                        <div className="bg-ghost-bg/50 rounded-lg p-2 border border-ghost-border">
                          <div className="text-xs text-ghost-text-dim font-mono">Prerequisites:</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {path.prerequisites.map((pre, i) => (
                              <span key={i} className="text-xs bg-ghost-surface px-2 py-0.5 rounded border border-ghost-border">
                                {pre}
                              </span>
                            ))}
                          </div>
                        </div>

                        {path.steps.map((step, si) => (
                          <div key={step.id} className="bg-ghost-bg/50 rounded-lg border border-ghost-border overflow-hidden">
                            <div 
                              className="p-3 cursor-pointer hover:bg-ghost-bg/30 transition-colors flex items-start justify-between"
                              onClick={() => toggleStep(step.id)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === 'Enter' && toggleStep(step.id)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-ghost-text-dim">Step {si + 1}</span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${getSeverityColor(step.risk)}`}>
                                    {step.risk}
                                  </span>
                                  <span className="text-sm font-mono text-ghost-text truncate">{step.title}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded border ${getStatusBadge(step.status).className}`}>
                                    {getStatusBadge(step.status).label}
                                  </span>
                                </div>
                                <p className="text-xs text-ghost-text-dim mt-1">{step.description}</p>
                              </div>
                              <span className="text-ghost-text-dim ml-2 flex-shrink-0">
                                {expandedSteps.has(step.id) ? '▲' : '▼'}
                              </span>
                            </div>

                            {expandedSteps.has(step.id) && (
                              <div className="p-3 border-t border-ghost-border space-y-2">
                                {step.commands.length > 0 && (
                                  <div>
                                    <div className="text-xs text-ghost-text-dim font-mono">Commands:</div>
                                    {step.commands.map((cmd, ci) => (
                                      <div key={ci} className="flex items-center gap-2 bg-ghost-bg rounded-lg px-2 py-1 mt-1 border border-ghost-border">
                                        <code className="text-xs text-ghost-green font-mono flex-1 break-all">{cmd}</code>
                                        <CopyBtn text={cmd} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {step.tools.length > 0 && (
                                  <div>
                                    <div className="text-xs text-ghost-text-dim font-mono">Tools:</div>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {step.tools.map((tool) => (
                                        <span key={tool} className="text-xs bg-ghost-blue/20 text-ghost-blue px-2 py-0.5 rounded border border-ghost-blue/30">
                                          {tool}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {step.notes && (
                                  <div className="text-xs text-ghost-text-dim">📝 {step.notes}</div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <div className="bg-ghost-bg/50 rounded-lg p-2 border border-ghost-border">
                            <div className="text-xs text-ghost-text-dim font-mono">🛡️ Detection</div>
                            <div className="text-xs text-ghost-text mt-1">{path.detection}</div>
                          </div>
                          <div className="bg-ghost-bg/50 rounded-lg p-2 border border-ghost-border">
                            <div className="text-xs text-ghost-text-dim font-mono">🔧 Mitigation</div>
                            <div className="text-xs text-ghost-text mt-1">{path.mitigation}</div>
                          </div>
                        </div>

                        {path.references && path.references.length > 0 && (
                          <div className="bg-ghost-bg/50 rounded-lg p-2 border border-ghost-border">
                            <div className="text-xs text-ghost-text-dim font-mono">📚 References</div>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {path.references.map((ref, ri) => (
                                <a 
                                  key={ri} 
                                  href={ref} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-xs text-ghost-cyan hover:text-ghost-cyan/80 transition-colors truncate max-w-full"
                                >
                                  {ref.length > 50 ? ref.slice(0, 50) + '...' : ref}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tools' && renderTools()}
        {activeTab === 'templates' && renderTemplates()}
        {activeTab === 'saved' && renderSaved()}
      </div>
    </div>
  )
}