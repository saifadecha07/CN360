/**
 * Procedural CN360 robot. The repo has no CAD/GLTF asset yet, so this is a
 * schematic model built from primitives at roughly the planned layout:
 * tracked chassis, front pan/tilt camera mast, LED pods, Pi + ESP32 on deck.
 * Replace with a GLTF later by keeping the same PartId → Object3D mapping.
 * Units: 1 = 10 cm. Front of the robot faces +Z.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { PartId } from "./parts";

export interface RobotModel {
  group: THREE.Group;
  /** Object to project hotspot labels from, per part. */
  anchors: Record<PartId, THREE.Object3D>;
  /** Meshes that belong to each part (for raycasting). */
  meshes: Map<THREE.Object3D, PartId>;
  setHighlight(id: PartId | null): void;
  setHead(yawDeg: number, pitchDeg: number): void;
  setLight(brightness01: number): void;
  update(dt: number): void;
}

const mats = {
  pearl: () => new THREE.MeshPhysicalMaterial({ color: 0xeeede8, roughness: 0.34, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
  graphite: () => new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.78, metalness: 0.1 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.95, metalness: 0 }),
  silver: () => new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.28, metalness: 0.9 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x050507, roughness: 0.05, metalness: 0.2, clearcoat: 1 }),
  led: () => new THREE.MeshStandardMaterial({ color: 0xf6f3ea, emissive: 0xfff6e0, emissiveIntensity: 0.05, roughness: 0.2 }),
  board: () => new THREE.MeshStandardMaterial({ color: 0x23302a, roughness: 0.6, metalness: 0.2 }),
};

const rbox = (w: number, h: number, d: number, r = 0.08) => new RoundedBoxGeometry(w, h, d, 3, r);

