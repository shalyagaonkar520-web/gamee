/* =========================================================
   WEB SWATTER
   A web-slinging hero sits in his chair and shoots webs
   at mosquitoes that keep trying to bite him.
   ---------------------------------------------------------
   Easy things to tweak are in CONFIG below.
   ========================================================= */

const CONFIG = {
  lives: 3,
  faceImage: "images/face.png", // hero's face photo ("" = Spider-style mask)
  faceSize: 76,            // face height (bigger = bigger head)
  faceOffsetX: 1,          // nudge face right (+) / left (-)
  faceOffsetY: 0,          // nudge face down (+) / up (-)
  webSpeed: 2200,          // px per second (scaled)
  webRetractSpeed: 3200,
  hitRadius: 18,           // how forgiving web hits are
  startSpawnEvery: 1.6,    // seconds between spawns at start
  minSpawnEvery: 0.45,
  maxMosquitoes: 1,        // only ONE mosquito on screen at a time
  passesBeforeDive: 1,     // side-to-side passes before it comes down to bite
  passSeconds: 10,         // time for one pass across the screen (bigger = slower)
  diveSpeed: 70,           // speed when it dives at the hero (smaller = slower)
  roundBaseTarget: 4,      // kills needed to win round 1
  roundTargetGrowth: 2,    // extra kills needed per round
  introSeconds: 3.4,       // how long the "VS" screen stays (click to skip)
  winVideoGreen: "videos/win_green.mp4", // same clip with its green screen, keyed live on Safari/iPhone
  forceKeyedVideo: false,
  winVideo: "videos/win.webm", // transparent (green removed) video shown on the empty stage after winning
  nextMosquitoDelay: 1,    // seconds before the next mosquito appears
  synthBuzz: false,        // true = also play the generated hum under the clips
  approachSpeed: 38,       // how fast mosquitoes close in (grows with score)
  normalsBeforeBig: 2,     // this many normal mosquitoes, then the big face one
  bigFaceSize: 26,         // face height on the big mosquito
  nearDistance: 190,       // how close a mosquito must get to play sounds/near.mp3
  colors: {
    bg: "#ecebe6",
    ink: "#222",
    suitRed: "#c8102e",
    suitRedDark: "#8e0b20",
    suitBlue: "#1d3f9a",
    suitBlueDark: "#132a68",
    web: "#ffffff",
    webEdge: "#9aa0a8",
  },
};

/* ---------------- Setup ---------------- */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1, S = 1; // S = global scale factor

const TOUCH = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
let dprCap = TOUCH ? 1.5 : 2;       // lowered automatically if the device is slow (see loop)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let bgCanvas = null, bgDirty = true;
function resize() {
  bgDirty = true;
  DPR = Math.min(window.devicePixelRatio || 1, dprCap);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = W + "px";      // keep the canvas exactly the size of the visible window
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // scale everything to the screen: phones in portrait are sized by width, others by the short side
  const portrait = H > W * 1.1;
  S = portrait ? clamp(W / 520, 0.7, 1.2) : clamp(Math.min(W, H) / 750, 0.6, 1.6);
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 250));
if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
resize();

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $("hud"), score: $("score"), best: $("best"), lives: $("lives"),
  round: $("roundInfo"), win: $("win"), menu: $("menu"), pause: $("pause"), over: $("over"),
  finalScore: $("finalScore"), finalBest: $("finalBest"),
};

function loadBest() { try { return +localStorage.getItem("webswatter_best") || 0; } catch { return 0; } }
function saveBest(v) { try { localStorage.setItem("webswatter_best", v); } catch {} }

/* ---------------- Audio ----------------
   Sound files in the "sounds" folder are used when present:
     sounds/near.mp3      -> plays when a mosquito comes close (included)
     sounds/shoot.mp3     -> optional: replaces the built-in laser "pew"
     sounds/mosquito.mp3  -> optional: replaces the built-in mosquito whine (looped)
   If a file is missing, the built-in generated sound is used instead.
------------------------------------------ */
function loadClip(src, loop = false, pool = 1) {
  // pool > 1: several copies so a clip can overlap itself (rapid shots) without creating new
  // audio elements while playing, which phones block or lag on
  const clip = { el: null, ok: false, pool: [] };
  try {
    for (let i = 0; i < pool; i++) {
      const a = new Audio();
      a.preload = "auto";
      a.loop = loop;
      if (i === 0) {
        for (const ev of ["loadedmetadata", "canplay", "canplaythrough"]) a.addEventListener(ev, () => { clip.ok = true; }, { once: true });
        a.addEventListener("error", () => { clip.ok = false; });
      }
      a.src = src;
      clip.pool.push(a);
    }
    clip.el = clip.pool[0];
  } catch {}
  return clip;
}

const Sound = {
  ctx: null, muted: false, buzzGain: null, buzzOscs: [],
  files: {
    near: loadClip("sounds/near.mp3"),
    shoot: loadClip("sounds/shoot.mp3", false, 3),   // cut from the reference video
    kill: loadClip("sounds/kill.mp3", false, 3),     // cut from the reference video
    shotdown: loadClip("sounds/shotdown.mp3", false, 3),   // video 26-27s: mosquito shot down
    bite: loadClip("sounds/bite.mp3"),           // big mosquito bites him
    sheru: loadClip("sounds/sheru.mp3"),         // round won
    elvishKill: loadClip("sounds/elvish_kill.mp3", false, 3), // plays when the face mosquito is shot down
    miss: loadClip("sounds/miss.mp3", false, 3),           // video 17.6s: the missed shot
    // one clip per mosquito, in order: 1st, 2nd, 3rd, then repeats
    mosq: [
      loadClip("sounds/mosquito1.mp3"),   // video 0-3s
      loadClip("sounds/mosquito2.mp3"),   // video 8-9s
      loadClip("sounds/mosquito3.mp3"),   // video 17-18s
    ],
    mosquito: loadClip("sounds/mosquito.mp3", true),
  },
  nearCooldown: 0,
  unlocked: false,
  // phones only allow sound after a tap: "touch" every clip once (silently) on the first tap
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    const all = [];
    for (const f of Object.values(this.files)) { if (Array.isArray(f)) all.push(...f); else all.push(f); }
    for (const f of all) {
      for (const a of (f.pool || (f.el ? [f.el] : []))) {
        const was = a.muted; a.muted = true;
        const done = () => { a.pause(); try { a.currentTime = 0; } catch {} a.muted = was; };
        try { const pr = a.play(); if (pr && pr.then) pr.then(done).catch(() => { a.muted = was; }); else done(); } catch { a.muted = was; }
      }
    }
  },
  // play a clip from its pool (an idle copy if there is one)
  fire(f, vol = 1) {
    const list = f.pool && f.pool.length ? f.pool : [f.el];
    const a = list.find((x) => x.paused || x.ended) || list[0];
    try { a.currentTime = 0; } catch {}
    a.volume = vol; a.play().catch(() => {});
    return a;
  },
  init() {
    this.unlock();
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Mosquito buzz matched to the reference video: a drone around 190 Hz
      // (measured 170-205 Hz) that slowly drifts in pitch, mostly the base
      // tone with weaker harmonics -> "zzzzzzz" hum.
      const out = this.ctx.createGain();
      out.gain.value = 0;
      const lp = this.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400; lp.Q.value = 0.7;
      lp.connect(out).connect(this.ctx.destination);
      const voices = [
        // [freq, type, level, slow-drift rate, drift depth, flutter rate, flutter depth]
        [190, "sine", 0.9, 0.23, 14, 17, 3],
        [190, "sawtooth", 0.22, 0.23, 14, 17, 3],
        [193, "triangle", 0.35, 0.31, 12, 23, 4],
      ];
      for (const [base, type, level, dr, dd, fr, fd] of voices) {
        const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = base;
        for (const [rate, depth] of [[dr, dd], [fr, fd]]) {
          const lfo = this.ctx.createOscillator(); lfo.frequency.value = rate;
          const lg = this.ctx.createGain(); lg.gain.value = depth;
          lfo.connect(lg).connect(o.frequency); lfo.start();
        }
        const g = this.ctx.createGain(); g.gain.value = level;
        o.connect(g).connect(lp);
        o.start();
        this.buzzOscs.push({ o, base });
      }
      this.buzzGain = out;
    } catch { this.ctx = null; }
  },
  // v = 0..1 loudness, closeness = 0..1 (pitch rises a little when close)
  setBuzz(v, closeness = 0) {
    const vol = this.muted ? 0 : v;
    const f = this.files.mosquito;
    if (f.ok) {
      f.el.volume = Math.min(1, vol * 8);
      if (vol > 0.001 && f.el.paused) f.el.play().catch(() => {});
      if (vol <= 0.001 && !f.el.paused) f.el.pause();
      return;
    }
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.buzzGain.gain.setTargetAtTime(vol, t, 0.08);
    for (const b of this.buzzOscs) b.o.frequency.setTargetAtTime(b.base * (1 + closeness * 0.12), t, 0.1);
  },
  near() {
    const f = this.files.near;
    if (this.muted || !f.ok || this.nearCooldown > 0) return;
    f.el.currentTime = 0;
    f.el.volume = 1;
    f.el.play().catch(() => {});
    this.nearCooldown = (f.el.duration || 2) + 1.5; // don't spam it
  },
  // play the sound that belongs to mosquito number i (0,1,2 -> clip 1,2,3)
  playMosq(i) {
    this.stopMosq();
    const f = this.files.mosq[i % this.files.mosq.length];
    if (this.muted || !f.ok) return;
    f.el.currentTime = 0; f.el.volume = 1;
    f.el.play().catch(() => {});
  },
  stopMosq() {
    for (const f of this.files.mosq) if (f.el && !f.el.paused) f.el.pause();
  },
  // big mosquito's bite sound
  bite() {
    const f = this.files.bite;
    if (this.muted || !f.ok) return;
    f.el.currentTime = 0; f.el.volume = 1; f.el.loop = true;   // keeps playing while it flies
    f.el.play().catch(() => {});
  },
  sheru(onEnd) {
    const f = this.files.sheru;
    if (this.muted || !f.ok) { onEnd(); return; }
    f.el.currentTime = 0; f.el.volume = 1;
    f.el.onended = onEnd;
    f.el.play().catch(() => onEnd());
  },
  stopBite() { const f = this.files.bite; if (f.el && !f.el.paused) f.el.pause(); },
  // sound for a mosquito appearing: big one = Elvish clip, others = their video clip
  mosqSound(m) {
    if (m.type === "big" && this.files.bite.ok) { this.stopMosq(); this.bite(); }
    else { this.stopBite(); this.playMosq(m.clip); }
  },
  stopAll(keepBite = false) {
    for (const f of Object.values(this.files)) {
      if (keepBite && f === this.files.bite) continue;
      for (const a of (f.pool || (f.el ? [f.el] : []))) if (!a.paused) a.pause();
    }
    this.stopMosq();
    if (this.lastShot) this.lastShot.pause();
    this.setBuzz(0);
  },
  noise(dur, freq, vol) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = 1;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start();
  },
  tone(f1, f2, dur, vol, type = "sine") {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  },
  // shooting sound: laser "pew" like the beam in the reference video
  thwip() {
    const f = this.files.shoot;
    if (f.ok) {
      if (this.muted) return;
      this.lastShot = this.fire(f, 1);
      return;
    }
    this.tone(1900, 180, 0.22, 0.12, "square");
    this.tone(2600, 300, 0.16, 0.06, "sawtooth");
    this.noise(0.06, 4000, 0.25);
  },
  // mosquito shot down: video 26-27s clip (falls back to kill.mp3, then synth)
  splat(big) {
    this.stopMosq();
    this.stopBite();
    const f = big && this.files.elvishKill.ok ? this.files.elvishKill : this.files.shotdown.ok ? this.files.shotdown : this.files.kill;
    if (f.ok) {
      if (this.muted) return;
      if (this.lastShot) this.lastShot.pause(); // the shot-down clip already contains the shot
      this.fire(f, 1); this.fire(f, 1);   // 2 layers = even louder
      return;
    }
    this.noise(0.18, 700, 0.5); this.tone(300, 80, 0.15, 0.15);
  },
  // shot missed (web left the screen without hitting anything)
  miss() {
    const f = this.files.miss;
    if (this.muted) return;
    if (f.ok) { this.fire(f, 1); return; }
    this.tone(700, 120, 0.3, 0.15, "sawtooth");
  },
  ouch()  { this.tone(500, 150, 0.35, 0.2, "square"); },
};

