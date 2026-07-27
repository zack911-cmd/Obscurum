/**
 * MessageRenderer.tsx
 * Parses and renders assistant message content with:
 *  - Claude-style fenced code blocks (language label + copy button)
 *  - Shell/bash blocks styled as green-on-black terminal
 *  - Real VSCode-style syntax highlighting for code via prism-react-renderer
 *  - Response structure sections (Solution, Explanation, etc.)
 *  - UNCENSORED mode styling
 *  - Inline code, bold, italic, headings, lists, blockquotes
 *  - NO TRUNCATION - full content display
 *  - TEXT SELECTION with floating copy button (like ChatGPT/Claude)
 *  - Collapsible code blocks for long outputs
 *  - Enhanced terminal rendering with better color schemes
 *  - Improved section detection with more patterns
 *  - Line numbers option for code blocks
 *  - Word wrap toggle for code blocks
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Highlight, Prism, themes } from 'prism-react-renderer'
import { Copy, Check, Terminal, Code2, Shield, AlertTriangle, Info, Wrench, BookOpen, GitBranch, ChevronDown, ChevronUp, WrapText, Hash } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Prism grammar aliases
// ─────────────────────────────────────────────────────────────────────────────

Prism.languages['kali-shell']  = Prism.languages['bash']
Prism.languages['console']     = Prism.languages['bash']
Prism.languages['terminal']    = Prism.languages['bash']
Prism.languages['c']           = Prism.languages['clike']
Prism.languages['cpp']         = Prism.languages['clike']
Prism.languages['cs']          = Prism.languages['clike']
Prism.languages['csharp']      = Prism.languages['clike']
Prism.languages['objectivec']  = Prism.languages['clike']
Prism.languages['jsonc']       = Prism.languages['json']
Prism.languages['yml']         = Prism.languages['yaml']
Prism.languages['toml']        = Prism.languages['ini']
Prism.languages['conf']        = Prism.languages['ini']
Prism.languages['config']      = Prism.languages['ini']
Prism.languages['properties']  = Prism.languages['ini']
Prism.languages['shellsession']= Prism.languages['bash']
Prism.languages['shell']       = Prism.languages['bash']
Prism.languages['ps1']         = Prism.languages['powershell']
Prism.languages['pwsh']        = Prism.languages['powershell']
Prism.languages['dockerfile']  = Prism.languages['docker']
Prism.languages['html']        = Prism.languages['markup']
Prism.languages['xml']         = Prism.languages['markup']
Prism.languages['vue']         = Prism.languages['markup']
Prism.languages['svg']         = Prism.languages['markup']
Prism.languages['objc']        = Prism.languages['clike']
Prism.languages['kt']          = Prism.languages['kotlin']
Prism.languages['scala']       = Prism.languages['scala']

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SHELL_LANGS = new Set([
  'bash', 'sh', 'shell', 'zsh', 'fish',
  'powershell', 'ps1', 'cmd', 'bat',
  'terminal', 'console', 'kali', 'kali-shell',
])

const TERMINAL_LIKE_LANGS = new Set([
  'bash', 'sh', 'shell', 'zsh', 'fish',
  'powershell', 'ps1', 'cmd', 'bat',
  'terminal', 'console', 'kali', 'kali-shell',
  'dockerfile', 'makefile', 'nginx', 'apache',
  'sql', 'mysql', 'postgresql',
  'json', 'yaml', 'toml', 'ini', 'conf', 'config',
])

const LANG_ICONS: Record<string, React.ReactNode> = {
  'bash': <Terminal size={11} className="text-green-400/80" />,
  'python': <Code2 size={11} className="text-blue-400/80" />,
  'powershell': <Terminal size={11} className="text-blue-400/80" />,
  'c': <Code2 size={11} className="text-purple-400/80" />,
  'cpp': <Code2 size={11} className="text-purple-400/80" />,
  'go': <Code2 size={11} className="text-cyan-400/80" />,
  'ruby': <Code2 size={11} className="text-red-400/80" />,
  'perl': <Code2 size={11} className="text-yellow-400/80" />,
  'asm': <Code2 size={11} className="text-orange-400/80" />,
  'assembly': <Code2 size={11} className="text-orange-400/80" />,
  'tsx': <Code2 size={11} className="text-blue-400/80" />,
  'ts': <Code2 size={11} className="text-blue-400/80" />,
  'jsx': <Code2 size={11} className="text-yellow-400/80" />,
  'js': <Code2 size={11} className="text-yellow-400/80" />,
  'html': <Code2 size={11} className="text-orange-400/80" />,
  'css': <Code2 size={11} className="text-pink-400/80" />,
  'json': <Code2 size={11} className="text-green-400/80" />,
  'yaml': <Code2 size={11} className="text-cyan-400/80" />,
  'sql': <Code2 size={11} className="text-purple-400/80" />,
  'dockerfile': <Terminal size={11} className="text-blue-400/80" />,
  'makefile': <Terminal size={11} className="text-orange-400/80" />,
  'rust': <Code2 size={11} className="text-orange-400/80" />,
  'rs': <Code2 size={11} className="text-orange-400/80" />,
  'kt': <Code2 size={11} className="text-purple-400/80" />,
  'kotlin': <Code2 size={11} className="text-purple-400/80" />,
  'scala': <Code2 size={11} className="text-red-400/80" />,
  'swift': <Code2 size={11} className="text-orange-400/80" />,
}

const RESPONSE_SECTIONS = new Map([
  ['solution', { icon: <Shield size={14} />, color: 'text-green-400', label: 'Solution' }],
  ['explanation', { icon: <BookOpen size={14} />, color: 'text-blue-400', label: 'Explanation' }],
  ['technical', { icon: <Wrench size={14} />, color: 'text-yellow-400', label: 'Technical Details' }],
  ['usage', { icon: <Info size={14} />, color: 'text-cyan-400', label: 'Usage Instructions' }],
  ['security', { icon: <AlertTriangle size={14} />, color: 'text-orange-400', label: 'Security Considerations' }],
  ['alternative', { icon: <GitBranch size={14} />, color: 'text-purple-400', label: 'Alternative Approaches' }],
  ['opsec', { icon: <Shield size={14} />, color: 'text-red-400', label: 'Operational Security' }],
  ['modification', { icon: <Wrench size={14} />, color: 'text-yellow-400', label: 'Modification Points' }],
  ['failure', { icon: <AlertTriangle size={14} />, color: 'text-orange-400', label: 'Failure Scenarios' }],
  ['testing', { icon: <Info size={14} />, color: 'text-cyan-400', label: 'Testing Method' }],
  ['detection', { icon: <AlertTriangle size={14} />, color: 'text-red-400', label: 'Detection & Evasion' }],
  ['pivoting', { icon: <GitBranch size={14} />, color: 'text-purple-400', label: 'Pivoting & Lateral Movement' }],
  ['privilege', { icon: <Shield size={14} />, color: 'text-yellow-400', label: 'Privilege Escalation' }],
  ['persistence', { icon: <Shield size={14} />, color: 'text-cyan-400', label: 'Persistence' }],
])

// ─────────────────────────────────────────────────────────────────────────────
// Selection Context - for floating copy button
// ─────────────────────────────────────────────────────────────────────────────

interface SelectionState {
  text: string
  x: number
  y: number
  visible: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// CodeBlock component
// ─────────────────────────────────────────────────────────────────────────────

interface CodeBlockProps {
  code: string
  lang: string
  isUncensored?: boolean
}

function CodeBlock({ code, lang, isUncensored = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [showLineNumbers, setShowLineNumbers] = useState(false)
  const [wrapLines, setWrapLines] = useState(true)
  const codeRef = useRef<HTMLPreElement>(null)

  const langKey = (lang || '').toLowerCase().trim()
  const isShell = SHELL_LANGS.has(langKey)
  const isTerminalLike = TERMINAL_LIKE_LANGS.has(langKey)

  const hasCommandPrompts = /^[$#>]|^C:\\/.test(code.trim())
  const shouldRenderAsTerminal = isShell || isTerminalLike || hasCommandPrompts

  const displayLang = langKey || 'plaintext'
  const langIcon = LANG_ICONS[langKey] ?? <Code2 size={11} className="text-ghost-accent/80" />

  const borderClass = isUncensored
    ? 'border-red-500/40 shadow-red-500/10'
    : 'border-ghost-border/70 shadow-black/40'

  const codeLines = code.split('\n')
  const lineCount = codeLines.length
  const shouldCollapse = lineCount > 30

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return
    } catch {
      /* clipboard API unavailable/denied — fall through to legacy path */
    }

    try {
      const el = document.createElement('textarea')
      el.value = code
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        return
      }
    } catch {
      /* ignore — falls through to failure state below */
    }

    setCopyFailed(true)
    setTimeout(() => setCopyFailed(false), 2000)
  }

  const resolvePrismLang = (): string => {
    if (!langKey) return 'text'
    if (Prism.languages[langKey]) return langKey
    if (langKey === 'sh') return 'bash'
    if (langKey === 'py') return 'python'
    if (langKey === 'js') return 'javascript'
    if (langKey === 'ts') return 'typescript'
    if (langKey === 'rb') return 'ruby'
    if (langKey === 'rs') return 'rust'
    if (langKey === 'kt') return 'kotlin'
    return 'text'
  }

  const toggleCollapse = () => setCollapsed(!collapsed)
  const toggleLineNumbers = () => setShowLineNumbers(!showLineNumbers)
  const toggleWrap = () => setWrapLines(!wrapLines)

  const displayCode = collapsed && shouldCollapse 
    ? codeLines.slice(0, 15).join('\n') + '\n\n... (truncated, click expand to view all)'
    : code

  return (
    <div className={`my-4 rounded-xl overflow-hidden border ${borderClass} shadow-xl shadow-black/40 text-left w-full`}>

      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5
                      bg-ghost-surface-2 border-b border-ghost-border/60 flex-wrap gap-2">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="block w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <span className="block w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
            <span className="block w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>

          <span className="flex items-center gap-1.5 text-ghost-text-dim text-[11px] font-mono tracking-wide uppercase select-none flex-shrink-0">
            {langIcon}
            {displayLang}
          </span>

          {shouldRenderAsTerminal && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 text-green-400/80 text-[10px] font-mono uppercase tracking-wider border border-green-500/20 flex-shrink-0">
              <Terminal size={10} />
              TERMINAL
            </span>
          )}

          {isUncensored && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-mono uppercase tracking-wider border border-red-500/30 flex-shrink-0">
              <AlertTriangle size={10} />
              UNCENSORED
            </span>
          )}

          {shouldCollapse && (
            <span className="text-ghost-text-dim/60 text-[10px] font-mono flex-shrink-0">
              {lineCount} lines
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {/* Line numbers toggle */}
          <button
            onClick={toggleLineNumbers}
            className={`p-1 rounded-md transition-colors ${
              showLineNumbers 
                ? 'text-ghost-accent bg-white/[0.08]' 
                : 'text-ghost-text-dim hover:text-ghost-text hover:bg-white/[0.06]'
            }`}
            title="Toggle line numbers"
            aria-label="Toggle line numbers"
          >
            <Hash size={14} />
          </button>

          {/* Wrap toggle */}
          <button
            onClick={toggleWrap}
            className={`p-1 rounded-md transition-colors ${
              wrapLines 
                ? 'text-ghost-accent bg-white/[0.08]' 
                : 'text-ghost-text-dim hover:text-ghost-text hover:bg-white/[0.06]'
            }`}
            title="Toggle word wrap"
            aria-label="Toggle word wrap"
          >
            <WrapText size={14} />
          </button>

          {/* Collapse toggle */}
          {shouldCollapse && (
            <button
              onClick={toggleCollapse}
              className="p-1 rounded-md text-ghost-text-dim hover:text-ghost-text hover:bg-white/[0.06] transition-colors"
              title={collapsed ? 'Expand code' : 'Collapse code'}
              aria-label={collapsed ? 'Expand code' : 'Collapse code'}
            >
              {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          )}

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
                       text-ghost-text-dim hover:text-ghost-text hover:bg-white/[0.06]
                       transition-colors select-none flex-shrink-0"
            title={copied ? 'Copied!' : copyFailed ? 'Copy failed — select manually' : 'Copy code'}
            aria-label={copied ? 'Copied' : copyFailed ? 'Copy failed' : 'Copy code'}
          >
            {copied ? (
              <>
                <Check size={13} />
                <span>Copied</span>
              </>
            ) : copyFailed ? (
              <>
                <AlertTriangle size={13} />
                <span>Copy failed</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code body */}
      <div className={`overflow-x-auto w-full ${
        shouldRenderAsTerminal ? 'bg-[#0a0e14]' : 'bg-[#0d1117]'
      }`}>
        {shouldRenderAsTerminal ? (
          <pre
            ref={codeRef}
            className={`px-4 py-3.5 text-[13px] font-mono overflow-x-auto select-text ${
              wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
            }`}
          >
            {renderTerminalLines(displayCode, showLineNumbers)}
          </pre>
        ) : (
          <Highlight
            prism={Prism}
            code={displayCode.replace(/\n$/, '')}
            language={resolvePrismLang()}
            theme={themes.vsDark}
          >
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre
                ref={codeRef}
                className={`${className} px-4 py-3.5 text-[13px] font-mono overflow-x-auto select-text ${
                  wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'
                }`}
                style={{ ...style, background: 'transparent' }}
              >
                {tokens.map((line, i) => {
                  const { key: _lk, ...lineProps } = getLineProps({ line, key: i })
                  return (
                    <div key={i} {...lineProps} className={`${wrapLines ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'} ${showLineNumbers ? 'flex' : ''}`}>
                      {showLineNumbers && (
                        <span className="inline-block w-8 text-ghost-text-dim/40 select-none text-right mr-4 flex-shrink-0">
                          {i + 1}
                        </span>
                      )}
                      <span className={wrapLines ? 'break-all' : ''}>
                        {line.map((token, j) => {
                          const { key: _tk, ...tokenProps } = getTokenProps({ token, key: j })
                          return <span key={j} {...tokenProps} />
                        })}
                      </span>
                    </div>
                  )
                })}
              </pre>
            )}
          </Highlight>
        )}
      </div>

      {/* Footer with line count if collapsed */}
      {shouldCollapse && collapsed && (
        <div className="px-4 py-2 bg-ghost-surface-2/50 border-t border-ghost-border/40 text-center">
          <button
            onClick={toggleCollapse}
            className="text-xs text-ghost-text-dim hover:text-ghost-accent transition-colors flex items-center gap-1 mx-auto"
          >
            <ChevronDown size={14} />
            Show all {lineCount} lines
          </button>
        </div>
      )}
    </div>
  )
}

