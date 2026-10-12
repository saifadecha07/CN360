/** Hash router with cross-fade transitions. Each screen owns mount/unmount and must release GPU/listeners. */

export interface Screen {
  mount(root: HTMLElement, params: URLSearchParams): void | Promise<void>;
  unmount(): void;
}
export type ScreenFactory = () => Screen;

export const ROUTES = { landing: "#/", command: "#/command", lobby: "#/lobby", immersive: "#/immersive" } as const;

export function navigate(hash: string): void {
  if (location.hash === hash) return;
  location.hash = hash;
}

export function parseHash(hash: string): { path: string; params: URLSearchParams } {
  const raw = hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  return { path: path || "/", params: new URLSearchParams(query) };
}

export function startRouter(container: HTMLElement, table: Record<string, ScreenFactory>): void {
  let current: { screen: Screen; el: HTMLElement } | null = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const go = async () => {
    const { path, params } = parseHash(location.hash);
    const factory = table[path] ?? table["/"];
    const prev = current;
    const el = document.createElement("div");
    el.className = "screen";
    container.append(el);
    const screen = factory();
    current = { screen, el };

    if (prev) {
      prev.screen.unmount();
      prev.el.classList.add("is-out");
      prev.el.setAttribute("aria-hidden", "true");
      setTimeout(() => prev.el.remove(), reduced ? 0 : 380);
    }
    try {
      await screen.mount(el, params);
    } catch (e) {
      console.error(e);
      el.innerHTML = "";
      el.append(Object.assign(document.createElement("div"), {
        className: "fallback",
        textContent: `This screen failed to load: ${e instanceof Error ? e.message : e}`,
      }));
    }
    requestAnimationFrame(() => el.classList.add("is-in"));
    const target = el.querySelector<HTMLElement>("[data-autofocus]") ?? el.querySelector<HTMLElement>("h1");
    if (target && !target.matches("button, a, input") && !target.hasAttribute("tabindex")) target.tabIndex = -1;
    target?.focus({ preventScroll: true });
  };

  window.addEventListener("hashchange", go);
  void go();
}
