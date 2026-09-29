// Six Winds world map, drawn the way a cartographer inks a hex atlas: white
// paper, black pen for coasts, peaks, woods and dunes, red for places and their
// names, dotted routes with the time they take. Used by the game (M) and by the
// world editor, from the generated world alone.

import { DIRS, CIRC, SQ3, center, hexAt, mulberry32, noise2 } from './hex.js';
import { M, MAT } from './world.js';
import { BIOME_IDS, regionCenter, regionList } from './worlddoc.js';

export const INK = '#1f1d1b';
export const RED = '#c8392b';
export const PAPER = '#f7f2e6';

const CX = [];
const CY = [];
for (let j = 0; j < 6; j++) { const a = ((30 + 60 * j) * Math.PI) / 180; CX.push(Math.cos(a) * CIRC); CY.push(Math.sin(a) * CIRC); }

// what the pen should draw on a column
function columnKind(w, gen, q, r) {
    const c = q + (r - (r & 1)) / 2;
    let k = w.H - 1;
    while (k > 0 && !MAT[w.get(q, r, k)].solid && w.get(q, r, k) !== M.WATER) k--;
    const m = w.get(q, r, k);
    if (m === M.WATER) return { water: true, depth: w.sea - k };
    const biome = gen.biomes ? BIOME_IDS[gen.biomes[r * w.W + c]] : null;
    return { water: false, h: k + 1, m, biome };
}

