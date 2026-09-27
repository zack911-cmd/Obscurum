import appIcon from './assets/app-icon.png'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  useState, useRef, useEffect, useMemo, useCallback, memo, lazy, Suspense,
  startTransition, createContext, useContext, type ReactNode,
} from 'react'
import {
  Minus, Maximize2, X, ChevronRight,
  Shield, FileText, GitBranch, Folder,
  BookOpen, Activity, GitMerge, Target, Key,
  Crosshair, Rss, Eye, TrendingUp, TrendingDown,
  Radar, ShieldAlert, ClipboardCheck, ScanLine,
  Flame, Feather, Compass, Lock, Library,
  Sparkles, Landmark, Swords, Hammer, Waves, Telescope, Factory, Globe, Radio,
  Server, Monitor, Users, Settings,
} from 'lucide-react'

/* ─── Lazy-loaded tools ─────────────────────────────────────────────── */
const ChatWindow           = lazy(() => import('./components/chat/ChatWindow'))

/**
 * Chat (Sibyl) entry — keep the click→paint path cheap.
 * 1) Show a lightweight shell immediately (no heavy tree).
 * 2) Kick off the lazy chunk right away (already started on hover).
 * 3) Mount ChatWindow only after the browser has painted, via startTransition
 *    so React treats the heavy tree as non-urgent (better INP).
 */
function DeferredChat() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Ensure the chunk is fetching even if the user skipped hover-prefetch.
    void import('./components/chat/ChatWindow')

    let cancelled = false
    let raf1 = 0
    let raf2 = 0
    let timeoutId = 0

    // Wait for two frames (shell paints), then a short idle gap before mounting.
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        // Yield to input/paint; avoid mounting on the same turn as navigation.
        timeoutId = window.setTimeout(() => {
          if (!cancelled) {
            startTransition(() => setReady(true))
          }
        }, 50)
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
      if (timeoutId) window.clearTimeout(timeoutId)
    }
  }, [])

  if (!ready) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#050607]">
        <div
          className="h-8 w-8 rounded-full border-2 border-white/10 border-t-[var(--accent,#00E0A4)] animate-spin"
          style={{ animationDuration: '0.7s' }}
        />
        <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Opening Sibyl…</div>
      </div>
    )
  }

  return (
    <Suspense fallback={<ToolFallback />}>
      <ChatWindow />
    </Suspense>
  )
}
const LinuxPrivesc         = lazy(() => import('./components/privesc/LinuxPrivesc'))
const WindowsPrivesc       = lazy(() => import('./components/privesc/WindowsPrivesc'))
const CVECenter            = lazy(() => import('./components/cve/CVECenter'))
const HashIdentifier       = lazy(() => import('./components/hash/HashIdentifier'))
const NmapBuilder          = lazy(() => import('./components/nmap/NmapBuilder'))
const ServiceAnalyzer      = lazy(() => import('./components/analyzer/ServiceAnalyzer'))
const HTBCoach             = lazy(() => import('./components/coach/HTBCoach'))
const GobusterMSFCoach     = lazy(() => import('./components/coach/GobusterMSFCoach'))
const WiresharkCoach       = lazy(() => import('./components/coach/WiresharkCoach'))
const ResponderCoach       = lazy(() => import('./components/coach/ResponderCoach'))
const WebAppCoach          = lazy(() => import('./components/coach/WebAppCoach'))
const BloodHoundCoach      = lazy(() => import('./components/coach/BloodHoundCoach'))
const ADAttackHelper       = lazy(() => import('./components/attack/ADAttackHelper'))
const ReportWriter         = lazy(() => import('./components/report/ReportWriter'))
const AttackPath           = lazy(() => import('./components/attack/AttackPath'))
const AttackPathGenerator  = lazy(() => import('./components/attack/AttackPathGenerator'))
const VulnerabilityMatcher = lazy(() => import('./components/attack/VulnerabilityMatcher'))
const PasswordCracker      = lazy(() => import('./components/crack/PasswordCracker'))
const Workspace            = lazy(() => import('./components/workspace/Workspace'))
const KnowledgeBase        = lazy(() => import('./components/kb/KnowledgeBase'))
const ModelManager         = lazy(() => import('./components/models/ModelManager'))
const PayloadForge         = lazy(() => import('./components/payload/PayloadForge'))
const Cassandra            = lazy(() => import('./components/intel/Cassandra'))
const HabitTracker         = lazy(() => import('./components/habits/HabitTracker'))
const ScopeValidator       = lazy(() => import('./components/scope/ScopeValidator'))
const OsintRecon           = lazy(() => import('./components/recon/OsintRecon'))

function ToolFallback() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[#050607]">
      <div
        className="h-8 w-8 rounded-full border-2 border-white/10 border-t-[var(--accent,#00E0A4)] animate-spin"
        style={{ animationDuration: '0.7s' }}
      />
      <div className="text-[11px] font-semibold uppercase tracking-widest text-white/40">Loading tool…</div>
    </div>
  )
}

/* ─── Types ─────────────────────────────────────────────────────────── */
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
  /** Explicit active engagement; null = none selected. */
  activeEngagementId: string | null
}

/* ─── Constants ─────────────────────────────────────────────────────── */
const ACCENT = '#00E0A4'
const DAY_MS = 86_400_000
const TRACKER_KEY = 'obscurum:tracker:v1'
const STORAGE_NOTICE_KEY = 'obscurum:storage-notice:dismissed'
const SETTINGS_KEY = 'obscurum:settings:v1'
const ACTIVITY_CAP = 40

interface AppSettings {
  displayName: string
  showClock: boolean
  showStageCoverage: boolean
  compactHeader: boolean
  showQuickActions: boolean
  showActivity: boolean
  reduceMotion: boolean
  defaultRedact: boolean
  accentColor: string
  density: 'comfortable' | 'compact'
  showSeverityBreakdown: boolean
  showStreakCard: boolean
  showResolvedCard: boolean
  cardEnterAnim: boolean
}

const ACCENT_PRESETS = [
  { id: 'mint', label: 'Mint', value: '#00E0A4' },
  { id: 'cyan', label: 'Cyan', value: '#22d3ee' },
  { id: 'violet', label: 'Violet', value: '#A78BFA' },
  { id: 'amber', label: 'Amber', value: '#fbbf24' },
  { id: 'rose', label: 'Rose', value: '#fb7185' },
  { id: 'lime', label: 'Lime', value: '#a3e635' },
] as const

const DEFAULT_SETTINGS: AppSettings = {
  displayName: 'Operator',
  showClock: true,
  showStageCoverage: true,
  compactHeader: false,
  showQuickActions: true,
  showActivity: true,
  reduceMotion: false,
  defaultRedact: false,
  accentColor: '#00E0A4',
  density: 'comfortable',
  showSeverityBreakdown: true,
  showStreakCard: true,
  showResolvedCard: true,
  cardEnterAnim: true,
}

function softAccent(hex: string): string {
  // lighten toward white for secondary text
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const mix = (c: number) => Math.min(255, Math.round(c + (255 - c) * 0.45))
    return `#${[mix(r), mix(g), mix(b)].map(x => x.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return '#7DF0CE'
  }
}

function deepAccent(hex: string): string {
  // darken toward black for gradient ends / deep-tone accents
  try {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    const mix = (c: number) => Math.max(0, Math.round(c * 0.68))
    return `#${[mix(r), mix(g), mix(b)].map(x => x.toString(16).padStart(2, '0')).join('')}`
  } catch {
    return '#17B890'
  }
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const NAV = [
  { to: '/',                 icon: Activity,    label: 'Pantheon',       color: '#6366f1' },
  { to: '/aegis',            icon: Shield,      label: 'Aegis',          color: '#34d399' },
  { to: '/hermes',           icon: Radio,       label: 'Hermes',         color: '#22d3ee' },
  { to: '/chat',             icon: Sparkles,    label: 'Sibyl',          color: '#A78BFA' },
  { to: '/nmap',             icon: ScanLine,    label: 'Scout',          color: '#22d3ee' },
  { to: '/cve',              icon: Landmark,    label: 'Oraculum',       color: '#eab308' },
  { to: '/hash',             icon: Lock,        label: 'Cipher',         color: '#818cf8' },
  { to: '/password-cracker', icon: Key,         label: 'Vulcan',         color: '#f97316' },
  { to: '/payload',          icon: Swords,      label: 'Armory',         color: '#ef4444' },
  { to: '/analyzer',         icon: Telescope,   label: 'Lynceus',        color: '#A78BFA' },
  { to: '/privesc/linux',    icon: Hammer,      label: 'Daedalus',       color: '#34d399' },
  { to: '/privesc/windows',  icon: Feather,     label: 'Icarus',         color: '#fbbf24' },
  { to: '/coach',            icon: Compass,     label: 'Virgil',         color: '#f59e0b' },
  { to: '/gobuster-msf',     icon: BookOpen,    label: 'Mentor',         color: '#A78BFA' },
  { to: '/wireshark-coach',  icon: Eye,         label: 'Argus',          color: '#22d3ee' },
  { to: '/responder-coach',  icon: Waves,       label: 'Siren',          color: '#ef4444' },
  { to: '/webapp-coach',     icon: Globe,       label: 'Arachne',        color: '#17B890' },
  { to: '/bloodhound',       icon: Flame,       label: 'Cerberus',       color: '#dc2626' },
  { to: '/orthrus',          icon: Key,         label: 'Orthrus',        color: '#f87171' },
  { to: '/cassandra',        icon: Rss,         label: 'Cassandra',      color: '#f97316' },
  { to: '/habits',           icon: Flame,       label: 'Ledger',         color: '#ec4899' },
  { to: '/report',           icon: FileText,    label: 'Scribe',         color: '#22d3ee' },
  { to: '/attack-path',      icon: GitBranch,   label: 'Labyrinth',      color: '#f87171' },
  { to: '/attack-generator', icon: GitMerge,    label: 'Threadweaver',   color: '#eab308' },
  { to: '/vuln-matcher',     icon: Target,      label: 'Nemesis',        color: '#f87171' },
  { to: '/workspace',        icon: Folder,      label: 'Sanctum',        color: '#6366f1' },
  { to: '/kb',               icon: Library,     label: 'Codex',          color: '#A78BFA' },
  { to: '/models',           icon: Factory,     label: 'Foundry',        color: '#d97706' },
] as const

const SEVERITY_META: Record<Severity, { label: string; color: string; weight: number }> = {
  crit: { label: 'Critical', color: '#ef4444', weight: 14 },
  high: { label: 'High',     color: '#f87171', weight: 8  },
  med:  { label: 'Medium',   color: '#fbbf24', weight: 4  },
  low:  { label: 'Low',      color: '#94a3b8', weight: 1.5 },
}

