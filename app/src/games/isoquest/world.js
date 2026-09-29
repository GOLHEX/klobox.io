// Isoquest world: a vertical diorama of three layers on the isometric cube grid.
//
//   island  (top, floor at z = 16): grass, a giant sword stuck through, a crypt
//   grotto  (middle, z = 9): stone, water pools with plank bridges, a chasm
//   city    (bottom, z = 2): paving, brick houses, the ring portal
//
// The layers are staggered toward the viewer, so each lower one shows in front
// of the one above. They are joined by long staircases, a rope ladder through the
// chasm and short drops off ledges. As in Isograph a flat node stands on a solid
// voxel with two air voxels above; stairs rise toward the back (-x or -y).

export const M = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, BRICK: 4, WOOD: 5, WATER: 6, STAIR: 7, CRYPT: 8, PAVING: 9, ROCK: 10 };
export const FLOOR = { CITY: 2, GROTTO: 9, ISLAND: 16 };
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
export const MAX_DROP = 3;

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
export const key3 = (x, y, z) => (z * 1024 + y) * 1024 + x;
export const nodeKey = (n) => key3(n.x, n.y, n.h);
const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

export class World {
    constructor(W, D, H) {
        Object.assign(this, { W, D, H });
        this.vox = new Uint8Array(W * D * H);
        this.stairs = new Map(); // key3 -> rise direction
        this.ladders = new Map(); // nodeKey -> [node, ...] both ways
        this.ladderList = [];
        this.blockers = new Set(); // key3 of air voxels taken by props
        this.props = [];
        this.spawns = [];
        this.items = [];
        this.chests = [];
    }

    inside(x, y, z) {
        return x >= 0 && y >= 0 && z >= 0 && x < this.W && y < this.D && z < this.H;
    }

    get(x, y, z) {
        return this.inside(x, y, z) ? this.vox[(z * this.D + y) * this.W + x] : M.AIR;
    }

    set(x, y, z, m) {
        if (this.inside(x, y, z)) this.vox[(z * this.D + y) * this.W + x] = m;
    }

    solid(x, y, z) {
        const m = this.get(x, y, z);
        return m !== M.AIR && m !== M.STAIR && m !== M.WATER;
    }

    air(x, y, z) {
        return this.get(x, y, z) === M.AIR && !this.blockers.has(key3(x, y, z));
    }

    isFlat(x, y, h) {
        return h >= 1 && this.solid(x, y, h - 1) && this.air(x, y, h) && this.get(x, y, h + 1) === M.AIR;
    }

    node(x, y, h) {
        const rise = this.stairs.get(key3(x, y, h));
        if (rise) return this.get(x, y, h + 1) === M.AIR && this.get(x, y, h + 2) === M.AIR ? { x, y, h, rise } : null;
        return this.isFlat(x, y, h) ? { x, y, h, rise: null } : null;
    }

    side(n, dx, dy) {
        if (!n.rise) return n.h;
        if (dx === n.rise[0] && dy === n.rise[1]) return n.h + 1;
        if (dx === -n.rise[0] && dy === -n.rise[1]) return n.h;
        return null;
    }

    // Walk (4 and 8 directions), stairs, ladders, and one-way drops off ledges.
    neighbors(n) {
        const out = [];
        for (const [dx, dy] of DIRS4) {
            const t = this.side(n, dx, dy);
            if (t === null) continue;
            let linked = false;
            for (const h of [t, t - 1]) {
                const m = this.node(n.x + dx, n.y + dy, h);
                if (m && this.side(m, -dx, -dy) === t) {
                    out.push({ ...m, via: m.rise || n.rise ? 'stair' : 'walk' });
                    linked = true;
                }
            }
            if (linked || n.rise) continue;
            // hop down a ledge of up to MAX_DROP voxels
            for (let d = 1; d <= MAX_DROP; d++) {
                const x = n.x + dx;
                const y = n.y + dy;
                const m = this.node(x, y, n.h - d);
                if (!m || m.rise) continue;
                let clear = true;
                for (let z = n.h - d; z <= n.h + 1; z++) if (!this.air(x, y, z)) clear = false;
                if (clear) out.push({ ...m, via: 'drop' });
                break;
            }
        }
        if (!n.rise) {
            for (const [dx, dy] of DIAG) {
                const a = this.node(n.x + dx, n.y + dy, n.h);
                if (a && !a.rise && this.isFlat(n.x + dx, n.y, n.h) && this.isFlat(n.x, n.y + dy, n.h)) out.push({ ...a, via: 'walk' });
            }
        }
        for (const m of this.ladders.get(nodeKey(n)) ?? []) out.push({ ...m, via: 'ladder' });
        return out;
    }

