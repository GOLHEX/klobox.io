// Six Winds mesher: turns hex columns into stone slabs, soft ground and layered
// cliffs. Pure data in, typed arrays out, so the game and the editor share it.
//
// A top face is an inner hexagon with a bevel down to the rim on the edges that
// need one: every edge of a slab (stones sit apart with a groove between them),
// and on soft ground only the edges above a drop. Where two neighbours at the
// same level end their rims at different heights a small skirt closes the gap.
// Natural sides are cut layer by layer and their corners wander a little from
// one layer to the next, the same way for every face that shares a corner, so
// cliffs read as stacked rock without cracks between faces.

import { DIRS, NORMALS, LAYER, CIRC, center } from './hex.js';
import { M, MAT } from './world.js';

// surface patterns drawn in the shader, by material; tops and sides
export const PAT = {
    [M.SAND]: 8, [M.GRASS]: 7, [M.DIRT]: 8, [M.STONE]: 14, [M.COBBLE]: 6, [M.CONCRETE]: 5, [M.WOOD]: 3,
    [M.PLASTER_RED]: 1, [M.PLASTER_TEAL]: 1, [M.PLASTER_BLUE]: 1, [M.PLASTER_CREAM]: 1, [M.PLASTER_OCHRE]: 1,
    [M.ROOF_RED]: 4, [M.ROOF_TEAL]: 4, [M.BRICK]: 2, [M.ROCK]: 14, [M.MOSS]: 7, [M.GLOW]: 11, [M.DARKWOOD]: 3,
    [M.LEAVES]: 7, [M.CORAL]: 9, [M.METAL]: 10, [M.TILE]: 12, [M.SEABED]: 8, [M.SANDSTONE]: 14, [M.SLAB]: 14,
    [M.SNOW]: 15, [M.ICE]: 14, [M.MUD]: 16, [M.BASALT]: 14, [M.ASH]: 8, [M.LAVA]: 11, [M.CLAY]: 8, [M.JGRASS]: 7,
    [M.DRYGRASS]: 7, [M.REDROCK]: 14,
};
const SIDE_PAT = { rough: 13 };

const BEVEL = {
    slab: { b: 0.075, drop: 0.075, jitter: 0.045 },
    soft: { b: 0.075, drop: 0.1, jitter: 0 },
    wall: { b: 0.03, drop: 0.035, jitter: 0 },
};

// corner j sits at 30 + 60 j degrees; edge i runs from corner i - 1 to corner i
const CX = [];
const CY = [];
for (let j = 0; j < 6; j++) { const a = ((30 + 60 * j) * Math.PI) / 180; CX.push(Math.cos(a) * CIRC); CY.push(Math.sin(a) * CIRC); }
const SIN60 = Math.sin(Math.PI / 3);

function hash3(a, b, c) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const rgb = (hex, k) => [((hex >> 16) & 255) / 255 * k, ((hex >> 8) & 255) / 255 * k, (hex & 255) / 255 * k];

