// Six Winds simulation: the hero, creatures, combat, skills and classes, quests,
// professions, crafting, the ship. No drawing here; the page reads the state and
// the events each frame.

import { Body, stepBody, respawn } from './physics.js';
import { center, hexAt, LAYER, DIRS, mulberry32, disk } from './hex.js';
import { M, MAT, nodeKey } from './world.js';
import {
    CLASSES, SKILLS, ITEMS, MONSTERS, monsterStats, NPCS, SHOPS, QUESTS, NODES, FISH, RECIPES, PROFS, XP_TO, ISLANDS,
} from './data.js';
import { derive, damage, missChance, critChance, v, apFor, tpFor, MAX_SKILL, FIRST_CLASS_LEVEL } from './rules.js';

// the generator adds people and errands of its own; they join the shared tables
export function adoptWorld(gen) {
    Object.assign(NPCS, gen.npcDefs ?? {});
    Object.assign(QUESTS, gen.quests ?? {});
    for (const [id, m] of Object.entries(gen.islandMeta ?? {})) {
        if (ISLANDS[id]) continue;
        ISLANDS[id] = { name: m.name, lvl: m.lvl ? `${m.lvl[0]}–${m.lvl[1]}` : '?', desc: '' };
    }
}

export const INV_SIZE = 30;
export const SAVE_KEY = 'sixwinds-save-2';
const DAY_LENGTH = 720; // seconds for a whole day
const ACTIVE = 42; // creatures farther than this from the hero sleep
const STARTER = { swordsman: 'boarding_saber', hunter: 'short_bow', explorer: 'tide_rod', herbalist: 'herb_censer', champion: 'cleaver', crusader: 'twin_dirks', sharpshooter: 'musket', voyager: 'storm_staff', cleric: 'pearl_staff', sealmaster: 'pearl_staff' };
const ACTIVE_KINDS = ['melee', 'ranged', 'magic', 'aoe', 'area', 'buff', 'heal', 'spring', 'dash', 'back'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.8);

export class Game {
    constructor(gen, opts = {}) {
        this.gen = gen;
        this.w = gen.world;
        adoptWorld(gen);
        this.rng = mulberry32(opts.seed ?? 11);
        this.ev = [];
        this.time = 0;
        this.day = 0.3;
        this.uid = 1;
        const [sx, sy] = center(gen.start.q, gen.start.r);
        this.home = { x: sx, y: sy, z: gen.start.h * LAYER, island: 'wharf' };
        this.hero = this.newHero(sx, sy, gen.start.h * LAYER);
        this.npcs = gen.npcs.map((n) => {
            const [x, y] = center(n.q, n.r);
            return { ...n, def: NPCS[n.id], x, y, z: n.h * LAYER, face: (n.face * Math.PI) / 3 };
        });
        this.npcById = Object.fromEntries(this.npcs.map((n) => [n.id, n]));
        this.nodes = gen.nodes.map((n) => {
            const [x, y] = center(n.q, n.r);
            return { ...n, def: NODES[n.kind], x, y, z: n.h * LAYER, alive: true, back: 0 };
        });
        this.stations = gen.stations.map((s) => { const [x, y] = center(s.q, s.r); return { ...s, x, y, z: s.h * LAYER }; });
        this.docks = gen.docks.map((d) => {
            const [x, y] = center(d.q, d.r);
            const [lx, ly] = center(d.land[0], d.land[1]);
            return { ...d, x, y, lx, ly, lz: d.land[2] * LAYER };
        });
        this.islands = Object.entries(gen.islands).map(([id, i]) => ({ id, ...i }));
        this.mobs = [];
        this.drops = [];
        this.shots = [];
        this.ship = null;
        this.springs = [];
        this.frameNo = 0;
        this.spawnAll();
        if (opts.save) this.load(opts.save);
    }

    newHero(x, y, z) {
        const quests = {};
        for (const [id, q] of Object.entries(QUESTS)) quests[id] = { state: 'locked', n: 0 };
        for (const id of ['crabs', 'classes', 'fish', 'herbs', 'ore', 'salvage', ...(this.gen.questStart ?? [])]) if (quests[id]) quests[id].state = 'available';
        const profs = {};
        for (const id of Object.keys(PROFS)) profs[id] = { lvl: 1, xp: 0, known: id === 'craft' };
        const h = {
            body: new Body(x, y, z), lvl: 1, xp: 0, gold: 25, cls: 'novice', classes: ['novice'],
            base: { str: 5, acc: 5, agi: 5, con: 5, spr: 5, luk: 5 }, points: 4, tp: 0, sk: { strike: 1 },
            equip: { weapon: { id: 'rusty_saber', up: 0 }, armor: { id: 'canvas_jacket', up: 0 }, ring: null },
            inv: [{ id: 'potion_s', n: 3 }], cds: {}, buffs: [], target: null, engaged: false, atkT: 0,
            profs, quests, compass: false, hasShip: false, sailing: false, combat: 99, dead: 0,
            path: null, pathI: 0, act: null, queued: null, walk: 0, attackT: 0, castT: 0, hurt: 0, flash: 0, face: 0,
            kills: {}, visited: { wharf: true }, bar: ['strike', null, null, null, null, null, 'potion_s', 'mana_s'],
        };
        h.hp = this.maxHp(h);
        h.mp = this.maxMp(h);
        return h;
    }

    emit(e) { this.ev.push(e); }
    log(text, kind = 'info') { this.emit({ type: 'log', text, kind }); }

    // ---------------------------------------------------------- derived stats
    // everything the rules compute, cached per frame
    d(h = this.hero) {
        const key = `${this.frameNo}|${h.lvl}|${h.buffs.length}`;
        if (h._d && h._dk === key && !h._dirty) return h._d;
        h._d = derive(h, ITEMS, this.weapon(h));
        h._dk = key;
        h._dirty = false;
        return h._d;
    }

    stat(h, k) { return this.d(h).st[k]; }

    buff(h, k) {
        let t = 0;
        for (const b of h.buffs) if (b.mods?.[k]) t += b.mods[k];
        return t;
    }

    maxHp(h) { return derive(h, ITEMS, this.weapon(h)).maxHp; }
    maxMp(h) { return derive(h, ITEMS, this.weapon(h)).maxSp; }

    weapon(h = this.hero) { const e = h.equip.weapon; return e ? { ...ITEMS[e.id], up: e.up } : { type: 'fist', atk: [2, 3], speed: 1, up: 0 }; }

    // a blow's attack value: a roll between min and max
    power(h = this.hero) { const d = this.d(h); return d.atkMin + this.rng() * (d.atkMax - d.atkMin); }
    magic(h = this.hero) { return this.d(h).matk; }
    defense(h = this.hero) { return this.d(h).def; }
    hitRate(h = this.hero) { return this.d(h).hit; }
    dodge(h = this.hero) { return this.d(h).flee; }
    critRate(h = this.hero) { return this.d(h).crit; }
    range(h = this.hero) { const w = this.weapon(h); return w.range ?? 1.7; }
    interval(h = this.hero) { return this.d(h).aspd; }

    // active skills this hero has learned
    skills(h = this.hero) {
        return Object.entries(h.sk).filter(([id, l]) => l > 0 && SKILLS[id] && ACTIVE_KINDS.includes(SKILLS[id].kind)).map(([id]) => id);
    }

    skillLevel(id, h = this.hero) { return h.sk[id] ?? 0; }

    // can this skill take one more point now? returns a reason or null
    canLearn(id, h = this.hero) {
        const s = SKILLS[id];
        if (!s) return 'Нет такого навыка.';
        if (!h.classes.includes(s.cls)) return `Нужен класс: ${CLASSES[s.cls].name}.`;
        if ((h.sk[id] ?? 0) >= MAX_SKILL) return 'Навык на пределе.';
        for (const [rid, rl] of s.req ?? []) if ((h.sk[rid] ?? 0) < rl) return `Сначала: ${SKILLS[rid].name} ${rl}.`;
        if (h.tp <= 0) return 'Нет очков навыков.';
        return null;
    }

    learnSkill(id) {
        const h = this.hero;
        const why = this.canLearn(id);
        if (why) { this.log(why, 'warn'); return false; }
        h.tp--;
        h.sk[id] = (h.sk[id] ?? 0) + 1;
        h._dirty = true;
        if (h.sk[id] === 1 && ACTIVE_KINDS.includes(SKILLS[id].kind) && !h.bar.includes(id)) {
            const f = h.bar.indexOf(null);
            if (f >= 0) h.bar[f] = id;
        }
        this.emit({ type: 'skillup', id, lvl: h.sk[id] });
        return true;
    }

    // ---------------------------------------------------------- inventory
    count(id) { return this.hero.inv.reduce((s, it) => s + (it.id === id ? it.n : 0), 0); }

    give(id, n = 1, quiet = false) {
        const inv = this.hero.inv;
        const def = ITEMS[id];
        if (!def) return false;
        if (def.stack) {
            const it = inv.find((i) => i.id === id);
            if (it) it.n += n;
            else if (inv.length < INV_SIZE) inv.push({ id, n });
            else { this.log('Сумка полна.', 'warn'); return false; }
        } else {
            for (let i = 0; i < n; i++) {
                if (inv.length >= INV_SIZE) { this.log('Сумка полна.', 'warn'); return false; }
                inv.push({ id, n: 1, up: 0 });
            }
        }
        if (!quiet) this.emit({ type: 'loot', id, n });
        this.refreshQuests();
        return true;
    }

