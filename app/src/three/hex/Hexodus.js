// Hexodus: a one-tap arcade game on the HEALPix hex planet (prototype logic, no rendering).
//
// The probe sits on one meridian and moves only in latitude, measured in HEALPix
// iso-latitude rings: s = 0 is the north pole (a vortex that pulls the probe back),
// s = 4N is the south pole (the exit to the next, larger planet). Every ring spins
// at its own speed. A tap throws the probe south; gravity drags it north.
// One tap rises less than a ring, so the probe can hover inside a ring and climbing
// takes a quick series of taps. Crossing into a ring hits the cell of that ring
// that is under the probe:
//   CRYSTAL breaks for a point, WALL bounces the probe back, SPIKE kills,
//   GOLD is a bonus, PORTAL (the 4 equator squares) launches the probe.
// While the probe hovers inside a ring, only a SPIKE spinning into it kills.
// The vortex slowly eats rings from the north, so standing still is not an option.
// Planet N grows by one each level: more rings, faster spin, more spikes.

import { buildHexHealpix } from './HexHealpix.js';

export const CELL = { EMPTY: 0, CRYSTAL: 1, WALL: 2, SPIKE: 3, GOLD: 4, PORTAL: 5, VOID: 6 };

export const PHYS = {
    gravity: 25.6, // rings / s², toward the north pole
    tapSpeed: 6.4, // rings / s, set (not added) by a tap: rises 0.8 ring in 0.25 s
    maxFall: 9,
    bounceSpeed: 5,
    portalSpeed: 15,
};

const TAU = Math.PI * 2;
const START_S = 1.5;

export function planetSide(level) {
    return 4 + level;
}

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

// Rings of the grid, cells sorted by longitude. Cells in a HEALPix ring are evenly spaced.
export function ringLayout(grid) {
    const R = 4 * grid.N + 1;
    const lists = Array.from({ length: R }, () => []);
    for (let c = 0; c < grid.count; c++) {
        const phi = Math.atan2(grid.positions[c * 3 + 1], grid.positions[c * 3]);
        lists[grid.ring[c]].push([(phi + TAU) % TAU, c]);
    }
    const slot = new Int32Array(grid.count);
    const rings = lists.map((list) => {
        list.sort((a, b) => a[0] - b[0]);
        const cells = Int32Array.from(list, ([, c]) => c);
        cells.forEach((c, k) => {
            slot[c] = k;
        });
        return { cells, count: cells.length, phi0: list[0][0], step: TAU / cells.length, omega: 0, kind: 'calm' };
    });
    return { rings, slot };
}

function pickWeighted(rng, weights) {
    let total = 0;
    for (const w of Object.values(weights)) total += w;
    let x = rng() * total;
    for (const [k, w] of Object.entries(weights)) {
        x -= w;
        if (x < 0) return k;
    }
    return Object.keys(weights)[0];
}

export function makePlanet(level, seed) {
    const N = planetSide(level);
    const grid = buildHexHealpix(N);
    const { rings, slot } = ringLayout(grid);
    const type = new Uint8Array(grid.count);
    const rng = mulberry32(seed);
    const last = 4 * N;

    const setRing = (r, k, t) => {
        const ring = rings[r];
        type[ring.cells[((k % ring.count) + ring.count) % ring.count]] = t;
    };
    const sprinkle = (r, p) => {
        for (let k = 0; k < rings[r].count; k++) if (rng() < p) setRing(r, k, CELL.CRYSTAL);
    };

    let prevKind = 'calm';
    let prevSign = 1;
    for (let r = 1; r < last; r++) {
        const ring = rings[r];
        const n = ring.count;
        const d = level + r / last; // difficulty grows along the planet and between planets
        // Calm rings at both poles and after a gate; a gate only follows a crystal
        // ring, so there is always somewhere to wait for the gap.
        const safe = r <= 2 || r >= last - 1 || prevKind === 'gate';
        const kind = safe
            ? 'crystal'
            : pickWeighted(rng, {
                crystal: 4,
                teeth: n >= 8 ? 2 + level : 0,
                gate: n >= 16 && r >= 4 && level >= 1 && prevKind === 'crystal' ? 0.6 + 0.6 * level : 0,
                mirror: n >= 8 ? 1 + 0.3 * level : 0,
            });

        if (kind === 'crystal') {
            sprinkle(r, 0.5);
            if (!safe && level >= 2 && n >= 8) {
                const spikes = Math.min(Math.floor(rng() * (1 + level / 2)), Math.floor(n / 6));
                for (let s = 0; s < spikes; s++) setRing(r, Math.floor(rng() * n), CELL.SPIKE);
            }
        } else if (kind === 'teeth') {
            sprinkle(r, 0.35);
            const k = Math.max(1, Math.min(Math.round(n * (0.1 + 0.025 * Math.min(level, 8))), Math.floor(n / 4)));
            const width = level >= 4 && n >= 24 ? 2 : 1;
            const offset = Math.floor(rng() * n);
            for (let t = 0; t < k; t++) {
                const at = offset + Math.round((t * n) / k);
                for (let w = 0; w < width; w++) setRing(r, at + w, CELL.SPIKE);
            }
        } else if (kind === 'gate') {
            const gap = Math.max(3, 6 - level);
            const offset = Math.floor(rng() * n);
            for (let k = 0; k < n; k++) setRing(r, offset + k, k < gap ? CELL.CRYSTAL : CELL.SPIKE);
        } else if (kind === 'mirror') {
            sprinkle(r, 0.4);
            const len = Math.round(n * (0.25 + 0.1 * rng()));
            const offset = Math.floor(rng() * n);
            for (let k = 0; k < len; k++) setRing(r, offset + k, CELL.WALL);
        }
        if (!safe && rng() < 0.2) {
            const k = Math.floor(rng() * n);
            if (type[ring.cells[k]] === CELL.EMPTY) setRing(r, k, CELL.GOLD);
        }

        const rate = Math.min(1 + 0.25 * d, 4) * (0.8 + 0.4 * rng()); // cells passing per second
        const sign = level === 0 ? 1 : rng() < 0.6 ? -prevSign : prevSign;
        ring.omega = (sign * rate * TAU) / n;
        ring.kind = kind;
        prevKind = kind;
        prevSign = sign;
    }

    // The 4 equator squares launch the probe; the north pole is the vortex.
    for (let c = 0; c < grid.count; c++) if (grid.degree[c] === 4 && grid.ring[c] === 2 * N) type[c] = CELL.PORTAL;
    type[rings[0].cells[0]] = CELL.VOID;

    return { level, N, grid, rings, slot, type, lastRing: last, voidSpeed: 0.28 + 0.06 * level };
}

