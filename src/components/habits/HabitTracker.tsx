import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Plus, X, Check, Flame, Bell, BellOff, Trophy, Calendar as CalendarIcon,
  Settings, Trash2, Edit2, Zap, Target,
  Terminal, Shield, Code, BookOpen, Dumbbell, Coffee, Brain, Lock,
  Sword, Eye, Server, Wifi, Bug, Star, TrendingUp,
  Download, Upload, Award, Medal, Crown, Volume2, VolumeX, StickyNote,
  PartyPopper, Sparkles, BarChart3, Apple, Moon, Droplet, Users, Gem,
  Wallet, HeartPulse, Cloud, Compass, Activity, Layers, GitBranch,
  Cpu, Zap as ZapIcon, Clock, Sun, Moon as MoonIcon, Coffee as CoffeeIcon,
  Crown as CrownIcon, Shield as ShieldIcon, Target as TargetIcon
} from 'lucide-react'

// ---------- Types ----------
type Frequency = 'daily' | 'weekly' | 'custom'

interface Category {
  id: string
  name: string
  color: string
  icon: string
}

interface Habit {
  id: string
  name: string
  categoryId: string
  frequency: Frequency
  customDays: number[]
  targetPerDay: number
  reminderTime: string | null
  xpPerCompletion: number
  createdAt: string
  archived: boolean
}

interface CompletionEntry {
  habitId: string
  date: string
  count: number
  completedAt?: string
  xpAwarded?: number
}

interface NoteEntry {
  habitId: string
  date: string
  text: string
}

interface AppSettings {
  soundEnabled: boolean
  seenAchievements: string[]
}

interface UserStats {
  totalXP: number
  lifetimeXP: number
  prestige: number
}

interface AchievementContext {
  habits: Habit[]
  completions: CompletionEntry[]
  notes: NoteEntry[]
  totalXP: number
  lifetimeXP: number
  level: number
  prestige: number
}

interface Achievement {
  id: string
  name: string
  description: string
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'
  check: (ctx: AchievementContext) => boolean
  progress: (ctx: AchievementContext) => number
}

interface HabitTemplate {
  name: string
  categoryHint: string
  frequency: Frequency
  targetPerDay: number
  xpPerCompletion: number
}

// ---------- Constants ----------
const ICON_MAP: Record<string, any> = {
  terminal: Terminal, shield: Shield, code: Code, book: BookOpen,
  dumbbell: Dumbbell, coffee: Coffee, brain: Brain, lock: Lock,
  sword: Sword, eye: Eye, server: Server, wifi: Wifi, bug: Bug, target: Target,
  apple: Apple, moon: Moon, droplet: Droplet, users: Users, gem: Gem,
  wallet: Wallet, heart: HeartPulse, cloud: Cloud, compass: Compass,
  activity: Activity, layers: Layers, git: GitBranch, cpu: Cpu,
  zap: ZapIcon, clock: Clock, sun: Sun, moonicon: MoonIcon, coffeeicon: CoffeeIcon,
  crown: CrownIcon, shieldicon: ShieldIcon, targeticon: TargetIcon
}
const ICON_KEYS = Object.keys(ICON_MAP)

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-study', name: 'Study', color: '#ec4899', icon: 'book' },
  { id: 'cat-practice', name: 'Lab Practice', color: '#f43f5e', icon: 'terminal' },
  { id: 'cat-ctf', name: 'CTF', color: '#a855f7', icon: 'sword' },
  { id: 'cat-fitness', name: 'Fitness', color: '#10b981', icon: 'dumbbell' },
  { id: 'cat-nutrition', name: 'Nutrition', color: '#f59e0b', icon: 'apple' },
  { id: 'cat-sleep', name: 'Sleep & Recovery', color: '#3b82f6', icon: 'moon' },
  { id: 'cat-mindfulness', name: 'Mindfulness', color: '#8b5cf6', icon: 'brain' },
  { id: 'cat-career', name: 'Career & Networking', color: '#06b6d4', icon: 'users' },
  { id: 'cat-bugbounty', name: 'Bug Bounty', color: '#ef4444', icon: 'bug' },
  { id: 'cat-dev', name: 'Dev Projects', color: '#3b82f6', icon: 'code' },
  { id: 'cat-reading', name: 'Reading', color: '#eab308', icon: 'book' },
  { id: 'cat-finance', name: 'Finance', color: '#22c55e', icon: 'wallet' },
  { id: 'cat-cloud', name: 'Cloud Security', color: '#0ea5e9', icon: 'cloud' },
  { id: 'cat-social', name: 'Social & Relationships', color: '#f472b6', icon: 'heart' },
  { id: 'cat-creative', name: 'Creative', color: '#f97316', icon: 'zap' },
  { id: 'cat-learning', name: 'Learning', color: '#22d3ee', icon: 'compass' },
]

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const STORAGE_KEYS = {
  habits: 'obscurum_habits_v1',
  categories: 'obscurum_categories_v1',
  completions: 'obscurum_completions_v1',
  stats: 'obscurum_stats_v1',
  notes: 'obscurum_notes_v1',
  settings: 'obscurum_settings_v1',
}

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365]

const HABIT_TEMPLATES: HabitTemplate[] = [
  { name: '30 min CTF practice', categoryHint: 'cat-ctf', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 15 },
  { name: 'Read a security research paper', categoryHint: 'cat-study', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 10 },
  { name: 'Wireshark / packet analysis drill', categoryHint: 'cat-practice', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 15 },
  { name: 'HackTheBox / TryHackMe room', categoryHint: 'cat-ctf', frequency: 'custom', targetPerDay: 1, xpPerCompletion: 20 },
  { name: 'Push-ups x50', categoryHint: 'cat-fitness', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 8 },
  { name: 'Review yesterday\'s notes', categoryHint: 'cat-study', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 5 },
  { name: 'Write up a lab report', categoryHint: 'cat-practice', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 12 },
  { name: '20 min mobility / stretching', categoryHint: 'cat-fitness', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 6 },
  { name: 'Run / cardio session', categoryHint: 'cat-fitness', frequency: 'custom', targetPerDay: 1, xpPerCompletion: 12 },
  { name: 'Strength training session', categoryHint: 'cat-fitness', frequency: 'custom', targetPerDay: 1, xpPerCompletion: 12 },
  { name: 'Drink 8 glasses of water', categoryHint: 'cat-nutrition', frequency: 'daily', targetPerDay: 8, xpPerCompletion: 1 },
  { name: 'Hit daily protein target', categoryHint: 'cat-nutrition', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 6 },
  { name: 'Meal prep', categoryHint: 'cat-nutrition', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 10 },
  { name: '7+ hours of sleep', categoryHint: 'cat-sleep', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 8 },
  { name: 'No screens 30 min before bed', categoryHint: 'cat-sleep', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 5 },
  { name: '10 min meditation', categoryHint: 'cat-mindfulness', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 6 },
  { name: 'Journal / brain dump', categoryHint: 'cat-mindfulness', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 5 },
  { name: 'Reach out to 1 person in infosec', categoryHint: 'cat-career', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 10 },
  { name: 'Update resume / portfolio / blog', categoryHint: 'cat-career', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 10 },
  { name: 'Triage a bug bounty scope', categoryHint: 'cat-bugbounty', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 12 },
  { name: 'Submit a bug bounty report', categoryHint: 'cat-bugbounty', frequency: 'custom', targetPerDay: 1, xpPerCompletion: 25 },
  { name: 'Commit code to a side project', categoryHint: 'cat-dev', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 10 },
  { name: 'Fix or close 1 open issue', categoryHint: 'cat-dev', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 12 },
  { name: 'Read 20 pages', categoryHint: 'cat-reading', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 6 },
  { name: 'Track today\'s expenses', categoryHint: 'cat-finance', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 5 },
  { name: 'Review weekly budget', categoryHint: 'cat-finance', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 8 },
  { name: 'AWS / Azure / GCP security lab', categoryHint: 'cat-cloud', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 18 },
  { name: 'Review IAM policies / misconfigs', categoryHint: 'cat-cloud', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 12 },
  { name: 'Call a friend or family member', categoryHint: 'cat-social', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 8 },
  { name: 'Unplug and spend time with people offline', categoryHint: 'cat-social', frequency: 'weekly', targetPerDay: 1, xpPerCompletion: 8 },
  { name: 'Creative writing / art session', categoryHint: 'cat-creative', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 6 },
  { name: 'Learn a new skill (1 hour)', categoryHint: 'cat-learning', frequency: 'daily', targetPerDay: 1, xpPerCompletion: 10 },
]

// ---------- Helpers ----------
function todayISO() {
  return new Date().toISOString().split('T')[0]
}
function isoDaysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}
function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function saveLS(key: string, value: any) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function normalizeStats(s: Partial<UserStats> | null | undefined): UserStats {
  const totalXP = Number(s?.totalXP)
  const lifetimeXP = Number(s?.lifetimeXP)
  const prestige = Number(s?.prestige)
  return {
    totalXP: Number.isFinite(totalXP) && totalXP >= 0 ? totalXP : 0,
    lifetimeXP: Number.isFinite(lifetimeXP) && lifetimeXP >= 0 ? lifetimeXP : 0,
    prestige: Number.isFinite(prestige) && prestige >= 0 ? prestige : 0,
  }
}

function normalizeHabit(h: Partial<Habit> & { id: string; name: string }): Habit {
  const xp = Number(h.xpPerCompletion)
  return {
    id: h.id,
    name: h.name,
    categoryId: h.categoryId ?? '',
    frequency: h.frequency ?? 'daily',
    customDays: Array.isArray(h.customDays) ? h.customDays : [],
    targetPerDay: Number.isFinite(Number(h.targetPerDay)) && Number(h.targetPerDay) > 0 ? Number(h.targetPerDay) : 1,
    reminderTime: h.reminderTime ?? null,
    xpPerCompletion: Number.isFinite(xp) && xp > 0 ? xp : 10,
    createdAt: h.createdAt ?? new Date().toISOString(),
    archived: h.archived ?? false,
  }
}

function xpForLevel(level: number) {
  return Math.round(50 * Math.pow(Math.max(0, level - 1), 1.6))
}
function levelFromXP(totalXP: number) {
  let level = 1
  while (xpForLevel(level + 1) <= totalXP) level++
  const currentFloor = xpForLevel(level)
  const nextCeiling = xpForLevel(level + 1)
  const progress = (totalXP - currentFloor) / (nextCeiling - currentFloor)
  return { level, currentFloor, nextCeiling, progress: Math.max(0, Math.min(1, progress)) }
}

function streakMultiplier(streak: number): number {
  if (streak >= 365) return 2.0
  if (streak >= 200) return 1.75
  if (streak >= 100) return 1.5
  if (streak >= 50) return 1.35
  if (streak >= 30) return 1.25
  if (streak >= 14) return 1.15
  if (streak >= 7) return 1.1
  return 1
}

