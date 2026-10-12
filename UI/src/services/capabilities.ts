/** Detects what this browser can actually do. Nothing here is assumed. */

export interface Capabilities {
  webgl: boolean;
  secureContext: boolean;
  webxr: boolean;            // navigator.xr exists
  immersiveVr: boolean;      // isSessionSupported('immersive-vr') resolved true
  webrtc: boolean;
  websocket: boolean;
  gamepad: boolean;
  fullscreen: boolean;
  reducedMotion: boolean;
  likelyPico: boolean;       // user-agent hint only; never used to gate features
}

export function hasWebGL(doc: Document = document): boolean {
  try {
    const c = doc.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export async function detectCapabilities(win: Window & typeof globalThis = window): Promise<Capabilities> {
  const nav = win.navigator as Navigator & { xr?: XRSystem };
  let immersiveVr = false;
  if (nav.xr && win.isSecureContext) {
    try { immersiveVr = await nav.xr.isSessionSupported("immersive-vr"); } catch { immersiveVr = false; }
  }
  return {
    webgl: hasWebGL(win.document),
    secureContext: !!win.isSecureContext,
    webxr: !!nav.xr,
    immersiveVr,
    webrtc: typeof win.RTCPeerConnection === "function",
    websocket: typeof win.WebSocket === "function",
    gamepad: typeof nav.getGamepads === "function",
    fullscreen: !!win.document.fullscreenEnabled,
    reducedMotion: !!win.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    likelyPico: /pico/i.test(nav.userAgent),
  };
}

/** Human explanation of why immersive VR is not available, or null if it is. */
export function vrUnavailableReason(c: Capabilities): string | null {
  if (c.immersiveVr) return null;
  if (!c.webxr) return "This browser has no WebXR support. Open VEIL in PICO Browser to enter VR.";
  if (!c.secureContext) return "WebXR needs HTTPS. Open VEIL via https://<pi-ip>:8443.";
  return "WebXR is present but no VR headset is available to this browser.";
}

let cached: Promise<Capabilities> | null = null;
export const capabilities = () => (cached ??= detectCapabilities());
