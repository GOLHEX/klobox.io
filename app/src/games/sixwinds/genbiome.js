// Six Winds biome generator: the land painted in the world document.
// Region elevations are blended into a height field, roughened by noise in the
// biome's own manner (desert mesas step in terraces, snow rises in ridges, the
// swamp sinks into pools), and covered with the biome's ground and its plants.
// Small places (villages, camps, ruins, shrines, docks) are stamped on top, and
// each new island gets its creatures, its elder with a couple of errands, and a
// berth for the ship.

import { M, MAT, key3 } from './world.js';
import { DIRS, center, hexAt, dist, disk, ring, noise2, mulberry32, LAYER } from './hex.js';
import { BIOMES, BIOME_IDS, ELEV, POI_KINDS, regionAt, regionCenter, getRegion } from './worlddoc.js';

const pick = (rng, a) => a[Math.floor(rng() * a.length)];
const NEIGHBOR_REGIONS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

// ---------------------------------------------------------------- height and ground
export function terrain(b, doc, isl, SEA) {
    const w = b.w;
    const R = doc.R;
    const seed = doc.seed ?? 7;
    const warp = noise2(seed * 3 + 1);
    const nA = noise2(seed * 5 + 7);
    const nB = noise2(seed * 11 + 3);
    const nC = noise2(seed * 17 + 9);
    const rng = mulberry32(seed * 101 + 13);
    const field = { biome: new Uint8Array(w.W * w.D), land: new Uint8Array(w.W * w.D), region: new Array(w.W * w.D) };
    const tpl = Object.values(isl);
    for (const [q, r, x, y] of b.columns()) {
        const col = q + (r - (r & 1)) / 2;
        const fi = r * w.W + col;
        // the biome: the region under a slightly wandering point, so borders meander
        const wx = x + (warp(x * 0.09, y * 0.09) - 0.5) * 5;
        const wy = y + (warp(x * 0.09 + 17, y * 0.09) - 0.5) * 5;
        const [hq, hr] = hexAt(wx, wy);
        const [ra, rb] = regionAt(R, hq, hr);
        const reg = getRegion(doc, ra, rb);
        const biome = BIOMES[reg.biome] ? reg.biome : 'sea';
        const B = BIOMES[biome];
        field.biome[fi] = BIOME_IDS.indexOf(biome);
        field.region[fi] = reg;
        // the height: region levels blended by distance to their centres
        const [cq, cr] = regionAt(R, q, r);
        let sum = 0;
        let wsum = 0;
        for (const [da, db] of NEIGHBOR_REGIONS) {
            const [rq, rr] = regionCenter(R, cq + da, cr + db);
            const [rx, ry] = center(rq, rr);
            const d = Math.hypot(x - rx, y - ry);
            const k = Math.max(0, 1 - d / (R * 1.9 + 1));
            if (k <= 0) continue;
            const g = getRegion(doc, cq + da, cr + db);
            sum += ELEV[g.elev ?? 0].level * k * k;
            wsum += k * k;
        }
        let H = SEA + (wsum > 0 ? sum / wsum : ELEV[0].level);
        // the story islands sit on shelves of their own
        let inTpl = false;
        for (const I of tpl) {
            const d = Math.hypot(x - I.x, y - I.y) - I.r;
            if (d < 2) inTpl = true;
            H = Math.max(H, SEA - 2 - Math.max(0, d) * 0.22 + (nA(x * 0.08, y * 0.08) - 0.5) * 2);
        }
        const land = !inTpl && H > SEA - 0.4;
        if (land) {
            // the biome's own roughness
            H += (nA(x * 0.06, y * 0.06) - 0.5) * 2 * B.rough + (nB(x * 0.19, y * 0.19) - 0.5) * B.rough * 0.7;
            if (B.ridge) H += Math.pow(1 - Math.abs(nC(x * 0.08, y * 0.08) * 2 - 1), 2) * B.rough * 2.2 * Math.max(0, Math.min(1, (H - SEA - 3) / 6));
        }
        if (!land || H < SEA - 0.3) {
            // sea floor
            const floor = Math.round(Math.max(1, Math.min(SEA - 1, inTpl ? Math.min(H, SEA - 2) : H)));
            for (let z = 0; z < floor; z++) w.set(q, r, z, z === floor - 1 ? (floor >= SEA - 3 ? M.SAND : M.SEABED) : M.ROCK);
            for (let z = floor; z < SEA; z++) w.set(q, r, z, M.WATER);
            continue;
        }
        let s = Math.round(H);
        if (s <= SEA) s = SEA + 1;
        // desert mesas: terraces with sheer walls
        if (B.mesa && s > SEA + 2) s = SEA + 2 + Math.floor((s - SEA - 2) / B.mesa) * B.mesa + (nB(x * 0.3, y * 0.3) > 0.8 ? 1 : 0);
        // swamp pools at sea level
        if (B.pools && s <= SEA + 2 && nC(x * 0.14, y * 0.14) < B.pools) {
            for (let z = 0; z < SEA - 1; z++) w.set(q, r, z, z === SEA - 2 ? M.MUD : M.ROCK);
            w.set(q, r, SEA - 1, M.WATER);
            field.land[fi] = 2;
            continue;
        }
        let top = s <= SEA + 1 && B.beach ? B.beach : B.top;
        if (biome === 'snow' && s <= SEA + 2) top = M.SNOW;
        if (biome === 'meadow' && s > SEA + 11) top = M.ROCK;
        if (biome === 'jungle' && s <= SEA + 1) top = M.SAND;
        if ((biome === 'desert' || biome === 'ruins') && nC(x * 0.21 + 40, y * 0.21) > (biome === 'ruins' ? 0.58 : 0.74)) top = M.SLAB;
        if (biome === 'swamp' && nB(x * 0.25 + 9, y * 0.25) > 0.6) top = M.MOSS;
        if (biome === 'volcanic' && nB(x * 0.22, y * 0.22) > 0.72) top = M.BASALT;
        b.ground(q, r, s, top, B.under, B.deep);
        // alternate the strata in the cliffs: every other layer from the deep stone
        if (B.under !== B.deep) for (let z = 0; z < s - 1; z++) if (z % 3 === 2) w.set(q, r, z, B.deep);
        // rock spires in the desert, lava in the ash
        if (B.spires && s > SEA + 1 && rng() < B.spires) {
            const hgt = 4 + Math.floor(rng() * 8);
            for (let z = s; z < Math.min(w.H - 2, s + hgt); z++) w.set(q, r, z, (z - s) % 3 === 2 ? M.REDROCK : M.SANDSTONE);
            w.set(q, r, Math.min(w.H - 2, s + hgt) - 1, M.SAND);
        }
        if (B.lava && s > SEA + 2 && nC(x * 0.3, y * 0.3) > 1 - B.lava * 3) { w.set(q, r, s - 1, M.LAVA); w.set(q, r, s - 2, M.BASALT); }
        field.land[fi] = 1;
    }
    // stairs up the mesa walls, a few per cliff
    const srng = mulberry32(seed * 43 + 7);
    for (const [q, r] of b.columns()) {
        const col = q + (r - (r & 1)) / 2;
        const B = BIOMES[BIOME_IDS[field.biome[r * w.W + col]]];
        if (!B?.mesa || !field.land[r * w.W + col]) continue;
        const s = w.surface(q, r);
        for (let i = 0; i < 6; i++) {
            const nq = q + DIRS[i][0];
            const nr = r + DIRS[i][1];
            const ns = w.surface(nq, nr);
            if (s - ns < 3 || ns <= SEA || srng() > 0.09) continue;
            // walk out from the wall and rise back toward it
            const steps = s - ns - 1;
            const sq = q + DIRS[i][0] * (steps + 1);
            const sr = r + DIRS[i][1] * (steps + 1);
            let ok = true;
            for (let k = 1; k <= steps + 1; k++) { const cq = q + DIRS[i][0] * k; const cr = r + DIRS[i][1] * k; if (Math.abs(w.surface(cq, cr) - ns) > 1 || w.surface(cq, cr) <= SEA) ok = false; }
            if (!ok) continue;
            b.stairs(sq, sr, (i + 3) % 6, ns, s - 1, M.SANDSTONE, 6);
            break;
        }
    }
    return field;
}