const PRESTIGE_UNLOCK_LEVEL = 50
function prestigeMultiplier(prestige: number): number {
  return 1 + prestige * 0.05
}

interface RankTier {
  minLevel: number
  title: string
  icon: any
  color: string
}
const RANK_TIERS: RankTier[] = [
  { minLevel: 1, title: 'Script Kiddie', icon: Terminal, color: '#94a3b8' },
  { minLevel: 5, title: 'Junior Operative', icon: Shield, color: '#60a5fa' },
  { minLevel: 10, title: 'Operative', icon: Target, color: '#34d399' },
  { minLevel: 15, title: 'Senior Operative', icon: Sword, color: '#a78bfa' },
  { minLevel: 20, title: 'Elite Operative', icon: Zap, color: '#f472b6' },
  { minLevel: 30, title: 'Ghost', icon: Eye, color: '#22d3ee' },
  { minLevel: 40, title: 'Shadow Master', icon: Crown, color: '#f59e0b' },
  { minLevel: 50, title: 'Obscurum Legend', icon: Gem, color: '#facc15' },
  { minLevel: 60, title: 'Kernel Architect', icon: Server, color: '#c084fc' },
  { minLevel: 70, title: 'Zero-Day', icon: Wifi, color: '#fb7185' },
  { minLevel: 80, title: 'Root Access', icon: Lock, color: '#f87171' },
  { minLevel: 90, title: 'Overmind', icon: Coffee, color: '#fbbf24' },
  { minLevel: 100, title: 'Mythic Ghost', icon: Trophy, color: '#fde047' },
]
function rankForLevel(level: number): RankTier {
  let current = RANK_TIERS[0]
  for (const tier of RANK_TIERS) {
    if (level >= tier.minLevel) current = tier
  }
  return current
}

function habitAppliesToDate(habit: Habit, dateISO: string): boolean {
  if (habit.frequency === 'daily') return true
  const day = new Date(dateISO + 'T00:00:00').getDay()
  if (habit.frequency === 'weekly') return day === new Date(habit.createdAt).getDay()
  return habit.customDays.includes(day)
}

