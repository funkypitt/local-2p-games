// ==================== 2P GAMES COLLECTION ====================

// --- Shared Utilities ---
function createCanvas(area) {
  const c = document.createElement('canvas');
  const r = area.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  c.width = r.width * dpr; c.height = r.height * dpr;
  c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  area.appendChild(c);
  return { canvas: c, ctx, w: r.width, h: r.height };
}

function darkenColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, (n >> 16) - Math.round(255 * amt));
  const g = Math.max(0, ((n >> 8) & 0xff) - Math.round(255 * amt));
  const b = Math.max(0, (n & 0xff) - Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}

function showOverlay(area, msg, btnText, cb) {
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<button style="position:absolute;top:12px;right:16px;background:none;border:none;color:#fff;font-size:2em;cursor:pointer;line-height:1;opacity:0.85" id="ov-x">&times;</button>` +
    `<div style="font-size:1.3em;font-weight:bold;text-align:center">${msg}</div>` +
    (btnText ? `<button class="btn">${btnText}</button>` : '');
  o.querySelector('#ov-x').onclick = () => { o.remove(); };
  if (btnText && cb) o.querySelector('.btn').onclick = () => { o.remove(); cb(); };
  else if (cb) o.onclick = e => { if (e.target === o) { o.remove(); cb(); } };
  area.appendChild(o);
  return o;
}

// === GLOBAL AUDIO ENGINE ===
const SND = {
  _ctx: null, _musicGain: null, _sfxGain: null, _convolver: null,
  _musicOn: localStorage.getItem('2pg-music') !== 'off',
  _playing: false, _nextTime: 0, _timer: null, _bar: 0,
  init() {
    if (this._ctx) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._musicGain = this._ctx.createGain(); this._musicGain.gain.value = 0.12;
    this._musicGain.connect(this._ctx.destination);
    this._sfxGain = this._ctx.createGain(); this._sfxGain.gain.value = 0.35;
    this._sfxGain.connect(this._ctx.destination);
    // Simple reverb impulse for SFX richness
    const sr = this._ctx.sampleRate, len = sr * 0.6;
    const buf = this._ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2) * 0.3; }
    this._convolver = this._ctx.createConvolver(); this._convolver.buffer = buf;
    this._reverbGain = this._ctx.createGain(); this._reverbGain.gain.value = 0.15;
    this._convolver.connect(this._reverbGain); this._reverbGain.connect(this._ctx.destination);
  },
  hz(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  _tone(freq, dur, type, vol, t, dest) {
    const o = this._ctx.createOscillator(), g = this._ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.01);
  },
  _pad(notes, dur, vol, t) {
    notes.forEach(m => {
      const f = this.hz(m);
      ['sine','triangle'].forEach((type, ti) => {
        const o = this._ctx.createOscillator(), g = this._ctx.createGain();
        o.type = type; o.frequency.value = f * (ti === 1 ? 1.002 : 1); // slight detune for warmth
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol * (ti === 0 ? 1 : 0.4), t + dur * 0.3);
        g.gain.setValueAtTime(vol * (ti === 0 ? 0.7 : 0.3), t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g); g.connect(this._musicGain); o.start(t); o.stop(t + dur + 0.05);
      });
    });
  },
  _hat(vol, t) {
    const a = this._ctx, b = a.createBuffer(1, a.sampleRate * 0.04, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
    const s = a.createBufferSource(); s.buffer = b;
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = a.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this._musicGain); s.start(t);
  },
  // Chord progressions: Am - F - C - G (i-VI-III-VII in A minor)
  _chords: [[57,60,64],[53,57,60],[48,52,55],[55,59,62], [57,60,64],[53,57,60],[48,52,55],[55,59,62]],
  // Melodies in A minor pentatonic (A=69 C=72 D=74 E=76 G=79) — more expressive
  _mel: [
    [69,0,72,0,74,0,76,0, 79,0,76,0,74,0,72,0],
    [76,0,74,0,72,0,69,0, 72,0,74,0,76,0,79,0],
    [79,0,81,0,79,0,76,0, 74,0,72,0,69,0,72,0],
    [74,0,0,0,76,0,74,0, 72,0,69,0,67,0,69,0],
    [69,0,72,0,76,0,79,0, 81,0,79,0,76,0,74,0],
    [72,0,74,0,76,0,0,0, 74,0,72,0,69,0,67,0],
    [79,0,76,0,79,0,81,0, 79,0,76,0,74,0,72,0],
    [69,0,0,0,72,0,74,0, 76,0,79,0,76,0,74,0],
  ],
  // Walking bass
  _bas: [
    [45,0,0,0,48,0,0,0, 45,0,0,0,43,0,0,0],
    [41,0,0,0,43,0,0,0, 45,0,0,0,48,0,0,0],
    [36,0,0,0,40,0,0,0, 43,0,0,0,40,0,0,0],
    [43,0,0,0,47,0,0,0, 50,0,0,0,47,0,0,0],
  ],
  _scheduleBar() {
    if (!this._playing) return;
    const bpm = 82, step = 60 / bpm / 2; // 82 BPM, 8th notes
    const m = this._mel[this._bar % 8], b = this._bas[this._bar % 4];
    const barDur = 16 * step;
    // Chord pad — sustained underneath
    this._pad(this._chords[this._bar % 8], barDur, 0.025, this._nextTime);
    for (let i = 0; i < 16; i++) {
      const t = this._nextTime + i * step;
      // Melody: warm sine + triangle layer
      if (m[i]) {
        this._tone(this.hz(m[i]), step * 2.2, 'sine', 0.045, t, this._musicGain);
        this._tone(this.hz(m[i]) * 1.001, step * 1.8, 'triangle', 0.02, t, this._musicGain);
      }
      // Bass: triangle with sub
      if (b[i]) {
        this._tone(this.hz(b[i]), step * 3.5, 'triangle', 0.04, t, this._musicGain);
        this._tone(this.hz(b[i] - 12), step * 2, 'sine', 0.02, t, this._musicGain);
      }
      // Hi-hat rhythm: soft on offbeats for groove
      if (i % 4 === 2) this._hat(0.012, t);
      if (i % 4 === 0 && i > 0) this._hat(0.006, t);
    }
    this._bar++;
    this._nextTime += barDur;
    this._timer = setTimeout(() => this._scheduleBar(), (barDur - 0.2) * 1000);
  },
  musicStart() {
    if (!this._musicOn || this._playing) return;
    this.init();
    if (this._ctx.state === 'suspended') this._ctx.resume();
    this._playing = true; this._bar = 0;
    this._nextTime = this._ctx.currentTime + 0.05;
    this._scheduleBar();
  },
  musicStop() { this._playing = false; if (this._timer) clearTimeout(this._timer); },
  musicToggle() {
    this._musicOn = !this._musicOn;
    localStorage.setItem('2pg-music', this._musicOn ? 'on' : 'off');
    if (this._musicOn) this.musicStart(); else this.musicStop();
    return this._musicOn;
  },
  // --- SFX Library (richer multi-layered sounds) ---
  _sfx(fn) { try { this.init(); if (this._ctx.state === 'suspended') this._ctx.resume(); fn.call(this); } catch(e){} },
  pong() { this._sfx(function() { const t=this._ctx.currentTime; this._tone(660,0.06,'square',0.15,t,this._sfxGain); this._tone(990,0.04,'sine',0.05,t,this._sfxGain); }); },
  pop() { this._sfx(function() { const a=this._ctx,t=a.currentTime; const o=a.createOscillator(),g=a.createGain(); o.type='sine'; o.frequency.setValueAtTime(600,t); o.frequency.exponentialRampToValueAtTime(150,t+0.12); g.gain.setValueAtTime(0.2,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.12); o.connect(g); g.connect(this._sfxGain); o.start(t); o.stop(t+0.13); this._tone(900,0.05,'triangle',0.06,t,this._sfxGain); }); },
  score() { this._sfx(function() { const t=this._ctx.currentTime; [523,659,784,1047].forEach((f,i) => { this._tone(f,0.15,'sine',0.1,t+i*0.08,this._sfxGain); this._tone(f*1.5,0.1,'triangle',0.03,t+i*0.08,this._sfxGain); }); }); },
  drop() { this._sfx(function() { const a=this._ctx,t=a.currentTime; this._tone(200,0.12,'triangle',0.2,t,this._sfxGain); this._tone(120,0.18,'sine',0.1,t+0.02,this._sfxGain); const b=a.createBuffer(1,a.sampleRate*0.04,a.sampleRate),d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,4)*0.3; const s=a.createBufferSource(); s.buffer=b; const g=a.createGain(); g.gain.value=0.12; s.connect(g); g.connect(this._sfxGain); s.start(t); }); },
  click() { this._sfx(function() { const t=this._ctx.currentTime; this._tone(1200,0.025,'square',0.08,t,this._sfxGain); this._tone(800,0.03,'triangle',0.1,t,this._sfxGain); }); },
  buzz() { this._sfx(function() { const a=this._ctx,t=a.currentTime; [120,180].forEach(f => { const o=a.createOscillator(),g=a.createGain(); o.type='sawtooth'; o.frequency.value=f; g.gain.setValueAtTime(0.08,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.3); o.connect(g); g.connect(this._sfxGain); o.start(t); o.stop(t+0.3); }); this._tone(90,0.25,'square',0.05,t,this._sfxGain); }); },
  win() { this._sfx(function() { const t=this._ctx.currentTime; const notes = [523,659,784,1047,1319]; notes.forEach((f,i) => { this._tone(f,0.35,'sine',0.1,t+i*0.1,this._sfxGain); this._tone(f*2,0.25,'triangle',0.03,t+i*0.1,this._sfxGain); this._tone(f*0.5,0.4,'triangle',0.04,t+i*0.1,this._sfxGain); }); [523,784,1047].forEach(f => this._tone(f,0.8,'sine',0.04,t+0.5,this._convolver)); }); },
  boom() { this._sfx(function() { const a=this._ctx,t=a.currentTime; const b=a.createBuffer(1,a.sampleRate*0.6,a.sampleRate),d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2)*0.5; const s=a.createBufferSource(); s.buffer=b; const f=a.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(800,t); f.frequency.exponentialRampToValueAtTime(60,t+0.5); const g=a.createGain(); g.gain.setValueAtTime(0.4,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.6); s.connect(f); f.connect(g); g.connect(this._sfxGain); s.start(t); this._tone(40,0.4,'sine',0.2,t,this._sfxGain); this._tone(60,0.3,'triangle',0.1,t,this._sfxGain); }); },
  shoot() { this._sfx(function() { const a=this._ctx,t=a.currentTime; const o=a.createOscillator(),g=a.createGain(); o.type='square'; o.frequency.setValueAtTime(900,t); o.frequency.exponentialRampToValueAtTime(100,t+0.12); g.gain.setValueAtTime(0.1,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.12); o.connect(g); g.connect(this._sfxGain); o.start(t); o.stop(t+0.12); const b=a.createBuffer(1,a.sampleRate*0.06,a.sampleRate),d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3)*0.15; const s=a.createBufferSource(); s.buffer=b; s.connect(this._sfxGain); s.start(t); }); },
  clack() { this._sfx(function() { const t=this._ctx.currentTime; this._tone(900,0.04,'triangle',0.22,t,this._sfxGain); this._tone(1400,0.025,'sine',0.1,t+0.008,this._sfxGain); this._tone(600,0.03,'square',0.05,t+0.015,this._sfxGain); }); },
  chime() { this._sfx(function() { const t=this._ctx.currentTime; [784,1047,1319].forEach((f,i) => { this._tone(f,0.25,'sine',0.1,t+i*0.06,this._sfxGain); this._tone(f*2.01,0.18,'sine',0.03,t+i*0.06,this._sfxGain); }); this._tone(784,0.4,'sine',0.04,t,this._convolver); }); },
  splash() { this._sfx(function() { const a=this._ctx,t=a.currentTime; const b=a.createBuffer(2,a.sampleRate*0.25,a.sampleRate); for(let ch=0;ch<2;ch++) { const d=b.getChannelData(ch); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1.3)*0.3; } const s=a.createBufferSource(); s.buffer=b; const f=a.createBiquadFilter(); f.type='bandpass'; f.frequency.value=2500; f.Q.value=0.4; const g=a.createGain(); g.gain.value=0.28; s.connect(f); f.connect(g); g.connect(this._sfxGain); s.start(t); this._tone(200,0.08,'sine',0.06,t,this._sfxGain); }); },
  alienDie() { this._sfx(function() { const a=this._ctx,t=a.currentTime; const o=a.createOscillator(),g=a.createGain(); o.type='sawtooth'; o.frequency.setValueAtTime(600,t); o.frequency.exponentialRampToValueAtTime(40,t+0.3); g.gain.setValueAtTime(0.12,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.3); o.connect(g); g.connect(this._sfxGain); o.start(t); o.stop(t+0.3); this._tone(300,0.15,'square',0.05,t+0.05,this._sfxGain); }); },
  tick() { this._sfx(function() { const t=this._ctx.currentTime; this._tone(1100,0.03,'square',0.06,t,this._sfxGain); this._tone(2200,0.015,'sine',0.03,t,this._sfxGain); }); },
  spinTick() { this._sfx(function() { const f=600+Math.random()*600; const t=this._ctx.currentTime; this._tone(f,0.04,'triangle',0.08,t,this._sfxGain); this._tone(f*1.5,0.02,'sine',0.03,t,this._sfxGain); }); },
  gallop() { this._sfx(function() { const t=this._ctx.currentTime; this._tone(180,0.05,'triangle',0.15,t,this._sfxGain); this._tone(240,0.05,'triangle',0.12,t+0.05,this._sfxGain); this._tone(300,0.03,'sine',0.04,t+0.03,this._sfxGain); }); },
};

// === ONLINE MULTIPLAYER MODULE ===
const ONLINE = (function() {
  if (typeof firebase === 'undefined' || !firebase.database) return null;
  firebase.initializeApp({
    projectId: 'tankwars-mobile',
    appId: '1:1006160242389:web:6b476c740b22a8c682a45c',
    storageBucket: 'tankwars-mobile.firebasestorage.app',
    apiKey: 'AIzaSyAXBa8oFAuXFUge2HrpZ3N-5kUrkiDJnS0',
    authDomain: 'tankwars-mobile.firebaseapp.com',
    messagingSenderId: '1006160242389',
    databaseURL: 'https://tankwars-mobile-default-rtdb.firebaseio.com',
  });
  const db = firebase.database();
  const BASE = '2p-rooms/';

  // Seeded PRNG (mulberry32)
  function mulberry32(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Room code
  const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function makeCode() {
    let c = '';
    for (let i = 0; i < 4; i++) c += CHARS[Math.floor(Math.random() * CHARS.length)];
    return c;
  }

  function buildContext(ref, playerId, seed, code) {
    const rng = mulberry32(seed);
    const movesRef = ref.child('moves');
    const stateRef = ref.child('state');
    const listeners = [];

    function addListener(ref, event, cb) {
      ref.on(event, cb);
      listeners.push({ ref, event, cb });
    }

    return {
      playerId, seed, code, rng,
      sendMove(data) {
        movesRef.push({ p: playerId, d: data });
      },
      listenMoves(cb) {
        let initial = true;
        const snap = movesRef.orderByKey();
        addListener(snap, 'child_added', s => {
          const v = s.val();
          if (v.p !== playerId) {
            cb(v.d);
            s.ref.remove();
          } else if (!initial) {
            s.ref.remove();
          }
        });
        // Mark initial load complete after a tick
        setTimeout(() => { initial = false; }, 500);
      },
      setState(key, data) {
        stateRef.child(key).set(data);
      },
      onState(key, cb) {
        addListener(stateRef.child(key), 'value', s => {
          if (s.val() !== null) cb(s.val());
        });
      },
      onOpponentDisconnect(cb) {
        addListener(ref.child('players'), 'value', s => {
          const v = s.val();
          if (v && v[playerId] && !v[1 - playerId]) cb();
        });
      },
      cleanup() {
        for (const l of listeners) l.ref.off(l.event, l.cb);
        listeners.length = 0;
        ref.child('players/' + playerId).remove();
      }
    };
  }

  function createRoom(gameId, onReady) {
    const code = makeCode();
    const seed = Math.floor(Math.random() * 2147483647);
    const ref = db.ref(BASE + code);
    ref.set({
      game: gameId, status: 'waiting', seed,
      players: { 0: true },
      created: firebase.database.ServerValue.TIMESTAMP
    });
    ref.child('players/0').onDisconnect().remove();
    // Listen for player 1
    const p1Ref = ref.child('players/1');
    p1Ref.on('value', s => {
      if (s.val()) {
        p1Ref.off();
        ref.child('status').set('playing');
        onReady(buildContext(ref, 0, seed, code));
      }
    });
    return code;
  }

  function joinRoom(code, gameId, onReady, onError) {
    code = code.toUpperCase().trim();
    const ref = db.ref(BASE + code);
    ref.once('value', s => {
      const v = s.val();
      if (!v) { onError('Room not found'); return; }
      if (v.game !== gameId) { onError('Wrong game'); return; }
      if (v.status !== 'waiting') { onError('Room full'); return; }
      ref.child('players/1').set(true);
      ref.child('players/1').onDisconnect().remove();
      onReady(buildContext(ref, 1, v.seed, code));
    });
  }

  function autoMatch(gameId, onReady, onWaiting) {
    const roomsRef = db.ref(BASE);
    roomsRef.orderByChild('game').equalTo(gameId).once('value', s => {
      let joined = false;
      s.forEach(child => {
        if (joined) return;
        const v = child.val();
        if (v.status === 'waiting') {
          joined = true;
          const code = child.key;
          const ref = db.ref(BASE + code);
          ref.child('players/1').set(true);
          ref.child('players/1').onDisconnect().remove();
          ref.child('status').set('playing');
          onReady(buildContext(ref, 1, v.seed, code));
        }
      });
      if (!joined) {
        const code = createRoom(gameId, onReady);
        onWaiting(code);
      }
    });
  }

  function showLobby(area, gameId, onStart, onCancel) {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.style.gap = '14px';

    function showMain() {
      ov.innerHTML = `
        <div style="font-size:1.3em;font-weight:bold">Online Play</div>
        <button class="btn" id="ol-create" style="padding:12px 32px;font-size:1em">Create Room</button>
        <button class="btn" id="ol-join" style="padding:12px 32px;font-size:1em">Join Room</button>
        <button class="btn" id="ol-quick" style="padding:12px 32px;font-size:1em">Quick Match</button>
        <button class="btn" id="ol-back" style="padding:12px 32px;font-size:.9em;background:#555">Back</button>
      `;
      ov.querySelector('#ol-create').onclick = () => {
        showWaiting('Creating...');
        const code = createRoom(gameId, ctx => { ov.remove(); onStart(ctx); });
        showWaiting('Room: ' + code + '\\nWaiting for opponent...');
      };
      ov.querySelector('#ol-join').onclick = showJoin;
      ov.querySelector('#ol-quick').onclick = () => {
        showWaiting('Searching...');
        autoMatch(gameId, ctx => { ov.remove(); onStart(ctx); }, code => {
          showWaiting('Room: ' + code + '\\nWaiting for opponent...');
        });
      };
      ov.querySelector('#ol-back').onclick = () => { ov.remove(); onCancel(); };
    }

    function showWaiting(msg) {
      ov.innerHTML = `
        <div style="font-size:1.2em;font-weight:bold;text-align:center;white-space:pre-line">${msg}</div>
        <div style="font-size:.85em;color:#888">Share the room code with your friend</div>
        <button class="btn" id="ol-cancel" style="padding:10px 24px">Cancel</button>
      `;
      ov.querySelector('#ol-cancel').onclick = () => { ov.remove(); onCancel(); };
    }

    function showJoin() {
      ov.innerHTML = `
        <div style="font-size:1.1em;font-weight:bold">Enter Room Code</div>
        <input id="ol-code" type="text" maxlength="4" placeholder="ABCD" style="font-size:1.5em;text-align:center;width:140px;padding:10px;border-radius:8px;border:2px solid #555;background:#1a1a2e;color:#fff;text-transform:uppercase;letter-spacing:6px" autocomplete="off" autocapitalize="characters">
        <div id="ol-error" style="color:#F44336;font-size:.85em;min-height:1.2em"></div>
        <button class="btn" id="ol-go" style="padding:10px 28px;font-size:1em">Join</button>
        <button class="btn" id="ol-back2" style="padding:8px 20px;font-size:.85em;background:#555">Back</button>
      `;
      const inp = ov.querySelector('#ol-code');
      const errEl = ov.querySelector('#ol-error');
      setTimeout(() => inp.focus(), 100);
      ov.querySelector('#ol-go').onclick = () => {
        const code = inp.value;
        if (code.length < 4) { errEl.textContent = 'Enter 4-char code'; return; }
        errEl.textContent = 'Joining...';
        joinRoom(code, gameId, ctx => { ov.remove(); onStart(ctx); }, err => { errEl.textContent = err; });
      };
      ov.querySelector('#ol-back2').onclick = showMain;
    }

    showMain();
    area.appendChild(ov);
    return ov;
  }

  return { createRoom, joinRoom, autoMatch, showLobby, mulberry32 };
})();

// --- Game Instructions ---
const RULES = {
  tennis: 'Pong-style tennis. Slide your finger on your half of the screen to move your paddle. Bounce the ball past your opponent to score. Collect power-ups when the ball hits them: BIG = bigger paddle, TINY = shrink opponent, MAGNET = ball curves toward you, GHOST = invisible ball, QUAKE = jittery paddles. First to 5 wins.',
  four: 'Classic Connect 4. Tap a column to drop your disc. Get 4 in a row (horizontal, vertical, or diagonal) to win. Red goes first.',
  pool: '8-ball pool. Drag from the cue ball to aim and set power, then release to shoot. Sink all your balls (stripes or solids, assigned on first pot) then the 8-ball to win. Potting the cue ball is a foul — opponent gets ball-in-hand.',
  memory: 'Flip 2 cards per turn. If they match, you keep them and go again. If not, they flip back and it\'s the opponent\'s turn. The player with the most pairs wins.',
  wordclash: 'Word puzzle duel. Both players share a crossword grid built from one set of scrambled letters. Take turns swiping letters on the wheel to form words. Grid words fill in your color and score = word length. Bonus words (valid but not on grid) score 1 point. 30 seconds per turn. Game ends when the grid is complete — highest score wins.',
  hockey: 'Air hockey. Drag your mallet (bottom = P1, top = P2) to hit the puck into the opponent\'s goal. First to 7 wins.',
  tanks: 'Artillery duel. On your turn, drag to adjust angle and power, then tap FIRE. Wind affects the shot. Damage depends on how close the shell lands. Destroy the opponent\'s tank to win.',
  ships: 'Battleship. Place your ships on the grid, then take turns tapping squares to fire at the opponent\'s fleet. Hit all segments of every ship to win. Ships: Carrier (5), Battleship (4), Cruiser (3), Submarine (3), Destroyer (2).',
  golf: 'Mini golf for 2. Take turns putting — drag from the ball to aim and set power, release to putt. Fewer strokes wins each hole. Play through all holes.',
  starclash: 'Galaga-style co-op/competitive shooter. P1 (bottom, red) and P2 (top, blue) both fight aliens in the middle. Slide your finger in your zone to move and auto-fire. Earn points by destroying aliens. If you get hit 3 times, you\'re out. Survive waves and outscore your opponent!',
  caro: 'Gomoku variant on a 13x13 board. Place stones on intersections. Get exactly 5 in a row (horizontal, vertical, or diagonal) to win. Black goes first.',
  awale: 'West African seed-sowing game. Tap a pit on your side to sow seeds counter-clockwise. If your last seed lands in an opponent\'s pit making it 2 or 3 seeds, you capture them (plus any consecutive 2s or 3s behind). First to capture 25+ seeds wins.',
  master: 'Code-breaking game. P1 sets a secret 4-color code. P2 has 10 guesses to crack it. After each guess, feedback shows: black dot = right color in right position, white dot = right color in wrong position. Duplicates allowed.',
  hangman: 'Wheel of Fortune / Hangman. Spin the wheel to get a point value, then guess a letter. If it\'s in the puzzle, you earn points per occurrence. Buy a vowel for 250 points. Solve the puzzle to bank your points. Wrong guesses or Bankrupt lose your turn.',
  dotsboxes: 'Dots & Boxes on a 6x6 grid. Tap between two dots to draw a line. Complete the 4th side of a box to claim it (marked with your color) and take another turn. When all boxes are filled, the player with the most wins.',
  horse: 'Horse racing / jumping. Each player taps their side of the screen to make their horse jump over obstacles. Time your jumps to clear hurdles. The horse that gets furthest or survives longest wins.',
};

// --- Framework ---
const GAMES = [
  {id:'tennis',name:'Tennis',icon:'🎾',color:'#388E3C',init:initTennis},
  {id:'four',name:'4 in a Row',icon:'🔴',color:'#D32F2F',init:initFourInARow,online:true},
  {id:'pool',name:'Pool',icon:'🎱',color:'#1B5E20',init:initPool},
  {id:'memory',name:'Memory',icon:'🃏',color:'#7B1FA2',init:initMemory,online:true},
  {id:'wordclash',name:'Word Clash',icon:'📝',color:'#00897B',init:initWordClash,online:true},
  {id:'hockey',name:'Air Hockey',icon:'🏒',color:'#0097A7',init:initAirHockey},
  {id:'tanks',name:'Tank Wars',icon:'💣',color:'#F57F17',init:initTankWars,online:true},
  {id:'ships',name:'Ship Battle',icon:'🚢',color:'#1565C0',init:initShipBattle,online:true},
  {id:'golf',name:'Mini Golf',icon:'⛳',color:'#00796B',init:initMiniGolf},
  {id:'starclash',name:'Star Clash',icon:'👾',color:'#C62828',init:initStarClash},
  {id:'caro',name:'Caro',icon:'⚫',color:'#37474F',init:initCaro,online:true},
  {id:'awale',name:'Awalé',icon:'🥜',color:'#4E342E',init:initAwale,online:true},
  {id:'master',name:'Bulls & Cows',icon:'🔮',color:'#AD1457',init:initMastermind,online:true},
  {id:'hangman',name:'Wheel of Funktune',icon:'🎡',color:'#4A148C',init:initHangman},
  {id:'dotsboxes',name:'Dots & Boxes',icon:'🔲',color:'#455A64',init:initDotsAndBoxes,online:true},
  {id:'horse',name:'Horse Jump',icon:'🏇',color:'#8D6E63',init:initHorseJump},
];

let currentDestroy = null;

function buildMenu() {
  const menu = document.getElementById('menu');
  GAMES.forEach(g => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.background = `linear-gradient(135deg,${g.color},${darkenColor(g.color,.18)})`;
    card.innerHTML = `<span class="icon">${g.icon}</span><span class="name">${g.name}</span>${g.online?'<span class="online-dot"></span>':''}`;
    card.onclick = () => startGame(g);
    menu.appendChild(card);
  });
}
function makeMusicBtn(parent) {
  const btn = document.createElement('button');
  btn.id = 'music-btn';
  btn.style.cssText = 'background:none;border:none;font-size:1.4em;cursor:pointer;padding:4px 8px;filter:none';
  btn.textContent = SND._musicOn ? '\u{1F50A}' : '\u{1F507}';
  btn.onclick = (e) => { e.stopPropagation(); const on = SND.musicToggle(); btn.textContent = on ? '\u{1F50A}' : '\u{1F507}'; document.querySelectorAll('#music-btn').forEach(b => b.textContent = on ? '\u{1F50A}' : '\u{1F507}'); };
  parent.appendChild(btn);
  return btn;
}

function startGame(g) {
  document.getElementById('menu').style.display = 'none';
  const gameEl = document.getElementById('game');
  gameEl.style.display = 'flex';
  document.getElementById('game-title').textContent = g.name;
  const status = document.getElementById('game-status');
  const area = document.getElementById('game-area');
  area.innerHTML = '';
  status.textContent = '';
  // Add info + music buttons to game header
  const hdr = document.getElementById('game-header');
  // Remove old info btn if present, then add new one for this game
  const oldInfo = hdr.querySelector('#info-btn');
  if (oldInfo) oldInfo.remove();
  const infoBtn = document.createElement('button');
  infoBtn.id = 'info-btn';
  infoBtn.style.cssText = 'background:none;border:1.5px solid rgba(255,255,255,0.3);color:#fff;font-size:.9em;cursor:pointer;padding:2px 8px;border-radius:50%;min-width:28px;min-height:28px;display:flex;align-items:center;justify-content:center;font-weight:bold';
  infoBtn.textContent = '?';
  infoBtn.onclick = (e) => {
    e.stopPropagation();
    const existing = area.querySelector('.rules-overlay');
    if (existing) { existing.remove(); return; }
    const ro = document.createElement('div');
    ro.className = 'overlay rules-overlay';
    ro.innerHTML = `<button style="position:absolute;top:12px;right:16px;background:none;border:none;color:#fff;font-size:2em;cursor:pointer;line-height:1;opacity:0.85" id="rules-x">&times;</button>` +
      `<div style="font-size:1.2em;font-weight:bold;margin-bottom:12px">${g.icon} ${g.name}</div>` +
      `<div style="max-width:340px;text-align:center;font-size:.9em;line-height:1.5;color:#ccc;padding:0 16px">${RULES[g.id] || 'No instructions available.'}</div>` +
      `<button class="btn" style="margin-top:16px">Got it</button>`;
    ro.querySelector('#rules-x').onclick = () => ro.remove();
    ro.querySelector('.btn').onclick = () => ro.remove();
    area.appendChild(ro);
  };
  hdr.insertBefore(infoBtn, hdr.querySelector('#music-btn') || null);
  if (!hdr.querySelector('#music-btn')) makeMusicBtn(hdr);
  SND.musicStart();
  if (g.online && ONLINE) {
    // Show Local vs Online choice
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div style="font-size:1.3em;font-weight:bold;margin-bottom:8px">Play Mode</div>' +
      '<button class="btn" id="pm-local" style="padding:14px 36px;font-size:1.1em">Local</button>' +
      '<button class="btn" id="pm-online" style="padding:14px 36px;font-size:1.1em;background:#1565C0">Online</button>';
    function setStatusFn(s) {
      let h = s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
      h = h.replace(/(P[12])'s turn/g, '<span class="turn-active" style="color:#FFD54F">$1\'s turn</span>');
      h = h.replace(/Your [Tt]urn/g, '<span class="turn-active" style="color:#69F0AE">Your turn</span>');
      h = h.replace(/(Opponent's [Tt]urn|Waiting)/g, '<span class="turn-idle">$1</span>');
      h = h.replace(/(Black's Turn)/g, '<span class="turn-active" style="color:#ccc">$1</span>');
      h = h.replace(/(White's Turn)/g, '<span class="turn-active" style="color:#fff">$1</span>');
      status.innerHTML = h;
    }
    ov.querySelector('#pm-local').onclick = () => { ov.remove(); currentDestroy = g.init(area, setStatusFn); };
    ov.querySelector('#pm-online').onclick = () => {
      ov.remove();
      ONLINE.showLobby(area, g.id, online => {
        currentDestroy = g.init(area, setStatusFn, online);
      }, () => endGame());
    };
    area.appendChild(ov);
  } else {
    function setStatusFn(s) {
      let h = s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
      h = h.replace(/(P[12])'s turn/g, '<span class="turn-active" style="color:#FFD54F">$1\'s turn</span>');
      h = h.replace(/Your [Tt]urn/g, '<span class="turn-active" style="color:#69F0AE">Your turn</span>');
      h = h.replace(/(Opponent's [Tt]urn|Waiting)/g, '<span class="turn-idle">$1</span>');
      h = h.replace(/(Black's Turn)/g, '<span class="turn-active" style="color:#ccc">$1</span>');
      h = h.replace(/(White's Turn)/g, '<span class="turn-active" style="color:#fff">$1</span>');
      status.innerHTML = h;
    }
    currentDestroy = g.init(area, setStatusFn);
  }
}

function endGame() {
  if (currentDestroy) currentDestroy();
  currentDestroy = null;
  SND.musicStop();
  document.getElementById('game-area').innerHTML = '';
  document.getElementById('game').style.display = 'none';
  document.getElementById('menu').style.display = 'grid';
}

document.getElementById('back-btn').onclick = endGame;
buildMenu();
// Set initial music button state
const mmb = document.getElementById('menu-music-btn');
if (mmb) mmb.textContent = SND._musicOn ? '\u{1F50A}' : '\u{1F507}';

// ==================== DOTS AND BOXES ====================
function initDotsAndBoxes(area, setStatus, online) {
  const ROWS = 6, COLS = 6, BROWS = 5, BCOLS = 5;
  const hEdges = Array.from({length:ROWS}, () => Array(BCOLS).fill(0));
  const vEdges = Array.from({length:BROWS}, () => Array(COLS).fill(0));
  const boxes = Array.from({length:BROWS}, () => Array(BCOLS).fill(0));
  let turn = 1, gameOver = false, scores = [0, 0];
  const P1 = '#E53935', P2 = '#42A5F5', P1F = 'rgba(229,57,53,0.25)', P2F = 'rgba(66,165,245,0.25)';
  let hoverEdge = null;

  const {canvas, ctx, w, h} = createCanvas(area);
  const pad = Math.min(w, h) * 0.08;
  const gridW = w - pad * 2, gridH = h - pad * 2;
  const sp = Math.min(gridW / BCOLS, gridH / BROWS);
  const ox = (w - sp * BCOLS) / 2, oy = (h - sp * BROWS) / 2;


  function dotX(c) { return ox + c * sp; }
  function dotY(r) { return oy + r * sp; }
  function pColor(p) { return p === 1 ? P1 : P2; }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    // filled boxes
    for (let r = 0; r < BROWS; r++) for (let c = 0; c < BCOLS; c++) {
      if (boxes[r][c]) {
        ctx.fillStyle = boxes[r][c] === 1 ? P1F : P2F;
        ctx.fillRect(dotX(c), dotY(r), sp, sp);
        // Player initial in box
        ctx.fillStyle = boxes[r][c] === 1 ? 'rgba(229,57,53,0.5)' : 'rgba(66,165,245,0.5)';
        ctx.font = `bold ${Math.round(sp*0.35)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(boxes[r][c] === 1 ? 'R' : 'B', dotX(c) + sp/2, dotY(r) + sp/2);
      }
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // empty edge guides
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < BCOLS; c++) {
      if (!hEdges[r][c]) { ctx.beginPath(); ctx.moveTo(dotX(c), dotY(r)); ctx.lineTo(dotX(c+1), dotY(r)); ctx.stroke(); }
    }
    for (let r = 0; r < BROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!vEdges[r][c]) { ctx.beginPath(); ctx.moveTo(dotX(c), dotY(r)); ctx.lineTo(dotX(c), dotY(r+1)); ctx.stroke(); }
    }
    ctx.setLineDash([]);
    // placed edges
    ctx.lineWidth = Math.max(3, sp * 0.06); ctx.lineCap = 'round';
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < BCOLS; c++) {
      if (hEdges[r][c]) { ctx.strokeStyle = pColor(hEdges[r][c]); ctx.beginPath(); ctx.moveTo(dotX(c), dotY(r)); ctx.lineTo(dotX(c+1), dotY(r)); ctx.stroke(); }
    }
    for (let r = 0; r < BROWS; r++) for (let c = 0; c < COLS; c++) {
      if (vEdges[r][c]) { ctx.strokeStyle = pColor(vEdges[r][c]); ctx.beginPath(); ctx.moveTo(dotX(c), dotY(r)); ctx.lineTo(dotX(c), dotY(r+1)); ctx.stroke(); }
    }
    // hover highlight
    if (hoverEdge && !gameOver) {
      ctx.strokeStyle = pColor(turn); ctx.globalAlpha = 0.45; ctx.lineWidth = Math.max(5, sp * 0.09);
      const e = hoverEdge; ctx.beginPath();
      if (e.type === 'h') { ctx.moveTo(dotX(e.c), dotY(e.r)); ctx.lineTo(dotX(e.c+1), dotY(e.r)); }
      else { ctx.moveTo(dotX(e.c), dotY(e.r)); ctx.lineTo(dotX(e.c), dotY(e.r+1)); }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    // dots
    const dotR = Math.max(3, sp * 0.07);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = '#e0e0e0';
      ctx.beginPath(); ctx.arc(dotX(c), dotY(r), dotR, 0, Math.PI * 2); ctx.fill();
    }
  }

  function statusText() {
    const s = `[${scores[0]} - ${scores[1]}]`;
    if (online) return (turn === online.playerId + 1 ? 'Your turn' : "Opponent's turn") + ' ' + s;
    return `P${turn}'s turn (${turn === 1 ? 'Red' : 'Blue'}) ${s}`;
  }

  function checkBoxes() {
    let completed = 0;
    for (let r = 0; r < BROWS; r++) for (let c = 0; c < BCOLS; c++) {
      if (!boxes[r][c] && hEdges[r][c] && hEdges[r+1][c] && vEdges[r][c] && vEdges[r][c+1]) {
        boxes[r][c] = turn; scores[turn - 1]++; completed++;
      }
    }
    return completed;
  }

  function checkEnd() {
    if (scores[0] + scores[1] === BROWS * BCOLS) {
      gameOver = true; SND.win(); draw();
      let msg;
      if (scores[0] === scores[1]) msg = `Draw! ${scores[0]} - ${scores[1]}`;
      else if (online) msg = (scores[online.playerId] > scores[1 - online.playerId] ? 'You win!' : 'You lose!') + ` ${scores[0]}-${scores[1]}`;
      else msg = `P${scores[0] > scores[1] ? 1 : 2} wins! ${scores[0]}-${scores[1]}`;
      setStatus(msg); setTimeout(() => showOverlay(area, msg, 'Rematch', restart), 600);
      return true;
    }
    return false;
  }

  function execMove(type, r, c) {
    const arr = type === 'h' ? hEdges : vEdges;
    if (arr[r][c]) return;
    arr[r][c] = turn; SND.click();
    const gained = checkBoxes();
    if (gained) SND.score();
    draw();
    if (checkEnd()) return;
    if (!gained) turn = turn === 1 ? 2 : 1;
    setStatus(statusText()); draw();
  }

  function nearestEdge(px, py) {
    let best = null, bestD = sp * 0.4;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < BCOLS; c++) {
      if (hEdges[r][c]) continue;
      const mx = (dotX(c) + dotX(c+1)) / 2, my = dotY(r);
      const d = Math.hypot(px - mx, py - my);
      if (d < bestD) { bestD = d; best = {type:'h', r, c}; }
    }
    for (let r = 0; r < BROWS; r++) for (let c = 0; c < COLS; c++) {
      if (vEdges[r][c]) continue;
      const mx = dotX(c), my = (dotY(r) + dotY(r+1)) / 2;
      const d = Math.hypot(px - mx, py - my);
      if (d < bestD) { bestD = d; best = {type:'v', r, c}; }
    }
    return best;
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] || e.changedTouches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  canvas.addEventListener('mousemove', e => {
    if (gameOver) return;
    const p = getPos(e); hoverEdge = nearestEdge(p.x, p.y); draw();
  });
  canvas.addEventListener('mouseleave', () => { hoverEdge = null; draw(); });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault(); if (gameOver) return;
    const p = getPos(e); hoverEdge = nearestEdge(p.x, p.y); draw();
  }, {passive: false});

  function handleTap(e) {
    e.preventDefault(); if (gameOver) return;
    if (online && turn !== online.playerId + 1) return;
    const p = getPos(e);
    const edge = nearestEdge(p.x, p.y);
    if (!edge) return;
    if (online) online.sendMove({type: edge.type, r: edge.r, c: edge.c});
    execMove(edge.type, edge.r, edge.c);
    hoverEdge = null;
  }
  canvas.addEventListener('click', handleTap);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); handleTap(e); }, {passive: false});

  function restart() {
    for (let r = 0; r < ROWS; r++) hEdges[r].fill(0);
    for (let r = 0; r < BROWS; r++) { vEdges[r].fill(0); boxes[r].fill(0); }
    turn = 1; gameOver = false; scores = [0, 0]; hoverEdge = null;
    setStatus(statusText()); draw();
  }

  if (online) {
    online.listenMoves(data => execMove(data.type, data.r, data.c));
    online.onOpponentDisconnect(() => { if (!gameOver) { gameOver = true; setStatus('Opponent disconnected'); } });
  }
  setStatus(statusText()); draw();
  return () => { if (online) online.cleanup(); };
}

