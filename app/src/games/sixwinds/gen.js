// Six Winds archipelago. One hex world with a sea at layer SEA and six islands:
//
//   Salt Wharf    a stilt village of red and teal hex houses on wooden piers,
//                 green hills with palms behind, a lighthouse, a bandit cape
//   Azure         a canal city: stone quays, arched bridges, blue and teal houses,
//                 stairs up to terraces, the Admiral's palace, orange leaves
//   Sluices       grey concrete locks of the Forerunners: deep water chambers,
//                 walls to walk on, mint light in the floor, a sunken arena
//   Rock islet, the wreck of the "Abyss", the coral reef
//
// Everything the player must reach on an island is checked on the walk graph.

import { HexWorld, M, key3 } from './world.js';
import { DIRS, center, hexAt, dist, disk, ring, mulberry32, noise2, LAYER } from './hex.js';
import { POI_KINDS, defaultDoc } from './worlddoc.js';
import { terrain, landIslands, decorate, smallPois, biomeSpawns, applyEdits, applyPropEdits } from './genbiome.js';

export const SEA = 8;
export const WORLD = { W: 224, D: 236, H: 48 };

const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, a) => a[Math.floor(rng() * a.length)];

// a hex line, cube lerp
function line(q1, r1, q2, r2) {
    const n = dist(q1, r1, q2, r2);
    const out = [];
    for (let i = 0; i <= n; i++) {
        const t = n ? i / n : 0;
        const [q, r] = hexAt(...lerp2(center(q1, r1), center(q2, r2), t));
        if (!out.length || out[out.length - 1][0] !== q || out[out.length - 1][1] !== r) out.push([q, r]);
    }
    return out;
}
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const dirIndex = (dq, dr) => DIRS.findIndex(([a, b]) => a === dq && b === dr);

class Builder {
    constructor(seed, size = WORLD) {
        this.rng = mulberry32(seed);
        this.noise = noise2(seed * 7 + 1);
        this.w = new HexWorld(size.W, size.D, size.H ?? WORLD.H, SEA);
        this.props = [];
        this.npcs = [];
        this.spawns = [];
        this.nodes = [];
        this.docks = [];
        this.stations = [];
        this.lights = [];
        this.islands = [];
        this.labels = [];
        this.uid = 1;
    }

    // every column: its axial coords and world centre
    *columns() {
        const { W, D } = this.w;
        for (let row = 0; row < D; row++) for (let c = 0; c < W; c++) {
            const q = c - (row - (row & 1)) / 2;
            const [x, y] = center(q, row);
            yield [q, row, x, y];
        }
    }

    hex(x, y) {
        return hexAt(x, y);
    }

    // set the surface of a column: solid up to (surface - 1)
    ground(q, r, surface, top, under = M.DIRT, deep = M.ROCK) {
        const w = this.w;
        for (let z = 0; z < surface; z++) w.set(q, r, z, z === surface - 1 ? top : z >= surface - 3 ? under : deep);
        for (let z = surface; z < w.H; z++) if (w.get(q, r, z) !== M.AIR && !(z < SEA)) w.set(q, r, z, M.AIR);
        for (let z = surface; z < SEA; z++) w.set(q, r, z, M.WATER);
    }

    // a deck one layer thick, standing level `level`
    deck(cells, level, mat = M.WOOD, stilts = true) {
        for (const [q, r] of cells) {
            this.w.set(q, r, level - 1, mat);
            for (let z = level; z < level + 3; z++) if (this.w.get(q, r, z) === M.WATER) this.w.set(q, r, z, M.AIR);
            if (stilts && level - 1 > SEA - 1 && (q * 7 + r * 3) % 3 === 0) {
                const floor = this.w.topBelow(q, r, level - 2);
                if (floor < level - 2) this.prop('stilt', q, r, level - 1, { from: (floor + 1) * LAYER });
            }
        }
    }

    // a solid hex house: stories of 5 layers, a roof, doors and windows
    house(q, r, radius, base, stories, wall, roof, o = {}) {
        const w = this.w;
        const cells = [...disk(q, r, radius)];
        const top = base + stories * 5;
        for (const [cq, cr] of cells) {
            for (let z = base; z < top; z++) w.set(cq, cr, z, wall);
            if (o.platform !== false) w.set(cq, cr, base - 1, o.floor ?? M.WOOD);
        }
        // roof: a stepped hex pyramid, or a flat roof with a parapet
        if (o.flat) {
            for (const [cq, cr] of cells) w.set(cq, cr, top, roof);
        } else {
            for (let k = 0; k <= radius; k++) for (const [cq, cr] of disk(q, r, radius - k)) w.set(cq, cr, top + k, roof);
        }
        // doors on the sides toward the given directions, windows on each story
        const doors = o.doors ?? [ri(this.rng, 0, 5)];
        for (let i = 0; i < 6; i++) {
            const edge = [q + DIRS[i][0] * radius, r + DIRS[i][1] * radius];
            for (let s = 0; s < stories; s++) {
                if (s === 0 && doors.includes(i)) this.prop('door', edge[0], edge[1], base, { dir: i, color: o.door ?? pick(this.rng, [0x6b4a35, 0x3f6f8a, 0x2f5f5a]) });
                else if (this.rng() < 0.8) this.prop('window', edge[0], edge[1], base + s * 5 + 2, { dir: i, shutter: o.shutter ?? pick(this.rng, [0x3f95b8, 0x4f9e9e, 0xc9483e, 0xe0a94e]), lit: this.rng() < 0.4 });
            }
            if (o.awning && doors.includes(i)) this.prop('awning', edge[0], edge[1], base + 3, { dir: i, color: o.awning });
        }
        if (!o.flat && this.rng() < 0.5) this.prop(pick(this.rng, ['chimney', 'tank', 'antenna']), q, r, top + radius + 1);
        return { cells, top: o.flat ? top + 1 : top + radius + 1 };
    }

    // stairs rising one layer per hex from (q, r) in direction dir, from level a to level b
    stairs(q, r, dir, a, b, mat = M.WOOD, fillDown = 2) {
        const [dq, dr] = DIRS[dir];
        const out = [];
        let cq = q;
        let cr = r;
        for (let h = a + 1; h <= b; h++) {
            cq += dq;
            cr += dr;
            for (let z = Math.max(0, h - 1 - fillDown); z < h; z++) if (!this.w.solid(cq, cr, z)) this.w.set(cq, cr, z, mat);
            for (let z = h; z < h + 3; z++) this.w.set(cq, cr, z, M.AIR);
            out.push([cq, cr, h]);
        }
        return out;
    }

    prop(kind, q, r, z, extra = {}) {
        const p = { kind, q, r, z, seed: this.uid++, ...extra };
        this.props.push(p);
        if (extra.block) this.w.block(q, r, z, extra.block);
        return p;
    }

