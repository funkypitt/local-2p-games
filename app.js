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
  _ctx: null, _musicGain: null, _sfxGain: null,
  _musicOn: localStorage.getItem('2pg-music') !== 'off',
  _playing: false, _nextTime: 0, _timer: null, _bar: 0,
  init() {
    if (this._ctx) return;
    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._musicGain = this._ctx.createGain(); this._musicGain.gain.value = 0.1;
    this._musicGain.connect(this._ctx.destination);
    this._sfxGain = this._ctx.createGain(); this._sfxGain.gain.value = 0.3;
    this._sfxGain.connect(this._ctx.destination);
  },
  hz(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  _tone(freq, dur, type, vol, t, dest) {
    const o = this._ctx.createOscillator(), g = this._ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.01);
  },
  // Calming pentatonic melodies (MIDI: C=60 D=62 E=64 G=67 A=69)
  _mel: [
    [64,0,67,0,69,0,67,0, 64,0,62,0,60,0,62,0],
    [60,0,62,0,64,0,67,0, 69,0,67,0,64,0,62,0],
    [69,0,72,0,69,0,67,0, 64,0,62,0,60,0,64,0],
    [67,0,64,0,62,0,60,0, 62,0,64,0,67,0,69,0],
    [60,0,64,0,67,0,72,0, 69,0,67,0,64,0,60,0],
    [64,0,69,0,67,0,64,0, 62,0,60,0,62,0,64,0],
    [72,0,69,0,67,0,69,0, 72,0,74,0,72,0,69,0],
    [67,0,64,0,62,0,64,0, 67,0,69,0,67,0,64,0],
  ],
  _bas: [
    [48,0,0,0,0,0,0,0, 55,0,0,0,0,0,0,0],
    [57,0,0,0,0,0,0,0, 48,0,0,0,0,0,0,0],
    [52,0,0,0,0,0,0,0, 55,0,0,0,0,0,0,0],
    [48,0,0,0,0,0,0,0, 50,0,0,0,0,0,0,0],
  ],
  _arp: [60,64,67,72,69,64,60,55, 57,60,64,69,67,64,60,57],
  _scheduleBar() {
    if (!this._playing) return;
    const step = 60 / 78 / 2; // 78 BPM, 8th notes
    const m = this._mel[this._bar % 8], b = this._bas[this._bar % 4];
    for (let i = 0; i < 16; i++) {
      const t = this._nextTime + i * step;
      if (m[i]) this._tone(this.hz(m[i]), step * 1.8, 'triangle', 0.06, t, this._musicGain);
      if (b[i]) this._tone(this.hz(b[i]), step * 4, 'triangle', 0.04, t, this._musicGain);
      if (i % 2 === 0) this._tone(this.hz(this._arp[(this._bar * 8 + i / 2) % 16] + 12), step * 0.3, 'square', 0.008, t, this._musicGain);
    }
    this._bar++;
    const barDur = 16 * step;
    this._nextTime += barDur;
    this._timer = setTimeout(() => this._scheduleBar(), (barDur - 0.15) * 1000);
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
  // --- SFX Library ---
  pong() { try { this.init(); const t=this._ctx.currentTime; this._tone(660,0.06,'square',0.18,t,this._sfxGain); } catch(e){} },
  pop() { try { this.init(); const a=this._ctx,t=a.currentTime,o=a.createOscillator(),g=a.createGain(); o.type='sine'; o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(200,t+0.08); g.gain.setValueAtTime(0.18,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.08); o.connect(g); g.connect(this._sfxGain); o.start(t); o.stop(t+0.08); } catch(e){} },
  score() { try { this.init(); const t=this._ctx.currentTime; [523,659,784].forEach((f,i)=>this._tone(f,0.12,'square',0.12,t+i*0.1,this._sfxGain)); } catch(e){} },
  drop() { try { this.init(); const a=this._ctx,t=a.currentTime,o=a.createOscillator(),g=a.createGain(); o.type='triangle'; o.frequency.setValueAtTime(300,t); o.frequency.exponentialRampToValueAtTime(100,t+0.15); g.gain.setValueAtTime(0.18,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.15); o.connect(g); g.connect(this._sfxGain); o.start(t); o.stop(t+0.15); } catch(e){} },
  click() { try { this.init(); this._tone(1000,0.03,'square',0.12,this._ctx.currentTime,this._sfxGain); } catch(e){} },
  buzz() { try { this.init(); const a=this._ctx,t=a.currentTime,o=a.createOscillator(),g=a.createGain(); o.type='sawtooth'; o.frequency.value=120; g.gain.setValueAtTime(0.12,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.25); o.connect(g); g.connect(this._sfxGain); o.start(t); o.stop(t+0.25); } catch(e){} },
  win() { try { this.init(); const t=this._ctx.currentTime; [523,659,784,1047].forEach((f,i)=>this._tone(f,0.18,'square',0.1,t+i*0.12,this._sfxGain)); } catch(e){} },
  boom() { try { this.init(); const a=this._ctx,t=a.currentTime,b=a.createBuffer(1,a.sampleRate*0.5,a.sampleRate),d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2.5); const s=a.createBufferSource(); s.buffer=b; const g=a.createGain(); g.gain.value=0.35; s.connect(g); g.connect(this._sfxGain); s.start(); } catch(e){} },
  shoot() { try { this.init(); const a=this._ctx,t=a.currentTime,o=a.createOscillator(),g=a.createGain(); o.type='square'; o.frequency.setValueAtTime(800,t); o.frequency.exponentialRampToValueAtTime(150,t+0.1); g.gain.setValueAtTime(0.1,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.1); o.connect(g); g.connect(this._sfxGain); o.start(t); o.stop(t+0.1); } catch(e){} },
  clack() { try { this.init(); const t=this._ctx.currentTime; this._tone(800,0.04,'triangle',0.22,t,this._sfxGain); this._tone(1200,0.02,'square',0.08,t+0.01,this._sfxGain); } catch(e){} },
  chime() { try { this.init(); const t=this._ctx.currentTime; [784,1047].forEach((f,i)=>this._tone(f,0.15,'sine',0.12,t+i*0.08,this._sfxGain)); } catch(e){} },
  splash() { try { this.init(); const a=this._ctx,t=a.currentTime,b=a.createBuffer(1,a.sampleRate*0.2,a.sampleRate),d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,1)*0.25; const s=a.createBufferSource(),f=a.createBiquadFilter(); f.type='bandpass'; f.frequency.value=2000; f.Q.value=0.5; s.buffer=b; const g=a.createGain(); g.gain.value=0.25; s.connect(f); f.connect(g); g.connect(this._sfxGain); s.start(); } catch(e){} },
  alienDie() { try { this.init(); const a=this._ctx,t=a.currentTime,o=a.createOscillator(),g=a.createGain(); o.type='sawtooth'; o.frequency.setValueAtTime(500,t); o.frequency.exponentialRampToValueAtTime(60,t+0.25); g.gain.setValueAtTime(0.12,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.25); o.connect(g); g.connect(this._sfxGain); o.start(t); o.stop(t+0.25); } catch(e){} },
  tick() { try { this.init(); this._tone(900,0.04,'square',0.08,this._ctx.currentTime,this._sfxGain); } catch(e){} },
  spinTick() { try { this.init(); this._tone(500+Math.random()*500,0.03,'triangle',0.08,this._ctx.currentTime,this._sfxGain); } catch(e){} },
  gallop() { try { this.init(); const t=this._ctx.currentTime; this._tone(200,0.04,'triangle',0.15,t,this._sfxGain); this._tone(250,0.04,'triangle',0.12,t+0.06,this._sfxGain); } catch(e){} },
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

