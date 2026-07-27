// PasswordCracker.tsx
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Key, Zap, Hash, Copy, Check, Download, Upload,
  History, Star, Trash2, Save,
  Database, Plus, AlertTriangle, X,
  Search, Target, BookOpen, Shield, Lock, Eye, GraduationCap
} from 'lucide-react'

// Types
interface HashFile {
  id: string;
  name: string;
  content: string;
  hashType: string;
  hashcatMode: string;
  johnFormat: string;
  uploadedAt: string;
  size: number;
}

interface Wordlist {
  id: string;
  name: string;
  path: string;
  size: number;
  lines: number;
  type: 'rockyou' | 'sec-lists' | 'custom' | 'default';
  uploadedAt: string;
}

interface SavedConfig {
  id: string;
  timestamp: number;
  name: string;
  hashFile: HashFile;
  wordlist?: Wordlist;
  hashType: string;
  command: string;
  attackType: string;
  mask?: string;
  notes?: string;
  favorite?: boolean;
}

// Mock wordlists (these are just examples – you can replace with real lists)
const MOCK_WORDLISTS: Wordlist[] = [
  { id: 'w1', name: 'rockyou.txt', path: '/usr/share/wordlists/rockyou.txt', size: 139921497, lines: 14344392, type: 'rockyou', uploadedAt: '2024-01-01T00:00:00Z' },
  { id: 'w2', name: 'SecLists/Passwords/Common-Credentials/10-million-password-list-top-1000000.txt', path: '/usr/share/SecLists/Passwords/Common-Credentials/10-million-password-list-top-1000000.txt', size: 15000000, lines: 1000000, type: 'sec-lists', uploadedAt: '2024-01-01T00:00:00Z' },
  { id: 'w3', name: 'fasttrack.txt', path: '/usr/share/wordlists/fasttrack.txt', size: 82758, lines: 857, type: 'default', uploadedAt: '2024-01-01T00:00:00Z' },
  { id: 'w4', name: 'darkweb2017-top10000.txt', path: '/usr/share/SecLists/Passwords/Leaked-Databases/darkweb2017-top10000.txt', size: 100000, lines: 10000, type: 'sec-lists', uploadedAt: '2024-01-01T00:00:00Z' },
]

const HASH_TYPES = [
  { name: 'MD5', hashcat: '0', john: 'raw-md5' },
  { name: 'SHA-1', hashcat: '100', john: 'raw-sha1' },
  { name: 'SHA-256', hashcat: '1400', john: 'raw-sha256' },
  { name: 'SHA-512', hashcat: '1700', john: 'raw-sha512' },
  { name: 'NTLM', hashcat: '1000', john: 'nt' },
  { name: 'bcrypt', hashcat: '3200', john: 'bcrypt' },
  { name: 'MD5crypt', hashcat: '500', john: 'md5crypt' },
  { name: 'SHA-256crypt', hashcat: '7400', john: 'sha256crypt' },
  { name: 'SHA-512crypt', hashcat: '1800', john: 'sha512crypt' },
  { name: 'MySQL 4.1+', hashcat: '300', john: 'mysql-sha1' },
  { name: 'Kerberos 5 TGS', hashcat: '13100', john: 'krb5tgs' },
  { name: 'AS-REP Roast', hashcat: '18200', john: 'krb5asrep' },
  { name: 'WPA/WPA2 (mode 22000)', hashcat: '22000', john: 'wpapsk' },
  { name: 'Ethereum Wallet', hashcat: '15700', john: 'ethereum' },
  { name: 'Bitcoin Wallet', hashcat: '11300', john: 'bitcoin' },
]

const ATTACK_TYPES = [
  { id: 'straight', label: 'Dictionary Attack', description: 'Use wordlist directly' },
  { id: 'combinator', label: 'Combinator Attack', description: 'Combine two wordlists' },
  { id: 'mask', label: 'Mask Attack', description: 'Brute force with mask' },
  { id: 'hybrid', label: 'Hybrid Attack', description: 'Wordlist + mask rules' },
]

// Utility
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// ─── COPY BUTTON WITH FALLBACK ───

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    const showSuccess = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }

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
        showSuccess()
      } catch {
        console.debug('Copy fallback failed')
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        showSuccess()
      } catch {
        fallback()
      }
    } else {
      fallback()
    }
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-ghost-text-dim hover:text-ghost-green transition-colors"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? <><Check size={10} className="text-ghost-green" />copied</> : <><Copy size={10} />copy</>}
    </button>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getHashcatMode(hashType: string): string {
  const found = HASH_TYPES.find(h => h.name === hashType)
  return found?.hashcat || '0'
}

