// Hexodus: escape a black hole through rings of hexes. Rendering-free game logic.
//
// The black hole sits in hex (0, 0). Ring k around it (Red Blob cube_ring) has 6k
// cells. The ship orbits the hole on its own; gravity pulls it inward, a tap
// throws it outward. Entering a cell:
//   CRYSTAL breaks for a point, GOLD gives 3,
//   WALL bounces the ship back (entered from another ring) or reverses its orbit
//   (entered along the ring), SPIKE kills.
// The event horizon swallows ring after ring, faster and faster.
// Rings are generated lazily in bands of 4 with a theme per band, so the game is
// endless and harder the further out you get.

import { distance, hexToPixel, key, pixelToHex, ring } from './hex.js';

export const CELL = { EMPTY: 0, CRYSTAL: 1, WALL: 2, SPIKE: 3, GOLD: 4 };

export const TUNING = {
    gravity: 22, // units / s², toward the hole (hex size = 1)
    tapSpeed: 7.2, // units / s, set by a tap: rises ~1.2 units, less than a ring
    maxFall: 10,
    bounce: 5,
    orbitSpeed: 2.8, // units / s along the orbit
    orbitSpeedPerRing: 0.04,
    orbitSpeedMax: 6,
    horizonSpeed: 0.12, // rings / s
    horizonAccel: 0.0022, // rings / s²
    startRing: 3,
    calmRings: 3,
    band: 4,
};

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

const hash = (seed, n) => Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n + 0x632be5ab, 0xc2b2ae35);

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

// The field of cells. Every ring is generated from (seed, ring) alone, so the
// order in which rings are requested does not matter.
export class World {
    constructor(seed) {
        this.seed = seed >>> 0;
        this.cells = new Map();
        this.built = 0;
        this.themes = [];
    }

    type(q, r) {
        const k = distance(q, r);
        if (k > this.built) this.ensure(k);
        return this.cells.get(key(q, r)) ?? CELL.EMPTY;
    }

    ensure(k) {
        while (this.built < k) this.build(++this.built);
    }

    theme(band) {
        if (this.themes[band] === undefined) {
            const rng = mulberry32(hash(this.seed, 100000 + band));
            const d = band;
            this.themes[band] = {
                kind: band === 0
                    ? 'field'
                    : pickWeighted(rng, {
                        field: 3,
                        teeth: 2 + 0.5 * d,
                        gate: 1 + 0.4 * d,
                        spokes: 1.5,
                        spiral: d >= 2 ? 1 + 0.3 * d : 0,
                    }),
                spokes: [0, 1, 2, 3, 4, 5].filter(() => rng() < 0.45),
                offset: Math.floor(rng() * 6),
            };
        }
        return this.themes[band];
    }

    build(k) {
        const cells = ring(k);
        const n = cells.length;
        const rng = mulberry32(hash(this.seed, k));
        const types = new Uint8Array(n);
        const set = (i, t) => {
            types[((i % n) + n) % n] = t;
        };
        const sprinkle = (p) => {
            for (let i = 0; i < n; i++) if (rng() < p) types[i] = CELL.CRYSTAL;
        };

        if (k <= TUNING.calmRings) {
            sprinkle(0.3);
        } else {
            const band = Math.floor((k - TUNING.calmRings - 1) / TUNING.band);
            const pos = (k - TUNING.calmRings - 1) % TUNING.band; // 0..3 inside the band
            const d = band;
            const theme = this.theme(band);
            if (theme.kind === 'field') {
                sprinkle(0.32);
                const spikes = Math.round(n * Math.min(0.02 + 0.006 * d, 0.09));
                for (let s = 0; s < spikes; s++) set(Math.floor(rng() * n), CELL.SPIKE);
            } else if (theme.kind === 'teeth') {
                sprinkle(0.3);
                if (pos === 1 || (d >= 4 && pos === 3)) {
                    const count = Math.max(2, Math.min(Math.round(n * (0.08 + 0.01 * d)), Math.floor(n / 4)));
                    const start = Math.floor(rng() * n);
                    for (let t = 0; t < count; t++) set(start + Math.round((t * n) / count), CELL.SPIKE);
                }
            } else if (theme.kind === 'gate') {
                sprinkle(0.3);
                if (pos === 2) {
                    // spikes all around except a few gaps; hex sides make natural gates
                    const gaps = Math.max(1, 3 - Math.floor(d / 4));
                    const width = Math.max(3, 6 - Math.floor(d / 3));
                    types.fill(CELL.SPIKE);
                    const start = Math.floor(rng() * n);
                    for (let g = 0; g < gaps; g++) {
                        const at = start + Math.round((g * n) / gaps);
                        for (let w = 0; w < width; w++) set(at + w, CELL.CRYSTAL);
                    }
                }
            } else if (theme.kind === 'spokes') {
                // walls on some of the 6 corner rays: chambers where the ship ping-pongs
                sprinkle(0.36);
                for (const side of theme.spokes) if (pos !== 3 || side % 2) set(side * k, CELL.WALL);
                if (d >= 3 && rng() < 0.5) set(Math.floor(rng() * n), CELL.SPIKE);
            } else if (theme.kind === 'spiral') {
                // spikes along 3 spiral arms that twist from ring to ring
                sprinkle(0.3);
                for (let arm = 0; arm < 3; arm++) set(theme.offset * k + arm * 2 * k + pos * Math.ceil(k / 6), CELL.SPIKE);
            }
            if (rng() < 0.3) {
                const i = Math.floor(rng() * n);
                if (types[i] === CELL.EMPTY) types[i] = CELL.GOLD;
            }
        }
        cells.forEach(([q, r], i) => {
            if (types[i] !== CELL.EMPTY) this.cells.set(key(q, r), types[i]);
        });
    }
}

