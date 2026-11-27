/* FLOW 8 Control: remote for the Behringer FLOW 8.
 * Two links: Bluetooth LE (two-way, protocol read from a FLOW Mix HCI log) and USB MIDI
 * (one-way, map from the FLOW 8 manual). The app keeps its own state, saved on the device. */
(() => {
  'use strict';
  const APP_VERSION = '0.65'; // bump on every release (shown on the display)
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
  // cap colours to choose from on the channel page: [cap, mark]
  const PALETTE = [['#E8501A', '#FFFFFF'], ['#2F5BEA', '#FFFFFF'], ['#F4F4F1', '#1C1C1C'], ['#1C1C1C', '#FFFFFF'], ['#A3A39E', '#1C1C1C'],
    ['#F2B807', '#1C1C1C'], ['#1FA36B', '#FFFFFF'], ['#D8345F', '#FFFFFF'], ['#8A4FE0', '#FFFFFF'], ['#22B8CF', '#1C1C1C']];
  const BUSES = [
    // dst = bus id on the Bluetooth link (MAIN 0x0f, MON1 0x0a, MON2 0x0b, FX1 0x0c, FX2 0x0d)
    { id: 'main', label: 'sala',      short: 'sala',  midi: 8,  sendCC: 7,  dst: 0x0f },
    { id: 'mon1', label: 'odsłuch 1', short: 'mon 1', midi: 9,  sendCC: 14, dst: 0x0a },
    { id: 'mon2', label: 'odsłuch 2', short: 'mon 2', midi: 10, sendCC: 15, dst: 0x0b },
    { id: 'fx1',  label: 'efekt 1',   short: 'fx 1',  midi: 11, sendCC: 16, dst: 0x0c },
    { id: 'fx2',  label: 'efekt 2',   short: 'fx 2',  midi: 12, sendCC: 17, dst: 0x0d }
  ];
  // one mute icon for every channel: headphones, crossed out (and red) when muted
  const MUTE_ICON = '<svg class="dotted" viewBox="0 0 31.0 28.8" aria-hidden="true"><circle cx="11.0" cy="4.4" r="0.85"/><circle cx="13.2" cy="4.4" r="0.85"/><circle cx="15.4" cy="4.4" r="0.85"/><circle cx="17.6" cy="4.4" r="0.85"/><circle cx="19.8" cy="4.4" r="0.85"/><circle cx="6.6" cy="6.6" r="0.85"/><circle cx="8.8" cy="6.6" r="0.85"/><circle cx="22.0" cy="6.6" r="0.85"/><circle cx="24.2" cy="6.6" r="0.85"/><circle cx="4.4" cy="8.8" r="0.85"/><circle cx="26.4" cy="8.8" r="0.85"/><circle cx="2.2" cy="11.0" r="0.85"/><circle cx="28.6" cy="11.0" r="0.85"/><circle cx="2.2" cy="13.2" r="0.85"/><circle cx="28.6" cy="13.2" r="0.85"/><circle cx="2.2" cy="15.4" r="0.85"/><circle cx="28.6" cy="15.4" r="0.85"/><circle cx="2.2" cy="17.6" r="0.85"/><circle cx="4.4" cy="17.6" r="0.85"/><circle cx="6.6" cy="17.6" r="0.85"/><circle cx="24.2" cy="17.6" r="0.85"/><circle cx="26.4" cy="17.6" r="0.85"/><circle cx="28.6" cy="17.6" r="0.85"/><circle cx="2.2" cy="19.8" r="0.85"/><circle cx="4.4" cy="19.8" r="0.85"/><circle cx="6.6" cy="19.8" r="0.85"/><circle cx="24.2" cy="19.8" r="0.85"/><circle cx="26.4" cy="19.8" r="0.85"/><circle cx="28.6" cy="19.8" r="0.85"/><circle cx="2.2" cy="22.0" r="0.85"/><circle cx="4.4" cy="22.0" r="0.85"/><circle cx="6.6" cy="22.0" r="0.85"/><circle cx="24.2" cy="22.0" r="0.85"/><circle cx="26.4" cy="22.0" r="0.85"/><circle cx="28.6" cy="22.0" r="0.85"/><circle cx="2.2" cy="24.2" r="0.85"/><circle cx="4.4" cy="24.2" r="0.85"/><circle cx="6.6" cy="24.2" r="0.85"/><circle cx="24.2" cy="24.2" r="0.85"/><circle cx="26.4" cy="24.2" r="0.85"/><circle cx="28.6" cy="24.2" r="0.85"/><circle cx="4.4" cy="26.4" r="0.85"/><circle cx="6.6" cy="26.4" r="0.85"/><circle cx="24.2" cy="26.4" r="0.85"/><circle cx="26.4" cy="26.4" r="0.85"/><g class="slash"><circle cx="2.2" cy="2.2" r="1.0"/><circle cx="4.4" cy="4.2" r="1.0"/><circle cx="6.6" cy="6.2" r="1.0"/><circle cx="8.8" cy="8.2" r="1.0"/><circle cx="11.0" cy="10.3" r="1.0"/><circle cx="13.2" cy="12.3" r="1.0"/><circle cx="15.4" cy="14.3" r="1.0"/><circle cx="17.6" cy="16.3" r="1.0"/><circle cx="19.8" cy="18.3" r="1.0"/><circle cx="22.0" cy="20.4" r="1.0"/><circle cx="24.2" cy="22.4" r="1.0"/><circle cx="26.4" cy="24.4" r="1.0"/><circle cx="28.6" cy="26.4" r="1.0"/></g></svg>';   // headphones drawn from dots, like the display font
  const ROWS = 15;   // dots per meter column on the display
  const CC = { level: 7, mute: 5, solo: 6, gain: 8 };
  const GLOBAL_CH = 16;
  const STORE = 'flow8-control-v1';

  const fresh = () => ({
    theme: (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
    bus: 0, sel: 0, scene: 0,
    icons: CHANNELS.map(() => 0), lim: [0, 0, 0], dly: [0, 0, 0], cfg: {}, tempo: 120, hp: null, scope: 31,
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
    ['icons', 'lim', 'dly', 'cfg', 'tempo', 'scope'].forEach(k => { if (S[k] === undefined || S[k] === null) S[k] = f0[k]; });
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
    if (!fine()) return fmt(-70 + (v - 1) * 80 / 126);
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
  // the mixer's own scale (0-255 steps, 0.5 dB readout) applies always, except while a USB MIDI cable is the link
  const fine = () => B.ready || !out;
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
    bleQueue('x' + n, 0x11, [0x0c + n, f.v1, f.v2, f.v3, f.en >> 1 & 7]);   // main/mon1/mon2 are bools: FLOW Mix packs them into one byte (bit0 main)
  }
  function bleFxPreset(n) {
    bleQueue('xp' + n, 0x31, [0x0c + n, S.fx[n].preset]);
    setTimeout(() => bleQueue('state', 0x37, []), 400);          // the new program brings its own parameter values
  }
  // ----- mixer settings, routing, snapshots, labels, limiter (formats read from the FLOW Mix command table) -----
  // 0x25 Setting = [id][len=1][value]; ids: 2 BT/USB play to phones only, 3 foot switch (1 = snapshots, 0 = FX mute/tap),
  // 7 USB streaming mode, 8 MON 1/2 source (0 mon, 1 USB 1/2, 2 USB 3/4), 9 ch 5/6 = USB 1/2, 10 ch 7/8 = USB 3/4,
  // 11 monitor stereo link, 12 phones from monitor, 13 phones post fader, 14 main -10 dBV pad, 15 monitor pad, 17 monitor post fader
  const utf8 = t => { const out = []; for (const ch of t) { const b = new TextEncoder().encode(ch); if (out.length + b.length > 20) break; out.push(...b); } return out; };   // never cut a letter in half
  const text8 = b => { try { return new TextDecoder().decode(new Uint8Array(b)); } catch (e) { return String.fromCharCode(...b); } };
  function bleSetting(id, val) { S.cfg[id] = val; B.touched.set('s' + id, performance.now()); bleQueue('s' + id, 0x25, [id, 1, val]); }
  function bleLimiter(bi) { B.touched.set('lim' + bi, performance.now()); bleQueue('lim' + bi, 0x14, [BUSES[bi].dst, Math.max(0x3c, Math.min(0x78, Math.round((S.lim[bi] + 60) * 2)))]); }
  function bleLabel(i) { const c = CHANNELS[i]; if (c.master) return; const t = utf8(S.names[i]); bleQueue('lab' + i, 0x05, [c.ble, S.icons[i] >> 8 & 255, S.icons[i] & 255, t.length, ...t]); }
  function bleTempo() { bleQueue('tempo', 0x40, [S.tempo >> 8 & 255, S.tempo & 255]); }
  const bleSnapList = () => bleQueue('snaps', 0x07, []);
  function bleSnap(cmd, slot, name) {
    const t = name === undefined ? [] : utf8(name);
    bleQueue('snap' + cmd + ':' + slot, cmd, name === undefined ? [slot] : [slot, t.length, ...t]);
    setTimeout(bleSnapList, 500);
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
  function bleSolo(i) { const c = CHANNELS[i]; if (!c.master) bleQueue('so' + i, 0x01, [c.ble, S.solos[i] ? 1 : 0]); }
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
    if (B.connecting) return;                       // a second tap while connecting would start a second, competing attempt
    B.connecting = true;
    try { await bleConnectInner(); } finally { B.connecting = false; }
  }
  async function bleConnectInner() {
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
      const key = cmd + ':' + b[2], parts = b[3] === 0 ? [] : B.frags.get(key) || [];
      parts[b[3]] = b.slice(4, -1); B.frags.set(key, parts);
      if (parts.filter(Boolean).length < count) return;
      B.frags.delete(key);
      p = new Uint8Array(parts.reduce((a, x) => a.concat(Array.from(x)), []));
    }
    bleHandle(cmd, p);
  }
  // meters for inputs 1-4 (0x40+), 5/6, 7/8, USB (0xC0+ = stereo) and MAIN, as FLOW Mix asks
  // While the measuring page is open we also ask for the two monitor outputs (0x4a, 0x4b) in the spare slots of the frame.
  // FLOW Mix only ever asks for 8 meters, so if the mixer stops answering, we fall back to its exact request.
  function bleMeterRequest() {
    const ext = MS.open && MS.ext !== false;
    const ids = [0x40, 0x41, 0x42, 0x43, 0xc4, 0xc5, 0xc6, 0xcf].concat(ext ? [0x4a, 0x4b] : []);
    const list = [ids.length].concat(ids); while (list.length < 16) list.push(0);
    if (ext) MS.extAt = performance.now();
    bleQueue('meters', 0x21, list);
  }
  setInterval(() => {
    if (!B.ready) return;
    const t = performance.now();
    // the extended request got no answer: go back to the factory request for good
    if (MS.extAt && MS.ext !== false && t - (B.meterAt || 0) > 2500 && t - MS.extAt > 2500 && (B.meterAt || 0) < MS.extAt) { MS.ext = false; MS.extAt = 0; bleMeterRequest(); return; }
    if (t - (B.meterAt || 0) > 3000) bleMeterRequest();
  }, 1000);
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
        while (k < p.length && names.length < 15) { names.push(text8(p.slice(k + 1, k + 1 + p[k]))); k += 1 + p[k]; }   // an empty slot is a zero length
        B.snapshots = names; chanRender(); break;
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
        Object.assign(S.fx[n], { v1: Math.min(100, p[1]), v2: p[2] ? 1 : 0, v3: p[3] }); if (p.length > 4) S.fx[n].en = S.fx[n].en & 1 | (p[4] & 7) << 1; render(); save(); break;
      }
      case 0x31: { const n = p[0] - 0x0c; if (n === 0 || n === 1) { S.fx[n].preset = p[1] & 15; render(); save(); } break; }
      case 0x15: { const i = idx(p[0]); if (i >= 0) { S.p48[i] = !!p[1]; render(); save(); } break; }
      case 0x10: { const i = idx(p[0]); if (i >= 0) { S.phase[i] = !!p[1]; render(); save(); } break; }
      case 0x08: { const i = idx(p[0]); if (i >= 0) { S.mutes[i] = !!p[1]; render(); save(); } break; }
      case 0x01: { const i = idx(p[0]); if (i >= 0) { S.solos[i] = !!p[1]; render(); save(); } break; }
      case 0x25: {                                                // setting: [id][len][value]
        if (p[1] === 1 && now - (B.touched.get('s' + p[0]) || 0) > 400) { S.cfg[p[0]] = p[2]; chanRender(); save(); }
        break;
      }
      case 0x14: {                                                // output limiter: [bus][byte], dB = byte / 2 - 60
        const bi = BUSES.findIndex(x => x.dst === p[0]);
        if (bi >= 0 && bi < 3 && now - (B.touched.get('lim' + bi) || 0) > 400) { S.lim[bi] = p[1] / 2 - 60; chanRender(); save(); }
        break;
      }
      case 0x4a: {                                                // output delay: [bus][u32 samples at 48 kHz]
        const bi = BUSES.findIndex(x => x.dst === p[0]);
        if (bi >= 0 && bi < 3) { S.dly[bi] = ((p[1] << 24 | p[2] << 16 | p[3] << 8 | p[4]) >>> 0) / 48; chanRender(); save(); }
        break;
      }
      case 0x05: {                                                // channel label: [id][icon u16][len][text]
        const i = idx(p[0]);
        if (i >= 0 && p[3]) { S.icons[i] = p[1] << 8 | p[2]; S.names[i] = text8(p.slice(4, 4 + p[3])); render(); save(); }
        break;
      }
      case 0x40: { S.tempo = p[0] << 8 | p[1]; chanRender(); save(); break; }
      case 0x38: bleMixerState(p); break;                         // full state (after connect / scene load)
      case 0x22: {                                                // meters: 15 values, same byte→dB law as faders (FLOW Mix)
        const v = Array.from(p.slice(0, 15)), mx = (a, b) => Math.max(v[a] || 0, v[b] || 0);
        B.meters = [v[0], v[1], v[2], v[3], mx(4, 5), mx(6, 7), mx(8, 9), mx(10, 11)]; B.meterAt = now;
        B.meterN = (B.meterN || 0) + 1; B.meterLast = Array.from(p); B.meterMax = Array.from(p).map((x, k) => Math.max(x, (B.meterMax || [])[k] || 0));
        B.gr = p.length >= 17 ? p[15] << 8 | p[16] : 0;           // 2 bits per input channel (0-3), top 2 bits = outputs
        measureFeed(p, now);
        if (chanOpen >= 0 || document.getElementById('sub')) chanRender();
        renderMeters(); break;
      }
    }
  }
  // MixerState layout (read from Arek's mixer, 2026-11-25):
  //  7 input records: [id][flags][gain][00 00 14][5 B][8 B][7 B][labelLen][label]
  //  MAIN 0x0f / MON 0x0a,0x0b (52 B): [id][00][master][7f][3c][7 sends: ch1-4,5/6,7/8,USB][9 GEQ][18 B freqs][9 B][4 B]
  //  FX 0x0c,0x0d (17 B): [id][00][92][7f][x][3 B][7 sends][2 B]
  function bleMixerState(p) {
    B.stateRaw = Array.from(p);
    let k = 0;
    const gains = [];
    const flags = [], pans = [], recs = [], labels = [], icons = [];
    for (let ch = 0; ch < 7; ch++) {
      if (p[k] !== ch || k + 27 > p.length) return;               // layout not as expected: ignore
      recs[ch] = p.slice(k, k + 27);   // +3 squeezer, +4 low cut u16, +7 EQ gains, +11 EQ freqs u16, +19 EQ Q
      labels[ch] = p[k + 26] ? text8(p.slice(k + 27, k + 27 + p[k + 26])) : ''; icons[ch] = p[k + 23 + 1] << 8 | p[k + 23 + 2];
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
        if (bi < 3) { S.lim[bi] = Math.max(-30, Math.min(0, p[k + 4] / 2 - 60)); S.dly[bi] = ((p[k + 48] << 24 | p[k + 49] << 16 | p[k + 50] << 8 | p[k + 51]) >>> 0) / 48; }
        master[bi] = p[k + 2]; if (id === 0x0f) { mainMute = !!(p[k + 1] & 1); mainPan = p[k + 3]; } lv[bi] = Array.from(p.slice(k + 5, k + 12)); k += 52;
      }
    }
    if (p.length - k >= 9) {            // settings tail: phones volume, two bytes of switches, FX tempo, selected bus, last snapshot, MON source, snapshot scope
      const a = p[k + 1], b = p[k + 2];
      S.hp = p[k];
      Object.assign(S.cfg, { 1: a & 1, 2: a >> 1 & 1, 3: a >> 2 & 1, 7: a >> 4 & 1, 9: a >> 5 & 1, 10: a >> 6 & 1, 11: a >> 7 & 1, 12: b & 1, 13: b >> 1 & 1, 14: b >> 2 & 1, 15: b >> 3 & 1, 17: b >> 4 & 1, 8: p[k + 7] });
      S.tempo = p[k + 3] << 8 | p[k + 4]; S.scope = p[k + 8];
      const last = p[k + 6] > 127 ? -1 : p[k + 6]; if (last >= 0) S.scene = last;
    }
    { const low = [0, 1, 2].filter(b => S.lim[b] <= -15).map(b => BUSES[b].short); if (low.length) toastOnce('lim' + low.join(), 'Uwaga: limiter (' + low.join(', ') + ') ma niski próg i mocno ścisza głośne dźwięki. Zmienisz to w Ustawieniach miksera.'); }
    const to127 = x => x * 127 / 255;
    CHANNELS.forEach((c, i) => {
      if (c.master) return;
      if (c.gain) S.gains[i] = Math.max(0, Math.min(127, (gains[c.ble] - 0x50) * 127 / 160));
      S.mutes[i] = !!(flags[c.ble] & 1); S.solos[i] = !!(flags[c.ble] & 0x40); S.pans[i] = panFrom(pans[c.ble]);
      const r = recs[c.ble];
      if (labels[c.ble]) S.names[i] = labels[c.ble]; S.icons[i] = icons[c.ble] || 0;
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
      access.onstatechange = () => { pickOutput(); webMidiInputs(); };
      pickOutput(); webMidiInputs();
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

      const head = el('div', 's-head');
      const num = el('span', 's-num'); num.textContent = c.num;
      const name = el('button', 's-name', { type: 'button', title: 'Przytrzymaj, aby zmienić nazwę' });
      name.addEventListener('dblclick', () => rename(i));
      onHold(name, () => rename(i));
      const lock = el('span', 's-lock', { 'aria-label': 'zablokowany' });
      lock.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
      head.append(num, name, lock);

      const knobWrap = el('div', 's-knob' + (c.gain ? '' : ' none'));
      const knob = el('div', 'knob', { role: 'slider', tabindex: c.gain ? '0' : '-1', 'aria-valuemin': '0', 'aria-valuemax': '127' });
      const kl = el('span', 's-knob-label'); kl.textContent = 'gain';
      knobWrap.append(knob, kl);
      if (c.gain) bindKnob(knob, i);

      const keys = el('div', 's-keys');
      const mute = el('button', 'key mute' + (c.master ? ' none' : ''), { type: 'button', 'aria-pressed': 'false' });
      mute.innerHTML = c.master ? '' : MUTE_ICON;
      mute.addEventListener('click', () => { if (locked(i)) return; S.mutes[i] = !S.mutes[i]; sendMute(i); select(i); render(); save(); });
      const solo = el('button', 'key solo' + (c.master ? ' none' : ''), { type: 'button', 'aria-pressed': 'false' });
      solo.textContent = 'S';
      solo.addEventListener('click', () => { if (locked(i)) return; S.solos[i] = !S.solos[i]; sendSolo(i); select(i); render(); save(); });
      if (c.master) {
        // master strip: tap tempo instead of mute/solo (FX2 delays follow it)
        const tap = el('button', 'key tap', { type: 'button', 'aria-label': 'Tap tempo efektu' });
        tap.textContent = 'TAP';
        tap.addEventListener('click', fxTap);
        keys.append(tap);
      } else {
        keys.append(mute, solo);
      }

      const pan = el('div', 's-pan', { role: 'slider', tabindex: '0', 'aria-valuemin': '-50', 'aria-valuemax': '50' });
      pan.append(el('span', 'pan-dot'), el('span', 'pan-val'));
      bindPan(pan, i);

      const faderWrap = el('div', 's-fader');
      const fader = el('input', 'fader', { type: 'range', min: '0', max: '127', step: '1' });
      // The browser's own slider handling may only act for the keyboard. A touch that slips past our handlers
      // (Chrome does this for a quick touch right after another gesture, e.g. after turning the gain knob)
      // would otherwise pull the fader to the finger, so anything else is put back at once.
      let keyAt = 0;
      fader.addEventListener('keydown', () => { keyAt = performance.now(); });
      fader.addEventListener('input', () => {
        if (performance.now() - keyAt > 600 || lk(i)) { fader.value = Math.round(S.levels[S.bus][i]); return; }
        S.levels[S.bus][i] = +fader.value; sendLevel(i); select(i); render(); save();
      });
      // own drag handling: Android Chrome does not drag vertical native ranges reliably
      const setFader = v => {
        // over Bluetooth use the mixer's own 0-255 steps (half as coarse as 0-127), so the dB readout moves in 0.5 dB steps
        v = Math.max(0, Math.min(127, fine() ? Math.round(v * 255 / 127) * 127 / 255 : Math.round(v)));
        if (v === S.levels[S.bus][i]) return;
        fader.value = Math.round(v); S.levels[S.bus][i] = v; slide(v); sendLevel(i); render(); save();
      };
      let drag = null; const det = detent('detF', zeroPos);
      fader.addEventListener('pointerdown', e => {
        e.preventDefault(); select(i); fader.focus({ preventScroll: true });
        fader.setPointerCapture(e.pointerId);
        const r = fader.getBoundingClientRect(), th = (portrait() ? 56 : 34) * K;
        const travel = r.height - th, cur = +fader.value;
        const thumbY = r.bottom - th / 2 - cur / 127 * travel;
        drag = { id: e.pointerId, travel: travel * drag_res('resF'), y0: e.clientY, v0: S.levels[S.bus][i] }; det.start(drag.v0);
        // Only the cap moves the fader (FLOW Mix never jumps to the touched spot either):
        // a finger brushing the track must not change the mix.
        if (Math.abs(e.clientY - thumbY) > th / 2 + 10 * K || lk(i)) drag = null;
      });
      fader.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        e.preventDefault();
        setFader(det.map(drag.v0 + (drag.y0 - e.clientY) / drag.travel * 127, 127 / drag.travel));
      });
      fader.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
      const endDrag = () => { drag = null; };
      fader.addEventListener('pointerup', endDrag);
      fader.addEventListener('pointercancel', endDrag);
      fader.addEventListener('lostpointercapture', endDrag);
      const ticks = el('div', 'ticks', { 'aria-hidden': 'true' });
      // tick positions: +10, 0, -10, -30, -50, off (0 dB highlighted)
      [10, 0, -10, -30, -50, -70].forEach(db => {
        const t = el('span', db === 0 ? 'zero' : '');
        t.style.setProperty('--p', { 10: 1, 0: 0.75, '-10': 0.5, '-30': 0.25, '-50': 0.125, '-70': 0 }[db]);   // the mixer's own fader law (0 dB at three quarters)
        ticks.appendChild(t);
      });
      faderWrap.append(fader, ticks);
      // holding the fader still opens the channel page
      let hold = 0, hx = 0, hy = 0;
      const unhold = () => { clearTimeout(hold); hold = 0; };
      faderWrap.addEventListener('pointerdown', e => {
        hx = e.clientX; hy = e.clientY; unhold();
        hold = setTimeout(() => { hold = 0; drag = null; if (navigator.vibrate) navigator.vibrate(15); if (CHANNELS[i].master) { if (S.bus < 3) openEq(eqOutput(S.bus)); else openMasterColor(i); } else openChan(i); }, 550);
      });
      faderWrap.addEventListener('pointermove', e => { if (hold && Math.hypot(e.clientX - hx, e.clientY - hy) > 8) { unhold(); locked(i); } });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => faderWrap.addEventListener(t, unhold));

      const val = el('div', 's-val');
      val.addEventListener('click', () => { select(i); if (!locked(i)) askLevel(i); });
      kl.addEventListener('click', () => { select(i); if (!locked(i)) askGain(i); });

      strip.append(head, knobWrap, keys, pan, faderWrap, val);
      strips.appendChild(strip);

      const pg = el('button', '', { type: 'button', 'aria-label': 'Kanał ' + (i + 1) });
      pg.appendChild(el('span'));
      pg.addEventListener('click', () => select(i, true));
      pager.appendChild(pg);

      refs.push({ col, strip, name, knob, kl, mute, solo, fader, val, pg, pan });
      paint(i);
    });

    // scenes = mixer snapshots 1..4 (global channel, program change)
    const scenes = $('#scenes');
    for (let n = 1; n <= 4; n++) {
      const b = el('button', 'scene', { type: 'button', 'aria-pressed': 'false', 'aria-label': 'Wczytaj scenę ' + n + ' z miksera' });
      b.textContent = n;
      b.addEventListener('click', () => {
        if (!B.ready && !out) { toast('Najpierw połącz się z mikserem.'); return; }
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
    // the lamp always opens the menu (also in the Android app and while connected), it never connects or disconnects by itself
    cbtn.addEventListener('click', e => {
      e.stopPropagation();
      $('#conn-ble').textContent = B.ready ? 'Rozłącz' : 'Połącz';
      $('#conn-usb').hidden = !!NATIVE;
      menu.hidden = !menu.hidden; cbtn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
    // four containers: opening one closes the others
    menu.querySelectorAll('.menu-sec').forEach(h => h.addEventListener('click', e => {
      e.stopPropagation();
      const open = h.getAttribute('aria-expanded') !== 'true';
      menu.querySelectorAll('.menu-sec').forEach(x => { x.setAttribute('aria-expanded', 'false'); x.nextElementSibling.hidden = true; });
      h.setAttribute('aria-expanded', open ? 'true' : 'false'); h.nextElementSibling.hidden = !open;
    }));
    $('#conn-ble').addEventListener('click', () => { closeMenu(); if (B.ready && confirmDisconnect()) return; bleConnect(); });
    $('#conn-usb').addEventListener('click', () => { closeMenu(); connect(); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
    $('#open-setup').addEventListener('click', () => { closeMenu(); openSetup(); });
    $('#sync').addEventListener('click', () => { closeMenu(); syncAll(); });
    $('#open-measure').addEventListener('click', () => { closeMenu(); openMeasure(); });
    $('#open-scenes').addEventListener('click', () => { closeMenu(); openScenes(); });
    $('#sel-level').addEventListener('click', () => { if (!locked(S.sel)) askLevel(S.sel); });
    $('#sel-gain').addEventListener('click', () => { if (!locked(S.sel)) CHANNELS[S.sel].gain ? askGain(S.sel) : askPan(S.sel); });
    $('#open-app').addEventListener('click', () => { closeMenu(); openApp(); });
    $('#open-presets').addEventListener('click', () => { closeMenu(); openPresets(); });
    $('#open-setlist').addEventListener('click', () => { closeMenu(); openSetlist(); });
    onHold($('#sel-name'), () => { if (!CHANNELS[S.sel].master) rename(S.sel); });
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

  // the channel's colour (fader cap and gain knob): the user's choice from PALETTE, else the built-in one
  // 'colF' = fader cap, 'colK' = gain knob; each entry is a PALETTE index or an own colour [hue, saturation, lightness]
  if (S.colors && !S.colF) { S.colF = S.colors.slice(); S.colK = S.colors.slice(); }
  delete S.colors;
  function hslHex(h, sat, l) {
    sat /= 100; l /= 100;
    const a = sat * Math.min(l, 1 - l), fn = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    const rgb = [fn(0), fn(8), fn(4)];
    const hex = '#' + rgb.map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    return [hex, 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 0.6 ? '#1C1C1C' : '#FFFFFF'];   // the mark is dark on light caps
  }
  function capOf(i, key) {
    const v = S[key] && S[key][i];
    if (Array.isArray(v)) return hslHex(v[0], v[1], v[2]);
    return PALETTE[v] || [CHANNELS[i].cap, CHANNELS[i].mark];
  }
  function paint(i) {
    const r = refs[i]; if (!r) return;
    const f = capOf(i, 'colF'), k = capOf(i, 'colK');
    r.strip.style.setProperty('--cap', f[0]); r.strip.style.setProperty('--mark', f[1]);
    r.knob.style.setProperty('--cap', k[0]); r.knob.style.setProperty('--mark', k[1]);
  }
  // colour chooser: the palette, plus an own colour mixed with three sliders
  function colorGroup(body, title, key, i, rows) {
    const g = el('div', 'chan-group'), t = el('div', 'chan-title'), box = el('div', 'chan-colors'); t.textContent = title; g.append(t, box);
    const put = v => { S[key] = S[key] || []; S[key][i] = v; paint(i); chanRender(); save(); };
    const own = () => Array.isArray(S[key] && S[key][i]) ? S[key][i] : null;
    PALETTE.forEach((pc, k) => {
      const b = el('button', 'chan-color', { type: 'button', 'aria-label': 'Kolor ' + (k + 1), 'aria-pressed': 'false' });
      b.style.setProperty('--cap', pc[0]); b.style.setProperty('--mark', pc[1]);
      b.addEventListener('click', () => put(k));
      rows.push(() => { const c = capOf(i, key); b.setAttribute('aria-pressed', !own() && c[0] === pc[0] && c[1] === pc[1] ? 'true' : 'false'); });
      box.append(b);
    });
    const ob = el('button', 'chan-color own', { type: 'button', 'aria-pressed': 'false' }); ob.textContent = 'własny';
    S.ownCol = S.ownCol || {};
    ob.addEventListener('click', () => { if (!own()) put((S.ownCol[key] || [150, 70, 45]).slice()); });
    box.append(ob);
    const mix = (label, n, max, unit) => {
      const r = mkRow(label, {
        get: () => (own() || [0, 0, 0])[n] / max,
        set: p => { const o = own(); if (!o) return; o[n] = Math.round(p * max); S.ownCol[key] = o.slice(); paint(i); },
        text: () => (own() || [0, 0, 0])[n] + unit,
        ask: () => askNum(label + ' (0-' + max + ')', String((own() || [0, 0, 0])[n]), '', 0, max, d => { const o = own(); if (o) { o[n] = Math.round(d); S.ownCol[key] = o.slice(); paint(i); } })
      }, rows);
      g.append(r); return r;
    };
    const m = [mix('barwa', 0, 360, '°'), mix('nasycenie', 1, 100, '%'), mix('jasność', 2, 100, '%')];
    rows.push(() => {
      const o = own(); m.forEach(r => { r.hidden = !o; });
      ob.setAttribute('aria-pressed', o ? 'true' : 'false');
      if (o) { const c = hslHex(o[0], o[1], o[2]); ob.style.background = c[0]; ob.style.color = c[1]; } else { ob.style.background = ''; ob.style.color = ''; }
    });
    body.append(g);
  }
  // holding the master fader on fx 1 / fx 2 (no output EQ there): just its colour
  function openMasterColor(i) { const body = subPage('kolor', S.names[i] || 'main'); colorGroup(body, 'kolor suwaka', 'colF', i, subRows); chanRender(); }
  function bindKnob(knob, i) {
    let startY = 0, startV = 0, active = false; const det = detent('detK', () => GAIN_ZERO);
    knob.addEventListener('pointerdown', e => {
      knob.setPointerCapture(e.pointerId); active = !lk(i); startY = e.clientY; startV = S.gains[i]; det.start(startV); select(i);
      // holding the knob still opens the channel page, like holding the fader
      hx = e.clientX; hy = e.clientY; clearTimeout(hold);
      hold = setTimeout(() => { hold = 0; active = false; bump(true); openChan(i); }, 550);
    });
    let hold = 0, hx = 0, hy = 0;
    knob.addEventListener('pointermove', e => { if (hold && Math.hypot(e.clientX - hx, e.clientY - hy) > 8) { clearTimeout(hold); hold = 0; locked(i); } });
    ['pointerup', 'pointercancel'].forEach(k => knob.addEventListener(k, () => { clearTimeout(hold); hold = 0; }));
    knob.addEventListener('pointermove', e => {
      if (!active) return;
      const scale = (portrait() ? 0.5 : 0.8) / K / drag_res('resK');
      setGain(i, det.map(startV + (startY - e.clientY) * scale, scale));
    });
    const end = () => { active = false; };
    knob.addEventListener('pointerup', end);
    knob.addEventListener('pointercancel', end);
    knob.addEventListener('wheel', e => { e.preventDefault(); if (lk(i)) return; setGain(i, S.gains[i] - Math.sign(e.deltaY) * 1.6); }, { passive: false });
    knob.addEventListener('keydown', e => {
      const d = { ArrowUp: 1.6, ArrowRight: 1.6, ArrowDown: -1.6, ArrowLeft: -1.6, PageUp: 8, PageDown: -8 }[e.key];
      if (d && !lk(i)) { e.preventDefault(); setGain(i, S.gains[i] + d); }
    });
  }
  // pan: drag sideways, double tap = centre
  function bindPan(pan, i) {
    let active = false, startX = 0, startV = 0, lastTap = 0;
    pan.lastChild.addEventListener('pointerdown', e => { e.stopPropagation(); });
    pan.lastChild.addEventListener('click', e => { e.stopPropagation(); select(i); if (!locked(i)) askPan(i); });
    pan.addEventListener('pointerdown', e => {
      if (locked(i)) return;
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
      if (lk(i)) return;
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
        if (fine()) {                                      // the mixer step whose display is closest to the typed value
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
    onHold(name, () => { rename(i); name.textContent = S.names[i]; });
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
    group('poziomy', (CHANNELS[i].gain ? [row('gain', {
      get: () => S.gains[i] / 127, set: p => setGain(i, p * 127),
      text: () => gainDb(S.gains[i]).replace(',0', '') + ' dB', ask: () => askGain(i)
    })] : []).concat(BUSES.map((b, bi) => row(b.label, {
      get: () => S.levels[bi][i] / 127,
      set: p => { S.levels[bi][i] = fine() ? Math.round(p * 255) * 127 / 255 : Math.round(p * 127); sendLevelBus(i, bi); },
      text: () => levelDb(S.levels[bi][i]) + ' dB', ask: () => askLevel(i, bi)
    }))), '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>', () => openFx(i));
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
        text: () => { const g = B.ready ? (B.gr || 0) >> (CHANNELS[i].ble * 2) & 3 : 0; return (g ? '•'.repeat(g) + ' ' : '') + S.comp[i] + ' %'; },   // dots = gain reduction right now (0-3)
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
    const lb = el('button', 'chan-switch', { type: 'button', 'aria-pressed': 'false' }); lb.textContent = 'blokada';
    lb.addEventListener('click', () => { setLock(i, !lk(i)); toast(lk(i) ? 'Kanał zablokowany: suwak, gain, pan, mute i solo nie reagują.' : 'Kanał odblokowany'); });
    chanRows.push(() => lb.setAttribute('aria-pressed', lk(i) ? 'true' : 'false')); sw.append(lb);
    const pb = el('button', 'chan-switch', { type: 'button' }); pb.textContent = 'presety';
    pb.addEventListener('click', () => openPresets(i)); sw.append(pb);
    body.append(sw);
    colorGroup(body, 'kolor suwaka', 'colF', i, chanRows);
    if (CHANNELS[i].gain) colorGroup(body, 'kolor gałki', 'colK', i, chanRows);
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

  // ----- Mixer setup: routing and configuration, as on the FLOW Mix settings screens -----
  const grp = (body, title) => { const g = el('div', 'chan-group'); const h = el('div', 'chan-title'); h.textContent = title; g.append(h); body.append(g); return g; };
  // one setting = a label and two or three keys; the lit key is the current value
  function choice(g, label, get, set, opts) {
    const r = el('div', 'cfg-row'), l = el('span', 'chan-label'), box = el('div', 'cfg-keys');
    l.textContent = label; r.append(l, box);
    opts.forEach(([text, val]) => {
      const b = el('button', 'chan-switch small', { type: 'button', 'aria-pressed': 'false' }); b.textContent = text;
      b.addEventListener('click', () => { set(val); chanRender(); save(); });
      subRows.push(() => b.setAttribute('aria-pressed', get() === val ? 'true' : 'false'));
      box.append(b);
    });
    g.append(r);
  }
  const cfg = (g, label, id, opts) => choice(g, label, () => S.cfg[id] ? (S.cfg[id] > 1 ? S.cfg[id] : 1) : 0, v => bleSetting(id, v), opts);
  // ----- App settings: things that belong to this app, not to the mixer -----
  function openApp() {
    const body = subPage('ustawienia', 'aplikacja');
    let g = grp(body, 'wygląd');
    choice(g, 'motyw', () => S.theme, v => { S.theme = v; render(); }, [['jasny', 'light'], ['ciemny', 'dark']]);
    g = grp(body, 'dźwięki');
    const snd = (label, k, play) => g.append(mkRow(label, {
      get: () => vol(k) / 2,
      set: p => { const v = Math.round(p * 40) / 20; if (v === vol(k)) return; S[k] = v; play(); },
      text: () => vol(k) ? Math.round(vol(k) * 100) + '%' : 'cisza',
      ask: () => askNum(label + ' (%)', String(Math.round(vol(k) * 100)), 'Od 0 (cisza) do 200.', 0, 200, d => { S[k] = Math.round(d / 5) / 20; play(); })
    }, subRows));
    snd('dźwięk suwaka', 'sndF', () => { lastDb = ''; tickAt = 0; slide(S.levels[S.bus][S.sel]); });
    snd('dźwięk gałki', 'sndK', () => { const v = S.vibK; S.vibK = false; notch(); S.vibK = v; });
    g = grp(body, 'wibracja');
    const sw = (label, k, opts, after) => choice(g, label, () => S[k] !== false, v => { S[k] = v; if (after) after(); }, opts || [['włączona', true], ['wyłączona', false]]);
    sw('gałka gain', 'vibK', null, () => notch());
    sw('suwak i pan', 'vibF', null, () => bump(true));
    g = grp(body, 'zatrzask na 0 dB');
    const dt = (label, k) => g.append(mkRow(label, {
      get: () => S[k], set: p => { S[k] = Math.round(p * 20) / 20; },
      text: () => S[k] <= 0 ? 'brak' : S[k] >= 0.995 ? 'stop' : Math.round(S[k] * 100) + '%',
      ask: () => askNum('Zatrzask: ' + label + ' (%)', String(Math.round(S[k] * 100)), '0 = brak, 100 = stop na 0 dB.', 0, 100, d => { S[k] = Math.round(d) / 100; })
    }, subRows));
    dt('suwak', 'detF'); dt('gałka gain', 'detK');
    const n = el('div', 'cfg-note'); n.textContent = 'Im dalej w prawo, tym mocniej 0 dB trzyma. Na końcu skali suwak staje na 0 dB i trzeba puścić palec, żeby pojechać dalej.'; g.append(n);
    g = grp(body, 'opór przy przesuwaniu');
    const rs = (label, k) => g.append(mkRow(label, {
      get: () => +S[k] || 0, set: p => { S[k] = Math.round(p * 20) / 20; },
      text: () => (+S[k] || 0) <= 0 ? 'brak' : Math.round(S[k] * 100) + '%',
      ask: () => askNum('Opór: ' + label + ' (%)', String(Math.round((+S[k] || 0) * 100)), '0 = brak, 100 = najcięższy.', 0, 100, d => { S[k] = Math.round(d) / 100; })
    }, subRows));
    rs('suwak', 'resF'); rs('gałka gain', 'resK');
    const n2 = el('div', 'cfg-note'); n2.textContent = 'Większy opór oznacza, że palec musi przejechać dłuższą drogę (do 4 razy), więc łatwiej ustawić dokładną wartość.'; g.append(n2);
    chanRender();
  }
  function syncAll() {
    if (B.ready) { bleSendAll(); toast('Wysłano ustawienia do miksera przez Bluetooth'); return; }
    if (!out) { toast('Najpierw połącz się z mikserem.'); return; }
    sendAll(); toast('Wysłano wszystkie ustawienia do miksera');
  }
  function openSetup() {
    const body = subPage('ustawienia', 'mikser');
    const row = (label, o) => mkRow(label, o, subRows);
    let g = grp(body, 'wyjścia');
    // FLOW Mix shows one limiter for both monitors while they are linked as a stereo pair
    const limRow = (label, list) => {
      const bi = list[0];
      const put = d => { list.forEach(b => { S.lim[b] = d; bleLimiter(b); }); };
      const r = row(label, {
        get: () => (S.lim[bi] + 30) / 30,
        set: p => put(Math.round((p * 30 - 30) * 2) / 2),
        text: () => { const gr = B.ready && bi === 0 ? (B.gr || 0) >> 14 & 3 : 0; return (gr ? '•'.repeat(gr) + ' ' : '') + fmt(S.lim[bi]).replace(',0', '') + ' dB'; },   // dots = limiter working right now
        ask: () => askNum('Limiter ' + label.replace('limiter ', '') + ' (dB)', fmt(S.lim[bi]).replace('+', ''), 'Od -30 do 0, co 0,5 dB.', -30, 0, d => put(Math.round(d * 2) / 2))
      });
      g.append(r); return r;
    };
    limRow('limiter ' + BUSES[0].short, [0]);
    const l1 = limRow('limiter ' + BUSES[1].short, [1]), l2 = limRow('limiter ' + BUSES[2].short, [2]), l12 = limRow('limiter mon 1/2', [1, 2]);
    subRows.push(() => { const pair = !!S.cfg[11]; l1.hidden = l2.hidden = pair; l12.hidden = !pair; });
    const warn = el('div', 'cfg-note warn');
    subRows.push(() => { const low = [0, 1, 2].filter(b => S.lim[b] <= -15).map(b => BUSES[b].short); warn.hidden = !low.length; warn.textContent = 'Uwaga: niski próg limitera (' + low.join(', ') + ') mocno ścisza głośne dźwięki. Zwykle ustawia się go blisko 0 dB.'; });
    g.append(warn);
    cfg(g, 'wyjście sala', 14, [['+4 dBu', 0], ['-10 dBV', 1]]);
    cfg(g, 'wyjścia mon', 15, [['+4 dBu', 0], ['-10 dBV', 1]]);
    const d = el('div', 'cfg-note'); subRows.push(() => { d.textContent = 'opóźnienie: sala ' + fmt(S.dly[0]).replace('+', '') + ' ms, mon 1 ' + fmt(S.dly[1]).replace('+', '') + ' ms, mon 2 ' + fmt(S.dly[2]).replace('+', '') + ' ms'; }); g.append(d);

    g = grp(body, 'odsłuchy i słuchawki');
    cfg(g, 'monitory', 17, [['pre', 0], ['post', 1]]);
    cfg(g, 'mon 1 i 2', 11, [['osobno', 0], ['para stereo', 1]]);
    cfg(g, 'słuchawki z', 12, [['sali', 0], ['monitora', 1]]);
    cfg(g, 'słuchawki', 13, [['pre', 0], ['post', 1]]);

    g = grp(body, 'usb i bluetooth');
    cfg(g, 'tryb usb', 7, [['nagrywanie', 0], ['streaming', 1]]);
    cfg(g, 'kanał 5/6', 9, [['wejście', 0], ['usb 1/2', 1]]);
    cfg(g, 'kanał 7/8', 10, [['wejście', 0], ['usb 3/4', 1]]);
    cfg(g, 'wyjścia mon', 8, [['monitory', 0], ['usb 1/2', 1], ['usb 3/4', 2]]);
    cfg(g, 'bt/usb gra', 2, [['do miksu', 0], ['tylko słuchawki', 1]]);

    g = grp(body, 'efekty');
    [0, 1].forEach(n => {
      const r = el('div', 'cfg-row'), l = el('span', 'chan-label'), box = el('div', 'cfg-keys'); l.textContent = 'fx ' + (n + 1) + ' gra na'; r.append(l, box);
      [['sala', 2], ['mon 1', 4], ['mon 2', 8]].forEach(([t, bit]) => {
        const b = el('button', 'chan-switch small', { type: 'button', 'aria-pressed': 'false' }); b.textContent = t;
        b.addEventListener('click', () => { S.fx[n].en ^= bit; bleFxSetup(n); chanRender(); save(); });
        subRows.push(() => b.setAttribute('aria-pressed', S.fx[n].en & bit ? 'true' : 'false')); box.append(b);
      });
      g.append(r);
    });
    g.append(row('tempo', {
      get: () => (Math.max(40, Math.min(240, S.tempo)) - 40) / 200,
      set: p => { S.tempo = Math.round(40 + p * 200); bleTempo(); },
      text: () => S.tempo + ' bpm',
      ask: () => askNum('Tempo efektów (bpm)', String(S.tempo), 'Od 40 do 240.', 40, 240, x => { S.tempo = Math.round(x); bleTempo(); })
    }));
    cfg(g, 'przełącznik nożny', 3, [['efekty', 0], ['sceny', 1]]);
    chanRender();
  }

  // ----- Scenes: the mixer's 15 snapshot slots (load, save here, rename, delete) -----
  function openScenes() {
    const body = subPage('sceny', 'mikser');
    const g = grp(body, 'pamięć miksera');
    if (B.ready) bleSnapList();
    for (let n = 0; n < 15; n++) {
      const r = el('div', 'cfg-row scene-row'), num = el('span', 'chan-num'), nm = el('span', 'chan-label'), box = el('div', 'cfg-keys');
      num.textContent = n + 1;
      const key = (t, f) => { const b = el('button', 'chan-switch small', { type: 'button' }); b.textContent = t; b.addEventListener('click', f); box.append(b); return b; };
      const name = () => ((B.snapshots || [])[n] || '');
      const need = () => { if (B.ready) return true; toast('Najpierw połącz się z mikserem.'); return false; };
      const load = key('wczytaj', () => { if (!need()) return; S.scene = n; bleQueue('scene', 0x20, [n]); setTimeout(() => bleQueue('state', 0x37, []), 400); render(); save(); });
      key('zapisz', () => {
        if (!need()) return;
        if (name() && !confirm('Nadpisać scenę ' + (n + 1) + ' „' + name() + '” obecnymi ustawieniami?')) return;
        const t = (prompt('Nazwa sceny', name() || 'Scena ' + (n + 1)) || '').trim().slice(0, 20); if (!t) return;
        bleSnap(0x19, n, t); toast('Zapisano scenę ' + (n + 1));
      });
      const ren = key('nazwa', () => { if (!need()) return; const t = (prompt('Nowa nazwa sceny', name()) || '').trim().slice(0, 20); if (t) bleSnap(0x32, n, t); });
      const del = key('usuń', () => { if (need() && confirm('Usunąć scenę ' + (n + 1) + ' „' + name() + '” z miksera?')) bleSnap(0x12, n); });
      subRows.push(() => { const t = name(); nm.textContent = t || 'pusta'; nm.classList.toggle('dim', !t); r.classList.toggle('sel', n === S.scene); [load, ren, del].forEach(b => { b.disabled = !t; }); });
      r.append(num, nm, box); g.append(r);
    }
    chanRender();
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
    if (T.i < 0) { colorGroup(body, 'kolor suwaka', 'colF', CHANNELS.length - 1, subRows); chanRender(); }   // output page: colour of the master fader
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
        set: p => { S.levels[bi][i] = fine() ? Math.round(p * 255) * 127 / 255 : Math.round(p * 127); sendLevelBus(i, bi); },
        text: () => levelDb(S.levels[bi][i]) + ' dB', ask: () => askLevel(i, bi)
      }, subRows));
      const mi = CHANNELS.findIndex(c => c.master);
      g.append(mkRow('powrót efektu', {
        get: () => S.levels[bi][mi] / 127,
        set: p => { S.levels[bi][mi] = fine() ? Math.round(p * 255) * 127 / 255 : Math.round(p * 127); sendLevelBus(mi, bi); },
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
    S.pans[i] = n; if (n === 0 || n === -50 || n === 50) bump(); sendPan(i); render(); save();
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
  // volume of the interface sounds (knob click, fader tick), set in the menu; vibration is not affected
  // knob and fader sounds each have their own volume (0 to 2, 1 = as designed), set on the app settings page
  if (S.click === false) { S.sndK = S.sndF = 0; S.vibK = S.vibF = false; }
  else if (typeof S.sfx === 'number' && S.sndK === undefined) S.sndK = S.sndF = S.sfx;
  delete S.click; delete S.sfx;
  const vol = k => typeof S[k] === 'number' ? S[k] : 1;
  const sfxNodes = {};
  function sfx(c, k) {
    if (!sfxNodes[k]) { sfxNodes[k] = c.createGain(); sfxNodes[k].connect(c.destination); }
    sfxNodes[k].gain.value = vol(k);
    return sfxNodes[k];
  }
  function notch() {
    if (S.vibK !== false) try { if (NATIVE && NATIVE.buzz) NATIVE.buzz().catch(() => {}); else if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
    if (!vol('sndK')) return;
    try {
      const c = audio(), t = c.currentTime, o = c.createOscillator(), g = c.createGain(), o2 = c.createOscillator(), g2 = c.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(2600, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.016);
      g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.026);
      o.connect(g); g.connect(sfx(c, 'sndK')); o.start(t); o.stop(t + 0.03);
      // short low thump under the click, so the notch feels mechanical
      o2.type = 'sine'; o2.frequency.setValueAtTime(190, t); o2.frequency.exponentialRampToValueAtTime(70, t + 0.03);
      g2.gain.setValueAtTime(0.45, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      o2.connect(g2); g2.connect(sfx(c, 'sndK')); o2.start(t); o2.stop(t + 0.045);
    } catch (e) {}
  }
  // a light tap of the motor: the fader reaching 0 dB, top or bottom, the pan reaching centre or an end
  function bump(strong) {
    if (S.vibF === false) return;
    try { if (NATIVE && NATIVE.buzz) NATIVE.buzz(strong ? {} : { soft: true }).catch(() => {}); else if (navigator.vibrate) navigator.vibrate(strong ? 18 : 8); } catch (e) {}
  }
  // 0 dB detent, like the centre click of a real fader. Once the cap reaches 0 dB it is caught there and
  // stays until the finger has moved a clear distance away from where it was caught (in either direction),
  // so stopping on 0 dB needs no precision. After the release the cap moves on without a jump.
  const zeroPos = () => fine() ? 191 * 127 / 255 : 111;            // the fader position that reads 0,0 dB
  // resistance, set on the app settings page: 0 = the cap follows the finger, 1 = the finger has to travel four times as far
  function drag_res(k) { return 1 + 3 * Math.max(0, Math.min(1, +S[k] || 0)); }
  const GAIN_ZERO = 20 * 127 / 80;                                 // the gain knob position of 0 dB
  // detent strength, set on the app settings page: 0 = none, 1 = a hard stop at 0 dB (lift the finger to go on), between = finger travel to break out
  if (S.detF === undefined) { S.detF = S.detent === false ? 0 : S.detent === 1 ? 0.15 : 0.5; }
  if (S.detK === undefined) S.detK = 0.3;
  delete S.detent;
  const detentPx = k => { const p = S[k]; return p >= 0.995 ? Infinity : p * 80; };
  function detent(key, zero) {
    let off = 0, lock = null, prev = 0, first = false;
    return {
      start(v) { off = 0; prev = v; lock = detentPx(key) && Math.abs(v - zero()) < 0.3 ? v : null; first = true; },
      // r: where the cap would be without the detent, perPx: fader units per pixel of finger travel
      map(r, perPx) {
        const z = zero();
        // a drag that begins on 0 dB breaks out after a short move, so the hard stop never traps the cap there
        const B = (first && lock !== null ? Math.min(detentPx(key), 12) : detentPx(key)) * K * perPx;
        if (!B) return r;
        if (lock !== null) {
          if (Math.abs(r - lock) <= B) return z;
          off = z - (lock + Math.sign(r - lock) * B); lock = null; first = false; prev = r + off; return prev;
        }
        const v = r + off;
        if ((prev - z) * (v - z) <= 0) { lock = r; first = false; prev = z; return z; }
        prev = v; return v;
      }
    };
  }
  // fader sound: one very quiet, soft tick per 0.5 dB step, like a fine detent (the earlier hiss was too coarse)
  let tickAt = 0, lastDb = '', lastV = -1;
  function slide(v) {
    const db = levelDb(v), was = lastDb, wasV = lastV; lastDb = db; lastV = v;
    // the ends buzz when the cap arrives there, even if the dB readout was already showing the end value (the last steps read the same)
    if (wasV >= 0 && ((v >= 127 && wasV < 127) || (v <= 0 && wasV > 0))) bump(true);
    if (db === was) return;
    if (was !== '' && db === '0,0') bump(true);
    if (!vol('sndF')) return;
    const now = performance.now(); if (now - tickAt < 28) return; tickAt = now;
    try {
      const c = audio(), t = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = 'triangle'; o.frequency.setValueAtTime(1500, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.008);
      f.type = 'lowpass'; f.frequency.value = 2600;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
      o.connect(f); f.connect(g); g.connect(sfx(c, 'sndF')); o.start(t); o.stop(t + 0.015);
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
  // holding a finger still on an element (used for names: hold to edit)
  function onHold(node, fn) {
    let t = 0, x = 0, y = 0;
    const stop = () => { clearTimeout(t); t = 0; };
    node.addEventListener('pointerdown', e => { x = e.clientX; y = e.clientY; stop(); t = setTimeout(() => { t = 0; bump(true); fn(); }, 550); });
    node.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x, e.clientY - y) > 8) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(k => node.addEventListener(k, stop));
    node.addEventListener('contextmenu', e => e.preventDefault());
  }
  function rename(i) {
    const n = (prompt('Nazwa kanału', S.names[i]) || '').trim().slice(0, 12);
    if (n) { S.names[i] = n; if (B.ready) bleLabel(i); render(); save(); }
  }

  // ---------- Measuring: where does the sound drop? ----------
  // Every meter frame (about 3 per second) is kept for 10 minutes: levels of the inputs, sala and (while this page
  // is open) both monitors, plus the gain reduction of the compressors and the output limiter. A drop on an output
  // is found by comparing each frame with the median of the 3 seconds before it, and is then explained by what the
  // inputs, the limiter and the compressors did at that moment.
  const MS = { rec: [], ev: [], open: false, ext: undefined, extAt: 0, drop: {} };
  const OUTS = [{ key: 'sala', idx: [10, 11] }, { key: 'mon 1', idx: [12] }, { key: 'mon 2', idx: [13] }];
  function measureFeed(p, now) {
    const v = Array.from(p.slice(0, 15)), gr = p.length >= 17 ? p[15] << 8 | p[16] : 0;
    const db = k => byteDb(v[k] || 0);
    const ins = [0, 1, 2, 3].map(db).concat([[4, 5], [6, 7], [8, 9]].map(([a, b]) => Math.max(db(a), db(b))));
    const ext = v[12] !== undefined && v[12] !== 0xbf && v[13] !== 0xbf;
    if (ext && MS.ext === undefined) MS.ext = true;
    const outs = [Math.max(db(10), db(11)), ext ? db(12) : null, ext ? db(13) : null];
    const r = { t: Date.now(), ins, outs, gr, mutes: S.mutes.slice() };
    MS.rec.push(r); while (MS.rec.length && r.t - MS.rec[0].t > 600000) MS.rec.shift();
    outs.forEach((o, oi) => detectDrop(oi, o, r));
    if (MS.open) measureRender();
  }
  const median = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : -144; };
  function detectDrop(oi, o, r) {
    if (o === null) return;
    const past = MS.rec.filter(x => x !== r && r.t - x.t <= 3000 && x.outs[oi] !== null).map(x => x.outs[oi]);
    const d = MS.drop[oi];
    if (!d) {
      if (past.length < 5) return;
      const base = median(past);
      if (base > -45 && o < base - 12) MS.drop[oi] = { from: r.t, base, low: o, frames: [r], before: MS.rec.slice(-12, -1) };
    } else {
      d.frames.push(r); d.low = Math.min(d.low, o);
      if (o >= d.base - 6 || r.t - d.from > 20000) { delete MS.drop[oi]; MS.ev.unshift(explain(oi, d, r.t)); if (MS.ev.length > 40) MS.ev.pop(); if (MS.open) measureEvents(); toastOnce('drop' + r.t, 'Pomiar: spadek na ' + OUTS[oi].key + ' (' + Math.round(d.low - d.base) + ' dB). Szczegóły w Pomiarze.'); }
    }
  }
  function explain(oi, d, end) {
    const dur = (end - d.from) / 1000, frames = d.frames.slice(0, -1).length ? d.frames.slice(0, -1) : d.frames;
    const all = d.before.concat(frames);
    const lim = all.some(x => (x.gr >> 14 & 3) > 0);
    const comp = CHANNELS.filter(c => c.gain).filter(c => all.some(x => (x.gr >> (c.ble * 2) & 3) > 0)).map(c => S.names[CHANNELS.indexOf(c)]);
    const inDrop = [], inSteady = [];
    for (let ci = 0; ci < 7; ci++) {
      const base = median(d.before.map(x => x.ins[ci])), low = Math.min(...frames.map(x => x.ins[ci]));
      if (base < -50) continue;
      (low < base - 12 ? inDrop : inSteady).push(S.names[CHANNELS.findIndex(c => c.ble === ci)]);
    }
    const muted = CHANNELS.filter((c, i) => !c.master && frames.some(x => x.mutes[i]) && !d.before.some(x => x.mutes[i])).map(c => S.names[CHANNELS.indexOf(c)]);
    let why;
    if (muted.length) why = 'W tym czasie wyciszono kanał: ' + muted.join(', ') + '.';
    else if (inDrop.length && !inSteady.length) why = 'Spadło już na wejściu (' + inDrop.join(', ') + '). Mikser dostał cichszy sygnał: sprawdź źródło, kabel, nadajnik albo zasilanie.';
    else if (inDrop.length) why = 'Spadło na wejściu: ' + inDrop.join(', ') + '. Reszta wejść grała równo. Sprawdź źródło tych kanałów, kabel albo nadajnik.';
    else if (lim) why = 'Wejścia grały równo, a limiter wyjścia ściszał (próg ' + fmt(S.lim[Math.min(oi, 2)]).replace(',0', '') + ' dB). Podnieś próg limitera.';
    else if (comp.length) why = 'Wejścia grały równo, pracował kompresor kanału: ' + comp.join(', ') + '. Zmniejsz kompresję.';
    else why = 'Wejścia grały równo, limiter i kompresory nie pracowały. Spadek powstał w mikserze za wejściami, czyli na sumie albo na samym wyjściu.';
    const tm = new Date(d.from).toLocaleTimeString('pl-PL');
    return { t: d.from, text: tm + '  ' + OUTS[oi].key + ': spadek o ' + Math.round(d.base - d.low) + ' dB na ' + dur.toFixed(1).replace('.', ',') + ' s', why };
  }
  let mCanvas = null, mRows = null, mEv = null, mInfo = null;
  function openMeasure() {
    const body = subPage('pomiar', 'mikser');
    MS.open = true; MS.drop = {};
    if (B.ready) bleMeterRequest();
    let g = grp(body, 'ostatnia minuta');
    mInfo = el('div', 'cfg-note'); g.append(mInfo);
    mCanvas = el('canvas', 'm-graph'); g.append(mCanvas);
    const leg = el('div', 'cfg-note m-legend'); leg.innerHTML = '<span class="m-k m-out"></span>sala <span class="m-k m-mon"></span>odsłuchy <span class="m-k m-in"></span>wejścia <span class="m-k m-lim"></span>limiter <span class="m-k m-cmp"></span>kompresor'; g.append(leg);
    g = grp(body, 'teraz');
    mRows = el('div', 'm-rows'); g.append(mRows);
    g = grp(body, 'wykryte spadki');
    mEv = el('div', 'm-ev'); g.append(mEv);
    const keys = el('div', 'cfg-keys');
    const clr = el('button', 'chan-switch small', { type: 'button' }); clr.textContent = 'wyczyść';
    clr.addEventListener('click', () => { MS.ev = []; MS.rec = []; measureEvents(); measureRender(); });
    const cp = el('button', 'chan-switch small', { type: 'button' }); cp.textContent = 'kopiuj raport';
    cp.addEventListener('click', () => { const t = measureReport(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Raport skopiowany. Wklej go tutaj w rozmowie.'), () => { const a = el('textarea', 'm-copy'); a.value = t; mEv.after(a); a.select(); }); });
    keys.append(clr, cp); g.append(keys);
    const back = $('#sub .chan-back'); if (back) back.addEventListener('click', () => { MS.open = false; if (B.ready) bleMeterRequest(); });
    measureEvents(); measureRender();
  }
  function measureEvents() {
    if (!mEv) return;
    mEv.textContent = '';
    if (!MS.ev.length) { const n = el('div', 'cfg-note'); n.textContent = 'Na razie nic. Graj normalnie, a gdy dźwięk siądzie, spadek pojawi się tutaj z opisem, co go spowodowało.'; mEv.append(n); return; }
    MS.ev.forEach(e => { const r = el('div', 'm-e'), a = el('b'), b = el('div'); a.textContent = e.text; b.textContent = e.why; r.append(a, b); mEv.append(r); });
  }
  function measureRender() {
    if (!mCanvas || !document.getElementById('sub') || !mCanvas.isConnected) { MS.open = false; return; }
    const live = metersLive(), last = MS.rec[MS.rec.length - 1];
    mInfo.textContent = !B.ready ? 'Połącz się z mikserem przez Bluetooth, żeby mierzyć.' : !live ? 'Czekam na wskaźniki z miksera…'
      : 'Mierzę. Zapisane ' + Math.round((last.t - MS.rec[0].t) / 1000) + ' s, ' + MS.rec.length + ' odczytów.' + (MS.ext === false ? ' Mikser nie podaje poziomów odsłuchów, widać tylko salę.' : '');
    // graph: last 60 s, -60..0 dB
    const W = mCanvas.clientWidth || 300, H = 150, dpr = window.devicePixelRatio || 1;
    if (mCanvas.width !== Math.round(W * dpr)) { mCanvas.width = Math.round(W * dpr); mCanvas.height = H * dpr; }
    const c = mCanvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const now = Date.now(), X = t => W - (now - t) / 60000 * W, Y = d => 14 + (Math.min(0, Math.max(-60, d)) / -60) * (H - 36);
    const css = getComputedStyle(document.documentElement), ink3 = css.getPropertyValue('--ink-3') || '#777';
    c.strokeStyle = ink3; c.globalAlpha = 0.35; c.lineWidth = 1;
    [0, -20, -40, -60].forEach(d => { c.beginPath(); c.moveTo(0, Y(d)); c.lineTo(W, Y(d)); c.stroke(); });
    c.globalAlpha = 1; c.fillStyle = ink3; c.font = '10px sans-serif'; [0, -20, -40].forEach(d => c.fillText(d + ' dB', 2, Y(d) - 2));
    const pts = MS.rec.filter(x => now - x.t <= 60000);
    const line = (get, color, w, alpha) => { c.strokeStyle = color; c.lineWidth = w; c.globalAlpha = alpha; c.beginPath(); let on = false; pts.forEach(x => { const d = get(x); if (d === null) { on = false; return; } on ? c.lineTo(X(x.t), Y(d)) : c.moveTo(X(x.t), Y(d)); on = true; }); c.stroke(); c.globalAlpha = 1; };
    for (let ci = 0; ci < 7; ci++) line(x => x.ins[ci], '#8A8A86', 1, 0.6);
    line(x => x.outs[1], '#22B8CF', 1.5, 0.9); line(x => x.outs[2], '#8A4FE0', 1.5, 0.9);
    line(x => x.outs[0], '#E8501A', 2.5, 1);
    pts.forEach(x => {
      const l = x.gr >> 14 & 3, k = x.gr & 0x3fff;
      if (l) { c.fillStyle = '#D8345F'; c.fillRect(X(x.t) - 2, H - 18, 4, 6 + l * 2); }
      if (k) { c.fillStyle = '#F2B807'; c.fillRect(X(x.t) - 2, H - 8, 4, 6); }
    });
    // live rows
    if (!last) { mRows.textContent = ''; return; }
    const rows = [];
    for (let ci = 0; ci < 7; ci++) { const i = CHANNELS.findIndex(c => c.ble === ci); rows.push([S.names[i], last.ins[ci], CHANNELS[i].gain ? last.gr >> (ci * 2) & 3 : 0, 'kompr.']); }
    rows.push(['sala', last.outs[0], last.gr >> 14 & 3, 'limiter']);
    if (last.outs[1] !== null) { rows.push(['mon 1', last.outs[1], 0, '']); rows.push(['mon 2', last.outs[2], 0, '']); }
    mRows.textContent = '';
    rows.forEach(([n, d, g, what]) => {
      const r = el('div', 'm-row'), a = el('span', 'chan-label'), bar = el('span', 'm-bar'), v = el('span', 'm-val');
      a.textContent = n; bar.style.setProperty('--p', Math.max(0, Math.min(1, (d + 60) / 60)));
      v.textContent = (d <= -90 ? '-∞' : Math.round(d)) + ' dB' + (g ? ' ' + '•'.repeat(g) : '');
      if (g) v.title = what;
      r.append(a, bar, v); mRows.append(r);
    });
  }
  function measureReport() {
    const L = [];
    L.push('FLOW 8 Control v' + APP_VERSION + ', pomiar ' + new Date().toLocaleString('pl-PL'));
    L.push('limitery: sala ' + S.lim[0] + ', mon1 ' + S.lim[1] + ', mon2 ' + S.lim[2] + ' dB; ustawienia ' + JSON.stringify(S.cfg));
    L.push('kompresory: ' + CHANNELS.filter(c => c.gain).map(c => S.names[CHANNELS.indexOf(c)] + ' ' + S.comp[CHANNELS.indexOf(c)] + '%').join(', '));
    L.push('suwaki OUT: ' + BUSES.map((b, bi) => b.short + ' ' + levelDb(S.levels[bi][7])).join(', '));
    L.push('wyciszenia: ' + CHANNELS.map((c, i) => S.mutes[i] ? S.names[i] : '').filter(Boolean).join(', ') + '; solo: ' + CHANNELS.map((c, i) => S.solos[i] ? S.names[i] : '').filter(Boolean).join(', '));
    if (B.stateRaw) L.push('stan miksera: ' + B.stateRaw.map(x => x.toString(16).padStart(2, '0')).join(' '));
    L.push('');
    MS.ev.slice().reverse().forEach(e => { L.push(e.text); L.push('  ' + e.why); });
    L.push('');
    L.push('ostatnie 2 minuty (czas s, wejścia 1-4,5/6,7/8,usb, sala, mon1, mon2, gr hex):');
    const t0 = Date.now();
    MS.rec.filter(x => t0 - x.t <= 120000).forEach(x => L.push(((x.t - t0) / 1000).toFixed(1) + ' ' + x.ins.map(d => Math.round(d)).join(',') + ' | ' + x.outs.map(d => d === null ? '-' : Math.round(d)).join(',') + ' | ' + x.gr.toString(16)));
    return L.join('\n');
  }

  // ---------- Update: newest APK from the project's GitHub release ----------
  const APK_URL = 'https://github.com/arkus1972/flow8-control/releases/download/android/flow8-control.apk';
  function updateCheck() {
    const info = document.getElementById('upd-info'); if (!info) return;
    info.textContent = 'Sprawdzam najnowszą wersję…';
    fetch('https://api.github.com/repos/arkus1972/flow8-control/releases/tags/android', { cache: 'no-store' }).then(r => r.json()).then(j => {
      const m = /v(\d+\.\d+)/.exec(j.name || '');
      if (!m) throw 0;
      const a = m[1].split('.').map(Number), b = APP_VERSION.split('.').map(Number), newer = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
      info.textContent = newer ? 'Masz v' + APP_VERSION + ', jest nowsza: v' + m[1] : 'Masz najnowszą wersję (v' + APP_VERSION + ')';
      document.getElementById('upd-go').classList.toggle('go', newer);
    }).catch(() => { info.textContent = 'Masz v' + APP_VERSION + '. Nie udało się sprawdzić (brak internetu?)'; });
  }
  function updateNow() {
    if (!NATIVE) { location.reload(); return; }                    // in the browser a reload is the update
    toast('Pobieram nową wersję. Po pobraniu dotknij pliku i wybierz Zainstaluj.');
    if (NATIVE.openUrl) NATIVE.openUrl({ url: APK_URL }).catch(() => { location.href = APK_URL; }); else location.href = APK_URL;
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
        '<div class="diag-update"><span id="upd-info">Sprawdzam najnowszą wersję…</span><button class="key wide" id="upd-go" type="button">Aktualizuj</button></div>' +
        '<textarea id="diag-log" readonly></textarea>' +
        '<div class="diag-keys"><button class="key wide" id="diag-probe" type="button">Badaj mikser</button>' +
        '<button class="key wide go" id="diag-copy" type="button">Kopiuj</button>' +
        '<button class="key wide" id="diag-close" type="button">Zamknij</button></div>';
      document.body.appendChild(d);
      $('#diag-close').addEventListener('click', () => { d.hidden = true; });
      $('#diag-probe').addEventListener('click', diagProbe);
      $('#diag-copy').addEventListener('click', diagCopy);
      $('#upd-go').addEventListener('click', updateNow);
    }
    d.hidden = false;
    $('#diag-log').value = DIAG.lines.slice(-400).join('\n');
    updateCheck();
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
        let a = false, y0 = 0, v0 = 0; const det = detent('detF', zeroPos);
        col.addEventListener('pointerdown', e => { if (locked(i)) { select(i); return; } a = true; y0 = e.clientY; v0 = S.levels[S.bus][i]; det.start(v0); col.setPointerCapture(e.pointerId); select(i); o.dragAt = performance.now(); bigRender(); });
        col.addEventListener('pointermove', e => {
          if (!a) return;
          const hh = Math.max(wrap.getBoundingClientRect().height, 60) * drag_res('resF');
          const p = Math.max(0, Math.min(1, det.map(v0 + (y0 - e.clientY) / hh * 127, 127 / hh) / 127));
          const v = fine() ? Math.round(p * 255) * 127 / 255 : Math.round(p * 127);
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
  // shrink a one-line label until it fits its box (the display is narrow in portrait)
  function fitText(node) {
    node.style.fontSize = '';
    const max = parseFloat(getComputedStyle(node).fontSize) || 16;
    let f = max;
    while (node.scrollWidth > node.clientWidth + 1 && f > 10) { f -= 1; node.style.fontSize = f + 'px'; }
  }
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
      r.strip.classList.toggle('locked', lk(i));
      r.name.textContent = c.master ? bus.short : S.names[i];
      r.knob.style.setProperty('--a', (-135 + S.gains[i] / 127 * 270) + 'deg');
      r.kl.textContent = 'gain ' + gainDb(S.gains[i]).replace(/,0$/, '') + ' dB';
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
    $('#bus-label').textContent = 'miks: ' + bus.label; fitText($('#bus-label'));

    [...document.querySelectorAll('.scene')].forEach((b, n) => b.setAttribute('aria-pressed', n === S.scene ? 'true' : 'false'));
    const buses = $('#buses');
    buses.style.setProperty('--i', S.bus);
    [...buses.querySelectorAll('button')].forEach((b, bi) => b.setAttribute('aria-checked', bi === S.bus ? 'true' : 'false'));
  }

  // ---------- Locks ----------
  // a locked channel ignores the fader, gain knob, pan, mute and solo on the main screens (the channel page still works);
  // the screen lock covers everything until the padlock is held for a second (phone in a pocket)
  const lk = i => !!(S.locks && S.locks[i]);
  let lockToastAt = 0;
  function locked(i) {
    if (!lk(i)) return false;
    const t = performance.now();
    if (t - lockToastAt > 1500) { lockToastAt = t; toast('Kanał ' + S.names[i] + ' jest zablokowany. Odblokujesz go na stronie kanału.'); }
    return true;
  }
  function setLock(i, on) { if (!Array.isArray(S.locks)) S.locks = CHANNELS.map(() => false); S.locks[i] = on; render(); chanRender(); save(); }
  let screenLocked = false;
  function awake() { try { if (NATIVE && NATIVE.keepAwake) NATIVE.keepAwake({ on: !!(M.running || screenLocked) }).catch(() => {}); } catch (e) {} }
  function lockScreen(on) {
    screenLocked = on;
    $('#lockscr').hidden = !on;
    $('#lock').setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) { $('#conn-menu').hidden = true; $('#metro').hidden = true; $('#metro-open').setAttribute('aria-expanded', 'false'); bump(true); }
    awake();
  }
  function lockBuild() {
    $('#lock').addEventListener('click', () => lockScreen(true));
    const scr = $('#lockscr'), key = $('#unlock'), ring = $('#lock-ring');
    let t0 = 0, raf = 0;
    const stop = () => { t0 = 0; cancelAnimationFrame(raf); ring.style.setProperty('--p', 0); };
    const step = () => {
      if (!t0) return;
      const p = Math.min(1, (performance.now() - t0) / 1000);
      ring.style.setProperty('--p', p);
      if (p >= 1) { stop(); lockScreen(false); toast('Odblokowane'); return; }
      raf = requestAnimationFrame(step);
    };
    ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'click', 'contextmenu', 'wheel'].forEach(t => scr.addEventListener(t, e => { if (e.cancelable) e.preventDefault(); e.stopPropagation(); }, { passive: false }));
    key.addEventListener('pointerdown', e => { t0 = performance.now(); key.setPointerCapture(e.pointerId); raf = requestAnimationFrame(step); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => key.addEventListener(t, stop));
  }

  // ---------- Channel presets: low cut, EQ, compressor ----------
  const Q0 = [0, 6, 6, 0];
  // starting points; low cut values as in FLOW Mix's own input presets, EQ and compressor are a gentle first guess
  const BUILTIN = [
    { name: 'wokal (mikrofon dynamiczny)', hpf: 120, eq: [-2, -2, 2, 2], eqF: [100, 400, 3000, 12000], comp: 30 },
    { name: 'wokal (pojemnościowy)', hpf: 120, eq: [-1, -2, 1, 2], eqF: [100, 300, 3000, 12000], comp: 25 },
    { name: 'gitara akustyczna', hpf: 150, eq: [-2, -3, 2, 2], eqF: [100, 250, 3000, 10000], comp: 20 },
    { name: 'gitara elektryczna', hpf: 120, eq: [0, -2, 2, -2], eqF: [100, 400, 2500, 8000], comp: 10 },
    { name: 'gitara basowa', hpf: 40, eq: [2, -3, 2, -2], eqF: [80, 300, 1000, 6000], comp: 30 },
    { name: 'stopa', hpf: 40, eq: [3, -4, 3, 0], eqF: [60, 350, 3000, 12000], comp: 20 },
    { name: 'werbel', hpf: 180, eq: [1, -2, 2, 1], eqF: [200, 500, 4000, 10000], comp: 15 },
    { name: 'klawisze', hpf: 20, eq: [0, 0, 0, 0], eqF: [100, 500, 2000, 12000], comp: 0 },
    { name: 'płasko (wszystko na zero)', hpf: 20, eq: [0, 0, 0, 0], eqF: [100, 500, 2000, 12000], comp: 0 }
  ];
  const within = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // anything read from a file or the clipboard is checked field by field
  function presetClean(p) {
    if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name.trim()) return null;
    const n4 = (a, f) => Array.isArray(a) && a.length === 4 && a.every(x => typeof x === 'number' && isFinite(x)) ? a.map(f) : null;
    const eq = n4(p.eq, g => Math.round(within(g, -15, 15) * 2) / 2);
    const o = { name: p.name.trim().slice(0, 40) };
    if (typeof p.hpf === 'number' && isFinite(p.hpf)) o.hpf = Math.round(within(p.hpf, 20, 600));
    if (eq) { o.eq = eq; o.eqF = n4(p.eqF, f => Math.round(within(f, 20, 20000))) || [100, 500, 2000, 12000]; o.eqQ = n4(p.eqQ, q => Math.round(within(q, 0, 255))) || Q0.slice(); }
    if (typeof p.comp === 'number' && isFinite(p.comp)) o.comp = Math.round(within(p.comp, 0, 100));
    return o.hpf === undefined && !o.eq && o.comp === undefined ? null : o;
  }
  const presetOf = (i, name) => ({ name, hpf: S.hpf[i], eq: S.eq[i].slice(), eqF: S.eqF[i].slice(), eqQ: S.eqQ[i].slice(), comp: S.comp[i] });
  const parts = () => Object.assign({ hpf: true, eq: true, comp: true }, S.presetParts || {});
  function presetApply(i, p) {
    const w = parts();
    if (w.hpf && p.hpf !== undefined) { S.hpf[i] = p.hpf; bleHpf(i); }
    if (w.eq && p.eq) for (let b = 0; b < 4; b++) { S.eq[i][b] = p.eq[b]; S.eqF[i][b] = p.eqF[b]; S.eqQ[i][b] = (p.eqQ || Q0)[b]; bleEq(i, b); }
    if (w.comp && p.comp !== undefined) { S.comp[i] = p.comp; bleComp(i); }
    render(); chanRender(); save();
    toast('„' + p.name + '” na kanale ' + S.names[i] + (B.ready ? '' : ' (wyślę po połączeniu: menu, Wyślij wszystko)'));
  }
  const presetSum = p => [p.hpf !== undefined ? 'filtr ' + (p.hpf <= 20 ? 'wył.' : p.hpf + ' Hz') : '',
    p.eq ? 'EQ ' + p.eq.map(g => fmt(g).replace(',0', '')).join(' ') : '', p.comp !== undefined ? 'komp. ' + p.comp + '%' : ''].filter(Boolean).join(' · ');
  const userPresets = () => { if (!Array.isArray(S.presets)) S.presets = []; return S.presets; };
  function presetExport() {
    return JSON.stringify({ flow8: 'presets', v: 1, app: APP_VERSION, date: new Date().toISOString().slice(0, 10), presets: userPresets() }, null, 1);
  }
  function presetImport(text) {
    let d; try { d = JSON.parse(text); } catch (e) { toast('To nie jest plik z presetami.'); return; }
    const list = (Array.isArray(d) ? d : d && d.presets) || [];
    let n = 0;
    list.forEach(x => {
      const p = presetClean(x); if (!p) return;
      const all = userPresets(), k = all.findIndex(q => q.name === p.name);
      if (k >= 0) all[k] = p; else all.push(p);
      n++;
    });
    save(); toast(n ? 'Wczytano presety: ' + n : 'Nie znalazłem presetów w tym pliku.');
  }
  function openPresets(i) {
    let target = i !== undefined && !CHANNELS[i].master ? i : CHANNELS[S.sel].master ? 0 : S.sel;
    const body = subPage('presety', 'kanały');
    let g = grp(body, 'kanał');
    const chips = el('div', 'cfg-keys'); chips.style.justifyContent = 'flex-start';
    CHANNELS.forEach((c, k) => {
      if (c.master) return;
      const b = el('button', 'chan-switch small', { type: 'button', 'aria-pressed': 'false' }); b.textContent = c.num;
      b.addEventListener('click', () => { target = k; chanRender(); });
      subRows.push(() => b.setAttribute('aria-pressed', k === target ? 'true' : 'false'));
      chips.append(b);
    });
    const now = el('div', 'cfg-note');
    subRows.push(() => { now.textContent = S.names[target] + ': ' + presetSum(presetOf(target, '')); });
    g.append(chips, now);
    g = grp(body, 'wczytuj');
    const pk = el('div', 'cfg-keys'); pk.style.justifyContent = 'flex-start';
    [['filtr', 'hpf'], ['korektor', 'eq'], ['kompresor', 'comp']].forEach(([t, k]) => {
      const b = el('button', 'chan-switch small', { type: 'button', 'aria-pressed': 'false' }); b.textContent = t;
      b.addEventListener('click', () => { const w = parts(); w[k] = !w[k]; S.presetParts = w; chanRender(); save(); });
      subRows.push(() => b.setAttribute('aria-pressed', parts()[k] ? 'true' : 'false'));
      pk.append(b);
    });
    g.append(pk);
    const mine = grp(body, 'moje presety');
    const listBox = el('div'); mine.append(listBox);
    const add = el('button', 'chan-switch', { type: 'button' }); add.textContent = 'zapisz ustawienia kanału jako nowy preset';
    add.addEventListener('click', () => {
      const t = (prompt('Nazwa presetu', S.names[target]) || '').trim().slice(0, 40); if (!t) return;
      const all = userPresets(), k = all.findIndex(q => q.name === t);
      if (k >= 0 && !confirm('Preset „' + t + '” już jest. Nadpisać?')) return;
      if (k >= 0) all[k] = presetOf(target, t); else all.push(presetOf(target, t));
      save(); list(); toast('Zapisano preset „' + t + '”');
    });
    mine.append(add);
    const row = (box, p, keys) => {
      const r = el('div', 'cfg-row preset-row'), l = el('span', 'chan-label'), k = el('div', 'cfg-keys');
      l.textContent = p.name; const sm = el('span', 'preset-sum'); sm.textContent = presetSum(p); l.append(sm);
      keys.forEach(([t, f]) => { const b = el('button', 'chan-switch small', { type: 'button' }); b.textContent = t; b.addEventListener('click', f); k.append(b); });
      r.append(l, k); box.append(r); return l;
    };
    function list() {
      listBox.textContent = '';
      const all = userPresets();
      if (!all.length) { const n = el('div', 'cfg-note'); n.textContent = 'Jeszcze nic. Ustaw kanał i zapisz go jako preset.'; listBox.append(n); }
      all.forEach((p, k) => {
        const l = row(listBox, p, [
          ['wczytaj', () => presetApply(target, p)],
          ['nadpisz', () => { if (confirm('Zapisać w „' + p.name + '” obecne ustawienia kanału ' + S.names[target] + '?')) { all[k] = presetOf(target, p.name); save(); list(); } }],
          ['usuń', () => { if (confirm('Usunąć preset „' + p.name + '”?')) { all.splice(k, 1); save(); list(); } }]
        ]);
        onHold(l, () => { const t = (prompt('Nowa nazwa presetu', p.name) || '').trim().slice(0, 40); if (t) { p.name = t; save(); list(); } });
      });
    }
    list();
    const n1 = el('div', 'cfg-note'); n1.textContent = 'Przytrzymaj nazwę presetu, żeby ją zmienić.'; mine.append(n1);
    g = grp(body, 'gotowe na początek');
    BUILTIN.forEach(p => row(g, p, [['wczytaj', () => presetApply(target, p)], ['do moich', () => { const t = (prompt('Nazwa w moich presetach', p.name) || '').trim().slice(0, 40); if (!t) return; const all = userPresets(), k = all.findIndex(q => q.name === t); if (k >= 0 && !confirm('Preset „' + t + '” już jest. Nadpisać?')) return; const c = Object.assign(presetClean(p), { name: t }); if (k >= 0) all[k] = c; else all.push(c); save(); list(); }]]));
    g = grp(body, 'kopia zapasowa');
    const io = el('div', 'preset-io');
    const key = (t, f) => { const b = el('button', 'chan-switch small', { type: 'button' }); b.textContent = t; b.addEventListener('click', f); io.append(b); };
    key(NATIVE ? 'wyślij / zapisz' : 'pobierz plik', () => {
      shareText('flow8-presety-' + new Date().toISOString().slice(0, 10) + '.json', presetExport());
    });
    key('kopiuj tekst', () => { const t = presetExport(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Presety skopiowane do schowka'), () => toast('Schowek niedostępny')); });
    const file = el('input', '', { type: 'file', accept: '.json,application/json,text/plain', hidden: '' });
    file.addEventListener('change', () => { const f = file.files && file.files[0]; if (!f) return; f.text().then(t => { presetImport(t); list(); file.value = ''; }); });
    key('wczytaj z pliku', () => file.click());
    key('wklej', () => {
      if (body.querySelector('.preset-paste')) return;
      const ta = el('textarea', 'preset-paste', { placeholder: 'Wklej tutaj tekst kopii presetów' });
      const ok = el('button', 'chan-switch', { type: 'button' }); ok.textContent = 'dodaj z wklejonego tekstu';
      ok.addEventListener('click', () => { presetImport(ta.value); list(); ta.remove(); ok.remove(); });
      g.append(ta, ok); ta.focus();
    });
    g.append(io, file);
    const n2 = el('div', 'cfg-note'); n2.textContent = 'Kopia to plik tekstowy z Twoimi presetami. Wyślij go sobie (Dysk, e-mail, komunikator). Wczytanie dodaje presety, a te o tej samej nazwie zastępuje.'; g.append(n2);
    chanRender();
  }

  // ---------- Setlists: songs with tempo, effects, scene and notes, switched by MIDI controllers or a page-turner pedal ----------
  // A song is sent to the mixer in this order: scene (if set), then after the scene has loaded the two FX programs
  // with their parameters and routing, then the tempo (metronome + FX tempo).
  const sets = () => { if (!Array.isArray(S.sets) || !S.sets.length) S.sets = [{ name: 'Setlista 1', songs: [] }]; if (!(S.setI < S.sets.length)) S.setI = 0; return S.sets; };
  const curSet = () => sets()[S.setI];
  const fxName = f => { const t = FX_PRESETS[f.n] && FX_PRESETS[f.n][f.preset]; return t ? t.name : '?'; };
  const songOf = name => ({ name, bpm: M.bpm, beats: M.beats, fx: S.fx.map((f, n) => ({ n, preset: f.preset, v1: f.v1, v2: f.v2, v3: f.v3, en: f.en })), scene: null, tempoFx: S.metroFx !== false, notes: '' });
  const songSum = s => [s.bpm + ' bpm' + (s.beats !== 4 ? ' ' + s.beats + '/4' : ''), s.fx ? 'FX ' + s.fx.map(fxName).join(' / ') : '', s.scene !== null && s.scene !== undefined ? 'scena ' + (s.scene + 1) : ''].filter(Boolean).join(' · ');
  function songClean(x) {
    if (!x || typeof x !== 'object' || typeof x.name !== 'string' || !x.name.trim()) return null;
    const n = (v, lo, hi, d) => typeof v === 'number' && isFinite(v) ? Math.round(within(v, lo, hi)) : d;
    const s = { name: x.name.trim().slice(0, 40), bpm: n(x.bpm, 40, 240, 120), beats: [2, 3, 4, 6].includes(x.beats) ? x.beats : 4,
      scene: x.scene === null || x.scene === undefined ? null : n(x.scene, 0, 14, null), tempoFx: x.tempoFx !== false,
      notes: typeof x.notes === 'string' ? x.notes.slice(0, 400) : '' };
    if (Array.isArray(x.fx) && x.fx.length === 2) s.fx = x.fx.map((f, k) => ({ n: k, preset: n(f && f.preset, 0, 15, 0), v1: n(f && f.v1, 0, 100, 50), v2: n(f && f.v2, 0, 1, 0), v3: n(f && f.v3, 0, 255, 0), en: n(f && f.en, 0, 15, 0) }));
    return s;
  }
  let songTimer = 0;
  function songGo(k, quiet) {
    const set = curSet(), s = set.songs[k]; if (!s) return;
    S.songI = k; save();
    clearTimeout(songTimer);
    const scene = s.scene !== null && s.scene !== undefined;
    if (scene) { S.scene = s.scene; if (B.ready) bleScene(s.scene); else if (out) pc(GLOBAL_CH, s.scene + 1); }
    const rest = () => {
      if (s.fx) s.fx.forEach((f, n) => {
        Object.assign(S.fx[n], { preset: f.preset, v1: f.v1, v2: f.v2, v3: f.v3, en: f.en });
        if (B.ready) { bleQueue('xp' + n, 0x31, [0x0c + n, f.preset]); setTimeout(() => bleFxSetup(n), 300); }
        else if (out) pc(13 + n, f.preset + 1);
      });
      M.beats = s.beats; S.beats = s.beats; setBpm(s.bpm);
      if (s.tempoFx && B.ready && S.tempo !== s.bpm) { S.tempo = s.bpm; bleTempo(); }
      render(); chanRender(); save();
    };
    if (scene && (B.ready || out)) songTimer = setTimeout(rest, 900); else rest();   // the scene brings its own FX: ours go on top
    if (!quiet) toast('▶ ' + (k + 1) + '. ' + s.name + '  ·  ' + s.bpm + ' bpm');
    bump(true); setlistPaint();
  }
  function songStep(d) {
    const n = curSet().songs.length; if (!n) { toast('Setlista jest pusta.'); return; }
    const k = S.songI === undefined || S.songI === null || S.songI >= n ? (d > 0 ? 0 : n - 1) : within(S.songI + d, 0, n - 1);
    if (k === S.songI && S.songI !== undefined) { toast(d > 0 ? 'To ostatnia piosenka.' : 'To pierwsza piosenka.'); return; }
    songGo(k);
  }
  // ----- control: learned MIDI messages and keys; program change N picks song N -----
  let learning = null;
  const midiSig = d => {
    const t = d[0] & 0xf0, ch = (d[0] & 15) + 1;
    if (t === 0x90 && d[2] > 0) return 'n' + ch + ':' + d[1];
    if (t === 0xb0 && d[2] > 0) return 'c' + ch + ':' + d[1];
    if (t === 0xc0) return 'p' + ch + ':' + d[1];
    return null;
  };
  const sigText = g => !g ? 'brak' : g[0] === 'k' ? 'klawisz ' + g.slice(2) : (g[0] === 'n' ? 'nuta ' : g[0] === 'c' ? 'CC ' : 'program ') + g.slice(1).split(':')[1] + ' (kanał ' + g.slice(1).split(':')[0] + ')';
  function controlIn(sig, raw) {
    if (!sig) return false;
    if (learning) { if (!S.ctl) S.ctl = {}; S.ctl[learning] = sig; toast('Przypisano: ' + sigText(sig)); learning = null; save(); chanRender(); return true; }
    const c = S.ctl || {};
    if (sig === c.next) { songStep(1); return true; }
    if (sig === c.prev) { songStep(-1); return true; }
    if (raw && (raw[0] & 0xf0) === 0xc0 && S.pcSong !== false) { const k = raw[1]; if (k < curSet().songs.length) songGo(k); else toast('Brak piosenki nr ' + (k + 1)); return true; }
    return false;
  }
  function midiIn(d) {
    if (!d || !d.length || d[0] < 0x80) return;
    if ((d[0] & 0xf0) === 0x80 || ((d[0] & 0xf0) === 0x90 && d[2] === 0) || ((d[0] & 0xf0) === 0xb0 && d[2] === 0)) return;   // releases
    controlIn(midiSig(d), d);
  }
  const PAGE_NEXT = ['PageDown', 'ArrowRight', 'ArrowDown', 'Space'], PAGE_PREV = ['PageUp', 'ArrowLeft', 'ArrowUp'];
  document.addEventListener('keydown', e => {
    const t = e.target, typing = t && (t.tagName === 'INPUT' && t.type !== 'range' || t.tagName === 'TEXTAREA');
    if (typing || e.repeat || document.getElementById('ask')) return;
    const sig = 'k:' + e.code;
    if (learning) { e.preventDefault(); controlIn(sig); return; }
    if (controlIn(sig)) { e.preventDefault(); return; }
    if (S.pageKeys !== false && curSet().songs.length) {
      if (PAGE_NEXT.includes(e.code)) { e.preventDefault(); songStep(1); }
      else if (PAGE_PREV.includes(e.code)) { e.preventDefault(); songStep(-1); }
    }
  }, true);
  const MIDI = { names: [], found: [], scanning: false };
  function midiInit() {
    if (NATIVE && NATIVE.midiStart) {
      try {
        NATIVE.addListener('midi', e => midiIn(e.data));
        NATIVE.addListener('midiDevices', e => { MIDI.names = e.names || []; chanRender(); });
        NATIVE.addListener('midiFound', e => { if (!MIDI.found.some(f => f.address === e.address)) MIDI.found.push(e); chanRender(); });
        NATIVE.addListener('midiScanEnd', () => { MIDI.scanning = false; chanRender(); });
        NATIVE.midiStart().catch(() => {});
        if (S.midiBle) setTimeout(() => NATIVE.midiBle({ address: S.midiBle }).catch(() => {}), 2500);
      } catch (e) {}
    }
  }
  function webMidiInputs() {
    if (!access) return;
    const names = [];
    access.inputs.forEach(inp => { if (/flow/i.test(inp.name || '')) return; inp.onmidimessage = ev => midiIn(Array.from(ev.data)); names.push(inp.name); });
    if (!NATIVE) { MIDI.names = names; chanRender(); }
  }
  function setlistPaint() { const f = document.getElementById('set-now'); if (f && f.__paint) f.__paint(); }
  function openSetlist() {
    const body = subPage('setlista', curSet().name);
    // now playing + big previous / next
    const now = el('div', 'set-now', { id: 'set-now' });
    const nm = el('div', 'set-name'), info = el('div', 'set-info'), notes = el('div', 'set-notes');
    const nav = el('div', 'set-nav');
    const prev = el('button', 'chan-switch set-btn', { type: 'button' }); prev.textContent = '◀ poprzednia';
    const next = el('button', 'chan-switch set-btn go', { type: 'button' }); next.textContent = 'następna ▶';
    prev.addEventListener('click', () => songStep(-1)); next.addEventListener('click', () => songStep(1));
    nav.append(prev, next); now.append(nm, info, notes, nav); body.append(now);
    const listG = grp(body, 'piosenki'); const listBox = el('div'); listG.append(listBox);
    const add = el('button', 'chan-switch', { type: 'button' }); add.textContent = 'dodaj piosenkę z obecnych ustawień';
    add.addEventListener('click', () => {
      const t = (prompt('Nazwa piosenki', '') || '').trim().slice(0, 40); if (!t) return;
      curSet().songs.push(songOf(t)); save(); list();
    });
    const n0 = el('div', 'cfg-note'); n0.textContent = 'Piosenka zapamiętuje tempo metronomu, oba efekty (program, parametry, wysyłki) i opcjonalnie scenę miksera. Stuknij nazwę, żeby ją zagrać.';
    listG.append(add, n0);
    now.__paint = () => {
      const s = curSet().songs[S.songI];
      nm.textContent = s ? (S.songI + 1) + '. ' + s.name : 'nic nie wybrano';
      info.textContent = s ? songSum(s) : 'Stuknij piosenkę na liście albo „następna”.';
      notes.textContent = s && s.notes ? s.notes : ''; notes.hidden = !(s && s.notes);
      [...listBox.querySelectorAll('.song-row')].forEach((r, k) => r.classList.toggle('sel', k === S.songI));
    };
    function list() {
      listBox.textContent = '';
      const songs = curSet().songs;
      if (!songs.length) { const n = el('div', 'cfg-note'); n.textContent = 'Pusta setlista. Ustaw tempo i efekty, potem „dodaj piosenkę”.'; listBox.append(n); }
      songs.forEach((s, k) => {
        const r = el('div', 'cfg-row preset-row song-row'), num = el('span', 'chan-num'), l = el('button', 'chan-label song-pick', { type: 'button' }), keys = el('div', 'cfg-keys');
        num.textContent = k + 1; l.textContent = s.name;
        const sm = el('span', 'preset-sum'); sm.textContent = songSum(s); l.append(sm);
        l.addEventListener('click', () => songGo(k));
        const ed = el('button', 'chan-switch small', { type: 'button' }); ed.textContent = 'edytuj';
        ed.addEventListener('click', () => openSong(k, () => { list(); now.__paint(); }));
        keys.append(ed); r.append(num, l, keys); listBox.append(r);
      });
      now.__paint();
    }
    list();
    // setlists
    let g = grp(body, 'setlisty');
    const chips = el('div', 'cfg-keys'); chips.style.justifyContent = 'flex-start'; g.append(chips);
    const chipsPaint = () => {
      chips.textContent = '';
      sets().forEach((x, k) => {
        const b = el('button', 'chan-switch small', { type: 'button', 'aria-pressed': k === S.setI ? 'true' : 'false' }); b.textContent = x.name;
        b.addEventListener('click', () => { S.setI = k; S.songI = null; save(); openSetlist(); });
        chips.append(b);
      });
    };
    chipsPaint();
    const sk = el('div', 'cfg-keys'); sk.style.justifyContent = 'flex-start'; g.append(sk);
    const key = (box, t, f) => { const b = el('button', 'chan-switch small', { type: 'button' }); b.textContent = t; b.addEventListener('click', f); box.append(b); return b; };
    key(sk, 'nowa', () => { const t = (prompt('Nazwa setlisty', 'Setlista ' + (sets().length + 1)) || '').trim().slice(0, 30); if (!t) return; sets().push({ name: t, songs: [] }); S.setI = sets().length - 1; S.songI = null; save(); openSetlist(); });
    key(sk, 'zmień nazwę', () => { const t = (prompt('Nowa nazwa setlisty', curSet().name) || '').trim().slice(0, 30); if (!t) return; curSet().name = t; save(); openSetlist(); });
    key(sk, 'kopia setlisty', () => { const c = JSON.parse(JSON.stringify(curSet())); c.name = (c.name + ' (kopia)').slice(0, 30); sets().push(c); S.setI = sets().length - 1; save(); openSetlist(); });
    key(sk, 'usuń', () => { if (!confirm('Usunąć setlistę „' + curSet().name + '” (' + curSet().songs.length + ' piosenek)?')) return; sets().splice(S.setI, 1); S.setI = 0; S.songI = null; save(); openSetlist(); });
    // control
    g = grp(body, 'sterowanie');
    const dev = el('div', 'cfg-note'); g.append(dev);
    subRows.push(() => { dev.textContent = MIDI.names.length ? 'Kontrolery MIDI: ' + MIDI.names.join(', ') : NATIVE ? 'Nie widzę kontrolera MIDI. Kablowy podłącz przez przejściówkę USB OTG, bezprzewodowy znajdź niżej.' : 'W przeglądarce kontroler MIDI zadziała po połączeniu przez kabel USB (menu pod lampką).'; });
    const learnRow = (label, k) => {
      const r = el('div', 'cfg-row preset-row'), l = el('span', 'chan-label'), box = el('div', 'cfg-keys'); l.textContent = label;
      const v = el('span', 'preset-sum'); l.append(v); const b = el('button', 'chan-switch small', { type: 'button', 'aria-pressed': 'false' });
      b.addEventListener('click', () => { learning = learning === k ? null : k; chanRender(); if (learning) toast('Naciśnij przycisk na kontrolerze albo pedale'); });
      const c = el('button', 'chan-switch small', { type: 'button' }); c.textContent = 'wyczyść';
      c.addEventListener('click', () => { if (S.ctl) delete S.ctl[k]; save(); chanRender(); });
      subRows.push(() => { v.textContent = sigText((S.ctl || {})[k]); b.textContent = learning === k ? 'czekam…' : 'naucz'; b.setAttribute('aria-pressed', learning === k ? 'true' : 'false'); });
      box.append(b, c); r.append(l, box); g.append(r);
    };
    learnRow('następna', 'next'); learnRow('poprzednia', 'prev');
    choice(g, 'zmiana programu', () => S.pcSong !== false, v => { S.pcSong = v; }, [['wybiera piosenkę', true], ['nic', false]]);
    choice(g, 'pedał do stron', () => S.pageKeys !== false, v => { S.pageKeys = v; }, [['działa', true], ['wyłączony', false]]);
    const n1 = el('div', 'cfg-note'); n1.textContent = 'Zmiana programu 1 wybiera piosenkę 1, program 2 piosenkę 2 i tak dalej. Pedał do przewracania stron (albo klawiatura Bluetooth): strzałka w prawo, w dół, PageDown i spacja to następna, strzałka w lewo, w górę i PageUp to poprzednia. Działa też przy zablokowanym ekranie.'; g.append(n1);
    if (NATIVE && NATIVE.midiScan) {
      const bk = el('div', 'cfg-keys'); bk.style.justifyContent = 'flex-start'; g.append(bk);
      const sb = key(bk, 'szukaj kontrolera Bluetooth MIDI', () => { MIDI.found = []; MIDI.scanning = true; chanRender(); NATIVE.midiScan().catch(e => { MIDI.scanning = false; toast(e.message || 'Nie mogę szukać'); chanRender(); }); });
      const fb = el('div', 'cfg-keys'); fb.style.justifyContent = 'flex-start'; g.append(fb);
      subRows.push(() => {
        sb.textContent = MIDI.scanning ? 'szukam… (włącz kontroler)' : 'szukaj kontrolera Bluetooth MIDI';
        fb.textContent = '';
        MIDI.found.forEach(f => key(fb, 'połącz: ' + f.name, () => { S.midiBle = f.address; save(); NATIVE.midiBle({ address: f.address }).then(() => toast('Łączę z ' + f.name), e => toast(e.message || 'Nie udało się')); }));
        if (!MIDI.scanning && !MIDI.found.length && S.midiBle) { const n = el('span', 'cfg-note'); n.textContent = 'Zapamiętany kontroler Bluetooth łączy się sam po starcie aplikacji.'; fb.append(n); }
      });
    }
    // backup
    g = grp(body, 'kopia zapasowa');
    const io = el('div', 'preset-io'); g.append(io);
    const exp = () => JSON.stringify({ flow8: 'setlists', v: 1, app: APP_VERSION, date: new Date().toISOString().slice(0, 10), sets: sets() }, null, 1);
    key(io, NATIVE ? 'wyślij / zapisz' : 'pobierz plik', () => shareText('flow8-setlisty-' + new Date().toISOString().slice(0, 10) + '.json', exp()));
    key(io, 'kopiuj tekst', () => { (navigator.clipboard ? navigator.clipboard.writeText(exp()) : Promise.reject()).then(() => toast('Setlisty skopiowane do schowka'), () => toast('Schowek niedostępny')); });
    const imp = text => {
      let d; try { d = JSON.parse(text); } catch (e) { toast('To nie jest plik z setlistami.'); return; }
      let n = 0;
      ((d && d.sets) || []).forEach(x => {
        if (!x || typeof x.name !== 'string' || !Array.isArray(x.songs)) return;
        const c = { name: x.name.trim().slice(0, 30) || 'Setlista', songs: x.songs.map(songClean).filter(Boolean) };
        const k = sets().findIndex(q => q.name === c.name);
        if (k >= 0) sets()[k] = c; else sets().push(c); n++;
      });
      save(); toast(n ? 'Wczytano setlisty: ' + n : 'Nie znalazłem setlist w tym pliku.'); if (n) openSetlist();
    };
    const file = el('input', '', { type: 'file', accept: '.json,application/json,text/plain', hidden: '' });
    file.addEventListener('change', () => { const f = file.files && file.files[0]; if (f) f.text().then(imp); });
    key(io, 'wczytaj z pliku', () => file.click());
    key(io, 'wklej', () => {
      if (body.querySelector('.preset-paste')) return;
      const ta = el('textarea', 'preset-paste', { placeholder: 'Wklej tutaj tekst kopii setlist' });
      const ok = el('button', 'chan-switch', { type: 'button' }); ok.textContent = 'dodaj z wklejonego tekstu';
      ok.addEventListener('click', () => imp(ta.value));
      g.append(ta, ok); ta.focus();
    });
    g.append(file);
    const n2 = el('div', 'cfg-note'); n2.textContent = 'Kopia zawiera wszystkie setlisty. Wczytanie dodaje setlisty, a te o tej samej nazwie zastępuje.'; g.append(n2);
    chanRender();
  }
  function openSong(k, done) {
    const set = curSet(), s = set.songs[k];
    const body = subPage('piosenka', (k + 1) + '. ' + s.name);
    const back = $('#sub .chan-back'); if (back) back.addEventListener('click', () => setTimeout(() => { openSetlist(); }, 0));
    let g = grp(body, 'nazwa i notatki');
    const nmRow = el('div', 'cfg-row'), nl = el('span', 'chan-label'), nk = el('div', 'cfg-keys'); nl.textContent = s.name;
    const rn = el('button', 'chan-switch small', { type: 'button' }); rn.textContent = 'zmień nazwę';
    rn.addEventListener('click', () => { const t = (prompt('Nazwa piosenki', s.name) || '').trim().slice(0, 40); if (t) { s.name = t; nl.textContent = t; save(); } });
    nk.append(rn); nmRow.append(nl, nk); g.append(nmRow);
    const ta = el('textarea', 'preset-paste song-notes', { placeholder: 'Notatki widoczne przy piosence: tonacja, kapodaster, kto zaczyna…' });
    ta.value = s.notes || ''; ta.addEventListener('input', () => { s.notes = ta.value.slice(0, 400); save(); }); g.append(ta);
    g = grp(body, 'tempo');
    g.append(mkRow('tempo', {
      get: () => (s.bpm - 40) / 200, set: p => { s.bpm = Math.round(40 + p * 200); save(); },
      text: () => s.bpm + ' bpm', ask: () => askNum('Tempo (bpm)', String(s.bpm), 'Od 40 do 240.', 40, 240, d => { s.bpm = Math.round(d); save(); })
    }, subRows));
    choice(g, 'metrum', () => s.beats, v => { s.beats = v; }, [['2/4', 2], ['3/4', 3], ['4/4', 4], ['6/4', 6]]);
    choice(g, 'tempo efektu', () => s.tempoFx !== false, v => { s.tempoFx = v; }, [['wysyłaj', true], ['nie', false]]);
    g = grp(body, 'efekty i scena');
    const fxl = el('div', 'cfg-note'); g.append(fxl);
    subRows.push(() => { fxl.textContent = s.fx ? 'FX 1: ' + fxName(s.fx[0]) + ' (' + s.fx[0].v1 + '%), FX 2: ' + fxName(s.fx[1]) + ' (' + s.fx[1].v1 + '%)' : 'Efekty bez zmian przy tej piosence.'; });
    const ek = el('div', 'cfg-keys'); ek.style.justifyContent = 'flex-start'; g.append(ek);
    const key = (t, f) => { const b = el('button', 'chan-switch small', { type: 'button' }); b.textContent = t; b.addEventListener('click', f); ek.append(b); return b; };
    key('weź obecne efekty', () => { s.fx = songOf('').fx; save(); chanRender(); toast('Zapisano obecne efekty w piosence'); });
    key('bez efektów', () => { delete s.fx; save(); chanRender(); });
    key('weź obecne tempo', () => { s.bpm = M.bpm; s.beats = M.beats; save(); chanRender(); });
    const sr = el('div', 'cfg-row'), sl = el('span', 'chan-label'), sk = el('div', 'cfg-keys'); sl.textContent = 'scena miksera';
    const sv = el('button', 'chan-switch small', { type: 'button' });
    sv.addEventListener('click', () => askNum('Scena miksera (0 = bez zmiany sceny)', String(s.scene === null || s.scene === undefined ? 0 : s.scene + 1), 'Od 1 do 15 albo 0, żeby nie zmieniać sceny.', 0, 15, d => { s.scene = Math.round(d) ? Math.round(d) - 1 : null; save(); }));
    subRows.push(() => { sv.textContent = s.scene === null || s.scene === undefined ? 'bez zmiany' : 'scena ' + (s.scene + 1); });
    sk.append(sv); sr.append(sl, sk); g.append(sr);
    const n1 = el('div', 'cfg-note'); n1.textContent = 'Scena wczytuje się pierwsza, a efekty i tempo piosenki trafiają do miksera zaraz po niej.'; g.append(n1);
    g = grp(body, 'kolejność');
    const ok = el('div', 'cfg-keys'); ok.style.justifyContent = 'flex-start'; g.append(ok);
    const mv = d => { const j = k + d; if (j < 0 || j >= set.songs.length) return; set.songs.splice(j, 0, set.songs.splice(k, 1)[0]); if (S.songI === k) S.songI = j; save(); openSong(j, done); };
    [['wyżej', () => mv(-1)], ['niżej', () => mv(1)], ['zagraj teraz', () => songGo(k)],
     ['usuń piosenkę', () => { if (!confirm('Usunąć „' + s.name + '” z setlisty?')) return; set.songs.splice(k, 1); if (S.songI >= set.songs.length) S.songI = null; save(); openSetlist(); }]].forEach(([t, f]) => {
      const b = el('button', 'chan-switch small', { type: 'button' }); b.textContent = t; b.addEventListener('click', f); ok.append(b);
    });
    chanRender();
  }
  function shareText(name, t) {
    if (NATIVE && NATIVE.share) { NATIVE.share({ title: name, text: t }).catch(() => toast('Nie udało się. Użyj „kopiuj tekst”.')); return; }
    const a = el('a', '', { href: URL.createObjectURL(new Blob([t], { type: 'application/json' })), download: name }); document.body.append(a); a.click(); a.remove();
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
    metroOpts();
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
    M.running = true; M.beat = 0; M.tapLeft = 4; awake();
    M.next = M.ctx.currentTime + 0.06;
    tick();
    metroRender();
  }
  function stop() {
    M.running = false; clearTimeout(M.timer); metroRender(); awake();
    [...$('#beats').children].forEach(s => s.className = '');
    $('#beat-led').classList.remove('on');
  }
  function tick() {
    if (!M.running) return;
    while (M.next < M.ctx.currentTime + 0.2) {
      if (S.metroSnd !== 'mute') click(M.next, M.beat % M.beats === 0);
      const b = M.beat % M.beats, delay = Math.max(0, (M.next - M.ctx.currentTime) * 1000);
      setTimeout(() => onBeat(b), delay);
      M.next += 60 / M.bpm; M.beat++;
    }
    M.timer = setTimeout(tick, 25);
  }
  // the click can go to one side only: with the phone cabled into two mixer inputs (L, R) it lands on one channel,
  // which can then be sent to the monitors and kept off the sala
  function click(t, accent) {
    const v = S.metroVol === undefined ? 1 : S.metroVol; if (v <= 0) return;
    const o = M.ctx.createOscillator(), g = M.ctx.createGain();
    const wood = S.metroSnd === 'wood';
    o.type = wood ? 'triangle' : 'sine';
    o.frequency.value = wood ? (accent ? 1250 : 880) : (accent ? 1760 : 1175);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((accent ? 0.9 : 0.55) * v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (wood ? 0.03 : 0.05));
    let node = o.connect(g);
    if (S.metroSide && M.ctx.createStereoPanner) { const pn = M.ctx.createStereoPanner(); pn.pan.value = S.metroSide === 'L' ? -1 : 1; node = node.connect(pn); }
    node.connect(M.ctx.destination);
    o.start(t); o.stop(t + 0.06);
  }
  function metroOpts() {
    const box = $('#metro-opts');
    const keys = (label, get, set, opts) => {
      const r = el('div', 'metro-opt'), l = el('span', 'metro-unit'); l.textContent = label; r.append(l);
      const k = el('div', 'metro-keys'); r.append(k);
      opts.forEach(([t, v]) => {
        const b = el('button', 'key small', { type: 'button', 'aria-pressed': 'false' }); b.textContent = t;
        b.addEventListener('click', () => { set(v); save(); paint(); });
        k.append(b); M.paints.push(() => b.setAttribute('aria-pressed', get() === v ? 'true' : 'false'));
      });
      box.append(r);
    };
    M.paints = [];
    keys('wyjście', () => S.metroSide || '', v => { S.metroSide = v; }, [['L + P', ''], ['lewe', 'L'], ['prawe', 'R']]);
    keys('dźwięk', () => S.metroSnd || 'beep', v => { S.metroSnd = v; }, [['beep', 'beep'], ['drewno', 'wood'], ['cisza', 'mute']]);
    keys('wibracja', () => !!S.metroVib, v => { S.metroVib = v; }, [['tak', true], ['nie', false]]);
    const r = el('div', 'metro-opt'), l = el('span', 'metro-unit'); l.textContent = 'głośność';
    const sl = el('input', 'metro-slider small', { type: 'range', min: '0', max: '200', step: '5', 'aria-label': 'Głośność metronomu' });
    sl.value = Math.round((S.metroVol === undefined ? 1 : S.metroVol) * 100);
    const v = el('span', 'metro-unit'); const txt = () => { v.textContent = sl.value + '%'; };
    sl.addEventListener('input', () => { S.metroVol = sl.value / 100; txt(); save(); }); txt();
    r.append(l, sl, v); box.append(r);
    const paint = () => M.paints.forEach(f => f());
    paint();
  }
  // tap tempo for the effects: USB MIDI gets a tap note, Bluetooth gets the tempo itself (as FLOW Mix does)
  const fxTaps = [];
  function fxTap() {
    if (!B.ready) { send([0x90 + GLOBAL_CH - 1, 0, 100], true); toast(out ? 'Tap tempo' : 'Najpierw połącz się z mikserem.'); return; }
    const now = performance.now();
    while (fxTaps.length && now - fxTaps[0] > 2500) fxTaps.shift();
    fxTaps.push(now);
    if (fxTaps.length < 2) { toast('Stuknij jeszcze raz w rytm'); return; }
    const bpm = Math.round(60000 * (fxTaps.length - 1) / (now - fxTaps[0]));
    if (bpm < 40 || bpm > 240) return;
    S.tempo = bpm; bleTempo(); chanRender(); save(); toast('Tempo efektów: ' + bpm + ' bpm');
  }
  function onBeat(b) {
    if (!M.running) return;
    const spans = $('#beats').children;
    [...spans].forEach((s, k) => s.className = k === b ? (k === 0 ? 'on accent' : 'on') : '');
    const led = $('#beat-led');
    led.classList.add('on'); setTimeout(() => led.classList.remove('on'), 90);
    if (S.metroVib) try { if (NATIVE && NATIVE.buzz) NATIVE.buzz(b === 0 ? {} : { soft: true }).catch(() => {}); else if (navigator.vibrate) navigator.vibrate(b === 0 ? 30 : 12); } catch (e) {}
    if (M.tapLeft > 0 && S.metroFx !== false && M.bpm >= 50 && M.bpm <= 240) {
      if (B.ready) { if (S.tempo !== M.bpm) { S.tempo = M.bpm; bleTempo(); save(); } M.tapLeft = 0; }   // Bluetooth: send the tempo once
      else { send([0x90 + GLOBAL_CH - 1, 0, 100], true); M.tapLeft--; }
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

  window.addEventListener('resize', () => fitText($('#bus-label')));
  build();
  metroBuild();
  lockBuild();
  midiInit();
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
