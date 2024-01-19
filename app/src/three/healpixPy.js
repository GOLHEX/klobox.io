import { forEach } from "lodash";
import * as THREE from "three";

export default class HEALPiX {
  constructor(radius, detail) {
    this.radius = 2;
    this.detail = 0;
    this.theta = Math.acos(1 / Math.sqrt(3));
    this.phi = Math.PI / 4.0;
    this.a = Math.sin(this.theta) * Math.cos(this.phi);
    this.b = Math.sin(this.theta) * Math.sin(this.phi);
    this.c = Math.cos(this.theta);
    this.geometry = new THREE.BufferGeometry();
    this.vertices = [];
    this.positions = [];
    this.faces = [];
    this.index = [];
    this.vertex = [];
    this.vertexies = [];
    this.material = null;
    this.mesh = null;
    this.createGeometry();
  }

  project(v) {
    //v.index = this.geometry.vertices.push(v) - 1;
    v = v.normalize().clone();
    v.index = this.vertices.push(v)  - 1;
    //v.index = (this.vertices.length / 3) - 1;
    return v
  }

  midpoint(index1, index2) {
    const v1 = new THREE.Vector3(this.vertices[index1 * 3], this.vertices[index1 * 3 + 1], this.vertices[index1 * 3 + 2]);
    const v2 = new THREE.Vector3(this.vertices[index2 * 3], this.vertices[index2 * 3 + 1], this.vertices[index2 * 3 + 2]);
    const mid = new THREE.Vector3(
      (v1.x + v2.x) / 2,
      (v1.y + v2.y) / 2,
      (v1.z + v2.z) / 2
    );
    return this.project(mid);
  }

  makeFace = (v1, v2, v3, matIdx, detail) => {
    if (detail < 1) {
        //console.log(v1, v2, v3);
      //this.faces.push(v1, v2, v3);
      this.index.push(v3.index, v2.index, v1.index);
      this.vertexies.push(v3.x*this.radius, v3.y*this.radius, v3.z*this.radius);
      this.vertexies.push(v2.x*this.radius, v2.y*this.radius, v2.z*this.radius);
      this.vertexies.push(v1.x*this.radius, v1.y*this.radius, v1.z*this.radius);
    } else {
      // ... (логика деления лица на меньшие части, как в вашем коде)
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
    // const vertices = [
    //     new THREE.Vector3(0, 1, 0),
    //     new THREE.Vector3(-this.a, this.b, this.c),
    //     new THREE.Vector3(this.a, this.b, this.c),
    //     new THREE.Vector3(this.a, this.b, -this.c),
    //     new THREE.Vector3(-this.a, this.b, -this.c),
    //     new THREE.Vector3(0, 0, 1),
    //     new THREE.Vector3(1, 0, 0),
    //     new THREE.Vector3(0, 0, -1),
    //     new THREE.Vector3(-1, 0, 0),
    //     new THREE.Vector3(-this.a, -this.b, this.c),
    //     new THREE.Vector3(this.a, -this.b, this.c),
    //     new THREE.Vector3(this.a, -this.b, -this.c),
    //     new THREE.Vector3(-this.a, -this.b, -this.c),
    //     new THREE.Vector3(0, -1, 0)
    // ];

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


      // Проекция вершин и заполнение this.vertices
    vertices.forEach((v, i) => {
        const pos = this.project(new THREE.Vector3(v[2], v[1], v[0]));
        console.log(pos);
        this.positions.push(pos.x*this.radius, pos.y*this.radius, pos.z*this.radius);
    });

    faces.forEach((f, i) => {
        this.makeFace(this.vertices[f[0]], this.vertices[f[1]], this.vertices[f[2]], Math.floor(i/2), this.detail);
        // this.makeFace(p1, p2, p3, this.detail);
    });
    this.geometry.setIndex(this.index);
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.vertices, 3));
    //this.geometry.setAttribute('vertices', new THREE.Float32BufferAttribute(this.vertexies, 3));
    
    this.geometry.computeVertexNormals();
    this.material = new THREE.MeshBasicMaterial({ color: 0xac7e22 });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    
    

    console.log(this.geometry);
    return this.geometry;
  }
}