// Strata texture atlas: every block face is a small hand-drawn tile, painted
// with Canvas2D at startup. Tiles are 64 px and wrap seamlessly; each sits in an
// 80 px cell with an 8 px border copied from its opposite edge, so filtering and
// mipmaps do not bleed one tile into the next.

const T = 64;
const CELL = 80;
const PAD = 8;
const COLS = 8;

function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const INK = 'rgba(28,24,40,';

// draw fn at the nine wrap offsets so shapes crossing an edge come back on the other side
function wrap(ctx, fn) {
    for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) {
        ctx.save();
        ctx.translate(dx, dy);
        fn();
        ctx.restore();
    }
}

function speckle(ctx, r, colors, n, size = [1, 2]) {
    for (let i = 0; i < n; i++) {
        ctx.fillStyle = colors[Math.floor(r() * colors.length)];
        const s = size[0] + r() * (size[1] - size[0]);
        ctx.fillRect(Math.floor(r() * T), Math.floor(r() * T), s, s);
    }
}

function line(ctx, pts, w = 1.4, a = 0.75, r = null) {
    ctx.strokeStyle = `${INK}${a})`;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
        const jx = r ? (r() - 0.5) * 0.8 : 0;
        const jy = r ? (r() - 0.5) * 0.8 : 0;
        if (i) ctx.lineTo(x + jx, y + jy);
        else ctx.moveTo(x + jx, y + jy);
    });
    ctx.stroke();
}

function fill(ctx, c) {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, T, T);
}

