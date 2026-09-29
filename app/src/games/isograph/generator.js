// Isograph: multi-storey levels on isometric (triangle) graph paper.
//
// Isometric paper is the cube grid projected along its main diagonal (1, 1, 1):
// a cube becomes a hexagon made of 6 triangles, its 3 visible faces are rhombi of
// 2 triangles. The level is therefore a real 3D voxel world (x right-back,
// y left-back, z up) and the drawing is its projection. Storeys are joined by
// stairs, not portals, and step back so the camera sees every floor.
//
// Walking: a flat node stands on a solid voxel with two air voxels above it.
// A stair voxel rises toward the back (-x or -y) by one voxel. Two neighbouring
// nodes connect when the heights of their facing sides match.

export const MAT = { AIR: 0, EARTH: 1, ROCK: 2, STONE: 3, WOOD: 4, BRICK: 5, STAIR: 6 };
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const FORWARD = [[1, 0], [0, 1]]; // stairs descend toward the viewer
export const STOREY_HEIGHT = 4; // slab + 3 air

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

export const k3 = (x, y, z) => (z * 1024 + y) * 1024 + x;

export class Level {
    constructor(W, D, H) {
        this.W = W;
        this.D = D;
        this.H = H;
        this.vox = new Uint8Array(W * D * H);
        this.stairs = new Map(); // k3 -> [rx, ry], the direction the stair rises toward
        this.blockers = new Set(); // k3 of air voxels taken by furniture, trees, boulders
        this.props = [];
        this.storeys = [];
    }

    inside(x, y, z) {
        return x >= 0 && y >= 0 && z >= 0 && x < this.W && y < this.D && z < this.H;
    }

    get(x, y, z) {
        return this.inside(x, y, z) ? this.vox[(z * this.D + y) * this.W + x] : MAT.AIR;
    }

    set(x, y, z, m) {
        if (this.inside(x, y, z)) this.vox[(z * this.D + y) * this.W + x] = m;
    }

    solid(x, y, z) {
        const m = this.get(x, y, z);
        return m !== MAT.AIR && m !== MAT.STAIR;
    }

    air(x, y, z) {
        return this.get(x, y, z) === MAT.AIR && !this.blockers.has(k3(x, y, z));
    }

    isFlat(x, y, h) {
        return h >= 1 && this.solid(x, y, h - 1) && this.air(x, y, h) && this.get(x, y, h + 1) === MAT.AIR;
    }

    stair(x, y, z) {
        return this.stairs.get(k3(x, y, z));
    }

    // --- walking graph ---
    node(x, y, h) {
        const rise = this.stair(x, y, h);
        if (rise) return this.get(x, y, h + 1) === MAT.AIR && this.get(x, y, h + 2) === MAT.AIR ? { x, y, h, rise } : null;
        return this.isFlat(x, y, h) ? { x, y, h, rise: null } : null;
    }

    // Height of the node's side facing (dx, dy), or null for the closed sides of a stair.
    side(n, dx, dy) {
        if (!n.rise) return n.h;
        if (dx === n.rise[0] && dy === n.rise[1]) return n.h + 1;
        if (dx === -n.rise[0] && dy === -n.rise[1]) return n.h;
        return null;
    }

    neighbors(n) {
        const out = [];
        for (const [dx, dy] of DIRS) {
            const t = this.side(n, dx, dy);
            if (t === null) continue;
            for (const h of [t, t - 1]) {
                const m = this.node(n.x + dx, n.y + dy, h);
                if (m && this.side(m, -dx, -dy) === t) out.push(m);
            }
        }
        return out;
    }

    nodes() {
        const out = [];
        for (let z = 0; z < this.H; z++) {
            for (let y = 0; y < this.D; y++) {
                for (let x = 0; x < this.W; x++) {
                    const n = this.node(x, y, z);
                    if (n) out.push(n);
                }
            }
        }
        return out;
    }

