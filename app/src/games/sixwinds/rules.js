// Six Winds rules: attributes, classes, the skill tree and the formulas of a
// fight. The structure follows the old seafaring MMO the game grew from: six
// attributes, a point to spend every level and five on every tenth, a first
// class at 10 and a second at 40, skills of ten levels bought with skill points
// and opened by other skills. Names, numbers and texts are this game's own.

export const STATS = { str: 'Сила', acc: 'Точность', agi: 'Ловкость', con: 'Телосложение', spr: 'Дух', luk: 'Удача' };
export const STAT_HINT = {
    str: 'урон ближнего боя', acc: 'урон луков и меткость', agi: 'уклонение и скорость атаки',
    con: 'здоровье и защита', spr: 'дух, магия и лечение', luk: 'крит и добыча',
};

export const FIRST_CLASS_LEVEL = 10;
export const SECOND_CLASS_LEVEL = 40;
export const MAX_SKILL = 10;

// attribute points at level lvl (reached): one, five on every tenth, one more from 60
export const apFor = (lvl) => (lvl % 10 === 0 ? 5 : 1) + (lvl >= 60 ? 1 : 0);
// skill points: one a level from the second
export const tpFor = (lvl) => (lvl >= 2 ? 1 : 0) + (lvl >= 65 && lvl % 5 === 0 ? 1 : 0);

export const XP_TO = (lvl) => Math.floor(18 * Math.pow(lvl, 1.9) + 20);

// ---------------------------------------------------------------- classes
// hp: from CON (linear, square, per level); sp: from SPR; atk: from STR or ACC; the rest as named
const COEF = {
    novice: { hp: [3, 2, 15], sp: [1, 0, 3], atkStr: [1.5, 0.4], atkAcc: [0, 0], def: [0.1, 0.1], hit: 0.6, flee: 0.6, crt: 0.31, aspd: 1.1 },
    swordsman: { hp: [5, 7, 25], sp: [1, 0, 3], atkStr: [1.5, 0.4], atkAcc: [0, 0], def: [0.2, 0.2], hit: 0.6, flee: 0.6, crt: 0.31, aspd: 1.1 },
    hunter: { hp: [3, 3, 25], sp: [1, 0, 3], atkStr: [0, 0], atkAcc: [1.7, 0.4], def: [0.14, 0.1], hit: 0.7, flee: 0.7, crt: 0.25, aspd: 1.2 },
    explorer: { hp: [5, 5, 25], sp: [2, 1.5, 5], atkStr: [1.5, 0.4], atkAcc: [0, 0], def: [0.13, 0.1], hit: 0.6, flee: 0.6, crt: 0.31, aspd: 1.1 },
    herbalist: { hp: [5, 5, 25], sp: [2, 1.5, 5], atkStr: [1.5, 0.4], atkAcc: [0, 0], def: [0.13, 0.1], hit: 0.6, flee: 0.6, crt: 0.31, aspd: 1.1 },
    champion: { hp: [5, 7, 40], sp: [1, 0, 3], atkStr: [2, 0.45], atkAcc: [0, 0], def: [0.2, 0.6], hit: 0.6, flee: 0.6, crt: 0.31, aspd: 1.1 },
    crusader: { hp: [5, 7, 30], sp: [1, 0, 3], atkStr: [1.5, 0.4], atkAcc: [0, 0], def: [0.2, 0.1], hit: 0.6, flee: 0.75, crt: 0.31, aspd: 1.25 },
    sharpshooter: { hp: [3.5, 3.5, 30], sp: [1, 0, 3], atkStr: [0, 0], atkAcc: [2, 0.45], def: [0.15, 0.15], hit: 0.6, flee: 0.6, crt: 0.31, aspd: 1.1 },
    cleric: { hp: [5, 5, 30], sp: [3, 1.5, 5], atkStr: [1.5, 0.4], atkAcc: [0, 0], def: [0.15, 0.1], hit: 0.6, flee: 0.6, crt: 0.31, aspd: 1.1 },
    sealmaster: { hp: [5, 5, 30], sp: [3, 1.5, 5], atkStr: [1.5, 0.4], atkAcc: [0, 0], def: [0.15, 0.1], hit: 0.6, flee: 0.6, crt: 0.31, aspd: 1.1 },
    voyager: { hp: [5, 5, 30], sp: [3, 1.5, 5], atkStr: [1.5, 0.4], atkAcc: [0, 0], def: [0.15, 0.1], hit: 0.6, flee: 0.6, crt: 0.31, aspd: 1.1 },
};