    npc(id, q, r, z, face = 0) {
        this.npcs.push({ id, q, r, h: z, face });
        this.w.block(q, r, z, 3);
    }

    node(kind, q, r, z, island, extra = {}) {
        const n = { id: this.uid++, kind, q, r, h: z, island, ...extra };
        this.nodes.push(n);
        if (!['fishspot', 'algae', 'wreck'].includes(kind)) this.w.block(q, r, z, 2);
        return n;
    }

    zone(kind, lvl, cx, cy, radius, count, island, extra = {}) {
        this.spawns.push({ kind, lvl, x: cx, y: cy, radius, count, island, ...extra });
    }
}

// ---------------------------------------------------------------- the world
const TEMPLATES = { wharf: (b, I) => wharf(b, I), azure: (b, I) => azure(b, I), sluice: (b, I) => sluice(b, I), rockislet: (b, I) => rockIslet(b, I), wreck: (b, I) => wreckIslet(b, I), reef: (b, I) => reef(b, I) };
const TPL_ISLAND = { wharf: 'wharf', azure: 'azure', sluice: 'sluice', rockislet: 'rock', wreck: 'wreck', reef: 'reef' };

// input: a world document (see worlddoc.js) or a seed for the default archipelago
export function generateWorld(input = 7) {
    const doc = input && typeof input === 'object' ? input : defaultDoc(input);
    const b = new Builder(doc.seed ?? 7, doc.size ?? WORLD);
    b.doc = doc;
    b.npcDefs = {};
    b.quests = {};
    const isl = {};
    for (const p of doc.pois) {
        const K = POI_KINDS[p.kind];
        if (!K?.template) continue;
        isl[TPL_ISLAND[p.kind]] = { x: p.x, y: p.y, r: K.r, tpl: p.kind, name: p.name };
    }
    b.isl = isl;
    const field = terrain(b, doc, isl, SEA);
    for (const I of Object.values(isl)) TEMPLATES[I.tpl](b, I);
    landIslands(b, doc, field, isl, SEA);
    applyEdits(b, doc, SEA);
    decorate(b, doc, field, isl, SEA);
    smallPois(b, doc, field, isl, SEA);
    biomeSpawns(b, doc, field, isl);
    seaZones(b, isl);
    applyPropEdits(b, doc);
    if (!b.start) b.start = anyStart(b, isl);
    const w = b.w;
    const reach = settle(b, isl);
    const islands = {};
    const meta = {};
    for (const [id, I] of Object.entries(isl)) {
        islands[id] = { x: I.x, y: I.y, r: I.r };
        meta[id] = { name: I.name, biome: I.biome ?? null, lvl: I.lvl ?? null };
    }
    return {
        world: w, props: b.props, npcs: b.npcs, spawns: b.spawns, nodes: b.nodes, docks: b.docks,
        stations: b.stations, lights: b.lights, labels: b.labels, islands, islandMeta: meta, start: b.start, seed: doc.seed, reach,
        npcDefs: b.npcDefs, quests: b.quests, questStart: b.questStart ?? [], doc, biomes: field.biome, landKind: field.land,
    };
}

// with no wharf in the document, start on the biggest island by the sea
function anyStart(b, isl) {
    const w = b.w;
    let best = null;
    for (const d of b.docks) { const n = w.node(...d.land); if (n) { best = { q: n.q, r: n.r, h: n.h }; break; } }
    if (best) return best;
    for (const I of Object.values(isl)) {
        for (const [q, r] of I.cells ?? []) { const s = w.surface(q, r); if (w.node(q, r, s)) return { q, r, h: s }; }
    }
    for (const [q, r] of b.columns()) { const s = w.surface(q, r); if (s > SEA && w.node(q, r, s)) return { q, r, h: s }; }
    return { q: 5, r: 5, h: SEA + 1 };
}

// the island a point belongs to
function islandOf(isl, x, y) {
    let best = null;
    let bd = Infinity;
    for (const [id, I] of Object.entries(isl)) {
        const d = Math.hypot(x - I.x, y - I.y) - I.r;
        if (d < bd) { bd = d; best = id; }
    }
    return bd < 16 ? best : null;
}

const shipWater = (w, q, r) => w.inside(q, r) && w.get(q, r, SEA - 1) === M.WATER && !w.solid(q, r, SEA) && !w.solid(q, r, SEA + 1);

// Make every island playable: find its walkable heart, then move people, the
// dock and the creatures' grounds onto it.
function settle(b, isl) {
    const w = b.w;
    const reach = {};
    for (const [id, I] of Object.entries(isl)) {
        let best = null;
        const dock = b.docks.find((d) => d.island === id && w.node(...d.land));
        if (id === 'wharf' && b.start && w.node(b.start.q, b.start.r, b.start.h)) best = w.strongSet(w.node(b.start.q, b.start.r, b.start.h));
        else if (dock && I.land) best = w.strongSet(w.node(...dock.land));
        else {
            const seen = new Set();
            const [cq, cr] = hexAt(I.x, I.y);
            for (const [q, r] of I.cells ?? disk(cq, cr, Math.ceil(I.r))) {
                const n = w.node(q, r, w.surface(q, r));
                if (!n || seen.has(key3(q, r, n.h))) continue;
                const prev = w.strongSet(n);
                for (const k of prev) seen.add(k);
                if (!best || prev.size > best.size) best = prev;
            }
        }
        reach[id] = best ?? new Set();
    }
    const inSet = (set, q, r, h) => set.has(key3(q, r, h));
    const nodesOf = (set) => [...set].map((k) => {
        const q = (k % 8192) - 4096;
        const rest = Math.floor(k / 8192);
        return [q, (rest % 8192) - 4096, Math.floor(rest / 8192)];
    });
    const touches = (set, q, r, h) => DIRS.some(([dq, dr]) => { for (let hh = h - 2; hh <= h + 2; hh++) if (inSet(set, q + dq, r + dr, hh)) return true; return false; });
    // people stand beside the walkable ground
    for (const n of b.npcs) {
        const [x, y] = center(n.q, n.r);
        const id = islandOf(isl, x, y);
        const set = reach[id];
        if (!set || touches(set, n.q, n.r, n.h)) continue;
        let best = null;
        for (const [q, r, h] of nodesOf(set)) {
            const [cx, cy] = center(q, r);
            const around = DIRS.filter(([dq, dr]) => inSet(set, q + dq, r + dr, h) || inSet(set, q + dq, r + dr, h + 1) || inSet(set, q + dq, r + dr, h - 1)).length;
            if (around < 4) continue;
            const d = Math.hypot(cx - x, cy - y) + Math.abs(h - n.h) * 0.3;
            if (!best || d < best.d) best = { q, r, h, d };
        }
        if (!best) continue;
        w.unblock(n.q, n.r, n.h, 3);
        Object.assign(n, { q: best.q, r: best.r, h: best.h });
        w.block(n.q, n.r, n.h, 3);
        set.delete(key3(n.q, n.r, n.h));
    }
    // gathering spots nobody can walk to are taken away
    b.nodes = b.nodes.filter((n) => {
        if (['fishspot', 'algae', 'wreck'].includes(n.kind)) return true;
        const [x, y] = center(n.q, n.r);
        const set = reach[islandOf(isl, x, y)];
        if (!set || touches(set, n.q, n.r, n.h)) return true;
        w.unblock(n.q, n.r, n.h, 2);
        return false;
    });
    // a dock: walkable ground right next to water a ship can float in
    for (const d of b.docks) {
        const set = reach[d.island];
        if (!set) continue;
        const [wx, wy] = center(d.q, d.r);
        let best = null;
        for (const [q, r, h] of nodesOf(set)) {
            if (h > SEA + 4) continue;
            const [cx, cy] = center(q, r);
            const dd = Math.hypot(cx - wx, cy - wy);
            if (best && dd > best.d) continue;
            for (const [a, c] of disk(q, r, 2)) {
                if (!shipWater(w, a, c) || !DIRS.every(([dq, dr]) => shipWater(w, a + dq, c + dr) || w.solid(a + dq, c + dr, SEA))) continue;
                best = { q, r, h, wq: a, wr: c, d: dd };
                break;
            }
        }
        if (best) { d.land = [best.q, best.r, best.h]; d.q = best.wq; d.r = best.wr; }
    }
    return reach;
}