    take(id, n = 1) {
        const inv = this.hero.inv;
        if (this.count(id) < n) return false;
        for (let i = inv.length - 1; i >= 0 && n > 0; i--) {
            if (inv[i].id !== id) continue;
            const k = Math.min(n, inv[i].n);
            inv[i].n -= k;
            n -= k;
            if (inv[i].n <= 0) inv.splice(i, 1);
        }
        return true;
    }

    canEquip(id, h = this.hero) {
        const d = ITEMS[id];
        if (!d || !['weapon', 'armor', 'ring'].includes(d.slot)) return 'Это нельзя надеть.';
        if ((d.lvl ?? 1) > h.lvl) return `Нужен ${d.lvl} уровень.`;
        if (d.slot === 'weapon' && !CLASSES[h.cls].weapons.includes(d.type)) return `${CLASSES[h.cls].name} не владеет таким оружием.`;
        return null;
    }

    equip(index) {
        const h = this.hero;
        const it = h.inv[index];
        if (!it) return;
        const why = this.canEquip(it.id);
        if (why) { this.log(why, 'warn'); return; }
        const slot = ITEMS[it.id].slot;
        const old = h.equip[slot];
        h.equip[slot] = { id: it.id, up: it.up ?? 0 };
        h.inv.splice(index, 1);
        h._dirty = true;
        if (old) h.inv.push({ id: old.id, n: 1, up: old.up });
        h.hp = Math.min(h.hp, this.maxHp(h));
        h.mp = Math.min(h.mp, this.maxMp(h));
        this.emit({ type: 'look' });
        this.log(`Надето: ${ITEMS[it.id].name}.`);
    }

    unequip(slot) {
        const h = this.hero;
        const e = h.equip[slot];
        if (!e || h.inv.length >= INV_SIZE) return;
        h.inv.push({ id: e.id, n: 1, up: e.up });
        h.equip[slot] = null;
        h._dirty = true;
        h.hp = Math.min(h.hp, this.maxHp(h));
        h.mp = Math.min(h.mp, this.maxMp(h));
        this.emit({ type: 'look' });
    }

    use(id) {
        const h = this.hero;
        if (h.dead) return;
        const d = ITEMS[id];
        if (!d || d.slot !== 'use' || this.count(id) < 1) return;
        if ((h.cds['item:' + id] ?? 0) > 0) return;
        if (d.heal) { h.hp = Math.min(this.maxHp(h), h.hp + d.heal); this.emit({ type: 'fx', kind: 'heal', x: h.body.x, y: h.body.y, z: h.body.z + 0.5 }); this.emit({ type: 'num', x: h.body.x, y: h.body.y, z: h.body.z + 1.6, text: '+' + d.heal, kind: 'heal' }); }
        if (d.mana) h.mp = Math.min(this.maxMp(h), h.mp + d.mana);
        if (d.food) {
            h.buffs = h.buffs.filter((b) => b.id !== 'food');
            h.buffs.push({ id: 'food', t: d.food.dur, name: d.name, mods: { atkPct: d.food.atk ?? 0, hpRegen: d.food.regen ?? 0 } });
            h._dirty = true;
        }
        if (d.hull) {
            if (!this.ship) { this.log('Нечего чинить.', 'warn'); return; }
            this.ship.hull = Math.min(this.ship.max, this.ship.hull + d.hull);
        }
        h.cds['item:' + id] = d.food ? 1 : 2;
        this.take(id, 1);
    }

    buy(id) {
        const d = ITEMS[id];
        const h = this.hero;
        if (h.gold < d.price) { this.log('Не хватает золота.', 'warn'); return false; }
        if (!this.give(id, 1, true)) return false;
        h.gold -= d.price;
        this.emit({ type: 'coin' });
        return true;
    }

    sellPrice(it) { return Math.max(1, Math.floor((ITEMS[it.id].price ?? 0) * 0.4)); }

    sell(index) {
        const h = this.hero;
        const it = h.inv[index];
        if (!it || ITEMS[it.id].slot === 'quest') return;
        h.gold += this.sellPrice(it);
        if (it.n > 1) it.n--;
        else h.inv.splice(index, 1);
        this.emit({ type: 'coin' });
    }

    // ---------------------------------------------------------- stats and levels
    addPoint(k) {
        const h = this.hero;
        if (h.points <= 0 || !(k in h.base)) return;
        h.points--;
        h.base[k]++;
        h._dirty = true;
    }

    // spend the free points the way the class leans
    autoPoints() {
        const h = this.hero;
        const keys = CLASSES[h.cls].hint ?? ['con', 'str'];
        let i = 0;
        while (h.points > 0) { h.base[keys[i % 3 === 2 ? 1 : 0]]++; h.points--; i++; }
        h._dirty = true;
    }

    gainXp(n) {
        const h = this.hero;
        h.xp += n;
        this.emit({ type: 'xp', n });
        while (h.xp >= XP_TO(h.lvl)) {
            h.xp -= XP_TO(h.lvl);
            h.lvl++;
            const ap = apFor(h.lvl);
            const tp = tpFor(h.lvl);
            h.points += ap;
            h.tp += tp;
            h._dirty = true;
            h.hp = this.maxHp(h);
            h.mp = this.maxMp(h);
            this.emit({ type: 'level', lvl: h.lvl });
            this.emit({ type: 'fx', kind: 'level', x: h.body.x, y: h.body.y, z: h.body.z });
            this.log(`Уровень ${h.lvl}! Очки характеристик +${ap}${tp ? `, очки навыков +${tp}` : ''}.`, 'good');
            const cl = CLASSES[h.cls];
            if (cl.next && h.lvl === cl.nextLevel) this.log(`Открыт выбор пути: ${cl.next.map((c) => CLASSES[c].name).join(', ')}.`, 'quest');
        }
        this.refreshQuests();
    }

    profXp(p, n) {
        const pr = this.hero.profs[p];
        pr.xp += n;
        while (pr.xp >= pr.lvl * 40 && pr.lvl < 10) {
            pr.xp -= pr.lvl * 40;
            pr.lvl++;
            this.log(`${PROFS[p].name}: уровень ${pr.lvl}.`, 'good');
            this.emit({ type: 'prof', p, lvl: pr.lvl });
        }
    }

    chooseClass(id) {
        const h = this.hero;
        const cur = CLASSES[h.cls];
        if (!cur.next?.includes(id) || h.lvl < cur.nextLevel) return false;
        h.cls = id;
        h.classes.push(id);
        h._dirty = true;
        const w = STARTER[id];
        if (w) {
            this.give(w, 1, true);
            const idx = h.inv.findIndex((i) => i.id === w);
            if (idx >= 0 && !this.canEquip(w)) this.equip(idx);
        }
        // a first point in the class's opening skill, as a welcome
        const first = CLASSES[id].skills.find((sid) => !(SKILLS[sid].req?.length));
        if (first && !h.sk[first]) { h.sk[first] = 1; if (ACTIVE_KINDS.includes(SKILLS[first].kind)) { const f = h.bar.indexOf(null); if (f >= 0) h.bar[f] = first; } }
        this.emit({ type: 'class', cls: id });
        this.emit({ type: 'look' });
        this.emit({ type: 'fx', kind: 'level', x: h.body.x, y: h.body.y, z: h.body.z });
        this.log(`Теперь ты — ${CLASSES[id].name}. Навыки класса ждут очков в окне навыков (K).`, 'good');
        return true;
    }

    // ---------------------------------------------------------- quests
    questState(id) { return this.hero.quests[id]; }

    // who takes this quest back
    turnInNpc(id) {
        const q = QUESTS[id];
        return q.type === 'deliver' || q.type === 'talk' ? q.to : q.giver;
    }

    questDone(id) {
        const q = QUESTS[id];
        const s = this.hero.quests[id];
        if (s.state !== 'active' && s.state !== 'ready') return false;
        if (q.type === 'kill') return s.n >= q.count;
        if (q.type === 'gather') return this.count(q.item) >= q.count;
        if (q.type === 'deliver') return this.count(q.item) >= 1;
        if (q.type === 'level') return this.hero.lvl >= q.count;
        return true;
    }

    refreshQuests() {
        for (const id of Object.keys(QUESTS)) {
            const s = this.hero.quests[id];
            if (s.state === 'active' && this.questDone(id)) { s.state = 'ready'; this.emit({ type: 'quest', id, state: 'ready' }); }
            else if (s.state === 'ready' && !this.questDone(id)) s.state = 'active';
        }
    }

    // quests an NPC offers or takes
    npcQuests(npcId) {
        const out = [];
        for (const [id, q] of Object.entries(QUESTS)) {
            const s = this.hero.quests[id];
            if (q.giver === npcId && s.state === 'available') out.push({ id, act: 'offer' });
            if (this.turnInNpc(id) === npcId && s.state === 'ready') out.push({ id, act: 'finish' });
            else if (q.giver === npcId && s.state === 'active') out.push({ id, act: 'progress' });
        }
        return out;
    }

    npcMark(npcId) {
        const qs = this.npcQuests(npcId);
        if (qs.some((q) => q.act === 'finish')) return '?';
        if (qs.some((q) => q.act === 'offer')) return '!';
        return '';
    }

    accept(id) {
        const s = this.hero.quests[id];
        if (s.state !== 'available') return;
        const q = QUESTS[id];
        s.state = 'active';
        s.n = 0;
        for (const [it, n] of q.give ?? []) this.give(it, n, true);
        this.log(`Задание: ${q.name}.`, 'quest');
        this.emit({ type: 'quest', id, state: 'active' });
        this.refreshQuests();
    }

