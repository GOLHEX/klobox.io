// Hex grid math for Six Winds. Pointy-top hexagons, axial coordinates (q, r).
// A hex is one unit across its flats; world x, y are in those units, z is up.
// Direction i points at angle i * 60 degrees; turning the camera by 60 degrees
// maps the grid onto itself, which is what lets the world be rotated.

export const SQ3 = Math.sqrt(3);
export const LAYER = 0.5; // height of one voxel layer
export const INR = 0.5; // centre to edge
export const CIRC = 1 / SQ3; // centre to corner
export const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
export const NORMALS = DIRS.map((_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]);

export const center = (q, r) => [q + r / 2, (r * SQ3) / 2];

export function round(qf, rf) {
    const sf = -qf - rf;
    let q = Math.round(qf);
    let r = Math.round(rf);
    const s = Math.round(sf);
    const dq = Math.abs(q - qf);
    const dr = Math.abs(r - rf);
    const ds = Math.abs(s - sf);
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;
    return [q, r];
}

export function hexAt(x, y) {
    const r = (2 * y) / SQ3;
    return round(x - r / 2, r);
}

export const dist = (q1, r1, q2, r2) => (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;

// corner j at angle 30 + 60 j degrees; side i lies between corners i - 1 and i
export function corner(q, r, j) {
    const [x, y] = center(q, r);
    const a = ((30 + 60 * j) * Math.PI) / 180;
    return [x + Math.cos(a) * CIRC, y + Math.sin(a) * CIRC];
}

export function* ring(q, r, n) {
    if (n === 0) { yield [q, r]; return; }
    let cq = q + DIRS[4][0] * n;
    let cr = r + DIRS[4][1] * n;
    for (let i = 0; i < 6; i++) for (let k = 0; k < n; k++) {
        yield [cq, cr];
        cq += DIRS[i][0];
        cr += DIRS[i][1];
    }
}

export function* disk(q, r, n) {
    for (let k = 0; k <= n; k++) yield* ring(q, r, k);
}

export const key2 = (q, r) => (r + 4096) * 8192 + (q + 4096);
export const unkey2 = (k) => [(k % 8192) - 4096, Math.floor(k / 8192) - 4096];

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

// smooth value noise in the plane, for terrain
export function noise2(seed) {
    const h = (x, y) => {
        let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const s = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = s(x - x0);
        const fy = s(y - y0);
        const a = h(x0, y0) + (h(x0 + 1, y0) - h(x0, y0)) * fx;
        const b = h(x0, y0 + 1) + (h(x0 + 1, y0 + 1) - h(x0, y0 + 1)) * fx;
        return a + (b - a) * fy;
    };
}
