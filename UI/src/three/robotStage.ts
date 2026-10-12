/**
 * Studio scene that presents the robot. Used by the Command Center (passive,
 * slow turntable) and the Setup Lobby (orbit, zoom, part selection, hotspots).
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createRenderer, disposeTree, type RendererHandle } from "./renderer";
import { buildRobot, type RobotModel } from "./robotModel";
import type { PartId } from "./parts";

export interface StageOptions {
  interactive: boolean;
  autoRotate: boolean;
  onSelect?: (id: PartId | null) => void;
  /** Called each frame with screen-space positions of part anchors (px, relative to host). */
  onAnchors?: (pos: Record<PartId, { x: number; y: number; behind: boolean }>) => void;
}

export class RobotStage {
  readonly robot: RobotModel;
  private handle: RendererHandle;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private controls: OrbitControls | null = null;
  private clock = new THREE.Clock();
  private size = { w: 1, h: 1 };
  private raycaster = new THREE.Raycaster();
  private down = { x: 0, y: 0 };
  private cleanup: Array<() => void> = [];
  private focusTarget: THREE.Vector3 | null = null;

  constructor(private host: HTMLElement, private opts: StageOptions) {
    this.handle = createRenderer(host, { shadows: true });
    const { renderer } = this.handle;
    renderer.toneMappingExposure = 0.95;

    const scene = this.scene;
    scene.background = new THREE.Color(0x050506);
    scene.fog = new THREE.Fog(0x050506, 18, 42);
    scene.environment = this.handle.environment();
    scene.environmentIntensity = 0.45;

    // Key, rim and fill. Restrained: one shadow caster.
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -5;
    key.shadow.camera.right = key.shadow.camera.top = 5;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    const rim = new THREE.DirectionalLight(0xdfe6ff, 1.4);
    rim.position.set(-6, 4, -7);
    scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x0a0a0c, 0.25));

    // Floor: dark satin disc with concentric rings for scale.
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 96),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.82, metalness: 0, envMapIntensity: 0.08 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    for (const r of [2.6, 4.2, 7]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.012, 160),
        new THREE.MeshBasicMaterial({ color: 0xf2f1ee, transparent: true, opacity: r < 3 ? 0.16 : 0.07 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.002;
      scene.add(ring);
    }

    this.robot = buildRobot();
    scene.add(this.robot.group);

    this.camera.position.set(6.2, 4.2, 7.4);
    const target = new THREE.Vector3(0, 1.0, 0);
    this.camera.lookAt(target);

    if (opts.interactive) {
      const c = new OrbitControls(this.camera, this.handle.canvas);
      c.target.copy(target);
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.minDistance = 4.5;
      c.maxDistance = 18;
      c.maxPolarAngle = Math.PI * 0.47;
      c.enablePan = false;
      c.autoRotate = opts.autoRotate;
      c.autoRotateSpeed = 0.35;
      c.addEventListener("start", () => { c.autoRotate = false; this.focusTarget = null; });
      this.controls = c;
      this.bindPicking();
    }

    this.handle.onResize((w, h) => {
      this.size = { w, h };
      this.camera.aspect = w / h;
      // Keep the robot framed on narrow screens.
      this.camera.fov = w / h < 0.9 ? 46 : 32;
      this.camera.updateProjectionMatrix();
    });

    const onVis = () => (document.hidden ? this.handle.renderer.setAnimationLoop(null) : this.start());
    document.addEventListener("visibilitychange", onVis);
    this.cleanup.push(() => document.removeEventListener("visibilitychange", onVis));
    this.start();
  }

  private start(): void {
    this.clock.getDelta();
    this.handle.renderer.setAnimationLoop(() => this.frame());
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (!this.controls && this.opts.autoRotate) {
      this.robot.group.rotation.y += dt * 0.12;
    }
    if (this.controls && this.focusTarget) {
      this.controls.target.lerp(this.focusTarget, 1 - Math.exp(-dt * 4));
    }
    this.controls?.update(dt);
    this.robot.update(dt);
    this.handle.renderer.render(this.scene, this.camera);
    if (this.opts.onAnchors) this.emitAnchors();
  }

  private emitAnchors(): void {
    const out = {} as Record<PartId, { x: number; y: number; behind: boolean }>;
    const v = new THREE.Vector3();
    const center = new THREE.Vector3(0, 1, 0);
    const camDist = this.camera.position.distanceTo(center);
    for (const [id, obj] of Object.entries(this.robot.anchors) as [PartId, THREE.Object3D][]) {
      obj.getWorldPosition(v);
      const behind = v.distanceTo(this.camera.position) > camDist + 0.6;
      v.project(this.camera);
      out[id] = { x: (v.x * 0.5 + 0.5) * this.size.w, y: (-v.y * 0.5 + 0.5) * this.size.h, behind };
    }
    this.opts.onAnchors!(out);
  }

  private bindPicking(): void {
    const canvas = this.handle.canvas;
    const onDown = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObjects([...this.robot.meshes.keys()], false)[0];
      this.opts.onSelect?.(hit ? this.robot.meshes.get(hit.object) ?? null : null);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.style.cursor = "grab";
    this.cleanup.push(() => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
    });
  }

  /** Smoothly move the orbit target towards a part (or back to the robot centre). */
  focus(id: PartId | null): void {
    if (!this.controls) return;
    this.controls.autoRotate = false;
    if (!id) { this.focusTarget = new THREE.Vector3(0, 1, 0); return; }
    const p = new THREE.Vector3();
    this.robot.anchors[id].getWorldPosition(p);
    this.focusTarget = p.lerp(new THREE.Vector3(0, 1, 0), 0.5);
  }

  resetView(): void {
    this.camera.position.set(6.2, 4.2, 7.4);
    this.focus(null);
  }

  dispose(): void {
    this.cleanup.forEach((f) => f());
    this.controls?.dispose();
    disposeTree(this.scene);
    this.handle.dispose();
    this.host.replaceChildren();
  }
}
