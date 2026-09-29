// Six Winds renderer: an ink-and-wash look taken from pen sketches of harbours.
//
//   paper      the page shows through at the edges of the world and at night
//   wash       flat painted colours, warm in the sun and cool teal in shade
//   hatching   diagonal pen strokes in shadow, pinned to the world as it pans
//   ink        outlines drawn after the fact from depth and normals
//   water      teal from shallow mint to deep, shore lines that breathe
//
// The world is hexagonal columns meshed in chunks; the camera is orthographic
// and turns in steps of 60 degrees, which maps the grid onto itself.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DIRS, NORMALS, LAYER, SQ3, CIRC, center, hexAt } from './hex.js';
import { M, MAT } from './world.js';
import { buildProp, buildNode, buildPerson, buildCreature, buildShip, buildLoot } from './models.js';

const CH = 16; // chunk size in offset columns and rows
const MAXL = 12; // point lights
export const PITCH = 0.62; // camera elevation, radians

// surface patterns drawn in the shader, by material
const PAT = {
    [M.SAND]: 8, [M.GRASS]: 7, [M.DIRT]: 8, [M.STONE]: 2, [M.COBBLE]: 6, [M.CONCRETE]: 5, [M.WOOD]: 3,
    [M.PLASTER_RED]: 1, [M.PLASTER_TEAL]: 1, [M.PLASTER_BLUE]: 1, [M.PLASTER_CREAM]: 1, [M.PLASTER_OCHRE]: 1,
    [M.ROOF_RED]: 4, [M.ROOF_TEAL]: 4, [M.BRICK]: 2, [M.ROCK]: 9, [M.MOSS]: 7, [M.GLOW]: 11, [M.DARKWOOD]: 3,
    [M.LEAVES]: 7, [M.CORAL]: 9, [M.METAL]: 10, [M.TILE]: 12, [M.SEABED]: 8,
};

// ------------------------------------------------------------------ shaders
const COMMON = /* glsl */ `
const float SQ3 = 1.7320508;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec2 hexCenter(vec2 p) {
    float r = 2.0 * p.y / SQ3; float q = p.x - r * 0.5; float s = -q - r;
    float rq = floor(q + 0.5); float rr = floor(r + 0.5); float rs = floor(s + 0.5);
    float dq = abs(rq - q); float dr = abs(rr - r); float ds = abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return vec2(rq + rr * 0.5, rr * SQ3 * 0.5);
}
// distance to the nearest edge of the unit hex grid: 0 on an edge, 0.5 at a centre
float hexEdge(vec2 p) {
    vec2 d = p - hexCenter(p);
    float m = max(abs(d.x), max(abs(dot(d, vec2(0.5, 0.8660254))), abs(dot(d, vec2(-0.5, 0.8660254)))));
    return 0.5 - m;
}
// a line px pixels wide where d = 0, for a distance d measured along coordinate u
float ink(float d, float u, float px) {
    float fw = max(fwidth(u), 1e-4);
    return 1.0 - smoothstep(px * 0.5 * fw, (px * 0.5 + 1.0) * fw, d);
}
float grid(float u, float P, float px) { return ink(abs(fract(u / P + 0.5) - 0.5) * P, u, px); }
`;

const MAIN_VERT = /* glsl */ `
in vec3 color;
in float emit;
in float pat;
in float ao;
out vec3 vColor;
out float vEmit;
out float vPat;
out float vAo;
out vec3 vN;
out vec3 vW;
out vec4 vS;
uniform mat4 uShadowMat;
uniform float uTime;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    // foliage sways a little in the wind
    if (pat > 19.5) {
        float h = pat - 20.0;
        w.xy += vec2(sin(uTime * 1.3 + w.x * 0.4 + w.y * 0.3), cos(uTime * 1.1 + w.y * 0.5)) * 0.035 * h;
    }
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vColor = color;
    vEmit = emit;
    vPat = pat;
    vAo = ao;
    vS = uShadowMat * w;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const MAIN_FRAG = /* glsl */ `
precision highp float;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oNormal;
in vec3 vColor;
in float vEmit;
in float vPat;
in float vAo;
in vec3 vN;
in vec3 vW;
in vec4 vS;
uniform vec3 uSunDir;
uniform vec3 uSun;
uniform vec3 uShade;
uniform vec3 uPaper;
uniform vec3 uInkCol;
uniform float uNight;
uniform float uTime;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;
uniform vec4 uLights[${MAXL}];
uniform vec3 uLightCol[${MAXL}];
uniform vec2 uHatchOff;
uniform float uHatchScale;
uniform vec4 uCut;
uniform vec3 uCamFwd;
uniform vec4 uBounds;
uniform float uSeaZ;
uniform float uFlash;
uniform vec3 uRim;
uniform float uFade;
${COMMON}

float shadowAt(vec3 s, float bias) {
    if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0 || s.z > 1.0) return 1.0;
    float sum = 0.0;
    for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
        float d = texture(uShadowMap, s.xy + vec2(float(i), float(j)) * uShadowTexel).r;
        sum += step(s.z - bias, d);
    }
    return sum / 9.0;
}

