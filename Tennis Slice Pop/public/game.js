/* ============================================================
   TENNIS SLICE POP — (v1.0)
   Motor: spawns, rallies, ACE, OUT, match point, raquetada
   transiente, partículas com glow, sons, partilha por link.
   ============================================================ */

'use strict';

// ---------- Configuração ----------
const CONFIG = {
  holes: 9,
  roundTime: 60,
  frenzyStart: 10,
  spawnMin: 620,
  spawnMinFrenzy: 320,
  spawnMax: 1250,
  spawnMaxFrenzy: 620,
  upMin: 820,
  upMax: 1450,
  upMinFrenzy: 560,
  upMaxFrenzy: 880,
  comboTimeout: 1600,
  goldChance: 0.10,
  goldChanceFrenzy: 0.22,
  bombChance: 0.13,
  bombChanceFrenzy: 0.20,
  pointsMole: 10,
  pointsGold: 50,
  pointsBomb: -30,
  goldTimeBonus: 2,
};

const RANKS = [
  { min: 0,    label: 'Caloiro' },
  { min: 80,   label: 'Club Player' },
  { min: 180,  label: 'Baseline Boss' },
  { min: 320,  label: 'Ace Machine' },
  { min: 500,  label: 'Set Point Sniper' },
  { min: 720,  label: 'Grand Slam Legend' },
  { min: 1000, label: 'Tiebreak Titan' },
  { min: 1300, label: 'GOAT Mode' },
];

// ---------- Aleatoriedade deterministica ----------
function createSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Date.now() >>> 0;
}

// Mulberry32: uma seed uint32 produz sempre a mesma sequencia em [0, 1).
function createPrng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(value ^ (value >>> 15), value | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

let gameRandom;
let fxRandom;

// ---------- Recorde local ----------
const BEST_SCORE_KEY = 'slice-pop-best';

function readBestScore() {
  try {
    const score = Number(localStorage.getItem(BEST_SCORE_KEY));
    return Number.isSafeInteger(score) && score >= 0 ? score : 0;
  } catch (e) {
    return 0;
  }
}

function saveBestScore(score) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch (e) { /* Mantem o recorde da sessao se o armazenamento estiver indisponivel. */ }
}

function readFeedbackPreference(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch (e) { return fallback; }
}
function saveFeedbackPreference(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (e) { /* Session preference still works. */ }
}

// ---------- Estado ----------
const State = {
  phase: 'start',
  score: 0,
  combo: 0,
  maxCombo: 0,
  hits: 0,
  goldHits: 0,
  bombHits: 0,
  mode: 'free',
  timeLeft: CONFIG.roundTime,
  soundOn: readFeedbackPreference('slice-pop-sound', true),
  musicOn: readFeedbackPreference('slice-pop-music', true),
  hapticsOn: readFeedbackPreference('slice-pop-haptics', false),
  best: readBestScore(),
  challengeScore: null,
  challengeSeed: null,
  challengeActive: false,
  seed: createSeed(),
};

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const board = $('board');
const slashLayer = $('slashLayer');
const fxCanvas = $('fxLayer');
const fxCtx = fxCanvas.getContext('2d');
const scoreVal = $('scoreVal');
const timerVal = $('timerVal');
const timerBox = $('timerBox');
const comboFill = $('comboFill');
const comboMult = $('comboMult');
const comboWrap = $('comboWrap');
const comboText = $('comboText');
const feverOverlay = $('feverOverlay');
const startScreen = $('startScreen');
const endScreen = $('endScreen');
const finalScore = $('finalScore');
const rankLabel = $('rankLabel');
const maxComboStat = $('maxComboStat');
const hitsStat = $('hitsStat');
const bestStat = $('bestStat');
const bestVal = $('bestVal');
const challengeBanner = $('challengeBanner');
const challengeText = $('challengeText');
const shareHint = $('shareHint');

// ---------- Áudio procedural ----------
const Sfx = {
  ctx: null,
  master: null,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = State.soundOn ? 1 : 0;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; this.master = null; }
  },
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },
  tone(freq, dur = 0.1, type = 'square', vol = 0.22, slideTo = null, delay = 0) {
    if (!State.soundOn || !this.ctx || document.hidden) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t); osc.stop(t + dur);
  },
  hit() { this.tone(420, .045, 'sine', .055, 260); },
  ace() { this.hit(); },
  out() { this.tone(140, .065, 'sine', .065, 95); },
  miss() { this.tone(180, .035, 'sine', .025, 120); },
  tick() { this.tone(700, .018, 'sine', .018); },
  end() { this.tone(280, .09, 'sine', .04, 180); },
};

