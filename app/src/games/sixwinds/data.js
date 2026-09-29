// Six Winds content. An archipelago RPG in the spirit of the old seafaring
// MMOs: a cabin boy grows into a class, then a second class; everyone can fish,
// cut wood, mine, pick herbs and salvage; ships carry you between islands.
// All names, places and lore here are our own.
//
// Lore: the sea is a board of basalt hexagons raised by the Six Winds. Long ago
// the Forerunners built great sluices to lock away the Seventh Wind, the storm
// with no name. The locks are leaking. The Admiralty and the free captains fight
// over the routes; the cartographers say the islands are turning. A cabin boy
// from Salt Wharf finds a hexagonal compass that lets them see the world from all
// six winds: that is why the view turns by sixty degrees.

export const STATS = { str: 'Сила', agi: 'Ловкость', acc: 'Точность', con: 'Стойкость', spr: 'Дух' };

// ---------------------------------------------------------------- classes
export const CLASSES = {
    novice: {
        name: 'Юнга', tier: 0, weapons: ['blade'], growth: {}, skills: ['strike', 'firstaid'], color: 0x3f95b8,
        next: ['swordsman', 'hunter', 'explorer', 'herbalist'], nextLevel: 8,
        desc: 'Сошёл на берег с сундуком и саблей. Всё ещё впереди.',
    },
    swordsman: {
        name: 'Мечник', tier: 1, weapons: ['blade', 'greatblade', 'dual'], growth: { str: 2, con: 2 }, skills: ['cleave', 'whirl', 'warcry', 'lunge'],
        next: ['boarder', 'duelist'], nextLevel: 20, color: 0xc9483e,
        desc: 'Ближний бой, крепкая шкура. Первым прыгает на чужую палубу.',
    },
    hunter: {
        name: 'Стрелок', tier: 1, weapons: ['bow'], growth: { acc: 2, agi: 2 }, skills: ['aimed', 'volley', 'leap', 'venom'],
        next: ['sniper'], nextLevel: 20, color: 0x6f9a4a,
        desc: 'Бьёт издалека и не любит, когда подходят близко.',
    },
    explorer: {
        name: 'Мореход', tier: 1, weapons: ['staff'], growth: { spr: 2, agi: 1, con: 1 }, skills: ['lash', 'tide', 'tailwind', 'whirlpool'],
        next: ['navigator'], nextLevel: 20, color: 0x3f95b8,
        desc: 'Говорит с водой и ветром. Корабль под ним идёт быстрее.',
    },
    herbalist: {
        name: 'Травница', tier: 1, weapons: ['censer', 'staff'], growth: { spr: 3, con: 1 }, skills: ['mend', 'thorns', 'bless', 'swarm'],
        next: ['tidepriest', 'sealer'], nextLevel: 20, color: 0xb07cd6,
        desc: 'Лечит раны, опутывает врагов лозой, выводит рои светлячков.',
    },
    boarder: { name: 'Абордажник', tier: 2, weapons: ['greatblade', 'blade'], growth: { str: 3, con: 2 }, skills: ['crush', 'fury'], color: 0xa0302a, desc: 'Двуручный тесак и оглушающий удар.' },
    duelist: { name: 'Дуэлянт', tier: 2, weapons: ['dual', 'blade'], growth: { str: 2, agi: 3 }, skills: ['bladestorm', 'evade'], color: 0xd8703a, desc: 'Два клинка, быстрые ноги.' },
    sniper: { name: 'Снайпер', tier: 2, weapons: ['bow'], growth: { acc: 3, agi: 2 }, skills: ['headshot', 'barrage'], color: 0x4f7a3a, desc: 'Один выстрел — одна цель.' },
    navigator: { name: 'Штурман', tier: 2, weapons: ['staff'], growth: { spr: 3, agi: 2 }, skills: ['storm', 'fog'], color: 0x2f6f9a, desc: 'Зовёт шторм и прячется в тумане.' },
    tidepriest: { name: 'Жрица приливов', tier: 2, weapons: ['censer', 'staff'], growth: { spr: 3, con: 2 }, skills: ['greatmend', 'tideshield'], color: 0x5fb8c8, desc: 'Великие исцеления и щит воды.' },
    sealer: { name: 'Печатник', tier: 2, weapons: ['censer', 'staff'], growth: { spr: 4, acc: 1 }, skills: ['weakseal', 'curse'], color: 0x7a4ab0, desc: 'Печати слабости и проклятия глубин.' },
};

