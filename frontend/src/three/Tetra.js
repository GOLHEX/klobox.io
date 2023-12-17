import React, { Component } from "react"
import * as THREE from "three";

import { MapControls, OrbitControls } from "./controls/OrbitControls";
import { KeyDisplay } from './utils';
import CharacterControls from './characterControls';
import { CameraHelper } from 'three';

import { GLTFLoader } from './GLTFLoader';
import * as SkeletonUtils from './SkeletonUtils';
import FBXLoader from 'three-fbx-loader'

import ModelLoader from './ModelLoader';
//import HealpixSphere from './HealpixSphere.jsx';
import * as healpix from '@hscmap/healpix';
import HEALPiX from './healpix';
//import HEALPiX from './healpixPy';
import W from "../wrapper/W"
import { Material } from "three";
//import { randInt } from "./three/src/math/mathutils";
import { randFloat, randInt } from "./three.js/src/math/MathUtils";
// import { VertexNormalsHelper } from 'three';
// import { VertexTangentsHelper } from 'three';



class Tetra extends Component {
    constructor(props) {
        super(props);
        console.log(props);
        const scene = new THREE.Scene();

        ///Ortogonal Camera
        // Создание ортографической камеры
        const left = -1;
        const right = 1;
        const top = 1;
        const bottom = -1;
        const near = 1;
        const far = 10000;
        const cameraIso = new THREE.OrthographicCamera(left, right, top, bottom, near, far);

        // Установка позиции камеры для изометрического вида
        cameraIso.position.set(5, 5, 5);

        // Смотреть в центр пересечения осей координат
        cameraIso.lookAt(new THREE.Vector3(0, 0, 0));

        // Обновить матрицу проекции камеры
        cameraIso.updateProjectionMatrix();

        const camera =  new THREE.PerspectiveCamera( 20, 240 / 135, 0.01, 10000 ) ;
        
        camera.position.y = 10;
        camera.position.z = 10;
        camera.position.x = 10;
        //camera.layers.enable( 2 );
        camera.lookAt(new THREE.Vector3(0, 0, 0));
        const renderer = new THREE.WebGLRenderer({alpha: false, antialias: true });

        const controls = new OrbitControls( camera, renderer.domElement );
        controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
        controls.dampingFactor = 0.25;
        controls.screenSpacePanning = true;
        controls.minDistance = 2;
        controls.maxDistance = 500;


        controls.enablePan = true;
        controls.maxPolarAngle = Math.PI /1.1 + 0.05;
        controls.update();
        this.userPos=this.props.userPos;
        this.lastPosition;
        this.socket = this.props.io;

        let mixers = [];
        this.mixers = mixers;

////END Models Load
        this.state = {
            scene: scene,
            renderer: renderer,
            lastPosition: {},
            clientWidth: 256,
            clientHeight: 256,
            HEALPiX: props.healpixProps || {radius: 2, detail: 1},
            orbitRotation: props.isPlay || true,
            mouse: {
                x:0,
                y:0
            },
            position: {
                x:0,
                y:0
            },
            hexSize: 8,
            hexOrigin: {
                x: 0,
                y:0
            },
            round: 5,
            cd: 0x3498db
        };
        this.camera = camera;
        this.controls = controls;
        this.characterControls;

        this.clock = new THREE.Clock();

        this.state.scene.background = new THREE.Color().set('#795548');
        this.state.scene.fog = new THREE.Fog( this.state.scene.background, 200, 500 );

        this.state.height = this.state.hexSize*2;
        this.state.vert = this.state.height * 3/4;
        this.state.width = Math.sqrt(3)/2 * this.state.height;
        this.state.horiz = this.state.width;



        this.GeometryCell = new THREE.CylinderBufferGeometry(
            this.state.hexSize*0.95,
            this.state.hexSize*0.95,
            1.618,
            6
        );


        this.GeometryCell.dynamic = true;

        this.MeshPhongMaterial = new THREE.MeshPhongMaterial( {
            color: this.state.cd,
            emissive: 0x001200,
            flatShading: true
        } );

        this.BufferGeometry = new THREE.BufferGeometry();


        this.draw = 0;
        this.add = 0;


        this.modelLoaderState = 0;
        this.userModel;
        // console.log(characterControls);
        // console.log(this.state.characterControls);
        // console.log(this.characterControls);

        //this.HealpixSphere = new HEALPiX(this.state.HEALPiX.radius, this.state.HEALPiX.detail);

    }
    clamp(value, min, max) {
        if(value === undefined) randFloat(0.25, 5);
        return Math.min(Math.max(value, min), max);
    }
    componentDidMount() {

        // LIGHTS
        this.hemiLight = new THREE.HemisphereLight( 0xafcbd3, 0xb38e8f, 1 );/////#afcbd3/////##b38e8f
        this.hemiLight.color.setHSL( 0.6, 1, 0.95 );
        this.hemiLight.groundColor.setHSL( 0.095, 1, 0.75 );
        this.hemiLight.position.set( 0, 50, 0 );
        this.state.scene.add( this.hemiLight );
        this.hemiLightHelper = new THREE.HemisphereLightHelper( this.hemiLight, 1 );
        this.state.scene.add( this.hemiLightHelper );

        this.dirLight = new THREE.DirectionalLight( 0xd1c4bc, 2 ); /////#d1c4bc
        this.dirLight.color.setHSL( 0.1, 0.6, 0.95 );
        this.dirLight.position.set( -5, 1, 3 );
        this.dirLight.position.multiplyScalar( 25);
        
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        this.shadowDistance = 2048;
        this.dirLight.shadow.camera.left = -this.shadowDistance;
        this.dirLight.shadow.camera.right = this.shadowDistance;
        this.dirLight.shadow.camera.top = this.shadowDistance;
        this.dirLight.shadow.camera.bottom = -this.shadowDistance;
        this.dirLight.shadow.camera.far = 2500;
        this.dirLight.shadow.bias = -0.00001;
        this.state.scene.add( this.dirLight );
        // this.dirLightHeper = new THREE.DirectionalLightHelper( this.dirLight, 10 );
        // this.state.scene.add( this.dirLightHeper );

        // SKYDOME
        this.vertexShader = document.getElementById( 'vertexShader' ).textContent;
        this.fragmentShader = document.getElementById( 'fragmentShader' ).textContent;
        this.uniforms = {
            topColor:    { value: new THREE.Color( 0xD34511 ) }, 
            bottomColor: { value: new THREE.Color( 0x362D6A ) }, 
            offset:      { value: -25 },
            exponent:    { value: 0.8 }
        };
        this.uniforms.topColor.value.copy( this.hemiLight.color );
        this.state.scene.fog.color.copy( this.uniforms.bottomColor.value );
        this.skyGeo = new THREE.SphereBufferGeometry( 1000, 32, 15 );
        this.skyMat = new THREE.ShaderMaterial( { vertexShader: this.vertexShader, fragmentShader: this.fragmentShader, uniforms: this.uniforms, side: THREE.BackSide } );
        this.sky = new THREE.Mesh( this.skyGeo, this.skyMat );
        this.sky.name = 'SKYDOME';
        this.state.scene.add( this.sky );

        // Helpers
        // const gridHelper = new THREE.GridHelper( 1000, 20 );
        // this.state.scene.add( gridHelper );



        const axesHelper = new THREE.AxesHelper( 5 );
        this.state.scene.add( axesHelper );


        //HEALPIXSPHERE
        this.updateSphere();

        // GROUND
        this.geometry = new THREE.PlaneBufferGeometry( 1000, 1000 );

        const textureLoader = new THREE.TextureLoader();

        const diffuse = textureLoader.load( 'textures/Ground037_1K-JPG/Ground037_1K_Color.jpg' );
        const displacementMap = textureLoader.load( 'textures/Ground054_4K-JPG/Ground054_4K_Displacement.jpg' );
        //const aoMap = textureLoader.load( 'textures/Ground054_4K-JPG/Ground054_4K_AmbientOcclusion.jpg' );
        const normalMap = textureLoader.load( 'textures/Ground037_1K-JPG/Ground037_1K_NormalDX.jpg' );

        diffuse.wrapS = THREE.RepeatWrapping;
        diffuse.wrapT = THREE.RepeatWrapping;
        diffuse.repeat.set( 300, 300 );

        displacementMap.wrapS = THREE.RepeatWrapping;
        displacementMap.wrapT = THREE.RepeatWrapping;
        displacementMap.repeat.set( 300, 300 );

        normalMap.wrapS = THREE.RepeatWrapping;
        normalMap.wrapT = THREE.RepeatWrapping;
        normalMap.repeat.set( 300, 300 );

        this.materialStandard = new THREE.MeshStandardMaterial( {
            color: 0x335578,
            map: diffuse,


            //displacementMap: displacementMap,
            displacementScale: 1,
            displacementBias: -1,

            //aoMap: aoMap,

            normalMap: normalMap,
            normalScale: new THREE.Vector2( 1, - 1 ),

            //flatShading: true,

            side: THREE.DoubleSide
        } );


        //this.material1 = new THREE.MeshPhongMaterial( { color: 0xffffff, map: texture1 } );
        //this.material = new THREE.MeshPhongMaterial( { color: 0x03A9F4, specular: 0x050505 } );
        //this.material.color.set('#795548');
        // this.ground = new THREE.Mesh( this.geometry, this.materialStandard );
        // this.ground.name = 'GROUND';
        // this.ground.rotation.x = -Math.PI/2;
        // this.ground.position.y = 0;
        // this.ground.receiveShadow = true;
        // this.state.scene.add( this.ground );

        // Icosahedron
        // this.geometry = new THREE.IcosahedronBufferGeometry( 1, 0 );
        // this.material = new THREE.MeshPhongMaterial( { color: 0xffffff, emissive: 0x333333, flatShading: true } );
        // this.tetraGeo = new THREE.Mesh( this.geometry, this.material );
        // this.tetraGeo.name = 'Icosahedron';
        // this.tetraGeo.castShadow = true;
        // this.state.scene.add( this.tetraGeo )


        ///HEXAGON
        this.cellGroup = new THREE.Object3D();
        this.cellGroup.name = 'Map'
        this.state.scene.add( this.cellGroup );


        this.state.renderer.setPixelRatio( window.devicePixelRatio );
        this.state.renderer.gammaInput = true;
        this.state.renderer.gammaOutput = true;
        this.state.renderer.shadowMap.enabled = true;



        //let ContainerSize = this.getContainerSize(this.container);

        this.updateScreenSize();

        this.container.appendChild(this.state.renderer.domElement);

        window.addEventListener("resize", this.updateScreenSize.bind(this));
        //window.addEventListener("onresize", this.updateScreenSize.bind(this));
        //window.addEventListener( 'mousemove', this.onMouseMove.bind(this), false);
        //this.updateScreenSize();



        this.keysPressed = {};
        //var keyDisplayQueue = new KeyDisplay();
        window.addEventListener('keydown', this.onMove.bind(this), false );
        window.addEventListener('keyup', this.onStay.bind(this), false);


        this.modelLoader;
        this.userModelAdd = 0;
        this.userCharacterControls;
        //window.addEventListener("mousedown", this.onModelLoader.bind(this), false);
        window.addEventListener('keydown', this.onModelLoader.bind(this), false);
          


        // if(this.loadCharacter[ 0 ]){
        //     if(!this.add){
        //         this.state.scene.add(this.loadCharacter[ 0 ])
        //         this.add = 1;
        //     }
        //     if(!this.characterControls){
        //         this.characterControls = new CharacterControls( this.loadCharacter[ 0 ], this.loadCharacter[ 1 ], this.loadCharacter[ 2 ], this.controls, this.camera,  'Idle');
        //     }
        // }


        this.raycaster = new THREE.Raycaster();


        this.start()

    }


      
    updateSphere() {
        // Здесь вы можете обновить свою сферу с использованием this.state.HEALPiX или других значений
        this.HealpixSphere = new HEALPiX(this.state.HEALPiX.radius, this.state.HEALPiX.detail);
        console.log('HealpixSphere updated!');
        //console.log(this.HealpixSphere.mesh);

        this.state.scene.remove(this.healpixSphereMesh);
        //this.healpixSphereMesh = this.HealpixSphere.geometry;

        this.HealpixSphereGeo = this.HealpixSphere.geometry;
        this.HealpixSphereGeo.attributes.position.normalized  = true;
        this.HealpixSphereGeo.attributes.uv.normalized  = true;
        this.HealpixSphereGeo.attributes.normal.normalized  = true;
        //this.HealpixSphereGeo.computeVertexNormals();
        //this.HealpixSphereGeo.computeTangents();

        //this.HealpixSphereGeo = this.HealpixSphereGeo.toNonIndexed();
        //const oldGeometry = new THREE.Geometry().fromBufferGeometry(this.HealpixSphere.geometry);
        //console.log(this.HealpixSphere.getUniqueVertices())

        
        


        // this.PhysicalMaterials = [];

        // for (let i = 0; i < 12; i++) {
        //     //console.log('textures/desert/desert-'+parseInt([i])+'.jpg')
        //     this.PhysicalMaterials.push(new THREE.MeshPhysicalMaterial({
        //         color: 0x8F714A,
        //         map: new THREE.TextureLoader().load('textures/desert/desert-'+String(i).padStart(2, '0')+'.jpg'),
        //         displacementMap: new THREE.TextureLoader().load('textures/desert/pbr/desert-'+String(i).padStart(2, '0')+'.jpg_displacement.png'),
        //         displacementScale: 0,
        //         displacementBias: 0,
        //         roughness: 0.75,
        //         metalness: 0.75,
        //         reflectivity: 0.5,
        //         //normalMap: new THREE.TextureLoader().load('textures/desert/pbr/desert-'+String(i).padStart(2, '0')+'.jpg_normal.png'),
        //         //normalScale: new THREE.Vector2(-1, 1),
        //         side: THREE.DoubleSide
        //      }));
        // }
        // this.healpixSphereMesh = new THREE.Mesh(this.HealpixSphereGeo, this.PhysicalMaterials);

        this.Ironmaterials = [];
        for (let i = 0; i < 12; i++) {
            //console.log('textures/desert/desert-'+parseInt([i])+'.jpg')
            this.Ironmaterials.push(new THREE.MeshStandardMaterial({ 
                map: new THREE.TextureLoader().load('textures/iron/iron-'+String(i).padStart(2, '0')+'.jpg'),
                side: THREE.DoubleSide }));
        }
        this.healpixSphereMesh = new THREE.Mesh(this.HealpixSphereGeo, this.Ironmaterials);
        // this.Desertmaterials = [];
        // for (let i = 0; i < 12; i++) {
        //     //console.log('textures/desert/desert-'+parseInt([i])+'.jpg')
        //     this.Desertmaterials.push(new THREE.MeshStandardMaterial( { 
        //         map: new THREE.TextureLoader().load('textures/desert/desert-'+String(i).padStart(2, '0')+'.jpg'),
        //         //metalness: 0.75,
        //         //aoMap: new THREE.TextureLoader().load('textures/desert/pbr/desert-'+String(i).padStart(2, '0')+'.jpg_ambient.png'),
        //         side: THREE.DoubleSide }));
        // }
        // this.healpixSphereMesh = new THREE.Mesh(this.HealpixSphereGeo, this.Desertmaterials);

        // this.CMBmaterials = [];
        // for (let i = 0; i < 12; i++) {
        //     console.log('textures/CMB/cmb-inp-09-'+parseInt([i])+'.jpg')
        //     this.CMBmaterials.push(new THREE.MeshBasicMaterial({ 
        //         map: new THREE.TextureLoader().load('textures/CMB/cmb-inp-10-'+String(i).padStart(2, '0')+'.jpg'),
        //         side: THREE.DoubleSide }));
        // }
        // this.healpixSphereMesh = new THREE.Mesh(this.HealpixSphereGeo, this.CMBmaterials);
        // this.uvMaterial = new THREE.MeshStandardMaterial({
        //     map: new THREE.TextureLoader().load('textures/uv_grid_opengl.jpg'), // Загрузите текстуру с UV-сеткой
        //     metalness: 0.75,
        //     side: THREE.DoubleSide
        // });
        // this.healpixSphereMesh = new THREE.Mesh(this.HealpixSphereGeo, this.uvMaterial);
        //Random Colors
        //this.healpixSphereMesh = new THREE.Mesh(this.HealpixSphereGeo, this.HealpixSphere.materials);
        this.healpixSphereMesh.rotation.y = -Math.PI/1;
        this.healpixSphereMesh.rotation.x = Math.PI/1;
        this.healpixSphereMesh.rotation.z = Math.PI/1;
        this.healpixSphereMesh.updateMatrix();
        this.healpixSphereMesh.geometry.computeVertexNormals();
        this.state.scene.add(this.healpixSphereMesh); // Добавление объекта в сцену
        // const vertices = this.HealpixSphereGeo.attributes.position.array;
        // const normals = this.HealpixSphereGeo.attributes.normal.array;

        // // Отображаем нормали
        // for (let i = 0; i < vertices.length; i += 3) {
        // const normal = new THREE.Vector3(normals[i], normals[i + 1], normals[i + 2]);
        // const vertex = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        // const arrow = new THREE.ArrowHelper(normal, vertex, 0.2, 0xff0000);
        // this.HealpixSphereGeo.add(arrow);
        // }



        // const vnh = new VertexNormalsHelper( this.healpixSphereMesh, 5 );
        // this.state.scene.add( vnh );


        // const mesh = new THREE.Mesh(this.HealpixSphereGeo, material);
        // this.state.scene.add(mesh);

        // const normalsHelper = new THREE.VertexNormalsHelper(this.healpixSphereMesh, 0.5); // 0.5 - длина нормалей
        // this.state.scene.add(normalsHelper);

        // this.uvMaterial = new THREE.MeshBasicMaterial({
        //     map: new THREE.TextureLoader().load('textures/uv_grid_opengl.jpg'), // Загрузите текстуру с UV-сеткой
        //     side: THREE.DoubleSide
        //   });
        // this.HealpixSphereGeo.attributes.uv.normalized  = true;
        // this.UVmesh = new THREE.Mesh(this.HealpixSphereGeo, this.uvMaterial);
        // this.UVmesh.updateMatrix();
        // this.state.scene.remove(this.UVmesh);
        // this.state.scene.add(this.UVmesh);
          




        // Остальная логика обновления сферы
        this.camera.updateProjectionMatrix();

        // Убедитесь, что ваш рендерер перерисовывает сцену
        this.state.renderer.render(this.state.scene, this.camera);
    }
      

