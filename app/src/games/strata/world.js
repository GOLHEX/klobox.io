// Strata world: a voxel grid of blocks on the isometric cube grid.
//
// A cell holds a block id and a shape (full, or a stair rising toward one of the
// four directions). Props may take cells as blockers. Ladders are climbable
// columns against a wall. On top of that sits a walk graph used by creatures and
// by the generator's checks: a flat node stands on a full solid block with two
// free cells above, a stair node sits in a stair cell, a swim node floats on deep
// water; edges walk, climb stairs, hop down ledges, swim and use ladders.
//
// Axes: x and y are horizontal, z is up. The camera looks from +x +y +z, so the
// "back" of anything is its -x and -y side.

export const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
export const MAX_DROP = 3;
export const dirIndex = (dx, dy) => DIRS4.findIndex(([a, b]) => a === dx && b === dy);

export const B = {
    AIR: 0, GRASS: 1, DIRT: 2, ROCK: 3, COBBLE: 4, BRICK: 5, MOSSBRICK: 6, PLANK: 7, TIMBER: 8, TILE: 9,
    CRYPT: 10, METAL: 11, SAND: 12, MOSS: 13, CRYSTAL: 14, ORE: 15, BOOKS: 16, BARK: 17, WATER: 18, LAVA: 19,
    WALLPAPER: 20, THATCH: 21, ROOF: 22, BASALT: 23, CAP: 24, MARBLE: 25, CLAY: 26, LEAVES: 27, SNOW: 28,
};

// tiles name atlas cells (see textures.js); light makes a block glow
const block = (name, tiles, extra = {}) => ({ name, solid: true, liquid: false, light: null, sound: 'stone', ...tiles, ...extra });
export const BLOCKS = [];
BLOCKS[B.AIR] = { name: 'air', solid: false, liquid: false };
BLOCKS[B.GRASS] = block('grass', { top: 'grass', side: 'grassSide', bottom: 'dirt' }, { sound: 'grass' });
BLOCKS[B.DIRT] = block('dirt', { top: 'dirt', side: 'dirt', bottom: 'dirt' }, { sound: 'grass' });
BLOCKS[B.ROCK] = block('rock', { top: 'rockTop', side: 'rock', bottom: 'rock' });
BLOCKS[B.COBBLE] = block('cobble', { top: 'cobble', side: 'cobble', bottom: 'cobble' });
BLOCKS[B.BRICK] = block('brick', { top: 'brickTop', side: 'brick', bottom: 'brick' });
BLOCKS[B.MOSSBRICK] = block('mossbrick', { top: 'mossTop', side: 'mossBrick', bottom: 'brick' });
BLOCKS[B.PLANK] = block('plank', { top: 'plank', side: 'plankSide', bottom: 'plank' }, { sound: 'wood' });
BLOCKS[B.TIMBER] = block('timber', { top: 'plank', side: 'timber', bottom: 'plank' }, { sound: 'wood' });
BLOCKS[B.TILE] = block('tile', { top: 'tile', side: 'brick', bottom: 'brick' });
BLOCKS[B.CRYPT] = block('crypt', { top: 'cryptTop', side: 'crypt', bottom: 'crypt' });
BLOCKS[B.METAL] = block('metal', { top: 'metal', side: 'metalSide', bottom: 'metal' }, { sound: 'metal' });
BLOCKS[B.SAND] = block('sand', { top: 'sand', side: 'sand', bottom: 'sand' }, { sound: 'sand' });
BLOCKS[B.MOSS] = block('moss', { top: 'moss', side: 'rockMoss', bottom: 'rock' }, { sound: 'grass' });
BLOCKS[B.CRYSTAL] = block('crystal', { top: 'crystal', side: 'crystal', bottom: 'crystal' }, { light: { color: 0x7fe8ff, intensity: 0.8, range: 4 } });
BLOCKS[B.ORE] = block('ore', { top: 'rockTop', side: 'ore', bottom: 'rock' });
BLOCKS[B.BOOKS] = block('books', { top: 'plank', side: 'books', bottom: 'plank' }, { sound: 'wood' });
BLOCKS[B.BARK] = block('bark', { top: 'barkTop', side: 'bark', bottom: 'barkTop' }, { sound: 'wood' });
BLOCKS[B.WATER] = { name: 'water', solid: false, liquid: true, top: 'water', side: 'water', bottom: 'water', light: null, sound: 'water' };
BLOCKS[B.LAVA] = { name: 'lava', solid: false, liquid: true, top: 'lava', side: 'lava', bottom: 'lava', light: { color: 0xff7a2a, intensity: 1.4, range: 5 }, sound: 'lava' };
BLOCKS[B.WALLPAPER] = block('wallpaper', { top: 'plank', side: 'wallpaper', bottom: 'plank' }, { sound: 'wood' });
BLOCKS[B.THATCH] = block('thatch', { top: 'thatch', side: 'thatch', bottom: 'thatch' }, { sound: 'grass' });
BLOCKS[B.ROOF] = block('roof', { top: 'roof', side: 'roof', bottom: 'plank' });
BLOCKS[B.BASALT] = block('basalt', { top: 'basaltTop', side: 'basalt', bottom: 'basalt' });
BLOCKS[B.CAP] = block('cap', { top: 'cap', side: 'capSide', bottom: 'gills' }, { sound: 'grass', light: { color: 0xb07cff, intensity: 0.6, range: 4 } });
BLOCKS[B.MARBLE] = block('marble', { top: 'marble', side: 'marbleSide', bottom: 'marble' });
BLOCKS[B.CLAY] = block('clay', { top: 'clay', side: 'clay', bottom: 'clay' });
BLOCKS[B.LEAVES] = block('leaves', { top: 'leaves', side: 'leaves', bottom: 'leaves' }, { sound: 'grass' });
BLOCKS[B.SNOW] = block('snow', { top: 'snow', side: 'snowSide', bottom: 'dirt' }, { sound: 'sand' });

