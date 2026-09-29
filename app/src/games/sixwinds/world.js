// Six Winds world: columns of hexagonal voxels. A cell (q, r, z) is a hex prism
// LAYER high; stepping up one layer is a stair, two is a ledge to hop, three or
// more is a wall. Cells are kept in an odd-r offset rectangle so the map is a
// rectangle in world space. Props may block cells. A walk graph over standable
// cells serves creatures and the generator's checks.

import { DIRS, LAYER, center, hexAt } from './hex.js';

export const M = {
    AIR: 0, WATER: 1, SAND: 2, GRASS: 3, DIRT: 4, STONE: 5, COBBLE: 6, CONCRETE: 7, WOOD: 8, PLASTER_RED: 9,
    PLASTER_TEAL: 10, PLASTER_BLUE: 11, PLASTER_CREAM: 12, ROOF_RED: 13, ROOF_TEAL: 14, BRICK: 15, ROCK: 16,
    MOSS: 17, GLOW: 18, DARKWOOD: 19, LEAVES: 20, CORAL: 21, METAL: 22, TILE: 23, SEABED: 24, PLASTER_OCHRE: 25,
};

// flat painted colours, the look is carried by light, ink and hatching
const mat = (name, color, extra = {}) => ({ name, solid: true, color, emit: 0, ...extra });
export const MAT = [];
MAT[M.AIR] = { name: 'air', solid: false };
MAT[M.WATER] = { name: 'water', solid: false, liquid: true, color: 0x3fb0a6 };
MAT[M.SAND] = mat('sand', 0xe9d7a8);
MAT[M.GRASS] = mat('grass', 0xa9c46e, { side: 0xb8946a });
MAT[M.DIRT] = mat('dirt', 0xb8946a);
MAT[M.STONE] = mat('stone', 0xe6dfcf);
MAT[M.COBBLE] = mat('cobble', 0xd9d2c0);
MAT[M.CONCRETE] = mat('concrete', 0xcfd6d2);
MAT[M.WOOD] = mat('wood', 0xa97d55);
MAT[M.PLASTER_RED] = mat('plaster', 0xc9483e);
MAT[M.PLASTER_TEAL] = mat('plaster', 0x4f9e9e);
MAT[M.PLASTER_BLUE] = mat('plaster', 0x3f95b8);
MAT[M.PLASTER_CREAM] = mat('plaster', 0xeee2c8);
MAT[M.ROOF_RED] = mat('roof', 0xd05a45);
MAT[M.ROOF_TEAL] = mat('roof', 0x5aa6a0);
MAT[M.BRICK] = mat('brick', 0xc07a5a);
MAT[M.ROCK] = mat('rock', 0xa9a6a0);
MAT[M.MOSS] = mat('moss', 0x7fa86a, { side: 0xa9a6a0 });
MAT[M.GLOW] = mat('glow', 0x6ff5cf, { emit: 0.9 });
MAT[M.DARKWOOD] = mat('darkwood', 0x7a5a42);
MAT[M.LEAVES] = mat('leaves', 0x6f9a4a);
MAT[M.CORAL] = mat('coral', 0xe8837a);
MAT[M.METAL] = mat('metal', 0x7f8a8c);
MAT[M.TILE] = mat('tile', 0xefe6d2);
MAT[M.SEABED] = mat('seabed', 0xd8c89a);
MAT[M.PLASTER_OCHRE] = mat('plaster', 0xe0a94e);

export const key3 = (q, r, z) => ((z * 8192 + (r + 4096)) * 8192) + (q + 4096);
export const nodeKey = (n) => key3(n.q, n.r, n.h);
export const nodePos = (n) => { const [x, y] = center(n.q, n.r); return [x, y, n.h * LAYER]; };

export class HexWorld {
    constructor(W, D, H, sea = 6) {
        Object.assign(this, { W, D, H, sea });
        this.cells = new Uint8Array(W * D * H);
        this.blockers = new Map(); // key3 -> true
        this.version = 0;
    }

    col(q, r) {
        return q + (r - (r & 1)) / 2;
    }

    inside(q, r, z = 0) {
        const c = q + (r - (r & 1)) / 2;
        return c >= 0 && c < this.W && r >= 0 && r < this.D && z >= 0 && z < this.H;
    }

    idx(q, r, z) {
        return (z * this.D + r) * this.W + q + (r - (r & 1)) / 2;
    }

    get(q, r, z) {
        return this.inside(q, r, z) ? this.cells[this.idx(q, r, z)] : z < this.sea ? M.WATER : M.AIR;
    }

    set(q, r, z, m) {
        if (this.inside(q, r, z)) this.cells[this.idx(q, r, z)] = m;
    }