function getJohnFormat(hashType: string): string {
  const found = HASH_TYPES.find(h => h.name === hashType)
  return found?.john || 'raw-md5'
}

export default function PasswordCracker() {
  const [activeTab, setActiveTab] = useState<'generator' | 'history' | 'guide'>('generator')
  const [hashFiles, setHashFiles] = useState<HashFile[]>([])
  const [wordlists, _setWordlists] = useState<Wordlist[]>(MOCK_WORDLISTS)
  const [selectedHash, setSelectedHash] = useState<string>('')
  const [selectedWordlist, setSelectedWordlist] = useState<string>('')
  const [selectedAttack, setSelectedAttack] = useState<string>('straight')
  const [configName, setConfigName] = useState('')
  const [hashType, setHashType] = useState('MD5')
  const [mask, setMask] = useState('?l?l?l?l?l?l')
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>(() => {
    try {
      const saved = localStorage.getItem('password_cracker_configs')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const [sortBy, setSortBy] = useState<'date' | 'hashcount'>('date')
  const [error, setError] = useState<string | null>(null)
  const [generatedCommand, setGeneratedCommand] = useState<string>('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  // ─── PERSIST WITH QUOTA ERROR HANDLING ───

  useEffect(() => {
    try {
      localStorage.setItem('password_cracker_configs', JSON.stringify(savedConfigs))
      setError(prev => prev?.startsWith('Failed to save') ? null : prev)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        console.error('password_cracker_configs: localStorage quota exceeded')
        setError('Saved configs not persisting — storage quota exceeded. Consider exporting or removing old configs.')
      } else {
        console.error('Failed to save configs:', err)
        setError('Failed to save configurations: corrupted data')
      }
    }
  }, [savedConfigs])

  // ─── HANDLE FILE UPLOAD ───

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const newHashFile: HashFile = {
          id: generateId(),
          name: file.name,
          content: content,
          hashType: hashType,
          hashcatMode: getHashcatMode(hashType),
          johnFormat: getJohnFormat(hashType),
          uploadedAt: new Date().toISOString(),
          size: file.size,
        }
        setHashFiles(prev => [...prev, newHashFile])
        setSelectedHash(newHashFile.id)
        setError(null)
      } catch {
        setError('Failed to read file')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }, [hashType])

  // ─── GENERATE COMMAND ───

  const generateCommand = useCallback(() => {
    const hashFile = hashFiles.find(h => h.id === selectedHash)
    if (!hashFile) {
      setError('Please select a hash file')
      return
    }

    const needsWordlist = selectedAttack !== 'mask'
    const wordlist = needsWordlist ? wordlists.find(w => w.id === selectedWordlist) : undefined
    if (needsWordlist && !wordlist) {
      setError('Please select a wordlist')
      return
    }

    const hashcatMode = getHashcatMode(hashType)
    let cmd = `hashcat -m ${hashcatMode}`

    // The attack-mode flag (-a) and its positional arguments (hash file, then
    // dictionaries/mask) have to be assembled per-mode — they are NOT just
    // "the usual dictionary command with extra flags tacked on the end".
    if (selectedAttack === 'straight') {
      cmd += ` -a 0 ${hashFile.name} ${wordlist!.path}`
    } else if (selectedAttack === 'combinator') {
      // Combinator uses two dictionaries. Using the same list for both slots is
      // valid syntax but pointless in practice — swap in a second wordlist for a real run.
      cmd += ` -a 1 ${hashFile.name} ${wordlist!.path} ${wordlist!.path}`
    } else if (selectedAttack === 'mask') {
      cmd += ` -a 3 ${hashFile.name} ${mask}`
    } else if (selectedAttack === 'hybrid') {
      cmd += ` -a 6 ${hashFile.name} ${wordlist!.path} ${mask}`
    }

    cmd += ' --force -O'
    setGeneratedCommand(cmd)
    setError(null)
  }, [selectedHash, selectedWordlist, hashFiles, wordlists, hashType, selectedAttack, mask])

  // ─── SAVE CONFIGURATION ───

  const saveConfig = useCallback(() => {
    if (!generatedCommand) {
      setError('Generate a command first')
      return
    }
    const hashFile = hashFiles.find(h => h.id === selectedHash)
    const needsWordlist = selectedAttack !== 'mask'
    const wordlist = wordlists.find(w => w.id === selectedWordlist)
    if (!hashFile || (needsWordlist && !wordlist)) {
      setError('Missing selected files')
      return
    }
    const name = configName.trim() || `Config ${savedConfigs.length + 1}`
    const newConfig: SavedConfig = {
      id: generateId(),
      timestamp: Date.now(),
      name,
      hashFile,
      wordlist,
      hashType,
      command: generatedCommand,
      attackType: selectedAttack,
      mask: selectedAttack === 'mask' ? mask : undefined,
      favorite: false,
    }
    setSavedConfigs(prev => [newConfig, ...prev])
    setConfigName('')
    setError(null)
  }, [generatedCommand, hashFiles, selectedHash, wordlists, selectedWordlist, hashType, selectedAttack, mask, configName, savedConfigs.length])

  // ─── LOAD CONFIG ───

  const loadConfig = useCallback((config: SavedConfig) => {
    // If there's an unsaved command, warn the user before clobbering
    if (generatedCommand && configName.trim() && generatedCommand !== config.command) {
      if (!confirm('Loading this config will replace your current unsaved command. Continue?')) {
        return
      }
    }

    setHashFiles(prev => {
      if (prev.find(h => h.id === config.hashFile.id)) return prev
      return [...prev, config.hashFile]
    })
    setSelectedHash(config.hashFile.id)
    setSelectedWordlist(config.wordlist?.id ?? '')
    setHashType(config.hashType)
    setSelectedAttack(config.attackType)
    if (config.mask) setMask(config.mask)
    setGeneratedCommand(config.command)
    setConfigName(config.name)
    setActiveTab('generator')
  }, [generatedCommand, configName])

  // ─── CRUD OPERATIONS ───

  const deleteSavedConfig = useCallback((id: string) => {
    if (!confirm(`Delete "${savedConfigs.find(c => c.id === id)?.name || 'config'}"?`)) return
    setSavedConfigs(prev => prev.filter(c => c.id !== id))
  }, [savedConfigs])

  const toggleFavorite = useCallback((id: string) => {
    setSavedConfigs(prev => prev.map(c =>
      c.id === id ? { ...c, favorite: !c.favorite } : c
    ))
  }, [])

  const exportConfigs = useCallback(() => {
    if (savedConfigs.length === 0) {
      setError('No configs to export')
      return
    }
    try {
      // Minify JSON for export
      const data = JSON.stringify(savedConfigs)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `password-configs-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to export')
    }
  }, [savedConfigs])

  const importConfigs = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        if (!Array.isArray(data)) {
          setError('Invalid format: expected array')
          return
        }
        if (data.length === 0) {
          setError('File contains no configs')
          return
        }
        // Drop existing entries with the same id; incoming entries win
        const incomingIds = new Set(data.map((c: SavedConfig) => c.id).filter(Boolean))
        setSavedConfigs(prev => {
          const filtered = prev.filter(c => !incomingIds.has(c.id))
          return [...data, ...filtered]
        })
        setError(null)
      } catch {
        setError('Failed to import file')
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }, [])

  const clearAllConfigs = useCallback(() => {
    if (savedConfigs.length === 0) return
    if (!confirm(`Delete all ${savedConfigs.length} saved configs? This cannot be undone.`)) return
    setSavedConfigs([])
  }, [savedConfigs.length])

  // ─── FILTER AND SORT ───

  const filteredConfigs = useMemo(() => {
    let filtered = savedConfigs
    if (showFavorites) {
      filtered = filtered.filter(c => c.favorite)
    }
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase().trim()
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(s) ||
        c.hashType.toLowerCase().includes(s) ||
        (c.wordlist?.name.toLowerCase().includes(s) ?? false)
      )
    }
    // Sort without mutating
    const result = [...filtered]
    if (sortBy === 'date') {
      result.sort((a, b) => b.timestamp - a.timestamp)
    } else if (sortBy === 'hashcount') {
      const hashCount = (c: SavedConfig) => c.hashFile.content.split('\n').length
      result.sort((a, b) => hashCount(b) - hashCount(a))
    }
    return result
  }, [savedConfigs, showFavorites, searchTerm, sortBy])

  // ─── RENDER ───

  return (
    <div className="min-h-screen bg-ghost-bg text-ghost-text p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-ghost-yellow/20 border border-ghost-yellow/30">
              <Key className="text-ghost-yellow" size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                Password Cracking Command Generator
              </h1>
              <p className="text-ghost-text-dim text-sm">Upload hashes, select wordlists, and get hashcat/john commands</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="px-3 py-1.5 text-xs bg-ghost-surface border border-ghost-border rounded-lg font-mono">
              📄 {hashFiles.length} hash files
            </span>
            <span className="px-3 py-1.5 text-xs bg-ghost-purple/10 border border-ghost-purple/30 rounded-lg font-mono text-ghost-purple">
              📚 {savedConfigs.length} saved configs
            </span>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-ghost-red/10 border border-ghost-red/30 rounded-lg text-ghost-red text-sm flex items-center gap-2">
            <AlertTriangle size={16} />
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-ghost-text-dim hover:text-ghost-text"
              aria-label="Dismiss error"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-ghost-border pb-2 flex-wrap" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'generator'}
            onClick={() => setActiveTab('generator')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'generator'
                ? 'bg-ghost-surface text-ghost-yellow border-t border-l border-r border-ghost-border'
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            <Zap size={14} className="inline mr-1" />
            Generator
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'history'
                ? 'bg-ghost-surface text-ghost-yellow border-t border-l border-r border-ghost-border'
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            <History size={14} className="inline mr-1" />
            Saved Configs ({savedConfigs.length})
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'guide'}
            onClick={() => setActiveTab('guide')}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              activeTab === 'guide'
                ? 'bg-ghost-surface text-ghost-yellow border-t border-l border-r border-ghost-border'
                : 'text-ghost-text-dim hover:text-ghost-text'
            }`}
          >
            <BookOpen size={14} className="inline mr-1" />
            Detection, Defense & Labs
          </button>
        </div>

        {/* Generator Tab */}
        {activeTab === 'generator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Input Panel */}
            <div className="lg:col-span-1 space-y-4">
              {/* Config Name */}
              <div className="ghost-panel p-4 rounded-xl border border-ghost-border bg-ghost-surface/50">
                <label htmlFor="configName" className="block text-xs text-ghost-text-dim mb-1 font-mono">Config Name</label>
                <input
                  id="configName"
                  type="text"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                  placeholder="Optional name..."
                  className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-yellow placeholder-ghost-text-dim"
                />
              </div>

              {/* Hash Type */}
              <div className="ghost-panel p-4 rounded-xl border border-ghost-border bg-ghost-surface/50">
                <label htmlFor="hashType" className="block text-xs text-ghost-text-dim mb-1 font-mono">Hash Type</label>
                <select
                  id="hashType"
                  value={hashType}
                  onChange={(e) => setHashType(e.target.value)}
                  className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-yellow"
                >
                  {HASH_TYPES.map(h => (
                    <option key={h.name} value={h.name}>
                      {h.name} (hashcat: -m {h.hashcat})
                    </option>
                  ))}
                </select>
              </div>

              {/* Hash File */}
              <div className="ghost-panel p-4 rounded-xl border border-ghost-border bg-ghost-surface/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-bold text-ghost-yellow flex items-center gap-2">
                    <Hash size={16} />
                    Hash File
                  </h2>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-ghost-purple hover:text-ghost-purple/80 transition-colors"
                    aria-label="Upload hash file"
                  >
                    <Plus size={14} className="inline mr-1" />
                    Upload
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.hash,.hc22000,.hccapx"
                  onChange={handleFileUpload}
                  className="hidden"
                  aria-label="Upload hash file"
                />
                {hashFiles.length === 0 ? (
                  <div className="text-center py-4 border border-dashed border-ghost-border rounded-lg">
                    <Hash size={32} className="text-ghost-text-dim opacity-30 mx-auto mb-1" />
                    <p className="text-ghost-text-dim text-xs">No hash file uploaded</p>
                  </div>
                ) : (
                  <select
                    value={selectedHash}
                    onChange={(e) => setSelectedHash(e.target.value)}
                    className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-yellow"
                    aria-label="Select hash file"
                  >
                    {hashFiles.map(h => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({formatFileSize(h.size)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Wordlist */}
              <div className="ghost-panel p-4 rounded-xl border border-ghost-border bg-ghost-surface/50">
                <h2 className="text-sm font-bold text-ghost-yellow mb-3 flex items-center gap-2">
                  <Database size={16} />
                  Wordlist {selectedAttack === 'mask' && <span className="text-xs text-ghost-text-dim font-normal">(not used for mask attack)</span>}
                </h2>
                <select
                  value={selectedWordlist}
                  onChange={(e) => setSelectedWordlist(e.target.value)}
                  disabled={selectedAttack === 'mask'}
                  className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-yellow disabled:opacity-40"
                  aria-label="Select wordlist"
                >
                  <option value="">Select a wordlist...</option>
                  {wordlists.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({formatFileSize(w.size)})
                    </option>
                  ))}
                </select>
                {selectedAttack === 'combinator' && (
                  <p className="mt-2 text-xs text-ghost-text-dim">
                    ⚠️ Combinator uses two dictionaries. This preview uses the same list for both slots —
                    swap to a second list (e.g. rockyou.txt + common-female-names.txt) for a real run.
                  </p>
                )}
              </div>

              {/* Attack Type */}
              <div className="ghost-panel p-4 rounded-xl border border-ghost-border bg-ghost-surface/50">
                <h2 className="text-sm font-bold text-ghost-yellow mb-3 flex items-center gap-2">
                  <Target size={16} />
                  Attack Type
                </h2>
                <select
                  value={selectedAttack}
                  onChange={(e) => setSelectedAttack(e.target.value)}
                  className="w-full bg-ghost-bg border border-ghost-border rounded-lg px-3 py-2 text-sm text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-yellow"
                  aria-label="Select attack type"
                >
                  {ATTACK_TYPES.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.label} - {a.description}
                    </option>
                  ))}
                </select>

                {selectedAttack === 'mask' && (
                  <div className="mt-2">
                    <label htmlFor="mask" className="text-xs text-ghost-text-dim font-mono">Mask</label>
                    <input
                      id="mask"
                      type="text"
                      value={mask}
                      onChange={(e) => setMask(e.target.value)}
                      placeholder="?l?l?l?l?l?l"
                      className="w-full bg-ghost-bg border border-ghost-border rounded px-2 py-1 mt-1 text-sm text-ghost-text focus:outline-none focus:ring-1 focus:ring-ghost-yellow"
                    />
                  </div>
                )}
              </div>

              {/* Generate Button */}
              <button
                onClick={generateCommand}
                disabled={!selectedHash || (selectedAttack !== 'mask' && !selectedWordlist)}
                className="w-full py-3 bg-gradient-to-r from-ghost-yellow to-orange-400 hover:opacity-90 disabled:opacity-50 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-ghost-yellow/20"
              >
                <Zap size={18} />
                Generate Command
              </button>
            </div>

            {/* Output Panel */}
            <div className="lg:col-span-2 space-y-4">
              {generatedCommand ? (
                <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-bold text-ghost-yellow">Generated Command</h2>
                    <div className="flex gap-2">
                      <CopyBtn text={generatedCommand} />
                      <button
                        onClick={saveConfig}
                        className="px-2 py-1 text-xs bg-ghost-purple/20 border border-ghost-purple/30 text-ghost-purple rounded hover:bg-ghost-purple/30 transition-colors"
                      >
                        <Save size={12} className="inline mr-1" />
                        Save
                      </button>
                    </div>
                  </div>
                  <div className="bg-ghost-bg rounded-lg p-3 border border-ghost-border">
                    <code className="text-sm text-ghost-green font-mono break-all">{generatedCommand}</code>
                  </div>
                  <div className="mt-3 text-xs text-ghost-text-dim">
                    <p>Hash type: {hashType} (hashcat -m {getHashcatMode(hashType)})</p>
                    <p>Wordlist: {selectedAttack === 'mask' ? 'N/A — mask attack uses no wordlist' : wordlists.find(w => w.id === selectedWordlist)?.name}</p>
                    <p>Attack: {ATTACK_TYPES.find(a => a.id === selectedAttack)?.label}</p>
                    {selectedAttack === 'mask' && <p>Mask: {mask}</p>}
                    {selectedAttack === 'combinator' && (
                      <p className="text-ghost-yellow mt-1">⚠️ Combinator preview uses the same wordlist for both slots — replace with a second list for actual use.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-12 text-center">
                  <Key size={48} className="text-ghost-text-dim opacity-30 mx-auto mb-4" />
                  <h3 className="text-lg text-ghost-text mb-2">No Command Generated</h3>
                  <p className="text-ghost-text-dim text-sm">
                    Upload a hash file, select a wordlist, and click "Generate Command"
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-sm font-bold text-ghost-yellow flex items-center gap-2">
                <History size={16} />
                Saved Configs ({savedConfigs.length})
              </h2>
              <div className="flex gap-2 flex-wrap">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ghost-text-dim" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search configs..."
                    className="bg-ghost-bg border border-ghost-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-yellow placeholder-ghost-text-dim w-32 sm:w-48"
                    aria-label="Search saved configs"
                  />
                </div>
                <button
                  onClick={() => setShowFavorites(!showFavorites)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    showFavorites
                      ? 'bg-yellow-400/20 border-yellow-400/30 text-yellow-400'
                      : 'border-ghost-border text-ghost-text-dim hover:text-ghost-text'
                  }`}
                  aria-label="Toggle favorites"
                >
                  <Star size={12} className="inline mr-1" />
                  Favorites
                </button>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'date' | 'hashcount')}
                  className="bg-ghost-bg border border-ghost-border rounded px-2 py-1 text-xs text-ghost-text focus:outline-none focus:ring-2 focus:ring-ghost-yellow"
                  aria-label="Sort saved configs"
                >
                  <option value="date">Sort by Date</option>
                  <option value="hashcount">Sort by Hash Count</option>
                </select>
                <button
                  onClick={exportConfigs}
                  disabled={savedConfigs.length === 0}
                  className="px-2 py-1 text-xs text-ghost-text-dim hover:text-ghost-cyan border border-ghost-border rounded disabled:opacity-40 transition-colors"
                  aria-label="Export configs"
                >
                  <Download size={12} className="inline mr-1" />
                  Export
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="px-2 py-1 text-xs text-ghost-text-dim hover:text-ghost-cyan border border-ghost-border rounded transition-colors"
                  aria-label="Import configs"
                >
                  <Upload size={12} className="inline mr-1" />
                  Import
                </button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json"
                  onChange={importConfigs}
                  className="hidden"
                />
                <button
                  onClick={clearAllConfigs}
                  disabled={savedConfigs.length === 0}
                  className="px-2 py-1 text-xs text-ghost-red/60 hover:text-ghost-red border border-ghost-red/30 rounded disabled:opacity-40 transition-colors"
                  aria-label="Clear all configs"
                >
                  <Trash2 size={12} className="inline mr-1" />
                  Clear All
                </button>
              </div>
            </div>

            {filteredConfigs.length === 0 ? (
              <div className="text-center py-8">
                <Key size={32} className="text-ghost-text-dim opacity-30 mx-auto mb-2" />
                <p className="text-ghost-text-dim text-sm">
                  {showFavorites ? 'No favorite configs' : 'No saved configs'}
                </p>
                <p className="text-ghost-text-dimmer text-xs">
                  {showFavorites ? 'Star a config to add it to favorites' : 'Generate and save a command'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredConfigs.map(config => (
                  <div key={config.id} className="bg-ghost-bg/50 rounded-lg p-3 border border-ghost-border hover:border-ghost-yellow/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {config.favorite && <Star size={12} className="text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                          <span className="text-sm font-bold text-ghost-yellow truncate">{config.name}</span>
                          <span className="text-xs text-ghost-text-dim flex-shrink-0">{new Date(config.timestamp).toLocaleString()}</span>
                          <span className="text-xs text-ghost-text-dim flex-shrink-0">{config.hashType}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-ghost-text-dim flex-wrap">
                          <span>📄 {config.hashFile.name}</span>
                          <span>•</span>
                          <span>📚 {config.wordlist?.name ?? 'N/A (mask attack)'}</span>
                          <span>•</span>
                          <span>⚡ {config.attackType}</span>
                        </div>
                        <div className="mt-1 bg-ghost-bg rounded px-2 py-1 border border-ghost-border truncate">
                          <code className="text-xs text-ghost-green font-mono">{config.command}</code>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => toggleFavorite(config.id)}
                          className={`p-1 transition-colors ${
                            config.favorite ? 'text-yellow-400' : 'text-ghost-text-dim hover:text-yellow-400'
                          }`}
                          aria-label={config.favorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star size={14} />
                        </button>
                        <button
                          onClick={() => loadConfig(config)}
                          className="p-1 text-ghost-text-dim hover:text-ghost-purple transition-colors"
                          title="Load config"
                          aria-label="Load config"
                        >
                          <Zap size={14} />
                        </button>
                        <button
                          onClick={() => deleteSavedConfig(config.id)}
                          className="p-1 text-ghost-text-dim hover:text-ghost-red transition-colors"
                          title="Delete"
                          aria-label="Delete config"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Guide Tab */}
        {activeTab === 'guide' && (
          <div className="space-y-6">
            <div className="ghost-panel rounded-xl border border-ghost-border bg-ghost-surface/50 p-4">
              <h2 className="text-sm font-bold text-ghost-yellow mb-2 flex items-center gap-2">
                <Target size={16} /> Attack Modes: Why This Bug Mattered
              </h2>
              <p className="text-sm text-ghost-text-dim">
                Before the fix, this tool generated a mask attack as <code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green">hashcat -m 0 hash.txt wordlist.txt -a 3 mask --force -O</code> —
                a wordlist positional argument followed by an attack flag that doesn't belong with it. hashcat's
                argument order matters: <code className="bg-white/5 px-1.5 py-0.5 rounded text-ghost-green">-a</code> has
                to come before the positional hash-file/dictionary/mask arguments, and which positional arguments are even
                valid depends entirely on the attack mode:
              </p>
              <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5 mt-2">
                <li><strong className="text-ghost-text">-a 0 (straight):</strong> hashfile, then one dictionary.</li>
                <li><strong className="text-ghost-text">-a 1 (combinator):</strong> hashfile, then two dictionaries — every word from list 1 gets every word from list 2 appended to it.</li>
                <li><strong className="text-ghost-text">-a 3 (brute-force/mask):</strong> hashfile, then a mask — <em>no dictionary at all</em>. The mask itself generates candidates.</li>
                <li><strong className="text-ghost-text">-a 6 (hybrid, dict+mask):</strong> hashfile, dictionary, then mask — appends brute-forced characters to each dictionary word.</li>
                <li><strong className="text-ghost-text">-a 7 (hybrid, mask+dict):</strong> hashfile, mask, then dictionary — the reverse of -a 6.</li>
              </ul>
              <p className="text-sm text-ghost-text-dim mt-2">
                The lesson generalizes: never assume a CLI tool's flags "just get appended" regardless of mode. If a
                flag changes what a positional argument means, it changes what has to come before or after it too.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
                <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
                  <Eye size={16} className="text-ghost-yellow" /> Detection Opportunities
                </h3>
                <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
                  <li>Offline cracking itself (hashcat/john running on an attacker's own hardware) is invisible to the victim network — the detectable part is almost always <em>how the hashes got obtained</em>, not the cracking.</li>
                  <li>Kerberoasting (grabbing TGS tickets to crack offline, hashcat mode 13100) shows up as a spike in service ticket requests (Event ID 4769) for accounts with SPNs, especially with weak encryption types (RC4 instead of AES).</li>
                  <li>AS-REP roasting (mode 18200) is detectable via repeated AS-REQ requests for accounts with "Do not require Kerberos preauthentication" set — that flag itself is the finding, before any cracking happens.</li>
                  <li>Dumping NTLM hashes (e.g. via a DCSync or LSASS dump) triggers EDR alerts and specific event log signatures (Event ID 4662 for DCSync-style replication requests).</li>
                  <li>Large numbers of failed logon attempts from cracked-and-tried credentials (credential stuffing after a successful crack) shows up as Event ID 4625 spikes.</li>
                </ul>
              </div>
              <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
                <h3 className="font-semibold text-ghost-text mb-2 flex items-center gap-2">
                  <Lock size={16} className="text-ghost-yellow" /> Defensive Controls
                </h3>
                <ul className="text-sm space-y-1.5 text-ghost-text-dim list-disc pl-5">
                  <li>Long passphrases beat complexity rules — length increases keyspace exponentially; a 20-character passphrase resists cracking far better than an 8-character "complex" password.</li>
                  <li>Enforce AES for Kerberos service tickets and disable RC4 where possible, to make Kerberoasting yield far more expensive hashes to crack.</li>
                  <li>Require Kerberos pre-authentication for all accounts to eliminate AS-REP roasting entirely.</li>
                  <li>Use Managed Service Accounts (MSAs/gMSAs) for service accounts so their passwords are long, random, and rotated automatically — removing the human-chosen-password weak link.</li>
                  <li>Monitor for and alert on ticket requests with unusual encryption downgrade patterns and on DCSync-style replication events from non-DC hosts.</li>
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-sm font-bold text-ghost-yellow flex items-center gap-2">
                <GraduationCap size={16} /> Labs & Challenges
              </h2>

              <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
                <div className="font-semibold flex items-center gap-2">
                  <span className="bg-ghost-yellow/20 px-2 py-0.5 rounded text-xs">Lab 1</span>
                  Crack Your Own Hash — Straight vs Mask
                </div>
                <ol className="text-sm text-ghost-text-dim list-decimal list-inside space-y-1 mt-2">
                  <li>Generate an MD5 hash of a short, common password (e.g. <code className="bg-white/5 px-1 rounded">echo -n "password1" | md5sum</code>).</li>
                  <li>Crack it with a straight dictionary attack using rockyou.txt. Note the time it takes.</li>
                  <li>Now generate a hash of a random 6-character lowercase string and crack it with a mask attack (<code className="bg-white/5 px-1 rounded">?l?l?l?l?l?l</code>) instead. Compare the time.</li>
                </ol>
                <p className="text-xs text-ghost-text-dim mt-2">
                  <strong className="text-ghost-text">Check yourself:</strong> why would a dictionary attack against the random 6-character string almost certainly fail, no matter how big the wordlist?
                </p>
              </div>

              <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
                <div className="font-semibold flex items-center gap-2">
                  <span className="bg-ghost-yellow/20 px-2 py-0.5 rounded text-xs">Lab 2</span>
                  Kerberoasting End-to-End (Lab AD Only)
                </div>
                <ol className="text-sm text-ghost-text-dim list-decimal list-inside space-y-1 mt-2">
                  <li>In an authorized lab Active Directory (e.g. a GOAD or similar practice domain), find an account with an SPN set.</li>
                  <li>Request its TGS ticket and export it in a crackable format (e.g. via Impacket's GetUserSPNs.py).</li>
                  <li>Crack the resulting hash with hashcat mode 13100 against rockyou.txt.</li>
                  <li>Now check what encryption type the ticket used — RC4 or AES — and explain how that changed the cracking difficulty.</li>
                </ol>
                <p className="text-xs text-ghost-text-dim mt-2">
                  <strong className="text-ghost-text">Check yourself:</strong> what single AD configuration change would make this specific service account far more resistant to Kerberoasting, without touching the account's actual password?
                </p>
              </div>

              <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
                <div className="font-semibold flex items-center gap-2">
                  <span className="bg-ghost-yellow/20 px-2 py-0.5 rounded text-xs">Lab 3</span>
                  Rules-Based Cracking
                </div>
                <ol className="text-sm text-ghost-text-dim list-decimal list-inside space-y-1 mt-2">
                  <li>Take a password like <code className="bg-white/5 px-1 rounded">Summer2024!</code> and hash it.</li>
                  <li>Try cracking it with plain rockyou.txt (straight attack) — it will very likely fail.</li>
                  <li>Now research hashcat's <code className="bg-white/5 px-1 rounded">-r</code> rule flag (e.g. <code className="bg-white/5 px-1 rounded">best64.rule</code>) and re-run with rules applied against the same wordlist.</li>
                </ol>
                <p className="text-xs text-ghost-text-dim mt-2">
                  <strong className="text-ghost-text">Check yourself:</strong> in plain terms, what does a hashcat rule actually do to each word in the wordlist before it's tried as a guess?
                </p>
              </div>
            </div>

            <div className="bg-ghost-bg/50 rounded-xl p-4 border border-ghost-border/50">
              <h3 className="font-semibold flex items-center gap-2">
                <Shield size={16} className="text-ghost-yellow" /> Quick Self-Quiz (No Looking Up Answers)
              </h3>
              <ol className="text-sm text-ghost-text-dim space-y-2 list-decimal list-inside pl-1 mt-2">
                <li>Why does a mask attack need no wordlist, while a straight attack needs exactly one and a combinator attack needs two?</li>
                <li>Why is hashcat mode 22000 the correct one to use today for WPA/WPA2, instead of the older mode 2500 you'll still see in a lot of tutorials?</li>
                <li>What makes bcrypt (mode 3200) dramatically slower to crack per-guess than raw MD5 (mode 0), even against the exact same wordlist?</li>
                <li>If Kerberoasting gets you a crackable hash but the account uses AES instead of RC4, what actually changed about the cracking difficulty — and what didn't?</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}