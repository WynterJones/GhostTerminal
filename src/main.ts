import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { listen } from "@tauri-apps/api/event";
import {
  LogicalPosition,
  LogicalSize,
  currentMonitor,
  cursorPosition,
  getCurrentWindow,
} from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { TermSession } from "./term";
import { renderSettings, save, settings } from "./settings";

const win = getCurrentWindow();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const tabsEl = $("tabs");
const termsEl = $("terms");
const miniEl = $("mini");
const miniDot = $("mini-dot");
const miniCount = $("mini-count");
const paletteEl = $("palette");
const paletteList = $("palette-list");
const settingsEl = $("settings");
const dropEl = $("drop");
const pinBtn = $("pinbtn");

// ---------- tabs ----------

const sessions: TermSession[] = [];
let activeId = 0;

function active(): TermSession | undefined {
  return sessions.find((s) => s.id === activeId);
}

function renderTabs(): void {
  tabsEl.innerHTML = "";
  for (const s of sessions) {
    const tab = document.createElement("div");
    tab.className = "tab" + (s.id === activeId ? " active" : "");
    tab.dataset.id = String(s.id);

    const dot = document.createElement("span");
    dot.className = "activity";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = s.title;
    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "×";
    close.title = "Close tab";
    close.onclick = (e) => {
      e.stopPropagation();
      closeTab(s.id);
    };

    tab.append(dot, name, close);
    tab.onclick = () => selectTab(s.id);
    tab.onauxclick = (e) => {
      if (e.button === 1) closeTab(s.id);
    };
    tab.oncontextmenu = (e) => {
      e.preventDefault();
      startRename(tab, s);
    };
    tabsEl.appendChild(tab);
  }
  updateMini();
}

function startRename(tab: HTMLElement, s: TermSession): void {
  const name = tab.querySelector(".name") as HTMLElement;
  const input = document.createElement("input");
  input.value = s.title;
  name.replaceWith(input);
  input.focus();
  input.select();
  const commit = () => {
    if (input.value.trim()) {
      s.title = input.value.trim();
      s.renamed = true;
    }
    renderTabs();
    active()?.focus();
  };
  input.onblur = commit;
  input.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.value = s.title;
      input.blur();
    }
  };
}

function selectTab(id: number): void {
  activeId = id;
  for (const s of sessions) s.el.classList.toggle("active", s.id === id);
  const tab = tabsEl.querySelector(`[data-id="${id}"]`);
  tab?.classList.remove("has-activity");
  renderTabs();
  const s = active();
  s?.fit();
  s?.focus();
}

async function newTab(): Promise<TermSession> {
  const s = new TermSession(
    termsEl,
    settings.fontSize,
    (sess) => {
      // output in a background tab -> activity dot
      if (sess.id !== activeId) {
        tabsEl.querySelector(`[data-id="${sess.id}"]`)?.classList.add("has-activity");
      }
      updateMini();
    },
    () => renderTabs(),
  );
  sessions.push(s);
  selectTab(s.id);
  await s.spawn();
  s.fit();
  return s;
}

function closeTab(id: number, alreadyDead = false): void {
  const i = sessions.findIndex((s) => s.id === id);
  if (i === -1) return;
  sessions[i].dispose(!alreadyDead);
  sessions.splice(i, 1);
  if (sessions.length === 0) {
    void newTab();
    return;
  }
  if (activeId === id) selectTab(sessions[Math.max(0, i - 1)].id);
  else renderTabs();
}

void listen<number>("pty-exit", (e) => closeTab(e.payload, true));

// ---------- mini status ----------

function updateMini(): void {
  miniCount.textContent = String(sessions.length);
  const busy = sessions.some((s) => Date.now() - s.lastOutput < 3000);
  miniDot.classList.toggle("busy", busy);
}
setInterval(updateMini, 1500);

// ---------- window modes ----------

type Mode = "mini" | "quick" | "full";
const MINI = 56;
const MARGIN = 12;
let mode: Mode = "full";
let switching = false;
let ignoreMove = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Rect = { x: number; y: number; w: number; h: number };

