import { FLOOR, M, generateWorld, key3, nodeKey } from './world.js';
import { Game, KINDS, nodePos } from './sim.js';

const same = (a, b) => a.x === b.x && a.y === b.y && a.h === b.h;

describe('generateWorld', () => {
    it('builds three layers joined from the island down to the portal', () => {
        for (let seed = 1; seed <= 25; seed++) {
            const w = generateWorld(seed, 1 + (seed % 3));
            expect(w.start.h).toBe(FLOOR.ISLAND);
            expect(w.portal.h).toBe(FLOOR.CITY);
            const path = w.path(w.start, w.portal);
            expect(path).not.toBeNull();
            for (let i = 1; i < path.length; i++) expect(w.neighbors(path[i - 1]).some((n) => same(n, path[i]))).toBe(true);
            expect(path.some((n) => n.h === FLOOR.GROTTO)).toBe(true);
        }
    });

    it('places a key by a sleeping dog, a locked chest, and two shard carriers', () => {
        const w = generateWorld(4);
        expect(w.items.some((i) => i.kind === 'key')).toBe(true);
        expect(w.spawns.filter((s) => s.kind === 'dog')).toHaveLength(1);
        expect(w.chests.some((c) => c.locked && c.loot.includes('shard'))).toBe(true);
        expect(w.spawns.filter((s) => s.loot?.includes('shard'))).toHaveLength(2);
    });

    it('keeps every stair supported with headroom, and ladders two-way', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const w = generateWorld(seed);
            for (const k of w.stairs.keys()) {
                const x = k % 1024;
                const y = Math.floor(k / 1024) % 1024;
                const z = Math.floor(k / 1048576);
                expect(w.get(x, y, z + 1)).toBe(M.AIR);
                expect(w.get(x, y, z + 2)).toBe(M.AIR);
            }
            for (const { bottom, top } of w.ladderList) {
                expect(w.neighbors(bottom).some((n) => same(n, top) && n.via === 'ladder')).toBe(true);
                expect(w.neighbors(top).some((n) => same(n, bottom) && n.via === 'ladder')).toBe(true);
            }
        }
    });

    it('lets you hop down short ledges but never climb them', () => {
        const w = generateWorld(2);
        for (const n of w.nodes().slice(0, 400)) {
            for (const m of w.neighbors(n)) {
                if (m.via !== 'drop') continue;
                expect(m.h).toBeLessThan(n.h);
                expect(w.neighbors(m).some((b) => same(b, n) && b.via === 'drop')).toBe(false);
            }
        }
    });
});

const FRAME = 1 / 30;
const run = (g, seconds, act = () => {}) => {
    const events = [];
    for (let t = 0; t < seconds && !g.won && !g.over; t += FRAME) {
        act(g);
        g.update(FRAME, events);
    }
    return events;
};
const isolate = (g, keep) => {
    for (const c of g.creatures) if (!keep(c)) c.hp = 0;
};

