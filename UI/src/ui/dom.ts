/** Tiny DOM helpers. No framework: screens build DOM once and patch text on state changes. */

type Attrs = Record<string, string | number | boolean | EventListener | undefined | null>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = String(v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export type Tone = "ok" | "warn" | "err" | "idle" | "sim";

/** A status pill whose tone and text can be updated in place. */
export function pill(text = "", tone: Tone = "idle") {
  const label = h("span", {}, text);
  const el = h("span", { class: `pill tone-${tone}`, role: "status" }, h("span", { class: "dot", "aria-hidden": "true" }), label);
  return {
    el,
    set(t: string, tn: Tone) {
      setText(label, t);
      const cls = `pill tone-${tn}`;
      if (el.className !== cls) el.className = cls;
    },
  };
}

/** Coalesce many store updates into one DOM patch per animation frame. */
export function frameThrottle(fn: () => void): () => void {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(); });
  };
}

export function fmtAge(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