async function workArea(): Promise<Rect> {
  const m = await currentMonitor();
  if (!m) return { x: 0, y: 0, w: 1440, h: 900 };
  const sf = m.scaleFactor || 1;
  const wa = (m as unknown as { workArea?: { position: { x: number; y: number }; size: { width: number; height: number } } }).workArea;
  const pos = wa?.position ?? m.position;
  const size = wa?.size ?? m.size;
  return { x: pos.x / sf, y: pos.y / sf, w: size.width / sf, h: size.height / sf };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function miniTarget(wa: Rect): { x: number; y: number } {
  const p = settings.miniPos ?? { x: wa.x + wa.w - MINI - MARGIN, y: wa.y + wa.h / 2 - MINI / 2 };
  return snapToEdge(wa, p);
}

function snapToEdge(wa: Rect, p: { x: number; y: number }): { x: number; y: number } {
  const x = clamp(p.x, wa.x + MARGIN, wa.x + wa.w - MINI - MARGIN);
  const y = clamp(p.y, wa.y + MARGIN, wa.y + wa.h - MINI - MARGIN);
  const d = [
    { edge: "left", dist: x - wa.x, pos: { x: wa.x + MARGIN, y } },
    { edge: "right", dist: wa.x + wa.w - (x + MINI), pos: { x: wa.x + wa.w - MINI - MARGIN, y } },
    { edge: "top", dist: y - wa.y, pos: { x, y: wa.y + MARGIN } },
    { edge: "bottom", dist: wa.y + wa.h - (y + MINI), pos: { x, y: wa.y + wa.h - MINI - MARGIN } },
  ].sort((a, b) => a.dist - b.dist)[0];
  return d.pos;
}

// deliberate expansion: centered in the work area
function expandTarget(wa: Rect, s: { w: number; h: number }): { x: number; y: number } {
  return {
    x: Math.round(wa.x + (wa.w - s.w) / 2),
    y: Math.round(wa.y + (wa.h - s.h) / 2),
  };
}

// hover peek: anchored next to the mini box so it appears under the cursor
function anchorTarget(wa: Rect, s: { w: number; h: number }): { x: number; y: number } {
  const anchor = settings.miniPos ?? { x: wa.x + wa.w - MINI - MARGIN, y: wa.y + wa.h / 2 - MINI / 2 };
  const cx = anchor.x + MINI / 2 <= wa.x + wa.w / 2 ? anchor.x : anchor.x + MINI - s.w;
  const cy = anchor.y + MINI / 2 <= wa.y + wa.h / 2 ? anchor.y : anchor.y + MINI - s.h;
  return {
    x: clamp(cx, wa.x + MARGIN, wa.x + wa.w - s.w - MARGIN),
    y: clamp(cy, wa.y + MARGIN, wa.y + wa.h - s.h - MARGIN),
  };
}

let peek = false;

async function setMode(next: Mode, opts?: { peek?: boolean }): Promise<void> {
  if (switching || next === mode) return;
  switching = true;
  bump();
  document.body.classList.add("switching");
  await sleep(110);

  const wa = await workArea();
  ignoreMove = true;
  if (next === "mini") {
    peek = false;
    settingsEl.hidden = true;
    paletteEl.hidden = true;
    const p = miniTarget(wa);
    settings.miniPos = p;
    save();
    await win.setResizable(false);
    await win.setSize(new LogicalSize(MINI, MINI));
    await win.setPosition(new LogicalPosition(p.x, p.y));
    await win.setAlwaysOnTop(true);
  } else {
    peek = !!opts?.peek;
    const size = next === "full" ? settings.fullSize : settings.quickSize;
    const p = peek ? anchorTarget(wa, size) : expandTarget(wa, size);
    await win.setSize(new LogicalSize(size.w, size.h));
    await win.setPosition(new LogicalPosition(p.x, p.y));
    await win.setResizable(true);
    await win.setAlwaysOnTop(peek ? true : settings.alwaysOnTop);
    if (!peek) await win.setFocus();
  }

  mode = next;
  document.body.dataset.mode = next;
  miniEl.hidden = next !== "mini";
  await sleep(30);
  document.body.classList.remove("switching");
  setTimeout(() => (ignoreMove = false), 300);
  switching = false;

  if (next !== "mini") {
    active()?.fit();
    if (!peek) active()?.focus();
  }
}

// remember manual resizes of the expanded window
let resizeTimer: number | undefined;
void win.onResized(() => {
  if (mode === "mini" || switching) return;
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    void (async () => {
      const size = await win.innerSize();
      const sf = await win.scaleFactor();
      const target = mode === "full" ? settings.fullSize : settings.quickSize;
      target.w = Math.round(size.width / sf);
      target.h = Math.round(size.height / sf);
      save();
      active()?.fit();
    })();
  }, 150);
});