    finish(id) {
        const s = this.hero.quests[id];
        const q = QUESTS[id];
        this.refreshQuests();
        if (s.state !== 'ready') return false;
        if (q.type === 'gather') this.take(q.item, q.count);
        if (q.type === 'deliver') this.take(q.item, 1);
        s.state = 'done';
        const r = q.reward;
        this.hero.gold += r.gold ?? 0;
        for (const [it, n] of r.items ?? []) this.give(it, n);
        if (r.compass) { this.hero.compass = true; this.log('Шестигранный компас: теперь у тебя есть карта (M).', 'good'); }
        if (r.ship) { this.hero.hasShip = true; this.placeShip(this.docks.find((d) => d.island === 'wharf')); this.log('Шлюп ждёт у конца главного пирса. Подойди и поднимись на борт.', 'good'); }
        if (r.prof) { this.hero.profs[r.prof[0]].known = true; this.profXp(r.prof[0], r.prof[1]); }
        if (q.next && this.hero.quests[q.next].state === 'locked') this.hero.quests[q.next].state = 'available';
        this.log(`Задание выполнено: ${q.name}.`, 'quest');
        this.emit({ type: 'quest', id, state: 'done' });
        if (r.xp) this.gainXp(r.xp);
        if (r.classChoice || r.classChoice2) this.emit({ type: 'classChoice' });
        this.refreshQuests();
        return true;
    }

    // talking to an NPC counts for talk quests aimed at them
    talk(npcId) {
        this.refreshQuests();
        this.emit({ type: 'talk', id: npcId });
    }

    // ---------------------------------------------------------- creatures
    spawnAll() {
        const w = this.w;
        this.spawnCells = this.gen.spawns.map((s) => {
            const cells = [];
            const [cq, cr] = hexAt(s.x, s.y);
            for (const [q, r] of disk(cq, cr, Math.ceil(s.radius / 0.87))) {
                const [x, y] = center(q, r);
                if (Math.hypot(x - s.x, y - s.y) > s.radius + 0.5) continue;
                if (s.sea) {
                    if (this.navigable(x, y)) cells.push([x, y, w.sea * LAYER]);
                    continue;
                }
                const h = w.surface(q, r);
                if (!w.node(q, r, h)) continue;
                const set = this.gen.reach?.[s.island];
                if (set && !set.has(((h * 8192 + (r + 4096)) * 8192) + (q + 4096))) continue;
                if (s.onDeck && w.get(q, r, h - 1) !== M.WOOD) continue;
                if (s.minH && h < s.minH) continue;
                cells.push([x, y, h * LAYER]);
            }
            return cells;
        });
        this.gen.spawns.forEach((s, i) => {
            for (let k = 0; k < s.count; k++) this.spawnMob(s, i);
        });
    }

    spawnMob(s, si, old) {
        const cells = this.spawnCells[si];
        if (!cells.length) return null;
        const c = cells[Math.floor(this.rng() * cells.length)];
        const lvl = s.lvl[0] + Math.floor(this.rng() * (s.lvl[1] - s.lvl[0] + 1));
        const def = MONSTERS[s.kind];
        const st = monsterStats(s.kind, lvl);
        const m = old ?? { id: this.uid++ };
        Object.assign(m, {
            kind: s.kind, def, lvl, st, hp: st.hp, max: st.hp, spawn: si, home: { x: c[0], y: c[1], z: c[2] },
            state: 'idle', target: null, atkT: 1, stun: 0, root: 0, disarm: 0, debuffs: [], dots: [], hurt: 0, flash: 0, attackT: 0,
            wait: this.rng() * 4, goal: null, stuck: 0, path: null, dead: 0, fleeT: 0, walk: 0, speed: 0, slamT: 6, face: this.rng() * 6.28,
        });
        m.body = new Body(c[0], c[1], c[2]);
        m.body.speedMul = def.speed / 4.6;
        m.baseSpeed = m.body.speedMul;
        m.sea = !!def.sea;
        if (!old) this.mobs.push(m);
        return m;
    }

    mobModel(m) {
        if (m.def.model === 'pirateship') return { type: 'ship', opts: { hull: 0x2a2a30, sail: 0x3a3a40, flag: 0x111111 }, scale: 0.9 };
        return { type: 'creature', kind: m.kind, def: m.def, scale: m.def.boss ? 1.4 : 1 };
    }

    // ---------------------------------------------------------- sea
    navigable(x, y) {
        const w = this.w;
        const [q, r] = hexAt(x, y);
        if (!w.inside(q, r)) return false;
        return w.get(q, r, w.sea - 1) === M.WATER && !w.solid(q, r, w.sea) && !w.solid(q, r, w.sea + 1);
    }

    placeShip(dock) {
        const z = this.w.sea * LAYER - 0.15;
        let x = dock.x;
        let y = dock.y;
        if (!this.navigable(x, y)) {
            const [q, r] = hexAt(x, y);
            for (const [a, b] of disk(q, r, 4)) { const [cx, cy] = center(a, b); if (this.navigable(cx, cy)) { x = cx; y = cy; break; } }
        }
        this.ship = { x, y, z, face: Math.atan2(dock.y - dock.ly, dock.x - dock.lx), v: 0, hull: this.ship?.hull ?? 220, max: 220, atkT: 0 };
    }

    // ---------------------------------------------------------- orders from the player
    setTarget(m, engage = false) {
        const h = this.hero;
        h.target = m ? m.id : null;
        h.engaged = !!m && engage;
        if (m) h.path = null;
    }

    targetMob() { return this.mobs.find((m) => m.id === this.hero.target && !m.dead) ?? null; }

    // the nearest enemy in front, for Tab
    cycleTarget() {
        const h = this.hero;
        const list = this.mobs.filter((m) => !m.dead && d2(m.body, h.body) < 14).sort((a, b) => d2(a.body, h.body) - d2(b.body, h.body));
        if (!list.length) { this.setTarget(null); return null; }
        const i = list.findIndex((m) => m.id === h.target);
        const m = list[(i + 1) % list.length];
        this.setTarget(m);
        return m;
    }

    // walk to a hex along the walk graph
    moveTo(q, r, h) {
        const hero = this.hero;
        if (hero.sailing || hero.dead) return false;
        const w = this.w;
        let goal = w.node(q, r, h) ?? w.node(q, r, h + 1) ?? w.node(q, r, h - 1);
        if (!goal) return false;
        const start = w.nodeAt(hero.body.x, hero.body.y, hero.body.z);
        if (!start) { hero.path = [goal]; hero.pathI = 0; return true; }
        const p = w.path(start, goal, { hop: true }, 160);
        if (!p) return false;
        hero.path = p.length > 1 ? p.slice(1) : null;
        hero.pathI = 0;
        hero.engaged = false;
        this.cancelAct();
        return true;
    }

    cancelAct() {
        const h = this.hero;
        if (h.act) { h.act = null; this.emit({ type: 'act', state: 'cancel' }); }
    }

    // what the hero could interact with right now: [{kind, ref, dist, label}]
    nearby() {
        const h = this.hero;
        const b = h.body;
        const out = [];
        if (h.sailing) {
            const land = this.landingSpot();
            if (land) out.push({ kind: 'land', ref: land, dist: 0, label: 'Сойти на берег' });
            for (const n of this.nodes) if (n.kind === 'fishspot' && n.alive && d2(n, this.ship) < 3.2) out.push({ kind: 'fish', ref: n, dist: d2(n, this.ship), label: 'Рыбачить с борта' });
            return out.sort((a, c) => a.dist - c.dist);
        }
        for (const n of this.npcs) { const d = d3(n, b); if (d < 2.4) out.push({ kind: 'npc', ref: n, dist: d, label: `Говорить: ${n.def.name}` }); }
        for (const n of this.nodes) {
            if (!n.alive) continue;
            const d = n.kind === 'fishspot' ? d2(n, b) : d3(n, b);
            if (d < (n.kind === 'fishspot' ? 2.3 : 1.7)) out.push({ kind: n.kind === 'fishspot' ? 'fish' : 'node', ref: n, dist: d, label: `${PROFS[n.def.prof].name}: ${n.def.name}` });
        }
        for (const s of this.stations) { const d = d3(s, b); if (d < 2.3) out.push({ kind: 'station', ref: s, dist: d + 0.5, label: 'Мастерить' }); }
        if (this.ship && d2(this.ship, b) < 3.2 && Math.abs(b.z - this.ship.z) < 3) out.push({ kind: 'board', ref: this.ship, dist: d2(this.ship, b), label: 'Подняться на борт' });
        for (const d of this.drops) { const dd = d3(d, b); if (dd < 1.6) out.push({ kind: 'drop', ref: d, dist: dd, label: 'Подобрать' }); }
        return out.sort((a, c) => a.dist - c.dist);
    }

    interact(it) {
        const h = this.hero;
        if (!it || h.dead) return;
        if (it.kind === 'npc') { this.talk(it.ref.id); return; }
        if (it.kind === 'node') this.startGather(it.ref);
        if (it.kind === 'fish') this.startFishing(it.ref);
        if (it.kind === 'station') this.emit({ type: 'station', kind: it.ref.kind });
        if (it.kind === 'board') this.board();
        if (it.kind === 'land') this.disembark(it.ref);
        if (it.kind === 'drop') this.pickup(it.ref);
    }

