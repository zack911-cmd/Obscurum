import { useState, useMemo, useEffect, useRef, useCallback, type JSX } from 'react'
import { 
  BookOpen, Plus, Trash2, Search, Edit2, Check, Copy, 
  Share2, Link, Tag, ChevronDown, ChevronRight, X, 
  Download, Upload, History, Star, 
  BarChart3, 
  Shield,
  AlertTriangle
    } from 'lucide-react'

type Category = 'cheatsheet' | 'methodology' | 'tool' | 'notes' | 'wordlist' | 'exploit'

interface Doc {
  id: string;
  title: string;
  content: string;
  category: Category;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  favorite?: boolean;
  version?: number;
  lastViewed?: string;
  viewCount?: number;
}

interface DocVersion {
  id: string;
  docId: string;
  content: string;
  timestamp: string;
  version: number;
}

const CAT_COLOR: Record<Category, string> = {
  cheatsheet:  'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  methodology: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  tool:        'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  notes:       'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  wordlist:    'text-purple-400 border-purple-500/30 bg-purple-500/10',
  exploit:     'text-red-400 border-red-500/30 bg-red-500/10',
}

const CAT_ICON: Record<Category, string> = {
  cheatsheet:  '📋',
  methodology: '🗺️',
  tool:        '🔧',
  notes:       '📝',
  wordlist:    '📃',
  exploit:     '💥',
}

const CATEGORIES: Category[] = ['cheatsheet', 'methodology', 'tool', 'notes', 'wordlist', 'exploit']

const MAX_VERSIONS_PER_DOC = 20

function uuid() { return crypto.randomUUID() }
function now()  { return new Date().toISOString() }

const DEFAULT_DOCS: Doc[] = [
  {
    id: uuid(),
    title: 'Nmap Cheatsheet',
    content: '# Nmap Scanning\n\n## Basic Scanning\n```\nnmap -sS -T4 target\nnmap -A -T4 target\nnmap -p- -sV target\n```\n\n## Advanced Techniques\n```\nnmap --script=vuln target\nnmap -p 80 --script http-enum target\nnmap -sU -p 53 target\n```',
    category: 'cheatsheet',
    tags: ['scanning', 'recon'],
    createdAt: now(),
    updatedAt: now(),
    pinned: true,
    favorite: true,
    version: 1,
    viewCount: 0
  },
  {
    id: uuid(),
    title: 'Privilege Escalation Methodology',
    content: '# Linux Privilege Escalation\n\n1. **Initial Reconnaissance**\n   - Check current user: `whoami`\n   - Check groups: `id`\n   - Check kernel version: `uname -a`\n\n2. **Sudo Permissions**\n   - `sudo -l`\n   - Check for LD_PRELOAD\n\n3. **SUID/GUID Files**\n   - `find / -perm -4000 2>/dev/null`\n   - `find / -perm -2000 2>/dev/null`',
    category: 'methodology',
    tags: ['privesc', 'linux'],
    createdAt: now(),
    updatedAt: now(),
    pinned: true,
    favorite: false,
    version: 1,
    viewCount: 0
  },
  {
    id: uuid(),
    title: 'Burp Suite Configuration',
    content: '# Burp Suite Setup\n\n## Proxy Configuration\n1. Set browser proxy to 127.0.0.1:8080\n2. Install CA certificate\n3. Configure scope:\n   - Include in scope: target domain\n   - Exclude: external resources\n\n## Useful Extensions\n- **Logger++**: Enhanced logging\n- **Autorize**: Authorization testing\n- **ParamMiner**: Parameter discovery\n- **Freddy**: Deserialization detection',
    category: 'tool',
    tags: ['burp', 'proxy'],
    createdAt: now(),
    updatedAt: now(),
    pinned: false,
    favorite: false,
    version: 1,
    viewCount: 0
  }
]

// ─── MARKDOWN RENDERER ───

