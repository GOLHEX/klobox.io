// Hexascent: an isometric hex runner through six stacked worlds. Rendering-free logic.
//
// Flat-top hex lattice, Red Blob axial coordinates (q, r), forward is +y. The runner
// only moves across hex edges, in the three forward directions:
//   NW (-1, +1)   N (0, +1)   NE (+1, 0)
// Every move is one step to a neighbour and takes the same time.
//
// Each world is a band of 7 hex columns. The bands sit side by side as terraces of
// one lattice: the world above is the band to the left (and higher), the world below
// is the band to the right (and lower), so both are always in view.
//   - Step off the right edge, dive, fall into a pit or take a down portal: one world down.
//   - The left edge is a cliff. Climb it when the lift meter is full (gems fill it),
//     or take an up portal.
// Lower worlds are faster and deadlier and multiply the score; higher ones are calmer.

const SQRT3 = Math.sqrt(3);

export const MOVES = { NW: [-1, 1], N: [0, 1], NE: [1, 0] };

// Flat-top layout with hex size 1.
export function hexToPixel(q, r) {
    return [1.5 * q, SQRT3 * (r + q / 2)];
}

// Cells of one row share y: row = 2r + q. NW and NE advance the row by 1, N by 2.
export const rowOf = (q, r) => 2 * r + q;

export const T = {
    EMPTY: 0,
    BREAK: 1, // smash through for points
    GEM: 2, // points and the lift meter
    BUMP: 3, // deflects you sideways
    KILL: 4, // spikes, lava
    TRAP: 5, // spikes that rise and fall
    SLOW: 6, // slime: slower for a while
    INVERT: 7, // mushroom: left and right swap for a while
    PIT: 8, // drops you a world down
    BOOST: 9, // faster, smash bumps, ignore debuffs
    SHIELD: 10, // absorbs one hit
    AURA: 11, // invulnerable for a while
    UP: 12, // portal one world up
    DOWN: 13, // portal one world down
};

const HAZARD = new Set([T.BUMP, T.KILL, T.TRAP, T.PIT]);
export const passable = (t) => !HAZARD.has(t);

// Bottom (hardest) to top (calmest). `weights` are chances per cell in scattered stretches.
export const WORLDS = [
    { id: 'hell', name: 'Ад', speed: 5.2, mult: 6, lift: 12,
        weights: { BREAK: 0.09, GEM: 0.035, BUMP: 0.07, KILL: 0.1, TRAP: 0.04, SLOW: 0.02, INVERT: 0.015, PIT: 0, BOOST: 0.008, SHIELD: 0.007, AURA: 0.003, UP: 0.002, DOWN: 0 } },
    { id: 'mine', name: 'Шахта', speed: 4.8, mult: 5, lift: 11,
        weights: { BREAK: 0.1, GEM: 0.035, BUMP: 0.075, KILL: 0.07, TRAP: 0.03, SLOW: 0.025, INVERT: 0.015, PIT: 0.02, BOOST: 0.008, SHIELD: 0.006, AURA: 0.003, UP: 0.002, DOWN: 0.002 } },
    { id: 'dungeon', name: 'Подземелье', speed: 4.4, mult: 4, lift: 10,
        weights: { BREAK: 0.1, GEM: 0.035, BUMP: 0.075, KILL: 0.05, TRAP: 0.04, SLOW: 0.02, INVERT: 0.012, PIT: 0.02, BOOST: 0.008, SHIELD: 0.006, AURA: 0.003, UP: 0.002, DOWN: 0.003 } },
    { id: 'mountains', name: 'Горы', speed: 4, mult: 3, lift: 9,
        weights: { BREAK: 0.11, GEM: 0.035, BUMP: 0.08, KILL: 0.035, TRAP: 0.015, SLOW: 0.02, INVERT: 0.01, PIT: 0.02, BOOST: 0.008, SHIELD: 0.005, AURA: 0.003, UP: 0.002, DOWN: 0.003 } },
    { id: 'clouds', name: 'Облака', speed: 3.6, mult: 2, lift: 8,
        weights: { BREAK: 0.1, GEM: 0.035, BUMP: 0.06, KILL: 0.02, TRAP: 0.008, SLOW: 0.025, INVERT: 0.012, PIT: 0.02, BOOST: 0.01, SHIELD: 0.005, AURA: 0.003, UP: 0.002, DOWN: 0.003 } },
    { id: 'space', name: 'Космос', speed: 3.2, mult: 1, lift: Infinity,
        weights: { BREAK: 0.1, GEM: 0.04, BUMP: 0.05, KILL: 0.012, TRAP: 0, SLOW: 0.015, INVERT: 0.012, PIT: 0.02, BOOST: 0.01, SHIELD: 0.005, AURA: 0.003, UP: 0, DOWN: 0.004 } },
];
export const TOP = WORLDS.length - 1;
export const START_WORLD = 3;
export const BAND = 7;
export const bandCenter = (L) => BAND * (START_WORLD - L);
export const bandRange = (L) => [bandCenter(L) - 3, bandCenter(L) + 3];
export const worldOf = (q) => START_WORLD - Math.round(q / BAND);