new ResizeObserver(() => active()?.fit()).observe(termsEl);

// snap mini box to nearest edge after the user drags it
let moveTimer: number | undefined;
void win.onMoved(() => {
  if (mode !== "mini" || switching || ignoreMove) return;
  clearTimeout(moveTimer);
  moveTimer = window.setTimeout(() => {
    void (async () => {
      const pos = await win.outerPosition();
      const sf = await win.scaleFactor();
      const wa = await workArea();
      const snapped = snapToEdge(wa, { x: pos.x / sf, y: pos.y / sf });
      settings.miniPos = snapped;
      save();
      ignoreMove = true;
      await win.setPosition(new LogicalPosition(snapped.x, snapped.y));
      setTimeout(() => (ignoreMove = false), 300);
    })();
  }, 250);
});

// mini box: click opens centered, hover peeks, drag moves
let downAt: { x: number; y: number } | null = null;
let dragged = false;
let hoverTimer: number | undefined;

miniEl.addEventListener("mouseenter", () => {
  if (!settings.hoverPeek) return;
  clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => void setMode("quick", { peek: true }), 250);
});
miniEl.addEventListener("mouseleave", () => clearTimeout(hoverTimer));
miniEl.addEventListener("mousedown", (e) => {
  clearTimeout(hoverTimer);
  downAt = { x: e.screenX, y: e.screenY };
  dragged = false;
});
miniEl.addEventListener("mousemove", (e) => {
  if (!downAt || dragged) return;
  if (Math.hypot(e.screenX - downAt.x, e.screenY - downAt.y) > 5) {
    dragged = true;
    void win.startDragging();
  }
});
miniEl.addEventListener("mouseup", () => {
  clearTimeout(hoverTimer);
  if (downAt && !dragged) void setMode(settings.defaultView);
  downAt = null;
});

// ---------- auto-hide ----------

let lastActivity = Date.now() + 3000; // grace period after launch
const bump = () => (lastActivity = Date.now());

// clicking or typing in a hover-peeked window makes it a normal sticky window
function promotePeek(): void {
  if (!peek) return;
  peek = false;
  void win.setAlwaysOnTop(settings.alwaysOnTop);
  void win.setFocus();
}

document.addEventListener("mousemove", bump);
document.addEventListener("mousedown", () => {
  bump();
  promotePeek();
});
document.addEventListener(
  "keydown",
  () => {
    bump();
    promotePeek();
  },
  true,
);

// Poll the OS cursor position instead of relying on mouseleave/focus events,
// which are unreliable in WKWebView.
async function mouseIsOver(): Promise<boolean> {
  const [c, p, s] = await Promise.all([cursorPosition(), win.outerPosition(), win.outerSize()]);
  return c.x >= p.x && c.x <= p.x + s.width && c.y >= p.y && c.y <= p.y + s.height;
}

let ticking = false;
setInterval(() => {
  if (ticking || mode === "mini" || switching) return;
  if (
    !peek &&
    (settings.pinned ||
      !settings.autoHide ||
      !settingsEl.hidden ||
      !paletteEl.hidden ||
      !dropEl.hidden)
  )
    return;
  ticking = true;
  void (async () => {
    try {
      if (await mouseIsOver()) bump();
      else if (Date.now() - lastActivity > (peek ? 600 : settings.hideDelay)) {
        await setMode("mini");
      }
    } catch {
      // cursor position unavailable: fall back to focus heuristic
      if (!document.hasFocus() && Date.now() - lastActivity > settings.hideDelay) {
        await setMode("mini");
      }
    } finally {
      ticking = false;
    }
  })();
}, 400);

// closing the window collapses to the mini box instead of quitting
void win.onCloseRequested((e) => {
  e.preventDefault();
  void setMode("mini");
});

// ---------- drag & drop files/folders/images ----------

