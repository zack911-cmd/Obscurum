// config.ts
import type { OllamaChatOptions } from '../../lib/ollama'
import { MODELS } from './MODELS'

export const MODEL_LIST = Object.values(MODELS)

/**
 * Per-model tuning — temperature/sampling only.
 *
 * Token limits (`num_ctx` / `num_predict`) are NOT set here. They live in
 * `ModelManager.getModelLimits()` and are the single source of truth.
 * `ChatWindow.send()` applies them after this returns. Any `num_ctx` or
 * `num_predict` previously living here was dead code — the overwrite in
 * `send()` always happened last.
 *
 * If you're adding per-model defaults here, make sure they're sampling
 * params (temperature, top_p, top_k, repeat_penalty, keep_alive) — those
 * are the only ones that aren't overwritten downstream.
 */
export function getModelOptions(model: string, uncensored: boolean): OllamaChatOptions {
  const isCoder = model === MODELS.coder
  const isReasoner = model === MODELS.reasoner
  const isOfflineCoder = model === MODELS['Offline, Coder']
  const isVision = model === MODELS.vision

  // Minimax M3 is the primary coder model — matched by substring so a
  // tag like `minimax-m3:q4_K_M` from ModelManager also routes here.
  const isMinimax = model.includes('minimax') || isCoder

  let baseTemp = uncensored ? 0.9 : 0.75

  if (isMinimax || isCoder) {
    return {
      temperature: baseTemp,
      top_p: uncensored ? 0.99 : 0.95,
      top_k: 50,
      repeat_penalty: 1.02,
      keep_alive: '15m',
    }
  }

  if (isReasoner) {
    return {
      temperature: uncensored ? 0.95 : 0.8,
      top_p: uncensored ? 0.99 : 0.92,
      top_k: 60,
      repeat_penalty: 1.0,
      keep_alive: '15m',
    }
  }

  if (isOfflineCoder) {
    return {
      temperature: uncensored ? 0.85 : 0.7,
      top_p: uncensored ? 0.98 : 0.93,
      top_k: 50,
      repeat_penalty: 1.05,
      keep_alive: '15m',
    }
  }

  if (isVision) {
    return {
      temperature: uncensored ? 0.85 : 0.7,
      top_p: uncensored ? 0.98 : 0.93,
      top_k: 50,
      repeat_penalty: 1.05,
      keep_alive: '15m',
    }
  }

  // Fallback for any other model
  return {
    temperature: uncensored ? 0.9 : 0.75,
    top_p: uncensored ? 0.95 : 0.9,
    top_k: 50,
    repeat_penalty: 1.0,
    keep_alive: '15m',
  }
}

/**
 * Trim history intelligently based on model capabilities.
 *
 * Keeps the most recent N messages while staying under a rough token
 * budget. Token estimate is `chars/4 + 10` per message — accurate enough
 * for English/code, off by 2-3x for non-Latin scripts, but that's a
 * safe direction (over-trims rather than overflows).
 */
export function trimHistory<T extends { role: string; content: string }>(
  history: T[],
  model: string,
  maxMessages = 25,
): T[] {
  const MIN_KEEP = 12

  let maxAllowed = maxMessages
  let maxEstimatedTokens = 20000

  const isMinimax = model.includes('minimax') || model === MODELS.coder

  if (isMinimax || model === MODELS.coder) {
    maxAllowed = 35
    maxEstimatedTokens = 30000
  } else if (model === MODELS.reasoner) {
    maxAllowed = 20
    maxEstimatedTokens = 20000
  } else if (model === MODELS['Offline, Coder']) {
    maxAllowed = 30
    maxEstimatedTokens = 30000
  } else if (model === MODELS.vision) {
    maxAllowed = 15
    maxEstimatedTokens = 15000
  }

  if (history.length <= MIN_KEEP) return history
  if (history.length <= maxAllowed) return history

  let totalTokens = 0
  for (const msg of history) {
    totalTokens += Math.ceil(msg.content.length / 4) + 10
  }

  if (totalTokens <= maxEstimatedTokens) return history

  // Walk from the end forward, keeping as many recent messages as fit.
  // Bug fix from the previous version: it used `break` on overflow which
  // could leave `tokens` undercounted, then `Math.ceil(tokens / 200)` as
  // a message count which is just wrong (200 was meant to be messages,
  // not tokens-per-message). Now: keep a real running count and slice.
  let tokens = 0
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]
    const msgTokens = Math.ceil(msg.content.length / 4) + 10
    if (tokens + msgTokens > maxEstimatedTokens && (history.length - i) > MIN_KEEP) break
    tokens += msgTokens
  }

  // Keep at least MIN_KEEP messages, at most maxAllowed.
  const keepCount = Math.min(history.length, Math.max(MIN_KEEP, maxAllowed))
  return history.slice(-keepCount)
}

