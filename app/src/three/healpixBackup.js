import { random } from "lodash";
import * as THREE from "three";

export default class HEALPiX {
    constructor(radius, detail) {
        this.radius = radius;
        this.detail = detail;
        this.theta = Math.acos(1 / Math.sqrt(3));
        this.phi = Math.PI / 4.0;
        this.a = Math.sin(this.theta) * Math.cos(this.phi);
        this.b = Math.sin(this.theta) * Math.sin(this.phi);
        this.c = Math.cos(this.theta);
        this.vertices = [
            [0, 1, 0],
            [-this.a, this.b, this.c], [this.a, this.b, this.c], [this.a, this.b, -this.c], [-this.a, this.b, -this.c],
            [0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0],
            [-this.a, -this.b, this.c], [this.a, -this.b, this.c], [this.a, -this.b, -this.c], [-this.a, -this.b, -this.c],
            [0, -1, 0]
            ];
        this.verticesSubdivided = []
        this.indices = [];
        this.uvs = [];
        this.uvw = [];
        this.positions = [];
        this.normals = [];
        this.uvsFlat = [];
        this.midpoints = [];
        this.positionAttribute = [];
        this.uv = [];
        this.colors = [
            [0x33D5C0, 0xE68D78],
            [0x932323, 0x434770],
            [0xCF9F6C, 0xFE4C04],
            [0x3F403B, 0xD93E31],
            [0x210038, 0xE06C50],
            [0x5C9B52, 0xD9C02E],
            [0xA8C65D, 0xF44085],
            [0xF94302, 0x44303B]
          ];
        this.shuffledColors = this.shuffle(this.colors.concat(this.colors)); // Дублируем массив и перемешиваем

        this.materials = [];

        for (let i = 0; i < 12; i++) {
            this.materials.push(new THREE.MeshBasicMaterial({ color: random(...this.shuffledColors[i]) }));
          }
          this.geometry = new THREE.BufferGeometry();
          this.geometry.vertices = [];
          this.geometry.name = 'HEALPiX';
        this.createGeometry();
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]]; // меняем местами элементы
        }
        return array;
    }

    project = (v) => {
        v = v.normalize().clone();
        v.index = this.geometry.vertices.push(v) - 1;
        //this.positions.push(v.x, v.y, v.z);
        //v = v.normalize().clone().multiplyScalar(this.radius);
        //this.positionAttribute.push(v.x, v.y, v.z);
        //this.geometry.setIndex(v.index);
        return v;
    }

    midpointUV(uv1, uv2) {
        return new THREE.Vector2().addVectors(uv1, uv2).divideScalar(2);
    }

    midpoint(v1, v2) {
        if (!this.midpoints[v1.index]) this.midpoints[v1.index] = [];
        if (!this.midpoints[v2.index]) this.midpoints[v2.index] = [];
        let mid = this.midpoints[v1.index][v2.index];
        if (mid === undefined) {
            // generate mid point and project to surface
            mid = this.project(new THREE.Vector3().addVectors(v1, v2).divideScalar(2));
            this.midpoints[v1.index][v2.index] = this.midpoints[v2.index][v1.index] = mid;
        }
        //console.log(mid);
        return mid;
    }


    makeFace = (v1, v2, v3, uv1, uv2, uv3, matIdx, detail) => {
        if (detail < 1) {
                    //let centroid = new THREE.Vector3().add(v1).add(v2).add(v3).divideScalar(3);

                    // Вычисление нормали
                    let normal = new THREE.Vector3().crossVectors(v2.clone().sub(v1), v3.clone().sub(v1)).normalize();


                    // Добавление нормали
                    this.normals.push(normal.x, normal.y, normal.z);
                    this.normals.push(normal.x, normal.y, normal.z);
                    this.normals.push(normal.x, normal.y, normal.z);
        
                    // Добавление индексов
                    this.indices.push(v1.index, v2.index, v3.index);
            
                    // Добавление UV-координат
                    this.uvsFlat.push(uv1.x, uv1.y);
                    this.uvsFlat.push(uv2.x, uv2.y);
                    this.uvsFlat.push(uv3.x, uv3.y);

                    this.verticesSubdivided.push(v1.x, v1.y, v1.z);
                    this.verticesSubdivided.push(v2.x, v2.y, v2.z);
                    this.verticesSubdivided.push(v3.x, v3.y, v3.z);

                    // Добавление групп материалов
                    if (this.materials.length > 1) {
                        this.geometry.addGroup(this.indices.length - 3, +3, matIdx);
                    }
            

        } else {
            //console.log("vertx: "+v1, v2, v3, "uvs: "+uv1, uv2, uv3, "matindex: "+matIdx);
            // split face into 4 smaller faces
            detail -= 1;
            this.makeFace(v1, this.midpoint(v1, v2), this.midpoint(v1, v3), uv1, this.midpointUV(uv1, uv2), this.midpointUV(uv1, uv3), matIdx, detail); // top quadrant
            this.makeFace(this.midpoint(v1, v2), v2, this.midpoint(v2, v3), this.midpointUV(uv1, uv2), uv2, this.midpointUV(uv2, uv3), matIdx, detail); // left quadrant
            this.makeFace(this.midpoint(v1, v3), this.midpoint(v2, v3), v3, this.midpointUV(uv1, uv3), this.midpointUV(uv2, uv3), uv3, matIdx, detail); // right quadrant
            this.makeFace(this.midpoint(v1, v2), this.midpoint(v2, v3), this.midpoint(v1, v3), this.midpointUV(uv1, uv2), this.midpointUV(uv2, uv3), this.midpointUV(uv1, uv3), matIdx, detail); // center quadrant
        }
    }
  
    createGeometry = () => {
        const theta = Math.acos(1 / Math.sqrt(3));
        const phi = Math.PI / 4.0;
        const a = Math.sin(theta) * Math.cos(phi);
        const b = Math.sin(theta) * Math.sin(phi);
        const c = Math.cos(theta);
        const vertices = [
            [0, 1, 0],
            [-a, b, c], [a, b, c], [a, b, -c], [-a, b, -c],
            [0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0],
            [-a, -b, c], [a, -b, c], [a, -b, -c], [-a, -b, -c],
            [0, -1, 0]
        ];

        const faces = [
            [0, 1, 2], [1, 5, 2],
            [0, 2, 3], [2, 6, 3],
            [0, 3, 4], [3, 7, 4],
            [0, 4, 1], [4, 8, 1],
            [1, 8, 9], [1, 9, 5],
            [2, 5, 10], [2, 10, 6],
            [3, 6, 11], [3, 11, 7],
            [4, 7, 12], [4, 12, 8],
            [5, 9, 10], [9, 13, 10],
            [6, 10, 11], [10, 13, 11],
            [7, 11, 12], [11, 13, 12],
            [8, 12, 9], [12, 13, 9]
        ];
        
        const uvs = [
            [[1, 0], [0, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [0, 1]], [[1, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [0, 1]], [[1, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [0, 1]], [[1, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [0, 1]], [[1, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]],
            [[1, 0], [0, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]]
        ];

        // Инициализация вершин
        vertices.forEach((v, i) => {
            //console.log(v);
            this.project(new THREE.Vector3(v[0], v[1], v[2]));
        });

        // subdivided faces
        faces.forEach((f, i) => {
            this.uv = uvs[i];
            for (let j = 0; j < 3; j++) {
                this.uv[j] = new THREE.Vector2(this.uv[j][0], this.uv[j][1]);
            }
            //this.uvw.push(this.uv[0], this.uv[1], this.uv[2]);
            this.makeFace(this.geometry.vertices[f[0]], this.geometry.vertices[f[1]], this.geometry.vertices[f[2]], this.uv[0], this.uv[1], this.uv[2], Math.floor(i/2), this.detail);
        });

        //this.geometry.setIndex(this.indices);
        //this.geometry.setAttribute('vertices', new THREE.Float32BufferAttribute(this.verticesSubdivided, 3));
        //this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.verticesSubdivided, 3));
        this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvsFlat, 2));

        this.geometry.computeVertexNormals();
        this.geometry.computeBoundingSphere();

        console.log(this.geometry);
    }
}