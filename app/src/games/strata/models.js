// Strata models: props and creatures built from primitives. Every part's
// geometry carries its own colour (and glow) as vertex attributes, so whole
// scenes can be merged into a few meshes and drawn with one lit shader.
//
// Props stand in their cell: origin at the cell centre on the floor. Wall props
// get p.face: 'x' when the wall is on their -x side, 'y' when it is on -y.

import * as THREE from 'three';

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

const C = {
    wood: 0x9a6a3e, dark: 0x6b4428, light: 0xc8955a, stone: 0xbab4a8, dstone: 0x7a7686, iron: 0x5a5e68, gold: 0xe6b73c,
    red: 0xd8503f, cloth: 0xefe3c6, leaf: 0x7fb84e, leaf2: 0x5f9a3f, leaf3: 0x9ccf5a, ink: 0x1c1828, white: 0xffffff,
    flame: 0xffc84a, flame2: 0xff7a2a, crystal: 0x8ff0ff, bone: 0xece4cf, straw: 0xe0bd5c, purple: 0x9a6fd6, teal: 0x3f9b9b,
};

function paint(geo, color, emit = 0) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    const em = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
        em[i] = emit;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('emit', new THREE.BufferAttribute(em, 1));
    if (g.attributes.uv) g.deleteAttribute('uv');
    return g;
}

// a model under construction
class Kit {
    constructor(seed = 1) {
        this.g = new THREE.Group();
        this.r = rng(seed);
    }

    add(geo, color, x = 0, y = 0, z = 0, o = {}, parent = this.g) {
        const m = new THREE.Mesh(paint(geo, color, o.emit ?? 0), PLACEHOLDER);
        m.position.set(x, y, z);
        if (o.rot) m.rotation.set(...o.rot);
        if (o.scale) m.scale.set(...o.scale);
        if (o.noOutline) m.userData.noOutline = true;
        parent.add(m);
        return m;
    }

    box(w, d, h, c, x, y, z, o, p) { return this.add(new THREE.BoxGeometry(w, d, h), c, x, y, z, o, p); }
    ball(r, c, x, y, z, o = {}, p) { return this.add(new THREE.SphereGeometry(r, o.seg ?? 12, o.seg2 ?? 8), c, x, y, z, o, p); }
    ico(r, c, x, y, z, o = {}, p) { return this.add(new THREE.IcosahedronGeometry(r, o.detail ?? 0), c, x, y, z, o, p); }
    cyl(rt, rb, h, c, x, y, z, o = {}, p) { return this.add(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 10).rotateX(Math.PI / 2), c, x, y, z, o, p); }
    cone(r, h, c, x, y, z, o = {}, p) { return this.add(new THREE.ConeGeometry(r, h, o.seg ?? 8).rotateX(Math.PI / 2), c, x, y, z, o, p); }
    torus(r, t, c, x, y, z, o = {}, p) { return this.add(new THREE.TorusGeometry(r, t, o.seg ?? 8, o.seg2 ?? 20), c, x, y, z, o, p); }
    group(x = 0, y = 0, z = 0, parent = this.g) {
        const g = new THREE.Group();
        g.position.set(x, y, z);
        parent.add(g);
        return g;
    }

    flame(x, y, z, s = 1, p) {
        this.cone(0.11 * s, 0.32 * s, C.flame, x, y, z + 0.16 * s, { emit: 1, noOutline: true, seg: 6 }, p);
        this.cone(0.06 * s, 0.2 * s, 0xfff2b0, x, y, z + 0.12 * s, { emit: 1, noOutline: true, seg: 6 }, p);
    }
}

// ---------------------------------------------------------------- props
// place the model in its cell, turned by rot quarter turns or toward its wall
function placed(k, p) {
    const g = k.g;
    g.position.set(p.x + 0.5, p.y + 0.5, p.z);
    if (p.face === 'x') g.rotation.z = 0; // faces +x
    else if (p.face === 'y') g.rotation.z = Math.PI / 2; // faces +y
    else if (p.rot) g.rotation.z = (p.rot * Math.PI) / 2;
    return g;
}

