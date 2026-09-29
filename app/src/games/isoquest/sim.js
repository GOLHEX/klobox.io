// Isoquest rules: the hero, creatures, combat, loot and the ring portal. No rendering.
//
// Goal of a level: gather 3 ring shards (a locked chest by the crypt, a ghost in
// the grotto, the guardian before the portal) and step into the ring portal. The
// next level is a new, deeper diorama; the hero keeps health, sword and pockets.
//
// Tempers:
//   aggressive  chases and attacks the hero once close (golem, ghost, guardian)
//   sleeper     sleeps until the hero comes close or hits it, then aggressive (dog)
//   passive     wanders; fights back for a while when hit (slime)
//   timid       wanders; runs from the hero (pigeon)
//   peaceful    never fights; runs when hit (water spirit)

import { FLOOR, generateWorld, mulberry32, nodeKey } from './world.js';

export const KINDS = {
    slime: { name: 'Слизень', temper: 'passive', hp: 3, dmg: 1, speed: 1.3, aggro: 0, cd: 1.1, loot: [['coin', 0.8], ['potion', 0.25]] },
    pigeon: { name: 'Голубь', temper: 'timid', hp: 1, dmg: 0, speed: 2.8, aggro: 0, cd: 1, loot: [['coin', 0.5]] },
    spirit: { name: 'Дух воды', temper: 'peaceful', hp: 4, dmg: 0, speed: 0.9, aggro: 0, cd: 1, loot: [['potion', 1]] },
    golem: { name: 'Кубоголем', temper: 'aggressive', hp: 2, dmg: 1, speed: 2.2, aggro: 5, cd: 1.0, loot: [['coin', 0.6]] },
    ghost: { name: 'Призрак', temper: 'aggressive', hp: 4, dmg: 1, speed: 1.6, aggro: 6, cd: 1.3, fly: true, loot: [['coin', 0.7]] },
    dog: { name: 'Сторожевой пёс', temper: 'sleeper', hp: 6, dmg: 1, speed: 2.4, aggro: 8, wake: 2.2, cd: 1.2, loot: [['heart', 1]] },
    guardian: { name: 'Страж кольца', temper: 'aggressive', hp: 10, dmg: 1, speed: 1.4, aggro: 4, leash: 7, cd: 1.4, loot: [] },
};

export const HERO = { speed: 3.4, reach: 1.6, cd: 0.42, hp: 6, invuln: 0.7 };
export const SHARDS_NEEDED = 3;

export const nodePos = (n) => [n.x + 0.5, n.y + 0.5, n.h + (n.rise ? 0.5 : 0)];
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], (a[2] - b[2]) * 0.8);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Something that walks from node to node along the world graph.
class Walker {
    constructor(node) {
        this.at = node;
        this.to = node;
        this.t = 1;
        this.path = [];
    }

    // where it will stand when the current step ends
    get node() {
        return this.to;
    }

    get pos() {
        const a = nodePos(this.at);
        const b = nodePos(this.to);
        const t = Math.min(1, this.t);
        const p = a.map((v, k) => v + (b[k] - v) * t);
        if (this.to.via === 'drop') p[2] += Math.sin(Math.PI * t) * 0.6;
        return p;
    }

    step(dt, speed) {
        if (this.t < 1) this.t += dt * speed * (this.to.via === 'ladder' ? 0.45 : 1);
        if (this.t >= 1) {
            this.at = this.to;
            this.t = 1;
            if (this.path.length) {
                this.to = this.path.shift();
                this.t = 0;
                return true;
            }
        }
        return false;
    }

    stop() {
        this.path = [];
    }
}