function renderInline(text: string) {
  const parts: (string | JSX.Element)[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const token = match[0]
    if (token.startsWith('**')) {
      parts.push(<strong key={key++} className="text-white font-bold">{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      parts.push(<code key={key++} className="bg-black/30 px-1 rounded text-emerald-400">{token.slice(1, -1)}</code>)
    } else if (token.startsWith('_')) {
      parts.push(<em key={key++} className="italic">{token.slice(1, -1)}</em>)
    }
    last = match.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function renderMarkdown(text: string) {
  if (!text) return null
  
  const blocks = text.split(/\n{2,}/)
  
  return (
    <div className="text-xs font-mono space-y-3 leading-relaxed">
      {blocks.map((block, i) => {
        if (block.startsWith('### ')) {
          return <h4 key={i} className="text-white font-bold text-[13px] mt-2">{block.slice(4)}</h4>
        }
        if (block.startsWith('## ')) {
          return <h3 key={i} className="text-white font-bold text-sm mt-2">{block.slice(3)}</h3>
        }
        if (block.startsWith('# ')) {
          return <h2 key={i} className="text-white font-bold text-base mt-3">{block.slice(2)}</h2>
        }
        if (block.startsWith('```')) {
          const lines = block.split('\n').filter(l => !l.startsWith('```'))
          return <pre key={i} className="bg-black/30 border border-white/10 rounded-xl p-3 text-emerald-400 overflow-x-auto whitespace-pre"><code>{lines.join('\n')}</code></pre>
        }
        if (/^[-*]\s/.test(block)) {
          const items = block.split('\n').filter(l => /^[-*]\s/.test(l))
          return (
            <ul key={i} className="list-disc list-inside space-y-1 pl-2">
              {items.map((line, j) => (
                <li key={j} className="text-white/60">{renderInline(line.replace(/^[-*]\s*/, ''))}</li>
              ))}
            </ul>
          )
        }
        if (/^\d+\.\s/.test(block)) {
          const items = block.split('\n').filter(l => /^\d+\.\s/.test(l))
          return (
            <ol key={i} className="list-decimal list-inside space-y-1 pl-2">
              {items.map((line, j) => (
                <li key={j} className="text-white/60">{renderInline(line.replace(/^\d+\.\s*/, ''))}</li>
              ))}
            </ol>
          )
        }
        return <p key={i} className="text-white/60 whitespace-pre-wrap">{renderInline(block)}</p>
      })}
    </div>
  )
}

// ─── COPY BUTTON ───

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
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
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        console.debug('Copy fallback failed')
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        fallback()
      }
    } else {
      fallback()
    }
  }, [text])

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-xs text-white/40 hover:text-emerald-400 transition-colors"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? <><Check size={10} className="text-emerald-400" />copied</> : <><Copy size={10} />copy</>}
    </button>
  )
}

// ─── MAIN COMPONENT ───

