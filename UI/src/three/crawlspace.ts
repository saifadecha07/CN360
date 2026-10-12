/**
 * SIMULATED preview environment: a collapsed service crawlspace seen from the
 * robot's camera height. Generated procedurally — it is not a recording and
 * the UI must always label it as simulated.
 * The viewer sits at the origin (camera height); the floor is 0.25 m below.
 */
import * as THREE from "three";

function concreteTexture(seed: number, tone: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = `rgb(${tone},${tone},${tone - 2})`;
  g.fillRect(0, 0, 256, 256);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    const v = tone + (rnd() - 0.5) * 34;
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.35})`;
    const r = rnd() * 3;
    g.fillRect(rnd() * 256, rnd() * 256, r, r);
  }
  g.strokeStyle = "rgba(0,0,0,0.35)";
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = rnd() * 256, y = rnd() * 256;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 50; y += rnd() * 30; g.lineTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function signTexture(text: string, sub: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d8d4c8"; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, 512, 40);
  g.fillStyle = "#d8d4c8"; g.font = "600 22px sans-serif"; g.fillText("SERVICE ACCESS", 20, 28);
  g.fillStyle = "#1a1a1a"; g.font = "700 96px sans-serif"; g.fillText(text, 20, 150);
  g.font = "500 28px sans-serif"; g.fillText(sub, 22, 210);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Crawlspace {
  group: THREE.Group;
  headlight: THREE.SpotLight;
  setHeadlight(brightness01: number, night: boolean): void;
}

export function buildCrawlspace(): Crawlspace {
  const group = new THREE.Group();
  const W = 1.9, FLOOR = -0.28, CEIL = 0.92, NEAR = 3, FAR = -22;
  const L = NEAR - FAR, midZ = (NEAR + FAR) / 2;

  const wallTex = concreteTexture(7, 92);
  wallTex.repeat.set(L / 1.2, 1);
  const floorTex = concreteTexture(13, 70);
  floorTex.repeat.set(2, L / 1.2);
  const wall = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.4, metalness: 0.85 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.6, metalness: 0.6 });

  const plane = (w: number, h: number, mat: THREE.Material, pos: [number, number, number], rot: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(...pos); m.rotation.set(...rot); group.add(m); return m;
  };
  plane(W, L, floorMat, [0, FLOOR, midZ], [-Math.PI / 2, 0, 0]);
  plane(W, L, wall, [0, CEIL, midZ], [Math.PI / 2, 0, 0]);
  plane(L, CEIL - FLOOR, wall, [-W / 2, (CEIL + FLOOR) / 2, midZ], [0, Math.PI / 2, 0]);
  plane(L, CEIL - FLOOR, wall, [W / 2, (CEIL + FLOOR) / 2, midZ], [0, -Math.PI / 2, 0]);
  plane(W, CEIL - FLOOR, wall, [0, (CEIL + FLOOR) / 2, NEAR], [0, Math.PI, 0]);
  plane(W, CEIL - FLOOR, darkMetal, [0, (CEIL + FLOOR) / 2, FAR], [0, 0, 0]);

  // Structural ribs every 2.4 m.
  for (let z = NEAR - 0.6; z > FAR; z -= 2.4) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.18), wall);
    rib.position.set(0, CEIL - 0.06, z); group.add(rib);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, CEIL - FLOOR, 0.18), wall);
      post.position.set(s * (W / 2 - 0.05), (CEIL + FLOOR) / 2, z); group.add(post);
    }
  }

  // Pipes and a cable tray along the ceiling corners.
  for (const [x, y, r] of [[-0.62, 0.8, 0.06], [-0.45, 0.82, 0.035], [0.7, 0.78, 0.045]] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 16), metal);
    p.rotation.x = Math.PI / 2; p.position.set(x, y, midZ); group.add(p);
  }
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, L), darkMetal);
  tray.position.set(W / 2 - 0.12, 0.55, midZ); group.add(tray);

  // Debris: fallen beam, broken slabs.
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 2.6), wall);
  beam.position.set(0.25, -0.05, -6.5); beam.rotation.set(0.18, 0.5, 0.2); group.add(beam);
  const slabs: Array<[number, number, number, number, number]> = [[-0.5, -0.2, -3.2, 0.5, 0.3], [0.55, -0.22, -9, 0.35, 1.1], [-0.3, -0.21, -12.5, 0.6, 2.4]];
  for (const [x, y, z, s, r] of slabs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, 0.1, s * 0.8), wall);
    m.position.set(x, y, z); m.rotation.set(0.1, r, 0.08); group.add(m);
  }

  const sign = plane(0.5, 0.25, new THREE.MeshStandardMaterial({ map: signTexture("B-2", "CRAWLSPACE  ·  0.9 m"), roughness: 0.6 }),
    [-W / 2 + 0.01, 0.42, -2.2], [0, Math.PI / 2, 0]);
  sign.name = "sign";

  // Emergency lights: emissive fixtures + a few real point lights (kept to 3 for headset perf).
  for (let z = -1.5, i = 0; z > FAR; z -= 4.5, i++) {
    const fx = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2b0, emissiveIntensity: i % 3 === 2 ? 0.1 : 2 }));
    fx.position.set(0, CEIL - 0.03, z); group.add(fx);
    if (i < 3 && i % 3 !== 2) {
      const pl = new THREE.PointLight(0xffd9a3, 1.6, 6, 1.6);
      pl.position.set(0, CEIL - 0.12, z); group.add(pl);
    }
  }
  group.add(new THREE.HemisphereLight(0x9ea4ad, 0x1a1714, 0.18));

  const headlight = new THREE.SpotLight(0xfff4e2, 0, 18, Math.PI / 5, 0.55, 1.2);
  headlight.position.set(0, -0.05, 0);
  headlight.target.position.set(0, -0.1, -5);

  return {
    group,
    headlight,
    setHeadlight(b, night) {
      headlight.intensity = b * 18;
      headlight.color.set(night ? 0xd8e4d8 : 0xfff4e2);
    },
  };
}