function seaFloor(b, isl) {
    const w = b.w;
    for (const [q, r, x, y] of b.columns()) {
        let near = Infinity;
        for (const i of Object.values(isl)) near = Math.min(near, Math.hypot(x - i.x, y - i.y) - i.r);
        const n = b.noise(x * 0.08, y * 0.08);
        const floor = Math.round(Math.max(1, Math.min(SEA - 2, SEA - 2 - Math.max(0, near) * 0.22 + (n - 0.5) * 2.5)));
        for (let z = 0; z < floor; z++) w.set(q, r, z, z === floor - 1 ? (floor >= SEA - 3 ? M.SAND : M.SEABED) : M.ROCK);
        for (let z = floor; z < SEA; z++) w.set(q, r, z, M.WATER);
    }
}

// ---------------------------------------------------------------- Salt Wharf
function wharf(b, I) {
    const w = b.w;
    const { rng, noise } = b;
    const S = SEA;
    const coastY = I.y - 13; // south coast line (toward the default camera)
    // land: an irregular blob, higher to the north, terraced
    for (const [q, r, x, y] of b.columns()) {
        const dx = (x - I.x) / 23;
        const dy = (y - (I.y + 5)) / 18;
        const d = Math.hypot(dx, dy) + (noise(x * 0.11, y * 0.11) - 0.5) * 0.45;
        if (d > 1 || y < coastY - 1.5) continue;
        const hills = Math.max(0, 1 - d) * 7 + Math.max(0, y - I.y) * 0.22 + noise(x * 0.2 + 5, y * 0.2) * 2.2;
        let s = S + 1 + Math.floor(hills);
        if (d > 0.88) s = S + 1;
        const top = s <= S + 1 ? M.SAND : M.GRASS;
        b.ground(q, r, s, top, s <= S + 1 ? M.SAND : M.DIRT);
    }
    // the plaza on the south shore, cobbled and level with the piers
    const plazaC = [I.x, coastY + 4];
    for (const [q, r, x, y] of b.columns()) {
        if (Math.hypot((x - plazaC[0]) / 1.4, y - plazaC[1]) > 6.5) continue;
        b.ground(q, r, S + 2, M.COBBLE, M.STONE, M.STONE);
    }
    // a road up the hill from the plaza
    const [pq, pr] = b.hex(...plazaC);
    const [hq, hr] = b.hex(I.x - 3, I.y + 10);
    for (const [q, r] of line(pq, pr, hq, hr)) for (const [a, c] of disk(q, r, 1)) if (w.surface(a, c) > S + 1) w.set(a, c, w.surface(a, c) - 1, M.DIRT);

    // ---- the piers: a main one south from the plaza, two cross piers
    const L = S + 2; // standing level of every deck
    const main = [];
    const [m0q, m0r] = b.hex(I.x, coastY + 1);
    const [m1q, m1r] = b.hex(I.x, coastY - 24);
    for (const [q, r] of line(m0q, m0r, m1q, m1r)) for (const c of [[q, r], [q + 1, r]]) main.push(c);
    b.deck(main, L);
    const cross = [];
    for (const [yy, x0, x1] of [[coastY - 9, I.x - 17, I.x + 15], [coastY - 18, I.x - 12, I.x + 19]]) {
        const [aq, ar] = b.hex(x0, yy);
        const [cq, cr] = b.hex(x1, yy);
        for (const [q, r] of line(aq, ar, cq, cr)) cross.push([q, r], [q, r + 1]);
    }
    b.deck(cross, L);
    const piers = [...main, ...cross];
    const pierSet = new Set(piers.map(([q, r]) => `${q},${r}`));

    // ---- houses on stilts along the piers: red and teal, stacked, with stairs
    const houses = [];
    const spots = [
        [I.x - 13, coastY - 5, 2, 2, M.PLASTER_RED, M.ROOF_TEAL],
        [I.x - 6, coastY - 5.5, 1, 3, M.PLASTER_TEAL, M.ROOF_RED],
        [I.x + 7, coastY - 5, 2, 2, M.PLASTER_TEAL, M.ROOF_RED],
        [I.x + 14, coastY - 4.5, 1, 2, M.PLASTER_RED, M.ROOF_TEAL],
        [I.x - 9, coastY - 13.5, 2, 3, M.PLASTER_RED, M.ROOF_RED], // Mira's, the tallest
        [I.x + 6, coastY - 13.5, 1, 2, M.PLASTER_CREAM, M.ROOF_TEAL],
        [I.x + 12, coastY - 13.5, 2, 2, M.PLASTER_RED, M.ROOF_TEAL],
        [I.x - 5, coastY - 22.5, 1, 2, M.PLASTER_TEAL, M.ROOF_RED],
        [I.x + 9, coastY - 22.5, 2, 1, M.PLASTER_RED, M.ROOF_RED],
        [I.x - 17, coastY - 13.5, 1, 2, M.PLASTER_TEAL, M.ROOF_TEAL],
    ];
    for (const [x, y, rad, st, wall, roof] of spots) {
        const [q, r] = b.hex(x, y);
        const cells = [...disk(q, r, rad)];
        if (cells.some(([a, c]) => pierSet.has(`${a},${c}`))) continue;
        // a platform ring around the house joins it to the pier
        b.deck([...ring(q, r, rad + 1)].filter(([a, c]) => !pierSet.has(`${a},${c}`)), L);
        const h = b.house(q, r, rad, L, st, wall, roof, { doors: [0, 1, 2, 3, 4, 5].filter(() => rng() < 0.35).concat([pick(rng, [4, 5])]), flat: st >= 2 && rng() < 0.35 });
        houses.push({ q, r, rad, st, top: h.top, x, y });
        // stairs round the outside up to a balcony deck on the second story
        if (st >= 2) {
            const bal = [...ring(q, r, rad + 1)];
            const k0 = ri(rng, 0, bal.length - 1);
            b.deck(bal.filter((_, i) => (i - k0 + bal.length) % bal.length >= 5), L + 5, M.WOOD, false);
            // five steps along the ring from the pier up to the balcony
            for (let i = 0; i < 5; i++) {
                const [a, c] = bal[(k0 + i) % bal.length];
                for (let z = L - 1; z < L + i; z++) w.set(a, c, z, M.WOOD);
                for (let z = L + i; z < L + i + 3; z++) if (w.get(a, c, z) === M.WOOD) w.set(a, c, z, M.AIR);
            }
            for (const [a, c] of bal) b.prop('rail', a, c, L + 5, { around: [q, r] });
        }
    }
    // moored boats, crates, barrels, lamps, nets along the piers
    for (const [q, r] of piers) {
        const roll = rng();
        const edge = DIRS.some(([dq, dr]) => w.water(q + dq, r + dr, S - 1) && !w.solid(q + dq, r + dr, L - 1));
        if (edge && roll < 0.06) {
            const d = DIRS.findIndex(([dq, dr]) => w.water(q + dq, r + dr, S - 1) && !w.solid(q + dq, r + dr, L - 1));
            b.prop('boat', q + DIRS[d][0] * 2, r + DIRS[d][1] * 2, S, { dir: d, color: pick(rng, [0xc9483e, 0x4f9e9e, 0xe6dfcf]) });
        } else if (roll < 0.1) b.prop(pick(rng, ['crate', 'barrel', 'crates']), q, r, L, { block: 1 });
        else if (roll < 0.13) b.prop('lamppost', q, r, L, { block: 2 });
        else if (roll < 0.15 && edge) b.prop('bollard', q, r, L);
        else if (roll < 0.17) b.prop('nets', q, r, L);
    }
    // wires between the houses, like the old harbour
    for (let i = 0; i + 1 < houses.length; i++) b.prop('wire', houses[i].q, houses[i].r, houses[i].top, { to: [houses[i + 1].q, houses[i + 1].r, houses[i + 1].top] });

    // ---- the plaza: market, forge, the kitchen
    const pc = b.hex(...plazaC);
    b.prop('well', pc[0], pc[1], S + 2, { block: 2 });
    b.stations.push({ kind: 'forge', q: pc[0] + 4, r: pc[1] + 1, h: S + 2, npc: 'brun' });
    b.prop('anvil', pc[0] + 4, pc[1] + 1, S + 2, { block: 1 });
    b.stations.push({ kind: 'stove', q: pc[0] - 4, r: pc[1] + 2, h: S + 2, npc: 'martin' });
    b.prop('stove', pc[0] - 4, pc[1] + 2, S + 2, { block: 2 });
    b.stations.push({ kind: 'alchemy', q: pc[0] - 2, r: pc[1] + 4, h: S + 2, npc: 'tisa' });
    b.prop('alchemy', pc[0] - 2, pc[1] + 4, S + 2, { block: 1 });
    for (const [dx, dy] of [[-6, 2], [6, 3], [-3, -3], [3, -3]]) { const [q, r] = b.hex(plazaC[0] + dx, plazaC[1] + dy); b.prop('stall', q, r, S + 2, { block: 2, color: pick(rng, [0xc9483e, 0x4f9e9e, 0xe0a94e]) }); }
    for (const [dx, dy] of [[-5, -4], [5, -4], [0, 6]]) { const [q, r] = b.hex(plazaC[0] + dx, plazaC[1] + dy); b.prop('lamppost', q, r, S + 2, { block: 2 }); b.lights.push({ q, r, z: S + 2 + 4, color: 0xffd08a, range: 7 }); }
    // houses on land behind the plaza
    for (const [dx, dy, rad, st, wall, roof] of [[-9, 6, 2, 2, M.PLASTER_CREAM, M.ROOF_RED], [9, 6, 2, 2, M.PLASTER_OCHRE, M.ROOF_TEAL], [0, 10, 1, 3, M.PLASTER_BLUE, M.ROOF_RED]]) {
        const [q, r] = b.hex(plazaC[0] + dx, plazaC[1] + dy);
        const base = w.surface(q, r);
        b.house(q, r, rad, base, st, wall, roof, { doors: [4, 5, 3], platform: false, awning: rng() < 0.6 ? pick(rng, [0xc9483e, 0x4f9e9e]) : 0 });
    }

    // ---- people
    const at = (x, y) => { const [q, r] = b.hex(x, y); return [q, r, w.surface(q, r)]; };
    const onDeck = (x, y) => { const [q, r] = b.hex(x, y); return [q, r, L]; };
    b.npc('gart', ...onDeck(I.x, coastY - 2), 4);
    b.npc('vela', ...at(plazaC[0] + 1.5, plazaC[1] + 1.2), 4);
    b.npc('brun', ...at(plazaC[0] + 4.5, plazaC[1] + 2.3), 4);
    b.npc('martin', ...at(plazaC[0] - 4, plazaC[1] + 3.2), 4);
    b.npc('tisa', ...at(plazaC[0] - 1.2, plazaC[1] + 4.3), 4);
    b.npc('olya', ...at(plazaC[0] + 2.5, plazaC[1] - 2.5), 4);
    b.npc('tomas', ...onDeck(I.x + 1, coastY - 21), 4);
    b.npc('som', ...onDeck(I.x + 16, coastY - 18), 3);
    b.npc('diver', ...onDeck(I.x - 15, coastY - 9), 0);
    const mira = houses.find((h) => h.st === 3 && h.rad === 2) ?? houses[0];
    b.npc('mira', ...onDeck(mira.x + 2.6, mira.y + 1.8), 4);
    b.npc('yar', ...at(I.x - 4, I.y + 6), 4);
    b.npc('grah', ...at(I.x + 17, I.y + 2), 3);
    const startCell = main.slice(6).find(([q, r]) => w.node(q, r, L)) ?? main[0];
    b.start = { q: startCell[0], r: startCell[1], h: L };
    // the ship's berth at the end of the main pier
    b.docks.push({ island: 'wharf', q: m1q, r: m1r - 2, land: [m1q, m1r, L], name: 'Солёная Пристань' });
    b.labels.push({ text: 'Солёная Пристань', x: I.x, y: I.y + 2, z: 12 });

    // ---- the hills: palms and trees, herbs, boars; beach crabs; gulls on the piers
    for (const [q, r, x, y] of b.columns()) {
        if (Math.hypot(x - I.x, y - I.y) > I.r) continue;
        const s = w.surface(q, r);
        if (s <= S + 1 || w.get(q, r, s - 1) === M.COBBLE || w.blocked(q, r, s) || w.solid(q, r, s)) continue;
        if (Math.hypot(x - plazaC[0], y - plazaC[1]) < 11) continue;
        const roll = rng();
        if (w.get(q, r, s - 1) === M.GRASS) {
            if (roll < 0.035) b.node(y > I.y + 4 ? 'tree' : 'palm', q, r, s, 'wharf');
            else if (roll < 0.055) b.node('herbbush', q, r, s, 'wharf');
            else if (roll < 0.1) b.prop(pick(rng, ['grass', 'grass', 'flowers', 'bush']), q, r, s);
            else if (roll < 0.11) b.prop('rock', q, r, s, { block: 1 });
        } else if (w.get(q, r, s - 1) === M.SAND && roll < 0.025) b.prop(pick(rng, ['shell', 'driftwood', 'palm_small']), q, r, s);
    }
    // the lighthouse on the east rocks, copper around it
    const [lq, lr] = b.hex(I.x + 20, I.y + 1);
    for (const [q, r] of disk(lq, lr, 3)) b.ground(q, r, S + 4 + (dist(q, r, lq, lr) < 2 ? 1 : 0), M.ROCK, M.ROCK);
    for (const [q, r] of disk(lq, lr, 1)) for (let z = S + 5; z < S + 19; z++) w.set(q, r, z, z % 4 < 2 ? M.PLASTER_CREAM : M.PLASTER_RED);
    for (const [q, r] of disk(lq, lr, 1)) w.set(q, r, S + 19, M.ROOF_RED);
    b.prop('lantern_top', lq, lr, S + 20);
    b.lights.push({ q: lq, r: lr, z: S + 21, color: 0xffe08a, range: 14 });
    for (const [q, r] of ring(lq, lr, 3)) if (rng() < 0.35) b.node('copper', q, r, w.surface(q, r), 'wharf');
    // bandits on the west cape
    const [cq0, cr0] = b.hex(I.x - 20, I.y + 1);
    for (const [q, r] of disk(cq0, cr0, 4)) b.ground(q, r, S + 3, M.DIRT, M.DIRT);
    b.prop('tent', cq0 - 1, cr0 + 1, S + 3, { block: 2 });
    b.prop('campfire', cq0, cr0, S + 3);
    b.prop('crates', cq0 + 2, cr0 - 1, S + 3, { block: 2 });
    b.lights.push({ q: cq0, r: cr0, z: S + 4, color: 0xff9a4a, range: 7 });
    b.zone('bandit', [6, 9], I.x - 20, I.y + 1, 5, 6, 'wharf');
    b.zone('crab', [1, 3], I.x - 4, I.y + 17, 7, 7, 'wharf');
    b.zone('crab', [1, 3], I.x + 10, coastY - 1, 5, 3, 'wharf');
    b.zone('boar', [3, 5], I.x + 11, I.y + 9, 7, 8, 'wharf');
    b.zone('gull', [1, 2], I.x, coastY - 12, 10, 6, 'wharf', { onDeck: true });
    // fishing spots around the piers
    for (const [q, r] of piers) {
        if (rng() > 0.05) continue;
        const d = DIRS.findIndex(([dq, dr]) => w.water(q + dq, r + dr, S - 1) && !w.solid(q + dq, r + dr, L - 1));
        if (d >= 0) b.node('fishspot', q + DIRS[d][0], r + DIRS[d][1], S, 'wharf', { stand: [q, r, L] });
    }
    b.islands.push({ id: 'wharf', ...I });
}