export default function KnowledgeBase() {
  const [docs, setDocs] = useState<Doc[]>(() => {
    try {
      const saved = localStorage.getItem('knowledgeBaseDocs')
      return saved ? JSON.parse(saved) : DEFAULT_DOCS
    } catch {
      return DEFAULT_DOCS
    }
  })
  const [activeDoc, setActiveDoc] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('knowledgeBaseActiveDoc')
      return saved || DEFAULT_DOCS[0]?.id || ''
    } catch {
      return DEFAULT_DOCS[0]?.id || ''
    }
  })
  const [editing, setEditing] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<Category | 'all'>('all')
  const [filterTag, setFilterTag] = useState('')
  const [collapsedCats, setCollapsedCats] = useState<Set<Category>>(new Set())
  const [importError, setImportError] = useState('')
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [versions, setVersions] = useState<DocVersion[]>(() => {
    try {
      const saved = localStorage.getItem('knowledgeBaseVersions')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [showStats, setShowStats] = useState(false)
  const [exportFormat, setExportFormat] = useState<'json' | 'markdown' | 'html'>('json')
  const [quotaError, setQuotaError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const versionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCountedRef = useRef<string | null>(null)

  const doc = docs.find(d => d.id === activeDoc)

  // ─── PERSIST WITH QUOTA ERROR HANDLING ───

  useEffect(() => {
    try {
      localStorage.setItem('knowledgeBaseDocs', JSON.stringify(docs))
      setQuotaError(null)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        setQuotaError('Storage quota exceeded. Some changes may not be saved. Try deleting old documents or versions.')
        console.error('localStorage quota exceeded')
      }
    }
  }, [docs])

  useEffect(() => {
    try {
      localStorage.setItem('knowledgeBaseVersions', JSON.stringify(versions))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        setQuotaError('Storage quota exceeded. Version history may be incomplete.')
      }
    }
  }, [versions])

  // ─── VIEW COUNT WITH DEDUPE ───

  useEffect(() => {
    if (!activeDoc) return
    try {
      localStorage.setItem('knowledgeBaseActiveDoc', activeDoc)
    } catch {
      // ignore
    }
    if (lastCountedRef.current !== activeDoc) {
      lastCountedRef.current = activeDoc
      setDocs(prev => prev.map(d => 
        d.id === activeDoc ? { ...d, lastViewed: now(), viewCount: (d.viewCount || 0) + 1 } : d
      ))
    }
  }, [activeDoc])

  // ─── VERSION FUNCTIONS ───

  const getDocVersions = useCallback((docId: string) => {
    return versions.filter(v => v.docId === docId).sort((a, b) => b.version - a.version)
  }, [versions])

  const saveVersion = useCallback((docId: string, content: string) => {
    const docVersions = getDocVersions(docId)
    const nextVersion = docVersions.length > 0 ? docVersions[0].version + 1 : 1
    
    const newVersion: DocVersion = {
      id: uuid(),
      docId: docId,
      content: content,
      timestamp: now(),
      version: nextVersion
    }
    
    setVersions(prev => {
      const otherDocs = prev.filter(v => v.docId !== docId)
      const thisDoc = [...docVersions, newVersion]
        .sort((a, b) => b.version - a.version)
        .slice(0, MAX_VERSIONS_PER_DOC)
      return [...otherDocs, ...thisDoc]
    })
    
    setDocs(prev => prev.map(d => 
      d.id === docId ? { ...d, version: nextVersion, updatedAt: now() } : d
    ))
  }, [getDocVersions])

  // ─── CLEANUP ───

  useEffect(() => {
    return () => {
      if (versionTimeoutRef.current) {
        clearTimeout(versionTimeoutRef.current)
      }
    }
  }, [])

  // ─── DOC OPERATIONS ───

  const addDoc = () => {
    const d: Doc = {
      id: uuid(),
      title: 'New Document',
      category: 'notes',
      tags: [],
      content: '# New Document\n\nStart writing here...',
      pinned: false,
      favorite: false,
      createdAt: now(),
      updatedAt: now(),
      version: 1,
      viewCount: 0
    }
    setDocs(p => [...p, d])
    setActiveDoc(d.id)
    setEditing(true)
  }

  const updateDoc = useCallback((k: keyof Doc, v: string | boolean | string[]) => {
    const targetId = activeDoc
    const targetDoc = doc
    if (!targetDoc || targetId !== targetDoc.id) return

    if (k === 'content') {
      if (versionTimeoutRef.current) {
        clearTimeout(versionTimeoutRef.current)
      }
      const docId = targetDoc.id
      const oldContent = targetDoc.content
      versionTimeoutRef.current = setTimeout(() => {
        saveVersion(docId, oldContent)
      }, 3000)
    }

    const updatedDoc: Doc = { ...targetDoc, [k]: v as any, updatedAt: now() }
    setDocs(prev => prev.map(d => d.id === targetId ? updatedDoc : d))
  }, [activeDoc, doc, saveVersion])

  const deleteDoc = (id: string) => {
    if (!confirm(`Delete "${docs.find(d => d.id === id)?.title || 'document'}"? This will also delete all versions.`)) return
    
    setVersions(prev => prev.filter(v => v.docId !== id))
    setDocs(p => {
      const newDocs = p.filter(d => d.id !== id)
      if (activeDoc === id && newDocs.length > 0) {
        setActiveDoc(newDocs[0].id)
      }
      return newDocs
    })
  }

  const toggleCat = (cat: Category) => {
    setCollapsedCats(p => {
      const n = new Set(p)
      n.has(cat) ? n.delete(cat) : n.add(cat)
      return n
    })
  }

  const toggleFavorite = (id: string) => {
    setDocs(prev => prev.map(d => 
      d.id === id ? { ...d, favorite: !d.favorite } : d
    ))
  }

  const restoreVersion = (version: DocVersion) => {
    const targetDoc = docs.find(d => d.id === version.docId)
    if (!targetDoc) return
    
    if (!confirm(`Restore to v${version.version}? Your current content will be saved as a new version first.`)) return
    
    saveVersion(targetDoc.id, targetDoc.content)
    
    setDocs(prev => prev.map(d => 
      d.id === version.docId ? { ...d, content: version.content, updatedAt: now() } : d
    ))
    setShowVersions(false)
  }

  // ─── EXPORT / IMPORT ───

  const exportData = () => {
    let dataStr = ''
    let filename = `knowledge-base-export-${new Date().toISOString().slice(0,10)}`
    
    if (exportFormat === 'json') {
      dataStr = JSON.stringify(docs, null, 2)
      filename += '.json'
    } else if (exportFormat === 'markdown') {
      dataStr = docs.map(d => 
        `# ${d.title}\n\n${d.content}\n\n---\nTags: ${d.tags.join(', ')}\nCategory: ${d.category}\nUpdated: ${d.updatedAt}\n`
      ).join('\n\n')
      filename += '.md'
    } else if (exportFormat === 'html') {
      dataStr = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Knowledge Base Export</title>
  <style>
    body { font-family: monospace; max-width: 800px; margin: 0 auto; padding: 20px; background: #090b14; color: #c9d1d9; }
    .doc { border-bottom: 1px solid #2d3748; padding: 20px 0; }
    .title { color: #a78bfa; font-size: 20px; font-weight: bold; }
    .meta { color: #6b7280; font-size: 12px; margin: 5px 0; }
    .content { white-space: pre-wrap; margin: 10px 0; }
  </style>
</head>
<body>
  <h1 style="color: #fbbf24;">Knowledge Base Export</h1>
  ${docs.map(d => `
    <div class="doc">
      <div class="title">${d.title}</div>
      <div class="meta">Category: ${d.category} | Tags: ${d.tags.join(', ')} | Updated: ${d.updatedAt}</div>
      <div class="content">${d.content}</div>
    </div>
  `).join('')}
</body>
</html>`
      filename += '.html'
    }

    const dataBlob = new Blob([dataStr], { type: 'text/plain' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string
        
        if (file.name.endsWith('.md') || file.name.endsWith('.txt')) {
          const importedDocs: Doc[] = []
          const lines = content.split('\n')
          let current: Partial<Doc> | null = null
          let currentContent: string[] = []
          
          for (const line of lines) {
            if (line.startsWith('# ')) {
              if (current) {
                importedDocs.push({
                  ...current,
                  content: currentContent.join('\n').trim(),
                  id: uuid(),
                  category: 'notes',
                  tags: [],
                  createdAt: now(),
                  updatedAt: now(),
                  pinned: false,
                  favorite: false,
                  version: 1,
                  viewCount: 0
                } as Doc)
              }
              current = { title: line.slice(2).trim() }
              currentContent = []
            } else if (current) {
              currentContent.push(line)
            }
          }
          if (current) {
            importedDocs.push({
              ...current,
              content: currentContent.join('\n').trim(),
              id: uuid(),
              category: 'notes',
              tags: [],
              createdAt: now(),
              updatedAt: now(),
              pinned: false,
              favorite: false,
              version: 1,
              viewCount: 0
            } as Doc)
          }
          
          if (importedDocs.length === 0) {
            throw new Error('No documents found in markdown file')
          }
          
          if (!confirm(`Import ${importedDocs.length} documents? This will REPLACE all current docs. (Use Export first to back up)`)) {
            return
          }
          
          setDocs(importedDocs)
          if (importedDocs.length > 0) {
            setActiveDoc(importedDocs[0].id)
          }
          setImportError('')
          return
        }

        const importedDocs: Doc[] = JSON.parse(content)

        if (!Array.isArray(importedDocs) || !importedDocs.every(isValidDoc)) {
          throw new Error('Invalid document structure')
        }

        if (!confirm(`Import ${importedDocs.length} documents? This will REPLACE all current docs. (Use Export first to back up)`)) {
          return
        }

        setDocs(importedDocs)
        if (importedDocs.length > 0) {
          setActiveDoc(importedDocs[0].id)
        }
        setImportError('')
      } catch (err) {
        setImportError('Invalid file format: ' + (err instanceof Error ? err.message : 'unknown error'))
        console.error(err)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const isValidDoc = (doc: any): doc is Doc => {
    return (
      typeof doc === 'object' &&
      typeof doc.id === 'string' &&
      typeof doc.title === 'string' &&
      typeof doc.content === 'string' &&
      typeof doc.category === 'string' &&
      CATEGORIES.includes(doc.category as Category) &&
      Array.isArray(doc.tags) &&
      doc.tags.every((t: any) => typeof t === 'string') &&
      typeof doc.createdAt === 'string' &&
      typeof doc.updatedAt === 'string' &&
      typeof doc.pinned === 'boolean'
    )
  }

  // ─── SHARE ───

  const generateShareLink = () => {
    if (!doc) return

    const shareData = {
      title: doc.title,
      content: doc.content,
      category: doc.category,
      tags: doc.tags
    }

    const shareString = btoa(encodeURIComponent(JSON.stringify(shareData)))
    const link = `${window.location.origin}/#/share/${shareString}`

    setShareLink(link)
    setShowShareModal(true)
  }

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      try {
        const el = document.createElement('textarea')
        el.value = shareLink
        el.style.position = 'fixed'
        el.style.opacity = '0'
        document.body.appendChild(el)
        el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      } catch {
        console.debug('Share link copy failed')
      }
    }
  }

  // ─── STATS ───

  const stats = useMemo(() => {
    const total = docs.length
    const pinned = docs.filter(d => d.pinned).length
    const favorited = docs.filter(d => d.favorite).length
    const byCategory = CATEGORIES.reduce((acc, cat) => {
      acc[cat] = docs.filter(d => d.category === cat).length
      return acc
    }, {} as Record<Category, number>)
    const totalTags = new Set(docs.flatMap(d => d.tags)).size
    const totalViews = docs.reduce((sum, d) => sum + (d.viewCount || 0), 0)
    const totalVersions = versions.length
    
    return { total, pinned, favorited, byCategory, totalTags, totalViews, totalVersions }
  }, [docs, versions])

  // ─── WORD / CHAR COUNT ───

  const { wordCount, characterCount } = useMemo(() => {
    if (!doc) return { wordCount: 0, characterCount: 0 }
    const words = doc.content.split(/\s+/).filter(w => w.length > 0).length
    return { wordCount: words, characterCount: doc.content.length }
  }, [doc?.content])

  // ─── FILTERED DOCS ───

  const filtered = useMemo(() => {
    return docs.filter(d => {
      const matchSearch = !search ||
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        d.content.toLowerCase().includes(search.toLowerCase()) ||
        d.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
      const matchCat = filterCat === 'all' || d.category === filterCat
      const matchTag = !filterTag || d.tags.some(t => t.toLowerCase() === filterTag.toLowerCase())
      const matchFavorite = !showFavorites || d.favorite
      return matchSearch && matchCat && matchTag && matchFavorite
    }).sort((a, b) => {
      if (b.pinned !== a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
      if (b.favorite !== a.favorite) return (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0)
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  }, [docs, search, filterCat, filterTag, showFavorites])

  const grouped = useMemo(() => {
    const g: Record<Category, Doc[]> = {
      cheatsheet: [], methodology: [], tool: [], notes: [], wordlist: [], exploit: []
    }
    filtered.forEach(d => g[d.category].push(d))
    return g
  }, [filtered])

  // ─── HANDLERS ───

  const handleFilterCatChange = (next: Category | 'all') => {
    setFilterCat(next)
    setFilterTag('')
  }

  const handleTagClick = (tag: string) => {
    setFilterTag(tag)
  }

  // ─── RENDER ───

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      <div className="max-w-6xl mx-auto p-6">
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ 
              background: 'radial-gradient(circle, rgba(251,191,36,0.2), rgba(251,191,36,0.05))', 
              border: '1px solid rgba(251,191,36,0.15)' 
            }}>
              <BookOpen size={18} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">ARCHIVE</h1>
              <p className="text-white/40 text-xs">Knowledge base — cheatsheets, methodologies, and tools</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs text-white/30">
              <Shield size={14} className="text-amber-400" />
              <span>v1.0</span>
            </div>
          </div>
        </div>

        {/* ── Quota error banner ── */}
        {quotaError && (
          <div className="mb-4 p-3 rounded-xl border border-red-500/30 flex items-center gap-2 text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.06)' }}>
            <AlertTriangle size={14} /> {quotaError}
            <button 
              onClick={() => setQuotaError(null)} 
              className="ml-auto text-white/30 hover:text-white/70 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Main Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-white/10 p-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
              {/* Search */}
              <div className="relative mb-3">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search docs..."
                  className="w-full bg-black/30 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30 placeholder-white/30"
                />
              </div>

              {/* Category filter */}
              <select
                value={filterCat}
                onChange={e => handleFilterCatChange(e.target.value as Category | 'all')}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30 mb-2"
              >
                <option value="all" style={{ background: '#0d1022' }}>All Categories</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c} style={{ background: '#0d1022' }}>
                    {CAT_ICON[c]} {c}
                  </option>
                ))}
              </select>

              {/* Tag filter */}
              {filterTag && (
                <button
                  onClick={() => setFilterTag('')}
                  className="flex items-center gap-1 text-xs text-purple-400 font-mono hover:opacity-80 mb-2"
                >
                  <Tag size={10} />#{filterTag} <X size={10} />
                </button>
              )}

              {/* Filter options */}
              <div className="flex gap-1 mb-3">
                <button
                  onClick={() => setShowFavorites(!showFavorites)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-xl border transition-colors ${
                    showFavorites 
                      ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' 
                      : 'text-white/40 border-white/10 hover:text-yellow-400'
                  }`}
                >
                  <Star size={10} /> Favorites
                </button>
                <button
                  onClick={() => setShowVersions(!showVersions)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-xl border transition-colors ${
                    showVersions 
                      ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400' 
                      : 'text-white/40 border-white/10 hover:text-cyan-400'
                  }`}
                >
                  <History size={10} /> Versions
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-1 mb-2">
                <button
                  onClick={addDoc}
                  className="flex-1 flex items-center justify-center gap-1 text-xs px-2 py-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-xl hover:bg-purple-500/30 transition-colors font-mono"
                >
                  <Plus size={11} /> New
                </button>

                <button
                  onClick={() => setShowStats(!showStats)}
                  className={`flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded-xl border transition-colors ${
                    showStats 
                      ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400' 
                      : 'text-white/40 border-white/10 hover:text-cyan-400'
                  }`}
                  title="Toggle stats"
                >
                  <BarChart3 size={11} />
                </button>

                <button
                  onClick={exportData}
                  className="flex items-center justify-center gap-1 text-xs px-2 py-1.5 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-xl hover:bg-blue-500/30 transition-colors"
                  title="Export documents"
                >
                  <Download size={11} />
                </button>

                <label
                  className="flex items-center justify-center gap-1 text-xs px-2 py-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition-colors cursor-pointer"
                  title="Import documents"
                >
                  <Upload size={11} />
                  <input
                    type="file"
                    accept=".json,.md,.txt"
                    onChange={importData}
                    className="hidden"
                    ref={fileInputRef}
                  />
                </label>
              </div>

              {/* Export format selector */}
              <select
                value={exportFormat}
                onChange={e => setExportFormat(e.target.value as any)}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30 mb-2"
              >
                <option value="json" style={{ background: '#0d1022' }}>JSON</option>
                <option value="markdown" style={{ background: '#0d1022' }}>Markdown</option>
                <option value="html" style={{ background: '#0d1022' }}>HTML</option>
              </select>

              {importError && (
                <div className="text-red-400 text-xs p-2 bg-red-500/10 rounded-xl border border-red-500/30 mb-2">
                  {importError}
                </div>
              )}

              {/* Stats panel */}
              {showStats && (
                <div className="bg-black/30 border border-white/10 rounded-xl p-3 space-y-1 mb-3">
                  <div className="text-white/40 text-[10px] font-mono font-bold">Statistics</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                    <div className="text-white/40">Total Docs</div>
                    <div className="text-white text-right">{stats.total}</div>
                    <div className="text-white/40">Pinned</div>
                    <div className="text-white text-right">{stats.pinned}</div>
                    <div className="text-white/40">Favorited</div>
                    <div className="text-white text-right">{stats.favorited}</div>
                    <div className="text-white/40">Tags</div>
                    <div className="text-white text-right">{stats.totalTags}</div>
                    <div className="text-white/40">Views</div>
                    <div className="text-white text-right">{stats.totalViews}</div>
                    <div className="text-white/40">Versions</div>
                    <div className="text-white text-right">{stats.totalVersions}</div>
                  </div>
                </div>
              )}

              {/* Doc list grouped by category */}
              <div className="max-h-[60vh] overflow-y-auto custom-scrollbar space-y-1">
                {CATEGORIES.map(cat => {
                  const catDocs = grouped[cat]
                  if (catDocs.length === 0) return null
                  const isCollapsed = collapsedCats.has(cat)
                  return (
                    <div key={cat}>
                      <button
                        onClick={() => toggleCat(cat)}
                        className="w-full flex items-center gap-1 px-1 py-0.5 text-xs font-mono text-white/40 hover:text-white/70 transition-colors"
                      >
                        {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                        {CAT_ICON[cat]} {cat} ({catDocs.length})
                      </button>
                      {!isCollapsed && catDocs.map(d => (
                        <div
                          key={d.id}
                          onClick={() => { setActiveDoc(d.id); setEditing(false) }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl cursor-pointer transition-colors group ml-2 ${
                            activeDoc === d.id 
                              ? 'bg-amber-500/10 border border-amber-500/20 shadow-lg shadow-amber-500/5' 
                              : 'hover:bg-white/5 border border-transparent'
                          }`}
                        >
                          {d.pinned && <span className="text-yellow-400 text-xs">📌</span>}
                          {d.favorite && <span className="text-yellow-400 text-xs">⭐</span>}
                          <span className="text-white/60 text-xs font-mono flex-1 truncate">{d.title}</span>
                          <button
                            onClick={ev => {
                              ev.stopPropagation();
                              toggleFavorite(d.id)
                            }}
                            className={`opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ${
                              d.favorite ? 'text-yellow-400' : 'text-white/30 hover:text-yellow-400'
                            }`}
                          >
                            <Star size={10} />
                          </button>
                          <button
                            onClick={ev => {
                              ev.stopPropagation();
                              deleteDoc(d.id)
                            }}
                            className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all flex-shrink-0"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Main Content ── */}
          <div className="lg:col-span-3">
            {doc ? (
              <div className="rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
                {/* Doc header */}
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center gap-2 flex-wrap">
                    {editing ? (
                      <input
                        value={doc.title}
                        onChange={e => updateDoc('title', e.target.value)}
                        className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-white/80 text-sm font-mono font-bold focus:outline-none focus:border-amber-500/30"
                      />
                    ) : (
                      <h1 className="flex-1 text-white font-mono font-bold text-sm flex items-center gap-2">
                        {doc.favorite && <span className="text-yellow-400 text-sm">⭐</span>}
                        {doc.title}
                        <span className="text-white/30 text-[10px] font-normal">
                          v{doc.version || 1} · {doc.viewCount || 0} views
                        </span>
                      </h1>
                    )}

                    <span className={`text-xs px-2 py-0.5 rounded-xl border font-mono ${CAT_COLOR[doc.category]}`}>
                      {CAT_ICON[doc.category]} {doc.category}
                    </span>

                    {editing && (
                      <select
                        value={doc.category}
                        onChange={e => updateDoc('category', e.target.value as Category)}
                        className="bg-black/30 border border-white/10 rounded-xl px-2 py-1 text-white/80 text-xs font-mono focus:outline-none focus:border-amber-500/30"
                      >
                        {CATEGORIES.map(c => <option key={c} value={c} style={{ background: '#0d1022' }}>{c}</option>)}
                      </select>
                    )}

                    <button
                      onClick={() => updateDoc('pinned', !doc.pinned)}
                      className={"text-xs transition-colors " + (doc.pinned ? 'text-yellow-400' : 'text-white/30 hover:text-yellow-400')}
                      aria-label={doc.pinned ? "Unpin document" : "Pin document"}
                    >
                      📌
                    </button>

                    <button
                      onClick={() => toggleFavorite(doc.id)}
                      className={"text-xs transition-colors " + (doc.favorite ? 'text-yellow-400' : 'text-white/30 hover:text-yellow-400')}
                      aria-label={doc.favorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      ⭐
                    </button>

                    <button
                      onClick={() => setEditing(e => !e)}
                      className={`text-xs px-2 py-1 rounded-xl border font-mono transition-colors ${
                        editing ? 'text-emerald-400 border-emerald-500/30' : 'text-white/40 border-white/10 hover:text-white/70'
                      }`}
                    >
                      {editing ? <><Check size={11} /> Save</> : <><Edit2 size={11} /> Edit</>}
                    </button>

                    <CopyBtn text={doc.content} />

                    <button
                      onClick={generateShareLink}
                      className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-xl hover:bg-blue-500/30 transition-colors"
                      title="Share document"
                    >
                      <Share2 size={11} /> Share
                    </button>

                    <button
                      onClick={() => setShowVersions(!showVersions)}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded-xl border transition-colors ${
                        showVersions 
                          ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400' 
                          : 'text-white/40 border-white/10 hover:text-cyan-400'
                      }`}
                      title="View versions"
                    >
                      <History size={11} /> {getDocVersions(doc.id).length}
                    </button>
                  </div>

                  {/* Tags */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {doc.tags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => handleTagClick(tag)}
                        className="flex items-center gap-1 text-xs px-2 py-0.5 bg-black/30 border border-white/10 rounded-xl font-mono text-white/40 hover:text-purple-400 hover:border-purple-500/30 transition-colors"
                      >
                        <Tag size={9} />#{tag}
                      </button>
                    ))}
                    {editing && (
                      <input
                        placeholder="Add tag (press Enter)"
                        className="bg-transparent border-b border-white/10 text-white/40 text-xs font-mono focus:outline-none w-28 placeholder-white/30"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value.trim()
                            if (val && !doc.tags.some(t => t.toLowerCase() === val.toLowerCase())) {
                              updateDoc('tags', [...doc.tags, val])
                            }
                            (e.target as HTMLInputElement).value = ''
                          }
                        }}
                      />
                    )}
                  </div>

                  {/* Word and character count */}
                  {!editing && (
                    <div className="flex items-center gap-4 mt-2 text-white/30 text-[10px] font-mono flex-wrap">
                      <span>Words: {wordCount}</span>
                      <span>Characters: {characterCount}</span>
                      <span>Updated: {new Date(doc.updatedAt).toLocaleString()}</span>
                      <span>Created: {new Date(doc.createdAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Version history */}
                {showVersions && (
                  <div className="p-4 border-b border-white/10 max-h-40 overflow-y-auto custom-scrollbar" style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-white/40 text-xs font-mono font-bold">Version History</div>
                      <button onClick={() => setShowVersions(false)} className="text-white/30 hover:text-red-400 transition-colors">
                        <X size={12} />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {getDocVersions(doc.id).map(v => (
                        <div key={v.id} className="flex items-center justify-between text-xs">
                          <span className="text-white/40 font-mono">
                            v{v.version} · {new Date(v.timestamp).toLocaleString()}
                          </span>
                          <button
                            onClick={() => restoreVersion(v)}
                            className="text-cyan-400 hover:text-cyan-300 text-xs"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                      {getDocVersions(doc.id).length === 0 && (
                        <div className="text-white/30 text-xs">No versions saved yet</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Editor / Preview */}
                <div className="p-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {editing ? (
                    <textarea
                      value={doc.content}
                      onChange={e => updateDoc('content', e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl p-4 text-emerald-400 text-xs font-mono focus:outline-none resize-none leading-relaxed min-h-[300px]"
                    />
                  ) : (
                    <div className="leading-relaxed">
                      {renderMarkdown(doc.content)}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 p-12 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <BookOpen size={48} className="text-white/20 mx-auto mb-4" />
                <div className="text-white/40 text-sm font-mono">No document selected</div>
                <button
                  onClick={addDoc}
                  className="mt-3 text-xs text-purple-400 hover:opacity-80 font-mono flex items-center gap-1 mx-auto transition-colors"
                >
                  <Plus size={12} /> Create first document
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Share Modal ── */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="rounded-xl border border-white/10 p-6 w-full max-w-md" style={{ background: '#0d1022' }}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-mono font-bold">Share Document</h3>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="text-white/40 hover:text-red-400 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-white/60 text-sm mb-2">
                  Share this document with your team using the link below:
                </p>

                <div className="flex gap-2">
                  <input
                    value={shareLink}
                    readOnly
                    className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs font-mono"
                  />
                  <button
                    onClick={copyShareLink}
                    className="flex items-center gap-1 px-3 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-xl hover:bg-blue-500/30 text-xs font-mono transition-colors"
                  >
                    {copiedLink ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <div className="mt-4 p-3 bg-black/30 border border-white/10 rounded-xl">
                  <h4 className="text-white/60 text-xs font-bold mb-1">Document Preview</h4>
                  <p className="text-white/80 text-xs truncate">
                    <span className="font-bold">{doc?.title}</span> ({doc?.category})
                  </p>
                  <p className="text-white/30 text-xs mt-1">
                    {doc?.tags.map(tag => `#${tag}`).join(' ')}
                  </p>
                </div>
              </div>

              <div className="text-white/30 text-xs">
                <p className="flex items-center gap-1">
                  <Link size={12} /> This is a shareable link that will open the document in this app
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}