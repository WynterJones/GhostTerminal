import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import { killPty, resizePty, spawnPty, writePty } from "./pty";

const THEME = {
  background: "#0e0e11",
  foreground: "#d7d7de",
  cursor: "#8ab4ff",
  cursorAccent: "#0e0e11",
  selectionBackground: "#2e3a55",
  black: "#17171c",
  red: "#f87171",
  green: "#34d399",
  yellow: "#fbbf24",
  blue: "#8ab4ff",
  magenta: "#c4a7e7",
  cyan: "#67e8f9",
  white: "#d7d7de",
  brightBlack: "#4b4b57",
  brightRed: "#fca5a5",
  brightGreen: "#6ee7b7",
  brightYellow: "#fde68a",
  brightBlue: "#b3ccff",
  brightMagenta: "#ddc9f7",
  brightCyan: "#a5f3fc",
  brightWhite: "#ffffff",
};

// mix two hex colors; t = weight of `a`
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return (
    "#" +
    pa
      .map((v, i) => Math.round(v * t + pb[i] * (1 - t)).toString(16).padStart(2, "0"))
      .join("")
  );
}

let nextId = 1;

export class TermSession {
  id = nextId++;
  title = "shell";
  renamed = false;
  color: string | null = null;
  lastOutput = 0;
  el: HTMLDivElement;
  term: Terminal;
  private fitAddon = new FitAddon();

  constructor(
    container: HTMLElement,
    fontSize: number,
    public onActivity: (s: TermSession) => void,
    public onTitle: (s: TermSession) => void,
  ) {
    this.el = document.createElement("div");
    this.el.className = "term";
    container.appendChild(this.el);

    this.term = new Terminal({
      fontSize,
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
      cursorBlink: true,
      scrollback: 8000,
      macOptionIsMeta: true,
      allowProposedApi: true,
      theme: THEME,
    });
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(new Unicode11Addon());
    this.term.unicode.activeVersion = "11";
    this.term.loadAddon(new WebLinksAddon((_e, uri) => void openUrl(uri)));
    this.term.open(this.el);
    try {
      this.term.loadAddon(new WebglAddon());
    } catch {
      /* canvas fallback */
    }

    this.term.onData((data) => writePty(this.id, data));
    this.term.onResize(({ cols, rows }) => resizePty(this.id, cols, rows));
    this.term.onTitleChange((t) => {
      if (!this.renamed && t.trim()) {
        this.title = t.trim();
        this.onTitle(this);
      }
    });

    // ⌘C copies when there is a selection; everything else goes to the shell.
    this.term.attachCustomKeyEventHandler((e) => {
      if (e.type === "keydown" && e.metaKey && e.key === "c" && this.term.hasSelection()) {
        void navigator.clipboard?.writeText(this.term.getSelection());
        return false;
      }
      return true;
    });
  }

  async spawn(): Promise<void> {
    this.fitAddon.fit();
    await spawnPty(this.id, this.term.cols, this.term.rows, (bytes) => {
      this.lastOutput = Date.now();
      this.term.write(bytes);
      this.onActivity(this);
    });
  }

  // tab accent color tints this terminal's theme (bg, cursor, selection)
  setColor(c: string | null): void {
    this.color = c;
    this.term.options.theme = c
      ? {
          ...THEME,
          background: mix(c, THEME.background, 0.07),
          cursor: c,
          selectionBackground: mix(c, THEME.background, 0.35),
        }
      : { ...THEME };
  }

  fit(): void {
    if (this.el.clientWidth > 0 && this.el.clientHeight > 0) this.fitAddon.fit();
  }

  focus(): void {
    this.term.focus();
  }

  paste(text: string): void {
    this.term.paste(text);
  }

  run(cmd: string): void {
    writePty(this.id, cmd + "\r");
  }

  dispose(killProcess = true): void {
    if (killProcess) killPty(this.id);
    this.term.dispose();
    this.el.remove();
  }
}
