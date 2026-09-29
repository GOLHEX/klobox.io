import { MAT, STOREY_HEIGHT, generate, k3 } from './generator.js';

const same = (a, b) => a.x === b.x && a.y === b.y && a.h === b.h;

describe('generate', () => {
    it.each([1, 2, 3, 4])('builds %i storeys joined by stairs, with a walkable route to the top', (storeys) => {
        for (let seed = 1; seed <= 25; seed++) {
            const L = generate({ seed, storeys });
            expect(L.storeys.length).toBe(storeys - 1);
            const route = L.route;
            for (let i = 1; i < route.length; i++) {
                expect(L.neighbors(route[i - 1]).some((n) => same(n, route[i]))).toBe(true);
            }
            expect(route[0].h).toBeLessThanOrEqual(L.base + 1);
            if (storeys > 1) expect(route[route.length - 1].h).toBe(L.base + STOREY_HEIGHT * (storeys - 1));
            // furniture and trees never stand on the route
            const nodes = new Set(L.nodes().map((n) => k3(n.x, n.y, n.h)));
            for (const n of route) expect(nodes.has(k3(n.x, n.y, n.h))).toBe(true);
        }
    });

    it('rests every stair on something and leaves headroom above it', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const L = generate({ seed, storeys: 3 + (seed % 2) });
            for (const key of L.stairs.keys()) {
                const x = key % 1024;
                const y = Math.floor(key / 1024) % 1024;
                const z = Math.floor(key / 1048576);
                const below = L.get(x, y, z - 1);
                expect(below === MAT.STAIR || L.solid(x, y, z - 1) || z === 0).toBe(true);
                expect(L.get(x, y, z + 1)).toBe(MAT.AIR);
                expect(L.get(x, y, z + 2)).toBe(MAT.AIR);
            }
        }
    });

    it('connects nodes both ways', () => {
        const L = generate({ seed: 7, storeys: 3 });
        for (const a of L.nodes()) {
            for (const b of L.neighbors(a)) expect(L.neighbors(b).some((n) => same(n, a))).toBe(true);
        }
    });

    it('is deterministic for a seed', () => {
        const a = generate({ seed: 42, storeys: 3 });
        const b = generate({ seed: 42, storeys: 3 });
        expect(a.vox).toEqual(b.vox);
        expect(a.route).toEqual(b.route);
    });
});
