// src/components/recon/OsintRecon.tsx
// Hermes — OSINT & subdomain recon (before Scout / nmap)
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  Globe2, Search, Copy, CheckCircle2, AlertTriangle, Terminal,
  Download, Trash2, Loader2, Server, 
  Shield, Radio, Plus} from 'lucide-react'

const STORAGE_HISTORY = 'hermes_domains_v1'

type Tab = 'subdomains' | 'dns' | 'whois' | 'http' | 'commands'

type SubHit = {
  host: string
  source: string
}

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '')
}

function isPlausibleDomain(d: string): boolean {
  if (!d || d.length > 253) return false
  if (!d.includes('.')) return false
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(d)
}

function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (t.current) clearTimeout(t.current) }, [])
  const onCopy = async () => {
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
      setState('ok')
    } catch {
      setState('fail')
    }
    if (t.current) clearTimeout(t.current)
    t.current = setTimeout(() => setState('idle'), 1500)
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className={`text-xs flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors flex-shrink-0 ${
        state === 'ok'
          ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
          : state === 'fail'
            ? 'text-red-400 border-red-500/30'
            : 'text-white/40 border-white/10 hover:text-white/70 hover:border-white/20'
      }`}
    >
      {state === 'ok' ? <CheckCircle2 size={12} /> : <Copy size={12} />}
      {state === 'ok' ? 'Copied' : label}
    </button>
  )
}

function CmdCard({ title, cmd, note }: { title: string; cmd: string; note?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-white/85">{title}</h4>
        <CopyBtn text={cmd} />
      </div>
      <pre className="bg-black/50 rounded-lg p-2.5 font-mono text-[11px] text-cyan-300/90 overflow-x-auto whitespace-pre-wrap break-all">{cmd}</pre>
      {note && <p className="text-[11px] text-white/35">{note}</p>}
    </div>
  )
}

function belongsToDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '')
  return h === domain || h.endsWith('.' + domain)
}

function hostsFromText(text: string, domain: string, source: string): SubHit[] {
  const hosts = new Set<string>()
  for (const line of text.split(/[\n,]+/)) {
    let h = line.trim().toLowerCase()
    // hackertarget: host,ip
    if (h.includes(',')) h = h.split(',')[0].trim()
    h = h.replace(/^\*\./, '').replace(/\.$/, '')
    if (!h || h.startsWith('#')) continue
    if (belongsToDomain(h, domain)) hosts.add(h)
  }
  return [...hosts].map(host => ({ host, source }))
}

/** Try several passive sources. Browser CORS often blocks crt.sh directly. */
async function fetchPassiveSubs(domain: string, signal: AbortSignal): Promise<{ hits: SubHit[]; sourcesTried: string[]; warnings: string[] }> {
  const hitsMap = new Map<string, SubHit>()
  const sourcesTried: string[] = []
  const warnings: string[] = []

  const merge = (list: SubHit[]) => {
    for (const h of list) {
      if (!hitsMap.has(h.host)) hitsMap.set(h.host, h)
    }
  }

  // 1) HackerTarget hostsearch (often works from browser)
  try {
    sourcesTried.push('hackertarget')
    const url = `https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(domain)}`
    const res = await fetch(url, { signal })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    if (/error|api count|limit/i.test(text) && text.length < 200) {
      warnings.push(`HackerTarget: ${text.trim().slice(0, 120)}`)
    } else {
      merge(hostsFromText(text, domain, 'hackertarget'))
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    warnings.push(`HackerTarget failed: ${(e as Error).message || 'network'}`)
  }

  // 2) crt.sh direct
  try {
    sourcesTried.push('crt.sh')
    const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`
    const res = await fetch(url, {
      signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.text()
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      throw new Error('invalid JSON (site may be rate-limiting)')
    }
    if (!Array.isArray(data)) throw new Error('unexpected response shape')
    const hosts = new Set<string>()
    for (const row of data as { name_value?: string }[]) {
      const name = String(row.name_value || '')
      for (const part of name.split(/\n/)) {
        const h = part.trim().toLowerCase().replace(/^\*\./, '')
        if (!h || h.startsWith('*')) continue
        if (belongsToDomain(h, domain)) hosts.add(h)
      }
    }
    merge([...hosts].map(host => ({ host, source: 'crt.sh' })))
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    const msg = (e as Error).message || 'network'
    // Typical browser CORS message is "Failed to fetch"
    if (/failed to fetch|networkerror|cors/i.test(msg)) {
      warnings.push('crt.sh blocked in-browser (CORS). Use the CLI cards or other sources.')
    } else {
      warnings.push(`crt.sh failed: ${msg}`)
    }
  }

  // 3) crt.sh via public CORS relay (last resort — still only for authorized domains)
  if (hitsMap.size === 0) {
    try {
      sourcesTried.push('crt.sh-proxy')
      const target = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`
      const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.text()
      const data = JSON.parse(raw)
      if (!Array.isArray(data)) throw new Error('unexpected proxy response')
      const hosts = new Set<string>()
      for (const row of data as { name_value?: string }[]) {
        const name = String(row.name_value || '')
        for (const part of name.split(/\n/)) {
          const h = part.trim().toLowerCase().replace(/^\*\./, '')
          if (!h || h.startsWith('*')) continue
          if (belongsToDomain(h, domain)) hosts.add(h)
        }
      }
      merge([...hosts].map(host => ({ host, source: 'crt.sh' })))
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      warnings.push(`crt.sh proxy failed: ${(e as Error).message || 'network'}`)
    }
  }

  // 4) Cert Spotter (public API, limited)
  try {
    sourcesTried.push('certspotter')
    const url = `https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(domain)}&include_subdomains=true&expand=dns_names`
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) {
        const hosts = new Set<string>()
        for (const row of data as { dns_names?: string[] }[]) {
          for (const n of row.dns_names || []) {
            const h = String(n).toLowerCase().replace(/^\*\./, '')
            if (belongsToDomain(h, domain)) hosts.add(h)
          }
        }
        merge([...hosts].map(host => ({ host, source: 'certspotter' })))
      }
    } else if (res.status === 429) {
      warnings.push('Cert Spotter rate-limited')
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    warnings.push(`Cert Spotter failed: ${(e as Error).message || 'network'}`)
  }

  const hits = [...hitsMap.values()].sort((a, b) => a.host.localeCompare(b.host))
  return { hits, sourcesTried, warnings }
}