// ---------------------------------------------------------------- skills
// kind: melee | ranged | magic (ranged, uses spirit) | aoe (around self) | area (at target)
//       self (buff) | heal | dash | back (leap away)
export const SKILLS = {
    strike: { name: 'Удар с плеча', kind: 'melee', mp: 5, cd: 5, range: 1.8, mult: 1.8, fx: 'slash', lvl: 1 },
    firstaid: { name: 'Перевязка', kind: 'heal', mp: 8, cd: 14, heal: 30, healSpr: 1.2, fx: 'heal', lvl: 3 },
    cleave: { name: 'Рассекающий удар', kind: 'melee', mp: 8, cd: 4, range: 1.8, mult: 2.2, fx: 'slash' },
    whirl: { name: 'Вихрь', kind: 'aoe', mp: 14, cd: 8, radius: 2.3, mult: 1.3, fx: 'whirl' },
    warcry: { name: 'Боевой клич', kind: 'self', mp: 12, cd: 25, buff: { atk: 0.3 }, dur: 12, fx: 'cry' },
    lunge: { name: 'Натиск', kind: 'dash', mp: 10, cd: 10, range: 7, mult: 1.6, fx: 'slash' },
    aimed: { name: 'Прицельный выстрел', kind: 'ranged', mp: 8, cd: 4, range: 10, mult: 2.4, fx: 'arrow' },
    volley: { name: 'Град стрел', kind: 'area', mp: 15, cd: 9, range: 10, radius: 2.5, mult: 1.2, fx: 'rain' },
    leap: { name: 'Отскок', kind: 'back', mp: 6, cd: 7, fx: 'leap' },
    venom: { name: 'Ядовитая стрела', kind: 'ranged', mp: 10, cd: 8, range: 10, mult: 0.8, dot: { mult: 0.45, ticks: 6 }, fx: 'arrow' },
    lash: { name: 'Водяной хлыст', kind: 'magic', mp: 7, cd: 3, range: 9, mult: 2.0, fx: 'water' },
    tide: { name: 'Прилив', kind: 'aoe', mp: 14, cd: 9, radius: 3, mult: 1.2, knock: 3, magic: true, fx: 'wave' },
    tailwind: { name: 'Попутный ветер', kind: 'self', mp: 10, cd: 22, buff: { speed: 0.4, haste: 0.2, ship: 0.5 }, dur: 15, fx: 'wind' },
    whirlpool: { name: 'Водоворот', kind: 'area', mp: 16, cd: 12, range: 9, radius: 2.5, mult: 0.9, pull: true, dot: { mult: 0.4, ticks: 5 }, magic: true, fx: 'whirlpool' },
    mend: { name: 'Лечение', kind: 'heal', mp: 10, cd: 5, heal: 25, healSpr: 2.2, fx: 'heal' },
    thorns: { name: 'Шипы лозы', kind: 'magic', mp: 10, cd: 8, range: 9, mult: 1.0, root: 3, fx: 'thorns' },
    bless: { name: 'Благословение', kind: 'self', mp: 14, cd: 20, buff: { regen: 0.03 }, dur: 10, fx: 'heal' },
    swarm: { name: 'Рой светлячков', kind: 'magic', mp: 12, cd: 7, range: 9, mult: 0.6, dot: { mult: 0.55, ticks: 6 }, fx: 'swarm' },
    crush: { name: 'Сокрушение', kind: 'melee', mp: 18, cd: 10, range: 2, mult: 2.8, stun: 2, fx: 'slam' },
    fury: { name: 'Ярость', kind: 'self', mp: 16, cd: 30, buff: { haste: 0.4 }, dur: 10, fx: 'cry' },
    bladestorm: { name: 'Вихрь клинков', kind: 'aoe', mp: 18, cd: 10, radius: 2.6, mult: 2.0, fx: 'whirl' },
    evade: { name: 'Уклонение', kind: 'self', mp: 12, cd: 25, buff: { dodge: 50 }, dur: 8, fx: 'wind' },
    headshot: { name: 'Выстрел в голову', kind: 'ranged', mp: 16, cd: 12, range: 12, mult: 4, fx: 'arrow' },
    barrage: { name: 'Шквал', kind: 'ranged', mp: 18, cd: 14, range: 10, mult: 0.8, hits: 5, fx: 'arrow' },
    storm: { name: 'Шторм', kind: 'area', mp: 22, cd: 14, range: 10, radius: 3.5, mult: 2.2, magic: true, fx: 'storm' },
    fog: { name: 'Туман', kind: 'self', mp: 15, cd: 30, buff: { hidden: 1 }, dur: 6, fx: 'fog' },
    greatmend: { name: 'Великое исцеление', kind: 'heal', mp: 24, cd: 20, healPct: 0.6, fx: 'heal' },
    tideshield: { name: 'Щит прилива', kind: 'self', mp: 18, cd: 25, buff: { shield: 50, shieldSpr: 3 }, dur: 12, fx: 'shield' },
    weakseal: { name: 'Печать слабости', kind: 'magic', mp: 14, cd: 12, range: 9, mult: 0.8, weaken: 0.4, dur: 10, fx: 'seal' },
    curse: { name: 'Проклятие глубин', kind: 'area', mp: 20, cd: 14, range: 9, radius: 3, mult: 0.5, dot: { mult: 0.5, ticks: 6 }, magic: true, fx: 'curse' },
};

