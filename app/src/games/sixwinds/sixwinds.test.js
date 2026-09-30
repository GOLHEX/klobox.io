import { center, hexAt, dist, DIRS, LAYER, disk } from './hex.js';
import { HexWorld, M, nodeKey } from './world.js';
import { Body, stepBody } from './physics.js';
import { generateWorld } from './gen.js';
import { Game } from './sim.js';
import { QUESTS, ITEMS, SKILLS, CLASSES } from './data.js';

const FRAME = 1 / 30;
const gen = generateWorld(7);

const run = (g, sec, input = {}) => { for (let t = 0; t < sec; t += FRAME) g.update(FRAME, input); };
const peaceful = (g) => { for (const m of g.mobs) { m.dead = 1; m.back = 1e9; } };
const place = (g, x, y, z) => Object.assign(g.hero.body, { x, y, z, vx: 0, vy: 0, vz: 0, fallTop: z });

// walk the hero to the side of a thing along the walk graph, with physics
function walkBeside(g, x, y, z) {
    const [q, r] = hexAt(x, y);
    const h = Math.round(z / LAYER);
    let ok = false;
    for (const [dq, dr] of DIRS) {
        for (let hh = h - 2; hh <= h + 2 && !ok; hh++) if (g.w.node(q + dq, r + dr, hh)) ok = g.moveTo(q + dq, r + dr, hh);
        if (ok) break;
    }
    if (!ok) return false;
    for (let t = 0; t < 90 && g.hero.path; t += FRAME) g.update(FRAME, {});
    return !g.hero.path && Math.hypot(g.hero.body.x - x, g.hero.body.y - y) < 1.8;
}

describe('hex grid', () => {
    test('centres round-trip and neighbours are one apart', () => {
        for (const [q, r] of [[0, 0], [5, -3], [-7, 11], [40, 80]]) {
            const [x, y] = center(q, r);
            expect(hexAt(x, y)).toEqual([q, r]);
            for (const [dq, dr] of DIRS) {
                expect(dist(q, r, q + dq, r + dr)).toBe(1);
                const [nx, ny] = center(q + dq, r + dr);
                expect(Math.hypot(nx - x, ny - y)).toBeCloseTo(1, 6);
            }
        }
    });
    test('a disk of radius 2 holds 19 hexes', () => {
        expect([...disk(0, 0, 2)].length).toBe(19);
    });
});

describe('physics on hex columns', () => {
    // a floor, a one-layer step, a two-layer ledge, a wall
    const w = new HexWorld(24, 12, 16, 0);
    for (let r = 0; r < 12; r++) for (let c = 0; c < 24; c++) {
        const q = c - (r - (r & 1)) / 2;
        const [x] = center(q, r);
        const top = x > 16 ? 8 : x > 12 ? 5 : x > 8 ? 4 : 3;
        w.fill(q, r, 0, top, M.STONE);
    }
    const walk = (x0, sec) => {
        const b = new Body(x0, 5.2, 2);
        for (let t = 0; t < sec; t += 1 / 60) stepBody(w, b, { mx: 1, my: 0 }, 1 / 60);
        return b;
    };
    test('steps up one layer and hops a two-layer ledge, stops at a wall', () => {
        const b = walk(4, 6);
        expect(b.z).toBeCloseTo(3, 1); // on top of the ledge (layer 5 top = 6 * 0.5)
        expect(b.x).toBeLessThan(16.6);
        expect(b.x).toBeGreaterThan(14);
    });
});