export function drawInkMap(canvas, gen, opts = {}) {
    const w = gen.world;
    const S = opts.scale ?? 4; // pixels per world unit
    const Wx = w.W + 1;
    const Wy = (w.D + 1) * (SQ3 / 2);
    canvas.width = Math.round(Wx * S);
    canvas.height = Math.round(Wy * S);
    const g = canvas.getContext('2d');
    const P = (x, y) => [x * S, (Wy - y) * S];
    const rng = mulberry32(17);
    const wob = noise2(5);
    const jitter = (x, y) => [x + (wob(x * 0.7, y * 0.7) - 0.5) * 0.35, y + (wob(x * 0.7 + 9, y * 0.7) - 0.5) * 0.35];

    // ---- paper
    g.fillStyle = PAPER;
    g.fillRect(0, 0, canvas.width, canvas.height);
    const grain = g.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < grain.data.length; i += 4) {
        const v = 244 + (rng() - 0.5) * 10;
        grain.data[i] = v + 3;
        grain.data[i + 1] = v - 1;
        grain.data[i + 2] = v - 11;
        grain.data[i + 3] = 255;
    }
    g.putImageData(grain, 0, 0);

    // ---- read the world once
    const cols = [];
    const land = new Uint8Array(w.W * w.D);
    for (let r = 0; r < w.D; r++) for (let c = 0; c < w.W; c++) {
        const q = c - (r - (r & 1)) / 2;
        const k = columnKind(w, gen, q, r);
        k.q = q;
        k.r = r;
        const [x, y] = center(q, r);
        k.x = x;
        k.y = y;
        cols.push(k);
        if (!k.water) land[r * w.W + c] = 1;
    }
    const isLand = (q, r) => {
        const c = q + (r - (r & 1)) / 2;
        return c >= 0 && c < w.W && r >= 0 && r < w.D && land[r * w.W + c] === 1;
    };
    // distance to the coast over the water, for the wave lines
    const dist = new Uint8Array(w.W * w.D).fill(255);
    const queue = [];
    for (const k of cols) if (!k.water) { dist[k.r * w.W + k.q + (k.r - (k.r & 1)) / 2] = 0; queue.push(k); }
    for (let i = 0; i < queue.length; i++) {
        const k = queue[i];
        const d = dist[k.r * w.W + k.q + (k.r - (k.r & 1)) / 2];
        if (d >= 7) continue;
        for (const [dq, dr] of DIRS) {
            const q = k.q + dq;
            const r = k.r + dr;
            const c = q + (r - (r & 1)) / 2;
            if (c < 0 || c >= w.W || r < 0 || r >= w.D) continue;
            const f = r * w.W + c;
            if (dist[f] <= d + 1) continue;
            dist[f] = d + 1;
            queue.push(cols[f]);
        }
    }

    // ---- faint hex sheets of the regions
    if (gen.doc) {
        g.strokeStyle = 'rgba(31,29,27,0.09)';
        g.lineWidth = 1;
        const R = gen.doc.R;
        const ax = 1.5 * R + 1;
        const ay = (-R * SQ3) / 2;
        const th = Math.atan2(ay, ax);
        const circ = Math.hypot(ax, ay) / 2 / Math.cos(Math.PI / 6);
        for (const reg of regionList(gen.doc)) {
            g.beginPath();
            for (let j = 0; j <= 6; j++) {
                const a = th + Math.PI / 6 + (j * Math.PI) / 3;
                const [px, py] = P(reg.x + Math.cos(a) * circ, reg.y + Math.sin(a) * circ);
                if (j === 0) g.moveTo(px, py); else g.lineTo(px, py);
            }
            g.stroke();
        }
    }

    // ---- water: rows of little waves following the coast
    g.strokeStyle = 'rgba(31,29,27,0.5)';
    g.lineWidth = Math.max(0.8, S * 0.16);
    g.lineCap = 'round';
    for (const k of cols) {
        if (!k.water) continue;
        const d = dist[k.r * w.W + k.q + (k.r - (k.r & 1)) / 2];
        if (!(d === 2 || d === 4 || d === 7)) continue;
        if ((k.q + k.r * 3) % (d === 2 ? 2 : 3) !== 0 || rng() < 0.3) continue;
        const [x, y] = P(k.x, k.y);
        const l = S * (0.55 + rng() * 0.35);
        g.beginPath();
        g.moveTo(x - l, y);
        g.quadraticCurveTo(x - l / 2, y - S * 0.3, x, y);
        g.quadraticCurveTo(x + l / 2, y + S * 0.3, x + l, y);
        g.stroke();
    }

    // ---- the coast: hex edges between land and water, a steady hand
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1.4, S * 0.42);
    g.lineJoin = 'round';
    g.beginPath();
    for (const k of cols) {
        if (k.water) continue;
        for (let i = 0; i < 6; i++) {
            if (isLand(k.q + DIRS[i][0], k.r + DIRS[i][1])) continue;
            const a = (i + 5) % 6;
            const [ax, ay] = P(...jitter(k.x + CX[a], k.y + CY[a]));
            const [bx, by] = P(...jitter(k.x + CX[i], k.y + CY[i]));
            g.moveTo(ax, ay);
            g.lineTo(bx, by);
        }
    }
    g.stroke();
    // a thin second line inside the coast, as old maps do
    g.lineWidth = Math.max(0.6, S * 0.12);
    g.strokeStyle = 'rgba(31,29,27,0.5)';
    g.beginPath();
    for (const k of cols) {
        if (k.water) continue;
        for (let i = 0; i < 6; i++) {
            if (isLand(k.q + DIRS[i][0], k.r + DIRS[i][1])) continue;
            const a = (i + 5) % 6;
            const s = 0.78;
            const [ax, ay] = P(...jitter(k.x + CX[a] * s, k.y + CY[a] * s));
            const [bx, by] = P(...jitter(k.x + CX[i] * s, k.y + CY[i] * s));
            g.moveTo(ax, ay);
            g.lineTo(bx, by);
        }
    }
    g.stroke();

    // ---- glyphs: peaks, woods, dunes, reeds, ruins, set apart like a pen would
    const placed = [];
    const room = (x, y, r) => placed.every((p) => Math.hypot(p[0] - x, p[1] - y) > r + p[2]);
    const order = cols.filter((k) => !k.water).sort(() => rng() - 0.5);
    const treeAt = new Set();
    for (const p of gen.props) if (['tree', 'palm', 'autumn_tree', 'snowpine', 'pine'].includes(p.kind)) treeAt.add(`${p.q},${p.r}`);
    for (const n of gen.nodes) if (n.kind === 'tree' || n.kind === 'palm') treeAt.add(`${n.q},${n.r}`);
    const sea = w.sea;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const k of order) {
        const hi = k.h - sea;
        const [x, y] = P(k.x, k.y);
        if (hi >= 8 || (k.biome === 'snow' && hi >= 4) || (k.biome === 'volcanic' && hi >= 5)) {
            const size = Math.min(3.6, 1.5 + hi * 0.14);
            if (!room(k.x, k.y, size * 0.75)) continue;
            placed.push([k.x, k.y, size]);
            peak(g, x, y, size * S, k.biome === 'snow', k.biome === 'volcanic', rng);
        } else if (k.biome === 'desert' && hi >= 4 && room(k.x, k.y, 2.2)) {
            placed.push([k.x, k.y, 2.2]);
            mesa(g, x, y, 2.2 * S, rng);
        } else if ((treeAt.has(`${k.q},${k.r}`) || (k.biome === 'jungle' && rng() < 0.5)) && room(k.x, k.y, 1.1)) {
            placed.push([k.x, k.y, 1.1]);
            tree(g, x, y, 2.3 * S, k.biome === 'jungle', rng);
        } else if (hi >= 3 && room(k.x, k.y, 1.8)) {
            placed.push([k.x, k.y, 1.8]);
            hill(g, x, y, 2.2 * S);
        } else if (k.biome === 'desert' && room(k.x, k.y, 2.6)) {
            placed.push([k.x, k.y, 2.6]);
            dune(g, x, y, 2.4 * S);
        } else if (k.biome === 'swamp' && room(k.x, k.y, 1.6)) {
            placed.push([k.x, k.y, 1.6]);
            reeds(g, x, y, 1.4 * S);
        } else if (k.biome === 'ruins' && room(k.x, k.y, 2.4) && rng() < 0.4) {
            placed.push([k.x, k.y, 2.4]);
            ruin(g, x, y, 1.6 * S);
        } else if ((k.m === M.GRASS || k.m === M.DRYGRASS || k.m === M.JGRASS) && room(k.x, k.y, 1.5) && rng() < 0.25) {
            placed.push([k.x, k.y, 1.5]);
            tuft(g, x, y, S * 0.9);
        }
    }

    // ---- routes: sea lanes between berths, footpaths to places
    const docks = gen.docks ?? [];
    const lanes = new Set();
    g.setLineDash([S * 0.5, S * 0.9]);
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, S * 0.22);
    for (const a of docks) {
        const [ax, ay] = center(a.q, a.r);
        const near = docks.filter((b) => b !== a).map((b) => { const [bx, by] = center(b.q, b.r); return [Math.hypot(bx - ax, by - ay), b, bx, by]; }).sort((p, q) => p[0] - q[0]).slice(0, 2);
        for (const [d, b, bx, by] of near) {
            const key = [a.name, b.name].sort().join('|');
            if (lanes.has(key) || d > 110) continue;
            lanes.add(key);
            const [px, py] = P(ax, ay);
            const [qx, qy] = P(bx, by);
            const mx = (px + qx) / 2 + (qy - py) * 0.12;
            const my = (py + qy) / 2 - (qx - px) * 0.12;
            g.setLineDash([S * 0.5, S * 0.9]);
            g.strokeStyle = INK;
            g.lineWidth = Math.max(1, S * 0.22);
            g.beginPath();
            g.moveTo(px, py);
            g.quadraticCurveTo(mx, my, qx, qy);
            g.stroke();
            // a ship makes about 7.5 units a second; an hour of game time is 30 real seconds
            const mins = Math.max(5, Math.round((d / 7.5 / 30) * 60 / 5) * 5);
            g.setLineDash([]);
            label(g, `${mins} мин`, mx, my, S * 2.2, RED, false);
        }
    }
    g.setLineDash([]);

    // ---- places in red
    const places = [];
    for (const [id, I] of Object.entries(gen.islands ?? {})) {
        const meta = gen.islandMeta?.[id];
        places.push({ x: I.x, y: I.y + I.r * 0.35, name: meta?.name ?? id, big: true, lvl: meta?.lvl });
    }
    for (const p of gen.doc?.pois ?? []) {
        if (p.kind === 'dock') continue;
        if (['wharf', 'azure', 'sluice', 'rockislet', 'wreck', 'reef'].includes(p.kind)) continue;
        places.push({ x: p.x, y: p.y, name: p.name, kind: p.kind });
    }
    for (const n of gen.npcs ?? []) void n;
    const bigNames = new Set(places.filter((p) => p.big).map((p) => p.name));
    for (const pl of places) {
        if (!pl.big && bigNames.has(pl.name)) { const [x, y] = P(pl.x, pl.y); if (pl.kind) placeIcon(g, x, y, S * 1.6, pl.kind); continue; }
        const [x, y] = P(pl.x, pl.y);
        if (pl.kind) placeIcon(g, x, y, S * 1.6, pl.kind);
        const lvl = pl.lvl ? ` ${pl.lvl[0]}–${pl.lvl[1]}` : '';
        label(g, pl.name.toUpperCase() + (pl.big ? '' : ''), x, y - S * (pl.kind ? 2.6 : 0), S * (pl.big ? 3.4 : 2.4), RED, true, pl.big ? lvl : '');
    }
    for (const d of docks) {
        const [x, y] = P(...center(d.q, d.r));
        anchor(g, x, y, S * 1.4);
    }

    // ---- the six-winds rose and the title
    rose(g, canvas.width - S * 16, canvas.height - S * 16, S * 11);
    if (gen.doc?.name) label(g, gen.doc.name.toUpperCase(), S * 30, S * 10, S * 5, RED, true);
    return { S, Wy, P };
}

