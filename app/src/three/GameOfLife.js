// frontend\src\three\GameOfLife.js
import React, { Component, useState } from 'react';

import * as THREE from 'three';
import W from "../wrapper/W.js"
import { MapControls, OrbitControls } from "./controls/OrbitControls.js";
import Stats from 'stats.js';
import { Hex , OffsetCoord} from "../three/hex/Hex.js";
import { GridHelper } from 'three';
import e from 'cors';
import { update } from 'lodash';


class GOL extends React.Component {
    constructor(props) {
        super(props);
        THREE.Object3D.DefaultUp = new THREE.Vector3(0,0,1);
        const scene = new THREE.Scene();
        this.container = React.createRef();
        const camera =  new THREE.PerspectiveCamera( 70, this.container.scrollWidth / this.container.scrollWidth, 0.01, 256 );
        //const camera =  new THREE.PerspectiveCamera( 70, this.container.scrollWidth / this.container.scrollWidth, 0.01, 256 );
        camera.position.y = 0;
        camera.position.z = 25;
        camera.position.x = 0;
        camera.layers.enable( 1 );
        camera.up.set(0,0,1);
        camera.updateMatrix();
        camera.updateProjectionMatrix();
        //camera.updateMatrixWorld();
        const renderer = new THREE.WebGLRenderer({alpha: false, antialias: false });
        this.camera = camera;
        this.clock = new THREE.Clock();
        //const controls = new MapControls( this.camera, renderer.domElement );
        const controls = new OrbitControls( this.camera, renderer.domElement );
        controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
        controls.dampingFactor = 0.25;
        controls.screenSpacePanning = false;
        controls.minDistance = 4;
        controls.maxDistance = 128;
        controls.enablePan = false;
        controls.maxPolarAngle = Math.PI / 2 - 0.9;

        controls.update();
        this.controls = controls;

        //this.population = 0;

        //his.initStartFied = [];
        //this.gridInit = [];
        this.gridGroup = new THREE.Group();
        this.labelsArray = [];
        //console.log(this.props.isGenocide);
        this.savedState = [];
        this.delay = 1;
        this.active = 0;
        this.state = {
            scene: scene,
            renderer: renderer,
            history: [],
            isLabeled: this.props.isLabeled || false,
            isLabeledTriggered: false,
            isPlay: this.props.isPlay || false,
            isGenocide: this.props.isGenocide || false,
            isGenocideTriggered: false,
            isCameraRot: this.props.isCameraRot || false,
            isCameraRotTriggered: false,
            isPopulate: this.props.isPopulate || false,
            isPopulateTriggered: false,
            currentPopulation: 0,
            previousPopulation: 0,
            isDrawing: false,
            lastPosition: {},
            clientWidth: 256,
            clientHeight: 256,
            mouse: {
                x:0,
                y:0
            },
            position: {
                x:0,
                y:0
            },
            hexSize:1.0,
            hexSize2D: 80,
            HexShapeCountRound: this.props.healpixProps.detail || 6,
            hexOrigin: {
                x: 0,
                y:0
            },
            cellsMap: [],
            lastPosition: {},
            round: 3,
            cd: 0x3498db
        };


        // Привязка методов
        this.updateScreenSize = this.updateScreenSize.bind(this);
        this.keyup = this.keyup.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        // ... другие методы
        this.saveCurrentState = this.saveCurrentState.bind(this);
        this.loadSavedState = this.loadSavedState.bind(this);
        // Инициализация состояния отображения меток
        this.labelsVisible = false;
        // Инициализация массива для хранения меток
        this.labels = [];

        let mixers = [];
        this.mixers = mixers;
        ///Raycaster
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        //let stats = new Stats();
        //this.stats = stats;
        //this.stats.showPanel( 0 ); // 0: fps, 1: ms, 2: mb, 3+: custom
        //document.body.appendChild( this.stats.dom );

        this.state.scene.background = new THREE.Color().set('#795548');
        this.state.scene.fog = new THREE.Fog( this.state.scene.background, 200, 1000 );
        // LIGHTS
        this.hemiLight = new THREE.HemisphereLight( 0xffffff, 0xffffff, 0.1 );
        this.hemiLight.color.setHSL( 0.6, 0.6, 1 );
        this.hemiLight.groundColor.setHSL( 0.095, 0.75, 1 );

        this.dirLight = new THREE.DirectionalLight( 0xffffff, 1 );
        this.dirLight.color.setHSL( 0.1, 1, 0.95 );
        this.dirLight.position.set( 3, 3, 3 );
        this.dirLight.position.multiplyScalar( 10 );
        this.state.scene.add( this.dirLight );
        this.dirLight.castShadow = false;
        this.dirLight.shadow.mapSize.width = 512;
        this.dirLight.shadow.mapSize.height = 512;
        this.shadowDistance = 1;
        this.dirLight.shadow.camera.left = -this.shadowDistance;
        this.dirLight.shadow.camera.right = this.shadowDistance;
        this.dirLight.shadow.camera.top = this.shadowDistance;
        this.dirLight.shadow.camera.bottom = -this.shadowDistance;
        this.dirLight.shadow.camera.far = 350;
        this.dirLight.shadow.bias = -0.00001;
        // this.dirLightHeper = new THREE.DirectionalLightHelper( this.dirLight, 1 );
        // this.state.scene.add( this.dirLightHeper );

        // SKYDOME
        this.vertexShader = document.getElementById( 'vertexShader' ).textContent;
        this.fragmentShader = document.getElementById( 'fragmentShader' ).textContent;
        this.uniforms = {
            topColor:    { value: new THREE.Color( 0x0077ff ) },
            bottomColor: { value: new THREE.Color( 0xE1F5FE ) },
            offset:      { value: -1 },
            exponent:    { value: 0.8 }
        };
        this.uniforms.topColor.value.copy( this.hemiLight.color );
        this.state.scene.fog.color.copy( this.uniforms.bottomColor.value );
        this.skyGeo = new THREE.SphereBufferGeometry( 1000, 32, 15 );
        this.skyGeo.rotateX(-Math.PI/2);

        this.skyMat = new THREE.ShaderMaterial( { vertexShader: this.vertexShader, fragmentShader: this.fragmentShader, uniforms: this.uniforms, side: THREE.BackSide } );
        this.sky = new THREE.Mesh( this.skyGeo, this.skyMat );
        this.sky.rotateX(-Math.PI/2);
        this.sky.name = 'SKYDOME';

        const axesHelper = new THREE.AxesHelper( 5 );
        axesHelper.position.set( 0.0001, 0.0001, 0.0001 );

        const GridHelper = new THREE.GridHelper (100,100);
        GridHelper.rotateX(-Math.PI/2);
        //this.state.scene.add( GridHelper );
        //console.log(Hex);
    }