export const TRAP_PERIOD = 1.6;
export const EFFECT = { slow: 2.5, invert: 3, boost: 2.5, aura: 5 };

export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const hash3 = (a, b, c) => {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
    h ^= h >>> 15;
    return h >>> 0;
};
export const key = (q, r) => (q + 32768) * 65536 + (r + 32768);

// Spikes of a trap cell are up during the first half of their cycle.
export function trapUp(q, r, t) {
    const phase = (hash3(q, r, 7) % 1000) / 1000;
    return ((t / TRAP_PERIOD + phase) % 1) < 0.5;
}

function pick(rng, weights) {
    let x = rng();
    for (const [name, w] of Object.entries(weights)) {
        x -= w;
        if (x < 0) return T[name];
    }
    return T.EMPTY;
}

const CHUNK = 8; // rows per stretch
const CALM = 6; // calm rows where a band starts

// Lazily generated bands, one row at a time, so that every row has a safe cell
// reachable from the safe cells of the rows before it.
export class Generator {
    constructor(seed) {
        this.seed = seed >>> 0;
        this.cells = new Map();
        this.bands = new Map(); // L -> { start, next, reach: Map(row -> Set(q)) }
    }

    type(q, r) {
        const L = worldOf(q);
        if (L < 0 || L > TOP) return T.EMPTY;
        this.ensure(L, rowOf(q, r));
        return this.cells.get(key(q, r)) ?? T.EMPTY;
    }

    set(q, r, t) {
        if (t === T.EMPTY) this.cells.delete(key(q, r));
        else this.cells.set(key(q, r), t);
    }

    band(L, row) {
        let b = this.bands.get(L);
        if (!b) {
            b = { start: row - 30, next: row - 30, reach: new Map() };
            this.bands.set(L, b);
        }
        return b;
    }

    ensure(L, row) {
        const b = this.band(L, row);
        while (b.next <= row) this.genRow(L, b, b.next++);
    }

    chunk(L, index) {
        const rng = mulberry32(hash3(this.seed, L, index));
        const d = TOP - L; // 0 in space .. 5 in hell
        const weights = { scatter: 5, breakwall: 1.6, gate: 0.4 + 0.45 * d, slalom: 1.6, gemtrail: 1.4, boostlane: 0.8 };
        let x = rng() * Object.values(weights).reduce((a, b) => a + b, 0);
        for (const [kind, w] of Object.entries(weights)) {
            x -= w;
            if (x < 0) return { kind, a: rng(), b: rng() };
        }
        return { kind: 'scatter', a: 0, b: 0 };
    }