function computeStreak(habit: Habit, completions: CompletionEntry[]): number {
  let streak = 0
  let cursor = new Date()
  const created = new Date(habit.createdAt)
  for (let i = 0; i < 400; i++) {
    const iso = cursor.toISOString().split('T')[0]
    if (cursor < created) break
    if (habitAppliesToDate(habit, iso)) {
      const entry = completions.find(c => c.habitId === habit.id && c.date === iso)
      const done = entry && entry.count >= habit.targetPerDay
      if (done) {
        streak++
      } else if (iso === todayISO()) {
      } else {
        break
      }
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function longestStreak(habit: Habit, completions: CompletionEntry[]): number {
  let longest = 0
  let running = 0
  const cursor = new Date()
  cursor.setDate(cursor.getDate() - 399)
  const created = new Date(habit.createdAt)
  for (let i = 0; i < 400; i++) {
    const iso = cursor.toISOString().split('T')[0]
    if (cursor < created) { cursor.setDate(cursor.getDate() + 1); continue }
    if (habitAppliesToDate(habit, iso)) {
      const entry = completions.find(c => c.habitId === habit.id && c.date === iso)
      const done = entry && entry.count >= habit.targetPerDay
      if (done) {
        running++
        longest = Math.max(longest, running)
      } else {
        running = 0
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return longest
}

function totalCompletionsCount(habits: Habit[], completions: CompletionEntry[]): number {
  let total = 0
  completions.forEach(c => {
    const habit = habits.find(h => h.id === c.habitId)
    if (!habit || c.count < habit.targetPerDay) return
    if (new Date(c.date + 'T23:59:59') < new Date(habit.createdAt)) return
    total++
  })
  return total
}

function perfectDaysInWindow(habits: Habit[], completions: CompletionEntry[], windowDays: number): number {
  let count = 0
  for (let i = 0; i < windowDays; i++) {
    const iso = isoDaysAgo(i)
    const scheduled = habits.filter(h => habitAppliesToDate(h, iso) && new Date(h.createdAt) <= new Date(iso + 'T23:59:59'))
    if (scheduled.length === 0) continue
    const allDone = scheduled.every(h => {
      const entry = completions.find(c => c.habitId === h.id && c.date === iso)
      return entry && entry.count >= h.targetPerDay
    })
    if (allDone) count++
  }
  return count
}

function distinctCategoriesCompleted(habits: Habit[], completions: CompletionEntry[]): number {
  const cats = new Set<string>()
  completions.forEach(c => {
    const habit = habits.find(h => h.id === c.habitId)
    if (!habit || c.count < habit.targetPerDay) return
    if (new Date(c.date + 'T23:59:59') < new Date(habit.createdAt)) return
    cats.add(habit.categoryId)
  })
  return cats.size
}

function anyCompletionOnDate(habits: Habit[], completions: CompletionEntry[], date: string): boolean {
  return completions.some(c => {
    if (c.date !== date) return false
    const habit = habits.find(h => h.id === c.habitId)
    if (!habit) return false
    if (new Date(c.date + 'T23:59:59') < new Date(habit.createdAt)) return false
    return c.count >= habit.targetPerDay
  })
}

function countFullWeekends(habits: Habit[], completions: CompletionEntry[], windowDays: number): number {
  let count = 0
  for (let i = 0; i < windowDays; i++) {
    const iso = isoDaysAgo(i)
    const day = new Date(iso + 'T00:00:00').getDay()
    if (day !== 0) continue
    const saturdayIso = isoDaysAgo(i + 1)
    if (anyCompletionOnDate(habits, completions, iso) && anyCompletionOnDate(habits, completions, saturdayIso)) count++
  }
  return count
}

function completionsInCategory(habits: Habit[], completions: CompletionEntry[], categoryId: string): number {
  let total = 0
  completions.forEach(c => {
    const habit = habits.find(h => h.id === c.habitId)
    if (!habit || habit.categoryId !== categoryId) return
    if (c.count < habit.targetPerDay) return
    if (new Date(c.date + 'T23:59:59') < new Date(habit.createdAt)) return
    total++
  })
  return total
}

function maxCategoryCompletions(habits: Habit[], completions: CompletionEntry[]): number {
  const byCategory: Record<string, number> = {}
  completions.forEach(c => {
    const habit = habits.find(h => h.id === c.habitId)
    if (!habit || c.count < habit.targetPerDay) return
    if (new Date(c.date + 'T23:59:59') < new Date(habit.createdAt)) return
    byCategory[habit.categoryId] = (byCategory[habit.categoryId] ?? 0) + 1
  })
  return Math.max(0, ...Object.values(byCategory))
}

function completionsBeforeHour(completions: CompletionEntry[], hour: number): number {
  return completions.filter(c => c.completedAt && new Date(c.completedAt).getHours() < hour).length
}

function completionsAfterHour(completions: CompletionEntry[], hour: number): number {
  return completions.filter(c => c.completedAt && new Date(c.completedAt).getHours() >= hour).length
}

function maxCurrentOrEverStreak(ctx: AchievementContext): number {
  return ctx.habits.reduce(
    (max, h) => Math.max(max, computeStreak(h, ctx.completions), longestStreak(h, ctx.completions)),
    0
  )
}

// Count completions in a specific time window

// Count unique days with completions
function uniqueCompletionDays(completions: CompletionEntry[]): number {
  const days = new Set(completions.map(c => c.date))
  return days.size
}

// ---------- Achievements ----------
const ACHIEVEMENTS: Achievement[] = [
  // Starter Achievements
  {
    id: 'first-rep',
    name: 'First Rep',
    description: 'Complete any habit for the first time.',
    tier: 'bronze',
    check: ctx => totalCompletionsCount(ctx.habits, ctx.completions) >= 1,
    progress: ctx => Math.min(1, totalCompletionsCount(ctx.habits, ctx.completions) / 1),
  },
  {
    id: 'habit-starter',
    name: 'Habit Starter',
    description: 'Create your first habit.',
    tier: 'bronze',
    check: ctx => ctx.habits.length >= 1,
    progress: ctx => Math.min(1, ctx.habits.length / 1),
  },
  {
    id: 'category-explorer',
    name: 'Category Explorer',
    description: 'Create a habit in 3 different categories.',
    tier: 'bronze',
    check: ctx => distinctCategoriesCompleted(ctx.habits, ctx.completions) >= 3,
    progress: ctx => Math.min(1, distinctCategoriesCompleted(ctx.habits, ctx.completions) / 3),
  },

  // Streak Achievements
  {
    id: 'streak-3',
    name: 'Three Days Strong',
    description: 'Hit a 3-day streak on any habit.',
    tier: 'bronze',
    check: ctx => maxCurrentOrEverStreak(ctx) >= 3,
    progress: ctx => Math.min(1, maxCurrentOrEverStreak(ctx) / 3),
  },
  {
    id: 'streak-7',
    name: 'One Week Strong',
    description: 'Hit a 7-day streak on any habit.',
    tier: 'bronze',
    check: ctx => maxCurrentOrEverStreak(ctx) >= 7,
    progress: ctx => Math.min(1, maxCurrentOrEverStreak(ctx) / 7),
  },
  {
    id: 'streak-14',
    name: 'Two Weeks Unbroken',
    description: 'Hit a 14-day streak on any habit.',
    tier: 'silver',
    check: ctx => maxCurrentOrEverStreak(ctx) >= 14,
    progress: ctx => Math.min(1, maxCurrentOrEverStreak(ctx) / 14),
  },
  {
    id: 'streak-30',
    name: 'Iron Discipline',
    description: 'Hit a 30-day streak on any habit.',
    tier: 'silver',
    check: ctx => maxCurrentOrEverStreak(ctx) >= 30,
    progress: ctx => Math.min(1, maxCurrentOrEverStreak(ctx) / 30),
  },
  {
    id: 'streak-50',
    name: 'Fifty Days of Fire',
    description: 'Hit a 50-day streak on any habit.',
    tier: 'gold',
    check: ctx => maxCurrentOrEverStreak(ctx) >= 50,
    progress: ctx => Math.min(1, maxCurrentOrEverStreak(ctx) / 50),
  },
  {
    id: 'streak-100',
    name: 'Unbreakable',
    description: 'Hit a 100-day streak on any habit.',
    tier: 'gold',
    check: ctx => maxCurrentOrEverStreak(ctx) >= 100,
    progress: ctx => Math.min(1, maxCurrentOrEverStreak(ctx) / 100),
  },
  {
    id: 'streak-200',
    name: 'Two Hundred Days',
    description: 'Hit a 200-day streak on any habit.',
    tier: 'platinum',
    check: ctx => maxCurrentOrEverStreak(ctx) >= 200,
    progress: ctx => Math.min(1, maxCurrentOrEverStreak(ctx) / 200),
  },
  {
    id: 'streak-365',
    name: 'Deathless',
    description: 'Hit a 365-day streak on any habit.',
    tier: 'platinum',
    check: ctx => maxCurrentOrEverStreak(ctx) >= 365,
    progress: ctx => Math.min(1, maxCurrentOrEverStreak(ctx) / 365),
  },

  // Total Completions
  {
    id: 'total-10',
    name: 'Getting Started',
    description: 'Log 10 total completions.',
    tier: 'bronze',
    check: ctx => totalCompletionsCount(ctx.habits, ctx.completions) >= 10,
    progress: ctx => Math.min(1, totalCompletionsCount(ctx.habits, ctx.completions) / 10),
  },
  {
    id: 'total-25',
    name: 'Grinding',
    description: 'Log 25 total completions.',
    tier: 'bronze',
    check: ctx => totalCompletionsCount(ctx.habits, ctx.completions) >= 25,
    progress: ctx => Math.min(1, totalCompletionsCount(ctx.habits, ctx.completions) / 25),
  },
  {
    id: 'total-50',
    name: 'Half Century',
    description: 'Log 50 total completions.',
    tier: 'silver',
    check: ctx => totalCompletionsCount(ctx.habits, ctx.completions) >= 50,
    progress: ctx => Math.min(1, totalCompletionsCount(ctx.habits, ctx.completions) / 50),
  },
  {
    id: 'total-100',
    name: 'Century Club',
    description: 'Log 100 total completions.',
    tier: 'silver',
    check: ctx => totalCompletionsCount(ctx.habits, ctx.completions) >= 100,
    progress: ctx => Math.min(1, totalCompletionsCount(ctx.habits, ctx.completions) / 100),
  },
  {
    id: 'total-250',
    name: 'Quarter Thousand',
    description: 'Log 250 total completions.',
    tier: 'gold',
    check: ctx => totalCompletionsCount(ctx.habits, ctx.completions) >= 250,
    progress: ctx => Math.min(1, totalCompletionsCount(ctx.habits, ctx.completions) / 250),
  },
  {
    id: 'total-500',
    name: 'Veteran',
    description: 'Log 500 total completions.',
    tier: 'gold',
    check: ctx => totalCompletionsCount(ctx.habits, ctx.completions) >= 500,
    progress: ctx => Math.min(1, totalCompletionsCount(ctx.habits, ctx.completions) / 500),
  },
  {
    id: 'total-1000',
    name: 'Thousand Reps',
    description: 'Log 1,000 total completions.',
    tier: 'platinum',
    check: ctx => totalCompletionsCount(ctx.habits, ctx.completions) >= 1000,
    progress: ctx => Math.min(1, totalCompletionsCount(ctx.habits, ctx.completions) / 1000),
  },
  {
    id: 'total-2000',
    name: 'Ghost in the Machine',
    description: 'Log 2,000 total completions.',
    tier: 'platinum',
    check: ctx => totalCompletionsCount(ctx.habits, ctx.completions) >= 2000,
    progress: ctx => Math.min(1, totalCompletionsCount(ctx.habits, ctx.completions) / 2000),
  },
  {
    id: 'total-5000',
    name: 'Legendary Persistence',
    description: 'Log 5,000 total completions.',
    tier: 'platinum',
    check: ctx => totalCompletionsCount(ctx.habits, ctx.completions) >= 5000,
    progress: ctx => Math.min(1, totalCompletionsCount(ctx.habits, ctx.completions) / 5000),
  },

  // Level Achievements
  {
    id: 'level-5',
    name: 'Rising Operative',
    description: 'Reach level 5.',
    tier: 'bronze',
    check: ctx => ctx.level >= 5,
    progress: ctx => Math.min(1, ctx.level / 5),
  },
  {
    id: 'level-10',
    name: 'Elite Operative',
    description: 'Reach level 10.',
    tier: 'silver',
    check: ctx => ctx.level >= 10,
    progress: ctx => Math.min(1, ctx.level / 10),
  },
  {
    id: 'level-20',
    name: 'Ascending Star',
    description: 'Reach level 20.',
    tier: 'gold',
    check: ctx => ctx.level >= 20,
    progress: ctx => Math.min(1, ctx.level / 20),
  },
  {
    id: 'level-30',
    name: 'Shadow Walker',
    description: 'Reach level 30.',
    tier: 'gold',
    check: ctx => ctx.level >= 30,
    progress: ctx => Math.min(1, ctx.level / 30),
  },
  {
    id: 'level-40',
    name: 'Veteran Operative',
    description: 'Reach level 40.',
    tier: 'gold',
    check: ctx => ctx.level >= 40,
    progress: ctx => Math.min(1, ctx.level / 40),
  },
  {
    id: 'level-50',
    name: 'Obscurum Legend',
    description: 'Reach level 50 and unlock Prestige.',
    tier: 'platinum',
    check: ctx => ctx.level >= 50,
    progress: ctx => Math.min(1, ctx.level / 50),
  },
  {
    id: 'level-75',
    name: 'Kernel Architect',
    description: 'Reach level 75.',
    tier: 'platinum',
    check: ctx => ctx.level >= 75,
    progress: ctx => Math.min(1, ctx.level / 75),
  },
  {
    id: 'level-100',
    name: 'Mythic Ascension',
    description: 'Reach level 100.',
    tier: 'platinum',
    check: ctx => ctx.level >= 100,
    progress: ctx => Math.min(1, ctx.level / 100),
  },

  // Category Mastery
  {
    id: 'well-rounded',
    name: 'Well Rounded',
    description: 'Complete habits from 4 different categories.',
    tier: 'silver',
    check: ctx => distinctCategoriesCompleted(ctx.habits, ctx.completions) >= 4,
    progress: ctx => Math.min(1, distinctCategoriesCompleted(ctx.habits, ctx.completions) / 4),
  },
  {
    id: 'renaissance',
    name: 'Renaissance Hacker',
    description: 'Complete habits from 6 different categories.',
    tier: 'gold',
    check: ctx => distinctCategoriesCompleted(ctx.habits, ctx.completions) >= 6,
    progress: ctx => Math.min(1, distinctCategoriesCompleted(ctx.habits, ctx.completions) / 6),
  },
  {
    id: 'polymath',
    name: 'Polymath',
    description: 'Complete habits from 8 different categories.',
    tier: 'platinum',
    check: ctx => distinctCategoriesCompleted(ctx.habits, ctx.completions) >= 8,
    progress: ctx => Math.min(1, distinctCategoriesCompleted(ctx.habits, ctx.completions) / 8),
  },
  {
    id: 'true-polymath',
    name: 'True Polymath',
    description: 'Complete habits from 12 or more different categories.',
    tier: 'platinum',
    check: ctx => distinctCategoriesCompleted(ctx.habits, ctx.completions) >= 12,
    progress: ctx => Math.min(1, distinctCategoriesCompleted(ctx.habits, ctx.completions) / 12),
  },
  {
    id: 'grandmaster',
    name: 'Grandmaster',
    description: 'Complete habits from 10 different categories.',
    tier: 'platinum',
    check: ctx => distinctCategoriesCompleted(ctx.habits, ctx.completions) >= 10,
    progress: ctx => Math.min(1, distinctCategoriesCompleted(ctx.habits, ctx.completions) / 10),
  },
  {
    id: 'category-master',
    name: 'Category Master',
    description: 'Log 50 completions within a single category.',
    tier: 'silver',
    check: ctx => maxCategoryCompletions(ctx.habits, ctx.completions) >= 50,
    progress: ctx => Math.min(1, maxCategoryCompletions(ctx.habits, ctx.completions) / 50),
  },
  {
    id: 'category-grandmaster',
    name: 'Category Grandmaster',
    description: 'Log 150 completions within a single category.',
    tier: 'platinum',
    check: ctx => maxCategoryCompletions(ctx.habits, ctx.completions) >= 150,
    progress: ctx => Math.min(1, maxCategoryCompletions(ctx.habits, ctx.completions) / 150),
  },

  // Category-Specific
  {
    id: 'iron-body',
    name: 'Iron Body',
    description: 'Log 25 completions in the Fitness category.',
    tier: 'bronze',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-fitness') >= 25,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-fitness') / 25),
  },
  {
    id: 'warrior-body',
    name: 'Warrior Body',
    description: 'Log 100 completions in the Fitness category.',
    tier: 'gold',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-fitness') >= 100,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-fitness') / 100),
  },
  {
    id: 'bug-hunter',
    name: 'Bug Hunter',
    description: 'Log 15 completions in the Bug Bounty category.',
    tier: 'bronze',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-bugbounty') >= 15,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-bugbounty') / 15),
  },
  {
    id: 'bug-slayer',
    name: 'Bug Slayer',
    description: 'Log 50 completions in the Bug Bounty category.',
    tier: 'gold',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-bugbounty') >= 50,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-bugbounty') / 50),
  },
  {
    id: 'ship-it',
    name: 'Ship It',
    description: 'Log 30 completions in the Dev Projects category.',
    tier: 'silver',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-dev') >= 30,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-dev') / 30),
  },
  {
    id: 'shipping-master',
    name: 'Shipping Master',
    description: 'Log 100 completions in the Dev Projects category.',
    tier: 'gold',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-dev') >= 100,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-dev') / 100),
  },
  {
    id: 'bookworm',
    name: 'Bookworm',
    description: 'Log 20 completions in the Reading category.',
    tier: 'bronze',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-reading') >= 20,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-reading') / 20),
  },
  {
    id: 'voracious-reader',
    name: 'Voracious Reader',
    description: 'Log 75 completions in the Reading category.',
    tier: 'gold',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-reading') >= 75,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-reading') / 75),
  },
  {
    id: 'budget-boss',
    name: 'Budget Boss',
    description: 'Log 20 completions in the Finance category.',
    tier: 'bronze',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-finance') >= 20,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-finance') / 20),
  },
  {
    id: 'wealth-builder',
    name: 'Wealth Builder',
    description: 'Log 75 completions in the Finance category.',
    tier: 'gold',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-finance') >= 75,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-finance') / 75),
  },
  {
    id: 'cloud-native',
    name: 'Cloud Native',
    description: 'Log 15 completions in the Cloud Security category.',
    tier: 'silver',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-cloud') >= 15,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-cloud') / 15),
  },
  {
    id: 'cloud-architect',
    name: 'Cloud Architect',
    description: 'Log 50 completions in the Cloud Security category.',
    tier: 'gold',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-cloud') >= 50,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-cloud') / 50),
  },
  {
    id: 'people-person',
    name: 'People Person',
    description: 'Log 15 completions in the Social & Relationships category.',
    tier: 'bronze',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-social') >= 15,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-social') / 15),
  },
  {
    id: 'community-builder',
    name: 'Community Builder',
    description: 'Log 50 completions in the Social & Relationships category.',
    tier: 'gold',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-social') >= 50,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-social') / 50),
  },
  {
    id: 'ctf-warrior',
    name: 'CTF Warrior',
    description: 'Log 30 completions in the CTF category.',
    tier: 'silver',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-ctf') >= 30,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-ctf') / 30),
  },
  {
    id: 'ctf-master',
    name: 'CTF Master',
    description: 'Log 100 completions in the CTF category.',
    tier: 'gold',
    check: ctx => completionsInCategory(ctx.habits, ctx.completions, 'cat-ctf') >= 100,
    progress: ctx => Math.min(1, completionsInCategory(ctx.habits, ctx.completions, 'cat-ctf') / 100),
  },

  // Perfect Days
  {
    id: 'perfect-day',
    name: 'Flawless Execution',
    description: 'Complete every scheduled habit in a single day.',
    tier: 'silver',
    check: ctx => perfectDaysInWindow(ctx.habits, ctx.completions, 365) >= 1,
    progress: ctx => Math.min(1, perfectDaysInWindow(ctx.habits, ctx.completions, 365)),
  },
  {
    id: 'perfect-week',
    name: 'Perfect Week',
    description: 'Complete every scheduled habit for 7 days straight.',
    tier: 'silver',
    check: ctx => perfectDaysInWindow(ctx.habits, ctx.completions, 7) >= 7,
    progress: ctx => Math.min(1, perfectDaysInWindow(ctx.habits, ctx.completions, 7) / 7),
  },
  {
    id: 'perfect-month',
    name: 'Perfect Month',
    description: 'Complete every scheduled habit for 30 days straight.',
    tier: 'gold',
    check: ctx => perfectDaysInWindow(ctx.habits, ctx.completions, 30) >= 30,
    progress: ctx => Math.min(1, perfectDaysInWindow(ctx.habits, ctx.completions, 30) / 30),
  },
  {
    id: 'consistency-king',
    name: 'Consistency King',
    description: 'Rack up 14 perfect days within a 90-day window.',
    tier: 'gold',
    check: ctx => perfectDaysInWindow(ctx.habits, ctx.completions, 90) >= 14,
    progress: ctx => Math.min(1, perfectDaysInWindow(ctx.habits, ctx.completions, 90) / 14),
  },
  {
    id: 'perfectionist',
    name: 'Perfectionist',
    description: 'Rack up 30 perfect days within a 365-day window.',
    tier: 'platinum',
    check: ctx => perfectDaysInWindow(ctx.habits, ctx.completions, 365) >= 30,
    progress: ctx => Math.min(1, perfectDaysInWindow(ctx.habits, ctx.completions, 365) / 30),
  },

  // Time of Day
  {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Complete 10 habits before 7 AM.',
    tier: 'bronze',
    check: ctx => completionsBeforeHour(ctx.completions, 7) >= 10,
    progress: ctx => Math.min(1, completionsBeforeHour(ctx.completions, 7) / 10),
  },
  {
    id: 'dawn-patrol',
    name: 'Dawn Patrol',
    description: 'Complete 50 habits before 7 AM.',
    tier: 'silver',
    check: ctx => completionsBeforeHour(ctx.completions, 7) >= 50,
    progress: ctx => Math.min(1, completionsBeforeHour(ctx.completions, 7) / 50),
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Complete 10 habits at or after 10 PM.',
    tier: 'bronze',
    check: ctx => completionsAfterHour(ctx.completions, 22) >= 10,
    progress: ctx => Math.min(1, completionsAfterHour(ctx.completions, 22) / 10),
  },
  {
    id: 'midnight-oil',
    name: 'Midnight Oil',
    description: 'Complete 50 habits at or after 10 PM.',
    tier: 'silver',
    check: ctx => completionsAfterHour(ctx.completions, 22) >= 50,
    progress: ctx => Math.min(1, completionsAfterHour(ctx.completions, 22) / 50),
  },

  // Journaling
  {
    id: 'journalist',
    name: 'Field Journal',
    description: 'Write 10 journal notes on your habits.',
    tier: 'bronze',
    check: ctx => ctx.notes.length >= 10,
    progress: ctx => Math.min(1, ctx.notes.length / 10),
  },
  {
    id: 'master-journalist',
    name: 'Master Journalist',
    description: 'Write 50 journal notes on your habits.',
    tier: 'silver',
    check: ctx => ctx.notes.length >= 50,
    progress: ctx => Math.min(1, ctx.notes.length / 50),
  },
  {
    id: 'chronicler',
    name: 'Chronicler',
    description: 'Write 100 journal notes on your habits.',
    tier: 'gold',
    check: ctx => ctx.notes.length >= 100,
    progress: ctx => Math.min(1, ctx.notes.length / 100),
  },
  {
    id: 'sage-writer',
    name: 'Sage Writer',
    description: 'Write 250 journal notes on your habits.',
    tier: 'platinum',
    check: ctx => ctx.notes.length >= 250,
    progress: ctx => Math.min(1, ctx.notes.length / 250),
  },

  // XP Achievements
  {
    id: 'xp-100',
    name: 'Hundred XP',
    description: 'Earn 100 lifetime XP.',
    tier: 'bronze',
    check: ctx => ctx.lifetimeXP >= 100,
    progress: ctx => Math.min(1, ctx.lifetimeXP / 100),
  },
  {
    id: 'xp-500',
    name: 'Half Thousand',
    description: 'Earn 500 lifetime XP.',
    tier: 'silver',
    check: ctx => ctx.lifetimeXP >= 500,
    progress: ctx => Math.min(1, ctx.lifetimeXP / 500),
  },
  {
    id: 'xp-1000',
    name: 'Thousand Cuts',
    description: 'Earn 1,000 lifetime XP.',
    tier: 'silver',
    check: ctx => ctx.lifetimeXP >= 1000,
    progress: ctx => Math.min(1, ctx.lifetimeXP / 1000),
  },
  {
    id: 'xp-5000',
    name: 'Five Thousand',
    description: 'Earn 5,000 lifetime XP.',
    tier: 'gold',
    check: ctx => ctx.lifetimeXP >= 5000,
    progress: ctx => Math.min(1, ctx.lifetimeXP / 5000),
  },
  {
    id: 'xp-10000',
    name: 'Ten Thousand',
    description: 'Earn 10,000 lifetime XP.',
    tier: 'gold',
    check: ctx => ctx.lifetimeXP >= 10000,
    progress: ctx => Math.min(1, ctx.lifetimeXP / 10000),
  },
  {
    id: 'xp-50000',
    name: 'Fifty Thousand',
    description: 'Earn 50,000 lifetime XP.',
    tier: 'platinum',
    check: ctx => ctx.lifetimeXP >= 50000,
    progress: ctx => Math.min(1, ctx.lifetimeXP / 50000),
  },
  {
    id: 'xp-100000',
    name: 'Century of XP',
    description: 'Earn 100,000 lifetime XP.',
    tier: 'platinum',
    check: ctx => ctx.lifetimeXP >= 100000,
    progress: ctx => Math.min(1, ctx.lifetimeXP / 100000),
  },

  // Prestige Achievements
  {
    id: 'first-prestige',
    name: 'Reborn',
    description: 'Prestige for the first time.',
    tier: 'platinum',
    check: ctx => ctx.prestige >= 1,
    progress: ctx => Math.min(1, ctx.prestige / 1),
  },
  {
    id: 'triple-prestige',
    name: 'Ascended',
    description: 'Prestige 3 times.',
    tier: 'platinum',
    check: ctx => ctx.prestige >= 3,
    progress: ctx => Math.min(1, ctx.prestige / 3),
  },
  {
    id: 'prestige-5',
    name: 'Eternal Cycle',
    description: 'Prestige 5 times.',
    tier: 'platinum',
    check: ctx => ctx.prestige >= 5,
    progress: ctx => Math.min(1, ctx.prestige / 5),
  },
  {
    id: 'prestige-10',
    name: 'Beyond Prestige',
    description: 'Prestige 10 times.',
    tier: 'platinum',
    check: ctx => ctx.prestige >= 10,
    progress: ctx => Math.min(1, ctx.prestige / 10),
  },
  {
    id: 'prestige-25',
    name: 'Infinite Loop',
    description: 'Prestige 25 times.',
    tier: 'platinum',
    check: ctx => ctx.prestige >= 25,
    progress: ctx => Math.min(1, ctx.prestige / 25),
  },

  // Weekend Warrior
  {
    id: 'weekend-warrior',
    name: 'Weekend Warrior',
    description: 'Complete at least one habit on both Saturday and Sunday, across 4 different weekends.',
    tier: 'bronze',
    check: ctx => countFullWeekends(ctx.habits, ctx.completions, 180) >= 4,
    progress: ctx => Math.min(1, countFullWeekends(ctx.habits, ctx.completions, 180) / 4),
  },
  {
    id: 'weekend-legend',
    name: 'Weekend Legend',
    description: 'Complete at least one habit on both Saturday and Sunday, across 12 different weekends.',
    tier: 'gold',
    check: ctx => countFullWeekends(ctx.habits, ctx.completions, 400) >= 12,
    progress: ctx => Math.min(1, countFullWeekends(ctx.habits, ctx.completions, 400) / 12),
  },

  // Streak All Habits (new)
  {
    id: 'all-habits-7',
    name: 'Team Effort',
    description: 'Have 3 habits with active streaks of 7+ days.',
    tier: 'silver',
    check: ctx => {
      const active = ctx.habits.filter(h => computeStreak(h, ctx.completions) >= 7)
      return active.length >= 3
    },
    progress: ctx => Math.min(1, ctx.habits.filter(h => computeStreak(h, ctx.completions) >= 7).length / 3),
  },
  {
    id: 'all-habits-30',
    name: 'Squad Goals',
    description: 'Have 3 habits with active streaks of 30+ days.',
    tier: 'gold',
    check: ctx => {
      const active = ctx.habits.filter(h => computeStreak(h, ctx.completions) >= 30)
      return active.length >= 3
    },
    progress: ctx => Math.min(1, ctx.habits.filter(h => computeStreak(h, ctx.completions) >= 30).length / 3),
  },
  {
    id: 'all-habits-100',
    name: 'Elite Squad',
    description: 'Have 2 habits with active streaks of 100+ days.',
    tier: 'platinum',
    check: ctx => {
      const active = ctx.habits.filter(h => computeStreak(h, ctx.completions) >= 100)
      return active.length >= 2
    },
    progress: ctx => Math.min(1, ctx.habits.filter(h => computeStreak(h, ctx.completions) >= 100).length / 2),
  },

  // Unique Days
  {
    id: 'days-10',
    name: 'Ten Days',
    description: 'Complete habits on 10 different days.',
    tier: 'bronze',
    check: ctx => uniqueCompletionDays(ctx.completions) >= 10,
    progress: ctx => Math.min(1, uniqueCompletionDays(ctx.completions) / 10),
  },
  {
    id: 'days-50',
    name: 'Fifty Days',
    description: 'Complete habits on 50 different days.',
    tier: 'silver',
    check: ctx => uniqueCompletionDays(ctx.completions) >= 50,
    progress: ctx => Math.min(1, uniqueCompletionDays(ctx.completions) / 50),
  },
  {
    id: 'days-100',
    name: 'Hundred Days',
    description: 'Complete habits on 100 different days.',
    tier: 'gold',
    check: ctx => uniqueCompletionDays(ctx.completions) >= 100,
    progress: ctx => Math.min(1, uniqueCompletionDays(ctx.completions) / 100),
  },
  {
    id: 'days-365',
    name: 'Full Year',
    description: 'Complete habits on 365 different days.',
    tier: 'platinum',
    check: ctx => uniqueCompletionDays(ctx.completions) >= 365,
    progress: ctx => Math.min(1, uniqueCompletionDays(ctx.completions) / 365),
  },

  // Habit Count
  {
    id: 'habits-5',
    name: 'Five Habits',
    description: 'Create 5 habits.',
    tier: 'bronze',
    check: ctx => ctx.habits.length >= 5,
    progress: ctx => Math.min(1, ctx.habits.length / 5),
  },
  {
    id: 'habits-10',
    name: 'Ten Habits',
    description: 'Create 10 habits.',
    tier: 'silver',
    check: ctx => ctx.habits.length >= 10,
    progress: ctx => Math.min(1, ctx.habits.length / 10),
  },
  {
    id: 'habits-20',
    name: 'Twenty Habits',
    description: 'Create 20 habits.',
    tier: 'gold',
    check: ctx => ctx.habits.length >= 20,
    progress: ctx => Math.min(1, ctx.habits.length / 20),
  },

  // Streak Recovery
  {
    id: 'comeback',
    name: 'The Comeback',
    description: 'Break a 30+ day streak, then start a new one.',
    tier: 'silver',
    check: ctx => {
      // Check if any habit has a current streak but also a broken streak in history
      return ctx.habits.some(h => {
        const current = computeStreak(h, ctx.completions)
        const best = longestStreak(h, ctx.completions)
        return current > 0 && best > 30 && current < best
      })
    },
    progress: ctx => {
      const hasComeback = ctx.habits.some(h => {
        const current = computeStreak(h, ctx.completions)
        const best = longestStreak(h, ctx.completions)
        return current > 0 && best > 30 && current < best
      })
      return hasComeback ? 1 : 0
    },
  },
]

