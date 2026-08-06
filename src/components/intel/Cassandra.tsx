import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bug, Newspaper, GitBranch, RefreshCw, ExternalLink, Clock, AlertCircle,
  Star, MessageSquare, ShieldAlert, Radar, Info, ChevronDown, ChevronUp,
  BookOpen, CheckCircle2, XCircle, ChevronRight, RotateCcw
} from 'lucide-react'

type Tab = 'cves' | 'news' | 'tools' | 'sources' | 'quiz'
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' | 'INFO'

interface CveItem {
  id: string
  description: string
  severity: Severity
  score: number | null
  published: string
}

interface NewsItem {
  id: number
  title: string
  url: string
  points: number
  comments: number
  time: number
}

interface RepoItem {
  name: string
  full_name: string
  description: string
  stars: number
  url: string
  language: string
  updated: string
}

interface KeVItem {
  cveID: string
  vendorProject?: string
  product?: string
  vulnerabilityName?: string
  dateAdded?: string
  shortDescription?: string
  requiredAction?: string
  dueDate?: string
  notes?: string
  knownRansomwareCampaignUse?: string
  cwes?: string[]
}

// Allow extras in API response
interface KEVResponse {
  vulnerabilities?: unknown[]
  [key: string]: unknown
}

const SEVERITY_STYLES: Record<Severity, string> = {
  CRITICAL: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  HIGH: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  LOW: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  INFO: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  UNKNOWN: 'bg-ghost-border/40 text-ghost-text-dim border-ghost-border',
}

const SECURITY_KEYWORDS = [
  'cve', 'vulnerabilit', 'exploit', 'breach', 'ransomware', 'malware',
  'zero-day', 'zero day', 'hack', 'leak', 'backdoor', 'phishing',
  'patch', 'security', 'apt', 'threat', 'ddos', 'infosec', 'pwn',
  'rce', 'lpe', 'auth bypass', 'sqli', 'xss', 'ssrf', 'csrf', 'privesc'
]

// ─── KEYWORD SYNONYMS FOR QUIZ ───

const KEYWORD_SYNONYMS: Record<string, string[]> = {
  'EPSS': ['exploitation probability', 'exploit likelihood', 'real-world exploitation', 'epss score', 'probability of exploitation'],
  'KEV catalog': ['known exploited', 'kev', 'confirmed exploitation', 'actively exploited', 'cisa catalog', 'known exploited vulnerabilities'],
  'publication date': ['publish date', 'published date', 'logged', 'publication time', 'when nvd logged'],
  'actual discovery time': ['discovery date', 'found date', 'when discovered', 'discovered'],
  'exploitation probability': ['exploit probability', 'chance of exploit', 'likelihood of exploit', 'epss'],
  'pattern recognition': ['recurring patterns', 'patterns', 'recognizing patterns', 'bug classes'],
  'cross-referencing': ['cross reference', 'verify', 'look up', 'check against'],
  'investigation trigger': ['prompt to investigate', 'investigate further', 'look deeper', 'investigation'],
  'tutorial consumption': ['reading without doing', 'passive reading', 'not applying', 'just reading'],
  'stars vs quality': ['stars don\'t mean quality', 'popularity vs quality', 'not a quality signal', 'popularity metric'],
  'author credibility': ['who wrote it', 'author reputation', 'source credibility', 'trusted author'],
  'actual adoption': ['real usage', 'adoption', 'used by others', 'real users'],
  'viral factors': ['went viral', 'tweet', 'flashy demo', 'popularity from social media', 'virality'],
}

const CACHE_TTL_MS: Record<string, number> = {
  cves: 5 * 60 * 1000,        // 5 minutes
  news: 5 * 60 * 1000,        // 5 minutes
  repos: 5 * 60 * 1000,       // 5 minutes
  kev: 6 * 60 * 60 * 1000,    // 6 hours (reduced from 24h)
}

// Namespaced cache key
const CACHE_KEY = 'obscurum_cassandra_cache'
const QUIZ_STORAGE_KEY = 'obscurum_cassandra_quiz'

interface CacheData {
  cves: CveItem[]
  news: NewsItem[]
  repos: RepoItem[]
  kev: KeVItem[]
  timestamp: Record<string, number>
}

// ─── HELPERS ───

function decodeHtml(text: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/html')
  return doc.body.textContent || text
}

function timeAgo(dateStr: string | number) {
  const then = typeof dateStr === 'number' ? dateStr * 1000 : new Date(dateStr).getTime()
  const diffMs = Date.now() - then
  const hrs = Math.floor(diffMs / 3600000)
  if (hrs < 1) return `${Math.floor(diffMs / 60000)}m ago`
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function scoreToSeverity(score: number | null): Severity {
  if (score === null) return 'UNKNOWN'
  if (score === 0) return 'INFO'
  if (score >= 9) return 'CRITICAL'
  if (score >= 7) return 'HIGH'
  if (score >= 4) return 'MEDIUM'
  return 'LOW'
}

function validateUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url
    }
    return null
  } catch {
    return null
  }
}