// An original funk/house groove, decoded once and looped locally. Its bus is independent of the effects.
const Music = {
  unlocked: false,
  buffer: null,
  source: null,
  gain: null,
  loading: null,
  load() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        const response = await fetch('assets/court-groove.wav');
        if (!response.ok) return null;
        this.buffer = await Sfx.ctx.decodeAudioData(await response.arrayBuffer());
        return this.buffer;
      } catch (e) { return null; }
      finally { this.loading = null; }
    })();
    return this.loading;
  },
  stop() {
    if (!this.source) return;
    try { this.source.stop(); this.source.disconnect?.(); } catch (e) { /* Already stopped. */ }
    this.source = null;
  },
  sync() {
    if (!State.musicOn || !this.unlocked || document.hidden || !$('creatorIntro').hidden || State.phase === 'playing') { this.stop(); return; }
    if (this.source || !Sfx.ctx) return;
    if (!this.buffer) {
      if (!this.loading) this.load().then(buffer => { if (buffer) this.sync(); });
      return;
    }
    if (!this.gain) { this.gain = Sfx.ctx.createGain(); this.gain.gain.value = .3; this.gain.connect(Sfx.ctx.destination); }
    const source = Sfx.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.connect(this.gain);
    source.start();
    this.source = source;
  },
};

function prepareAudio() {
  Music.unlocked = true;
  if (State.soundOn || State.musicOn) { Sfx.init(); Sfx.resume(); }
}
function toggleMusic() {
  State.musicOn = !State.musicOn;
  saveFeedbackPreference('slice-pop-music', State.musicOn);
  if (State.musicOn) prepareAudio();
  Music.sync();
  window.dispatchEvent(new CustomEvent('slice-pop:music-changed', { detail: { enabled: State.musicOn } }));
}

// ---------- Feedback de raquetada ----------
const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const reducedMotion = () => Boolean(reducedMotionQuery?.matches);
const Feedback = {
  aceTimer: null,
  vibrationSupported: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',
  pulse(gold = false) {
    if (!State.hapticsOn || !this.vibrationSupported || document.hidden) return;
    try { navigator.vibrate(gold ? [12, 35, 16] : 8); } catch (e) { /* Optional device feedback. */ }
  },
  impact(clientX, clientY, gold) {
    const rect = slashLayer.getBoundingClientRect();
    const mark = document.createElement('div');
    mark.className = gold ? 'impact-mark impact-ace' : 'impact-mark';
    mark.style.left = `${clientX - rect.left}px`;
    mark.style.top = `${clientY - rect.top}px`;
    slashLayer.appendChild(mark);
    setTimeout(() => mark.remove(), 240);
    this.pulse(gold);
  },
  ace() {
    clearTimeout(this.aceTimer);
    const label = $('aceCelebration');
    label.classList.remove('is-visible');
    void label.offsetWidth;
    label.classList.add('is-visible');
    $('feedbackStatus').textContent = 'ACE! Mais dois segundos.';
    this.aceTimer = setTimeout(() => {
      label.classList.remove('is-visible');
      $('feedbackStatus').textContent = '';
    }, 650);
  },
  reset() {
    clearTimeout(this.aceTimer);
    $('aceCelebration').classList.remove('is-visible');
    $('feedbackStatus').textContent = '';
    slashLayer.replaceChildren();
    if (this.vibrationSupported) {
      try { navigator.vibrate(0); } catch (e) { /* No vibration permission is requested. */ }
    }
  },
};

// ---------- Bolas SVG ----------
// Bola de ténis clássica: amarelo-esverdeado com costura branca recortada dentro do círculo
const BALL_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="ballG" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#eeff66"/>
      <stop offset="0.6" stop-color="#d6ff2e"/>
      <stop offset="1" stop-color="#9bbb00"/>
    </radialGradient>
    <clipPath id="ballClip"><circle cx="50" cy="50" r="44"/></clipPath>
  </defs>
  <circle cx="50" cy="50" r="46" fill="url(#ballG)" stroke="#5a6b00" stroke-width="2.5"/>
  <g clip-path="url(#ballClip)">
    <path d="M20 28 C30 42 30 58 20 72" fill="none" stroke="#f6fff4" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M80 28 C70 42 70 58 80 72" fill="none" stroke="#f6fff4" stroke-width="4.5" stroke-linecap="round"/>
  </g>
  <ellipse cx="38" cy="32" rx="12" ry="7" fill="rgba(255,255,255,0.45)" transform="rotate(-30 38 32)"/>