export function buildRobot(): RobotModel {
  const group = new THREE.Group();
  group.name = "cn360-robot";
  const meshes = new Map<THREE.Object3D, PartId>();
  const partMeshes: Record<PartId, THREE.Mesh[]> = { camera: [], pantilt: [], drive: [], lights: [], compute: [], mcu: [], power: [] };

  const add = (parent: THREE.Object3D, part: PartId, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot?: [number, number, number]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    meshes.set(m, part);
    partMeshes[part].push(m);
    return m;
  };

  // --- Chassis & power (battery bay is the rear half of the hull) ---
  add(group, "power", rbox(2.0, 0.6, 2.8, 0.18), mats.pearl(), [0, 0.78, 0]);
  add(group, "power", rbox(1.7, 0.06, 2.4, 0.03), mats.graphite(), [0, 1.1, 0]);
  add(group, "power", rbox(1.1, 0.12, 0.08, 0.03), mats.silver(), [0, 0.86, -1.41]);

  // --- Tracks ---
  for (const side of [-1, 1]) {
    add(group, "drive", rbox(0.5, 0.82, 3.2, 0.38), mats.rubber(), [side * 1.27, 0.44, 0]);
    // Sprockets at each end, idlers between — recessed into the track.
    for (const [z, r] of [[-1.2, 0.3], [-0.4, 0.2], [0.4, 0.2], [1.2, 0.3]] as const) {
      add(group, "drive", new THREE.CylinderGeometry(r, r, 0.05, 32), mats.silver(),
        [side * 1.51, 0.44, z], [0, 0, Math.PI / 2]);
    }
  }

  // --- Front LED pods ---
  for (const side of [-1, 1]) {
    add(group, "lights", rbox(0.42, 0.16, 0.08, 0.05), mats.led(), [side * 0.55, 0.8, 1.41]);
  }
  const headlight = new THREE.SpotLight(0xfff4e2, 0, 14, Math.PI / 6, 0.6, 1.4);
  headlight.position.set(0, 0.8, 1.45);
  headlight.target.position.set(0, 0.2, 6);
  group.add(headlight, headlight.target);

  // --- Compute (Pi) with heatsink fins, at the rear of the deck ---
  const pi = new THREE.Group();
  pi.position.set(0.25, 1.2, -0.75);
  group.add(pi);
  add(pi, "compute", rbox(0.95, 0.16, 0.66, 0.03), mats.board(), [0, 0, 0]);
  for (let i = 0; i < 6; i++) add(pi, "compute", new THREE.BoxGeometry(0.03, 0.14, 0.4), mats.silver(), [-0.18 + i * 0.07, 0.15, 0]);

  // --- ESP32 board ---
  const esp = new THREE.Group();
  esp.position.set(-0.6, 1.18, -0.85);
  group.add(esp);
  add(esp, "mcu", rbox(0.36, 0.06, 0.6, 0.02), mats.board(), [0, 0, 0]);
  add(esp, "mcu", new THREE.BoxGeometry(0.2, 0.05, 0.24), mats.silver(), [0, 0.05, 0.12]);

  // --- Pan/tilt mast + camera ---
  const pan = new THREE.Group();
  pan.position.set(0, 1.14, 0.55);
  group.add(pan);
  add(pan, "pantilt", new THREE.CylinderGeometry(0.3, 0.34, 0.16, 40), mats.silver(), [0, 0.08, 0]);
  add(pan, "pantilt", rbox(0.18, 0.62, 0.24, 0.05), mats.graphite(), [0, 0.46, 0]);
  for (const side of [-1, 1]) add(pan, "pantilt", rbox(0.06, 0.5, 0.3, 0.02), mats.silver(), [side * 0.42, 0.85, 0]);

  const tilt = new THREE.Group();
  tilt.position.set(0, 0.92, 0);
  pan.add(tilt);
  add(tilt, "camera", rbox(0.74, 0.42, 0.5, 0.12), mats.pearl(), [0, 0, 0]);
  add(tilt, "camera", new THREE.CylinderGeometry(0.17, 0.17, 0.06, 40), mats.silver(), [0, 0, 0.27], [Math.PI / 2, 0, 0]);
  add(tilt, "camera", new THREE.CylinderGeometry(0.12, 0.12, 0.08, 40), mats.glass(), [0, 0, 0.29], [Math.PI / 2, 0, 0]);
  for (const side of [-1, 1]) {
    add(tilt, "lights", new THREE.CylinderGeometry(0.045, 0.045, 0.04, 20), mats.led(), [side * 0.26, 0.08, 0.26], [Math.PI / 2, 0, 0]);
  }

  const anchor = (parent: THREE.Object3D, p: [number, number, number]) => {
    const o = new THREE.Object3D();
    o.position.set(...p);
    parent.add(o);
    return o;
  };
  const anchors: Record<PartId, THREE.Object3D> = {
    camera: anchor(tilt, [0, 0.3, 0.2]),
    pantilt: anchor(pan, [-0.3, 0.35, 0.15]),
    drive: anchor(group, [1.6, 0.6, 1.3]),
    lights: anchor(group, [-0.6, 0.85, 1.5]),
    compute: anchor(pi, [0.3, 0.25, 0]),
    mcu: anchor(esp, [-0.15, 0.1, -0.2]),
    power: anchor(group, [-1.0, 0.6, -1.45]),
  };

  // Highlight: lift emissive on the selected part's materials.
  const base = new Map<THREE.Mesh, { color: THREE.Color; intensity: number }>();
  for (const list of Object.values(partMeshes)) for (const m of list) {
    const mat = m.material as THREE.MeshStandardMaterial;
    base.set(m, { color: mat.emissive.clone(), intensity: mat.emissiveIntensity });
  }
  let highlighted: PartId | null = null;
  let lightLevel = 0;
  let pulse = 0;

  const target = { yaw: 0, pitch: 0 };

  return {
    group,
    anchors,
    meshes,
    setHighlight(id) { highlighted = id; pulse = 0; },
    setHead(yaw, pitch) { target.yaw = yaw; target.pitch = pitch; },
    setLight(b) { lightLevel = THREE.MathUtils.clamp(b, 0, 1); },
    update(dt) {
      // Protocol: yaw + = right, pitch + = down (Unity prototype convention).
      pan.rotation.y = THREE.MathUtils.damp(pan.rotation.y, THREE.MathUtils.degToRad(-target.yaw), 6, dt);
      tilt.rotation.x = THREE.MathUtils.damp(tilt.rotation.x, THREE.MathUtils.degToRad(target.pitch), 6, dt);
      headlight.intensity = lightLevel * 40;
      pulse += dt;
      const glow = 0.18 + 0.06 * Math.sin(pulse * 3);
      for (const [part, list] of Object.entries(partMeshes) as [PartId, THREE.Mesh[]][]) {
        for (const m of list) {
          const mat = m.material as THREE.MeshStandardMaterial;
          const b = base.get(m)!;
          if (part === highlighted) {
            mat.emissive.setRGB(0.85, 0.85, 0.82);
            mat.emissiveIntensity = glow;
          } else if (part === "lights") {
            mat.emissive.copy(b.color);
            mat.emissiveIntensity = 0.05 + lightLevel * 2.5;
          } else {
            mat.emissive.copy(b.color);
            mat.emissiveIntensity = b.intensity;
          }
        }
      }
    },
  };
}