// ---------------------------------------------------------------- Azure, the canal city
function azure(b, I) {
    const w = b.w;
    const { rng, noise } = b;
    const S = SEA;
    const Q = S + 2; // quay level
    // the island: stone, mostly flat with a raised old town to the north
    for (const [q, r, x, y] of b.columns()) {
        const dx = (x - I.x) / 24;
        const dy = (y - I.y) / 21;
        const d = Math.hypot(dx, dy) + (noise(x * 0.09 + 9, y * 0.09) - 0.5) * 0.25;
        if (d > 1) continue;
        let s = Q;
        if (y > I.y + 6 && d < 0.85) s = Q + 4;
        if (y > I.y + 12 && d < 0.7) s = Q + 8;
        b.ground(q, r, s, s > Q ? M.STONE : M.COBBLE, M.STONE, M.STONE);
    }
    // canals: one east-west through the middle, two north-south into the lower town
    const canal = new Set();
    const cut = (x0, y0, x1, y1, width) => {
        const [aq, ar] = b.hex(x0, y0);
        const [cq, cr] = b.hex(x1, y1);
        for (const [q, r] of line(aq, ar, cq, cr)) for (const [a, c] of disk(q, r, width)) {
            if (w.surface(a, c) < Q) continue;
            if (w.surface(a, c) > Q) continue; // the old town stands on its wall
            for (let z = 2; z < S; z++) w.set(a, c, z, z === 2 ? M.SEABED : M.WATER);
            for (let z = S; z < w.H; z++) w.set(a, c, z, M.AIR);
            canal.add(`${a},${c}`);
        }
    };
    cut(I.x - 26, I.y - 1, I.x + 26, I.y - 1, 1);
    cut(I.x - 9, I.y - 22, I.x - 9, I.y + 1, 1);
    cut(I.x + 9, I.y - 22, I.x + 9, I.y + 1, 1);
    // quays: the stone next to water gets a darker edge block and mooring posts
    // arched bridges over the canals, one layer above the quays
    const bridges = [[I.x - 17, I.y - 1, 'ns'], [I.x, I.y - 1, 'ns'], [I.x + 16, I.y - 1, 'ns'], [I.x - 9, I.y - 12, 'ew'], [I.x + 9, I.y - 10, 'ew'], [I.x - 9, I.y - 18, 'ew']];
    for (const [x, y, o] of bridges) {
        const [a0, a1] = o === 'ns' ? [[x, y - 3.2], [x, y + 3.2]] : [[x - 3.4, y], [x + 3.4, y]];
        const [q0, r0] = b.hex(...a0);
        const [q1, r1] = b.hex(...a1);
        const cells = line(q0, r0, q1, r1);
        cells.forEach(([q, r], i) => {
            const rise = i === 0 || i === cells.length - 1 ? 1 : 2; // up a step, across, down a step
            for (const [a, c] of [[q, r], [q + (o === 'ns' ? 1 : 0), r + (o === 'ns' ? 0 : 1)]]) {
                w.set(a, c, Q + rise - 1, M.STONE);
                for (let z = Q + rise; z < Q + rise + 3; z++) w.set(a, c, z, M.AIR);
                if (canal.has(`${a},${c}`)) b.prop('arch', a, c, Q + rise - 1);
            }
        });
    }
    // houses: blue, teal and cream, on the quays and up in the old town
    const taken = new Set([...canal]);
    const tryHouse = (x, y, rad, st, wall, roof, o = {}) => {
        const [q, r] = b.hex(x, y);
        const cells = [...disk(q, r, rad + 1)];
        if (cells.some(([a, c]) => taken.has(`${a},${c}`) || w.surface(a, c) !== w.surface(q, r))) return null;
        for (const [a, c] of cells) taken.add(`${a},${c}`);
        return b.house(q, r, rad, w.surface(q, r), st, wall, roof, { platform: false, ...o });
    };
    const walls = [M.PLASTER_BLUE, M.PLASTER_TEAL, M.PLASTER_CREAM, M.PLASTER_BLUE];
    for (let i = 0; i < 70; i++) {
        const x = I.x + (rng() - 0.5) * 44;
        const y = I.y + (rng() - 0.5) * 38;
        tryHouse(x, y, ri(rng, 1, 2), ri(rng, 2, 3), pick(rng, walls), pick(rng, [M.ROOF_RED, M.ROOF_TEAL, M.ROOF_RED]), { flat: rng() < 0.4, awning: rng() < 0.3 ? pick(rng, [0xe0a94e, 0xc9483e]) : 0, doors: [ri(rng, 3, 5)] });
    }
    // the Admiral's palace crowns the old town
    const [aq, ar] = b.hex(I.x, I.y + 17);
    for (const [a, c] of disk(aq, ar, 4)) taken.add(`${a},${c}`);
    b.house(aq, ar, 3, w.surface(aq, ar), 3, M.PLASTER_CREAM, M.ROOF_RED, { platform: false, doors: [4, 5], shutter: 0x3f95b8 });
    // stairs from the quays up to the old town and on to the palace
    for (const [x, from, to] of [[I.x - 4, Q, Q + 4], [I.x + 5, Q, Q + 4], [I.x - 1, Q + 4, Q + 8]]) {
        const y = from === Q ? I.y + 3.2 : I.y + 9.6;
        const [q, r] = b.hex(x, y - 0.9);
        b.stairs(q, r, 1, from, to, M.STONE, 6);
        b.stairs(q + 1, r, 1, from, to, M.STONE, 6);
    }
    // lanterns, flower pots, orange leaves; autumn trees in the courtyards
    for (const [q, r, x, y] of b.columns()) {
        if (Math.hypot((x - I.x) / 24, (y - I.y) / 21) > 0.95) continue;
        const s = w.surface(q, r);
        if (s < Q || w.solid(q, r, s) || w.blocked(q, r, s) || taken.has(`${q},${r}`)) continue;
        const nearWater = DIRS.some(([dq, dr]) => canal.has(`${q + dq},${r + dr}`));
        const roll = rng();
        if (nearWater && roll < 0.05) b.prop('bollard', q, r, s);
        else if (nearWater && roll < 0.09) b.prop('lamppost', q, r, s, { block: 2 });
        else if (roll < 0.035) b.prop('autumn_tree', q, r, s, { block: 2 });
        else if (roll < 0.09) b.prop('pot', q, r, s);
        else if (roll < 0.2) b.prop('leaves', q, r, s);
    }
    for (const k of canal) {
        const [q, r] = k.split(',').map(Number);
        if (rng() < 0.03) b.prop('rowboat', q, r, S, { dir: ri(rng, 0, 5), color: pick(rng, [0x8a6446, 0x5e4535]) });
        if (rng() < 0.05) b.node('fishspot', q, r, S, 'azure');
    }
    // people
    const stand = (x, y) => { const [q, r] = b.hex(x, y); for (const [a, c] of disk(q, r, 2)) { const s = w.surface(a, c); if (w.node(a, c, s) && !taken.has(`${a},${c}`) && !canal.has(`${a},${c}`)) return [a, c, s]; } return [q, r, w.surface(q, r)]; };
    b.npc('cyrus', ...stand(I.x, I.y + 12.6), 4);
    b.npc('lucca', ...stand(I.x + 12, I.y - 4), 4);
    b.npc('laura', ...stand(I.x - 13, I.y + 4), 4);
    b.npc('julia', ...stand(I.x - 4, I.y - 5), 4);
    const lau = b.npcs[b.npcs.length - 2];
    b.stations.push({ kind: 'alchemy', q: lau.q + 1, r: lau.r, h: lau.h, npc: 'laura' });
    // the dock on the south-west quay
    const dockAt = stand(I.x - 18, I.y - 15);
    b.docks.push({ island: 'azure', q: dockAt[0] - 1, r: dockAt[1] - 2, land: dockAt, name: 'Лазурь' });
    b.zone('rat', [8, 11], I.x + 14, I.y - 12, 7, 7, 'azure');
    b.zone('thief', [10, 13], I.x + 18, I.y - 2, 7, 8, 'azure');
    b.zone('thief', [10, 13], I.x - 17, I.y + 8, 5, 4, 'azure');
    b.labels.push({ text: 'Лазурь', x: I.x, y: I.y + 4, z: 14 });
    b.islands.push({ id: 'azure', ...I });
}