    // Breadth-first search from `a`: visit order and parents.
    bfs(a) {
        const prev = new Map([[k3(a.x, a.y, a.h), null]]);
        const order = [a];
        for (let i = 0; i < order.length; i++) {
            for (const m of this.neighbors(order[i])) {
                const key = k3(m.x, m.y, m.h);
                if (!prev.has(key)) {
                    prev.set(key, order[i]);
                    order.push(m);
                }
            }
        }
        return { prev, order };
    }

    path(a, b) {
        const { prev } = this.bfs(a);
        if (!prev.has(k3(b.x, b.y, b.h))) return null;
        const out = [];
        for (let c = b; c; c = prev.get(k3(c.x, c.y, c.h))) out.push(c);
        return out.reverse();
    }

    components() {
        const comp = new Map();
        const list = [];
        for (const n of this.nodes()) {
            const key = k3(n.x, n.y, n.h);
            if (comp.has(key)) continue;
            const id = list.length;
            const members = [n];
            comp.set(key, id);
            for (let i = 0; i < members.length; i++) {
                for (const m of this.neighbors(members[i])) {
                    const mk = k3(m.x, m.y, m.h);
                    if (!comp.has(mk)) {
                        comp.set(mk, id);
                        members.push(m);
                    }
                }
            }
            list.push(members);
        }
        return { comp, list };
    }

    // A straight staircase from the flat node (x, y, top) going down toward (fx, fy),
    // one voxel per step, until it meets a floor at its own height.
    stairRun(x, y, top, fx, fy) {
        if (!this.isFlat(x, y, top)) return null;
        const cells = [];
        for (let j = 1; j <= 14; j++) {
            const cx = x + fx * j;
            const cy = y + fy * j;
            const z = top - j;
            if (z < 1 || !this.inside(cx, cy, z + 2)) return null;
            if (!this.air(cx, cy, z) || this.get(cx, cy, z + 1) !== MAT.AIR || this.get(cx, cy, z + 2) !== MAT.AIR) return null;
            // never over another stair: its support would fill that stair's headroom
            if (this.groundBelow(cx, cy, z) === MAT.STAIR) return null;
            cells.push([cx, cy, z]);
            if (this.isFlat(cx + fx, cy + fy, z)) return { cells, landing: [cx + fx, cy + fy, z], rise: [-fx, -fy] };
        }
        return null;
    }

    // The first non-air material straight below (x, y, z).
    groundBelow(x, y, z) {
        let s = z - 1;
        while (s >= 0 && this.get(x, y, s) === MAT.AIR) s--;
        return s >= 0 ? this.get(x, y, s) : MAT.AIR;
    }

    buildStairs(run) {
        for (const [x, y, z] of run.cells) {
            this.set(x, y, z, MAT.STAIR);
            this.stairs.set(k3(x, y, z), run.rise);
            for (let s = z - 1; s >= 0 && this.get(x, y, s) === MAT.AIR; s--) this.set(x, y, s, MAT.STONE);
        }
    }
}

const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

function terrain(L, rng) {
    const { W, D } = L;
    const base = 2;
    const h = Array.from({ length: W }, () => new Array(D).fill(base));
    // a raised terrace at the back, a sunken pit at the front
    const tw = randInt(rng, 3, Math.floor(W / 2) - 1);
    const td = randInt(rng, 3, Math.floor(D / 2) - 1);
    for (let x = 0; x < tw; x++) for (let y = 0; y < td; y++) h[x][y] = base + 1;
    const pw = randInt(rng, 3, 5);
    const pd = randInt(rng, 3, 5);
    const px = randInt(rng, Math.floor(W / 2) - 1, W - pw - 2);
    const py = randInt(rng, Math.floor(D / 2) - 1, D - pd - 2);
    for (let x = px; x < px + pw; x++) for (let y = py; y < py + pd; y++) h[x][y] = base - 1;
    // a bite out of the front corner so the slab is not a perfect box
    const bite = randInt(rng, 1, 3);
    for (let x = W - bite; x < W; x++) for (let y = D - bite; y < D; y++) h[x][y] = 0;
    for (let x = 0; x < W; x++) {
        for (let y = 0; y < D; y++) {
            for (let z = 0; z < h[x][y]; z++) L.set(x, y, z, z === h[x][y] - 1 ? MAT.EARTH : MAT.ROCK);
        }
    }
    // a rock spire on a back edge
    const sx = rng() < 0.5 ? randInt(rng, tw, W - 3) : 0;
    const sy = sx === 0 ? randInt(rng, td, D - 3) : 0;
    const tall = randInt(rng, 4, 6);
    for (let z = 0; z < h[sx][sy] + tall; z++) L.set(sx, sy, z, MAT.ROCK);
    L.spire = { x: sx, y: sy, top: h[sx][sy] + tall };
    L.pit = { x: px, y: py, w: pw, d: pd };
    return base;
}

