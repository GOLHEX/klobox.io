// Six Winds world document: what the generator builds and the editor edits.
//
//   regions  a coarse hex grid laid over the fine one; each region is a hex of
//            hexes of radius R and carries a biome, an elevation and a level
//   pois     places: town templates (the wharf, the canal city, the sluices),
//            villages, camps, ruins, shrines, docks
//   edits    hand edits of single columns: height, surface material, a prop
//
// Regions tile the plane exactly: their centres sit on the lattice spanned by
// (2R + 1, -R) and (R, R + 1) in axial coordinates.

import { center, hexAt, dist, mulberry32, noise2 } from './hex.js';
import { M } from './world.js';

export const DOC_VERSION = 1;
export const DOC_KEY = 'sixwinds-world-doc-1';

export const ELEV = [
    { id: 0, name: 'Глубокое море', level: -5 },
    { id: 1, name: 'Мелководье', level: -1.4 },
    { id: 2, name: 'Низина', level: 2 },
    { id: 3, name: 'Холмы', level: 6.5 },
    { id: 4, name: 'Горы', level: 13 },
];

// biomes: surface, the stone under it, what grows, who lives there, how the map draws it
export const BIOMES = {
    sea: { name: 'Море', top: M.SAND, under: M.SAND, deep: M.ROCK, beach: M.SAND, rough: 0, map: '#9fc8cf', ink: 'sea' },
    meadow: {
        name: 'Луга', top: M.GRASS, under: M.DIRT, deep: M.ROCK, beach: M.SAND, rough: 1.4, map: '#cfe0a8', ink: 'forest',
        props: [['tree', 0.03], ['bush', 0.03], ['grass', 0.07], ['flowers', 0.035], ['boulder', 0.008]],
        mobs: [['boar', 0.5], ['lamb', 0.5]],
    },
    desert: {
        name: 'Пустыня', top: M.SAND, under: M.SANDSTONE, deep: M.REDROCK, beach: M.SAND, rough: 1.8, mesa: 4, spires: 0.012, map: '#f0d9a8', ink: 'desert',
        props: [['cactus', 0.018], ['agave', 0.04], ['deadtree', 0.008], ['bones', 0.004], ['redboulder', 0.012], ['slabs', 0.006]],
        mobs: [['scorpion', 0.55], ['cactoid', 0.25], ['sandbandit', 0.2]],
    },
    snow: {
        name: 'Снега', top: M.SNOW, under: M.ICE, deep: M.ROCK, beach: M.SNOW, rough: 3.2, ridge: true, map: '#eef3f5', ink: 'mountain',
        props: [['snowpine', 0.045], ['drift', 0.03], ['crystal', 0.01], ['boulder', 0.01]],
        mobs: [['wolf', 0.55], ['snowman', 0.25], ['penguin', 0.2]],
    },
    swamp: {
        name: 'Топь', top: M.MUD, under: M.MUD, deep: M.ROCK, beach: M.MUD, rough: 0.5, pools: 0.34, map: '#b9c49a', ink: 'swamp',
        props: [['deadtree', 0.025], ['reeds', 0.07], ['mushroom', 0.03], ['lily', 0.12]],
        mobs: [['toad', 0.45], ['lurker', 0.35], ['wisp', 0.2]],
    },
    jungle: {
        name: 'Джунгли', top: M.JGRASS, under: M.CLAY, deep: M.ROCK, beach: M.SAND, rough: 2.4, map: '#9fcf8c', ink: 'forest',
        props: [['palm', 0.04], ['fern', 0.07], ['bigleaf', 0.04], ['flowers', 0.03], ['tree', 0.02]],
        mobs: [['panther', 0.5], ['parrot', 0.3], ['toad', 0.2]],
    },
    volcanic: {
        name: 'Пепелище', top: M.ASH, under: M.BASALT, deep: M.BASALT, beach: M.ASH, rough: 2.6, lava: 0.05, map: '#c9bfb6', ink: 'mountain',
        props: [['charred', 0.02], ['basaltspire', 0.012], ['boulder', 0.01]],
        mobs: [['embergolem', 0.6], ['scorpion', 0.4]],
    },
    ruins: {
        name: 'Руины', top: M.DRYGRASS, under: M.DIRT, deep: M.ROCK, beach: M.SAND, rough: 1, paving: 0.4, map: '#d8d2bf', ink: 'ruins',
        props: [['column', 0.02], ['boulder', 0.01], ['grass', 0.05]],
        mobs: [['skeleton', 0.6], ['golem', 0.4]],
    },
};
export const BIOME_IDS = Object.keys(BIOMES);

// place kinds the editor can put down; 'template' ones build whole islands of their own
export const POI_KINDS = {
    wharf: { name: 'Солёная Пристань', template: true, r: 26 },
    azure: { name: 'Лазурь', template: true, r: 26 },
    sluice: { name: 'Шлюзы Предтеч', template: true, r: 22 },
    rockislet: { name: 'Скала Рудокопов', template: true, r: 9 },
    wreck: { name: 'Остов «Бездны»', template: true, r: 8 },
    reef: { name: 'Коралловая отмель', template: true, r: 13 },
    village: { name: 'Деревня', r: 4 },
    camp: { name: 'Лагерь', r: 3 },
    ruin: { name: 'Руины', r: 4 },
    shrine: { name: 'Святилище', r: 2 },
    dock: { name: 'Причал', r: 1 },
};