// ---------------------------------------------------------------- the Sluices of the Forerunners
// A staircase of locks climbing away from the harbour: sea-level water at the
// front, two chambers above it, the Great Gate and the storm reservoir at the
// back. Walls between them are walkways; platforms on both sides hold a sunken
// court (the Warden's), a glowing basin and the pump house.
function sluice(b, I) {
    const w = b.w;
    const { rng } = b;
    const S = SEA;
    const P = S + 4; // platform level
    const WL = S + 10; // walkway on the walls
    const Q = S + 2; // harbour quay
    const rel = (x, y) => [x - I.x, y - I.y];
    const cells = [];
    for (const [q, r, x, y] of b.columns()) {
        const [dx, dy] = rel(x, y);
        if (Math.abs(dx) > 22 || dy < -19 || dy > 21 || Math.abs(dx) + Math.max(0, dy - 6) * 0.9 > 25) continue;
        cells.push([q, r, dx, dy]);
    }
    const chambers = [[-19, -7.6, S], [-6.6, 3.6, S + 4], [4.6, 13, S + 7], [15.2, 21, S + 9]];
    const walls = [[-7.6, -6.6], [3.6, 4.6], [13, 15.2]];
    for (const [q, r, dx, dy] of cells) {
        const adx = Math.abs(dx);
        if (adx <= 3.1) {
            // the canal: chambers of water, gate walls between them
            const wall = walls.findIndex(([a, c]) => dy >= a && dy < c);
            if (wall >= 0) {
                const top = wall === 2 ? WL + 4 : WL;
                b.ground(q, r, top, M.CONCRETE, M.CONCRETE, M.CONCRETE);
                if (wall === 2 && adx < 1.2) for (let z = WL; z < top; z++) w.set(q, r, z, M.GLOW);
                continue;
            }
            const ch = chambers.find(([a, c]) => dy >= a && dy < c);
            b.ground(q, r, S - 2, M.CONCRETE, M.CONCRETE, M.CONCRETE);
            for (let z = S - 2; z < ch[2]; z++) w.set(q, r, z, M.WATER);
        } else if (adx <= 4.8) {
            b.ground(q, r, WL, M.CONCRETE, M.CONCRETE, M.CONCRETE); // canal walls, walkways on top
        } else if (dy < -12) {
            b.ground(q, r, Q, M.CONCRETE, M.CONCRETE, M.CONCRETE); // the harbour quay
        } else {
            b.ground(q, r, P, M.CONCRETE, M.CONCRETE, M.CONCRETE);
        }
    }
    // the canal opens to the sea at the front
    for (const [q, r, dx, dy] of cells) if (Math.abs(dx) <= 3.1 && dy < -17) for (let z = S - 2; z < S; z++) w.set(q, r, z, M.WATER);
    // steps: quay up to the platforms, platforms up to the walkways
    for (const side of [-1, 1]) {
        const [q, r] = b.hex(I.x + side * 9, I.y - 12.4);
        for (const k of [0, 1, 2]) b.stairs(q + k, r - 2, 1, Q, P, M.CONCRETE, 3);
        for (const dy of [-5, 6.5]) {
            // the last step is the platform hex right beside the wall
            const [, sr] = b.hex(I.x, I.y + dy);
            let last = null;
            for (let q = -200; q < 400 && last === null; q++) {
                const x = q + sr / 2 - I.x;
                if (side < 0 && x < -4.8 && x + 1 >= -4.8) last = q;
                if (side > 0 && x > 4.8 && x - 1 <= 4.8) last = q;
            }
            b.stairs(last + side * 6, sr, side > 0 ? 3 : 0, P, WL, M.CONCRETE, 6);
        }
    }
    // grated crossings over the gate walls at walkway height are the walls themselves;
    // at the Great Gate a bridge keeps the walkway level
    for (const [q, r, dx, dy] of cells) if (Math.abs(dx) <= 4.8 && dy >= 13 && dy < 15.2 && Math.abs(dx) > 1.2) { for (let z = WL; z < WL + 4; z++) w.set(q, r, z, M.AIR); }
    // glowing channels in the platforms, grates to cross them
    for (const [q, r, dx, dy] of cells) {
        const adx = Math.abs(dx);
        if (adx <= 4.8 || dy < -12) continue;
        const onX = Math.abs(dy - 9.5) < 0.45 || Math.abs(dy + 8) < 0.45;
        const onY = Math.abs(adx - 16) < 0.5;
        if (!(onX || onY)) continue;
        if ((q + r * 3) % 5 === 0) { w.set(q, r, P - 1, M.METAL); continue; }
        w.set(q, r, P - 2, M.GLOW);
        w.set(q, r, P - 1, M.WATER);
    }
    // the Warden's court: sunk into the west platform, a ring of light in the floor
    const [aq, ar] = b.hex(I.x - 13, I.y + 2);
    for (const [q, r] of disk(aq, ar, 5)) {
        for (let z = S + 1; z < w.H; z++) w.set(q, r, z, M.AIR);
        w.set(q, r, S, dist(q, r, aq, ar) === 3 ? M.GLOW : M.TILE);
    }
    for (const [q, r] of ring(aq, ar, 6)) if (w.surface(q, r) === P && rng() < 0.5) b.prop('pylon', q, r, P, { block: 2 });
    for (let k = 0; k < 3; k++) b.stairs(aq + 5 + k, ar - 2 - k, 3, S + 1, P, M.CONCRETE, 3).length;
    for (const [q, r] of disk(aq + 6, ar - 3, 1)) for (let z = S + 1; z < P; z++) if (w.get(q, r, z) === M.CONCRETE && z >= w.surface(q, r)) w.set(q, r, z, M.AIR);
    b.zone('warden', [20, 20], I.x - 13, I.y + 2, 1.5, 1, 'sluice');
    b.lights.push({ q: aq, r: ar, z: S + 4, color: 0x6ff5cf, range: 10 });
    // a basin of light on the east side
    const [eq, er] = b.hex(I.x + 13, I.y + 1.5);
    for (const [q, r] of disk(eq, er, 4)) {
        const d = dist(q, r, eq, er);
        for (let z = P - 3; z < w.H; z++) w.set(q, r, z, z < P - 1 ? M.WATER : M.AIR);
        w.set(q, r, P - 4, d < 2 ? M.GLOW : M.CONCRETE);
    }
    for (const [q, r] of ring(eq, er, 4)) for (let z = P - 3; z < P; z++) w.set(q, r, z, M.CONCRETE);
    b.lights.push({ q: eq, r: er, z: P, color: 0x6ff5cf, range: 8 });
    // the pump house
    const [pq, pr] = b.hex(I.x + 14, I.y + 11);
    b.house(pq, pr, 2, P, 2, M.CONCRETE, M.CONCRETE, { flat: true, platform: false, doors: [3, 4], shutter: 0x6a7a78 });
    // towers at the corners, lit at the top
    for (const [dx, dy] of [[-19, -10], [19, -10], [-19, 17], [19, 17]]) {
        const [q, r] = b.hex(I.x + dx, I.y + dy);
        const top = WL + 7;
        for (const [a, c] of disk(q, r, 1)) for (let z = 0; z < top; z++) w.set(a, c, z, z % 6 === 5 ? M.METAL : M.CONCRETE);
        for (const [a, c] of disk(q, r, 1)) w.set(a, c, top, M.GLOW);
        b.prop('antenna', q, r, top + 1);
        b.lights.push({ q, r, z: top + 2, color: 0x6ff5cf, range: 7 });
    }
    // machinery on the platforms, lamps along the walkways
    for (const [q, r, dx, dy] of cells) {
        const s = w.surface(q, r);
        if (!w.node(q, r, s) || w.blocked(q, r, s)) continue;
        const roll = rng();
        if (s === P && roll < 0.025) b.prop(pick(rng, ['pipe', 'valve', 'hatch', 'crates', 'barrel']), q, r, s, { block: 1 });
        else if (s === WL && Math.abs(Math.abs(dx) - 3.9) < 0.6 && roll < 0.06) b.prop('lamppost', q, r, s, { block: 2 });
        else if (s === Q && roll < 0.05) b.prop(pick(rng, ['bollard', 'crates', 'nets', 'barrel']), q, r, s, { block: 1 });
    }
    // the hermit lives on the west quay
    const [hq, hr] = b.hex(I.x - 11, I.y - 16);
    b.house(hq, hr, 1, Q, 1, M.PLASTER_CREAM, M.ROOF_TEAL, { platform: false, doors: [0, 5] });
    b.prop('campfire', hq + 2, hr - 1, Q);
    b.lights.push({ q: hq + 2, r: hr - 1, z: Q + 1, color: 0xff9a4a, range: 6 });
    b.npc('hermit', hq + 2, hr + 1, Q, 3);
    const [dq, dr] = b.hex(I.x - 12, I.y - 20);
    b.docks.push({ island: 'sluice', q: dq, r: dr, land: [hq, hr - 2, Q], name: 'Шлюзы Предтеч' });
    b.zone('automaton', [13, 16], I.x - 12, I.y - 6, 7, 6, 'sluice');
    b.zone('automaton', [14, 17], I.x + 12, I.y + 5, 8, 7, 'sluice');
    b.zone('sentinel', [15, 18], I.x, I.y + 1, 6, 4, 'sluice', { minH: WL });
    b.labels.push({ text: 'Шлюзы Предтеч', x: I.x, y: I.y, z: 18 });
    b.islands.push({ id: 'sluice', ...I });
}