describe('Game', () => {
    it('walks the hero to a clicked floor', () => {
        const g = new Game({ seed: 3 });
        isolate(g, () => false);
        const goal = g.world.portal;
        g.moveTo(goal);
        run(g, 60);
        expect(same(g.hero.at, goal)).toBe(true);
    });

    it('opens the locked chest only with the key, and it holds a shard', () => {
        const g = new Game({ seed: 5 });
        isolate(g, () => false);
        const chest = g.chests.find((c) => c.locked);
        g.open(chest.id);
        const first = run(g, 30);
        expect(first.some((e) => e.type === 'locked')).toBe(true);
        g.hero.keys = 1;
        g.open(chest.id);
        const second = run(g, 10);
        expect(second.some((e) => e.type === 'open')).toBe(true);
        expect(g.items.some((i) => i.kind === 'shard')).toBe(true);
    });

    it('lets aggressive creatures attack, while a slime only fights back', () => {
        const g = new Game({ seed: 6 });
        const slime = g.creatures.find((c) => c.kind === 'slime');
        isolate(g, (c) => c === slime);
        g.hero.at = g.hero.to = slime.at;
        g.hero.hp = g.hero.maxHp = 50;
        const calm = run(g, 6);
        expect(calm.some((e) => e.type === 'hurt')).toBe(false);
        // it wandered off meanwhile: catch up and hit it once
        g.attack(slime.id);
        let hitIt = false;
        for (let t = 0; t < 20 && !hitIt; t += FRAME) hitIt = g.update(FRAME, []).some((e) => e.type === 'hit');
        expect(hitIt).toBe(true);
        g.hero.target = null;
        slime.hp = 99;
        const angry = run(g, 6);
        expect(angry.some((e) => e.type === 'hurt' && e.by === 'slime')).toBe(true);

        const h = new Game({ seed: 6 });
        const golem = h.creatures.find((c) => c.kind === 'golem');
        isolate(h, (c) => c === golem);
        const near = h.world.bfs(golem.at, 2).order.find((n) => !n.rise && !same(n, golem.at));
        h.hero.at = h.hero.to = near;
        h.hero.hp = h.hero.maxHp = 50;
        expect(run(h, 8).some((e) => e.type === 'hurt' && e.by === 'golem')).toBe(true);
    });

    it('drops what a creature carries when it dies', () => {
        const g = new Game({ seed: 7 });
        const ghost = g.creatures.find((c) => c.kind === 'ghost' && c.carry.includes('shard'));
        isolate(g, (c) => c === ghost);
        const events = [];
        g.hit(ghost, 99, events);
        expect(events.some((e) => e.type === 'kill')).toBe(true);
        expect(events.some((e) => e.type === 'drop' && e.item.kind === 'shard')).toBe(true);
    });

    it('keeps the ring portal shut until 3 shards are in the pocket', () => {
        const g = new Game({ seed: 8 });
        isolate(g, () => false);
        g.moveTo(g.world.portal);
        expect(run(g, 60).some((e) => e.type === 'portal-closed')).toBe(true);
        g.hero.shards = 3;
        g.moveTo(g.world.start);
        run(g, 1);
        g.moveTo(g.world.portal);
        run(g, 60);
        expect(g.won).toBe(true);
    });

    // A simple player: key, chest, shard carriers, portal; fights whatever attacks it.
    function autoplay(g) {
        const h = g.hero;
        if (h.target) return;
        if (h.path.length) return;
        const alive = g.creatures.filter((c) => c.hp > 0);
        const threat = alive.find((c) => g.hostile(c) && Math.hypot(...nodePos(h.at).map((v, i) => v - (c.fly ?? c.pos)[i])) < 2.2);
        if (threat) return g.attack(threat.id);
        const loose = g.items.find((i) => !i.taken && ['key', 'shard', 'heart', 'sword'].includes(i.kind));
        if (loose) {
            const n = g.world.node(loose.x, loose.y, Math.round(loose.h)) ?? g.nearestNode([loose.x + 0.5, loose.y + 0.5, loose.h]);
            if (!g.routeHero(n)) loose.taken = true;
            return;
        }
        const chest = g.chests.find((c) => !c.opened && (!c.locked || h.keys > 0));
        if (chest) return g.open(chest.id);
        const carrier = alive.find((c) => c.carry.includes('shard'));
        if (carrier) return g.attack(carrier.id);
        g.moveTo(g.world.portal);
    }

    it('can be won: key, chest, ghost, guardian, portal', () => {
        let wins = 0;
        for (const seed of [1, 2, 3, 4, 5]) {
            const g = new Game({ seed });
            g.hero.hp = g.hero.maxHp = 60;
            run(g, 600, autoplay);
            if (g.won) wins++;
        }
        expect(wins).toBe(5);
    });
});

export { KINDS, key3, nodeKey };