const shq = (p: string) => "'" + p.replace(/'/g, "'\\''") + "'";

void getCurrentWebview().onDragDropEvent((e) => {
  const t = e.payload.type;
  if (t === "enter" || t === "over") dropEl.hidden = false;
  else if (t === "leave") dropEl.hidden = true;
  else if (t === "drop") {
    dropEl.hidden = true;
    const paths = (e.payload as { paths: string[] }).paths;
    if (paths?.length) {
      active()?.paste(paths.map(shq).join(" ") + " ");
      active()?.focus();
    }
  }
});

// ---------- quick command palette ----------

function openPalette(): void {
  paletteList.innerHTML = "";
  for (const qc of settings.quickCmds.filter((c) => c.cmd.trim())) {
    const item = document.createElement("div");
    item.className = "palette-item";
    const label = document.createElement("span");
    label.textContent = qc.label || qc.cmd;
    const cmd = document.createElement("span");
    cmd.className = "cmd";
    cmd.textContent = qc.cmd;
    item.append(label, cmd);
    item.onclick = (e) => {
      closePalette();
      void (async () => {
        const target = e.metaKey ? await newTab() : active();
        target?.run(qc.cmd);
        target?.focus();
      })();
    };
    paletteList.appendChild(item);
  }
  paletteEl.hidden = false;
}
function closePalette(): void {
  paletteEl.hidden = true;
  active()?.focus();
}
paletteEl.addEventListener("mousedown", (e) => {
  if (e.target === paletteEl) closePalette();
});

// ---------- settings & actions ----------

function refreshPin(): void {
  pinBtn.classList.toggle("on", settings.pinned);
}

function toggleSettings(): void {
  if (settingsEl.hidden) {
    renderSettings($("settings-body"), {
      onFontSize: (n) => {
        for (const s of sessions) s.term.options.fontSize = n;
        active()?.fit();
      },
      onAlwaysOnTop: (b) => void win.setAlwaysOnTop(b),
    });
    settingsEl.hidden = false;
  } else {
    settingsEl.hidden = true;
    active()?.focus();
  }
}
settingsEl.addEventListener("mousedown", (e) => {
  if (e.target === settingsEl) toggleSettings();
});
$("set-close").onclick = toggleSettings;

$("newtab").onclick = () => void newTab();
$("cmdbtn").onclick = () => (paletteEl.hidden ? openPalette() : closePalette());
$("viewbtn").onclick = () => void setMode(mode === "full" ? "quick" : "full");
$("setbtn").onclick = toggleSettings;
pinBtn.onclick = () => {
  settings.pinned = !settings.pinned;
  save();
  refreshPin();
};
refreshPin();

// ---------- keyboard shortcuts ----------

document.addEventListener(
  "keydown",
  (e) => {
    if (!e.metaKey) {
      if (e.key === "Escape" && !paletteEl.hidden) closePalette();
      else if (e.key === "Escape" && !settingsEl.hidden) toggleSettings();
      return;
    }
    const k = e.key.toLowerCase();
    if (mode === "mini") {
      // shortcuts can't act on a hidden panel; expand first
      if (k === "t" || k === "k" || k === ",") {
        e.preventDefault();
        void setMode(settings.defaultView);
      }
      return;
    }
    if (k === "t") {
      e.preventDefault();
      void newTab();
    } else if (k === "w") {
      e.preventDefault();
      if (activeId) closeTab(activeId);
    } else if (k === "k") {
      e.preventDefault();
      paletteEl.hidden ? openPalette() : closePalette();
    } else if (k === ",") {
      e.preventDefault();
      toggleSettings();
    } else if (k === "=" || k === "+") {
      e.preventDefault();
      settings.fontSize = Math.min(24, settings.fontSize + 1);
      for (const s of sessions) s.term.options.fontSize = settings.fontSize;
      active()?.fit();
      save();
    } else if (k === "-") {
      e.preventDefault();
      settings.fontSize = Math.max(9, settings.fontSize - 1);
      for (const s of sessions) s.term.options.fontSize = settings.fontSize;
      active()?.fit();
      save();
    } else if (/^[1-9]$/.test(k)) {
      const s = sessions[Number(k) - 1];
      if (s) {
        e.preventDefault();
        selectTab(s.id);
      }
    }
  },
  true,
);

// ---------- boot ----------

// if the native window is mini-sized but we're booting in full mode
// (e.g. dev reload while collapsed), restore the expanded geometry
void (async () => {
  const size = await win.innerSize();
  const sf = await win.scaleFactor();
  if (size.width / sf < 200) {
    const wa = await workArea();
    const p = expandTarget(wa, settings.fullSize);
    await win.setResizable(true);
    await win.setSize(new LogicalSize(settings.fullSize.w, settings.fullSize.h));
    await win.setPosition(new LogicalPosition(p.x, p.y));
  }
})();

void newTab();