    componentDidUpdate(prevProps) {
        if (prevProps.healpixProps.detail !== this.props.healpixProps.detail) {
          this.setState({ HEALPiX: this.props.healpixProps }, () => {
            this.updateSphere(); // Вызывайте метод обновления сферы после установки состояния
          });
        }
        if (prevProps.orbitRotation !== this.props.orbitRotation) {
            this.setState({ orbitRotation: this.props.orbitRotation }, () => {
                this.renderScene(); // Вызывайте метод обновления сцены
            });
        }
    }

      
    onModelLoader ( event ) {
        if (event.code === 'Space') { // Проверяем, была ли нажата клавиша пробела
                // Здесь ваш код для обработки нажатия пробела
                console.log('Пробел был нажат!');
            

            if(!this.modelLoaderState){
                console.log('start loading user model')
                this.modelLoader = new ModelLoader(this.socket.id, 'This model path', this.userModel);
                //this.modelLoader = new ModelLoader("6smw7CQHifnUYE4BAAAC", 'This model path', this.userModel);
                this.modelLoader.onLoading();
                //console.log(loadContent)
                this.modelLoaderState = 1;
            } else {

                //console.log(this.modelLoader.userModel)
                if(!this.userModelAdd){
                    this.state.scene.add(this.modelLoader.userModel[ 0 ])
                    this.mixers.push(this.modelLoader.userModel[ 1 ])
                    this.userCharacterControls = new CharacterControls( this.modelLoader.userModel[ 0 ], this.modelLoader.userModel[ 1 ], this.modelLoader.userModel[ 2 ], this.controls, this.camera, 'Idle', this.socket);
                    this.userModelAdd = 1;
                }
            }
        }

    }

