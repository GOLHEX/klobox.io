// Strata location generator: a stack of tiers hanging over the abyss, in the
// spirit of cutaway dungeon posters.
//
//   1. Tiers: 5-7 horizontal slices, each with its own biome (village or ruins
//      on top, then mines, grottoes, crypts, forges, libraries..., the sanctum
//      with the Gates at the bottom). Each tier drifts sideways from the one above.
//   2. Places: rooms, caves, meadows, halls. A place is a floor slab with a
//      hanging underside of rock, walls on its back sides (the camera looks from
//      +x +y) and a low parapet in front, so every room reads as a cutaway.
//   3. Connections: an A* router threads paths through free air between places:
//      flat walkways and bridges, straight stair runs that may turn on landings,
//      and ladders up a pillar it builds itself. Places in a tier are joined by a
//      spanning tree plus a few loops; every tier is joined to the next.
//   4. Waterfalls pour off a ledge into a deep pool below: a one-way shortcut.
//   5. Furnishing by place and biome, lights, particles.
//   6. Objectives: three Seals (a locked chest and its key, an elite beast, a
//      vault behind a gate opened by levers), campfires, a merchant, relics,
//      chests, creatures, the guardian before the Gates. Everything that matters
//      is checked to be reachable there and back on the walk graph.

import { World, B, DIRS4, key3, stairShape, mulberry32, nodeKey, sameNode } from './world.js';
import { BIOMES, PLACES, PATHS, KINDS, RELICS, OUTDOOR, UNDERGROUND, WANDERERS, NOTES } from './lore.js';

const ri = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const weighted = (rng, list) => {
    let t = 0;
    for (const [, w] of list) t += w;
    let r = rng() * t;
    for (const [v, w] of list) if ((r -= w) <= 0) return v;
    return list[list.length - 1][0];
};
const shuffle = (rng, a) => {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};
const k2 = (x, y) => y * 1024 + x;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class GenFail extends Error {}
let current = null;
const fail = (why) => {
    if (DEBUG.keep) DEBUG.last = { why, G: current };
    throw new GenFail(why);
};

export const TIER_GAP = 12;

// ---- prop catalogue: blocking height in cells (0 = walk through), light, wall-mounted
const L = (color, intensity, range, flicker = 0) => ({ color, intensity, range, flicker });
export const PROPS = {
    tree: { h: 2 }, pine: { h: 2 }, deadtree: { h: 2 }, bush: { h: 1 }, rock: { h: 1 }, boulder: { h: 1 },
    flowers: { h: 0 }, grass: { h: 0 }, mushrooms: { h: 0 }, reeds: { h: 0 }, lily: { h: 0 }, pebbles: { h: 0 },
    bones: { h: 0 }, moss: { h: 0 }, rug: { h: 0 }, croprow: { h: 0 }, rails: { h: 0 }, scrolls: { h: 0 }, cobweb: { h: 0, wall: true },
    stalagmite: { h: 1 }, giantshroom: { h: 2, light: L(0xc08cff, 1.0, 5.5, 0.1) }, crystals: { h: 1, light: L(0x7fe8ff, 0.9, 5, 0.15) },
    barrel: { h: 1 }, crate: { h: 1 }, crates: { h: 2 }, table: { h: 1 }, chair: { h: 1 }, bed: { h: 1 },
    shelf: { h: 2, wall: true }, bookshelf: { h: 2, wall: true }, desk: { h: 1, light: L(0xffc46a, 0.6, 3.5, 0.3) },
    candles: { h: 0, light: L(0xffb85a, 0.7, 3.8, 0.4) }, torch: { h: 0, wall: true, light: L(0xff9a3a, 1.0, 5.5, 0.5) },
    lamppost: { h: 2, light: L(0xffd27a, 1.1, 6.5, 0.1) }, brazier: { h: 1, light: L(0xff8a3a, 1.2, 6.5, 0.6) },
    campfire: { h: 0, light: L(0xff9a4a, 1.5, 7.5, 0.6) }, well: { h: 1 }, stall: { h: 2 }, bench: { h: 1 }, fence: { h: 1 },
    scarecrow: { h: 2 }, haystack: { h: 1 }, cart: { h: 1 }, minecart: { h: 1 }, scaffold: { h: 3 }, anvil: { h: 1 },
    furnace: { h: 2, wall: true, light: L(0xff6a2a, 1.4, 6.5, 0.4) }, chains: { h: 0 }, gear: { h: 0, wall: true },
    sarcophagus: { h: 1 }, urn: { h: 1 }, altar: { h: 1, light: L(0xb8a0ff, 0.9, 5, 0.2) }, pew: { h: 1 }, statue: { h: 3 },
    column: { h: 3 }, brokencolumn: { h: 1 }, tombstone: { h: 1 }, banner: { h: 0, wall: true },
    fireplace: { h: 2, wall: true, light: L(0xff8a3a, 1.2, 6, 0.5) }, globe: { h: 1 }, telescope: { h: 2 }, signpost: { h: 1 },
    cauldron: { h: 1, light: L(0x8aff9a, 0.6, 3.5, 0.3) }, boat: { h: 0 }, nets: { h: 0 },
    glowworms: { h: 0, wall: true, light: L(0x9fffd0, 0.5, 4.5, 0.2) }, roots: { h: 0, wall: true }, vines: { h: 0, wall: true },
    bedroll: { h: 0 }, logseat: { h: 1 }, tent: { h: 2 }, mapboard: { h: 1, wall: true }, pickaxes: { h: 0, wall: true },
    bellows: { h: 1 }, ingots: { h: 1 }, sapling: { h: 1 }, beehive: { h: 1 }, rail: { h: 0 }, lantern: { h: 0, light: L(0xffd27a, 0.9, 5.5, 0.2) },
    beam: { h: 0 }, arch: { h: 0 }, stalactites: { h: 0 }, sap: { h: 0, light: L(0xa8ff6a, 0.6, 4, 0.2) }, glowcap: { h: 0, light: L(0xc08cff, 0.5, 3.5, 0.2) },
};

const FURNISH = {
    meadow: [['tree', 2, 4, 'any'], ['bush', 1, 3, 'any'], ['rock', 1, 2, 'any'], ['flowers', 3, 6, 'any'], ['grass', 5, 9, 'any'], ['pebbles', 1, 3, 'any'], ['beehive', 0, 1, 'any'], ['haystack', 0, 1, 'any']],
    house: [['bed', 1, 1, 'back'], ['shelf', 1, 2, 'back'], ['fireplace', 1, 1, 'back'], ['table', 1, 1, 'center'], ['chair', 1, 2, 'center'], ['rug', 1, 1, 'center'], ['barrel', 0, 2, 'back'], ['candles', 1, 1, 'any'], ['crate', 0, 1, 'back']],
    square: [['well', 1, 1, 'center'], ['stall', 1, 2, 'back'], ['lamppost', 1, 2, 'front'], ['bench', 1, 2, 'any'], ['barrel', 1, 2, 'any'], ['crate', 0, 2, 'any'], ['flowers', 1, 3, 'front']],
    garden: [['croprow', 4, 7, 'any'], ['scarecrow', 1, 1, 'center'], ['haystack', 0, 1, 'any'], ['sapling', 1, 3, 'any'], ['beehive', 0, 1, 'back'], ['flowers', 2, 4, 'any']],
    ruinhall: [['brokencolumn', 2, 4, 'any'], ['column', 1, 3, 'back'], ['statue', 0, 1, 'back'], ['rock', 1, 3, 'any'], ['grass', 3, 6, 'any'], ['vines', 1, 3, 'back'], ['banner', 0, 2, 'back'], ['torch', 1, 2, 'back']],
    graveyard: [['tombstone', 4, 8, 'any'], ['deadtree', 1, 2, 'any'], ['lamppost', 1, 1, 'any'], ['grass', 3, 6, 'any'], ['bones', 1, 2, 'any'], ['urn', 0, 2, 'any']],
    gallery: [['scaffold', 1, 2, 'back'], ['minecart', 1, 1, 'any'], ['crate', 1, 3, 'any'], ['barrel', 1, 2, 'any'], ['torch', 2, 3, 'back'], ['pickaxes', 1, 2, 'back'], ['stalagmite', 1, 3, 'any'], ['pebbles', 2, 4, 'any']],
    storage: [['crates', 2, 4, 'back'], ['barrel', 2, 4, 'back'], ['crate', 1, 3, 'any'], ['torch', 1, 2, 'back'], ['cart', 0, 1, 'any']],
    camp: [['bedroll', 1, 2, 'any'], ['logseat', 1, 2, 'any'], ['tent', 0, 1, 'back'], ['barrel', 0, 1, 'back'], ['pebbles', 1, 2, 'any']],
    pool: [['reeds', 3, 6, 'any'], ['lily', 2, 5, 'water'], ['stalagmite', 1, 3, 'any'], ['glowworms', 2, 4, 'back'], ['boat', 0, 1, 'water'], ['nets', 0, 1, 'any'], ['moss', 2, 4, 'any']],
    mosscave: [['stalagmite', 2, 4, 'any'], ['mushrooms', 2, 4, 'any'], ['glowworms', 2, 4, 'back'], ['moss', 3, 6, 'any'], ['pebbles', 1, 3, 'any'], ['bones', 0, 1, 'any']],
    grove: [['giantshroom', 3, 5, 'any'], ['mushrooms', 4, 8, 'any'], ['moss', 3, 6, 'any'], ['glowcap', 2, 4, 'any'], ['stalagmite', 0, 2, 'any']],
    geode: [['crystals', 4, 7, 'any'], ['stalagmite', 1, 3, 'any'], ['pebbles', 2, 4, 'any']],
    cryptHall: [['sarcophagus', 2, 4, 'any'], ['urn', 2, 4, 'back'], ['candles', 2, 4, 'any'], ['bones', 1, 3, 'any'], ['cobweb', 1, 3, 'back'], ['statue', 0, 1, 'back'], ['torch', 1, 2, 'back']],
    chapel: [['altar', 1, 1, 'back'], ['pew', 3, 6, 'center'], ['candles', 2, 4, 'any'], ['statue', 1, 2, 'back'], ['banner', 1, 2, 'back'], ['cobweb', 1, 2, 'back']],
    forgeHall: [['anvil', 2, 3, 'any'], ['furnace', 1, 2, 'back'], ['bellows', 0, 1, 'back'], ['ingots', 1, 2, 'any'], ['chains', 1, 3, 'any'], ['gear', 1, 2, 'back'], ['barrel', 0, 2, 'back'], ['brazier', 1, 2, 'any']],
    lavaCave: [['stalagmite', 2, 4, 'any'], ['crystals', 0, 1, 'any'], ['bones', 0, 2, 'any'], ['pebbles', 2, 4, 'any']],
    stacks: [['candles', 1, 3, 'any'], ['scrolls', 2, 4, 'any'], ['globe', 0, 1, 'any'], ['mapboard', 0, 1, 'back']],
    reading: [['desk', 2, 3, 'any'], ['chair', 1, 3, 'any'], ['bookshelf', 2, 3, 'back'], ['globe', 0, 1, 'any'], ['rug', 1, 1, 'center'], ['scrolls', 2, 3, 'any'], ['telescope', 0, 1, 'any'], ['candles', 1, 2, 'any']],
    rootCave: [['roots', 2, 4, 'back'], ['mushrooms', 2, 4, 'any'], ['moss', 3, 5, 'any'], ['sapling', 1, 2, 'any'], ['glowworms', 1, 3, 'back'], ['sap', 1, 2, 'any']],
    gateHall: [['brazier', 2, 4, 'any'], ['column', 2, 4, 'back'], ['statue', 0, 2, 'back'], ['banner', 1, 2, 'back']],
    antechamber: [['statue', 1, 2, 'back'], ['brazier', 1, 2, 'any'], ['bench', 1, 2, 'any'], ['urn', 1, 2, 'back'], ['candles', 1, 2, 'any']],
};