export const SHAPE = { FULL: 0 };
export const stairShape = (dx, dy) => 1 + dirIndex(dx, dy);
export const stairRise = (shape) => (shape > 0 ? DIRS4[shape - 1] : null);

export const key3 = (x, y, z) => (z * 1024 + y) * 1024 + x;
export const unkey3 = (k) => [k % 1024, Math.floor(k / 1024) % 1024, Math.floor(k / 1048576)];
export const nodeKey = (n) => key3(n.x, n.y, n.h) * 2 + (n.swim ? 1 : 0);
export const sameNode = (a, b) => a.x === b.x && a.y === b.y && a.h === b.h && !a.swim === !b.swim;
export const nodePos = (n) => [n.x + 0.5, n.y + 0.5, n.swim ? n.h - 0.6 : n.h + (n.rise ? 0.5 : 0)];

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

export class World {
    constructor(W, D, H) {
        Object.assign(this, { W, D, H });
        this.blocks = new Uint8Array(W * D * H);
        this.shapes = new Uint8Array(W * D * H);
        this.blockers = new Map(); // key3 -> local box [x0,y0,z0,x1,y1,z1] in 0..1
        this.ladders = []; // { x, y, bottom, top, wall: [dx,dy] }
        this.ladderEdges = new Map(); // nodeKey -> [node]
        this.version = 0;
    }

    idx(x, y, z) {
        return (z * this.D + y) * this.W + x;
    }

    inside(x, y, z) {
        return x >= 0 && y >= 0 && z >= 0 && x < this.W && y < this.D && z < this.H;
    }

    get(x, y, z) {
        return this.inside(x, y, z) ? this.blocks[this.idx(x, y, z)] : B.AIR;
    }

    shape(x, y, z) {
        return this.inside(x, y, z) ? this.shapes[this.idx(x, y, z)] : 0;
    }

    set(x, y, z, b, shape = 0) {
        if (!this.inside(x, y, z)) return;
        const i = this.idx(x, y, z);
        this.blocks[i] = b;
        this.shapes[i] = b === B.AIR ? 0 : shape;
        this.version++;
    }

    solid(x, y, z) {
        return BLOCKS[this.get(x, y, z)].solid;
    }

    // a full solid cube (stairs are solid but not full)
    full(x, y, z) {
        return this.solid(x, y, z) && this.shape(x, y, z) === 0;
    }

    liquid(x, y, z) {
        return BLOCKS[this.get(x, y, z)].liquid;
    }

    water(x, y, z) {
        return this.get(x, y, z) === B.WATER;
    }

    blocked(x, y, z) {
        return this.blockers.has(key3(x, y, z));
    }

    // free for a body: not solid, no prop in the way, no lava
    passable(x, y, z) {
        const b = this.get(x, y, z);
        return !BLOCKS[b].solid && b !== B.LAVA && !this.blockers.has(key3(x, y, z));
    }