// Keywords for model routing
const EXPLOIT_KW = [
  'exploit', 'payload', 'reverse shell', 'bind shell', 'shellcode', 'msfvenom',
  'meterpreter', 'stager', 'loader', 'inject', 'bypass', 'amsi', 'etw',
  'rubber ducky', 'bash bunny', 'flipper zero', 'hid', 'ducky script',
  'cve', '0day', 'buffer overflow', 'heap overflow', 'use after free',
  'privilege escalation', 'priv esc', 'lpe', 'rce', 'code execution',
  'exploit-db', 'metasploit module', 'payload generator', 'shellcode encoder',
]

const CODE_KW = [
  'code', 'script', 'python', 'bash', 'powershell', 'write', 'generate',
  'function', 'refactor', 'react', 'typescript', 'snippet', 'c ', 'golang',
  'rust', 'perl', 'ruby', 'php', 'one-liner', 'compile', 'debug',
  'program', 'algorithm', 'data structure', 'api', 'endpoint', 'database',
  'sql', 'query', 'automate', 'tool', 'utility', 'module', 'library',
  'class', 'object', 'inheritance', 'interface', 'generic', 'async', 'await',
  'promise', 'callback', 'decorator', 'annotation', 'macro',
]

const LINUX_KW = [
  'linux', 'kali', 'suid', 'sudo', 'cron', 'kernel', 'linpeas', 'pspy',
  'gtfobins', 'capabilities', 'docker escape', '/etc/passwd', 'shadow',
  'nmap', 'gobuster', 'ffuf', 'hydra', 'sqlmap', 'nikto', 'enum4linux',
  'impacket', 'metasploit', 'responder', 'bloodhound', 'crackmapexec',
  'netcat', 'socat', 'ssh', 'scp', 'rsync', 'systemctl', 'service',
  'process', 'memory', 'cpu', 'network', 'firewall', 'iptables',
  'ufw', 'apparmor', 'selinux', 'auditd', 'systemd', 'init.d',
  'proc', 'sysfs', 'dev', 'mount', 'umount', 'fstab', 'grub',
]

const REASON_KW = [
  'cve', 'vulnerability', 'analyze', 'attack', 'methodology', 'report',
  'explain', 'why', 'how does', 'impact', 'risk', 'privilege escalation',
  'lateral', 'summarize', 'technique', 'tactic', 'pentest', 'reconnaissance',
  'enumeration', 'post-exploitation', 'pivoting', 'priv esc', 'hardware security',
  'architecture', 'design', 'pattern', 'best practice', 'compliance',
  'strategy', 'approach', 'philosophy', 'principle', 'framework',
  'mitre', 'att&ck', 'kill chain', 'threat modeling', 'risk assessment',
]

const IMAGE_KW = [
  'image', 'photo', 'picture', 'screenshot', 'diagram', 'chart', 'graph',
  'visual', 'icon', 'logo', 'banner', 'thumbnail', 'avatar', 'profile pic',
  'captcha', 'qr code', 'barcode', 'fingerprint', 'heatmap',
  'what do you see', 'describe this image', 'analyze this image',
  'look at this picture', 'tell me about this image', 'uploaded image',
  'attached image', 'image analysis', 'what is in this image',
]