const PROP = {
    tree(k) {
        const { r } = k;
        k.cyl(0.13, 0.2, 1.4, C.dark, 0, 0, 0.7, { seg: 7 });
        const g = [C.leaf, C.leaf2, C.leaf3][Math.floor(r() * 3)];
        k.ico(0.7, g, 0, 0, 1.75, { detail: 1 });
        k.ico(0.48, g, 0.3 * (r() - 0.5), 0.3, 2.3, { detail: 1 });
        k.ico(0.42, g, -0.35, -0.1, 2.05, { detail: 1 });
        if (r() < 0.4) for (let i = 0; i < 3; i++) k.ball(0.07, C.red, (r() - 0.5) * 0.9, (r() - 0.5) * 0.9, 1.5 + r() * 0.7, { noOutline: true, seg: 6, seg2: 4 });
    },
    pine(k) {
        k.cyl(0.1, 0.15, 0.8, C.dark, 0, 0, 0.4, { seg: 6 });
        for (let i = 0; i < 3; i++) k.cone(0.7 - i * 0.18, 0.8, 0x4f8a50, 0, 0, 0.9 + i * 0.45, { seg: 8 });
    },
    deadtree(k) {
        const { r } = k;
        k.cyl(0.08, 0.16, 1.8, 0x5b4a44, 0, 0, 0.9, { seg: 6 });
        for (let i = 0; i < 3; i++) k.cyl(0.03, 0.06, 0.8, 0x5b4a44, 0, 0, 1.2 + i * 0.3, { rot: [0.8 * (r() - 0.5) + 0.9, 0, i * 2.1], seg: 5 });
    },
    bush(k) {
        const { r } = k;
        const c = [C.leaf, C.leaf2][Math.floor(r() * 2)];
        k.ico(0.38, c, 0, 0, 0.32, { detail: 1 });
        k.ico(0.26, c, 0.24, 0.1, 0.26, { detail: 1 });
        if (r() < 0.5) for (let i = 0; i < 4; i++) k.ball(0.05, [C.white, C.red, 0xf7a8b8][i % 3], (r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 0.45 + r() * 0.2, { noOutline: true, seg: 6, seg2: 4 });
    },
    rock(k) {
        const { r } = k;
        k.ico(0.4, 0xa9a5b5, 0, 0, 0.28, { rot: [r() * 3, r() * 3, r() * 3], scale: [1, 1, 0.75] });
    },
    boulder(k) {
        const { r } = k;
        k.ico(0.5, 0x9a96a6, 0, 0, 0.4, { rot: [r() * 3, r() * 3, r() * 3], detail: 1, scale: [1, 0.9, 0.8] });
    },
    flowers(k) {
        const { r } = k;
        for (let i = 0; i < 4; i++) {
            const x = (r() - 0.5) * 0.7;
            const y = (r() - 0.5) * 0.7;
            k.cyl(0.015, 0.015, 0.28, 0x5f7f25, x, y, 0.14, { noOutline: true, seg: 4 });
            k.ball(0.07, [C.white, C.red, C.purple, 0xf9d65c][i % 4], x, y, 0.3, { seg: 6, seg2: 4 });
        }
    },
    grass(k) {
        const { r } = k;
        for (let i = 0; i < 6; i++) k.cone(0.05, 0.3, 0x6f9f2a, (r() - 0.5) * 0.8, (r() - 0.5) * 0.8, 0.15, { noOutline: true, seg: 4, rot: [(r() - 0.5) * 0.4, (r() - 0.5) * 0.4, 0] });
    },
    mushrooms(k) {
        const { r } = k;
        for (let i = 0; i < 3; i++) {
            const x = (r() - 0.5) * 0.6;
            const y = (r() - 0.5) * 0.6;
            const s = 0.6 + r() * 0.6;
            k.cyl(0.04 * s, 0.05 * s, 0.2 * s, C.cloth, x, y, 0.1 * s, { seg: 6 });
            k.add(new THREE.SphereGeometry(0.13 * s, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), [C.red, C.purple, 0xe8a04a][i % 3], x, y, 0.2 * s);
        }
    },
    glowcap(k) {
        const { r } = k;
        for (let i = 0; i < 4; i++) {
            const x = (r() - 0.5) * 0.7;
            const y = (r() - 0.5) * 0.7;
            k.cyl(0.03, 0.04, 0.25, 0xd8cfe8, x, y, 0.12, { seg: 5, noOutline: true });
            k.add(new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), 0xc08cff, x, y, 0.25, { emit: 0.9 });
        }
    },
    reeds(k) {
        const { r } = k;
        for (let i = 0; i < 6; i++) {
            const x = (r() - 0.5) * 0.7;
            const y = (r() - 0.5) * 0.7;
            const h = 0.5 + r() * 0.5;
            k.cyl(0.015, 0.02, h, 0x6f8f3a, x, y, h / 2, { noOutline: true, seg: 4 });
            if (i % 2) k.cyl(0.04, 0.04, 0.16, 0x6b4428, x, y, h, { seg: 6 });
        }
    },
    lily(k) {
        const { r } = k;
        for (let i = 0; i < 2; i++) k.cyl(0.22, 0.22, 0.02, 0x5fa84a, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0.01, { seg: 10 });
        k.ball(0.06, 0xf7c8e0, 0.05, 0, 0.05, { seg: 6, seg2: 4 });
    },
    pebbles(k) {
        const { r } = k;
        for (let i = 0; i < 4; i++) k.ball(0.06 + r() * 0.06, 0xa9a5b5, (r() - 0.5) * 0.7, (r() - 0.5) * 0.7, 0.04, { scale: [1, 1, 0.6], seg: 6, seg2: 4 });
    },
    bones(k) {
        const { r } = k;
        for (let i = 0; i < 3; i++) k.cyl(0.03, 0.03, 0.4, C.bone, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0.04, { rot: [Math.PI / 2, 0, r() * 3], seg: 5 });
        k.ball(0.12, C.bone, 0.1, 0.1, 0.1, { seg: 8, seg2: 6 });
        k.ball(0.03, C.ink, 0.18, 0.15, 0.12, { noOutline: true, seg: 4, seg2: 3 });
    },
    moss(k) {
        const { r } = k;
        for (let i = 0; i < 3; i++) k.ball(0.2 + r() * 0.12, 0x5f9a5a, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0.02, { scale: [1, 1, 0.25], noOutline: true, seg: 8, seg2: 4 });
    },
    rug(k) {
        k.box(0.95, 0.75, 0.02, 0xa03a3a, 0, 0, 0.01, { noOutline: true });
        k.box(0.75, 0.55, 0.025, 0xe0b33a, 0, 0, 0.012, { noOutline: true });
        k.box(0.55, 0.35, 0.03, 0x3b5a8a, 0, 0, 0.014, { noOutline: true });
    },
    croprow(k) {
        const { r } = k;
        k.box(0.8, 0.3, 0.1, 0x7a5a3a, 0, 0, 0.05, { noOutline: true });
        for (let i = 0; i < 3; i++) {
            k.cyl(0.02, 0.02, 0.25, 0x5f8f2a, -0.28 + i * 0.28, 0, 0.2, { noOutline: true, seg: 4 });
            k.ball(0.08, r() < 0.5 ? 0xe8903a : 0x7fb84e, -0.28 + i * 0.28, 0, 0.33, { seg: 6, seg2: 4 });
        }
    },
    rail(k) {
        for (const s of [-0.22, 0.22]) k.box(1, 0.05, 0.05, C.iron, 0, s, 0.03, { noOutline: true });
        for (const x of [-0.3, 0.05, 0.4]) k.box(0.12, 0.65, 0.04, C.dark, x, 0, 0.02, { noOutline: true });
    },
    scrolls(k) {
        const { r } = k;
        for (let i = 0; i < 3; i++) k.cyl(0.05, 0.05, 0.4, C.cloth, (r() - 0.5) * 0.4, (r() - 0.5) * 0.4, 0.05 + i * 0.02, { rot: [0, Math.PI / 2, r() * 3], seg: 6 });
    },
    cobweb(k) {
        k.add(new THREE.CircleGeometry(0.45, 6, 0, Math.PI / 2), 0xe8e8f0, -0.45, 0, 1.5, { rot: [Math.PI / 2, 0, 0], noOutline: true });
    },
    stalagmite(k) {
        const { r } = k;
        k.cone(0.28, 0.9 + r() * 0.5, 0x8e8aa0, 0, 0, 0.5, { seg: 7 });
        k.cone(0.14, 0.5, 0x8e8aa0, 0.22, 0.12, 0.25, { seg: 6 });
    },
    stalactites(k) {
        const { r } = k;
        for (let i = 0; i < 3; i++) {
            const l = 0.4 + r() * 0.9;
            k.cone(0.12 + r() * 0.08, l, 0x86829a, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6, -l / 2, { rot: [Math.PI, 0, 0], seg: 6 });
        }
    },
    giantshroom(k) {
        const { r } = k;
        const h = 1.8 + r() * 1.4;
        k.cyl(0.14, 0.22, h, 0xeae0f2, 0, 0, h / 2, { seg: 8 });
        const cap = [0x9a6fd6, 0xd8503f, 0x4fb3b0][Math.floor(r() * 3)];
        k.add(new THREE.SphereGeometry(0.85, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), cap, 0, 0, h - 0.1, { emit: 0.35, scale: [1, 1, 0.7] });
        k.cyl(0.8, 0.8, 0.06, 0xf1e6ff, 0, 0, h - 0.1, { emit: 0.5, noOutline: true, seg: 14 });
        for (let i = 0; i < 5; i++) {
            const a = r() * 6.28;
            k.ball(0.09, 0xffffff, Math.cos(a) * 0.45, Math.sin(a) * 0.45, h + 0.3, { noOutline: true, emit: 0.4, seg: 6, seg2: 4 });
        }
    },
    crystals(k) {
        const { r } = k;
        const c = [0x8ff0ff, 0xc08cff, 0x8fffc0][Math.floor(r() * 3)];
        for (let i = 0; i < 4; i++) k.cone(0.1 + r() * 0.08, 0.5 + r() * 0.7, c, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0.3, { rot: [(r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 0], emit: 0.7, seg: 5 });
    },
    barrel(k) {
        k.cyl(0.3, 0.3, 0.78, 0xb97f45, 0, 0, 0.39, { seg: 12 });
        for (const z of [0.15, 0.63]) k.cyl(0.315, 0.315, 0.06, C.iron, 0, 0, z, { seg: 12, noOutline: true });
        k.cyl(0.26, 0.26, 0.02, 0xc8955a, 0, 0, 0.785, { seg: 12, noOutline: true });
    },
    crate(k) {
        k.box(0.72, 0.72, 0.72, 0xc98f52, 0, 0, 0.36);
        k.box(0.74, 0.1, 0.74, 0x9a6a3e, 0, 0, 0.36, { rot: [0, Math.PI / 4, 0], noOutline: true });
        k.box(0.1, 0.74, 0.74, 0x9a6a3e, 0, 0, 0.36, { rot: [Math.PI / 4, 0, 0], noOutline: true });
    },
    crates(k) {
        PROP.crate(k);
        k.box(0.55, 0.55, 0.55, 0xb98449, 0.05, -0.05, 1.0, { rot: [0, 0, 0.3] });
    },
    table(k) {
        k.box(0.9, 0.7, 0.08, C.light, 0, 0, 0.62);
        for (const [x, y] of [[-0.38, -0.28], [0.38, -0.28], [-0.38, 0.28], [0.38, 0.28]]) k.box(0.07, 0.07, 0.6, C.wood, x, y, 0.3, { noOutline: true });
        k.cyl(0.08, 0.06, 0.12, 0xe8e0d0, 0.2, 0.1, 0.72, { seg: 8 });
        k.box(0.2, 0.3, 0.03, C.cloth, -0.2, 0, 0.67, { noOutline: true });
    },
    chair(k) {
        k.box(0.42, 0.42, 0.06, C.light, 0, 0, 0.42);
        k.box(0.06, 0.42, 0.5, C.wood, -0.19, 0, 0.7);
        for (const [x, y] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) k.box(0.05, 0.05, 0.4, C.wood, x, y, 0.2, { noOutline: true });
    },
    bed(k) {
        k.box(0.9, 0.62, 0.3, C.wood, 0, 0, 0.2);
        k.box(0.86, 0.58, 0.1, C.cloth, 0, 0, 0.38);
        k.box(0.5, 0.6, 0.12, 0x6f8fc8, 0.18, 0, 0.44);
        k.box(0.2, 0.45, 0.1, 0xffffff, -0.3, 0, 0.47);
        k.box(0.08, 0.62, 0.55, C.dark, -0.44, 0, 0.35);
    },
    shelf(k) {
        k.box(0.3, 0.9, 1.7, C.wood, -0.3, 0, 0.85);
        for (const z of [0.4, 0.85, 1.3]) {
            k.box(0.34, 0.86, 0.05, C.light, -0.28, 0, z, { noOutline: true });
            k.cyl(0.07, 0.07, 0.18, [0x7fa6d9, 0xd8503f, 0xe6b73c][Math.round(z * 3) % 3], -0.25, -0.2, z + 0.12, { seg: 8 });
            k.box(0.14, 0.2, 0.2, 0x8a3b3b, -0.25, 0.18, z + 0.12);
        }
    },
    bookshelf(k) {
        const { r } = k;
        k.box(0.35, 0.95, 1.9, C.dark, -0.3, 0, 0.95);
        for (let row = 0; row < 4; row++) {
            let y = -0.4;
            while (y < 0.38) {
                const w = 0.06 + r() * 0.06;
                const h = 0.26 + r() * 0.1;
                k.box(0.26, w, h, [0x8a3b3b, 0x3b5a8a, 0x4f7a3b, 0xb58a3a, 0x6a3b7a][Math.floor(r() * 5)], -0.2, y + w / 2, 0.12 + row * 0.44 + h / 2, { noOutline: true });
                y += w + 0.01;
            }
        }
    },
    desk(k) {
        PROP.table(k);
        k.box(0.3, 0.22, 0.03, C.cloth, 0.1, -0.12, 0.68, { noOutline: true });
        k.cyl(0.04, 0.05, 0.14, 0xf1e6cf, -0.3, 0.2, 0.73, { seg: 6 });
        k.flame(-0.3, 0.2, 0.8, 0.5);
    },
    candles(k) {
        const { r } = k;
        for (let i = 0; i < 4; i++) {
            const x = (r() - 0.5) * 0.4;
            const y = (r() - 0.5) * 0.4;
            const h = 0.12 + r() * 0.2;
            k.cyl(0.04, 0.045, h, 0xf1e6cf, x, y, h / 2, { seg: 6 });
            k.flame(x, y, h, 0.45);
        }
    },
    torch(k) {
        k.box(0.08, 0.2, 0.3, C.iron, -0.44, 0, 1.4);
        k.cyl(0.04, 0.03, 0.45, C.dark, -0.34, 0, 1.55, { rot: [0, -0.5, 0], seg: 6 });
        k.flame(-0.25, 0, 1.75, 1.1);
    },
    lantern(k) {
        k.box(0.2, 0.2, 0.25, 0xffe27a, 0, 0, 0.12, { emit: 0.9 });
        k.cone(0.16, 0.12, C.iron, 0, 0, 0.3, { seg: 4 });
    },
    lamppost(k) {
        k.cyl(0.05, 0.08, 1.8, 0x3a3a44, 0, 0, 0.9, { seg: 8 });
        k.box(0.28, 0.28, 0.34, 0xffe27a, 0, 0, 1.95, { emit: 1 });
        k.cone(0.24, 0.2, 0x3a3a44, 0, 0, 2.22, { seg: 4 });
    },
    brazier(k) {
        k.cyl(0.08, 0.14, 0.6, C.iron, 0, 0, 0.3, { seg: 8 });
        k.cyl(0.32, 0.18, 0.2, C.iron, 0, 0, 0.7, { seg: 10 });
        k.flame(0.05, 0, 0.78, 1.6);
        k.flame(-0.1, 0.05, 0.76, 1.1);
    },
    campfire(k) {
        for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; k.ico(0.1, 0x8e8aa0, Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.06, { rot: [i, i * 2, 0] }); }
        for (let i = 0; i < 3; i++) k.cyl(0.05, 0.06, 0.6, C.dark, 0, 0, 0.1, { rot: [Math.PI / 2, 0, (i * Math.PI) / 3], seg: 6 });
    },
    well(k) {
        k.cyl(0.45, 0.48, 0.6, C.stone, 0, 0, 0.3, { seg: 12 });
        k.cyl(0.36, 0.36, 0.05, 0x4a7a9a, 0, 0, 0.55, { seg: 12, noOutline: true });
        for (const s of [-0.4, 0.4]) k.box(0.07, 0.07, 1.2, C.wood, s, 0, 0.9);
        k.box(0.95, 0.08, 0.08, C.wood, 0, 0, 1.45);
        k.cone(0.7, 0.4, 0xb84a3a, 0, 0, 1.7, { seg: 4, rot: [0, 0, Math.PI / 4] });
        k.cyl(0.1, 0.08, 0.16, C.wood, 0.05, 0, 1.1, { seg: 8 });
    },
    stall(k) {
        k.box(0.9, 0.55, 0.7, C.wood, 0, 0.1, 0.35);
        for (const x of [-0.42, 0.42]) k.box(0.06, 0.06, 1.7, C.dark, x, -0.2, 0.85);
        k.box(1.0, 0.7, 0.05, 0xd8503f, 0, 0, 1.7, { rot: [0.25, 0, 0] });
        k.box(1.0, 0.72, 0.03, 0xf2ead8, 0, 0, 1.68, { rot: [0.25, 0, 0], scale: [0.35, 1, 1], noOutline: true });
        for (let i = 0; i < 4; i++) k.ball(0.09, [0xe0452e, 0xf2c14e, 0x7fb84e, 0xe8903a][i], -0.3 + i * 0.2, 0.2, 0.78, { seg: 8, seg2: 6 });
    },
    bench(k) {
        k.box(0.9, 0.32, 0.07, C.light, 0, 0, 0.42);
        for (const x of [-0.36, 0.36]) k.box(0.07, 0.28, 0.4, C.wood, x, 0, 0.2);
    },
    fence(k) {
        for (const x of [-0.4, 0.4]) k.box(0.08, 0.08, 0.75, C.wood, x, 0, 0.37);
        for (const z of [0.3, 0.6]) k.box(0.95, 0.05, 0.08, C.light, 0, 0, z);
    },
    scarecrow(k) {
        k.box(0.07, 0.07, 1.6, C.wood, 0, 0, 0.8);
        k.box(0.9, 0.06, 0.06, C.wood, 0, 0, 1.3);
        k.box(0.4, 0.2, 0.5, 0x8a6a4a, 0, 0, 1.2);
        k.ball(0.2, C.straw, 0, 0, 1.65);
        k.cone(0.3, 0.3, 0x6b4428, 0, 0, 1.85);
        k.ball(0.03, C.ink, 0.19, -0.07, 1.68, { noOutline: true, seg: 4, seg2: 3 });
        k.ball(0.03, C.ink, 0.19, 0.07, 1.68, { noOutline: true, seg: 4, seg2: 3 });
    },
    haystack(k) {
        k.add(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), C.straw, 0, 0, 0, { scale: [1, 1, 1.3] });
    },
    cart(k) {
        k.box(0.9, 0.6, 0.35, C.wood, 0, 0, 0.5);
        for (const [x, y] of [[-0.3, -0.34], [0.3, -0.34], [-0.3, 0.34], [0.3, 0.34]]) k.cyl(0.18, 0.18, 0.05, C.dark, x, y, 0.2, { rot: [Math.PI / 2, 0, 0], seg: 10 });
        k.box(0.5, 0.05, 0.05, C.wood, 0.65, 0, 0.45);
    },
    minecart(k) {
        PROP.rail(k);
        k.box(0.8, 0.55, 0.45, 0x6e6a78, 0, 0, 0.42);
        k.box(0.7, 0.45, 0.1, 0x3e3a45, 0, 0, 0.62, { noOutline: true });
        for (let i = 0; i < 4; i++) k.ico(0.12, [0xf2c14e, 0x5a5566, 0x7fe8ff][i % 3], (i - 1.5) * 0.15, 0.05, 0.72, { rot: [i, i, i] });
        for (const [x, y] of [[-0.25, -0.28], [0.25, -0.28], [-0.25, 0.28], [0.25, 0.28]]) k.cyl(0.1, 0.1, 0.05, C.iron, x, y, 0.14, { rot: [Math.PI / 2, 0, 0], seg: 8 });
    },
    scaffold(k) {
        for (const [x, y] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) k.box(0.09, 0.09, 2.8, C.wood, x, y, 1.4);
        for (const z of [1.0, 2.2]) {
            k.box(0.95, 0.95, 0.06, C.light, 0, 0, z);
            k.box(0.08, 1.2, 0.06, C.wood, 0.4, 0, z - 0.45, { rot: [0.9, 0, 0], noOutline: true });
        }
        k.cyl(0.02, 0.02, 1.4, 0xd9c49a, 0.2, 0.2, 2.1, { seg: 4, noOutline: true });
        k.box(0.14, 0.14, 0.18, C.iron, 0.2, 0.2, 1.35);
    },
    anvil(k) {
        k.box(0.3, 0.3, 0.35, C.dark, 0, 0, 0.18);
        k.box(0.2, 0.22, 0.18, C.iron, 0, 0, 0.45);
        k.box(0.65, 0.3, 0.14, C.iron, 0.05, 0, 0.6);
        k.cone(0.12, 0.25, C.iron, 0.45, 0, 0.6, { rot: [0, Math.PI / 2, 0], seg: 6 });
        k.box(0.08, 0.3, 0.06, C.dark, -0.05, 0.25, 0.72, { rot: [0, 0, 0.6] });
    },
    furnace(k) {
        k.box(0.8, 0.9, 1.3, 0x7a6a66, -0.1, 0, 0.65);
        k.box(0.1, 0.5, 0.45, 0xff7a2a, 0.31, 0, 0.45, { emit: 1, noOutline: true });
        k.cyl(0.2, 0.28, 0.9, 0x5a4a46, -0.2, 0, 1.7, { seg: 8 });
        k.flame(0.33, 0, 0.3, 1.2);
    },
    chains(k) {
        for (let i = 0; i < 7; i++) k.torus(0.07, 0.02, C.iron, 0, 0, 2.8 - i * 0.14, { rot: [0, (i % 2) * Math.PI / 2, 0], seg: 5, seg2: 10, noOutline: true });
        k.cone(0.12, 0.25, C.iron, 0, 0, 1.85, { rot: [Math.PI, 0, 0], seg: 6 });
    },
    gear(k) {
        const g = k.group(-0.45, 0, 1.6);
        g.rotation.y = Math.PI / 2;
        k.cyl(0.5, 0.5, 0.1, 0x9a8a66, 0, 0, 0, { seg: 16 }, g);
        for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28; k.box(0.14, 0.14, 0.1, 0x9a8a66, Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0, { rot: [0, 0, a] }, g); }
        k.cyl(0.12, 0.12, 0.16, C.iron, 0, 0, 0, { seg: 8 }, g);
    },
    sarcophagus(k) {
        k.box(0.95, 0.6, 0.5, 0x6e6a78, 0, 0, 0.25);
        k.box(1.0, 0.66, 0.12, 0x7e7a88, 0, 0, 0.56);
        k.ball(0.12, 0x7e7a88, 0.3, 0, 0.66, { scale: [1, 1, 0.5] });
        k.box(0.5, 0.18, 0.05, 0x5d5a70, -0.1, 0, 0.64, { noOutline: true });
    },
    urn(k) {
        const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.16, 0.02), new THREE.Vector2(0.24, 0.2), new THREE.Vector2(0.2, 0.42), new THREE.Vector2(0.12, 0.5), new THREE.Vector2(0.15, 0.58), new THREE.Vector2(0.001, 0.58)];
        k.add(new THREE.LatheGeometry(pts, 12).rotateX(Math.PI / 2), [0xc8704c, 0x9a8a66, 0x6a8a9a][Math.floor(k.r() * 3)], 0, 0, 0);
    },
    altar(k) {
        k.box(0.7, 0.9, 0.7, 0xd8d2e2, 0, 0, 0.35);
        k.box(0.8, 1.0, 0.1, 0xb8a0ff, 0, 0, 0.72, { emit: 0.3 });
        k.ico(0.16, 0xc9b8ff, 0, 0, 1.0, { emit: 0.8 });
        k.flame(0.2, 0.35, 0.78, 0.6);
        k.flame(0.2, -0.35, 0.78, 0.6);
    },
    pew(k) {
        k.box(0.4, 0.95, 0.07, C.wood, 0, 0, 0.4);
        k.box(0.07, 0.95, 0.55, C.dark, -0.18, 0, 0.62);
        for (const y of [-0.42, 0.42]) k.box(0.4, 0.07, 0.4, C.dark, 0, y, 0.2);
    },
    statue(k) {
        k.box(0.8, 0.8, 0.4, 0xa9a5b5, 0, 0, 0.2);
        k.cyl(0.22, 0.32, 1.2, 0xc8c2d4, 0, 0, 1.0, { seg: 8 });
        k.ball(0.2, 0xc8c2d4, 0, 0, 1.8);
        k.box(0.1, 0.1, 1.3, 0xc8c2d4, 0.25, 0.2, 1.2, { rot: [0.2, 0, 0] });
        k.cone(0.08, 0.3, 0xc8c2d4, 0.3, 0.33, 1.95, { seg: 4 });
    },
    column(k) {
        k.box(0.7, 0.7, 0.2, 0xd9d2c1, 0, 0, 0.1);
        k.cyl(0.26, 0.3, 2.5, 0xe2dccd, 0, 0, 1.4, { seg: 10 });
        k.box(0.7, 0.7, 0.2, 0xd9d2c1, 0, 0, 2.75);
    },
    brokencolumn(k) {
        const { r } = k;
        k.box(0.7, 0.7, 0.2, 0xb9b3a4, 0, 0, 0.1);
        k.cyl(0.26, 0.3, 0.6 + r() * 0.5, 0xc9c2b3, 0, 0, 0.5, { seg: 10 });
        k.cyl(0.26, 0.26, 0.7, 0xc9c2b3, 0.45, 0.3, 0.2, { rot: [Math.PI / 2, 0, r() * 3], seg: 10 });
    },
    tombstone(k) {
        const { r } = k;
        k.box(0.12, 0.5, 0.6, 0x9a96a6, -0.2, 0, 0.3, { rot: [0, (r() - 0.5) * 0.3, 0] });
        k.cyl(0.25, 0.25, 0.12, 0x9a96a6, -0.2, 0, 0.6, { rot: [0, Math.PI / 2, 0], seg: 12 });
        k.box(0.5, 0.4, 0.06, 0x6f8f4a, 0.15, 0, 0.03, { noOutline: true });
    },
    banner(k) {
        k.box(0.06, 0.8, 0.06, C.dark, -0.45, 0, 2.6);
        k.box(0.03, 0.6, 1.2, [0xa03a3a, 0x3b5a8a, 0x4f7a3b][Math.floor(k.r() * 3)], -0.44, 0, 1.95);
        k.ico(0.12, C.gold, -0.42, 0, 2.1, { noOutline: true });
    },
    fireplace(k) {
        k.box(0.5, 1.0, 1.5, 0x9a8a86, -0.25, 0, 0.75);
        k.box(0.12, 0.6, 0.55, 0x2a1a14, 0.02, 0, 0.3, { noOutline: true });
        k.box(0.6, 1.1, 0.12, C.wood, -0.2, 0, 1.2);
        k.flame(0.05, 0, 0.05, 1.3);
        k.flame(0.05, 0.12, 0.05, 0.9);
    },
    globe(k) {
        k.cyl(0.05, 0.15, 0.6, C.wood, 0, 0, 0.3, { seg: 8 });
        k.torus(0.32, 0.02, C.gold, 0, 0, 0.9, { rot: [0, 0.4, 0], noOutline: true });
        k.ball(0.28, 0x6fa7c8, 0, 0, 0.9);
        k.ball(0.12, 0x7fb84e, 0.12, 0.12, 1.0, { scale: [1, 1, 0.7], noOutline: true });
    },
    telescope(k) {
        for (let i = 0; i < 3; i++) k.cyl(0.02, 0.03, 1.1, C.dark, Math.cos(i * 2.1) * 0.2, Math.sin(i * 2.1) * 0.2, 0.5, { rot: [Math.sin(i * 2.1) * 0.35, -Math.cos(i * 2.1) * 0.35, 0], seg: 5 });
        k.cyl(0.08, 0.12, 1.1, C.gold, 0.15, 0.1, 1.2, { rot: [0.3, 0.9, 0], seg: 10 });
    },
    signpost(k) {
        k.box(0.08, 0.08, 1.3, C.wood, 0, 0, 0.65);
        k.box(0.06, 0.62, 0.3, C.light, 0.06, 0, 1.1);
        k.box(0.07, 0.4, 0.04, C.ink, 0.1, 0, 1.12, { noOutline: true });
    },
    cauldron(k) {
        k.add(new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, Math.PI / 3, Math.PI * 2 / 3).rotateX(Math.PI / 2), 0x3a3a44, 0, 0, 0.35);
        k.cyl(0.3, 0.3, 0.03, 0x8aff9a, 0, 0, 0.52, { emit: 0.9, noOutline: true, seg: 12 });
        for (let i = 0; i < 3; i++) k.ball(0.05, 0xb8ffc0, (i - 1) * 0.1, 0.05, 0.56, { emit: 0.8, noOutline: true, seg: 6, seg2: 4 });
    },
    boat(k) {
        const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.22, 0.02), new THREE.Vector2(0.3, 0.2), new THREE.Vector2(0.32, 0.26), new THREE.Vector2(0.001, 0.26)];
        k.add(new THREE.LatheGeometry(pts, 12).rotateX(Math.PI / 2), C.wood, 0, 0, -0.05, { scale: [2.2, 1, 1] });
        k.box(0.05, 0.55, 0.04, C.dark, 0, 0, 0.18);
        k.box(0.8, 0.05, 0.05, C.light, 0.2, 0.2, 0.22, { rot: [0, 0, 0.3] });
    },
    nets(k) {
        k.box(0.05, 0.8, 0.8, 0xd9c49a, -0.2, 0, 0.5, { noOutline: true });
        for (let i = 0; i < 3; i++) k.ball(0.06, 0xe0b33a, -0.17, -0.3 + i * 0.3, 0.2 + i * 0.25, { seg: 6, seg2: 4 });
        k.box(0.06, 0.06, 1.0, C.wood, -0.25, -0.42, 0.5);
    },
    glowworms(k) {
        const { r } = k;
        for (let i = 0; i < 9; i++) k.ball(0.035, 0x9fffd0, -0.46, (r() - 0.5) * 0.9, 1 + r() * 2, { emit: 1, noOutline: true, seg: 5, seg2: 3 });
        for (let i = 0; i < 4; i++) k.cyl(0.004, 0.004, 0.4, 0xcfffe8, -0.45, (r() - 0.5) * 0.8, 2.6, { noOutline: true, seg: 3 });
    },
    roots(k) {
        const { r } = k;
        for (let i = 0; i < 4; i++) k.cyl(0.05, 0.1, 2.2, 0x7a5a3e, -0.4, (r() - 0.5) * 0.8, 1.6, { rot: [(r() - 0.5) * 0.6, 0.15, 0], seg: 6 });
    },
    vines(k) {
        const { r } = k;
        for (let i = 0; i < 5; i++) {
            const y = (r() - 0.5) * 0.9;
            const h = 1 + r() * 1.6;
            k.cyl(0.02, 0.02, h, 0x4f8a3b, -0.46, y, 3 - h / 2, { seg: 4, noOutline: true });
            for (let j = 0; j < 4; j++) k.ball(0.06, C.leaf, -0.44, y + (r() - 0.5) * 0.1, 3 - h * (j / 4), { scale: [0.4, 1, 0.6], seg: 5, seg2: 3, noOutline: true });
        }
    },
    bedroll(k) {
        k.box(0.9, 0.5, 0.1, 0x7a8a5a, 0, 0, 0.05);
        k.cyl(0.14, 0.14, 0.5, 0x8a9a6a, -0.38, 0, 0.14, { rot: [Math.PI / 2, 0, 0], seg: 8 });
    },
    logseat(k) {
        k.cyl(0.2, 0.2, 0.9, 0x8a6a4a, 0, 0, 0.2, { rot: [0, Math.PI / 2, 0], seg: 10 });
        k.cyl(0.19, 0.19, 0.02, 0xc8955a, 0.45, 0, 0.2, { rot: [0, Math.PI / 2, 0], seg: 10, noOutline: true });
    },
    tent(k) {
        k.add(new THREE.ConeGeometry(0.9, 1.5, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4), 0xc8a060, 0, 0, 0.75);
        k.box(0.05, 0.4, 0.8, 0x3a2a20, 0.33, 0.33, 0.4, { rot: [0, 0, Math.PI / 4], noOutline: true });
    },
    mapboard(k) {
        k.box(0.08, 0.95, 0.8, C.wood, -0.44, 0, 1.3);
        k.box(0.02, 0.8, 0.62, 0xefe3c6, -0.39, 0, 1.3, { noOutline: true });
        for (let i = 0; i < 4; i++) k.box(0.02, 0.3, 0.02, C.ink, -0.37, -0.2 + i * 0.12, 1.2 + i * 0.08, { rot: [0.3 * i, 0, 0], noOutline: true });
    },
    pickaxes(k) {
        for (let i = 0; i < 2; i++) {
            k.box(0.05, 0.05, 0.9, C.wood, -0.42, -0.2 + i * 0.4, 1.0, { rot: [0.3 - i * 0.6, 0, 0] });
            k.box(0.05, 0.5, 0.07, C.iron, -0.42, -0.1 + i * 0.2, 1.45, { rot: [0.3 - i * 0.6, 0, 0] });
        }
    },
    bellows(k) {
        k.box(0.6, 0.45, 0.25, 0x8a5a3a, 0, 0, 0.3, { rot: [0, 0.2, 0] });
        k.box(0.3, 0.1, 0.1, C.iron, 0.4, 0, 0.3);
    },
    ingots(k) {
        for (let i = 0; i < 5; i++) k.box(0.35, 0.14, 0.1, i % 2 ? C.gold : 0xc0c4cc, (i % 3) * 0.12 - 0.12, Math.floor(i / 3) * 0.16 - 0.08, 0.05 + Math.floor(i / 3) * 0.1, { rot: [0, 0, (i % 2) * 0.2] });
    },
    sapling(k) {
        k.cyl(0.03, 0.04, 0.5, C.dark, 0, 0, 0.25, { seg: 5 });
        k.ico(0.22, C.leaf3, 0, 0, 0.6, { detail: 1 });
    },
    beehive(k) {
        k.box(0.08, 0.08, 0.6, C.wood, 0, 0, 0.3);
        k.add(new THREE.SphereGeometry(0.3, 10, 8), 0xe0b33a, 0, 0, 0.8, { scale: [1, 1, 1.2] });
        for (let i = 0; i < 3; i++) k.torus(0.25 - Math.abs(i - 1) * 0.06, 0.03, 0xc8952a, 0, 0, 0.66 + i * 0.15, { noOutline: true });
        k.ball(0.07, C.ink, 0.27, 0, 0.72, { noOutline: true, seg: 6, seg2: 4 });
    },
    beam(k) {
        k.box(0.12, 0.12, 1.6, C.dark, 0, 0, -0.8);
        k.box(0.1, 0.1, 1.2, C.wood, 0, 0, -0.45, { rot: [0.7, 0, 0] });
    },
    arch(k) {
        const g = k.group(0, 0, -0.5);
        g.rotation.z = k.g.rotation.z;
        k.add(new THREE.TorusGeometry(0.5, 0.12, 6, 12, Math.PI), C.stone, 0, 0, 0, { rot: [Math.PI / 2, 0, 0] }, g);
    },
    sap(k) {
        k.ball(0.18, 0xa8ff6a, 0, 0, 0.05, { scale: [1.4, 1.1, 0.3], emit: 0.9, noOutline: true });
        k.ball(0.06, 0xd8ffb0, 0.1, 0.05, 0.1, { emit: 1, noOutline: true, seg: 6, seg2: 4 });
    },
    window(k, p) {
        const g = k.group(0, 0, 0);
        void g;
        k.box(0.08, 0.9, 0.1, C.dark, -0.44, 0, 0.05);
        k.box(0.08, 0.9, 0.1, C.dark, -0.44, 0, 1.95);
        k.box(0.08, 0.06, 1.9, C.dark, -0.44, 0, 1.0, { noOutline: true });
        k.box(0.06, 0.8, 0.06, C.dark, -0.44, 0, 1.0, { noOutline: true });
        void p;
    },
    doorframe(k) {
        for (const y of [-0.46, 0.46]) k.box(0.2, 0.1, 2.1, C.dark, -0.4, y, 1.05);
        k.box(0.22, 1.0, 0.14, C.dark, -0.4, 0, 2.05);
    },
    railing(k, p) {
        const c = p.style === 'stone' ? C.stone : p.style === 'iron' ? C.iron : C.wood;
        if (p.style === 'rope') {
            k.box(0.08, 0.08, 0.95, c, -0.45, -0.45, 0.47);
            k.cyl(0.02, 0.02, 1.0, 0xd9c49a, -0.45, 0, 0.8, { rot: [Math.PI / 2, 0, 0], seg: 4, noOutline: true });
            k.cyl(0.02, 0.02, 1.0, 0xd9c49a, -0.45, 0, 0.45, { rot: [Math.PI / 2, 0, 0], seg: 4, noOutline: true });
        } else if (p.style === 'stone') {
            k.box(0.16, 1.0, 0.14, c, -0.43, 0, 0.72);
            for (const y of [-0.3, 0, 0.3]) k.cyl(0.05, 0.07, 0.65, c, -0.43, y, 0.33, { seg: 6 });
        } else {
            k.box(0.05, 1.0, 0.05, c, -0.45, 0, 0.8);
            for (const y of [-0.4, -0.2, 0, 0.2, 0.4]) k.box(0.03, 0.03, 0.8, c, -0.45, y, 0.4, { noOutline: true });
        }
        if (p.lamp) {
            k.box(0.06, 0.06, 1.4, C.dark, -0.45, -0.45, 0.7);
            k.box(0.2, 0.2, 0.24, 0xffe27a, -0.45, -0.45, 1.5, { emit: 1 });
        }
    },
    torchpost(k) {
        k.cyl(0.06, 0.09, 1.3, C.dark, 0, 0, 0.65, { seg: 6 });
        k.cyl(0.12, 0.08, 0.14, C.iron, 0, 0, 1.35, { seg: 8 });
        k.flame(0, 0, 1.4, 1.3);
    },
    glowpost(k) {
        k.cone(0.2, 1.3, 0x86829a, 0, 0, 0.65, { seg: 6 });
        for (let i = 0; i < 6; i++) k.ball(0.05, 0x9fffd0, Math.cos(i) * 0.12, Math.sin(i) * 0.12, 0.6 + i * 0.12, { emit: 1, noOutline: true, seg: 5, seg2: 3 });
    },
    sappost(k) {
        k.cyl(0.08, 0.14, 1.4, 0x7a5a3e, 0, 0, 0.7, { seg: 6, rot: [0.1, 0.1, 0] });
        k.ball(0.18, 0xa8ff6a, 0.05, 0, 1.45, { emit: 1 });
    },
    candlepost(k) {
        k.cyl(0.04, 0.12, 1.3, C.iron, 0, 0, 0.65, { seg: 6 });
        k.cyl(0.18, 0.1, 0.06, C.iron, 0, 0, 1.3, { seg: 8 });
        for (let i = 0; i < 3; i++) { k.cyl(0.03, 0.03, 0.14, 0xf1e6cf, Math.cos(i * 2.1) * 0.1, Math.sin(i * 2.1) * 0.1, 1.4, { seg: 5 }); k.flame(Math.cos(i * 2.1) * 0.1, Math.sin(i * 2.1) * 0.1, 1.47, 0.4); }
    },
    crystalpost(k) {
        k.cone(0.16, 1.1, 0x86829a, 0, 0, 0.55, { seg: 5 });
        k.cone(0.12, 0.6, 0x8ff0ff, 0, 0, 1.3, { emit: 1, seg: 5 });
    },
};

