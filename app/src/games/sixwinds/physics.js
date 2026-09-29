// A round body on hexagonal columns. The body is a circle in the plane and a
// height up; each hex column is the intersection of three slabs, so a circle
// overlaps it when it is within inradius + r along all three edge normals, and
// is pushed out along the axis of deepest overlap, which slides it along walls.
// One layer up is a stair and is stepped automatically; two layers is a ledge
// the body hops onto when pushed into it; more is a wall.

import { INR, LAYER, NORMALS, DIRS, hexAt, center } from './hex.js';
import { MAT, M } from './world.js';

export const PHYS = { G: 24, JUMP: 7.4, SPEED: 4.6, ACCEL: 34, AIR: 10, STEP: 0.56, R: 0.27, H: 1.2, SWIM: 2.4, SAFE_FALL: 4.5, HOP: 0.12 };

export class Body {
    constructor(x, y, z) {
        Object.assign(this, { x, y, z, vx: 0, vy: 0, vz: 0 });
        this.grounded = false;
        this.swimming = false;
        this.fallTop = z;
        this.push = 0;
        this.air = 0;
        this.leap = 0;
        this.dash = 0;
        this.stun = 0;
        this.safe = [x, y, z];
        this.facing = [1, 0];
    }
}

const AX = [NORMALS[0], NORMALS[1], NORMALS[2]];

// columns whose hexagon overlaps a circle at (x, y)
function overlaps(x, y, r, out) {
    out.length = 0;
    const [q0, r0] = hexAt(x, y);
    for (let i = -1; i < 6; i++) {
        const q = i < 0 ? q0 : q0 + DIRS[i][0];
        const rr = i < 0 ? r0 : r0 + DIRS[i][1];
        const [cx, cy] = center(q, rr);
        const dx = x - cx;
        const dy = y - cy;
        let best = -1;
        let bk = 0;
        let bs = 1;
        for (let k = 0; k < 3; k++) {
            const p = dx * AX[k][0] + dy * AX[k][1];
            if (Math.abs(p) > best) { best = Math.abs(p); bk = k; bs = p >= 0 ? 1 : -1; }
        }
        const pen = INR + r - best;
        if (pen > 0) out.push({ q, r: rr, pen, nx: AX[bk][0] * bs, ny: AX[bk][1] * bs });
    }
    return out;
}

const solidAt = (w, q, r, k) => MAT[w.get(q, r, k)].solid === true || w.blockers.has(((k * 8192 + (r + 4096)) * 8192) + (q + 4096));

// top (world z) of the highest solid layer of a column meeting [z0, z1), or -Infinity
function topIn(w, q, r, z0, z1) {
    const k0 = Math.floor(z0 / LAYER + 1e-6);
    const k1 = Math.floor(z1 / LAYER - 1e-6);
    for (let k = k1; k >= k0; k--) if (solidAt(w, q, r, k)) return (k + 1) * LAYER;
    return -Infinity;
}

// bottom (world z) of the lowest solid layer of a column meeting [z0, z1), or Infinity
function bottomIn(w, q, r, z0, z1) {
    const k0 = Math.floor(z0 / LAYER + 1e-6);
    const k1 = Math.floor(z1 / LAYER - 1e-6);
    for (let k = k0; k <= k1; k++) if (solidAt(w, q, r, k)) return k * LAYER;
    return Infinity;
}

const tmp = [];

function moveH(w, b, dx, dy, info) {
    const { R, H, STEP } = PHYS;
    let x = b.x + dx;
    let y = b.y + dy;
    let z = b.z;
    let blocked = false;
    for (let it = 0; it < 5; it++) {
        let worst = null;
        let step = -Infinity;
        for (const c of overlaps(x, y, R, tmp)) {
            const top = topIn(w, c.q, c.r, z + 0.01, z + H);
            if (top === -Infinity) continue;
            if ((b.grounded || b.swimming) && top - z <= STEP && topIn(w, c.q, c.r, top + 0.01, top + H) === -Infinity) {
                step = Math.max(step, top);
                continue;
            }
            info.top = Math.max(info.top, top + (topIn(w, c.q, c.r, top + 0.01, top + H) === -Infinity ? 0 : 99));
            if (!worst || c.pen > worst.pen) worst = { ...c };
        }
        if (step > z) { z = step; continue; }
        if (!worst) break;
        x += worst.nx * (worst.pen + 1e-4);
        y += worst.ny * (worst.pen + 1e-4);
        blocked = true;
    }
    // give up on a position still inside something
    for (const c of overlaps(x, y, R, tmp)) if (topIn(w, c.q, c.r, z + 0.01, z + H) !== -Infinity) return blocked || true;
    b.x = x;
    b.y = y;
    b.z = z;
    return blocked;
}

function surfaceAbove(w, q, r, k) {
    while (w.get(q, r, k) === M.WATER) k++;
    return k * LAYER;
}

