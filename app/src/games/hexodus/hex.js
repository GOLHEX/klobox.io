// Hex grid core after Red Blob Games, "Hexagonal Grids"
// (https://www.redblobgames.com/grids/hexagons/): axial coordinates (q, r) with
// s = -q - r, pointy-top layout, distance, rings and cube rounding.

const SQRT3 = Math.sqrt(3);

// Axial direction vectors in Red Blob order.
export const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// Numeric key for a Map; |q|, |r| < 32768.
export const key = (q, r) => (q + 32768) * 65536 + (r + 32768);

export function distance(q, r) {
    return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

// cube_ring: start `radius` steps out along direction 4, then walk the 6 sides.
// Cell i of the ring lies on side floor(i / radius).
export function ring(radius) {
    if (radius === 0) return [[0, 0]];
    const out = [];
    let q = DIRECTIONS[4][0] * radius;
    let r = DIRECTIONS[4][1] * radius;
    for (let side = 0; side < 6; side++) {
        for (let j = 0; j < radius; j++) {
            out.push([q, r]);
            q += DIRECTIONS[side][0];
            r += DIRECTIONS[side][1];
        }
    }
    return out;
}

export function hexToPixel(q, r, size = 1) {
    return [size * (SQRT3 * q + (SQRT3 / 2) * r), size * 1.5 * r];
}

export function round(fq, fr) {
    const fs = -fq - fr;
    let q = Math.round(fq);
    let r = Math.round(fr);
    const s = Math.round(fs);
    const dq = Math.abs(q - fq);
    const dr = Math.abs(r - fr);
    const ds = Math.abs(s - fs);
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;
    return [q + 0, r + 0]; // + 0 turns -0 into 0
}

export function pixelToHex(x, y, size = 1) {
    return round(((SQRT3 / 3) * x - y / 3) / size, ((2 / 3) * y) / size);
}

// Corner offsets of a pointy-top hex (corner i at 60i - 30 degrees).
export function corners(size = 1) {
    return Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 180) * (60 * i - 30);
        return [size * Math.cos(a), size * Math.sin(a)];
    });
}