// build one prop, placed in the world; null if the kind is unknown
export function buildProp(p) {
    const f = PROP[p.kind];
    if (!f) return null;
    const k = new Kit(p.seed ?? 1);
    placed(k, p);
    f(k, p);
    return k.g;
}
export const PROP_KINDS = Object.keys(PROP);

// ---------------------------------------------------------------- the god's sword
export function buildGodsword(lm) {
    const k = new Kit(3);
    const g = k.g;
    g.position.set(lm.x + 0.5, lm.y + 0.5, 0);
    const bladeTop = lm.top - 5;
    const len = bladeTop - lm.bottom;
    k.box(1.6, 0.5, len, 0xd9d4de, 0, 0, lm.bottom + len / 2);
    k.box(0.35, 0.56, len, 0xb9b3c6, 0, 0, lm.bottom + len / 2, { noOutline: true });
    k.cone(1.13, 1.8, 0xd9d4de, 0, 0, lm.bottom - 0.9, { rot: [Math.PI, 0, Math.PI / 4], scale: [1, 0.32, 1], seg: 4 });
    k.box(4.6, 0.8, 0.8, 0xb5773a, 0, 0, bladeTop + 0.4);
    for (const s of [-2.4, 2.4]) k.ball(0.55, C.gold, s, 0, bladeTop + 0.4);
    k.cyl(0.36, 0.36, 2.4, 0x6b4428, 0, 0, bladeTop + 2);
    for (let i = 0; i < 5; i++) k.torus(0.38, 0.05, C.gold, 0, 0, bladeTop + 1.1 + i * 0.45, { noOutline: true });
    k.torus(0.85, 0.24, C.gold, 0, 0, bladeTop + 4.1, { rot: [Math.PI / 2, 0, Math.PI / 4] });
    k.ball(0.5, 0xffffff, 0, 0, bladeTop + 4.1, { scale: [1, 0.4, 0.8] });
    k.ball(0.24, C.ink, 0.12, 0.12, bladeTop + 4.1, { noOutline: true });
    // runes glowing down the blade
    for (let z = lm.bottom + 2; z < bladeTop - 1; z += 3) k.box(0.3, 0.6, 0.5, 0x9a7bff, 0, 0, z, { emit: 0.9, noOutline: true });
    return g;
}