// ---------------------------------------------------------------- entry
export const FAILS = []; // why attempts were thrown away, for tuning
export const DEBUG = { keep: false, last: null };
export function generateLocation(seed = 1, depth = 1) {
    let last = null;
    for (let attempt = 0; attempt < 40; attempt++) {
        const rng = mulberry32(Math.imul(seed + 1, 2654435761) ^ (attempt * 97531 + depth * 7919));
        try {
            const loc = build(rng, seed, depth);
            loc.attempt = attempt;
            return loc;
        } catch (e) {
            if (!(e instanceof GenFail)) throw e;
            last = e.message;
            FAILS.push(e.message);
        }
    }
    throw new Error(`no location for seed ${seed}: ${last}`);
}

// ---------------------------------------------------------------- the build
function build(rng, seed, depth) {
    const T = Math.min(7, 4 + Math.ceil(depth / 2));
    const W = 64;
    const D = 64;
    const H = TIER_GAP * (T - 1) + 20;
    const w = new World(W, D, H);
    const G = {
        rng, w, W, D, H, depth, seed,
        res: new Uint8Array(W * D * H),
        tiers: [], areas: [], links: [], props: [], lights: [], emitters: [], spawns: [], items: [],
        chests: [], levers: [], gates: [], campfires: [], pedestals: [], signs: [], waterfalls: [], relics: [],
        uid: 1,
    };
    current = G;
    G.free = (x, y, z) => x >= 1 && y >= 1 && z >= 1 && x < W - 1 && y < D - 1 && z < H - 1 && !G.res[w.idx(x, y, z)] && w.get(x, y, z) === B.AIR;
    G.reserve = (x, y, z) => {
        if (w.inside(x, y, z)) G.res[w.idx(x, y, z)] = 1;
    };

    planTiers(G, T);
    landmark(G);
    for (const tier of G.tiers) placeAreas(G, tier);
    for (const tier of G.tiers) connectTier(G, tier);
    for (let i = 0; i + 1 < G.tiers.length; i++) connectTiers(G, G.tiers[i], G.tiers[i + 1]);
    for (const a of G.areas) buildWalls(G, a);
    waterfalls(G);
    objectives(G);
    for (const a of G.areas) furnish(G, a);
    for (const p of G.paths ?? []) decoratePath(G, p);
    populate(G);
    validate(G);
    collectLights(G);

    return {
        seed, depth, world: w, tiers: G.tiers, areas: G.areas, links: G.links,
        start: G.start, gate: G.gate, props: G.props, lights: G.lights, emitters: G.emitters,
        spawns: G.spawns, items: G.items, chests: G.chests, levers: G.levers, gates: G.gates,
        campfires: G.campfires, pedestals: G.pedestals, signs: G.signs, waterfalls: G.waterfalls,
        merchant: G.merchant, landmark: G.landmark, sealCount: 3,
    };
}

// ---------------------------------------------------------------- tiers
function planTiers(G, T) {
    const { rng, depth } = G;
    const top = depth === 1 ? 'village' : pick(rng, OUTDOOR);
    const order = { mine: 1, grotto: 1, roots: 2, fungal: 2, library: 3, crypt: 3, crystal: 4, forge: 4 };
    const under = shuffle(rng, [...UNDERGROUND]).slice(0, T - 2);
    under.sort((a, b) => order[a] + rng() * 2.5 - (order[b] + rng() * 2.5));
    const biomes = [top, ...under, 'sanctum'];
    let cx = ri(rng, 26, 38);
    let cy = ri(rng, 26, 38);
    const z0 = G.H - 10;
    for (let i = 0; i < T; i++) {
        G.tiers.push({ index: i, biome: biomes[i], name: BIOMES[biomes[i]].name, z: z0 - i * TIER_GAP, cx, cy, areas: [] });
        cx = clamp(cx + ri(rng, -9, 9), 22, 42);
        cy = clamp(cy + ri(rng, -9, 9), 22, 42);
    }
}

// ---- the god's sword: a blade driven down through the whole stack
function landmark(G) {
    const { rng, w, H } = G;
    const t0 = G.tiers[0];
    const x = clamp(t0.cx + pick(rng, [-12, 12]), 8, G.W - 9);
    const y = clamp(t0.cy + pick(rng, [-12, 12]), 8, G.D - 9);
    const bottom = G.tiers[G.tiers.length - 1].z - 6;
    const top = H - 3;
    for (let z = bottom; z <= top; z++) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) G.reserve(x + dx, y + dy, z);
    for (let z = bottom; z < top - 5; z++) w.set(x, y, z, B.METAL);
    G.landmark = { kind: 'godsword', x, y, bottom, top };
}

// ---------------------------------------------------------------- places
function footprint(rng, place) {
    const [a, b] = place.size;
    const cells = new Set();
    if (place.shape === 'rect') {
        const W = ri(rng, a, b);
        const D = ri(rng, a, b);
        for (let x = 0; x < W; x++) for (let y = 0; y < D; y++) cells.add(k2(x, y));
        return { w: W, d: D, cells };
    }
    const s = ri(rng, a, b);
    const on = new Uint8Array(s * s);
    const discs = [[s / 2, s / 2, s * 0.36]];
    for (let i = ri(rng, 2, 4); i > 0; i--) discs.push([s * (0.22 + 0.56 * rng()), s * (0.22 + 0.56 * rng()), s * (0.2 + 0.16 * rng())]);
    for (let x = 0; x < s; x++) for (let y = 0; y < s; y++) if (discs.some(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < r)) on[y * s + x] = 1;
    // smooth once, keep the biggest piece, fill holes
    const sm = new Uint8Array(s * s);
    for (let x = 0; x < s; x++) for (let y = 0; y < s; y++) {
        let n = 0;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) n += x + dx >= 0 && y + dy >= 0 && x + dx < s && y + dy < s ? on[(y + dy) * s + x + dx] : 0;
        sm[y * s + x] = n >= 5 ? 1 : 0;
    }
    let best = [];
    const seen = new Uint8Array(s * s);
    for (let i = 0; i < s * s; i++) {
        if (!sm[i] || seen[i]) continue;
        const comp = [i];
        seen[i] = 1;
        for (let j = 0; j < comp.length; j++) {
            const x = comp[j] % s;
            const y = Math.floor(comp[j] / s);
            for (const [dx, dy] of DIRS4) {
                const nx = x + dx;
                const ny = y + dy;
                const k = ny * s + nx;
                if (nx >= 0 && ny >= 0 && nx < s && ny < s && sm[k] && !seen[k]) { seen[k] = 1; comp.push(k); }
            }
        }
        if (comp.length > best.length) best = comp;
    }
    for (const i of best) cells.add(k2(i % s, Math.floor(i / s)));
    // holes: empty cells the outside cannot reach
    const out = new Set();
    const q = [];
    for (let x = -1; x <= s; x++) for (const y of [-1, s]) { q.push([x, y]); out.add(k2(x + 1, y + 1)); }
    for (let y = 0; y < s; y++) for (const x of [-1, s]) { q.push([x, y]); out.add(k2(x + 1, y + 1)); }
    while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of DIRS4) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < -1 || ny < -1 || nx > s || ny > s) continue;
            const k = k2(nx + 1, ny + 1);
            if (out.has(k) || cells.has(k2(nx, ny))) continue;
            out.add(k);
            q.push([nx, ny]);
        }
    }
    for (let x = 0; x < s; x++) for (let y = 0; y < s; y++) if (!out.has(k2(x + 1, y + 1))) cells.add(k2(x, y));
    return { w: s, d: s, cells };
}