// ---------------------------------------------------------------- the new islands
export function landIslands(b, doc, field, isl, SEA) {
    const w = b.w;
    const seen = new Uint8Array(w.W * w.D);
    let n = 0;
    for (let r0 = 0; r0 < w.D; r0++) for (let c0 = 0; c0 < w.W; c0++) {
        const f0 = r0 * w.W + c0;
        if (!field.land[f0] || seen[f0]) continue;
        const cells = [];
        const stack = [f0];
        seen[f0] = 1;
        while (stack.length) {
            const f = stack.pop();
            const r = Math.floor(f / w.W);
            const c = f % w.W;
            const q = c - (r - (r & 1)) / 2;
            cells.push([q, r]);
            for (const [dq, dr] of DIRS) {
                const nq = q + dq;
                const nr = r + dr;
                if (!w.inside(nq, nr)) continue;
                const nf = nr * w.W + nq + (nr - (nr & 1)) / 2;
                if (field.land[nf] && !seen[nf]) { seen[nf] = 1; stack.push(nf); }
            }
        }
        if (cells.length < 40) continue;
        let sx = 0;
        let sy = 0;
        const count = {};
        const lvls = [];
        const names = {};
        for (const [q, r] of cells) {
            const [x, y] = center(q, r);
            sx += x;
            sy += y;
            const f = r * w.W + q + (r - (r & 1)) / 2;
            const bi = BIOME_IDS[field.biome[f]];
            count[bi] = (count[bi] ?? 0) + 1;
            const reg = field.region[f];
            if (reg?.lvl) lvls.push(reg.lvl);
            if (reg?.name) names[reg.name] = (names[reg.name] ?? 0) + 1;
        }
        const x = sx / cells.length;
        const y = sy / cells.length;
        let rad = 0;
        for (const [q, r] of cells) { const [cx, cy] = center(q, r); rad = Math.max(rad, Math.hypot(cx - x, cy - y)); }
        const biome = Object.entries(count).filter(([k]) => k !== 'sea').sort((a, c) => c[1] - a[1])[0]?.[0] ?? 'meadow';
        const lvl = lvls[0] ?? [5 + n * 3, 9 + n * 3];
        // the name: the regions', a place on it, or the biome
        let name = Object.entries(names).sort((p, q) => q[1] - p[1])[0]?.[0] ?? null;
        if (!name) for (const p of doc.pois) {
            if (POI_KINDS[p.kind]?.template || p.kind === 'dock') continue;
            if (Math.hypot(p.x - x, p.y - y) < rad + 3) { name = p.name; break; }
        }
        const id = `land${n++}`;
        isl[id] = { x, y, r: rad, biome, lvl, name: name ?? BIOMES[biome].name, cells, land: true };
    }
}