// ---------------------------------------------------------------- the lattice
export function regionCenter(R, a, b) {
    return [a * (2 * R + 1) + b * R, -a * R + b * (R + 1)];
}

export function regionAt(R, q, r) {
    const N = 3 * R * R + 3 * R + 1;
    const af = ((R + 1) * q - R * r) / N;
    const bf = (R * q + (2 * R + 1) * r) / N;
    let best = null;
    let bd = Infinity;
    for (let da = -1; da <= 2; da++) for (let db = -1; db <= 2; db++) {
        const a = Math.floor(af) + da;
        const b = Math.floor(bf) + db;
        const [cq, cr] = regionCenter(R, a, b);
        const d = dist(q, r, cq, cr);
        if (d < bd) { bd = d; best = [a, b]; }
    }
    return best;
}

export const regionKey = (a, b) => `${a},${b}`;

// every region whose centre falls inside the world rectangle
export function regionList(doc) {
    const { R } = doc;
    const out = [];
    const Wx = doc.size.W;
    const Wy = (doc.size.D - 1) * (Math.sqrt(3) / 2);
    for (let a = -40; a < 80; a++) for (let b = -10; b < 80; b++) {
        const [q, r] = regionCenter(R, a, b);
        const [x, y] = center(q, r);
        if (x < -R || y < -R || x > Wx + R || y > Wy + R) continue;
        out.push({ a, b, q, r, x, y });
    }
    return out;
}

export function getRegion(doc, a, b) {
    return doc.regions[regionKey(a, b)] ?? { biome: 'sea', elev: 0 };
}

export function setRegion(doc, a, b, patch) {
    const k = regionKey(a, b);
    const cur = doc.regions[k] ?? { biome: 'sea', elev: 0 };
    const next = { ...cur, ...patch };
    if (next.biome === 'sea' && next.elev === 0 && !next.name && !next.lvl) delete doc.regions[k];
    else doc.regions[k] = next;
}

// ---------------------------------------------------------------- the default archipelago
export function defaultDoc(seed = 7) {
    const doc = {
        version: DOC_VERSION, name: 'Шесть Ветров', seed,
        size: { W: 224, D: 236, H: 48 }, R: 4,
        regions: {}, pois: [], edits: {},
    };
    // the six islands of the story are built by their templates
    const tpl = [
        ['wharf', 58, 70], ['azure', 128, 64], ['sluice', 104, 128], ['rockislet', 30, 30], ['wreck', 82, 24], ['reef', 152, 128],
    ];
    for (const [kind, x, y] of tpl) doc.pois.push({ id: kind, kind, x, y, name: POI_KINDS[kind].name });
    // new lands painted with regions
    const rng = mulberry32(seed * 31 + 5);
    const n = noise2(seed * 13 + 2);
    const lands = [
        { x: 40, y: 152, rad: 25, biome: 'desert', peak: 3, lvl: [16, 22], name: 'Красные Столбы' },
        { x: 180, y: 176, rad: 21, biome: 'snow', peak: 4, lvl: [22, 28], name: 'Ледяной Клык' },
        { x: 192, y: 84, rad: 16, biome: 'swamp', peak: 2, lvl: [12, 16], name: 'Гнилая Топь' },
        { x: 104, y: 184, rad: 16, biome: 'jungle', peak: 3, lvl: [18, 24], name: 'Зелёный Зуб' },
        { x: 198, y: 130, rad: 11, biome: 'volcanic', peak: 4, lvl: [28, 38], name: 'Пепельный остров' },
        { x: 20, y: 92, rad: 10, biome: 'ruins', peak: 2, lvl: [10, 14], name: 'Старая Застава' },
    ];
    for (const reg of regionList(doc)) {
        for (const L of lands) {
            const d = Math.hypot(reg.x - L.x, reg.y - L.y) / L.rad + (n(reg.x * 0.12, reg.y * 0.12) - 0.5) * 0.45;
            if (d > 1) continue;
            const elev = d < 0.35 ? L.peak : d < 0.7 ? Math.max(2, L.peak - 1) : 2;
            setRegion(doc, reg.a, reg.b, { biome: L.biome, elev, lvl: L.lvl, name: L.name });
        }
    }
    // a village or camp on each new land, and its dock
    const extra = [
        ['village', 30, 142, 'Оазис Азара'], ['camp', 50, 152, 'Лагерь кочевников'], ['ruin', 44, 166, 'Храм Песков'], ['dock', 40, 128, 'Причал Столбов'],
        ['village', 176, 170, 'Хутор Ильвы'], ['dock', 172, 158, 'Причал Клыка'],
        ['village', 190, 80, 'Хижина Моха'], ['dock', 178, 80, 'Мостки Топи'],
        ['shrine', 104, 186, 'Святилище Кайи'], ['dock', 96, 172, 'Причал Зуба'],
        ['shrine', 198, 130, 'Огненный алтарь'], ['dock', 188, 124, 'Причал Пепла'],
        ['ruin', 20, 92, 'Старая Застава'], ['dock', 28, 86, 'Причал Заставы'],
    ];
    for (const [kind, x, y, name] of extra) doc.pois.push({ id: `${kind}-${Math.round(x)}-${Math.round(y)}`, kind, x, y, name });
    void rng;
    return doc;
}

