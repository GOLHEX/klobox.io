// Six Winds models, built from primitives with colours baked into the vertices
// (attributes color and emit), so scenes merge into a few meshes. The ink lines
// are not modelled: the renderer draws them from depth and normals.
//
// Props sit on the centre of their hex, origin on the floor. Directional props
// take p.dir, the hex side (0..5) they face.

import * as THREE from 'three';
import { center, LAYER, NORMALS, CIRC } from './hex.js';

const PLACEHOLDER = new THREE.MeshBasicMaterial();

export function rng(seed) {
    let a = (seed * 2654435761) >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const C = {
    wood: 0x8a6446, dark: 0x5e4535, light: 0xc49a6c, stone: 0xe0d8c6, rock: 0xa9a6a0, iron: 0x5a6068, gold: 0xe6b73c,
    red: 0xc9483e, teal: 0x4f9e9e, blue: 0x3f95b8, cream: 0xeee2c8, ochre: 0xe0a94e, leaf: 0x7fa85a, leaf2: 0x5f8a45,
    orange: 0xe8892e, ink: 0x22262a, white: 0xf6f2ea, flame: 0xffc45a, mint: 0x6ff5cf, sail: 0xefe6d2, skin: 0xf2d2b0,
};

export function paint(geo, color, emit = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('emit', new THREE.BufferAttribute(new Float32Array(n).fill(emit), 1));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
}

export class Kit {
    constructor(seed = 1) {
        this.g = new THREE.Group();
        this.r = rng(seed);
    }

    add(geo, color, x = 0, y = 0, z = 0, o = {}, parent = this.g) {
        const m = new THREE.Mesh(paint(geo, color, o.emit ?? 0), PLACEHOLDER);
        m.position.set(x, y, z);
        if (o.rot) m.rotation.set(...o.rot);
        if (o.scale) m.scale.set(...o.scale);
        parent.add(m);
        return m;
    }

    box(w, d, h, c, x, y, z, o, p) { return this.add(new THREE.BoxGeometry(w, d, h), c, x, y, z, o, p); }
    ball(r, c, x, y, z, o = {}, p) { return this.add(new THREE.SphereGeometry(r, o.seg ?? 10, o.seg2 ?? 7), c, x, y, z, o, p); }
    ico(r, c, x, y, z, o = {}, p) { return this.add(new THREE.IcosahedronGeometry(r, o.detail ?? 0), c, x, y, z, o, p); }
    cyl(rt, rb, h, c, x, y, z, o = {}, p) { return this.add(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 8).rotateX(Math.PI / 2), c, x, y, z, o, p); }
    cone(r, h, c, x, y, z, o = {}, p) { return this.add(new THREE.ConeGeometry(r, h, o.seg ?? 7).rotateX(Math.PI / 2), c, x, y, z, o, p); }
    torus(r, t, c, x, y, z, o = {}, p) { return this.add(new THREE.TorusGeometry(r, t, o.seg ?? 6, o.seg2 ?? 16), c, x, y, z, o, p); }
    hexp(r, h, c, x, y, z, o = {}, p) { return this.add(new THREE.CylinderGeometry(r, r, h, 6).rotateX(Math.PI / 2).rotateZ(Math.PI / 6), c, x, y, z, o, p); }
    group(x = 0, y = 0, z = 0, parent = this.g) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    flame(x, y, z, s = 1, p) {
        this.cone(0.1 * s, 0.3 * s, C.flame, x, y, z + 0.15 * s, { emit: 1, seg: 6 }, p);
        this.cone(0.05 * s, 0.18 * s, 0xfff2b0, x, y, z + 0.1 * s, { emit: 1, seg: 6 }, p);
    }
}

// facing a hex side: the model's +x axis points at side dir
const faceAngle = (dir) => (dir * Math.PI) / 3;

function placed(k, p) {
    const [x, y] = center(p.q, p.r);
    k.g.position.set(x, y, p.z * LAYER);
    if (p.dir !== undefined) k.g.rotation.z = faceAngle(p.dir);
    else k.g.rotation.z = k.r() * Math.PI * 2;
    return k.g;
}

