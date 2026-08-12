import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Search, Shield, AlertTriangle, Info, Cpu, ExternalLink, Copy, Check, 
  BookOpen, Zap, Target, Calendar, Link, Download, Upload, 
  Trash2, History, Star, Landmark, Sparkles,
  Play, FileText, Compass, Wrench,
  ChevronDown, ChevronUp
} from 'lucide-react'
import { ollamaChatOnce } from '../../lib/ollama'
import { useActiveModel } from '../models/ModelManager'
import AIResponseText from '../shared/AIResponseText'   // ✅ added for markdown AI rendering

type CVEResult = {
  id: string;
  description: string;
  severity: string;
  cvssScore: number;
  cvssVector: string;
  published: string;
  modified: string;
  references: string[];
  affectedProducts: string[];
  cweId?: string;
  epssScore?: number;
  exploitability?: string;
  impact: {
    confidentiality: string;
    integrity: string;
    availability: string;
  };
}

type AIAnalysis = {
  rootCause: string;
  technicalDetail: string;
  exploitation: string;
  mitigation: string;
  tools: string;
  detection: string;
  remediation: string;
  timeline: string;
}

type SavedCVE = {
  id: string;
  cveId: string;
  timestamp: number;
  notes?: string;
  severity: string;
  cvssScore: number;
}

// Enhanced color scheme for better contrast against dark backgrounds
const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-400 border-red-400/40 bg-red-500/10',
  HIGH:     'text-amber-400 border-amber-400/40 bg-amber-500/10',
  MEDIUM:   'text-cyan-400 border-cyan-400/40 bg-cyan-500/10',
  LOW:      'text-emerald-400 border-emerald-400/40 bg-emerald-500/10',
  NONE:     'text-white/40 border-white/20 bg-white/5',
}

const SEVERITY_BAR: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH:     'bg-amber-500',
  MEDIUM:   'bg-cyan-500',
  LOW:      'bg-emerald-500',
  NONE:     'bg-white/20',
}

const IMPACT_COLOR: Record<string, string> = {
  HIGH: 'text-red-400',
  LOW: 'text-amber-400',
  NONE: 'text-white/40'
}

function getSeverity(score: number): string {
  if (score >= 9.0) return 'CRITICAL'
  if (score >= 7.0) return 'HIGH'
  if (score >= 4.0) return 'MEDIUM'
  if (score > 0)    return 'LOW'
  return 'NONE'
}

function normalizeSeverity(s: string): string {
  return s.toUpperCase()
}

// ─── COPY BUTTON WITH FALLBACK ───

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
        el.style.left = '-9999px'
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
      className="flex items-center gap-1 text-xs text-white/40 hover:text-purple-400 transition-colors"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? <><Check size={10} className="text-emerald-400" />copied</> : <><Copy size={10} />copy</>}
    </button>
  )
}

// ─── UPDATED RECENT CVES ───
const RECENT_CVES = [
  'CVE-2024-21413', // Microsoft Outlook RCE (2024)
  'CVE-2024-21410', // Microsoft Exchange Server Elevation of Privilege (2024)
  'CVE-2024-20767', // Adobe ColdFusion Authentication Bypass (2024)
  'CVE-2023-4911',  // Looney Tunables (GLIBC) 
  'CVE-2023-44487', // HTTP/2 Rapid Reset (2023)
  'CVE-2023-34362', // MOVEit Transfer SQL Injection (2023)
  'CVE-2021-44228', // Log4Shell
  'CVE-2022-0847',  // Dirty Pipe
  'CVE-2023-23397', // Microsoft Outlook EoP (2023)
  'CVE-2022-22965', // Spring4Shell
  'CVE-2021-4034',  // PwnKit
  'CVE-2023-2825',  // GitLab RCE
  'CVE-2021-3156',  // Baron Samedit (sudo)
]

// CVSS Score interpretation
const CVSS_INTERPRETATION: Record<string, { label: string; urgency: string; action: string }> = {
  'CRITICAL': {
    label: 'Critical',
    urgency: 'Immediate (24 hours)',
    action: 'Patch immediately. Consider temporary mitigation.'
  },
  'HIGH': {
    label: 'High Risk',
    urgency: 'Urgent (1-3 days)',
    action: 'Plan emergency patch cycle. Monitor for exploitation.'
  },
  'MEDIUM': {
    label: 'Moderate Risk',
    urgency: 'Standard (7-14 days)',
    action: 'Include in regular patch cycle. Risk is manageable.'
  },
  'LOW': {
    label: 'Low Risk',
    urgency: 'Low priority (30+ days)',
    action: 'Patch during maintenance windows. Monitor for changes.'
  },
  'NONE': {
    label: 'No Risk',
    urgency: 'None required',
    action: 'No immediate action needed.'
  }
}

