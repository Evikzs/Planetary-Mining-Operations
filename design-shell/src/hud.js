// The HUD: plain DOM over the canvas. It shows what it is given and reports what the user asks for.
// It holds no game state. Tokens and layout are in hud.css.

export const TIERS = ['system', 'orbit', 'region', 'town', 'street'];
const TIER_NAMES = ['System', 'Orbit', 'Region', 'Town', 'Street'];
const SPEEDS = [1, 2, 4, 8];

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const button = (cls, text, onClick) => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', onClick); return b; };

// Rock symbols of a borehole log. One layer for each scale of the view.
const CORE_SVG = `<svg viewBox="0 0 26 250" preserveAspectRatio="none" aria-hidden="true"><defs>
<pattern id="sm-p0" width="13" height="17" patternUnits="userSpaceOnUse"><circle cx="3" cy="4" r="1"/><circle cx="10" cy="12" r=".8"/></pattern>
<pattern id="sm-p1" width="26" height="16" patternUnits="userSpaceOnUse"><path d="M3 4H16M11 12H24"/></pattern>
<pattern id="sm-p2" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M-2 10L10 -2"/></pattern>
<pattern id="sm-p3" width="13" height="10" patternUnits="userSpaceOnUse"><path d="M0 .5H13M0 5.5H13M3 .5V5.5M9.5 5.5V10.5"/></pattern>
<pattern id="sm-p4" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M4.5 2.5V6.5M2.5 4.5H6.5"/></pattern></defs>
<rect class="sm-band-on" x="0" y="0" width="26" height="50"/>
${[0, 1, 2, 3, 4].map((i) => `<rect x="0" y="${i * 50}" width="26" height="50" fill="url(#sm-p${i})"/>${i ? `<line x1="0" y1="${i * 50}" x2="26" y2="${i * 50}"/>` : ''}`).join('')}</svg>`;

const DIAL_SVG = `<path d="M12 36A54 28 0 0 1 120 36"/><path class="sm-night" d="M12 36A54 12 0 0 0 120 36"/><line x1="4" y1="36" x2="128" y2="36"/><circle cx="66" cy="8" r="4.5"/>`;