function placeAreas(G, tier) {
    const { rng } = G;
    const bio = BIOMES[tier.biome];
    let kinds;
    if (tier.biome === 'sanctum') kinds = ['gateHall', 'antechamber'];
    else {
        const want = ri(rng, 4, 6);
        kinds = [];
        if (tier.index > 0) kinds.push('camp');
        while (kinds.length < want) {
            const k = weighted(rng, bio.places);
            if (k === 'camp' && kinds.includes('camp')) continue;
            kinds.push(k);
        }
    }
    for (const kind of kinds) {
        const place = PLACES[kind];
        for (let tries = 0; tries < 70; tries++) {
            const fp = footprint(rng, place);
            const R = 17 - Math.max(fp.w, fp.d) / 2;
            const ang = rng() * Math.PI * 2;
            const r = Math.sqrt(rng()) * R;
            const ox = Math.round(tier.cx + Math.cos(ang) * r - fp.w / 2);
            const oy = Math.round(tier.cy + Math.sin(ang) * r - fp.d / 2);
            const h = tier.z + (kind === 'gateHall' ? 0 : pick(rng, [0, 0, 0, 1, 2, -1]));
            const wh = place.wallH ? ri(rng, place.wallH[0], place.wallH[1]) : 1;
            const cells = [...fp.cells].map((k) => [ox + (k % 1024), oy + Math.floor(k / 1024)]);
            if (!canPlace(G, cells, h, place.under, Math.max(wh, 3))) continue;
            makeArea(G, tier, kind, cells, h, wh);
            break;
        }
    }
    if (tier.areas.length < (tier.biome === 'sanctum' ? 2 : 3)) fail(`tier ${tier.index} has too few places`);
}

function canPlace(G, cells, h, ud, wh) {
    const set = new Set(cells.map(([x, y]) => k2(x, y)));
    for (const [x, y] of cells) {
        if (x < 3 || y < 3 || x >= G.W - 3 || y >= G.D - 3) return false;
        for (let z = h - 1 - ud; z <= h + wh + 1; z++) if (!G.free(x, y, z)) return false;
        for (const [dx, dy] of DIRS4) {
            if (set.has(k2(x + dx, y + dy))) continue;
            for (let z = h - 2; z <= h + 2; z++) if (!G.free(x + dx, y + dy, z)) return false;
        }
    }
    return true;
}

function makeArea(G, tier, kind, cells, h, wh) {
    const { rng, w } = G;
    const bio = BIOMES[tier.biome];
    const place = PLACES[kind];
    const set = new Set(cells.map(([x, y]) => k2(x, y)));
    const has = (x, y) => set.has(k2(x, y));
    // distance to the edge, for the hanging underside
    const edge = new Map();
    const q = [];
    for (const [x, y] of cells) if (DIRS4.some(([dx, dy]) => !has(x + dx, y + dy))) { edge.set(k2(x, y), 1); q.push([x, y]); }
    for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i];
        const d = edge.get(k2(x, y));
        for (const [dx, dy] of DIRS4) {
            const k = k2(x + dx, y + dy);
            if (has(x + dx, y + dy) && !edge.has(k)) { edge.set(k, d + 1); q.push([x + dx, y + dy]); }
        }
    }
    const walled = ['built', 'rock', 'ruin'].includes(place.walls);
    const wallCells = new Set();
    // blobs: only the rim in the back half gets walls, so a bay in front stays open
    const cx0 = cells.reduce((s, c) => s + c[0], 0) / cells.length;
    const cy0 = cells.reduce((s, c) => s + c[1], 0) / cells.length;
    const backHalf = (x, y) => place.shape === 'rect' || x - cx0 + (y - cy0) < 1;
    if (walled) for (const [x, y] of cells) if ((!has(x - 1, y) || !has(x, y - 1)) && backHalf(x, y)) wallCells.add(k2(x, y));
    // walls along a ragged back can cut off pockets: those become rock too
    if (walled) {
        const inner = cells.filter(([x, y]) => !wallCells.has(k2(x, y)));
        const comp = new Map();
        let best = -1;
        let bestSize = 0;
        for (const [x, y] of inner) {
            if (comp.has(k2(x, y))) continue;
            const id = comp.size + 1;
            const q = [[x, y]];
            comp.set(k2(x, y), id);
            for (let i = 0; i < q.length; i++) {
                for (const [dx, dy] of DIRS4) {
                    const nx = q[i][0] + dx;
                    const ny = q[i][1] + dy;
                    const k = k2(nx, ny);
                    if (has(nx, ny) && !wallCells.has(k) && !comp.has(k)) { comp.set(k, id); q.push([nx, ny]); }
                }
            }
            if (q.length > bestSize) { bestSize = q.length; best = id; }
        }
        for (const [k, id] of comp) if (id !== best) wallCells.add(k);
    }
    const a = {
        id: G.areas.length, tier: tier.index, biome: tier.biome, kind, h, wh, walls: place.walls,
        cells, set, has, edge, wallCells,
        interior: cells.filter(([x, y]) => !wallCells.has(k2(x, y))),
        x0: Math.min(...cells.map((c) => c[0])), y0: Math.min(...cells.map((c) => c[1])),
        x1: Math.max(...cells.map((c) => c[0])), y1: Math.max(...cells.map((c) => c[1])),
        doors: [], doorCells: new Set(), keep: new Set(), used: new Set(), links: new Set(), pools: new Set(),
        floorMat: kind === 'house' || kind === 'storage' ? B.PLANK : kind === 'square' ? B.COBBLE : kind === 'chapel' || kind === 'cryptHall' ? B.TILE : kind === 'reading' || kind === 'stacks' ? B.MARBLE : kind === 'forgeHall' ? B.METAL : kind === 'lavaCave' ? B.BASALT : kind === 'geode' ? B.ROCK : kind === 'gateHall' || kind === 'antechamber' ? B.MARBLE : bio.floor,
    };
    a.cx = (a.x0 + a.x1) / 2;
    a.cy = (a.y0 + a.y1) / 2;
    // floor slab and its hanging underside
    for (const [x, y] of cells) {
        const e = edge.get(k2(x, y));
        let floor = a.floorMat;
        if (place.shape === 'blob' && rng() < 0.18) floor = bio.floor2;
        if (kind === 'garden' && (x + y) % 3 === 0) floor = B.DIRT;
        w.set(x, y, h - 1, floor);
        const depth = clamp(Math.round(1 + e * 0.9 + (rng() - 0.5) * 1.8 + (rng() < 0.07 ? 2 : 0)), 1, PLACES[kind].under);
        for (let d = 1; d <= depth; d++) w.set(x, y, h - 1 - d, d >= depth - 1 && rng() < 0.4 ? bio.under2 : bio.under);
        if (depth >= 3 && rng() < 0.25) G.props.push({ kind: 'stalactites', x, y, z: h - 1 - depth, seed: G.uid++ });
        for (let z = h - 1 - depth; z <= h + Math.max(wh, 3) + 1; z++) G.reserve(x, y, z);
    }
    G.areas.push(a);
    tier.areas.push(a.id);
    return a;
}

// ---------------------------------------------------------------- the router
// Door candidates of a place: a cell on its rim and the outside cell next to it,
// where a path can start at the place's floor level.
function doorCandidates(G, a) {
    const out = [];
    for (const [x, y] of a.cells) {
        const outs = DIRS4.filter(([dx, dy]) => !a.has(x + dx, y + dy));
        if (outs.length !== 1) continue; // no corners
        const [dx, dy] = outs[0];
        const inward = [x - dx, y - dy];
        if (!a.has(...inward) || a.wallCells.has(k2(...inward))) continue;
        const px = x + dx;
        const py = y + dy;
        if (!(G.free(px, py, a.h - 1) && G.free(px, py, a.h) && G.free(px, py, a.h + 1))) continue;
        const back = dx < 0 || dy < 0;
        out.push({ x, y, dx, dy, px, py, h: a.h, cost: back ? 3 : 0 });
    }
    return out;
}

class Heap {
    constructor() { this.f = []; this.v = []; }
    push(f, v) {
        const { f: F, v: V } = this;
        let i = F.length;
        F.push(f);
        V.push(v);
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (F[p] <= F[i]) break;
            [F[p], F[i]] = [F[i], F[p]];
            [V[p], V[i]] = [V[i], V[p]];
            i = p;
        }
    }
    pop() {
        const { f: F, v: V } = this;
        const top = V[0];
        const lf = F.pop();
        const lv = V.pop();
        if (F.length) {
            F[0] = lf;
            V[0] = lv;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let m = i;
                if (l < F.length && F[l] < F[m]) m = l;
                if (r < F.length && F[r] < F[m]) m = r;
                if (m === i) break;
                [F[m], F[i]] = [F[i], F[m]];
                [V[m], V[i]] = [V[i], V[m]];
                i = m;
            }
        }
        return top;
    }
    get size() { return this.f.length; }
}