function isCacheFresh(key: 'cves' | 'news' | 'repos' | 'kev'): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return false
    const data: CacheData = JSON.parse(raw)
    const ts = data.timestamp?.[key]
    if (!ts) return false
    const ttl = CACHE_TTL_MS[key]
    if (!ttl) return false
    return Date.now() - ts < ttl
  } catch {
    return false
  }
}

function getCachedFeed<K extends keyof CacheData>(key: K): CacheData[K] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data: CacheData = JSON.parse(raw)
    return data[key] || null
  } catch {
    return null
  }
}

function setCachedData(data: Omit<CacheData, 'timestamp'> & { timestamp: Record<string, number> }) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.error('obscurum_cassandra_cache: localStorage quota exceeded — cache will not persist across reloads')
    } else {
      console.error('obscurum_cassandra_cache: write failed', err)
    }
  }
}

function readKevLastSync(): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.timestamp?.kev) {
      return new Date(data.timestamp.kev).toLocaleString()
    }
  } catch {}
  return null
}

// ─── QUIZ PERSISTENCE ───

type QuizResult = { correct: boolean; userAnswer: string; correctAnswer: string }

function loadQuizResults(): QuizResult[] {
  try {
    const raw = localStorage.getItem(QUIZ_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
    return []
  } catch {
    return []
  }
}

function saveQuizResults(results: QuizResult[]) {
  try {
    localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(results))
  } catch {
    console.error('Failed to persist quiz results')
  }
}

// ─── COMPONENTS ───

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="ghost-card p-8 rounded-xl border border-ghost-border flex items-center justify-center gap-3 text-ghost-text-dim text-sm">
      <RefreshCw size={16} className="animate-spin" /> {label}
    </div>
  )
}

function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="ghost-card p-4 rounded-xl border border-rose-500/30 bg-rose-950/10 flex gap-3 text-sm text-rose-200">
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {message}
    </div>
  )
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="ghost-card p-8 rounded-xl border border-ghost-border text-center text-ghost-text-dim text-sm">
      {label}
    </div>
  )
}

// ─── QUIZ PANEL ───