export const CLASSES = {
    novice: {
        name: 'Юнга', tier: 0, weapons: ['blade'], color: 0x3f95b8, next: ['swordsman', 'hunter', 'explorer', 'herbalist'], nextLevel: FIRST_CLASS_LEVEL,
        skills: ['strike', 'firstaid'], hint: ['con', 'str'],
        desc: 'Сошёл на берег с сундуком и саблей. Всё ещё впереди.',
    },
    swordsman: {
        name: 'Мечник', tier: 1, weapons: ['blade', 'greatblade', 'dual'], color: 0xc9483e, next: ['champion', 'crusader'], nextLevel: SECOND_CLASS_LEVEL,
        skills: ['sword_mastery', 'concentration', 'steel_will', 'wind_cut', 'break_armor', 'berserk', 'tiger_roar'], hint: ['str', 'con'],
        desc: 'Ближний бой, крепкая шкура. Первым прыгает на чужую палубу.',
    },
    hunter: {
        name: 'Охотник', tier: 1, weapons: ['bow'], color: 0x6f9a4a, next: ['sharpshooter'], nextLevel: SECOND_CLASS_LEVEL,
        skills: ['range_mastery', 'windwalk', 'eagle_eye', 'double_shot', 'frost_arrow', 'venom_arrow', 'rousing', 'arrow_rain'], hint: ['acc', 'agi'],
        desc: 'Бьёт издалека, ходит легко, не любит, когда подходят близко.',
    },
    explorer: {
        name: 'Мореход', tier: 1, weapons: ['staff'], color: 0x3f95b8, next: ['voyager'], nextLevel: SECOND_CLASS_LEVEL,
        skills: ['diligence', 'current', 'conch_armor', 'lightning', 'tornado', 'algae'], hint: ['spr', 'con'],
        desc: 'Говорит с водой и ветром. Корабль под ним идёт быстрее и держит удар.',
    },
    herbalist: {
        name: 'Травница', tier: 1, weapons: ['staff', 'censer'], color: 0xb07cd6, next: ['cleric', 'sealmaster'], nextLevel: SECOND_CLASS_LEVEL,
        skills: ['vigor', 'heal', 'spirit_bolt', 'harden', 'spirit_fire', 'tempest_boost', 'second_wind'], hint: ['spr', 'con'],
        desc: 'Лечит раны, укрепляет тело и дух, бьёт стрелой духа сквозь любую броню.',
    },
    champion: {
        name: 'Воитель', tier: 2, weapons: ['greatblade', 'blade'], color: 0xa0302a, skills: ['great_mastery', 'toughness', 'mighty_strike', 'howl', 'provoke'], hint: ['str', 'con'],
        desc: 'Двуручный клинок, бычья шкура, удар, от которого звенит в ушах.',
    },
    crusader: {
        name: 'Дуэлянт', tier: 2, weapons: ['dual', 'blade'], color: 0xd8703a, skills: ['dual_mastery', 'deftness', 'blood_frenzy', 'shadow_slash', 'poison_dart', 'stealth'], hint: ['str', 'agi'],
        desc: 'Два клинка, быстрые ноги, удар из тени.',
    },
    sharpshooter: {
        name: 'Снайпер', tier: 2, weapons: ['bow', 'gun'], color: 0x4f7a3a, skills: ['gun_mastery', 'cripple', 'enfeeble', 'headshot', 'magma_shot'], hint: ['acc', 'luk'],
        desc: 'Один выстрел — одна цель. Иногда две.',
    },
    voyager: {
        name: 'Штурман', tier: 2, weapons: ['staff'], color: 0x2f6f9a, skills: ['conch_ray', 'tail_wind', 'whirlpool', 'fog', 'thunderstorm'], hint: ['spr', 'agi'],
        desc: 'Зовёт шторм, прячет корабль в тумане, закручивает воду в воронку.',
    },
    cleric: {
        name: 'Жрица', tier: 2, weapons: ['staff', 'censer'], color: 0x5fb8c8, skills: ['divine_grace', 'greater_heal', 'angel_shield', 'energy_shield', 'healing_spring'], hint: ['spr', 'con'],
        desc: 'Великие исцеления, щиты и целебный источник.',
    },
    sealmaster: {
        name: 'Печатница', tier: 2, weapons: ['staff', 'censer'], color: 0x7a4ab0, skills: ['seal', 'insignia', 'cursed_fire', 'mire', 'deep_curse'], hint: ['spr', 'luk'],
        desc: 'Печати, что не дают бить, и проклятия, что точат броню.',
    },
};