// ---------------------------------------------------------------- items
// slot: weapon | armor | ring | use | mat | quest | tool ; type for weapons
export const ITEMS = {
    // weapons
    rusty_saber: { name: 'Ржавая сабля', slot: 'weapon', type: 'blade', lvl: 1, atk: 6, speed: 1.0, price: 10 },
    boarding_saber: { name: 'Абордажная сабля', slot: 'weapon', type: 'blade', lvl: 6, atk: 14, speed: 1.0, price: 60 },
    sea_broadsword: { name: 'Морской палаш', slot: 'weapon', type: 'blade', lvl: 12, atk: 25, speed: 1.0, price: 180 },
    tide_blade: { name: 'Клинок прилива', slot: 'weapon', type: 'blade', lvl: 16, atk: 34, speed: 0.95, rare: 1, bonus: { str: 3, agi: 2 }, price: 420 },
    cleaver: { name: 'Двуручный тесак', slot: 'weapon', type: 'greatblade', lvl: 20, atk: 50, speed: 1.35, price: 600 },
    twin_dirks: { name: 'Парные кортики', slot: 'weapon', type: 'dual', lvl: 20, atk: 38, speed: 0.7, price: 600 },
    short_bow: { name: 'Короткий лук', slot: 'weapon', type: 'bow', lvl: 8, atk: 13, speed: 1.1, range: 9, price: 70 },
    whalebone_bow: { name: 'Лук из китового уса', slot: 'weapon', type: 'bow', lvl: 12, atk: 23, speed: 1.1, range: 10, price: 200 },
    bosun_crossbow: { name: 'Арбалет боцмана', slot: 'weapon', type: 'bow', lvl: 17, atk: 36, speed: 1.2, range: 11, rare: 1, bonus: { acc: 4 }, price: 460 },
    tide_rod: { name: 'Жезл прилива', slot: 'weapon', type: 'staff', lvl: 8, atk: 7, matk: 14, speed: 1.1, range: 8, price: 70 },
    coral_rod: { name: 'Коралловый жезл', slot: 'weapon', type: 'staff', lvl: 13, atk: 10, matk: 26, speed: 1.1, range: 8, price: 220 },
    herb_censer: { name: 'Кадило трав', slot: 'weapon', type: 'censer', lvl: 8, atk: 6, matk: 13, speed: 1.1, range: 7, price: 70 },
    pearl_censer: { name: 'Жемчужное кадило', slot: 'weapon', type: 'censer', lvl: 14, atk: 9, matk: 27, speed: 1.1, range: 7, rare: 1, bonus: { spr: 4 }, price: 480 },
    // armour
    canvas_jacket: { name: 'Парусиновая куртка', slot: 'armor', lvl: 1, def: 3, price: 12 },
    leather_vest: { name: 'Кожаный жилет', slot: 'armor', lvl: 6, def: 8, price: 70 },
    brigandine: { name: 'Бригантина', slot: 'armor', lvl: 12, def: 15, price: 220 },
    admiral_coat: { name: 'Мундир Адмиралтейства', slot: 'armor', lvl: 17, def: 22, rare: 1, bonus: { con: 4 }, price: 520 },
    // rings
    shell_ring: { name: 'Кольцо из ракушки', slot: 'ring', lvl: 3, bonus: { con: 2 }, price: 40 },
    wind_ring: { name: 'Кольцо попутного ветра', slot: 'ring', lvl: 10, bonus: { agi: 3, acc: 2 }, rare: 1, price: 260 },
    pearl_ring: { name: 'Жемчужное кольцо', slot: 'ring', lvl: 10, bonus: { spr: 4 }, rare: 1, price: 260 },
    // consumables
    potion_s: { name: 'Малое зелье здоровья', slot: 'use', heal: 60, price: 8, stack: true },
    potion_m: { name: 'Зелье здоровья', slot: 'use', heal: 160, price: 22, stack: true },
    mana_s: { name: 'Зелье духа', slot: 'use', mana: 50, price: 10, stack: true },
    fish_soup: { name: 'Уха', slot: 'use', food: { regen: 0.02, dur: 60 }, price: 14, stack: true },
    grilled_eel: { name: 'Угорь на углях', slot: 'use', food: { atk: 0.12, dur: 90 }, price: 20, stack: true },
    repair_kit: { name: 'Ремкомплект', slot: 'use', hull: 60, price: 18, stack: true },
    // materials
    log: { name: 'Бревно', slot: 'mat', price: 3, stack: true },
    ore: { name: 'Медная руда', slot: 'mat', price: 4, stack: true },
    iron_ore: { name: 'Железная руда', slot: 'mat', price: 7, stack: true },
    herb: { name: 'Солёная полынь', slot: 'mat', price: 3, stack: true },
    alga: { name: 'Синие водоросли', slot: 'mat', price: 3, stack: true },
    sardine: { name: 'Сардина', slot: 'mat', price: 3, stack: true, fish: true },
    mackerel: { name: 'Скумбрия', slot: 'mat', price: 6, stack: true, fish: true },
    eel: { name: 'Угорь', slot: 'mat', price: 9, stack: true, fish: true },
    tuna: { name: 'Тунец', slot: 'mat', price: 14, stack: true, fish: true },
    flask: { name: 'Пустая фляга', slot: 'mat', price: 2, stack: true },
    carapace: { name: 'Панцирь краба', slot: 'mat', price: 4, stack: true },
    tusk: { name: 'Кабаний клык', slot: 'mat', price: 6, stack: true },
    gear: { name: 'Шестерня Предтеч', slot: 'mat', price: 12, stack: true },
    scrap: { name: 'Корабельный лом', slot: 'mat', price: 5, stack: true },
    pearl: { name: 'Жемчужина', slot: 'mat', price: 30, stack: true },
    planks: { name: 'Корабельные доски', slot: 'mat', price: 14, stack: true },
    whetstone: { name: 'Точильный камень', slot: 'mat', price: 25, stack: true },
    plate: { name: 'Латунная пластина', slot: 'mat', price: 25, stack: true },
    wool: { name: 'Клок шерсти', slot: 'mat', price: 3, stack: true },
    chitin: { name: 'Хитин скорпиона', slot: 'mat', price: 7, stack: true },
    cactus_flesh: { name: 'Мякоть кактуса', slot: 'mat', price: 5, stack: true },
    fur: { name: 'Мех', slot: 'mat', price: 8, stack: true },
    ice_shard: { name: 'Осколок льда', slot: 'mat', price: 9, stack: true },
    fish_oil: { name: 'Рыбий жир', slot: 'mat', price: 6, stack: true },
    scale: { name: 'Чешуя трясинника', slot: 'mat', price: 8, stack: true },
    feather: { name: 'Яркое перо', slot: 'mat', price: 6, stack: true },
    ember: { name: 'Тлеющий уголь', slot: 'mat', price: 12, stack: true },
    // quest things
    parcel: { name: 'Посылка для картографа', slot: 'quest' },
    gull_feather: { name: 'Перо чайки', slot: 'quest', stack: true },
    chart: { name: 'Похищенная карта', slot: 'quest', stack: true },
    wind_seal: { name: 'Печать Западного ветра', slot: 'quest' },
    heart_gear: { name: 'Сердце автоматона', slot: 'quest', stack: true },
};
export const RARITY = ['#e9e2cf', '#7fc4ff', '#c79bff'];

