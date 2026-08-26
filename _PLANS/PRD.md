# Ghost (née CommandPanel) — Product Requirements Document

**Status:** v0.1 shipped · **Owner:** Wynter Jones · **Last updated:** 2026-08-26

## 1. Problem

Running AI CLIs (Claude Code, Codex, Gemini CLI) means keeping a terminal
around all day. A full terminal app is heavy, steals screen space, and gets
buried under other windows. We want a terminal that is *there when you need
it and invisible when you don't*.

## 2. Product vision

A minimal, dark, always-on-top terminal panel. When you walk away with the
mouse it melts into a tiny black icon box pinned to a screen edge. Click the
box and the terminal is back — as a quick compact view or a large popup. The
whole product is the UX of appearing and disappearing.

## 3. Users

- Primary: developers running AI coding CLIs all day (the author).
- Secondary: anyone wanting a quake-style drop-down terminal on macOS.

## 4. Core requirements

### Terminal (must)
- [x] Real PTY per tab (`portable-pty`, login shell so user PATH works)
- [x] xterm.js frontend with WebGL renderer, Unicode 11, clickable links
- [x] Raw-byte IPC streaming (Tauri channels) — no JSON per-chunk overhead
- [x] Tabs across the top: create (+ / ⌘T), close (× / ⌘W / middle-click),
      switch (⌘1–9), **rename via right-click**
- [x] Auto tab titles from shell OSC title updates until manually renamed
- [x] Activity dot on background tabs producing output
- [x] ⌘C copies selection, ⌘V pastes, ⌘＋/⌘− font size

### Quick command panel (must)
- [x] ⌘K palette listing configurable commands (defaults: `claude`,
      `codex`, `gemini`)
- [x] Click runs in active tab; ⌘-click opens a new tab and runs there
- [x] Commands editable in settings (label + command, add/remove)

### Drag & drop (must)
- [x] Drop files, folders, or images anywhere on the terminal → shell-quoted
      path(s) inserted at the cursor (perfect for pasting an image path to
      Claude Code)
- [x] Drop-target overlay while hovering

### Window behavior — the main thing (must)
- [x] Three states: **mini** (56 px black icon box), **quick view**
      (compact panel), **full** (large popup)
- [x] Mini box: always-on-top, shows `❯` icon, status dot (green idle /
      amber pulsing while any tab is producing output) and terminal count
- [x] Mini box draggable to any screen edge; snaps to nearest edge and
      remembers its spot
- [x] Click mini box → expands centered on screen, as quick view or full
      popup (configurable)
- [x] Hover mini box → peek: quick view appears anchored at the icon without
      stealing focus; slides back to mini ~0.6 s after the mouse leaves;
      clicking or typing promotes it to a normal sticky window
- [x] Auto-hide: when not pinned, mouse away + no typing for N seconds →
      collapse to mini. Hovering, typing, or focus keeps it open
- [x] Pin button disables auto-hide
- [x] Closing the window (⌘W on window / red-x equivalents) collapses to
      mini instead of quitting; ⌘Q quits
- [x] Animated open/close (fade + scale transition around native resize)

### Settings (must)
- [x] Auto-hide on/off, hide delay slider
- [x] Default expand view (quick / full)
- [x] Always on top toggle
- [x] Font size
- [x] Quick command editor
- [x] Persisted in localStorage; window sizes and mini position remembered

## 5. Design principles

- Dark mode only. Near-black `#0e0e11`, hairline borders, one accent blue.
- No chrome: no native title bar, tab bar doubles as drag region.
- Rounded transparent window, native shadow.
- System font for UI, JetBrains Mono / SF Mono for terminal.
- Motion is 100–150 ms ease; nothing bounces.

## 6. Non-goals (v0.1)

- Split panes, tmux integration, session restore after quit
- Windows/Linux polish (macOS first; Tauri keeps the door open)
- Global hotkey to summon (v0.2 candidate)


## 7. Backlog / v0.2 ideas

- Global summon hotkey (tauri-plugin-global-shortcut)
- Menu-bar (tray) presence as alternative to mini box
- Session persistence across restarts
- Per-tab working directory chooser + "open in current Finder folder"
- Custom icon + notch-style top-edge docking

### Distribution (shipped)
- [x] Signed (Developer ID) + notarized macOS build
- [x] GitHub Releases with updater artifacts (`latest.json`, signed `.app.tar.gz`)
- [x] In-app updates: Settings → Check for updates → download, install, relaunch
      (tauri-plugin-updater + tauri-plugin-process)

## 8. Technical notes

- Tauri 2, vanilla TypeScript + Vite (no framework — the UI is one screen).
- PTY output streamed as raw bytes over a Tauri IPC `Channel`
  (`InvokeResponseBody::Raw`); xterm.js ingests `Uint8Array` directly and
  handles split UTF-8 sequences internally.
- Window states are implemented by resizing/repositioning the single native
  window; content crossfades via CSS during the switch.
- Auto-hide is a 400 ms poll that reads the OS cursor position
  (`cursorPosition()`) and compares it against the window rect —
  mouseleave/focus DOM events proved unreliable in WKWebView. Gated on
  pin/palette/settings/drag state; hover-peek uses a short 600 ms delay and
  bypasses the gates.
- Inactive terminals stay mounted with `visibility: hidden` (xterm needs
  non-zero dimensions to initialize correctly).