// pen and brush work of each material: returns the strength of drawn lines, adjusts tone
float pattern(float pat, vec3 w, vec3 n, inout float tone) {
    bool top = n.z > 0.5;
    float u = dot(w.xy, vec2(-n.y, n.x));
    float v = w.z;
    float seam = top ? ink(hexEdge(w.xy), w.x + w.y, 1.2) : 0.0;
    float l = 0.0;
    if (pat < 0.5) return 0.0;
    if (pat < 1.5) { // plaster: flecks, a line at every storey
        float f = hash(floor(vec2(u, v) * 9.0));
        tone *= 0.97 + 0.06 * vnoise(vec2(u, v) * 1.7);
        l = top ? seam * 0.35 : grid(v - 0.02, 2.5, 1.0) * 0.35 + step(0.985, f) * 0.35;
    } else if (pat < 2.5) { // masonry
        if (top) l = seam * 0.55 + ink(hexEdge(w.xy * 2.0) * 0.5, w.x, 1.0) * 0.2;
        else {
            float row = floor(v / 0.25);
            l = grid(v, 0.25, 1.0) * 0.45 + grid(u + mod(row, 2.0) * 0.25, 0.5, 1.0) * 0.4;
            tone *= 0.95 + 0.1 * hash(vec2(floor((u + mod(row, 2.0) * 0.25) / 0.5), row));
        }
    } else if (pat < 3.5) { // planks
        if (top) {
            float row = floor(w.y / 0.28);
            l = grid(w.y, 0.28, 1.0) * 0.5 + grid(w.x + hash(vec2(row, 1.0)) * 3.0, 1.6, 1.0) * 0.4;
            tone *= 0.92 + 0.14 * hash(vec2(row, floor((w.x + hash(vec2(row, 1.0)) * 3.0) / 1.6)));
        } else l = grid(v, 0.25, 1.0) * 0.35;
    } else if (pat < 4.5) { // roof tiles
        float row = floor((top ? w.y : v) / 0.25);
        float along = top ? w.x : u;
        l = grid(top ? w.y : v, 0.25, 1.0) * 0.45 + grid(along + mod(row, 2.0) * 0.17, 0.34, 1.0) * 0.25;
        tone *= 0.94 + 0.1 * hash(vec2(row, floor((along + mod(row, 2.0) * 0.17) / 0.34)));
    } else if (pat < 5.5) { // concrete panels with tie holes
        tone *= 0.95 + 0.08 * vnoise(vec2(u, v) * 0.9 + w.xy * 0.3);
        if (top) l = seam * 0.3 + grid(w.x, 2.0, 1.0) * 0.2;
        else {
            vec2 c = vec2(u, v) / vec2(0.75, 0.5);
            vec2 f = fract(c) - 0.5;
            l = grid(v, 1.0, 1.2) * 0.5 + grid(u, 1.5, 1.2) * 0.5 + (1.0 - smoothstep(0.05, 0.1, length(f * vec2(0.75, 0.5)))) * 0.45;
        }
    } else if (pat < 6.5) { // cobbles
        if (top) l = seam * 0.5 + ink(hexEdge(w.xy * 3.2 + 0.3) / 3.2, w.x, 1.0) * 0.4;
        else l = grid(v, 0.25, 1.0) * 0.4;
        tone *= 0.94 + 0.1 * hash(hexCenter(w.xy * 3.2 + 0.3));
    } else if (pat < 7.5) { // grass: tufts of short strokes
        if (top) {
            vec2 c = floor(w.xy * 3.0);
            vec2 f = fract(w.xy * 3.0) - vec2(0.5);
            float h = hash(c);
            float tuft = (h > 0.72) ? (1.0 - smoothstep(0.02, 0.06, abs(f.x + f.y * 0.35 * (h - 0.8) * 8.0))) * step(abs(f.y), 0.22) : 0.0;
            tone *= 0.93 + 0.12 * vnoise(w.xy * 0.6);
            l = tuft * 0.45 + seam * 0.12;
        } else l = step(0.93, hash(floor(vec2(u, v) * 10.0))) * 0.35;
    } else if (pat < 8.5) { // sand: stipple
        float s = step(0.955, hash(floor((top ? w.xy : vec2(u, v)) * 11.0)));
        tone *= 0.96 + 0.07 * vnoise(w.xy * 0.5);
        l = s * 0.4 + seam * 0.1;
    } else if (pat < 9.5) { // rock: cracks
        vec2 p = (top ? w.xy : vec2(u, v * 1.4)) * 1.3;
        p += vec2(vnoise(p * 1.7), vnoise(p * 1.7 + 7.0)) * 0.35;
        l = ink(hexEdge(p) / 1.3, p.x, 1.0) * 0.45;
        tone *= 0.9 + 0.15 * hash(hexCenter(p));
    } else if (pat < 10.5) { // corrugated metal
        l = grid(top ? w.x : u, 0.12, 1.0) * 0.35;
    } else if (pat < 11.5) { // the Forerunners' light in the floor
        l = ink(hexEdge(w.xy * 2.0) * 0.5, w.x, 1.0) * 0.3;
    } else if (pat < 12.5) { // hex tiles
        vec2 c = hexCenter(w.xy * 2.0);
        tone *= mod(c.x + c.y * 0.577, 1.0) < 0.5 ? 1.0 : 0.9;
        l = top ? ink(hexEdge(w.xy * 2.0) * 0.5, w.x, 1.0) * 0.4 + seam * 0.4 : grid(v, 0.25, 1.0) * 0.3;
    }
    return l;
}

void main() {
    // cut away what stands between the camera and the hero
    if (uCut.w > 0.0) {
        vec3 d = vW - uCut.xyz;
        float along = dot(d, uCamFwd);
        vec3 perp = d - along * uCamFwd;
        float r = uCut.w * (1.0 + 0.08 * sin(atan(perp.y, perp.x) * 5.0));
        if (along < -0.4 && vW.z > uCut.z + 1.3 && length(perp) < r) discard;
    }
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    float tone = 1.0;
    float lines = pattern(vPat > 19.5 ? 0.0 : floor(vPat + 0.5), vW, n, tone);

    // light: cel bands, warm sun against cool teal shade, hatched where dark
    float ndl = dot(n, uSunDir);
    float bias = 0.0015 + 0.003 * (1.0 - abs(ndl));
    float sh = shadowAt(vS.xyz / vS.w, bias);
    float cloud = smoothstep(0.45, 0.75, vnoise(vW.xy * 0.035 + vec2(uTime * 0.012, uTime * 0.004)));
    float lit = smoothstep(-0.02, 0.12, ndl) * sh * (1.0 - cloud * 0.45 * (1.0 - uNight));
    vec3 light = mix(uShade, uSun, lit);
    light *= mix(0.9, 1.04, clamp(n.z, 0.0, 1.0));
    light *= mix(0.62, 1.0, vAo);
    // lamps
    vec3 lamp = vec3(0.0);
    for (int i = 0; i < ${MAXL}; i++) {
        vec4 L = uLights[i];
        if (L.w <= 0.0) continue;
        vec3 dl = L.xyz - vW;
        float dd = length(dl);
        float a = clamp(1.0 - dd / L.w, 0.0, 1.0);
        lamp += uLightCol[i] * a * a * (0.35 + 0.65 * max(dot(n, dl / dd), 0.0));
    }
    light += lamp * (0.12 + uNight * 1.3);
    vec3 col = vColor * tone * light;
    // wet stains where walls meet the sea
    if (!(n.z > 0.5)) {
        float band = uSeaZ + 0.25 + 0.2 * vnoise(vec2(dot(vW.xy, vec2(-n.y, n.x)) * 2.0, 0.0));
        if (vW.z < band && vW.z > uSeaZ - 1.2) col *= vec3(0.78, 0.86, 0.84);
    }
    // pen strokes of the material, then hatching in shade
    col = mix(col, col * vec3(0.4, 0.42, 0.48), lines * 0.72);
    // pen hatching: cast shadows and faces turned from the sun
    float dark = max(1.0 - sh, smoothstep(0.0, -0.25, ndl));
    vec2 fc = gl_FragCoord.xy + uHatchOff;
    float hs = uHatchScale;
    float h1 = abs(fract((fc.x + fc.y) / hs) - 0.5) * hs;
    float hatch = (1.0 - smoothstep(0.35, 1.1, h1)) * smoothstep(0.45, 0.9, dark);
    if (ndl < -0.1 && sh < 0.5) {
        float h2 = abs(fract((fc.x - fc.y) / (hs * 1.4)) - 0.5) * hs * 1.4;
        hatch = max(hatch, (1.0 - smoothstep(0.35, 1.1, h2)) * 0.5);
    }
    col = mix(col, col * vec3(0.5, 0.58, 0.68), hatch * 0.42 * (1.0 - vEmit));
    // things that glow
    col = mix(col, vColor * (1.15 + 0.25 * uNight), clamp(vEmit, 0.0, 1.0));
    if (vPat > 10.5 && vPat < 11.5) col += vColor * (0.25 + 0.2 * sin(uTime * 2.0 + vW.x * 0.5)) * (0.4 + uNight);
    // actors: hit flash and a rim for the one under the cursor
    col = mix(col, vec3(1.0, 0.95, 0.85), uFlash);
    col += uRim * pow(1.0 - abs(dot(n, -uCamFwd)), 2.0);
    // the world fades into the paper at its borders
    float edge = min(min(vW.x - uBounds.x, uBounds.z - vW.x), min(vW.y - uBounds.y, uBounds.w - vW.y));
    float f = smoothstep(2.0, 3.5, edge + (vnoise(vW.xy * 0.4) - 0.5) * 3.0 + (hash(floor(vW.xy * 3.0)) - 0.5) * 0.6) * uFade;
    col = mix(uPaper, col, f);
    oColor = vec4(col, 1.0);
    oNormal = vec4(n * 0.5 + 0.5, f);
}`;

const WATER_VERT = /* glsl */ `
in float depth;
out float vDepth;
out vec3 vW;
out vec4 vS;
uniform mat4 uShadowMat;
uniform float uTime;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    w.z += sin(uTime * 0.9 + w.x * 0.5 + w.y * 0.3) * 0.025;
    vW = w.xyz;
    vDepth = depth;
    vS = uShadowMat * w;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const WATER_FRAG = /* glsl */ `
precision highp float;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oNormal;
in float vDepth;
in vec3 vW;
in vec4 vS;
uniform vec3 uSun;
uniform vec3 uShade;
uniform vec3 uPaper;
uniform float uNight;
uniform float uTime;
uniform sampler2D uShadowMap;
uniform float uShadowTexel;
uniform vec4 uCut;
uniform vec3 uCamFwd;
uniform vec2 uCamRight;
uniform vec2 uCamUp;
uniform vec4 uBounds;
uniform vec4 uLights[${MAXL}];
uniform vec3 uLightCol[${MAXL}];
${COMMON}
void main() {
    if (uCut.w > 0.0) {
        vec3 d = vW - uCut.xyz;
        float along = dot(d, uCamFwd);
        if (along < -0.4 && vW.z > uCut.z + 1.3 && length(d - along * uCamFwd) < uCut.w) discard;
    }
    float dN = clamp(vDepth / 7.0, 0.0, 1.0);
    vec3 shallow = vec3(0.58, 0.87, 0.79);
    vec3 mid = vec3(0.25, 0.7, 0.66);
    vec3 deep = vec3(0.12, 0.45, 0.52);
    vec3 col = dN < 0.3 ? mix(shallow, mid, dN / 0.3) : mix(mid, deep, (dN - 0.3) / 0.7);
    vec3 s = vS.xyz / vS.w;
    float sh = 1.0;
    if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0) sh = step(s.z - 0.003, texture(uShadowMap, s.xy).r);
    col *= mix(uShade * 1.05, uSun, sh);
    vec3 lamp = vec3(0.0);
    for (int i = 0; i < ${MAXL}; i++) {
        vec4 L = uLights[i];
        if (L.w <= 0.0) continue;
        float a = clamp(1.0 - length(L.xyz - vW) / L.w, 0.0, 1.0);
        lamp += uLightCol[i] * a * a;
    }
    col += lamp * uNight * 0.8;
    // lines that follow the shore and breathe in and out
    float shore = 1.0 - smoothstep(0.0, 2.6, vDepth);
    float wave = abs(fract(vDepth * 0.8 - uTime * 0.16) - 0.5);
    float foam = ink(wave * 1.25, vDepth, 1.4) * shore;
    foam = max(foam, 1.0 - smoothstep(0.08, 0.3, vDepth));
    // drifting ripples: light dashes, the odd ink stroke
    vec2 sp = vec2(dot(vW.xy, uCamRight), dot(vW.xy, uCamUp));
    vec2 p = sp * vec2(0.35, 2.2) + vec2(uTime * 0.06, 0.0);
    float n = vnoise(p) + 0.4 * vnoise(p * 2.1 + uTime * 0.05);
    float band = abs(fract(n * 3.0) - 0.5);
    float rip = ink(band * 0.33, n, 1.0) * step(0.62, vnoise(sp * vec2(0.8, 3.0) + 3.0 + uTime * 0.03));
    col = mix(col, vec3(0.93, 0.99, 0.95), foam * 0.75 + rip * 0.45 * (1.0 - dN * 0.4));
    float dark = step(0.72, vnoise(sp * vec2(0.5, 2.6) - 9.0 - uTime * 0.02)) * rip;
    col = mix(col, deep * 0.5, dark * 0.55);
    float edge = min(min(vW.x - uBounds.x, uBounds.z - vW.x), min(vW.y - uBounds.y, uBounds.w - vW.y));
    float f = smoothstep(2.0, 3.5, edge + (vnoise(vW.xy * 0.4) - 0.5) * 3.0 + (hash(floor(vW.xy * 3.0)) - 0.5) * 0.6);
    col = mix(uPaper, col, f);
    float alpha = mix(0.58, 0.94, smoothstep(0.0, 0.55, dN));
    alpha = mix(alpha, 1.0, foam * 0.5);
    alpha *= f;
    oColor = vec4(col, alpha);
    oNormal = vec4(0.5, 0.5, 1.0, alpha);
}`;

