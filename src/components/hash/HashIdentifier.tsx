import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Hash, Copy, Check, RotateCcw, Cpu, AlertTriangle,
  Download, Upload, Trash2, History, FileText, Target,
  BookOpen, Play, Search, Filter, Shield, Eye, EyeOff,
  Layers, Activity, Plus,
  Sparkles, Globe, Terminal, BarChart3, Clock, 
  Key, Settings, Share2, 
  Code2, Calculator, Star,
  TrendingUp, Skull, AlertCircle, 
  Lightbulb, 
  Flag,
  Crown} from "lucide-react";

// ─── Import ModelManager ──────────────────────────────────────────────
import { useActiveModel } from '../models/ModelManager';
import AIResponseText from '../shared/AIResponseText';   // ✅ added for markdown AI rendering

type Confidence = "high" | "medium" | "low";

type HashMatch = {
  name: string;
  confidence: Confidence;
  hashcat: string;
  john: string;
  example: string;
  description: string;
  category: "md" | "sha" | "crypt" | "windows" | "wifi" | "misc" | "jwt" | "jdbc" | "hmac" | "blockchain";
  year?: number;
  broken?: boolean;
  tags?: string[];
  variants?: { name: string; hashcat: string; john: string; note?: string }[];
  security?: 1 | 2 | 3 | 4 | 5;
  speed?: "very-fast" | "fast" | "medium" | "slow" | "very-slow";
  saltSupport?: boolean;
};

type AnalysisResult = {
  input: string;
  length: number;
  charset: string;
  entropy: number;
  matches: HashMatch[];
  entropyLevel: "low" | "medium" | "high";
  warnings: string[];
  suggestions: string[];
  estimatedTime: string;
  difficulty: "trivial" | "easy" | "medium" | "hard" | "extreme";
  crackability: number;
  hashFamily: string[];
};

type SavedHash = {
  id: string;
  hash: string;
  timestamp: number;
  matches: HashMatch[];
  notes?: string;
  cracked?: boolean;
  crackedValue?: string;
  source?: string;
  attempts?: number;
  status?: "pending" | "cracking" | "cracked" | "failed";
  starred?: boolean;
  priority?: "low" | "medium" | "high" | "critical";
};

type Rule = {
  id: string;
  name: string;
  pattern: string;
  length?: number[];
  hashcat: string;
  john: string;
  description: string;
  enabled: boolean;
  custom: boolean;
  hitCount: number;
};

type Settings = {
  defaultWordlist: string;
  defaultAttackMode: string;
  autoDetect: boolean;
  showConfidence: boolean;
  showEntropy: boolean;
  enableAI: boolean;
  aiModel: string;
  theme: "cyan" | "purple" | "green" | "amber";
  maxHistory: number;
  defaultPriority: SavedHash["priority"];
  useRules: boolean;
  defaultMask: string;
  rulesPath: string;
};

const DEFAULT_SETTINGS: Settings = {
  defaultWordlist: "rockyou.txt",
  defaultAttackMode: "0",
  autoDetect: true,
  showConfidence: true,
  showEntropy: true,
  enableAI: true,
  aiModel: "qwen2.5-coder:3b",
  theme: "cyan",
  maxHistory: 100,
  defaultPriority: "medium",
  useRules: true,
  defaultMask: "?d?d?d?d?d?d?d?d",
  rulesPath: "/usr/share/hashcat/rules/best64.rule",
};