function storey(L, rng, k, base) {
    const { W, D } = L;
    const floorZ = base + STOREY_HEIGHT * k;
    const prev = L.storeys[L.storeys.length - 1];
    for (let attempt = 0; attempt < 30; attempt++) {
        const w = Math.max(4, Math.round(W * (0.6 - 0.1 * k)) + randInt(rng, -1, 1));
        const d = Math.max(4, Math.round(D * (0.6 - 0.1 * k)) + randInt(rng, -1, 1));
        // usually above the storey below, sometimes beside it on its own pillars
        const over = prev && rng() < 0.6;
        const maxX = over ? prev.x0 + prev.w - w : W - w - 5;
        const maxY = over ? prev.y0 + prev.d - d : D - d - 5;
        const x0 = randInt(rng, over ? Math.max(0, prev.x0 - 2) : 0, Math.max(0, Math.min(maxX, W - w - 1)));
        const y0 = randInt(rng, over ? Math.max(0, prev.y0 - 2) : 0, Math.max(0, Math.min(maxY, D - d - 1)));
        // room for the slab, walls and headroom
        let free = true;
        for (let x = x0; x < x0 + w && free; x++) {
            for (let y = y0; y < y0 + d && free; y++) {
                for (let z = floorZ - 1; z <= floorZ + 2; z++) if (L.get(x, y, z) !== MAT.AIR) free = false;
            }
        }
        if (!free) continue;
        const snapshot = { vox: L.vox.slice(), stairs: new Map(L.stairs) };
        for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + d; y++) L.set(x, y, floorZ - 1, MAT.WOOD);
        for (let x = x0; x < x0 + w; x++) for (let z = floorZ; z < floorZ + 3; z++) L.set(x, y0, z, MAT.BRICK);
        for (let y = y0; y < y0 + d; y++) for (let z = floorZ; z < floorZ + 3; z++) L.set(x0, y, z, MAT.BRICK);
        // pillars under the front corners, down to whatever is below (never onto stairs)
        const corners = [[x0 + w - 1, y0 + d - 1], [x0 + w - 1, y0], [x0, y0 + d - 1]];
        const overStairs = corners.some(([px, py]) => L.groundBelow(px, py, floorZ - 1) === MAT.STAIR)
            || [...L.stairs.keys()].some((key) => {
                const sx = key % 1024;
                const sy = Math.floor(key / 1024) % 1024;
                const sz = Math.floor(key / 1048576);
                return sx >= x0 && sx < x0 + w && sy >= y0 && sy < y0 + d && sz + 2 >= floorZ - 1;
            });
        if (overStairs) {
            L.vox = snapshot.vox;
            L.stairs = snapshot.stairs;
            continue;
        }
        for (const [px, py] of corners) {
            for (let z = floorZ - 2; z >= 0 && L.get(px, py, z) === MAT.AIR; z--) L.set(px, py, z, MAT.STONE);
        }
        // stairs down from the front edge, landing on ground or on a storey floor
        const runs = [];
        const onFloor = (run) => run && [MAT.EARTH, MAT.WOOD].includes(L.get(run.landing[0], run.landing[1], run.landing[2] - 1));
        for (let y = y0 + 1; y < y0 + d - 1; y++) {
            const run = L.stairRun(x0 + w - 1, y, floorZ, 1, 0);
            if (onFloor(run)) runs.push(run);
        }
        for (let x = x0 + 1; x < x0 + w - 1; x++) {
            const run = L.stairRun(x, y0 + d - 1, floorZ, 0, 1);
            if (onFloor(run)) runs.push(run);
        }
        if (!runs.length) {
            L.vox = snapshot.vox;
            L.stairs = snapshot.stairs;
            continue;
        }
        const run = runs[Math.floor(rng() * runs.length)];
        L.buildStairs(run);
        // The stone under the new stairs may cut a lower floor in two: the new floor
        // must still be reachable from the ground, or this storey goes elsewhere.
        connect(L, rng);
        if (!reachesFloor(L, base, floorZ)) {
            L.vox = snapshot.vox;
            L.stairs = snapshot.stairs;
            continue;
        }
        const s = { k, x0, y0, w, d, floorZ, stairs: run };
        L.storeys.push(s);
        return s;
    }
    return null;
}