/* ---------------- Characters & rounds ----------------
   Round n: the hero wears FACES[(n-1) % FACES.length]; the big mosquito
   wears the next face. Add more people here (any cut-out PNG) and they
   join the rotation automatically. */
const FACES = [
  { name: "AMITABH BACHCHAN", img: "images/face.png" },
  { name: "ELVISH BHAI",      img: "images/mosquito_face.png" },
];
const BASE = { pass: CONFIG.passSeconds, dive: CONFIG.diveSpeed };

const imgCache = {};
function getImg(src) {
  if (!src) return { ready: false, el: null };
  let e = imgCache[src];
  if (!e) {
    e = imgCache[src] = { ready: false, el: new Image() };
    e.el.onload = () => { e.ready = true; };
    e.el.src = src;
  }
  return e;
}
for (const f of FACES) getImg(f.img);

let round = 1, roundKills = 0, roundStartScore = 0, introT = 0, winTimer = 0;
function roundHeroFace() { return FACES[0]; }    // hero is always Amitabh Bachchan
function roundEnemyFace() { return FACES[1]; }
function roundGoal(n = round) {
  return {
    target: CONFIG.roundBaseTarget + (n - 1) * CONFIG.roundTargetGrowth,
    pass: Math.max(4.5, BASE.pass - (n - 1)),
    dive: BASE.dive + (n - 1) * 15,
  };
}
function applyRound(n) {
  round = n;
  const g = roundGoal(n);
  CONFIG.passSeconds = g.pass; CONFIG.diveSpeed = g.dive;
  roundKills = 0; winTimer = 0;
}
// endless mode: no rounds, it just gets a little harder as the score climbs
function rampDifficulty() {
  const lvl = 1 + Math.floor(score / 8);
  if (lvl !== round) { round = lvl; const g = roundGoal(lvl); CONFIG.passSeconds = g.pass; CONFIG.diveSpeed = g.dive; }
}

/* ---------------- Game state ---------------- */
const State = { MENU: 0, PLAY: 1, PAUSE: 2, OVER: 3, INTRO: 4, WIN: 5 };
let state = State.MENU;
let score = 0, best = loadBest(), lives = CONFIG.lives;
let mosquitoes = [], particles = [], popups = [], cocoons = [];
let web = null;           // active web shot
let spawnTimer = 0, time = 0, shake = 0, hurtFlash = 0, angerTimer = 0, mosquitoCount = 0;
const mouse = { x: 0, y: 0, active: false };

function hero() {
  // hero anchor = centre of chair seat
  return { x: W / 2, y: H - 175 * S, s: S };
}
function heroHead() {
  const h = hero();
  return { x: h.x + facing * -8 * S, y: h.y - 78 * S };
}
function heroHand() {
  // shoulder in world space + arm toward aim
  const h = hero();
  const sx = h.x + facing * 2 * S, sy = h.y - 40 * S;
  const a = aimAngle();
  const len = 62 * S;
  return { sx, sy, x: sx + Math.cos(a) * len, y: sy + Math.sin(a) * len, a };
}
let facing = 1;
function aimAngle() {
  const h = hero();
  const sx = h.x + facing * 2 * S, sy = h.y - 40 * S;
  let a = Math.atan2(mouse.y - sy, mouse.x - sx);
  // keep arm from pointing into the floor too much
  if (a > 0.6 && a < Math.PI / 2) a = 0.6;
  if (a >= Math.PI / 2 && a < Math.PI - 0.6) a = Math.PI - 0.6;
  return a;
}

function resetField() {
  mosquitoes = []; particles = []; popups = []; cocoons = [];
  web = null; spawnTimer = 0.6; shake = 0; hurtFlash = 0; angerTimer = 0; mosquitoCount = 0;
  Sound.stopMosq();
}
function resetGame() {          // back to a clean start (score 0, round 1)
  score = 0; lives = CONFIG.lives;
  applyRound(1);
  resetField();
  updateHud();
}
function showIntro(n) {         // "MOSQUITO vs <hero>" screen, then the round starts
  applyRound(n);
  resetField();
  lives = CONFIG.lives; roundStartScore = score; introT = 0;
  updateHud();
  setState(State.INTRO);
}
function beginRound() { if (state === State.INTRO) setState(State.PLAY); }
function winRound() {
  if (score > best) { best = score; saveBest(best); }
  setState(State.WIN);
  const nxt = roundHeroFace(round + 1);
  $("winTitle").textContent = "ROUND " + round + " CLEARED!";
  $("winSub").textContent = "Score " + score + "  \u2022  Next: Round " + (round + 1) + " \u2014 Mosquito vs " + nxt.name;
  Sound.sheru(loadWinVideo);    // Sheru Bhai audio first, then the video
}
function needsKeyedVideo() {
  // Safari / iPhone can't show transparent WebM, so they get the green-screen clip keyed live on a canvas
  const ua = navigator.userAgent;
  const ios = /iP(hone|ad|od)/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
  return CONFIG.forceKeyedVideo || ios || safari || new URLSearchParams(location.search).has("key");
}
function keyLoop(v, c) {
  const g = c.getContext("2d", { willReadFrequently: true });
  const fit = () => { if (v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; } };
  c.width = 360; c.height = 640;
  v.addEventListener("loadedmetadata", fit);
  const step = () => {
    if (!c.isConnected) return;                 // win screen closed
    if (v.readyState >= 2) {
      g.drawImage(v, 0, 0, c.width, c.height);
      const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const m = d[i] > d[i + 2] ? d[i] : d[i + 2], k = d[i + 1] - m;   // how much greener than red/blue
        if (k > 50) d[i + 3] = 0;
        else if (k > 18) { d[i + 3] = (255 * (50 - k)) / 32; d[i + 1] = m; }
      }
      g.putImageData(im, 0, 0);
    }
    requestAnimationFrame(step);
  };
  step();
}
function loadWinVideo() {
  if (state !== State.WIN) return;
  const box = $("winVideo");
  if (!needsKeyedVideo()) {
    // transparent WebM (green already removed): walks onto the empty stage, looping
    box.innerHTML = '<video src="' + CONFIG.winVideo + '" autoplay loop playsinline></video>';
    box.querySelector("video").play().catch(() => {});
    return;
  }
  box.innerHTML = '<canvas></canvas><video src="' + CONFIG.winVideoGreen + '" loop playsinline ' +
    'style="position:absolute;width:2px;height:2px;opacity:0;pointer-events:none"></video>';
  const v = box.querySelector("video"), c = box.querySelector("canvas");
  v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  keyLoop(v, c);
}

