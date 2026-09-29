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
    SANDSTONE: 26, SLAB: 27, SNOW: 28, ICE: 29, MUD: 30, BASALT: 31, ASH: 32, LAVA: 33, CLAY: 34, JGRASS: 35,
    DRYGRASS: 36, REDROCK: 37,
};

// How each material is drawn:
//   style  slab  separate stones: every top edge is bevelled, a groove between neighbours
//          soft  continuous ground: only edges above a drop are bevelled
//          wall  built walls: straight sides merged into tall faces
//   rough  natural sides: corners wander a little from layer to layer, like stacked rock
//   layers second colour for alternate strata on the sides
const mat = (name, color, extra = {}) => ({ name, solid: true, color, emit: 0, style: 'soft', rough: false, ...extra });
export const MAT = [];
MAT[M.AIR] = { name: 'air', solid: false };
MAT[M.WATER] = { name: 'water', solid: false, liquid: true, color: 0x3fb0a6 };
MAT[M.SAND] = mat('sand', 0xecc98a, { side: 0xd8a56e, rough: true, layers: 0xc99260 });
MAT[M.GRASS] = mat('grass', 0x93c060, { side: 0xa9794e, rough: true, layers: 0x9a6a44 });
MAT[M.DIRT] = mat('dirt', 0xa9794e, { rough: true, layers: 0x9a6a44 });
MAT[M.STONE] = mat('stone', 0xe3dccb, { style: 'slab' });
MAT[M.COBBLE] = mat('cobble', 0xd2cbb8, { style: 'slab' });
MAT[M.CONCRETE] = mat('concrete', 0xcfd6d2, { style: 'wall' });
MAT[M.WOOD] = mat('wood', 0xb07f52);
MAT[M.PLASTER_RED] = mat('plaster', 0xc9483e, { style: 'wall' });
MAT[M.PLASTER_TEAL] = mat('plaster', 0x4f9e9e, { style: 'wall' });
MAT[M.PLASTER_BLUE] = mat('plaster', 0x3f95b8, { style: 'wall' });
MAT[M.PLASTER_CREAM] = mat('plaster', 0xeee2c8, { style: 'wall' });
MAT[M.ROOF_RED] = mat('roof', 0xd05a45, { style: 'wall' });
MAT[M.ROOF_TEAL] = mat('roof', 0x5aa6a0, { style: 'wall' });
MAT[M.BRICK] = mat('brick', 0xc07a5a, { style: 'wall' });
MAT[M.ROCK] = mat('rock', 0xa8a39a, { style: 'slab', rough: true, layers: 0x96918a });
MAT[M.MOSS] = mat('moss', 0x7fa86a, { side: 0xa8a39a, rough: true, layers: 0x96918a });
MAT[M.GLOW] = mat('glow', 0x6ff5cf, { emit: 0.9, style: 'slab' });
MAT[M.DARKWOOD] = mat('darkwood', 0x7a5a42, { style: 'wall' });
MAT[M.LEAVES] = mat('leaves', 0x6f9a4a);
MAT[M.CORAL] = mat('coral', 0xe8837a, { rough: true });
MAT[M.METAL] = mat('metal', 0x7f8a8c, { style: 'wall' });
MAT[M.TILE] = mat('tile', 0xefe6d2, { style: 'slab' });
MAT[M.SEABED] = mat('seabed', 0xd8c89a, { rough: true, layers: 0xc4b286 });
MAT[M.PLASTER_OCHRE] = mat('plaster', 0xe0a94e, { style: 'wall' });
MAT[M.SANDSTONE] = mat('sandstone', 0xd48a58, { style: 'slab', rough: true, side: 0xc27546, layers: 0xa95f3a });
MAT[M.SLAB] = mat('slab', 0xa9b2b6, { style: 'slab', rough: true, side: 0x939ca0, layers: 0x858d91 });
MAT[M.SNOW] = mat('snow', 0xf2f6f8, { side: 0xc8dce6, rough: true, layers: 0xb3cad6 });
MAT[M.ICE] = mat('ice', 0xbfe0ee, { style: 'slab', rough: true, layers: 0xa6cfe0 });
MAT[M.MUD] = mat('mud', 0x6f5d48, { rough: true, layers: 0x5f4f3d });
MAT[M.BASALT] = mat('basalt', 0x55585f, { style: 'slab', layers: 0x4a4d54 });
MAT[M.ASH] = mat('ash', 0x74716e, { side: 0x55585f, rough: true, layers: 0x4a4d54 });
MAT[M.LAVA] = mat('lava', 0xff7a2e, { emit: 0.95, style: 'slab' });
MAT[M.CLAY] = mat('clay', 0xb8653c, { rough: true, layers: 0xa25533 });
MAT[M.JGRASS] = mat('jungle', 0x4f9a45, { side: 0xb8653c, rough: true, layers: 0xa25533 });
MAT[M.DRYGRASS] = mat('drygrass', 0xc2b36a, { side: 0xc98f5e, rough: true, layers: 0xb07a4c });
MAT[M.REDROCK] = mat('redrock', 0xc9794a, { style: 'slab', rough: true, side: 0xb86a3e, layers: 0x9c5534 });

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

    // nodes that lead into n in one move
    predecessors(n, opts = {}) {
        const out = [];
        const k = nodeKey(n);
        for (const [dq, dr] of DIRS) {
            const q = n.q + dq;
            const r = n.r + dr;
            for (let h = n.h - 2; h <= n.h + (opts.maxDrop ?? 4); h++) {
                const m = this.node(q, r, h);
                if (m && this.neighbors(m, opts).some((x) => nodeKey(x) === k)) out.push(m);
            }
        }
        return out;
    }

    // everywhere you can walk to from a and come back from: the playable ground
    strongSet(a, opts = { hop: true }) {
        const fwd = this.bfs(a, opts).prev;
        const back = new Set([nodeKey(a)]);
        const queue = [a];
        for (let i = 0; i < queue.length; i++) {
            for (const m of this.predecessors(queue[i], opts)) {
                const k = nodeKey(m);
                if (back.has(k) || !fwd.has(k)) continue;
                back.add(k);
                queue.push(m);
            }
        }
        return back;
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
