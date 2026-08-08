import { useState, useMemo, memo, useCallback } from 'react'
import { 
  BookOpen, Target, AlertTriangle, Copy, Users, Server, Key, Terminal, 
  CheckCircle2, XCircle, ChevronRight, RotateCcw, Shield, 
  Menu
  } from 'lucide-react'

type Tab = 'overview' | 'concepts' | 'attackpaths' | 'queries' | 'collection' | 'defense' | 'quiz'

// ─────────────────────────────────────────────────────────────────────────────
// Top-level copy utility with fallback for HTTP/non-secure contexts
// ─────────────────────────────────────────────────────────────────────────────

function createCopyHandler(setCopiedKey: (id: string | null) => void) {
  return (text: string, key: string) => {
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
        setCopiedKey(key)
        setTimeout(() => setCopiedKey(null), 1500)
      } catch {
        console.debug('Clipboard fallback failed')
      }
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => {
          setCopiedKey(key)
          setTimeout(() => setCopiedKey(null), 1500)
        },
        fallback,
      )
    } else {
      fallback()
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Memoized Copy Button
// ─────────────────────────────────────────────────────────────────────────────

const CopyBtn = memo(function CopyBtn({
  text,
  id,
  copiedKey,
  onCopy,
}: {
  text: string
  id: string
  copiedKey: string | null
  onCopy: (text: string, key: string) => void
}) {
  const isCopied = copiedKey === id

  return (
    <button
      onClick={() => onCopy(text, id)}
      className="ml-2 text-xs px-2 py-1 hover:bg-white/10 rounded flex-shrink-0 flex items-center gap-1 text-white/40 transition-colors"
      aria-label={isCopied ? 'Copied to clipboard' : 'Copy to clipboard'}
    >
      <Copy size={12} />
      {isCopied ? 'Copied' : 'Copy'}
    </button>
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function BloodHoundCoach() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const copy = useMemo(() => createCopyHandler(setCopiedKey), [])

  const tabs = [
    { id: 'overview', label: 'Overview', Icon: BookOpen },
    { id: 'concepts', label: 'Core Concepts', Icon: Target },
    { id: 'attackpaths', label: 'Attack Chains', Icon: Key },
    { id: 'queries', label: 'Cypher Queries', Icon: Server },
    { id: 'collection', label: 'Lab + Collection', Icon: Users },
    { id: 'defense', label: 'Detection & Defense', Icon: Shield },
    { id: 'quiz', label: 'Self-Check', Icon: CheckCircle2 },
  ] as const

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      <div className="max-w-6xl mx-auto p-6">
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ 
              background: 'radial-gradient(circle, rgba(139,92,246,0.2), rgba(139,92,246,0.05))', 
              border: '1px solid rgba(139,92,246,0.15)' 
            }}>
              <BookOpen size={18} className="text-purple-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">CERBERUS</h1>
              <p className="text-white/40 text-xs">Master Active Directory attack path analysis</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
            >
              <Menu size={14} />
            </button>
          </div>
        </div>

        {/* ── Warning ── */}
        <div className="rounded-2xl border border-purple-500/30 p-4 flex gap-3 mb-4" style={{ background: 'rgba(139,92,246,0.08)' }}>
          <AlertTriangle className="text-purple-400 mt-0.5 flex-shrink-0" size={18} />
          <div className="text-sm text-purple-200/80">
            BloodHound is extremely powerful for mapping Active Directory attack paths.
            Use it only in authorized assessments or your own lab. Proper data collection and analysis can lead to full domain compromise.
          </div>
        </div>

        {/* ── Hands-on nudge ── */}
        <div className="rounded-2xl border border-amber-500/30 p-4 flex gap-3 mb-6" style={{ background: 'rgba(251,191,36,0.06)' }}>
          <Terminal className="text-amber-400 mt-0.5 flex-shrink-0" size={18} />
          <div className="text-sm text-amber-200/80">
            Reading this without a live domain in front of you is memorization, not skill.
            Go to <strong className="text-amber-300">Lab + Collection</strong> and stand up GOAD before going deeper than the Overview tab.
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6 overflow-x-auto">
          {tabs.map(tab => {
            const { Icon } = tab
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-purple-500 text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── Content ── */}
        <div className="relative">
          {/* Overview */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 p-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <h2 className="text-white font-semibold text-xl mb-3">What is BloodHound?</h2>
                <p className="text-white/50 leading-relaxed">
                  BloodHound models Active Directory as a graph: every user, computer, group, and GPO is a node,
                  and every relationship between them (group membership, admin rights, active logon sessions, ACL
                  permissions) is a directed edge. The core insight isn't visualization — it's that AD security is
                  additive and transitive. A single misconfigured permission three hops away from a low-privilege
                  user can be a direct path to Domain Admin, and no human is going to manually trace that across
                  10,000 objects. Graph traversal (Cypher queries under the hood) finds it in milliseconds.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-white/10 p-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-purple-400 font-semibold mb-3">Why It's Powerful</h3>
                  <ul className="text-sm space-y-2 text-white/50 list-disc pl-5">
                    <li>Finds attack paths a human reviewing ACLs manually would miss</li>
                    <li>Computes shortest path to a target (usually Domain Admin) automatically</li>
                    <li>Reveals "shadow admins" — accounts with effective admin rights via indirect group nesting or ACLs, not explicit membership</li>
                    <li>Same graph model works for defenders: it shows your actual attack surface, not your org chart's assumed one</li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-white/10 p-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-purple-400 font-semibold mb-3">Key Components</h3>
                  <ul className="text-sm space-y-2 text-white/50 list-disc pl-5">
                    <li><strong className="text-white/70">SharpHound</strong> — C# data collector, runs on a domain-joined host or with valid creds, queries AD via LDAP + Windows APIs</li>
                    <li><strong className="text-white/70">BloodHound GUI / CE</strong> — Neo4j-backed graph visualization + query interface</li>
                    <li><strong className="text-white/70">Cypher</strong> — Neo4j's query language, structurally similar to SQL but pattern-matches graph paths instead of table rows</li>
                  </ul>
                </div>
              </div>

              <div className="rounded-2xl border border-purple-500/20 p-6" style={{ background: 'rgba(139,92,246,0.05)' }}>
                <h3 className="text-purple-400 font-semibold mb-2">Prerequisite check</h3>
                <p className="text-sm text-white/50">
                  Before this tool is useful, you should already be comfortable with: basic AD structure (domains,
                  forests, OUs, trusts), Kerberos authentication at a conceptual level (TGT vs TGS, what an SPN is),
                  and reading an ACL. If any of those are shaky, stop here and shore that up first — BloodHound
                  output is unreadable if you don't know what a GPO or an SPN is.
                </p>
              </div>
            </div>
          )}

          {/* Core Concepts */}
          {activeTab === 'concepts' && (
            <div className="rounded-2xl border border-white/10 p-6 space-y-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <h2 className="text-white font-semibold text-xl">Core Concepts</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-purple-400 font-semibold mb-2">Nodes (Objects)</h3>
                  <ul className="text-sm text-white/50 space-y-1.5">
                    <li><strong className="text-white/70">User</strong> — domain account; carries flags like hasspn, dontreqpreauth</li>
                    <li><strong className="text-white/70">Computer</strong> — machine account; also has sessions, local admin rights, delegation flags</li>
                    <li><strong className="text-white/70">Group</strong> — security group; membership is transitive (nested groups matter)</li>
                    <li><strong className="text-white/70">Domain</strong> — the AD domain; DCSync rights on this node are the endgame</li>
                    <li><strong className="text-white/70">OU</strong> — organizational unit; GPOs apply here, not permissions directly</li>
                    <li><strong className="text-white/70">GPO</strong> — Group Policy Object; if you can edit one linked to a privileged OU, you own everything under it</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-purple-400 font-semibold mb-2">Edges (Relationships) — with mechanism</h3>
                  <ul className="text-sm text-white/50 space-y-2">
                    <li><strong className="text-white/70">MemberOf</strong> — group membership, transitive through nesting. If A is MemberOf B and B is MemberOf Domain Admins, A effectively is a Domain Admin, even if no one intended that.</li>
                    <li><strong className="text-white/70">AdminTo</strong> — local admin on a computer, via the local Administrators group. Local admin means you can dump LSASS, meaning any cached creds or Kerberos tickets on that box are yours.</li>
                    <li><strong className="text-white/70">HasSession</strong> — a user is currently logged on. Matters because their credential material (password hash, TGT) is sitting in that machine's memory while they're logged in.</li>
                    <li><strong className="text-white/70">GenericAll</strong> — full control over the target object's attributes. On a user, this lets you reset their password directly (no crack needed). On a computer, combined with Resource-Based Constrained Delegation, it lets you impersonate any user against that computer.</li>
                    <li><strong className="text-white/70">GenericWrite</strong> — write access to most attributes. On a user, you can write a fake SPN and then Kerberoast them, or push RBCD onto a computer object.</li>
                    <li><strong className="text-white/70">Owns</strong> — object ownership implies you can rewrite its ACL entirely, including granting yourself GenericAll.</li>
                    <li><strong className="text-white/70">CanRDP / CanPSRemote</strong> — remote access rights — these are how you actually get a session on a box once you have credentials, not a privilege escalation edge by themselves.</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-purple-500/20" style={{ background: 'rgba(139,92,246,0.05)' }}>
                <h3 className="text-purple-400 font-semibold mb-2">Why "the edge exists" isn't enough</h3>
                <p className="text-sm text-white/50">
                  Knowing that GenericAll is "dangerous" is trivia. Knowing that GenericAll on a computer object
                  lets you write msDS-AllowedToActOnBehalfOfOtherIdentity to set up RBCD, then use S4U2Self/S4U2Proxy
                  to request a service ticket impersonating a domain admin, is the actual skill. If you can name
                  the edge but not walk the exploitation steps behind it, that's a knowledge gap — not something to
                  paper over, something to go lab right now.
                </p>
              </div>
            </div>
          )}

          {/* Attack Chains */}
          {activeTab === 'attackpaths' && (
            <div className="rounded-2xl border border-white/10 p-6 space-y-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <h2 className="text-white font-semibold text-xl">Attack Chains (not isolated techniques)</h2>
              <p className="text-sm text-white/50">
                Real engagements are chains, not single techniques in isolation. If you only memorize
                "Kerberoasting = crack SPN hashes" without seeing what it typically leads to, you'll recognize the
                technique but not know what to do with the output. Below are the actual sequences.
              </p>

              <div className="space-y-5">
                {[
                  {
                    title: "Kerberoasting → lateral movement",
                    steps: [
                      "Enumerate users with SPNs set (u.hasspn = true) — these are usually service accounts",
                      "Request a TGS for that SPN (any authenticated user can do this — no special privilege needed)",
                      "The TGS is encrypted with the service account's password hash — extract and crack offline",
                      "Cracked password often reused; check for AdminTo edges from that account to other computers",
                    ],
                    why: "Service accounts are frequently over-privileged and use old, weak, or non-rotating passwords, since nobody logs in interactively to notice a weak password prompt.",
                  },
                  {
                    title: "AS-REP Roasting → same crack path, no auth needed",
                    steps: [
                      "Find users with 'Do not require Kerberos preauthentication' set (dontreqpreauth = true)",
                      "Request AS-REP for that user — no valid credentials required at all, unlike Kerberoasting",
                      "Crack the AS-REP hash offline",
                    ],
                    why: "This flag usually exists because of legacy application compatibility, and gets forgotten. It's the only common AD attack requiring zero prior credentials.",
                  },
                  {
                    title: "ACL abuse chain to Domain Admin",
                    steps: [
                      "Start from a low-priv user; BloodHound path query finds: User -[GenericWrite]-> Computer",
                      "Abuse GenericWrite to configure Resource-Based Constrained Delegation on that computer",
                      "Use Rubeus/impacket to perform S4U2Self + S4U2Proxy, impersonating a Domain Admin against that computer",
                      "Now you have a valid TGS as Domain Admin against that one box — pivot from there",
                    ],
                    why: "This is the pattern BloodHound is built to find: no single step looks alarming, but the chain reaches DA. This is exactly the kind of path a manual ACL review misses.",
                  },
                  {
                    title: "DCSync → Golden Ticket → persistence",
                    steps: [
                      "Once you have rights equivalent to Replicating Directory Changes (often via Domain Admin, but sometimes delegated by mistake)",
                      "Run DCSync to pull the krbtgt account's password hash without touching the DC's disk",
                      "Forge a Golden Ticket using that hash — grants a TGT for any user, in any group, valid until the hash is rotated",
                      "Persistence survives individual password resets; only a krbtgt reset (twice, due to password history) kills it",
                    ],
                    why: "This is why krbtgt compromise is treated as a full forest-rebuild-level incident by real IR teams, not a routine password reset.",
                  },
                ].map((item, index) => (
                  <div key={index} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                      <ChevronRight size={16} className="text-purple-400" /> {item.title}
                    </h3>
                    <ol className="text-sm text-white/50 space-y-1 pl-5 list-decimal mb-3">
                      {item.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                    <p className="text-xs text-purple-300/70 border-t border-white/10 pt-2">
                      <strong>Why it works:</strong> {item.why}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cypher Queries */}
          {activeTab === 'queries' && (
            <div className="rounded-2xl border border-white/10 p-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <h2 className="text-white font-semibold text-xl mb-2">Cypher Queries</h2>
              <p className="text-sm text-white/50 mb-4">
                Run these in the BloodHound CE query editor against data you've already collected from your own lab.
                These don't do anything by themselves — they only traverse a graph you built with SharpHound.
              </p>

              <div className="space-y-4 text-sm">
                {[
                  { name: "Find all Domain Admins", query: "MATCH (u:User)-[:MemberOf*1..]->(g:Group) WHERE g.name CONTAINS 'DOMAIN ADMINS' RETURN u.name" },
                  { name: "Shortest path from a specific user to Domain Admin", query: "MATCH p=shortestPath((u:User {name:'TARGETUSER@DOMAIN.LOCAL'})-[*1..]->(g:Group)) WHERE g.name CONTAINS 'DOMAIN ADMINS' RETURN p" },
                  { name: "Find Kerberoastable users (has SPN)", query: "MATCH (u:User) WHERE u.hasspn=true AND u.enabled=true RETURN u.name, u.description" },
                  { name: "Find AS-REP roastable users", query: "MATCH (u:User) WHERE u.dontreqpreauth=true RETURN u.name" },
                  { name: "Find computers with unconstrained delegation", query: "MATCH (c:Computer) WHERE c.unconstraineddelegation=true RETURN c.name" },
                  { name: "Find all GenericAll/GenericWrite paths into privileged groups", query: "MATCH p=(n)-[:GenericAll|GenericWrite*1..]->(g:Group) WHERE g.highvalue=true RETURN p" },
                  { name: "Find sessions belonging to high-value users (harvestable creds)", query: "MATCH (c:Computer)-[:HasSession]->(u:User) WHERE u.highvalue=true RETURN c.name, u.name" },
                  { name: "Find owned objects with dangerous outbound permissions", query: "MATCH (u:User {owned:true})-[r:GenericAll|GenericWrite|Owns|WriteDacl]->(n) RETURN u.name, type(r), n.name" },
                ].map((q, i) => (
                  <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="text-white font-semibold mb-1">{q.name}</div>
                    <div className="flex justify-between items-center bg-black/40 p-2 rounded font-mono text-xs text-white/70">
                      <span className="break-all">{q.query}</span>
                      <CopyBtn
                        text={q.query}
                        id={`q-${i}`}
                        copiedKey={copiedKey}
                        onCopy={copy}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lab + Collection */}
          {activeTab === 'collection' && (
            <div className="rounded-2xl border border-white/10 p-6 space-y-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <h2 className="text-white font-semibold text-xl">Lab Setup + Data Collection</h2>

              <div className="p-4 rounded-xl border border-amber-500/20" style={{ background: 'rgba(251,191,36,0.05)' }}>
                <h3 className="text-amber-300 font-semibold mb-2">Set this up before anything else</h3>
                <p className="text-sm text-white/50 mb-2">
                  <strong className="text-white/70">GOAD (Game of Active Directory)</strong> deploys a small multi-domain, multi-forest AD lab
                  with intentional misconfigurations via Vagrant + Ansible. It's free, it's the standard practice
                  environment, and it's what most of the queries above are meant to be run against.
                </p>
                <div className="bg-black/40 p-3 rounded font-mono text-xs text-white/70 flex justify-between items-center">
                  <span>git clone https://github.com/Orange-Cyberdefense/GOAD.git</span>
                  <CopyBtn
                    text="git clone https://github.com/Orange-Cyberdefense/GOAD.git"
                    id="goad"
                    copiedKey={copiedKey}
                    onCopy={copy}
                  />
                </div>
                <p className="text-xs text-white/30 mt-2">
                  Needs real compute (several Windows VMs) — a HTB/THM AD-focused box or path is a lighter-weight
                  substitute if your hardware can't run GOAD comfortably.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-white font-semibold mb-2">Basic Collection (All methods)</h3>
                  <div className="bg-black/40 p-3 rounded font-mono text-sm text-white/70 flex justify-between items-center">
                    <span>SharpHound.exe -c All -d lab.local --zipfilename collection.zip</span>
                    <CopyBtn
                      text="SharpHound.exe -c All -d lab.local --zipfilename collection.zip"
                      id="sh1"
                      copiedKey={copiedKey}
                      onCopy={copy}
                    />
                  </div>
                  <p className="text-xs text-white/30 mt-2">
                    <code className="text-purple-300">-c All</code> runs every collection method: group membership, sessions, local admin,
                    ACLs, trusts, GPOs, containers, object properties. Loud but complete — fine for a lab, risky on
                    a real engagement.
                  </p>
                </div>

                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-white font-semibold mb-2">Reduced / quieter collection (real syntax)</h3>
                  <div className="bg-black/40 p-3 rounded font-mono text-sm text-white/70 flex justify-between items-center">
                    <span>SharpHound.exe -c DCOnly</span>
                    <CopyBtn
                      text="SharpHound.exe -c DCOnly"
                      id="sh2"
                      copiedKey={copiedKey}
                      onCopy={copy}
                    />
                  </div>
                  <p className="text-xs text-white/30 mt-2">
                    <code className="text-purple-300">DCOnly</code> pulls everything queryable from the Domain Controller via LDAP only — no
                    per-computer sessions or local-admin enumeration, so it never touches individual workstations.
                    Correction from an earlier version of this tool: there is no single flag literally named
                    "stealth" — <code className="text-purple-300">DCOnly</code> is the actual reduced-footprint method professionals use, since
                    it skips the noisy host-by-host SMB/RPC calls that trigger EDR and generate massive event volume.
                  </p>
                </div>

                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-white font-semibold mb-2">Combining specific methods</h3>
                  <div className="bg-black/40 p-3 rounded font-mono text-sm text-white/70 flex justify-between items-center">
                    <span>SharpHound.exe -c Group,LocalAdmin,Session</span>
                    <CopyBtn
                      text="SharpHound.exe -c Group,LocalAdmin,Session"
                      id="sh3"
                      copiedKey={copiedKey}
                      onCopy={copy}
                    />
                  </div>
                  <p className="text-xs text-white/30 mt-2">Comma-separated collection methods let you scope exactly what you generate traffic for.</p>
                </div>
              </div>
            </div>
          )}

          {/* Detection & Defense */}
          {activeTab === 'defense' && (
            <div className="rounded-2xl border border-white/10 p-6 space-y-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <h2 className="text-purple-400 font-semibold text-xl">Detection & Defense</h2>

              <div className="space-y-4 text-sm">
                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-white font-semibold mb-2">How Defenders Detect Collection</h3>
                  <ul className="list-disc pl-5 text-white/50 space-y-1">
                    <li>SharpHound's default process name, and the specific LDAP search filters it issues, are known IOCs for most EDR/SIEM rulesets</li>
                    <li>A single account issuing thousands of LDAP queries against objectClass=user/computer/group in a short window is anomalous for almost any real user</li>
                    <li><code className="text-purple-300">-c All</code> generates SMB session enumeration (NetSessionEnum) and remote registry calls against many hosts in sequence — a very identifiable fan-out pattern</li>
                    <li>Microsoft Defender for Identity and similar tools specifically flag "reconnaissance" behavior matching BloodHound/SharpHound's query shape</li>
                  </ul>
                </div>

                <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <h3 className="text-white font-semibold mb-2">How to Defend (mechanism-level, matched to the attack chains above)</h3>
                  <ul className="list-disc pl-5 text-white/50 space-y-1">
                    <li><strong className="text-white/70">Against Kerberoasting/AS-REP roasting:</strong> enforce long, random passwords on service accounts (25+ chars via gMSA where possible removes the crackable-hash problem entirely), and require preauth on all accounts</li>
                    <li><strong className="text-white/70">Against ACL abuse chains:</strong> run BloodHound against your own domain regularly and treat any unexpected GenericAll/WriteDacl path into a privileged group as a finding, not noise</li>
                    <li><strong className="text-white/70">Against DCSync/Golden Ticket:</strong> tightly restrict Replicating Directory Changes rights, and monitor for DsGetNCChanges calls from non-DC sources (Event ID 4662 with the right GUIDs)</li>
                    <li><strong className="text-white/70">Structural fix, not detection:</strong> Tiered Administration model — Tier 0 (DC/DA) credentials never touch Tier 1/2 machines, which removes most of the HasSession-based credential theft paths entirely</li>
                    <li>Reduce nested group membership sprawl — most "shadow admin" findings are a chain of MemberOf edges nobody audited</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Quiz */}
          {activeTab === 'quiz' && (
            <QuizPanel />
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Quiz Panel — state persists across tab switches because it's always mounted
// ─────────────────────────────────────────────────────────────────────────────

function QuizPanel() {
  const questions = [
    {
      q: "You find a user with GenericWrite over a Computer object. What does this actually let you do that leads to compromising that computer, and why not GenericAll's password-reset trick?",
      a: "GenericWrite lets you write specific attributes but not full control. You can't reset a computer's 'password' meaningfully — instead you write msDS-AllowedToActOnBehalfOfOtherIdentity to configure Resource-Based Constrained Delegation, then use S4U2Self/S4U2Proxy to request a service ticket impersonating any user (including a Domain Admin) against that computer.",
    },
    {
      q: "Why is AS-REP Roasting considered lower-bar than Kerberoasting in terms of prerequisites?",
      a: "Kerberoasting requires you to already be an authenticated domain user to request a TGS. AS-REP Roasting requires zero valid credentials — you're requesting the AS-REP for any account with preauth disabled, which any unauthenticated attacker on the network segment can attempt.",
    },
    {
      q: "A HasSession edge shows a Domain Admin has an active session on a low-value workstation. Why does this matter more than an AdminTo edge on that same box?",
      a: "AdminTo means you could get admin rights on the box. HasSession means a Domain Admin's credential material (Kerberos tickets, potentially cached hash) is sitting in that machine's memory right now — if you get local admin (e.g. via AdminTo elsewhere, or an exploit), you can dump LSASS and directly extract DA-level credentials without any further privilege escalation.",
    },
    {
      q: "What's actually wrong with running SharpHound -c All on every engagement by default?",
      a: "It performs session enumeration and local admin checks against every reachable computer, generating a large, distinctive fan-out of SMB/RPC calls that most modern EDR and Microsoft Defender for Identity deployments flag as reconnaissance. DCOnly avoids touching individual hosts entirely by pulling everything from LDAP against the DC only, trading completeness (no session/local-admin data) for a much smaller footprint.",
    },
    {
      q: "Why does compromising krbtgt's hash require a forest-level incident response, not just a password reset?",
      a: "krbtgt's hash is used to sign every Kerberos TGT in the domain. An attacker with it can forge a Golden Ticket for any user/group membership, valid until the hash is rotated — and it must be rotated twice due to Kerberos password history, with a wait between resets, or old golden tickets can still work. It's a structural trust compromise, not a single-credential compromise.",
    },
  ]

  const [idx, setIdx] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [results, setResults] = useState<(boolean | null)[]>(Array(questions.length).fill(null))

  const mark = useCallback((correct: boolean) => {
    const next = [...results]
    next[idx] = correct
    setResults(next)
  }, [idx, results])

  const next = useCallback(() => {
    setRevealed(false)
    setIdx((idx + 1) % questions.length)
  }, [idx, questions.length])

  const reset = useCallback(() => {
    setIdx(0)
    setRevealed(false)
    setResults(Array(questions.length).fill(null))
  }, [questions.length])

  const answered = results.filter(r => r !== null).length
  const correct = results.filter(r => r === true).length

  return (
    <div className="rounded-2xl border border-white/10 p-6 space-y-6" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-white font-semibold text-xl">Self-Check — Active Recall</h2>
        <div className="text-sm text-white/40">
          {answered}/{questions.length} answered · <span className="text-emerald-400">{correct}</span> correct
        </div>
      </div>
      <p className="text-sm text-white/40">
        Answer out loud or on paper before revealing. If you can't explain the mechanism without looking, that's
        the concept to go re-lab — not just re-read.
      </p>

      <div className="p-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div className="text-xs text-purple-400 font-mono mb-2">QUESTION {idx + 1} / {questions.length}</div>
        <p className="text-white font-medium mb-4">{questions[idx].q}</p>

        {!revealed ? (
          <button
            onClick={() => setRevealed(true)}
            className="text-sm px-4 py-2 rounded-lg bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-colors"
          >
            Reveal answer
          </button>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-black/30 rounded-lg text-sm text-white/60 border border-purple-500/20">
              {questions[idx].a}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => mark(true)}
                className={`text-sm px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                  results[idx] === true
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30'
                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                }`}
              >
                <CheckCircle2 size={14} /> I had this right
              </button>
              <button
                onClick={() => mark(false)}
                className={`text-sm px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                  results[idx] === false
                    ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/30'
                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                }`}
              >
                <XCircle size={14} /> I missed it
              </button>
              <button
                onClick={next}
                className="text-sm px-4 py-2 rounded-lg bg-purple-500 text-white ml-auto flex items-center gap-1 transition-colors hover:bg-purple-600"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {answered === questions.length && (
        <div className="p-4 rounded-xl flex flex-wrap justify-between items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="text-sm">
            <strong className={correct === questions.length ? 'text-emerald-400' : 'text-amber-400'}>
              {correct}/{questions.length}
            </strong>{' '}
            <span className="text-white/40">
              — {correct === questions.length
                ? "Solid, but you haven't run this against a live domain yet per your own answer. Go do that before moving to a new AD topic."
                : "Whatever you missed, don't just reread the tab — go find that specific edge/technique on your GOAD lab and reproduce it by hand."}
            </span>
          </div>
          <button
            onClick={reset}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-1.5 flex-shrink-0 text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <RotateCcw size={12} /> Reset all results
          </button>
        </div>
      )}
    </div>
  )
}