function reachesFloor(L, base, floorZ) {
    const ground = L.nodes().filter((n) => !n.rise && n.h <= base + 1 && L.get(n.x, n.y, n.h - 1) === MAT.EARTH);
    ground.sort((a, b) => b.x + b.y - (a.x + a.y));
    for (const start of ground.slice(0, 6)) {
        if (L.bfs(start).order.some((n) => !n.rise && n.h === floorZ)) return true;
    }
    return false;
}

// Join every walkable island to the main one with straight staircases. Only real
// floors count (ground and storey planks): wall tops and the spire stay out of reach.
function connect(L, rng) {
    const real = (n) => n.rise || [MAT.EARTH, MAT.WOOD].includes(L.get(n.x, n.y, n.h - 1));
    for (let pass = 0; pass < 12; pass++) {
        const { comp, list } = L.components();
        const islands = list.map((members, i) => (members.some(real) ? i : -1)).filter((i) => i >= 0);
        if (islands.length <= 1) return;
        const main = islands.reduce((a, i) => (list[i].length > list[a].length ? i : a), islands[0]);
        const options = [];
        for (const i of islands) {
            for (const n of list[i]) {
                if (n.rise || !real(n)) continue;
                for (const [fx, fy] of FORWARD) {
                    const run = L.stairRun(n.x, n.y, n.h, fx, fy);
                    if (!run) continue;
                    const [lx, ly, lz] = run.landing;
                    const a = comp.get(k3(n.x, n.y, n.h));
                    const b = comp.get(k3(lx, ly, lz));
                    const landing = L.node(lx, ly, lz);
                    if (a !== b && islands.includes(b) && (a === main || b === main) && landing && real(landing)) options.push(run);
                }
            }
        }
        if (!options.length) return;
        L.buildStairs(options[Math.floor(rng() * options.length)]);
    }
}

