// The camera. One model from the whole system down to one person.
//   system mode: turn around the star.
//   planet mode: a point on the ground (lat, lon) and a distance d from it. Far away this is an orbit view; near, a street view.
// A flight between the two moves along a log-distance path, so the zoom feels even at every scale.
// The camera turns with the world it looks at: the town stays put, the sun and the stars move.
import * as THREE from 'three';
import { surfaceDir } from './bodies.js';

const { lerp, clamp } = THREE.MathUtils;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const SYS = { min: 2.4e6, max: 1.5e7 };
const ZERO = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);

// hooks: { onClick(x, y, double), onHover(x, y), diveTarget(atLimit) -> planet|null, groundAt(planet, lat, lon) -> metres, townRadius }
export function createRig(camera, dom, hooks) {
  const s = { mode: 'system', planet: null, fly: null, follow: null, yaw: 0.5, pitch: 0.75, dist: 7.4e6, lat: 0, lon: 0, d: 1, heading: 0, tilt: 0, ground: 0 };
  const t = { yaw: s.yaw, pitch: s.pitch, dist: s.dist, lat: 0, lon: 0, d: 1, heading: 0, tilt: 0 }; // where the user wants to be
  const pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }, dest = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const origin = new THREE.Vector3();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let zoomRate = 6, pendingD = null, edgeSince = 0;

  const U = new THREE.Vector3(), E = new THREE.Vector3(), N = new THREE.Vector3(), F = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(), xa = new THREE.Vector3();
  const a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), mat = new THREE.Matrix4();

  // Straight down from far away, toward the horizon when near.
  const autoTilt = (d, R) => 1.36 * (1 - smooth(Math.log(10), Math.log(R * 1.4), Math.log(d)));
  const tiltNow = () => clamp(autoTilt(s.d, s.planet.radius) + s.tilt, 0, Math.min(1.5, Math.acos(Math.min(1, 1.4 / s.d))));

  function planetPose(out) {
    const p = s.planet, tilt = tiltNow();
    surfaceDir(s.lat, s.lon, U);
    E.set(Math.cos(s.lon), 0, -Math.sin(s.lon));
    N.set(-Math.sin(s.lat) * Math.sin(s.lon), Math.cos(s.lat), -Math.sin(s.lat) * Math.cos(s.lon));
    F.copy(N).multiplyScalar(Math.cos(s.heading)).addScaledVector(E, Math.sin(s.heading));
    dir.copy(U).multiplyScalar(Math.cos(tilt)).addScaledVector(F, -Math.sin(tilt)); // from the ground point to the camera
    up.copy(F).multiplyScalar(Math.cos(tilt)).addScaledVector(U, Math.sin(tilt));
    out.pos.copy(U).multiplyScalar(p.radius + s.ground).addScaledVector(dir, s.d).applyQuaternion(p.quat).add(p.pos);
    dir.applyQuaternion(p.quat); up.applyQuaternion(p.quat); xa.crossVectors(up, dir);
    out.quat.setFromRotationMatrix(mat.makeBasis(xa, up, dir));
  }
  function systemPose(out) {
    const cp = Math.cos(s.pitch);
    out.pos.set(s.dist * cp * Math.sin(s.yaw), s.dist * Math.sin(s.pitch), s.dist * cp * Math.cos(s.yaw));
    out.quat.setFromRotationMatrix(mat.lookAt(out.pos, ZERO, Y));
  }

  function gaugeNow() {
    if (s.mode === 'system') return 1 - clamp(Math.log(s.dist / SYS.min) / Math.log(SYS.max / SYS.min), 0, 1);
    const R = s.planet.radius, stops = [s.planet.dMax, R * 0.5, 600, 60, 5], ld = Math.log(s.d);
    for (let i = 0; i < 4; i++) if (s.d > stops[i + 1] || i === 3) return 1 + i + clamp((Math.log(stops[i]) - ld) / (Math.log(stops[i]) - Math.log(stops[i + 1])), 0, 1);
  }

  function startFly(anchor) {
    s.fly = { u: 0, dur: reduced ? 0.01 : 2.6, anchor, rel0: pose.pos.clone().sub(anchor.pos), q0: pose.quat.clone(), g0: s.gauge ?? 0 };
  }

  const api = {
    state: s, target: t, pose, origin,

    update(dt) {
      const k = 1 - Math.exp(-dt * 9), kz = 1 - Math.exp(-dt * zoomRate);
      if (s.mode === 'system') {
        s.yaw = lerp(s.yaw, t.yaw, k); s.pitch = lerp(s.pitch, t.pitch, k);
        s.dist = Math.exp(lerp(Math.log(s.dist), Math.log(t.dist), kz));
        systemPose(dest);
      } else {
        const p = s.planet;
        if (s.follow) { const f = s.follow(); t.lat = Math.asin(clamp(f.y, -1, 1)); t.lon = Math.atan2(f.x, f.z); }
        if (p.site) {
          // Low down there is only detail at the town, so the ground point is kept near it.
          surfaceDir(t.lat, t.lon, U);
          // The limit is tight on the way down, so a descent from any place ends in the middle of town. It opens again near the streets.
          const ld = Math.log(t.d), reach = lerp(hooks.townRadius, 120, smooth(Math.log(500), Math.log(p.radius * 0.3), ld));
          const ang = U.angleTo(p.site), max = lerp(reach / p.radius, Math.PI, smooth(Math.log(p.radius * 0.3), Math.log(p.radius * 1.6), ld));
          if (ang > max) { U.applyQuaternion(q2.identity().slerp(q.setFromUnitVectors(U, p.site), (ang - max) / ang)); t.lat = Math.asin(clamp(U.y, -1, 1)); t.lon = Math.atan2(U.x, U.z); }
        }
        s.lat = lerp(s.lat, t.lat, k); s.lon += wrap(t.lon - s.lon) * k; s.heading += wrap(t.heading - s.heading) * k; s.tilt = lerp(s.tilt, t.tilt, k);
        s.d = Math.exp(lerp(Math.log(s.d), Math.log(t.d), kz));
        s.ground = lerp(s.ground, hooks.groundAt(p, s.lat, s.lon), k);
        planetPose(dest);
      }
      const g1 = gaugeNow();
      if (s.fly) {
        const f = s.fly;
        f.u = Math.min(1, f.u + dt / f.dur);
        const e = f.u * f.u * (3 - 2 * f.u), er = s.mode === 'planet' ? 1 - Math.pow(1 - f.u, 3) : e; // turn to a world early, leave it late
        b3.copy(dest.pos).sub(f.anchor.pos);
        const d0 = f.rel0.length(), d1 = b3.length();
        q2.identity().slerp(q.setFromUnitVectors(a3.copy(f.rel0).normalize(), b3.normalize()), e);
        pose.pos.copy(a3).applyQuaternion(q2).multiplyScalar(Math.exp(lerp(Math.log(d0), Math.log(d1), e))).add(f.anchor.pos);
        pose.quat.copy(f.q0).slerp(dest.quat, er);
        s.gauge = lerp(f.g0, g1, e);
        origin.copy(f.anchor.pos);
        if (f.u >= 1) { s.fly = null; if (pendingD && s.mode === 'planet') { t.d = pendingD; zoomRate = 1.4; } pendingD = null; }
      } else {
        pose.pos.copy(dest.pos); pose.quat.copy(dest.quat);
        s.gauge = g1;
        origin.copy(s.mode === 'planet' ? s.planet.pos : ZERO);
      }
    },

    // Fly to a world. It ends above the town. thenD: keep going down to this distance.
    dive(planet, thenD = null) {
      if (s.fly || !planet || planet === s.planet) return;
      const sun = planet.uniforms.uSunL.value;
      s.mode = 'planet'; s.planet = planet; s.follow = null;
      s.lat = t.lat = planet.site ? Math.asin(planet.site.y) : 0.3;
      s.lon = t.lon = planet.site ? Math.atan2(planet.site.x, planet.site.z) : Math.atan2(sun.x, sun.z) + 0.8;
      s.d = t.d = planet.dOrbit; s.tilt = t.tilt = s.ground = 0;
      s.heading = t.heading = planet.site ? Math.PI / 2 : 0; // east: down Main Street when the camera gets low
      pendingD = thenD;
      startFly(planet);
    },
    // Back to the view of the whole system.
    rise() {
      if (s.fly || s.mode !== 'planet') return;
      const p = s.planet;
      s.mode = 'system'; s.planet = null; s.follow = null;
      s.yaw = t.yaw = Math.atan2(p.pos.x, p.pos.z) + 0.5; s.pitch = t.pitch = 0.75; s.dist = t.dist = clamp(p.def.orbit * 4.2, 5.5e6, 1.1e7);
      startFly(p);
    },
    // f < 1 goes in. At the end of the range a second push changes the mode.
    zoom(f) {
      if (s.fly) return;
      zoomRate = 6;
      const now = performance.now(), held = now - edgeSince > 350;
      if (s.mode === 'system') {
        const atMin = t.dist <= SYS.min * 1.001;
        if (f < 1) { const p = hooks.diveTarget(atMin && held); if (p) return api.dive(p); }
        t.dist = clamp(t.dist * f, SYS.min, SYS.max);
        if (!atMin && t.dist <= SYS.min * 1.001) edgeSince = now;
      } else {
        const atMax = t.d >= s.planet.dMax * 0.999;
        if (f > 1 && atMax && held) return api.rise();
        t.d = clamp(t.d * f, s.planet.dMin, s.planet.dMax);
        if (!atMax && t.d >= s.planet.dMax * 0.999) edgeSince = now;
      }
    },
    // Pixels of pointer travel. orbit: turn and tilt in place of a pan.
    drag(dx, dy, orbit) {
      if (s.fly) return;
      if (s.mode === 'system') { t.yaw -= dx * 0.005; t.pitch = clamp(t.pitch + dy * 0.004, 0.12, 1.45); return; }
      if (orbit) {
        const auto = autoTilt(t.d, s.planet.radius);
        t.heading -= dx * 0.006; t.tilt = clamp(t.tilt - dy * 0.005, -auto, 1.5 - auto);
        return;
      }
      s.follow = null;
      const R = s.planet.radius, mpp = Math.min((2 * t.d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / dom.clientHeight, R * 0.004);
      const ch = Math.cos(t.heading), sh = Math.sin(t.heading);
      t.lon += ((-dx * ch + dy * sh) * mpp) / (R * Math.cos(t.lat));
      t.lat = clamp(t.lat + ((dx * sh + dy * ch) * mpp) / R, -1.35, 1.35);
    },
    setDistance(d, slow = true) {
      if (s.mode !== 'planet') return;
      if (s.fly) { pendingD = d; return; }
      t.d = clamp(d, s.planet.dMin, s.planet.dMax); zoomRate = slow ? 1.4 : 6;
      // A jump down from far away goes to the middle of town, not to its edge.
      const site = s.planet.site;
      if (site && !s.follow && t.d < s.planet.radius * 0.3 && surfaceDir(t.lat, t.lon, U).angleTo(site) > 120 / s.planet.radius) { t.lat = Math.asin(site.y); t.lon = Math.atan2(site.x, site.z); }
    },
    // fn returns a unit vector in the planet frame. The ground point stays on it until the user pans.
    follow(fn) { s.follow = fn; },
    tier() {
      if (s.mode === 'system') return 'system';
      return s.d > s.planet.radius * 0.5 ? 'orbit' : s.d > 600 ? 'region' : s.d > 60 ? 'town' : 'street';
    },
  };

  // ---------- input ----------
  const ptrs = new Map();
  let moved = 0, lastTap = 0, pinch = 0;
  dom.addEventListener('pointerdown', (e) => { dom.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button, mod: e.shiftKey || e.ctrlKey }); moved = 0; });
  dom.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return hooks.onHover(e.offsetX, e.offsetY);
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) api.zoom(pinch / dist);
      pinch = dist;
    } else if (moved > 4) api.drag(dx, dy, p.b === 2 || p.mod);
  });
  const end = (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId); pinch = 0;
    if (moved <= 4 && p.b === 0 && e.type === 'pointerup') { const now = performance.now(); hooks.onClick(e.offsetX, e.offsetY, now - lastTap < 320); lastTap = now; }
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);
  dom.addEventListener('wheel', (e) => { e.preventDefault(); api.zoom(Math.exp(clamp(e.deltaY * (e.deltaMode ? 30 : 1), -240, 240) * 0.002)); }, { passive: false });
  dom.addEventListener('contextmenu', (e) => e.preventDefault());

  return api;
}