const PROP = {
    palm(k) {
        const { r } = k;
        const h = 2.2 + r() * 1.2;
        const lean = (r() - 0.5) * 0.5;
        const trunk = k.group(0, 0, 0);
        trunk.rotation.x = lean;
        for (let i = 0; i < 6; i++) k.cyl(0.11 - i * 0.008, 0.13 - i * 0.008, h / 6 + 0.02, i % 2 ? 0x9a7a55 : 0x8a6a48, 0, 0, (i + 0.5) * (h / 6), { seg: 6 }, trunk);
        for (let i = 0; i < 7; i++) {
            const leaf = k.group(0, 0, h, trunk);
            leaf.rotation.z = (i / 7) * Math.PI * 2 + r() * 0.4;
            k.box(1.1, 0.26, 0.04, i % 2 ? C.leaf : C.leaf2, 0.5, 0, -0.18, { rot: [0, 0.45, 0] }, leaf);
        }
        k.ball(0.12, 0x6b4a35, 0.1, 0.05, h - 0.1, {}, trunk);
    },
    palm_small(k) {
        for (let i = 0; i < 5; i++) { const l = k.group(0, 0, 0.3); l.rotation.z = i * 1.25; k.box(0.5, 0.16, 0.03, C.leaf, 0.22, 0, 0, { rot: [0, -0.5, 0] }, l); }
    },
    tree(k) {
        const { r } = k;
        k.cyl(0.12, 0.18, 1.3, 0x6b4a35, 0, 0, 0.65, { seg: 6 });
        const c = [C.leaf, C.leaf2, 0x8fb86a][Math.floor(r() * 3)];
        k.ico(0.75, c, 0, 0, 1.75, { detail: 1 });
        k.ico(0.5, c, 0.3, 0.2, 2.3, { detail: 1 });
        k.ico(0.45, c, -0.35, -0.1, 2.0, { detail: 1 });
    },
    autumn_tree(k) {
        const { r } = k;
        k.cyl(0.1, 0.15, 1.4, 0x5e4535, 0, 0, 0.7, { seg: 6 });
        const c = [C.orange, 0xd86a2a, 0xf0a04a][Math.floor(r() * 3)];
        k.ico(0.7, c, 0, 0, 1.8, { detail: 1 });
        k.ico(0.45, c, 0.3, -0.2, 2.3, { detail: 1 });
    },
    bush(k) { k.ico(0.34, C.leaf, 0, 0, 0.28, { detail: 1 }); k.ico(0.24, C.leaf2, 0.2, 0.1, 0.22, { detail: 1 }); },
    grass(k) { const { r } = k; for (let i = 0; i < 6; i++) k.cone(0.04, 0.3, 0x7f9a4a, (r() - 0.5) * 0.7, (r() - 0.5) * 0.7, 0.15, { seg: 3 }); },
    flowers(k) { const { r } = k; for (let i = 0; i < 4; i++) { const x = (r() - 0.5) * 0.6; const y = (r() - 0.5) * 0.6; k.cyl(0.015, 0.015, 0.26, 0x5f7f35, x, y, 0.13, { seg: 3 }); k.ball(0.06, [C.white, C.red, 0xf0c04a, 0xb07cd6][i], x, y, 0.28, { seg: 5, seg2: 4 }); } },
    rock(k) { const { r } = k; k.ico(0.38, C.rock, 0, 0, 0.25, { rot: [r() * 3, r() * 3, r() * 3], scale: [1, 1, 0.7] }); },
    shell(k) { k.cone(0.12, 0.1, 0xf2d8c8, 0, 0, 0.05, { seg: 7, rot: [0.3, 0, 0] }); },
    driftwood(k) { k.cyl(0.07, 0.09, 0.9, 0xb8a080, 0, 0, 0.06, { rot: [0, Math.PI / 2, 0.4], seg: 5 }); },
    crate(k) { k.box(0.62, 0.62, 0.62, 0xc49a6c, 0, 0, 0.31); k.box(0.64, 0.08, 0.64, C.wood, 0, 0, 0.31, { rot: [0, Math.PI / 4, 0] }); },
    crates(k) { PROP.crate(k); k.box(0.45, 0.45, 0.45, 0xb8905f, 0.05, -0.05, 0.85, { rot: [0, 0, 0.3] }); },
    barrel(k) { k.cyl(0.27, 0.27, 0.68, 0x9a6a3e, 0, 0, 0.34, { seg: 10 }); for (const z of [0.14, 0.54]) k.cyl(0.285, 0.285, 0.05, C.iron, 0, 0, z, { seg: 10 }); },
    lamppost(k) {
        k.cyl(0.05, 0.07, 1.9, 0x2e3438, 0, 0, 0.95, { seg: 6 });
        k.box(0.3, 0.05, 0.05, 0x2e3438, 0.12, 0, 1.85);
        k.box(0.22, 0.22, 0.26, 0xffe0a0, 0.25, 0, 1.68, { emit: 1 });
        k.cone(0.2, 0.14, 0x2e3438, 0.25, 0, 1.87, { seg: 4 });
    },
    bollard(k) { k.cyl(0.13, 0.15, 0.4, 0x3a3a3e, 0, 0, 0.2, { seg: 8 }); k.cyl(0.18, 0.18, 0.06, 0x3a3a3e, 0, 0, 0.42, { seg: 8 }); },
    nets(k) { k.box(0.6, 0.6, 0.14, 0xb8a888, 0, 0, 0.07); k.ball(0.07, C.ochre, 0.18, 0.1, 0.18, { seg: 5, seg2: 4 }); },
    boat(k, p) {
        const g = k.group(0, 0, -0.12);
        k.box(2.2, 0.9, 0.35, p.color ?? C.red, 0, 0, 0.1, {}, g);
        k.box(2.0, 0.7, 0.1, 0x6b4a35, 0, 0, 0.3, {}, g);
        k.cone(0.45, 0.6, p.color ?? C.red, 1.3, 0, 0.1, { rot: [0, Math.PI / 2, 0], scale: [1, 0.35, 1], seg: 4 }, g);
        k.box(0.7, 0.6, 0.5, 0xeee2c8, -0.4, 0, 0.55, {}, g);
        k.box(0.8, 0.7, 0.08, p.color ?? C.teal, -0.4, 0, 0.84, {}, g);
        k.cyl(0.03, 0.03, 1.2, C.dark, 0.3, 0, 0.9, { seg: 4 }, g);
    },
    rowboat(k, p) {
        const g = k.group(0, 0, -0.14);
        k.box(1.5, 0.6, 0.28, p.color ?? C.wood, 0, 0, 0.14, {}, g);
        k.box(1.3, 0.45, 0.06, 0x5e4535, 0, 0, 0.28, {}, g);
        k.box(0.08, 0.5, 0.06, C.light, 0.2, 0, 0.3, {}, g);
        k.cone(0.3, 0.4, p.color ?? C.wood, 0.9, 0, 0.14, { rot: [0, Math.PI / 2, 0], scale: [1, 0.45, 0.8], seg: 4 }, g);
    },
    well(k) {
        k.hexp(0.42, 0.55, C.stone, 0, 0, 0.27);
        k.hexp(0.34, 0.04, 0x3f8f98, 0, 0, 0.53);
        for (const s of [-0.34, 0.34]) k.box(0.06, 0.06, 1.1, C.wood, s, 0, 0.9);
        k.cone(0.62, 0.38, C.red, 0, 0, 1.6, { seg: 6 });
    },
    anvil(k) { k.box(0.28, 0.28, 0.32, C.dark, 0, 0, 0.16); k.box(0.6, 0.26, 0.14, C.iron, 0.05, 0, 0.4); k.cone(0.1, 0.22, C.iron, 0.42, 0, 0.4, { rot: [0, Math.PI / 2, 0], seg: 5 }); },
    stove(k) { k.box(0.7, 0.7, 0.8, 0xa87a5a, 0, 0, 0.4); k.box(0.72, 0.1, 0.3, 0xff8a3a, 0, 0.32, 0.3, { emit: 1 }); k.cyl(0.12, 0.12, 0.8, 0x6b5a4a, 0.15, -0.15, 1.1, { seg: 6 }); k.cyl(0.22, 0.18, 0.2, C.iron, -0.1, 0, 0.9, { seg: 8 }); },
    alchemy(k) { k.box(0.8, 0.5, 0.06, C.light, 0, 0, 0.6); for (const [x, y] of [[-0.3, -0.15], [0.3, -0.15], [-0.3, 0.15], [0.3, 0.15]]) k.box(0.05, 0.05, 0.6, C.wood, x, y, 0.3); for (let i = 0; i < 3; i++) k.ball(0.08, [0x6ff5cf, 0xe24a6a, 0x7fa0ff][i], -0.2 + i * 0.2, 0, 0.72, { emit: 0.6, seg: 6, seg2: 5 }); },
    stall(k, p) {
        k.box(0.8, 0.5, 0.6, C.wood, 0, 0.1, 0.3);
        for (const x of [-0.38, 0.38]) k.box(0.05, 0.05, 1.5, C.dark, x, -0.2, 0.75);
        k.box(0.95, 0.7, 0.05, p.color ?? C.red, 0, 0, 1.5, { rot: [0.25, 0, 0] });
        for (let i = 0; i < 4; i++) k.ball(0.08, [0xe0452e, 0xf2c14e, 0x7fb84e, 0xe8903a][i], -0.28 + i * 0.19, 0.2, 0.66, { seg: 6, seg2: 4 });
    },
    tent(k) { k.add(new THREE.ConeGeometry(0.8, 1.3, 6).rotateX(Math.PI / 2), 0xc8a060, 0, 0, 0.65); },
    campfire(k) { for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28; k.ico(0.09, C.rock, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.05); } for (let i = 0; i < 3; i++) k.cyl(0.04, 0.05, 0.5, C.dark, 0, 0, 0.08, { rot: [Math.PI / 2, 0, i], seg: 5 }); k.flame(0, 0, 0.05, 1.6); },
    // wall decals: on the outer face of a house hex, toward side p.dir
    door(k, p) {
        k.g.position.x += NORMALS[p.dir][0] * 0.02;
        k.g.position.y += NORMALS[p.dir][1] * 0.02;
        k.box(0.08, 0.5, 1.05, p.color ?? C.wood, 0.5, 0, 0.53);
        k.box(0.1, 0.62, 0.1, C.cream, 0.5, 0, 1.1);
        k.ball(0.04, C.gold, 0.55, 0.15, 0.5, { seg: 5, seg2: 4 });
    },
    window(k, p) {
        k.box(0.06, 0.42, 0.52, p.lit ? 0xffe0a0 : 0x2f4a5a, 0.51, 0, 0.3, { emit: p.lit ? 0.8 : 0 });
        k.box(0.08, 0.5, 0.06, C.cream, 0.52, 0, 0.03);
        for (const s of [-1, 1]) k.box(0.05, 0.16, 0.52, p.shutter ?? C.teal, 0.53, s * 0.3, 0.3);
    },
    awning(k, p) { k.box(0.5, 0.8, 0.05, p.color ?? C.red, 0.72, 0, 0.1, { rot: [0, 0.35, 0] }); },
    chimney(k) { k.box(0.3, 0.3, 0.7, 0xb07a5a, 0.2, 0.1, 0.3); },
    tank(k) { k.cyl(0.35, 0.35, 0.6, 0xc49a6c, 0, 0, 0.45, { seg: 8 }); for (let i = 0; i < 3; i++) k.box(0.05, 0.05, 0.3, C.dark, Math.cos(i * 2.1) * 0.25, Math.sin(i * 2.1) * 0.25, 0.08); k.cone(0.38, 0.2, 0x9a7a55, 0, 0, 0.85, { seg: 8 }); },
    antenna(k) { k.cyl(0.02, 0.02, 1.2, C.iron, 0, 0, 0.6, { seg: 4 }); k.box(0.5, 0.03, 0.03, C.iron, 0, 0, 1.0); k.box(0.35, 0.03, 0.03, C.iron, 0, 0, 1.15); },
    stilt(k, p) {
        const h = p.z * LAYER - p.from;
        k.g.position.z = p.from;
        k.cyl(0.07, 0.08, h, 0x4a3a2e, 0, 0, h / 2, { seg: 5 });
    },
    lantern_top(k) { k.hexp(0.5, 1.0, 0xffe8a0, 0, 0, 0.5, { emit: 1 }); k.cone(0.7, 0.6, C.red, 0, 0, 1.3, { seg: 6 }); },
    arch(k) { k.add(new THREE.TorusGeometry(0.46, 0.08, 5, 10, Math.PI), C.stone, 0, 0, 0.38, { rot: [Math.PI / 2, 0, k.g.rotation.z] }); },
    pot(k) { const { r } = k; k.cyl(0.14, 0.1, 0.24, 0xc07a5a, 0, 0, 0.12, { seg: 7 }); k.ico(0.16, r() < 0.5 ? C.leaf : C.orange, 0, 0, 0.32); },
    leaves(k) { const { r } = k; for (let i = 0; i < 6; i++) k.box(0.12, 0.08, 0.01, [C.orange, 0xd86a2a, 0xf0b04a][i % 3], (r() - 0.5) * 0.8, (r() - 0.5) * 0.8, 0.01, { rot: [0, 0, r() * 3] }); },
    pipe(k) { k.cyl(0.14, 0.14, 1.0, 0x8a9a98, 0, 0, 0.14, { rot: [0, Math.PI / 2, 0], seg: 8 }); k.cyl(0.18, 0.18, 0.08, 0x6a7a78, 0.4, 0, 0.14, { rot: [0, Math.PI / 2, 0], seg: 8 }); },
    valve(k) { k.cyl(0.08, 0.08, 0.5, 0x8a9a98, 0, 0, 0.25, { seg: 6 }); k.torus(0.18, 0.03, 0xc9483e, 0, 0, 0.52, { seg: 5, seg2: 10 }); },
    hatch(k) { k.hexp(0.4, 0.08, 0x7a8a88, 0, 0, 0.04); k.box(0.3, 0.05, 0.05, 0x5a6a68, 0, 0, 0.1); },
    pylon(k) { k.box(0.3, 0.3, 1.4, 0xb8c0bc, 0, 0, 0.7); k.box(0.32, 0.32, 0.2, C.mint, 0, 0, 1.2, { emit: 1 }); },
    coral(k) { const { r } = k; for (let i = 0; i < 4; i++) k.cone(0.08, 0.4 + r() * 0.3, [0xe8837a, 0xf0a0c8, 0xe0a94e][i % 3], (r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0.2, { seg: 5 }); },
    galleon(k) {
        const g = k.group(0, 0, -0.6);
        g.rotation.x = 0.25;
        k.box(7, 2.2, 1.6, 0x5e4535, 0, 0, 0.8, {}, g);
        k.box(6.6, 1.9, 0.12, 0x8a6446, 0, 0, 1.62, {}, g);
        k.box(1.8, 2.2, 1.4, 0x5e4535, -2.8, 0, 2.2, {}, g);
        k.cyl(0.14, 0.18, 5, C.dark, 0.5, 0, 3.8, { seg: 6 }, g);
        k.box(0.1, 2.6, 1.6, C.sail, 0.5, 0, 4.2, { rot: [0.3, 0, 0] }, g);
        k.cyl(0.12, 0.14, 2.5, C.dark, 2.3, 0, 2.7, { rot: [0.4, 0, 0], seg: 6 }, g);
    },
    // a sagging line between two roofs, flags hung along it
    wire(k, p) {
        k.g.rotation.z = 0;
        const [x0, y0] = center(p.q, p.r);
        const [x1, y1] = center(p.to[0], p.to[1]);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dz = (p.to[2] - p.z) * LAYER;
        const len = Math.hypot(dx, dy);
        if (len > 12 || len < 1.5) return;
        const n = Math.ceil(len / 0.7);
        const sag = len * 0.07;
        const pt = (t) => [dx * t, dy * t, dz * t - sag * 4 * t * (1 - t) + 0.2];
        const flags = [C.red, C.cream, C.teal, C.ochre, C.blue];
        for (let i = 0; i < n; i++) {
            const a = pt(i / n);
            const b = pt((i + 1) / n);
            const s = k.group((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
            s.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
            const h = Math.hypot(b[0] - a[0], b[1] - a[1]);
            k.box(Math.hypot(h, b[2] - a[2]) + 0.02, 0.025, 0.025, 0x3a3a3e, 0, 0, 0, { rot: [0, -Math.atan2(b[2] - a[2], h), 0] }, s);
            if (i % 2 === 1) k.cone(0.1, 0.24, flags[(i + p.seed) % flags.length], 0, 0, -0.13, { rot: [Math.PI, 0, 0], scale: [1, 0.3, 1], seg: 3 }, s);
        }
    },
    // ---------------------------------------------------------- biome plants and stones
    cactus(k) {
        const { r } = k;
        const h = 1.1 + r() * 0.9;
        const g = [0x5f9a55, 0x6aa55c, 0x558f4c][Math.floor(r() * 3)];
        k.cyl(0.15, 0.17, h, g, 0, 0, h / 2, { seg: 8 });
        k.ball(0.15, g, 0, 0, h, { seg: 8, seg2: 5, scale: [1, 1, 0.7] });
        for (const s of [-1, 1]) {
            if (r() < 0.25) continue;
            const z = h * (0.4 + r() * 0.25);
            const arm = k.group(0, s * 0.16, z);
            k.cyl(0.08, 0.09, 0.26, g, 0, s * 0.12, 0, { rot: [Math.PI / 2, 0, 0], seg: 6 }, arm);
            k.cyl(0.08, 0.09, 0.45, g, 0, s * 0.24, 0.22, { seg: 6 }, arm);
            k.ball(0.08, g, 0, s * 0.24, 0.45, { seg: 6, seg2: 4 }, arm);
        }
        if (r() < 0.4) k.ball(0.06, 0xf0a0c0, 0, 0, h + 0.12, { seg: 5, seg2: 4 });
    },
    agave(k) {
        const { r } = k;
        const g = r() < 0.5 ? 0x8fb89a : 0x9fbf7a;
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2 + r() * 0.3;
            const l = k.group(0, 0, 0.05);
            l.rotation.z = a;
            k.cone(0.06, 0.55 + r() * 0.2, g, 0.16, 0, 0.18, { rot: [0, 0.75 + r() * 0.3, 0], seg: 3 }, l);
        }
    },
    deadtree(k) {
        const { r } = k;
        const c = 0x8a7a68;
        const h = 1.4 + r() * 1.2;
        k.cyl(0.07, 0.13, h, c, 0, 0, h / 2, { seg: 6, rot: [(r() - 0.5) * 0.2, (r() - 0.5) * 0.2, 0] });
        const branch = (x, y, z, len, ang, tilt, depth) => {
            const g = k.group(x, y, z);
            g.rotation.set(0, tilt, ang);
            k.cyl(0.02 + depth * 0.02, 0.03 + depth * 0.025, len, c, 0, 0, len / 2, { seg: 5 }, g);
            if (depth > 0) for (let i = 0; i < 2; i++) {
                const b = k.group(0, 0, len * (0.6 + r() * 0.3), g);
                b.rotation.set(0, 0.5 + r() * 0.4, (i ? 1 : -1) * (0.6 + r()));
                k.cyl(0.015, 0.025, len * 0.55, c, 0, 0, len * 0.27, { seg: 4 }, b);
            }
        };
        for (let i = 0; i < 3; i++) branch(0, 0, h * (0.55 + i * 0.15), 0.6 + r() * 0.4, r() * 6.28, 0.7 + r() * 0.5, 1);
    },
    bones(k) {
        k.ball(0.14, 0xefe8d8, 0, 0, 0.1, { scale: [1.2, 1, 0.8], seg: 8, seg2: 6 });
        for (const s of [-1, 1]) k.cone(0.03, 0.3, 0xefe8d8, 0.02, s * 0.14, 0.18, { rot: [s * 1.1, 0, 0], seg: 4 });
        for (let i = 0; i < 3; i++) k.cyl(0.02, 0.02, 0.4, 0xe6dfcf, -0.3 + i * 0.1, 0.1, 0.03, { rot: [0, Math.PI / 2, 0.4], seg: 4 });
    },
    boulder(k, p) {
        const { r } = k;
        const c = p.color ?? [0xa8a39a, 0x9c978e, 0xb2ada4][Math.floor(r() * 3)];
        k.add(new THREE.DodecahedronGeometry(0.34 + r() * 0.12, 0), c, 0, 0, 0.22, { rot: [r() * 3, r() * 3, r() * 3], scale: [1.2, 1, 0.75] });
        if (r() < 0.5) k.add(new THREE.DodecahedronGeometry(0.18, 0), c, 0.32, 0.15, 0.1, { rot: [r() * 3, r() * 3, r() * 3] });
    },
    redboulder(k) { PROP.boulder(k, { color: [0xc47a4a, 0xb86a3e, 0xd48a58][Math.floor(k.r() * 3)] }); },
    snowpine(k, p) {
        const { r } = k;
        const h = 1.6 + r() * 1.1;
        k.cyl(0.08, 0.1, h * 0.35, 0x6b4a35, 0, 0, h * 0.17, { seg: 6 });
        const snow = p.bare ? null : 0xf2f6f8;
        for (let i = 0; i < 4; i++) {
            const z = h * 0.25 + i * h * 0.19;
            const rad = 0.62 - i * 0.13;
            k.cone(rad, h * 0.32, 0x3f6f55, 0, 0, z + h * 0.16, { seg: 7 });
            if (snow) k.cone(rad * 0.82, h * 0.1, snow, 0, 0, z + h * 0.27, { seg: 7 });
        }
    },
    pine(k) { PROP.snowpine(k, { bare: true }); },
    drift(k) { const { r } = k; k.ball(0.42 + r() * 0.2, 0xf4f8fa, 0, 0, -0.05, { scale: [1.4, 1, 0.45], seg: 10, seg2: 6 }); },
    crystal(k) {
        const { r } = k;
        for (let i = 0; i < 4; i++) k.cone(0.07 + r() * 0.05, 0.4 + r() * 0.5, 0xbfe8f5, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4, 0.2, { seg: 5, emit: 0.25, rot: [(r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 0] });
    },
    reeds(k) {
        const { r } = k;
        for (let i = 0; i < 9; i++) {
            const x = (r() - 0.5) * 0.6;
            const y = (r() - 0.5) * 0.6;
            const h = 0.5 + r() * 0.6;
            k.cone(0.025, h, 0x8a9a55, x, y, h / 2, { seg: 3 });
            if (r() < 0.35) k.cyl(0.04, 0.04, 0.14, 0x6b4a35, x, y, h * 0.92, { seg: 5 });
        }
    },
    mushroom(k) {
        const { r } = k;
        for (let i = 0; i < 3; i++) {
            const x = (r() - 0.5) * 0.5;
            const y = (r() - 0.5) * 0.5;
            const h = 0.15 + r() * 0.2;
            k.cyl(0.035, 0.045, h, 0xefe6d2, x, y, h / 2, { seg: 5 });
            k.add(new THREE.SphereGeometry(0.1 + r() * 0.06, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), r() < 0.5 ? 0xc9483e : 0xb08a5a, x, y, h, {});
        }
    },
    lily(k) {
        const { r } = k;
        k.g.position.z -= 0.08;
        for (let i = 0; i < 3; i++) k.cyl(0.14 + r() * 0.08, 0.14, 0.02, 0x5f9a55, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0, { seg: 9 });
        if (r() < 0.5) k.ball(0.05, 0xf0b0c8, 0.1, 0, 0.04, { seg: 6, seg2: 4 });
    },
    fern(k) {
        const { r } = k;
        for (let i = 0; i < 7; i++) {
            const l = k.group(0, 0, 0.02);
            l.rotation.z = (i / 7) * Math.PI * 2 + r() * 0.3;
            k.box(0.55, 0.12, 0.02, i % 2 ? 0x4f8a45 : 0x5f9a4f, 0.26, 0, 0.12, { rot: [0, -0.5, 0] }, l);
        }
    },
    bigleaf(k) {
        const { r } = k;
        k.cyl(0.03, 0.04, 0.5, 0x4a6a3a, 0, 0, 0.25, { seg: 4 });
        for (let i = 0; i < 4; i++) {
            const l = k.group(0, 0, 0.4 + i * 0.08);
            l.rotation.z = i * 1.6 + r();
            k.ball(0.3, i % 2 ? 0x3f8a45 : 0x4f9a50, 0.3, 0, 0, { scale: [1.3, 0.7, 0.08], rot: [0, 0.4, 0], seg: 8, seg2: 5 }, l);
        }
    },
    charred(k) { PROP.deadtree(k); k.g.traverse((o) => { if (o.isMesh) { const c = o.geometry.attributes.color; for (let i = 0; i < c.count; i++) c.setXYZ(i, 0.18, 0.16, 0.15); } }); },
    basaltspire(k) {
        const { r } = k;
        const h = 1.2 + r() * 1.6;
        k.hexp(0.34, h, 0x55585f, 0, 0, h / 2);
        k.hexp(0.26, h * 0.7, 0x4a4d54, 0.25, 0.2, h * 0.35);
        k.hexp(0.36, 0.06, 0x6a6d74, 0, 0, h);
    },
    column(k, p) {
        const { r } = k;
        const h = p.broken ? 0.6 + r() * 0.8 : 1.9;
        k.hexp(0.34, 0.18, 0xd8d2bf, 0, 0, 0.09);
        k.cyl(0.2, 0.22, h, 0xe3dccb, 0, 0, 0.18 + h / 2, { seg: 10 });
        if (!p.broken) k.box(0.55, 0.55, 0.16, 0xd8d2bf, 0, 0, h + 0.26);
        else k.add(new THREE.DodecahedronGeometry(0.2, 0), 0xe3dccb, 0.35, 0.2, 0.12, { rot: [r(), r(), r()] });
    },
    rail(k, p) {
        // a railing post and bar on the outer edge of a balcony hex
        const [cx, cy] = center(p.around[0], p.around[1]);
        const [x, y] = center(p.q, p.r);
        const a = Math.atan2(y - cy, x - cx);
        k.g.rotation.z = a;
        k.box(0.05, 0.05, 0.7, C.dark, 0.38, 0, 0.35);
        k.box(0.04, 0.6, 0.04, C.dark, 0.38, 0, 0.68);
    },
};

export function buildProp(p) {
    const f = PROP[p.kind];
    if (!f) return null;
    const k = new Kit(p.seed ?? 1);
    placed(k, p);
    f(k, p);
    return k.g;
}

// resource nodes are drawn like props, and change when gathered
export function buildNode(n) {
    const k = new Kit(n.id);
    const [x, y] = center(n.q, n.r);
    k.g.position.set(x, y, n.h * LAYER);
    k.g.rotation.z = k.r() * 6.28;
    if (n.kind === 'tree') PROP.tree(k);
    else if (n.kind === 'palm') PROP.palm(k);
    else if (n.kind === 'copper' || n.kind === 'iron') {
        k.ico(0.45, 0x9a968e, 0, 0, 0.3, { rot: [1, 2, 0.5], scale: [1, 1, 0.8] });
        for (let i = 0; i < 5; i++) k.ico(0.08, n.kind === 'copper' ? 0xd8864a : 0xc0c8d0, Math.cos(i * 1.3) * 0.32, Math.sin(i * 1.3) * 0.32, 0.25 + (i % 2) * 0.2, { emit: 0.25 });
    } else if (n.kind === 'herbbush') {
        for (let i = 0; i < 6; i++) k.cone(0.06, 0.45, 0x9ab08a, Math.cos(i) * 0.18, Math.sin(i) * 0.18, 0.22, { seg: 4 });
        for (let i = 0; i < 3; i++) k.ball(0.05, 0xd8e0f0, Math.cos(i * 2) * 0.12, Math.sin(i * 2) * 0.12, 0.48, { seg: 5, seg2: 4 });
    } else if (n.kind === 'algae') {
        k.g.position.z -= 0.2;
        for (let i = 0; i < 5; i++) k.cone(0.05, 0.6, 0x3f7f8a, Math.cos(i * 1.3) * 0.2, Math.sin(i * 1.3) * 0.2, 0.1, { seg: 4 });
    } else if (n.kind === 'wreck') {
        k.g.position.z -= 0.25;
        k.box(1.1, 0.14, 0.14, 0x5e4535, 0, 0, 0.1, { rot: [0, 0, 0.5] });
        k.box(0.9, 0.12, 0.12, 0x6b4a35, 0.1, 0.25, 0.14, { rot: [0.2, 0, -0.4] });
        k.box(0.3, 0.3, 0.3, 0x8a6446, -0.2, -0.2, 0.1);
    } else return null;
    return k.g;
}

// ---------------------------------------------------------------- characters
function eyes(k, parent, x, z, spread, size, glow = 0) {
    for (const s of [-1, 1]) {
        k.ball(size, glow ? 0xfff2a0 : 0xffffff, x, s * spread, z, { seg: 7, seg2: 5, emit: glow }, parent);
        k.ball(size * 0.5, C.ink, x + size * 0.6, s * spread, z, { seg: 5, seg2: 4 }, parent);
    }
}

// a person: body, head, arms, legs; outfit and weapon by class or role
export function buildPerson(o = {}) {
    const k = new Kit(o.seed ?? 3);
    const root = k.g;
    const body = k.group(0, 0, 0);
    const parts = { root, body, legs: [], arm: null, arm2: null, head: null, weapon: null };
    const coat = o.coat ?? C.blue;
    k.cyl(0.2, 0.26, 0.5, coat, 0, 0, 0.5, { seg: 8 }, body);
    k.box(0.3, 0.36, 0.08, o.belt ?? 0x5e4535, 0, 0, 0.42, {}, body);
    for (const s of [-1, 1]) parts.legs.push(k.box(0.1, 0.1, 0.28, o.pants ?? 0x3a3f4a, 0, s * 0.09, 0.14, {}, body));
    parts.head = k.group(0, 0, 0.94, body);
    k.ball(0.2, o.skin ?? C.skin, 0, 0, 0, { seg: 12, seg2: 9 }, parts.head);
    eyes(k, parts.head, 0.15, 0.02, 0.07, 0.04);
    const hat = o.hat ?? 'none';
    const hc = o.hatColor ?? 0x3a3a44;
    if (hat === 'tricorn') { k.cyl(0.3, 0.3, 0.05, hc, 0, 0, 0.14, { seg: 3 }, parts.head); k.cyl(0.17, 0.2, 0.14, hc, 0, 0, 0.2, { seg: 8 }, parts.head); }
    else if (hat === 'bicorne') k.box(0.18, 0.55, 0.22, hc, 0, 0, 0.2, {}, parts.head);
    else if (hat === 'cap') { k.cyl(0.2, 0.21, 0.1, hc, 0, 0, 0.14, { seg: 10 }, parts.head); k.box(0.16, 0.2, 0.02, hc, 0.16, 0, 0.1, {}, parts.head); }
    else if (hat === 'straw') k.cone(0.34, 0.16, 0xe0c070, 0, 0, 0.17, { seg: 10 }, parts.head);
    else if (hat === 'scarf') k.ball(0.21, hc, -0.03, 0, 0.05, { scale: [1, 1.02, 0.9], seg: 10, seg2: 7 }, parts.head);
    else if (hat === 'chef') k.cyl(0.16, 0.13, 0.28, 0xffffff, 0, 0, 0.26, { seg: 8 }, parts.head);
    else if (hat === 'helmet') k.add(new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), 0xe6b73c, 0, 0, 0.04, {}, parts.head);
    else if (hat === 'hood') k.cone(0.24, 0.4, hc, -0.02, 0, 0.14, { seg: 8 }, parts.head);
    else if (hat === 'bandana') k.ball(0.205, hc, -0.02, 0, 0.06, { scale: [1, 1, 0.75], seg: 10, seg2: 7 }, parts.head);
    else k.ball(0.21, o.hair ?? 0x5a3a2a, -0.04, 0, 0.06, { scale: [1, 1, 0.8], seg: 10, seg2: 7 }, parts.head);
    parts.arm = k.group(0.02, 0.24, 0.66, body);
    k.box(0.08, 0.08, 0.3, coat, 0, 0, -0.12, {}, parts.arm);
    parts.arm2 = k.group(0.02, -0.24, 0.66, body);
    k.box(0.08, 0.08, 0.3, coat, 0, 0, -0.12, {}, parts.arm2);
    // weapon in the right hand
    const w = o.weapon ?? 'blade';
    const wg = k.group(0.04, 0, -0.26, parts.arm);
    parts.weapon = wg;
    if (w === 'blade' || w === 'saber') { k.box(0.04, 0.03, 0.55, 0xe0e4ec, 0.22, 0, 0.02, { rot: [0, 1.3, 0], emit: 0.1 }, wg); k.box(0.05, 0.16, 0.04, C.gold, 0.02, 0, 0, {}, wg); }
    else if (w === 'greatblade') { k.box(0.08, 0.04, 0.9, 0xe0e4ec, 0.4, 0, 0.1, { rot: [0, 1.25, 0], emit: 0.1 }, wg); k.box(0.06, 0.26, 0.06, C.gold, 0.03, 0, 0, {}, wg); }
    else if (w === 'dual') { k.box(0.03, 0.03, 0.4, 0xe0e4ec, 0.16, 0, 0, { rot: [0, 1.3, 0] }, wg); const w2 = k.group(0.04, 0, -0.26, parts.arm2); k.box(0.03, 0.03, 0.4, 0xe0e4ec, 0.16, 0, 0, { rot: [0, 1.3, 0] }, w2); }
    else if (w === 'bow') { k.torus(0.32, 0.025, C.wood, 0.05, 0, 0.1, { rot: [0, 0, 0], seg: 4, seg2: 10 }, wg).scale.set(0.5, 1, 1); }
    else if (w === 'gun') { k.cyl(0.03, 0.03, 0.8, C.dark, 0.3, 0, 0.05, { rot: [0, 1.35, 0], seg: 6 }, wg); k.box(0.07, 0.06, 0.26, C.wood, 0.02, 0, -0.02, { rot: [0, 1.2, 0] }, wg); }
    else if (w === 'staff') { k.cyl(0.025, 0.025, 1.1, C.wood, 0.02, 0, 0.3, { seg: 5 }, wg); k.ico(0.1, 0x6ff5cf, 0.02, 0, 0.88, { emit: 0.8 }, wg); }
    else if (w === 'censer') { k.cyl(0.02, 0.02, 0.8, C.dark, 0.02, 0, 0.2, { seg: 4 }, wg); k.ball(0.1, C.gold, 0.02, 0, -0.22, { seg: 7, seg2: 5 }, wg); k.ball(0.05, 0xb07cd6, 0.02, 0, -0.2, { emit: 0.8, seg: 5, seg2: 4 }, wg); }
    else if (w === 'dagger') k.box(0.03, 0.03, 0.3, 0xcfd2da, 0.12, 0, 0, { rot: [0, 1.3, 0] }, wg);
    if (o.cape) { parts.cape = k.group(-0.18, 0, 0.72, body); k.box(0.04, 0.34, 0.5, o.cape, 0, 0, -0.22, { rot: [0, -0.15, 0] }, parts.cape); }
    root.userData.parts = parts;
    return root;
}

export function buildCreature(kind, def) {
    const k = new Kit(kind.length * 13);
    const root = k.g;
    const body = k.group(0, 0, 0);
    const parts = { root, body, legs: [], wings: [], arm: null, head: null };
    const c = def.color;
    switch (def.model) {
        case 'gull': {
            k.ball(0.18, c, 0, 0, 0.26, { scale: [1.4, 1, 0.9] }, body);
            parts.head = k.group(0.2, 0, 0.38, body);
            k.ball(0.1, c, 0, 0, 0, {}, parts.head);
            k.cone(0.04, 0.14, 0xf0a33a, 0.13, 0, -0.01, { rot: [0, Math.PI / 2, 0], seg: 5 }, parts.head);
            eyes(k, parts.head, 0.06, 0.03, 0.05, 0.028);
            for (const s of [-1, 1]) { const w = k.group(0, s * 0.14, 0.3, body); k.box(0.2, 0.4, 0.03, 0xd8dcd8, -0.02, s * 0.18, 0, {}, w); parts.wings.push(w); }
            for (const s of [-1, 1]) parts.legs.push(k.box(0.025, 0.025, 0.12, 0xf0a33a, 0, s * 0.06, 0.06, {}, body));
            break;
        }
        case 'crab': {
            k.ball(0.3, c, 0, 0, 0.26, { scale: [0.9, 1.3, 0.55] }, body);
            eyes(k, body, 0.2, 0.44, 0.1, 0.05);
            for (const s of [-1, 1]) { const a = k.group(0.25, s * 0.34, 0.28, body); k.ball(0.13, c, 0.1, 0, 0, { scale: [1.3, 0.8, 0.7] }, a); if (s > 0) parts.arm = a; }
            for (let i = 0; i < 6; i++) parts.legs.push(k.box(0.04, 0.04, 0.24, c, -0.1 + (i % 3) * 0.1, (i < 3 ? -1 : 1) * 0.3, 0.1, { rot: [(i < 3 ? 1 : -1) * 0.6, 0, 0] }, body));
            break;
        }
        case 'boar': {
            k.ball(0.34, c, 0, 0, 0.44, { scale: [1.35, 0.9, 0.85] }, body);
            parts.head = k.group(0.42, 0, 0.44, body);
            k.ball(0.22, c, 0, 0, 0, { scale: [1.1, 0.9, 0.9] }, parts.head);
            k.cyl(0.09, 0.1, 0.12, 0xd8a090, 0.22, 0, -0.03, { rot: [0, Math.PI / 2, 0], seg: 8 }, parts.head);
            for (const s of [-1, 1]) k.cone(0.03, 0.14, 0xf2ead8, 0.18, s * 0.1, -0.08, { rot: [0, -0.4, 0], seg: 4 }, parts.head);
            eyes(k, parts.head, 0.14, 0.08, 0.09, 0.035);
            for (const s of [-1, 1]) k.cone(0.06, 0.12, c, -0.02, s * 0.12, 0.2, { seg: 4 }, parts.head);
            for (const [x, y] of [[-0.25, -0.14], [0.25, -0.14], [-0.25, 0.14], [0.25, 0.14]]) parts.legs.push(k.box(0.09, 0.09, 0.26, 0x4a3a30, x, y, 0.13, {}, body));
            break;
        }
        case 'rat': {
            k.ball(0.18, c, 0, 0, 0.16, { scale: [1.5, 1, 0.9] }, body);
            parts.head = k.group(0.26, 0, 0.18, body);
            k.cone(0.1, 0.22, c, 0.06, 0, 0, { rot: [0, Math.PI / 2, 0], seg: 7 }, parts.head);
            for (const s of [-1, 1]) k.ball(0.06, 0xd8a0a0, -0.02, s * 0.08, 0.08, {}, parts.head);
            eyes(k, parts.head, 0.05, 0.05, 0.05, 0.025);
            k.cyl(0.015, 0.01, 0.4, 0xd8a0a0, -0.42, 0, 0.12, { rot: [0, Math.PI / 2 - 0.2, 0], seg: 4 }, body);
            break;
        }
        case 'golem': {
            k.ico(0.42, c, 0, 0, 0.6, { detail: 0 }, body);
            k.ico(0.26, c, 0, 0, 1.05, {}, body);
            for (let i = 0; i < 5; i++) k.cone(0.07, 0.35, [0xf0a0c8, 0xe0a94e, 0xe8837a][i % 3], Math.cos(i) * 0.3, Math.sin(i) * 0.3, 0.9 + (i % 2) * 0.2, { seg: 5 }, body);
            eyes(k, body, 0.22, 1.05, 0.1, 0.06, 0.6);
            for (const s of [-1, 1]) { const a = k.group(0, s * 0.48, 0.75, body); k.ico(0.2, c, 0, 0, -0.18, {}, a); if (s > 0) parts.arm = a; }
            for (const s of [-1, 1]) parts.legs.push(k.box(0.2, 0.2, 0.3, c, 0, s * 0.2, 0.15, {}, body));
            break;
        }
        case 'automaton': {
            k.hexp(0.3, 0.6, c, 0, 0, 0.65, {}, body);
            k.hexp(0.32, 0.08, 0x6a7a78, 0, 0, 0.98, {}, body);
            parts.head = k.group(0, 0, 1.18, body);
            k.box(0.34, 0.34, 0.26, c, 0, 0, 0, {}, parts.head);
            k.box(0.04, 0.26, 0.08, C.mint, 0.18, 0, 0.02, { emit: 1 }, parts.head);
            for (const s of [-1, 1]) { const a = k.group(0, s * 0.38, 0.9, body); k.box(0.12, 0.12, 0.5, 0x8a9a98, 0, 0, -0.22, {}, a); k.box(0.16, 0.16, 0.14, C.mint, 0, 0, -0.5, { emit: 0.5 }, a); if (s > 0) parts.arm = a; }
            for (const s of [-1, 1]) parts.legs.push(k.box(0.12, 0.12, 0.36, 0x8a9a98, 0, s * 0.14, 0.18, {}, body));
            break;
        }
        case 'sentinel': {
            k.cone(0.34, 1.1, c, 0, 0, 0.55, { seg: 6 }, body);
            k.ball(0.22, 0xd8e8e4, 0, 0, 1.2, {}, body);
            k.ball(0.1, C.mint, 0.18, 0, 1.22, { emit: 1 }, body);
            for (let i = 0; i < 3; i++) { const w = k.group(0, 0, 0.8 + i * 0.12, body); k.torus(0.4 - i * 0.08, 0.025, C.mint, 0, 0, 0, { emit: 0.8 }, w); parts.wings.push(w); }
            break;
        }
        case 'warden': {
            k.hexp(0.6, 1.2, c, 0, 0, 1.0, {}, body);
            k.hexp(0.7, 0.14, 0x5a6a68, 0, 0, 1.65, {}, body);
            parts.head = k.group(0, 0, 2.0, body);
            k.hexp(0.36, 0.5, c, 0, 0, 0, {}, parts.head);
            k.box(0.06, 0.5, 0.12, C.mint, 0.3, 0, 0.05, { emit: 1 }, parts.head);
            for (const s of [-1, 1]) { const a = k.group(0, s * 0.8, 1.5, body); k.box(0.26, 0.26, 0.9, 0x6a7a78, 0, 0, -0.4, {}, a); k.hexp(0.26, 0.4, C.mint, 0, 0, -0.95, { emit: 0.6 }, a); if (s > 0) parts.arm = a; }
            for (const s of [-1, 1]) parts.legs.push(k.box(0.3, 0.3, 0.5, 0x6a7a78, 0, s * 0.3, 0.25, {}, body));
            break;
        }
        case 'human': {
            const p = buildPerson({ coat: c, hat: def.hat ?? (kind === 'thief' ? 'hood' : 'bandana'), hatColor: def.hatColor ?? (kind === 'thief' ? 0x2a2f38 : 0xc9483e), weapon: def.gear ?? 'saber', seed: 9 });
            return p;
        }
        case 'serpent': {
            for (let i = 0; i < 5; i++) k.ball(0.32 - i * 0.04, c, -i * 0.45, 0, 0.1 + Math.sin(i) * 0.15, { scale: [1.3, 1, 1] }, body);
            parts.head = k.group(0.4, 0, 0.55, body);
            k.ball(0.3, c, 0, 0, 0, { scale: [1.4, 0.9, 0.8] }, parts.head);
            eyes(k, parts.head, 0.18, 0.12, 0.14, 0.06, 0.5);
            k.cone(0.25, 0.5, 0x2f6a5a, -0.1, 0, 0.3, { rot: [0, -0.5, 0], scale: [0.4, 1, 1], seg: 4 }, parts.head);
            break;
        }
        case 'quad': {
            // wolves, panthers, lambs: a body, a head, four legs, a tail
            const sz = def.size ?? 1;
            k.ball(0.3 * sz, c, 0, 0, 0.42 * sz, { scale: [1.5, 0.85, 0.8] }, body);
            parts.head = k.group(0.42 * sz, 0, 0.55 * sz, body);
            k.ball(0.18 * sz, c, 0, 0, 0, { scale: [1.2, 0.9, 0.9] }, parts.head);
            if (def.snout !== false) k.cone(0.09 * sz, 0.2 * sz, def.accent ?? c, 0.17 * sz, 0, -0.03, { rot: [0, Math.PI / 2, 0], seg: 5 }, parts.head);
            eyes(k, parts.head, 0.13 * sz, 0.05, 0.07 * sz, 0.03 * sz, def.glow ?? 0);
            if (def.ears !== false) for (const s of [-1, 1]) k.cone(0.05 * sz, 0.13 * sz, c, -0.03, s * 0.09 * sz, 0.16 * sz, { seg: 4 }, parts.head);
            if (def.wool) for (let i = 0; i < 7; i++) k.ball(0.14, 0xf2efe6, -0.2 + (i % 4) * 0.13, (i < 4 ? 1 : -1) * 0.08, 0.55, { seg: 6, seg2: 5 }, body);
            for (const [x, y] of [[-0.25, -0.13], [0.25, -0.13], [-0.25, 0.13], [0.25, 0.13]]) parts.legs.push(k.box(0.08 * sz, 0.08 * sz, 0.3 * sz, def.accent ?? c, x * sz, y * sz, 0.15 * sz, {}, body));
            k.cyl(0.03 * sz, 0.05 * sz, 0.35 * sz, c, -0.5 * sz, 0, 0.5 * sz, { rot: [0, -0.9, 0], seg: 5 }, body);
            break;
        }
        case 'scorpion': {
            k.ball(0.26, c, 0, 0, 0.2, { scale: [1.5, 1, 0.5] }, body);
            eyes(k, body, 0.32, 0.24, 0.06, 0.035, 0.3);
            for (const s of [-1, 1]) { const a = k.group(0.3, s * 0.22, 0.2, body); k.box(0.3, 0.07, 0.07, c, 0.12, 0, 0, { rot: [0, 0, s * 0.4] }, a); k.ball(0.09, c, 0.3, s * 0.08, 0, { scale: [1.4, 0.8, 0.6] }, a); if (s > 0) parts.arm = a; }
            const tail = k.group(-0.36, 0, 0.22, body);
            for (let i = 0; i < 4; i++) k.ball(0.08 - i * 0.008, c, -0.08 - i * 0.03, 0, 0.1 + i * 0.13, { seg: 6, seg2: 4 }, tail);
            k.cone(0.05, 0.16, 0x2a2a2a, 0.02, 0, 0.62, { rot: [0, 1.8, 0], seg: 4 }, tail);
            for (let i = 0; i < 6; i++) parts.legs.push(k.box(0.03, 0.03, 0.22, c, -0.12 + (i % 3) * 0.12, (i < 3 ? -1 : 1) * 0.24, 0.09, { rot: [(i < 3 ? 1 : -1) * 0.7, 0, 0] }, body));
            break;
        }
        case 'snowman': {
            k.ball(0.36, 0xf4f8fa, 0, 0, 0.36, {}, body);
            k.ball(0.27, 0xf4f8fa, 0, 0, 0.88, {}, body);
            parts.head = k.group(0, 0, 1.28, body);
            k.ball(0.2, 0xf4f8fa, 0, 0, 0, {}, parts.head);
            k.cone(0.04, 0.2, 0xe8892e, 0.24, 0, 0, { rot: [0, Math.PI / 2, 0], seg: 5 }, parts.head);
            eyes(k, parts.head, 0.16, 0.06, 0.07, 0.03);
            k.cyl(0.14, 0.16, 0.18, 0x2a2f38, 0, 0, 0.2, { seg: 8 }, parts.head);
            for (const s of [-1, 1]) { const a = k.group(0, s * 0.26, 0.95, body); k.cyl(0.02, 0.02, 0.45, 0x6b4a35, 0, s * 0.18, 0.08, { rot: [s * 1.1, 0, 0], seg: 4 }, a); if (s > 0) parts.arm = a; }
            k.box(0.06, 0.4, 0.06, c, 0.1, 0, 1.08, {}, body);
            break;
        }
        case 'penguin': {
            k.ball(0.22, 0x2a2f38, 0, 0, 0.3, { scale: [0.9, 0.9, 1.3] }, body);
            k.ball(0.17, 0xf2efe6, 0.07, 0, 0.28, { scale: [0.8, 0.8, 1.2] }, body);
            parts.head = k.group(0, 0, 0.62, body);
            k.ball(0.13, 0x2a2f38, 0, 0, 0, {}, parts.head);
            k.cone(0.04, 0.12, 0xf0a33a, 0.14, 0, -0.02, { rot: [0, Math.PI / 2, 0], seg: 4 }, parts.head);
            eyes(k, parts.head, 0.09, 0.04, 0.05, 0.025);
            for (const s of [-1, 1]) { const wg = k.group(0, s * 0.2, 0.38, body); k.box(0.1, 0.03, 0.26, 0x2a2f38, 0, 0, -0.08, { rot: [s * 0.3, 0, 0] }, wg); parts.wings.push(wg); }
            for (const s of [-1, 1]) parts.legs.push(k.box(0.1, 0.06, 0.04, 0xf0a33a, 0.05, s * 0.08, 0.02, {}, body));
            break;
        }
        case 'toad': {
            k.ball(0.3, c, 0, 0, 0.22, { scale: [1.2, 1.1, 0.7] }, body);
            parts.head = k.group(0.25, 0, 0.3, body);
            k.ball(0.18, c, 0, 0, 0, { scale: [1, 1.3, 0.7] }, parts.head);
            eyes(k, parts.head, 0.05, 0.12, 0.12, 0.05);
            for (const s of [-1, 1]) parts.legs.push(k.box(0.3, 0.08, 0.06, def.accent ?? c, -0.15, s * 0.28, 0.06, { rot: [0, 0, s * 0.4] }, body));
            break;
        }
        case 'lizard': {
            k.ball(0.22, c, 0, 0, 0.55, { scale: [0.9, 0.8, 1.6] }, body);
            parts.head = k.group(0.1, 0, 1.0, body);
            k.ball(0.16, c, 0.05, 0, 0, { scale: [1.5, 0.9, 0.8] }, parts.head);
            eyes(k, parts.head, 0.12, 0.05, 0.08, 0.03, 0.4);
            k.cyl(0.03, 0.09, 0.8, c, -0.35, 0, 0.3, { rot: [0, -1.2, 0], seg: 5 }, body);
            for (const s of [-1, 1]) parts.legs.push(k.box(0.09, 0.09, 0.36, def.accent ?? c, 0, s * 0.13, 0.18, {}, body));
            for (const s of [-1, 1]) { const a = k.group(0.05, s * 0.2, 0.75, body); k.box(0.07, 0.07, 0.3, c, 0, 0, -0.12, {}, a); if (s > 0) parts.arm = a; }
            break;
        }
        case 'wisp': {
            k.ball(0.22, c, 0, 0, 0.9, { emit: 1 }, body);
            k.ball(0.32, c, 0, 0, 0.9, { emit: 0.35, scale: [1, 1, 1.2] }, body);
            for (let i = 0; i < 3; i++) { const wg = k.group(0, 0, 0.9, body); k.ball(0.06, 0xffffff, 0.4, 0, 0, { emit: 1, seg: 5, seg2: 4 }, wg); parts.wings.push(wg); }
            break;
        }
        case 'bird': {
            const g = buildCreature(kind, { ...def, model: 'gull' });
            g.traverse((o) => { if (o.isMesh && o.geometry.attributes.color) { const cc = o.geometry.attributes.color; const t = new THREE.Color(c); const t2 = new THREE.Color(def.accent ?? c); for (let i = 0; i < cc.count; i++) if (cc.getX(i) > 0.8 && cc.getY(i) > 0.8) cc.setXYZ(i, (i % 2 ? t : t2).r, (i % 2 ? t : t2).g, (i % 2 ? t : t2).b); } });
            return g;
        }
        case 'bonehuman': {
            const p = buildPerson({ coat: c, skin: def.skin ?? 0xefe8d8, hat: def.hat ?? 'none', hatColor: def.hatColor ?? 0xefe8d8, hair: def.skin ?? 0xefe8d8, pants: def.pants ?? c, weapon: def.gear ?? 'saber', seed: 5 });
            return p;
        }
        case 'pirateship':
            return buildShip({ hull: 0x2a2a30, sail: 0x3a3a40, flag: 0x111111 });
        default:
            k.ball(0.3, c, 0, 0, 0.3, {}, body);
    }
    root.userData.parts = parts;
    return root;
}

export function buildShip(o = {}) {
    const k = new Kit(21);
    const root = k.g;
    const body = k.group(0, 0, 0);
    const hull = o.hull ?? 0x8a6446;
    k.box(3.0, 1.3, 0.6, hull, 0, 0, 0.0, {}, body);
    k.box(2.8, 1.1, 0.1, 0xc49a6c, 0, 0, 0.32, {}, body);
    k.cone(0.66, 1.0, hull, 1.9, 0, 0.0, { rot: [0, Math.PI / 2, 0], scale: [1, 0.55, 1], seg: 4 }, body);
    k.box(0.9, 1.3, 0.5, hull, -1.2, 0, 0.55, {}, body);
    k.cyl(0.06, 0.08, 3.2, 0x5e4535, 0.3, 0, 1.9, { seg: 6 }, body);
    const sail = k.group(0.3, 0, 2.2, body);
    k.box(0.06, 1.8, 1.6, o.sail ?? C.sail, 0.1, 0, 0, {}, sail);
    k.box(0.05, 1.9, 0.06, 0x5e4535, 0.1, 0, 0.82, {}, sail);
    k.box(0.02, 0.4, 0.26, o.flag ?? C.red, 0.3, 0, 1.7, {}, body);
    for (const s of [-1, 1]) k.cyl(0.07, 0.07, 0.5, 0x2e3438, 0.4, s * 0.6, 0.45, { rot: [Math.PI / 2, 0, 0], seg: 6 }, body);
    root.userData.parts = { root, body, sail, legs: [], wings: [] };
    return root;
}

// a sack of loot on the ground, and the flash of a coin
export function buildLoot() {
    const k = new Kit(5);
    const body = k.group(0, 0, 0);
    k.ball(0.2, 0xc8a878, 0, 0, 0.17, { scale: [1, 1, 0.9], seg: 8, seg2: 6 }, body);
    k.cyl(0.07, 0.1, 0.1, 0xb08a58, 0, 0, 0.36, { seg: 6 }, body);
    k.box(0.16, 0.03, 0.03, C.red, 0, 0, 0.32, {}, body);
    k.cyl(0.08, 0.08, 0.02, C.gold, 0.2, 0.1, 0.02, { seg: 8, emit: 0.4 }, body);
    k.g.userData.parts = { root: k.g, body, legs: [] };
    return k.g;
}

export const PROP_KINDS = Object.keys(PROP);
export { CIRC };
