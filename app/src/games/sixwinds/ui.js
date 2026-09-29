// Six Winds interface: the HUD and the paper windows (character, bag, skills,
// quests, professions, map, shops, crafting, dialogue, class choice).

import { CLASSES, SKILLS, ITEMS, RARITY, PROFS, NPCS, SHOPS, QUESTS, RECIPES, STATIONS, ISLANDS, MONSTERS, STATS, XP_TO } from './data.js';
import { INV_SIZE } from './sim.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

export const SKILL_ICON = {
    slash: '⚔', whirl: '✺', cry: '!', arrow: '➶', rain: '☂', leap: '↶', water: '≈', wave: '≋', wind: '➹', whirlpool: '@',
    heal: '✚', thorns: '❦', swarm: '✧', slam: '✹', shield: '◈', seal: '⊗', curse: '☠', storm: 'ϟ', fog: '☁',
};
const SKILL_KIND = { melee: 'ближний удар', ranged: 'выстрел', magic: 'заклинание', aoe: 'вокруг себя', area: 'по площади', self: 'усиление', heal: 'лечение', dash: 'рывок', back: 'отскок' };

export function itemIcon(id) {
    const d = ITEMS[id];
    if (!d) return { g: '?', c: '#888' };
    if (d.slot === 'weapon') return { g: { blade: '⚔', greatblade: '⚔', dual: '⚔', bow: '➶', staff: '✦', censer: '✺' }[d.type] ?? '⚔', c: d.rare ? '#8a5ac8' : '#6a7078' };
    if (d.slot === 'armor') return { g: '▣', c: d.rare ? '#8a5ac8' : '#8a6446' };
    if (d.slot === 'ring') return { g: '○', c: '#c9a03a' };
    if (d.heal) return { g: '♥', c: '#c9483e' };
    if (d.mana) return { g: '♦', c: '#3f95b8' };
    if (d.food) return { g: '♨', c: '#d8803a' };
    if (d.hull) return { g: '⚒', c: '#8a6446' };
    if (d.slot === 'quest') return { g: '✉', c: '#b08a3a' };
    if (d.fish) return { g: d.name[0], c: '#3f8fa0' };
    return { g: d.name[0], c: { log: '#8a6446', ore: '#b8703a', iron_ore: '#7a8088', herb: '#6f9a4a', alga: '#2f7f7a', pearl: '#b8c0d0', gear: '#7a9a98', scrap: '#6a5a4a' }[id] ?? '#9a8a6a' };
}
const iconHtml = (id, cls = 'icon') => { const i = itemIcon(id); return `<div class="${cls}" style="background:${i.c}">${i.g}</div>`; };

function itemMeta(g, id, up = 0) {
    const d = ITEMS[id];
    const parts = [];
    if (d.slot === 'weapon') parts.push(`атака ${Math.round(d.atk * (1 + up * 0.08))}${d.matk ? `, магия ${Math.round(d.matk * (1 + up * 0.08))}` : ''}${d.range ? `, дальность ${d.range}` : ''}`);
    if (d.slot === 'armor') parts.push(`защита ${Math.round(d.def * (1 + up * 0.08))}`);
    if (d.bonus) parts.push(Object.entries(d.bonus).map(([k, v]) => `${STATS[k]} +${v}`).join(', '));
    if (d.heal) parts.push(`лечит ${d.heal}`);
    if (d.mana) parts.push(`дух +${d.mana}`);
    if (d.food) parts.push(`${d.food.atk ? `атака +${Math.round(d.food.atk * 100)}%` : `восстановление +${Math.round(d.food.regen * 100)}%/с`} на ${d.food.dur} с`);
    if (d.hull) parts.push(`чинит шлюп на ${d.hull}`);
    if (d.lvl) parts.push(`ур. ${d.lvl}`);
    if (d.slot === 'weapon') {
        const who = Object.values(CLASSES).filter((c) => c.weapons.includes(d.type)).map((c) => c.name);
        parts.push(who.join(', '));
    }
    if (d.slot === 'mat') parts.push('материал');
    if (d.slot === 'quest') parts.push('для задания');
    return parts.join(' · ');
}

export class UI {
    constructor(ctx) {
        this.ctx = ctx;
        this.open = null;
        this.blocking = false;
        this.sel = null;
        this.isDirty = true;
        $('veil').onclick = () => this.close();
        for (const b of document.querySelectorAll('#menu .btn')) b.onclick = () => this.toggle(b.dataset.w);
        $('points').onclick = () => this.openWin('char');
        this.buildBar();
    }

    get g() { return this.ctx.game; }

    dirty() { this.isDirty = true; if (this.open && !['dialog', 'map'].includes(this.open)) this.render(); }

    refreshAll() { this.buildBar(); this.dirty(); }

