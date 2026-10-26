/**
 * Desktop driving & lighting keys (plan.md Phase 2):
 * WASD drive · Shift high-torque · L light on/off · [ ] dim.
 * Drive keys only take effect while driving is armed.
 */
import type { Store } from "../app/store";

export function bindKeyboard(store: Store, extra: Record<string, () => void> = {}): () => void {
  const held = new Set<string>();
  const isTyping = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

  const updateDrive = () => {
    const c = store.state.control;
    const linear = (held.has("w") ? 1 : 0) - (held.has("s") ? 1 : 0);
    const angular = (held.has("d") ? 1 : 0) - (held.has("a") ? 1 : 0);
    const scale = c.speedMode === 2 ? 1 : 0.6;
    store.patch("control", { drive: { linear: linear * scale, angular: angular * scale * 0.8 } });
  };

  const down = (e: KeyboardEvent) => {
    if (isTyping(e) || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if ("wasd".includes(k) && k.length === 1) { held.add(k); updateDrive(); return; }
    if (e.key === "Shift") { store.patch("control", { speedMode: 2 }); updateDrive(); return; }
    const c = store.state.control;
    if (k === "l") store.patch("control", { lightOn: !c.lightOn });
    else if (k === "[") store.patch("control", { lightLevel: Math.max(10, c.lightLevel - 10) });
    else if (k === "]") store.patch("control", { lightLevel: Math.min(100, c.lightLevel + 10) });
    else if (extra[k]) extra[k]();
  };
  const up = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (held.delete(k)) updateDrive();
    if (e.key === "Shift") { store.patch("control", { speedMode: 1 }); updateDrive(); }
  };
  const blur = () => { held.clear(); updateDrive(); };

  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", blur);
    blur();
  };
}