function QuizPanel() {
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [userAnswer, setUserAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<QuizResult[]>(loadQuizResults)
  const [showAll, setShowAll] = useState(false)

  const questions = [
    {
      q: "This dashboard's CVE tab is sorted by NVD publication date. Why is publication date a weak proxy for 'how urgent is this,' and what two data points would you actually check before prioritizing a CVE you saw here?",
      a: "Publication date only tells you when NVD logged the entry — not when the flaw was actually discovered, how long it existed unpatched, or how dangerous it is. You'd check EPSS (real-world exploitation probability) and whether it's listed in CISA's KEV catalog (confirmed active exploitation) before treating a freshly-published CVE as more urgent than an older one.",
      keyConcepts: ['publication date', 'EPSS', 'KEV catalog', 'actual discovery time', 'exploitation probability']
    },
    {
      q: "The Security News tab does keyword matching on titles (words like 'exploit', 'breach', 'cve'). Give one concrete example of a real security story this would miss, and one example of a false positive it would include.",
      a: "Miss: a major breach story titled with a company name and no security-specific word (e.g. 'Acme Corp notifies 2 million customers') would never match. False positive: an article about a software 'patch' for a UI bug, or a game studio 'hack' meaning a clever workaround, would match the keyword list without being a real security story.",
      keyConcepts: ['keyword matching', 'false positives', 'false negatives', 'security-specific language']
    },
    {
      q: "A repo shows up in the Trending Tools tab with 3,000 stars gained in the last two weeks. What should you check before treating that popularity as a signal of quality, and why might a security tool go viral for reasons unrelated to how good it is?",
      a: "Check: who wrote it (an established security researcher/org vs. an anonymous account), whether it has real usage/issues/PRs indicating actual adoption vs. just stars, and whether the README's claims match what the code does. A tool can go viral from a single popular tweet or a flashy demo GIF regardless of code quality, security, or whether it actually works reliably.",
      keyConcepts: ['stars vs quality', 'author credibility', 'actual adoption', 'viral factors']
    },
    {
      q: "You've been checking this dashboard every morning for two weeks straight. What's the actual skill you should be building from that habit, versus the failure mode of just glancing at it and moving on?",
      a: "The actual skill is pattern recognition across recurring bug classes (which CWEs keep showing up, which attack types are trending) and building the reflex to cross-reference anything relevant against KEV/EPSS before acting — not memorizing individual CVE IDs. Just glancing at headlines daily without ever clicking through and verifying is exactly the tutorial-consumption habit to avoid; the dashboard is the trigger for investigation, not the investigation itself.",
      keyConcepts: ['pattern recognition', 'cross-referencing', 'investigation trigger', 'tutorial consumption']
    },
  ]

  // Persist quiz results
  useEffect(() => {
    saveQuizResults(results)
  }, [results])

  const handleSubmit = () => {
    if (!userAnswer.trim()) return
    
    const q = questions[currentQuestion]
    const normalizedAnswer = userAnswer.toLowerCase()
    
    // Check which key concepts are present, using synonyms
    const matchedConcepts = q.keyConcepts.filter(concept => {
      const variants = [concept.toLowerCase(), ...(KEYWORD_SYNONYMS[concept] || []).map(v => v.toLowerCase())]
      return variants.some(v => normalizedAnswer.includes(v))
    })
    
    const isSubstantive = userAnswer.split(' ').length > 10
    const correct = matchedConcepts.length >= 2 && isSubstantive
    
    const newResults = [...results, {
      correct,
      userAnswer: userAnswer,
      correctAnswer: q.a
    }]
    setResults(newResults)
    setSubmitted(true)
  }

  const nextQuestion = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(prev => prev + 1)
      setUserAnswer('')
      setSubmitted(false)
    } else {
      setShowAll(true)
    }
  }

  const reset = () => {
    setCurrentQuestion(0)
    setUserAnswer('')
    setSubmitted(false)
    setResults([])
    setShowAll(false)
    saveQuizResults([])
  }

  const answered = results.length
  const correctCount = results.filter(r => r.correct).length

  if (showAll) {
    return (
      <div className="ghost-card p-6 rounded-2xl border border-ghost-border space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h2 className="text-xl font-semibold flex items-center gap-2"><BookOpen size={18} /> Results</h2>
          <div className="text-sm text-ghost-text-dim">{answered}/{questions.length} answered · {correctCount} correct</div>
        </div>
        
        {results.map((result, idx) => (
          <div key={idx} className={`p-4 rounded-xl border ${result.correct ? 'border-emerald-500/30 bg-emerald-950/10' : 'border-rose-500/30 bg-rose-950/10'}`}>
            <div className="flex items-center gap-2 mb-2">
              {result.correct ? <CheckCircle2 className="text-emerald-400" size={18} /> : <XCircle className="text-rose-400" size={18} />}
              <span className="font-medium">Question {idx + 1}</span>
            </div>
            <div className="text-sm text-ghost-text-dim space-y-2">
              <p><strong>Your answer:</strong> {result.userAnswer}</p>
              <div className="p-3 bg-black/20 rounded-lg">
                <p><strong>Expected answer:</strong> {result.correctAnswer}</p>
              </div>
            </div>
          </div>
        ))}
        
        <div className="p-4 bg-ghost-bg rounded-xl flex justify-between items-center flex-wrap gap-2">
          <div className="text-sm">
            <strong className={correctCount === questions.length ? 'text-emerald-400' : 'text-amber-400'}>{correctCount}/{questions.length}</strong>{' '}
            <span className="text-ghost-text-dim">
              — {correctCount === questions.length
                ? "You understand the tool's blind spots, not just its buttons. Now go verify one CVE from today's feed against KEV/EPSS manually instead of trusting the dashboard's default sort."
                : "Whatever you missed, don't just reread the panel above — go find a real example on today's live feed that demonstrates the gap you missed."}
            </span>
          </div>
          <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg border border-ghost-border flex items-center gap-1.5 flex-shrink-0">
            <RotateCcw size={12} /> Retry Quiz
          </button>
        </div>
      </div>
    )
  }

  const q = questions[currentQuestion]

  return (
    <div className="ghost-card p-6 rounded-2xl border border-ghost-border space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-xl font-semibold flex items-center gap-2"><BookOpen size={18} /> Self-Check — Active Recall</h2>
        <div className="text-sm text-ghost-text-dim">{answered}/{questions.length} answered · {correctCount} correct</div>
      </div>
      <p className="text-sm text-ghost-text-dim">
        Answer before revealing. These test whether you understand the dashboard's blind spots, not whether you
        can find the buttons. Write a substantive answer — this is about thinking, not guessing.
      </p>

      <div className="p-5 bg-ghost-bg rounded-xl border border-ghost-border">
        <div className="text-xs text-emerald-400 font-mono mb-2">QUESTION {currentQuestion + 1} / {questions.length}</div>
        <p className="font-medium mb-4">{q.q}</p>

        <textarea
          value={userAnswer}
          onChange={(e) => setUserAnswer(e.target.value)}
          disabled={submitted}
          placeholder="Write your answer here..."
          className="w-full p-3 bg-black/20 rounded-lg border border-ghost-border text-sm min-h-[100px] resize-y disabled:opacity-50"
        />

        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!userAnswer.trim()}
            className="mt-3 text-sm px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            Submit Answer
          </button>
        ) : (
          <div className="space-y-4 mt-4">
            <div className={`p-4 rounded-lg border ${results[results.length - 1].correct ? 'border-emerald-500/30 bg-emerald-950/10' : 'border-rose-500/30 bg-rose-950/10'}`}>
              <div className="flex items-center gap-2 mb-2">
                {results[results.length - 1].correct ? 
                  <CheckCircle2 className="text-emerald-400" size={16} /> : 
                  <XCircle className="text-rose-400" size={16} />
                }
                <span className="font-medium">
                  {results[results.length - 1].correct ? 'Good! You identified key concepts.' : 'Review the key concepts you missed:'}
                </span>
              </div>
              <div className="text-sm text-ghost-text-dim">
                <p className="mb-2"><strong>Expected answer:</strong> {q.a}</p>
                <div className="p-3 bg-black/20 rounded-lg">
                  <strong>Key concepts to include:</strong>
                  <ul className="list-disc pl-5 mt-1">
                    {q.keyConcepts.map(concept => (
                      <li key={concept}>{concept}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            <button onClick={nextQuestion} className="text-sm px-4 py-2 rounded-lg bg-emerald-500 text-black font-medium flex items-center gap-1">
              {currentQuestion < questions.length - 1 ? 'Next Question' : 'See Results'} <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MAIN COMPONENT ───

export default function CassandraProphecy() {
  const [activeTab, setActiveTab] = useState<Tab>('cves')
  const [cves, setCves] = useState<CveItem[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [repos, setRepos] = useState<RepoItem[]>([])
  const [kev, setKev] = useState<KeVItem[]>([])
  const [loading, setLoading] = useState({ cves: false, news: false, repos: false, kev: false })
  const [errors, setErrors] = useState({ cves: '', news: '', repos: '', kev: '' })
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [expandedCve, setExpandedCve] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [kevLastSync, setKevLastSync] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL')
  
  const abortControllers = useRef<AbortController[]>([])
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cooldownIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cleanupControllers = () => {
    abortControllers.current.forEach(ctrl => ctrl.abort())
    abortControllers.current = []
  }

  // ─── FETCH FUNCTIONS ───

  const fetchCves = useCallback(async (signal?: AbortSignal): Promise<CveItem[]> => {
    setLoading(l => ({ ...l, cves: true }))
    setErrors(e => ({ ...e, cves: '' }))
    
    try {
      const end = new Date()
      const start = new Date(end.getTime() - 7 * 24 * 3600 * 1000)
      const fmt = (d: Date) => d.toISOString().split('.')[0] + '.000'
      const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=25&pubStartDate=${fmt(start)}&pubEndDate=${fmt(end)}`
      
      const res = await fetch(url, { 
        signal,
        headers: {
          'Accept': 'application/json'
        }
      })
      
      if (!res.ok) throw new Error(`NVD API returned ${res.status}`)
      const data = await res.json()
      const items: CveItem[] = (data.vulnerabilities || []).map((v: any) => {
        const cve = v.cve
        const metrics = cve.metrics?.cvssMetricV31?.[0] || cve.metrics?.cvssMetricV30?.[0] || cve.metrics?.cvssMetricV2?.[0]
        const score = metrics ? metrics.cvssData.baseScore : null
        const rawDesc = cve.descriptions?.find((d: any) => d.lang === 'en')?.value || 'No description available'
        return {
          id: cve.id,
          description: decodeHtml(rawDesc),
          severity: scoreToSeverity(score),
          score,
          published: cve.published,
        }
      }).sort((a: CveItem, b: CveItem) => new Date(b.published).getTime() - new Date(a.published).getTime())
      
      setCves(items)
      return items
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err
      }
      const errorMsg = `Couldn't reach NVD (${err.message}). NVD rate-limits unauthenticated requests hard — wait a bit and retry.`
      setErrors(e => ({ ...e, cves: errorMsg }))
      throw new Error(errorMsg)
    } finally {
      setLoading(l => ({ ...l, cves: false }))
    }
  }, [])

  const fetchKev = useCallback(async (signal?: AbortSignal): Promise<KeVItem[]> => {
    if (isCacheFresh('kev')) {
      const cached = getCachedFeed('kev')
      if (cached) {
        setKev(cached)
        const sync = readKevLastSync()
        if (sync) setKevLastSync(sync)
        return cached
      }
    }
    
    setLoading(l => ({ ...l, kev: true }))
    setErrors(e => ({ ...e, kev: '' }))
    
    try {
      const url = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`CISA KEV API returned ${res.status}`)
      const data: KEVResponse = await res.json()
      
      const isValidKeVItem = (item: unknown): item is KeVItem => {
        return typeof item === 'object' && 
               item !== null &&
               'cveID' in item &&
               typeof (item as any).cveID === 'string'
      }
      
      // Filter to recent KEV entries (last 30 days) to keep cache size manageable
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
      const vulns = (data.vulnerabilities || [])
        .filter(isValidKeVItem)
        .filter(v => {
          if (!v.dateAdded) return true
          return new Date(v.dateAdded).getTime() > thirtyDaysAgo
        })
      
      setKev(vulns)
      setKevLastSync(new Date().toLocaleString())
      return vulns
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err
      }
      const errorMsg = `Couldn't reach CISA KEV (${err.message}).`
      setErrors(e => ({ ...e, kev: errorMsg }))
      throw new Error(errorMsg)
    } finally {
      setLoading(l => ({ ...l, kev: false }))
    }
  }, [])

  const fetchNews = useCallback(async (signal?: AbortSignal): Promise<NewsItem[]> => {
    setLoading(l => ({ ...l, news: true }))
    setErrors(e => ({ ...e, news: '' }))
    
    try {
      const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { signal })
      if (!topRes.ok) throw new Error(`HN API returned ${topRes.status}`)
      const ids: number[] = await topRes.json()
      
      const candidates = ids.slice(0, 30)
      const batchSize = 5
      const items: NewsItem[] = []
      
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize)
        const batchResults = await Promise.all(
          batch.map(id => 
            fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal })
              .then(r => r.json())
          )
        )
        
        const filtered = batchResults
          .filter((it): it is any => it && it.title && SECURITY_KEYWORDS.some(kw => it.title.toLowerCase().includes(kw)))
          .map(it => {
            let validatedUrl = it.url || `https://news.ycombinator.com/item?id=${it.id}`
            const validated = validateUrl(validatedUrl)
            if (!validated) {
              validatedUrl = `https://news.ycombinator.com/item?id=${it.id}`
            }
            
            return {
              id: it.id,
              title: it.title,
              url: validatedUrl,
              points: it.score || 0,
              comments: it.descendants || 0,
              time: it.time,
            }
          })
        
        items.push(...filtered)
      }
      
      items.sort((a, b) => b.time - a.time)
      
      setNews(items)
      return items
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err
      }
      const errorMsg = `Couldn't reach Hacker News API (${err.message}).`
      setErrors(e => ({ ...e, news: errorMsg }))
      throw new Error(errorMsg)
    } finally {
      setLoading(l => ({ ...l, news: false }))
    }
  }, [])

  const fetchRepos = useCallback(async (signal?: AbortSignal): Promise<RepoItem[]> => {
    setLoading(l => ({ ...l, repos: true }))
    setErrors(e => ({ ...e, repos: '' }))
    
    try {
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().split('T')[0]
      const url = `https://api.github.com/search/repositories?q=topic:security+pushed:>${since}&sort=stars&order=desc&per_page=15`
      
      const res = await fetch(url, { 
        signal,
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      })
      
      if (!res.ok) throw new Error(`GitHub API returned ${res.status} (likely rate-limited, ~10 unauthenticated req/min)`)
      const data = await res.json()
      const items: RepoItem[] = (data.items || []).map((r: any) => ({
        name: r.name,
        full_name: r.full_name,
        description: r.description || 'No description',
        stars: r.stargazers_count,
        url: r.html_url,
        language: r.language || 'N/A',
        updated: r.pushed_at,
      }))
      setRepos(items)
      return items
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err
      }
      const errorMsg = err.message
      setErrors(e => ({ ...e, repos: errorMsg }))
      throw new Error(errorMsg)
    } finally {
      setLoading(l => ({ ...l, repos: false }))
    }
  }, [])

  // ─── REFRESH ───

  const refreshAll = useCallback(async () => {
    cleanupControllers()
    
    const controller = new AbortController()
    abortControllers.current.push(controller)
    
    const cvesStale = !isCacheFresh('cves')
    const newsStale = !isCacheFresh('news')
    const reposStale = !isCacheFresh('repos')
    const kevStale = !isCacheFresh('kev')
    
    const cachedCves = getCachedFeed('cves')
    const cachedNews = getCachedFeed('news')
    const cachedRepos = getCachedFeed('repos')
    const cachedKev = getCachedFeed('kev')
    
    if (cachedCves) setCves(cachedCves)
    if (cachedNews) setNews(cachedNews)
    if (cachedRepos) setRepos(cachedRepos)
    if (cachedKev) {
      setKev(cachedKev)
      const sync = readKevLastSync()
      if (sync) setKevLastSync(sync)
    }
    
    setLoading(prev => ({
      cves: cvesStale ? true : prev.cves,
      news: newsStale ? true : prev.news,
      repos: reposStale ? true : prev.repos,
      kev: kevStale ? true : prev.kev,
    }))
    
    setErrors({ cves: '', news: '', repos: '', kev: '' })
    
    const fetches: Array<{ 
      key: 'cves' | 'news' | 'repos' | 'kev'
      promise: Promise<CveItem[] | NewsItem[] | RepoItem[] | KeVItem[]>
    }> = []
    
    if (cvesStale) {
      fetches.push({ key: 'cves', promise: fetchCves(controller.signal) })
    }
    if (newsStale) {
      fetches.push({ key: 'news', promise: fetchNews(controller.signal) })
    }
    if (reposStale) {
      fetches.push({ key: 'repos', promise: fetchRepos(controller.signal) })
    }
    if (kevStale) {
      fetches.push({ key: 'kev', promise: fetchKev(controller.signal) })
    }
    
    if (fetches.length === 0) {
      setLoading({ cves: false, news: false, repos: false, kev: false })
      return
    }
    
    const results = await Promise.allSettled(
      fetches.map(({ promise }) => promise)
    )
    
    const baseData: CacheData = {
      cves: cachedCves || [],
      news: cachedNews || [],
      repos: cachedRepos || [],
      kev: cachedKev || [],
      timestamp: {}
    }
    
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        if (data.timestamp) {
          baseData.timestamp = data.timestamp
        }
      }
    } catch {}
    
    const newTimestamp = { ...baseData.timestamp }
    let anySuccess = false
    
    results.forEach((result, index) => {
      const { key } = fetches[index]
      
      if (result.status === 'fulfilled') {
        anySuccess = true
        if (key === 'cves') setCves(result.value as CveItem[])
        else if (key === 'news') setNews(result.value as NewsItem[])
        else if (key === 'repos') setRepos(result.value as RepoItem[])
        else if (key === 'kev') {
          setKev(result.value as KeVItem[])
          setKevLastSync(new Date().toLocaleString())
        }
        baseData[key as keyof Omit<CacheData, 'timestamp'>] = result.value as any
        newTimestamp[key] = Date.now()
      } else {
        console.error(`Failed to fetch ${key}:`, result.reason)
      }
    })
    
    if (anySuccess) {
      setCachedData({
        cves: baseData.cves,
        news: baseData.news,
        repos: baseData.repos,
        kev: baseData.kev,
        timestamp: newTimestamp
      })
      setLastRefresh(new Date())
    } else {
      // All fetches failed — don't penalize the user with a 30s wait
      setCooldown(0)
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current)
        cooldownIntervalRef.current = null
      }
    }
    
    setLoading({ cves: false, news: false, repos: false, kev: false })
  }, [fetchCves, fetchNews, fetchRepos, fetchKev])

  // ─── DEBOUNCED REFRESH ───

  const debouncedRefresh = useCallback(() => {
    if (cooldown > 0 || refreshTimeoutRef.current) {
      return
    }

    // Debounce: schedule the actual fetch 250ms out
    refreshTimeoutRef.current = setTimeout(() => {
      refreshTimeoutRef.current = null
      
      setCooldown(30)
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current)
      }
      cooldownIntervalRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            if (cooldownIntervalRef.current) {
              clearInterval(cooldownIntervalRef.current)
              cooldownIntervalRef.current = null
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
      
      refreshAll()
    }, 250)
  }, [cooldown, refreshAll])

  // ─── INIT ───

  useEffect(() => {
    refreshAll()
    
    return () => {
      cleanupControllers()
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current)
      }
    }
  }, [refreshAll])

  // ─── FILTERED CVES ───

  const filteredCves = severityFilter === 'ALL' 
    ? cves 
    : cves.filter(c => c.severity === severityFilter)

  const severityCounts = {
    CRITICAL: cves.filter(c => c.severity === 'CRITICAL').length,
    HIGH: cves.filter(c => c.severity === 'HIGH').length,
    MEDIUM: cves.filter(c => c.severity === 'MEDIUM').length,
    LOW: cves.filter(c => c.severity === 'LOW').length,
    INFO: cves.filter(c => c.severity === 'INFO').length,
    UNKNOWN: cves.filter(c => c.severity === 'UNKNOWN').length,
  }

  const tabs = [
    { id: 'cves' as Tab, label: 'CVE Feed', icon: Bug, count: cves.length },
    { id: 'news' as Tab, label: 'Security News', icon: Newspaper, count: news.length },
    { id: 'tools' as Tab, label: 'Trending Tools', icon: GitBranch, count: repos.length },
    { id: 'sources' as Tab, label: 'Manual Sources', icon: Radar, count: null },
    { id: 'quiz' as Tab, label: 'Self-Check', icon: CheckCircle2, count: null },
  ]

  const isLoading = loading.cves || loading.news || loading.repos || loading.kev

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <ShieldAlert className="text-emerald-400" /> The Cassandra Prophecy
          </h1>
          <p className="text-ghost-text-dim mt-1 text-sm">
            Live CVEs, security news, and trending tools — everything auto-refreshed from public APIs.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-ghost-text-dim flex items-center gap-1">
              <Clock size={12} /> Updated {timeAgo(lastRefresh.getTime() / 1000)}
            </span>
          )}
          {cooldown > 0 && (
            <span className="text-xs text-amber-400">Wait {cooldown}s</span>
          )}
          <button
            onClick={debouncedRefresh}
            disabled={isLoading || cooldown > 0}
            className="text-sm px-4 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-2 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* About The Cassandra Prophecy - collapsible */}
      <details className="ghost-card p-4 rounded-xl border border-ghost-border mb-6 space-y-3 text-xs text-ghost-text-dim leading-relaxed">
        <summary className="text-emerald-400 font-mono font-bold text-sm cursor-pointer hover:text-emerald-300">
          What This Actually Is
        </summary>
        <div className="space-y-3 pt-2">
          <p>
            This is an OSINT (Open-Source Intelligence) aggregator, not a scanner or a detection tool — it does
            nothing to any target, it just pulls public data (NVD's CVE database, Hacker News, GitHub's public
            repo index, CISA KEV catalog) and filters it. The value isn't the dashboard itself; it's building the daily habit of
            knowing what changed in the threat landscape before you sit down to work.
          </p>
          <div className="text-emerald-400 font-mono font-bold text-sm pt-1">How Professionals Actually Use Feeds Like This</div>
          <p>
            Nobody reads a raw CVE firehose end to end every day — that doesn't scale past a few dozen entries.
            The real workflow: skim the feed for anything matching tech you're currently working with or testing
            (a specific CMS, a specific SMB version, a cloud provider you use), cross-reference anything relevant
            against CISA's KEV catalog and EPSS before caring about it further, and otherwise treat this as
            pattern-exposure — seeing what kinds of bugs keep recurring (deserialization, auth bypass, SSRF) matters
            more day-to-day than memorizing individual CVE IDs.
          </p>
          <div className="text-emerald-400 font-mono font-bold text-sm pt-1">Limitations — Read Before You Trust This Dashboard</div>
          <ul className="list-disc pl-5 space-y-1">
            <li>The CVE feed is NVD's raw publication stream — publication date is not the same as when the bug was actually found or how severe it is in practice. A 7-day publish window will contain plenty of low-relevance entries alongside anything major.</li>
            <li>The news tab is keyword-filtered off Hacker News' front page only — it structurally misses anything that doesn't trend on HN that day, and keyword matching produces both false positives (a story that happens to say "patch" in an unrelated context) and false negatives (a real breach story that doesn't use any of the matched words). This is a sampling tool, not a complete news source — that's exactly why the Manual Sources tab exists.</li>
            <li>The tools tab surfaces what's popular on GitHub in a 14-day window, which rewards virality, not necessarily quality or relevance — a repo can trend from a single popular tweet, not because it's actually useful.</li>
          </ul>
        </div>
      </details>

      <div className="flex border-b border-ghost-border mb-6 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-emerald-500 text-white' : 'border-transparent text-ghost-text-dim hover:text-ghost-text'
              }`}
            >
              <Icon size={16} /> {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="text-xs bg-ghost-border/50 rounded-full px-1.5 py-0.5">{tab.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* CVE FEED */}
      {activeTab === 'cves' && (
        <div className="space-y-3">
          <div className="text-xs text-ghost-text-dim mb-2 flex items-center gap-1.5 flex-wrap">
            <Info size={12} /> Live from NVD (nvd.nist.gov), last 7 days, unfiltered — sorted newest first.
            {kevLastSync && (
              <span className="ml-2 text-amber-400/70 flex items-center gap-1">
                <ShieldAlert size={12} /> KEV last synced: {kevLastSync} · auto-refresh every 6h
              </span>
            )}
          </div>

          {/* Severity filter */}
          <div className="flex gap-2 mb-3 flex-wrap">
            {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO', 'UNKNOWN'] as const).map(s => {
              const count = s === 'ALL' ? cves.length : severityCounts[s as Severity]
              return (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    severityFilter === s ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400' : 'border-ghost-border text-ghost-text-dim hover:text-ghost-text'
                  }`}
                >
                  {s} {s !== 'ALL' && <span className="text-[10px] text-ghost-text-dim">({count})</span>}
                </button>
              )
            })}
          </div>

          {loading.cves && <LoadingBlock label="Pulling CVEs from NVD..." />}
          {errors.cves && <ErrorBlock message={errors.cves} />}
          {!loading.cves && !errors.cves && filteredCves.length === 0 && <EmptyBlock label="No CVEs match the selected severity filter." />}
          {filteredCves.map(cve => (
            <div key={cve.id} className="ghost-card p-4 rounded-xl border border-ghost-border">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <a href={`https://nvd.nist.gov/vuln/detail/${cve.id}`} target="_blank" rel="noreferrer" className="font-mono font-semibold text-sm hover:text-emerald-400 flex items-center gap-1">
                      {cve.id} <ExternalLink size={12} />
                    </a>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${SEVERITY_STYLES[cve.severity]}`}>
                      {cve.severity}{cve.score !== null ? ` ${cve.score.toFixed(1)}` : ''}
                    </span>
                    <span className="text-xs text-ghost-text-dim">{timeAgo(cve.published)}</span>
                    {kev.some(k => k.cveID === cve.id) && (
                      <span className="text-xs px-2 py-0.5 rounded-full border border-rose-500/50 bg-rose-500/10 text-rose-400">
                        ⚠️ KEV
                      </span>
                    )}
                  </div>
                  <p className={`text-sm text-ghost-text-dim ${expandedCve === cve.id ? '' : 'line-clamp-2'}`}
                     style={!expandedCve ? {
                       display: '-webkit-box',
                       WebkitLineClamp: 2,
                       WebkitBoxOrient: 'vertical',
                       overflow: 'hidden'
                     } : undefined}>
                    {cve.description}
                  </p>
                </div>
                <button onClick={() => setExpandedCve(expandedCve === cve.id ? null : cve.id)} className="text-ghost-text-dim flex-shrink-0 p-1">
                  {expandedCve === cve.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* NEWS */}
      {activeTab === 'news' && (
        <div className="space-y-3">
          <div className="text-xs text-ghost-text-dim mb-2 flex items-center gap-1.5">
            <Info size={12} /> Hacker News front-page stories filtered to security-relevant keywords. Not exhaustive — this misses anything not trending on HN today.
          </div>
          {loading.news && <LoadingBlock label="Scanning Hacker News for security stories..." />}
          {errors.news && <ErrorBlock message={errors.news} />}
          {!loading.news && !errors.news && news.length === 0 && <EmptyBlock label="Nothing security-flagged on HN's front page right now. Check the Manual Sources tab." />}
          {news.map(item => {
            const safeUrl = validateUrl(item.url) || `https://news.ycombinator.com/item?id=${item.id}`
            return (
              <a key={item.id} href={safeUrl} target="_blank" rel="noreferrer" className="ghost-card p-4 rounded-xl border border-ghost-border block hover:border-emerald-500/40 transition-colors">
                <div className="font-medium text-sm mb-1.5 flex items-center gap-1.5">
                  {item.title} <ExternalLink size={12} className="text-ghost-text-dim flex-shrink-0" />
                </div>
                <div className="flex items-center gap-4 text-xs text-ghost-text-dim">
                  <span className="flex items-center gap-1"><Star size={12} /> {item.points}</span>
                  <span className="flex items-center gap-1"><MessageSquare size={12} /> {item.comments}</span>
                  <span>{timeAgo(item.time)}</span>
                </div>
              </a>
            )
          })}
        </div>
      )}

      {/* TOOLS */}
      {activeTab === 'tools' && (
        <div className="space-y-3">
          <div className="text-xs text-ghost-text-dim mb-2 flex items-center gap-1.5">
            <Info size={12} /> GitHub repos tagged "security", pushed in the last 14 days, sorted by stars.
          </div>
          {loading.repos && <LoadingBlock label="Querying GitHub for active security repos..." />}
          {errors.repos && <ErrorBlock message={errors.repos} />}
          {!loading.repos && !errors.repos && repos.length === 0 && <EmptyBlock label="No matching repos returned." />}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {repos.map(repo => (
              <a key={repo.full_name} href={repo.url} target="_blank" rel="noreferrer" className="ghost-card p-4 rounded-xl border border-ghost-border hover:border-emerald-500/40 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-sm flex items-center gap-1.5">
                    <GitBranch size={14} /> {repo.full_name}
                  </span>
                  <span className="text-xs text-amber-400 flex items-center gap-1 flex-shrink-0">
                    <Star size={12} /> {repo.stars.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-ghost-text-dim mb-2 line-clamp-2"
                   style={{
                     display: '-webkit-box',
                     WebkitLineClamp: 2,
                     WebkitBoxOrient: 'vertical',
                     overflow: 'hidden'
                   }}>
                  {repo.description}
                </p>
                <div className="flex justify-between text-xs text-ghost-text-dim">
                  <span>{repo.language}</span>
                  <span>Updated {timeAgo(repo.updated)}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* MANUAL SOURCES */}
      {activeTab === 'sources' && (
        <div className="space-y-6">
          <div className="ghost-card p-4 rounded-xl border border-amber-500/30 bg-amber-950/10 flex gap-3">
            <AlertCircle className="text-amber-400 flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm text-amber-200 space-y-1.5">
              <p>
                These sources require backend access (auth keys, CORS-restricted APIs, or paid subscriptions).
                CISA KEV is already integrated directly into the CVE tab.
              </p>
            </div>
          </div>

          {[
            {
              title: 'Exploit tracking',
              items: [
                { name: 'CISA Known Exploited Vulnerabilities (KEV) Catalog', url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog', note: 'CVEs with confirmed active exploitation — check this before the general NVD firehose (already integrated into the CVE tab)' },
                { name: 'Exploit-DB', url: 'https://www.exploit-db.com/', note: 'Public PoC exploit code archive' },
                { name: 'GitHub PoC search', url: 'https://github.com/search?q=CVE-&type=repositories&s=updated', note: 'Fastest way to find a fresh PoC repo for a specific CVE' },
              ],
            },
            {
              title: 'Breach & incident reporting',
              items: [
                { name: "Krebs on Security", url: 'https://krebsonsecurity.com/', note: 'Deep-dive breach reporting, high signal' },
                { name: 'The Record', url: 'https://therecord.media/', note: 'Daily cyber policy + incident news' },
                { name: 'Have I Been Pwned', url: 'https://haveibeenpwned.com/', note: 'Check breach exposure for specific accounts/domains' },
              ],
            },
            {
              title: 'Threat intel & TTPs',
              items: [
                { name: 'MITRE ATT&CK', url: 'https://attack.mitre.org/', note: 'Reference framework — check for newly documented techniques' },
                { name: 'r/netsec', url: 'https://reddit.com/r/netsec', note: 'Community-curated writeups, higher signal than general infosec subs' },
                { name: 'VirusTotal', url: 'https://www.virustotal.com/', note: 'Malware sample / IOC lookup' },
              ],
            },
          ].map(section => (
            <div key={section.title}>
              <h3 className="font-semibold text-emerald-400 mb-3 text-sm">{section.title}</h3>
              <div className="space-y-2">
                {section.items.map(item => (
                  <a key={item.name} href={item.url} target="_blank" rel="noreferrer" className="ghost-card p-3 rounded-xl border border-ghost-border flex justify-between items-center hover:border-emerald-500/40 transition-colors">
                    <div>
                      <div className="text-sm font-medium">{item.name}</div>
                      <div className="text-xs text-ghost-text-dim">{item.note}</div>
                    </div>
                    <ExternalLink size={14} className="text-ghost-text-dim flex-shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SELF-CHECK QUIZ */}
      {activeTab === 'quiz' && <QuizPanel />}
    </div>
  )
}