    genRow(L, b, row) {
        const [lo, hi] = bandRange(L);
        const cols = [];
        for (let q = lo; q <= hi; q++) if ((((q - row) % 2) + 2) % 2 === 0) cols.push(q);
        const rng = mulberry32(hash3(this.seed, L * 100003 + 17, row));
        const world = WORLDS[L];
        const types = new Map();
        const calm = row - b.start < CALM;
        const chunkIndex = Math.floor(row / CHUNK);
        const local = row - chunkIndex * CHUNK;
        const chunk = this.chunk(L, chunkIndex);
        const col = (i) => lo + i; // column i of the band, 0..6

        for (const q of cols) {
            let t = calm ? (rng() < 0.2 ? T.BREAK : T.EMPTY) : pick(rng, world.weights);
            if (!calm) {
                const i = q - lo;
                if (chunk.kind === 'breakwall' && local === 3) t = T.BREAK;
                else if (chunk.kind === 'breakwall' && local === 4) t = rng() < 0.6 ? T.BREAK : T.EMPTY;
                else if (chunk.kind === 'gate' && local === 4) {
                    const gap = Math.floor(chunk.a * 7);
                    t = Math.abs(i - gap) <= 1 ? T.GEM : (L <= 2 && chunk.b < 0.5 ? T.TRAP : T.KILL);
                } else if (chunk.kind === 'slalom' && local % 3 === 1) {
                    const left = Math.floor(local / 3) % 2 === 0;
                    t = (left ? i <= 3 : i >= 3) ? T.BUMP : rng() < 0.3 ? T.BREAK : T.EMPTY;
                } else if (chunk.kind === 'gemtrail') {
                    const lane = Math.floor(chunk.a * 5) + (chunk.b < 0.5 ? 1 : -1) * Math.floor(local / 2);
                    if (i === ((lane % 7) + 7) % 7) t = T.GEM;
                } else if (chunk.kind === 'boostlane') {
                    const lane = Math.floor(chunk.a * 7);
                    if (i === lane) t = local === 0 ? T.BOOST : T.BREAK;
                }
            }
            if (t === T.UP && L === TOP) t = T.EMPTY;
            if ((t === T.DOWN || t === T.PIT) && L === 0) t = T.EMPTY;
            types.set(q, t);
        }

        // Keep a path: a row needs a passable cell with a safe predecessor
        // (row - 1 through a diagonal, row - 2 straight ahead).
        const r1 = b.reach.get(row - 1);
        const r2 = b.reach.get(row - 2);
        const fed = (q) => row - b.start < 2 || (r1 && (r1.has(q - 1) || r1.has(q + 1))) || (r2 && r2.has(q));
        let reach = cols.filter((q) => passable(types.get(q)) && fed(q));
        if (reach.length === 0) {
            const options = cols.filter(fed);
            const q = options[Math.floor(rng() * options.length)] ?? cols[0];
            types.set(q, T.EMPTY);
            reach = [q];
        }
        b.reach.set(row, new Set(reach));
        b.reach.delete(row - 400); // older rows are behind the runner
        for (const [q, t] of types) this.set(q, (row - q) / 2, t);
    }

    // A safe cell of `row` in band L (generating it if needed).
    safeCell(L, row) {
        this.ensure(L, row);
        const reach = [...(this.bands.get(L).reach.get(row) ?? [])];
        if (!reach.length) return null;
        const q = reach[hash3(this.seed, L, row) % reach.length];
        return [q, (row - q) / 2];
    }

    forget(before) {
        for (const [k] of this.cells) {
            const q = Math.floor(k / 65536) - 32768;
            const r = (k % 65536) - 32768;
            if (rowOf(q, r) < before) this.cells.delete(k);
        }
    }
}