// ---------------------------------------------------------------- professions
export const PROFS = {
    fishing: { name: 'Рыбалка', verb: 'рыбачить' },
    wood: { name: 'Лесоруб', verb: 'рубить' },
    mining: { name: 'Рудокоп', verb: 'добывать' },
    herbs: { name: 'Травник', verb: 'собирать' },
    salvage: { name: 'Поиск обломков', verb: 'нырять за обломками' },
    craft: { name: 'Ремесло', verb: 'мастерить' },
};
// nodes in the world: what each gives and how long it takes at level 1
export const NODES = {
    tree: { prof: 'wood', item: 'log', time: 2.4, respawn: 45, name: 'Дерево' },
    palm: { prof: 'wood', item: 'log', time: 2.0, respawn: 45, name: 'Пальма' },
    copper: { prof: 'mining', item: 'ore', time: 2.6, respawn: 50, name: 'Медная жила' },
    iron: { prof: 'mining', item: 'iron_ore', time: 3.2, respawn: 60, lvl: 3, name: 'Железная жила' },
    herbbush: { prof: 'herbs', item: 'herb', time: 1.6, respawn: 40, name: 'Солёная полынь' },
    algae: { prof: 'herbs', item: 'alga', time: 1.6, respawn: 40, name: 'Водоросли' },
    wreck: { prof: 'salvage', item: 'scrap', time: 3.0, respawn: 70, extra: [['pearl', 0.15], ['gear', 0.1]], name: 'Обломки' },
    fishspot: { prof: 'fishing', time: 0, respawn: 20, name: 'Косяк рыбы' },
};
// what bites where, by fishing level
export const FISH = [['sardine', 0, 5], ['mackerel', 2, 4], ['eel', 4, 3], ['tuna', 6, 2]];

export const RECIPES = {
    potion_s: { station: 'alchemy', needs: [['herb', 2], ['flask', 1]], lvl: 1, out: 1 },
    potion_m: { station: 'alchemy', needs: [['herb', 3], ['alga', 1], ['flask', 1]], lvl: 4, out: 1 },
    mana_s: { station: 'alchemy', needs: [['alga', 2], ['flask', 1]], lvl: 1, out: 1 },
    fish_soup: { station: 'stove', needs: [['sardine', 2]], lvl: 1, out: 1 },
    grilled_eel: { station: 'stove', needs: [['eel', 1], ['log', 1]], lvl: 3, out: 1 },
    whetstone: { station: 'forge', needs: [['ore', 3]], lvl: 1, out: 1 },
    plate: { station: 'forge', needs: [['iron_ore', 2], ['ore', 1]], lvl: 3, out: 1 },
    planks: { station: 'forge', needs: [['log', 3]], lvl: 1, out: 1 },
    repair_kit: { station: 'forge', needs: [['planks', 1], ['scrap', 1]], lvl: 2, out: 2 },
};
export const STATIONS = { alchemy: 'Алхимический стол', stove: 'Очаг', forge: 'Кузня' };

