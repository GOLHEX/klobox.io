import React, { Component } from "react"
import * as THREE from "three";

const HEALPiX = (radius, detail) => {
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


	const geometry = new THREE.BufferGeometry();
	const verticesArray = [];
	const indicesArray = [];
	const uvsArray = [];

	const midpoints = [];

	const project = (v) => {
		v.normalize();
		v.index = verticesArray.push(v) - 1;
		return v;
	};

	const midpointUV = (uv1, uv2) => new THREE.Vector2().addVectors(uv1, uv2).divideScalar(2);

	const midpoint = (v1, v2) => {
		if (!midpoints[v1.index]) midpoints[v1.index] = [];
		if (!midpoints[v2.index]) midpoints[v2.index] = [];
		let mid = midpoints[v1.index][v2.index];
		if (mid === undefined) {
		  mid = project(new THREE.Vector3().addVectors(v1, v2).divideScalar(2));
		  midpoints[v1.index][v2.index] = midpoints[v2.index][v1.index] = mid;
		}
		return mid;
	};

	const makeFace = (v1, v2, v3, uv1, uv2, uv3, matIdx, detail) => {
		if (detail < 1) {
		  const face = [v1.index, v2.index, v3.index];
		  indicesArray.push(...face);
		  uvsArray.push(uv1, uv2, uv3);
		} else {
		  detail -= 1;
		  makeFace(v1, midpoint(v1, v2), midpoint(v1, v3), uv1, midpointUV(uv1, uv2), midpointUV(uv1, uv3), matIdx, detail);
		  makeFace(midpoint(v1, v2), v2, midpoint(v2, v3), midpointUV(uv1, uv2), uv2, midpointUV(uv2, uv3), matIdx, detail);
		  makeFace(midpoint(v1, v3), midpoint(v2, v3), v3, midpointUV(uv1, uv3), midpointUV(uv2, uv3), uv3, matIdx, detail);
		  makeFace(midpoint(v1, v2), midpoint(v2, v3), midpoint(v1, v3), midpointUV(uv1, uv2), midpointUV(uv2, uv3), midpointUV(uv1, uv3), matIdx, detail);
		}
	};

  // Инициализация вершин
  vertices.forEach(v => {
    project(new THREE.Vector3(v[0], v[1], v[2]));
  });

  // Создание треугольников
  faces.forEach((f, i) => {
    const uv = uvs[i].map(u => new THREE.Vector2(u[0], u[1]));
    makeFace(geometry.vertices[f[0]], geometry.vertices[f[1]], geometry.vertices[f[2]], uv[0], uv[1], uv[2], Math.floor(i / 2), detail);
  });

  geometry.setIndex(indicesArray);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verticesArray.flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvsArray.flat(), 2));

  geometry.computeVertexNormals();

  console.log(geometry);
};
