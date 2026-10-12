/** 01 — Landing. Fast, typographic, and honest about what is actually available. */
import { h, pill, frameThrottle } from "../ui/dom";
import { store } from "../app/store";
import { linkStatus } from "../app/status";
import { navigate, ROUTES, type Screen } from "../app/router";
import { capabilities } from "../services/capabilities";

export function landingScreen(): Screen {
  let unsub = () => {};
  const timers: number[] = [];

  return {
    mount(root) {
      root.classList.add("landing");
      const linkPill = pill("Robot link", "idle");
      const renderPill = pill("Renderer · detecting", "warn");
      const vrPill = pill("Headset · detecting", "warn");
      const boot = h("ul", { class: "boot", "aria-label": "System availability" },
        h("li", {}, renderPill.el), h("li", {}, linkPill.el), h("li", {}, vrPill.el));

      const enter = h("button", { class: "btn btn--primary btn--lg", "data-autofocus": true, onclick: () => navigate(ROUTES.command) }, "ENTER VEIL");

      root.append(
        h("div", { class: "landing__horizon", "aria-hidden": "true" }),
        h("div", { class: "landing__veil", "aria-hidden": "true" }),
        h("section", { class: "landing__inner" },
          h("h1", { class: "landing__mark reveal" }, "VEIL"),
          h("p", { class: "label landing__full reveal d1" }, "Virtual Exploration & Immersive Link"),
          h("p", { class: "landing__line reveal d2" },
            "Remote presence for confined-space rescue. You don't control the robot. ",
            h("strong", {}, "You become the robot.")),
          h("div", { class: "reveal d3" }, enter),
        ),
        h("footer", { class: "landing__foot" },
          boot,
          h("span", { class: "label" }, "CN360 · Remote Presence System · v0.1"),
        ),
      );

      // Boot lines appear in sequence as each real check is evaluated.
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      [...boot.children].forEach((li, i) => {
        timers.push(window.setTimeout(() => li.classList.add("is-shown"), reduced ? 0 : 500 + i * 180));
      });

      // Warm the Command Center (and three.js) while the operator reads the landing page.
      timers.push(window.setTimeout(() => { void import("./command"); }, 1200));

      void capabilities().then((c) => {
        renderPill.set(c.webgl ? "Renderer · WebGL ready" : "Renderer · WebGL unavailable", c.webgl ? "ok" : "err");
        vrPill.set(c.immersiveVr ? "Headset · immersive VR available" : "Headset · desktop 360° mode", c.immersiveVr ? "ok" : "idle");
      });

      const render = frameThrottle(() => {
        const l = linkStatus(store.state);
        linkPill.set(`Robot link · ${l.text}`, l.tone);
      });
      render();
      unsub = store.subscribe((s, p) => { if (s.link !== p.link) render(); });
    },
    unmount() {
      unsub();
      timers.forEach(clearTimeout);
    },
  };
}
