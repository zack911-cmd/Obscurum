// src/components/scope/ScopeValidator.tsx
// Aegis — engagement scope validator (prevent out-of-scope mistakes)
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  Shield, Plus, Trash2, CheckCircle2, XCircle, AlertTriangle,
  Copy, Download, Upload, Save, Target, Ban, ListFilter, Eraser,
  Search, ShieldCheck, ShieldAlert, Info
} from 'lucide-react'

const STORAGE_KEY = 'aegis_scopes_v1'

type ScopeProfile = {
  id: string
  name: string
  notes: string
  allow: string[]
  deny: string[]
  updatedAt: number
}

type Verdict = 'in' | 'out' | 'deny' | 'invalid' | 'partial'

type CheckRow = {
  raw: string
  normalized: string
  verdict: Verdict
  reason: string
  matchedRule?: string
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function emptyProfile(): ScopeProfile {
  return {
    id: uid(),
    name: 'New engagement',
    notes: '',
    allow: [],
    deny: [],
    updatedAt: Date.now(),
  }
}

function loadProfiles(): ScopeProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const demo = emptyProfile()
      demo.name = 'Example lab scope'
      demo.notes = 'Replace with your RoE ranges. Example only.'
      demo.allow = ['10.10.10.0/24', '10.10.14.0/24']
      demo.deny = ['10.10.10.1']
      return [demo]
    }
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return [emptyProfile()]
    return parsed
  } catch {
    return [emptyProfile()]
  }
}

function ipv4ToInt(ip: string): number | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some(n => n > 255)) return null
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
}

