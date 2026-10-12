/** Minimal observable store. One app-wide state object, shallow-merged updates. */

export type LinkState = "disconnected" | "connecting" | "connected" | "error";
export type VideoState = "idle" | "connecting" | "live" | "unavailable" | "error";
export type RobotSource = "unverified" | "mock" | "hardware";

export type TestId = "link" | "telemetry" | "video" | "pantilt" | "motors" | "lights";
export type TestStatus = "idle" | "running" | "acknowledged" | "passed" | "failed" | "unavailable";
export interface TestResult { status: TestStatus; detail: string; at?: number }

export interface AppState {
  link: { state: LinkState; url: string; error: string | null; attempt: number; source: RobotSource; serverVersion: string };
  telemetry: { batteryV: number | null; lastStatusAt: number | null; ackSeq: number | null; sentSeq: number };
  video: { state: VideoState; url: string; error: string | null };
  control: {
    headLink: boolean;
    driveArmed: boolean;
    speedMode: 1 | 2;
    brightness: number;
    visionMode: 0 | 1;
    head: { yaw: number; pitch: number; roll: number };
    drive: { linear: number; angular: number };
  };
  tests: Record<TestId, TestResult>;
}

type Listener = (s: AppState, prev: AppState) => void;

export function initialState(): AppState {
  const idle = (detail: string): TestResult => ({ status: "idle", detail });
  return {
    link: { state: "disconnected", url: "", error: null, attempt: 0, source: "unverified", serverVersion: "" },
    telemetry: { batteryV: null, lastStatusAt: null, ackSeq: null, sentSeq: 0 },
    video: { state: "idle", url: "", error: null },
    control: {
      headLink: false,
      driveArmed: false,
      speedMode: 1,
      brightness: 0,
      visionMode: 0,
      head: { yaw: 0, pitch: 0, roll: 0 },
      drive: { linear: 0, angular: 0 },
    },
    tests: {
      link: idle("Not checked"),
      telemetry: idle("Waiting for STATUS"),
      video: idle("Not checked"),
      pantilt: idle("Not run"),
      motors: idle("Not run"),
      lights: idle("Not run"),
    },
  };
}

export class Store {
  private s: AppState;
  private listeners = new Set<Listener>();
  constructor(s: AppState = initialState()) { this.s = s; }

  get state(): AppState { return this.s; }

  /** Update one top-level slice by shallow merge. */
  patch<K extends keyof AppState>(key: K, value: Partial<AppState[K]>): void {
    const prev = this.s;
    this.s = { ...prev, [key]: { ...prev[key], ...value } };
    this.listeners.forEach((l) => l(this.s, prev));
  }

  setTest(id: TestId, result: TestResult): void {
    this.patch("tests", { [id]: { ...result, at: Date.now() } } as Partial<AppState["tests"]>);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const store = new Store();