    nodes() {
        const out = [];
        for (let z = 0; z < this.H; z++) for (let y = 0; y < this.D; y++) for (let x = 0; x < this.W; x++) {
            const n = this.node(x, y, z);
            if (n) out.push(n);
        }
        return out;
    }

    bfs(a, limit = Infinity) {
        const prev = new Map([[nodeKey(a), null]]);
        const dist = new Map([[nodeKey(a), 0]]);
        const order = [a];
        for (let i = 0; i < order.length; i++) {
            const d = dist.get(nodeKey(order[i]));
            if (d >= limit) continue;
            for (const m of this.neighbors(order[i])) {
                const k = nodeKey(m);
                if (!prev.has(k)) {
                    prev.set(k, order[i]);
                    dist.set(k, d + 1);
                    order.push(m);
                }
            }
        }
        return { prev, dist, order };
    }

    // Shortest path of nodes (each carrying `via`, how it was entered), or null.
    path(a, b, limit = Infinity) {
        const { prev, order } = this.bfs(a, limit);
        const end = order.find((n) => n.x === b.x && n.y === b.y && n.h === b.h);
        if (!end) return null;
        const out = [];
        for (let c = end; c; c = prev.get(nodeKey(c))) out.push(c);
        return out.reverse();
    }

    addLadder(bottom, top) {
        const add = (a, b) => {
            const k = nodeKey(a);
            if (!this.ladders.has(k)) this.ladders.set(k, []);
            this.ladders.get(k).push({ x: b.x, y: b.y, h: b.h, rise: null });
        };
        add(bottom, top);
        add(top, bottom);
        this.ladderList.push({ bottom, top });
    }

    groundBelow(x, y, z) {
        let s = z - 1;
        while (s >= 0 && this.get(x, y, s) === M.AIR) s--;
        return s >= 0 ? this.get(x, y, s) : M.AIR;
    }

    stairRun(x, y, top, fx, fy, maxLen = 10) {
        if (!this.isFlat(x, y, top)) return null;
        const cells = [];
        for (let j = 1; j <= maxLen; j++) {
            const cx = x + fx * j;
            const cy = y + fy * j;
            const z = top - j;
            if (z < 1 || !this.inside(cx, cy, z + 2)) return null;
            if (!this.air(cx, cy, z) || this.get(cx, cy, z + 1) !== M.AIR || this.get(cx, cy, z + 2) !== M.AIR) return null;
            if (this.groundBelow(cx, cy, z) === M.STAIR) return null;
            cells.push([cx, cy, z]);
            if (this.isFlat(cx + fx, cy + fy, z)) return { cells, landing: { x: cx + fx, y: cy + fy, h: z }, rise: [-fx, -fy] };
        }
        return null;
    }

    buildStairs(run, support) {
        for (const [x, y, z] of run.cells) {
            this.set(x, y, z, M.STAIR);
            this.stairs.set(key3(x, y, z), run.rise);
            for (let s = z - 1; s >= 0 && this.get(x, y, s) === M.AIR; s--) this.set(x, y, s, support);
        }
    }

    block(x, y, z, height = 2) {
        for (let k = 0; k < height; k++) this.blockers.add(key3(x, y, z + k));
    }

    prop(kind, x, y, z, extra = {}) {
        const p = { kind, x, y, z, ...extra };
        this.props.push(p);
        return p;
    }
}

// ---------------------------------------------------------------- generation

function slab(w, x0, y0, x1, y1, z0, z1, mat, keep = () => true) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (keep(x, y)) for (let z = z0; z <= z1; z++) w.set(x, y, z, mat);
}

export function generateWorld(seed = 1, depth = 1) {
    for (let attempt = 0; attempt < 40; attempt++) {
        const rng = mulberry32(Math.imul(seed, 2654435761) ^ (attempt * 97531 + depth * 7919));
        const w = build(rng, depth);
        if (w) {
            w.seed = seed;
            w.depth = depth;
            w.attempt = attempt;
            return w;
        }
    }
    throw new Error(`no world for seed ${seed}`);
}