const TIER_STYLES: Record<Achievement['tier'], { color: string; bg: string; icon: any }> = {
  bronze: { color: '#cd8b52', bg: 'rgba(205,139,82,0.14)', icon: Medal },
  silver: { color: '#b8c4d0', bg: 'rgba(184,196,208,0.14)', icon: Award },
  gold: { color: '#f5b942', bg: 'rgba(245,185,66,0.14)', icon: Crown },
  platinum: { color: '#67e8f9', bg: 'rgba(103,232,249,0.14)', icon: Gem },
}

const TIER_ORDER: Achievement['tier'][] = ['bronze', 'silver', 'gold', 'platinum']

// ---------- Main Component ----------
export default function HabitTracker() {
  const [habits, setHabits] = useState<Habit[]>(() =>
    loadLS<Habit[]>(STORAGE_KEYS.habits, []).map(normalizeHabit),
  )
  const [categories, setCategories] = useState<Category[]>(() => loadLS(STORAGE_KEYS.categories, DEFAULT_CATEGORIES))
  const [completions, setCompletions] = useState<CompletionEntry[]>(() => loadLS(STORAGE_KEYS.completions, []))
  const [stats, setStats] = useState<UserStats>(() => normalizeStats(loadLS<Partial<UserStats>>(STORAGE_KEYS.stats, { totalXP: 0, lifetimeXP: 0, prestige: 0 })))
  const [notes, setNotes] = useState<NoteEntry[]>(() => loadLS(STORAGE_KEYS.notes, []))
  const [settings, setSettings] = useState<AppSettings>(() => loadLS(STORAGE_KEYS.settings, { soundEnabled: true, seenAchievements: [] }))

  const [tab, setTab] = useState<'today' | 'stats' | 'achievements' | 'heatmap' | 'categories'>('today')
  const [showHabitForm, setShowHabitForm] = useState(false)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default')
  const [heatmapHabitFilter, setHeatmapHabitFilter] = useState<string>('all')
  const [xpToast, setXpToast] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<string | null>(null)
  const [noteModalFor, setNoteModalFor] = useState<{ habitId: string; habitName: string; date: string } | null>(null)
  const [pendingImport, setPendingImport] = useState<any | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const remindedTodayRef = useRef<Set<string>>(new Set())

  const habitsRef = useRef(habits)
  const completionsRef = useRef(completions)
  const notifRef = useRef(notifPermission)
  habitsRef.current = habits
  completionsRef.current = completions
  notifRef.current = notifPermission

  useEffect(() => saveLS(STORAGE_KEYS.habits, habits), [habits])
  useEffect(() => saveLS(STORAGE_KEYS.categories, categories), [categories])
  useEffect(() => saveLS(STORAGE_KEYS.completions, completions), [completions])
  useEffect(() => saveLS(STORAGE_KEYS.stats, stats), [stats])
  useEffect(() => saveLS(STORAGE_KEYS.notes, notes), [notes])
  useEffect(() => saveLS(STORAGE_KEYS.settings, settings), [settings])

  useEffect(() => {
    if (typeof Notification !== 'undefined') setNotifPermission(Notification.permission)
  }, [])

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') return
    const perm = await Notification.requestPermission()
    setNotifPermission(perm)
  }

  useEffect(() => {
    const interval = setInterval(() => {
      if (notifRef.current !== 'granted') return
      const now = new Date()
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const nowStr = `${hh}:${mm}`
      const today = todayISO()

      const stale: string[] = []
      remindedTodayRef.current.forEach(k => {
        if (!k.endsWith(`-${today}`)) stale.push(k)
      })
      stale.forEach(k => remindedTodayRef.current.delete(k))

      habitsRef.current.forEach(h => {
        if (h.archived || !h.reminderTime) return
        if (h.reminderTime !== nowStr) return
        if (!habitAppliesToDate(h, today)) return
        const key = `${h.id}-${today}`
        if (remindedTodayRef.current.has(key)) return
        const entry = completionsRef.current.find(c => c.habitId === h.id && c.date === today)
        const done = entry && entry.count >= h.targetPerDay
        if (done) return

        remindedTodayRef.current.add(key)
        new Notification('Obscurum Habit Reminder', {
          body: `Time for: ${h.name}`,
          tag: key,
        })
      })
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const playChime = useCallback((kind: 'complete' | 'levelup' | 'achievement') => {
    if (!settings.soundEnabled) return
    if (typeof window === 'undefined') return
    try {
      const AnyWindow = window as any
      const Ctx = AnyWindow.AudioContext || AnyWindow.webkitAudioContext
      if (!Ctx) return
      let existing = audioCtxRef.current
      if (!existing) {
        existing = new Ctx()
        audioCtxRef.current = existing
      }
      const ctx = existing as AudioContext
      const now = ctx.currentTime
      const freqs = kind === 'complete' ? [660, 880] : kind === 'levelup' ? [523, 659, 784, 1046] : [784, 988, 1318]
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        const start = now + i * 0.09
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 0.3)
      })
    } catch {}
  }, [settings.soundEnabled])

  const { level, progress } = useMemo(() => levelFromXP(stats.totalXP), [stats.totalXP])
  const rank = useMemo(() => rankForLevel(level), [level])

  const achievementCtx: AchievementContext = useMemo(() => ({
    habits, completions, notes, totalXP: stats.totalXP, lifetimeXP: stats.lifetimeXP, level, prestige: stats.prestige,
  }), [habits, completions, notes, stats.totalXP, stats.lifetimeXP, stats.prestige, level])

  const enrichedAchievements = useMemo(
    () => ACHIEVEMENTS.map(a => ({
      a,
      unlocked: a.check(achievementCtx),
      prog: a.progress(achievementCtx),
    })),
    [achievementCtx]
  )

  const unlockedAchievements = useMemo(
    () => enrichedAchievements.filter(x => x.unlocked).map(x => x.a),
    [enrichedAchievements]
  )

  useEffect(() => {
    const newlyUnlocked = unlockedAchievements.filter(a => !settings.seenAchievements.includes(a.id))
    if (newlyUnlocked.length > 0) {
      setCelebration(`Achievement unlocked: ${newlyUnlocked[0].name}`)
      playChime('achievement')
      const ids = newlyUnlocked.map(a => a.id)
      setSettings(s => ({ ...s, seenAchievements: [...s.seenAchievements, ...ids] }))
      const t = setTimeout(() => setCelebration(null), 3200)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlockedAchievements])

  const prevLevelRef = useRef(level)
  useEffect(() => {
    if (level > prevLevelRef.current) {
      setCelebration(`Level ${level} reached!`)
      playChime('levelup')
      const t = setTimeout(() => setCelebration(null), 3200)
      prevLevelRef.current = level
      return () => clearTimeout(t)
    }
    prevLevelRef.current = level
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  const activeHabits = habits.filter(h => !h.archived)
  const today = todayISO()
  const todaysHabits = activeHabits.filter(h => habitAppliesToDate(h, today))

  const getCompletionCount = useCallback((habitId: string, date: string) => {
    return completions.find(c => c.habitId === habitId && c.date === date)?.count ?? 0
  }, [completions])

  const getNote = useCallback((habitId: string, date: string) => {
    return notes.find(n => n.habitId === habitId && n.date === date)?.text ?? ''
  }, [notes])

  const toggleCompletion = (habit: Habit) => {
    const current = getCompletionCount(habit.id, today)
    const isDone = current >= habit.targetPerDay
    const newCount = isDone ? 0 : Math.min(current + 1, habit.targetPerDay)
    const willBeDone = newCount >= habit.targetPerDay

    const idx = completions.findIndex(c => c.habitId === habit.id && c.date === today)
    const prevEntry = idx >= 0 ? completions[idx] : undefined

    if (willBeDone && !isDone) {
      const provisional = [...completions]
      const provisionalEntry: CompletionEntry = { habitId: habit.id, date: today, count: newCount }
      if (idx >= 0) provisional[idx] = provisionalEntry
      else provisional.push(provisionalEntry)
      const newStreak = computeStreak(habit, provisional)

      const mult = streakMultiplier(newStreak)
      const pMult = prestigeMultiplier(stats.prestige)
      const baseXp = Number.isFinite(habit.xpPerCompletion) && habit.xpPerCompletion > 0 ? habit.xpPerCompletion : 10
      const xpGained = Math.max(1, Math.round(baseXp * mult * pMult))

      const finalEntry: CompletionEntry = {
        habitId: habit.id, date: today, count: newCount,
        completedAt: new Date().toISOString(), xpAwarded: xpGained,
      }
      const nextCompletions = [...completions]
      if (idx >= 0) nextCompletions[idx] = finalEntry
      else nextCompletions.push(finalEntry)
      setCompletions(nextCompletions)

      setStats(s => ({ ...s, totalXP: s.totalXP + xpGained, lifetimeXP: s.lifetimeXP + xpGained }))
      setXpToast(mult > 1 ? `+${xpGained} XP (${mult}x streak) — ${habit.name}` : `+${xpGained} XP — ${habit.name}`)
      playChime('complete')
      setTimeout(() => setXpToast(null), 2200)

      if (STREAK_MILESTONES.includes(newStreak)) {
        setTimeout(() => {
          setCelebration(`${newStreak}-day streak on ${habit.name}!`)
          playChime('achievement')
          setTimeout(() => setCelebration(null), 3200)
        }, 350)
      }
    } else if (!willBeDone && isDone) {
      const refund = prevEntry?.xpAwarded ?? (Number.isFinite(habit.xpPerCompletion) ? habit.xpPerCompletion : 10)
      const nextCompletions = [...completions]
      if (idx >= 0) nextCompletions[idx] = { habitId: habit.id, date: today, count: newCount }
      setCompletions(nextCompletions)
      setStats(s => ({ ...s, totalXP: Math.max(0, s.totalXP - refund), lifetimeXP: Math.max(0, s.lifetimeXP - refund) }))
    } else {
      const nextCompletions = [...completions]
      const entry: CompletionEntry = {
        habitId: habit.id, date: today, count: newCount,
        completedAt: prevEntry?.completedAt, xpAwarded: prevEntry?.xpAwarded,
      }
      if (idx >= 0) nextCompletions[idx] = entry
      else nextCompletions.push(entry)
      setCompletions(nextCompletions)
    }
  }

  const doPrestige = () => {
    if (level < PRESTIGE_UNLOCK_LEVEL) return
    const confirmed = window.confirm(
      "Prestige resets your level back to 1 and clears your current Level XP. All-time XP, achievements, streaks, and history are kept. You'll permanently gain +5% XP on every completion, stacking with future prestiges. Continue?"
    )
    if (!confirmed) return
    const nextPrestige = stats.prestige + 1
    setStats(s => ({ ...s, totalXP: 0, prestige: nextPrestige }))
    setTimeout(() => {
      setCelebration(`Prestiged to P${nextPrestige}! +${nextPrestige * 5}% XP forever.`)
      playChime('levelup')
      setTimeout(() => setCelebration(null), 3200)
    }, 50)
  }

  const saveNote = (habitId: string, date: string, text: string) => {
    setNotes(prev => {
      const idx = prev.findIndex(n => n.habitId === habitId && n.date === date)
      if (!text.trim()) return prev.filter(n => !(n.habitId === habitId && n.date === date))
      const entry: NoteEntry = { habitId, date, text: text.trim() }
      if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next }
      return [...prev, entry]
    })
    setNoteModalFor(null)
  }

  const saveHabit = (habit: Habit) => {
    setHabits(prev => {
      const idx = prev.findIndex(h => h.id === habit.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = habit; return next }
      return [...prev, habit]
    })
    setShowHabitForm(false)
    setEditingHabit(null)
  }

  const deleteHabit = (id: string) => {
    setHabits(prev => prev.filter(h => h.id !== id))
    setCompletions(prev => prev.filter(c => c.habitId !== id))
    setNotes(prev => prev.filter(n => n.habitId !== id))
  }

  const saveCategory = (cat: Category) => {
    setCategories(prev => {
      const idx = prev.findIndex(c => c.id === cat.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = cat; return next }
      return [...prev, cat]
    })
    setShowCategoryForm(false)
  }

  const deleteCategory = (id: string) => {
    if (habits.some(h => h.categoryId === id)) return
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  const exportData = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      habits, categories, completions, stats, notes, settings,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `obscurum-habits-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (e: any) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!parsed || !Array.isArray(parsed.habits) || !Array.isArray(parsed.categories)) {
        throw new Error('shape mismatch')
      }
      setPendingImport(parsed)
    } catch {
      window.alert("Couldn't read that file — make sure it's a Obscurum backup JSON.")
    }
    e.target.value = ''
  }

  const confirmImport = () => {
    if (!pendingImport) return
    setHabits(Array.isArray(pendingImport.habits) ? pendingImport.habits.map(normalizeHabit) : [])
    setCategories(Array.isArray(pendingImport.categories) ? pendingImport.categories : DEFAULT_CATEGORIES)
    setCompletions(Array.isArray(pendingImport.completions) ? pendingImport.completions : [])
    setStats(normalizeStats(pendingImport.stats))
    setNotes(Array.isArray(pendingImport.notes) ? pendingImport.notes : [])
    if (pendingImport.settings) setSettings(pendingImport.settings)
    setPendingImport(null)
  }

  

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      {xpToast && (
        <div className="fixed top-6 right-6 z-50 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold">
          <Zap size={16} /> {xpToast}
        </div>
      )}

      {celebration && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-amber-500 via-pink-500 to-rose-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-sm font-bold animate-bounce">
          <PartyPopper size={18} /> {celebration}
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.2), rgba(251,191,36,0.05))', border: '1px solid rgba(251,191,36,0.15)' }}>
              <Flame size={18} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-wide">LEDGER</h1>
              <p className="text-white/40 text-xs">Build the daily reps that make the skills stick.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSettings(s => ({ ...s, soundEnabled: !s.soundEnabled }))}
              className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
              title={settings.soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
            >
              {settings.soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            
            <div className="ghost-panel px-4 py-2 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <rank.icon size={12} style={{ color: rank.color }} />
                    <span className="text-xs font-semibold" style={{ color: rank.color }}>{rank.title}</span>
                    {stats.prestige > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 flex items-center gap-1">
                        <Gem size={8} /> P{stats.prestige}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/50">
                    <span>Lv.{level}</span>
                    <span>·</span>
                    <span>{stats.totalXP} XP</span>
                  </div>
                </div>
                <div className="w-24">
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full transition-all duration-500" style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${rank.color}, #f43f5e)` }} />
                  </div>
                  {level >= PRESTIGE_UNLOCK_LEVEL && (
                    <button
                      onClick={doPrestige}
                      className="text-[9px] px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-pink-500 text-white font-semibold hover:brightness-110 mt-0.5 w-full"
                    >
                      <Gem size={8} className="inline mr-0.5" /> Prestige
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {notifPermission !== 'granted' && habits.some(h => h.reminderTime) && (
          <button
            onClick={requestNotifPermission}
            className="w-full mb-4 text-sm px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-2 hover:bg-amber-500/20"
          >
            <Bell size={14} /> You have habits with reminders set, but notifications aren't enabled yet. Click to enable.
          </button>
        )}

        {/* Tabs */}
        <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6 w-fit overflow-x-auto max-w-full">
          {[
            { id: 'today', label: 'Today', icon: Target },
            { id: 'stats', label: 'Stats', icon: BarChart3 },
            { id: 'achievements', label: 'Achievements', icon: Award },
            { id: 'heatmap', label: 'Heatmap', icon: CalendarIcon },
            { id: 'categories', label: 'Categories', icon: Settings },
          ].map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all whitespace-nowrap ${tab === t.id ? 'bg-pink-500 text-white' : 'text-white/40 hover:text-white/70'}`}
              >
                <Icon size={14} /> {t.label}
                {t.id === 'achievements' && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/20' : 'bg-white/5'}`}>
                    {unlockedAchievements.length}/{ACHIEVEMENTS.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        {tab === 'today' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white font-semibold text-lg">Today's Habits</h2>
              <button
                onClick={() => { setEditingHabit(null); setShowHabitForm(true) }}
                className="text-sm px-4 py-2 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/30 flex items-center gap-2 hover:bg-pink-500/20 transition-colors"
              >
                <Plus size={14} /> New Habit
              </button>
            </div>

            {todaysHabits.length === 0 && (
              <div className="rounded-2xl border border-white/10 p-12 text-center" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <Flame size={40} className="mx-auto mb-3 opacity-30 text-white/20" />
                <p className="text-white/40">No habits scheduled for today. Add one to get started.</p>
              </div>
            )}

            <div className="space-y-3">
              {todaysHabits.map(habit => {
                const category = categories.find(c => c.id === habit.categoryId)
                const Icon = ICON_MAP[category?.icon ?? 'target'] ?? Target
                const count = getCompletionCount(habit.id, today)
                const done = count >= habit.targetPerDay
                const streak = computeStreak(habit, completions)
                const hasNote = !!getNote(habit.id, today)

                return (
                  <div key={habit.id} className={`rounded-2xl border p-4 transition-all ${done ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${category?.color}22`, color: category?.color }}
                      >
                        <Icon size={18} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold">{habit.name}</span>
                          {streak > 0 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 flex items-center gap-1">
                              <Flame size={10} /> {streak}
                            </span>
                          )}
                          {habit.reminderTime && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-white/50 flex items-center gap-1">
                              <Bell size={10} /> {habit.reminderTime}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white/30 mt-0.5">
                          {category?.name} · {habit.targetPerDay > 1 ? `${count}/${habit.targetPerDay} today` : habit.frequency}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setNoteModalFor({ habitId: habit.id, habitName: habit.name, date: today })}
                          className={`p-2 rounded-lg hover:bg-white/5 transition-colors ${hasNote ? 'text-pink-400' : 'text-white/30'}`}
                          title={hasNote ? 'Edit journal note' : 'Add journal note'}
                        >
                          <StickyNote size={14} />
                        </button>
                        <button
                          onClick={() => { setEditingHabit(habit); setShowHabitForm(true) }}
                          className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => toggleCompletion(habit)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all ${
                            done
                              ? 'bg-emerald-500 border-emerald-500 text-white'
                              : 'border-white/20 text-white/30 hover:border-pink-500'
                          }`}
                        >
                          <Check size={18} />
                        </button>
                      </div>
                    </div>

                    {habit.targetPerDay > 1 && (
                      <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (count / habit.targetPerDay) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {activeHabits.length > 0 && activeHabits.length - todaysHabits.length > 0 && (
              <div className="mt-6 text-xs text-white/30">
                {activeHabits.length - todaysHabits.length} other habit(s) not scheduled today.
              </div>
            )}
          </div>
        )}

        {tab === 'stats' && (
          <StatsView habits={activeHabits} completions={completions} notes={notes} categories={categories} />
        )}

        {tab === 'achievements' && (
          <AchievementsView enriched={enrichedAchievements} />
        )}

        {tab === 'heatmap' && (
          <HeatmapView
            habits={activeHabits}
            completions={completions}
            filter={heatmapHabitFilter}
            setFilter={setHeatmapHabitFilter}
          />
        )}

        {tab === 'categories' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-white font-semibold text-lg">Categories</h2>
              <button
                onClick={() => setShowCategoryForm(true)}
                className="text-sm px-4 py-2 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/30 flex items-center gap-2 hover:bg-pink-500/20 transition-colors"
              >
                <Plus size={14} /> New Category
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories.map(cat => {
                const Icon = ICON_MAP[cat.icon] ?? Target
                const habitCount = habits.filter(h => h.categoryId === cat.id).length
                return (
                  <div key={cat.id} className="rounded-2xl border border-white/10 p-4 bg-white/5 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${cat.color}22`, color: cat.color }}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="text-white font-semibold text-sm">{cat.name}</div>
                      <div className="text-xs text-white/30">{habitCount} habit{habitCount !== 1 ? 's' : ''}</div>
                    </div>
                    <button
                      onClick={() => deleteCategory(cat.id)}
                      disabled={habitCount > 0}
                      className="p-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors disabled:opacity-20"
                      title={habitCount > 0 ? "Reassign habits before deleting" : "Delete category"}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 p-5 bg-white/5">
              <h3 className="text-white font-semibold text-sm mb-1 flex items-center gap-2"><Download size={14} /> Backup &amp; restore</h3>
              <p className="text-xs text-white/40 mb-4">Export everything as a JSON file you can keep, or restore from a previous backup.</p>
              <div className="flex gap-3">
                <button onClick={exportData} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-sm flex items-center justify-center gap-2 hover:bg-white/5 hover:text-white/80 transition-colors">
                  <Download size={14} /> Export backup
                </button>
                <button onClick={() => fileInputRef.current?.click()} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-sm flex items-center justify-center gap-2 hover:bg-white/5 hover:text-white/80 transition-colors">
                  <Upload size={14} /> Import backup
                </button>
              </div>
              <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
            </div>
          </div>
        )}

        {/* Modals */}
        {showHabitForm && (
          <HabitFormModal
            habit={editingHabit}
            categories={categories}
            onSave={saveHabit}
            onDelete={editingHabit ? () => { deleteHabit(editingHabit.id); setShowHabitForm(false); setEditingHabit(null) } : undefined}
            onClose={() => { setShowHabitForm(false); setEditingHabit(null) }}
          />
        )}

        {showCategoryForm && (
          <CategoryFormModal onSave={saveCategory} onClose={() => setShowCategoryForm(false)} />
        )}

        {noteModalFor && (
          <NoteModal
            habitName={noteModalFor.habitName}
            date={noteModalFor.date}
            initialText={getNote(noteModalFor.habitId, noteModalFor.date)}
            onSave={text => saveNote(noteModalFor.habitId, noteModalFor.date, text)}
            onClose={() => setNoteModalFor(null)}
          />
        )}

        {pendingImport && (
          <ImportConfirmModal
            data={pendingImport}
            onConfirm={confirmImport}
            onCancel={() => setPendingImport(null)}
          />
        )}
      </div>
    </div>
  )
}

// ---------- Stats Dashboard ----------
function StatsView({ habits, completions, notes, categories }: {
  habits: Habit[]
  completions: CompletionEntry[]
  notes: NoteEntry[]
  categories: Category[]
}) {
  const totalCompletions = useMemo(() => totalCompletionsCount(habits, completions), [habits, completions])

  const bestStreak = useMemo(() => {
    let best = { name: '—', value: 0 }
    habits.forEach(h => {
      const v = longestStreak(h, completions)
      if (v > best.value) best = { name: h.name, value: v }
    })
    return best
  }, [habits, completions])

  const perfectDays = useMemo(() => perfectDaysInWindow(habits, completions, 90), [habits, completions])

  const currentStreaks = useMemo(() => {
    return habits
      .map(h => ({ name: h.name, streak: computeStreak(h, completions) }))
      .filter(s => s.streak > 0)
      .sort((a, b) => b.streak - a.streak)
  }, [habits, completions])

  const weeklyTrend = useMemo(() => {
    const weeks: { label: string; rate: number }[] = []
    for (let w = 7; w >= 0; w--) {
      let done = 0, total = 0
      for (let d = 0; d < 7; d++) {
        const dayIndex = w * 7 + d
        const iso = isoDaysAgo(dayIndex)
        habits.forEach(h => {
          if (!habitAppliesToDate(h, iso)) return
          if (new Date(h.createdAt) > new Date(iso + 'T23:59:59')) return
          total++
          const entry = completions.find(c => c.habitId === h.id && c.date === iso)
          if (entry && entry.count >= h.targetPerDay) done++
        })
      }
      weeks.push({ label: w === 0 ? 'This wk' : `-${w}w`, rate: total > 0 ? done / total : 0 })
    }
    return weeks
  }, [habits, completions])

  const categoryBreakdown = useMemo(() => {
    const byCategory: Record<string, number> = {}
    completions.forEach(c => {
      const h = habits.find(hh => hh.id === c.habitId)
      if (h && c.count >= h.targetPerDay) byCategory[h.categoryId] = (byCategory[h.categoryId] ?? 0) + 1
    })
    return byCategory
  }, [habits, completions])

  const recentNotes = useMemo(
    () => [...notes].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [notes]
  )

  const maxCategoryCount = Math.max(1, ...Object.values(categoryBreakdown))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Zap} label="Total completions" value={totalCompletions} />
        <StatCard icon={Flame} label="Best streak ever" value={bestStreak.value} sub={bestStreak.name} />
        <StatCard icon={Trophy} label="Perfect days (90d)" value={perfectDays} />
        <StatCard icon={TrendingUp} label="Active streaks" value={currentStreaks.length} />
      </div>

      <div className="rounded-2xl border border-white/10 p-5 bg-white/5">
        <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2"><BarChart3 size={16} /> Weekly completion rate</h3>
        <div className="flex items-end gap-2 h-32">
          {weeklyTrend.map((w, i) => (
            <div key={i} className="flex-1 h-full flex flex-col items-center justify-end gap-1.5">
              <div className="w-full flex-1 bg-white/10 rounded-t-md overflow-hidden flex items-end">
                <div
                  className="w-full bg-gradient-to-t from-pink-600 to-rose-400 rounded-t-md transition-all"
                  style={{ height: `${Math.max(3, w.rate * 100)}%` }}
                  title={`${Math.round(w.rate * 100)}%`}
                />
              </div>
              <span className="text-[10px] text-white/30">{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {Object.keys(categoryBreakdown).length > 0 && (
        <div className="rounded-2xl border border-white/10 p-5 bg-white/5">
          <h3 className="text-white font-semibold text-sm mb-4">Completions by category</h3>
          <div className="space-y-2.5">
            {Object.entries(categoryBreakdown).map(([catId, count]) => {
              const cat = categories.find(c => c.id === catId)
              return (
                <div key={catId} className="flex items-center gap-3">
                  <span className="text-xs text-white/40 w-28 truncate">{cat?.name ?? 'Unknown'}</span>
                  <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(count / maxCategoryCount) * 100}%`, backgroundColor: cat?.color ?? '#ec4899' }}
                    />
                  </div>
                  <span className="text-xs text-white/40 w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {currentStreaks.length > 0 && (
        <div className="rounded-2xl border border-white/10 p-5 bg-white/5">
          <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><Flame size={16} className="text-orange-400" /> Current streaks</h3>
          <div className="space-y-2">
            {currentStreaks.map(s => (
              <div key={s.name} className="flex items-center justify-between text-sm text-white/80">
                <span>{s.name}</span>
                <span className="text-orange-400 font-semibold">{s.streak}d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentNotes.length > 0 && (
        <div className="rounded-2xl border border-white/10 p-5 bg-white/5">
          <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2"><StickyNote size={16} /> Recent journal entries</h3>
          <div className="space-y-3">
            {recentNotes.map((n, i) => {
              const h = habits.find(hh => hh.id === n.habitId)
              return (
                <div key={i} className="text-sm border-l-2 border-pink-500/40 pl-3 text-white/70">
                  <div className="text-xs text-white/30">{n.date} · {h?.name ?? 'Deleted habit'}</div>
                  <div className="mt-0.5">{n.text}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {totalCompletions === 0 && (
        <div className="rounded-2xl border border-white/10 p-12 text-center bg-white/5">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-30 text-white/20" />
          <p className="text-white/40">No data yet. Complete a few habits and your stats will show up here.</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 p-4 bg-white/5">
      <Icon size={16} className="text-pink-400 mb-2" />
      <div className="text-white text-xl font-bold">{value}</div>
      <div className="text-xs text-white/40 mt-0.5">{label}</div>
      {sub && sub !== '—' && <div className="text-[10px] text-white/30 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

// ---------- Achievements ----------
function AchievementsView({ enriched }: { enriched: { a: Achievement; unlocked: boolean; prog: number }[] }) {
  const unlockedCount = useMemo(() => enriched.filter(x => x.unlocked).length, [enriched])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg flex items-center gap-2"><Award size={18} /> Achievements</h2>
        <span className="text-sm text-white/40">{unlockedCount} / {ACHIEVEMENTS.length} unlocked</span>
      </div>

      <div className="space-y-8">
        {TIER_ORDER.map(tierKey => {
          const inTier = enriched.filter(x => x.a.tier === tierKey)
          if (inTier.length === 0) return null
          const tierUnlocked = inTier.filter(x => x.unlocked).length
          const tierStyle = TIER_STYLES[tierKey]
          const TierHeaderIcon = tierStyle.icon
          return (
            <div key={tierKey}>
              <div className="flex items-center gap-2 mb-3">
                <TierHeaderIcon size={14} style={{ color: tierStyle.color }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: tierStyle.color }}>{tierKey}</span>
                <span className="text-xs text-white/30">{tierUnlocked} / {inTier.length}</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {inTier.map(({ a, unlocked, prog }) => {
                  const tier = TIER_STYLES[a.tier]
                  const TierIcon = tier.icon
                  return (
                    <div
                      key={a.id}
                      className={`rounded-2xl border p-4 transition-all ${unlocked ? 'border-white/10 bg-white/5' : 'border-white/5 bg-white/3 opacity-60'}`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: unlocked ? tier.bg : 'rgba(255,255,255,0.03)', color: unlocked ? tier.color : '#666' }}
                        >
                          <TierIcon size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-white font-semibold text-sm truncate">{a.name}</div>
                          <div className="text-[10px] uppercase tracking-wide text-white/30">{a.tier}</div>
                        </div>
                      </div>
                      <p className="text-xs text-white/40 mb-2">{a.description}</p>
                      {!unlocked && (
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-pink-500/60 rounded-full" style={{ width: `${prog * 100}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- Heatmap ----------
function HeatmapView({ habits, completions, filter, setFilter }: {
  habits: Habit[]
  completions: CompletionEntry[]
  filter: string
  setFilter: (v: string) => void
}) {
  const WEEKS = 20
  const days = useMemo(() => {
    const arr: string[] = []
    for (let i = WEEKS * 7 - 1; i >= 0; i--) arr.push(isoDaysAgo(i))
    return arr
  }, [])

  const dayIntensity = useCallback((date: string) => {
    const relevant = filter === 'all' ? habits : habits.filter(h => h.id === filter)
    let done = 0
    let total = 0
    relevant.forEach(h => {
      if (!habitAppliesToDate(h, date)) return
      if (new Date(h.createdAt) > new Date(date + 'T23:59:59')) return
      total++
      const entry = completions.find(c => c.habitId === h.id && c.date === date)
      if (entry && entry.count >= h.targetPerDay) done++
    })
    if (total === 0) return -1
    return done / total
  }, [habits, completions, filter])

  const colorForIntensity = (intensity: number) => {
    if (intensity < 0) return 'bg-white/5 border border-white/5'
    if (intensity === 0) return 'bg-white/10'
    if (intensity < 0.34) return 'bg-pink-900/60'
    if (intensity < 0.67) return 'bg-pink-600/70'
    if (intensity < 1) return 'bg-pink-500'
    return 'bg-gradient-to-br from-pink-400 to-rose-400'
  }

  const weeks: string[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

  const totalDoneWindow = days.filter(d => dayIntensity(d) === 1).length

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-white font-semibold text-lg flex items-center gap-2"><TrendingUp size={18} /> Consistency Heatmap</h2>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/60 text-sm focus:outline-none focus:border-pink-500/30"
        >
          <option value="all" style={{ background: '#0d1022' }}>All habits (combined)</option>
          {habits.map(h => <option key={h.id} value={h.id} style={{ background: '#0d1022' }}>{h.name}</option>)}
        </select>
      </div>

      <div className="rounded-2xl border border-white/10 p-6 bg-white/5 overflow-x-auto">
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 pt-4 text-[10px] text-white/30">
            {DAY_LABELS.map((d, i) => <div key={i} className="h-4 flex items-center">{i % 2 === 1 ? d : ''}</div>)}
          </div>
          <div className="flex gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {week.map(date => {
                  const intensity = dayIntensity(date)
                  return (
                    <div
                      key={date}
                      title={`${date}: ${intensity < 0 ? 'nothing scheduled' : `${Math.round(intensity * 100)}% complete`}`}
                      className={`w-4 h-4 rounded-sm ${colorForIntensity(intensity)}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4 text-[10px] text-white/30">
          <span>Less</span>
          <div className="w-3 h-3 rounded-sm bg-white/10" />
          <div className="w-3 h-3 rounded-sm bg-pink-900/60" />
          <div className="w-3 h-3 rounded-sm bg-pink-600/70" />
          <div className="w-3 h-3 rounded-sm bg-pink-500" />
          <div className="w-3 h-3 rounded-sm bg-gradient-to-br from-pink-400 to-rose-400" />
          <span>More</span>
          <span className="ml-auto text-white/50">{totalDoneWindow} fully complete days in last {WEEKS * 7}</span>
        </div>
      </div>
    </div>
  )
}

// ---------- Note Modal ----------
function NoteModal({ habitName, date, initialText, onSave, onClose }: {
  habitName: string
  date: string
  initialText: string
  onSave: (text: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState(initialText)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="rounded-2xl p-6 w-full max-w-md border border-white/10" style={{ background: 'linear-gradient(135deg, #0d1022 0%, #090b14 100%)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-white text-lg font-semibold flex items-center gap-2"><StickyNote size={16} /> Journal note</h3>
            <p className="text-xs text-white/40 mt-0.5">{habitName} · {date}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors"><X size={20} /></button>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="How did it go? Any blockers, wins, or context worth remembering..."
          rows={5}
          autoFocus
          className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white/80 placeholder-white/30 resize-none focus:outline-none focus:border-pink-500/30"
        />
        <div className="flex gap-3 mt-4">
          <button onClick={() => onSave('')} className="px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 text-sm hover:bg-rose-500/10 transition-colors">
            Clear
          </button>
          <button onClick={() => onSave(text)} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-sm hover:brightness-110 transition-all">
            Save note
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Import Confirm Modal ----------
function ImportConfirmModal({ data, onConfirm, onCancel }: { data: any; onConfirm: () => void; onCancel: () => void }) {
  const habitCount = Array.isArray(data.habits) ? data.habits.length : 0
  const categoryCount = Array.isArray(data.categories) ? data.categories.length : 0
  const completionCount = Array.isArray(data.completions) ? data.completions.length : 0

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="rounded-2xl p-6 w-full max-w-sm border border-white/10" style={{ background: 'linear-gradient(135deg, #0d1022 0%, #090b14 100%)' }} onClick={e => e.stopPropagation()}>
        <h3 className="text-white text-lg font-semibold mb-2 flex items-center gap-2"><Upload size={16} /> Import backup?</h3>
        <p className="text-sm text-white/50 mb-4">
          This file contains {habitCount} habit{habitCount !== 1 ? 's' : ''}, {categoryCount} categor{categoryCount !== 1 ? 'ies' : 'y'}, and {completionCount} completion record{completionCount !== 1 ? 's' : ''}.
          Importing will replace all your current data. This can't be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-sm hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-sm hover:brightness-110 transition-all">Replace data</button>
        </div>
      </div>
    </div>
  )
}

// ---------- Habit Form Modal ----------
function HabitFormModal({ habit, categories, onSave, onDelete, onClose }: {
  habit: Habit | null
  categories: Category[]
  onSave: (h: Habit) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(habit?.name ?? '')
  const [categoryId, setCategoryId] = useState(habit?.categoryId ?? categories[0]?.id ?? '')
  const [frequency, setFrequency] = useState<Frequency>(habit?.frequency ?? 'daily')
  const [customDays, setCustomDays] = useState<number[]>(habit?.customDays ?? [1, 3, 5])
  const [targetPerDay, setTargetPerDay] = useState(habit?.targetPerDay ?? 1)
  const [reminderEnabled, setReminderEnabled] = useState(!!habit?.reminderTime)
  const [reminderTime, setReminderTime] = useState(habit?.reminderTime ?? '08:00')
  const [xpPerCompletion, setXpPerCompletion] = useState(habit?.xpPerCompletion ?? 10)

  const toggleDay = (d: number) => {
    setCustomDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort())
  }

  const applyTemplate = (t: HabitTemplate) => {
    setName(t.name)
    setFrequency(t.frequency)
    setTargetPerDay(t.targetPerDay)
    setXpPerCompletion(t.xpPerCompletion)
    const match = categories.find(c => c.id === t.categoryHint)
    if (match) setCategoryId(match.id)
  }

  const submit = () => {
    if (!name.trim() || !categoryId) return
    onSave({
      id: habit?.id ?? `habit-${Date.now()}`,
      name: name.trim(),
      categoryId,
      frequency,
      customDays,
      targetPerDay: Math.max(1, targetPerDay),
      reminderTime: reminderEnabled ? reminderTime : null,
      xpPerCompletion: Math.max(1, xpPerCompletion),
      createdAt: habit?.createdAt ?? new Date().toISOString(),
      archived: false,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto border border-white/10" style={{ background: 'linear-gradient(135deg, #0d1022 0%, #090b14 100%)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-white text-lg font-semibold">{habit ? 'Edit Habit' : 'New Habit'}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          {!habit && (
            <div>
              <label className="text-xs text-white/40 mb-1.5 flex items-center gap-1"><Sparkles size={12} /> Quick start (optional)</label>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {HABIT_TEMPLATES.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => applyTemplate(t)}
                    className="flex-shrink-0 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-xs text-white/60 hover:border-pink-500 hover:text-white/80 transition-colors whitespace-nowrap"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-white/40 block mb-1.5">Habit name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 1 hour Wireshark practice"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder-white/30 focus:outline-none focus:border-pink-500/30"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1.5">Category</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:border-pink-500/30">
              {categories.map(c => <option key={c.id} value={c.id} style={{ background: '#0d1022' }}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1.5">Frequency</label>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'custom'] as Frequency[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all ${frequency === f ? 'bg-pink-500 text-white' : 'bg-black/30 text-white/40 border border-white/10 hover:text-white/70'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            {frequency === 'custom' && (
              <div className="flex gap-1.5 mt-2">
                {DAY_LABELS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`w-9 h-9 rounded-lg text-xs font-bold transition-all ${customDays.includes(i) ? 'bg-pink-500 text-white' : 'bg-black/30 text-white/40 border border-white/10'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1.5">Target completions per scheduled day</label>
            <input
              type="number"
              min={1}
              value={targetPerDay}
              onChange={e => setTargetPerDay(parseInt(e.target.value) || 1)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:border-pink-500/30"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-white/40">Reminder</label>
              <button onClick={() => setReminderEnabled(!reminderEnabled)} className="text-white/40 hover:text-white/70 transition-colors">
                {reminderEnabled ? <Bell size={16} className="text-pink-400" /> : <BellOff size={16} />}
              </button>
            </div>
            {reminderEnabled && (
              <input
                type="time"
                value={reminderTime}
                onChange={e => setReminderTime(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:border-pink-500/30"
              />
            )}
          </div>

          <div>
            <label className="text-xs text-white/40 mb-1.5 flex items-center gap-1"><Star size={12} /> XP per completion</label>
            <input
              type="number"
              min={1}
              value={xpPerCompletion}
              onChange={e => setXpPerCompletion(parseInt(e.target.value) || 10)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 focus:outline-none focus:border-pink-500/30"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          {onDelete && (
            <button onClick={onDelete} className="px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 text-sm hover:bg-rose-500/10 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={submit} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-sm hover:brightness-110 transition-all">
            {habit ? 'Save Changes' : 'Create Habit'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Category Form Modal ----------
function CategoryFormModal({ onSave, onClose }: { onSave: (c: Category) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#ec4899')
  const [icon, setIcon] = useState('target')

  const submit = () => {
    if (!name.trim()) return
    onSave({ id: `cat-${Date.now()}`, name: name.trim(), color, icon })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="rounded-2xl p-6 w-full max-w-sm border border-white/10" style={{ background: 'linear-gradient(135deg, #0d1022 0%, #090b14 100%)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-white text-lg font-semibold">New Category</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/40 block mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bug Bounty" className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white/80 placeholder-white/30 focus:outline-none focus:border-pink-500/30" autoFocus />
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1.5">Color</label>
            <div className="flex gap-2 flex-wrap">
              {['#ec4899', '#f43f5e', '#a855f7', '#10b981', '#f59e0b', '#3b82f6', '#06b6d4', '#ef4444', '#f97316', '#22d3ee'].map(c => (
                <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full transition-all ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0d1022]' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1.5">Icon</label>
            <div className="grid grid-cols-7 gap-2">
              {ICON_KEYS.slice(0, 21).map(key => {
                const Icon = ICON_MAP[key]
                return (
                  <button
                    key={key}
                    onClick={() => setIcon(key)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${icon === key ? 'bg-pink-500 text-white' : 'bg-black/30 text-white/40 border border-white/10 hover:text-white/70'}`}
                  >
                    <Icon size={16} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <button onClick={submit} className="w-full mt-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold text-sm hover:brightness-110 transition-all">
          Create Category
        </button>
      </div>
    </div>
  )
}