export class Run {
    constructor({ seed = 1, world = START_WORLD } = {}) {
        this.gen = new Generator(seed);
        this.L = world;
        this.q = bandCenter(world);
        this.r = 10;
        this.fromQ = this.q;
        this.fromR = this.r - 1;
        this.gen.ensure(world, rowOf(this.q, this.r) + 40);
        this.gen.set(this.q, this.r, T.EMPTY);
        this.stepT = 0;
        this.t = 0;
        this.until = { slow: 0, invert: 0, boost: 0, aura: 0 };
        this.shield = 0;
        this.lift = 0;
        this.liftReady = false;
        this.score = 0;
        this.steps = 0;
        this.deepest = world;
        this.alive = true;
        this.cause = null;
        this.stun = 0;
        this.steer = 0; // held input: -1 left, 0 straight, +1 right
        this.queuedSteer = null; // a quick tap counts for the next step
        this.queuedDive = false;
    }

    get world() {
        return WORLDS[this.L];
    }

    active(effect) {
        return this.until[effect] > this.t;
    }

    get speed() {
        let s = this.world.speed * (1 + Math.min(0.3, this.t * 0.002));
        if (this.active('slow')) s *= 0.6;
        if (this.active('boost')) s *= 1.7;
        return s;
    }

    typeAt(q, r) {
        return this.gen.type(q, r);
    }

    input(steer) {
        this.steer = steer;
        if (steer !== 0) this.queuedSteer = steer;
    }

    dive() {
        if (this.L > 0) this.queuedDive = true;
    }

    update(dt, events = []) {
        if (!this.alive) return events;
        this.t += dt;
        if (this.stun > 0) {
            this.stun -= dt;
            return events;
        }
        this.stepT += dt * this.speed;
        while (this.stepT >= 1 && this.alive) {
            this.stepT -= 1;
            this.arrive(events);
            if (this.alive) this.plan(events);
        }
        return events;
    }

    // Pick the next cell from the input, the band edges and bumps.
    plan(events) {
        this.fromQ = this.q;
        this.fromR = this.r;
        if (this.queuedDive) {
            this.queuedDive = false;
            this.teleport(this.L - 1, BAND, -3, 'dive', events);
            return;
        }
        let steer = this.queuedSteer ?? this.steer;
        this.queuedSteer = null;
        if (this.active('invert') && !this.active('boost')) steer = -steer;
        const [dq, dr] = steer < 0 ? MOVES.NW : steer > 0 ? MOVES.NE : MOVES.N;
        let q = this.q + dq;
        let r = this.r + dr;
        const [lo, hi] = bandRange(this.L);

        const boosting = this.active('boost');
        const rock = (a, b) => this.typeAt(a, b) === T.BUMP && !boosting;
        if (q > hi) {
            // off the right edge: down a world, or into the abyss below hell
            if (this.L === 0) return this.die('abyss', events);
            if (rock(q, r)) {
                // a rock on the ledge below: bounce back and keep going straight
                events.push({ type: 'bump', q, r });
                q = this.q;
                r = this.r + 1;
            } else {
                this.L -= 1;
                this.deepest = Math.min(this.deepest, this.L);
                events.push({ type: 'fall', world: this.L });
            }
        } else if (q < lo) {
            if (this.liftReady && this.L < TOP && !rock(q, r)) {
                this.L += 1;
                this.lift = 0;
                this.liftReady = false;
                events.push({ type: 'climb', world: this.L });
            } else {
                events.push({ type: 'wall', q, r });
                q = this.q;
                r = this.r + 1;
            }
        }

        if (rock(q, r)) {
            events.push({ type: 'bump', q, r });
            const [blo, bhi] = bandRange(this.L);
            const options = [MOVES.N, MOVES.NE, MOVES.NW]
                .map(([a, b]) => [this.q + a, this.r + b])
                .filter(([a, b]) => a >= blo && a <= bhi && !(a === q && b === r));
            const safe = options.find(([a, b]) => passable(this.typeAt(a, b)));
            const any = options.find(([a, b]) => this.typeAt(a, b) !== T.BUMP);
            const next = safe ?? any;
            if (!next) {
                // boxed in by rocks: a short stun, then smash through
                this.stun = 0.35;
                this.gen.set(q, r, T.EMPTY);
                events.push({ type: 'smash', q, r });
            } else {
                [q, r] = next;
            }
        }
        this.q = q;
        this.r = r;
    }

