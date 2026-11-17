import { Matrix4, PerspectiveCamera, Quaternion, Scene, Vector3, type Texture } from 'three';
import type { Vec3 } from '../../shared/vec3';
import { createBodies, type Bodies, type Body } from './bodies';

// Fable's rig, system half: the camera turns round the Sun at a yaw, a pitch and a distance, and
// flies to and from Luna along a log-distance path, so the zoom feels even at every scale.

const SYS = { min: 1.5e6, max: 2.4e7 };
const FLY_S = 2.6;
const ZERO = new Vector3();
const UP = new Vector3(0, 1, 0);
/** Earth's orbit, in system units: one astronomical unit. */
const AU = 1.2e6;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

export interface BodyMark {
  index: number;
  name: string;
  sub: string;
  /** CSS pixels on the canvas: the body's centre and its drawn radius. */
  x: number;
  y: number;
  r: number;
}

interface Pose {
  pos: Vector3;
  quat: Quaternion;
}

export interface SystemViewOptions {
  reducedMotion: boolean;
  glow: Texture;
  onPick(index: number | null): void;
  /** The flight down to Luna has landed: the Moon view takes over. */
  onLanded(): void;
}

export class SystemView {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 1, 1, 6e7);
  private readonly bodies: Bodies;
  private readonly luna: Body;
  private readonly s = { yaw: 0.5, pitch: 0.75, dist: 9e6 };
  private readonly t = { yaw: 0.5, pitch: 0.75, dist: 9e6 };
  private readonly pose: Pose = { pos: new Vector3(), quat: new Quaternion() };
  private readonly dest: Pose = { pos: new Vector3(), quat: new Quaternion() };
  private readonly origin = new Vector3();
  /** The Moon view's camera, relative to the Moon's centre in Moon units, and its turn. */
  private moonCam: Pose = { pos: new Vector3(0, 0, 500), quat: new Quaternion() };
  private fly: {
    u: number;
    rel0: Vector3;
    q0: Quaternion;
    down: boolean;
  } | null = null;
  private readonly m = new Matrix4();
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private width = 1;
  private height = 1;
  /** Turns Luna so the Moon view's sun lands where the Sun is. */
  private readonly lunaQuat = new Quaternion();

  constructor(private readonly o: SystemViewOptions) {
    this.bodies = createBodies(o.glow);
    this.luna = this.bodies.byId('luna');
    this.scene.add(this.bodies.root, this.camera);
  }

  setSize(w: number, h: number): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  /** Settlement lights on Luna's night side: up to four directions in the Moon's frame. */
  setLunaSites(dirs: readonly Vec3[]): void {
    const sites = this.luna.uniforms.uSites.value;
    sites.forEach((s, i) => {
      const d = dirs[i];
      if (d) s.set(d[0], d[1], d[2], 0.06);
      else s.set(0, 0, 0, 0);
    });
  }

  /** Rises from the Moon view: starts where its camera is and flies out to the whole system. */
  rise(
    moonCamPos: Vector3,
    moonCamQuat: Quaternion,
    moonRadius: number,
    days: number,
    moonSun: Vector3,
  ): void {
    this.moonCam = {
      pos: moonCamPos.clone().multiplyScalar(this.luna.radius / moonRadius),
      quat: moonCamQuat.clone(),
    };
    // Twice: Luna's drawn size depends on where the camera is, and the camera on Luna.
    for (let i = 0; i < 2; i++) {
      this.place(days);
      this.lunaQuat.setFromUnitVectors(moonSun, this.w.copy(this.luna.pos).negate().normalize());
      this.lunaPose(this.pose);
    }
    const p = this.luna.pos;
    this.s.yaw = this.t.yaw = Math.atan2(p.x, p.z) + 0.5;
    this.s.pitch = this.t.pitch = 0.75;
    this.s.dist = this.t.dist = clamp(p.length() * 4.6, SYS.min * 2, SYS.max * 0.6);
    this.startFly(false);
  }

  /** Flies down to Luna, to where the Moon view will take over. */
  dive(): void {
    if (this.fly) return;
    this.startFly(true);
  }

  /** f < 1 zooms in. At the closest, a zoom in on Luna goes down to it. */
  zoom(f: number, lunaInFocus: boolean): void {
    if (this.fly) return;
    if (f < 1 && this.t.dist <= SYS.min * 1.001 && lunaInFocus) return this.dive();
    this.t.dist = clamp(this.t.dist * f, SYS.min, SYS.max);
  }

  drag(dx: number, dy: number): void {
    if (this.fly) return;
    this.t.yaw -= dx * 0.005;
    this.t.pitch = clamp(this.t.pitch + dy * 0.004, 0.12, 1.45);
  }

  get flying(): boolean {
    return this.fly !== null;
  }

  /** 0 at the farthest view of the system to 1 at the closest, for the depth gauge. */
  gauge(): number {
    const d = this.fly ? this.pose.pos.length() : this.s.dist;
    return clamp(1 - Math.log(d / SYS.min) / Math.log(SYS.max / SYS.min), 0, 1);
  }

  /** Distance from the Sun, in astronomical units. */
  au(): number {
    return this.pose.pos.length() / AU;
  }

  /** One frame: `days` of game time, `moonSun` the Moon view's sun direction in the Moon frame. */
  update(dtMs: number, days: number, moonSun: Vector3): void {
    const dt = Math.min(0.1, dtMs / 1000);
    // Luna turns so the side lit in the Moon view faces the Sun here too.
    this.place(days);
    this.w.copy(this.luna.pos).negate().normalize();
    this.lunaQuat.setFromUnitVectors(moonSun, this.w);
    const k = 1 - Math.exp(-dt * 9);
    const kz = 1 - Math.exp(-dt * 6);
    this.s.yaw = lerp(this.s.yaw, this.t.yaw, k);
    this.s.pitch = lerp(this.s.pitch, this.t.pitch, k);
    this.s.dist = Math.exp(lerp(Math.log(this.s.dist), Math.log(this.t.dist), kz));
    if (this.fly?.down) this.lunaPose(this.dest);
    else this.systemPose(this.dest);
    if (this.fly) {
      const f = this.fly;
      f.u = Math.min(1, f.u + dt / (this.o.reducedMotion ? 0.01 : FLY_S));
      const e = f.u * f.u * (3 - 2 * f.u);
      // Turn to a world early, leave it late.
      const er = f.down ? 1 - Math.pow(1 - f.u, 3) : e;
      const anchor = this.luna.pos;
      const b = this.v.copy(this.dest.pos).sub(anchor);
      const d0 = f.rel0.length();
      const d1 = b.length();
      const from = f.rel0.clone().normalize();
      const turn = new Quaternion().slerp(
        new Quaternion().setFromUnitVectors(from, b.normalize()),
        e,
      );
      this.pose.pos
        .copy(from)
        .applyQuaternion(turn)
        .multiplyScalar(Math.exp(lerp(Math.log(d0), Math.log(d1), e)))
        .add(anchor);
      this.pose.quat.copy(f.q0).slerp(this.dest.quat, er);
      this.origin.copy(anchor);
      if (f.u >= 1) {
        this.fly = null;
        if (f.down) this.o.onLanded();
      }
    } else {
      this.pose.pos.copy(this.dest.pos);
      this.pose.quat.copy(this.dest.quat);
      this.origin.copy(ZERO);
    }
    this.bodies.root.position.copy(this.origin).negate();
    this.camera.position.copy(this.pose.pos).sub(this.origin);
    this.camera.quaternion.copy(this.pose.quat);
    this.bodies.place(this.pose.pos, this.fly ? this.luna : null);
    // The nearest surface sets the near plane.
    let surf = this.pose.pos.length() - this.bodies.star.radius * this.bodies.star.scale;
    for (const body of this.bodies.bodies)
      surf = Math.min(
        surf,
        this.v.copy(this.pose.pos).sub(body.pos).length() - body.radius * body.scale,
      );
    this.camera.near = clamp(surf * 0.1, 1, 5e4);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  /** The body under a click, by distance on screen against its drawn size; null for none. */
  pick(x: number, y: number): number | null {
    let best: number | null = null;
    let score = 1;
    for (const b of this.bodies.bodies) {
      const p = this.screen(b);
      if (!p) continue;
      const s = Math.hypot(p.x - x, p.y - y) / (Math.max(p.r, 14) + 8);
      if (s < score) {
        score = s;
        best = b.index;
      }
    }
    return best;
  }

  /** Names for every body in sight. */
  marks(): BodyMark[] {
    const out: BodyMark[] = [];
    if (this.fly) return out;
    for (const b of this.bodies.bodies) {
      const p = this.screen(b);
      if (p) out.push({ index: b.index, name: b.def.name, sub: b.def.status, ...p });
    }
    return out;
  }

  dispose(): void {
    this.bodies.dispose();
  }

  private place(days: number): void {
    this.bodies.update(days, this.lunaQuat);
    this.bodies.place(this.pose.pos, null);
  }

  private startFly(down: boolean): void {
    this.fly = {
      u: 0,
      rel0: this.pose.pos.clone().sub(this.luna.pos),
      q0: this.pose.quat.clone(),
      down,
    };
  }

  private systemPose(out: Pose): void {
    const cp = Math.cos(this.s.pitch);
    out.pos.set(
      this.s.dist * cp * Math.sin(this.s.yaw),
      this.s.dist * Math.sin(this.s.pitch),
      this.s.dist * cp * Math.cos(this.s.yaw),
    );
    out.quat.setFromRotationMatrix(this.m.lookAt(out.pos, ZERO, UP));
  }

  /** Where the Moon view's camera is, near Luna, in system units. */
  private lunaPose(out: Pose): void {
    out.pos.copy(this.moonCam.pos).applyQuaternion(this.lunaQuat).multiplyScalar(this.luna.scale);
    out.pos.add(this.luna.pos);
    out.quat.copy(this.lunaQuat).multiply(this.moonCam.quat);
  }

  private screen(b: Body): { x: number; y: number; r: number } | null {
    const at = this.v.copy(b.pos).sub(this.origin).project(this.camera);
    if (at.z > 1) return null;
    const dist = this.w.copy(this.pose.pos).sub(b.pos).length();
    const px = this.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * dist);
    return {
      x: ((at.x + 1) / 2) * this.width,
      y: ((1 - at.y) / 2) * this.height,
      r: b.radius * b.scale * px,
    };
  }
}