// input: { mx, my } a world direction of length <= 1, jump: pressed now
export function stepBody(w, b, input, dt, events = []) {
    const { R, H, G } = PHYS;
    const wasGrounded = b.grounded;
    const wasSwimming = b.swimming;
    const [q, r] = hexAt(b.x, b.y);
    b.swimming = w.get(q, r, Math.floor((b.z + 0.62) / LAYER)) === M.WATER;
    if (b.swimming && !wasSwimming) {
        b.fallTop = b.z;
        if (b.vz < -2) events.push({ type: 'splash', speed: -b.vz });
    }
    b.stun = Math.max(0, b.stun - dt);
    b.dash = Math.max(0, b.dash - dt);
    b.leap = Math.max(0, b.leap - dt);
    let mx = b.stun > 0 ? 0 : input.mx ?? 0;
    let my = b.stun > 0 ? 0 : input.my ?? 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.1) b.facing = [mx / len, my / len];

    const speed = (b.swimming ? PHYS.SWIM : PHYS.SPEED) * (b.speedMul ?? 1);
    if (b.dash === 0) {
        const acc = (b.grounded || b.swimming ? PHYS.ACCEL : PHYS.AIR) * dt;
        const dvx = mx * speed - b.vx;
        const dvy = my * speed - b.vy;
        const dl = Math.hypot(dvx, dvy);
        const k = dl > acc ? acc / dl : 1;
        b.vx += dvx * k;
        b.vy += dvy * k;
    }
    let jumped = false;
    if (input.jump) {
        if (b.swimming) { b.vz = PHYS.JUMP; b.leap = 0.4; jumped = true; }
        else if (b.grounded || b.air < 0.1) { b.vz = PHYS.JUMP; b.grounded = false; b.air = 1; jumped = true; events.push({ type: 'jump' }); }
    }
    const info = { top: -Infinity };
    const blocked = moveH(w, b, b.vx * dt, b.vy * dt, info);
    if (blocked) {
        // lose the speed that went into the wall
        const s = Math.hypot(b.vx, b.vy);
        if (s > 0) { b.vx *= 0.6; b.vy *= 0.6; }
    }
    // hop onto a ledge of two layers (from water, up to four) when pushing into it
    const reach = b.swimming ? 2.3 : 1.05;
    if (blocked && len > 0.5 && (b.grounded || b.swimming) && info.top - b.z <= reach && info.top > b.z && b.stun === 0) {
        b.push += dt;
        if (b.push > PHYS.HOP) {
            b.vz = b.swimming ? 11 : PHYS.JUMP;
            if (b.swimming) b.leap = 0.4;
            b.grounded = false;
            b.push = 0;
            jumped = true;
            events.push({ type: 'hop' });
        }
    } else b.push = 0;

    // vertical
    if (b.swimming && !jumped && b.leap === 0) {
        const [qq, rr] = hexAt(b.x, b.y);
        const target = surfaceAbove(w, qq, rr, Math.floor((b.z + 0.62) / LAYER)) - 0.78;
        b.vz += ((target - b.z) * 5 - b.vz) * Math.min(1, dt * 8);
    } else b.vz = Math.max(-30, b.vz - G * dt);
    const dz = b.vz * dt;
    b.grounded = false;
    if (dz < 0) {
        let top = -Infinity;
        for (const c of overlaps(b.x, b.y, R - 0.03, tmp)) top = Math.max(top, topIn(w, c.q, c.r, b.z + dz, b.z + 0.001));
        if (top > -Infinity) { b.z = top; b.vz = 0; b.grounded = true; } else b.z += dz;
    } else if (dz > 0) {
        let bottom = Infinity;
        for (const c of overlaps(b.x, b.y, R - 0.03, tmp)) bottom = Math.min(bottom, bottomIn(w, c.q, c.r, b.z + H, b.z + H + dz));
        if (bottom < Infinity) { b.z = bottom - H; b.vz = 0; } else b.z += dz;
    }
    // keep to the ground walking down steps
    if (!b.grounded && wasGrounded && !jumped && b.vz <= 0 && !b.swimming) {
        let top = -Infinity;
        for (const c of overlaps(b.x, b.y, R - 0.03, tmp)) top = Math.max(top, topIn(w, c.q, c.r, b.z - 0.56, b.z + 0.001));
        if (top > -Infinity) { b.z = top; b.vz = 0; b.grounded = true; }
    }
    if (b.grounded) {
        b.air = 0;
        if (!wasGrounded && !b.swimming) {
            const fall = b.fallTop - b.z;
            if (fall > PHYS.SAFE_FALL) events.push({ type: 'fall', dmg: Math.ceil((fall - PHYS.SAFE_FALL) / 2), height: fall });
            else if (fall > 1.2) events.push({ type: 'land', height: fall });
        }
        b.fallTop = b.z;
        const [sq, sr] = hexAt(b.x, b.y);
        if (w.node(sq, sr, Math.round(b.z / LAYER))) {
            const [cx, cy] = center(sq, sr);
            b.safe = [cx, cy, b.z];
        }
    } else {
        b.air += dt;
        b.fallTop = Math.max(b.fallTop, b.z);
    }
    if (b.swimming) b.fallTop = b.z;
    if (b.z < -3) events.push({ type: 'void' });
    return events;
}

export function respawn(b) {
    [b.x, b.y, b.z] = b.safe;
    b.vx = b.vy = b.vz = 0;
    b.fallTop = b.z;
}