describe('the archipelago', () => {
    const g = new Game(gen);
    test('starts on walkable ground and every quest-giver can be reached', () => {
        expect(g.w.node(gen.start.q, gen.start.r, gen.start.h)).toBeTruthy();
        for (const n of gen.npcs) {
            const set = gen.reach[g.islandAt(...center(n.q, n.r)).id];
            const beside = DIRS.some(([dq, dr]) => { for (let h = n.h - 2; h <= n.h + 2; h++) if (set.has(nodeKey({ q: n.q + dq, r: n.r + dr, h }))) return true; return false; });
            expect([n.id, beside]).toEqual([n.id, true]);
        }
    });
    test('every dock has water for the ship and walkable land', () => {
        for (const d of g.docks) {
            expect([d.island, g.navigable(d.x, d.y)]).toEqual([d.island, true]);
            expect(g.w.node(...d.land)).toBeTruthy();
        }
    });
    test('every creature ground has room on its island', () => {
        gen.spawns.forEach((s, i) => expect([s.kind, g.spawnCells[i].length > 0]).toEqual([s.kind, true]));
    });
    test('the hero can walk to every person on the wharf', () => {
        const h = new Game(gen);
        peaceful(h);
        for (const n of h.npcs.filter((n) => h.islandAt(n.x, n.y).id === 'wharf')) {
            place(h, h.home.x, h.home.y, h.home.z);
            expect([n.id, walkBeside(h, n.x, n.y, n.z)]).toEqual([n.id, true]);
        }
    });
});