</svg>`;

// ACE: bola dourada com costuras e identificacao central
const ACE_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="aceG" cx="0.4" cy="0.32" r="0.8">
      <stop offset="0" stop-color="#fff6c2"/>
      <stop offset="0.5" stop-color="#ffd23f"/>
      <stop offset="1" stop-color="#f4a300"/>
    </radialGradient>
    <clipPath id="aceClip"><circle cx="50" cy="50" r="43"/></clipPath>
  </defs>
  <circle cx="50" cy="50" r="44" fill="url(#aceG)" stroke="#7a4a00" stroke-width="2.5"/>
  <g clip-path="url(#aceClip)">
    <path d="M20 28 C30 42 30 58 20 72" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
    <path d="M80 28 C70 42 70 58 80 72" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
  </g>
  <ellipse cx="38" cy="32" rx="11" ry="6" fill="rgba(255,255,255,0.6)" transform="rotate(-30 38 32)"/>
  <text x="50" y="50" font-family="Unbounded, sans-serif" font-size="15" font-weight="900" fill="#7a4a00" text-anchor="middle" dominant-baseline="central">ACE</text>
</svg>`;

// OUT: bola vermelha com aviso
const OUT_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="outG" cx="0.4" cy="0.32" r="0.8">
      <stop offset="0" stop-color="#ff8a8a"/>
      <stop offset="0.6" stop-color="#ff3b3b"/>
      <stop offset="1" stop-color="#9c0e17"/>
    </radialGradient>
    <clipPath id="outClip"><circle cx="50" cy="50" r="45"/></clipPath>
  </defs>
  <circle cx="50" cy="50" r="46" fill="url(#outG)" stroke="#5a0309" stroke-width="2.5"/>
  <g clip-path="url(#outClip)">
    <path d="M20 28 C30 42 30 58 20 72" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
    <path d="M80 28 C70 42 70 58 80 72" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.7"/>
  </g>
  <text x="50" y="50" font-family="Unbounded, sans-serif" font-size="15" font-weight="900" fill="#fff" text-anchor="middle" dominant-baseline="central">OUT</text>
</svg>`;

// Raquetada (SVG inline para o slash)
const RACKET_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(-20 50 50)">
    <ellipse cx="50" cy="38" rx="30" ry="36" fill="none" stroke="#f6fff4" stroke-width="5"/>
    <ellipse cx="50" cy="38" rx="30" ry="36" fill="rgba(214,255,46,0.18)" stroke="rgba(214,255,46,0.9)" stroke-width="2"/>
    <!-- cordas -->
    <g stroke="rgba(246,255,244,0.5)" stroke-width="1">
      <line x1="24" y1="38" x2="76" y2="38"/>
      <line x1="26" y1="28" x2="74" y2="28"/>
      <line x1="26" y1="48" x2="74" y2="48"/>
      <line x1="50" y1="6" x2="50" y2="70"/>
      <line x1="40" y1="8" x2="40" y2="68"/>
      <line x1="60" y1="8" x2="60" y2="68"/>
    </g>
    <rect x="46" y="70" width="8" height="26" rx="3" fill="#c9a14a" stroke="#7a5a1a" stroke-width="2"/>
  </g>
</svg>`;

// ---------- Tabuleiro ----------
const holes = [];
function buildBoard() {
  board.innerHTML = '';
  holes.length = 0;
  for (let i = 0; i < CONFIG.holes; i++) {
    const hole = document.createElement('div');
    hole.className = 'hole';
    hole.dataset.index = i;
    const clip = document.createElement('div');
    clip.className = 'mole-clip';
    hole.appendChild(clip);
    hole.addEventListener('pointerdown', (e) => onHoleTap(i, e));
    board.appendChild(hole);
    holes.push({ el: hole, clip, index: i, active: false, type: null, spawnId: 0, upTimer: null });
  }
}

function ballSvg(type) {
  return type === 'gold' ? ACE_SVG : type === 'bomb' ? OUT_SVG : BALL_SVG;
}

function setBall(hole, type) {
  hole.clip.innerHTML = ballSvg(type);
}