// ---------------------------------------------------------------- the pen's vocabulary
function peak(g, x, y, s, snow, fire, rng) {
    const h = s * (0.9 + rng() * 0.3);
    const lx = x - s * 0.6;
    const rx = x + s * 0.6;
    const tx = x + (rng() - 0.5) * s * 0.15;
    const ty = y - h;
    g.fillStyle = PAPER;
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, s * 0.09);
    g.beginPath();
    g.moveTo(lx, y);
    g.lineTo(tx, ty);
    g.lineTo(rx, y);
    g.fill();
    g.stroke();
    // shade the right flank with hatching
    g.lineWidth = Math.max(0.6, s * 0.05);
    g.beginPath();
    for (let i = 1; i < 6; i++) {
        const t = i / 6;
        const ax = tx + (rx - tx) * t;
        const ay = ty + (y - ty) * t;
        g.moveTo(ax, ay);
        g.lineTo(ax - s * 0.12 - t * s * 0.1, ay + s * 0.18);
    }
    g.stroke();
    if (snow) {
        g.beginPath();
        g.moveTo(tx - s * 0.18, ty + h * 0.3);
        g.lineTo(tx - s * 0.05, ty + h * 0.22);
        g.lineTo(tx + s * 0.08, ty + h * 0.34);
        g.stroke();
    }
    if (fire) {
        g.strokeStyle = RED;
        g.beginPath();
        g.moveTo(tx, ty - s * 0.05);
        g.bezierCurveTo(tx - s * 0.3, ty - s * 0.3, tx + s * 0.3, ty - s * 0.45, tx, ty - s * 0.7);
        g.stroke();
    }
}

