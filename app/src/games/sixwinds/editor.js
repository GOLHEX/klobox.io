// Six Winds world editor. The world is a document (regions, places, hand
// edits); this page paints it on the ink atlas or right in 3D, regenerates it,
// keeps it in the browser, and hands it to the game.
//
// Map mode edits regions and places on the atlas. 3D mode shows the world as the
// game does and edits single columns under the cursor: raise, lower, level,
// repaint, plant or clear props.

import { generateWorld, SEA } from './gen.js';
import { drawInkMap } from './inkmap.js';
import { center, hexAt, disk, LAYER, SQ3 } from './hex.js';
import { M, MAT } from './world.js';
import {
    BIOMES, BIOME_IDS, ELEV, POI_KINDS, regionAt, regionCenter, regionList, getRegion, setRegion, regionKey,
    defaultDoc, randomDoc, saveDoc, loadDoc, clearDoc,
} from './worlddoc.js';
import { applyColumnEdit, BLOCKS } from './genbiome.js';
import { buildProp } from './models.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TOOLS = [
    ['pan', '✋', 'Смотреть: тянуть карту, колесо — масштаб'],
    ['select', '⌖', 'Выбрать регион или место'],
    ['biome', '❦', 'Биом региона'],
    ['elev', '⛰', 'Высота региона'],
    ['level', '⚔', 'Уровень монстров региона'],
    ['poi', '⚑', 'Поставить место'],
    ['height', '↕', 'Кисть высоты (3D)'],
    ['paint', '🖌', 'Кисть поверхности (3D)'],
    ['prop', '♣', 'Кисть объектов (3D)'],
];
const PAINT = [
    ['Трава', M.GRASS], ['Песок', M.SAND], ['Земля', M.DIRT], ['Серая плита', M.SLAB], ['Песчаник', M.SANDSTONE], ['Красный камень', M.REDROCK],
    ['Снег', M.SNOW], ['Лёд', M.ICE], ['Грязь', M.MUD], ['Мох', M.MOSS], ['Базальт', M.BASALT], ['Пепел', M.ASH], ['Лава', M.LAVA],
    ['Джунгли', M.JGRASS], ['Сухая трава', M.DRYGRASS], ['Брусчатка', M.COBBLE], ['Доски', M.WOOD], ['Камень', M.ROCK],
];
const PROPS = [
    'tree', 'palm', 'autumn_tree', 'snowpine', 'pine', 'bush', 'grass', 'flowers', 'fern', 'bigleaf', 'cactus', 'agave', 'deadtree', 'charred',
    'boulder', 'redboulder', 'basaltspire', 'crystal', 'drift', 'reeds', 'mushroom', 'lily', 'bones', 'column', 'lamppost', 'barrel', 'crates', 'tent', 'campfire', 'well',
];
const PROP_NAMES = {
    tree: 'Дерево', palm: 'Пальма', autumn_tree: 'Осеннее дерево', snowpine: 'Ель в снегу', pine: 'Ель', bush: 'Куст', grass: 'Трава', flowers: 'Цветы', fern: 'Папоротник', bigleaf: 'Лопухи',
    cactus: 'Кактус', agave: 'Агава', deadtree: 'Сухое дерево', charred: 'Горелое дерево', boulder: 'Валун', redboulder: 'Красный валун', basaltspire: 'Базальтовый столб',
    crystal: 'Кристаллы', drift: 'Сугроб', reeds: 'Камыш', mushroom: 'Грибы', lily: 'Кувшинки', bones: 'Кости', column: 'Колонна', lamppost: 'Фонарь', barrel: 'Бочка',
    crates: 'Ящики', tent: 'Палатка', campfire: 'Костёр', well: 'Колодец',
};