    onMove( event ) {

        if(!this.add){
            //this.state.scene.add(this.loadCharacter[ 0 ])
            this.add = 1;
        }
        //console.log(this.add);

        // if(!this.characterControls){

        //     //this.characterControls = new CharacterControls( this.loadCharacter[ 0 ], this.loadCharacter[ 1 ], this.loadCharacter[ 2 ], this.controls, this.camera,  'Idle');

        // } else {

        //     //keyDisplayQueue.down(event.key);
        //     if (event.shiftKey && this.characterControls) {
        //         //console.log('shift key');
        //         this.characterControls.switchRunToggle();
        //     }
        //     else {
        //         this.keysPressed[event.key.toLowerCase()] = true;
        //     }
        // }

        if(!this.userCharacterControls){

            //this.characterControls = new CharacterControls( this.loadCharacter[ 0 ], this.loadCharacter[ 1 ], this.loadCharacter[ 2 ], this.controls, this.camera,  'Idle');

        } else {


            //keyDisplayQueue.down(event.key);
            if (event.shiftKey && this.userCharacterControls) {
                //console.log('shift key');
                this.userCharacterControls.switchRunToggle();
            }
            else {
                this.keysPressed[event.key.toLowerCase()] = true;
            }

            let pos =  this.controls.target
            this.userPos(pos.x, pos.z)

        }

    }

