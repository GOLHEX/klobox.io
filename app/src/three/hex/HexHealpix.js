// Hex grid on the sphere built on the HEALPix layout (12 base rhombi).
//
// Cells are the VERTICES of a HEALPix pixelisation with Nside = N (the corners of
// its pixels, not the pixel centres). Every HEALPix pixel is a quad; we add one
// diagonal per quad, parallel to the short diagonal of its base rhombus. The quad
// mesh becomes a triangle mesh, and its dual is a tiling by hexagons plus exactly
// 6 squares (degree-4 cells): the two poles and four points on the equator at
// phi = 45°, 135°, 225°, 315°. No pentagons. Topologically this is the octahedral
// Goldberg polyhedron GP_O(N, N); N = 1 gives the truncated octahedron.
//
// Euler (V - E + F = 2) forces sum(6 - neighbours) = 12 over the cells, so the
// defect cannot vanish, only move: 12 pentagons (icosahedron, H3), 6 squares
// (this grid, HEALPix / octahedron), or 4 triangles (tetrahedron).
//
// Inside each base rhombus a cell has local lattice coordinates (i, j) in
// [0, N]^2, which are the usual axial hex coordinates:
//   polar faces      q = i, r =  j   (diagonal neighbour direction (+1, -1))
//   equatorial faces q = i, r = -j   (diagonal neighbour direction (+1, +1))
// and s = -q - r. The neighbour table handles the seams between rhombi.

// HEALPix base-face tables (Gorski et al. 2005): ring and phi offsets of each face.
const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];

export const FACE_COUNT = 12;

export function isPolarFace(face) {
    return face < 4 || face > 7;
}

// z = cos(colatitude) of the HEALPix iso-latitude ring at ring coordinate jr in
// [0, 4] (0 = north pole, 2 = equator, 4 = south pole). Continuous in jr.
export function healpixRingZ(jr) {
    if (jr < 1) return 1 - (jr * jr) / 3;
    if (jr > 3) return ((4 - jr) * (4 - jr)) / 3 - 1;
    return (2 - jr) * (2 / 3);
}

// Continuous HEALPix map: base face + (x, y) in [0,1]^2 -> unit vector.
// (x, y) = (1, 1) of faces 0-3 is the north pole, (0, 0) of faces 8-11 the south pole.
export function healpixFaceToSphere(face, x, y) {
    const jr = JRLL[face] - x - y; // ring coordinate in [0, 4], 0 = north pole
    const z = healpixRingZ(jr);
    const nr = Math.min(jr, 1, 4 - jr);
    const phi = nr > 0 ? (Math.PI / 4) * (JPLL[face] + (x - y) / nr) : 0;
    const rho = Math.sqrt(Math.max(0, 1 - z * z));
    return [rho * Math.cos(phi), rho * Math.sin(phi), z];
}

// HEALPix projection plane (Calabretta & Roukema 2007): the picture with 12
// diamonds in 3 rows. It is linear in face coordinates.
export function healpixFaceToPlane(face, x, y) {
    return [
        (Math.PI / 4) * (JPLL[face] + x - y),
        (Math.PI / 4) * (x + y + 2 - JRLL[face]),
    ];
}

// Integer identity of the HEALPix vertex at lattice point (i, j) of a face, so the
// same point reached from different faces gets the same key.
function vertexKey(N, face, i, j) {
    const ring = JRLL[face] * N - i - j; // 0 .. 4N
    const nr = Math.min(ring, N, 4 * N - ring);
    if (nr === 0) return `${ring}`;
    const m = 8 * nr;
    const k = (((JPLL[face] * nr + i - j) % m) + m) % m;
    return `${ring}:${k}`;
}

// Local lattice steps inside a face. Polar faces have their 60° corners at
// (0,0) and (N,N); equatorial faces at (N,0) and (0,N).
function faceSteps(face) {
    const d = isPolarFace(face) ? [1, -1] : [1, 1];
    return [[1, 0], [-1, 0], [0, 1], [0, -1], d, [-d[0], -d[1]]];
}

