// createShell(container, options): the whole view. It owns the renderer, the camera and the frame loop,
// and it joins the scene to the HUD. Game rules stay outside: read `on(...)` events, call the methods.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createSky } from './sky.js';
import { createBodies, SUN_STRENGTH } from './bodies.js';
import { buildColony, PATCH } from './colony.js';
import { createRig } from './rig.js';
import { createHud, TIERS } from './hud.js';
import { MINERALS } from './theme.js';
import { DEMO_SYSTEM } from './system.js';

const { lerp, clamp } = THREE.MathUtils;
const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
const WHITE = new THREE.Color(1, 1, 1);
const ORDINAL = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];
const TIER_DISTANCE = { orbit: null, region: 1900, town: 260, street: 26 };
const HINTS = {
  system: 'Drag to turn the system. Select a world, then scroll in to go there.',
  orbit: 'Scroll in to go down to the town. Drag to turn the world.',
  region: 'Scroll in. Drag to move. Right-drag to turn and tilt.',
  town: 'Select a building, a bus or a seam. Scroll in to walk the streets.',
  street: 'Select a person to walk with them. Right-drag to look up at the sky.',
};
const distanceText = (m) => (m >= 1e6 ? `${(m / 1e6).toFixed(1)} Mm` : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export function createShell(container, { system = DEMO_SYSTEM, bloom = true } = {}) {
  container.classList.add('sm-root');
  const renderer = new THREE.WebGLRenderer({ antialias: !bloom, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', `The ${system.name} system. Arrow keys move, plus and minus zoom.`);
  container.append(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, 0);
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 6e7);
  const sky = createSky(renderer), bodies = createBodies(system);
  scene.add(sky.group, bodies.root);

  // Light for the town in view. The globes light themselves in their shader with the same numbers.
  const sun = new THREE.DirectionalLight(0xffffff, 0), hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, Math.PI);
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0012; sun.shadow.normalBias = 0.6;
  Object.assign(sun.shadow.camera, { left: -540, right: 540, top: 540, bottom: -540, near: 800, far: 4200 });
  scene.add(hemi);

  let composer = null, bloomPass = null;
  if (bloom) {
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass((bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.4, 1.05)));
    composer.addPass(new OutputPass());
  }

  const home = bodies.planets.find((p) => p.def.home) || bodies.planets[0];
  const worlds = bodies.planets.map((p, i) => ({
    id: p.id, name: p.def.name, color: p.def.ore ? MINERALS[p.def.ore].color : '#a39a8c',
    note: p.def.colony ? `${p.def.colony.name}, ${p.def.colony.population.toLocaleString('en')} people` : 'No ground',
    ordinal: ORDINAL[i] || `${i + 1}th`,
  }));
  const hud = createHud(container, worlds);
  const listeners = {};
  const emit = (type, detail) => (listeners[type] || []).forEach((fn) => fn(detail));

  // ---------- state ----------
  let simT = 0, speed = 1, paused = false, last = performance.now(), raf = 0, sel = null, hover = null, tierNow = '', tagged = null;
  const v = new THREE.Vector3(), v2 = new THREE.Vector3(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), col = new THREE.Color(), col2 = new THREE.Color();
  const upW = new THREE.Vector3(), sunW = new THREE.Vector3(), town = {};
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();

  const sunCol = new THREE.Color(system.star.color).multiplyScalar(2.5), airCache = new WeakMap();
  const airColors = (a) => airCache.get(a) || airCache.set(a, { zenith: new THREE.Color(a.zenith), horizon: new THREE.Color(a.horizon), sunset: new THREE.Color(a.sunset) }).get(a);
  const colonyOf = (p) => {
    if (!p.colony && p.def.colony) { p.colony = buildColony(p); p.colony.group.visible = false; p.body.add(p.colony.group); }
    return p.colony;
  };
  const rig = createRig(camera, canvas, {
    townRadius: PATCH.town,
    onClick: (x, y, double) => select(pickAt(x, y), double),
    onHover: (x, y) => { hover = pickAt(x, y); canvas.style.cursor = hover ? 'pointer' : 'grab'; hover && (hover.sx = x, hover.sy = y); },
    diveTarget: (atLimit) => (hover?.kind === 'planet' ? hover.planet : atLimit && sel?.kind === 'planet' ? sel.planet : null),
    groundAt(p, lat, lon) {
      if (!p.colony || !p.colony.group.visible) return 0;
      p.colony.townOf(v.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)), town);
      return Math.hypot(town.x, town.z) < PATCH.solid ? p.colony.height(town.x, town.z) : 0;
    },
  });

  // Local solar time at the town (or under the camera on a world without one), 0 to 24.
  function localHour(p) {
    const s = p.uniforms.uSunL.value, lon = p.site ? Math.atan2(p.site.x, p.site.z) : rig.state.lon;
    return (((12 + ((lon - Math.atan2(s.x, s.z)) * 12) / Math.PI) % 24) + 24) % 24;
  }

  // ---------- picking ----------
  const toScreen = (world, out) => { out.copy(world).project(camera); const ok = out.z < 1; out.set((out.x * 0.5 + 0.5) * canvas.clientWidth, (-out.y * 0.5 + 0.5) * canvas.clientHeight, 0); return ok; };
  const pxPerMetre = (dist) => canvas.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist);

  function pickAt(x, y) {
    const focus = rig.state.planet, c = focus?.colony;
    if (focus && c && c.group.visible && rig.state.d < 2600) {
      let best = null, bestD = 1e9;
      // People and vehicles are picked by distance on the screen. The reach grows as they get larger.
      const near = (list, reach, far) => { if (rig.state.d < far) for (let i = 0; i < list.length; i++) { const a = list[i]; if (!toScreen(v.copy(a.pos).applyMatrix4(c.group.matrixWorld), v2)) continue; const d = Math.hypot(v2.x - x, v2.y - y - 6); if (d < Math.min(reach, 6 + reach * 0.08 * pxPerMetre(v.distanceTo(camera.position))) && d < bestD) { bestD = d; best = { kind: a.kind, item: a, index: i, planet: focus }; } } };
      near(c.walkers, 16, 420); near(c.fleet, 26, 2600);
      if (best) return best;
      raycaster.setFromCamera(ndc.set((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1), camera);
      const hit = raycaster.intersectObjects(c.pickables, false)[0];
      if (hit) { const u = hit.object.userData; return { kind: u.kind, type: u.type, item: u.items[hit.instanceId], index: hit.instanceId, mesh: hit.object, planet: focus }; }
      return null;
    }
    let best = null, bestScore = 1;
    for (const p of bodies.planets) {
      if (!toScreen(v.copy(p.pos).sub(rig.origin), v2)) continue;
      const r = Math.max(p.radius * p.scale * pxPerMetre(v.copy(rig.pose.pos).sub(p.pos).length()), 20) + 8, score = Math.hypot(v2.x - x, v2.y - y) / r;
      if (score < bestScore && (p !== focus || rig.state.d > p.radius)) { bestScore = score; best = { kind: 'planet', planet: p }; }
    }
    return best;
  }

  // Where the selection is on the screen, and how large.
  function selScreen(s, out) {
    if (s.kind === 'planet') { const ok = toScreen(v.copy(s.planet.pos).sub(rig.origin), out); out.z = Math.max(s.planet.radius * s.planet.scale * pxPerMetre(v.copy(rig.pose.pos).sub(s.planet.pos).length()) * 2 + 16, 40); return ok; }
    const c = s.planet.colony;
    let size = 2.2;
    if (s.item.pos) v.copy(s.item.pos); else { s.mesh.getMatrixAt(s.index, m4); v.setFromMatrixPosition(m4); size = s.kind === 'deposit' ? 9 : 26; }
    if (s.kind === 'bus' || s.kind === 'truck') size = 11;
    v.applyMatrix4(c.group.matrixWorld);
    const dist = v.distanceTo(camera.position), ok = toScreen(v, out);
    out.z = clamp(size * pxPerMetre(dist) * 1.15, 26, 420); out.y -= size * pxPerMetre(dist) * 0.45;
    return ok;
  }

  function sheetFor(s) {
    if (s.kind === 'planet') {
      const d = s.planet.def, w = worlds.find((x) => x.id === d.id), here = rig.state.planet === s.planet;
      const rows = [['Day', `${Math.round(d.day / 60 * 10) / 10} min at 1×`], ['Air', !d.atmosphere ? 'None' : d.atmosphere.density > 0.8 ? 'Thick' : d.atmosphere.density > 0.5 ? 'Thin' : 'Very thin'], ['Stars by day', !d.atmosphere || d.atmosphere.density < 0.74 ? 'Yes' : 'No']];
      if (d.colony) rows.push(['Town', d.colony.name], ['People', d.colony.population.toLocaleString('en')]);
      return { kind: 'planet', title: d.name, subtitle: d.blurb, rows, specimen: d.ore ? MINERALS[d.ore] : null, actions: here && !d.colony ? [] : [{ id: 'go', label: d.colony ? `Go ${here ? 'down ' : ''}to ${d.colony.name}` : 'Go to orbit', primary: true }] };
    }
    const data = s.planet.colony.describe(s);
    if (s.kind === 'deposit') data.specimen = MINERALS[s.planet.def.ore];
    return data;
  }

  function select(hit, double = false) {
    sel = hit;
    hud.showSheet(hit ? sheetFor(hit) : null);
    emit('select', hit);
    if (!hit) return;
    if (hit.kind === 'planet') { if (double) rig.dive(hit.planet); return; }
    if (hit.kind === 'citizen' || double) act('follow');
  }

  function act(id) {
    if (!sel) return;
    if (id === 'go') goTier('town', sel.planet.id);
    if (id === 'follow' && sel.kind !== 'planet' && sel.item.x != null) {
      const c = sel.planet.colony, it = sel.item;
      rig.follow(() => c.dirOf(it.x, it.z, v2));
      const want = sel.kind === 'citizen' ? 13 : sel.kind === 'bus' || sel.kind === 'truck' ? 45 : 120;
      if (rig.target.d > want * 1.6 || sel.kind === 'citizen') rig.setDistance(Math.min(rig.target.d, want));
    }
    emit('action', { id, selection: sel });
  }

  function goTier(tier, planetId) {
    const p = planetId ? bodies.byId(planetId) : rig.state.planet || (sel?.kind === 'planet' ? sel.planet : home);
    if (tier === 'system') return rig.rise();
    const d = p.landable ? TIER_DISTANCE[tier] ?? p.dOrbit : p.dOrbit;
    if (rig.state.planet === p) rig.setDistance(d); else rig.dive(p, tier === 'orbit' ? null : d);
  }

  hud.on('world', (id) => { const p = bodies.byId(id); select({ kind: 'planet', planet: p }); if (rig.state.planet && rig.state.planet !== p) rig.dive(p); });
  hud.on('label', (id) => { const p = bodies.byId(id.slice(2)); if (id[0] === 's') goTier('town', p.id); else select({ kind: 'planet', planet: p }, rig.state.mode === 'planet'); });
  hud.on('tier', (tier) => goTier(tier));
  hud.on('crumb', (id) => (id === 'system' ? rig.rise() : id === 'world' ? goTier('orbit') : id === 'town' ? goTier('town') : 0));
  hud.on('speed', (n) => { speed = n; paused = false; });
  hud.on('pause', () => (paused = !paused));
  hud.on('hour', (delta) => { const p = rig.state.planet; if (p) p.spin0 += (delta * Math.PI) / 12; });
  hud.on('action', act);
  hud.on('close', () => select(null));
  // A scroll over a name or a button must still zoom the view. Only the sheet keeps its own scroll.
  hud.el.addEventListener('wheel', (e) => { if (e.target.closest('.sm-sheet')) return; e.preventDefault(); canvas.dispatchEvent(new WheelEvent('wheel', e)); }, { passive: false });

  const keys = (e) => {
    if (e.target !== canvas && e.target !== document.body) return;
    const step = e.shiftKey ? 90 : 40, k = e.key;
    if (k === 'ArrowLeft' || k === 'a') rig.drag(step, 0); else if (k === 'ArrowRight' || k === 'd') rig.drag(-step, 0);
    else if (k === 'ArrowUp' || k === 'w') rig.drag(0, step); else if (k === 'ArrowDown' || k === 's') rig.drag(0, -step);
    else if (k === 'q') rig.drag(30, 0, true); else if (k === 'e') rig.drag(-30, 0, true);
    else if (k === '+' || k === '=') rig.zoom(0.8); else if (k === '-') rig.zoom(1.25);
    else if (k === ' ') paused = !paused; else if (k === 'Escape') (sel ? select(null) : rig.rise());
    else if (k >= '1' && k <= '4') { speed = [1, 2, 4, 8][k - 1]; paused = false; }
    else return;
    e.preventDefault();
  };
  addEventListener('keydown', keys);

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  // ---------- one frame ----------
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000), sdt = paused ? 0 : dt * speed;
    last = now; simT += sdt;

    bodies.update(simT);
    const prev = rig.state.planet;
    rig.update(dt);
    const st = rig.state, focus = st.planet || st.fly?.anchor || null;
    bodies.root.position.copy(rig.origin).negate();
    camera.position.copy(rig.pose.pos).sub(rig.origin); camera.quaternion.copy(rig.pose.quat);
    bodies.place(rig.pose.pos, focus);
    if (prev !== st.planet && sel) { if (sel.kind === 'planet') hud.showSheet(sheetFor(sel)); else select(null); }

    // Nearest surface sets the near plane: 0.25 m at street level, kilometres in space.
    let surf = rig.pose.pos.length() - bodies.star.radius * bodies.star.scale;
    for (const p of bodies.planets) surf = Math.min(surf, v.copy(rig.pose.pos).sub(p.pos).length() - p.radius * p.scale);
    camera.near = clamp(surf * 0.1, 0.25, 5e4); camera.updateProjectionMatrix();

    let air = null, night = 0, exposure = 1, hour = null;
    for (const p of bodies.planets) {
      const a = p.def.atmosphere, c = p === focus && p.landable ? colonyOf(p) : p.colony;
      p.uniforms.uFogD.value = 0; p.uniforms.uPatchCos.value = 2;
      if (a) { p.uniforms.uHaze.value = 0.5 * a.density; p.airUniforms.uStrength.value = a.density; }
      if (c) c.group.visible = false;
      if (p !== focus) continue;

      const rel = v.copy(rig.pose.pos).sub(p.pos), dist = rel.length(), alt = Math.max(0, dist - p.radius * p.scale);
      upW.copy(rel).divideScalar(dist); sunW.copy(rig.pose.pos).negate().normalize();
      const eCam = upW.dot(sunW);
      hour = localHour(p);
      if (a) {
        const H = a.height, inside = 1 - smooth(0.6 * H, 3 * H, alt);
        const day = smooth(-0.14, 0.12, eCam), twi = smooth(-0.3, -0.02, eCam) * (1 - smooth(0.02, 0.4, eCam));
        col.set(a.horizon).multiplyScalar(0.05 + 0.95 * day).add(col2.set(a.sunset).multiplyScalar(twi * 0.45));
        const fogD = (a.density / 1800) * (1 - smooth(0.3 * H, 2.5 * H, alt));
        scene.fog.color.copy(col); scene.fog.density = fogD;
        p.uniforms.uFogColor.value.copy(col); p.uniforms.uFogD.value = fogD;
        p.uniforms.uHaze.value = 0.5 * a.density * smooth(0.5 * H, 3 * H, alt);
        p.airUniforms.uStrength.value = a.density * smooth(0.3 * H, 2 * H, alt);
        if (inside > 0.002) air = { up: upW, sun: sunW, density: a.density * inside, horMu: -Math.sqrt(Math.max(0, 1 - (p.radius / (p.radius + alt)) ** 2)), ...airColors(a), sunCol };
      } else scene.fog.density = 0;
      exposure = lerp(1, 1.45, (1 - smooth(-0.1, 0.15, eCam)) * (1 - smooth(2000, 20000, alt)));

      if (!c) continue;
      c.group.visible = alt < p.radius * 4;
      if (!c.group.visible) continue;
      if (sun.parent !== c.group) { c.group.add(sun, sun.target); }
      const sunL = p.uniforms.uSunL.value, e = sunL.dot(p.site);
      night = 1 - smooth(-0.1, 0.12, e);
      sun.color.lerpColors(p.uniforms.uSunsetTint.value, WHITE, smooth(0, 0.25, e));
      sun.intensity = Math.PI * SUN_STRENGTH * smooth(-0.02, 0.1, e);
      sun.position.copy(sunL).applyQuaternion(q.copy(c.quat).invert()).multiplyScalar(2500);
      sun.castShadow = alt < 3500 && e > 0.03;
      hemi.color.lerpColors(p.uniforms.uAmbNight.value, p.uniforms.uAmbDay.value, smooth(-0.15, 0.2, e));
      hemi.groundColor.copy(hemi.color).multiplyScalar(0.7); // light that comes back up from the ground
      hemi.position.copy(p.site).applyQuaternion(p.quat); // its direction is "up" at the town, because the origin is the centre of this world
      p.uniforms.uPatchDir.value.copy(p.site); p.uniforms.uPatchCos.value = Math.cos(PATCH.cut / p.radius);
      p.uniforms.uSiteGlow.value = smooth(1200, 9000, alt);
      c.setDetail(st.d);
      c.update(paused ? 0 : dt * Math.min(speed, 3), night, 0.55 + 0.3 * Math.cos(((hour - 20) / 24) * Math.PI * 2));
    }
    if (!focus) scene.fog.density = 0;
    sky.update(now / 1000, renderer.getPixelRatio(), air);
    renderer.toneMappingExposure = exposure;
    if (bloomPass) bloomPass.strength = lerp(0.3, 0.42, night * (focus ? 1 : 0));

    scene.updateMatrixWorld(); camera.updateMatrixWorld(); // so names and marks sit on this frame, not the last one
    updateHud(focus, hour);
    if (prev !== st.planet) emit('focus', st.planet?.id ?? null);
    if (composer) composer.render(dt); else renderer.render(scene, camera);
  }

  function updateHud(focus, hour) {
    const st = rig.state, tier = rig.tier(), p = st.planet;
    if (tier !== tierNow) { tierNow = tier; hud.setHint(HINTS[tier]); emit('tier', tier); }
    const w = p && worlds.find((x) => x.id === p.id), townName = p?.def.colony?.name, low = p && tier !== 'orbit' && townName;
    hud.setPlace({
      crumbs: [{ id: 'system', label: `${system.name} system` }, ...(p ? [{ id: 'world', label: p.def.name }] : []), ...(low ? [{ id: 'town', label: townName }] : [])],
      title: low ? townName : p ? p.def.name : `${system.name} system`,
      sub: low ? `${p.def.colony.population.toLocaleString('en')} people on ${p.def.name}.` : p ? p.def.blurb : `${worlds.length} worlds. ${worlds.filter((x) => x.note !== 'No ground').length} of them have a town.`,
      worldId: sel?.kind === 'planet' ? sel.planet.id : p?.id, showWorlds: !p,
    });
    hud.setOre(MINERALS[(p || home).def.ore]?.color || '#a39a8c');
    hud.setGauge(st.gauge, distanceText(p ? st.d : st.dist), !!p);
    const clockLabel = p ? `Local time at ${townName || p.def.name}` : `${system.name} system time`;
    const hh = hour == null ? null : `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
    hud.setClock({ value: p && hh ? hh : `Cycle ${214 + Math.floor(simT / home.def.day)}`, label: clockLabel, hour: p ? hour : null, speed, paused });

    // Names in the scene.
    const sysView = !p || st.fly;
    for (const b of bodies.planets) {
      const show = sysView && toScreen(v.copy(b.pos).sub(rig.origin), v2) && !(st.fly && b === focus);
      const r = b.radius * b.scale * pxPerMetre(v.copy(rig.pose.pos).sub(b.pos).length());
      hud.label(`w:${b.id}`, show ? { kind: 'world', x: v2.x + r + 6, y: v2.y, title: b.def.name, sub: b.def.colony ? b.def.colony.name : '' } : null);
      // The town marker shows from orbit, on the side of the world that faces the camera.
      let site = null;
      if (b === p && !st.fly && b.site && st.d > 2200) {
        v.copy(b.site).applyQuaternion(b.quat);
        const facing = v.dot(v2.copy(rig.pose.pos).sub(b.pos).normalize());
        if (facing > 0.15 && toScreen(v.multiplyScalar(b.radius).add(b.pos).sub(rig.origin), v2)) site = { kind: 'site', x: v2.x - 9, y: v2.y, title: b.def.colony.name, sub: 'Go down' };
      }
      hud.label(`s:${b.id}`, site);
    }
    const tag = hover && hover !== sel && hover.kind !== 'planet' && !st.fly ? hover : null;
    if (tag && tagged !== tag) { tagged = tag; tag.text = sheetFor(tag); }
    hud.label('hover', tag ? { kind: 'tag', x: tag.sx + 14, y: tag.sy + 18, title: tag.text.title, sub: '' } : null);
    hud.reticle(sel && (sel.kind === 'planet' || sel.planet.colony.group.visible) && selScreen(sel, v2) && !(sel.kind === 'planet' && sel.planet === p && st.d < p.radius * 3) ? { x: v2.x, y: v2.y, size: v2.z, kind: sel.kind } : null);
  }

  // Start in the morning at the home town, so the first descent has long shadows.
  bodies.update(0); bodies.place(rig.pose.pos.set(0, 5e6, 5e6), null);
  if (home.site) home.spin0 += ((7.3 - localHour(home)) * Math.PI) / 12;
  if (home.landable) colonyOf(home); // built now, so the first flight is smooth
  if (container.clientWidth > 760) select({ kind: 'planet', planet: home }); // on a phone the sheet would cover the view
  raf = requestAnimationFrame(frame);

  return {
    hud,
    // Events: 'select' (hit or null), 'focus' (planet id or null), 'tier' (name), 'action' ({ id, selection }).
    on(type, fn) { (listeners[type] ||= []).push(fn); },
    // tier: one of TIERS. planet: id, or leave out for the world in view.
    goTo({ planet, tier = 'orbit' } = {}) { goTier(tier, planet); },
    select,
    setSpeed(n) { speed = n; }, setPaused(b) { paused = b; },
    setLocalHour(h) { const p = rig.state.planet || home; p.spin0 += ((h - localHour(p)) * Math.PI) / 12; },
    get state() { const p = rig.state.planet; return { time: simT, speed, paused, tier: rig.tier(), planet: p?.id ?? null, distance: p ? rig.state.d : rig.state.dist, localHour: p ? localHour(p) : null, flying: !!rig.state.fly }; },
    tiers: TIERS, rig, renderer, scene, camera, bodies,
    dispose() { cancelAnimationFrame(raf); removeEventListener('keydown', keys); observer.disconnect(); renderer.dispose(); canvas.remove(); hud.el.remove(); },
  };
}