export default function OsintRecon() {
  const [domain, setDomain] = useState('example.com')
  const [tab, setTab] = useState<Tab>('subdomains')
  const [hits, setHits] = useState<SubHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [history, setHistory] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })
  const [manualAdd, setManualAdd] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const d = useMemo(() => normalizeDomain(domain), [domain])
  const domainOk = isPlausibleDomain(d)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history.slice(0, 12))) } catch { /* */ }
  }, [history])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  const filteredHits = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return hits
    return hits.filter(h => h.host.includes(q) || h.source.includes(q))
  }, [hits, filter])

  const runCrtSh = useCallback(async () => {
    if (!domainOk) {
      setError('Enter a valid domain (e.g. google.com or lab.example.com)')
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    // Hard timeout so the UI cannot spin forever
    const timer = setTimeout(() => ac.abort(), 45000)
    setLoading(true)
    setError(null)
    try {
      const { hits: found, warnings } = await fetchPassiveSubs(d, ac.signal)
      setHits(prev => {
        const map = new Map(prev.map(h => [h.host, h]))
        for (const h of found) map.set(h.host, h)
        return [...map.values()].sort((a, b) => a.host.localeCompare(b.host))
      })
      setHistory(prev => [d, ...prev.filter(x => x !== d)].slice(0, 12))
      if (found.length === 0) {
        const hint = warnings.length
          ? warnings.slice(0, 3).join(' · ')
          : 'No public CT/OSINT names returned'
        setError(
          `${hint}. Private/lab domains are often empty online — use subfinder/amass commands on the right.`,
        )
      } else if (warnings.length) {
        setError(`Found ${found.length} host(s). Notes: ${warnings.slice(0, 2).join(' · ')}`)
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setError('Lookup timed out or was cancelled. Try again, or run the CLI commands offline.')
        return
      }
      const msg = e instanceof Error ? e.message : 'Lookup failed'
      setError(
        /failed to fetch/i.test(msg)
          ? 'Network/CORS blocked in-app lookups. Copy a CLI command on the right (subfinder, amass, curl crt.sh).'
          : `${msg} — use the command cards offline`,
      )
    } finally {
      clearTimeout(timer)
      setLoading(false)
    }
  }, [d, domainOk])

  const addManual = () => {
    const h = normalizeDomain(manualAdd)
    if (!h) return
    setHits(prev => {
      if (prev.some(x => x.host === h)) return prev
      return [...prev, { host: h, source: 'manual' }].sort((a, b) => a.host.localeCompare(b.host))
    })
    setManualAdd('')
  }

  const clearHits = () => setHits([])

  const exportHosts = () => {
    const text = hits.map(h => h.host).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${d || 'hosts'}-subdomains.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'subdomains', label: 'Subdomains' },
    { id: 'dns', label: 'DNS' },
    { id: 'whois', label: 'WHOIS' },
    { id: 'http', label: 'HTTP probe' },
    { id: 'commands', label: 'All commands' },
  ]

  return (
    <div
      className="min-h-full overflow-y-auto"
      style={{ background: 'linear-gradient(160deg, #070b12 0%, #0b1220 50%, #070b12 100%)' }}
    >
      <div className="max-w-6xl mx-auto p-5 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, rgba(34,211,238,0.2), rgba(34,211,238,0.04))',
                border: '1px solid rgba(34,211,238,0.28)',
              }}
            >
              <Radio size={22} className="text-cyan-400" />
            </div>
            <div>
              <h1 className="text-white font-black text-xl tracking-[0.14em] uppercase">Hermes</h1>
              <p className="text-white/40 text-xs mt-0.5">OSINT & subdomain recon — before Scout / nmap</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] p-4 flex gap-3">
          <Shield className="text-cyan-400 flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm text-white/55 leading-relaxed">
            Authorized targets only. Passive domains you own, lab domains, or clients with written permission.
            Passive crt.sh queries still leave a network footprint — use Aegis first if you have a defined scope.
          </p>
        </div>

        {/* Domain bar */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400/80">Target domain</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Globe2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={domain}
                onChange={e => setDomain(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && domainOk) void runCrtSh() }}
                placeholder="lab.example.com"
                className={`w-full rounded-xl bg-black/50 border pl-10 pr-3 py-3 font-mono text-sm text-white outline-none ${
                  domain.trim() && !domainOk
                    ? 'border-red-500/40 focus:border-red-500/50'
                    : 'border-white/10 focus:border-cyan-500/40'
                }`}
              />
            </div>
            <button
              type="button"
              onClick={() => void runCrtSh()}
              disabled={loading || !domainOk}
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-cyan-500/20 text-cyan-200 border border-cyan-500/35 hover:bg-cyan-500/30 disabled:opacity-40 transition-colors"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {loading ? 'Querying…' : 'Passive lookup'}
            </button>
          </div>
          {history.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-white/30 uppercase tracking-wider">Recent</span>
              {history.map(h => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setDomain(h)}
                  className="px-2 py-1 rounded-lg text-[11px] font-mono text-white/45 border border-white/10 hover:border-cyan-500/30 hover:text-cyan-300/80"
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto bg-white/5 rounded-xl p-1 border border-white/10">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-cyan-500 text-black' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'subdomains' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white/80">
                  Results <span className="text-white/35 font-normal">({hits.length})</span>
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={exportHosts}
                    disabled={hits.length === 0}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border border-white/10 text-white/50 hover:text-white disabled:opacity-40"
                  >
                    <Download size={12} /> Export
                  </button>
                  <button
                    type="button"
                    onClick={clearHits}
                    disabled={hits.length === 0}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] border border-white/10 text-white/50 hover:text-red-300 disabled:opacity-40"
                  >
                    <Trash2 size={12} /> Clear
                  </button>
                  <CopyBtn text={hits.map(h => h.host).join('\n')} label="Copy all" />
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="Filter hosts…"
                  className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500/40"
                />
                <div className="flex gap-1.5 flex-1">
                  <input
                    value={manualAdd}
                    onChange={e => setManualAdd(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addManual() }}
                    placeholder="Add host manually"
                    className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-xs font-mono text-white outline-none focus:border-cyan-500/40"
                  />
                  <button
                    type="button"
                    onClick={addManual}
                    className="px-3 rounded-xl border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex gap-2 text-sm text-amber-200/90 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-black/30 max-h-[420px] overflow-y-auto divide-y divide-white/5">
                {filteredHits.length === 0 && !loading && (
                  <div className="text-center text-white/30 text-sm py-14 px-4">
                    Run <strong className="text-white/45">Passive lookup</strong> or paste hosts manually.
                    Public CT data is empty for many private lab domains — use the tool commands on the right.
                  </div>
                )}
                {loading && (
                  <div className="flex items-center justify-center gap-2 text-cyan-300/80 text-sm py-14">
                    <Loader2 size={16} className="animate-spin" /> Querying passive sources…
                  </div>
                )}
                {filteredHits.map(h => (
                  <div key={h.host} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03]">
                    <Server size={14} className="text-cyan-500/60 flex-shrink-0" />
                    <span className="font-mono text-sm text-white/90 flex-1 break-all">{h.host}</span>
                    <span className="text-[10px] uppercase tracking-wider text-white/30 flex-shrink-0">{h.source}</span>
                    <CopyBtn text={h.host} label="" />
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-2 space-y-3">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35 flex items-center gap-1.5">
                <Terminal size={12} /> Local / CLI discovery
              </h2>
              <CmdCard
                title="subfinder"
                cmd={`subfinder -d ${d || 'target.com'} -silent -o subs.txt`}
                note="Passive sources. Install: go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest"
              />
              <CmdCard
                title="amass passive"
                cmd={`amass enum -passive -d ${d || 'target.com'} -o amass.txt`}
                note="Broad passive enum — can be slow"
              />
              <CmdCard
                title="assetfinder"
                cmd={`assetfinder --subs-only ${d || 'target.com'} | tee assetfinder.txt`}
              />
              <CmdCard
                title="crt.sh via curl"
                cmd={`curl -s "https://crt.sh/?q=%25.${d || 'target.com'}&output=json" | jq -r '.[].name_value' | sed 's/\\*\\.//g' | sort -u`}
              />
              <CmdCard
                title="dnsx probe alive"
                cmd={`cat subs.txt | dnsx -silent -a -resp -o resolved.txt`}
                note="Resolve and keep live names before nmap"
              />
            </div>
          </div>
        )}

        {tab === 'dns' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CmdCard title="dig — A" cmd={`dig +short ${d || 'target.com'} A`} />
            <CmdCard title="dig — AAAA" cmd={`dig +short ${d || 'target.com'} AAAA`} />
            <CmdCard title="dig — NS" cmd={`dig +short ${d || 'target.com'} NS`} />
            <CmdCard title="dig — MX" cmd={`dig +short ${d || 'target.com'} MX`} />
            <CmdCard title="dig — TXT" cmd={`dig +short ${d || 'target.com'} TXT`} />
            <CmdCard title="dig — ANY (if allowed)" cmd={`dig ${d || 'target.com'} ANY +noall +answer`} note="Many resolvers ignore ANY now" />
            <CmdCard title="dig — SOA" cmd={`dig +short ${d || 'target.com'} SOA`} />
            <CmdCard
              title="Zone transfer attempt (lab only)"
              cmd={`dig axfr @ns1.${d || 'target.com'} ${d || 'target.com'}`}
              note="Almost always refused outside broken labs — still worth one try on HTB-style boxes"
            />
            <CmdCard
              title="host"
              cmd={`host ${d || 'target.com'}\nhost -t ns ${d || 'target.com'}`}
            />
            <CmdCard
              title="dnsenum"
              cmd={`dnsenum --enum ${d || 'target.com'}`}
              note="Older all-in-one DNS enum"
            />
          </div>
        )}

        {tab === 'whois' && (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
              WHOIS is for registration metadata (registrar, dates, contacts when not redacted). Run locally — results vary by TLD.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CmdCard title="whois domain" cmd={`whois ${d || 'target.com'}`} />
              <CmdCard title="whois — brief grep" cmd={`whois ${d || 'target.com'} | grep -iE 'Registrant|OrgName|Name Server|Creation|Expir|CIDR|NetRange'`} />
              <CmdCard title="whois IP (after resolve)" cmd={`whois $(dig +short ${d || 'target.com'} A | head -1)`} />
              <CmdCard title="rdap (if installed)" cmd={`rdap ${d || 'target.com'}`} />
            </div>
          </div>
        )}

        {tab === 'http' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CmdCard
              title="httpx — from subdomain list"
              cmd={`cat subs.txt | httpx -silent -status-code -title -tech-detect -o httpx.txt`}
              note="Find which names speak HTTP before heavy scanning"
            />
            <CmdCard
              title="httpx — single domain"
              cmd={`httpx -u https://${d || 'target.com'} -status-code -title -tech-detect`}
            />
            <CmdCard title="whatweb" cmd={`whatweb -a 3 https://${d || 'target.com'}`} />
            <CmdCard title="curl headers" cmd={`curl -sI https://${d || 'target.com'}`} />
            <CmdCard title="curl — follow redirects" cmd={`curl -sI -L https://${d || 'target.com'} | grep -iE 'HTTP/|location:|server:|x-'`} />
            <CmdCard
              title="nmap — after recon (Scout)"
              cmd={`nmap -sV -sC -iL resolved.txt -oA nmap_recon`}
              note="Only on in-scope hosts — validate with Aegis first"
            />
          </div>
        )}

        {tab === 'commands' && (
          <div className="space-y-4">
            <p className="text-sm text-white/45">
              Full cheat sheet for <span className="font-mono text-cyan-300/80">{d || 'target.com'}</span> — copy into your lab terminal.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <CmdCard
                title="Pipeline: subfinder → dnsx → httpx"
                cmd={`subfinder -d ${d || 'target.com'} -silent | dnsx -silent | httpx -silent -status-code -title -o live.txt`}
              />
              <CmdCard
                title="amass + dig NS"
                cmd={`amass enum -passive -d ${d || 'target.com'} -o amass.txt\ndig +short ${d || 'target.com'} NS`}
              />
              <CmdCard
                title="WHOIS + curl headers"
                cmd={`whois ${d || 'target.com'} | head -40\ncurl -sI https://${d || 'target.com'}`}
              />
            </div>
          </div>
        )}

        <p className="text-[10px] text-white/25 text-center pb-2">
          Hermes prepares the host list. Scout (nmap) comes after — and only for Aegis-cleared targets.
        </p>
      </div>
    </div>
  )
}
