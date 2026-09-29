// Strata game state: the hero moving freely (physics.js) through a generated
// location (gen.js), fighting, looting, resting at campfires and descending.
//
// Tempers (lore.js): timid creatures flee, peaceful ones ignore you, passive ones
// fight back once hit, aggressive ones attack on sight, nocturnal ones attack at
// night and shy away by day, ranged ones keep their distance and spit fire.
// A day lasts DAY seconds; night falls, lamps and campfires matter more.

import { B, nodePos, nodeKey, sameNode, mulberry32 } from './world.js';
import { Body, stepBody, respawn, PHYS } from './physics.js';
import { generateLocation } from './gen.js';
import { KINDS, RELICS, SHOP, BIOMES, ITEMS } from './lore.js';

export const HERO = { hp: 6, dmg: 1, reach: 1.6, arc: 1.15, cd: 0.36, invuln: 0.8, dashCd: 0.75, dashTime: 0.17, dashSpeed: 11, potionHeal: 3, maxPotions: 5 };
export const DAY = 300;
export const SEALS = 3;
const ACTIVE = 20; // creatures further than this sleep

export class Game {
    constructor({ seed = 1, depth = 1, hero = null, codex = [], time = null } = {}) {
        this.seed = seed;
        this.depth = depth;
        this.loc = generateLocation(seed, depth);
        this.world = this.loc.world;
        this.rng = mulberry32(seed * 7919 + depth * 104729);
        this.t = 0;
        this.time = time ?? DAY * 0.3; // morning
        const s = this.loc.start;
        this.body = new Body(s.x + 0.5, s.y + 0.5, s.h);
        this.hero = {
            hp: hero?.hp ?? HERO.hp, maxHp: hero?.maxHp ?? HERO.hp, dmg: hero?.dmg ?? HERO.dmg,
            coins: hero?.coins ?? 0, potions: hero?.potions ?? 1, keys: 0, seals: 0,
            invuln: 0, cd: 0, dashCd: 0, swing: 0,
            spawn: [s.x + 0.5, s.y + 0.5, s.h],
        };
        this.codex = new Set(codex);
        this.found = new Set(); // relics taken in this location
        this.uid = 100000;
        this.creatures = this.loc.spawns.map((sp) => this.spawn(sp));
        this.items = this.loc.items.map((i) => ({ ...i, taken: false, pop: 0 }));
        this.chests = this.loc.chests.map((c) => ({ ...c, opened: false }));
        this.levers = this.loc.levers.map((l) => ({ ...l }));
        this.gates = this.loc.gates.map((g) => ({ ...g }));
        this.pedestals = this.loc.pedestals.map((p) => ({ ...p, taken: false }));
        this.campfires = this.loc.campfires.map((c) => ({ ...c, lit: false }));
        this.signs = this.loc.signs;
        this.merchant = this.loc.merchant;
        this.projectiles = [];
        this.tier = 0;
        this.visited = new Set([0]);
        this.won = false;
        this.deaths = 0;
    }

    spawn(sp) {
        const k = KINDS[sp.kind];
        const scale = sp.elite && sp.kind !== 'guardian' ? 1.4 : 1;
        const hpMul = (1 + 0.25 * (this.depth - 1)) * (sp.elite && sp.kind !== 'guardian' ? 3 : 1);
        const node = { x: sp.x, y: sp.y, h: sp.h, rise: null };
        const [x, y, z] = nodePos(node);
        return {
            id: this.uid++, kind: sp.kind, k, name: sp.name ?? k.name, elite: !!sp.elite, scale,
            hp: Math.round(k.hp * hpMul), maxHp: Math.round(k.hp * hpMul),
            dmg: k.dmg + Math.floor((this.depth - 1) / 2) + (sp.elite && sp.kind !== 'guardian' ? 1 : 0),
            x, y, z: k.fly ? z + 1.2 : z, node, home: node, path: [], seg: null,
            state: 'idle', think: this.rng() * 2, cd: 0, windup: 0, hostileUntil: 0, hurt: 0, stun: 0,
            kx: 0, ky: 0, facing: [1, 0], carry: [...(sp.carry ?? [])], fly: !!k.fly, tier: sp.tier, area: sp.area,
        };
    }