// ==================== 4 IN A ROW ====================
function initFourInARow(area, setStatus, online) {
  const ROWS = 6, COLS = 7;
  const board = Array.from({length:ROWS}, () => Array(COLS).fill(0));
  let turn = 1, gameOver = false;
  const wrap = document.createElement('div');
  wrap.className = 'board-game';
  area.appendChild(wrap);
  const sz = Math.min(area.getBoundingClientRect().width * 0.9, area.getBoundingClientRect().height * 0.75);
  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${COLS},1fr);gap:4px;width:${sz}px;padding:10px;background:#1565C0;border-radius:12px`;
  wrap.appendChild(grid);
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const cell = document.createElement('div');
    cell.style.cssText = 'aspect-ratio:1;border-radius:50%;background:#0a0a1a;cursor:pointer;transition:background .15s';
    cell.onclick = () => {
      if (online && turn !== online.playerId + 1) return;
      execDrop(c);
      if (online) online.sendMove({c});
    };
    grid.appendChild(cell);
    cells.push(cell);
  }
  function restart() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { board[r][c] = 0; cells[r * COLS + c].style.background = '#0a0a1a'; }
    turn = 1; gameOver = false;
    setStatus(online ? (online.playerId === 0 ? "Your turn (Red)" : "Opponent's turn") : "Red's turn");
  }
  setStatus(online ? (online.playerId === 0 ? "Your turn (Red)" : "Opponent's turn") : "Red's turn");
  function execDrop(c) {
    if (gameOver) return;
    let r = ROWS - 1;
    while (r >= 0 && board[r][c]) r--;
    if (r < 0) return;
    board[r][c] = turn; SND.drop();
    cells[r * COLS + c].style.background = turn === 1 ? '#F44336' : '#FFEB3B';
    if (checkWin(r, c)) { SND.win(); const m = online ? (turn === online.playerId + 1 ? 'You win!' : 'You lose!') : `${turn===1?'Red':'Yellow'} wins!`; setStatus(m); gameOver = true; setTimeout(() => showOverlay(area, m, 'Rematch', restart), 600); return; }
    if (board[0].every(v => v)) { setStatus('Draw!'); gameOver = true; setTimeout(() => showOverlay(area, 'Draw!', 'Rematch', restart), 600); return; }
    turn = 3 - turn;
    setStatus(online ? (turn === online.playerId + 1 ? 'Your turn' : "Opponent's turn") : `${turn===1?'Red':'Yellow'}'s turn`);
  }
  function checkWin(r, c) {
    for (const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
      let cnt = 1;
      for (let d=1;d<4;d++){const nr=r+dr*d,nc=c+dc*d;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||board[nr][nc]!==turn)break;cnt++;}
      for (let d=1;d<4;d++){const nr=r-dr*d,nc=c-dc*d;if(nr<0||nr>=ROWS||nc<0||nc>=COLS||board[nr][nc]!==turn)break;cnt++;}
      if (cnt >= 4) return true;
    }
    return false;
  }
  if (online) {
    online.listenMoves(data => execDrop(data.c));
    online.onOpponentDisconnect(() => { if (!gameOver) { gameOver = true; setStatus('Opponent disconnected'); } });
  }
  return () => { if (online) online.cleanup(); };
}

// ==================== MEMORY ====================
function initMemory(area, setStatus, online) {
  const PAIRS = 16, TOTAL = 32;
  const symbols = ['🍎','🍊','🍋','🍇','🍉','🍓','🫐','🥝','🍌','🥭','🍑','🍒','🍍','🥥','🍆','🫑'];
  let cards = [...symbols, ...symbols];
  const rngFn = online ? online.rng : Math.random;
  for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rngFn()*(i+1)); [cards[i],cards[j]]=[cards[j],cards[i]]; }
  let matched = Array(TOTAL).fill(false);
  let first = -1, second = -1, busy = false;
  let turn = 1, scores = [0, 0];
  const wrap = document.createElement('div');
  wrap.className = 'board-game';
  area.appendChild(wrap);
  const areaRect = area.getBoundingClientRect();
  const availW = areaRect.width * 0.96, availH = areaRect.height * 0.88;
  const gap = 6;
  // Pick column count that maximizes card size
  let bestCols = 8, bestSize = 0;
  for (const tryC of [4, 5, 6, 8]) {
    const tryR = Math.ceil(TOTAL / tryC);
    const cw = (availW - gap * (tryC + 1)) / tryC;
    const ch = (availH - gap * (tryR + 1)) / tryR;
    const s = Math.min(cw, ch);
    if (s > bestSize) { bestSize = s; bestCols = tryC; }
  }
  const COLS = bestCols;
  const rows = Math.ceil(TOTAL / COLS);
  const cardSz = Math.floor(bestSize);
  const gridW = COLS * cardSz + (COLS + 1) * gap;
  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${COLS},${cardSz}px);gap:${gap}px;padding:${gap}px;justify-content:center`;
  wrap.appendChild(grid);
  const emojiSz = Math.max(1.2, cardSz / 38);
  const cardEls = [];
  for (let i = 0; i < TOTAL; i++) {
    const el = document.createElement('div');
    el.style.cssText = 'width:' + cardSz + 'px;height:' + cardSz + 'px;background:#2a2a4a;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:' + emojiSz + 'em;cursor:pointer;transition:background .2s;box-shadow:0 2px 6px rgba(0,0,0,0.3)';
    el.onclick = () => {
      if (online && turn !== online.playerId + 1) return;
      execFlip(i);
      if (online) online.sendMove({i});
    };
    grid.appendChild(el);
    cardEls.push(el);
  }
  function restart() {
    cards = [...symbols, ...symbols];
    const rf = online ? online.rng : Math.random;
    for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rf()*(i+1)); [cards[i],cards[j]]=[cards[j],cards[i]]; }
    matched = Array(TOTAL).fill(false); first = -1; second = -1; busy = false; turn = 1; scores = [0, 0];
    for (let i = 0; i < TOTAL; i++) { cardEls[i].textContent = ''; cardEls[i].style.background = '#2a2a4a'; }
    updateStatus();
  }
  updateStatus();
  function updateStatus() {
    if (online) setStatus(`You: ${scores[online.playerId]}  Opp: ${scores[1-online.playerId]} — ${turn === online.playerId+1 ? 'Your turn' : "Opponent's turn"}`);
    else setStatus(`P1: ${scores[0]}  P2: ${scores[1]} — P${turn}'s turn`);
  }
  function execFlip(i) {
    if (busy || matched[i] || (first === i)) return;
    cardEls[i].textContent = cards[i];
    cardEls[i].style.background = '#3a3a6a'; SND.pop();
    if (first === -1) { first = i; return; }
    second = i; busy = true;
    if (cards[first] === cards[second]) {
      matched[first] = matched[second] = true;
      scores[turn - 1]++; SND.chime();
      first = second = -1; busy = false;
      if (matched.every(v => v)) { SND.win(); const m = online ? (scores[online.playerId] > scores[1-online.playerId] ? 'You win!' : scores[online.playerId] < scores[1-online.playerId] ? 'You lose!' : 'Draw!') : (scores[0] > scores[1] ? 'P1 wins!' : scores[1] > scores[0] ? 'P2 wins!' : 'Draw!'); setStatus(m); setTimeout(() => showOverlay(area, `${m}<br>P1: ${scores[0]} | P2: ${scores[1]}`, 'Rematch', restart), 600); return; }
      updateStatus();
    } else {
      SND.buzz();
      setTimeout(() => {
        cardEls[first].textContent = ''; cardEls[first].style.background = '#2a2a4a';
        cardEls[second].textContent = ''; cardEls[second].style.background = '#2a2a4a';
        first = second = -1; busy = false;
        turn = 3 - turn; updateStatus();
      }, 800);
    }
  }
  if (online) {
    online.listenMoves(data => execFlip(data.i));
    online.onOpponentDisconnect(() => setStatus('Opponent disconnected'));
  }
  return () => { if (online) online.cleanup(); };
}

// ==================== AWALÉ ====================
function initAwale(area, setStatus, online) {
  let board = Array(12).fill(4);
  let scores = [0, 0], turn = 0, gameOver = false;
  const wrap = document.createElement('div');
  wrap.className = 'board-game';
  area.appendChild(wrap);
  const cont = document.createElement('div');
  wrap.appendChild(cont);
  function applyOrientation(){
    const r=area.getBoundingClientRect(),aw=r.width,ah=r.height;
    if(ah>aw){
      wrap.style.cssText='display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:8px;position:absolute;width:'+ah+'px;height:'+aw+'px;top:50%;left:50%;margin-top:-'+(aw/2)+'px;margin-left:-'+(ah/2)+'px;transform:rotate(90deg)';
      cont.style.cssText='width:min(85%,700px)';
    } else {
      wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px;width:100%;height:100%;justify-content:center';
      cont.style.cssText='width:min(85%,700px)';
    }
  }
  applyOrientation();window.addEventListener('resize',applyOrientation);
  function renderBeans(count, active) {
    if (count === 0) return '';
    const BEAN_COLORS = ['#8B4513','#A0522D','#6B3410','#7B3F00','#5C3317','#D2691E'];
    let h = '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:3px;padding:3px">';
    for (let b = 0; b < Math.min(count, 12); b++) {
      const col = BEAN_COLORS[b % BEAN_COLORS.length];
      h += `<div style="width:13px;height:16px;border-radius:50%;background:${col};box-shadow:inset -1px -1px 2px rgba(0,0,0,.4),inset 1px 1px 1px rgba(255,255,255,.2)"></div>`;
    }
    if (count > 12) h += `<div style="font-size:.6em;color:#ddd;width:100%;text-align:center">+${count-12}</div>`;
    h += '</div>';
    return h;
  }
  function render() {
    let h = `<div style="text-align:center;margin-bottom:6px;font-weight:bold;font-size:${turn===1?'1.3em':'0.95em'};color:${turn===1?'#fff':'#666'};${turn===1?'text-shadow:0 0 10px rgba(255,255,255,0.6),0 0 20px rgba(255,255,255,0.3)':'opacity:0.5'};transition:all 0.3s">▲ ${online ? (online.playerId===1?'You':'Opp') : 'P2'}: ${scores[1]}</div>`;
    h += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin-bottom:6px">';
    for (let i = 11; i >= 6; i--) {
      const a = turn===1 && board[i]>0 && !gameOver && (!online || online.playerId===1);
      h += `<div data-pit="${i}" style="background:${a?'#6D4C41':'#3E2723'};padding:8px 4px;border-radius:12px;text-align:center;cursor:${a?'pointer':'default'};min-height:70px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative">`;
      h += renderBeans(board[i], a);
      h += `<div style="font-size:.65em;color:#aaa;margin-top:1px">${board[i]}</div></div>`;
    }
    h += '</div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">';
    for (let i = 0; i <= 5; i++) {
      const a = turn===0 && board[i]>0 && !gameOver && (!online || online.playerId===0);
      h += `<div data-pit="${i}" style="background:${a?'#6D4C41':'#3E2723'};padding:8px 4px;border-radius:12px;text-align:center;cursor:${a?'pointer':'default'};min-height:70px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative">`;
      h += renderBeans(board[i], a);
      h += `<div style="font-size:.65em;color:#aaa;margin-top:1px">${board[i]}</div></div>`;
    }
    h += `</div><div style="text-align:center;margin-top:6px;font-weight:bold;font-size:${turn===0?'1.3em':'0.95em'};color:${turn===0?'#fff':'#666'};${turn===0?'text-shadow:0 0 10px rgba(255,255,255,0.6),0 0 20px rgba(255,255,255,0.3)':'opacity:0.5'};transition:all 0.3s">▼ ${online ? (online.playerId===0?'You':'Opp') : 'P1'}: ${scores[0]}</div>`;
    cont.innerHTML = h;
    cont.querySelectorAll('[data-pit]').forEach(el => {
      el.onclick = () => {
        const pit = parseInt(el.dataset.pit);
        if (online && turn !== online.playerId) return;
        execPlay(pit);
        if (online) online.sendMove({pit});
      };
    });
    if (gameOver) {
      const m = online ? (scores[online.playerId]>scores[1-online.playerId]?'You win!':scores[online.playerId]<scores[1-online.playerId]?'You lose!':'Draw!') : (scores[0]>scores[1]?'P1 wins!':scores[1]>scores[0]?'P2 wins!':'Draw!');
      setStatus(m);
      setTimeout(() => showOverlay(area, `${m}<br>P1: ${scores[0]} | P2: ${scores[1]}`, 'Rematch', () => { board = Array(12).fill(4); scores = [0,0]; turn = 0; gameOver = false; render(); }), 600);
    } else {
      setStatus(online ? (turn===online.playerId?'Your turn':"Opponent's turn") : `P${turn+1}'s turn`);
    }
  }
  function execPlay(pit) {
    if (gameOver) return;
    if (turn===0 && (pit<0||pit>5)) return;
    if (turn===1 && (pit<6||pit>11)) return;
    if (board[pit]===0) return;
    let seeds = board[pit]; board[pit] = 0; SND.click();
    let pos = pit;
    while (seeds > 0) { pos = (pos+1)%12; if (pos===pit) continue; board[pos]++; seeds--; }
    // Capture
    const oppS = turn===0?6:0, oppE = turn===0?11:5;
    if (pos >= oppS && pos <= oppE) {
      let p = pos;
      while (p >= oppS && p <= oppE && (board[p]===2||board[p]===3)) {
        scores[turn] += board[p]; board[p] = 0; SND.chime();
        p += (turn===0) ? -1 : 1;
      }
    }
    if (scores[0]>=25||scores[1]>=25) gameOver = true;
    // Check if next player can play
    const ns = turn===0?6:0, ne = turn===0?11:5;
    let hasSeeds = false;
    for (let i=ns;i<=ne;i++) if(board[i]>0) hasSeeds=true;
    if (!hasSeeds) { for(let i=0;i<12;i++){scores[turn]+=board[i];board[i]=0;} gameOver=true; }
    turn = 1 - turn;
    render();
  }
  if (online) {
    online.listenMoves(data => execPlay(data.pit));
    online.onOpponentDisconnect(() => { if (!gameOver) { gameOver = true; setStatus('Opponent disconnected'); } });
  }
  render();
  return () => { window.removeEventListener('resize',applyOrientation); if (online) online.cleanup(); };
}

// ==================== BULLS & COWS ====================
function initMastermind(area, setStatus, online) {
  const COLORS = ['#E53935','#1E88E5','#43A047','#FDD835','#8E24AA','#FF8F00'];
  const COLOR_NAMES = ['Red','Blue','Green','Yellow','Purple','Orange'];
  const PEGS = 4, MAX_GUESS = 10;
  let secret = [], guesses = [], feedback = [];
  let currentGuess = [], phase = 'set', turn = 0;
  function mmRestart() { secret = []; guesses = []; feedback = []; currentGuess = []; phase = 'set'; turn = 0; render(); }
  const wrap = document.createElement('div');
  wrap.className = 'board-game';
  wrap.style.overflow = 'auto';
  area.appendChild(wrap);
  const cont = document.createElement('div');
  cont.style.cssText = 'width:min(95vw,400px)';
  wrap.appendChild(cont);
  // Online: P0 sets code, P1 guesses
  if (online && online.playerId === 1) {
    // P1 waits for secret from P0
    phase = 'wait';
    online.onState('secret', s => {
      secret = s; phase = 'guess'; render();
    });
  }
  function render() {
    let h = '';
    // Title bar
    const titleCol = phase === 'set' ? '#FF8F00' : '#1E88E5';
    if (phase === 'wait') {
      h += `<div style="text-align:center;font-size:1.2em;font-weight:bold;color:#888;padding:40px 0">Waiting for opponent to set code...</div>`;
    } else if (phase === 'set') {
      const canEdit = !online || online.playerId === 0;
      h += `<div style="background:linear-gradient(135deg,#1a1a2e,#2a1a3e);border-radius:12px;padding:12px;margin-bottom:10px">`;
      h += `<div style="text-align:center;font-size:1.1em;font-weight:bold;color:${titleCol};margin-bottom:8px">${online ? 'Set the secret code' : '🔮 P1: Set the secret code'}</div>`;
      h += `<div style="text-align:center;font-size:.75em;color:#888;margin-bottom:8px">Choose ${PEGS} colors — ${online ? 'opponent' : 'P2'} will try to crack it</div>`;
      h += renderPegs(currentGuess, canEdit);
      if (canEdit) h += renderPalette();
      if (canEdit && currentGuess.length === PEGS) h += `<div style="text-align:center;margin-top:10px"><button class="btn" id="mm-confirm" style="background:#FF8F00;font-size:1em;padding:10px 28px">✓ Confirm Code</button></div>`;
      h += `</div>`;
    } else if (phase === 'waitguess') {
      // P0 waiting for P1 guesses
      h += `<div style="text-align:center;font-size:1.1em;font-weight:bold;color:#888;margin-bottom:8px">Waiting for opponent to guess...</div>`;
      if (guesses.length > 0) {
        h += `<div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:6px 8px;margin-bottom:8px">`;
        for (let i = 0; i < guesses.length; i++) {
          h += `<div style="display:flex;align-items:center;gap:8px;padding:5px 4px">`;
          h += `<span style="color:#555;font-size:.7em;width:18px;text-align:right">${i+1}.</span>`;
          h += renderPegsInline(guesses[i]);
          h += renderFeedbackInline(feedback[i]);
          h += `</div>`;
        }
        h += `</div>`;
      }
    } else if (phase === 'guess') {
      const canGuess = !online || online.playerId === 1;
      h += `<div style="text-align:center;font-size:1em;font-weight:bold;color:#64B5F6;margin-bottom:6px">${canGuess ? 'Crack' : 'P2: Crack'} the code! (${MAX_GUESS - guesses.length} guesses left)</div>`;
      // Legend
      h += `<div style="display:flex;justify-content:center;gap:14px;margin-bottom:8px;font-size:.7em;color:#999">`;
      h += `<span>⬛ = right color & place</span>`;
      h += `<span>⬜ = right color, wrong place</span>`;
      h += `</div>`;
      // Previous guesses
      if (guesses.length > 0) {
        h += `<div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:6px 8px;margin-bottom:8px">`;
        for (let i = 0; i < guesses.length; i++) {
          const isLast = i === guesses.length - 1;
          h += `<div style="display:flex;align-items:center;gap:8px;padding:5px 4px;${isLast ? 'background:rgba(255,255,255,0.04);border-radius:8px' : ''}">`;
          h += `<span style="color:#555;font-size:.7em;width:18px;text-align:right">${i+1}.</span>`;
          h += renderPegsInline(guesses[i]);
          h += renderFeedbackInline(feedback[i]);
          h += `</div>`;
        }
        h += `</div>`;
      }
      // Current guess input (only for guesser)
      if (canGuess) {
        h += `<div style="background:linear-gradient(135deg,#1a1a2e,#2a1a3e);border-radius:12px;padding:10px;margin-top:4px">`;
        h += `<div style="text-align:center;font-size:.8em;color:#888;margin-bottom:6px">Your guess:</div>`;
        h += renderPegs(currentGuess, true);
        h += renderPalette();
        if (currentGuess.length === PEGS) h += `<div style="text-align:center;margin-top:10px"><button class="btn" id="mm-submit" style="background:#1E88E5;font-size:1em;padding:10px 28px">Submit Guess</button></div>`;
        h += `</div>`;
      }
    } else {
      // Game over — show all guesses and reveal secret
      h += `<div style="text-align:center;font-size:1em;font-weight:bold;color:#FFD54F;margin-bottom:8px">Game Over!</div>`;
      h += `<div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:6px 8px;margin-bottom:8px">`;
      for (let i = 0; i < guesses.length; i++) {
        h += `<div style="display:flex;align-items:center;gap:8px;padding:4px">`;
        h += `<span style="color:#555;font-size:.7em;width:18px;text-align:right">${i+1}.</span>`;
        h += renderPegsInline(guesses[i]);
        h += renderFeedbackInline(feedback[i]);
        h += `</div>`;
      }
      h += `</div>`;
      h += `<div style="text-align:center;margin-top:6px;font-size:.9em;color:#aaa">Secret code:</div>`;
      h += renderPegs(secret, false);
    }
    cont.innerHTML = h;
    cont.querySelectorAll('[data-color]').forEach(el => {
      el.onclick = () => { if (currentGuess.length < PEGS) { currentGuess.push(parseInt(el.dataset.color)); render(); } };
    });
    cont.querySelectorAll('[data-undo]').forEach(el => {
      el.onclick = () => { currentGuess.pop(); render(); };
    });
    const confirmBtn = cont.querySelector('#mm-confirm');
    if (confirmBtn) confirmBtn.onclick = () => {
      secret = [...currentGuess]; currentGuess = [];
      if (online) {
        online.setState('secret', secret);
        phase = 'waitguess';
        render();
      } else {
        phase = 'guess';
        showOverlay(area, 'Pass device to P2', 'Ready', () => render());
      }
    };
    const submitBtn = cont.querySelector('#mm-submit');
    if (submitBtn) submitBtn.onclick = () => {
      const fb = calcFeedback(currentGuess, secret); SND.click();
      guesses.push([...currentGuess]); feedback.push(fb);
      if (online) online.sendMove({guess: currentGuess});
      if (fb.exact === PEGS) { phase = 'done'; SND.win(); const m = online ? (online.playerId === 1 ? 'You cracked the code!' : 'Opponent cracked your code!') : 'P2 cracked the code!'; setStatus(m); currentGuess = []; render(); setTimeout(() => showOverlay(area, m, 'Rematch', mmRestart), 600); return; }
      else if (guesses.length >= MAX_GUESS) { phase = 'done'; SND.buzz(); const m = online ? (online.playerId === 0 ? 'You win! Code unbroken.' : 'You lose! Code unbroken.') : 'P1 wins! Code unbroken.'; setStatus(m); currentGuess = []; render(); setTimeout(() => showOverlay(area, m, 'Rematch', mmRestart), 600); return; }
      currentGuess = []; render();
    };
    if (phase === 'set') setStatus(online ? 'Set your secret code' : 'P1: Set code');
    else if (phase === 'guess') setStatus(online ? (online.playerId === 1 ? `Guess (${MAX_GUESS - guesses.length} left)` : 'Opponent is guessing...') : `P2: Guess (${MAX_GUESS - guesses.length} left)`);
    else if (phase === 'wait') setStatus('Waiting for code...');
    else if (phase === 'waitguess') setStatus('Waiting for guesses...');
  }
  // Online: P0 receives guesses from P1
  if (online && online.playerId === 0) {
    online.listenMoves(data => {
      const guess = data.guess;
      const fb = calcFeedback(guess, secret);
      guesses.push(guess); feedback.push(fb);
      if (fb.exact === PEGS) { phase = 'done'; SND.win(); setStatus('Opponent cracked your code!'); render(); setTimeout(() => showOverlay(area, 'Opponent cracked your code!', 'Rematch', mmRestart), 600); return; }
      else if (guesses.length >= MAX_GUESS) { phase = 'done'; SND.buzz(); setStatus('You win! Code unbroken.'); render(); setTimeout(() => showOverlay(area, 'You win! Code unbroken.', 'Rematch', mmRestart), 600); return; }
      render();
    });
  }
  if (online) {
    online.onOpponentDisconnect(() => { if (phase !== 'done') { phase = 'done'; setStatus('Opponent disconnected'); render(); } });
  }
  function renderPegs(pegs, editable) {
    let h = '<div style="display:flex;justify-content:center;gap:8px;margin:6px 0">';
    for (let i = 0; i < PEGS; i++) {
      const filled = i < pegs.length;
      h += `<div style="width:42px;height:42px;border-radius:50%;background:${filled ? COLORS[pegs[i]] : '#222'};border:2px solid ${filled ? 'rgba(255,255,255,0.2)' : '#444'};box-shadow:${filled ? 'inset 0 -3px 6px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)' : 'none'}"></div>`;
    }
    if (editable && pegs.length > 0) h += `<div data-undo="1" style="width:42px;height:42px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:1.1em;border:2px solid #555">↩</div>`;
    h += '</div>';
    return h;
  }
  function renderPegsInline(pegs) {
    let h = '<div style="display:flex;gap:4px">';
    pegs.forEach(p => h += `<div style="width:30px;height:30px;border-radius:50%;background:${COLORS[p]};box-shadow:inset 0 -2px 4px rgba(0,0,0,0.3)"></div>`);
    return h + '</div>';
  }
  function renderFeedbackInline(fb) {
    let h = '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-left:10px;width:44px">';
    for (let i = 0; i < fb.exact; i++) h += `<div style="width:16px;height:16px;border-radius:50%;background:#111;border:2px solid #555" title="Correct color & position"></div>`;
    for (let i = 0; i < fb.color; i++) h += `<div style="width:16px;height:16px;border-radius:50%;background:#eee;border:2px solid #aaa" title="Correct color, wrong position"></div>`;
    for (let i = 0; i < PEGS - fb.exact - fb.color; i++) h += `<div style="width:16px;height:16px;border-radius:50%;background:#2a2a2a;border:1px solid #333"></div>`;
    // Text hint
    const hints = [];
    if (fb.exact > 0) hints.push(`${fb.exact}✓`);
    if (fb.color > 0) hints.push(`${fb.color}~`);
    if (hints.length > 0) h += `<div style="font-size:.6em;color:#aaa;width:100%;text-align:center;margin-top:1px">${hints.join(' ')}</div>`;
    return h + '</div>';
  }
  function renderPalette() {
    let h = '<div style="display:flex;justify-content:center;gap:10px;margin-top:10px">';
    COLORS.forEach((c, i) => h += `<div data-color="${i}" style="width:40px;height:40px;border-radius:50%;background:${c};cursor:pointer;border:3px solid rgba(255,255,255,0.15);box-shadow:0 2px 6px rgba(0,0,0,0.4);transition:transform .1s" onpointerdown="this.style.transform='scale(0.9)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'"></div>`);
    return h + '</div>';
  }
  function calcFeedback(guess, secret) {
    let exact = 0, color = 0;
    const sg = [...secret], gg = [...guess];
    for (let i = 0; i < PEGS; i++) if (sg[i] === gg[i]) { exact++; sg[i] = gg[i] = -1; }
    for (let i = 0; i < PEGS; i++) {
      if (gg[i] === -1) continue;
      const j = sg.indexOf(gg[i]);
      if (j !== -1) { color++; sg[j] = -1; }
    }
    return { exact, color };
  }
  render();
  return () => { if (online) online.cleanup(); };
}