// Terminal-line renderer with line numbers support
function renderTerminalLines(code: string, showLineNumbers: boolean = false) {
  const lines = code.split('\n')
  
  return lines.map((line, idx) => {
    const promptMatch = line.match(/^(\$|#|>|C:\\[^>]*>)\s*(.*)/)
    
    if (promptMatch) {
      const [, prompt, command] = promptMatch
      return (
        <div key={idx} className={`flex items-start gap-2 leading-[1.65] ${showLineNumbers ? 'pl-8 relative' : ''}`}>
          {showLineNumbers && (
            <span className="absolute left-0 text-ghost-text-dim/40 select-none text-right w-6">
              {idx + 1}
            </span>
          )}
          <span className="text-green-400/60 font-mono select-none flex-shrink-0">{prompt}</span>
          <span className="text-[#e6edf3] break-all">{command}</span>
        </div>
      )
    }
    
    if (line.trim().startsWith('#')) {
      return (
        <div key={idx} className={`text-green-400/50 italic leading-[1.65] break-all ${showLineNumbers ? 'pl-8 relative' : ''}`}>
          {showLineNumbers && (
            <span className="absolute left-0 text-ghost-text-dim/40 select-none text-right w-6">
              {idx + 1}
            </span>
          )}
          {line}
        </div>
      )
    }
    
    if (line.trim() === '') {
      return <div key={idx} className="h-4" />
    }
    
    return (
      <div key={idx} className={`text-[#8b949e] leading-[1.65] break-all ${showLineNumbers ? 'pl-8 relative' : ''}`}>
        {showLineNumbers && (
          <span className="absolute left-0 text-ghost-text-dim/40 select-none text-right w-6">
            {idx + 1}
          </span>
        )}
        {line}
      </div>
    )
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader component
// ─────────────────────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  sectionKey: string
  children: React.ReactNode
}

function SectionHeader({ sectionKey, children }: SectionHeaderProps) {
  const section = RESPONSE_SECTIONS.get(sectionKey)
  if (!section) {
    // Try to find a matching section by partial match
    const lowerChildren = String(children).toLowerCase()
    for (const [key, value] of RESPONSE_SECTIONS) {
      if (lowerChildren.includes(key)) {
        return (
          <div className="flex items-center gap-2 mt-4 mb-2 border-b border-ghost-border/30 pb-1.5">
            <span className={value.color}>{value.icon}</span>
            <h3 className={`text-sm font-bold uppercase tracking-wider ${value.color}`}>
              {value.label}
            </h3>
          </div>
        )
      }
    }
    return <h3 className="text-base font-semibold text-ghost-text mt-4 mb-1.5">{children}</h3>
  }

  return (
    <div className="flex items-center gap-2 mt-4 mb-2 border-b border-ghost-border/30 pb-1.5">
      <span className={section.color}>{section.icon}</span>
      <h3 className={`text-sm font-bold uppercase tracking-wider ${section.color}`}>
        {section.label}
      </h3>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline markdown → React nodes
// ─────────────────────────────────────────────────────────────────────────────

function renderInline(text: string, keyPrefix = ''): React.ReactNode {
  const bareAsterisks = (text.match(/(?<!\*)\*(?!\*)/g) || []).length
  const bareUnderscores = (text.match(/(?<!_)_(?!_)/g) || []).length
  const allowStarItalic = bareAsterisks % 2 === 0
  const allowUnderscoreItalic = bareUnderscores % 2 === 0

  const token = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g
  const parts = text.split(token)

  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={key}
          className="px-1.5 py-0.5 rounded-md bg-ghost-surface-2/90 text-ghost-accent
                     font-mono text-[12px] border border-ghost-border/40 break-words select-text"
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    if ((part.startsWith('**') && part.endsWith('**')) ||
        (part.startsWith('__') && part.endsWith('__'))) {
      return (
        <strong key={key} className="font-semibold text-ghost-text select-text">
          {part.slice(2, -2)}
        </strong>
      )
    }

    if (part.startsWith('*') && part.endsWith('*') && !part.startsWith('**')) {
      if (!allowStarItalic) return <span key={key}>{part}</span>
      return <em key={key} className="italic text-ghost-text-dim select-text">{part.slice(1, -1)}</em>
    }

    if (part.startsWith('_') && part.endsWith('_') && !part.startsWith('__')) {
      if (!allowUnderscoreItalic) return <span key={key}>{part}</span>
      return <em key={key} className="italic text-ghost-text-dim select-text">{part.slice(1, -1)}</em>
    }

    return <span key={key} className="select-text">{part}</span>
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Block-level types
// ─────────────────────────────────────────────────────────────────────────────

type Block =
  | { type: 'h1';        text: string }
  | { type: 'h2';        text: string }
  | { type: 'h3';        text: string }
  | { type: 'section';   key: string; text: string }
  | { type: 'hr' }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'bullet';    items: string[] }
  | { type: 'ordered';   items: string[]; startNumbers: number[] }
  | { type: 'paragraph'; text: string }

// ─────────────────────────────────────────────────────────────────────────────
// Parse blocks
// ─────────────────────────────────────────────────────────────────────────────

function parseBlocks(text: string): Block[] {
  if (!text || text.trim() === '') return []

  const lines = text.split('\n')
  const blocks: Block[] = []
  let i = 0

  // Enhanced section pattern - matches more formats
  const sectionPatterns = [
    /^\d+\.\s+\*\*([^*]+)\*\*[:：\-–—]?\s*/,
    /^\*\*([^*]+)\*\*[:：\-–—]?\s*/,
    /^###\s+\*\*([^*]+)\*\*\s*/,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*[:：\-–—]/
  ]

  const sectionMap: Record<string, string> = {
    'solution': 'solution',
    'answer': 'solution',
    'resolve': 'solution',
    'fix': 'solution',
    'explanation': 'explanation',
    'explain': 'explanation',
    'technical': 'technical',
    'deep dive': 'technical',
    'internals': 'technical',
    'usage': 'usage',
    'instructions': 'usage',
    'how to': 'usage',
    'security': 'security',
    'opsec': 'opsec',
    'operational security': 'opsec',
    'alternative': 'alternative',
    'other approach': 'alternative',
    'modification': 'modification',
    'customize': 'modification',
    'customization': 'modification',
    'failure': 'failure',
    'issues': 'failure',
    'testing': 'testing',
    'verify': 'testing',
    'detection': 'detection',
    'evasion': 'detection',
    'pivoting': 'pivoting',
    'lateral': 'pivoting',
    'privilege': 'privilege',
    'escalation': 'privilege',
    'persistence': 'persistence',
    'maintain': 'persistence',
  }

  // Resolve a line to a section key, or null if it doesn't match any known section.
  // A line only counts as a "section line" if it BOTH matches a header pattern
  // AND maps to a real key — otherwise it must be treated as ordinary text,
  // or the paragraph fallback below can never consume it (infinite loop).
  const resolveSection = (line: string): { key: string; patternIdx: number } | null => {
    for (let p = 0; p < sectionPatterns.length; p++) {
      const match = line.match(sectionPatterns[p])
      if (!match) continue
      const sectionText = match[1].toLowerCase().trim()
      if (sectionMap[sectionText]) {
        return { key: sectionMap[sectionText], patternIdx: p }
      }
      for (const [search, mappedKey] of Object.entries(sectionMap)) {
        if (sectionText.includes(search) || search.includes(sectionText)) {
          return { key: mappedKey, patternIdx: p }
        }
      }
    }
    return null
  }

  const isSectionLine = (line: string) => resolveSection(line) !== null

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') { i++; continue }

    const resolved = resolveSection(line)

    if (resolved) {
      const { key, patternIdx } = resolved
      // Extract the text after the section header
      const rest = line.replace(sectionPatterns[patternIdx], '')
      blocks.push({ type: 'section', key, text: rest || '' })
      i++
      continue
    }

    const h3 = line.match(/^###\s+(.+)/)
    if (h3) { blocks.push({ type: 'h3', text: h3[1] }); i++; continue }

    const h2 = line.match(/^##\s+(.+)/)
    if (h2) { blocks.push({ type: 'h2', text: h2[1] }); i++; continue }

    const h1 = line.match(/^#\s+(.+)/)
    if (h1) { blocks.push({ type: 'h1', text: h1[1] }); i++; continue }

    if (/^[-*_]{3,}$/.test(line.trim())) {
      blocks.push({ type: 'hr' })
      i++; continue
    }

    if (line.startsWith('> ')) {
      const bqLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        bqLines.push(lines[i].slice(2))
        i++
      }
      blocks.push({ type: 'blockquote', lines: bqLines })
      continue
    }

    if (/^[-*+]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ''))
        i++
      }
      blocks.push({ type: 'bullet', items })
      continue
    }

    if (/^\d+[.)]\s/.test(line)) {
      const items: string[] = []
      const startNumbers: number[] = []
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
        const m = lines[i].match(/^(\d+)[.)]\s+(.*)$/)
        startNumbers.push(m ? parseInt(m[1], 10) : items.length + 1)
        items.push(lines[i].replace(/^\d+[.)]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ordered', items, startNumbers })
      continue
    }

    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+[.)]\s/.test(lines[i]) &&
      !/^#+\s/.test(lines[i]) &&
      !/^[-*_]{3,}$/.test(lines[i].trim()) &&
      !lines[i].startsWith('> ') &&
      !isSectionLine(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join('\n') })
    }
  }

  return blocks
}