const FLAT_VERT = /* glsl */ `
in vec3 color;
out vec3 vColor;
out vec3 vW;
void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    vColor = color;
    gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FLAT_FRAG = /* glsl */ `
precision highp float;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oNormal;
in vec3 vColor;
in vec3 vW;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
void main() {
    oColor = vec4(vColor * uColor, uOpacity);
    oNormal = vec4(0.5, 0.5, 1.0, 0.0);
}`;

const PART_VERT = /* glsl */ `
in vec3 color;
in float size;
out vec3 vColor;
uniform float uScale;
void main() {
    vColor = color;
    vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale;
    gl_Position = projectionMatrix * mv;
}`;

const PART_FRAG = /* glsl */ `
precision highp float;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oNormal;
in vec3 vColor;
void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    oColor = vec4(vColor, 1.0 - smoothstep(0.3, 0.5, d));
    oNormal = vec4(0.5, 0.5, 1.0, 0.0);
}`;

const POST_VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const POST_FRAG = /* glsl */ `
precision highp float;
layout(location = 0) out vec4 oColor;
in vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uRange;
uniform float uLine;
uniform vec3 uPaper;
uniform vec3 uInkCol;
uniform vec2 uHatchOff;
uniform float uNight;
${COMMON}
float D(vec2 uv) { return texture(tDepth, uv).r * uRange; }
void main() {
    // a slight hand tremor, pinned to the world
    vec2 px = gl_FragCoord.xy + uHatchOff;
    vec2 wob = (vec2(vnoise(px / 37.0), vnoise(px / 37.0 + 19.0)) - 0.5) * 1.2 * uTexel;
    vec2 uv = vUv + wob;
    vec2 t = uTexel * uLine;
    float d0 = D(uv);
    float dl = D(uv - vec2(t.x, 0.0));
    float dr = D(uv + vec2(t.x, 0.0));
    float dd = D(uv - vec2(0.0, t.y));
    float du = D(uv + vec2(0.0, t.y));
    float lap = abs(dl + dr - 2.0 * d0) + abs(dd + du - 2.0 * d0);
    float ed = smoothstep(0.1, 0.3, lap);
    vec4 n0 = texture(tNormal, uv);
    vec4 nl = texture(tNormal, uv - vec2(t.x, 0.0));
    vec4 nr = texture(tNormal, uv + vec2(t.x, 0.0));
    vec4 nd = texture(tNormal, uv - vec2(0.0, t.y));
    vec4 nu = texture(tNormal, uv + vec2(0.0, t.y));
    vec3 N0 = n0.xyz * 2.0 - 1.0;
    float m = 1.0;
    m = min(m, dot(N0, nl.xyz * 2.0 - 1.0));
    m = min(m, dot(N0, nr.xyz * 2.0 - 1.0));
    m = min(m, dot(N0, nd.xyz * 2.0 - 1.0));
    m = min(m, dot(N0, nu.xyz * 2.0 - 1.0));
    // right-angle creases are drawn fully, the 60 degree turns of hex walls lightly
    float en = (smoothstep(0.86, 0.7, m) * 0.4 + smoothstep(0.4, 0.2, m) * 0.6) * step(0.5, n0.a);
    float mask = max(max(n0.a, max(nl.a, nr.a)), max(nd.a, nu.a));
    float edge = max(ed, en) * mask;
    // pressure varies along a stroke
    edge *= 0.75 + 0.25 * vnoise(px / 9.0);
    vec3 col = texture(tColor, vUv).rgb;
    col = mix(col, uInkCol, edge * 0.92);
    // paper: grain and fibres, a warm vignette
    float g = hash(floor(gl_FragCoord.xy)) * 0.5 + vnoise(gl_FragCoord.xy / 3.0) * 0.5;
    col *= 0.965 + 0.05 * g;
    vec2 q = vUv - 0.5;
    float vig = dot(q, q);
    col = mix(col, col * vec3(0.86, 0.82, 0.76), smoothstep(0.12, 0.5, vig) * (1.0 - uNight * 0.5));
    oColor = vec4(col, 1.0);
}`;

// ------------------------------------------------------------------ helpers
const tmpC = new THREE.Color();

function tint(hex, k) {
    tmpC.setHex(hex);
    return [tmpC.r * k, tmpC.g * k, tmpC.b * k];
}

function hash3(q, r, z) {
    let h = Math.imul(q, 374761393) ^ Math.imul(r, 668265263) ^ Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// geometry of a group, baked into world space, with every attribute the main shader reads
function bakeGroup(root, pat = 0, sway = false) {
    root.updateMatrixWorld(true);
    const base = root.position.z;
    const geos = [];
    root.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        const n = g.attributes.position.count;
        if (!g.attributes.normal) g.computeVertexNormals();
        const c = g.attributes.color?.array;
        let leafy = false;
        if (sway && c) leafy = c[1] > c[0] * 1.05 && c[1] > c[2] * 1.05 || (c[0] > 0.8 && c[1] > 0.35 && c[1] < 0.72 && c[2] < 0.4);
        const pa = new Float32Array(n).fill(pat);
        // foliage keeps its height above the prop's foot, for the wind
        if (leafy) { const P = g.attributes.position.array; for (let i = 0; i < n; i++) pa[i] = 20 + Math.min(4, Math.max(0, P[i * 3 + 2] - base - 0.3)); }
        g.setAttribute('pat', new THREE.BufferAttribute(pa, 1));
        g.setAttribute('ao', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'emit', 'pat', 'ao'].includes(k)) g.deleteAttribute(k);
        geos.push(g);
    });
    return geos;
}

function disposeTree(o) {
    o.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
}

// ------------------------------------------------------------------ the view
export class View {
    constructor(canvas, gen) {
        this.canvas = canvas;
        this.gen = gen;
        this.world = gen.world;
        const r = new THREE.WebGLRenderer({ canvas, antialias: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
        THREE.ColorManagement.enabled = false;
        r.outputColorSpace = THREE.LinearSRGBColorSpace;
        r.autoClear = false;
        this.renderer = r;
        this.scene = new THREE.Scene();
        this.scene.matrixWorldAutoUpdate = true;
        this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 260);
        this.cam.up.set(0, 0, 1);
        this.cam.layers.enable(1);
        this.cam.layers.enable(2);
        this.az = Math.PI / 2;
        this.azTarget = this.az;
        this.zoom = 9;
        this.zoomTarget = 9;
        this.focus = new THREE.Vector3();
        this.focusTarget = new THREE.Vector3();
        this.scale = 1;
        this.time = 0;
        this.day = 0.36; // 0..1, 0.5 is noon
        this.cut = 0;
        this.hero = null;

        const W = this.world;
        this.bounds = new THREE.Vector4(0.5, 0.5, W.W - 1, (W.D - 1) * SQ3 / 2);

        // shadows: a depth map from the sun, following the camera
        this.shadowSize = 2048;
        this.shadowRT = new THREE.WebGLRenderTarget(this.shadowSize, this.shadowSize, { depthTexture: new THREE.DepthTexture(this.shadowSize, this.shadowSize), minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        this.shadowCam = new THREE.OrthographicCamera(-30, 30, 30, -30, 1, 200);
        this.shadowCam.up.set(0, 0, 1);
        this.shadowMat = new THREE.MeshDepthMaterial();

        // shared uniforms: every material refers to the same objects
        const lights = Array.from({ length: MAXL }, () => new THREE.Vector4(0, 0, 0, 0));
        const lightCols = Array.from({ length: MAXL }, () => new THREE.Color(0));
        this.U = {
            uSunDir: { value: new THREE.Vector3(-0.6, -0.25, 0.76).normalize() },
            uSun: { value: new THREE.Color(1, 0.97, 0.9) },
            uShade: { value: new THREE.Color(0.6, 0.72, 0.8) },
            uPaper: { value: new THREE.Color(0.95, 0.925, 0.86) },
            uInkCol: { value: new THREE.Color(0.14, 0.16, 0.19) },
            uNight: { value: 0 },
            uTime: { value: 0 },
            uShadowMap: { value: this.shadowRT.depthTexture },
            uShadowTexel: { value: 1 / this.shadowSize },
            uShadowMat: { value: new THREE.Matrix4() },
            uLights: { value: lights },
            uLightCol: { value: lightCols },
            uHatchOff: { value: new THREE.Vector2() },
            uHatchScale: { value: 6 },
            uCut: { value: new THREE.Vector4(0, 0, 0, 0) },
            uCamFwd: { value: new THREE.Vector3() },
            uCamRight: { value: new THREE.Vector2(1, 0) },
            uCamUp: { value: new THREE.Vector2(0, 1) },
            uBounds: { value: this.bounds },
            uSeaZ: { value: W.sea * LAYER },
        };
        this.mainMat = this.makeMain();
        this.waterMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, uniforms: { ...this.U },
            transparent: true, depthWrite: true, blending: THREE.CustomBlending,
            blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
        });
        this.partMat = new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3, vertexShader: PART_VERT, fragmentShader: PART_FRAG, uniforms: { uScale: { value: 1 } },
            transparent: true, depthWrite: false, blending: THREE.CustomBlending,
            blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
        });

        // the page: colour and normals of the scene, and its depth
        this.rt = new THREE.WebGLRenderTarget(4, 4, { count: 2, depthTexture: new THREE.DepthTexture(4, 4), minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        this.post = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)), new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3, vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
            uniforms: {
                tColor: { value: this.rt.textures[0] }, tNormal: { value: this.rt.textures[1] }, tDepth: { value: this.rt.depthTexture },
                uTexel: { value: new THREE.Vector2() }, uRange: { value: 259 }, uLine: { value: 1 }, uPaper: this.U.uPaper, uInkCol: this.U.uInkCol,
                uHatchOff: this.U.uHatchOff, uNight: this.U.uNight,
            },
        }));
        this.post.frustumCulled = false;
        this.postScene = new THREE.Scene();
        this.postScene.add(this.post);
        this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // chunks of the world, built lazily around the camera
        this.chunks = new Map();
        this.propsByChunk = new Map();
        for (const p of gen.props) this.chunkList(this.propsByChunk, p.q, p.r).push(p);
        this.nodes = new Map();
        for (const n of gen.nodes) {
            if (n.kind === 'fishspot') continue;
            const g = buildNode(n);
            if (!g) continue;
            const mesh = new THREE.Mesh(mergeGeometries(bakeGroup(g, 0, true)), this.mainMat);
            mesh.userData.node = n;
            this.scene.add(mesh);
            this.nodes.set(n.id, mesh);
        }
        this.lightList = gen.lights.map((l) => { const [x, y] = center(l.q, l.r); return { x, y, z: l.z * LAYER, color: new THREE.Color(l.color), range: l.range }; });
        this.actors = new Map();
        this.initMarkers();
        this.initParticles();
        this.resize();
    }

    makeMain(extra = {}) {
        return new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3, vertexShader: MAIN_VERT, fragmentShader: MAIN_FRAG,
            uniforms: { ...this.U, uFlash: { value: 0 }, uRim: { value: new THREE.Color(0) }, uFade: { value: 1 }, ...extra },
        });
    }

    chunkKey(q, r) {
        const col = q + (r - (r & 1)) / 2;
        return (Math.floor(r / CH) + 64) * 256 + Math.floor(col / CH) + 64;
    }

    chunkList(map, q, r) {
        const k = this.chunkKey(q, r);
        let l = map.get(k);
        if (!l) map.set(k, (l = []));
        return l;
    }

    // ---------------------------------------------------------- meshing
    buildChunk(cx, cy) {
        const w = this.world;
        const { W, D, H } = w;
        const cells = w.cells;
        const pos = [];
        const nor = [];
        const col = [];
        const emi = [];
        const pat = [];
        const aos = [];
        const idx = [];
        const wpos = [];
        const wdep = [];
        const widx = [];
        const solidAt = (q, r, z) => {
            if (z < 0) return true;
            if (z >= H) return false;
            const c = q + (r - (r & 1)) / 2;
            if (c < 0 || c >= W || r < 0 || r >= D) return false;
            return MAT[cells[(z * D + r) * W + c]].solid === true;
        };
        const mAt = (q, r, z) => {
            const c = q + (r - (r & 1)) / 2;
            if (c < 0 || c >= W || r < 0 || r >= D || z < 0 || z >= H) return z < w.sea && z >= 0 ? M.WATER : M.AIR;
            return cells[(z * D + r) * W + c];
        };
        // column water depth: layers of water above the floor
        const depthOf = (q, r) => {
            let k = w.sea - 1;
            if (mAt(q, r, k) !== M.WATER) return 0;
            let d = 0;
            while (k >= 0 && mAt(q, r, k) === M.WATER) { d++; k--; }
            return d;
        };
        const CX = [];
        const CY = [];
        for (let j = 0; j < 6; j++) { const a = ((30 + 60 * j) * Math.PI) / 180; CX.push(Math.cos(a) * CIRC); CY.push(Math.sin(a) * CIRC); }
        const quad = (verts, n, c, e, p, a) => {
            const base = pos.length / 3;
            for (let i = 0; i < 4; i++) {
                pos.push(...verts[i]);
                nor.push(n[0], n[1], n[2]);
                col.push(...c);
                emi.push(e);
                pat.push(p);
                aos.push(a[i]);
            }
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
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
                        if (mAt(q, r, z + 1) === M.WATER || solidAt(q, r, z + 1)) continue;
                        // the water's surface: a hex fan with depth per corner for the gradient
                        const zz = (z + 1) * LAYER - 0.1;
                        const dc = depthOf(q, r) + (z + 1 - w.sea);
                        const nd = DIRS.map(([dq, dr]) => (mAt(q + dq, r + dr, z) === M.WATER ? depthOf(q + dq, r + dr) + (z + 1 - w.sea) : 0));
                        const base = wpos.length / 3;
                        wpos.push(x, y, zz);
                        wdep.push(dc);
                        for (let j = 0; j < 6; j++) {
                            wpos.push(x + CX[j], y + CY[j], zz);
                            wdep.push((dc + nd[j] + nd[(j + 1) % 6]) / 3);
                        }
                        for (let j = 0; j < 6; j++) widx.push(base, base + 1 + j, base + 1 + ((j + 1) % 6));
                        continue;
                    }
                    if (!mt.solid) continue;
                    const k = 0.95 + hash3(q, r, z) * 0.09;
                    const p = PAT[m] ?? 0;
                    // top
                    if (!solidAt(q, r, z + 1)) {
                        const zz = (z + 1) * LAYER;
                        const cc = tint(mt.color, k);
                        const occ = DIRS.map(([dq, dr]) => (solidAt(q + dq, r + dr, z + 1) ? 1 : 0));
                        const base = pos.length / 3;
                        pos.push(x, y, zz);
                        nor.push(0, 0, 1);
                        col.push(...cc);
                        emi.push(mt.emit);
                        pat.push(p);
                        aos.push(1);
                        for (let j = 0; j < 6; j++) {
                            pos.push(x + CX[j], y + CY[j], zz);
                            nor.push(0, 0, 1);
                            col.push(...cc);
                            emi.push(mt.emit);
                            pat.push(p);
                            aos.push(1 - 0.28 * (occ[j] + occ[(j + 1) % 6]));
                        }
                        for (let j = 0; j < 6; j++) idx.push(base, base + 1 + j, base + 1 + ((j + 1) % 6));
                    }
                    // sides: merge runs of the same material up the column
                    for (let i = 0; i < 6; i++) {
                        const nq = q + DIRS[i][0];
                        const nr = r + DIRS[i][1];
                        if (solidAt(nq, nr, z)) continue;
                        if (z > 0 && cells[((z - 1) * D + r) * W + c] === m && !solidAt(nq, nr, z - 1)) continue; // not the start of a run
                        let z1 = z;
                        while (z1 + 1 < H && cells[((z1 + 1) * D + r) * W + c] === m && !solidAt(nq, nr, z1 + 1)) z1++;
                        // hidden under the sea floor of the world's edge
                        const grounded = solidAt(nq, nr, z - 1);
                        const a = (i + 5) % 6;
                        const b = i;
                        const sideCol = tint(mt.side && z1 === z && !solidAt(q, r, z + 1) ? mt.side : mt.color, k * 0.97);
                        const sidePat = mt.side && !solidAt(q, r, z + 1) && z1 === z ? 8 : p;
                        const n = [NORMALS[i][0], NORMALS[i][1], 0];
                        const segs = [];
                        if (grounded && z1 > z) segs.push([z, z + 1, 0.7, 1], [z + 1, z1 + 1, 1, 1]);
                        else segs.push([z, z1 + 1, grounded ? 0.7 : 1, 1]);
                        for (const [s0, s1, a0, a1] of segs) {
                            const lo = s0 * LAYER;
                            const hi = s1 * LAYER;
                            quad([[x + CX[a], y + CY[a], lo], [x + CX[b], y + CY[b], lo], [x + CX[b], y + CY[b], hi], [x + CX[a], y + CY[a], hi]], n, sideCol, mt.emit, sidePat, [a0, a0, a1, a1]);
                        }
                    }
                }
            }
        }
        const group = new THREE.Group();
        if (idx.length) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
            g.setAttribute('emit', new THREE.Float32BufferAttribute(emi, 1));
            g.setAttribute('pat', new THREE.Float32BufferAttribute(pat, 1));
            g.setAttribute('ao', new THREE.Float32BufferAttribute(aos, 1));
            g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
            g.computeBoundingSphere();
            group.add(new THREE.Mesh(g, this.mainMat));
        }
        if (widx.length) {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
            g.setAttribute('depth', new THREE.Float32BufferAttribute(wdep, 1));
            g.setIndex(wpos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(widx, 1) : new THREE.Uint16BufferAttribute(widx, 1));
            g.computeBoundingSphere();
            const m = new THREE.Mesh(g, this.waterMat);
            m.layers.set(1);
            m.renderOrder = 1;
            group.add(m);
        }
        // props of this chunk, baked into one mesh
        const props = this.propsByChunk.get((cy + 64) * 256 + cx + 64) ?? [];
        const geos = [];
        for (const p of props) {
            const g = buildProp(p);
            if (!g) continue;
            geos.push(...bakeGroup(g, 0, true));
            disposeTree(g);
        }
        if (geos.length) {
            const g = mergeGeometries(geos);
            for (const x of geos) x.dispose();
            g.computeBoundingSphere();
            group.add(new THREE.Mesh(g, this.mainMat));
        }
        return group;
    }

    ensureChunks(budget = 4) {
        const { W, D } = this.world;
        const f = this.focus;
        const aspect = this.width / this.height;
        const R = this.zoom * Math.max(aspect, 1) * 1.45 + 12;
        const ccx = Math.floor(f.x / CH);
        const ccy = Math.floor(f.y / (SQ3 / 2) / CH);
        const n = Math.ceil(R / CH) + 1;
        const want = [];
        for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) {
            const cx = ccx + dx;
            const cy = ccy + dy;
            if (cx < 0 || cy < 0 || cx * CH >= W || cy * CH >= D) continue;
            const x = cx * CH + CH / 2;
            const y = (cy * CH + CH / 2) * (SQ3 / 2);
            const d = Math.hypot(x - f.x, y - f.y);
            if (d > R + CH) continue;
            const k = (cy + 64) * 256 + cx + 64;
            if (!this.chunks.has(k)) want.push([d, cx, cy, k]);
        }
        want.sort((a, b) => a[0] - b[0]);
        for (const [, cx, cy, k] of want.slice(0, budget)) {
            const g = this.buildChunk(cx, cy);
            this.scene.add(g);
            this.chunks.set(k, g);
        }
        return want.length;
    }

    // ---------------------------------------------------------- markers and particles
    initMarkers() {
        const ringGeo = (r0, r1) => {
            const pos = [];
            const cols = [];
            for (let j = 0; j < 6; j++) {
                const a0 = ((30 + 60 * j) * Math.PI) / 180;
                const a1 = ((30 + 60 * (j + 1)) * Math.PI) / 180;
                const p = [[Math.cos(a0) * r0, Math.sin(a0) * r0], [Math.cos(a0) * r1, Math.sin(a0) * r1], [Math.cos(a1) * r1, Math.sin(a1) * r1], [Math.cos(a1) * r0, Math.sin(a1) * r0]];
                for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(p[i][0], p[i][1], 0); cols.push(1, 1, 1); }
            }
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
            return g;
        };
        const flat = (color, opacity) => new THREE.ShaderMaterial({
            glslVersion: THREE.GLSL3, vertexShader: FLAT_VERT, fragmentShader: FLAT_FRAG, transparent: true, depthWrite: false,
            uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: this.U.uTime },
            blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
        });
        this.targetRing = new THREE.Mesh(ringGeo(CIRC * 0.78, CIRC * 1.02), flat(0xd8453a, 0.95));
        this.targetRing.layers.set(2);
        this.targetRing.visible = false;
        this.targetRing.renderOrder = 3;
        this.scene.add(this.targetRing);
        this.moveRing = new THREE.Mesh(ringGeo(CIRC * 0.6, CIRC * 0.85), flat(0xffffff, 0.8));
        this.moveRing.layers.set(2);
        this.moveRing.visible = false;
        this.moveRing.renderOrder = 3;
        this.scene.add(this.moveRing);
        this.moveT = 0;
    }

    initParticles() {
        const N = 1200;
        this.pN = N;
        this.pPos = new Float32Array(N * 3);
        this.pCol = new Float32Array(N * 3);
        this.pSize = new Float32Array(N);
        this.pVel = new Float32Array(N * 3);
        this.pLife = new Float32Array(N);
        this.pMax = new Float32Array(N);
        this.pGrav = new Float32Array(N);
        this.pBase = new Float32Array(N);
        this.pNext = 0;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
        g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
        this.points = new THREE.Points(g, this.partMat);
        this.points.frustumCulled = false;
        this.points.layers.set(2);
        this.points.renderOrder = 4;
        this.scene.add(this.points);
    }

    spark(x, y, z, vx, vy, vz, color, size, life, grav = 9) {
        const i = this.pNext;
        this.pNext = (i + 1) % this.pN;
        this.pPos.set([x, y, z], i * 3);
        this.pVel.set([vx, vy, vz], i * 3);
        tmpC.setHex(color);
        this.pCol.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
        this.pBase[i] = size;
        this.pSize[i] = size;
        this.pLife[i] = life;
        this.pMax[i] = life;
        this.pGrav[i] = grav;
    }

    // kinds: hit, crit, splash, dust, heal, level, gather, magic, fire, bubble, coin
    fx(kind, x, y, z, o = {}) {
        const R = Math.random;
        const burst = (n, color, speed, up, size, life, grav) => {
            for (let i = 0; i < n; i++) {
                const a = R() * Math.PI * 2;
                const s = speed * (0.4 + R() * 0.6);
                this.spark(x, y, z, Math.cos(a) * s, Math.sin(a) * s, up * (0.5 + R()), color, size * (0.7 + R() * 0.6), life * (0.6 + R() * 0.6), grav);
            }
        };
        switch (kind) {
            case 'hit': burst(10, o.color ?? 0xffffff, 3, 3, 7, 0.35, 12); burst(5, 0x22262a, 2, 2, 5, 0.3, 10); break;
            case 'crit': burst(18, 0xffd24a, 5, 4, 9, 0.5, 12); break;
            case 'splash': burst(o.n ?? 16, 0xe8fbf4, 2.4, 5, 7, 0.7, 16); break;
            case 'dust': burst(8, 0xd8cdb0, 1.4, 1, 8, 0.5, 2); break;
            case 'heal': for (let i = 0; i < 14; i++) this.spark(x + (R() - 0.5) * 0.8, y + (R() - 0.5) * 0.8, z + R() * 0.5, 0, 0, 1.5 + R(), 0x7ff0a0, 7, 0.9, -1); break;
            case 'level': for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; this.spark(x + Math.cos(a) * 0.6, y + Math.sin(a) * 0.6, z, Math.cos(a) * 0.5, Math.sin(a) * 0.5, 2 + R() * 2, i % 2 ? 0xffd24a : 0x6ff5cf, 9, 1.3, -0.5); } break;
            case 'gather': burst(8, o.color ?? 0xe0c070, 1.5, 3, 6, 0.6, 9); break;
            case 'magic': burst(14, o.color ?? 0x8fd8ff, 2, 2, 8, 0.6, 0); break;
            case 'fire': burst(10, 0xffa040, 1.2, 2.5, 9, 0.6, -2); break;
            case 'bubble': for (let i = 0; i < 6; i++) this.spark(x + (R() - 0.5) * 0.5, y + (R() - 0.5) * 0.5, z, 0, 0, 1 + R(), 0xe8fbf4, 5, 0.6, -1); break;
            case 'coin': burst(8, 0xffd24a, 1.6, 4, 6, 0.7, 12); break;
            default: burst(6, 0xffffff, 2, 2, 6, 0.4, 8);
        }
    }

    tickParticles(dt) {
        const { pPos, pVel, pLife, pMax, pSize, pBase, pGrav } = this;
        for (let i = 0; i < this.pN; i++) {
            if (pLife[i] <= 0) { pSize[i] = 0; continue; }
            pLife[i] -= dt;
            pVel[i * 3 + 2] -= pGrav[i] * dt;
            pPos[i * 3] += pVel[i * 3] * dt;
            pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
            pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
            pSize[i] = pBase[i] * Math.min(1, (pLife[i] / pMax[i]) * 2.5);
        }
        const g = this.points.geometry;
        g.attributes.position.needsUpdate = true;
        g.attributes.color.needsUpdate = true;
        g.attributes.size.needsUpdate = true;
    }

    // ---------------------------------------------------------- actors
    // a: { id, model: {type, ...}, x, y, z, face, walk, attack, hurt, dead, flash, rim, swim, bob }
    actor(a) {
        let e = this.actors.get(a.id);
        if (e && (a.model.key ?? '') !== e.key) { this.removeActor(a.id); e = null; }
        if (!e) {
            const m = a.model;
            let g;
            if (m.type === 'person') g = buildPerson(m.opts);
            else if (m.type === 'ship') g = buildShip(m.opts);
            else if (m.type === 'loot') g = buildLoot();
            else g = buildCreature(m.kind, m.def);
            const mat = this.makeMain();
            g.traverse((o) => { if (o.isMesh) { o.material = mat; if (!o.geometry.attributes.pat) { const n = o.geometry.attributes.position.count; o.geometry.setAttribute('pat', new THREE.BufferAttribute(new Float32Array(n), 1)); o.geometry.setAttribute('ao', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1)); } } });
            if (m.scale) g.scale.setScalar(m.scale);
            this.scene.add(g);
            e = { g, mat, parts: g.userData.parts ?? {}, face: a.face ?? 0, seen: 0, key: m.key ?? '' };
            this.actors.set(a.id, e);
        }
        e.seen = this.frame;
        const { g, parts, mat } = e;
        g.visible = a.visible !== false;
        let d = (a.face ?? e.face) - e.face;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        e.face += d * Math.min(1, 0.25);
        g.position.set(a.x, a.y, a.z + (a.bob ?? 0));
        g.rotation.set(0, 0, e.face);
        const dead = a.dead ?? 0;
        if (dead > 0) g.rotation.x = Math.min(1, dead) * 1.4;
        mat.uniforms.uFlash.value = a.flash ?? 0;
        mat.uniforms.uRim.value.setHex(a.rim ?? 0);
        mat.uniforms.uFade.value = 1 - Math.max(0, dead - 1);
        // limbs
        const t = a.walk ?? 0;
        const sw = Math.sin(t) * Math.min(1, a.speed ?? 0);
        if (parts.legs) parts.legs.forEach((l, i) => { l.rotation.y = (i % 2 ? sw : -sw) * 0.7; });
        if (parts.body) parts.body.position.z = Math.abs(Math.sin(t)) * 0.05 * Math.min(1, a.speed ?? 0);
        const atk = a.attack ?? 0;
        if (parts.arm) parts.arm.rotation.y = atk > 0 ? -Math.sin(atk * Math.PI) * 2.0 : -sw * 0.5;
        if (parts.arm2) parts.arm2.rotation.y = sw * 0.5 - (a.cast ?? 0) * 1.6;
        if (parts.wings) parts.wings.forEach((w, i) => { w.rotation.x = Math.sin(this.time * 10 + i * 3) * 0.6 * (i % 2 ? 1 : -1); w.rotation.z = this.time * (i + 1); });
        if (parts.head) parts.head.rotation.z = Math.sin(this.time * 0.7 + a.x) * 0.15 * (1 - Math.min(1, a.speed ?? 0));
        if (parts.sail) parts.sail.rotation.z = Math.sin(this.time * 0.4) * 0.12;
        if (parts.cape) parts.cape.rotation.y = -0.2 - Math.min(1, a.speed ?? 0) * 0.5 + Math.sin(this.time * 3) * 0.05;
        if (a.hurt > 0) g.position.x += Math.sin(this.time * 60) * 0.04 * a.hurt;
        return e;
    }

    removeActor(id) {
        const e = this.actors.get(id);
        if (!e) return;
        this.scene.remove(e.g);
        disposeTree(e.g);
        e.mat.dispose();
        this.actors.delete(id);
    }

    // remove actors not refreshed this frame
    sweepActors() {
        for (const [id, e] of this.actors) if (e.seen !== this.frame) this.removeActor(id);
    }

    setNode(id, alive) {
        const m = this.nodes.get(id);
        if (m) m.visible = alive;
    }

    setTarget(x, y, z) {
        this.targetRing.visible = x !== null && x !== undefined;
        if (this.targetRing.visible) this.targetRing.position.set(x, y, z + 0.04);
    }

    showMove(x, y, z) {
        this.moveRing.position.set(x, y, z + 0.04);
        this.moveT = 0.8;
    }

    // ---------------------------------------------------------- camera
    rotate(steps) {
        this.azTarget += (steps * Math.PI) / 3;
    }

    // world direction of screen right and screen up, for input
    axes() {
        const a = this.az;
        return { up: [Math.cos(a), Math.sin(a)], right: [Math.sin(a), -Math.cos(a)] };
    }

    resize() {
        const w = this.canvas.clientWidth || window.innerWidth;
        const h = this.canvas.clientHeight || window.innerHeight;
        this.width = w;
        this.height = h;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.dpr = dpr;
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h, false);
        this.applyScale();
    }

    applyScale() {
        const pw = Math.max(4, Math.round(this.width * this.dpr * this.scale));
        const ph = Math.max(4, Math.round(this.height * this.dpr * this.scale));
        this.rt.setSize(pw, ph);
        this.rt.depthTexture.image.width = pw;
        this.rt.depthTexture.image.height = ph;
        this.post.material.uniforms.uTexel.value.set(1 / pw, 1 / ph);
        this.post.material.uniforms.uLine.value = Math.max(1, this.dpr * this.scale * 0.9);
        this.U.uHatchScale.value = Math.max(4, 5.5 * this.dpr * this.scale);
        this.partMat.uniforms.uScale.value = this.dpr * this.scale * (9 / this.zoom);
        this.pw = pw;
        this.ph = ph;
    }

    setScale(s) {
        s = Math.max(0.5, Math.min(1, s));
        if (Math.abs(s - this.scale) < 0.05) return;
        this.scale = s;
        this.applyScale();
    }

    updateCamera(dt) {
        const k = 1 - Math.exp(-dt * 9);
        this.az += (this.azTarget - this.az) * k;
        if (Math.abs(this.azTarget - this.az) < 1e-4) this.az = this.azTarget;
        this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 8));
        this.focus.lerp(this.focusTarget, 1 - Math.exp(-dt * 7));
        const c = this.cam;
        const aspect = this.width / this.height;
        c.left = -this.zoom * aspect;
        c.right = this.zoom * aspect;
        c.top = this.zoom;
        c.bottom = -this.zoom;
        const D = 110;
        const f = this.focus;
        const fwd = [Math.cos(this.az), Math.sin(this.az)];
        c.position.set(f.x - fwd[0] * Math.cos(PITCH) * D, f.y - fwd[1] * Math.cos(PITCH) * D, f.z + Math.sin(PITCH) * D);
        c.lookAt(f);
        c.near = D - 70;
        c.far = D + 90;
        c.updateProjectionMatrix();
        c.updateMatrixWorld();
        this.post.material.uniforms.uRange.value = c.far - c.near;
        c.getWorldDirection(this.U.uCamFwd.value);
        this.U.uCamRight.value.set(Math.sin(this.az), -Math.cos(this.az));
        this.U.uCamUp.value.set(Math.cos(this.az), Math.sin(this.az));
        this.partMat.uniforms.uScale.value = this.dpr * this.scale * (9 / this.zoom);
        // pin the hatching to the world: where does the world origin land on the page?
        const o = new THREE.Vector3(0, 0, 0).project(c);
        this.U.uHatchOff.value.set(-(o.x * 0.5 + 0.5) * this.pw, -(o.y * 0.5 + 0.5) * this.ph);
    }

    // screen position (css px) of a world point
    project(x, y, z) {
        const v = new THREE.Vector3(x, y, z).project(this.cam);
        return [(v.x * 0.5 + 0.5) * this.width, (-v.y * 0.5 + 0.5) * this.height, v.z < 1 && v.z > -1];
    }

    // the hex under a screen point: march the view ray through the columns
    pick(sx, sy) {
        const c = this.cam;
        const nx = (sx / this.width) * 2 - 1;
        const ny = -(sy / this.height) * 2 + 1;
        const o = new THREE.Vector3(nx, ny, -1).unproject(c);
        const d = new THREE.Vector3();
        c.getWorldDirection(d);
        const w = this.world;
        const top = w.H * LAYER;
        let t = o.z > top ? (o.z - top) / -d.z : 0;
        for (let i = 0; i < 1600; i++, t += 0.08) {
            const x = o.x + d.x * t;
            const y = o.y + d.y * t;
            const z = o.z + d.z * t;
            if (z < 0) break;
            const [q, r] = hexAt(x, y);
            const k = Math.floor(z / LAYER);
            const m = w.get(q, r, k);
            if (MAT[m].solid || m === M.WATER) return { q, r, h: k + 1, x, y, z: (k + 1) * LAYER, water: m === M.WATER };
        }
        return null;
    }

    // is anything solid between the hero and the camera?
    occluded(x, y, z) {
        const d = this.U.uCamFwd.value;
        const w = this.world;
        for (let t = 0.8; t < 16; t += 0.3) {
            const px = x - d.x * t;
            const py = y - d.y * t;
            const pz = z + 1.0 - d.z * t;
            const [q, r] = hexAt(px, py);
            const k = Math.floor(pz / LAYER);
            if (k >= w.H) break;
            if (w.solid(q, r, k)) return true;
        }
        return false;
    }

    // ---------------------------------------------------------- day and night
    setDay(t) {
        this.day = ((t % 1) + 1) % 1;
        const U = this.U;
        // sun height over the day; at night a cool moon from the other side
        const s = Math.sin((this.day - 0.25) * Math.PI * 2); // 1 at noon, -1 at midnight
        const night = THREE.MathUtils.smoothstep(-s, -0.05, 0.35);
        const dusk = Math.max(0, 1 - Math.abs(s) / 0.35) * (1 - night * 0.5);
        const el = s > 0 ? 0.35 + s * 0.6 : 0.75;
        const az = s > 0 ? (200 + (this.day - 0.5) * 60) * (Math.PI / 180) : 30 * (Math.PI / 180);
        U.uSunDir.value.set(Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)).normalize();
        const day = new THREE.Color(1.0, 0.97, 0.9);
        const eve = new THREE.Color(1.08, 0.8, 0.62);
        const moon = new THREE.Color(0.46, 0.55, 0.78);
        U.uSun.value.copy(day).lerp(eve, dusk).lerp(moon, night);
        const shadeDay = new THREE.Color(0.6, 0.72, 0.8);
        const shadeEve = new THREE.Color(0.5, 0.5, 0.68);
        const shadeNight = new THREE.Color(0.2, 0.27, 0.42);
        U.uShade.value.copy(shadeDay).lerp(shadeEve, dusk).lerp(shadeNight, night);
        U.uPaper.value.setRGB(0.95, 0.925, 0.86).lerp(new THREE.Color(0.93, 0.8, 0.7), dusk * 0.5).lerp(new THREE.Color(0.12, 0.16, 0.22), night);
        U.uInkCol.value.setRGB(0.14, 0.16, 0.19).lerp(new THREE.Color(0.03, 0.05, 0.08), night);
        U.uNight.value = night;
        this.night = night;
    }

    updateLights() {
        const f = this.focus;
        const near = this.lightList.map((l) => [Math.hypot(l.x - f.x, l.y - f.y), l]).sort((a, b) => a[0] - b[0]).slice(0, MAXL);
        const L = this.U.uLights.value;
        const C = this.U.uLightCol.value;
        for (let i = 0; i < MAXL; i++) {
            const e = near[i];
            if (!e) { L[i].set(0, 0, 0, 0); continue; }
            const l = e[1];
            const flick = l.color.r > l.color.b * 1.4 ? 0.9 + 0.1 * Math.sin(this.time * 9 + i) * Math.sin(this.time * 5.3 + i * 2) : 1;
            L[i].set(l.x, l.y, l.z, l.range);
            C[i].copy(l.color).multiplyScalar(flick);
        }
    }

    // extra lights that move: the hero's lantern, spells
    setDynamicLights(list) {
        this.dynLights = list;
    }

    // ---------------------------------------------------------- frame
    update(dt, hero) {
        this.frame = (this.frame ?? 0) + 1;
        this.time += dt;
        this.U.uTime.value = this.time;
        if (hero) {
            this.focusTarget.set(hero.x, hero.y, hero.z + 0.6);
            if (this.hero === null || this.snap) { this.focus.copy(this.focusTarget); this.snap = false; this.loadAll = true; }
            this.hero = hero;
        }
        this.updateCamera(dt);
        this.ensureChunks(this.frame < 3 || this.loadAll ? 400 : 3);
        this.loadAll = false;
        // cutaway when walls stand in the way
        const want = hero && this.occluded(hero.x, hero.y, hero.z) ? 2.8 : 0;
        this.cut += (want - this.cut) * (1 - Math.exp(-dt * 6));
        if (hero) this.U.uCut.value.set(hero.x, hero.y, hero.z, this.cut < 0.05 ? 0 : this.cut);
        this.updateLights();
        if (this.dynLights) {
            const L = this.U.uLights.value;
            const C = this.U.uLightCol.value;
            this.dynLights.slice(0, 3).forEach((l, i) => { L[MAXL - 1 - i].set(l.x, l.y, l.z, l.range); C[MAXL - 1 - i].setHex(l.color); });
        }
        this.tickParticles(dt);
        if (this.moveT > 0) {
            this.moveT -= dt;
            this.moveRing.visible = this.moveT > 0;
            this.moveRing.scale.setScalar(1 + (0.8 - this.moveT) * 0.4);
            this.moveRing.material.uniforms.uOpacity.value = Math.max(0, this.moveT);
        }
        if (this.targetRing.visible) this.targetRing.rotation.z = this.time * 0.8;
    }

    renderShadows() {
        const f = this.focus;
        const sc = this.shadowCam;
        const ext = this.zoom * Math.max(1, this.width / this.height) * 1.25 + 6;
        sc.left = -ext;
        sc.right = ext;
        sc.top = ext;
        sc.bottom = -ext;
        const sd = this.U.uSunDir.value;
        // snap to texels so shadows do not crawl as the camera moves
        const texel = (2 * ext) / this.shadowSize;
        const fx = Math.round(f.x / texel) * texel;
        const fy = Math.round(f.y / texel) * texel;
        sc.position.set(fx + sd.x * 80, fy + sd.y * 80, f.z + sd.z * 80);
        sc.lookAt(fx, fy, f.z);
        sc.near = 1;
        sc.far = 200;
        sc.updateProjectionMatrix();
        sc.updateMatrixWorld();
        const m = this.U.uShadowMat.value;
        m.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
        m.multiply(sc.projectionMatrix).multiply(sc.matrixWorldInverse);
        const r = this.renderer;
        this.scene.overrideMaterial = this.shadowMat;
        r.setRenderTarget(this.shadowRT);
        r.setClearColor(0xffffff, 1);
        r.clear(true, true, false);
        r.render(this.scene, sc);
        this.scene.overrideMaterial = null;
    }

    render() {
        this.sweepActors();
        const r = this.renderer;
        this.renderShadows();
        r.setRenderTarget(this.rt);
        r.setClearColor(this.U.uPaper.value, 0);
        r.clear(true, true, false);
        r.render(this.scene, this.cam);
        r.setRenderTarget(null);
        r.setClearColor(0x000000, 1);
        r.clear(true, true, false);
        r.render(this.postScene, this.postCam);
    }
}
