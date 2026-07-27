'use client'

// src/components/coach/ResponderCoach.tsx
import { useState, useCallback, useMemo } from 'react'
import {
  BookOpen, Terminal, AlertTriangle, Target, Copy, Shield,
  Zap, CheckCircle, Lock, Eye, Lightbulb
} from 'lucide-react'

type Tab = 'overview' | 'howitworks' | 'commands' | 'scenarios' | 'defense'

// ─── STATIC DATA (moved outside component) ───
const tabs: ReadonlyArray<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'howitworks', label: 'How It Works', icon: Target },
  { id: 'commands', label: 'Useful Commands', icon: Terminal },
  { id: 'scenarios', label: 'Attack Scenarios', icon: Shield },
  { id: 'defense', label: 'Detection & Defense', icon: AlertTriangle },
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

const defenseDetails = {
  detection: [
    'Monitor for unexpected LLMNR/NBT-NS responses – any response to a non-existent host is suspicious.',
    'Look for WPAD poisoning attempts – multiple WPAD requests from different sources in a short time.',
    'Detect unusual NTLM authentication patterns – especially from non-domain joined systems or systems answering for names they don\u2019t own.',
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
    'Monitor for suspicious WPAD traffic and disable WPAD entirely if it isn\u2019t used (via GPO or DHCP option 252).',
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
      onClick={handleClick}
      className={`text-xs transition-colors flex items-center gap-1 ${
        state === 'copied'
          ? 'text-ghost-green'
          : state === 'failed'
          ? 'text-red-400'
          : 'text-ghost-text-dim hover:text-ghost-green'
      }`}
      aria-label={label}
    >
      {state === 'copied' && <CheckCircle size={12} className="text-ghost-green" />}
      {state === 'failed' && <AlertTriangle size={12} className="text-red-400" />}
      {state === 'idle' && <Copy size={12} />}
      {label}
    </button>
  )
}

// ─── PANEL COMPONENTS (extracted for performance and clarity) ───

function OverviewPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2 text-red-400">What is Responder?</h2>
        <p className="text-ghost-text-dim leading-relaxed">
          Responder is a powerful tool that poisons LLMNR, NBT-NS, and MDNS requests on a network.
          When Windows machines can't resolve a hostname via DNS, they fall back to these protocols.
          Responder answers those requests and captures NTLM hashes (or relays them).
        </p>
        <p className="text-ghost-text-dim leading-relaxed mt-2">
          It also ships with built-in fake servers for SMB, HTTP, HTTPS, SQL Server, FTP, LDAP, DNS, and more —
          so any protocol that can be tricked into authenticating gets a rogue endpoint ready to catch it.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-red-400 mb-2 flex items-center gap-2">
            <Zap size={16} /> Why It's Powerful
          </h3>
          <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
            <li>Works by default on most Windows networks — LLMNR/NBT-NS are enabled out of the box</li>
            <li>Captures password hashes without any user interaction beyond a mistyped share name</li>
            <li>Can relay authentication to other services for immediate access, not just cracking</li>
            <li>Very effective in internal assessments, often yielding domain admin within hours</li>
          </ul>
        </div>
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-red-400 mb-2 flex items-center gap-2">
            <AlertTriangle size={16} /> Why It's Dangerous
          </h3>
          <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
            <li>Can break legitimate network functionality if it answers for real hosts</li>
            <li>Easy to detect with proper monitoring — it's noisy by design</li>
            <li>Relaying can lead to full domain compromise in a single session</li>
            <li>Requires deep understanding of Windows name resolution to use safely and scope correctly</li>
          </ul>
        </div>
      </div>

      <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
        <h3 className="font-semibold text-ghost-text mb-2">How Professionals Use It</h3>
        <div className="text-sm text-ghost-text-dim">
          On an authorized internal penetration test or red team engagement, Responder is typically run
          early during the "internal foothold" phase, right after gaining access to the network segment.
          It's paired with Impacket's <code className="bg-white/10 px-1.5 py-0.5 rounded text-ghost-green">ntlmrelayx.py</code> for
          relay attacks, and with Hashcat or John the Ripper for offline cracking of anything that isn't relayed.
          Scope, timing, and rules of engagement are agreed with the client beforehand, since poisoning affects
          any host on the broadcast segment, not just intended targets.
        </div>
      </div>

      <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
        <h3 className="font-semibold text-ghost-text mb-2">Limitations</h3>
        <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
          <li>Only effective on the local broadcast segment — doesn't cross routed subnets without help (e.g. relaying through a pivot)</li>
          <li>Useless against hosts with LLMNR/NBT-NS disabled or SMB signing enforced</li>
          <li>NTLMv2 hashes are far harder to crack than NTLMv1 — captured hashes aren't a guaranteed win</li>
          <li>Highly visible on networks with baseline monitoring in place</li>
        </ul>
      </div>

      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3">
        <Lightbulb className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-ghost-text-dim">
          <strong className="text-ghost-text">Pro Tip:</strong> Combine Responder with <code className="bg-white/10 px-1.5 py-0.5 rounded text-ghost-green">ntlmrelayx.py</code> for advanced relay attacks. Always test in a controlled lab environment first, and confirm scope/authorization in writing before running it anywhere else.
        </div>
      </div>
    </div>
  )
}

function HowItWorksPanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-red-400">How Responder Works</h2>

      <div className="space-y-4">
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
            <span className="bg-red-500/20 px-2 py-0.5 rounded text-xs text-red-400">Step 1</span>
            Name Resolution Poisoning
          </h3>
          <p className="text-sm text-ghost-text-dim">
            When a Windows machine tries to access a file share (e.g., <code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green">\\fileserver</code>), it first asks DNS.
            If DNS fails — a typo, a decommissioned host, a stale cache entry — it falls back to <strong>LLMNR</strong> and <strong>NBT-NS</strong>,
            which are broadcast/multicast protocols with no authentication of the responder.
            Responder listens on the segment and answers these requests pretending to be the target.
          </p>
        </div>

        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
            <span className="bg-red-500/20 px-2 py-0.5 rounded text-xs text-red-400">Step 2</span>
            NTLM Authentication Capture
          </h3>
          <p className="text-sm text-ghost-text-dim">
            The victim machine believes it found the real host and tries to authenticate to Responder using NTLM.
            Responder's fake SMB/HTTP server completes the NTLM challenge-response handshake and captures the
            NTLMv2 hash, which can later be cracked offline with Hashcat or John the Ripper.
          </p>
          <div className="mt-2 bg-black/60 rounded-lg p-2 font-mono text-xs text-ghost-green flex items-center justify-between">
            <span>Successfully captured NTLMv2 hash for user: DOMAIN\jdoe</span>
          </div>
        </div>

        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
            <span className="bg-red-500/20 px-2 py-0.5 rounded text-xs text-red-400">Step 3</span>
            Relay Attacks (Advanced)
          </h3>
          <p className="text-sm text-ghost-text-dim">
            Instead of just capturing hashes, Responder can forward (relay) the authentication attempt in real time
            to another service the victim has access to (like SMB, LDAP, or HTTP) using a tool like
            <code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green"> ntlmrelayx.py</code>.
            This skips cracking entirely and can lead directly to privilege escalation or lateral movement.
          </p>
          <div className="mt-2 text-xs text-ghost-text-dim">
            <span className="text-red-400">Warning:</span> Relaying to LDAP can modify domain objects (e.g. RBCD attacks) — this is an active change to the target environment, not passive capture.
          </div>
        </div>

        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
            <span className="bg-red-500/20 px-2 py-0.5 rounded text-xs text-red-400">Step 4</span>
            Why Signing Matters
          </h3>
          <p className="text-sm text-ghost-text-dim">
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
  onCopy
}: {
  copiedStates: Record<string, 'idle' | 'copied' | 'failed'>
  onCopy: (id: string, text: string) => void
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-red-400 mb-4">Useful Responder Commands</h2>

      <div className="space-y-3">
        {commandExamples.map((item) => (
          <div key={item.id} className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
            <div className="font-semibold text-ghost-text mb-1">{item.title}</div>
            <div className="flex items-center justify-between bg-black/60 rounded-lg p-3 font-mono text-sm gap-2 flex-wrap">
              <span className="text-ghost-green break-all">{item.cmd}</span>
              <CopyBtn
                id={item.id}
                text={item.cmd}
                state={copiedStates[item.id] || 'idle'}
                onCopy={onCopy}
              />
            </div>
            <div className="text-xs text-ghost-text-dim mt-2">{item.desc}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex gap-3">
        <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
        <div className="text-sm text-ghost-text-dim">
          <strong className="text-ghost-text">Caution:</strong> Running Responder without careful planning can cause network disruptions. Always use <code className="bg-white/10 px-1.5 py-0.5 rounded text-ghost-green">-w</code> (WPAD) carefully, and confirm you're on an interface scoped to the authorized target segment before starting.
        </div>
      </div>
    </div>
  )
}

function ScenariosPanel() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-red-400">Common Attack Scenarios</h2>

      <div className="space-y-4">
        {scenarios.map((scenario, index) => (
          <div key={scenario.id} className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
            <h3 className="font-semibold text-ghost-text flex items-center gap-2">
              <span className="bg-red-500/20 px-2 py-0.5 rounded text-xs text-red-400">Scenario {index + 1}</span>
              {scenario.title}
            </h3>
            <p className="text-sm text-ghost-text-dim mt-2">{scenario.desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
        <h3 className="font-semibold flex items-center gap-2">
          <CheckCircle size={16} className="text-red-400" /> Best Practices
        </h3>
        <ul className="text-sm text-ghost-text-dim space-y-1 list-disc pl-5 mt-2">
          <li>Always start with <strong className="text-ghost-text">-A</strong> or <strong className="text-ghost-text">-w -d -v</strong> to understand the network before poisoning aggressively</li>
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
      <h2 className="text-lg font-semibold text-red-400">Detection & Defense</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
            <Eye size={16} className="text-red-400" /> How Defenders Detect Responder
          </h3>
          <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
            {defenseDetails.detection.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
          <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
            <Lock size={16} className="text-red-400" /> How to Defend Against It
          </h3>
          <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
            {defenseDetails.mitigation.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
        <h3 className="font-semibold flex items-center gap-2">
          <Shield size={16} className="text-red-400" /> Recommended Tools for Detection
        </h3>
        <ul className="text-sm text-ghost-text-dim space-y-1 list-disc pl-5 mt-2">
          <li><strong>ResponderGuard</strong> – Open-source tool to actively probe hosts and detect LLMNR/NBT-NS poisoning on a segment</li>
          <li><strong>SIEM alerts</strong> – Custom rules for suspicious NTLM traffic and repeated authentication failures from one source</li>
          <li><strong>Network monitoring</strong> – Check for unexpected WPAD requests and a single host answering for many hostnames</li>
          <li><strong>Wireshark</strong> – Filter on <code className="bg-white/10 px-1.5 py-0.5 rounded text-ghost-green">llmnr || nbns</code> to look for malicious responses</li>
        </ul>
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───
export default function ResponderCoach() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [copiedStates, setCopiedStates] = useState<Record<string, 'idle' | 'copied' | 'failed'>>({})

  // ─────────────────────────────────────────────────────────────────────────────
  // Clipboard copy with fallback for HTTP/non-secure contexts
  // ─────────────────────────────────────────────────────────────────────────────

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    // Modern path — secure contexts (HTTPS or localhost)
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch (err) {
        console.error('Clipboard write failed:', err)
        // Fall through to fallback rather than failing outright
      }
    }

    // Fallback for non-secure contexts (HTTP LAN deployments, old browsers)
    // The textarea + execCommand path still works in those environments
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
    // Reset after 2 seconds regardless of success/failure
    setTimeout(() => {
      setCopiedStates(prev => {
        // Only reset if the state hasn't changed in the meantime
        if (prev[id] === 'idle') return prev
        const next = { ...prev }
        delete next[id]
        return next
      })
    }, 2000)
  }, [copyToClipboard])

  // ─────────────────────────────────────────────────────────────────────────────
  // Keyboard navigation — only moves focus if user is navigating within tablist
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

    // Only focus the new tab if the user was actually navigating within the tablist
    const target = e.target as HTMLElement
    const inTablist = target.closest('[role="tablist"]')
    if (inTablist) {
      document.getElementById(`tab-${tabs[newIndex].id}`)?.focus()
    }
  }, [])

  // ─────────────────────────────────────────────────────────────────────────────
  // Render the active panel (memoized based on activeTab and copiedStates)
  // ─────────────────────────────────────────────────────────────────────────────

  const panelContent = useMemo(() => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPanel />
      case 'howitworks':
        return <HowItWorksPanel />
      case 'commands':
        return <CommandsPanel copiedStates={copiedStates} onCopy={handleCopy} />
      case 'scenarios':
        return <ScenariosPanel />
      case 'defense':
        return <DefensePanel />
      default:
        return null
    }
  }, [activeTab, copiedStates, handleCopy])

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <BookOpen className="text-red-400" size={28} />
            <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
              Responder Coach
            </span>
          </h1>
          <p className="text-ghost-text-dim text-sm mt-1">
            Understand one of the most powerful (and dangerous) tools in internal network pentesting.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ghost-text-dim">
          <Shield size={14} className="text-red-400" />
          <span>Updated for v1.0</span>
        </div>
      </div>

      {/* Warning Banner */}
      <div className="ghost-panel rounded-xl border border-red-500/30 bg-red-950/20 p-4 flex gap-3">
        <AlertTriangle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
        <div className="text-sm text-red-200">
          <strong>Warning:</strong> Responder is extremely powerful. It can break network authentication and is easily detected.
          Only use it in authorized engagements. Misuse can have serious consequences.
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex border-b border-ghost-border overflow-x-auto scrollbar-hide"
        role="tablist"
      >
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          const tabId = `tab-${tab.id}`

          return (
            <button
              key={tab.id}
              id={tabId}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-red-500 text-ghost-text'
                  : 'border-transparent text-ghost-text-dim hover:text-ghost-text'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div
        className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-6"
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        id={`panel-${activeTab}`}
      >
        {panelContent}
      </div>
    </div>
  )
}