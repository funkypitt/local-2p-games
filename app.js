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
  duckchess: 'Duck-Day Chess — asymmetric chess variant with two chaotic ducks! Standard FIDE rules apply, but after each move you place the Yellow Duck (blocks all pieces). A Red Duck teleports randomly and fires a laser every 5 moves, vaporizing an adjacent piece. Kings are immune to the laser for the first 25 moves — after that, the Red Duck can vaporize Kings too! Checkmate to win!',
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
  {id:'duckchess',name:'Duck-Day Chess',icon:'🦆',color:'#B71C1C',init:initDuckChess,online:true},
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

// ==================== DUCK-DAY CHESS ====================
function initDuckChess(area, setStatus, online) {
  const SYMS = {wK:'♔',wQ:'♕',wR:'♖',wB:'♗',wN:'♘',wP:'♙',bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟'};
  const PN = {K:'King',Q:'Queen',R:'Rook',B:'Bishop',N:'Knight',P:'Pawn'};
  const FL = 'abcdefgh', RK = '87654321';

  let board, turn, phase, sel, legal, moveNum, yd, rd;
  let castleR, ep, log, promoting, gameOver, lastMv;
  let laserPh, laserSrc, laserTgt, animTmr;
  const flipped = online && online.playerId === 1;
  const rng = online ? online.rng : () => Math.random();

  function restart() {
    board = [
      ['bR','bN','bB','bQ','bK','bB','bN','bR'],
      ['bP','bP','bP','bP','bP','bP','bP','bP'],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      [null,null,null,null,null,null,null,null],
      ['wP','wP','wP','wP','wP','wP','wP','wP'],
      ['wR','wN','wB','wQ','wK','wB','wN','wR'],
    ];
    turn = 'w'; phase = 'move'; sel = null; legal = [];
    moveNum = 0; yd = null; rd = null;
    castleR = {wK:true,wQ:true,bK:true,bQ:true};
    ep = null; log = []; promoting = null; gameOver = false;
    lastMv = null; laserPh = null; laserSrc = null; laserTgt = null;
    if (animTmr) clearTimeout(animTmr);
    render();
  }

  const wrap = document.createElement('div');
  wrap.className = 'board-game';
  wrap.style.overflow = 'auto';
  area.appendChild(wrap);
  const cont = document.createElement('div');
  cont.style.cssText = 'width:min(95vw,420px);margin:0 auto;padding:4px 0';
  wrap.appendChild(cont);

  // --- Chess Engine ---
  function inB(r,c) { return r>=0&&r<8&&c>=0&&c<8; }
  function pC(p) { return p ? p[0] : null; }
  function pT(p) { return p ? p[1] : null; }
  function isDk(r,c) { return (yd&&yd.r===r&&yd.c===c)||(rd&&rd.r===r&&rd.c===c); }
  function findK(col) { for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]===col+'K') return {r,c}; return null; }

  function pseudoMoves(r,c) {
    const p=board[r][c]; if(!p) return [];
    const col=p[0], tp=p[1], opp=col==='w'?'b':'w', mv=[];
    function slide(dr,dc) {
      for(let i=1;i<8;i++) {
        const nr=r+dr*i, nc=c+dc*i;
        if(!inB(nr,nc)||isDk(nr,nc)) break;
        const x=board[nr][nc];
        if(x) { if(pC(x)===opp) mv.push({r:nr,c:nc}); break; }
        mv.push({r:nr,c:nc});
      }
    }
    if(tp==='P') {
      const dir=col==='w'?-1:1, sr=col==='w'?6:1;
      if(inB(r+dir,c)&&!board[r+dir][c]&&!isDk(r+dir,c)) {
        mv.push({r:r+dir,c:c});
        if(r===sr&&!board[r+2*dir][c]&&!isDk(r+2*dir,c)) mv.push({r:r+2*dir,c:c});
      }
      for(const dc of [-1,1]) {
        const nr=r+dir, nc=c+dc;
        if(!inB(nr,nc)||isDk(nr,nc)) continue;
        if(board[nr][nc]&&pC(board[nr][nc])===opp) mv.push({r:nr,c:nc});
        if(ep&&ep.r===nr&&ep.c===nc) mv.push({r:nr,c:nc,ep:true});
      }
    } else if(tp==='N') {
      for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr=r+dr, nc=c+dc;
        if(inB(nr,nc)&&!isDk(nr,nc)&&(!board[nr][nc]||pC(board[nr][nc])===opp)) mv.push({r:nr,c:nc});
      }
    } else if(tp==='B') { for(const d of [[-1,-1],[-1,1],[1,-1],[1,1]]) slide(d[0],d[1]); }
    else if(tp==='R') { for(const d of [[-1,0],[1,0],[0,-1],[0,1]]) slide(d[0],d[1]); }
    else if(tp==='Q') { for(const d of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) slide(d[0],d[1]); }
    else if(tp==='K') {
      for(const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const nr=r+dr, nc=c+dc;
        if(inB(nr,nc)&&!isDk(nr,nc)&&(!board[nr][nc]||pC(board[nr][nc])===opp)) mv.push({r:nr,c:nc});
      }
      const row=col==='w'?7:0;
      if(r===row&&c===4) {
        if(castleR[col+'K']&&board[row][7]===col+'R'&&!board[row][5]&&!board[row][6]&&!isDk(row,5)&&!isDk(row,6)&&!isAtt(row,4,opp)&&!isAtt(row,5,opp)&&!isAtt(row,6,opp))
          mv.push({r:row,c:6,castle:'K'});
        if(castleR[col+'Q']&&board[row][0]===col+'R'&&!board[row][1]&&!board[row][2]&&!board[row][3]&&!isDk(row,1)&&!isDk(row,2)&&!isDk(row,3)&&!isAtt(row,4,opp)&&!isAtt(row,3,opp)&&!isAtt(row,2,opp))
          mv.push({r:row,c:2,castle:'Q'});
      }
    }
    return mv;
  }

  function isAtt(r,c,by) {
    const pDir = by==='w' ? 1 : -1;
    for(const dc of [-1,1]) { const fr=r+pDir, fc=c+dc; if(inB(fr,fc)&&board[fr][fc]===by+'P') return true; }
    for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])
      if(inB(r+dr,c+dc)&&board[r+dr][c+dc]===by+'N') return true;
    for(const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]])
      if(inB(r+dr,c+dc)&&board[r+dr][c+dc]===by+'K') return true;
    for(const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      for(let i=1;i<8;i++) { const fr=r+dr*i, fc=c+dc*i; if(!inB(fr,fc)||isDk(fr,fc)) break; const p=board[fr][fc]; if(p) { if(pC(p)===by&&(pT(p)==='B'||pT(p)==='Q')) return true; break; } }
    }
    for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      for(let i=1;i<8;i++) { const fr=r+dr*i, fc=c+dc*i; if(!inB(fr,fc)||isDk(fr,fc)) break; const p=board[fr][fc]; if(p) { if(pC(p)===by&&(pT(p)==='R'||pT(p)==='Q')) return true; break; } }
    }
    return false;
  }

  function inCheck(col) { const k=findK(col); return k && isAtt(k.r, k.c, col==='w'?'b':'w'); }

  function getLegal(r,c) {
    const p=board[r][c]; if(!p) return [];
    return pseudoMoves(r,c).filter(m => {
      const sv=board[m.r][m.c], pc=board[r][c];
      board[m.r][m.c]=pc; board[r][c]=null;
      let epc=null;
      if(m.ep) { epc=board[r][m.c]; board[r][m.c]=null; }
      let rsv=null, rf=null, rt=null;
      if(m.castle) {
        const rw=m.r;
        rf = m.castle==='K' ? {r:rw,c:7} : {r:rw,c:0};
        rt = m.castle==='K' ? {r:rw,c:5} : {r:rw,c:3};
        rsv=board[rf.r][rf.c]; board[rt.r][rt.c]=rsv; board[rf.r][rf.c]=null;
      }
      const chk=inCheck(pC(pc));
      board[r][c]=pc; board[m.r][m.c]=sv;
      if(m.ep) board[r][m.c]=epc;
      if(m.castle) { board[rf.r][rf.c]=rsv; board[rt.r][rt.c]=null; }
      return !chk;
    });
  }

  function hasLegal(col) {
    for(let r=0;r<8;r++) for(let c=0;c<8;c++)
      if(board[r][c]&&pC(board[r][c])===col&&getLegal(r,c).length>0) return true;
    return false;
  }

  function doMove(from,to,promo) {
    const pc=board[from.r][from.c], cap=board[to.r][to.c], col=pC(pc), tp=pT(pc);
    let epc=null;
    if(to.ep) { epc=board[from.r][to.c]; board[from.r][to.c]=null; }
    board[to.r][to.c]=pc; board[from.r][from.c]=null;
    if(to.castle) {
      const rw=to.r;
      if(to.castle==='K') { board[rw][5]=board[rw][7]; board[rw][7]=null; }
      else { board[rw][3]=board[rw][0]; board[rw][0]=null; }
    }
    if(tp==='P'&&(to.r===0||to.r===7)) board[to.r][to.c]=col+(promo||'Q');
    if(tp==='K') { castleR[col+'K']=false; castleR[col+'Q']=false; }
    if(tp==='R') {
      if(from.r===7&&from.c===0) castleR.wQ=false; if(from.r===7&&from.c===7) castleR.wK=false;
      if(from.r===0&&from.c===0) castleR.bQ=false; if(from.r===0&&from.c===7) castleR.bK=false;
    }
    if(cap) {
      if(to.r===7&&to.c===0) castleR.wQ=false; if(to.r===7&&to.c===7) castleR.wK=false;
      if(to.r===0&&to.c===0) castleR.bQ=false; if(to.r===0&&to.c===7) castleR.bK=false;
    }
    ep = (tp==='P'&&Math.abs(to.r-from.r)===2) ? {r:(from.r+to.r)/2, c:from.c} : null;
    let note='';
    if(to.castle==='K') note='O-O';
    else if(to.castle==='Q') note='O-O-O';
    else {
      if(tp!=='P') note+=tp;
      if(cap||epc) { if(tp==='P') note+=FL[from.c]; note+='x'; }
      note+=FL[to.c]+RK[to.r];
      if(promo) note+='='+promo;
    }
    const opp=col==='w'?'b':'w';
    if(inCheck(opp)) note+=hasLegal(opp)?'+':'#';
    SND.click();
    log.push({text:(col==='w'?'⬜ White: ':'⬛ Black: ')+note, imp:false});
  }

  // --- Duck Mechanics ---
  function placeRD() {
    const e=[];
    for(let r=0;r<8;r++) for(let c=0;c<8;c++)
      if(!board[r][c]&&!(yd&&yd.r===r&&yd.c===c)&&!(rd&&rd.r===r&&rd.c===c)) e.push({r,c});
    if(e.length>0) rd=e[Math.floor(rng()*e.length)];
  }

  function findLaserTarget() {
    if(!rd) return null;
    const t=[];
    for(const [dr,dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr=rd.r+dr, nc=rd.c+dc;
      if(inB(nr,nc)&&board[nr][nc]&&(moveNum>=50||pT(board[nr][nc])!=='K')) t.push({r:nr,c:nc});
    }
    return t.length>0 ? t[Math.floor(rng()*t.length)] : null;
  }

  function fireLaser(target, cb) {
    if(!target) { cb(); return; }
    const tPc=board[target.r][target.c];
    laserPh='charge'; laserSrc={...rd}; laserTgt={...target};
    SND.shoot();
    render();
    animTmr=setTimeout(() => {
      laserPh='beam'; render();
      animTmr=setTimeout(() => {
        laserPh='explode'; render();
        animTmr=setTimeout(() => {
          const pn=PN[pT(tPc)]||'piece', pc=pC(tPc)==='w'?'White':'Black';
          log.push({text:'🔴 Red Duck vaporized '+pc+' '+pn+' at '+FL[target.c]+RK[target.r]+' with its laser!', imp:true});
          board[target.r][target.c]=null;
          SND.boom();
          laserPh=null; laserSrc=null; laserTgt=null;
          if(pT(tPc)==='K') {
            const w=pc==='White'?'Black':'White';
            log.push({text:'💀 '+pc+' King vaporized! '+w+' wins!', imp:true});
            phase='done'; gameOver=true; SND.win();
            const msg=online?((pc==='White'&&online.playerId===0)||(pc==='Black'&&online.playerId===1)?'Your King was vaporized! You lose!':'Enemy King vaporized! You win!'):w+' wins — King vaporized!';
            setStatus(msg); render();
            setTimeout(() => showOverlay(area,msg,'Rematch',restart),800);
            return;
          }
          cb();
        },400);
      },500);
    },500);
  }

  function safetyCheck() {
    if(hasLegal(turn)||inCheck(turn)) return;
    // Try re-teleporting red duck to far side
    if(rd) {
      const oldRd={...rd};
      const far=rd.r<4?[4,5,6,7]:[0,1,2,3], e=[];
      for(const row of far) for(let c=0;c<8;c++)
        if(!board[row][c]&&!(yd&&yd.r===row&&yd.c===c)) e.push({r:row,c:c});
      if(e.length>0) {
        rd=e[Math.floor(rng()*e.length)];
        if(hasLegal(turn)) { log.push({text:'🚨 Canard de Secours! Red Duck emergency teleport!', imp:true}); SND.chime(); return; }
      }
      rd=oldRd;
    }
    // Try removing yellow duck
    if(yd) {
      const oldYd={...yd}; yd=null;
      if(hasLegal(turn)) { log.push({text:'🚨 Canard de Secours! Yellow Duck fled the board!', imp:true}); SND.chime(); return; }
      yd=oldYd;
    }
    // Try both
    if(rd&&yd) {
      const oR={...rd}, oY={...yd}; yd=null;
      const far=oR.r<4?[4,5,6,7]:[0,1,2,3], e=[];
      for(const row of far) for(let c=0;c<8;c++) if(!board[row][c]) e.push({r:row,c:c});
      if(e.length>0) {
        rd=e[Math.floor(rng()*e.length)];
        if(hasLegal(turn)) { log.push({text:'🚨 Canard de Secours! Both ducks repositioned!', imp:true}); SND.chime(); return; }
      }
      rd=oR; yd=oY;
    }
  }

  function afterDucks() {
    moveNum++;
    if(moveNum===50) { log.push({text:'💀 Move 25 reached — Kings are no longer immune to the Red Duck laser!', imp:true}); SND.chime(); }
    const tgt = (moveNum>0&&moveNum%5===0) ? findLaserTarget() : null;
    fireLaser(tgt, () => {
      turn = turn==='w' ? 'b' : 'w';
      safetyCheck();
      if(!hasLegal(turn)) {
        if(inCheck(turn)) {
          const w=turn==='w'?'Black':'White';
          log.push({text:'👑 Checkmate! '+w+' wins!', imp:true});
          phase='done'; gameOver=true; SND.win();
          const msg=online?((turn==='w'&&online.playerId===0)||(turn==='b'&&online.playerId===1)?'You lose by checkmate!':'You win by checkmate!'):w+' wins by checkmate!';
          setStatus(msg); render();
          setTimeout(() => showOverlay(area,msg,'Rematch',restart),800);
          return;
        }
        log.push({text:'🤝 Stalemate — draw!', imp:true});
        phase='done'; gameOver=true; setStatus('Draw by stalemate!'); render();
        setTimeout(() => showOverlay(area,'Stalemate — Draw!','Rematch',restart),800);
        return;
      }
      if(inCheck(turn)) log.push({text:'⚠️ '+(turn==='w'?'White':'Black')+' is in check!', imp:true});
      phase='move'; sel=null; legal=[];
      updStatus(); render();
    });
  }

  function updStatus() {
    if(gameOver) return;
    const c=turn==='w'?'White':'Black';
    if(online) {
      const my=(turn==='w'&&online.playerId===0)||(turn==='b'&&online.playerId===1);
      setStatus(phase==='duck'?(my?'Place the Yellow Duck 🐥':'Opponent placing duck...'):(my?'Your move':'Opponent\'s move'));
    } else {
      setStatus(phase==='duck'?c+': Place 🐥 Yellow Duck':c+'\'s move');
    }
  }

  // --- Click Handler ---
  function handleClick(r,c) {
    if(gameOver||laserPh) return;
    if(online) {
      const my=(turn==='w'&&online.playerId===0)||(turn==='b'&&online.playerId===1);
      if(!my) return;
    }
    if(phase==='move') {
      if(promoting) return;
      const lm=legal.find(m=>m.r===r&&m.c===c);
      if(lm) {
        const pc=board[sel.r][sel.c];
        if(pT(pc)==='P'&&(r===0||r===7)) { promoting={from:{...sel},to:lm}; render(); return; }
        lastMv={from:{...sel},to:lm};
        doMove(sel,lm,null);
        yd=null; phase='duck'; sel=null; legal=[];
        if(online) online.sendMove({t:'mv',fr:lastMv.from.r,fc:lastMv.from.c,tr:lastMv.to.r,tc:lastMv.to.c,cs:lm.castle||'',ep:lm.ep||false,pr:''});
        updStatus(); render();
        return;
      }
      if(board[r][c]&&pC(board[r][c])===turn&&!isDk(r,c)) { sel={r,c}; legal=getLegal(r,c); SND.tick(); render(); return; }
      sel=null; legal=[]; render();
    } else if(phase==='duck') {
      if(!board[r][c]&&!(rd&&rd.r===r&&rd.c===c)) {
        yd={r,c};
        if(online) online.sendMove({t:'dk',yr:r,yc:c});
        placeRD();
        SND.drop();
        afterDucks();
      }
    }
  }

  function handlePromo(type) {
    if(!promoting) return;
    lastMv={from:promoting.from,to:promoting.to,promo:type};
    doMove(promoting.from, promoting.to, type);
    promoting=null; yd=null; phase='duck'; sel=null; legal=[];
    if(online) online.sendMove({t:'mv',fr:lastMv.from.r,fc:lastMv.from.c,tr:lastMv.to.r,tc:lastMv.to.c,cs:lastMv.to.castle||'',ep:lastMv.to.ep||false,pr:type});
    updStatus(); render();
  }

  // --- Online ---
  if(online) {
    online.listenMoves(data => {
      if(data.t==='dk') {
        yd={r:data.yr,c:data.yc};
        placeRD();
        SND.drop();
        afterDucks();
        return;
      }
      // Chess move
      const from={r:data.fr,c:data.fc}, to={r:data.tr,c:data.tc};
      if(data.cs) to.castle=data.cs;
      if(data.ep) to.ep=true;
      doMove(from, to, data.pr||null);
      yd=null; phase='duck';
      updStatus(); render();
    });
    online.onOpponentDisconnect(() => { if(!gameOver){gameOver=true;phase='done';setStatus('Opponent disconnected');render();} });
  }

  // --- Rendering ---
  function render() {
    const LT='#EEEED2', DK='#769656'; // Chess.com green theme
    const hunger=moveNum%5;
    let h='';

    // Header: turn + hunger gauge
    h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;margin-bottom:2px">';
    h+='<div style="display:flex;align-items:center;gap:6px">';
    h+='<div style="width:14px;height:14px;border-radius:50%;background:'+(turn==='w'?'#eee':'#333')+';border:2px solid #888"></div>';
    h+='<span style="font-size:.85em;font-weight:bold;color:#ccc">'+(phase==='duck'?'Place 🐥':phase==='done'?'Game Over':(turn==='w'?'White':'Black')+'\'s turn')+'</span>';
    h+='</div>';
    h+='<div style="display:flex;align-items:center;gap:4px" title="Laser in '+(5-hunger)+' moves'+(moveNum>=50?' — Kings vulnerable!':'')+'">';
    if(moveNum>=50) h+='<span style="font-size:.7em" title="Kings can be vaporized!">💀</span>';
    h+='<span style="font-size:.75em;color:#999">⚡</span>';
    for(let i=0;i<5;i++) { const f=i<hunger; h+='<div style="width:10px;height:10px;border-radius:2px;background:'+(f?'#f44336':'#333')+';border:1px solid '+(f?'#ff5252':'#555')+(i===4&&hunger===4?';box-shadow:0 0 6px #f44':'')+'"></div>'; }
    h+='</div></div>';

    // Board
    h+='<div style="position:relative;width:min(88vw,360px);margin:0 auto">';
    h+='<div id="dc-board" style="display:grid;grid-template-columns:repeat(8,1fr);border:2px solid #444;border-radius:3px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.5)">';

    const kInCheck = inCheck(turn) ? findK(turn) : null;

    for(let ri=0;ri<8;ri++) for(let ci=0;ci<8;ci++) {
      const r=flipped?7-ri:ri, c=flipped?7-ci:ci;
      const isLt=(r+c)%2===0;
      const p=board[r][c];
      const isSel=sel&&sel.r===r&&sel.c===c;
      const isLeg=legal.some(m=>m.r===r&&m.c===c);
      const isYD=yd&&yd.r===r&&yd.c===c;
      const isRD=rd&&rd.r===r&&rd.c===c;
      const isCap=isLeg&&p;
      const isLTgt=laserTgt&&laserTgt.r===r&&laserTgt.c===c;
      const isLSrc=laserSrc&&laserSrc.r===r&&laserSrc.c===c;
      const isChk=kInCheck&&kInCheck.r===r&&kInCheck.c===c;
      const isLast=lastMv&&phase!=='duck'&&((lastMv.from.r===r&&lastMv.from.c===c)||(lastMv.to.r===r&&lastMv.to.c===c));

      let bg=isLt?LT:DK;
      if(isSel) bg=isLt?'#F6F669':'#BACA44';
      else if(isLast) bg=isLt?'rgba(155,199,0,0.55)':'rgba(155,199,0,0.45)';
      if(isLTgt&&laserPh==='explode') bg='#ff4444';

      let chkBg='';
      if(isChk) chkBg='background:radial-gradient(ellipse at center,rgba(255,0,0,0.85) 0%,rgba(231,0,0,0.6) 25%,rgba(169,0,0,0) 89%);';

      let content='';
      if(isYD) {
        content='<span style="font-size:clamp(22px,6vw,30px);line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));pointer-events:none">🐥</span>';
      } else if(isRD) {
        const glow=isLSrc&&laserPh;
        content='<span style="font-size:clamp(22px,6vw,30px);line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))'+(glow?' drop-shadow(0 0 8px #f00) drop-shadow(0 0 14px #f00)':'')+'">🦆</span>';
      } else if(p) {
        const pc=pC(p);
        const st=pc==='w'?'color:#fff;text-shadow:0 0 4px rgba(0,0,0,0.6),0 1px 2px rgba(0,0,0,0.9)':'color:#000;text-shadow:0 0 4px rgba(255,255,255,0.3)';
        const expl=isLTgt&&laserPh==='explode'?';opacity:0;transform:scale(2);transition:all .3s':'';
        content='<span style="font-size:clamp(24px,6.5vw,34px);'+st+';line-height:1;pointer-events:none'+expl+'">'+SYMS[p]+'</span>';
      }

      let dot='';
      if(isLeg&&!p&&!isYD&&!isRD) dot='<div style="position:absolute;width:26%;height:26%;background:rgba(0,0,0,0.2);border-radius:50%;pointer-events:none"></div>';
      let ring='';
      if(isCap) ring='<div style="position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 4px rgba(0,0,0,0.25);pointer-events:none"></div>';

      let lbl='';
      const lblCol=isLt?'#769656':'#EEEED2';
      if(ci===0) lbl+='<span style="position:absolute;top:1px;left:2px;font-size:8px;color:'+lblCol+';font-weight:bold;pointer-events:none;opacity:.8">'+RK[r]+'</span>';
      if(ri===7) lbl+='<span style="position:absolute;bottom:0;right:2px;font-size:8px;color:'+lblCol+';font-weight:bold;pointer-events:none;opacity:.8">'+FL[c]+'</span>';

      const duckPhClick=phase==='duck'&&!board[r][c]&&!(rd&&rd.r===r&&rd.c===c);
      const cursor=(phase==='move'||duckPhClick)?'pointer':'default';

      h+='<div data-r="'+r+'" data-c="'+c+'" style="position:relative;display:flex;align-items:center;justify-content:center;background:'+bg+';cursor:'+cursor+';user-select:none;-webkit-user-select:none;aspect-ratio:1;'+chkBg+'">'+lbl+content+dot+ring+'</div>';
    }
    h+='</div>';

    // Laser beam SVG overlay
    if(laserPh==='beam'&&laserSrc&&laserTgt) h+='<svg id="dc-laser" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10"></svg>';
    h+='</div>';

    // Promotion dialog
    if(promoting) {
      const ppc=board[promoting.from.r][promoting.from.c];
      const pcol=pC(ppc);
      h+='<div style="display:flex;justify-content:center;gap:8px;padding:10px;background:rgba(0,0,0,0.85);border-radius:10px;margin:8px auto;width:fit-content">';
      h+='<span style="color:#aaa;font-size:.85em;align-self:center;margin-right:4px">Promote:</span>';
      for(const t of ['Q','R','B','N']) {
        const sym=SYMS[pcol+t];
        const st=pcol==='w'?'color:#fff;text-shadow:0 1px 2px #000':'color:#000;text-shadow:0 1px 2px rgba(255,255,255,0.4)';
        h+='<button data-promo="'+t+'" style="font-size:30px;background:#555;border:2px solid #777;border-radius:8px;padding:6px 12px;cursor:pointer;'+st+'">'+sym+'</button>';
      }
      h+='</div>';
    }

    // Move log (last 8 entries)
    const vLog=log.slice(-8);
    if(vLog.length>0) {
      h+='<div style="margin-top:6px;padding:4px 8px;font-size:.7em;max-height:100px;overflow-y:auto">';
      for(const l of vLog) h+='<div style="padding:1px 0;color:'+(l.imp?'#ff8a65':'#777')+(l.imp?';font-weight:bold':'')+'">'+l.text+'</div>';
      h+='</div>';
    }

    cont.innerHTML=h;

    // Attach click handlers
    cont.querySelectorAll('[data-r]').forEach(el => {
      el.onclick=() => handleClick(parseInt(el.dataset.r), parseInt(el.dataset.c));
    });
    cont.querySelectorAll('[data-promo]').forEach(el => {
      el.onclick=() => handlePromo(el.dataset.promo);
    });

    // Draw laser beam after DOM update
    if(laserPh==='beam') requestAnimationFrame(drawLaser);
  }

  function drawLaser() {
    const svg=cont.querySelector('#dc-laser');
    const bd=cont.querySelector('#dc-board');
    if(!svg||!bd||!laserSrc||!laserTgt) return;
    const sq=bd.offsetWidth/8;
    const fR=flipped?7-laserSrc.r:laserSrc.r, fC=flipped?7-laserSrc.c:laserSrc.c;
    const tR=flipped?7-laserTgt.r:laserTgt.r, tC=flipped?7-laserTgt.c:laserTgt.c;
    const x1=(fC+.5)*sq, y1=(fR+.5)*sq, x2=(tC+.5)*sq, y2=(tR+.5)*sq;
    svg.innerHTML='<defs><filter id="gl"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>'+
      '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#ff0000" stroke-width="5" filter="url(#gl)" opacity=".7"/>'+
      '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="#ffcc00" stroke-width="2" opacity=".9"/>'+
      '<circle cx="'+x2+'" cy="'+y2+'" r="8" fill="rgba(255,60,0,0.4)" stroke="#f00" stroke-width="2">'+
      '<animate attributeName="r" from="6" to="22" dur=".4s" fill="freeze"/>'+
      '<animate attributeName="opacity" from="1" to="0" dur=".4s" fill="freeze"/>'+
      '</circle>';
  }

  restart();
  return () => { if(animTmr) clearTimeout(animTmr); if(online) online.cleanup(); };
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
    {ball:{x:w/2,y:h*0.85},hole:{x:w/2,y:h*0.15},walls:[[w*0.2,0,w*0.2,h],[w*0.8,0,w*0.8,h],[w*0.35,h*0.4,w*0.65,h*0.4],[w*0.35,h*0.6,w*0.65,h*0.6]]},
    {ball:{x:w*0.75,y:h*0.82},hole:{x:w*0.25,y:h*0.18},walls:[[w*0.5,h*0.25,w*0.5,h*0.75],[w*0.5,h*0.25,w*0.85,h*0.25]]},
    {ball:{x:w/2,y:h*0.88},hole:{x:w/2,y:h*0.12},walls:[[0,h*0.72,w*0.65,h*0.72],[w*0.35,h*0.5,w,h*0.5],[0,h*0.28,w*0.65,h*0.28]]},
    {ball:{x:w/2,y:h*0.88},hole:{x:w/2,y:h*0.12},walls:[[w*0.1,h*0.15,w*0.4,h*0.5],[w*0.9,h*0.15,w*0.6,h*0.5],[w*0.4,h*0.5,w*0.4,h*0.7],[w*0.6,h*0.5,w*0.6,h*0.7]]}
  ];
  let holeIdx = 0, playerScores = [[],[]];
  let turn = 0, strokes = 0;
  let ball, hole, walls, bvx=0, bvy=0, moving=false, aiming=false, aimPt=null, trail=[], zoomScale=1;
  function loadHole() {
    const hd = holes[holeIdx];
    ball = {...hd.ball}; hole = {...hd.hole}; walls = hd.walls;
    bvx = bvy = 0; moving = false; strokes = 0; trail = [];
  }
  loadHole();
  function getP(e) { const r=canvas.getBoundingClientRect(),t=e.touches?e.touches[0]:e; return{x:(t.clientX-r.left)/r.width*w,y:(t.clientY-r.top)/r.height*h}; }
  canvas.addEventListener('mousedown',e=>{if(!moving&&!gameEnd)startAim(getP(e));});
  canvas.addEventListener('mousemove',e=>{moveAim(getP(e));});
  canvas.addEventListener('mouseup',e=>{if(aiming)shoot();});
  canvas.addEventListener('touchstart',e=>{e.preventDefault();if(!moving&&!gameEnd)startAim(getP(e));});
  canvas.addEventListener('touchmove',e=>{e.preventDefault();moveAim(getP(e));});
  canvas.addEventListener('touchend',e=>{e.preventDefault();if(aiming)shoot();});
  let gameEnd = false;
  function startAim(p) { aiming = true; aimPt = p; zoomScale = 1; }
  function moveAim(p) {
    if (!aiming) return;
    const cx = w/2, cy = h/2;
    const bSX = cx + (ball.x - cx) * zoomScale, bSY = cy + (ball.y - cy) * zoomScale;
    const sd = Math.sqrt((p.x - bSX)**2 + (p.y - bSY)**2);
    const tgt = sd > 70 ? Math.max(0.5, 1 - (sd - 70) / 280) : 1;
    zoomScale += (tgt - zoomScale) * 0.25;
    aimPt = {x: cx + (p.x - cx) / zoomScale, y: cy + (p.y - cy) / zoomScale};
  }
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
      trail.push({x:ball.x,y:ball.y}); if(trail.length>14) trail.shift();
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
    if (!moving && trail.length > 0) trail.shift();
    if (!aiming && zoomScale < 1) zoomScale = Math.min(1, zoomScale + 0.03);
    draw();
    raf = requestAnimationFrame(update);
  }
  function draw() {
    // Dark background (visible when zoomed out)
    ctx.fillStyle = '#0a1a0a'; ctx.fillRect(0,0,w,h);
    ctx.save();
    if (zoomScale < 1) { const cx = w/2, cy = h/2; ctx.translate(cx,cy); ctx.scale(zoomScale,zoomScale); ctx.translate(-cx,-cy); }
    // Green felt with gradient
    const feltG = ctx.createLinearGradient(0,0,w,h);
    feltG.addColorStop(0,'#1a6b1a'); feltG.addColorStop(0.5,'#1B5E20'); feltG.addColorStop(1,'#145a14');
    ctx.fillStyle = feltG; ctx.fillRect(0,0,w,h);
    // Mowing stripes
    for (let y=0;y<h;y+=16) { ctx.fillStyle=y%32===0?'rgba(255,255,255,0.016)':'rgba(0,0,0,0.016)'; ctx.fillRect(0,y,w,16); }

    // Wooden rail border
    const RL=7;
    ctx.fillStyle='#5D3A1A'; ctx.fillRect(0,0,w,RL); ctx.fillRect(0,h-RL,w,RL); ctx.fillRect(0,0,RL,h); ctx.fillRect(w-RL,0,RL,h);
    ctx.fillStyle='#8B6B4A'; ctx.fillRect(0,0,w,2); ctx.fillRect(0,0,2,h);
    ctx.fillStyle='#3A2210'; ctx.fillRect(0,h-2,w,2); ctx.fillRect(w-2,0,2,h);
    // Green bumper edge
    ctx.strokeStyle='#2E7D32'; ctx.lineWidth=2; ctx.strokeRect(RL,RL,w-RL*2,h-RL*2);
    // Corner bolts
    for(const[cx,cy] of [[RL/2,RL/2],[w-RL/2,RL/2],[RL/2,h-RL/2],[w-RL/2,h-RL/2]]){
      ctx.fillStyle='#8B6B4A';ctx.beginPath();ctx.arc(cx,cy,2.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#3A2210';ctx.beginPath();ctx.arc(cx,cy,1,0,Math.PI*2);ctx.fill();
    }

    // 3D walls (wooden bumpers with rubber cushion)
    ctx.lineCap='round';
    for(const[x1,y1,x2,y2] of walls){
      ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=10;
      ctx.beginPath();ctx.moveTo(x1+2,y1+2);ctx.lineTo(x2+2,y2+2);ctx.stroke();
      ctx.strokeStyle='#5D3A1A';ctx.lineWidth=8;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.strokeStyle='#8B5A3F';ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.strokeStyle='#388E3C';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    }

    // Tee marker
    const tee=holes[holeIdx].ball;
    ctx.fillStyle='rgba(255,255,255,0.08)';ctx.beginPath();ctx.arc(tee.x,tee.y,BR+6,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(tee.x,tee.y,BR+6,0,Math.PI*2);ctx.stroke();

    // Hole with depth
    const hG=ctx.createRadialGradient(hole.x-2,hole.y-2,0,hole.x,hole.y,HR);
    hG.addColorStop(0,'#000');hG.addColorStop(0.6,'#0a0a0a');hG.addColorStop(1,'#1a1a1a');
    ctx.fillStyle=hG;ctx.beginPath();ctx.arc(hole.x,hole.y,HR,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#444';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(hole.x,hole.y,HR,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(hole.x,hole.y,HR-1,Math.PI*0.9,Math.PI*1.7);ctx.stroke();
    // Flag pin
    const fx=hole.x+2,fy=hole.y+2;
    ctx.strokeStyle='#ccc';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx,fy-28);ctx.stroke();
    ctx.fillStyle=turn===0?'#E53935':'#1E88E5';
    ctx.beginPath();ctx.moveTo(fx,fy-28);ctx.lineTo(fx+14,fy-22);ctx.lineTo(fx,fy-16);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.25)';ctx.lineWidth=0.5;ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='bold 7px sans-serif';ctx.textAlign='center';ctx.fillText(holeIdx+1,fx+6,fy-20);

    // Ball trail
    for(let i=0;i<trail.length;i++){
      const a=(i/trail.length)*0.12, r=1+BR*(i/trail.length)*0.4;
      ctx.fillStyle=`rgba(255,255,255,${a})`;ctx.beginPath();ctx.arc(trail[i].x,trail[i].y,r,0,Math.PI*2);ctx.fill();
    }

    // Ball shadow
    ctx.fillStyle='rgba(0,0,0,0.18)';ctx.beginPath();ctx.ellipse(ball.x+3,ball.y+3,BR*0.85,BR*0.5,0.4,0,Math.PI*2);ctx.fill();
    // Ball body (3D sphere)
    const bG=ctx.createRadialGradient(ball.x-BR*0.3,ball.y-BR*0.35,BR*0.05,ball.x,ball.y,BR);
    bG.addColorStop(0,'#ffffff');bG.addColorStop(0.3,'#f5f5f5');bG.addColorStop(0.7,'#d8d8d8');bG.addColorStop(1,'#a0a0a0');
    ctx.fillStyle=bG;ctx.beginPath();ctx.arc(ball.x,ball.y,BR,0,Math.PI*2);ctx.fill();
    // Specular highlight
    ctx.fillStyle='rgba(255,255,255,0.75)';ctx.beginPath();ctx.arc(ball.x-BR*0.28,ball.y-BR*0.28,BR*0.22,0,Math.PI*2);ctx.fill();
    // Subtle outline
    ctx.strokeStyle='rgba(0,0,0,0.12)';ctx.lineWidth=0.5;ctx.beginPath();ctx.arc(ball.x,ball.y,BR,0,Math.PI*2);ctx.stroke();

    // Aim UI
    if(aiming&&aimPt){
      // Glow around ball
      const grd=ctx.createRadialGradient(ball.x,ball.y,BR,ball.x,ball.y,BR*3);
      grd.addColorStop(0,'rgba(255,255,100,0.45)');grd.addColorStop(1,'rgba(255,255,100,0)');
      ctx.fillStyle=grd;ctx.beginPath();ctx.arc(ball.x,ball.y,BR*3,0,Math.PI*2);ctx.fill();
      const dx=ball.x-aimPt.x, dy=ball.y-aimPt.y;
      const power=Math.min(Math.sqrt(dx*dx+dy*dy),200), pct=power/200;
      const angle=Math.atan2(dy,dx);
      // Trajectory dots
      for(let i=1;i<=8;i++){
        const t=i/9, dotX=ball.x+Math.cos(angle)*power*t, dotY=ball.y+Math.sin(angle)*power*t;
        ctx.fillStyle=`rgba(255,255,255,${0.4*(1-t)})`;
        ctx.beginPath();ctx.arc(dotX,dotY,Math.max(0.5,2.5-t*1.5),0,Math.PI*2);ctx.fill();
      }
      // Power bar
      const bW=38,bH=5,bX=ball.x-bW/2,bY=ball.y-BR-16;
      ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(bX-1,bY-1,bW+2,bH+2);
      ctx.fillStyle=pct<0.4?'#4CAF50':pct<0.75?'#FFC107':'#F44336';
      ctx.fillRect(bX,bY,bW*pct,bH);
      ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=0.5;ctx.strokeRect(bX,bY,bW,bH);
    }

    // HUD
    ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillRect(w-72,RL+4,64,20);
    ctx.fillStyle='#fff';ctx.font='bold 10px sans-serif';ctx.textAlign='right';
    ctx.fillText(`Hole ${holeIdx+1}/${holes.length}`,w-RL-6,RL+18);
    ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillRect(RL+4,RL+4,78,20);
    ctx.fillStyle=turn===0?'#FF6B6B':'#64B5F6';ctx.textAlign='left';
    ctx.fillText(`P${turn+1} \u2022 ${strokes} stroke${strokes!==1?'s':''}`,RL+10,RL+18);
    // Score summary
    if(playerScores[0].length>0||playerScores[1].length>0){
      const s1=playerScores[0].reduce((a,b)=>a+b,0),s2=playerScores[1].reduce((a,b)=>a+b,0);
      ctx.fillStyle='rgba(0,0,0,0.3)';ctx.fillRect(w/2-40,h-RL-22,80,18);
      ctx.fillStyle='#FF6B6B';ctx.textAlign='center';ctx.font='9px sans-serif';
      ctx.fillText(`P1:${s1}`,w/2-14,h-RL-9);
      ctx.fillStyle='#64B5F6';ctx.fillText(`P2:${s2}`,w/2+14,h-RL-9);
    }
    ctx.textAlign='left';
    ctx.restore();
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

  // --- Horse sprite setup ---
  const GALLOP_FW = 90, GALLOP_FH = 64, GALLOP_FC = 6;
  const JUMP_FW = 80, JUMP_FH = 82, JUMP_FC = 16;
  const SPRITE_W = 70;
  const GALLOP_SH = Math.round(SPRITE_W * GALLOP_FH / GALLOP_FW);
  const JUMP_SH = Math.round(SPRITE_W * JUMP_FH / JUMP_FW);
  function loadSprite(b64) { const i = new Image(); i.src = 'data:image/png;base64,' + b64; return i; }
  const brownGallopImg = loadSprite('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');
  const whiteGallopImg = loadSprite('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');
  const brownJumpImg = loadSprite('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');
  const whiteJumpImg = loadSprite('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');

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

  // --- DRAW HORSE: sprite-based rendering ---
  function drawHorse(x, groundY, offsetY, gallopImg, jumpImg, legPhase, vy) {
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

    // Flip horizontally (sprites face left, game needs right) + smooth upscaling
    ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (air && jumpImg.complete) {
      // Jumping: map vy-based progress to frame index across 16 jump frames
      const jumpProgress = Math.min(1, Math.max(0, (vy - JUMP_V0) / (-2 * JUMP_V0)));
      const fi = Math.min(JUMP_FC - 1, Math.max(0, Math.floor(jumpProgress * JUMP_FC)));
      ctx.drawImage(jumpImg,
        fi * JUMP_FW, 0, JUMP_FW, JUMP_FH,
        -SPRITE_W / 2, -(JUMP_SH - 8), SPRITE_W, JUMP_SH);
    } else if (gallopImg.complete) {
      // Running: cycle gallop frames
      const fi = Math.floor(legPhase) % GALLOP_FC;
      ctx.drawImage(gallopImg,
        fi * GALLOP_FW, 0, GALLOP_FW, GALLOP_FH,
        -SPRITE_W / 2, -(GALLOP_SH - 5), SPRITE_W, GALLOP_SH);
    }

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
      drawHorse(lane1.horseX, lane1.groundY, lane1.horseY, whiteGallopImg, whiteJumpImg, lane1.legPhase, lane1.vy);
    } else {
      ctx.save(); ctx.translate(lane1.horseX, lane1.groundY); ctx.rotate(0.4);
      drawHorse(0, 0, 0, whiteGallopImg, whiteJumpImg, 0, 0);
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
      drawHorse(lane2.horseX, lane2.groundY, lane2.horseY, brownGallopImg, brownJumpImg, lane2.legPhase, lane2.vy);
    } else {
      ctx.save(); ctx.translate(lane2.horseX, lane2.groundY); ctx.rotate(0.4);
      drawHorse(0, 0, 0, brownGallopImg, brownJumpImg, 0, 0);
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