    solid(q, r, z) {
        return MAT[this.get(q, r, z)].solid === true;
    }

    water(q, r, z) {
        return this.get(q, r, z) === M.WATER;
    }

    blocked(q, r, z) {
        return this.blockers.has(key3(q, r, z));
    }

    passable(q, r, z) {
        return !this.solid(q, r, z) && !this.blockers.has(key3(q, r, z));
    }

    block(q, r, z, h = 2) {
        for (let k = 0; k < h; k++) this.blockers.set(key3(q, r, z + k), true);
    }

    unblock(q, r, z, h = 2) {
        for (let k = 0; k < h; k++) this.blockers.delete(key3(q, r, z + k));
    }

    // fill a column from `from` up to and including `to`
    fill(q, r, from, to, m) {
        for (let z = Math.max(0, from); z <= to; z++) this.set(q, r, z, m);
    }

    // highest solid layer at or below z (-1 if none)
    topBelow(q, r, z = this.H - 1) {
        for (let k = Math.min(z, this.H - 1); k >= 0; k--) if (this.solid(q, r, k)) return k;
        return -1;
    }

    // the standing level on this column: one above its highest solid layer
    surface(q, r) {
        return this.topBelow(q, r) + 1;
    }

    // ---- walk graph: stand at level h on solid (h - 1) with three free layers
    node(q, r, h) {
        if (h < 1 || !this.solid(q, r, h - 1) || this.blocked(q, r, h - 1)) return null;
        for (let k = 0; k < 3; k++) if (!this.passable(q, r, h + k) || this.water(q, r, h + k)) return null;
        return { q, r, h };
    }

    // opts: { hop, maxDrop }
    neighbors(n, opts = {}) {
        const out = [];
        const maxDrop = opts.maxDrop ?? 4;
        for (const [dq, dr] of DIRS) {
            const q = n.q + dq;
            const r = n.r + dr;
            const up = this.node(q, r, n.h + 1);
            if (up) { out.push({ ...up, via: 'step' }); continue; }
            const same = this.node(q, r, n.h);
            if (same) { out.push({ ...same, via: 'walk' }); continue; }
            if (opts.hop && this.passable(n.q, n.r, n.h + 3)) {
                const hop = this.node(q, r, n.h + 2);
                if (hop) { out.push({ ...hop, via: 'hop' }); continue; }
            }
            // down: one layer is a step, more is a drop
            if (!this.passable(q, r, n.h) || !this.passable(q, r, n.h + 1) || !this.passable(q, r, n.h + 2)) continue;
            for (let d = 1; d <= maxDrop; d++) {
                const m = this.node(q, r, n.h - d);
                if (m) { out.push({ ...m, via: d === 1 ? 'step' : 'drop' }); break; }
                if (!this.passable(q, r, n.h - d)) break;
            }
        }
        return out;
    }

    bfs(a, opts = {}, limit = Infinity) {
        const ka = nodeKey(a);
        const prev = new Map([[ka, null]]);
        const dist = new Map([[ka, 0]]);
        const at = new Map([[ka, a]]);
        const order = [a];
        for (let i = 0; i < order.length; i++) {
            const n = order[i];
            const kn = nodeKey(n);
            const d = dist.get(kn);
            if (d >= limit) continue;
            for (const m of this.neighbors(n, opts)) {
                const k = nodeKey(m);
                if (prev.has(k)) continue;
                prev.set(k, kn);
                dist.set(k, d + 1);
                at.set(k, m);
                order.push(m);
            }
        }
        return { prev, dist, at, order };
    }

    path(a, b, opts = {}, limit = Infinity) {
        const { prev, at } = this.bfs(a, opts, limit);
        let k = nodeKey(b);
        if (!prev.has(k)) return null;
        const out = [];
        for (; k !== null; k = prev.get(k)) out.push(at.get(k));
        return out.reverse();
    }

    // the node under a point, if any
    nodeAt(x, y, z) {
        const [q, r] = hexAt(x, y);
        const h = Math.round(z / LAYER);
        for (const hh of [h, h - 1, h + 1]) {
            const n = this.node(q, r, hh);
            if (n) return n;
        }
        return null;
    }

    // ground height (world units) under a point, water surface counts
    groundAt(x, y, z = this.H * LAYER) {
        const [q, r] = hexAt(x, y);
        for (let k = Math.min(this.H - 1, Math.floor(z / LAYER)); k >= 0; k--) {
            const m = this.get(q, r, k);
            if (MAT[m].solid) return (k + 1) * LAYER;
            if (m === M.WATER) return (k + 1) * LAYER - 0.1;
        }
        return 0;
    }
}