// ==================== STAR CLASH (Galaga-style 2P) ====================
function initStarClash(area, setStatus) {
  const {canvas, ctx, w, h} = createCanvas(area);
  const PW = 40, PH = 28, BULLET_SPD = 7, ALIEN_BULLET_SPD = 3.5;
  const SHIELD_ROWS = 3, SHIELD_COLS = 8, SHIELD_BLOCK = 6;
  const MID = h / 2;
  const CTRL_H = 50; // control zone height
  const P1_SHIP_Y = h - CTRL_H - 30; // P1 ship center (above control zone)
  const P2_SHIP_Y = CTRL_H + 30;     // P2 ship center (below control zone)

  function sfxShoot() { SND.shoot(); }
  function sfxHit() { SND.boom(); }
  function sfxAlienDie() { SND.alienDie(); }

  // Players: P1 at bottom, P2 at top (inverted)
  let p1 = {x: w/2, hp: 3, score: 0, cooldown: 0, alive: true, powerTimer: 0};
  let p2 = {x: w/2, hp: 3, score: 0, cooldown: 0, alive: true, powerTimer: 0};
  let bullets = []; // {x, y, dy, owner: 0|1|2(alien), color}
  let explosions = []; // {x, y, timer}
  let stars = Array.from({length:60}, () => ({x:Math.random()*w, y:Math.random()*h, s:Math.random()*1.5+0.3}));

  // Shields: 2 sets, one near P1 (bottom), one near P2 (top)
  // Each shield is a grid of blocks that can be destroyed
  const SHIELD_Y_P1 = P1_SHIP_Y - 55; // P1's shield, protects P1 from above
  const SHIELD_Y_P2 = P2_SHIP_Y + 35; // P2's shield, protects P2 from below
  const SHIELD_GAP = Math.floor(w / 4);
  let shields = []; // {x, y, owner: 0|1, alive: true}
  function initShields() {
    shields = [];
    for (let owner = 0; owner < 2; owner++) {
      const baseY = owner === 0 ? SHIELD_Y_P1 : SHIELD_Y_P2;
      for (let g = 0; g < 3; g++) { // 3 shield groups per player
        const gx = SHIELD_GAP * (g + 0.5) + SHIELD_GAP * 0.25;
        for (let r = 0; r < SHIELD_ROWS; r++) for (let c = 0; c < SHIELD_COLS; c++) {
          shields.push({x: gx + c * SHIELD_BLOCK, y: baseY + r * SHIELD_BLOCK, owner, alive: true});
        }
      }
    }
  }
  initShields();

  // Aliens: formation in the middle band
  let aliens = [], alienDir = 1, alienSpeed = 0.4, alienDropTimer = 0;
  let alienShootTimer = 0, wave = 1, diveTimer = 0;
  const ALIEN_TYPES = [
    {color:'#E53935',points:30,w:18,h:14}, // top row
    {color:'#FDD835',points:20,w:20,h:14}, // mid row
    {color:'#43A047',points:10,w:20,h:14}, // bottom row
  ];
  function spawnWave() {
    aliens = [];
    const cols = Math.min(8, 5 + wave), rows = Math.min(4, 2 + Math.floor(wave/2));
    const spacing = Math.min(36, w / (cols + 1));
    const startX = (w - (cols - 1) * spacing) / 2;
    const startY = MID - (rows * 22) / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const type = ALIEN_TYPES[Math.min(r, 2)];
      aliens.push({
        x: startX + c * spacing, y: startY + r * 22,
        type, alive: true, frame: 0
      });
    }
    alienDir = 1; alienSpeed = 0.4 + wave * 0.1;
    // Mark up to 4 random aliens as special (power-up carriers)
    const pool = aliens.map((_,i)=>i);
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    for(let i=0;i<Math.min(4,aliens.length);i++) aliens[pool[i]].special=true;
    // Mark up to 4 random aliens as divers (Galaga-style)
    const divePool = aliens.map((_,i)=>i);
    for(let i=divePool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[divePool[i],divePool[j]]=[divePool[j],divePool[i]];}
    for(let i=0;i<Math.min(4,aliens.length);i++) aliens[divePool[i]].canDive=true;
    diveTimer = 0;
  }
  spawnWave();

  // Touch controls
  const touches = {};
  canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) { const r=canvas.getBoundingClientRect(); touches[t.identifier]={x:(t.clientX-r.left)/r.width*w,y:(t.clientY-r.top)/r.height*h}; }});
  canvas.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) { const r=canvas.getBoundingClientRect(); touches[t.identifier]={x:(t.clientX-r.left)/r.width*w,y:(t.clientY-r.top)/r.height*h}; }});
  canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) delete touches[t.identifier]; });
  canvas.addEventListener('mousemove', e => { const r=canvas.getBoundingClientRect(); touches['m']={x:(e.clientX-r.left)/r.width*w,y:(e.clientY-r.top)/r.height*h}; });
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height * h;
    if (y > MID && p1.alive && p1.cooldown <= 0) { shoot(0); }
    else if (y < MID && p2.alive && p2.cooldown <= 0) { shoot(1); }
  });
  // Auto-fire on touch hold
  let autoFireP1 = false, autoFireP2 = false;

  function shoot(player) {
    const p = player === 0 ? p1 : p2;
    if (p.cooldown > 0 || !p.alive) return;
    const bx = p.x;
    const by = player === 0 ? P1_SHIP_Y - 16 : P2_SHIP_Y + 16;
    const dy = player === 0 ? -BULLET_SPD : BULLET_SPD;
    if (p.powerTimer > 0) {
      bullets.push({x:bx,y:by,dy,owner:player,color:'#FFD700',powered:true});
      bullets.push({x:bx-8,y:by,dy,owner:player,color:'#FFD700',powered:true});
      bullets.push({x:bx+8,y:by,dy,owner:player,color:'#FFD700',powered:true});
      p.cooldown = 6;
    } else {
      const col = player === 0 ? '#FF6B6B' : '#64B5F6';
      bullets.push({x: bx, y: by, dy, owner: player, color: col});
      p.cooldown = 12;
    }
    sfxShoot();
  }

  function alienShoot(alien) {
    // Aliens always fire in BOTH directions simultaneously — fair for both players
    if (p1.alive) bullets.push({x: alien.x, y: alien.y, dy: ALIEN_BULLET_SPD, owner: 2, color: '#FF9800'});
    if (p2.alive) bullets.push({x: alien.x, y: alien.y, dy: -ALIEN_BULLET_SPD, owner: 2, color: '#FF9800'});
  }

  let gameOver = false, raf;

  function update() {
    // Move players toward touch
    autoFireP1 = false; autoFireP2 = false;
    for (const id in touches) {
      const {x, y} = touches[id];
      if (y > MID) { p1.x += (x - p1.x) * 0.15; autoFireP1 = true; }
      else { p2.x += (x - p2.x) * 0.15; autoFireP2 = true; }
    }
    p1.x = Math.max(PW/2, Math.min(w - PW/2, p1.x));
    p2.x = Math.max(PW/2, Math.min(w - PW/2, p2.x));
    if (p1.cooldown > 0) p1.cooldown--;
    if (p2.cooldown > 0) p2.cooldown--;
    if (p1.powerTimer > 0) p1.powerTimer--;
    if (p2.powerTimer > 0) p2.powerTimer--;

    // Auto-fire
    if (autoFireP1 && p1.cooldown <= 0 && p1.alive) shoot(0);
    if (autoFireP2 && p2.cooldown <= 0 && p2.alive) shoot(1);

    // Move bullets
    for (const b of bullets) b.y += b.dy;
    bullets = bullets.filter(b => b.y > -10 && b.y < h + 10);

    // Bullet vs alien collision
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      if (b.owner === 2) continue; // alien bullets don't hit aliens
      for (const a of aliens) {
        if (!a.alive) continue;
        if (Math.abs(b.x - a.x) < a.type.w/2 + 3 && Math.abs(b.y - a.y) < a.type.h/2 + 3) {
          a.alive = false;
          bullets.splice(bi, 1);
          explosions.push({x: a.x, y: a.y, timer: 12});
          if (b.owner === 0) { p1.score += a.type.points; if(a.special) p1.powerTimer=300; }
          else { p2.score += a.type.points; if(a.special) p2.powerTimer=300; }
          sfxAlienDie();
          break;
        }
      }
    }

    // Bullet vs player collision
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      // Alien bullets or opponent bullets can hit players
      if (b.owner !== 0 && p1.alive && b.dy > 0 && Math.abs(b.x - p1.x) < PW/2 + 3 && Math.abs(b.y - P1_SHIP_Y) < PH/2 + 3) {
        p1.hp--; bullets.splice(bi, 1); explosions.push({x: p1.x, y: P1_SHIP_Y, timer: 10}); sfxHit();
        if (p1.hp <= 0) p1.alive = false;
        continue;
      }
      if (b.owner !== 1 && p2.alive && b.dy < 0 && Math.abs(b.x - p2.x) < PW/2 + 3 && Math.abs(b.y - P2_SHIP_Y) < PH/2 + 3) {
        p2.hp--; bullets.splice(bi, 1); explosions.push({x: p2.x, y: P2_SHIP_Y, timer: 10}); sfxHit();
        if (p2.hp <= 0) p2.alive = false;
        continue;
      }
    }

    // Bullet vs shield collision
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      let hit = false;
      for (const s of shields) {
        if (!s.alive) continue;
        if (b.x >= s.x && b.x < s.x + SHIELD_BLOCK && b.y >= s.y && b.y < s.y + SHIELD_BLOCK) {
          s.alive = false; hit = true; break;
        }
      }
      if (hit) { bullets.splice(bi, 1); continue; }
    }

    // Move aliens (skip diving ones)
    let edgeHit = false;
    for (const a of aliens) {
      if (!a.alive) continue;
      if (a.diving) {
        a.homeX += alienDir * alienSpeed; // track formation drift
        a.frame += 0.04;
        continue;
      }
      a.x += alienDir * alienSpeed;
      a.frame += 0.02;
      if (a.x < 15 || a.x > w - 15) edgeHit = true;
    }
    if (edgeHit) {
      alienDir = -alienDir;
    }

    // Trigger Galaga-style dives
    diveTimer++;
    if (diveTimer >= 90) {
      diveTimer = 0;
      const ready = aliens.filter(a => a.alive && a.canDive && !a.diving);
      if (ready.length > 0 && (p1.alive || p2.alive)) {
        const diver = ready[Math.floor(Math.random() * ready.length)];
        diver.diving = true;
        diver.homeX = diver.x;
        diver.homeY = diver.y;
        diver.diveTarget = (p1.alive && p2.alive) ? Math.floor(Math.random() * 2) : (p1.alive ? 0 : 1);
        diver.divePhase = 0;
        diver.diveShootCd = 25;
      }
    }

    // Diving alien movement
    for (const a of aliens) {
      if (!a.alive || !a.diving) continue;
      if (a.divePhase === 0) {
        // Swoop toward target player
        const targetX = a.diveTarget === 0 ? p1.x : p2.x;
        const targetY = a.diveTarget === 0 ? P1_SHIP_Y : P2_SHIP_Y;
        const dirY = targetY > a.y ? 1 : -1;
        a.y += dirY * 2.8;
        a.x += (targetX - a.x) * 0.035;
        // Fire while diving
        a.diveShootCd--;
        if (a.diveShootCd <= 0) {
          a.diveShootCd = 35;
          alienShoot(a);
        }
        if (Math.abs(a.y - targetY) < 35) a.divePhase = 1;
      } else {
        // Return to formation
        const dx = a.homeX - a.x, dy = a.homeY - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 4) {
          a.x += (dx / dist) * 2.8;
          a.y += (dy / dist) * 2.8;
        } else {
          a.x = a.homeX; a.y = a.homeY;
          a.diving = false;
        }
      }
    }

    // Alien shooting
    alienShootTimer++;
    const shootInterval = Math.max(20, 60 - wave * 5);
    if (alienShootTimer >= shootInterval) {
      alienShootTimer = 0;
      const liveAliens = aliens.filter(a => a.alive && !a.diving);
      if (liveAliens.length > 0) {
        const shooter = liveAliens[Math.floor(Math.random() * liveAliens.length)];
        alienShoot(shooter);
      }
    }

    // Check if all aliens dead → next wave
    if (aliens.every(a => !a.alive)) {
      wave++;
      spawnWave();
      // Rebuild shields
      initShields();
    }

    // Explosions
    explosions = explosions.filter(e => { e.timer--; return e.timer > 0; });

    // Stars scroll
    for (const s of stars) { s.y += s.s * 0.5; if (s.y > h) { s.y = 0; s.x = Math.random() * w; } }

    // Game over: ends immediately when either player dies
    if ((!p1.alive || !p2.alive) && !gameOver) {
      gameOver = true;
      let msg;
      if (!p1.alive && !p2.alive) msg = p1.score > p2.score ? 'P1 wins!' : p2.score > p1.score ? 'P2 wins!' : 'Draw!';
      else if (!p1.alive) msg = 'P2 wins!';
      else msg = 'P1 wins!';
      setStatus(`${msg} P1:${p1.score} P2:${p2.score}`);
      setTimeout(() => showOverlay(area, `${msg}<br>P1: ${p1.score} | P2: ${p2.score}`, 'Rematch', () => {
        p1 = {x:w/2,hp:3,score:0,cooldown:0,alive:true,powerTimer:0};
        p2 = {x:w/2,hp:3,score:0,cooldown:0,alive:true,powerTimer:0};
        bullets = []; explosions = []; wave = 1;
        spawnWave(); initShields(); gameOver = false;
        raf = requestAnimationFrame(loop);
      }), 1000);
    }

    if (!gameOver) setStatus(`P1:${p1.score} ❤${p1.hp}${p1.powerTimer>0?' ⚡':''} | Wave ${wave} | ${p2.powerTimer>0?'⚡ ':''}❤${p2.hp} P2:${p2.score}`);
  }

  function draw() {
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, w, h);

    // Stars
    for (const s of stars) {
      ctx.fillStyle = `rgba(255,255,255,${0.3+s.s*0.3})`;
      ctx.fillRect(s.x, s.y, s.s > 1 ? 2 : 1, s.s > 1 ? 2 : 1);
    }

    // Midline
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    ctx.setLineDash([6,6]); ctx.beginPath(); ctx.moveTo(0,MID); ctx.lineTo(w,MID); ctx.stroke(); ctx.setLineDash([]);

    // Shields
    for (const s of shields) {
      if (!s.alive) continue;
      ctx.fillStyle = s.owner === 0 ? '#2E7D32' : '#1565C0';
      ctx.fillRect(s.x, s.y, SHIELD_BLOCK - 1, SHIELD_BLOCK - 1);
    }

    // Aliens
    for (const a of aliens) {
      if (!a.alive) continue;
      const t = a.type, wobble = Math.sin(a.frame * 4) * 2;
      // Diving alien trail
      if(a.diving){const tp=0.4+Math.sin(a.frame*6)*0.2;ctx.fillStyle=`rgba(255,60,60,${tp})`;ctx.beginPath();ctx.arc(a.x,a.y,12,0,Math.PI*2);ctx.fill();const dirY=a.divePhase===0?(a.diveTarget===0?-1:1):(a.homeY>a.y?-1:1);for(let t=1;t<=3;t++){ctx.fillStyle=`rgba(255,100,50,${0.2-t*0.05})`;ctx.beginPath();ctx.arc(a.x,a.y+dirY*t*7,4-t,0,Math.PI*2);ctx.fill();}}
      if(a.special){const gp=0.3+Math.sin(a.frame*8)*0.2;ctx.fillStyle=`rgba(255,215,0,${gp})`;ctx.beginPath();ctx.arc(a.x,a.y,14,0,Math.PI*2);ctx.fill();ctx.fillStyle='#FFD700';}
      else ctx.fillStyle = t.color;
      // Body
      ctx.beginPath();
      ctx.moveTo(a.x - t.w/2, a.y + t.h/2);
      ctx.lineTo(a.x - t.w/2 - 3, a.y + t.h/2 + 4 + wobble);
      ctx.lineTo(a.x - t.w/4, a.y + t.h/2);
      ctx.lineTo(a.x - t.w/4, a.y - t.h/2 + 3);
      ctx.quadraticCurveTo(a.x, a.y - t.h/2 - 3, a.x + t.w/4, a.y - t.h/2 + 3);
      ctx.lineTo(a.x + t.w/4, a.y + t.h/2);
      ctx.lineTo(a.x + t.w/2 + 3, a.y + t.h/2 + 4 + wobble);
      ctx.lineTo(a.x + t.w/2, a.y + t.h/2);
      ctx.closePath();
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(a.x - 4, a.y - 2, 3, 3);
      ctx.fillRect(a.x + 1, a.y - 2, 3, 3);
      ctx.fillStyle = '#111';
      ctx.fillRect(a.x - 3, a.y - 1, 2, 2);
      ctx.fillRect(a.x + 2, a.y - 1, 2, 2);
    }

    // Power-up ship glow
    if(p1.alive&&p1.powerTimer>0){const gp=0.25+Math.sin(Date.now()*0.008)*0.15;ctx.fillStyle=`rgba(255,215,0,${gp})`;ctx.beginPath();ctx.arc(p1.x,P1_SHIP_Y,26,0,Math.PI*2);ctx.fill();}
    if(p2.alive&&p2.powerTimer>0){const gp=0.25+Math.sin(Date.now()*0.008)*0.15;ctx.fillStyle=`rgba(255,215,0,${gp})`;ctx.beginPath();ctx.arc(p2.x,P2_SHIP_Y,26,0,Math.PI*2);ctx.fill();}

    // Players
    if (p1.alive) {
      const py = P1_SHIP_Y;
      // Engine glow (always visible, brighter when firing)
      const eA1 = autoFireP1 ? 0.7+Math.random()*0.3 : 0.2;
      const eL1 = autoFireP1 ? 18+Math.random()*6 : 8;
      ctx.fillStyle = `rgba(255,180,50,${eA1})`;
      ctx.beginPath(); ctx.moveTo(p1.x-7,py+12); ctx.lineTo(p1.x,py+12+eL1); ctx.lineTo(p1.x+7,py+12); ctx.fill();
      if(autoFireP1){ctx.fillStyle=`rgba(255,255,200,${0.3+Math.random()*0.3})`;ctx.beginPath();ctx.moveTo(p1.x-3,py+12);ctx.lineTo(p1.x,py+12+eL1*0.6);ctx.lineTo(p1.x+3,py+12);ctx.fill();}
      // Hull shadow
      ctx.fillStyle = '#8B1A1A';
      ctx.beginPath();
      ctx.moveTo(p1.x,py-16); ctx.lineTo(p1.x-PW/2,py+10); ctx.lineTo(p1.x-PW/4,py+6);
      ctx.lineTo(p1.x-3,py+13); ctx.lineTo(p1.x+3,py+13);
      ctx.lineTo(p1.x+PW/4,py+6); ctx.lineTo(p1.x+PW/2,py+10);
      ctx.closePath(); ctx.fill();
      // Hull main
      ctx.fillStyle = '#FF4444';
      ctx.beginPath();
      ctx.moveTo(p1.x,py-14); ctx.lineTo(p1.x-PW/2+2,py+8); ctx.lineTo(p1.x-PW/4,py+5);
      ctx.lineTo(p1.x-3,py+11); ctx.lineTo(p1.x+3,py+11);
      ctx.lineTo(p1.x+PW/4,py+5); ctx.lineTo(p1.x+PW/2-2,py+8);
      ctx.closePath(); ctx.fill();
      // Wing accents
      ctx.strokeStyle='#FF6666';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(p1.x-5,py-1);ctx.lineTo(p1.x-PW/2+4,py+7);ctx.stroke();
      ctx.beginPath();ctx.moveTo(p1.x+5,py-1);ctx.lineTo(p1.x+PW/2-4,py+7);ctx.stroke();
      // Cockpit
      ctx.fillStyle = '#FF8A80';
      ctx.beginPath(); ctx.arc(p1.x,py-4,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(p1.x-1.5,py-5.5,1.8,0,Math.PI*2); ctx.fill();
    }

    if (p2.alive) {
      const py = P2_SHIP_Y;
      // Engine glow (always visible, brighter when firing)
      const eA2 = autoFireP2 ? 0.7+Math.random()*0.3 : 0.2;
      const eL2 = autoFireP2 ? 18+Math.random()*6 : 8;
      ctx.fillStyle = `rgba(255,180,50,${eA2})`;
      ctx.beginPath(); ctx.moveTo(p2.x-7,py-12); ctx.lineTo(p2.x,py-12-eL2); ctx.lineTo(p2.x+7,py-12); ctx.fill();
      if(autoFireP2){ctx.fillStyle=`rgba(255,255,200,${0.3+Math.random()*0.3})`;ctx.beginPath();ctx.moveTo(p2.x-3,py-12);ctx.lineTo(p2.x,py-12-eL2*0.6);ctx.lineTo(p2.x+3,py-12);ctx.fill();}
      // Hull shadow
      ctx.fillStyle = '#1A3D8B';
      ctx.beginPath();
      ctx.moveTo(p2.x,py+16); ctx.lineTo(p2.x-PW/2,py-10); ctx.lineTo(p2.x-PW/4,py-6);
      ctx.lineTo(p2.x-3,py-13); ctx.lineTo(p2.x+3,py-13);
      ctx.lineTo(p2.x+PW/4,py-6); ctx.lineTo(p2.x+PW/2,py-10);
      ctx.closePath(); ctx.fill();
      // Hull main
      ctx.fillStyle = '#4488FF';
      ctx.beginPath();
      ctx.moveTo(p2.x,py+14); ctx.lineTo(p2.x-PW/2+2,py-8); ctx.lineTo(p2.x-PW/4,py-5);
      ctx.lineTo(p2.x-3,py-11); ctx.lineTo(p2.x+3,py-11);
      ctx.lineTo(p2.x+PW/4,py-5); ctx.lineTo(p2.x+PW/2-2,py-8);
      ctx.closePath(); ctx.fill();
      // Wing accents
      ctx.strokeStyle='#6699FF';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(p2.x-5,py+1);ctx.lineTo(p2.x-PW/2+4,py-7);ctx.stroke();
      ctx.beginPath();ctx.moveTo(p2.x+5,py+1);ctx.lineTo(p2.x+PW/2-4,py-7);ctx.stroke();
      // Cockpit
      ctx.fillStyle = '#82B1FF';
      ctx.beginPath(); ctx.arc(p2.x,py+4,5,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(p2.x-1.5,py+5.5,1.8,0,Math.PI*2); ctx.fill();
    }

    // Bullets
    for (const b of bullets) {
      ctx.fillStyle = b.color;
      if (b.owner === 2) {
        ctx.fillRect(b.x - 1.5, b.y - 4, 3, 8);
      } else if (b.powered) {
        ctx.fillRect(b.x - 3, b.y - 6, 6, 12);
        ctx.fillStyle = 'rgba(255,215,0,0.3)';
        ctx.fillRect(b.x - 5, b.y - 7, 10, 14);
      } else {
        ctx.fillRect(b.x - 1.5, b.y - 5, 3, 10);
      }
    }

    // Explosions
    for (const e of explosions) {
      const pct = e.timer / 12;
      const r = (1 - pct) * 18 + 4;
      ctx.fillStyle = `rgba(255,${Math.floor(150*pct)},0,${pct})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI*2); ctx.fill();
      // Sparks
      for (let i = 0; i < 4; i++) {
        const a = (i/4) * Math.PI * 2 + e.timer * 0.5;
        ctx.fillStyle = `rgba(255,255,100,${pct*0.7})`;
        ctx.fillRect(e.x + Math.cos(a)*r*1.2, e.y + Math.sin(a)*r*1.2, 2, 2);
      }
    }

    // Control zone strips
    ctx.fillStyle = 'rgba(255,68,68,0.20)';
    ctx.fillRect(0, h - CTRL_H, w, CTRL_H);
    ctx.fillStyle = 'rgba(68,136,255,0.20)';
    ctx.fillRect(0, 0, w, CTRL_H);
    // Control zone labels
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('P1 — slide here', w/2, h - CTRL_H/2 + 3);
    ctx.fillText('P2 — slide here', w/2, CTRL_H/2 + 3);
    // Control zone borders
    ctx.strokeStyle = 'rgba(255,68,68,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, h - CTRL_H); ctx.lineTo(w, h - CTRL_H); ctx.stroke();
    ctx.strokeStyle = 'rgba(68,136,255,0.35)';
    ctx.beginPath(); ctx.moveTo(0, CTRL_H); ctx.lineTo(w, CTRL_H); ctx.stroke();

    // HP indicators
    ctx.font = 'bold 11px sans-serif';
    // P1 HP (above control zone)
    ctx.fillStyle = '#FF6B6B'; ctx.textAlign = 'left';
    for (let i = 0; i < p1.hp; i++) ctx.fillText('❤', 6 + i * 16, h - CTRL_H - 6);
    // P2 HP (below control zone)
    ctx.fillStyle = '#64B5F6';
    for (let i = 0; i < p2.hp; i++) ctx.fillText('❤', 6 + i * 16, CTRL_H + 14);
    // Wave
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.textAlign = 'center'; ctx.font = '10px sans-serif';
    ctx.fillText(`Wave ${wave}`, w/2, MID + 4);
    ctx.textAlign = 'left';
  }

  function loop() {
    if (gameOver) { draw(); return; }
    update();
    draw();
    raf = requestAnimationFrame(loop);
  }

  setStatus(`P1:0 ❤3 | Wave 1 | ❤3 P2:0`);
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}

// ==================== TENNIS (Pong) ====================
function initTennis(area, setStatus) {
  const {canvas, ctx, w, h} = createCanvas(area);
  const BASE_PW = w * 0.16, PH = h * 0.018, BR = Math.min(w,h) * 0.018;
  let p1y = h - 75, p2y = 75, p1x = w/2, p2x = w/2;
  let bx = w/2, by = h/2, bvx = 0, bvy = 0;
  let s1 = 0, s2 = 0, serving = true;
  let frameCount = 0, lastHitter = 0; // 1=P1, 2=P2

  // Power-up system
  const POWER_TYPES = [
    { name:'BIG',    label:'BIG',    color:'#4CAF50', desc:'+Paddle' },
    { name:'SHRINK', label:'TINY',   color:'#F44336', desc:'-Enemy' },
    { name:'TURBO',  label:'⚡',     color:'#FFC107', desc:'Speed!' },
    { name:'SLOW',   label:'~~',     color:'#2196F3', desc:'Slow Mo' },
    { name:'GHOST',  label:'?',      color:'#9C27B0', desc:'Ghost' },
    { name:'MAGNET', label:'U',      color:'#00BCD4', desc:'Magnet' },
    { name:'QUAKE',  label:'~',      color:'#FF9800', desc:'Quake!' },
  ];
  let powerup = null; // {x, y, type, age}
  let spawnTimer = 240;
  // Effect timers (frames remaining)
  let fx = { p1big:0, p2big:0, p1shrink:0, p2shrink:0, slow:0, ghost:0, magnetP1:0, magnetP2:0, quake:0 };
  let flashMsg = '', flashTimer = 0;
  // Extra balls for multi-ball-like chaos from quake
  let particles = []; // visual sparks on powerup collect

  function resetBall(dir) {
    bx = w/2; by = h/2;
    const angle = (Math.random() * 0.6 + 0.2) * (Math.random()<0.5?1:-1);
    const speed = Math.min(w, h) * 0.009;
    bvx = Math.sin(angle) * speed;
    bvy = Math.cos(angle) * speed * dir;
    serving = false; lastHitter = 0;
  }
  resetBall(1);

  function p1w() { let pw=BASE_PW; if(fx.p1big>0)pw*=1.6; if(fx.p1shrink>0)pw*=0.5; return pw; }
  function p2w() { let pw=BASE_PW; if(fx.p2big>0)pw*=1.6; if(fx.p2shrink>0)pw*=0.5; return pw; }

  function spawnPowerup() {
    const type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
    const margin = 40;
    powerup = {
      x: margin + Math.random() * (w - margin * 2),
      y: h * 0.25 + Math.random() * h * 0.5,
      type, age: 0,
    };
  }

  function collectPowerup(collector) { // collector: 1=P1, 2=P2
    if (!powerup) return;
    const t = powerup.type;
    // Spark particles
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      particles.push({ x: powerup.x, y: powerup.y, vx: Math.cos(a)*3, vy: Math.sin(a)*3, life: 20, color: t.color });
    }
    flashMsg = t.desc + (collector === 1 ? ' → P1' : ' → P2');
    flashTimer = 60;

    if (t.name === 'BIG') {
      if (collector === 1) fx.p1big = 240; else fx.p2big = 240; // 4s
    } else if (t.name === 'SHRINK') {
      if (collector === 1) fx.p2shrink = 360; else fx.p1shrink = 360; // shrink opponent
    } else if (t.name === 'TURBO') {
      const boost = 1.6;
      bvx *= boost; bvy *= boost;
    } else if (t.name === 'SLOW') {
      fx.slow = 300; // 5s
    } else if (t.name === 'GHOST') {
      fx.ghost = 240; // 4s
    } else if (t.name === 'MAGNET') {
      if (collector === 1) fx.magnetP1 = 300; else fx.magnetP2 = 300; // 5s
    } else if (t.name === 'QUAKE') {
      fx.quake = 240; // 4s
    }
    SND.chime();
    powerup = null;
    spawnTimer = 300 + Math.floor(Math.random() * 180); // 5-8s until next
  }

  const touches = {};
  function onTouch(id, x, y) { touches[id] = {x, y}; }
  function offTouch(id) { delete touches[id]; }
  canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches) { const r=canvas.getBoundingClientRect(); onTouch(t.identifier,(t.clientX-r.left)/r.width*w,(t.clientY-r.top)/r.height*h); }});
  canvas.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) { const r=canvas.getBoundingClientRect(); onTouch(t.identifier,(t.clientX-r.left)/r.width*w,(t.clientY-r.top)/r.height*h); }});
  canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) offTouch(t.identifier); });
  canvas.addEventListener('mousemove', e => { const r=canvas.getBoundingClientRect(); onTouch('m',(e.clientX-r.left)/r.width*w,(e.clientY-r.top)/r.height*h); });

  let raf;
  function update() {
    frameCount++;
    const PW1 = p1w(), PW2 = p2w();

    // Move paddles toward touch
    for (const id in touches) {
      const {x, y} = touches[id];
      if (y > h/2) { p1x += (x - p1x) * 0.25; }
      else { p2x += (x - p2x) * 0.25; }
    }
    // Quake jitter
    let p1xDraw = p1x, p2xDraw = p2x;
    if (fx.quake > 0) {
      p1xDraw += (Math.random() - 0.5) * 12;
      p2xDraw += (Math.random() - 0.5) * 12;
    }
    p1x = Math.max(PW1/2, Math.min(w - PW1/2, p1x));
    p2x = Math.max(PW2/2, Math.min(w - PW2/2, p2x));

    // Ball speed modifier
    let spdMod = 1;
    if (fx.slow > 0) spdMod = 0.55;

    // Magnet: curve ball toward collector's paddle
    if (fx.magnetP1 > 0 && bvy > 0) {
      bvx += (p1x - bx) * 0.003;
    }
    if (fx.magnetP2 > 0 && bvy < 0) {
      bvx += (p2x - bx) * 0.003;
    }

    // Ball movement
    bx += bvx * spdMod; by += bvy * spdMod;
    if (bx < BR || bx > w - BR) bvx = -bvx;
    bx = Math.max(BR, Math.min(w - BR, bx));

    // Paddle collision P1 (bottom)
    if (by + BR > p1y - PH/2 && by + BR < p1y + PH/2 && bvy > 0 && Math.abs(bx - p1x) < PW1/2 + BR) {
      bvy = -Math.abs(bvy) * 1.08; bvx += (bx - p1x) / PW1 * 4; SND.pong(); lastHitter = 1;
    }
    // Paddle collision P2 (top)
    if (by - BR < p2y + PH/2 && by - BR > p2y - PH/2 && bvy < 0 && Math.abs(bx - p2x) < PW2/2 + BR) {
      bvy = Math.abs(bvy) * 1.08; bvx += (bx - p2x) / PW2 * 4; SND.pong(); lastHitter = 2;
    }

    // Power-up collision (ball touches powerup)
    if (powerup && lastHitter > 0) {
      const dx = bx - powerup.x, dy = by - powerup.y;
      if (Math.sqrt(dx*dx + dy*dy) < BR + 42) {
        collectPowerup(lastHitter);
      }
    }

    // Power-up spawning
    if (!powerup) {
      spawnTimer--;
      if (spawnTimer <= 0) spawnPowerup();
    } else {
      powerup.age++;
      if (powerup.age > 600) powerup = null; // despawn after 10s
    }

    // Tick down all effects
    for (const k in fx) if (fx[k] > 0) fx[k]--;
    if (flashTimer > 0) flashTimer--;

    // Particles
    particles = particles.filter(p => { p.x += p.vx; p.y += p.vy; p.life--; return p.life > 0; });

    // Score
    if (by < 0) { s1++; SND.score(); resetBall(-1); }
    if (by > h) { s2++; SND.score(); resetBall(1); }
    if (s1 >= 5 || s2 >= 5) { SND.win(); const m = s1>=5?'P1 wins!':'P2 wins!'; setStatus(m); draw(); setTimeout(() => showOverlay(area, `${m}<br>P1: ${s1} | P2: ${s2}`, 'Rematch', () => { s1 = 0; s2 = 0; serving = true; resetBall(1); frameCount = 0; powerup = null; for (const k in fx) fx[k] = 0; raf = requestAnimationFrame(update); }), 600); return; }
    setStatus(`P2: ${s2}  |  P1: ${s1}`);
    draw();
    raf = requestAnimationFrame(update);
  }

  function draw() {
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, w, h);

    // Slide-here control zones
    const CTRL_H = 60;
    ctx.fillStyle = 'rgba(239,83,80,0.18)';
    ctx.fillRect(0, h - CTRL_H, w, CTRL_H);
    ctx.fillStyle = 'rgba(66,165,245,0.18)';
    ctx.fillRect(0, 0, w, CTRL_H);
    ctx.strokeStyle = 'rgba(239,83,80,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, h - CTRL_H); ctx.lineTo(w, h - CTRL_H); ctx.stroke();
    ctx.strokeStyle = 'rgba(66,165,245,0.35)';
    ctx.beginPath(); ctx.moveTo(0, CTRL_H); ctx.lineTo(w, CTRL_H); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('slide here', w/2, h - CTRL_H/2 + 5);
    ctx.fillText('slide here', w/2, CTRL_H/2 + 5);

    // Center line
    ctx.setLineDash([8, 8]); ctx.strokeStyle = '#334';
    ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke(); ctx.setLineDash([]);

    // Active effect indicators along edges
    let indicators = [];
    if (fx.p1big > 0) indicators.push({text:'P1 BIG', color:'#4CAF50', side:'bottom'});
    if (fx.p2big > 0) indicators.push({text:'P2 BIG', color:'#4CAF50', side:'top'});
    if (fx.p1shrink > 0) indicators.push({text:'P1 tiny', color:'#F44336', side:'bottom'});
    if (fx.p2shrink > 0) indicators.push({text:'P2 tiny', color:'#F44336', side:'top'});
    if (fx.slow > 0) indicators.push({text:'SLOW', color:'#2196F3', side:'mid'});
    if (fx.ghost > 0) indicators.push({text:'GHOST', color:'#9C27B0', side:'mid'});
    if (fx.magnetP1 > 0) indicators.push({text:'P1 MAGNET', color:'#00BCD4', side:'bottom'});
    if (fx.magnetP2 > 0) indicators.push({text:'P2 MAGNET', color:'#00BCD4', side:'top'});
    if (fx.quake > 0) indicators.push({text:'QUAKE!', color:'#FF9800', side:'mid'});

    ctx.font = '9px sans-serif'; ctx.textAlign = 'left';
    let topOff = 0, botOff = 0, midOff = 0;
    for (const ind of indicators) {
      ctx.fillStyle = ind.color + '88';
      let iy;
      if (ind.side === 'top') { iy = 14 + topOff * 13; topOff++; }
      else if (ind.side === 'bottom') { iy = h - 8 - botOff * 13; botOff++; }
      else { iy = h/2 - 18 - midOff * 13; midOff++; }
      ctx.fillText(ind.text, w - 65, iy);
    }

    // Power-up
    if (powerup) {
      const pu = powerup;
      const pulse = Math.sin(pu.age * 0.08) * 8;
      // Glow
      ctx.fillStyle = pu.type.color + '33';
      ctx.beginPath(); ctx.arc(pu.x, pu.y, 54 + pulse, 0, Math.PI*2); ctx.fill();
      // Body
      ctx.fillStyle = pu.type.color;
      ctx.beginPath(); ctx.arc(pu.x, pu.y, 36, 0, Math.PI*2); ctx.fill();
      // Label
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pu.type.label, pu.x, pu.y);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      // Despawn warning
      if (pu.age > 480 && frameCount % 10 < 5) {
        ctx.strokeStyle = pu.type.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(pu.x, pu.y, 48, 0, Math.PI*2); ctx.stroke();
      }
    }

    // Particles
    for (const p of particles) {
      ctx.globalAlpha = p.life / 20;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    // Flash message
    if (flashTimer > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, flashTimer / 30)})`;
      ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(flashMsg, w/2, h/2 + 5);
      ctx.textAlign = 'left';
    }

    // Paddles (with quake jitter applied to draw only)
    const drawP1x = fx.quake > 0 ? p1x + (Math.random()-0.5)*12 : p1x;
    const drawP2x = fx.quake > 0 ? p2x + (Math.random()-0.5)*12 : p2x;
    const PW1 = p1w(), PW2 = p2w();

    // P2 paddle (top) - with size transition glow
    ctx.fillStyle = '#42A5F5';
    if (fx.p2big > 0) ctx.fillStyle = '#66BB6A';
    if (fx.p2shrink > 0) ctx.fillStyle = '#EF5350';
    ctx.beginPath(); ctx.roundRect(drawP2x - PW2/2, p2y - PH/2, PW2, PH, 4); ctx.fill();

    // P1 paddle (bottom)
    ctx.fillStyle = '#EF5350';
    if (fx.p1big > 0) ctx.fillStyle = '#66BB6A';
    if (fx.p1shrink > 0) ctx.fillStyle = '#EF9A9A';
    ctx.beginPath(); ctx.roundRect(drawP1x - PW1/2, p1y - PH/2, PW1, PH, 4); ctx.fill();

    // Ball
    if (fx.ghost > 0) {
      ctx.globalAlpha = 0.12 + Math.sin(frameCount * 0.15) * 0.08;
    }
    ctx.fillStyle = '#fff';
    if (fx.magnetP1 > 0 || fx.magnetP2 > 0) ctx.fillStyle = '#00E5FF';
    ctx.beginPath(); ctx.arc(bx, by, BR, 0, Math.PI*2); ctx.fill();
    // Ball trail when fast
    const spd = Math.sqrt(bvx*bvx + bvy*bvy);
    if (spd > 5) {
      ctx.globalAlpha = (fx.ghost > 0 ? 0.05 : 0.15);
      ctx.beginPath(); ctx.arc(bx - bvx*0.5, by - bvy*0.5, BR*0.8, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(bx - bvx, by - bvy, BR*0.6, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.font = '9px sans-serif';
  }
  raf = requestAnimationFrame(update);
  return () => cancelAnimationFrame(raf);
}

// ==================== AIR HOCKEY ====================
function initAirHockey(area, setStatus) {
  const {canvas, ctx, w, h} = createCanvas(area);
  const MR = w * 0.08, PR = w * 0.045, GW = w * 0.3;
  let m1 = {x:w/2, y:h*0.82}, m2 = {x:w/2, y:h*0.18};
  let puck = {x:w/2, y:h/2, vx:0, vy:0};
  let s1 = 0, s2 = 0;
  const touches = {};
  canvas.addEventListener('touchstart', e => { e.preventDefault(); for (const t of e.changedTouches){const r=canvas.getBoundingClientRect();touches[t.identifier]={x:(t.clientX-r.left)/r.width*w,y:(t.clientY-r.top)/r.height*h};}});
  canvas.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches){const r=canvas.getBoundingClientRect();touches[t.identifier]={x:(t.clientX-r.left)/r.width*w,y:(t.clientY-r.top)/r.height*h};}});
  canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) delete touches[t.identifier]; });
  let mouseY = h/2;
  canvas.addEventListener('mousemove', e => { const r=canvas.getBoundingClientRect(); touches['m']={x:(e.clientX-r.left)/r.width*w,y:(e.clientY-r.top)/r.height*h}; });
  let raf;
  function resetPuck() { puck = {x:w/2, y:h/2, vx:0, vy:0}; }
  function update() {
    // Move mallets toward touches
    let t1 = null, t2 = null;
    for (const id in touches) {
      if (touches[id].y > h/2) t1 = touches[id]; else t2 = touches[id];
    }
    if (t1) { m1.x += (t1.x - m1.x) * 0.3; m1.y += (t1.y - m1.y) * 0.3; m1.y = Math.max(h/2 + MR, Math.min(h - MR, m1.y)); }
    if (t2) { m2.x += (t2.x - m2.x) * 0.3; m2.y += (t2.y - m2.y) * 0.3; m2.y = Math.max(MR, Math.min(h/2 - MR, m2.y)); }
    m1.x = Math.max(MR, Math.min(w - MR, m1.x));
    m2.x = Math.max(MR, Math.min(w - MR, m2.x));
    // Puck physics
    puck.x += puck.vx; puck.y += puck.vy;
    puck.vx *= 0.995; puck.vy *= 0.995;
    // Wall bounce
    if (puck.x < PR) { puck.x = PR; puck.vx = Math.abs(puck.vx); }
    if (puck.x > w - PR) { puck.x = w - PR; puck.vx = -Math.abs(puck.vx); }
    // Goal check
    const inGoal = puck.x > w/2 - GW/2 && puck.x < w/2 + GW/2;
    if (puck.y < PR) { if (inGoal) { s1++; SND.score(); resetPuck(); } else { puck.y = PR; puck.vy = Math.abs(puck.vy); } }
    if (puck.y > h - PR) { if (inGoal) { s2++; SND.score(); resetPuck(); } else { puck.y = h - PR; puck.vy = -Math.abs(puck.vy); } }
    // Mallet-puck collision
    for (const m of [m1, m2]) {
      const dx = puck.x - m.x, dy = puck.y - m.y, dist = Math.sqrt(dx*dx+dy*dy);
      if (dist < MR + PR) {
        const nx = dx/dist, ny = dy/dist;
        puck.vx = nx * 8; puck.vy = ny * 8; SND.pong();
        puck.x = m.x + nx * (MR + PR + 1);
        puck.y = m.y + ny * (MR + PR + 1);
      }
    }
    if (s1>=7||s2>=7) { const m = s1>=7?'P1 wins!':'P2 wins!'; setStatus(m); draw(); setTimeout(() => showOverlay(area, `${m}<br>P1: ${s1} | P2: ${s2}`, 'Rematch', () => { s1 = 0; s2 = 0; m1 = {x:w/2,y:h*0.82}; m2 = {x:w/2,y:h*0.18}; resetPuck(); raf = requestAnimationFrame(update); }), 600); return; }
    setStatus(`P2: ${s2}  |  P1: ${s1}`);
    draw();
    raf = requestAnimationFrame(update);
  }
  function draw() {
    ctx.fillStyle = '#1a3a5c'; ctx.fillRect(0, 0, w, h);
    // Center line + circle
    ctx.strokeStyle = '#2a5a8c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, h/2); ctx.lineTo(w, h/2); ctx.stroke();
    ctx.beginPath(); ctx.arc(w/2, h/2, w*0.15, 0, Math.PI*2); ctx.stroke();
    // Goals
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(w/2 - GW/2, 0, GW, 6);
    ctx.fillRect(w/2 - GW/2, h - 6, GW, 6);
    // Mallets
    ctx.fillStyle = '#EF5350';
    ctx.beginPath(); ctx.arc(m1.x, m1.y, MR, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#42A5F5';
    ctx.beginPath(); ctx.arc(m2.x, m2.y, MR, 0, Math.PI*2); ctx.fill();
    // Puck
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(puck.x, puck.y, PR, 0, Math.PI*2); ctx.fill();
  }
  raf = requestAnimationFrame(update);
  return () => cancelAnimationFrame(raf);
}