function mesa(g, x, y, s, rng) {
    const w = s * (0.9 + rng() * 0.4);
    const h = s * 0.55;
    g.fillStyle = PAPER;
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, s * 0.08);
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.lineTo(x - w / 2 + s * 0.12, y - h);
    g.lineTo(x + w / 2 - s * 0.12, y - h);
    g.lineTo(x + w / 2, y);
    g.fill();
    g.stroke();
    g.lineWidth = Math.max(0.6, s * 0.04);
    g.beginPath();
    for (let i = 0; i < 5; i++) {
        const px = x - w / 2 + s * 0.2 + (i / 4) * (w - s * 0.4);
        g.moveTo(px, y - h + s * 0.06);
        g.lineTo(px, y - s * 0.05);
    }
    g.moveTo(x - w / 2 + s * 0.06, y - h * 0.5);
    g.lineTo(x + w / 2 - s * 0.06, y - h * 0.5);
    g.stroke();
}

function tree(g, x, y, s, palm, rng) {
    g.strokeStyle = INK;
    g.fillStyle = PAPER;
    g.lineWidth = Math.max(0.8, s * 0.09);
    if (palm) {
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + s * 0.15, y - s * 0.5, x + s * 0.05, y - s);
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (i - 2) * 0.55;
            g.moveTo(x + s * 0.05, y - s);
            g.quadraticCurveTo(x + s * 0.05 + Math.cos(a) * s * 0.4, y - s + Math.sin(a) * s * 0.2 - s * 0.1, x + s * 0.05 + Math.cos(a) * s * 0.6, y - s + s * 0.25);
        }
        g.stroke();
        return;
    }
    // a crown of little scallops, the shaded side hatched
    const r = s * 0.42;
    g.beginPath();
    for (let i = 0; i <= 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = r * (0.9 + rng() * 0.2);
        const px = x + Math.cos(a) * rr;
        const py = y - s * 0.55 + Math.sin(a) * rr;
        if (i === 0) g.moveTo(px, py); else g.quadraticCurveTo(x + Math.cos(a - 0.4) * rr * 1.35, y - s * 0.55 + Math.sin(a - 0.4) * rr * 1.35, px, py);
    }
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(x, y - s * 0.15);
    g.lineTo(x, y);
    for (let i = 0; i < 3; i++) {
        g.moveTo(x + r * 0.2 + i * r * 0.18, y - s * 0.5 + i * r * 0.12);
        g.lineTo(x + r * 0.35 + i * r * 0.18, y - s * 0.62 + i * r * 0.12);
    }
    g.stroke();
}