    // ---------------------------------------------------------- professions
    startGather(n) {
        const h = this.hero;
        const pr = h.profs[n.def.prof];
        if (!pr.known) { this.log(`Сначала научись у мастера: ${PROFS[n.def.prof].name}.`, 'warn'); return; }
        if ((n.def.lvl ?? 1) > pr.lvl) { this.log(`Нужен ${n.def.lvl} уровень профессии «${PROFS[n.def.prof].name}».`, 'warn'); return; }
        const t = n.def.time / (1 + (pr.lvl - 1) * 0.08);
        h.act = { type: 'gather', node: n, t: 0, total: t };
        h.path = null;
        h.engaged = false;
        this.emit({ type: 'act', state: 'start', total: t, label: n.def.name });
    }

    startFishing(n) {
        const h = this.hero;
        if (!h.profs.fishing.known) { this.log('Рыбачить учит Рыбак Сом на северном пирсе.', 'warn'); return; }
        h.act = { type: 'fish', node: n, t: 0, wait: 1.8 + this.rng() * 3.5, bite: 0 };
        h.path = null;
        h.engaged = false;
        this.emit({ type: 'act', state: 'fish' });
    }

    // the player's reaction to a bite
    hook() {
        const h = this.hero;
        const a = h.act;
        if (!a || a.type !== 'fish') return;
        if (a.bite > 0) {
            const lvl = h.profs.fishing.lvl;
            const pool = FISH.filter(([, need]) => lvl >= need);
            const total = pool.reduce((s, f) => s + f[2], 0);
            let r = this.rng() * total;
            let fish = pool[0][0];
            for (const [id, , wgt] of pool) { r -= wgt; if (r <= 0) { fish = id; break; } }
            this.give(fish, 1);
            this.profXp('fishing', 10 + FISH.findIndex((f) => f[0] === fish) * 6);
            this.emit({ type: 'fx', kind: 'splash', x: a.node.x, y: a.node.y, z: a.node.z });
            this.log(`Поймано: ${ITEMS[fish].name}.`, 'good');
            if (this.rng() < 0.25) { a.node.alive = false; a.node.back = NODES.fishspot.respawn; }
        } else this.log('Рано! Рыба ушла.', 'warn');
        h.act = null;
        this.emit({ type: 'act', state: 'done' });
    }

    craft(id) {
        const r = RECIPES[id];
        const h = this.hero;
        if (!r) return false;
        if (!this.stations.some((s) => s.kind === r.station && d3(s, h.body) < 3)) { this.log('Нужна мастерская рядом.', 'warn'); return false; }
        if (h.profs.craft.lvl < r.lvl) { this.log(`Нужен ${r.lvl} уровень ремесла.`, 'warn'); return false; }
        for (const [it, n] of r.needs) if (this.count(it) < n) { this.log(`Не хватает: ${ITEMS[it].name}.`, 'warn'); return false; }
        for (const [it, n] of r.needs) this.take(it, n);
        this.give(id, r.out);
        this.profXp('craft', 12 + r.lvl * 4);
        this.emit({ type: 'fx', kind: 'gather', x: h.body.x, y: h.body.y, z: h.body.z + 0.8, color: 0xffd24a });
        return true;
    }

    // sharpen a weapon or rivet armour at the forge
    upgrade(slot) {
        const h = this.hero;
        const e = h.equip[slot];
        if (!e) return false;
        if (!this.stations.some((s) => s.kind === 'forge' && d3(s, h.body) < 3)) { this.log('Нужна кузня.', 'warn'); return false; }
        const mat = slot === 'weapon' ? 'whetstone' : 'plate';
        if (e.up >= 5) { this.log('Лучше уже не сделать.', 'warn'); return false; }
        if (!this.take(mat, 1)) { this.log(`Нужен ${ITEMS[mat].name}.`, 'warn'); return false; }
        const chance = [1, 1, 1, 0.75, 0.55][e.up];
        if (this.rng() < chance) { e.up++; this.log(`${ITEMS[e.id].name} +${e.up}!`, 'good'); this.emit({ type: 'fx', kind: 'crit', x: h.body.x, y: h.body.y, z: h.body.z + 1 }); return true; }
        this.log('Не вышло. Материал потерян.', 'warn');
        return false;
    }

    learn(p) {
        const pr = this.hero.profs[p];
        if (pr.known) return;
        pr.known = true;
        this.log(`Ты освоил профессию «${PROFS[p].name}».`, 'good');
        this.emit({ type: 'prof', p, lvl: 1 });
    }

    // ---------------------------------------------------------- ship
    board() {
        const h = this.hero;
        if (!this.ship) return;
        h.sailing = true;
        h.path = null;
        h.engaged = false;
        this.cancelAct();
        this.log('Паруса подняты. Веди шлюп стрелками или WASD.', 'info');
        this.emit({ type: 'sail', on: true });
    }

    // a standable hex next to the ship
    landingSpot() {
        const s = this.ship;
        if (!s) return null;
        const w = this.w;
        const [q, r] = hexAt(s.x, s.y);
        let best = null;
        for (const [a, b] of disk(q, r, 4)) {
            const [x, y] = center(a, b);
            const d = Math.hypot(x - s.x, y - s.y);
            if (d > 3.6) continue;
            const hh = w.surface(a, b);
            if (hh > w.sea + 5 || !w.node(a, b, hh)) continue;
            if (!best || d < best.d) best = { q: a, r: b, h: hh, x, y, z: hh * LAYER, d };
        }
        return best;
    }

    disembark(spot) {
        const h = this.hero;
        spot = spot ?? this.landingSpot();
        if (!spot) return;
        h.sailing = false;
        Object.assign(h.body, { x: spot.x, y: spot.y, z: spot.z, vx: 0, vy: 0, vz: 0, fallTop: spot.z });
        this.ship.v = 0;
        // the island you land on becomes home for respawns
        const isl = this.islandAt(spot.x, spot.y);
        if (isl) {
            if (!h.visited[isl.id]) this.emit({ type: 'island', id: isl.id });
            h.visited[isl.id] = true;
            const dock = this.docks.find((d) => d.island === isl.id);
            if (dock) this.home = { x: dock.lx, y: dock.ly, z: dock.lz, island: isl.id };
        }
        this.emit({ type: 'sail', on: false });
    }

    islandAt(x, y) {
        let best = null;
        for (const i of this.islands) { const d = Math.hypot(x - i.x, y - i.y) - i.r; if (d < 16 && (!best || d < best.d)) best = { i, d }; }
        return best?.i ?? null;
    }

    sail(dt, input) {
        const s = this.ship;
        const h = this.hero;
        const want = Math.hypot(input.mx ?? 0, input.my ?? 0);
        const max = 7.5 * (1 + this.d(h).shipSpeed);
        if (want > 0.1) {
            const a = Math.atan2(input.my, input.mx);
            let d = a - s.face;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            s.face += clamp(d, -dt * 2.4, dt * 2.4);
            s.v += (max * Math.min(1, want) * (Math.abs(d) < 1.2 ? 1 : 0.3) - s.v) * Math.min(1, dt * 1.2);
        } else s.v *= Math.exp(-dt * 0.9);
        const nx = s.x + Math.cos(s.face) * s.v * dt;
        const ny = s.y + Math.sin(s.face) * s.v * dt;
        const probe = (x, y) => this.navigable(x, y) && this.navigable(x + Math.cos(s.face) * 0.9, y + Math.sin(s.face) * 0.9);
        if (probe(nx, ny)) { s.x = nx; s.y = ny; }
        else if (probe(nx, s.y)) { s.x = nx; s.v *= 0.7; }
        else if (probe(s.x, ny)) { s.y = ny; s.v *= 0.7; }
        else { if (s.v > 3) this.emit({ type: 'bump' }); s.v *= -0.2; }
        s.z = this.w.sea * LAYER - 0.15;
        const b = h.body;
        b.x = s.x - Math.cos(s.face) * 0.6;
        b.y = s.y - Math.sin(s.face) * 0.6;
        b.z = s.z + 0.42;
        b.vx = b.vy = b.vz = 0;
        h.face = s.face;
        // cannon at the target
        s.atkT -= dt;
        const t = this.targetMob();
        if (t && h.engaged && s.atkT <= 0 && d2(t.body, s) < 10) {
            s.atkT = 1.6;
            // cannons: the ship's own weight of shot, a little of the captain's arm
            const d = this.d(h);
            const power = (16 + h.lvl * 4) * (1 + d.mod.atkPct) + (d.atkMin + d.atkMax) * 0.15;
            this.fire({ x: s.x, y: s.y, z: s.z + 0.8 }, t, 0, 'ball', 'hero', { onHit: (m) => this.damageMob(m, this.cannon(m, power)) });
            this.emit({ type: 'fx', kind: 'dust', x: s.x, y: s.y, z: s.z + 0.8 });
        }
    }

    // a cannonball: sure to hit, armour counts, no crits
    cannon(m, power) {
        return { dmg: damage(power * (0.9 + this.rng() * 0.2), m.st.def, 0, this.hero.lvl, m.lvl) };
    }

    shipHit(dmg) {
        const s = this.ship;
        dmg = Math.max(1, Math.round(dmg * (1 - Math.min(0.6, this.d().shipDef))));
        s.hull -= dmg;
        this.emit({ type: 'num', x: s.x, y: s.y, z: s.z + 2, text: '-' + Math.round(dmg), kind: 'ship' });
        if (s.hull <= 0) {
            this.log('Шлюп пошёл ко дну! Тебя вынесло на берег, а корабел Томас поднял судно.', 'bad');
            const dock = this.docks.find((d) => d.island === this.home.island) ?? this.docks[0];
            this.hero.sailing = false;
            this.placeShip(dock);
            this.ship.hull = Math.round(this.ship.max * 0.3);
            this.respawnHero();
            this.emit({ type: 'sail', on: false });
        }
    }