// ==================== WORD CLASH ====================
const WORD_DATA = {
  en: [
    {anchor:'PLASTER',words:['PLASTER','STAPLER','ALERTS','ALTERS','PALEST','PASTEL','PEARLS','PETALS','PLATES','PLEATS','PRATES','REPAST','SALTER','STALER','STAPLE','TAPERS','ALERT','ALTER','APTER','ASTER','EARLS','LAPSE','LASER','LATER','LEAPS','LEAPT','LEAST','PALER','PALES','PARES','PARSE','PARTS','PASTE','PATES','PEALS','PEARL','PEARS','PELTS','PETAL','PLATE','PLEAS','PLEAT','PRATE','RAPES','RATES','REALS','REAPS','SEPAL','SEPTA','SLATE','SLEPT','SPARE','SPATE','SPEAR','SPELT','SPLAT','SPRAT','STALE','STARE','STEAL','STRAP','STREP','TALES','TAPER','TAPES','TARES','TARPS','TASER','TEALS','TEARS','TRAPS','ALES','ALTS','APES','APSE','ARES','ARTS','EARL','EARS','EAST','EATS','ERAS','LAPS','LASE','LAST','LATE','LATS','LEAP','LEAS','LEST','LETS','PALE','PALS','PARE','PARS','PART','PAST','PATE','PATS','PEAL','PEAR','PEAS','PEAT','PELT','PERT','PEST','PETS','PLEA','RAPE','RAPS','RAPT','RASP','RATE','RATS','REAL','REAP','REPS','REST','SALE','SALT','SATE','SEAL','SEAR','SEAT','SERA','SLAP','SLAT','SPAR','SPAT','STAR','STEP','TALE','TAPE','TAPS','TARE','TARP','TARS','TEAL','TEAR','TEAS','TRAP','TSAR','ALE','ALT','APE','APT','ARE','ART','ASP','ATE','EAR','EAT','ERA','EST','ETA','LAP','LAT','LEA','LET','PAL','PAR','PAS','PAT','PEA','PER','PET','RAP','RAT','REP','SAP','SAT','SEA','SET','SPA','TAP','TAR','TEA']},
    {anchor:'PLANETS',words:['PLANETS','PLATENS','PALEST','PANELS','PASTEL','PETALS','PLANES','PLANET','PLANTS','PLATEN','PLATES','PLEATS','STAPLE','ANTES','ASPEN','LANES','LAPSE','LEANS','LEAPS','LEAPT','LEAST','NAPES','PALES','PANEL','PANES','PANTS','PASTE','PATES','PEALS','PELTS','PENAL','PETAL','PLANE','PLANS','PLANT','PLATE','PLEAS','PLEAT','SEPAL','SEPTA','SLANT','SLATE','SLEPT','SPATE','SPELT','SPENT','SPLAT','STALE','STEAL','TALES','TAPES','TEALS','ALES','ALTS','ANTE','ANTS','APES','APSE','EAST','EATS','LANE','LAPS','LASE','LAST','LATE','LATS','LEAN','LEAP','LEAS','LENS','LENT','LEST','LETS','NAPE','NAPS','NEAT','NEST','NETS','PALE','PALS','PANE','PANS','PANT','PAST','PATE','PATS','PEAL','PEAS','PEAT','PELT','PENS','PENT','PEST','PETS','PLAN','PLEA','SALE','SALT','SANE','SATE','SEAL','SEAT','SENT','SLAP','SLAT','SNAP','SPAN','SPAT','STEP','TALE','TANS','TAPE','TAPS','TEAL','TEAS','TENS','ALE','ALT','ANT','APE','APT','ASP','ATE','EAT','EST','ETA','LAP','LAT','LEA','LET','NAP','NET','PAL','PAN','PAS','PAT','PEA','PEN','PET','SAP','SAT','SEA','SET','SPA','TAN','TAP','TEA','TEN']},
    {anchor:'SALTIER',words:['SALTIER','REALIST','RETAILS','ALERTS','ALTERS','LITERS','RETAIL','SALTER','SATIRE','SERIAL','STALER','TRAILS','TRIALS','AISLE','ALERT','ALTER','ARISE','ASTER','ASTIR','EARLS','IRATE','ISLET','LAIRS','LASER','LATER','LEAST','LIARS','LIRAS','LITER','RAILS','RAISE','RATES','REALS','RILES','RITES','SITAR','SLATE','SLIER','STAIR','STALE','STARE','STEAL','STILE','TAILS','TALES','TARES','TASER','TEALS','TEARS','TIERS','TILES','TIRES','TRAIL','TRIAL','TRIES','AILS','AIRS','ALES','ALIT','ALTS','ARES','ARTS','EARL','EARS','EAST','EATS','ERAS','ISLE','LAIR','LASE','LAST','LATE','LATS','LEAS','LEIS','LEST','LETS','LIAR','LIES','LIRA','LIRE','LIST','LITE','RAIL','RATE','RATS','REAL','REIS','REST','RILE','RISE','RITE','SAIL','SALE','SALT','SARI','SATE','SEAL','SEAR','SEAT','SERA','SILT','SIRE','SITE','SLAT','SLIT','STAR','STIR','TAIL','TALE','TARE','TARS','TEAL','TEAR','TEAS','TIER','TIES','TILE','TIRE','TSAR','AIL','AIR','ALE','ALT','ARE','ART','ATE','EAR','EAT','ERA','EST','ETA','IRE','ITS','LAT','LEA','LEI','LET','LIE','LIT','RAT','SAT','SEA','SET','SIR','SIT','TAR','TEA','TIE']},
    {anchor:'DETAILS',words:['DETAILS','DILATES','DELTAS','DETAIL','DILATE','IDEALS','IDLEST','LADIES','LASTED','LISTED','SAILED','SALTED','SILTED','SLATED','STALED','TAILED','TILDES','AIDES','AILED','AISLE','ASIDE','DALES','DATES','DEALS','DEALT','DELIS','DELTA','DIALS','DIETS','EDITS','IDEAL','IDEAS','IDLES','ISLET','LADES','LASED','LEADS','LEAST','SATED','SIDLE','SITED','SLATE','SLIDE','STAID','STALE','STEAD','STEAL','STILE','TAILS','TALES','TEALS','TIDAL','TIDES','TILDE','TILED','TILES','AIDE','AIDS','AILS','ALES','ALIT','ALTS','DAIS','DALE','DATE','DEAL','DELI','DIAL','DIES','DIET','EAST','EATS','EDIT','IDEA','IDES','IDLE','ISLE','LADE','LADS','LAID','LASE','LAST','LATE','LATS','LEAD','LEAS','LEIS','LEST','LETS','LIDS','LIED','LIES','LIST','LITE','SAID','SAIL','SALE','SALT','SATE','SEAL','SEAT','SIDE','SILT','SITE','SLAT','SLED','SLID','SLIT','TADS','TAIL','TALE','TEAL','TEAS','TIDE','TIED','TIES','TILE','ADS','AID','AIL','ALE','ALT','ATE','DIE','DIS','EAT','EST','ETA','IDS','ITS','LAD','LAT','LEA','LED','LEI','LET','LID','LIE','LIT','SAD','SAT','SEA','SET','SIT','TAD','TEA','TIE']},
    {anchor:'BLASTED',words:['BLASTED','BALDEST','STABLED','ABLEST','BASTED','BLADES','BLEATS','DELTAS','LASTED','SALTED','SLATED','STABLE','STALED','TABLED','TABLES','ABETS','BALDS','BALED','BALES','BASED','BASTE','BATED','BATES','BEADS','BEAST','BEATS','BELTS','BETAS','BLADE','BLAST','BLATS','BLEAT','BLEST','DALES','DATES','DEALS','DEALT','DEBTS','DELTA','LADES','LASED','LEADS','LEAST','SABLE','SATED','SLATE','STALE','STEAD','STEAL','TABLE','TALES','TEALS','ABED','ABET','ABLE','ALBS','ALES','ALTS','BADE','BALD','BALE','BASE','BAST','BATE','BATS','BEAD','BEAT','BEDS','BELT','BEST','BETA','BETS','BLAT','BLED','DABS','DALE','DATE','DEAL','DEBS','DEBT','EAST','EATS','LABS','LADE','LADS','LASE','LAST','LATE','LATS','LEAD','LEAS','LEST','LETS','SALE','SALT','SATE','SEAL','SEAT','SLAB','SLAT','SLED','STAB','TABS','TADS','TALE','TEAL','TEAS','ADS','ALB','ALE','ALT','ATE','BAD','BAT','BED','BET','DAB','DEB','EAT','EST','ETA','LAB','LAD','LAT','LEA','LED','LET','SAD','SAT','SEA','SET','TAB','TAD','TEA']},
    {anchor:'THREADS',words:['THREADS','DEARTHS','HARDEST','HATREDS','TRASHED','DEARTH','DEATHS','EARTHS','HASTED','HATERS','HATRED','HEARTS','SHARED','STARED','THREAD','TRADES','TREADS','ASHED','ASTER','DARES','DARTS','DATES','DEARS','DEATH','EARTH','HARED','HARES','HARTS','HASTE','HATED','HATER','HATES','HEADS','HEARD','HEARS','HEART','HEATS','HERDS','RATED','RATES','READS','RHEAS','SATED','SHADE','SHARD','SHARE','SHEAR','SHERD','SHRED','STARE','STEAD','TARED','TARES','TASER','TEARS','TRADE','TRASH','TREAD','ARES','ARTS','DARE','DART','DASH','DATE','DEAR','EARS','EAST','EATS','ERAS','HARD','HARE','HART','HATE','HATS','HEAD','HEAR','HEAT','HERD','HERS','RASH','RATE','RATS','READ','REDS','REST','RHEA','SATE','SEAR','SEAT','SERA','SHAD','SHAT','SHED','STAR','TADS','TARE','TARS','TEAR','TEAS','TSAR','ADS','ARE','ART','ASH','ATE','EAR','EAT','ERA','EST','ETA','HAD','HAS','HAT','HER','RAT','RED','SAD','SAT','SEA','SET','SHE','TAD','TAR','TEA','THE']},
    {anchor:'STRANGE',words:['STRANGE','GARNETS','AGENTS','ANGERS','ASTERN','GARNET','GRANTS','GRATES','GREATS','RANGES','STERNA','AGENT','ANGER','ANGST','ANTES','ASTER','EARNS','GATES','GEARS','GENTS','GNATS','GRANT','GRATE','GREAT','NEARS','RAGES','RANGE','RANTS','RATES','RENTS','SAGER','SANER','SNARE','STAGE','STARE','STERN','TANGS','TARES','TASER','TEARS','TERNS','TRANS','AGES','ANTE','ANTS','ARES','ARTS','EARN','EARS','EAST','EATS','ERAS','ERGS','GATE','GEAR','GENS','GENT','GETS','GNAT','NAGS','NEAR','NEAT','NEST','NETS','RAGE','RAGS','RANG','RANT','RATE','RATS','RENT','REST','SAGE','SANE','SANG','SATE','SEAR','SEAT','SENT','SERA','SNAG','STAG','STAR','TAGS','TANG','TANS','TARE','TARS','TEAR','TEAS','TENS','TERN','TSAR','AGE','ANT','ARE','ART','ATE','EAR','EAT','ERA','ERG','EST','ETA','GAS','GEN','GET','NAG','NEG','NET','RAG','RAN','RAT','SAG','SAT','SEA','SET','TAG','TAN','TAR','TEA','TEN']},
    {anchor:'PAINTER',words:['PAINTER','PERTAIN','REPAINT','ENTRAP','PANIER','PANTIE','PARENT','PATINE','PIRATE','RAPINE','RETAIN','RETINA','APTER','INAPT','INEPT','INERT','INTER','IRATE','NITER','PAINT','PRATE','PRINT','RIPEN','TAPER','TAPIR','TRAIN','TRIPE','ANTE','ANTI','EARN','NAPE','NEAR','NEAT','NITE','PAIN','PAIR','PANE','PANT','PARE','PART','PATE','PEAR','PEAT','PENT','PERT','PIER','PINE','PINT','PITA','RAIN','RANT','RAPE','RAPT','RATE','REAP','REIN','RENT','RIPE','RITE','TAPE','TARE','TARP','TEAR','TERN','TIER','TINE','TIRE','TRAP','TRIP','AIR','ANI','ANT','APE','APT','ARE','ART','ATE','EAR','EAT','ERA','ETA','IRE','NAP','NET','NIP','NIT','PAN','PAR','PAT','PEA','PEN','PER','PET','PIE','PIN','PIT','RAN','RAP','RAT','REP','RIP','TAN','TAP','TAR','TEA','TEN','TIE','TIN','TIP']},
    {anchor:'STORAGE',words:['STORAGE','GAROTES','ARGOTS','GAROTE','GRATES','GREATS','ORATES','ARGOT','AROSE','ASTER','GATES','GEARS','GOATS','GORES','GORSE','GRATE','GREAT','OGRES','ORATE','RAGES','RATES','ROAST','SAGER','SORTA','STAGE','STARE','STORE','TARES','TAROS','TASER','TEARS','TOGAE','TOGAS','AGES','ARES','ARTS','EARS','EAST','EATS','EGOS','ERAS','ERGO','ERGS','GATE','GEAR','GETS','GOAT','GOES','GORE','OARS','OATS','OGRE','ORES','RAGE','RAGS','RATE','RATS','REST','ROES','ROSE','ROTE','ROTS','SAGE','SAGO','SATE','SEAR','SEAT','SERA','SOAR','SORE','SORT','STAG','STAR','TAGS','TARE','TARO','TARS','TEAR','TEAS','TOES','TOGA','TOGS','TORE','TORS','TSAR','AGE','AGO','ARE','ART','ATE','EAR','EAT','EGO','ERA','ERG','EST','ETA','GAS','GET','GOT','OAR','OAT','ORE','RAG','RAT','ROE','ROT','SAG','SAT','SEA','SET','SOT','TAG','TAR','TEA','TOE','TOG','TOR']},
    {anchor:'TRAILED',words:['TRAILED','TRIALED','DERAIL','DETAIL','DILATE','RAILED','RELAID','RETAIL','TAILED','TIRADE','AILED','AIRED','ALDER','ALERT','ALTER','DEALT','DELTA','IDEAL','IDLER','IRATE','LATER','LITER','RATED','RILED','TARED','TIDAL','TILDE','TILED','TIRED','TRADE','TRAIL','TREAD','TRIAD','TRIAL','TRIED','AIDE','ALIT','ARID','DALE','DARE','DART','DATE','DEAL','DEAR','DELI','DIAL','DIET','DIRE','DIRT','EARL','EDIT','IDEA','IDLE','LADE','LAID','LAIR','LARD','LATE','LEAD','LIAR','LIED','LIRA','LIRE','LITE','RAID','RAIL','RATE','READ','REAL','RIDE','RILE','RITE','TAIL','TALE','TARE','TEAL','TEAR','TIDE','TIED','TIER','TILE','TIRE','AID','AIL','AIR','ALE','ALT','ARE','ART','ATE','DIE','EAR','EAT','ERA','ETA','IRE','LAD','LAT','LEA','LED','LEI','LET','LID','LIE','LIT','RAT','RED','RID','TAD','TAR','TEA','TIE']},
    {anchor:'WANDERS',words:['WANDERS','WARDENS','ANSWER','SANDER','SNARED','WADERS','WANDER','WARDEN','WARNED','DARES','DARNS','DAWNS','DEANS','DEARS','DRAWN','DRAWS','EARNS','NEARS','NERDS','READS','RENDS','SANER','SAWED','SEDAN','SNARE','SWARD','SWEAR','WADER','WADES','WANDS','WANED','WANES','WARDS','WARES','WARNS','WEANS','WEARS','WENDS','WRENS','ANEW','ARES','AWED','AWES','DARE','DARN','DAWN','DEAN','DEAR','DENS','DRAW','DREW','EARN','EARS','ENDS','ERAS','NEAR','NERD','NEWS','READ','REDS','REND','SAND','SANE','SAWN','SEAR','SEND','SERA','SEWN','SWAN','WADE','WADS','WAND','WANE','WARD','WARE','WARN','WARS','WEAN','WEAR','WEDS','WEND','WENS','WREN','ADS','AND','ARE','AWE','DEN','DEW','EAR','END','ERA','NEW','RAN','RAW','RED','SAD','SAW','SEA','SEW','WAD','WAN','WAR','WAS','WED','WEN']},
    {anchor:'READING',words:['READING','DANGER','DARING','GAINED','GANDER','GARDEN','RAINED','RANGED','REGAIN','RINGED','AIRED','ANGER','DEIGN','DINER','DIRGE','DRAIN','GRADE','GRAIN','GRAND','GRIND','NADIR','RAGED','RANGE','REIGN','RIDGE','AGED','AIDE','ARID','DARE','DARN','DEAN','DEAR','DINE','DING','DIRE','DRAG','EARN','GAIN','GEAR','GIRD','GRAD','GRID','GRIN','IDEA','NEAR','NERD','RAGE','RAID','RAIN','RANG','READ','REIN','REND','RIDE','RIND','RING','AGE','AID','AIR','AND','ANI','ARE','DEN','DIE','DIG','DIN','EAR','END','ERA','ERG','GAD','GEN','GIN','IRE','NAG','NEG','RAG','RAN','RED','RID','RIG']},
    {anchor:'MONSTER',words:['MONSTER','MENTORS','MENTOR','METROS','SERMON','STONER','TENORS','TENSOR','METRO','MORES','MORNS','MOTES','NORMS','NOTES','OMENS','ONSET','RENTS','SMOTE','SNORE','SNORT','STERN','STONE','STORE','STORM','TENOR','TERMS','TERNS','TOMES','TONER','TONES','TRONS','EMOS','EONS','MORE','MORN','MOST','MOTE','NEST','NETS','NOES','NORM','NOSE','NOTE','OMEN','ONES','ORES','RENT','REST','ROES','ROSE','ROTE','ROTS','SENT','SNOT','SOME','SORE','SORT','STEM','TENS','TERM','TERN','TOES','TOME','TOMS','TONE','TONS','TORE','TORN','TORS','EMO','EMS','EON','EST','MEN','MET','NET','NOR','NOS','NOT','ONE','ORE','ROE','ROT','SET','SON','SOT','TEN','TOE','TOM','TON','TOR']},
    {anchor:'CRASHED',words:['CRASHED','ARCHED','ARCHES','CADRES','CASHED','CEDARS','CHASED','CHASER','SACRED','SCARED','SEARCH','SHARED','ACHED','ACHES','ACRES','ARCED','ASHED','CADRE','CARDS','CARED','CARES','CASED','CEDAR','CHADS','CHARS','CHASE','CRASH','DARES','DEARS','HARED','HARES','HEADS','HEARD','HEARS','HERDS','RACED','RACES','REACH','READS','RHEAS','SCARE','SHADE','SHARD','SHARE','SHEAR','SHERD','SHRED','ACED','ACES','ACHE','ACRE','ARCH','ARCS','ARES','CADS','CARD','CARE','CARS','CASE','CASH','CHAD','CHAR','DARE','DASH','DEAR','EACH','EARS','ERAS','HARD','HARE','HEAD','HEAR','HERD','HERS','RACE','RASH','READ','REDS','RHEA','SCAD','SCAR','SEAR','SERA','SHAD','SHED','ACE','ADS','ARC','ARE','ASH','CAD','CAR','EAR','ERA','HAD','HAS','HER','RED','SAC','SAD','SEA','SEC','SHE']}
  ],
  fr: [
    {anchor:'PARTIES',words:['PARTIES','PATRIES','PIASTRE','PIRATES','PISTERA','ASPIRE','ESPRIT','PAIRES','PARIES','PARSIE','PARTES','PARTIE','PARTIS','PATRIE','PESAIT','PESTAI','PIRATE','PISTER','PITRES','RAITES','REPAIS','RESAIT','RESTAI','SATIRE','SERAIT','SPARTE','STARIE','TAPIES','TAPIRS','TARIES','TERSAI','TIARES','TISERA','TRAIES','TRIPES','AIRES','APTES','ARISE','ASTER','ASTRE','ESPAR','PAIES','PAIRE','PAIRS','PARES','PARIE','PARIS','PARSI','PARTE','PARTI','PARTS','PATER','PESAI','PESTA','PIRES','PISTA','PISTE','PITES','PITRE','PRIAS','PRIES','PRISA','PRISE','RAIES','RAITE','RAITS','RAPTS','RATES','REPAS','RESTA','RIPAS','RIPES','RITES','SAPER','SERAI','SERTI','SITAR','SPART','SPIRE','SPRAT','STIPE','STRIA','STRIE','STRIP','TAIES','TAIRE','TAISE','TAPER','TAPES','TAPIE','TAPIR','TAPIS','TARES','TARIE','TARIS','TARSE','TERSA','TIARE','TIERS','TIRAS','TIRES','TISER','TRAIE','TRAIS','TRAPS','TRIAS','TRIES','TRIPE','AIES','AIRE','AIRS','AISE','APTE','ARES','ARTS','IRAS','IRES','PAIE','PAIR','PAIS','PARE','PARI','PARS','PART','PERS','PESA','PETS','PIES','PIRE','PRIA','PRIE','PRIS','PRIT','RAIE','RAIS','RAPT','RASE','RATE','RATS','REIS','REPS','RIAS','RIES','RIPE','RITE','SAIT','SAPE','SARI','SEPT','SERA','SERT','SIRE','SITE','STAR','STEP','TAIE','TAIS','TAPE','TAPI','TARE','TARI','TIRA','TIRE','TIRS','TRAP','TRIA','TRIE','TRIP','TRIS','TSAR','AIE','AIR','AIS','AIT','API','ARE','ARS','ART','ERS','EST','IRA','IRE','PAR','PAS','PAT','PET','PIE','PIS','RAI','RAS','RAT','RIA','RIE','RIS','RIT','SEP','SET','SIR','TAS','TER','TES','TIR','TRI']},
    {anchor:'SERVAIT',words:['SERVAIT','AVERTIS','RIVETAS','SEVRAIT','VERSAIT','AVERTI','AVISER','ESTIVA','RAITES','RAVIES','RAVISE','RESAIT','RESTAI','RIVETA','RIVETS','SATIRE','SERAIT','SERVIT','SEVRAI','STARIE','TARIES','TERSAI','TIARES','TISERA','TRAIES','VARIES','VERSAI','VERTIS','VISERA','VITRAS','VITRES','VRAIES','AIRES','ARISE','ASTER','ASTRE','AVERS','AVISE','IVRES','RAIES','RAITE','RAITS','RATES','RAVES','RAVIE','RAVIS','RAVIT','RESTA','REVIS','REVIT','RITES','RIVAS','RIVES','RIVET','SERAI','SERTI','SERVI','SEVRA','SITAR','STRIA','STRIE','TAIES','TAIRE','TAISE','TARES','TARIE','TARIS','TARSE','TERSA','TIARE','TIERS','TIRAS','TIRES','TISER','TRAIE','TRAIS','TRIAS','TRIES','VARIE','VASER','VASTE','VERSA','VERTI','VERTS','VIRAS','VIRES','VISER','VITAE','VITRA','VITRE','VRAIE','VRAIS','AIES','AIRE','AIRS','AISE','ARES','ARTS','AVIS','IRAS','IRES','IVES','IVRE','RAIE','RAIS','RASE','RATE','RATS','RAVE','RAVI','REIS','RIAS','RIES','RITE','RIVE','SAIT','SARI','SERA','SERT','SIRE','SITE','STAR','TAIE','TAIS','TARE','TARI','TIRA','TIRE','TIRS','TRIA','TRIE','TRIS','TSAR','VAIS','VASE','VERS','VERT','VIES','VIRA','VIRE','VISA','VISE','VITE','VRAI','AIE','AIR','AIS','AIT','ARE','ARS','ART','AVE','ERS','EST','IRA','IRE','IVE','RAI','RAS','RAT','RIA','RIE','RIS','RIT','SET','SIR','TAS','TER','TES','TIR','TRI','VAR','VAS','VER','VIA','VIE','VIS','VIT']},
    {anchor:'MARINES',words:['MARINES','MINERAS','RANIMES','ANIMER','ANIMES','ANISER','ARSINE','ISERAN','MAIRES','MANIER','MANIES','MARIES','MARINE','MARINS','MARNES','MENAIS','MINERA','MISERA','NIERAS','RAINES','RANIME','REMISA','RENAIS','RENIAS','SAMIEN','SERINA','AIMER','AIMES','AINES','AIRES','AMERS','AMIES','ANIME','ANISE','ARIEN','ARISE','ARMES','ARSIN','MAINS','MAIRE','MANIE','MANSE','MARES','MARIE','MARIN','MARIS','MARNE','MASER','MENAI','MENAS','MIENS','MINAS','MINER','MINES','MIRAS','MIRES','MISER','NIERA','RAIES','RAINE','RAMES','RAMIE','RAMIS','REINS','REMIS','RENIA','RIENS','RIMAS','RIMES','SAINE','SANIE','SEMAI','SERAI','SERIN','AIES','AIME','AINE','AIRE','AIRS','AISE','AMEN','AMER','AMIE','AMIS','ANIS','ANSE','ARES','ARME','IRAS','IRES','MAIN','MAIS','MANS','MARE','MARI','MARS','MENA','MENS','MERS','MESA','MIEN','MINA','MINE','MIRA','MIRE','MISA','MISE','NAIS','NASE','NIAS','NIER','NIES','RAIE','RAIS','RAME','RAMI','RANI','RASE','REIN','REIS','REMS','RIAS','RIEN','RIES','RIME','SAIN','SARI','SEIN','SEMA','SERA','SIEN','SIRE','AIE','AIR','AIS','AMI','ANI','ANS','ARE','ARS','ERS','INS','IRA','IRE','MAI','MAN','MAR','MAS','MEN','MER','MES','MIE','MIN','MIR','MIS','NIA','NIE','RAI','RAS','REM','RIA','RIE','RIS','SEN','SIR']},
    {anchor:'CRAINTE',words:['CRAINTE','CARIENT','CENTRAI','CERNAIT','CERTAIN','CRIANTE','ENCRAIT','ACTINE','AIRENT','CANTER','CANTRE','CARNET','CENTRA','CERNAI','CINTRA','CINTRE','CIRANT','CIRENT','CITERA','CRAINT','CRANTE','CRIANT','CRIENT','ENCART','ENCIRA','ENCRAI','ENTRAI','NATICE','NECTAR','RACINE','RAIENT','RANCIE','RANCIT','RATINE','RENTAI','RIANTE','RICANE','TANCER','TANREC','ACIER','ACTER','AIENT','ANCRE','ANTRE','ARIEN','CAIRN','CANER','CARET','CARIE','CARNE','CARTE','CATIE','CATIN','CATIR','CEINT','CERNA','CITER','CRAIE','CRANE','ENCRA','ENTAI','ENTRA','INTER','NACRE','NIERA','NITRA','NITRE','RAINE','RAITE','RANCE','RANCI','RECTA','RENIA','RENTA','RIANT','RIENT','RINCE','TAIRE','TANCE','TARIE','TARIN','TENIR','TERNI','TIARE','TRACE','TRAIE','TRAIN','ACRE','ACTE','AINE','AIRE','ANTE','CANE','CARI','CATI','CENT','CIRA','CIRE','CITA','CITE','CRAN','CRIA','CRIE','CRIN','INCA','NIER','RACE','RAIE','RANI','RATE','REIN','RIEN','RITE','TAIE','TARE','TARI','TIEN','TIRA','TIRE','TRIA','TRIE','ACE','AIE','AIR','AIT','ANI','ANT','ARC','ARE','ART','CAR','CET','CRI','INT','IRA','IRE','NET','NIA','NIE','RAI','RAT','RIA','RIE','RIT','TAC','TAN','TER','TIC','TIN','TIR','TRI']},
    {anchor:'SARDINE',words:['SARDINE','DRAINES','RADINES','RENDAIS','ANISER','ARIDES','ARSINE','DAINES','DANSER','DARNES','DINARS','DRAIES','DRAINE','DRAINS','ISERAN','NIERAS','RADIES','RADINE','RADINS','RAIDES','RAINES','RENAIS','RENDIS','RENIAS','SANDRE','SERINA','AIDER','AIDES','AINES','AIRES','ANISE','ARIDE','ARIEN','ARISE','ARSIN','DAINE','DANSE','DARNE','DARSE','DIANE','DINAR','DIRAS','DIRES','DRAIE','DRAIN','INDES','ISARD','NADIR','NARDS','NIERA','RADES','RADIE','RADIN','RADIS','RAIDE','RAIDS','RAIES','RAINE','REDAN','REDIS','REINS','RENDS','RENIA','RIDAS','RIDES','RIENS','SAINE','SANIE','SARDE','SERAI','SERIN','AIDE','AIES','AINE','AIRE','AIRS','AISE','ANIS','ANSE','ARES','DAIS','DANS','DIRA','DIRE','DISE','IDES','INDE','IRAS','IRES','NAIS','NARD','NASE','NIAS','NIDS','NIER','NIES','RADE','RAID','RAIE','RAIS','RANI','RASE','REIN','REIS','REND','RIAS','RIDA','RIDE','RIEN','RIES','SAIN','SARI','SEIN','SERA','SIED','SIEN','SIRE','AIE','AIR','AIS','AND','ANI','ANS','ARE','ARS','DAN','DER','DES','DIA','DIS','END','ERS','IDE','INS','IRA','IRE','NIA','NID','NIE','RAD','RAI','RAS','RIA','RIE','RIS','SAD','SEN','SIR']},
    {anchor:'PATINER',words:['PATINER','PARIENT','PINTERA','PRENAIT','PRIANTE','TAPINER','AIRENT','ARPENT','ENTRAI','INAPTE','PAIENT','PANIER','PARENT','PARTIE','PATINE','PATRIE','PINTER','PIRATE','PRIANT','PRIENT','RAIENT','RAPINE','RATINE','RENTAI','RIANTE','RIPANT','RIPENT','TAPINE','AIENT','ANTRE','ARIEN','ENTAI','ENTRA','INTER','NIERA','NITRA','NITRE','PAIRE','PANER','PANTE','PARIE','PARTE','PARTI','PATER','PATIN','PEINA','PEINT','PINTA','PINTE','PITRE','RAINE','RAITE','RAPIN','RENIA','RENTA','RIANT','RIENT','TAIRE','TAPER','TAPIE','TAPIN','TAPIR','TARIE','TARIN','TENIR','TERNI','TIARE','TRAIE','TRAIN','TRIPE','AINE','AIRE','ANTE','APTE','NIER','PAIE','PAIN','PAIR','PANE','PARE','PARI','PART','PIRE','PRIA','PRIE','PRIT','RAIE','RANI','RAPT','RATE','REIN','RIEN','RIPE','RITE','TAIE','TAPE','TAPI','TARE','TARI','TIEN','TIRA','TIRE','TRAP','TRIA','TRIE','TRIP','AIE','AIR','AIT','ANI','ANT','API','ARE','ART','INT','IRA','IRE','NET','NIA','NIE','PAN','PAR','PAT','PET','PIE','PIN','RAI','RAT','RIA','RIE','RIT','TAN','TER','TIN','TIR','TRI']},
    {anchor:'DANSEUR',words:['DANSEUR','ENDURAS','ARDUES','DANSER','DARNES','ENDURA','NUERAS','RENDUS','RUADES','SANDRE','SAUNER','ARDUE','ARDUS','AUNER','AUNES','DANSE','DARNE','DARSE','DRUES','DUNES','DURAS','DURES','NARDS','NUERA','NURSE','RADES','REDAN','REDUS','RENDS','RENDU','RUADE','RUDES','SARDE','SAUNE','SAURE','SENAU','SUERA','URANE','URNES','USERA','ANSE','ANUS','ARDU','ARES','AUNE','DANS','DRUE','DRUS','DUES','DUNE','DURA','DURE','DURS','NARD','NASE','NUAS','NUER','NUES','RADE','RASE','REND','RUAS','RUDE','RUES','RUSE','SAUR','SEAU','SERA','SUER','SURE','UNES','URES','URNE','USER','AND','ANS','ARE','ARS','DAN','DER','DES','DRU','DUE','DUR','DUS','EAU','END','ERS','EUS','NUE','NUS','RAD','RAS','RUA','RUE','SAD','SEN','SUD','SUE','SUR','UNE','UNS','URE','USA','USE']},
    {anchor:'ROUTINE',words:['ROUTINE','ENTOIR','ENTOUR','IOURTE','ORIENT','ROUENT','RUTINE','TOURIE','TOURNE','TURION','INTER','IRONE','IRONT','NITRE','NOIRE','NOTER','NOTRE','NOUER','NUIRE','OIENT','OINTE','ORTIE','OUTER','OUTRE','RIENT','RIOTE','ROTIN','ROUET','ROUIE','ROUIT','ROUTE','RUENT','RUINE','TENIR','TERNI','TONIE','TOUER','TROUE','TRUIE','TUNER','TURNE','URINE','EURO','NIER','NOIE','NOIR','NOTE','NOUE','NUER','NUIT','OINT','ORNE','REIN','RIEN','RITE','ROTE','ROUE','ROUI','TENU','TIEN','TIRE','TORE','TOUR','TRIE','TRIO','TROU','TUER','UNIE','UNIR','UNIT','URNE','EUT','INT','ION','IRE','NET','NIE','NUE','NUI','OIE','ONT','OUI','OUT','RIE','RIT','ROI','ROT','RUE','RUT','TER','TIN','TIR','TOI','TON','TRI','TUE','UNE','UNI','URE']}
  ]
};