function blob(ctx, x, y, rx, ry, color, stroke = 0.6, r = null) {
    ctx.beginPath();
    const n = 9;
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const k = r ? 0.85 + r() * 0.3 : 1;
        const px = x + Math.cos(a) * rx * k;
        const py = y + Math.sin(a) * ry * k;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = `${INK}${stroke})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }
}

// ---- running-bond bricks or blocks
function bricks(ctx, r, { base, mortar, rows = 4, cols = 2, shade = [], ink = 0.7, offset = 0.5, mossy = 0 }) {
    fill(ctx, mortar);
    const bh = T / rows;
    for (let row = 0; row < rows; row++) {
        const bw = T / cols;
        const off = row % 2 ? bw * offset : 0;
        for (let c = -1; c <= cols; c++) {
            const x = c * bw + off;
            const col = shade.length ? shade[Math.floor(r() * shade.length)] : base;
            wrap(ctx, () => {
                ctx.fillStyle = col;
                ctx.fillRect(x + 1.2, row * bh + 1.2, bw - 2.4, bh - 2.4);
            });
        }
    }
    speckle(ctx, r, ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.08)'], 140);
    for (let row = 0; row <= rows; row++) line(ctx, [[0, row * bh], [T, row * bh]], 1.2, ink * 0.8);
    for (let row = 0; row < rows; row++) {
        const bw = T / cols;
        const off = row % 2 ? bw * offset : 0;
        for (let c = 0; c <= cols; c++) {
            const x = (c * bw + off) % T;
            line(ctx, [[x, row * bh], [x, (row + 1) * bh]], 1.2, ink * 0.8);
        }
    }
    // chips and cracks
    for (let i = 0; i < 3; i++) {
        const x = r() * T;
        const y = r() * T;
        line(ctx, [[x, y], [x + 3 + r() * 4, y + 2 + r() * 3], [x + 5 + r() * 4, y + 5]], 0.9, 0.45, r);
    }
    if (mossy) for (let i = 0; i < mossy; i++) wrap(ctx, () => blob(ctx, r() * T, r() * T, 4 + r() * 6, 3 + r() * 4, ['#6f9a45', '#80ad4e', '#5f8a3d'][i % 3], 0.35, r));
}

function planks(ctx, r, { base, shades, dir = 'h', boards = 4, nails = true }) {
    fill(ctx, base);
    const bw = T / boards;
    for (let i = 0; i < boards; i++) {
        ctx.fillStyle = shades[i % shades.length];
        if (dir === 'h') ctx.fillRect(0, i * bw, T, bw);
        else ctx.fillRect(i * bw, 0, bw, T);
        // grain
        for (let g = 0; g < 5; g++) {
            const o = i * bw + 2 + r() * (bw - 4);
            const pts = [];
            for (let s = 0; s <= 8; s++) pts.push(dir === 'h' ? [s * 8, o + Math.sin(s * 1.3 + g) * 0.8] : [o + Math.sin(s * 1.3 + g) * 0.8, s * 8]);
            line(ctx, pts, 0.7, 0.18);
        }
        // a knot and the board ends
        const k = r() * T;
        if (dir === 'h') {
            wrap(ctx, () => blob(ctx, k, i * bw + bw / 2, 2, 1.3, 'rgba(90,50,20,0.4)', 0.3));
            const end = r() * T;
            line(ctx, [[end, i * bw], [end, (i + 1) * bw]], 1.1, 0.6);
            if (nails) {
                ctx.fillStyle = 'rgba(40,30,30,0.6)';
                ctx.fillRect(end - 3, i * bw + 3, 1.5, 1.5);
                ctx.fillRect(end + 2, i * bw + bw - 4, 1.5, 1.5);
            }
        } else {
            wrap(ctx, () => blob(ctx, i * bw + bw / 2, k, 1.3, 2, 'rgba(90,50,20,0.4)', 0.3));
        }
        if (dir === 'h') line(ctx, [[0, i * bw], [T, i * bw]], 1.3, 0.75);
        else line(ctx, [[i * bw, 0], [i * bw, T]], 1.3, 0.75);
    }
}

function stones(ctx, r, { base, gap, shades, n = 9 }) {
    fill(ctx, gap);
    // jittered grid of rounded stones
    const g = Math.round(Math.sqrt(n));
    const s = T / g;
    for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) {
        const x = i * s + s / 2 + (r() - 0.5) * s * 0.3;
        const y = j * s + s / 2 + (r() - 0.5) * s * 0.3;
        const c = shades[Math.floor(r() * shades.length)];
        const rx = s * (0.42 + r() * 0.08);
        const ry = s * (0.4 + r() * 0.08);
        wrap(ctx, () => {
            blob(ctx, x, y, rx, ry, c, 0.8, r);
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.beginPath();
            ctx.ellipse(x - rx * 0.25, y - ry * 0.3, rx * 0.35, ry * 0.2, -0.4, 0, Math.PI * 2);
            ctx.fill();
        });
    }
    speckle(ctx, r, ['rgba(0,0,0,0.12)'], 40);
    void base;
}

function strata(ctx, r, { bands, cracks = 4, ink = 0.5 }) {
    let y = 0;
    let i = 0;
    while (y < T) {
        const h = 6 + Math.floor(r() * 10);
        ctx.fillStyle = bands[i++ % bands.length];
        ctx.fillRect(0, y, T, h);
        y += h;
    }
    // wavy strata lines that wrap horizontally
    for (let k = 0; k < 4; k++) {
        const y0 = (k + r() * 0.6) * (T / 4);
        const pts = [];
        const ph = r() * 6;
        for (let s = 0; s <= 16; s++) pts.push([s * 4, y0 + Math.sin((s / 16) * Math.PI * 2 + ph) * 1.8]);
        line(ctx, pts, 1.1, ink);
    }
    speckle(ctx, r, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.12)'], 180);
    for (let c = 0; c < cracks; c++) {
        const x = r() * T;
        const y0 = r() * T;
        line(ctx, [[x, y0], [x + (r() - 0.5) * 6, y0 + 5], [x + (r() - 0.5) * 8, y0 + 10], [x + (r() - 0.5) * 6, y0 + 14]], 1, 0.55, r);
    }
}

function slabs(ctx, r, { base, shades, n = 2 }) {
    fill(ctx, base);
    const s = T / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        ctx.fillStyle = shades[Math.floor(r() * shades.length)];
        ctx.fillRect(i * s + 1, j * s + 1, s - 2, s - 2);
    }
    speckle(ctx, r, ['rgba(255,255,255,0.1)', 'rgba(0,0,0,0.1)'], 120);
    for (let i = 0; i <= n; i++) {
        line(ctx, [[0, i * s], [T, i * s]], 1.3, 0.7);
        line(ctx, [[i * s, 0], [i * s, T]], 1.3, 0.7);
    }
    for (let c = 0; c < 2; c++) {
        const x = r() * T;
        const y = r() * T;
        line(ctx, [[x, y], [x + 5, y + 3], [x + 7, y + 8]], 0.9, 0.4, r);
    }
}

// ---- the tiles
const TILES = {
    white(ctx) { fill(ctx, '#ffffff'); },
    cut(ctx) {
        fill(ctx, '#2a2436');
        ctx.strokeStyle = 'rgba(160,150,190,0.35)';
        ctx.lineWidth = 1.5;
        for (let i = -T; i < T * 2; i += 6) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + T, T); ctx.stroke(); }
    },
    grass(ctx, r) {
        fill(ctx, '#8cc152');
        speckle(ctx, r, ['#7fb247', '#9bd05e', '#a9d86a', '#76a940'], 260, [1, 3]);
        for (let i = 0; i < 26; i++) {
            const x = r() * T;
            const y = r() * T;
            wrap(ctx, () => line(ctx, [[x, y + 3], [x + (r() - 0.5) * 2, y]], 1, 0.4));
        }
        for (let i = 0; i < 5; i++) {
            const x = r() * T;
            const y = r() * T;
            const c = ['#fff4c4', '#f7a8b8', '#ffffff', '#f9d65c'][i % 4];
            wrap(ctx, () => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill(); });
        }
    },
    grassSide(ctx, r) {
        TILES.dirt(ctx, r);
        ctx.fillStyle = '#8cc152';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(T, 0);
        for (let x = T; x >= 0; x -= 4) ctx.lineTo(x, 10 + Math.sin(x * 0.7) * 2 + (x % 16 === 0 ? 5 : 0));
        ctx.closePath();
        ctx.fill();
        const pts = [];
        for (let x = 0; x <= T; x += 4) pts.push([x, 10 + Math.sin(x * 0.7) * 2 + (x % 16 === 0 ? 5 : 0)]);
        line(ctx, pts, 1.3, 0.7);
    },
    dirt(ctx, r) {
        fill(ctx, '#a8744a');
        speckle(ctx, r, ['#96653e', '#b88256', '#8a5a36', '#c69468'], 300, [1, 3]);
        for (let i = 0; i < 6; i++) { const x = r() * T; const y = r() * T; wrap(ctx, () => blob(ctx, x, y, 2 + r() * 2, 1.5 + r(), '#c9b29a', 0.5, r)); }
    },
    rock(ctx, r) { strata(ctx, r, { bands: ['#8e8aa0', '#9793a8', '#86829a', '#a09cb0'] }); },
    rockTop(ctx, r) {
        fill(ctx, '#9a96ab');
        speckle(ctx, r, ['#8e8aa0', '#a8a4b8', '#85819a'], 260, [1, 3]);
        for (let i = 0; i < 5; i++) {
            const x = r() * T;
            const y = r() * T;
            wrap(ctx, () => line(ctx, [[x, y], [x + 6, y + 2], [x + 9, y + 7], [x + 8, y + 12]], 1, 0.5));
        }
    },
    rockMoss(ctx, r) {
        TILES.rock(ctx, r);
        for (let x = -4; x < T; x += 6) {
            const h = 4 + r() * 10;
            blob(ctx, x + 3, 0, 4, h, '#5f9a5a', 0.5, r);
        }
    },
    cobble(ctx, r) { stones(ctx, r, { gap: '#6c6577', shades: ['#b9b2a4', '#aea696', '#c4bdb0', '#a39b8c'], n: 16 }); },
    brick(ctx, r) { bricks(ctx, r, { base: '#c9bfae', mortar: '#8f8577', shade: ['#c9bfae', '#bfb4a2', '#d2c9b9', '#b8ad9b'] }); },
    brickTop(ctx, r) { slabs(ctx, r, { base: '#8f8577', shades: ['#c9bfae', '#bfb4a2', '#d2c9b9'] }); },
    mossBrick(ctx, r) { bricks(ctx, r, { base: '#a9ab94', mortar: '#707561', shade: ['#a9ab94', '#9fa38a', '#b3b59f'], mossy: 5 }); },
    mossTop(ctx, r) { slabs(ctx, r, { base: '#707561', shades: ['#a9ab94', '#9fa38a'] }); for (let i = 0; i < 4; i++) { const x = r() * T; const y = r() * T; wrap(ctx, () => blob(ctx, x, y, 6, 5, '#7aa84c', 0.35, r)); } },
    plank(ctx, r) { planks(ctx, r, { base: '#c8955a', shades: ['#c8955a', '#bd8a50', '#d29f64', '#b98449'] }); },
    plankSide(ctx, r) { planks(ctx, r, { base: '#b98449', shades: ['#b98449', '#ad7a42', '#c28d51'], boards: 2 }); },
    timber(ctx, r) {
        fill(ctx, '#efe2c4');
        speckle(ctx, r, ['#e5d6b6', '#f5ead2', '#dccba8'], 200, [1, 2]);
        ctx.fillStyle = '#7b5236';
        ctx.fillRect(0, 0, T, 7);
        ctx.fillRect(0, T - 7, T, 7);
        ctx.fillRect(0, 0, 7, T);
        ctx.save();
        ctx.beginPath();
        ctx.rect(7, 7, T - 7, T - 14);
        ctx.clip();
        ctx.strokeStyle = '#7b5236';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(7, 7);
        ctx.lineTo(T, T - 7);
        ctx.stroke();
        ctx.restore();
        line(ctx, [[0, 7], [T, 7]], 1.2, 0.7);
        line(ctx, [[0, T - 7], [T, T - 7]], 1.2, 0.7);
        line(ctx, [[7, 7], [7, T - 7]], 1.2, 0.7);
    },
    tile(ctx, r) {
        const s = T / 4;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
            ctx.fillStyle = (i + j) % 2 ? '#d9cbb0' : '#b86a4c';
            ctx.fillRect(i * s, j * s, s, s);
        }
        speckle(ctx, r, ['rgba(255,255,255,0.12)', 'rgba(0,0,0,0.1)'], 140);
        for (let i = 0; i <= 4; i++) { line(ctx, [[0, i * s], [T, i * s]], 1, 0.55); line(ctx, [[i * s, 0], [i * s, T]], 1, 0.55); }
    },
    crypt(ctx, r) {
        bricks(ctx, r, { base: '#5d5a70', mortar: '#34313f', shade: ['#5d5a70', '#56536a', '#646178', '#4f4c61'], rows: 2, cols: 1, ink: 0.9 });
        // a carved glyph
        const x = 14 + r() * 36;
        line(ctx, [[x, 10], [x, 22], [x + 6, 16], [x + 12, 22], [x + 12, 10]], 1.2, 0.5);
    },
    cryptTop(ctx, r) { slabs(ctx, r, { base: '#34313f', shades: ['#5d5a70', '#56536a'] }); },
    metal(ctx, r) {
        fill(ctx, '#8a8f98');
        speckle(ctx, r, ['#7f848d', '#969ba4', '#a0664a'], 200, [1, 2]);
        const s = T / 2;
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillRect(i * s + 2, j * s + 2, s - 4, 6);
            for (const [a, b] of [[4, 4], [s - 5, 4], [4, s - 5], [s - 5, s - 5]]) {
                ctx.fillStyle = '#5a5e66';
                ctx.beginPath();
                ctx.arc(i * s + a, j * s + b, 1.7, 0, 7);
                ctx.fill();
            }
        }
        for (let i = 0; i <= 2; i++) { line(ctx, [[0, i * s], [T, i * s]], 1.3, 0.75); line(ctx, [[i * s, 0], [i * s, T]], 1.3, 0.75); }
        for (let i = 0; i < 3; i++) { const x = r() * T; const y = r() * T; wrap(ctx, () => blob(ctx, x, y, 4, 2, 'rgba(160,90,50,0.35)', 0)); }
    },
    metalSide(ctx, r) { TILES.metal(ctx, r); },
    sand(ctx, r) {
        fill(ctx, '#e3cf9a');
        speckle(ctx, r, ['#d6c08a', '#eddcab', '#c9b27c', '#f2e4bd'], 400, [1, 2]);
        for (let k = 0; k < 3; k++) { const y0 = r() * T; const pts = []; for (let s = 0; s <= 16; s++) pts.push([s * 4, y0 + Math.sin(s * 0.8) * 1.5]); line(ctx, pts, 0.8, 0.2); }
    },
    moss(ctx, r) {
        fill(ctx, '#5f9a5a');
        for (let i = 0; i < 26; i++) { const x = r() * T; const y = r() * T; wrap(ctx, () => blob(ctx, x, y, 3 + r() * 4, 2.5 + r() * 3, ['#6aa864', '#579153', '#74b36b', '#4f8a4b'][i % 4], 0.25, r)); }
        speckle(ctx, r, ['#9ad08a', '#3f7a3f'], 90);
    },
    crystal(ctx, r) {
        fill(ctx, '#63c9e3');
        for (let i = 0; i < 7; i++) {
            const x = r() * T;
            const y = r() * T;
            const s = 6 + r() * 10;
            wrap(ctx, () => {
                ctx.beginPath();
                ctx.moveTo(x, y - s);
                ctx.lineTo(x + s * 0.6, y);
                ctx.lineTo(x, y + s);
                ctx.lineTo(x - s * 0.6, y);
                ctx.closePath();
                ctx.fillStyle = ['#8ff0ff', '#6fd8f0', '#b8f7ff', '#57b7d8'][i % 4];
                ctx.fill();
                ctx.strokeStyle = `${INK}0.45)`;
                ctx.lineWidth = 1;
                ctx.stroke();
                line(ctx, [[x, y - s], [x, y + s]], 0.6, 0.25);
            });
        }
        speckle(ctx, r, ['#ffffff'], 30);
    },
    ore(ctx, r) {
        TILES.rock(ctx, r);
        for (let i = 0; i < 6; i++) {
            const x = r() * T;
            const y = r() * T;
            const c = ['#f2c14e', '#e2554a', '#7fe8ff', '#b07cff'][i % 4];
            wrap(ctx, () => blob(ctx, x, y, 2.5, 2, c, 0.6, r));
        }
    },
    books(ctx, r) {
        fill(ctx, '#6b4a30');
        for (let row = 0; row < 2; row++) {
            let x = 2;
            const y0 = row * 32 + 4;
            while (x < T - 3) {
                const w = 3 + Math.floor(r() * 4);
                const h = 22 + Math.floor(r() * 5);
                ctx.fillStyle = ['#8a3b3b', '#3b5a8a', '#4f7a3b', '#b58a3a', '#6a3b7a', '#2f5f5f', '#a0522d'][Math.floor(r() * 7)];
                ctx.fillRect(x, y0 + 26 - h, w, h);
                ctx.fillStyle = 'rgba(255,230,160,0.5)';
                ctx.fillRect(x, y0 + 26 - h + 4, w, 1.5);
                line(ctx, [[x, y0 + 26 - h], [x, y0 + 26]], 0.7, 0.5);
                x += w + (r() < 0.1 ? 3 : 0);
            }
            ctx.fillStyle = '#4a321f';
            ctx.fillRect(0, row * 32 + 30, T, 4);
            line(ctx, [[0, row * 32 + 30], [T, row * 32 + 30]], 1.2, 0.7);
        }
    },
    bark(ctx, r) {
        fill(ctx, '#7a5a3e');
        for (let i = 0; i < 12; i++) {
            const x = r() * T;
            const pts = [];
            for (let y = 0; y <= T; y += 8) pts.push([x + Math.sin(y * 0.15 + i) * 2, y]);
            ctx.save();
            wrap(ctx, () => line(ctx, pts, 1.3, 0.55));
            ctx.restore();
        }
        speckle(ctx, r, ['#8a6a4a', '#644830'], 150, [1, 3]);
    },
    barkTop(ctx, r) {
        fill(ctx, '#b8915f');
        for (let k = 1; k < 5; k++) { ctx.strokeStyle = `${INK}0.35)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(32 + r(), 32 + r(), k * 7, 0, 7); ctx.stroke(); }
        speckle(ctx, r, ['#a07a4a'], 60);
    },
    water(ctx) { fill(ctx, '#7fc9c4'); },
    lava(ctx, r) {
        fill(ctx, '#ff8a2a');
        for (let i = 0; i < 10; i++) { const x = r() * T; const y = r() * T; wrap(ctx, () => blob(ctx, x, y, 5 + r() * 6, 3 + r() * 4, ['#ffc24a', '#e2551e', '#7a2a1a'][i % 3], 0.3, r)); }
    },
    wallpaper(ctx, r) {
        fill(ctx, '#b86060');
        for (let x = 0; x < T; x += 16) { ctx.fillStyle = '#c87070'; ctx.fillRect(x, 0, 8, T); }
        for (let i = 0; i < 6; i++) {
            const x = 4 + (i % 3) * 21 + 4;
            const y = 8 + Math.floor(i / 3) * 22;
            ctx.fillStyle = '#f2dcc0';
            for (let p = 0; p < 4; p++) { ctx.beginPath(); ctx.arc(x + Math.cos(p * 1.57) * 2.5, y + Math.sin(p * 1.57) * 2.5, 2, 0, 7); ctx.fill(); }
        }
        // wainscot
        ctx.fillStyle = '#7b5236';
        ctx.fillRect(0, 46, T, 18);
        line(ctx, [[0, 46], [T, 46]], 1.5, 0.8);
        for (let x = 0; x < T; x += 16) line(ctx, [[x, 46], [x, T]], 1, 0.5);
        speckle(ctx, r, ['rgba(0,0,0,0.08)'], 60);
    },
    thatch(ctx, r) {
        fill(ctx, '#d9b25a');
        for (let i = 0; i < 70; i++) { const x = r() * T; const y = r() * T; wrap(ctx, () => line(ctx, [[x, y], [x + 1, y + 8]], 1, 0.3)); }
    },
    roof(ctx, r) {
        fill(ctx, '#b84a3a');
        for (let row = 0; row < 4; row++) for (let c = -1; c < 5; c++) {
            const x = c * 16 + (row % 2) * 8;
            const y = row * 16;
            ctx.fillStyle = ['#c85a45', '#b84a3a', '#d06a50'][Math.floor(r() * 3)];
            ctx.beginPath();
            ctx.arc(x + 8, y + 4, 8, 0, Math.PI);
            ctx.fill();
            ctx.strokeStyle = `${INK}0.6)`;
            ctx.lineWidth = 1.1;
            ctx.stroke();
        }
    },
    basalt(ctx, r) {
        fill(ctx, '#3e3a45');
        for (let x = 0; x < T; x += 11) {
            ctx.fillStyle = ['#46424e', '#3a3641', '#4d4856'][Math.floor(r() * 3)];
            ctx.fillRect(x + 1, 0, 9, T);
            line(ctx, [[x, 0], [x, T]], 1.3, 0.8);
        }
        speckle(ctx, r, ['#5a5566', '#2e2b34', 'rgba(255,120,60,0.35)'], 90);
    },
    basaltTop(ctx) {
        // hexagons: the grid the whole project started from
        fill(ctx, '#2e2b34');
        const s = 8;
        const hx = s * Math.sqrt(3);
        for (let row = -1; row < 6; row++) for (let c = -1; c < 5; c++) {
            const cx = c * hx + (row % 2 ? hx / 2 : 0);
            const cy = row * s * 1.5;
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
                const a = Math.PI / 6 + (k * Math.PI) / 3;
                const px = cx + Math.cos(a) * (s - 0.8);
                const py = cy + Math.sin(a) * (s - 0.8);
                if (k) ctx.lineTo(px, py);
                else ctx.moveTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = ['#4a4553', '#433f4c', '#524c5c'][(row * 3 + c + 9) % 3];
            ctx.fill();
            ctx.strokeStyle = `${INK}0.8)`;
            ctx.lineWidth = 1.1;
            ctx.stroke();
        }
    },
    cap(ctx, r) {
        fill(ctx, '#8a5ac8');
        speckle(ctx, r, ['#9a6ad8', '#7a4ab8'], 160, [1, 3]);
        for (let i = 0; i < 6; i++) { const x = r() * T; const y = r() * T; wrap(ctx, () => blob(ctx, x, y, 3 + r() * 3, 3 + r() * 2, '#f1e6ff', 0.5, r)); }
    },
    capSide(ctx, r) { TILES.cap(ctx, r); },
    gills(ctx) {
        fill(ctx, '#e8d6c8');
        for (let x = 0; x < T; x += 4) line(ctx, [[x, 0], [x, T]], 0.8, 0.35);
    },
    marble(ctx, r) {
        slabs(ctx, r, { base: '#9a96a6', shades: ['#ecebf0', '#e2e0e8', '#f3f2f6'], n: 2 });
        for (let i = 0; i < 4; i++) {
            const x = r() * T;
            const y = r() * T;
            const pts = [];
            for (let s = 0; s < 6; s++) pts.push([x + s * 5, y + Math.sin(s + i) * 4]);
            wrap(ctx, () => line(ctx, pts, 0.8, 0.22));
        }
    },
    marbleSide(ctx, r) { bricks(ctx, r, { base: '#e8e6ee', mortar: '#9a96a6', shade: ['#ecebf0', '#e2e0e8', '#f3f2f6'], rows: 2, cols: 1 }); },
    clay(ctx, r) { fill(ctx, '#c8704c'); speckle(ctx, r, ['#b8603c', '#d8805c'], 200, [1, 3]); },
    leaves(ctx, r) {
        fill(ctx, '#4f8a3b');
        for (let i = 0; i < 40; i++) { const x = r() * T; const y = r() * T; wrap(ctx, () => blob(ctx, x, y, 3 + r() * 3, 2 + r() * 2, ['#6aa84a', '#5a983f', '#7ab85a', '#3f7a30'][i % 4], 0.3, r)); }
    },
    snow(ctx, r) { fill(ctx, '#f2f6fb'); speckle(ctx, r, ['#dfe8f2', '#ffffff'], 200, [1, 3]); },
    snowSide(ctx, r) {
        TILES.dirt(ctx, r);
        ctx.fillStyle = '#f2f6fb';
        ctx.fillRect(0, 0, T, 9);
        const pts = [];
        for (let x = 0; x <= T; x += 4) pts.push([x, 9 + Math.sin(x) * 1.5]);
        line(ctx, pts, 1.2, 0.6);
    },
};