// which island a point is on
export function islandAt(isl, x, y) {
    let best = null;
    let bd = Infinity;
    for (const [id, I] of Object.entries(isl)) {
        const d = Math.hypot(x - I.x, y - I.y) - I.r;
        if (d < bd) { bd = d; best = id; }
    }
    return bd < 16 ? best : null;
}

// ---------------------------------------------------------------- plants, stones, nodes
const NODE_BY_PROP = { tree: 'tree', palm: 'palm' };

export function decorate(b, doc, field, isl, SEA) {
    const w = b.w;
    const rng = mulberry32((doc.seed ?? 7) * 7 + 99);
    for (const [id, I] of Object.entries(isl)) {
        if (!I.land) continue;
        const B = BIOMES[I.biome];
        for (const [q, r] of I.cells) {
            const f = r * w.W + q + (r - (r & 1)) / 2;
            const bi = BIOME_IDS[field.biome[f]];
            const BB = BIOMES[bi] ?? B;
            if (!BB.props) continue;
            const s = w.surface(q, r);
            if (s < SEA || w.blocked(q, r, s) || !w.node(q, r, s)) continue;
            const top = w.get(q, r, s - 1);
            if (top === M.LAVA) continue;
            let roll = rng();
            for (const [kind, p] of BB.props) {
                if (kind === 'lily') continue;
                if (roll < p) {
                    const node = NODE_BY_PROP[kind];
                    if (node && rng() < 0.45) b.node(node, q, r, s, id);
                    else if (kind === 'slabs') { /* painted in the terrain already */ }
                    else b.prop(kind, q, r, s, { block: BLOCKS[kind] ?? 0, seed: b.uid });
                    break;
                }
                roll -= p;
            }
            // gathering: herbs in the grass, ore in the rock
            if (rng() < 0.012) b.node(bi === 'desert' || bi === 'volcanic' || bi === 'snow' ? (rng() < 0.5 ? 'iron' : 'copper') : 'herbbush', q, r, s, id);
        }
        // lilies on the swamp pools
        if (I.biome === 'swamp' || B.props?.some(([k]) => k === 'lily')) {
            for (const [q, r] of I.cells) {
                const f = r * w.W + q + (r - (r & 1)) / 2;
                if (field.land[f] === 2 && rng() < 0.2) b.prop('lily', q, r, SEA);
            }
        }
    }
}
const BLOCKS = { cactus: 2, deadtree: 2, snowpine: 2, redboulder: 1, boulder: 1, column: 2, basaltspire: 2, charred: 2, crystal: 1, tree: 2 };