    // ---------------------------------------------------------- combat
    // the sum of one kind of debuff on a creature
    mobMod(m, k) {
        let t = 0;
        for (const d of m.debuffs) if (d.mods[k]) t += d.mods[k];
        return t;
    }

    // slows do not stack: the strongest wins
    mobSlow(m) {
        let s = 1;
        for (const d of m.debuffs) if (d.mods.slow) s = Math.min(s, d.mods.slow);
        return s;
    }

    debuffMob(m, id, mods, lvl, dur) {
        const d = { id, t: dur, mods: {} };
        for (const [k, x] of Object.entries(mods)) d.mods[k] = v(x, lvl);
        m.debuffs = m.debuffs.filter((x) => x.id !== id);
        m.debuffs.push(d);
    }

    // one blow from the hero: magic never misses, the rest can
    strike(m, { mult = 1, magic = false, ignoreDef = false } = {}) {
        const h = this.hero;
        // a blow gives away the one who struck it
        if (h.buffs.some((x) => x.mods?.hidden)) { h.buffs = h.buffs.filter((x) => !x.mods?.hidden); h._dirty = true; }
        const d = this.d(h);
        const flee = m.st.flee * Math.max(0, 1 + this.mobMod(m, 'fleePct'));
        if (!magic && this.rng() < missChance(d.hit, flee)) return { miss: true, dmg: 0 };
        const crit = this.rng() < critChance(d.crit, h.lvl, m.lvl);
        const atk = (magic ? d.matk * (0.92 + this.rng() * 0.16) : this.power(h)) * mult * (crit ? 2 : 1);
        const def = ignoreDef ? 0 : m.st.def * Math.max(0, 1 + this.mobMod(m, 'defPct'));
        return { dmg: damage(atk, def, 0, h.lvl, m.lvl), crit };
    }

    // one blow from a creature at the hero
    mobBlow(m) {
        const h = this.hero;
        const d = this.d(h);
        if (this.rng() < missChance(m.st.hit, d.flee)) return { miss: true, dmg: 0 };
        const crit = this.rng() < critChance(m.st.crit, m.lvl, h.lvl);
        const [a, b] = m.st.atk;
        const atk = (a + this.rng() * (b - a)) * Math.max(0.1, 1 + this.mobMod(m, 'atkPct')) * (crit ? 2 : 1);
        return { dmg: damage(atk, d.def, 0, m.lvl, h.lvl), crit };
    }

    damageMob(m, r, src = 'hero') {
        if (m.dead) return;
        const b = m.body;
        if (r.miss) { this.emit({ type: 'num', x: b.x, y: b.y, z: b.z + 1.4, text: 'мимо', kind: 'miss' }); return; }
        m.hp -= r.dmg;
        m.hurt = 0.25;
        m.flash = 0.6;
        this.emit({ type: 'num', x: b.x, y: b.y, z: b.z + 1.4, text: String(r.dmg), kind: r.crit ? 'crit' : src === 'dot' ? 'dot' : 'dmg' });
        if (src !== 'dot') this.emit({ type: 'fx', kind: r.crit ? 'crit' : 'hit', x: b.x, y: b.y, z: b.z + 0.6 });
        if (src === 'hero' || src === 'dot') {
            this.hero.combat = 0;
            if (m.def.temper === 'timid') { m.state = 'flee'; m.fleeT = 3; }
            else if (m.state !== 'chase') { m.state = 'chase'; m.target = 'hero'; }
        }
        if (m.hp <= 0) this.killMob(m);
    }

    killMob(m) {
        const h = this.hero;
        m.hp = 0;
        m.dead = 0.001;
        m.state = 'dead';
        m.back = m.def.boss ? 120 : 25 + this.rng() * 15;
        m.debuffs = [];
        m.dots = [];
        const b = m.body;
        // far weaker creatures teach little; a little stronger ones teach more
        const diff = m.lvl - h.lvl;
        const xp = Math.round(m.st.xp * clamp(1 + diff * 0.1, 0.1, 1.5));
        this.gainXp(xp);
        this.emit({ type: 'num', x: b.x, y: b.y, z: b.z + 2, text: `+${xp} оп`, kind: 'xp' });
        h.kills[m.kind] = (h.kills[m.kind] ?? 0) + 1;
        for (const [id, q] of Object.entries(QUESTS)) {
            const s = h.quests[id];
            if (q.type === 'kill' && q.target === m.kind && (s.state === 'active' || s.state === 'ready') && s.n < q.count) {
                s.n++;
                this.log(`${q.name}: ${s.n}/${q.count}`, 'quest');
            }
        }
        // loot falls to the ground; quest items only drop while the quest needs them; luck widens the odds
        const mf = this.d(h).mf / 100;
        const bag = [];
        for (const [id, p] of m.def.loot) {
            let chance = p * mf;
            if (ITEMS[id].slot === 'quest') {
                const q = Object.entries(QUESTS).find(([qid, qq]) => qq.item === id && ['active', 'ready'].includes(h.quests[qid].state));
                chance = q ? Math.max(p, id === 'chart' ? 0.35 : p) : 0;
            }
            if (this.rng() < chance) bag.push(id);
        }
        const gold = Math.round(m.st.gold * (0.7 + this.rng() * 0.6));
        this.drops.push({ id: this.uid++, x: b.x, y: b.y, z: b.z, items: bag, gold, t: 90 });
        if (h.target === m.id) { h.target = null; h.engaged = false; }
        this.refreshQuests();
    }

    pickup(d) {
        const h = this.hero;
        if (d.gold) { h.gold += d.gold; this.emit({ type: 'num', x: d.x, y: d.y, z: d.z + 1, text: `+${d.gold} з`, kind: 'gold' }); this.emit({ type: 'coin' }); }
        const left = [];
        for (const id of d.items) if (!this.give(id, 1)) left.push(id);
        d.items = left;
        d.gold = 0;
        if (!left.length) this.drops = this.drops.filter((x) => x !== d);
        this.emit({ type: 'fx', kind: 'coin', x: d.x, y: d.y, z: d.z + 0.3 });
    }

    damageHero(dmg, from, crit = false) {
        const h = this.hero;
        if (h.dead) return;
        // a shield takes the blow first, then the spirit takes its share
        const sh = h.buffs.find((b) => b.shield > 0);
        if (sh) { const k = Math.min(sh.shield, dmg); sh.shield -= k; dmg -= k; if (sh.shield <= 0) sh.t = 0; }
        const toSp = this.buff(h, 'dmgToSp');
        if (toSp > 0 && dmg > 0) { const k = Math.min(h.mp, Math.round(dmg * Math.min(0.8, toSp))); h.mp -= k; dmg -= k; }
        dmg = Math.max(0, Math.round(dmg));
        h.hp -= dmg;
        h.combat = 0;
        h.hurt = 0.25;
        h.flash = 0.5;
        this.cancelAct();
        this.emit({ type: 'num', x: h.body.x, y: h.body.y, z: h.body.z + 1.8, text: dmg ? '-' + dmg : 'щит', kind: crit ? 'crit' : 'hurt' });
        this.emit({ type: 'hurt' });
        if (!h.target && from) h.target = from.id;
        // second wind: once, at the edge
        const sw = h.buffs.find((b) => b.mods?.secondWind);
        const mh = this.maxHp(h);
        if (sw && h.hp > 0 && h.hp < mh * 0.2) {
            const n = Math.round(mh * sw.mods.secondWind);
            h.hp = Math.min(mh, h.hp + n);
            sw.t = 0;
            this.emit({ type: 'fx', kind: 'heal', x: h.body.x, y: h.body.y, z: h.body.z + 0.3 });
            this.emit({ type: 'num', x: h.body.x, y: h.body.y, z: h.body.z + 2.2, text: '+' + n, kind: 'heal' });
        }
        if (h.hp <= 0) this.heroDies();
    }

    heroDies() {
        const h = this.hero;
        h.hp = 0;
        h.dead = 3;
        h.engaged = false;
        h.target = null;
        h.path = null;
        h.buffs = [];
        h._dirty = true;
        // from the tenth level a death costs a sliver of the level
        let lost = 0;
        if (h.lvl >= FIRST_CLASS_LEVEL) { lost = Math.min(h.xp, Math.round(XP_TO(h.lvl) * 0.02)); h.xp -= lost; }
        this.log(`Ты пал${lost ? ` и потерял ${lost} оп` : ''}. Ветер вернёт тебя к берегу…`, 'bad');
        this.emit({ type: 'death' });
    }

    respawnHero() {
        const h = this.hero;
        h.dead = 0;
        h.hp = Math.round(this.maxHp(h) * 0.6);
        h.mp = Math.round(this.maxMp(h) * 0.6);
        Object.assign(h.body, { x: this.home.x, y: this.home.y, z: this.home.z, vx: 0, vy: 0, vz: 0, fallTop: this.home.z });
        h.body.safe = [this.home.x, this.home.y, this.home.z];
        for (const m of this.mobs) if (m.target === 'hero') { m.state = 'return'; m.target = null; }
        this.emit({ type: 'respawn' });
    }

    fire(from, target, dmg, kind, side, extra = {}) {
        this.shots.push({ x: from.x, y: from.y, z: from.z, target, dmg, kind, side, speed: kind === 'ball' ? 14 : 16, t: 0, ...extra });
    }

