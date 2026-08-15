import appIcon from './assets/app-icon.png'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect, useMemo, useCallback, type RefObject, type ReactNode } from 'react'
import { 
  Minus, Maximize2, X, Plus, ChevronRight, ChevronLeft, 
  Shield, FileText, GitBranch, Folder, 
  BookOpen, Activity, GitMerge, Target, Key, 
  Crosshair, Rss, Eye, EyeOff, TrendingUp, TrendingDown, 
  Radar, ShieldAlert, ClipboardCheck, MoreHorizontal, Clock, ScanLine, 
  Bot, Flame, Feather, Compass, Lock, Library,
  Sparkles, Landmark, Swords, Hammer, Waves, Telescope, Factory
} from 'lucide-react'

import ChatWindow      from './components/chat/ChatWindow'
import LinuxPrivesc    from './components/privesc/LinuxPrivesc'
import WindowsPrivesc  from './components/privesc/WindowsPrivesc'
import CVECenter       from './components/cve/CVECenter'
import HashIdentifier  from './components/hash/HashIdentifier'
import NmapBuilder     from './components/nmap/NmapBuilder'
import ServiceAnalyzer from './components/analyzer/ServiceAnalyzer'
import HTBCoach        from './components/coach/HTBCoach'
import GobusterMSFCoach from './components/coach/GobusterMSFCoach'
import WiresharkCoach  from './components/coach/WiresharkCoach'
import ResponderCoach  from './components/coach/ResponderCoach'
import BloodHoundCoach from './components/coach/BloodHoundCoach'
import ReportWriter    from './components/report/ReportWriter'
import AttackPath      from './components/attack/AttackPath'
import AttackPathGenerator from './components/attack/AttackPathGenerator'
import VulnerabilityMatcher from './components/attack/VulnerabilityMatcher'
import PasswordCracker from './components/crack/PasswordCracker'
import Workspace       from './components/workspace/Workspace'
import KnowledgeBase   from './components/kb/KnowledgeBase'
import ModelManager    from './components/models/ModelManager'
import PayloadForge    from './components/payload/PayloadForge'
import Cassandra       from './components/intel/Cassandra'
import HabitTracker    from './components/habits/HabitTracker'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Star {
  x: number; y: number; r: number; a: number; twinkle: number
}
interface StreamPoint {
  x: number; y: number; frac: number; bright: number; width: number
}

type Severity = 'crit' | 'high' | 'med' | 'low'
type Stage = 'recon' | 'exploitation' | 'privesc' | 'reporting'

interface Finding {
  id: string
  title: string
  target: string
  severity: Severity
  stage: Stage
  engagementId: string | null
  resolved: boolean
  createdAt: number
  resolvedAt: number | null
}

interface Engagement {
  id: string
  label: string
  targetFindings: number
  dueAt: number | null
  color: string
  createdAt: number
}

interface ActivityEntry {
  id: string
  icon: string
  title: string
  detail: string
  tone: string
  createdAt: number
}