function hill(g, x, y, s) {
    g.strokeStyle = INK;
    g.lineWidth = Math.max(0.8, s * 0.07);
    g.beginPath();
    g.moveTo(x - s * 0.5, y);
    g.quadraticCurveTo(x, y - s * 0.55, x + s * 0.5, y);
    g.moveTo(x + s * 0.1, y - s * 0.22);
    g.lineTo(x + s * 0.22, y - s * 0.05);
    g.moveTo(x + s * 0.22, y - s * 0.15);
    g.lineTo(x + s * 0.32, y - s * 0.02);
    g.stroke();
}

function dune(g, x, y, s) {
    g.strokeStyle = 'rgba(31,29,27,0.75)';
    g.lineWidth = Math.max(0.7, s * 0.05);
    g.beginPath();
    g.moveTo(x - s * 0.5, y);
    g.quadraticCurveTo(x - s * 0.1, y - s * 0.2, x + s * 0.2, y - s * 0.02);
    g.moveTo(x - s * 0.1, y + s * 0.2);
    g.quadraticCurveTo(x + s * 0.2, y + s * 0.06, x + s * 0.5, y + s * 0.18);
    g.stroke();
}

function reeds(g, x, y, s) {
    g.strokeStyle = INK;
    g.lineWidth = Math.max(0.7, s * 0.07);
    g.beginPath();
    for (let i = -2; i <= 2; i++) {
        g.moveTo(x + i * s * 0.12, y);
        g.lineTo(x + i * s * 0.16, y - s * (0.45 + (i % 2 ? 0.15 : 0)));
    }
    g.moveTo(x - s * 0.45, y + s * 0.05);
    g.lineTo(x + s * 0.45, y + s * 0.05);
    g.stroke();
}

function ruin(g, x, y, s) {
    g.strokeStyle = INK;
    g.lineWidth = Math.max(0.8, s * 0.08);
    g.beginPath();
    g.rect(x - s * 0.35, y - s * 0.8, s * 0.18, s * 0.8);
    g.rect(x + s * 0.12, y - s * 0.5, s * 0.18, s * 0.5);
    g.moveTo(x - s * 0.5, y);
    g.lineTo(x + s * 0.5, y);
    g.stroke();
}

function tuft(g, x, y, s) {
    g.strokeStyle = 'rgba(31,29,27,0.7)';
    g.lineWidth = Math.max(0.6, s * 0.08);
    g.beginPath();
    g.moveTo(x - s * 0.2, y);
    g.lineTo(x - s * 0.3, y - s * 0.3);
    g.moveTo(x, y);
    g.lineTo(x, y - s * 0.38);
    g.moveTo(x + s * 0.2, y);
    g.lineTo(x + s * 0.3, y - s * 0.3);
    g.stroke();
}

