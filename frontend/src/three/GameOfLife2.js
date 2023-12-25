// frontend\src\three\GameOfLife.js
import React, { Component, useState } from 'react';

import * as THREE from 'three';
import W from "../wrapper/W"
import { MapControls, OrbitControls } from "./controls/OrbitControls";
import Stats from 'stats.js';
import { Hex } from './gptHex';
import { GridHelper } from 'three';
import e from 'cors';
import { update } from 'lodash';

class GOL extends React.Component {
    constructor(props) {
        super(props);
        THREE.Object3D.DefaultUp = new THREE.Vector3(0,0,1);
        const scene = new THREE.Scene();
        this.container = React.createRef();
        const camera =  new THREE.PerspectiveCamera( 70, this.container.scrollWidth / this.container.scrollWidth, 0.01, 2000 );
        camera.position.y = 0;
        camera.position.z = 25;
        camera.position.x = 0;
        camera.layers.enable( 2 );
        camera.up.set(0,0,1);
        camera.updateMatrix();
        camera.updateProjectionMatrix();
        const renderer = new THREE.WebGLRenderer({alpha: false, antialias: false });
        this.camera = camera;
        this.clock = new THREE.Clock();
        const controls = new MapControls( this.camera, renderer.domElement );
        controls.enableDamping = true; 
        controls.dampingFactor = 0.25;
        controls.minDistance = 5;
        controls.maxDistance = 250;
        controls.enablePan = false;
        controls.maxPolarAngle = Math.PI / 2 - 0.9;
        controls.update();
        this.controls = controls;
        this.gridGroup = new THREE.Group();
        this.labelsArray = [];
        //console.log(this.props.isGenocide);
        this.delay = 1;
        this.active = 0;
        this.state = {
            scene: scene,
            renderer: renderer,
            isLabeled: this.props.isLabeled || false,
            isLabeledTriggered: false,
            isPlay: this.props.isPlay || false,
            isGenocide: this.props.isGenocide || false,
            isGenocideTriggered: false,
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
            HexShapeCountRound: 13,
            hexOrigin: {
                x: 0,
                y:0
            },
            cellsMap: [],
            lastPosition: {},
            round: 3,
            cd: 0x3498db
        };

        this.updateScreenSize = this.updateScreenSize.bind(this);
        let mixers = [];
        this.mixers = mixers;

        const GridHelper = new THREE.GridHelper (100,100);
        GridHelper.rotateX(-Math.PI/2);
        //this.state.scene.add( GridHelper );
        //console.log(Hex);
    }


    createHexagonGeometry = (hexSize, orientation = "pointy") => {
        const hex = new Hex(0, 0, 0, orientation);
        const points = hex.getCornerPoints(hexSize).map(p => new THREE.Vector2(p.x, p.y));
        const geometry = new THREE.ShapeBufferGeometry(new THREE.Shape(points));
        return geometry;
    }
    
    
    createInitialGrid = () => {
        // Определите размер шестиугольника и его ориентацию
        const hexSize = this.state.hexSize;
        const orientation = "pointy"; // или "flat" в зависимости от предпочтений
    
        // Создание геометрии шестиугольника
        const hexGeometry = this.createHexagonGeometry(hexSize, orientation);
    
        // Генерация шестиугольников в заданном радиусе вокруг центра
        const hexes = Hex.hexagon(this.state.HexShapeCountRound);
    
        // Создание и позиционирование мешей шестиугольников
        hexes.forEach(hex => {
            const position = hex.toPixel(hexSize); // Вычисление позиции в пикселях
            const hexMesh = new THREE.Mesh(hexGeometry, this.hexMaterialInactive);
            hexMesh.position.set(position.x, position.y, 0); // Установка позиции шестиугольника
            this.gridGroup.add(hexMesh);
            this.state.cellsMap.push({ hex, mesh: hexMesh, state: Math.random() < 0.5 }); // Случайное начальное состояние
        });
    
        // Добавление группы шестиугольников в сцену
        this.state.scene.add(this.gridGroup);
    }

    updateFieldState = () => {
        const newCellsMap = this.state.cellsMap.map(cell => {
            // Получение соседей текущего шестиугольника
            const neighbors = cell.hex.neighbors(this.state.HexShapeCountRound);
    
            // Вычисление количества активных соседей
            const activeNeighbors = neighbors.filter(nHex => {
                return this.state.cellsMap.some(c => c.hex.equals(nHex) && c.state);
            }).length;
    
            // Определение нового состояния шестиугольника
            let nextState = cell.state;
            // if (cell.state && (activeNeighbors < 2 || activeNeighbors > 3)) {
            //     nextState = false; // Шестиугольник становится неактивным
            // } else if (!cell.state && activeNeighbors === 3) {
            //     nextState = true; // "Мертвый" шестиугольник оживает
            // }

            if (cell.state) {
                // Если клетка живая (активная)
                if (activeNeighbors === 3 || activeNeighbors === 4) {
                    // Остается живой, если у нее 3 или 4 живых соседа
                    nextState = true;
                } else {
                    // В противном случае становится мертвой (неактивной)
                    nextState = false;
                }
            } else {
                // Если клетка мертвая (неактивная)
                if (activeNeighbors === 2) {
                    // Оживает, если у нее ровно 2 живых соседа
                    nextState = true;
                } else {
                    // В противном случае остается мертвой (неактивной)
                    nextState = false;
                    // Здесь не трогаем lifeTime, так как клетка остается мертвой
                }
            }

            return { ...cell, state: nextState };
        });

        this.setState({ cellsMap: newCellsMap });
    
    }
    
    startUpdateCycle = () => {
        // Устанавливаем интервал для регулярного вызова updateFieldState
        this.interval = setInterval(this.updateFieldState, 250); // Например, каждую секунду
    }
    
    stopUpdateCycle = () => {
        // Очищаем интервал
        clearInterval(this.interval);
        this.interval = null;
    }
    
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
        // Задаем начальный и конечный цвета
        const TurquoiseColor = 0x30D5C8; // Turquoise
        const ApricotColor = 0xEB9373;   // Apricot
        
        this.hexMaterialActive = new THREE.MeshBasicMaterial({ color: 0x483720 });
        this.hexMaterialInactive = new THREE.MeshBasicMaterial({ color: 0xDD9045 });
        this.hexMaterialHighlight = new THREE.MeshBasicMaterial({ color: 0x44ff44 });
        this.createInitialGrid();
        this.start();
        this.worker = new Worker('./workers/lifeGameWorker.js');
        this.worker.onmessage = this.handleWorkerMessage;
    };



    componentDidUpdate(prevProps) {
        // Если свойство isPlay только что стало true, запускаем интервал
        if (this.props.isPlay && !prevProps.isPlay) {
            this.startUpdateCycle();
        }
        // Если свойство isPlay только что стало false, очищаем интервал
        else if (!this.props.isPlay && prevProps.isPlay && this.interval) {
            this.stopUpdateCycle();
        }
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.updateScreenSize);
        this.stopUpdateCycle(); // Очистка при размонтировании компонента
        this.container.removeChild(this.state.renderer.domElement)
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

    renderScene = () => {
        this.state.cellsMap.forEach(cell => {
            cell.mesh.material = cell.state ? this.hexMaterialActive : this.hexMaterialInactive;
        });
    
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