// ─────────────────────────────────────────────────────────────────────────────
// Render a single block with selection support
// ─────────────────────────────────────────────────────────────────────────────

function BlockRenderer({ block, idx }: { block: Block; idx: number }) {
  switch (block.type) {

    case 'section':
      return (
        <div key={idx}>
          <SectionHeader sectionKey={block.key}>
            {block.text}
          </SectionHeader>
        </div>
      )

    case 'h1':
      return (
        <h2 key={idx} className="text-xl font-bold text-ghost-text mt-5 mb-2 leading-snug tracking-tight select-text">
          {renderInline(block.text, `h1-${idx}`)}
        </h2>
      )

    case 'h2':
      return (
        <h3 key={idx} className="text-base font-semibold text-ghost-text mt-4 mb-1.5 leading-snug select-text">
          {renderInline(block.text, `h2-${idx}`)}
        </h3>
      )

    case 'h3':
      return (
        <h4 key={idx} className="text-sm font-semibold text-ghost-accent mt-3 mb-1 leading-snug select-text">
          {renderInline(block.text, `h3-${idx}`)}
        </h4>
      )

    case 'hr':
      return <hr key={idx} className="my-4 border-ghost-border/40" />

    case 'blockquote':
      return (
        <blockquote
          key={idx}
          className="my-2.5 pl-3 border-l-2 border-ghost-accent/40
                     text-ghost-text-dim text-sm italic leading-relaxed select-text"
        >
          {block.lines.map((l, j) => (
            <p key={j}>{renderInline(l, `bq-${idx}-${j}`)}</p>
          ))}
        </blockquote>
      )

    case 'bullet':
      return (
        <ul key={idx} className="my-2 space-y-1 pl-1 select-text">
          {block.items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="text-ghost-accent mt-[6px] text-[7px] flex-shrink-0">●</span>
              <span>{renderInline(item, `ul-${idx}-${j}`)}</span>
            </li>
          ))}
        </ul>
      )

    case 'ordered':
      return (
        <ol key={idx} className="my-2 space-y-1 pl-1 select-text">
          {block.items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="text-ghost-accent font-mono text-xs flex-shrink-0 min-w-[1.4rem] pt-0.5">
                {block.startNumbers[j] ?? j + 1}.
              </span>
              <span>{renderInline(item, `ol-${idx}-${j}`)}</span>
            </li>
          ))}
        </ol>
      )

    case 'paragraph':
    default:
      return (
        <p key={idx} className="my-1.5 text-sm leading-relaxed select-text">
          {renderInline(block.text, `p-${idx}`)}
        </p>
      )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Floating Selection Copy Button Component