function build(rng, depth) {
    const W = 36;
    const D = 36;
    const w = new World(W, D, 26);
    const { CITY, GROTTO, ISLAND } = FLOOR;

    // city: paving over brick, a ragged back edge
    const city = { x0: ri(rng, 13, 15), y0: ri(rng, 13, 15), x1: W - 2, y1: D - 2 };
    const ragged = (x, y) => !(x - city.x0 + y - city.y0 < 3 && rng() < 0.6);
    slab(w, city.x0, city.y0, city.x1, city.y1, 0, 0, M.BRICK, ragged);
    for (let x = city.x0; x <= city.x1; x++) for (let y = city.y0; y <= city.y1; y++) if (w.get(x, y, 0)) w.set(x, y, 1, M.PAVING);

    // grotto: a stone slab, hanging rock where nothing holds it from below
    const grotto = { x0: 3, y0: 3, x1: ri(rng, 21, 23), y1: ri(rng, 21, 23) };
    slab(w, grotto.x0, grotto.y0, grotto.x1, grotto.y1, GROTTO - 2, GROTTO - 1, M.STONE);
    for (let x = grotto.x0 + 1; x < grotto.x1; x++) {
        for (let y = grotto.y0 + 1; y < grotto.y1; y++) {
            const overCity = w.get(x, y, 1) !== M.AIR;
            if (!overCity) {
                const hang = 1 + Math.floor(rng() * 2) + (x > grotto.x0 + 2 && y > grotto.y0 + 2 ? 1 : 0);
                for (let z = GROTTO - 3; z >= GROTTO - 2 - hang; z--) w.set(x, y, z, M.ROCK);
            }
        }
    }
    // back walls of the grotto with arched windows
    for (let x = grotto.x0; x <= grotto.x1; x++) for (let z = GROTTO; z < GROTTO + 4; z++) w.set(x, grotto.y0, z, M.STONE);
    for (let y = grotto.y0; y <= grotto.y1; y++) for (let z = GROTTO; z < GROTTO + 4; z++) w.set(grotto.x0, y, z, M.STONE);
    for (let x = grotto.x0 + 3; x < grotto.x1; x += ri(rng, 3, 5)) w.prop('arch', x, grotto.y0, GROTTO, { face: 'y' });
    for (let y = grotto.y0 + 3; y < grotto.y1; y += ri(rng, 3, 5)) w.prop('arch', grotto.x0, y, GROTTO, { face: 'x' });

    // pillars under the front of the grotto, down to the city
    for (let x = grotto.x0 + 2; x <= grotto.x1; x += 4) {
        for (const [px, py] of [[x, grotto.y1], [grotto.x1, x]]) {
            if (w.get(px, py, 1) === M.AIR) continue;
            for (let z = CITY; z < GROTTO - 2; z++) w.set(px, py, z, M.STONE);
        }
    }

    // water pools with plank bridges
    const pools = [];
    for (let i = 0; i < 2; i++) {
        const pw = ri(rng, 3, 5);
        const pd = ri(rng, 3, 5);
        const px = ri(rng, grotto.x0 + 3, grotto.x1 - pw - 2);
        const py = ri(rng, grotto.y0 + 3, grotto.y1 - pd - 2);
        pools.push({ x0: px, y0: py, x1: px + pw - 1, y1: py + pd - 1 });
        slab(w, px, py, px + pw - 1, py + pd - 1, GROTTO - 1, GROTTO - 1, M.WATER);
        if (rng() < 0.5) for (let x = px - 1; x <= px + pw; x++) w.set(x, py + Math.floor(pd / 2), GROTTO - 1, M.WOOD);
        else for (let y = py - 1; y <= py + pd; y++) w.set(px + Math.floor(pw / 2), y, GROTTO - 1, M.WOOD);
    }
    w.pools = pools;

    // a chasm over the city, crossed by a plank bridge, with a rope ladder down
    const chx = ri(rng, Math.max(city.x0 + 1, grotto.x0 + 3), grotto.x1 - 4);
    const chy = ri(rng, Math.max(city.y0 + 1, grotto.y0 + 3), grotto.y1 - 4);
    for (let x = chx; x < chx + 2; x++) for (let y = chy; y < chy + 2; y++) for (let z = GROTTO - 2; z < GROTTO; z++) w.set(x, y, z, M.AIR);
    for (let y = chy; y < chy + 2; y++) { w.set(chx + 2, y, GROTTO - 1, M.WOOD); w.set(chx + 2, y, GROTTO - 2, M.AIR); }
    w.chasm = { x: chx, y: chy };

    // island: an irregular disc of grass on dirt, floating over the back of the grotto
    const cx = ri(rng, 8, 10);
    const cy = ri(rng, 8, 10);
    const radius = 6.2 + rng() * 1.2;
    const wobble = Array.from({ length: 8 }, () => rng() * 1.4 - 0.7);
    const onIsland = (x, y) => {
        const a = Math.atan2(y - cy, x - cx);
        const r = radius + wobble[Math.floor(((a + Math.PI) / (2 * Math.PI)) * 8) % 8];
        return Math.hypot(x - cx, y - cy) <= r;
    };
    for (let x = 0; x < W; x++) {
        for (let y = 0; y < D; y++) {
            if (!onIsland(x, y)) continue;
            w.set(x, y, ISLAND - 1, M.GRASS);
            w.set(x, y, ISLAND - 2, M.DIRT);
            w.set(x, y, ISLAND - 3, M.DIRT);
            if (Math.hypot(x - cx, y - cy) < radius - 2.5) w.set(x, y, ISLAND - 4, M.DIRT);
            if (!onIsland(x + 1, y) || !onIsland(x, y + 1)) if (rng() < 0.55) w.prop('drip', x, y, ISLAND - 4, { len: 0.6 + rng() * 1.6 });
        }
    }
    w.island = { cx, cy, radius };

    // the giant sword, stuck through the island into the grotto
    // (off the crypt's screen column, so the two landmarks never overlap)
    const sx = cx + ri(rng, 1, 2);
    const sy = cy - ri(rng, 2, 3);
    w.prop('sword', sx, sy, ISLAND, { bottom: GROTTO });
    w.block(sx, sy, ISLAND, 3);
    w.block(sx, sy, GROTTO, 2);
    for (let z = GROTTO; z < ISLAND - 1; z++) if (w.get(sx, sy, z) === M.AIR) w.blockers.add(key3(sx, sy, z));

    // the crypt at the back of the island, a locked chest before its door
    const kx = cx - ri(rng, 3, 4);
    const ky = cy - ri(rng, 3, 4);
    slab(w, kx - 1, ky - 1, kx + 1, ky + 1, ISLAND, ISLAND + 2, M.CRYPT);
    w.prop('crypt', kx - 1, ky - 1, ISLAND, { size: 3 });

    // ---- links between the layers
    const stairsDown = (fromFloor, toFloor, pick) => {
        const runs = [];
        for (let x = 0; x < W; x++) {
            for (let y = 0; y < D; y++) {
                if (!w.isFlat(x, y, fromFloor) || !pick(x, y)) continue;
                for (const [fx, fy] of [[1, 0], [0, 1]]) {
                    const run = w.stairRun(x, y, fromFloor, fx, fy, 9);
                    if (run && run.landing.h === toFloor) runs.push(run);
                }
            }
        }
        if (!runs.length) return null;
        const run = runs[Math.floor(rng() * runs.length)];
        w.buildStairs(run, M.STONE);
        return run;
    };
    const down1 = stairsDown(ISLAND, GROTTO, () => true);
    if (!down1) return null;
    const down2 = stairsDown(GROTTO, CITY, (x, y) => x >= grotto.x1 - 1 || y >= grotto.y1 - 1);
    if (!down2) return null;
    // rope ladder from the city floor up through the chasm
    const bottom = { x: chx + 1, y: chy, h: CITY };
    const top = { x: chx + 1, y: chy - 1, h: GROTTO };
    if (w.node(bottom.x, bottom.y, bottom.h) && w.node(top.x, top.y, top.h)) w.addLadder(bottom, top);
    w.links = { down1, down2 };

    // city houses and the portal plaza
    const houses = [];
    for (let i = 0; i < 12 && houses.length < 3; i++) {
        const hw = ri(rng, 3, 4);
        const hd = ri(rng, 3, 4);
        const hx = ri(rng, city.x0 + 2, city.x1 - hw - 1);
        const hy = ri(rng, city.y0 + 2, city.y1 - hd - 1);
        let free = true;
        for (let x = hx - 1; x <= hx + hw && free; x++) for (let y = hy - 1; y <= hy + hd && free; y++) {
            for (let z = CITY; z < CITY + 5; z++) if (w.get(x, y, z) !== M.AIR || w.stairs.has(key3(x, y, z))) free = false;
            if (!w.isFlat(x, y, CITY)) free = false;
        }
        if (!free) continue;
        slab(w, hx, hy, hx + hw - 1, hy + hd - 1, CITY, CITY + 2, M.BRICK);
        w.prop('roof', hx, hy, CITY + 3, { w: hw, d: hd, color: i });
        houses.push({ x: hx, y: hy, w: hw, d: hd });
    }
    w.houses = houses;

    // ---- gameplay: start, portal, chest, key, creatures, loot
    const all = w.nodes().filter((n) => !n.rise);
    const onLayer = (h) => all.filter((n) => n.h === h);
    const isle = onLayer(ISLAND);
    const grot = onLayer(GROTTO);
    const town = onLayer(CITY);
    if (isle.length < 20 || grot.length < 40 || town.length < 40) return null;

    // the portal in the front corner of the city
    const plaza = town.filter((n) => n.x + n.y >= city.x1 + city.y1 - 8).sort((a, b) => b.x + b.y - (a.x + a.y));
    const portalNode = plaza.find((n) => [[1, 0], [0, 1], [-1, 0], [0, -1]].every(([dx, dy]) => w.isFlat(n.x + dx, n.y + dy, CITY)));
    if (!portalNode) return null;
    w.portal = { x: portalNode.x, y: portalNode.y, h: CITY };

    const start = [...isle].sort((a, b) => a.x + a.y - (b.x + b.y))[Math.floor(rng() * 3)];
    w.start = start;
    const reach = w.bfs(start);
    const reachable = (n) => reach.prev.has(nodeKey(n));
    if (!reachable(w.portal)) return null;

    const used = new Set([nodeKey(start), nodeKey(w.portal)]);
    const take = (list, filter = () => true) => {
        const options = list.filter((n) => reachable(n) && !used.has(nodeKey(n)) && filter(n));
        if (!options.length) return null;
        const n = options[Math.floor(rng() * options.length)];
        used.add(nodeKey(n));
        return n;
    };
    const near = (a, b, r) => Math.abs(a.x - b.x) <= r && Math.abs(a.y - b.y) <= r;

    // chest before the crypt door (front side), key by a sleeping dog
    const chestNode = take(isle, (n) => n.x >= kx - 1 && n.x <= kx + 1 && n.y === ky + 2) ?? take(isle, (n) => near(n, { x: kx, y: ky }, 3));
    if (!chestNode) return null;
    w.chests.push({ x: chestNode.x, y: chestNode.y, h: ISLAND, locked: true, loot: ['shard'] });
    w.block(chestNode.x, chestNode.y, ISLAND, 1);
    const dogNode = take(isle, (n) => !near(n, start, 3) && !near(n, chestNode, 1));
    if (!dogNode) return null;
    const keyNode = take(isle, (n) => near(n, dogNode, 1));
    if (!keyNode) return null;
    w.items.push({ kind: 'key', ...keyNode });
    w.spawns.push({ kind: 'dog', ...dogNode });

    // shard carriers: a ghost in the grotto, a guardian before the portal
    const ghostNode = take(grot, (n) => !near(n, down1.landing, 3));
    const guardNode = take(town, (n) => near(n, w.portal, 3));
    if (!ghostNode || !guardNode) return null;
    w.spawns.push({ kind: 'ghost', ...ghostNode, loot: ['shard'] });
    w.spawns.push({ kind: 'guardian', ...guardNode, loot: ['shard', 'sword'] });

    const count = (base) => base + Math.floor((depth - 1) * 0.7);
    const put = (kind, list, n, filter) => { for (let i = 0; i < n; i++) { const s = take(list, filter); if (s) w.spawns.push({ kind, ...s }); } };
    put('pigeon', isle, 2);
    put('slime', isle, 1);
    put('golem', isle, count(0), (n) => !near(n, start, 4));
    put('ghost', grot, count(1));
    put('slime', grot, 2);
    put('spirit', grot, 1, (n) => pools.some((p) => n.x >= p.x0 - 1 && n.x <= p.x1 + 1 && n.y >= p.y0 - 1 && n.y <= p.y1 + 1));
    put('golem', grot, count(1));
    put('golem', town, count(2), (n) => !near(n, w.portal, 2));
    put('pigeon', town, 2);
    put('slime', town, 1);

    // loot lying around, an open chest in the city
    for (const [list, n] of [[isle, 3], [grot, 4], [town, 4]]) for (let i = 0; i < n; i++) { const s = take(list); if (s) w.items.push({ kind: 'coin', ...s }); }
    const potion = take(grot);
    if (potion) w.items.push({ kind: 'potion', ...potion });
    const townChest = take(town, (n) => !near(n, w.portal, 2));
    if (townChest) {
        w.chests.push({ x: townChest.x, y: townChest.y, h: CITY, locked: false, loot: ['potion', 'coin', 'coin'] });
        w.block(townChest.x, townChest.y, CITY, 1);
    }

    // decoration that blocks: trees and rocks on the island, crates and lamps in the city,
    // never on or right next to the gameplay spots
    const keep = [...used].map((k) => ({ x: k % 1024, y: Math.floor(k / 1024) % 1024 }));
    const free = (n) => !keep.some((k) => near(n, k, 1)) && ![down1, down2].some((run) => run.cells.some(([x, y]) => Math.abs(x - n.x) + Math.abs(y - n.y) <= 1) || near(n, run.landing, 1));
    const decorate = (list, kinds, n) => {
        for (let i = 0; i < n; i++) {
            const s = take(list, free);
            if (!s) continue;
            const kind = kinds[Math.floor(rng() * kinds.length)];
            w.prop(kind, s.x, s.y, s.h, { seed: Math.floor(rng() * 1e9) });
            w.block(s.x, s.y, s.h, 2);
        }
    };
    decorate(isle, ['tree', 'tree', 'rock', 'bush'], 7);
    decorate(grot, ['rock', 'mushroom', 'crystal', 'column'], 7);
    decorate(town, ['crate', 'lamp', 'barrel', 'tree', 'bench'], 8);
    for (const [list, kinds, n] of [[isle, ['flowers', 'grass'], 14], [grot, ['pebbles', 'grass'], 8], [town, ['pebbles'], 6]]) {
        for (let i = 0; i < n; i++) { const s = take(list, free); if (s) w.prop(kinds[Math.floor(rng() * kinds.length)], s.x, s.y, s.h, { seed: Math.floor(rng() * 1e9) }); }
    }
    // bells hang under the grotto front, a waterfall pours off its edge
    for (let i = 0; i < 3; i++) w.prop('bell', ri(rng, grotto.x0 + 4, grotto.x1 - 2), grotto.y1, GROTTO - 3, { seed: i });
    w.prop('waterfall', grotto.x1, ri(rng, grotto.y0 + 4, grotto.y1 - 3), GROTTO - 1, { bottom: CITY });
    // clouds drift behind and beside the island, never in front of the lower layers
    for (let i = 0; i < 4; i++) {
        const a = (0.72 + rng() * 0.9) * Math.PI;
        const d = radius + 2 + rng() * 4;
        w.prop('cloud', cx + Math.cos(a) * d, cy + Math.sin(a) * d, ri(rng, ISLAND + 1, ISLAND + 5), { seed: i });
    }

    // everything that matters must still be reachable after decoration
    const again = w.bfs(start);
    const must = [w.portal, keyNode, dogNode, ghostNode, guardNode, ...w.chests.map((c) => ({ x: c.x, y: c.y, h: c.h }))];
    for (const m of must) {
        const reachAround = [[0, 0], ...DIRS4].some(([dx, dy]) => again.prev.has(key3(m.x + dx, m.y + dy, m.h)));
        if (!reachAround) return null;
    }
    w.grotto = grotto;
    w.city = city;
    w.crypt = { x: kx, y: ky };
    return w;
}