// ---------------------------------------------------------------- creatures
// temper: passive (only fights back), aggressive, timid ; lvl range ; stat multipliers
export const MONSTERS = {
    gull: { name: 'Чайка-воришка', temper: 'timid', model: 'gull', hp: 0.5, atk: 0.4, speed: 3.2, loot: [['gull_feather', 0.6]], color: 0xf2f2ee },
    crab: { name: 'Прибрежный краб', temper: 'passive', model: 'crab', hp: 0.9, atk: 0.8, speed: 1.8, loot: [['carapace', 0.5]], color: 0xd8603f },
    boar: { name: 'Дикий кабан', temper: 'aggressive', aggro: 5, model: 'boar', hp: 1.1, atk: 1.0, speed: 3.3, loot: [['tusk', 0.45]], color: 0x7a5a48 },
    bandit: { name: 'Береговой разбойник', temper: 'aggressive', aggro: 6, model: 'human', hp: 1.2, atk: 1.1, speed: 3.0, loot: [['chart', 0], ['potion_s', 0.15]], color: 0x8a4a3a, gear: 'saber' },
    rat: { name: 'Канальная крыса', temper: 'aggressive', aggro: 5, model: 'rat', hp: 0.8, atk: 0.9, speed: 3.4, loot: [['alga', 0.3]], color: 0x7a6a5e },
    thief: { name: 'Вор каналов', temper: 'aggressive', aggro: 6, model: 'human', hp: 1.1, atk: 1.2, speed: 3.4, loot: [['chart', 0.4], ['potion_s', 0.12]], color: 0x3a4a5a, gear: 'dagger' },
    coralgolem: { name: 'Коралловый голем', temper: 'passive', model: 'golem', hp: 1.8, atk: 1.1, speed: 1.4, loot: [['pearl', 0.12], ['alga', 0.5]], color: 0xe8837a },
    rockcrab: { name: 'Каменный краб', temper: 'aggressive', aggro: 4, model: 'crab', hp: 1.5, atk: 1.0, speed: 1.6, loot: [['ore', 0.5], ['iron_ore', 0.2]], color: 0x8a8680 },
    automaton: { name: 'Автоматон Предтеч', temper: 'aggressive', aggro: 6, model: 'automaton', hp: 1.5, atk: 1.2, speed: 2.4, loot: [['gear', 0.5], ['heart_gear', 0.35]], color: 0xa8b0aa },
    sentinel: { name: 'Часовой шлюза', temper: 'aggressive', aggro: 9, model: 'sentinel', ranged: 8, hp: 1.1, atk: 1.3, speed: 1.8, loot: [['gear', 0.6]], color: 0x9ab0b8 },
    warden: { name: 'Страж Шлюза', temper: 'aggressive', aggro: 9, leash: 12, model: 'warden', hp: 14, atk: 2.2, speed: 2.2, boss: true, loot: [['wind_seal', 1], ['tide_blade', 0.5], ['pearl', 1]], color: 0x7fa8a0 },
    serpent: { name: 'Морской змей', temper: 'aggressive', aggro: 8, model: 'serpent', sea: true, hp: 1.6, atk: 1.3, speed: 4.2, loot: [['pearl', 0.2], ['eel', 0.6]], color: 0x3f7a6a },
    lamb: { name: 'Кудрявый ягнёнок', temper: 'timid', model: 'quad', wool: true, snout: false, size: 0.8, hp: 0.7, atk: 0.4, speed: 2.6, loot: [['wool', 0.6]], color: 0xefe8d8, accent: 0x3a3530 },
    scorpion: { name: 'Песчаный скорпион', temper: 'aggressive', aggro: 5, model: 'scorpion', hp: 1.1, atk: 1.1, speed: 3.0, loot: [['chitin', 0.5]], color: 0xc98a4a },
    cactoid: { name: 'Колючий кактоид', temper: 'passive', model: 'toad', hp: 1.4, atk: 0.9, speed: 1.4, loot: [['cactus_flesh', 0.6]], color: 0x5f9a55, accent: 0x4a7a44 },
    sandbandit: { name: 'Песчаный разбойник', temper: 'aggressive', aggro: 6, model: 'human', hp: 1.2, atk: 1.2, speed: 3.1, loot: [['potion_m', 0.12], ['ore', 0.3]], color: 0xd0a060, gear: 'saber', hat: 'scarf', hatColor: 0xe6d6b0 },
    mummy: { name: 'Страж песков', temper: 'aggressive', aggro: 6, model: 'bonehuman', hp: 1.6, atk: 1.2, speed: 2.2, loot: [['pearl', 0.08], ['gear', 0.3]], color: 0xd8cca8, skin: 0xd8cca8, hat: 'scarf', hatColor: 0xd8cca8 },
    wolf: { name: 'Снежный волк', temper: 'aggressive', aggro: 7, model: 'quad', hp: 1.1, atk: 1.2, speed: 3.8, loot: [['fur', 0.5]], color: 0xc8d0d6, accent: 0x8a949c },
    snowman: { name: 'Злой снеговик', temper: 'passive', model: 'snowman', hp: 1.6, atk: 1.0, speed: 1.6, loot: [['ice_shard', 0.5]], color: 0xc9483e },
    penguin: { name: 'Королевский пингвин', temper: 'timid', model: 'penguin', hp: 0.9, atk: 0.6, speed: 2.4, loot: [['fish_oil', 0.5]], color: 0x2a2f38 },
    toad: { name: 'Болотная жаба', temper: 'passive', model: 'toad', hp: 1.2, atk: 0.9, speed: 2.0, loot: [['alga', 0.5]], color: 0x7a8a45, accent: 0x6a7a3a },
    lurker: { name: 'Трясинник', temper: 'aggressive', aggro: 5, model: 'lizard', hp: 1.3, atk: 1.2, speed: 2.8, loot: [['scale', 0.5]], color: 0x5f7a4a, accent: 0x4a6a3a },
    wisp: { name: 'Блуждающий огонёк', temper: 'aggressive', aggro: 8, model: 'wisp', ranged: 8, hp: 0.8, atk: 1.2, speed: 2.4, loot: [['mana_s', 0.3]], color: 0x9ff0ff },
    panther: { name: 'Чёрная пантера', temper: 'aggressive', aggro: 6, model: 'quad', ears: true, hp: 1.1, atk: 1.3, speed: 4.2, loot: [['fur', 0.4]], color: 0x2f3338, accent: 0x23262a, glow: 0.6 },
    parrot: { name: 'Попугай-крикун', temper: 'timid', model: 'bird', hp: 0.6, atk: 0.5, speed: 3.4, loot: [['feather', 0.6]], color: 0xe0452e, accent: 0x3f95b8 },
    embergolem: { name: 'Угольный голем', temper: 'aggressive', aggro: 6, model: 'golem', hp: 1.9, atk: 1.3, speed: 1.6, loot: [['iron_ore', 0.5], ['ember', 0.4]], color: 0x4a4d54 },
    skeleton: { name: 'Мёртвый страж', temper: 'aggressive', aggro: 6, model: 'bonehuman', hp: 1.2, atk: 1.2, speed: 2.6, loot: [['scrap', 0.4]], color: 0x5a5f68, skin: 0xefe8d8, hat: 'helmet' },
    golem: { name: 'Каменный голем', temper: 'passive', model: 'golem', hp: 2.0, atk: 1.1, speed: 1.4, loot: [['ore', 0.5], ['iron_ore', 0.2]], color: 0x9c978e },
    pirate: { name: 'Пиратский шлюп', temper: 'aggressive', aggro: 10, model: 'pirateship', sea: true, ranged: 9, hp: 2.2, atk: 1.2, speed: 4.6, loot: [['scrap', 1], ['planks', 0.4], ['potion_m', 0.2]], color: 0x2a2a30 },
};