export class Run {
    constructor({ seed = 1 } = {}) {
        this.world = new World(seed);
        this.broken = new Set(); // keys of collected crystals and gold
        const [x, y] = hexToPixel(-TUNING.startRing, TUNING.startRing);
        this.x = x;
        this.y = y;
        this.cell = pixelToHex(x, y);
        this.vr = 0;
        this.dir = -1; // -1 clockwise, +1 counter-clockwise
        this.horizon = 0.6; // in rings; ring 0 is the hole itself
        this.eaten = 0;
        this.maxRing = TUNING.startRing;
        this.t = 0;
        this.score = 0;
        this.coins = 0;
        this.alive = true;
        this.cause = null;
        this.pendingTap = false;
    }

    get ringIndex() {
        return distance(this.cell[0], this.cell[1]);
    }

    get speed() {
        return Math.min(TUNING.orbitSpeed + TUNING.orbitSpeedPerRing * this.maxRing, TUNING.orbitSpeedMax);
    }

    // Shares the (deterministic) world; copies everything the run changes.
    clone() {
        const copy = Object.create(Run.prototype);
        Object.assign(copy, this);
        copy.broken = new Set(this.broken);
        copy.cell = [...this.cell];
        return copy;
    }

    typeAt(q, r) {
        const t = this.world.type(q, r);
        return this.broken.has(key(q, r)) ? CELL.EMPTY : t;
    }

    tap() {
        this.pendingTap = true;
    }

    update(dt, events = []) {
        if (!this.alive) return events;
        this.t += dt;
        if (this.pendingTap) {
            this.vr = TUNING.tapSpeed;
            this.pendingTap = false;
        }
        this.vr = Math.max(this.vr - TUNING.gravity * dt, -TUNING.maxFall);

        const R = Math.hypot(this.x, this.y);
        const theta = Math.atan2(this.y, this.x);
        const R2 = Math.max(0.01, R + this.vr * dt);
        const theta2 = theta + (this.dir * this.speed * dt) / Math.max(R, 1);
        const x2 = R2 * Math.cos(theta2);
        const y2 = R2 * Math.sin(theta2);
        const [q2, r2] = pixelToHex(x2, y2);

        if (q2 !== this.cell[0] || r2 !== this.cell[1]) {
            const k1 = this.ringIndex;
            const k2 = distance(q2, r2);
            if (k2 <= this.eaten) return this.die('horizon', events);
            const t = this.typeAt(q2, r2);
            if (t === CELL.SPIKE) return this.die('spike', events);
            if (t === CELL.WALL) {
                if (k2 !== k1) this.vr = -Math.sign(k2 - k1) * Math.max(TUNING.bounce, Math.abs(this.vr) * 0.5);
                else this.dir = -this.dir;
                events.push({ type: 'bounce', q: q2, r: r2, along: k2 === k1 });
                return this.advanceHorizon(dt, events);
            }
            if (t === CELL.CRYSTAL || t === CELL.GOLD) {
                this.broken.add(key(q2, r2));
                if (t === CELL.CRYSTAL) this.score += 1;
                else {
                    this.score += 3;
                    this.coins += 1;
                }
                events.push({ type: t === CELL.CRYSTAL ? 'break' : 'gold', q: q2, r: r2 });
            }
            this.cell = [q2, r2];
            if (k2 > this.maxRing) this.maxRing = k2;
        }
        this.x = x2;
        this.y = y2;
        return this.advanceHorizon(dt, events);
    }

    advanceHorizon(dt, events) {
        this.horizon += (TUNING.horizonSpeed + TUNING.horizonAccel * this.t) * dt;
        while (this.eaten + 1 <= this.horizon) {
            this.eaten += 1;
            events.push({ type: 'eat', ring: this.eaten });
        }
        if (this.ringIndex <= this.eaten) return this.die('horizon', events);
        return events;
    }

    die(cause, events) {
        this.alive = false;
        this.cause = cause;
        events.push({ type: 'die', cause });
        return events;
    }
}