// ---------------------------------------------------------------- skills
// values are [at level 1, added per level]; v(s.mult, lvl) reads them
export const v = (x, lvl) => (Array.isArray(x) ? x[0] + x[1] * (lvl - 1) : x ?? 0);

// kind: passive | buff | melee | ranged | magic | aoe | area | heal | spring | dash | back
// mods on the hero: atkPct defPct hit flee crit aspdPct speedPct maxHpPct maxSpPct spRegen shipSpeedPct shipDefPct shield hidden dmgToSp
// debuff on the target: defPct atkPct fleePct slow (speed factor) stun disarm root; dot: [mult, per level], ticks
export const SKILLS = {
    // ---- the cabin boy
    strike: { name: 'Удар с плеча', cls: 'novice', kind: 'melee', mp: [6, 1], cd: 5, range: 1.8, mult: [1.5, 0.1], fx: 'slash', desc: 'Сильный удар с разворота.' },
    firstaid: { name: 'Перевязка', cls: 'novice', kind: 'heal', mp: [8, 1], cd: 14, heal: [25, 10], healSpr: 1, fx: 'heal', desc: 'Наскоро перевязать рану.' },
    // ---- swordsman
    sword_mastery: { name: 'Владение клинком', cls: 'swordsman', kind: 'passive', mods: { atkPct: [0.03, 0.03] }, weapon: ['blade', 'greatblade', 'dual'], desc: 'Урон с клинком выше.' },
    concentration: { name: 'Сосредоточенность', cls: 'swordsman', kind: 'passive', mods: { hit: [3, 3] }, desc: 'Точнее каждый удар.' },
    steel_will: { name: 'Стальная воля', cls: 'swordsman', kind: 'buff', req: [['sword_mastery', 2]], mp: [10, 2], cd: 40, dur: 60, mods: { defPct: [0.08, 0.03] }, fx: 'cry', desc: 'Защита выше на минуту.' },
    wind_cut: { name: 'Удар ветра', cls: 'swordsman', kind: 'ranged', phys: true, req: [['sword_mastery', 3]], mp: [10, 2], cd: 5, range: 6, mult: [1.6, 0.14], fx: 'slash', proj: 'wave', desc: 'Волна воздуха с клинка бьёт издалека.' },
    break_armor: { name: 'Рассечь броню', cls: 'swordsman', kind: 'melee', req: [['sword_mastery', 3]], mp: [12, 2], cd: 10, range: 1.9, mult: [1.2, 0.08], debuff: { defPct: [-0.12, -0.03] }, dur: 10, fx: 'slash', desc: 'Удар по шву: враг теряет защиту.' },
    berserk: { name: 'Раж', cls: 'swordsman', kind: 'buff', req: [['wind_cut', 4]], mp: [14, 2], cd: 45, dur: 30, mods: { aspdPct: [0.12, 0.03] }, fx: 'cry', desc: 'Бить чаще, не думая.' },
    tiger_roar: { name: 'Рёв тигра', cls: 'swordsman', kind: 'aoe', req: [['break_armor', 4]], mp: [18, 2], cd: 20, radius: 3, mult: [0.6, 0.06], debuff: { atkPct: [-0.15, -0.015], slow: 0.6 }, dur: 8, fx: 'whirl', desc: 'Рёв сбивает с ног и отнимает силу у всех вокруг.' },
    // ---- champion
    great_mastery: { name: 'Тяжёлый клинок', cls: 'champion', kind: 'passive', mods: { atkPct: [0.04, 0.04] }, weapon: ['greatblade'], desc: 'Урон двуручником выше.' },
    toughness: { name: 'Бычья шкура', cls: 'champion', kind: 'passive', mods: { maxHpPct: [0.04, 0.03] }, desc: 'Здоровья больше.' },
    mighty_strike: { name: 'Сокрушающий удар', cls: 'champion', kind: 'melee', req: [['great_mastery', 3]], mp: [20, 3], cd: 8, range: 2, mult: [2.2, 0.18], stun: 1.5, fx: 'slam', desc: 'Удар всем весом, оглушает.' },
    howl: { name: 'Боевой вой', cls: 'champion', kind: 'aoe', req: [['mighty_strike', 2]], mp: [24, 3], cd: 12, radius: 3.2, mult: [1.2, 0.1], fx: 'whirl', desc: 'Ударная волна бьёт всех вокруг.' },
    provoke: { name: 'Вызов', cls: 'champion', kind: 'aoe', req: [['toughness', 3]], mp: [15, 2], cd: 25, radius: 6, mult: [0.2, 0.02], taunt: true, debuff: { atkPct: [-0.1, -0.02] }, dur: 10, fx: 'cry', desc: 'Все враги рядом бросаются на тебя, но бьют слабее.' },
    // ---- crusader
    dual_mastery: { name: 'Два клинка', cls: 'crusader', kind: 'passive', mods: { atkPct: [0.04, 0.04] }, weapon: ['dual'], desc: 'Урон парным оружием выше.' },
    deftness: { name: 'Увёртливость', cls: 'crusader', kind: 'passive', mods: { flee: [4, 3] }, desc: 'Уклонение выше.' },
    blood_frenzy: { name: 'Кровавый вихрь', cls: 'crusader', kind: 'passive', req: [['dual_mastery', 2]], mods: { aspdPct: [0.03, 0.02] }, weapon: ['dual'], desc: 'Парным оружием бьёшь чаще.' },
    shadow_slash: { name: 'Теневой разрез', cls: 'crusader', kind: 'melee', req: [['blood_frenzy', 3]], mp: [18, 2], cd: 9, range: 1.9, mult: [0.8, 0.06], hits: 3, stun: 1, fx: 'whirl', desc: 'Три удара подряд, последний оглушает.' },
    poison_dart: { name: 'Отравленный дротик', cls: 'crusader', kind: 'ranged', phys: true, req: [['deftness', 2]], mp: [12, 2], cd: 8, range: 9, mult: [0.6, 0.05], dot: [0.4, 0.04], ticks: 6, fx: 'arrow', desc: 'Дротик с ядом: урон каждую секунду.' },
    stealth: { name: 'Тень', cls: 'crusader', kind: 'buff', req: [['deftness', 4]], mp: [20, 2], cd: 40, dur: [6, 1], mods: { hidden: 1 }, fx: 'fog', desc: 'Раствориться: враги теряют тебя из виду.' },
    // ---- hunter
    range_mastery: { name: 'Владение луком', cls: 'hunter', kind: 'passive', mods: { atkPct: [0.04, 0.04] }, weapon: ['bow', 'gun'], desc: 'Урон луком выше.' },
    windwalk: { name: 'Лёгкий шаг', cls: 'hunter', kind: 'passive', req: [['range_mastery', 2]], mods: { speedPct: [0.02, 0.015] }, desc: 'Ходишь быстрее.' },
    eagle_eye: { name: 'Орлиный взгляд', cls: 'hunter', kind: 'buff', mp: [12, 1], cd: 40, dur: 60, mods: { hit: [8, 3], crit: [1, 0.3] }, fx: 'wind', desc: 'Меткость и крит выше на минуту.' },
    double_shot: { name: 'Двойной выстрел', cls: 'hunter', kind: 'ranged', phys: true, req: [['range_mastery', 3]], mp: [8, 1.5], cd: 4, range: 10, mult: [0.9, 0.06], hits: 2, fx: 'arrow', desc: 'Две стрелы одна за другой.' },
    frost_arrow: { name: 'Ледяная стрела', cls: 'hunter', kind: 'ranged', phys: true, req: [['double_shot', 2]], mp: [12, 2], cd: 8, range: 10, mult: [1.4, 0.1], debuff: { slow: 0.5 }, dur: 5, fx: 'arrow', desc: 'Стрела холодит: враг еле идёт.' },
    venom_arrow: { name: 'Ядовитая стрела', cls: 'hunter', kind: 'ranged', phys: true, req: [['double_shot', 4]], mp: [12, 2], cd: 10, range: 10, mult: [0.8, 0.05], dot: [0.45, 0.04], ticks: 6, fx: 'arrow', desc: 'Яд точит врага шесть секунд.' },
    rousing: { name: 'Азарт', cls: 'hunter', kind: 'buff', req: [['windwalk', 4]], mp: [14, 2], cd: 45, dur: 30, mods: { aspdPct: [0.1, 0.03] }, fx: 'wind', desc: 'Стрелять чаще.' },
    arrow_rain: { name: 'Звездопад стрел', cls: 'hunter', kind: 'area', phys: true, req: [['frost_arrow', 5]], mp: [20, 3], cd: 14, range: 10, radius: 2.8, mult: [1.1, 0.08], fx: 'rain', desc: 'Дождь стрел на площадь.' },
    // ---- sharpshooter
    gun_mastery: { name: 'Порох и сталь', cls: 'sharpshooter', kind: 'passive', mods: { atkPct: [0.05, 0.04] }, weapon: ['gun', 'bow'], desc: 'Урон дальним оружием ещё выше.' },
    cripple: { name: 'Подбить ноги', cls: 'sharpshooter', kind: 'ranged', phys: true, req: [['gun_mastery', 2]], mp: [14, 2], cd: 10, range: 11, mult: [1.0, 0.08], debuff: { slow: 0.4, fleePct: -0.3 }, dur: 8, fx: 'arrow', desc: 'Враг хромает и не может увернуться.' },
    enfeeble: { name: 'Обессилить', cls: 'sharpshooter', kind: 'ranged', phys: true, req: [['cripple', 3]], mp: [16, 2], cd: 14, range: 11, mult: [0.8, 0.05], debuff: { atkPct: [-0.15, -0.02] }, disarm: 3, dur: 10, fx: 'arrow', desc: 'Слабее бьёт, а первые секунды не бьёт вовсе.' },
    headshot: { name: 'Выстрел в голову', cls: 'sharpshooter', kind: 'ranged', phys: true, req: [['enfeeble', 3]], mp: [20, 3], cd: 16, range: 12, mult: [3, 0.25], ignoreDef: true, fx: 'arrow', desc: 'Сквозь броню, наверняка.' },
    magma_shot: { name: 'Огненный заряд', cls: 'sharpshooter', kind: 'area', phys: true, req: [['gun_mastery', 4]], mp: [22, 3], cd: 14, range: 10, radius: 2.5, mult: [0.8, 0.06], dot: [0.5, 0.05], ticks: 5, fx: 'storm', desc: 'Стена огня жжёт всех, кто попал.' },
    // ---- explorer
    diligence: { name: 'Усердие', cls: 'explorer', kind: 'passive', mods: { spRegen: [0.1, 0.1] }, desc: 'Дух восстанавливается быстрее.' },
    current: { name: 'Течение', cls: 'explorer', kind: 'passive', req: [['diligence', 2]], mods: { shipSpeedPct: [0.03, 0.02] }, desc: 'Твой шлюп идёт быстрее.' },
    conch_armor: { name: 'Раковинный доспех', cls: 'explorer', kind: 'passive', req: [['current', 1]], mods: { shipDefPct: [0.05, 0.03], defPct: [0.02, 0.01] }, desc: 'Шлюп и ты держите удар лучше.' },
    lightning: { name: 'Удар молнии', cls: 'explorer', kind: 'magic', req: [['diligence', 1]], mp: [9, 1.5], cd: 3, range: 9, mult: [1.5, 0.14], fx: 'storm', proj: 'bolt', desc: 'Молния с неба в одну цель.' },
    tornado: { name: 'Смерч', cls: 'explorer', kind: 'magic', req: [['current', 2]], mp: [14, 2], cd: 9, range: 9, mult: [1.1, 0.1], stun: 1.5, fx: 'wave', proj: 'water', desc: 'Вихрь подбрасывает врага в воздух.' },
    algae: { name: 'Путы водорослей', cls: 'explorer', kind: 'magic', req: [['tornado', 5]], mp: [16, 2], cd: 12, range: 9, mult: [0.9, 0.06], root: 3, dot: [0.35, 0.03], ticks: 5, fx: 'thorns', proj: 'thorns', desc: 'Водоросли держат и душат.' },
    // ---- voyager
    conch_ray: { name: 'Луч раковины', cls: 'voyager', kind: 'area', req: [['tail_wind', 1]], mp: [18, 2], cd: 6, range: 9, radius: 1.8, mult: [1.8, 0.15], magic: true, fx: 'water', desc: 'Луч бьёт цель и всех возле неё.' },
    tail_wind: { name: 'Попутный ветер', cls: 'voyager', kind: 'buff', mp: [14, 2], cd: 40, dur: 60, mods: { shipSpeedPct: [0.2, 0.04], speedPct: [0.08, 0.01] }, fx: 'wind', desc: 'Ветер в паруса и в спину.' },
    whirlpool: { name: 'Водоворот', cls: 'voyager', kind: 'area', req: [['conch_ray', 2]], mp: [20, 3], cd: 14, range: 9, radius: 3, mult: [0.8, 0.06], magic: true, debuff: { slow: 0.5 }, dur: 6, dot: [0.35, 0.03], ticks: 5, fx: 'whirlpool', desc: 'Вода крутит и держит.' },
    fog: { name: 'Туман', cls: 'voyager', kind: 'aoe', req: [['tail_wind', 3]], mp: [16, 2], cd: 25, radius: 5, mult: [0, 0], debuff: { atkPct: [-0.2, -0.02], fleePct: -0.2 }, dur: 10, fx: 'fog', desc: 'В тумане враги бьют слабо и мимо.' },
    thunderstorm: { name: 'Гроза', cls: 'voyager', kind: 'area', req: [['whirlpool', 4]], mp: [30, 4], cd: 16, range: 10, radius: 3.5, mult: [1.6, 0.14], magic: true, fx: 'storm', desc: 'Гроза над целым отрядом.' },
    // ---- herbalist
    vigor: { name: 'Жизненная сила', cls: 'herbalist', kind: 'passive', mods: { maxSpPct: [0.05, 0.04] }, desc: 'Запас духа больше.' },
    heal: { name: 'Исцеление', cls: 'herbalist', kind: 'heal', mp: [12, 2], cd: 4, heal: [40, 18], healSpr: 2, fx: 'heal', desc: 'Закрыть раны травяным отваром.' },
    spirit_bolt: { name: 'Стрела духа', cls: 'herbalist', kind: 'magic', mp: [9, 1.5], cd: 3, range: 9, mult: [1.2, 0.1], ignoreDef: true, fx: 'seal', proj: 'swarm', desc: 'Проходит сквозь любую броню.' },
    harden: { name: 'Каменная кожа', cls: 'herbalist', kind: 'buff', req: [['heal', 3]], mp: [14, 2], cd: 30, dur: 60, mods: { defPct: [0.1, 0.03] }, fx: 'shield', desc: 'Кожа твёрже на минуту.' },
    spirit_fire: { name: 'Пламя духа', cls: 'herbalist', kind: 'buff', req: [['spirit_bolt', 2]], mp: [14, 2], cd: 30, dur: 60, mods: { atkPct: [0.08, 0.03] }, fx: 'magic', desc: 'Удар и магия сильнее.' },
    tempest_boost: { name: 'Буря', cls: 'herbalist', kind: 'buff', req: [['spirit_fire', 4]], mp: [16, 2], cd: 40, dur: 45, mods: { aspdPct: [0.08, 0.03] }, fx: 'wind', desc: 'Руки быстрее.' },
    second_wind: { name: 'Второе дыхание', cls: 'herbalist', kind: 'buff', req: [['heal', 4]], mp: [20, 2], cd: 90, dur: 120, mods: { secondWind: [0.3, 0.03] }, fx: 'heal', desc: 'Если здоровье упадёт до края — вернётся часть.' },
    // ---- cleric
    divine_grace: { name: 'Благодать', cls: 'cleric', kind: 'passive', mods: { spRegen: [0.15, 0.1] }, desc: 'Дух течёт быстрее.' },
    greater_heal: { name: 'Великое исцеление', cls: 'cleric', kind: 'heal', mp: [26, 3], cd: 8, heal: [120, 40], healSpr: 3, fx: 'heal', desc: 'Большое исцеление.' },
    angel_shield: { name: 'Щит ангела', cls: 'cleric', kind: 'buff', req: [['greater_heal', 2]], mp: [22, 3], cd: 25, dur: 30, mods: { shield: [60, 25] }, shieldSpr: 2, fx: 'shield', desc: 'Щит принимает удары на себя.' },
    energy_shield: { name: 'Энергетический щит', cls: 'cleric', kind: 'buff', req: [['divine_grace', 3]], mp: [10, 1], cd: 40, dur: 30, mods: { dmgToSp: [0.3, 0.03] }, fx: 'shield', desc: 'Часть урона уходит в дух.' },
    healing_spring: { name: 'Целебный источник', cls: 'cleric', kind: 'spring', req: [['angel_shield', 3]], mp: [30, 3], cd: 30, dur: 10, heal: [15, 6], healSpr: 0.4, fx: 'heal', desc: 'Источник лечит каждую секунду.' },
    // ---- seal master
    seal: { name: 'Печать старца', cls: 'sealmaster', kind: 'magic', mp: [16, 2], cd: 14, range: 9, mult: [0.8, 0.05], disarm: [2, 0.3], fx: 'seal', proj: 'seal', desc: 'Враг не может бить.' },
    insignia: { name: 'Теневой знак', cls: 'sealmaster', kind: 'magic', mp: [14, 2], cd: 10, range: 9, mult: [0.6, 0.05], debuff: { atkPct: [-0.2, -0.03] }, dur: 10, fx: 'seal', proj: 'seal', desc: 'Удары врага слабеют.' },
    cursed_fire: { name: 'Проклятый огонь', cls: 'sealmaster', kind: 'area', req: [['insignia', 3]], mp: [20, 3], cd: 12, range: 9, radius: 3, mult: [0.9, 0.07], magic: true, debuff: { defPct: [-0.15, -0.03] }, dur: 10, fx: 'curse', desc: 'Огонь выедает броню у всех в круге.' },
    mire: { name: 'Трясина', cls: 'sealmaster', kind: 'area', req: [['seal', 3]], mp: [18, 2], cd: 16, range: 9, radius: 3.2, mult: [0.3, 0.03], magic: true, debuff: { slow: 0.45 }, dur: 8, fx: 'whirlpool', desc: 'Земля вязнет под ногами врагов.' },
    deep_curse: { name: 'Проклятие глубин', cls: 'sealmaster', kind: 'magic', req: [['cursed_fire', 4]], mp: [26, 3], cd: 16, range: 10, mult: [0.8, 0.06], dot: [0.7, 0.06], ticks: 8, debuff: { defPct: [-0.1, -0.02] }, dur: 8, fx: 'curse', proj: 'seal', desc: 'Долгое проклятие: урон и слабая броня.' },
};
for (const [id, s] of Object.entries(SKILLS)) s.id = id;