const STAGE_META: Record<Stage, { label: string; icon: typeof Radar; color: string; routes: string[] }> = {
  recon:        { label: 'Recon',        icon: Radar,          color: '#22d3ee', routes: ['/hermes', '/nmap', '/cve', '/hash', '/analyzer', '/cassandra', '/aegis'] },
  exploitation: { label: 'Exploitation', icon: Crosshair,      color: '#22d3ee', routes: ['/payload', '/vuln-matcher', '/attack-generator', '/password-cracker', '/webapp-coach'] },
  privesc:      { label: 'PrivEsc',      icon: ShieldAlert,    color: '#f59e0b', routes: ['/privesc/linux', '/privesc/windows', '/bloodhound', '/orthrus', '/responder-coach'] },
  reporting:    { label: 'Reporting',    icon: ClipboardCheck, color: '#A78BFA', routes: ['/report', '/workspace', '/kb', '/attack-path'] },
}

const SEV_ORDER: Severity[] = ['crit', 'high', 'med', 'low']

const TOP_TABS = [
  ['/', 'Pantheon'],
  ['/workspace', 'Sanctum'],
  ['/report', 'Scribe'],
  ['/hermes', 'Hermes'],
  ['/attack-path', 'Labyrinth'],
  ['/kb', 'Codex'],
] as const

/** Tool rail — excludes routes already in TOP_TABS (Workspace, Reports, Recon/Hermes). */

/* ─── Utilities ─────────────────────────────────────────────────────── */
let uidCounter = 0
const uid = () =>
  (++uidCounter).toString(36) + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

function emptyTracker(): TrackerState {
  return {
    findings: [],
    engagements: [],
    activity: [],
    visited: [],
    bestStreakDays: 0,
    activeEngagementId: null,
  }
}

function seedTracker(): TrackerState {
  const now = Date.now()
  const e1: Engagement = {
    id: uid(), label: 'Internal Assessment', targetFindings: 12,
    dueAt: now + 4 * DAY_MS, color: '#00E0A4', createdAt: now - 6 * DAY_MS,
  }
  const e2: Engagement = {
    id: uid(), label: 'ACME Corp — External', targetFindings: 15,
    dueAt: null, color: '#17B890', createdAt: now - 10 * DAY_MS,
  }
  const e3: Engagement = {
    id: uid(), label: 'HTB Season Grind', targetFindings: 10,
    dueAt: null, color: '#22d3ee', createdAt: now - 3 * DAY_MS,
  }

  const mk = (
    title: string, target: string, severity: Severity, stage: Stage,
    engagementId: string | null, daysAgo: number,
  ): Finding => ({
    id: uid(), title, target, severity, stage, engagementId,
    resolved: false, resolvedAt: null,
    createdAt: now - daysAgo * DAY_MS - Math.round(Math.random() * DAY_MS * 0.6),
  })

  const findings: Finding[] = [
    mk('Weak SSH Configuration', '10.10.10.24', 'crit', 'exploitation', e1.id, 0),
    mk('SQL Injection', '10.10.10.24', 'high', 'exploitation', e1.id, 0),
    mk('Privilege Escalation Vector', '10.10.10.42', 'med', 'privesc', e1.id, 0),
    mk('Default Credentials', '10.10.10.12', 'low', 'recon', e1.id, 0),
    mk('NTLM hash captured via Responder', 'DC01', 'high', 'privesc', e1.id, 1),
    mk('Anonymous FTP login', '10.10.14.30', 'med', 'recon', e1.id, 1),
    mk('Kerberoastable service account', 'svc_backup', 'high', 'privesc', e1.id, 2),
    mk('Outdated jQuery (XSS)', 'app.local', 'low', 'recon', e2.id, 3),
    mk('Unquoted service path', 'WIN-SRV02', 'med', 'privesc', e2.id, 3),
  ]

  const activity: ActivityEntry[] = [
    { id: uid(), icon: '🔔', title: 'Finding logged', detail: 'SQL Injection vulnerability in /login.php', tone: '#ef4444', createdAt: now - 4 * 60_000 },
    { id: uid(), icon: '🎯', title: 'Target added', detail: '10.10.10.42 (Linux)', tone: '#00E0A4', createdAt: now - 6 * 3_600_000 },
    { id: uid(), icon: '📄', title: 'Report generated', detail: 'Pentest Report - ACME Corp', tone: '#22d3ee', createdAt: now - 8 * 3_600_000 },
    { id: uid(), icon: '🔄', title: 'Engagement updated', detail: 'Internal Assessment', tone: '#17B890', createdAt: now - DAY_MS },
    { id: uid(), icon: '✅', title: 'Finding resolved', detail: 'Weak SSH Configuration', tone: '#A78BFA', createdAt: now - DAY_MS },
  ]

  return {
    findings,
    engagements: [e1, e2, e3],
    activity,
    visited: ['/', '/nmap', '/cve', '/hermes', '/payload', '/privesc/linux', '/report'],
    bestStreakDays: 0,
    activeEngagementId: e1.id,
  }
}

function loadTracker(): TrackerState {
  try {
    const raw = localStorage.getItem(TRACKER_KEY)
    if (!raw) return emptyTracker()
    const parsed = JSON.parse(raw) as Partial<TrackerState>
    return { ...emptyTracker(), ...parsed }
  } catch {
    return emptyTracker()
  }
}

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts)
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function maskTerm(s: string): string {
  return s.replace(/[A-Za-z0-9]+/g, tok => '•'.repeat(tok.length))
}

/* ─── Tracker hook ──────────────────────────────────────────────────── */
function useTracker() {
  const [state, setState] = useState<TrackerState>(() => loadTracker())
  const [storageError, setStorageError] = useState<string | null>(null)

  // Debounce disk writes. Flush only the pending timer — never sync JSON.stringify on every
  // state-change cleanup (that was blocking the main thread and inflating INP).
  const stateRef = useRef(state)
  stateRef.current = state
  useEffect(() => {
    const persist = () => {
      try {
        localStorage.setItem(TRACKER_KEY, JSON.stringify(stateRef.current))
        setStorageError(null)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown storage error'
        console.error('Tracker persistence failed:', err)
        setStorageError(msg)
      }
    }
    const id = window.setTimeout(persist, 450)
    return () => {
      window.clearTimeout(id)
    }
  }, [state])
  // Flush once on true unmount so a fast route change still saves.
  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(TRACKER_KEY, JSON.stringify(stateRef.current))
      } catch { /* ignore */ }
    }
  }, [])

  const addFinding = useCallback((input: {
    title: string; target: string; severity: Severity; stage: Stage; engagementId: string | null
  }) => {
    startTransition(() => {
      setState(s => {
        const finding: Finding = {
          ...input, id: uid(), resolved: false, resolvedAt: null, createdAt: Date.now(),
        }
        const entry: ActivityEntry = {
          id: uid(), icon: '🔍', title: 'Finding logged',
          detail: `${finding.title}${finding.target ? ' · ' + finding.target : ''}`,
          tone: SEVERITY_META[finding.severity].color, createdAt: Date.now(),
        }
        return {
          ...s,
          findings: [finding, ...s.findings],
          activity: [entry, ...s.activity].slice(0, ACTIVITY_CAP),
        }
      })
    })
  }, [])

  const resolveFinding = useCallback((id: string) => {
    startTransition(() => {
      setState(s => {
        const f = s.findings.find(x => x.id === id)
        if (!f || f.resolved) return s
        const entry: ActivityEntry = {
          id: uid(), icon: '✅', title: 'Finding resolved', detail: f.title,
          tone: '#34d399', createdAt: Date.now(),
        }
        return {
          ...s,
          findings: s.findings.map(x =>
            x.id === id ? { ...x, resolved: true, resolvedAt: Date.now() } : x,
          ),
          activity: [entry, ...s.activity].slice(0, ACTIVITY_CAP),
        }
      })
    })
  }, [])

  const addEngagement = useCallback((input: {
    label: string; targetFindings: number; dueAt: number | null; color: string
  }) => {
    startTransition(() => {
      setState(s => {
        const engagement: Engagement = { ...input, id: uid(), createdAt: Date.now() }
        const entry: ActivityEntry = {
          id: uid(), icon: '🎯', title: 'Engagement created', detail: engagement.label,
          tone: engagement.color, createdAt: Date.now(),
        }
        const activeEngagementId =
          s.activeEngagementId && s.engagements.some(e => e.id === s.activeEngagementId)
            ? s.activeEngagementId
            : engagement.id
        return {
          ...s,
          engagements: [engagement, ...s.engagements],
          activity: [entry, ...s.activity].slice(0, ACTIVITY_CAP),
          activeEngagementId,
        }
      })
    })
  }, [])

  const setActiveEngagement = useCallback((id: string | null) => {
    setState(s => {
      if (id !== null && !s.engagements.some(e => e.id === id)) return s
      return { ...s, activeEngagementId: id }
    })
  }, [])

  // Visits are recorded off the React path so navigation never triggers a full store update / freeze.
  const markVisited = useCallback((path: string) => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(TRACKER_KEY)
        if (!raw) return
        const parsed = JSON.parse(raw) as TrackerState
        if (!Array.isArray(parsed.visited)) parsed.visited = []
        if (parsed.visited.includes(path)) return
        parsed.visited = [...parsed.visited, path]
        localStorage.setItem(TRACKER_KEY, JSON.stringify(parsed))
      } catch { /* ignore */ }
    })
  }, [])

  const recordStreak = useCallback((days: number) => {
    setState(s => (days > s.bestStreakDays ? { ...s, bestStreakDays: days } : s))
  }, [])

  const resetDemo = useCallback(() => setState(seedTracker()), [])
  const clearAll = useCallback(() => setState(emptyTracker()), [])

  return useMemo(() => ({
    ...state,
    addFinding, resolveFinding, addEngagement, setActiveEngagement,
    markVisited, recordStreak, resetDemo, clearAll, storageError,
  }), [state, addFinding, resolveFinding, addEngagement, setActiveEngagement, markVisited, recordStreak, resetDemo, clearAll, storageError])
}

type Tracker = ReturnType<typeof useTracker>

const TrackerContext = createContext<Tracker | null>(null)

function TrackerProvider({ children }: { children: ReactNode }) {
  const tracker = useTracker()
  return <TrackerContext.Provider value={tracker}>{children}</TrackerContext.Provider>
}

function useTrackerContext(): Tracker {
  const ctx = useContext(TrackerContext)
  if (!ctx) throw new Error('useTrackerContext requires TrackerProvider')
  return ctx
}

/* ─── Shared UI pieces ──────────────────────────────────────────────── */
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