    block(x, y, z, h = 1, box = [0.12, 0.12, 0, 0.88, 0.88, 1]) {
        for (let k = 0; k < h; k++) this.blockers.set(key3(x, y, z + k), box);
        this.version++;
    }

    unblock(x, y, z, h = 1) {
        for (let k = 0; k < h; k++) this.blockers.delete(key3(x, y, z + k));
        this.version++;
    }

    // Collision boxes (world space) of everything solid overlapping the box.
    boxes(x0, y0, z0, x1, y1, z1, out = []) {
        out.length = 0;
        const e = 1e-6;
        const cx0 = Math.floor(x0 + e);
        const cy0 = Math.floor(y0 + e);
        const cz0 = Math.floor(z0 + e);
        const cx1 = Math.floor(x1 - e);
        const cy1 = Math.floor(y1 - e);
        const cz1 = Math.floor(z1 - e);
        for (let z = cz0; z <= cz1; z++) for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
            const b = this.get(x, y, z);
            if (BLOCKS[b].solid) {
                const s = this.shape(x, y, z);
                if (s === 0) {
                    out.push([x, y, z, x + 1, y + 1, z + 1]);
                } else {
                    // four steps of a quarter each, the highest toward the rise
                    const [dx, dy] = DIRS4[s - 1];
                    for (let k = 0; k < 4; k++) {
                        const a = dx + dy > 0 ? k / 4 : 1 - (k + 1) / 4;
                        const c = a + 0.25;
                        const top = z + (k + 1) / 4;
                        if (dx !== 0) out.push([x + a, y, z, x + c, y + 1, top]);
                        else out.push([x, y + a, z, x + 1, y + c, top]);
                    }
                }
            } else {
                const bl = this.blockers.get(key3(x, y, z));
                if (bl) out.push([x + bl[0], y + bl[1], z + bl[2], x + bl[3], y + bl[4], z + bl[5]]);
            }
        }
        // keep only real overlaps
        let n = 0;
        for (const b of out) if (b[0] < x1 - e && b[3] > x0 + e && b[1] < y1 - e && b[4] > y0 + e && b[2] < z1 - e && b[5] > z0 + e) out[n++] = b;
        out.length = n;
        return out;
    }

    // ---- walk graph
    isFlat(x, y, h) {
        return h >= 1 && this.full(x, y, h - 1) && !this.blocked(x, y, h - 1) && this.passable(x, y, h) && this.passable(x, y, h + 1) && !this.deepWater(x, y, h);
    }

    deepWater(x, y, h) {
        return this.water(x, y, h) && this.water(x, y, h + 1);
    }

    node(x, y, h) {
        const s = this.shape(x, y, h);
        if (s > 0 && this.solid(x, y, h)) return this.passable(x, y, h + 1) && this.passable(x, y, h + 2) ? { x, y, h, rise: DIRS4[s - 1] } : null;
        return this.isFlat(x, y, h) ? { x, y, h, rise: null } : null;
    }

    // floating on deep water: two or more water cells under open air
    swimNode(x, y, h) {
        return this.water(x, y, h - 1) && this.water(x, y, h - 2) && this.passable(x, y, h) && !this.water(x, y, h) ? { x, y, h, rise: null, swim: true } : null;
    }

    // level of a node's edge toward (dx, dy), or null when stairs are entered sideways
    side(n, dx, dy) {
        if (!n.rise) return n.h;
        if (dx === n.rise[0] && dy === n.rise[1]) return n.h + 1;
        if (dx === -n.rise[0] && dy === -n.rise[1]) return n.h;
        return null;
    }

    // opts: { drops, swim, hop, maxDrop }
    neighbors(n, opts = {}) {
        const out = [];
        const drops = opts.drops ?? true;
        const swim = opts.swim ?? true;
        const maxDrop = opts.maxDrop ?? MAX_DROP;
        if (n.swim) {
            for (const [dx, dy] of DIRS4) {
                const x = n.x + dx;
                const y = n.y + dy;
                const s = this.swimNode(x, y, n.h);
                if (s) out.push({ ...s, via: 'swim' });
                // climb out onto a bank at the surface or one above it
                for (const h of [n.h, n.h + 1]) {
                    const m = this.node(x, y, h);
                    if (m && !m.rise && this.passable(n.x, n.y, h + 1)) out.push({ ...m, via: 'climb' });
                }
            }
            return out;
        }
        for (const [dx, dy] of DIRS4) {
            const t = this.side(n, dx, dy);
            if (t === null) continue;
            const x = n.x + dx;
            const y = n.y + dy;
            let linked = false;
            for (const h of [t, t - 1]) {
                const m = this.node(x, y, h);
                if (m && this.side(m, -dx, -dy) === t) {
                    out.push({ ...m, via: m.rise || n.rise ? 'stair' : 'walk' });
                    linked = true;
                }
            }
            if (swim && !n.rise) {
                const s = this.swimNode(x, y, n.h);
                if (s) { out.push({ ...s, via: 'swim' }); linked = true; }
            }
            if (linked || !drops || n.rise) continue;
            // hop down off a ledge; deep water catches a fall of any height
            if (!this.passable(x, y, n.h) || !this.passable(x, y, n.h + 1)) continue;
            for (let d = 1; d <= 40; d++) {
                const z = n.h - d;
                if (z < 1) break;
                if (swim) {
                    const s = this.swimNode(x, y, z);
                    if (s) { out.push({ ...s, via: 'drop' }); break; }
                }
                const m = this.node(x, y, z);
                if (m) { if (d <= maxDrop && !m.rise) out.push({ ...m, via: 'drop' }); break; }
                if (!this.passable(x, y, z)) break;
            }
        }
        // the player hops onto ledges one block high (creatures do not)
        if (opts.hop && !n.rise && this.passable(n.x, n.y, n.h + 2)) {
            for (const [dx, dy] of DIRS4) {
                const m = this.node(n.x + dx, n.y + dy, n.h + 1);
                if (m && !m.rise) out.push({ ...m, via: 'hop' });
            }
        }
        if (!n.rise) {
            for (const [dx, dy] of DIAG) {
                const a = this.node(n.x + dx, n.y + dy, n.h);
                if (a && !a.rise && this.isFlat(n.x + dx, n.y, n.h) && this.isFlat(n.x, n.y + dy, n.h)) out.push({ ...a, via: 'walk' });
            }
        }
        for (const m of this.ladderEdges.get(nodeKey(n)) ?? []) out.push({ ...m, via: 'ladder' });
        return out;
    }

    // Ladder in column (x, y) from the floor at `bottom` up to the top of the wall
    // behind it (at x + wall[0], y + wall[1]), whose top is at level `top`.
    addLadder(x, y, bottom, top, wall) {
        const lad = { x, y, bottom, top, wall };
        this.ladders.push(lad);
        const low = { x, y, h: bottom, rise: null };
        const high = { x: x + wall[0], y: y + wall[1], h: top, rise: null };
        const add = (a, b) => {
            const k = nodeKey(a);
            if (!this.ladderEdges.has(k)) this.ladderEdges.set(k, []);
            this.ladderEdges.get(k).push(b);
        };
        add(low, high);
        add(high, low);
        return lad;
    }

    ladderAt(px, py, pz) {
        for (const l of this.ladders) {
            if (px < l.x || px > l.x + 1 || py < l.y || py > l.y + 1) continue;
            if (pz < l.bottom - 0.2 || pz > l.top + 0.4) continue;
            return l;
        }
        return null;
    }

    bfs(a, opts = {}, limit = Infinity) {
        const ka = nodeKey(a);
        const prev = new Map([[ka, null]]); // key -> key it was reached from
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

    // shortest node path (each node carries `via`, how it was entered), or null
    path(a, b, opts = {}, limit = Infinity) {
        const { prev, at } = this.bfs(a, opts, limit);
        let k = nodeKey(b);
        if (!prev.has(k)) return null;
        const out = [];
        for (; k !== null; k = prev.get(k)) out.push(at.get(k));
        return out.reverse();
    }

    // the node a body standing at (px, py, pz) occupies, if any
    nodeAt(px, py, pz) {
        const x = Math.floor(px);
        const y = Math.floor(py);
        for (const h of [Math.floor(pz + 0.3), Math.floor(pz + 0.3) - 1, Math.floor(pz + 0.3) + 1]) {
            const n = this.node(x, y, h) ?? this.swimNode(x, y, h);
            if (n) return n;
        }
        return null;
    }

    // highest solid top under (x, y) at or below z
    groundBelow(px, py, pz) {
        const x = Math.floor(px);
        const y = Math.floor(py);
        for (let z = Math.min(this.H - 1, Math.floor(pz)); z >= 0; z--) {
            if (this.solid(x, y, z)) return z + (this.shape(x, y, z) ? 0.5 : 1);
            if (this.liquid(x, y, z)) return z + 0.85;
        }
        return -Infinity;
    }
}