const CSS = `
#ed { position: fixed; inset: 0; display: grid; grid-template-columns: 60px 1fr 300px; grid-template-rows: auto 1fr; pointer-events: none; font: 13px/1.35 Nunito, system-ui, sans-serif; color: var(--ink); }
#ed > * { pointer-events: auto; }
#edTop { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 10px; background: var(--paper); border-bottom: 2px solid var(--ink); }
#edTop h1 { margin: 0 8px 0 0; font: 700 26px/1 Caveat, cursive; }
#edTop input[type=text] { font: inherit; border: 2px solid var(--ink); border-radius: 6px; padding: 3px 8px; background: var(--paper2); color: var(--ink); width: 190px; }
#edTop input[type=number] { font: inherit; border: 2px solid var(--ink); border-radius: 6px; padding: 3px 6px; background: var(--paper2); color: var(--ink); width: 70px; }
#edTop .btn { padding: 4px 10px; font-size: 13px; }
#edTop .sp { flex: 1; }
#edTools { display: flex; flex-direction: column; gap: 6px; padding: 8px; background: var(--paper); border-right: 2px solid var(--ink); overflow: auto; }
#edTools .btn { width: 42px; height: 42px; padding: 0; font-size: 19px; }
#edTools .btn.on { background: var(--ink); color: var(--paper); }
#edCenter { position: relative; overflow: hidden; }
#edMapBox { position: absolute; inset: 0; overflow: hidden; background: #e9e2d0; cursor: crosshair; touch-action: none; }
#edMapBox.hide { visibility: hidden; }
#edMapBox canvas { position: absolute; left: 0; top: 0; transform-origin: 0 0; image-rendering: auto; }
#edSide { background: var(--paper); border-left: 2px solid var(--ink); overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
#edSide h3 { margin: 0; font: 700 22px/1 Caveat, cursive; }
#edSide .pal { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
#edSide .pal .btn { padding: 4px 6px; font-size: 12px; text-align: left; display: flex; align-items: center; gap: 6px; }
#edSide .pal .btn.on { outline: 3px solid var(--teal); }
#edSide .sw { width: 14px; height: 14px; border: 1.5px solid var(--ink); border-radius: 3px; flex: none; }
#edSide label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
#edSide input[type=text], #edSide input[type=number], #edSide select, #edSide textarea { font: inherit; border: 2px solid var(--ink); border-radius: 6px; padding: 3px 6px; background: var(--paper2); color: var(--ink); }
#edSide textarea { width: 100%; height: 120px; font: 11px/1.3 ui-monospace, monospace; }
#edSide .meta { color: var(--muted); font-size: 12px; font-weight: 700; }
#edStatus { position: absolute; left: 10px; bottom: 10px; padding: 5px 10px; font-weight: 800; font-size: 12px; pointer-events: none; }
#edBusy { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(243,236,218,0.55); font: 700 34px Caveat, cursive; pointer-events: none; }
#edMode { position: absolute; right: 10px; top: 10px; display: flex; gap: 6px; }
#edMode .btn.on { background: var(--ink); color: var(--paper); }
@media (max-width: 760px) {
  #ed { grid-template-columns: 52px 1fr; grid-template-rows: auto 1fr auto; }
  #edSide { grid-column: 1 / -1; max-height: 38vh; border-left: 0; border-top: 2px solid var(--ink); }
  #edTools .btn { width: 36px; height: 36px; font-size: 16px; }
}
`;