// ──────────────────────────────────────────────────────────────────────
// HASH_DB - Complete Database
// ──────────────────────────────────────────────────────────────────────
const HASH_DB: { pattern: RegExp; length?: number[]; match: HashMatch }[] = [
  { pattern: /^[a-f0-9]{32}$/i, length: [32], match: { name: "MD5", confidence: "high", hashcat: "-m 0", john: "--format=raw-md5", example: "5f4dcc3b5aa765d61d8327deb882cf99", description: "MD5 — 128-bit cryptographic hash, cryptographically broken since 2004, still ubiquitous in legacy systems and CTFs.", category: "md", year: 1991, broken: true, tags: ["fast", "broken", "legacy"], security: 1, speed: "very-fast" } },
  { pattern: /^[a-f0-9]{32}$/i, length: [32], match: { name: "NTLM", confidence: "medium", hashcat: "-m 1000", john: "--format=nt", example: "8846f7eaee8fb117ad06bdd830b7586c", description: "Windows NTLM — MD4 over UTF-16LE encoded password. Same length as MD5, distinguished by context.", category: "windows", year: 1993, tags: ["windows", "active-directory"], security: 1, speed: "very-fast" } },
  { pattern: /^[a-f0-9]{32}$/i, length: [32], match: { name: "MD4", confidence: "low", hashcat: "-m 900", john: "--format=raw-md4", example: "8a9d093f4f3c8e9b9d6e3a4c5b6f7d8e", description: "MD4 — predecessor of MD5, broken. Rare in the wild but worth checking.", category: "md", year: 1990, broken: true, tags: ["legacy", "broken"], security: 1, speed: "very-fast" } },
  { pattern: /^\*[A-F0-9]{40}$/i, match: { name: "MySQL 4.1+", confidence: "high", hashcat: "-m 300", john: "--format=mysql-sha1", example: "*6BB4837EB74329105EE4568DDA7DC67ED2CA2AD9", description: "MySQL 4.1+ password hash — SHA-1 with leading asterisk.", category: "jdbc", year: 2002, tags: ["mysql", "database"], security: 2, speed: "fast" } },
  { pattern: /^[a-f0-9]{40}$/i, length: [40], match: { name: "SHA-1", confidence: "high", hashcat: "-m 100", john: "--format=raw-sha1", example: "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d", description: "SHA-1 — 160-bit hash, deprecated by NIST in 2011. Collision attacks demonstrated by Google in 2017.", category: "sha", year: 1995, broken: true, tags: ["deprecated", "git"], security: 2, speed: "fast" } },
  { pattern: /^[a-f0-9]{40}$/i, length: [40], match: { name: "RIPEMD-160", confidence: "low", hashcat: "-m 6000", john: "--format=ripemd-160", example: "37f332f68db77bd9d7edd4969571ad671cf9dd3b", description: "RIPEMD-160 — 160-bit European alternative to SHA-1, used in Bitcoin addresses.", category: "sha", year: 1996, tags: ["alt", "bitcoin"], security: 2, speed: "fast" } },
  { pattern: /^[a-f0-9]{56}$/i, length: [56], match: { name: "SHA-224", confidence: "high", hashcat: "-m 1300", john: "--format=raw-sha224", example: "d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f", description: "SHA-224 — truncated SHA-256, rarely used in practice.", category: "sha", year: 2001, tags: ["truncated"], security: 3, speed: "fast" } },
  { pattern: /^[a-f0-9]{64}$/i, length: [64], match: { name: "SHA-256", confidence: "high", hashcat: "-m 1400", john: "--format=raw-sha256", example: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8", description: "SHA-256 — 256-bit hash, industry standard, used in Bitcoin, TLS, JWT.", category: "sha", year: 2001, tags: ["secure", "standard", "tls", "bitcoin"], security: 3, speed: "fast" } },
  { pattern: /^[a-f0-9]{64}$/i, length: [64], match: { name: "SHA3-256", confidence: "low", hashcat: "-m 17400", john: "--format=raw-sha3-256", example: "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a", description: "SHA3-256 — Keccak-based, NIST winner 2012, distinct from SHA-256.", category: "sha", year: 2012, tags: ["modern", "nist"], security: 4, speed: "fast" } },
  { pattern: /^[a-f0-9]{64}$/i, length: [64], match: { name: "Keccak-256", confidence: "low", hashcat: "-m 17800", john: "--format=raw-keccak-256", example: "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470", description: "Keccak-256 (Ethereum) — used in Ethereum blockchain, NOT identical to SHA3-256.", category: "blockchain", year: 2015, tags: ["ethereum", "blockchain"], security: 4, speed: "fast" } },
  { pattern: /^[a-f0-9]{96}$/i, length: [96], match: { name: "SHA-384", confidence: "high", hashcat: "-m 10800", john: "--format=raw-sha384", example: "59e1748777448c69de6b800d7a33bbfb9ff1b463e44354c3553bcdb9c666fa90", description: "SHA-384 — truncated SHA-512.", category: "sha", year: 2001, tags: ["truncated"], security: 4, speed: "fast" } },
  { pattern: /^[a-f0-9]{128}$/i, length: [128], match: { name: "SHA-512", confidence: "high", hashcat: "-m 1700", john: "--format=raw-sha512", example: "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e", description: "SHA-512 — 512-bit, used in Linux /etc/shadow and high-security systems.", category: "sha", year: 2001, tags: ["secure", "linux"], security: 4, speed: "fast" } },
  { pattern: /^\$2[ayb]\$.{56}$/, match: { name: "bcrypt", confidence: "high", hashcat: "-m 3200", john: "--format=bcrypt", example: "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW", description: "bcrypt — adaptive password hashing with salt and cost factor. Slow by design (resists brute force).", category: "crypt", year: 1999, tags: ["secure", "slow", "password"], security: 5, speed: "very-slow", saltSupport: true, variants: [{ name: "bcrypt $2a$", hashcat: "-m 3200", john: "--format=bcrypt", note: "Original version" }, { name: "bcrypt $2b$", hashcat: "-m 3200", john: "--format=bcrypt", note: "Fixed NUL handling" }, { name: "bcrypt $2y$", hashcat: "-m 3200", john: "--format=bcrypt", note: "PHP crypt() output" }] } },
  { pattern: /^\$argon2id\$.+$/, match: { name: "Argon2id", confidence: "high", hashcat: "-m 13400", john: "--format=argon2id", example: "$argon2id$v=19$m=65536,t=3,p=4$...", description: "Argon2id — winner of Password Hashing Competition 2015, modern gold standard.", category: "crypt", year: 2015, tags: ["modern", "secure", "memory-hard"], security: 5, speed: "very-slow", saltSupport: true } },
  { pattern: /^\$argon2i\$.+$/, match: { name: "Argon2i", confidence: "high", hashcat: "-m 13400", john: "--format=argon2i", example: "$argon2i$v=19$m=65536,t=3,p=4$...", description: "Argon2i — side-channel resistant variant.", category: "crypt", year: 2015, tags: ["modern", "side-channel"], security: 5, speed: "very-slow", saltSupport: true } },
  { pattern: /^\$argon2d\$.+$/, match: { name: "Argon2d", confidence: "high", hashcat: "-m 13400", john: "--format=argon2d", example: "$argon2d$v=19$m=65536,t=3,p=4$...", description: "Argon2d — data-dependent, GPU-resistant.", category: "crypt", year: 2015, tags: ["modern", "data-dependent"], security: 5, speed: "very-slow", saltSupport: true } },
  { pattern: /^\$6\$.{8,16}\$.{86}$/, match: { name: "SHA-512 Crypt", confidence: "high", hashcat: "-m 1800", john: "--format=sha512crypt", example: "$6$rounds=5000$salt$hash", description: "Linux /etc/shadow SHA-512 crypt — modern default on most Linux distros.", category: "crypt", year: 2008, tags: ["linux", "shadow"], security: 4, speed: "slow", saltSupport: true } },
  { pattern: /^\$1\$.{8}\$.{22}$/, match: { name: "MD5 Crypt", confidence: "high", hashcat: "-m 500", john: "--format=md5crypt", example: "$1$salt$hash", description: "Legacy Linux MD5 crypt ($1$) — superseded by SHA-512 crypt.", category: "crypt", year: 1994, broken: true, tags: ["linux", "legacy", "broken"], security: 1, speed: "fast", saltSupport: true } },
  { pattern: /^\$5\$.{8,16}\$.{43}$/, match: { name: "SHA-256 Crypt", confidence: "high", hashcat: "-m 7400", john: "--format=sha256crypt", example: "$5$rounds=5000$salt$hash", description: "Linux SHA-256 crypt — middle ground between MD5 and SHA-512 crypt.", category: "crypt", tags: ["linux", "shadow"], security: 3, speed: "medium", saltSupport: true } },
  { pattern: /^\$y\$.{43}$/, match: { name: "yescrypt", confidence: "high", hashcat: "-m 11200", john: "--format=crypt", example: "$y$j9T$...", description: "yescrypt — modern Linux shadow hash, successor to SHA-512 crypt.", category: "crypt", tags: ["linux", "modern"], security: 4, speed: "slow", saltSupport: true } },
  { pattern: /^\$pbkdf2-sha1\$.+$/, match: { name: "PBKDF2-SHA1", confidence: "high", hashcat: "-m 12000", john: "--format=PBKDF2-HMAC-SHA1", example: "$pbkdf2-sha1$10000$salt$hash", description: "PBKDF2 with SHA-1 — common in WPA2-PSK derivation and password stores.", category: "crypt", tags: ["wpa2", "iterative"], security: 3, speed: "medium", saltSupport: true } },
  { pattern: /^\$pbkdf2-sha256\$.+$/, match: { name: "PBKDF2-SHA256", confidence: "high", hashcat: "-m 10900", john: "--format=PBKDF2-HMAC-SHA256", example: "$pbkdf2-sha256$100000$salt$hash", description: "PBKDF2 with SHA-256 — modern iterative hash for password storage.", category: "crypt", tags: ["iterative", "modern"], security: 4, speed: "medium", saltSupport: true } },
  { pattern: /^\$pbkdf2-sha512\$.+$/, match: { name: "PBKDF2-SHA512", confidence: "high", hashcat: "-m 12100", john: "--format=PBKDF2-HMAC-SHA512", example: "$pbkdf2-sha512$100000$salt$hash", description: "PBKDF2 with SHA-512 — high-iteration password derivation.", category: "crypt", tags: ["iterative", "modern"], security: 5, speed: "slow", saltSupport: true } },
  { pattern: /^\$scrypt\$.+$/, match: { name: "scrypt", confidence: "high", hashcat: "-m 8900", john: "--format=scrypt", example: "$scrypt$ln=16,r=8,p=1$...", description: "scrypt — memory-hard password hashing, predecessor to Argon2.", category: "crypt", year: 2009, tags: ["memory-hard", "secure"], security: 5, speed: "very-slow", saltSupport: true } },
  { pattern: /^\$krb5tgs\$23\$/, match: { name: "Kerberos TGS-REP", confidence: "high", hashcat: "-m 13100", john: "--format=krb5tgs", example: "$krb5tgs$23$*user$realm$spn*$hash", description: "Kerberoasting target — Service Ticket encrypted with service account NTLM hash. Crack for plaintext password.", category: "windows", year: 2014, tags: ["ad", "kerberoast", "red-team"], security: 2, speed: "medium" } },
  { pattern: /^\$krb5asrep\$23\$/, match: { name: "Kerberos AS-REP", confidence: "high", hashcat: "-m 18200", john: "--format=krb5asrep", example: "$krb5asrep$23$...$hash", description: "AS-REP Roasting — pre-auth disabled accounts, no credentials required to request.", category: "windows", year: 2014, tags: ["ad", "asreproast", "red-team"], security: 2, speed: "medium" } },
  { pattern: /^.+:.+:[a-f0-9]{32}:[a-f0-9]{32}.*$/i, match: { name: "LM Hash", confidence: "medium", hashcat: "-m 3000", john: "--format=LM", example: "Administrator:500:aad3b435b51404eeaad3b435b51404ee:8846f7eaee8fb117ad06bdd830b7586c:::", description: "Windows LM Hash — legacy, broken by design (case-insensitive, split into 7-byte chunks).", category: "windows", year: 1986, broken: true, tags: ["legacy", "windows", "broken"], security: 1, speed: "very-fast" } },
  { pattern: /^[a-f0-9]{16}$/i, length: [16], match: { name: "MySQL 3.x / LM Half", confidence: "low", hashcat: "-m 200", john: "--format=mysql", example: "79c2b46ce2594ecbcb5c81828d6f3d9e", description: "Could be MySQL 3.x (32-bit) or one half of an LM hash pair.", category: "jdbc", tags: ["mysql", "legacy"], security: 1, speed: "very-fast" } },
  { pattern: /^WPA\*[0-9]+\*[a-f0-9]+\*.*$/i, match: { name: "WPA/WPA2", confidence: "high", hashcat: "-m 2500", john: "--format=wpapsk", example: "WPA*01*mic*IV*ESSID*STA*AP*ANonce*SNonce*...", description: "WPA/WPA2 4-way handshake capture — crack with aircrack-ng or hashcat.", category: "wifi", tags: ["wifi", "wireless"], security: 3, speed: "medium" } },
  { pattern: /^[a-f0-9]{65}:[a-f0-9]{40}:[0-9]+$/i, match: { name: "WPA PMKID", confidence: "high", hashcat: "-m 16800", john: "--format=wpapsk", example: "PMKID:MAC:ESSID", description: "WPA2 PMKID — no full handshake required, crack with hashcat -m 16800.", category: "wifi", tags: ["wifi", "pmkid"], security: 3, speed: "medium" } },
  { pattern: /^[a-z0-9+\/]{43}=$/i, match: { name: "Bitcoin WIF (compressed)", confidence: "high", hashcat: "N/A", john: "N/A", example: "L1aW4aubDFB7yfras2S1mKx8m...", description: "Bitcoin Wallet Import Format — compressed key encoding.", category: "blockchain", tags: ["bitcoin", "key"] } },
  { pattern: /^[a-f0-9]{16}$/i, length: [16], match: { name: "CRC-16 / NetLM", confidence: "low", hashcat: "-m 2700", john: "--format=crc32", example: "cafebabe12345678", description: "Could be CRC-16 or LM half — context matters.", category: "misc", tags: ["crc", "checksum"], security: 1, speed: "very-fast" } },
  { pattern: /^[a-f0-9]{8}$/i, length: [8], match: { name: "CRC-32 / Short", confidence: "low", hashcat: "N/A", john: "N/A", example: "deadbeef", description: "Could be CRC-32 truncated, adler32, or short hash. Not a secure hash.", category: "misc", tags: ["crc", "checksum"], security: 1, speed: "very-fast" } },
  { pattern: /^[a-f0-9]{48}$/i, length: [48], match: { name: "Tiger-192 (partial)", confidence: "low", hashcat: "-m 7000", john: "--format=tiger", example: "0123456789abcdef0123456789abcdef0123456789abcdef", description: "Could be Tiger-192 — 192-bit hash by Eli Biham.", category: "misc", year: 1996, tags: ["tiger"], security: 2, speed: "fast" } },
  { pattern: /^[a-f0-9]{40}:[a-f0-9]{40}$/i, match: { name: "Double SHA-1", confidence: "medium", hashcat: "-m 4500", john: "--format=raw-sha1-linked", example: "hash1:hash2", description: "Two SHA-1 hashes concatenated — common in some JWT signing schemes.", category: "sha", tags: ["chained"], security: 2, speed: "fast" } },
  { pattern: /^.+:.+:[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]{32}$/i, match: { name: "NT Hashes Pwned", confidence: "high", hashcat: "-m 1000", john: "--format=nt", example: "user:RID:LM:NTLM:::", description: "NTLM hash with username and RID context.", category: "windows", tags: ["ad", "pwned"] } },
  { pattern: /^[a-z0-9\/+]{32}$/i, match: { name: "HMAC-MD5 (key=value)", confidence: "low", hashcat: "-m 50", john: "--format=hmac-md5", example: "key:value", description: "HMAC-MD5 — MD5 with secret key, used in API signatures.", category: "hmac", tags: ["api", "signature"], security: 1, speed: "very-fast" } },
  { pattern: /^[a-z0-9\/+]{40}$/i, match: { name: "HMAC-SHA1", confidence: "low", hashcat: "-m 150", john: "--format=hmac-sha1", example: "key:sha1hash", description: "HMAC-SHA1 — used in AWS signature v1, OAuth1.", category: "hmac", tags: ["api", "oauth"], security: 2, speed: "fast" } },
  { pattern: /^[a-z0-9\/+]{64}$/i, match: { name: "HMAC-SHA256", confidence: "low", hashcat: "-m 1450", john: "--format=hmac-sha256", example: "key:sha256hash", description: "HMAC-SHA256 — used in AWS signature v4, JWT HS256.", category: "hmac", tags: ["api", "jwt"], security: 3, speed: "fast" } },
  { pattern: /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_-]+$/, match: { name: "JWT", confidence: "high", hashcat: "N/A", john: "N/A", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.signature", description: "JSON Web Token — decode the header and payload, check signature algorithm (HS256 weak!).", category: "jwt", year: 2015, tags: ["web", "auth"], security: 2, speed: "fast" } },
  { pattern: /^[a-z0-9+\/]{27}=$/i, match: { name: "Base64", confidence: "high", hashcat: "N/A", john: "N/A", example: "cGFzc3dvcmQ=", description: "Base64-encoded data — decode to reveal the actual hash, not a real cryptographic hash.", category: "misc", tags: ["encoding", "not-hash"], security: 1, speed: "very-fast" } },
  { pattern: /^[A-Za-z0-9+\/]{22}==$/, match: { name: "Base64 (16 bytes)", confidence: "high", hashcat: "N/A", john: "N/A", example: "cGFzc3dvcmRwYXNzd29yZA==", description: "Base64-encoded 16-byte value.", category: "misc", tags: ["encoding"], security: 1, speed: "very-fast" } },
  { pattern: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, match: { name: "UUID/GUID", confidence: "high", hashcat: "N/A", john: "N/A", example: "550e8400-e29b-41d4-a716-446655440000", description: "UUID — identifier, not a hash. Version 4 is random; v1 is MAC+time.", category: "misc", tags: ["identifier", "not-hash"] } },
];

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "text-emerald-400 border-emerald-400/40 bg-emerald-500/10",
  medium: "text-amber-400 border-amber-400/40 bg-amber-500/10",
  low: "text-cyan-400 border-cyan-400/40 bg-cyan-500/10",
};

const CATEGORY_STYLE: Record<HashMatch["category"], { color: string; label: string; bg: string }> = {
  md: { color: "text-orange-400", label: "MD", bg: "bg-orange-500/10" },
  sha: { color: "text-blue-400", label: "SHA", bg: "bg-blue-500/10" },
  crypt: { color: "text-emerald-400", label: "CRYPT", bg: "bg-emerald-500/10" },
  windows: { color: "text-rose-400", label: "WIN", bg: "bg-rose-500/10" },
  wifi: { color: "text-purple-400", label: "WIFI", bg: "bg-purple-500/10" },
  misc: { color: "text-slate-400", label: "MISC", bg: "bg-slate-500/10" },
  jwt: { color: "text-pink-400", label: "JWT", bg: "bg-pink-500/10" },
  jdbc: { color: "text-yellow-400", label: "DB", bg: "bg-yellow-500/10" },
  hmac: { color: "text-cyan-400", label: "HMAC", bg: "bg-cyan-500/10" },
  blockchain: { color: "text-amber-400", label: "CHAIN", bg: "bg-amber-500/10" },
};

const WORDLISTS = [
  { name: "rockyou.txt", desc: "14M passwords, most common", size: "134MB" },
  { name: "fasttrack.txt", desc: "Pre-computed hash lookup", size: "4MB" },
  { name: "darkweb2017-top10000.txt", desc: "Top 10k from darkweb leaks", size: "100KB" },
  { name: "10-million-password-list-top-1000000.txt", desc: "Top 1M passwords", size: "7.8MB" },
  { name: "best1050.txt", desc: "Best 1050", size: "8KB" },
  { name: "xato-net-10-million-passwords-1000000.txt", desc: "Xato 1M", size: "7.5MB" },
  { name: "rockyou-75.txt", desc: "Rockyou 75% reduced", size: "100MB" },
  { name: "/usr/share/wordlists/rockyou.txt", desc: "Kali default path", size: "134MB" },
];

const ATTACK_MODES = [
  { id: "0", name: "Straight", desc: "Wordlist only", icon: "📋" },
  { id: "1", name: "Combination", desc: "Combine words", icon: "🔗" },
  { id: "3", name: "Brute-force", desc: "All character sets", icon: "⚡" },
  { id: "4", name: "Permutation", desc: "Permute words", icon: "🔄" },
  { id: "6", name: "Hybrid Word+Mask", desc: "Words + chars", icon: "🔀" },
  { id: "7", name: "Hybrid Mask+Word", desc: "Chars + words", icon: "🔀" },
  { id: "8", name: "Prince", desc: "PRINCE attack", icon: "👑" },
];

const MASK_PRESETS = [
  { name: "8-digit PIN", mask: "?d?d?d?d?d?d?d?d", keyspace: "10^8" },
  { name: "6-char alnum", mask: "?u?l?l?l?d?d", keyspace: "26×26³×10²" },
  { name: "Date YYYYMMDD", mask: "?d?d?d?d?d?d?d?d", keyspace: "10^8" },
  { name: "Word+4 digits", mask: "?u?l?l?l?l?d?d?d?d", keyspace: "26×26⁴×10⁴" },
  { name: "Complex 8", mask: "?a?a?a?a?a?a?a?a", keyspace: "95^8" },
];

const TABS = [
  { id: "identify", icon: Hash, label: "Identify" },
  { id: "batch", icon: Layers, label: "Batch" },
  { id: "compare", icon: Activity, label: "Compare" },
  { id: "rules", icon: Code2, label: "Rules" },
  { id: "stats", icon: BarChart3, label: "Stats" },
  { id: "history", icon: History, label: "History" },
] as const;

type TabId = typeof TABS[number]["id"] | "settings";

// ──────────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    const showSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };
    const fallback = () => {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        showSuccess();
      } catch {
        console.debug("Copy fallback failed");
      }
    };
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        showSuccess();
      } catch {
        fallback();
      }
    } else {
      fallback();
    }
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      className="text-[10px] text-white/40 hover:text-cyan-400 transition flex items-center gap-1"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied ? <><Check size={10} />ok</> : <><Copy size={10} />copy</>}
    </button>
  );
}