// A path from place a to place b through free air. Moves: flat, stair down, stair
// up (stairs run straight; turns happen on flat landings), ladder down (toward +x
// or +y, so the pillar stands behind the ladder) and ladder up.
function route(G, a, b, banned = new Set()) {
    const { W, D } = G;
    const starts = doorCandidates(G, a);
    const goals = doorCandidates(G, b);
    if (!starts.length || !goals.length) return null;
    const goalAt = new Map(goals.map((g) => [key3(g.px, g.py, g.h), g]));
    const gx0 = Math.min(...goals.map((g) => g.px));
    const gx1 = Math.max(...goals.map((g) => g.px));
    const gy0 = Math.min(...goals.map((g) => g.py));
    const gy1 = Math.max(...goals.map((g) => g.py));
    const bx0 = Math.max(2, Math.min(a.x0, b.x0) - 12);
    const bx1 = Math.min(W - 3, Math.max(a.x1, b.x1) + 12);
    const by0 = Math.max(2, Math.min(a.y0, b.y0) - 12);
    const by1 = Math.min(D - 3, Math.max(a.y1, b.y1) + 12);
    const s0 = Math.min(a.h, b.h) - 2;
    const s1 = Math.max(a.h, b.h) + 2;
    const free = (x, y, z) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1 && G.free(x, y, z) && !banned.has(key3(x, y, z));
    const sk = (x, y, s, dir, mode) => ((((s * D) + y) * W + x) * 4 + dir) * 2 + mode;
    const heur = (x, y, s) => {
        const dx = x < gx0 ? gx0 - x : x > gx1 ? x - gx1 : 0;
        const dy = y < gy0 ? gy0 - y : y > gy1 ? y - gy1 : 0;
        return Math.max(dx + dy, Math.abs(s - b.h) * 0.6);
    };
    const g = new Map();
    const came = new Map();
    const heap = new Heap();
    for (const st of starts) {
        const k = sk(st.px, st.py, st.h, dirOf(st.dx, st.dy), 0);
        g.set(k, st.cost);
        came.set(k, { prev: null, move: 'start', door: st });
        heap.push(st.cost + heur(st.px, st.py, st.h) * 1.4, k);
    }
    const closed = new Set();
    let expanded = 0;
    while (heap.size) {
        const k = heap.pop();
        if (closed.has(k)) continue;
        closed.add(k);
        if (++expanded > 60000) return null;
        const mode = k & 1;
        const dir = (k >> 1) & 3;
        const rest = Math.floor(k / 8);
        const x = rest % W;
        const y = Math.floor(rest / W) % D;
        const s = Math.floor(rest / (W * D));
        const gk = g.get(k);
        if (mode === 0 && goalAt.has(key3(x, y, s))) return unwind(came, k, goalAt.get(key3(x, y, s)), W, D);
        const push = (nx, ny, ns, nd, nm, cost, move, extra) => {
            if (ns < s0 - 12 || ns > s1 + 12) return;
            const nk = sk(nx, ny, ns, nd, nm);
            const ng = gk + cost;
            if (closed.has(nk) || (g.has(nk) && g.get(nk) <= ng)) return;
            g.set(nk, ng);
            came.set(nk, { prev: k, move, extra });
            heap.push(ng + heur(nx, ny, ns) * 1.4, nk);
        };
        const dirs = mode === 1 ? [dir] : [0, 1, 2, 3];
        for (const di of dirs) {
            const [dx, dy] = DIRS4[di];
            const nx = x + dx;
            const ny = y + dy;
            const turn = di !== dir ? 0.45 : 0;
            if (free(nx, ny, s - 1) && free(nx, ny, s) && free(nx, ny, s + 1)) push(nx, ny, s, di, 0, 1 + turn, 'flat');
            if (s - 1 >= s0 && free(nx, ny, s - 2) && free(nx, ny, s - 1) && free(nx, ny, s) && free(nx, ny, s + 1)) push(nx, ny, s - 1, di, 1, 1.3 + turn, 'down');
            if (s + 1 <= s1 && free(nx, ny, s - 1) && free(nx, ny, s) && free(nx, ny, s + 1) && free(nx, ny, s + 2)) push(nx, ny, s + 1, di, 1, 1.3 + turn, 'up');
            if (mode === 1) continue;
            // ladders need a real drop
            if (di === 0 || di === 2) {
                // down: the pillar grows under this cell, the ladder hangs in the next one
                for (let kk = 3; kk <= 12 && s - kk >= s0; kk++) {
                    const Lb = s - kk;
                    let ok = free(nx, ny, Lb - 1);
                    for (let z = Lb; ok && z <= s + 1; z++) ok = free(nx, ny, z);
                    for (let z = Lb; ok && z <= s - 2; z++) ok = free(x, y, z) || G.w.solid(x, y, z);
                    if (!ok) break;
                    push(nx, ny, Lb, di, 0, 3 + 0.35 * kk, 'ladderDown', kk);
                }
            } else {
                // up: this cell is the ladder, the pillar rises in the next one
                for (let kk = 3; kk <= 12 && s + kk <= s1; kk++) {
                    const Lt = s + kk;
                    let ok = true;
                    for (let z = s + 2; ok && z <= Lt + 1; z++) ok = free(x, y, z);
                    for (let z = s; ok && z <= Lt + 1; z++) ok = free(nx, ny, z);
                    if (!ok) break;
                    push(nx, ny, Lt, di, 0, 3 + 0.35 * kk, 'ladderUp', kk);
                }
            }
        }
    }
    return null;
}
const dirOf = (dx, dy) => DIRS4.findIndex(([a, b]) => a === dx && b === dy);

function unwind(came, k, goal, W, D) {
    const steps = [];
    for (let c = k; c !== null; c = came.get(c).prev) {
        const rest = Math.floor(c / 8);
        const info = came.get(c);
        steps.push({ x: rest % W, y: Math.floor(rest / W) % D, s: Math.floor(rest / (W * D)), dir: (c >> 1) & 3, move: info.move, k: info.extra, door: info.door });
    }
    steps.reverse();
    return { steps, start: steps[0].door, goal };
}

// Solid blocks and air cells a path needs; null if it collides with itself.
function planPath(G, path, style) {
    const P = PATHS[style];
    const solid = new Map();
    const air = new Set();
    const ladders = [];
    let clash;
    const put = (x, y, z, b, shape = 0) => {
        const k = key3(x, y, z);
        const had = solid.get(k);
        if (had && (had[3] !== b || had[4] !== shape)) clash = k;
        solid.set(k, [x, y, z, b, shape]);
    };
    let prev = null;
    for (const st of path.steps) {
        const { x, y, s, move } = st;
        const [dx, dy] = DIRS4[st.dir];
        if (move === 'start' || move === 'flat') {
            put(x, y, s - 1, P.floor);
            air.add(key3(x, y, s)).add(key3(x, y, s + 1));
        } else if (move === 'down') {
            put(x, y, s, P.stair, stairShape(-dx, -dy));
            put(x, y, s - 1, P.support);
            air.add(key3(x, y, s + 1)).add(key3(x, y, s + 2));
        } else if (move === 'up') {
            put(x, y, s - 1, P.stair, stairShape(dx, dy));
            put(x, y, s - 2, P.support);
            air.add(key3(x, y, s)).add(key3(x, y, s + 1));
        } else if (move === 'ladderDown') {
            // prev cell is the top; the pillar under it reaches down to the landing
            for (let z = s; z <= prev.s - 2; z++) put(prev.x, prev.y, z, P.support);
            put(x, y, s - 1, P.floor);
            for (let z = s; z <= prev.s + 1; z++) air.add(key3(x, y, z));
            ladders.push({ x, y, bottom: s, top: prev.s, wall: [-dx, -dy] });
        } else if (move === 'ladderUp') {
            for (let z = prev.s; z <= s - 1; z++) put(x, y, z, P.support);
            for (let z = prev.s; z <= s + 1; z++) air.add(key3(prev.x, prev.y, z));
            air.add(key3(x, y, s)).add(key3(x, y, s + 1));
            ladders.push({ x: prev.x, y: prev.y, bottom: prev.s, top: s, wall: [dx, dy] });
        }
        prev = st;
    }
    if (clash !== undefined) return { clash };
    for (const k of air) if (solid.has(k)) return { clash: k };
    return { solid, air, ladders };
}

function connect(G, a, b, style) {
    const banned = new Set();
    for (let tryNo = 0; tryNo < 3; tryNo++) {
        const path = route(G, a, b, banned);
        if (!path) return false;
        const plan = planPath(G, path, style);
        if (plan.clash !== undefined) { banned.add(plan.clash); continue; }
        const { w } = G;
        for (const [, [x, y, z, blk, shape]] of plan.solid) w.set(x, y, z, blk, shape);
        for (const k of plan.air) G.res[w.idx(k % 1024, Math.floor(k / 1024) % 1024, Math.floor(k / 1048576))] = 1;
        for (const [k] of plan.solid) G.res[w.idx(k % 1024, Math.floor(k / 1024) % 1024, Math.floor(k / 1048576))] = 1;
        for (const l of plan.ladders) w.addLadder(l.x, l.y, l.bottom, l.top, l.wall);
        for (const [area, door] of [[a, path.start], [b, path.goal]]) {
            area.doors.push(door);
            area.doorCells.add(k2(door.x, door.y));
            area.keep.add(k2(door.x, door.y)).add(k2(door.x - door.dx, door.y - door.dy)).add(k2(door.x - 2 * door.dx, door.y - 2 * door.dy));
        }
        a.links.add(b.id);
        b.links.add(a.id);
        G.links.push({ a: a.id, b: b.id, steps: path.steps, style, ladders: plan.ladders });
        (G.paths ??= []).push({ steps: path.steps, style, tier: Math.min(G.areas[a.id].tier, G.areas[b.id].tier) });
        return true;
    }
    return false;
}

