export type QuickCmd = { label: string; cmd: string };

export type Settings = {
  pinned: boolean;
  autoHide: boolean;
  hideDelay: number; // ms
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

export function renderSettings(el: HTMLElement, hooks: Hooks): void {
  el.innerHTML = "";

  const section = (title: string) => {
    const h = document.createElement("h3");
    h.textContent = title;
    el.appendChild(h);
  };

  const row = (label: string, control: HTMLElement, extra?: HTMLElement) => {
    const div = document.createElement("div");
    div.className = "set-row";
    const lab = document.createElement("label");
    lab.textContent = label;
    div.append(lab, control);
    if (extra) div.appendChild(extra);
    el.appendChild(div);
    return div;
  };

  const checkbox = (value: boolean, onChange: (b: boolean) => void) => {
    const c = document.createElement("input");
    c.type = "checkbox";
    c.checked = value;
    c.onchange = () => { onChange(c.checked); save(); };
    return c;
  };

  section("Behavior");

  row("Auto-hide when mouse away", checkbox(settings.autoHide, (b) => (settings.autoHide = b)));

  const delayVal = document.createElement("span");
  delayVal.className = "set-val";
  delayVal.textContent = `${(settings.hideDelay / 1000).toFixed(1)}s`;
  const delay = document.createElement("input");
  delay.type = "range";
  delay.min = "500";
  delay.max = "10000";
  delay.step = "250";
  delay.value = String(settings.hideDelay);
  delay.oninput = () => {
    settings.hideDelay = Number(delay.value);
    delayVal.textContent = `${(settings.hideDelay / 1000).toFixed(1)}s`;
    save();
  };
  row("Hide delay", delay, delayVal);

  const view = document.createElement("select");
  for (const [v, t] of [["quick", "Quick view"], ["full", "Large popup"]]) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    view.appendChild(o);
  }
  view.value = settings.defaultView;
  view.onchange = () => { settings.defaultView = view.value as "quick" | "full"; save(); };
  row("Open from icon as", view);

  row("Always on top", checkbox(settings.alwaysOnTop, (b) => {
    settings.alwaysOnTop = b;
    hooks.onAlwaysOnTop(b);
  }));

  section("Terminal");

  const font = document.createElement("input");
  font.type = "number";
  font.min = "9";
  font.max = "24";
  font.value = String(settings.fontSize);
  font.onchange = () => {
    settings.fontSize = Math.min(24, Math.max(9, Number(font.value) || 13));
    font.value = String(settings.fontSize);
    hooks.onFontSize(settings.fontSize);
    save();
  };
  row("Font size", font);

  section("Quick commands");

  const list = document.createElement("div");
  el.appendChild(list);

  const renderCmds = () => {
    list.innerHTML = "";
    settings.quickCmds.forEach((qc, i) => {
      const r = document.createElement("div");
      r.className = "qc-row";
      const label = document.createElement("input");
      label.className = "qc-label";
      label.value = qc.label;
      label.placeholder = "Label";
      label.onchange = () => { qc.label = label.value; save(); };
      const cmd = document.createElement("input");
      cmd.className = "qc-cmd";
      cmd.value = qc.cmd;
      cmd.placeholder = "command";
      cmd.onchange = () => { qc.cmd = cmd.value; save(); };
      const del = document.createElement("button");
      del.textContent = "×";
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

  const add = document.createElement("button");
  add.id = "qc-add";
  add.textContent = "+ Add command";
  add.onclick = () => {
    settings.quickCmds.push({ label: "", cmd: "" });
    save();
    renderCmds();
  };
  el.appendChild(add);
}