export const PASSIVE = (s) => s.kind === 'passive';

// ---------------------------------------------------------------- derived attributes
// h: { lvl, cls, base, equip, sk (skill levels), buffs } ; items: the item table
export function derive(h, items, weapon) {
    const C = COEF[h.cls] ?? COEF.novice;
    const st = { ...h.base };
    for (const slot of ['weapon', 'armor', 'ring']) {
        const e = h.equip?.[slot];
        const b = e && items[e.id]?.bonus;
        if (b) for (const [k, n] of Object.entries(b)) st[k] = (st[k] ?? 0) + n;
    }
    // passives and buffs
    const mod = { atkPct: 0, defPct: 0, hit: 0, flee: 0, crit: 0, aspdPct: 0, speedPct: 0, maxHpPct: 0, maxSpPct: 0, spRegen: 0, shipSpeedPct: 0, shipDefPct: 0 };
    for (const [id, lvl] of Object.entries(h.sk ?? {})) {
        const s = SKILLS[id];
        if (!s || s.kind !== 'passive' || lvl < 1) continue;
        if (s.weapon && !s.weapon.includes(weapon?.type)) continue;
        for (const [k, x] of Object.entries(s.mods)) mod[k] = (mod[k] ?? 0) + v(x, lvl);
    }
    for (const b of h.buffs ?? []) for (const [k, x] of Object.entries(b.mods ?? {})) if (typeof x === 'number') mod[k] = (mod[k] ?? 0) + x;
    const { str, acc, agi, con, spr, luk } = st;
    const lvl = h.lvl;
    const sq = (x, d) => Math.pow(Math.floor(x / d), 2);
    const maxHp = Math.floor((con * 3 * C.hp[0] + C.hp[1] * sq(con * 3, 20) + lvl * C.hp[2] + 40) * (1 + mod.maxHpPct));
    const maxSp = Math.floor((spr * 3 * C.sp[0] + C.sp[1] * sq(spr * 3, 20) + lvl * C.sp[2] + 5) * (1 + mod.maxSpPct));
    const baseAtk = str * C.atkStr[0] + C.atkStr[1] * sq(str * 4, 20) + acc * C.atkAcc[0] + C.atkAcc[1] * sq(acc * 4, 20);
    const up = 1 + (weapon?.up ?? 0) * 0.08;
    const wmin = (weapon?.atk?.[0] ?? 2) * up;
    const wmax = (weapon?.atk?.[1] ?? 3) * up;
    const atkMul = 1 + mod.atkPct;
    const atkMin = Math.floor((baseAtk + wmin) * atkMul);
    const atkMax = Math.floor((baseAtk + wmax) * atkMul);
    // magic: spirit with the staff's focus
    const matk = Math.floor((spr * 2.2 + sq(spr * 4, 20) * 0.4 + (weapon?.matk ?? 0) * up + lvl) * atkMul);
    const armor = h.equip?.armor ? items[h.equip.armor.id].def * (1 + h.equip.armor.up * 0.08) : 0;
    const def = Math.floor((con * 5 * C.def[0] + C.def[1] * sq(con * 3, 20) + armor) * (1 + mod.defPct));
    const hit = Math.floor(acc * C.hit) + lvl * 2 + 5 + mod.hit;
    const flee = Math.floor(agi * C.flee) + lvl * 2 + 5 + mod.flee;
    const crit = (11 + Math.floor(luk * 3 * C.crt)) / 10 + mod.crit; // percent
    const mf = 100 + Math.floor(luk * 3 * 0.39); // percent of the base drop chance
    const aspdMs = (100000 / Math.min(65 + agi * C.aspd, 300)) * (weapon?.speed ?? 1) / (1 + mod.aspdPct);
    const hrec = Math.max(1, 2 * maxHp * (1 / 180) + con * 3 * (1 / 8)) / 5;
    const srec = Math.max(1, (maxSp * (1 / 100) + spr * 3 * (1 / 12)) / 2) / 5 * (1 + mod.spRegen);
    return { st, maxHp, maxSp, atkMin, atkMax, matk, def, hit, flee, crit, mf, aspd: aspdMs / 1000, hrec, srec, speed: 1 + mod.speedPct, shipSpeed: mod.shipSpeedPct, shipDef: mod.shipDefPct, mod };
}