// a ladder up the wall on the -x or -y side of its column, poking over the top
export function buildLadder(l) {
    const k = new Kit(l.x * 31 + l.y);
    const g = k.g;
    const [wx, wy] = l.wall;
    g.position.set(l.x + 0.5 + wx * 0.4, l.y + 0.5 + wy * 0.4, 0);
    g.rotation.z = wx !== 0 ? 0 : Math.PI / 2;
    const h = l.top - l.bottom + 0.9;
    for (const s of [-0.28, 0.28]) k.box(0.07, 0.07, h, C.wood, 0, s, l.bottom + h / 2);
    for (let z = l.bottom + 0.3; z < l.top + 0.8; z += 0.36) k.box(0.05, 0.56, 0.05, C.light, 0.02, 0, z);
    return g;
}

// ---------------------------------------------------------------- dynamic things
export function buildChest(c) {
    const k = new Kit(c.id);
    k.g.position.set(c.x + 0.5, c.y + 0.5, c.z);
    const s = c.big ? 1.15 : 1;
    const body = k.group(0, 0, 0);
    body.scale.setScalar(s);
    k.box(0.8, 0.6, 0.45, c.big ? 0x5a4a8a : 0xb5773a, 0, 0, 0.23, {}, body);
    k.box(0.84, 0.64, 0.08, C.gold, 0, 0, 0.1, {}, body);
    const lid = k.group(0, -0.3, 0.45, body);
    k.add(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI), c.big ? 0x6a5a9a : 0xc98a45, 0, 0.3, 0, {}, lid);
    if (c.locked) k.box(0.18, 0.08, 0.22, C.gold, 0.1, 0.32, 0.28, {}, body);
    if (c.big) k.ico(0.1, 0x7ff0e2, 0, 0.33, 0.3, { emit: 1 }, body);
    k.g.userData.lid = lid;
    return k.g;
}

