/**
 * One scene for both desktop 360° viewing and WebXR immersive VR.
 *
 * Content sources (always labelled in the UI):
 *  - "simulated": procedural crawlspace (buildCrawlspace)
 *  - "recorded":  an equirectangular image the operator loads from disk
 *  - "live":      the robot camera (WebRTC <video>) on a screen that follows
 *                 the *commanded* pan/tilt direction, clamped to servo limits
 *
 * View orientation (mouse drag on desktop, head pose in XR) is converted to
 * HEAD commands by the caller via onHead().
 */
import * as THREE from "three";
import { createRenderer, disposeTree, type RendererHandle } from "./renderer";
import { buildCrawlspace, type Crawlspace } from "./crawlspace";
import { LIMITS, clamp } from "../services/protocol";
import { quatToHead, stickToDrive } from "../services/locomotion";

export type ContentSource = "simulated" | "recorded" | "live";

export interface ImmersiveCallbacks {
  onHead(h: { yaw: number; pitch: number; roll: number }): void;
  onXRChange(presenting: boolean): void;
  /** XR controller input. Drive only reported while the left grip (dead-man) is held. */
  onXRInput(i: { drive: { linear: number; angular: number } | null; toggleLight: boolean }): void;
  hudLines(): string[];
}

const DEG = Math.PI / 180;

