import { CELL, Run, makePlanet, planetSide } from './Hexodus.js';

const FRAME = 1 / 60;
const FRAMES_PER_DECISION = 6; // the bot decides every 0.1 s
const LOOKAHEAD = 6; // and looks 0.6 s ahead

// Exhaustive tap / no-tap search: a simple bot to prove the planets are passable.
function evaluate(run, depth) {
    if (!run.alive) return -1e6 + run.t; // die as late as possible
    if (run.cleared) return 1e6 - run.t; // clear as early as possible
    if (depth === 0) return run.s;
    let best = -Infinity;
    for (const tap of [false, true]) {
        const next = run.clone();
        if (tap) next.tap();
        for (let k = 0; k < FRAMES_PER_DECISION; k++) next.update(FRAME);
        best = Math.max(best, evaluate(next, depth - 1));
    }
    return best;
}

function playBot(run, maxSeconds = 150) {
    while (run.alive && !run.cleared && run.t < maxSeconds) {
        const idle = run.clone();
        const tapped = run.clone();
        tapped.tap();
        for (let k = 0; k < FRAMES_PER_DECISION; k++) {
            idle.update(FRAME);
            tapped.update(FRAME);
        }
        if (evaluate(tapped, LOOKAHEAD - 1) > evaluate(idle, LOOKAHEAD - 1)) run.tap();
        for (let k = 0; k < FRAMES_PER_DECISION; k++) run.update(FRAME);
    }
    return run;
}

describe('makePlanet', () => {
    it('grows the planet by one HEALPix step per level', () => {
        expect([0, 1, 5].map(planetSide)).toEqual([4, 5, 9]);
        expect(makePlanet(2, 7).rings.length).toBe(4 * 6 + 1);
    });

    it('puts the vortex on the north pole, portals on the 4 equator squares, a calm start', () => {
        const planet = makePlanet(3, 11);
        const { rings, type, N } = planet;
        expect(type[rings[0].cells[0]]).toBe(CELL.VOID);
        const portals = [...rings[2 * N].cells].filter((c) => type[c] === CELL.PORTAL);
        expect(portals.length).toBe(4);
        for (const r of [1, 2, 4 * N - 1]) {
            for (const c of rings[r].cells) expect([CELL.EMPTY, CELL.CRYSTAL]).toContain(type[c]);
        }
    });

    it('always leaves a gap of at least 3 cells in gate rings', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const { rings, type } = makePlanet(6, seed);
            for (const ring of rings.filter((r) => r.kind === 'gate')) {
                const open = [...ring.cells].filter((c) => type[c] !== CELL.SPIKE).length;
                expect(open).toBeGreaterThanOrEqual(3);
            }
        }
    });

    it('is deterministic for a seed', () => {
        expect(makePlanet(2, 5).type).toEqual(makePlanet(2, 5).type);
    });
});

describe('Run', () => {
    it('falls into the vortex without taps', () => {
        const run = new Run({ seed: 3 });
        for (let k = 0; k < 120 && run.alive; k++) run.update(FRAME);
        expect(run.alive).toBe(false);
        expect(run.cause).toBe('void');
    });

    it('eats rings from the north over time', () => {
        const run = new Run({ seed: 3 });
        const parked = run.planet.lastRing - 1; // a calm ring, out of the way
        const events = [];
        for (let k = 0; k < 60 * 20; k++) {
            run.v = 0;
            run.s = parked;
            run.update(FRAME, events);
        }
        expect(events.some((e) => e.type === 'eat')).toBe(true);
        expect(run.eaten).toBeGreaterThan(0);
    });

    // A 0.6 s lookahead is myopic: later planets need waiting inside a ring, which a
    // full search over tap timings (too slow for a unit test) finds for them.
    it.each([
        [0, 5],
        [1, 3],
    ])('a lookahead bot clears planet %i for at least %i of 5 seeds', (level, atLeast) => {
        let cleared = 0;
        for (const seed of [1, 2, 3, 4, 5]) {
            if (playBot(new Run({ level, seed })).cleared) cleared++;
        }
        expect(cleared).toBeGreaterThanOrEqual(atLeast);
    });
});