    // ---- clock
    get dayPhase() {
        return (this.time % DAY) / DAY; // 0 midnight, 0.25 dawn, 0.5 noon, 0.75 dusk
    }

    get daylight() {
        const p = this.dayPhase;
        return Math.min(1, Math.max(0, Math.sin((p - 0.25) * Math.PI * 2) * 1.6 + 0.5));
    }

    get night() {
        return this.daylight < 0.25;
    }

    // ---- per frame
    // input: { mx, my } world direction, jump, attack, dash, interact (pressed this frame)
    update(dt, input = {}, events = []) {
        if (this.won) return events;
        this.t += dt;
        this.time += dt;
        const h = this.hero;
        const b = this.body;
        h.invuln = Math.max(0, h.invuln - dt);
        h.cd = Math.max(0, h.cd - dt);
        h.dashCd = Math.max(0, h.dashCd - dt);
        h.swing = Math.max(0, h.swing - dt);

        if (input.dash && h.dashCd === 0 && !b.climbing) {
            const len = Math.hypot(input.mx ?? 0, input.my ?? 0);
            const [fx, fy] = len > 0.1 ? [input.mx / len, input.my / len] : b.facing;
            b.dash = HERO.dashTime;
            b.vx = fx * HERO.dashSpeed;
            b.vy = fy * HERO.dashSpeed;
            b.facing = [fx, fy];
            h.dashCd = HERO.dashCd;
            h.invuln = Math.max(h.invuln, HERO.dashTime + 0.08);
            events.push({ type: 'dash' });
        }
        const bodyEvents = stepBody(this.world, b, input, dt, []);
        for (const e of bodyEvents) this.bodyEvent(e, events);
        if (input.attack && h.cd === 0 && !b.climbing) this.swing(events);
        if (input.interact) this.interact(events);

        for (const c of this.creatures) if (c.hp > 0) this.updateCreature(c, dt, events);
        this.updateProjectiles(dt, events);
        this.pickups(events);

        // which tier are we on?
        const tier = this.tierAt(b.z);
        if (tier !== this.tier) {
            this.tier = tier;
            events.push({ type: 'tier', tier, first: !this.visited.has(tier), name: this.loc.tiers[tier].name });
            this.visited.add(tier);
        }
        return events;
    }

    tierAt(z) {
        const tiers = this.loc.tiers;
        for (let i = 0; i < tiers.length; i++) if (z >= tiers[i].z - 6) return i;
        return tiers.length - 1;
    }

    bodyEvent(e, events) {
        const h = this.hero;
        const b = this.body;
        if (e.type === 'fall') this.hurtHero(e.dmg, 'fall', events, false);
        else if (e.type === 'lava') {
            if (h.invuln === 0) this.hurtHero(1, 'lava', events, false);
            b.vz = 9;
            const [sx, sy] = b.safe;
            const d = Math.hypot(sx - b.x, sy - b.y) || 1;
            b.vx = ((sx - b.x) / d) * 4;
            b.vy = ((sy - b.y) / d) * 4;
        } else if (e.type === 'void') {
            respawn(b);
            this.hurtHero(1, 'void', events, false);
            events.push({ type: 'rescued' });
        } else events.push(e);
    }

    hurtHero(dmg, by, events, knock = true, from = null) {
        const h = this.hero;
        if (dmg <= 0) return;
        h.hp -= dmg;
        h.invuln = HERO.invuln;
        events.push({ type: 'hurt', dmg, by });
        if (knock && from) {
            const b = this.body;
            const dx = b.x - from[0];
            const dy = b.y - from[1];
            const d = Math.hypot(dx, dy) || 1;
            b.vx = (dx / d) * 6;
            b.vy = (dy / d) * 6;
            b.vz = Math.max(b.vz, 3.5);
            b.stun = 0.18;
        }
        if (h.hp <= 0) this.die(by, events);
    }