export class ImmersiveView {
  private handle: RendererHandle;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.02, 200);
  private clock = new THREE.Clock();
  private crawl: Crawlspace | null = null;
  private recordedTex: THREE.Texture | null = null;
  private liveRoot = new THREE.Group();
  private screen: THREE.Mesh;
  private noSignal: THREE.CanvasTexture;
  private videoTex: THREE.VideoTexture | null = null;
  private hud: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; last: number };
  private look = { yaw: 0, pitch: 0 };
  private yawOffset = 0;
  private screenDir = { yaw: 0, pitch: 0 };
  private source: ContentSource = "simulated";
  private cleanup: Array<() => void> = [];
  private session: XRSession | null = null;
  private prevButtons = new Map<string, boolean>();

  constructor(private host: HTMLElement, private cb: ImmersiveCallbacks) {
    this.handle = createRenderer(host, { xr: true });
    const r = this.handle.renderer;
    r.xr.setReferenceSpaceType("local");
    r.toneMappingExposure = 1.05;
    this.scene.add(this.camera);
    this.scene.fog = new THREE.Fog(0x050506, 4, 22);

    // Live screen (16:9) placed 3 m away; follows commanded pan/tilt.
    this.noSignal = this.textTexture(["NO SIGNAL", "Waiting for robot camera"]);
    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 1.8),
      new THREE.MeshBasicMaterial({ map: this.noSignal, toneMapped: false }),
    );
    this.screen.position.set(0, 0, -3);
    const pivot = new THREE.Group();
    pivot.name = "screen-pivot";
    pivot.add(this.screen);
    this.liveRoot.add(pivot);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(30, 48, 24),
      new THREE.MeshBasicMaterial({ color: 0x0b0b0d, side: THREE.BackSide, wireframe: false }),
    );
    const grid = new THREE.Mesh(
      new THREE.SphereGeometry(29.5, 36, 18),
      new THREE.MeshBasicMaterial({ color: 0x2a2a2e, wireframe: true, transparent: true, opacity: 0.35 }),
    );
    this.liveRoot.add(shell, grid);

    // HUD panel used inside XR (HTML overlays are not visible in a headset).
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 256;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const hudMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.25),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false }),
    );
    hudMesh.renderOrder = 10;
    hudMesh.visible = false;
    this.scene.add(hudMesh);
    this.hud = { mesh: hudMesh, tex, ctx: c.getContext("2d")!, last: 0 };

    this.setSource("simulated");
    this.bindDesktopLook();

    this.handle.onResize((w, h) => {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
    r.setAnimationLoop((_t, frame) => this.frame(frame));
  }

  get canvas(): HTMLCanvasElement { return this.handle.canvas; }
  get presenting(): boolean { return this.handle.renderer.xr.isPresenting; }

  setSource(src: ContentSource, video?: HTMLVideoElement): void {
    this.source = src;
    this.scene.remove(this.liveRoot);
    if (this.crawl) this.scene.remove(this.crawl.group);
    this.scene.background = new THREE.Color(0x050506);

    if (src === "simulated") {
      if (!this.crawl) {
        this.crawl = buildCrawlspace();
        this.camera.add(this.crawl.headlight, this.crawl.headlight.target);
      }
      this.scene.add(this.crawl.group);
      this.scene.fog = new THREE.Fog(0x050506, 3, 20);
    } else if (src === "recorded" && this.recordedTex) {
      this.scene.background = this.recordedTex;
      this.scene.fog = null;
    } else if (src === "live") {
      this.scene.add(this.liveRoot);
      this.scene.fog = null;
      this.attachVideo(video ?? null);
    }
  }

  attachVideo(video: HTMLVideoElement | null): void {
    const mat = this.screen.material as THREE.MeshBasicMaterial;
    this.videoTex?.dispose();
    this.videoTex = null;
    if (video && video.srcObject) {
      this.videoTex = new THREE.VideoTexture(video);
      this.videoTex.colorSpace = THREE.SRGBColorSpace;
      mat.map = this.videoTex;
    } else {
      mat.map = this.noSignal;
    }
    mat.needsUpdate = true;
  }

  async loadEquirect(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    try {
      const tex = await new THREE.TextureLoader().loadAsync(url);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.recordedTex?.dispose();
      this.recordedTex = tex;
      this.setSource("recorded");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  setHeadlight(brightness01: number, night: boolean): void {
    this.crawl?.setHeadlight(brightness01, night);
  }

  /** Point the live screen at the commanded (already clamped) head direction. */
  setCommandedHead(yaw: number, pitch: number): void {
    this.screenDir = { yaw, pitch };
  }

  recenter(): void {
    if (this.presenting) this.yawOffset += this.viewerHead().yaw;
    else { this.look.yaw = 0; this.look.pitch = 0; }
  }

  zoom(deltaFov: number): void {
    this.camera.fov = clamp(this.camera.fov + deltaFov, 35, 95);
    this.camera.updateProjectionMatrix();
  }

  async enterXR(): Promise<void> {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) throw new Error("WebXR is not available in this browser");
    const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor"] });
    this.session = session;
    session.addEventListener("end", () => {
      this.session = null;
      this.yawOffset = 0;
      this.hud.mesh.visible = false;
      this.cb.onXRChange(false);
    });
    await this.handle.renderer.xr.setSession(session);
    this.hud.mesh.visible = true;
    this.cb.onXRChange(true);
  }

  exitXR(): void { void this.session?.end(); }

  private viewerHead(): { yaw: number; pitch: number; roll: number } {
    const q = this.presenting ? this.handle.renderer.xr.getCamera().quaternion : this.camera.quaternion;
    return quatToHead(q);
  }

  private bindDesktopLook(): void {
    const el = this.handle.canvas;
    let dragging = false, lx = 0, ly = 0;
    const down = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing"; };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const k = 0.15 * (this.camera.fov / 75);
      this.look.yaw += (e.clientX - lx) * k;   // drag right → look left (grab the world)
      this.look.pitch = clamp(this.look.pitch + (e.clientY - ly) * k, -80, 80);
      lx = e.clientX; ly = e.clientY;
    };
    const up = () => { dragging = false; el.style.cursor = "grab"; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); this.zoom(Math.sign(e.deltaY) * 4); };
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const step = 5;
      if (e.key === "ArrowLeft") this.look.yaw += step;
      else if (e.key === "ArrowRight") this.look.yaw -= step;
      else if (e.key === "ArrowUp") this.look.pitch = clamp(this.look.pitch + step, -80, 80);
      else if (e.key === "ArrowDown") this.look.pitch = clamp(this.look.pitch - step, -80, 80);
      else if (e.key === "+" || e.key === "=") this.zoom(-5);
      else if (e.key === "-") this.zoom(5);
      else return;
      e.preventDefault();
    };
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    this.cleanup.push(() => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
    });
  }

  private frame(frame?: XRFrame): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (!this.presenting) {
      this.camera.rotation.set(this.look.pitch * DEG, this.look.yaw * DEG, 0, "YXZ");
    }

    const raw = this.viewerHead();
    const head = { yaw: raw.yaw - this.yawOffset, pitch: raw.pitch, roll: raw.roll };
    this.cb.onHead(head);

    // Live screen follows commanded direction (servo limits make it stop at the edges).
    const pivot = this.screen.parent!;
    const ty = -clamp(this.screenDir.yaw, LIMITS.yaw.min, LIMITS.yaw.max) * DEG - this.yawOffset * DEG;
    const tp = -clamp(this.screenDir.pitch, LIMITS.pitch.min, LIMITS.pitch.max) * DEG;
    pivot.rotation.order = "YXZ";
    pivot.rotation.y = THREE.MathUtils.damp(pivot.rotation.y, ty, 8, dt);
    pivot.rotation.x = THREE.MathUtils.damp(pivot.rotation.x, tp, 8, dt);

    if (this.presenting) {
      this.updateHud();
      if (frame) this.readControllers(frame);
    }
    this.handle.renderer.render(this.scene, this.camera);
  }

  private updateHud(): void {
    const xrCam = this.handle.renderer.xr.getCamera();
    // Body-locked: below the line of sight, follows yaw lazily.
    const e = new THREE.Euler().setFromQuaternion(xrCam.quaternion, "YXZ");
    const m = this.hud.mesh;
    const yaw = e.y;
    const target = new THREE.Vector3(Math.sin(yaw) * -1.3, -0.55, Math.cos(yaw) * -1.3).add(xrCam.position);
    m.position.lerp(target, 0.08);
    m.lookAt(xrCam.position);

    const now = performance.now();
    if (now - this.hud.last < 500) return;
    this.hud.last = now;
    const g = this.hud.ctx;
    g.clearRect(0, 0, 1024, 256);
    g.fillStyle = "rgba(10,10,12,0.78)";
    g.beginPath(); g.roundRect(0, 0, 1024, 256, 40); g.fill();
    g.fillStyle = "#f2f1ee";
    const lines = this.cb.hudLines();
    g.font = "600 34px system-ui, sans-serif";
    g.fillText(lines[0] ?? "", 44, 70);
    g.font = "400 30px ui-monospace, monospace";
    g.fillStyle = "#b4b6bb";
    lines.slice(1, 4).forEach((l, i) => g.fillText(l, 44, 124 + i * 46));
    this.hud.tex.needsUpdate = true;
  }

  private readControllers(_frame: XRFrame): void {
    const session = this.session;
    if (!session) return;
    let drive: { linear: number; angular: number } | null = null;
    let toggleLight = false;
    for (const src of session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const edge = (i: number) => {
        const key = `${src.handedness}:${i}`;
        const now = !!gp.buttons[i]?.pressed;
        const was = this.prevButtons.get(key) ?? false;
        this.prevButtons.set(key, now);
        return now && !was;
      };
      if (src.handedness === "left") {
        // xr-standard: axes[2], axes[3] = thumbstick. buttons[1] = grip (dead-man switch).
        if (gp.buttons[1]?.pressed) drive = stickToDrive(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
        if (edge(5)) this.exitXR();            // Y button
      } else if (src.handedness === "right") {
        if (edge(4)) toggleLight = true;      // A button
        if (edge(5)) this.recenter();         // B button
      }
    }
    this.cb.onXRInput({ drive, toggleLight });
  }

  private textTexture(lines: string[]): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = 1280; c.height = 720;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0b0b0d"; g.fillRect(0, 0, 1280, 720);
    g.strokeStyle = "rgba(242,241,238,0.15)"; g.lineWidth = 2; g.strokeRect(40, 40, 1200, 640);
    g.textAlign = "center";
    g.fillStyle = "#f2f1ee"; g.font = "300 84px system-ui, sans-serif"; g.fillText(lines[0], 640, 360);
    g.fillStyle = "#85888f"; g.font = "400 34px system-ui, sans-serif"; g.fillText(lines[1] ?? "", 640, 430);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  dispose(): void {
    this.exitXR();
    this.cleanup.forEach((f) => f());
    this.videoTex?.dispose();
    this.recordedTex?.dispose();
    if (this.crawl) disposeTree(this.crawl.group);
    disposeTree(this.scene);
    this.handle.dispose();
    this.host.replaceChildren();
  }

  get currentSource(): ContentSource { return this.source; }
}