    // Effects of the cell the runner has just reached.
    arrive(events) {
        const { q, r } = this;
        if (q === this.fromQ && r === this.fromR) return;
        this.steps += 1;
        const mult = this.world.mult;
        if (this.steps % 8 === 0) this.score += mult;
        const t = this.typeAt(q, r);
        const clear = () => this.gen.set(q, r, T.EMPTY);
        const hit = (cause) => {
            if (this.active('aura')) {
                clear();
                events.push({ type: 'aura-save', q, r });
            } else if (this.shield > 0) {
                this.shield -= 1;
                clear();
                events.push({ type: 'shield-pop', q, r });
            } else {
                this.die(cause, events);
            }
        };
        switch (t) {
            case T.BREAK:
                clear();
                this.score += mult;
                events.push({ type: 'break', q, r });
                break;
            case T.GEM:
                clear();
                this.score += 3 * mult;
                this.lift += 1;
                events.push({ type: 'gem', q, r });
                if (this.lift >= this.world.lift && !this.liftReady) {
                    this.liftReady = true;
                    const cell = this.gen.safeCell(this.L, rowOf(q, r) + 10);
                    if (cell) this.gen.set(cell[0], cell[1], T.UP);
                    events.push({ type: 'lift' });
                }
                break;
            case T.BUMP: // only reachable while boosting
                clear();
                this.score += mult;
                events.push({ type: 'smash', q, r });
                break;
            case T.KILL:
                hit('kill');
                break;
            case T.TRAP:
                if (trapUp(q, r, this.t)) hit('trap');
                break;
            case T.PIT:
                if (this.L === 0) hit('abyss');
                else this.teleport(this.L - 1, BAND, -3, 'pit', events);
                break;
            case T.SLOW:
                if (!this.active('boost')) {
                    this.until.slow = this.t + EFFECT.slow;
                    events.push({ type: 'slow', q, r });
                }
                break;
            case T.INVERT:
                clear();
                if (!this.active('boost')) {
                    this.until.invert = this.t + EFFECT.invert;
                    events.push({ type: 'invert', q, r });
                }
                break;
            case T.BOOST:
                this.until.boost = this.t + EFFECT.boost;
                events.push({ type: 'boost', q, r });
                break;
            case T.SHIELD:
                clear();
                this.shield = Math.min(2, this.shield + 1);
                events.push({ type: 'shield', q, r });
                break;
            case T.AURA:
                clear();
                this.until.aura = this.t + EFFECT.aura;
                events.push({ type: 'aura', q, r });
                break;
            case T.UP:
                clear();
                if (this.L < TOP) {
                    this.lift = 0;
                    this.liftReady = false;
                    this.teleport(this.L + 1, -BAND, 4, 'portal-up', events);
                }
                break;
            case T.DOWN:
                clear();
                if (this.L > 0) this.teleport(this.L - 1, BAND, -3, 'portal-down', events);
                break;
            default:
        }
    }

    // Jump to world L at the same place of its band, onto a cleared landing pad.
    teleport(L, dq, dr, kind, events) {
        const fromL = this.L;
        this.L = L;
        this.q += dq;
        this.r += dr;
        this.gen.ensure(L, rowOf(this.q, this.r) + 40);
        for (const [a, b] of [[0, 0], [0, 1], [0, 2], [-1, 1], [1, 0]]) {
            const [lo, hi] = bandRange(L);
            if (this.q + a >= lo && this.q + a <= hi) this.gen.set(this.q + a, this.r + b, T.EMPTY);
        }
        this.fromQ = this.q;
        this.fromR = this.r;
        this.deepest = Math.min(this.deepest, L);
        events.push({ type: kind, world: L, from: fromL });
    }

    die(cause, events) {
        this.alive = false;
        this.cause = cause;
        events.push({ type: 'die', cause });
        return events;
    }
}