// ---------------------------------------------------------------- small places
const ELDERS = {
    desert: [['Кочевник Азар', 0xd08a3a, 'bandana', 'Песок помнит всё. Особенно чужие следы.']],
    snow: [['Охотница Ильва', 0x6a8aa8, 'hood', 'Здесь зима не время года. Здесь она хозяйка.']],
    swamp: [['Травник Мох', 0x6f7a4a, 'straw', 'Топь кормит того, кто смотрит под ноги.']],
    jungle: [['Жрица Кайя', 0x3f8a5a, 'scarf', 'Лес дышит. Слушай — и он тебя пропустит.']],
    volcanic: [['Кузнец Угар', 0x8a3a2a, 'helmet', 'Огонь не злой. Он просто голодный.']],
    ruins: [['Смотритель Грей', 0x8a8a7a, 'cap', 'Здесь когда-то стояла застава. Теперь стоим мы с тобой.']],
    meadow: [['Пастух Лён', 0x8aa860, 'straw', 'Овцы у меня смирные. Кабаны — нет.']],
};
const GATHER_BY_BIOME = { desert: 'ore', snow: 'iron_ore', swamp: 'herb', jungle: 'log', volcanic: 'iron_ore', ruins: 'ore', meadow: 'herb' };

export function smallPois(b, doc, field, isl, SEA) {
    const w = b.w;
    const rng = mulberry32((doc.seed ?? 7) * 19 + 3);
    b.npcDefs = b.npcDefs ?? {};
    b.quests = b.quests ?? {};
    for (const p of doc.pois) {
        const K = POI_KINDS[p.kind];
        if (!K || K.template) continue;
        const island = islandAt(isl, p.x, p.y);
        const I = isl[island];
        if (!I) continue;
        const biome = I.biome ?? 'meadow';
        const [pq, pr] = hexAt(p.x, p.y);
        if (p.kind === 'dock') { dock(b, p, island, SEA); continue; }
        // level the ground under the place
        const base = Math.max(SEA + 1, w.surface(pq, pr));
        const topMat = p.kind === 'ruin' || p.kind === 'shrine' ? M.SLAB : BIOMES[biome].top;
        for (const [q, r] of disk(pq, pr, K.r)) {
            if (!w.inside(q, r)) continue;
            const s = w.surface(q, r);
            if (s < SEA) continue;
            if (Math.abs(s - base) > 4) continue;
            b.ground(q, r, base, dist(q, r, pq, pr) <= K.r - 1 ? topMat : w.get(q, r, s - 1), BIOMES[biome].under, BIOMES[biome].deep);
        }
        b.labels.push({ text: p.name, x: p.x, y: p.y, z: base * LAYER + 4 });
        if (p.kind === 'village') {
            const wall = { desert: M.PLASTER_OCHRE, snow: M.DARKWOOD, swamp: M.DARKWOOD, jungle: M.WOOD, volcanic: M.BASALT, ruins: M.STONE, meadow: M.PLASTER_CREAM }[biome] ?? M.PLASTER_CREAM;
            const roof = { desert: M.CLAY, snow: M.SNOW, swamp: M.MOSS, jungle: M.LEAVES, volcanic: M.ROOF_RED, ruins: M.ROOF_TEAL, meadow: M.ROOF_RED }[biome] ?? M.ROOF_RED;
            for (let i = 0; i < 3; i++) {
                const a = (i / 3) * Math.PI * 2 + rng();
                const [hq, hr] = hexAt(p.x + Math.cos(a) * 3.6, p.y + Math.sin(a) * 3.6);
                if (w.surface(hq, hr) !== base) continue;
                b.house(hq, hr, 1, base, 1, wall, roof, { platform: false, doors: [pick(rng, [0, 1, 2, 3, 4, 5])], flat: biome === 'desert' });
            }
            b.prop('campfire', pq, pr, base);
            b.lights.push({ q: pq, r: pr, z: base + 1, color: 0xff9a4a, range: 6 });
            const [nq, nr] = [pq + 1, pr];
            elder(b, p, biome, island, nq, nr, base);
        } else if (p.kind === 'camp') {
            b.prop('tent', pq - 1, pr + 1, base, { block: 2 });
            b.prop('tent', pq + 2, pr - 1, base, { block: 2 });
            b.prop('campfire', pq, pr, base);
            b.prop('crates', pq + 1, pr + 1, base, { block: 2 });
            b.lights.push({ q: pq, r: pr, z: base + 1, color: 0xff9a4a, range: 6 });
            const kind = { desert: 'sandbandit', snow: 'bandit', jungle: 'bandit' }[biome] ?? 'bandit';
            b.zone(kind, I.lvl, p.x, p.y, 5, 5, island);
        } else if (p.kind === 'ruin') {
            for (const [q, r] of ring(pq, pr, K.r - 1)) if (rng() < 0.45) b.prop('column', q, r, base, { block: 2, broken: rng() < 0.6 });
            b.prop('arch', pq, pr, base + 1);
            b.zone(biome === 'desert' ? 'mummy' : 'skeleton', [I.lvl[0] + 1, I.lvl[1] + 1], p.x, p.y, 5, 4, island);
        } else if (p.kind === 'shrine') {
            b.prop('pylon', pq, pr, base, { block: 2 });
            for (const [q, r] of ring(pq, pr, 2)) if ((q + r) % 2 === 0) b.prop('lamppost', q, r, base, { block: 2 });
            b.lights.push({ q: pq, r: pr, z: base + 3, color: 0x6ff5cf, range: 7 });
            elder(b, p, biome, island, pq + 1, pr + 1, base);
        }
    }
    // an island without a berth gets one where its coast is nearest the sea lanes
    for (const [id, I] of Object.entries(isl)) {
        if (!I.land || b.docks.some((d) => d.island === id)) continue;
        dock(b, { x: I.x, y: I.y - I.r * 0.8, name: `Причал: ${I.name}` }, id, SEA);
    }
}