export class Run {
    constructor({ level = 0, seed = 1, score = 0, coins = 0 } = {}) {
        this.seed = seed;
        this.planet = makePlanet(level, seed * 7919 + level * 104729);
        const rng = mulberry32(seed + level);
        this.psi = Float64Array.from(this.planet.rings, () => rng() * TAU);
        this.type = this.planet.type; // mutated as crystals break and rings are eaten
        this.s = START_S;
        this.v = 0;
        this.voidS = -2.5; // grace period before the vortex starts eating
        this.eaten = 0; // rings 0..eaten are gone
        this.t = 0;
        this.score = score;
        this.coins = coins;
        this.alive = true;
        this.cleared = false;
        this.cause = null;
        this.pendingTap = false;
    }

    get level() {
        return this.planet.level;
    }

    clone() {
        const copy = Object.create(Run.prototype);
        Object.assign(copy, this);
        copy.psi = Float64Array.from(this.psi);
        copy.type = Uint8Array.from(this.type);
        return copy;
    }

    // Cell of ring r currently under the probe (the probe stays at longitude 0).
    cellUnder(r) {
        const ring = this.planet.rings[r];
        if (ring.count === 1) return ring.cells[0];
        const local = (((-this.psi[r] - ring.phi0) % TAU) + TAU) % TAU;
        return ring.cells[Math.round(local / ring.step) % ring.count];
    }

    tap() {
        this.pendingTap = true;
    }

    update(dt, events = []) {
        if (!this.alive || this.cleared) return events;
        const { rings, lastRing } = this.planet;
        this.t += dt;
        for (let r = 0; r < rings.length; r++) this.psi[r] += rings[r].omega * dt;

        if (this.pendingTap) {
            this.v = PHYS.tapSpeed;
            this.pendingTap = false;
        }
        this.v = Math.max(this.v - PHYS.gravity * dt, -PHYS.maxFall);

        let s2 = this.s + this.v * dt;
        const r1 = Math.round(this.s);
        const r2 = Math.min(Math.round(s2), lastRing);
        const dir = Math.sign(r2 - r1);
        for (let r = r1 + dir; dir !== 0 && this.alive; r += dir) {
            if (r < 0) return this.die('void', events);
            const cell = this.cellUnder(r);
            const t = this.type[cell];
            if (t === CELL.VOID) return this.die('void', events);
            if (t === CELL.SPIKE) return this.die('spike', events);
            if (t === CELL.WALL) {
                this.v = -dir * Math.max(PHYS.bounceSpeed, Math.abs(this.v) * 0.5);
                s2 = r - dir * 0.55;
                events.push({ type: 'bounce', cell, ring: r });
                break;
            }
            if (t === CELL.CRYSTAL) {
                this.type[cell] = CELL.EMPTY;
                this.score += 1;
                events.push({ type: 'break', cell, ring: r });
            } else if (t === CELL.GOLD) {
                this.type[cell] = CELL.EMPTY;
                this.score += 3;
                this.coins += 1;
                events.push({ type: 'gold', cell, ring: r });
            } else if (t === CELL.PORTAL) {
                this.v = PHYS.portalSpeed;
                events.push({ type: 'portal', cell, ring: r });
            }
            if (r === r2) break;
        }
        this.s = Math.min(s2, lastRing);

        // Rings keep spinning while the probe hovers in one of them.
        const t = this.type[this.cellUnder(Math.round(this.s))];
        if (t === CELL.SPIKE) return this.die('spike', events);
        if (t === CELL.VOID) return this.die('void', events);

        // The vortex eats rings from the north pole.
        this.voidS += this.planet.voidSpeed * dt;
        while (this.eaten + 1 <= this.voidS && this.eaten + 1 < lastRing) {
            this.eaten += 1;
            for (const c of rings[this.eaten].cells) this.type[c] = CELL.VOID;
            events.push({ type: 'eat', ring: this.eaten });
        }

        if (this.s >= lastRing - 0.5) {
            this.cleared = true;
            this.score += 10;
            events.push({ type: 'clear' });
        }
        return events;
    }

    die(cause, events) {
        this.alive = false;
        this.cause = cause;
        events.push({ type: 'die', cause });
        return events;
    }

    // Next planet: one size larger, score carried over.
    next() {
        return new Run({ level: this.level + 1, seed: this.seed, score: this.score, coins: this.coins });
    }
}