const SECURITY_KW = [
  'password', 'hash', 'encryption', 'decrypt', 'hashcat', 'john', 'hydra',
  'bruteforce', 'dictionary', 'wordlist', 'rainbow table', 'salt',
  'cipher', 'aes', 'rsa', 'ecc', 'sha', 'md5', 'bcrypt', 'scrypt',
  'pkcs', 'ssl', 'tls', 'certificate', 'key', 'private key', 'public key',
]

/**
 * Pick the best model based on prompt content.
 *
 * Bug fix: the previous version had unbraced `if`s after single-statement
 * bodies, which made both the exploit-bonus branch and the reasoner
 * branch return `MODELS.coder` regardless of conditions. Braces added
 * below — the routing now actually distinguishes exploit-vs-analysis.
 */
export function pickModel(prompt: string, hasImages: boolean = false): string {
  const p = prompt.toLowerCase()

  // HIGHEST PRIORITY: images attached → vision model
  if (hasImages) {
    return MODELS.vision
  }

  const exploitScore = EXPLOIT_KW.filter(k => p.includes(k)).length * 3
  const codeScore = CODE_KW.filter(k => p.includes(k)).length * 2
  const linuxScore = LINUX_KW.filter(k => p.includes(k)).length * 2
  const reasonScore = REASON_KW.filter(k => p.includes(k)).length
  const imageScore = IMAGE_KW.filter(k => p.includes(k)).length * 2
  const securityScore = SECURITY_KW.filter(k => p.includes(k)).length * 2

  const codeTotal = exploitScore + codeScore + linuxScore + securityScore

  // Image-heavy text query → vision
  if (imageScore >= 2) {
    return MODELS.vision
  }

  // Strong code/exploit/linux signals → coder (Minimax M3).
  // The bonus case (very heavy exploit or security keywords) ALSO routes
  // to the coder, because exploits are code. Previously this branch
  // always returned coder regardless because of a missing brace.
  if (codeTotal >= 4) {
    return MODELS.coder
  }

  // Pure analysis with no code signals → reasoner
  const pureAnalysis =
    (p.includes('cve-') || p.includes('cve ')) &&
    (p.includes('explain') || p.includes('analyze') || p.includes('impact'))

  if (pureAnalysis && reasonScore >= 3) {
    return MODELS.reasoner
  }

  if (reasonScore >= 4 && codeTotal < 2) {
    return MODELS.reasoner
  }

  // Default to coder (Minimax M3) for most queries
  return MODELS.coder
}

/**
 * Tool name corrections for auto-correct feature
 */
export const TOOL_CORRECTIONS: Record<string, string> = {
  nmap: 'nmap',
  gobuster: 'gobuster',
  ffuf: 'ffuf',
  metasploit: 'metasploit',
  impacket: 'impacket',
  burpsuite: 'Burp Suite',
  hydra: 'hydra',
  sqlmap: 'sqlmap',
  enum4linux: 'enum4linux',
  nikto: 'nikto',
  hashcat: 'hashcat',
  msfconsole: 'msfconsole',
  meterpreter: 'meterpreter',
  linpeas: 'linPEAS',
  winpeas: 'winPEAS',
  'rubber ducky': 'Rubber Ducky',
  'flipper zero': 'Flipper Zero',
  'bash bunny': 'Bash Bunny',
  hak5: 'Hak5',
  'packet squirrel': 'Packet Squirrel',
  'bloodhound': 'BloodHound',
  'crackmapexec': 'CrackMapExec',
  'responder': 'Responder',
  'pspy': 'pspy',
  'gtfobins': 'GTFOBins',
  'john': 'John the Ripper',
  'aircrack': 'Aircrack-ng',
  'bettercap': 'BetterCAP',
  'wireshark': 'Wireshark',
  'tcpdump': 'tcpdump',
  'netcat': 'Netcat',
  'socat': 'socat',
  'proxychains': 'ProxyChains',
  'ssh': 'SSH',
  'scp': 'SCP',
  'rsync': 'rsync',
}

/**
 * Quick prompts for the empty state
 */
