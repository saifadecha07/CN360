/** Shared renderer factory: consistent colour pipeline, DPR cap, resize, disposal. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export interface RendererHandle {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  onResize(cb: (w: number, h: number) => void): void;
  environment(): THREE.Texture;
  dispose(): void;
}

export function createRenderer(host: HTMLElement, opts: { xr?: boolean; shadows?: boolean } = {}): RendererHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x050506, 1);
  if (opts.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  renderer.xr.enabled = !!opts.xr;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);

  const listeners: Array<(w: number, h: number) => void> = [];
  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    if (!renderer.xr.isPresenting) renderer.setSize(w, h, false);
    listeners.forEach((l) => l(w, h));
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  let env: THREE.Texture | null = null;
  let pmrem: THREE.PMREMGenerator | null = null;

  return {
    renderer,
    canvas,
    onResize(cb) { listeners.push(cb); resize(); },
    environment() {
      if (!env) {
        pmrem = new THREE.PMREMGenerator(renderer);
        const room = new RoomEnvironment();
        env = pmrem.fromScene(room, 0.04).texture;
        room.dispose();
      }
      return env;
    },
    dispose() {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      env?.dispose();
      pmrem?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

/** Dispose every geometry/material/texture under an object. */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}