interface TrackerState {
  findings: Finding[]
  engagements: Engagement[]
  activity: ActivityEntry[]
  visited: string[]
  bestStreakDays: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav config
// ─────────────────────────────────────────────────────────────────────────────
const NAV = [
  { to: '/',                icon: Activity,    label: 'Pantheon',          color: '#6366f1' },
  { to: '/chat',            icon: Sparkles,    label: 'Sibyl',       color: '#a855f7' },
  { to: '/nmap',            icon: ScanLine,    label: 'Scout',       color: '#22d3ee' },
  { to: '/cve',             icon: Landmark,    label: 'Oraculum',          color: '#eab308' },
  { to: '/hash',            icon: Lock,        label: 'Cipher',            color: '#818cf8' },
  { to: '/password-cracker',icon: Key,         label: 'Vulcan',   color: '#f97316' },
  { to: '/payload',         icon: Swords,      label: 'Armory',       color: '#ef4444' },
  { to: '/analyzer',        icon: Telescope,   label: 'Lynceus',       color: '#a855f7' },
  { to: '/privesc/linux',   icon: Hammer,      label: 'Daedalus',      color: '#34d399' },
  { to: '/privesc/windows', icon: Feather,     label: 'Icarus',        color: '#fbbf24' },
  { to: '/coach',           icon: Compass,     label: 'Virgil',      color: '#f59e0b' },
  { to: '/gobuster-msf',    icon: BookOpen,    label: 'Mentor', color: '#a855f7' },
  { to: '/wireshark-coach', icon: Eye,         label: 'Argus',    color: '#22d3ee' },
  { to: '/responder-coach', icon: Waves,       label: 'Siren',    color: '#ef4444' },
  { to: '/bloodhound',      icon: Flame,       label: 'Cerberus',   color: '#dc2626' },
  { to: '/cassandra',       icon: Rss,         label: 'Cassandra',          color: '#f97316' },
  { to: '/habits',          icon: Flame,       label: 'Ledger',      color: '#ec4899' },
  { to: '/report',          icon: FileText,    label: 'Scribe',      color: '#22d3ee' },
  { to: '/attack-path',     icon: GitBranch,   label: 'Labyrinth',        color: '#f87171' },
  { to: '/attack-generator', icon: GitMerge,   label: 'Threadweaver',     color: '#eab308' },
  { to: '/vuln-matcher',    icon: Target,      label: 'Nemesis',       color: '#f87171' },
  { to: '/workspace',       icon: Folder,      label: 'Sanctum',          color: '#6366f1' },
  { to: '/kb',              icon: Library,     label: 'Codex',     color: '#a855f7' },
  { to: '/models',          icon: Factory,     label: 'Foundry',             color: '#d97706' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const SEVERITY_META: Record<Severity, { label: string; color: string; weight: number }> = {
  crit: { label: 'Critical', color: '#ef4444', weight: 14 },
  high: { label: 'High',     color: '#f87171', weight: 8  },
  med:  { label: 'Medium',   color: '#fbbf24', weight: 4  },
  low:  { label: 'Low',      color: '#34d399', weight: 1.5 },
}

const STAGE_META: Record<Stage, { label: string; icon: typeof Radar; color: string; routes: string[] }> = {
  recon:        { label: 'Recon',        icon: Radar,          color: '#22d3ee', routes: ['/nmap', '/cve', '/hash', '/analyzer', '/cassandra'] },
  exploitation: { label: 'Exploitation', icon: Crosshair,      color: '#ef4444', routes: ['/payload', '/vuln-matcher', '/attack-generator', '/password-cracker'] },
  privesc:      { label: 'PrivEsc',      icon: ShieldAlert,    color: '#34d399', routes: ['/privesc/linux', '/privesc/windows', '/bloodhound', '/responder-coach'] },
  reporting:    { label: 'Reporting',    icon: ClipboardCheck, color: '#a855f7', routes: ['/report', '/workspace', '/kb', '/attack-path'] },
}

const TRACKER_KEY = 'obscurum:tracker:v1'
const DAY_MS = 86400000

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────
let uidCounter = 0
const uid = () => (++uidCounter).toString(36) + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function emptyTracker(): TrackerState {
  return { findings: [], engagements: [], activity: [], visited: [], bestStreakDays: 0 }
}

function seedTracker(): TrackerState {
  const now = Date.now()
  const e1: Engagement = { id: uid(), label: 'Meridian Corp — Internal Pentest', targetFindings: 12, dueAt: now + 4 * DAY_MS, color: '#f87171', createdAt: now - 6 * DAY_MS }
  const e2: Engagement = { id: uid(), label: 'HTB Season 7 — Grind',            targetFindings: 15, dueAt: null,             color: '#a855f7', createdAt: now - 10 * DAY_MS }
  const mk = (title: string, target: string, severity: Severity, stage: Stage, engagementId: string | null, daysAgo: number): Finding => ({
    id: uid(), title, target, severity, stage, engagementId, resolved: false, resolvedAt: null, createdAt: now - daysAgo * DAY_MS - Math.round(Math.random() * DAY_MS * 0.6),
  })
  const findings: Finding[] = [
    mk('Apache 2.4.49 path traversal', '10.10.14.52', 'crit', 'exploitation', e1.id, 0),
    mk('NTLM hash captured via Responder', 'DC01', 'high', 'privesc', e1.id, 1),
    mk('Anonymous FTP login', '10.10.14.30', 'med', 'recon', e1.id, 1),
    mk('Kerberoastable service account', 'svc_backup', 'high', 'privesc', e1.id, 2),
    mk('Outdated jQuery (XSS)', 'app.meridian.local', 'low', 'recon', e1.id, 3),
    mk('Unquoted service path', 'WIN-SRV02', 'med', 'privesc', e2.id, 3),
    mk('SUID binary misconfiguration', 'box-nightmare', 'high', 'exploitation', e2.id, 4),
    mk('Weak SNMP community string', '10.10.14.10', 'low', 'recon', e2.id, 5),
    mk('Domain Admin via ACL abuse', 'DC01', 'crit', 'privesc', e1.id, 5),
  ]
  const activity: ActivityEntry[] = findings.slice(0, 5).map(f => ({
    id: uid(), icon: f.severity === 'crit' || f.severity === 'high' ? '🛡️' : '🔍', title: 'Finding logged',
    detail: `${f.title} · ${f.target}`, tone: SEVERITY_META[f.severity].color, createdAt: f.createdAt,
  }))
  return { findings, engagements: [e1, e2], activity, visited: [], bestStreakDays: 0 }
}

function loadTracker(): TrackerState {
  try {
    const raw = localStorage.getItem(TRACKER_KEY)
    // First launch: empty workspace (not seeded demo data that looks "real")
    if (!raw) return emptyTracker()
    const parsed = JSON.parse(raw)
    return { ...emptyTracker(), ...parsed }
  } catch {
    return emptyTracker()
  }
}

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts)
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracker Hook
// ─────────────────────────────────────────────────────────────────────────────
function useTracker() {
  const [state, setState] = useState<TrackerState>(() => loadTracker())
  const [storageError, setStorageError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(TRACKER_KEY, JSON.stringify(state))
      setStorageError(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown storage error'
      console.error('Tracker persistence failed:', err)
      setStorageError(msg)
    }
  }, [state])

  const addFinding = (input: { title: string; target: string; severity: Severity; stage: Stage; engagementId: string | null }) => {
    setState(s => {
      const finding: Finding = { ...input, id: uid(), resolved: false, resolvedAt: null, createdAt: Date.now() }
      const entry: ActivityEntry = {
        id: uid(), icon: '🔍', title: 'Finding logged',
        detail: `${finding.title}${finding.target ? ' · ' + finding.target : ''}`,
        tone: SEVERITY_META[finding.severity].color, createdAt: Date.now(),
      }
      return { ...s, findings: [finding, ...s.findings], activity: [entry, ...s.activity].slice(0, 40) }
    })
  }

  const resolveFinding = (id: string) => {
    setState(s => {
      const f = s.findings.find(x => x.id === id)
      if (!f || f.resolved) return s
      const entry: ActivityEntry = { id: uid(), icon: '✅', title: 'Finding resolved', detail: f.title, tone: '#34d399', createdAt: Date.now() }
      return {
        ...s,
        findings: s.findings.map(x => x.id === id ? { ...x, resolved: true, resolvedAt: Date.now() } : x),
        activity: [entry, ...s.activity].slice(0, 40),
      }
    })
  }

  const addEngagement = (input: { label: string; targetFindings: number; dueAt: number | null; color: string }) => {
    setState(s => {
      const engagement: Engagement = { ...input, id: uid(), createdAt: Date.now() }
      const entry: ActivityEntry = { id: uid(), icon: '🎯', title: 'Engagement created', detail: engagement.label, tone: engagement.color, createdAt: Date.now() }
      return { ...s, engagements: [engagement, ...s.engagements], activity: [entry, ...s.activity].slice(0, 40) }
    })
  }

  const markVisited = useCallback((path: string) => {
    setState(s => s.visited.includes(path) ? s : { ...s, visited: [...s.visited, path] })
  }, [])

  const recordStreak = useCallback((days: number) => {
    setState(s => days > s.bestStreakDays ? { ...s, bestStreakDays: days } : s)
  }, [])

  const resetDemo = () => setState(seedTracker())
  const clearAll = () => setState(emptyTracker())

  return { ...state, addFinding, resolveFinding, addEngagement, markVisited, recordStreak, resetDemo, clearAll, storageError }
}
type Tracker = ReturnType<typeof useTracker>

// ─────────────────────────────────────────────────────────────────────────────
// Black Hole Canvas Hook
// ─────────────────────────────────────────────────────────────────────────────
function useBlackHole(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')!

    let W = 0, H = 0, t = 0, raf = 0
    let stars: Star[] = [], streamPts: StreamPoint[] = []
    let resizeTimer: ReturnType<typeof setTimeout> | null = null

    function holeCenter() { return { bx: W * 0.7, by: H * 0.5 } }
    function holeRadius() { return Math.min(W, H) * 0.15 }

    const buildStars = () => {
      stars = Array.from({ length: 260 }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.0 + 0.1, a: Math.random() * 0.55 + 0.1,
        twinkle: Math.random() * Math.PI * 2,
      }))
    }

    const buildStream = () => {
      streamPts = []
      const steps = 220
      const { bx, by } = holeCenter()
      const hR = holeRadius()
      for (let i = 0; i < steps; i++) {
        const frac = i / steps
        const angle = frac * Math.PI * 1.65 - 0.4
        const baseDist = hR * (3.0 - 2.0 * Math.sin(frac * Math.PI))
        const wiggle = Math.sin(frac * Math.PI * 7 + 0.5) * hR * 0.09
        const dist = baseDist + wiggle
        streamPts.push({
          x: bx + Math.cos(angle) * dist,
          y: by + Math.sin(angle) * dist * 0.50,
          frac, bright: Math.sin(frac * Math.PI), width: 2 + Math.sin(frac * Math.PI) * 16,
        })
      }
    }

    const resize = () => {
      const wrap = cv.parentElement
      if (!wrap) return
      W = cv.width = wrap.offsetWidth
      H = cv.height = wrap.offsetHeight
      
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        buildStars()
        buildStream()
        resizeTimer = null
      }, 100)
    }

    function draw() {
      t += 0.011
      ctx.fillStyle = '#010203'
      ctx.fillRect(0, 0, W, H)
      
      const blobs = [
        { x: W * 0.68, y: H * 0.18, r: W * 0.55, c: 'rgba(40,10,70,0.12)' },
        { x: W * 0.16, y: H * 0.78, r: W * 0.45, c: 'rgba(20,40,70,0.08)' },
        { x: W * 0.50, y: H * 0.50, r: W * 0.38, c: 'rgba(15,8,40,0.16)' },
      ]
      blobs.forEach(b => {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r)
        g.addColorStop(0, b.c)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      })

      stars.forEach(s => {
        const alpha = s.a * (0.5 + 0.5 * Math.sin(t * 0.65 + s.twinkle))
        ctx.fillStyle = `rgba(180,185,210,${alpha * 0.7})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      })

      streamPts.forEach((p, i) => {
        if (i === 0) return
        const prev = streamPts[i-1]
        const intensity = Math.max(0, p.bright + Math.sin(t * 1.3) * 0.07)
        if (intensity < 0.05) return
        ctx.strokeStyle = `rgba(120,30,90,${intensity * 0.22})`
        ctx.lineWidth = p.width * 2.8
        ctx.beginPath()
        ctx.moveTo(prev.x, prev.y)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      })

      const { bx, by } = holeCenter()
      const hR = holeRadius()
      ctx.fillStyle = '#000'
      ctx.beginPath()
      ctx.arc(bx, by, hR * 0.96, 0, Math.PI * 2)
      ctx.fill()
      raf = requestAnimationFrame(draw)
    }

    const wrap = cv.parentElement
    if (wrap) {
      W = cv.width = wrap.offsetWidth
      H = cv.height = wrap.offsetHeight
      buildStars()
      buildStream()
    }

    draw()
    window.addEventListener('resize', resize)
    
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      if (resizeTimer) {
        clearTimeout(resizeTimer)
        resizeTimer = null
      }
    }
  }, [])
}

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────
function BrandMark({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={appIcon}
      alt="Obscurum"
      width={size}
      height={size}
      draggable={false}
      className={className}
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

function DragonMark(props: { size?: number; className?: string }) {
  return <BrandMark {...props} />
}

function TitleBar() {
  const minimize = () => window.obscurum?.minimizeWindow?.() ?? window.electronAPI?.minimize?.()
  const maximize = () => window.obscurum?.maximizeWindow?.() ?? window.electronAPI?.maximize?.()
  const close    = () => window.obscurum?.closeWindow?.() ?? window.electronAPI?.close?.()
  return (
    <div className="flex items-center justify-between h-9 px-3 flex-shrink-0 bg-[#010307] border-b border-white/[0.05] select-none titlebar-drag z-50">
      <div className="flex items-center gap-2 titlebar-no-drag">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <DragonMark size={18} />
        </div>
        <span className="text-[10px] font-black tracking-widest text-white/35 uppercase">Obscurum</span>
      </div>
      <div className="flex items-center titlebar-no-drag">
        <button type="button" onClick={minimize} title="Minimize" aria-label="Minimize" className="w-8 h-9 flex items-center justify-center text-white/35 hover:text-white hover:bg-white/5 transition-colors"><Minus size={12} /></button>
        <button type="button" onClick={maximize} title="Maximize" aria-label="Maximize" className="w-8 h-9 flex items-center justify-center text-white/35 hover:text-white hover:bg-white/5 transition-colors"><Maximize2 size={11} /></button>
        <button type="button" onClick={close} title="Close" aria-label="Close" className="w-8 h-9 flex items-center justify-center text-white/35 hover:text-white hover:bg-red-500/80 transition-colors"><X size={12} /></button>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.07] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: 'linear-gradient(160deg, #0e121c 0%, #080a12 55%, #05070c 100%)', boxShadow: '0 24px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-white/70">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-colors"><X size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────────────────────
function Dashboard({ tracker }: { tracker: Tracker }) {
  const navigate    = useNavigate()
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const featuresRef = useRef<HTMLDivElement>(null)
  useBlackHole(canvasRef)

  const scrollToFeatures = () => featuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const [redact, setRedact] = useState(false)
  const [showFindingModal, setShowFindingModal] = useState(false)
  const [showEngagementModal, setShowEngagementModal] = useState(false)
  const [findingForm, setFindingForm] = useState({ title: '', target: '', severity: 'med' as Severity, stage: 'recon' as Stage, engagementId: '' })
  const [engagementForm, setEngagementForm] = useState({ label: '', targetFindings: '10', dueDate: '', color: '#f87171' })

  const [now, setNow] = useState(() => Date.now())
  const dayKey = Math.floor(now / DAY_MS)
  
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (showFindingModal) {
      setFindingForm({ title: '', target: '', severity: 'med', stage: 'recon', engagementId: '' })
    }
  }, [showFindingModal])

  useEffect(() => {
    if (showEngagementModal) {
      setEngagementForm({ label: '', targetFindings: '10', dueDate: '', color: '#f87171' })
    }
  }, [showEngagementModal])

  // ── Features ──
  const features = [
    { to: '/chat',            icon: '✨', label: 'Sibyl',   iconBg: 'rgba(168,85,247,0.2)', desc: 'Streaming chat with automatic model routing between code-focused and reasoning-focused models.' },
    { to: '/nmap',            icon: '🔍', label: 'Scout',   iconBg: 'rgba(34,211,238,0.2)', desc: 'Visual command builder with presets, live output analysis, and AI-generated explanations.' },
    { to: '/cve',             icon: '🏛️', label: 'Oraculum',      iconBg: 'rgba(234,179,8,0.2)', desc: 'Live NVD lookups with CVSS scoring, AI root-cause analysis, and exploitation guidance.' },
    { to: '/hash',            icon: '🔐', label: 'Cipher',        iconBg: 'rgba(129,140,248,0.2)', desc: 'Identify hash formats instantly and get routed to the right cracking strategy.' },
    { to: '/password-cracker',icon: '🔑', label: 'Vulcan', iconBg: 'rgba(249,115,22,0.2)', desc: 'Multi-tool password cracking with hashcat & john. Support for 15+ hash types and attack modes.' },
    { to: '/payload',         icon: '⚔️', label: 'Armory',   iconBg: 'rgba(239,68,68,0.2)', desc: 'Generate obfuscated red team payloads in multiple formats (PowerShell, C#, Python, VBA, etc.) with customizable evasion.' },
    { to: '/privesc/linux',   icon: '🐧', label: 'Daedalus',  iconBg: 'rgba(52,211,153,0.2)', desc: 'Interactive checklist across 10 categories — SUID, sudo, cron, capabilities, and more.' },
    { to: '/privesc/windows', icon: '🪽', label: 'Icarus',    iconBg: 'rgba(251,191,36,0.2)', desc: 'Kerberoasting, ADCS abuse, token privileges, and credential hunting in one checklist.' },
    { to: '/coach',           icon: '🧭', label: 'Virgil',  iconBg: 'rgba(245,158,11,0.2)', desc: 'Methodology-driven AI coach that gives hints, not answers — built for genuine skill growth.' },
    { to: '/gobuster-msf',    icon: '📖', label: 'Mentor', iconBg: 'rgba(168,85,247,0.2)', desc: 'Learn how to use Gobuster for enumeration and Metasploit for exploitation with interactive guides.' },
    { to: '/wireshark-coach', icon: '👁️', label: 'Argus', iconBg: 'rgba(34,211,238,0.2)', desc: 'Master network traffic analysis for penetration testing and red team operations with hands-on filters.' },
    { to: '/responder-coach', icon: '🌊', label: 'Siren', iconBg: 'rgba(239,68,68,0.2)', desc: 'Understand LLMNR/NBT-NS poisoning and NTLM hash capture with Responder. Learn detection and defense.' },
    { to: '/bloodhound',      icon: '🐉', label: 'Cerberus', iconBg: 'rgba(220,38,38,0.2)', desc: 'Master Active Directory attack paths using BloodHound — from data collection to Cypher queries and exploitation chains.' },
    { to: '/cassandra',       icon: '📡', label: 'Cassandra',       iconBg: 'rgba(249,115,22,0.2)', desc: 'Intelligence feed aggregator for real-time threat data, CVE alerts, and adversary tracking.' },
    { to: '/habits',          icon: '🔥', label: 'Ledger',   iconBg: 'rgba(236,72,153,0.2)', desc: 'Daily study habits with categories, reminders, a consistency heatmap, and XP/leveling.' },
    { to: '/report',          icon: '📄', label: 'Scribe',  iconBg: 'rgba(34,211,238,0.2)', desc: 'AI-assisted executive summaries and findings, exported straight to markdown.' },
    { to: '/attack-path',     icon: '🕸️', label: 'Labyrinth',    iconBg: 'rgba(248,113,113,0.2)', desc: 'Interactive node graph for mapping exploitation chains from foothold to domain admin.' },
    { to: '/attack-generator', icon: '🧵', label: 'Threadweaver', iconBg: 'rgba(234,179,8,0.2)', desc: 'Automatically generate attack paths from scan results — discover exploitation chains instantly.' },
    { to: '/vuln-matcher',    icon: '🎯', label: 'Nemesis',   iconBg: 'rgba(248,113,113,0.2)', desc: 'Match services to CVEs and working exploits. Find the best attack vectors for your target.' },
    { to: '/analyzer',        icon: '🔭', label: 'Lynceus',   iconBg: 'rgba(168,85,247,0.2)', desc: 'Parse raw tool output and get AI-suggested next steps for the service in front of you.' },
    { to: '/workspace',       icon: '📁', label: 'Sanctum',      iconBg: 'rgba(99,102,241,0.2)', desc: 'Track targets, findings, credentials, and notes across multiple simultaneous engagements.' },
    { to: '/kb',              icon: '📚', label: 'Codex', iconBg: 'rgba(168,85,247,0.2)', desc: 'Local RAG-powered cheatsheets — searchable, offline, yours.' },
    { to: '/models',          icon: '🏭', label: 'Foundry',         iconBg: 'rgba(217,119,6,0.2)', desc: 'Manage and switch Ollama models, local or cloud, per task.' },
  ]

  const quickActions = [
    { label: 'New Target',  icon: Plus,           to: '/workspace', color: '#34d399' },
    { label: 'Run Nmap',    icon: ScanLine,       to: '/nmap',      color: '#22d3ee' },
    { label: 'Sibyl',icon: Bot,            to: '/chat',      color: '#2DD4A7' },
    { label: 'More Tools',  icon: MoreHorizontal, to: null,         color: '#8b93a7', action: scrollToFeatures },
  ]

  // ── Memoized calculations ──
  const riskScore = useMemo(() => {
    const active = tracker.findings.filter(f => f.createdAt <= now && (!f.resolved || (f.resolvedAt ?? Infinity) > now))
    const raw = active.reduce((sum, f) => sum + SEVERITY_META[f.severity].weight, 0)
    return Math.min(100, Math.round(raw))
  }, [tracker.findings, now])

  const riskWeekAgo = useMemo(() => {
    const weekAgo = now - 7 * DAY_MS
    const active = tracker.findings.filter(f => f.createdAt <= weekAgo && (!f.resolved || (f.resolvedAt ?? Infinity) > weekAgo))
    const raw = active.reduce((sum, f) => sum + SEVERITY_META[f.severity].weight, 0)
    return Math.min(100, Math.round(raw))
  }, [tracker.findings, now])
  const riskDelta = riskScore - riskWeekAgo

  const weeklyFindings = useMemo(() => {
    const today = startOfDay(now)
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = today - (6 - i) * DAY_MS
      const dayEnd = dayStart + DAY_MS
      const dayFindings = tracker.findings.filter(f => f.createdAt >= dayStart && f.createdAt < dayEnd)
      const count = (sev: Severity) => dayFindings.filter(f => f.severity === sev).length
      return {
        d: new Date(dayStart).toLocaleDateString(undefined, { weekday: 'short' }),
        crit: count('crit'), high: count('high'), med: count('med'), low: count('low'),
      }
    })
  }, [tracker.findings, dayKey])

  const maxDay = Math.max(1, ...weeklyFindings.map(d => d.crit + d.high + d.med + d.low))

  const currentStreakDays = useMemo(() => {
    let streak = 0
    for (let i = weeklyFindings.length - 1; i >= 0; i--) {
      const day = weeklyFindings[i]
      if (day.crit + day.high + day.med + day.low > 0) streak++
      else break
    }
    return streak
  }, [weeklyFindings])

  // Only depend on the stable callback + streak value (avoid re-firing on every tracker object identity change)
  const recordStreak = tracker.recordStreak
  useEffect(() => {
    recordStreak(currentStreakDays)
  }, [currentStreakDays, recordStreak])

  const methodology = useMemo(() => {
    const stages = Object.keys(STAGE_META) as Stage[]
    return stages.map(stage => {
      const meta = STAGE_META[stage]
      const visitedCount = meta.routes.filter(r => tracker.visited.includes(r)).length
      return { 
        label: meta.label, 
        icon: meta.icon, 
        pct: Math.round((visitedCount / meta.routes.length) * 100), 
        color: meta.color, 
        to: meta.routes[0] 
      }
    })
  }, [tracker.visited])

  const recentActivity = useMemo(
    () => tracker.activity.slice(0, 5).map(a => ({ ...a, time: relativeTime(a.createdAt, now) })),
    [tracker.activity, now]
  )

  const objectives = useMemo(() => tracker.engagements.map(e => {
    const count = tracker.findings.filter(f => f.engagementId === e.id).length
    const pct = Math.min(100, Math.round((count / Math.max(1, e.targetFindings)) * 100))
    const sub = e.dueAt
      ? (e.dueAt > now ? `Due in ${Math.max(1, Math.ceil((e.dueAt - now) / DAY_MS))} days` : `Overdue by ${Math.ceil((now - e.dueAt) / DAY_MS)} days`)
      : `${count} of ${e.targetFindings} findings`
    return { id: e.id, label: e.label, sub, pct, color: e.color }
  }), [tracker.engagements, tracker.findings, now])

  const SEV_ORDER: Severity[] = ['crit', 'high', 'med', 'low']
  const openFindingsAll = useMemo(
    () => tracker.findings
      .filter(f => !f.resolved)
      .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || b.createdAt - a.createdAt),
    [tracker.findings]
  )
  const openFindings = openFindingsAll.slice(0, 5)
  const openFindingsCount = openFindingsAll.length

  // Redaction
  const sensitiveTerms = useMemo(() => {
    const s = new Set<string>()
    tracker.engagements.forEach(e => s.add(e.label))
    tracker.findings.forEach(f => { if (f.target) s.add(f.target) })
    return Array.from(s).filter(Boolean).sort((a, b) => b.length - a.length)
  }, [tracker.engagements, tracker.findings])

  const maskTerm = (s: string) =>
    s.replace(/[A-Za-z0-9]+/g, tok => '•'.repeat(Math.min(Math.max(tok.length, 4), 8)))

  const redactText = (text: string) => {
    if (!redact) return text
    let out = text
    for (const term of sensitiveTerms) if (out.includes(term)) out = out.split(term).join(maskTerm(term))
    return out
  }

  return (
    <div className="relative w-full h-full overflow-auto custom-scrollbar">
      {tracker.storageError && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-xl w-full mx-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm">
          <p className="text-xs text-red-400 text-center font-mono">
            ⚠️ Storage error: {tracker.storageError}. Your data may not persist.
          </p>
        </div>
      )}

      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-10 pb-20">
        {/* Profile header */}
        <header className="flex items-end justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center flex-shrink-0">
              <DragonMark size={65} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black tracking-tight">operator</h2>
                <span className="text-white/30 text-lg font-bold">#GS</span>
                <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-widest text-white/50 bg-white/5 border border-white/[0.07] rounded px-2 py-0.5">
                  {riskScore >= 50 ? 'HIGH EXPOSURE' : riskScore >= 20 ? 'MODERATE' : 'LOW RISK'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => {
                if (tracker.findings.length > 0 || tracker.engagements.length > 0) {
                  const ok = window.confirm('Replace your current findings and engagements with sample demo data?')
                  if (!ok) return
                }
                tracker.resetDemo()
              }}
              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-[#2DD4A7]/10 border border-[#2DD4A7]/30 text-[#2DD4A7] hover:bg-[#2DD4A7]/20 hover:border-[#2DD4A7]/35 transition-colors rounded-xl"
            >
              Load sample data
            </button>
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm('Clear all findings, engagements, and activity? This cannot be undone.')
                if (!ok) return
                tracker.clearAll()
              }}
              className="px-4 py-2 text-[10px] font-black uppercase tracking-widest border border-white/[0.08] text-white/70 hover:border-red-400/50 hover:text-red-300 transition-colors rounded-xl"
            >
              Clear all data
            </button>
          </div>
        </header>

        {/* Level / Tier / Streak row */}
        <section className="grid grid-cols-3 gap-6 mb-8">
          {/* Risk Level card */}
          <div className="p-6 rounded-2xl bg-[#0a0c14] border border-white/[0.07] flex flex-col">
            <div className="flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-6">
              Attack Surface Exposure
              <button
                type="button"
                onClick={() => setRedact(r => !r)}
                title={redact ? 'Show real names/targets' : 'Redact sensitive labels (for screenshots)'}
                aria-label={redact ? 'Disable redaction' : 'Enable redaction'}
                className="ml-auto text-white/20 hover:text-white transition-colors"
              >
                {redact ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-4">
              <div className="w-20 h-20 rounded-full bg-[#06080f] border-2 border-[#2DD4A7]/40 flex items-center justify-center mb-3">
                <Shield size={32} className="text-[#2DD4A7]" />
              </div>
              <div className="text-4xl font-black tracking-tighter">{riskScore}</div>
              <div className={'flex items-center gap-1.5 mt-2 text-[10px] font-bold ' + (riskDelta > 0 ? 'text-red-400' : riskDelta < 0 ? 'text-emerald-400' : 'text-white/30')}>
                {riskDelta > 0 ? <TrendingUp size={12} /> : riskDelta < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                {riskDelta === 0 ? 'NO CHANGE' : `${riskDelta > 0 ? '+' : ''}${riskDelta} THIS WEEK`}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">
                <span>Risk Score</span><span>{riskScore}/100</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-[#2DD4A7] transition-all duration-700" style={{ width: `${riskScore}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/5">
              <div className="text-center">
                <div className="text-sm font-black">{tracker.engagements.length}</div>
                <div className="text-white/30 text-[9px] font-bold uppercase tracking-widest">Engagements</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-black">{openFindingsCount}</div>
                <div className="text-white/30 text-[9px] font-bold uppercase tracking-widest">Open Findings</div>
              </div>
            </div>
          </div>

          {/* Methodology tier card */}
          <div className="p-6 rounded-2xl bg-[#0a0c14] border border-white/[0.07] flex flex-col">
            <div className="flex items-center justify-between text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-6">
              Methodology Coverage
            </div>
            <div className="flex-1 flex flex-col items-center justify-center py-4">
              <div className="w-20 h-20 rounded-2xl bg-[#06080f] border-2 border-[#2DD4A7]/40 flex items-center justify-center mb-3 rotate-45">
                <Radar size={30} className="text-[#2DD4A7] -rotate-45" />
              </div>
              <div className="text-4xl font-black tracking-tighter">
                {Math.round(methodology.reduce((s, m) => s + m.pct, 0) / methodology.length)}%
              </div>
              <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest mt-2">Overall Coverage</div>
            </div>
            <div className="space-y-2.5">
              {methodology.map(m => (
                <button type="button" key={m.label} onClick={() => navigate(m.to)} className="w-full flex items-center gap-2 group">
                  <span className="text-[9px] font-black text-white/40 group-hover:text-white uppercase tracking-widest w-16 text-left flex-shrink-0 truncate">{m.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full transition-all duration-700" style={{ width: `${m.pct}%`, background: m.color }} />
                  </div>
                  <span className="text-[9px] font-mono text-white/30 w-8 text-right flex-shrink-0">{m.pct}%</span>
                </button>
              ))}
            </div>
          </div>

          {/* Streak card */}
          <div className="p-6 rounded-2xl bg-[#0a0c14] border border-white/[0.07] flex flex-col">
            <div className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-6">Weekly Streak</div>
            <div className="flex items-center gap-3 mb-6">
              <Flame size={28} className="text-[#2DD4A7]" />
              <span className="text-3xl font-black tracking-tighter">{currentStreakDays} {currentStreakDays === 1 ? 'day' : 'days'}</span>
            </div>
            <div className="mb-6">
              <div className="flex items-center justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">
                <span>This week</span><span>{weeklyFindings.reduce((s, d) => s + d.crit + d.high + d.med + d.low, 0)} findings</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full bg-[#2DD4A7] transition-all duration-700" style={{ width: `${Math.min(100, (currentStreakDays / 7) * 100)}%` }} />
              </div>
            </div>
            <div className="mt-auto pt-4 border-t border-white/5 flex items-center gap-2 text-[10px] font-bold text-white/30 uppercase tracking-widest">
              <TrendingUp size={12} className="text-[#2DD4A7]" />
              Personal best: {Math.max(currentStreakDays, tracker.bestStreakDays)} days
            </div>
          </div>
        </section>

        {/* Quick actions row */}
        <section className="grid grid-cols-4 gap-4 mb-10">
          {quickActions.map(qa => (
            <button type="button" key={qa.label} onClick={() => (qa.to ? navigate(qa.to) : qa.action?.())} className="flex items-center gap-3 p-4 rounded-xl bg-[#0a0c14] border border-white/[0.07] hover:border-[#2DD4A7]/40 hover:bg-white/5 transition-colors group">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 group-hover:bg-[#2DD4A7]/15 transition-colors flex-shrink-0">
                <qa.icon size={18} style={{ color: qa.color }} />
              </div>
              <span className="text-[10px] font-black text-white/40 group-hover:text-white uppercase tracking-widest">{qa.label}</span>
            </button>
          ))}
        </section>

        {/* Weekly Findings Breakdown */}
        <section className="mb-10 p-8 rounded-2xl bg-[#0a0c14] border border-white/[0.07]">
          <div className="flex items-center justify-between mb-8">
            <div className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Weekly Findings</div>
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-4">
                {(Object.keys(SEVERITY_META) as Severity[]).map(sev => (
                  <span key={sev} className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full" style={{ background: SEVERITY_META[sev].color }} />
                    {sev}
                  </span>
                ))}
              </div>
              <button type="button" onClick={() => setShowFindingModal(true)} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/[0.07] hover:border-[#2DD4A7]/35 rounded-xl px-3 py-1.5 transition-colors">
                <Plus size={12} /> Log Finding
              </button>
            </div>
          </div>
          {tracker.findings.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-xs font-bold text-white/30 uppercase tracking-widest">No findings logged yet</p>
              <p className="text-[11px] text-white/20">Log a finding to start tracking risk over time.</p>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-4 items-end h-40">
              {weeklyFindings.map(day => {
                const total = day.crit + day.high + day.med + day.low
                return (
                  <div key={day.d} className="flex flex-col items-center gap-2 h-full">
                    <div className="flex-1 w-full flex flex-col-reverse rounded-sm overflow-hidden bg-white/5" style={{ height: `${(total / maxDay) * 100}%` }}>
                      {(['low', 'med', 'high', 'crit'] as const).map(sev => (
                        day[sev] > 0 && (
                          <div key={sev} style={{ height: `${(day[sev] / total) * 100}%`, background: SEVERITY_META[sev].color }} />
                        )
                      ))}
                    </div>
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{day.d}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Open Findings</div>
              {openFindingsCount > openFindings.length && (
                <span className="text-[10px] text-white/25 font-mono">showing {openFindings.length} of {openFindingsCount}</span>
              )}
            </div>
            {openFindings.length === 0 ? (
              <p className="text-[11px] text-white/20 font-medium">No open findings — everything logged so far has been resolved.</p>
            ) : (
              <div className="space-y-2">
                {openFindings.map(f => (
                  <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-transparent hover:border-white/[0.07]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SEVERITY_META[f.severity].color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{redactText(f.title)}</div>
                      <div className="text-[10px] text-white/30 font-mono truncate">{redactText(f.target || '—')} · {STAGE_META[f.stage].label}</div>
                    </div>
                    <button type="button" onClick={() => tracker.resolveFinding(f.id)} className="flex-shrink-0 text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white px-3 py-1.5 rounded-xl border border-white/[0.07] hover:border-[#2DD4A7]/40 transition-colors">Resolve</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="grid grid-cols-5 gap-6 mb-10">
          <div className="col-span-3 p-8 rounded-2xl bg-[#0a0c14] border border-white/[0.07]">
            <div className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] mb-8">Recent Activity</div>
            {recentActivity.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center gap-2 text-center">
                <p className="text-xs font-bold text-white/30 uppercase tracking-widest">Nothing here yet</p>
                <p className="text-[11px] text-white/20">Logged findings and engagements will show up here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.map(a => (
                  <div key={a.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/[0.07] hover:border-[#2DD4A7]/35 transition-colors">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: `${a.tone}1a` }}>{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-black uppercase tracking-wider">{a.title}</div>
                      <div className="text-[10px] text-white/40 font-mono truncate">{redactText(a.detail)}</div>
                    </div>
                    <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest flex items-center gap-2 flex-shrink-0"><Clock size={12} /> {a.time}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="col-span-2 p-8 rounded-2xl bg-[#0a0c14] border border-white/[0.07]">
            <div className="flex items-center justify-between mb-8">
              <div className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">Active Objectives</div>
              <button type="button" onClick={() => setShowEngagementModal(true)} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/[0.07] hover:border-[#2DD4A7]/35 rounded-xl px-3 py-1.5 transition-colors">
                <Plus size={12} /> New
              </button>
            </div>
            {objectives.length === 0 ? (
              <div className="h-32 flex flex-col items-center justify-center gap-2 text-center">
                <p className="text-xs font-bold text-white/30 uppercase tracking-widest">No engagements yet</p>
                <p className="text-[11px] text-white/20">Create one to start tracking progress.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {objectives.map(o => (
                  <div key={o.id}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-black uppercase tracking-wider truncate mr-4">{redactText(o.label)}</span>
                      <span className="text-[10px] font-mono text-white/40">{o.pct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${o.pct}%`, background: o.color }} />
                    </div>
                    <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest mt-2">{o.sub}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Features Grid */}
        <section ref={featuresRef} className="pt-10 scroll-mt-10">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-4xl font-black tracking-tighter mb-2">CAPABILITIES</h2>
              <p className="text-white/40 text-xs font-medium tracking-wide">EVERYTHING YOU NEED, IN ONE PLACE</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(f => (
              <NavLink key={f.to} to={f.to} className="group relative flex flex-col rounded-2xl overflow-hidden bg-[#0a0c14] border border-white/[0.07] hover:border-[#2DD4A7]/35 transition-all duration-300">
                <div className="relative h-24 flex items-center justify-center flex-shrink-0" style={{ background: f.iconBg }}>
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0a0c14] to-transparent" />
                  <span className="relative text-3xl group-hover:scale-110 transition-transform">{f.icon}</span>
                  <div className="absolute top-3 right-3 w-7 h-7 rounded-xl bg-black/30 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight size={14} className="text-white" />
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <h3 className="text-sm font-black text-white tracking-tight mb-1.5 uppercase">{f.label}</h3>
                  <p className="text-white/40 text-xs leading-relaxed line-clamp-2 font-medium">{f.desc}</p>
                </div>
              </NavLink>
            ))}
          </div>
        </section>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
      `}} />

      {showFindingModal && (
        <Modal title="Log Finding" onClose={() => setShowFindingModal(false)}>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              if (!findingForm.title.trim()) return
              tracker.addFinding({
                title: findingForm.title.trim(),
                target: findingForm.target.trim(),
                severity: findingForm.severity,
                stage: findingForm.stage,
                engagementId: findingForm.engagementId || null,
              })
              setShowFindingModal(false)
            }}
          >
            <div>
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Title</label>
              <input autoFocus value={findingForm.title} onChange={e => setFindingForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Apache 2.4.49 path traversal" className="w-full rounded-xl bg-white/5 border border-white/[0.07] focus:border-[#2DD4A7]/30 outline-none px-4 py-2.5 text-sm placeholder:text-white/20" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Target</label>
              <input value={findingForm.target} onChange={e => setFindingForm(f => ({ ...f, target: e.target.value }))} placeholder="e.g. 10.10.14.52 or DC01" className="w-full rounded-xl bg-white/5 border border-white/[0.07] focus:border-[#2DD4A7]/30 outline-none px-4 py-2.5 text-sm placeholder:text-white/20 font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Severity</label>
                <select value={findingForm.severity} onChange={e => setFindingForm(f => ({ ...f, severity: e.target.value as Severity }))} className="w-full rounded-xl bg-white/5 border border-white/[0.07] focus:border-[#2DD4A7]/30 outline-none px-4 py-2.5 text-sm">
                  {(Object.keys(SEVERITY_META) as Severity[]).map(sev => <option key={sev} value={sev} className="bg-[#0d1022]">{SEVERITY_META[sev].label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Stage</label>
                <select value={findingForm.stage} onChange={e => setFindingForm(f => ({ ...f, stage: e.target.value as Stage }))} className="w-full rounded-xl bg-white/5 border border-white/[0.07] focus:border-[#2DD4A7]/30 outline-none px-4 py-2.5 text-sm">
                  {(Object.keys(STAGE_META) as Stage[]).map(stage => <option key={stage} value={stage} className="bg-[#0d1022]">{STAGE_META[stage].label}</option>)}
                </select>
              </div>
            </div>
            {tracker.engagements.length > 0 && (
              <div>
                <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Engagement</label>
                <select value={findingForm.engagementId} onChange={e => setFindingForm(f => ({ ...f, engagementId: e.target.value }))} className="w-full rounded-xl bg-white/5 border border-white/[0.07] focus:border-[#2DD4A7]/30 outline-none px-4 py-2.5 text-sm">
                  <option value="" className="bg-[#0d1022]">— none —</option>
                  {tracker.engagements.map(e => <option key={e.id} value={e.id} className="bg-[#0d1022]">{e.label}</option>)}
                </select>
              </div>
            )}
            <button type="submit" className="w-full mt-2 rounded-xl bg-gradient-to-br from-[#2DD4A7] to-[#16A883] text-black text-xs font-black uppercase tracking-widest py-3 hover:opacity-90 transition-opacity">Log Finding</button>
          </form>
        </Modal>
      )}

      {showEngagementModal && (
        <Modal title="New Engagement" onClose={() => setShowEngagementModal(false)}>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              const target = Math.max(1, parseInt(engagementForm.targetFindings, 10) || 1)
              if (!engagementForm.label.trim()) return
              tracker.addEngagement({
                label: engagementForm.label.trim(),
                targetFindings: target,
                dueAt: engagementForm.dueDate ? new Date(engagementForm.dueDate).getTime() : null,
                color: engagementForm.color,
              })
              setShowEngagementModal(false)
            }}
          >
            <div>
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Name</label>
              <input autoFocus value={engagementForm.label} onChange={e => setEngagementForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Acme Corp — External Pentest" className="w-full rounded-xl bg-white/5 border border-white/[0.07] focus:border-[#2DD4A7]/30 outline-none px-4 py-2.5 text-sm placeholder:text-white/20" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Target findings</label>
                <input type="number" min={1} value={engagementForm.targetFindings} onChange={e => setEngagementForm(f => ({ ...f, targetFindings: e.target.value }))} className="w-full rounded-xl bg-white/5 border border-white/[0.07] focus:border-[#2DD4A7]/30 outline-none px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Due date (optional)</label>
                <input type="date" value={engagementForm.dueDate} onChange={e => setEngagementForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full rounded-xl bg-white/5 border border-white/[0.07] focus:border-[#2DD4A7]/30 outline-none px-4 py-2.5 text-sm [color-scheme:dark]" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Color</label>
              <div className="flex items-center gap-2">
                {['#f87171', '#22d3ee', '#a855f7', '#34d399', '#fbbf24', '#6366f1'].map(c => (
                  <button type="button" key={c} onClick={() => setEngagementForm(f => ({ ...f, color: c }))} className="w-7 h-7 rounded-full transition-transform" style={{ background: c, transform: engagementForm.color === c ? 'scale(1.2)' : 'scale(1)', boxShadow: engagementForm.color === c ? `0 0 0 2px #0B121F, 0 0 0 4px ${c}` : 'none' }} />
                ))}
              </div>
            </div>
            <button type="submit" className="w-full mt-2 rounded-xl bg-gradient-to-br from-[#2DD4A7] to-[#16A883] text-black text-xs font-black uppercase tracking-widest py-3 hover:opacity-90 transition-opacity">Create Engagement</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// App root
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'running' | 'launched' | 'not_found'>('checking')
  const [navQuery, setNavQuery] = useState('')
  const location = useLocation()
  const active   = NAV.find(n => n.to === location.pathname) ?? NAV.find(n => n.to !== '/' && location.pathname.startsWith(n.to))
  const tracker  = useTracker()
  const markVisited = tracker.markVisited

  const filteredNav = useMemo(() => {
    const q = navQuery.trim().toLowerCase()
    if (!q) return NAV
    return NAV.filter(n => n.label.toLowerCase().includes(q) || n.to.toLowerCase().includes(q))
  }, [navQuery])

  const lastVisitedRef = useRef<string | null>(null)
  
  useEffect(() => {
    if (lastVisitedRef.current !== location.pathname) {
      lastVisitedRef.current = location.pathname
      markVisited(location.pathname)
    }
  }, [location.pathname, markVisited])

  useEffect(() => {
    if (!window.obscurum?.ensureOllamaAvailable) return
    void window.obscurum.ensureOllamaAvailable().then((status) => setOllamaStatus(status))
  }, [])

  return (
    <div
      className="flex flex-col h-screen overflow-hidden font-sans text-white selection:bg-[#2DD4A7]/30"
      style={{ background: 'radial-gradient(ellipse 100% 80% at 50% -20%, #0c1220 0%, #060912 35%, #03050a 65%, #010203 100%)' }}
    >
      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        html, body, #root { background: #010203; color-scheme: dark; }
        /* Dark-native form controls */
        input, select, textarea { color-scheme: dark; }
        /* Subtle scrollbar that matches void chrome */
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }
      `}</style>
      <TitleBar />
      <div className="flex flex-1 min-h-0 overflow-hidden relative z-10">
        <aside
          className={
            'flex flex-col bg-[#02040a]/98 backdrop-blur-xl border-r border-white/[0.05] ' +
            'transition-all duration-200 flex-shrink-0 ' + (collapsed ? 'w-16' : 'w-64')
          }
        >
          <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.07]">
            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
              <DragonMark size={32} />
            </div>
            {!collapsed && <span className="text-[10px] font-black tracking-[0.3em] uppercase">Obscurum</span>}
          </div>

          {!collapsed && (
            <div className="px-3 pt-3">
              <input
                value={navQuery}
                onChange={e => setNavQuery(e.target.value)}
                placeholder="Filter tools…"
                className="w-full rounded-xl bg-white/5 border border-white/[0.07] px-3 py-2 text-[11px] text-white/80 placeholder:text-white/25 outline-none focus:border-[#2DD4A7]/40"
              />
            </div>
          )}
          <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1 custom-scrollbar">
            {filteredNav.length === 0 && (
              <p className="text-[10px] text-white/30 px-3 py-2">No tools match “{navQuery}”</p>
            )}
            {filteredNav.map(({ to, icon: Icon, label, color }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                title={label}
                className={({ isActive }) =>
                  'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest ' +
                  'transition-all duration-150 ' +
                  (isActive
                    ? 'bg-[#2DD4A7]/10 text-white'
                    : 'text-white/40 hover:text-white hover:bg-white/5')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={'absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full transition-colors duration-150 ' + (isActive ? 'bg-[#2DD4A7]' : 'bg-transparent')} />
                    <Icon size={16} className="flex-shrink-0" style={{ color: isActive ? '#2DD4A7' : color }} />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          {!collapsed && (
            <div className="px-5 py-2 text-[9px] tracking-[0.15em] uppercase text-white/20 border-t border-white/[0.07]">
              Created by Zack Vance
            </div>
          )}
          <button type="button" onClick={() => setCollapsed(c => !c)} className="flex items-center justify-center p-4 border-t border-white/[0.07] text-white/20 hover:text-white transition-colors">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </aside>

        <div className="flex flex-col flex-1 min-w-0 relative">
          <header className="flex flex-col flex-shrink-0 bg-[#02040a]/95 backdrop-blur-md border-b border-white/[0.05]">
            {ollamaStatus === 'not_found' && (
              <div className="flex items-center justify-center bg-amber-600/90 px-4 py-2 text-[11px] font-semibold text-white">
                Ollama was not detected. Install it or launch it before using local models.
              </div>
            )}
            <div className="flex items-center gap-4 px-6 py-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <span className="text-white/20 text-[10px] font-black tracking-widest">~/</span>
                <span className="text-white text-[10px] font-black uppercase tracking-widest truncate">{active?.label ?? 'Pantheon'}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="hidden md:flex items-center gap-2 text-[10px] font-black text-white/40 uppercase tracking-widest px-3 py-2 rounded-xl bg-white/5 border border-white/[0.07]">
                  <span className="relative w-2 h-2 flex-shrink-0">
                    {ollamaStatus !== 'not_found' && (
                      <span className="absolute inset-0 rounded-full bg-[#2DD4A7]/50 blur-[2px] animate-ping" />
                    )}
                    <span className={`absolute inset-0 rounded-full ${ollamaStatus === 'not_found' ? 'bg-amber-400' : ollamaStatus === 'checking' ? 'bg-white/40' : 'bg-[#2DD4A7]'}`} />
                  </span>
                  {ollamaStatus === 'not_found' ? 'Ollama unavailable' : ollamaStatus === 'checking' ? 'Checking Ollama…' : 'Ollama connected'}
                </span>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto relative p-4 animate-[fadeIn_0.25s_ease-out] bg-transparent">
            <Routes>
              <Route path="/"                element={<Dashboard tracker={tracker} />} />
              <Route path="/chat"            element={<ChatWindow />} />
              <Route path="/nmap"            element={<NmapBuilder />} />
              <Route path="/cve"             element={<CVECenter />} />
              <Route path="/hash"            element={<HashIdentifier />} />
              <Route path="/password-cracker" element={<PasswordCracker />} />
              <Route path="/payload"          element={<PayloadForge />} />
              <Route path="/analyzer"        element={<ServiceAnalyzer />} />
              <Route path="/privesc/linux"   element={<LinuxPrivesc />} />
              <Route path="/privesc/windows" element={<WindowsPrivesc />} />
              <Route path="/coach"           element={<HTBCoach />} />
              <Route path="/gobuster-msf"    element={<GobusterMSFCoach />} />
              <Route path="/wireshark-coach" element={<WiresharkCoach />} />
              <Route path="/responder-coach" element={<ResponderCoach />} />
              <Route path="/bloodhound"      element={<BloodHoundCoach />} />
              <Route path="/cassandra"       element={<Cassandra />} />
              <Route path="/habits"          element={<HabitTracker />} />
              <Route path="/report"          element={<ReportWriter />} />
              <Route path="/attack-path"     element={<AttackPath />} />
              <Route path="/attack-generator" element={<AttackPathGenerator />} />
              <Route path="/vuln-matcher"    element={<VulnerabilityMatcher />} />
              <Route path="/workspace"       element={<Workspace />} />
              <Route path="/kb"              element={<KnowledgeBase />} />
              <Route path="/models"          element={<ModelManager />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  )
}