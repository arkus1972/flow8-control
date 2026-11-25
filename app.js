/* FLOW 8 Control: Web MIDI remote for the Behringer FLOW 8.
 * MIDI map from the FLOW 8 manual (MIDI Implementation). The mixer only RECEIVES MIDI,
 * so the app keeps its own state (saved on the device) and can resend everything with "sync". */
(() => {
  'use strict';

  // ---------- Model ----------
  const CHANNELS = [
    { name: 'wokal',    num: '1',   midi: 1, gain: true,  cap: '#E8501A', mark: '#FFFFFF', glyph: 'M15 4a5 5 0 0 1 5 5v5a5 5 0 0 1-10 0V9a5 5 0 0 1 5-5zM15 24v3' },
    { name: 'chórek',   num: '2',   midi: 2, gain: true,  cap: '#2F5BEA', mark: '#FFFFFF', glyph: 'M6 15a9 9 0 1 0 18 0a9 9 0 1 0-18 0' },
    { name: 'gitara',   num: '3',   midi: 3, gain: true,  cap: '#F4F4F1', mark: '#1C1C1C', glyph: 'M5 25L15 5l10 20z' },
    { name: 'bas',      num: '4',   midi: 4, gain: true,  cap: '#1C1C1C', mark: '#FFFFFF', glyph: 'M6 6h18v18H6z' },
    { name: 'klawisze', num: '5/6', midi: 5, gain: true,  cap: '#A3A39E', mark: '#1C1C1C', glyph: 'M4 10h22M4 15h22M4 20h22' },
    { name: 'podkład',  num: '7/8', midi: 6, gain: true,  cap: '#F4F4F1', mark: '#E8501A', glyph: 'M4 15q5.5-10 11 0t11 0' },
    { name: 'telefon',  num: 'USB', midi: 7, gain: false, cap: '#2F5BEA', mark: '#FFFFFF', glyph: 'M10 4h10v22H10zM13 22h4' },
    { name: 'main',     num: 'OUT', midi: 0, gain: false, cap: '#1C1C1C', mark: '#E8501A', glyph: '', master: true }
  ];
  const BUSES = [
    { id: 'main', label: 'sala',      short: 'sala',  midi: 8,  sendCC: 7 },
    { id: 'mon1', label: 'odsłuch 1', short: 'mon 1', midi: 9,  sendCC: 14 },
    { id: 'mon2', label: 'odsłuch 2', short: 'mon 2', midi: 10, sendCC: 15 },
    { id: 'fx1',  label: 'efekt 1',   short: 'fx 1',  midi: 11, sendCC: 16 },
    { id: 'fx2',  label: 'efekt 2',   short: 'fx 2',  midi: 12, sendCC: 17 }
  ];
  const CC = { level: 7, mute: 5, solo: 6, gain: 8 };
  const GLOBAL_CH = 16;
  const STORE = 'flow8-control-v1';

  const fresh = () => ({
    theme: (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
    bus: 0, sel: 0, scene: 0,
    names: CHANNELS.map(c => c.name),
    // levels[bus][channel], 0..127 (MIDI value). Index 7 = that bus's master.
    levels: BUSES.map((b, bi) => CHANNELS.map((c, i) => (bi === 0 ? (i === 7 ? 100 : 90) : (i === 7 ? 100 : 0)))),
    gains: CHANNELS.map(() => 40),
    mutes: CHANNELS.map(() => false),
    solos: CHANNELS.map(() => false)
  });
  let S = fresh();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.levels && saved.levels.length === BUSES.length) S = Object.assign(S, saved);
  } catch (e) { /* storage unavailable: run with defaults */ }
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }, 250);
  };

  // ---------- Units ----------
  const levelDb = v => v <= 0 ? '-∞' : fmt(-70 + (v - 1) * 80 / 126);
  const gainDb = v => fmt(-20 + v * 80 / 127);
  function fmt(d) {
    const r = Math.round(d * 10) / 10;
    const s = Math.abs(r).toFixed(1).replace('.', ',');
    return (r > 0 ? '+' : r < 0 ? '-' : '') + s;
  }
  const clamp = v => Math.max(0, Math.min(127, Math.round(v)));

  // ---------- MIDI ----------
  let out = null;
  let access = null;
  const lastSent = new Map();
  function send(bytes, force) {
    if (!out) return;
    const key = bytes[0] + ':' + bytes[1];
    if (!force && bytes.length === 3 && lastSent.get(key) === bytes[2]) return;
    if (bytes.length === 3) lastSent.set(key, bytes[2]);
    try { out.send(bytes); } catch (e) { setConn('error'); }
  }
  const cc = (ch, num, val, force) => send([0xB0 + ch - 1, num, clamp(val)], force);
  const pc = (ch, prog) => send([0xC0 + ch - 1, prog], true);

  function sendLevel(i, force) {
    const bus = BUSES[S.bus];
    const v = S.levels[S.bus][i];
    if (CHANNELS[i].master) cc(bus.midi, CC.level, v, force);
    else cc(CHANNELS[i].midi, bus.sendCC, v, force);
  }
  const sendGain = (i, f) => CHANNELS[i].gain && cc(CHANNELS[i].midi, CC.gain, S.gains[i], f);
  const sendMute = (i, f) => !CHANNELS[i].master && cc(CHANNELS[i].midi, CC.mute, S.mutes[i] ? 127 : 0, f);
  const sendSolo = (i, f) => !CHANNELS[i].master && cc(CHANNELS[i].midi, CC.solo, S.solos[i] ? 127 : 0, f);

  function sendAll() {
    CHANNELS.forEach((c, i) => {
      if (c.master) {
        BUSES.forEach((b, bi) => cc(b.midi, CC.level, S.levels[bi][i], true));
      } else {
        BUSES.forEach((b, bi) => cc(c.midi, b.sendCC, S.levels[bi][i], true));
        sendGain(i, true); sendMute(i, true); sendSolo(i, true);
      }
    });
  }

  async function connect() {
    if (!navigator.requestMIDIAccess) {
      toast('Ta przeglądarka nie obsługuje MIDI. Użyj Chrome na Androidzie lub komputerze.');
      setConn('demo');
      return;
    }
    try {
      access = await navigator.requestMIDIAccess({ sysex: false });
      access.onstatechange = pickOutput;
      pickOutput();
    } catch (e) {
      toast('Brak zgody na MIDI. Zezwól w ustawieniach strony i spróbuj ponownie.');
      setConn('demo');
    }
  }
  function pickOutput() {
    const outs = access ? [...access.outputs.values()] : [];
    const flow = outs.find(o => /flow/i.test(o.name || '')) || null;
    const was = out;
    out = flow;
    if (out) {
      setConn('ok', out.name);
      if (!was) { lastSent.clear(); sendAll(); toast('Połączono z ' + out.name + '. Wysłano ustawienia.'); }
    } else {
      setConn(outs.length ? 'other' : 'demo');
    }
  }
  function setConn(state, name) {
    const led = $('#conn-led'), label = $('#conn-label');
    led.className = 'led' + (state === 'ok' ? ' ok' : state === 'demo' || state === 'other' ? ' demo' : '');
    label.textContent =
      state === 'ok' ? 'FLOW 8 połączony' :
      state === 'other' ? 'Nie widzę FLOW 8, podłącz USB' :
      state === 'error' ? 'Błąd wysyłania, podłącz ponownie' :
      access ? 'Tryb demo, podłącz mikser USB' : 'Połącz z mikserem';
  }

  // ---------- DOM helpers ----------
  const $ = s => document.querySelector(s);
  const el = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };
  const svgGlyph = d => `<svg viewBox="0 0 30 30" aria-hidden="true"><path d="${d}"/></svg>`;
  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const portrait = () => matchMedia('(orientation: portrait)').matches;

  // ---------- Build ----------
  const refs = [];
  function build() {
    const strips = $('#strips'), dots = $('#dots'), pager = $('#pager');
    CHANNELS.forEach((c, i) => {
      // display column
      const col = el('button', 'dot-col', { type: 'button', role: 'tab', 'aria-label': 'Pokaż kanał ' + S.names[i] });
      for (let k = 0; k < 12; k++) col.appendChild(el('span'));
      col.addEventListener('click', () => select(i, true));
      dots.appendChild(col);

      // strip
      const strip = el('section', 'strip', { 'aria-label': 'Kanał ' + S.names[i] });
      strip.style.setProperty('--cap', c.cap);
      strip.style.setProperty('--mark', c.mark);

      const head = el('div', 's-head');
      const num = el('span', 's-num'); num.textContent = c.num;
      const name = el('button', 's-name', { type: 'button', title: 'Stuknij dwa razy, aby zmienić nazwę' });
      name.addEventListener('dblclick', () => rename(i));
      head.append(num, name);

      const knobWrap = el('div', 's-knob' + (c.gain ? '' : ' none'));
      const knob = el('div', 'knob', { role: 'slider', tabindex: c.gain ? '0' : '-1', 'aria-valuemin': '0', 'aria-valuemax': '127' });
      const kl = el('span', 's-knob-label'); kl.textContent = 'gain';
      knobWrap.append(knob, kl);
      if (c.gain) bindKnob(knob, i);

      const keys = el('div', 's-keys');
      const mute = el('button', 'key mute' + (c.master ? ' none' : ''), { type: 'button', 'aria-pressed': 'false' });
      mute.innerHTML = c.master ? '' : svgGlyph(c.glyph);
      mute.addEventListener('click', () => { S.mutes[i] = !S.mutes[i]; sendMute(i); select(i); render(); save(); });
      const solo = el('button', 'key solo' + (c.master ? ' none' : ''), { type: 'button', 'aria-pressed': 'false' });
      solo.textContent = 'S';
      solo.addEventListener('click', () => { S.solos[i] = !S.solos[i]; sendSolo(i); select(i); render(); save(); });
      if (c.master) {
        // master strip: tap tempo instead of mute/solo (FX2 delays follow it)
        const tap = el('button', 'key tap', { type: 'button', 'aria-label': 'Tap tempo efektu' });
        tap.textContent = 'TAP';
        tap.addEventListener('click', () => { send([0x90 + GLOBAL_CH - 1, 0, 100], true); toast('Tap tempo'); });
        keys.append(tap);
      } else {
        keys.append(mute, solo);
      }

      const faderWrap = el('div', 's-fader');
      const fader = el('input', 'fader', { type: 'range', min: '0', max: '127', step: '1' });
      fader.addEventListener('input', () => { S.levels[S.bus][i] = +fader.value; sendLevel(i); select(i); render(); save(); });
      fader.addEventListener('pointerdown', () => select(i));
      const ticks = el('div', 'ticks', { 'aria-hidden': 'true' });
      // tick positions: +10, 0, -10, -30, -50, off (0 dB highlighted)
      [10, 0, -10, -30, -50, -70].forEach(db => {
        const t = el('span', db === 0 ? 'zero' : '');
        t.style.setProperty('--p', ((db + 70) * 126 / 80 + 1) / 127);
        ticks.appendChild(t);
      });
      faderWrap.append(fader, ticks);

      const val = el('div', 's-val');

      strip.append(head, knobWrap, keys, faderWrap, val);
      strips.appendChild(strip);

      const pg = el('button', '', { type: 'button', 'aria-label': 'Kanał ' + (i + 1) });
      pg.appendChild(el('span'));
      pg.addEventListener('click', () => select(i, true));
      pager.appendChild(pg);

      refs.push({ col, strip, name, knob, mute, solo, fader, val, pg });
    });

    // scenes = mixer snapshots 1..4 (global channel, program change)
    const scenes = $('#scenes');
    for (let n = 1; n <= 4; n++) {
      const b = el('button', 'scene', { type: 'button', 'aria-pressed': 'false', 'aria-label': 'Wczytaj scenę ' + n + ' z miksera' });
      b.textContent = n;
      b.addEventListener('click', () => { S.scene = n - 1; pc(GLOBAL_CH, n); render(); save(); toast('Wczytano scenę ' + n + ' w mikserze'); });
      scenes.appendChild(b);
    }

    const buses = $('#buses');
    buses.style.setProperty('--n', BUSES.length);
    BUSES.forEach((b, bi) => {
      const btn = el('button', '', { type: 'button', role: 'radio', 'aria-checked': 'false' });
      btn.textContent = b.short;
      btn.title = b.label;
      btn.addEventListener('click', () => { S.bus = bi; render(); save(); });
      buses.appendChild(btn);
    });

    $('#connect').addEventListener('click', connect);
    $('#sync').addEventListener('click', () => {
      if (!out) { toast('Najpierw połącz mikser kablem USB.'); return; }
      sendAll(); toast('Wysłano wszystkie ustawienia do miksera');
    });
    $('#theme').addEventListener('click', () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; render(); save(); });

    // keep "selected" in sync with the visible page in portrait
    let scrollTimer = 0;
    strips.addEventListener('scroll', () => {
      if (!portrait()) return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const i = Math.round(strips.scrollLeft / strips.clientWidth);
        if (i !== S.sel && i >= 0 && i < CHANNELS.length) { S.sel = i; render(); save(); }
      }, 60);
    }, { passive: true });
    window.addEventListener('resize', () => { if (portrait()) scrollToSel(false); });
  }

  function bindKnob(knob, i) {
    let startY = 0, startV = 0, active = false;
    knob.addEventListener('pointerdown', e => {
      knob.setPointerCapture(e.pointerId); active = true; startY = e.clientY; startV = S.gains[i]; select(i);
    });
    knob.addEventListener('pointermove', e => {
      if (!active) return;
      const scale = portrait() ? 0.5 : 0.8;
      setGain(i, startV + (startY - e.clientY) * scale);
    });
    const end = () => { active = false; };
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
    knob.addEventListener('wheel', e => { e.preventDefault(); setGain(i, S.gains[i] - Math.sign(e.deltaY) * 2); }, { passive: false });
    knob.addEventListener('keydown', e => {
      const d = { ArrowUp: 2, ArrowRight: 2, ArrowDown: -2, ArrowLeft: -2, PageUp: 10, PageDown: -10 }[e.key];
      if (d) { e.preventDefault(); setGain(i, S.gains[i] + d); }
    });
  }
  function setGain(i, v) {
    const n = clamp(v);
    if (n === S.gains[i]) return;
    S.gains[i] = n; sendGain(i); render(); save();
  }
  function select(i, scroll) {
    if (S.sel !== i) { S.sel = i; render(); save(); }
    if (scroll) scrollToSel(true);
  }
  function scrollToSel(smooth) {
    if (!portrait()) return;
    const strips = $('#strips');
    strips.scrollTo({ left: S.sel * strips.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }
  function rename(i) {
    const n = (prompt('Nazwa kanału', S.names[i]) || '').trim().slice(0, 12);
    if (n) { S.names[i] = n; render(); save(); }
  }

  // ---------- Render ----------
  function render() {
    document.documentElement.dataset.theme = S.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = S.theme === 'dark' ? '#0F0F10' : '#CFCFCB';
    const bus = BUSES[S.bus];
    const lv = S.levels[S.bus];

    refs.forEach((r, i) => {
      const c = CHANNELS[i];
      const v = lv[i];
      const muted = S.mutes[i];
      const sel = i === S.sel;
      // display column = fader position (the mixer sends no meters back)
      const lit = muted ? 0 : Math.round(v / 127 * 12);
      [...r.col.children].forEach((d, k) => {
        const idx = 11 - k; // top dot first
        d.className = idx < lit ? (idx >= 10 ? 'on hot' : 'on') : '';
      });
      r.col.classList.toggle('sel', sel);
      r.col.classList.toggle('muted', muted);
      r.col.setAttribute('aria-selected', sel ? 'true' : 'false');

      r.strip.classList.toggle('sel', sel);
      r.name.textContent = c.master ? bus.short : S.names[i];
      r.knob.style.setProperty('--a', (-135 + S.gains[i] / 127 * 270) + 'deg');
      r.knob.setAttribute('aria-valuenow', S.gains[i]);
      r.knob.setAttribute('aria-valuetext', gainDb(S.gains[i]) + ' dB');
      r.knob.setAttribute('aria-label', 'Gain ' + S.names[i]);
      r.mute.setAttribute('aria-pressed', muted ? 'true' : 'false');
      r.mute.setAttribute('aria-label', 'Wycisz ' + S.names[i]);
      r.solo.setAttribute('aria-pressed', S.solos[i] ? 'true' : 'false');
      r.solo.setAttribute('aria-label', 'Solo ' + S.names[i]);
      if (+r.fader.value !== v) r.fader.value = v;
      r.fader.setAttribute('aria-label', (c.master ? 'Wyjście ' + bus.label : S.names[i] + ' do: ' + bus.label));
      r.fader.setAttribute('aria-valuetext', levelDb(v) + ' dB');
      r.val.textContent = levelDb(v) + ' dB';
      r.pg.setAttribute('aria-current', sel ? 'true' : 'false');
    });

    const sc = CHANNELS[S.sel];
    $('#sel-name').textContent = sc.master ? bus.label : S.names[S.sel];
    $('#sel-name').classList.toggle('muted', !!S.mutes[S.sel]);
    $('#sel-level').textContent = (sc.master ? 'poziom ' : (S.bus === 0 ? 'poziom ' : 'wysyłka ')) + levelDb(lv[S.sel]) + ' dB';
    $('#sel-gain').textContent = sc.gain ? 'gain ' + gainDb(S.gains[S.sel]) + ' dB' : '';
    $('#bus-label').textContent = 'miks: ' + bus.label;

    [...document.querySelectorAll('.scene')].forEach((b, n) => b.setAttribute('aria-pressed', n === S.scene ? 'true' : 'false'));
    const buses = $('#buses');
    buses.style.setProperty('--i', S.bus);
    [...buses.querySelectorAll('button')].forEach((b, bi) => b.setAttribute('aria-checked', bi === S.bus ? 'true' : 'false'));
  }

  // ---------- Metronome ----------
  // Click is generated on the phone (Web Audio). Pair the phone with FLOW 8 over Bluetooth
  // and the click arrives on the USB/BT channel, so it can go to the monitors only.
  // The same tempo is sent to the mixer as tap tempo (global ch, note 0), for the FX2 delay.
  const M = { bpm: S.bpm || 120, beats: S.beats || 4, running: false, ctx: null, next: 0, beat: 0, timer: 0, taps: [], tapLeft: 0 };
  function metroBuild() {
    const panel = $('#metro'), open = $('#metro-open');
    open.addEventListener('click', () => {
      const show = panel.hidden;
      panel.hidden = !show;
      open.setAttribute('aria-expanded', show ? 'true' : 'false');
    });
    $('#bpm-down').addEventListener('click', () => setBpm(M.bpm - 1));
    $('#bpm-up').addEventListener('click', () => setBpm(M.bpm + 1));
    $('#bpm-slider').addEventListener('input', e => setBpm(+e.target.value));
    $('#bpm-tap').addEventListener('click', tapIn);
    $('#meter').addEventListener('click', () => {
      M.beats = M.beats === 4 ? 3 : M.beats === 3 ? 6 : M.beats === 6 ? 2 : 4;
      S.beats = M.beats; save(); metroRender();
    });
    $('#metro-play').addEventListener('click', () => (M.running ? stop() : start()));
    $('#metro-fx').checked = S.metroFx !== false;
    $('#metro-fx').addEventListener('change', e => { S.metroFx = e.target.checked; save(); });
    metroRender();
  }
  function setBpm(v) {
    M.bpm = Math.max(40, Math.min(240, Math.round(v)));
    S.bpm = M.bpm; save(); metroRender();
    if (M.running) M.tapLeft = 4; // re-send tempo to the mixer on the next 4 beats
  }
  function tapIn() {
    const now = performance.now();
    M.taps = M.taps.filter(t => now - t < 2500);
    M.taps.push(now);
    if (M.taps.length >= 2) {
      const iv = (M.taps[M.taps.length - 1] - M.taps[0]) / (M.taps.length - 1);
      setBpm(60000 / iv);
    }
  }
  function start() {
    M.ctx = M.ctx || new (window.AudioContext || window.webkitAudioContext)();
    M.ctx.resume();
    M.running = true; M.beat = 0; M.tapLeft = 4;
    M.next = M.ctx.currentTime + 0.06;
    tick();
    metroRender();
  }
  function stop() {
    M.running = false; clearTimeout(M.timer); metroRender();
    [...$('#beats').children].forEach(s => s.className = '');
    $('#beat-led').classList.remove('on');
  }
  function tick() {
    if (!M.running) return;
    while (M.next < M.ctx.currentTime + 0.12) {
      click(M.next, M.beat % M.beats === 0);
      const b = M.beat % M.beats, delay = Math.max(0, (M.next - M.ctx.currentTime) * 1000);
      setTimeout(() => onBeat(b), delay);
      M.next += 60 / M.bpm; M.beat++;
    }
    M.timer = setTimeout(tick, 25);
  }
  function click(t, accent) {
    const o = M.ctx.createOscillator(), g = M.ctx.createGain();
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.55, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(M.ctx.destination);
    o.start(t); o.stop(t + 0.06);
  }
  function onBeat(b) {
    if (!M.running) return;
    const spans = $('#beats').children;
    [...spans].forEach((s, k) => s.className = k === b ? (k === 0 ? 'on accent' : 'on') : '');
    const led = $('#beat-led');
    led.classList.add('on'); setTimeout(() => led.classList.remove('on'), 90);
    if (M.tapLeft > 0 && S.metroFx !== false && M.bpm >= 50 && M.bpm <= 240) {
      send([0x90 + GLOBAL_CH - 1, 0, 100], true);
      M.tapLeft--;
    }
  }
  function metroRender() {
    $('#bpm').textContent = M.bpm;
    $('#bpm-slider').value = M.bpm;
    $('#meter').textContent = M.beats + '/4';
    const beats = $('#beats');
    beats.style.setProperty('--beats', M.beats);
    while (beats.children.length < M.beats) beats.appendChild(el('span'));
    while (beats.children.length > M.beats) beats.lastChild.remove();
    const p = $('#metro-play');
    p.textContent = M.running ? 'Stop' : 'Start';
    p.setAttribute('aria-pressed', M.running ? 'true' : 'false');
  }

  build();
  metroBuild();
  render();
  requestAnimationFrame(() => scrollToSel(false));
  setConn('idle');
  // reconnect silently if permission was already granted earlier
  if (navigator.permissions && navigator.requestMIDIAccess) {
    navigator.permissions.query({ name: 'midi' }).then(p => { if (p.state === 'granted') connect(); }).catch(() => {});
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