    // ---------------------------------------------------------- skills
    skillCost(id, h = this.hero) { return Math.round(v(SKILLS[id].mp, Math.max(1, h.sk[id] ?? 1))); }

    useSkill(id) {
        const h = this.hero;
        const s = SKILLS[id];
        if (!s || h.dead || !this.skills().includes(id)) return false;
        if ((h.cds[id] ?? 0) > 0) { this.log(`${s.name}: перезарядка.`, 'warn'); return false; }
        if (h.mp < this.skillCost(id)) { this.log('Не хватает духа.', 'warn'); return false; }
        const needsTarget = ['melee', 'ranged', 'magic', 'area', 'dash'].includes(s.kind);
        const t = this.targetMob();
        if (needsTarget && !t) { this.log('Нет цели.', 'warn'); return false; }
        if (needsTarget) {
            const range = s.kind === 'melee' ? s.range + 0.4 : s.range ?? 9;
            if (d2(t.body, h.body) > range) {
                // walk into range, then cast
                h.queued = id;
                h.engaged = true;
                return false;
            }
        }
        this.cast(id, t);
        return true;
    }

    cast(id, t) {
        const h = this.hero;
        const s = SKILLS[id];
        const lvl = Math.max(1, h.sk[id] ?? 1);
        const b = h.body;
        h.mp -= this.skillCost(id);
        h.cds[id] = s.cd;
        h.queued = null;
        h.castT = 0.4;
        h.combat = Math.min(h.combat, 0);
        if (t) h.face = Math.atan2(t.body.y - b.y, t.body.x - b.x);
        const magic = s.kind === 'magic' || !!s.magic;
        const mult = v(s.mult, lvl);
        const opt = { mult: mult || 1, magic, ignoreDef: !!s.ignoreDef };
        const at = { x: b.x, y: b.y, z: b.z + 0.9 };
        this.emit({ type: 'skill', id, x: b.x, y: b.y, z: b.z, tx: t?.body.x, ty: t?.body.y, tz: t?.body.z });
        // what a hit does: the blow, then the effects that ride on it
        const apply = (m, hits = 1) => {
            if (m.dead) return;
            let r = { dmg: 0 };
            if (mult > 0) {
                for (let i = 0; i < hits && !m.dead; i++) { r = this.strike(m, opt); this.damageMob(m, r); }
            } else if (m.state !== 'chase' && m.def.temper !== 'timid') { m.state = 'chase'; m.target = 'hero'; }
            if (r.miss || m.dead) return;
            if (s.stun) m.stun = Math.max(m.stun, v(s.stun, lvl));
            if (s.root) m.root = Math.max(m.root, v(s.root, lvl));
            if (s.disarm) m.disarm = Math.max(m.disarm, v(s.disarm, lvl));
            if (s.debuff) this.debuffMob(m, id, s.debuff, lvl, v(s.dur, lvl) || 6);
            if (s.dot) {
                const base = magic ? this.magic() : this.power();
                const tick = damage(base * v(s.dot, lvl), m.st.def * 0.5, 0, h.lvl, m.lvl);
                m.dots = m.dots.filter((d) => d.id !== id);
                m.dots.push({ id, dmg: tick, n: s.ticks ?? 5, t: 1 });
            }
            if (s.taunt) { m.state = 'chase'; m.target = 'hero'; m.atkT = Math.min(m.atkT, 0.4); }
        };
        switch (s.kind) {
            case 'melee': h.attackT = 0.35; apply(t, s.hits ?? 1); break;
            case 'ranged':
                for (let i = 0; i < (s.hits ?? 1); i++) this.fire(at, t, 0, s.proj ?? 'arrow', 'hero', { delay: i * 0.14, onHit: (m) => apply(m) });
                break;
            case 'magic': this.fire(at, t, 0, s.proj ?? 'bolt', 'hero', { onHit: (m) => apply(m) }); break;
            case 'aoe':
                h.attackT = 0.35;
                for (const m of this.mobs) if (!m.dead && d2(m.body, b) < s.radius && Math.abs(m.body.z - b.z) < 2.5) apply(m);
                this.emit({ type: 'fx', kind: 'ring', x: b.x, y: b.y, z: b.z + 0.1, r: s.radius, color: s.fx === 'fog' ? 0xd8e4e0 : magic ? 0x8fd8ff : 0xffffff });
                break;
            case 'area': {
                const c = { x: t.body.x, y: t.body.y, z: t.body.z };
                this.emit({ type: 'fx', kind: 'ring', x: c.x, y: c.y, z: c.z + 0.1, r: s.radius, color: magic ? 0x8fd8ff : 0xffd24a });
                for (const m of this.mobs) if (!m.dead && d2(m.body, c) < s.radius && Math.abs(m.body.z - c.z) < 3) apply(m);
                break;
            }
            case 'buff': {
                const buff = { id, t: v(s.dur, lvl), name: s.name, mods: {} };
                for (const [k, x] of Object.entries(s.mods)) {
                    if (k === 'shield') buff.shield = Math.round(v(x, lvl) + this.stat(h, 'spr') * (s.shieldSpr ?? 0));
                    else buff.mods[k] = v(x, lvl);
                }
                h.buffs = h.buffs.filter((x) => x.id !== id);
                h.buffs.push(buff);
                h._dirty = true;
                this.emit({ type: 'fx', kind: s.fx === 'heal' ? 'heal' : 'magic', x: b.x, y: b.y, z: b.z + 0.6, color: 0xffd24a });
                if (buff.mods.hidden) for (const m of this.mobs) if (m.target === 'hero') { m.state = 'return'; m.target = null; }
                break;
            }
            case 'heal': {
                const n = Math.round(v(s.heal, lvl) + this.stat(h, 'spr') * (s.healSpr ?? 0));
                h.hp = Math.min(this.maxHp(h), h.hp + n);
                this.emit({ type: 'fx', kind: 'heal', x: b.x, y: b.y, z: b.z + 0.3 });
                this.emit({ type: 'num', x: b.x, y: b.y, z: b.z + 1.8, text: '+' + n, kind: 'heal' });
                break;
            }
            case 'spring': {
                const n = Math.round(v(s.heal, lvl) + this.stat(h, 'spr') * (s.healSpr ?? 0));
                this.springs.push({ x: b.x, y: b.y, z: b.z, t: v(s.dur, lvl), tick: 0, heal: n, r: 3 });
                this.emit({ type: 'fx', kind: 'ring', x: b.x, y: b.y, z: b.z + 0.1, r: 3, color: 0x7ff0a0 });
                break;
            }
            case 'dash': {
                const a = Math.atan2(t.body.y - b.y, t.body.x - b.x);
                b.vx = Math.cos(a) * 16;
                b.vy = Math.sin(a) * 16;
                b.dash = Math.min(0.45, d2(t.body, b) / 16);
                h.pendingHit = { m: t, fn: apply, t: b.dash };
                break;
            }
            case 'back': {
                const from = t ?? this.nearestMob(5);
                const a = from ? Math.atan2(b.y - from.body.y, b.x - from.body.x) : h.face + Math.PI;
                b.vx = Math.cos(a) * 10;
                b.vy = Math.sin(a) * 10;
                b.vz = 5;
                b.dash = 0.35;
                b.grounded = false;
                break;
            }
            default: break;
        }
        this.emit({ type: 'fx', kind: 'magic', x: b.x, y: b.y, z: b.z + 1, color: CLASSES[h.cls].color ?? 0xffffff });
    }

    // healing springs tick once a second on the hero standing in them
    springFrame(dt) {
        const h = this.hero;
        for (const s of this.springs) {
            s.t -= dt;
            s.tick -= dt;
            if (s.tick > 0) continue;
            s.tick = 1;
            this.emit({ type: 'fx', kind: 'heal', x: s.x, y: s.y, z: s.z + 0.1 });
            if (!h.dead && !h.sailing && d2(h.body, s) < s.r && Math.abs(h.body.z - s.z) < 2) {
                h.hp = Math.min(this.maxHp(h), h.hp + s.heal);
                this.emit({ type: 'num', x: h.body.x, y: h.body.y, z: h.body.z + 1.8, text: '+' + s.heal, kind: 'heal' });
            }
        }
        this.springs = this.springs.filter((s) => s.t > 0);
    }

    nearestMob(r) {
        const b = this.hero.body;
        let best = null;
        for (const m of this.mobs) if (!m.dead && d2(m.body, b) < r && (!best || d2(m.body, b) < d2(best.body, b))) best = m;
        return best;
    }