export function buildLever(l) {
    const k = new Kit(l.id);
    k.g.position.set(l.x + 0.5, l.y + 0.5, l.z);
    k.g.rotation.z = l.face === 'y' ? Math.PI / 2 : 0;
    k.box(0.3, 0.5, 0.5, C.dstone, -0.3, 0, 0.25);
    const arm = k.group(-0.2, 0, 0.35);
    k.box(0.06, 0.06, 0.6, C.iron, 0, 0, 0.3, {}, arm);
    k.ball(0.09, C.red, 0, 0, 0.62, {}, arm);
    arm.rotation.y = -0.7;
    k.g.userData.arm = arm;
    return k.g;
}

export function buildGate(gt) {
    const k = new Kit(gt.id);
    k.g.position.set(gt.x + 0.5, gt.y + 0.5, gt.z);
    k.g.rotation.z = gt.face === 'y' ? Math.PI / 2 : 0;
    const bars = k.group(0, 0, 0);
    for (let i = 0; i < 5; i++) k.box(0.06, 0.06, 1.95, C.iron, 0, -0.4 + i * 0.2, 0.98, {}, bars);
    for (const z of [0.4, 1.3, 1.9]) k.box(0.08, 1.0, 0.07, C.iron, 0, 0, z, {}, bars);
    for (let i = 0; i < 5; i++) k.cone(0.05, 0.14, C.iron, 0, -0.4 + i * 0.2, 2.02, { seg: 4 }, bars);
    k.g.userData.bars = bars;
    return k.g;
}