function TitleBar() {
  const minimize = () => window.obscurum?.minimizeWindow?.() ?? window.electronAPI?.minimize?.()
  const maximize = () => window.obscurum?.maximizeWindow?.() ?? window.electronAPI?.maximize?.()
  const close    = () => window.obscurum?.closeWindow?.() ?? window.electronAPI?.close?.()

  return (
    <div className="flex items-center justify-between h-9 px-3 flex-shrink-0 bg-[#010307] border-b border-white/[0.05] select-none titlebar-drag z-50">
      <div className="flex items-center gap-2 titlebar-no-drag">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          <BrandMark size={18} />
        </div>
        <span className="text-[10px] font-black tracking-widest text-white/35 uppercase">Obscurum</span>
      </div>
      <div className="flex items-center titlebar-no-drag">
        <button type="button" onClick={minimize} title="Minimize" aria-label="Minimize"
          className="w-8 h-9 flex items-center justify-center text-white/35 hover:text-white hover:bg-white/5 transition-colors">
          <Minus size={12} />
        </button>
        <button type="button" onClick={maximize} title="Maximize" aria-label="Maximize"
          className="w-8 h-9 flex items-center justify-center text-white/35 hover:text-white hover:bg-white/5 transition-colors">
          <Maximize2 size={11} />
        </button>
        <button type="button" onClick={close} title="Close" aria-label="Close"
          className="w-8 h-9 flex items-center justify-center text-white/35 hover:text-white hover:bg-red-500/80 transition-colors">
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Mount-only focus trap. Re-running on every parent render (inline onClose) stole focus from inputs.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    if (!panel) return

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const getFocusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        el => el.offsetParent !== null && el.getAttribute('aria-hidden') !== 'true',
      )

    const nodes = getFocusable()
    const preferred =
      nodes.find(el => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
      ?? nodes.find(el => el.getAttribute('data-modal-primary') === 'true')
      ?? nodes[0]

    const t = window.setTimeout(() => {
      preferred?.focus()
      if (preferred && preferred.tagName === 'INPUT') {
        try { (preferred as HTMLInputElement).select() } catch { /* ignore */ }
      }
    }, 0)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = getFocusable()
      if (list.length === 0) {
        e.preventDefault()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first || !panel.contains(document.activeElement)) {
          e.preventDefault()
          last.focus()
        }
      } else if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      previouslyFocused.current?.focus?.()
    }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md"
      onClick={() => onCloseRef.current()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-white/10 p-7 shadow-2xl max-h-[90vh] overflow-y-auto outline-none"
        style={{
          background: 'linear-gradient(165deg, rgba(18,22,24,0.95) 0%, rgba(8,10,12,0.98) 100%)',
          boxShadow: '0 28px 90px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,224,164,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/80">{title}</h3>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close dialog"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/* ─── Header ops ambient (lightweight, GPU-friendly) ────────────────── */
const MATRIX_COLS = Array.from({ length: 5 }, (_, i) => ({
  id: i,
  left: `${6 + i * 11}%`,
  delay: `${(i * 0.45) % 2.2}s`,
  duration: `${4.2 + (i % 4) * 0.8}s`,
  text: ['0101Α0Β1', 'ΣΩ10#*<>', 'F0ΑΒ01Σ1', '0F1C0A10', '10ΣΩΑΒ01', '#*<>10F0', 'Α0Β1ΣΩ10', '01F0C1A0'][i % 8],
}))

function HeaderOpsOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden contain-strict" aria-hidden="true">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,224,164,.55) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,.4) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          maskImage: 'linear-gradient(90deg, transparent 0%, black 35%, black 100%)',
        }}
      />
      <div className="absolute right-[12%] top-2 h-28 w-28 rounded-full bg-[#00E0A4]/15 blur-3xl" />
      <div className="absolute right-[28%] top-10 h-20 w-20 rounded-full bg-[#22d3ee]/12 blur-2xl" />
      <div className="absolute right-0 top-0 h-full w-[55%] max-w-xl">
        {MATRIX_COLS.map(col => (
          <div
            key={col.id}
            className="absolute top-[-25%] w-3 font-mono text-[11px] leading-[1.15] animate-[matrixFall_linear_infinite]"
            style={{
              left: col.left,
              animationDuration: col.duration,
              animationDelay: col.delay,
              color: col.id % 2 === 0 ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'color-mix(in srgb, var(--accent-soft) 50%, transparent)',
              textShadow: '0 0 10px color-mix(in srgb, var(--accent) 45%, transparent)',
            }}
          >
            {col.text.split('').map((ch, idx) => (
              <div
                key={idx}
                style={
                  idx === 0
                    ? { color: '#7DF0CE', textShadow: '0 0 10px rgba(125,240,206,0.8)', fontWeight: 700 }
                    : idx === 1
                      ? { color: col.id % 2 === 0 ? '#00E0A4' : '#22d3ee', opacity: 0.9 }
                      : undefined
                }
              >
                {ch}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="absolute right-0 top-0 h-full w-[55%] max-w-xl overflow-hidden">
        <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#00E0A4] to-[#22d3ee]/80 animate-[scanY_4.5s_ease-in-out_infinite] shadow-[0_0_12px_rgba(0,224,164,0.6)]" />
      </div>
    </div>
  )
}

const HeaderOpsOverlayMemo = memo(HeaderOpsOverlay)


function sparkPath(values: number[], w = 120, h = 24): { line: string; area: string } {
  const n = values.length
  if (n === 0) return { line: `M0 ${h}`, area: `M0 ${h} L${w} ${h} Z` }
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => {
    const x = n === 1 ? w / 2 : (i / (n - 1)) * w
    const y = h - 2 - (v / max) * (h - 6)
    return [x, y] as const
  })
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return { line, area: `${line} L${w} ${h} L0 ${h} Z` }
}

function inferHostMeta(
  target: string,
  findings: Finding[],
): { type: string; icon: typeof Server; status: string; statusColor: string } {
  const related = findings.filter(
    f => !f.resolved && f.target.trim().toLowerCase() === target.trim().toLowerCase(),
  )
  const corpus = related.map(f => f.title).join(' ').toLowerCase()
  const t = target.toLowerCase()
  const latest = related[0]?.title?.trim() ?? ''

  if (latest && latest.length <= 40 && !/^\d{1,3}(\.\d{1,3}){3}$/.test(latest)) {
    const low = latest.toLowerCase()
    if (/\b(linux|ubuntu|debian|centos|rhel|kali|blackarch)\b/.test(low)) {
      return { type: latest, icon: Server, status: 'Active', statusColor: ACCENT }
    }
    if (/\b(windows|win10|win11|ntlm|smb)\b/.test(low) || /\bwin-/.test(low)) {
      return { type: latest, icon: Monitor, status: 'Active', statusColor: ACCENT }
    }
    if (/\b(domain\s*controller|\bdc\b|kerberos|ldap)\b/.test(low)) {
      return { type: latest, icon: Shield, status: 'Active', statusColor: ACCENT }
    }
    if (/\b(web|http|apache|nginx|iis|xss|sqli)\b/.test(low)) {
      return { type: latest, icon: Globe, status: 'In Progress', statusColor: '#f59e0b' }
    }
    return { type: latest, icon: Server, status: 'Active', statusColor: ACCENT }
  }
  if (/\b(linux|ubuntu|debian|centos|rhel|kali|blackarch)\b/.test(corpus) || /\blinux\b/.test(t)) {
    return { type: 'Linux', icon: Server, status: 'Active', statusColor: ACCENT }
  }
  if (/\b(windows|win10|win11|server\s*20\d{2}|ntlm|smb)\b/.test(corpus) || /\bwin-/.test(t)) {
    return { type: 'Windows', icon: Monitor, status: 'Active', statusColor: ACCENT }
  }
  if (/\b(domain\s*controller|\bdc\b|kerberos|ldap)\b/.test(corpus) || /\b(dc|domain)\b/.test(t) || t.includes('corp.local')) {
    return { type: 'Domain Controller', icon: Shield, status: 'Active', statusColor: ACCENT }
  }
  if (/\b(web|http|https|apache|nginx|iis|xss|sqli)\b/.test(corpus) || /\.(local|com|net|org|io)\b/.test(t)) {
    return { type: 'Web Application', icon: Globe, status: 'In Progress', statusColor: '#f59e0b' }
  }
  return { type: 'Host', icon: Server, status: 'Active', statusColor: ACCENT }
}

type Trend = { label: string; up: boolean } | null
type MethodRow = { label: string; stage: Stage; count: number; open: number; color: string; to: string; pct: number }
type Objective = { id: string; label: string; sub: string; pct: number; color: string }
type WeeklyDay = { d: string; crit: number; high: number; med: number; low: number; total: number }
type Spark = { line: string; area: string }

const KpiStrip = memo(function KpiStrip({
  openFindingsCount, criticalCount, engagementCount, activeTargetCount,
  weekOverWeek, openSpark, critSpark, engSpark,
  showStageCoverage, overallCoverage, methodology, onNavigateStage,
}: {
  openFindingsCount: number
  criticalCount: number
  engagementCount: number
  activeTargetCount: number
  weekOverWeek: { open: Trend; crit: Trend }
  openSpark: Spark
  critSpark: Spark
  engSpark: Spark
  showStageCoverage: boolean
  overallCoverage: number
  methodology: MethodRow[]
  onNavigateStage: (to: string) => void
}) {
  return (
    <section className={`mb-6 grid gap-4 sm:grid-cols-2 ${showStageCoverage ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
      <div className="glass-panel hover-lift anim-card anim-stagger-1 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[var(--accent)]"><Target size={18} /></div>
          <span className="text-[12px] font-semibold uppercase tracking-wider text-white/45">Open findings</span>
        </div>
        <div className="mt-4 text-[32px] font-bold tabular-nums tracking-tight leading-none">{String(openFindingsCount).padStart(2, '0')}</div>
        <div className={`mt-2 flex min-h-[18px] items-center gap-1.5 text-[12px] ${weekOverWeek.open ? (weekOverWeek.open.up ? 'text-red-400' : 'text-[#00E0A4]') : 'text-white/40'}`}>
          {weekOverWeek.open ? (<>{weekOverWeek.open.up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}<span>{weekOverWeek.open.label}</span></>) : <span>No prior-week baseline</span>}
        </div>
        <div className="mt-3 h-8">
          <svg viewBox="0 0 120 24" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <path d={openSpark.line} fill="none" stroke="#00E0A4" strokeWidth="1.75" strokeOpacity=".8" />
            <path d={openSpark.area} fill="#00E0A4" fillOpacity=".08" />
          </svg>
        </div>
      </div>
      <div className="glass-panel hover-lift anim-card anim-stagger-2 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-400"><ShieldAlert size={18} /></div>
          <span className="text-[12px] font-semibold uppercase tracking-wider text-white/45">Critical open</span>
        </div>
        <div className="mt-4 text-[32px] font-bold tabular-nums tracking-tight leading-none">{String(criticalCount).padStart(2, '0')}</div>
        <div className={`mt-2 flex min-h-[18px] items-center gap-1.5 text-[12px] ${weekOverWeek.crit ? (weekOverWeek.crit.up ? 'text-red-400' : 'text-[#00E0A4]') : 'text-white/40'}`}>
          {weekOverWeek.crit ? (<>{weekOverWeek.crit.up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}<span>{weekOverWeek.crit.label}</span></>) : <span>No prior-week baseline</span>}
        </div>
        <div className="mt-3 h-8">
          <svg viewBox="0 0 120 24" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <path d={critSpark.line} fill="none" stroke="#ef4444" strokeWidth="1.75" strokeOpacity=".8" />
            <path d={critSpark.area} fill="#ef4444" fillOpacity=".08" />
          </svg>
        </div>
      </div>
      <div className="glass-panel hover-lift anim-card anim-stagger-3 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400"><Users size={18} /></div>
          <span className="text-[12px] font-semibold uppercase tracking-wider text-white/45">Engagements</span>
        </div>
        <div className="mt-4 text-[32px] font-bold tabular-nums tracking-tight leading-none">{String(engagementCount).padStart(2, '0')}</div>
        <div className="mt-2 flex min-h-[18px] items-center gap-1.5 text-[12px] text-white/40">
          <span>{activeTargetCount} open target{activeTargetCount === 1 ? '' : 's'}</span>
        </div>
        <div className="mt-3 h-8">
          <svg viewBox="0 0 120 24" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <path d={engSpark.line} fill="none" stroke="#17B890" strokeWidth="1.75" strokeOpacity=".8" />
            <path d={engSpark.area} fill="#17B890" fillOpacity=".08" />
          </svg>
        </div>
      </div>
      {showStageCoverage && (
        <div className="glass-panel hover-lift anim-card anim-stagger-4 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="relative h-16 w-16 shrink-0 rounded-full p-[3px]"
              style={{ background: `conic-gradient(var(--accent) ${overallCoverage * 3.6}deg, #1a1c1e 0deg)` }}>
              <div className="flex h-full w-full items-center justify-center rounded-full bg-[#0a0b0c]/90">
                <span className="text-sm font-bold tabular-nums">{overallCoverage}%</span>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-white/45">Stage coverage</div>
              <p className="mt-1 text-[12px] text-white/35">Stages with ≥1 finding</p>
              <div className="mt-3 space-y-1.5">
                {methodology.map(m => (
                  <button key={m.label} type="button" onClick={() => onNavigateStage(m.to)}
                    className="flex w-full items-center gap-2 text-left text-[12px] text-white/50 transition hover:text-white/80">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.color }} />
                    <span className="truncate">{m.label}</span>
                    <span className="ml-auto font-mono tabular-nums text-white/55">{m.count === 0 ? '—' : m.count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
})

const AttackSurfaceSection = memo(function AttackSurfaceSection({
  activeTargets, findings, methodology, recentActivity, showActivity,
  redactText, typeLabel, onNavigate, onLogFinding,
}: {
  activeTargets: string[]
  findings: Finding[]
  methodology: MethodRow[]
  recentActivity: { id: string; icon: string; title: string; detail: string; time: string }[]
  showActivity: boolean
  redactText: (t: string) => string
  typeLabel: (t: string) => string
  onNavigate: (to: string) => void
  onLogFinding: () => void
}) {
  return (
    <section className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.85fr)_minmax(260px,0.85fr)]">
      <div className="overflow-hidden glass-panel rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">Attack surface</h2>
            <p className="mt-0.5 text-[13px] text-white/40">
              {activeTargets.length > 0
                ? `${activeTargets.length} open target${activeTargets.length === 1 ? '' : 's'} from logged findings`
                : 'Targets appear when you log findings with a host'}
            </p>
          </div>
          <button type="button" onClick={() => onNavigate('/workspace')} className="text-[12px] font-semibold text-[#00E0A4] transition hover:text-white">Sanctum →</button>
        </div>
        <div className="relative h-[280px] bg-[radial-gradient(circle_at_50%_45%,rgba(0,224,164,0.06),transparent_50%)]">
          <svg viewBox="0 0 680 280" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <radialGradient id="coreGlow">
                <stop offset="0%" stopColor="#00E0A4" stopOpacity=".18" />
                <stop offset="100%" stopColor="#00E0A4" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="lineGlow" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00E0A4" stopOpacity=".4" />
                <stop offset="50%" stopColor="#22d3ee" stopOpacity=".3" />
                <stop offset="100%" stopColor="#17B890" stopOpacity=".4" />
              </linearGradient>
            </defs>
            <circle cx="340" cy="140" r="70" fill="url(#coreGlow)" />
            <circle cx="340" cy="140" r="56" fill="none" stroke="#103a42" strokeOpacity=".55" />
            <circle cx="340" cy="140" r="88" fill="none" stroke="#103a42" strokeOpacity=".22" strokeDasharray="3 8" />
            {activeTargets.length > 0 && (
              <>
                <g fill="none" stroke="url(#lineGlow)" strokeWidth="1.2">
                  <path d="M340 140 L175 70 L90 200 L340 140 L510 65 L595 195 L340 140" />
                </g>
                <g fill="#17B890"><circle cx="175" cy="70" r="5" /><circle cx="510" cy="65" r="5" /></g>
                <g fill="#22d3ee"><circle cx="90" cy="200" r="5" /><circle cx="595" cy="195" r="5" /></g>
                <g fill="#00E0A4"><circle cx="340" cy="140" r="4" /></g>
              </>
            )}
          </svg>
          {activeTargets.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <p className="text-[14px] font-semibold text-white/50">No open targets yet</p>
              <p className="max-w-sm text-[13px] text-white/35">Log a finding with a target host to map your surface. Nothing is invented here.</p>
              <button type="button" onClick={onLogFinding}
                className="mt-2 rounded-xl border border-[#00E0A4]/30 bg-[#00E0A4]/10 px-4 py-2 text-[12px] font-semibold text-[#7DF0CE]">+ Log finding</button>
            </div>
          ) : (
            <>
              {([
                { i: 0, pos: 'left-[6%] top-[14%]' },
                { i: 1, pos: 'left-[4%] bottom-[14%]' },
                { i: 2, pos: 'right-[8%] top-[12%]' },
                { i: 3, pos: 'right-[5%] bottom-[12%]' },
              ] as const).map(({ i, pos }) => {
                const t = activeTargets[i]
                if (!t) return null
                const meta = inferHostMeta(t, findings)
                return (
                  <div key={t} className={`absolute ${pos} max-w-[160px] rounded-xl border border-white/10 bg-black/50 px-3 py-2`}>
                    <div className="truncate text-[13px] font-semibold text-white/85">{redactText(t)}</div>
                    <div className="mt-0.5 text-[12px] text-white/40">{typeLabel(meta.type)}</div>
                  </div>
                )
              })}
            </>
          )}
          <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#00E0A4]/30 bg-black/50 shadow-[0_0_40px_rgba(0,224,164,0.15)]">
            <BrandMark size={26} />
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Active targets</h2>
          <button type="button" onClick={() => onNavigate('/workspace')} className="text-[12px] font-semibold text-[#00E0A4]">Sanctum →</button>
        </div>
        {activeTargets.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 px-3 text-center">
            <p className="text-[14px] font-medium text-white/45">No open targets</p>
            <p className="text-[13px] text-white/35">Log findings with a target to fill this list.</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {activeTargets.map((target, i) => {
              const meta = inferHostMeta(target, findings)
              const Icon = meta.icon
              return (
                <li key={`${target}-${i}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-white/[0.04]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.06] text-white/50"><Icon size={15} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold text-white/80">{redactText(target)}</div>
                    <div className="text-[12px] text-white/40">{typeLabel(meta.type)}</div>
                  </div>
                  <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: meta.statusColor }}>
                    <i className="h-1.5 w-1.5 rounded-full" style={{ background: meta.statusColor }} />
                    {typeLabel(meta.status)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-white/45">Findings by stage</h2>
          <div className="space-y-2.5">
            {methodology.map(m => (
              <div key={m.label} className="flex items-center gap-2.5 text-[13px]">
                <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                <span className="text-white/55">{m.label}</span>
                <span className="ml-auto font-mono tabular-nums text-white/60">
                  {m.count === 0 ? '—' : `${m.count}${m.open ? ` · ${m.open} open` : ''}`}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12px] leading-5 text-white/35">Based on findings logged per stage — not tool visits.</p>
        </div>
        {showActivity && (
          <div className="flex-1 glass-panel rounded-2xl p-5">
            <h2 className="mb-3 text-[15px] font-semibold">Recent activity</h2>
            {recentActivity.length === 0 ? (
              <div className="flex h-28 items-center justify-center text-[13px] text-white/35">Nothing here yet</div>
            ) : (
              <ul className="space-y-3">
                {recentActivity.map(a => (
                  <li key={a.id} className="flex gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[13px]">{a.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-white/75">{a.title}</div>
                      <div className="truncate text-[12px] text-white/40">{redactText(a.detail)}</div>
                      <div className="mt-0.5 text-[12px] text-white/30">{a.time}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  )
})

const ChartsAndFindings = memo(function ChartsAndFindings({
  weeklyFindings, maxDay, openFindings, redactText, onLogFinding, onResolve,
}: {
  weeklyFindings: WeeklyDay[]
  maxDay: number
  openFindings: Finding[]
  redactText: (t: string) => string
  onLogFinding: () => void
  onResolve: (id: string) => void
}) {
  const now = Date.now()
  return (
    <section className="defer-paint mb-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div className="glass-panel rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Findings over time</h2>
          <div className="flex items-center gap-4 text-[12px] font-medium text-white/45">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-400" /> Total</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-red-400" /> Crit + High</span>
          </div>
        </div>
        <div className="relative h-40">
          <svg viewBox="0 0 420 140" className="h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            {[0, 1, 2, 3].map(i => (
              <line key={i} x1="0" y1={20 + i * 28} x2="420" y2={20 + i * 28} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            ))}
            <path d={`M0 120 ${weeklyFindings.map((d, i) => `L${(i / 6) * 420} ${120 - (d.total / maxDay) * 90}`).join(' ')} L420 120 Z`} fill="#38bdf8" fillOpacity=".12" />
            <path d={`M0 120 ${weeklyFindings.map((d, i) => `L${(i / 6) * 420} ${120 - ((d.crit + d.high) / maxDay) * 90}`).join(' ')} L420 120 Z`} fill="#ef4444" fillOpacity=".1" />
            <polyline points={weeklyFindings.map((d, i) => `${(i / 6) * 420},${120 - (d.total / maxDay) * 90}`).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="2.25" strokeOpacity=".85" />
            <polyline points={weeklyFindings.map((d, i) => `${(i / 6) * 420},${120 - ((d.crit + d.high) / maxDay) * 90}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth="1.75" strokeOpacity=".75" />
          </svg>
          <div className="mt-2 flex justify-between text-[12px] font-medium text-white/40">
            {weeklyFindings.map(d => <span key={d.d}>{d.d}</span>)}
          </div>
        </div>
      </div>
      <div className="glass-panel rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Open findings</h2>
          <button type="button" onClick={onLogFinding} className="text-[12px] font-semibold text-[#00E0A4]">+ Log finding</button>
        </div>
        {openFindings.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center gap-3 text-center">
            <p className="text-[13px] font-medium text-white/40">No open findings</p>
            <button type="button" onClick={onLogFinding}
              className="rounded-xl border border-[#00E0A4]/30 px-4 py-2 text-[12px] font-semibold text-[#7DF0CE]">+ Log finding</button>
          </div>
        ) : (
          <ul className="space-y-1">
            {openFindings.map(f => (
              <li key={f.id} className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-white/[0.04]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SEVERITY_META[f.severity].color, boxShadow: `0 0 10px ${SEVERITY_META[f.severity].color}44` }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-white/80">{redactText(f.title)}</div>
                  <div className="truncate text-[12px] text-white/40">{redactText(f.target || 'No target')} · {relativeTime(f.createdAt, now)}</div>
                </div>
                <span className="rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: SEVERITY_META[f.severity].color, background: `${SEVERITY_META[f.severity].color}18` }}>
                  {SEVERITY_META[f.severity].label}
                </span>
                <button type="button" onClick={() => onResolve(f.id)}
                  className="hidden text-[12px] font-semibold text-white/40 hover:text-white group-hover:inline">Resolve</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
})

const EngagementFooter = memo(function EngagementFooter({
  objectives, currentEngagement, engagementPct, activeEngagementId,
  redact, redactText, onSetActive,
}: {
  objectives: Objective[]
  currentEngagement: Objective | undefined
  engagementPct: number
  activeEngagementId: string | null
  redact: boolean
  redactText: (t: string) => string
  onSetActive: (id: string | null) => void
}) {
  return (
    <section className="defer-paint glass-panel rounded-2xl px-5 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00E0A4]/12 text-[#00E0A4]"><Crosshair size={18} /></div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-white/40">Current engagement</div>
            {objectives.length > 1 ? (
              <select
                value={activeEngagementId ?? currentEngagement?.id ?? ''}
                onChange={e => onSetActive(e.target.value || null)}
                className="mt-1 max-w-full rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[14px] font-medium text-white/85 outline-none focus:border-[#00E0A4]/40"
                aria-label="Select current engagement"
              >
                {objectives.map(o => (
                  <option key={o.id} value={o.id} className="bg-[#0a0c0e]">{redact ? maskTerm(o.label) : o.label}</option>
                ))}
              </select>
            ) : (
              <div className="mt-0.5 truncate text-[14px] font-medium text-white/85">
                {redactText(currentEngagement?.label ?? 'No engagement')}
              </div>
            )}
          </div>
        </div>
        <div className="flex max-w-md flex-1 items-center gap-4">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="shine-bar h-full rounded-full transition-all duration-500"
              style={{
                width: `${engagementPct}%`,
                background: 'linear-gradient(90deg, var(--accent-deep), var(--accent), var(--accent-soft))',
              }}
            />
          </div>
          <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-white/55">{engagementPct}% complete</span>
        </div>
      </div>
    </section>
  )
})



const ExtraStatsStrip = memo(function ExtraStatsStrip({
  findings, showSeverity, showStreak, showResolved, cardEnterAnim, reduceMotion,
}: {
  findings: Finding[]
  showSeverity: boolean
  showStreak: boolean
  showResolved: boolean
  cardEnterAnim: boolean
  reduceMotion: boolean
}) {
  const anim = cardEnterAnim && !reduceMotion ? 'animate-[cardIn_0.55s_ease-out_both]' : ''
  const bySev = useMemo(() => {
    const open = findings.filter(f => !f.resolved)
    return {
      crit: open.filter(f => f.severity === 'crit').length,
      high: open.filter(f => f.severity === 'high').length,
      med: open.filter(f => f.severity === 'med').length,
      low: open.filter(f => f.severity === 'low').length,
      resolvedWeek: findings.filter(f => f.resolved && f.resolvedAt && f.resolvedAt >= Date.now() - 7 * DAY_MS).length,
      totalResolved: findings.filter(f => f.resolved).length,
      streak: (() => {
        // consecutive days with ≥1 finding created (ending today or yesterday)
        const days = new Set(findings.map(f => startOfDay(f.createdAt)))
        let streak = 0
        let d = startOfDay(Date.now())
        // allow starting from yesterday if nothing today
        if (!days.has(d)) d -= DAY_MS
        while (days.has(d)) {
          streak++
          d -= DAY_MS
        }
        return streak
      })(),
    }
  }, [findings])

  if (!showSeverity && !showStreak && !showResolved) return null

  return (
    <section className={`mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${anim}`} style={{ animationDelay: '80ms' }}>
      {showSeverity && (
        <div className="glass-panel hover-lift rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-20 blur-2xl" style={{ background: 'var(--accent)' }} />
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/45 mb-3">Severity mix</div>
          <div className="flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
            {([
              ['crit', bySev.crit, '#ef4444'],
              ['high', bySev.high, '#f87171'],
              ['med', bySev.med, '#fbbf24'],
              ['low', bySev.low, '#94a3b8'],
            ] as const).map(([k, n, c]) => (
              n > 0 ? <div key={k} className="h-full transition-all duration-700" style={{ width: `${(n / Math.max(1, bySev.crit + bySev.high + bySev.med + bySev.low)) * 100}%`, background: c }} /> : null
            ))}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {([
              ['Crit', bySev.crit, '#ef4444'],
              ['High', bySev.high, '#f87171'],
              ['Med', bySev.med, '#fbbf24'],
              ['Low', bySev.low, '#94a3b8'],
            ] as const).map(([label, n, c]) => (
              <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-2 text-center">
                <div className="text-[16px] font-bold tabular-nums" style={{ color: c }}>{n}</div>
                <div className="text-[10px] uppercase tracking-wider text-white/35">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {showStreak && (
        <div className="glass-panel hover-lift rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute -left-4 bottom-0 h-20 w-20 rounded-full opacity-25 blur-2xl" style={{ background: 'var(--accent)' }} />
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/45">Logging streak</div>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-[40px] font-bold tabular-nums leading-none" style={{ color: 'var(--accent-soft)' }}>{bySev.streak}</span>
            <span className="mb-1 text-[13px] text-white/40">day{bySev.streak === 1 ? '' : 's'}</span>
          </div>
          <p className="mt-2 text-[12px] text-white/35">Consecutive days with at least one finding logged.</p>
          <div className="mt-4 flex gap-1">
            {Array.from({ length: 7 }, (_, i) => {
              const day = startOfDay(Date.now()) - (6 - i) * DAY_MS
              const hit = findings.some(f => startOfDay(f.createdAt) === day)
              return (
                <div
                  key={day}
                  className="h-2 flex-1 rounded-full transition-all duration-500"
                  style={{ background: hit ? 'var(--accent)' : 'rgba(255,255,255,0.08)', boxShadow: hit ? '0 0 8px color-mix(in srgb, var(--accent) 50%, transparent)' : undefined }}
                />
              )
            })}
          </div>
        </div>
      )}
      {showResolved && (
        <div className="glass-panel hover-lift rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute right-0 top-0 h-16 w-16 rounded-full opacity-20 blur-xl" style={{ background: '#34d399' }} />
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/45">Resolved</div>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-[40px] font-bold tabular-nums leading-none text-emerald-300">{bySev.resolvedWeek}</span>
            <span className="text-[13px] text-white/40">this week</span>
          </div>
          <p className="mt-2 text-[12px] text-white/35">{bySev.totalResolved} total closed findings.</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-[var(--accent)] transition-all duration-700"
              style={{ width: `${Math.min(100, bySev.totalResolved * 8)}%` }}
            />
          </div>
        </div>
      )}
    </section>
  )
})


function DashboardClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // Align to next minute boundary, then tick once per minute — clock doesn't need 1Hz.
    const msToNextMinute = 60_000 - (Date.now() % 60_000)
    let intervalId: number | undefined
    const timeoutId = window.setTimeout(() => {
      setNow(Date.now())
      intervalId = window.setInterval(() => setNow(Date.now()), 60_000)
    }, msToNextMinute)
    return () => {
      window.clearTimeout(timeoutId)
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [])
  const clockStr = new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const dateStr = new Date(now).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  }).toUpperCase()
  return (
    <div className="text-left sm:text-right">
      <div className="flex items-center gap-2 sm:justify-end">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        <div className="text-[12px] font-semibold uppercase tracking-widest" style={{ color: 'color-mix(in srgb, var(--accent) 70%, transparent)' }}>{dateStr}</div>
      </div>
      <div
        className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight"
        style={{ color: 'var(--accent-soft)', textShadow: '0 0 18px color-mix(in srgb, var(--accent) 40%, transparent)' }}
      >
        {clockStr}
      </div>
    </div>
  )
}

/* ─── Dashboard ─────────────────────────────────────────────────────── */
const Dashboard = memo(function Dashboard({ settings }: { settings: AppSettings }) {
  const tracker = useTrackerContext()
  const navigate = useNavigate()
  const [redact, setRedact] = useState(() => settings.defaultRedact)
  const [showFindingModal, setShowFindingModal] = useState(false)
  const [showEngagementModal, setShowEngagementModal] = useState(false)
  const [storageNoticeDismissed, setStorageNoticeDismissed] = useState(() => {
    try { return localStorage.getItem(STORAGE_NOTICE_KEY) === '1' } catch { return false }
  })
  const [findingForm, setFindingForm] = useState({
    title: '', target: '', severity: 'med' as Severity, stage: 'recon' as Stage, engagementId: '',
  })
  const [engagementForm, setEngagementForm] = useState({
    label: '', targetFindings: '10', dueDate: '', color: ACCENT,
  })
  const dismissStorageNotice = () => {
    setStorageNoticeDismissed(true)
    try { localStorage.setItem(STORAGE_NOTICE_KEY, '1') } catch { /* ignore */ }
  }

  useEffect(() => {
    if (showFindingModal) {
      setFindingForm({ title: '', target: '', severity: 'med', stage: 'recon', engagementId: '' })
    }
  }, [showFindingModal])

  useEffect(() => {
    if (showEngagementModal) {
      setEngagementForm({ label: '', targetFindings: '10', dueDate: '', color: ACCENT })
    }
  }, [showEngagementModal])

  /* derived data — all values from tracker, never fabricated */
  // Single-pass aggregates over findings — avoids repeated .filter() scans on every update.
  const weeklyFindings = useMemo(() => {
    const today = startOfDay(Date.now())
    const buckets = Array.from({ length: 7 }, (_, i) => {
      const dayStart = today - (6 - i) * DAY_MS
      return {
        d: new Date(dayStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        dayStart,
        dayEnd: dayStart + DAY_MS,
        crit: 0, high: 0, med: 0, low: 0, total: 0,
      }
    })
    for (const f of tracker.findings) {
      for (const b of buckets) {
        if (f.createdAt >= b.dayStart && f.createdAt < b.dayEnd) {
          b.total++
          if (f.severity === 'crit') b.crit++
          else if (f.severity === 'high') b.high++
          else if (f.severity === 'med') b.med++
          else b.low++
          break
        }
      }
    }
    return buckets.map(({ d, crit, high, med, low, total }) => ({ d, crit, high, med, low, total }))
  }, [tracker.findings])

  const maxDay = Math.max(1, ...weeklyFindings.map(d => d.total))

  const weekOverWeek = useMemo(() => {
    const today = startOfDay(Date.now())
    const thisWeekStart = today - 6 * DAY_MS
    const priorWeekStart = thisWeekStart - 7 * DAY_MS
    const thisEnd = today + DAY_MS
    let thisWeekCreated = 0, priorWeekCreated = 0, thisCrit = 0, priorCrit = 0
    for (const f of tracker.findings) {
      if (f.createdAt >= thisWeekStart && f.createdAt < thisEnd) {
        thisWeekCreated++
        if (!f.resolved && f.severity === 'crit') thisCrit++
      } else if (f.createdAt >= priorWeekStart && f.createdAt < thisWeekStart) {
        priorWeekCreated++
        if (f.severity === 'crit') priorCrit++
      }
    }
    const pctChange = (curr: number, prev: number): { label: string; up: boolean } | null => {
      if (prev === 0 && curr === 0) return null
      if (prev === 0) return { label: 'new vs prior week', up: curr > 0 }
      const pct = Math.round(((curr - prev) / prev) * 100)
      return { label: `${Math.abs(pct)}% vs prior week`, up: pct > 0 }
    }
    return {
      open: pctChange(thisWeekCreated, priorWeekCreated),
      crit: pctChange(thisCrit, priorCrit),
    }
  }, [tracker.findings])

  const methodology = useMemo(() => {
    const stages = Object.keys(STAGE_META) as Stage[]
    const counts: Record<Stage, { count: number; open: number }> = {
      recon: { count: 0, open: 0 },
      exploitation: { count: 0, open: 0 },
      privesc: { count: 0, open: 0 },
      reporting: { count: 0, open: 0 },
    }
    for (const f of tracker.findings) {
      const slot = counts[f.stage]
      if (!slot) continue
      slot.count++
      if (!f.resolved) slot.open++
    }
    const byStage = stages.map(stage => {
      const meta = STAGE_META[stage]
      const { count, open } = counts[stage]
      return { label: meta.label, stage, count, open, color: meta.color, to: meta.routes[0] }
    })
    const total = byStage.reduce((s, m) => s + m.count, 0)
    return byStage.map(m => ({
      ...m,
      pct: total === 0 ? 0 : Math.round((m.count / total) * 100),
    }))
  }, [tracker.findings])

  const stagesWithFindings = methodology.filter(m => m.count > 0).length
  const overallCoverage = Math.round((stagesWithFindings / Math.max(1, methodology.length)) * 100)

  const recentActivity = useMemo(() => {
    const t = Date.now()
    return tracker.activity.slice(0, 5).map(a => ({ ...a, time: relativeTime(a.createdAt, t) }))
  }, [tracker.activity])

  const objectives = useMemo(() => {
    const t = Date.now()
    return tracker.engagements.map(e => {
      const count = tracker.findings.filter(f => f.engagementId === e.id).length
      const pct = Math.min(100, Math.round((count / Math.max(1, e.targetFindings)) * 100))
      const sub = e.dueAt
        ? (e.dueAt > t
          ? `Due in ${Math.max(1, Math.ceil((e.dueAt - t) / DAY_MS))} days`
          : `Overdue by ${Math.ceil((t - e.dueAt) / DAY_MS)} days`)
        : `${count} of ${e.targetFindings} findings`
      return { id: e.id, label: e.label, sub, pct, color: e.color }
    })
  }, [tracker.engagements, tracker.findings])

  const openFindingsAll = useMemo(
    () => tracker.findings
      .filter(f => !f.resolved)
      .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || b.createdAt - a.createdAt),
    [tracker.findings],
  )
  const openFindings = openFindingsAll.slice(0, 5)
  const openFindingsCount = openFindingsAll.length
  const criticalCount = tracker.findings.filter(f => !f.resolved && f.severity === 'crit').length
  const engagementCount = tracker.engagements.length

  const activeTargets = useMemo(
    () => Array.from(
      new Set(tracker.findings.filter(f => !f.resolved && f.target.trim()).map(f => f.target.trim())),
    ).slice(0, 6),
    [tracker.findings],
  )

  const sensitiveTerms = useMemo(() => {
    const s = new Set<string>()
    tracker.engagements.forEach(e => s.add(e.label))
    tracker.findings.forEach(f => { if (f.target) s.add(f.target) })
    return Array.from(s).filter(Boolean).sort((a, b) => b.length - a.length)
  }, [tracker.engagements, tracker.findings])

  const redactText = useCallback((text: string) => {
    if (!redact) return text
    let out = text
    for (const term of sensitiveTerms) {
      if (out.includes(term)) out = out.split(term).join(maskTerm(term))
    }
    return out
  }, [redact, sensitiveTerms])

  const typeLabel = useCallback((label: string) => (redact ? '••••' : label), [redact])

  const resetDemo = () => {
    if (tracker.findings.length > 0 || tracker.engagements.length > 0) {
      if (!window.confirm('Replace your current findings and engagements with sample demo data?')) return
    }
    tracker.resetDemo()
  }

  const clearAll = () => {
    if (window.confirm('Clear all findings, engagements, and activity? This cannot be undone.')) {
      tracker.clearAll()
    }
  }



  const openSpark = useMemo(() => sparkPath(weeklyFindings.map(d => d.total)), [weeklyFindings])
  const critSpark = useMemo(() => sparkPath(weeklyFindings.map(d => d.crit + d.high)), [weeklyFindings])
  const engSpark = useMemo(() => sparkPath(weeklyFindings.map(d => d.total)), [weeklyFindings])

  const hasData = tracker.findings.length > 0 || tracker.engagements.length > 0

  const currentEngagement = useMemo(() => {
    if (objectives.length === 0) return undefined
    const activeId = tracker.activeEngagementId
    if (activeId) {
      const found = objectives.find(o => o.id === activeId)
      if (found) return found
    }
    return [...objectives].sort((a, b) => b.pct - a.pct || a.label.localeCompare(b.label))[0]
  }, [objectives, tracker.activeEngagementId])
  const engagementPct = currentEngagement?.pct ?? 0

  return (
    <div className="relative min-h-full overflow-auto bg-[#050607] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_60%_-10%,rgba(0,224,164,0.07),transparent_55%)]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 bg-[radial-gradient(circle_at_center,rgba(23,184,144,0.04),transparent_65%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1440px] px-5 py-6 sm:px-6 lg:px-8 lg:py-8">
        {tracker.storageError && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Storage error: {tracker.storageError}. Your data may not persist.
          </div>
        )}
        {hasData && !storageNoticeDismissed && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#00E0A4]/20 bg-[#00E0A4]/[0.06] px-4 py-3 text-[13px] leading-relaxed text-white/70">
            <Lock size={16} className="mt-0.5 shrink-0 text-[#7DF0CE]" />
            <p className="min-w-0 flex-1">
              <span className="font-semibold text-[#7DF0CE]">Local data only.</span>{' '}
              Engagements and findings are stored unencrypted in this browser. Avoid real client scope until encryption ships.
            </p>
            <button
              type="button"
              onClick={dismissStorageNotice}
              className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-white/45 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss storage notice"
            >
              Got it
            </button>
          </div>
        )}

        <header className="relative mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          {!settings.reduceMotion && <HeaderOpsOverlayMemo />}
          <div className="relative z-10 max-w-xl">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-white/40">
              Welcome back, {settings.displayName.trim() || 'Operator'}
            </p>
            <h1 className={`font-bold leading-[1.15] tracking-tight ${settings.compactHeader ? 'text-[24px] sm:text-[28px]' : 'text-[28px] sm:text-[34px]'}`}>
              Attack surface,{' '}
              <span className="text-[#00E0A4]">at a glance.</span>
            </h1>
            {!settings.compactHeader && (
              <p className="mt-2 text-[14px] leading-6 text-white/45">
                Monitor engagements, track findings, and stay ahead of what matters — based only on data you log.
              </p>
            )}
          </div>
          <div className="relative z-10 flex flex-col items-start gap-3 sm:items-end">
            {settings.showClock && <DashboardClock />}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => startTransition(() => setRedact(r => !r))}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-white/60 transition hover:border-white/20 hover:text-white">
                {redact ? 'Reveal labels' : 'Redact labels'}
              </button>
              <button type="button" onClick={resetDemo}
                className="rounded-lg border border-[#00E0A4]/30 bg-[#00E0A4]/10 px-3.5 py-2 text-[12px] font-semibold text-[#7DF0CE] transition hover:border-[#00E0A4]/50 hover:bg-[#00E0A4]/15">
                {hasData ? 'Load sample' : 'Load sample data'}
              </button>
              {hasData && (
                <button type="button" onClick={clearAll}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-white/55 transition hover:border-red-400/40 hover:text-red-300">
                  Clear data
                </button>
              )}
            </div>
          </div>
        </header>

        {settings.showQuickActions && (
        <section aria-label="Quick actions" className="mb-6 flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={() => navigate('/hermes')}
            className="hover-lift inline-flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-2.5 text-[12px] font-semibold text-[var(--accent-soft)] transition hover:bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
            <Radar size={15} /> Start recon
          </button>
          <button type="button" onClick={() => navigate('/workspace')}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12px] font-semibold text-white/65 transition hover:border-white/20 hover:text-white">
            <Target size={15} /> New target
          </button>
          <button type="button" onClick={() => setShowFindingModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12px] font-semibold text-white/65 transition hover:border-white/20 hover:text-white">
            <ShieldAlert size={15} /> Log finding
          </button>
          <button type="button" onClick={() => navigate('/report')}
            className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[12px] font-semibold text-white/55 transition hover:border-white/20 hover:text-white">
            <FileText size={15} /> Scribe <ChevronRight size={14} />
          </button>
        </section>

                )}

        <KpiStrip
          openFindingsCount={openFindingsCount}
          criticalCount={criticalCount}
          engagementCount={engagementCount}
          activeTargetCount={activeTargets.length}
          weekOverWeek={weekOverWeek}
          openSpark={openSpark}
          critSpark={critSpark}
          engSpark={engSpark}
          showStageCoverage={settings.showStageCoverage}
          overallCoverage={overallCoverage}
          methodology={methodology}
          onNavigateStage={navigate}
        />

        <ExtraStatsStrip
          findings={tracker.findings}
          showSeverity={settings.showSeverityBreakdown}
          showStreak={settings.showStreakCard}
          showResolved={settings.showResolvedCard}
          cardEnterAnim={settings.cardEnterAnim}
          reduceMotion={settings.reduceMotion}
        />

        <AttackSurfaceSection
          activeTargets={activeTargets}
          findings={tracker.findings}
          methodology={methodology}
          recentActivity={recentActivity}
          showActivity={settings.showActivity}
          redactText={redactText}
          typeLabel={typeLabel}
          onNavigate={navigate}
          onLogFinding={() => setShowFindingModal(true)}
        />

        <ChartsAndFindings
          weeklyFindings={weeklyFindings}
          maxDay={maxDay}
          openFindings={openFindings}
          redactText={redactText}
          onLogFinding={() => setShowFindingModal(true)}
          onResolve={tracker.resolveFinding}
        />

        <EngagementFooter
          objectives={objectives}
          currentEngagement={currentEngagement}
          engagementPct={engagementPct}
          activeEngagementId={tracker.activeEngagementId}
          redact={redact}
          redactText={redactText}
          onSetActive={tracker.setActiveEngagement}
        />
      </div>

      {showFindingModal && (
        <Modal title="Log Finding" onClose={() => setShowFindingModal(false)}>
          <form className="space-y-4" onSubmit={e => {
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
          }}>
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-white/45">Title</label>
              <input autoFocus value={findingForm.title} onChange={e => setFindingForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Apache path traversal"
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[14px] outline-none placeholder:text-white/25 focus:border-[#00E0A4]/40" />
            </div>
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-white/45">Target</label>
              <input value={findingForm.target} onChange={e => setFindingForm(f => ({ ...f, target: e.target.value }))}
                placeholder="e.g. 10.10.14.52 or DC01"
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[14px] font-mono outline-none placeholder:text-white/25 focus:border-[#00E0A4]/40" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-white/45">Severity</label>
                <select value={findingForm.severity} onChange={e => setFindingForm(f => ({ ...f, severity: e.target.value as Severity }))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[14px] outline-none focus:border-[#00E0A4]/40">
                  {(Object.keys(SEVERITY_META) as Severity[]).map(sev => (
                    <option key={sev} value={sev} className="bg-[#080c10]">{SEVERITY_META[sev].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-white/45">Stage</label>
                <select value={findingForm.stage} onChange={e => setFindingForm(f => ({ ...f, stage: e.target.value as Stage }))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[14px] outline-none focus:border-[#00E0A4]/40">
                  {(Object.keys(STAGE_META) as Stage[]).map(stage => (
                    <option key={stage} value={stage} className="bg-[#080c10]">{STAGE_META[stage].label}</option>
                  ))}
                </select>
              </div>
            </div>
            {tracker.engagements.length > 0 && (
              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-white/45">Engagement</label>
                <select value={findingForm.engagementId} onChange={e => setFindingForm(f => ({ ...f, engagementId: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[14px] outline-none focus:border-[#00E0A4]/40">
                  <option value="" className="bg-[#080c10]">— none —</option>
                  {tracker.engagements.map(e => (
                    <option key={e.id} value={e.id} className="bg-[#080c10]">{e.label}</option>
                  ))}
                </select>
              </div>
            )}
            <button type="submit" className="w-full rounded-xl bg-[#00E0A4] py-3 text-[13px] font-bold uppercase tracking-wider text-[#00120C] transition hover:bg-[#19F5B8]">
              Log finding
            </button>
          </form>
        </Modal>
      )}

      {showEngagementModal && (
        <Modal title="New Engagement" onClose={() => setShowEngagementModal(false)}>
          <form className="space-y-4" onSubmit={e => {
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
          }}>
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-white/45">Name</label>
              <input autoFocus value={engagementForm.label} onChange={e => setEngagementForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Acme Corp — External Pentest"
                className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[14px] outline-none placeholder:text-white/25 focus:border-[#00E0A4]/40" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-white/45">Target findings</label>
                <input type="number" min={1} value={engagementForm.targetFindings}
                  onChange={e => setEngagementForm(f => ({ ...f, targetFindings: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[14px] outline-none focus:border-[#00E0A4]/40" />
              </div>
              <div>
                <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-white/45">Due date</label>
                <input type="date" value={engagementForm.dueDate}
                  onChange={e => setEngagementForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[14px] outline-none [color-scheme:dark] focus:border-[#00E0A4]/40" />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-white/45">Color</label>
              <div className="flex items-center gap-2">
                {['#00E0A4', '#17B890', '#22d3ee', '#ff4d6d', '#fbbf24'].map(c => (
                  <button type="button" key={c} onClick={() => setEngagementForm(f => ({ ...f, color: c }))}
                    className="h-8 w-8 rounded-full transition-transform"
                    style={{ background: c, transform: engagementForm.color === c ? 'scale(1.15)' : 'scale(1)', boxShadow: engagementForm.color === c ? `0 0 0 2px #060a0f, 0 0 0 4px ${c}` : 'none' }} />
                ))}
              </div>
            </div>
            <button type="submit" className="w-full rounded-xl bg-[#00E0A4] py-3 text-[13px] font-bold uppercase tracking-wider text-[#00120C] transition hover:bg-[#19F5B8]">
              Create engagement
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
})

/* ─── Settings panel (own state — does not re-render App while typing) ─ */
const SettingsPanel = memo(function SettingsPanel({
  initial,
  onClose,
  onSave,
}: {
  initial: AppSettings
  onClose: () => void
  onSave: (next: AppSettings) => void
}) {
  const [draft, setDraft] = useState<AppSettings>(initial)

  const save = () => {
    onSave({
      ...draft,
      displayName: draft.displayName.trim() || DEFAULT_SETTINGS.displayName,
      accentColor: draft.accentColor || DEFAULT_SETTINGS.accentColor,
    })
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label htmlFor="settings-display-name" className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-white/45">Display name</label>
          <input
            id="settings-display-name"
            autoFocus
            value={draft.displayName}
            onChange={e => setDraft(s => ({ ...s, displayName: e.target.value }))}
            onKeyDown={e => e.stopPropagation()}
            placeholder="Your name"
            className="w-full rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-[14px] outline-none placeholder:text-white/25 focus:border-[var(--accent)]"
          />
          <p className="mt-1.5 text-[12px] text-white/35">Welcome line and avatar initials.</p>
        </div>
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/45">Accent color</div>
          <div className="flex flex-wrap gap-2">
            {ACCENT_PRESETS.map(p => (
              <button
                key={p.id}
                type="button"
                title={p.label}
                onClick={() => setDraft(s => ({ ...s, accentColor: p.value }))}
                className="h-8 w-8 rounded-full transition-transform"
                style={{
                  background: p.value,
                  transform: draft.accentColor === p.value ? 'scale(1.15)' : 'scale(1)',
                  boxShadow: draft.accentColor === p.value ? `0 0 0 2px #0a0c0e, 0 0 0 4px ${p.value}` : 'none',
                }}
              />
            ))}
            <label className="flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2 text-[11px] text-white/50">
              Custom
              <input
                type="color"
                value={draft.accentColor}
                onChange={e => setDraft(s => ({ ...s, accentColor: e.target.value }))}
                className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent"
              />
            </label>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/45">Dashboard layout</div>
          {([
            ['showClock', 'Show date & clock'],
            ['showStageCoverage', 'Show stage coverage card'],
            ['showSeverityBreakdown', 'Severity mix card'],
            ['showStreakCard', 'Logging streak card'],
            ['showResolvedCard', 'Resolved this week card'],
            ['showQuickActions', 'Show quick action buttons'],
            ['showActivity', 'Show recent activity'],
            ['compactHeader', 'Compact header'],
          ] as const).map(([key, label]) => {
            const boolKey = key as keyof AppSettings
            return (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-3 text-[14px] text-white/70">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(draft[boolKey])}
                  onChange={e => setDraft(s => ({ ...s, [boolKey]: e.target.checked }))}
                  className="h-4 w-4 rounded"
                  style={{ accentColor: draft.accentColor }}
                />
              </label>
            )
          })}
          <div className="flex items-center justify-between gap-3 pt-1 text-[14px] text-white/70">
            <span>Density</span>
            <select
              value={draft.density}
              onChange={e => setDraft(s => ({
                ...s,
                density: e.target.value as 'comfortable' | 'compact',
              }))}
              className="rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[13px] outline-none"
            >
              <option value="comfortable" className="bg-[#0a0c0e]">Comfortable</option>
              <option value="compact" className="bg-[#0a0c0e]">Compact</option>
            </select>
          </div>
        </div>
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-[12px] font-semibold uppercase tracking-wider text-white/45">Privacy & motion</div>
          {([
            ['defaultRedact', 'Start with labels redacted'],
            ['reduceMotion', 'Reduce motion / animations'],
            ['cardEnterAnim', 'Card enter animations'],
          ] as const).map(([key, label]) => {
            const boolKey = key as keyof AppSettings
            return (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-3 text-[14px] text-white/70">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(draft[boolKey])}
                  onChange={e => setDraft(s => ({ ...s, [boolKey]: e.target.checked }))}
                  className="h-4 w-4 rounded"
                  style={{ accentColor: draft.accentColor }}
                />
              </label>
            )
          })}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/10 py-3 text-[13px] font-semibold text-white/55 transition hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            data-modal-primary="true"
            onClick={save}
            className="flex-1 rounded-xl py-3 text-[13px] font-bold uppercase tracking-wider text-[#00120C] transition"
            style={{ background: draft.accentColor || '#00E0A4' }}
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
})

const ToolsFlyout = memo(function ToolsFlyout({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    // Warm the most-used chunks while the flyout is open
    const warm = [
      () => import('./components/chat/ChatWindow'),
      () => import('./components/recon/OsintRecon'),
      () => import('./components/nmap/NmapBuilder'),
      () => import('./components/workspace/Workspace'),
    ]
    let i = 0
    const id = window.setInterval(() => {
      if (i < warm.length) void warm[i++]()
    }, 120)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="fixed inset-x-0 top-[72px] z-40 px-4 sm:px-6 lg:px-8 animate-[fadeIn_0.18s_ease-out]">
      <div className="mx-auto max-w-[1700px] rounded-2xl border border-white/10 bg-[#080b0a]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,.55)]">
        <div className="mb-3 flex items-center justify-between px-1">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--accent-soft)]">All tools</div>
            <div className="text-[13px] text-white/40">Jump into any Obscurum module.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/[0.06] px-2 py-1 text-[9px] uppercase tracking-widest text-white/30 hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="grid max-h-[48vh] grid-cols-2 gap-2 overflow-y-auto custom-scrollbar sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {NAV.map(({ to, icon: Icon, label, color }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => {
                // Close overlay before the lazy chunk work so the UI can paint.
                onClose()
              }}
              onMouseEnter={() => {
                // Warm the lazy chunk while the user aims the cursor.
                if (to === '/chat') void import('./components/chat/ChatWindow')
              }}
              onPointerDown={() => {
                // Start fetch on press — earlier than click navigation.
                if (to === '/chat') void import('./components/chat/ChatWindow')
              }}
              className="group glass-nav flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-white/55 transition duration-150 hover:text-[var(--accent-soft)]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
                <Icon size={15} style={{ color }} />
              </span>
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
})


/* ─── Static app CSS (hoisted — never re-created on App re-render) ─── */
const APP_CSS = `        *::selection { background: color-mix(in srgb, var(--accent) 25%, transparent); }
        @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cardIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes matrixFall{0%{transform:translate3d(0,-10%,0);opacity:0}12%{opacity:.55}100%{transform:translate3d(0,130%,0);opacity:0}}
        @keyframes scanY{0%{top:0%;opacity:0}12%{opacity:.7}55%{top:92%;opacity:.4}100%{top:100%;opacity:0}}
        @keyframes glowPulse{0%,100%{opacity:.55}50%{opacity:1}}
        @keyframes softPulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb, var(--accent) 35%, transparent)}70%{box-shadow:0 0 0 8px transparent}}
        @keyframes barShine{0%{transform:translateX(-120%)}100%{transform:translateX(220%)}}
        @keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        @keyframes statusBlink{0%,100%{opacity:1}50%{opacity:.35}}
        .anim-card{animation:cardIn .5s cubic-bezier(.22,1,.36,1) both}
        .anim-stagger-1{animation-delay:40ms}
        .anim-stagger-2{animation-delay:90ms}
        .anim-stagger-3{animation-delay:140ms}
        .anim-stagger-4{animation-delay:190ms}
        .shine-bar{position:relative;overflow:hidden}
        .shine-bar::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);width:40%;animation:barShine 2.8s ease-in-out infinite}
        .live-dot{animation:statusBlink 1.8s ease-in-out infinite}
        .hover-lift{transition:transform .2s ease,border-color .2s ease,background .2s ease,box-shadow .2s ease}
        .hover-lift:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.25)}
        @media (prefers-reduced-motion: reduce){
          .anim-card,.shine-bar::after,.live-dot{animation:none !important}
          .hover-lift:hover{transform:none}
        }
        html, body, #root { background:#050607; color-scheme:dark; }
        input, select, textarea { color-scheme:dark; }
        .custom-scrollbar::-webkit-scrollbar { width:5px; height:5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background:transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background:color-mix(in srgb, var(--accent) 18%, transparent); border-radius:999px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background:color-mix(in srgb, var(--accent) 35%, transparent); }
        .glass-panel {
          background:linear-gradient(145deg, rgba(255,255,255,.06), color-mix(in srgb, var(--accent) 3%, transparent) 45%, rgba(14,16,18,.82));
          border:1px solid rgba(255,255,255,.09);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 16px 40px rgba(0,0,0,.3);
          isolation:isolate;
          contain:layout style;
        }
        .glass-panel:hover {
          border-color:color-mix(in srgb, var(--accent) 26%, transparent);
          background:linear-gradient(145deg, rgba(255,255,255,.08), color-mix(in srgb, var(--accent) 5%, transparent) 45%, rgba(16,18,20,.88));
        }
        .glass-nav {
          background:linear-gradient(180deg, rgba(255,255,255,.07), rgba(12,16,14,.9));
          border:1px solid rgba(255,255,255,.1);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
        }
        /* Blur only when GPU can afford it; still looks glassy via gradient fill */
        /* Blur is optional eye-candy — skip on first paint pressure; enable only on strong GPUs */
        @media (min-width: 1280px) and (prefers-reduced-motion: no-preference) {
          .glass-panel {
            backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
          }
        }
        .defer-paint {
          content-visibility:auto;
          contain-intrinsic-size:auto 320px;
        }
        .glass-tab-active {
          background:linear-gradient(180deg, color-mix(in srgb, var(--accent) 28%, transparent), color-mix(in srgb, var(--accent) 14%, transparent));
          color:var(--accent-soft);
          border:1px solid color-mix(in srgb, var(--accent) 35%, transparent);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 0 24px color-mix(in srgb, var(--accent) 18%, transparent);
        }
        .density-compact .glass-panel { padding: 0.85rem !important; }
        .density-compact h1 { font-size: 1.5rem !important; }
        .top-tool { transition:transform .18s ease, border-color .18s ease, background .18s ease, color .18s ease; }
        .top-tool:hover { transform:translateY(-1px); border-color:color-mix(in srgb, var(--accent) 28%, transparent) !important; color:var(--accent-soft) !important; }
        button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline:2px solid color-mix(in srgb, var(--accent) 50%, transparent); outline-offset:2px;
        }
        @media (prefers-reduced-motion: reduce) {
          *,*::before,*::after {
            animation-duration:.01ms !important; animation-iteration-count:1 !important;
            scroll-behavior:auto !important; transition-duration:.01ms !important;
          }
        }`;

/* ─── Root App ──────────────────────────────────────────────────────── */
export default function App() {
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'running' | 'launched' | 'not_found'>('checking')
  const [showTools, setShowTools] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const location = useLocation()
  const lastVisitedRef = useRef<string | null>(null)

  useEffect(() => {
    if (lastVisitedRef.current === location.pathname) return
    lastVisitedRef.current = location.pathname
    // Silent — no React setState (was a major freeze source when opening tools)
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(TRACKER_KEY)
        const base: TrackerState = raw ? (JSON.parse(raw) as TrackerState) : emptyTracker()
        if (!Array.isArray(base.visited)) base.visited = []
        if (base.visited.includes(location.pathname)) return
        base.visited = [...base.visited, location.pathname]
        localStorage.setItem(TRACKER_KEY, JSON.stringify(base))
      } catch { /* ignore */ }
    })
  }, [location.pathname])

  useEffect(() => {
    const check = async () => {
      if (!window.obscurum?.ensureOllamaAvailable) return
      try {
        const status = await window.obscurum.ensureOllamaAvailable()
        setOllamaStatus(status as typeof ollamaStatus)
      } catch (err) {
        console.error('Ollama check failed:', err)
        setOllamaStatus('not_found')
      }
    }
    void check()
  }, [])

  // Debounce settings persistence
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
      } catch { /* ignore */ }
    }, 300)
    return () => window.clearTimeout(id)
  }, [settings])

  const openSettings = useCallback(() => startTransition(() => setShowSettings(true)), [])
  const closeSettings = useCallback(() => setShowSettings(false), [])
  const handleSaveSettings = useCallback((next: AppSettings) => {
    startTransition(() => setSettings(next))
    setShowSettings(false)
  }, [])
  const closeTools = useCallback(() => setShowTools(false), [])

  const accent = settings.accentColor || DEFAULT_SETTINGS.accentColor
  const accentSoft = useMemo(() => softAccent(accent), [accent])
  const accentDeep = useMemo(() => deepAccent(accent), [accent])

  return (
    <div
      className="flex h-screen flex-col overflow-hidden font-sans text-white"
      style={{
        background: '#050607',
        ['--accent' as string]: accent,
        ['--accent-soft' as string]: accentSoft,
        ['--accent-deep' as string]: accentDeep,
      }}
    >
      <style>{APP_CSS}</style>

      <TitleBar />

      {/* top navigation */}
      <div className="relative z-20 border-b border-white/10 bg-[#080b0a]">
        <div className="mx-auto max-w-[1700px] px-4 py-2.5 lg:px-6">
          <div className="flex items-center gap-3">
            <NavLink to="/" aria-label="Obscurum dashboard" className="hidden shrink-0 items-center gap-2 md:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#00E0A4]/30 bg-[#02100C] shadow-[0_0_28px_rgba(0,224,164,.18)]">
                <BrandMark size={23} />
              </span>
              <span className="text-[12px] font-black tracking-[0.22em] text-white/90">OBSCURUM</span>
            </NavLink>

            <nav className="glass-nav flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-2xl p-1.5 custom-scrollbar">
              {TOP_TABS.map(([to, label]) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    'relative whitespace-nowrap rounded-xl px-3.5 py-2 text-[12px] font-semibold tracking-wide transition-all duration-200 ' +
                    (isActive
                      ? 'glass-tab-active shadow-[0_0_20px_rgba(0,224,164,.15)]'
                      : 'text-white/50 hover:bg-white/[0.05] hover:text-white/90')
                  }
                >
                  {label}
                </NavLink>
              ))}
              <button
                type="button"
                onClick={() => {
                  // Keep the click paint responsive; mount/unmount flyout as a transition.
                  startTransition(() => setShowTools(v => !v))
                }}
                className={
                  'relative whitespace-nowrap rounded-xl px-3.5 py-2 text-[12px] font-semibold tracking-wide transition-all duration-200 ' +
                  (showTools
                    ? 'glass-tab-active shadow-[0_0_20px_rgba(0,224,164,.15)]'
                    : 'text-white/50 hover:bg-white/[0.05] hover:text-white/90')
                }
              >
                Tools
              </button>
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <span className="glass-nav hidden items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-white/55 sm:flex">
                <span
                  className={`h-2 w-2 rounded-full ${
                    ollamaStatus === 'not_found' ? 'bg-amber-400'
                    : ollamaStatus === 'checking' ? 'bg-white/35'
                    : 'live-dot bg-[var(--accent)] shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_60%,transparent)]'
                  }`}
                />
                {ollamaStatus === 'not_found' ? 'Offline' : ollamaStatus === 'checking' ? 'Checking' : 'Connected'}
              </span>
              <button
                type="button"
                onClick={openSettings}
                title="Settings"
                aria-label="Open settings"
                className="glass-nav flex h-9 w-9 items-center justify-center rounded-xl text-white/50 transition hover:text-[var(--accent-soft)]"
              >
                <Settings size={16} />
              </button>
              <button
                type="button"
                onClick={openSettings}
                title="Profile & settings"
                aria-label="Profile and settings"
                className="flex h-9 w-9 items-center justify-center rounded-xl border text-[12px] font-bold transition"
                style={{
                  borderColor: 'color-mix(in srgb, var(--accent) 25%, transparent)',
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  color: 'var(--accent-soft)',
                }}
              >
                {initialsFromName(settings.displayName)}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* tools flyout */}
      {showTools && <ToolsFlyout onClose={closeTools} />}

      {showSettings && (
        <SettingsPanel
          initial={settings}
          onClose={closeSettings}
          onSave={handleSaveSettings}
        />
      )}

<main className={`min-h-0 flex-1 overflow-auto bg-[#050607] animate-[fadeIn_0.25s_ease-out] ${settings.density === 'compact' ? 'density-compact' : ''}`}>
        {ollamaStatus === 'not_found' && (
          <div className="sticky top-0 z-30 border-b border-amber-500/20 bg-amber-500/[0.08] px-4 py-2 text-center text-[10px] font-semibold text-amber-200">
            Ollama was not detected. Install it or launch it before using local models.
          </div>
        )}
        <Suspense fallback={<ToolFallback />}>
          <Routes>
            <Route path="/" element={
              <TrackerProvider>
                <Dashboard settings={settings} />
              </TrackerProvider>
            } />
            <Route path="/aegis" element={<ScopeValidator />} />
            <Route path="/chat" element={<DeferredChat />} />
            <Route path="/hermes" element={<OsintRecon />} />
            <Route path="/nmap" element={<NmapBuilder />} />
            <Route path="/cve" element={<CVECenter />} />
            <Route path="/hash" element={<HashIdentifier />} />
            <Route path="/password-cracker" element={<PasswordCracker />} />
            <Route path="/payload" element={<PayloadForge />} />
            <Route path="/analyzer" element={<ServiceAnalyzer />} />
            <Route path="/privesc/linux" element={<LinuxPrivesc />} />
            <Route path="/privesc/windows" element={<WindowsPrivesc />} />
            <Route path="/coach" element={<HTBCoach />} />
            <Route path="/gobuster-msf" element={<GobusterMSFCoach />} />
            <Route path="/wireshark-coach" element={<WiresharkCoach />} />
            <Route path="/responder-coach" element={<ResponderCoach />} />
            <Route path="/bloodhound" element={<BloodHoundCoach />} />
            <Route path="/orthrus" element={<ADAttackHelper />} />
            <Route path="/cassandra" element={<Cassandra />} />
            <Route path="/habits" element={<HabitTracker />} />
            <Route path="/report" element={<ReportWriter />} />
            <Route path="/attack-path" element={<AttackPath />} />
            <Route path="/attack-generator" element={<AttackPathGenerator />} />
            <Route path="/vuln-matcher" element={<VulnerabilityMatcher />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/kb" element={<KnowledgeBase />} />
            <Route path="/models" element={<ModelManager />} />
            <Route path="/webapp-coach" element={<WebAppCoach />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}