function initWordClash(area, setStatus, online) {
  const rng = online ? online.rng : Math.random;
  const defaultLang = navigator.language.startsWith('fr') ? 'fr' : 'en';

  let lang, puzzle, gridWords, bonusWords, foundGrid, foundBonus, hinted;
  let gridRows, gridCols, gridCells;
  let wheelLetters, selection = [], selectionActive = false;
  let scores = [0, 0], turn = 0, timeLeft = 30, timerInterval = null;
  let gameOver = false, destroyed = false;

  const wrap = document.createElement('div');
  wrap.className = 'board-game';
  wrap.style.cssText = 'overflow:auto;user-select:none;-webkit-user-select:none';
  area.appendChild(wrap);
  const cont = document.createElement('div');
  cont.style.cssText = 'width:min(98vw,480px);margin:0 auto';
  wrap.appendChild(cont);

  // --- Language picker ---
  function showLangPicker() {
    if (online && online.playerId !== 0) {
      cont.innerHTML = '<div style="text-align:center;padding:40px;color:#aaa;font-size:1.1em">Waiting for host to pick language...</div>';
      online.onState('lang', l => { lang = l; beginGame(); });
      return;
    }
    const defFr = defaultLang === 'fr';
    cont.innerHTML = '<div style="text-align:center;padding:30px">' +
      '<div style="font-size:1.3em;font-weight:bold;margin-bottom:20px;color:#B2DFDB">Choose Language</div>' +
      '<button class="btn" id="wc-en" style="margin:8px;padding:14px 32px;font-size:1.1em;background:' + (defFr ? '#37474F' : '#00897B') + '">English</button>' +
      '<button class="btn" id="wc-fr" style="margin:8px;padding:14px 32px;font-size:1.1em;background:' + (defFr ? '#00897B' : '#37474F') + '">Fran\u00e7ais</button>' +
      '</div>';
    const pick = l => { lang = l; if (online) online.setState('lang', l); beginGame(); };
    cont.querySelector('#wc-en').onclick = () => pick('en');
    cont.querySelector('#wc-fr').onclick = () => pick('fr');
  }

  // --- Puzzle generation ---
  function beginGame() {
    generatePuzzle();
    render();
    startTurn();
  }

  function generatePuzzle() {
    const data = WORD_DATA[lang] || WORD_DATA.en;
    const idx = Math.floor(rng() * data.length);
    puzzle = data[idx];
    wheelLetters = puzzle.anchor.split('');
    for (let i = wheelLetters.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [wheelLetters[i], wheelLetters[j]] = [wheelLetters[j], wheelLetters[i]];
    }
    buildCrossword();
  }

  function buildCrossword() {
    const placed = [];
    const cells = {};

    function addWord(w, row, col, dir) {
      placed.push({word: w, row, col, dir});
      for (let i = 0; i < w.length; i++) {
        const r = dir === 'h' ? row : row + i;
        const c = dir === 'h' ? col + i : col;
        cells[r + ',' + c] = w[i];
      }
    }

    function canPlace(w, row, col, dir) {
      let crossings = 0;
      for (let i = 0; i < w.length; i++) {
        const r = dir === 'h' ? row : row + i;
        const c = dir === 'h' ? col + i : col;
        const key = r + ',' + c;
        if (cells[key]) {
          if (cells[key] !== w[i]) return false;
          crossings++;
        } else {
          if (dir === 'h') {
            if (cells[(r - 1) + ',' + c]) return false;
            if (cells[(r + 1) + ',' + c]) return false;
          } else {
            if (cells[r + ',' + (c - 1)]) return false;
            if (cells[r + ',' + (c + 1)]) return false;
          }
        }
      }
      if (crossings === 0 && placed.length > 0) return false;
      if (dir === 'h') {
        if (cells[row + ',' + (col - 1)]) return false;
        if (cells[row + ',' + (col + w.length)]) return false;
      } else {
        if (cells[(row - 1) + ',' + col]) return false;
        if (cells[(row + w.length) + ',' + col]) return false;
      }
      return true;
    }

    function tryPlace(w) {
      if (placed.some(p => p.word === w)) return false;
      for (let pi = 0; pi < placed.length; pi++) {
        const p = placed[pi];
        for (let pci = 0; pci < p.word.length; pci++) {
          for (let wci = 0; wci < w.length; wci++) {
            if (p.word[pci] !== w[wci]) continue;
            const newDir = p.dir === 'h' ? 'v' : 'h';
            let nr, nc;
            if (p.dir === 'h') { nr = p.row - wci; nc = p.col + pci; }
            else { nr = p.row + pci; nc = p.col - wci; }
            if (canPlace(w, nr, nc, newDir)) {
              addWord(w, nr, nc, newDir);
              return true;
            }
          }
        }
      }
      return false;
    }

    // Place anchor first horizontally
    const anchor = puzzle.anchor;
    addWord(anchor, 10, Math.max(0, Math.floor((14 - anchor.length) / 2)), 'h');

    // Group remaining words by length, shuffle each group with rng
    const others = puzzle.words.filter(w => w !== anchor);
    const byLen = {};
    others.forEach(w => {
      const len = w.length;
      if (!byLen[len]) byLen[len] = [];
      byLen[len].push(w);
    });
    for (const len in byLen) {
      const arr = byLen[len];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }

    // Build compact candidate pool — like WOW: ~6-7 words total
    const pool = [];
    const tiers = [{min:5,max:6,n:1},{min:4,max:4,n:3},{min:3,max:3,n:3}];
    tiers.forEach(t => {
      for (let len = t.max; len >= t.min; len--) {
        if (byLen[len]) pool.push(...byLen[len].slice(0, t.n));
      }
    });

    // Try to place from pool — cap at 7 total (anchor + 6)
    for (let wi = 0; wi < pool.length && placed.length < 7; wi++) {
      tryPlace(pool[wi]);
    }

    // If under 4 words placed, try more from all remaining
    if (placed.length < 4) {
      const placedSet = new Set(placed.map(p => p.word));
      const remaining = others.filter(w => !placedSet.has(w));
      remaining.sort((a, b) => b.length - a.length);
      for (let i = 0; i < remaining.length && placed.length < 6; i++) {
        tryPlace(remaining[i]);
      }
    }

    // Normalize coordinates
    let minR = Infinity, minC = Infinity;
    placed.forEach(p => {
      minR = Math.min(minR, p.row);
      minC = Math.min(minC, p.col);
    });

    let maxR = 0, maxC = 0;
    gridWords = placed.map(p => {
      const gw = {word: p.word, row: p.row - minR, col: p.col - minC, dir: p.dir, foundBy: -1};
      const er = gw.dir === 'v' ? gw.row + gw.word.length - 1 : gw.row;
      const ec = gw.dir === 'h' ? gw.col + gw.word.length - 1 : gw.col;
      maxR = Math.max(maxR, er);
      maxC = Math.max(maxC, ec);
      return gw;
    });

    gridRows = maxR + 1;
    gridCols = maxC + 1;
    gridCells = {};
    gridWords.forEach(gw => {
      for (let i = 0; i < gw.word.length; i++) {
        const r = gw.dir === 'h' ? gw.row : gw.row + i;
        const c = gw.dir === 'h' ? gw.col + i : gw.col;
        gridCells[r + ',' + c] = {letter: gw.word[i], foundBy: -1};
      }
    });

    const gridWordSet = new Set(gridWords.map(gw => gw.word));
    bonusWords = puzzle.words.filter(w => !gridWordSet.has(w));
    foundGrid = new Set();
    foundBonus = new Set();
    hinted = new Set();
  }

  // --- Timer ---
  function startTurn() {
    timeLeft = 30;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (destroyed || gameOver) { clearInterval(timerInterval); return; }
      timeLeft--;
      updateTimer();
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        SND.buzz();
        if (online) online.sendMove({word: '', type: 'timeout'});
        switchTurn();
      }
    }, 1000);
    if (online) {
      setStatus(turn === online.playerId ? 'Your turn' : "Opponent's turn");
    } else {
      setStatus('P' + (turn + 1) + "'s turn");
    }
    render();
  }

  function updateTimer() {
    const el = cont.querySelector('#wc-timer');
    if (el) {
      el.textContent = timeLeft + 's';
      el.style.color = timeLeft <= 5 ? '#F44336' : '#FFD54F';
    }
  }

  function switchTurn() {
    turn = 1 - turn;
    if (checkEnd()) return;
    startTurn();
  }

  function checkEnd() {
    const allFound = gridWords.every(gw => gw.foundBy >= 0);
    if (!allFound) return false;
    gameOver = true;
    if (timerInterval) clearInterval(timerInterval);
    SND.win();
    const w = scores[0] > scores[1] ? 'P1 wins!' : scores[1] > scores[0] ? 'P2 wins!' : "It's a tie!";
    const msg = online
      ? (scores[online.playerId] > scores[1 - online.playerId] ? 'You win!' : scores[online.playerId] < scores[1 - online.playerId] ? 'You lose!' : "It's a tie!")
      : w;
    setStatus(msg);
    render();
    setTimeout(() => showOverlay(area, msg + '<br>P1: ' + scores[0] + ' | P2: ' + scores[1], 'Rematch', restart), 700);
    return true;
  }

  function restart() {
    scores = [0, 0]; turn = 0; gameOver = false; selection = [];
    generatePuzzle();
    render();
    startTurn();
  }

  // --- Shuffle & Reveal ---
  function shuffleWheel() {
    for (let i = wheelLetters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wheelLetters[i], wheelLetters[j]] = [wheelLetters[j], wheelLetters[i]];
    }
    SND.click();
    render();
  }

  function revealLetter() {
    if (gameOver) return;
    if (online && turn !== online.playerId) return;
    const candidates = [];
    for (const key in gridCells) {
      if (gridCells[key].foundBy === -1 && !hinted.has(key)) candidates.push(key);
    }
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    hinted.add(pick);
    SND.pop();
    if (online) online.sendMove({type: 'reveal', cell: pick});
    if (timerInterval) clearInterval(timerInterval);
    render();
    setTimeout(() => switchTurn(), 400);
  }

  // --- Word submission ---
  function submitWord(word) {
    if (gameOver) return;
    if (online && turn !== online.playerId) return;
    if (word.length < 3) return;

    // Check grid words
    const gw = gridWords.find(g => g.word === word && g.foundBy < 0);
    if (gw) {
      gw.foundBy = turn;
      foundGrid.add(word);
      scores[turn] += word.length;
      for (let i = 0; i < gw.word.length; i++) {
        const r = gw.dir === 'h' ? gw.row : gw.row + i;
        const c = gw.dir === 'h' ? gw.col + i : gw.col;
        const cell = gridCells[r + ',' + c];
        if (cell) cell.foundBy = turn;
      }
      SND.chime();
      if (online) online.sendMove({word: word, type: 'grid'});
      if (timerInterval) clearInterval(timerInterval);
      render();
      setTimeout(() => switchTurn(), 400);
      return;
    }

    // Check bonus words
    if (bonusWords.includes(word) && !foundBonus.has(word)) {
      foundBonus.add(word);
      scores[turn] += 1;
      SND.pop();
      if (online) online.sendMove({word: word, type: 'bonus'});
      if (timerInterval) clearInterval(timerInterval);
      render();
      setTimeout(() => switchTurn(), 400);
      return;
    }

    // Already found or invalid
    SND.buzz();
  }

  function applyOpponentMove(data) {
    if (data.type === 'timeout') {
      switchTurn();
      return;
    }
    const word = data.word;
    if (data.type === 'grid') {
      const gw = gridWords.find(g => g.word === word && g.foundBy < 0);
      if (gw) {
        gw.foundBy = turn;
        foundGrid.add(word);
        scores[turn] += word.length;
        for (let i = 0; i < gw.word.length; i++) {
          const r = gw.dir === 'h' ? gw.row : gw.row + i;
          const c = gw.dir === 'h' ? gw.col + i : gw.col;
          const cell = gridCells[r + ',' + c];
          if (cell) cell.foundBy = turn;
        }
        SND.chime();
      }
    } else if (data.type === 'bonus') {
      if (!foundBonus.has(word)) {
        foundBonus.add(word);
        scores[turn] += 1;
        SND.pop();
      }
    } else if (data.type === 'reveal') {
      if (data.cell && !hinted.has(data.cell)) {
        hinted.add(data.cell);
        SND.pop();
      }
    }
    if (timerInterval) clearInterval(timerInterval);
    render();
    setTimeout(() => switchTurn(), 400);
  }

  // --- Render ---
  const P_COLORS = ['#E53935', '#42A5F5'];
  const P_BG = ['rgba(229,57,53,0.25)', 'rgba(66,165,245,0.25)'];

  function render() {
    if (destroyed) return;
    let h = '';
    // Score bar
    h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-bottom:4px">';
    h += '<div style="font-size:' + (turn === 0 ? '1.5em' : '0.95em') + ';font-weight:bold;color:' + P_COLORS[0] + (turn === 0 ? ';text-shadow:0 0 10px ' + P_COLORS[0] + ',0 0 24px ' + P_COLORS[0] : ';opacity:0.4') + ';transition:all 0.3s">P1: ' + scores[0] + '</div>';
    h += '<div id="wc-timer" style="font-size:1.6em;font-weight:bold;color:' + (timeLeft <= 5 ? '#F44336' : '#FFD54F') + '">' + timeLeft + 's</div>';
    h += '<div style="font-size:' + (turn === 1 ? '1.5em' : '0.95em') + ';font-weight:bold;color:' + P_COLORS[1] + (turn === 1 ? ';text-shadow:0 0 10px ' + P_COLORS[1] + ',0 0 24px ' + P_COLORS[1] : ';opacity:0.4') + ';transition:all 0.3s">P2: ' + scores[1] + '</div>';
    h += '</div>';

    // Crossword grid — size cells to fit nicely
    const maxGridW = Math.min(window.innerWidth * 0.92, 440);
    const cellSize = Math.min(Math.floor(maxGridW / Math.max(gridCols, 1)) - 3, 48);
    const fs = Math.max(14, cellSize * 0.55);
    h += '<div style="display:flex;justify-content:center;margin:6px 0">';
    h += '<div style="display:grid;grid-template-columns:repeat(' + gridCols + ',' + cellSize + 'px);grid-template-rows:repeat(' + gridRows + ',' + cellSize + 'px);gap:3px">';
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        const cell = gridCells[r + ',' + c];
        if (!cell) {
          h += '<div></div>';
        } else if (cell.foundBy >= 0) {
          h += '<div style="background:' + P_BG[cell.foundBy] + ';border:2px solid ' + P_COLORS[cell.foundBy] + ';border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:' + fs + 'px;color:#fff;box-shadow:0 0 8px ' + P_COLORS[cell.foundBy] + '40">' + cell.letter + '</div>';
        } else if (hinted.has(r + ',' + c)) {
          h += '<div style="background:rgba(128,203,196,0.15);border:2px solid #4DB6AC;border-radius:5px;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:' + fs + 'px;color:#80CBC4">' + cell.letter + '</div>';
        } else {
          h += '<div style="background:#1a2744;border:2px solid #2e5090;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:' + Math.max(10, cellSize * 0.35) + 'px;color:#4a6fa5;box-shadow:inset 0 1px 4px rgba(0,0,0,0.4)">\u2022</div>';
        }
      }
    }
    h += '</div></div>';

    // Grid word count + debug toggle
    const totalGrid = gridWords.length;
    const foundCount = gridWords.filter(g => g.foundBy >= 0).length;
    h += '<div style="text-align:center;margin:2px 0;font-size:0.8em;color:#555">' + foundCount + '/' + totalGrid + ' words';
    h += '</div>';

    // Selection preview
    const selWord = selection.map(i => wheelLetters[i]).join('');
    h += '<div style="text-align:center;margin:6px 0;font-size:1.7em;font-weight:bold;letter-spacing:6px;color:#FFD54F;min-height:1.8em">' + (selWord || '&nbsp;') + '</div>';

    // Letter wheel with shuffle button in center
    const wheelR = 76, lcSize = 46;
    const svgW = 2 * (wheelR + lcSize / 2) + 16, svgH = 2 * (wheelR + lcSize / 2) + 16;
    const wheelCx = svgW / 2, wheelCy = svgH / 2;
    h += '<div style="display:flex;justify-content:center;margin:2px 0">';
    h += '<div id="wc-wheel" style="position:relative;width:' + svgW + 'px;height:' + svgH + 'px;touch-action:none">';
    // SVG for connection lines
    h += '<svg id="wc-svg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none" viewBox="0 0 ' + svgW + ' ' + svgH + '">';
    if (selection.length > 1) {
      let pts = '';
      selection.forEach(idx => {
        const a = (idx / wheelLetters.length) * Math.PI * 2 - Math.PI / 2;
        pts += (wheelCx + wheelR * Math.cos(a)) + ',' + (wheelCy + wheelR * Math.sin(a)) + ' ';
      });
      h += '<polyline points="' + pts.trim() + '" fill="none" stroke="' + P_COLORS[turn] + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>';
    }
    h += '</svg>';
    // Letter circles
    for (let i = 0; i < wheelLetters.length; i++) {
      const angle = (i / wheelLetters.length) * Math.PI * 2 - Math.PI / 2;
      const lx = wheelCx + wheelR * Math.cos(angle) - lcSize / 2;
      const ly = wheelCy + wheelR * Math.sin(angle) - lcSize / 2;
      const isSel = selection.includes(i);
      h += '<div data-widx="' + i + '" style="position:absolute;left:' + lx + 'px;top:' + ly + 'px;width:' + lcSize + 'px;height:' + lcSize + 'px;border-radius:50%;background:' + (isSel ? P_COLORS[turn] : '#1a2744') + ';border:2.5px solid ' + (isSel ? '#fff' : '#2e5090') + ';display:flex;align-items:center;justify-content:center;font-size:1.4em;font-weight:bold;color:#fff;cursor:pointer;transition:background 0.1s;box-shadow:' + (isSel ? '0 0 12px ' + P_COLORS[turn] : '0 2px 8px rgba(0,0,0,0.4)') + '">' + wheelLetters[i] + '</div>';
    }
    // Shuffle button in center of wheel (like WOW)
    h += '<div id="wc-shuffle" style="position:absolute;left:' + (wheelCx - 20) + 'px;top:' + (wheelCy - 20) + 'px;width:40px;height:40px;border-radius:50%;background:#37474F;border:1.5px solid #546E7A;display:flex;align-items:center;justify-content:center;font-size:1.2em;cursor:pointer;color:#B0BEC5">\u21BB</div>';
    h += '</div></div>';

    // Hint button (below wheel) — only show when it's your turn
    if (!gameOver) {
      const canAct = !online || turn === online.playerId;
      if (canAct) {
        h += '<div style="display:flex;justify-content:center;margin:4px 0">';
        h += '<button id="wc-reveal" style="padding:6px 20px;font-size:0.95em;background:#37474F;border:1.5px solid #546E7A;border-radius:8px;color:#B0BEC5;cursor:pointer">Hint (skip turn)</button>';
        h += '</div>';
      }
    }

    // Bonus words found
    if (foundBonus.size > 0) {
      h += '<div style="text-align:center;margin:4px 0;font-size:0.85em;color:#80CBC4">Bonus: ' + [...foundBonus].join(', ') + '</div>';
    }

    cont.innerHTML = h;
    bindWheel();
    const shBtn = cont.querySelector('#wc-shuffle');
    if (shBtn) shBtn.onclick = shuffleWheel;
    const rvBtn = cont.querySelector('#wc-reveal');
    if (rvBtn) rvBtn.onclick = revealLetter;
  }

  // --- Wheel interaction ---
  function bindWheel() {
    const wheel = cont.querySelector('#wc-wheel');
    if (!wheel) return;

    function getLetterIdx(x, y) {
      const el = document.elementFromPoint(x, y);
      if (el && el.dataset && el.dataset.widx !== undefined) return parseInt(el.dataset.widx);
      return -1;
    }

    function canInteract() {
      if (gameOver) return false;
      if (online && turn !== online.playerId) return false;
      return true;
    }

    function startSel(x, y) {
      if (!canInteract()) return;
      const idx = getLetterIdx(x, y);
      if (idx < 0) return;
      selection = [idx];
      selectionActive = true;
      SND.click();
      render();
    }

    function moveSel(x, y) {
      if (!selectionActive) return;
      const idx = getLetterIdx(x, y);
      if (idx < 0) return;
      if (selection.length >= 2 && idx === selection[selection.length - 2]) {
        selection.pop();
        SND.click();
        render();
        return;
      }
      if (selection.includes(idx)) return;
      selection.push(idx);
      SND.click();
      render();
    }

    function endSel() {
      if (!selectionActive) return;
      selectionActive = false;
      if (selection.length >= 3) {
        const word = selection.map(i => wheelLetters[i]).join('');
        submitWord(word);
      }
      selection = [];
      render();
    }

    function isShuffleBtn(e) { return e.target.id === 'wc-shuffle' || e.target.closest('#wc-shuffle'); }
    wheel.addEventListener('mousedown', e => { if (isShuffleBtn(e)) { shuffleWheel(); return; } e.preventDefault(); startSel(e.clientX, e.clientY); });
    wheel.addEventListener('mousemove', e => { if (selectionActive) { e.preventDefault(); moveSel(e.clientX, e.clientY); } });
    wheel.addEventListener('mouseup', e => { endSel(); });
    wheel.addEventListener('mouseleave', e => { endSel(); });

    wheel.addEventListener('touchstart', e => { if (isShuffleBtn(e)) { shuffleWheel(); return; } e.preventDefault(); const t = e.touches[0]; startSel(t.clientX, t.clientY); }, {passive: false});
    wheel.addEventListener('touchmove', e => { e.preventDefault(); const t = e.touches[0]; moveSel(t.clientX, t.clientY); }, {passive: false});
    wheel.addEventListener('touchend', e => { e.preventDefault(); endSel(); }, {passive: false});
    wheel.addEventListener('touchcancel', e => { endSel(); });
  }

  // --- Online sync ---
  if (online) {
    online.listenMoves(data => applyOpponentMove(data));
    online.onOpponentDisconnect(() => {
      if (!gameOver) {
        gameOver = true;
        if (timerInterval) clearInterval(timerInterval);
        setStatus('Opponent disconnected');
        render();
      }
    });
  }

  // --- Start ---
  showLangPicker();

  return () => {
    destroyed = true;
    if (timerInterval) clearInterval(timerInterval);
    if (online) online.cleanup();
  };
}