export function buildPedestal(p) {
    const k = new Kit(p.id);
    k.g.position.set(p.x + 0.5, p.y + 0.5, p.z);
    k.cyl(0.28, 0.36, 0.2, C.stone, 0, 0, 0.1, { seg: 8 });
    k.cyl(0.18, 0.22, 0.6, C.stone, 0, 0, 0.5, { seg: 8 });
    k.cyl(0.3, 0.26, 0.12, C.stone, 0, 0, 0.86, { seg: 8 });
    const item = k.group(0, 0, 1.25);
    if (p.seal) {
        k.torus(0.2, 0.06, 0x7ff0e2, 0, 0, 0, { emit: 0.9, rot: [Math.PI / 2, 0, 0] }, item);
        k.ico(0.1, 0xffffff, 0, 0, 0, { emit: 1 }, item);
    } else relicModel(k, p.relic, item);
    k.g.userData.item = item;
    return k.g;
}

// a small token per relic kind
function relicModel(k, id, g) {
    const r = rng(id.length * 31 + id.charCodeAt(0));
    const c = [0xe6b73c, 0x7fe8ff, 0xd8503f, 0x9a6fd6, 0x7fb84e][Math.floor(r() * 5)];
    const shape = Math.floor(r() * 4);
    if (shape === 0) k.ico(0.16, c, 0, 0, 0, { emit: 0.4, detail: 0 }, g);
    else if (shape === 1) k.torus(0.14, 0.05, c, 0, 0, 0, { emit: 0.4 }, g);
    else if (shape === 2) k.box(0.22, 0.08, 0.28, c, 0, 0, 0, { emit: 0.4 }, g);
    else k.cone(0.12, 0.34, c, 0, 0, 0, { emit: 0.4, seg: 5 }, g);
}

export function buildSign(s) {
    const k = new Kit(s.id);
    k.g.position.set(s.x + 0.5, s.y + 0.5, s.z);
    PROP.signpost(k);
    return k.g;
}

export function buildFlames(c) {
    const k = new Kit(c.id);
    k.g.position.set(c.x + 0.5, c.y + 0.5, c.z);
    const f = k.group(0, 0, 0.05);
    for (let i = 0; i < 3; i++) k.flame(Math.cos(i * 2.1) * 0.08, Math.sin(i * 2.1) * 0.08, 0.05, 1.5 - i * 0.2, f);
    k.flame(0, 0, 0.12, 2.2, f);
    k.g.userData.flames = f;
    return k.g;
}

// ---- items lying about
export function buildItem(kind) {
    const k = new Kit(kind.length);
    const g = k.g;
    if (kind === 'coin') k.cyl(0.16, 0.16, 0.05, 0xf0c23a, 0, 0, 0, { rot: [Math.PI / 2, 0, 0], seg: 12, emit: 0.2 });
    else if (kind === 'gem') k.add(new THREE.OctahedronGeometry(0.16), 0xff5a8a, 0, 0, 0, { emit: 0.4 });
    else if (kind === 'potion') { k.ball(0.17, 0xe2463c, 0, 0, 0, { emit: 0.25 }); k.cyl(0.06, 0.06, 0.16, C.cloth, 0, 0, 0.2, { seg: 8 }); }
    else if (kind === 'food') { k.ball(0.15, 0xe0452e, 0, 0, 0); k.cyl(0.015, 0.015, 0.1, C.dark, 0, 0, 0.16, { seg: 4 }); k.ball(0.06, C.leaf, 0.05, 0, 0.18, { scale: [1, 0.4, 0.6], seg: 6, seg2: 4 }); }
    else if (kind === 'key') { k.torus(0.1, 0.035, 0xf0c23a, -0.16, 0, 0, { seg: 6, seg2: 12, emit: 0.3 }); k.box(0.32, 0.05, 0.05, 0xf0c23a, 0.08, 0, 0, { emit: 0.3 }); k.box(0.05, 0.05, 0.12, 0xf0c23a, 0.2, 0, -0.07, { emit: 0.3 }); g.rotation.x = Math.PI / 2; }
    else if (kind === 'seal') { k.torus(0.2, 0.06, 0x7ff0e2, 0, 0, 0, { emit: 1, rot: [Math.PI / 2, 0, 0] }); k.ico(0.1, 0xffffff, 0, 0, 0, { emit: 1 }); }
    else if (kind === 'heart') { k.ball(0.12, 0xe2463c, -0.09, 0, 0.07, { emit: 0.3 }); k.ball(0.12, 0xe2463c, 0.09, 0, 0.07, { emit: 0.3 }); k.cone(0.18, 0.24, 0xe2463c, 0, 0, -0.1, { rot: [Math.PI, 0, 0], seg: 12, emit: 0.3 }); }
    else if (kind === 'sword') { k.box(0.07, 0.05, 0.55, 0xe0e4ec, 0, 0, 0.1, { emit: 0.3 }); k.box(0.28, 0.07, 0.05, C.gold, 0, 0, -0.18); k.box(0.05, 0.05, 0.14, C.dark, 0, 0, -0.27); g.rotation.y = 0.5; }
    return g;
}

// ---------------------------------------------------------------- creatures
// Each creature: root (moved and turned), body (bobbed and squashed), limbs for
// walking, wings for flapping, an arm for striking. Looks down its +x axis.
function eyes(k, parent, x, z, spread, size, closed = false, glow = 0) {
    for (const s of [-1, 1]) {
        if (closed) { k.box(0.02, size * 1.5, size * 0.25, C.ink, x, s * spread, z, { noOutline: true }, parent); continue; }
        k.ball(size, glow ? 0xfff2a0 : 0xffffff, x, s * spread, z, { seg: 8, seg2: 6, emit: glow }, parent);
        k.ball(size * 0.5, C.ink, x + size * 0.6, s * spread, z, { noOutline: true, seg: 6, seg2: 4 }, parent);
    }
}

