import {
    BAND, Generator, MOVES, Run, START_WORLD, T, TOP, WORLDS,
    bandCenter, bandRange, hexToPixel, passable, rowOf, trapUp, worldOf,
} from './game.js';

const blocked = (t) => !passable(t) || t === T.UP || t === T.DOWN;

// Longest safe run of moves (depth-limited), used as a bot.
function bestMove(run, depth = 9) {
    const [lo, hi] = bandRange(run.L);
    const walk = (q, r, d) => {
        if (d === 0) return 0;
        let best = 0;
        for (const [dq, dr] of [MOVES.N, MOVES.NW, MOVES.NE]) {
            const a = q + dq;
            const b = r + dr;
            if (a < lo || a > hi || blocked(run.typeAt(a, b))) continue;
            best = Math.max(best, 1 + walk(a, b, d - 1));
            if (best === d) break;
        }
        return best;
    };
    let choice = 0;
    let longest = -1;
    for (const [steer, [dq, dr]] of [[0, MOVES.N], [-1, MOVES.NW], [1, MOVES.NE]]) {
        const a = run.q + dq;
        const b = run.r + dr;
        if (a < lo || a > hi || blocked(run.typeAt(a, b))) continue;
        const len = walk(a, b, depth - 1);
        if (len > longest) {
            longest = len;
            choice = steer;
        }
    }
    return choice;
}

function step(run, events = []) {
    const dt = (1 - run.stepT) / run.speed + 1e-9;
    const t = run.t + dt;
    let steer = bestMove(run);
    if (run.until.invert > t && !(run.until.boost > t)) steer = -steer;
    run.input(steer);
    run.update(dt, events);
    return events;
}

describe('lattice', () => {
    it('moves only across hex edges, always forward', () => {
        for (const [dq, dr] of Object.values(MOVES)) {
            const [x, y] = hexToPixel(dq, dr);
            expect(Math.hypot(x, y)).toBeCloseTo(Math.sqrt(3));
            expect(y).toBeGreaterThan(0);
            expect([1, 2]).toContain(rowOf(dq, dr));
        }
    });

    it('lays the worlds side by side, the one above on the left', () => {
        for (let L = 0; L <= TOP; L++) {
            expect(worldOf(bandCenter(L))).toBe(L);
            const [lo, hi] = bandRange(L);
            expect(hi - lo + 1).toBe(BAND);
            if (L > 0) expect(bandRange(L - 1)[0]).toBe(hi + 1);
        }
        expect(WORLDS[START_WORLD].id).toBe('mountains');
    });
});

describe('Generator', () => {
    it.each(WORLDS.map((w, L) => [w.id, L]))('always leaves a safe path through %s', (_, L) => {
        const gen = new Generator(11);
        const [lo, hi] = bandRange(L);
        gen.ensure(L, 600);
        const start = gen.bands.get(L).start;
        let prev2 = null;
        let prev1 = null;
        for (let row = start; row <= 600; row++) {
            const cols = [];
            for (let q = lo; q <= hi; q++) if ((((q - row) % 2) + 2) % 2 === 0) cols.push(q);
            const reach = new Set(cols.filter((q) => {
                if (!passable(gen.type(q, (row - q) / 2))) return false;
                if (!prev1) return true;
                return prev1.has(q - 1) || prev1.has(q + 1) || (prev2 && prev2.has(q));
            }));
            expect(reach.size).toBeGreaterThan(0);
            prev2 = prev1;
            prev1 = reach;
        }
    });

    it('is deterministic for a seed', () => {
        const a = new Generator(5);
        const b = new Generator(5);
        for (let r = 0; r < 60; r++) for (let q = -3; q <= 3; q++) expect(a.type(q, r)).toBe(b.type(q, r));
    });

    it('keeps portals and pits inside the stack', () => {
        const gen = new Generator(3);
        for (let r = 0; r < 400; r++) {
            for (const L of [0, TOP]) {
                const [lo, hi] = bandRange(L);
                for (let q = lo; q <= hi; q++) {
                    const t = gen.type(q, r);
                    if (L === 0) expect([T.DOWN, T.PIT]).not.toContain(t);
                    if (L === TOP) expect(t).not.toBe(T.UP);
                }
            }
        }
    });
});

describe('Run', () => {
    it('drops a world when stepping off the right edge', () => {
        const run = new Run({ seed: 2 });
        const events = [];
        run.input(1);
        for (let k = 0; k < 400 && run.L === START_WORLD && run.alive; k++) {
            run.input(1);
            run.update(0.05, events);
        }
        expect(events.some((e) => e.type === 'fall')).toBe(true);
        expect(worldOf(run.q)).toBe(run.L);
    });

    it('holds you at the left cliff until the lift meter is full', () => {
        const run = new Run({ seed: 2 });
        run.q = bandRange(run.L)[0];
        run.input(-1);
        const events = [];
        run.stepT = 0.999;
        run.update(0.01, events);
        expect(run.L).toBe(START_WORLD);

        const climber = new Run({ seed: 2 });
        climber.q = bandRange(climber.L)[0];
        climber.liftReady = true;
        climber.typeAt(-4, 11); // generate the ledge, then clear the landing cell
        climber.gen.set(-4, 11, T.EMPTY);
        climber.input(-1);
        climber.stepT = 0.999;
        const ev = [];
        climber.update(0.01, ev);
        expect(ev.some((e) => e.type === 'climb')).toBe(true);
        expect(climber.L).toBe(START_WORLD + 1);
    });

    it('dives one world down on request, but not below hell', () => {
        const run = new Run({ seed: 4 });
        run.dive();
        run.stepT = 0.999;
        run.update(0.01);
        expect(run.L).toBe(START_WORLD - 1);
        expect(worldOf(run.q)).toBe(run.L);

        const bottom = new Run({ seed: 4, world: 0 });
        bottom.dive();
        bottom.stepT = 0.999;
        bottom.update(0.01);
        expect(bottom.L).toBe(0);
    });

    it('spends a shield on a deadly cell', () => {
        const run = new Run({ seed: 6 });
        run.shield = 1;
        run.input(0);
        run.gen.set(run.q, run.r + 1, T.KILL);
        run.stepT = 0.999;
        run.update(0.01);
        run.stepT = 0.999;
        const events = [];
        run.update(0.01, events);
        expect(run.alive).toBe(true);
        expect(run.shield).toBe(0);
        expect(events.some((e) => e.type === 'shield-pop')).toBe(true);
    });

    it('raises and lowers trap spikes over time', () => {
        const states = new Set();
        for (let t = 0; t < 2; t += 0.1) states.add(trapUp(3, 5, t));
        expect(states.size).toBe(2);
    });

    it.each([0, 2, 3, 5])('lets a lookahead bot run 500 steps through world %i', (L) => {
        const run = new Run({ seed: 9 + L, world: L });
        let guard = 0;
        while (run.alive && run.steps < 500 && guard++ < 5000) step(run);
        expect(run.alive).toBe(true);
        expect(run.steps).toBeGreaterThanOrEqual(500);
    });
});