const gap = (a, b) => {
    const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
    const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
    return dx + dy;
};

function connectTier(G, tier) {
    const { rng } = G;
    const ids = tier.areas;
    const style = BIOMES[tier.biome].path;
    const areas = ids.map((i) => G.areas[i]);
    // Prim's tree over the gaps between places, then a couple of loops
    const inTree = new Set([ids[0]]);
    const edges = [];
    while (inTree.size < ids.length) {
        let best = null;
        for (const a of areas) if (inTree.has(a.id)) for (const b of areas) if (!inTree.has(b.id)) {
            const d = gap(a, b);
            if (!best || d < best.d) best = { a, b, d };
        }
        inTree.add(best.b.id);
        edges.push([best.a, best.b]);
    }
    for (const a of areas) for (const b of areas) if (a.id < b.id && gap(a, b) < 9 && !edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a)) && rng() < 0.3) edges.push([a, b]);
    const uf = new Map(ids.map((i) => [i, i]));
    const find = (i) => (uf.get(i) === i ? i : find(uf.get(i)));
    for (const [a, b] of edges) {
        if (connect(G, a, b, style)) uf.set(find(a.id), find(b.id));
    }
    // mend: join whatever is still apart
    const pairs = [];
    for (const a of areas) for (const b of areas) if (a.id < b.id) pairs.push([a, b, gap(a, b)]);
    pairs.sort((p, q) => p[2] - q[2]);
    for (const [a, b] of pairs) {
        if (find(a.id) === find(b.id)) continue;
        if (connect(G, a, b, style)) uf.set(find(a.id), find(b.id));
    }
    const roots = new Set(ids.map(find));
    if (roots.size > 1) {
        // drop places nothing reaches rather than fail the whole stack
        const main = [...roots].sort((p, q) => ids.filter((i) => find(i) === q).length - ids.filter((i) => find(i) === p).length)[0];
        for (const i of ids) if (find(i) !== main) G.areas[i].orphan = true;
        tier.areas = ids.filter((i) => find(i) === main);
        if (tier.areas.length < 2) fail(`tier ${tier.index} fell apart`);
        if (tier.biome === 'sanctum' && !tier.areas.some((i) => G.areas[i].kind === 'gateHall')) fail('gate hall cut off');
    }
}

function connectTiers(G, upper, lower) {
    const { rng } = G;
    const style = BIOMES[lower.biome].path;
    const pairs = [];
    for (const i of upper.areas) for (const j of lower.areas) {
        const a = G.areas[i];
        const b = G.areas[j];
        if (lower.biome === 'sanctum' && b.kind === 'gateHall') continue;
        const d = gap(a, b);
        pairs.push([a, b, Math.abs(d - 6) + rng() * 3]);
    }
    pairs.sort((p, q) => p[2] - q[2]);
    let made = 0;
    const want = upper.areas.length >= 4 && lower.biome !== 'sanctum' && rng() < 0.5 ? 2 : 1;
    const usedA = new Set();
    for (const [a, b] of pairs) {
        if (made >= want) break;
        if (usedA.has(a.id) || usedA.has(b.id)) continue;
        if (connect(G, a, b, style)) {
            made++;
            usedA.add(a.id).add(b.id);
        }
    }
    if (!made) fail(`tiers ${upper.index} and ${lower.index} not joined`);
}

// ---------------------------------------------------------------- walls
function buildWalls(G, a) {
    const { rng, w } = G;
    const bio = BIOMES[a.biome];
    const { h } = a;
    const door = (x, y) => a.doorCells.has(k2(x, y));
    // walls stand full height at the back corner and slope down toward the front,
    // the way a cutaway drawing opens a room to the viewer
    const span = Math.max(1, a.x1 - a.x0 + (a.y1 - a.y0));
    const taper = (x, y) => {
        const f = (x - a.x0 + (y - a.y0)) / span;
        return Math.max(1, Math.round(a.wh * (1 - Math.max(0, f - 0.15) * 1.5)));
    };
    let n = 0;
    for (const [x, y] of a.cells) {
        const back = a.wallCells.has(k2(x, y)) && (!a.has(x - 1, y) || !a.has(x, y - 1));
        const front = !back && (!a.has(x + 1, y) || !a.has(x, y + 1) || !a.has(x - 1, y) || !a.has(x, y - 1));
        if (!back && !front) continue;
        const isDoor = door(x, y);
        const wh = taper(x, y);
        n++;
        if (a.walls === 'built') {
            if (back) {
                const mat = a.kind === 'house' ? B.WALLPAPER : a.kind === 'stacks' ? B.BOOKS : a.kind === 'storage' ? B.TIMBER : bio.inner;
                for (let z = h; z < h + wh; z++) {
                    if (isDoor && z < h + 2) continue;
                    const window = !isDoor && wh >= 4 && n % 4 === 2 && (z === h + 1 || z === h + 2) && a.kind !== 'stacks';
                    if (window) { if (z === h + 1) G.props.push({ kind: 'window', x, y, z, face: !a.has(x - 1, y) ? 'x' : 'y', seed: G.uid++ }); continue; }
                    w.set(x, y, z, z === h + wh - 1 ? bio.wall : mat);
                }
                if (isDoor) G.props.push({ kind: 'doorframe', x, y, z: h, face: !a.has(x - 1, y) ? 'x' : 'y', seed: G.uid++ });
            } else if (!isDoor && !a.pools.has(k2(x, y))) w.set(x, y, h, bio.wall === B.TIMBER ? B.PLANK : bio.wall);
        } else if (a.walls === 'rock') {
            if (back) {
                const top = h + clamp(wh + ri(rng, -1, 1), 2, 7);
                for (let z = h; z < top; z++) if (!(isDoor && z < h + 2)) w.set(x, y, z, z === top - 1 && rng() < 0.4 ? bio.under2 === B.CRYSTAL ? B.CRYSTAL : bio.rim : a.biome === 'mine' && rng() < 0.12 ? B.ORE : bio.wall);
            } else if (!isDoor && rng() < 0.4) w.set(x, y, h, bio.rim);
        } else if (a.walls === 'ruin') {
            if (back) {
                const top = h + (isDoor ? 0 : ri(rng, 1, wh));
                for (let z = h; z < top; z++) if (!(isDoor && z < h + 2)) w.set(x, y, z, bio.wall);
            } else if (!isDoor && rng() < 0.25) w.set(x, y, h, bio.wall);
        } else if (a.walls === 'fence') {
            if (!isDoor && (back || front)) a.fence = (a.fence ?? new Set()).add(k2(x, y));
        }
    }
}

// ---------------------------------------------------------------- waterfalls
function waterfalls(G) {
    const { rng, w } = G;
    let made = 0;
    const want = ri(rng, 1, 2);
    const uppers = shuffle(rng, G.areas.filter((a) => !a.orphan && a.tier < G.tiers.length - 2));
    for (const U of uppers) {
        if (made >= want) break;
        const rims = shuffle(rng, U.cells.filter(([x, y]) => !a2(U, x + 1, y) || !a2(U, x, y + 1)));
        for (const [x, y] of rims) {
            if (U.doorCells.has(k2(x, y)) || U.keep.has(k2(x, y))) continue;
            const [dx, dy] = !U.has(x + 1, y) ? [1, 0] : [0, 1];
            if (!U.has(x - dx, y - dy) || U.wallCells.has(k2(x - dx, y - dy))) continue;
            const qx = x + dx;
            const qy = y + dy;
            // look down the column for the floor of a lower place
            const open = (px, py, pz) => G.w.get(px, py, pz) === B.AIR && !G.w.blocked(px, py, pz);
            if (!G.free(qx, qy, U.h) || !G.free(qx, qy, U.h + 1) || !G.free(qx + dy, qy + dx, U.h)) continue;
            let z = U.h - 1;
            while (z > 2 && open(qx, qy, z) && open(qx + dy, qy + dx, z)) z--;
            const L = G.areas.find((a) => !a.orphan && a.tier > U.tier && a.h - 1 === z && a.has(qx, qy) && a.has(qx + dy, qy + dx) && !a.wallCells.has(k2(qx, qy)) && !a.wallCells.has(k2(qx + dy, qy + dx)));
            if (!L || U.h - L.h < 5) continue;
            const pool = [[qx, qy], [qx + dy, qy + dx]];
            if (pool.some(([px, py]) => L.keep.has(k2(px, py)) || L.doorCells.has(k2(px, py)))) continue;
            // a deep pool, two cells of water with rock under it
            for (const [px, py] of pool) {
                w.set(px, py, L.h - 1, B.WATER);
                w.set(px, py, L.h - 2, B.WATER);
                if (!w.solid(px, py, L.h - 3)) w.set(px, py, L.h - 3, B.ROCK);
                L.pools.add(k2(px, py));
                L.used.add(k2(px, py));
            }
            // a shallow channel on the ledge above
            for (const [cx, cy] of [[x, y], [x - dx, y - dy]]) {
                w.set(cx, cy, U.h - 1, B.WATER);
                if (!w.solid(cx, cy, U.h - 2)) w.set(cx, cy, U.h - 2, B.ROCK);
                U.used.add(k2(cx, cy));
                U.keep.add(k2(cx, cy));
                U.pools.add(k2(cx, cy));
            }
            if (w.solid(x, y, U.h)) w.set(x, y, U.h, B.AIR);
            for (let zz = L.h; zz <= U.h + 1; zz++) { G.reserve(qx, qy, zz); G.reserve(qx + dy, qy + dx, zz); }
            G.waterfalls.push({ x: qx, y: qy, dx, dy, top: U.h - 0.15, bottom: L.h - 0.15, from: U.id, to: L.id });
            G.emitters.push({ kind: 'spray', x: qx + 0.5 + dy * 0.5, y: qy + 0.5 + dx * 0.5, z: L.h, r: 1.2, n: 18 });
            made++;
            break;
        }
    }
}
const a2 = (a, x, y) => a.has(x, y);