export function buildCreature(kind, def, opts = {}) {
    const k = new Kit(kind.length * 7);
    const root = k.g;
    const body = k.group(0, 0, 0);
    const parts = { root, body, legs: [], wings: [], arm: null, head: null };
    const c = def.color;
    switch (def.model) {
        case 'bird': {
            k.ball(0.2, c, 0, 0, 0.28, { scale: [1.25, 1, 1] }, body);
            parts.head = k.group(0.16, 0, 0.44, body);
            k.ball(0.12, c, 0, 0, 0, {}, parts.head);
            k.cone(0.05, 0.14, 0xf0a33a, 0.14, 0, -0.02, { rot: [0, Math.PI / 2, 0], seg: 6 }, parts.head);
            eyes(k, parts.head, 0.07, 0.03, 0.06, 0.035);
            for (const s of [-1, 1]) { const w = k.group(0, s * 0.18, 0.32, body); k.ball(0.13, c, -0.03, s * 0.06, 0, { scale: [1.2, 0.4, 0.6] }, w); parts.wings.push(w); }
            for (const s of [-1, 1]) parts.legs.push(k.box(0.03, 0.03, 0.14, 0xf0a33a, 0, s * 0.07, 0.07, { noOutline: true }, body));
            break;
        }
        case 'sheep': {
            for (let i = 0; i < 6; i++) k.ball(0.22, c, -0.2 + (i % 3) * 0.2, (Math.floor(i / 3) - 0.5) * 0.22, 0.5 + (i % 2) * 0.06, {}, body);
            parts.head = k.group(0.38, 0, 0.55, body);
            k.ball(0.15, 0x3a3440, 0, 0, 0, { scale: [1.2, 1, 1] }, parts.head);
            eyes(k, parts.head, 0.1, 0.04, 0.07, 0.035);
            for (const [x, y] of [[-0.2, -0.13], [0.2, -0.13], [-0.2, 0.13], [0.2, 0.13]]) parts.legs.push(k.box(0.07, 0.07, 0.34, 0x3a3440, x, y, 0.17, {}, body));
            break;
        }
        case 'slime': {
            k.ball(0.36, c, 0, 0, 0.26, { scale: [1, 1, 0.72], seg: 14, seg2: 10 }, body);
            k.ball(0.12, 0xffffff, -0.12, -0.12, 0.42, { noOutline: true, emit: 0.2, seg: 6, seg2: 4 }, body);
            eyes(k, body, 0.26, 0.36, 0.12, 0.075);
            break;
        }
        case 'quad': {
            k.box(0.7, 0.34, 0.34, c, 0, 0, 0.5, {}, body);
            parts.head = k.group(0.42, 0, 0.66, body);
            k.box(0.3, 0.28, 0.26, c, 0, 0, 0, {}, parts.head);
            k.box(0.2, 0.16, 0.14, c, 0.2, 0, -0.06, {}, parts.head);
            for (const s of [-1, 1]) k.cone(0.07, 0.16, c, -0.05, s * 0.1, 0.18, { seg: 4 }, parts.head);
            eyes(k, parts.head, 0.15, 0.05, 0.08, 0.04, false, opts.night ? 1 : 0);
            k.cone(0.06, 0.35, c, -0.45, 0, 0.6, { rot: [0, -1.1, 0], seg: 5 }, body);
            for (const [x, y] of [[-0.25, -0.12], [0.25, -0.12], [-0.25, 0.12], [0.25, 0.12]]) parts.legs.push(k.box(0.09, 0.09, 0.36, c, x, y, 0.18, {}, body));
            break;
        }
        case 'biped': {
            const skin = kind === 'skeleton' ? C.bone : c;
            const big = kind === 'guardian';
            k.box(0.34, 0.3, 0.42, kind === 'skeleton' ? C.bone : kind === 'kobold' ? 0x8a6a4a : kind === 'drowned' ? 0x4f6a60 : 0x4a4f6a, 0, 0, 0.62, {}, body);
            if (kind === 'skeleton') for (let i = 0; i < 3; i++) k.box(0.36, 0.32, 0.03, C.ink, 0, 0, 0.5 + i * 0.1, { noOutline: true }, body);
            parts.head = k.group(0, 0, 1.0, body);
            k.ball(0.2, skin, 0, 0, 0, { seg: 12, seg2: 8 }, parts.head);
            eyes(k, parts.head, 0.14, 0.03, 0.08, 0.05, false, kind === 'skeleton' || big ? 0.9 : 0);
            if (kind === 'kobold') { k.cyl(0.21, 0.23, 0.12, 0xe6b73c, 0, 0, 0.14, { seg: 10 }, parts.head); k.box(0.08, 0.1, 0.08, 0xffe27a, 0.2, 0, 0.14, { emit: 1 }, parts.head); }
            if (kind === 'drowned') k.cone(0.24, 0.2, 0x3f7a5a, 0, 0, 0.14, { seg: 7 }, parts.head);
            if (big) { k.cone(0.25, 0.4, 0x7a7f9a, 0, 0, 0.28, { seg: 6 }, parts.head); k.box(0.5, 0.5, 0.1, 0x7a7f9a, 0, 0, 0.35, { rot: [0, 0, Math.PI / 4] }, body); }
            for (const s of [-1, 1]) parts.legs.push(k.box(0.1, 0.1, 0.42, skin === C.bone ? C.bone : 0x3a3440, 0, s * 0.09, 0.21, {}, body));
            parts.arm = k.group(0.05, 0.22, 0.78, body);
            k.box(0.08, 0.08, 0.34, skin, 0, 0, -0.14, {}, parts.arm);
            const weapon = kind === 'kobold' ? 'pick' : big ? 'hammer' : 'blade';
            if (weapon === 'pick') { k.box(0.04, 0.04, 0.5, C.wood, 0.1, 0, -0.3, { rot: [0, 1.2, 0] }, parts.arm); k.box(0.05, 0.3, 0.05, C.iron, 0.3, 0, -0.38, {}, parts.arm); }
            else if (weapon === 'hammer') { k.box(0.06, 0.06, 0.9, C.wood, 0.2, 0, -0.4, { rot: [0, 1.2, 0] }, parts.arm); k.box(0.3, 0.3, 0.4, C.iron, 0.6, 0, -0.55, {}, parts.arm); }
            else k.box(0.05, 0.03, 0.5, 0xcfd2da, 0.18, 0, -0.3, { rot: [0, 1.3, 0] }, parts.arm);
            break;
        }
        case 'ghost': {
            const pts = [new THREE.Vector2(0.001, 0.02), new THREE.Vector2(0.2, 0.12), new THREE.Vector2(0.3, 0.0), new THREE.Vector2(0.42, 0.1), new THREE.Vector2(0.4, 0.55), new THREE.Vector2(0.28, 0.9), new THREE.Vector2(0.001, 1.0)];
            k.add(new THREE.LatheGeometry(pts, 16).rotateX(Math.PI / 2), c, 0, 0, 0, { emit: 0.25 }, body);
            eyes(k, body, 0.33, 0.62, 0.13, 0.09);
            k.box(0.02, 0.14, 0.06, C.ink, 0.4, 0, 0.45, { noOutline: true }, body);
            break;
        }
        case 'bat': {
            k.ball(0.14, c, 0, 0, 0, {}, body);
            eyes(k, body, 0.1, 0.04, 0.05, 0.03, false, 0.8);
            for (const s of [-1, 1]) { const w = k.group(0, s * 0.1, 0.02, body); k.add(new THREE.ConeGeometry(0.2, 0.36, 3).rotateX(Math.PI / 2 * s), c, 0, s * 0.16, 0, { scale: [1, 1, 0.2] }, w); parts.wings.push(w); }
            for (const s of [-1, 1]) k.cone(0.04, 0.1, c, 0, s * 0.06, 0.14, { seg: 4 }, body);
            break;
        }
        case 'rat': {
            k.ball(0.18, c, 0, 0, 0.16, { scale: [1.5, 1, 0.9] }, body);
            parts.head = k.group(0.26, 0, 0.18, body);
            k.cone(0.1, 0.22, c, 0.06, 0, 0, { rot: [0, Math.PI / 2, 0], seg: 7 }, parts.head);
            for (const s of [-1, 1]) k.ball(0.06, 0xd8a0a0, -0.02, s * 0.08, 0.08, {}, parts.head);
            eyes(k, parts.head, 0.05, 0.05, 0.05, 0.025);
            k.cyl(0.015, 0.01, 0.4, 0xd8a0a0, -0.42, 0, 0.12, { rot: [0, Math.PI / 2 - 0.2, 0], seg: 4, noOutline: true }, body);
            break;
        }
        case 'cube': {
            k.box(0.7, 0.7, 0.7, c, 0, 0, 0.55, { rot: [0, 0, 0.1] }, body);
            k.box(0.3, 0.3, 0.3, c, 0, 0, 1.05, { rot: [0.4, 0.4, 0] }, body);
            eyes(k, body, 0.36, 0.7, 0.16, 0.08, false, kind === 'cgolem' ? 1 : 0.6);
            for (const s of [-1, 1]) { const a = k.group(0, s * 0.45, 0.7, body); k.box(0.25, 0.25, 0.45, c, 0, 0, -0.15, {}, a); if (s > 0) parts.arm = a; }
            for (const s of [-1, 1]) parts.legs.push(k.box(0.22, 0.22, 0.22, c, 0, s * 0.18, 0.11, {}, body));
            if (kind === 'cgolem') for (let i = 0; i < 4; i++) k.cone(0.1, 0.4, 0xbff8ff, (i - 1.5) * 0.15, (i % 2 - 0.5) * 0.3, 1.0, { emit: 0.8, seg: 5 }, body);
            break;
        }
        case 'frog': {
            k.ball(0.26, c, 0, 0, 0.2, { scale: [1.2, 1.1, 0.75] }, body);
            for (const s of [-1, 1]) { k.ball(0.09, c, 0.12, s * 0.12, 0.36, {}, body); k.ball(0.06, 0xffffff, 0.16, s * 0.12, 0.4, { seg: 6, seg2: 4 }, body); k.ball(0.03, C.ink, 0.21, s * 0.12, 0.41, { noOutline: true, seg: 4, seg2: 3 }, body); }
            for (const s of [-1, 1]) parts.legs.push(k.ball(0.1, c, -0.15, s * 0.22, 0.08, { scale: [1.4, 0.7, 0.6] }, body));
            break;
        }
        case 'crab': {
            k.ball(0.3, c, 0, 0, 0.3, { scale: [0.9, 1.3, 0.55] }, body);
            eyes(k, body, 0.2, 0.46, 0.1, 0.05);
            for (const s of [-1, 1]) { const a = k.group(0.25, s * 0.35, 0.3, body); k.ball(0.14, c, 0.1, 0, 0, { scale: [1.3, 0.8, 0.7] }, a); if (s > 0) parts.arm = a; }
            for (let i = 0; i < 6; i++) parts.legs.push(k.box(0.04, 0.04, 0.25, c, -0.1 + (i % 3) * 0.1, (i < 3 ? -1 : 1) * 0.3, 0.12, { rot: [(i < 3 ? 1 : -1) * 0.6, 0, 0] }, body));
            break;
        }
        case 'shroom': {
            const s = def.size;
            k.cyl(0.14, 0.18, 0.5, 0xeae0f2, 0, 0, 0.3, { seg: 8 }, body);
            k.add(new THREE.SphereGeometry(0.36, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), c, 0, 0, 0.5, { scale: [1, 1, 0.8], emit: 0.2 }, body);
            for (let i = 0; i < 4; i++) k.ball(0.05, 0xffffff, Math.cos(i * 1.6) * 0.22, Math.sin(i * 1.6) * 0.22, 0.72, { noOutline: true, seg: 5, seg2: 3 }, body);
            eyes(k, body, 0.14, 0.38, 0.07, 0.045);
            for (const t of [-1, 1]) parts.legs.push(k.box(0.07, 0.07, 0.14, 0xeae0f2, 0, t * 0.07, 0.07, {}, body));
            if (s > 1) { parts.arm = k.group(0.05, 0.2, 0.4, body); k.box(0.04, 0.04, 0.6, 0xcfd2da, 0.15, 0, -0.15, { rot: [0, 1.3, 0] }, parts.arm); }
            break;
        }
        case 'moth':
        case 'wisp': {
            k.ball(def.model === 'wisp' ? 0.18 : 0.1, c, 0, 0, 0, { emit: 1 }, body);
            if (def.model === 'moth') for (const s of [-1, 1]) { const w = k.group(0, s * 0.05, 0.02, body); k.ball(0.14, 0xf5e6c0, 0, s * 0.13, 0, { scale: [1, 1, 0.15] }, w); parts.wings.push(w); }
            else k.ball(0.28, c, 0, 0, 0, { emit: 0.6, noOutline: true, scale: [1, 1, 1] }, body);
            break;
        }
        case 'imp': {
            k.ball(0.24, c, 0, 0, 0.45, { scale: [1, 1, 1.1] }, body);
            for (const s of [-1, 1]) k.cone(0.06, 0.2, 0x3a1a14, 0, s * 0.14, 0.72, { rot: [s * 0.4, 0, 0], seg: 5 }, body);
            eyes(k, body, 0.18, 0.5, 0.09, 0.05, false, 1);
            for (const s of [-1, 1]) { const w = k.group(-0.1, s * 0.2, 0.55, body); k.add(new THREE.ConeGeometry(0.16, 0.3, 3).rotateX(Math.PI / 2 * s), 0x8a2a1a, 0, s * 0.12, 0, { scale: [1, 1, 0.2] }, w); parts.wings.push(w); }
            for (const s of [-1, 1]) parts.legs.push(k.box(0.07, 0.07, 0.24, c, 0, s * 0.1, 0.12, {}, body));
            k.flame(0, 0, 0.72, 0.8, body);
            break;
        }
        case 'lizard': {
            k.ball(0.22, c, 0, 0, 0.25, { scale: [1.8, 1, 0.8] }, body);
            parts.head = k.group(0.42, 0, 0.32, body);
            k.ball(0.16, c, 0, 0, 0, { scale: [1.4, 1, 0.8] }, parts.head);
            eyes(k, parts.head, 0.08, 0.08, 0.1, 0.045, false, 1);
            k.cone(0.12, 0.6, c, -0.6, 0, 0.22, { rot: [0, -Math.PI / 2 - 0.2, 0], seg: 6 }, body);
            for (let i = 0; i < 4; i++) k.cone(0.05, 0.14, 0xffc24a, -0.2 + i * 0.14, 0, 0.44, { seg: 4, emit: 0.6 }, body);
            for (const [x, y] of [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.18], [0.2, 0.18]]) parts.legs.push(k.box(0.07, 0.07, 0.2, c, x, y, 0.1, {}, body));
            break;
        }
        case 'book': {
            k.box(0.34, 0.08, 0.44, c, 0, 0, 0.1, {}, body);
            for (const s of [-1, 1]) { const w = k.group(0, s * 0.04, 0.1, body); k.box(0.3, 0.02, 0.4, 0xefe3c6, 0, s * 0.14, 0, {}, w); k.box(0.34, 0.03, 0.44, c, 0, s * 0.3, 0, {}, w); parts.wings.push(w); }
            eyes(k, body, 0.18, 0.2, 0.08, 0.05, false, 0.6);
            break;
        }
        case 'owl': {
            k.ball(0.26, c, 0, 0, 0.35, { scale: [0.9, 1, 1.2] }, body);
            k.ball(0.18, 0xe8d6b8, 0.12, 0, 0.3, { scale: [0.5, 1, 1.1], noOutline: true }, body);
            for (const s of [-1, 1]) { k.ball(0.09, 0xffffff, 0.18, s * 0.1, 0.52, {}, body); k.ball(0.05, 0xe6b73c, 0.25, s * 0.1, 0.53, { noOutline: true }, body); k.ball(0.025, C.ink, 0.28, s * 0.1, 0.53, { noOutline: true, seg: 4, seg2: 3 }, body); k.cone(0.05, 0.14, c, 0.05, s * 0.14, 0.72, { seg: 4 }, body); }
            for (const s of [-1, 1]) { const w = k.group(0, s * 0.24, 0.35, body); k.ball(0.14, c, 0, 0, 0, { scale: [0.8, 0.3, 1.2] }, w); parts.wings.push(w); }
            break;
        }
        case 'beetle': {
            k.ball(0.3, c, 0, 0, 0.26, { scale: [1.3, 1, 0.7] }, body);
            k.box(0.02, 0.5, 0.2, C.ink, 0, 0, 0.44, { noOutline: true }, body);
            k.ball(0.14, 0x2a3a2a, 0.36, 0, 0.24, {}, body);
            for (const s of [-1, 1]) k.cone(0.03, 0.22, 0x2a3a2a, 0.46, s * 0.06, 0.34, { rot: [0, 1.0, 0], seg: 4 }, body);
            eyes(k, body, 0.44, 0.28, 0.07, 0.035);
            for (let i = 0; i < 6; i++) parts.legs.push(k.box(0.03, 0.03, 0.2, 0x2a3a2a, -0.2 + (i % 3) * 0.2, (i < 3 ? -1 : 1) * 0.28, 0.1, {}, body));
            break;
        }
        case 'thorn': {
            k.ico(0.34, c, 0, 0, 0.4, { detail: 1 }, body);
            for (let i = 0; i < 9; i++) { const a = i * 0.7; k.cone(0.05, 0.3, 0x4a5a2a, Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.4 + Math.sin(i) * 0.2, { rot: [Math.sin(a) * 1.2, -Math.cos(a) * 1.2, 0], seg: 4 }, body); }
            eyes(k, body, 0.3, 0.5, 0.1, 0.06, false, 0.5);
            k.ball(0.08, 0xd8503f, 0, 0, 0.78, { emit: 0.3 }, body);
            for (const s of [-1, 1]) parts.legs.push(k.cyl(0.04, 0.06, 0.3, 0x5a4a2a, 0, s * 0.14, 0.12, { seg: 5 }, body));
            break;
        }
        default:
            k.ball(0.3, c, 0, 0, 0.3, {}, body);
    }
    body.scale.setScalar(def.size * (opts.scale ?? 1));
    root.userData.parts = parts;
    return root;
}

