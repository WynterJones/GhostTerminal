<div align="center">

<img src="assets/logo.png" alt="Ghost" width="420" />

**A minimal, always-on-top terminal that gets out of your way.**

Built for running AI CLIs — Claude Code, Codex, Gemini — without a
heavyweight terminal app hogging your screen.

![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![xterm.js](https://img.shields.io/badge/xterm.js-6-blue)
![Rust](https://img.shields.io/badge/Rust-portable--pty-orange?logo=rust)
![macOS](https://img.shields.io/badge/macOS-first-black?logo=apple)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

## What it does

Ghost is a dark, frameless terminal panel with three states:

| State | What you see |
|-------|--------------|
| **Mini** | A tiny black box pinned to a screen edge with the Ghost icon. A dot pulses while output streams. Always on top. |
| **Quick view** | A compact terminal that opens right beside the mini box when you click it. |
| **Full view** | A large centered terminal for real sessions — one click on the expand button in the top bar. |

Move your mouse away and stop typing and it melts back into the mini box
(never within the first 5 seconds of opening). Click the box and it's back,
exactly where you left it. Pin it when you want it to stay put.

## Features

- 🖥️ **Real terminals** — native PTY per tab (login shell, your full PATH), xterm.js with WebGL rendering, 24-bit color, Unicode 11, clickable links
- 🗂️ **Tabs** — `⌘T` new, `⌘W` close, `⌘1–9` switch, right-click to rename or color-tag (the color tints that tab's terminal theme), auto-titles from the shell, activity dots on busy background tabs
- 💾 **Tabs persist** — your tab set, custom names, and colors survive restarts (fresh shells each launch)
- ⚡ **Quick commands** — `⌘K` palette with your AI CLIs (`claude`, `codex`, `gemini` by default, fully editable). Click to run; `⌘`-click to run in a new tab
- 🖼️ **Drag & drop** — drop images, files, or folders onto the terminal and the shell-quoted path lands at your cursor (ideal for handing screenshots to Claude Code)
- 📌 **Mini mode** — draggable to any screen edge, snaps and remembers its spot, pulses while output streams. Click it to open the quick view anchored right at the icon
- ⚙️ **Settings** — a clean centered modal: auto-hide toggle and delay, always-on-top, font size, quick-command editor. Everything persists
- 🔄 **Auto-updates** — signed and notarized builds; Settings → Check for updates downloads, installs, and restarts in place
- 🌘 **Dark, minimal design** — no title bar, rounded transparent window, 100 ms fade/scale animations

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘T` | New tab |
| `⌘W` | Close tab |
| `⌘1–9` | Switch tab |
| `⌘K` | Quick command palette |
| `⌘,` | Settings |
| `⌘+` / `⌘−` | Font size |
| `⌘C` / `⌘V` | Copy selection / paste |
| Right-click tab | Rename · tab color |
| `Esc` | Close palette / settings |

## Install

Grab the latest signed `.dmg` from
[Releases](https://github.com/WynterJones/GhostTerminal/releases/latest)
(Apple Silicon). Ghost keeps itself current via Settings → Check for updates.

## Building from source

**Prereqs:** Rust (stable), Node 18+, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

```bash
git clone https://github.com/WynterJones/GhostTerminal.git
cd GhostTerminal
npm install
npm run tauri dev      # develop
npm run tauri build    # produce the .app / installer
```

## Architecture

```
┌─────────────────────────────────────────────┐
│  Frontend (vanilla TS + Vite)               │
│  xterm.js (WebGL) · tabs · palette ·        │
│  window-state machine · settings            │
└──────────────┬──────────────────────────────┘
               │ Tauri IPC — raw-byte channels
┌──────────────┴──────────────────────────────┐
│  Rust (Tauri 2)                             │
│  portable-pty → login shell per tab         │
│  spawn / write / resize / kill              │
└─────────────────────────────────────────────┘
```

PTY output streams to the frontend as raw bytes over Tauri IPC channels (no
JSON encoding per chunk); xterm.js consumes `Uint8Array` directly and handles
UTF-8 chunk boundaries itself.

## Roadmap

- Global summon hotkey
- Scrollback restore across restarts
- Windows / Linux polish

See [`_PLANS/PRD.md`](_PLANS/PRD.md) for the full product doc.

## License

MIT © [Wynter Jones](https://github.com/WynterJones)