// ==================== TANK WARS ====================
function initTankWars(area, setStatus, online) {
  const {canvas, ctx, w, h} = createCanvas(area);
  const GRAVITY = 0.15, HUD_H = 40, CTRL_H = 90;
  const GAME_TOP = HUD_H, GAME_BOT = h - CTRL_H;
  const TANK_W = 24, TANK_H = 12, BARREL_LEN = 16;
  const rng = online ? online.rng : Math.random;

  // Pixel-block terrain
  const BK = 5; // block size in pixels
  const gridCols = Math.ceil(w / BK);
  const gridRows = Math.ceil((GAME_BOT - GAME_TOP) / BK);
  const grid = new Uint8Array(gridCols * gridRows); // 0=empty, 1=filled
  (function genTerrain() {
    const minH = 60, maxH = (GAME_BOT - GAME_TOP) * 0.65;
    let ht = minH + rng() * (maxH - minH) * 0.5;
    const midH = (minH + maxH) / 2;
    const heights = new Float32Array(gridCols);
    for (let c = 0; c < gridCols; c++) {
      heights[c] = ht;
      const drift = (midH - ht) * 0.02;
      ht += (rng() - 0.5) * 8 + drift;
      ht = Math.max(minH, Math.min(maxH, ht));
    }
    for (let p = 0; p < 3; p++) {
      for (let c = 1; c < gridCols - 1; c++) heights[c] = (heights[c-1] + heights[c]*2 + heights[c+1]) / 4;
    }
    for (let c = 0; c < gridCols; c++) {
      const blockH = Math.round(heights[c] / BK);
      for (let r = gridRows - blockH; r < gridRows; r++) {
        if (r >= 0) grid[r * gridCols + c] = 1;
      }
    }
  })();
  function terrainY(x) {
    const col = Math.max(0, Math.min(gridCols - 1, Math.floor(x / BK)));
    for (let r = 0; r < gridRows; r++) {
      if (grid[r * gridCols + col]) return GAME_TOP + r * BK;
    }
    return GAME_BOT;
  }

  // Tanks
  const tanks = [
    {x: w*0.2, hp: 100, color: '#FF4444', angle: 60, power: 400, alive: true},
    {x: w*0.8, hp: 100, color: '#4488FF', angle: 120, power: 400, alive: true},
  ];
  tanks.forEach(t => t.y = terrainY(t.x) - TANK_H/2);

  let turn = 0, state = 'aim', gameOver = false;
  let proj = null, explosions = [], trail = [];
  let wind = (rng() - 0.5) * 20;
  let dragStart = null, dragAngle = 0, dragPower = 0;

  function sfxFire() { SND.shoot(); }
  function sfxBoom() { SND.boom(); }

  function createCrater(cx, cy, radius) {
    const bR = radius / BK;
    const cc = cx / BK, cr = (cy - GAME_TOP) / BK;
    for (let r = Math.max(0, Math.floor(cr - bR)); r < Math.min(gridRows, Math.ceil(cr + bR)); r++) {
      for (let c = Math.max(0, Math.floor(cc - bR)); c < Math.min(gridCols, Math.ceil(cc + bR)); c++) {
        const dx = c - cc, dy = r - cr;
        if (dx * dx + dy * dy <= bR * bR) grid[r * gridCols + c] = 0;
      }
    }
  }

  function getBarrelTip(tank) {
    const rad = tank.angle * Math.PI / 180;
    return {x: tank.x + Math.cos(rad) * BARREL_LEN, y: tank.y - TANK_H/2 - 3 - Math.sin(rad) * BARREL_LEN};
  }

  function fire() {
    const tank = tanks[turn];
    const tip = getBarrelTip(tank);
    const rad = tank.angle * Math.PI / 180;
    const spd = tank.power * 0.015;
    proj = {x: tip.x, y: tip.y, vx: Math.cos(rad) * spd, vy: -Math.sin(rad) * spd, age: 0};
    trail = [];
    state = 'fly';
    sfxFire();
  }

  function explode(x, y) {
    const radius = 25;
    createCrater(x, y, radius);
    explosions.push({x, y, r: 0, maxR: radius * 1.5, phase: 'grow'});
    sfxBoom();
    // Damage tanks
    for (const t of tanks) {
      if (!t.alive) continue;
      const dx = t.x - x, dy = t.y - y, dist = Math.sqrt(dx*dx+dy*dy);
      if (dist < radius * 1.5) {
        const falloff = Math.pow(1 - dist / (radius * 1.5), 0.5);
        const dmg = Math.round(40 * falloff);
        t.hp = Math.max(0, t.hp - dmg);
        if (t.hp <= 0) t.alive = false;
      }
    }
    // Settle tanks on terrain
    tanks.forEach(t => { if (t.alive) t.y = terrainY(t.x) - TANK_H/2; });
    state = 'explode';
  }

  function endTurn() {
    if (!tanks[0].alive || !tanks[1].alive) {
      gameOver = true;
      state = 'done';
      const winner = tanks[0].alive ? 0 : 1;
      const label = online ? (winner === online.playerId ? 'You win!' : 'You lose!') : `P${winner+1} wins!`;
      setStatus(label);
      showOverlay(area, label, 'Rematch', () => location.reload());
      return;
    }
    turn = 1 - turn;
    state = 'aim';
    const windStr = `Wind: ${wind > 0 ? '→' : '←'} ${Math.abs(wind).toFixed(0)}`;
    setStatus(online ? (turn === online.playerId ? `Your turn | ${windStr}` : `Opponent's turn | ${windStr}`) : `P${turn+1}'s turn | ${windStr}`);
  }

  // Input
  function getP(e) { const r=canvas.getBoundingClientRect(),t=e.touches?e.touches[0]:e; return {x:(t.clientX-r.left)/r.width*w, y:(t.clientY-r.top)/r.height*h}; }
  canvas.addEventListener('touchstart', e => { e.preventDefault(); handleDown(getP(e)); });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); handleMove(getP(e)); });
  canvas.addEventListener('touchend', e => { e.preventDefault(); handleUp(); });
  canvas.addEventListener('mousedown', e => handleDown(getP(e)));
  canvas.addEventListener('mousemove', e => { if (dragStart) handleMove(getP(e)); });
  canvas.addEventListener('mouseup', e => handleUp());

  function handleDown(p) {
    if (state !== 'aim' || gameOver) return;
    if (online && turn !== online.playerId) return;
    // Check fire button
    const fbx = w/2, fby = h - CTRL_H/2;
    if (Math.sqrt((p.x-fbx)**2+(p.y-fby)**2) < 28) {
      if (online) online.sendMove({angle: tanks[turn].angle, power: tanks[turn].power});
      fire(); return;
    }
    dragStart = p;
    dragAngle = tanks[turn].angle;
    dragPower = tanks[turn].power;
  }
  function handleMove(p) {
    if (!dragStart || state !== 'aim') return;
    const dx = p.x - dragStart.x, dy = p.y - dragStart.y;
    tanks[turn].angle = Math.max(0, Math.min(180, dragAngle - dx * 0.3));
    tanks[turn].power = Math.max(50, Math.min(1000, dragPower - dy * 3));
  }
  function handleUp() { dragStart = null; }

  if (online) {
    online.listenMoves(data => {
      tanks[turn].angle = data.angle;
      tanks[turn].power = data.power;
      fire();
    });
    online.onOpponentDisconnect(() => { if (!gameOver) { gameOver = true; state = 'done'; setStatus('Opponent disconnected'); } });
  }

  let raf;
  function update() {
    if (state === 'fly' && proj) {
      proj.vy += GRAVITY;
      proj.vx += wind * 0.001;
      proj.x += proj.vx; proj.y += proj.vy;
      proj.age++;
      trail.push({x: proj.x, y: proj.y});
      if (trail.length > 80) trail.shift();
      // Check terrain hit
      if (proj.x >= 0 && proj.x < w && proj.y >= terrainY(proj.x)) {
        explode(proj.x, proj.y); proj = null;
      }
      // Check tank hit
      if (proj) for (let i = 0; i < tanks.length; i++) {
        const t = tanks[i]; if (!t.alive) continue;
        if (proj.age < 8 && i === turn) continue;
        if (Math.abs(proj.x - t.x) < TANK_W && Math.abs(proj.y - t.y) < TANK_H) {
          explode(proj.x, proj.y); proj = null; break;
        }
      }
      // Off screen
      if (proj && (proj.x < -50 || proj.x > w+50 || proj.y > h+50)) { proj = null; endTurn(); }
    }
    if (state === 'explode') {
      let allDone = true;
      for (const e of explosions) {
        if (e.phase === 'grow') { e.r += 3; if (e.r >= e.maxR) e.phase = 'shrink'; allDone = false; }
        else if (e.phase === 'shrink') { e.r -= 2; if (e.r <= 0) e.phase = 'done'; else allDone = false; }
      }
      if (allDone) { explosions = []; endTurn(); }
    }
    draw();
    raf = requestAnimationFrame(update);
  }

  function draw() {
    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_BOT);
    skyGrad.addColorStop(0, '#1a1a3e'); skyGrad.addColorStop(1, '#2a3a5e');
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, w, h);

    // HUD
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, HUD_H);
    ctx.font = 'bold 13px sans-serif';
    // P1 info
    ctx.fillStyle = tanks[0].color; ctx.fillText(`P1: ${tanks[0].hp}HP`, 8, 16);
    const hp1w = 60; ctx.fillStyle = '#333'; ctx.fillRect(8, 22, hp1w, 8);
    ctx.fillStyle = tanks[0].hp > 50 ? '#4CAF50' : tanks[0].hp > 25 ? '#FFC107' : '#F44336';
    ctx.fillRect(8, 22, hp1w * tanks[0].hp / 100, 8);
    // P2 info
    ctx.fillStyle = tanks[1].color; ctx.textAlign = 'right'; ctx.fillText(`P2: ${tanks[1].hp}HP`, w-8, 16);
    ctx.fillStyle = '#333'; ctx.fillRect(w-8-hp1w, 22, hp1w, 8);
    ctx.fillStyle = tanks[1].hp > 50 ? '#4CAF50' : tanks[1].hp > 25 ? '#FFC107' : '#F44336';
    ctx.fillRect(w-8-hp1w, 22, hp1w * tanks[1].hp / 100, 8);
    ctx.textAlign = 'left';
    // Wind
    ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.font = '11px sans-serif';
    ctx.fillText(`Wind: ${wind > 0 ? '→' : '←'} ${Math.abs(wind).toFixed(0)}`, w/2, 16);
    const arrLen = Math.abs(wind) * 0.3;
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w/2 - arrLen, 28); ctx.lineTo(w/2 + arrLen, 28); ctx.stroke();
    ctx.textAlign = 'left';

    // Terrain pixel blocks
    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        if (!grid[r * gridCols + c]) continue;
        const above = r > 0 ? grid[(r-1) * gridCols + c] : 0;
        ctx.fillStyle = above ? '#8B6914' : '#A0811A';
        ctx.fillRect(c * BK, GAME_TOP + r * BK, BK, BK);
      }
    }

    // Tanks
    for (let i = 0; i < 2; i++) {
      const t = tanks[i]; if (!t.alive) continue;
      const ty = terrainY(t.x) - TANK_H/2;
      t.y = ty;
      // Treads
      ctx.fillStyle = '#333'; ctx.fillRect(t.x - TANK_W/2 - 2, ty + TANK_H/2 - 3, TANK_W + 4, 5);
      // Body
      ctx.fillStyle = t.color; ctx.fillRect(t.x - TANK_W/2, ty - TANK_H/2, TANK_W, TANK_H);
      // Turret dome
      ctx.beginPath(); ctx.arc(t.x, ty - TANK_H/2, 7, Math.PI, 0); ctx.fill();
      // Barrel
      const rad = t.angle * Math.PI / 180;
      ctx.strokeStyle = t.color; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(t.x, ty - TANK_H/2 - 3);
      ctx.lineTo(t.x + Math.cos(rad) * BARREL_LEN, ty - TANK_H/2 - 3 - Math.sin(rad) * BARREL_LEN);
      ctx.stroke(); ctx.lineCap = 'butt';
      // Active indicator
      if (i === turn && state === 'aim') {
        ctx.fillStyle = '#fff'; ctx.beginPath();
        ctx.moveTo(t.x, ty - TANK_H - 20); ctx.lineTo(t.x - 5, ty - TANK_H - 28); ctx.lineTo(t.x + 5, ty - TANK_H - 28);
        ctx.fill();
      }
    }

    // Projectile + trail
    if (proj) {
      ctx.strokeStyle = 'rgba(255,200,50,0.4)'; ctx.lineWidth = 2;
      if (trail.length > 1) { ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y); for (const p of trail) ctx.lineTo(p.x, p.y); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(proj.x, proj.y, 4, 0, Math.PI*2); ctx.fill();
    }

    // Explosions
    for (const e of explosions) {
      if (e.phase === 'done') continue;
      const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r);
      grad.addColorStop(0, 'rgba(255,200,50,0.9)'); grad.addColorStop(0.4, 'rgba(255,100,20,0.6)'); grad.addColorStop(1, 'rgba(255,50,0,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.fill();
    }

    // Controls area
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, h - CTRL_H, w, CTRL_H);
    if (state === 'aim' && !gameOver) {
      const tank = tanks[turn];
      ctx.fillStyle = '#ddd'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`Angle: ${tank.angle.toFixed(0)}°`, 12, h - CTRL_H + 20);
      ctx.fillText(`Power: ${tank.power.toFixed(0)}`, 12, h - CTRL_H + 38);
      // Power bar
      ctx.fillStyle = '#333'; ctx.fillRect(12, h - CTRL_H + 46, 100, 10);
      const pPct = tank.power / 1000;
      ctx.fillStyle = pPct < 0.5 ? '#4CAF50' : pPct < 0.8 ? '#FFC107' : '#F44336';
      ctx.fillRect(12, h - CTRL_H + 46, 100 * pPct, 10);
      ctx.font = '10px sans-serif'; ctx.fillStyle = '#888';
      ctx.fillText('Drag to aim', 12, h - CTRL_H + 72);
      // Fire button
      ctx.fillStyle = '#E53935';
      ctx.beginPath(); ctx.arc(w/2, h - CTRL_H/2, 26, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('FIRE', w/2, h - CTRL_H/2 + 4);
      // Right side info
      ctx.textAlign = 'right'; ctx.fillStyle = '#888'; ctx.font = '10px sans-serif';
      ctx.fillText(`P${turn+1}'s turn`, w - 12, h - CTRL_H + 20);
    }
    ctx.textAlign = 'left';
  }

  const windStr0 = `Wind: ${wind > 0 ? '→' : '←'} ${Math.abs(wind).toFixed(0)}`;
  setStatus(online ? (turn === online.playerId ? `Your turn | ${windStr0}` : `Opponent's turn | ${windStr0}`) : `P1's turn | ${windStr0}`);
  raf = requestAnimationFrame(update);
  return () => { cancelAnimationFrame(raf); if (online) online.cleanup(); };
}

