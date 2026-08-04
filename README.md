# GhostShell

**GhostShell** is a local-first, AI-powered penetration testing desktop application. It pairs a full offensive-security toolkit — Nmap automation, CVE intelligence, hash identification, privilege escalation checklists, Active Directory attack-path mapping, and more — with an AI assistant that runs entirely on your own machine via [Ollama](https://ollama.com). No API keys, no cloud dependency by default, no engagement data leaving your device.

Built for people learning or practicing penetration testing (HackTheBox, TryHackMe, OSCP-style engagements) who want an AI coach and toolkit that stays local and private.

## Features

- **AI Assistant** — chat with local or cloud Ollama models, with file attachments, streaming responses, and an automatic model router
- **Nmap Builder** — visual scan command construction
- **CVE Intelligence Center** — live NVD/CISA KEV lookups
- **Hash Identifier** — pattern-match hash types with cracking guidance
- **Password Cracker workflow guide**
- **Privilege Escalation checklists** — Linux and Windows
- **Active Directory tooling** — BloodHound coach, attack path visualization
- **Methodology coaches** — HTB/THM, Gobuster/MSF, Wireshark, Responder
- **Engagement Workspace** — encrypted, OS-keychain-backed storage for engagement data (via Electron's `safeStorage`)
- **CVE/report writer, knowledge base, habit tracker, and model manager**

## Security architecture

- Electron `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — the renderer (UI) never gets direct Node.js or filesystem access
- All communication with Ollama is proxied through the main process, not called directly from the renderer
- Sensitive workspace data (credentials, hashes, engagement notes) is encrypted at rest via the OS keychain (`safeStorage`), not stored in plaintext `localStorage`
- Passphrase-protected export/import using AES-256-GCM with scrypt key derivation
- A strict allowlist restricts which Ollama endpoints and secure-storage keys the renderer can ever request — arbitrary reads/writes are not possible even if the renderer were compromised

## Requirements

- [Ollama](https://ollama.com/download) — GhostShell will detect and launch it automatically if installed, or prompt you to install it if not. (The Linux `.deb` installer will also attempt to install Ollama automatically during setup if it isn't already present.)
- At least one Ollama model pulled (e.g. `ollama pull qwen2.5-coder:3b`) — GhostShell doesn't bundle any models itself, since they're multi-gigabyte downloads.

## Development

```bash
npm install
npm run electron:dev
```

This runs the Vite dev server and Electron together with hot reload.

## Building installers

```bash
npm run electron:build:linux   # produces .deb and .AppImage
npm run electron:build:win     # produces .exe (NSIS installer)
npm run electron:build:mac     # produces .dmg
```

Built installers are written to `release/`.

**Platform notes:**
- Windows and macOS builds should be built on their native OS (or via the included GitHub Actions workflow, which builds all three platforms automatically on every push — see `.github/workflows/build.yml`). Cross-compiling from Linux is unreliable.
- Builds are currently unsigned. Windows will show a SmartScreen warning; macOS will require right-click → Open the first time (Gatekeeper) until code-signing certificates are set up.

## Tech stack

Electron · React · TypeScript · Vite · TailwindCSS · Ollama

---

Created by Zack Vance