export function createHud(root, worlds) {
  const hud = el('div', 'sm-hud');
  root.append(hud);
  const listeners = {}, cache = {};
  const emit = (type, detail) => (listeners[type] || []).forEach((fn) => fn(detail));
  const set = (node, key, value) => { if (cache[key] !== value) { cache[key] = value; node.textContent = value; } };

  // Where you are, and the worlds you can go to.
  const place = el('div', 'sm-place'), crumbs = el('nav', 'sm-crumbs'), title = el('h1', 'sm-title'), sub = el('p', 'sm-sub'), worldList = el('ul', 'sm-worlds');
  crumbs.setAttribute('aria-label', 'Location');
  const worldButtons = worlds.map((w) => {
    const b = button('', null, () => emit('world', w.id)), li = el('li');
    const dot = el('i', 'sm-w-dot'); dot.style.setProperty('--c', w.color);
    b.append(dot, el('span', 'sm-w-name', w.name)); b.title = w.note;
    li.append(b); worldList.append(li);
    return [w.id, b];
  });
  place.append(crumbs, title, sub, worldList);

  const ledger = el('ul', 'sm-ledger');
  ledger.setAttribute('aria-label', 'Stock');
  const ledgerRows = {};

  // Depth gauge.
  const gauge = el('div', 'sm-gauge'), core = el('div', 'sm-core'), cage = el('div', 'sm-cage'), tiers = el('div', 'sm-tiers'), alt = el('div', 'sm-alt');
  core.innerHTML = CORE_SVG; core.append(cage);
  const bandOn = core.querySelector('.sm-band-on');
  const tierButtons = TIER_NAMES.map((name, i) => { const b = button('', name, () => emit('tier', TIERS[i])); tiers.append(b); return b; });
  const altLabel = el('span', '', 'From the ground '), altValue = el('b');
  alt.append(altLabel, altValue);
  gauge.append(core, tiers, alt);

  const sheet = el('aside', 'sm-sheet');
  sheet.hidden = true; sheet.setAttribute('aria-live', 'polite');

  // Time.
  const clock = el('div', 'sm-clock'), time = el('div', 'sm-time'), timeValue = el('b'), timeLabel = el('span'), speed = el('div', 'sm-speed');
  const dial = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  dial.setAttribute('class', 'sm-dial'); dial.setAttribute('viewBox', '0 0 132 52'); dial.innerHTML = DIAL_SVG;
  dial.setAttribute('role', 'slider'); dial.setAttribute('tabindex', '0'); dial.setAttribute('aria-label', 'Time of day. Drag to change it.');
  const sunDot = dial.querySelector('circle');
  let dialX = null;
  dial.addEventListener('pointerdown', (e) => { dial.setPointerCapture(e.pointerId); dialX = e.clientX; });
  dial.addEventListener('pointermove', (e) => { if (dialX == null) return; emit('hour', ((e.clientX - dialX) * 12) / 108); dialX = e.clientX; });
  dial.addEventListener('pointerup', () => (dialX = null));
  dial.addEventListener('pointercancel', () => (dialX = null));
  dial.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { emit('hour', e.key === 'ArrowRight' ? 0.5 : -0.5); e.preventDefault(); e.stopPropagation(); } });
  const pause = button('sm-btn', 'Pause', () => emit('pause'));
  const speedButtons = SPEEDS.map((n) => { const b = button('sm-btn', `${n}×`, () => emit('speed', n)); b.setAttribute('aria-label', `Speed ${n}`); return b; });
  speed.append(pause, ...speedButtons);
  time.append(timeValue, timeLabel);
  clock.append(dial, time, speed);

  const hint = el('p', 'sm-hint'), log = el('ul', 'sm-log'), labels = el('div', 'sm-labels'), reticle = el('div', 'sm-reticle');
  log.setAttribute('aria-label', 'Shift log');
  reticle.hidden = true;
  labels.append(reticle);
  hud.append(labels, place, ledger, gauge, sheet, clock, hint, log);
  const labelNodes = new Map();

  return {
    el: hud,
    on(type, fn) { (listeners[type] ||= []).push(fn); },

    // crumbs: [{ id, label }]. The last one is where you are.
    setPlace({ crumbs: list, title: t, sub: s, worldId, showWorlds }) {
      const key = list.map((c) => c.label).join('/');
      if (cache.crumbs !== key) { cache.crumbs = key; crumbs.replaceChildren(...list.map((c) => button('', c.label, () => emit('crumb', c.id)))); }
      set(title, 'title', t); set(sub, 'sub', s);
      worldList.hidden = !showWorlds;
      for (const [id, b] of worldButtons) b.setAttribute('aria-current', String(id === worldId));
    },
    // rows: [{ id, label, value, unit, rate, gem }]. rate is text with a sign, or null.
    setLedger(rows) {
      for (const r of rows) {
        let n = ledgerRows[r.id];
        if (!n) {
          const li = el('li'), key = el('span', 'sm-l-key'), val = el('span', 'sm-l-val'), unit = el('small'), num = document.createTextNode(''), rate = el('span', 'sm-l-rate');
          if (r.gem) key.append(el('i', 'sm-gem'));
          key.append(r.label); val.append(num, unit); li.append(key, val, rate); ledger.append(li);
          n = ledgerRows[r.id] = { num, unit, rate };
        }
        if (n.num.data !== r.value) n.num.data = r.value;
        set(n.unit, `lu${r.id}`, r.unit || ''); set(n.rate, `lr${r.id}`, r.rate || '');
        n.rate.toggleAttribute('data-down', !!r.rate && r.rate.startsWith('−'));
      }
    },
    // pos: 0 (far system) to 5 (street). readout: text for the distance.
    setGauge(pos, readout, fromGround) {
      const i = Math.min(4, Math.floor(pos));
      cage.style.top = `${(pos / 5) * 100}%`;
      if (cache.tier !== i) { cache.tier = i; bandOn.setAttribute('y', i * 50); tierButtons.forEach((b, k) => b.setAttribute('aria-current', String(k === i))); }
      set(altLabel, 'altLabel', fromGround ? 'From the ground ' : 'From the star '); set(altValue, 'alt', readout);
    },
    // data: { kind, title, subtitle, rows: [[key, value]], note, specimen: { name, formula, note }, actions: [{ id, label, primary }] } or null
    showSheet(data) {
      sheet.hidden = !data;
      if (!data) return;
      const parts = [button('sm-close', '×', () => emit('close')), el('h2', '', data.title)];
      parts[0].setAttribute('aria-label', 'Close');
      if (data.subtitle) parts.push(el('p', '', data.subtitle));
      if (data.specimen) { const sp = el('div', 'sm-specimen'), tx = el('div'); tx.append(el('b', '', `${data.specimen.name}, ${data.specimen.formula}`), el('span', '', data.specimen.note)); sp.append(el('i'), tx); parts.push(sp); }
      if (data.rows?.length) { const dl = el('dl'); for (const [k, v] of data.rows) dl.append(el('dt', '', k), el('dd', '', v)); parts.push(dl); }
      if (data.note) parts.push(el('p', 'sm-note', data.note));
      if (data.actions?.length) { const row = el('div', 'sm-actions'); for (const a of data.actions) row.append(button(`sm-btn${a.primary ? ' sm-go' : ''}`, a.label, () => emit('action', a.id))); parts.push(row); }
      sheet.replaceChildren(...parts);
    },
    // hour: 0 to 24 at the place in view, or null when no place is in view.
    setClock({ value, label, hour, speed: sp, paused }) {
      set(timeValue, 'time', value); set(timeLabel, 'timeLabel', label);
      dial.style.visibility = hour == null ? 'hidden' : 'visible';
      if (hour != null) {
        const a = ((hour - 6) / 12) * Math.PI, sn = Math.sin(a);
        sunDot.setAttribute('cx', (66 - 54 * Math.cos(a)).toFixed(1)); sunDot.setAttribute('cy', (36 - (sn >= 0 ? 28 : 12) * sn).toFixed(1));
        sunDot.toggleAttribute('data-night', sn < 0);
        dial.setAttribute('aria-valuetext', value);
      }
      const key = `${sp}${paused}`;
      if (cache.speed !== key) { cache.speed = key; set(pause, 'pause', paused ? 'Run' : 'Pause'); pause.setAttribute('aria-pressed', String(paused)); speedButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(!paused && SPEEDS[i] === sp))); }
    },
    setHint(text) { set(hint, 'hint', text); },
    setOre(color) { if (cache.ore !== color) { cache.ore = color; root.style.setProperty('--ore', color); } },
    log(text, tone) { const li = el('li', '', text); if (tone) li.dataset.tone = tone; log.append(li); while (log.children.length > 3) log.firstChild.remove(); },
    // A name in the scene. kind: 'world' and 'site' are buttons, 'tag' is not. Pass null to hide it.
    label(id, o) {
      let n = labelNodes.get(id);
      if (!o) { if (n) n.hidden = true; return; }
      if (!n) {
        n = o.kind === 'tag' ? el('div', 'sm-label') : button('sm-label', null, () => emit('label', id));
        n.dataset.kind = o.kind; n.append(el('b'), el('span')); labels.append(n); labelNodes.set(id, n);
      }
      n.hidden = false;
      if (n._t !== o.title) n.firstChild.textContent = n._t = o.title;
      if (n._s !== o.sub) n.lastChild.textContent = n._s = o.sub || '';
      n.style.transform = `translate(${o.x.toFixed(1)}px, ${o.y.toFixed(1)}px) translateY(-50%)`;
    },
    // Corner marks around the selection. Pass null to hide them.
    reticle(o) {
      reticle.hidden = !o;
      if (!o) return;
      reticle.dataset.kind = o.kind;
      reticle.style.width = reticle.style.height = `${o.size.toFixed(1)}px`;
      reticle.style.transform = `translate(${(o.x - o.size / 2).toFixed(1)}px, ${(o.y - o.size / 2).toFixed(1)}px)`;
    },
  };
}
