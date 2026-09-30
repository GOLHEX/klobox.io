import { World, B, stairShape, nodePos, nodeKey } from './world.js';
import { Body, stepBody } from './physics.js';
import { generateLocation } from './gen.js';
import { Game, DAY, SEALS } from './sim.js';

const FRAME = 1 / 60;

// a small test yard: floor, a staircase to a platform, a ledge, a wall, a ladder, a deep pool
function yard() {
    const w = new World(24, 12, 20);
    for (let x = 0; x < 24; x++) for (let y = 0; y < 12; y++) w.set(x, y, 0, B.ROCK);
    for (let k = 0; k < 3; k++) for (let y = 0; y < 3; y++) {
        w.set(5 + k, y, 1 + k, B.ROCK, stairShape(1, 0));
        for (let z = 1; z < 1 + k; z++) w.set(5 + k, y, z, B.ROCK);
    }
    for (let x = 8; x < 12; x++) for (let y = 0; y < 3; y++) for (let z = 1; z < 4; z++) w.set(x, y, z, B.ROCK);
    for (let y = 4; y < 7; y++) w.set(6, y, 1, B.ROCK);
    for (let y = 8; y < 11; y++) { w.set(6, y, 1, B.ROCK); w.set(6, y, 2, B.ROCK); }
    for (let x = 14; x < 17; x++) for (let y = 4; y < 8; y++) for (let z = 1; z < 6; z++) w.set(x, y, z, B.ROCK);
    w.addLadder(17, 5, 1, 6, [-1, 0]);
    for (let x = 18; x < 24; x++) for (let y = 0; y < 5; y++) for (let z = 1; z < 3; z++) w.set(x, y, z, B.ROCK);
    for (let x = 19; x < 23; x++) for (let y = 0; y < 4; y++) { w.set(x, y, 1, B.WATER); w.set(x, y, 2, B.WATER); }
    return w;
}
const run = (w, b, input, secs) => {
    const ev = [];
    for (let t = 0; t < secs; t += FRAME) stepBody(w, b, input, FRAME, ev);
    return ev;
};

describe('world and physics', () => {
    it('builds stairs of four quarter steps rising the right way', () => {
        const w = yard();
        const boxes = w.boxes(5, 0, 1, 6, 1, 2);
        expect(boxes).toHaveLength(4);
        expect(Math.max(...boxes.map((b) => b[5]))).toBe(2);
        expect(boxes.find((b) => b[5] === 2)[0]).toBeCloseTo(5.75);
        expect(w.node(5, 1, 1).rise).toEqual([1, 0]);
    });

    it('walks up and down stairs, hops a low ledge, stops at a wall', () => {
        const w = yard();
        const b = new Body(2.5, 1.5, 1);
        run(w, b, { mx: 1, my: 0 }, 1.45);
        expect(b.z).toBeCloseTo(4);
        run(w, b, { mx: -1, my: 0 }, 2);
        expect(b.z).toBeCloseTo(1);
        const c = new Body(3.5, 5.5, 1);
        run(w, c, { mx: 1, my: 0 }, 0.9);
        expect(c.z).toBeGreaterThan(1.5);
        const d = new Body(3.5, 9.5, 1);
        run(w, d, { mx: 1, my: 0 }, 2);
        expect(d.x).toBeLessThan(6);
        expect(d.z).toBeCloseTo(1);
    });

    it('climbs a ladder up and down, and gets hurt by a long fall but not into water', () => {
        const w = yard();
        const b = new Body(19.5, 5.5, 1);
        run(w, b, { mx: -1, my: 0 }, 2.6);
        expect(b.z).toBeCloseTo(6);
        run(w, b, { mx: 1, my: 0 }, 3);
        expect(b.z).toBeCloseTo(1);
        const f = new Body(3.5, 1.5, 10);
        expect(run(w, f, {}, 2).some((e) => e.type === 'fall')).toBe(true);
        const p = new Body(20.5, 1.5, 12);
        expect(run(w, p, {}, 2).some((e) => e.type === 'fall')).toBe(false);
        expect(p.swimming).toBe(true);
        run(w, p, { mx: 0, my: 1 }, 2);
        expect(p.swimming).toBe(false);
        expect(p.y).toBeGreaterThan(4);
    });
});