function intToIpv4(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

type IpRange = { start: number; end: number; label: string }

function parseRule(rule: string): IpRange | null {
  const r = rule.trim()
  if (!r || r.startsWith('#')) return null

  if (r.includes('/')) {
    const [ip, bitsStr] = r.split('/')
    const base = ipv4ToInt(ip)
    const bits = Number(bitsStr)
    if (base === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
    const start = (base & mask) >>> 0
    const end = (start | (~mask >>> 0)) >>> 0
    return { start, end, label: r }
  }

  if (r.includes('-')) {
    const [a, b] = r.split('-').map(s => s.trim())
    const start = ipv4ToInt(a)
    const end = ipv4ToInt(b)
    if (start === null || end === null || start > end) return null
    return { start, end, label: r }
  }

  const one = ipv4ToInt(r)
  if (one === null) return null
  return { start: one, end: one, label: r }
}

function parseRules(lines: string[]): IpRange[] {
  const out: IpRange[] = []
  for (const line of lines) {
    for (const part of line.split(/[,;\s]+/)) {
      const pr = parseRule(part)
      if (pr) out.push(pr)
    }
  }
  return out
}

function inRanges(ipInt: number, ranges: IpRange[]): IpRange | null {
  for (const r of ranges) {
    if (ipInt >= r.start && ipInt <= r.end) return r
  }
  return null
}

function parseTargetToken(token: string): { kind: 'ip'; ip: number; raw: string } | { kind: 'range'; start: number; end: number; raw: string } | { kind: 'invalid'; raw: string } {
  const t = token.trim()
  if (!t) return { kind: 'invalid', raw: token }

  if (t.includes('/')) {
    const pr = parseRule(t)
    if (!pr) return { kind: 'invalid', raw: t }
    return { kind: 'range', start: pr.start, end: pr.end, raw: t }
  }
  if (t.includes('-') && /^\d/.test(t)) {
    const pr = parseRule(t)
    if (!pr) return { kind: 'invalid', raw: t }
    return { kind: 'range', start: pr.start, end: pr.end, raw: t }
  }
  const ip = ipv4ToInt(t)
  if (ip === null) return { kind: 'invalid', raw: t }
  return { kind: 'ip', ip, raw: t }
}

function checkTarget(raw: string, allow: IpRange[], deny: IpRange[]): CheckRow {
  const token = parseTargetToken(raw)
  if (token.kind === 'invalid') {
    return {
      raw,
      normalized: raw.trim(),
      verdict: 'invalid',
      reason: 'Not a valid IPv4, CIDR, or A–B range (hostnames are not looked up)',
    }
  }

  if (token.kind === 'ip') {
    const d = inRanges(token.ip, deny)
    if (d) {
      return {
        raw,
        normalized: intToIpv4(token.ip),
        verdict: 'deny',
        reason: 'On the deny list — do not touch',
        matchedRule: d.label,
      }
    }
    if (allow.length === 0) {
      return {
        raw,
        normalized: intToIpv4(token.ip),
        verdict: 'out',
        reason: 'No allow rules defined — nothing is in scope yet',
      }
    }
    const a = inRanges(token.ip, allow)
    if (a) {
      return {
        raw,
        normalized: intToIpv4(token.ip),
        verdict: 'in',
        reason: 'Inside an allow rule — OK for this engagement',
        matchedRule: a.label,
      }
    }
    return {
      raw,
      normalized: intToIpv4(token.ip),
      verdict: 'out',
      reason: 'Not in any allow rule — out of scope',
    }
  }

  const size = token.end - token.start + 1
  const samples = new Set<number>()
  samples.add(token.start)
  samples.add(token.end)
  if (size <= 256) {
    for (let i = token.start; i <= token.end; i++) samples.add(i)
  } else {
    samples.add(token.start + Math.floor(size / 2))
    if (token.start + 1 <= token.end) samples.add(token.start + 1)
    if (token.end - 1 >= token.start) samples.add(token.end - 1)
  }

  let anyDeny: IpRange | null = null
  let anyOut = false
  let anyIn = false
  let matchedAllow: string | undefined

  if (allow.length === 0) {
    return {
      raw,
      normalized: token.raw,
      verdict: 'out',
      reason: 'No allow rules defined — nothing is in scope yet',
    }
  }

  for (const ip of samples) {
    const d = inRanges(ip, deny)
    if (d) {
      anyDeny = d
      break
    }
    const a = inRanges(ip, allow)
    if (a) {
      anyIn = true
      matchedAllow = a.label
    } else {
      anyOut = true
    }
  }

  if (anyDeny) {
    return {
      raw,
      normalized: token.raw,
      verdict: 'deny',
      reason: size > 256
        ? 'Range hits a deny rule (large range sampled — verify edges)'
        : 'Range includes a denied address',
      matchedRule: anyDeny.label,
    }
  }

  if (anyIn && !anyOut) {
    return {
      raw,
      normalized: token.raw,
      verdict: 'in',
      reason: size > 256
        ? 'Sampled addresses are in-scope (large range — verify edges)'
        : 'Entire range is in-scope',
      matchedRule: matchedAllow,
    }
  }

  if (anyIn && anyOut) {
    return {
      raw,
      normalized: token.raw,
      verdict: 'partial',
      reason: 'Mixed in-scope and out-of-scope — split the range before scanning',
      matchedRule: matchedAllow,
    }
  }

  return {
    raw,
    normalized: token.raw,
    verdict: 'out',
    reason: 'Range is outside allow rules',
  }
}

function splitTargets(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !s.startsWith('#'))
}

const VERDICT_META: Record<Verdict, { label: string; color: string; bg: string; border: string }> = {
  in: { label: 'IN SCOPE', color: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.4)' },
  out: { label: 'OUT OF SCOPE', color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.4)' },
  deny: { label: 'DENIED', color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.45)' },
  partial: { label: 'PARTIAL', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.4)' },
  invalid: { label: 'INVALID', color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.3)' },
}

export default function ScopeValidator() {
  const [profiles, setProfiles] = useState<ScopeProfile[]>(() => loadProfiles())
  const [activeId, setActiveId] = useState(() => loadProfiles()[0]?.id || '')
  const [targetText, setTargetText] = useState('')
  const [quickIp, setQuickIp] = useState('')
  const [allowText, setAllowText] = useState('')
  const [denyText, setDenyText] = useState('')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [copied, setCopied] = useState<'in' | 'out' | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [filter, setFilter] = useState<'all' | Verdict>('all')
  const fileRef = useRef<HTMLInputElement>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const targetRef = useRef<HTMLTextAreaElement>(null)

  const active = profiles.find(p => p.id === activeId) || profiles[0]

  useEffect(() => {
    if (!active) return
    setName(active.name)
    setNotes(active.notes)
    setAllowText(active.allow.join('\n'))
    setDenyText(active.deny.join('\n'))
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
    } catch { /* quota */ }
  }, [profiles])

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current)
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  const persistActive = useCallback((patch: Partial<ScopeProfile>) => {
    setProfiles(prev => prev.map(p =>
      p.id === activeId ? { ...p, ...patch, updatedAt: Date.now() } : p,
    ))
  }, [activeId])

  const saveEditor = useCallback(() => {
    const allow = allowText.split('\n').map(s => s.trim()).filter(Boolean)
    const deny = denyText.split('\n').map(s => s.trim()).filter(Boolean)
    persistActive({ name: name.trim() || 'Untitled scope', notes, allow, deny })
    setSavedFlash(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => setSavedFlash(false), 1400)
  }, [allowText, denyText, name, notes, persistActive])

  // Auto-save scope text shortly after edits
  useEffect(() => {
    if (!activeId) return
    const t = setTimeout(() => {
      const allow = allowText.split('\n').map(s => s.trim()).filter(Boolean)
      const deny = denyText.split('\n').map(s => s.trim()).filter(Boolean)
      setProfiles(prev => prev.map(p =>
        p.id === activeId
          ? { ...p, name: name.trim() || p.name, notes, allow, deny, updatedAt: Date.now() }
          : p,
      ))
    }, 600)
    return () => clearTimeout(t)
  }, [allowText, denyText, name, notes, activeId])

  const allowRanges = useMemo(() => parseRules(allowText.split('\n')), [allowText])
  const denyRanges = useMemo(() => parseRules(denyText.split('\n')), [denyText])

  const results = useMemo(() => {
    const tokens = splitTargets(targetText)
    return tokens.map(t => checkTarget(t, allowRanges, denyRanges))
  }, [targetText, allowRanges, denyRanges])

  const quickResult = useMemo(() => {
    const t = quickIp.trim()
    if (!t) return null
    return checkTarget(t, allowRanges, denyRanges)
  }, [quickIp, allowRanges, denyRanges])

  const filtered = useMemo(() => {
    if (filter === 'all') return results
    return results.filter(r => r.verdict === filter)
  }, [results, filter])

  const stats = useMemo(() => {
    const s = { in: 0, out: 0, deny: 0, partial: 0, invalid: 0, total: results.length }
    for (const r of results) s[r.verdict]++
    return s
  }, [results])

  const allClear = stats.total > 0 && stats.out === 0 && stats.deny === 0 && stats.partial === 0 && stats.invalid === 0
  const hasProblems = stats.total > 0 && !allClear

  const addProfile = () => {
    const p = emptyProfile()
    p.name = `Engagement ${profiles.length + 1}`
    setProfiles(prev => [...prev, p])
    setActiveId(p.id)
  }

  const deleteProfile = () => {
    if (profiles.length <= 1) return
    const next = profiles.filter(p => p.id !== activeId)
    setProfiles(next)
    setActiveId(next[0].id)
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(profiles, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aegis-scopes-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (!Array.isArray(data)) return
        const cleaned: ScopeProfile[] = data.map((d: Partial<ScopeProfile>) => ({
          id: d.id || uid(),
          name: String(d.name || 'Imported'),
          notes: String(d.notes || ''),
          allow: Array.isArray(d.allow) ? d.allow.map(String) : [],
          deny: Array.isArray(d.deny) ? d.deny.map(String) : [],
          updatedAt: Number(d.updatedAt) || Date.now(),
        }))
        if (cleaned.length) {
          setProfiles(cleaned)
          setActiveId(cleaned[0].id)
        }
      } catch { /* ignore */ }
    }
    reader.readAsText(file)
  }

  const copyList = async (kind: 'in' | 'out') => {
    const lines = results
      .filter(r => (kind === 'in' ? r.verdict === 'in' : r.verdict === 'out' || r.verdict === 'deny' || r.verdict === 'partial'))
      .map(r => r.normalized)
    const text = lines.join('\n')
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        const el = document.createElement('textarea')
        el.value = text
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      setCopied(kind)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), 1600)
    } catch { /* ignore */ }
  }

  const addQuickToList = () => {
    const t = quickIp.trim()
    if (!t) return
    setTargetText(prev => (prev.trim() ? prev.trim() + '\n' + t : t))
    setQuickIp('')
    targetRef.current?.focus()
  }

  const ruleErrors = useMemo(() => {
    const errs: string[] = []
    allowText.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
      if (!parseRule(line) && !line.startsWith('#')) errs.push(`Allow: cannot parse “${line}”`)
    })
    denyText.split('\n').map(s => s.trim()).filter(Boolean).forEach(line => {
      if (!parseRule(line) && !line.startsWith('#')) errs.push(`Deny: cannot parse “${line}”`)
    })
    return errs
  }, [allowText, denyText])

  const allowCount = allowText.split('\n').map(s => s.trim()).filter(Boolean).length
  const denyCount = denyText.split('\n').map(s => s.trim()).filter(Boolean).length

  return (
    <div
      className="min-h-full overflow-y-auto"
      style={{ background: 'linear-gradient(160deg, #070b12 0%, #0a1018 45%, #070b12 100%)' }}
    >
      <div className="max-w-7xl mx-auto p-5 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                background: 'radial-gradient(circle, rgba(45,212,167,0.22), rgba(45,212,167,0.04))',
                border: '1px solid rgba(45,212,167,0.28)',
              }}
            >
              <Shield size={22} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-white font-black text-xl tracking-[0.14em] uppercase">Aegis</h1>
              <p className="text-white/40 text-xs mt-0.5">
                Is this IP in scope? Check before you scan.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportJson}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-white/55 hover:text-white hover:border-white/20 transition-colors"
            >
              <Download size={14} /> Export
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/10 text-white/55 hover:text-white hover:border-white/20 transition-colors"
            >
              <Upload size={14} /> Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) importJson(f)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {/* How it works — compact */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 flex gap-3">
          <Info className="text-emerald-400/80 flex-shrink-0 mt-0.5" size={18} />
          <div className="text-sm text-white/50 space-y-1 leading-relaxed">
            <p>
              <strong className="text-white/75">1.</strong> Put the engagement’s allowed ranges in <span className="text-emerald-400/90">Allow</span>
              {' '}(and critical exclusions in <span className="text-orange-400/90">Deny</span>).
            </p>
            <p>
              <strong className="text-white/75">2.</strong> Paste the IPs or ranges you plan to scan.
            </p>
            <p>
              <strong className="text-white/75">3.</strong> Green = in scope. Red = out of scope. Orange = explicitly denied. Fix the list before running Scout or anything else.
            </p>
          </div>
        </div>

        {/* Quick single-IP check */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/80 mb-2 flex items-center gap-1.5">
            <Search size={12} /> Quick check — one IP or range
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={quickIp}
              onChange={e => setQuickIp(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addQuickToList()
              }}
              placeholder="e.g. 10.10.10.5 or 10.10.14.0/24"
              className="flex-1 rounded-xl bg-black/50 border border-white/10 px-4 py-3 font-mono text-sm text-white outline-none focus:border-emerald-500/50 placeholder:text-white/25"
            />
            <button
              type="button"
              onClick={addQuickToList}
              disabled={!quickIp.trim()}
              className="px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-40 transition-colors"
            >
              Add to list
            </button>
          </div>
          {quickResult && (
            <div
              className="mt-3 rounded-xl border px-3 py-2.5 flex items-start gap-3"
              style={{
                borderColor: VERDICT_META[quickResult.verdict].border,
                background: VERDICT_META[quickResult.verdict].bg,
              }}
            >
              {quickResult.verdict === 'in' ? (
                <ShieldCheck size={18} className="text-emerald-400 mt-0.5" />
              ) : (
                <ShieldAlert size={18} style={{ color: VERDICT_META[quickResult.verdict].color }} className="mt-0.5" />
              )}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-white">{quickResult.normalized}</span>
                  <span
                    className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded"
                    style={{
                      color: VERDICT_META[quickResult.verdict].color,
                      border: `1px solid ${VERDICT_META[quickResult.verdict].border}`,
                    }}
                  >
                    {VERDICT_META[quickResult.verdict].label}
                  </span>
                </div>
                <p className="text-xs text-white/45 mt-0.5">
                  {quickResult.reason}
                  {quickResult.matchedRule ? (
                    <span className="text-white/30"> · matched <span className="font-mono">{quickResult.matchedRule}</span></span>
                  ) : null}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Status strip */}
        <div
          className="rounded-2xl border px-4 py-3.5 flex flex-wrap items-center gap-3 transition-colors"
          style={{
            borderColor: allClear
              ? 'rgba(52,211,153,0.4)'
              : stats.total === 0
                ? 'rgba(255,255,255,0.08)'
                : 'rgba(248,113,113,0.35)',
            background: allClear
              ? 'rgba(52,211,153,0.08)'
              : stats.total === 0
                ? 'rgba(255,255,255,0.02)'
                : 'rgba(248,113,113,0.07)',
          }}
        >
          {stats.total === 0 ? (
            <span className="text-sm text-white/40">No targets in the list yet — use Quick check or paste a batch below.</span>
          ) : allClear ? (
            <>
              <CheckCircle2 className="text-emerald-400 flex-shrink-0" size={20} />
              <span className="text-sm text-emerald-100/90 font-semibold">
                All {stats.total} target{stats.total === 1 ? '' : 's'} in scope — clear to proceed under this engagement.
              </span>
            </>
          ) : (
            <>
              <XCircle className="text-red-400 flex-shrink-0" size={20} />
              <span className="text-sm text-red-100/90 font-semibold">
                Do not scan yet — {stats.out + stats.deny + stats.partial + stats.invalid} problem
                {stats.out + stats.deny + stats.partial + stats.invalid === 1 ? '' : 's'} in the list.
              </span>
            </>
          )}
          <div className="ml-auto flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-wider">
            <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">{stats.in} in</span>
            <span className="px-2 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/25">{stats.out} out</span>
            <span className="px-2 py-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/25">{stats.deny} deny</span>
            <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/25">{stats.partial} partial</span>
            <span className="px-2 py-1 rounded-lg bg-white/5 text-white/40 border border-white/10">{stats.invalid} bad</span>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Profiles */}
          <aside className="xl:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Engagements</h2>
              <button type="button" onClick={addProfile} className="text-emerald-400/90 hover:text-emerald-300 p-1.5 rounded-lg hover:bg-emerald-500/10" title="New engagement">
                <Plus size={16} />
              </button>
            </div>
            <div className="space-y-1.5 max-h-56 xl:max-h-[480px] overflow-y-auto pr-1">
              {profiles.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveId(p.id)}
                  className={`w-full text-left px-3 py-3 rounded-xl border text-sm transition-all ${
                    p.id === activeId
                      ? 'border-emerald-500/45 bg-emerald-500/10 text-white shadow-[0_0_0_1px_rgba(52,211,153,0.12)]'
                      : 'border-white/[0.07] bg-white/[0.02] text-white/50 hover:border-white/15 hover:text-white/80'
                  }`}
                >
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-[10px] text-white/30 mt-1">
                    {p.allow.length} allow · {p.deny.length} deny
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* Scope editor */}
          <section className="xl:col-span-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Your scope</h2>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={saveEditor}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                    savedFlash
                      ? 'bg-emerald-500/25 text-emerald-200 border-emerald-500/40'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/25'
                  }`}
                >
                  <Save size={12} /> {savedFlash ? 'Saved' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={deleteProfile}
                  disabled={profiles.length <= 1}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 text-white/40 border border-white/10 hover:text-red-300 disabled:opacity-30"
                  title="Delete engagement"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Engagement name (client / lab)"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/40"
            />
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="RoE notes, ticket ID, contact…"
              rows={2}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white/70 outline-none focus:border-emerald-500/40 resize-y"
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400/90">
                  <Target size={12} /> Allow — in scope
                </div>
                <span className="text-[10px] text-white/25">{allowCount} rule{allowCount === 1 ? '' : 's'}</span>
              </div>
              <textarea
                value={allowText}
                onChange={e => setAllowText(e.target.value)}
                placeholder={'10.10.10.0/24\n10.10.14.5\n192.168.0.1-192.168.0.50'}
                rows={8}
                className="w-full rounded-xl bg-black/40 border border-emerald-500/25 px-3 py-2.5 font-mono text-xs text-emerald-100/85 outline-none focus:border-emerald-500/50 resize-y"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-orange-400/90">
                  <Ban size={12} /> Deny — never touch
                </div>
                <span className="text-[10px] text-white/25">{denyCount} rule{denyCount === 1 ? '' : 's'}</span>
              </div>
              <textarea
                value={denyText}
                onChange={e => setDenyText(e.target.value)}
                placeholder={'10.10.10.1\n# prod DC — excluded in RoE'}
                rows={4}
                className="w-full rounded-xl bg-black/40 border border-orange-500/25 px-3 py-2.5 font-mono text-xs text-orange-100/75 outline-none focus:border-orange-500/45 resize-y"
              />
            </div>
            <p className="text-[10px] text-white/30 leading-relaxed">
              Formats: <span className="font-mono text-white/40">10.0.0.5</span>
              {' · '}
              <span className="font-mono text-white/40">10.0.0.0/24</span>
              {' · '}
              <span className="font-mono text-white/40">10.0.0.1-10.0.0.20</span>
              . Deny always wins. Hostnames are not resolved — use IPs from the RoE.
            </p>
            {ruleErrors.length > 0 && (
              <div className="text-[11px] text-amber-200/90 space-y-1 rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5">
                {ruleErrors.slice(0, 6).map(e => (
                  <div key={e} className="flex gap-1.5">
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                    {e}
                  </div>
                ))}
              </div>
            )}
            {allowCount === 0 && (
              <div className="text-[11px] text-white/45 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 flex gap-2">
                <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                Add at least one Allow rule or every target will show as out of scope.
              </div>
            )}
          </section>

          {/* Batch validator */}
          <section className="xl:col-span-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">Target list</h2>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTargetText('')}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-white/40 hover:text-white/70 border border-white/10"
                >
                  <Eraser size={12} /> Clear
                </button>
                <button
                  type="button"
                  onClick={() => copyList('in')}
                  disabled={stats.in === 0}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 disabled:opacity-40"
                >
                  <Copy size={12} /> {copied === 'in' ? 'Copied' : 'Copy in-scope'}
                </button>
                <button
                  type="button"
                  onClick={() => copyList('out')}
                  disabled={!hasProblems}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500/10 text-red-300 border border-red-500/25 disabled:opacity-40"
                >
                  <Copy size={12} /> {copied === 'out' ? 'Copied' : 'Copy problems'}
                </button>
              </div>
            </div>
            <textarea
              ref={targetRef}
              value={targetText}
              onChange={e => setTargetText(e.target.value)}
              placeholder={'Paste scan targets here — one per line or comma-separated\n\n10.10.10.5\n10.10.11.20\n10.10.14.0/24'}
              rows={7}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 font-mono text-xs text-white/85 outline-none focus:border-emerald-500/40 resize-y"
            />

            <div className="flex flex-wrap gap-1.5 items-center">
              <ListFilter size={12} className="text-white/30" />
              {(['all', 'in', 'out', 'deny', 'partial', 'invalid'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors ${
                    filter === f
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-white/10 text-white/35 hover:text-white/60'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[440px] overflow-y-auto pr-1">
              {filtered.length === 0 && (
                <div className="text-center text-white/30 text-sm py-12 border border-dashed border-white/10 rounded-2xl">
                  {targetText.trim() ? 'No rows match this filter' : 'Results appear here as you add targets'}
                </div>
              )}
              {filtered.map((row, i) => {
                const m = VERDICT_META[row.verdict]
                return (
                  <div
                    key={`${row.raw}-${i}`}
                    className="rounded-xl border px-3 py-2.5 flex gap-3 items-start transition-colors"
                    style={{ borderColor: m.border, background: m.bg }}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {row.verdict === 'in' && <CheckCircle2 size={16} style={{ color: m.color }} />}
                      {(row.verdict === 'out' || row.verdict === 'deny') && <XCircle size={16} style={{ color: m.color }} />}
                      {(row.verdict === 'partial' || row.verdict === 'invalid') && <AlertTriangle size={16} style={{ color: m.color }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-white/95 break-all">{row.normalized}</span>
                        <span
                          className="text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded"
                          style={{ color: m.color, border: `1px solid ${m.border}` }}
                        >
                          {m.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/45 mt-0.5">
                        {row.reason}
                        {row.matchedRule ? (
                          <span className="text-white/30"> · rule <span className="font-mono">{row.matchedRule}</span></span>
                        ) : null}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <p className="text-[10px] text-white/25 text-center pt-1 pb-2">
          Aegis is a pre-flight checklist — it does not lock other tools. Validate every target list against the written RoE before scanning.
        </p>
      </div>
    </div>
  )
}
