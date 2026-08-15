'use client'

// src/components/coach/ResponderCoach.tsx
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  BookOpen, Terminal, AlertTriangle, Target, Copy, Shield,
  Zap, CheckCircle, Lock, Eye, Lightbulb, ListChecks, RotateCcw,
  Search, Menu
} from 'lucide-react'

type Tab = 'overview' | 'howitworks' | 'commands' | 'scenarios' | 'defense' | 'checklist' | 'relay'

const STORAGE_CHECKLIST = 'siren_lab_checklist_v1'

// ─── STATIC DATA ───
const tabs: ReadonlyArray<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'howitworks', label: 'How It Works', icon: Target },
  { id: 'commands', label: 'Useful Commands', icon: Terminal },
  { id: 'relay', label: 'Relay Lab Notes', icon: Zap },
  { id: 'scenarios', label: 'Attack Scenarios', icon: Shield },
  { id: 'defense', label: 'Detection & Defense', icon: AlertTriangle },
  { id: 'checklist', label: 'Lab Checklist', icon: ListChecks },
]

const commandExamples = [
  {
    id: 'basic-capture',
    title: 'Basic Capture (Recommended Start)',
    cmd: 'sudo responder -I eth0 -w -d -v',
    desc: 'Run on interface eth0, enable WPAD, analyze, and verbose output'
  },
  {
    id: 'force-ntlmv2',
    title: 'Capture + Force NTLMv2',
    cmd: 'sudo responder -I eth0 -w -d -v -F',
    desc: 'Forces NTLMv2 authentication (more secure to crack, but still crackable offline)'
  },
  {
    id: 'wpad-proxy',
    title: 'With WPAD + Proxy',
    cmd: 'sudo responder -I eth0 -w -d -v --wpad',
    desc: 'Also poisons WPAD to capture more traffic from browsers using proxy auto-detection'
  },
  {
    id: 'specific-interface-log',
    title: 'Specific Interface + Log to File',
    cmd: 'sudo responder -I tun0 -w -d -v -l /tmp/responder.log',
    desc: 'Run on a VPN interface (e.g. during a remote assessment) and save logs for later review'
  },
  {
    id: 'disable-smb-http',
    title: 'Disable SMB and HTTP (avoid SMB relay conflicts)',
    cmd: 'sudo responder -I eth0 -w -d -v --disable-smb --disable-http',
    desc: 'Only capture NTLM hashes via other protocols, useful when relaying SMB separately'
  },
  {
    id: 'custom-smb-port',
    title: 'Run with Custom SMB Port',
    cmd: 'sudo responder -I eth0 -w -d -v --smb-port 4455',
    desc: 'Use a non-standard port to avoid conflicting with an existing SMB service'
  },
  {
    id: 'analyze-mode',
    title: 'Analyze Mode (Passive, No Poisoning)',
    cmd: 'sudo responder -I eth0 -A',
    desc: 'Listens and reports what it sees without answering any requests — useful for recon before poisoning'
  },
  {
    id: 'fingerprint-host',
    title: 'Fingerprint a Host',
    cmd: 'python3 RunFinger.py -i 10.10.10.5',
    desc: "Responder's fingerprinting script — identifies OS and services on a target without poisoning"
  },
  {
    id: 'hashcat-ntlmv2',
    title: 'Crack captured NTLMv2 (lab)',
    cmd: 'hashcat -m 5600 hash.txt /usr/share/wordlists/rockyou.txt',
    desc: 'Mode 5600 = NetNTLMv2. Only against hashes from your authorized lab captures.'
  },
  {
    id: 'john-ntlmv2',
    title: 'John the Ripper NTLMv2 (lab)',
    cmd: 'john --format=netntlmv2 hash.txt --wordlist=/usr/share/wordlists/rockyou.txt',
    desc: 'Alternative offline crack path for lab hashes.'
  },
  {
    id: 'responder-config',
    title: 'Edit Responder.conf (lab)',
    cmd: 'sudo nano /etc/responder/Responder.conf',
    desc: 'Toggle servers (SMB/HTTP/LDAP) and Challenge value. Keep a backup of the stock config.'
  }
]

