// Six Winds: the page. Runs the loop, reads the keyboard, mouse and touch, keeps
// the actors on screen in step with the simulation, draws the labels and the
// minimap, plays small sounds, saves.

import { generateWorld } from './gen.js';
import { View } from './view.js';
import { Game, SAVE_KEY } from './sim.js';
import { center, hexAt, LAYER } from './hex.js';
import { M, MAT } from './world.js';
import { CLASSES, SKILLS, ITEMS, NPCS, MONSTERS, ISLANDS, QUESTS } from './data.js';
import { UI } from './ui.js';

const $ = (id) => document.getElementById(id);

export const LOOK = {
    novice: { coat: 0x3f95b8, hat: 'bandana', hatColor: 0xc9483e },
    swordsman: { coat: 0xc9483e, hat: 'none', hair: 0x3a2a22, cape: 0x7a2a24 },
    hunter: { coat: 0x6f9a4a, hat: 'hood', hatColor: 0x4f7a3a },
    explorer: { coat: 0x2f6f9a, hat: 'tricorn', hatColor: 0x23282c },
    herbalist: { coat: 0xb07cd6, hat: 'straw' },
    boarder: { coat: 0xa0302a, hat: 'bandana', hatColor: 0x23282c, cape: 0x23282c },
    duelist: { coat: 0xd8703a, hat: 'tricorn', hatColor: 0x7a2a24, cape: 0xc9483e },
    sniper: { coat: 0x4f7a3a, hat: 'hood', hatColor: 0x2f4a2a, cape: 0x6f9a4a },
    navigator: { coat: 0x2f4f7a, hat: 'bicorne', hatColor: 0x23282c, cape: 0x3f95b8 },
    tidepriest: { coat: 0x5fb8c8, hat: 'scarf', hatColor: 0xeee2c8, cape: 0xeee2c8 },
    sealer: { coat: 0x7a4ab0, hat: 'hood', hatColor: 0x3a2a5a, cape: 0x23282c },
};
const WEAPON_MODEL = { blade: 'saber', greatblade: 'greatblade', dual: 'dual', bow: 'bow', staff: 'staff', censer: 'censer', fist: 'none' };

// ------------------------------------------------------------------ sounds
const SFX = {
    ctx: null,
    on: true,
    init() {
        if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; return; }
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        // the sea: filtered noise that swells slowly
        const n = this.ctx.createBufferSource();
        n.buffer = this.noiseBuf(4);
        n.loop = true;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 420;
        const g = this.ctx.createGain();
        g.gain.value = 0.05;
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.11;
        const lg = this.ctx.createGain();
        lg.gain.value = 0.03;
        lfo.connect(lg).connect(g.gain);
        n.connect(f).connect(g).connect(this.master);
        n.start();
        lfo.start();
        this.sea = g;
    },
    noiseBuf(sec) {
        const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return b;
    },
    tone(freq, dur = 0.12, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
        if (!this.ctx || !this.on) return;
        const t = this.ctx.currentTime + delay;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g).connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.02);
    },
    noise(dur = 0.1, vol = 0.15, freq = 1200, type = 'bandpass') {
        if (!this.ctx || !this.on) return;
        const t = this.ctx.currentTime;
        const s = this.ctx.createBufferSource();
        s.buffer = this.nb ?? (this.nb = this.noiseBuf(1));
        const f = this.ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        s.connect(f).connect(g).connect(this.master);
        s.start(t, Math.random() * 0.5);
        s.stop(t + dur + 0.02);
    },
    play(k) {
        switch (k) {
            case 'hit': this.noise(0.08, 0.2, 900); this.tone(140, 0.08, 'square', 0.05, -60); break;
            case 'crit': this.noise(0.12, 0.25, 1500); this.tone(520, 0.12, 'triangle', 0.08, 300); break;
            case 'swing': this.noise(0.12, 0.08, 2400); break;
            case 'coin': this.tone(1320, 0.08, 'sine', 0.06); this.tone(1760, 0.12, 'sine', 0.06, 0, 0.06); break;
            case 'level': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.09, 0, i * 0.09)); break;
            case 'quest': [659, 880].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.08, 0, i * 0.1)); break;
            case 'splash': this.noise(0.35, 0.18, 600, 'lowpass'); break;
            case 'bite': this.tone(880, 0.07, 'square', 0.05); this.tone(880, 0.07, 'square', 0.05, 0, 0.12); break;
            case 'hurt': this.tone(200, 0.14, 'sawtooth', 0.06, -90); break;
            case 'death': this.tone(330, 0.9, 'triangle', 0.1, -250); break;
            case 'magic': this.tone(740, 0.2, 'sine', 0.06, 500); break;
            case 'jump': this.tone(300, 0.08, 'sine', 0.03, 200); break;
            case 'gather': this.noise(0.06, 0.12, 700); break;
            case 'bump': this.noise(0.2, 0.2, 300, 'lowpass'); break;
            case 'click': this.tone(600, 0.04, 'sine', 0.04); break;
            default: break;
        }
    },
};