    Point = (x, y) => {
        return {x: x, y: y}
    }

    Hex = (q, r) => {
        return {q: q, r: r}
    }

    Cube = (x, y, z) => {
        return {x: x, y: y, z: z}
    }

    flat_hex_corner = (center, i) => {
        var angle_deg = 60*i;
        var angle_rad = Math.PI/180*angle_deg;
        var x = center.x + this.state.hexSize * Math.cos(angle_rad);
        var y = center.y + this.state.hexSize * Math.sin(angle_rad);
        return this.Point(x, y)
    }

    pointy_hex_corner = (center, i) => {
        var angle_deg = 60*i-30;
        var angle_rad = Math.PI/180*angle_deg;
        var x = center.x + this.state.hexSize * Math.cos(angle_rad);
        var y = center.y + this.state.hexSize * Math.sin(angle_rad);
        return this.Point(x, y)
    }

    drawHex = (center) => {
        let cellPoints = []
        for(var i=0; i<=5; i++){
            var start = this.flat_hex_corner(center, i);
            cellPoints.push(new THREE.Vector2 (start.x, start.y));
        }
        return cellPoints
    }

    hexToPixel = (h) => {
        var hexOrigin = this.state.hexOrigin;
        var x = this.state.hexSize * Math.sqrt(3) * (h.q + h.r/2) + hexOrigin.x;
        var y = this.state.hexSize * 3/2 * h.r + hexOrigin.y;
        return this.Point(x, y)
    }

    pixelToHex = (p) => {
        var q = ((p.x - this.state.hexOrigin.x) * Math.sqrt(3)/3 - (p.y - this.state.hexOrigin.y)/ 3) / this.state.hexSize;
        var r = (p.y - this.state.hexOrigin.y) * 2/3 / this.state.hexSize;
        return this.hexRound(this.Hex(q, r))
    }

    cubeDir = (dir) => {
        var cubeDir = [ this.Cube(-1, 1, 0), this.Cube(0, 1, -1), this.Cube(1, 0, -1), this.Cube(1, -1, 0), this.Cube(0, -1, 1), this.Cube(-1, 0, 1) ];
        return cubeDir[dir];
    }

    cubeAdd = (a, b) => {
        return this.Cube(a.x + b.x, a.y + b.y, a.z + b.z)
    }

    cubeNeighbor = (c, dir) => {
        return this.cubeAdd(c, this.cubeDir(dir))
    }

    cubeToAxial = (c) => {
        var q = c.x;
        var r = c.z;
        return this.Hex(q, r)
    }

    axialToCube = (h) => {
        var x = h.q;
        var y = h.r;
        var z = -x-z;
        return this.Cube(x, y, z)
    }

    cube_to_oddr = (c) => {
        var q = c.x - (c.z - (c.z&1)) / 2;
        var r = c.z;
        return this.Hex(q, r)
    }

    oddr_to_cube = (h) => {
        var x = h.q + (h.r - (h.r&1)) / 2;
        var y = h.r;
        var z = -x-z;
        return this.Cube(x, y, z)
    }

    cube_to_oddq = (c) => {
        var q = c.q
        var r = c.r + (c.q - (c.q&1)) / 2;
        return this.OffsetCoord(q, r);
    }

    oddq_to_cube = (h) => {
        var q = h.q
        var r = h.r - (h.q - (h.q&1)) / 2;
        return this.Cube(q, r, -q-r);
    }

    hexRound = (h) => {
        return this.cubeRound(this.axialToCube(h));
    }

    cubeRound = (c) => {
        var rx = Math.round(c.x);
        var ry = Math.round(c.y);
        var rz = Math.round(c.z);

        var x_diff = Math.abs(rx - c.x);
        var y_diff = Math.abs(ry - c.y);
        var z_diff = Math.abs(rz - c.z);

        if (x_diff > y_diff && x_diff > z_diff){
            rx = -ry-rz;
        } else if (y_diff > z_diff){
            ry = -rx-rz;
        } else {
            rz = -rx-ry;
        }

        if(rx === -0){
            rx = 0;
        }
        if(ry === -0){
            ry = 0;
        }
        if(rz === -0){
            rz = 0;
        }
        return this.Cube(rx, ry, rz)
    }

    findNeighbors = (c) => {
        let neigbors = [];
        for(var i=0; i<6; i++){
            var cube = this.cubeNeighbor(this.Cube(c.coordinates.q, c.coordinates.r, c.coordinates.s), i);
            cube.q = cube.x;
            cube.r = cube.y;
            cube.s = cube.z;
            neigbors.push(cube)
        }
        return neigbors;
    }