// ==================== SHIP BATTLE ====================
function initShipBattle(area, setStatus, online) {
  const SZ = 10, SHIPS = [5,4,3,3,2];
  const grids = [Array.from({length:SZ},()=>Array(SZ).fill(0)), Array.from({length:SZ},()=>Array(SZ).fill(0))];
  const shots = [Array.from({length:SZ},()=>Array(SZ).fill(0)), Array.from({length:SZ},()=>Array(SZ).fill(0))];
  let phase = 'place', placer = online ? online.playerId : 0, shipIdx = 0, horizontal = true;
  let turn = 0, gameOver = false;
  let oppGridReceived = false, myGridSent = false;
  const wrap = document.createElement('div');
  wrap.className = 'board-game';
  wrap.style.overflow = 'auto';
  area.appendChild(wrap);
  const cont = document.createElement('div');
  cont.style.cssText = 'width:min(95vw,400px)';
  wrap.appendChild(cont);
  function render() {
    let h = '';
    if (phase === 'place') {
      h += `<div style="text-align:center;margin-bottom:6px">${online ? 'Place' : 'P'+(placer+1)+': Place'} ship (${SHIPS[shipIdx]} cells)</div>`;
      h += `<div style="text-align:center;margin-bottom:6px"><button class="btn" id="sb-rotate">${horizontal?'Horizontal':'Vertical'} ↻</button></div>`;
      h += renderGrid(grids[placer], null, true);
    } else if (phase === 'waitopp') {
      h += `<div style="text-align:center;font-size:1.2em;font-weight:bold;color:#888;padding:40px 0">Waiting for opponent to place ships...</div>`;
      h += `<div style="text-align:center;margin:6px 0;font-size:.85em">Your ships:</div>`;
      h += renderGridSmall(grids[online.playerId], shots[1-online.playerId]);
    } else if (phase === 'battle' && !gameOver) {
      const myId = online ? online.playerId : turn;
      h += `<div style="text-align:center;margin-bottom:4px;font-size:.85em">${online ? 'Your shots' : 'Your shots'} (opponent's sea):</div>`;
      h += renderGrid(null, shots[myId], false);
      h += `<div style="text-align:center;margin:6px 0;font-size:.85em">Your ships:</div>`;
      h += renderGridSmall(grids[myId], shots[1-myId]);
    }
    cont.innerHTML = h;
    cont.querySelectorAll('[data-cell]').forEach(el => {
      el.onclick = () => {
        const [r,c] = el.dataset.cell.split(',').map(Number);
        if (phase === 'place') placeShip(r, c);
        else if (phase === 'battle' && !gameOver) {
          if (online && turn !== online.playerId) return;
          execFireAt(r, c);
          if (online) online.sendMove({r, c});
        }
      };
    });
    const rotBtn = cont.querySelector('#sb-rotate');
    if (rotBtn) rotBtn.onclick = () => { horizontal = !horizontal; render(); };
  }
  function renderGrid(grid, shotGrid, placing) {
    const csz = Math.floor(Math.min(area.getBoundingClientRect().width * 0.9, 360) / SZ);
    let h = `<div style="display:grid;grid-template-columns:repeat(${SZ},${csz}px);gap:1px;justify-content:center">`;
    for (let r = 0; r < SZ; r++) for (let c = 0; c < SZ; c++) {
      let bg = '#1a3a5c';
      if (grid && grid[r][c]) bg = '#546E7A';
      if (shotGrid) { if (shotGrid[r][c] === 1) bg = '#EF5350'; if (shotGrid[r][c] === 2) bg = '#37474F'; }
      const marker = shotGrid ? (shotGrid[r][c]===1?'✕':shotGrid[r][c]===2?'•':'') : '';
      h += `<div data-cell="${r},${c}" style="width:${csz}px;height:${csz}px;background:${bg};display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:${csz*0.5}px;color:#fff">${marker}</div>`;
    }
    return h + '</div>';
  }
  function renderGridSmall(grid, oppShots) {
    const csz = Math.floor(Math.min(area.getBoundingClientRect().width * 0.9, 360) / SZ * 0.6);
    let h = `<div style="display:grid;grid-template-columns:repeat(${SZ},${csz}px);gap:1px;justify-content:center">`;
    for (let r = 0; r < SZ; r++) for (let c = 0; c < SZ; c++) {
      let bg = grid[r][c] ? '#546E7A' : '#1a3a5c';
      if (oppShots[r][c] === 1) bg = '#EF5350';
      if (oppShots[r][c] === 2) bg = '#37474F';
      h += `<div style="width:${csz}px;height:${csz}px;background:${bg}"></div>`;
    }
    return h + '</div>';
  }
  function checkBothReady() {
    if (myGridSent && oppGridReceived) {
      phase = 'battle'; turn = 0;
      setStatus(online ? (turn === online.playerId ? 'Your turn' : "Opponent's turn") : "P1's turn");
      render();
    }
  }
  function placeShip(r, c) {
    const len = SHIPS[shipIdx];
    const cells = [];
    for (let i = 0; i < len; i++) {
      const rr = horizontal ? r : r + i, cc = horizontal ? c + i : c;
      if (rr >= SZ || cc >= SZ || grids[placer][rr][cc]) return;
      cells.push([rr, cc]);
    }
    cells.forEach(([rr,cc]) => grids[placer][rr][cc] = shipIdx + 1);
    shipIdx++;
    if (shipIdx >= SHIPS.length) {
      if (online) {
        // Send our grid and wait for opponent
        const gridData = grids[online.playerId].map(row => row.slice());
        online.setState('grid' + online.playerId, gridData);
        myGridSent = true;
        phase = 'waitopp';
        setStatus('Waiting for opponent...');
        checkBothReady();
        render();
      } else if (placer === 0) {
        placer = 1; shipIdx = 0; horizontal = true;
        showOverlay(area, 'Pass device to P2', 'Ready', render);
      } else {
        phase = 'battle'; turn = 0;
        showOverlay(area, 'Pass device to P1', 'Ready', render);
      }
      return;
    }
    render();
  }
  function execFireAt(r, c) {
    const target = 1 - turn;
    if (shots[turn][r][c]) return;
    if (grids[target][r][c]) { shots[turn][r][c] = 1; SND.boom(); setStatus(online ? (turn === online.playerId ? 'Hit!' : 'They hit!') : 'Hit!'); }
    else { shots[turn][r][c] = 2; SND.splash(); setStatus(online ? (turn === online.playerId ? 'Miss' : 'They missed') : 'Miss'); }
    // Check win
    let allHit = true;
    for (let rr=0;rr<SZ;rr++) for (let cc=0;cc<SZ;cc++) if (grids[target][rr][cc] && shots[turn][rr][cc] !== 1) allHit = false;
    if (allHit) {
      gameOver = true; SND.win();
      const m = online ? (turn === online.playerId ? 'You win!' : 'You lose!') : `P${turn+1} wins!`;
      setStatus(m); render();
      setTimeout(() => showOverlay(area, m), 600);
      return;
    }
    const prevTurn = turn;
    render();
    setTimeout(() => {
      turn = 1 - prevTurn;
      if (online) {
        setStatus(turn === online.playerId ? 'Your turn' : "Opponent's turn");
        render();
      } else {
        showOverlay(area, `Pass device to P${turn+1}`, 'Ready', render);
      }
    }, 800);
  }
  if (online) {
    // Listen for opponent's grid
    const oppId = 1 - online.playerId;
    online.onState('grid' + oppId, data => {
      for (let r = 0; r < SZ; r++) for (let c = 0; c < SZ; c++) grids[oppId][r][c] = data[r][c];
      oppGridReceived = true;
      checkBothReady();
    });
    online.listenMoves(data => execFireAt(data.r, data.c));
    online.onOpponentDisconnect(() => { if (!gameOver) { gameOver = true; setStatus('Opponent disconnected'); } });
  }
  render();
  setStatus(online ? 'Place your ships' : 'P1: Place ships');
  return () => { if (online) online.cleanup(); };
}

// ==================== POOL ====================
function initPool(area, setStatus) {
  const {canvas, ctx, w, h} = createCanvas(area);
  const TW = w * 0.78, TH = h * 0.62, TX = (w-TW)/2, TY = (h-TH)/2;
  const BR = Math.min(TW,TH) * 0.028, PR = BR * 2.2;
  const FRICTION = 0.985;
  const pockets = [[TX,TY],[TX+TW/2,TY],[TX+TW,TY],[TX,TY+TH],[TX+TW/2,TY+TH],[TX+TW,TY+TH]];
  const COLORS = ['#fff','#FDD835','#1565C0','#E53935','#6A1B9A','#FF6F00','#2E7D32','#6D4C41','#111',
    '#FDD835','#1565C0','#E53935','#6A1B9A','#FF6F00','#2E7D32','#6D4C41'];
  let balls = [];
  let turn = 0, assigned = [null, null]; // 'solid' or 'stripe'
  let aiming = false, aimStart = null, gameOver = false, moving = false, zoomScale = 1;
  function initBalls() {
    balls = [{x:TX+TW*0.25,y:TY+TH/2,vx:0,vy:0,num:0,active:true}]; // cue ball
    const sx = TX+TW*0.72, sy = TY+TH/2;
    const order = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
    // Shuffle non-8 balls, keep 8 in middle
    let idx = 0;
    for (let row=0;row<5;row++) for (let col=0;col<=row;col++) {
      const x = sx + row * BR * 1.8;
      const y = sy + (col - row/2) * BR * 2.1;
      balls.push({x,y,vx:0,vy:0,num:order[idx],active:true});
      idx++;
    }
  }
  initBalls();
  function getTouch(e) {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {x:(t.clientX-r.left)/r.width*w, y:(t.clientY-r.top)/r.height*h};
  }
  canvas.addEventListener('mousedown', e => startAim(getTouch(e)));
  canvas.addEventListener('mousemove', e => moveAim(getTouch(e)));
  canvas.addEventListener('mouseup', e => endAim(getTouch(e)));
  canvas.addEventListener('touchstart', e => { e.preventDefault(); startAim(getTouch(e)); });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); moveAim(getTouch(e)); });
  canvas.addEventListener('touchend', e => { e.preventDefault(); endAim(aimStart ? {x:aimStart.x,y:aimStart.y} : {x:0,y:0}); });
  function startAim(p) { if (moving || gameOver) return; const cb = balls[0]; if (!cb.active) return; aiming = true; aimStart = p; zoomScale = 1; }
  function moveAim(p) {
    if (!aiming) return;
    const cb = balls[0], cx = w/2, cy = h/2;
    // Cue ball position on screen with current zoom
    const cbSX = cx + (cb.x - cx) * zoomScale, cbSY = cy + (cb.y - cy) * zoomScale;
    const sd = Math.sqrt((p.x - cbSX)**2 + (p.y - cbSY)**2);
    // Zoom out as drag distance grows (start at 70px, min zoom 0.5)
    const tgt = sd > 70 ? Math.max(0.5, 1 - (sd - 70) / 280) : 1;
    zoomScale += (tgt - zoomScale) * 0.25;
    // Inverse-transform touch position to game coords
    aimStart = {x: cx + (p.x - cx) / zoomScale, y: cy + (p.y - cy) / zoomScale};
  }
  function endAim(p) {
    if (!aiming) return; aiming = false;
    const cb = balls[0]; if (!cb.active) return;
    const dx = cb.x - aimStart.x, dy = cb.y - aimStart.y;
    const power = Math.min(Math.sqrt(dx*dx+dy*dy), 200);
    if (power < 5) return;
    const angle = Math.atan2(dy, dx);
    cb.vx = Math.cos(angle) * power * 0.08;
    cb.vy = Math.sin(angle) * power * 0.08;
    moving = true;
  }
  let raf, pocketed = [];
  function update() {
    if (moving) {
      let allStopped = true;
      for (const b of balls) {
        if (!b.active) continue;
        b.x += b.vx; b.y += b.vy;
        b.vx *= FRICTION; b.vy *= FRICTION;
        if (Math.abs(b.vx) + Math.abs(b.vy) < 0.05) { b.vx = b.vy = 0; } else allStopped = false;
        // Wall bounce
        if (b.x < TX+BR) { b.x = TX+BR; b.vx = Math.abs(b.vx); }
        if (b.x > TX+TW-BR) { b.x = TX+TW-BR; b.vx = -Math.abs(b.vx); }
        if (b.y < TY+BR) { b.y = TY+BR; b.vy = Math.abs(b.vy); }
        if (b.y > TY+TH-BR) { b.y = TY+TH-BR; b.vy = -Math.abs(b.vy); }
        // Pocket check
        for (const [px,py] of pockets) {
          if (Math.sqrt((b.x-px)**2+(b.y-py)**2) < PR) { b.active = false; pocketed.push(b.num); SND.drop(); break; }
        }
      }
      // Ball-ball collision
      for (let i = 0; i < balls.length; i++) for (let j = i+1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        if (!a.active || !b.active) continue;
        const dx = b.x-a.x, dy = b.y-a.y, d = Math.sqrt(dx*dx+dy*dy);
        if (d < BR*2 && d > 0) {
          const nx=dx/d, ny=dy/d;
          const dvn=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
          if (dvn > 0) {
            a.vx-=dvn*nx; a.vy-=dvn*ny; b.vx+=dvn*nx; b.vy+=dvn*ny; SND.clack();
            const ov=(BR*2-d)/2; a.x-=ov*nx; a.y-=ov*ny; b.x+=ov*nx; b.y+=ov*ny;
          }
        }
      }
      if (allStopped) {
        moving = false;
        // Handle pocketed balls
        let scored = false;
        const cuePocketed = pocketed.includes(0);
        const ballsPocketed = pocketed.filter(n => n > 0);
        // Assign types on first pocket
        if (!assigned[0] && ballsPocketed.length > 0) {
          const first = ballsPocketed[0];
          assigned[turn] = first <= 7 ? 'solid' : 'stripe';
          assigned[1-turn] = first <= 7 ? 'stripe' : 'solid';
        }
        // Check if scored own balls
        for (const n of ballsPocketed) {
          if ((assigned[turn]==='solid'&&n>=1&&n<=7)||(assigned[turn]==='stripe'&&n>=9&&n<=15)) scored = true;
        }
        // 8-ball check
        if (pocketed.includes(8)) {
          const myBalls = assigned[turn]==='solid'?balls.filter(b=>b.num>=1&&b.num<=7):balls.filter(b=>b.num>=9&&b.num<=15);
          const allMine = myBalls.every(b=>!b.active);
          gameOver = true;
          const m = allMine?`P${turn+1} wins!`:`P${turn+1} pocketed 8-ball early! P${2-turn} wins!`;
          setStatus(m); setTimeout(() => showOverlay(area, m), 600);
        }
        // Reset cue ball if pocketed
        if (cuePocketed) {
          const cb = balls[0]; cb.active = true; cb.x = TX+TW*0.25; cb.y = TY+TH/2; cb.vx = cb.vy = 0;
        }
        if (!gameOver) {
          if (!scored || cuePocketed) turn = 1 - turn;
          const types = assigned[0] ? `P1:${assigned[0]} P2:${assigned[1]}` : '';
          setStatus(`P${turn+1}'s shot ${types}`);
        }
        pocketed = [];
      }
    }
    // Smooth zoom back to 1 when not aiming
    if (!aiming && zoomScale < 1) zoomScale = Math.min(1, zoomScale + 0.03);
    draw();
    raf = requestAnimationFrame(update);
  }
  function draw() {
    ctx.fillStyle = '#0a1a0a'; ctx.fillRect(0, 0, w, h);
    ctx.save();
    if (zoomScale < 1) { const cx = w/2, cy = h/2; ctx.translate(cx,cy); ctx.scale(zoomScale,zoomScale); ctx.translate(-cx,-cy); }
    // Table
    ctx.fillStyle = '#1B5E20'; ctx.fillRect(TX, TY, TW, TH);
    ctx.strokeStyle = '#4E342E'; ctx.lineWidth = 6; ctx.strokeRect(TX-3, TY-3, TW+6, TH+6);
    // Pockets
    for (const [px,py] of pockets) { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(px,py,PR,0,Math.PI*2); ctx.fill(); }
    // Balls
    for (const b of balls) {
      if (!b.active) continue;
      ctx.fillStyle = COLORS[b.num];
      ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, Math.PI*2); ctx.fill();
      if (b.num >= 9 && b.num <= 15) { // stripe
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(b.x, b.y, BR*0.6, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = COLORS[b.num];
        ctx.beginPath(); ctx.arc(b.x, b.y, BR*0.35, 0, Math.PI*2); ctx.fill();
      }
      if (b.num > 0) {
        ctx.fillStyle = b.num===8?'#fff':'#000'; ctx.font = `${BR*0.9}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.num, b.x, b.y);
      }
    }
    // Aim glow + line
    if (aiming && aimStart && balls[0].active) {
      const cb = balls[0];
      // Glow around cue ball
      const grd = ctx.createRadialGradient(cb.x, cb.y, BR, cb.x, cb.y, BR*3);
      grd.addColorStop(0, 'rgba(255,255,100,0.45)'); grd.addColorStop(1, 'rgba(255,255,100,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(cb.x, cb.y, BR*3, 0, Math.PI*2); ctx.fill();
      // Aim line
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.setLineDash([4,4]);
      const dx = cb.x - aimStart.x, dy = cb.y - aimStart.y;
      ctx.beginPath(); ctx.moveTo(cb.x, cb.y); ctx.lineTo(cb.x+dx*2, cb.y+dy*2); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  setStatus("P1's shot");
  raf = requestAnimationFrame(update);
  return () => cancelAnimationFrame(raf);
}

// ==================== MINI GOLF ====================
function initMiniGolf(area, setStatus) {
  const {canvas, ctx, w, h} = createCanvas(area);
  const BR = 8, HR = 14, FRICTION = 0.98, POWER_MULT = 0.10;
  const holes = [
    {ball:{x:w/2,y:h*0.8},hole:{x:w/2,y:h*0.2},walls:[[w*0.2,0,w*0.2,h],[w*0.8,0,w*0.8,h]]},
    {ball:{x:w*0.3,y:h*0.85},hole:{x:w*0.7,y:h*0.15},walls:[[w*0.15,0,w*0.15,h*0.7],[w*0.85,h*0.3,w*0.85,h],[w*0.15,h*0.7,w*0.5,h*0.7],[w*0.5,h*0.3,w*0.85,h*0.3]]},
    {ball:{x:w/2,y:h*0.85},hole:{x:w/2,y:h*0.15},walls:[[w*0.2,0,w*0.2,h],[w*0.8,0,w*0.8,h],[w*0.35,h*0.4,w*0.65,h*0.4],[w*0.35,h*0.6,w*0.65,h*0.6]]}
  ];
  let holeIdx = 0, playerScores = [[],[]];
  let turn = 0, strokes = 0;
  let ball, hole, walls, bvx=0, bvy=0, moving=false, aiming=false, aimPt=null;
  function loadHole() {
    const hd = holes[holeIdx];
    ball = {...hd.ball}; hole = {...hd.hole}; walls = hd.walls;
    bvx = bvy = 0; moving = false; strokes = 0;
  }
  loadHole();
  function getP(e) { const r=canvas.getBoundingClientRect(),t=e.touches?e.touches[0]:e; return{x:(t.clientX-r.left)/r.width*w,y:(t.clientY-r.top)/r.height*h}; }
  canvas.addEventListener('mousedown',e=>{if(!moving&&!gameEnd)startAim(getP(e));});
  canvas.addEventListener('mousemove',e=>{if(aiming)aimPt=getP(e);});
  canvas.addEventListener('mouseup',e=>{if(aiming)shoot();});
  canvas.addEventListener('touchstart',e=>{e.preventDefault();if(!moving&&!gameEnd)startAim(getP(e));});
  canvas.addEventListener('touchmove',e=>{e.preventDefault();if(aiming)aimPt=getP(e);});
  canvas.addEventListener('touchend',e=>{e.preventDefault();if(aiming)shoot();});
  let gameEnd = false;
  function startAim(p) { aiming = true; aimPt = p; }
  function shoot() {
    if (!aiming || !aimPt) return;
    aiming = false;
    const dx = ball.x - aimPt.x, dy = ball.y - aimPt.y;
    const power = Math.min(Math.sqrt(dx*dx+dy*dy), 200);
    if (power < 3) return;
    bvx = dx/power * power * POWER_MULT; bvy = dy/power * power * POWER_MULT;
    moving = true; strokes++; SND.clack();
  }
  function checkWallBounce(bx, by, vx, vy) {
    // Boundary walls
    if (bx < BR) { bx = BR; vx = Math.abs(vx); }
    if (bx > w-BR) { bx = w-BR; vx = -Math.abs(vx); }
    if (by < BR) { by = BR; vy = Math.abs(vy); }
    if (by > h-BR) { by = h-BR; vy = -Math.abs(vy); }
    // Wall segments
    for (const [x1,y1,x2,y2] of walls) {
      const dx = x2-x1, dy = y2-y1, len = Math.sqrt(dx*dx+dy*dy);
      if (len === 0) continue;
      const nx = -dy/len, ny = dx/len;
      const dist = (bx-x1)*nx + (by-y1)*ny;
      if (Math.abs(dist) < BR + 2) {
        const t = ((bx-x1)*dx+(by-y1)*dy)/(len*len);
        if (t >= -0.05 && t <= 1.05) {
          const sign = dist >= 0 ? 1 : -1;
          bx += nx * (BR * sign - dist);
          by += ny * (BR * sign - dist);
          const dot = vx*nx + vy*ny;
          if ((sign > 0 && dot < 0) || (sign < 0 && dot > 0)) {
            vx -= 2*dot*nx; vy -= 2*dot*ny;
            vx *= 0.85; vy *= 0.85;
          }
        }
      }
    }
    return {x:bx, y:by, vx, vy};
  }
  let raf;
  function update() {
    if (moving) {
      // Substep collision to prevent tunneling
      const spd = Math.sqrt(bvx*bvx + bvy*bvy);
      const steps = Math.max(1, Math.ceil(spd / 3));
      const svx = bvx / steps, svy = bvy / steps;
      for (let s = 0; s < steps; s++) {
        ball.x += svx; ball.y += svy;
        const r = checkWallBounce(ball.x, ball.y, bvx, bvy);
        ball.x = r.x; ball.y = r.y; bvx = r.vx; bvy = r.vy;
      }
      bvx *= FRICTION; bvy *= FRICTION;
      // Hole check
      if (Math.sqrt((ball.x-hole.x)**2+(ball.y-hole.y)**2) < HR) {
        moving = false; SND.chime();
        playerScores[turn].push(strokes);
        if (turn === 1 && holeIdx < holes.length - 1) {
          holeIdx++; turn = 0; loadHole();
          setStatus(`Hole ${holeIdx+1} — P1's turn`);
        } else if (turn === 0) {
          const savedBall = {...holes[holeIdx].ball};
          turn = 1; strokes = 0; ball = savedBall; bvx = bvy = 0;
          setStatus(`Hole ${holeIdx+1} — P2's turn`);
        } else {
          gameEnd = true;
          const t1 = playerScores[0].reduce((a,b)=>a+b,0), t2 = playerScores[1].reduce((a,b)=>a+b,0);
          const m = t1<t2?'P1 wins!':t2<t1?'P2 wins!':'Draw!';
          setStatus(`P1: ${t1} strokes, P2: ${t2} — ${m}`);
          setTimeout(() => showOverlay(area, `${m}<br>P1: ${t1} | P2: ${t2} strokes`), 600);
        }
      }
      if (Math.abs(bvx)+Math.abs(bvy) < 0.1) { bvx=bvy=0; moving=false; }
    }
    draw();
    raf = requestAnimationFrame(update);
  }
  function draw() {
    ctx.fillStyle = '#1B5E20'; ctx.fillRect(0, 0, w, h);
    // Walls
    ctx.strokeStyle = '#4E342E'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const [x1,y1,x2,y2] of walls) { ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
    // Hole
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(hole.x, hole.y, HR, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hole.x, hole.y, HR, 0, Math.PI*2); ctx.stroke();
    // Ball
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, BR, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.arc(ball.x+1, ball.y+1, BR*0.6, 0, Math.PI*2); ctx.fill();
    // Aim
    if (aiming && aimPt) {
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2; ctx.setLineDash([4,4]);
      const dx=ball.x-aimPt.x, dy=ball.y-aimPt.y;
      ctx.beginPath(); ctx.moveTo(ball.x,ball.y); ctx.lineTo(ball.x+dx,ball.y+dy); ctx.stroke();
      ctx.setLineDash([]);
      // Power indicator
      const power = Math.min(Math.sqrt(dx*dx+dy*dy), 200);
      const pct = power / 200;
      const col = pct < 0.5 ? '#4CAF50' : pct < 0.8 ? '#FFC107' : '#F44336';
      ctx.fillStyle = col; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(Math.round(pct*100) + '%', ball.x, ball.y - BR - 8);
      ctx.textAlign = 'left';
    }
  }
  setStatus('Hole 1 — P1\'s turn');
  raf = requestAnimationFrame(update);
  return () => cancelAnimationFrame(raf);
}

// ==================== CARO (Gomoku Variant - 13x13) ====================
function initCaro(area, setStatus, online) {
  const SIZE = 13;
  const board = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  let turn = 1; // 1 = Black, 2 = White
  let gameOver = false;
  let winCells = null;

  const wrap = document.createElement('div');
  wrap.className = 'board-game';
  area.appendChild(wrap);

  const rect = area.getBoundingClientRect();
  const maxW = rect.width * 0.95;
  const maxH = rect.height * 0.82;
  const sz = Math.min(maxW, maxH);
  const cellSz = Math.floor(sz / SIZE);
  const gridSz = cellSz * SIZE;

  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${SIZE},1fr);width:${gridSz}px;height:${gridSz}px;background:#3a2a10;border-radius:10px;overflow:hidden;border:3px solid #7a5c2e;box-shadow:0 4px 24px rgba(0,0,0,0.5),inset 0 0 30px rgba(0,0,0,0.15)`;
  wrap.appendChild(grid);

  const cells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const cell = document.createElement('div');
    cell.style.cssText = `position:relative;aspect-ratio:1;background:#c8a24c;cursor:pointer;border:1px solid rgba(90,65,20,0.5)`;
    // Draw board lines via pseudo-style using inner div
    const inner = document.createElement('div');
    inner.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center';
    // Cross-hair lines
    const hLine = document.createElement('div');
    hLine.style.cssText = 'position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(60,40,10,0.6)';
    const vLine = document.createElement('div');
    vLine.style.cssText = 'position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(60,40,10,0.6)';
    inner.appendChild(hLine);
    inner.appendChild(vLine);
    cell.appendChild(inner);

    const stone = document.createElement('div');
    stone.style.cssText = 'position:absolute;inset:12%;border-radius:50%;transition:transform .1s,box-shadow .1s;z-index:1';
    cell.appendChild(stone);

    cell.onclick = () => {
      if (online && turn !== online.playerId + 1) return;
      execPlace(r, c);
      if (online) online.sendMove({r, c});
    };
    grid.appendChild(cell);
    cells.push({cell, stone, inner});
  }

  // Star points (center and 4 corners of the star area)
  const starPts = [[3,3],[3,9],[6,6],[9,3],[9,9]];
  for (const [sr,sc] of starPts) {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;width:7px;height:7px;border-radius:50%;background:rgba(40,25,5,0.8);top:50%;left:50%;transform:translate(-50%,-50%);z-index:1';
    cells[sr * SIZE + sc].inner.appendChild(dot);
  }

  setStatus(online ? (online.playerId === 0 ? "Your Turn (Black)" : "Opponent's Turn") : "Black's Turn");

  function execPlace(r, c) {
    if (gameOver || board[r][c]) return;
    board[r][c] = turn;
    SND.drop();

    const stone = cells[r * SIZE + c].stone;
    if (turn === 1) {
      stone.style.background = 'radial-gradient(circle at 35% 35%, #555, #111)';
      stone.style.boxShadow = '0 2px 6px rgba(0,0,0,0.6)';
    } else {
      stone.style.background = 'radial-gradient(circle at 35% 35%, #fff, #ccc)';
      stone.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    }
    stone.style.transform = 'scale(1)';

    const win = checkWin(r, c, turn);
    if (win) {
      gameOver = true;
      winCells = win;
      SND.win();
      // Highlight winning stones
      for (const [wr, wc] of win) {
        cells[wr * SIZE + wc].stone.style.boxShadow = '0 0 12px 4px #FFD700';
      }
      const label = online ? (turn === online.playerId + 1 ? 'You Win!' : 'You Lose!') : (turn === 1 ? 'Black' : 'White') + ' Wins!';
      setStatus(label);
      setTimeout(() => showOverlay(area, label, 'Restart', restart), 600);
      return;
    }

    // Check draw
    let filled = 0;
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++) if (board[i][j]) filled++;
    if (filled === SIZE * SIZE) {
      gameOver = true;
      SND.buzz();
      setStatus('Draw!');
      setTimeout(() => showOverlay(area, 'Draw!', 'Restart', restart), 600);
      return;
    }

    turn = 3 - turn;
    setStatus(online ? (turn === online.playerId + 1 ? 'Your Turn' : "Opponent's Turn") : (turn === 1 ? "Black's Turn" : "White's Turn"));
  }
  if (online) {
    online.listenMoves(data => execPlace(data.r, data.c));
    online.onOpponentDisconnect(() => { if (!gameOver) { gameOver = true; setStatus('Opponent disconnected'); } });
  }

  function checkWin(r, c, player) {
    const dirs = [[0,1],[1,0],[1,1],[1,-1]]; // horizontal, vertical, diag, anti-diag
    for (const [dr, dc] of dirs) {
      // Collect all consecutive stones in this direction
      const line = [[r, c]];
      // Forward
      for (let d = 1; d < SIZE; d++) {
        const nr = r + dr * d, nc = c + dc * d;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || board[nr][nc] !== player) break;
        line.push([nr, nc]);
      }
      // Backward
      for (let d = 1; d < SIZE; d++) {
        const nr = r - dr * d, nc = c - dc * d;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || board[nr][nc] !== player) break;
        line.unshift([nr, nc]);
      }

      // Must be EXACTLY 5 (no overlines)
      if (line.length !== 5) continue;

      // Caro rule: check both ends
      const [sr, sc] = line[0];
      const [er, ec] = line[4];
      const beforeR = sr - dr, beforeC = sc - dc;
      const afterR = er + dr, afterC = ec + dc;

      const opponent = 3 - player;
      const beforeBlocked = (beforeR < 0 || beforeR >= SIZE || beforeC < 0 || beforeC >= SIZE)
        ? false // wall counts as one block but not opponent block
        : board[beforeR][beforeC] === opponent;
      const afterBlocked = (afterR < 0 || afterR >= SIZE || afterC < 0 || afterC >= SIZE)
        ? false
        : board[afterR][afterC] === opponent;

      // Blocked by opponent on BOTH ends => no win
      if (beforeBlocked && afterBlocked) continue;

      // Check if wall+opponent combo
      const beforeIsWall = beforeR < 0 || beforeR >= SIZE || beforeC < 0 || beforeC >= SIZE;
      const afterIsWall = afterR < 0 || afterR >= SIZE || afterC < 0 || afterC >= SIZE;

      if ((beforeIsWall && afterBlocked) || (afterIsWall && beforeBlocked)) continue;

      return line;
    }
    return null;
  }

  function restart() {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      board[r][c] = 0;
      cells[r * SIZE + c].stone.style.background = 'none';
      cells[r * SIZE + c].stone.style.boxShadow = 'none';
      cells[r * SIZE + c].stone.style.transform = 'scale(0)';
    }
    turn = 1;
    gameOver = false;
    winCells = null;
    setStatus(online ? (online.playerId === 0 ? "Your Turn (Black)" : "Opponent's Turn") : "Black's Turn");
  }

  return () => { if (online) online.cleanup(); };
}