export function meshChunk(world, cx, cy, CH) {
    const { W, D, H, cells } = world;
    const sea = world.sea;
    const out = { pos: [], nor: [], col: [], emi: [], pat: [], ao: [], idx: [] };
    const wat = { pos: [], dep: [], idx: [] };

    const mAt = (q, r, z) => {
        const c = q + (r - (r & 1)) / 2;
        if (c < 0 || c >= W || r < 0 || r >= D || z < 0 || z >= H) return z < sea && z >= 0 ? M.WATER : z < 0 ? M.ROCK : M.AIR;
        return cells[(z * D + r) * W + c];
    };
    const solid = (q, r, z) => MAT[mAt(q, r, z)].solid === true;
    const depthOf = (q, r) => {
        let k = sea - 1;
        if (mAt(q, r, k) !== M.WATER) return 0;
        let d = 0;
        while (k >= 0 && mAt(q, r, k) === M.WATER) { d++; k--; }
        return d;
    };

    // ---- the top of a column: height, bevelled edges, rim heights at the corners
    const tops = new Map();
    const topInfo = (q, r, z) => {
        const key = ((z * 8192 + (r + 4096)) * 8192) + (q + 4096);
        let t = tops.get(key);
        if (t) return t;
        const m = mAt(q, r, z);
        const st = MAT[m].style ?? 'soft';
        const bev = BEVEL[st];
        const zt = (z + 1) * LAYER + (bev.jitter ? (hash3(q, r, z) - 0.5) * bev.jitter : 0);
        const ch = [0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 6; i++) {
            const nq = q + DIRS[i][0];
            const nr = r + DIRS[i][1];
            if (solid(nq, nr, z + 1)) continue;
            if (!solid(nq, nr, z)) { ch[i] = 1; continue; }
            const ns = MAT[mAt(nq, nr, z)].style;
            if (st === 'slab' || ns === 'slab') ch[i] = 1;
        }
        const d = [];
        for (let j = 0; j < 6; j++) d.push(ch[j] && ch[(j + 1) % 6] ? bev.drop : 0);
        t = { m, st, bev, zt, ch, d };
        tops.set(key, t);
        return t;
    };

    // ---- corners of natural sides wander a little from layer to layer
    const disps = new Map();
    const rough = (q, r, z) => { const m = mAt(q, r, z); return !MAT[m].solid || MAT[m].rough === true; };
    const disp = (q, r, j, lev) => {
        const [x, y] = center(q, r);
        const px = x + CX[j];
        const py = y + CY[j];
        const kx = Math.round(px * 64);
        const ky = Math.round(py * 64);
        const key = `${kx},${ky},${lev}`;
        let v = disps.get(key);
        if (v) return v;
        // every column touching this corner must be natural rock at both layers
        let ok = true;
        const around = [[q, r], [q + DIRS[j][0], r + DIRS[j][1]], [q + DIRS[(j + 1) % 6][0], r + DIRS[(j + 1) % 6][1]]];
        for (const [a, b] of around) if (!rough(a, b, lev) || !rough(a, b, lev - 1)) { ok = false; break; }
        if (ok) {
            const ang = hash3(kx, ky, lev * 7 + 1) * Math.PI * 2;
            const mag = 0.025 + hash3(kx + 11, ky - 7, lev) * 0.06;
            v = [Math.cos(ang) * mag, Math.sin(ang) * mag];
        } else v = [0, 0];
        disps.set(key, v);
        return v;
    };

    const push = (p, n, c, e, pt, a) => {
        out.pos.push(p[0], p[1], p[2]);
        out.nor.push(n[0], n[1], n[2]);
        out.col.push(c[0], c[1], c[2]);
        out.emi.push(e);
        out.pat.push(pt);
        out.ao.push(a);
        return out.pos.length / 3 - 1;
    };
    const faceNormal = (a, b, c) => {
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const uz = b[2] - a[2];
        const vx = c[0] - a[0];
        const vy = c[1] - a[1];
        const vz = c[2] - a[2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        return [nx / l, ny / l, nz / l];
    };
    // a quad a b c d, counter-clockwise seen from its front
    const quad = (v, c, e, pt, ao, n) => {
        n = n ?? faceNormal(v[0], v[1], v[3]);
        const i0 = push(v[0], n, c, e, pt, ao[0]);
        push(v[1], n, c, e, pt, ao[1]);
        push(v[2], n, c, e, pt, ao[2]);
        push(v[3], n, c, e, pt, ao[3]);
        out.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };

    for (let row = cy * CH; row < Math.min(D, cy * CH + CH); row++) {
        for (let c = cx * CH; c < Math.min(W, cx * CH + CH); c++) {
            const q = c - (row - (row & 1)) / 2;
            const r = row;
            const [x, y] = center(q, r);
            for (let z = 0; z < H; z++) {
                const m = cells[(z * D + r) * W + c];
                const mt = MAT[m];
                if (m === M.WATER) {
                    if (mAt(q, r, z + 1) === M.WATER || solid(q, r, z + 1)) continue;
                    const zz = (z + 1) * LAYER - 0.1;
                    const dc = depthOf(q, r) + (z + 1 - sea);
                    const nd = DIRS.map(([dq, dr]) => (mAt(q + dq, r + dr, z) === M.WATER ? depthOf(q + dq, r + dr) + (z + 1 - sea) : 0));
                    const base = wat.pos.length / 3;
                    wat.pos.push(x, y, zz);
                    wat.dep.push(dc);
                    for (let j = 0; j < 6; j++) {
                        wat.pos.push(x + CX[j], y + CY[j], zz);
                        wat.dep.push((dc + nd[j] + nd[(j + 1) % 6]) / 3);
                    }
                    for (let j = 0; j < 6; j++) wat.idx.push(base, base + 1 + j, base + 1 + ((j + 1) % 6));
                    continue;
                }
                if (!mt.solid) continue;
                const isTop = !solid(q, r, z + 1);
                const h0 = hash3(q, r, z);
                const p = PAT[m] ?? 0;

                // ---------------------------------------------- the top slab
                let top = null;
                if (isTop) {
                    top = topInfo(q, r, z);
                    const { bev, zt, ch, d } = top;
                    const tint = mt.style === 'slab' ? 0.92 + h0 * 0.14 : 0.96 + h0 * 0.07;
                    const cc = rgb(mt.color, tint);
                    // inner hexagon: edge lines pulled in where bevelled
                    const IX = [];
                    const IY = [];
                    for (let j = 0; j < 6; j++) {
                        const oj = 0.5 - ch[j] * bev.b;
                        const ok = 0.5 - ch[(j + 1) % 6] * bev.b;
                        const nj = NORMALS[j];
                        const nk = NORMALS[(j + 1) % 6];
                        IX.push((oj * nk[1] - ok * nj[1]) / SIN60);
                        IY.push((nj[0] * ok - nk[0] * oj) / SIN60);
                    }
                    const occ = DIRS.map(([dq, dr]) => (solid(q + dq, r + dr, z + 1) ? 1 : 0));
                    const up = [0, 0, 1];
                    const i0 = push([x, y, zt], up, cc, mt.emit, p, 1);
                    for (let j = 0; j < 6; j++) push([x + IX[j], y + IY[j], zt], up, cc, mt.emit, p, 1 - 0.3 * (occ[j] + occ[(j + 1) % 6]));
                    for (let j = 0; j < 6; j++) out.idx.push(i0, i0 + 1 + j, i0 + 1 + ((j + 1) % 6));
                    // bevels down to the rim
                    const rim = (j) => { const dv = disp(q, r, j, z + 1); return [x + CX[j] + dv[0], y + CY[j] + dv[1], zt - d[j]]; };
                    const bc = rgb(mt.color, tint * 0.97);
                    for (let i = 0; i < 6; i++) {
                        if (!ch[i]) continue;
                        const a = (i + 5) % 6;
                        const oa = rim(a);
                        const ob = rim(i);
                        const ia = [x + IX[a], y + IY[a], zt];
                        const ib = [x + IX[i], y + IY[i], zt];
                        quad([oa, ob, ib, ia], bc, mt.emit, p, [1, 1, 1 - 0.3 * (occ[i] + occ[(i + 1) % 6]), 1 - 0.3 * (occ[a] + occ[i])]);
                    }
                    // skirts where a same-level neighbour's rim sits lower
                    for (let i = 0; i < 6; i++) {
                        const nq = q + DIRS[i][0];
                        const nr = r + DIRS[i][1];
                        if (!solid(nq, nr, z) || solid(nq, nr, z + 1)) continue;
                        const nt = topInfo(nq, nr, z);
                        const a = (i + 5) % 6;
                        const hA = zt - d[a];
                        const hB = zt - d[i];
                        const nA = nt.zt - nt.d[(i + 3) % 6];
                        const nB = nt.zt - nt.d[(i + 2) % 6];
                        if (hA <= nA + 1e-4 && hB <= nB + 1e-4) continue;
                        const ra = rim(a);
                        const rb = rim(i);
                        const n = [NORMALS[i][0], NORMALS[i][1], 0];
                        quad([[ra[0], ra[1], Math.min(hA, nA)], [rb[0], rb[1], Math.min(hB, nB)], rb, ra], rgb(mt.side ?? mt.color, 0.8), mt.emit, p, [0.7, 0.7, 1, 1], n);
                    }
                }

                // ---------------------------------------------- the sides
                if (mt.rough) {
                    for (let i = 0; i < 6; i++) {
                        const nq = q + DIRS[i][0];
                        const nr = r + DIRS[i][1];
                        if (solid(nq, nr, z)) continue;
                        const a = (i + 5) % 6;
                        const da0 = disp(q, r, a, z);
                        const db0 = disp(q, r, i, z);
                        const da1 = disp(q, r, a, z + 1);
                        const db1 = disp(q, r, i, z + 1);
                        const ha = top ? top.zt - top.d[a] : (z + 1) * LAYER;
                        const hb = top ? top.zt - top.d[i] : (z + 1) * LAYER;
                        const lo = z * LAYER;
                        const grounded = solid(nq, nr, z - 1);
                        const band = (z + (hash3(q >> 2, r >> 2, 3) > 0.5 ? 1 : 0)) % 2;
                        const sc = isTop && mt.side ? mt.side : band && mt.layers ? mt.layers : mt.side ?? mt.color;
                        const k = 0.9 + hash3(q, r, z + 100) * 0.12 - (grounded ? 0.03 : 0);
                        quad([
                            [x + CX[a] + da0[0], y + CY[a] + da0[1], lo],
                            [x + CX[i] + db0[0], y + CY[i] + db0[1], lo],
                            [x + CX[i] + db1[0], y + CY[i] + db1[1], hb],
                            [x + CX[a] + da1[0], y + CY[a] + da1[1], ha],
                        ], rgb(sc, k), mt.emit, SIDE_PAT.rough, grounded ? [0.68, 0.68, 1, 1] : [0.95, 0.95, 1, 1]);
                    }
                } else {
                    // built walls: merge runs of the same material up the column
                    for (let i = 0; i < 6; i++) {
                        const nq = q + DIRS[i][0];
                        const nr = r + DIRS[i][1];
                        if (solid(nq, nr, z)) continue;
                        if (z > 0 && cells[((z - 1) * D + r) * W + c] === m && !solid(nq, nr, z - 1)) continue;
                        let z1 = z;
                        while (z1 + 1 < H && cells[((z1 + 1) * D + r) * W + c] === m && !solid(nq, nr, z1 + 1)) z1++;
                        const a = (i + 5) % 6;
                        const topOfRun = !solid(q, r, z1 + 1);
                        const t = topOfRun ? topInfo(q, r, z1) : null;
                        const ha = t ? t.zt - t.d[a] : (z1 + 1) * LAYER;
                        const hb = t ? t.zt - t.d[i] : (z1 + 1) * LAYER;
                        const grounded = solid(nq, nr, z - 1);
                        const sc = rgb(mt.side ?? mt.color, 0.95 + h0 * 0.06);
                        const n = [NORMALS[i][0], NORMALS[i][1], 0];
                        const lo = z * LAYER;
                        if (grounded && z1 > z) {
                            const mid = (z + 1) * LAYER;
                            quad([[x + CX[a], y + CY[a], lo], [x + CX[i], y + CY[i], lo], [x + CX[i], y + CY[i], mid], [x + CX[a], y + CY[a], mid]], sc, mt.emit, p, [0.7, 0.7, 1, 1], n);
                            quad([[x + CX[a], y + CY[a], mid], [x + CX[i], y + CY[i], mid], [x + CX[i], y + CY[i], hb], [x + CX[a], y + CY[a], ha]], sc, mt.emit, p, [1, 1, 1, 1], n);
                        } else {
                            const g = grounded ? 0.7 : 1;
                            quad([[x + CX[a], y + CY[a], lo], [x + CX[i], y + CY[i], lo], [x + CX[i], y + CY[i], hb], [x + CX[a], y + CY[a], ha]], sc, mt.emit, p, [g, g, 1, 1], n);
                        }
                    }
                }
            }
        }
    }
    return { solid: out, water: wat };
}