function updateHud() {
  ui.score.textContent = score;
  ui.best.textContent = "BEST " + best;
  ui.lives.textContent = "❤".repeat(Math.max(0, lives)) + "♡".repeat(Math.max(0, CONFIG.lives - lives));
  ui.round.textContent = "";
}

function setState(s) {
  const prev = state;
  state = s;
  // resuming: the current mosquito's sound starts again
  if (prev === State.PAUSE && s === State.PLAY) {
    const m = mosquitoes.find((q) => !q.leaving);
    if (m) Sound.mosqSound(m);
  }
  if (prev === State.WIN && s !== State.WIN) {   // leaving the win screen: stop audio + video
    Sound.files.sheru.el.onended = null;
    $("winVideo").innerHTML = "";
  }
  ui.win.classList.toggle("hidden", s !== State.WIN);
  ui.menu.classList.toggle("hidden", s !== State.MENU);
  ui.pause.classList.toggle("hidden", s !== State.PAUSE);
  ui.over.classList.toggle("hidden", s !== State.OVER);
  ui.hud.classList.toggle("hidden", s === State.MENU || s === State.INTRO || s === State.WIN);
  canvas.style.cursor = s === State.PLAY ? "none" : "default";
  if (s !== State.PLAY) Sound.stopAll();
}

/* ---------------- Mosquitoes ---------------- */
function spawnMosquito() {
  // fixed order: 2 normal mosquitoes, then the big face (Elvish) mosquito, repeat
  const type = (mosquitoCount % (CONFIG.normalsBeforeBig + 1)) === CONFIG.normalsBeforeBig ? "big" : "normal";
  // enters from the left or right edge and flies across to the other side
  const dir = Math.random() < 0.5 ? 1 : -1;
  const m = {
    type, x: dir > 0 ? -40 : W + 40, y: 0, vx: 0, vy: 0,
    hp: type === "big" ? 2 : 1,
    size: (type === "big" ? 2.6 : type === "gf" ? 1.45 : 1.3) * S,
    phase: Math.random() * 100,
    mode: "pass", dir, pass: 0, laneY: 0,
    clip: mosquitoCount++,          // which sound this mosquito uses
    retreat: 0, hitFlash: 0, leaving: false,
  };
  setLane(m);
  m.y = m.laneY;
  mosquitoes.push(m);
  Sound.mosqSound(m);
}

// each pass flies a little lower, closer to the hero's head
function setLane(m) {
  const head = heroHead();
  const top = H * 0.15, bottom = head.y - 90 * S;
  const t = m.pass / Math.max(1, CONFIG.passesBeforeDive);
  m.laneY = top + (bottom - top) * t + (Math.random() - 0.5) * 50 * S;
}

function difficulty() { return Math.min(1, score / 60); }

function updateMosquitoes(dt) {
  const head = heroHead();
  let closest = Infinity;
  for (const m of mosquitoes) {
    m.phase += dt;
    m.hitFlash = Math.max(0, m.hitFlash - dt);
    const angry = angerTimer > 0 ? 1.7 : 1;
    if (m.mode === "pass" && !m.leaving) {
      // fly straight across the screen in a wavy line
      const secs = Math.max(CONFIG.passSeconds * 0.7, CONFIG.passSeconds - 3 * difficulty()) / angry * (m.type === "big" ? 1.25 : 1);
      m.vx = m.dir * (W + 80) / secs;
      const wave = Math.sin(m.phase * 2.4) * 45 * S + Math.sin(m.phase * 13) * 8 * S;
      m.vy = (m.laneY + wave - m.y) * 6;
      m.x += m.vx * dt; m.y += m.vy * dt;
      // reached the other side?
      if ((m.dir > 0 && m.x > W + 40) || (m.dir < 0 && m.x < -40)) {
        m.pass++;
        m.dir = -m.dir;
        if (m.pass >= CONFIG.passesBeforeDive) m.mode = "dive";
        else setLane(m);
        if (m.type !== "big") Sound.playMosq(m.clip); // its sound plays again for every pass
      }
      const dh = Math.hypot(m.x - head.x, m.y - head.y);
      closest = Math.min(closest, dh);
      continue;
    }
    let tx, ty, spd;
    if (m.suck > 0) {
      // sitting on his head, drinking
      m.suck -= dt;
      m.x = head.x + 6 * S; m.y = head.y - 30 * S + Math.sin(m.phase * 30) * 0.6 * S;
      m.vx = 1; m.vy = 0;
      continue;
    }
    if (m.leaving) {
      // fed mosquito flies off upward
      tx = m.x + (m.x < W / 2 ? -300 : 300); ty = -200; spd = 220 * S;
    } else {
      // dive: zig-zag straight at the hero's head
      if (m.retreat > 0) m.retreat -= dt;
      tx = head.x + Math.sin(m.phase * 3) * 60 * S;
      ty = head.y - (m.retreat > 0 ? 160 : 0) * S;
      spd = (CONFIG.diveSpeed + difficulty() * 30) * angry * S;
    }
    // jitter makes it buzz around
    tx += Math.sin(m.phase * 13) * 18 * S;
    ty += Math.cos(m.phase * 11) * 14 * S;
    const dx = tx - m.x, dy = ty - m.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = 1 - Math.pow(0.02, dt);
    m.vx += ((dx / d) * spd - m.vx) * k * 3;
    m.vy += ((dy / d) * spd - m.vy) * k * 3;
    m.x += m.vx * dt; m.y += m.vy * dt;

    const dh = Math.hypot(m.x - head.x, m.y - head.y);
    if (!m.leaving) closest = Math.min(closest, dh);
    // "near" sound: each mosquito can trigger it once when it gets close
    if (!m.leaving && !m.warned && m.type !== "big" && dh < CONFIG.nearDistance * S) { m.warned = true; Sound.near(); }
    if (!m.leaving && m.mode === "dive" && dh < 26 * S) bite(m);
  }
  mosquitoes = mosquitoes.filter((m) => !(m.leaving && (m.y < -100 || m.x < -150 || m.x > W + 150)) && !m.dead);
  // buzz louder when they are near
  const closeness = closest === Infinity ? 0 : Math.max(0, 1 - closest / (420 * S));
  const v = !CONFIG.synthBuzz || closest === Infinity ? 0 : closeness * closeness * 0.22 + 0.05;
  Sound.setBuzz(v, closeness);
}

function bite(m) {
  Sound.stopMosq();
  m.leaving = true;
  m.fed = true;
  m.suck = 0.9;            // stays on his head for a moment before flying off
  lives--;
  shake = 0.35; hurtFlash = 0.4;
  Sound.ouch();
  Sound.stopBite();        // the Elvish clip is only for flying, not for the bite
  const head = heroHead();
  popups.push({ x: head.x, y: head.y - 40 * S, text: "OUCH!", life: 1, color: "#c8102e" });
  updateHud();
  if (lives <= 0) gameOver();
}

function gameOver() {
  if (score > best) { best = score; saveBest(best); }
  ui.finalScore.textContent = score;
  ui.finalBest.textContent = "BEST " + best;
  updateHud();
  setState(State.OVER);
}

/* ---------------- Web shooting ---------------- */
function shoot() {
  if (state !== State.PLAY || web) return;
  const hand = heroHand();
  web = {
    ox: hand.x, oy: hand.y,
    dx: Math.cos(hand.a), dy: Math.sin(hand.a),
    len: 0, phase: "out", stick: 0, hit: null,
  };
  Sound.thwip();
}

function updateWeb(dt) {
  if (!web) return;
  const hand = heroHand();
  web.ox = hand.x; web.oy = hand.y;
  if (web.phase === "out") {
    const prev = web.len;
    web.len += CONFIG.webSpeed * S * dt;
    // check hits along the segment travelled this frame
    for (const m of mosquitoes) {
      if (m.leaving) continue;
      const hit = segCircle(web.ox + web.dx * prev, web.oy + web.dy * prev,
                            web.ox + web.dx * web.len, web.oy + web.dy * web.len,
                            m.x, m.y, CONFIG.hitRadius * S * (m.type === "big" ? 1.4 : 1));
      if (hit) { hitMosquito(m); web.len = Math.hypot(m.x - web.ox, m.y - web.oy); web.phase = "stick"; web.stick = 0.12; break; }
    }
    const tipX = web.ox + web.dx * web.len, tipY = web.oy + web.dy * web.len;
    if (web.phase === "out" && (tipX < -50 || tipX > W + 50 || tipY < -50 || tipY > H + 50)) {
      web.phase = "back";
      Sound.miss();   // nothing was hit
      popups.push({ x: Math.min(W - 40, Math.max(40, tipX)), y: Math.min(H - 40, Math.max(90, tipY)), text: "MISS", life: 0.7, color: "#888", small: true });
    }
  } else if (web.phase === "stick") {
    web.stick -= dt;
    if (web.stick <= 0) web.phase = "back";
  } else {
    web.len -= CONFIG.webRetractSpeed * S * dt;
    if (web.len <= 0) web = null;
  }
}