// a person who lives here, with two errands of their own
function elder(b, p, biome, island, q, r, h) {
    const [name, color, hat, line] = pick(mulberry32(q * 31 + r), ELDERS[biome] ?? ELDERS.meadow);
    const id = `${p.id}:elder`;
    b.npcDefs[id] = { name, role: 'quest', color, hat, line };
    b.npc(id, q, r, h, 3);
    const I = b.isl[island];
    const mobs = BIOMES[I.biome]?.mobs ?? [['boar', 1]];
    const target = mobs[0][0];
    const count = 6;
    b.quests[`${id}:hunt`] = {
        name: `Охота: ${name.split(' ').pop()}`, giver: id, type: 'kill', target, count,
        reward: { xp: 120 + I.lvl[0] * 40, gold: 20 + I.lvl[0] * 6, items: [['potion_m', 2]] },
        text: `${line} Помоги мне: здешние твари совсем осмелели. Шестерых хватит, чтобы остальные запомнили.`,
    };
    const item = GATHER_BY_BIOME[I.biome] ?? 'herb';
    b.quests[`${id}:gather`] = {
        name: `Припасы для: ${name.split(' ').pop()}`, giver: id, type: 'gather', item, count: 5,
        reward: { xp: 90 + I.lvl[0] * 25, gold: 30 + I.lvl[0] * 5 },
        text: 'Мне нужны припасы, а ходить далеко уже тяжело. Принеси пять — отплачу честно.',
    };
    b.questStart = b.questStart ?? [];
    b.questStart.push(`${id}:hunt`, `${id}:gather`);
}