// ---------------------------------------------------------------- a blow
// the chance to miss, from the defender's evasion over the attacker's aim
export const missChance = (hit, flee) => Math.min(0.9, Math.max(0, (flee - hit + 10) / 100));
// critical chance (0..1): the attacker's crit and a little for being higher
export const critChance = (crit, lvlA, lvlD) => Math.min(1, crit / 100 + Math.min(0.15, Math.max(0, 0.03 * (lvlA - lvlD))));
// damage after defence and resistance, with the level difference
export function damage(atk, def, resist, lvlA, lvlD) {
    const d = lvlA - lvlD;
    const eff = Math.abs(d) >= 1 ? Math.min(1.2, Math.max(0.8, 1 + 0.025 * d)) : 1;
    const raw = atk * (1 - Math.min(0.85, resist / 100)) - def;
    return Math.max(Math.floor(lvlA * 0.25) + 1, Math.floor(raw * eff));
}

// ---------------------------------------------------------------- monsters
export function monsterStats(m, lvl) {
    const boss = !!m.boss;
    const hp = Math.round((24 + lvl * 15) * m.hp);
    const atk = (6 + lvl * 3) * m.atk;
    return {
        hp,
        atk: [Math.round(atk * 0.85), Math.round(atk * 1.15)],
        def: Math.round((1 + lvl * 1.25) * (m.def ?? 1)),
        hit: Math.round(10 + lvl * 3.2),
        flee: Math.round(5 + lvl * 2.2 * (m.flee ?? 1)),
        crit: 2,
        xp: Math.round((12 + lvl * 7) * (1 + lvl * 0.1) * (boss ? 6 : Math.sqrt(m.hp))),
        gold: Math.round((2 + lvl * 1.6) * (boss ? 10 : 1)),
    };
}