// ---------------------------------------------------------------- islets
function rockIslet(b, I) {
    const w = b.w;
    const { rng, noise } = b;
    for (const [q, r, x, y] of b.columns()) {
        const d = Math.hypot(x - I.x, y - I.y) / I.r + (noise(x * 0.2, y * 0.2) - 0.5) * 0.3;
        if (d > 1) continue;
        const s = SEA + 1 + Math.floor((1 - d) * 9);
        b.ground(q, r, s, M.ROCK, M.ROCK, M.ROCK);
        if (rng() < 0.08 && s > SEA + 2) b.node(rng() < 0.4 ? 'iron' : 'copper', q, r, s, 'rock');
    }
    const [q, r] = b.hex(I.x + 5, I.y - 7);
    b.docks.push({ island: 'rock', q, r: r - 2, land: [q, r, w.surface(q, r)], name: 'Скала Рудокопов' });
    b.zone('rockcrab', [5, 8], I.x, I.y, 6, 6, 'rock');
    b.labels.push({ text: 'Скала Рудокопов', x: I.x, y: I.y, z: 12 });
    b.islands.push({ id: 'rock', ...I });
}

function wreckIslet(b, I) {
    const w = b.w;
    const { rng } = b;
    for (const [q, r, x, y] of b.columns()) {
        const d = Math.hypot((x - I.x) / 1.6, y - I.y) / I.r;
        if (d > 1) continue;
        b.ground(q, r, d < 0.6 ? SEA + 1 : SEA - 1, M.SAND, M.SAND, M.SAND);
    }
    const [q, r] = b.hex(I.x, I.y);
    b.prop('galleon', q, r, SEA, { dir: 1 });
    for (const [a, c] of ring(q, r, 6)) if (rng() < 0.35 && w.get(a, c, SEA - 1) === M.WATER) b.node('wreck', a, c, SEA, 'wreck');
    for (let i = 0; i < 5; i++) { const [a, c] = b.hex(I.x + (rng() - 0.5) * 12, I.y + (rng() - 0.5) * 6); if (w.surface(a, c) === SEA + 1) b.prop(pick(rng, ['barrel', 'crate', 'driftwood']), a, c, SEA + 1); }
    const [dq, dr] = b.hex(I.x - 7, I.y - 3);
    b.docks.push({ island: 'wreck', q: dq, r: dr - 2, land: [dq, dr, SEA + 1], name: 'Остов «Бездны»' });
    b.labels.push({ text: 'Остов «Бездны»', x: I.x, y: I.y, z: 8 });
    b.islands.push({ id: 'wreck', ...I });
}