export const TILE_NAMES = Object.keys(TILES);

// Paint the atlas. Returns the canvas and uv rectangles [u0, v0, u1, v1] per tile
// (v measured from the bottom, as WebGL textures are).
export function makeAtlas(seed = 7) {
    const rows = Math.ceil(TILE_NAMES.length / COLS);
    const canvas = document.createElement('canvas');
    canvas.width = COLS * CELL;
    canvas.height = rows * CELL;
    const ctx = canvas.getContext('2d');
    const tile = document.createElement('canvas');
    tile.width = T;
    tile.height = T;
    const tctx = tile.getContext('2d');
    const uv = {};
    TILE_NAMES.forEach((name, i) => {
        tctx.clearRect(0, 0, T, T);
        tctx.save();
        TILES[name](tctx, rng(seed * 131 + i * 977));
        tctx.restore();
        const cx = (i % COLS) * CELL;
        const cy = Math.floor(i / COLS) * CELL;
        // the tile three by three, clipped to the cell: seamless borders
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx, cy, CELL, CELL);
        ctx.clip();
        for (const dx of [-T, 0, T]) for (const dy of [-T, 0, T]) ctx.drawImage(tile, cx + PAD + dx, cy + PAD + dy);
        ctx.restore();
        uv[name] = [(cx + PAD) / canvas.width, 1 - (cy + PAD + T) / canvas.height, (cx + PAD + T) / canvas.width, 1 - (cy + PAD) / canvas.height];
    });
    return { canvas, uv };
}
