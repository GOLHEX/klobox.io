import { buildHexHealpix, healpixFaceToSphere, relaxPositions, stepLife } from './HexHealpix.js';

const latLon = (grid, c) => {
    const [x, y, z] = grid.positions.subarray(c * 3, c * 3 + 3);
    const lat = Math.round((Math.asin(z) * 180) / Math.PI);
    const lon = Math.round((((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360);
    return lat === 90 || lat === -90 ? `${lat}` : `${lat},${lon}`;
};

const hasNeighbor = (grid, a, b) => {
    for (let k = 0; k < grid.degree[a]; k++) if (grid.neighbors[a * 6 + k] === b) return true;
    return false;
};

describe('buildHexHealpix', () => {
    it.each([1, 2, 3, 7, 16])('N=%i has 12N²+2 cells: hexagons plus exactly 6 squares', (N) => {
        const grid = buildHexHealpix(N);
        expect(grid.count).toBe(12 * N * N + 2);
        const squares = [];
        for (let c = 0; c < grid.count; c++) {
            expect([4, 6]).toContain(grid.degree[c]);
            if (grid.degree[c] === 4) squares.push(latLon(grid, c));
        }
        expect(squares.sort()).toEqual(['-90', '0,135', '0,225', '0,315', '0,45', '90']);
    });

    it('N=1 is the truncated octahedron (8 hexagons, 6 squares)', () => {
        const grid = buildHexHealpix(1);
        expect(grid.count).toBe(14);
        expect(grid.degree.filter((d) => d === 6).length).toBe(8);
    });

    it('is a closed sphere: symmetric adjacency and V - E + F = 2', () => {
        const grid = buildHexHealpix(5);
        let edges = 0;
        for (let c = 0; c < grid.count; c++) {
            for (let k = 0; k < grid.degree[c]; k++) {
                expect(hasNeighbor(grid, grid.neighbors[c * 6 + k], c)).toBe(true);
                edges++;
            }
        }
        expect(grid.count - edges / 2 + grid.triangles.length / 3).toBe(2);
    });

    it('orders neighbours around each cell so consecutive ones touch', () => {
        const grid = buildHexHealpix(6);
        for (let c = 0; c < grid.count; c++) {
            const d = grid.degree[c];
            for (let k = 0; k < d; k++) {
                const a = grid.neighbors[c * 6 + k];
                const b = grid.neighbors[c * 6 + ((k + 1) % d)];
                expect(hasNeighbor(grid, a, b)).toBe(true);
            }
        }
    });

    it('keeps HEALPix equal-area cells, and relaxation keeps points on the sphere', () => {
        const grid = buildHexHealpix(8);
        const area = new Float64Array(grid.count);
        const p = grid.positions;
        const t = grid.triangles;
        for (let k = 0; k < t.length; k += 3) {
            const [a, b, c] = [t[k], t[k + 1], t[k + 2]];
            const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
            const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
            const s = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 6;
            area[a] += s;
            area[b] += s;
            area[c] += s;
        }
        const hex = [...area].filter((_, c) => grid.degree[c] === 6);
        expect(Math.max(...hex) / Math.min(...hex)).toBeLessThan(1.2);

        const relaxed = relaxPositions(grid, 20);
        for (let c = 0; c < grid.count; c++) {
            expect(Math.hypot(relaxed[c * 3], relaxed[c * 3 + 1], relaxed[c * 3 + 2])).toBeCloseTo(1, 9);
        }
    });

    it('maps HEALPix face corners to the poles', () => {
        expect(healpixFaceToSphere(0, 1, 1)[2]).toBeCloseTo(1);
        expect(healpixFaceToSphere(11, 0, 0)[2]).toBeCloseTo(-1);
    });
});

describe('stepLife', () => {
    it('applies B2/S34 using the neighbour table', () => {
        const grid = buildHexHealpix(4);
        const state = new Uint8Array(grid.count);
        const cell = grid.cellAt(4, 2, 2); // inside an equatorial face
        const [a, b] = [grid.neighbors[cell * 6], grid.neighbors[cell * 6 + 3]];
        state[a] = 1;
        state[b] = 1;
        const next = stepLife(grid, state, new Uint8Array(grid.count), 1 << 2, (1 << 3) | (1 << 4));
        expect(next[cell]).toBe(1); // born with exactly 2 live neighbours
        expect(next[a]).toBe(0); // dies with fewer than 3
    });
});