// ---------------------------------------------------------------- spots
function spots(G, a, where) {
    const out = [];
    for (const [x, y] of a.interior) {
        const k = k2(x, y);
        if (a.used.has(k) || a.keep.has(k)) continue;
        if (where === 'water') { if (a.pools.has(k)) out.push([x, y]); continue; }
        if (a.pools.has(k)) continue;
        if (!G.w.isFlat(x, y, a.h)) continue;
        const backWall = a.wallCells.has(k2(x - 1, y)) || a.wallCells.has(k2(x, y - 1)) || !a.has(x - 1, y) || !a.has(x, y - 1);
        const front = !a.has(x + 1, y) || !a.has(x, y + 1);
        const e = a.edge.get(k);
        if (where === 'back' && !backWall) continue;
        if (where === 'front' && !front) continue;
        if (where === 'center' && e < 3) continue;
        out.push([x, y]);
    }
    return out;
}

// is every door of the place still reachable from every other on its floor?
function doorsJoined(G, a) {
    if (a.doors.length < 1) return true;
    const ok = (x, y) => a.has(x, y) && !a.wallCells.has(k2(x, y)) && !G.w.blocked(x, y, a.h) && !G.w.solid(x, y, a.h) && G.w.get(x, y, a.h - 1) !== B.LAVA;
    const [sx, sy] = [a.doors[0].x - a.doors[0].dx, a.doors[0].y - a.doors[0].dy];
    const seen = new Set([k2(sx, sy)]);
    const q = [[sx, sy]];
    while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of DIRS4) {
            const k = k2(x + dx, y + dy);
            if (!seen.has(k) && ok(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); }
        }
    }
    const inner = a.interior.filter(([x, y]) => ok(x, y) && !a.pools.has(k2(x, y)));
    return a.doors.every((d) => seen.has(k2(d.x - d.dx, d.y - d.dy))) && inner.every(([x, y]) => seen.has(k2(x, y)) || a.pools.has(k2(x, y)));
}

function prop(G, a, kind, x, y, extra = {}) {
    const info = PROPS[kind] ?? { h: 0 };
    const p = { kind, x, y, z: a ? a.h : extra.z, seed: G.uid++, rot: extra.rot ?? Math.floor(G.rng() * 4), ...extra };
    if (a && info.h > 0) {
        G.w.block(x, y, a.h, info.h);
        if (!doorsJoined(G, a)) {
            G.w.unblock(x, y, a.h, info.h);
            return null;
        }
    }
    if (a) a.used.add(k2(x, y));
    // wall props face away from the wall behind them
    if (info.wall && a) p.face = a.wallCells.has(k2(x - 1, y)) || !a.has(x - 1, y) ? 'x' : 'y';
    G.props.push(p);
    return p;
}

// ---------------------------------------------------------------- objectives
function objectives(G) {
    const { rng, w } = G;
    // vaults are shut behind their gates: nothing else goes in them
    const areas = (t) => G.tiers[t].areas.map((i) => G.areas[i]).filter((a) => !a.vault);
    const T = G.tiers.length;
    // a free cell with a walkable neighbour kept clear, so whatever stands there stays in reach
    const takeSpot = (a, where = 'any', height = 0) => {
        for (const wh of [where, 'any']) {
            const s = shuffle(rng, spots(G, a, wh));
            for (const c of s.slice(0, 16)) {
                const k = k2(...c);
                if (height) {
                    w.block(c[0], c[1], a.h, height);
                    if (!doorsJoined(G, a)) { w.unblock(c[0], c[1], a.h, height); continue; }
                }
                const side = DIRS4.map(([dx, dy]) => [c[0] + dx, c[1] + dy]).find(([x, y]) => a.interior.some(([ix, iy]) => ix === x && iy === y) && !a.used.has(k2(x, y)) && !a.pools.has(k2(x, y)) && w.isFlat(x, y, a.h));
                if (!side) { if (height) w.unblock(c[0], c[1], a.h, height); continue; }
                a.used.add(k);
                a.keep.add(k2(...side));
                return c;
            }
        }
        return null;
    };

    // start: the top tier, the place with most room
    const top = areas(0).sort((p, q) => q.interior.length - p.interior.length);
    const sa = top.find((a) => a.kind === 'meadow' || a.kind === 'square') ?? top[0];
    const sc = takeSpot(sa, 'center') ?? takeSpot(sa);
    G.start = { x: sc[0], y: sc[1], h: sa.h, rise: null };
    G.startArea = sa.id;
    const sign = takeSpot(sa, 'any');
    if (sign) G.signs.push({ x: sign[0], y: sign[1], z: sa.h, text: `Ярус 1 — ${G.tiers[0].name}. Внизу, под ${T - 1} ярусами, стоят Врата. Им нужны три Печати.`, id: G.uid++ });

    // campfires, one per tier (the top one next to the start)
    for (let t = 0; t < T - 1; t++) {
        const list = areas(t);
        const a = t === 0 ? sa : list.find((x) => x.kind === 'camp') ?? list.sort((p, q) => q.interior.length - p.interior.length)[0];
        const c = takeSpot(a, 'center') ?? takeSpot(a);
        if (!c) fail('no campfire spot');
        const cf = { id: G.uid++, x: c[0], y: c[1], z: a.h, tier: t, area: a.id, note: NOTES[ri(rng, 0, NOTES.length - 1)].replace('{n}', pick(rng, WANDERERS)) };
        G.campfires.push(cf);
        G.props.push({ kind: 'campfire', x: c[0], y: c[1], z: a.h, seed: G.uid++, fire: cf.id });
    }
    // the merchant sits by one of the middle fires
    const mt = ri(rng, 1, Math.max(1, T - 2));
    const mfire = G.campfires.find((c) => c.tier === mt) ?? G.campfires[1] ?? G.campfires[0];
    const ma = G.areas[mfire.area];
    const mc = takeSpot(ma, 'any');
    if (mc) G.merchant = { x: mc[0], y: mc[1], z: ma.h, tier: ma.tier, id: G.uid++ };

    // the Gates at the back of the gate hall
    const gh = areas(T - 1).find((a) => a.kind === 'gateHall');
    const backRow = gh.interior.filter(([x, y]) => gh.wallCells.has(k2(x - 1, y)) && [-1, 0, 1].every((d) => gh.has(x, y + d) && !gh.keep.has(k2(x, y + d)) && !gh.doorCells.has(k2(x - 1, y + d)) && !gh.wallCells.has(k2(x, y + d))) && !gh.keep.has(k2(x + 1, y)));
    if (!backRow.length) fail('no room for the Gates');
    const mid = backRow.sort((p, q) => Math.abs(p[1] - gh.cy) - Math.abs(q[1] - gh.cy))[0] ?? gh.interior[0];
    G.gate = { x: mid[0], y: mid[1], z: gh.h, area: gh.id, face: 'x', node: { x: mid[0] + 1, y: mid[1], h: gh.h, rise: null } };
    gh.used.add(k2(mid[0], mid[1]));
    gh.keep.add(k2(mid[0] + 1, mid[1])).add(k2(mid[0] + 2, mid[1]));
    w.block(mid[0], mid[1], gh.h, 3, [0, 0, 0, 1, 1, 1]);
    for (const [dx, dy] of [[0, -1], [0, 1]]) if (gh.has(mid[0] + dx, mid[1] + dy)) { gh.used.add(k2(mid[0] + dx, mid[1] + dy)); w.block(mid[0] + dx, mid[1] + dy, gh.h, 3); }
    const gc = spots(G, gh, 'center');
    const gs = gc.length ? pick(rng, gc) : takeSpot(gh);
    G.spawns.push({ kind: 'guardian', x: gs[0], y: gs[1], h: gh.h, tier: T - 1, area: gh.id, elite: true });
    gh.used.add(k2(gs[0], gs[1]));
    const fr = takeSpot(gh, 'back', 1);
    if (fr) G.pedestals.push({ id: G.uid++, x: fr[0], y: fr[1], z: gh.h, relic: 'firstring' });

    // three Seals across the middle tiers
    const mids = [];
    for (let t = 1; t < T - 1; t++) mids.push(t);
    while (mids.length < 3) mids.push(mids[mids.length - 1] ?? 1);
    const sealTiers = shuffle(rng, [...mids]).slice(0, 3).sort((p, q) => p - q);
    const kinds = shuffle(rng, ['chest', 'elite', 'vault']);
    // the vault goes first, so later keys and levers keep out of it
    const vi = kinds.indexOf('vault');
    const order = [vi, ...[0, 1, 2].filter((i) => i !== vi)];
    G.seals = [];
    for (const s of order) {
        const t = sealTiers[s];
        let kind = kinds[s];
        const list = areas(t).filter((a) => a.kind !== 'camp');
        if (kind === 'vault') {
            const leaves = list.filter((a) => a.doors.length === 1 && !G.campfires.some((c) => c.area === a.id) && a.walls !== 'none' && a.walls !== 'fence');
            if (!leaves.length) kind = 'chest';
            else {
                const v = pick(rng, leaves);
                v.vault = true;
                const d = v.doors[0];
                G.gates.push({ id: G.uid++, x: d.x, y: d.y, z: v.h, face: d.dx !== 0 ? 'x' : 'y', open: false, tier: t, area: v.id });
                w.block(d.x, d.y, v.h, 2, d.dx !== 0 ? [0.35, 0, 0, 0.65, 1, 1] : [0, 0.35, 0, 1, 0.65, 1]);
                const c = takeSpot(v, 'back', 1);
                if (!c) fail('no vault pedestal');
                G.pedestals.push({ id: G.uid++, x: c[0], y: c[1], z: v.h, seal: true, vault: v.id });
                G.seals.push({ kind, tier: t, area: v.id });
                // levers elsewhere on this tier and the one above
                const leverAreas = shuffle(rng, [...list.filter((a) => a !== v), ...(t > 0 ? areas(t - 1) : [])]).slice(0, 2);
                if (leverAreas.length < 2) leverAreas.push(G.areas[G.campfires.find((cf) => cf.tier === t)?.area ?? list[0].id]);
                for (const la of leverAreas) {
                    const lc = takeSpot(la, 'back', 1);
                    if (!lc) fail('no lever spot');
                    G.levers.push({ id: G.uid++, x: lc[0], y: lc[1], z: la.h, gate: G.gates[G.gates.length - 1].id, on: false, face: la.wallCells.has(k2(lc[0] - 1, lc[1])) || !la.has(lc[0] - 1, lc[1]) ? 'x' : 'y' });
                }
                continue;
            }
        }
        if (kind === 'chest') {
            const a = pick(rng, list);
            const c = takeSpot(a, 'back', 1);
            if (!c) fail('no seal chest spot');
            G.chests.push({ id: G.uid++, x: c[0], y: c[1], z: a.h, locked: true, loot: ['seal'], big: true });
            // the key lies somewhere above, or on this tier
            const ka = pick(rng, [...list.filter((x) => x !== a), ...areas(Math.max(0, t - 1))]);
            const kc = takeSpot(ka);
            if (!kc) fail('no key spot');
            G.items.push({ kind: 'key', x: kc[0], y: kc[1], h: ka.h, id: G.uid++ });
            G.seals.push({ kind, tier: t, area: a.id });
        } else if (kind === 'elite') {
            const a = list.sort((p, q) => q.interior.length - p.interior.length)[0];
            const c = takeSpot(a, 'center') ?? takeSpot(a);
            const e = BIOMES[G.tiers[t].biome].elite ?? { kind: 'skeleton', name: 'Хранитель Печати' };
            G.spawns.push({ kind: e.kind, x: c[0], y: c[1], h: a.h, tier: t, area: a.id, elite: true, name: e.name, carry: ['seal'] });
            G.seals.push({ kind, tier: t, area: a.id });
        }
    }

    // a relic in each tier, on a pedestal
    for (let t = 0; t < T - 1; t++) {
        const bio = BIOMES[G.tiers[t].biome];
        const list = areas(t);
        const a = pick(rng, list);
        const c = takeSpot(a, 'back', 1);
        if (!c) continue;
        G.pedestals.push({ id: G.uid++, x: c[0], y: c[1], z: a.h, relic: pick(rng, bio.relics) });
    }

    // ordinary chests
    for (let t = 0; t < T - 1; t++) {
        for (let i = ri(rng, 1, 3); i > 0; i--) {
            const a = pick(rng, areas(t));
            const c = takeSpot(a, 'back', 1);
            if (!c) continue;
            const loot = ['coin', 'coin', 'coin'];
            const roll = rng();
            if (roll < 0.35) loot.push('potion');
            else if (roll < 0.6) loot.push('gem');
            else if (roll < 0.7) loot.push('food', 'food');
            if (rng() < 0.12) loot.push(rng() < 0.5 ? 'heart' : 'sword');
            const locked = rng() < 0.2;
            G.chests.push({ id: G.uid++, x: c[0], y: c[1], z: a.h, locked, loot: locked ? [...loot, 'gem', 'gem'] : loot });
            if (locked) {
                const ka = pick(rng, areas(t));
                const kc = takeSpot(ka);
                if (kc) G.items.push({ kind: 'key', x: kc[0], y: kc[1], h: ka.h, id: G.uid++ });
            }
        }
    }
}