    onStay( event ) {
        //console.log(event.key);
        this.keysPressed[event.key.toLowerCase()] = false;

    }

    componentWillUnmount() {
        window.addEventListener("mousedown", this.onModelLoader.bind(this), false);
        window.addEventListener('keydown', this.onMove.bind(this), false );
        window.addEventListener('keyup', this.onStay.bind(this), false);
        window.removeEventListener("resize", this.updateScreenSize.bind(this));
       //window.addEventListener("onresize", this.updateScreenSize.bind(this));
        this.stop()
        this.container.removeChild(this.state.renderer.domElement)
    }

    onMouseMove( event ) {
        event.preventDefault();
        let off = this.findRelativeCanvasOffset()

        var mouse = new THREE.Vector2();

        mouse.x = ( (event.clientX-off.x )/ this.container.clientWidth ) * 2 - 1;
        mouse.y = - ( (event.clientY-off.y) /  this.container.clientHeight ) * 2 + 1;

        this.setState({mouse:mouse})
        //this.mouse =  mouse

        //console.log(this.state.mouse)
         //console.log(this.mouse)
    }

    findRelativeCanvasOffset = () => {
        var x = 0;
        var y = 0;
        var layoutEl = document.getElementById('screen');
        if (layoutEl.offsetParent) {
            do {
                x += layoutEl.offsetLeft;
                y += layoutEl.offsetTop;
            } while (layoutEl = layoutEl.offsetParent);
            return {x:x,y:y}
        }
    }

    
    updateScreenSize() {
        let up_w = window.innerWidth;
        let up_h = window.innerHeight-100;
        this.camera.aspect = up_w / up_h;
        this.camera.updateProjectionMatrix();
        this.state.renderer.setSize( up_w, up_h );
    }

