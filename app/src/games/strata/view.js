// Strata renderer. The world is meshed in 16³ chunks: only the faces the
// isometric camera can see (+x, +y, +z), textured from the painted atlas, with
// baked ambient occlusion and a "sky" term that darkens whatever hangs under
// another tier. One lit shader draws blocks, props and creatures: hemisphere
// ambient, a sun that moves with the time of day, the eight nearest lamps,
// ink hatching in the dark and a haze that swallows the tiers below the hero.
// When something above hides the hero, everything over their head is cut away
// and the cut is capped with dark hatching, like a cutaway drawing.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { B, BLOCKS, DIRS4 } from './world.js';
import { makeAtlas } from './textures.js';
import * as MODELS from './models.js';
import { BIOMES, KINDS } from './lore.js';

THREE.ColorManagement.enabled = false;

export const CAM_DIR = new THREE.Vector3(1, 1, 1).normalize();
export const L_HERO = 1;
export const L_XRAY = 2;
const CH = 16;
const INK = 0x1c1828;
const MAXL = 8;

// ---------------------------------------------------------------- shaders
const LIT_VERT = /* glsl */ `
#ifndef OBJSKY
attribute float sky;
#endif
attribute float emit;
varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying float vSky; varying float vEmit;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vCol = color;
#ifndef NOTEX
    vUv = uv;
#endif
#ifndef OBJSKY
    vSky = sky;
#endif
    vEmit = emit;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const LIT_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSkyAmb; uniform vec3 uGroundAmb; uniform vec3 uFog;
uniform vec4 uLightPos[${MAXL}]; uniform vec3 uLightCol[${MAXL}];
uniform float uClipZ; uniform float uHeroZ; uniform float uHatch; uniform float uHaze;
#ifdef OBJSKY
uniform float uObjSky; uniform float uFlash;
#endif
varying vec3 vCol; varying vec3 vN; varying vec3 vW; varying vec2 vUv; varying float vSky; varying float vEmit;
void main() {
    if (vW.z > uClipZ) discard;
#ifdef NOTEX
    vec3 albedo = vCol;
#else
    vec3 albedo = texture2D(uAtlas, vUv).rgb * vCol;
#endif
#ifdef OBJSKY
    float sky = uObjSky;
#else
    float sky = vSky;
#endif
    vec3 n = normalize(vN);
    float ndl = dot(n, uSunDir);
    float sun = smoothstep(-0.02, 0.22, ndl) * 0.55 + max(ndl, 0.0) * 0.45;
    vec3 light = mix(uGroundAmb, uSkyAmb, n.z * 0.5 + 0.5) * (0.42 + 0.58 * sky) + uSunColor * sun * sky;
    for (int i = 0; i < ${MAXL}; i++) {
        vec4 lp = uLightPos[i];
        if (lp.w <= 0.0) continue;
        vec3 d = lp.xyz - vW;
        float dist = length(d);
        float att = clamp(1.0 - dist / lp.w, 0.0, 1.0);
        att *= att;
        float lam = max(dot(n, d / max(dist, 0.001)), 0.0) * 0.6 + 0.4;
        light += uLightCol[i] * att * lam;
    }
    vec3 col = albedo * light + albedo * vEmit;
    float lum = dot(light, vec3(0.3, 0.5, 0.2)) + vEmit;
    float dark = smoothstep(0.46, 0.1, lum) * uHatch;
    float h = step(0.6, fract((gl_FragCoord.x + gl_FragCoord.y) * 0.19));
    col = mix(col, col * 0.45, dark * h * 0.7);
    float below = clamp((uHeroZ - vW.z - 4.0) / 18.0, 0.0, 1.0);
    col = mix(col, uFog, below * uHaze);
#ifdef OBJSKY
    col = mix(col, vec3(1.0, 0.95, 0.9), uFlash);
#endif
    gl_FragColor = vec4(col, 1.0);
}`;