    log(text, kind = 'info') {
        const el = document.createElement('div');
        el.className = kind;
        el.textContent = text;
        const box = $('log');
        box.appendChild(el);
        while (box.children.length > 7) box.firstChild.remove();
        setTimeout(() => el.remove(), 9000);
    }

    toast(title, sub = '') {
        const t = $('toast');
        t.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
        t.classList.add('on');
        clearTimeout(this.toastT);
        this.toastT = setTimeout(() => t.classList.remove('on'), 3200);
    }

    cast(e) {
        const el = $('cast');
        if (e.state === 'start') { el.hidden = false; el.firstElementChild.textContent = e.label; this.castTotal = e.total; }
        else if (e.state === 'fish') { el.hidden = false; el.firstElementChild.textContent = 'Ждём поклёвку…'; this.castTotal = 0; }
        else { el.hidden = true; this.bite(false); }
    }

    bite(on) { $('bite').hidden = !on; }

    // ---------------------------------------------------------- skill bar
    buildBar() {
        const box = $('skills');
        box.innerHTML = '';
        this.slots = [];
        for (let i = 0; i < 8; i++) {
            const s = document.createElement('div');
            s.className = 'slot';
            s.innerHTML = `<span class="k">${i + 1}</span><span class="g"></span><div class="c"></div><span class="t"></span><span class="n"></span>`;
            s.onpointerdown = (e) => { e.preventDefault(); this.ctx.sfx.init(); this.ctx.useSlot(i); };
            box.appendChild(s);
            this.slots.push(s);
        }
    }

