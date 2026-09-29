import { distance, hexToPixel, pixelToHex, ring } from './hex.js';
import { CELL, Run, TUNING, World } from './game.js';

describe('hex (Red Blob)', () => {
    it.each([1, 2, 5, 12])('ring %i has 6k cells, all at distance k, each next to the previous', (k) => {
        const cells = ring(k);
        expect(cells.length).toBe(6 * k);
        cells.forEach(([q, r], i) => {
            expect(distance(q, r)).toBe(k);
            const [pq, pr] = cells[(i + cells.length - 1) % cells.length];
            expect(distance(q - pq, r - pr)).toBe(1);
        });
    });

    it('round-trips hex -> pixel -> hex', () => {
        for (const [q, r] of [[0, 0], [3, -1], [-7, 4], [12, -12]]) {
            const [x, y] = hexToPixel(q, r);
            expect(pixelToHex(x + 0.3, y - 0.2)).toEqual([q, r]);
        }
    });
});

describe('World', () => {
    it('keeps the first rings calm', () => {
        const world = new World(7);
        for (let k = 1; k <= TUNING.calmRings; k++) {
            for (const [q, r] of ring(k)) expect([CELL.EMPTY, CELL.CRYSTAL]).toContain(world.type(q, r));
        }
    });

    it('does not depend on the order rings are requested in', () => {
        const a = new World(42);
        const b = new World(42);
        b.ensure(30);
        for (const [q, r] of ring(30)) expect(a.type(q, r)).toBe(b.type(q, r));
    });

    it('leaves at least 3 open cells in every ring', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const world = new World(seed);
            for (let k = 1; k <= 60; k++) {
                const open = ring(k).filter(([q, r]) => world.type(q, r) !== CELL.SPIKE).length;
                expect(open).toBeGreaterThanOrEqual(3);
            }
        }
    });
});

describe('Run', () => {
    const FRAME = 1 / 60;

    it('falls into the black hole without taps', () => {
        const run = new Run({ seed: 1 });
        for (let k = 0; k < 600 && run.alive; k++) run.update(FRAME);
        expect(run.alive).toBe(false);
        expect(run.cause).toBe('horizon');
    });

    it('orbits the hole while hovering', () => {
        const run = new Run({ seed: 1 });
        const start = Math.atan2(run.y, run.x);
        for (let k = 0; k < 60; k++) {
            if (k % 12 === 0) run.tap();
            run.update(FRAME);
        }
        expect(run.alive).toBe(true);
        expect(Math.abs(Math.atan2(run.y, run.x) - start)).toBeGreaterThan(0.2);
    });

    // A bot that tries every tap / no-tap sequence 0.6 s ahead.
    function evaluate(run, depth) {
        if (!run.alive) return -1e6 + run.t;
        if (depth === 0) return run.ringIndex;
        let best = -Infinity;
        for (const tap of [false, true]) {
            const next = run.clone();
            if (tap) next.tap();
            for (let k = 0; k < 6; k++) next.update(FRAME);
            best = Math.max(best, evaluate(next, depth - 1));
        }
        return best;
    }

    it('lets a lookahead bot escape at least 15 rings in 60 s', () => {
        for (const seed of [1, 2]) {
            const run = new Run({ seed });
            while (run.alive && run.t < 60) {
                const idle = run.clone();
                const tapped = run.clone();
                tapped.tap();
                for (let k = 0; k < 6; k++) {
                    idle.update(FRAME);
                    tapped.update(FRAME);
                }
                if (evaluate(tapped, 5) > evaluate(idle, 5)) run.tap();
                for (let k = 0; k < 6; k++) run.update(FRAME);
            }
            expect(run.alive).toBe(true);
            expect(run.maxRing).toBeGreaterThanOrEqual(15);
        }
    });
});