describe('location generator', () => {
    it('stacks tiers of different biomes over the sanctum, all joined', () => {
        for (let seed = 1; seed <= 8; seed++) {
            const L = generateLocation(seed, 1 + (seed % 4));
            const biomes = L.tiers.map((t) => t.biome);
            expect(biomes[biomes.length - 1]).toBe('sanctum');
            expect(new Set(biomes).size).toBe(biomes.length);
            expect(L.campfires).toHaveLength(L.tiers.length - 1);
            // three seals: in a chest, on an elite, in a vault (or a second chest)
            const seals = L.chests.filter((c) => c.loot.includes('seal')).length + L.spawns.filter((s) => s.carry?.includes('seal')).length + L.pedestals.filter((p) => p.seal).length;
            expect(seals).toBe(3);
            expect(L.spawns.some((s) => s.kind === 'guardian')).toBe(true);
            const w = L.world;
            const path = w.path(L.start, L.gate.node, { drops: true, swim: true, hop: true });
            expect(path).not.toBeNull();
        }
    });

    it('keeps every stair with headroom and every ladder climbable', () => {
        const L = generateLocation(3, 2);
        const w = L.world;
        for (let z = 1; z < w.H - 2; z++) for (let y = 0; y < w.D; y++) for (let x = 0; x < w.W; x++) {
            if (!w.shape(x, y, z)) continue;
            expect(w.passable(x, y, z + 1)).toBe(true);
        }
        for (const l of w.ladders) {
            for (let z = l.bottom; z <= l.top; z++) expect(w.passable(l.x, l.y, z)).toBe(true);
            expect(w.solid(l.x + l.wall[0], l.y + l.wall[1], l.top - 1)).toBe(true);
            expect(w.node(l.x + l.wall[0], l.y + l.wall[1], l.top)).not.toBeNull();
        }
    });
});

// steer the body along walk-graph paths, re-planning when it drifts
function travel(g, goal, maxT = 150) {
    const w = g.world;
    const b = g.body;
    let t = 0;
    let path = null;
    let i = 1;
    let best = Infinity;
    let bestT = 0;
    let replans = 0;
    const plan = () => {
        const from = w.nodeAt(b.x, b.y, b.z);
        path = from && w.path(from, goal, { drops: true, swim: true, hop: true });
        i = 1;
        best = Infinity;
        bestT = t;
        return !!path;
    };
    if (!plan()) return false;
    while (t < maxT) {
        if (i >= path.length) return true;
        const n = path[i];
        const [tx, ty, tz] = nodePos(n);
        const dx = tx - b.x;
        const dy = ty - b.y;
        const d = Math.hypot(dx, dy);
        const onFoot = !b.climbing && (b.grounded || b.swimming);
        const zOk = n.swim ? b.swimming : Math.abs(b.z - (n.rise ? tz : n.h)) < (n.rise ? 0.7 : 0.35);
        if (d < 0.3 && zOk && onFoot) { i++; best = Infinity; bestT = t; continue; }
        const slow = n.via === 'drop' && d < 1.2 ? 0.45 : 1;
        g.update(FRAME, d > 0.05 ? { mx: (dx / d) * slow, my: (dy / d) * slow } : {}, []);
        t += FRAME;
        const score = d + Math.abs(b.z - tz);
        if (score < best - 0.05) { best = score; bestT = t; }
        if (t - bestT > 2.5 && (++replans > 12 || !plan())) return false;
    }
    return false;
}