export async function openEditor(ctx) {
    const { view } = ctx;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.id = 'ed';
    root.innerHTML = `
      <div id="edTop" class="card" style="border-radius:0">
        <h1>Редактор мира</h1>
        <input type="text" id="edName" aria-label="Название мира">
        <label class="meta">зерно <input type="number" id="edSeed" value="7" aria-label="Зерно"></label>
        <label class="meta"><input type="checkbox" id="edStory" checked> сюжетные острова</label>
        <button class="btn" id="edRandom" title="Новый случайный архипелаг из зерна">Случайный</button>
        <button class="btn" id="edDefault" title="Вернуть стандартный архипелаг">Стандартный</button>
        <span class="sp"></span>
        <button class="btn" id="edRegen" title="Перестроить мир по документу">Перестроить</button>
        <button class="btn" id="edSave" title="Сохранить в этом браузере">Сохранить</button>
        <button class="btn teal" id="edPlay" title="Сохранить и играть в этом мире">Играть</button>
        <button class="btn" id="edClose" title="Назад к игре без сохранения">✕</button>
      </div>
      <div id="edTools"></div>
      <div id="edCenter">
        <div id="edMapBox"><canvas id="edMap"></canvas><canvas id="edOver"></canvas></div>
        <div id="edMode"><button class="btn on" data-m="map">Карта</button><button class="btn" data-m="3d">3D</button></div>
        <div id="edStatus" class="card"></div>
        <div id="edBusy" hidden>Перестраиваю мир…</div>
      </div>
      <div id="edSide"></div>`;
    document.body.appendChild(root);

    const st = {
        doc: loadDoc() ?? defaultDoc(7), gen: ctx.gen, tool: 'biome', biome: 'desert', elev: 3, lvl: [10, 15], poi: 'village',
        paint: M.SLAB, prop: 'cactus', brush: 1, hmode: 'up', mode: 'map', sel: null, dirty: false, zoom: 1, panX: 0, panY: 0, over: true,
        atlas: null,
    };
    $('edName').value = st.doc.name ?? '';
    $('edSeed').value = st.doc.seed ?? 7;

    // ---------------------------------------------------------- generation
    const busy = (on) => { $('edBusy').hidden = !on; };
    const regenerate = async () => {
        busy(true);
        await new Promise((r) => setTimeout(r, 30));
        const t0 = performance.now();
        st.doc.name = $('edName').value || st.doc.name;
        st.gen = generateWorld(st.doc);
        ctx.gen = st.gen;
        view.setWorld(st.gen);
        redrawAtlas();
        st.dirty = false;
        busy(false);
        status(`Мир перестроен за ${Math.round(performance.now() - t0)} мс · островов: ${Object.keys(st.gen.islands).length} · мест: ${st.doc.pois.length}`);
    };
    let regenT = 0;
    const markDirty = () => {
        st.dirty = true;
        drawOverlay();
        clearTimeout(regenT);
        regenT = setTimeout(regenerate, 900);
    };

    // ---------------------------------------------------------- the atlas
    const mapBox = $('edMapBox');
    const base = $('edMap');
    const over = $('edOver');
    const redrawAtlas = () => {
        st.atlas = drawInkMap(base, st.gen, { scale: 4 });
        over.width = base.width;
        over.height = base.height;
        applyPan();
        drawOverlay();
    };
    const applyPan = () => {
        const t = `translate(${st.panX}px, ${st.panY}px) scale(${st.zoom})`;
        base.style.transform = t;
        over.style.transform = t;
    };
    const toWorld = (cx, cy) => {
        const r = mapBox.getBoundingClientRect();
        const px = (cx - r.left - st.panX) / st.zoom;
        const py = (cy - r.top - st.panY) / st.zoom;
        const S = st.atlas.S;
        return [px / S, st.atlas.Wy - py / S];
    };
    const R = () => st.doc.R;
    const regionPoly = (reg) => {
        const Rr = R();
        const ax = 1.5 * Rr + 1;
        const ay = (-Rr * SQ3) / 2;
        const th = Math.atan2(ay, ax);
        const circ = Math.hypot(ax, ay) / 2 / Math.cos(Math.PI / 6);
        const pts = [];
        for (let j = 0; j < 6; j++) { const a = th + Math.PI / 6 + (j * Math.PI) / 3; pts.push(st.atlas.P(reg.x + Math.cos(a) * circ, reg.y + Math.sin(a) * circ)); }
        return pts;
    };
    const drawOverlay = () => {
        if (!st.atlas) return;
        const g = over.getContext('2d');
        g.clearRect(0, 0, over.width, over.height);
        const showRegions = st.over && ['biome', 'elev', 'level', 'select'].includes(st.tool);
        if (showRegions) {
            for (const reg of regionList(st.doc)) {
                const d = getRegion(st.doc, reg.a, reg.b);
                if (d.biome === 'sea' && !d.elev) continue;
                const pts = regionPoly(reg);
                g.beginPath();
                pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
                g.closePath();
                g.fillStyle = (BIOMES[d.biome]?.map ?? '#ccc') + '99';
                g.fill();
                g.strokeStyle = 'rgba(31,29,27,0.35)';
                g.lineWidth = 1;
                g.stroke();
                const [cx, cy] = st.atlas.P(reg.x, reg.y);
                g.fillStyle = '#1f1d1b';
                g.font = '700 11px Nunito, sans-serif';
                g.textAlign = 'center';
                if (st.tool === 'elev') g.fillText(String(d.elev ?? 0), cx, cy + 4);
                if (st.tool === 'level' && d.lvl) g.fillText(`${d.lvl[0]}–${d.lvl[1]}`, cx, cy + 4);
            }
        }
        // places: red markers
        for (const p of st.doc.pois) {
            const [x, y] = st.atlas.P(p.x, p.y);
            const sel = st.sel?.poi === p;
            g.fillStyle = POI_KINDS[p.kind]?.template ? '#c8392b' : '#fff';
            g.strokeStyle = '#c8392b';
            g.lineWidth = sel ? 4 : 2;
            g.beginPath();
            g.arc(x, y, POI_KINDS[p.kind]?.template ? 8 : 6, 0, Math.PI * 2);
            g.fill();
            g.stroke();
        }
        if (st.sel?.region) {
            const pts = regionPoly(st.sel.region);
            g.beginPath();
            pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
            g.closePath();
            g.strokeStyle = '#c8392b';
            g.lineWidth = 3;
            g.stroke();
        }
    };

    // ---------------------------------------------------------- tools
    const tools = $('edTools');
    tools.innerHTML = TOOLS.map(([id, icon, tip]) => `<button class="btn ${id === st.tool ? 'on' : ''}" data-t="${id}" title="${esc(tip)}">${icon}</button>`).join('');
    tools.onclick = (e) => {
        const b = e.target.closest('[data-t]');
        if (!b) return;
        st.tool = b.dataset.t;
        for (const x of tools.children) x.classList.toggle('on', x === b);
        if (['height', 'paint', 'prop'].includes(st.tool) && st.mode !== '3d') setMode('3d');
        side();
        drawOverlay();
    };
    const setMode = (m) => {
        st.mode = m;
        mapBox.classList.toggle('hide', m === '3d');
        for (const b of $('edMode').children) b.classList.toggle('on', b.dataset.m === m);
    };
    $('edMode').onclick = (e) => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); };

    // the right-hand panel follows the tool
    const side = () => {
        const s = $('edSide');
        let h = '';
        if (st.tool === 'biome') {
            h += '<h3>Биом</h3><div class="pal">' + BIOME_IDS.map((id) => `<button class="btn ${id === st.biome ? 'on' : ''}" data-b="${id}"><span class="sw" style="background:${BIOMES[id].map}"></span>${esc(BIOMES[id].name)}</button>`).join('') + '</div>';
            h += '<div class="meta">Кликай и веди по карте: регионы получат биом. Море с биомом станет низиной.</div>';
        } else if (st.tool === 'elev') {
            h += '<h3>Высота</h3><div class="pal">' + ELEV.map((e) => `<button class="btn ${e.id === st.elev ? 'on' : ''}" data-e="${e.id}">${e.id} · ${esc(e.name)}</button>`).join('') + '</div>';
        } else if (st.tool === 'level') {
            h += `<h3>Уровни монстров</h3><label>от <input type="number" id="edL0" value="${st.lvl[0]}" min="1" max="60"></label><label>до <input type="number" id="edL1" value="${st.lvl[1]}" min="1" max="60"></label><div class="meta">Кликай по регионам острова. Числа видны на карте.</div>`;
        } else if (st.tool === 'poi') {
            h += '<h3>Место</h3><div class="pal">' + Object.entries(POI_KINDS).map(([id, k]) => `<button class="btn ${id === st.poi ? 'on' : ''}" data-p="${id}">${esc(k.name)}</button>`).join('') + '</div><div class="meta">Сюжетные шаблоны строят целый остров. Деревня и святилище приводят жителя с заданиями, лагерь и руины — монстров, причал — стоянку для шлюпа.</div>';
        } else if (st.tool === 'height') {
            h += `<h3>Кисть высоты</h3><div class="pal">${[['up', 'Поднять'], ['down', 'Опустить'], ['flat', 'Выровнять'], ['sea', 'В море']].map(([id, n]) => `<button class="btn ${id === st.hmode ? 'on' : ''}" data-h="${id}">${n}</button>`).join('')}</div>`;
        } else if (st.tool === 'paint') {
            h += '<h3>Поверхность</h3><div class="pal">' + PAINT.map(([n, m]) => `<button class="btn ${m === st.paint ? 'on' : ''}" data-m2="${m}"><span class="sw" style="background:#${MAT[m].color.toString(16).padStart(6, '0')}"></span>${esc(n)}</button>`).join('') + '</div>';
        } else if (st.tool === 'prop') {
            h += '<h3>Объекты</h3><div class="pal"><button class="btn ' + (st.prop === 'none' ? 'on' : '') + '" data-o="none">Стереть</button>' + PROPS.map((p) => `<button class="btn ${p === st.prop ? 'on' : ''}" data-o="${p}">${esc(PROP_NAMES[p] ?? p)}</button>`).join('') + '</div>';
        }
        if (['height', 'paint', 'prop'].includes(st.tool)) h += `<label>Размер кисти <input type="range" id="edBrush" min="0" max="3" value="${st.brush}"></label><div class="meta">В 3D: клик — применить, WASD — двигать взгляд, Q/E — поворот, колесо — масштаб.</div>`;
        // inspector
        if (st.sel?.region) {
            const r = st.sel.region;
            const d = getRegion(st.doc, r.a, r.b);
            h += `<h3>Регион ${r.a}, ${r.b}</h3>
              <label>Название <input type="text" id="edRName" value="${esc(d.name ?? '')}"></label>
              <label>Биом <select id="edRBiome">${BIOME_IDS.map((id) => `<option value="${id}" ${id === d.biome ? 'selected' : ''}>${esc(BIOMES[id].name)}</option>`).join('')}</select></label>
              <label>Высота <select id="edRElev">${ELEV.map((e) => `<option value="${e.id}" ${e.id === (d.elev ?? 0) ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>`;
        }
        if (st.sel?.poi) {
            const p = st.sel.poi;
            h += `<h3>${esc(POI_KINDS[p.kind]?.name ?? p.kind)}</h3>
              <label>Название <input type="text" id="edPName" value="${esc(p.name ?? '')}"></label>
              <div class="meta">x ${p.x.toFixed(1)} · y ${p.y.toFixed(1)} — тяни метку на карте, чтобы передвинуть.</div>
              <button class="btn red" id="edPDel">Удалить место</button>`;
        }
        h += `<h3>Документ</h3><div class="meta">Мир хранится как JSON: регионы, места, ручные правки. Скопируй его или вставь свой.</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" id="edCopy">Скопировать JSON</button><button class="btn" id="edShow">Показать</button><button class="btn" id="edImport">Вставить из поля</button></div>
          <textarea id="edJson" hidden spellcheck="false"></textarea>
          <label class="meta">или файл <input type="file" id="edFile" accept="application/json,.json"></label>`;
        s.innerHTML = h;
        s.onclick = (e) => {
            const t = e.target.closest('button');
            if (!t) return;
            if (t.dataset.b) { st.biome = t.dataset.b; side(); }
            if (t.dataset.e) { st.elev = +t.dataset.e; side(); }
            if (t.dataset.p) { st.poi = t.dataset.p; side(); }
            if (t.dataset.h) { st.hmode = t.dataset.h; side(); }
            if (t.dataset.m2) { st.paint = +t.dataset.m2; side(); }
            if (t.dataset.o) { st.prop = t.dataset.o; side(); }
            if (t.id === 'edPDel') { st.doc.pois = st.doc.pois.filter((p) => p !== st.sel.poi); st.sel = null; side(); markDirty(); }
            if (t.id === 'edCopy') {
                const txt = JSON.stringify(st.doc);
                navigator.clipboard?.writeText(txt).then(() => status('JSON скопирован.'), () => { $('edJson').hidden = false; $('edJson').value = txt; $('edJson').select(); status('Скопируй текст из поля.'); });
            }
            if (t.id === 'edShow') { const ta = $('edJson'); ta.hidden = !ta.hidden; ta.value = JSON.stringify(st.doc, null, 1); }
            if (t.id === 'edImport') {
                const ta = $('edJson');
                if (ta.hidden) { ta.hidden = false; ta.value = ''; status('Вставь JSON мира в поле и нажми ещё раз.'); return; }
                importText(ta.value);
            }
        };
        const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
        on('edL0', 'change', (e) => { st.lvl[0] = Math.max(1, +e.target.value); });
        on('edL1', 'change', (e) => { st.lvl[1] = Math.max(st.lvl[0], +e.target.value); });
        on('edBrush', 'input', (e) => { st.brush = +e.target.value; });
        on('edRName', 'change', (e) => { const r = st.sel.region; setRegion(st.doc, r.a, r.b, { name: e.target.value || undefined }); markDirty(); });
        on('edRBiome', 'change', (e) => { const r = st.sel.region; setRegion(st.doc, r.a, r.b, { biome: e.target.value }); markDirty(); });
        on('edRElev', 'change', (e) => { const r = st.sel.region; setRegion(st.doc, r.a, r.b, { elev: +e.target.value }); markDirty(); });
        on('edPName', 'change', (e) => { st.sel.poi.name = e.target.value; markDirty(); });
        on('edFile', 'change', (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const rd = new FileReader();
            rd.onload = () => importText(String(rd.result));
            rd.readAsText(f);
        });
    };
    const importText = (txt) => {
        try {
            const d = JSON.parse(txt);
            if (!d || !d.regions || !d.pois || !d.size) throw new Error('нет полей regions / pois / size');
            st.doc = d;
            $('edName').value = d.name ?? '';
            $('edSeed').value = d.seed ?? 7;
            st.sel = null;
            side();
            regenerate();
        } catch (err) { status(`Не получилось прочитать JSON: ${err.message}`); }
    };
    const status = (t) => { $('edStatus').textContent = t; };

    // ---------------------------------------------------------- map input
    let drag = null;
    const regionUnder = (x, y) => {
        const [q, r] = hexAt(x, y);
        const [a, b] = regionAt(R(), q, r);
        const [cq, cr] = regionCenter(R(), a, b);
        const [cx, cy] = center(cq, cr);
        return { a, b, x: cx, y: cy };
    };
    const poiUnder = (x, y) => {
        let best = null;
        for (const p of st.doc.pois) { const d = Math.hypot(p.x - x, p.y - y); if (d < 3 / Math.sqrt(st.zoom) + 1 && (!best || d < best.d)) best = { p, d }; }
        return best?.p ?? null;
    };
    const applyRegion = (x, y) => {
        const reg = regionUnder(x, y);
        const d = getRegion(st.doc, reg.a, reg.b);
        if (st.tool === 'biome') {
            const patch = { biome: st.biome };
            if (st.biome === 'sea') patch.elev = Math.min(d.elev ?? 0, 1);
            else if ((d.elev ?? 0) < 2) patch.elev = 2;
            setRegion(st.doc, reg.a, reg.b, patch);
        } else if (st.tool === 'elev') {
            setRegion(st.doc, reg.a, reg.b, { elev: st.elev, biome: st.elev >= 2 && d.biome === 'sea' ? 'meadow' : d.biome });
        } else if (st.tool === 'level') setRegion(st.doc, reg.a, reg.b, { lvl: [...st.lvl] });
        markDirty();
    };
    mapBox.addEventListener('pointerdown', (e) => {
        if (!st.atlas) return;
        mapBox.setPointerCapture(e.pointerId);
        const [x, y] = toWorld(e.clientX, e.clientY);
        if (st.tool === 'pan' || e.button === 1 || e.button === 2) { drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: st.panX, py: st.panY }; return; }
        if (st.tool === 'select' || st.tool === 'poi') {
            const p = poiUnder(x, y);
            if (p) { st.sel = { poi: p }; drag = { kind: 'poi', p }; side(); drawOverlay(); return; }
            if (st.tool === 'poi') {
                const kind = st.poi;
                const p2 = { id: `${kind}-${Math.round(x)}-${Math.round(y)}-${Date.now() % 1000}`, kind, x, y, name: POI_KINDS[kind].name };
                if (POI_KINDS[kind].template) st.doc.pois = st.doc.pois.filter((q) => q.kind !== kind);
                st.doc.pois.push(p2);
                st.sel = { poi: p2 };
                side();
                markDirty();
                return;
            }
            st.sel = { region: regionUnder(x, y) };
            side();
            drawOverlay();
            return;
        }
        if (['biome', 'elev', 'level'].includes(st.tool)) { drag = { kind: 'paint' }; applyRegion(x, y); }
    });
    mapBox.addEventListener('pointermove', (e) => {
        if (!st.atlas) return;
        const [x, y] = toWorld(e.clientX, e.clientY);
        if (!drag) { const reg = regionUnder(x, y); const d = getRegion(st.doc, reg.a, reg.b); status(`${BIOMES[d.biome]?.name ?? d.biome} · высота ${d.elev ?? 0}${d.lvl ? ` · ур. ${d.lvl[0]}–${d.lvl[1]}` : ''}${d.name ? ` · ${d.name}` : ''}`); return; }
        if (drag.kind === 'pan') { st.panX = drag.px + e.clientX - drag.sx; st.panY = drag.py + e.clientY - drag.sy; applyPan(); }
        if (drag.kind === 'paint') applyRegion(x, y);
        if (drag.kind === 'poi') { drag.p.x = x; drag.p.y = y; drag.moved = true; drawOverlay(); }
    });
    const endDrag = () => { if (drag?.kind === 'poi' && drag.moved) { side(); markDirty(); } drag = null; };
    mapBox.addEventListener('pointerup', endDrag);
    mapBox.addEventListener('pointercancel', endDrag);
    mapBox.addEventListener('contextmenu', (e) => e.preventDefault());
    mapBox.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = mapBox.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const k = e.deltaY > 0 ? 0.88 : 1.14;
        const z = Math.max(0.25, Math.min(4, st.zoom * k));
        st.panX = mx - ((mx - st.panX) * z) / st.zoom;
        st.panY = my - ((my - st.panY) * z) / st.zoom;
        st.zoom = z;
        applyPan();
    }, { passive: false });

    // ---------------------------------------------------------- 3D input: column brushes
    const cv = view.canvas;
    const brushAt = (hit) => {
        const w = st.gen.world;
        const cells = [...disk(hit.q, hit.r, st.brush)];
        const target = hit.h;
        for (const [q, r] of cells) {
            if (!w.inside(q, r)) continue;
            const k = `${q},${r}`;
            const e = { ...(st.doc.edits[k] ?? {}) };
            const s = w.surface(q, r);
            if (st.tool === 'height') {
                if (st.hmode === 'up') e.h = s + 1;
                else if (st.hmode === 'down') e.h = Math.max(1, s - 1);
                else if (st.hmode === 'flat') e.h = target;
                else e.h = SEA - 1;
                if (e.h < SEA && e.mat === undefined) e.mat = M.SAND;
                applyColumnEdit(w, q, r, { h: e.h, mat: e.mat }, SEA);
            } else if (st.tool === 'paint') {
                e.mat = st.paint;
                applyColumnEdit(w, q, r, { mat: e.mat }, SEA);
            } else if (st.tool === 'prop') {
                e.prop = st.prop;
                const old = st.gen.props.filter((p) => p.q === q && p.r === r);
                for (const p of old) if (p.block) w.unblock(p.q, p.r, p.z, p.block);
                st.gen.props = st.gen.props.filter((p) => !(p.q === q && p.r === r));
                if (st.prop !== 'none' && (st.brush === 0 || Math.random() < 0.35)) {
                    const p = { kind: st.prop, q, r, z: w.surface(q, r), seed: Math.floor(Math.random() * 1e6), block: BLOCKS[st.prop] ?? 0 };
                    st.gen.props.push(p);
                    if (p.block) w.block(q, r, p.z, p.block);
                } else if (st.prop !== 'none') { e.prop = undefined; }
                view.propsByChunk = new Map();
                for (const p of st.gen.props) view.chunkList(view.propsByChunk, p.q, p.r).push(p);
            }
            st.doc.edits[k] = e;
            // props standing on a changed column move with it
            for (const p of st.gen.props) if (p.q === q && p.r === r && st.tool === 'height') p.z = w.surface(q, r);
            view.refreshAround(q, r);
        }
        view.loadAll = true;
        st.editsDirty = true;
    };
    let brushing = false;
    const onCanvasDown = (e) => {
        if (!root.isConnected || st.mode !== '3d' || !['height', 'paint', 'prop'].includes(st.tool)) return;
        const hit = view.pick(e.clientX, e.clientY);
        if (!hit) return;
        brushing = true;
        brushAt(hit);
    };
    const onCanvasMove = (e) => {
        if (!root.isConnected || st.mode !== '3d') return;
        const hit = view.pick(e.clientX, e.clientY);
        if (hit) { view.showMove(...center(hit.q, hit.r), hit.h * LAYER); view.moveT = 0.3; status(`гекс ${hit.q}, ${hit.r} · высота ${hit.h}`); }
        if (brushing && hit && st.tool === 'paint') brushAt(hit);
    };
    cv.addEventListener('pointerdown', onCanvasDown);
    cv.addEventListener('pointermove', onCanvasMove);
    addEventListener('pointerup', () => { brushing = false; });
    const keys = new Set();
    const kd = (e) => { if (!root.isConnected || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; keys.add(e.code); if (e.code === 'KeyQ') view.rotate(-1); if (e.code === 'KeyE') view.rotate(1); };
    const ku = (e) => keys.delete(e.code);
    addEventListener('keydown', kd);
    addEventListener('keyup', ku);
    cv.addEventListener('wheel', (e) => { if (!root.isConnected) return; e.preventDefault(); view.zoomTarget = Math.max(3.5, Math.min(40, view.zoomTarget * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });

    // ---------------------------------------------------------- top bar
    $('edRandom').onclick = () => { st.doc = randomDoc(+$('edSeed').value || 1, $('edStory').checked); $('edName').value = st.doc.name; st.sel = null; side(); regenerate(); };
    $('edDefault').onclick = () => { st.doc = defaultDoc(7); $('edName').value = st.doc.name; $('edSeed').value = 7; st.sel = null; side(); regenerate(); };
    $('edRegen').onclick = () => regenerate();
    $('edSave').onclick = () => { st.doc.name = $('edName').value || st.doc.name; status(saveDoc(st.doc) ? 'Сохранено в браузере. Игра начнётся в этом мире.' : 'Браузер не дал сохранить (приватный режим?).'); };
    $('edPlay').onclick = () => { st.doc.name = $('edName').value || st.doc.name; saveDoc(st.doc); location.reload(); };
    $('edClose').onclick = () => close();
    const close = () => {
        root.remove();
        style.remove();
        removeEventListener('keydown', kd);
        removeEventListener('keyup', ku);
        cv.removeEventListener('pointerdown', onCanvasDown);
        cv.removeEventListener('pointermove', onCanvasMove);
        ctx.onEditorClose?.();
    };

    // the editor drives the camera while it is open
    ctx.editorFrame = (dt) => {
        if (!root.isConnected) return false;
        const { up, right } = view.axes();
        let mx = 0;
        let my = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) my += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) my -= 1;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
        const sp = view.zoom * 1.4 * dt;
        st.focus = st.focus ?? { x: st.gen.islands.wharf?.x ?? 60, y: st.gen.islands.wharf?.y ?? 60, z: 6 };
        st.focus.x += (right[0] * mx + up[0] * my) * sp;
        st.focus.y += (right[1] * mx + up[1] * my) * sp;
        const [q, r] = hexAt(st.focus.x, st.focus.y);
        st.focus.z += ((Math.max(SEA, st.gen.world.surface(q, r)) * LAYER) - st.focus.z) * Math.min(1, dt * 4);
        return st.focus;
    };
    // clicking the atlas in map mode also points the 3D camera there
    mapBox.addEventListener('dblclick', (e) => { const [x, y] = toWorld(e.clientX, e.clientY); st.focus = { x, y, z: 6 }; setMode('3d'); });

    side();
    if (!ctx.gen || ctx.gen.doc !== st.doc) await regenerate();
    else redrawAtlas();
    // fit the atlas in the box
    const r = mapBox.getBoundingClientRect();
    st.zoom = Math.min(r.width / base.width, r.height / base.height);
    st.panX = (r.width - base.width * st.zoom) / 2;
    st.panY = (r.height - base.height * st.zoom) / 2;
    applyPan();
    status('Двойной клик по карте — посмотреть это место в 3D.');
    void regionKey;
    void buildProp;
}