export function buildHero() {
    const k = new Kit(11);
    const root = k.g;
    const body = k.group(0, 0, 0);
    const parts = { root, body, legs: [], arm: null, head: null, cape: null };
    k.cone(0.26, 0.55, 0x3b5a8a, 0, 0, 0.42, { seg: 10 }, body);
    k.box(0.32, 0.3, 0.08, 0x8a5a3a, 0, 0, 0.42, {}, body);
    parts.head = k.group(0, 0, 0.82, body);
    k.ball(0.22, 0xf6e1c4, 0, 0, 0, { seg: 14, seg2: 10 }, parts.head);
    k.ball(0.23, 0xd8503f, -0.03, 0, 0.07, { scale: [1, 1, 0.8], seg: 12, seg2: 8 }, parts.head);
    k.cone(0.08, 0.3, 0xd8503f, -0.2, 0, 0.12, { rot: [0, -1.2, 0], seg: 6 }, parts.head);
    eyes(k, parts.head, 0.17, 0.0, 0.08, 0.045);
    parts.cape = k.group(-0.16, 0, 0.64, body);
    k.box(0.04, 0.4, 0.5, 0xd8503f, 0, 0, -0.22, { rot: [0, -0.15, 0] }, parts.cape);
    for (const s of [-1, 1]) parts.legs.push(k.box(0.09, 0.09, 0.22, 0x3a3440, 0, s * 0.09, 0.11, {}, body));
    parts.arm = k.group(0.04, 0.24, 0.52, body);
    k.box(0.07, 0.07, 0.24, 0xf6e1c4, 0, 0, -0.08, {}, parts.arm);
    k.box(0.05, 0.035, 0.62, 0xe0e4ec, 0.26, 0, -0.08, { rot: [0, 1.35, 0], emit: 0.15 }, parts.arm);
    k.box(0.06, 0.2, 0.05, 0xe6b73c, 0.02, 0, -0.18, {}, parts.arm);
    // a small lantern at the belt
    parts.lantern = k.box(0.08, 0.08, 0.1, 0xffe27a, 0.05, -0.2, 0.38, { emit: 1 }, body);
    root.userData.parts = parts;
    return root;
}

export function buildMerchant(m) {
    const k = new Kit(m.id);
    k.g.position.set(m.x + 0.5, m.y + 0.5, m.z);
    k.cone(0.34, 0.9, 0x6a3b7a, 0, 0, 0.45, { seg: 10 });
    k.ball(0.22, 0xf0d0b0, 0, 0, 1.0);
    k.cone(0.34, 0.5, 0x3a2a4a, 0, 0, 1.3, { seg: 10, rot: [0, -0.2, 0] });
    k.ball(0.14, 0xf2f2f2, 0.12, 0, 0.86, { scale: [0.8, 1.2, 1.3] });
    eyes(k, k.g, 0.2, 1.02, 0.07, 0.035);
    k.box(0.5, 0.4, 0.45, 0x8a6a4a, -0.3, 0.35, 0.22);
    k.ball(0.12, 0xe2463c, -0.3, 0.35, 0.55, { emit: 0.3 });
    k.ball(0.1, 0xf0c23a, -0.18, 0.25, 0.52, { emit: 0.3 });
    k.box(0.06, 0.06, 1.4, C.dark, 0.3, -0.35, 0.7);
    k.box(0.16, 0.16, 0.2, 0xffe27a, 0.3, -0.35, 1.45, { emit: 1 });
    return k.g;
}

export { C as COLORS };