export class Game {
    constructor({ seed = 1, depth = 1, hero = null } = {}) {
        this.seed = seed;
        this.depth = depth;
        this.world = generateWorld(seed, depth);
        this.rng = mulberry32(seed * 31 + depth);
        this.t = 0;
        this.over = false;
        this.won = false;
        const w = this.world;
        this.hero = Object.assign(new Walker({ ...w.start, rise: null }), {
            hp: hero?.hp ?? HERO.hp,
            maxHp: hero?.maxHp ?? HERO.hp,
            dmg: hero?.dmg ?? 1,
            coins: hero?.coins ?? 0,
            potions: hero?.potions ?? 1,
            keys: 0,
            shards: 0,
            cd: 0,
            invuln: 0,
            target: null,
            facing: [1, 0],
        });
        const scale = 1 + 0.25 * (depth - 1);
        let id = 1;
        this.creatures = w.spawns.map((s) => {
            const k = KINDS[s.kind];
            const c = Object.assign(new Walker({ x: s.x, y: s.y, h: s.h, rise: null }), {
                id: id++,
                kind: s.kind,
                hp: Math.ceil(k.hp * scale),
                maxHp: Math.ceil(k.hp * scale),
                dmg: k.dmg + (k.dmg ? Math.floor((depth - 1) / 2) : 0),
                carry: s.loot ?? [],
                home: { x: s.x, y: s.y, h: s.h, rise: null },
                state: k.temper === 'sleeper' ? 'sleep' : 'idle',
                cd: 0,
                think: this.rng(),
                hostileUntil: 0,
                fly: null,
                hurt: 0,
            });
            if (k.fly) c.fly = nodePos(c.at);
            return c;
        });
        this.items = w.items.map((it, i) => ({ id: 1000 + i, kind: it.kind, x: it.x, y: it.y, h: it.h }));
        this.chests = w.chests.map((c, i) => ({ id: 2000 + i, ...c, opened: false }));
        this.nextItem = 3000;
    }

    // ---- commands from the player
    moveTo(node) {
        const h = this.hero;
        h.target = null;
        this.routeHero(node);
    }

    attack(id) {
        const c = this.creatures.find((x) => x.id === id && x.hp > 0);
        if (c) this.hero.target = { creature: c };
    }

    open(chestId) {
        const c = this.chests.find((x) => x.id === chestId && !x.opened);
        if (c) this.hero.target = { chest: c };
    }

    drink(events = []) {
        const h = this.hero;
        if (h.potions > 0 && h.hp < h.maxHp) {
            h.potions -= 1;
            h.hp = Math.min(h.maxHp, h.hp + 3);
            events.push({ type: 'drink' });
        }
        return events;
    }

    routeHero(goal) {
        const h = this.hero;
        const path = this.world.path(h.node, goal);
        if (!path) return false;
        path.shift();
        h.path = path;
        return true;
    }

    // ---- simulation
    update(dt, events = []) {
        if (this.over || this.won) return events;
        this.t += dt;
        this.updateHero(dt, events);
        for (const c of this.creatures) if (c.hp > 0) this.updateCreature(c, dt, events);
        return events;
    }

    inReach(a, b, reach) {
        return flat(a, b) <= reach && Math.abs(a[2] - b[2]) <= 1.3;
    }