function calcEntropy(s: string): number {
  if (!s) return 0;
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  let e = 0;
  const len = s.length;
  for (const c in freq) {
    const p = freq[c] / len;
    e -= p * Math.log2(p);
  }
  return e * len;
}

function analyzeHash(input: string, customRules: Rule[] = [], _settings: Settings = DEFAULT_SETTINGS): AnalysisResult {
  const s = input.trim();
  const length = s.length;
  const entropy = calcEntropy(s);

  let charset = "mixed";
  if (/^[0-9]+$/.test(s)) charset = "numeric";
  else if (/^[a-f0-9]+$/i.test(s)) charset = "hex";
  else if (/^[A-Za-z0-9+/=_-]+$/.test(s) && s.length % 4 === 0) charset = "base64";
  else if (/^[A-Za-z]+$/.test(s)) charset = "alpha";
  else if (/^[A-Za-z0-9]+$/.test(s)) charset = "alphanumeric";

  let entropyLevel: "low" | "medium" | "high" = "low";
  if (entropy > 200) entropyLevel = "high";
  else if (entropy > 50) entropyLevel = "medium";

  const seen = new Set<string>();
  const matches: HashMatch[] = [];

  for (const r of customRules) {
    if (!r.enabled) continue;
    if (r.length && !r.length.includes(length)) continue;
    try {
      const re = new RegExp(r.pattern);
      if (re.test(s) && !seen.has(r.name)) {
        seen.add(r.name);
        matches.push({
          name: r.name,
          confidence: "medium",
          hashcat: r.hashcat,
          john: r.john,
          example: "custom",
          description: r.description,
          category: "misc",
          tags: ["custom"],
        });
      }
    } catch {}
  }

  for (const e of HASH_DB) {
    if (e.length && !e.length.includes(length)) continue;
    if (e.pattern.test(s) && !seen.has(e.match.name)) {
      seen.add(e.match.name);
      matches.push(e.match);
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  matches.sort((a, b) => order[a.confidence] - order[b.confidence]);

  const warnings: string[] = [];
  const suggestions: string[] = [];
  if (length < 8) {
    warnings.push("Very short — unlikely to be a secure hash");
    suggestions.push("Try looking for context: could be a partial hash, ID, or checksum");
  }
  if (charset === "alpha" && length > 20) {
    warnings.push("Alphabetical only — possibly encoded");
    suggestions.push("Try ROT13, Caesar cipher, or vowel removal decoding");
  }
  if (entropy < 50 && length > 16) {
    warnings.push("Low entropy — may be padded or weak");
  }
  if (/^(.)\1+$/.test(s)) {
    warnings.push("Repeating character pattern — not a real hash");
    suggestions.push("Verify the hash was copied correctly");
  }
  if (matches.length > 3) {
    suggestions.push("Multiple matches — use context (source system) to disambiguate");
  }
  if (matches.some(m => m.broken)) {
    suggestions.push("Hash algorithm is broken — should be replaced in production");
  }
  if (matches.some(m => m.category === "jwt")) {
    suggestions.push("Decode JWT at jwt.io and check for 'alg: none' or weak HS256 secret");
  }

  let difficulty: AnalysisResult["difficulty"] = "extreme";
  let estimatedTime = "Years";
  if (matches.length > 0) {
    const top = matches[0];
    const sec = top.security || 3;
    const spd = top.speed || "fast";
    if (sec <= 1) { difficulty = "trivial"; estimatedTime = "Seconds"; }
    else if (sec === 2 && (spd === "very-fast" || spd === "fast")) { difficulty = "easy"; estimatedTime = "Minutes-Hours"; }
    else if (sec === 2) { difficulty = "medium"; estimatedTime = "Hours-Days"; }
    else if (sec === 3 && spd === "fast") { difficulty = "medium"; estimatedTime = "Hours-Days"; }
    else if (sec === 3) { difficulty = "hard"; estimatedTime = "Days-Weeks"; }
    else if (sec === 4 && spd === "slow") { difficulty = "hard"; estimatedTime = "Weeks-Months"; }
    else if (sec === 4) { difficulty = "hard"; estimatedTime = "Months"; }
    else { difficulty = "extreme"; estimatedTime = "Years-Centuries"; }
  }

  let crackability = 50;
  if (matches.length > 0) {
    const top = matches[0];
    const sec = top.security || 3;
    crackability = Math.max(5, 100 - (sec - 1) * 22);
    if (top.broken) crackability = Math.min(crackability, 95);
    if (top.speed === "very-slow") crackability = Math.max(5, crackability - 30);
    if (top.saltSupport) crackability = Math.max(5, crackability - 40);
  }

  const families = Array.from(new Set(matches.map(m => m.category)));

  return { input: s, length, charset, entropy, matches, entropyLevel, warnings, suggestions, estimatedTime, difficulty, crackability, hashFamily: families };
}

function generateCommand(tool: "hashcat" | "john", m: HashMatch, hash: string, wordlist: string, attackMode: string, rules: boolean, rulesPath: string, mask?: string): string {
  const hashEscaped = hash.includes("$") || hash.includes(" ") ? `"${hash}"` : hash;
  if (tool === "hashcat") {
    const attackFlag = `-a ${attackMode}`;
    const rulesFlag = rules && attackMode === "0" ? `-r ${rulesPath}` : "";
    const maskFlag = attackMode === "3" && mask ? mask : "";
    return `hashcat ${m.hashcat} ${attackFlag} ${rulesFlag} ${maskFlag} ${hashEscaped} /usr/share/wordlists/${wordlist}`.replace(/\s+/g, " ").trim();
  }
  return `john ${m.john} --wordlist=/usr/share/wordlists/${wordlist} ${hashEscaped}`.replace(/\s+/g, " ").trim();
}

function SecurityBar({ level }: { level?: number }) {
  if (!level) return null;
  return (
    <div className="flex items-center gap-0.5" title={`Security: ${level}/5`}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className={`w-1 h-3 rounded-sm ${i <= level ? (level <= 2 ? "bg-rose-500" : level <= 3 ? "bg-amber-500" : "bg-emerald-500") : "bg-white/10"}`} />
      ))}
    </div>
  );
}