function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + dx * t, py = y1 + dy * t;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function hitMosquito(m) {
  m.hp--;
  m.hitFlash = 0.15;
  burst(m.x, m.y, 8, "#ffffff");
  if (m.hp > 0) { m.retreat = 0.8; Sound.noise(0.08, 1500, 0.3); return; }
  m.dead = true;
  const pts = m.type === "gf" ? 3 : m.type === "big" ? 2 : 1;
  score += pts;
  roundKills++;
  rampDifficulty();
  Sound.splat(m.type === "big");
  burst(m.x, m.y, 16, m.type === "gf" ? "#ff6fae" : "#ffb020");
  popups.push({ x: m.x, y: m.y - 20 * S, text: "+" + pts, life: 1, color: "#222" });
  if (m.type === "gf") {
    angerTimer = 4;
    popups.push({ x: m.x, y: m.y - 46 * S, text: "Machar ki GF! 😂 They're ANGRY!", life: 1.6, color: "#d6246e", small: true });
  }
  cocoons.push({ x: m.x, y: m.y, vy: 0, rot: 0, life: 6, type: m.type, size: m.size });
  if (score > best) { best = score; saveBest(best); }
  updateHud();
}

function burst(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (80 + Math.random() * 220) * S;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.3, color });
  }
}

/* ---------------- Update loop ---------------- */
function update(dt) {
  time += dt;
  if (mouse.active) facing = mouse.x >= hero().x ? 1 : -1;

  if (state === State.PLAY) {
    // next mosquito only comes after the current one is gone
    if (winTimer <= 0 && mosquitoes.length < CONFIG.maxMosquitoes) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) { spawnMosquito(); spawnTimer = CONFIG.nextMosquitoDelay; }
    }
    angerTimer = Math.max(0, angerTimer - dt);
    Sound.nearCooldown = Math.max(0, Sound.nearCooldown - dt);
    updateMosquitoes(dt);
    updateWeb(dt);
    if (winTimer > 0) { winTimer -= dt; if (winTimer <= 0 && state === State.PLAY) winRound(); }
  }

  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) { p.y -= 40 * S * dt; p.life -= dt; }
  popups = popups.filter((p) => p.life > 0);

  const floor = hero().y + 95 * S;
  for (const c of cocoons) {
    if (c.y < floor - 8 * S) { c.vy += 1400 * S * dt; c.y += c.vy * dt; c.rot += dt * 6; }
    else { c.y = floor - 8 * S; c.vy = 0; }
    c.life -= dt;
  }
  cocoons = cocoons.filter((c) => c.life > 0);

  shake = Math.max(0, shake - dt);
  hurtFlash = Math.max(0, hurtFlash - dt);
}

/* ---------------- Drawing ---------------- */
const C = CONFIG.colors;

function drawIntro() {
  const t = introT, e = 1 - Math.pow(1 - Math.min(1, t / 0.6), 3);
  let g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#1b1030"); g.addColorStop(1, "#0b1a35");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(200,16,46,0.25)";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * 0.56, 0); ctx.lineTo(W * 0.44, H); ctx.lineTo(0, H); ctx.fill();
  ctx.fillStyle = "rgba(29,63,154,0.32)";
  ctx.beginPath(); ctx.moveTo(W * 0.56, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * 0.44, H); ctx.fill();
  // speed lines
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 2 * S;
  for (let i = 0; i < 26; i++) { const y = (i / 26) * H; ctx.beginPath(); ctx.moveTo(0, y + Math.sin(i) * 9); ctx.lineTo(W, y - 40 * S); ctx.stroke(); }

  const size = Math.min(W * (H > W ? 0.29 : 0.3), H * 0.4), cy = H * 0.53;
  const gl = (x) => {
    const r = ctx.createRadialGradient(x, cy, 10, x, cy, size * 0.9);
    r.addColorStop(0, "rgba(255,255,255,0.18)"); r.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = r; ctx.fillRect(x - size, cy - size, size * 2, size * 2);
  };
  const lx = W * 0.25 - (1 - e) * W * 0.45, rx = W * 0.75 + (1 - e) * W * 0.45;
  gl(lx); gl(rx);

  // mosquito (left)
  ctx.save(); ctx.translate(lx, cy + Math.sin(time * 3) * 10 * S);
  const k = size / 24; ctx.scale(k, k); ctx.lineCap = "round";
  drawRefMosquito({ hitFlash: 0, phase: 0, type: "normal" });
  ctx.restore();

  // hero face (right)
  const hf = roundHeroFace(), fi = getImg(hf.img);
  if (fi.ready) {
    const fh = size * 1.25, fw = fh * (fi.el.width / fi.el.height);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 25 * S;
    ctx.translate(rx, cy + Math.sin(time * 2.2) * 6 * S);
    ctx.drawImage(fi.el, -fw / 2, -fh / 2, fw, fh);
    ctx.restore();
  }

  ctx.textAlign = "center"; ctx.lineJoin = "round";
  const label = (txt, x, y, px, fill, maxW) => {
    ctx.font = `800 ${px}px Segoe UI, sans-serif`;
    if (maxW) { const w = ctx.measureText(txt).width; if (w > maxW) { px = px * maxW / w; ctx.font = `800 ${px}px Segoe UI, sans-serif`; } }
    ctx.lineWidth = px * 0.14; ctx.strokeStyle = "#111";
    ctx.strokeText(txt, x, y); ctx.fillStyle = fill; ctx.fillText(txt, x, y);
  };
  label("MOSQUITO", lx, cy + size * 0.85, Math.max(20, size * 0.15), "#ff4d5e", W * 0.46);
  label(hf.name, rx, cy + size * 0.85, Math.max(20, size * 0.15), "#ffd400", W * 0.46);
  const pop = t < 0.5 ? 1 + Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.5 : 1;
  label("VS", W / 2, cy + size * 0.16 * pop, Math.max(48, size * 0.5) * pop, "#ffffff");
  label("WEB SWATTER", W / 2, H * 0.13, Math.max(30, Math.min(W, H) * 0.09), "#ffd400");
  ctx.font = `600 ${Math.max(14, size * 0.075)}px Segoe UI, sans-serif`; ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("Swat as many mosquitoes as you can", W / 2, H * 0.13 + Math.max(24, size * 0.14));
  if (t > 0.5) {
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 5);
    ctx.fillText((TOUCH ? "tap" : "click") + " to start", W / 2, H * 0.94);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "#ffd400"; ctx.fillRect(0, H - 6, W * Math.min(1, t / CONFIG.introSeconds), 6);
}