    getContainerSize = (container) => {
        return ({
            clientWidth: container.clientWidth,
            clientHeight: container.clientHeight
        })
    }

    setCameaAspect = (asp) => {
        this.setState({
            ...this.camera,
            aspect: asp,
        })
        console.log(asp)
    }

    setScreenSize = (ss) => {
        this.setState({
            clientWidth: ss.width,
            clientHeight: ss.height
        })
    }

    start = () => {
        if (!this.frameId) {
          this.frameId = requestAnimationFrame(this.animate)
        }
        //this.HEALPiX(12,12)
    }

    stop = () => {
        cancelAnimationFrame(this.frameId)
    }

    animate = () => {
        this.delta = this.clock.getDelta();
        this.timer = Date.now() * 0.01;

        for ( const mixer of this.mixers ) mixer.update( this.delta );

        let userMixerUpdateDelta = this.delta;
        if (this.userCharacterControls) {

            this.userCharacterControls.update(userMixerUpdateDelta, this.keysPressed);

            this.controls.update()

         }
        if (this.state.orbitRotation) {
            this.healpixSphereMesh.rotation.y += 0.001;
        }
        

        this.frameId = window.requestAnimationFrame(this.animate)
        this.renderScene(this.delta)

    }

    renderScene = () => {

        this.state.renderer.render(this.state.scene, this.camera)
    }




  render() {

    return (
            <div onClick={this.props.onClick}
                className="App-intro"
                ref={thisNode => this.container=thisNode}
            />
    )
  }

}


export default Tetra;