function reef(b, I) {
    const w = b.w;
    const { rng, noise } = b;
    for (const [q, r, x, y] of b.columns()) {
        const d = Math.hypot(x - I.x, y - I.y) / I.r + (noise(x * 0.15, y * 0.15) - 0.5) * 0.4;
        if (d > 1) continue;
        const sand = noise(x * 0.3 + 3, y * 0.3) > 0.62;
        b.ground(q, r, sand ? SEA + 1 : SEA - 1, sand ? M.SAND : rng() < 0.3 ? M.CORAL : M.SAND, M.SAND, M.ROCK);
        if (!sand && rng() < 0.06) b.node('algae', q, r, SEA, 'reef');
        if (!sand && rng() < 0.08) b.prop('coral', q, r, SEA - 1);
    }
    const [q, r] = b.hex(I.x - 10, I.y + 2);
    b.ground(q, r, SEA + 1, M.SAND);
    b.docks.push({ island: 'reef', q: q - 2, r, land: [q, r, SEA + 1], name: 'Коралловая отмель' });
    b.zone('coralgolem', [10, 13], I.x, I.y, 9, 6, 'reef', { sand: true });
    b.labels.push({ text: 'Коралловая отмель', x: I.x, y: I.y, z: 8 });
    b.islands.push({ id: 'reef', ...I });
}

function seaZones(b, isl) {
    const z = (kind, lvl, A, B, dy, rad, n) => { if (isl[A] && isl[B]) b.zone(kind, lvl, (isl[A].x + isl[B].x) / 2, (isl[A].y + isl[B].y) / 2 + dy, rad, n, 'sea', { sea: true }); };
    z('serpent', [9, 14], 'wharf', 'azure', 10, 12, 3);
    if (isl.wreck) b.zone('serpent', [10, 15], isl.wreck.x + 8, isl.wreck.y + 8, 10, 3, 'sea', { sea: true });
    if (isl.azure && isl.sluice) b.zone('pirate', [12, 17], (isl.azure.x + isl.sluice.x) / 2 + 12, (isl.azure.y + isl.sluice.y) / 2, 12, 2, 'sea', { sea: true });
    if (isl.reef) b.zone('pirate', [14, 18], isl.reef.x - 12, isl.reef.y - 18, 10, 2, 'sea', { sea: true });
}

export { key3 };