const scenarios = [
  {
    id: 'hash-capture',
    title: 'Hash Capture',
    desc: 'Run Responder during an internal assessment. Wait for users to access file shares or mapped drives. Capture NTLMv2 hashes and crack them offline with Hashcat (e.g. mode 5600).'
  },
  {
    id: 'wpad-poisoning',
    title: 'WPAD Poisoning',
    desc: 'Enable WPAD poisoning to force browsers to use Responder as a proxy. This can capture even more authentication attempts, including from users who never touch a file share.'
  },
  {
    id: 'relay-smb',
    title: 'Relay to SMB',
    desc: 'Use Responder together with tools like ntlmrelayx.py (from Impacket) to relay captured authentication to other machines on the network — often leading to local admin or SAM dumps.'
  },
  {
    id: 'llmnr-spoofing',
    title: 'LLMNR/NBT-NS Spoofing + Credential Harvesting',
    desc: "Spoof responses to LLMNR and NBT-NS requests to collect NTLM hashes from multiple machines simultaneously, especially effective on networks with typo'd hostnames or misconfigured DNS."
  },
  {
    id: 'stealthy-operation',
    title: 'Stealthy Operation with Limited Time',
    desc: 'Run for short, scheduled bursts (e.g., 5–10 minutes during business hours) and rotate interfaces/segments to reduce the chance of detection during a longer engagement.'
  },
  {
    id: 'relay-ldap-rbcd',
    title: 'Relay to LDAP for Resource-Based Constrained Delegation',
    desc: 'Relay captured machine-account authentication to LDAP/LDAPS to configure RBCD, potentially enabling full takeover of a target computer object without cracking any hash.'
  },
  {
    id: 'multirelay-postex',
    title: 'MultiRelay Post-Exploitation',
    desc: 'After a relay succeeds, use MultiRelay.py to execute commands, dump SAM, or drop an implant on the relayed-to host as part of a broader lateral movement chain.'
  }
]

const relayLabNotes = [
  {
    id: 'ntlmrelayx-smb',
    title: 'ntlmrelayx → SMB (signing off)',
    cmd: 'sudo ntlmrelayx.py -tf targets.txt -smb2support',
    desc: 'Relay captured auth to hosts in targets.txt. Disable Responder SMB/HTTP when relaying those protocols to avoid conflict.'
  },
  {
    id: 'ntlmrelayx-socks',
    title: 'ntlmrelayx SOCKS + interactive',
    cmd: 'sudo ntlmrelayx.py -tf targets.txt -socks -smb2support',
    desc: 'Opens a SOCKS proxy for tools that speak through the relayed session (lab only).'
  },
  {
    id: 'ntlmrelayx-ldap',
    title: 'ntlmrelayx → LDAP (lab RBCD path)',
    cmd: 'sudo ntlmrelayx.py -t ldap://dc.lab.local --delegate-access',
    desc: 'Educational lab path for RBCD-style LDAP relay. Only on domains you own.'
  },
  {
    id: 'responder-disable-conflict',
    title: 'Responder without SMB/HTTP servers',
    cmd: 'sudo responder -I eth0 -w -d -v --disable-smb --disable-http',
    desc: 'Poison + capture while leaving SMB/HTTP free for ntlmrelayx listeners.'
  },
]

const checklistItems = [
  { id: 'lab-seg', label: 'Isolated lab segment ready', detail: 'GOAD / HTB / home AD lab — not production' },
  { id: 'analyze-first', label: 'Run analyze mode first (-A)', detail: 'See traffic without poisoning' },
  { id: 'capture-once', label: 'Capture one lab NTLMv2 hash', detail: 'Confirm Responder logs the user' },
  { id: 'crack-lab', label: 'Crack that hash offline (or fail honestly)', detail: 'hashcat -m 5600 or john' },
  { id: 'signing-note', label: 'Document whether SMB signing blocked relay', detail: 'Understand why relay failed/succeeded' },
  { id: 'defend-gpo', label: 'Write the GPO fix for LLMNR/NBT-NS', detail: 'Detection & Defense tab — make it concrete' },
]