function draw() {
  if (state === State.INTRO) { drawIntro(); return; }
  ctx.save();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  if (shake > 0) ctx.translate((Math.random() - 0.5) * 14 * shake * S * 3, (Math.random() - 0.5) * 14 * shake * S * 3);

  drawRoom();
  if (state === State.WIN) { ctx.restore(); return; }   // win screen: empty stage, only the lion (HTML video) appears
  for (const c of cocoons) drawCocoon(c);
  drawHero();
  if (web) drawWeb();
  if (state === State.PLAY && !web) drawAim();
  for (const m of mosquitoes) drawMosquito(m);

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5 * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.font = `700 ${(p.small ? 16 : 22) * S}px Segoe UI, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (hurtFlash > 0) {
    ctx.fillStyle = `rgba(200,16,46,${hurtFlash * 0.5})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (angerTimer > 0 && state === State.PLAY) {
    ctx.fillStyle = `rgba(214,36,110,${0.05 + 0.04 * Math.sin(time * 12)})`;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ---------- Room background ----------
   Painted once into an off-screen canvas (rebuilt when the window resizes),
   then only the small animated bits are drawn each frame. */
function roomLayout() {
  const h = hero();
  return {
    hx: h.x,
    wheelY: h.y + 95 * S,          // where the chair stands
    horizon: h.y + 48 * S,         // wall / floor boundary
    wide: W > 760 * S,
    win: { x: Math.max(30 * S, W * 0.16 - 110 * S), y: H * 0.13, w: 220 * S, h: 250 * S },
    lampX: W - Math.max(70 * S, W * 0.1),
    tableX: h.x - 230 * S,
  };
}

function buildBackground() {
  const L = roomLayout();
  bgCanvas = document.createElement("canvas");
  bgCanvas.width = W * DPR; bgCanvas.height = H * DPR;
  const g = bgCanvas.getContext("2d");
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.lineJoin = "round"; g.lineCap = "round";
  const R = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

  /* wall */
  let gr = g.createLinearGradient(0, 0, 0, L.horizon);
  gr.addColorStop(0, "#cfd8d6"); gr.addColorStop(1, "#e9e4d6");
  g.fillStyle = gr; g.fillRect(0, 0, W, L.horizon);
  // wallpaper: faint vertical stripes + tiny diamonds
  for (let x = 0; x < W; x += 46 * S) {
    g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(x, 0, 23 * S, L.horizon);
  }
  g.fillStyle = "rgba(120,130,125,0.13)";
  for (let x = 11.5 * S, c = 0; x < W; x += 46 * S, c++) {
    for (let y = (c % 2 ? 30 : 60) * S; y < L.horizon - 20 * S; y += 60 * S) {
      g.beginPath(); g.moveTo(x, y - 4 * S); g.lineTo(x + 3 * S, y); g.lineTo(x, y + 4 * S); g.lineTo(x - 3 * S, y); g.fill();
    }
  }

  /* window with night sky */
  const w = L.win;
  if (L.wide) {
    gr = g.createLinearGradient(0, w.y, 0, w.y + w.h);
    gr.addColorStop(0, "#0d1b3d"); gr.addColorStop(1, "#2c4a7c");
    g.fillStyle = gr; g.fillRect(w.x, w.y, w.w, w.h);
    // stars
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 45; i++) {
      g.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
      g.beginPath(); g.arc(w.x + rnd() * w.w, w.y + rnd() * w.h * 0.8, (0.6 + rnd() * 1.2) * S, 0, Math.PI * 2); g.fill();
    }
    // moon + glow
    const mx = w.x + w.w * 0.68, my = w.y + w.h * 0.27;
    gr = g.createRadialGradient(mx, my, 5 * S, mx, my, 70 * S);
    gr.addColorStop(0, "rgba(255,250,210,0.55)"); gr.addColorStop(1, "rgba(255,250,210,0)");
    g.fillStyle = gr; g.fillRect(w.x, w.y, w.w, w.h);
    g.fillStyle = "#fdf6d0"; g.beginPath(); g.arc(mx, my, 22 * S, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(200,190,150,0.5)";
    for (const [dx, dy, r] of [[-7, -5, 5], [6, 4, 3.5], [-2, 9, 2.5]]) { g.beginPath(); g.arc(mx + dx * S, my + dy * S, r * S, 0, Math.PI * 2); g.fill(); }
    // far buildings silhouette
    g.fillStyle = "#0a1226";
    let bx = w.x;
    while (bx < w.x + w.w) {
      const bw = (18 + rnd() * 26) * S, bh = (25 + rnd() * 55) * S;
      g.fillRect(bx, w.y + w.h - bh, Math.min(bw, w.x + w.w - bx), bh);
      g.fillStyle = "rgba(255,214,110,0.8)";
      for (let wy = w.y + w.h - bh + 6 * S; wy < w.y + w.h - 6 * S; wy += 10 * S)
        for (let wx = bx + 4 * S; wx < Math.min(bx + bw, w.x + w.w) - 5 * S; wx += 8 * S)
          if (rnd() < 0.35) g.fillRect(wx, wy, 3.5 * S, 4.5 * S);
      g.fillStyle = "#0a1226";
      bx += bw + 2 * S;
    }
    // frame + bars + sill
    g.strokeStyle = "#fbf7ee"; g.lineWidth = 10 * S; g.strokeRect(w.x, w.y, w.w, w.h);
    g.lineWidth = 5 * S;
    g.beginPath(); g.moveTo(w.x + w.w / 2, w.y); g.lineTo(w.x + w.w / 2, w.y + w.h);
    g.moveTo(w.x, w.y + w.h * 0.45); g.lineTo(w.x + w.w, w.y + w.h * 0.45); g.stroke();
    g.strokeStyle = "rgba(60,50,40,0.35)"; g.lineWidth = 1.5;
    g.strokeRect(w.x - 5 * S, w.y - 5 * S, w.w + 10 * S, w.h + 10 * S);
    g.fillStyle = "#fbf7ee"; R(w.x - 16 * S, w.y + w.h + 3 * S, w.w + 32 * S, 12 * S, 3 * S); g.fill(); g.stroke();
    // curtains
    for (const side of [-1, 1]) {
      const cx0 = side < 0 ? w.x - 26 * S : w.x + w.w - 30 * S, cw = 56 * S;
      gr = g.createLinearGradient(cx0, 0, cx0 + cw, 0);
      for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, k % 2 ? "#a3283a" : "#7c1a2a");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(cx0, w.y - 16 * S); g.lineTo(cx0 + cw, w.y - 16 * S);
      g.quadraticCurveTo(cx0 + cw - side * 10 * S, w.y + w.h * 0.6, cx0 + cw + (side < 0 ? -6 : 6) * S, w.y + w.h + 34 * S);
      g.lineTo(cx0 + (side < 0 ? -6 : 6) * S, w.y + w.h + 34 * S);
      g.closePath(); g.fill();
      g.strokeStyle = "rgba(40,10,15,0.5)"; g.lineWidth = 1.5; g.stroke();
    }
    // curtain rod
    g.strokeStyle = "#6b4a2b"; g.lineWidth = 6 * S;
    g.beginPath(); g.moveTo(w.x - 40 * S, w.y - 18 * S); g.lineTo(w.x + w.w + 40 * S, w.y - 18 * S); g.stroke();
    g.fillStyle = "#6b4a2b";
    for (const ex of [w.x - 42 * S, w.x + w.w + 42 * S]) { g.beginPath(); g.arc(ex, w.y - 18 * S, 6 * S, 0, Math.PI * 2); g.fill(); }
    // moonlight patch on the wall
    g.fillStyle = "rgba(200,220,255,0.10)";
    g.beginPath(); g.moveTo(w.x + w.w, w.y + w.h); g.lineTo(w.x + w.w + 150 * S, L.horizon); g.lineTo(w.x + 60 * S, L.horizon); g.lineTo(w.x, w.y + w.h); g.fill();
  }

  /* framed picture */
  if (L.wide) {
    const px = W * 0.7, py = H * 0.17, pw = 120 * S, ph = 90 * S;
    g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(px + 5 * S, py + 7 * S, pw, ph);
    g.fillStyle = "#7a5230"; g.fillRect(px, py, pw, ph);
    gr = g.createLinearGradient(0, py, 0, py + ph);
    gr.addColorStop(0, "#f7c873"); gr.addColorStop(1, "#f3a96a");
    g.fillStyle = gr; g.fillRect(px + 9 * S, py + 9 * S, pw - 18 * S, ph - 18 * S);
    g.save(); g.beginPath(); g.rect(px + 9 * S, py + 9 * S, pw - 18 * S, ph - 18 * S); g.clip();
    g.fillStyle = "#fff3c4"; g.beginPath(); g.arc(px + pw * 0.7, py + ph * 0.38, 11 * S, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#5b6f8f"; g.beginPath(); g.moveTo(px, py + ph); g.lineTo(px + pw * 0.35, py + ph * 0.35); g.lineTo(px + pw * 0.62, py + ph); g.fill();
    g.fillStyle = "#3f506e"; g.beginPath(); g.moveTo(px + pw * 0.35, py + ph); g.lineTo(px + pw * 0.68, py + ph * 0.5); g.lineTo(px + pw, py + ph); g.fill();
    g.restore();
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1.5; g.strokeRect(px, py, pw, ph);
  }

  /* skirting board */
  g.fillStyle = "#f6f1e6"; g.fillRect(0, L.horizon - 16 * S, W, 16 * S);
  g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, L.horizon - 17 * S, W, 1.5); g.fillRect(0, L.horizon - 2, W, 2);

  /* wooden floor */
  gr = g.createLinearGradient(0, L.horizon, 0, H);
  gr.addColorStop(0, "#a8774a"); gr.addColorStop(1, "#c79a66");
  g.fillStyle = gr; g.fillRect(0, L.horizon, W, H - L.horizon);
  // planks: rows get taller towards the viewer, joints staggered
  let py2 = L.horizon, row = 0, ph2 = 9 * S;
  let seed2 = 3; const rnd2 = () => (seed2 = (seed2 * 48271) % 2147483647) / 2147483647;
  while (py2 < H) {
    g.fillStyle = `rgba(${row % 2 ? "255,255,255" : "0,0,0"},${0.03 + rnd2() * 0.04})`;
    g.fillRect(0, py2, W, ph2);
    g.strokeStyle = "rgba(60,35,15,0.35)"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, py2); g.lineTo(W, py2); g.stroke();
    const plankW = ph2 * 9;
    for (let x = -rnd2() * plankW; x < W; x += plankW * (0.8 + rnd2() * 0.5)) {
      g.beginPath(); g.moveTo(x, py2); g.lineTo(x, py2 + ph2); g.stroke();
    }
    py2 += ph2; ph2 *= 1.32; row++;
  }
  // soft shadow where the wall meets the floor
  gr = g.createLinearGradient(0, L.horizon, 0, L.horizon + 26 * S);
  gr.addColorStop(0, "rgba(0,0,0,0.22)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, L.horizon, W, 26 * S);

  /* rug under the chair */
  g.save(); g.translate(L.hx, L.wheelY + 6 * S);
  for (const [rx, ry, col] of [[185, 34, "#22406b"], [172, 29, "#e8dcc0"], [164, 26, "#2f5f8f"], [120, 17, "#e8dcc0"], [112, 14.5, "#b3272f"]]) {
    g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, rx * S, ry * S, 0, 0, Math.PI * 2); g.fill();
  }
  g.restore();

  /* floor lamp (right) */
  {
    const lx = L.lampX, top = L.horizon - 300 * S, base = L.horizon + 22 * S;
    g.fillStyle = "rgba(0,0,0,0.18)"; g.beginPath(); g.ellipse(lx, base + 3 * S, 34 * S, 7 * S, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#3b3b40"; g.beginPath(); g.ellipse(lx, base, 26 * S, 6 * S, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#3b3b40"; g.lineWidth = 5 * S; g.beginPath(); g.moveTo(lx, base); g.lineTo(lx, top + 60 * S); g.stroke();
    gr = g.createLinearGradient(0, top, 0, top + 64 * S);
    gr.addColorStop(0, "#f4d27a"); gr.addColorStop(1, "#ffe9ae");
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(lx - 26 * S, top); g.lineTo(lx + 26 * S, top); g.lineTo(lx + 44 * S, top + 64 * S); g.lineTo(lx - 44 * S, top + 64 * S); g.closePath(); g.fill();
    g.strokeStyle = "rgba(90,60,10,0.5)"; g.lineWidth = 1.5; g.stroke();
  }

  /* potted plant (far left) */
  if (L.wide) {
    const px = Math.max(46 * S, W * 0.045), py = L.horizon + 26 * S;
    g.fillStyle = "rgba(0,0,0,0.18)"; g.beginPath(); g.ellipse(px, py + 2 * S, 34 * S, 7 * S, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#2f6b3a"; g.lineWidth = 2.5 * S;
    for (const [a, len] of [[-1.9, 120], [-1.55, 150], [-1.2, 125], [-2.3, 95], [-0.85, 90]]) {
      const ex = px + Math.cos(a) * len * S, ey = py - 50 * S + Math.sin(a) * len * S;
      g.beginPath(); g.moveTo(px, py - 46 * S); g.quadraticCurveTo(px + Math.cos(a) * len * 0.3 * S, ey, ex, ey); g.stroke();
      g.fillStyle = "#3d8a4c";
      for (let t = 0.35; t <= 1; t += 0.16) {
        const lx2 = px + (ex - px) * t, ly2 = py - 46 * S + (ey - (py - 46 * S)) * (1 - (1 - t) * (1 - t));
        for (const sgn of [-1, 1]) { g.beginPath(); g.ellipse(lx2 + sgn * 9 * S, ly2 - 2 * S, 11 * S, 4.5 * S, a + sgn * 0.9, 0, Math.PI * 2); g.fill(); }
      }
    }
    gr = g.createLinearGradient(px - 28 * S, 0, px + 28 * S, 0);
    gr.addColorStop(0, "#c86a3c"); gr.addColorStop(0.5, "#e08a57"); gr.addColorStop(1, "#a9522a");
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(px - 28 * S, py - 48 * S); g.lineTo(px + 28 * S, py - 48 * S); g.lineTo(px + 20 * S, py); g.lineTo(px - 20 * S, py); g.closePath(); g.fill();
    g.strokeStyle = "rgba(70,30,10,0.5)"; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = "#b85c33"; R(px - 31 * S, py - 54 * S, 62 * S, 10 * S, 3 * S); g.fill(); g.stroke();
  }

  /* side table with a mosquito coil */
  if (L.wide) {
    const tx = L.tableX, ty = L.wheelY - 78 * S, by = L.wheelY + 4 * S;
    g.fillStyle = "rgba(0,0,0,0.16)"; g.beginPath(); g.ellipse(tx, by + 2 * S, 48 * S, 8 * S, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#5a3b20"; g.lineWidth = 6 * S;
    g.beginPath(); g.moveTo(tx - 30 * S, ty); g.lineTo(tx - 36 * S, by); g.moveTo(tx + 30 * S, ty); g.lineTo(tx + 36 * S, by); g.stroke();
    gr = g.createLinearGradient(0, ty - 8 * S, 0, ty + 6 * S);
    gr.addColorStop(0, "#9a6a3c"); gr.addColorStop(1, "#6e4826");
    g.fillStyle = gr; g.beginPath(); g.ellipse(tx, ty, 46 * S, 10 * S, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(40,20,5,0.5)"; g.lineWidth = 1.5; g.stroke();
    // coil
    g.fillStyle = "#c9c9c9"; g.beginPath(); g.ellipse(tx, ty - 3 * S, 22 * S, 5 * S, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#2f7d43"; g.lineWidth = 2.6 * S;
    g.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.2) {
      const r = (2 + a * 1.15) * S, x = tx + Math.cos(a) * r, y = ty - 5 * S + Math.sin(a) * r * 0.24;
      a ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }

  /* warm lamp light + vignette */
  const lx = L.lampX, ly = L.horizon - 250 * S;
  gr = g.createRadialGradient(lx, ly, 10 * S, lx, ly, 420 * S);
  gr.addColorStop(0, "rgba(255,225,140,0.42)"); gr.addColorStop(1, "rgba(255,225,140,0)");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  gr.addColorStop(0, "rgba(20,25,50,0)"); gr.addColorStop(1, "rgba(20,25,50,0.38)");
  g.fillStyle = gr; g.fillRect(0, 0, W, H);

  bgDirty = false;
}

function drawRoom() {
  if (bgDirty || !bgCanvas) buildBackground();
  // drawn slightly oversized so screen-shake never shows an edge
  ctx.drawImage(bgCanvas, -12, -12, W + 24, H + 24);
  const L = roomLayout();

  // lamp gently breathing
  const lx = L.lampX, ly = L.horizon - 250 * S;
  const glow = ctx.createRadialGradient(lx, ly, 5 * S, lx, ly, 150 * S);
  glow.addColorStop(0, `rgba(255,235,160,${0.16 + Math.sin(time * 2.1) * 0.03})`);
  glow.addColorStop(1, "rgba(255,235,160,0)");
  ctx.fillStyle = glow; ctx.fillRect(lx - 150 * S, ly - 150 * S, 300 * S, 300 * S);

  // smoke rising from the mosquito coil
  if (L.wide) {
    const sx = L.tableX + 22 * S, sy = L.wheelY - 84 * S;
    ctx.save(); ctx.lineCap = "round";
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 22; i++) {
        const t = i / 22;
        const x = sx + Math.sin(t * 5 + time * 1.3 + k * 2) * (4 + t * 22) * S + k * 5 * S * t;
        const y = sy - t * 190 * S;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.28 - k * 0.1})`; ctx.lineWidth = (3 - k) * S; ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,120,40,${0.7 + Math.sin(time * 6) * 0.3})`;
    ctx.beginPath(); ctx.arc(sx, sy + 1 * S, 2.2 * S, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // twinkling stars in the window
  if (L.wide) {
    const w = L.win;
    for (let i = 0; i < 5; i++) {
      const a = 0.5 + 0.5 * Math.sin(time * (1.5 + i * 0.7) + i * 2);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath(); ctx.arc(w.x + w.w * (0.12 + i * 0.07) , w.y + w.h * (0.1 + ((i * 37) % 30) / 100), 1.6 * S, 0, Math.PI * 2); ctx.fill();
    }
  }

  // contact shadow under the chair
  const sh = ctx.createRadialGradient(L.hx, L.wheelY + 2 * S, 5 * S, L.hx, L.wheelY + 2 * S, 100 * S);
  sh.addColorStop(0, "rgba(0,0,0,0.38)"); sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save(); ctx.translate(0, (L.wheelY + 2 * S) * 0.86); ctx.scale(1, 0.14);
  ctx.fillStyle = sh; ctx.fillRect(L.hx - 100 * S, L.wheelY + 2 * S - 100 * S, 200 * S, 200 * S);
  ctx.restore();
}

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

function drawHero() {
  const h = hero();
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.scale(S * facing, S);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;

  /* ----- Office chair (side view, facing right) ----- */
  // wheel base
  ctx.fillStyle = "#333";
  ctx.beginPath(); ctx.moveTo(-50, 88); ctx.lineTo(50, 88); ctx.stroke();
  for (const wx of [-48, 0, 48]) { ctx.beginPath(); ctx.arc(wx, 92, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  // gas pole
  rr(-5, 40, 10, 48, 3); ctx.fillStyle = "#555"; ctx.fill(); ctx.stroke();
  // backrest
  ctx.save(); ctx.translate(-50, 30); ctx.rotate(-0.12);
  rr(-10, -100, 18, 104, 8); ctx.fillStyle = "#3a3d46"; ctx.fill(); ctx.stroke();
  ctx.restore();
  // seat
  rr(-56, 26, 104, 16, 7); ctx.fillStyle = "#3a3d46"; ctx.fill(); ctx.stroke();
  // armrest (back side)
  ctx.beginPath(); ctx.moveTo(-40, 26); ctx.lineTo(-40, 4); ctx.lineTo(18, 4); ctx.stroke();

  /* ----- Legs (sitting) ----- */
  // thigh
  limb(-18, 18, 34, 20, 22, C.suitBlue);
  // shin
  limb(34, 20, 38, 76, 19, C.suitBlue);
  // boot (red)
  ctx.fillStyle = C.suitRed;
  ctx.beginPath();
  ctx.moveTo(28, 66); ctx.lineTo(48, 66); ctx.lineTo(50, 82);
  ctx.quadraticCurveTo(66, 84, 66, 92); ctx.lineTo(28, 92); ctx.closePath();
  ctx.fill(); ctx.stroke();
  webLines(38, 79, 12);
  // red knee pad stripe
  ctx.fillStyle = C.suitRed;
  ctx.beginPath(); ctx.arc(34, 20, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  /* ----- Torso ----- */
  ctx.save(); ctx.translate(-10, -18); ctx.rotate(0.05);
  rr(-20, -38, 40, 64, 14); ctx.fillStyle = C.suitBlue; ctx.fill(); ctx.stroke();
  rr(-14, -38, 30, 64, 12); ctx.fillStyle = C.suitRed; ctx.fill(); ctx.stroke();
  // web pattern on chest
  ctx.save(); ctx.clip(); webLines(1, -30, 40); ctx.restore();
  // belt line
  ctx.beginPath(); ctx.moveTo(-14, 16); ctx.quadraticCurveTo(0, 22, 16, 16); ctx.stroke();
  // spider emblem
  spider(4, -12, 1);
  ctx.restore();

  /* ----- Relaxed back arm on armrest ----- */
  limb(-14, -46, -16, -10, 13, C.suitRed);
  limb(-16, -10, 12, 0, 12, C.suitRed);
  ctx.fillStyle = C.suitRed; ctx.beginPath(); ctx.arc(14, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  /* ----- Head ----- */
  ctx.restore();

  /* ----- Shooting arm (drawn in world space so it can aim anywhere) ----- */
  if (state !== State.MENU || mouse.active) drawArm();
  else drawArmIdle(h);

  /* ----- Head last, so the face is never hidden behind the arm ----- */
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.scale(S * facing, S);
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
  drawHead(-8, -78);
  ctx.restore();
}

function limb(x1, y1, x2, y2, w, color) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = C.ink; ctx.lineWidth = w + 5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  // highlight + shade for a rounded look
  ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = w * 0.28;
  ctx.beginPath(); ctx.moveTo(x1 - 1.5, y1 - w * 0.2); ctx.lineTo(x2 - 1.5, y2 - w * 0.2); ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.16)"; ctx.lineWidth = w * 0.25;
  ctx.beginPath(); ctx.moveTo(x1 + 1, y1 + w * 0.28); ctx.lineTo(x2 + 1, y2 + w * 0.28); ctx.stroke();
  ctx.restore();
}

function webLines(cx, cy, r) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 0.9;
  const spokes = 8;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r * 1.6); ctx.stroke();
  }
  for (let ring = 1; ring <= 3; ring++) {
    const rad = (r / 3) * ring * 1.1;
    ctx.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else {
        const pa = ((i - 0.5) / spokes) * Math.PI * 2;
        ctx.quadraticCurveTo(cx + Math.cos(pa) * rad * 0.82, cy + Math.sin(pa) * rad * 0.82, px, py);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

function spider(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = "#111"; ctx.strokeStyle = "#111"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(0, -2, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 4, 3, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  for (const sgn of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(sgn * 6, -8); ctx.lineTo(sgn * 7, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(sgn * 7, -3); ctx.lineTo(sgn * 9, -7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(sgn * 7, 4); ctx.lineTo(sgn * 9, 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(sgn * 5, 9); ctx.lineTo(sgn * 6, 14); ctx.stroke();
  }
  ctx.restore();
}


function drawHead(x, y) {
  ctx.save(); ctx.translate(x, y);
  // neck
  rr(-7, 14, 14, 14, 4); ctx.fillStyle = C.suitRed; ctx.fill(); ctx.stroke();

  const fi = getImg(CONFIG.faceImage ? roundHeroFace().img : "");   // this round's hero face
  if (fi.ready) {
    // un-mirror so the photo never appears flipped
    ctx.scale(facing, 1);
    // the PNG is a cut-out (transparent background, outline baked in);
    // the chin tucks into the collar of the suit
    const h = CONFIG.faceSize, w = h * (fi.el.width / fi.el.height);
    const chinY = 25;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(fi.el, -w / 2 + CONFIG.faceOffsetX, chinY - h + CONFIG.faceOffsetY, w, h);
    ctx.restore();
    return;
  }

  // mask
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 25, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.suitRed; ctx.fill();
  ctx.save(); ctx.clip(); webLines(4, 2, 18); ctx.restore();
  ctx.beginPath(); ctx.ellipse(0, 0, 22, 25, 0, 0, Math.PI * 2); ctx.stroke();
  // eyes (big white lenses with thick black frames), facing right
  const blink = (Math.sin(time * 0.9) > 0.985) ? 0.25 : 1;
  for (const [ex, ey, rot] of [[11, -4, 0.5], [-3, -4, -0.35]]) {
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(rot); ctx.scale(1, blink);
    ctx.beginPath();
    ctx.moveTo(-7, 3); ctx.quadraticCurveTo(-6, -9, 7, -6); ctx.quadraticCurveTo(6, 6, -7, 3);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.lineWidth = 3.2; ctx.strokeStyle = "#111"; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawArm() {
  const hd = heroHand();
  const sx = hd.sx, sy = hd.sy, a = hd.a;
  const ex = sx + Math.cos(a) * 32 * S, ey = sy + Math.sin(a) * 32 * S;
  ctx.save();
  ctx.lineCap = "round";
  // upper + forearm
  ctx.strokeStyle = C.ink; ctx.lineWidth = 17 * S;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hd.x, hd.y); ctx.stroke();
  ctx.strokeStyle = C.suitRed; ctx.lineWidth = 12 * S;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hd.x, hd.y); ctx.stroke();
  // blue underside stripe
  ctx.strokeStyle = C.suitBlue; ctx.lineWidth = 4 * S;
  const nx = -Math.sin(a) * 4 * S, ny = Math.cos(a) * 4 * S;
  ctx.beginPath(); ctx.moveTo(sx + nx, sy + ny); ctx.lineTo(ex + nx, ey + ny); ctx.stroke();
  // shoulder
  ctx.fillStyle = C.suitRed; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(sx, sy, 10 * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // hand in "thwip" pose: fist with two fingers out
  ctx.translate(hd.x, hd.y); ctx.rotate(a); ctx.scale(S, S);
  ctx.fillStyle = C.suitRed;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 3.5; ctx.strokeStyle = C.ink;
  ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(13, -7); ctx.stroke(); // index
  ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(13, 7); ctx.stroke();   // pinky
  ctx.lineWidth = 2; ctx.strokeStyle = C.suitRed;
  ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(13, -7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(13, 7); ctx.stroke();
  ctx.restore();
}

function drawArmIdle(h) {
  // on the menu, arm rests on the knee
  ctx.save(); ctx.translate(h.x, h.y); ctx.scale(S * facing, S);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
  limb(-4, -48, 10, -14, 13, C.suitRed);
  limb(10, -14, 32, 8, 12, C.suitRed);
  ctx.fillStyle = C.suitRed; ctx.beginPath(); ctx.arc(34, 10, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawAim() {
  const hd = heroHand();
  const dist = Math.max(60 * S, Math.hypot(mouse.x - hd.x, mouse.y - hd.y));
  const far = Math.max(W, H) * 1.5;
  ctx.save();
  ctx.setLineDash([7 * S, 7 * S]);
  ctx.lineDashOffset = -time * 40;
  for (const [col, lw] of [["rgba(255,255,255,0.75)", 4], ["rgba(30,30,30,0.85)", 1.8]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(hd.x + Math.cos(hd.a) * 14 * S, hd.y + Math.sin(hd.a) * 14 * S);
    ctx.lineTo(hd.x + Math.cos(hd.a) * far, hd.y + Math.sin(hd.a) * far);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // crosshair at cursor distance
  const cx = hd.x + Math.cos(hd.a) * dist, cy = hd.y + Math.sin(hd.a) * dist;
  ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 4.5;
  ctx.beginPath(); ctx.arc(cx, cy, 9 * S, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#222"; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(cx, cy, 9 * S, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 2 * S, 0, Math.PI * 2); ctx.fillStyle = "#c8102e"; ctx.fill();
  ctx.restore();
}

function drawWeb() {
  const tx = web.ox + web.dx * web.len, ty = web.oy + web.dy * web.len;
  ctx.save();
  ctx.lineCap = "round";
  // two twisted strands for a web-rope look
  const nx = -web.dy, ny = web.dx;
  for (const [col, w] of [[C.webEdge, 5 * S], [C.web, 3 * S]]) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(web.ox, web.oy); ctx.lineTo(tx, ty); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(150,155,165,0.9)"; ctx.lineWidth = 1;
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    const steps = Math.max(2, Math.floor(web.len / (10 * S)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const off = Math.sin(t * steps * 1.2 + time * 30) * 3 * S * sgn;
      const px = web.ox + web.dx * web.len * t + nx * off, py = web.oy + web.dy * web.len * t + ny * off;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  // web splat at tip
  ctx.translate(tx, ty);
  const r = (web.phase === "stick" ? 16 : 7) * S;
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke();
  }
  ctx.strokeStyle = C.webEdge; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawMosquito(m) {
  const s = m.size;
  const dir = m.vx >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(m.x, m.y);
  ctx.scale(s * dir, s);
  ctx.rotate(Math.max(-0.4, Math.min(0.4, m.vy / 600)));
  ctx.lineCap = "round";

  if (m.type === "normal") { drawRefMosquito(m); ctx.restore(); return; }

  const isGf = m.type === "gf";
  const body = m.hitFlash > 0 ? "#fff" : isGf ? "#ff6fae" : m.type === "big" ? "#3b3b3b" : "#555";

  // wings (fast flap)
  const flap = Math.abs(Math.sin(time * 60 + m.phase * 10));
  ctx.fillStyle = "rgba(180,200,230,0.55)";
  ctx.strokeStyle = "rgba(80,90,110,0.6)"; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.ellipse(-2, -6 - flap * 3, 9, 3 + flap * 2, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(1, -5 - (1 - flap) * 3, 7, 2.5, -0.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

  // legs
  ctx.strokeStyle = "#333"; ctx.lineWidth = 0.9;
  for (let i = 0; i < 3; i++) {
    const lx = -3 + i * 3;
    ctx.beginPath(); ctx.moveTo(lx, 1); ctx.lineTo(lx - 3, 7); ctx.lineTo(lx - 5 + i * 2, 13); ctx.stroke();
  }
  // abdomen (striped)
  ctx.fillStyle = m.fed ? "#c8102e" : body;
  ctx.beginPath(); ctx.ellipse(-8, 1, 8, 3.2, 0.25, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = isGf ? "#fff" : "#222"; ctx.lineWidth = 0.8;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-12 + i * 3, -1.5); ctx.lineTo(-12 + i * 3, 3.5); ctx.stroke(); }
  // thorax + head
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.ellipse(1, -1, 4.2, 3.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -1, 2.6, 0, Math.PI * 2); ctx.fill();
  // eye
  ctx.fillStyle = "#c22"; ctx.beginPath(); ctx.arc(7, -1.8, 1, 0, Math.PI * 2); ctx.fill();
  // proboscis
  ctx.strokeStyle = "#222"; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(15, 3); ctx.stroke();

  if (isGf) {
    // bow + eyelashes
    ctx.fillStyle = "#e0004d";
    ctx.beginPath(); ctx.moveTo(5, -4); ctx.lineTo(1, -8); ctx.lineTo(1, -2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(5, -4); ctx.lineTo(9, -8); ctx.lineTo(9, -2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#111"; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(7, -2.5); ctx.lineTo(8, -4.5); ctx.moveTo(7.8, -2.2); ctx.lineTo(9.3, -3.8); ctx.stroke();
  }
  const bf = getImg(roundEnemyFace().img);   // the big mosquito wears the other face
  if (m.type === "big" && bf.ready) {
    // photo face as the mosquito's head (kept upright, never mirrored)
    ctx.save();
    ctx.translate(7, -3);
    ctx.scale(dir, 1);
    const fh = CONFIG.bigFaceSize, fw = fh * (bf.el.width / bf.el.height);
    ctx.imageSmoothingQuality = "high";
    if (m.hitFlash > 0) ctx.globalAlpha = 0.6;
    ctx.drawImage(bf.el, -fw / 2, -fh / 2, fw, fh);
    ctx.restore();
  }
  if (m.type === "big" && m.hp === 1) {
    // bandage when injured
    ctx.strokeStyle = "#f5deb3"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(3, 2); ctx.stroke();
  }
  ctx.restore();
}

/* The mosquito from the reference video: glossy blood-filled red belly,
   black body with white spots, pale blue blurred wings, thin dangling legs.
   Drawn facing right; already translated/scaled by drawMosquito. */
function drawRefMosquito(m) {
  const flash = m.hitFlash > 0;
  const flap = Math.abs(Math.sin(time * 60 + m.phase * 10));

  // wings: pale blue, blurred by motion (two ghost positions)
  for (const [k, a] of [[flap, 0.45], [1 - flap, 0.25]]) {
    ctx.fillStyle = `rgba(190,215,235,${a})`;
    ctx.beginPath(); ctx.ellipse(-1, -6 - k * 4, 9, 3.2 + k * 1.5, -0.55 + k * 0.3, 0, Math.PI * 2); ctx.fill();
  }

  // thin dangling legs (hang down and back while flying)
  ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 0.7;
  const sway = Math.sin(time * 8 + m.phase) * 1.2;
  for (let i = 0; i < 3; i++) {
    const lx = 0 + i * 2.2;
    ctx.beginPath(); ctx.moveTo(lx, 2); ctx.lineTo(lx - 2 + i, 8); ctx.lineTo(lx - 5 + i * 2 + sway, 15); ctx.stroke();
    // white band on legs (Aedes look)
    ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(lx - 2 + i, 8); ctx.lineTo(lx - 2.6 + i * 1.2, 10); ctx.stroke();
    ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 0.7;
  }

  // glossy red, blood-filled abdomen (teardrop tilting down-back)
  ctx.save();
  ctx.translate(-7, 2); ctx.rotate(0.3);
  const grad = ctx.createLinearGradient(0, -4, 0, 4);
  grad.addColorStop(0, flash ? "#fff" : "#ff4d5e");
  grad.addColorStop(0.5, flash ? "#fff" : "#d0102a");
  grad.addColorStop(1, flash ? "#ddd" : "#7a0614");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(5, -2);
  ctx.quadraticCurveTo(-2, -5, -9, -1.5);
  ctx.quadraticCurveTo(-11, 1, -8, 2.8);
  ctx.quadraticCurveTo(-1, 4.5, 5, 2);
  ctx.closePath(); ctx.fill();
  // shine
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath(); ctx.ellipse(-3, -2, 3, 0.8, -0.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // black thorax with white spots
  ctx.fillStyle = flash ? "#fff" : "#141414";
  ctx.beginPath(); ctx.ellipse(1.5, -0.5, 4, 3.4, -0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff";
  for (const [x, y, r] of [[0.5, -2, 0.8], [2.8, -1.2, 0.7], [1.5, 0.8, 0.6]]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // head with white stripe + big dark eye
  ctx.fillStyle = flash ? "#fff" : "#141414";
  ctx.beginPath(); ctx.arc(6.3, 0.3, 2.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(5.2, -1.6); ctx.lineTo(7.6, -1.4); ctx.stroke();
  // antennae + long proboscis
  ctx.strokeStyle = "#222"; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(7.5, -0.8); ctx.lineTo(11, -4); ctx.moveTo(7.8, -0.3); ctx.lineTo(11.5, -2.5); ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(8.3, 1); ctx.lineTo(15, 4.5); ctx.stroke();
}

function drawCocoon(c) {
  ctx.save();
  ctx.globalAlpha = Math.min(1, c.life);
  ctx.translate(c.x, c.y);
  ctx.rotate(c.rot);
  const s = c.size;
  ctx.fillStyle = c.type === "gf" ? "#ffe3f0" : "#f4f4f4";
  ctx.strokeStyle = "#9aa0a8"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, 11 * s, 7 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath(); ctx.moveTo(i * 4 * s - 3 * s, -7 * s); ctx.lineTo(i * 4 * s + 3 * s, 7 * s); ctx.stroke();
  }
  // little legs sticking out
  ctx.strokeStyle = "#333";
  ctx.beginPath(); ctx.moveTo(8 * s, 3 * s); ctx.lineTo(13 * s, 6 * s); ctx.moveTo(-8 * s, 3 * s); ctx.lineTo(-12 * s, 7 * s); ctx.stroke();
  ctx.restore();
}

/* ---------------- Main loop ---------------- */
let last = performance.now(), frameEma = 1 / 60, slowFrames = 0;
function loop(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  // slow device (under ~36 fps for a couple of seconds)? render at a lower resolution
  if (raw < 0.25) {
    frameEma += (raw - frameEma) * 0.05;
    if (frameEma > 1 / 36 && dprCap > 1) {
      if (++slowFrames > 90) { dprCap = Math.max(1, dprCap - 0.5); slowFrames = 0; frameEma = 1 / 60; resize(); }
    } else slowFrames = 0;
  }
  if (state === State.INTRO) { time += dt; introT += dt; if (introT >= CONFIG.introSeconds) beginRound(); }
  else if (state === State.PLAY || state === State.MENU) update(dt);
  else time += 0; // frozen while paused / game over
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------------- Input ---------------- */
function setMouse(e) { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }
canvas.addEventListener("pointermove", setMouse);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());   // no long-press menu on phones
canvas.addEventListener("pointerdown", (e) => {
  setMouse(e); Sound.init();
  if (state === State.INTRO) { if (introT > 0.4) beginRound(); return; }
  shoot();
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); if (state === State.INTRO && introT > 0.4) beginRound(); else shoot(); }
  if (e.code === "KeyP" || e.code === "Escape") {
    if (state === State.PLAY) setState(State.PAUSE);
    else if (state === State.PAUSE) setState(State.PLAY);
  }
  if (e.code === "KeyM") { Sound.muted = !Sound.muted; if (Sound.muted) Sound.stopAll(); }
});

function startGame() { Sound.init(); score = 0; showIntro(1); }
$("playBtn").onclick = startGame;

// ---- Instagram follow gate ----
// NOTE: a website cannot truly verify an Instagram follow (Instagram has no public
// API for that). So this is an honor-system gate: they must open our page, and the
// game unlocks only after they come back from it (and at least 5s have passed).
(function followGate() {
  const KEY = "ws_followed", MIN_MS = 5000;
  const play = $("playBtn"), link = $("followBtn"), msg = $("followMsg");
  const unlock = () => {
    if (!play.dataset.counted) { play.dataset.counted = 1; if (window.gtag) gtag("event", "game_unlocked"); }
    play.disabled = false; play.textContent = "▶ PLAY";
    link.classList.add("hidden"); msg.classList.add("hidden");
    try { localStorage.setItem(KEY, "1"); } catch (e) {}
  };
  let done = false; try { done = localStorage.getItem(KEY) === "1"; } catch (e) {}
  if (done) return unlock();
  let openedAt = 0;
  link.addEventListener("click", () => {
    openedAt = Date.now();
    if (window.gtag) gtag("event", "instagram_follow_click");
    msg.textContent = "Follow us, then come back to this tab…";
  });
  const check = () => {
    if (!openedAt || document.hidden) return;
    if (Date.now() - openedAt >= MIN_MS) unlock();
    else msg.textContent = "Did you follow? Please follow first, then come back!";
  };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("focus", check);
})();
$("retryBtn").onclick = () => { Sound.init(); score = 0; showIntro(1); };
$("nextBtn").onclick = () => { Sound.init(); showIntro(round + 1); };
$("pauseBtn").onclick = () => { if (state === State.PLAY) setState(State.PAUSE); };
$("resumeBtn").onclick = () => setState(State.PLAY);
$("menuBtn").onclick = () => { resetGame(); setState(State.MENU); };
$("menuBtn2").onclick = () => { resetGame(); setState(State.MENU); };
window.addEventListener("blur", () => { if (state === State.PLAY) setState(State.PAUSE); });
document.addEventListener("visibilitychange", () => { if (document.hidden && state === State.PLAY) setState(State.PAUSE); });

mouse.x = W / 2 + 200; mouse.y = H / 3;
if (TOUCH) { const hint = document.querySelector("#menu .hint:not(#followMsg)"); if (hint) hint.textContent = "Tap anywhere to aim and shoot your web \u00b7 tap the II button to pause"; }
updateHud();
setState(State.MENU);
