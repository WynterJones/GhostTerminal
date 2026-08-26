export type QuickCmd = { label: string; cmd: string };

export type Settings = {
  pinned: boolean;
  autoHide: boolean;
  hideDelay: number; // ms
  hoverPeek: boolean;
  defaultView: "quick" | "full";
  alwaysOnTop: boolean;
  fontSize: number;
  quickCmds: QuickCmd[];
  miniPos: { x: number; y: number } | null;
  fullSize: { w: number; h: number };
  quickSize: { w: number; h: number };
};

const DEFAULTS: Settings = {
  pinned: false,
  autoHide: true,
  hideDelay: 1500,
  hoverPeek: true,
  defaultView: "quick",
  alwaysOnTop: true,
  fontSize: 13,
  quickCmds: [
    { label: "Claude Code", cmd: "claude" },
    { label: "Codex", cmd: "codex" },
    { label: "Gemini", cmd: "gemini" },
  ],
  miniPos: null,
  fullSize: { w: 1000, h: 660 },
  quickSize: { w: 560, h: 400 },
};

const KEY = "commandpanel.settings";

export const settings: Settings = load();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

type Hooks = {
  onFontSize: (n: number) => void;
  onAlwaysOnTop: (b: boolean) => void;
};

// ---------- controls ----------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function toggle(value: boolean, onChange: (b: boolean) => void): HTMLElement {
  const wrap = el("label", "switch");
  const input = el("input");
  input.type = "checkbox";
  input.checked = value;
  input.onchange = () => {
    onChange(input.checked);
    save();
  };
  wrap.append(input, el("span", "knob"));
  return wrap;
}

function segmented(
  options: [string, string][],
  value: string,
  onChange: (v: string) => void,
): HTMLElement {
  const seg = el("div", "seg");
  const btns: HTMLButtonElement[] = [];
  for (const [v, label] of options) {
    const b = el("button", v === value ? "on" : "", label);
    b.onclick = () => {
      btns.forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      onChange(v);
      save();
    };
    btns.push(b);
    seg.appendChild(b);
  }
  return seg;
}

function stepper(
  value: number,
  min: number,
  max: number,
  onChange: (n: number) => void,
): HTMLElement {
  const wrap = el("div", "stepper");
  const minus = el("button", "", "−");
  const val = el("span", "", String(value));
  const plus = el("button", "", "+");
  let n = value;
  const set = (next: number) => {
    n = Math.min(max, Math.max(min, next));
    val.textContent = String(n);
    onChange(n);
    save();
  };
  minus.onclick = () => set(n - 1);
  plus.onclick = () => set(n + 1);
  wrap.append(minus, val, plus);
  return wrap;
}

// ---------- panel ----------

export function renderSettings(body: HTMLElement, hooks: Hooks): void {
  body.innerHTML = "";

  const section = (title: string) => {
    const card = el("div", "set-card");
    const h = el("h3", "", title);
    body.append(h, card);
    return card;
  };

  const row = (card: HTMLElement, label: string, control: HTMLElement, hint?: string) => {
    const div = el("div", "set-row");
    const left = el("div", "set-label");
    left.appendChild(el("span", "", label));
    if (hint) left.appendChild(el("span", "set-hint", hint));
    div.append(left, control);
    card.appendChild(div);
    return div;
  };

  // Behavior
  const behavior = section("Behavior");

  const delayRow = () => {
    const wrap = el("div", "slider-wrap");
    const valEl = el("span", "set-val", `${(settings.hideDelay / 1000).toFixed(1)}s`);
    const range = el("input");
    range.type = "range";
    range.min = "500";
    range.max = "10000";
    range.step = "250";
    range.value = String(settings.hideDelay);
    range.oninput = () => {
      settings.hideDelay = Number(range.value);
      valEl.textContent = `${(settings.hideDelay / 1000).toFixed(1)}s`;
      save();
    };
    wrap.append(range, valEl);
    return wrap;
  };

  row(
    behavior,
    "Auto-hide",
    toggle(settings.autoHide, (b) => (settings.autoHide = b)),
    "Collapse to icon when mouse is away",
  );
  row(behavior, "Hide delay", delayRow());
  row(
    behavior,
    "Peek on hover",
    toggle(settings.hoverPeek, (b) => (settings.hoverPeek = b)),
    "Hovering the icon shows a quick view",
  );
  row(
    behavior,
    "Open from icon as",
    segmented(
      [
        ["quick", "Quick"],
        ["full", "Large"],
      ],
      settings.defaultView,
      (v) => (settings.defaultView = v as "quick" | "full"),
    ),
  );
  row(
    behavior,
    "Always on top",
    toggle(settings.alwaysOnTop, (b) => {
      settings.alwaysOnTop = b;
      hooks.onAlwaysOnTop(b);
    }),
  );

  // Terminal
  const term = section("Terminal");
  row(
    term,
    "Font size",
    stepper(settings.fontSize, 9, 24, (n) => {
      settings.fontSize = n;
      hooks.onFontSize(n);
    }),
    "⌘+ / ⌘− also works",
  );

  // Quick commands
  const cmds = section("Quick commands");
  const list = el("div");
  cmds.appendChild(list);

  const renderCmds = () => {
    list.innerHTML = "";
    settings.quickCmds.forEach((qc, i) => {
      const r = el("div", "qc-row");
      const label = el("input", "qc-label");
      label.value = qc.label;
      label.placeholder = "Label";
      label.onchange = () => {
        qc.label = label.value;
        save();
      };
      const cmd = el("input", "qc-cmd");
      cmd.value = qc.cmd;
      cmd.placeholder = "command";
      cmd.onchange = () => {
        qc.cmd = cmd.value;
        save();
      };
      const del = el("button", "qc-del", "×");
      del.title = "Remove";
      del.onclick = () => {
        settings.quickCmds.splice(i, 1);
        save();
        renderCmds();
      };
      r.append(label, cmd, del);
      list.appendChild(r);
    });
  };
  renderCmds();

  const add = el("button", "", "+ Add command");
  add.id = "qc-add";
  add.onclick = () => {
    settings.quickCmds.push({ label: "", cmd: "" });
    save();
    renderCmds();
    (list.lastElementChild?.firstElementChild as HTMLInputElement)?.focus();
  };
  cmds.appendChild(add);
}