const INK_VERT = /* glsl */ `
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const INK_FRAG = /* glsl */ `
uniform float uClipZ; uniform float uHeroZ; uniform vec3 uFog; uniform float uHaze; uniform vec3 uInk;
varying vec3 vW;
void main() {
    if (vW.z > uClipZ) discard;
    float below = clamp((uHeroZ - vW.z - 4.0) / 18.0, 0.0, 1.0);
    gl_FragColor = vec4(mix(uInk, uFog, below * uHaze), 1.0);
}`;

const WATER_FRAG = /* glsl */ `
uniform float uClipZ; uniform float uHeroZ; uniform vec3 uFog; uniform float uHaze; uniform float uTime; uniform vec3 uSkyAmb; uniform vec3 uSunColor;
uniform float uLava;
varying vec3 vW; varying vec3 vN;
void main() {
    if (vW.z > uClipZ) discard;
    vec2 p = vW.xy;
    float w1 = sin(p.x * 2.1 + uTime * 1.3) * sin(p.y * 1.7 - uTime * 1.1);
    float w2 = sin((p.x + p.y) * 3.3 - uTime * 2.0);
    float ripple = smoothstep(0.55, 0.95, w1 * 0.6 + w2 * 0.4);
    vec3 col;
    float a;
    if (uLava > 0.5) {
        float n = sin(p.x * 1.3 + uTime * 0.4) * sin(p.y * 1.1 - uTime * 0.3) + sin((p.x - p.y) * 2.7 + uTime * 0.7) * 0.5;
        col = mix(vec3(0.95, 0.35, 0.08), vec3(1.0, 0.82, 0.3), smoothstep(-0.2, 0.9, n));
        col = mix(col, vec3(0.35, 0.1, 0.06), smoothstep(0.75, 1.1, abs(n)) * 0.6);
        a = 1.0;
    } else {
        vec3 base = mix(vec3(0.28, 0.58, 0.62), vec3(0.5, 0.82, 0.84), clamp(vN.z, 0.0, 1.0));
        col = base * (uSkyAmb * 0.8 + uSunColor * 0.45) + ripple * 0.35;
        a = 0.82;
    }
    float below = clamp((uHeroZ - vW.z - 4.0) / 18.0, 0.0, 1.0);
    gl_FragColor = vec4(mix(col, uFog, below * uHaze), a);
}`;
const WATER_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FALL_FRAG = /* glsl */ `
uniform float uClipZ; uniform float uHeroZ; uniform vec3 uFog; uniform float uHaze; uniform float uTime; uniform vec3 uSkyAmb;
varying vec3 vW; varying vec2 vUv;
void main() {
    if (vW.z > uClipZ) discard;
    float s = step(0.66, fract(vW.z * 0.9 + uTime * 2.2 + sin(vUv.x * 19.0) * 0.12));
    float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    vec3 col = mix(vec3(0.5, 0.8, 0.84), vec3(1.0), s * 0.85) * (uSkyAmb * 0.6 + 0.5);
    float below = clamp((uHeroZ - vW.z - 4.0) / 18.0, 0.0, 1.0);
    gl_FragColor = vec4(mix(col, uFog, below * uHaze), 0.9 * edge);
}`;
const FALL_VERT = /* glsl */ `
varying vec3 vW; varying vec2 vUv;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`;

const SKY_VERT = /* glsl */ `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop; uniform vec3 uBottom; uniform float uStars; uniform float uTime;
varying vec2 vP;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
    vec3 col = mix(uBottom, uTop, smoothstep(-1.0, 1.0, vP.y));
    vec2 g = floor(gl_FragCoord.xy / 3.0);
    float st = step(0.9965, hash(g)) * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + hash(g + 3.0) * 30.0));
    col += st;
    gl_FragColor = vec4(col, 1.0);
}`;

const PART_VERT = /* glsl */ `
attribute float size; attribute float alpha;
varying vec3 vCol; varying float vA; varying vec3 vW;
uniform float uScale;
void main() {
    vCol = color; vA = alpha;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
    gl_PointSize = size * uScale;
}`;
const PART_FRAG = /* glsl */ `
uniform float uClipZ; uniform float uHeroZ; uniform vec3 uFog; uniform float uHaze;
varying vec3 vCol; varying float vA; varying vec3 vW;
void main() {
    if (vW.z > uClipZ) discard;
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    if (r > 0.5) discard;
    float a = vA * smoothstep(0.5, 0.2, r);
    float below = clamp((uHeroZ - vW.z - 4.0) / 18.0, 0.0, 1.0);
    gl_FragColor = vec4(mix(vCol, uFog, below * uHaze), a * (1.0 - below * 0.8));
}`;

const SHADOW_FRAG = /* glsl */ `
uniform float uClipZ; varying vec3 vW; varying vec2 vUv;
void main() {
    if (vW.z > uClipZ) discard;
    float r = length(vUv - 0.5) * 2.0;
    gl_FragColor = vec4(0.08, 0.06, 0.12, smoothstep(1.0, 0.3, r) * 0.38);
}`;

// ---------------------------------------------------------------- the view
export class View {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = new THREE.Scene();
        const { canvas, uv } = makeAtlas();
        this.uvs = uv;
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        tex.generateMipmaps = true;
        this.U = {
            uAtlas: { value: tex },
            uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.8).normalize() },
            uSunColor: { value: new THREE.Color(1, 1, 1) },
            uSkyAmb: { value: new THREE.Color(0.6, 0.62, 0.7) },
            uGroundAmb: { value: new THREE.Color(0.4, 0.35, 0.3) },
            uLightPos: { value: Array.from({ length: MAXL }, () => new THREE.Vector4(0, 0, -999, 0)) },
            uLightCol: { value: Array.from({ length: MAXL }, () => new THREE.Vector3()) },
            uClipZ: { value: 999 },
            uHeroZ: { value: 0 },
            uFog: { value: new THREE.Color(0.8, 0.85, 0.9) },
            uTime: { value: 0 },
            uHatch: { value: 1 },
            uHaze: { value: 0.8 },
        };
        const U = this.U;
        this.worldMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: LIT_VERT, fragmentShader: LIT_FRAG, vertexColors: true });
        this.propMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: LIT_VERT, fragmentShader: LIT_FRAG, vertexColors: true, defines: { NOTEX: 1 } });
        this.inkMat = new THREE.ShaderMaterial({ uniforms: { ...U, uInk: { value: new THREE.Color(INK) } }, vertexShader: INK_VERT, fragmentShader: INK_FRAG, side: THREE.BackSide });
        this.waterMat = new THREE.ShaderMaterial({ uniforms: { ...U, uLava: { value: 0 } }, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false });
        this.lavaMat = new THREE.ShaderMaterial({ uniforms: { ...U, uLava: { value: 1 } }, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG });
        this.fallMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FALL_VERT, fragmentShader: FALL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        this.shadowMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: FALL_VERT, fragmentShader: SHADOW_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        this.xrayMat = new THREE.MeshBasicMaterial({ color: 0xd8503f, depthFunc: THREE.GreaterDepth, depthWrite: false, transparent: true, opacity: 0.75 });
        this.lineMats = [];
        this.thick = this.lineMat(2.3, 1);
        this.thin = this.lineMat(1.1, 0.5);
        // sky
        this.skyU = { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uStars: { value: 0 }, uTime: U.uTime };
        const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, depthTest: false, depthWrite: false }));
        sky.frustumCulled = false;
        sky.renderOrder = -1000;
        this.scene.add(sky);
        for (const l of [L_HERO, L_XRAY]) sky.layers.disable(l);
        this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 500);
        this.camera.up.set(0, 0, 1);
        this.view = { zoom: 1, target: new THREE.Vector3(), viewH: 20 };
        this.grade = null;
        this.clip = { level: 999, target: 999, timer: 0, step: 0 };
        this.lightTimer = 0;
        this.root = null;
    }

    lineMat(width, opacity) {
        const m = new LineMaterial({ color: INK, linewidth: width, transparent: opacity < 1, opacity });
        const U = this.U;
        m.onBeforeCompile = (sh) => {
            sh.uniforms.uClipZ = U.uClipZ;
            sh.uniforms.uHeroZ = U.uHeroZ;
            sh.uniforms.uFog = U.uFog;
            sh.uniforms.uHaze = U.uHaze;
            sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying float vWz;\nvoid main() {\n\tvWz = ( position.y < 0.5 ) ? instanceStart.z : instanceEnd.z;');
            sh.fragmentShader = sh.fragmentShader
                .replace('void main() {', 'varying float vWz;\nuniform float uClipZ; uniform float uHeroZ; uniform vec3 uFog; uniform float uHaze;\nvoid main() {\n\tif ( vWz > uClipZ + 0.001 ) discard;')
                .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = mix( gl_FragColor.rgb, uFog, clamp( ( uHeroZ - vWz - 4.0 ) / 18.0, 0.0, 1.0 ) * uHaze );\n#include <tonemapping_fragment>');
        };
        this.lineMats.push(m);
        return m;
    }

    resize(w, h) {
        this.renderer.setSize(w, h, false);
        const pr = this.renderer.getPixelRatio();
        for (const m of this.lineMats) m.resolution.set(w * pr, h * pr);
        const viewH = Math.min(26, Math.max(15, h / 42));
        this.view.viewH = viewH;
        const aspect = w / h;
        Object.assign(this.camera, { left: (-viewH * aspect) / 2, right: (viewH * aspect) / 2, top: viewH / 2, bottom: -viewH / 2 });
        this.camera.updateProjectionMatrix();
        this.size = [w, h];
    }

    // ---------------------------------------------------------------- building a location
    setGame(game) {
        if (this.root) this.dispose();
        this.game = game;
        const loc = game.loc;
        const w = game.world;
        this.world = w;
        this.root = new THREE.Group();
        this.scene.add(this.root);
        this.coverMap(w);
        this.buildChunks();
        this.bakeProps(loc.props.filter((p) => !['campfire'].includes(p.kind)));
        // the god's sword
        const sword = MODELS.buildGodsword(loc.landmark);
        this.bakeInto(this.root, [sword, ...w.ladders.map((l) => MODELS.buildLadder(l))]);
        this.buildDynamic(game);
        this.caps = null;
        this.clip = { level: 999, target: 999, timer: 0, step: 0 };
        this.U.uClipZ.value = 999;
        this.grade = null;
        this.particles = new Particles(this, game);
        this.root.add(this.particles.soft, this.particles.glow);
        this.slashFx = new THREE.Mesh(new THREE.RingGeometry(0.45, 1.55, 20, 1, -1.15, 2.3), new THREE.ShaderMaterial({
            uniforms: { uT: { value: 1 }, uClipZ: this.U.uClipZ }, vertexShader: FALL_VERT, fragmentShader: SLASH_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }));
        this.slashFx.visible = false;
        this.slashFx.renderOrder = 6;
        this.root.add(this.slashFx);
        this.shakeAmt = 0;
        const b = game.body;
        this.view.target.set(b.x, b.y, b.z + 0.6);
    }

    dispose() {
        this.scene.remove(this.root);
        this.root.traverse((o) => {
            o.geometry?.dispose();
            if (o.material && ![this.worldMat, this.propMat, this.inkMat, this.waterMat, this.lavaMat, this.fallMat, this.shadowMat, this.xrayMat, this.thick, this.thin].includes(o.material)) o.material.dispose?.();
        });
        this.root = null;
    }

    // distance from each cell up to the next solid cell above it (capped)
    coverMap(w) {
        const { W, D, H } = w;
        const cov = new Uint8Array(W * D * H);
        for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) {
            let d = 255;
            for (let z = H - 1; z >= 0; z--) {
                cov[(z * D + y) * W + x] = d;
                d = w.solid(x, y, z) ? 1 : Math.min(255, d + 1);
            }
        }
        this.cov = cov;
    }

    // sky light at a point: 1 in the open, lower under something (the nearer, the darker)
    skyAt(x, y, z, cols) {
        const w = this.world;
        let s = 0;
        for (const [cx, cy] of cols) {
            if (cx < 0 || cy < 0 || cx >= w.W || cy >= w.D) { s += 1; continue; }
            const zz = Math.max(0, Math.min(w.H - 1, Math.floor(z - 0.01)));
            const d = this.cov[(zz * w.D + cy) * w.W + cx];
            s += d > 24 ? 1 : d > 10 ? 0.72 : d > 4 ? 0.5 : 0.3;
        }
        return s / cols.length;
    }

    buildChunks() {
        const w = this.world;
        this.chunks = [];
        for (let cz = 0; cz < w.H; cz += CH) for (let cy = 0; cy < w.D; cy += CH) for (let cx = 0; cx < w.W; cx += CH) {
            const c = this.meshChunk(cx, cy, cz);
            if (c) this.chunks.push(c);
        }
    }

    meshChunk(cx, cy, cz) {
        const w = this.world;
        const uvs = this.uvs;
        const A = { pos: [], nor: [], uv: [], col: [], sky: [], emit: [] };
        const Wt = { pos: [], nor: [] };
        const Lv = { pos: [], nor: [] };
        const thick = [];
        const thin = [];
        const seen = new Set();
        const seg = (arr, a, b) => {
            const k = `${a[0]},${a[1]},${a[2]},${b[0]},${b[1]},${b[2]}`;
            const k2 = `${b[0]},${b[1]},${b[2]},${a[0]},${a[1]},${a[2]}`;
            if (seen.has(k) || seen.has(k2)) return;
            seen.add(k);
            arr.push(...a, ...b);
        };
        const full = (x, y, z) => w.full(x, y, z);
        const occ = (x, y, z) => w.solid(x, y, z);
        const aoV = (s1, s2, c) => [0.5, 0.68, 0.85, 1][s1 && s2 ? 0 : 3 - (s1 + s2 + c)];
        const hash = (x, y, z) => {
            let h = (x * 374761393 + y * 668265263 + z * 2147483647) >>> 0;
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        };
        const quad = (p, n, tile, ao, tint, skies, emit, vs = [0, 1], us = [0, 1]) => {
            const [u0, v0, u1, v1] = uvs[tile] ?? uvs.white;
            const U = [u0 + (u1 - u0) * us[0], u0 + (u1 - u0) * us[1]];
            const V = [v0 + (v1 - v0) * vs[0], v0 + (v1 - v0) * vs[1]];
            const uv = [[U[0], V[0]], [U[1], V[0]], [U[1], V[1]], [U[0], V[1]]];
            const order = ao[0] + ao[2] < ao[1] + ao[3] ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
            for (const i of order) {
                A.pos.push(...p[i]);
                A.nor.push(...n);
                A.uv.push(...uv[i]);
                A.col.push(tint[0] * ao[i], tint[1] * ao[i], tint[2] * ao[i]);
                A.sky.push(skies[i]);
                A.emit.push(emit);
            }
        };
        const liquidQuad = (T, p, n) => {
            for (const i of [0, 1, 2, 0, 2, 3]) { T.pos.push(...p[i]); T.nor.push(...n); }
        };
        const tintOf = (x, y, z) => {
            const v = 0.93 + hash(x, y, z) * 0.12;
            return [v, v, v * (0.98 + hash(z, x, y) * 0.04)];
        };
        const x1 = Math.min(w.W, cx + CH);
        const y1 = Math.min(w.D, cy + CH);
        const z1 = Math.min(w.H, cz + CH);
        for (let z = cz; z < z1; z++) for (let y = cy; y < y1; y++) for (let x = cx; x < x1; x++) {
            const b = w.get(x, y, z);
            if (b === B.AIR) continue;
            const def = BLOCKS[b];
            if (def.liquid) {
                const T = b === B.WATER ? Wt : Lv;
                const topH = w.get(x, y, z + 1) === b ? 1 : b === B.WATER ? 0.85 : 0.8;
                if (topH < 1 && !full(x, y, z + 1)) liquidQuad(T, [[x, y, z + topH], [x + 1, y, z + topH], [x + 1, y + 1, z + topH], [x, y + 1, z + topH]], [0, 0, 1]);
                if (!full(x + 1, y, z) && w.get(x + 1, y, z) !== b) liquidQuad(T, [[x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + topH], [x + 1, y, z + topH]], [1, 0, 0]);
                if (!full(x, y + 1, z) && w.get(x, y + 1, z) !== b) liquidQuad(T, [[x + 1, y + 1, z], [x, y + 1, z], [x, y + 1, z + topH], [x + 1, y + 1, z + topH]], [0, 1, 0]);
                continue;
            }
            const emit = def.light ? (b === B.CRYSTAL ? 0.55 : 0.35) : 0;
            const tint = tintOf(x, y, z);
            const shape = w.shape(x, y, z);
            if (shape) {
                this.stairFaces(x, y, z, b, DIRS4[shape - 1], quad, seg, thick, tint);
                continue;
            }
            // top
            if (!full(x, y, z + 1)) {
                const Z = z + 1;
                const p = [[x, y, Z], [x + 1, y, Z], [x + 1, y + 1, Z], [x, y + 1, Z]];
                const L = z + 1;
                const ao = [
                    aoV(occ(x - 1, y, L), occ(x, y - 1, L), occ(x - 1, y - 1, L)),
                    aoV(occ(x + 1, y, L), occ(x, y - 1, L), occ(x + 1, y - 1, L)),
                    aoV(occ(x + 1, y, L), occ(x, y + 1, L), occ(x + 1, y + 1, L)),
                    aoV(occ(x - 1, y, L), occ(x, y + 1, L), occ(x - 1, y + 1, L)),
                ];
                const sk = p.map(([vx, vy]) => this.skyAt(vx, vy, Z, [[vx - 1, vy - 1], [vx, vy - 1], [vx - 1, vy], [vx, vy]]));
                quad(p, [0, 0, 1], def.top, ao, tint, sk, emit);
                // edges: toward -y, +x, +y, -x
                const E = [[0, -1], [1, 0], [0, 1], [-1, 0]];
                for (let i = 0; i < 4; i++) {
                    const [dx, dy] = E[i];
                    const nx = x + dx;
                    const ny = y + dy;
                    let kind;
                    if (full(nx, ny, z + 1)) kind = 'thin';
                    else if (full(nx, ny, z)) kind = w.get(nx, ny, z) === b ? null : 'thin';
                    else kind = 'thick';
                    if (kind) seg(kind === 'thick' ? thick : thin, p[i], p[(i + 1) % 4]);
                }
            }
            // +x side
            if (!full(x + 1, y, z)) {
                const X = x + 1;
                const p = [[X, y, z], [X, y + 1, z], [X, y + 1, z + 1], [X, y, z + 1]];
                const ao = [
                    aoV(occ(X, y - 1, z), occ(X, y, z - 1), occ(X, y - 1, z - 1)),
                    aoV(occ(X, y + 1, z), occ(X, y, z - 1), occ(X, y + 1, z - 1)),
                    aoV(occ(X, y + 1, z), occ(X, y, z + 1), occ(X, y + 1, z + 1)),
                    aoV(occ(X, y - 1, z), occ(X, y, z + 1), occ(X, y - 1, z + 1)),
                ];
                const sk = p.map(([, vy, vz]) => this.skyAt(X, vy, vz, [[X, vy - 1], [X, vy]]));
                quad(p, [1, 0, 0], def.side, ao, tint, sk, emit);
                this.sideEdges(x, y, z, b, 'x', p, seg, thick, thin);
            }
            // +y side
            if (!full(x, y + 1, z)) {
                const Y = y + 1;
                const p = [[x + 1, Y, z], [x, Y, z], [x, Y, z + 1], [x + 1, Y, z + 1]];
                const ao = [
                    aoV(occ(x + 1, Y, z), occ(x, Y, z - 1), occ(x + 1, Y, z - 1)),
                    aoV(occ(x - 1, Y, z), occ(x, Y, z - 1), occ(x - 1, Y, z - 1)),
                    aoV(occ(x - 1, Y, z), occ(x, Y, z + 1), occ(x - 1, Y, z + 1)),
                    aoV(occ(x + 1, Y, z), occ(x, Y, z + 1), occ(x + 1, Y, z + 1)),
                ];
                const sk = p.map(([vx, , vz]) => this.skyAt(vx, Y, vz, [[vx - 1, Y], [vx, Y]]));
                quad(p, [0, 1, 0], def.side, ao, tint, sk, emit);
                this.sideEdges(x, y, z, b, 'y', p, seg, thick, thin);
            }
        }
        if (!A.pos.length && !Wt.pos.length && !Lv.pos.length) return null;
        const group = new THREE.Group();
        if (A.pos.length) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(A.pos, 3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(A.nor, 3));
            g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2));
            g.setAttribute('color', new THREE.Float32BufferAttribute(A.col, 3));
            g.setAttribute('sky', new THREE.Float32BufferAttribute(A.sky, 1));
            g.setAttribute('emit', new THREE.Float32BufferAttribute(A.emit, 1));
            g.computeBoundingSphere();
            group.add(new THREE.Mesh(g, this.worldMat));
        }
        for (const [T, mat] of [[Wt, this.waterMat], [Lv, this.lavaMat]]) {
            if (!T.pos.length) continue;
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(T.pos, 3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(T.nor, 3));
            g.computeBoundingSphere();
            const m = new THREE.Mesh(g, mat);
            m.renderOrder = 2;
            group.add(m);
        }
        if (thick.length) group.add(new LineSegments2(new LineSegmentsGeometry().setPositions(thick), this.thick));
        if (thin.length) group.add(new LineSegments2(new LineSegmentsGeometry().setPositions(thin), this.thin));
        this.root.add(group);
        return { group, cx, cy, cz };
    }

    // outline where a side face ends: thick at outer corners and overhangs, thin in creases
    sideEdges(x, y, z, b, axis, p, seg, thick, thin) {
        const w = this.world;
        const full = (a, bb, c) => w.full(a, bb, c);
        const [ox, oy] = axis === 'x' ? [1, 0] : [0, 1];
        const [tx, ty] = axis === 'x' ? [0, 1] : [1, 0];
        // is there a visible side face of the same plane at (x+dx, y+dy, z+dz)?
        const face = (dx, dy, dz) => full(x + dx, y + dy, z + dz) && !full(x + dx + ox, y + dy + oy, z + dz);
        const edge = (has, crease, i, j) => {
            if (has) { if (w.get(x, y, z) !== b) seg(thin, p[i], p[j]); return; }
            seg(crease ? thin : thick, p[i], p[j]);
        };
        // bottom edge (p0-p1), top edge (p2-p3)
        const below = face(0, 0, -1);
        if (below) { if (w.get(x, y, z - 1) !== b) seg(thin, p[0], p[1]); } else edge(false, full(x + ox, y + oy, z - 1), 0, 1);
        if (full(x, y, z + 1)) {
            const above = face(0, 0, 1);
            if (above) { if (w.get(x, y, z + 1) !== b) seg(thin, p[2], p[3]); } else edge(false, full(x + ox, y + oy, z + 1), 2, 3);
        }
        // the two vertical edges: toward -t (p3-p0 for x, p1-p2 for y) and +t
        const lo = axis === 'x' ? [3, 0] : [1, 2];
        const hi = axis === 'x' ? [1, 2] : [3, 0];
        for (const [s, [i, j]] of [[-1, lo], [1, hi]]) {
            const has = face(tx * s, ty * s, 0);
            if (has) { if (w.get(x + tx * s, y + ty * s, z) !== b) seg(thin, p[i], p[j]); continue; }
            edge(false, full(x + ox + tx * s, y + oy + ty * s, z), i, j);
        }
    }

    stairFaces(x, y, z, b, rise, quad, seg, thick, tint) {
        const w = this.world;
        const def = BLOCKS[b];
        const [rx, ry] = rise;
        const steps = [];
        for (let k = 0; k < 4; k++) {
            const a = rx + ry > 0 ? k / 4 : 1 - (k + 1) / 4;
            const c = a + 0.25;
            const h = (k + 1) / 4;
            steps.push(rx !== 0 ? [x + a, y, x + c, y + 1, h] : [x, y + a, x + 1, y + c, h]);
        }
        const sky = this.skyAt(x + 0.5, y + 0.5, z + 1, [[x, y]]);
        const S = [sky, sky, sky, sky];
        const one = [1, 1, 1, 1];
        for (const [x0, y0, x1, y1, h] of steps) {
            const Z = z + h;
            const top = [[x0, y0, Z], [x1, y0, Z], [x1, y1, Z], [x0, y1, Z]];
            quad(top, [0, 0, 1], def.top, one, tint, S, 0, rx ? [0, 1] : [y0 - y, y1 - y], rx ? [x0 - x, x1 - x] : [0, 1]);
            for (let i = 0; i < 4; i++) seg(thick, top[i], top[(i + 1) % 4]);
            // +x face of this step: hidden by a taller step or a full block next door
            const nextX = steps.find((s) => Math.abs(s[0] - x1) < 1e-6 && rx !== 0);
            const lowX = nextX ? nextX[4] : x1 >= x + 1 - 1e-6 && w.full(x + 1, y, z) ? 1 : 0;
            if (lowX < h) {
                const p = [[x1, y0, z + lowX], [x1, y1, z + lowX], [x1, y1, Z], [x1, y0, Z]];
                quad(p, [1, 0, 0], def.side, one, tint, S, 0, [lowX, h]);
                seg(thick, p[2], p[3]);
                seg(thick, p[0], p[3]);
                seg(thick, p[1], p[2]);
                if (lowX === 0) seg(thick, p[0], p[1]);
            }
            const nextY = steps.find((s) => Math.abs(s[1] - y1) < 1e-6 && ry !== 0);
            const lowY = nextY ? nextY[4] : y1 >= y + 1 - 1e-6 && w.full(x, y + 1, z) ? 1 : 0;
            if (lowY < h) {
                const p = [[x1, y1, z + lowY], [x0, y1, z + lowY], [x0, y1, Z], [x1, y1, Z]];
                quad(p, [0, 1, 0], def.side, one, tint, S, 0, [lowY, h]);
                seg(thick, p[2], p[3]);
                seg(thick, p[0], p[3]);
                seg(thick, p[1], p[2]);
                if (lowY === 0) seg(thick, p[0], p[1]);
            }
        }
    }

    // ---------------------------------------------------------------- props
    bakeProps(props) {
        const byChunk = new Map();
        for (const p of props) {
            const k = `${Math.floor(p.x / CH)},${Math.floor(p.y / CH)},${Math.floor(p.z / CH)}`;
            if (!byChunk.has(k)) byChunk.set(k, []);
            byChunk.get(k).push(p);
        }
        this.propChunks = new Map();
        for (const [k, list] of byChunk) {
            const g = new THREE.Group();
            this.root.add(g);
            this.propChunks.set(k, { group: g, list });
            this.bakeInto(g, list.filter((p) => !p.broken).map((p) => MODELS.buildProp(p)).filter(Boolean));
        }
    }

    rebakeProp(p) {
        const k = `${Math.floor(p.x / CH)},${Math.floor(p.y / CH)},${Math.floor(p.z / CH)}`;
        const c = this.propChunks.get(k);
        if (!c) return;
        c.group.traverse((o) => o.geometry?.dispose());
        c.group.clear();
        this.bakeInto(c.group, c.list.filter((q) => !q.broken).map((q) => MODELS.buildProp(q)).filter(Boolean));
    }

    bakeInto(parent, objects) {
        const geos = [];
        const hulls = [];
        for (const root of objects) {
            root.updateMatrixWorld(true);
            root.traverse((o) => {
                if (!o.isMesh) return;
                const g = o.geometry.clone();
                g.applyMatrix4(o.matrixWorld);
                const pos = g.attributes.position;
                const sky = new Float32Array(pos.count);
                for (let i = 0; i < pos.count; i++) {
                    const vx = Math.floor(pos.getX(i));
                    const vy = Math.floor(pos.getY(i));
                    sky[i] = this.skyAt(vx, vy, pos.getZ(i) + 0.3, [[vx, vy]]);
                }
                g.setAttribute('sky', new THREE.BufferAttribute(sky, 1));
                geos.push(g);
                if (!o.userData.noOutline) hulls.push(hull(g, 0.028));
            });
        }
        if (!geos.length) return;
        const merged = mergeGeometries(geos);
        parent.add(new THREE.Mesh(merged, this.propMat));
        if (hulls.length) parent.add(new THREE.Mesh(mergeGeometries(hulls), this.inkMat));
    }

    // ---------------------------------------------------------------- dynamic things
    actorMat(sky = 1) {
        return new THREE.ShaderMaterial({
            uniforms: { ...this.U, uObjSky: { value: sky }, uFlash: { value: 0 } },
            vertexShader: LIT_VERT, fragmentShader: LIT_FRAG, vertexColors: true, defines: { NOTEX: 1, OBJSKY: 1 },
        });
    }

    // give every mesh of an object a material and an ink hull; first fold the
    // meshes hanging off each node into one, so a creature costs a few draws
    dress(obj, mat, layer = 0) {
        const parts = obj.userData.parts;
        mergeParts(obj, new Set([...(parts?.legs ?? []), parts?.lantern].filter(Boolean)));
        const meshes = [];
        obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
        for (const m of meshes) {
            m.material = mat;
            m.layers.set(layer);
            if (m.userData.noOutline) continue;
            const h = new THREE.Mesh(hullLocal(m.geometry, 0.028 / Math.max(0.2, Math.min(m.scale.x, m.scale.y, m.scale.z))), this.inkMat);
            h.layers.set(layer);
            h.userData.hull = true;
            m.add(h);
        }
        obj.traverse((o) => o.layers.set(layer));
        return obj;
    }

    shadow(r = 0.35) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), this.shadowMat);
        m.renderOrder = 1;
        this.root.add(m);
        return m;
    }

    buildDynamic(game) {
        const loc = game.loc;
        const dyn = { creatures: new Map(), items: new Map(), chests: new Map(), levers: new Map(), gates: new Map(), pedestals: new Map(), flames: [], falls: [], projectiles: new Map() };
        this.dyn = dyn;
        const shared = this.actorMat(0.85);
        this.sharedMat = shared;
        for (const c of game.chests) { const o = this.dress(MODELS.buildChest(c), shared); this.root.add(o); dyn.chests.set(c.id, o); }
        for (const l of game.levers) { const o = this.dress(MODELS.buildLever(l), shared); this.root.add(o); dyn.levers.set(l.id, o); }
        for (const g of game.gates) { const o = this.dress(MODELS.buildGate(g), shared); this.root.add(o); dyn.gates.set(g.id, o); }
        for (const p of game.pedestals) { const o = this.dress(MODELS.buildPedestal(p), shared); this.root.add(o); dyn.pedestals.set(p.id, o); }
        for (const s of game.signs) this.root.add(this.dress(MODELS.buildSign(s), shared));
        if (game.merchant) this.root.add(this.dress(MODELS.buildMerchant(game.merchant), shared));
        for (const c of game.campfires) {
            this.bakeInto(this.root, [MODELS.buildProp({ kind: 'campfire', x: c.x, y: c.y, z: c.z, seed: c.id })]);
            const f = this.dress(MODELS.buildFlames(c), shared);
            this.root.add(f);
            dyn.flames.push({ obj: f, fire: c });
        }
        // the Gates: a great ring on the back wall
        const gt = loc.gate;
        const ring = new THREE.Group();
        ring.position.set(gt.x + 0.5, gt.y + 0.5, gt.z + 1.6);
        const band = new THREE.Group();
        const k = new THREE.Mesh(paintGeo(new THREE.TorusGeometry(1.35, 0.22, 10, 36), 0xe6b73c, 0.2), shared);
        k.rotation.y = Math.PI / 2;
        band.add(k);
        this.dress(band, shared);
        ring.add(band);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 36), new THREE.ShaderMaterial({ uniforms: { ...this.U, uOpen: { value: 0 } }, vertexShader: FALL_VERT, fragmentShader: GATE_FRAG, transparent: true, side: THREE.DoubleSide }));
        disc.rotation.y = Math.PI / 2;
        disc.position.x = 0.05;
        ring.add(disc);
        this.gateSockets = [];
        for (let i = 0; i < 3; i++) {
            const a = Math.PI / 2 + (i - 1) * 0.55;
            const s = new THREE.Mesh(paintGeo(new THREE.IcosahedronGeometry(0.2, 0), 0x4a4a55, 0), this.actorMat(1));
            s.position.set(0.25, Math.cos(a) * 1.35, Math.sin(a) * 1.35);
            ring.add(s);
            this.gateSockets.push(s);
        }
        this.root.add(ring);
        this.sealsShown = -1;
        this.gateRing = ring;
        this.gateDisc = disc;
        // waterfalls
        for (const f of loc.waterfalls) {
            const h = f.top - f.bottom;
            const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, h), this.fallMat);
            if (f.dx) { m.rotation.set(Math.PI / 2, Math.PI / 2, 0); m.position.set(f.x + 0.35, f.y + 1, f.bottom + h / 2); }
            else { m.rotation.set(Math.PI / 2, 0, 0); m.position.set(f.x + 1, f.y + 0.35, f.bottom + h / 2); }
            m.renderOrder = 3;
            this.root.add(m);
        }
        // items
        for (const it of game.items) this.addItem(it);
        // creatures
        for (const c of game.creatures) this.addCreature(c);
        // the hero, and its x-ray double
        const hero = buildHeroDressed(this, L_HERO);
        this.root.add(hero);
        dyn.hero = hero;
        const xr = MODELS.buildHero();
        xr.traverse((o) => { if (o.isMesh) o.material = this.xrayMat; o.layers.set(L_XRAY); });
        this.root.add(xr);
        dyn.xray = xr;
        dyn.heroShadow = this.shadow(0.3);
        // projectiles
    }

    addItem(it) {
        const o = MODELS.buildItem(it.kind);
        const g = new THREE.Group();
        g.add(o);
        g.position.set(it.x + 0.5, it.y + 0.5, it.h + 0.4);
        this.dress(g, this.sharedMat);
        g.userData = { id: it.id, base: it.h + 0.4, phase: Math.random() * 6, pop: it.pop ?? 0 };
        this.root.add(g);
        this.dyn.items.set(it.id, g);
    }

    addCreature(c) {
        const mat = this.actorMat(1);
        const o = this.dress(MODELS.buildCreature(c.kind, c.k, { scale: c.scale }), mat);
        o.userData.mat = mat;
        o.userData.shadow = this.shadow(0.32 * c.k.size * c.scale);
        if (c.carry.includes('seal')) {
            const s = this.dress(MODELS.buildItem('seal'), this.sharedMat);
            s.position.z = (c.kind === 'guardian' ? 2.4 : 1.5) * c.scale;
            s.scale.setScalar(0.8);
            o.add(s);
            o.userData.carried = s;
        }
        this.root.add(o);
        this.dyn.creatures.set(c.id, o);
    }

    // ---------------------------------------------------------------- per frame
    update(dt, game, t) {
        const U = this.U;
        U.uTime.value = t;
        const b = game.body;
        U.uHeroZ.value += (b.z - U.uHeroZ.value) * Math.min(1, dt * 4);
        this.gradeFor(game, dt);
        this.updateClip(game, dt);
        this.updateLights(game, dt, t);
        this.syncActors(game, dt, t);
        this.particles.update(dt, game, t);
    }

    gradeFor(game, dt) {
        const tier = game.loc.tiers[game.tier];
        const bio = BIOMES[tier.biome];
        const d = game.daylight;
        const phase = game.dayPhase;
        const tt = Math.min(1, Math.max(0, (phase - 0.25) / 0.5));
        const elev = Math.sin(Math.PI * tt);
        const a = bio.ambient;
        const outdoor = !!bio.outdoor;
        const sunDir = new THREE.Vector3(1 - tt * 0.8, 0.2 + tt * 0.8, 0.35 + elev * 1.2).normalize();
        const moonDir = new THREE.Vector3(0.4, 0.8, 1).normalize();
        const warm = new THREE.Color(1.0, 0.62, 0.42).lerp(new THREE.Color(1.0, 0.95, 0.86), Math.min(1, elev * 1.6));
        const sun = new THREE.Color(0.28, 0.34, 0.58).lerp(warm, d).multiplyScalar((0.4 + 0.3 * d) * Math.pow(a, 1.2));
        const fog = new THREE.Color(bio.fog);
        const skyAmb = new THREE.Color(0.17, 0.2, 0.36).lerp(new THREE.Color(0.52, 0.55, 0.62), d).multiplyScalar(outdoor ? 1 : 0.35 + a * 0.6).lerp(fog, outdoor ? 0.05 : 0.3);
        const groundAmb = new THREE.Color(0.09, 0.08, 0.15).lerp(new THREE.Color(0.36, 0.32, 0.3), d).multiplyScalar(outdoor ? 1 : 0.35 + a * 0.6).lerp(fog, outdoor ? 0.05 : 0.3);
        const fogCol = outdoor ? new THREE.Color(0.55, 0.62, 0.72).lerp(new THREE.Color(0.12, 0.13, 0.25), 1 - d) : fog.clone().multiplyScalar(0.55 + 0.25 * d);
        let top;
        let bottom;
        if (outdoor) {
            const dusk = Math.max(0, 1 - Math.abs(elev - 0.15) * 4) * (d > 0.05 ? 1 : 0);
            top = new THREE.Color(0.08, 0.1, 0.24).lerp(new THREE.Color(0.5, 0.74, 0.9), d).lerp(new THREE.Color(0.42, 0.34, 0.62), dusk * 0.6);
            bottom = new THREE.Color(0.04, 0.05, 0.12).lerp(new THREE.Color(0.86, 0.92, 0.9), d).lerp(new THREE.Color(0.98, 0.62, 0.46), dusk * 0.7);
        } else {
            top = fog.clone().multiplyScalar(0.35 + 0.15 * d);
            bottom = fog.clone().multiplyScalar(0.12);
        }
        const target = { sunDir: d > 0.02 ? sunDir : moonDir, sun, skyAmb, groundAmb, fog: fogCol, top, bottom, stars: outdoor ? Math.max(0, 1 - d * 2.5) : 0 };
        if (!this.grade) this.grade = { ...target, sunDir: target.sunDir.clone(), sun: sun.clone(), skyAmb: skyAmb.clone(), groundAmb: groundAmb.clone(), fog: fogCol.clone(), top: top.clone(), bottom: bottom.clone() };
        const g = this.grade;
        const k = Math.min(1, dt * 1.5);
        g.sunDir.lerp(target.sunDir, k).normalize();
        for (const key of ['sun', 'skyAmb', 'groundAmb', 'fog', 'top', 'bottom']) g[key].lerp(target[key], k);
        g.stars += (target.stars - g.stars) * k;
        const U = this.U;
        U.uSunDir.value.copy(g.sunDir);
        U.uSunColor.value.copy(g.sun);
        U.uSkyAmb.value.copy(g.skyAmb);
        U.uGroundAmb.value.copy(g.groundAmb);
        U.uFog.value.copy(g.fog);
        this.skyU.uTop.value.copy(g.top);
        this.skyU.uBottom.value.copy(g.bottom);
        this.skyU.uStars.value = g.stars;
        this.darkness = 1 - (outdoor ? d : a * (0.5 + 0.5 * d));
    }

    // cut away whatever hangs between the camera and the hero
    updateClip(game, dt) {
        const c = this.clip;
        const w = this.world;
        const b = game.body;
        c.timer -= dt;
        if (c.timer <= 0) {
            c.timer = 0.12;
            let hit = false;
            for (const [ox, oy, oz] of [[0, 0, 0.5], [0, 0, 1.1], [0.3, -0.3, 0.8], [-0.3, 0.3, 0.8]]) {
                for (let s = 0.9; s < 40 && !hit; s += 0.4) {
                    const x = Math.floor(b.x + ox + s);
                    const y = Math.floor(b.y + oy + s);
                    const z = Math.floor(b.z + oz + s);
                    if (z < b.z + 2) continue;
                    if (z >= w.H) break;
                    if (w.solid(x, y, z)) hit = true;
                }
            }
            c.target = hit ? Math.floor(b.z + 0.3) + 3 : 999;
            if (game.mapMode) c.target = 999;
        }
        c.step -= dt;
        if (c.level !== c.target && c.step <= 0) {
            c.step = 0.03;
            if (c.target === 999) c.level = c.level >= w.H ? 999 : c.level + 1;
            else if (c.level > w.H) c.level = Math.min(w.H, c.target + 8);
            else c.level += Math.sign(c.target - c.level);
            this.U.uClipZ.value = c.level >= 999 ? 999 : c.level + 0.001;
            this.buildCaps(c.level);
        }
    }

    buildCaps(level) {
        if (this.caps) { this.root.remove(this.caps); this.caps.geometry.dispose(); this.caps = null; }
        const w = this.world;
        if (level >= w.H || level < 1) return;
        const pos = [];
        const nor = [];
        const uv = [];
        const col = [];
        const sky = [];
        const emit = [];
        const [u0, v0, u1, v1] = this.uvs.cut;
        for (let y = 0; y < w.D; y++) for (let x = 0; x < w.W; x++) {
            if (!w.solid(x, y, level) || !w.full(x, y, level - 1)) continue;
            const p = [[x, y, level], [x + 1, y, level], [x + 1, y + 1, level], [x, y + 1, level]];
            const t = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
            for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); nor.push(0, 0, 1); uv.push(...t[i]); col.push(1, 1, 1); sky.push(1); emit.push(0.35); }
        }
        if (!pos.length) return;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setAttribute('sky', new THREE.Float32BufferAttribute(sky, 1));
        g.setAttribute('emit', new THREE.Float32BufferAttribute(emit, 1));
        this.caps = new THREE.Mesh(g, this.worldMat);
        this.root.add(this.caps);
    }

    updateLights(game, dt, t) {
        const U = this.U;
        const b = game.body;
        this.lightTimer -= dt;
        if (this.lightTimer <= 0) {
            this.lightTimer = 0.2;
            const cand = [];
            for (const l of game.loc.lights) cand.push(l);
            for (const c of game.campfires) if (c.lit) cand.push({ x: c.x + 0.5, y: c.y + 0.5, z: c.z + 1, color: 0xffa05a, intensity: 2, range: 9, flicker: 0.5 });
            for (const p of game.projectiles) cand.push({ x: p.x, y: p.y, z: p.z, color: 0xff7a2a, intensity: 1.4, range: 4, flicker: 0.3 });
            for (const c of game.creatures) if (c.hp > 0 && c.k.glow) cand.push({ x: c.x, y: c.y, z: c.z + 0.5, color: c.k.glow, intensity: 0.8, range: 4, flicker: 0.2 });
            const scored = cand.map((l) => [l, Math.hypot(l.x - b.x, l.y - b.y, (l.z - b.z) * 1.4) - l.range * 0.6]).sort((p, q) => p[1] - q[1]);
            this.activeLights = scored.slice(0, MAXL - 1).map((s) => s[0]);
        }
        const col = new THREE.Color();
        const lights = this.activeLights ?? [];
        // the hero's lantern first
        const lantern = 0.35 + 0.9 * (this.darkness ?? 0);
        U.uLightPos.value[0].set(b.x, b.y, b.z + 1.3, 5.5);
        U.uLightCol.value[0].set(1, 0.82, 0.55).multiplyScalar(lantern);
        for (let i = 1; i < MAXL; i++) {
            const l = lights[i - 1];
            if (!l) { U.uLightPos.value[i].set(0, 0, -999, 0); continue; }
            const fl = 1 + (l.flicker ?? 0) * 0.35 * (Math.sin(t * 13 + l.x * 7) * 0.6 + Math.sin(t * 7.3 + l.y * 3) * 0.4);
            col.setHex(l.color);
            const boost = 0.7 + 0.5 * (this.darkness ?? 0);
            U.uLightPos.value[i].set(l.x, l.y, l.z, l.range);
            U.uLightCol.value[i].set(col.r, col.g, col.b).multiplyScalar(l.intensity * fl * boost);
        }
    }

    syncActors(game, dt, t) {
        const dyn = this.dyn;
        const b = game.body;
        const h = game.hero;
        const w = this.world;
        const clipZ = this.U.uClipZ.value;
        const setShadow = (s, x, y, z, vis = true) => {
            const g = w.groundBelow(x, y, z + 0.3);
            s.visible = vis && g > -1e9 && z - g < 12;
            s.position.set(x, y, g + 0.03);
        };
        // hero
        const hero = dyn.hero;
        const P = hero.userData.parts;
        const moving = Math.hypot(b.vx, b.vy) > 0.3 && b.grounded;
        hero.position.set(b.x, b.y, b.z);
        const face = Math.atan2(b.facing[1], b.facing[0]);
        hero.rotation.z = lerpAngle(hero.rotation.z, face, Math.min(1, dt * 14));
        const phase = t * 11;
        P.legs[0].position.x = moving ? Math.sin(phase) * 0.12 : 0;
        P.legs[1].position.x = moving ? -Math.sin(phase) * 0.12 : 0;
        P.body.position.z = moving ? Math.abs(Math.sin(phase)) * 0.05 : b.climbing ? Math.sin(t * 8) * 0.03 : 0;
        const sw = h.swing > 0 ? h.swing / 0.22 : 0;
        P.arm.rotation.z = sw > 0 ? -1.2 + (1 - sw) * 2.6 : b.climbing ? -0.6 : 0;
        P.arm.rotation.y = sw > 0 ? -0.4 : b.climbing ? -1.2 : 0;
        P.cape.rotation.y = -0.15 - Math.min(0.6, Math.hypot(b.vx, b.vy) * 0.08) + (b.grounded ? 0 : 0.4);
        P.body.rotation.y = b.dash > 0 ? 0.35 : 0;
        hero.visible = !(h.invuln > 0 && h.invuln < 0.8 && Math.floor(t * 18) % 2 === 0) || game.body.dash > 0;
        const xr = dyn.xray;
        xr.position.copy(hero.position);
        xr.rotation.copy(hero.rotation);
        xr.userData.parts.arm.rotation.copy(P.arm.rotation);
        xr.visible = hero.visible;
        setShadow(dyn.heroShadow, b.x, b.y, b.z);

        for (const c of game.creatures) {
            const o = dyn.creatures.get(c.id);
            if (!o) continue;
            if (c.hp <= 0) {
                o.scale.multiplyScalar(Math.max(0, 1 - dt * 7));
                o.userData.shadow.visible = false;
                if (o.scale.x < 0.05) { this.root.remove(o); this.root.remove(o.userData.shadow); dyn.creatures.delete(c.id); }
                continue;
            }
            const d = Math.hypot(c.x - b.x, c.y - b.y);
            o.visible = d < 24 && c.z < clipZ - 0.1;
            if (!o.visible) { o.userData.shadow.visible = false; continue; }
            const Q = o.userData.parts;
            const bob = c.fly ? Math.sin(t * 3 + c.id) * 0.15 : 0;
            o.position.set(c.x, c.y, c.z + bob);
            o.rotation.z = lerpAngle(o.rotation.z, Math.atan2(c.facing[1], c.facing[0]), Math.min(1, dt * 10));
            const walking = !!c.seg;
            const ph = t * (8 + c.k.speed * 2) + c.id;
            Q.legs.forEach((l, i) => { l.rotation.y = walking ? Math.sin(ph + (i % 2) * Math.PI) * 0.5 : 0; });
            Q.wings.forEach((wg, i) => { wg.rotation.x = Math.sin(t * (c.kind === 'owl' ? 3 : 18) + c.id) * 0.7 * (i ? 1 : -1); });
            if (c.k.model === 'slime' || c.k.model === 'shroom') Q.body.scale.z = c.k.size * c.scale * (1 + Math.sin(t * 6 + c.id) * 0.07);
            const wind = c.windup > 0 ? 1 - c.windup / 0.38 : 0;
            if (Q.arm) Q.arm.rotation.y = c.windup > 0 ? -1.5 * wind : 0;
            Q.body.rotation.y = c.windup > 0 ? -0.25 * wind : 0;
            const m = o.userData.mat;
            m.uniforms.uFlash.value = c.hurt > 0 ? 0.65 : c.windup > 0 ? 0.25 * Math.abs(Math.sin(t * 20)) : 0;
            m.uniforms.uObjSky.value = this.skyAt(Math.floor(c.x), Math.floor(c.y), c.z + 1, [[Math.floor(c.x), Math.floor(c.y)]]);
            if (o.userData.carried) o.userData.carried.rotation.z = t * 2;
            setShadow(o.userData.shadow, c.x, c.y, c.z);
        }
        for (const it of game.items) if (!dyn.items.has(it.id) && !it.taken) this.addItem(it);
        for (const [id, o] of dyn.items) {
            const it = game.items.find((x) => x.id === id);
            if (!it || it.taken) {
                o.userData.gone = (o.userData.gone ?? 0.3) - dt;
                o.position.z += dt * 3;
                o.scale.multiplyScalar(0.9);
                if (o.userData.gone <= 0) { this.root.remove(o); dyn.items.delete(id); }
                continue;
            }
            o.visible = it.h < clipZ;
            const pop = Math.max(0, it.pop);
            o.position.z = o.userData.base + Math.sin(t * 3 + o.userData.phase) * 0.07 + Math.sin(pop * Math.PI * 2) * pop * 1.5;
            o.rotation.z += dt * 1.6;
        }
        for (const c of game.chests) {
            const o = dyn.chests.get(c.id);
            o.visible = c.z < clipZ;
            if (c.opened) o.userData.lid.rotation.x += (-1.9 - o.userData.lid.rotation.x) * Math.min(1, dt * 8);
        }
        for (const l of game.levers) {
            const o = dyn.levers.get(l.id);
            o.visible = l.z < clipZ;
            o.userData.arm.rotation.y += ((l.on ? 0.7 : -0.7) - o.userData.arm.rotation.y) * Math.min(1, dt * 8);
        }
        for (const g of game.gates) {
            const o = dyn.gates.get(g.id);
            o.visible = g.z < clipZ;
            o.userData.bars.position.z += ((g.open ? 1.9 : 0) - o.userData.bars.position.z) * Math.min(1, dt * 3);
        }
        for (const p of game.pedestals) {
            const o = dyn.pedestals.get(p.id);
            o.visible = p.z < clipZ;
            const item = o.userData.item;
            item.visible = !p.taken;
            item.rotation.z = t * 1.5;
            item.position.z = 1.25 + Math.sin(t * 2 + p.id) * 0.08;
        }
        for (const f of dyn.flames) {
            const s = f.fire.lit ? 1.25 : 0.8;
            f.obj.userData.flames.scale.set(s, s, s * (1 + Math.sin(t * 17 + f.fire.id) * 0.15));
        }
        // the Gates wake as seals come in
        if (this.sealsShown !== h.seals) {
            this.sealsShown = h.seals;
            this.gateSockets.forEach((s, i) => setColor(s.geometry, i < h.seals ? 0x7ff0e2 : 0x4a4a55, i < h.seals ? 1 : 0));
        }
        const open = this.gateDisc.material.uniforms.uOpen;
        open.value += ((h.seals >= 3 ? 1 : 0) - open.value) * Math.min(1, dt * 2);
        this.gateRing.visible = game.loc.gate.z < clipZ;
        // fireballs
        for (const p of game.projectiles) {
            if (!dyn.projectiles.has(p.id)) {
                const m = new THREE.Mesh(paintGeo(new THREE.IcosahedronGeometry(0.16, 1), 0xffa040, 1), this.sharedMat);
                this.root.add(m);
                dyn.projectiles.set(p.id, m);
            }
            dyn.projectiles.get(p.id).position.set(p.x, p.y, p.z);
            this.particles.spawn('ember', p.x, p.y, p.z, 1);
        }
        for (const [id, m] of dyn.projectiles) if (!game.projectiles.some((p) => p.id === id)) { this.root.remove(m); m.geometry.dispose(); dyn.projectiles.delete(id); }
    }

    slash() {
        const b = this.game.body;
        const s = this.slashFx;
        s.visible = true;
        s.position.set(b.x, b.y, b.z + 0.55);
        s.rotation.set(0, 0, Math.atan2(b.facing[1], b.facing[0]));
        s.material.uniforms.uT.value = 0;
    }

    shake(a) {
        this.shakeAmt = Math.max(this.shakeAmt, a);
    }

    // ---------------------------------------------------------------- camera and drawing
    placeCamera(dt, follow = true) {
        const b = this.game.body;
        if (follow) this.view.target.lerp(new THREE.Vector3(b.x, b.y, b.z + 0.6), 1 - Math.exp(-dt * 6));
        const sl = this.slashFx.material.uniforms.uT;
        if (sl.value < 1) { sl.value = Math.min(1, sl.value + dt / 0.24); this.slashFx.position.set(b.x, b.y, b.z + 0.55); }
        this.slashFx.visible = sl.value < 1;
        this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.5);
        const j = this.shakeAmt * this.shakeAmt;
        this.camera.position.copy(this.view.target).addScaledVector(CAM_DIR, 150);
        this.camera.position.x += (Math.random() - 0.5) * j;
        this.camera.position.y -= (Math.random() - 0.5) * j;
        this.camera.zoom += (this.view.zoom - this.camera.zoom) * Math.min(1, dt * 8);
        this.camera.lookAt(this.view.target);
        this.camera.updateProjectionMatrix();
        this.particles.setScale(this.renderer.getPixelRatio() * this.camera.zoom * (this.size[1] / this.view.viewH) / 40);
    }

    render() {
        const r = this.renderer;
        r.autoClear = false;
        r.info.autoReset = false;
        r.info.reset();
        r.clear();
        for (const layer of [0, L_XRAY, L_HERO]) {
            this.camera.layers.set(layer);
            r.render(this.scene, this.camera);
        }
    }

    toScreen(x, y, z) {
        const v = new THREE.Vector3(x, y, z).project(this.camera);
        return [(v.x * 0.5 + 0.5) * this.size[0], (-v.y * 0.5 + 0.5) * this.size[1], v.z];
    }
}

const SLASH_FRAG = /* glsl */ `
uniform float uT; uniform float uClipZ;
varying vec3 vW; varying vec2 vUv;
void main() {
    if (vW.z > uClipZ) discard;
    float a = atan(vUv.y - 0.5, vUv.x - 0.5);
    float front = -1.25 + uT * 3.4;
    float sweep = step(a, front) * smoothstep(front - 1.4, front - 0.2, a);
    float r = length(vUv - 0.5) * 2.0;
    float band = smoothstep(0.3, 0.75, r) * smoothstep(1.0, 0.85, r);
    gl_FragColor = vec4(vec3(1.0, 0.97, 0.85), band * sweep * (1.0 - uT) * 0.9);
}`;

const GATE_FRAG = /* glsl */ `
uniform float uTime; uniform float uOpen; uniform float uClipZ;
varying vec3 vW; varying vec2 vUv;
void main() {
    if (vW.z > uClipZ) discard;
    vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float s = 0.5 + 0.5 * sin(a * 3.0 - r * 9.0 + uTime * (1.2 + 3.0 * uOpen));
    vec3 shut = mix(vec3(0.16, 0.14, 0.26), vec3(0.34, 0.3, 0.5), s);
    vec3 open = mix(vec3(0.45, 0.95, 0.9), vec3(1.0, 0.95, 0.7), s);
    gl_FragColor = vec4(mix(shut, open, uOpen), 0.95);
}`;

function buildHeroDressed(view, layer) {
    const hero = MODELS.buildHero();
    const mat = view.actorMat(1);
    view.dress(hero, mat, layer);
    hero.userData.mat = mat;
    return hero;
}

function mergeParts(node, keep) {
    const kids = [...node.children];
    const plain = kids.filter((c) => c.isMesh && !c.children.length && !keep.has(c));
    for (const c of kids) if (!c.isMesh || c.children.length) mergeParts(c, keep);
    for (const outline of [true, false]) {
        const group = plain.filter((c) => !c.userData.noOutline === outline);
        if (group.length < 2) continue;
        const geos = group.map((c) => {
            c.updateMatrix();
            const g = c.geometry.clone();
            g.applyMatrix4(c.matrix);
            for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'emit'].includes(a)) g.deleteAttribute(a);
            return g;
        });
        const merged = new THREE.Mesh(mergeGeometries(geos), group[0].material);
        merged.userData.noOutline = !outline;
        for (const c of group) node.remove(c);
        node.add(merged);
    }
}

function lerpAngle(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
}

function paintGeo(geo, color, emit) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    setColor(g, color, emit);
    return g;
}

function setColor(g, color, emit) {
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    const em = new Float32Array(n).fill(emit);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('emit', new THREE.BufferAttribute(em, 1));
}

// an ink shell pushed out along smoothed normals (world-space geometry)
function hull(geo, t) {
    let h = new THREE.BufferGeometry();
    h.setAttribute('position', geo.attributes.position.clone());
    h = mergeVertices(h, 1e-4);
    h.computeVertexNormals();
    const p = h.attributes.position;
    const n = h.attributes.normal;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * t, p.getY(i) + n.getY(i) * t, p.getZ(i) + n.getZ(i) * t);
    h.deleteAttribute('normal');
    return h.toNonIndexed();
}
function hullLocal(geo, t) {
    return hull(geo, t);
}

// ---------------------------------------------------------------- particles
const PK = {
    leaf: { glow: false, life: [4, 7], size: [5, 7], colors: [0x8cc152, 0xe8a04a, 0xc8d860], vz: [-0.5, -0.3], spread: 0.25 },
    firefly: { glow: true, life: [3, 5], size: [5, 7], colors: [0xfff4a0, 0xe8ff90], vz: [-0.1, 0.1], spread: 0.3, night: true },
    dust: { glow: false, life: [5, 8], size: [2, 3.5], colors: [0xe8e0d0, 0xd0c8e0], vz: [-0.05, 0.08], spread: 0.08, alpha: 0.5 },
    drip: { glow: false, life: [1.2, 2], size: [3, 4], colors: [0x9fd8e8], vz: [-3, -2], spread: 0, from: 'under' },
    glow: { glow: true, life: [3, 6], size: [3, 5], colors: [0x9fffd0, 0xb8f0ff], vz: [-0.05, 0.1], spread: 0.1 },
    spore: { glow: true, life: [4, 7], size: [3, 5], colors: [0xc08cff, 0xe0b0ff], vz: [0.15, 0.35], spread: 0.1 },
    glint: { glow: true, life: [0.4, 0.9], size: [4, 7], colors: [0xffffff, 0x9ff0ff], vz: [0, 0.05], spread: 0 },
    ember: { glow: true, life: [0.8, 1.6], size: [3, 5], colors: [0xffa040, 0xffd060, 0xff6020], vz: [0.6, 1.2], spread: 0.3 },
    spray: { glow: false, life: [0.6, 1.1], size: [5, 8], colors: [0xffffff, 0xd8f0f0], vz: [0.8, 1.6], spread: 1.2, alpha: 0.7 },
    spark: { glow: true, life: [0.2, 0.45], size: [4, 7], colors: [0xffffff, 0xfff0a0, 0xffc060], vz: [0, 0], spread: 0, gravity: 8 },
    poof: { glow: false, life: [0.5, 0.9], size: [9, 14], colors: [0xe8e0f0, 0xcfc6da], vz: [0, 0], spread: 0, alpha: 0.75, drag: 3 },
    sparkle: { glow: true, life: [0.5, 0.9], size: [4, 7], colors: [0xffe27a, 0xffffff, 0x7ff0e2], vz: [0, 0], spread: 0, gravity: -1 },
    puff: { glow: false, life: [0.35, 0.6], size: [6, 9], colors: [0xcbb89a, 0xb8a888], vz: [0, 0], spread: 0, alpha: 0.6, drag: 4 },
    splash: { glow: false, life: [0.4, 0.8], size: [5, 8], colors: [0xffffff, 0xbfe8ee], vz: [0, 0], spread: 0, alpha: 0.85, gravity: 9 },
};

class Particles {
    constructor(view, game) {
        this.view = view;
        this.game = game;
        const N = 1400;
        this.N = N;
        this.sys = {};
        for (const kind of ['soft', 'glow']) {
            const g = new THREE.BufferGeometry();
            const pos = new Float32Array(N * 3);
            const col = new Float32Array(N * 3);
            const size = new Float32Array(N);
            const alpha = new Float32Array(N);
            g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            g.setAttribute('size', new THREE.BufferAttribute(size, 1));
            g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
            const mat = new THREE.ShaderMaterial({
                uniforms: { ...view.U, uScale: { value: 1 } }, vertexShader: PART_VERT, fragmentShader: PART_FRAG, vertexColors: true,
                transparent: true, depthWrite: false, blending: kind === 'glow' ? THREE.AdditiveBlending : THREE.NormalBlending,
            });
            const pts = new THREE.Points(g, mat);
            pts.frustumCulled = false;
            pts.renderOrder = 5;
            this.sys[kind] = { g, mat, pts, pos, col, size, alpha, p: [] };
        }
        this.soft = this.sys.soft.pts;
        this.glow = this.sys.glow.pts;
        this.acc = new Map();
    }

    setScale(s) {
        this.sys.soft.mat.uniforms.uScale.value = s;
        this.sys.glow.mat.uniforms.uScale.value = s;
    }

    spawn(kind, x, y, z, n = 1, base = null) {
        const k = PK[kind];
        const S = this.sys[k.glow ? 'glow' : 'soft'];
        for (let i = 0; i < n && S.p.length < this.N; i++) {
            const r = Math.random;
            S.p.push({
                x: x + (r() - 0.5) * (base ? 0 : 0.2), y: y + (r() - 0.5) * (base ? 0 : 0.2), z,
                vx: (r() - 0.5) * k.spread * 2, vy: (r() - 0.5) * k.spread * 2, vz: k.vz[0] + r() * (k.vz[1] - k.vz[0]),
                life: k.life[0] + r() * (k.life[1] - k.life[0]), age: 0, size: k.size[0] + r() * (k.size[1] - k.size[0]),
                color: new THREE.Color(k.colors[Math.floor(r() * k.colors.length)]), kind, a: k.alpha ?? 1, ph: r() * 6,
            });
        }
    }

    // a burst flying outward from a point
    burst(kind, x, y, z, n, speed = 2, up = 1) {
        const k = PK[kind];
        const S = this.sys[k.glow ? 'glow' : 'soft'];
        for (let i = 0; i < n && S.p.length < this.N; i++) {
            const a = Math.random() * Math.PI * 2;
            const v = speed * (0.4 + Math.random() * 0.6);
            S.p.push({
                x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: up * (0.5 + Math.random()) * speed * 0.6,
                life: k.life[0] + Math.random() * (k.life[1] - k.life[0]), age: 0, size: k.size[0] + Math.random() * (k.size[1] - k.size[0]),
                color: new THREE.Color(k.colors[Math.floor(Math.random() * k.colors.length)]), kind, a: k.alpha ?? 1, ph: Math.random() * 6,
            });
        }
    }

    update(dt, game, t) {
        const b = game.body;
        // emitters near the hero keep their air busy
        for (const e of game.loc.emitters) {
            if (Math.hypot(e.x - b.x, e.y - b.y) > 24 || Math.abs(e.z - b.z) > 14) continue;
            const k = PK[e.kind];
            if (!k) continue;
            if (k.night && game.daylight > 0.45 && game.loc.tiers[0].z - 6 <= e.z) continue;
            const rate = (e.n ?? 10) / (k.life[0] + k.life[1]) * 2;
            const a = (this.acc.get(e) ?? 0) + rate * dt;
            const n = Math.floor(a);
            this.acc.set(e, a - n);
            for (let i = 0; i < n; i++) {
                const ang = Math.random() * 6.28;
                const rr = Math.sqrt(Math.random()) * (e.r ?? 3);
                const x = e.x + Math.cos(ang) * rr;
                const y = e.y + Math.sin(ang) * rr;
                let z = e.z + Math.random() * 2.5;
                if (e.kind === 'leaf') z = e.z + 3 + Math.random() * 2;
                if (e.kind === 'drip') z = e.z - 2 - Math.random() * 2;
                if (e.kind === 'spray') z = e.z;
                this.spawn(e.kind, x, y, z, 1, true);
            }
        }
        for (const S of Object.values(this.sys)) {
            let n = 0;
            for (const p of S.p) {
                p.age += dt;
                if (p.age > p.life) continue;
                if (p.kind === 'leaf') { p.vx = Math.sin(t * 1.5 + p.ph) * 0.4; p.vy = Math.cos(t * 1.2 + p.ph) * 0.3; }
                if (p.kind === 'firefly' || p.kind === 'glow') { p.vx += (Math.random() - 0.5) * dt * 2; p.vy += (Math.random() - 0.5) * dt * 2; p.vx *= 0.98; p.vy *= 0.98; }
                if (p.kind === 'spray') p.vz -= 4 * dt;
                const k = PK[p.kind];
                if (k.gravity) p.vz -= k.gravity * dt;
                if (k.drag) { const f = Math.exp(-k.drag * dt); p.vx *= f; p.vy *= f; p.vz *= f; }
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += p.vz * dt;
                const fade = Math.min(1, p.age * 3, (p.life - p.age) * 2);
                const tw = p.kind === 'glint' || p.kind === 'firefly' ? 0.5 + 0.5 * Math.sin(t * 9 + p.ph * 5) : 1;
                S.pos[n * 3] = p.x;
                S.pos[n * 3 + 1] = p.y;
                S.pos[n * 3 + 2] = p.z;
                S.col[n * 3] = p.color.r;
                S.col[n * 3 + 1] = p.color.g;
                S.col[n * 3 + 2] = p.color.b;
                S.size[n] = p.size;
                S.alpha[n] = p.a * fade * tw;
                S.p[n++] = p;
            }
            S.p.length = n;
            S.g.setDrawRange(0, n);
            for (const a of ['position', 'color', 'size', 'alpha']) S.g.attributes[a].needsUpdate = true;
        }
    }
}

export { KINDS };