export function generate({ seed = 1, width = 16, depth = 16, storeys = 3 } = {}) {
    for (let attempt = 0; attempt < 12; attempt++) {
        const rng = mulberry32(seed * 7919 + attempt * 104729);
        const L = new Level(width, depth, 2 + STOREY_HEIGHT * storeys + 6);
        L.seed = seed;
        const base = terrain(L, rng);
        let ok = true;
        for (let k = 1; k < storeys; k++) {
            if (!storey(L, rng, k, base)) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;
        connect(L, rng);

        // Entrance at the front of the ground; exit on the top storey (or, with one
        // storey, the ground node farthest away), reached by breadth-first search.
        const all = L.nodes();
        const top = L.storeys[L.storeys.length - 1];
        const ground = all.filter((n) => !n.rise && n.h <= base + 1).sort((a, b) => b.x + b.y - (a.x + a.y));
        let path = null;
        for (const entrance of ground.slice(0, 12)) {
            const { order } = L.bfs(entrance);
            const reach = order.filter((n) => !n.rise && (top ? n.h === top.floorZ : true));
            if (!reach.length || (top && reach.length < 4)) continue;
            const exit = top ? reach.reduce((a, b) => (a.x + a.y <= b.x + b.y ? a : b)) : reach[reach.length - 1];
            path = L.path(entrance, exit);
            if (path && path.length > 6) break;
            path = null;
        }
        if (!path) continue;
        L.base = base;
        L.entrance = path[0];
        L.exit = path[path.length - 1];
        L.route = path;
        L.attempt = attempt;
        furnish(L, rng);
        return L;
    }
    throw new Error(`no level for seed ${seed}`);
}

// Trees, rocks, tools outside; furniture, windows and torches inside. Blocking
// props never touch the route from the entrance to the exit.
function furnish(L, rng) {
    const route = new Set(L.route.map((n) => k3(n.x, n.y, n.h)));
    const near = (n) => [[0, 0], ...DIRS].some(([dx, dy]) => route.has(k3(n.x + dx, n.y + dy, n.h)));
    const nodes = L.nodes().filter((n) => !n.rise);
    const put = (n, kind, block = false) => {
        L.props.push({ kind, x: n.x, y: n.y, z: n.h, seed: Math.floor(rng() * 1e9) });
        if (block) L.blockers.add(k3(n.x, n.y, n.h));
    };
    const ground = nodes.filter((n) => L.get(n.x, n.y, n.h - 1) === MAT.EARTH);
    const inside = nodes.filter((n) => L.get(n.x, n.y, n.h - 1) === MAT.WOOD);

    let trees = 0;
    for (const n of ground.sort(() => rng() - 0.5)) {
        if (near(n)) {
            if (rng() < 0.3) put(n, 'grass');
            continue;
        }
        const r = rng();
        if (trees < 3 && r < 0.12) {
            put(n, 'tree', true);
            trees++;
        } else if (r < 0.2) put(n, 'boulder', true);
        else if (r < 0.45) put(n, 'grass');
        else if (r < 0.55) put(n, 'pebbles');
    }
    const pitEdge = ground.find((n) => !near(n) && n.h === L.base - 1);
    if (pitEdge) put(pitEdge, rng() < 0.5 ? 'pickaxe' : 'shovel');

    const furniture = ['bookshelf', 'bed', 'table', 'barrel', 'crate', 'crate', 'barrel'];
    for (const s of L.storeys) {
        for (const n of inside) {
            if (n.h !== s.floorZ || near(n)) continue;
            const againstWall = n.x === s.x0 + 1 || n.y === s.y0 + 1;
            if (againstWall && rng() < 0.45) put(n, furniture[Math.floor(rng() * furniture.length)], true);
            else if (rng() < 0.06) put(n, 'crate', true);
        }
        // windows and torches on the inner faces of the back walls
        for (let y = s.y0 + 1; y < s.y0 + s.d; y++) {
            if (rng() < 0.35) L.props.push({ kind: rng() < 0.7 ? 'window' : 'torch', x: s.x0, y, z: s.floorZ + 1, face: 'x', seed: Math.floor(rng() * 1e9) });
        }
        for (let x = s.x0 + 1; x < s.x0 + s.w; x++) {
            if (rng() < 0.35) L.props.push({ kind: rng() < 0.7 ? 'window' : 'torch', x, y: s.y0, z: s.floorZ + 1, face: 'y', seed: Math.floor(rng() * 1e9) });
        }
    }
    L.props.push({ kind: 'flag', x: L.entrance.x, y: L.entrance.y, z: L.entrance.h, seed: 1 });
    L.props.push({ kind: 'chest', x: L.exit.x, y: L.exit.y, z: L.exit.h, seed: 2 });
}