    cubeDistance = (a, b) =>{
        return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) / 2;
    }

    lerp = (a, b, t) => {
        return a + (b - a) * t
    }

    lerpCube = (a, b, t) => {
        return this.Cube(this.lerp(a.x, b.x, t), this.lerp(a.y, b.y, t), this.lerp(a.z, b.z, t))
    }

    drawLineCube = (a, b) => {
        var N = this.cubeDistance(a, b);
        var results = [];
        for(var i =0; i<= N; i++){
            results.push(this.cubeRound(this.lerpCube(a, b, 1.0/N * i)));
        }
        return results
    }

    getHexParameters = () => {
        let hexHeight = this.state.hexSize * 2;
        let hexWidth = Math.sqrt(3)/2 * hexHeight;
        let vertDist = hexHeight * 3/4;
        let horizDist = hexWidth;
        return {hexWidth: hexWidth, hexHeight: hexHeight, vertDist: vertDist, horizDist: horizDist}
    }

    findActiveNeighbors = (cube) => {
        // Получаем всех соседей для данного шестиугольника
        const neighbors = this.findNeighbors(cube);
        //console.log(neighbors);
        // Фильтруем соседей, выбирая только активные
        const activeNeighbors = neighbors.filter(neighborCube => {
            // Находим шестиугольник с такими координатами в состоянии cellsMap
            const neighborCell = this.state.cellsMap.find(cell =>
                cell.cube.coordinates.q === neighborCube.q &&
                cell.cube.coordinates.r === neighborCube.r &&
                cell.cube.coordinates.s === neighborCube.s
            );
            return neighborCell && neighborCell.cube.state;
        });
    
        return activeNeighbors;
    };

    generateGradientMaterials = (startColor, endColor, numberOfMaterials) => {
        const materials = [];
      
        for (let i = 0; i < numberOfMaterials; i++) {
          // Вычисляем отношение текущего шага к общему количеству шагов
          const ratio = i / (numberOfMaterials - 1);
      
          // Создаем новый цвет, который является промежуточным между начальным и конечным
          const color = new THREE.Color(startColor).lerp(new THREE.Color(endColor), ratio);
      
          // Создаем материал с этим цветом
          materials.push(new THREE.MeshBasicMaterial({ color: color }));
        }
      
        return materials;
    }
 
    ///GPT FUNCTIONS
    updateLabelsToFaceUp = (labels) => {
        const up = new THREE.Vector3(0, 0, 1); // Вектор "верх" мира
        labels.forEach((label) => {
            label.quaternion.setFromUnitVectors(label.up, up);
        });
    };

    createTextSprite = (message, fontColor = '#ffffff', fontSize = 48) => {
        // Создаем элемент canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Устанавливаем размер канваса
        canvas.width = 64;  // Уменьшенный размер канваса
        canvas.height = 64; // Уменьшенный размер канваса

        // Настройка шрифта для отображения текста
        context.fillStyle = '#ffffff'; // Устанавливаем цвет шрифта
        context.font = `${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'upper';
        context.clearRect(0, 0, canvas.width, canvas.height); // Очистка канваса перед рисованием текста
        context.fillText(message, canvas.width / 2, canvas.height / 2);

        // Создаем текстуру из канваса
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true; // Обновляем текстуру

        // Создаем материал для спрайта с заданным цветом текста
        const material = new THREE.SpriteMaterial({ map: texture });

        // Создаем спрайт и масштабируем его
        const sprite = new THREE.Sprite(material);
        const scale = 0.0075; // Масштаб спрайта в соответствии с размером гексагона
        sprite.scale.set(scale * canvas.width, scale * canvas.height, 1);
        //sprite.center.set(0, 0); // Turn off billboarding
        return sprite;
    };
    

    positionLabel = (cell, axis, label, distance = 0.5) => {
        const angle = Math.PI / 3; // 60 градусов в радианах для шестиугольника
        const offsetAngle = -(Math.PI / 6); // Дополнительные 30 градусов в радианах
        let offset;
    
        switch(axis) {
            case 'q':
                offset = new THREE.Vector3(Math.cos(angle * 2 + offsetAngle), Math.sin(angle * 2 + offsetAngle), 0).multiplyScalar(distance);
                label.material.color.setHex(0x59b300); // красный цвет для оси Q
                break;
            case 'r':
                offset = new THREE.Vector3(Math.cos(offsetAngle), Math.sin(offsetAngle), 0).multiplyScalar(distance);
                label.material.color.setHex(0x0099e6); // зеленый цвет для оси R
                break;
            case 's':
                offset = new THREE.Vector3(Math.cos(angle * 4 + offsetAngle), Math.sin(angle * 4 + offsetAngle), 0).multiplyScalar(distance);
                label.material.color.setHex(0xe619e5); // Синий цвет для оси S
                break;
            default:
                offset = new THREE.Vector3(0, 0, 0.5);
                break;
        }
    
        label.position.copy(cell.position).add(offset); // Позиционируем метку над гексом
        //label.lookAt(cell.position); // Направляем метку в сторону центра гекса
    };
    

    addLabelsToHexagons = () => {
        // Предполагается, что шестиугольники и сцена уже инициализированы
        this.gridGroup.children.forEach(cell => {
            const qLabel = this.createTextSprite(`q: ${cell.cube.coordinates.q}`, `'#59b300'`, 20);
            const rLabel = this.createTextSprite(`r: ${cell.cube.coordinates.r}`, `'#0099e6'`, 20);
            const sLabel = this.createTextSprite(`s: ${cell.cube.coordinates.s}`, `'#e619e5'`, 20);
    
            this.positionLabel(cell, 'q', qLabel);
            this.positionLabel(cell, 'r', rLabel);
            this.positionLabel(cell, 's', sLabel);
            
            this.labelsArray.push(qLabel);
            this.labelsArray.push(rLabel);
            this.labelsArray.push(sLabel);

        });
        this.state.scene.add(...this.labelsArray);
        this.labelsArray.forEach((label) => {
            const up = new THREE.Vector3(0, 0, 1); // Вектор "верх" мира
            label.quaternion.setFromUnitVectors(label.up, up);
        });
    }

    removeLabelsFromHexagons = () => {
        // Ваша логика удаления меток
        if (this.labelsArray) {
            this.labelsArray.forEach(label => {
            this.state.scene.remove(label);
            });
            this.labelsArray = []; // Очищаем массив с метками
        }
    }  

    // statistics = () => {
    //     console.log("Scene polycount:", this.state.renderer.info.render.triangles)
    //     console.log("Active Drawcalls:", this.state.renderer.info.render.calls)
    //     console.log("Textures in Memory", this.state.renderer.info.memory.textures)
    //     console.log("Geometries in Memory", this.state.renderer.info.memory.geometries)
    // }

    componentDidMount() {
        this.interval = null;
        this.state.renderer.setPixelRatio( window.devicePixelRatio );
        this.state.renderer.gammaInput = true;
        this.state.renderer.gammaOutput = true;
        this.state.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.state.renderer.domElement);
        //this.state.renderer.setSize( this.container.scrollWidth, this.container.scrollHeight );
        if(this.container){
            this.updateScreenSize();
        }
        window.addEventListener("resize", this.updateScreenSize);
        window.addEventListener("keyup", this.keyup, false);
        window.addEventListener('mousedown', this.handleMouseDown, false);
        window.addEventListener('mousemove', this.handleMouseMove, false);
        window.addEventListener('mouseup', this.handleMouseUp, false);
        //window.addEventListener('onMouseOver', this.handleMouseUp, false);

        // Задаем начальный и конечный цвета
        const startColor = 0x30D5C8; // Turquoise
        const endColor = 0xEB9373;   // Apricot
        
        // Генерируем 10 материалов
        this.gradientMaterials = this.generateGradientMaterials(startColor, endColor, 10);
        
        // gradientMaterials теперь содержит массив из 10 материалов с градиентом цвета
        //console.log(this.gradientMaterials);

        this.hexMaterialActive = new THREE.MeshBasicMaterial({ color: 0x483720 });
        this.hexMaterialActive2 = new THREE.MeshBasicMaterial({ color: 0xF64F00 });
        this.hexMaterialActive3 = new THREE.MeshBasicMaterial({ color: 0xDD405E });
        this.hexMaterialActive1 = new THREE.MeshBasicMaterial({ color: 0x083E54 });
        this.hexMaterialActive4 = new THREE.MeshBasicMaterial({ color: 0x004140 }); 
        
        
        this.hexMaterialInactive = new THREE.MeshBasicMaterial({ color: 0xDD9045 });
        this.hexMaterialHighlight = new THREE.MeshBasicMaterial({ color: 0x44ff44 });
        this.start();
        this.initialGrid = this.createInitialGrid();
        //this.updateGeneration();
        //this.updateGrid(this.initialGrid);
        // this.worker = new Worker('./workers/GameWorker.js');
        // this.worker.onmessage = this.handleWorkerMessage;

    };

    handleWorkerMessage = (e) => {
        const newCellsMap = e.data;
        this.setState({ cellsMap: newCellsMap });
    }
    
    // updateFieldState = () => {
    //     if (this.worker) {
    //         this.worker.postMessage(this.state.cellsMap);
    //     }
    // }
      
    componentDidUpdate(prevProps) {
        // Только если isGenocide изменился с false на true и функция не была вызвана ранее
        if (this.props.isGenocide && !prevProps.isGenocide && !this.state.isGenocideTriggered) {
          // Помечаем, что функция была вызвана
            this.setState({ isGenocideTriggered: false }, () => {
            // Вызываем handleGenocide только после установки состояния
            this.handleGenocide();
            });
        }
        if (this.props.isPopulate && !prevProps.isPopulate && !this.state.isPopulateTriggered) {
            // Помечаем, что функция была вызвана
            this.setState({ isPopulateTriggered: false }, () => {
              // Вызываем handleGenocide только после установки состояния
              this.handlePopulate();
            });
        }
        // Если свойство isPlay только что стало true, запускаем интервал
        if (this.props.isPlay && !prevProps.isPlay) {
            this.startUpdateCycle();
        }
        // Если свойство isPlay только что стало false, очищаем интервал
        else if (!this.props.isPlay && prevProps.isPlay && this.interval) {
            this.stopUpdateCycle();
        }
        if (this.worker) {
            this.worker.terminate();
        }
        if(this.props.isNext && !prevProps.isNext){
            this.updateFieldState(1);
        }
        if(this.props.isPrev && !prevProps.isPrev){
            this.updateFieldState(-1);
        }
        if(this.props.isLabeled && !prevProps.isLabeled && !this.state.isLabeledTriggered){
            this.setState({ isLabeledTriggered: true }, () => {
                // Вызываем handleGenocide только после установки состояния
                this.addLabelsToHexagons();
            });
            
        }
        if(!this.props.isLabeled && !prevProps.isLabeled && this.state.isLabeledTriggered){
            this.setState({ isLabeledTriggered: false }, () => {
                // Вызываем handleGenocide только после установки состояния
                this.removeLabelsFromHexagons();
            });
            
        }
        if(this.props.healpixProps.detail !== prevProps.healpixProps.detail){
            this.setState({ HexShapeCountRound: this.props.healpixProps.detail }, () => {
                // Вызываем handleGenocide только после установки состояния
                this.handleRing();
            });
        }
        if (this.props.isCameraRot && !prevProps.isCameraRot && !this.state.isCameraRotTriggered) {
            // Помечаем, что функция была вызвана
            this.setState({ isCameraRotTriggered: true }, () => {
              // Вызываем handleGenocide только после установки состояния
              this.rotateCameraAndZoomToFit();
            });
        }


    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.updateScreenSize);
        window.removeEventListener("keyup", this.keyup, false);
        window.removeEventListener('mousedown', this.handleMouseDown, false);
        window.removeEventListener('mousemove', this.handleMouseMove, false);
        window.removeEventListener('mouseup', this.handleMouseUp, false);
    
        //window.removeEventListener('onMouseOver', this.handleMouseUp, false);
        
        // ... остальные обработчики        

        this.container.removeChild(this.state.renderer.domElement)
        //this.cleanup();
        this.stopUpdateCycle(); // Очистка при размонтировании компонента
        this.removeLabelsFromHexagons()
    }


    createHexagonShape(size) {
        const shape = new THREE.Shape();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const x = size * Math.cos(angle);
            const y = size * Math.sin(angle);
            const start = { x: x, y: y };
            if (i === 0) {
                shape.moveTo(start.x, start.y);
            } else {
                shape.lineTo(start.x, start.y);
            }
        }
        shape.closePath();
        return new THREE.ShapeBufferGeometry(shape);
    }

    // Функция для преобразования кубических координат в 3D позицию
    hexToPosition(q, r) {
        const x =  this.state.hexSize * 3/2 * q;
        const y =  this.state.hexSize * Math.sqrt(3) * (r + q/2);
        return new THREE.Vector3(x, y, 0);
    }

    createInitialGrid = () => {
        let grid = [];
        // Создаем группу для всех шестиугольников
        this.gridGroup.name = 'InitGrid';
        const hexGeometry = this.createHexagonShape(this.state.hexSize);
        hexGeometry.name = 'HEXAGON';
        //console.log(hexGeometry);
        const gridRadius = this.state.HexShapeCountRound;
        let newCellsMap = []; // Временный массив для хранения шестиугольников
        for (let q = -gridRadius; q <= gridRadius; q++) {
            for (let r = -gridRadius; r <= gridRadius; r++) {
                const s = -q - r;
                if (Math.abs(s) > gridRadius) continue;
                // вычисляем позицию шестиугольника в пространстве
                const cube = this.hexToPosition(q, r);
                //console.log(cube);
                cube.state = Math.random() < 0.5;
                if(cube.state){
                    cube.lifeTime = 1;
                } else {
                    cube.lifeTime = 0;
                }
                cube.stateUpdated = false;
                cube.coordinates = { q: q, r: r, s: s };
                cube.roundCoordinates = this.cubeRound(this.Cube(q, r, s));
                cube.position = { x: cube.x, y: cube.y, z: cube.z };
                cube.name = `cube_${q}_${r}_${s}`;
                // Создаем mesh для шестиугольника
                const hexMesh = new THREE.Mesh(hexGeometry, cube.state ? this.hexMaterialActive : this.hexMaterialInactive);
                hexMesh.position.set(cube.x, cube.y, 0.1);
                hexMesh.name = `cell_${q}_${r}_${s}`;
                hexMesh.cube = cube;
                hexMesh.scale.set(0.97, 0.97, 1); // Уменьшаем размер шестиугольника, чтобы избежать перекрытия
                this.gridGroup.add(hexMesh);
                newCellsMap.push(hexMesh); // Добавляем mesh во временный массив
                //grid.push(hexMesh);
            }
        }
        // Обновляем состояние с новым массивом шестиугольников
        //console.log(newCellsMap);
        this.setState({ cellsMap: newCellsMap });

        // Добавляем группу на сцену
        this.state.scene.add(this.gridGroup);
        

        // Возвращаем группу, если нам нужно взаимодействовать с ней позже
        //return this.gridGroup;
    }

    handleRing = () => {
        // Создаем временный массив для хранения новых состояний    
        this.reinitializeGrid(true); 
         
    }     

    reinitializeGrid = (addRing) => {
        const oldGridRadius = this.state.HexShapeCountRound;
        const newGridRadius = addRing ? oldGridRadius + 1 : oldGridRadius - 1;

        // Create a temporary array to store the new hexagons
        const newCellsMap = [];

        // Iterate through the hexagons in the old grid
        for (let q = -newGridRadius; q <= newGridRadius; q++) {
            for (let r = -newGridRadius; r <= newGridRadius; r++) {
                const s = -q - r;
                if (Math.abs(s) > newGridRadius) continue;

                // Check if the hexagon exists in the old grid
                const existingHexagon = this.state.cellsMap.find(
                    (cell) => cell.cube.coordinates.q === q && cell.cube.coordinates.r === r
                );

                // If the hexagon exists, add it to the new grid
                if (existingHexagon) {
                    newCellsMap.push(existingHexagon);
                }
                // If the hexagon doesn't exist, create a new one
                else {
                    const cube = this.hexToPosition(q, r);
                    cube.state = false;
                    cube.lifeTime = cube.state ? 1 : 0;
                    cube.stateUpdated = false;
                    cube.coordinates = { q: q, r: r, s: s };
                    cube.roundCoordinates = this.cubeRound(this.Cube(q, r, s));
                    cube.position = { x: cube.x, y: cube.y, z: cube.z };
                    cube.name = `cube_${q}_${r}_${s}`;

                    const hexMesh = new THREE.Mesh(
                        this.createHexagonShape(this.state.hexSize),
                        cube.state ? this.hexMaterialActive : this.hexMaterialInactive
                    );
                    hexMesh.position.set(cube.x, cube.y, 0.1);
                    hexMesh.name = `cell_${q}_${r}_${s}`;
                    hexMesh.cube = cube;
                    hexMesh.scale.set(0.97, 0.97, 1);

                    newCellsMap.push(hexMesh);
                }
            }
        }

        // Update the grid radius in the state
        this.setState({ HexShapeCountRound: newGridRadius });

        // Update the cells map in the state
        this.setState({ cellsMap: newCellsMap });

        // Remove the old grid group from the scene
        this.state.scene.remove(this.gridGroup);

        // Clear the old grid group
        this.gridGroup.children = [];

        // Add the new hexagons to the grid group
        newCellsMap.forEach((hexMesh) => {
            this.gridGroup.add(hexMesh);
        });

        // Add the grid group back to the scene
        this.state.scene.add(this.gridGroup);
    }

    saveCurrentState = () => {
        // Создаем массив для сохранения состояния каждой клетки
        const currentState = [];
    
        // Итерируем через массив клеток в состоянии (state)
        this.state.cellsMap.forEach((cell) => {
            // Для каждой клетки создаем копию ее свойств
            const cellState = {
                cube: {
                    ...cell.cube, // Копируем свойства cube
                    coordinates: { ...cell.cube.coordinates }, // Глубокое копирование координат
                    position: { ...cell.cube.position }, // Глубокое копирование позиций
                    // Добавляем любые другие свойства, которые нужно сохранить
                },
                meshName: cell.name, // Сохраняем имя сетки (если оно вам нужно)
                material: cell.material, // Сохраняем материал сетки
                state: cell.cube.state, // Сохраняем текущее состояние клетки
                lifeTime: cell.cube.lifeTime, // Сохраняем время жизни
                // ...можно добавить другие свойства, если они важны для сохранения
            };
    
            // Добавляем состояние клетки в массив состояний
            currentState.push(cellState);
        });
    
        // Теперь у вас есть массив currentState, содержащий состояние каждой клетки
        // Вы можете сохранить его в состоянии компонента или где-то еще
        this.setState({ savedState: currentState });
        console.log( currentState );
        console.log('Current state saved');
    
        // Если вам нужно сохранить состояние вне компонента (например, отправить на сервер или в localStorage),
        // вы можете преобразовать currentState в JSON и выполнить необходимые действия
        // const currentStateJSON = JSON.stringify(currentState);
        // localStorage.setItem('savedGridState', currentStateJSON);
        // или отправить на сервер...
    }

    loadSavedState = () => {
        // Получаем сохраненное состояние, предполагая, что оно было сохранено в состоянии компонента
        const savedState = this.state.savedState;
    
        // Если нет сохраненного состояния, прерываем выполнение функции
        if (!savedState) {
            console.error("No saved state to load.");
            return;
        }
    
        // Создаем новый массив для клеток, которые будут загружены из сохраненного состояния
        const newCellsMap = savedState.map(savedCell => {
            const cube = savedCell.cube;
            // Создаем новый объект сетки (THREE.Mesh) с соответствующим материалом
            const hexMaterial = cube.state ? this.hexMaterialActive : this.hexMaterialInactive;
            const hexMesh = new THREE.Mesh(
                this.createHexagonShape(this.state.hexSize),
                hexMaterial
            );
    
            // Задаем позицию и другие свойства сетки
            hexMesh.position.set(cube.position.x, cube.position.y, 0.1);
            hexMesh.name = savedCell.meshName;
            hexMesh.cube = { ...cube };
            hexMesh.scale.set(0.97, 0.97, 1);
            
            // Принудительно обновляем материал
            hexMesh.material.needsUpdate = true;
    
            return hexMesh;
        });
    
        // Обновляем состояние cellsMap новыми данными
        this.setState({ cellsMap: newCellsMap }, () => {
            // После обновления состояния, принудительно перерисовываем сцену
            this.updateScene();
        });
    }
    
    // Функция для обновления сцены
    updateScene = () => {
        // Удаляем старую группу сетки из сцены
        this.state.scene.remove(this.gridGroup);
    
        // Создаем новую группу для сетки
        this.gridGroup = new THREE.Group();
    
        // Добавляем новые клетки в группу и обновляем сцену
        this.state.cellsMap.forEach(hexMesh => {
            this.gridGroup.add(hexMesh);
        });
    
        // Добавляем обновленную группу обратно в сцену
        this.state.scene.add(this.gridGroup);
    
        // Вызываем метод рендеринга сцены, если он есть
        if (this.state.renderer && this.state.camera) {
            this.state.renderer.render(this.state.scene, this.state.camera);
        }
    }
        
    
    handleGenocide = () => {

        // Создаем временный массив для хранения новых состояний
        const newStates = new Map();

        // Первый проход для определения новых состояний
        this.state.cellsMap.forEach(cell => {
            newStates.set(cell.cube.state, false); // Назначаем всем ячейкам состояние "false"
            newStates.set(cell.cube.lifeTime, 0); // Назначаем всем ячейкам время жизни "0"
        });

        // Второй проход для обновления состояния и материалов, если необходимо
        const newCellsMap = this.state.cellsMap.map(cell => {
            const nextState = newStates.get(cell.cube.name);
            if (cell.cube.state !== nextState) {
                cell.cube.state = nextState;
                cell.material = nextState ? this.hexMaterialActive : this.hexMaterialInactive;
                cell.material.needsUpdate = true;
            }
            return cell;
        });

        // Обновляем состояние с новым массивом шестиугольников
        this.setState({ cellsMap: newCellsMap });
        console.log('Field cleared');
    }

    handlePopulate = () => {

        const newStates = new Map();
        let maxLifetime = 0;
        // Первый проход для определения новых состояний
        this.state.cellsMap.forEach(cell => {
            let nextState = Math.random() < 0.137;
            if(nextState){
                cell.cube.lifeTime = 1;
            } else {
                cell.cube.lifeTime = 0;
            };
            newStates.set(cell.cube.name, nextState);
        });
      
        // Второй проход для обновления состояния и материалов, если необходимо
        const newCellsMap = this.state.cellsMap.map(cell => {
          const nextState = newStates.get(cell.cube.name);
          if (cell.cube.state !== nextState) {
            cell.cube.state = nextState;
            //console.log(cell.cube.lifeTime);    
            //cell.material = this.gradientMaterials[cell.cube.lifeTime]; // Изменяем материал шестиугольника в за������исимости от lifeTime
            cell.material = nextState ? this.hexMaterialActive : this.hexMaterialInactive;
            cell.material.needsUpdate = true;
          }
          return cell;
        });
        // Обновляем состояние всего один раз
        this.setState({ cellsMap: newCellsMap });
        //console.log('Generation end, Max lifetime:', maxLifetime);
        console.log('Field populated');
    }

    startUpdateCycle = () => {
        // Устанавливаем интервал для регулярного вызова updateFieldState
        this.interval = setInterval(this.updateFieldState, 120); // Например, каждую секунду
    }
    
    stopUpdateCycle = () => {
        // Очищаем интервал
        clearInterval(this.interval);
        this.interval = null;
    }

    updateFieldState = (direction, steps) => {

        if (direction === undefined) {
            direction = 1;
        }
    
        if (steps === undefined) {
            steps = 1;
        }

        const newStates = new Map();
        this.state.cellsMap.forEach(cell => {
            const activeNeighbors = this.findActiveNeighbors(cell.cube).length;
            const currentlyActive = cell.cube.state;
            let nextState = currentlyActive;
    
            if (currentlyActive) {
                nextState = activeNeighbors === 3 || activeNeighbors === 4;
            } else {
                nextState = activeNeighbors === 2;
            }
            newStates.set(cell.cube.name, nextState);
        });
    
        const newCellsMap = this.state.cellsMap.map(cell => {
            const nextState = newStates.get(cell.cube.name);
            if (cell.cube.state !== nextState) {
                cell.cube.state = nextState;
                cell.material = nextState ? this.hexMaterialActive : this.hexMaterialInactive;
                cell.material.needsUpdate = true;
            }
            return cell;
        });
    
        const history = this.state.history.slice(0, 100);
    
        if (direction === 1) {
            history.push(newCellsMap);
            this.setState({ cellsMap: newCellsMap, history });
        } else if (direction === -1 && history.length > 1) {
            // Для движения назад берем предыдущее состояние, удаляем последнее из истории
            const prevState = history[history.length - 2];
            history.pop();
            this.setState({ cellsMap: prevState, history });
        }
    };
    

    // updateFieldState = (direction = 1, steps = 1) => {
    //     // Создаем временный массив для хранения новых состояний
    //     const newStates = new Map();
    //     //let maxLifetime = 0;
    //     // Первый проход для определения новых состояний
    //     this.state.cellsMap.forEach(cell => {
    //         //const lifeTime = cell.cube.lifeTime;
    //         const activeNeighbors = this.findActiveNeighbors(cell.cube).length;
    //         const currentlyActive = cell.cube.state;
    //         let nextState = currentlyActive;
    //         //let nextLifeTime = lifeTime;

    //         // if (currentlyActive && (activeNeighbors < 2 || activeNeighbors >= 3)) { // Если активный и у него меньше 2 или больше 3 соседей, он становится неактивным
    //         //     nextState = false;
    //         //     } else if (!currentlyActive && activeNeighbors === 2) { // Если неактивный и у него 3 соседа, он становится активным
    //         //     nextState = true;
    //         // }   
    //         // Обновление состояния клеток в зависимости от количества активных соседей
    //         if (currentlyActive) {
    //             // Если клетка живая (активная)
    //             if (activeNeighbors === 3 || activeNeighbors === 4) {
    //                 nextState = true; // Клетка остается живой, если у нее 3 или 4 активных соседа
    //             } else {
    //                 nextState = false; // Клетка умирает, если у нее меньше 3 или больше 4 активных соседей
    //             }
    //         } else {
    //             // Если клетка мертвая (неактивная)
    //             if (activeNeighbors === 2) {
    //                 nextState = true; // Клетка оживает, если у нее 2 активных соседа
    //             } else {
    //                 nextState = false; // Клетка остается мертвой, если у нее меньше 2 или больше 2 активных соседей
    //             }
    //         }
    //         newStates.set(cell.cube.name, nextState); // Сохраняем новое состояние клетки в Map
    //     });
      
    //     // Второй проход для обновления состояния и материалов, если необходимо
    //     const newCellsMap = this.state.cellsMap.map(cell => {
    //         const nextState = newStates.get(cell.cube.name);
    //         if (cell.cube.state !== nextState) {
    //             cell.cube.state = nextState;
    //             cell.material = nextState ? this.hexMaterialActive : this.hexMaterialInactive;
    //             cell.material.needsUpdate = true;
    //         }
    //         return cell;
    //     });

    //     // Добавляем новое состояние в историю
    //     const history = this.state.history.slice(0, 100); // Ограничиваем историю до 100 шагов

    //     // если направление вперед, то назначаем в стейт последний элемент из истории
    //     // если направление назад, то назначаем в стейт предпоследний элемент из истории

    //     if(direction === 1){
    //         // Добавляем новое состояние только при движении вперед
    //         history.push(newCellsMap);
    //         this.setState({ cellsMap: newCellsMap, history });
    //     } else if(direction === -1 && history.length > 1){
    //         // При движении назад берем предпоследнее состояние
    //         this.setState({ cellsMap: history[history.length - 1], history });
    //     }
    //     console.log(history);

    //     ///console.log('Generation end, Max lifetime:', maxLifetime);
    // }

    // updateFieldState = () => {
    //     // Создаем временный массив для хранения новых состояний
    //     const newStates = new Map();
    //     //let maxLifetime = 0;
    //     // Первый проход для определения новых состояний
    //     this.state.cellsMap.forEach(cell => {
    //         //const lifeTime = cell.cube.lifeTime;
    //         const activeNeighbors = this.findActiveNeighbors(cell.cube).length;
    //         const currentlyActive = cell.cube.state;
    //         let nextState = currentlyActive;
    //         //let nextLifeTime = lifeTime;

    //         // if (currentlyActive && (activeNeighbors < 2 || activeNeighbors >= 3)) { // Если активный и у него меньше 2 или больше 3 соседей, он становится неактивным
    //         //     nextState = false;
    //         //     } else if (!currentlyActive && activeNeighbors === 2) { // Если неактивный и у него 3 соседа, он становится активным
    //         //     nextState = true;
    //         // }   
    //         if (currentlyActive) {
    //             // Если клетка живая (активная)
    //             if (activeNeighbors === 3 || activeNeighbors === 4) {
    //                 nextState = true;
    //             } else {
    //                 nextState = false;
    //             }
    //         } else {
    //             if (activeNeighbors === 2) {
    //                 nextState = true;
    //             } else {
    //                 nextState = false;
    //             }
    //         }
    //         newStates.set(cell.cube.name, nextState);
    //     });
      
    //     // Второй проход для обновления состояния и материалов, если необходимо
    //     const newCellsMap = this.state.cellsMap.map(cell => {
    //       const nextState = newStates.get(cell.cube.name);
    //       if (cell.cube.state !== nextState) {
    //         cell.cube.state = nextState;
    //         cell.material = nextState ? this.hexMaterialActive : this.hexMaterialInactive;
    //         cell.material.needsUpdate = true;

    //       }
    //       return cell;
    //     });
    //     // Обновляем состояние всего один раз
    //     this.setState({ cellsMap: newCellsMap });
    //     ///console.log('Generation end, Max lifetime:', maxLifetime);
    // }


    // // Функция для обновления состояния на один шаг
    // stepGeneration = () => {
        
    //     //однократно вызываем функцию updateFieldState передавая как параметр шаг "вперед , назад или смещение на определенное количество шагов в прошлое или будущее"


    // };


    rotateCameraAndZoomToFit = () => {
        // Предположим, что у вас есть глобальная переменная camera, которая является экземпляром THREE.PerspectiveCamera
    
        // Вращение камеры на 30 градусов вокруг оси Y
        const angle = THREE.MathUtils.degToRad(30);
        this.camera.position.applyAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    
        // Вычисление необходимого уровня зума, чтобы вписать поле шестиугольников в видимую область
        const boundingBox = new THREE.Box3().setFromObject(this.gridGroup);
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
    
        // Находим минимальную сторону окна браузера
        const minSide = Math.min(window.innerWidth, window.innerHeight);
    
        // Вычисляем соотношение между размером сетки и размером окна для зума
        const zoomLevel = minSide / Math.max(size.x, size.y);
        
        // Применяем уровень зума к камере
        this.camera.zoom = zoomLevel/this.state.HexShapeCountRound;
        this.camera.updateProjectionMatrix();
    
        // Обновляем сцену
        if (this.state.renderer) {
            this.state.renderer.render(this.state.scene, this.camera);
        }
        
        // // Если у вас есть OrbitControls, необходимо обновить их состояние
        // if (this.orbitControls) {
        //     this.orbitControls.update();
        // }
        // Пример использования OrbitControls для плавного вращения
        if (this.orbitControls) {
            this.orbitControls.rotateLeft(angle);
        }
        this.setState({ isCameraRotTriggered: false });

    }
    
    updateScreenSize() {
        let up_w = window.innerWidth;
        let up_h = window.innerHeight-74;
        this.camera.aspect = up_w / up_h;
        this.camera.updateProjectionMatrix();
        this.state.renderer.setSize( up_w, up_h );
    }

    start = () => {
        if (!this.frameId) {
          this.frameId = requestAnimationFrame(this.animate)
        }
    }

    stop = () => {
        cancelAnimationFrame(this.frameId)
    }

    animate = () => {
        //this.stats.begin();
        this.delta = this.clock.getDelta();
        this.timer = Date.now() * 0.01;
        this.renderScene(this.delta);
        //this.stats.end();
        this.frameId = window.requestAnimationFrame(this.animate);
    }

    pasteState = () => {
        // Retrieve the saved state from a variable or server
        // ...
    }

    // Add event listeners for key presses
    keyup = (e) => {
        if (e.key === 'S' || e.key === 's') {
            this.saveCurrentState();
        } else if (e.key === 'P' || e.key === 'p') {
            this.loadSavedState();
        }
    }
    
    ////Все что ниже работает как нужно... вроде бы... пока

    handleMouseDown = (e) => {
        if (e.button !== 0) return; // Если нажата не левая кнопка мыши, выходим из функции
        e.preventDefault(); // prevent scrolling on touch
        this.setState({ isDrawing: true });
        this.toggleHexState(e);
    }

    handleLongTouch = (e) => {
        e.preventDefault(); // prevent scrolling on touch
        this.setState({ isDrawing: true });
        this.toggleHexState(e);
        // Add your long touch logic here
    }

    handleTouchEnd = (e) => {
        this.setState({ isDrawing: false });
    }

    handleMouseMove = (e) => {
        if (!this.state.isDrawing || e.button !== 0) return; // Если не нажата левая кнопка мыши, выходим из функции и режим рисования не включен
        e.preventDefault(); // Prevent scrolling on touch
        this.toggleHexState(e);
    }

    handleMouseUp = (e) => {
        if (e.button !== 0) return;
        
        // Ваш остальной код...
        this.setState({ isDrawing: false, lastPosition: {} });
    }
    
    toggleHexState = (e) => {
        if (!e.target) {
            console.error('Event target is undefined. Cannot proceed with toggleHexState.');
            return;
        }
        const rect = e.target.getBoundingClientRect();
        //console.log(rect);
        const x = e.clientX - rect.left; // x position within the element.
        const y = e.clientY - rect.top;  // y position within the element.
        // Вычисляем эффективную высоту канваса, исключая панель управления и футер
        const effectiveHeight = rect.height ; // 50 пикселей сверху и 24 пикселя снизу

        const mouse = new THREE.Vector2(
            (x / rect.width) * 2 - 1,
            - (y / rect.height) * 2 + 1 // Вычитаем высоту панели управления из y перед вычислением
        );
    //console.log(mouse.x, mouse.y);
        if (rect.height < 256) {
        // Если мышь за пределами канваса, выходим из функции
            return;
        }
        this.raycaster.setFromCamera(mouse, this.camera);
    
        // Проверяем, есть ли пересечение с детьми группы шестиугольников
        const intersects = this.raycaster.intersectObjects(this.state.cellsMap, false);

        if (intersects.length > 0) {
            const cell = intersects[0].object;

            if (this.state.lastPosition !== cell.cube.coordinates) {
                // Переключаем состояние шестиугольника
                const newState = !cell.cube.state;
                this.setState(state => {
                    // Найдите индекс выбранного шестиугольника в массиве состояния
                    const index = state.cellsMap.findIndex(h => h === cell);
                    // Создайте копию массива шестиугольников
                    const newCellsMap = [...state.cellsMap];
                    // Обновите состояние для выбранного шестиугольника
                    newCellsMap[index].cube.state = newState;
                    // Измените материал шестиугольника
                    newCellsMap[index].material = newState ? this.hexMaterialActive : this.hexMaterialInactive;
                    newCellsMap[index].material.needsUpdate = true;
                    // Верните новый объект состояния
                    return { cellsMap: newCellsMap };
                });
                this.setState({ lastPosition: cell.cube.coordinates });
            }
        }
    }

    renderScene = () => {
        this.state.renderer.render(this.state.scene, this.camera);
    }

  render() {

    return (
        <W>
            <div
                ref={thisNode => this.container=thisNode}
                onKeyDown={this.start}
                onKeyUp={this.stop}
            />
        </W>
    )
  }

}

export default GOL;