// ─────────────────────────────────────────────────────────────────────────────

function SelectionCopyButton() {
  const [selection, setSelection] = useState<SelectionState>({ text: '', x: 0, y: 0, visible: false })
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.toString().trim() === '') {
      setSelection(prev => ({ ...prev, visible: false }))
      return
    }

    const text = sel.toString().trim()
    if (!text) {
      setSelection(prev => ({ ...prev, visible: false }))
      return
    }

    // Get position of selection
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    
    // Position above the selection, centered
    const x = rect.left + rect.width / 2
    const y = rect.top - 40

    setSelection({
      text,
      x,
      y,
      visible: true,
    })
  }, [])

  const handleCopy = useCallback(async () => {
    if (!selection.text) return
    
    try {
      await navigator.clipboard.writeText(selection.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback
      try {
        const el = document.createElement('textarea')
        el.value = selection.text
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } catch {
        // Ignore
      }
    }
  }, [selection.text])

  // Debounced selection handler
  useEffect(() => {
    const handleSelectionChange = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(handleSelection, 150)
    }

    const handleMouseUp = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(handleSelection, 100)
    }

    const handleClick = () => {
      // Hide on click outside selection
      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) {
          setSelection(prev => ({ ...prev, visible: false }))
        }
      }, 50)
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('click', handleClick)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [handleSelection])

  if (!selection.visible) return null

  return (
    <div
      className="fixed z-50 transform -translate-x-1/2 pointer-events-none"
      style={{
        top: selection.y,
        left: selection.x,
      }}
    >
      <button
        onClick={handleCopy}
        className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                   bg-[#2a2a2a] text-white shadow-lg shadow-black/40
                   hover:bg-[#333333] transition-colors"
        title="Copy selected text"
      >
        {copied ? (
          <>
            <Check size={13} />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy size={13} />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Detect UNCENSORED mode
// ─────────────────────────────────────────────────────────────────────────────

function detectUncensoredMode(content: string): boolean {
  return /UNCENSORED|Mode:\s*UNCENSORED|⚠️ UNCENSORED/i.test(content)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function renderContent(content: string, isUncensored?: boolean): React.ReactNode {
  if (!content) return null

  const uncensored = isUncensored ?? detectUncensoredMode(content)

  // Split by code blocks - handle both triple backtick and single backtick blocks
  const segments = content.split(/(^```[\w-]*\r?\n[\s\S]*?^```$)/gm)

  return (
    <>
      {/* Floating copy button for text selection */}
      <SelectionCopyButton />
      
      {segments.map((seg, i) => {
        if (!seg || seg.trim() === '') return null

        const codeMatch = seg.match(/^```([\w-]*)\r?\n([\s\S]*?)```$/)
        if (codeMatch) {
          return (
            <CodeBlock
              key={`code-${i}`}
              lang={codeMatch[1]}
              code={codeMatch[2]}
              isUncensored={uncensored}
            />
          )
        }

        const blocks = parseBlocks(seg)
        if (blocks.length === 0) return null

        return (
          <div key={`text-${i}`}>
            {blocks.map((block, j) => (
              <BlockRenderer key={`block-${i}-${j}`} block={block} idx={j} />
            ))}
          </div>
        )
      })}
    </>
  )
}