export function buildHexHealpix(N) {
    if (!Number.isInteger(N) || N < 1) throw new Error('N must be a positive integer');

    const count = 12 * N * N + 2;
    const index = new Map();
    const faceIndex = new Int32Array(FACE_COUNT * (N + 1) * (N + 1));
    const positions = new Float64Array(count * 3);
    const home = new Int32Array(count * 3); // face, i, j where the cell was first met
    const ring = new Int32Array(count); // iso-latitude ring, 0 (north pole) .. 4N (south pole)
    let next = 0;

    for (let f = 0; f < FACE_COUNT; f++) {
        for (let i = 0; i <= N; i++) {
            for (let j = 0; j <= N; j++) {
                const key = vertexKey(N, f, i, j);
                let id = index.get(key);
                if (id === undefined) {
                    id = next++;
                    index.set(key, id);
                    positions.set(healpixFaceToSphere(f, i / N, j / N), id * 3);
                    home.set([f, i, j], id * 3);
                    ring[id] = JRLL[f] * N - i - j;
                }
                faceIndex[(f * (N + 1) + i) * (N + 1) + j] = id;
            }
        }
    }
    if (next !== count) throw new Error(`expected ${count} cells, got ${next}`);

    const cellAt = (f, i, j) => faceIndex[(f * (N + 1) + i) * (N + 1) + j];

    // Adjacency from the lattice steps of every face; seams are shared automatically.
    const adjacency = Array.from({ length: count }, () => new Set());
    for (let f = 0; f < FACE_COUNT; f++) {
        const steps = faceSteps(f);
        for (let i = 0; i <= N; i++) {
            for (let j = 0; j <= N; j++) {
                const a = cellAt(f, i, j);
                for (const [di, dj] of steps) {
                    const ni = i + di;
                    const nj = j + dj;
                    if (ni < 0 || nj < 0 || ni > N || nj > N) continue;
                    adjacency[a].add(cellAt(f, ni, nj));
                }
            }
        }
    }

    // Triangles: every HEALPix pixel split along its face's short diagonal.
    const triangles = new Int32Array(FACE_COUNT * N * N * 2 * 3);
    let t = 0;
    for (let f = 0; f < FACE_COUNT; f++) {
        const polar = isPolarFace(f);
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < N; j++) {
                const a = cellAt(f, i, j);
                const b = cellAt(f, i + 1, j);
                const c = cellAt(f, i + 1, j + 1);
                const d = cellAt(f, i, j + 1);
                if (polar) triangles.set([a, b, d, b, c, d], t);
                else triangles.set([a, b, c, a, c, d], t);
                t += 6;
            }
        }
    }

    // Neighbours sorted counter-clockwise around each cell (seen from outside), so
    // "straight ahead" from neighbour k is neighbour k + degree / 2.
    const neighbors = new Int32Array(count * 6).fill(-1);
    const degree = new Uint8Array(count);
    for (let c = 0; c < count; c++) {
        const [px, py, pz] = positions.subarray(c * 3, c * 3 + 3);
        // Tangent basis at c.
        let ux = -py;
        let uy = px;
        let uz = 0;
        if (Math.abs(pz) > 0.99) {
            ux = 1;
            uy = 0;
            uz = 0;
        }
        const ul = Math.hypot(ux, uy, uz);
        ux /= ul; uy /= ul; uz /= ul;
        const vx = py * uz - pz * uy;
        const vy = pz * ux - px * uz;
        const vz = px * uy - py * ux;
        const list = [...adjacency[c]].map((n) => {
            const dx = positions[n * 3] - px;
            const dy = positions[n * 3 + 1] - py;
            const dz = positions[n * 3 + 2] - pz;
            return [Math.atan2(dx * vx + dy * vy + dz * vz, dx * ux + dy * uy + dz * uz), n];
        });
        list.sort((p, q) => p[0] - q[0]);
        degree[c] = list.length;
        list.forEach(([, n], k) => {
            neighbors[c * 6 + k] = n;
        });
    }

    return { N, count, positions, neighbors, degree, triangles, home, ring, cellAt };
}

// HEALPix positions give (almost exactly) equal-area cells but stretched hexagons.
// Spring relaxation toward one edge length makes the hexagons rounder at the cost of
// equal area. Returns new positions; the topology is unchanged.
export function relaxPositions(grid, iterations = 100, step = 0.5) {
    const { count, neighbors, degree } = grid;
    const p = Float64Array.from(grid.positions);
    const force = new Float64Array(p.length);
    const target = Math.sqrt((8 * Math.PI) / Math.sqrt(3) / count); // hex spacing covering 4π
    for (let it = 0; it < iterations; it++) {
        force.fill(0);
        for (let c = 0; c < count; c++) {
            for (let k = 0; k < degree[c]; k++) {
                const n = neighbors[c * 6 + k];
                const dx = p[n * 3] - p[c * 3];
                const dy = p[n * 3 + 1] - p[c * 3 + 1];
                const dz = p[n * 3 + 2] - p[c * 3 + 2];
                const d = Math.hypot(dx, dy, dz);
                const s = (d - target) / d;
                force[c * 3] += dx * s;
                force[c * 3 + 1] += dy * s;
                force[c * 3 + 2] += dz * s;
            }
        }
        for (let c = 0; c < count; c++) {
            const x = p[c * 3] + (force[c * 3] * step) / 6;
            const y = p[c * 3 + 1] + (force[c * 3 + 1] * step) / 6;
            const z = p[c * 3 + 2] + (force[c * 3 + 2] * step) / 6;
            const l = Math.hypot(x, y, z);
            p[c * 3] = x / l;
            p[c * 3 + 1] = y / l;
            p[c * 3 + 2] = z / l;
        }
    }
    return p;
}

// One Game of Life step on any cell graph. birth / survive are bitmasks over the
// number of live neighbours, e.g. B2/S34 -> birth = 1 << 2, survive = (1 << 3) | (1 << 4).
export function stepLife(grid, state, out, birth, survive) {
    const { count, neighbors, degree } = grid;
    for (let c = 0; c < count; c++) {
        let alive = 0;
        for (let k = 0; k < degree[c]; k++) alive += state[neighbors[c * 6 + k]];
        const mask = state[c] ? survive : birth;
        out[c] = (mask >> alive) & 1;
    }
    return out;
}