export default function CVECenter() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [cve, setCve] = useState<CVEResult | null>(null)
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'exploit' | 'history'>('overview')
  const [showBeginnerTips, setShowBeginnerTips] = useState(true)
  const [showAboutCVEs, setShowAboutCVEs] = useState(true)
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('cve_search_history')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [savedCVEs, setSavedCVEs] = useState<SavedCVE[]>(() => {
    try {
      const saved = localStorage.getItem('cve_saved')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [notes, setNotes] = useState('')
  const [editingNote, setEditingNote] = useState(false)
  const [filterSeverity, setFilterSeverity] = useState('All')
  const [sortBy, setSortBy] = useState<'date' | 'severity' | 'score'>('date')
  const [searchStats, setSearchStats] = useState({ total: 0, critical: 0, high: 0, medium: 0, low: 0 })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchRequestIdRef = useRef(0)
  const activeModel = useActiveModel()

  // Save to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('cve_search_history', JSON.stringify(searchHistory))
    } catch (err) {
      console.error('cve_search_history: save failed', err)
    }
  }, [searchHistory])

  useEffect(() => {
    try {
      localStorage.setItem('cve_saved', JSON.stringify(savedCVEs))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        console.error('cve_saved: localStorage quota exceeded')
        setError('Saved CVEs are not persisting — storage quota exceeded. Consider exporting or removing older entries.')
      } else {
        console.error('Failed to save CVEs:', err)
      }
    }
  }, [savedCVEs])

  // Update stats
  useEffect(() => {
    const stats = {
      total: savedCVEs.length,
      critical: savedCVEs.filter(c => c.severity === 'CRITICAL').length,
      high: savedCVEs.filter(c => c.severity === 'HIGH').length,
      medium: savedCVEs.filter(c => c.severity === 'MEDIUM').length,
      low: savedCVEs.filter(c => c.severity === 'LOW').length,
    }
    setSearchStats(stats)
  }, [savedCVEs])

  const search = useCallback(async (id?: string) => {
    const q = (id ?? query).trim().toUpperCase()
    if (!q) return
    if (!q.match(/^CVE-\d{4}-\d+$/)) {
      setError('Invalid format. Use: CVE-YYYY-NNNNN')
      return
    }
    
    const myRequestId = ++searchRequestIdRef.current
    setLoading(true)
    setError('')
    setCve(null)
    setAnalysis(null)
    setActiveTab('overview')
    setNotes('')
    setEditingNote(false)

    // Add to search history
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item !== q)
      return [q, ...filtered].slice(0, 50)
    })

    try {
      // Primary source: NVD
      const nvdRes = await fetch(`https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${q}`)
      if (myRequestId !== searchRequestIdRef.current) return
      const nvdData = await nvdRes.json()
      if (myRequestId !== searchRequestIdRef.current) return
      const item = nvdData?.vulnerabilities?.[0]?.cve
      if (!item) {
        setError(`${q} not found in NVD database.`)
        setLoading(false)
        return
      }

      // Get EPSS score
      let epssScore = 0
      try {
        const epssRes = await fetch(`https://api.first.org/data/v1/epss?cve=${q}`)
        if (myRequestId !== searchRequestIdRef.current) return
        const epssData = await epssRes.json()
        epssScore = epssData?.data?.[0]?.epss ? parseFloat(epssData.data[0].epss) : 0
      } catch {}

      if (myRequestId !== searchRequestIdRef.current) return

      const metrics = item.metrics?.cvssMetricV31?.[0] ?? item.metrics?.cvssMetricV30?.[0] ?? item.metrics?.cvssMetricV2?.[0]
      const score   = metrics?.cvssData?.baseScore ?? 0
      const vector  = metrics?.cvssData?.vectorString ?? 'N/A'
      const refs    = (item.references ?? []).slice(0, 8).map((r: { url: string }) => r.url)
      const configs = item.configurations ?? []
      const products: string[] = []
      configs.forEach((cfg: { nodes: { cpeMatch: { criteria: string }[] }[] }) => {
        cfg.nodes?.forEach(node => {
          node.cpeMatch?.forEach(m => {
            const parts = m.criteria?.split(':') ?? []
            if (parts.length > 4) products.push(`${parts[3]} ${parts[4]}`)
          })
        })
      })

      // Get CWE ID
      const cwes = item.weaknesses?.flatMap((w: any) => 
        w.description?.filter((d: any) => d.lang === 'en')?.map((d: any) => d.value) || []
      ) || []
      const cweId = cwes.find((cwe: string) => cwe.startsWith('CWE-'))

      // Get impact scores
      const impact = {
        confidentiality: metrics?.cvssData?.confidentialityImpact || 'NONE',
        integrity: metrics?.cvssData?.integrityImpact || 'NONE',
        availability: metrics?.cvssData?.availabilityImpact || 'NONE'
      }

      const severity = getSeverity(score)
      setCve({
        id: item.id,
        description: item.descriptions?.find((d: { lang: string }) => d.lang === 'en')?.value ?? 'No description.',
        severity,
        cvssScore: score,
        cvssVector: vector,
        published: item.published?.split('T')[0] ?? 'N/A',
        modified: item.lastModified?.split('T')[0] ?? 'N/A',
        references: refs,
        affectedProducts: [...new Set(products)].slice(0, 10),
        cweId,
        epssScore,
        exploitability: metrics?.exploitabilityScore?.toFixed(1) || 'N/A',
        impact
      })

      // Check if already saved
      const existing = savedCVEs.find(s => s.cveId === q)
      if (existing) {
        setNotes(existing.notes || '')
      }

    } catch (err) {
      if (myRequestId !== searchRequestIdRef.current) return
      console.error('NVD fetch error:', err)
      if (err instanceof TypeError) {
        setError(`Failed to reach NVD — likely a CORS/CSP block from Electron's renderer, not your internet connection. Raw: ${err.message}`)
      } else {
        setError(`Failed to fetch from NVD: ${err instanceof Error ? err.message : String(err)}`)
      }
    } finally {
      if (myRequestId === searchRequestIdRef.current) {
        setLoading(false)
      }
    }
  }, [query, savedCVEs])

  const analyze = useCallback(async () => {
    if (!cve) return
    setAnalyzing(true)
    setAnalysis(null)
    setActiveTab('analysis')

    try {
      const text = await ollamaChatOnce(
        activeModel,
        [
          {
            role: 'system',
            content:
              'You are a cybersecurity expert specializing in CVE analysis. Respond ONLY with valid JSON, no markdown or extra text. Keys: rootCause (1 sentence), technicalDetail (2-3 sentences), exploitation (how to exploit, 2-3 sentences), mitigation (specific fix steps), tools (comma-separated exploit tools/frameworks), detection (how to detect in logs/network), remediation (detailed patching steps), timeline (when to patch based on severity).',
          },
          {
            role: 'user',
            content: `Analyze ${cve.id}: "${cve.description}". CVSS: ${cve.cvssScore} (${cve.severity}). CWE: ${cve.cweId || 'N/A'}.`,
          },
        ],
        { temperature: 0.4 },
      )
      
      // Extract JSON from response
      let jsonString = (text ?? '').trim()
      const jsonStart = jsonString.indexOf('{')
      const jsonEnd = jsonString.lastIndexOf('}') + 1
      
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonString = jsonString.substring(jsonStart, jsonEnd)
      }
      
      try {
        const parsed = JSON.parse(jsonString)
        setAnalysis(parsed)
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError)
        console.error('Raw response:', text)
        throw new Error('Failed to parse AI response')
      }
    } catch (err) {
      console.error('AI Analysis Error:', err)
      setAnalysis({
        rootCause: 'AI analysis failed.',
        technicalDetail: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        exploitation: 'Failed to get exploitation details.',
        mitigation: 'Failed to get mitigation steps.',
        tools: 'N/A',
        detection: 'N/A',
        remediation: 'N/A',
        timeline: 'N/A'
      })
    } finally {
      setAnalyzing(false)
    }
  }, [cve, activeModel])

  const saveCVE = useCallback(() => {
    if (!cve) return
    const existing = savedCVEs.find(s => s.cveId === cve.id)
    if (existing) {
      // Update notes
      setSavedCVEs(prev => prev.map(s => 
        s.cveId === cve.id ? { ...s, notes: notes || undefined } : s
      ))
    } else {
      setSavedCVEs(prev => [{
        id: crypto.randomUUID(),
        cveId: cve.id,
        timestamp: Date.now(),
        notes: notes || undefined,
        severity: cve.severity,
        cvssScore: cve.cvssScore
      }, ...prev])
    }
    setEditingNote(false)
  }, [cve, savedCVEs, notes])

  const deleteSavedCVE = useCallback((cveId: string) => {
    if (!confirm(`Remove ${cveId} from saved list?`)) return
    setSavedCVEs(prev => prev.filter(s => s.cveId !== cveId))
  }, [])

  const clearAllCVEs = useCallback(() => {
    if (savedCVEs.length === 0) return
    if (!confirm(`Delete all ${savedCVEs.length} saved CVEs? This cannot be undone.`)) return
    setSavedCVEs([])
  }, [savedCVEs.length])

  const exportCVEs = useCallback(() => {
    if (savedCVEs.length === 0) {
      setError('No CVEs to export')
      return
    }
    try {
      // Minify JSON for export
      const data = JSON.stringify(savedCVEs)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cve_analysis_${new Date().toISOString().slice(0,10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to export')
    }
  }, [savedCVEs])

  const importCVEs = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (!Array.isArray(data)) {
          setError('Invalid format: expected array of CVEs')
          return
        }
        if (data.length === 0) {
          setError('File contains no CVEs')
          return
        }
        
        // Normalize severity and dedupe by cveId
        const normalized = data.map((c: SavedCVE) => ({
          ...c,
          severity: normalizeSeverity(c.severity),
        }))
        const incomingIds = new Set(normalized.map(c => c.cveId).filter(Boolean))
        setSavedCVEs(prev => {
          const filtered = prev.filter(c => !incomingIds.has(c.cveId))
          return [...normalized, ...filtered]
        })
        setImportMessage(`Imported ${normalized.length} CVEs`)
        setTimeout(() => setImportMessage(null), 3000)
        setError('')
      } catch {
        setError('Failed to import file')
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  // Filter and sort saved CVEs
  const filteredSavedCVEs = savedCVEs
    .filter(c => filterSeverity === 'All' || c.severity === filterSeverity)
    .sort((a, b) => {
      if (sortBy === 'date') return b.timestamp - a.timestamp
      if (sortBy === 'severity') {
        const order: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 }
        return (order[b.severity] ?? 0) - (order[a.severity] ?? 0)
      }
      if (sortBy === 'score') return b.cvssScore - a.cvssScore
      return 0
    })

  const isCveSaved = cve ? savedCVEs.some(s => s.cveId === cve.id) : false

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-purple-500/20" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.18), rgba(168,85,247,0.04))' }}>
            <Landmark size={16} className="text-purple-400" />
          </div>
          <div>
            <span className="text-white font-bold text-base flex items-center gap-1.5">
              Oraculum
              <Sparkles size={12} className="text-amber-400" />
            </span>
            <div className="text-white/40 text-xs">CVE intelligence · NVD + AI analysis</div>
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
                ? 'border-purple-500/30 text-purple-400 bg-purple-500/10' 
                : 'border-white/10 text-white/50 hover:text-white/80 hover:border-white/20'
            }`}
          >
            <History size={12} />
            Saved {savedCVEs.length > 0 && `(${savedCVEs.length})`}
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="px-8 py-6 max-w-6xl mx-auto">

        {/* ── About CVEs (Collapsible) ── */}
        <div className="mb-6">
          <button
            onClick={() => setShowAboutCVEs(!showAboutCVEs)}
            className="w-full flex items-center justify-between bg-purple-500/5 border border-purple-500/20 rounded-2xl px-5 py-3 hover:bg-purple-500/10 transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <Compass size={14} className="text-purple-400" />
              <span className="text-purple-400 font-mono font-bold text-sm">What a CVE Actually Is</span>
              <span className="text-white/30 text-xs ml-2 hidden sm:inline">
                {showAboutCVEs ? 'Click to collapse' : 'Click to expand'} — Essential knowledge
              </span>
            </div>
            <div className="text-white/30 group-hover:text-purple-400 transition-colors">
              {showAboutCVEs ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>
          
          {showAboutCVEs && (
            <div className="bg-white/5 border border-purple-500/20 border-t-0 rounded-b-2xl p-5 space-y-3 text-xs text-white/70 leading-relaxed">
              <p>
                CVE (Common Vulnerabilities and Exposures) is just an ID scheme — <code className="text-purple-400">CVE-YYYY-NNNNN</code>{' '}
                uniquely names a specific publicly known vulnerability so everyone (vendors, researchers, tools) can
                refer to the same flaw without ambiguity. The CVE ID itself carries no severity information — that's
                what CVSS is for. A CVE is assigned by a CNA (CVE Numbering Authority, usually the vendor or a body
                like MITRE) once a vulnerability is disclosed; the year in the ID is the year it was <em>assigned</em>,
                not necessarily the year it was found or fixed.
              </p>
              <div className="text-purple-400 font-mono font-bold text-sm pt-1">The Three Scores You'll See Here — Don't Conflate Them</div>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-white">CVSS (score + vector)</strong> — a formula-based severity rating, 0-10, built from exploitability metrics (attack vector, complexity, privileges required) and impact metrics (confidentiality/integrity/availability). It answers "how bad is this if exploited," not "how likely is someone to exploit it."</li>
                <li><strong className="text-white">CWE</strong> — Common Weakness Enumeration. This is the underlying <em>bug class</em> (e.g. CWE-79 is Cross-Site Scripting, CWE-89 is SQL Injection). Ten unrelated CVEs can all map to the same CWE — this is how you build pattern recognition across vulnerabilities instead of memorizing each CVE individually.</li>
                <li><strong className="text-white">EPSS</strong> — Exploit Prediction Scoring System. A machine-learning model estimating the probability (0-100%) that this specific CVE will be exploited in the wild in the next 30 days, based on real observed exploitation activity, chatter, and available exploit code. This is the number that should drive patch prioritization more than CVSS alone — a CVSS 9.8 with 0.1% EPSS is a very different priority than a CVSS 7.0 with 80% EPSS.</li>
              </ul>
              <div className="text-purple-400 font-mono font-bold text-sm pt-1">How Professionals Actually Use This Data</div>
              <p>
                Real vulnerability management doesn't patch in raw CVSS order — it can't, there are too many. The
                standard triage logic: cross-reference against <strong>CISA's KEV catalog</strong> first (confirmed
                active exploitation — patch these regardless of CVSS), then sort remaining findings by EPSS, then by
                CVSS, then by whether the affected asset is internet-facing or holds sensitive data. A CVE search here
                is step one of that process, not the whole process.
              </p>
              <div className="text-purple-400 font-mono font-bold text-sm pt-1">Limitations — What This Data Can't Tell You</div>
              <ul className="list-disc pl-5 space-y-1">
                <li>CVSS is context-free — it doesn't know your network topology, your compensating controls, or whether the vulnerable service is even reachable from outside. A 9.8 on an air-gapped internal box is a different real-world risk than the same score on an internet-facing login page.</li>
                <li>A CVE existing doesn't mean a target is vulnerable — you still have to confirm the affected version and configuration match, and that no backport patch was silently applied (common with Linux distro package maintainers who patch without bumping the visible version string).</li>
                <li>EPSS is a probability model, not a guarantee — a low EPSS score doesn't mean "safe to ignore," it means "not currently trending in mass exploitation." Targeted attacks don't follow EPSS distributions.</li>
                <li>The "Exploit-DB" and "PacketStorm" links below take you to search results, not confirmed working exploits — always verify a PoC actually applies to your target's exact version before treating a CVE as practically exploitable.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Import Success Message */}
        {importMessage && (
          <div className="mb-6 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
            <span className="text-emerald-400 text-sm">{importMessage}</span>
            <button onClick={() => setImportMessage(null)} className="text-white/40 hover:text-white/60 transition-colors">✕</button>
          </div>
        )}

        {/* ── Search ── */}
        <div className="mb-6">
          <div className="flex gap-3">
            <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 transition-colors focus-within:border-purple-500/50">
              <Search size={14} className="text-white/40 flex-shrink-0" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Enter CVE ID — e.g. CVE-2021-44228"
                className="flex-1 bg-transparent text-white/80 text-sm font-mono focus:outline-none placeholder-white/20"
              />
              {query && <CopyBtn text={query} />}
            </div>
            <button
              onClick={() => search()}
              disabled={loading}
              className="px-5 py-2.5 bg-purple-500/20 text-purple-400 text-sm font-mono rounded-xl hover:bg-purple-500/30 border border-purple-500/30 disabled:opacity-40 transition-all"
            >
              {loading ? '...' : 'Lookup'}
            </button>
          </div>

          {/* Quick CVEs and History */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-white/40 text-xs">Quick:</span>
            {RECENT_CVES.map(id => (
              <button key={id} onClick={() => { setQuery(id); search(id) }}
                className="text-xs text-purple-400 hover:text-purple-300 font-mono transition-colors">
                {id}
              </button>
            ))}
            {searchHistory.length > 0 && (
              <>
                <span className="text-white/30 text-xs">•</span>
                <span className="text-white/40 text-xs">Recent:</span>
                {searchHistory.slice(0, 5).map(id => (
                  <button key={id} onClick={() => { setQuery(id); search(id) }}
                    className="text-xs text-white/40 hover:text-purple-400 font-mono transition-colors">
                    {id}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Beginner Tips */}
        {showBeginnerTips && (
          <div className="mb-6 p-4 rounded-2xl border border-amber-500/10 bg-amber-500/5">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-amber-400" />
              <span className="text-amber-400 text-xs font-semibold tracking-wider">CVE Analysis Tips</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-white/60">
              {[
                'Start with Critical/High severity CVEs in your environment',
                'Check EPSS score for exploit probability (0.0-1.0)',
                'Use "AI Analyze" for exploitation details and tools',
                'Searchsploit finds public exploits for CVEs'
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
        {savedCVEs.length > 0 && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
            <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
              <div className="text-white/40">Total</div>
              <div className="text-white font-bold text-lg">{searchStats.total}</div>
            </div>
            <div className="bg-white/5 border border-red-400/20 rounded-xl p-3 text-center">
              <div className="text-red-400/60">Critical</div>
              <div className="text-red-400 font-bold text-lg">{searchStats.critical}</div>
            </div>
            <div className="bg-white/5 border border-amber-400/20 rounded-xl p-3 text-center">
              <div className="text-amber-400/60">High</div>
              <div className="text-amber-400 font-bold text-lg">{searchStats.high}</div>
            </div>
            <div className="bg-white/5 border border-cyan-400/20 rounded-xl p-3 text-center">
              <div className="text-cyan-400/60">Medium</div>
              <div className="text-cyan-400 font-bold text-lg">{searchStats.medium}</div>
            </div>
            <div className="bg-white/5 border border-emerald-400/20 rounded-xl p-3 text-center">
              <div className="text-emerald-400/60">Low</div>
              <div className="text-emerald-400 font-bold text-lg">{searchStats.low}</div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 rounded-xl border border-red-500/20 bg-red-500/5 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
            <span className="text-red-400 text-sm font-mono">{error}</span>
            <button onClick={() => setError('')} className="ml-auto text-white/30 hover:text-white/60 transition-colors">✕</button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3">
            {[0,150,300].map(d => (
              <div key={d} className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: d + 'ms' }} />
            ))}
            <span className="text-white/40 text-sm font-mono animate-pulse">Querying NVD database...</span>
          </div>
        )}

        {/* ── CVE Result ── */}
        {cve && activeTab !== 'history' && (
          <div className="space-y-4">

            {/* Title card */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <span className="text-white font-mono font-bold text-lg">{cve.id}</span>
                    <span className={"text-xs px-2 py-0.5 rounded-full border font-mono font-bold " + SEVERITY_COLOR[cve.severity]}>
                      {cve.severity}
                    </span>
                    {cve.cweId && (
                      <a 
                        href={`https://cwe.mitre.org/data/definitions/${cve.cweId.replace('CWE-', '')}.html`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-0.5 bg-white/5 border border-white/10 rounded-full font-mono text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        {cve.cweId}
                      </a>
                    )}
                    <CopyBtn text={cve.id} />
                    <button
                      onClick={() => {
                        if (isCveSaved) {
                          deleteSavedCVE(cve.id)
                        } else {
                          saveCVE()
                        }
                      }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-white/10 hover:border-yellow-400/30 transition-colors"
                      aria-label={isCveSaved ? 'Remove from saved' : 'Save CVE'}
                    >
                      <Star size={12} className={isCveSaved ? 'text-yellow-400' : 'text-white/30'} />
                      {isCveSaved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-white/40 text-xs font-mono">
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      Published: {cve.published}
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      Modified: {cve.modified}
                    </div>
                    {cve.epssScore && cve.epssScore > 0 && (
                      <div className="flex items-center gap-1">
                        <Target size={12} className="text-amber-400" />
                        EPSS: {(cve.epssScore * 100).toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>

                {/* CVSS Score */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={"text-3xl font-mono font-bold " + SEVERITY_COLOR[cve.severity].split(' ')[0]}>
                    {cve.cvssScore.toFixed(1)}
                  </div>
                  <div className="text-white/40 text-xs">CVSS Score</div>
                  <div className="w-16 h-1.5 bg-white/10 rounded-full mt-1 overflow-hidden">
                    <div className={"h-full rounded-full " + SEVERITY_BAR[cve.severity]} style={{ width: (cve.cvssScore / 10 * 100) + '%' }} />
                  </div>
                  {/* CVSS Interpretation */}
                  <div className="mt-2 text-center">
                    <div className="text-white/40 text-[10px]">
                      {CVSS_INTERPRETATION[cve.severity]?.urgency || 'N/A'}
                    </div>
                    <div className="text-white/50 text-[10px]">
                      {CVSS_INTERPRETATION[cve.severity]?.action || ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* CVSS Vector */}
              <div className="flex items-center gap-2 mb-3 p-2 bg-black/30 border border-white/5 rounded-xl">
                <span className="text-white/40 text-xs">Vector:</span>
                <code className="text-purple-400 text-xs font-mono flex-1">{cve.cvssVector}</code>
                <CopyBtn text={cve.cvssVector} />
              </div>

              {/* Impact Scores */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="p-2 bg-black/30 border border-white/5 rounded-xl text-center">
                  <div className="text-white/40 text-xs">Confidentiality</div>
                  <div className={"font-mono text-sm " + IMPACT_COLOR[cve.impact.confidentiality]}>
                    {cve.impact.confidentiality}
                  </div>
                </div>
                <div className="p-2 bg-black/30 border border-white/5 rounded-xl text-center">
                  <div className="text-white/40 text-xs">Integrity</div>
                  <div className={"font-mono text-sm " + IMPACT_COLOR[cve.impact.integrity]}>
                    {cve.impact.integrity}
                  </div>
                </div>
                <div className="p-2 bg-black/30 border border-white/5 rounded-xl text-center">
                  <div className="text-white/40 text-xs">Availability</div>
                  <div className={"font-mono text-sm " + IMPACT_COLOR[cve.impact.availability]}>
                    {cve.impact.availability}
                  </div>
                </div>
              </div>

              {/* Notes section - always visible */}
              <div className="mb-3 p-3 bg-black/30 border border-purple-500/20 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-purple-400 text-xs font-mono font-bold flex items-center gap-1">
                    <FileText size={12} />
                    Notes
                  </div>
                  {!isCveSaved && (
                    <span className="text-[10px] text-white/30">Save the CVE to persist notes</span>
                  )}
                  {isCveSaved && (
                    <button 
                      onClick={() => setEditingNote(!editingNote)}
                      className="text-xs text-white/40 hover:text-purple-400 transition-colors"
                    >
                      {editingNote ? 'Cancel' : 'Edit'}
                    </button>
                  )}
                </div>
                {editingNote && isCveSaved ? (
                  <div>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Add notes about this CVE..."
                      rows={3}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 font-mono focus:outline-none focus:border-purple-500/30"
                    />
                    <button
                      onClick={saveCVE}
                      className="mt-2 px-3 py-1.5 bg-purple-500/20 text-purple-400 text-xs font-mono rounded-xl hover:bg-purple-500/30 border border-purple-500/30 transition-colors"
                    >
                      Save Notes
                    </button>
                  </div>
                ) : (
                  <div className="text-white/40 text-sm">
                    {notes || (isCveSaved ? 'No notes added yet.' : 'Save this CVE to add notes.')}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="flex flex-wrap gap-1 mb-3">
                {(['overview', 'analysis', 'exploit'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1.5 text-xs font-mono rounded-xl transition-colors ${
                      activeTab === tab
                        ? 'bg-purple-500/10 border border-purple-500/30 text-purple-400'
                        : 'text-white/40 hover:text-white/80 border border-white/5 hover:border-white/20'
                    }`}>
                    {tab === 'overview' ? '📋 Overview' : tab === 'analysis' ? '🧠 AI Analysis' : '💥 Exploit'}
                  </button>
                ))}
                <button onClick={analyze} disabled={analyzing}
                  className="ml-auto px-3 py-1.5 text-xs font-mono rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 hover:bg-purple-500/30 disabled:opacity-40 transition-colors flex items-center gap-1.5">
                  <Cpu size={11} />
                  {analyzing ? 'Analyzing...' : 'AI Analyze'}
                </button>
              </div>

              {/* Tab content */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-white/40 text-xs font-mono mb-1 flex items-center gap-1">
                      <Info size={10} />
                      Description
                    </div>
                    <p className="text-white/70 text-sm leading-relaxed">{cve.description}</p>
                  </div>
                  
                  {cve.affectedProducts.length > 0 && (
                    <div>
                      <div className="text-white/40 text-xs font-mono mb-1">Affected Products</div>
                      <div className="flex flex-wrap gap-1">
                        {cve.affectedProducts.map((p, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-white/5 border border-white/5 rounded-full font-mono text-white/60">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {cve.references.length > 0 && (
                    <div>
                      <div className="text-white/40 text-xs font-mono mb-1 flex items-center gap-1">
                        <Link size={10} />
                        References
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {cve.references.map((r, i) => (
                          <a key={i} href={r} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors truncate">
                            <ExternalLink size={10} className="flex-shrink-0" />
                            {r}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Additional CVE Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-black/30 border border-white/5 rounded-xl">
                      <div className="text-white/40 text-xs font-mono mb-1">Exploitability Score</div>
                      <div className="text-white/70 text-sm font-mono">{cve.exploitability || 'N/A'}</div>
                    </div>
                    <div className="p-3 bg-black/30 border border-white/5 rounded-xl">
                      <div className="text-white/40 text-xs font-mono mb-1">EPSS Probability</div>
                      <div className="text-white/70 text-sm font-mono">
                        {cve.epssScore ? `${(cve.epssScore * 100).toFixed(2)}%` : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'analysis' && (
                <div>
                  {analyzing && (
                    <div className="flex items-center gap-3 py-4">
                      {[0,150,300].map(d => (
                        <div key={d} className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: d + 'ms' }} />
                      ))}
                      <span className="text-white/40 text-sm font-mono animate-pulse">AI analyzing {cve.id}...</span>
                    </div>
                  )}
                  {!analyzing && !analysis && (
                    <div className="flex items-center gap-2 py-4 text-white/30">
                      <Info size={14} />
                      <span className="text-sm font-mono">Click "AI Analyze" to generate deep analysis</span>
                    </div>
                  )}
                  {analysis && (
                    <div className="space-y-4">
                      {[
                        { label: 'Root Cause',        key: 'rootCause',       color: 'text-red-400', icon: <Zap size={12} /> },
                        { label: 'Technical Detail',  key: 'technicalDetail', color: 'text-amber-400', icon: <Info size={12} /> },
                        { label: 'Detection',         key: 'detection',       color: 'text-purple-400', icon: <Search size={12} /> },
                        { label: 'Mitigation',        key: 'mitigation',      color: 'text-emerald-400', icon: <Shield size={12} /> },
                        { label: 'Remediation',       key: 'remediation',     color: 'text-purple-300', icon: <Target size={12} /> },
                        { label: 'Patch Timeline',    key: 'timeline',        color: 'text-purple-400', icon: <Calendar size={12} /> },
                      ].map(({ label, key, color, icon }) => (
                        <div key={key} className="p-3 bg-black/30 border border-white/5 rounded-xl">
                          <div className={"text-xs font-mono font-bold mb-1 flex items-center gap-1 " + color}>
                            {icon}
                            {label}
                          </div>
                          {/* ✅ Use AIResponseText for markdown rendering */}
                          <AIResponseText 
                            text={(analysis as Record<string, string>)[key]} 
                            className="text-white/70 text-sm leading-relaxed" 
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'exploit' && (
                <div>
                  {analyzing && (
                    <div className="flex items-center gap-2 py-4">
                      <Cpu size={14} className="text-purple-500 animate-pulse" />
                      <span className="text-white/40 text-sm font-mono animate-pulse">Generating exploit details...</span>
                    </div>
                  )}
                  {!analyzing && !analysis && (
                    <div className="flex items-center gap-2 py-4 text-white/30">
                      <Info size={14} />
                      <span className="text-sm font-mono">Click "AI Analyze" first to generate exploit info</span>
                    </div>
                  )}
                  {analysis && (
                    <div className="space-y-4">
                      <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                        <div className="text-red-400 text-xs font-mono font-bold mb-1 flex items-center gap-1">
                          <Zap size={12} />
                          Exploitation
                        </div>
                        <AIResponseText text={analysis.exploitation} className="text-white/70 text-sm leading-relaxed" />
                      </div>
                      <div className="p-3 bg-black/30 border border-white/5 rounded-xl">
                        <div className="text-purple-400 text-xs font-mono font-bold mb-2">🔧 Tools & Frameworks</div>
                        <div className="flex flex-wrap gap-2">
                          {analysis.tools.split(',').map((t, i) => (
                            <span key={i} className="text-xs px-2 py-1 bg-white/5 border border-purple-500/20 rounded-full font-mono text-purple-400">
                              {t.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                        <div className="text-amber-400 text-xs font-mono font-bold mb-1 flex items-center gap-1">
                          <Search size={12} />
                          Searchsploit Command
                        </div>
                        <div className="flex items-center gap-2 bg-black/30 border border-white/5 rounded-xl px-3 py-1.5">
                          <code className="text-emerald-400 text-xs font-mono flex-1">searchsploit {cve.id}</code>
                          <CopyBtn text={`searchsploit ${cve.id}`} />
                        </div>
                      </div>
                      <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                        <div className="text-purple-400 text-xs font-mono font-bold mb-1">📊 Exploit Resources</div>
                        <div className="grid grid-cols-2 gap-2">
                          <a 
                            href={`https://www.exploit-db.com/search?cve=${cve.id}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs px-2 py-1.5 bg-white/5 border border-purple-500/20 rounded-xl text-purple-400 hover:bg-white/10 transition-colors text-center"
                          >
                            Exploit-DB
                          </a>
                          <a 
                            href={`https://packetstormsecurity.com/search/?q=${cve.id}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-xs px-2 py-1.5 bg-white/5 border border-purple-500/20 rounded-xl text-purple-400 hover:bg-white/10 transition-colors text-center"
                          >
                            PacketStorm
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* CVE Lab Exercises */}
            {showBeginnerTips && (
              <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-3">
                <div className="text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5">
                  <Wrench size={12} /> Lab Exercises — Do These, Don't Just Read Them
                </div>

                <div className="text-xs">
                  <div className="text-purple-400 font-bold mb-1">Level 1 — Score literacy (no lookup needed)</div>
                  <p className="text-white/40">
                    Before searching anything: write down, from memory, what CVSS, CWE, and EPSS each measure and
                    how they differ. Then look up CVE-2021-44228 (Log4Shell) here and check yourself — note its
                    CVSS score, its CWE, and reason about why its real-world EPSS was so high relative to many
                    other 10.0 CVEs. If you can't explain that gap, re-read the EPSS section above.
                  </p>
                </div>

                <div className="text-xs">
                  <div className="text-purple-400 font-bold mb-1">Level 2 — CWE pattern recognition</div>
                  <p className="text-white/40">
                    Pick 5 CVEs from the Quick list above. For each, note only the CWE — not the CVE number. Then,
                    without looking anything up, group them by underlying bug class and explain in one sentence
                    each what the actual root-cause pattern is (e.g. "unsafe deserialization", "missing bounds
                    check", "improper input validation leading to injection"). This is the skill that transfers —
                    memorizing "CVE-2021-44228 = Log4Shell" doesn't help you spot the next unnamed deserialization
                    bug; understanding the CWE-502 pattern does.
                  </p>
                </div>

                <div className="text-xs">
                  <div className="text-purple-400 font-bold mb-1">Level 3 — Triage exercise</div>
                  <p className="text-white/40">
                    You're handed 4 findings from a scan: CVSS 9.8/EPSS 0.2%, CVSS 7.5/EPSS 76%, CVSS 6.1/EPSS 4%
                    on an internet-facing login page, CVSS 9.1/EPSS 1% on an internal-only box with no direct
                    network path from the internet. Rank them for patch priority and justify each ranking using
                    the triage logic above (KEV catalog check → EPSS → CVSS → exposure). There's a specific right
                    answer here based on real-world risk, not just sorting by CVSS — if your ranking is just
                    highest-CVSS-first, that's the exact mistake this exercise is designed to catch.
                  </p>
                </div>

                <div className="text-xs">
                  <div className="text-purple-400 font-bold mb-1">Level 4 — Verify before you trust</div>
                  <p className="text-white/40">
                    Pick any CVE from the Quick list, click through to Exploit-DB or PacketStorm, and read one
                    actual PoC write-up (not just the search results page). Identify: what exact version/config
                    does the PoC assume, and what would have to be true about a target for that PoC to actually
                    work. This is the habit — "a CVE was found on this port" and "this PoC works against this
                    target" are two different claims, and conflating them is a common beginner mistake that leads
                    to false findings in a real report.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-white/40 text-xs font-mono">
                {savedCVEs.length} saved CVEs
              </div>
              <div className="flex gap-2 flex-wrap">
                <select
                  value={filterSeverity}
                  onChange={e => setFilterSeverity(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-purple-500/30"
                >
                  <option value="All" style={{ background: '#0d1022' }}>All Severities</option>
                  <option value="CRITICAL" style={{ background: '#0d1022' }}>Critical</option>
                  <option value="HIGH" style={{ background: '#0d1022' }}>High</option>
                  <option value="MEDIUM" style={{ background: '#0d1022' }}>Medium</option>
                  <option value="LOW" style={{ background: '#0d1022' }}>Low</option>
                </select>
                
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white/60 focus:outline-none focus:border-purple-500/30"
                >
                  <option value="date" style={{ background: '#0d1022' }}>Sort by Date</option>
                  <option value="severity" style={{ background: '#0d1022' }}>Sort by Severity</option>
                  <option value="score" style={{ background: '#0d1022' }}>Sort by Score</option>
                </select>
                
                <button 
                  onClick={exportCVEs} 
                  disabled={savedCVEs.length === 0}
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
                  onChange={importCVEs}
                  className="hidden"
                />
                <button 
                  onClick={clearAllCVEs} 
                  disabled={savedCVEs.length === 0}
                  className="flex items-center gap-1 text-xs text-red-400/50 hover:text-red-400 transition-colors px-3 py-2 border border-red-500/20 rounded-xl disabled:opacity-40"
                >
                  <Trash2 size={12} /> Clear All
                </button>
              </div>
            </div>

            {filteredSavedCVEs.length === 0 ? (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-12 text-center">
                <Shield size={32} className="text-white/20 mx-auto mb-3" />
                <div className="text-white/40 text-sm font-mono">No saved CVEs</div>
                <div className="text-white/20 text-xs mt-1">Search for a CVE and click the star icon to save it</div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSavedCVEs.map(c => {
                  return (
                    <div key={c.id} className="bg-white/5 border border-white/5 rounded-xl p-4 hover:border-purple-500/20 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => { setQuery(c.cveId); search(c.cveId); setActiveTab('overview') }}
                              className="text-purple-400 hover:text-purple-300 font-mono text-sm font-bold transition-colors"
                            >
                              {c.cveId}
                            </button>
                            <span className={"text-xs px-2 py-0.5 rounded-full border font-mono " + SEVERITY_COLOR[c.severity]}>
                              {c.severity}
                            </span>
                            <span className="text-white/40 text-xs font-mono">
                              CVSS: {c.cvssScore.toFixed(1)}
                            </span>
                            <span className="text-white/30 text-xs">
                              {new Date(c.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {c.notes && (
                            <div className="text-white/40 text-xs mt-1">{c.notes}</div>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => { setQuery(c.cveId); search(c.cveId); setActiveTab('overview') }}
                            className="p-1.5 rounded-lg text-white/30 hover:text-purple-400 transition-colors"
                            title="Load CVE"
                            aria-label="Load CVE"
                          >
                            <Play size={14} />
                          </button>
                          <button
                            onClick={() => deleteSavedCVE(c.cveId)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-red-400 transition-colors"
                            title="Delete"
                            aria-label="Delete"
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

        {/* ── Empty state ── */}
        {!cve && !loading && !error && activeTab !== 'history' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Landmark size={40} className="text-purple-400 opacity-30" />
            <div className="text-white/40 text-sm font-mono">Enter a CVE ID to look up vulnerability details</div>
            <div className="text-white/20 text-xs">Data sourced from NIST NVD · AI analysis via Ollama</div>
            
            {/* Quick Tips */}
            {showBeginnerTips && (
              <div className="mt-4 p-4 bg-white/5 border border-white/5 rounded-2xl max-w-md">
                <div className="text-white/40 text-xs font-mono mb-2">💡 Quick Tips</div>
                <ul className="space-y-1 text-xs text-white/40">
                  <li>• Try: CVE-2021-44228 (Log4Shell)</li>
                  <li>• Check severity before researching</li>
                  <li>• Use EPSS score for exploit probability</li>
                  <li>• AI Analysis provides exploitation details</li>
                </ul>
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