import * as THREE from 'three';

class HealpixSphere {
  constructor(radius, detail) {
    this.geometry = this.createGeometry(radius, detail);
  }

  createGeometry(radius, detail) {
    const theta = Math.acos(1 / Math.sqrt(3));
    const phi = Math.PI / 4.0;
    const a = Math.sin(theta) * Math.cos(phi);
    const b = Math.sin(theta) * Math.sin(phi);
    const c = Math.cos(theta);


    const vertices =  [
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
      [1, 0, 0, 0, 1, 1], [0, 0, 0, 1, 1, 1],
      [1, 0, 0, 0, 1, 1], [0, 0, 0, 1, 1, 1],
      [1, 0, 0, 0, 1, 1], [0, 0, 0, 1, 1, 1],
      [1, 0, 0, 0, 1, 1], [0, 0, 0, 1, 1, 1],

      [1, 0, 0, 0, 0, 1], [1, 0, 0, 1, 1, 1],
      [1, 0, 0, 0, 0, 1], [1, 0, 0, 1, 1, 1],
      [1, 0, 0, 0, 0, 1], [1, 0, 0, 1, 1, 1],
      [1, 0, 0, 0, 0, 1], [1, 0, 0, 1, 1, 1],

      [1, 0, 0, 0, 1, 1], [0, 0, 0, 1, 1, 1],
      [1, 0, 0, 0, 1, 1], [0, 0, 0, 1, 1, 1],
      [1, 0, 0, 0, 1, 1], [0, 0, 0, 1, 1, 1],
      [1, 0, 0, 0, 1, 1], [0, 0, 0, 1, 1, 1]
    ];




    const geometry = new THREE.BufferGeometry();
    console.log(JSON.stringify(geometry));
    const positions = [];
    const normals = [];
    const uvsFlat = [];

    function project(v, faceIndex) {
      const normalizedV = v.normalize().clone();
      positions.push(normalizedV.x, normalizedV.y, normalizedV.z);
      normals.push(normalizedV.x, normalizedV.y, normalizedV.z);
      uvsFlat.push(...uvs[faceIndex]);
    }

    function makeFace(v1, v2, v3, faceIndex) {
      const index = positions.length / 3;
      project(v1, faceIndex);
      project(v2, faceIndex);
      project(v3, faceIndex);
      geometry.setIndex([index, index + 1, index + 2]);
      console.log(geometry);
    }

    for (let i = 0, l = vertices.length; i < l; i++) {
      const v = vertices[i];
      project(new THREE.Vector3(v[0], v[1], v[2]), i);
    }

    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      makeFace(
        new THREE.Vector3().fromArray(positions, f[0] * 3),
        new THREE.Vector3().fromArray(positions, f[1] * 3),
        new THREE.Vector3().fromArray(positions, f[2] * 3),
        i
      );
    }

    
    // apply radius
    // for (let i = 0, l = geometry.vertices.length; i < l; i++) {
    //   geometry.vertices[i].multiplyScalar(radius);
    // }



    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    //console.log(JSON.stringify(positions));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    //console.log(JSON.stringify(normals));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvsFlat, 2));
    console.log(JSON.stringify(geometry));

    //geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    return geometry;
  }
}

export default HealpixSphere;