// a fresh archipelago: islands of random biomes around the sea, each with a
// village and a berth; the story islands can be kept in their places
export function randomDoc(seed = 1, keepStory = true) {
    const doc = defaultDoc(seed);
    doc.regions = {};
    doc.edits = {};
    doc.pois = keepStory ? doc.pois.filter((p) => POI_KINDS[p.kind]?.template) : [];
    doc.name = `Архипелаг №${seed}`;
    const rng = mulberry32(seed * 977 + 3);
    const n = noise2(seed * 53 + 1);
    const W = doc.size.W;
    const Wy = (doc.size.D - 1) * (Math.sqrt(3) / 2);
    const taken = doc.pois.map((p) => [p.x, p.y, POI_KINDS[p.kind].r + 6]);
    const biomes = ['meadow', 'desert', 'snow', 'swamp', 'jungle', 'volcanic', 'ruins', 'desert', 'meadow'];
    const names = {
        meadow: ['Зелёный Берег', 'Овечий Остров', 'Тихие Луга'], desert: ['Красные Столбы', 'Сухой Зуб', 'Песчаная Корона'],
        snow: ['Ледяной Клык', 'Белая Спина', 'Зимний Утёс'], swamp: ['Гнилая Топь', 'Туманные Кочки', 'Болотный Глаз'],
        jungle: ['Зелёный Зуб', 'Остров Попугаев', 'Лиановый Узел'], volcanic: ['Пепельный остров', 'Горячая Спина', 'Угольный Пик'],
        ruins: ['Старая Застава', 'Остров Колонн', 'Забытый Форт'],
    };
    const lands = [];
    for (let tries = 0; tries < 400 && lands.length < 9; tries++) {
        const rad = 10 + rng() * 16;
        const x = 16 + rad + rng() * (W - 32 - rad * 2);
        const y = 16 + rad + rng() * (Wy - 32 - rad * 2);
        if (taken.some(([tx, ty, tr]) => Math.hypot(tx - x, ty - y) < tr + rad + 8)) continue;
        const biome = biomes[Math.floor(rng() * biomes.length)];
        const lvl = [8 + Math.floor(rng() * 20), 0];
        lvl[1] = lvl[0] + 5;
        const nm = names[biome][Math.floor(rng() * names[biome].length)];
        lands.push({ x, y, rad, biome, peak: biome === 'swamp' ? 2 : 3 + (rng() < 0.4 ? 1 : 0), lvl, name: nm });
        taken.push([x, y, rad]);
    }
    for (const reg of regionList(doc)) {
        for (const L of lands) {
            const d = Math.hypot(reg.x - L.x, reg.y - L.y) / L.rad + (n(reg.x * 0.12, reg.y * 0.12) - 0.5) * 0.5;
            if (d > 1) continue;
            const elev = d < 0.35 ? L.peak : d < 0.7 ? Math.max(2, L.peak - 1) : 2;
            setRegion(doc, reg.a, reg.b, { biome: L.biome, elev, lvl: L.lvl, name: L.name });
        }
    }
    for (const L of lands) {
        const a = rng() * Math.PI * 2;
        doc.pois.push({ id: `village-${Math.round(L.x)}-${Math.round(L.y)}`, kind: L.biome === 'ruins' ? 'ruin' : 'village', x: L.x + Math.cos(a) * L.rad * 0.2, y: L.y + Math.sin(a) * L.rad * 0.2, name: `Посёлок: ${L.name}` });
        if (rng() < 0.5) doc.pois.push({ id: `camp-${Math.round(L.x)}-${Math.round(L.y)}`, kind: 'camp', x: L.x - Math.cos(a) * L.rad * 0.4, y: L.y - Math.sin(a) * L.rad * 0.4, name: 'Лагерь разбойников' });
        doc.pois.push({ id: `dock-${Math.round(L.x)}-${Math.round(L.y)}`, kind: 'dock', x: L.x + Math.cos(a) * L.rad, y: L.y + Math.sin(a) * L.rad, name: `Причал: ${L.name}` });
    }
    return doc;
}

// ---------------------------------------------------------------- storage
export function loadDoc() {
    try {
        const s = localStorage.getItem(DOC_KEY);
        if (!s) return null;
        const d = JSON.parse(s);
        return d && d.version === DOC_VERSION ? d : null;
    } catch { return null; }
}

export function saveDoc(doc) {
    try { localStorage.setItem(DOC_KEY, JSON.stringify(doc)); return true; } catch { return false; }
}

export function clearDoc() {
    try { localStorage.removeItem(DOC_KEY); } catch { /* storage off */ }
}

export { hexAt };
