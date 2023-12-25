export class Hex {
    // Конструктор для создания шестиугольника
    constructor(q, r, s, orientation = "pointy") {
        // ... Инициализация q, r, s ...
        if (Math.round(q + r + s) !== 0) throw "q + r + s must be 0";
        this.q = q;
        this.r = r;
        this.s = s;
        this.orientation = orientation; // Добавляем ориентацию
    }

    // Вспомогательный метод для создания точки
    static Point(x, y) {
        return { x, y };
    }
    // Метод для получения углов шестиугольника
    getCornerPoints(hexSize) {
        let corners = [];
        for (let i = 0; i < 6; i++) {
            corners.push(this.getCornerPoint(hexSize, i));
        }
        return corners;
    }

    getCornerPoint(hexSize, i) {
        const angleDeg = 60 * i + (this.orientation === "flat" ? 0 : 30);
        const angleRad = Math.PI / 180 * angleDeg;
        const x = hexSize * Math.cos(angleRad);
        const y = hexSize * Math.sin(angleRad);
        return Hex.Point(x, y);
    }


    // Сложение координат двух шестиугольников
    add(b) {
        return new Hex(this.q + b.q, this.r + b.r, this.s + b.s);
    }

    // Вычитание координат двух шестиугольников
    subtract(b) {
        return new Hex(this.q - b.q, this.r - b.r, this.s - b.s);
    }

    // Масштабирование координат шестиугольника
    scale(k) {
        return new Hex(this.q * k, this.r * k, this.s * k);
    }

    // Ротация шестиугольника влево
    rotateLeft() {
        return new Hex(-this.s, -this.q, -this.r);
    }

    // Ротация шестиугольника вправо
    rotateRight() {
        return new Hex(-this.r, -this.s, -this.q);
    }

    // Вычисление расстояния до другого шестиугольника
    distance(b) {
        return (Math.abs(this.q - b.q) + Math.abs(this.r - b.r) + Math.abs(this.s - b.s)) / 2;
    }

    // Определение координат соседних шестиугольников
    static directions = [
        new Hex(+1, -1, 0), new Hex(+1, 0, -1), new Hex(0, +1, -1),
        new Hex(-1, +1, 0), new Hex(-1, 0, +1), new Hex(0, -1, +1)
    ];

    neighbor(direction) {
        return this.add(Hex.directions[direction]);
    }

    // Метод для преобразования координат сетки в двумерные координаты
    toPixel(hexSize) {
        const x = hexSize * Math.sqrt(3) * (this.q + this.r/2);
        const y = hexSize * 3/2 * this.r;
        return Hex.Point(x, y);
    }

    // Статический метод для создания шестиугольника из пиксельных координат
    static fromPixel(x, y, hexSize) {
        const q = (x * Math.sqrt(3)/3 - y / 3) / hexSize;
        const r = y * 2/3 / hexSize;
        const s = -q - r;
        return new Hex(q, r, s);
    }

    // Получение всех шести соседей
    neighbors() {
        const neighbors = [];
        for (let i = 0; i < 6; i++) {
            neighbors.push(this.neighbor(i));
        }
        return neighbors;
    }

    // Статический метод для создания шестиугольной карты
    static hexagon(radius) {
        let results = [];
        for (let q = -radius; q <= radius; q++) {
            const r1 = Math.max(-radius, -q - radius);
            const r2 = Math.min(radius, -q + radius);
            for (let r = r1; r <= r2; r++) {
                results.push(new Hex(q, r, -q - r));
            }
        }
        return results;
    }

    createMirrorCenters(N) {
        const centers = [];
        const baseCenter = new Hex(2 * N + 1, -N, -N - 1);
        // Добавляем базовый центр и его вращения
        centers.push(baseCenter);
        for (let i = 0; i < 5; i++) {
            centers.push(this.rotateRight(centers[i]));
        }
        return centers;
    }
    

    // Линейная интерполяция между двумя шестиугольниками
    //Линейная Интерполяция (Lerp): Метод lerp используется для нахождения промежуточных координат между двумя шестиугольниками, что может быть полезно для анимации или плавного перехода между позициями.
    static lerp(a, b, t) {
        return new Hex(a.q + (b.q - a.q) * t, a.r + (b.r - a.r) * t, a.s + (b.s - a.s) * t);
    }

    // Получение линии от текущего шестиугольника до другого
    //Получение Линии: Метод lineTo создает линию шестиугольников от текущего шестиугольника до другого, что полезно для визуализации путей или дорожек на сетке.
    lineTo(b) {
        const N = this.distance(b);
        const aNudge = new Hex(this.q + 1e-6, this.r + 1e-6, this.s - 2e-6);
        const bNudge = new Hex(b.q + 1e-6, b.r + 1e-6, b.s - 2e-6);
        const results = [];
        const step = 1.0 / Math.max(N, 1);
        for (let i = 0; i <= N; i++) {
            results.push(Hex.lerp(aNudge, bNudge, step * i).round());
        }
        return results;
    }

    // Округление координат до ближайшего целого
    //Округление Координат: Метод round округляет дробные координаты шестиугольника до ближайших целых, что необходимо при интерполяции или других вычислениях, где важна точность.  
    round() {
        let qi = Math.round(this.q);
        let ri = Math.round(this.r);
        let si = Math.round(this.s);
        const qDiff = Math.abs(qi - this.q);
        const rDiff = Math.abs(ri - this.r);
        const sDiff = Math.abs(si - this.s);
        if (qDiff > rDiff && qDiff > sDiff) {
            qi = -ri - si;
        } else if (rDiff > sDiff) {
            ri = -qi - si;
        } else {
            si = -qi - ri;
        }
        return new Hex(qi, ri, si);
    }

    // Получение диапазона шестиугольников в радиусе
    //Получение Диапазона: Метод range возвращает список шестиугольников в пределах определенного радиуса от заданного шестиугольника, что может быть использовано для определения зон влияния или видимости.
    static range(hex, radius) {
        let results = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = Math.max(-radius, -dx - radius); dy <= Math.min(radius, -dx + radius); dy++) {
                results.push(new Hex(hex.q + dx, hex.r + dy, hex.s - dx - dy));
            }
        }
        return results;
    }

    // Создание границы сетки определенного радиуса
    //Создание Границы Сетки: Метод borders создает границу вокруг центрального шестиугольника на определенном радиусе, что может быть полезно для визуализации периферийных зон карты.
    static borders(radius) {
        let results = [];
        let hex = new Hex(radius, 0, -radius);
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < radius; j++) {
                results.push(hex);
                hex = hex.neighbor(i);
            }
        }
        return results;
    }

    // Конвертация из кубических координат в координаты смещения
    //Конвертация Координат: Методы toOffsetCoord и fromOffsetCoord позволяют преобразовывать между кубическими координатами и координатами смещения. Это полезно, когда вы работаете с различными системами координат, например, при отображении шестиугольной сетки на двумерной плоскости.
    toOffsetCoord() {
        return { col: this.q, row: this.r + (this.q - (this.q & 1)) / 2 };
    }

    // Конвертация из координат смещения в кубические координаты
    static fromOffsetCoord(col, row) {
        return new Hex(col, row - (col - (col & 1)) / 2, -col - row + (col - (col & 1)) / 2);
    }

    // Создание круга из шестиугольников вокруг центра с заданным радиусом
    //Круг из Шестиугольников: Метод hexagonCircle создаёт круг из шестиугольников вокруг заданного центра. Это полезно для создания зон видимости или диапазонов действия на карте.
    static hexagonCircle(center, radius) {
        let results = [];
        let hex = center.add(Hex.directions[4].scale(radius));
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < radius; j++) {
                results.push(hex);
                hex = hex.neighbor(i);
            }
        }
        return results;
    }

    // Преобразование кубических координат в аксиальные
    //Преобразование Координат: Методы toAxial и fromAxial преобразуют между кубическими и аксиальными координатами. Эти методы полезны для работы с различными форматами координат.
    toAxial() {
        return { q: this.q, r: this.r };
    }

    // Преобразование аксиальных координат в кубические
    static fromAxial(q, r) {
        return new Hex(q, r, -q - r);
    }

    // Вычисление области, которая охватывается двумя радиусами
    //Вычисление Кольца: Метод ring создаёт область, ограниченную двумя радиусами. Это может быть использовано для визуализации зон, которые расширяются или сужаются от определённой точки.
    static ring(center, minRadius, maxRadius) {
        let results = [];
        for (let r = minRadius; r <= maxRadius; r++) {
            results = results.concat(Hex.hexagonCircle(center, r));
        }
        return results;
    }

    // Получение всех шестиугольников на линии между двумя шестиугольниками
    static line(a, b) {
        const N = a.distance(b);
        const results = [];
        const step = 1.0 / Math.max(N, 1);
        for (let i = 0; i <= N; i++) {
            results.push(Hex.lerp(a, b, step * i).round());
        }
        return results;
    }

    // Проверка, находится ли данный шестиугольник в пределах круга с центром center и радиусом radius
    isInCircle(center, radius) {
        return this.distance(center) <= radius;
    }

    // Получение смещенной копии шестиугольника
    offset(offsetQ, offsetR) {
        return new Hex(this.q + offsetQ, this.r + offsetR, this.s - offsetQ - offsetR);
    }

    // Преобразование шестиугольника в строку для удобства отладки и хранения
    toString() {
        return `Hex(q=${this.q}, r=${this.r}, s=${this.s})`;
    }

    // Проверка равенства текущего шестиугольника с другим
    equals(other) {
        return this.q === other.q && this.r === other.r && this.s === other.s;
    }

    // Получение всех шестиугольников вдоль периметра круга с заданным радиусом
    static perimeter(center, radius) {
        let results = [];
        let hex = center.add(Hex.directions[4].scale(radius));
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < radius; j++) {
                if (!results.some(h => h.equals(hex))) {
                    results.push(hex);
                }
                hex = hex.neighbor(i);
            }
        }
        return results;
    }

    // Получение координаты Z (для использования в трехмерном пространстве)
    getZ(hexSize) {
        return - (this.q + this.r) * hexSize;
    }

    // Преобразование шестиугольника в JSON
    toJSON() {
        return { q: this.q, r: this.r, s: this.s };
    }

    // Преобразование шестиугольника в ключ (например, для использования в качестве ключа в Map или объекте)
    toKey() {
        return `${this.q},${this.r},${this.s}`;
    }

    // Статический метод для преобразования ключа обратно в шестиугольник
    static fromKey(key) {
        const parts = key.split(',').map(Number);
        return new Hex(parts[0], parts[1], parts[2]);
    }

    // Получение всех шестиугольников вдоль пути между двумя точками
    static path(start, end) {
        const distance = start.distance(end);
        const path = [];
        for (let i = 0; i <= distance; i++) {
            path.push(Hex.lerp(start, end, 1.0 / distance * i).round());
        }
        return path;
    }

    // Получение соседей в определенном радиусе
    //Соседи в Радиусе: Метод neighborsInRange возвращает всех соседей шестиугольника в пределах заданного радиуса. Это полезно для определения зон влияния или доступных ходов в играх.
    neighborsInRange(radius) {
        let results = [];
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = Math.max(-radius, -dx - radius); dy <= Math.min(radius, -dx + radius); dy++) {
                results.push(new Hex(this.q + dx, this.r + dy, this.s - dx - dy));
            }
        }
        return results.filter(neighbor => this.distance(neighbor) <= radius);
    }

    // Проверка, лежит ли шестиугольник на границе определенного радиуса
    isOnBorder(center, radius) {
        return this.distance(center) === radius;
    }

    // Получение всех шестиугольников на пути, исключая начальный и конечный
    static pathExcludingEndpoints(start, end) {
        const path = Hex.path(start, end);
        return path.slice(1, path.length - 1);
    }

    // Статический метод для генерации шестиугольной карты с разными типами тайлов
    static generateMap(radius, tileTypes) {
        const map = new Map();
        for (const hex of Hex.hexagon(radius)) {
            const tileType = tileTypes[Math.floor(Math.random() * tileTypes.length)];
            map.set(hex.toKey(), tileType);
        }
        return map;
    }

    // Преобразование координат в строку (альтернативный формат)
    toCoordString() {
        return `(${this.q}, ${this.r}, ${this.s})`;
    }

    // Проверка, лежит ли шестиугольник внутри определенного радиуса
    isInsideRadius(center, radius) {
        return this.distance(center) < radius;
    }

    // Получение сектора карты в заданном направлении и радиусе
    static sector(center, direction, radius) {
        let results = [];
        let startHex = center.neighbor(direction).scale(radius);
        for (let i = 0; i < 6; i++) {
            let hex = startHex;
            for (let j = 0; j < radius; j++) {
                results.push(hex);
                hex = hex.neighbor(i);
            }
            startHex = startHex.neighbor((direction + 2) % 6);
        }
        return results;
    }

    // Получение случайного шестиугольника в заданном радиусе
    static randomHex(center, radius) {
        const q = center.q + Math.floor(Math.random() * (2 * radius + 1)) - radius;
        const r = center.r + Math.floor(Math.random() * (2 * radius + 1)) - radius;
        const s = -q - r;
        return new Hex(q, r, s);
    }

    // Получение всех шестиугольников, образующих пересечение двух кругов
    static intersection(circle1, circle2) {
        return circle1.filter(hex1 => circle2.some(hex2 => hex1.equals(hex2)));
    }

    // Вычисление центра масс для группы шестиугольников
    static centerOfMass(hexes) {
        let sumQ = 0, sumR = 0, sumS = 0;
        hexes.forEach(hex => {
            sumQ += hex.q;
            sumR += hex.r;
            sumS += hex.s;
        });
        const count = hexes.length;
        return new Hex(sumQ / count, sumR / count, sumS / count);
    }

    // Проверка наличия шестиугольника в массиве
    static isInList(hex, list) {
        return list.some(item => item.equals(hex));
    }

    // Создание шестиугольной "змейки" от одного шестиугольника к другому
    static snake(start, end, length) {
        let results = [start];
        let current = start;
        while (results.length < length && !current.equals(end)) {
            let neighbors = current.neighbors().filter(n => !Hex.isInList(n, results));
            let next = neighbors[0] || current; // выбираем первого соседа или остаемся на месте
            results.push(next);
            current = next;
        }
        return results;
    }

    // Вычисление области видимости из данной точки с заданными препятствиями
    static fieldOfView(center, radius, obstacles) {
        let visible = new Set();
        for (const direction of Hex.directions) {
            let current = center;
            for (let i = 0; i < radius; i++) {
                current = current.neighbor(direction);
                if (!Hex.isInList(current, obstacles)) {
                    visible.add(current.toKey());
                } else {
                    break;
                }
            }
        }
        return Array.from(visible).map(key => Hex.fromKey(key));
    }


    // Преобразование массива шестиугольников в множество для быстрого поиска
    static toSet(hexes) {
        const hexSet = new Set();
        hexes.forEach(hex => hexSet.add(hex.toKey()));
        return hexSet;
    }

    // Получение минимальной ограничивающей рамки для группы шестиугольников
    static boundingBox(hexes) {
        let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
        hexes.forEach(hex => {
            if (hex.q < minQ) minQ = hex.q;
            if (hex.q > maxQ) maxQ = hex.q;
            if (hex.r < minR) minR = hex.r;
            if (hex.r > maxR) maxR = hex.r;
        });
        return { minQ, maxQ, minR, maxR };
    }

    // Проверка, находится ли шестиугольник на пересечении двух множеств
    static isIntersection(hex, set1, set2) {
        return set1.has(hex.toKey()) && set2.has(hex.toKey());
    }

    // Вычисление разности двух множеств шестиугольников
    static difference(set1, set2) {
        const differenceSet = new Set();
        set1.forEach(key => {
            if (!set2.has(key)) {
                differenceSet.add(Hex.fromKey(key));
            }
        });
        return Array.from(differenceSet);
    }

    // Получение шестиугольников, формирующих границу между двумя множествами
    static boundary(set1, set2) {
        const boundarySet = new Set();
        set1.forEach(hexKey => {
            const hex = Hex.fromKey(hexKey);
            if (hex.neighbors().some(neighbor => set2.has(neighbor.toKey()))) {
                boundarySet.add(hex);
            }
        });
        return Array.from(boundarySet);
    }

    // Вычисление вектора направления от одного шестиугольника к другому
    directionTo(target) {
        const dx = target.q - this.q;
        const dy = target.r - this.r;
        const dz = target.s - this.s;
        return { dx, dy, dz };
    }

    // Определение, лежит ли шестиугольник на прямой линии между двумя другими
    isInlineWith(start, end) {
        const line = Hex.line(start, end);
        return line.some(hex => hex.equals(this));
    }

    // Создание сетки в форме прямоугольника
    static rectangularGrid(width, height) {
        let results = [];
        for (let r = 0; r < height; r++) {
            let rOffset = Math.floor(r / 2); // смещение для четных/нечетных рядов
            for (let q = -rOffset; q < width - rOffset; q++) {
                results.push(new Hex(q, r, -q - r));
            }
        }
        return results;
    }



}