// stats of a monster of a given level
export function monsterStats(kind, lvl) {
    const m = MONSTERS[kind];
    return {
        hp: Math.round((34 + lvl * 24) * m.hp),
        atk: Math.round((7 + lvl * 4.4) * m.atk),
        def: Math.round(lvl * 1.9),
        hit: 78 + lvl * 1.6,
        dodge: lvl * 1.1,
        xp: Math.round((12 + lvl * 11) * (m.boss ? 6 : Math.sqrt(m.hp))),
        gold: Math.round((2 + lvl * 1.4) * (m.boss ? 10 : 1)),
    };
}

// ---------------------------------------------------------------- people
export const NPCS = {
    gart: { name: 'Боцман Гарт', role: 'harbor', color: 0x3f6f8a, hat: 'cap', line: 'Море не любит суеты, юнга. А я не люблю крабов на моём причале.' },
    mira: { name: 'Картограф Мира', role: 'quest', color: 0x8a6ab0, hat: 'scarf', line: 'Острова двигаются. Не смейся — я это меряю.' },
    vela: { name: 'Капитан Вела', role: 'classmaster', color: 0xc9483e, hat: 'tricorn', line: 'Меч, лук, волна или трава — выбирай, кем станешь, когда подрастёшь.' },
    brun: { name: 'Кузнец Брун', role: 'shop', shop: 'weapons', station: 'forge', color: 0x6a4a3a, hat: 'none', line: 'Тупой клинок — это просто тяжёлая палка.' },
    tisa: { name: 'Лавочница Тиса', role: 'shop', shop: 'general', station: 'alchemy', prof: 'herbs', color: 0x4f9e9e, hat: 'scarf', line: 'Зелья, фляги, травы. Всё, что держит на плаву.' },
    olya: { name: 'Портная Оля', role: 'shop', shop: 'armor', color: 0xe0a94e, hat: 'none', line: 'Парусина — это не одежда. Это обещание одежды.' },
    som: { name: 'Рыбак Сом', role: 'trainer', prof: 'fishing', color: 0x5a7a8a, hat: 'straw', line: 'Удочку держи легко. Рыба чувствует страх.' },
    yar: { name: 'Лесоруб Ярь', role: 'trainer', prof: 'wood', color: 0x6f8a4a, hat: 'none', line: 'Руби пальму под корень — вырастет новая.' },
    martin: { name: 'Кок Мартин', role: 'quest', station: 'stove', color: 0xf0e8d8, hat: 'chef', line: 'Уха — это рыба, которая сдалась.' },
    grah: { name: 'Рудокоп Грах', role: 'trainer', prof: 'mining', color: 0x7a6a5a, hat: 'helmet', line: 'Скала помнит, как её поднимали ветра.' },
    cyrus: { name: 'Адмирал Сайрус', role: 'classmaster2', color: 0x2f4f7a, hat: 'bicorne', line: 'Адмиралтейство видит всё. Кроме того, что происходит в каналах.' },
    lucca: { name: 'Смотритель Лукка', role: 'quest', color: 0x4a6a8a, hat: 'cap', line: 'Каналы полны воров, а мои сапоги — воды.' },
    laura: { name: 'Алхимик Лаура', role: 'shop', shop: 'alchemy', station: 'alchemy', color: 0x9a5ac8, hat: 'none', line: 'Всё, что светится, можно выпить. Один раз.' },
    julia: { name: 'Торговка Джулия', role: 'shop', shop: 'city', color: 0xd8503f, hat: 'scarf', line: 'В Лазури товар дороже, зато честнее.' },
    tomas: { name: 'Корабел Томас', role: 'shipwright', color: 0x8a6446, hat: 'straw', line: 'Шлюп — это лодка с амбициями.' },
    hermit: { name: 'Отшельник Предтеч', role: 'quest', color: 0x9ab0a8, hat: 'hood', line: 'Они строили шлюзы не для воды. Для ветра.' },
    diver: { name: 'Ныряльщица Нела', role: 'trainer', prof: 'salvage', color: 0x3fb0a6, hat: 'none', line: 'На дне «Бездны» лежит больше, чем в любом сундуке.' },
};