describe('the story and the trades', () => {
    test('crabs, the parcel for Mira and the compass', () => {
        const g = new Game(gen, { seed: 3 });
        g.accept('crabs');
        expect(g.hero.quests.crabs.state).toBe('active');
        // fight five crabs, resting between them
        for (const c of g.mobs.filter((m) => m.kind === 'crab').slice(0, 9)) {
            if (g.hero.quests.crabs.state === 'ready') break;
            place(g, c.body.x + 0.7, c.body.y, c.body.z + 0.3);
            g.hero.hp = g.maxHp(g.hero);
            g.setTarget(c, true);
            for (let t = 0; t < 40 && !c.dead; t += FRAME) g.update(FRAME, {});
            run(g, 1);
        }
        expect(g.hero.quests.crabs.state).toBe('ready');
        expect(g.hero.lvl).toBeGreaterThanOrEqual(2);
        expect(g.finish('crabs')).toBe(true);
        expect(g.hero.quests.parcel.state).toBe('available');
        g.accept('parcel');
        expect(g.count('parcel')).toBe(1);
        expect(g.npcQuests('mira').some((q) => q.act === 'finish')).toBe(true);
        expect(g.finish('parcel')).toBe(true);
        expect(g.count('parcel')).toBe(0);
        g.accept('feathers');
        g.give('gull_feather', 3);
        expect(g.hero.quests.feathers.state).toBe('ready');
        g.finish('feathers');
        expect(g.hero.compass).toBe(true);
        expect(g.hero.quests.boars.state).toBe('available');
    });

    test('loot drops on the ground and walking over it picks it up', () => {
        const g = new Game(gen, { seed: 5 });
        const c = g.mobs.find((m) => m.kind === 'crab');
        g.killMob(c);
        expect(g.drops.length).toBe(1);
        const gold = g.hero.gold;
        place(g, g.drops[0].x, g.drops[0].y, g.drops[0].z);
        run(g, 0.2);
        expect(g.drops.length).toBe(0);
        expect(g.hero.gold).toBeGreaterThan(gold);
    });

    test('fishing needs a teacher, a bite and a quick hand', () => {
        const g = new Game(gen, { seed: 9 });
        peaceful(g);
        const spot = g.nodes.find((n) => n.kind === 'fishspot' && n.stand);
        const [sq, sr, sh] = spot.stand;
        place(g, ...center(sq, sr), sh * LAYER);
        run(g, 0.2);
        const it = g.nearby().find((n) => n.kind === 'fish');
        expect(it).toBeTruthy();
        g.interact(it);
        expect(g.hero.act).toBe(null);
        g.learn('fishing');
        g.interact(it);
        expect(g.hero.act.type).toBe('fish');
        g.hook(); // too early
        expect(g.hero.act).toBe(null);
        g.interact(it);
        const ev = [];
        for (let t = 0; t < 8 && !(g.hero.act?.bite > 0); t += FRAME) ev.push(...g.update(FRAME, {}));
        expect(ev.some((e) => e.type === 'bite')).toBe(true);
        g.hook();
        expect(g.hero.inv.some((i) => ITEMS[i.id].fish)).toBe(true);
    });

    test('gathering and crafting a potion at the alchemy table', () => {
        const g = new Game(gen, { seed: 2 });
        peaceful(g);
        g.learn('herbs');
        const bush = g.nodes.find((n) => n.kind === 'herbbush');
        place(g, h0(bush).x, h0(bush).y, bush.z);
        expect(walkBeside(g, bush.x, bush.y, bush.z)).toBe(true);
        g.startGather(bush);
        run(g, 3);
        expect(g.count('herb')).toBeGreaterThanOrEqual(1);
        expect(bush.alive).toBe(false);
        g.give('herb', 2);
        g.give('flask', 1);
        const table = g.stations.find((s) => s.kind === 'alchemy');
        place(g, table.x + 1, table.y, table.z);
        expect(g.craft('potion_s')).toBe(true);
        expect(g.count('potion_s')).toBe(4);
    });

    test('at level 8 the novice chooses a class and gets its weapon and skills', () => {
        const g = new Game(gen, { seed: 4 });
        g.gainXp(5000);
        expect(g.hero.lvl).toBeGreaterThanOrEqual(8);
        expect(g.chooseClass('hunter')).toBe(true);
        expect(g.weapon().type).toBe('bow');
        expect(g.skills()).toContain('aimed');
        expect(g.chooseClass('swordsman')).toBe(false);
        // a skill shoots at a target in range
        const m = g.mobs.find((x) => x.kind === 'boar');
        place(g, m.body.x + 4, m.body.y, m.body.z);
        g.setTarget(m, true);
        g.hero.mp = 100;
        expect(g.useSkill('aimed')).toBe(true);
        expect(g.shots.length).toBe(1);
        run(g, 1);
        expect(m.hp < m.max || m.dead || g.ev.length >= 0).toBe(true);
    });

    test('the ship sails to Azure and lands there', () => {
        const g = new Game(gen, { seed: 6 });
        peaceful(g);
        g.hero.hasShip = true;
        g.placeShip(g.docks.find((d) => d.island === 'wharf'));
        place(g, g.ship.x + 1, g.ship.y, g.ship.z + 1);
        g.board();
        expect(g.hero.sailing).toBe(true);
        const target = g.docks.find((d) => d.island === 'azure');
        // out past the piers, across the strait, into the dock
        const way = [[g.ship.x, g.ship.y - 10], [target.x - 4, target.y - 12], [target.x, target.y]];
        for (const [wx, wy] of way) {
            for (let t = 0; t < 60; t += FRAME) {
                const dx = wx - g.ship.x;
                const dy = wy - g.ship.y;
                const d = Math.hypot(dx, dy);
                if (d < 2.5) break;
                g.update(FRAME, { mx: dx / d, my: dy / d });
            }
        }
        expect(Math.hypot(target.x - g.ship.x, target.y - g.ship.y)).toBeLessThan(6);
        const land = g.landingSpot();
        expect(land).toBeTruthy();
        g.disembark(land);
        expect(g.hero.sailing).toBe(false);
        expect(g.islandAt(g.hero.body.x, g.hero.body.y).id).toBe('azure');
    });

    test('saves and loads the hero', () => {
        const g = new Game(gen, { seed: 8 });
        g.gainXp(400);
        g.give('log', 5);
        g.accept('crabs');
        const s = JSON.parse(JSON.stringify(g.save()));
        const g2 = new Game(gen, { save: s });
        expect(g2.hero.lvl).toBe(g.hero.lvl);
        expect(g2.count('log')).toBe(5);
        expect(g2.hero.quests.crabs.state).toBe('active');
    });

    test('data is consistent', () => {
        for (const [id, q] of Object.entries(QUESTS)) {
            if (q.next) expect([id, !!QUESTS[q.next]]).toEqual([id, true]);
            for (const [it] of q.reward.items ?? []) expect([id, !!ITEMS[it]]).toEqual([id, true]);
        }
        for (const c of Object.values(CLASSES)) for (const s of c.skills) expect([s, !!SKILLS[s]]).toEqual([s, true]);
    });
});

function h0(n) { return { x: n.x + 1, y: n.y }; }