// ---------------------------------------------------------------- furnishing
function furnish(G, a) {
    const { rng, w } = G;
    const bio = BIOMES[a.biome];
    const K = a.kind;
    // place-specific features first
    if (K === 'pool') {
        const cells = shuffle(rng, spots(G, a, 'center'));
        for (const [x, y] of cells.slice(0, ri(rng, 1, 2))) {
            const blob = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1], [x - 1, y]].filter(([px, py]) => a.interior.some(([ix, iy]) => ix === px && iy === py) && !a.used.has(k2(px, py)) && !a.keep.has(k2(px, py)));
            for (const [px, py] of blob) {
                const deep = rng() < 0.5;
                w.set(px, py, a.h - 1, B.WATER);
                if (deep) w.set(px, py, a.h - 2, B.WATER);
                if (!w.solid(px, py, a.h - 2 - (deep ? 1 : 0))) w.set(px, py, a.h - 2 - (deep ? 1 : 0), B.ROCK);
                a.pools.add(k2(px, py));
            }
            if (!doorsJoined(G, a)) for (const [px, py] of blob) { w.set(px, py, a.h - 1, a.floorMat); w.set(px, py, a.h - 2, bio.under); a.pools.delete(k2(px, py)); }
        }
    }
    if (K === 'lavaCave' || K === 'forgeHall') {
        const cells = shuffle(rng, spots(G, a, K === 'forgeHall' ? 'center' : 'any'));
        let n = 0;
        for (const [x, y] of cells) {
            if (n >= (K === 'forgeHall' ? 3 : 5)) break;
            w.set(x, y, a.h - 1, B.LAVA);
            if (!w.solid(x, y, a.h - 2)) w.set(x, y, a.h - 2, B.BASALT);
            a.pools.add(k2(x, y));
            a.used.add(k2(x, y));
            if (!doorsJoined(G, a)) { w.set(x, y, a.h - 1, a.floorMat); a.pools.delete(k2(x, y)); a.used.delete(k2(x, y)); continue; }
            n++;
        }
        if (n) G.lights.push({ x: a.cx + 0.5, y: a.cy + 0.5, z: a.h + 1.2, color: 0xff7a2a, intensity: 1.2, range: 8, flicker: 0.3 });
    }
    if (K === 'stacks') {
        // rows of shelves, two blocks high, with aisles
        for (const [x, y] of spots(G, a, 'any')) {
            if ((y - a.y0) % 3 !== 1 || (x - a.x0) % 5 === 0) continue;
            w.set(x, y, a.h, B.BOOKS);
            w.set(x, y, a.h + 1, B.BOOKS);
            if (!doorsJoined(G, a)) { w.set(x, y, a.h, B.AIR); w.set(x, y, a.h + 1, B.AIR); continue; }
            a.used.add(k2(x, y));
        }
    }
    if (K === 'rootCave') {
        for (const [x, y] of shuffle(rng, spots(G, a, 'any')).slice(0, 3)) {
            for (let z = a.h; z < a.h + 5; z++) w.set(x, y, z, B.BARK);
            if (!doorsJoined(G, a)) { for (let z = a.h; z < a.h + 5; z++) w.set(x, y, z, B.AIR); continue; }
            a.used.add(k2(x, y));
            G.props.push({ kind: 'roots', x, y, z: a.h + 4, seed: G.uid++, face: 'x' });
        }
    }
    if (K === 'geode') {
        for (const [x, y] of a.cells) if (a.wallCells.has(k2(x, y)) && rng() < 0.3) for (let z = a.h; z < a.h + 3; z++) if (w.get(x, y, z) !== B.AIR) w.set(x, y, z, B.CRYSTAL);
    }
    if (K === 'gallery') {
        const row = spots(G, a, 'center');
        if (row.length) {
            const [, ry] = pick(rng, row);
            for (const [x, y] of a.interior) if (y === ry && !a.pools.has(k2(x, y))) G.props.push({ kind: 'rail', x, y, z: a.h, seed: G.uid++, rot: 0 });
        }
    }
    if (a.fence) for (const k of a.fence) if (!a.used.has(k) && !a.keep.has(k)) prop(G, a, 'fence', k % 1024, Math.floor(k / 1024), { rot: 0 });
    for (const [kind, lo, hi, where] of FURNISH[K] ?? []) {
        const n = ri(rng, lo, hi);
        for (let i = 0; i < n; i++) {
            const s = spots(G, a, where);
            if (!s.length) break;
            const [x, y] = pick(rng, s);
            prop(G, a, kind, x, y, where === 'water' ? { z: a.h - 0.15 } : {});
        }
    }
    // outdoor tiers: bushes and flowers along the open rims
    if (BIOMES[a.biome].outdoor && a.walls === 'none') {
        for (const [x, y] of a.cells) {
            if (a.keep.has(k2(x, y)) || a.used.has(k2(x, y)) || !(!a.has(x + 1, y) || !a.has(x, y + 1)) || rng() > 0.12) continue;
            prop(G, a, rng() < 0.5 ? 'bush' : 'flowers', x, y);
        }
    }
    // emitters over the place
    for (const kind of bio.emitters) G.emitters.push({ kind, x: a.cx + 0.5, y: a.cy + 0.5, z: a.h + 1.5, r: Math.max(a.x1 - a.x0, a.y1 - a.y0) / 2 + 1, n: Math.round(a.interior.length / 6) });
}