function CrackabilityRing({ value }: { value: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value > 70 ? "text-rose-400" : value > 40 ? "text-amber-400" : value > 20 ? "text-cyan-400" : "text-emerald-400";
  return (
    <div className="relative w-16 h-16 inline-flex">
      <svg className="w-16 h-16 -rotate-90">
        <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" fill="none" className="text-white/10" />
        <circle cx="32" cy="32" r={radius} stroke="currentColor" strokeWidth="4" fill="none" className={color} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────────
export default function HashIdentifier() {
  // ─── ModelManager Integration ──────────────────────────────────────
  const activeModel = useActiveModel();
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  
  // ─── State ────────────────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [aiHint, setAiHint] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [wordlist, setWordlist] = useState(DEFAULT_SETTINGS.defaultWordlist);
  const [attackMode, setAttackMode] = useState(DEFAULT_SETTINGS.defaultAttackMode);
  const [useRules, setUseRules] = useState(DEFAULT_SETTINGS.useRules);
  const [mask, setMask] = useState(DEFAULT_SETTINGS.defaultMask);
  const [tab, setTab] = useState<TabId>("identify");
  const [showTips, setShowTips] = useState(true);
  const [masked, setMasked] = useState(false);
  const [saved, setSaved] = useState<SavedHash[]>(() => {
    try { return JSON.parse(localStorage.getItem("gh_saved") || "[]"); } catch { return []; }
  });
  const [notes, setNotes] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [filterConf, setFilterConf] = useState("All");
  const [filterCracked, setFilterCracked] = useState<"all" | "cracked" | "uncracked">("all");
  const [filterPriority, setFilterPriority] = useState<"all" | SavedHash["priority"]>("all");
  const [search, setSearch] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [batchResults, setBatchResults] = useState<AnalysisResult[]>([]);
  const [compareInput, setCompareInput] = useState({ a: "", b: "" });
  const [compareResult, setCompareResult] = useState<{ same: boolean; sim: number; hamming: number } | null>(null);
  const [autoDetect, setAutoDetect] = useState(DEFAULT_SETTINGS.autoDetect);
  const [rules, setRules] = useState<Rule[]>(() => {
    try { return JSON.parse(localStorage.getItem("gh_rules") || "[]"); } catch { return []; }
  });
  const [settings, setSettings] = useState<Settings>(() => {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("gh_settings") || "{}") }; } catch { return DEFAULT_SETTINGS; }
  });
  const [shareLink, setShareLink] = useState("");
  const [newRule, setNewRule] = useState({ name: "", pattern: "", length: "", hashcat: "", john: "", description: "" });
  const [storageError, setStorageError] = useState<string | null>(null);
  const [editingCrackedId, setEditingCrackedId] = useState<string | null>(null);
  const [crackedInputValue, setCrackedInputValue] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);
  const rulesRef = useRef(rules);
  const isMounted = useRef(true);

  // ─── Check Ollama Availability ──────────────────────────────────────
  useEffect(() => {
    async function checkOllama() {
      try {
        const response = await window.obscurum?.ollamaRequest?.('/api/version', 'GET');
        setOllamaAvailable(response?.status === 200);
      } catch {
        setOllamaAvailable(false);
      }
    }
    checkOllama();
  }, []);

  // ─── Persistence ──────────────────────────────────────────────────────
  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);

  useEffect(() => { rulesRef.current = rules; }, [rules]);

  useEffect(() => {
    try {
      localStorage.setItem("gh_saved", JSON.stringify(saved.slice(0, settings.maxHistory)));
      setStorageError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "QuotaExceededError") {
        setStorageError("Storage quota exceeded — some old hashes may not persist");
      } else {
        console.error("gh_saved: save failed", err);
      }
    }
  }, [saved, settings.maxHistory]);

  useEffect(() => {
    try {
      localStorage.setItem("gh_rules", JSON.stringify(rules));
    } catch (err) {
      console.error("gh_rules: save failed", err);
    }
  }, [rules]);

  useEffect(() => {
    try {
      localStorage.setItem("gh_settings", JSON.stringify(settings));
    } catch (err) {
      console.error("gh_settings: save failed", err);
    }
  }, [settings]);

  // ─── Sync settings ────────────────────────────────────────────────────
  useEffect(() => {
    setWordlist(settings.defaultWordlist);
    setAttackMode(settings.defaultAttackMode);
    setMask(settings.defaultMask);
    setUseRules(settings.useRules);
    setAutoDetect(settings.autoDetect);
  }, [settings.defaultWordlist, settings.defaultAttackMode, settings.defaultMask, settings.useRules, settings.autoDetect]);

  // ─── Shared hash receiver ──────────────────────────────────────────────
  useEffect(() => {
    const fragment = window.location.hash.replace(/^#/, "");
    if (!fragment) return;
    try {
      const decoded = atob(decodeURIComponent(fragment));
      if (decoded && decoded.length > 0 && decoded.length < 4096) {
        setInput(decoded);
        setTimeout(() => identifyWithInput(decoded), 100);
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch (err) {
      console.error("Failed to decode shared hash:", err);
    }
  }, []);

  // ─── Identify Functions ────────────────────────────────────────────────
  const identifyWithInput = useCallback((overrideInput: string) => {
    if (!overrideInput.trim()) return;
    const r = analyzeHash(overrideInput, rulesRef.current, settings);
    setResult(r);
    setAiHint("");
    if (r.matches.length > 0 && !saved.find(s => s.hash === r.input)) {
      setSaved(prev => [{
        id: crypto.randomUUID(),
        hash: r.input,
        timestamp: Date.now(),
        matches: r.matches,
        cracked: false,
        status: "pending",
        priority: settings.defaultPriority,
        notes: "",
      }, ...prev]);
    }
  }, [saved, settings.defaultPriority]);

  const identify = useCallback(() => {
    if (!input.trim()) return;
    identifyWithInput(input);
  }, [input, identifyWithInput]);

  // ─── Auto-detect ────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoDetect && input.trim().length > 8) {
      const t = setTimeout(() => {
        const r = analyzeHash(input, rulesRef.current, settings);
        setResult(r);
        setAiHint("");
      }, 400);
      return () => clearTimeout(t);
    }
  }, [input, autoDetect, settings]);

  // ─── Reset ──────────────────────────────────────────────────────────────
  const reset = () => { setInput(""); setResult(null); setAiHint(""); setNotes(""); };

  // ─── AI Analysis using ModelManager's active model ────────────────────
  const askAI = async () => {
    if (!result) return;
    
    const model = activeModel || settings.aiModel;
    
    setAiLoading(true);
    setAiHint("");
    try {
      console.log(`🧠 Using model "${model}" for hash analysis...`);
      
      const { status, data } = await window.obscurum?.ollamaRequest?.('/api/chat', 'POST', {
        model: model,
        stream: false,
        messages: [
          { 
            role: "system", 
            content: `You are a hash analysis expert. Be concise and technical. Max 3 sentences. Focus on practical attack vectors. 
            Respond with the most actionable crack strategy. Include hashcat/john command variations if applicable.
            ${result.matches.length > 0 ? `The hash appears to be ${result.matches[0].name}.` : 'No specific match found in local database.'}`
          },
          { 
            role: "user", 
            content: `Hash: "${result.input.slice(0, 100)}" (length ${result.length}, charset: ${result.charset}, entropy: ${result.entropy.toFixed(2)}). 
            Local matches: ${result.matches.map(m => `${m.name}(${m.confidence})`).join(", ") || "none"}.
            Recommend optimal cracking approach and wordlist strategy.` 
          },
        ],
      }) ?? { status: 200, data: null };
      
      if (status >= 400) throw new Error(`HTTP ${status}`);
      const payload = data as { message?: { content?: string } } | null;
      setAiHint(payload?.message?.content || "No response.");
    } catch (e) {
      const err = e as Error;
      let errorMsg = `Error: ${err.message}`;
      
      if (err.message.includes('ECONNREFUSED') || err.message.includes('Failed to fetch')) {
        errorMsg = `⚠️ Ollama is not running at localhost:11434. 
        
Please make sure Ollama is running:
\`\`\`bash
ollama serve
curl http://127.0.0.1:11434/api/version
\`\`\`
Then try again.`;
      } else if (err.message.includes('model') && err.message.includes('not found')) {
        errorMsg = `⚠️ Model "${model}" is not installed.
        
Pull the model first:
\`\`\`bash
ollama pull ${model}
\`\`\`
Or switch to a different model in the Model Manager.`;
      } else {
        errorMsg = `⚠️ Error communicating with Ollama. Try using a different model or restarting Ollama.
        
Current model: ${model}
Error: ${err.message}`;
      }
      
      setAiHint(errorMsg);
    } finally {
      setAiLoading(false);
    }
  };

  // ─── Save Notes ─────────────────────────────────────────────────────────
  const saveNotesToHash = useCallback((hashKey: string, noteText: string) => {
    setSaved(prev => {
      const existing = prev.find(s => s.hash === hashKey);
      if (existing) {
        return prev.map(s => s.hash === hashKey ? { ...s, notes: noteText } : s);
      }
      return [{
        id: crypto.randomUUID(),
        hash: hashKey,
        timestamp: Date.now(),
        matches: result?.matches || [],
        cracked: false,
        status: "pending",
        priority: settings.defaultPriority,
        notes: noteText,
      }, ...prev];
    });
  }, [result, settings.defaultPriority]);

  // ─── Batch ──────────────────────────────────────────────────────────────
  const processBatch = () => {
    const lines = batchInput.split(/\n+/).map(l => l.trim()).filter(l => l);
    setBatchResults(lines.map(h => analyzeHash(h, rules, settings)));
  };

  const saveAllToHistory = () => {
    const toAdd = batchResults
      .filter(r => r.matches.length > 0 && !saved.find(s => s.hash === r.input))
      .map(r => ({
        id: crypto.randomUUID(),
        hash: r.input,
        timestamp: Date.now(),
        matches: r.matches,
        status: "pending" as const,
        priority: settings.defaultPriority,
        cracked: false,
        notes: "",
      }));
    if (toAdd.length === 0) {
      alert("No new hashes to save (all are duplicates or have no matches).");
      return;
    }
    setSaved(prev => [...toAdd, ...prev]);
    alert(`Saved ${toAdd.length} hashes to history`);
  };

  // ─── Compare ─────────────────────────────────────────────────────────────
  const compareHashes = () => {
    if (!compareInput.a || !compareInput.b) return;
    const a = compareInput.a, b = compareInput.b;
    const minLen = Math.min(a.length, b.length);
    const sameChars = a.split("").filter((c, i) => c === b[i]).length;
    const sim = (sameChars / Math.max(a.length, b.length)) * 100;
    setCompareResult({ same: a === b, sim, hamming: minLen - sameChars });
  };

  // ─── Share ──────────────────────────────────────────────────────────────
  const shareHash = () => {
    if (!result) return;
    const url = `${window.location.origin}${window.location.pathname}#${btoa(result.input)}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => { setShareLink(url); setTimeout(() => setShareLink(""), 3000); },
        () => { copyViaFallback(url); }
      );
    } else {
      copyViaFallback(url);
    }
  };

  const copyViaFallback = (text: string) => {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setShareLink(text);
      setTimeout(() => setShareLink(""), 3000);
    } catch {
      console.debug("Share copy fallback failed");
    }
  };

  // ─── Rules ──────────────────────────────────────────────────────────────
  const addRule = () => {
    if (!newRule.name || !newRule.pattern) return;
    try {
      new RegExp(newRule.pattern);
      const lens = newRule.length ? newRule.length.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : undefined;
      if (newRule.length && lens && lens.length === 0) {
        alert("Lengths are invalid (not numbers)");
        return;
      }
      setRules(prev => [...prev, {
        id: crypto.randomUUID(),
        name: newRule.name,
        pattern: newRule.pattern,
        length: lens,
        hashcat: newRule.hashcat || "-m 9999",
        john: newRule.john || "--format=custom",
        description: newRule.description || "User-defined pattern",
        enabled: true,
        custom: true,
        hitCount: 0,
      }]);
      setNewRule({ name: "", pattern: "", length: "", hashcat: "", john: "", description: "" });
    } catch (e) {
      alert("Invalid regex pattern");
    }
  };

  // ─── Clear All Data ────────────────────────────────────────────────────
  const clearAllData = () => {
    if (!confirm("Clear all hash identifier data? Saved hashes, custom rules, and settings will be removed (other modules' data is untouched).")) return;
    localStorage.removeItem("gh_saved");
    localStorage.removeItem("gh_rules");
    localStorage.removeItem("gh_settings");
    setSaved([]);
    setRules([]);
    setSettings(DEFAULT_SETTINGS);
  };

  // ─── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = saved.length;
    const cracked = saved.filter(s => s.cracked).length;
    const pending = saved.filter(s => s.status === "pending").length;
    const starred = saved.filter(s => s.starred).length;
    const successRate = total > 0 ? (cracked / total) * 100 : 0;
    const categoryHashes: Record<string, Set<string>> = {};
    saved.forEach(s => {
      const cats = new Set(s.matches.map(m => m.category));
      cats.forEach(c => {
        if (!categoryHashes[c]) categoryHashes[c] = new Set();
        categoryHashes[c].add(s.hash);
      });
    });
    const categoryCount: Record<string, number> = {};
    Object.entries(categoryHashes).forEach(([c, hashes]) => {
      categoryCount[c] = hashes.size;
    });
    return { total, cracked, pending, starred, successRate, categoryCount };
  }, [saved]);

  const filtered = useMemo(() => {
    return saved
      .filter(s => filterConf === "All" || s.matches.some(m => m.confidence === filterConf))
      .filter(s => filterCracked === "all" || (filterCracked === "cracked" ? s.cracked : !s.cracked))
      .filter(s => filterPriority === "all" || s.priority === filterPriority)
      .filter(s => !search || s.hash.toLowerCase().includes(search.toLowerCase()) || (s.notes || "").toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        if (a.starred && !b.starred) return -1;
        if (!a.starred && b.starred) return 1;
        const pOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const pDiff = (pOrder[a.priority || "medium"] - pOrder[b.priority || "medium"]);
        if (pDiff !== 0) return pDiff;
        return b.timestamp - a.timestamp;
      });
  }, [saved, filterConf, filterCracked, filterPriority, search]);

  const EXAMPLES = [
    { label: "MD5", value: "5f4dcc3b5aa765d61d8327deb882cf99" },
    { label: "SHA-1", value: "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d" },
    { label: "SHA-256", value: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8" },
    { label: "bcrypt", value: "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW" },
    { label: "NTLM", value: "8846f7eaee8fb117ad06bdd830b7586c" },
    { label: "Argon2", value: "$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$..." },
    { label: "B64", value: "cGFzc3dvcmQ=" },
    { label: "JWT", value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.abc123" },
    { label: "SHA3", value: "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a" },
    { label: "Keccak", value: "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470" },
  ];

  // ──────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-cyan-500/20" style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.18), rgba(34,211,238,0.04))' }}>
            <Hash size={16} className="text-cyan-400" />
          </div>
          <div>
            <span className="text-white font-bold text-base">Cipher</span>
            <div className="text-white/40 text-xs flex items-center gap-2">
              Identify, analyze, and plan hash cracking operations
              {activeModel && (
                <span className="text-[10px] text-cyan-400/60 flex items-center gap-1">
                  <Cpu size={10} /> {activeModel}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTips(!showTips)} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-3 py-1.5 rounded-full border border-white/10 hover:border-white/20">
            <BookOpen size={12} /> {showTips ? 'Hide Tips' : 'Show Tips'}
          </button>
          <button onClick={() => setTab("settings")} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${tab === "settings" ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' : 'border-white/10 text-white/50 hover:text-white/80 hover:border-white/20'}`}>
            <Settings size={12} /> Settings
          </button>
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${ollamaAvailable === true ? 'border-emerald-500/30 text-emerald-400/70' : 'border-red-500/30 text-red-400/70'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${ollamaAvailable === true ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            {ollamaAvailable === true ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="px-8 py-6 max-w-5xl mx-auto">

        {/* Storage Error */}
        {storageError && (
          <div className="mb-4 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center gap-2 text-xs text-amber-400">
            <AlertTriangle size={12} /> {storageError}
            <button onClick={() => setStorageError(null)} className="ml-auto text-white/30 hover:text-white/60 transition-colors">✕</button>
          </div>
        )}

        {/* Quick Tips (Collapsible) */}
        {showTips && (
          <div className="mb-4 p-4 rounded-2xl border border-cyan-500/10 bg-cyan-500/5">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb size={14} className="text-cyan-400" />
              <span className="text-cyan-400 text-xs font-semibold tracking-wider">Quick identification rules</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/60">
              <div>• <code className="text-cyan-400">32 hex</code> = MD5 / NTLM / MySQL 3.x</div>
              <div>• <code className="text-cyan-400">40 hex</code> = SHA-1 / MySQL 4.1+ / RIPEMD-160</div>
              <div>• <code className="text-cyan-400">64 hex</code> = SHA-256 / SHA3-256 / Keccak</div>
              <div>• <code className="text-cyan-400">128 hex</code> = SHA-512 / Whirlpool</div>
              <div>• <code className="text-cyan-400">$2a$ / $2b$</code> = bcrypt</div>
              <div>• <code className="text-cyan-400">$argon2</code> = Argon2 (modern)</div>
              <div>• <code className="text-cyan-400">$krb5tgs$</code> = Kerberoast target</div>
              <div>• <code className="text-cyan-400">$6$</code> = Linux SHA-512 shadow</div>
              <div>• <code className="text-cyan-400">$1$</code> = Legacy Linux MD5</div>
              <div>• <code className="text-cyan-400">eyJ..</code> = JWT (decode it!)</div>
              <div>• <code className="text-cyan-400">$pbkdf2$</code> = PBKDF2</div>
              <div>• <code className="text-cyan-400">$scrypt$</code> = scrypt</div>
            </div>
          </div>
        )}

        {/* Stats Bar */}
        {saved.length > 0 && (
          <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-2 text-center text-xs">
            {[
              { l: "Total", v: stats.total, c: "text-white" },
              { l: "Cracked", v: stats.cracked, c: "text-emerald-400" },
              { l: "Pending", v: stats.pending, c: "text-amber-400" },
              { l: "Starred", v: stats.starred, c: "text-yellow-400" },
              { l: "Success", v: `${stats.successRate.toFixed(0)}%`, c: "text-cyan-400" },
              { l: "Rules", v: rules.length, c: "text-purple-400" },
            ].map(s => (
              <div key={s.l} className="bg-white/5 border border-white/5 rounded-xl p-2">
                <div className="text-white/40 text-[10px] uppercase">{s.l}</div>
                <div className={`font-bold ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-6 flex-wrap">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-colors ${
                tab === t.id ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10' : 'border-white/10 text-white/40 hover:text-white/80 hover:border-white/20'
              }`}>
              <t.icon size={12} /> {t.label}
              {t.id === "history" && saved.length > 0 && <span className="text-[10px] text-white/30">({saved.length})</span>}
            </button>
          ))}
        </div>

        {/* ─── IDENTIFY TAB ────────────────────────────────────────────────── */}
        {tab === "identify" && (
          <>
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5 mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-white/40 text-xs">Paste hash</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-xs text-white/40 cursor-pointer">
                    <input type="checkbox" checked={autoDetect} onChange={e => setAutoDetect(e.target.checked)} className="w-3 h-3 rounded border-white/20 bg-transparent" />
                    Auto
                  </label>
                  <button onClick={() => setMasked(!masked)} className="text-white/40 hover:text-cyan-400 transition-colors">
                    {masked ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  {result && <button onClick={shareHash} className="text-white/40 hover:text-cyan-400 transition-colors"><Share2 size={13} /></button>}
                </div>
              </div>
              <textarea value={input} onChange={e => setInput(e.target.value)} placeholder="Paste hash here — MD5, SHA, NTLM, bcrypt, Argon2, Kerberos, JWT..." rows={3}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-emerald-400 text-sm focus:outline-none focus:border-cyan-500/30 placeholder-white/20 resize-none" />
              {shareLink && <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1"><Check size={11} /> Link copied to clipboard</div>}
              <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-white/40 text-xs">Examples:</span>
                  {EXAMPLES.map(e => (
                    <button key={e.label} onClick={() => { setInput(e.value); setResult(null); setAiHint(""); }} className="text-xs text-cyan-500 hover:text-cyan-300 transition-colors">[{e.label}]</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={reset} className="flex items-center gap-1 text-xs text-white/40 hover:text-red-400 transition-colors"><RotateCcw size={11} /> Clear</button>
                  <button onClick={identify} disabled={!input.trim()} className="px-4 py-1.5 text-xs font-bold rounded-xl bg-cyan-500 text-black hover:opacity-90 disabled:opacity-40 flex items-center gap-1 transition-all"><Hash size={12} /> Identify</button>
                </div>
              </div>
            </div>

            {result && (
              <div className="space-y-4">
                {/* Stats grid */}
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                  {[
                    { l: "Length", v: result.length, c: "text-cyan-400" },
                    { l: "Charset", v: result.charset, c: "text-blue-400" },
                    { l: "Matches", v: result.matches.length, c: result.matches.length ? "text-emerald-400" : "text-red-400" },
                    { l: "Entropy", v: result.entropy.toFixed(1), c: "text-purple-400" },
                    { l: "Time", v: result.estimatedTime, c: "text-amber-400" },
                    { l: "Level", v: result.entropyLevel, c: "text-amber-400" },
                  ].map(s => (
                    <div key={s.l} className="bg-white/5 border border-white/5 rounded-xl p-2 text-center">
                      <div className="text-white/40 text-[10px] uppercase">{s.l}</div>
                      <div className={`text-sm ${s.c}`}>{s.v}</div>
                    </div>
                  ))}
                </div>

                {/* Difficulty & Crackability */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3 flex items-center gap-3">
                    <CrackabilityRing value={result.crackability} />
                    <div>
                      <div className="text-xs text-white/40">Crackability</div>
                      <div className="text-sm font-bold text-cyan-400">{result.crackability}/100</div>
                      <div className="text-[10px] text-white/30">Higher = easier</div>
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                    <div className="text-xs text-white/40 mb-1">Difficulty</div>
                    <div className={`text-lg font-bold ${
                      result.difficulty === "trivial" ? "text-red-400" :
                      result.difficulty === "easy" ? "text-orange-400" :
                      result.difficulty === "medium" ? "text-amber-400" :
                      result.difficulty === "hard" ? "text-cyan-400" : "text-emerald-400"
                    }`}>{result.difficulty.toUpperCase()}</div>
                    <div className="text-[10px] text-white/30">Est: {result.estimatedTime}</div>
                  </div>
                  <div className="bg-white/5 border border-white/5 rounded-xl p-3">
                    <div className="text-xs text-white/40 mb-1">Families</div>
                    <div className="flex flex-wrap gap-1">
                      {result.hashFamily.length > 0 ? result.hashFamily.map(f => (
                        <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_STYLE[f as HashMatch["category"]]?.bg || "bg-white/5"} ${CATEGORY_STYLE[f as HashMatch["category"]]?.color || "text-white/40"}`}>
                          {CATEGORY_STYLE[f as HashMatch["category"]]?.label || f}
                        </span>
                      )) : <span className="text-red-400 text-xs">none</span>}
                    </div>
                  </div>
                </div>

                {/* Warnings & Suggestions */}
                {result.warnings.length > 0 && (
                  <div className="space-y-1">
                    {result.warnings.map((w, i) => (
                      <div key={i} className="p-2 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center gap-2 text-xs text-amber-400">
                        <AlertTriangle size={12} /> {w}
                      </div>
                    ))}
                  </div>
                )}

                {result.suggestions.length > 0 && (
                  <div className="space-y-1">
                    {result.suggestions.map((s, i) => (
                      <div key={i} className="p-2 bg-cyan-500/5 border border-cyan-500/20 rounded-xl flex items-center gap-2 text-xs text-cyan-400">
                        <Lightbulb size={12} /> {s}
                      </div>
                    ))}
                  </div>
                )}

                {result.matches.length === 0 && (
                  <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center gap-3">
                    <AlertCircle size={16} className="text-amber-400" />
                    <div>
                      <div className="text-amber-400 text-sm">No local pattern match</div>
                      <div className="text-white/40 text-xs">Try AI analysis or add a custom rule</div>
                    </div>
                  </div>
                )}

                {/* Match cards */}
                {result.matches.map((m, i) => (
                  <div key={i} className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-all">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 flex-wrap">
                      <span className={`text-[10px] ${CATEGORY_STYLE[m.category].color} ${CATEGORY_STYLE[m.category].bg} px-1.5 py-0.5 rounded font-bold`}>{CATEGORY_STYLE[m.category].label}</span>
                      <span className="text-white font-semibold">{m.name}</span>
                      {m.year && <span className="text-[10px] text-white/40">({m.year})</span>}
                      {m.broken && <span className="text-[10px] text-red-400 flex items-center gap-1"><Skull size={9} />broken</span>}
                      {m.saltSupport && <span className="text-[10px] text-emerald-400 flex items-center gap-1"><Key size={9} />salted</span>}
                      <SecurityBar level={m.security} />
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${CONFIDENCE_STYLE[m.confidence]}`}>{m.confidence}</span>
                      {m.speed && <span className="text-[10px] text-white/40">~{m.speed}</span>}
                      {i === 0 && <span className="text-xs text-cyan-400 ml-auto flex items-center gap-1"><Crown size={10} />best</span>}
                    </div>

                    <div className="p-4 space-y-3">
                      <p className="text-white/60 text-xs leading-relaxed">{m.description}</p>
                      {m.tags && (
                        <div className="flex flex-wrap gap-1">
                          {m.tags.map(t => <span key={t} className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">#{t}</span>)}
                        </div>
                      )}
                      <div className="bg-black/30 border border-white/5 rounded-xl p-2">
                        <div className="text-white/40 text-[10px] uppercase mb-1">Example</div>
                        <code className="text-emerald-400 text-xs break-all">{m.example}</code>
                      </div>
                      {m.variants && m.variants.length > 0 && (
                        <div className="bg-black/30 border border-white/5 rounded-xl p-2">
                          <div className="text-white/40 text-[10px] uppercase mb-1">Variants</div>
                          <div className="space-y-1">
                            {m.variants.map((v, vi) => (
                              <div key={vi} className="text-xs text-white/60 flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2">{v.name}{v.note && <span className="text-white/40 text-[10px]">— {v.note}</span>}</span>
                                <code className="text-cyan-400 text-[10px]">{v.hashcat}</code>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="text-white/40 text-[10px] uppercase">Crack commands</div>
                        {m.hashcat !== "N/A" && (
                          <div className="bg-black/30 border border-white/5 rounded-xl p-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-cyan-400 text-[10px] font-bold">hashcat</span>
                              <CopyBtn text={generateCommand("hashcat", m, result.input, wordlist, attackMode, useRules, settings.rulesPath, mask)} />
                            </div>
                            <code className="text-white/80 text-xs break-all block">{generateCommand("hashcat", m, result.input, wordlist, attackMode, useRules, settings.rulesPath, mask)}</code>
                          </div>
                        )}
                        {m.john !== "N/A" && (
                          <div className="bg-black/30 border border-white/5 rounded-xl p-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-amber-400 text-[10px] font-bold">john</span>
                              <CopyBtn text={generateCommand("john", m, result.input, wordlist, attackMode, useRules, settings.rulesPath, mask)} />
                            </div>
                            <code className="text-white/80 text-xs break-all block">{generateCommand("john", m, result.input, wordlist, attackMode, useRules, settings.rulesPath, mask)}</code>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap pt-1">
                        <span className="text-white/40 text-xs flex items-center gap-1"><Globe size={11} />Online:</span>
                        <a href="https://crackstation.net" target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">crackstation.net</a>
                        <a href="https://hashes.com/en/decrypt/hash" target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">hashes.com</a>
                        <a href={`https://www.google.com/search?q=%22${encodeURIComponent(result.input)}%22`} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"><Search size={10} />google</a>
                      </div>
                    </div>
                  </div>
                ))}

                {/* ─── AI Analysis Panel ────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3">
                    <label className="text-white/40 text-xs flex items-center gap-1"><Filter size={11} /> Wordlist</label>
                    <select value={wordlist} onChange={e => setWordlist(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs focus:outline-none focus:border-cyan-500/30">
                      {WORDLISTS.map(w => <option key={w.name} value={w.name} style={{ background: '#0d1022' }}>{w.name} — {w.desc}</option>)}
                    </select>
                    <label className="text-white/40 text-xs flex items-center gap-1 pt-1"><Terminal size={11} /> Attack mode</label>
                    <select value={attackMode} onChange={e => setAttackMode(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs focus:outline-none focus:border-cyan-500/30">
                      {ATTACK_MODES.map(a => <option key={a.id} value={a.id} style={{ background: '#0d1022' }}>[{a.id}] {a.name} — {a.desc}</option>)}
                    </select>
                    {attackMode === "3" && (
                      <div>
                        <label className="text-white/40 text-xs flex items-center gap-1 pt-1"><Calculator size={11} /> Mask</label>
                        <input value={mask} onChange={e => setMask(e.target.value)} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-emerald-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30" />
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {MASK_PRESETS.map(p => (
                            <button key={p.name} onClick={() => setMask(p.mask)} className="text-[10px] text-white/40 hover:text-cyan-400 bg-white/5 px-1.5 py-0.5 rounded-full transition-colors" title={p.keyspace}>{p.name}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    <label className="flex items-center gap-1 text-xs text-white/40 pt-1 cursor-pointer">
                      <input type="checkbox" checked={useRules} onChange={e => setUseRules(e.target.checked)} className="w-3 h-3 rounded border-white/20 bg-transparent" />
                      Apply best64 rules
                    </label>
                    <div className="text-[10px] text-white/30 mt-1">Rules path: <code className="text-cyan-400">{settings.rulesPath}</code></div>
                  </div>

                  {/* ─── AI Analysis ──────────────────────────────────────── */}
                  <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-cyan-400 text-xs font-semibold flex items-center gap-1">
                        <Cpu size={12} /> AI Analysis
                        {activeModel && (
                          <span className="text-[9px] text-white/30 font-mono ml-1">
                            ({activeModel})
                          </span>
                        )}
                      </span>
                      <button 
                        onClick={askAI} 
                        disabled={aiLoading || !ollamaAvailable}
                        className="text-xs px-3 py-1 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-xl hover:bg-cyan-500/30 disabled:opacity-40 transition-colors flex items-center gap-1"
                        title={!ollamaAvailable ? "Ollama not running" : "Analyze with AI"}
                      >
                        <Sparkles size={11} /> {aiLoading ? "..." : "Ask AI"}
                      </button>
                    </div>
                    
                    {!ollamaAvailable && (
                      <div className="text-amber-400 text-xs flex items-center gap-2 mb-2">
                        <AlertCircle size={12} />
                        Ollama not running
                      </div>
                    )}
                    
                    {aiHint ? (
                      // ✅ Use AIResponseText for markdown rendering
                      <AIResponseText text={aiHint} className="text-white/70 text-xs leading-relaxed whitespace-pre-wrap" />
                    ) : (
                      <div className="text-white/30 text-xs">
                        {activeModel ? (
                          `AI will analyze and recommend optimal cracking strategy using ${activeModel}`
                        ) : (
                          'Select a model in Model Manager to enable AI analysis'
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/40 text-xs flex items-center gap-1">
                      <FileText size={12} /> Notes for <code className="text-cyan-400">{result.input.slice(0, 12)}...</code>
                    </span>
                    <button onClick={() => {
                      if (editingNote && notes.trim()) {
                        saveNotesToHash(result.input, notes);
                      }
                      setEditingNote(!editingNote);
                    }} className="text-xs text-white/40 hover:text-cyan-400 transition-colors">
                      {editingNote ? "Save" : "Add"}
                    </button>
                  </div>
                  {editingNote ? (
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Context, source, findings..." className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/60 text-xs focus:outline-none focus:border-cyan-500/30 placeholder-white/20" />
                  ) : (
                    <div className="text-white/40 text-xs">{notes || "No notes"}</div>
                  )}
                </div>
              </div>
            )}

            {!result && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-3">
                  <Hash size={28} className="text-cyan-400/60" />
                </div>
                <div className="text-white/60 text-sm font-semibold">Paste a hash to identify</div>
                <div className="text-white/30 text-xs mt-1">Supports {HASH_DB.length} algorithms + custom rules</div>
                {!ollamaAvailable && (
                  <div className="mt-2 text-amber-400 text-xs flex items-center gap-1">
                    <AlertCircle size={12} /> Ollama not running — AI analysis disabled
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ─── BATCH TAB ────────────────────────────────────────────────────── */}
        {tab === "batch" && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <label className="text-white/40 text-xs">Paste multiple hashes (one per line)</label>
                <button onClick={() => setBatchInput("")} className="text-xs text-white/40 hover:text-red-400 transition-colors">Clear</button>
              </div>
              <textarea value={batchInput} onChange={e => setBatchInput(e.target.value)} rows={8} placeholder="hash1\nhash2\nhash3"
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-emerald-400 text-xs focus:outline-none focus:border-cyan-500/30 font-mono" />
              <div className="flex gap-2 mt-3">
                <button onClick={processBatch} className="px-4 py-1.5 text-xs font-bold rounded-xl bg-cyan-500 text-black flex items-center gap-1 hover:opacity-90 transition-all">
                  <Layers size={12} /> Process {batchInput.split("\n").filter(l => l.trim()).length} hashes
                </button>
                <button onClick={saveAllToHistory} className="px-4 py-1.5 text-xs rounded-xl border border-white/10 text-white/60 hover:text-white/80 hover:border-cyan-500/30 transition-colors">
                  Save all to history
                </button>
              </div>
            </div>
            {batchResults.length > 0 && (
              <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden">
                <div className="px-4 py-2 border-b border-white/5 text-xs text-white/40 uppercase">{batchResults.length} results</div>
                <div className="divide-y divide-white/5 max-h-96 overflow-y-auto">
                  {batchResults.map((r, i) => (
                    <div key={i} className="p-3 hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <code className="text-emerald-400 text-xs flex-1 min-w-0 truncate">{r.input}</code>
                        <div className="flex items-center gap-1.5">
                          {r.matches.slice(0, 2).map((m, mi) => (
                            <span key={mi} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${CONFIDENCE_STYLE[m.confidence]}`}>{m.name}</span>
                          ))}
                          {r.matches.length === 0 && <span className="text-red-400 text-[10px]">no match</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── COMPARE TAB ──────────────────────────────────────────────────── */}
        {tab === "compare" && (
          <div className="bg-white/5 border border-white/5 rounded-2xl p-5 space-y-3">
            <div className="text-white text-sm font-semibold flex items-center gap-2"><Activity size={14} /> Compare two hashes</div>
            <div>
              <label className="text-white/40 text-xs block mb-1">Hash A</label>
              <input value={compareInput.a} onChange={e => setCompareInput({ ...compareInput, a: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-emerald-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30" />
            </div>
            <div>
              <label className="text-white/40 text-xs block mb-1">Hash B</label>
              <input value={compareInput.b} onChange={e => setCompareInput({ ...compareInput, b: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-emerald-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30" />
            </div>
            <button onClick={compareHashes} disabled={!compareInput.a || !compareInput.b} className="px-4 py-1.5 text-xs font-bold rounded-xl bg-cyan-500 text-black disabled:opacity-40 hover:opacity-90 transition-all">
              Compare
            </button>
            {compareResult && (
              <div className="bg-black/30 border border-white/5 rounded-xl p-3 mt-3 text-xs">
                <div>Same: <span className={compareResult.same ? "text-emerald-400" : "text-white/60"}>{compareResult.same ? "yes" : "no"}</span></div>
                <div>Position match: <span className="text-cyan-400">{compareResult.sim.toFixed(1)}%</span></div>
                <div>Hamming distance: <span className="text-amber-400">{compareResult.hamming}</span></div>
              </div>
            )}
          </div>
        )}

        {/* ─── RULES TAB ────────────────────────────────────────────────────── */}
        {tab === "rules" && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/5 rounded-2xl p-5">
              <div className="text-white text-sm font-semibold mb-3 flex items-center gap-2"><Plus size={14} /> Add custom rule</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input value={newRule.name} onChange={e => setNewRule({ ...newRule, name: e.target.value })} placeholder="Rule name" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30 placeholder-white/20" />
                <input value={newRule.pattern} onChange={e => setNewRule({ ...newRule, pattern: e.target.value })} placeholder="Regex pattern (e.g. ^prefix[a-f0-9]+$)" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30 placeholder-white/20" />
                <input value={newRule.length} onChange={e => setNewRule({ ...newRule, length: e.target.value })} placeholder="Lengths (comma-separated, optional)" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30 placeholder-white/20" />
                <input value={newRule.hashcat} onChange={e => setNewRule({ ...newRule, hashcat: e.target.value })} placeholder="Hashcat mode (e.g. -m 9999)" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30 placeholder-white/20" />
                <input value={newRule.john} onChange={e => setNewRule({ ...newRule, john: e.target.value })} placeholder="John format (e.g. --format=custom)" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30 placeholder-white/20" />
                <input value={newRule.description} onChange={e => setNewRule({ ...newRule, description: e.target.value })} placeholder="Description" className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30 placeholder-white/20" />
              </div>
              <button onClick={addRule} className="mt-3 px-4 py-1.5 text-xs font-bold rounded-xl bg-cyan-500 text-black flex items-center gap-1 hover:opacity-90 transition-all"><Plus size={12} /> Add rule</button>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-2xl overflow-hidden">
              <div className="px-4 py-2 border-b border-white/5 text-xs text-white/40 uppercase flex items-center justify-between">
                <span>Custom Rules ({rules.length})</span>
                {rules.length > 0 && <button onClick={() => setRules([])} className="text-red-400 hover:text-red-300 text-[10px] transition-colors">Clear all</button>}
              </div>
              {rules.length === 0 ? (
                <div className="p-8 text-center text-white/30 text-sm">No custom rules yet</div>
              ) : (
                <div className="divide-y divide-white/5">
                  {rules.map(r => (
                    <div key={r.id} className="p-3 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-semibold">{r.name}</div>
                        <code className="text-cyan-400 text-[10px] font-mono">{r.pattern}</code>
                        <div className="text-white/40 text-[10px] mt-1">{r.description}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs text-white/40 cursor-pointer">
                          <input type="checkbox" checked={r.enabled} onChange={e => setRules(prev => prev.map(x => x.id === r.id ? { ...x, enabled: e.target.checked } : x))} className="w-3 h-3 rounded border-white/20 bg-transparent" />
                          Enabled
                        </label>
                        <button onClick={() => setRules(prev => prev.filter(x => x.id !== r.id))} className="text-red-400 hover:text-red-300 transition-colors"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── STATS TAB ────────────────────────────────────────────────────── */}
        {tab === "stats" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { l: "Total Hashes", v: stats.total, c: "text-cyan-400", i: Hash },
                { l: "Cracked", v: stats.cracked, c: "text-emerald-400", i: Check },
                { l: "Success Rate", v: `${stats.successRate.toFixed(1)}%`, c: "text-amber-400", i: TrendingUp },
                { l: "Custom Rules", v: rules.length, c: "text-purple-400", i: Code2 },
              ].map(s => (
                <div key={s.l} className="bg-white/5 border border-white/5 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <s.i size={14} className={s.c} />
                    <span className="text-[10px] text-white/40 uppercase">{s.l}</span>
                  </div>
                  <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
                </div>
              ))}
            </div>
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
              <div className="text-white text-sm font-semibold mb-3">Category Distribution (distinct hashes)</div>
              {Object.keys(stats.categoryCount).length === 0 ? (
                <div className="text-white/30 text-sm">No data yet</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stats.categoryCount).sort(([, a], [, b]) => b - a).map(([cat, count]) => {
                    const total = Object.values(stats.categoryCount).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white/60">{CATEGORY_STYLE[cat as HashMatch["category"]]?.label || cat}</span>
                          <span className="text-white/40">{count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className={`h-full ${CATEGORY_STYLE[cat as HashMatch["category"]]?.color.replace("text-", "bg-") || "bg-white/20"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
              <div className="text-white text-sm font-semibold mb-3">Database Stats</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-white/40">Total algorithms:</div><div className="text-cyan-400">{HASH_DB.length}</div>
                <div className="text-white/40">Categories:</div><div className="text-cyan-400">{Object.keys(CATEGORY_STYLE).length}</div>
                <div className="text-white/40">Custom rules:</div><div className="text-cyan-400">{rules.length}</div>
                <div className="text-white/40">Wordlists:</div><div className="text-cyan-400">{WORDLISTS.length}</div>
              </div>
            </div>
          </div>
        )}

        {/* ─── HISTORY TAB ──────────────────────────────────────────────────── */}
        {tab === "history" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[150px]">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hashes or notes..." className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-white/60 text-xs focus:outline-none focus:border-cyan-500/30 placeholder-white/20" />
              </div>
              <select value={filterConf} onChange={e => setFilterConf(e.target.value)} className="bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-white/60 text-xs focus:outline-none focus:border-cyan-500/30">
                <option style={{ background: '#0d1022' }}>All</option>
                <option value="high" style={{ background: '#0d1022' }}>High</option>
                <option value="medium" style={{ background: '#0d1022' }}>Medium</option>
                <option value="low" style={{ background: '#0d1022' }}>Low</option>
              </select>
              <select value={filterCracked} onChange={e => setFilterCracked(e.target.value as any)} className="bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-white/60 text-xs focus:outline-none focus:border-cyan-500/30">
                <option value="all" style={{ background: '#0d1022' }}>All</option>
                <option value="cracked" style={{ background: '#0d1022' }}>Cracked</option>
                <option value="uncracked" style={{ background: '#0d1022' }}>Uncracked</option>
              </select>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as any)} className="bg-white/5 border border-white/10 rounded-xl px-2 py-1.5 text-white/60 text-xs focus:outline-none focus:border-cyan-500/30">
                <option value="all" style={{ background: '#0d1022' }}>All priority</option>
                <option value="critical" style={{ background: '#0d1022' }}>Critical</option>
                <option value="high" style={{ background: '#0d1022' }}>High</option>
                <option value="medium" style={{ background: '#0d1022' }}>Medium</option>
                <option value="low" style={{ background: '#0d1022' }}>Low</option>
              </select>
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs text-white/40 hover:text-cyan-400 transition-colors px-2 py-1.5 border border-white/10 rounded-xl"><Upload size={11} /></button>
              <input ref={fileRef} type="file" accept=".json" onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = (ev) => {
                  try {
                    const data = JSON.parse(ev.target?.result as string);
                    if (Array.isArray(data)) {
                      const incomingIds = new Set(data.map((d: SavedHash) => d.hash));
                      setSaved(prev => {
                        const filtered = prev.filter(p => !incomingIds.has(p.hash));
                        return [...data, ...filtered];
                      });
                    }
                  } catch { alert("Invalid file"); }
                };
                r.readAsText(f);
                if (fileRef.current) fileRef.current.value = "";
              }} className="hidden" />
              <button onClick={() => {
                const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `hashes_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
              }} className="flex items-center gap-1 text-xs text-white/40 hover:text-cyan-400 transition-colors px-2 py-1.5 border border-white/10 rounded-xl"><Download size={11} /></button>
              <button onClick={() => { if (confirm("Clear all saved hashes?")) setSaved([]); }} className="flex items-center gap-1 text-xs text-red-400/50 hover:text-red-400 transition-colors px-2 py-1.5 border border-red-500/20 rounded-xl"><Trash2 size={11} /></button>
            </div>

            {filtered.length === 0 ? (
              <div className="bg-white/5 border border-white/5 rounded-2xl p-8 text-center">
                <Shield size={28} className="text-white/20 mx-auto mb-2" />
                <div className="text-white/40 text-sm">No saved hashes</div>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(h => (
                  <div key={h.id} className="bg-white/5 border border-white/5 rounded-xl p-3 hover:border-cyan-500/30 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSaved(prev => prev.map(s => s.id === h.id ? { ...s, starred: !s.starred } : s))} className={h.starred ? "text-yellow-400" : "text-white/30 hover:text-yellow-400 transition-colors"}>
                            <Star size={12} fill={h.starred ? "currentColor" : "none"} />
                          </button>
                          <code className="text-emerald-400 text-xs break-all">{h.hash}</code>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {h.matches.slice(0, 3).map((m, i) => (
                            <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-full border ${CONFIDENCE_STYLE[m.confidence]}`}>{m.name}</span>
                          ))}
                          <span className="text-white/30 text-[10px] flex items-center gap-1"><Clock size={9} />{new Date(h.timestamp).toLocaleDateString()}</span>
                          {h.priority && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              h.priority === "critical" ? "bg-red-500/20 text-red-400 border border-red-500/20" :
                              h.priority === "high" ? "bg-orange-500/20 text-orange-400 border border-orange-500/20" :
                              h.priority === "medium" ? "bg-amber-500/20 text-amber-400 border border-amber-500/20" :
                              "bg-white/5 text-white/40 border border-white/10"
                            }`}>{h.priority}</span>
                          )}
                          {h.status && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              h.status === "cracked" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" :
                              h.status === "cracking" ? "bg-amber-500/20 text-amber-400 border border-amber-500/20" :
                              h.status === "failed" ? "bg-red-500/20 text-red-400 border border-red-500/20" : "bg-white/5 text-white/40 border border-white/10"
                            }`}>{h.status}</span>
                          )}
                          {h.cracked && <span className="text-emerald-400 text-[10px] flex items-center gap-1 truncate max-w-[150px]"><Check size={10} />{h.crackedValue}</span>}
                        </div>
                        {h.notes && <div className="text-white/40 text-[10px] mt-1 italic">"{h.notes}"</div>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => { setInput(h.hash); setTab("identify"); setTimeout(() => identifyWithInput(h.hash), 50); }} className="p-1.5 rounded-lg text-white/30 hover:text-cyan-400 transition-colors" title="Re-identify"><Play size={13} /></button>
                        <button onClick={() => {
                          const next = h.priority === "critical" ? "high" : h.priority === "high" ? "medium" : h.priority === "medium" ? "low" : "critical";
                          setSaved(prev => prev.map(s => s.id === h.id ? { ...s, priority: next } : s));
                        }} className="p-1.5 rounded-lg text-white/30 hover:text-amber-400 transition-colors" title="Cycle priority"><Flag size={13} /></button>
                        {!h.cracked ? (
                          <button onClick={() => { setEditingCrackedId(h.id); setCrackedInputValue(""); }} className="p-1.5 rounded-lg text-white/30 hover:text-emerald-400 transition-colors" title="Mark cracked"><Target size={13} /></button>
                        ) : (
                          <button onClick={() => setSaved(prev => prev.map(s => s.id === h.id ? { ...s, cracked: false, crackedValue: undefined, status: "pending" } : s))} className="p-1.5 rounded-lg text-white/30 hover:text-red-400 transition-colors" title="Unmark cracked"><RotateCcw size={13} /></button>
                        )}
                        <button onClick={() => setSaved(prev => prev.filter(s => s.id !== h.id))} className="p-1.5 rounded-lg text-white/30 hover:text-red-400 transition-colors" title="Delete"><Trash2 size={13} /></button>
                      </div>
                    </div>
                    {editingCrackedId === h.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input type="text" value={crackedInputValue} onChange={e => setCrackedInputValue(e.target.value)} placeholder="Cracked value..." className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-emerald-400 text-xs focus:outline-none focus:border-emerald-500/30 placeholder-white/20" autoFocus />
                        <button onClick={() => {
                          if (crackedInputValue.trim()) {
                            setSaved(prev => prev.map(s => s.id === h.id ? { ...s, cracked: true, crackedValue: crackedInputValue.trim(), status: "cracked" } : s));
                          }
                          setEditingCrackedId(null);
                        }} className="px-3 py-1 text-xs bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-500/30 transition-colors">Save</button>
                        <button onClick={() => setEditingCrackedId(null)} className="px-3 py-1 text-xs text-white/40 hover:text-white/80 transition-colors">Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── SETTINGS TAB ──────────────────────────────────────────────────── */}
        {tab === "settings" && (
          <div className="bg-white/5 border border-white/5 rounded-2xl p-5 space-y-3">
            <div className="text-white text-sm font-semibold flex items-center gap-2"><Settings size={14} /> Settings</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-white/40 text-xs block mb-1">AI Model</label>
                <input 
                  value={settings.aiModel} 
                  onChange={e => setSettings({ ...settings, aiModel: e.target.value })} 
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30" 
                />
                <div className="text-[9px] text-white/30 mt-1">
                  {activeModel ? `Active: ${activeModel}` : 'No active model'}
                </div>
              </div>
              <div>
                <label className="text-white/40 text-xs block mb-1">Default Wordlist</label>
                <select value={settings.defaultWordlist} onChange={e => setSettings({ ...settings, defaultWordlist: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs focus:outline-none focus:border-cyan-500/30">
                  {WORDLISTS.map(w => <option key={w.name} value={w.name} style={{ background: '#0d1022' }}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-white/40 text-xs block mb-1">Default Attack Mode</label>
                <select value={settings.defaultAttackMode} onChange={e => setSettings({ ...settings, defaultAttackMode: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs focus:outline-none focus:border-cyan-500/30">
                  {ATTACK_MODES.map(a => <option key={a.id} value={a.id} style={{ background: '#0d1022' }}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-white/40 text-xs block mb-1">Default Priority</label>
                <select value={settings.defaultPriority} onChange={e => setSettings({ ...settings, defaultPriority: e.target.value as any })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-xs focus:outline-none focus:border-cyan-500/30">
                  <option value="critical" style={{ background: '#0d1022' }}>Critical</option>
                  <option value="high" style={{ background: '#0d1022' }}>High</option>
                  <option value="medium" style={{ background: '#0d1022' }}>Medium</option>
                  <option value="low" style={{ background: '#0d1022' }}>Low</option>
                </select>
              </div>
              <div>
                <label className="text-white/40 text-xs block mb-1">Max History</label>
                <input type="number" value={settings.maxHistory} onChange={e => setSettings({ ...settings, maxHistory: parseInt(e.target.value) || 100 })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30" />
              </div>
              <div>
                <label className="text-white/40 text-xs block mb-1">Default Mask</label>
                <input value={settings.defaultMask} onChange={e => setSettings({ ...settings, defaultMask: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30" />
              </div>
              <div>
                <label className="text-white/40 text-xs block mb-1">Rules Path</label>
                <input value={settings.rulesPath} onChange={e => setSettings({ ...settings, rulesPath: e.target.value })} className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-cyan-400 text-xs font-mono focus:outline-none focus:border-cyan-500/30" />
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-white/5">
              <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
                <input type="checkbox" checked={settings.autoDetect} onChange={e => setSettings({ ...settings, autoDetect: e.target.checked })} className="w-3 h-3 rounded border-white/20 bg-transparent" />
                Auto-detect hashes on input
              </label>
              <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
                <input type="checkbox" checked={settings.useRules} onChange={e => setSettings({ ...settings, useRules: e.target.checked })} className="w-3 h-3 rounded border-white/20 bg-transparent" />
                Apply rules by default
              </label>
              <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
                <input type="checkbox" checked={settings.enableAI} onChange={e => setSettings({ ...settings, enableAI: e.target.checked })} className="w-3 h-3 rounded border-white/20 bg-transparent" />
                Enable AI analysis
              </label>
              <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
                <input type="checkbox" checked={settings.showConfidence} onChange={e => setSettings({ ...settings, showConfidence: e.target.checked })} className="w-3 h-3 rounded border-white/20 bg-transparent" />
                Show confidence indicators
              </label>
              <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
                <input type="checkbox" checked={settings.showEntropy} onChange={e => setSettings({ ...settings, showEntropy: e.target.checked })} className="w-3 h-3 rounded border-white/20 bg-transparent" />
                Show entropy metrics
              </label>
            </div>
            <div className="pt-2 border-t border-white/5 flex gap-2 flex-wrap">
              <button onClick={() => setSettings(DEFAULT_SETTINGS)} className="px-3 py-1.5 text-xs rounded-xl border border-white/10 text-white/40 hover:text-white/80 hover:border-white/20 transition-colors">Reset to defaults</button>
              <button onClick={clearAllData} className="px-3 py-1.5 text-xs rounded-xl border border-red-500/20 text-red-400/60 hover:text-red-400 hover:border-red-500/30 transition-colors">Clear hash data</button>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        .animate-bounce { animation: bounce 1.2s ease-in-out infinite; }
      `}} />
    </div>
  );
}