    // ---------------------------------------------------------- the frame
    // input: { mx, my, jump }
    update(dt, input = {}) {
        dt = Math.min(dt, 0.05);
        this.frameNo++;
        this.time += dt;
        this.day = (this.day + dt / DAY_LENGTH) % 1;
        const h = this.hero;
        h.hurt = Math.max(0, h.hurt - dt);
        h.flash = Math.max(0, h.flash - dt * 3);
        h.attackT = Math.max(0, h.attackT - dt);
        h.castT = Math.max(0, h.castT - dt);
        h.combat += dt;
        for (const k of Object.keys(h.cds)) h.cds[k] = Math.max(0, h.cds[k] - dt);
        for (const b of h.buffs) b.t -= dt;
        const nb = h.buffs.length;
        h.buffs = h.buffs.filter((b) => b.t > 0);
        if (h.buffs.length !== nb) h._dirty = true;

        if (h.dead > 0) {
            h.dead -= dt;
            if (h.dead <= 0) this.respawnHero();
        } else if (h.sailing) this.sail(dt, input);
        else this.heroFrame(dt, input);

        // regeneration: quick out of combat
        if (!h.dead) {
            // the rules' recovery every second, and a sailor's rest out of a fight
            const d = this.d(h);
            const out = h.combat > 5;
            h.hp = Math.min(d.maxHp, h.hp + (d.hrec * (out ? 3 : 1) + d.maxHp * (out ? 0.02 : 0) + d.maxHp * this.buff(h, 'hpRegen')) * dt);
            h.mp = Math.min(d.maxSp, h.mp + (d.srec * (out ? 3 : 1) + d.maxSp * (out ? 0.015 : 0)) * dt);
        }
        this.mobFrame(dt);
        this.shotFrame(dt);
        this.springFrame(dt);
        for (const n of this.nodes) if (!n.alive) { n.back -= dt; if (n.back <= 0) n.alive = true; }
        for (const d of this.drops) d.t -= dt;
        this.drops = this.drops.filter((d) => d.t > 0);
        // walking over loot picks it up
        if (!h.sailing && !h.dead) for (const d of this.drops.slice()) if (d3(d, h.body) < 1.1) this.pickup(d);
        const ev = this.ev;
        this.ev = [];
        return ev;
    }

    heroFrame(dt, input) {
        const h = this.hero;
        const b = h.body;
        let mx = input.mx ?? 0;
        let my = input.my ?? 0;
        const manual = Math.hypot(mx, my) > 0.1;
        if (manual) { h.path = null; if (h.act) this.cancelAct(); }
        const t = this.targetMob();
        if (!t) { h.engaged = false; h.queued = null; }
        // approach the target to hit it or cast the queued skill
        if (!manual && t && h.engaged && !h.act) {
            const q = h.queued ? SKILLS[h.queued] : null;
            const range = q ? (q.kind === 'melee' ? q.range : q.range ?? 9) : this.range();
            const d = d2(t.body, b);
            if (d > range) {
                const a = Math.atan2(t.body.y - b.y, t.body.x - b.x);
                mx = Math.cos(a);
                my = Math.sin(a);
            } else {
                h.face = Math.atan2(t.body.y - b.y, t.body.x - b.x);
                if (h.queued) this.cast(h.queued, t);
                else this.autoAttack(t, dt);
            }
        } else if (!manual && h.path && h.path.length) {
            const n = h.path[h.pathI];
            const [x, y] = center(n.q, n.r);
            const dx = x - b.x;
            const dy = y - b.y;
            const d = Math.hypot(dx, dy);
            if (d < 0.22 && Math.abs(n.h * LAYER - b.z) < 0.6) {
                h.pathI++;
                if (h.pathI >= h.path.length) h.path = null;
            } else {
                const k = Math.min(1, d / 0.4);
                mx = (dx / d) * k;
                my = (dy / d) * k;
                if (n.via === 'hop' && b.grounded && n.h * LAYER - b.z > 0.6) input = { ...input, jump: true };
            }
        }
        b.speedMul = this.d(h).speed;
        const events = stepBody(this.w, b, { mx, my, jump: input.jump && !h.act }, dt, []);
        for (const e of events) {
            if (e.type === 'fall') { this.damageHero(Math.round((this.maxHp(h) * e.dmg) / 12)); this.emit({ type: 'fx', kind: 'dust', x: b.x, y: b.y, z: b.z }); }
            else if (e.type === 'splash') this.emit({ type: 'fx', kind: 'splash', x: b.x, y: b.y, z: b.z + 0.8 });
            else if (e.type === 'void') respawn(b);
            else if (e.type === 'land' || e.type === 'jump') this.emit({ type: 'fx', kind: 'dust', x: b.x, y: b.y, z: b.z });
        }
        if (h.pendingHit) {
            h.pendingHit.t -= dt;
            if (h.pendingHit.t <= 0) { const p = h.pendingHit; h.pendingHit = null; b.vx *= 0.2; b.vy *= 0.2; if (!p.m.dead && d2(p.m.body, b) < 2.6) { h.attackT = 0.35; p.fn(p.m); } }
        }
        const sp = Math.hypot(b.vx, b.vy);
        h.speed = sp / 4.6;
        h.walk += sp * dt * 2.6;
        if (sp > 0.3 && !h.engaged) h.face = Math.atan2(b.vy, b.vx);
        else if (sp > 0.3 && t && d2(t.body, b) > this.range()) h.face = Math.atan2(b.vy, b.vx);
        // the island you are on
        const isl = this.islandAt(b.x, b.y);
        if (isl && !h.visited[isl.id]) { h.visited[isl.id] = true; this.emit({ type: 'island', id: isl.id }); }
        this.actFrame(dt);
    }

    autoAttack(t, dt) {
        const h = this.hero;
        h.atkT -= dt;
        if (h.atkT > 0) return;
        h.atkT = this.interval();
        const w = this.weapon();
        const b = h.body;
        if (w.type === 'bow' || w.type === 'gun' || w.type === 'staff' || w.type === 'censer') {
            const magic = w.type === 'staff' || w.type === 'censer';
            h.castT = 0.3;
            this.fire({ x: b.x, y: b.y, z: b.z + 0.9 }, t, 0, magic ? 'bolt' : w.type === 'gun' ? 'ball' : 'arrow', 'hero', { onHit: (m) => this.damageMob(m, this.strike(m, { mult: magic ? 0.85 : 1, magic })) });
        } else {
            h.attackT = 0.35;
            this.damageMob(t, this.strike(t));
            this.emit({ type: 'swing' });
        }
    }

    actFrame(dt) {
        const h = this.hero;
        const a = h.act;
        if (!a) return;
        const b = h.body;
        if (a.type === 'gather') {
            if (!a.node.alive || d3(a.node, b) > 2.2) { this.cancelAct(); return; }
            h.face = Math.atan2(a.node.y - b.y, a.node.x - b.x);
            a.t += dt;
            h.attackT = (a.t % 0.8) < 0.3 ? 0.3 : 0;
            if (a.t >= a.total) {
                const n = a.node;
                const pr = h.profs[n.def.prof];
                const k = 1 + (this.rng() < pr.lvl * 0.05 ? 1 : 0);
                this.give(n.def.item, k);
                for (const [id, p] of n.def.extra ?? []) if (this.rng() < p) this.give(id, 1);
                this.profXp(n.def.prof, 12);
                this.emit({ type: 'fx', kind: 'gather', x: n.x, y: n.y, z: n.z + 0.6 });
                n.alive = false;
                n.back = n.def.respawn;
                h.act = null;
                this.emit({ type: 'act', state: 'done' });
                this.emit({ type: 'node', id: n.id, alive: false });
            }
        } else if (a.type === 'fish') {
            a.t += dt;
            if (a.bite > 0) {
                a.bite -= dt;
                if (a.bite <= 0) { this.log('Сорвалась…', 'warn'); h.act = null; this.emit({ type: 'act', state: 'done' }); }
            } else if (a.t >= a.wait) {
                a.bite = 0.95 + h.profs.fishing.lvl * 0.04;
                this.emit({ type: 'bite' });
                this.emit({ type: 'fx', kind: 'splash', x: a.node.x, y: a.node.y, z: a.node.z, n: 8 });
            }
        }
    }