const defenseDetails = {
  detection: [
    'Monitor for unexpected LLMNR/NBT-NS responses – any response to a non-existent host is suspicious.',
    'Look for WPAD poisoning attempts – multiple WPAD requests from different sources in a short time.',
    'Detect unusual NTLM authentication patterns – especially from non-domain joined systems or systems answering for names they don\'t own.',
    'Use tools like ResponderGuard or SIEM rules to alert on known Responder signatures.',
    'Network traffic analysis: check for frequent SMB/HTTP negotiation attempts from a single source.',
    'Watch for a single host answering LLMNR/NBT-NS queries for many different, unrelated hostnames — a strong poisoning indicator.',
    'Enable Windows Event ID 4624/4625 auditing and correlate logon source IPs against known asset inventory.'
  ],
  mitigation: [
    'Disable LLMNR and NBT-NS via Group Policy (Computer Configuration → Administrative Templates → Network → DNS Client → Turn off multicast name resolution; disable NetBIOS over TCP/IP on each adapter).',
    'Enforce SMB signing on all clients and servers (prevents relay attacks from succeeding even if a hash is captured/relayed).',
    'Use strong, long passwords (makes offline cracking of captured hashes impractical).',
    'Implement network segmentation to limit how far a single poisoning host can reach.',
    'Monitor for suspicious WPAD traffic and disable WPAD entirely if it isn\'t used (via GPO or DHCP option 252).',
    'Prefer Kerberos over NTLM where possible, and disable NTLM outright via GPO where feasible.',
    'Enable LDAP signing and channel binding to close the LDAP relay path used for RBCD attacks.'
  ]
}

// ─── COPY BUTTON ───
function CopyBtn({
  id,
  text,
  state,
  onCopy
}: {
  id: string
  text: string
  state: 'idle' | 'copied' | 'failed'
  onCopy: (id: string, text: string) => void
}) {
  const handleClick = useCallback(() => {
    onCopy(id, text)
  }, [id, text, onCopy])

  const label = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`text-xs transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-white/5 ${
        state === 'copied'
          ? 'text-emerald-400'
          : state === 'failed'
          ? 'text-red-400'
          : 'text-white/40 hover:text-white/70'
      }`}
      aria-label={label}
    >
      {state === 'copied' && <CheckCircle size={12} className="text-emerald-400" />}
      {state === 'failed' && <AlertTriangle size={12} className="text-red-400" />}
      {state === 'idle' && <Copy size={12} />}
      {label}
    </button>
  )
}

// ─── PANEL COMPONENTS ───

function OverviewPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-semibold text-lg mb-2 text-red-400">What is Responder?</h2>
        <p className="text-white/50 leading-relaxed">
          Responder is a powerful tool that poisons LLMNR, NBT-NS, and MDNS requests on a network.
          When Windows machines can't resolve a hostname via DNS, they fall back to these protocols.
          Responder answers those requests and captures NTLM hashes (or relays them).
        </p>
        <p className="text-white/50 leading-relaxed mt-2">
          It also ships with built-in fake servers for SMB, HTTP, HTTPS, SQL Server, FTP, LDAP, DNS, and more —
          so any protocol that can be tricked into authenticating gets a rogue endpoint ready to catch it.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
            <Zap size={16} /> Why It's Powerful
          </h3>
          <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
            <li>Works by default on most Windows networks — LLMNR/NBT-NS are enabled out of the box</li>
            <li>Captures password hashes without any user interaction beyond a mistyped share name</li>
            <li>Can relay authentication to other services for immediate access, not just cracking</li>
            <li>Very effective in internal assessments, often yielding domain admin within hours</li>
          </ul>
        </div>
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
            <AlertTriangle size={16} /> Why It's Dangerous
          </h3>
          <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
            <li>Can break legitimate network functionality if it answers for real hosts</li>
            <li>Easy to detect with proper monitoring — it's noisy by design</li>
            <li>Relaying can lead to full domain compromise in a single session</li>
            <li>Requires deep understanding of Windows name resolution to use safely and scope correctly</li>
          </ul>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <h3 className="text-white font-semibold mb-2">How Professionals Use It</h3>
        <div className="text-sm text-white/50">
          On an authorized internal penetration test or red team engagement, Responder is typically run
          early during the "internal foothold" phase, right after gaining access to the network segment.
          It's paired with Impacket's <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">ntlmrelayx.py</code> for
          relay attacks, and with Hashcat or John the Ripper for offline cracking of anything that isn't relayed.
          Scope, timing, and rules of engagement are agreed with the client beforehand, since poisoning affects
          any host on the broadcast segment, not just intended targets.
        </div>
      </div>

      <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <h3 className="text-white font-semibold mb-2">Limitations</h3>
        <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
          <li>Only effective on the local broadcast segment — doesn't cross routed subnets without help (e.g. relaying through a pivot)</li>
          <li>Useless against hosts with LLMNR/NBT-NS disabled or SMB signing enforced</li>
          <li>NTLMv2 hashes are far harder to crack than NTLMv1 — captured hashes aren't a guaranteed win</li>
          <li>Highly visible on networks with baseline monitoring in place</li>
        </ul>
      </div>

      <div className="p-4 rounded-xl border border-red-500/20 flex gap-3" style={{ background: 'rgba(239,68,68,0.06)' }}>
        <Lightbulb className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-white/50">
          <strong className="text-white/70">Pro Tip:</strong> Combine Responder with <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">ntlmrelayx.py</code> for advanced relay attacks. Always test in a controlled lab environment first, and confirm scope/authorization in writing before running it anywhere else.
        </div>
      </div>
    </div>
  )
}

function HowItWorksPanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-white font-semibold text-lg text-red-400">How Responder Works</h2>

      <div className="space-y-4">
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <span className="bg-red-500/20 px-2 py-0.5 rounded text-xs text-red-400">Step 1</span>
            Name Resolution Poisoning
          </h3>
          <p className="text-sm text-white/50">
            When a Windows machine tries to access a file share (e.g., <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400">\\fileserver</code>), it first asks DNS.
            If DNS fails — a typo, a decommissioned host, a stale cache entry — it falls back to <strong className="text-white/70">LLMNR</strong> and <strong className="text-white/70">NBT-NS</strong>,
            which are broadcast/multicast protocols with no authentication of the responder.
            Responder listens on the segment and answers these requests pretending to be the target.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <span className="bg-red-500/20 px-2 py-0.5 rounded text-xs text-red-400">Step 2</span>
            NTLM Authentication Capture
          </h3>
          <p className="text-sm text-white/50">
            The victim machine believes it found the real host and tries to authenticate to Responder using NTLM.
            Responder's fake SMB/HTTP server completes the NTLM challenge-response handshake and captures the
            NTLMv2 hash, which can later be cracked offline with Hashcat or John the Ripper.
          </p>
          <div className="mt-2 bg-black/60 rounded-lg p-2 font-mono text-xs text-emerald-400 flex items-center justify-between">
            <span>Successfully captured NTLMv2 hash for user: DOMAIN\jdoe</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <span className="bg-red-500/20 px-2 py-0.5 rounded text-xs text-red-400">Step 3</span>
            Relay Attacks (Advanced)
          </h3>
          <p className="text-sm text-white/50">
            Instead of just capturing hashes, Responder can forward (relay) the authentication attempt in real time
            to another service the victim has access to (like SMB, LDAP, or HTTP) using a tool like
            <code className="bg-white/5 px-1.5 py-0.5 rounded text-emerald-400"> ntlmrelayx.py</code>.
            This skips cracking entirely and can lead directly to privilege escalation or lateral movement.
          </p>
          <div className="mt-2 text-xs text-white/30">
            <span className="text-red-400">Warning:</span> Relaying to LDAP can modify domain objects (e.g. RBCD attacks) — this is an active change to the target environment, not passive capture.
          </div>
        </div>

        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <span className="bg-red-500/20 px-2 py-0.5 rounded text-xs text-red-400">Step 4</span>
            Why Signing Matters
          </h3>
          <p className="text-sm text-white/50">
            Relay attacks only work when the target service doesn't enforce message signing. SMB signing (and LDAP
            signing/channel binding) validates that each message came from the party that completed the handshake —
            a relayed session fails that check. This is the single most effective mitigation against relay, even
            though it doesn't stop hash capture itself.
          </p>
        </div>
      </div>
    </div>
  )
}