    updateHero(dt, events) {
        const h = this.hero;
        h.cd = Math.max(0, h.cd - dt);
        h.invuln = Math.max(0, h.invuln - dt);
        const target = h.target;
        if (target?.creature) {
            const c = target.creature;
            if (c.hp <= 0) h.target = null;
            else if (this.inReach(h.pos, c.fly ?? c.pos, HERO.reach)) {
                h.stop();
                if (h.t >= 1 && h.cd === 0) {
                    h.cd = HERO.cd;
                    this.face(h, c.fly ?? c.pos);
                    events.push({ type: 'swing' });
                    this.hit(c, h.dmg, events);
                }
            } else if (h.t >= 1 || !h.path.length) {
                // chase: go to the node next to it
                if (!this.routeHero(c.node)) h.target = null;
                else if (h.path.length) h.path.pop();
            }
        } else if (target?.chest) {
            const ch = target.chest;
            const close = Math.abs(h.node.x - ch.x) + Math.abs(h.node.y - ch.y) === 1 && h.node.h === ch.h;
            if (close && h.t >= 1) {
                h.target = null;
                this.openChest(ch, events);
            } else if (h.t >= 1 && !h.path.length) {
                const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]]
                    .map(([dx, dy]) => this.world.node(ch.x + dx, ch.y + dy, ch.h))
                    .filter(Boolean);
                if (!spots.some((s) => this.routeHero(s))) h.target = null;
            }
        }
        if (h.step(dt, HERO.speed)) {
            this.face(h, nodePos(h.to));
        }
        if (h.t >= 1) this.arrive(events);
    }

    face(e, p) {
        const [x, y] = e.pos;
        const dx = p[0] - x;
        const dy = p[1] - y;
        if (Math.hypot(dx, dy) > 0.05) e.facing = [dx, dy];
    }

    arrive(events) {
        const h = this.hero;
        const n = h.at;
        for (const it of this.items) {
            if (it.taken || it.x !== n.x || it.y !== n.y || Math.abs(it.h - n.h) > 0.6) continue;
            it.taken = true;
            if (it.kind === 'coin') h.coins += 1;
            else if (it.kind === 'potion') h.potions += 1;
            else if (it.kind === 'key') {
                h.keys += 1;
                const dog = this.creatures.find((c) => c.kind === 'dog' && c.state === 'sleep');
                if (dog && this.rng() < 0.5) this.wake(dog, events);
            } else if (it.kind === 'shard') h.shards += 1;
            else if (it.kind === 'heart') { h.maxHp += 1; h.hp = h.maxHp; }
            else if (it.kind === 'sword') h.dmg += 1;
            events.push({ type: 'pickup', kind: it.kind, item: it });
        }
        const p = this.world.portal;
        if (n.x === p.x && n.y === p.y && n.h === p.h && !h.path.length) {
            if (h.shards >= SHARDS_NEEDED) {
                this.won = true;
                events.push({ type: 'portal' });
            } else if (!h.portalNagged) {
                h.portalNagged = true;
                events.push({ type: 'portal-closed', have: h.shards });
            }
        } else h.portalNagged = false;
    }

    openChest(ch, events) {
        const h = this.hero;
        if (ch.locked) {
            if (h.keys <= 0) {
                events.push({ type: 'locked', chest: ch });
                return;
            }
            h.keys -= 1;
            ch.locked = false;
        }
        ch.opened = true;
        events.push({ type: 'open', chest: ch });
        const spots = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]]
            .map(([dx, dy]) => this.world.node(ch.x + dx, ch.y + dy, ch.h))
            .filter(Boolean);
        ch.loot.forEach((kind, i) => this.drop(kind, spots[i % spots.length] ?? h.at, events));
    }

    drop(kind, n, events) {
        const it = { id: this.nextItem++, kind, x: n.x, y: n.y, h: n.h + (n.rise ? 0.5 : 0) };
        this.items.push(it);
        events.push({ type: 'drop', item: it });
        // dropped right under the hero: pick it up at once
        const hn = this.hero.at;
        if (this.hero.t >= 1 && hn.x === n.x && hn.y === n.y) this.arrive(events);
    }

    hit(c, dmg, events) {
        c.hp -= dmg;
        c.hurt = 0.25;
        events.push({ type: 'hit', id: c.id, dmg });
        const k = KINDS[c.kind];
        if (c.state === 'sleep') this.wake(c, events);
        if (k.temper === 'passive') c.hostileUntil = this.t + 8;
        if (k.temper === 'timid' || k.temper === 'peaceful') c.state = 'flee';
        if (c.hp <= 0) {
            events.push({ type: 'kill', id: c.id, kind: c.kind });
            const spot = c.fly ? this.nearestNode(c.fly) : c.node;
            const loot = [...c.carry];
            for (const [kind, p] of k.loot) if (this.rng() < p) loot.push(kind);
            loot.forEach((kind) => this.drop(kind, spot, events));
        }
    }

    wake(c, events) {
        c.state = 'hunt';
        events.push({ type: 'wake', id: c.id });
    }

    nearestNode(p) {
        const nodes = this.world.nodes();
        let best = nodes[0];
        let bd = Infinity;
        for (const n of nodes) {
            const d = dist3(nodePos(n), p);
            if (d < bd) { bd = d; best = n; }
        }
        return best;
    }

    hostile(c) {
        const k = KINDS[c.kind];
        if (k.temper === 'aggressive') return true;
        if (k.temper === 'sleeper') return c.state !== 'sleep';
        if (k.temper === 'passive') return this.t < c.hostileUntil;
        return false;
    }

    updateCreature(c, dt, events) {
        const k = KINDS[c.kind];
        const h = this.hero;
        c.cd = Math.max(0, c.cd - dt);
        c.hurt = Math.max(0, c.hurt - dt);
        c.think -= dt;
        const hp = h.pos;
        const cp = c.fly ?? c.pos;
        const d = dist3(hp, cp);

        if (c.state === 'sleep') {
            // a sleeper stirs while the hero lingers nearby: sneaking past is possible
            if (d < k.wake && this.rng() < 0.4 * dt) this.wake(c, events);
            return;
        }

        const hostile = this.hostile(c);
        const aggroRange = k.temper === 'aggressive' || k.temper === 'sleeper' ? k.aggro : 10;
        const leashed = k.leash && dist3(nodePos(c.home), hp) > k.leash;
        const chasing = hostile && d < aggroRange && !leashed;

        if (chasing && this.inReach(cp, hp, 1.5)) {
            if (!c.fly) c.stop();
            if (c.cd === 0 && k.dmg > 0) {
                c.cd = k.cd;
                events.push({ type: 'attack', id: c.id });
                if (h.invuln === 0) {
                    h.hp -= c.dmg;
                    h.invuln = HERO.invuln;
                    events.push({ type: 'hurt', dmg: c.dmg, by: c.kind });
                    if (h.hp <= 0) {
                        this.over = true;
                        events.push({ type: 'dead', by: c.kind });
                    }
                }
            }
        } else if (c.fly) {
            // ghosts float straight through the air
            const goal = chasing ? [hp[0], hp[1], hp[2] + 0.2] : nodePos(c.home);
            const v = [goal[0] - c.fly[0], goal[1] - c.fly[1], goal[2] - c.fly[2]];
            const len = Math.hypot(...v);
            if (len > 0.3) for (let i = 0; i < 3; i++) c.fly[i] += (v[i] / len) * Math.min(len, k.speed * dt);
            else if (!chasing && c.think < 0) {
                c.think = 1.5 + this.rng() * 2;
                c.home = this.wanderSpot(c, 3) ?? c.home;
            }
        } else if (c.think < 0 && (c.t >= 1 || !c.path.length)) {
            c.think = chasing ? 0.35 : 1.2 + this.rng() * 2.5;
            let goal = null;
            if (chasing) goal = h.node;
            else if (c.state === 'flee' || (k.temper === 'timid' && d < 2.5)) goal = this.fleeSpot(c);
            else if (leashed || (k.leash && dist3(nodePos(c.home), c.pos) > 2)) goal = c.home;
            else if (this.rng() < 0.6) goal = this.wanderSpot(c, 3);
            if (c.state === 'flee' && d > 5) c.state = 'idle';
            if (goal) {
                const path = this.world.path(c.node, goal, chasing ? 24 : 8);
                if (path) {
                    path.shift();
                    if (chasing && path.length) path.pop();
                    c.path = path;
                }
            }
        }
        if (!c.fly) c.step(dt, k.speed * (c.state === 'flee' ? 1.3 : 1));
    }

    wanderSpot(c, radius) {
        const from = c.fly ? c.home : c.node;
        const { order } = this.world.bfs(from, radius);
        const options = order.filter((n) => !n.rise && Math.abs(n.x - c.home.x) <= radius + 1 && Math.abs(n.y - c.home.y) <= radius + 1);
        return options[Math.floor(this.rng() * options.length)] ?? null;
    }

    fleeSpot(c) {
        const { order } = this.world.bfs(c.node, 5);
        const hp = this.hero.pos;
        let best = null;
        let bd = -1;
        for (const n of order) {
            const d = dist3(nodePos(n), hp);
            if (d > bd) { bd = d; best = n; }
        }
        return best;
    }

    // hero stats carried to the next, deeper level
    // what the hero takes through the portal; the ring's light heals 3 hearts on the way
    carry() {
        const { hp, maxHp, dmg, coins, potions } = this.hero;
        return { hp: Math.min(maxHp, hp + 3), maxHp, dmg, coins, potions };
    }

    next() {
        return new Game({ seed: this.seed * 7 + 13, depth: this.depth + 1, hero: this.carry() });
    }
}

export { FLOOR, nodeKey };