    die(by, events) {
        const h = this.hero;
        const b = this.body;
        this.deaths++;
        const lost = Math.floor(h.coins / 2);
        h.coins -= lost;
        h.hp = h.maxHp;
        h.invuln = 2;
        [b.x, b.y, b.z] = h.spawn;
        b.vx = b.vy = b.vz = 0;
        b.climbing = null;
        b.fallTop = b.z;
        b.safe = [...h.spawn];
        events.push({ type: 'dead', by, lost });
        // the angry calm down
        for (const c of this.creatures) { c.hostileUntil = 0; c.path = []; c.windup = 0; }
    }

    // ---- combat
    swing(events) {
        const h = this.hero;
        const b = this.body;
        h.cd = HERO.cd;
        h.swing = 0.22;
        events.push({ type: 'swing' });
        // a little help aiming: turn toward the nearest foe within reach
        let aim = null;
        let ad = HERO.reach + 0.7;
        for (const c of this.creatures) {
            if (c.hp <= 0 || c.z - b.z < -1.2 || c.z - b.z > 1.6) continue;
            const d = Math.hypot(c.x - b.x, c.y - b.y) - (this.hostile(c) ? 0.6 : 0);
            if (d < ad) { ad = d; aim = c; }
        }
        if (aim) {
            const dx = aim.x - b.x;
            const dy = aim.y - b.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.05) b.facing = [dx / d, dy / d];
        }
        const [fx, fy] = b.facing;
        let hit = false;
        for (const c of this.creatures) {
            if (c.hp <= 0) continue;
            const dx = c.x - b.x;
            const dy = c.y - b.y;
            const dz = c.z - b.z;
            const d = Math.hypot(dx, dy);
            const reach = HERO.reach + 0.25 * c.scale;
            if (d > reach || dz < -1.2 || dz > 1.6) continue;
            if (d > 0.35 && Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy) / d))) > HERO.arc) continue;
            this.hitCreature(c, h.dmg, events, [fx, fy]);
            hit = true;
        }
        // breakable pots and barrels
        for (const p of this.loc.props) {
            if (p.broken || !['urn', 'barrel', 'crate'].includes(p.kind)) continue;
            const dx = p.x + 0.5 - b.x;
            const dy = p.y + 0.5 - b.y;
            const d = Math.hypot(dx, dy);
            if (d > HERO.reach || Math.abs(p.z - b.z) > 1 || (d > 0.3 && (dx * fx + dy * fy) / d < Math.cos(HERO.arc))) continue;
            p.broken = true;
            this.world.unblock(p.x, p.y, p.z, 1);
            events.push({ type: 'break', prop: p });
            if (this.rng() < 0.5) this.drop(this.rng() < 0.8 ? 'coin' : 'potion', p.x, p.y, p.z, events);
            hit = true;
        }
        if (hit) events.push({ type: 'impact' });
    }

    hitCreature(c, dmg, events, dir) {
        c.hp -= dmg;
        c.hurt = 0.25;
        c.stun = 0.3;
        c.windup = 0;
        c.kx += dir[0] * 0.55;
        c.ky += dir[1] * 0.55;
        if (c.k.temper === 'passive' || c.k.temper === 'peaceful' || c.k.temper === 'nocturnal') c.hostileUntil = this.t + 10;
        if (c.k.temper === 'timid') c.state = 'flee';
        events.push({ type: 'hit', id: c.id, dmg });
        if (c.hp <= 0) {
            events.push({ type: 'kill', id: c.id, kind: c.kind, name: c.name, elite: c.elite });
            const [x, y] = [Math.floor(c.x), Math.floor(c.y)];
            const n = c.fly ? this.groundNode(c.x, c.y, c.z) : c.node;
            const at = n ?? c.node;
            for (const it of c.carry) this.drop(it, at.x, at.y, at.h, events);
            for (const [it, p] of c.k.loot) if (this.rng() < p) this.drop(it, at.x, at.y, at.h, events);
            void x;
            void y;
        }
    }

    groundNode(px, py, pz) {
        const w = this.world;
        const x = Math.floor(px);
        const y = Math.floor(py);
        for (let z = Math.floor(pz) + 1; z > Math.floor(pz) - 8; z--) {
            const n = w.node(x, y, z);
            if (n) return n;
        }
        return null;
    }

    // an item falls on the nearest free floor around (x, y, h)
    drop(kind, x, y, h, events, extra = {}) {
        const w = this.world;
        const taken = new Set(this.items.filter((i) => !i.taken).map((i) => `${i.x},${i.y},${i.h}`));
        let spot = [x, y, h];
        const ring = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [0, 2], [-2, 0], [0, -2]];
        for (const [dx, dy] of ring) {
            const n = w.node(x + dx, y + dy, h) ?? w.node(x + dx, y + dy, h - 1);
            if (n && !n.rise && !taken.has(`${n.x},${n.y},${n.h}`)) { spot = [n.x, n.y, n.h]; break; }
        }
        const it = { kind, x: spot[0], y: spot[1], h: spot[2], id: this.uid++, taken: false, pop: 0.5, ...extra };
        this.items.push(it);
        events.push({ type: 'drop', item: it });
        return it;
    }

    pickups(events) {
        const b = this.body;
        const h = this.hero;
        for (const it of this.items) {
            if (it.taken || it.pop > 0.25) { if (it.pop > 0) it.pop -= 1 / 60; continue; }
            if (Math.hypot(it.x + 0.5 - b.x, it.y + 0.5 - b.y) > 0.75 || Math.abs(it.h - b.z) > 1.3) continue;
            if (it.kind === 'potion' && h.potions >= HERO.maxPotions) continue;
            if (it.kind === 'food' && h.hp >= h.maxHp) continue;
            it.taken = true;
            this.gain(it.kind, events, it);
        }
    }

    gain(kind, events, it = null) {
        const h = this.hero;
        if (kind === 'coin') h.coins += 1;
        else if (kind === 'gem') h.coins += ITEMS.gem.value;
        else if (kind === 'potion') h.potions = Math.min(HERO.maxPotions, h.potions + 1);
        else if (kind === 'food') h.hp = Math.min(h.maxHp, h.hp + 1);
        else if (kind === 'key') h.keys += 1;
        else if (kind === 'seal') h.seals += 1;
        else if (kind === 'heart') { h.maxHp += 1; h.hp = Math.min(h.maxHp, h.hp + 2); }
        else if (kind === 'sword') h.dmg += 1;
        events.push({ type: 'pickup', kind, item: it });
    }

    drink(events = []) {
        const h = this.hero;
        if (h.potions <= 0 || h.hp >= h.maxHp) return events;
        h.potions--;
        h.hp = Math.min(h.maxHp, h.hp + HERO.potionHeal);
        events.push({ type: 'drink' });
        return events;
    }

    buy(i, events = []) {
        const offer = SHOP[i];
        const h = this.hero;
        if (!offer || h.coins < offer.price) { events.push({ type: 'poor' }); return events; }
        if (offer.item === 'potion' && h.potions >= HERO.maxPotions) { events.push({ type: 'full' }); return events; }
        h.coins -= offer.price;
        this.gain(offer.item, events);
        events.push({ type: 'bought', item: offer.item });
        return events;
    }

    // ---- things to use
    interactables() {
        const out = [];
        for (const c of this.chests) if (!c.opened) out.push({ kind: 'chest', ref: c, x: c.x, y: c.y, z: c.z });
        for (const l of this.levers) out.push({ kind: 'lever', ref: l, x: l.x, y: l.y, z: l.z });
        for (const p of this.pedestals) if (!p.taken) out.push({ kind: 'pedestal', ref: p, x: p.x, y: p.y, z: p.z });
        for (const c of this.campfires) out.push({ kind: 'campfire', ref: c, x: c.x, y: c.y, z: c.z });
        for (const s of this.signs) out.push({ kind: 'sign', ref: s, x: s.x, y: s.y, z: s.z });
        if (this.merchant) out.push({ kind: 'merchant', ref: this.merchant, x: this.merchant.x, y: this.merchant.y, z: this.merchant.z });
        const g = this.loc.gate;
        out.push({ kind: 'gate', ref: g, x: g.x, y: g.y, z: g.z });
        return out;
    }

    nearest() {
        const b = this.body;
        let best = null;
        for (const it of this.interactables()) {
            const d = Math.hypot(it.x + 0.5 - b.x, it.y + 0.5 - b.y);
            const reach = it.kind === 'gate' ? 2.2 : 1.55;
            if (d > reach || Math.abs(it.z - b.z) > 1.2) continue;
            if (!best || d < best.d) best = { ...it, d };
        }
        return best;
    }

    interact(events) {
        const t = this.nearest();
        if (!t) return;
        const h = this.hero;
        const r = t.ref;
        if (t.kind === 'chest') {
            if (r.locked && h.keys === 0) { events.push({ type: 'locked' }); return; }
            if (r.locked) h.keys--;
            r.opened = true;
            events.push({ type: 'open', id: r.id });
            for (const it of r.loot) this.drop(it, r.x, r.y, r.z, events);
        } else if (t.kind === 'lever') {
            if (r.on) return;
            r.on = true;
            events.push({ type: 'lever', id: r.id });
            const gate = this.gates.find((g) => g.id === r.gate);
            const all = this.levers.filter((l) => l.gate === r.gate);
            if (gate && all.every((l) => l.on) && !gate.open) {
                gate.open = true;
                this.world.unblock(gate.x, gate.y, gate.z, 2);
                events.push({ type: 'gate-open', id: gate.id });
            } else events.push({ type: 'lever-wait', left: all.filter((l) => !l.on).length });
        } else if (t.kind === 'pedestal') {
            r.taken = true;
            if (r.seal) this.gain('seal', events);
            else {
                const fresh = !this.codex.has(r.relic);
                this.codex.add(r.relic);
                this.found.add(r.relic);
                events.push({ type: 'relic', id: r.relic, fresh, name: RELICS[r.relic].name, text: RELICS[r.relic].text });
                h.coins += 3;
            }
        } else if (t.kind === 'campfire') {
            r.lit = true;
            h.hp = h.maxHp;
            h.spawn = [r.x + 0.5, r.y + 1.5, r.z];
            const n = this.world.node(r.x, r.y + 1, r.z) ?? this.world.node(r.x + 1, r.y, r.z);
            if (n) h.spawn = [n.x + 0.5, n.y + 0.5, n.h];
            events.push({ type: 'rest', id: r.id, note: r.note });
        } else if (t.kind === 'sign') {
            events.push({ type: 'read', text: r.text });
        } else if (t.kind === 'merchant') {
            events.push({ type: 'shop' });
        } else if (t.kind === 'gate') {
            if (h.seals >= SEALS) {
                this.won = true;
                events.push({ type: 'descend' });
            } else events.push({ type: 'gate-locked', have: h.seals });
        }
    }

    // ---- creatures
    hostile(c) {
        const t = c.k.temper;
        if (c.hostileUntil > this.t) return true;
        if (t === 'aggressive' || t === 'ranged') return true;
        if (t === 'nocturnal') return this.night;
        return false;
    }

    timid(c) {
        const t = c.k.temper;
        return t === 'timid' || (t === 'nocturnal' && !this.night && c.hostileUntil <= this.t);
    }

    updateCreature(c, dt, events) {
        const b = this.body;
        const dx = b.x - c.x;
        const dy = b.y - c.y;
        const dz = b.z - c.z;
        const d = Math.hypot(dx, dy);
        if (d > ACTIVE || Math.abs(dz) > 14) return;
        c.cd = Math.max(0, c.cd - dt);
        c.hurt = Math.max(0, c.hurt - dt);
        c.think -= dt;
        // knockback drains away
        c.kx *= Math.exp(-dt * 10);
        c.ky *= Math.exp(-dt * 10);
        if (c.stun > 0) { c.stun -= dt; return; }
        const k = c.k;
        const hostile = this.hostile(c);
        const reach = 0.95 + 0.3 * c.scale;
        const near = Math.abs(dz) < (c.fly ? 1.8 : 1.3);
        const leashed = k.leash && Math.hypot(b.x - nodePos(c.home)[0], b.y - nodePos(c.home)[1]) > k.leash;
        const chasing = hostile && d < (k.aggro ?? 8) && Math.abs(dz) < 3.5 && !leashed;
        if (d > 0.05 && (chasing || c.windup > 0)) c.facing = [dx / d, dy / d];

        // melee: wind up, then strike if still close
        if (c.windup > 0) {
            c.windup -= dt;
            if (c.windup <= 0) {
                c.cd = k.cd ?? 1.2;
                if (d < reach + 0.35 && near && this.hero.invuln === 0) this.hurtHero(c.dmg, c.kind, events, true, [c.x, c.y]);
                events.push({ type: 'strike', id: c.id });
            }
            return;
        }
        if (chasing && k.temper === 'ranged') {
            // keep between 3 and 6 away, spit when ready
            if (c.cd === 0 && d < 7.5 && d > 1.2) {
                c.cd = k.cd ?? 2;
                const speed = 6.5;
                this.projectiles.push({ id: this.uid++, x: c.x, y: c.y, z: c.z + 0.6, vx: (dx / d) * speed, vy: (dy / d) * speed, vz: (dz / Math.max(d, 1)) * speed * 0.6, life: 2.2, dmg: c.dmg, by: c.kind });
                events.push({ type: 'spit', id: c.id });
            }
            if (d < 3 && c.think < 0) { c.think = 0.6; this.goAway(c, 5); }
            else if (d > 6.5 && c.think < 0) { c.think = 0.5; this.goTo(c, this.heroNode(), 24); }
        } else if (chasing && d < reach && near && c.cd === 0 && k.dmg > 0) {
            c.windup = 0.38;
            c.path = [];
            c.seg = null;
            events.push({ type: 'windup', id: c.id });
            return;
        } else if (c.fly) {
            this.fly(c, dt, chasing, d);
            return;
        } else if (chasing) {
            if (c.think < 0) {
                c.think = 0.45;
                this.goTo(c, this.heroNode(), 26, true);
            }
        } else if (this.timid(c) && d < 3.8) {
            if (c.think < 0) { c.think = 0.5; this.goAway(c, 6); }
        } else if (c.think < 0 && !c.path.length && !c.seg) {
            c.think = 1.5 + this.rng() * 3;
            if (k.leash && Math.hypot(c.x - nodePos(c.home)[0], c.y - nodePos(c.home)[1]) > 2) this.goTo(c, c.home, 30);
            else if (this.rng() < 0.65) this.wander(c);
        }
        this.walk(c, dt, chasing ? 1 : this.timid(c) && d < 4 ? 1.1 : 0.55);
    }

    heroNode() {
        const b = this.body;
        const n = this.world.nodeAt(b.x, b.y, b.z);
        if (n && !n.swim) this.lastHeroNode = n;
        return this.lastHeroNode ?? n;
    }

    goTo(c, goal, limit, stopShort = false) {
        if (!goal) return;
        const path = this.world.path(c.node, goal, { drops: true, swim: false }, limit);
        if (!path) return;
        path.shift();
        if (stopShort && path.length) path.pop();
        c.path = path;
    }

    goAway(c, radius) {
        const b = this.body;
        const { order } = this.world.bfs(c.node, { drops: true, swim: false }, radius);
        let best = null;
        let bd = -1;
        for (const n of order) {
            if (n.rise) continue;
            const [x, y] = nodePos(n);
            const d = Math.hypot(x - b.x, y - b.y) + this.rng() * 0.8;
            if (d > bd) { bd = d; best = n; }
        }
        if (best) this.goTo(c, best, radius + 2);
    }

    wander(c) {
        const { order } = this.world.bfs(c.node, { drops: false, swim: false }, 4);
        const opts = order.filter((n) => !n.rise && Math.abs(n.h - c.home.h) <= 1 && Math.hypot(n.x - c.home.x, n.y - c.home.y) < 6);
        if (opts.length) this.goTo(c, opts[Math.floor(this.rng() * opts.length)], 8);
    }

    // follow the node path: smooth moves from node to node, heights blended
    walk(c, dt, pace) {
        if (!c.seg && c.path.length) {
            const next = c.path.shift();
            c.seg = { from: nodePos(c.node), to: nodePos(next), node: next, t: 0 };
            const len = Math.hypot(c.seg.to[0] - c.seg.from[0], c.seg.to[1] - c.seg.from[1]) || 0.5;
            c.seg.len = len;
        }
        if (c.seg) {
            const s = c.seg;
            s.t = Math.min(1, s.t + (dt * c.k.speed * pace) / s.len);
            const e = s.t;
            const [fx, fy, fz] = s.from;
            const [tx, ty, tz] = s.to;
            c.x = fx + (tx - fx) * e;
            c.y = fy + (ty - fy) * e;
            // drops fall late, climbs rise early
            const ez = tz < fz ? e * e : Math.sqrt(e);
            c.z = fz + (tz - fz) * ez;
            if (Math.hypot(tx - fx, ty - fy) > 0.05) c.facing = [(tx - fx) / s.len, (ty - fy) / s.len];
            if (s.t >= 1) { c.node = s.node; c.seg = null; }
        }
        c.x += c.kx * dt * 4;
        c.y += c.ky * dt * 4;
    }

    fly(c, dt, chasing, d) {
        const b = this.body;
        const home = nodePos(c.home);
        let goal;
        if (chasing) goal = [b.x, b.y, b.z + 0.7];
        else if (this.timid(c) && d < 4) goal = [c.x + (c.x - b.x), c.y + (c.y - b.y), c.z + 0.4];
        else {
            if (!c.drift || c.think < 0) {
                c.think = 1.5 + this.rng() * 2;
                c.drift = [home[0] + (this.rng() - 0.5) * 6, home[1] + (this.rng() - 0.5) * 6, home[2] + 0.9 + this.rng() * 1.2];
            }
            goal = c.drift;
        }
        const v = [goal[0] - c.x, goal[1] - c.y, goal[2] - c.z];
        const len = Math.hypot(...v);
        const speed = c.k.speed * (chasing ? 1 : 0.6);
        if (len > 0.2) {
            c.x += (v[0] / len) * Math.min(len, speed * dt);
            c.y += (v[1] / len) * Math.min(len, speed * dt);
            c.z += (v[2] / len) * Math.min(len, speed * dt);
            if (Math.hypot(v[0], v[1]) > 0.1) c.facing = [v[0] / Math.hypot(v[0], v[1]), v[1] / Math.hypot(v[0], v[1])];
        }
        c.x += c.kx * dt * 4;
        c.y += c.ky * dt * 4;
        // never stray too far from home
        if (Math.hypot(c.x - home[0], c.y - home[1]) > 12 && !chasing) c.drift = null;
    }

    updateProjectiles(dt, events) {
        const b = this.body;
        const w = this.world;
        for (const p of this.projectiles) {
            if (p.life <= 0) continue;
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            if (w.solid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) { p.life = 0; events.push({ type: 'fizzle', p }); continue; }
            if (Math.hypot(p.x - b.x, p.y - b.y) < 0.45 && p.z > b.z - 0.2 && p.z < b.z + PHYS.H + 0.2) {
                p.life = 0;
                if (this.hero.invuln === 0) this.hurtHero(p.dmg, p.by, events, true, [p.x - p.vx, p.y - p.vy]);
                events.push({ type: 'fizzle', p });
            }
        }
        this.projectiles = this.projectiles.filter((p) => p.life > 0);
    }

    // ---- moving on
    carry() {
        const { hp, maxHp, dmg, coins, potions } = this.hero;
        return { hp: Math.min(maxHp, hp + 2), maxHp, dmg, coins, potions };
    }

    next() {
        return new Game({ seed: this.seed * 7 + 13, depth: this.depth + 1, hero: this.carry(), codex: [...this.codex], time: this.time });
    }
}

export { B, BIOMES, KINDS, RELICS, SHOP, sameNode, nodeKey };