// --- Framework ---
const GAMES = [
  {id:'tennis',name:'Tennis',icon:'🎾',color:'#388E3C',init:initTennis},
  {id:'four',name:'4 in a Row',icon:'🔴',color:'#D32F2F',init:initFourInARow,online:true},
  {id:'pool',name:'Pool',icon:'🎱',color:'#1B5E20',init:initPool},
  {id:'memory',name:'Memory',icon:'🃏',color:'#7B1FA2',init:initMemory,online:true},
  {id:'snakes',name:'Snakes',icon:'🐍',color:'#689F38',init:initSnakes},
  {id:'hockey',name:'Air Hockey',icon:'🏒',color:'#0097A7',init:initAirHockey},
  {id:'tanks',name:'Tank Wars',icon:'💣',color:'#F57F17',init:initTankWars,online:true},
  {id:'ships',name:'Ship Battle',icon:'🚢',color:'#1565C0',init:initShipBattle,online:true},
  {id:'golf',name:'Mini Golf',icon:'⛳',color:'#00796B',init:initMiniGolf},
  {id:'starclash',name:'Star Clash',icon:'👾',color:'#C62828',init:initStarClash},
  {id:'caro',name:'Caro',icon:'⚫',color:'#37474F',init:initCaro,online:true},
  {id:'awale',name:'Awalé',icon:'🥜',color:'#4E342E',init:initAwale,online:true},
  {id:'master',name:'Mastermonde',icon:'🔮',color:'#AD1457',init:initMastermind,online:true},
  {id:'hangman',name:'Wheel of Funktune',icon:'🎡',color:'#4A148C',init:initHangman},
  {id:'pixelrun',name:'Pixel Run',icon:'🏃',color:'#455A64',init:initPixelRun},
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
  // Add music toggle to game header if not there
  const hdr = document.getElementById('game-header');
  if (!hdr.querySelector('#music-btn')) makeMusicBtn(hdr);
  SND.musicStart();
  if (g.online && ONLINE) {
    // Show Local vs Online choice
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div style="font-size:1.3em;font-weight:bold;margin-bottom:8px">Play Mode</div>' +
      '<button class="btn" id="pm-local" style="padding:14px 36px;font-size:1.1em">Local</button>' +
      '<button class="btn" id="pm-online" style="padding:14px 36px;font-size:1.1em;background:#1565C0">Online</button>';
    ov.querySelector('#pm-local').onclick = () => { ov.remove(); currentDestroy = g.init(area, s => status.textContent = s); };
    ov.querySelector('#pm-online').onclick = () => {
      ov.remove();
      ONLINE.showLobby(area, g.id, online => {
        currentDestroy = g.init(area, s => status.textContent = s, online);
      }, () => endGame());
    };
    area.appendChild(ov);
  } else {
    currentDestroy = g.init(area, s => status.textContent = s);
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

// ==================== PIXEL RUN (Split-screen Auto-Runner) ====================
function initPixelRun(area, setStatus) {
  const {canvas, ctx, w, h} = createCanvas(area);
  const HALF = h / 2, DIVIDER = 4;
  const GRAVITY = 0.58, JUMP_V = -10, DOUBLE_JUMP_V = -8.5;
  const CHAR_W = 16, CHAR_H = 22;
  const GROUND_H = 30;
  const GAME_DUR = 60;
  const SEG_GROUND = 0, SEG_GAP = 1, SEG_PLATFORM = 2;

  const ITEM_TYPES = [
    { name:'SPEED', label:'\u26A1', color:'#FF9800' },
    { name:'QUAKE', label:'~', color:'#F44336' },
    { name:'BLIND', label:'\u25C9', color:'#9C27B0' },
    { name:'SHIELD', label:'\u2605', color:'#4CAF50' },
  ];

  let particles = [], scorePopups = [];

  function makeLane(pColor, idx) {
    return {
      color: pColor, idx,
      x: w * 0.18, y: 0, vy: 0, onGround: true, hasDoubleJump: true,
      score: 0, invincible: 0, legPhase: 0,
      segments: [], coins: [], enemies: [], items: [],
      scrollX: 0, nextSegX: 0,
      combo: 0, comboTimer: 0,
      fxSpeed: 0, fxQuake: 0, fxBlind: 0, fxShield: 0,
      dustTimer: 0, scarfPts: [],
    };
  }

  let p1 = makeLane('#E53935', 0);
  let p2 = makeLane('#1E88E5', 1);
  let speed = 3.5, timer = GAME_DUR, gameOver = false, started = false;
  let frameCount = 0, lastTimerTick = 0;
  const SEGMENT_W = 80;

  const mountains = [];
  for (let i = 0; i < 12; i++) mountains.push({ x: i * (w/5), h: 25 + Math.random()*60, w: 50 + Math.random()*90 });
  const treeBG = [];
  for (let i = 0; i < 20; i++) treeBG.push({ x: i * (w/8) + Math.random()*20, h: 12 + Math.random()*28, w: 8 + Math.random()*12 });

  function groundY(lane, halfH) { return halfH - GROUND_H - 10; }

  function generateSegments(lane, halfH) {
    const gY = groundY(lane, halfH);
    while (lane.nextSegX < lane.scrollX + w + 300) {
      const difficulty = Math.min(1, (GAME_DUR - timer) / GAME_DUR);
      const r = Math.random();
      let seg;
      if (lane.segments.length < 3 || r < 0.5 - difficulty * 0.15) {
        const count = 2 + Math.floor(Math.random() * 3);
        seg = { type: SEG_GROUND, x: lane.nextSegX, w: SEGMENT_W * count, y: gY };
        for (let ci = 0; ci < count; ci++) {
          if (Math.random() < 0.45) lane.coins.push({ x: lane.nextSegX + ci * SEGMENT_W + SEGMENT_W/2, y: gY - 30, value: 1, pulse: Math.random()*Math.PI*2 });
        }
        if (Math.random() < 0.07 + difficulty * 0.06) {
          const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
          lane.items.push({ x: lane.nextSegX + SEGMENT_W*(0.5 + Math.random()*(count-1)), y: gY - 55, type, pulse: 0 });
        }
        if (difficulty > 0.12 && Math.random() < 0.3 + difficulty * 0.3) {
          const ex = lane.nextSegX + SEGMENT_W * (1 + Math.floor(Math.random()*(count-1)));
          lane.enemies.push({ x: ex, y: gY, w: 14, h: 14, type: Math.random() < 0.5 ? 'spike' : 'cube', alive: true });
        }
        lane.nextSegX += seg.w;
      } else if (r < 0.72) {
        const gapW = 45 + difficulty * 55 + Math.random() * 30;
        seg = { type: SEG_GAP, x: lane.nextSegX, w: gapW, y: gY };
        lane.nextSegX += gapW;
        const afterW = SEGMENT_W * (2 + Math.floor(Math.random()*2));
        lane.segments.push(seg);
        seg = { type: SEG_GROUND, x: lane.nextSegX, w: afterW, y: gY };
        lane.nextSegX += afterW;
      } else {
        const gapW = 65 + difficulty * 45;
        seg = { type: SEG_GAP, x: lane.nextSegX, w: gapW, y: gY };
        lane.segments.push(seg);
        const platX = lane.nextSegX + gapW * 0.3;
        const platW = 50 + Math.random() * 30;
        const platY = gY - 45 - Math.random() * 25;
        lane.segments.push({ type: SEG_PLATFORM, x: platX, w: platW, y: platY });
        lane.coins.push({ x: platX + platW/2, y: platY - 25, value: 3, pulse: Math.random()*Math.PI*2 });
        lane.nextSegX += gapW;
        const afterW = SEGMENT_W * 2;
        lane.segments.push({ type: SEG_GROUND, x: lane.nextSegX, w: afterW, y: gY });
        lane.nextSegX += afterW;
      }
      lane.segments.push(seg);
    }
    lane.segments = lane.segments.filter(s => s.x + s.w > lane.scrollX - 100);
    lane.coins = lane.coins.filter(c => c.x > lane.scrollX - 50);
    lane.enemies = lane.enemies.filter(e => e.x > lane.scrollX - 50);
    lane.items = lane.items.filter(it => it.x > lane.scrollX - 50);
  }

  function initLane(lane, halfH) {
    lane.segments = []; lane.coins = []; lane.enemies = []; lane.items = [];
    lane.scrollX = 0; lane.nextSegX = 0;
    const gY = groundY(lane, halfH);
    lane.segments.push({ type: SEG_GROUND, x: 0, w: SEGMENT_W * 5, y: gY });
    lane.nextSegX = SEGMENT_W * 5;
    lane.y = 0; lane.vy = 0; lane.onGround = true; lane.hasDoubleJump = true;
    lane.score = 0; lane.invincible = 0;
    lane.combo = 0; lane.comboTimer = 0;
    lane.fxSpeed = 0; lane.fxQuake = 0; lane.fxBlind = 0; lane.fxShield = 0;
    lane.scarfPts = [];
    generateSegments(lane, halfH);
  }

  initLane(p1, HALF); initLane(p2, HALF);

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    if (gameOver) return;
    if (!started) started = true;
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const y = (t.clientY - rect.top) / rect.height * h;
      if (y < HALF) doJump(p1); else doJump(p2);
    }
  });
  canvas.addEventListener('mousedown', e => {
    if (gameOver) return;
    if (!started) started = true;
    const rect = canvas.getBoundingClientRect();
    const y = (e.clientY - rect.top) / rect.height * h;
    if (y < HALF) doJump(p1); else doJump(p2);
  });

  function doJump(lane) {
    const gY = groundY(lane, HALF);
    if (lane.onGround) {
      lane.vy = JUMP_V; lane.onGround = false; lane.hasDoubleJump = true;
      SND.pop();
      for (let i = 0; i < 5; i++) particles.push({ x: lane.x + (Math.random()-0.5)*12, y: gY, vx: (Math.random()-0.5)*3-1, vy: -Math.random()*2-0.5, life: 15, maxLife: 15, color: '#a09070', laneIdx: lane.idx });
    } else if (lane.hasDoubleJump) {
      lane.vy = DOUBLE_JUMP_V; lane.hasDoubleJump = false;
      SND.click();
      for (let i = 0; i < 6; i++) {
        const a = (i/6)*Math.PI*2;
        particles.push({ x: lane.x, y: gY + lane.y, vx: Math.cos(a)*2.5, vy: Math.sin(a)*2.5, life: 12, maxLife: 12, color: '#fff', laneIdx: lane.idx });
      }
    }
  }

  function getGroundAt(lane, px) {
    for (const seg of lane.segments) {
      if (seg.type === SEG_GAP) continue;
      if (px >= seg.x - lane.scrollX && px <= seg.x + seg.w - lane.scrollX) return seg.y;
    }
    return null;
  }

  function applyItem(lane, opponent, item) {
    const t = item.type;
    if (t.name === 'SPEED') opponent.fxSpeed = 180;
    else if (t.name === 'QUAKE') opponent.fxQuake = 180;
    else if (t.name === 'BLIND') opponent.fxBlind = 180;
    else if (t.name === 'SHIELD') { lane.fxShield = 240; lane.invincible = Math.max(lane.invincible, 240); }
    SND.chime();
    const gY = groundY(lane, HALF);
    scorePopups.push({ x: lane.x, y: gY + lane.y - 35, text: t.name + '!', life: 50, maxLife: 50, color: t.color, laneIdx: lane.idx });
    for (let i = 0; i < 10; i++) {
      const a = (i/10)*Math.PI*2;
      particles.push({ x: item.x - lane.scrollX, y: item.y, vx: Math.cos(a)*3.5, vy: Math.sin(a)*3.5, life: 20, maxLife: 20, color: t.color, laneIdx: lane.idx });
    }
  }

  let raf;
  function update() {
    frameCount++;
    if (!started) { draw(); raf = requestAnimationFrame(update); return; }
    if (gameOver) { draw(); return; }

    const elapsed = GAME_DUR - timer;
    speed = 3.5 + (elapsed / GAME_DUR) * 5.5;

    if (frameCount - lastTimerTick >= 60) {
      lastTimerTick = frameCount;
      timer--;
      if (timer <= 0) {
        timer = 0; gameOver = true;
        const msg = p1.score > p2.score ? 'P1 Wins!' : p2.score > p1.score ? 'P2 Wins!' : 'Draw!';
        SND.win();
        setStatus(`${msg} P1:${p1.score} P2:${p2.score}`);
        setTimeout(() => showOverlay(area, `${msg}<br>P1: ${p1.score} | P2: ${p2.score}`, 'Rematch', restart), 800);
        return;
      }
    }

    for (const [lane, opponent] of [[p1, p2], [p2, p1]]) {
      const halfH = HALF;
      const laneSpeed = speed * (lane.fxSpeed > 0 ? 1.5 : 1);
      lane.scrollX += laneSpeed;
      lane.invincible = Math.max(0, lane.invincible - 1);
      if (lane.fxSpeed > 0) lane.fxSpeed--;
      if (lane.fxQuake > 0) lane.fxQuake--;
      if (lane.fxBlind > 0) lane.fxBlind--;
      if (lane.fxShield > 0) lane.fxShield--;
      if (lane.comboTimer > 0) lane.comboTimer--; else lane.combo = 0;

      generateSegments(lane, halfH);

      lane.vy += GRAVITY;
      lane.y += lane.vy;

      const charScreenX = lane.x;
      const gnd = getGroundAt(lane, charScreenX);
      if (gnd !== null) {
        if (lane.y >= 0 && lane.vy >= 0) {
          lane.y = 0; lane.vy = 0; lane.onGround = true; lane.hasDoubleJump = true;
        }
      } else {
        let onPlat = false;
        for (const seg of lane.segments) {
          if (seg.type !== SEG_PLATFORM) continue;
          const sx = seg.x - lane.scrollX;
          if (charScreenX >= sx && charScreenX <= sx + seg.w) {
            const platRelY = seg.y - groundY(lane, halfH);
            if (lane.y >= platRelY && lane.y - lane.vy < platRelY + 5 && lane.vy >= 0) {
              lane.y = platRelY; lane.vy = 0; lane.onGround = true; lane.hasDoubleJump = true;
              onPlat = true; break;
            }
          }
        }
        if (!onPlat && lane.y > HALF + 20) {
          lane.y = -60; lane.vy = 0; lane.onGround = false; lane.hasDoubleJump = true;
          lane.invincible = 60; lane.combo = 0; lane.scrollX += 80;
        }
      }

      for (const seg of lane.segments) {
        if (seg.type !== SEG_PLATFORM) continue;
        const sx = seg.x - lane.scrollX;
        if (charScreenX >= sx && charScreenX <= sx + seg.w) {
          const platRelY = seg.y - groundY(lane, halfH);
          if (lane.y >= platRelY && lane.y - lane.vy < platRelY + 5 && lane.vy >= 0) {
            lane.y = platRelY; lane.vy = 0; lane.onGround = true; lane.hasDoubleJump = true; break;
          }
        }
      }

      if (lane.onGround) {
        lane.legPhase += laneSpeed * 0.12;
        lane.dustTimer++;
        if (lane.dustTimer % 5 === 0) {
          const gY = groundY(lane, halfH);
          particles.push({ x: lane.x - 6, y: gY + 4, vx: -Math.random()*1.5-0.5, vy: -Math.random()*0.8, life: 14, maxLife: 14, color: '#9e8e7e', laneIdx: lane.idx });
        }
      }

      const gY = groundY(lane, halfH);
      lane.scarfPts.unshift({ x: lane.x - 10, y: gY + lane.y - 18 });
      if (lane.scarfPts.length > 7) lane.scarfPts.pop();

      for (let i = lane.coins.length - 1; i >= 0; i--) {
        const c = lane.coins[i];
        const cx = c.x - lane.scrollX;
        if (Math.abs(charScreenX - cx) < 20 && Math.abs(lane.y - (c.y - gY)) < 30) {
          const mult = Math.min(4, 1 + Math.floor(lane.combo / 3));
          lane.score += c.value * mult;
          lane.combo++; lane.comboTimer = 90;
          SND.chime();
          const txt = mult > 1 ? '+' + c.value + 'x' + mult : '+' + c.value;
          scorePopups.push({ x: cx, y: c.y, text: txt, life: 40, maxLife: 40, color: c.value >= 3 ? '#FFD700' : '#FFC107', laneIdx: lane.idx });
          for (let j = 0; j < 5; j++) particles.push({ x: cx, y: c.y, vx: (Math.random()-0.5)*4, vy: -Math.random()*3, life: 15, maxLife: 15, color: '#ffd700', laneIdx: lane.idx });
          lane.coins.splice(i, 1);
        }
      }

      for (let i = lane.items.length - 1; i >= 0; i--) {
        const it = lane.items[i];
        const ix = it.x - lane.scrollX;
        if (Math.abs(charScreenX - ix) < 22 && Math.abs(lane.y - (it.y - gY)) < 32) {
          applyItem(lane, opponent, it);
          lane.items.splice(i, 1);
        }
      }

      for (let i = lane.enemies.length - 1; i >= 0; i--) {
        const e = lane.enemies[i];
        if (!e.alive) continue;
        const ex = e.x - lane.scrollX;
        if (Math.abs(charScreenX - ex) < 16 && Math.abs(lane.y) < 22) {
          if (lane.invincible > 0) {
            e.alive = false; lane.score += 3; SND.score();
            for (let j = 0; j < 6; j++) particles.push({ x: ex, y: gY-5, vx: (Math.random()-0.5)*5, vy: -Math.random()*4, life: 18, maxLife: 18, color: '#ff6644', laneIdx: lane.idx });
            continue;
          }
          if (lane.vy > 0 && lane.y < 0) {
            e.alive = false; lane.score += 5; lane.vy = JUMP_V * 0.6; SND.score();
            for (let j = 0; j < 6; j++) particles.push({ x: ex, y: gY-5, vx: (Math.random()-0.5)*5, vy: -Math.random()*4, life: 18, maxLife: 18, color: '#cc44cc', laneIdx: lane.idx });
          } else {
            lane.y = -60; lane.vy = 0; lane.onGround = false; lane.hasDoubleJump = true;
            lane.invincible = 60; lane.combo = 0; SND.buzz();
          }
        }
      }
    }

    particles = particles.filter(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life--; return p.life > 0; });
    scorePopups = scorePopups.filter(p => { p.y -= 1.2; p.life--; return p.life > 0; });

    const m = Math.floor(timer / 60), s = timer % 60;
    setStatus(m + ':' + s.toString().padStart(2,'0') + ' | P1:' + p1.score + ' P2:' + p2.score);
    draw();
    raf = requestAnimationFrame(update);
  }

  function lerpColor(a, b, t) {
    const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
    const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
    const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
    return 'rgb(' + Math.round(ar+(br-ar)*t) + ',' + Math.round(ag+(bg-ag)*t) + ',' + Math.round(ab+(bb-ab)*t) + ')';
  }

  function drawChar(lane, gY) {
    const x = lane.x, y = gY + lane.y;
    if (lane.invincible > 0 && frameCount % 6 < 3) return;
    if (lane.fxShield > 0) {
      ctx.strokeStyle = 'rgba(76,175,80,' + (0.4 + Math.sin(frameCount*0.1)*0.2) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y - 8, 24, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = 'rgba(76,175,80,0.06)';
      ctx.beginPath(); ctx.arc(x, y - 8, 24, 0, Math.PI*2); ctx.fill();
    }
    const scarfColor = lane.color === '#E53935' ? '#FF8A80' : '#82B1FF';
    if (lane.scarfPts.length > 1) {
      for (let i = 1; i < lane.scarfPts.length; i++) {
        ctx.globalAlpha = (1 - i / lane.scarfPts.length) * 0.7;
        ctx.strokeStyle = scarfColor; ctx.lineWidth = 3.5 - i*0.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(lane.scarfPts[i-1].x, lane.scarfPts[i-1].y);
        ctx.lineTo(lane.scarfPts[i].x, lane.scarfPts[i].y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const bodyW = CHAR_W, bodyH = 14, headR = 7;
    ctx.fillStyle = lane.color;
    ctx.beginPath(); ctx.roundRect(x - bodyW/2, y - bodyH, bodyW, bodyH, 3); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - bodyH - headR + 2, headR, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + 2, y - bodyH - headR + 1, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x + 3.2, y - bodyH - headR + 1, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = lane.color; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    const armSwing = Math.sin(lane.legPhase + Math.PI*0.5) * 5;
    ctx.beginPath(); ctx.moveTo(x - bodyW/2, y - bodyH + 4); ctx.lineTo(x - bodyW/2 - 5 + armSwing, y - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + bodyW/2, y - bodyH + 4); ctx.lineTo(x + bodyW/2 + 5 - armSwing, y - 3); ctx.stroke();
    const legSwing = Math.sin(lane.legPhase) * 6;
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 4 + legSwing, y + 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 4 - legSwing, y + 10); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(x, gY + 12, 10, 3, 0, 0, Math.PI*2); ctx.fill();
    if (lane.combo >= 3) {
      const intensity = Math.min(1, lane.combo / 12);
      const colors = lane.combo >= 9 ? ['#FF1744','#FF5252','#FF8A80'] : lane.combo >= 6 ? ['#FF9100','#FFB74D','#FFE0B2'] : ['#FFD600','#FFEE58','#FFF9C4'];
      for (let i = 0; i < 3 + intensity*3; i++) {
        const fx = x + (Math.random()-0.5)*10, fy = y - bodyH - headR*2 + 3 - Math.random()*(8 + intensity*6);
        ctx.globalAlpha = 0.5 + Math.random()*0.3;
        ctx.fillStyle = colors[Math.floor(Math.random()*colors.length)];
        ctx.beginPath(); ctx.arc(fx, fy, 2 + Math.random()*4*intensity, 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const mult = Math.min(4, 1 + Math.floor(lane.combo / 3));
      ctx.fillStyle = colors[0]; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('x' + mult, x, y - bodyH - headR*2 - 5);
      ctx.textAlign = 'left';
    }
  }

  function drawLaneContent(lane, halfH) {
    const gY = groundY(lane, halfH);
    const progress = 1 - timer / GAME_DUR;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, halfH);
    if (progress < 0.3) {
      skyGrad.addColorStop(0, '#0a0a2e'); skyGrad.addColorStop(0.5, '#1a1a4e'); skyGrad.addColorStop(1, '#0d0d28');
    } else if (progress < 0.6) {
      const t = (progress - 0.3) / 0.3;
      skyGrad.addColorStop(0, lerpColor('#0a0a2e','#1a1040',t));
      skyGrad.addColorStop(0.5, lerpColor('#1a1a4e','#4a2060',t));
      skyGrad.addColorStop(0.85, lerpColor('#0d0d28','#c04030',t));
      skyGrad.addColorStop(1, lerpColor('#0d0d28','#e08040',t));
    } else {
      const t = (progress - 0.6) / 0.4;
      skyGrad.addColorStop(0, lerpColor('#1a1040','#2060a0',t));
      skyGrad.addColorStop(0.5, lerpColor('#4a2060','#4090c0',t));
      skyGrad.addColorStop(0.85, lerpColor('#c04030','#80c0e0',t));
      skyGrad.addColorStop(1, lerpColor('#e08040','#e0d090',t));
    }
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, w, halfH);

    if (progress < 0.7) {
      const starAlpha = Math.max(0, 1 - progress/0.7) * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,' + starAlpha + ')';
      for (let i = 0; i < 25; i++) {
        const sx = ((i*137+50) % w + w - (lane.scrollX*0.03) % w) % w;
        const sy = (i*89 + i*i*13) % (halfH*0.55);
        ctx.fillRect(sx, sy, 1 + (i%3)*0.5, 1 + (i%3)*0.5);
      }
    }

    ctx.fillStyle = progress < 0.5 ? 'rgba(30,30,60,0.6)' : 'rgba(60,80,100,0.4)';
    for (const m of mountains) {
      const mx = ((m.x - lane.scrollX*0.04) % (w*1.5) + w*1.5) % (w*1.5) - w*0.25;
      ctx.beginPath(); ctx.moveTo(mx - m.w/2, gY+5); ctx.lineTo(mx, gY - m.h); ctx.lineTo(mx + m.w/2, gY+5); ctx.fill();
    }

    ctx.fillStyle = progress < 0.5 ? 'rgba(20,50,30,0.5)' : 'rgba(40,90,50,0.4)';
    for (const t of treeBG) {
      const tx = ((t.x - lane.scrollX*0.12) % (w*1.2) + w*1.2) % (w*1.2) - w*0.1;
      ctx.beginPath(); ctx.moveTo(tx - t.w/2, gY+3); ctx.lineTo(tx, gY - t.h); ctx.lineTo(tx + t.w/2, gY+3); ctx.fill();
    }

    for (const seg of lane.segments) {
      const sx = seg.x - lane.scrollX;
      if (sx > w + 10 || sx + seg.w < -10) continue;
      if (seg.type === SEG_GROUND) {
        ctx.fillStyle = '#3E2723'; ctx.fillRect(sx, gY + 6, seg.w, GROUND_H + 20);
        ctx.fillStyle = '#4E342E'; ctx.fillRect(sx, gY + 3, seg.w, 6);
        ctx.fillStyle = '#2E7D32'; ctx.fillRect(sx, gY, seg.w, 5);
        ctx.fillStyle = '#43A047'; ctx.fillRect(sx, gY - 1, seg.w, 3);
        ctx.fillStyle = '#66BB6A';
        for (let gx = sx; gx < sx + seg.w; gx += 8) {
          const gh = 3 + Math.sin(gx*0.3 + frameCount*0.05)*1.5;
          ctx.fillRect(gx, gY - gh, 2, gh + 1);
        }
      } else if (seg.type === SEG_PLATFORM) {
        ctx.fillStyle = '#5D4037';
        ctx.beginPath(); ctx.roundRect(sx, seg.y, seg.w, 8, 3); ctx.fill();
        ctx.fillStyle = '#795548'; ctx.fillRect(sx + 2, seg.y + 1, seg.w - 4, 3);
        ctx.fillStyle = '#4E342E';
        ctx.fillRect(sx + 5, seg.y + 8, 3, gY - seg.y - 8);
        ctx.fillRect(sx + seg.w - 8, seg.y + 8, 3, gY - seg.y - 8);
      }
    }

    for (const it of lane.items) {
      const ix = it.x - lane.scrollX;
      if (ix < -30 || ix > w + 30) continue;
      it.pulse += 0.08;
      const bob = Math.sin(it.pulse) * 4;
      const iy = it.y + bob;
      ctx.fillStyle = it.type.color + '22';
      ctx.beginPath(); ctx.arc(ix, iy, 22, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = it.type.color;
      ctx.save(); ctx.translate(ix, iy); ctx.rotate(Math.PI/4);
      ctx.beginPath(); ctx.roundRect(-7, -7, 14, 14, 3); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(it.type.label, ix, iy);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }

    for (const c of lane.coins) {
      const cx = c.x - lane.scrollX;
      if (cx < -20 || cx > w + 20) continue;
      c.pulse += 0.08;
      const r = 6 + Math.sin(c.pulse)*1.5;
      ctx.fillStyle = c.value >= 3 ? '#FFD700' : '#FFC107';
      ctx.beginPath(); ctx.arc(cx, c.y, r, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.arc(cx - 1.5, c.y - 1.5, r*0.35, 0, Math.PI*2); ctx.fill();
      if (c.value >= 3) {
        ctx.strokeStyle = 'rgba(255,215,0,' + (0.3 + Math.sin(c.pulse)*0.2) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, c.y, r + 4, 0, Math.PI*2); ctx.stroke();
      }
    }

    for (const e of lane.enemies) {
      if (!e.alive) continue;
      const ex = e.x - lane.scrollX;
      if (ex < -20 || ex > w + 20) continue;
      if (e.type === 'spike') {
        ctx.fillStyle = '#E53935';
        ctx.beginPath(); ctx.arc(ex, gY - 8, 8, 0, Math.PI*2); ctx.fill();
        for (let a = 0; a < 8; a++) {
          const angle = (a/8)*Math.PI*2 + frameCount*0.05;
          ctx.strokeStyle = '#B71C1C'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ex + Math.cos(angle)*8, gY - 8 + Math.sin(angle)*8);
          ctx.lineTo(ex + Math.cos(angle)*13, gY - 8 + Math.sin(angle)*13); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(229,57,53,0.15)';
        ctx.beginPath(); ctx.arc(ex, gY - 8, 16, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.fillStyle = '#7B1FA2';
        ctx.beginPath(); ctx.roundRect(ex - 7, gY - 15, 14, 14, 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(ex - 4, gY - 12, 3, 3); ctx.fillRect(ex + 1, gY - 12, 3, 3);
        ctx.fillStyle = '#E53935'; ctx.fillRect(ex - 3, gY - 11, 2, 2); ctx.fillRect(ex + 2, gY - 11, 2, 2);
        ctx.strokeStyle = '#E53935'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(ex - 5, gY - 14); ctx.lineTo(ex - 1, gY - 13); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex + 5, gY - 14); ctx.lineTo(ex + 1, gY - 13); ctx.stroke();
      }
    }

    for (const p of particles) {
      if (p.laneIdx !== lane.idx) continue;
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of scorePopups) {
      if (p.laneIdx !== lane.idx) continue;
      ctx.globalAlpha = Math.min(1, p.life / (p.maxLife * 0.4));
      ctx.fillStyle = p.color; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y); ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;

    drawChar(lane, gY);

    if (lane.fxSpeed > 0) {
      ctx.strokeStyle = 'rgba(255,152,0,' + (0.2 + Math.sin(frameCount*0.2)*0.1) + ')';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const ly = Math.random()*halfH, lx = Math.random()*w;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - 30 - Math.random()*20, ly); ctx.stroke();
      }
    }

    if (lane.fxBlind > 0) {
      const blindAlpha = Math.min(0.7, lane.fxBlind / 60);
      const fogGrad = ctx.createRadialGradient(lane.x, gY + lane.y, 30, lane.x, gY + lane.y, halfH*0.7);
      fogGrad.addColorStop(0, 'rgba(20,0,40,0)');
      fogGrad.addColorStop(0.3, 'rgba(20,0,40,' + blindAlpha*0.3 + ')');
      fogGrad.addColorStop(1, 'rgba(20,0,40,' + blindAlpha + ')');
      ctx.fillStyle = fogGrad; ctx.fillRect(0, 0, w, halfH);
    }
  }

  function draw() {
    ctx.fillStyle = '#0a0a1e'; ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, HALF - DIVIDER/2); ctx.clip();
    if (p1.fxQuake > 0) ctx.translate((Math.random()-0.5)*8, (Math.random()-0.5)*6);
    drawLaneContent(p1, HALF);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText('P1: ' + p1.score, 8, 16);
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(0, HALF + DIVIDER/2, w, HALF); ctx.clip();
    ctx.translate(0, HALF + DIVIDER/2);
    if (p2.fxQuake > 0) ctx.translate((Math.random()-0.5)*8, (Math.random()-0.5)*6);
    drawLaneContent(p2, HALF - DIVIDER/2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = 'bold 12px sans-serif';
    ctx.fillText('P2: ' + p2.score, 8, 16);
    ctx.restore();

    const divGrad = ctx.createLinearGradient(0, HALF - DIVIDER, 0, HALF + DIVIDER);
    divGrad.addColorStop(0, '#1a1a3e'); divGrad.addColorStop(0.5, '#2a2a4e'); divGrad.addColorStop(1, '#1a1a3e');
    ctx.fillStyle = divGrad; ctx.fillRect(0, HALF - DIVIDER, w, DIVIDER*2);

    const diff = p1.score - p2.score;
    if (diff !== 0 && started) {
      const leaderColor = diff > 0 ? '#E53935' : '#1E88E5';
      ctx.fillStyle = leaderColor; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText((diff > 0 ? '\u25B2 P1 +' : '\u25BC P2 +') + Math.abs(diff), w/2, HALF + 4);
      ctx.textAlign = 'left';
    }

    const m = Math.floor(timer / 60), s = timer % 60;
    ctx.fillStyle = timer <= 10 ? '#E53935' : '#FFD54F';
    ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(m + ':' + s.toString().padStart(2,'0'), w - 8, HALF + 5);
    ctx.textAlign = 'left';

    ctx.font = '9px sans-serif';
    if (p1.fxSpeed > 0) { ctx.fillStyle = '#FF9800'; ctx.fillText('\u26A1 SPEED!', 6, 14); }
    if (p1.fxQuake > 0) { ctx.fillStyle = '#F44336'; ctx.fillText('~ QUAKE!', 6, 26); }
    if (p1.fxBlind > 0) { ctx.fillStyle = '#9C27B0'; ctx.fillText('\u25C9 BLIND!', 6, 38); }
    if (p1.fxShield > 0) { ctx.fillStyle = '#4CAF50'; ctx.fillText('\u2605 SHIELD', 6, 50); }
    if (p2.fxSpeed > 0) { ctx.fillStyle = '#FF9800'; ctx.fillText('\u26A1 SPEED!', 6, HALF + DIVIDER + 14); }
    if (p2.fxQuake > 0) { ctx.fillStyle = '#F44336'; ctx.fillText('~ QUAKE!', 6, HALF + DIVIDER + 26); }
    if (p2.fxBlind > 0) { ctx.fillStyle = '#9C27B0'; ctx.fillText('\u25C9 BLIND!', 6, HALF + DIVIDER + 38); }
    if (p2.fxShield > 0) { ctx.fillStyle = '#4CAF50'; ctx.fillText('\u2605 SHIELD', 6, HALF + DIVIDER + 50); }

    if (!started && !gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 24px sans-serif';
      ctx.fillText('PIXEL RUN', w/2, HALF - 35);
      ctx.font = '13px sans-serif'; ctx.fillStyle = '#ddd';
      ctx.fillText('Tap your half to jump (double-tap = double jump)', w/2, HALF - 10);
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#aaa';
      ctx.fillText('Collect coins, stomp enemies, grab items!', w/2, HALF + 12);
      ctx.font = '11px sans-serif'; ctx.fillStyle = '#FF9800';
      ctx.fillText('\u25C6 Items sabotage your opponent!', w/2, HALF + 32);
      ctx.textAlign = 'left';
    }
  }

  function restart() {
    initLane(p1, HALF); initLane(p2, HALF);
    speed = 3.5; timer = GAME_DUR; gameOver = false; started = false;
    frameCount = 0; lastTimerTick = 0;
    particles = []; scorePopups = [];
    setStatus('Tap to start!');
    raf = requestAnimationFrame(update);
  }

  setStatus('Tap to start!');
  raf = requestAnimationFrame(update);
  return () => cancelAnimationFrame(raf);
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
  const PAIRS = 16, TOTAL = 32, COLS = 8;
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
  const sz = Math.min(area.getBoundingClientRect().width * 0.97, area.getBoundingClientRect().height * 0.82);
  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${COLS},1fr);gap:5px;width:${sz}px;padding:6px`;
  wrap.appendChild(grid);
  const cardEls = [];
  for (let i = 0; i < TOTAL; i++) {
    const el = document.createElement('div');
    el.style.cssText = 'aspect-ratio:1;background:#2a2a4a;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.5em;cursor:pointer;transition:background .2s';
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
  cont.style.cssText = 'width:min(92vw,400px)';
  wrap.appendChild(cont);
  function renderBeans(count, active) {
    if (count === 0) return '';
    const BEAN_COLORS = ['#8B4513','#A0522D','#6B3410','#7B3F00','#5C3317','#D2691E'];
    let h = '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:2px;padding:2px">';
    for (let b = 0; b < Math.min(count, 12); b++) {
      const col = BEAN_COLORS[b % BEAN_COLORS.length];
      h += `<div style="width:10px;height:13px;border-radius:50%;background:${col};box-shadow:inset -1px -1px 2px rgba(0,0,0,.4),inset 1px 1px 1px rgba(255,255,255,.2)"></div>`;
    }
    if (count > 12) h += `<div style="font-size:.6em;color:#ddd;width:100%;text-align:center">+${count-12}</div>`;
    h += '</div>';
    return h;
  }
  function render() {
    let h = `<div style="text-align:center;margin-bottom:6px;font-weight:bold;color:${turn===1?'#fff':'#888'}">▲ ${online ? (online.playerId===1?'You':'Opp') : 'P2'}: ${scores[1]}</div>`;
    h += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;margin-bottom:4px">';
    for (let i = 11; i >= 6; i--) {
      const a = turn===1 && board[i]>0 && !gameOver && (!online || online.playerId===1);
      h += `<div data-pit="${i}" style="background:${a?'#6D4C41':'#3E2723'};padding:6px 3px;border-radius:12px;text-align:center;cursor:${a?'pointer':'default'};min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative">`;
      h += renderBeans(board[i], a);
      h += `<div style="font-size:.65em;color:#aaa;margin-top:1px">${board[i]}</div></div>`;
    }
    h += '</div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px">';
    for (let i = 0; i <= 5; i++) {
      const a = turn===0 && board[i]>0 && !gameOver && (!online || online.playerId===0);
      h += `<div data-pit="${i}" style="background:${a?'#6D4C41':'#3E2723'};padding:6px 3px;border-radius:12px;text-align:center;cursor:${a?'pointer':'default'};min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative">`;
      h += renderBeans(board[i], a);
      h += `<div style="font-size:.65em;color:#aaa;margin-top:1px">${board[i]}</div></div>`;
    }
    h += `</div><div style="text-align:center;margin-top:6px;font-weight:bold;color:${turn===0?'#fff':'#888'}">▼ ${online ? (online.playerId===0?'You':'Opp') : 'P1'}: ${scores[0]}</div>`;
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
  return () => { if (online) online.cleanup(); };
}

// ==================== MASTERMIND ====================
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
  const PW = 28, PH = 20, BULLET_SPD = 7, ALIEN_BULLET_SPD = 3.5;
  const SHIELD_ROWS = 3, SHIELD_COLS = 8, SHIELD_BLOCK = 6;
  const MID = h / 2;
  const CTRL_H = 50; // control zone height
  const P1_SHIP_Y = h - CTRL_H - 25; // P1 ship center (above control zone)
  const P2_SHIP_Y = CTRL_H + 25;     // P2 ship center (below control zone)

  function sfxShoot() { SND.shoot(); }
  function sfxHit() { SND.boom(); }
  function sfxAlienDie() { SND.alienDie(); }

  // Players: P1 at bottom, P2 at top (inverted)
  let p1 = {x: w/2, hp: 3, score: 0, cooldown: 0, alive: true};
  let p2 = {x: w/2, hp: 3, score: 0, cooldown: 0, alive: true};
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
  let alienShootTimer = 0, wave = 1;
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
    const by = player === 0 ? P1_SHIP_Y - 10 : P2_SHIP_Y + 10;
    const dy = player === 0 ? -BULLET_SPD : BULLET_SPD;
    const col = player === 0 ? '#FF6B6B' : '#64B5F6';
    bullets.push({x: bx, y: by, dy, owner: player, color: col});
    p.cooldown = 12;
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
          if (b.owner === 0) p1.score += a.type.points;
          else p2.score += a.type.points;
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

    // Move aliens
    let edgeHit = false;
    for (const a of aliens) {
      if (!a.alive) continue;
      a.x += alienDir * alienSpeed;
      a.frame += 0.02;
      if (a.x < 15 || a.x > w - 15) edgeHit = true;
    }
    if (edgeHit) {
      alienDir = -alienDir;
      // Don't drop aliens vertically — they stay in the middle band
    }

    // Alien shooting
    alienShootTimer++;
    const shootInterval = Math.max(20, 60 - wave * 5);
    if (alienShootTimer >= shootInterval) {
      alienShootTimer = 0;
      const liveAliens = aliens.filter(a => a.alive);
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
        p1 = {x:w/2,hp:3,score:0,cooldown:0,alive:true};
        p2 = {x:w/2,hp:3,score:0,cooldown:0,alive:true};
        bullets = []; explosions = []; wave = 1;
        spawnWave(); initShields(); gameOver = false;
        raf = requestAnimationFrame(loop);
      }), 1000);
    }

    if (!gameOver) setStatus(`P1:${p1.score} ❤${p1.hp} | Wave ${wave} | ❤${p2.hp} P2:${p2.score}`);
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
      ctx.fillStyle = t.color;
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

    // Players
    if (p1.alive) {
      ctx.fillStyle = '#FF4444';
      // P1 ship (triangle pointing up, above control zone)
      const p1y = P1_SHIP_Y;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1y - 10);
      ctx.lineTo(p1.x - PW/2, p1y - 10 + PH);
      ctx.lineTo(p1.x - PW/4, p1y - 10 + PH - 4);
      ctx.lineTo(p1.x + PW/4, p1y - 10 + PH - 4);
      ctx.lineTo(p1.x + PW/2, p1y - 10 + PH);
      ctx.closePath(); ctx.fill();
      // Cockpit
      ctx.fillStyle = '#FF8A80';
      ctx.beginPath(); ctx.arc(p1.x, p1y - 4, 4, 0, Math.PI*2); ctx.fill();
      // Engines
      if (autoFireP1) {
        ctx.fillStyle = `rgba(255,200,50,${0.5+Math.random()*0.5})`;
        ctx.beginPath(); ctx.moveTo(p1.x-5, p1y+10); ctx.lineTo(p1.x, p1y+16+Math.random()*4); ctx.lineTo(p1.x+5, p1y+10); ctx.fill();
      }
    }

    if (p2.alive) {
      ctx.fillStyle = '#4488FF';
      // P2 ship (triangle pointing down, below control zone)
      const p2y = P2_SHIP_Y;
      ctx.beginPath();
      ctx.moveTo(p2.x, p2y + 10);
      ctx.lineTo(p2.x - PW/2, p2y + 10 - PH);
      ctx.lineTo(p2.x - PW/4, p2y + 10 - PH + 4);
      ctx.lineTo(p2.x + PW/4, p2y + 10 - PH + 4);
      ctx.lineTo(p2.x + PW/2, p2y + 10 - PH);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#82B1FF';
      ctx.beginPath(); ctx.arc(p2.x, p2y + 4, 4, 0, Math.PI*2); ctx.fill();
      if (autoFireP2) {
        ctx.fillStyle = `rgba(255,200,50,${0.5+Math.random()*0.5})`;
        ctx.beginPath(); ctx.moveTo(p2.x-5, p2y-10); ctx.lineTo(p2.x, p2y-16-Math.random()*4); ctx.lineTo(p2.x+5, p2y-10); ctx.fill();
      }
    }

    // Bullets
    for (const b of bullets) {
      ctx.fillStyle = b.color;
      if (b.owner === 2) {
        ctx.fillRect(b.x - 1.5, b.y - 4, 3, 8);
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
    ctx.fillStyle = 'rgba(255,68,68,0.12)';
    ctx.fillRect(0, h - CTRL_H, w, CTRL_H);
    ctx.fillStyle = 'rgba(68,136,255,0.12)';
    ctx.fillRect(0, 0, w, CTRL_H);
    // Control zone labels
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('P1 — slide here', w/2, h - CTRL_H/2 + 3);
    ctx.fillText('P2 — slide here', w/2, CTRL_H/2 + 3);
    // Control zone borders
    ctx.strokeStyle = 'rgba(255,68,68,0.2)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h - CTRL_H); ctx.lineTo(w, h - CTRL_H); ctx.stroke();
    ctx.strokeStyle = 'rgba(68,136,255,0.2)';
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
  let p1y = h - 50, p2y = 50, p1x = w/2, p2x = w/2;
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
    ctx.fillStyle = 'rgba(239,83,80,0.10)';
    ctx.fillRect(0, h - CTRL_H, w, CTRL_H);
    ctx.fillStyle = 'rgba(66,165,245,0.10)';
    ctx.fillRect(0, 0, w, CTRL_H);
    ctx.strokeStyle = 'rgba(239,83,80,0.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h - CTRL_H); ctx.lineTo(w, h - CTRL_H); ctx.stroke();
    ctx.strokeStyle = 'rgba(66,165,245,0.18)';
    ctx.beginPath(); ctx.moveTo(0, CTRL_H); ctx.lineTo(w, CTRL_H); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
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

// ==================== SNAKES ====================
function initSnakes(area, setStatus) {
  const {canvas, ctx, w, h} = createCanvas(area);
  const COLS = 20, ROWS = Math.floor(h / (w / COLS));
  const CS = w / COLS;
  const midY = Math.floor(ROWS/2);
  let s1 = [{x:4,y:midY},{x:3,y:midY},{x:2,y:midY},{x:1,y:midY}], d1 = {x:1, y:0}, nd1 = {x:1, y:0};
  let s2 = [{x:COLS-5,y:midY},{x:COLS-4,y:midY},{x:COLS-3,y:midY},{x:COLS-2,y:midY}], d2 = {x:-1, y:0}, nd2 = {x:-1, y:0};
  let foods = [];
  let alive = [true, true], scores = [0, 0], speed = 250, totalEaten = 0;
  function spawnFood() {
    let f, tries = 0;
    do { f = {x:Math.floor(Math.random()*COLS), y:Math.floor(Math.random()*ROWS)}; tries++; }
    while (tries < 200 && (s1.some(s=>s.x===f.x&&s.y===f.y) || s2.some(s=>s.x===f.x&&s.y===f.y) || foods.some(fd=>fd.x===f.x&&fd.y===f.y)));
    return f;
  }
  foods.push(spawnFood()); foods.push(spawnFood());
  // Swipe controls — left half = P1, right half = P2
  const swipes = {};
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const x = (t.clientX - rect.left) / rect.width * w;
      const y = (t.clientY - rect.top) / rect.height * h;
      swipes[t.identifier] = {sx: x, sy: y, player: x < w / 2 ? 0 : 1};
    }
  });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const st = swipes[t.identifier]; if (!st) continue;
      const x = (t.clientX - rect.left) / rect.width * w;
      const y = (t.clientY - rect.top) / rect.height * h;
      const dx = x - st.sx, dy = y - st.sy;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        const dir = Math.abs(dx) > Math.abs(dy) ? {x: dx > 0 ? 1 : -1, y: 0} : {x: 0, y: dy > 0 ? 1 : -1};
        if (st.player === 0) { if (dir.x !== -d1.x || dir.y !== -d1.y) nd1 = dir; }
        else { if (dir.x !== -d2.x || dir.y !== -d2.y) nd2 = dir; }
        st.sx = x; st.sy = y;
      }
    }
  });
  canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) delete swipes[t.identifier]; });
  let interval;
  function step() {
    if (!alive[0] && !alive[1]) return;
    // Apply buffered directions
    d1 = nd1; d2 = nd2;
    // Move with wrap-around
    if (alive[0]) { const head = {x:(s1[0].x+d1.x+COLS)%COLS, y:(s1[0].y+d1.y+ROWS)%ROWS}; s1.unshift(head); }
    if (alive[1]) { const head = {x:(s2[0].x+d2.x+COLS)%COLS, y:(s2[0].y+d2.y+ROWS)%ROWS}; s2.unshift(head); }
    // Collision: only your head into opponent's body kills you
    for (let p = 0; p < 2; p++) {
      const s = p===0?s1:s2, other = p===0?s2:s1;
      const head = s[0];
      if (other.some(seg => seg.x===head.x && seg.y===head.y)) alive[p] = false;
    }
    // Food check (2 food items)
    let ateAny = [false, false];
    for (let p = 0; p < 2; p++) {
      const s = p===0?s1:s2;
      if (!alive[p]) continue;
      const fi = foods.findIndex(f => s[0].x === f.x && s[0].y === f.y);
      if (fi !== -1) {
        scores[p]++; ateAny[p] = true; totalEaten++; SND.pop();
        foods.splice(fi, 1);
        foods.push(spawnFood());
        // Speed up gradually (min 80ms)
        speed = Math.max(80, 250 - totalEaten * 8);
        clearInterval(interval);
        interval = setInterval(step, speed);
      } else { s.pop(); }
    }
    // Ensure always 2 foods
    while (foods.length < 2) foods.push(spawnFood());
    if (!alive[0] || !alive[1]) {
      clearInterval(interval); SND.buzz();
      const m = (!alive[0] && !alive[1]) ? 'Draw!' : (alive[0] ? 'P1 wins!' : 'P2 wins!');
      setStatus(m);
      setTimeout(() => showOverlay(area, `${m}<br>P1: ${scores[0]} | P2: ${scores[1]}`, 'Rematch', () => {
        s1 = [{x:4,y:midY},{x:3,y:midY},{x:2,y:midY},{x:1,y:midY}]; d1 = {x:1,y:0}; nd1 = {x:1,y:0};
        s2 = [{x:COLS-5,y:midY},{x:COLS-4,y:midY},{x:COLS-3,y:midY},{x:COLS-2,y:midY}]; d2 = {x:-1,y:0}; nd2 = {x:-1,y:0};
        foods = [spawnFood(), spawnFood()]; alive = [true, true]; scores = [0, 0]; speed = 250; totalEaten = 0;
        interval = setInterval(step, speed); draw();
      }), 600);
    } else {
      setStatus(`P1: ${scores[0]}  P2: ${scores[1]}`);
    }
    draw();
  }
  function draw() {
    ctx.fillStyle = '#0a1a0a'; ctx.fillRect(0, 0, w, h);
    // Grid
    ctx.strokeStyle = '#1a2a1a'; ctx.lineWidth = 0.5;
    for (let x=0;x<=COLS;x++){ctx.beginPath();ctx.moveTo(x*CS,0);ctx.lineTo(x*CS,ROWS*CS);ctx.stroke();}
    for (let y=0;y<=ROWS;y++){ctx.beginPath();ctx.moveTo(0,y*CS);ctx.lineTo(COLS*CS,y*CS);ctx.stroke();}
    // Swipe zone divider
    ctx.setLineDash([4,6]); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(w/2, 0); ctx.lineTo(w/2, ROWS*CS); ctx.stroke(); ctx.setLineDash([]);
    // Zone labels (subtle)
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('← P1 swipe', w*0.25, ROWS*CS - 6);
    ctx.fillText('P2 swipe →', w*0.75, ROWS*CS - 6);
    // Foods (2 items, different colors)
    const foodColors = ['#F44336','#FF9800'];
    foods.forEach((f, i) => {
      ctx.fillStyle = foodColors[i % 2];
      ctx.beginPath(); ctx.arc(f.x*CS+CS/2, f.y*CS+CS/2, CS*0.4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(f.x*CS+CS/2-2, f.y*CS+CS/2-2, CS*0.15, 0, Math.PI*2); ctx.fill();
    });
    // Snakes with rounded heads
    s1.forEach((s,i) => {
      ctx.fillStyle = i===0?'#66BB6A':'#4CAF50';
      if (i===0) { ctx.beginPath(); ctx.arc(s.x*CS+CS/2, s.y*CS+CS/2, CS/2-1, 0, Math.PI*2); ctx.fill(); }
      else ctx.fillRect(s.x*CS+1,s.y*CS+1,CS-2,CS-2);
    });
    s2.forEach((s,i) => {
      ctx.fillStyle = i===0?'#42A5F5':'#2196F3';
      if (i===0) { ctx.beginPath(); ctx.arc(s.x*CS+CS/2, s.y*CS+CS/2, CS/2-1, 0, Math.PI*2); ctx.fill(); }
      else ctx.fillRect(s.x*CS+1,s.y*CS+1,CS-2,CS-2);
    });
  }
  draw();
  interval = setInterval(step, speed);
  setStatus('P1: 0  P2: 0');
  return () => { clearInterval(interval); };
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
  const TW = w * 0.92, TH = h * 0.75, TX = (w-TW)/2, TY = (h-TH)/2;
  const BR = Math.min(TW,TH) * 0.028, PR = BR * 2.2;
  const FRICTION = 0.985;
  const pockets = [[TX,TY],[TX+TW/2,TY],[TX+TW,TY],[TX,TY+TH],[TX+TW/2,TY+TH],[TX+TW,TY+TH]];
  const COLORS = ['#fff','#FDD835','#1565C0','#E53935','#6A1B9A','#FF6F00','#2E7D32','#6D4C41','#111',
    '#FDD835','#1565C0','#E53935','#6A1B9A','#FF6F00','#2E7D32','#6D4C41'];
  let balls = [];
  let turn = 0, assigned = [null, null]; // 'solid' or 'stripe'
  let aiming = false, aimStart = null, gameOver = false, moving = false;
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
  function startAim(p) { if (moving || gameOver) return; const cb = balls[0]; if (!cb.active) return; aiming = true; aimStart = p; }
  function moveAim(p) { if (aiming) aimStart = p; }
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
    draw();
    raf = requestAnimationFrame(update);
  }
  function draw() {
    ctx.fillStyle = '#0a1a0a'; ctx.fillRect(0, 0, w, h);
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
    // Aim line
    if (aiming && aimStart && balls[0].active) {
      const cb = balls[0];
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
      ctx.setLineDash([4,4]);
      const dx = cb.x - aimStart.x, dy = cb.y - aimStart.y;
      ctx.beginPath(); ctx.moveTo(cb.x, cb.y); ctx.lineTo(cb.x+dx*2, cb.y+dy*2); ctx.stroke();
      ctx.setLineDash([]);
    }
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
  grid.style.cssText = `display:grid;grid-template-columns:repeat(${SIZE},1fr);width:${gridSz}px;height:${gridSz}px;background:#1a1a2e;border-radius:10px;overflow:hidden;border:2px solid #333;box-shadow:0 4px 20px rgba(0,0,0,0.5)`;
  wrap.appendChild(grid);

  const cells = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    const cell = document.createElement('div');
    cell.style.cssText = `position:relative;aspect-ratio:1;background:#2a1f0e;cursor:pointer;border:1px solid rgba(80,60,30,0.4)`;
    // Draw board lines via pseudo-style using inner div
    const inner = document.createElement('div');
    inner.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center';
    // Cross-hair lines
    const hLine = document.createElement('div');
    hLine.style.cssText = 'position:absolute;top:50%;left:0;right:0;height:1px;background:rgba(120,90,40,0.5)';
    const vLine = document.createElement('div');
    vLine.style.cssText = 'position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(120,90,40,0.5)';
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
    dot.style.cssText = 'position:absolute;width:6px;height:6px;border-radius:50%;background:rgba(120,90,40,0.7);top:50%;left:50%;transform:translate(-50%,-50%);z-index:1';
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
  const SEGMENTS = [100,200,300,400,500,600,700,800,900,1000,300,500,200,400,600,800,0,0]; // 0 = lose turn
  const SEG_COLORS = ['#E53935','#1E88E5','#43A047','#FDD835','#8E24AA','#FF6F00','#00ACC1','#D81B60','#7CB342','#FF5722','#5C6BC0','#26A69A','#F4511E','#AB47BC','#42A5F5','#66BB6A','#424242','#757575'];

  let word = WORDS[Math.floor(Math.random() * WORDS.length)];
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
    h += `<div style="color:${turn===0?'#FF6B6B':'#888'};font-weight:${turn===0?'bold':'normal'}">P1: $${scores[0]}</div>`;
    h += `<div style="color:${turn===1?'#64B5F6':'#888'};font-weight:${turn===1?'bold':'normal'}">P2: $${scores[1]}</div>`;
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
            word = WORDS[Math.floor(Math.random() * WORDS.length)];
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
            word = WORDS[Math.floor(Math.random() * WORDS.length)];
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