    hud(dt) {
        const g = this.g;
        const h = g.hero;
        const cl = CLASSES[h.cls];
        const mh = g.maxHp(h);
        const mm = g.maxMp(h);
        const setBar = (el, v, max, text = true) => {
            const w = `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}%`;
            if (el.firstElementChild.style.width !== w) el.firstElementChild.style.width = w;
            if (text && el.children[1]) { const t = `${Math.ceil(v)} / ${Math.round(max)}`; if (el.children[1].textContent !== t) el.children[1].textContent = t; }
        };
        setBar($('hpb'), h.hp, mh);
        setBar($('mpb'), h.mp, mm);
        setBar($('xpb'), h.xp, XP_TO(h.lvl), false);
        if (this.isDirty) {
            this.isDirty = false;
            $('face').textContent = cl.name[0];
            $('face').style.background = hex(cl.color ?? 0x3f95b8);
            $('lvl').textContent = h.lvl;
            $('myname').textContent = cl.name;
            $('gold').textContent = `${h.gold} з`;
            $('points').hidden = h.points <= 0;
            $('points').textContent = `+${h.points} очк. характеристик`;
            this.tracker();
            const dot = (w, on) => { const b = document.querySelector(`#menu [data-w="${w}"]`); let d = b.querySelector('.dot'); if (on && !d) { d = document.createElement('i'); d.className = 'dot'; b.appendChild(d); } else if (!on && d) d.remove(); };
            dot('char', h.points > 0);
            dot('quests', Object.values(h.quests).some((q) => q.state === 'ready'));
        }
        $('shipbar').hidden = !h.sailing;
        if (h.sailing) setBar($('shipbar').querySelector('.bar'), g.ship.hull, g.ship.max);
        $('points').style.top = h.sailing ? '150px' : '';
        // target
        const t = g.targetMob();
        const tg = $('tgt');
        tg.hidden = !t;
        if (t) {
            const n = `${t.def.name}<small>ур. ${t.lvl}${t.def.boss ? ' · босс' : ''}${t.def.temper === 'aggressive' ? '' : ' · мирный'}</small>`;
            if (tg._n !== n) { tg.firstElementChild.innerHTML = n; tg._n = n; }
            tg.classList.toggle('passive', t.def.temper !== 'aggressive');
            setBar(tg.querySelector('.bar'), t.hp, t.max);
        }
        // skills
        const known = new Set(g.skills());
        h.bar.forEach((id, i) => {
            const s = this.slots[i];
            let glyph = '';
            let cd = 0;
            let max = 1;
            let off = false;
            let nomp = false;
            let count = '';
            if (id && SKILLS[id]) {
                glyph = SKILL_ICON[SKILLS[id].fx] ?? '✦';
                cd = h.cds[id] ?? 0;
                max = SKILLS[id].cd;
                off = !known.has(id);
                nomp = h.mp < SKILLS[id].mp;
            } else if (id && ITEMS[id]) {
                const ic = itemIcon(id);
                glyph = ic.g;
                const n = g.count(id);
                count = n ? String(n) : '';
                off = n === 0;
                cd = h.cds['item:' + id] ?? 0;
                max = 2;
            }
            const g0 = s.children[1];
            if (g0.textContent !== glyph) g0.textContent = glyph;
            s.classList.toggle('off', off);
            s.classList.toggle('nomp', nomp && !off);
            s.classList.toggle('q', h.queued === id && !!id);
            s.children[2].style.height = cd > 0 ? `${(cd / max) * 100}%` : '0';
            const tt = cd > 0 ? (cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)) : '';
            if (s.children[3].textContent !== String(tt)) s.children[3].textContent = tt;
            if (s.children[4].textContent !== count) s.children[4].textContent = count;
            s.title = id ? (SKILLS[id]?.name ?? ITEMS[id]?.name) : '';
        });
        // what can be done here
        const near = g.hero.sailing || !g.hero.dead ? g.nearby()[0] : null;
        const pr = $('prompt');
        const txt = near ? `<kbd>F</kbd>${esc(near.label)}` : '';
        pr.hidden = !near || !!g.hero.act;
        if (pr._t !== txt) { pr.innerHTML = txt; pr._t = txt; }
        pr.onclick = () => this.ctx.useNearest();
        // gathering progress
        if (h.act?.type === 'gather') setBar($('cast').querySelector('.bar'), h.act.t, h.act.total, false);
        else if (h.act?.type === 'fish') setBar($('cast').querySelector('.bar'), h.act.bite > 0 ? 1 : h.act.t % 1, 1, false);
        // place and time
        this.hudT = (this.hudT ?? 0) - dt;
        if (this.hudT <= 0) {
            this.hudT = 0.5;
            const isl = g.islandAt(g.hero.body.x, g.hero.body.y);
            $('place').textContent = isl ? ISLANDS[isl.id].name : 'Открытое море';
            const d = g.day;
            const hh = Math.floor(d * 24);
            const mm2 = Math.floor((d * 24 - hh) * 60);
            const part = d < 0.22 || d > 0.84 ? 'ночь' : d < 0.3 ? 'рассвет' : d < 0.45 ? 'утро' : d < 0.62 ? 'день' : d < 0.76 ? 'вечер' : 'закат';
            $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm2).padStart(2, '0')} · ${part}`;
            this.tracker();
        }
    }

    tracker() {
        const g = this.g;
        const h = g.hero;
        const rows = [];
        for (const [id, s] of Object.entries(h.quests)) {
            if (s.state !== 'active' && s.state !== 'ready') continue;
            const q = QUESTS[id];
            rows.push(`<div class="q ${s.state}"><b>${esc(q.name)}</b>${esc(this.progress(id))}</div>`);
        }
        const html = rows.length ? rows.slice(0, 4).join('') : '<div class="q"><b>Нет заданий</b>Ищи «!» над головами людей.</div>';
        const tr = $('tracker');
        if (tr._h !== html) { tr.innerHTML = html; tr._h = html; }
    }

    progress(id) {
        const g = this.g;
        const q = QUESTS[id];
        const s = g.hero.quests[id];
        const to = NPCS[g.turnInNpc(id)]?.name;
        if (s.state === 'ready') return `Готово — к ${to}.`;
        if (q.type === 'kill') return `${MONSTERS[q.target].name}: ${s.n}/${q.count}`;
        if (q.type === 'gather') return `${ITEMS[q.item].name}: ${Math.min(g.count(q.item), q.count)}/${q.count}`;
        if (q.type === 'deliver') return `Отнести: ${ITEMS[q.item].name} → ${to}`;
        if (q.type === 'talk') return `Поговорить: ${to}`;
        if (q.type === 'level') return `Уровень ${g.hero.lvl}/${q.count}`;
        return '';
    }

    // ---------------------------------------------------------- windows
    toggle(name) { if (this.open === name) this.close(); else this.openWin(name); }

    openWin(name, arg) {
        this.open = name;
        this.arg = arg;
        this.sel = null;
        this.blocking = ['class', 'dialog', 'shop', 'craft'].includes(name);
        $('win').hidden = false;
        $('veil').hidden = false;
        this.render();
    }

    close() {
        this.open = null;
        this.blocking = false;
        $('win').hidden = true;
        $('veil').hidden = true;
    }

    frame(title, body, tabs = '') {
        $('win').innerHTML = `<header><h2>${esc(title)}</h2><button class="x" id="wx">×</button></header>${tabs}<div class="body">${body}</div>`;
        $('wx').onclick = () => this.close();
    }

    render() {
        const f = { char: this.wChar, bag: this.wBag, skills: this.wSkills, quests: this.wQuests, profs: this.wProfs, map: this.wMap, shop: this.wShop, craft: this.wCraft, class: this.wClass, dialog: this.wDialog }[this.open];
        if (f) f.call(this);
    }

    on(sel, fn) { for (const el of $('win').querySelectorAll(sel)) el.onclick = (e) => { this.ctx.sfx.play('click'); fn(el, e); }; }

    wChar() {
        const g = this.g;
        const h = g.hero;
        const cl = CLASSES[h.cls];
        const stats = Object.entries(STATS).map(([k, name]) => `<div class="stat"><span>${name}</span><span><b>${g.stat(h, k)}</b>${h.points > 0 ? `<button class="btn" data-k="${k}">+</button>` : ''}</span></div>`).join('');
        const der = [
            ['Здоровье', Math.round(g.maxHp(h))], ['Дух', Math.round(g.maxMp(h))], ['Сила удара', Math.round(g.power())], ['Магия', Math.round(g.magic())],
            ['Защита', Math.round(g.defense())], ['Меткость', Math.round(g.hitRate())], ['Уклонение', Math.round(g.dodge())], ['Крит', g.critRate().toFixed(1) + '%'],
            ['Скорость атаки', (1 / g.interval()).toFixed(2) + '/с'],
        ].map(([a, b]) => `<div class="stat"><span>${a}</span><b>${b}</b></div>`).join('');
        const eq = ['weapon', 'armor', 'ring'].map((slot) => {
            const e = h.equip[slot];
            const name = { weapon: 'Оружие', armor: 'Доспех', ring: 'Кольцо' }[slot];
            if (!e) return `<div class="eq"><div class="item empty"></div><div><b>${name}</b><br><small>пусто</small></div></div>`;
            const d = ITEMS[e.id];
            return `<div class="eq"><div class="item" data-slot="${slot}" style="color:${RARITY[d.rare ?? 0]}">${iconHtml(e.id)}${e.up ? `<span class="u">+${e.up}</span>` : ''}</div><div><b>${esc(d.name)}${e.up ? ' +' + e.up : ''}</b><br><small>${esc(itemMeta(g, e.id, e.up))}</small></div></div>`;
        }).join('');
        const path = h.classes.map((c) => CLASSES[c].name).join(' → ');
        this.frame(`${cl.name} · ${h.lvl} ур.`, `
            <div class="row2">
                <div>
                    <div class="info" style="margin-top:0"><h3>${esc(path)}</h3><div class="meta">${esc(cl.desc)}</div>
                    <div class="meta" style="margin-top:4px">Опыт ${h.xp} / ${XP_TO(h.lvl)} · Золото <span class="gold">${h.gold}</span></div></div>
                    <h3 class="hand" style="margin:8px 0 2px;font-size:22px">Характеристики ${h.points > 0 ? `<small style="font:800 12px Nunito;color:var(--teal-d)">свободно: ${h.points}</small>` : ''}</h3>
                    ${stats}
                    ${h.points > 0 ? '<div style="margin-top:6px"><button class="btn teal" id="auto">Распределить по классу</button></div>' : ''}
                </div>
                <div>${eq}<div style="margin-top:6px">${der}</div></div>
            </div>`);
        this.on('[data-k]', (el) => { g.addPoint(el.dataset.k); this.dirty(); });
        this.on('#auto', () => { g.autoPoints(); this.dirty(); });
        this.on('[data-slot]', (el) => { g.unequip(el.dataset.slot); this.dirty(); });
    }

    wBag() {
        const g = this.g;
        const h = g.hero;
        const cells = [];
        for (let i = 0; i < INV_SIZE; i++) {
            const it = h.inv[i];
            if (!it) { cells.push('<div class="item empty"></div>'); continue; }
            const d = ITEMS[it.id];
            const ic = itemIcon(it.id);
            cells.push(`<div class="item ${this.sel === i ? 'sel' : ''}" data-i="${i}" style="background:${ic.c};color:#fff;text-shadow:0 0 2px #000;box-shadow:inset 0 0 0 2px ${RARITY[d.rare ?? 0]}">${ic.g}${it.n > 1 ? `<span class="n">${it.n}</span>` : ''}${it.up ? `<span class="u">+${it.up}</span>` : ''}</div>`);
        }
        let info = '<div class="meta">Выбери вещь.</div>';
        const it = h.inv[this.sel];
        if (it) {
            const d = ITEMS[it.id];
            const acts = [];
            if (['weapon', 'armor', 'ring'].includes(d.slot)) { const why = g.canEquip(it.id); acts.push(`<button class="btn teal" id="eqp" ${why ? 'disabled' : ''}>Надеть</button>${why ? `<span class="meta">${esc(why)}</span>` : ''}`); }
            if (d.slot === 'use') { acts.push('<button class="btn teal" id="use">Использовать</button>'); acts.push('<button class="btn" id="tobar">На панель</button>'); }
            info = `<h3 style="color:${d.rare ? '#8a5ac8' : 'inherit'}">${esc(d.name)}${it.up ? ' +' + it.up : ''}</h3><div class="meta">${esc(itemMeta(g, it.id, it.up))}</div><div class="acts">${acts.join('')}</div>`;
        }
        this.frame(`Сумка · ${h.inv.length}/${INV_SIZE}`, `<div class="grid">${cells.join('')}</div><div class="info">${info}</div><div class="meta" style="margin-top:6px">Золото: <span class="gold">${h.gold}</span></div>`);
        this.on('[data-i]', (el) => { this.sel = +el.dataset.i; this.render(); });
        this.on('#eqp', () => { g.equip(this.sel); this.sel = null; this.dirty(); });
        this.on('#use', () => { g.use(it.id); this.render(); });
        this.on('#tobar', () => { const f = h.bar.indexOf(it.id) >= 0 ? -1 : h.bar.lastIndexOf(null); if (f >= 0) h.bar[f] = it.id; else if (h.bar.indexOf(it.id) < 0) h.bar[7] = it.id; this.log(`${ITEMS[it.id].name} — на панели.`); });
    }

    wSkills() {
        const g = this.g;
        const h = g.hero;
        const known = new Set(g.skills());
        const rows = [];
        for (const c of h.classes) {
            const cl = CLASSES[c];
            rows.push(`<h3 class="hand" style="margin:6px 0 4px;font-size:22px">${esc(cl.name)}</h3>`);
            cl.skills.forEach((id, i) => {
                const s = SKILLS[id];
                const lvl = s.lvl ?? [[1, 3], [8, 10, 12, 15], [20, 23]][cl.tier][i];
                const on = known.has(id);
                const slot = h.bar.indexOf(id);
                rows.push(`<div class="li ${on ? '' : 'off'}" style="opacity:${on ? 1 : 0.5}" data-s="${id}"><b>${SKILL_ICON[s.fx] ?? '✦'} ${esc(s.name)}</b>${slot >= 0 ? ` <span class="meta">[${slot + 1}]</span>` : ''}<small>${SKILL_KIND[s.kind]} · дух ${s.mp} · перезарядка ${s.cd} с${s.mult ? ` · сила ×${s.mult}` : ''}${on ? '' : ` · откроется на ${lvl} ур.`}</small></div>`);
            });
        }
        const next = CLASSES[h.cls].next;
        const hint = next ? `<div class="info">Следующий путь на ${CLASSES[h.cls].nextLevel} уровне: ${next.map((n) => CLASSES[n].name).join(', ')}.</div>` : '';
        this.frame('Навыки', `<div class="meta">Нажми на навык, чтобы поставить его на панель (или убрать).</div><div class="list" style="margin-top:6px">${rows.join('')}</div>${hint}`);
        this.on('[data-s]', (el) => {
            const id = el.dataset.s;
            if (!known.has(id)) return;
            const i = h.bar.indexOf(id);
            if (i >= 0) h.bar[i] = null;
            else { const f = h.bar.indexOf(null); if (f >= 0) h.bar[f] = id; else h.bar[0] = id; }
            this.render();
        });
    }

    wQuests() {
        const g = this.g;
        const h = g.hero;
        const act = Object.entries(h.quests).filter(([, s]) => s.state === 'active' || s.state === 'ready');
        const avail = Object.entries(h.quests).filter(([, s]) => s.state === 'available');
        const done = Object.entries(h.quests).filter(([, s]) => s.state === 'done');
        const sel = this.sel ?? act[0]?.[0];
        const li = ([id, s]) => `<div class="li ${sel === id ? 'on' : ''}" data-q="${id}"><b>${esc(QUESTS[id].name)}</b><small>${esc(s.state === 'available' ? 'у ' + NPCS[QUESTS[id].giver].name : s.state === 'done' ? 'выполнено' : this.progress(id))}</small></div>`;
        let info = '';
        if (sel) {
            const q = QUESTS[sel];
            info = `<div class="info"><h3>${esc(q.name)}</h3><div class="meta">${esc(NPCS[q.giver].name)}</div><div class="qtext">${esc(q.text)}</div><div class="rew">${esc(this.reward(q))}</div></div>`;
        }
        this.frame('Задания', `<div class="row2"><div class="list">${act.map(li).join('') || '<div class="meta">Нет активных заданий.</div>'}${avail.length ? `<h3 class="hand" style="font-size:20px;margin:8px 0 4px">Можно взять</h3>${avail.map(li).join('')}` : ''}${done.length ? `<div class="meta" style="margin-top:8px">Выполнено: ${done.length}</div>` : ''}</div><div>${info}</div></div>`);
        this.on('[data-q]', (el) => { this.sel = el.dataset.q; this.render(); });
    }

    reward(q) {
        const r = q.reward;
        const p = [];
        if (r.xp) p.push(`${r.xp} опыта`);
        if (r.gold) p.push(`${r.gold} золота`);
        for (const [it, n] of r.items ?? []) p.push(`${ITEMS[it].name}${n > 1 ? ' ×' + n : ''}`);
        if (r.compass) p.push('шестигранный компас');
        if (r.ship) p.push('свой шлюп');
        if (r.classChoice) p.push('выбор класса');
        if (r.classChoice2) p.push('второй класс');
        if (r.prof) p.push(`${PROFS[r.prof[0]].name}`);
        return 'Награда: ' + p.join(', ');
    }

    wProfs() {
        const g = this.g;
        const h = g.hero;
        const teach = { fishing: 'Рыбак Сом (северный пирс)', wood: 'Лесоруб Ярь (холм)', mining: 'Рудокоп Грах (у маяка)', herbs: 'Лавочница Тиса (площадь)', salvage: 'Ныряльщица Нела (западный пирс)', craft: 'любая мастерская' };
        const rows = Object.entries(PROFS).map(([id, p]) => {
            const s = h.profs[id];
            return `<div class="li"><b>${esc(p.name)} · ${s.known ? s.lvl + ' ур.' : 'не изучено'}</b><small>${s.known ? '' : 'Учит: ' + esc(teach[id])}</small>${s.known ? `<div class="bar pbar"><i style="width:${(s.xp / (s.lvl * 40)) * 100}%"></i></div>` : ''}</div>`;
        }).join('');
        this.frame('Профессии', `<div class="list">${rows}</div><div class="info"><div class="meta">Деревья, жилы, травы и обломки отмечены на земле — подойди и нажми F. Рыбу ловят у пены возле пирсов и с борта шлюпа: жди «Клюёт!» и жми Пробел. В мастерских (кузня, очаг, алхимический стол) из добытого делают зелья, еду, доски и точильные камни; в кузне оружие и доспехи можно усилить до +5.</div></div>`);
    }

    wMap() {
        const g = this.g;
        const h = g.hero;
        const img = this.ctx.mapImage;
        const W = img.width;
        const H = Math.round(img.height * 0.866);
        this.frame('Карта архипелага', `<canvas id="map" width="${W * 3}" height="${H * 3}"></canvas><div class="meta" style="margin-top:6px">${h.compass ? 'Компас показывает цели заданий (жёлтые) и причалы (⚓).' : 'Без компаса видно только острова. Карту уточнит Картограф Мира.'}</div>`);
        const c = $('map').getContext('2d');
        c.imageSmoothingEnabled = true;
        c.drawImage(img, 0, 0, W * 3, H * 3);
        const P = (x, y) => [x * 3, (img.height * 0.866 - y) * 3];
        c.font = '700 28px Caveat, cursive';
        c.textAlign = 'center';
        for (const [id, I] of Object.entries(g.gen.islands)) {
            let [x, y] = P(I.x, I.y - I.r - 2);
            const tw = c.measureText(`${ISLANDS[id].name} · ${ISLANDS[id].lvl}`).width;
            x = Math.max(tw / 2 + 6, Math.min(W * 3 - tw / 2 - 6, x));
            y = Math.max(30, Math.min(H * 3 - 10, y + 10));
            const seen = h.visited[id];
            c.fillStyle = seen ? '#23282c' : 'rgba(35,40,44,0.45)';
            c.strokeStyle = 'rgba(243,236,218,0.9)';
            c.lineWidth = 4;
            const t = `${ISLANDS[id].name} · ${ISLANDS[id].lvl}`;
            c.strokeText(t, x, y);
            c.fillText(t, x, y);
        }
        if (h.compass) {
            c.font = '800 16px Nunito, sans-serif';
            for (const d of g.docks) { const [x, y] = P(d.x, d.y); c.fillStyle = '#23282c'; c.fillText('⚓', x, y + 6); }
            for (const n of g.npcs) {
                const m = g.npcMark(n.id);
                if (!m) continue;
                const [x, y] = P(n.x, n.y);
                c.fillStyle = m === '?' ? '#23777d' : '#e0a94e';
                c.beginPath();
                c.arc(x, y, 7, 0, Math.PI * 2);
                c.fill();
                c.fillStyle = '#fff';
                c.fillText(m, x, y + 5);
            }
        }
        if (g.ship && !h.sailing) { const [x, y] = P(g.ship.x, g.ship.y); c.fillStyle = '#8a6446'; c.fillRect(x - 5, y - 5, 10, 10); }
        const [x, y] = P(h.body.x, h.body.y);
        c.fillStyle = '#c9483e';
        c.strokeStyle = '#23282c';
        c.lineWidth = 3;
        c.beginPath();
        c.arc(x, y, 9, 0, Math.PI * 2);
        c.fill();
        c.stroke();
    }

    // ---------------------------------------------------------- people
    dialog(npcId) {
        this.npc = npcId;
        this.dlgMode = null;
        this.openWin('dialog', npcId);
    }

    wDialog() {
        const g = this.g;
        const id = this.npc;
        const d = NPCS[id];
        const qs = g.npcQuests(id);
        const h = g.hero;
        const mode = this.dlgMode;
        let text = `<p>${esc(d.line)}</p>`;
        const opts = [];
        if (mode?.offer) {
            const q = QUESTS[mode.offer];
            text = `<p class="qtext">${esc(q.text)}</p><div class="rew">${esc(this.reward(q))}</div>`;
            opts.push(`<button class="btn teal" data-a="accept">Берусь</button>`, '<button class="btn" data-a="back">Не сейчас</button>');
        } else if (mode?.finished) {
            const q = QUESTS[mode.finished];
            text = `<p>${esc(q.done ?? 'Отлично. Держи, заслужил.')}</p><div class="rew">${esc(this.reward(q))}</div>`;
            opts.push('<button class="btn" data-a="back">Дальше</button>');
        } else {
            for (const q of qs) {
                if (q.act === 'offer') opts.push(`<button class="btn" data-offer="${q.id}"><b style="color:var(--ochre)">!</b> ${esc(QUESTS[q.id].name)}</button>`);
                if (q.act === 'finish') opts.push(`<button class="btn teal" data-finish="${q.id}">? Сдать: ${esc(QUESTS[q.id].name)}</button>`);
                if (q.act === 'progress') opts.push(`<button class="btn" data-remind="${q.id}">… ${esc(QUESTS[q.id].name)} (${esc(this.progress(q.id))})</button>`);
            }
            if (d.shop) opts.push('<button class="btn" data-a="shop">Торговать</button>');
            if (d.prof && !h.profs[d.prof].known) opts.push(`<button class="btn" data-a="learn">Научиться: ${esc(PROFS[d.prof].name)}</button>`);
            if (d.station) opts.push(`<button class="btn" data-a="craft">${esc(STATIONS[d.station])}</button>`);
            if (d.role === 'classmaster' || d.role === 'classmaster2') {
                const cl = CLASSES[h.cls];
                const can = cl.next && h.lvl >= cl.nextLevel && (h.quests.classes.state === 'done' || h.cls !== 'novice') && (h.cls === 'novice' || h.quests.advance.state === 'done');
                if (can) opts.push('<button class="btn teal" data-a="class">Выбрать путь</button>');
            }
            if (d.role === 'shipwright' && h.hasShip) {
                const cost = g.ship ? Math.ceil((g.ship.max - g.ship.hull) * 0.3) : 0;
                if (g.ship && g.ship.hull < g.ship.max) opts.push(`<button class="btn" data-a="repair">Починить шлюп (${cost} з)</button>`);
                opts.push('<button class="btn" data-a="fetch">Пригнать шлюп к этому причалу</button>');
            }
            opts.push('<button class="btn" data-a="bye">Прощай</button>');
        }
        this.frame(d.name, `<div class="dlg"><div class="who" style="background:${hex(d.color)}">${esc(d.name.split(' ').pop()[0])}</div><div style="flex:1">${text}<div class="opts">${opts.join('')}</div></div></div>`);
        this.on('[data-offer]', (el) => { this.dlgMode = { offer: el.dataset.offer }; this.render(); });
        this.on('[data-finish]', (el) => { const qid = el.dataset.finish; if (g.finish(qid)) { this.dlgMode = { finished: qid }; } this.render(); });
        this.on('[data-remind]', (el) => { this.dlgMode = { offer: null }; const q = QUESTS[el.dataset.remind]; $('win').querySelector('.dlg p').textContent = q.text; });
        this.on('[data-a]', (el) => {
            const a = el.dataset.a;
            if (a === 'accept') { g.accept(this.dlgMode.offer); this.dlgMode = null; this.render(); }
            else if (a === 'back') { this.dlgMode = null; if (this.open === 'dialog') this.render(); }
            else if (a === 'shop') this.openWin('shop', d.shop);
            else if (a === 'learn') { g.learn(d.prof); this.render(); }
            else if (a === 'craft') this.openWin('craft', d.station);
            else if (a === 'class') this.openWin('class');
            else if (a === 'repair') { const cost = Math.ceil((g.ship.max - g.ship.hull) * 0.3); if (h.gold >= cost) { h.gold -= cost; g.ship.hull = g.ship.max; this.log('Шлюп как новый.', 'good'); } else this.log('Не хватает золота.', 'warn'); this.dirty(); this.render(); }
            else if (a === 'fetch') { const dock = g.docks.find((x) => x.island === (g.islandAt(g.hero.body.x, g.hero.body.y)?.id ?? 'wharf')); if (dock) { g.placeShip(dock); this.log('Шлюп у причала.', 'good'); } this.close(); }
            else this.close();
        });
    }

    wShop() {
        const g = this.g;
        const h = g.hero;
        const list = SHOPS[this.arg] ?? [];
        const buy = list.map((id) => {
            const d = ITEMS[id];
            const why = ['weapon', 'armor', 'ring'].includes(d.slot) ? g.canEquip(id) : null;
            return `<div class="srow ${h.gold < d.price ? 'no' : ''}" data-b="${id}" title="${esc(itemMeta(g, id))}">${iconHtml(id)}<span>${esc(d.name)}<br><small class="meta">${esc(why ?? itemMeta(g, id))}</small></span><em>${d.price}</em></div>`;
        }).join('');
        const sell = h.inv.map((it, i) => {
            const d = ITEMS[it.id];
            if (d.slot === 'quest') return '';
            return `<div class="srow" data-s="${i}">${iconHtml(it.id)}<span>${esc(d.name)}${it.n > 1 ? ' ×' + it.n : ''}${it.up ? ' +' + it.up : ''}</span><em>${g.sellPrice(it)}</em></div>`;
        }).join('');
        this.frame(`Лавка · ${NPCS[this.npc]?.name ?? ''}`, `<div class="shop"><div><h4>Купить</h4>${buy}</div><div><h4>Продать</h4>${sell || '<div class="meta">Нечего продать.</div>'}</div></div><div class="meta" style="margin-top:8px">Золото: <span class="gold">${h.gold}</span></div>`);
        this.on('[data-b]', (el) => { if (g.buy(el.dataset.b)) this.log(`Куплено: ${ITEMS[el.dataset.b].name}.`, 'good'); this.render(); });
        this.on('[data-s]', (el) => { g.sell(+el.dataset.s); this.render(); });
    }

    wCraft() {
        const g = this.g;
        const h = g.hero;
        const st = this.arg;
        const rows = Object.entries(RECIPES).filter(([, r]) => r.station === st).map(([id, r]) => {
            const ok = r.needs.every(([it, n]) => g.count(it) >= n) && h.profs.craft.lvl >= r.lvl;
            const needs = r.needs.map(([it, n]) => `${ITEMS[it].name} ${Math.min(g.count(it), n)}/${n}`).join(', ');
            return `<div class="srow ${ok ? '' : 'no'}" data-c="${id}">${iconHtml(id)}<span>${esc(ITEMS[id].name)}${r.out > 1 ? ' ×' + r.out : ''}<br><small class="meta">${esc(needs)}${r.lvl > 1 ? ` · ремесло ${r.lvl}` : ''}</small></span><em>${ok ? 'сделать' : ''}</em></div>`;
        }).join('');
        let up = '';
        if (st === 'forge') {
            up = ['weapon', 'armor'].map((slot) => {
                const e = h.equip[slot];
                if (!e) return '';
                const mat = slot === 'weapon' ? 'whetstone' : 'plate';
                return `<div class="srow ${g.count(mat) ? '' : 'no'}" data-u="${slot}">${iconHtml(e.id)}<span>Усилить: ${esc(ITEMS[e.id].name)} +${e.up} → +${e.up + 1}<br><small class="meta">${ITEMS[mat].name}: ${g.count(mat)} · шанс ${Math.round([1, 1, 1, 0.75, 0.55][e.up] * 100 || 0)}%</small></span><em>${e.up < 5 ? 'усилить' : 'предел'}</em></div>`;
            }).join('');
        }
        this.frame(STATIONS[st], `${rows}${up ? `<h3 class="hand" style="font-size:22px;margin:10px 0 4px">Усиление</h3>${up}` : ''}<div class="meta" style="margin-top:8px">Ремесло: ${h.profs.craft.lvl} ур.</div>`);
        this.on('[data-c]', (el) => { g.craft(el.dataset.c); this.render(); });
        this.on('[data-u]', (el) => { g.upgrade(el.dataset.u); this.render(); });
    }

    wClass() {
        const g = this.g;
        const h = g.hero;
        const cl = CLASSES[h.cls];
        if (!cl.next || h.lvl < cl.nextLevel) { this.frame('Выбор пути', `<div class="meta">Путь откроется на ${cl.nextLevel ?? '—'} уровне.</div>`); return; }
        const cards = cl.next.map((id) => {
            const c = CLASSES[id];
            return `<div class="li" data-c="${id}"><div class="icon" style="background:${hex(c.color)}">${c.name[0]}</div><b>${esc(c.name)}</b><small>${esc(c.desc)}</small><small>Навыки: ${c.skills.map((s) => SKILLS[s].name).join(', ')}</small></div>`;
        }).join('');
        this.frame('Выбор пути', `<div class="meta">Выбор окончательный. Новый класс получит своё оружие и навыки.</div><div class="classes list" style="margin-top:8px">${cards}</div>`);
        this.on('[data-c]', (el) => { if (g.chooseClass(el.dataset.c)) { this.close(); this.dirty(); } });
    }
}