function placeIcon(g, x, y, s, kind) {
    g.strokeStyle = RED;
    g.fillStyle = PAPER;
    g.lineWidth = Math.max(1, s * 0.12);
    g.beginPath();
    if (kind === 'camp') {
        g.moveTo(x - s * 0.6, y);
        g.lineTo(x, y - s);
        g.lineTo(x + s * 0.6, y);
        g.closePath();
        g.fill();
        g.stroke();
        g.beginPath();
        g.moveTo(x, y - s);
        g.lineTo(x, y);
    } else if (kind === 'ruin') {
        g.rect(x - s * 0.5, y - s * 0.9, s * 0.25, s * 0.9);
        g.rect(x + s * 0.2, y - s * 0.6, s * 0.25, s * 0.6);
    } else if (kind === 'shrine') {
        g.moveTo(x - s * 0.5, y);
        g.lineTo(x - s * 0.5, y - s * 0.7);
        g.lineTo(x, y - s * 1.1);
        g.lineTo(x + s * 0.5, y - s * 0.7);
        g.lineTo(x + s * 0.5, y);
        g.closePath();
        g.fill();
    } else {
        // a cluster of houses
        for (const [dx, h] of [[-0.55, 0.7], [0.05, 0.95], [0.6, 0.6]]) {
            const hx = x + dx * s;
            g.moveTo(hx - s * 0.28, y);
            g.lineTo(hx - s * 0.28, y - h * s * 0.6);
            g.lineTo(hx, y - h * s);
            g.lineTo(hx + s * 0.28, y - h * s * 0.6);
            g.lineTo(hx + s * 0.28, y);
        }
    }
    g.stroke();
}

function anchor(g, x, y, s) {
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, s * 0.12);
    g.beginPath();
    g.moveTo(x, y - s * 0.6);
    g.lineTo(x, y + s * 0.5);
    g.moveTo(x - s * 0.3, y - s * 0.3);
    g.lineTo(x + s * 0.3, y - s * 0.3);
    g.moveTo(x - s * 0.5, y + s * 0.1);
    g.quadraticCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.1);
    g.stroke();
    g.beginPath();
    g.arc(x, y - s * 0.72, s * 0.14, 0, Math.PI * 2);
    g.stroke();
}

export function label(g, text, x, y, size, color, bold, small = '') {
    g.font = `${bold ? 700 : 600} ${Math.round(size)}px Caveat, "Segoe Print", cursive`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = Math.max(2, size * 0.28);
    g.strokeStyle = 'rgba(247,242,230,0.92)';
    g.strokeText(text, x, y);
    g.fillStyle = color;
    g.fillText(text, x, y);
    if (small) {
        g.font = `600 ${Math.round(size * 0.6)}px Caveat, cursive`;
        g.strokeText(small.trim(), x, y + size * 0.75);
        g.fillStyle = INK;
        g.fillText(small.trim(), x, y + size * 0.75);
    }
}

// the rose of six winds: a hexagram with the north marked in red
function rose(g, x, y, s) {
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, s * 0.03);
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        const b1 = a - 0.18;
        const b2 = a + 0.18;
        g.beginPath();
        g.moveTo(x + Math.cos(a) * s * 0.95, y + Math.sin(a) * s * 0.95);
        g.lineTo(x + Math.cos(b1) * s * 0.3, y + Math.sin(b1) * s * 0.3);
        g.lineTo(x, y);
        g.lineTo(x + Math.cos(b2) * s * 0.3, y + Math.sin(b2) * s * 0.3);
        g.closePath();
        g.fillStyle = i === 0 ? RED : i % 2 ? PAPER : INK;
        g.fill();
        g.stroke();
    }
    label(g, 'С', x, y - s * 1.25, s * 0.35, RED, true);
}

// map coordinates of a world point, for markers drawn over the map
export function mapPoint(res, x, y) {
    return res.P(x, y);
}

export { hexAt, regionCenter };