function renderRuleBalls() {
  document.querySelectorAll('[data-rule-ball]').forEach(node => {
    const prefix = `rule-${node.dataset.ruleBall}-`;
    // Share the actual artwork, while keeping hidden SVG definitions isolated.
    node.innerHTML = ballSvg(node.dataset.ruleBall)
      .replace(/id="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
      .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`);
  });
}

function spawn(hole, type) {
  if (State.phase !== 'playing') return;
  hole.spawnId++;
  hole.type = type;
  hole.active = true;
  lastSpawnIndex = hole.index;
  setBall(hole, type);
  hole.el.classList.remove('hit', 'gold', 'bomb-glow');
  if (type === 'gold') hole.el.classList.add('gold');
  if (type === 'bomb') hole.el.classList.add('bomb-glow');
  hole.el.classList.add('active');

  const frenzy = State.timeLeft <= CONFIG.frenzyStart;
  const min = frenzy ? CONFIG.upMinFrenzy : CONFIG.upMin;
  const max = frenzy ? CONFIG.upMaxFrenzy : CONFIG.upMax;
  const upTime = min + gameRandom() * (max - min);
  clearTimeout(hole.upTimer);
  hole.upTimer = setTimeout(() => {
    if (hole.active) retire(hole, false);
  }, upTime);
}

function retire(hole, hit) {
  hole.active = false;
  hole.el.classList.remove('active', 'gold', 'bomb-glow');
  clearTimeout(hole.upTimer);
  if (hit) {
    hole.el.classList.add('hit');
    // Cooldown curto para a animação de acerto limpar antes de nova bola.
    hole.cooldownUntil = Date.now() + 350;
    setTimeout(() => { hole.el.classList.remove('hit'); }, 250);
  } else if (hole.type === 'bomb' && State.phase === 'playing') {
    // Evitou-se corretamente a bola OUT sem a tocar: manter o rally.
    resetComboTimer();
  }
  hole.type = null;
}

// ---------- Loop de spawns ----------
let spawnTimer = null;
let lastSpawnIndex = -1; // a última posição ocupada por um spawn
function scheduleNextSpawn() {
  if (State.phase !== 'playing') return;
  const frenzy = State.timeLeft <= CONFIG.frenzyStart;
  const min = frenzy ? CONFIG.spawnMinFrenzy : CONFIG.spawnMin;
  const max = frenzy ? CONFIG.spawnMaxFrenzy : CONFIG.spawnMax;
  const delay = min + gameRandom() * (max - min);
  spawnTimer = setTimeout(() => {
    doSpawn();
    scheduleNextSpawn();
  }, delay);
}

function doSpawn() {
  if (!syncRoundClock()) return;
  const now = Date.now();
  // Livre = sem bola ativa E sem cooldown da animação de acerto.
  const free = holes.filter(h => !h.active && (!h.cooldownUntil || h.cooldownUntil <= now) && h.index !== lastSpawnIndex);
  if (!free.length) return;
  const hole = free[Math.floor(gameRandom() * free.length)];
  const frenzy = State.timeLeft <= CONFIG.frenzyStart;
  const r = gameRandom();
  let type = 'mole';
  const bC = frenzy ? CONFIG.bombChanceFrenzy : CONFIG.bombChance;
  const gC = frenzy ? CONFIG.goldChanceFrenzy : CONFIG.goldChance;
  if (r < bC) type = 'bomb';
  else if (r < bC + gC) type = 'gold';
  spawn(hole, type);
}

// ---------- Input ----------
function onHoleTap(index, e) {
  if (State.phase !== 'playing') return;
  if (!syncRoundClock()) return;
  const hole = holes[index];
  if (!hole.active) {
    Sfx.miss();
    sparkAt(e.clientX, e.clientY, '#f6fff4', 6, 3, null);
    // Tocar num quadrado vazio sem bola é um erro de timing: quebra o rally.
    if (State.combo > 0) {
      State.combo = 0;
      const r = hole.el.getBoundingClientRect();
      floatText(r.left + r.width/2, r.top + r.height/2, 'QUEBRA!', '#ff5b5b');
      updateHUD();
      shakeScreen('soft');
    }
    return;
  }
  handleHit(hole, e);
}

function handleHit(hole, e) {
  const type = hole.type;
  retire(hole, true);
  const rect = hole.el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  if (type === 'bomb') {
    State.bombHits++;
    State.score = Math.max(0, State.score + CONFIG.pointsBomb);
    State.combo = 0;
    Sfx.out();
    sparkAt(cx, cy, '#ff3b3b', 26, 7, null);
    sparkAt(cx, cy, '#9c0e17', 14, 6, null);
    flashOut();
    shakeScreen('hard');
    floatText(cx, cy, 'OUT! -30', '#ff3b3b');
  } else {
    State.hits++;
    State.combo++;
    State.maxCombo = Math.max(State.maxCombo, State.combo);
    const mult = comboMultiplier();
    const base = type === 'gold' ? CONFIG.pointsGold : CONFIG.pointsMole;
    const gained = base * mult;
    State.score += gained;
    spawnSlash(cx, cy);
    Feedback.impact(cx, cy, type === 'gold');
    if (type === 'gold') {
      State.goldHits++;
      Sfx.ace();
      Feedback.ace();
      sparkAt(cx, cy, '#ffd23f', 28, 7, null);
      sparkAt(cx, cy, '#fff', 12, 5, null);
      addTime(CONFIG.goldTimeBonus);
      floatText(cx, cy, `+${gained}`, '#ffd23f');
    } else {
      Sfx.hit();
      sparkAt(cx, cy, 'rgba(214,255,46,0.9)', 18, 5, '#d6ff2e');
      floatText(cx, cy, `+${gained}`, '#d6ff2e');
    }
    bumpCombo();
  }
  updateHUD();
  resetComboTimer();
}

function comboMultiplier() {
  if (State.combo < 3) return 1;
  if (State.combo < 6) return 2;
  if (State.combo < 10) return 3;
  if (State.combo < 15) return 4;
  return 5;
}

// ---------- Raquetada transiente ----------
function spawnSlash(clientX, clientY) {
  const stageRect = slashLayer.getBoundingClientRect();
  const x = clientX - stageRect.left;
  const y = clientY - stageRect.top;
  const el = document.createElement('div');
  el.className = 'slash';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.innerHTML = RACKET_SVG;
  slashLayer.appendChild(el);
  setTimeout(() => el.remove(), 200);
}

// ---------- Combo timer ----------
let comboTimer = null;
let comboStartTime = 0;
// Há alguma bola OUT ativa no ecrã a ser (corretamente) ignorada?
function isOutBeingIgnored() {
  return holes.some(h => h.active && h.type === 'bomb');
}
function comboExpireTick() {
  if (State.phase !== 'playing') return;
  // Se houver uma OUT ativa a ser ignorada, NÃO quebrar o rally —
  // o jogador está a fazer a jogada certa. Re-verificar daqui a 300ms.
  if (isOutBeingIgnored()) {
    comboStartTime = Date.now();
    comboTimer = setTimeout(comboExpireTick, 300);
    return;
  }
  State.combo = 0;
  updateHUD();
}
function resetComboTimer() {
  clearTimeout(comboTimer);
  comboStartTime = Date.now();
  comboTimer = setTimeout(comboExpireTick, CONFIG.comboTimeout);
}

// ---------- Partículas ----------
const particles = [];
const MAX_PARTICLES = 140;
function resizeFx() {
  const r = board.getBoundingClientRect();
  fxCtx.setTransform(1, 0, 0, 1, 0, 0);
  fxCanvas.width = Math.max(1, r.width) * devicePixelRatio;
  fxCanvas.height = Math.max(1, r.height) * devicePixelRatio;
  fxCtx.scale(devicePixelRatio, devicePixelRatio);
}
function sparkAt(clientX, clientY, color, count, size, coreColor) {
  if (reducedMotion()) return;
  const boardRect = board.getBoundingClientRect();
  const x = clientX - boardRect.left;
  const y = clientY - boardRect.top;
  for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
    const a = fxRandom() * Math.PI * 2;
    const sp = 60 + fxRandom() * 160;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
      life: 0.5 + fxRandom() * 0.4, max: 0.9,
      color, size: size * (0.6 + fxRandom() * 0.7), core: coreColor,
    });
  }
}
const floats = [];
function floatText(clientX, clientY, text, color) {
  const boardRect = board.getBoundingClientRect();
  floats.push({ x: clientX - boardRect.left, y: clientY - boardRect.top, text, color, life: 0.9, max: 0.9 });
}

let lastFrame = performance.now();
function fxLoop(now) {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  const w = fxCanvas.width / devicePixelRatio;
  const h = fxCanvas.height / devicePixelRatio;
  fxCtx.clearRect(0, 0, w, h);

  fxCtx.globalCompositeOperation = 'lighter';
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy += 320 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const a = Math.max(0, p.life / p.max);
    fxCtx.globalAlpha = a * 0.4;
    fxCtx.fillStyle = p.color;
    fxCtx.beginPath();
    fxCtx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
    fxCtx.fill();
    fxCtx.globalAlpha = a;
    fxCtx.fillStyle = p.core || p.color;
    fxCtx.beginPath();
    fxCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    fxCtx.fill();
  }
  fxCtx.globalCompositeOperation = 'source-over';
  fxCtx.globalAlpha = 1;

  fxCtx.textAlign = 'center';
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    if (!reducedMotion()) f.y -= 60 * dt;
    f.life -= dt;
    if (f.life <= 0) { floats.splice(i, 1); continue; }
    const a = f.life / f.max;
    fxCtx.globalAlpha = a;
    fxCtx.font = '900 22px "Unbounded", sans-serif';
    fxCtx.lineWidth = 4;
    fxCtx.strokeStyle = 'rgba(0,0,0,0.7)';
    fxCtx.strokeText(f.text, f.x, f.y);
    fxCtx.fillStyle = f.color;
    fxCtx.fillText(f.text, f.x, f.y);
  }
  fxCtx.globalAlpha = 1;
  requestAnimationFrame(fxLoop);
}

// ---------- Efeitos de ecrã ----------
function shakeScreen(intensity) {
  if (reducedMotion()) return;
  const app = document.body;
  app.classList.remove('shake', 'shake-hard');
  void app.offsetWidth;
  app.classList.add(intensity === 'hard' ? 'shake-hard' : 'shake');
  setTimeout(() => app.classList.remove('shake', 'shake-hard'), 450);
}
function flashOut() {
  document.body.classList.remove('flash-red');
  void document.body.offsetWidth;
  document.body.classList.add('flash-red');
  setTimeout(() => document.body.classList.remove('flash-red'), 360);
}
function bumpCombo() {
  comboMult.classList.remove('bump');
  void comboMult.offsetWidth;
  comboMult.classList.add('bump');
  setTimeout(() => comboMult.classList.remove('bump'), 200);
}

// ---------- Fever overlay ----------
function updateFever() {
  let intensity = 0;
  if (State.combo >= 3) intensity = 0.15;
  if (State.combo >= 6) intensity = 0.35;
  if (State.combo >= 10) intensity = 0.6;
  feverOverlay.style.opacity = intensity;
  const hue = State.combo >= 10 ? 'rgba(214,255,46,' : (State.combo >= 6 ? 'rgba(255,210,63,' : 'rgba(46,196,238,');
  feverOverlay.style.background = `radial-gradient(ellipse at 50% 50%, ${hue}${intensity*0.5}) 0%, transparent 70%)`;
}

// ---------- HUD ----------
function updateHUD() {
  scoreVal.textContent = State.score;
  timerVal.textContent = Math.max(0, Math.ceil(State.timeLeft));
  const mult = comboMultiplier();
  comboMult.textContent = 'x' + mult;
  comboWrap.classList.toggle('hot', State.combo >= 6);
  comboText.textContent = State.combo >= 10 ? 'MATCH POINT!' : (State.combo >= 6 ? 'RALLY!' : 'RALLY');
  const elapsed = comboStartTime ? Date.now() - comboStartTime : CONFIG.comboTimeout;
  const pct = State.combo > 0 ? Math.max(0, Math.min(100, (1 - elapsed / CONFIG.comboTimeout) * 100)) : 0;
  comboFill.style.width = (State.combo > 0 ? pct : 0) + '%';
  updateFever();
}

// ---------- Timer ----------
let timerInterval = null;
let roundStartedAt = 0;
let roundDeadline = 0;
function syncRoundClock() {
  if (State.phase !== 'playing') return false;
  State.timeLeft = Math.max(0, (roundDeadline - performance.now()) / 1000);
  if (State.timeLeft === 0) { endRound(); return false; }
  return true;
}
function startTimer() {
  timerInterval = setInterval(() => {
    syncRoundClock();
    if (State.timeLeft <= 5 && State.timeLeft > 0) {
      Sfx.tick();
      timerBox.classList.add('warn');
    }
    updateHUD();
  }, 100);
}
function addTime(secs) {
  roundDeadline += secs * 1000;
  State.timeLeft += secs;
  timerBox.classList.remove('warn');
  timerBox.style.transform = 'scale(1.15)';
  setTimeout(() => timerBox.style.transform = '', 200);
}

// ---------- Round ----------
function startRound(options = {}) {
  if (State.phase === 'playing') return false;
  if (options.seed !== undefined) {
    if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xFFFFFFFF) {
      throw new Error('Seed inválida.');
    }
    State.seed = options.seed;
  }
  State.mode = options.mode === 'daily' ? 'daily' : 'free';
  State.challengeActive = options.challenge === true && State.mode === 'free' && State.challengeScore !== null;
  Music.stop();
  Feedback.reset();
  gameRandom = createPrng(State.seed);
  // Os efeitos visuais nao consomem a sequencia que determina as bolas.
  fxRandom = createPrng(State.seed ^ 0x9E3779B9);
  lastSpawnIndex = -1;
  Sfx.init(); Sfx.resume();
  State.phase = 'playing';
  State.score = 0;
  State.combo = 0;
  State.maxCombo = 0;
  State.hits = 0;
  State.goldHits = 0;
  State.bombHits = 0;
  State.timeLeft = CONFIG.roundTime;
  roundStartedAt = performance.now();
  roundDeadline = roundStartedAt + CONFIG.roundTime * 1000;
  timerBox.classList.remove('warn');
  $('shareBox').classList.add('hidden');
  holes.forEach(h => {
    retire(h, false);
    h.cooldownUntil = 0;
  });
  particles.length = 0; floats.length = 0;
  startScreen.classList.add('hidden');
  $('courtSelectScreen').classList.add('hidden');
  endScreen.classList.add('hidden');
  updateHUD();
  comboStartTime = Date.now();
  startTimer();
  scheduleNextSpawn();
  return true;
}

function endRound() {
  if (State.phase !== 'playing') return;
  Feedback.reset();
  State.phase = 'end';
  Music.sync();
  clearInterval(timerInterval);
  clearTimeout(spawnTimer);
  clearTimeout(comboTimer);
  holes.forEach(h => retire(h, false));
  timerBox.classList.remove('warn');
  feverOverlay.style.opacity = 0;
  State.best = Math.max(State.best, State.score, readBestScore());
  saveBestScore(State.best);
  Sfx.end();

  finalScore.textContent = State.score;
  maxComboStat.textContent = State.maxCombo;
  hitsStat.textContent = State.hits;
  bestStat.textContent = State.best;
  bestVal.textContent = State.best;
  const rank = [...RANKS].reverse().find(r => State.score >= r.min) || RANKS[0];
  rankLabel.textContent = 'Nível: ' + rank.label;

  const beat = State.challengeActive && State.score > State.challengeScore;
  if (State.challengeActive) {
    if (beat) {
      $('endKicker').textContent = 'BATISTE O DESAFIO!';
      shareHint.textContent = 'Ganhaste ao teu amigo. Partilha e desafia outro.';
    } else {
      $('endKicker').textContent = 'FICASTE ABAIXO DO DESAFIO';
      shareHint.textContent = `O teu amigo fez ${State.challengeScore}. Tenta outra vez!`;
    }
  } else {
    $('endKicker').textContent = 'FIM DO JOGO';
    shareHint.textContent = '';
  }
  endScreen.classList.remove('hidden');
  window.dispatchEvent(new CustomEvent('slice-pop:round-ended', { detail: Object.freeze({
    mode: State.mode,
    seed: State.seed,
    score: State.score,
    hits: State.hits,
    max_rally: State.maxCombo,
    gold_hits: State.goldHits,
    bomb_hits: State.bombHits,
    duration_ms: Math.max(0, Math.round(Math.min(performance.now(), roundDeadline) - roundStartedAt)),
  }) }));
}

function rankForScore(s) {
  const r = [...RANKS].reverse().find(x => s >= x.min) || RANKS[0];
  return r.label;
}

// ---------- Partilha / desafio ----------
function buildShareUrl() {
  const url = new URL(location.href);
  url.searchParams.set('challenge', String(State.score));
  url.searchParams.set('seed', String(State.seed));
  return url.toString();
}
async function shareChallenge() {
  const url = buildShareUrl();
  const text = `Acabei com ${State.score} pontos no Tennis Slice Pop! Conseguem bater-me? (${rankForScore(State.score)})`;
  const input = $('shareUrlInput');
  const box = $('shareBox');
  input.value = url;
  box.classList.remove('hidden');
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Tennis Slice Pop', text, url });
      shareHint.textContent = 'Desafio enviado!';
      return;
    } catch (e) { /* cai abaixo */ }
  }
  shareHint.textContent = 'Copia o link e envia a um amigo.';
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      shareHint.textContent = 'Link copiado! Cola num chat.';
    }
  } catch (e) { /* o utilizador usa o botão COPIAR LINK */ }
}
async function copyShareManual() {
  const input = $('shareUrlInput');
  // gera o link a partir do score atual (não depende do input estar preenchido)
  const url = buildShareUrl();
  input.value = url;
  const btn = $('copyBtn');
  const originalText = btn.textContent;

  // 1) API moderna de clipboard (preferida; funciona fora do iframe de preview)
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      shareHint.textContent = 'Link copiado! Cola num chat.';
      flashCopyOk(btn, originalText);
      return;
    } catch (e) { /* cai para fallback */ }
  }

  // 2) Fallback: selecionar o input e copiar via execCommand
  input.classList.remove('hidden');
  input.removeAttribute('readonly');
  input.focus();
  input.select();
  input.setSelectionRange(0, url.length);
  input.setAttribute('readonly', '');
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  if (ok) {
    shareHint.textContent = 'Link copiado! Cola num chat.';
    flashCopyOk(btn, originalText);
  } else {
    shareHint.textContent = 'Não consegui copiar automaticamente — seleciona o link acima e copia manualmente.';
  }
}

function flashCopyOk(btn, originalText) {
  btn.textContent = '✓ COPIADO';
  btn.style.filter = 'brightness(1.15)';
  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.filter = '';
  }, 1600);
}

function readChallenge() {
  const params = new URLSearchParams(location.search);
  const seed = params.get('seed');
  if (seed !== null && /^\d+$/.test(seed)) {
    const n = Number(seed);
    if (Number.isInteger(n) && n >= 0 && n <= 0xFFFFFFFF) {
      State.seed = n;
    }
  }
  const c = params.get('challenge');
  if (c !== null) {
    const n = Number(c);
    if (/^\d+$/.test(c) && Number.isSafeInteger(n) && n >= 0) {
      State.challengeScore = n;
      State.challengeSeed = State.seed;
      challengeBanner.classList.remove('hidden');
      challengeText.textContent = 'Um amigo desafiou-te.';
      document.getElementById('challengeScore').textContent = String(n);
    }
  }
}

// ---------- Som toggle ----------
function toggleSound() {
  State.soundOn = !State.soundOn;
  if (Sfx.master) Sfx.master.gain.setTargetAtTime(State.soundOn ? 1 : 0, Sfx.ctx.currentTime, 0.005);
  saveFeedbackPreference('slice-pop-sound', State.soundOn);
  if (State.soundOn) { Sfx.init(); Sfx.resume(); Sfx.hit(); }
  window.dispatchEvent(new CustomEvent('slice-pop:audio-changed', { detail: { enabled: State.soundOn } }));
}
function toggleHaptics() {
  if (!Feedback.vibrationSupported) return;
  State.hapticsOn = !State.hapticsOn;
  if (State.hapticsOn) {
    try {
      if (!navigator.vibrate(8)) {
        State.hapticsOn = false;
        Feedback.vibrationSupported = false;
      }
    } catch (e) {
      State.hapticsOn = false;
      Feedback.vibrationSupported = false;
    }
  } else {
    try { navigator.vibrate(0); } catch (e) { /* Optional feedback. */ }
  }
  saveFeedbackPreference('slice-pop-haptics', State.hapticsOn);
  window.dispatchEvent(new CustomEvent('slice-pop:haptics-changed', { detail: { enabled: State.hapticsOn && Feedback.vibrationSupported } }));
}

// ---------- Eventos ----------
function bindEvents() {
  $('playBtn').addEventListener('click', () => {
    if (window.TennisSlicePopLobby) window.TennisSlicePopLobby.play();
    else startRound({ seed: createSeed() });
  });
  $('challengeBanner').addEventListener('click', () => {
    if (window.TennisSlicePopLobby) window.TennisSlicePopLobby.challenge();
    else if (State.challengeScore !== null) startRound({ seed: State.challengeSeed, challenge: true });
  });
  $('replayBtn').addEventListener('click', () => {
    if (window.TennisSlicePopLobby) window.TennisSlicePopLobby.replay();
    else startRound({ seed: State.seed, challenge: State.challengeActive });
  });
  $('shareBtn').addEventListener('click', () => shareChallenge());
  $('copyBtn').addEventListener('click', () => copyShareManual());
  function returnFromRules() {
    $('rulesScreen').classList.add('hidden');
    $('rulesBtn').focus({ preventScroll: true });
  }
  $('rulesBtn').addEventListener('click', () => {
    $('rulesScreen').classList.remove('hidden');
    $('rulesCloseBtn').focus({ preventScroll: true });
  });
  $('rulesCloseBtn').addEventListener('click', returnFromRules);
  $('rulesScreen').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); returnFromRules(); }
    if (event.key === 'Tab') { event.preventDefault(); $('rulesCloseBtn').focus(); }
  });

  document.addEventListener('touchmove', (e) => {
    if (State.phase === 'playing' && e.target.closest('.stage')) e.preventDefault();
  }, { passive: false });
  window.addEventListener('resize', () => { resizeFx(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Feedback.reset();
    if (Sfx.master) Sfx.master.gain.setTargetAtTime(State.soundOn && !document.hidden ? 1 : 0, Sfx.ctx.currentTime, .02);
    Music.sync();
  });
  const unlockAudio = event => {
    if (!event.isTrusted) return;
    if (event.type === 'keydown' && !['Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    prepareAudio();
    Music.sync();
  };
  document.addEventListener('pointerdown', unlockAudio, { capture: true });
  document.addEventListener('keydown', unlockAudio, { capture: true });
  document.addEventListener('click', unlockAudio, { capture: true });
  window.addEventListener('slice-pop:intro-finished', () => Music.sync());
}

// ---------- Init ----------
function init() {
  buildBoard();
  renderRuleBalls();
  bindEvents();
  resizeFx();
  requestAnimationFrame(fxLoop);
  readChallenge();
  bestVal.textContent = State.best || '—';
  updateHUD();
}

window.TennisSlicePopGame = Object.freeze({
  start: startRound,
  toggleSound,
  toggleHaptics,
  toggleMusic,
  get musicOn() { return State.musicOn; },
  get soundOn() { return State.soundOn; },
  get hapticsOn() { return State.hapticsOn && Feedback.vibrationSupported; },
  get hapticsSupported() { return Feedback.vibrationSupported; },
  prepareAudio,
  syncMusic() { Music.sync(); },
  enterCourt() {
    prepareAudio(); Music.sync();
  },
  createSeed,
  get challenge() {
    return State.challengeScore === null ? null : Object.freeze({ seed: State.challengeSeed, score: State.challengeScore });
  },
  get phase() { return State.phase; },
  get seed() { return State.seed; },
});
init();