// ------------------------------------------------------------------ storage
function loadSave() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
function writeSave(g) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(g.save())); } catch { /* private mode */ }
}

// ------------------------------------------------------------------ the page
export function start() {
    const gen = generateWorld(7);
    const view = new View($('gl'), gen);
    const ctx = { gen, view, game: null, sfx: SFX, state: 'title', keys: new Set(), stick: [0, 0], pending: null, hover: null, nums: [], labels: new Map() };
    window.sixwinds = ctx;
    ctx.ui = new UI(ctx);
    if (loadSave()) $('contGame').hidden = false;
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch) document.body.classList.add('touch');

    const begin = (fromSave) => {
        SFX.init();
        let s = null;
        if (fromSave) s = loadSave();
        else try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
        ctx.game = new Game(gen, { save: s });
        ctx.state = 'play';
        $('title').hidden = true;
        $('hud').hidden = false;
        $('stick').hidden = !touch;
        $('tbtn').hidden = !touch;
        view.azTarget = Math.round((view.az - Math.PI / 2) / (Math.PI / 3)) * (Math.PI / 3) + Math.PI / 2;
        view.zoomTarget = touch ? 8 : 9;
        view.snap = true;
        ctx.ui.refreshAll();
        if (!s) {
            ctx.ui.toast('Солёная Пристань', 'Поговори с боцманом Гартом на пирсе');
            ctx.ui.log('Боцман Гарт ждёт у начала пирса — над ним жёлтый «!».', 'quest');
        }
    };
    $('newGame').onclick = () => begin(false);
    $('contGame').onclick = () => begin(true);

    // ---------------------------------------------------------- input
    const K = ctx.keys;
    addEventListener('keydown', (e) => {
        if (e.repeat && !['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) return;
        if (ctx.state !== 'play') { if (e.code === 'Enter') begin(!!loadSave()); return; }
        const g = ctx.game;
        K.add(e.code);
        const ui = ctx.ui;
        if (e.code === 'Escape') { if (ui.open) ui.close(); else g.setTarget(null); return; }
        if (e.code === 'KeyQ') view.rotate(-1);
        if (e.code === 'KeyE') view.rotate(1);
        if (e.code === 'Tab') { e.preventDefault(); g.cycleTarget(); }
        if (e.code === 'Space') { e.preventDefault(); if (g.hero.act?.type === 'fish') { g.hook(); K.delete('Space'); } }
        if (e.code === 'KeyF') useNearest();
        const wins = { KeyC: 'char', KeyI: 'bag', KeyB: 'bag', KeyK: 'skills', KeyJ: 'quests', KeyL: 'quests', KeyP: 'profs', KeyM: 'map' };
        if (wins[e.code]) ui.toggle(wins[e.code]);
        const d = /^Digit([1-8])$/.exec(e.code);
        if (d) useSlot(+d[1] - 1);
    });
    addEventListener('keyup', (e) => K.delete(e.code));
    addEventListener('blur', () => K.clear());

    const useSlot = (i) => {
        const g = ctx.game;
        const id = g.hero.bar[i];
        if (!id) return;
        if (SKILLS[id]) {
            if (!g.targetMob() && ['melee', 'ranged', 'magic', 'area', 'dash'].includes(SKILLS[id].kind)) {
                const m = g.cycleTarget();
                if (!m) { g.useSkill(id); return; }
            }
            g.useSkill(id);
        } else g.use(id);
    };
    ctx.useSlot = useSlot;

    const useNearest = () => {
        const g = ctx.game;
        if (g.hero.act?.type === 'fish') { g.hook(); return; }
        const n = g.nearby()[0];
        if (n) g.interact(n);
        else if (g.targetMob()) g.setTarget(g.targetMob(), true);
    };
    ctx.useNearest = useNearest;

    // mouse: click selects, walks, talks; wheel zooms
    const cv = $('gl');
    let down = null;
    cv.addEventListener('pointerdown', (e) => {
        SFX.init();
        if (e.pointerType === 'touch') { touches.set(e.pointerId, [e.clientX, e.clientY]); if (touches.size === 2) { pinch = dist2(); down = null; return; } }
        down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    const touches = new Map();
    let pinch = 0;
    const dist2 = () => { const p = [...touches.values()]; return Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); };
    cv.addEventListener('pointermove', (e) => {
        if (touches.has(e.pointerId)) {
            touches.set(e.pointerId, [e.clientX, e.clientY]);
            if (touches.size === 2 && pinch) { const d = dist2(); view.zoomTarget = Math.max(5, Math.min(24, view.zoomTarget * (pinch / d))); pinch = d; }
        }
        ctx.mouse = [e.clientX, e.clientY];
    });
    const endTouch = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; };
    cv.addEventListener('pointerup', (e) => {
        endTouch(e);
        if (!down || ctx.state !== 'play') return;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; }
        down = null;
        click(e.clientX, e.clientY);
    });
    cv.addEventListener('pointercancel', endTouch);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); view.zoomTarget = Math.max(5, Math.min(24, view.zoomTarget * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    const click = (sx, sy) => {
        const g = ctx.game;
        if (g.hero.dead) return;
        const a = pickActor(sx, sy);
        SFX.play('click');
        if (a?.kind === 'mob') {
            if (g.hero.target === a.ref.id) g.setTarget(a.ref, true);
            else g.setTarget(a.ref, !touch || true);
            return;
        }
        if (a?.kind === 'npc' || a?.kind === 'node' || a?.kind === 'drop' || a?.kind === 'station') {
            const near = g.nearby().find((n) => n.ref === a.ref);
            if (near) { g.interact(near); return; }
            if (!g.hero.sailing) { walkNear(a.ref); ctx.pending = a; }
            return;
        }
        if (a?.kind === 'ship') {
            const near = g.nearby().find((n) => n.kind === 'board');
            if (near) g.interact(near);
            else { walkNear(g.ship); ctx.pending = a; }
            return;
        }
        const p = view.pick(sx, sy);
        if (!p) return;
        if (g.hero.sailing) { ctx.sailGoal = { x: p.x, y: p.y }; view.showMove(p.x, p.y, g.w.sea * LAYER - 0.1); return; }
        if (p.water) return;
        g.setTarget(null);
        if (g.moveTo(p.q, p.r, p.h)) view.showMove(...center(p.q, p.r), p.h * LAYER);
    };

    // walk to the nearest standable hex beside something
    const walkNear = (ref) => {
        const g = ctx.game;
        const [q, r] = hexAt(ref.x, ref.y);
        const h = Math.round((ref.z ?? ref.h * LAYER) / LAYER);
        let best = null;
        const hb = g.hero.body;
        for (const [dq, dr] of [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [0, 0]]) for (let hh = h - 2; hh <= h + 2; hh++) {
            const n = g.w.node(q + dq, r + dr, hh);
            if (!n) continue;
            const [x, y] = center(n.q, n.r);
            const d = Math.hypot(x - hb.x, y - hb.y);
            if (!best || d < best.d) best = { n, d };
        }
        if (best) g.moveTo(best.n.q, best.n.r, best.n.h);
    };

    // actors and things under a screen point
    const pickActor = (sx, sy) => {
        let best = null;
        let bd = touch ? 40 : 30;
        for (const s of ctx.screen ?? []) {
            const d = Math.hypot(s.sx - sx, s.sy - sy);
            if (d < bd) { bd = d; best = s; }
        }
        return best;
    };

    // touch stick and buttons
    const stick = $('stick');
    let stickId = null;
    const stickMove = (e) => {
        const r = stick.getBoundingClientRect();
        let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const l = Math.hypot(x, y);
        if (l > 1) { x /= l; y /= l; }
        ctx.stick = [x, -y];
        stick.firstElementChild.style.transform = `translate(${x * 38}px, ${y * 38}px)`;
    };
    stick.addEventListener('pointerdown', (e) => { SFX.init(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) stickMove(e); });
    const stickEnd = (e) => { if (e.pointerId !== stickId) return; stickId = null; ctx.stick = [0, 0]; stick.firstElementChild.style.transform = ''; };
    stick.addEventListener('pointerup', stickEnd);
    stick.addEventListener('pointercancel', stickEnd);
    $('tJump').addEventListener('pointerdown', () => { if (ctx.game.hero.act?.type === 'fish') ctx.game.hook(); else ctx.jumpTap = true; });
    $('tUse').addEventListener('pointerdown', () => useNearest());
    $('tTab').addEventListener('pointerdown', () => ctx.game.cycleTarget());
    $('tHit').addEventListener('pointerdown', () => { const g = ctx.game; const t = g.targetMob() ?? g.cycleTarget(); if (t) g.setTarget(t, true); });
    $('rotL').onclick = () => view.rotate(-1);
    $('rotR').onclick = () => view.rotate(1);

    const readInput = () => {
        let x = 0;
        let y = 0;
        if (K.has('KeyW') || K.has('ArrowUp')) y += 1;
        if (K.has('KeyS') || K.has('ArrowDown')) y -= 1;
        if (K.has('KeyA') || K.has('ArrowLeft')) x -= 1;
        if (K.has('KeyD') || K.has('ArrowRight')) x += 1;
        x += ctx.stick[0];
        y += ctx.stick[1];
        const { up, right } = view.axes();
        let mx = right[0] * x + up[0] * y;
        let my = right[1] * x + up[1] * y;
        const g = ctx.game;
        if (Math.hypot(mx, my) > 0.1) ctx.sailGoal = null;
        else if (g.hero.sailing && ctx.sailGoal) {
            const dx = ctx.sailGoal.x - g.ship.x;
            const dy = ctx.sailGoal.y - g.ship.y;
            const d = Math.hypot(dx, dy);
            if (d < 1.2) ctx.sailGoal = null;
            else { mx = dx / d; my = dy / d; }
        }
        const jump = K.has('Space') || ctx.jumpTap;
        ctx.jumpTap = false;
        return { mx, my, jump };
    };

    // ---------------------------------------------------------- actors on screen
    const heroModel = (g) => {
        const h = g.hero;
        const look = LOOK[h.cls] ?? LOOK.novice;
        const w = WEAPON_MODEL[g.weapon().type] ?? 'saber';
        return { type: 'person', opts: { ...look, weapon: w, seed: 3 }, key: `${h.cls}:${w}` };
    };
    const npcModels = new Map();
    const npcModel = (n) => {
        let m = npcModels.get(n.id);
        if (!m) {
            const d = n.def;
            m = { type: 'person', opts: { coat: d.color, hat: d.hat, hatColor: d.hatColor ?? 0x3a3a44, weapon: d.role === 'shop' && d.shop === 'weapons' ? 'saber' : 'none', seed: n.id.length * 7 }, key: 'npc' };
            npcModels.set(n.id, m);
        }
        return m;
    };
    const mobModels = new Map();
    const mobModel = (g, m) => {
        let mm = mobModels.get(m.kind);
        if (!mm) { mm = { ...g.mobModel(m), key: m.kind }; mobModels.set(m.kind, mm); }
        return mm;
    };
    const LOOT = { type: 'loot', key: 'loot' };
    const SHIP = { type: 'ship', opts: {}, key: 'ship', scale: 1.25 };

    const syncActors = (g, dt) => {
        const h = g.hero;
        const hb = h.body;
        const screen = [];
        ctx.screen = screen;
        const vis = (x, y) => Math.hypot(x - view.focus.x, y - view.focus.y) < Math.max(view.zoom * Math.max(1, view.width / view.height), view.halfH ?? view.zoom) * 1.9 + 6;
        const hovered = ctx.hover;
        // the hero
        view.actor({
            id: 'hero', model: heroModel(g), x: hb.x, y: hb.y, z: hb.z, face: h.face, walk: h.walk, speed: h.sailing ? 0 : h.speed,
            attack: h.attackT > 0 ? 1 - h.attackT / 0.35 : 0, cast: h.castT > 0 ? 1 : 0, hurt: h.hurt, flash: h.flash, dead: h.dead > 0 ? 1 + (3 - h.dead) * 0.2 : 0,
            bob: hb.swimming ? Math.sin(view.time * 3) * 0.05 - 0.2 : 0,
        });
        // the ship
        if (g.ship) {
            const s = g.ship;
            const bob = Math.sin(view.time * 1.4) * 0.06;
            view.actor({ id: 'ship', model: SHIP, x: s.x, y: s.y, z: s.z + bob, face: s.face, walk: 0, speed: 0 });
            if (vis(s.x, s.y)) { const [sx, sy] = view.project(s.x, s.y, s.z + 1); screen.push({ kind: 'ship', ref: s, sx, sy }); }
        }
        // people
        for (const n of g.npcs) {
            if (!vis(n.x, n.y)) continue;
            let face = n.face;
            const d = Math.hypot(hb.x - n.x, hb.y - n.y);
            if (d < 4) face = Math.atan2(hb.y - n.y, hb.x - n.x);
            view.actor({ id: 'npc:' + n.id, model: npcModel(n), x: n.x, y: n.y, z: n.z, face, walk: 0, speed: 0, rim: hovered?.ref === n ? 0x3a3020 : 0 });
            const [sx, sy] = view.project(n.x, n.y, n.z + 0.8);
            screen.push({ kind: 'npc', ref: n, sx, sy });
        }
        // creatures
        for (const m of g.mobs) {
            const b = m.body;
            if (!vis(b.x, b.y)) continue;
            if (m.dead > 3) continue;
            view.actor({
                id: 'mob:' + m.id, model: mobModel(g, m), x: b.x, y: b.y, z: b.z, face: m.face, walk: m.walk, speed: m.speed,
                attack: m.attackT > 0 ? 1 - m.attackT / 0.35 : 0, hurt: m.hurt, flash: m.flash, dead: m.dead ? 1 + m.dead * 0.6 : 0,
                rim: h.target === m.id ? 0x5a1a10 : hovered?.ref === m ? 0x3a2a10 : 0,
                bob: m.sea ? Math.sin(view.time * 2 + m.id) * 0.08 : 0,
            });
            if (!m.dead) { const [sx, sy] = view.project(b.x, b.y, b.z + 0.6); screen.push({ kind: 'mob', ref: m, sx, sy }); }
        }
        // loot on the ground
        for (const d of g.drops) {
            if (!vis(d.x, d.y)) continue;
            view.actor({ id: 'drop:' + d.id, model: LOOT, x: d.x, y: d.y, z: d.z, face: d.id, walk: 0, speed: 0, bob: Math.abs(Math.sin(view.time * 3 + d.id)) * 0.06 });
            const [sx, sy] = view.project(d.x, d.y, d.z + 0.3);
            screen.push({ kind: 'drop', ref: d, sx, sy });
        }
        // nodes and stations can be clicked too
        for (const n of g.nodes) {
            if (!n.alive || !vis(n.x, n.y)) continue;
            const [sx, sy] = view.project(n.x, n.y, n.z + (n.kind === 'fishspot' ? 0 : 0.6));
            screen.push({ kind: 'node', ref: n, sx, sy });
        }
        for (const s of g.stations) {
            if (!vis(s.x, s.y)) continue;
            const [sx, sy] = view.project(s.x, s.y, s.z + 0.5);
            screen.push({ kind: 'station', ref: s, sx, sy });
        }
        // projectiles leave trails
        for (const s of g.shots) {
            if (s.delay > 0) continue;
            const c = s.kind === 'arrow' ? 0x3a3a3e : s.kind === 'ball' ? 0x23282c : s.side === 'mob' ? 0x6ff5cf : { water: 0x8fd8ff, thorns: 0x7fb84e, swarm: 0xffe08a, seal: 0xb07cd6, bolt: 0x8fd8ff }[s.kind] ?? 0xffffff;
            view.spark(s.x, s.y, s.z, 0, 0, 0, c, s.kind === 'ball' ? 10 : 6, 0.25, 0);
        }
    };

    // ---------------------------------------------------------- events
    const handle = (g, ev) => {
        const ui = ctx.ui;
        for (const e of ev) {
            switch (e.type) {
                case 'log': ui.log(e.text, e.kind); break;
                case 'num': ctx.nums.push({ ...e, t: 0 }); break;
                case 'fx':
                    if (e.kind === 'ring') for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; view.spark(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, e.z + 0.1, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 2, e.color ?? 0xffffff, 8, 0.6, 3); }
                    else view.fx(e.kind, e.x, e.y, e.z, e);
                    if (e.kind === 'splash') SFX.play('splash');
                    if (e.kind === 'gather') SFX.play('gather');
                    break;
                case 'loot': ui.log(`+ ${ITEMS[e.id].name}${e.n > 1 ? ' ×' + e.n : ''}`, 'good'); ui.dirty(); break;
                case 'level': SFX.play('level'); ui.toast(`Уровень ${e.lvl}`, 'Распредели очки характеристик (C)'); ui.dirty(); save(); break;
                case 'quest': if (e.state === 'done') { SFX.play('quest'); save(); } if (e.state === 'ready') { SFX.play('quest'); ui.log(`«${QUESTS[e.id].name}» — можно сдавать.`, 'quest'); } ui.dirty(); break;
                case 'talk': ui.dialog(e.id); break;
                case 'station': ui.openWin('craft', e.kind); break;
                case 'classChoice': ui.openWin('class'); break;
                case 'class': ui.toast(CLASSES[e.cls].name, CLASSES[e.cls].desc); ui.dirty(); break;
                case 'act': ui.cast(e); break;
                case 'bite': SFX.play('bite'); ui.bite(true); break;
                case 'sail': ui.dirty(); if (!e.on) ctx.sailGoal = null; break;
                case 'island': ui.toast(ISLANDS[e.id].name, `${ISLANDS[e.id].desc} Уровни ${ISLANDS[e.id].lvl}.`); save(); break;
                case 'death': SFX.play('death'); $('death').hidden = false; break;
                case 'respawn': $('death').hidden = true; view.snap = true; break;
                case 'coin': SFX.play('coin'); ui.dirty(); break;
                case 'hurt': SFX.play('hurt'); break;
                case 'swing': SFX.play('swing'); break;
                case 'skill': SFX.play(['melee', 'aoe', 'dash'].includes(SKILLS[e.id].kind) ? 'swing' : 'magic'); break;
                case 'bump': SFX.play('bump'); break;
                case 'prof': ui.dirty(); break;
                default: break;
            }
            if (e.type === 'num' && (e.kind === 'dmg' || e.kind === 'crit')) SFX.play(e.kind === 'crit' ? 'crit' : 'hit');
        }
    };

    const save = () => { if (ctx.game) writeSave(ctx.game); };
    ctx.save = save;
    addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

    // ---------------------------------------------------------- labels
    const layer = $('labels');
    const pool = [];
    let used = 0;
    const label = (cls, html, x, y) => {
        let el = pool[used];
        if (!el) { el = document.createElement('div'); layer.appendChild(el); pool.push(el); }
        used++;
        if (el._c !== cls) { el.className = cls; el._c = cls; }
        if (el._h !== html) { el.innerHTML = html; el._h = html; }
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
        el.style.display = '';
        return el;
    };
    const drawLabels = (g, dt) => {
        used = 0;
        const hb = g.hero.body;
        for (const s of ctx.screen) {
            if (s.kind === 'npc') {
                const n = s.ref;
                const d = Math.hypot(n.x - hb.x, n.y - hb.y);
                if (d > 22) continue;
                const mark = g.npcMark(n.id);
                const [x, y] = view.project(n.x, n.y, n.z + 1.75);
                label('lbl', `${mark ? `<span class="m ${mark === '?' ? 'done' : ''}">${mark}</span>` : ''}${n.def.name}`, x, y);
            } else if (s.kind === 'mob') {
                const m = s.ref;
                const show = g.hero.target === m.id || m.state === 'chase' || m.hp < m.max || ctx.hover?.ref === m;
                if (!show) continue;
                const top = m.def.boss ? 3.2 : m.def.model === 'pirateship' ? 4 : 1.4;
                const [x, y] = view.project(m.body.x, m.body.y, m.body.z + top);
                label(`lbl mob ${m.def.temper !== 'aggressive' ? 'passive' : ''}`, `${m.def.name} · ${m.lvl}<div class="hb"><i style="width:${Math.round((m.hp / m.max) * 100)}%"></i></div>`, x, y);
            }
        }
        // island names when the view is wide
        if (view.zoom > 13) for (const l of gen.labels) { const [x, y] = view.project(l.x, l.y, l.z); label('lbl isl', l.text, x, y); }
        for (let i = used; i < pool.length; i++) if (pool[i].style.display !== 'none') pool[i].style.display = 'none';
        // numbers that float up
        for (const n of ctx.nums) {
            n.t += dt;
            if (!n.el) { n.el = document.createElement('div'); n.el.className = 'num ' + n.kind; n.el.textContent = n.text; layer.appendChild(n.el); n.dx = (Math.random() - 0.5) * 18; }
            const [x, y] = view.project(n.x, n.y, n.z + n.t * 1.1);
            n.el.style.transform = `translate(${(x + n.dx).toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${n.t < 0.12 ? 1 + (0.12 - n.t) * 4 : 1})`;
            n.el.style.opacity = String(Math.max(0, 1 - Math.max(0, n.t - 0.7) / 0.5));
        }
        ctx.nums = ctx.nums.filter((n) => { if (n.t > 1.2) { n.el?.remove(); return false; } return true; });
    };

    // ---------------------------------------------------------- minimap
    const world = gen.world;
    const img = document.createElement('canvas');
    img.width = world.W;
    img.height = world.D;
    {
        const c2 = img.getContext('2d');
        const id = c2.createImageData(world.W, world.D);
        for (let r = 0; r < world.D; r++) for (let c = 0; c < world.W; c++) {
            const q = c - (r - (r & 1)) / 2;
            let k = world.H - 1;
            while (k > 0 && world.get(q, r, k) === M.AIR) k--;
            const m = world.get(q, r, k);
            let col;
            if (m === M.WATER) {
                let d = 0;
                while (k - d > 0 && world.get(q, r, k - d) === M.WATER) d++;
                const t = Math.min(1, d / 7);
                col = [0.58 + (0.14 - 0.58) * t, 0.87 + (0.47 - 0.87) * t, 0.79 + (0.53 - 0.79) * t];
            } else {
                const hex = MAT[m].color ?? 0x888888;
                const sh = 0.72 + Math.min(1, k / 24) * 0.35;
                col = [((hex >> 16) & 255) / 255 * sh, ((hex >> 8) & 255) / 255 * sh, (hex & 255) / 255 * sh];
            }
            const i = ((world.D - 1 - r) * world.W + c) * 4;
            id.data[i] = col[0] * 255;
            id.data[i + 1] = col[1] * 255;
            id.data[i + 2] = col[2] * 255;
            id.data[i + 3] = 255;
        }
        c2.putImageData(id, 0, 0);
    }
    ctx.mapImage = img;
    const mini = $('mini');
    const mc = mini.getContext('2d');
    const drawMini = (g) => {
        const S = mini.width;
        const hb = g.hero.body;
        mc.save();
        mc.clearRect(0, 0, S, S);
        mc.beginPath();
        mc.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
        mc.clip();
        mc.fillStyle = '#3f9fa0';
        mc.fillRect(0, 0, S, S);
        mc.translate(S / 2, S / 2);
        mc.rotate(view.az - Math.PI / 2);
        const sc = 2.2;
        mc.scale(sc, sc);
        // the image has row 0 at the bottom: world y up is image up
        const H = world.D * (Math.sqrt(3) / 2);
        mc.translate(-hb.x, hb.y - H);
        mc.imageSmoothingEnabled = false;
        mc.drawImage(img, 0, 0, world.W, H);
        const P = (x, y) => [x, H - y];
        for (const n of g.npcs) {
            const mk = g.npcMark(n.id);
            const [x, y] = P(n.x, n.y);
            mc.fillStyle = mk === '!' ? '#ffd24a' : mk === '?' ? '#6ff5cf' : '#f3ecda';
            mc.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
        }
        mc.fillStyle = '#d0503f';
        for (const m of g.mobs) if (!m.dead && Math.abs(m.body.x - hb.x) < 40 && Math.abs(m.body.y - hb.y) < 40) { const [x, y] = P(m.body.x, m.body.y); mc.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); }
        if (g.ship && !g.hero.sailing) { const [x, y] = P(g.ship.x, g.ship.y); mc.fillStyle = '#8a6446'; mc.fillRect(x - 1.2, y - 1.2, 2.4, 2.4); }
        const [hx, hy] = P(hb.x, hb.y);
        mc.translate(hx, hy);
        mc.rotate(-(g.hero.face));
        mc.fillStyle = '#23282c';
        mc.beginPath();
        mc.moveTo(2.6, 0);
        mc.lineTo(-1.6, 1.6);
        mc.lineTo(-0.8, 0);
        mc.lineTo(-1.6, -1.6);
        mc.closePath();
        mc.fill();
        mc.restore();
        // the six winds around the rim
        mc.save();
        mc.translate(S / 2, S / 2);
        mc.strokeStyle = '#23282c';
        mc.lineWidth = 2;
        mc.beginPath();
        for (let i = 0; i <= 6; i++) { const a = view.az - Math.PI / 2 - (i * Math.PI) / 3 - Math.PI / 2 + Math.PI / 6; const r = S / 2 - 1; if (i === 0) mc.moveTo(Math.cos(a) * r, Math.sin(a) * r); else mc.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        mc.stroke();
        mc.restore();
    };

    // ---------------------------------------------------------- the loop
    let last = performance.now();
    let acc = 0;
    let slow = 0;
    let fast = 0;
    let miniT = 0;
    let saveT = 0;
    let nodeT = 0;
    const frame = (now) => {
        requestAnimationFrame(frame);
        let dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const g = ctx.game;
        if (ctx.state === 'title' || !g) {
            // the title: drift slowly around the wharf
            const [x, y] = center(gen.start.q, gen.start.r);
            view.az += dt * 0.05;
            view.azTarget = view.az;
            view.zoomTarget = 13;
            view.setDay(0.36 + Math.sin(now / 40000) * 0.05);
            view.update(dt, { x: x - 2, y: y + 6, z: 6 });
            view.U.uCut.value.w = 0;
            view.render();
            return;
        }
        if (ctx.ui.open && ctx.ui.modal) dt *= 1;
        const input = readInput();
        if (ctx.ui.open && ctx.ui.blocking) { input.mx = 0; input.my = 0; input.jump = false; }
        const ev = g.update(dt, input);
        handle(g, ev);
        // finish a walk toward something clicked
        if (ctx.pending) {
            const p = ctx.pending;
            const near = g.nearby().find((n) => n.ref === p.ref || (p.kind === 'ship' && n.kind === 'board'));
            if (near) { g.interact(near); ctx.pending = null; }
            else if (!g.hero.path) ctx.pending = null;
        }
        // hover
        if (ctx.mouse && !touch) {
            const a = pickActor(ctx.mouse[0], ctx.mouse[1]);
            ctx.hover = a;
            cv.style.cursor = a ? (a.kind === 'mob' ? 'crosshair' : 'pointer') : 'default';
        }
        view.setDay(g.day);
        const hb = g.hero.body;
        view.setDynamicLights(view.night > 0.2 ? [{ x: hb.x, y: hb.y, z: hb.z + 1.6, range: 5.5, color: 0xffc070 }] : null);
        view.update(dt, { x: hb.x, y: hb.y, z: g.hero.sailing ? g.ship.z : hb.z });
        const t = g.targetMob();
        view.setTarget(t ? t.body.x : null, t?.body.y, t?.body.z);
        syncActors(g, dt);
        view.render();
        drawLabels(g, dt);
        ctx.ui.hud(dt);
        miniT -= dt;
        if (miniT <= 0) { miniT = 0.15; drawMini(g); }
        nodeT -= dt;
        if (nodeT <= 0) { nodeT = 0.4; for (const n of g.nodes) view.setNode(n.id, n.alive); }
        saveT += dt;
        if (saveT > 20) { saveT = 0; save(); }
        // keep the frame rate: trade resolution for time
        acc = acc * 0.95 + dt * 0.05;
        if (acc > 0.028) { slow++; fast = 0; if (slow > 40) { slow = 0; view.setScale(view.scale - 0.1); } }
        else if (acc < 0.018) { fast++; slow = 0; if (fast > 120) { fast = 0; view.setScale(view.scale + 0.1); } }
    };
    addEventListener('resize', () => view.resize());
    requestAnimationFrame(frame);
}
