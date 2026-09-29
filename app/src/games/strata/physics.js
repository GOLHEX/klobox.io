// A body moving freely through the voxel world: walk in any direction, step up
// stairs, hop onto one-block ledges, jump, fall (and get hurt by long falls),
// climb ladders, float and swim in deep water. Boxes come from World.boxes, so
// stairs are four quarter-steps and props are solid where they stand.

import { B } from './world.js';

export const PHYS = {
    G: 26, // gravity
    JUMP: 8.0, // clears a one-block ledge
    SPEED: 4.4,
    ACCEL: 36,
    AIR: 10,
    STEP: 0.55, // stepped up without jumping
    R: 0.26, // half width
    H: 1.2, // height: stays under two cells of headroom even on a stair
    CLIMB: 3.2,
    SWIM: 2.6,
    SAFE_FALL: 4.6,
    HOP_PUSH: 0.12, // push this long into a ledge to hop onto it
    COYOTE: 0.1,
};

export class Body {
    constructor(x, y, z) {
        Object.assign(this, { x, y, z, vx: 0, vy: 0, vz: 0 });
        this.grounded = false;
        this.climbing = null;
        this.swimming = false;
        this.wading = false;
        this.fallTop = z;
        this.push = 0;
        this.air = 0;
        this.leap = 0; // a jump out of water, free of buoyancy for a moment
        this.dash = 0; // while > 0 the body keeps its speed
        this.stun = 0; // while > 0 input is ignored
        this.safe = [x, y, z];
        this.facing = [1, 0];
    }
}

const tmp = [];
const tmp2 = [];

function tryMove(w, b, dx, dy, info) {
    const { R, H, STEP } = PHYS;
    const nx = b.x + dx;
    const ny = b.y + dy;
    const hits = w.boxes(nx - R, ny - R, b.z, nx + R, ny + R, b.z + H, tmp);
    if (!hits.length) {
        b.x = nx;
        b.y = ny;
        return true;
    }
    let top = -Infinity;
    for (const h of hits) top = Math.max(top, h[5]);
    info.top = Math.max(info.top, top);
    if ((b.grounded || b.swimming) && top > b.z && top - b.z <= STEP) {
        if (!w.boxes(nx - R, ny - R, top, nx + R, ny + R, top + H, tmp2).length) {
            b.x = nx;
            b.y = ny;
            b.z = top;
            return true;
        }
    }
    return false;
}

function waterSurface(w, x, y, z) {
    let s = z;
    while (w.water(x, y, s)) s++;
    return s;
}

// input: { mx, my } a world-space direction of length <= 1, jump: pressed now
export function stepBody(w, b, input, dt, events = []) {
    const { R, H, G } = PHYS;
    const fx = Math.floor(b.x);
    const fy = Math.floor(b.y);
    const wasGrounded = b.grounded;
    const wasSwimming = b.swimming;
    b.wading = w.water(fx, fy, Math.floor(b.z + 0.05));
    b.swimming = w.water(fx, fy, Math.floor(b.z + 0.7));
    if (b.swimming && !wasSwimming) {
        b.fallTop = b.z; // water breaks a fall
        if (b.vz < -2) events.push({ type: 'splash', speed: -b.vz });
    }
    b.stun = Math.max(0, b.stun - dt);
    b.dash = Math.max(0, b.dash - dt);
    b.leap = Math.max(0, b.leap - dt);
    let mx = b.stun > 0 ? 0 : input.mx ?? 0;
    let my = b.stun > 0 ? 0 : input.my ?? 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (len > 0.1) b.facing = [mx / Math.max(len, 1e-6), my / Math.max(len, 1e-6)];

    // ---- ladders
    const lad = w.ladderAt(b.x, b.y, b.z);
    if (!lad) b.climbing = null;
    else if (!b.climbing) {
        const toward = mx * lad.wall[0] + my * lad.wall[1];
        const lateral = Math.abs(mx * lad.wall[1] - my * lad.wall[0]);
        const grab = (toward > 0.35 && (b.grounded || b.swimming)) || (!b.grounded && b.vz <= 1 && b.z > lad.bottom + 0.3 && b.dash === 0 && lateral < 0.6);
        if (grab) b.climbing = lad;
    }
    if (b.climbing) return climb(w, b, mx, my, input, dt, events);

    // ---- walking, swimming, in the air
    const speed = b.swimming ? PHYS.SWIM : b.wading ? PHYS.SPEED * 0.72 : PHYS.SPEED;
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
        if (b.swimming) {
            b.vz = PHYS.JUMP * 1.1;
            b.leap = 0.4;
            jumped = true;
        } else if (b.grounded || b.air < PHYS.COYOTE) {
            b.vz = PHYS.JUMP;
            b.grounded = false;
            b.air = PHYS.COYOTE;
            jumped = true;
            events.push({ type: 'jump' });
        }
    }

    const info = { top: -Infinity };
    let blocked = false;
    if (!tryMove(w, b, b.vx * dt, 0, info)) { b.vx = 0; blocked = true; }
    if (!tryMove(w, b, 0, b.vy * dt, info)) { b.vy = 0; blocked = true; }
    // pushing into a ledge one block high (two from the water) hops onto it
    const reach = b.swimming ? 2.3 : 1.05;
    if (blocked && len > 0.5 && (b.grounded || b.swimming) && info.top - b.z <= reach && b.stun === 0) {
        b.push += dt;
        if (b.push > PHYS.HOP_PUSH) {
            b.vz = b.swimming ? 11.2 : PHYS.JUMP;
            if (b.swimming) b.leap = 0.4;
            b.grounded = false;
            b.push = 0;
            jumped = true;
            events.push({ type: 'hop' });
        }
    } else b.push = 0;

    // ---- vertical
    if (b.swimming && !jumped && b.leap === 0) {
        const target = waterSurface(w, fx, fy, Math.floor(b.z + 0.7)) - 0.9;
        const want = (target - b.z) * 5;
        b.vz += (want - b.vz) * Math.min(1, dt * 8);
    } else b.vz = Math.max(-30, b.vz - G * dt);
    const dz = b.vz * dt;
    b.grounded = false;
    if (dz < 0) {
        const hits = w.boxes(b.x - R, b.y - R, b.z + dz, b.x + R, b.y + R, b.z, tmp);
        if (hits.length) {
            let top = -Infinity;
            for (const h of hits) top = Math.max(top, h[5]);
            b.z = top;
            b.vz = 0;
            b.grounded = true;
        } else b.z += dz;
    } else if (dz > 0) {
        const hits = w.boxes(b.x - R, b.y - R, b.z + H, b.x + R, b.y + R, b.z + H + dz, tmp);
        if (hits.length) {
            let bottom = Infinity;
            for (const h of hits) bottom = Math.min(bottom, h[2]);
            b.z = bottom - H;
            b.vz = 0;
        } else b.z += dz;
    }
    // stick to the ground walking down stairs
    if (!b.grounded && wasGrounded && !jumped && b.vz <= 0 && !b.swimming) {
        const hits = w.boxes(b.x - R, b.y - R, b.z - 0.36, b.x + R, b.y + R, b.z, tmp);
        if (hits.length) {
            let top = -Infinity;
            for (const h of hits) top = Math.max(top, h[5]);
            b.z = top;
            b.vz = 0;
            b.grounded = true;
        }
    }
    land(w, b, wasGrounded, events, dt);
    return events;
}