// ==================== WHEEL OF FORTUNE (Hangman) ====================
function initHangman(area, setStatus) {
  const WORDS = [
    'ELEPHANT','COMPUTER','BIRTHDAY','SANDWICH','MOUNTAIN','TREASURE','DINOSAUR','ELEPHANT',
    'FOOTBALL','HOSPITAL','KEYBOARD','UMBRELLA','VACATION','BATHROOM','CHAMPION','CROCODILE',
    'DARKNESS','EXERCISE','FIREWORK','GOLDFISH','HARDWARE','INTERNET','JAPANESE','KANGAROO',
    'LANGUAGE','MIDNIGHT','NOTEBOOK','OPERATOR','PAINTING','QUESTION','RECEIVER','SKELETON',
    'THINKING','UNIVERSE','VALUABLE','WITHDRAW','YOURSELF','BUILDING','CALENDAR','DECEMBER',
    'EUROPEAN','FINISHED','GRATEFUL','HYDROGEN','INTEGRAL','JUDGMENT','KILOWATT','LIFETIME'
  ];
  const WORDS_FR = [
    'AVENTURE','BATIMENT','BONHEUR','BOUTEILLE','CAMPING','CHAPELLE','CHOCOLAT','CINEMAS',
    'COMBINER','COSTUMER','DANSEUSE','DOMICILE','ELEPHANT','ESCALIER','FABRIQUE','FANTOME',
    'FOOTBALL','FROMAGER','GARDERIE','GUITARES','HABITANT','HISTOIRES','HUMORISTE','IMAGINER',
    'JARDINER','KEYBOARD','LANTERNE','LIMONADES','MAGAZINE','MERVEILLE','NOISETTES','OBSTACLE',
    'PARADOXE','PLASTIQUE','QUELQUES','REFLEXION','SANDWICH','SURPRISE','TANGIBLE','TEMOIGNER',
    'UNIVERSEL','VAISSELLE','VICTOIRE','VOITURES','XYLOPHONE','ZOOLOGIE','DIALOGUE','MYSTIQUE'
  ];
  const isFrHm = navigator.language.startsWith('fr');
  const wordList = isFrHm ? WORDS_FR : WORDS;
  const SEGMENTS = [100,200,300,400,500,600,700,800,900,1000,300,500,200,400,600,800,0,0]; // 0 = lose turn
  const SEG_COLORS = ['#E53935','#1E88E5','#43A047','#FDD835','#8E24AA','#FF6F00','#00ACC1','#D81B60','#7CB342','#FF5722','#5C6BC0','#26A69A','#F4511E','#AB47BC','#42A5F5','#66BB6A','#424242','#757575'];

  let word = wordList[Math.floor(Math.random() * wordList.length)];
  let revealed = Array(word.length).fill(false);
  let guessed = new Set();
  let scores = [0, 0], turn = 0, spinResult = -1, phase = 'spin', gameOver = false;
  let wheelAngle = 0, wheelSpeed = 0, spinning = false;
  let wrongCount = [0, 0];

  const wrap = document.createElement('div');
  wrap.className = 'board-game';
  wrap.style.overflow = 'auto';
  area.appendChild(wrap);
  const cont = document.createElement('div');
  cont.style.cssText = 'width:min(95vw,420px)';
  wrap.appendChild(cont);

  function sfxTick() { SND.spinTick(); }
  function sfxWin() { SND.chime(); }
  function sfxBuzz() { SND.buzz(); }

  function render() {
    let h = '';
    // Scores
    h += `<div style="display:flex;justify-content:space-around;margin:6px 0;font-size:1em">`;
    h += `<div style="font-size:${turn===0?'1.3em':'0.9em'};color:${turn===0?'#FF6B6B':'#666'};font-weight:${turn===0?'bold':'normal'};${turn===0?'text-shadow:0 0 8px rgba(255,107,107,0.6),0 0 18px rgba(255,107,107,0.3)':'opacity:0.5'};transition:all 0.3s">P1: $${scores[0]}</div>`;
    h += `<div style="font-size:${turn===1?'1.3em':'0.9em'};color:${turn===1?'#64B5F6':'#666'};font-weight:${turn===1?'bold':'normal'};${turn===1?'text-shadow:0 0 8px rgba(100,181,246,0.6),0 0 18px rgba(100,181,246,0.3)':'opacity:0.5'};transition:all 0.3s">P2: $${scores[1]}</div>`;
    h += `</div>`;

    // Word display
    h += `<div style="display:flex;justify-content:center;gap:6px;margin:10px 0;flex-wrap:wrap">`;
    for (let i = 0; i < word.length; i++) {
      h += `<div style="width:32px;height:40px;border-bottom:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:1.4em;font-weight:bold;color:#FFD54F">`;
      h += revealed[i] ? word[i] : '';
      h += `</div>`;
    }
    h += `</div>`;

    // Hangman drawing
    h += `<div style="display:flex;justify-content:center;margin:6px 0">`;
    h += `<svg width="100" height="90" viewBox="0 0 100 90">`;
    const total = wrongCount[0] + wrongCount[1];
    h += `<line x1="15" y1="85" x2="50" y2="85" stroke="#fff" stroke-width="2"/>`;
    h += `<line x1="30" y1="85" x2="30" y2="10" stroke="#fff" stroke-width="2"/>`;
    h += `<line x1="30" y1="10" x2="65" y2="10" stroke="#fff" stroke-width="2"/>`;
    h += `<line x1="65" y1="10" x2="65" y2="20" stroke="#fff" stroke-width="2"/>`;
    if (total >= 1) h += `<circle cx="65" cy="28" r="8" stroke="#fff" fill="none" stroke-width="2"/>`;
    if (total >= 2) h += `<line x1="65" y1="36" x2="65" y2="58" stroke="#fff" stroke-width="2"/>`;
    if (total >= 3) h += `<line x1="65" y1="42" x2="52" y2="50" stroke="#fff" stroke-width="2"/>`;
    if (total >= 4) h += `<line x1="65" y1="42" x2="78" y2="50" stroke="#fff" stroke-width="2"/>`;
    if (total >= 5) h += `<line x1="65" y1="58" x2="52" y2="72" stroke="#fff" stroke-width="2"/>`;
    if (total >= 6) h += `<line x1="65" y1="58" x2="78" y2="72" stroke="#fff" stroke-width="2"/>`;
    h += `</svg></div>`;

    // Wheel result / spin button
    if (phase === 'spin' && !gameOver) {
      h += `<div style="text-align:center;margin:8px"><button class="btn" id="wof-spin" style="font-size:1.1em;padding:10px 28px;background:${turn===0?'#C62828':'#1565C0'}">🎡 P${turn+1} Spin!</button></div>`;
    } else if (phase === 'spinning') {
      h += `<div style="text-align:center;margin:8px;font-size:1.2em;color:#FFD54F">Spinning...</div>`;
    } else if (phase === 'guess' && !gameOver) {
      const val = SEGMENTS[spinResult];
      if (val === 0) {
        h += `<div style="text-align:center;margin:6px;color:#F44336;font-weight:bold">LOSE A TURN!</div>`;
      } else {
        h += `<div style="text-align:center;margin:6px;color:#FFD54F;font-weight:bold">$${val} per letter — Pick a letter!</div>`;
      }
    }

    // Letter grid
    if (phase === 'guess' && !gameOver) {
      h += `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin:6px 0">`;
      for (let c = 65; c <= 90; c++) {
        const letter = String.fromCharCode(c);
        const used = guessed.has(letter);
        h += `<div data-letter="${letter}" style="width:30px;height:34px;border-radius:6px;background:${used?'#333':'#2a2a4a'};display:flex;align-items:center;justify-content:center;font-size:.9em;font-weight:bold;cursor:${used?'default':'pointer'};color:${used?'#555':'#fff'}">${letter}</div>`;
      }
      h += `</div>`;
    }

    // Guessed letters
    if (guessed.size > 0) {
      h += `<div style="text-align:center;margin:4px 0;font-size:.75em;color:#666">Used: ${[...guessed].join(' ')}</div>`;
    }

    cont.innerHTML = h;

    // Bind events
    const spinBtn = cont.querySelector('#wof-spin');
    if (spinBtn) spinBtn.onclick = spinWheel;
    cont.querySelectorAll('[data-letter]').forEach(el => {
      el.onclick = () => {
        const letter = el.dataset.letter;
        if (!guessed.has(letter) && phase === 'guess') guessLetter(letter);
      };
    });

    if (!gameOver) setStatus(`P${turn+1}'s turn | P1:$${scores[0]} P2:$${scores[1]}`);
  }

  function spinWheel() {
    phase = 'spinning';
    wheelSpeed = 10 + Math.random() * 15;
    spinning = true;
    render();
    animateSpin();
  }

  function animateSpin() {
    if (!spinning) return;
    wheelAngle += wheelSpeed;
    wheelSpeed *= 0.97;
    if (wheelSpeed > 2 && Math.random() < 0.3) sfxTick();
    if (wheelSpeed < 0.3) {
      spinning = false;
      spinResult = Math.floor((wheelAngle % 360) / (360 / SEGMENTS.length)) % SEGMENTS.length;
      const val = SEGMENTS[spinResult];
      if (val === 0) {
        phase = 'guess';
        sfxBuzz();
        render();
        setTimeout(() => { turn = 1 - turn; phase = 'spin'; render(); }, 1200);
      } else {
        phase = 'guess';
        render();
      }
      return;
    }
    render();
    requestAnimationFrame(animateSpin);
  }

  function guessLetter(letter) {
    guessed.add(letter);
    const val = SEGMENTS[spinResult];
    let found = 0;
    for (let i = 0; i < word.length; i++) {
      if (word[i] === letter && !revealed[i]) { revealed[i] = true; found++; }
    }
    if (found > 0) {
      scores[turn] += val * found;
      sfxWin();
      // Check win
      if (revealed.every(v => v)) {
        gameOver = true;
        setStatus(`P${turn+1} solved it! P1:$${scores[0]} P2:$${scores[1]}`);
        render();
        setTimeout(() => {
          const winner = scores[0] > scores[1] ? 'P1' : scores[1] > scores[0] ? 'P2' : 'Tie';
          showOverlay(area, `Word: ${word}<br>${winner === 'Tie' ? "It's a tie!" : winner + ' wins!'}`, 'New Game', () => {
            word = wordList[Math.floor(Math.random() * wordList.length)];
            revealed = Array(word.length).fill(false);
            guessed = new Set(); scores = [0, 0]; turn = 0; wrongCount = [0, 0];
            phase = 'spin'; gameOver = false; render();
          });
        }, 800);
        return;
      }
      phase = 'spin'; render(); // Same player spins again
    } else {
      wrongCount[turn]++;
      sfxBuzz();
      if (wrongCount[0] + wrongCount[1] >= 6) {
        gameOver = true;
        setStatus(`Hanged! Word was: ${word}`);
        render();
        setTimeout(() => {
          showOverlay(area, `Word was: ${word}<br>P1:$${scores[0]} P2:$${scores[1]}`, 'New Game', () => {
            word = wordList[Math.floor(Math.random() * wordList.length)];
            revealed = Array(word.length).fill(false);
            guessed = new Set(); scores = [0, 0]; turn = 0; wrongCount = [0, 0];
            phase = 'spin'; gameOver = false; render();
          });
        }, 800);
        return;
      }
      turn = 1 - turn; phase = 'spin'; render();
    }
  }

  render();
  setStatus("P1's turn — Spin the wheel!");
  return () => {};
}

// ==================== HORSE JUMP (Equine Edge) ====================
function initHorseJump(area, setStatus) {
  const {canvas, ctx, w, h} = createCanvas(area);
  const HALF = h / 2, DIVIDER = 3;
  const GRAVITY = 0.5, JUMP_V0 = -10.2;
  const HORSE_W = 62, HORSE_H = 42;
  const HURDLE_W = 18, HURDLE_H = 40;
  const GROUND_OFFSET = 55;

  function makeLane(yBase) {
    return { groundY: yBase - GROUND_OFFSET, horseX: w * 0.22, horseY: 0, vy: 0, jumping: false, alive: true, legPhase: 0, hurdles: [] };
  }
  let lane1 = makeLane(HALF), lane2 = makeLane(h);
  let speed = 3.5, score = 0, gameOver = false, started = false;
  let shakeAmount = 0, shakeTimer = 0, dustParticles = [], frameCount = 0;

  function spawnHurdle(lane, x) { lane.hurdles.push({ x }); }
  spawnHurdle(lane1, w + 200); spawnHurdle(lane2, w + 200);

  function scheduleNextHurdle() {
    const minGap = Math.max(160, 320 - score * 5);
    const maxGap = Math.max(220, 450 - score * 4);
    return minGap + Math.random() * (maxGap - minGap);
  }

  function jump(lane) {
    if (!lane.alive || lane.jumping) return;
    lane.vy = JUMP_V0; lane.jumping = true; SND.gallop();
  }

  // --- INPUT: Touch + Keyboard ---
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (gameOver) return;
    if (!started) started = true;
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const y = (t.clientY - rect.top) / rect.height * h;
      if (y < HALF) jump(lane1); else jump(lane2);
    }
  });
  canvas.addEventListener('mousedown', e => {
    if (gameOver) return;
    if (!started) started = true;
    const rect = canvas.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height * h;
    if (y < HALF) jump(lane1); else jump(lane2);
  });
  const P1_KEYS = new Set(['q','w','e','a','s','d','z','x','c','1','2','3','Tab',' ','ShiftLeft','ControlLeft']);
  const P2_KEYS = new Set(['p','o','i','l','k','j','m','0','9','8','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftRight','ControlRight','Backspace']);
  function onKey(e) {
    if (gameOver) return;
    if (!started) started = true;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const code = e.code;
    if (P1_KEYS.has(k) || P1_KEYS.has(code)) { e.preventDefault(); jump(lane1); }
    if (P2_KEYS.has(k) || P2_KEYS.has(code)) { e.preventDefault(); jump(lane2); }
  }
  document.addEventListener('keydown', onKey);

  // --- DRAW HORSE: clean vector style with jockey ---
  function drawHorse(x, groundY, offsetY, bodyCol, darkCol, jockeyCol, legPhase) {
    const by = groundY + offsetY;
    const air = offsetY < -3;
    const bob = air ? 0 : Math.sin(legPhase * 2) * 1.5;
    ctx.save();
    ctx.translate(x, by + bob);

    // Shadow on ground (only when airborne)
    if (air) {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(0, -offsetY - bob, 24 + offsetY * 0.1, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // -- Back legs (behind body) --
    ctx.strokeStyle = darkCol; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const ph = legPhase + Math.PI + i * 0.5;
      const hx = -14 - i * 3, hy = -6;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      if (air) { ctx.lineTo(hx - 6, hy - 10); ctx.lineTo(hx - 10, hy - 18); }
      else { const sw = Math.sin(ph); ctx.lineTo(hx + sw * 7, hy + 12); ctx.lineTo(hx + sw * 13, hy + 22 + Math.min(0, Math.cos(ph)) * 3); }
      ctx.stroke();
    }

    // -- Tail --
    ctx.strokeStyle = darkCol; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    const tw = Math.sin(legPhase * 0.7) * 6;
    ctx.beginPath();
    ctx.moveTo(-24, -16);
    ctx.bezierCurveTo(-32 + tw, -10, -40 + tw, -4, -36 + tw, 6);
    ctx.stroke();
    // Second tail strand
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-23, -14);
    ctx.bezierCurveTo(-30 + tw, -8, -38 + tw, 0, -33 + tw, 8);
    ctx.stroke();

    // -- Body --
    ctx.fillStyle = bodyCol; ctx.strokeStyle = darkCol; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, -16, 26, 13, -0.03, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // -- Front legs (in front of body) --
    ctx.strokeStyle = darkCol; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const ph = legPhase + i * 0.5;
      const hx = 14 - i * 3, hy = -6;
      ctx.beginPath(); ctx.moveTo(hx, hy);
      if (air) { ctx.lineTo(hx + 8, hy - 10); ctx.lineTo(hx + 14, hy - 18); }
      else { const sw = Math.sin(ph); ctx.lineTo(hx + sw * 7, hy + 12); ctx.lineTo(hx + sw * 13, hy + 22 + Math.min(0, Math.cos(ph)) * 3); }
      ctx.stroke();
    }

    // -- Neck + Head (single filled path) --
    ctx.fillStyle = bodyCol; ctx.strokeStyle = darkCol; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(16, -24);
    ctx.quadraticCurveTo(20, -36, 24, -44);
    ctx.quadraticCurveTo(27, -52, 34, -52);
    ctx.quadraticCurveTo(42, -52, 44, -46);
    ctx.quadraticCurveTo(44, -40, 36, -40);
    ctx.quadraticCurveTo(30, -34, 24, -18);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // -- Ear --
    ctx.fillStyle = bodyCol; ctx.strokeStyle = darkCol; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(27, -50); ctx.lineTo(24, -58); ctx.lineTo(30, -52);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // -- Eye --
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(36, -48, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(36.5, -47.8, 1.5, 0, Math.PI * 2); ctx.fill();

    // -- Nostril --
    ctx.fillStyle = darkCol;
    ctx.beginPath(); ctx.arc(42, -44, 1.3, 0, Math.PI * 2); ctx.fill();

    // -- Mane (flowing along neck) --
    ctx.strokeStyle = darkCol; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const mx = 18 + t * 10, my = -28 - t * 16;
      const wave = Math.sin(legPhase * 1.2 + i * 0.9) * 4;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.quadraticCurveTo(mx - 5 + wave, my + 3, mx - 10 + wave, my + 10);
      ctx.stroke();
    }

    // -- Jockey --
    const jx = 0, jy = -30;
    const lean = air ? -0.2 : Math.sin(legPhase * 2) * 0.05;
    ctx.save(); ctx.translate(jx, jy); ctx.rotate(lean);
    // Jockey torso
    ctx.fillStyle = jockeyCol;
    ctx.beginPath();
    ctx.roundRect(-5, -9, 10, 12, 2);
    ctx.fill();
    // Arms (holding reins)
    ctx.strokeStyle = jockeyCol; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(14, -8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(-8, 2); ctx.stroke();
    // Helmet
    ctx.fillStyle = jockeyCol;
    ctx.beginPath(); ctx.arc(0, -13, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = darkCol;
    ctx.beginPath(); ctx.arc(0, -13, 6, -0.3, 0.8); ctx.lineTo(0, -13); ctx.fill(); // visor
    // Boots (visible when legs are not overlapping body)
    ctx.fillStyle = '#222';
    ctx.fillRect(-3, 3, 3, 5);
    ctx.fillRect(2, 3, 3, 5);
    ctx.restore();

    ctx.restore();
  }

  function drawHurdle(x, groundY) {
    const poleH = HURDLE_H, barW = HURDLE_W + 8;
    const topY = groundY - poleH;
    // Poles
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1;
    ctx.fillRect(x - barW/2 + 2, topY, 5, poleH);
    ctx.strokeRect(x - barW/2 + 2, topY, 5, poleH);
    ctx.fillRect(x + barW/2 - 7, topY, 5, poleH);
    ctx.strokeRect(x + barW/2 - 7, topY, 5, poleH);
    // Pole caps
    ctx.fillStyle = '#E53935';
    ctx.beginPath(); ctx.arc(x - barW/2 + 4.5, topY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + barW/2 - 4.5, topY, 4, 0, Math.PI * 2); ctx.fill();
    // Horizontal bars (red/white)
    for (let i = 0; i < 3; i++) {
      const barY = topY + 4 + i * ((poleH - 8) / 2);
      ctx.fillStyle = i % 2 === 0 ? '#E53935' : '#fff';
      ctx.strokeStyle = '#bbb'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.roundRect(x - barW/2, barY, barW, 5, 2); ctx.fill(); ctx.stroke();
    }
  }

  function drawLane(lane, yStart, yEnd) {
    const laneH = yEnd - yStart;
    const grad = ctx.createLinearGradient(0, yStart, 0, yEnd);
    grad.addColorStop(0, '#6CB4EE');
    grad.addColorStop(0.55, '#A8D8EA');
    grad.addColorStop(0.55, '#5D8C3C');
    grad.addColorStop(0.75, '#4A7A2E');
    grad.addColorStop(1, '#3D6B24');
    ctx.fillStyle = grad;
    ctx.fillRect(0, yStart, w, laneH);
    // Grass texture lines
    ctx.strokeStyle = '#4E8B30'; ctx.lineWidth = 1;
    const grassOff = (frameCount * speed * 0.5) % 30;
    for (let gx = -grassOff; gx < w + 30; gx += 30) {
      const gy = lane.groundY + 4;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx - 4, gy + 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx + 10, gy + 2); ctx.lineTo(gx + 7, gy + 10); ctx.stroke();
    }
    // Ground line
    ctx.strokeStyle = '#3D6B24'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, lane.groundY); ctx.lineTo(w, lane.groundY); ctx.stroke();
    // Scrolling fence
    const fenceY = lane.groundY - HURDLE_H * 1.4;
    ctx.strokeStyle = 'rgba(139,115,85,0.4)'; ctx.lineWidth = 1.5;
    const fenceSpacing = 60, fenceOff = (frameCount * speed * 0.3) % fenceSpacing;
    for (let fx = -fenceOff; fx < w + fenceSpacing; fx += fenceSpacing) {
      ctx.beginPath(); ctx.moveTo(fx, fenceY); ctx.lineTo(fx, fenceY + 18); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, fenceY + 3); ctx.lineTo(w, fenceY + 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, fenceY + 12); ctx.lineTo(w, fenceY + 12); ctx.stroke();
  }

  function spawnDust(lane) {
    if (lane.horseY >= -1 && !lane.jumping && Math.random() < 0.35) {
      dustParticles.push({
        x: lane.horseX - 20 + Math.random() * 10,
        y: lane.groundY - Math.random() * 3,
        vx: -speed * 0.4 - Math.random() * 1.5,
        vy: -Math.random() * 1.2 - 0.3,
        life: 1, laneGround: lane.groundY,
      });
    }
  }

  let raf;
  function update() {
    frameCount++;
    if (!started) { draw(); raf = requestAnimationFrame(update); return; }
    if (gameOver) { draw(); return; }

    speed = 3.5 + score * 0.15;

    let p1hit = false, p2hit = false;
    for (const [idx, lane] of [[0, lane1], [1, lane2]]) {
      if (!lane.alive) continue;
      if (lane.jumping) {
        lane.vy += GRAVITY;
        lane.horseY += lane.vy;
        if (lane.horseY >= 0) { lane.horseY = 0; lane.vy = 0; lane.jumping = false; }
      }
      if (lane.horseY >= -1) lane.legPhase += speed * 0.08;
      for (const hurdle of lane.hurdles) hurdle.x -= speed;
      lane.hurdles = lane.hurdles.filter(h => h.x > -50);

      // COLLISION: tighter hitbox — body only, not legs
      for (const hurdle of lane.hurdles) {
        const hLeft = hurdle.x - HURDLE_W / 2;
        const hRight = hurdle.x + HURDLE_W / 2;
        const hTop = lane.groundY - HURDLE_H + 6; // top bar area only
        const horseLeft = lane.horseX - HORSE_W * 0.3;
        const horseRight = lane.horseX + HORSE_W * 0.3;
        const horseBottom = lane.groundY + lane.horseY - 6; // body bottom, above legs
        if (horseRight > hLeft && horseLeft < hRight && horseBottom > hTop) {
          lane.alive = false; SND.buzz();
          if (idx === 0) p1hit = true; else p2hit = true;
        }
      }
      spawnDust(lane);
    }

    // Spawn hurdles synced for both lanes
    const last1 = lane1.hurdles.length > 0 ? lane1.hurdles[lane1.hurdles.length - 1].x : -100;
    const last2 = lane2.hurdles.length > 0 ? lane2.hurdles[lane2.hurdles.length - 1].x : -100;
    if (last1 < w - 50 && last2 < w - 50) {
      const gap = scheduleNextHurdle();
      const spawnX = Math.max(last1, last2) + gap;
      if (lane1.alive) spawnHurdle(lane1, spawnX);
      if (lane2.alive) spawnHurdle(lane2, spawnX);
    }

    let passed = 0;
    for (const h of lane1.hurdles) if (h.x < lane1.horseX - HORSE_W && !h.counted) { h.counted = true; passed++; }
    for (const h of lane2.hurdles) if (h.x < lane2.horseX - HORSE_W && !h.counted) { h.counted = true; }
    score += passed;

    if (score > 0 && score % 10 === 0 && shakeTimer <= 0) { shakeAmount = Math.min(3 + score * 0.05, 8); shakeTimer = 15; }
    if (shakeTimer > 0) { shakeTimer--; if (shakeTimer <= 0) shakeAmount = 0; }

    dustParticles = dustParticles.filter(p => { p.x += p.vx; p.y += p.vy; p.life -= 0.025; return p.life > 0; });

    if (p1hit || p2hit) {
      gameOver = true;
      const msg = (p1hit && p2hit) ? 'Dead Heat!' : p1hit ? 'P2 Wins!' : 'P1 Wins!';
      setStatus(`${msg} Score: ${score}`);
      draw();
      setTimeout(() => {
        showOverlay(area, `${msg}<br>Hurdles cleared: ${score}`, 'Rematch', () => {
          lane1 = makeLane(HALF); lane2 = makeLane(h);
          speed = 3.5; score = 0; gameOver = false; started = false;
          frameCount = 0; dustParticles = []; shakeAmount = 0; shakeTimer = 0;
          spawnHurdle(lane1, w + 200); spawnHurdle(lane2, w + 200);
          setStatus('Tap to start!');
          raf = requestAnimationFrame(update);
        });
      }, 600);
      return;
    }

    setStatus(`Hurdles: ${score}`);
    draw();
    raf = requestAnimationFrame(update);
  }

  function draw() {
    ctx.save();
    if (shakeAmount > 0) ctx.translate((Math.random() - 0.5) * shakeAmount * 2, (Math.random() - 0.5) * shakeAmount * 2);
    const weather = Math.min(score / 50, 1);

    // --- P1 lane (top) ---
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, HALF - DIVIDER/2); ctx.clip();
    drawLane(lane1, 0, HALF);
    for (const hurdle of lane1.hurdles) drawHurdle(hurdle.x, lane1.groundY);
    if (lane1.alive) {
      drawHorse(lane1.horseX, lane1.groundY, lane1.horseY, '#F5F0E8', '#B8A88A', '#E53935', lane1.legPhase);
    } else {
      ctx.save(); ctx.translate(lane1.horseX, lane1.groundY); ctx.rotate(0.4);
      drawHorse(0, 0, 0, '#F5F0E8', '#B8A88A', '#E53935', 0);
      ctx.restore();
    }
    for (const p of dustParticles) {
      if (Math.abs(p.laneGround - lane1.groundY) < 10) {
        ctx.fillStyle = `rgba(180,165,120,${p.life * 0.6})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2 + (1 - p.life) * 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (weather > 0.3) {
      ctx.fillStyle = `rgba(150,140,100,${(weather - 0.3) * 0.1})`; ctx.fillRect(0, 0, w, HALF);
      ctx.strokeStyle = `rgba(160,150,110,${(weather - 0.3) * 0.15})`; ctx.lineWidth = 1;
      for (let i = 0; i < 8 * weather; i++) {
        const sx = ((frameCount * 7 + i * 137) % (w + 100)) - 50, sy = (i * 89 + frameCount * 2) % HALF;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 30, sy + 8); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('P1 (left keys)', 6, 18);
    ctx.restore();

    // --- P2 lane (bottom) ---
    ctx.save();
    ctx.beginPath(); ctx.rect(0, HALF + DIVIDER/2, w, HALF); ctx.clip();
    drawLane(lane2, HALF, h);
    for (const hurdle of lane2.hurdles) drawHurdle(hurdle.x, lane2.groundY);
    if (lane2.alive) {
      drawHorse(lane2.horseX, lane2.groundY, lane2.horseY, '#8B5E3C', '#4A2E14', '#1E88E5', lane2.legPhase);
    } else {
      ctx.save(); ctx.translate(lane2.horseX, lane2.groundY); ctx.rotate(0.4);
      drawHorse(0, 0, 0, '#8B5E3C', '#4A2E14', '#1E88E5', 0);
      ctx.restore();
    }
    for (const p of dustParticles) {
      if (Math.abs(p.laneGround - lane2.groundY) < 10) {
        ctx.fillStyle = `rgba(180,165,120,${p.life * 0.6})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2 + (1 - p.life) * 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (weather > 0.3) {
      ctx.fillStyle = `rgba(150,140,100,${(weather - 0.3) * 0.1})`; ctx.fillRect(0, HALF, w, HALF);
      ctx.strokeStyle = `rgba(160,150,110,${(weather - 0.3) * 0.15})`; ctx.lineWidth = 1;
      for (let i = 0; i < 8 * weather; i++) {
        const sx = ((frameCount * 7 + i * 137) % (w + 100)) - 50, sy = HALF + ((i * 89 + frameCount * 2) % HALF);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 30, sy + 8); ctx.stroke();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = 'bold 13px sans-serif'; ctx.fillText('P2 (right keys)', 6, HALF + DIVIDER/2 + 18);
    ctx.restore();

    // --- Divider + score ---
    ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, HALF - DIVIDER * 2, w, DIVIDER * 4);
    ctx.fillStyle = '#FFD54F'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`🏇 ${score}`, w / 2, HALF);
    ctx.textAlign = 'left';

    if (!started && !gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('EQUINE EDGE', w / 2, HALF - 40);
      ctx.font = '15px sans-serif';
      ctx.fillText('Tap your half or press your keys to jump', w / 2, HALF - 12);
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#aaa';
      ctx.fillText('P1: left-side keys (Q/W/A/S/Space)', w / 2, HALF + 14);
      ctx.fillText('P2: right-side keys (P/O/L/K/Enter/↑)', w / 2, HALF + 34);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  setStatus('Tap to start!');
  raf = requestAnimationFrame(update);
  return () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey); };
}