// railings, lamps and supports along the paths between places
function decoratePath(G, p) {
    const { rng, w } = G;
    const P = PATHS[p.style];
    let flat = 0;
    for (let i = 0; i < p.steps.length; i++) {
        const st = p.steps[i];
        if (st.move !== 'flat' && st.move !== 'start') { flat = 0; continue; }
        flat++;
        const { x, y, s } = st;
        // hanging support under bridges
        if (!w.solid(x, y, s - 2) && G.free(x, y, s - 2) && (x + y) % 3 === 0) {
            if (P.support === B.ROCK || P.support === B.BARK) {
                w.set(x, y, s - 2, P.support);
                G.reserve(x, y, s - 2);
                if (G.free(x, y, s - 3) && rng() < 0.5) { w.set(x, y, s - 3, P.support); G.reserve(x, y, s - 3); }
            } else G.props.push({ kind: P.support === B.TIMBER ? 'beam' : 'arch', x, y, z: s - 1, seed: G.uid++, rot: st.dir });
        }
        // railings on open sides, as thin blockers in the air beside the path
        if (P.rail && i > 0 && i < p.steps.length - 1) {
            for (const [dx, dy] of [[1, 0], [0, 1]]) {
                const nx = x + dx;
                const ny = y + dy;
                if (!G.free(nx, ny, s) || !G.free(nx, ny, s + 1) || w.solid(nx, ny, s - 1)) continue;
                const box = dx ? [0, 0.1, 0, 0.14, 0.9, 0.9] : [0.1, 0, 0, 0.9, 0.14, 0.9];
                w.block(nx, ny, s, 1, box);
                G.reserve(nx, ny, s);
                G.props.push({ kind: 'railing', x: nx, y: ny, z: s, seed: G.uid++, face: dx ? 'x' : 'y', style: P.rail, lamp: flat % 7 === 3 && P.lamp === 'lantern' });
            }
        }
        if (P.lamp && P.lamp !== 'lantern' && flat % 8 === 4) {
            // a lamp on a post standing in the air beside the path
            for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
                const nx = x + dx;
                const ny = y + dy;
                if (!G.free(nx, ny, s) || !G.free(nx, ny, s + 1) || !G.free(nx, ny, s - 1)) continue;
                w.set(nx, ny, s - 1, P.support);
                G.reserve(nx, ny, s - 1);
                G.reserve(nx, ny, s);
                G.reserve(nx, ny, s + 1);
                w.block(nx, ny, s, 2);
                const kind = { torch: 'torchpost', glowworm: 'glowpost', brazier: 'brazier', sap: 'sappost', candle: 'candlepost', crystal: 'crystalpost' }[P.lamp] ?? 'torchpost';
                G.props.push({ kind, x: nx, y: ny, z: s, seed: G.uid++ });
                break;
            }
        }
    }
}

// ---------------------------------------------------------------- creatures and loot
function populate(G) {
    const { rng } = G;
    for (const a of G.areas) {
        if (a.orphan) continue;
        const bio = BIOMES[a.biome];
        const safe = G.campfires.some((c) => c.area === a.id) || a.id === G.startArea;
        let n = Math.round(a.interior.length / 20 * (1 + 0.15 * (G.depth - 1)));
        if (safe) n = Math.min(n, 1);
        for (let i = 0; i < n; i++) {
            let kind = weighted(rng, bio.creatures);
            if (safe && !['timid', 'peaceful'].includes(KINDS[kind].temper)) kind = bio.creatures.find(([k]) => ['timid', 'peaceful'].includes(KINDS[k].temper))?.[0];
            if (!kind) continue;
            const s = spots(G, a, 'any');
            if (!s.length) break;
            const [x, y] = pick(rng, s);
            a.used.add(k2(x, y));
            G.spawns.push({ kind, x, y, h: a.h, tier: a.tier, area: a.id, carry: rng() < 0.1 ? ['key'] : [] });
        }
        // a few coins lying about
        for (let i = ri(rng, 0, 2); i > 0; i--) {
            const s = spots(G, a, 'any');
            if (!s.length) break;
            const [x, y] = pick(rng, s);
            a.used.add(k2(x, y));
            G.items.push({ kind: rng() < 0.15 ? 'food' : 'coin', x, y, h: a.h, id: G.uid++ });
        }
    }
}

// ---------------------------------------------------------------- checks
function validate(G) {
    const { w } = G;
    const opts = { drops: true, swim: true, hop: true };
    // one sweep from the start, remembering every edge for the way back
    const seen = new Map([[nodeKey(G.start), G.start]]);
    const back = new Map();
    const order = [G.start];
    for (let i = 0; i < order.length; i++) {
        const n = order[i];
        const kn = nodeKey(n);
        for (const m of w.neighbors(n, opts)) {
            const km = nodeKey(m);
            if (!back.has(km)) back.set(km, []);
            back.get(km).push(kn);
            if (!seen.has(km)) { seen.set(km, m); order.push(m); }
        }
    }
    const home = new Set([nodeKey(G.start)]);
    const q = [nodeKey(G.start)];
    while (q.length) for (const k of back.get(q.pop()) ?? []) if (!home.has(k)) { home.add(k); q.push(k); }
    const at = (x, y, h) => {
        // something standing in a cell is reached from any walkable cell next to it
        for (const [dx, dy] of [[0, 0], ...DIRS4]) {
            const n = w.node(x + dx, y + dy, h);
            if (n && seen.has(nodeKey(n)) && home.has(nodeKey(n))) return true;
        }
        return false;
    };
    const must = [
        ...G.campfires.map((c) => ['campfire', c.x, c.y, c.z]),
        ...G.levers.map((l) => ['lever', l.x, l.y, l.z]),
        ...G.items.filter((i) => i.kind === 'key').map((i) => ['key', i.x, i.y, i.h]),
        ...G.chests.filter((c) => c.loot.includes('seal')).map((c) => ['seal chest', c.x, c.y, c.z]),
        ...G.spawns.filter((s) => s.elite).map((s) => [s.kind, s.x, s.y, s.h]),
        ['gate', G.gate.node.x, G.gate.node.y, G.gate.node.h],
    ];
    for (const [what, x, y, h] of must) {
        if (at(x, y, h)) continue;
        const near = [[0, 0], ...DIRS4].map(([dx, dy]) => w.node(x + dx, y + dy, h)).filter(Boolean);
        const fwd = near.some((n) => seen.has(nodeKey(n)));
        const area = G.areas.find((a) => a.h === h && a.has(x, y));
        fail(`${what} unreachable (${near.length ? (fwd ? 'no way back' : 'not reached') : 'no node'}, area ${area?.kind} t${area?.tier}${area?.orphan ? ' orphan' : ''})`);
    }
    // with the vault gates open their seals must be reachable too
    for (const g of G.gates) {
        w.unblock(g.x, g.y, g.z, 2);
        const p = G.pedestals.find((pp) => pp.seal && G.areas[g.area].has(pp.x, pp.y));
        const n = w.node(g.x, g.y, g.z);
        const inside = p && [[0, 0], ...DIRS4].some(([dx, dy]) => w.node(p.x + dx, p.y + dy, p.z));
        w.block(g.x, g.y, g.z, 2, g.face === 'x' ? [0.35, 0, 0, 0.65, 1, 1] : [0, 0.35, 0, 1, 0.65, 1]);
        if (!n || !inside) fail('vault closed off');
    }
    G.reach = seen.size;
}

function collectLights(G) {
    for (const p of G.props) {
        const info = PROPS[p.kind];
        if (info?.light) G.lights.push({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + (info.h > 1 ? 1.8 : 0.9), ...info.light });
        if (p.kind === 'railing' && p.lamp) G.lights.push({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 1.2, ...PROPS.lantern.light });
        if (['torchpost', 'glowpost', 'sappost', 'candlepost', 'crystalpost'].includes(p.kind)) {
            const c = { torchpost: 0xff9a3a, glowpost: 0x9fffd0, sappost: 0xa8ff6a, candlepost: 0xffb85a, crystalpost: 0x7fe8ff }[p.kind];
            G.lights.push({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 1.6, color: c, intensity: 1, range: 6, flicker: p.kind === 'torchpost' ? 0.5 : 0.15 });
        }
    }
    for (const g of G.gates) G.lights.push({ x: g.x + 0.5, y: g.y + 0.5, z: g.z + 2.2, color: 0x9ab8ff, intensity: 0.5, range: 4, flicker: 0 });
    for (const p of G.pedestals) G.lights.push({ x: p.x + 0.5, y: p.y + 0.5, z: p.z + 1.6, color: p.seal ? 0x7ff0e2 : 0xffe08a, intensity: 0.8, range: 4.5, flicker: 0.1 });
    G.lights.push({ x: G.gate.x + 1.5, y: G.gate.y + 0.5, z: G.gate.z + 2.5, color: 0x9a7bff, intensity: 1.4, range: 9, flicker: 0.1 });
}

export { sameNode };