export const QUICK_PROMPTS = [
  'Give me a simple answer first, no extra explanation',
  'Explain these issues with root cause, impact, fix, and validation',
  'Give alternatives and tradeoffs for this approach',
  'Create an authorized lab payload/PoC with usage and validation',
  'Analyze this file for bugs, secrets, and security issues',
  'Build a clean Kali recon workflow with commands and validation',
  'Write a robust Python script with logging and CLI arguments',
  'Turn these notes into a professional pentest report section',
  'Explain a buffer overflow exploit with mitigations and bypasses',
  'Show me a lateral movement technique with detection methods',
  'Analyze this image for security implications or hidden data',
  'Explain a complete red team engagement methodology',
]

/**
 * Accepted file types for attachments
 */
export const ACCEPTED_FILES =
  'image/*,.png,.jpg,.jpeg,.gif,.svg,.webp,.bmp,.ico,.tiff,.tif,.heic,.heif,.raw,.psd,.ai,.eps,' +
  'text/*,.py,.sh,.ps1,.bash,.zsh,.c,.cpp,.h,.rs,.go,.php,.rb,.pl,.js,.ts,.html,.xml,.json,.yaml,.yml,' +
  '.log,.conf,.cfg,.env,.md,.pcap,.pcapng,.bin,.hex,.asm,.nse,.lua,.vbs,.bat,.cmd,.psm1,.psd1,' +
  '.xlsx,.csv,.txt,.pdf,.doc,.docx,.ppt,.pptx'

/**
 * Get default temperature for a model
 */
export function getDefaultTemperature(model: string, uncensored: boolean): number {
  const options = getModelOptions(model, uncensored)
  return options.temperature ?? (uncensored ? 0.85 : 0.75)
}

/**
 * Get the maximum context window for a model.
 *
 * Backed by `getModelOptions` for now, but the real source of truth for
 * `num_ctx` is `ModelManager.getModelLimits()`. If a model is in
 * ModelManager with custom limits, use that path instead.
 */
export function getMaxContext(model: string): number {
  const options = getModelOptions(model, false)
  return options.num_ctx ?? 16384
}

/**
 * Check if a prompt contains image-related keywords
 */
export function isImageQuery(prompt: string): boolean {
  const p = prompt.toLowerCase()
  return IMAGE_KW.some(k => p.includes(k))
}

/**
 * Get recommended model for image analysis
 */
export function getImageAnalysisModel(): string {
  return MODELS.vision
}

/**
 * Check if the model supports multimodal input (images).
 *
 * Substring match on the model name — covers tag variants like
 * `qwen2.5vl:3b-q4_K_M` and `llava:13b`.
 */
export function supportsMultimodal(model: string): boolean {
  const multimodalModels = [
    'qwen2.5vl',
    'llava',
    'bakllava',
    'llava-phi3',
    'gemma',
    'phi3-vision',
    'mistral-large',
    'qwen-vl',
  ]
  return multimodalModels.some(m => model.includes(m))
}

/**
 * Get image analysis instructions for the prompt
 */
export function getImageAnalysisInstructions(): string {
  return `
When analyzing images:
1. Describe what you see in detail
2. Identify any text, symbols, or patterns
3. Note any security implications (if applicable)
4. Recognize logos, brands, or known UI elements
5. Describe colors, layout, and visual hierarchy
6. If it's a screenshot, identify the application/OS
7. Look for any anomalies or hidden details
8. Provide OCR text extraction if there's readable text
9. Describe the context and possible use cases
`
}

/**
 * Get model info for display
 */
export function getModelDisplayName(model: string): string {
  const displayNames: Record<string, string> = {
    [MODELS.coder]: 'Minimax M3 ⚡',
    [MODELS.reasoner]: 'GPT-OSS Reasoner 🧠',
    [MODELS['Offline, Coder']]: 'Qwen2.5 Coder 📦',
    [MODELS.vision]: '🌟 Qwen2.5 VL (Vision)',
  }
  return displayNames[model] || model
}

/**
 * Check if model is vision-capable
 */
export function isVisionModel(model: string): boolean {
  return (
    model === MODELS.vision ||
    model.includes('vl') ||
    model.includes('vision') ||
    model.includes('llava') ||
    model.includes('bakllava')
  )
}