export const SHOPS = {
    weapons: ['rusty_saber', 'boarding_saber', 'short_bow', 'tide_rod', 'herb_censer', 'sea_broadsword', 'whetstone'],
    general: ['potion_s', 'mana_s', 'flask', 'fish_soup', 'repair_kit', 'herb'],
    armor: ['canvas_jacket', 'leather_vest', 'shell_ring'],
    alchemy: ['potion_s', 'potion_m', 'mana_s', 'flask', 'alga'],
    city: ['sea_broadsword', 'whalebone_bow', 'coral_rod', 'brigandine', 'potion_m', 'mana_s', 'cleaver', 'twin_dirks'],
};

// ---------------------------------------------------------------- quests
// type: kill | gather (have items) | deliver (bring item to someone) | talk | level | reach (island)
export const QUESTS = {
    crabs: { name: 'Юнга на берегу', giver: 'gart', type: 'kill', target: 'crab', count: 5, reward: { xp: 70, gold: 20, items: [['potion_s', 3]] }, next: 'parcel',
        text: 'Крабы опять лезут на пирсы. Покажи им, кто тут юнга, а кто закуска: пять штук на северном пляже.' },
    parcel: { name: 'Посылка для картографа', giver: 'gart', type: 'deliver', item: 'parcel', to: 'mira', reward: { xp: 60, gold: 15 }, next: 'feathers', give: [['parcel', 1]],
        text: 'Отнеси это Мире, картографу. Её дом — самый высокий на сваях, красный. Не открывай: там карты, а карты не любят ветра.' },
    feathers: { name: 'Шестигранный компас', giver: 'mira', type: 'gather', item: 'gull_feather', count: 3, reward: { xp: 90, gold: 20, compass: true }, next: 'boars',
        text: 'Компасу нужны перья чаек, чтобы стрелка чувствовала ветер. Три пера — и он твой. Чайки воруют рыбу на пирсах.' },
    boars: { name: 'Кабаны на холмах', giver: 'martin', type: 'kill', target: 'boar', count: 6, reward: { xp: 160, gold: 40, items: [['fish_soup', 3]] }, next: 'classes',
        text: 'Кабаны разрыли мой огород на холме. Шесть кабанов — и будет тебе уха до конца недели.' },
    classes: { name: 'Выбор пути', giver: 'vela', type: 'level', count: 8, reward: { xp: 0, gold: 30, classChoice: true }, next: 'boat',
        text: 'Дорасти до восьмого уровня и приходи. Я научу тебя тому, что выберешь: мечу, луку, волне или травам.' },
    boat: { name: 'Доски для шлюпки', giver: 'tomas', type: 'gather', item: 'log', count: 6, reward: { xp: 180, gold: 30, ship: true }, next: 'bandits',
        text: 'Хочешь своё судно? Шесть брёвен с пальм на холмах — и шлюп твой. Топор возьми у Яря.' },
    bandits: { name: 'Разбойники на мысе', giver: 'gart', type: 'kill', target: 'bandit', count: 6, reward: { xp: 320, gold: 60, items: [['leather_vest', 1]] }, next: 'voyage',
        text: 'На западном мысе засели разбойники. Шесть. Потом можно думать о дальнем плавании.' },
    voyage: { name: 'Первый рейс', giver: 'gart', type: 'talk', to: 'cyrus', reward: { xp: 260, gold: 50 }, next: 'thieves',
        text: 'Бери шлюп и иди на восток, к Лазури. Адмирал Сайрус давно ждёт кого-то вроде тебя.' },
    thieves: { name: 'Воры каналов', giver: 'lucca', type: 'kill', target: 'thief', count: 8, reward: { xp: 520, gold: 90, items: [['potion_m', 3]] }, next: 'charts',
        text: 'Воры прячутся в нижних каналах. Восемь — и я перестану вздрагивать от каждого всплеска.' },
    charts: { name: 'Похищенные карты', giver: 'cyrus', type: 'gather', item: 'chart', count: 3, reward: { xp: 600, gold: 120, items: [['wind_ring', 1]] }, next: 'sluices',
        text: 'Воры унесли карты Адмиралтейства. Три карты. На одной из них — путь к Шлюзам Предтеч.' },
    sluices: { name: 'Шлюзы Предтеч', giver: 'cyrus', type: 'talk', to: 'hermit', reward: { xp: 500, gold: 80 }, next: 'gears',
        text: 'Карта ведёт на юг, к серым шлюзам. Там живёт отшельник. Узнай, почему шторма стали злее.' },
    gears: { name: 'Сердца автоматонов', giver: 'hermit', type: 'gather', item: 'heart_gear', count: 4, reward: { xp: 900, gold: 150 }, next: 'warden',
        text: 'Автоматоны охраняют каналы шлюзов. Их сердца — ключ к нижней камере. Четыре сердца.' },
    warden: { name: 'Страж Шлюза', giver: 'hermit', type: 'kill', target: 'warden', count: 1, reward: { xp: 2000, gold: 400, items: [['pearl_ring', 1]] }, next: 'advance',
        text: 'В нижней камере стоит Страж. Он держит Печать Западного ветра. Если печать треснет — шторм вырвется. Забери её.' },
    advance: { name: 'Второй путь', giver: 'cyrus', type: 'level', count: 20, reward: { xp: 0, gold: 200, classChoice2: true },
        text: 'Двадцатый уровень, юнга. Тогда поговорим о настоящем ремесле.' },
    // side: professions
    fish: { name: 'Свежая рыба для кока', giver: 'martin', type: 'gather', item: 'sardine', count: 4, reward: { xp: 90, gold: 25, prof: ['fishing', 40] },
        text: 'Четыре сардины. Удочку возьми у Сома, косяки видно по пене у пирсов.' },
    herbs: { name: 'Полынь для лавки', giver: 'tisa', type: 'gather', item: 'herb', count: 5, reward: { xp: 80, gold: 25, items: [['flask', 4]], prof: ['herbs', 40] },
        text: 'Солёная полынь растёт на холмах. Пять пучков — и я научу тебя варить зелья.' },
    ore: { name: 'Руда для кузни', giver: 'brun', type: 'gather', item: 'ore', count: 5, reward: { xp: 120, gold: 35, items: [['whetstone', 1]], prof: ['mining', 40] },
        text: 'Медь выходит на скалах у маяка. Пять кусков — и точильный камень твой.' },
    salvage: { name: 'Сокровища «Бездны»', giver: 'diver', type: 'gather', item: 'scrap', count: 4, reward: { xp: 300, gold: 80, items: [['pearl', 1]], prof: ['salvage', 60] },
        text: 'Остов «Бездны» лежит к северу. Нырни к обломкам — четыре куска лома, и я покажу, где жемчуг.' },
};

// ---------------------------------------------------------------- islands
export const ISLANDS = {
    wharf: { name: 'Солёная Пристань', lvl: '1–9', desc: 'Посёлок на сваях: красные и бирюзовые дома, мостки, лодки. Здесь начинают все.' },
    azure: { name: 'Лазурь', lvl: '9–14', desc: 'Город каналов: каменные лестницы, арки, лодки и рыжие листья на воде.' },
    sluice: { name: 'Шлюзы Предтеч', lvl: '13–20', desc: 'Серые бетонные камеры с мятными огнями. Внизу спит Страж.' },
    reef: { name: 'Коралловая отмель', lvl: '10–14', desc: 'Мелководье, кораллы и големы из них.' },
    rock: { name: 'Скала Рудокопов', lvl: '5–9', desc: 'Голый камень, медь и каменные крабы.' },
    wreck: { name: 'Остов «Бездны»', lvl: '8–12', desc: 'Разбитый галеон на отмели. Под ним — обломки и жемчуг.' },
};

export const XP_TO = (lvl) => Math.floor(45 * Math.pow(lvl, 1.55));
export const POINTS_PER_LEVEL = 4;
