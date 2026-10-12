/** Pieces shared by the inner screens. */
import { h, pill, frameThrottle } from "../ui/dom";
import { store } from "../app/store";
import { linkStatus } from "../app/status";
import { ROUTES } from "../app/router";

/** Top bar: wordmark (→ landing), screen crumb, live robot-link status. Self-cleans when detached. */
export function topbar(crumb: string, ...extra: Node[]): HTMLElement {
  const p = pill("", "idle");
  const el = h("header", { class: "topbar" },
    h("a", { class: "wordmark-sm", href: ROUTES.landing, "aria-label": "VEIL home" }, "VEIL"),
    h("span", { class: "crumb" }, crumb),
    ...extra,
    p.el,
  );
  let seen = false;
  const render = frameThrottle(() => {
    if (!el.isConnected) { if (seen) unsub(); return; }
    seen = true;
    const l = linkStatus(store.state);
    p.set(l.text, l.tone);
  });
  const unsub = store.subscribe((s, prev) => { if (s.link !== prev.link) render(); });
  render();
  return el;
}