function CommandsPanel({
  copiedStates,
  onCopy,
  filter,
  setFilter,
}: {
  copiedStates: Record<string, 'idle' | 'copied' | 'failed'>
  onCopy: (id: string, text: string) => void
  filter: string
  setFilter: (v: string) => void
}) {
  const filtered = commandExamples.filter(item => {
    const q = filter.trim().toLowerCase()
    if (!q) return true
    return item.title.toLowerCase().includes(q) || item.cmd.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q)
  })
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-white font-semibold text-lg text-red-400">Useful Responder Commands</h2>
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter commands…"
            className="pl-8 pr-3 py-2 w-44 bg-black/30 border border-white/10 rounded-xl text-xs text-white/80 focus:outline-none focus:border-red-500/40"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-sm text-white/40 py-6 text-center">No commands match that filter.</div>
        )}
        {filtered.map((item) => (
          <div key={item.id} className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="text-white font-semibold mb-1">{item.title}</div>
            <div className="flex items-center justify-between bg-black/60 rounded-lg p-3 font-mono text-sm gap-2 flex-wrap">
              <span className="text-emerald-400 break-all">{item.cmd}</span>
              <CopyBtn
                id={item.id}
                text={item.cmd}
                state={copiedStates[item.id] || 'idle'}
                onCopy={onCopy}
              />
            </div>
            <div className="text-xs text-white/30 mt-2">{item.desc}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-xl border border-red-500/20 flex gap-3" style={{ background: 'rgba(239,68,68,0.06)' }}>
        <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-white/50">
          <strong className="text-white/70">Caution:</strong> Running Responder without careful planning can cause network disruptions. Always use <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">-w</code> (WPAD) carefully, and confirm you're on an interface scoped to the authorized target segment before starting.
        </div>
      </div>
    </div>
  )
}

function ScenariosPanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-white font-semibold text-lg text-red-400">Common Attack Scenarios</h2>

      <div className="space-y-4">
        {scenarios.map((scenario, index) => (
          <div key={scenario.id} className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <h3 className="text-white font-semibold flex items-center gap-2">
              <span className="bg-red-500/20 px-2 py-0.5 rounded text-xs text-red-400">Scenario {index + 1}</span>
              {scenario.title}
            </h3>
            <p className="text-sm text-white/50 mt-2">{scenario.desc}</p>
          </div>
        ))}
      </div>

      <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <h3 className="text-white font-semibold flex items-center gap-2">
          <CheckCircle size={16} className="text-red-400" /> Best Practices
        </h3>
        <ul className="text-sm text-white/50 space-y-1 list-disc pl-5 mt-2">
          <li>Always start with <strong className="text-white/70">-A</strong> or <strong className="text-white/70">-w -d -v</strong> to understand the network before poisoning aggressively</li>
          <li>Limit the scope to avoid collateral damage on hosts outside the engagement</li>
          <li>Log all outputs for later review and for the final report's evidence trail</li>
          <li>Stop immediately if you see signs of detection or unexpected impact on legitimate traffic</li>
          <li>Get explicit written authorization and a defined time window before running any poisoning attack</li>
        </ul>
      </div>
    </div>
  )
}

function DefensePanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-white font-semibold text-lg text-red-400">Detection & Defense</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <Eye size={16} className="text-red-400" /> How Defenders Detect Responder
          </h3>
          <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
            {defenseDetails.detection.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <Lock size={16} className="text-red-400" /> How to Defend Against It
          </h3>
          <ul className="text-sm space-y-1.5 text-white/50 list-disc pl-5">
            {defenseDetails.mitigation.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Shield size={16} className="text-red-400" /> Recommended Tools for Detection
        </h3>
        <ul className="text-sm text-white/50 space-y-1 list-disc pl-5 mt-2">
          <li><strong className="text-white/70">ResponderGuard</strong> – Open-source tool to actively probe hosts and detect LLMNR/NBT-NS poisoning on a segment</li>
          <li><strong className="text-white/70">SIEM alerts</strong> – Custom rules for suspicious NTLM traffic and repeated authentication failures from one source</li>
          <li><strong className="text-white/70">Network monitoring</strong> – Check for unexpected WPAD requests and a single host answering for many hostnames</li>
          <li><strong className="text-white/70">Wireshark</strong> – Filter on <code className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400">llmnr || nbns</code> to look for malicious responses</li>
        </ul>
      </div>
    </div>
  )
}

function RelayPanel({
  copiedStates,
  onCopy,
}: {
  copiedStates: Record<string, 'idle' | 'copied' | 'failed'>
  onCopy: (id: string, text: string) => void
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-white font-semibold text-lg text-red-400">Relay Lab Notes</h2>
      <p className="text-sm text-white/50">
        Capture and relay are different skills. Practice only on domains and segments you own or have written authorization for.
        Disable overlapping Responder servers when ntlmrelayx needs the same ports.
      </p>
      <div className="space-y-3">
        {relayLabNotes.map(item => (
          <div key={item.id} className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="text-white font-semibold mb-1">{item.title}</div>
            <div className="flex items-center justify-between bg-black/60 rounded-lg p-3 font-mono text-sm gap-2 flex-wrap">
              <span className="text-emerald-400 break-all">{item.cmd}</span>
              <CopyBtn id={item.id} text={item.cmd} state={copiedStates[item.id] || 'idle'} onCopy={onCopy} />
            </div>
            <div className="text-xs text-white/30 mt-2">{item.desc}</div>
          </div>
        ))}
      </div>
      <div className="p-4 rounded-xl border border-red-500/20 flex gap-3" style={{ background: 'rgba(239,68,68,0.06)' }}>
        <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-white/50">
          <strong className="text-white/70">Lab order:</strong> analyze mode → short poison capture → offline crack attempt → only then try relay against a signing-disabled lab host.
        </div>
      </div>
    </div>
  )
}

