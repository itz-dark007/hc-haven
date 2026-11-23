/* =========================================================================
   KINETIC DEFLECT — arena survival
   You have no weapon. Reflect enemy fire with a precisely-timed shield pulse.
   ========================================================================= */
(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const BASE_W = 960, BASE_H = 600, ARENA = 24;
  let W = BASE_W, H = BASE_H;

  /* Haven palette (hack club haven) */
  const C = {
    ink: '#4a2c1a',
    inkSoft: '#8a6a52',
    paper: '#fbf0d9',
    paperLight: '#fff7e6',
    orange: '#fa681b',
    orangeDeep: '#ed5615',
    yellow: '#ffd059',
    butter: '#ffe382',
    olive: '#b8c220',
    oliveDeep: '#97a01a',
    mint: '#2cbf90',
    mintDeep: '#17a97d',
    brown: '#b8774a',
    brownLight: '#dda47d',
    dark: '#3a2314',
  };

  /* ------------------------------------------------------------- helpers */
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  const fmtTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  };

  /* -------------------------------------------------------------- canvas */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const playerSprite = new Image();
  const chickenUfoSprite = new Image();
  const dogRocketSprite = new Image();
  const hedgehogRocketSprite = new Image();
  const characterSprites = {
    orph: { name: 'Orpheus', src: 'Assets/ORPH-RKT.webp', image: playerSprite },
    chicken: { name: 'Cluckie', src: 'Assets/Chicken-UFO-Color-SVG.png', image: chickenUfoSprite },
    dog: { name: 'Nova', src: 'Assets/Dog-Rocket-Coral-SVG.webp', image: dogRocketSprite },
    hedgehog: { name: 'Coco', src: 'Assets/Hedgehog-Rocket-SVG.png', image: hedgehogRocketSprite },
  };
  for (const key in characterSprites) characterSprites[key].image.src = characterSprites[key].src;
  let selectedCharacterKey = 'orph';

  let worldReady = false;

  /* The arena adapts to the screen's aspect ratio instead of stretching:
     the shorter side stays at 600 world units, so entity sizes, speeds and
     spawn distances feel the same on phones, tablets and desktops. */
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    const aspect = rect.height > 4 ? clamp(rect.width / rect.height, 0.4, 3) : BASE_W / BASE_H;
    if (aspect >= 1) {
      H = BASE_H;
      W = Math.round(H * aspect);
    } else {
      W = BASE_W;
      H = Math.round(W / aspect);
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    reflowWorld();
  }

  function reflowWorld() {
    if (!worldReady) return;
    player.x = clamp(player.x, ARENA + player.r, W - ARENA - player.r);
    player.y = clamp(player.y, ARENA + player.r, H - ARENA - player.r);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      e.x = clamp(e.x, ARENA + e.r, W - ARENA - e.r);
      e.y = clamp(e.y, ARENA + e.r, H - ARENA - e.r);
    }
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      b.x = clamp(b.x, ARENA, W - ARENA);
      b.y = clamp(b.y, ARENA, H - ARENA);
    }
    for (let i = 0; i < wells.length; i++) {
      const w = wells[i];
      w.x = clamp(w.x, ARENA + w.r * 0.72, W - ARENA - w.r * 0.72);
      w.y = clamp(w.y, ARENA + w.r * 0.72, H - ARENA - w.r * 0.72);
    }
  }

  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 150));
  if (window.ResizeObserver) new ResizeObserver(fitCanvas).observe(document.getElementById('stage'));

  /* --------------------------------------------------------------- audio */
  const Sound = (() => {
    let ac = null, master = null, muted = false, lastShoot = 0;

    function init() {
      if (ac) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.3;
      master.connect(ac.destination);
    }

    function tone(freq, dur, type, vol, slideTo, delay) {
      if (!ac || muted) return;
      type = type || 'sine'; vol = vol == null ? 0.2 : vol;
      const t0 = ac.currentTime + (delay || 0);
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(24, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    }

    function noise(dur, vol, freq, delay) {
      if (!ac || muted) return;
      const t0 = ac.currentTime + (delay || 0);
      const len = Math.max(1, Math.floor(ac.sampleRate * dur));
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = 0.9;
      const g = ac.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(master);
      src.start(t0);
    }

    return {
      init,
      get muted() { return muted; },
      toggle() { muted = !muted; return muted; },
      shoot() {
        const now = performance.now();
        if (now - lastShoot < 55) return;
        lastShoot = now;
        tone(330, 0.09, 'triangle', 0.05, 190);
      },
      deflect() { tone(900, 0.1, 'square', 0.09, 1500); noise(0.05, 0.07, 2400); },
      kill() { noise(0.17, 0.15, 700); tone(180, 0.14, 'sawtooth', 0.07, 60); },
      hurt() { tone(150, 0.22, 'sawtooth', 0.16, 55); noise(0.12, 0.12, 320); },
      level() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.1, null, i * 0.07)); },
      over() { [440, 330, 262, 196].forEach((f, i) => tone(f, 0.32, 'sine', 0.12, null, i * 0.13)); },
      start() { [392, 523, 659].forEach((f, i) => tone(f, 0.14, 'triangle', 0.09, null, i * 0.06)); },
    };
  })();

  /* --------------------------------------------------------------- state */
  const state = {
    mode: 'menu',
    time: 0,
    score: 0,
    kills: 0,
    deflects: 0,
    level: 1,
    xp: 0,
    xpNext: 14,
    pending: 0,
    combo: 1,
    comboT: 0,
    spawnT: 1.2,
    shake: 0,
    flash: 0,
    best: Number(localStorage.getItem('bounceback.best') || 0),
  };

  const player = {
    x: W / 2, y: H / 2, vx: 0, vy: 0, r: 13,
    angle: 0,
    hp: 100, maxHp: 100,
    baseSpeed: 252,
    iT: 0,
    shieldActive: false,
    shieldT: 0,
    shieldCd: 0,
    up: { multi: 0, amp: 0, burst: 0, homing: 0, recovery: 0, fleet: 0, hull: 0, chain: 0 },
  };

  /* player-derived stats */
  const P = {
    shieldRadius: () => 44 + 13 * player.up.burst,
    shieldDur: () => 0.14 + 0.035 * player.up.burst,
    shieldCd: () => Math.max(0.2, 0.46 - 0.06 * player.up.recovery),
    moveSpeed: () => player.baseSpeed * (1 + 0.12 * player.up.fleet),
    deflectDmg: () => 40 + 12 * player.up.amp,
    pierce: () => 1 + player.up.amp,
    homing: () => player.up.homing * 3.2,
  };

  /* ------------------------------------------------------------ entities */
  let enemies = [];
  let bullets = [];
  let particles = [];
  let rings = [];
  let texts = [];
  let wells = [];
  let nextId = 1;

  worldReady = true;
  fitCanvas();

  /* ----------------------------------------------------------- DOM cache */
  const $ = (id) => document.getElementById(id);
  const els = {
    level: $('hud-level'), xp: $('hud-xp'), xpText: $('hud-xp-text'),
    hp: $('hud-hp'), hpText: $('hud-hp-text'), hpBar: document.querySelector('.bar.hp'),
    time: $('hud-time'), score: $('hud-score'), kills: $('hud-kills'),
    cards: $('cards'), best: $('menu-best'),
    overTime: $('over-time'), overScore: $('over-score'), overKills: $('over-kills'),
    overDeflects: $('over-deflects'), overLevel: $('over-level'), overBest: $('over-best'),
    mute: $('mute'), characterCards: $('character-cards'), characterViewport: $('character-viewport'),
  };

  /* --------------------------------------------------------- enemy types */
  const TYPES = {
    grunt: {
      key: 'grunt', hp: 40, speed: 76, r: 14, preferred: 235,
      bulletSpeed: 220, dmg: 9, xp: 8, score: 10, fire: [1.5, 2.2], telegraph: 0.32,
      burst: 1, shape: 'ufo', sprite: 'chicken', color: '#e58a22', weight: 10, unlock: 0,
    },
    weaver: {
      key: 'weaver', hp: 32, speed: 126, r: 12, preferred: 195,
      bulletSpeed: 255, dmg: 7, xp: 9, score: 14, fire: [1.25, 1.8], telegraph: 0.24,
      burst: 1, shape: 'ufo', sprite: 'dog', color: '#ee665e', weight: 7, unlock: 0,
    },
    burster: {
      key: 'burster', hp: 56, speed: 60, r: 17, preferred: 300,
      bulletSpeed: 225, dmg: 8, xp: 12, score: 22, fire: [2.0, 2.7], telegraph: 0.4,
      burst: 3, shape: 'ufo', sprite: 'hedgehog', color: '#d6604f', weight: 6, unlock: 34,
    },
    sniper: {
      key: 'sniper', hp: 40, speed: 54, r: 13, preferred: 355,
      bulletSpeed: 430, dmg: 14, xp: 13, score: 26, fire: [2.1, 2.9], telegraph: 0.8,
      burst: 1, shape: 'ufo', sprite: 'orph', color: '#d9dce6', weight: 4, unlock: 58,
    },
    brute: {
      key: 'brute', hp: 175, speed: 44, r: 24, preferred: 175,
      bulletSpeed: 175, dmg: 16, xp: 24, score: 55, fire: [2.4, 3.2], telegraph: 0.5,
      burst: 1, shape: 'ufo', sprite: 'hedgehog', color: '#d6604f', weight: 2, unlock: 88,
    },
  };

  /* ------------------------------------------------------------ upgrades */
  const REPAIR = {
    id: 'repair', name: 'Patch Kit', icon: '\u2726', max: 99,
    desc: () => 'Restore <b>35</b> hull and keep moving.',
  };

  const UPGRADES = [
    {
      id: 'multi', name: 'Multi-Bounce', icon: '\u29C9', max: 2,
      desc: (l) => 'Each deflect splits into <b>' + (l + 1) + '</b> projectiles.',
    },
    {
      id: 'amp', name: 'Kinetic Amplifier', icon: '\u26A1', max: 3,
      desc: (l) => 'Bounced shots fly <b>+' + (100 * l) + '%</b> faster and pierce <b>' + (l + 1) + '</b> enemies.',
    },
    {
      id: 'burst', name: 'Shield Burst', icon: '\u25C9', max: 3,
      desc: (l) => 'Shield radius <b>+' + (13 * l) + '</b>, active <b>+' + (35 * l) + ' ms</b>.',
    },
    {
      id: 'homing', name: 'Homing Deflection', icon: '\u27A4', max: 3,
      desc: (l) => 'Bounced shots curve toward the nearest enemy' + (l > 1 ? ' harder.' : '.'),
    },
    {
      id: 'recovery', name: 'Quick Recovery', icon: '\u21BB', max: 3,
      desc: (l) => 'Shield cooldown <b>\u2212' + (60 * l) + ' ms</b>.',
    },
    {
      id: 'fleet', name: 'Fleet Foot', icon: '\u2192', max: 3,
      desc: (l) => 'Movement speed <b>+' + (12 * l) + '%</b>.',
    },
    {
      id: 'hull', name: 'Reinforced Hull', icon: '\u2665', max: 3,
      desc: (l) => 'Max hull <b>+' + (20 * l) + '</b> and repair <b>' + (20 * l) + '</b>.',
    },
    {
      id: 'chain', name: 'Chain Pulse', icon: '\u2738', max: 3,
      desc: (l) => 'Kills by bounced shots explode for <b>' + Math.round(22 * (1 + 0.4 * (l - 1))) + '</b> damage.',
    },
  ];

  /* ------------------------------------------------------------ fx utils */
  function addParticles(x, y, n, o) {
    o = o || {};
    const color = o.color || '#fff';
    const speed = o.speed == null ? 170 : o.speed;
    const life = o.life == null ? 0.45 : o.life;
    const size = o.size == null ? 2.4 : o.size;
    const drag = o.drag == null ? 3 : o.drag;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = speed * rand(0.35, 1);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * rand(0.7, 1.2), max: life, size: size * rand(0.6, 1.35),
        color, drag, gravity: o.gravity || 0,
      });
    }
  }

  function addRing(x, y, r0, r1, color, life, width) {
    rings.push({ x, y, r0, r1, life, max: life, color, width: width || 2 });
  }

  function addText(x, y, text, color, size) {
    texts.push({ x, y, text, color, size: size || 14, life: 0.9, max: 0.9, vy: -48 });
  }

  /* -------------------------------------------------------------- bullets */
  function addBullet(o) {
    const b = Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, r: 6, friendly: false, dmg: 9, life: 5,
      color: C.orange, pierce: 1, hit: null, homing: 0, target: null,
      wallBounce: 0, dead: false, cap: 0,
    }, o);
    if (!b.cap) b.cap = Math.hypot(b.vx, b.vy) * 1.9;
    bullets.push(b);
  }

  function nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const d = dist2(e.x, e.y, x, y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function deflectBullet(b) {
    if (b.dead) return;
    b.dead = true;
    const inSpd = Math.hypot(b.vx, b.vy);
    const spd = Math.max(inSpd * 1.3, 430) * (1 + player.up.amp);
    const base = Math.atan2(-b.vy, -b.vx);
    const n = 1 + player.up.multi;
    const spread = 0.16 * (n - 1);
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? -spread / 2 + spread * (i / (n - 1)) : 0) + rand(-0.02, 0.02);
      addBullet({
        x: player.x + Math.cos(a) * (player.r + 6),
        y: player.y + Math.sin(a) * (player.r + 6),
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        friendly: true, dmg: P.deflectDmg(), r: 7, color: C.mint,
        life: 3.4, pierce: P.pierce(), hit: new Set(),
        homing: P.homing(), wallBounce: 2,
      });
    }
    state.deflects++;
    state.score += 2;
    state.shake = Math.max(state.shake, 2.5);
    addParticles(player.x + Math.cos(base) * 16, player.y + Math.sin(base) * 16, 9, {
      color: C.mint, speed: 250, life: 0.4, size: 2.2,
    });
    const R = P.shieldRadius();
    addRing(player.x, player.y, R * 0.9, R * 1.55, 'rgba(44,191,144,0.95)', 0.26, 3);
    Sound.deflect();
  }

  /* -------------------------------------------------------- black holes */
  function makeWells() {
    wells = [];
    const specs = [
      { r: 152, power: 900 },
      { r: 132, power: 760 },
    ];
    const flip = Math.random() < 0.5;
    const flipY = Math.random() < 0.5;

    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const left = (i === 0) !== flip;
      const top = (i === 0) !== flipY;
      const xLo = left ? ARENA + 150 : W / 2 + 70;
      const xHi = left ? W / 2 - 70 : W - ARENA - 150;
      const yLo = top ? ARENA + 120 : H / 2 + 55;
      const yHi = top ? H / 2 - 55 : H - ARENA - 120;

      let best = { x: (xLo + xHi) / 2, y: (yLo + yHi) / 2 }, bestScore = -Infinity;
      for (let tries = 0; tries < 80; tries++) {
        const x = rand(xLo, xHi);
        const y = rand(yLo, yHi);
        const dCenter = Math.hypot(x - W / 2, y - H / 2);
        let dMin = Infinity;
        for (let k = 0; k < wells.length; k++) {
          dMin = Math.min(dMin, Math.hypot(x - wells[k].x, y - wells[k].y));
        }
        const score = Math.min(dCenter, dMin * 1.2);
        if (score > bestScore) { bestScore = score; best = { x, y }; }
        if (dCenter > 215 && dMin > 320) break;
      }

      wells.push({
        x: best.x, y: best.y, r: s.r, power: s.power, core: 15,
        spin: rand(0, TAU), pulse: 0, sparks: [],
        vx: Math.cos(rand(0, TAU)) * rand(10, 22),
        vy: Math.sin(rand(0, TAU)) * rand(10, 22),
        shuffleT: rand(2.5, 5.5),
      });
    }

    for (let i = 0; i < wells.length; i++) {
      const w = wells[i];
      for (let k = 0; k < 16; k++) {
        w.sparks.push({
          a: rand(0, TAU), d: rand(0.35, 1) * w.r,
          s: rand(0.5, 1.7), size: rand(0.8, 2),
        });
      }
    }
  }

  function updateWells(dt) {
    let playerWellDamage = 0;
    for (let i = 0; i < wells.length; i++) {
      const w = wells[i];
      if (w.pulse > 0) w.pulse = Math.max(0, w.pulse - dt);
      w.shuffleT -= dt;
      if (w.shuffleT <= 0) {
        const a = Math.atan2(w.vy, w.vx) + rand(-0.9, 0.9);
        const speed = rand(10, 22);
        w.vx = Math.cos(a) * speed;
        w.vy = Math.sin(a) * speed;
        w.shuffleT = rand(2.5, 5.5);
      }
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      const minX = ARENA + w.r * 0.72;
      const maxX = W - ARENA - w.r * 0.72;
      const minY = ARENA + w.r * 0.72;
      const maxY = H - ARENA - w.r * 0.72;
      if (w.x < minX || w.x > maxX) {
        w.x = clamp(w.x, minX, maxX);
        w.vx *= -1;
      }
      if (w.y < minY || w.y > maxY) {
        w.y = clamp(w.y, minY, maxY);
        w.vy *= -1;
      }

      const playerDistance = Math.hypot(player.x - w.x, player.y - w.y);
      if (playerDistance <= w.r) {
        const damageRate = playerDistance <= w.core
          ? 2
          : lerp(0.5, 2, clamp(1 - playerDistance / w.r, 0, 1));
        playerWellDamage = Math.max(playerWellDamage, damageRate);
      }
      for (let k = 0; k < w.sparks.length; k++) {
        const s = w.sparks[k];
        s.a += s.s * dt * 0.55;
        s.d -= dt * 7;
        if (s.d < 22) { s.d = w.r * rand(0.7, 1.05); s.a = rand(0, TAU); }
      }
    }

    if (playerWellDamage > 0 && state.mode === 'playing') {
      player.hp = Math.max(0, player.hp - playerWellDamage * dt);
      state.flash = Math.max(state.flash, 0.025);
      if (player.hp <= 0) gameOver();
    }
  }

  /* returns true when the bullet was swallowed */
  function applyGravity(b, dt) {
    for (let i = 0; i < wells.length; i++) {
      const w = wells[i];
      const dx = w.x - b.x, dy = w.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < w.core + b.r) return true;
      if (d > w.r) continue;
      const fall = Math.pow(1 - d / w.r, 1.6);
      const a = w.power * fall;
      b.vx += (dx / d) * a * dt;
      b.vy += (dy / d) * a * dt;
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > b.cap) {
      b.vx *= b.cap / sp;
      b.vy *= b.cap / sp;
    }
    return false;
  }

  function swallowBullet(b) {
    b.dead = true;
    addParticles(b.x, b.y, 8, { color: b.friendly ? C.mint : C.brownLight, speed: 120, life: 0.35, size: 2 });
    for (let i = 0; i < wells.length; i++) {
      const w = wells[i];
      if (dist2(w.x, w.y, b.x, b.y) < w.core * w.core * 4) { w.pulse = 0.3; break; }
    }
    state.shake = Math.max(state.shake, 2);
  }

  /* ------------------------------------------------------------ spawning */
  function spawnEnemy() {
    const t = state.time;
    const opts = [];
    let total = 0;
    for (const k in TYPES) {
      const ty = TYPES[k];
      if (t >= ty.unlock) { opts.push(ty); total += ty.weight; }
    }
    const available = opts.filter((ty) => ty.sprite !== selectedCharacterKey);
    /* Never spawn the player's selected character, even if it is the only
       type unlocked at a given moment. */
    if (!available.length) return false;
    opts.length = 0;
    for (let i = 0; i < available.length; i++) opts.push(available[i]);
    total = opts.reduce((sum, ty) => sum + ty.weight, 0);
    /* Prefer the least represented sprite when several enemies are alive. */
    if (opts.length > 1) {
      let minimum = Infinity;
      for (let i = 0; i < opts.length; i++) {
        const count = enemies.reduce((n, e) => n + (!e.dead && e.ty.sprite === opts[i].sprite ? 1 : 0), 0);
        minimum = Math.min(minimum, count);
      }
      const varied = opts.filter((ty) => enemies.reduce((n, e) => n + (!e.dead && e.ty.sprite === ty.sprite ? 1 : 0), 0) <= minimum);
      if (varied.length) {
        opts.length = 0;
        for (let i = 0; i < varied.length; i++) opts.push(varied[i]);
        total = opts.reduce((sum, ty) => sum + ty.weight, 0);
      }
    }
    let roll = Math.random() * total;
    let ty = opts[0];
    for (let i = 0; i < opts.length; i++) {
      roll -= opts[i].weight;
      if (roll <= 0) { ty = opts[i]; break; }
    }

    const m = ARENA + 30;
    const side = randInt(0, 3);
    let x, y;
    if (side === 0) { x = rand(m, W - m); y = m; }
    else if (side === 1) { x = W - m; y = rand(m, H - m); }
    else if (side === 2) { x = rand(m, W - m); y = H - m; }
    else { x = m; y = rand(m, H - m); }

    const hpMul = 1 + state.time / 100;
    const e = {
      id: nextId++, ty, x, y, r: ty.r,
      hp: ty.hp * hpMul, maxHp: ty.hp * hpMul,
      speed: ty.speed, dir: Math.random() < 0.5 ? -1 : 1,
      phase: rand(0, TAU), hurt: 0, warmup: 0.55,
      fireT: rand(ty.fire[0], ty.fire[1]) * 0.6,
      charge: 0, chargeMax: ty.telegraph,
      burstLeft: 0, burstT: 0, contactCd: 0, recover: 0, dead: false,
    };
    enemies.push(e);
    addRing(x, y, 6, e.r * 2.6, ty.color, 0.5, 2);
    addParticles(x, y, 8, { color: ty.color, speed: 140, life: 0.45, size: 2 });
  }

  /* ----------------------------------------------------- damage & scoring */
  function hurtPlayer(amount) {
    if (state.mode !== 'playing' || player.iT > 0) return;
    player.hp -= amount;
    player.iT = 0.7;
    state.shake = Math.max(state.shake, 9);
    state.flash = 0.4;
    state.combo = 1;
    state.comboT = 0;
    addParticles(player.x, player.y, 12, { color: C.orangeDeep, speed: 200, life: 0.5, size: 2.6 });
    Sound.hurt();
    if (player.hp <= 0) {
      player.hp = 0;
      gameOver();
    }
  }

  function damageEnemy(e, dmg) {
    if (e.dead) return;
    e.hp -= dmg;
    e.hurt = 0.1;
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e, fromChain) {
    if (e.dead) return;
    e.dead = true;
    state.kills++;

    if (!fromChain) {
      state.combo = state.comboT > 0 ? Math.min(state.combo + 1, 9) : 1;
      state.comboT = 2.4;
    }
    state.score += Math.round(e.ty.score * state.combo);
    addXp(e.ty.xp);

    addParticles(e.x, e.y, 14, { color: e.ty.color, speed: 260, life: 0.6, size: 3 });
    addParticles(e.x, e.y, 7, { color: '#fff', speed: 120, life: 0.32, size: 2 });
    addRing(e.x, e.y, e.r * 0.6, e.r * 3.4, e.ty.color, 0.42, 3);
    addText(e.x, e.y - e.r - 4, '+' + e.ty.xp, C.oliveDeep, 13);
    state.shake = Math.max(state.shake, 4);
    Sound.kill();

    const chain = player.up.chain;
    if (chain > 0) {
      const r = 62 + 10 * chain;
      const dmg = 22 * (1 + 0.4 * (chain - 1));
      addRing(e.x, e.y, 10, r, C.yellow, 0.35, 4);
      for (let i = 0; i < enemies.length; i++) {
        const o = enemies[i];
        if (o === e || o.dead) continue;
        if (dist2(o.x, o.y, e.x, e.y) < (r + o.r) * (r + o.r)) damageEnemy(o, dmg);
      }
    }
  }

  function addXp(n) {
    state.xp += n;
    let leveled = false;
    while (state.xp >= state.xpNext) {
      state.xp -= state.xpNext;
      state.level++;
      state.xpNext = Math.round(8 + 4 * Math.pow(state.level, 1.3));
      state.pending++;
      leveled = true;
    }
    if (leveled) {
      Sound.level();
      if (state.mode === 'playing' && state.pending > 0) openLevelUp();
    }
  }

  /* --------------------------------------------------------- enemy logic */
  function enemyShoot(e) {
    const ty = e.ty;
    const spd = ty.bulletSpeed * Math.min(1.9, 1 + state.time / 240);
    let tx = player.x, tyy = player.y;
    if (ty.key === 'weaver') { tx += player.vx * 0.13; tyy += player.vy * 0.13; }
    let a = Math.atan2(tyy - e.y, tx - e.x) + rand(-0.045, 0.045);
    const r = ty.key === 'brute' ? 9 : 6;
    addBullet({
      x: e.x + Math.cos(a) * (e.r + 4),
      y: e.y + Math.sin(a) * (e.r + 4),
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      dmg: ty.dmg, r, color: ty.color, life: 6,
    });
    addParticles(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, 4, {
      color: ty.color, speed: 130, life: 0.24, size: 2,
    });
    e.recover = 1.2;   /* committed to the shot: stays easy prey while it flies back */
    Sound.shoot();
  }

  function updateEnemies(dt) {
    const speedScale = 1 + Math.min(0.6, state.time / 400);

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      if (e.hurt > 0) e.hurt -= dt;
      if (e.contactCd > 0) e.contactCd -= dt;
      if (e.recover > 0) e.recover -= dt;
      if (e.warmup > 0) e.warmup -= dt;

      const dx = player.x - e.x, dy = player.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;

      /* keep preferred range, strafe sideways */
      let rx = 0, ry = 0;
      const want = e.ty.preferred;
      if (d > want + 40) { rx = nx; ry = ny; }
      else if (d < want - 40) { rx = -nx; ry = -ny; }
      let sw = 0.6;
      if (e.ty.key === 'weaver') sw = 1.2 + Math.sin(state.time * 3 + e.phase);
      let mx = rx + (-ny * e.dir) * sw;
      let my = ry + (nx * e.dir) * sw;
      const ml = Math.hypot(mx, my) || 1;
      const spd = e.speed * speedScale * (e.recover > 0 ? 0.25 : 1);
      e.x += (mx / ml) * spd * dt;
      e.y += (my / ml) * spd * dt;
      e.x = clamp(e.x, ARENA + e.r, W - ARENA - e.r);
      e.y = clamp(e.y, ARENA + e.r, H - ARENA - e.r);

      /* firing state machine: idle -> charge (telegraph) -> shot / burst */
      if (e.warmup <= 0) {
        if (e.burstLeft > 0) {
          e.burstT -= dt;
          if (e.burstT <= 0) {
            enemyShoot(e);
            e.burstLeft--;
            e.burstT = 0.12;
          }
        } else if (e.charge > 0) {
          e.charge -= dt;
          if (e.charge <= 0) {
            e.charge = 0;
            enemyShoot(e);
            if (e.ty.burst > 1) { e.burstLeft = e.ty.burst - 1; e.burstT = 0.12; }
            e.fireT = rand(e.ty.fire[0], e.ty.fire[1]);
          }
        } else {
          e.fireT -= dt;
          if (e.fireT <= 0) {
            if (d < 620) e.charge = e.ty.telegraph;
            else e.fireT = 0.4;
          }
        }
      }

      /* contact damage */
      if (d < e.r + player.r + 3 && e.contactCd <= 0) {
        e.contactCd = 1;
        e.x -= nx * 16;
        e.y -= ny * 16;
        hurtPlayer(5 + e.ty.dmg * 0.45);
      }
    }

    /* separation so they don't stack into one blob */
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r;
        const dd = dx * dx + dy * dy;
        if (dd > 0.01 && dd < min * min) {
          const d = Math.sqrt(dd);
          const push = (min - d) * 0.5;
          const ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        }
      }
    }

    enemies = enemies.filter((e) => !e.dead);
  }

  /* -------------------------------------------------------- bullet logic */
  function updateBullets(dt) {
    const shieldR = P.shieldRadius();

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (b.dead) continue;

      b.life -= dt;
      if (b.life <= 0) { b.dead = true; continue; }

      /* gravity bends every projectile, friendly or not */
      if (applyGravity(b, dt)) { swallowBullet(b); continue; }

      /* homing steer */
      if (b.friendly && b.homing > 0) {
        if (!b.target || b.target.dead) b.target = nearestEnemy(b.x, b.y);
        if (b.target) {
          const spd = Math.hypot(b.vx, b.vy) || 1;
          const cur = Math.atan2(b.vy, b.vx);
          const wantA = Math.atan2(b.target.y - b.y, b.target.x - b.x);
          let diff = ((wantA - cur + Math.PI * 3) % TAU) - Math.PI;
          const turn = clamp(diff, -b.homing * dt, b.homing * dt);
          const na = cur + turn;
          b.vx = Math.cos(na) * spd;
          b.vy = Math.sin(na) * spd;
        }
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      /* walls */
      let hitWall = false;
      if (b.x < ARENA + b.r) { b.x = ARENA + b.r; b.vx = Math.abs(b.vx); hitWall = true; }
      else if (b.x > W - ARENA - b.r) { b.x = W - ARENA - b.r; b.vx = -Math.abs(b.vx); hitWall = true; }
      if (b.y < ARENA + b.r) { b.y = ARENA + b.r; b.vy = Math.abs(b.vy); hitWall = true; }
      else if (b.y > H - ARENA - b.r) { b.y = H - ARENA - b.r; b.vy = -Math.abs(b.vy); hitWall = true; }

      if (hitWall) {
        if (!b.friendly) { b.dead = true; continue; }
        b.wallBounce--;
        addParticles(b.x, b.y, 3, { color: b.color, speed: 70, life: 0.2, size: 1.8 });
        if (b.wallBounce < 0) { b.dead = true; continue; }
      }

      if (!b.friendly) {
        /* shield first */
        if (player.shieldActive && dist2(b.x, b.y, player.x, player.y) <= (shieldR + b.r) * (shieldR + b.r)) {
          deflectBullet(b);
          continue;
        }
        /* then flesh */
        if (dist2(b.x, b.y, player.x, player.y) <= (player.r + b.r) * (player.r + b.r)) {
          b.dead = true;
          addParticles(b.x, b.y, 7, { color: C.orangeDeep, speed: 160, life: 0.35, size: 2.2 });
          hurtPlayer(b.dmg);
        }
      } else {
        for (let j = 0; j < enemies.length; j++) {
          const e = enemies[j];
          if (e.dead || (b.hit && b.hit.has(e.id))) continue;
          const rr = e.r + b.r;
          if (dist2(b.x, b.y, e.x, e.y) <= rr * rr) {
            b.hit.add(e.id);
            damageEnemy(e, b.dmg);
            addParticles(b.x, b.y, 6, { color: C.mint, speed: 190, life: 0.3, size: 2 });
            b.pierce--;
            if (b.pierce <= 0) { b.dead = true; break; }
          }
        }
      }
    }

    bullets = bullets.filter((b) => !b.dead);
  }

  /* -------------------------------------------------------- player logic */
  const keys = new Set();
  const virtualMove = { x: 0, y: 0 };

  function tryShield() {
    if (state.mode !== 'playing') return;
    if (player.shieldActive || player.shieldCd > 0) return;

    player.shieldActive = true;
    player.shieldT = P.shieldDur();
    player.shieldCd = P.shieldCd();

    addRing(player.x, player.y, player.r + 4, P.shieldRadius() * 1.2, 'rgba(250,104,27,0.95)', 0.22, 2.5);
    addParticles(player.x, player.y, 6, { color: C.butter, speed: 150, life: 0.24, size: 2 });
    sweepShield();
  }

  function sweepShield() {
    const R = P.shieldRadius();
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (b.dead || b.friendly) continue;
      if (dist2(b.x, b.y, player.x, player.y) <= (R + b.r) * (R + b.r)) deflectBullet(b);
    }
  }

  function updatePlayer(dt) {
    let ix = 0, iy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) iy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iy += 1;
    ix += virtualMove.x;
    iy += virtualMove.y;
    if (ix || iy) {
      const m = Math.hypot(ix, iy);
      ix /= m; iy /= m;
    }

    const accel = 2500;
    player.vx += ix * accel * dt;
    player.vy += iy * accel * dt;
    if (!ix && !iy) {
      const damp = Math.exp(-9 * dt);
      player.vx *= damp;
      player.vy *= damp;
    }
    const max = P.moveSpeed();
    const sp = Math.hypot(player.vx, player.vy);
    if (sp > max) {
      player.vx *= max / sp;
      player.vy *= max / sp;
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.x = clamp(player.x, ARENA + player.r, W - ARENA - player.r);
    player.y = clamp(player.y, ARENA + player.r, H - ARENA - player.r);

    if (player.iT > 0) player.iT -= dt;

    if (player.shieldActive) {
      player.shieldT -= dt;
      if (player.shieldT <= 0) {
        player.shieldActive = false;
        player.shieldT = 0;
      } else {
        sweepShield();
      }
    }
    if (player.shieldCd > 0) player.shieldCd = Math.max(0, player.shieldCd - dt);
  }

  /* -------------------------------------------------------------- systems */
  function updateSpawn(dt) {
    state.spawnT -= dt;
    if (state.spawnT > 0) return;

    let alive = 0;
    for (let i = 0; i < enemies.length; i++) if (!enemies[i].dead) alive++;

    /* deliberately sparse: the arena should stay readable */
    const cap = Math.min(12, 5 + Math.floor(state.time / 50));
    if (alive < cap) {
      let n = 1;
      if (state.time > 120) n = 2;
      if (state.time > 240) n = 3;
      n = Math.min(n, cap - alive);
      for (let i = 0; i < n; i++) spawnEnemy();
    }
    state.spawnT = Math.max(1.1, 2.4 - state.time * 0.008) * rand(0.85, 1.15);
  }

  function updateFx(dt) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
    }
    particles = particles.filter((p) => p.life > 0);
    if (particles.length > 700) particles.splice(0, particles.length - 700);

    for (let i = 0; i < rings.length; i++) rings[i].life -= dt;
    rings = rings.filter((r) => r.life > 0);

    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
    }
    texts = texts.filter((t) => t.life > 0);
  }

  function update(dt) {
    state.time += dt;
    updatePlayer(dt);
    updateWells(dt);
    updateSpawn(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateFx(dt);

    if (state.comboT > 0) {
      state.comboT -= dt;
      if (state.comboT <= 0) state.combo = 1;
    }
    state.shake = Math.max(0, state.shake - dt * 26);
    state.flash = Math.max(0, state.flash - dt * 2.4);
  }

  /* -------------------------------------------------------------- screens */
  const SCREENS = {
    menu: 'screen-menu',
    select: 'screen-select',
    levelup: 'screen-levelup',
    paused: 'screen-pause',
    gameover: 'screen-over',
  };

  function setMode(m) {
    state.mode = m;
    document.body.dataset.mode = m;
    for (const k in SCREENS) {
      document.getElementById(SCREENS[k]).classList.toggle('hidden', m !== k);
    }
  }

  function openCharacterSelect() {
    setMode('select');
    els.characterCards.innerHTML = '';
    const keys = Object.keys(characterSprites);
    for (let copy = 0; copy < 3; copy++) {
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i], character = characterSprites[key];
        const card = document.createElement('button');
        card.type = 'button';
        card.dataset.character = key;
        card.className = 'character-card';
        card.innerHTML = '<div class="character-card-top"><span>CREATURE</span><b>HP 100</b></div>' +
          '<img src="' + character.src + '" alt="">' +
          '<strong>' + character.name + '</strong>' +
          '<span class="character-card-type">' + (key === selectedCharacterKey ? 'selected' : 'playable') + '</span>' +
          '<span class="character-card-rule"></span>' +
          '<span>' + (key === selectedCharacterKey ? 'YOUR ACTIVE CARD' : 'CLICK TO CHOOSE') + '</span>';
        card.addEventListener('click', () => chooseCharacter(key));
        els.characterCards.appendChild(card);
      }
    }
    centerCharacterCarousel(selectedCharacterKey);
  }

  function centerCharacterCarousel(key) {
    const cards = Array.from(els.characterCards.querySelectorAll('[data-character="' + key + '"]'));
    const keys = Object.keys(characterSprites);
    const middleCopyIndex = keys.length + keys.indexOf(key);
    const card = els.characterCards.querySelectorAll('.character-card')[middleCopyIndex] || cards[1] || cards[0];
    if (!card) return;
    const viewportRect = els.characterViewport.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const viewportCenter = viewportRect.left + viewportRect.width / 2;
    const cardCenter = cardRect.left + cardRect.width / 2;
    els.characterViewport.scrollLeft += cardCenter - viewportCenter;
    updateCharacterCenter();
  }

  function updateCharacterCenter() {
    const viewportRect = els.characterViewport.getBoundingClientRect();
    const center = viewportRect.left + viewportRect.width / 2;
    const cards = els.characterCards.querySelectorAll('.character-card');
    let closest = null, distance = Infinity;
    cards.forEach((card) => {
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.left + cardRect.width / 2;
      const distanceFromCenter = Math.abs(cardCenter - center);
      card.classList.toggle('is-center', distanceFromCenter < distance);
      if (distanceFromCenter < distance) { distance = distanceFromCenter; closest = card; }
    });
    cards.forEach((card) => card.classList.toggle('is-center', card === closest));
  }

  function characterCarouselGroupWidth() {
    const cards = els.characterCards.querySelectorAll('.character-card');
    const count = Object.keys(characterSprites).length;
    if (cards.length < count * 2) return 0;
    return cards[count].offsetLeft - cards[0].offsetLeft;
  }

  function recycleCharacterCarousel(direction, group) {
    const count = Object.keys(characterSprites).length;
    const children = Array.from(els.characterCards.children);
    if (children.length < count * 2) return;
    const moving = direction > 0 ? children.slice(0, count) : children.slice(-count);
    els.characterViewport.style.scrollBehavior = 'auto';
    if (direction > 0) {
      moving.forEach((card) => els.characterCards.appendChild(card));
      els.characterViewport.scrollLeft -= group;
    } else {
      moving.reverse().forEach((card) => els.characterCards.insertBefore(card, els.characterCards.firstChild));
      els.characterViewport.scrollLeft += group;
    }
    els.characterViewport.style.scrollBehavior = '';
  }

  function nudgeCharacterCarousel(direction) {
    const card = els.characterCards.querySelector('.character-card');
    if (!card) return;
    els.characterViewport.scrollBy({
      left: direction * (card.offsetWidth + parseFloat(getComputedStyle(els.characterCards).gap || 0)),
      behavior: 'smooth',
    });
  }

  els.characterViewport.addEventListener('scroll', () => {
    const group = characterCarouselGroupWidth();
    if (group && els.characterViewport.scrollLeft < group * 0.45) recycleCharacterCarousel(-1, group);
    else if (group && els.characterViewport.scrollLeft > group * 1.55) recycleCharacterCarousel(1, group);
    updateCharacterCenter();
  });

  function chooseCharacter(key) {
    if (!characterSprites[key]) return;
    selectedCharacterKey = key;
    startGame();
  }

  let currentCards = [];

  function pipsHtml(lvl, max) {
    if (max > 10) return '';
    let s = '';
    for (let i = 0; i < max; i++) s += '<i class="' + (i < lvl ? 'on' : '') + '"></i>';
    return s;
  }

  function openLevelUp() {
    setMode('levelup');
    const pool = [];
    for (let i = 0; i < UPGRADES.length; i++) {
      const u = UPGRADES[i];
      if ((player.up[u.id] || 0) < u.max) pool.push(u);
    }
    pool.push(REPAIR);

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    currentCards = pool.slice(0, 3);

    els.cards.innerHTML = '';
    currentCards.forEach((u, idx) => {
      const lvl = u.id === 'repair' ? 0 : (player.up[u.id] || 0);
      const next = lvl + 1;
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.type = 'button';
      btn.innerHTML =
        '<span class="card-key">' + (idx + 1) + '</span>' +
        '<span class="card-icon">' + u.icon + '</span>' +
        '<span class="card-name">' + u.name + '</span>' +
        '<span class="card-desc">' + u.desc(next) + '</span>' +
        '<span class="pips">' + pipsHtml(lvl, u.max) + '</span>';
      btn.addEventListener('click', () => chooseUpgrade(u.id));
      els.cards.appendChild(btn);
    });
  }

  function chooseUpgrade(id) {
    if (state.mode !== 'levelup') return;

    if (id === 'repair') {
      player.hp = Math.min(player.maxHp, player.hp + 35);
    } else if (id === 'hull') {
      player.up.hull++;
      player.maxHp += 20;
      player.hp = Math.min(player.maxHp, player.hp + 20);
    } else {
      player.up[id] = (player.up[id] || 0) + 1;
    }

    state.pending = Math.max(0, state.pending - 1);
    Sound.deflect();

    if (state.pending > 0) {
      openLevelUp();
    } else {
      setMode('playing');
    }
  }

  function gameOver() {
    setMode('gameover');
    state.best = Math.max(state.best, state.score);
    localStorage.setItem('bounceback.best', String(state.best));

    els.overTime.textContent = fmtTime(state.time);
    els.overScore.textContent = state.score;
    els.overKills.textContent = state.kills;
    els.overDeflects.textContent = state.deflects;
    els.overLevel.textContent = state.level;
    els.overBest.textContent = state.best;
    els.best.textContent = state.best;
    Sound.over();
  }

  function reset() {
    enemies = [];
    bullets = [];
    particles = [];
    rings = [];
    texts = [];
    nextId = 1;

    player.x = W / 2; player.y = H / 2;
    player.vx = 0; player.vy = 0;
    player.angle = 0;
    player.hp = 100; player.maxHp = 100;
    player.iT = 0;
    player.shieldActive = false;
    player.shieldT = 0;
    player.shieldCd = 0;
    player.up = { multi: 0, amp: 0, burst: 0, homing: 0, recovery: 0, fleet: 0, hull: 0, chain: 0 };

    state.time = 0;
    state.score = 0;
    state.kills = 0;
    state.deflects = 0;
    state.level = 1;
    state.xp = 0;
    state.xpNext = 14;
    state.pending = 0;
    state.combo = 1;
    state.comboT = 0;
    state.spawnT = 1.1;
    state.shake = 0;
    state.flash = 0;

    makeWells();
  }

  function startGame() {
    Sound.init();
    Sound.start();
    reset();
    setMode('playing');
    els.best.textContent = state.best;
  }

  function goHome() {
    reset();
    els.best.textContent = state.best;
    setMode('menu');
  }

  /* --------------------------------------------------------------- render */
  let clock = 0;

  const paperDots = (() => {
    const out = [];
    for (let i = 0; i < 150; i++) {
      out.push({
        x: rand(ARENA + 6, W - ARENA - 6),
        y: rand(ARENA + 6, H - ARENA - 6),
        r: rand(0.6, 1.9),
        a: rand(0.03, 0.09),
      });
    }
    return out;
  })();

  function drawDaisies() {
    const spots = [[74, 74], [W - 74, 74], [74, H - 74], [W - 74, H - 74]];
    ctx.save();
    for (let i = 0; i < spots.length; i++) {
      const x = spots[i][0], y = spots[i][1];
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = C.paperLight;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 5, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(184,119,74,0.55)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU - Math.PI / 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 5, 0, TAU);
        ctx.stroke();
      }
      ctx.fillStyle = C.yellow;
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBackground() {
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, W, H);

    const g = ctx.createRadialGradient(W / 2, H * 0.44, 60, W / 2, H / 2, 620);
    g.addColorStop(0, 'rgba(255,250,238,0.95)');
    g.addColorStop(0.55, 'rgba(255,244,224,0.45)');
    g.addColorStop(1, 'rgba(238,210,172,0.4)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* paper speckles */
    ctx.save();
    ctx.fillStyle = C.ink;
    for (let i = 0; i < paperDots.length; i++) {
      const d = paperDots[i];
      ctx.globalAlpha = d.a;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    /* drifting grid */
    const step = 40;
    const off = (clock * 9) % step;
    ctx.strokeStyle = 'rgba(74,44,26,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = ARENA - step + off; x < W - ARENA; x += step) {
      ctx.moveTo(x, ARENA);
      ctx.lineTo(x, H - ARENA);
    }
    for (let y = ARENA - step + off; y < H - ARENA; y += step) {
      ctx.moveTo(ARENA, y);
      ctx.lineTo(W - ARENA, y);
    }
    ctx.stroke();

    /* chunky hand-drawn arena frame */
    ctx.save();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(ARENA, ARENA, W - ARENA * 2, H - ARENA * 2, 18);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(184,119,74,0.4)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([9, 10]);
    ctx.beginPath();
    ctx.roundRect(ARENA + 8, ARENA + 8, W - (ARENA + 8) * 2, H - (ARENA + 8) * 2, 13);
    ctx.stroke();
    ctx.restore();

    drawDaisies();
  }

  function drawRings() {
    ctx.save();
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const t = 1 - r.life / r.max;
      const rad = lerp(r.r0, r.r1, easeOut(t));
      ctx.globalAlpha = Math.max(0, 1 - t) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(1, rad), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEnemies() {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;

      /* telegraph */
      if (e.charge > 0) {
        const t = 1 - e.charge / e.chargeMax;
        ctx.save();
        ctx.globalAlpha = 0.12 + t * 0.42;
        ctx.strokeStyle = e.ty.color;
        ctx.lineWidth = 1 + t * 1.6;
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(player.x, player.y);
        ctx.stroke();
        ctx.restore();
      }

      const alpha = e.warmup > 0 ? 1 - e.warmup / 0.55 : 1;
      const ang = Math.atan2(player.y - e.y, player.x - e.x);
      const col = e.hurt > 0 ? C.butter : e.ty.color;

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = alpha;
      /* Keep image enemies upright instead of flipping toward the player. */
      if (!e.ty.sprite) ctx.rotate(ang);
      const enemySprite = e.ty.sprite ? characterSprites[e.ty.sprite].image : null;
      if (e.ty.sprite && enemySprite.complete && enemySprite.naturalWidth) {
        ctx.shadowColor = 'rgba(74,44,26,0.3)';
        ctx.shadowBlur = 7;
        ctx.shadowOffsetY = 2;
        const spriteW = e.r * 3.05;
        const spriteH = spriteW * enemySprite.naturalHeight / enemySprite.naturalWidth;
        ctx.drawImage(enemySprite, -spriteW / 2, -spriteH / 2, spriteW, spriteH);
        /* Skip the geometric enemy shape below; keep its normal HP bar. */
        ctx.globalAlpha = 0;
      }
      ctx.fillStyle = col;
      ctx.beginPath();

      const r = e.r;
      if (e.ty.shape === 'tri') {
        ctx.moveTo(r * 1.15, 0);
        ctx.lineTo(-r * 0.8, r * 0.85);
        ctx.lineTo(-r * 0.3, 0);
        ctx.lineTo(-r * 0.8, -r * 0.85);
      } else if (e.ty.shape === 'hex') {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          const px = Math.cos(a) * r, py = Math.sin(a) * r;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      } else if (e.ty.shape === 'diamond') {
        ctx.moveTo(r * 1.2, 0);
        ctx.lineTo(0, r * 0.8);
        ctx.lineTo(-r * 1.2, 0);
        ctx.lineTo(0, -r * 0.8);
      } else if (e.ty.shape === 'star') {
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU - Math.PI / 2;
          const rr = k % 2 === 0 ? r : r * 0.45;
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      } else {
        const s = r * 0.92;
        ctx.moveTo(-s, -s); ctx.lineTo(s, -s); ctx.lineTo(s, s); ctx.lineTo(-s, s);
      }
      ctx.closePath();
      /* cream halo sits behind the fill so thin arms stay solid */
      ctx.strokeStyle = 'rgba(255,247,230,0.95)';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fill();
      ctx.strokeStyle = 'rgba(74,44,26,0.9)';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      /* core */
      ctx.fillStyle = 'rgba(255,247,230,0.92)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(74,44,26,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();

      /* hp bar */
      if (e.hp < e.maxHp) {
        const w = e.r * 2.1;
        const x = e.x - w / 2, y = e.y - e.r - 11, h = 4;
        ctx.fillStyle = 'rgba(255,247,230,0.92)';
        ctx.beginPath();
        ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(74,44,26,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = C.orangeDeep;
        ctx.beginPath();
        ctx.roundRect(x, y, Math.max(1, w * clamp(e.hp / e.maxHp, 0, 1)), h, 2);
        ctx.fill();
      }
    }
  }

  function drawBullets() {
    ctx.save();
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (b.dead) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const tx = b.x - (b.vx / sp) * (b.friendly ? 24 : 15);
      const ty = b.y - (b.vy / sp) * (b.friendly ? 24 : 15);

      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.r * 1.3;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.globalAlpha = 0.16;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.5, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,247,230,0.95)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 2.8, 0, TAU);
      ctx.fill();

      ctx.fillStyle = 'rgba(74,44,26,0.9)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 1.4, 0, TAU);
      ctx.fill();

      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();

      ctx.fillStyle = '#fffaf0';
      ctx.beginPath();
      ctx.arc(b.x - b.r * 0.14, b.y - b.r * 0.14, b.r * 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = player;
    const R = P.shieldRadius();

    /* faint always-on range indicator */
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(74,44,26,0.28)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, R, 0, TAU);
    ctx.stroke();
    ctx.restore();

    /* cooldown arc */
    const cdMax = P.shieldCd();
    const prog = clamp(1 - p.shieldCd / cdMax, 0, 1);
    ctx.save();
    ctx.strokeStyle = prog >= 1 ? C.olive : 'rgba(74,44,26,0.3)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 8, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
    ctx.stroke();
    ctx.restore();

    /* active shield */
    if (p.shieldActive) {
      const t = 1 - p.shieldT / P.shieldDur();
      const rad = R * lerp(0.86, 1.14, t);
      const a = 1 - t * 0.6;
      ctx.save();
      const g = ctx.createRadialGradient(p.x, p.y, rad * 0.45, p.x, p.y, rad);
      g.addColorStop(0, 'rgba(44,191,144,0)');
      g.addColorStop(0.7, 'rgba(255,227,130,' + (0.3 * a) + ')');
      g.addColorStop(1, 'rgba(250,104,27,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = 'rgba(250,104,27,' + (0.95 * a) + ')';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad, 0, TAU);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,247,230,' + (0.9 * a) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rad + 2.5, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    /* rocket sprite */
    const blink = p.iT > 0 && Math.floor(p.iT * 18) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = blink ? 0.4 : 1;
    ctx.translate(p.x, p.y);
    const sp = Math.hypot(p.vx, p.vy);
    /* Rotate the static Orpheus artwork toward movement; never animate it. */
    if (sp > 20) p.angle = Math.atan2(p.vy, p.vx) + Math.PI / 2;
    ctx.rotate(p.angle);
    ctx.shadowColor = 'rgba(74,44,26,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    const activePlayerSprite = characterSprites[selectedCharacterKey].image;
    if (activePlayerSprite.complete && activePlayerSprite.naturalWidth) {
      const spriteH = 58;
      const spriteW = spriteH * (activePlayerSprite.naturalWidth / activePlayerSprite.naturalHeight);
      ctx.drawImage(activePlayerSprite, -spriteW / 2, -spriteH / 2, spriteW, spriteH);
    }
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    ctx.restore();
  }

  function drawTexts() {
    ctx.save();
    ctx.textAlign = 'center';
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      const a = clamp(t.life / t.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = '700 ' + t.size + 'px ' + 'ui-sans-serif,system-ui,sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,247,230,0.92)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function drawCombo() {
    if (state.combo <= 1 || state.comboT <= 0) return;
    const a = clamp(state.comboT / 0.6, 0, 1);
    const scale = 1 + (1 - a) * 0.12;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(W / 2, 74);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = '400 30px "Darumadrop One", ui-sans-serif, system-ui, sans-serif';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(255,247,230,0.95)';
    ctx.strokeText('x' + state.combo + '  COMBO', 0, 0);
    ctx.fillStyle = C.orange;
    ctx.fillText('x' + state.combo + '  COMBO', 0, 0);
    ctx.restore();
  }

  function drawOverlayFx() {
    /* warm paper edge */
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.98);
    v.addColorStop(0, 'rgba(74,44,26,0)');
    v.addColorStop(1, 'rgba(74,44,26,0.22)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);

    if (state.flash > 0) {
      ctx.fillStyle = 'rgba(237,86,21,' + (state.flash * 0.26) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawWells() {
    for (let i = 0; i < wells.length; i++) {
      const w = wells[i];
      const boost = 1 + w.pulse * 2.2;
      const breathe = 1 + Math.sin(clock * 2.4 + i * 1.7) * 0.045;
      const haloR = w.r * 0.9 * breathe;
      const coreR = w.core * (1 + Math.sin(clock * 3.2 + i) * 0.1);

      /* influence boundary */
      ctx.save();
      ctx.strokeStyle = 'rgba(74,44,26,0.16)';
      ctx.lineWidth = 1.2;
      ctx.lineDashOffset = -clock * 8;
      ctx.setLineDash([4, 10]);
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r, 0, TAU);
      ctx.stroke();
      ctx.restore();

      /* lensing halo */
      const g = ctx.createRadialGradient(w.x, w.y, 3, w.x, w.y, haloR);
      g.addColorStop(0, 'rgba(42,24,13,0.98)');
      g.addColorStop(0.2, 'rgba(58,35,20,0.92)');
      g.addColorStop(0.42, 'rgba(109,58,34,0.52)');
      g.addColorStop(0.68, 'rgba(184,119,74,0.16)');
      g.addColorStop(1, 'rgba(184,119,74,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(w.x, w.y, haloR, 0, TAU);
      ctx.fill();

      /* burrow rim */
      ctx.save();
      ctx.strokeStyle = 'rgba(255,227,130,0.35)';
      ctx.lineWidth = 2 + Math.sin(clock * 3 + i) * 0.4;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r * 0.42, 0, TAU);
      ctx.stroke();
      ctx.restore();

      /* rotating accretion arcs + in-falling sparks */
      ctx.save();
      for (let k = 0; k < 3; k++) {
        const rr = 26 + k * 16;
        const a0 = w.spin + clock * (0.75 - k * 0.18) + k * 2.1;
        const span = 1.5 - k * 0.25;
        ctx.globalAlpha = (0.75 - k * 0.13) * boost;
        ctx.strokeStyle = k === 1 ? C.olive : k === 2 ? C.mint : C.butter;
        ctx.lineWidth = 2.6 - k * 0.4;
        ctx.beginPath();
        ctx.arc(w.x, w.y, rr, a0, a0 + span);
        ctx.stroke();
      }
      for (let k = 0; k < w.sparks.length; k++) {
        const s = w.sparks[k];
        const px = w.x + Math.cos(s.a) * s.d;
        const py = w.y + Math.sin(s.a) * s.d;
        const fade = clamp((s.d - 20) / (w.r * 0.8), 0, 1);
        ctx.globalAlpha = 0.7 * fade;
        ctx.fillStyle = s.size > 1.4 ? C.butter : C.brownLight;
        ctx.beginPath();
        ctx.arc(px, py, s.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      /* core */
      ctx.beginPath();
      ctx.arc(w.x, w.y, coreR, 0, TAU);
      ctx.fillStyle = C.dark;
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = C.butter;
      ctx.lineWidth = 2.4;
      ctx.shadowColor = C.yellow;
      ctx.shadowBlur = 14 * boost;
      ctx.stroke();
      ctx.restore();
    }
  }

  function draw() {
    drawBackground();
    ctx.save();
    if (state.shake > 0.2) {
      ctx.translate(rand(-1, 1) * state.shake, rand(-1, 1) * state.shake);
    }
    drawWells();
    drawRings();
    drawParticles();
    drawEnemies();
    drawBullets();
    drawPlayer();
    drawTexts();
    drawCombo();
    ctx.restore();
    drawOverlayFx();
  }

  /* ------------------------------------------------------------------ hud */
  function updateHud() {
    els.level.textContent = state.level;
    els.xp.style.width = clamp((state.xp / state.xpNext) * 100, 0, 100) + '%';
    els.xpText.textContent = Math.floor(state.xp) + ' / ' + state.xpNext + ' XP';

    const hpPct = clamp(player.hp / player.maxHp, 0, 1);
    els.hp.style.width = (hpPct * 100) + '%';
    els.hpText.textContent = Math.ceil(player.hp);
    els.hpBar.classList.toggle('low', hpPct < 0.3);

    els.time.textContent = fmtTime(state.time);
    els.score.textContent = state.score;
    els.kills.textContent = state.kills;
  }

  /* ----------------------------------------------------------- main loop */
  let last = performance.now();

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;
    clock += dt;

    if (state.mode === 'playing') {
      update(dt);
    } else {
      updateFx(dt * 0.7);
      state.shake = Math.max(0, state.shake - dt * 26);
      state.flash = Math.max(0, state.flash - dt * 2.4);
    }

    draw();
    updateHud();
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- input */
  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) {
      e.preventDefault();
    }

    if (e.code === 'KeyM') {
      toggleMute();
      return;
    }

    if (state.mode === 'levelup') {
      if (e.code === 'Digit1' || e.code === 'Numpad1') pickCard(0);
      else if (e.code === 'Digit2' || e.code === 'Numpad2') pickCard(1);
      else if (e.code === 'Digit3' || e.code === 'Numpad3') pickCard(2);
      return;
    }

    if (state.mode === 'select') {
      if (e.code === 'KeyA' || e.code === 'KeyW' || e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
        e.preventDefault();
        nudgeCharacterCarousel(-1);
      } else if (e.code === 'KeyD' || e.code === 'KeyS' || e.code === 'ArrowRight' || e.code === 'ArrowDown') {
        e.preventDefault();
        nudgeCharacterCarousel(1);
      }
      return;
    }

    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (state.mode === 'playing') setMode('paused');
      else if (state.mode === 'paused') setMode('playing');
      return;
    }

    if (state.mode === 'gameover' && e.code === 'KeyR') {
      startGame();
      return;
    }

    if (state.mode === 'menu' && (e.code === 'Enter' || e.code === 'Space')) {
      openCharacterSelect();
      return;
    }

    if (e.code === 'Space') {
      tryShield();
      return;
    }

    keys.add(e.code);
  });

  window.addEventListener('keyup', (e) => keys.delete(e.code));

  const touchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  document.body.classList.toggle('touch-device', touchDevice);
  const moveZone = document.getElementById('move-zone');
  const bounceZone = document.getElementById('bounce-zone');
  const joystick = document.getElementById('joystick');
  const joystickKnob = document.getElementById('joystick-knob');
  let joystickPointer = null;
  let joystickOrigin = null;

  function resetJoystick() {
    virtualMove.x = 0;
    virtualMove.y = 0;
    joystickKnob.style.transform = 'translate(-50%, -50%)';
    joystick.classList.remove('visible');
    joystickOrigin = null;
    joystickPointer = null;
  }

  function moveJoystick(e) {
    if (e.pointerId !== joystickPointer) return;
    const max = joystick.offsetWidth * 0.3;
    const dx = e.clientX - joystickOrigin.x;
    const dy = e.clientY - joystickOrigin.y;
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, max / length);
    const x = dx * scale, y = dy * scale;
    virtualMove.x = x / max;
    virtualMove.y = y / max;
    joystickKnob.style.transform = 'translate(calc(-50% + ' + x + 'px), calc(-50% + ' + y + 'px))';
  }

  moveZone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    joystickPointer = e.pointerId;
    joystickOrigin = { x: e.clientX, y: e.clientY };
    joystick.classList.add('visible');
    joystick.style.left = (e.clientX - moveZone.getBoundingClientRect().left - joystick.offsetWidth / 2) + 'px';
    joystick.style.top = (e.clientY - moveZone.getBoundingClientRect().top - joystick.offsetHeight / 2) + 'px';
    moveZone.setPointerCapture(e.pointerId);
    moveJoystick(e);
  });
  moveZone.addEventListener('pointermove', moveJoystick);
  moveZone.addEventListener('pointerup', resetJoystick);
  moveZone.addEventListener('pointercancel', resetJoystick);
  const bounceButton = document.getElementById('bounce-button');
  bounceButton.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    tryShield();
  });
  bounceZone.addEventListener('pointerdown', (e) => {
    if (e.target !== bounceButton) {
      e.preventDefault();
      tryShield();
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    tryShield();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing') setMode('paused');
  });

  function pickCard(i) {
    if (state.mode !== 'levelup') return;
    const u = currentCards[i];
    if (u) chooseUpgrade(u.id);
  }

  function toggleMute() {
    Sound.init();
    const m = Sound.toggle();
    els.mute.classList.toggle('off', m);
    els.mute.textContent = m ? '\uD83D\uDD07' : '\uD83D\uDD0A';
  }

  /* ------------------------------------------------------------- bootstrap */
  document.getElementById('btn-play').addEventListener('click', openCharacterSelect);
  document.getElementById('btn-select-back').addEventListener('click', () => setMode('menu'));
  document.getElementById('btn-retry').addEventListener('click', startGame);
  document.getElementById('btn-resume').addEventListener('click', () => setMode('playing'));
  document.getElementById('btn-home').addEventListener('click', goHome);
  document.getElementById('btn-pause-home').addEventListener('click', goHome);
  els.mute.addEventListener('click', toggleMute);

  els.best.textContent = state.best;
  makeWells();
  setMode('menu');
  requestAnimationFrame(frame);

  /* debug / test hooks (handy in the console) */
  window.BounceBack = {
    state, player, P, TYPES, characterSprites, selectedCharacter: () => selectedCharacterKey,
    wells: () => wells, makeWells,
    enemies: () => enemies,
    bullets: () => bullets,
    spawnEnemy, tryShield, startGame, setMode,
    addBullet, chooseUpgrade, openLevelUp,
    step: (dt) => { update(dt); draw(); updateHud(); },
  };
})();