describe('the hero in a real location', () => {
    it('can run the whole stack on foot: every campfire, then the Gates', () => {
        for (const seed of [2, 5, 9]) {
            const g = new Game({ seed });
            for (const c of g.creatures) c.hp = 0;
            const stops = [...g.campfires.map((c) => [c.x, c.y, c.z]), [g.loc.gate.node.x, g.loc.gate.node.y, g.loc.gate.node.h]];
            for (const [x, y, z] of stops) {
                const goal = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => g.world.node(x + dx, y + dy, z)).find(Boolean);
                expect(travel(g, goal)).toBe(true);
            }
        }
    });

    const beside = (g, x, y, h) => {
        const n = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => g.world.node(x + dx, y + dy, h)).find(Boolean);
        const b = g.body;
        [b.x, b.y] = nodePos(n);
        b.z = n.h;
        b.fallTop = b.z;
        b.vx = b.vy = b.vz = 0;
        b.facing = [x + 0.5 - b.x, y + 0.5 - b.y].map((v, _, a) => v / Math.hypot(...a));
        return n;
    };
    const tick = (g, secs, input = {}) => {
        const ev = [];
        for (let t = 0; t < secs; t += FRAME) g.update(FRAME, input, ev);
        return ev;
    };

    it('fights: a slime only strikes back once hit, and its loot drops', () => {
        let g;
        let slime;
        for (let seed = 1; seed < 40 && !slime; seed++) {
            g = new Game({ seed });
            slime = g.creatures.find((c) => c.kind === 'slime');
        }
        for (const c of g.creatures) if (c !== slime) c.hp = 0;
        g.hero.hp = g.hero.maxHp = 40;
        slime.hp = slime.maxHp = 30;
        beside(g, slime.node.x, slime.node.y, slime.node.h);
        expect(tick(g, 4).some((e) => e.type === 'hurt')).toBe(false);
        // walk at it and swing until it has been hit
        let hit = false;
        for (let t = 0; t < 8 && !hit; t += FRAME) {
            const b = g.body;
            const d = Math.hypot(slime.x - b.x, slime.y - b.y);
            const input = { mx: (slime.x - b.x) / d, my: (slime.y - b.y) / d, attack: d < 1.3 };
            hit = g.update(FRAME, d < 0.9 ? { attack: true } : input, []).some((e) => e.type === 'hit');
        }
        expect(hit).toBe(true);
        slime.stun = 0;
        expect(tick(g, 6).some((e) => e.type === 'hurt' && e.by === 'slime')).toBe(true);
        slime.hp = 1;
        const ev = [];
        g.hitCreature(slime, 5, ev, [1, 0]);
        expect(ev.some((e) => e.type === 'kill')).toBe(true);
    });

    it('opens a locked chest only with a key, and the Gates only with three Seals', () => {
        const g = new Game({ seed: 4 });
        for (const c of g.creatures) c.hp = 0;
        const chest = g.chests.find((c) => c.locked);
        beside(g, chest.x, chest.y, chest.z);
        expect(tick(g, 0.1, { interact: true }).some((e) => e.type === 'locked')).toBe(true);
        g.hero.keys = 1;
        const ev = tick(g, 0.1, { interact: true });
        expect(ev.some((e) => e.type === 'open')).toBe(true);
        expect(ev.filter((e) => e.type === 'drop').length).toBe(chest.loot.length);
        const gate = g.loc.gate;
        beside(g, gate.x, gate.y, gate.z);
        expect(tick(g, 0.1, { interact: true }).some((e) => e.type === 'gate-locked')).toBe(true);
        g.hero.seals = SEALS;
        expect(tick(g, 0.1, { interact: true }).some((e) => e.type === 'descend')).toBe(true);
        const next = g.next();
        expect(next.depth).toBe(2);
        expect(next.hero.coins).toBe(g.hero.coins);
    });

    it('opens the vault gate once every lever is pulled', () => {
        let g;
        for (let seed = 1; seed < 30; seed++) {
            g = new Game({ seed });
            if (g.gates.length) break;
        }
        for (const c of g.creatures) c.hp = 0;
        const gate = g.gates[0];
        const levers = g.levers.filter((l) => l.gate === gate.id);
        expect(levers.length).toBeGreaterThanOrEqual(2);
        expect(g.world.blocked(gate.x, gate.y, gate.z)).toBe(true);
        let opened = false;
        for (const l of levers) {
            beside(g, l.x, l.y, l.z);
            opened = tick(g, 0.1, { interact: true }).some((e) => e.type === 'gate-open');
        }
        expect(opened).toBe(true);
        expect(g.world.blocked(gate.x, gate.y, gate.z)).toBe(false);
    });

    it('rests at a campfire, and after a death wakes there poorer', () => {
        const g = new Game({ seed: 6 });
        for (const c of g.creatures) c.hp = 0;
        const fire = g.campfires[1];
        beside(g, fire.x, fire.y, fire.z);
        g.hero.hp = 2;
        expect(tick(g, 0.1, { interact: true }).some((e) => e.type === 'rest')).toBe(true);
        expect(g.hero.hp).toBe(g.hero.maxHp);
        g.hero.coins = 10;
        const ev = [];
        g.hurtHero(99, 'test', ev);
        expect(ev.some((e) => e.type === 'dead')).toBe(true);
        expect(g.hero.coins).toBe(5);
        expect(Math.hypot(g.body.x - g.hero.spawn[0], g.body.y - g.hero.spawn[1])).toBeLessThan(0.01);
        expect(Math.abs(g.tierAt(g.body.z) - fire.tier)).toBeLessThanOrEqual(0);
    });

    it('turns wolves hostile at night and shy by day', () => {
        let g;
        let wolf;
        for (let seed = 1; seed < 40 && !wolf; seed++) {
            g = new Game({ seed });
            wolf = g.creatures.find((c) => c.kind === 'wolf' && !c.elite);
        }
        g.time = DAY * 0.5;
        expect(g.hostile(wolf)).toBe(false);
        expect(g.timid(wolf)).toBe(true);
        g.time = DAY * 0.02;
        expect(g.night).toBe(true);
        expect(g.hostile(wolf)).toBe(true);
    });
});

export { nodeKey };