    mobFrame(dt) {
        const h = this.hero;
        const hb = h.body;
        const w = this.w;
        for (const m of this.mobs) {
            const b = m.body;
            if (m.dead) {
                m.dead += dt;
                m.back -= dt;
                if (m.back <= 0) this.spawnMob(this.gen.spawns[m.spawn], m.spawn, m);
                continue;
            }
            if (Math.hypot(b.x - hb.x, b.y - hb.y) > ACTIVE) continue;
            m.hurt = Math.max(0, m.hurt - dt);
            m.flash = Math.max(0, m.flash - dt * 3);
            m.attackT = Math.max(0, m.attackT - dt);
            m.stun = Math.max(0, m.stun - dt);
            m.root = Math.max(0, m.root - dt);
            m.disarm = Math.max(0, m.disarm - dt);
            if (m.debuffs.length) { for (const d of m.debuffs) d.t -= dt; m.debuffs = m.debuffs.filter((d) => d.t > 0); }
            b.speedMul = m.baseSpeed * this.mobSlow(m);
            for (const d of m.dots) {
                d.t -= dt;
                if (d.t <= 0 && d.n > 0) { d.t = 1; d.n--; this.damageMob(m, { dmg: d.dmg }, 'dot'); }
            }
            m.dots = m.dots.filter((d) => d.n > 0);
            if (m.dead) continue;
            // who to fight: the hero on land, the ship at sea
            const foe = h.sailing ? this.ship : h.dead ? null : hb;
            const dist = foe ? Math.hypot(foe.x - b.x, foe.y - b.y) : Infinity;
            const canReach = foe && (m.sea ? h.sailing || h.body.swimming : !h.sailing && Math.abs(foe.z - b.z) < 4);
            const hidden = this.buff(h, 'hidden') > 0;
            if (m.state === 'idle' && canReach && !hidden && m.def.temper === 'aggressive' && dist < (m.def.aggro ?? 5) && h.lvl < m.lvl + 10) { m.state = 'chase'; m.target = 'hero'; this.emit({ type: 'aggro', id: m.id }); }
            if (m.state === 'chase' && (!canReach || hidden)) m.state = 'return';
            const leash = (this.gen.spawns[m.spawn].radius ?? 6) + (m.def.leash ?? 14);
            if (m.state === 'chase' && Math.hypot(b.x - m.home.x, b.y - m.home.y) > leash) { m.state = 'return'; m.target = null; }
            let mx = 0;
            let my = 0;
            let goal = null;
            if (m.state === 'chase') {
                const reach = m.def.ranged ?? (m.def.boss ? 1.9 : m.sea ? 1.8 : 1.35);
                if (dist > reach) goal = foe;
                else {
                    m.face = Math.atan2(foe.y - b.y, foe.x - b.x);
                    m.atkT -= dt;
                    if (m.atkT <= 0 && m.stun === 0 && m.disarm === 0) this.mobAttack(m, foe);
                }
                if (m.def.boss) {
                    m.slamT -= dt;
                    if (m.slamT <= 0 && dist < 4 && m.stun === 0) {
                        m.slamT = 7;
                        m.attackT = 0.6;
                        this.emit({ type: 'fx', kind: 'ring', x: b.x, y: b.y, z: b.z + 0.1, r: 3.2, color: 0x6ff5cf });
                        if (dist < 3.2 && !h.sailing) this.damageHero(damage(m.st.atk[1] * 1.6, this.defense(), 0, m.lvl, h.lvl), m);
                    }
                }
            } else if (m.state === 'return') {
                goal = m.home;
                if (Math.hypot(b.x - m.home.x, b.y - m.home.y) < 1) { m.state = 'idle'; m.hp = m.max; m.dots = []; m.debuffs = []; }
            } else if (m.state === 'flee') {
                m.fleeT -= dt;
                const a = Math.atan2(b.y - hb.y, b.x - hb.x);
                mx = Math.cos(a);
                my = Math.sin(a);
                if (m.fleeT <= 0) m.state = 'return';
            } else {
                m.wait -= dt;
                if (m.goal) goal = m.goal;
                if (m.wait <= 0) {
                    m.wait = 3 + this.rng() * 5;
                    const cells = this.spawnCells[m.spawn];
                    const c = cells[Math.floor(this.rng() * cells.length)];
                    m.goal = Math.hypot(c[0] - m.home.x, c[1] - m.home.y) < 7 || m.sea ? { x: c[0], y: c[1], z: c[2] } : null;
                }
                if (m.goal && Math.hypot(b.x - m.goal.x, b.y - m.goal.y) < 0.5) m.goal = null;
            }
            if (goal) {
                const a = Math.atan2(goal.y - b.y, goal.x - b.x);
                const k = m.state === 'idle' ? 0.45 : 1;
                mx = Math.cos(a) * k;
                my = Math.sin(a) * k;
            }
            if (m.stun > 0 || m.root > 0) { mx = 0; my = 0; }
            if (m.sea) this.seaMove(m, mx, my, dt);
            else {
                const before = [b.x, b.y];
                stepBody(w, b, { mx, my, jump: false }, dt, []);
                // stuck against a wall: jump, or give up the errand
                const moved = Math.hypot(b.x - before[0], b.y - before[1]);
                if ((mx || my) && moved < dt * 0.4) {
                    m.stuck += dt;
                    if (m.stuck > 0.6 && b.grounded) { b.vz = 7.4; b.grounded = false; }
                    if (m.stuck > 2) { m.stuck = 0; m.goal = null; if (m.state === 'chase') m.state = 'return'; else if (m.state === 'return') { Object.assign(b, { x: m.home.x, y: m.home.y, z: m.home.z }); m.state = 'idle'; } }
                } else m.stuck = 0;
                if (b.z < -2 || (b.swimming && m.kind !== 'crab')) { Object.assign(b, { x: m.home.x, y: m.home.y, z: m.home.z, vx: 0, vy: 0, vz: 0 }); m.state = 'idle'; }
            }
            const sp = Math.hypot(b.vx, b.vy);
            m.speed = sp / 3;
            m.walk += sp * dt * 3;
            if (sp > 0.3) m.face = Math.atan2(b.vy, b.vx);
        }
    }

    seaMove(m, mx, my, dt) {
        const b = m.body;
        const s = m.def.speed;
        b.vx += (mx * s - b.vx) * Math.min(1, dt * 2);
        b.vy += (my * s - b.vy) * Math.min(1, dt * 2);
        const nx = b.x + b.vx * dt;
        const ny = b.y + b.vy * dt;
        if (this.navigable(nx, ny)) { b.x = nx; b.y = ny; } else { b.vx *= -0.3; b.vy *= -0.3; m.goal = null; }
        b.z = this.w.sea * LAYER - (m.def.model === 'serpent' ? 0.35 : 0.15);
    }

    mobAttack(m, foe) {
        const h = this.hero;
        m.atkT = m.def.boss ? 1.5 : 1.7;
        m.attackT = 0.35;
        // at sea the hull takes the blow: no dodging, the planks' own armour
        const r = h.sailing
            ? { dmg: damage((m.st.atk[0] + m.st.atk[1]) / 2 * Math.max(0.1, 1 + this.mobMod(m, 'atkPct')), 20, 0, m.lvl, h.lvl) }
            : this.mobBlow(m);
        const b = m.body;
        if (m.def.ranged) {
            this.fire({ x: b.x, y: b.y, z: b.z + 1 }, h.sailing ? 'ship' : 'hero', r.dmg, m.sea ? 'ball' : 'bolt', 'mob', { miss: r.miss, from: m });
            return;
        }
        if (r.miss) { this.emit({ type: 'num', x: foe.x, y: foe.y, z: (foe.z ?? 0) + 1.8, text: 'уклон', kind: 'miss' }); return; }
        if (h.sailing) this.shipHit(r.dmg);
        else this.damageHero(r.dmg, m, r.crit);
    }

    shotFrame(dt) {
        const h = this.hero;
        for (const s of this.shots) {
            if (s.delay > 0) { s.delay -= dt; continue; }
            s.t += dt;
            let tx;
            let ty;
            let tz;
            if (s.target === 'hero') { tx = h.body.x; ty = h.body.y; tz = h.body.z + 0.8; }
            else if (s.target === 'ship') { if (!this.ship) { s.done = true; continue; } tx = this.ship.x; ty = this.ship.y; tz = this.ship.z + 0.8; }
            else { if (s.target.dead) { s.done = true; continue; } tx = s.target.body.x; ty = s.target.body.y; tz = s.target.body.z + 0.7; }
            const dx = tx - s.x;
            const dy = ty - s.y;
            const dz = tz - s.z;
            const d = Math.hypot(dx, dy, dz);
            const step = s.speed * dt;
            if (d <= step || s.t > 3) {
                s.done = true;
                if (s.side === 'hero') {
                    if (s.onHit) s.onHit(s.target);
                    else this.damageMob(s.target, { dmg: Math.max(1, Math.round(s.dmg)) });
                } else if (s.miss) this.emit({ type: 'num', x: tx, y: ty, z: tz + 1, text: 'мимо', kind: 'miss' });
                else if (s.target === 'ship') this.shipHit(s.dmg);
                else this.damageHero(s.dmg, s.from);
                this.emit({ type: 'fx', kind: s.kind === 'ball' ? 'splash' : s.kind === 'arrow' ? 'hit' : 'magic', x: tx, y: ty, z: tz });
            } else {
                s.x += (dx / d) * step;
                s.y += (dy / d) * step;
                s.z += (dz / d) * step + (s.kind === 'ball' ? Math.sin(s.t * 4) * dt * 2 : 0);
            }
        }
        this.shots = this.shots.filter((s) => !s.done);
    }

    // ---------------------------------------------------------- saving
    save() {
        const h = this.hero;
        return {
            v: 2, lvl: h.lvl, xp: h.xp, gold: h.gold, cls: h.cls, classes: h.classes, base: h.base, points: h.points, tp: h.tp, sk: h.sk,
            equip: h.equip, inv: h.inv, profs: h.profs, quests: h.quests, compass: h.compass, hasShip: h.hasShip, visited: h.visited,
            bar: h.bar, hp: h.hp, mp: h.mp, pos: [h.body.x, h.body.y, h.body.z], sailing: h.sailing, ship: this.ship, home: this.home, day: this.day, kills: h.kills,
        };
    }

    load(s) {
        if (!s || s.v !== 2) return false;
        const h = this.hero;
        for (const k of ['lvl', 'xp', 'gold', 'cls', 'classes', 'base', 'points', 'tp', 'sk', 'equip', 'inv', 'compass', 'hasShip', 'visited', 'bar', 'kills']) if (s[k] !== undefined) h[k] = s[k];
        h._dirty = true;
        for (const [id, q] of Object.entries(s.quests ?? {})) if (h.quests[id]) h.quests[id] = q;
        for (const [id, p] of Object.entries(s.profs ?? {})) if (h.profs[id]) h.profs[id] = p;
        h.hp = Math.min(s.hp ?? this.maxHp(h), this.maxHp(h));
        h.mp = Math.min(s.mp ?? this.maxMp(h), this.maxMp(h));
        if (s.home) this.home = s.home;
        if (s.ship) this.ship = s.ship;
        if (s.day !== undefined) this.day = s.day;
        const [x, y, z] = s.pos ?? [this.home.x, this.home.y, this.home.z];
        Object.assign(h.body, { x, y, z, fallTop: z });
        h.body.safe = [this.home.x, this.home.y, this.home.z];
        h.sailing = !!(s.sailing && this.ship);
        if (!h.sailing && !this.w.nodeAt(x, y, z)) Object.assign(h.body, { x: this.home.x, y: this.home.y, z: this.home.z });
        this.refreshQuests();
        return true;
    }
}

export { MAT };