// a short wooden pier from the coast into water deep enough for the ship
function dock(b, p, island, SEA) {
    const w = b.w;
    const I = b.isl[island];
    // nearest coastal walkable hex to the point
    let best = null;
    for (const [q, r] of I.cells ?? []) {
        const s = w.surface(q, r);
        if (s > SEA + 3 || !w.node(q, r, s)) continue;
        if (!DIRS.some(([dq, dr]) => w.get(q + dq, r + dr, SEA - 1) === M.WATER && !w.solid(q + dq, r + dr, SEA))) continue;
        const [x, y] = center(q, r);
        const d = Math.hypot(x - p.x, y - p.y);
        if (!best || d < best.d) best = { q, r, s, d };
    }
    if (!best) return;
    // walk out into the water until it is two deep
    const d = DIRS.findIndex(([dq, dr]) => w.get(best.q + dq, best.r + dr, SEA - 1) === M.WATER && !w.solid(best.q + dq, best.r + dr, SEA));
    let [q, r] = [best.q, best.r];
    const L = Math.max(SEA + 1, best.s);
    const deck = [];
    for (let i = 0; i < 6; i++) {
        q += DIRS[d][0];
        r += DIRS[d][1];
        if (!w.inside(q, r)) break;
        deck.push([q, r]);
        let depth = 0;
        for (let z = SEA - 1; z >= 0 && w.get(q, r, z) === M.WATER; z--) depth++;
        if (depth >= 2 && i >= 2) break;
    }
    b.deck(deck, L);
    const [eq, er] = deck[deck.length - 1] ?? [best.q, best.r];
    b.prop('lamppost', eq, er, L, { block: 2 });
    b.docks.push({ island, q: eq + DIRS[d][0], r: er + DIRS[d][1], land: [eq, er, L], name: p.name });
}

// ---------------------------------------------------------------- creatures
export function biomeSpawns(b, doc, field, isl) {
    const rng = mulberry32((doc.seed ?? 7) * 23 + 1);
    for (const [id, I] of Object.entries(isl)) {
        if (!I.land) continue;
        const B = BIOMES[I.biome];
        if (!B.mobs) continue;
        const zones = Math.max(2, Math.min(6, Math.round(I.cells.length / 180)));
        for (let k = 0; k < zones; k++) {
            const [q, r] = I.cells[Math.floor(rng() * I.cells.length)];
            const [x, y] = center(q, r);
            let roll = rng();
            let kind = B.mobs[0][0];
            for (const [m, p] of B.mobs) { if (roll < p) { kind = m; break; } roll -= p; }
            b.zone(kind, I.lvl, x, y, 6, 5, id);
        }
        // a sea serpent or two offshore
        b.zone('serpent', [I.lvl[0], I.lvl[1]], I.x + I.r + 6, I.y, 8, 2, 'sea', { sea: true });
    }
}

// ---------------------------------------------------------------- hand edits
export function applyEdits(b, doc, SEA) {
    for (const [k, e] of Object.entries(doc.edits ?? {})) {
        const [q, r] = k.split(',').map(Number);
        applyColumnEdit(b.w, q, r, e, SEA);
    }
}

// one column: a new standing height and/or a new surface
export function applyColumnEdit(w, q, r, e, SEA) {
    if (!w.inside(q, r)) return;
    const s = w.surface(q, r);
    const top = e.mat ?? (s > 0 ? w.get(q, r, s - 1) : M.SAND);
    if (e.h !== undefined) {
        const h = Math.max(1, Math.min(w.H - 4, e.h));
        const under = s > 1 ? w.get(q, r, Math.max(0, s - 2)) : M.ROCK;
        for (let z = 0; z < w.H; z++) {
            if (z < h - 1) { if (!MAT[w.get(q, r, z)].solid) w.set(q, r, z, MAT[under]?.solid ? under : M.ROCK); }
            else if (z === h - 1) w.set(q, r, z, top);
            else w.set(q, r, z, z < SEA ? M.WATER : M.AIR);
        }
    } else if (e.mat !== undefined && s > 0) w.set(q, r, s - 1, e.mat);
}

export function applyPropEdits(b, doc) {
    const w = b.w;
    for (const [k, e] of Object.entries(doc.edits ?? {})) {
        if (e.prop === undefined) continue;
        const [q, r] = k.split(',').map(Number);
        const at = b.props.filter((p) => p.q === q && p.r === r);
        for (const p of at) if (p.block) w.unblock(p.q, p.r, p.z, p.block);
        b.props = b.props.filter((p) => !(p.q === q && p.r === r));
        for (const n of b.nodes) if (n.q === q && n.r === r && !['fishspot', 'algae', 'wreck'].includes(n.kind)) w.unblock(n.q, n.r, n.h, 2);
        b.nodes = b.nodes.filter((n) => !(n.q === q && n.r === r));
        if (e.prop && e.prop !== 'none') b.prop(e.prop, q, r, w.surface(q, r), { block: BLOCKS[e.prop] ?? 0 });
    }
}

export { key3, islandAt as whichIsland, BLOCKS };