function climb(w, b, mx, my, input, dt, events) {
    const lad = b.climbing;
    const [wx, wy] = lad.wall;
    const toward = mx * wx + my * wy;
    const lateral = Math.abs(mx * wy - my * wx);
    // pushing sideways lets go
    if (lateral > 0.6 && Math.abs(toward) < 0.35) {
        b.climbing = null;
        b.vx = mx * 2;
        b.vy = my * 2;
        return events;
    }
    if (input.jump) {
        b.climbing = null;
        b.vz = PHYS.JUMP * 0.55;
        b.vx = -wx * 3;
        b.vy = -wy * 3;
        b.z += 0.01;
        events.push({ type: 'jump' });
        return events;
    }
    // hug the column: centred along the wall, pressed against it
    if (wx !== 0) b.y += (lad.y + 0.5 - b.y) * Math.min(1, dt * 10);
    else b.x += (lad.x + 0.5 - b.x) * Math.min(1, dt * 10);
    b.vx = 0;
    b.vy = 0;
    b.vz = toward > 0.25 ? PHYS.CLIMB : toward < -0.25 ? -PHYS.CLIMB : 0;
    const info = { top: -Infinity };
    const wasGrounded = b.grounded;
    // step onto the top once level with it, else lean on the wall
    const onTop = b.z >= lad.top - 0.03;
    tryMove(w, b, wx * (onTop && toward > 0.25 ? PHYS.SPEED : 1.2) * dt, wy * (onTop && toward > 0.25 ? PHYS.SPEED : 1.2) * dt, info);
    const dz = b.vz * dt;
    b.grounded = false;
    if (dz < 0) {
        const hits = w.boxes(b.x - PHYS.R, b.y - PHYS.R, b.z + dz, b.x + PHYS.R, b.y + PHYS.R, b.z, tmp);
        if (hits.length) {
            let top = -Infinity;
            for (const h of hits) top = Math.max(top, h[5]);
            b.z = top;
            b.grounded = true;
            if (toward < -0.25) b.climbing = null; // down at the foot: walk off
        } else b.z += dz;
    } else b.z = Math.min(b.z + dz, lad.top + 0.02);
    b.vz = 0;
    if (b.x < lad.x - 0.02 || b.x > lad.x + 1.02 || b.y < lad.y - 0.02 || b.y > lad.y + 1.02) b.climbing = null;
    b.fallTop = b.z;
    land(w, b, wasGrounded, events, dt);
    return events;
}

function land(w, b, wasGrounded, events, dt) {
    if (b.grounded) {
        b.air = 0;
        if (!wasGrounded && !b.swimming) {
            const fall = b.fallTop - b.z;
            if (fall > PHYS.SAFE_FALL) events.push({ type: 'fall', dmg: Math.ceil((fall - PHYS.SAFE_FALL) / 2.5), height: fall });
            else if (fall > 1.2) events.push({ type: 'land', height: fall });
        }
        b.fallTop = b.z;
        // remember solid footing to return to after a fall into the void or lava
        const x = Math.floor(b.x);
        const y = Math.floor(b.y);
        const z = Math.round(b.z);
        if (Math.abs(b.z - z) < 0.01 && w.isFlat(x, y, z) && w.isFlat(x + 1, y, z) + w.isFlat(x - 1, y, z) + w.isFlat(x, y + 1, z) + w.isFlat(x, y - 1, z) >= 3) b.safe = [x + 0.5, y + 0.5, z];
    } else {
        b.air += dt;
        b.fallTop = Math.max(b.fallTop, b.z);
    }
    if (b.swimming) b.fallTop = b.z;
    if (w.get(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z + 0.1)) === B.LAVA) events.push({ type: 'lava' });
    if (b.z < -4) events.push({ type: 'void' });
}

// put a body back on its last safe footing
export function respawn(b) {
    [b.x, b.y, b.z] = b.safe;
    b.vx = b.vy = b.vz = 0;
    b.climbing = null;
    b.fallTop = b.z;
}