function ChecklistPanel({
  checklist,
  setChecklist,
}: {
  checklist: Record<string, boolean>
  setChecklist: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
}) {
  const done = checklistItems.filter(i => checklist[i.id]).length
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-white font-semibold text-lg text-red-400 flex items-center gap-2">
          <ListChecks size={18} /> Lab Checklist
        </h2>
        <span className="text-sm text-white/40">{done}/{checklistItems.length} complete</span>
      </div>
      <p className="text-sm text-white/50">Hands-on progress for authorized lab segments only. Saved in this browser.</p>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-red-500 transition-all" style={{ width: `${(done / Math.max(1, checklistItems.length)) * 100}%` }} />
      </div>
      <div className="space-y-2">
        {checklistItems.map(item => {
          const on = !!checklist[item.id]
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setChecklist(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
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
          Checklist complete — rotate lab snapshots and re-run so the flow stays mechanical.
        </div>
      )}
      <button type="button" onClick={() => setChecklist({})} className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1.5">
        <RotateCcw size={12} /> Reset checklist
      </button>
    </div>
  )
}

// ─── MAIN COMPONENT ───
export default function ResponderCoach() {
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
    try { localStorage.setItem(STORAGE_CHECKLIST, JSON.stringify(checklist)) } catch {}
  }, [checklist])
  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarOpen])

  const checklistDone = checklistItems.filter(i => checklist[i.id]).length

  // ─────────────────────────────────────────────────────────────────────────────
  // Clipboard copy with fallback for HTTP/non-secure contexts
  // ─────────────────────────────────────────────────────────────────────────────

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch (err) {
        console.error('Clipboard write failed:', err)
      }
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
    } catch (err) {
      console.error('Clipboard fallback failed:', err)
      return false
    }
  }, [])

  const handleCopy = useCallback(async (id: string, text: string) => {
    const ok = await copyToClipboard(text)
    setCopiedStates(prev => ({ ...prev, [id]: ok ? 'copied' : 'failed' }))
    const prevT = copyTimers.current.get(id)
    if (prevT) clearTimeout(prevT)
    const t = setTimeout(() => {
      setCopiedStates(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      copyTimers.current.delete(id)
    }, 2000)
    copyTimers.current.set(id, t)
  }, [copyToClipboard])

  // ─────────────────────────────────────────────────────────────────────────────
  // Keyboard navigation
  // ─────────────────────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent, tabId: Tab) => {
    const currentIndex = tabs.findIndex(t => t.id === tabId)
    let newIndex = currentIndex

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      newIndex = (currentIndex + 1) % tabs.length
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      newIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      newIndex = tabs.length - 1
    } else {
      return
    }

    setActiveTab(tabs[newIndex].id)
    const target = e.target as HTMLElement
    const inTablist = target.closest('[role="tablist"]')
    if (inTablist) {
      document.getElementById(`tab-${tabs[newIndex].id}`)?.focus()
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // Render the active panel
  // ─────────────────────────────────────────────────────────────────────────────

  const panelContent = useMemo(() => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPanel />
      case 'howitworks':
        return <HowItWorksPanel />
      case 'commands':
        return <CommandsPanel copiedStates={copiedStates} onCopy={handleCopy} filter={cmdFilter} setFilter={setCmdFilter} />
      case 'relay':
        return <RelayPanel copiedStates={copiedStates} onCopy={handleCopy} />
      case 'scenarios':
        return <ScenariosPanel />
      case 'defense':
        return <DefensePanel />
      case 'checklist':
        return <ChecklistPanel checklist={checklist} setChecklist={setChecklist} />
      default:
        return null
    }
  }, [activeTab, copiedStates, handleCopy, cmdFilter, checklist])

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      <div className="max-w-6xl mx-auto p-6">
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ 
              background: 'radial-gradient(circle, rgba(239,68,68,0.2), rgba(239,68,68,0.05))', 
              border: '1px solid rgba(239,68,68,0.15)' 
            }}>
              <BookOpen size={18} className="text-red-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">SIREN</h1>
              <p className="text-white/40 text-xs">LLMNR/NBT-NS poisoning — capture, relay, and defend</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/30">
              <Shield size={14} className="text-red-400" />
              <span>lab guide · {checklistDone}/{checklistItems.length}</span>
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

        {/* ── Warning Banner ── */}
        <div className="rounded-2xl border border-red-500/30 p-4 flex gap-3 mb-4" style={{ background: 'rgba(239,68,68,0.08)' }}>
          <AlertTriangle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
          <div className="text-sm text-red-200/80">
            <strong>Lab only:</strong> Responder poisons name resolution on the local segment and is noisy.
            Use on authorized assessments or isolated labs you own. Misuse outside scope has serious consequences.
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
                  onClick={() => { setActiveTab(tab.id); setSidebarOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                    activeTab === tab.id ? 'bg-red-500 text-white' : 'text-white/50 hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} /> {tab.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Tabs ── */}
        <div
          className="hidden lg:flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6 overflow-x-auto"
          role="tablist"
        >
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => { setActiveTab(tab.id); setSidebarOpen(false) }}
                onKeyDown={(e) => handleKeyDown(e, tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-red-500 text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* ── Content ── */}
        <div
          className="rounded-2xl border border-white/10 p-6" 
          style={{ background: 'rgba(255,255,255,0.03)' }}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          id={`panel-${activeTab}`}
        >
          {panelContent}
        </div>
      </div>
    </div>
  )
}