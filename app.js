/* FLOW 8 Control: remote for the Behringer FLOW 8.
 * Two links: Bluetooth LE (two-way, protocol read from a FLOW Mix HCI log) and USB MIDI
 * (one-way, map from the FLOW 8 manual). The app keeps its own state, saved on the device. */
(() => {
  'use strict';
  const APP_VERSION = '0.41'; // bump on every release (shown on the display)
  document.getElementById('ver').textContent = 'v' + APP_VERSION;
  document.getElementById('ver').addEventListener('click', () => diagOpen());

  // ---------- Model ----------
  const CHANNELS = [
    { name: 'wokal',    num: '1',   midi: 1, ble: 0, gain: true,  cap: '#E8501A', mark: '#FFFFFF', glyph: 'M15 4a5 5 0 0 1 5 5v5a5 5 0 0 1-10 0V9a5 5 0 0 1 5-5zM15 24v3' },
    { name: 'chórek',   num: '2',   midi: 2, ble: 1, gain: true,  cap: '#2F5BEA', mark: '#FFFFFF', glyph: 'M6 15a9 9 0 1 0 18 0a9 9 0 1 0-18 0' },
    { name: 'gitara',   num: '3',   midi: 3, ble: 2, gain: true,  cap: '#F4F4F1', mark: '#1C1C1C', glyph: 'M5 25L15 5l10 20z' },
    { name: 'bas',      num: '4',   midi: 4, ble: 3, gain: true,  cap: '#1C1C1C', mark: '#FFFFFF', glyph: 'M6 6h18v18H6z' },
    { name: 'klawisze', num: '5/6', midi: 5, ble: 4, gain: true,  cap: '#A3A39E', mark: '#1C1C1C', glyph: 'M4 10h22M4 15h22M4 20h22' },
    { name: 'podkład',  num: '7/8', midi: 6, ble: 5, gain: true,  cap: '#F4F4F1', mark: '#E8501A', glyph: 'M4 15q5.5-10 11 0t11 0' },
    { name: 'telefon',  num: 'USB', midi: 7, ble: 6, gain: false, cap: '#2F5BEA', mark: '#FFFFFF', glyph: 'M10 4h10v22H10zM13 22h4' },
    { name: 'main',     num: 'OUT', midi: 0, gain: false, cap: '#1C1C1C', mark: '#E8501A', glyph: '', master: true }
  ];
  const BUSES = [
    // dst = bus id on the Bluetooth link (MAIN 0x0f, MON1 0x0a, MON2 0x0b, FX1 0x0c, FX2 0x0d)
    { id: 'main', label: 'sala',      short: 'sala',  midi: 8,  sendCC: 7,  dst: 0x0f },
    { id: 'mon1', label: 'odsłuch 1', short: 'mon 1', midi: 9,  sendCC: 14, dst: 0x0a },
    { id: 'mon2', label: 'odsłuch 2', short: 'mon 2', midi: 10, sendCC: 15, dst: 0x0b },
    { id: 'fx1',  label: 'efekt 1',   short: 'fx 1',  midi: 11, sendCC: 16, dst: 0x0c },
    { id: 'fx2',  label: 'efekt 2',   short: 'fx 2',  midi: 12, sendCC: 17, dst: 0x0d }
  ];
  // one mute icon for every channel: headphones, crossed out (and red) when muted
  const MUTE_ICON = '<svg viewBox="0 0 30 30" aria-hidden="true"><path d="M5.5 19v-3.5a9.5 9.5 0 0 1 19 0V19M9.5 17v8H8a3 3 0 0 1-3-3v-2a3 3 0 0 1 3-3zM20.5 17v8H22a3 3 0 0 0 3-3v-2a3 3 0 0 0-3-3z"/><path class="slash" d="M4 4l22 22"/></svg>';
  const ROWS = 15;   // dots per meter column on the display
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
    pans: CHANNELS.map(() => 0),               // -50 (left) .. 0 .. +50 (right)
    mutes: CHANNELS.map(() => false),
    solos: CHANNELS.map(() => false),
    // channel page (FLOW Mix "input" screen): 4-band EQ, low cut, compressor, phantom, phase
    eq: CHANNELS.map(() => [0, 0, 0, 0]),                       // dB, -15..+15
    eqF: CHANNELS.map(() => [100, 500, 2000, 12000]),           // Hz, kept as the mixer reports them
    eqQ: CHANNELS.map(() => [0, 6, 6, 0]),                      // raw Q bytes, sent back unchanged
    hpf: CHANNELS.map(() => 20),                                // Hz, 20..600
    comp: CHANNELS.map(() => 0),                                // 0..100 %
    p48: CHANNELS.map(() => false),
    phase: CHANNELS.map(() => false),
    // 9-band EQ of the outputs sala, odsłuch 1, odsłuch 2
    geq: [0, 1, 2].map(() => ({ g: [0, 0, 0, 0, 0, 0, 0, 0, 0], f: [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000], q: [8, 8, 8, 8, 8, 8, 8, 8, 8] })),
    fx: [{ preset: 0, v1: 50, v2: 0, v3: 0, en: 0 }, { preset: 0, v1: 50, v2: 0, v3: 0, en: 0 }]   // FX1, FX2 programs
  });
  let S = fresh();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.levels && saved.levels.length === BUSES.length) S = Object.assign(S, saved);
    if (!Array.isArray(S.pans) || S.pans.length !== CHANNELS.length) S.pans = CHANNELS.map(() => 0);
    const f0 = fresh();
    ['eq', 'eqF', 'eqQ', 'hpf', 'comp', 'p48', 'phase'].forEach(k => { if (!Array.isArray(S[k]) || S[k].length !== CHANNELS.length) S[k] = f0[k]; });
    if (!Array.isArray(S.fx) || S.fx.length !== 2) S.fx = f0.fx;
    if (!Array.isArray(S.geq) || S.geq.length !== 3) S.geq = f0.geq;
  } catch (e) { /* storage unavailable: run with defaults */ }
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }, 250);
  };

  // ---------- Units ----------
  // USB MIDI: manual's law (-70..+10 dB). Bluetooth: fader position 0-255 with the
  // Behringer 4-segment law (0 dB at 3/4 travel, matches FLOW Mix: 0 dB ≈ 0xC2).
  const levelDb = v => {
    if (v <= 0) return '-∞';
    if (!B.ready) return fmt(-70 + (v - 1) * 80 / 126);
    const f = (v * 255 / 127 + 0.5) / 255;                          // middle of the mixer's 0-255 step
    const d = Math.round(2 * (f >= 0.5 ? 40 * f - 30 : f >= 0.25 ? 80 * f - 50 : f >= 0.0625 ? 160 * f - 70 : 480 * f - 90)) / 2;
    return d < -70 ? '-∞' : fmt(d);                                // 0.5 dB steps like the mixer display
  };
  const eqDb = b => Math.round((b - 127) / 127 * 15 * 2) / 2;     // EQ gain byte to dB in 0.5 dB steps
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
    if (B.ready) return bleLevel(i);
    const bus = BUSES[S.bus];
    const v = S.levels[S.bus][i];
    if (CHANNELS[i].master) cc(bus.midi, CC.level, v, force);
    else cc(CHANNELS[i].midi, bus.sendCC, v, force);
  }
  const sendGain = (i, f) => B.ready ? bleGain(i) : CHANNELS[i].gain && cc(CHANNELS[i].midi, CC.gain, S.gains[i], f);
  // pan / balance: MIDI CC10 (64 = centre); Bluetooth 0x00 ChannelPan (0x7f = centre), as FLOW Mix sends it
  const panOk = i => !CHANNELS[i].master || S.bus === 0;       // the master strip carries MAIN balance only
  const sendPan = (i, f) => { if (!panOk(i)) return; B.ready ? blePan(i) : cc(CHANNELS[i].master ? BUSES[0].midi : CHANNELS[i].midi, 10, Math.round(64 + S.pans[i] / 50 * 63), f); };
  const sendMute = (i, f) => B.ready ? bleMute(i) : !CHANNELS[i].master && cc(CHANNELS[i].midi, CC.mute, S.mutes[i] ? 127 : 0, f);
  const sendSolo = (i, f) => B.ready ? bleSolo(i) : !CHANNELS[i].master && cc(CHANNELS[i].midi, CC.solo, S.solos[i] ? 127 : 0, f);

  function sendAll() {
    CHANNELS.forEach((c, i) => {
      if (c.master) {
        BUSES.forEach((b, bi) => cc(b.midi, CC.level, S.levels[bi][i], true));
      } else {
        BUSES.forEach((b, bi) => cc(c.midi, b.sendCC, S.levels[bi][i], true));
        sendGain(i, true); sendMute(i, true); sendSolo(i, true);
      }
      cc(c.master ? BUSES[0].midi : c.midi, 10, Math.round(64 + S.pans[i] / 50 * 63), true);
    });
  }


  // ---------- Bluetooth LE ----------
  // Frame: [cmd][1][payload…][sum8]; multi-fragment: [cmd][count][seq][idx][payload…][sum8].
  // The mixer echoes accepted writes and pushes moves of its own faders (cmd 0x06).
  const BLE_SVC = '14839ad4-8d7e-415c-9a42-167340cf2339';
  const BLE_CHR = '0034594a-a8e7-4b1a-a6b1-cd5243059a57';
  const B = { dev: null, chr: null, ready: false, pending: new Map(), busy: false, frags: new Map(), touched: new Map(), hsTimer: 0 };
  const frame = (cmd, payload) => {
    const b = [cmd, 1, ...payload];
    b.push(b.reduce((a, x) => a + x, 0) & 255);
    return new Uint8Array(b);
  };
  // latest value wins: a fast fader drag never builds a backlog
  function bleQueue(key, cmd, payload) {
    if (!B.chr) return;
    B.pending.delete(key);
    const f = frame(cmd, payload);
    B.pending.set(key, f);
    bleFlush();
  }
  async function bleFlush() {
    if (B.busy || !B.chr) return;
    const next = B.pending.entries().next();
    if (next.done) return;
    const [key, data] = next.value;
    B.pending.delete(key);
    diagLog('>', data);
    B.busy = true;
    try {
      await Promise.race([B.chr.writeValueWithResponse ? B.chr.writeValueWithResponse(data) : B.chr.writeValue(data),
        new Promise(r => setTimeout(r, 1500))]);                    // a lost write must not stall the queue
    } catch (e) {
      if (!B.dev || !B.dev.gatt.connected) { bleLost(); return; }
    }
    B.busy = false;
    bleFlush();
  }
  const pos255 = v => Math.max(0, Math.min(255, Math.round(v * 255 / 127)));
  const gainByte = g => 0x50 + Math.round(g * 160 / 127);   // 0x50..0xF0 seen in FLOW Mix
  function bleLevel(i, bi) {
    if (bi === undefined) bi = S.bus;
    const c = CHANNELS[i], dst = BUSES[bi].dst;
    const ch = c.master ? dst : c.ble;              // a bus master is (bus, bus)
    B.touched.set(ch, performance.now());
    bleQueue('l' + bi + ':' + i, 0x06, [ch, dst, pos255(S.levels[bi][i])]);
  }
  // channel page commands, payloads as FLOW Mix builds them (u16 big-endian, EQ gain byte = 127 + dB / 15 * 127)
  const eqByte = g => Math.max(0, Math.min(254, Math.round(127 + g / 15 * 127)));
  function bleEq(i, b) {
    const c = CHANNELS[i]; if (c.master) return;
    B.touched.set('q' + c.ble + ':' + b, performance.now());
    const f = S.eqF[i][b];
    bleQueue('q' + i + ':' + b, 0x09, [c.ble, b, f >> 8, f & 255, S.eqQ[i][b], eqByte(S.eq[i][b])]);
  }
  function bleGeq(bi, b) {                                         // output EQ band: 0x03 [bus][band 0-8][freq u16][q][gain]
    const o = S.geq[bi], id = BUSES[bi].dst;
    B.touched.set('e' + id + ':' + b, performance.now());
    bleQueue('e' + bi + ':' + b, 0x03, [id, b, o.f[b] >> 8, o.f[b] & 255, o.q[b], eqByte(o.g[b])]);
  }
  function bleHpf(i) {
    const c = CHANNELS[i]; if (c.master) return;
    B.touched.set('h' + c.ble, performance.now());
    bleQueue('h' + i, 0x04, [c.ble, 1, S.hpf[i] >> 8, S.hpf[i] & 255]);
  }
  function bleComp(i) {
    const c = CHANNELS[i]; if (c.master) return;
    B.touched.set('c' + c.ble, performance.now());
    bleQueue('c' + i, 0x13, [c.ble, Math.round(S.comp[i] * 255 / 100)]);
  }
  // effect program and its two parameters; the routing bits are sent back exactly as the mixer reported them (as FLOW Mix does)
  function bleFxSetup(n) {
    const f = S.fx[n];
    B.touched.set('x' + n, performance.now());
    bleQueue('x' + n, 0x11, [0x0c + n, f.v1, f.v2, f.v3, f.en >> 1 & 1, f.en >> 2 & 1, f.en >> 3 & 1]);
  }
  function bleFxPreset(n) {
    bleQueue('xp' + n, 0x31, [0x0c + n, S.fx[n].preset]);
    setTimeout(() => bleQueue('state', 0x37, []), 400);          // the new program brings its own parameter values
  }
  const bleFlag = (i, cmd, on) => { if (!CHANNELS[i].master) bleQueue('f' + cmd + ':' + i, cmd, [CHANNELS[i].ble, on ? 1 : 0]); };
  function bleGain(i) {
    const c = CHANNELS[i];
    if (!c.gain || c.master) return;
    B.touched.set('g' + c.ble, performance.now());
    bleQueue('g' + i, 0x02, [c.ble, gainByte(S.gains[i])]);
  }
  const panByte = v => Math.max(0, Math.min(254, Math.round(127 + v / 50 * 127)));
  const panFrom = b => Math.max(-50, Math.min(50, Math.round((b - 127) / 127 * 50)));
  function blePan(i) {
    const id = CHANNELS[i].master ? 0x0f : CHANNELS[i].ble;
    B.touched.set('p' + id, performance.now());
    bleQueue('p' + i, 0x00, [id, panByte(S.pans[i])]);
  }
  function bleMute(i) { const c = CHANNELS[i]; if (!c.master) bleQueue('m' + i, 0x08, [c.ble, S.mutes[i] ? 1 : 0]); }
  function bleSolo(i) { const c = CHANNELS[i]; if (!c.master) bleQueue('s' + i, 0x01, [c.ble, S.solos[i] ? 1 : 0]); }
  function bleSendAll() {
    CHANNELS.forEach((c, i) => {
      BUSES.forEach((b, bi) => bleLevel(i, bi));
      blePan(i);
      if (c.master) return;
      bleGain(i); bleMute(i); bleSolo(i);
    });
  }
  function bleScene(n) {                            // snapshot slot, 0-based on the wire
    bleQueue('scene', 0x20, [n]);
    bleQueue('state', 0x37, []);
  }
  const toasted = new Set();
  function toastOnce(k, msg) { if (!toasted.has(k)) { toasted.add(k); toast(msg); } }

  // Inside the Android app (Capacitor) a native bridge does the Bluetooth work,
  // so data from the mixer (its own fader moves, meters) also arrives.
  const NATIVE = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
    ? (window.Capacitor.registerPlugin ? window.Capacitor.registerPlugin('FlowBle') : window.Capacitor.Plugins.FlowBle) : null;
  async function bleConnectNative() {
    setConn('busy');
    try {
      if (!B.nativeBound) {
        B.nativeBound = true;
        await NATIVE.addListener('data', e => bleRx(new Uint8Array(e.value)));
        await NATIVE.addListener('disconnected', () => bleLost());
      }
      await NATIVE.connect();
      B.dev = { gatt: { get connected() { return !!B.chr; }, disconnect() { NATIVE.disconnect(); bleLost(); } } };
      B.chr = { writeValueWithResponse: data => NATIVE.write({ data: Array.from(data) }) };
      B.notify = true; B.heard = false;
      B.hsTimer = setTimeout(bleHello, 1200);
      setTimeout(() => {
        if (B.chr && !B.ready) { B.ready = true; B.oneWay = true; setConn('ble'); render(); toast('Połączono, ale mikser nie odpowiada.'); }
      }, 3000);
    } catch (e) {
      toast('Nie udało się połączyć: ' + ((e && e.message) || e));
      bleLost();
    }
  }

  async function bleConnect() {
    if (NATIVE) return bleConnectNative();
    if (!navigator.bluetooth) {
      toast('Ta przeglądarka nie obsługuje Bluetooth. Użyj Chrome na Androidzie.');
      return;
    }
    try {
      const dev = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BLE_SVC] }, { namePrefix: 'FLOW' }, { namePrefix: 'Flow' }],
        optionalServices: [BLE_SVC]
      });
      B.dev = dev;
      setConn('busy');
      // Android often fails the first GATT attempt (FLOW Mix retries too), so try a few times
      let step = '', lastErr = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          step = 'połączenie'; const server = await dev.gatt.connect();
          await new Promise(r => setTimeout(r, 300));
          step = 'usługa'; const svc = await server.getPrimaryService(BLE_SVC);
          step = 'kanał danych'; const chr = await svc.getCharacteristic(BLE_CHR);
          chr.addEventListener('characteristicvaluechanged', bleOnValue);   // same fn → never doubled
          // FLOW 8 marks the characteristic "notify" but has no CCCD descriptor, so Chrome
          // may refuse startNotifications ("Not supported"). The mixer notifies anyway, so go on.
          try { await chr.startNotifications(); B.notify = true; }
          catch (err) { B.notify = false; }
          B.chr = chr; lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          $('#conn-label').textContent = 'Łączę… próba ' + (attempt + 1);
          try { dev.gatt.disconnect(); } catch (x) {}
          await new Promise(r => setTimeout(r, 800 * attempt));
        }
      }
      if (lastErr) throw Object.assign(new Error(step + ': ' + ((lastErr && lastErr.message) || lastErr)), { step });
      dev.addEventListener('gattserverdisconnected', bleLost);
      // the mixer greets with 0x35; answer anyway if the greeting got lost
      B.heard = false;
      B.hsTimer = setTimeout(bleHello, B.notify ? 1200 : 200);
      // nothing heard back: still usable one way (like USB), so say so
      setTimeout(() => {
        if (B.chr && !B.ready) {
          B.ready = true; B.oneWay = true; setConn('ble'); render();
          toast('Połączono przez Bluetooth, ale tylko w jedną stronę: telefon nie odbiera danych z miksera.');
        }
      }, 2500);
    } catch (e) {
      if (e && e.name === 'NotFoundError') { setConn('idle'); return; }   // picker closed
      toast('Nie udało się połączyć (' + ((e && e.message) || e) + '). Zamknij FLOW Mix, wyłącz i włącz Bluetooth, spróbuj ponownie.');
      bleLost();
    }
  }
  function bleOnValue(e) { bleRx(new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength)); }
  function bleClientId() {
    let id = null;
    try { id = JSON.parse(localStorage.getItem('flow8-ble-id') || 'null'); } catch (e) {}
    if (!Array.isArray(id) || id.length !== 16) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(16)));
      try { localStorage.setItem('flow8-ble-id', JSON.stringify(id)); } catch (e) {}
    }
    return id;
  }
  function bleHello() {
    clearTimeout(B.hsTimer);
    bleQueue('hello', 0x39, bleClientId());
  }
  function bleRx(b) {
    if (b.length < 3) return;
    diagLog('<', b);
    if (!B.heard) { B.heard = true; if (B.oneWay) { B.oneWay = false; setConn('ble'); toast('Odbiór z miksera działa.'); } }
    if ((b.slice(0, -1).reduce((a, x) => a + x, 0) & 255) !== b[b.length - 1]) return;   // bad checksum
    const cmd = b[0], count = b[1];
    let p;
    if (count <= 1) p = b.slice(2, -1);
    else {
      const key = cmd + ':' + b[2], parts = B.frags.get(key) || [];
      parts[b[3]] = b.slice(4, -1); B.frags.set(key, parts);
      if (parts.filter(Boolean).length < count) return;
      B.frags.delete(key);
      p = new Uint8Array(parts.reduce((a, x) => a.concat(Array.from(x)), []));
    }
    bleHandle(cmd, p);
  }
  // meters for inputs 1-4 (0x40+), 5/6, 7/8, USB (0xC0+ = stereo) and MAIN, as FLOW Mix asks
  function bleMeterRequest() { bleQueue('meters', 0x21, [8, 0x40, 0x41, 0x42, 0x43, 0xc4, 0xc5, 0xc6, 0xcf, 0, 0, 0, 0, 0, 0, 0]); }
  setInterval(() => { if (B.ready && performance.now() - (B.meterAt || 0) > 3000) bleMeterRequest(); }, 3000);
  function bleHandle(cmd, p) {
    const idx = id => CHANNELS.findIndex(c => c.ble === id);
    const now = performance.now();
    switch (cmd) {
      case 0x35: bleHello(); break;                               // HandshakeHost
      case 0x36:                                                  // handshake accepted
        bleQueue('state', 0x37, []);                              // GetMixerState
        bleMeterRequest();
        bleQueue('snaps', 0x07, []);                              // GetSnapshotList
        if (!B.ready) {
          B.ready = true; setConn('ble'); render();
          toast('Połączono przez Bluetooth. Rusz suwakiem na mikserze, a aplikacja go pokaże.');
        }
        break;
      case 0x06: {                                                // fader (echo or moved on the mixer)
        const bi = BUSES.findIndex(b => b.dst === p[1]);
        const i = p[0] === p[1] ? CHANNELS.findIndex(c => c.master) : idx(p[0]);
        if (i < 0 || bi < 0) break;
        if (now - (B.touched.get(p[0]) || 0) < 400) break;        // ignore echoes while the user drags
        S.levels[bi][i] = p[2] * 127 / 255;               // keep full mixer resolution
        render(); save(); break;
      }
      case 0x27: {                                                // snapshot list: [len][name]…
        const names = []; let k = 0;
        while (k < p.length && p[k]) { names.push(String.fromCharCode(...p.slice(k + 1, k + 1 + p[k]))); k += 1 + p[k]; }
        B.snapshots = names; break;
      }
      case 0x02: {                                                // gain
        const i = idx(p[0]);
        if (i < 0 || now - (B.touched.get('g' + p[0]) || 0) < 400) break;
        S.gains[i] = Math.max(0, Math.min(127, (p[1] - 0x50) * 127 / 160));
        render(); save(); break;
      }
      case 0x00: {                                                // pan / balance
        const i = p[0] === 0x0f ? CHANNELS.findIndex(c => c.master) : idx(p[0]);
        if (i < 0 || now - (B.touched.get('p' + p[0]) || 0) < 400) break;
        S.pans[i] = panFrom(p[1]); render(); save(); break;
      }
      case 0x09: {                                                // EQ band: [id][band][freq u16][q][gain]
        const i = idx(p[0]), b = p[1];
        if (i < 0 || b > 3 || now - (B.touched.get('q' + p[0] + ':' + b) || 0) < 400) break;
        if (p[2] || p[3]) S.eqF[i][b] = p[2] << 8 | p[3];
        S.eqQ[i][b] = p[4]; S.eq[i][b] = eqDb(p[5]); render(); save(); break;
      }
      case 0x03: {                                                // output EQ band
        const bi = BUSES.findIndex(x => x.dst === p[0]), b = p[1];
        if (bi < 0 || bi > 2 || b > 8 || now - (B.touched.get('e' + p[0] + ':' + b) || 0) < 400) break;
        const o = S.geq[bi]; if (p[2] || p[3]) o.f[b] = p[2] << 8 | p[3];
        o.q[b] = p[4]; o.g[b] = eqDb(p[5]); render(); save(); break;
      }
      case 0x04: {                                                // low cut: [id][on][freq u16]
        const i = idx(p[0]);
        if (i < 0 || now - (B.touched.get('h' + p[0]) || 0) < 400) break;
        S.hpf[i] = Math.max(20, Math.min(600, p[2] << 8 | p[3])); render(); save(); break;
      }
      case 0x13: {                                                // compressor
        const i = idx(p[0]);
        if (i < 0 || now - (B.touched.get('c' + p[0]) || 0) < 400) break;
        S.comp[i] = Math.round(p[1] * 100 / 255); render(); save(); break;
      }
      case 0x11: {                                                // effect parameters
        const n = p[0] - 0x0c;
        if (n < 0 || n > 1 || now - (B.touched.get('x' + n) || 0) < 400) break;
        Object.assign(S.fx[n], { v1: Math.min(100, p[1]), v2: p[2] ? 1 : 0, v3: p[3] }); render(); save(); break;
      }
      case 0x31: { const n = p[0] - 0x0c; if (n === 0 || n === 1) { S.fx[n].preset = p[1] & 15; render(); save(); } break; }
      case 0x15: { const i = idx(p[0]); if (i >= 0) { S.p48[i] = !!p[1]; render(); save(); } break; }
      case 0x10: { const i = idx(p[0]); if (i >= 0) { S.phase[i] = !!p[1]; render(); save(); } break; }
      case 0x08: { const i = idx(p[0]); if (i >= 0) { S.mutes[i] = !!p[1]; render(); save(); } break; }
      case 0x01: { const i = idx(p[0]); if (i >= 0) { S.solos[i] = !!p[1]; render(); save(); } break; }
      case 0x38: bleMixerState(p); break;                         // full state (after connect / scene load)
      case 0x22: {                                                // meters: 15 values, same byte→dB law as faders (FLOW Mix)
        const v = Array.from(p.slice(0, 15)), mx = (a, b) => Math.max(v[a] || 0, v[b] || 0);
        B.meters = [v[0], v[1], v[2], v[3], mx(4, 5), mx(6, 7), mx(8, 9), mx(10, 11)]; B.meterAt = now;
        B.meterN = (B.meterN || 0) + 1; B.meterLast = Array.from(p); B.meterMax = Array.from(p).map((x, k) => Math.max(x, (B.meterMax || [])[k] || 0));
        renderMeters(); break;
      }
    }
  }
  // MixerState layout (read from Arek's mixer, 2026-11-25):
  //  7 input records: [id][flags][gain][00 00 14][5 B][8 B][7 B][labelLen][label]
  //  MAIN 0x0f / MON 0x0a,0x0b (52 B): [id][00][master][7f][3c][7 sends: ch1-4,5/6,7/8,USB][9 GEQ][18 B freqs][9 B][4 B]
  //  FX 0x0c,0x0d (17 B): [id][00][92][7f][x][3 B][7 sends][2 B]
  function bleMixerState(p) {
    let k = 0;
    const gains = [];
    const flags = [], pans = [], recs = [];
    for (let ch = 0; ch < 7; ch++) {
      if (p[k] !== ch || k + 27 > p.length) return;               // layout not as expected: ignore
      recs[ch] = p.slice(k, k + 27);   // +3 squeezer, +4 low cut u16, +7 EQ gains, +11 EQ freqs u16, +19 EQ Q
      gains[ch] = p[k + 2]; flags[ch] = p[k + 1]; pans[ch] = p[k + 6];               // flags: bit0 mute, bit6 solo (as in FLOW Mix)
      k += 27 + p[k + 26];
    }
    const lv = BUSES.map(() => null), master = BUSES.map(() => null); let mainMute = null, mainPan = null;
    while (k < p.length) {
      const id = p[k], bi = BUSES.findIndex(b => b.dst === id);
      if (bi < 0) break;
      if (id === 0x0c || id === 0x0d) {   // [id][flags: bit1 main, bit2 mon1, bit3 mon2][vol][pan][val1][val2][val3][preset][7 sends][2 B]
        S.fx[id - 0x0c] = { preset: p[k + 7] & 15, v1: Math.min(100, p[k + 4]), v2: p[k + 5] ? 1 : 0, v3: p[k + 6], en: p[k + 1] };
        lv[bi] = Array.from(p.slice(k + 8, k + 15)); k += 17;
      }
      else {
        if (bi < 3) for (let b = 0; b < 9; b++) {                 // +12 nine EQ gains, +21 nine freqs u16, +39 nine Q
          const f = p[k + 21 + 2 * b] << 8 | p[k + 22 + 2 * b];
          S.geq[bi].g[b] = eqDb(p[k + 12 + b]); if (f) { S.geq[bi].f[b] = f; S.geq[bi].q[b] = p[k + 39 + b]; }
        }
        master[bi] = p[k + 2]; if (id === 0x0f) { mainMute = !!(p[k + 1] & 1); mainPan = p[k + 3]; } lv[bi] = Array.from(p.slice(k + 5, k + 12)); k += 52;
      }
    }
    const to127 = x => x * 127 / 255;
    CHANNELS.forEach((c, i) => {
      if (c.master) return;
      if (c.gain) S.gains[i] = Math.max(0, Math.min(127, (gains[c.ble] - 0x50) * 127 / 160));
      S.mutes[i] = !!(flags[c.ble] & 1); S.solos[i] = !!(flags[c.ble] & 0x40); S.pans[i] = panFrom(pans[c.ble]);
      const r = recs[c.ble];
      S.phase[i] = !!(flags[c.ble] & 4); S.p48[i] = !!(flags[c.ble] & 8);
      S.comp[i] = Math.round(r[3] * 100 / 255); S.hpf[i] = Math.max(20, Math.min(600, r[4] << 8 | r[5]));
      for (let b = 0; b < 4; b++) {
        S.eq[i][b] = eqDb(r[7 + b]);
        const f = r[11 + 2 * b] << 8 | r[12 + 2 * b];
        if (f) { S.eqF[i][b] = f; S.eqQ[i][b] = r[19 + b]; }
      }
      BUSES.forEach((b, bi) => { if (lv[bi] && lv[bi].length === 7) S.levels[bi][i] = to127(lv[bi][c.ble]); });
    });
    const mi = CHANNELS.findIndex(c => c.master);
    BUSES.forEach((b, bi) => { if (master[bi] !== null) S.levels[bi][mi] = to127(master[bi]); });
    if (mainMute !== null) S.mutes[mi] = mainMute;
    if (mainPan !== null) S.pans[mi] = panFrom(mainPan);
    render(); save();
  }

  function bleLost() {
    clearTimeout(B.hsTimer);
    const was = B.ready;
    Object.assign(B, { chr: null, ready: false, busy: false, oneWay: false, heard: false });
    B.pending.clear(); B.frags.clear();
    setConn('idle'); render();
    if (was) toast('Rozłączono Bluetooth.');
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
    if (B.ready && state !== 'ble') state = 'ble';
    led.className = 'led' + (state === 'ok' || state === 'ble' ? ' ok' : state === 'demo' || state === 'other' || state === 'busy' ? ' demo' : '');
    $('#connect').setAttribute('aria-label', 'Połączenie z mikserem');
    label.textContent =
      state === 'ble' ? (B.oneWay ? 'FLOW 8 · Bluetooth (1 strona)' : 'FLOW 8 · Bluetooth') :
      state === 'busy' ? 'Łączę przez Bluetooth…' :
      state === 'ok' ? 'FLOW 8 · kabel USB' :
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
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), Math.max(2600, msg.length * 70));
  }
  const portrait = () => matchMedia('(orientation: portrait)').matches;

  // ---------- Build ----------
  const refs = [];
  function build() {
    const strips = $('#strips'), dots = $('#dots'), pager = $('#pager');
    CHANNELS.forEach((c, i) => {
      // display column
      const col = el('button', 'dot-col', { type: 'button', role: 'tab', 'aria-label': 'Pokaż kanał ' + S.names[i] });
      for (let k = 0; k < ROWS; k++) col.appendChild(el('span'));
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
      mute.innerHTML = c.master ? '' : MUTE_ICON;
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

      const pan = el('div', 's-pan', { role: 'slider', tabindex: '0', 'aria-valuemin': '-50', 'aria-valuemax': '50' });
      pan.append(el('span', 'pan-dot'), el('span', 'pan-val'));
      bindPan(pan, i);

      const faderWrap = el('div', 's-fader');
      const fader = el('input', 'fader', { type: 'range', min: '0', max: '127', step: '1' });
      fader.addEventListener('input', () => { S.levels[S.bus][i] = +fader.value; sendLevel(i); select(i); render(); save(); });
      // own drag handling: Android Chrome does not drag vertical native ranges reliably
      const setFader = v => {
        v = Math.max(0, Math.min(127, Math.round(v)));
        if (v === S.levels[S.bus][i]) return;
        fader.value = v; S.levels[S.bus][i] = v; slide(v); sendLevel(i); render(); save();
      };
      let drag = null;
      fader.addEventListener('pointerdown', e => {
        e.preventDefault(); select(i); fader.focus({ preventScroll: true });
        fader.setPointerCapture(e.pointerId);
        const r = fader.getBoundingClientRect(), th = (portrait() ? 56 : 34) * K;
        const travel = r.height - th, cur = +fader.value;
        const thumbY = r.bottom - th / 2 - cur / 127 * travel;
        drag = { id: e.pointerId, travel, y0: e.clientY, v0: cur };
        // Only the cap moves the fader (FLOW Mix never jumps to the touched spot either):
        // a finger brushing the track must not change the mix.
        if (Math.abs(e.clientY - thumbY) > th / 2 + 10 * K) drag = null;
      });
      fader.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        e.preventDefault();
        setFader(drag.v0 + (drag.y0 - e.clientY) / drag.travel * 127);
      });
      fader.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
      const endDrag = () => { drag = null; };
      fader.addEventListener('pointerup', endDrag);
      fader.addEventListener('pointercancel', endDrag);
      const ticks = el('div', 'ticks', { 'aria-hidden': 'true' });
      // tick positions: +10, 0, -10, -30, -50, off (0 dB highlighted)
      [10, 0, -10, -30, -50, -70].forEach(db => {
        const t = el('span', db === 0 ? 'zero' : '');
        t.style.setProperty('--p', ((db + 70) * 126 / 80 + 1) / 127);
        ticks.appendChild(t);
      });
      faderWrap.append(fader, ticks);
      // holding the fader still opens the channel page
      let hold = 0, hx = 0, hy = 0;
      const unhold = () => { clearTimeout(hold); hold = 0; };
      faderWrap.addEventListener('pointerdown', e => {
        hx = e.clientX; hy = e.clientY; unhold();
        hold = setTimeout(() => { hold = 0; drag = null; if (navigator.vibrate) navigator.vibrate(15); if (CHANNELS[i].master) { if (S.bus < 3) openEq(eqOutput(S.bus)); } else openChan(i); }, 550);
      });
      faderWrap.addEventListener('pointermove', e => { if (hold && Math.hypot(e.clientX - hx, e.clientY - hy) > 8) unhold(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => faderWrap.addEventListener(t, unhold));

      const val = el('div', 's-val');
      val.addEventListener('click', () => { select(i); askLevel(i); });
      kl.addEventListener('click', () => { select(i); askGain(i); });

      strip.append(head, knobWrap, keys, pan, faderWrap, val);
      strips.appendChild(strip);

      const pg = el('button', '', { type: 'button', 'aria-label': 'Kanał ' + (i + 1) });
      pg.appendChild(el('span'));
      pg.addEventListener('click', () => select(i, true));
      pager.appendChild(pg);

      refs.push({ col, strip, name, knob, mute, solo, fader, val, pg, pan });
    });

    // scenes = mixer snapshots 1..4 (global channel, program change)
    const scenes = $('#scenes');
    for (let n = 1; n <= 4; n++) {
      const b = el('button', 'scene', { type: 'button', 'aria-pressed': 'false', 'aria-label': 'Wczytaj scenę ' + n + ' z miksera' });
      b.textContent = n;
      b.addEventListener('click', () => {
        S.scene = n - 1;
        if (B.ready) bleScene(n - 1); else pc(GLOBAL_CH, n);
        render(); save(); toast('Wczytano scenę ' + n + ' w mikserze');
      });
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

    const menu = $('#conn-menu'), cbtn = $('#connect');
    const closeMenu = () => { menu.hidden = true; cbtn.setAttribute('aria-expanded', 'false'); };
    cbtn.addEventListener('click', e => {
      e.stopPropagation();
      if (B.ready) { if (confirmDisconnect()) return; }
      if (NATIVE) { bleConnect(); return; }               // the Android app talks Bluetooth only
      menu.hidden = !menu.hidden; cbtn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
    $('#conn-ble').addEventListener('click', () => { closeMenu(); bleConnect(); });
    $('#conn-usb').addEventListener('click', () => { closeMenu(); connect(); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
    $('#sync').addEventListener('click', () => {
      if (B.ready) { bleSendAll(); toast('Wysłano ustawienia do miksera przez Bluetooth'); return; }
      if (!out) { toast('Najpierw połącz się z mikserem.'); return; }
      sendAll(); toast('Wysłano wszystkie ustawienia do miksera');
    });
    $('#sel-level').addEventListener('click', () => askLevel(S.sel));
    $('#sel-gain').addEventListener('click', () => CHANNELS[S.sel].gain ? askGain(S.sel) : askPan(S.sel));
    const ck = $('#click-toggle'), ckText = () => { ck.textContent = 'Dźwięki i wibracja: ' + (S.click === false ? 'wyłączone' : 'włączone'); };
    ck.addEventListener('click', e => { e.stopPropagation(); S.click = S.click === false; ckText(); save(); notch(); }); ckText();
    $('#view').addEventListener('click', () => setView(VIEWS[(VIEWS.indexOf(S.view || '') + 1) % VIEWS.length]));
    $('#theme').addEventListener('click', () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; render(); save(); });

    // keep "selected" in sync with the visible page in portrait
    let scrollTimer = 0;
    strips.addEventListener('scroll', () => {
      if (!portrait() || S.view === 'meters') return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const i = Math.round(strips.scrollLeft / strips.clientWidth);
        if (i !== S.sel && i >= 0 && i < CHANNELS.length) { S.sel = i; render(); save(); }
      }, 60);
    }, { passive: true });
    window.addEventListener('resize', () => { if (portrait()) scrollToSel(false); });
  }

  function confirmDisconnect() {
    if (!B.dev || !B.dev.gatt.connected) return false;
    B.dev.gatt.disconnect();
    return true;
  }

  function bindKnob(knob, i) {
    let startY = 0, startV = 0, active = false;
    knob.addEventListener('pointerdown', e => {
      knob.setPointerCapture(e.pointerId); active = true; startY = e.clientY; startV = S.gains[i]; select(i);
    });
    knob.addEventListener('pointermove', e => {
      if (!active) return;
      const scale = (portrait() ? 0.5 : 0.8) / K;
      setGain(i, startV + (startY - e.clientY) * scale);
    });
    const end = () => { active = false; };
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
    knob.addEventListener('wheel', e => { e.preventDefault(); setGain(i, S.gains[i] - Math.sign(e.deltaY) * 1.6); }, { passive: false });
    knob.addEventListener('keydown', e => {
      const d = { ArrowUp: 1.6, ArrowRight: 1.6, ArrowDown: -1.6, ArrowLeft: -1.6, PageUp: 8, PageDown: -8 }[e.key];
      if (d) { e.preventDefault(); setGain(i, S.gains[i] + d); }
    });
  }
  // pan: drag sideways, double tap = centre
  function bindPan(pan, i) {
    let active = false, startX = 0, startV = 0, lastTap = 0;
    pan.lastChild.addEventListener('pointerdown', e => { e.stopPropagation(); });
    pan.lastChild.addEventListener('click', e => { e.stopPropagation(); select(i); askPan(i); });
    pan.addEventListener('pointerdown', e => {
      const t = performance.now();
      if (t - lastTap < 320) { setPan(i, 0); lastTap = 0; return; }
      lastTap = t; active = true; startX = e.clientX; startV = S.pans[i]; pan.setPointerCapture(e.pointerId); select(i);
    });
    pan.addEventListener('pointermove', e => {
      if (!active) return;
      const v = startV + (e.clientX - startX) / K * 100 / Math.max(pan.clientWidth, 140);
      setPan(i, Math.abs(v) < 3 ? 0 : v);                         // light snap to centre
    });
    const end = () => { active = false; };
    pan.addEventListener('pointerup', end);
    pan.addEventListener('pointercancel', end);
    pan.addEventListener('keydown', e => {
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (d) { e.preventDefault(); setPan(i, S.pans[i] + d); } else if (e.key === 'Home') setPan(i, 0);
    });
  }
  // ---------- typing a value by hand ----------
  function ask(title, value, hint, done) {
    const old = document.getElementById('ask'); if (old) old.remove();
    const box = el('form', 'ask', { id: 'ask' });
    const card = el('div', 'ask-card');
    const h = el('div', 'ask-title'); h.textContent = title;
    const row = el('div', 'ask-row');
    const sign = el('button', 'ask-btn sign', { type: 'button', 'aria-label': 'Zmień znak' }); sign.textContent = '+/−';
    const inp = el('input', 'ask-input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done' });
    inp.value = value;
    row.append(sign, inp);
    const note = el('div', 'ask-hint'); note.textContent = hint;
    const btns = el('div', 'ask-row');
    const no = el('button', 'ask-btn', { type: 'button' }); no.textContent = 'Anuluj';
    const ok = el('button', 'ask-btn go', { type: 'submit' }); ok.textContent = 'OK';
    btns.append(no, ok);
    card.append(h, row, note, btns); box.append(card); document.body.append(box);
    const close = () => box.remove();
    sign.addEventListener('click', () => {
      const t = inp.value.trim();
      inp.value = /^[-−]/.test(t) ? t.slice(1) : '-' + t.replace(/^\+/, ''); inp.focus();
    });
    no.addEventListener('click', close);
    box.addEventListener('pointerdown', e => { if (e.target === box) close(); });
    box.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    box.addEventListener('submit', e => { e.preventDefault(); if (done(inp.value.trim()) !== false) close(); else { inp.classList.add('bad'); inp.focus(); } });
    inp.focus(); inp.select();
  }
  const num = t => { const n = parseFloat(t.replace(',', '.').replace('−', '-')); return isFinite(n) ? n : null; };
  const lawDb = b => { const f = (b + 0.5) / 255; return Math.round(2 * (f >= 0.5 ? 40 * f - 30 : f >= 0.25 ? 80 * f - 50 : f >= 0.0625 ? 160 * f - 70 : 480 * f - 90)) / 2; };
  function sendLevelBus(i, bi) {
    if (bi === S.bus) return sendLevel(i);
    if (B.ready) return bleLevel(i, bi);
    if (!CHANNELS[i].master) cc(CHANNELS[i].midi, BUSES[bi].sendCC, Math.round(S.levels[bi][i]));
  }
  function askLevel(i, bi) {
    if (bi === undefined) bi = S.bus;
    const cur = levelDb(S.levels[bi][i]);
    ask((bi === S.bus ? 'Poziom ' : BUSES[bi].short + ': ') + (CHANNELS[i].master ? BUSES[bi].short : S.names[i]) + ' (dB)', cur === '-∞' ? '' : cur.replace('+', ''), 'Od -70 do +10, co 0,5 dB. Puste pole = wyciszony do zera.', t => {
      let v = 0;
      if (t !== '' && !/^-?(∞|inf|off)$/i.test(t)) {
        const d = num(t); if (d === null || d < -200 || d > 10) return false;
        if (B.ready) {                                     // the mixer step whose display is closest to the typed value
          let best = 1;
          for (let b = 1; b <= 255; b++) if (Math.abs(lawDb(b) - d) < Math.abs(lawDb(best) - d)) best = b;
          v = d < -70 ? 0 : best * 127 / 255;
        } else v = d < -70 ? 0 : Math.max(1, Math.min(127, Math.round((d + 70) * 126 / 80 + 1)));
      }
      S.levels[bi][i] = v; if (bi === S.bus) refs[i].fader.value = Math.round(v); sendLevelBus(i, bi); render(); save();
    });
  }
  const askNum = (title, cur, hint, lo, hi, set) => ask(title, cur, hint, t => { const d = num(t); if (d === null || d < lo || d > hi) return false; set(d); render(); save(); });

  // ---------- Channel page: everything about one channel in one place ----------
  // Opened by holding the fader. Levels to every mix (sala, monitors, effects), EQ, low cut, compressor, 48 V, phase.
  let chanOpen = -1, chanRows = [], subRows = [];
  // one row = label, thin slider (moved by dragging sideways anywhere on it, never jumps), value you can tap to type
  function mkRow(label, o, list) {
    const r = el('div', 'chan-row');
    const l = el('span', 'chan-label'); l.textContent = label;
    const sl = el('div', 'chan-slider' + (o.mid ? ' mid' : ''), { role: 'slider', tabindex: '0', 'aria-label': label });
    sl.append(el('span', 'chan-dot'));
    const v = el('button', 'chan-val', { type: 'button' });
    v.addEventListener('click', o.ask);
    let a = false, x0 = 0, p0 = 0, last = 0;
    sl.addEventListener('pointerdown', e => {
      const t = performance.now();
      if (o.reset !== undefined && t - last < 320) { o.set(o.reset); last = 0; render(); save(); return; }
      last = t; a = true; x0 = e.clientX; p0 = o.get(); sl.setPointerCapture(e.pointerId);
    });
    sl.addEventListener('pointermove', e => {
      if (!a) return;
      o.set(Math.max(0, Math.min(1, p0 + (e.clientX - x0) / K / Math.max(sl.clientWidth - 16, 80)))); render(); save();
    });
    const end = () => { a = false; };
    sl.addEventListener('pointerup', end); sl.addEventListener('pointercancel', end);
    r.append(l, sl, v);
    list.push(() => { sl.style.setProperty('--p', o.get()); sl.classList.toggle('off', o.reset !== undefined && Math.abs(o.get() - o.reset) > 0.001); v.textContent = o.text(); });
    return r;
  }

  const EQ_NAMES = ['niskie', 'niski środek', 'wysoki środek', 'wysokie'];
  const hz = f => f >= 1000 ? String(f / 1000).replace('.', ',') + ' kHz' : f + ' Hz';
  function openChan(i) {
    if (CHANNELS[i].master) return;
    closeChan(); chanOpen = i; chanRows = [];
    const page = el('section', 'chan', { id: 'chan', 'aria-label': 'Ustawienia kanału' });
    const head = el('header', 'chan-head');
    const back = el('button', 'chan-back', { type: 'button', 'aria-label': 'Wróć' });
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    back.addEventListener('click', closeChan);
    const num = el('span', 'chan-num'); num.textContent = CHANNELS[i].num;
    const name = el('span', 'chan-name'); name.textContent = S.names[i];
    head.append(back, num, name);
    const body = el('div', 'chan-body');
    const group = (title, rows, icon, more) => {
      const g = el('div', 'chan-group'); const h = el('div', 'chan-title'); h.textContent = title; g.append(h);
      if (icon) {
        const m = el('button', 'chan-more', { type: 'button', 'aria-label': title + ': ustawienia zaawansowane' });
        m.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + icon + '</svg>'; m.addEventListener('click', more); g.append(m);
      }
      rows.forEach(r => g.append(r)); body.append(g);
    };
    const row = (label, o) => mkRow(label, o, chanRows);
    group('poziomy', BUSES.map((b, bi) => row(b.label, {
      get: () => S.levels[bi][i] / 127,
      set: p => { S.levels[bi][i] = B.ready ? Math.round(p * 255) * 127 / 255 : Math.round(p * 127); sendLevelBus(i, bi); },
      text: () => levelDb(S.levels[bi][i]) + ' dB', ask: () => askLevel(i, bi)
    })), '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>', () => openFx(i));
    group('korektor', EQ_NAMES.map((n, b) => row(n, {
      mid: true, reset: 0.5,
      get: () => (S.eq[i][b] + 15) / 30,
      set: p => { S.eq[i][b] = Math.round((p * 30 - 15) * 2) / 2; bleEq(i, b); },
      text: () => fmt(S.eq[i][b]) + ' dB',
      ask: () => askNum(n + ' ' + hz(S.eqF[i][b]) + ' (dB)', fmt(S.eq[i][b]).replace('+', ''), 'Od -15 do +15, co 0,5 dB.', -15, 15, d => { S.eq[i][b] = Math.round(d * 2) / 2; bleEq(i, b); })
    })), '<path d="M3 15c3 0 3.5-7 6.5-7s3 9 6 9 2.5-5 5.5-5"/><path d="M3 20h18" opacity=".45"/>', () => openEq(eqInput(i)));
    group('filtr i kompresor', [
      row('odcięcie basu', {
        get: () => Math.log(S.hpf[i] / 20) / Math.log(30),
        set: p => { S.hpf[i] = Math.round(20 * Math.pow(30, p)); bleHpf(i); },
        text: () => S.hpf[i] + ' Hz',
        ask: () => askNum('Odcięcie basu (Hz)', String(S.hpf[i]), 'Od 20 do 600 Hz.', 20, 600, d => { S.hpf[i] = Math.round(d); bleHpf(i); })
      }),
      row('kompresor', {
        get: () => S.comp[i] / 100,
        set: p => { S.comp[i] = Math.round(p * 100); bleComp(i); },
        text: () => S.comp[i] + ' %',
        ask: () => askNum('Kompresor (%)', String(S.comp[i]), 'Od 0 do 100.', 0, 100, d => { S.comp[i] = Math.round(d); bleComp(i); })
      })
    ]);
    const sw = el('div', 'chan-switches');
    const toggle = (label, key, cmd, warn) => {
      const b = el('button', 'chan-switch', { type: 'button', 'aria-pressed': 'false' }); b.textContent = label;
      b.addEventListener('click', () => {
        if (!S[key][i] && warn && !confirm(warn)) return;
        S[key][i] = !S[key][i]; bleFlag(i, cmd, S[key][i]); render(); save();
      });
      chanRows.push(() => b.setAttribute('aria-pressed', S[key][i] ? 'true' : 'false'));
      sw.append(b);
    };
    if (CHANNELS[i].ble < 2) toggle('48 V', 'p48', 0x15, 'Włączyć zasilanie phantom 48 V na kanale ' + CHANNELS[i].num + '? Ścisz najpierw kanał.');
    if (CHANNELS[i].ble < 4) toggle('odwróć fazę', 'phase', 0x10);
    const ren = el('button', 'chan-switch', { type: 'button' }); ren.textContent = 'zmień nazwę';
    ren.addEventListener('click', () => { rename(i); name.textContent = S.names[i]; });
    sw.append(ren);
    body.append(sw);
    page.append(head, body);
    $('#device').append(page);
    chanRender();
  }
  function closeChan() { closeSub(); const p = document.getElementById('chan'); if (p) p.remove(); chanOpen = -1; chanRows = []; }
  function closeSub() { const p = document.getElementById('sub'); if (p) p.remove(); subRows = []; }
  function chanRender() { chanRows.forEach(f => f()); subRows.forEach(f => f()); }
  function subPage(title, who) {
    closeSub();
    const page = el('section', 'chan sub', { id: 'sub', 'aria-label': title });
    const head = el('header', 'chan-head');
    const back = el('button', 'chan-back', { type: 'button', 'aria-label': 'Wróć' });
    back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
    back.addEventListener('click', closeSub);
    const num = el('span', 'chan-num'); num.textContent = typeof who === 'number' ? S.names[who] : who;
    const name = el('span', 'chan-name'); name.textContent = title;
    head.append(back, num, name);
    const body = el('div', 'chan-body');
    page.append(head, body); $('#device').append(page);
    return body;
  }

  // ----- EQ editor: response curve, per band frequency / gain / width, low cut -----
  const FS = 48000, F_LO = 20, F_HI = 20000;
  const qFrom = b => b <= 0 ? 0 : b <= 0x65 ? (b - 1) / 10 + 0.3 : b - 0x66 + 11;       // Q byte as FLOW Mix converts it
  const qByte = q => Math.max(1, Math.min(0x65, Math.round((q - 0.3) * 10) + 1));
  const niceHz = f => { const m = Math.pow(10, Math.floor(Math.log10(f)) - 1); return Math.max(F_LO, Math.min(F_HI, Math.round(f / m) * m)); };
  // magnitude in dB of one RBJ biquad at frequency f
  function biquadDb(type, f0, g, q, f) {
    const A = Math.pow(10, g / 40), w0 = 2 * Math.PI * f0 / FS, cs = Math.cos(w0), sn = Math.sin(w0);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'peak') { const al = sn / (2 * q); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
    else if (type === 'hp') { const al = sn / (2 * 0.707); b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else {
      const al = sn / 2 * Math.SQRT2, sq = 2 * Math.sqrt(A) * al, lo = type === 'low' ? 1 : -1;
      b0 = A * ((A + 1) - lo * (A - 1) * cs + sq); b1 = lo * 2 * A * ((A - 1) - lo * (A + 1) * cs); b2 = A * ((A + 1) - lo * (A - 1) * cs - sq);
      a0 = (A + 1) + lo * (A - 1) * cs + sq; a1 = -lo * 2 * ((A - 1) + lo * (A + 1) * cs); a2 = (A + 1) + lo * (A - 1) * cs - sq;
    }
    const w = 2 * Math.PI * f / FS, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
    const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2), dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
    return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  function eqCurveDb(T, f) {
    let d = T.hpf && S.hpf[T.i] > 20 ? biquadDb('hp', S.hpf[T.i], 0, 0.7, f) : 0;
    for (let b = 0; b < T.g.length; b++) {
      if (!T.g[b]) continue;
      const q = qFrom(T.q[b]);
      d += biquadDb(q > 0 ? 'peak' : b === 0 ? 'low' : b === T.g.length - 1 ? 'high' : 'peak', T.f[b], T.g[b], q || 0.8, f);
    }
    return d;
  }
  // EQ target: an input channel (4 bands + low cut) or an output (9 bands), same editor for both
  const eqInput = i => ({ i, hpf: true, title: 'korektor', who: S.names[i], g: S.eq[i], f: S.eqF[i], q: S.eqQ[i], send: b => bleEq(i, b), name: b => EQ_NAMES[b] });
  const eqOutput = bi => ({ i: -1, hpf: false, title: 'korektor', who: BUSES[bi].label, g: S.geq[bi].g, f: S.geq[bi].f, q: S.geq[bi].q, send: b => bleGeq(bi, b), name: b => hz(S.geq[bi].f[b]) });
  function openEq(T) {
    const i = T.i, body = subPage(T.title, T.who);
    let band = Math.min(1, T.g.length - 1);
    const W = 320, H = 170, fx = f => Math.log(f / F_LO) / Math.log(F_HI / F_LO) * W, gy = g => H / 2 - g / 18 * (H / 2);
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'eq-graph'); svg.setAttribute('preserveAspectRatio', 'none');
    const mk = (t, a) => { const n = document.createElementNS(NS, t); Object.keys(a).forEach(k => n.setAttribute(k, a[k])); svg.append(n); return n; };
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(f => mk('line', { x1: fx(f), x2: fx(f), y1: 0, y2: H, class: 'eq-grid' }));
    [-12, -6, 6, 12].forEach(g => mk('line', { x1: 0, x2: W, y1: gy(g), y2: gy(g), class: 'eq-grid' }));
    mk('line', { x1: 0, x2: W, y1: gy(0), y2: gy(0), class: 'eq-zero' });
    const fill = mk('path', { class: 'eq-fill' }), curve = mk('path', { class: 'eq-curve' });
    const wrap = el('div', 'eq-wrap'); wrap.append(svg);
    const nodes = T.g.map((x, b) => {
      const n = el('button', 'eq-node', { type: 'button', 'aria-label': 'Pasmo ' + (b + 1) }); n.textContent = b + 1;
      let a = false, x0 = 0, y0 = 0, f0 = 0, g0 = 0;
      n.addEventListener('pointerdown', e => { band = b; a = true; x0 = e.clientX; y0 = e.clientY; f0 = T.f[b]; g0 = T.g[b]; n.setPointerCapture(e.pointerId); rebuild(); });
      n.addEventListener('pointermove', e => {
        if (!a) return;
        const r = wrap.getBoundingClientRect();
        T.f[b] = niceHz(f0 * Math.pow(F_HI / F_LO, (e.clientX - x0) / r.width));
        T.g[b] = Math.max(-15, Math.min(15, Math.round((g0 - (e.clientY - y0) / r.height * 36) * 2) / 2));
        T.send(b); render(); save();
      });
      const end = () => { a = false; }; n.addEventListener('pointerup', end); n.addEventListener('pointercancel', end);
      wrap.append(n); return n;
    });
    const chips = el('div', 'eq-chips');
    const chipEls = T.g.map((x, b) => {
      const c = el('button', 'eq-chip', { type: 'button' });
      c.addEventListener('click', () => { band = b; rebuild(); }); chips.append(c); return c;
    });
    const ctl = el('div', 'chan-group');
    const g2 = el('div', 'chan-group');
    const t2 = el('div', 'chan-title'); t2.textContent = 'odcięcie basu'; g2.append(t2);
    body.append(wrap, chips, ctl); if (T.hpf) body.append(g2);
    const draw = () => {
      let d = '';
      for (let k = 0; k <= 96; k++) { const f = F_LO * Math.pow(F_HI / F_LO, k / 96); d += (k ? 'L' : 'M') + fx(f).toFixed(1) + ' ' + Math.max(-2, Math.min(H + 2, gy(eqCurveDb(T, f)))).toFixed(1); }
      curve.setAttribute('d', d); fill.setAttribute('d', d + 'L' + W + ' ' + gy(0) + 'L0 ' + gy(0) + 'Z');
      nodes.forEach((n, b) => { n.style.left = fx(T.f[b]) / W * 100 + '%'; n.style.top = gy(T.g[b]) / H * 100 + '%'; n.classList.toggle('on', b === band); });
      chipEls.forEach((c, b) => { c.innerHTML = '<b>' + (b + 1) + '</b> ' + hz(T.f[b]) + '<br>' + fmt(T.g[b]) + ' dB'; c.setAttribute('aria-pressed', b === band ? 'true' : 'false'); });
    };
    const hpfRow = mkRow('częstotliwość', {
      get: () => Math.log(S.hpf[i] / 20) / Math.log(30),
      set: p => { S.hpf[i] = Math.round(20 * Math.pow(30, p)); bleHpf(i); },
      text: () => S.hpf[i] + ' Hz',
      ask: () => askNum('Odcięcie basu (Hz)', String(S.hpf[i]), 'Od 20 do 600 Hz.', 20, 600, d => { S.hpf[i] = Math.round(d); bleHpf(i); })
    }, T.hpf ? subRows : []);
    if (T.hpf) g2.append(hpfRow);
    function rebuild() {
      subRows = subRows.filter(f => !f.band); ctl.textContent = '';
      const b = band, t = el('div', 'chan-title'); t.textContent = 'pasmo ' + (b + 1) + ': ' + T.name(b); ctl.append(t);
      const list = [];
      ctl.append(mkRow('częstotliwość', {
        get: () => Math.log(T.f[b] / F_LO) / Math.log(F_HI / F_LO),
        set: p => { T.f[b] = niceHz(F_LO * Math.pow(F_HI / F_LO, p)); T.send(b); },
        text: () => hz(T.f[b]),
        ask: () => askNum('Częstotliwość pasma ' + (b + 1) + ' (Hz)', String(T.f[b]), 'Od 20 do 20000 Hz.', 20, 20000, d => { T.f[b] = Math.round(d); T.send(b); })
      }, list));
      ctl.append(mkRow('wzmocnienie', {
        mid: true, reset: 0.5,
        get: () => (T.g[b] + 15) / 30,
        set: p => { T.g[b] = Math.round((p * 30 - 15) * 2) / 2; T.send(b); },
        text: () => fmt(T.g[b]) + ' dB',
        ask: () => askNum('Wzmocnienie pasma ' + (b + 1) + ' (dB)', fmt(T.g[b]).replace('+', ''), 'Od -15 do +15, co 0,5 dB.', -15, 15, d => { T.g[b] = Math.round(d * 2) / 2; T.send(b); })
      }, list));
      if (T.q[b] > 0) ctl.append(mkRow('szerokość (Q)', {       // shelving bands report no Q: left as the mixer has them
        get: () => Math.log(qFrom(T.q[b]) / 0.3) / Math.log(10.3 / 0.3),
        set: p => { T.q[b] = qByte(0.3 * Math.pow(10.3 / 0.3, p)); T.send(b); },
        text: () => String(qFrom(T.q[b]).toFixed(1)).replace('.', ','),
        ask: () => askNum('Szerokość pasma ' + (b + 1) + ' (Q)', qFrom(T.q[b]).toFixed(1).replace('.', ','), 'Od 0,3 (szeroko) do 10,3 (wąsko).', 0.3, 10.3, d => { T.q[b] = qByte(d); T.send(b); })
      }, list));
      const zero = el('button', 'chan-switch small', { type: 'button' }); zero.textContent = 'wyzeruj korektor';
      zero.addEventListener('click', () => { for (let k = 0; k < T.g.length; k++) if (T.g[k]) { T.g[k] = 0; T.send(k); } render(); save(); });
      ctl.append(zero);
      list.forEach(f => { f.band = true; subRows.push(f); });
      chanRender();
    }
    subRows.push(draw);
    rebuild();
  }

  // ----- Effects: program and parameters of FX 1 / FX 2 (names as in the mixer), plus this channel's sends -----
  const P = (name, par, a, b) => ({ name, par, opt: [a, b] });
  const MODS = [P('FLANGER', 'mod speed', 'mono', 'stereo'), P('SOFT CHOR', 'density', 'trem off', 'trem on'), P('WARM CHOR', 'density', 'trem off', 'trem on'), P('DEEP CHOR', 'density', 'trem off', 'trem on')];
  const FX_PRESETS = [
    [P('AMBIENCE', 'decay', 'instrument', 'vocal'), P('PERC-REV1', 'decay', 'dull', 'bright'), P('PERC-REV2', 'decay', 'dull', 'bright'), P('GUIT-REV1', 'decay', 'less bass', 'more bass'),
      P('GUIT-REV2', 'decay', 'less bass', 'more bass'), P('CHAMBER', 'decay', 'pre-d off', 'pre-d on'), P('ROOM', 'decay', 'instrument', 'vocal'), P('CONCERT', 'decay', 'instrument', 'vocal'),
      P('CHURCH', 'decay', 'instrument', 'vocal'), P('CATHEDRAL', 'decay', 'small', 'large'), P('TEMPLE', 'decay', 'pre-d off', 'pre-d on'), P('STADIUM', 'decay', 'pre-d off', 'pre-d on')].concat(MODS),
    [P('DELAY 1/1', 'feedback', 'dull', 'bright'), P('DELAY 1/2', 'feedback', 'dull', 'bright'), P('DELAY 1/3', 'feedback', 'dull', 'bright'), P('DELAY 2/1', 'feedback', 'dull', 'bright'),
      P('ECHO 1/1', 'filter', 'soft', 'strong'), P('ECHO 1/2', 'filter', 'soft', 'strong'), P('ECHO 1/3', 'filter', 'soft', 'strong'), P('ECHO 2/1', 'filter', 'soft', 'strong'),
      P('WIDE ECHO', 'filter', 'wide', 'narrow'), P('PING PONG', 'filter', 'wide', 'narrow'), P('PING P 1/3', 'filter', 'wide', 'narrow'), P('PING P R>L', 'filter', 'wide', 'narrow')].concat(MODS)
  ];
  function openFx(i) {
    const body = subPage('efekty', i);
    [0, 1].forEach(n => {
      const bi = 3 + n, g = el('div', 'chan-group');
      const t = el('div', 'chan-title'); t.textContent = BUSES[bi].label; g.append(t);
      const grid = el('div', 'fx-grid');
      const btns = FX_PRESETS[n].map((pr, k) => {
        const b = el('button', 'fx-preset', { type: 'button' }); b.textContent = pr.name.toLowerCase();
        b.addEventListener('click', () => { S.fx[n].preset = k; bleFxPreset(n); render(); save(); });
        grid.append(b); return b;
      });
      g.append(grid);
      const parRow = mkRow('', {
        get: () => S.fx[n].v1 / 100,
        set: p => { S.fx[n].v1 = Math.round(p * 100); bleFxSetup(n); },
        text: () => String(S.fx[n].v1),
        ask: () => askNum(FX_PRESETS[n][S.fx[n].preset].par + ' (0 do 100)', String(S.fx[n].v1), 'Od 0 do 100.', 0, 100, d => { S.fx[n].v1 = Math.round(d); bleFxSetup(n); })
      }, subRows);
      g.append(parRow);
      const two = el('div', 'fx-two');
      const opts = [0, 1].map(v => {
        const b = el('button', 'chan-switch small', { type: 'button' });
        b.addEventListener('click', () => { S.fx[n].v2 = v; bleFxSetup(n); render(); save(); });
        two.append(b); return b;
      });
      g.append(two);
      g.append(mkRow('wysyłka kanału', {
        get: () => S.levels[bi][i] / 127,
        set: p => { S.levels[bi][i] = B.ready ? Math.round(p * 255) * 127 / 255 : Math.round(p * 127); sendLevelBus(i, bi); },
        text: () => levelDb(S.levels[bi][i]) + ' dB', ask: () => askLevel(i, bi)
      }, subRows));
      const mi = CHANNELS.findIndex(c => c.master);
      g.append(mkRow('powrót efektu', {
        get: () => S.levels[bi][mi] / 127,
        set: p => { S.levels[bi][mi] = B.ready ? Math.round(p * 255) * 127 / 255 : Math.round(p * 127); sendLevelBus(mi, bi); },
        text: () => levelDb(S.levels[bi][mi]) + ' dB', ask: () => askLevel(mi, bi)
      }, subRows));
      subRows.push(() => {
        const pr = FX_PRESETS[n][S.fx[n].preset] || FX_PRESETS[n][0];
        btns.forEach((b, k) => b.setAttribute('aria-pressed', k === S.fx[n].preset ? 'true' : 'false'));
        parRow.firstChild.textContent = pr.par;
        opts.forEach((b, v) => { b.textContent = pr.opt[v]; b.setAttribute('aria-pressed', S.fx[n].v2 === v ? 'true' : 'false'); });
      });
      body.append(g);
    });
    chanRender();
  }
  function askGain(i) {
    if (!CHANNELS[i].gain) return;
    ask('Gain ' + S.names[i] + ' (dB)', gainDb(S.gains[i]).replace('+', ''), 'Od -20 do +60, co 0,5 dB.', t => {
      const d = num(t); if (d === null || d < -20 || d > 60) return false;
      S.gains[i] = Math.round((d + 20) * 2) * 127 / 160; sendGain(i); render(); save();
    });
  }
  function askPan(i) {
    if (!panOk(i)) return;
    ask('Panorama ' + (CHANNELS[i].master ? BUSES[0].short : S.names[i]), panText(S.pans[i]), 'L1 do L50, C, R1 do R50. Sam minus też znaczy lewo.', t => {
      const m = /^([LR])\s*(\d+)$/i.exec(t);
      let v = /^c?$/i.test(t) ? 0 : m ? (m[1].toUpperCase() === 'L' ? -1 : 1) * +m[2] : num(t);
      if (v === null || Math.abs(v) > 50) return false;
      S.pans[i] = Math.round(v); sendPan(i); render(); save();
    });
  }
  const panText = v => v === 0 ? 'C' : (v < 0 ? 'L' : 'R') + Math.abs(v);
  function setPan(i, v) {
    const n = Math.max(-50, Math.min(50, Math.round(v)));
    if (n === S.pans[i] || !panOk(i)) return;
    S.pans[i] = n; sendPan(i); render(); save();
  }
  // phone held sideways: the layout is designed at 915 x 412 and scaled to the real screen
  let K = 1;
  function fit() {
    const compact = matchMedia('(orientation: landscape) and (max-height: 700px)').matches;
    const cs = getComputedStyle(document.body), px = v => parseFloat(v) || 0;
    const w = innerWidth - px(cs.paddingLeft) - px(cs.paddingRight), h = innerHeight - px(cs.paddingTop) - px(cs.paddingBottom);
    const tall = matchMedia('(orientation: portrait) and (min-width: 500px)').matches;
    K = compact ? Math.min(2, w / 899, h / 396) : 1;          // small tablets get the same layout, enlarged
    const root = document.documentElement.style;
    if (tall) {                                               // tablets held upright: the phone view, enlarged and centred
      K = Math.max(1, Math.min(w / 374, h / 828));
      const dw = Math.min(w / K, 440);
      root.setProperty('--dw', dw + 'px'); root.setProperty('--dx', (w - dw * K) / 2 + 'px');
    }
    root.setProperty('--k', K);
  }
  addEventListener('resize', fit); fit();
  // gain knob turns in 1 dB notches, each with a click and a short buzz like an old encoder
  let clickCtx = null;
  function audio() {
    clickCtx = clickCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (clickCtx.state === 'suspended') clickCtx.resume();
    return clickCtx;
  }
  function notch() {
    if (S.click === false) return;
    try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
    try {
      const c = audio(), t = c.currentTime, o = c.createOscillator(), g = c.createGain(), o2 = c.createOscillator(), g2 = c.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(2600, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.016);
      g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.026);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.03);
      // short low thump under the click, so the notch feels mechanical
      o2.type = 'sine'; o2.frequency.setValueAtTime(190, t); o2.frequency.exponentialRampToValueAtTime(70, t + 0.03);
      g2.gain.setValueAtTime(0.45, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o2.connect(g2); g2.connect(c.destination); o2.start(t); o2.stop(t + 0.045);
    } catch (e) {}
  }
  // soft hiss of a fader cap sliding in its slot: looped filtered noise, loudness follows the finger speed
  let hiss = null, hissAt = 0, hissV = 0;
  function slide(v) {
    if (S.click === false) return;
    try {
      const c = audio(), now = performance.now();
      if (!hiss) {
        const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
        for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
        const src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
        src.buffer = buf; src.loop = true; bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7; g.gain.value = 0;
        src.connect(bp); bp.connect(g); g.connect(c.destination); src.start();
        hiss = { g, bp };
      }
      const dt = Math.max(8, now - hissAt), speed = Math.min(1, Math.abs(v - hissV) / dt * 6);
      hissAt = now; hissV = v;
      const t = c.currentTime;
      hiss.g.gain.cancelScheduledValues(t);
      hiss.g.gain.setTargetAtTime(0.03 + speed * 0.11, t, 0.015);
      hiss.g.gain.setTargetAtTime(0, t + 0.07, 0.05);
      hiss.bp.frequency.setTargetAtTime(1600 + speed * 2600, t, 0.03);
    } catch (e) {}
  }
  function setGain(i, v) {
    const db = Math.max(-20, Math.min(60, Math.round(-20 + v * 80 / 127)));
    const n = (db + 20) * 127 / 80;
    if (Math.abs(n - S.gains[i]) < 0.01) return;
    S.gains[i] = n; notch(); sendGain(i); render(); save();
  }
  function select(i, scroll) {
    if (S.sel !== i) { S.sel = i; render(); save(); }
    if (scroll) scrollToSel(true);
  }
  function scrollToSel(smooth) {
    if (!portrait() || S.view === 'meters') return;
    const strips = $('#strips');
    strips.scrollTo({ left: S.sel * strips.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
  }
  function rename(i) {
    const n = (prompt('Nazwa kanału', S.names[i]) || '').trim().slice(0, 12);
    if (n) { S.names[i] = n; render(); save(); }
  }

  // ---------- Diagnostics ----------
  // Tap the version label: a log of raw Bluetooth frames, a "probe" button that asks the mixer
  // for every channel's state, and "copy" so the log can be pasted into the chat.
  const DIAG = { lines: [], t0: performance.now(), meterSeen: 0 };
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join(' ');
  function diagLog(dir, b) {
    if (b[0] === 0x22 && dir === '<' && (DIAG.meterSeen++ % 20)) return;   // keep 1 of 20 meter frames
    DIAG.lines.push(((performance.now() - DIAG.t0) / 1000).toFixed(2) + ' ' + dir + ' ' + hex(b));
    if (DIAG.lines.length > 1500) DIAG.lines.splice(0, 300);
    const ta = document.getElementById('diag-log');
    if (ta && !ta.closest('[hidden]')) { ta.value = DIAG.lines.slice(-400).join('\n'); ta.scrollTop = ta.scrollHeight; }
  }
  function diagOpen() {
    let d = document.getElementById('diag');
    if (!d) {
      d = el('section', 'diag', { id: 'diag', 'aria-label': 'Diagnostyka' });
      d.innerHTML = '<div class="diag-head"><b>Diagnostyka v' + APP_VERSION + '</b></div>' +
        '<textarea id="diag-log" readonly></textarea>' +
        '<div class="diag-keys"><button class="key wide" id="diag-probe" type="button">Badaj mikser</button>' +
        '<button class="key wide go" id="diag-copy" type="button">Kopiuj</button>' +
        '<button class="key wide" id="diag-close" type="button">Zamknij</button></div>';
      document.body.appendChild(d);
      $('#diag-close').addEventListener('click', () => { d.hidden = true; });
      $('#diag-probe').addEventListener('click', diagProbe);
      $('#diag-copy').addEventListener('click', diagCopy);
    }
    d.hidden = false;
    $('#diag-log').value = DIAG.lines.slice(-400).join('\n');
  }
  function diagProbe() {
    if (!B.ready) { toast('Najpierw połącz się z mikserem.'); return; }
    DIAG.lines.push('--- badanie ---');
    [0, 1, 2, 3, 4, 5, 6, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f].forEach(id => bleQueue('probe' + id, 0x16, [id]));  // GetChannelState
    bleQueue('probeLabels', 0x23, []);                                                              // GetChannelLabels
    bleQueue('probeState', 0x37, []);                                                               // GetMixerState
    bleQueue('probeSnaps', 0x07, []);
    toast('Pytam mikser o stan kanałów…');
  }
  async function diagCopy() {
    const levels = 'stan apki: ' + JSON.stringify({ levels: S.levels, gains: S.gains, mutes: S.mutes, solos: S.solos });
    const hx = a => (a || []).map(x => x.toString(16).padStart(2, '0')).join(' ');
    const met = 'wskaźniki: ramek ' + (B.meterN || 0) + ', ostatnia ' + hx(B.meterLast) + ', max ' + hx(B.meterMax);
    B.meterMax = null;                                              // next copy shows the max since this one
    const text = 'FLOW8 diag v' + APP_VERSION + '\n' + levels + '\n' + met + '\n' + DIAG.lines.join('\n');
    try { await navigator.clipboard.writeText(text); toast('Skopiowano. Wklej to w czacie.'); }
    catch (e) { const ta = $('#diag-log'); ta.value = text; ta.focus(); ta.select(); toast('Zaznaczyłem tekst: przytrzymaj i wybierz Kopiuj.'); }
  }

  // ---------- Meters ----------
  // Same as FLOW Mix: meter byte → dB with the fader law, then dB → 0..100 display scale
  // (XAIRClient::meterdbValueToLinearScaleValue), 12 dots on our strip.
  const byteDb = b => { const f = b / 255; return b <= 0 ? -144 : f >= 0.5 ? 40 * f - 30 : f >= 0.25 ? 80 * f - 50 : f >= 0.0625 ? 160 * f - 70 : 480 * f - 90; };
  const meterScale = x => x < -70 ? 0 : x < -60 ? 0.25 * (x + 70) : x < -50 ? 0.5 * (x + 60) + 2.5 : x < -40 ? 0.75 * (x + 50) + 7.5
    : x < -30 ? 1.5 * (x + 40) + 15 : x < -20 ? 2 * (x + 30) + 30 : x < 0 ? 2.5 * (x + 20) + 50 : 100;
  const metersLive = () => B.ready && B.meters && performance.now() - B.meterAt < 2000;
  // ----- full-screen views: 'faders' = only the volume faders of every channel, 'meters' = only tall level meters -----
  const SEG = 30, VIEWS = ['', 'faders', 'meters'], VIEW_NAMES = { '': 'Widok pełny', faders: 'Widok: same suwaki', meters: 'Widok: same wskaźniki' };
  let big = null, bigCols = [];
  function setView(v, quiet) {
    S.view = VIEWS.includes(v) ? v : '';
    const root = document.documentElement;
    root.classList.toggle('v-faders', S.view === 'faders'); root.classList.toggle('v-meters', S.view === 'meters');
    closeChan();
    const strips = $('#strips');
    setTimeout(() => scrollToSel(false), 0);
    if (S.view === 'meters' && !big) {
      big = el('section', 'big', { id: 'big', 'aria-label': 'Wskaźniki poziomu' });
      CHANNELS.forEach((c, i) => {
        const col = el('div', 'big-col'), bar = el('div', 'big-bar'), val = el('div', 'big-val'), name = el('div', 'big-name');
        for (let k = 0; k < SEG; k++) bar.appendChild(el('span'));
        const wrap = el('div', 'big-wrap'), mark = el('span', 'big-mark');
        wrap.append(bar, mark);
        const o = { bar, val, name, mark, peak: 0, peakAt: 0, dragAt: 0 };
        // finger on a column: pull up for louder, down for quieter (relative, so touching never jumps)
        let a = false, y0 = 0, v0 = 0;
        col.addEventListener('pointerdown', e => { a = true; y0 = e.clientY; v0 = S.levels[S.bus][i]; col.setPointerCapture(e.pointerId); select(i); o.dragAt = performance.now(); bigRender(); });
        col.addEventListener('pointermove', e => {
          if (!a) return;
          const p = Math.max(0, Math.min(1, v0 / 127 + (y0 - e.clientY) / Math.max(wrap.getBoundingClientRect().height, 60)));
          const v = B.ready ? Math.round(p * 255) * 127 / 255 : Math.round(p * 127);
          o.dragAt = performance.now();
          if (v === S.levels[S.bus][i]) return;
          S.levels[S.bus][i] = v; refs[i].fader.value = Math.round(v); slide(v); sendLevel(i); render(); save();
        });
        const end = () => { a = false; };
        col.addEventListener('pointerup', end); col.addEventListener('pointercancel', end);
        col.append(wrap, val, name); big.append(col); bigCols.push(o);
      });
      strips.after(big);
    }
    $('#view').setAttribute('aria-pressed', S.view ? 'true' : 'false');
    fit(); render(); save();
    if (!quiet) toast(VIEW_NAMES[S.view]);
  }
  function bigRender() {
    if (S.view !== 'meters' || !big) return;
    const live = metersLive(), now = performance.now();
    bigCols.forEach((o, i) => {
      const c = CHANNELS[i], db = live ? byteDb(B.meters[i] || 0) : null;
      const lvl = S.mutes[i] ? 0 : live ? meterScale(db) / 100 : S.levels[S.bus][i] / 127;
      const lit = Math.round(lvl * SEG);
      if (lit >= o.peak || now - o.peakAt > 1500) { o.peak = lit; o.peakAt = now; }
      [...o.bar.children].forEach((d, k) => {
        const idx = SEG - 1 - k;
        d.className = idx < lit ? (idx >= SEG - 3 ? 'on hot' : idx >= SEG - 8 ? 'on warm' : 'on') : idx === o.peak - 1 && o.peak > 0 ? 'peak' : '';
      });
      o.mark.style.bottom = S.levels[S.bus][i] / 127 * 100 + '%';
      const dragging = now - o.dragAt < 1200;
      o.val.classList.toggle('set', dragging);
      o.val.textContent = dragging ? levelDb(S.levels[S.bus][i]) : S.mutes[i] ? 'mute' : live ? (db < -70 ? '-∞' : fmt(Math.round(db))) .replace(',0', '') : levelDb(S.levels[S.bus][i]).replace(/,\d$/, '');
      o.name.textContent = c.master ? BUSES[S.bus].short : S.names[i];
      o.name.classList.toggle('sel', i === S.sel);
    });
  }
  function renderMeters() {
    bigRender();
    refs.forEach((r, i) => {
      const lit = S.mutes[i] ? 0 : Math.round(meterScale(byteDb(B.meters[i] || 0)) / 100 * ROWS);
      [...r.col.children].forEach((d, k) => {
        const idx = ROWS - 1 - k;
        d.className = idx < lit ? (idx >= ROWS - 2 ? 'on hot' : 'on') : '';
      });
    });
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
      // display column = live meter from the mixer when we get one, else the fader position
      const lit = muted ? 0 : Math.round(v / 127 * ROWS);
      if (!metersLive()) [...r.col.children].forEach((d, k) => {
        const idx = ROWS - 1 - k; // top dot first
        d.className = idx < lit ? (idx >= ROWS - 2 ? 'on hot' : 'on') : '';
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
      r.pan.style.setProperty('--p', (S.pans[i] + 50) / 100);
      r.pan.classList.toggle('none', !panOk(i));
      r.pan.classList.toggle('off', S.pans[i] !== 0);
      r.pan.lastChild.textContent = panText(S.pans[i]);
      r.pan.setAttribute('aria-valuenow', S.pans[i]);
      r.pan.setAttribute('aria-label', 'Panorama ' + S.names[i]);
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
    chanRender(); bigRender();
    $('#sel-gain').textContent = (sc.gain ? 'gain ' + gainDb(S.gains[S.sel]) + ' dB  ' : '') + (panOk(S.sel) ? 'pan ' + panText(S.pans[S.sel]) : '');
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
    $('#bpm').addEventListener('click', () => ask('Tempo (bpm)', String(M.bpm), 'Od 40 do 240.', t => { const d = num(t); if (d === null || d < 40 || d > 240) return false; setBpm(d); }));
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
  if (S.view) setView(S.view, true);
  requestAnimationFrame(() => scrollToSel(false));
  setConn('idle');
  // reconnect silently if permission was already granted earlier
  if (navigator.permissions && navigator.requestMIDIAccess) {
    navigator.permissions.query({ name: 'midi' }).then(p => { if (p.state === 'granted') connect(); }).catch(() => {});
  }
  if (NATIVE) setTimeout(bleConnect, 600);              // the app connects by itself
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !NATIVE) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
})();
